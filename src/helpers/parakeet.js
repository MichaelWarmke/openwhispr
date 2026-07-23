const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const { pipeline } = require("stream/promises");
const debugLogger = require("./debugLogger");
const { runSystemTar } = require("./systemTar");
const {
  downloadFile,
  createDownloadSignal,
  createDownloadInProgressError,
  cleanupStaleDownloads,
  checkDiskSpace,
  downloadHuggingFaceModel,
} = require("./downloadUtils");
const ParakeetServerManager = require("./parakeetServer");
const { getModelsDirForService } = require("./modelDirUtils");

const modelRegistryData = require("../models/modelRegistryData.json");
const { getModelRuntime, REQUIRED_MODEL_FILES } = require("./parakeetModelInfo");

function getParakeetModelConfig(modelName) {
  const modelInfo = modelRegistryData.parakeetModels[modelName];
  if (!modelInfo) return null;
  return {
    url: modelInfo.downloadUrl,
    huggingFaceRepo: modelInfo.huggingFaceRepo,
    size: modelInfo.expectedSizeBytes || modelInfo.sizeMb * 1_000_000,
    language: modelInfo.language,
    supportedLanguages: modelInfo.supportedLanguages || [],
    extractDir: modelInfo.extractDir,
  };
}

function getValidModelNames() {
  return Object.keys(modelRegistryData.parakeetModels);
}

class ParakeetManager {
  constructor() {
    this.currentDownloadProcess = null;
    this.isInitialized = false;
    this.serverManager = new ParakeetServerManager();
  }

  getModelsDir() {
    const { getCacheRoot } = require("./modelDirUtils");
    return path.join(getCacheRoot(), "parakeet-models");
  }

  validateModelName(modelName) {
    const validModels = getValidModelNames();
    if (!validModels.includes(modelName)) {
      throw new Error(
        `Invalid Parakeet model: ${modelName}. Valid models: ${validModels.join(", ")}`
      );
    }
    return true;
  }

  getModelPath(modelName) {
    this.validateModelName(modelName);
    const config = getParakeetModelConfig(modelName);
    const { getCacheRoot } = require("./modelDirUtils");
    if (config.huggingFaceRepo) {
      return path.join(getCacheRoot(), "huggingface", modelName);
    }
    return path.join(getCacheRoot(), "sherpa_onnx", modelName);
  }

  async initializeAtStartup(settings = {}) {
    const startTime = Date.now();

    try {
      this.isInitialized = true;

      // Migration: move models from old parakeet-models to new directories
      const { getCacheRoot } = require("./modelDirUtils");
      const oldModelsDir = path.join(getCacheRoot(), "parakeet-models");
      const hfDir = path.join(getCacheRoot(), "huggingface");
      const sherpaDir = path.join(getCacheRoot(), "sherpa_onnx");
      const hfModelsDir = path.join(getCacheRoot(), "huggingface-models");
      const sherpaModelsDir = path.join(getCacheRoot(), "sherpa-onnx-models");

      try {
        if (fs.existsSync(oldModelsDir)) {
          const validModels = getValidModelNames();
          for (const model of validModels) {
            const oldPath = path.join(oldModelsDir, model);
            if (fs.existsSync(oldPath)) {
              const newPath = this.getModelPath(model);
              await fsPromises.mkdir(path.dirname(newPath), { recursive: true });
              await fsPromises.rename(oldPath, newPath);
            }
          }
        }
      } catch (e) {
        debugLogger.error("Failed to migrate parakeet models", { error: e.message });
      }

      // Also migrate from the briefly used intermediate directories
      try {
        for (const dir of [hfModelsDir, sherpaModelsDir]) {
          if (fs.existsSync(dir)) {
            const validModels = getValidModelNames();
            for (const model of validModels) {
              const oldPath = path.join(dir, model);
              if (fs.existsSync(oldPath)) {
                const newPath = this.getModelPath(model);
                await fsPromises.mkdir(path.dirname(newPath), { recursive: true });
                await fsPromises.rename(oldPath, newPath);
              }
            }
          }
        }
      } catch (e) {}

      await cleanupStaleDownloads(oldModelsDir);
      await cleanupStaleDownloads(hfDir);
      await cleanupStaleDownloads(sherpaDir);
      await cleanupStaleDownloads(hfModelsDir);
      await cleanupStaleDownloads(sherpaModelsDir);

      await this.logDependencyStatus();

      const { localTranscriptionProvider, parakeetModel } = settings;

      if (
        localTranscriptionProvider === "nvidia" &&
        parakeetModel &&
        this.serverManager.isAvailable(getModelRuntime(parakeetModel))
      ) {
        if (this.serverManager.isModelDownloaded(this.getModelPath(parakeetModel))) {
          debugLogger.info("Pre-warming parakeet server", { model: parakeetModel });

          try {
            const serverStartTime = Date.now();
            await this.serverManager.startServer(parakeetModel);
            debugLogger.info("Parakeet server pre-warmed successfully", {
              model: parakeetModel,
              startupTimeMs: Date.now() - serverStartTime,
            });
          } catch (err) {
            debugLogger.warn("Parakeet server pre-warm failed (will start on first use)", {
              error: err.message,
              model: parakeetModel,
            });
          }
        } else {
          debugLogger.debug("Skipping parakeet server pre-warm: model not downloaded", {
            model: parakeetModel,
          });
        }
      } else {
        debugLogger.debug("Skipping parakeet server pre-warm", {
          reason:
            localTranscriptionProvider !== "nvidia"
              ? "provider not nvidia"
              : !parakeetModel
                ? "no model selected"
                : "server binary not available",
        });
      }
    } catch (error) {
      debugLogger.warn("Parakeet initialization error", { error: error.message });
      this.isInitialized = true;
    }

    debugLogger.info("Parakeet initialization complete", {
      totalTimeMs: Date.now() - startTime,
      binaryAvailable: this.serverManager.hasAnyWsBinary(),
    });
  }

