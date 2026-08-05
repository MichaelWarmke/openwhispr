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

export interface Project {
  id: string;
  name: string;
  project_id: string;
  slack_channel_id: string;
  description?: string;
  notification_settings?: string | Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

export interface CoachTopic {
  id: string;
  project_id: string;
  sprint_id: string;
  title: string;
  rationale: string;
  category: "metric_driven" | "carryover" | "blind_spot" | "best_practice" | "recurring" | "general";
  priority: number;
  state: "suggested" | "accepted" | "dismissed" | "discussed" | "resolved";
  source_data?: any;
  created_at: string;
  updated_at: string;
}

export interface CoachTopicOutcome {
  id: string;
  topic_id: string;
  retrospective_id: string;
  topic_title?: string;
  topic_category?: string;
  coverage_score: number;
  engagement_depth: "none" | "surface" | "moderate" | "deep";
  speaker_count: number;
  sentiment: "positive" | "negative" | "frustrated" | "neutral" | "mixed";
  produced_actions: number;
  agent_notes?: string;
  relevant_quotes?: string | string[];
  created_at: string;
}

export interface CoachInsight {
  id: string;
  project_id: string;
  insight_type: "recurring_issue" | "improving_trend" | "blind_spot" | "engagement_pattern" | "correlation";
  title: string;
  description: string;
  confidence: number;
  related_sprint_ids?: string | string[];
  is_active: number;
  created_at: string;
}

export interface CoachSlackNotification {
  id: string;
  project_id: string;
  recipient_name: string;
  recipient_slack_id?: string;
  message_type: string;
  message_content: string;
  sent_at: string;
  status: string;
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

  // Projects operations
  listProjects: () => invoke<Project[]>("projects.list"),
  getProject: (id: string) => invoke<Project | null>("projects.get", { id }),
  createProject: (data: { name: string; project_id?: string; slack_channel_id?: string; description?: string }) =>
    invoke<Project>("projects.create", data),
  updateProject: (id: string, updates: Partial<Project>) =>
    invoke<Project>("projects.update", { id, updates }),
  deleteProject: (id: string) => invoke<boolean>("projects.delete", { id }),

  // Coach operations
  suggestCoachTopics: (projectId?: string, sprintId?: string) =>
    invoke<CoachTopic[]>("coach.suggestTopics", { projectId, sprintId }),
  listTopics: (projectId?: string, sprintId?: string) =>
    invoke<CoachTopic[]>("coach.listTopics", { projectId, sprintId }),
  updateTopic: (id: string, updates: Partial<CoachTopic>) =>
    invoke<CoachTopic>("coach.updateTopic", { id, updates }),
  acceptTopic: (id: string) => invoke<CoachTopic>("coach.acceptTopic", { id }),
  dismissTopic: (id: string) => invoke<CoachTopic>("coach.dismissTopic", { id }),
  listOutcomes: (retrospectiveId: string) => invoke<CoachTopicOutcome[]>("coach.listOutcomes", { retrospectiveId }),
  listInsights: (projectId?: string) => invoke<CoachInsight[]>("coach.listInsights", { projectId }),
  listSlackNotifications: (projectId?: string) => invoke<CoachSlackNotification[]>("coach.listSlackNotifications", { projectId }),
  sendSlack: (data: { projectId?: string; recipientName: string; messageType: string; content: string }) =>
    invoke<CoachSlackNotification>("coach.sendSlack", data),

  // Demo operations
  resetDemoData: () => invoke<{ success: boolean }>("demo.resetData", {}),
};
