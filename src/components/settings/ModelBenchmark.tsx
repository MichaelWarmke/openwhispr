import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Zap,
  HardDrive,
  RefreshCw,
  FileText,
  HelpCircle,
  Layers,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Button } from "../ui/button";
import { useLocalStorage } from "../../hooks/useLocalStorage";

interface SampleMetric {
  sampleId: string;
  label: string;
  audioDuration: number;
  durationMs: number;
  rtf: number;
  text: string;
  similarity: number | null;
  error: string | null;
}

interface BenchmarkResult {
  modelId: string;
  modelName: string;
  engine: string;
  modelSize: string;
  samples?: Record<string, SampleMetric>;
  avgRtf?: number;
  avgSimilarity?: number;
  durationMs: number;
  rtf: number;
  text: string;
  similarity: number | null;
  error: string | null;
}

interface BenchmarkHistory {
  results: BenchmarkResult[];
  samples?: Array<{ id: string; label: string; duration: number }>;
  timestamp: string;
}

interface ModelItem {
  id: string;
  name: string;
  engine: "whisper" | "parakeet" | "mlx";
  size: string;
  downloaded: boolean;
}

type SortField = "model" | "short" | "medium" | "long" | "avg";
type SortOrder = "asc" | "desc";

export default function ModelBenchmark() {
  const { t } = useTranslation();
  const [models, setModels] = useState<ModelItem[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [selectedModels, setSelectedModels] = useState<Record<string, boolean>>({});
  const [running, setRunning] = useState(false);
  const [currentRunningModel, setCurrentRunningModel] = useState<string | null>(null);
  const [modelStatuses, setModelStatuses] = useState<
    Record<string, { status: string; label?: string }>
  >({});
  const [activeSampleTab, setActiveSampleTab] = useState<"short" | "medium" | "long">("medium");

  const [sortField, setSortField] = useState<SortField>("short");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const [history, setHistory] = useLocalStorage<BenchmarkHistory | null>(
    "openwhispr.benchmark.last_results",
    null
  );

  const fetchModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const list: ModelItem[] = [];

      // 1. Fetch Whisper Models
      try {
        const whisperRes = await window.electronAPI?.listWhisperModels?.();
        if (whisperRes?.success && whisperRes.models) {
          const whisperParamNames: Record<string, string> = {
            tiny: "Tiny 39M",
            base: "Base 74M",
            small: "Small 244M",
            medium: "Medium 769M",
            large: "Large v3 1.5B",
            turbo: "Large v3 Turbo 809M",
          };
          whisperRes.models.forEach((m: any) => {
            if (m.downloaded) {
              const displayName = whisperParamNames[m.model] || (m.model.charAt(0).toUpperCase() + m.model.slice(1));
              list.push({
                id: m.model,
                name: `${displayName} (Whisper)`,
                engine: "whisper",
                size: m.size_mb ? `${m.size_mb} MB` : "Unknown",
                downloaded: true,
              });
            }
          });
        }
      } catch (e) {
        console.error("Failed to list Whisper models for benchmark", e);
      }

      // 2. Fetch Parakeet Models
      try {
        const parakeetRes = await window.electronAPI?.listParakeetModels?.();
        if (parakeetRes?.success && parakeetRes.models) {
          const parakeetParamNames: Record<string, string> = {
            "parakeet-rnnt-1.1b": "Parakeet RNNT 1.1B",
            "parakeet-tdt-0.6b-v3": "Parakeet TDT 0.6B",
            "parakeet-unified-en-0.6b": "Parakeet Unified EN 0.6B",
            "nemotron-speech-streaming-en-0.6b": "Nemotron Speech Streaming EN 0.6B",
            "nemotron-3.5-asr-streaming-0.6b": "Nemotron 3.5 ASR Streaming 0.6B",
          };
          parakeetRes.models.forEach((m: any) => {
            if (m.downloaded) {
              const displayName = parakeetParamNames[m.model] || m.model;
              list.push({
                id: m.model,
                name: `${displayName} (NVIDIA)`,
                engine: "parakeet",
                size: m.size_mb ? `${m.size_mb} MB` : "Unknown",
                downloaded: true,
              });
            }
          });
        }
      } catch (e) {
        console.error("Failed to list Parakeet models for benchmark", e);
      }

      // 3. Fetch MLX Models
      try {
        const mlxRes = await window.electronAPI?.listMlxModels?.();
        if (mlxRes?.success && mlxRes.models) {
          const mlxParamNames: Record<string, string> = {
            "whisper-base-mlx": "Whisper Base 74M",
            "whisper-large-v3-mlx": "Whisper Large v3 1.5B",
            "whisper-large-v3-turbo-mlx": "Whisper Large v3 Turbo 809M",
            "whisper-large-v3-turbo-4bit-mlx": "Whisper Large v3 Turbo 4-bit 809M",
            "parakeet-rnnt-1.1b-mlx": "Parakeet RNNT 1.1B",
          };
          mlxRes.models.forEach((m: any) => {
            if (m.downloaded) {
              const displayName = mlxParamNames[m.model] || m.model.replace("-mlx", "");
              list.push({
                id: m.model,
                name: `${displayName} (MLX)`,
                engine: "mlx",
                size: m.size || (m.size_mb ? `${m.size_mb} MB` : "Unknown"),
                downloaded: true,
              });
            }
          });
        }
      } catch (e) {
        console.error("Failed to list MLX models for benchmark", e);
      }

      setModels(list);

      // Pre-select all downloaded models by default
      const initialSelected: Record<string, boolean> = {};
      list.forEach((m) => {
        initialSelected[m.id] = true;
      });
      setSelectedModels(initialSelected);
    } catch (err) {
      console.error("Error fetching models for benchmark", err);
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Subscribe to benchmark progress updates
  useEffect(() => {
    if (!window.electronAPI?.onModelBenchmarkProgress) return;

    const cleanup = window.electronAPI.onModelBenchmarkProgress((data) => {
      setModelStatuses((prev) => ({
        ...prev,
        [data.modelId]: {
          status: data.status,
          label: data.details?.sampleLabel,
        },
      }));
      if (data.status.startsWith("running") || data.status === "initializing") {
        setCurrentRunningModel(data.modelId);
      }
    });

    return () => {
      cleanup();
    };
  }, []);

  const handleToggle = (id: string) => {
    setSelectedModels((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleRun = async () => {
    const selectedIds = Object.keys(selectedModels).filter((id) => selectedModels[id]);
    if (selectedIds.length === 0) return;

    setRunning(true);
    setCurrentRunningModel(null);
    const initialStatuses: Record<string, { status: string; label?: string }> = {};
    selectedIds.forEach((id) => {
      initialStatuses[id] = { status: "idle" };
    });
    setModelStatuses(initialStatuses);

    try {
      const benchmarkData = await window.electronAPI.runModelBenchmark(selectedIds, null);
      if (benchmarkData && benchmarkData.results) {
        setHistory(benchmarkData);
      }
    } catch (err) {
      console.error("Benchmark execution failed:", err);
    } finally {
      setRunning(false);
      setCurrentRunningModel(null);
    }
  };

  const getEngineColor = (engine: string) => {
    switch (engine) {
      case "mlx":
        return "#3b82f6"; // Blue
      case "parakeet":
        return "#f97316"; // Orange
      case "whisper":
        return "#10b981"; // Emerald
      default:
        return "#8b5cf6"; // Purple
    }
  };

  const selectedCount = Object.values(selectedModels).filter(Boolean).length;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const sortedResults = useMemo(() => {
    if (!history?.results) return [];
    return [...history.results].sort((a, b) => {
      if (sortField === "model") {
        const nameA = a.modelName.toLowerCase();
        const nameB = b.modelName.toLowerCase();
        return sortOrder === "asc" ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      }

      let valA = Infinity;
      let valB = Infinity;

      if (sortField === "short" || sortField === "medium" || sortField === "long") {
        const sampleA = a.samples?.[sortField];
        const sampleB = b.samples?.[sortField];
        valA = sampleA && !sampleA.error ? sampleA.durationMs : Infinity;
        valB = sampleB && !sampleB.error ? sampleB.durationMs : Infinity;
      } else if (sortField === "avg") {
        valA = a.avgRtf ?? a.rtf ?? Infinity;
        valB = b.avgRtf ?? b.rtf ?? Infinity;
      }

      return sortOrder === "asc" ? valA - valB : valB - valA;
    });
  }, [history?.results, sortField, sortOrder]);

  const renderSortHeader = (label: string, field: SortField, alignRight = false) => {
    const isCurrent = sortField === field;
    return (
      <th
        onClick={() => handleSort(field)}
        className={`py-3 px-3 cursor-pointer select-none transition-colors hover:text-foreground ${
          alignRight ? "text-right" : "text-left"
        } ${isCurrent ? "text-foreground font-semibold" : "text-muted-foreground"}`}
      >
        <div
          className={`inline-flex items-center gap-1.5 ${
            alignRight ? "flex-row-reverse" : "flex-row"
          }`}
        >
          <span>{label}</span>
          {isCurrent ? (
            sortOrder === "asc" ? (
              <ArrowUp className="w-3.5 h-3.5 text-primary" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5 text-primary" />
            )
          ) : (
            <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground/40 hover:text-muted-foreground" />
          )}
        </div>
      </th>
    );
  };

  const renderSampleCell = (sample: SampleMetric | undefined) => {
    if (!sample) return <span className="text-muted-foreground">-</span>;
    if (sample.error) {
      return <span className="text-destructive text-xs font-normal">Failed</span>;
    }
    const durationSec = Math.round((sample.durationMs / 1000) * 10) / 10;
    const similarityPct = sample.similarity !== null ? Math.round(sample.similarity * 100) : null;

    return (
      <div className="flex flex-col space-y-0.5">
        <div className="flex items-center gap-1.5 font-mono text-foreground">
          <span>{durationSec}s</span>
          <span className="text-[10px] text-muted-foreground font-semibold">({sample.rtf}x)</span>
        </div>
        {similarityPct !== null && (
          <span
            className={`text-[11px] font-mono font-semibold ${
              similarityPct >= 95
                ? "text-success"
                : similarityPct >= 85
                  ? "text-amber-500"
                  : "text-muted-foreground"
            }`}
          >
            {similarityPct}% match
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Upper Panel: Model Selection & Information */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 rounded-xl border border-border/60 bg-muted/30 backdrop-blur-md p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary animate-pulse" />
              ASR Models Benchmark
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchModels}
              disabled={running || loadingModels}
              className="h-8 text-xs gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingModels ? "animate-spin" : ""}`} />
              Scan Models
            </Button>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed">
            Run a comprehensive side-by-side benchmark across three audio sample lengths:
            <span className="font-semibold text-foreground"> Short (~10s)</span>,
            <span className="font-semibold text-foreground"> Medium (~38s)</span>, and
            <span className="font-semibold text-foreground"> Long (~3m)</span>.
          </p>

          {loadingModels ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <span className="text-sm text-muted-foreground">Checking downloaded models...</span>
            </div>
          ) : models.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/80 bg-background/50 p-8 text-center space-y-2">
              <HelpCircle className="w-10 h-10 mx-auto text-muted-foreground/60" />
              <h4 className="text-sm font-semibold text-foreground">No Local Models Downloaded</h4>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Download ASR models in the Dictation or Meetings tabs first to run local benchmarks
                on them.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-56 overflow-y-auto pr-1">
              {models.map((model) => {
                const isSelected = !!selectedModels[model.id];
                const statusInfo = modelStatuses[model.id] || { status: "idle" };
                const isRunning =
                  statusInfo.status.startsWith("running") || statusInfo.status === "initializing";
                return (
                  <div
                    key={model.id}
                    onClick={() => !running && handleToggle(model.id)}
                    className={`flex items-center justify-between p-3.5 rounded-lg border text-sm cursor-pointer select-none transition-all duration-200 ${
                      isSelected
                        ? "bg-primary/5 border-primary/40 shadow-sm"
                        : "bg-background/60 border-border/50 hover:bg-muted/40 hover:border-border"
                    } ${running ? "opacity-85 cursor-not-allowed" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={running}
                        readOnly
                        className="rounded border-border/80 text-primary focus:ring-primary/30 w-4 h-4 cursor-pointer"
                      />
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground tracking-tight leading-none mb-1">
                          {model.name}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <HardDrive className="w-3 h-3 text-muted-foreground/60" />
                          {model.size}
                        </span>
                      </div>
                    </div>

                    {running && statusInfo.status !== "idle" && (
                      <div className="flex items-center gap-1.5">
                        {isRunning && (
                          <>
                            <Loader2 className="w-4 h-4 text-primary animate-spin" />
                            {statusInfo.label && (
                              <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                                {statusInfo.label.split(" ")[0]}
                              </span>
                            )}
                          </>
                        )}
                        {statusInfo.status === "done" && (
                          <CheckCircle2 className="w-4 h-4 text-success" />
                        )}
                        {statusInfo.status === "error" && (
                          <XCircle className="w-4 h-4 text-destructive" />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              {selectedCount} of {models.length} model(s) selected
            </span>
            <Button
              onClick={handleRun}
              disabled={running || selectedCount === 0 || models.length === 0}
              className="gap-2 px-5 h-9"
            >
              {running ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Benchmarking All Samples...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Run Benchmark
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Sidebar Info Card */}
        <div className="rounded-xl border border-border/60 bg-muted/30 backdrop-blur-md p-5 shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Multi-Sample Testing
            </h4>
            <div className="text-xs text-muted-foreground space-y-2 leading-relaxed">
              <p>
                Each run evaluates model latency, Real-Time Factor (RTF), and accuracy across 3 distinct domain samples:
              </p>
              <ul className="list-disc list-inside space-y-1 pl-1 font-mono text-[11px]">
                <li>
                  <strong className="text-foreground font-sans">Short (~10s):</strong> Fast dictations & commands
                </li>
                <li>
                  <strong className="text-foreground font-sans">Medium (~38s):</strong> Standard mixed sentences
                </li>
                <li>
                  <strong className="text-foreground font-sans">Long (~3m):</strong> Extended audio throughput
                </li>
              </ul>
              <p className="pt-1">
                Click column headers below to sort models by execution speed across sample sizes.
              </p>
            </div>
          </div>
          {history && (
            <div className="border-t border-border/50 pt-4 mt-4 text-xs text-muted-foreground space-y-1.5">
              <div className="flex items-center justify-between">
                <span>Last Run:</span>
                <span className="font-medium text-foreground">
                  {new Date(history.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Evaluated Samples:</span>
                <span className="font-medium text-foreground">3 Samples (10s, 38s, 3m)</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full Width Lower Panel: Accuracy & Diagnostics + Text Comparison */}
      {history && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Full-Width Accuracy & Diagnostics Table */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-5 shadow-sm space-y-4 w-full">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
                <FileText className="w-4 h-4 text-success" />
                Accuracy & Diagnostics
              </h3>
              <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-[#3b82f6]" /> MLX (Metal)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-[#f97316]" /> Parakeet (ONNX)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-[#10b981]" /> Whisper (GGML)
                </span>
              </div>
            </div>

            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border/60 text-muted-foreground font-medium">
                    {renderSortHeader("Model & Engine", "model")}
                    {renderSortHeader("Short (~10s)", "short")}
                    {renderSortHeader("Medium (~38s)", "medium")}
                    {renderSortHeader("Long (~3m)", "long")}
                    {renderSortHeader("Avg RTF / Match", "avg", true)}
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((result) => {
                    const shortSample = result.samples?.["short"];
                    const mediumSample = result.samples?.["medium"];
                    const longSample = result.samples?.["long"];

                    const avgRtfDisplay = result.avgRtf !== undefined ? `${result.avgRtf}x` : `${result.rtf}x`;
                    const avgSimDisplay =
                      result.avgSimilarity !== undefined && result.avgSimilarity !== null
                        ? Math.round(result.avgSimilarity * 100)
                        : result.similarity !== null
                          ? Math.round(result.similarity * 100)
                          : null;

                    return (
                      <tr
                        key={result.modelId}
                        className="border-b border-border/40 hover:bg-muted/10 transition-colors"
                      >
                        <td className="py-3 px-3 font-medium text-foreground">
                          <div className="flex flex-col">
                            <span className="font-semibold text-sm">
                              {result.modelName.split(" (")[0]}
                            </span>
                            <span className="mt-1 inline-flex w-max px-1.5 py-0.5 rounded text-[10px] text-white uppercase font-mono tracking-wide font-semibold" style={{ backgroundColor: getEngineColor(result.engine) }}>
                              {result.engine}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3">{renderSampleCell(shortSample)}</td>
                        <td className="py-3 px-3">{renderSampleCell(mediumSample)}</td>
                        <td className="py-3 px-3">{renderSampleCell(longSample)}</td>
                        <td className="py-3 px-3 text-right">
                          {result.error && !result.samples ? (
                            <span className="text-destructive font-sans text-xs">Error</span>
                          ) : (
                            <div className="flex flex-col items-end space-y-0.5">
                              <span className="font-mono font-semibold text-foreground">
                                {avgRtfDisplay}
                              </span>
                              {avgSimDisplay !== null && (
                                <span
                                  className={`text-[11px] font-mono font-bold ${
                                    avgSimDisplay >= 95
                                      ? "text-success"
                                      : avgSimDisplay >= 85
                                        ? "text-amber-500"
                                        : "text-muted-foreground"
                                  }`}
                                >
                                  {avgSimDisplay}% avg match
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Full-Width Transcribed Text Comparison */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-5 shadow-sm space-y-4 w-full">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <h3 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                Transcribed Text Comparison
              </h3>

              {/* Sample Tab Selector */}
              <div className="flex items-center p-1 rounded-lg bg-muted/50 border border-border/50 text-xs">
                {(["short", "medium", "long"] as const).map((sampleKey) => {
                  const labelMap = {
                    short: "Short (~10s)",
                    medium: "Medium (~38s)",
                    long: "Long (~3m)",
                  };
                  const isActive = activeSampleTab === sampleKey;
                  return (
                    <button
                      key={sampleKey}
                      onClick={() => setActiveSampleTab(sampleKey)}
                      className={`px-3 py-1 rounded-md transition-all text-xs font-medium ${
                        isActive
                          ? "bg-background text-foreground shadow-sm font-semibold"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {labelMap[sampleKey]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
              {sortedResults.map((result) => {
                const sampleData = result.samples?.[activeSampleTab] || {
                  text: result.text,
                  similarity: result.similarity,
                  error: result.error,
                };

                return (
                  <div
                    key={result.modelId}
                    className="rounded-lg border border-border/50 bg-background/50 p-4 space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">
                          {result.modelName.split(" (")[0]}
                        </span>
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded font-mono uppercase font-semibold text-white tracking-wide"
                          style={{ backgroundColor: getEngineColor(result.engine) }}
                        >
                          {result.engine}
                        </span>
                      </div>
                      <div className="p-2.5 rounded bg-muted/30 border border-border/40 min-h-[110px]">
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-8">
                          {sampleData.error ? (
                            <span className="text-destructive italic font-medium">
                              {sampleData.error}
                            </span>
                          ) : sampleData.text ? (
                            `"${sampleData.text}"`
                          ) : (
                            <span className="italic text-muted-foreground/60">
                              Empty transcript
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    {!sampleData.error && sampleData.similarity !== null && (
                      <div className="text-[10px] text-muted-foreground flex justify-between border-t border-border/40 pt-2.5 mt-1">
                        <span>Word Match Similarity:</span>
                        <span className="font-semibold text-foreground font-mono">
                          {Math.round(sampleData.similarity * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