  async logDependencyStatus() {
    const status = {
      sherpaOnnx: {
        available: this.serverManager.hasAnyWsBinary(),
        path:
          this.serverManager.getBinaryPath("offline") || this.serverManager.getBinaryPath("online"),
      },
      models: [],
    };

    for (const modelName of getValidModelNames()) {
      const modelPath = this.getModelPath(modelName);
      if (this.serverManager.isModelDownloaded(modelPath)) {
        try {
          const encoderPath = path.join(modelPath, "encoder.int8.onnx");
          const stats = fs.statSync(encoderPath);
          status.models.push({
            name: modelName,
            size: `${Math.round(stats.size / (1024 * 1024))}MB`,
          });
        } catch {}
      }
    }

    debugLogger.info("Parakeet dependency check", status);

    const binaryStatus = status.sherpaOnnx.available
      ? `✓ ${status.sherpaOnnx.path}`
      : "✗ Not found";
    const modelsStatus =
      status.models.length > 0
        ? status.models.map((m) => `${m.name}`).join(", ")
        : "None downloaded";

    debugLogger.info(`[Parakeet] sherpa-onnx: ${binaryStatus}`);
    debugLogger.info(`[Parakeet] Models: ${modelsStatus}`);
  }

  async checkInstallation() {
    const binaryPath =
      this.serverManager.getBinaryPath("offline") || this.serverManager.getBinaryPath("online");
    if (!binaryPath) {
      return { installed: false, working: false };
    }

    return { installed: true, working: true, path: binaryPath };
  }

  async startServer(modelName) {
    this.validateModelName(modelName);
    return this.serverManager.startServer(modelName, this.getModelPath(modelName));
  }

  async stopServer() {
    await this.serverManager.stopServer();
  }

  getServerStatus() {
    return this.serverManager.getServerStatus();
  }

  supportsOnlineStreaming(modelName) {
    return getModelRuntime(modelName) === "online";
  }

  async createOnlineStream(modelName, options = {}) {
    this.validateModelName(modelName);
    const started = await this.serverManager.startServer(modelName);
    if (!started.success) {
      throw new Error(started.reason || "Failed to start parakeet streaming server");
    }
    return this.serverManager.createOnlineStream(options);
  }

