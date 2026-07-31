# Retrospective Action Coach — v1 Specification

## Goal

Extend the desktop app with a lightweight, local-first retrospective workflow:

1. Upload or paste a retrospective transcript.
2. Associate it with a sprint selected from mocked Jira data.
3. Use a locally installed reasoning model to propose explicit actions and agile-coach suggestions.
4. Require explicit user review and acceptance before an item is tracked.
5. Track accepted actions through completion and create a mock Jira ticket when needed.

No cloud AI calls, real Jira calls, Jira authentication, or real ticket creation are part of v1.

### Provider Context (hackathon build)

The hosted OpenWhispr cloud provider has been removed from this build. What remains is:

- **BYOK cloud:** Gemini models only.
- **Local:** all locally installed models (llama.cpp / GGUF), unrestricted.

Retrospective analysis in v1 runs **only** on the local engine (provider id `local`). Gemini BYOK is explicitly out of scope for this feature — not because it would not work, but because retro transcripts are the most sensitive text a team produces and the feature's value proposition is that they never leave the machine.

## Product Decisions

- **Reasoning model:** Add a dedicated `retroReasoningModel` setting (following the existing `meetingReasoningModel` precedent) rather than reusing `cleanupModel`. `cleanupModel` is shared with dictation cleanup and defaults to a cloud provider; silently borrowing it would either break dictation expectations or leak transcripts. The retro setting only lists locally installed models. If it is unset, fall back to the current `cleanupModel` **only when** its provider resolves to `local`; otherwise show the setup state.
- **Transcription:** Reuse the existing local audio-transcription path. Retro audio never uses the cloud transcription route, so the cloud-only ffmpeg chunking path does not apply — see *Audio Intake*.
- **Input:** Support audio uploads, `.txt` uploads, and pasted transcript text. On intake, **copy** the audio into a `retro-audio/` folder under `userData` and store the copied path. This removes the whole "file moved after upload" failure class; still render an unavailable-file state if the copy is later deleted.
- **Sprint selection:** Require selection of a current or past mock Jira sprint before retrospective analysis.
- **Mock Jira:** Use a local adapter and seeded data that simulates boards/sprints, committed and completed work, issue-status counts, burndown trend, velocity, and blockers. Seeded metrics are **user-editable** so a real team can enter their own numbers instead of coaching being generated from invented data.
- **Action review:** Both explicitly stated actions and AI coaching suggestions are proposals only. Users may edit, accept, or dismiss each proposal; only accepted items become tracked actions.
- **Manual actions:** Users can add a tracked action by hand, without an AI proposal. It is stored with source `manual`. Any retro facilitator needs this and it is cheap.
- **Tracking:** Keep tracking intentionally lightweight: owner, numeric estimate with unit, and `Open` or `Completed` status. Do not add due dates or Kanban states. Owner is free text but **trimmed and normalized** for grouping, and the input is backed by a `datalist` of previously used owners so `Alex` / `alex` / ` Alex ` do not become three filter entries. Estimates store the entered value and unit **plus** a derived `estimate_minutes` so the dashboard can sort and total.
- **Carry-over:** Actions are sprint-scoped, so the dashboard surfaces a "Carried over from previous sprints" group listing still-`Open` actions from earlier sprints. This is the highest-value view in retro tracking and is v1 scope, not an extra.
- **Deletion:** A tracked action can be deleted outright. `Completed` is not the only exit.
- **Ticketing:** The action card opens a Jira-style local preview. Confirming saves a mock Jira key and creation state; it makes no network request.
- **Persistence:** Use SQLite now, accessed through a repository interface so a future Postgres repository can implement the same domain API. The interface is `Promise`-returning end to end even though `better-sqlite3` is synchronous — otherwise it is not swappable for an async driver.
- **Privacy:** Retro transcripts are stored in the same unencrypted SQLite file in `userData` as the rest of the app's data. This is stated as a known property, not a guarantee of at-rest protection. Retro transcripts **do not** flow into the `transcriptions` history table and never appear in dictation history UI.

## Information Architecture

Add **one** control-panel view, `retrospectives`, rather than two. Intake → review is a linear flow, not two destinations, and the sidebar already has an `upload` item that "Upload Retrospective" would collide with.

The view has three internal stages:

