const fs = require("fs");
const path = require("path");
const debugLogger = require("./debugLogger");

/**
 * Benchmark runner for comparing ASR model transcription speed and output across multiple audio sample lengths.
 *
 * Sequentially transcribes Short (~10s), Medium (~38s), and Long (~3m) audio buffers through each requested model,
 * measuring wall-clock time, RTF, and word match similarity for comparison.
 */

function resolveSamplePath(filename) {
  const candidates = [];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, "resources", filename));
    candidates.push(path.join(process.resourcesPath, filename));
    candidates.push(path.join(process.resourcesPath, "app.asar", "resources", filename));
  }
  candidates.push(path.join(__dirname, "..", "..", "resources", filename));

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {}
  }
  return path.join(__dirname, "..", "..", "resources", filename);
}

const SHORT_SAMPLE_PATH = resolveSamplePath("benchmark-sample-short.wav");
const MEDIUM_SAMPLE_PATH = resolveSamplePath("benchmark-sample.wav");
const LONG_SAMPLE_PATH = resolveSamplePath("benchmark-sample-long.wav");

const SHORT_REFERENCE_TEXT =
  "The quick brown fox jumps over the lazy dog. " +
  "OpenWhispr benchmarks automatic speech recognition accuracy and speed across different AI model architectures.";

const MEDIUM_REFERENCE_TEXT =
  "The quick brown fox jumps over the lazy dog. " +
  "This is a benchmark sample for testing automatic speech recognition accuracy and speed across different model architectures. " +
  "OpenWhispr supports three transcription engines: Whisper, which uses the GGML format, NVIDIA Parakeet, which runs on the ONNX runtime, " +
  "and Apple MLX models optimized for Apple Silicon. " +
  "Each engine offers different trade-offs between speed, accuracy, and platform compatibility. " +
  "This sample is approximately thirty seconds long and contains a mix of common English words, technical terminology, " +
  "and varied sentence structures to provide a meaningful comparison.";

const LONG_REFERENCE_TEXT =
  "Artificial intelligence and automatic speech recognition have transformed how humans interact with digital systems. " +
  "Modern speech recognition architectures rely on deep neural networks, attention transformers, and advanced acoustic decoding algorithms " +
  "to transcribe spoken natural language into written text with remarkable precision and low latency. " +
  "OpenWhispr provides a unified benchmarking platform to evaluate and compare state of the art automatic speech recognition engines executing on local workstation hardware. " +
  "These engines encompass OpenAI Whisper models operating via the GGML C++ framework, NVIDIA Parakeet streaming models running on the ONNX runtime, " +
  "and Apple MLX neural network models optimized directly for Apple Silicon unified memory hardware. " +
  "Each model architecture exhibits distinct trade-offs between computational throughput, real-time factor, hardware memory utilization, and word error rate across diverse acoustic environments. " +
  "Evaluating model behavior across short dictation bursts, standard conversational audio, and extended long-form audio recordings is essential for identifying optimal transcription configurations for specific user workflows. " +
  "Benchmarking speech recognition models requires evaluating both speed and accuracy metrics across standardized test samples. " +
  "Real-time factor, defined as processing duration divided by total audio length, measures relative transcription throughput. " +
  "A real-time factor below one point zero indicates processing faster than real time playback. " +
  "Simultaneously, word accuracy and word error rate metrics evaluate transcription fidelity against ground truth reference texts. " +
  "As hardware acceleration capabilities, neural network quantization techniques, and specialized matrix multiplication units continue to advance, " +
  "local speech recognition offers compelling advantages including absolute data privacy, instantaneous response times, and full offline functionality. " +
  "By systematically measuring transcription speed and accuracy across short, medium, and long audio samples, users can configure high performance transcription engines tailored to their hardware capabilities.";

const BENCHMARK_SAMPLES = [
  {
    id: "short",
    label: "Short (~10s)",
    path: SHORT_SAMPLE_PATH,
    duration: 11.2,
    referenceText: SHORT_REFERENCE_TEXT,
  },
  {
    id: "medium",
    label: "Medium (~38s)",
    path: MEDIUM_SAMPLE_PATH,
    duration: 38.8,
    referenceText: MEDIUM_REFERENCE_TEXT,
  },
  {
    id: "long",
    label: "Long (~3m)",
    path: LONG_SAMPLE_PATH,
    duration: 171.7,
    referenceText: LONG_REFERENCE_TEXT,
  },
];

function getEngine(modelId) {
  const modelRegistryData = require("../models/modelRegistryData.json");
  if (modelRegistryData.mlxModels?.[modelId]) return "mlx";
  if (modelRegistryData.parakeetModels?.[modelId]) return "parakeet";
  if (modelRegistryData.whisperModels?.[modelId]) return "whisper";
  return null;
}