  async transcribeLocalParakeet(audioBlob, options = {}) {
    const model = options.model || "parakeet-tdt-0.6b-v3";
    const serverAvailable = this.serverManager.isAvailable(getModelRuntime(model));

    debugLogger.logSTTPipeline("transcribeLocalParakeet - start", {
      options,
      audioBlobType: audioBlob?.constructor?.name,
      audioBlobSize: audioBlob?.byteLength || audioBlob?.size || 0,
      serverAvailable,
    });

    if (!serverAvailable) {
      throw new Error(
        "sherpa-onnx binary not found. Please ensure the app is installed correctly."
      );
    }

    if (!this.serverManager.isModelDownloaded(this.getModelPath(model))) {
      throw new Error(
        `Parakeet model "${model}" not downloaded. Please download it from Settings.`
      );
    }

    let audioBuffer;
    if (Buffer.isBuffer(audioBlob)) {
      audioBuffer = audioBlob;
    } else if (ArrayBuffer.isView(audioBlob)) {
      audioBuffer = Buffer.from(audioBlob.buffer, audioBlob.byteOffset, audioBlob.byteLength);
    } else if (audioBlob instanceof ArrayBuffer) {
      audioBuffer = Buffer.from(audioBlob);
    } else if (typeof audioBlob === "string") {
      audioBuffer = Buffer.from(audioBlob, "base64");
    } else if (audioBlob && audioBlob.buffer && typeof audioBlob.byteLength === "number") {
      audioBuffer = Buffer.from(audioBlob.buffer, audioBlob.byteOffset || 0, audioBlob.byteLength);
    } else {
      throw new Error(`Unsupported audio data type: ${typeof audioBlob}`);
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error("Audio buffer is empty - no audio data received");
    }

    debugLogger.logSTTPipeline("transcribeLocalParakeet - processing", {
      bufferSize: audioBuffer.length,
      model,
    });

    const startTime = Date.now();
    const result = await this.serverManager.transcribe(audioBuffer, { modelName: model, modelDir: this.getModelPath(model) });
    const elapsed = Date.now() - startTime;

    debugLogger.logSTTPipeline("transcribeLocalParakeet - completed", {
      elapsed,
      textLength: result.text?.length || 0,
    });

    return this.parseParakeetResult(result);
  }

  parseParakeetResult(output) {
    debugLogger.debug("parseParakeetResult", {
      hasOutput: !!output,
      hasText: !!output?.text,
      textLength: output?.text?.length || 0,
    });

    if (!output || !output.text) {
      return { success: false, message: "No audio detected" };
    }

    const text = output.text.trim();

    if (!text || text.length === 0) {
      return { success: false, message: "No audio detected" };
    }

    // Surfaced by the renderer as a partial-transcription warning toast.
    return output.truncated
      ? { success: true, text, warning: "truncated" }
      : { success: true, text };
  }