- **Intake:** required sprint selection, transcript source, editable transcript, analysis progress and cancellation.
- **Review:** proposal list with edit / accept / dismiss.
- **Dashboard:** accepted action tracking, carry-over group, filters, completion summary, manual action creation, and mock Jira ticket creation.

Stage is component state; the sidebar gains exactly one entry.

### i18n

All user-facing strings go through `t()` across the 10 existing locales, and the analysis prompt is added to the per-locale `src/locales/*/prompts.json` files following the `cleanup` prompt pattern. Proposals are generated in the **UI language**, not the transcript language, matching how `getCleanupSystemPrompt` already threads `language` / `uiLanguage`. Locale string authoring is explicit scope.

## Wireframes

### Retrospectives — Intake

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Retrospectives            [Intake] [Review] [Actions]                │
│                                                                     │
│ Sprint *                                                  [Edit ✎]  │
│ [Sprint 24 — Payments                     ▾]                         │
│  Jul 8–19 · 72% complete · 3 blockers · Burndown: behind trend      │
│                                                                     │
│ Transcript source                                                    │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ [Drop audio or .txt here]  [Browse]  [Paste transcript]        │ │
│ │ Audio is transcribed with the configured local model.           │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ Transcript (editable after intake)                                  │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ We agreed that PR reviews are delaying releases...              │ │
│ │                                                                 │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ Model: Qwen2.5 7B (local)                                            │
│                                              [Analyze retrospective] │
└─────────────────────────────────────────────────────────────────────┘
```

### Intake — analysis running

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Analyzing retrospective…                                             │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░  Chunk 3 of 5                              │
│ Dictation cleanup is paused while this runs.                         │
│                                                       [Cancel]       │
└─────────────────────────────────────────────────────────────────────┘
```

### Intake — no local model

```text
┌─────────────────────────────────────────────────────────────────────┐
│ ⚠ No local reasoning model selected                                  │
│ Retrospective analysis runs entirely on your machine, so it needs a │
│ locally installed model. Gemini (BYOK) is not used here.             │
│                                        [Open model settings]         │
└─────────────────────────────────────────────────────────────────────┘
```

### Proposal Review

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Retrospective analysis                                               │
│ Sprint 24 — Payments · Transcript ready                              │
│                                                                     │
│ Explicitly discussed                                                 │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Improve PR review response time                                  │ │
│ │ Mentioned in transcript                                          │ │
│ │ [Accept to tracking] [Edit] [Dismiss]                            │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ Agile-coach suggestions                                              │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Add a mid-sprint scope review                                    │ │
│ │ Suggested from scope growth and burndown trend                    │ │
│ │ [Accept to tracking] [Edit] [Dismiss]                            │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ Suggestions are advisory and are never tracked without acceptance.  │
│                                       [Re-analyze transcript]        │
└─────────────────────────────────────────────────────────────────────┘
```

### Re-analysis Confirmation

```text
┌────────────────────────────────────────────────────┐
│ Re-analyze this retrospective?                      │
│                                                    │
│ 4 pending proposals will be replaced.               │
│ 2 accepted actions are kept and will not be         │
│ proposed again.                                     │
│                                                    │
│ [Cancel]                              [Re-analyze] │
└────────────────────────────────────────────────────┘
```

### Action Dashboard

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Action Dashboard              Open 6 · Completed 3 · Carried over 2 │
│ [Status: All ▾] [Owner: All ▾] [Sprint: All ▾]     [+ Add action]   │
│                                                                     │
│ ⚠ Carried over from previous sprints (2)                            │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Write onboarding runbook                           [Open ▾]      │ │
│ │ Sprint 23 — Payments · Explicit action · 1 sprint old            │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ Sprint 24 — Payments                                                │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Improve PR review response time                    [Open ▾]  [⋯] │ │
│ │ Sprint 24 — Payments · Explicit action · edited from AI text     │ │
│ │ Owner [Alex                    ]  Estimate [2] [days ▾]          │ │
│ │ [Create Jira Ticket]                                             │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Add a mid-sprint scope review                   [Completed ▾] [⋯]│ │
│ │ Sprint 24 — Payments · Coach suggestion                        │ │
│ │ Owner [Sam                     ]  Estimate [1] [hour ▾]          │ │
│ │ Jira: AGILE-1042 (stale — action edited after creation)          │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ [⋯] = View original AI text · Delete action                         │
└─────────────────────────────────────────────────────────────────────┘
```