function getModelDisplayName(modelId) {
  const paramMap = {
    tiny: "Tiny 39M (Whisper)",
    base: "Base 74M (Whisper)",
    small: "Small 244M (Whisper)",
    medium: "Medium 769M (Whisper)",
    large: "Large v3 1.5B (Whisper)",
    turbo: "Large v3 Turbo 809M (Whisper)",
    "parakeet-rnnt-1.1b": "Parakeet RNNT 1.1B (NVIDIA)",
    "parakeet-tdt-0.6b-v3": "Parakeet TDT 0.6B (NVIDIA)",
    "parakeet-unified-en-0.6b": "Parakeet Unified EN 0.6B (NVIDIA)",
    "nemotron-speech-streaming-en-0.6b": "Nemotron Speech Streaming EN 0.6B (NVIDIA)",
    "nemotron-3.5-asr-streaming-0.6b": "Nemotron 3.5 ASR Streaming 0.6B (NVIDIA)",
    "whisper-large-v3-mlx": "Whisper Large v3 1.5B (MLX)",
    "whisper-large-v3-turbo-mlx": "Whisper Large v3 Turbo 809M (MLX)",
    "whisper-large-v3-turbo-4bit-mlx": "Whisper Large v3 Turbo 4-bit 809M (MLX)",
    "parakeet-rnnt-1.1b-mlx": "Parakeet RNNT 1.1B (MLX)",
  };

  if (paramMap[modelId]) return paramMap[modelId];

  const modelRegistryData = require("../models/modelRegistryData.json");
  return (
    modelRegistryData.mlxModels?.[modelId]?.name ||
    modelRegistryData.parakeetModels?.[modelId]?.name ||
    modelRegistryData.whisperModels?.[modelId]?.name ||
    modelId
  );
}

function getModelSize(modelId) {
  const modelRegistryData = require("../models/modelRegistryData.json");
  return (
    modelRegistryData.mlxModels?.[modelId]?.size ||
    modelRegistryData.parakeetModels?.[modelId]?.size ||
    modelRegistryData.whisperModels?.[modelId]?.size ||
    "Unknown"
  );
}

/**
 * Calculate a simple word-level similarity score between two texts.
 * Returns a value 0.0–1.0 where 1.0 is a perfect match.
 */
function wordSimilarity(reference, hypothesis) {
  if (!reference || !hypothesis) return 0;
  const normalize = (s) =>
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(Boolean);
  const refWords = normalize(reference);
  const hypWords = normalize(hypothesis);
  if (refWords.length === 0) return hypWords.length === 0 ? 1 : 0;

  const refSet = new Map();
  for (const w of refWords) refSet.set(w, (refSet.get(w) || 0) + 1);
  let matches = 0;
  for (const w of hypWords) {
    if (refSet.has(w) && refSet.get(w) > 0) {
      matches++;
      refSet.set(w, refSet.get(w) - 1);
    }
  }
  return matches / Math.max(refWords.length, hypWords.length);
}

/**
 * Run a multi-sample benchmark across the given model IDs.
 *
 * @param {string[]} modelIds - Array of model identifiers to benchmark
 * @param {string|null} _customAudioPath - Unused, retained for API backward compatibility
 * @param {object} managers - { whisperManager, parakeetManager, mlxManager }
 * @param {function} [onProgress] - Called with (modelId, status, details) as each model runs
 * @returns {Promise<object>} - { results: BenchmarkResult[], samples: BENCHMARK_SAMPLES, timestamp }
 */