  async downloadParakeetModel(modelName, progressCallback = null) {
    this.validateModelName(modelName);
    const modelConfig = getParakeetModelConfig(modelName);

    const modelPath = this.getModelPath(modelName);
    const modelsDir = this.getModelsDir();

    if (this.serverManager.isModelDownloaded(modelPath)) {
      return { model: modelName, downloaded: true, path: modelPath, success: true };
    }

    if (this.currentDownloadProcess) {
      throw createDownloadInProgressError(modelName, this.currentDownloadProcess.model);
    }

    const archivePath = path.join(modelsDir, `${modelName}.tar.bz2`);
    const { signal, abort } = createDownloadSignal();
    const downloadProcess = {
      abort,
      model: modelName,
      phase: "progress",
      percentage: 0,
      downloadedBytes: 0,
      totalBytes: 0,
    };
    this.currentDownloadProcess = downloadProcess;

    if (modelConfig.huggingFaceRepo) {
      return this._downloadFromHuggingFace(
        modelName,
        modelConfig,
        progressCallback,
        downloadProcess,
        signal
      );
    }

    try {
      const targetDir = path.dirname(modelPath);
      await fsPromises.mkdir(targetDir, { recursive: true });

      const spaceCheck = await checkDiskSpace(targetDir, modelConfig.size * 2.5);
      if (!spaceCheck.ok) {
        throw new Error(
          `Not enough disk space to download and extract model. Need ~${Math.round((modelConfig.size * 2.5) / 1_000_000)}MB, ` +
            `only ${Math.round(spaceCheck.availableBytes / 1_000_000)}MB available.`
        );
      }

      let archiveReady = false;
      try {
        const stats = await fsPromises.stat(archivePath);
        // A visibly truncated leftover would just fail extraction forever.
        if (stats.size >= modelConfig.size * 0.9) {
          archiveReady = true;
          debugLogger.info("Reusing existing archive from previous attempt", {
            archivePath,
            size: stats.size,
          });
        } else if (stats.size > 0) {
          await fsPromises.unlink(archivePath).catch(() => {});
        }
      } catch {}

      if (!archiveReady) {
        await downloadFile(modelConfig.url, archivePath, {
          timeout: 600000,
          signal,
          onProgress: (downloadedBytes, totalBytes) => {
            downloadProcess.percentage =
              totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
            downloadProcess.downloadedBytes = downloadedBytes;
            downloadProcess.totalBytes = totalBytes;
            if (progressCallback) {
              progressCallback({
                type: "progress",
                model: modelName,
                downloaded_bytes: downloadedBytes,
                total_bytes: totalBytes,
                percentage: totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0,
              });
            }
          },
        });
      }

      downloadProcess.phase = "installing";
      downloadProcess.percentage = 100;
      if (progressCallback) {
        progressCallback({ type: "installing", model: modelName, percentage: 100 });
      }

      const MAX_EXTRACT_RETRIES = 2;
      for (let attempt = 1; attempt <= MAX_EXTRACT_RETRIES; attempt++) {
        try {
          await this._extractModel(archivePath, modelName);
          break;
        } catch (extractError) {
          debugLogger.warn("Model extraction failed", {
            attempt,
            maxAttempts: MAX_EXTRACT_RETRIES,
            error: extractError.message,
          });
          if (attempt >= MAX_EXTRACT_RETRIES) {
            // The archive is the prime suspect; drop it so the next attempt re-downloads.
            await fsPromises.unlink(archivePath).catch(() => {});
            const err = new Error(`Model installation failed: ${extractError.message}`);
            err.code = "EXTRACTION_FAILED";
            throw err;
          }
        }
      }
      await fsPromises.unlink(archivePath).catch(() => {});

      if (progressCallback) {
        progressCallback({ type: "complete", model: modelName, percentage: 100 });
      }

      // Pre-warm the downloaded model, but never hijack a server that is already
      // serving (or starting) another model — e.g. mid-dictation.
      const serverStatus = this.serverManager.getServerStatus();
      if (
        this.serverManager.isAvailable(getModelRuntime(modelName)) &&
        !serverStatus.running &&
        !serverStatus.starting
      ) {
        this.serverManager.startServer(modelName).catch((err) => {
          debugLogger.warn("Post-download server pre-warm failed (non-fatal)", {
            error: err.message,
            model: modelName,
          });
        });
      }

      return { model: modelName, downloaded: true, path: modelPath, success: true };
    } catch (error) {
      if (error.isAbort) {
        await fsPromises.unlink(archivePath).catch(() => {});
        throw Object.assign(new Error("Download interrupted by user"), {
          code: "DOWNLOAD_CANCELLED",
        });
      }
      throw error;
    } finally {
      if (this.currentDownloadProcess === downloadProcess) {
        this.currentDownloadProcess = null;
      }
    }
  }

  async _downloadFromHuggingFace(
    modelName,
    modelConfig,
    progressCallback,
    downloadProcess,
    signal
  ) {
    const modelPath = this.getModelPath(modelName);
    const modelsDir = this.getModelsDir();

    try {
      await fsPromises.mkdir(modelPath, { recursive: true });

      const spaceCheck = await checkDiskSpace(modelPath, modelConfig.size * 1.5);
      if (!spaceCheck.ok) {
        throw new Error(
          `Not enough disk space to download model. Need ~${Math.round((modelConfig.size * 1.5) / 1_000_000)}MB, ` +
            `only ${Math.round(spaceCheck.availableBytes / 1_000_000)}MB available.`
        );
      }

      const files = REQUIRED_MODEL_FILES;
      await downloadHuggingFaceModel({
        huggingFaceRepo: modelConfig.huggingFaceRepo,
        requiredFiles: files,
        modelPath,
        modelName,
        progressCallback,
        downloadProcess,
        signal
      });

      downloadProcess.phase = "installing";
      downloadProcess.percentage = 100;
      if (progressCallback) {
        progressCallback({ type: "complete", model: modelName, percentage: 100 });
      }

      const serverStatus = this.serverManager.getServerStatus();
      if (
        this.serverManager.isAvailable(getModelRuntime(modelName)) &&
        !serverStatus.running &&
        !serverStatus.starting
      ) {
        this.serverManager.startServer(modelName).catch((err) => {
          debugLogger.warn("Post-download server pre-warm failed (non-fatal)", {
            error: err.message,
            model: modelName,
          });
        });
      }

      return { model: modelName, downloaded: true, path: modelPath, success: true };
    } catch (error) {
      if (error.isAbort) {
        throw Object.assign(new Error("Download interrupted by user"), {
          code: "DOWNLOAD_CANCELLED",
        });
      }
      throw error;
    } finally {
      if (this.currentDownloadProcess === downloadProcess) {
        this.currentDownloadProcess = null;
      }
    }
  }

