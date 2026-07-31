const { test } = require("node:test");
const assert = require("node:assert/strict");
const localReasoningBridge = require("../../src/services/localReasoningBridge.js").default;

test("localReasoningBridge - queue ordering places interactive ahead of batch", async () => {
  // Mock runInference in modelManagerBridge
  const modelManager = require("../../src/helpers/modelManagerBridge").default;
  const originalRunInference = modelManager.runInference;

  const executionOrder = [];
  modelManager.runInference = async (modelId, text, options) => {
    executionOrder.push(text);
    // Short delay
    await new Promise((r) => setTimeout(r, 20));
    return `Output for ${text}`;
  };

  try {
    // Submit batch task
    const p1 = localReasoningBridge.processText("Batch Chunk 1", "model-1", { priority: "batch" });
    // Submit another batch task
    const p2 = localReasoningBridge.processText("Batch Chunk 2", "model-1", { priority: "batch" });
    // Submit interactive task (should jump ahead of Batch Chunk 2)
    const p3 = localReasoningBridge.processText("Interactive Dictation", "model-1", { priority: "interactive" });

    const results = await Promise.all([p1, p2, p3]);

    assert.equal(results.length, 3);
    assert.equal(executionOrder[0], "Batch Chunk 1"); // Currently running first
    assert.equal(executionOrder[1], "Interactive Dictation"); // Jumped queue
    assert.equal(executionOrder[2], "Batch Chunk 2");
  } finally {
    modelManager.runInference = originalRunInference;
  }
});

test("localReasoningBridge - cancellation cancels pending batch task", async () => {
  const retroId = "retro-123";
  localReasoningBridge.cancelAnalysis(retroId);

  try {
    await localReasoningBridge.processText("Batch Chunk", "model-1", {
      priority: "batch",
      retrospectiveId: retroId,
    });
    assert.fail("Should have thrown cancellation error");
  } catch (error) {
    assert.equal(error.message, "Analysis cancelled by user");
  } finally {
    localReasoningBridge.clearCancelledAnalysis(retroId);
  }
});

test("localReasoningBridge - per chunk timeout rejects slow inference", async () => {
  const modelManager = require("../../src/helpers/modelManagerBridge").default;
  const originalRunInference = modelManager.runInference;

  modelManager.runInference = async () => {
    // Hang longer than timeout
    await new Promise((r) => setTimeout(r, 200));
    return "Late output";
  };

  try {
    await localReasoningBridge.processText("Short Text", "model-1", {
      priority: "batch",
      timeoutMs: 50, // 50ms test timeout
    });
    assert.fail("Should have timed out");
  } catch (error) {
    assert.match(error.message, /timed out/i);
  } finally {
    modelManager.runInference = originalRunInference;
  }
});
