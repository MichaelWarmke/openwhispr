import React, { useState, useEffect } from "react";
import {
  type RetroProposal,
  type SprintSnapshot,
  retroClient,
} from "../../services/retro/client";
import {
  CheckCircle,
  XCircle,
  Edit2,
  RefreshCcw,
  Sparkles,
  Lightbulb,
  MessageSquare,
  AlertTriangle,
  X,
} from "lucide-react";
import { Button } from "../ui/button";

interface RetrospectiveReviewProps {
  retrospectiveId: string;
  sprint: SprintSnapshot | null;
  onGoToDashboard: () => void;
  onReanalyze: () => void;
}

export default function RetrospectiveReview({
  retrospectiveId,
  sprint,
  onGoToDashboard,
  onReanalyze,
}: RetrospectiveReviewProps) {
  const [proposals, setProposals] = useState<RetroProposal[]>([]);
  const [ownersList, setOwnersList] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Edit / Accept Modal state
  const [editingProposal, setEditingProposal] = useState<RetroProposal | null>(null);
  const [editTitle, setEditTitle] = useState<string>("");
  const [editDescription, setEditDescription] = useState<string>("");
  const [editOwner, setEditOwner] = useState<string>("");
  const [editEstimateValue, setEditEstimateValue] = useState<number>(1);
  const [editEstimateUnit, setEditEstimateUnit] = useState<string>("days");

  // Re-analyze Confirmation Modal state
  const [showReanalyzeConfirm, setShowReanalyzeConfirm] = useState<boolean>(false);

  const fetchProposals = async () => {
    setIsLoading(true);
    try {
      const list = await retroClient.listProposals(retrospectiveId);
      setProposals(list);
      const owners = await retroClient.listOwners();
      setOwnersList(owners);
    } catch (err) {
      console.error("Failed to load proposals", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProposals();
  }, [retrospectiveId]);

  const handleOpenAcceptModal = (p: RetroProposal) => {
    setEditingProposal(p);
    setEditTitle(p.title);
    setEditDescription(p.description);
    setEditOwner("");
    setEditEstimateValue(1);
    setEditEstimateUnit("days");
  };

  const handleConfirmAccept = async () => {
    if (!editingProposal) return;
    try {
      await retroClient.acceptProposal(editingProposal.id, {
        title: editTitle,
        description: editDescription,
        owner: editOwner,
        estimate_value: editEstimateValue,
        estimate_unit: editEstimateUnit,
      });
      setEditingProposal(null);
      await fetchProposals();
    } catch (err) {
      console.error("Failed to accept proposal", err);
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await retroClient.dismissProposal(id);
      await fetchProposals();
    } catch (err) {
      console.error("Failed to dismiss proposal", err);
    }
  };

  const explicitProposals = proposals.filter((p) => p.source === "explicit");
  const coachProposals = proposals.filter((p) => p.source === "coach");

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Retrospective Proposal Review
          </h2>
          <p className="text-sm text-muted-foreground">
            {sprint?.name || "Sprint"} · {proposals.length} pending proposals
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowReanalyzeConfirm(true)}
            className="h-8 text-xs gap-1.5"
          >
            <RefreshCcw size={13} /> Re-analyze transcript
          </Button>
          <Button size="sm" onClick={onGoToDashboard} className="h-8 text-xs font-medium">
            View Action Dashboard →
          </Button>
        </div>
      </div>

      <datalist id="owners-datalist">
        {ownersList.map((owner) => (
          <option key={owner} value={owner} />
        ))}
      </datalist>

      {/* Proposals Content */}
      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Loading proposals...
        </div>
      ) : proposals.length === 0 ? (
        <div className="py-12 text-center space-y-3">
          <CheckCircle className="w-10 h-10 text-primary mx-auto opacity-80" />
          <h3 className="text-base font-semibold text-foreground">All proposals reviewed!</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            You have accepted or dismissed all proposals for this retrospective. Head to the Action Dashboard to manage tracked items.
          </p>
          <Button size="sm" onClick={onGoToDashboard} className="h-8 text-xs">
            Go to Action Dashboard
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Explicitly discussed section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <MessageSquare size={16} className="text-primary" />
              <span>Explicitly discussed ({explicitProposals.length})</span>
            </div>

            {explicitProposals.length === 0 ? (
              <p className="text-xs text-muted-foreground italic pl-6">
                No explicit action items found in transcript.
              </p>
            ) : (
              <div className="grid gap-3">
                {explicitProposals.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-xl border border-border/50 bg-card p-4 space-y-2 shadow-sm hover:border-border transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">{p.title}</h4>
                        {p.description && (
                          <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
                        )}
                        <span className="inline-block mt-2 text-[10px] uppercase font-semibold text-muted-foreground/70 bg-surface-1 px-2 py-0.5 rounded">
                          Mentioned in transcript
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => handleOpenAcceptModal(p)}
                          className="h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                          Accept to tracking
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDismiss(p.id)}
                          className="h-7 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Agile coach suggestions section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Lightbulb size={16} className="text-amber-500" />
              <span>Agile-coach suggestions ({coachProposals.length})</span>
            </div>

            {coachProposals.length === 0 ? (
              <p className="text-xs text-muted-foreground italic pl-6">
                No coach suggestions generated for this chunk.
              </p>
            ) : (
              <div className="grid gap-3">
                {coachProposals.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 space-y-2 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">{p.title}</h4>
                        {p.description && (
                          <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
                        )}
                        {p.basis && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-medium">
                            Suggested from: {p.basis}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => handleOpenAcceptModal(p)}
                          className="h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                          Accept to tracking
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDismiss(p.id)}
                          className="h-7 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground italic">
            Suggestions are advisory and are never tracked without acceptance.
          </p>
        </div>
      )}

      {/* Accept & Edit Modal */}
      {editingProposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-background p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Accept Action to Tracking</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setEditingProposal(null)}
              >
                <X size={14} />
              </Button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-muted-foreground">Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full h-8 px-2.5 mt-1 rounded border border-border bg-surface-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="font-medium text-muted-foreground">Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  className="w-full p-2.5 mt-1 rounded border border-border bg-surface-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-muted-foreground">Owner</label>
                  <input
                    type="text"
                    list="owners-datalist"
                    value={editOwner}
                    onChange={(e) => setEditOwner(e.target.value)}
                    placeholder="e.g. Alex"
                    className="w-full h-8 px-2.5 mt-1 rounded border border-border bg-surface-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="font-medium text-muted-foreground">Estimate</label>
                  <div className="flex gap-1.5 mt-1">
                    <input
                      type="number"
                      min={0}
                      value={editEstimateValue}
                      onChange={(e) => setEditEstimateValue(Number(e.target.value))}
                      className="w-20 h-8 px-2 rounded border border-border bg-surface-1 text-sm text-foreground"
                    />
                    <select
                      value={editEstimateUnit}
                      onChange={(e) => setEditEstimateUnit(e.target.value)}
                      className="h-8 px-2 rounded border border-border bg-surface-1 text-xs text-foreground"
                    >
                      <option value="minutes">minutes</option>
                      <option value="hours">hours</option>
                      <option value="days">days</option>
                      <option value="weeks">weeks</option>
                      <option value="story_points">story pts</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingProposal(null)}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleConfirmAccept}>
                Confirm & Track Action
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Re-analyze Confirmation Modal */}
      {showReanalyzeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-2 text-amber-500">
              <AlertTriangle size={20} />
              <h3 className="text-base font-semibold text-foreground">
                Re-analyze this retrospective?
              </h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {proposals.length} pending proposals will be replaced. Already accepted actions are kept intact and will not be proposed again.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowReanalyzeConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setShowReanalyzeConfirm(false);
                  onReanalyze();
                }}
              >
                Re-analyze
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