### Mock Jira Ticket Preview

```text
┌────────────────────────────────────────────────────┐
│ Create Jira Ticket                                  │
│                                                    │
│ Summary                                             │
│ [Improve PR review response time                  ] │
│ Description                                         │
│ [Retrospective context and action details…        ] │
│ Sprint: Sprint 24 — Payments                        │
│ Owner: Alex · Estimate: 2 days                      │
│                                                    │
│ [Cancel]                         [Create mock ticket]│
└────────────────────────────────────────────────────┘
```

## Flow Diagrams

### Retrospective Intake and Review

```text
User selects mock sprint
        |
        v
Audio upload / .txt upload / pasted transcript
        |
        +-- audio --> copy to userData --> local transcription --> transcript
        |                                         |
        +-------------------------------> validate transcript
                                                  |
                                                  v
                                    gate: provider must be `local`
                                                  |
                                                  v
                        chunk by real context window + sprint metrics
                                                  |
                                                  v
                     per chunk: infer -> extract -> parse -> one repair retry
                                    (progress events, cancellable)
                                                  |
                                                  v
                        normalize + deduplicate across chunks
                                                  |
                                                  v
Structured proposals: explicit actions + coach suggestions
                                                  |
                                                  v
User edits, accepts, or dismisses every proposal
                                                  |
                                                  +-- accepted --> tracked action
                                                  |                (original AI text kept)
                                                  +-- dismissed --> not tracked
```

### Tracking and Ticketing

```text
Accepted action ----> Action Dashboard <---- Manually added action
                         |
                         +--> set owner (normalized) and estimate (+ minutes)
                         |
                         +--> Open <--> Completed
                         |
                         +--> Delete
                         |
                         +--> grouped as carry-over if Open and sprint is past
                         |
                         +--> Create Jira Ticket
                                      |
                                      v
                              local Jira preview
                                      |
                                      v
                  persist mock key + payload snapshot (UNIQUE per action)
                                      |
                                      v
                   later edits mark the snapshot stale, never rewrite it
```

### Local Boundaries

```text
Mock Jira adapter ---> seeded sprint snapshot ---> UI + coaching prompt
                                         \
                                          --> SQLite repository

Audio/transcript ---> local transcription ---> local reasoning model (llama.cpp)
                                                   |
                                                   v
                                            structured proposals

Gemini BYOK ---X--- never reached by any retrospective code path
```

### Re-analysis

```text
Existing retrospective
        |
        +-- user edits transcript / clicks Analyze again
                    |
                    v
        confirmation dialog (counts pending vs accepted)
                    |
                    v
  pending proposals  -> deleted and replaced
  dismissed proposals-> stay dismissed, titles fed to dedup
  accepted actions   -> untouched, titles fed to dedup
                    |
                    v
           new proposal set, no duplicates of
           anything already accepted or dismissed
```

## Domain and Persistence Design

Create a domain repository rather than coupling views directly to SQLite. The future Postgres implementation must expose the same operations.

### Entities

- **Sprint snapshot:** mock Jira sprint ID, name, date range, metrics, issue counts, burndown trend, velocity, blockers, and an `is_user_edited` flag.
- **Retrospective:** ID, title, selected sprint ID/snapshot, transcript, source kind, optional copied audio path, processing state, `analysis_run_count`, and timestamps.
- **Action proposal:** ID, retrospective ID, title, description, source (`explicit` | `coach`), state (`pending` | `accepted` | `dismissed` | `superseded`), `dedup_key`, `analysis_run`, and timestamps.
- **Tracked action:** accepted proposal data plus `original_title` / `original_description` (the unmodified AI text, `NULL` for manual actions), owner, `owner_normalized`, estimate value/unit, `estimate_minutes`, `open` | `completed` status, mock Jira key/state/payload snapshot, and timestamps.

The implementation may store proposals and tracked actions in one table with an acceptance state, provided the repository preserves the distinction.

**Provenance.** When a user edits a proposal before accepting, the original AI text is retained on the tracked action so the dashboard can show "the model proposed X, you tracked Y". Manual actions carry source `manual` and null originals.

### Async Repository Interface