  async _extractModel(archivePath, modelName) {
    const modelsDir = this.getModelsDir();
    const modelConfig = getParakeetModelConfig(modelName);
    const extractDir = path.join(modelsDir, `temp-extract-${modelName}`);

    try {
      await fsPromises.mkdir(extractDir, { recursive: true });
      debugLogger.info("Extracting parakeet archive", { archivePath, extractDir });
      await this._runTarExtract(archivePath, extractDir);
      debugLogger.info("Tar extraction completed", { extractDir });

      const extractedDir = path.join(extractDir, modelConfig.extractDir);
      const targetDir = this.getModelPath(modelName);

      if (fs.existsSync(extractedDir)) {
        if (fs.existsSync(targetDir)) {
          await fsPromises.rm(targetDir, { recursive: true, force: true });
        }
        await fsPromises.rename(extractedDir, targetDir);
      } else {
        const entries = await fsPromises.readdir(extractDir);
        debugLogger.warn("Expected extract directory not found, searching alternatives", {
          expected: modelConfig.extractDir,
          found: entries,
        });
        let modelDir = null;

        for (const entry of entries) {
          const entryPath = path.join(extractDir, entry);
          const stat = await fsPromises.stat(entryPath);
          if (
            stat.isDirectory() &&
            REQUIRED_MODEL_FILES.every((file) => fs.existsSync(path.join(entryPath, file)))
          ) {
            modelDir = entry;
            break;
          }
        }

        if (modelDir) {
          if (fs.existsSync(targetDir)) {
            await fsPromises.rm(targetDir, { recursive: true, force: true });
          }
          await fsPromises.rename(path.join(extractDir, modelDir), targetDir);
        } else {
          throw new Error(
            `Could not find model directory in extracted archive. ` +
              `Expected "${modelConfig.extractDir}", found: [${entries.join(", ")}]`
          );
        }
      }

      const missing = REQUIRED_MODEL_FILES.filter((f) => !fs.existsSync(path.join(targetDir, f)));
      if (missing.length > 0) {
        throw new Error(`Extracted model is missing required files: ${missing.join(", ")}`);
      }

      await fsPromises.rm(extractDir, { recursive: true, force: true });

      debugLogger.info("Parakeet model extracted", { modelName, targetDir });
    } catch (error) {
      try {
        await fsPromises.rm(extractDir, { recursive: true, force: true });
      } catch {}
      throw error;
    }
  }

  async _runTarExtract(archivePath, extractDir) {
    try {
      await this._runSystemTar(archivePath, extractDir);
      return;
    } catch (err) {
      debugLogger.debug("System tar failed, falling back to JS extraction", {
        error: err.message,
      });
    }

    const unbzip2 = require("unbzip2-stream");
    const tar = require("tar");
    await pipeline(fs.createReadStream(archivePath), unbzip2(), tar.x({ cwd: extractDir }));
  }

  _runSystemTar(archivePath, extractDir) {
    return runSystemTar(archivePath, extractDir);
  }

  async cancelDownload() {
    if (this.currentDownloadProcess) {
      if (this.currentDownloadProcess.phase === "installing") {
        return {
          success: false,
          error: "Model installation cannot be cancelled once extraction has started",
          code: "INSTALLATION_IN_PROGRESS",
        };
      }
      this.currentDownloadProcess.abort();
      return { success: true, message: "Download cancelled" };
    }
    return { success: false, error: "No active download to cancel" };
  }

