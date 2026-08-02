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
  CheckSquare,
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
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Re-analyze Confirmation Modal state
  const [showReanalyzeConfirm, setShowReanalyzeConfirm] = useState<boolean>(false);

  const fetchProposals = async () => {
    setIsLoading(true);
    try {
      const list = await retroClient.listProposals(retrospectiveId);
      setProposals(list);
    } catch (err) {
      console.error("Failed to load proposals", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProposals();
  }, [retrospectiveId]);

  const handleAccept = async (id: string) => {
    try {
      await retroClient.acceptProposal(id);
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
        </div>
      </div>

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
              <div className="pl-6">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onGoToDashboard}
                  className="h-8 text-xs gap-1.5"
                >
                  <CheckSquare size={13} /> Go to Action Dashboard
                </Button>
              </div>
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
                          size="icon"
                          variant="outline"
                          title="Accept action"
                          aria-label="Accept action"
                          onClick={() => handleAccept(p.id)}
                          className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                        >
                          <CheckCircle size={16} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Dismiss proposal"
                          aria-label="Dismiss proposal"
                          onClick={() => handleDismiss(p.id)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          <XCircle size={16} />
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
                          size="icon"
                          variant="outline"
                          title="Accept action"
                          aria-label="Accept action"
                          onClick={() => handleAccept(p.id)}
                          className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                        >
                          <CheckCircle size={16} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Dismiss proposal"
                          aria-label="Dismiss proposal"
                          onClick={() => handleDismiss(p.id)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          <XCircle size={16} />
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