Every repository method returns a `Promise`, even though `better-sqlite3` is synchronous. A sync interface cannot be reimplemented over an async Postgres driver, which defeats the stated purpose of having the interface at all. The SQLite implementation simply wraps sync calls in resolved promises.

### Migrations

The existing pattern — `ALTER TABLE` in `try/catch` swallowing duplicate-column errors — does not extend to creating and evolving four related tables with foreign keys. This feature introduces a real migration runner keyed on SQLite's `PRAGMA user_version`: an ordered list of migration functions, applied inside a transaction, each bumping `user_version`. Existing ad-hoc migrations are left as-is and the runner starts at the current implicit version. This is explicit, budgeted scope.

### IPC Surface

The domain lives in the main process, so every operation needs an IPC crossing. Rather than ~20 new channels in an already ~1000-line `preload.js`, expose **one namespaced channel**:

```text
ipcRenderer.invoke("retro:invoke", { op, payload })
```

- `op` is a string from a closed, validated allowlist (e.g. `sprints.list`, `retro.create`, `proposals.accept`, `actions.list`, `jira.createMock`).
- The main-process handler validates `op` against the allowlist and dispatches to the repository; unknown ops reject.
- `preload.js` exposes a single typed `retro.invoke(op, payload)` plus the progress/event listeners below.
- A thin typed client in the renderer (`src/services/retro/client.ts`) gives call sites real method names, so the single channel does not leak into components.

Separate, genuinely event-shaped channels stay separate: `retro:analysis-progress` and `retro:analysis-cancel`.

### Required Repository Operations

- List mock current and past sprints, retrieve a sprint snapshot, and update user-edited sprint metrics.
- Create/update retrospectives and retain source metadata.
- Create/list/update/dismiss/supersede proposals and accept a proposal as a tracked action.
- Create a manual tracked action with no originating proposal.
- List tracked actions with status, owner, sprint, retrospective, and carry-over filters.
- List distinct normalized owners (for the filter and the input `datalist`).
- Update owner, estimate, and completion status; delete a tracked action.
- Create a mock Jira ticket idempotently and return its stored reference.

**Mock Jira key generation.** Keys are `AGILE-<n>` where `n` comes from a persisted counter row in SQLite, so keys survive restart and never collide. Idempotency is enforced at the data layer by a `UNIQUE` constraint on `tracked_action_id` in the mock-ticket table, not by disabling the button; the UI disable is a convenience on top. Repeated calls return the existing reference.

**Ticket staleness.** The created ticket stores a snapshot of the payload at creation time. If the action's title, owner, or estimate changes afterwards, the snapshot is **not** rewritten — a mock of a remote system should not silently rewrite history. The card renders a "stale" marker instead. No update or re-create flow in v1.

## Local AI Analysis

1. Resolve the retro reasoning model. Refuse to run unless the resolved provider is `local`; there is no cloud fallback for this feature.
2. Chunk large transcripts with overlap. Expose the model's `contextLength` over `retro:invoke` (`models.describe`) so chunk size is derived from the real window; if it is unknown, fall back to a conservative fixed budget.
3. Include the selected sprint summary in every analysis request.
4. Produce structured output per *Structured Output Contract* below.
5. Validate and normalize the response, deduplicate repeated items across chunks, and preserve source category.
6. Show a recoverable error for unavailable models, inference failures, invalid responses, or empty results; retain the transcript and sprint selection for retry.

### Structured Output Contract

This is the load-bearing assumption of the feature and the largest technical gap. Nothing in the current reasoning path enforces structure: there is no `response_format`, no JSON schema, no `generateObject`. Small local GGUF models are precisely the models worst at producing clean JSON unprompted. It is therefore designed as its own component, `src/utils/retroResponseParser.ts`, kept as a pure module so it is unit-testable without Electron or a model.

**Target shape**

```json
{
  "explicitActions": [{ "title": "string", "description": "string" }],
  "coachSuggestions": [{ "title": "string", "description": "string", "basis": "string" }]
}
```

**Pipeline**

