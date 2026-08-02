import React, { useState, useEffect } from "react";
import {
  type TrackedAction,
  type SprintSnapshot,
  retroClient,
} from "../../services/retro/client";
import { getCarriedOverActions } from "../../utils/retroActionUtils";
import {
  Plus,
  Filter,
  CheckCircle,
  Clock,
  ExternalLink,
  MoreHorizontal,
  Trash2,
  Eye,
  AlertTriangle,
  X,
  Layers,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Calendar,
  Edit3,
} from "lucide-react";
import { Button } from "../ui/button";

interface RetrospectiveDashboardProps {
  sprints: SprintSnapshot[];
}

export default function RetrospectiveDashboard({ sprints }: RetrospectiveDashboardProps) {
  const [actions, setActions] = useState<TrackedAction[]>([]);
  const [owners, setOwners] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [sprintFilter, setSprintFilter] = useState<string>("all");

  // Open sprint accordions state: current sprint (sprints[0]?.id) open by default
  const [expandedSprintIds, setExpandedSprintIds] = useState<Set<string>>(
    () => new Set([sprints[0]?.id || "sprint-24", "carried-over"])
  );

  // Manual Add Modal state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [manualSprintId, setManualSprintId] = useState<string>(sprints[0]?.id || "sprint-24");
  const [manualTitle, setManualTitle] = useState<string>("");
  const [manualDescription, setManualDescription] = useState<string>("");
  const [manualOwner, setManualOwner] = useState<string>("");
  const [manualEstimateValue, setManualEstimateValue] = useState<number>(2);
  const [manualEstimateUnit, setManualEstimateUnit] = useState<string>("hours");

  // Jira Ticket Modal state
  const [jiraAction, setJiraAction] = useState<TrackedAction | null>(null);
  const [jiraSummary, setJiraSummary] = useState<string>("");
  const [jiraDescription, setJiraDescription] = useState<string>("");

  // Provenance / Original AI Text Modal state
  const [provenanceAction, setProvenanceAction] = useState<TrackedAction | null>(null);

  // Active menu dropdown action ID
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const filters: any = {};
      if (statusFilter !== "all") filters.status = statusFilter;
      if (ownerFilter !== "all") filters.owner = ownerFilter;
      if (sprintFilter !== "all") filters.sprintId = sprintFilter;

      const list = await retroClient.listActions(filters);
      setActions(list);
      const ownerList = await retroClient.listOwners();
      setOwners(ownerList);
    } catch (err) {
      console.error("Failed to load dashboard data", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [statusFilter, ownerFilter, sprintFilter]);

  const toggleSprintAccordion = (sprintId: string) => {
    setExpandedSprintIds((prev) => {
      const next = new Set(prev);
      if (next.has(sprintId)) {
        next.delete(sprintId);
      } else {
        next.add(sprintId);
      }
      return next;
    });
  };

  const sprintOrdering = [...sprints].sort((a, b) => (a.start_date > b.start_date ? 1 : -1)).map((s) => s.id);
  const currentSprintId = sprints[0]?.id || "sprint-24";
  const carriedOverActions = getCarriedOverActions(actions, currentSprintId, sprintOrdering);

  const openCount = actions.filter((a) => a.status === "open").length;
  const completedCount = actions.filter((a) => a.status === "completed").length;

  const handleUpdateTitleDescription = async (id: string, title: string, description: string) => {
    try {
      await retroClient.updateAction(id, { title, description });
      fetchDashboardData();
    } catch (err) {
      console.error("Failed to update action title/description", err);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: "open" | "completed") => {
    try {
      await retroClient.updateAction(id, { status: newStatus });
      fetchDashboardData();
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  const handleUpdateOwner = async (id: string, newOwner: string) => {
    try {
      await retroClient.updateAction(id, { owner: newOwner });
      fetchDashboardData();
    } catch (err) {
      console.error("Failed to update owner", err);
    }
  };

  const handleUpdateEstimate = async (id: string, value: number, unit: string) => {
    try {
      await retroClient.updateAction(id, { estimate_value: value, estimate_unit: unit });
      fetchDashboardData();
    } catch (err) {
      console.error("Failed to update estimate", err);
    }
  };

  const handleDeleteAction = async (id: string) => {
    try {
      await retroClient.deleteAction(id);
      setActiveMenuId(null);
      fetchDashboardData();
    } catch (err) {
      console.error("Failed to delete action", err);
    }
  };

  const handleCreateManualAction = async () => {
    if (!manualTitle.trim()) return;
    try {
      await retroClient.createManualAction({
        sprintId: manualSprintId,
        title: manualTitle,
        description: manualDescription,
        owner: manualOwner,
        estimate_value: manualEstimateValue,
        estimate_unit: manualEstimateUnit,
      });
      setShowAddModal(false);
      setManualTitle("");
      setManualDescription("");
      setManualOwner("");
      fetchDashboardData();
    } catch (err) {
      console.error("Failed to create manual action", err);
    }
  };

  const handleOpenJiraModal = (a: TrackedAction) => {
    setJiraAction(a);
    setJiraSummary(a.title);
    setJiraDescription(a.description || `Retrospective action item from ${a.sprint_id}`);
  };

  const handleConfirmJiraTicket = async () => {
    if (!jiraAction) return;
    try {
      await retroClient.createMockJiraTicket(jiraAction.id, jiraSummary, jiraDescription);
      setJiraAction(null);
      fetchDashboardData();
    } catch (err) {
      console.error("Failed to create mock Jira ticket", err);
    }
  };

  const isJiraStale = (action: TrackedAction): boolean => {
    if (!action.jira_key || !action.jira_payload_snapshot) return false;
    try {
      const snap = JSON.parse(action.jira_payload_snapshot);
      return (
        snap.summary !== action.title ||
        snap.owner !== action.owner ||
        snap.estimateValue !== action.estimate_value ||
        snap.estimateUnit !== action.estimate_unit
      );
    } catch {
      return false;
    }
  };

  const sortedSprints = [...sprints];
  const filteredSprints = sprintFilter === "all"
    ? sortedSprints
    : sortedSprints.filter((s) => s.id === sprintFilter);

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-6">
      {/* Top Header & Metrics Summary */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Action Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            Track accepted retro items across sprints to completion.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5 bg-surface-1 px-3 py-1.5 rounded-lg border border-border/50">
            <span className="font-semibold text-foreground">Open</span>
            <span className="bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded">
              {openCount}
            </span>
          </div>
          <div className="flex items-center gap-1.5 bg-surface-1 px-3 py-1.5 rounded-lg border border-border/50">
            <span className="font-semibold text-foreground">Completed</span>
            <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold px-1.5 py-0.5 rounded">
              {completedCount}
            </span>
          </div>
          <div className="flex items-center gap-1.5 bg-surface-1 px-3 py-1.5 rounded-lg border border-border/50">
            <span className="font-semibold text-foreground">Carried over</span>
            <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold px-1.5 py-0.5 rounded">
              {carriedOverActions.length}
            </span>
          </div>
        </div>
      </div>

      <datalist id="dashboard-owners-list">
        {owners.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-1/40 p-3 rounded-xl border border-border/50">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground mr-1">
            <Filter size={13} />
            <span className="font-medium uppercase tracking-wider">Filters:</span>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 px-2.5 rounded-md border border-border/60 bg-background text-xs"
          >
            <option value="all">Status: All</option>
            <option value="open">Status: Open</option>
            <option value="completed">Status: Completed</option>
          </select>

          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="h-8 px-2.5 rounded-md border border-border/60 bg-background text-xs"
          >
            <option value="all">Owner: All</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                Owner: {o}
              </option>
            ))}
          </select>

          <select
            value={sprintFilter}
            onChange={(e) => setSprintFilter(e.target.value)}
            className="h-8 px-2.5 rounded-md border border-border/60 bg-background text-xs"
          >
            <option value="all">Sprint: All</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <Button
          size="sm"
          onClick={() => setShowAddModal(true)}
          className="h-8 text-xs font-medium gap-1.5"
        >
          <Plus size={14} /> Add action
        </Button>
      </div>

      {/* Carried Over Accordion Group */}
      {carriedOverActions.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden shadow-sm">
          <button
            onClick={() => toggleSprintAccordion("carried-over")}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-amber-500/10 transition-colors"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400">
              {expandedSprintIds.has("carried-over") ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
              <AlertTriangle size={15} />
              <span>Carried over from previous sprints</span>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300">
              {carriedOverActions.length} open {carriedOverActions.length === 1 ? "item" : "items"}
            </span>
          </button>

          {expandedSprintIds.has("carried-over") && (
            <div className="p-4 pt-0 space-y-3 border-t border-amber-500/20">
              {carriedOverActions.map((action) => (
                <ActionCard
                  key={action.id}
                  action={action}
                  sprints={sprints}
                  activeMenuId={activeMenuId}
                  setActiveMenuId={setActiveMenuId}
                  onUpdateStatus={handleUpdateStatus}
                  onUpdateTitleDescription={handleUpdateTitleDescription}
                  onUpdateOwner={handleUpdateOwner}
                  onUpdateEstimate={handleUpdateEstimate}
                  onDelete={handleDeleteAction}
                  onOpenJira={handleOpenJiraModal}
                  onOpenProvenance={setProvenanceAction}
                  isStale={isJiraStale(action)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sprint Accordion List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Loading actions...
          </div>
        ) : actions.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <Layers className="w-8 h-8 text-muted-foreground mx-auto opacity-50" />
            <p className="text-sm font-medium text-foreground">No tracked actions found</p>
            <p className="text-xs text-muted-foreground">
              Accept proposals from a retrospective review or add an action manually.
            </p>
          </div>
        ) : (
          filteredSprints.map((sprint) => {
            const sprintActions = actions.filter((a) => a.sprint_id === sprint.id);
            const isExpanded = expandedSprintIds.has(sprint.id);
            const isCurrentSprint = sprint.id === currentSprintId;
            const openInSprint = sprintActions.filter((a) => a.status === "open").length;
            const completedInSprint = sprintActions.filter((a) => a.status === "completed").length;

            return (
              <div
                key={sprint.id}
                className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm transition-all"
              >
                {/* Sprint Accordion Header */}
                <button
                  onClick={() => toggleSprintAccordion(sprint.id)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-surface-1/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-muted-foreground">
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-foreground">{sprint.name}</h3>
                        {isCurrentSprint && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-primary/10 text-primary">
                            Current Sprint
                          </span>
                        )}
                      </div>
                      {sprint.start_date && (
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                          <Calendar size={12} />
                          <span>
                            {sprint.start_date} — {sprint.end_date || "Present"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-md bg-surface-1 font-semibold text-muted-foreground">
                      {sprintActions.length} {sprintActions.length === 1 ? "action" : "actions"} (
                      <span className="text-primary">{openInSprint} open</span>,{" "}
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {completedInSprint} done
                      </span>
                      )
                    </span>
                  </div>
                </button>

                {/* Sprint Accordion Body */}
                {isExpanded && (
                  <div className="p-4 pt-2 border-t border-border/30 space-y-3 bg-surface-1/20">
                    {sprintActions.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic py-3 text-center">
                        No action items recorded for this sprint.
                      </p>
                    ) : (
                      sprintActions.map((action) => (
                        <ActionCard
                          key={action.id}
                          action={action}
                          sprints={sprints}
                          activeMenuId={activeMenuId}
                          setActiveMenuId={setActiveMenuId}
                          onUpdateStatus={handleUpdateStatus}
                          onUpdateTitleDescription={handleUpdateTitleDescription}
                          onUpdateOwner={handleUpdateOwner}
                          onUpdateEstimate={handleUpdateEstimate}
                          onDelete={handleDeleteAction}
                          onOpenJira={handleOpenJiraModal}
                          onOpenProvenance={setProvenanceAction}
                          isStale={isJiraStale(action)}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Manual Action Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-background p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Add Tracked Action</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowAddModal(false)}
              >
                <X size={14} />
              </Button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-muted-foreground">Sprint</label>
                <select
                  value={manualSprintId}
                  onChange={(e) => setManualSprintId(e.target.value)}
                  className="w-full h-8 px-2.5 mt-1 rounded border border-border bg-surface-1 text-sm text-foreground focus:outline-none"
                >
                  {sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-medium text-muted-foreground">Title *</label>
                <input
                  type="text"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="e.g. Write onboarding runbook"
                  className="w-full h-8 px-2.5 mt-1 rounded border border-border bg-surface-1 text-sm text-foreground focus:outline-none"
                />
              </div>

              <div>
                <label className="font-medium text-muted-foreground">Description</label>
                <textarea
                  value={manualDescription}
                  onChange={(e) => setManualDescription(e.target.value)}
                  placeholder="Action details..."
                  rows={3}
                  className="w-full p-2.5 mt-1 rounded border border-border bg-surface-1 text-xs text-foreground focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-muted-foreground">Owner</label>
                  <input
                    type="text"
                    list="dashboard-owners-list"
                    value={manualOwner}
                    onChange={(e) => setManualOwner(e.target.value)}
                    placeholder="e.g. Alex"
                    className="w-full h-8 px-2.5 mt-1 rounded border border-border bg-surface-1 text-sm text-foreground focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-medium text-muted-foreground">Estimate</label>
                  <div className="flex gap-1.5 mt-1">
                    <input
                      type="number"
                      min={0}
                      value={manualEstimateValue}
                      onChange={(e) => setManualEstimateValue(Number(e.target.value))}
                      className="w-20 h-8 px-2 rounded border border-border bg-surface-1 text-sm text-foreground"
                    />
                    <select
                      value={manualEstimateUnit}
                      onChange={(e) => setManualEstimateUnit(e.target.value)}
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
              <Button variant="outline" size="sm" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreateManualAction} disabled={!manualTitle.trim()}>
                Add Action
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Mock Jira Ticket Modal */}
      {jiraAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-background p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="text-base font-semibold">Create Jira Ticket</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setJiraAction(null)}
              >
                <X size={14} />
              </Button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-muted-foreground">Summary</label>
                <input
                  type="text"
                  value={jiraSummary}
                  onChange={(e) => setJiraSummary(e.target.value)}
                  className="w-full h-8 px-2.5 mt-1 rounded border border-border bg-surface-1 text-sm text-foreground"
                />
              </div>

              <div>
                <label className="font-medium text-muted-foreground">Description</label>
                <textarea
                  value={jiraDescription}
                  onChange={(e) => setJiraDescription(e.target.value)}
                  rows={4}
                  className="w-full p-2.5 mt-1 rounded border border-border bg-surface-1 text-xs text-foreground"
                />
              </div>

              <div className="bg-surface-1/60 p-3 rounded-lg space-y-1 text-muted-foreground">
                <div>
                  <strong className="text-foreground">Sprint:</strong>{" "}
                  {sprints.find((s) => s.id === jiraAction.sprint_id)?.name || jiraAction.sprint_id}
                </div>
                <div>
                  <strong className="text-foreground">Owner:</strong> {jiraAction.owner || "Unassigned"}{" "}
                  · <strong className="text-foreground">Estimate:</strong> {jiraAction.estimate_value}{" "}
                  {jiraAction.estimate_unit}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setJiraAction(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleConfirmJiraTicket}>
                Create mock ticket
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Provenance / Original AI Text Modal */}
      {provenanceAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Original AI Proposal</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setProvenanceAction(null)}
              >
                <X size={14} />
              </Button>
            </div>
            <div className="space-y-2 text-xs">
              <div>
                <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                  Original Title
                </span>
                <p className="text-sm font-medium text-foreground mt-0.5">
                  {provenanceAction.original_title || provenanceAction.title}
                </p>
              </div>
              {provenanceAction.original_description && (
                <div>
                  <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                    Original Description
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {provenanceAction.original_description}
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-end pt-2">
              <Button size="sm" onClick={() => setProvenanceAction(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ActionCardProps {
  action: TrackedAction;
  sprints: SprintSnapshot[];
  activeMenuId: string | null;
  setActiveMenuId: (id: string | null) => void;
  onUpdateStatus: (id: string, status: "open" | "completed") => void;
  onUpdateTitleDescription: (id: string, title: string, description: string) => void;
  onUpdateOwner: (id: string, owner: string) => void;
  onUpdateEstimate: (id: string, val: number, unit: string) => void;
  onDelete: (id: string) => void;
  onOpenJira: (action: TrackedAction) => void;
  onOpenProvenance: (action: TrackedAction) => void;
  isStale: boolean;
}

function ActionCard({
  action,
  sprints,
  activeMenuId,
  setActiveMenuId,
  onUpdateStatus,
  onUpdateTitleDescription,
  onUpdateOwner,
  onUpdateEstimate,
  onDelete,
  onOpenJira,
  onOpenProvenance,
  isStale,
}: ActionCardProps) {
  const isMenuOpen = activeMenuId === action.id;

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [isDescExpanded, setIsDescExpanded] = useState(false);

  const [titleDraft, setTitleDraft] = useState<string>(action.title);
  const [descriptionDraft, setDescriptionDraft] = useState<string>(action.description || "");

  useEffect(() => {
    setTitleDraft(action.title);
    setDescriptionDraft(action.description || "");
  }, [action.title, action.description]);

  const commitTitle = () => {
    setIsEditingTitle(false);
    const trimmedTitle = titleDraft.trim();
    if (!trimmedTitle) {
      setTitleDraft(action.title);
      return;
    }
    if (trimmedTitle !== action.title) {
      onUpdateTitleDescription(action.id, trimmedTitle, descriptionDraft);
    }
  };

  const commitDesc = () => {
    setIsEditingDesc(false);
    if (descriptionDraft !== (action.description || "")) {
      onUpdateTitleDescription(action.id, titleDraft.trim() || action.title, descriptionDraft);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitTitle();
    } else if (e.key === "Escape") {
      setTitleDraft(action.title);
      setIsEditingTitle(false);
    }
  };

  const handleDescKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      setDescriptionDraft(action.description || "");
      setIsEditingDesc(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3 shadow-sm hover:border-border transition-colors relative">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isEditingTitle ? (
              <input
                type="text"
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={handleTitleKeyDown}
                className="text-sm font-semibold text-foreground bg-surface-1 border border-primary px-2 py-0.5 rounded focus:outline-none flex-1 min-w-[200px]"
              />
            ) : (
              <h4
                onClick={() => setIsEditingTitle(true)}
                title="Click to edit title"
                className={`text-sm font-semibold cursor-pointer hover:text-primary transition-colors flex items-center gap-1.5 ${
                  action.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"
                }`}
              >
                <span>{action.title}</span>
                <Edit3 size={12} className="opacity-0 hover:opacity-100 transition-opacity text-muted-foreground" />
              </h4>
            )}

            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-surface-1 text-muted-foreground shrink-0">
              {action.source === "explicit"
                ? "Explicit action"
                : action.source === "coach"
                ? "Coach suggestion"
                : "Manual action"}
            </span>
          </div>

          {/* Description Accordion Section */}
          <div className="pt-1">
            {isEditingDesc ? (
              <div className="space-y-1.5">
                <textarea
                  autoFocus
                  value={descriptionDraft}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
                  onBlur={commitDesc}
                  onKeyDown={handleDescKeyDown}
                  placeholder="Add action description..."
                  rows={Math.max(2, (descriptionDraft.match(/\n/g) || []).length + 1)}
                  className="w-full text-xs text-foreground bg-surface-1 border border-primary p-2.5 rounded-lg focus:outline-none leading-relaxed resize-none"
                />
                <div className="flex justify-end text-[10px] text-muted-foreground">
                  Press Escape to cancel · Click outside to save
                </div>
              </div>
            ) : action.description ? (
              <div className="space-y-1.5">
                <button
                  onClick={() => setIsDescExpanded(!isDescExpanded)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
                >
                  {isDescExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  <span>{isDescExpanded ? "Hide Details" : "View Details"}</span>
                </button>

                {isDescExpanded && (
                  <div className="relative group bg-surface-1/40 border border-border/40 p-3 rounded-lg">
                    <p
                      onClick={() => setIsEditingDesc(true)}
                      title="Click to edit description"
                      className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap cursor-pointer"
                    >
                      {action.description}
                    </p>
                    <button
                      onClick={() => setIsEditingDesc(true)}
                      className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Edit3 size={12} />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => {
                  setIsDescExpanded(true);
                  setIsEditingDesc(true);
                }}
                className="text-xs text-muted-foreground/70 hover:text-foreground italic flex items-center gap-1 transition-colors"
              >
                <Plus size={12} /> Add description...
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <select
            value={action.status}
            onChange={(e) => onUpdateStatus(action.id, e.target.value as "open" | "completed")}
            className={`h-7 px-2 rounded text-xs font-semibold focus:outline-none cursor-pointer ${
              action.status === "completed"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                : "bg-surface-1 text-foreground border border-border/60"
            }`}
          >
            <option value="open">Open</option>
            <option value="completed">Completed</option>
          </select>

          <button
            onClick={() => setActiveMenuId(isMenuOpen ? null : action.id)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-1"
          >
            <MoreHorizontal size={16} />
          </button>

          {isMenuOpen && (
            <div className="absolute right-4 top-10 z-20 w-48 rounded-lg border border-border bg-background shadow-lg py-1 text-xs">
              {action.original_title && (
                <button
                  onClick={() => {
                    setActiveMenuId(null);
                    onOpenProvenance(action);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-1 text-foreground"
                >
                  <Eye size={13} /> View original AI text
                </button>
              )}
              <button
                onClick={() => onDelete(action.id)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-destructive/10 text-destructive font-medium"
              >
                <Trash2 size={13} /> Delete action
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-2 border-t border-border/30">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Owner:</span>
            <input
              type="text"
              list="dashboard-owners-list"
              value={action.owner}
              onChange={(e) => onUpdateOwner(action.id, e.target.value)}
              placeholder="Unassigned"
              className="h-6 px-2 w-28 rounded border border-border/50 bg-surface-1 text-xs text-foreground focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Estimate:</span>
            <input
              type="number"
              min={0}
              value={action.estimate_value}
              onChange={(e) => onUpdateEstimate(action.id, Number(e.target.value), action.estimate_unit)}
              className="h-6 w-14 px-1 rounded border border-border/50 bg-surface-1 text-xs text-foreground"
            />
            <select
              value={action.estimate_unit}
              onChange={(e) => onUpdateEstimate(action.id, action.estimate_value, e.target.value)}
              className="h-6 px-1 rounded border border-border/50 bg-surface-1 text-[11px] text-foreground"
            >
              <option value="minutes">mins</option>
              <option value="hours">hours</option>
              <option value="days">days</option>
              <option value="weeks">weeks</option>
              <option value="story_points">pts</option>
            </select>
          </div>
        </div>

        <div>
          {action.jira_key ? (
            <div className="flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-md">
              <ExternalLink size={12} /> Jira: {action.jira_key}
              {isStale && (
                <span className="text-[10px] font-medium text-amber-500 ml-1">
                  (stale — action edited after creation)
                </span>
              )}
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenJira(action)}
              className="h-7 text-xs border-border/60 hover:bg-surface-1"
            >
              Create Jira Ticket
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
