const modelManager = require("../helpers/modelManagerBridge").default;
const debugLogger = require("../helpers/debugLogger");

class LocalReasoningService {
  constructor() {
    this.isProcessing = false;
    this.queue = [];
    this.cancelledAnalyses = new Set();
  }

  async isAvailable() {
    try {
      await modelManager.ensureLlamaCpp();
      const models = await modelManager.getAllModels();
      return models.some((model) => model.isDownloaded);
    } catch {
      return false;
    }
  }

  cancelAnalysis(retrospectiveId) {
    if (retrospectiveId) {
      this.cancelledAnalyses.add(retrospectiveId);
    }
  }

  clearCancelledAnalysis(retrospectiveId) {
    if (retrospectiveId) {
      this.cancelledAnalyses.delete(retrospectiveId);
    }
  }

  isAnalysisCancelled(retrospectiveId) {
    return retrospectiveId ? this.cancelledAnalyses.has(retrospectiveId) : false;
  }

  /**
   * Enqueues a request with priority ('interactive' vs 'batch').
   * 'interactive' jumps ahead of queued 'batch' requests.
   */
  async processText(text, modelId, config = {}) {
    const priority = config.priority || "interactive";

    return new Promise((resolve, reject) => {
      const task = {
        text,
        modelId,
        config,
        priority,
        resolve,
        reject,
      };

      if (priority === "interactive") {
        // Insert before first batch task, or after existing interactive tasks
        const firstBatchIdx = this.queue.findIndex((t) => t.priority === "batch");
        if (firstBatchIdx === -1) {
          this.queue.push(task);
        } else {
          this.queue.splice(firstBatchIdx, 0, task);
        }
      } else {
        this.queue.push(task);
      }

      this._processQueue();
    });
  }

  async _processQueue() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const task = this.queue.shift();
    const { text, modelId, config, resolve, reject } = task;

    // Check cancellation before starting
    if (config.retrospectiveId && this.isAnalysisCancelled(config.retrospectiveId)) {
      this.isProcessing = false;
      reject(new Error("Analysis cancelled by user"));
      this._processQueue();
      return;
    }

    const startTime = Date.now();
    const timeoutMs = config.timeoutMs || 120000; // 120s per-chunk timeout

    try {
      const inferenceConfig = {
        maxTokens: config.maxTokens || this.calculateMaxTokens(text.length),
        temperature: config.temperature ?? 0.7,
        topK: config.topK || 40,
        topP: config.topP || 0.9,
        repeatPenalty: config.repeatPenalty || 1.1,
        systemPrompt: config.systemPrompt || "",
        disableThinking: config.disableThinking !== false,
      };

      debugLogger.logReasoning("LOCAL_BRIDGE_INFERENCE", {
        modelId,
        priority: task.priority,
        config: inferenceConfig,
      });

      // Wrap inference in per-chunk timeout
      let timeoutId;
      const timeoutPromise = new Promise((_, timeoutReject) => {
        timeoutId = setTimeout(() => {
          timeoutReject(new Error(`Inference timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      const inferencePromise = modelManager.runInference(modelId, text, inferenceConfig);

      const result = await Promise.race([inferencePromise, timeoutPromise]).finally(() => {
        clearTimeout(timeoutId);
      });

      const stripThinking = config.disableThinking !== false;
      const cleanResult = stripThinking
        ? result
            .replace(/<think>[\s\S]*?<\/think>/g, "")
            .replace(/<think>[\s\S]*$/, "")
            .trim()
        : result.trim();

      const processingTime = Date.now() - startTime;

      debugLogger.logReasoning("LOCAL_BRIDGE_SUCCESS", {
        modelId,
        processingTimeMs: processingTime,
        resultLength: cleanResult.length,
      });

      resolve(cleanResult);
    } catch (error) {
      const processingTime = Date.now() - startTime;

      debugLogger.logReasoning("LOCAL_BRIDGE_ERROR", {
        modelId,
        processingTimeMs: processingTime,
        error: error.message,
      });

      reject(error);
    } finally {
      this.isProcessing = false;
      // Yield execution slightly so callers/queue can re-order or cancel
      setImmediate(() => this._processQueue());
    }
  }

  calculateMaxTokens(textLength, minTokens = 512, maxTokens = 2048, multiplier = 2) {
    return Math.max(minTokens, Math.min(textLength * multiplier, maxTokens));
  }
}

module.exports = {
  default: new LocalReasoningService(),
};