1. **Prompt shaping.** System prompt states the schema, gives one worked example, forbids prose, and caps items per chunk (5 explicit + 5 coach) so output stays inside the token budget. Temperature 0.
2. **Extraction.** Strip `<think>` blocks with the existing `stripThinking` helper, then take the first balanced `{...}` span, tolerating ```` ```json ```` fences and leading/trailing chatter.
3. **Tolerant parse.** Try `JSON.parse`. On failure apply a bounded set of deterministic repairs — trailing commas, single quotes, unterminated final string, truncated trailing array element — and retry once.
4. **Normalize.** Coerce to the target shape: missing collection becomes `[]`, a bare array is treated as `explicitActions`, string items become `{title}`, titles are trimmed and length-capped, empty titles dropped.
5. **Repair retry.** If parsing still fails, re-prompt the model **once** with the invalid output and an instruction to return only valid JSON. Exactly one repair retry per chunk — not N — so worst-case latency stays bounded.
6. **Give up.** If the retry also fails, that chunk is marked `unparsed`. Analysis continues with the remaining chunks. If **every** chunk is unparsed, the run enters the recoverable-error state with the raw model output available behind a "Show model output" disclosure.

**Deduplication** is string-based, not semantic — the repo has no embedding infrastructure and adding one is out of scope. The `dedup_key` is the title lowercased, trimmed, punctuation-stripped, whitespace-collapsed. Cross-chunk duplicates collapse to the first occurrence, keeping the longer description. On re-analysis, titles of already-accepted and already-dismissed proposals are also fed into the dedup set so the user is not asked the same question twice.

**Token budget.** `calculateMaxTokens` clamps output to 2048, which a 10-item response with descriptions can exceed and get truncated mid-JSON. The per-chunk item cap above is the primary mitigation; the retro path additionally passes an explicit `maxTokens` rather than relying on the shared heuristic.

### Local Inference Constraints

The current local path cannot support the wireframed UX as-is. Each gap below is v1 scope.

**Concurrency.** `localReasoningBridge` rejects a second request with "Already processing a request". A multi-chunk retro analysis would therefore make the user's dictation cleanup fail for its whole duration — an unacceptable trade for a background feature. v1 introduces a small **request queue** in the bridge with two priorities: dictation cleanup is `interactive` and jumps the queue between retro chunks; retro chunks are `batch`. The retro run yields between chunks, so a dictation cleanup waits at most one chunk. The UI states this plainly ("Dictation cleanup is paused while this runs") and analysis is cancellable.

**Cancellation.** `cancelActiveStream` only covers the streaming path; `processText` has no abort. v1 adds a cancellation token to the local non-streaming path: `retro:analysis-cancel` sets a flag that (a) prevents dispatch of further chunks and (b) aborts the in-flight llama request. Cancelling leaves the transcript, sprint selection, and any already-parsed chunks intact.

**Progress.** There is no progress event for reasoning today. v1 emits `retro:analysis-progress` with `{ retrospectiveId, stage, chunkIndex, chunkCount }` where stage is `transcribing` | `analyzing` | `parsing`. The intake progress bar is driven entirely by this.

**Timeout.** Local inference has no timeout; a stuck `llama-server` hangs the button indefinitely. v1 applies a per-chunk timeout (default 120s, configurable) that fails the chunk, not the run. A chunk that times out is treated like an unparsed chunk.

### Audio Intake

"Reuse the existing local transcription path" under-describes the work for a 45–60 minute retro recording:

- The 25 MB BYOK ceiling in `UploadAudioView` does not apply, because the retro path never uses the cloud uploader. Instead the retro intake enforces a **duration** guard and warns above ~90 minutes.
- ffmpeg segmentation is currently wired only to the cloud route. v1 reuses the same `splitAudioFile` helper for the **local** route so long recordings are transcribed segment by segment with progress, rather than as one oversized request.
- On intake the file is copied into `userData/retro-audio/<retrospectiveId>.<ext>`; the copied path is what gets stored. Source-file relocation is no longer a failure mode.

## Scope and Cut Order

The demo target is a single, believable end-to-end run: real audio in, reviewed actions out, tracked across sprints. If the build runs short, cut in this order:

1. **Mock Jira ticket creation** — cut first. It is the most self-contained slice and the least load-bearing; the dashboard is meaningful without it.
2. **Coach suggestions** — cut second. Explicit-action extraction alone still demonstrates the core loop.
3. **User-editable sprint metrics** — fall back to seeded-only.

Never cut: local-only enforcement, proposal review before tracking, structured-output parsing, and persistence. Those are the feature.

## Acceptance Criteria

- Users cannot analyze a retrospective until a sprint is selected and transcript content is present.
- Analysis refuses to run and shows the setup state unless the resolved reasoning provider is `local`. No retrospective code path can reach Gemini BYOK.
- Audio uses the existing local transcription path, is copied into `userData` on intake, and transcript text can be edited before AI analysis.
- Analysis reports per-chunk progress and can be cancelled; cancelling retains the transcript and sprint selection.
- A dictation cleanup requested during a running analysis succeeds; it is not rejected with "Already processing a request".
- A malformed model response triggers exactly one repair retry per chunk; a chunk that still fails does not fail the whole run.
- Every generated action remains untracked until the user explicitly accepts it.
- Re-analysis replaces pending proposals, leaves accepted actions untouched, and does not re-propose anything already accepted or dismissed.
- The dashboard contains only accepted and manually added actions and supports owner/estimate/status editing and deletion.
- Accepting an edited proposal retains the original AI text as viewable provenance.
- Open actions from earlier sprints appear in a carry-over group.
- Dashboard totals and filters reflect persisted data after app restart, and owner filtering is insensitive to case and surrounding whitespace.
- Mock Jira creation never performs a network request; idempotency holds at the repository level even if the UI calls twice.
- Mock Jira keys do not repeat across app restarts.
- The unavailable-local-model state provides a direct path to the relevant existing settings.
- No retrospective transcript is written to the `transcriptions` table or shown in dictation history.

## Test Coverage

There is no React component testing infrastructure in the repo — tests are `node --test` over `test/**/*.test.js`, covering backend helpers only. Rather than adding a component test stack, the testable logic is deliberately pushed into pure modules under `src/utils` and `src/helpers` and tested there. That is the right structure regardless of tooling.

**Pure-module tests (`node --test`)**

- `retroResponseParser`: valid, fenced, prose-wrapped, truncated, single-quoted, trailing-comma, empty, bare-array, and wholly-unparseable inputs.
- Deduplication: cross-chunk duplicates, case/punctuation variants, and exclusion of already-accepted and already-dismissed titles.
- Transcript chunking: boundary sizes, overlap correctness, and the unknown-context fallback.
- Owner normalization and `estimate_minutes` derivation across all units.
- Carry-over selection given a sprint ordering.
- Mock Jira key generation and counter persistence.

**Repository tests (`node --test`, in-memory SQLite)**

- Migration runner: fresh install, upgrade from the current implicit version, and idempotent re-run.
- CRUD for all four entities, proposal state transitions, manual action creation, deletion, and filter combinations.
- Idempotent mock ticket creation asserted at the repository layer, including a concurrent double call.

**Bridge tests**

- Queue priority: an `interactive` request submitted during a `batch` run completes without error.
- Cancellation stops further chunk dispatch.
- Per-chunk timeout fails only that chunk.

**Manual QA checklist** covers what remains: the three stages of the view, drag-and-drop intake, and locale spot checks.

## Known Risks and Mitigations

- **Unreliable JSON from small local models:** dedicated parser component with extraction, tolerant parsing, normalization, one repair retry, and a defined give-up state. Highest-risk item in the feature.
- **Local model context limits:** derive chunk size from the model's real context window, chunk with overlap, aggregate, and deduplicate.
- **Retro analysis starving dictation:** priority queue in the local bridge; interactive requests preempt batch work between chunks.
- **Hung local inference:** per-chunk timeout plus user-facing cancellation.
- **Slow or failed transcription/inference:** separate stages, retain completed input, and offer retry without repeating successful work.
- **Weak AI relevance:** label every result as a proposal, enforce review before tracking, and retain original AI text for audit.
- **Coaching built on invented metrics:** seeded sprint data is user-editable, and coach suggestions are labelled as advisory with their basis shown.
- **Sensitive transcripts at rest:** stored unencrypted in `userData` like the rest of the app's data; documented explicitly, kept out of the `transcriptions` history table, and never sent to any provider.
- **Scope overrun:** an explicit cut order (above) so the demo degrades gracefully rather than half-finishing everything.
- **Future service migration:** keep SQLite, mock Jira, and ticket creation behind a `Promise`-returning interface, and the whole IPC surface behind one namespaced channel, so Postgres and real Jira can replace adapters without rewriting UI behavior.
