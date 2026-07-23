const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const debugLogger = require("./debugLogger");
const {
  createDownloadSignal,
  createDownloadInProgressError,
  cleanupStaleDownloads,
  checkDiskSpace,
  downloadHuggingFaceModel,
} = require("./downloadUtils");
const MlxServerManager = require("./mlxServer");
const { getModelsDirForService } = require("./modelDirUtils");

const modelRegistryData = require("../models/modelRegistryData.json");

function getMlxModelConfig(modelName) {
  const modelInfo = modelRegistryData.mlxModels?.[modelName];
  if (!modelInfo) return null;
  return {
    huggingFaceRepo: modelInfo.huggingFaceRepo,
    requiredFiles: modelInfo.requiredFiles || [],
    size: modelInfo.sizeMb * 1_000_000,
  };
}

function getValidModelNames() {
  return Object.keys(modelRegistryData.mlxModels || {});
}

class MlxManager {
  constructor() {
    this.currentDownloadProcess = null;
    this.isInitialized = false;
    this.serverManager = new MlxServerManager();
  }

  getModelsDir() {
    const { getCacheRoot } = require("./modelDirUtils");
    return path.join(getCacheRoot(), "mlx-models");
  }

  validateModelName(modelName) {
    const validModels = getValidModelNames();
    if (!validModels.includes(modelName)) {
      throw new Error(
        `Invalid MLX model: ${modelName}. Valid models: ${validModels.join(", ")}`
      );
    }
    return true;
  }

  getModelPath(modelName) {
    this.validateModelName(modelName);
    const { getCacheRoot } = require("./modelDirUtils");
    return path.join(getCacheRoot(), "huggingface", modelName);
  }

  async initializeAtStartup(settings = {}) {
    const startTime = Date.now();
    try {
      this.isInitialized = true;

      const oldModelsDir = this.getModelsDir();
      const { getCacheRoot } = require("./modelDirUtils");
      const hfDir = path.join(getCacheRoot(), "huggingface");
      const hfModelsDir = path.join(getCacheRoot(), "huggingface-models");

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
        debugLogger.error("Failed to migrate mlx models", { error: e.message });
      }

      try {
        if (fs.existsSync(hfModelsDir)) {
          const validModels = getValidModelNames();
          for (const model of validModels) {
            const oldPath = path.join(hfModelsDir, model);
            if (fs.existsSync(oldPath)) {
              const newPath = this.getModelPath(model);
              await fsPromises.mkdir(path.dirname(newPath), { recursive: true });
              await fsPromises.rename(oldPath, newPath);
            }
          }
        }
      } catch (e) {}

      await cleanupStaleDownloads(oldModelsDir);
      await cleanupStaleDownloads(hfDir);
      await cleanupStaleDownloads(hfModelsDir);
      await this.logDependencyStatus();
    } catch (error) {
      debugLogger.warn("MLX initialization error", { error: error.message });
      this.isInitialized = true;
    }

    debugLogger.info("MLX initialization complete", {
      totalTimeMs: Date.now() - startTime,
    });
  }

  async logDependencyStatus() {
    const status = {
      models: [],
    };

    for (const modelName of getValidModelNames()) {
      if (this.serverManager.isModelDownloaded(modelName, this.getModelPath(modelName))) {
        status.models.push({ name: modelName });
      }
    }
    debugLogger.info("MLX dependency check", status);
  }

  async downloadModel(modelName, progressCallback) {
    this.validateModelName(modelName);

    if (this.currentDownloadProcess) {
      if (this.currentDownloadProcess.modelName === modelName) {
        throw createDownloadInProgressError(modelName);
      }
      throw new Error("Another download is currently in progress");
    }

    const modelConfig = getMlxModelConfig(modelName);
    if (!modelConfig) {
      throw new Error(`Model configuration not found for: ${modelName}`);
    }

    const { signal, abort } = createDownloadSignal();
    const downloadProcess = {
      modelName,
      abort,
      percentage: 0,
      phase: "downloading",
      downloadedBytes: 0,
      totalBytes: modelConfig.size,
    };
    this.currentDownloadProcess = downloadProcess;

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

      await downloadHuggingFaceModel({
        huggingFaceRepo: modelConfig.huggingFaceRepo,
        requiredFiles: modelConfig.requiredFiles,
        modelPath,
        modelName,
        progressCallback,
        downloadProcess,
        signal,
      });

      downloadProcess.phase = "installing";
      downloadProcess.percentage = 100;
      if (progressCallback) {
        progressCallback({ type: "complete", model: modelName, percentage: 100 });
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

  cancelDownload() {
    if (this.currentDownloadProcess) {
      this.currentDownloadProcess.abort();
      this.currentDownloadProcess = null;
      return true;
    }
    return false;
  }

  getCurrentDownload() {
    return this.currentDownloadProcess;
  }

  async listModels() {
    const validModels = getValidModelNames();
    const modelInfo = [];

    for (const model of validModels) {
      const activeDownload = this.currentDownloadProcess?.modelName === model;
      const downloadStatus = {
        isDownloading: activeDownload,
        isInstalling: activeDownload && this.currentDownloadProcess.phase === "installing",
        downloadProgress: activeDownload ? this.currentDownloadProcess.percentage : 0,
        downloadedBytes: activeDownload ? this.currentDownloadProcess.downloadedBytes : 0,
        totalBytes: activeDownload ? this.currentDownloadProcess.totalBytes : 0,
      };

      if (this.serverManager.isModelDownloaded(model, this.getModelPath(model))) {
        modelInfo.push({
          model,
          downloaded: true,
          path: this.getModelPath(model),
          success: true,
          ...downloadStatus,
        });
      } else {
        modelInfo.push({
          model,
          downloaded: false,
          success: true,
          ...downloadStatus,
        });
      }
    }
    return modelInfo;
  }

  async deleteModel(modelName) {
    this.validateModelName(modelName);

    if (this.currentDownloadProcess?.modelName === modelName) {
      this.cancelDownload();
    }

    const modelPath = this.getModelPath(modelName);
    try {
      await fsPromises.rm(modelPath, { recursive: true, force: true });
      return true;
    } catch (error) {
      if (error.code !== "ENOENT") {
        debugLogger.error(`Failed to delete MLX model ${modelName}`, {
          error: error.message,
        });
        throw error;
      }
      return false;
    }
  }
  async startServer(modelName) {
    this.validateModelName(modelName);
    return this.serverManager.startServer(modelName, this.getModelPath(modelName));
  }

  async stopServer() {
    return this.serverManager.stopServer();
  }

  getServerStatus() {
    return this.serverManager.getServerStatus();
  }

  async transcribe(audioBuffer, options = {}) {
    const model = options.model || "parakeet-rnnt-1.1b-mlx";
    const modelPath = this.getModelPath(model);
    return this.serverManager.transcribe(audioBuffer, modelPath, options);
  }

  createOnlineStream(options) {
    throw new Error("Online streaming is not yet natively supported by the MLX Swift backend.");
  }
}

module.exports = MlxManager;
