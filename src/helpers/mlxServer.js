const { spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const path = require("path");
const debugLogger = require("./debugLogger");
const { resolveBinaryPath, gracefulStopProcess } = require("../utils/serverUtils");
const {
  isWavFormat,
  parseWavFormat,
  getFFmpegPath,
  convertToWav,
} = require("./ffmpegUtils");
const { getSafeTempDir } = require("./safeTempDir");
const sidecarPidFile = require("./sidecarPidFile");

const SAMPLE_RATE = 16000;
const STARTUP_TIMEOUT_MS = 60000;

class MlxServerManager {
  constructor() {
    this.process = null;
    this.socketPath = null;
    this.ready = false;
    this.currentModelName = null;
    this.currentModelPath = null;
    this.startupPromise = null;
    this.startingModelName = null;
  }

  get binPath() {
    return resolveBinaryPath("mlx-transcribe");
  }

  isAvailable() {
    const isAppleSilicon = process.platform === "darwin" && process.arch === "arm64";
    if (!isAppleSilicon) return false;

    const bin = this.binPath;
    return bin !== null && fs.existsSync(bin);
  }

  isModelDownloaded(modelName, modelDir) {
    const modelRegistryData = require("../models/modelRegistryData.json");
    const modelConfig = modelRegistryData.mlxModels?.[modelName];
    if (!modelConfig) return false;

    if (!fs.existsSync(modelDir)) return false;

    return (modelConfig.requiredFiles || []).every((file) =>
      fs.existsSync(path.join(modelDir, file))
    );
  }

  getServerStatus() {
    return {
      running: this.ready && this.process !== null,
      starting: this.startupPromise !== null,
      model: this.currentModelName || this.startingModelName || null,
      socketPath: this.socketPath,
    };
  }

  async startServer(modelName, modelDir) {
    while (this.startupPromise) {
      if (this.startingModelName === modelName) return this.startupPromise;
      await this.startupPromise.catch(() => {});
    }

    if (this.ready && this.currentModelPath === modelDir) {
      return { success: true, running: true };
    }

    this.startingModelName = modelName;
    this.startupPromise = (async () => {
      try {
        if (this.process) {
          await this.stopServer();
        }
        await this._doStartServer(modelName, modelDir);
        return { success: true };
      } finally {
        this.startupPromise = null;
        this.startingModelName = null;
      }
    })();

    return this.startupPromise;
  }

  async _doStartServer(modelName, modelDir) {
    if (!this.isAvailable()) {
      throw new Error("Native MLX executable is not available on this platform.");
    }
    if (!fs.existsSync(modelDir)) {
      throw new Error(`MLX model directory not found: ${modelDir}`);
    }

    const bin = this.binPath;
    const tempDir = getSafeTempDir();
    this.socketPath = path.join(tempDir, `mlx-server-${Date.now()}-${Math.floor(Math.random() * 1000)}.sock`);

    // Clean up stale socket if it exists
    if (fs.existsSync(this.socketPath)) {
      try {
        fs.unlinkSync(this.socketPath);
      } catch (e) {}
    }

    const args = [
      "--model", modelDir,
      "--serve", this.socketPath,
      "--idle-timeout", "300",
    ];

    debugLogger.info("Starting native MLX server daemon", { modelName, modelDir, socketPath: this.socketPath });

    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: tempDir,
      detached: process.platform !== "win32",
    });

    this.process = child;
    sidecarPidFile.write("mlx-transcribe", child.pid);

    let stderrBuffer = "";
    let readyResolve = null;
    const readyFromStderr = new Promise((resolve) => {
      readyResolve = resolve;
    });

    child.stdout.on("data", (data) => {
      debugLogger.debug("mlx-transcribe stdout", { data: data.toString().trim() });
    });

    child.stderr.on("data", (data) => {
      const str = data.toString();
      stderrBuffer += str;
      debugLogger.debug("mlx-transcribe stderr", { data: str.trim() });
      if (str.includes("Listening on:")) {
        readyResolve(true);
      }
    });

    child.on("error", (error) => {
      debugLogger.error("mlx-transcribe process error", { error: error.message });
      if (this.process === child) {
        this.ready = false;
      }
      readyResolve(false);
    });

    child.on("close", (code) => {
      debugLogger.info("mlx-transcribe process exited", { code });
      if (this.process === child) {
        this.ready = false;
        this.process = null;
        this.currentModelName = null;
        this.currentModelPath = null;
        sidecarPidFile.clear("mlx-transcribe");
        if (this.socketPath && fs.existsSync(this.socketPath)) {
          try {
            fs.unlinkSync(this.socketPath);
          } catch (e) {}
        }
      }
      readyResolve(false);
    });

    await this._waitForReady(readyFromStderr, stderrBuffer);
    this.ready = true;
    this.currentModelName = modelName;
    this.currentModelPath = modelDir;
    debugLogger.info("Native MLX server daemon started successfully", { modelName, socketPath: this.socketPath });
  }

  async _waitForReady(readySignal, stderrBuffer) {
    const startTime = Date.now();
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`mlx-transcribe server failed to start within ${STARTUP_TIMEOUT_MS}ms`)),
        STARTUP_TIMEOUT_MS
      );
    });

    try {
      const ready = await Promise.race([readySignal, timeoutPromise]);
      if (!ready) {
        throw new Error(`mlx-transcribe process exited prematurely: ${stderrBuffer.slice(-300)}`);
      }
      debugLogger.debug("mlx-transcribe server ready", { elapsedMs: Date.now() - startTime });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async stopServer() {
    if (!this.process && !this.ready) {
      return { success: true };
    }

    debugLogger.info("Stopping native MLX server daemon");
    
    // Attempt graceful socket shutdown command first
    if (this.socketPath && fs.existsSync(this.socketPath)) {
      try {
        await this._sendSocketRequest({ command: "shutdown" }, 2000);
      } catch (e) {
        debugLogger.debug("Socket shutdown command did not get response, falling back to process kill", { error: e.message });
      }
    }

    if (this.process) {
      try {
        await gracefulStopProcess(this.process);
      } catch (e) {
        debugLogger.warn("Failed to stop mlx-transcribe process gracefully", { error: e.message });
      }
    }

    if (this.socketPath && fs.existsSync(this.socketPath)) {
      try {
        fs.unlinkSync(this.socketPath);
      } catch (e) {}
    }

    this.process = null;
    this.ready = false;
    this.socketPath = null;
    this.currentModelName = null;
    this.currentModelPath = null;
    sidecarPidFile.clear("mlx-transcribe");
    return { success: true };
  }

  async _ensureWav(audioBuffer) {
    if (!audioBuffer) {
      throw new Error("No audio buffer provided");
    }

    let buffer = audioBuffer;
    if (!Buffer.isBuffer(buffer)) {
      if (buffer instanceof ArrayBuffer) {
        buffer = Buffer.from(buffer);
      } else if (ArrayBuffer.isView(buffer)) {
        buffer = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      } else {
        buffer = Buffer.from(buffer);
      }
    }

    if (isWavFormat(buffer)) {
      const format = parseWavFormat(buffer);
      if (format?.sampleRate === SAMPLE_RATE && format?.channels === 1) {
        const tempDir = getSafeTempDir();
        const tempWavPath = path.join(tempDir, `mlx-input-${Date.now()}.wav`);
        fs.writeFileSync(tempWavPath, buffer);
        return { tempWavPath, filesToCleanup: [tempWavPath] };
      }
      debugLogger.debug("WAV input needs resampling", { format });
    }

    const ffmpegPath = getFFmpegPath();
    if (!ffmpegPath) {
      throw new Error(
        "FFmpeg not found - required for audio conversion. Please ensure FFmpeg is installed."
      );
    }

    const tempDir = getSafeTempDir();
    const tempInputPath = path.join(tempDir, `mlx-input-${Date.now()}`);
    const tempWavPath = path.join(tempDir, `mlx-input-${Date.now()}.wav`);

    fs.writeFileSync(tempInputPath, buffer);

    await convertToWav(tempInputPath, tempWavPath, {
      sampleRate: SAMPLE_RATE,
      channels: 1,
    });

    return { tempWavPath, filesToCleanup: [tempInputPath, tempWavPath] };
  }

  _sendSocketRequest(requestObject, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      if (!this.socketPath || !fs.existsSync(this.socketPath)) {
        return reject(new Error("MLX server socket unavailable"));
      }

      const client = net.connect({ path: this.socketPath });
      let responseData = "";
      let timer = null;

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          client.destroy();
          reject(new Error(`MLX socket request timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }

      client.on("connect", () => {
        client.write(JSON.stringify(requestObject) + "\n");
      });

      client.on("data", (data) => {
        responseData += data.toString("utf8");
        if (responseData.includes("\n")) {
          if (timer) clearTimeout(timer);
          client.end();
          try {
            const parsed = JSON.parse(responseData.trim());
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Failed to parse MLX server JSON response: ${e.message}`));
          }
        }
      });

      client.on("error", (err) => {
        if (timer) clearTimeout(timer);
        reject(err);
      });

      client.on("close", () => {
        if (timer) clearTimeout(timer);
        if (responseData && !responseData.includes("\n")) {
          try {
            const parsed = JSON.parse(responseData.trim());
            resolve(parsed);
          } catch (e) {
            reject(new Error("Connection closed before complete line received"));
          }
        }
      });
    });
  }

  async transcribe(audioBuffer, modelPath, options = {}) {
    if (!this.isAvailable()) {
      throw new Error("Native MLX executable is not available on this platform.");
    }

    const modelName = options.modelName || path.basename(modelPath);

    // Auto-start or restart if model path changed or server stopped
    if (!this.ready || !this.process || this.currentModelPath !== modelPath) {
      await this.startServer(modelName, modelPath);
    }

    const { tempWavPath, filesToCleanup } = await this._ensureWav(audioBuffer);

    try {
      let response;
      try {
        response = await this._sendSocketRequest({ audio: tempWavPath });
      } catch (err) {
        // If server died or idle timed out, retry auto-starting once
        debugLogger.warn("MLX socket request failed, attempting auto-restart", { error: err.message });
        await this.startServer(modelName, modelPath);
        response = await this._sendSocketRequest({ audio: tempWavPath });
      }

      if (!response || !response.success) {
        throw new Error(response?.error || "Unknown MLX server error");
      }

      return {
        success: true,
        text: response.text || "",
        segments: response.segments || [],
      };
    } catch (error) {
      debugLogger.error("MLX transcription failed", { error: error.message });
      throw error;
    } finally {
      if (filesToCleanup && filesToCleanup.length > 0) {
        for (const f of filesToCleanup) {
          try {
            fs.unlinkSync(f);
          } catch (e) {
            debugLogger.warn("Failed to delete temp file", { path: f, error: e.message });
          }
        }
      }
    }
  }
}

module.exports = MlxServerManager;
