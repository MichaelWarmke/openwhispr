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

  const sprintOrdering = [...sprints].sort((a, b) => (a.start_date > b.start_date ? 1 : -1)).map((s) => s.id);
  const currentSprintId = sprints[0]?.id || "sprint-24";
  const carriedOverActions = getCarriedOverActions(actions, currentSprintId, sprintOrdering);

  const openCount = actions.filter((a) => a.status === "open").length;
  const completedCount = actions.filter((a) => a.status === "completed").length;

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

      {/* Carried Over Group */}
      {carriedOverActions.length > 0 && (
        <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400">
            <AlertTriangle size={15} />
            <span>Carried over from previous sprints ({carriedOverActions.length})</span>
          </div>
          <div className="grid gap-3">
            {carriedOverActions.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                sprints={sprints}
                activeMenuId={activeMenuId}
                setActiveMenuId={setActiveMenuId}
                onUpdateStatus={handleUpdateStatus}
                onUpdateOwner={handleUpdateOwner}
                onUpdateEstimate={handleUpdateEstimate}
                onDelete={handleDeleteAction}
                onOpenJira={handleOpenJiraModal}
                onOpenProvenance={setProvenanceAction}
                isStale={isJiraStale(action)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Main Tracked Actions List */}
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
          <div className="grid gap-3">
            {actions.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                sprints={sprints}
                activeMenuId={activeMenuId}
                setActiveMenuId={setActiveMenuId}
                onUpdateStatus={handleUpdateStatus}
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
  onUpdateOwner,
  onUpdateEstimate,
  onDelete,
  onOpenJira,
  onOpenProvenance,
  isStale,
}: ActionCardProps) {
  const sprintName = sprints.find((s) => s.id === action.sprint_id)?.name || action.sprint_id;
  const isMenuOpen = activeMenuId === action.id;

  return (
    <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3 shadow-sm hover:border-border transition-colors relative">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h4
              className={`text-sm font-semibold ${
                action.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"
              }`}
            >
              {action.title}
            </h4>
            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-surface-1 text-muted-foreground">
              {action.source === "explicit"
                ? "Explicit action"
                : action.source === "coach"
                ? "Coach suggestion"
                : "Manual action"}
            </span>
          </div>
          {action.description && (
            <p className="text-xs text-muted-foreground">{action.description}</p>
          )}
          <div className="text-[11px] text-muted-foreground">{sprintName}</div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <select
            value={action.status}
            onChange={(e) => onUpdateStatus(action.id, e.target.value as "open" | "completed")}
            className={`h-7 px-2 rounded text-xs font-semibold focus:outline-none ${
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

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1 border-t border-border/30">
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
