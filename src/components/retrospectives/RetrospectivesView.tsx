import React, { useState, useEffect } from "react";
import {
  type SprintSnapshot,
  type Retrospective,
  type Project,
  retroClient,
} from "../../services/retro/client";
import { useAuth } from "../../hooks/useAuth";
import RetrospectiveIntake from "./RetrospectiveIntake";
import RetrospectiveReview from "./RetrospectiveReview";
import RetrospectiveDashboard from "./RetrospectiveDashboard";
import { CoachDashboard } from "./CoachDashboard";
import { NotificationsView } from "./NotificationsView";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Sparkles, Folder, Plus, Brain, LayoutDashboard, Bell, RotateCcw } from "lucide-react";
import { Button } from "../ui/button";

interface RetrospectivesViewProps {
  onOpenSettings: () => void;
}

export default function RetrospectivesView({ onOpenSettings }: RetrospectivesViewProps) {
  const { user } = useAuth();
  const uploaderIdentity = user?.name?.trim() || user?.email?.trim() || "";

  const [sprints, setSprints] = useState<SprintSnapshot[]>([]);
  const [retros, setRetros] = useState<Retrospective[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);

  const [activeTab, setActiveTab] = useState<"actions" | "coach" | "notifications">("actions");
  const [currentRetroId, setCurrentRetroId] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<"none" | "intake" | "review">("none");
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // New Project modal state
  const [showProjectModal, setShowProjectModal] = useState<boolean>(false);
  const [projectName, setProjectName] = useState<string>("");
  const [projectDescription, setProjectDescription] = useState<string>("");
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);

  const fetchData = async () => {
    try {
      const [sprintList, retroList, projList] = await Promise.all([
        retroClient.listSprints(),
        retroClient.listRetros(),
        retroClient.listProjects(),
      ]);
      setSprints(sprintList);
      setRetros(retroList);
      setProjects(projList || []);
      if (projList && projList.length > 0 && !currentProject) {
        setCurrentProject(projList[0]);
      }
    } catch (err) {
      console.error("Failed to load retrospectives data", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateProject = async () => {
    if (!projectName.trim()) return;
    const generatedProjectId = `PROJ-${projectName.toUpperCase().replace(/[^A-Z0-9]/g, "-")}`;
    try {
      const created = await retroClient.createProject({
        name: projectName,
        project_id: generatedProjectId,
        description: projectDescription,
      });
      setShowProjectModal(false);
      setProjectName("");
      setProjectDescription("");
      await fetchData();
      setCurrentProject(created);
    } catch (err) {
      console.error("Failed to create project", err);
    }
  };

  const handleResetDemoData = async () => {
    setIsResetting(true);
    try {
      await retroClient.resetDemoData();
      setCurrentProject(null);
      setCurrentRetroId(null);
      setActiveModal("none");
      await fetchData();
    } catch (err) {
      console.error("Failed to reset demo data", err);
    } finally {
      setIsResetting(false);
      setShowResetConfirm(false);
    }
  };

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
      {/* Retrospective Header & Project Selector */}
      <div className="shrink-0 border-b border-border/40 bg-surface-1/30 px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            <span className="font-semibold text-sm text-foreground">Retrospective Analyst</span>
          </div>

          {/* Project Selector */}
          <div className="flex items-center gap-1.5 bg-surface-1 border border-border/60 px-2.5 py-1 rounded-lg text-xs">
            <Folder size={14} className="text-muted-foreground" />
            <select
              value={currentProject?.id || ""}
              onChange={(e) => {
                if (e.target.value === "NEW_PROJECT") {
                  setShowProjectModal(true);
                } else {
                  const found = projects.find((p) => p.id === e.target.value);
                  if (found) setCurrentProject(found);
                }
              }}
              className="bg-transparent text-xs font-semibold text-foreground focus:outline-none cursor-pointer"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.project_id})
                </option>
              ))}
              <option value="NEW_PROJECT">+ Create New Project...</option>
            </select>
          </div>
        </div>

        {/* Top-Level Tabs */}
        <div className="flex items-center p-0.5 rounded-lg bg-surface-1 border border-border/50 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab("actions")}
            className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === "actions"
                ? "bg-background text-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutDashboard size={14} /> Action Items
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("notifications")}
            className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === "notifications"
                ? "bg-blue-600 text-white font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Bell size={14} /> Notifications
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("coach")}
            className={`px-3 py-1 rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === "coach"
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Brain size={14} /> Insights
          </button>
        </div>

        {/* Reset Demo Data Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowResetConfirm(true)}
          disabled={isResetting}
          className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-destructive"
        >
          <RotateCcw size={13} className={isResetting ? "animate-spin" : ""} />
          {isResetting ? "Resetting..." : "Reset Demo"}
        </Button>
      </div>

      {/* Main View Content */}
      <div className="flex-1 p-6">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>
        ) : activeTab === "actions" ? (
          <RetrospectiveDashboard
            sprints={sprints}
            retros={retros}
            eligibleSprintIds={eligibleSprintIds}
            pendingProposalSprintIds={pendingProposalSprintIds}
            onNewRetrospective={handleNewRetrospective}
            onReviewSprint={handleReviewSprint}
            activeModal={activeModal}
          />
        ) : activeTab === "coach" ? (
          <CoachDashboard currentProject={currentProject} retrosCount={retros.length} />
        ) : (
          <NotificationsView currentProject={currentProject} onProjectUpdate={fetchData} />
        )}
      </div>

      {/* New Project Modal */}
      <Dialog open={showProjectModal} onOpenChange={setShowProjectModal}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle>Create Team Project</DialogTitle>
            <DialogDescription>
              Create a new team project container. You can configure MCP & Slack notification settings in the Notifications tab.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-foreground">Project Name *</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. Payments Team"
                className="w-full h-8 px-2.5 rounded border border-border/60 bg-surface-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-foreground">Description</label>
              <textarea
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="Brief project description..."
                className="w-full h-20 p-2 rounded border border-border/60 bg-surface-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => setShowProjectModal(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreateProject} disabled={!projectName.trim()}>
                Create Project
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Intake Modal Dialog */}
      <Dialog open={activeModal === "intake"} onOpenChange={(open) => !open && setActiveModal("none")}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>New Retrospective</DialogTitle>
            <DialogDescription>
              Select a sprint, review AI Coach discussion topics, and upload your retro transcript.
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

      {/* Reset Demo Data Confirmation Dialog */}
      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent className="max-w-sm p-6">
          <DialogHeader>
            <DialogTitle>Reset Demo Data</DialogTitle>
            <DialogDescription>
              This will delete all retrospectives, action items, coach topics, and insights, and re-seed the sprint data. Notification settings will be preserved.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={() => setShowResetConfirm(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleResetDemoData}
              disabled={isResetting}
              className="gap-1.5"
            >
              <RotateCcw size={13} className={isResetting ? "animate-spin" : ""} />
              {isResetting ? "Resetting..." : "Reset All Data"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

