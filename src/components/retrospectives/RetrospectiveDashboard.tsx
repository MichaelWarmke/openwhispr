import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  type TrackedAction,
  type SprintSnapshot,
  retroClient,
} from "../../services/retro/client";
import { getCarriedOverActions, extractParticipantsFromTranscript } from "../../utils/retroActionUtils";
import {
  Plus,
  Filter,
  Check,
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
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { Button } from "../ui/button";

import { type Retrospective } from "../../services/retro/client";

interface FilterOption {
  value: string;
  label: string;
}

interface TypeaheadFilterSelectProps {
  label: string;
  options: FilterOption[];
  selectedValue: string;
  onSelect: (value: string) => void;
  widthClass?: string;
}

function TypeaheadFilterSelect({
  label,
  options,
  selectedValue,
  onSelect,
  widthClass = "w-32",
}: TypeaheadFilterSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const activeOptionRef = useRef<HTMLButtonElement>(null);

  const selectedOption = options.find((o) => o.value === selectedValue) || options[0];
  const displayLabel = selectedOption?.label || "All";

  // Enabled options matching the query
  const enabledOptions = options.filter(
    (opt) => query.trim() === "" || opt.label.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // When dropdown opens or query changes, reset activeIndex to current selected or 0
  useEffect(() => {
    if (isOpen) {
      const idx = enabledOptions.findIndex((o) => o.value === selectedValue);
      setActiveIndex(idx >= 0 ? idx : 0);
    }
  }, [isOpen, query]);

  // Scroll active item into view when activeIndex changes
  useEffect(() => {
    if (isOpen && activeOptionRef.current) {
      activeOptionRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, isOpen]);

  const handleFocus = () => {
    setIsOpen(true);
    setQuery("");
  };

  const handleOptionClick = (opt: FilterOption) => {
    onSelect(opt.value);
    setIsOpen(false);
    setQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else if (enabledOptions.length > 0) {
        setActiveIndex((prev) => (prev + 1) % enabledOptions.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (isOpen && enabledOptions.length > 0) {
        setActiveIndex((prev) => (prev - 1 + enabledOptions.length) % enabledOptions.length);
      }
    } else if (e.key === "Enter") {
      if (isOpen && enabledOptions.length > 0 && enabledOptions[activeIndex]) {
        e.preventDefault();
        handleOptionClick(enabledOptions[activeIndex]);
      }
    } else if (e.key === "Escape") {
      if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
        setQuery("");
      }
    }
  };

  return (
    <div ref={containerRef} className="relative flex items-center gap-1.5">
      <span className="text-muted-foreground font-medium">{label}</span>
      <div className={`relative ${widthClass}`}>
        <div className="relative flex items-center">
          <input
            type="text"
            value={isOpen ? query : displayLabel}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            placeholder={displayLabel}
            className="h-8 w-full pl-2.5 pr-6 rounded-md border border-border/60 bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary truncate"
          />
          <ChevronDown size={13} className="absolute right-2 text-muted-foreground pointer-events-none" />
        </div>

        {isOpen && (
          <div className="absolute top-full left-0 mt-1 z-30 w-full min-w-[140px] max-h-60 overflow-y-auto rounded-lg border border-border bg-background shadow-xl py-1 text-xs">
            {options.map((opt) => {
              const isSelected = opt.value === selectedValue;
              const matchesQuery = query.trim() === "" || opt.label.toLowerCase().includes(query.toLowerCase());
              const enabledIdx = enabledOptions.findIndex((o) => o.value === opt.value);
              const isActive = matchesQuery && enabledIdx === activeIndex;

              return (
                <button
                  key={opt.value}
                  ref={isActive ? activeOptionRef : null}
                  type="button"
                  onClick={() => matchesQuery && handleOptionClick(opt)}
                  onMouseEnter={() => matchesQuery && enabledIdx >= 0 && setActiveIndex(enabledIdx)}
                  disabled={!matchesQuery}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors ${
                    isActive
                      ? "bg-primary/15 text-primary font-semibold ring-1 ring-primary/30"
                      : isSelected
                      ? "bg-primary/10 text-primary font-semibold"
                      : matchesQuery
                      ? "hover:bg-surface-1 text-foreground"
                      : "opacity-40 text-muted-foreground cursor-not-allowed"
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check size={13} className="shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function parseEstimateText(text: string): { value: number; unit: string } {
  const trimmed = text.trim();
  if (!trimmed) return { value: 0, unit: "hours" };
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (match) {
    const val = parseFloat(match[1]) || 0;
    let rawUnit = match[2].trim().toLowerCase();
    let unit = "hours";
    if (rawUnit.startsWith("min") || rawUnit === "m") unit = "minutes";
    else if (rawUnit.startsWith("hour") || rawUnit.startsWith("hr") || rawUnit === "h") unit = "hours";
    else if (rawUnit.startsWith("day") || rawUnit === "d") unit = "days";
    else if (rawUnit.startsWith("week") || rawUnit.startsWith("wk") || rawUnit === "w") unit = "weeks";
    else if (rawUnit.startsWith("pt") || rawUnit.startsWith("point") || rawUnit.startsWith("story")) unit = "story_points";
    else if (rawUnit) unit = rawUnit;
    return { value: val, unit };
  }
  return { value: 0, unit: "hours" };
}

function formatEstimateText(value: number, unit: string): string {
  if (!value) return "";
  const unitLabelMap: Record<string, string> = {
    minutes: "mins",
    hours: "hours",
    days: "days",
    weeks: "weeks",
    story_points: "pts",
  };
  const unitLabel = unitLabelMap[unit] || unit || "hours";
  return `${value} ${unitLabel}`.trim();
}

interface RetrospectiveDashboardProps {
  sprints: SprintSnapshot[];
  retros?: Retrospective[];
  eligibleSprintIds: string[];
  pendingProposalSprintIds?: string[];
  onNewRetrospective: () => void;
  onReviewSprint?: (sprintId: string) => void;
  activeModal?: string;
}

export default function RetrospectiveDashboard({
  sprints,
  retros,
  eligibleSprintIds,
  pendingProposalSprintIds,
  onNewRetrospective,
  onReviewSprint,
  activeModal,
}: RetrospectiveDashboardProps) {
  const [actions, setActions] = useState<TrackedAction[]>([]);
  const [owners, setOwners] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const eligibleSprints = React.useMemo(() => {
    const set = new Set(eligibleSprintIds);
    retros?.forEach((r) => set.add(r.sprint_id));
    actions.forEach((a) => {
      if (a.sprint_id) set.add(a.sprint_id);
    });
    return sprints.filter((s) => set.has(s.id));
  }, [sprints, eligibleSprintIds, retros, actions]);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [sprintFilter, setSprintFilter] = useState<string>("all");

  // Open sprint accordions state: current sprint open by default
  const [expandedSprintIds, setExpandedSprintIds] = useState<Set<string>>(
    () => new Set([eligibleSprints[0]?.id || "", "carried-over"])
  );

  useEffect(() => {
    if (eligibleSprints.length > 0) {
      setExpandedSprintIds((prev) => {
        if (prev.size === 0 || (prev.size === 1 && prev.has(""))) {
          return new Set([eligibleSprints[0].id, "carried-over"]);
        }
        return prev;
      });
    }
  }, [eligibleSprints]);

  // Manual Add Modal state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [manualSprintId, setManualSprintId] = useState<string>(eligibleSprints[0]?.id || sprints[0]?.id || "sprint-24");
  const [manualTitle, setManualTitle] = useState<string>("");
  const [manualDescription, setManualDescription] = useState<string>("");
  const [manualOwner, setManualOwner] = useState<string>("");
  const [manualEstimateText, setManualEstimateText] = useState<string>("2 hours");

  // Jira Ticket Modal state
  const [jiraAction, setJiraAction] = useState<TrackedAction | null>(null);
  const [jiraSummary, setJiraSummary] = useState<string>("");
  const [jiraDescription, setJiraDescription] = useState<string>("");

  // Provenance / Original AI Text Modal state
  const [provenanceAction, setProvenanceAction] = useState<TrackedAction | null>(null);

  // Active menu dropdown action ID
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Jira refresh loading state
  const [isRefreshingJira, setIsRefreshingJira] = useState<boolean>(false);

  const handleRefreshJiraStatus = async () => {
    setIsRefreshingJira(true);
    try {
      await fetchDashboardData(false);
    } catch (err) {
      console.error("Failed to refresh Jira status", err);
    } finally {
      setTimeout(() => {
        setIsRefreshingJira(false);
      }, 500);
    }
  };

  const fetchDashboardData = async (showSpinner = false) => {
    if (showSpinner) {
      setIsLoading(true);
    }
    try {
      const filters: any = {};
      if (statusFilter !== "all") filters.status = statusFilter;
      if (ownerFilter !== "all") filters.owner = ownerFilter;

      if (sprintFilter !== "all") {
        filters.sprintId = sprintFilter;
      } else {
        filters.sprintIds = eligibleSprintIds;
      }

      const list = await retroClient.listActions(filters);
      setActions(list);
      const ownerList = await retroClient.listOwners();
      const combinedOwnersSet = new Set(ownerList);
      retros?.forEach((r) => {
        if (r.meeting_owner && r.meeting_owner.trim()) combinedOwnersSet.add(r.meeting_owner.trim());
        if (r.transcript) {
          const speakers = extractParticipantsFromTranscript(r.transcript);
          speakers.forEach((s) => combinedOwnersSet.add(s.trim()));
        }
      });
      const combinedOwners = Array.from(combinedOwnersSet).filter((n) => n && n !== "Unassigned");
      combinedOwners.sort((a, b) => a.localeCompare(b));
      setOwners(combinedOwners);

      // Auto-expand sprints that contain action items so accepted items are immediately visible
      setExpandedSprintIds((prev) => {
        const next = new Set(prev);
        list.forEach((a) => {
          if (a.sprint_id) next.add(a.sprint_id);
        });
        if (eligibleSprints[0]?.id) next.add(eligibleSprints[0].id);
        next.add("carried-over");
        return next;
      });
    } catch (err) {
      console.error("Failed to load dashboard data", err);
    } finally {
      if (showSpinner) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchDashboardData(true);
  }, [statusFilter, ownerFilter, sprintFilter, eligibleSprintIds.join(","), activeModal]);

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

  const sprintOrdering = [...eligibleSprints].sort((a, b) => (a.start_date > b.start_date ? 1 : -1)).map((s) => s.id);
  const actualCurrentSprintId = sprints[0]?.id || "sprint-24";
  const carriedOverActions = getCarriedOverActions(actions, actualCurrentSprintId, sprintOrdering);

  const openCount = actions.filter((a) => a.status === "open").length;
  const completedCount = actions.filter((a) => a.status === "completed").length;

  const handleUpdateTitleDescription = async (id: string, title: string, description: string) => {
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, title, description } : a))
    );
    try {
      await retroClient.updateAction(id, { title, description });
      fetchDashboardData(false);
    } catch (err) {
      console.error("Failed to update action title/description", err);
      fetchDashboardData(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: "open" | "completed") => {
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a))
    );
    try {
      await retroClient.updateAction(id, { status: newStatus });
      fetchDashboardData(false);
    } catch (err) {
      console.error("Failed to update status", err);
      fetchDashboardData(false);
    }
  };

  const handleUpdateOwner = async (id: string, newOwner: string) => {
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, owner: newOwner } : a))
    );
    try {
      await retroClient.updateAction(id, { owner: newOwner });
      fetchDashboardData(false);
    } catch (err) {
      console.error("Failed to update owner", err);
      fetchDashboardData(false);
    }
  };

  const handleUpdateEstimate = async (id: string, value: number, unit: string) => {
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, estimate_value: value, estimate_unit: unit } : a))
    );
    try {
      await retroClient.updateAction(id, { estimate_value: value, estimate_unit: unit });
      fetchDashboardData(false);
    } catch (err) {
      console.error("Failed to update estimate", err);
      fetchDashboardData(false);
    }
  };

  const handleDeleteAction = async (id: string) => {
    setActions((prev) => prev.filter((a) => a.id !== id));
    try {
      await retroClient.deleteAction(id);
      setActiveMenuId(null);
      fetchDashboardData(false);
    } catch (err) {
      console.error("Failed to delete action", err);
      fetchDashboardData(false);
    }
  };

  const handleCreateManualAction = async () => {
    if (!manualTitle.trim()) return;
    const { value: estVal, unit: estUnit } = parseEstimateText(manualEstimateText);
    try {
      await retroClient.createManualAction({
        sprintId: manualSprintId,
        title: manualTitle,
        description: manualDescription,
        owner: manualOwner,
        estimate_value: estVal,
        estimate_unit: estUnit,
      });
      setShowAddModal(false);
      setManualTitle("");
      setManualDescription("");
      setManualOwner("");
      setManualEstimateText("2 hours");
      fetchDashboardData(false);
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

  const sortedSprints = [...eligibleSprints];
  const filteredSprints = sprintFilter === "all"
    ? sortedSprints
    : sortedSprints.filter((s) => s.id === sprintFilter);

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-6">
      {/* Top Header & Metrics Summary */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div className="flex items-center gap-3 text-xs">
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

        <Button
          size="sm"
          onClick={onNewRetrospective}
          className="h-8 text-xs font-semibold gap-1.5 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          <Sparkles size={14} /> New Retrospective
        </Button>
      </div>

      <datalist id="dashboard-owners-list">
        {owners.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>

      {/* Empty State when no eligible sprints exist */}
      {eligibleSprints.length === 0 ? (
        <div className="py-16 text-center space-y-4 max-w-md mx-auto bg-surface-1/30 rounded-2xl border border-border/50 p-8 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Sparkles size={24} />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">No retrospectives run yet</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Run a retrospective on a sprint to extract action items, generate AI recommendations, and track items to completion.
            </p>
          </div>
          <Button onClick={onNewRetrospective} size="sm" className="h-9 px-4 text-xs font-semibold gap-2">
            <Sparkles size={14} /> Start New Retrospective
          </Button>
        </div>
      ) : (
        <>
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-1/40 p-3 rounded-xl border border-border/50">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Filter size={13} />
                <span className="font-medium uppercase tracking-wider">Filters:</span>
              </div>

              {/* Status Typeahead */}
              <TypeaheadFilterSelect
                label="Status:"
                selectedValue={statusFilter}
                onSelect={(val) => setStatusFilter(val)}
                widthClass="w-28"
                options={[
                  { value: "all", label: "All" },
                  { value: "open", label: "Open" },
                  { value: "completed", label: "Completed" },
                ]}
              />

              {/* Owner Typeahead */}
              <TypeaheadFilterSelect
                label="Owner:"
                selectedValue={ownerFilter}
                onSelect={(val) => setOwnerFilter(val)}
                widthClass="w-32"
                options={[
                  { value: "all", label: "All" },
                  ...owners.map((o) => ({ value: o, label: o })),
                ]}
              />

              {/* Sprint Typeahead */}
              <TypeaheadFilterSelect
                label="Sprint:"
                selectedValue={sprintFilter}
                onSelect={(val) => setSprintFilter(val)}
                widthClass="w-36"
                options={[
                  { value: "all", label: "All" },
                  ...eligibleSprints.map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshJiraStatus}
                disabled={isRefreshingJira}
                className="h-8 text-xs font-medium gap-1.5 border-border/60 hover:bg-surface-1"
                title="Refresh Jira ticket statuses"
              >
                <RefreshCw size={13} className={isRefreshingJira ? "animate-spin text-primary" : ""} />
                <span>Refresh Tickets</span>
              </Button>
              <Button
                size="sm"
                onClick={() => setShowAddModal(true)}
                className="h-8 text-xs font-medium gap-1.5"
              >
                <Plus size={14} /> Add action
              </Button>
            </div>
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
                  owners={owners}
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
            const isCurrentSprint = sprint.id === actualCurrentSprintId;
            const openInSprint = sprintActions.filter((a) => a.status === "open").length;
            const completedInSprint = sprintActions.filter((a) => a.status === "completed").length;
            const matchingRetros = retros?.filter(
              (r) => r.sprint_id === sprint.id || r.sprint_id?.toLowerCase() === sprint.id.toLowerCase()
            ) || [];
            const hasPendingProposals = matchingRetros.length > 0
              ? matchingRetros.some((r) => (r.pending_proposals_count ?? 0) > 0)
              : (pendingProposalSprintIds && pendingProposalSprintIds.length > 0
                  ? pendingProposalSprintIds.some((id) => id === sprint.id || id.toLowerCase() === sprint.id.toLowerCase())
                  : true);

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

                  <div className="flex items-center gap-3 text-xs">
                    {isExpanded && hasPendingProposals && onReviewSprint && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onReviewSprint(sprint.id);
                        }}
                        className="h-7 text-xs font-semibold gap-1.5 border-primary/30 text-primary hover:bg-primary/10 shadow-2xs"
                      >
                        <Sparkles size={13} /> Actions Review
                      </Button>
                    )}

                    {sprintActions.length === 0 ? (
                      <span className="text-xs font-medium text-muted-foreground/70 italic">
                        0 actions
                      </span>
                    ) : openInSprint === 0 ? (
                      <div className="flex items-center gap-2.5">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold border border-emerald-500/20">
                          <CheckCircle size={13} />
                          <span>Completed</span>
                        </div>
                        <div className="w-16 h-1.5 rounded-full bg-surface-1 overflow-hidden shrink-0">
                          <div className="h-full bg-emerald-500 rounded-full w-full" />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2.5">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                            {openInSprint} open
                          </span>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                            {completedInSprint} done
                          </span>
                        </div>
                        <div className="w-16 h-1.5 rounded-full bg-surface-1 overflow-hidden shrink-0">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{
                              width: `${Math.round((completedInSprint / sprintActions.length) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
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
                          owners={owners}
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
      </>
      )}

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
                  <label className="font-medium text-muted-foreground">Estimated Duration</label>
                  <input
                    type="text"
                    value={manualEstimateText}
                    onChange={(e) => setManualEstimateText(e.target.value)}
                    placeholder="e.g. 2 hours, 30 mins, 5 pts"
                    className="w-full h-8 px-2.5 mt-1 rounded border border-border bg-surface-1 text-sm text-foreground focus:outline-none"
                  />
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
                  · <strong className="text-foreground">Estimated Duration:</strong> {jiraAction.estimate_value}{" "}
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
  owners: string[];
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
  owners,
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
  const [estimateDraft, setEstimateDraft] = useState<string>(() =>
    formatEstimateText(action.estimate_value, action.estimate_unit)
  );

  useEffect(() => {
    setTitleDraft(action.title);
    setDescriptionDraft(action.description || "");
    setEstimateDraft(formatEstimateText(action.estimate_value, action.estimate_unit));
  }, [action.title, action.description, action.estimate_value, action.estimate_unit]);

  const commitEstimate = () => {
    const { value, unit } = parseEstimateText(estimateDraft);
    onUpdateEstimate(action.id, value, unit);
  };

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

  const descContainerRef = useRef<HTMLDivElement>(null);

  const commitDesc = useCallback(() => {
    setIsEditingDesc(false);
    if (descriptionDraft !== (action.description || "")) {
      onUpdateTitleDescription(action.id, titleDraft.trim() || action.title, descriptionDraft);
    }
  }, [action.description, action.id, action.title, descriptionDraft, onUpdateTitleDescription, titleDraft]);

  useEffect(() => {
    if (!isDescExpanded && !isEditingDesc) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (descContainerRef.current && !descContainerRef.current.contains(e.target as Node)) {
        setIsDescExpanded(false);
        if (isEditingDesc) {
          commitDesc();
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDescExpanded, isEditingDesc, commitDesc]);

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
      setIsDescExpanded(false);
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

          {/* Description Section */}
          <div ref={descContainerRef} className="pt-1">
            {isEditingDesc ? (
              <div className="space-y-1.5">
                <textarea
                  autoFocus
                  value={descriptionDraft}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
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
              <div
                onClick={() => setIsDescExpanded((prev) => !prev)}
                title={isDescExpanded ? "Click outside to collapse" : "Click to view full details"}
                className="relative group bg-surface-1/30 hover:bg-surface-1/50 border border-border/30 px-3 py-2 rounded-lg cursor-pointer transition-all"
              >
                <p
                  className={`text-xs text-muted-foreground leading-relaxed transition-colors ${
                    isDescExpanded ? "whitespace-pre-wrap text-foreground" : "line-clamp-1"
                  }`}
                >
                  {action.description}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDescExpanded(true);
                    setIsEditingDesc(true);
                  }}
                  className="absolute top-1.5 right-1.5 p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Edit description"
                >
                  <Edit3 size={12} />
                </button>
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
          {action.jira_key ? (
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider shrink-0 border ${
                action.status === "completed"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  action.status === "completed" ? "bg-emerald-500" : "bg-blue-500 animate-pulse"
                }`}
              />
              <span>Ticket Status: {action.status === "completed" ? "Done" : "In Progress"}</span>
            </div>
          ) : (
            <div className="flex items-center p-0.5 rounded-lg bg-surface-1 border border-border/60 text-xs font-medium select-none shrink-0">
              <button
                type="button"
                onClick={() => onUpdateStatus(action.id, "open")}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  action.status === "open"
                    ? "bg-background text-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Open
              </button>
              <button
                type="button"
                onClick={() => onUpdateStatus(action.id, "completed")}
                className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                  action.status === "completed"
                    ? "bg-emerald-500 text-white font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {action.status === "completed" && <Check size={12} />}
                Completed
              </button>
            </div>
          )}

          <button
            onClick={() => setActiveMenuId(isMenuOpen ? null : action.id)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-1"
          >
            <MoreHorizontal size={16} />
          </button>

          {isMenuOpen && (
            <div className="absolute right-4 top-10 z-20 w-48 rounded-lg border border-border bg-background shadow-lg py-1 text-xs">
              {!action.jira_key && (
                <button
                  onClick={() => {
                    setActiveMenuId(null);
                    onOpenJira(action);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-1 text-foreground"
                >
                  <ExternalLink size={13} /> Create Jira Ticket
                </button>
              )}
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
            <span className="text-muted-foreground font-medium">Owner:</span>
            <select
              value={action.owner || ""}
              onChange={(e) => onUpdateOwner(action.id, e.target.value)}
              className="h-6 px-1.5 rounded border border-border/60 bg-surface-1 text-xs text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer max-w-[150px]"
            >
              <option value="">Unassigned</option>
              {owners.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
              {action.owner && !owners.includes(action.owner) && (
                <option value={action.owner}>{action.owner}</option>
              )}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Estimated Duration:</span>
            <input
              type="text"
              value={estimateDraft}
              onChange={(e) => setEstimateDraft(e.target.value)}
              onBlur={commitEstimate}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
              }}
              placeholder="e.g. 2 hours, 5 pts"
              className="h-6 w-24 px-2 rounded border border-border/50 bg-surface-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {action.jira_key && (
          <div className="flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-md">
            <ExternalLink size={12} /> Jira: {action.jira_key}
            {isStale && (
              <span className="text-[10px] font-medium text-amber-500 ml-1">
                (stale — action edited after creation)
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
