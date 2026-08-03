import React, { useState, useEffect } from "react";
import {
  type SprintSnapshot,
  type Retrospective,
  retroClient,
} from "../../services/retro/client";
import { useAuth } from "../../hooks/useAuth";
import RetrospectiveIntake from "./RetrospectiveIntake";
import RetrospectiveReview from "./RetrospectiveReview";
import RetrospectiveDashboard from "./RetrospectiveDashboard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Sparkles } from "lucide-react";

interface RetrospectivesViewProps {
  onOpenSettings: () => void;
}

export default function RetrospectivesView({ onOpenSettings }: RetrospectivesViewProps) {
  const { user } = useAuth();
  const uploaderIdentity = user?.name?.trim() || user?.email?.trim() || "";

  const [sprints, setSprints] = useState<SprintSnapshot[]>([]);
  const [retros, setRetros] = useState<Retrospective[]>([]);
  const [currentRetroId, setCurrentRetroId] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<"none" | "intake" | "review">("none");
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchData = async () => {
    try {
      const [sprintList, retroList] = await Promise.all([
        retroClient.listSprints(),
        retroClient.listRetros(),
      ]);
      setSprints(sprintList);
      setRetros(retroList);
    } catch (err) {
      console.error("Failed to load retrospectives data", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Derive eligible sprint IDs: only sprints that have been analyzed (have recorded retrospectives)
  const eligibleSprintIds = Array.from(
    new Set(retros.map((r) => r.sprint_id))
  );

  // Derive sprint IDs with pending proposals
  const pendingProposalSprintIds = Array.from(
    new Set(
      retros
        .filter((r) => (r.pending_proposals_count ?? 0) > 0)
        .map((r) => r.sprint_id)
    )
  );

  const handleNewRetrospective = () => {
    setCurrentRetroId(null);
    setActiveModal("intake");
  };

  const handleAnalysisSuccess = async (retroId: string) => {
    await fetchData();
    setCurrentRetroId(retroId);
    setActiveModal("review");
  };

  const handleActionAccepted = async () => {
    await fetchData();
  };

  const handleReanalyze = () => {
    setActiveModal("intake");
  };

  const handleReviewSprint = (sprintId: string) => {
    const retroWithPending = retros.find(
      (r) => r.sprint_id === sprintId && (r.pending_proposals_count ?? 0) > 0
    );
    const retro = retroWithPending || retros
      .filter((r) => r.sprint_id === sprintId)
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];

    if (retro) {
      setCurrentRetroId(retro.id);
      setActiveModal("review");
    }
  };

  const currentSprint = sprints.find((s) => s.id === currentRetroId) || sprints[0] || null;

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-y-auto">
      {/* Retrospective Header */}
      <div className="shrink-0 border-b border-border/40 bg-surface-1/30 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-primary" />
          <span className="font-semibold text-sm text-foreground">Retrospective Analyst</span>
        </div>
      </div>

      {/* Action Dashboard Landing View */}
      <div className="flex-1">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : (
          <RetrospectiveDashboard
            sprints={sprints}
            retros={retros}
            eligibleSprintIds={eligibleSprintIds}
            pendingProposalSprintIds={pendingProposalSprintIds}
            onNewRetrospective={handleNewRetrospective}
            onReviewSprint={handleReviewSprint}
            activeModal={activeModal}
          />
        )}
      </div>

      {/* Intake Modal Dialog */}
      <Dialog open={activeModal === "intake"} onOpenChange={(open) => !open && setActiveModal("none")}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>New Retrospective</DialogTitle>
            <DialogDescription>
              Select a sprint and upload or paste your retrospective transcript for AI analysis.
            </DialogDescription>
          </DialogHeader>
          <RetrospectiveIntake
            sprints={sprints}
            uploaderIdentity={uploaderIdentity}
            onSprintUpdate={fetchData}
            onAnalysisSuccess={handleAnalysisSuccess}
            onOpenSettings={onOpenSettings}
          />
        </DialogContent>
      </Dialog>

      {/* Actions Review Modal Dialog */}
      <Dialog open={activeModal === "review" && !!currentRetroId} onOpenChange={(open) => !open && setActiveModal("none")}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>Actions Review</DialogTitle>
          </DialogHeader>
          {currentRetroId && (
            <RetrospectiveReview
              retrospectiveId={currentRetroId}
              sprint={currentSprint}
              onGoToDashboard={() => setActiveModal("none")}
              onActionAccepted={handleActionAccepted}
              onReanalyze={handleReanalyze}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
