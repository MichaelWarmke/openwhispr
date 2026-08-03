# Retrospective ActionCoach & Analyst Implementation Plan

## Overview
This document specifies the architecture, data flow, dialog model, sprint eligibility rules, and IPC contracts for the streamlined retrospective flow in OpenWhispr.

## Key Architectural Decisions

1. **Dashboard-First Landing Page**:
   - `RetrospectivesView` opens directly on the **Action Dashboard**. Persistent page-level stage tabs (`Intake`, `Proposal Review`, `Action Dashboard`) are removed.
   - Retrospective Intake and Proposal Review open as modal dialogs (using Radix UI `<Dialog>`) over the Action Dashboard.

2. **Sprint Eligibility Rules**:
   - A sprint is considered **eligible** if it has at least one retrospective record with a successful analysis run (`analysis_run_count > 0` and `processing_state` in `['review', 'completed']`).
   - The Action Dashboard displays sprint accordions, filter options, metrics, and manual action choices **only for eligible sprints**.
   - If no eligible sprint exists, the dashboard displays an empty state with a prominent `New Retrospective` button.
   - Tracked actions belonging to ineligible sprints are excluded at the data boundary (`actions.list` IPC query with `sprintIds` filter) and are not rendered until a qualifying retrospective run occurs for that sprint.

3. **Intake & Proposal Review Modal Dialog Flow**:
   - **`New Retrospective`**: Clicking `New Retrospective` on the dashboard resets active retro state and opens the `RetrospectiveIntake` modal dialog.
   - **Analysis Success**: When intake analysis completes, the intake modal closes and the `RetrospectiveReview` modal dialog opens automatically with the newly generated proposals.
   - **One-Click Acceptance**: Clicking the checkmark icon (`CheckCircle`) on a proposal card persists the tracked action with AI/meeting-owner defaults, closes the proposal review modal dialog, and returns immediately to the Action Dashboard with refreshed state.
   - **Dismissal**: Clicking `XCircle` dismisses the proposal in the database and refreshes remaining pending proposals. When all proposals are reviewed, a "Go to Action Dashboard" shortcut closes the modal.
   - **Re-analysis**: Clicking "Re-analyze transcript" closes the review modal and re-opens the intake modal.

4. **Action Assignment & Uploader Fallback Defaults**:
   - Every proposal receives an estimated effort (`estimateValue`, `estimateUnit`) and an `owner`.
   - If a participant is explicitly identified in the transcript for that action, the local model assigns that participant.
   - If no transcript participant is identified, the model assigns the retrospective `meeting_owner` (derived from the logged-in user's identity: `user.name` falling back to `user.email`).
   - If no authenticated identity exists, the action defaults to `"Unassigned"`.

5. **Inline Dashboard Editing**:
   - Action titles and descriptions are directly editable inline on dashboard cards.
   - Changes commit on `blur` or `Enter` (for titles) and discard on `Escape`, calling `retroClient.updateAction`.

## Data Model & Migration Summary

- **Retrospectives Table Migration (v3)**:
  - `retrospectives.meeting_owner`: TEXT
  - `retro_proposals.suggested_owner`: TEXT
  - `retro_proposals.suggested_estimate_value`: REAL
  - `retro_proposals.suggested_estimate_unit`: TEXT

- **IPC Dispatch Contracts**:
  - `actions.list`: Accepts `{ status?: string, owner?: string, sprintId?: string, sprintIds?: string[] }`.

## UI Sequence Flow

```
[Sidebar Navigation: Retrospectives]
                │
                ▼
      ┌──────────────────┐
      │ Action Dashboard │◄─── (Landing Page)
      └─────────┬────────┘
                │ Click "New Retrospective"
                ▼
    ┌──────────────────────┐
    │ Intake Modal Dialog  │
    └──────────┬───────────┘
                │ Analysis Complete
                ▼
   ┌────────────────────────┐
   │ Proposal Review Modal  │
   └───────────┬────────────┘
               │ Accept Proposal (Checkmark)
               ▼
   [Close Modal & Refresh Dashboard]
```
