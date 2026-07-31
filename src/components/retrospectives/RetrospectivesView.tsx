import React, { useState, useEffect } from "react";
import {
  type SprintSnapshot,
  type Retrospective,
  retroClient,
} from "../../services/retro/client";
import RetrospectiveIntake from "./RetrospectiveIntake";
import RetrospectiveReview from "./RetrospectiveReview";
import RetrospectiveDashboard from "./RetrospectiveDashboard";
import { Sparkles, CheckSquare, FilePlus } from "lucide-react";
import { cn } from "../lib/utils";

interface RetrospectivesViewProps {
  onOpenSettings: () => void;
}

export type RetroStage = "intake" | "review" | "dashboard";

export default function RetrospectivesView({ onOpenSettings }: RetrospectivesViewProps) {
  const [stage, setStage] = useState<RetroStage>("intake");
  const [sprints, setSprints] = useState<SprintSnapshot[]>([]);
  const [currentRetroId, setCurrentRetroId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchSprints = async () => {
    try {
      const list = await retroClient.listSprints();
      setSprints(list);
    } catch (err) {
      console.error("Failed to list sprints", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSprints();
  }, []);

  const handleAnalysisSuccess = (retroId: string) => {
    setCurrentRetroId(retroId);
    setStage("review");
  };

  const handleReanalyze = () => {
    setStage("intake");
  };

  const currentSprint = sprints.find((s) => s.id === currentRetroId) || sprints[0] || null;

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-y-auto">
      {/* View Stage Header Tabs */}
      <div className="shrink-0 border-b border-border/40 bg-surface-1/30 px-6 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-primary" />
          <span className="font-semibold text-sm text-foreground">Retrospective Analyst</span>
        </div>

        <div className="flex items-center gap-1 bg-surface-1 p-1 rounded-lg border border-border/50">
          <button
            onClick={() => setStage("intake")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors",
              stage === "intake"
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <FilePlus size={13} /> Intake
          </button>
          <button
            onClick={() => setStage("review")}
            disabled={!currentRetroId}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors",
              stage === "review"
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            <Sparkles size={13} /> Proposal Review
          </button>
          <button
            onClick={() => setStage("dashboard")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors",
              stage === "dashboard"
                ? "bg-background text-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <CheckSquare size={13} /> Action Dashboard
          </button>
        </div>
      </div>

      {/* Stage Views */}
      <div className="flex-1 py-4">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : stage === "intake" ? (
          <RetrospectiveIntake
            sprints={sprints}
            onSprintUpdate={fetchSprints}
            onAnalysisSuccess={handleAnalysisSuccess}
            onOpenSettings={onOpenSettings}
          />
        ) : stage === "review" && currentRetroId ? (
          <RetrospectiveReview
            retrospectiveId={currentRetroId}
            sprint={currentSprint}
            onGoToDashboard={() => setStage("dashboard")}
            onReanalyze={handleReanalyze}
          />
        ) : (
          <RetrospectiveDashboard sprints={sprints} />
        )}
      </div>
    </div>
  );
}