  async checkModelStatus(modelName) {
    const modelPath = this.getModelPath(modelName);
    const activeDownload = this.currentDownloadProcess?.model === modelName;
    const downloadStatus = {
      isDownloading: activeDownload,
      isInstalling: activeDownload && this.currentDownloadProcess.phase === "installing",
      downloadProgress: activeDownload ? this.currentDownloadProcess.percentage : 0,
      downloadedBytes: activeDownload ? this.currentDownloadProcess.downloadedBytes : 0,
      totalBytes: activeDownload ? this.currentDownloadProcess.totalBytes : 0,
    };

    if (this.serverManager.isModelDownloaded(modelPath)) {
      try {
        const encoderPath = path.join(modelPath, "encoder.int8.onnx");
        const stats = fs.statSync(encoderPath);
        return {
          model: modelName,
          downloaded: true,
          path: modelPath,
          size_bytes: stats.size,
          size_mb: Math.round(stats.size / (1024 * 1024)),
          success: true,
          ...downloadStatus,
        };
      } catch {
        return { model: modelName, downloaded: false, success: true, ...downloadStatus };
      }
    }

    return { model: modelName, downloaded: false, success: true, ...downloadStatus };
  }

  async listParakeetModels() {
    const models = getValidModelNames();
    const modelInfo = [];

    for (const model of models) {
      const status = await this.checkModelStatus(model);
      modelInfo.push(status);
    }

    return {
      models: modelInfo,
      cache_dir: this.getModelsDir(),
      success: true,
    };
  }

  async deleteParakeetModel(modelName) {
    const modelPath = this.getModelPath(modelName);

    if (fs.existsSync(modelPath)) {
      try {
        const encoderPath = path.join(modelPath, "encoder.int8.onnx");
        let freedBytes = 0;

        if (fs.existsSync(encoderPath)) {
          const stats = fs.statSync(encoderPath);
          freedBytes = stats.size;
        }

        fs.rmSync(modelPath, { recursive: true, force: true });

        return {
          model: modelName,
          deleted: true,
          freed_bytes: freedBytes,
          freed_mb: Math.round(freedBytes / (1024 * 1024)),
          success: true,
        };
      } catch (error) {
        return { model: modelName, deleted: false, error: error.message, success: false };
      }
    }

    return { model: modelName, deleted: false, error: "Model not found", success: false };
  }

  async deleteAllParakeetModels() {
    const modelsDir = this.getModelsDir();
    let totalFreed = 0;
    let deletedCount = 0;

    try {
      if (!fs.existsSync(modelsDir)) {
        return { success: true, deleted_count: 0, freed_bytes: 0, freed_mb: 0 };
      }

      const entries = fs.readdirSync(modelsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dirPath = path.join(modelsDir, entry.name);
          try {
            const encoderPath = path.join(dirPath, "encoder.int8.onnx");
            if (fs.existsSync(encoderPath)) {
              const stats = fs.statSync(encoderPath);
              totalFreed += stats.size;
            }

            fs.rmSync(dirPath, { recursive: true, force: true });
            deletedCount++;
          } catch {}
        }
      }

      return {
        success: true,
        deleted_count: deletedCount,
        freed_bytes: totalFreed,
        freed_mb: Math.round(totalFreed / (1024 * 1024)),
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getDiagnostics() {
    const diagnostics = {
      platform: process.platform,
      arch: process.arch,
      resourcesPath: process.resourcesPath || null,
      isPackaged: !!process.resourcesPath && !process.resourcesPath.includes("node_modules"),
      sherpaOnnx: { available: false, path: null },
      modelsDir: this.getModelsDir(),
      models: [],
    };
    const binaryPath =
      this.serverManager.getBinaryPath("offline") || this.serverManager.getBinaryPath("online");
    if (binaryPath) {
      diagnostics.sherpaOnnx = { available: true, path: binaryPath };
    }

    try {
      const modelsDir = this.getModelsDir();
      if (fs.existsSync(modelsDir)) {
        const entries = fs.readdirSync(modelsDir, { withFileTypes: true });
        diagnostics.models = entries
          .filter((e) => e.isDirectory() && this.serverManager.isModelDownloaded(path.join(modelsDir, e.name)))
          .map((e) => e.name);
      }
    } catch {}

    return diagnostics;
  }
}

module.exports = ParakeetManager;
