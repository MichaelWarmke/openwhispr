const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const debugLogger = require("./debugLogger");
const { resolveBinaryPath } = require("../utils/serverUtils");
const {
  isWavFormat,
  parseWavFormat,
  getFFmpegPath,
  convertToWav,
} = require("./ffmpegUtils");
const { getSafeTempDir } = require("./safeTempDir");

const SAMPLE_RATE = 16000;

class MlxServerManager {
  constructor() {
    this.status = {
      running: false,
      starting: false,
      model: null,
    };
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
    return { ...this.status };
  }

  async startServer(modelName, modelDir) {
    debugLogger.info("Native MLX server start is a no-op", { modelName });
    return { success: true };
  }

  async stopServer() {
    debugLogger.info("Native MLX server stop is a no-op");
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

  async transcribe(audioBuffer, modelPath, options = {}) {
    if (!this.isAvailable()) {
      throw new Error("Native MLX executable is not available on this platform.");
    }

    const { tempWavPath, filesToCleanup } = await this._ensureWav(audioBuffer);
    const bin = this.binPath;

    const args = [
      "--model", modelPath,
      "--audio", tempWavPath,
    ];

    debugLogger.info("Executing native MLX transcribe", { modelPath, tempWavPath });

    try {
      const stdout = await new Promise((resolve, reject) => {
        execFile(bin, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
          if (error) {
            debugLogger.error("Native MLX process error", { error: error.message, stderr });
            return reject(new Error(`MLX CLI failed: ${error.message}`));
          }
          resolve(stdout);
        });
      });

      const response = JSON.parse(stdout.trim());
      if (!response.success) {
        throw new Error(response.error || "Unknown MLX error");
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
      // Clean up temporary files
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
