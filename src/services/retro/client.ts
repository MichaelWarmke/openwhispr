export interface SprintSnapshot {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  committed_points: number;
  completed_points: number;
  total_issues: number;
  completed_issues: number;
  blocked_issues: number;
  burndown_trend: string;
  velocity: number;
  blockers: string;
  is_user_edited: number;
}

export interface Retrospective {
  id: string;
  title: string;
  sprint_id: string;
  transcript: string;
  source_kind: "audio" | "text" | "paste";
  audio_path: string | null;
  meeting_owner?: string | null;
  pending_proposals_count?: number;
  processing_state: "idle" | "transcribing" | "analyzing" | "review" | "completed";
  analysis_run_count: number;
  created_at: string;
  updated_at: string;
}

export interface RetroProposal {
  id: string;
  retrospective_id: string;
  title: string;
  description: string;
  basis: string | null;
  source: "explicit" | "coach";
  state: "pending" | "accepted" | "dismissed" | "superseded";
  dedup_key: string;
  analysis_run: number;
  suggested_owner?: string | null;
  suggested_estimate_value?: number | null;
  suggested_estimate_unit?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrackedAction {
  id: string;
  proposal_id: string | null;
  retrospective_id: string | null;
  sprint_id: string;
  title: string;
  description: string;
  original_title: string | null;
  original_description: string | null;
  source: "explicit" | "coach" | "manual";
  owner: string;
  owner_normalized: string;
  estimate_value: number;
  estimate_unit: string;
  estimate_minutes: number;
  status: "open" | "completed";
  jira_key: string | null;
  jira_creation_state: string | null;
  jira_payload_snapshot: string | null;
  created_at: string;
  updated_at: string;
}

export interface MockJiraTicketResult {
  jira_key: string;
  jira_creation_state: string;
  jira_payload_snapshot: any;
}

export interface RetroAnalysisProgress {
  retrospectiveId: string;
  stage: "transcribing" | "analyzing" | "parsing" | "completed" | "error";
  chunkIndex?: number;
  chunkCount?: number;
  error?: string;
}

export interface ModelDescribeResult {
  available: boolean;
  modelId: string | null;
  providerId: "local" | string;
  contextLength: number;
}


async function invoke<T>(op: string, payload?: any): Promise<T> {
  if (!window.electronAPI?.retro?.invoke) {
    throw new Error("Electron retro IPC bridge unavailable");
  }
  return window.electronAPI.retro.invoke(op, payload);
}

export const retroClient = {
  // Sprint operations
  listSprints: () => invoke<SprintSnapshot[]>("sprints.list"),
  getSprint: (sprintId: string) => invoke<SprintSnapshot | null>("sprints.get", { sprintId }),
  updateSprintMetrics: (sprintId: string, metrics: Partial<SprintSnapshot>) =>
    invoke<SprintSnapshot>("sprints.updateMetrics", { sprintId, metrics }),

  // Retrospective operations
  createRetro: (data: {
    sprintId: string;
    title?: string;
    transcript: string;
    sourceKind: "audio" | "text" | "paste";
    audioPath?: string;
    meetingOwner?: string;
  }) => invoke<Retrospective>("retro.create", data),
  getRetro: (id: string) => invoke<Retrospective | null>("retro.get", { id }),
  updateRetro: (id: string, updates: Partial<Retrospective>) =>
    invoke<Retrospective>("retro.update", { id, updates }),
  listRetros: () => invoke<Retrospective[]>("retro.list"),

  // Analysis operations
  describeModel: (payload?: any) => invoke<ModelDescribeResult>("models.describe", payload),
  runAnalysis: (retrospectiveId: string) => invoke<RetroProposal[]>("analysis.run", { retrospectiveId }),
  cancelAnalysis: (retrospectiveId: string) =>
    window.electronAPI?.retro?.cancelAnalysis(retrospectiveId),
  onAnalysisProgress: (callback: (data: RetroAnalysisProgress) => void) =>
    window.electronAPI?.retro?.onProgress(callback) ?? (() => {}),

  // Proposals operations
  listProposals: (retrospectiveId: string) =>
    invoke<RetroProposal[]>("proposals.list", { retrospectiveId }),
  acceptProposal: (
    proposalId: string,
    editedData?: {
      title?: string;
      description?: string;
      owner?: string;
      estimate_value?: number;
      estimate_unit?: string;
    }
  ) => invoke<TrackedAction>("proposals.accept", { proposalId, editedData }),
  dismissProposal: (proposalId: string) => invoke<boolean>("proposals.dismiss", { proposalId }),

  // Tracked Actions operations
  listActions: (filters?: { status?: string; owner?: string; sprintId?: string; sprintIds?: string[] }) =>
    invoke<TrackedAction[]>("actions.list", filters),
  createManualAction: (data: {
    sprintId: string;
    title: string;
    description?: string;
    owner?: string;
    estimate_value?: number;
    estimate_unit?: string;
  }) => invoke<TrackedAction>("actions.createManual", data),
  updateAction: (id: string, updates: Partial<TrackedAction>) =>
    invoke<TrackedAction>("actions.update", { id, updates }),
  deleteAction: (id: string) => invoke<boolean>("actions.delete", { id }),
  listOwners: () => invoke<string[]>("actions.listOwners"),

  // Mock Jira operations
  createMockJiraTicket: (trackedActionId: string, summary?: string, description?: string) =>
    invoke<MockJiraTicketResult>("jira.createMock", { trackedActionId, summary, description }),

  // Audio copy helper
  copyRetroAudio: (sourcePath: string, retrospectiveId: string) =>
    invoke<{ copiedPath: string }>("retro.copyAudio", { sourcePath, retrospectiveId }),
};
