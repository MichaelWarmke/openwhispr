import React, { useState, useEffect, useRef } from "react";
import {
  type SprintSnapshot,
  type Retrospective,
  type ModelDescribeResult,
  type RetroAnalysisProgress,
  retroClient,
} from "../../services/retro/client";
import {
  AlertCircle,
  FileText,
  UploadCloud,
  CheckCircle2,
  Edit3,
  Loader2,
  Sparkles,
  Settings,
  X,
} from "lucide-react";
import { Button } from "../ui/button";

import { useSettingsStore } from "../../stores/settingsStore";

interface RetrospectiveIntakeProps {
  sprints: SprintSnapshot[];
  onSprintUpdate: () => void;
  onAnalysisSuccess: (retroId: string) => void;
  onOpenSettings: () => void;
}

export default function RetrospectiveIntake({
  sprints,
  onSprintUpdate,
  onAnalysisSuccess,
  onOpenSettings,
}: RetrospectiveIntakeProps) {
  const [selectedSprintId, setSelectedSprintId] = useState<string>(sprints[0]?.id || "sprint-24");
  const [transcriptText, setTranscriptText] = useState<string>("");
  const [sourceKind, setSourceKind] = useState<"audio" | "text" | "paste">("paste");
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [audioSourcePath, setAudioSourcePath] = useState<string | null>(null);

  const [modelStatus, setModelStatus] = useState<ModelDescribeResult | null>(null);
  const [isCheckingModel, setIsCheckingModel] = useState<boolean>(true);

  const retroAnalystModel = useSettingsStore((s) => s.retroAnalystModel);
  const retroReasoningModel = useSettingsStore((s) => s.retroReasoningModel);
  const cleanupModel = useSettingsStore((s) => s.cleanupModel);
  const cleanupProvider = useSettingsStore((s) => s.cleanupProvider);
  const cleanupMode = useSettingsStore((s) => s.cleanupMode);

  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [progressState, setProgressState] = useState<RetroAnalysisProgress | null>(null);
  const [currentRetroId, setCurrentRetroId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Edit Sprint Metrics Modal state
  const [showEditSprintModal, setShowEditSprintModal] = useState<boolean>(false);
  const [editSprintData, setEditSprintData] = useState<Partial<SprintSnapshot>>({});

  const selectedSprint = sprints.find((s) => s.id === selectedSprintId) || sprints[0];

  useEffect(() => {
    let isMounted = true;
    retroClient
      .describeModel({
        retroAnalystModel,
        retroReasoningModel,
        cleanupModel,
        cleanupProvider,
        cleanupMode,
      })
      .then((res) => {
        if (isMounted) {
          setModelStatus(res);
          setIsCheckingModel(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setModelStatus({ available: false, modelId: null, providerId: "local", contextLength: 4096 });
          setIsCheckingModel(false);
        }
      });

    const cleanupProgress = retroClient.onAnalysisProgress((data) => {
      setProgressState(data);
      if (data.stage === "completed") {
        setIsAnalyzing(false);
        if (data.retrospectiveId) {
          onAnalysisSuccess(data.retrospectiveId);
        }
      } else if (data.stage === "error") {
        setIsAnalyzing(false);
        setErrorMessage(data.error || "Analysis failed");
      }
    });

    return () => {
      isMounted = false;
      cleanupProgress();
    };
  }, [onAnalysisSuccess, retroAnalystModel, retroReasoningModel, cleanupModel, cleanupProvider, cleanupMode]);

  const handleEditSprintOpen = () => {
    if (selectedSprint) {
      setEditSprintData({ ...selectedSprint });
      setShowEditSprintModal(true);
    }
  };

  const handleSaveSprintMetrics = async () => {
    if (!selectedSprint) return;
    try {
      await retroClient.updateSprintMetrics(selectedSprint.id, editSprintData);
      onSprintUpdate();
      setShowEditSprintModal(false);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to update sprint metrics");
    }
  };

  const handleFileUpload = (file: File) => {
    if (file.name.endsWith(".txt")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setTranscriptText(text);
        setSourceKind("text");
        setAudioFileName(file.name);
      };
      reader.readAsText(file);
    } else {
      // Audio file
      setAudioFileName(file.name);
      // In Electron renderer, webUtils or File.path gives real local file path
      const filePath = (file as any).path || file.name;
      setAudioSourcePath(filePath);
      setSourceKind("audio");
      if (!transcriptText) {
        setTranscriptText(`[Audio File: ${file.name} - Ready for analysis]`);
      }
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleStartAnalysis = async () => {
    if (!selectedSprintId || !transcriptText.trim()) {
      setErrorMessage("Please select a sprint and provide transcript text.");
      return;
    }

    setErrorMessage(null);
    setIsAnalyzing(true);

    try {
      // Create retrospective entry
      const retro = await retroClient.createRetro({
        sprintId: selectedSprintId,
        transcript: transcriptText,
        sourceKind: sourceKind,
        audioPath: audioSourcePath || undefined,
      });

      setCurrentRetroId(retro.id);

      // Copy audio if audio file
      if (audioSourcePath) {
        try {
          const { copiedPath } = await retroClient.copyRetroAudio(audioSourcePath, retro.id);
          await retroClient.updateRetro(retro.id, { audio_path: copiedPath });
        } catch (copyErr) {
          console.warn("Audio copy failed", copyErr);
        }
      }

      // Run analysis
      await retroClient.runAnalysis(retro.id);
    } catch (err: any) {
      setIsAnalyzing(false);
      setErrorMessage(err.message || "Failed to start analysis.");
    }
  };

  const handleCancelAnalysis = async () => {
    if (currentRetroId) {
      await retroClient.cancelAnalysis(currentRetroId);
    }
    setIsAnalyzing(false);
    setProgressState(null);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">Retrospective Intake</h2>
        <p className="text-sm text-muted-foreground">
          Select a sprint and upload or paste your retrospective transcript for AI analysis.
        </p>
      </div>

      {errorMessage && (
        <div className="p-3.5 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Sprint Selection */}
      <div className="space-y-2 rounded-xl border border-border/40 bg-surface-1/40 p-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sprint <span className="text-destructive">*</span>
          </label>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleEditSprintOpen}
            className="h-7 text-xs gap-1.5 text-primary hover:text-primary/90"
          >
            <Edit3 size={13} />
            Edit metrics
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <select
            value={selectedSprintId}
            onChange={(e) => setSelectedSprintId(e.target.value)}
            className="h-9 w-full sm:w-72 rounded-md border border-border/60 bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {selectedSprint && (
            <div className="text-xs text-muted-foreground space-x-2">
              <span>
                {selectedSprint.start_date} – {selectedSprint.end_date}
              </span>
              <span>·</span>
              <span className="font-medium text-foreground">
                {selectedSprint.total_issues > 0
                  ? Math.round((selectedSprint.completed_issues / selectedSprint.total_issues) * 100)
                  : 0}
                % complete
              </span>
              <span>·</span>
              <span className="text-destructive font-medium">
                {selectedSprint.blocked_issues} blockers
              </span>
              <span>·</span>
              <span>Burndown: {selectedSprint.burndown_trend}</span>
            </div>
          )}
        </div>
      </div>

      {/* Transcript Source */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Transcript Source
        </label>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
          className="border-2 border-dashed border-border/50 hover:border-primary/50 rounded-xl p-6 text-center bg-surface-1/20 transition-colors flex flex-col items-center justify-center gap-2"
        >
          <UploadCloud className="w-8 h-8 text-muted-foreground" />
          <div className="text-sm font-medium text-foreground">
            Drop audio (.mp3, .wav, .m4a) or .txt transcript here
          </div>
          <p className="text-xs text-muted-foreground">
            Audio is transcribed locally. Transcript stays entirely on your machine.
          </p>
          <div className="flex items-center gap-3 mt-2">
            <label className="cursor-pointer">
              <span className="inline-flex items-center justify-center h-8 px-3 rounded-md bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors">
                Browse file
              </span>
              <input
                type="file"
                accept=".txt,audio/*"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                className="hidden"
              />
            </label>
          </div>
          {audioFileName && (
            <div className="mt-2 text-xs text-primary font-medium flex items-center gap-1.5 bg-primary/10 px-2.5 py-1 rounded-md">
              <CheckCircle2 size={13} /> Loaded: {audioFileName}
            </div>
          )}
        </div>
      </div>

      {/* Transcript Textarea */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Transcript (editable)
        </label>
        <textarea
          value={transcriptText}
          onChange={(e) => {
            setTranscriptText(e.target.value);
            setSourceKind("paste");
          }}
          placeholder="Paste or edit the retrospective discussion transcript here..."
          rows={10}
          className="w-full rounded-xl border border-border/60 bg-background p-4 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
        />
      </div>

      {/* Local Model Status / Warning */}
      {!isCheckingModel && modelStatus && !modelStatus.available && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <h4 className="font-semibold text-amber-600 dark:text-amber-400">
              No local reasoning model selected
            </h4>
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              Retrospective analysis runs entirely on your machine, so it needs a locally installed model. Gemini (BYOK) is explicitly not used here to protect sensitive retro data.
            </p>
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenSettings}
                className="h-7 text-xs border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 gap-1.5"
              >
                <Settings size={12} /> Open model settings
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Model Info & Action Button */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Sparkles size={14} className="text-primary" />
          <span>
            Model:{" "}
            <strong className="text-foreground font-medium">
              {modelStatus?.modelId || "Qwen2.5 7B (local)"}
            </strong>
          </span>
        </div>

        {!isAnalyzing ? (
          <Button
            onClick={handleStartAnalysis}
            disabled={!modelStatus?.available || !transcriptText.trim()}
            className="w-full sm:w-auto h-10 px-6 font-medium gap-2 shadow-sm"
          >
            <Sparkles size={16} /> Analyze retrospective
          </Button>
        ) : (
          <div className="w-full rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
                <span className="text-sm font-semibold text-foreground">
                  Analyzing retrospective…
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelAnalysis}
                className="h-7 text-xs text-destructive hover:bg-destructive/10"
              >
                Cancel
              </Button>
            </div>
            {progressState && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {progressState.stage === "parsing" ? "Repairing JSON schema..." : "Processing chunk"}
                  </span>
                  <span>
                    Chunk {progressState.chunkIndex || 1} of {progressState.chunkCount || 1}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-border/40 overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{
                      width: `${Math.round(
                        ((progressState.chunkIndex || 1) / (progressState.chunkCount || 1)) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground italic">
              Dictation cleanup is paused while this runs.
            </p>
          </div>
        )}
      </div>

      {/* Edit Sprint Metrics Modal */}
      {showEditSprintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Edit Sprint Metrics</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowEditSprintModal(false)}
              >
                <X size={14} />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-muted-foreground">Committed Points</label>
                <input
                  type="number"
                  value={editSprintData.committed_points || 0}
                  onChange={(e) =>
                    setEditSprintData({ ...editSprintData, committed_points: Number(e.target.value) })
                  }
                  className="w-full h-8 px-2 mt-1 rounded border border-border bg-surface-1 text-sm"
                />
              </div>
              <div>
                <label className="text-muted-foreground">Completed Points</label>
                <input
                  type="number"
                  value={editSprintData.completed_points || 0}
                  onChange={(e) =>
                    setEditSprintData({ ...editSprintData, completed_points: Number(e.target.value) })
                  }
                  className="w-full h-8 px-2 mt-1 rounded border border-border bg-surface-1 text-sm"
                />
              </div>
              <div>
                <label className="text-muted-foreground">Total Issues</label>
                <input
                  type="number"
                  value={editSprintData.total_issues || 0}
                  onChange={(e) =>
                    setEditSprintData({ ...editSprintData, total_issues: Number(e.target.value) })
                  }
                  className="w-full h-8 px-2 mt-1 rounded border border-border bg-surface-1 text-sm"
                />
              </div>
              <div>
                <label className="text-muted-foreground">Completed Issues</label>
                <input
                  type="number"
                  value={editSprintData.completed_issues || 0}
                  onChange={(e) =>
                    setEditSprintData({ ...editSprintData, completed_issues: Number(e.target.value) })
                  }
                  className="w-full h-8 px-2 mt-1 rounded border border-border bg-surface-1 text-sm"
                />
              </div>
              <div>
                <label className="text-muted-foreground">Blocked Issues</label>
                <input
                  type="number"
                  value={editSprintData.blocked_issues || 0}
                  onChange={(e) =>
                    setEditSprintData({ ...editSprintData, blocked_issues: Number(e.target.value) })
                  }
                  className="w-full h-8 px-2 mt-1 rounded border border-border bg-surface-1 text-sm"
                />
              </div>
              <div>
                <label className="text-muted-foreground">Burndown Trend</label>
                <select
                  value={editSprintData.burndown_trend || "on_track"}
                  onChange={(e) =>
                    setEditSprintData({ ...editSprintData, burndown_trend: e.target.value })
                  }
                  className="w-full h-8 px-2 mt-1 rounded border border-border bg-surface-1 text-sm"
                >
                  <option value="on_track">on_track</option>
                  <option value="behind trend">behind trend</option>
                  <option value="ahead of trend">ahead of trend</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Blockers Description</label>
              <textarea
                value={editSprintData.blockers || ""}
                onChange={(e) => setEditSprintData({ ...editSprintData, blockers: e.target.value })}
                rows={2}
                className="w-full p-2 mt-1 rounded border border-border bg-surface-1 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowEditSprintModal(false)}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveSprintMetrics}>
                Save Metrics
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