async function runBenchmark(modelIds, _customAudioPath, managers, onProgress) {
  const { whisperManager, parakeetManager, mlxManager } = managers;
  const results = [];

  try {
    for (const modelId of modelIds) {
      const engine = getEngine(modelId);
      if (!engine) {
        results.push({
          modelId,
          modelName: modelId,
          engine: "unknown",
          modelSize: "Unknown",
          error: `Unknown model: ${modelId}`,
          samples: {},
          avgRtf: 0,
          avgSimilarity: 0,
          // Legacy backward compatibility fields
          durationMs: 0,
          rtf: 0,
          text: "",
          similarity: 0,
        });
        continue;
      }

      if (onProgress) onProgress(modelId, "initializing");
      debugLogger.info("Benchmark: initializing server/model", { modelId, engine });

      try {
        if (engine === "whisper") {
          await whisperManager.startServer(modelId);
        } else if (engine === "parakeet") {
          await parakeetManager.startServer(modelId);
        } else if (engine === "mlx") {
          await mlxManager.startServer(modelId);
        }
      } catch (e) {
        debugLogger.warn("Benchmark: initialization failed, continuing to let transcription handle it", {
          modelId,
          error: e.message,
        });
      }

      const sampleMetrics = {};
      let modelError = null;

      for (const sample of BENCHMARK_SAMPLES) {
        if (onProgress) {
          onProgress(modelId, `running:${sample.id}`, {
            sampleId: sample.id,
            sampleLabel: sample.label,
          });
        }
        debugLogger.info("Benchmark: starting sample transcription", {
          modelId,
          engine,
          sampleId: sample.id,
        });

        if (!fs.existsSync(sample.path)) {
          sampleMetrics[sample.id] = {
            sampleId: sample.id,
            label: sample.label,
            durationMs: 0,
            rtf: 0,
            text: "",
            similarity: 0,
            error: `Audio file missing: ${sample.path}`,
          };
          continue;
        }

        const audioBuffer = fs.readFileSync(sample.path);
        const startTime = performance.now();
        let text = "";
        let sampleError = null;

        try {
          if (engine === "whisper") {
            const result = await whisperManager.transcribeLocalWhisper(audioBuffer, {
              model: modelId,
            });
            text = result?.text || result || "";
          } else if (engine === "parakeet") {
            const result = await parakeetManager.transcribeLocalParakeet(audioBuffer, {
              model: modelId,
            });
            text = result?.text || result || "";
          } else if (engine === "mlx") {
            const result = await mlxManager.transcribe(audioBuffer, {
              model: modelId,
            });
            text = result?.text || "";
          }
        } catch (e) {
          sampleError = e.message;
          modelError = modelError || e.message;
          debugLogger.error("Benchmark: sample failed", {
            modelId,
            sampleId: sample.id,
            error: e.message,
          });
        }

        const endTime = performance.now();
        const durationMs = Math.round(endTime - startTime);
        const rtf = sample.duration > 0 ? durationMs / 1000 / sample.duration : 0;
        const similarity = wordSimilarity(sample.referenceText, text);

        sampleMetrics[sample.id] = {
          sampleId: sample.id,
          label: sample.label,
          audioDuration: sample.duration,
          durationMs,
          rtf: Math.round(rtf * 1000) / 1000,
          text: typeof text === "string" ? text : String(text || ""),
          similarity: Math.round(similarity * 1000) / 1000,
          error: sampleError || null,
        };
      }

      // Calculate averages across successful samples
      const validSamples = Object.values(sampleMetrics).filter((s) => !s.error);
      const avgRtf =
        validSamples.length > 0
          ? Math.round(
              (validSamples.reduce((sum, s) => sum + s.rtf, 0) / validSamples.length) * 1000
            ) / 1000
          : 0;
      const avgSimilarity =
        validSamples.length > 0
          ? Math.round(
              (validSamples.reduce((sum, s) => sum + s.similarity, 0) / validSamples.length) * 1000
            ) / 1000
          : 0;

      // Populate legacy compatibility fields from 'medium' sample if available
      const mediumSample = sampleMetrics["medium"] || validSamples[0] || {};

      results.push({
        modelId,
        modelName: getModelDisplayName(modelId),
        engine,
        modelSize: getModelSize(modelId),
        samples: sampleMetrics,
        avgRtf,
        avgSimilarity,
        // Legacy compatibility fields
        durationMs: mediumSample.durationMs || 0,
        rtf: mediumSample.rtf || 0,
        text: mediumSample.text || "",
        similarity: mediumSample.similarity !== undefined ? mediumSample.similarity : null,
        error: modelError || null,
      });

      if (onProgress) onProgress(modelId, modelError ? "error" : "done");
      debugLogger.info("Benchmark: finished model all samples", {
        modelId,
        avgRtf,
        avgSimilarity,
      });
    }
  } finally {
    // Clean up servers to free memory
    debugLogger.info("Benchmark: cleaning up servers");
    try {
      await whisperManager.serverManager.stop();
    } catch (e) {
      debugLogger.warn("Benchmark cleanup: failed to stop whisper server", { error: e.message });
    }
    try {
      await parakeetManager.serverManager.stopServer();
    } catch (e) {
      debugLogger.warn("Benchmark cleanup: failed to stop parakeet server", { error: e.message });
    }
    try {
      await mlxManager.stopServer();
    } catch (e) {
      debugLogger.warn("Benchmark cleanup: failed to stop mlx server", { error: e.message });
    }
  }

  return {
    results,
    samples: BENCHMARK_SAMPLES.map((s) => ({ id: s.id, label: s.label, duration: s.duration })),
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  runBenchmark,
  BENCHMARK_SAMPLES,
  SAMPLE_AUDIO_PATH: MEDIUM_SAMPLE_PATH,
  REFERENCE_TEXT: MEDIUM_REFERENCE_TEXT,
};
