# 🎯 Hackathon Demo Plan — Agile Coach Agent

## Demo Overview

**Pitch (30 seconds):** "We built an AI-powered Agile Coach that doesn't just take notes in your retrospective — it *learns across sprints*, suggests what your team should discuss before the meeting even starts, and follows up to make sure action items actually get done. It plugs into Slack and email via MCP so the coaching never stops between meetings."

**Demo Duration:** ~8 minutes (expandable to 12 if judges ask for deep dives)

---

## Mock Data Setup — Expanded Sprint History

> [!IMPORTANT]
> The current database seeds **3 sprints** (22, 23, 24). To tell a compelling multi-sprint story, we need **5 sprints** that show a clear narrative arc — a team that starts struggling, gets coached, and improves.

### Sprint Data — The Story Arc

| Sprint | Name | Dates | Committed | Completed | Issues | Completed | Blocked | Trend | Velocity | Blockers |
|--------|------|-------|-----------|-----------|--------|-----------|---------|-------|----------|----------|
| **Sprint 20** | Sprint 20 — Onboarding | Jun 27 – Jun 07 | 34 | 22 | 12 | 7 | 4 | behind trend | 22 | "CI pipeline flaky tests blocking merges, Unclear ownership on onboarding API endpoints" |
| **Sprint 21** | Sprint 21 — Onboarding | Jun 10 – Jun 21 | 32 | 26 | 11 | 8 | 3 | behind trend | 26 | "Onboarding flow QA handoff delays, Flaky integration test suite still intermittent" |
| **Sprint 22** | Sprint 22 — Checkout | Jun 10 – Jun 21 | 36 | 36 | 10 | 10 | 0 | ahead of trend | 36 | *(none)* |
| **Sprint 23** | Sprint 23 — Payments | Jun 24 – Jul 05 | 38 | 35 | 12 | 11 | 1 | on trend | 35 | "Staging database migration" |
| **Sprint 24** | Sprint 24 — Payments | Jul 08 – Jul 19 | 40 | 29 | 14 | 10 | 3 | behind trend | 32 | "PR review delays on API gateway, Auth service deployment lock" |

**The narrative:** Sprint 20 was rough (65% completion, 4 blockers). Sprint 21 improved slightly. Sprint 22 was a breakout sprint. Sprint 23 held steady. Sprint 24 regressed — which is the sprint we'll run the live retro analysis on. The coach detects the pattern and suggests topics accordingly.

### Sample Retro Transcript (for Sprint 24 Live Demo)

Use this transcript for the live analysis. It's realistic, contains multiple speakers, discusses blockers, and includes both explicit action items and things the AI coach should pick up on:

```
Sarah: Okay, welcome everyone to the Sprint 24 retro. Let's start with what went well.

Marcus: The payments SDK migration went pretty smoothly, honestly. We finished that two days early. The documentation Alex wrote really helped onboard everyone fast.

Alex: Thanks! Yeah, documenting the API contracts first actually saved a lot of back-and-forth. I think we should keep doing that going forward.

Sarah: Agreed. Now let's talk about what didn't go so well. The elephant in the room is we only completed 29 out of 40 committed points.

Jordan: The biggest issue was the PR review delays on the API gateway service. I had three PRs sitting for over 48 hours. By the time they got reviewed, there were merge conflicts and I had to redo work.

Marcus: Same here. I think part of the problem is that only two people on the team are approved reviewers for the gateway repo, and they were both heads-down on their own work.

Sarah: That's a structural problem. Should we expand the reviewer pool?

Jordan: Absolutely. I think we should get at least two more people onboarded as reviewers. I can run a session to walk through the gateway architecture.

Alex: I'd volunteer for that. And maybe we set an SLA — like PRs should get a first review within 24 hours.

Sarah: Great, let's make both of those action items. Jordan to run the gateway review onboarding session, and we'll establish a 24-hour PR review SLA. Jordan, can you own the onboarding session?

Jordan: Yeah, I'll have it done by mid-sprint. Let's say within the first week of Sprint 25.

Sarah: The other blocker was the auth service deployment lock. What happened there?

Marcus: We had a config issue in staging that took two days to diagnose. The deployment pipeline was fine — the problem was that our staging environment config had drifted from production. Nobody caught it because we don't have config drift detection.

Alex: This is the second time a staging-production config mismatch bit us. We had something similar in Sprint 21 with the database migration.

Sarah: Should we prioritize some kind of config validation step?

Marcus: Yeah, I'll create a ticket for implementing config drift detection in our CI pipeline. It's probably a day or two of work.

Sarah: Okay, now what about testing? We've had flaky tests mentioned as a blocker in several recent sprints. Is that getting better?

Alex: Honestly, nobody's really touched it. We keep saying we'll address it but other work takes priority. The integration test suite is still intermittent — maybe one in five runs fails for no real reason.

Jordan: I think it's a resource problem. The test containers don't have enough memory allocated in CI. It's probably a quick fix but it keeps getting deprioritized.

Sarah: Let's make that an explicit action item this time. Jordan, can you take the CI test container memory fix?

Jordan: Sure, that should be a quick one. Maybe two hours.

Sarah: Anything else before we wrap up?

Marcus: One thing — I noticed we keep overcommitting. We went from 36 points completed to committing 40 this sprint but only hit 29. Maybe we should be more conservative with planning?

Sarah: That's a good point. Let's factor in a buffer next sprint planning. Alex, can you put together some historical velocity data so we have a baseline?

Alex: Sure, I'll compile that before sprint planning.

Sarah: Great retro everyone. Let's make sure these action items actually get done this time.
```

---

## Step-by-Step Demo Walkthrough

### 🎬 Act 1: The Setup (1 minute)

**What you say:**
> "Let me show you what happens before, during, and after a retrospective with our Agile Coach Agent. I'm going to walk you through a real team scenario — a payments team finishing Sprint 24."

**What you do:**
1. Open the app → Navigate to the **Retrospectives** section
2. Show the **project dropdown** — select "General Engineering"
3. Quickly show the **Action Items** tab with some existing tracked actions (from prior sprints)
4. Point out: *"Notice we already have some carried-over actions from previous sprints. The coach remembers these."*

---

### 🎬 Act 2: Pre-Retro Intelligence (2 minutes)

**What you say:**
> "Before the retro even starts, the coach analyzes sprint metrics and suggests what the team should talk about."

**What you do:**
1. Click **"New Retrospective"** button → Intake modal opens
2. Select **Sprint 24 — Payments** from the sprint dropdown
3. Point out the sprint metrics shown inline: *"29 out of 40 committed points, 3 blockers, behind trend. The coach sees all of this."*
4. Click **"Suggest Topics"** button in the **Coach Suggested Agenda** section
5. Wait for the AI to generate 3–5 topics (or if offline, the fallback topics will populate)
6. Walk through the suggested topics:
   - *"Sprint Blocker Resolution & PR Review Delays"* — metric-driven, priority 1
   - *"Capacity Planning & Commitment vs Completion Gap"* — the team committed 40 but delivered 29
   - *"Carried-Over Action Item Follow-Through"* — items from past sprints that haven't been closed
7. **Accept 2 topics** by clicking "Accept Topic" buttons
8. Point out: *"The team can accept, dismiss, or add their own topics. This becomes the coaching agenda."*

**Key judge talking point:** *"The coach doesn't just blindly suggest topics — it uses sprint metrics, historical blockers, and carried-over actions to generate contextually relevant discussion items."*

---

### 🎬 Act 3: Transcript Analysis (2 minutes)

**What you say:**
> "Now the retro happens. The team discusses, and afterward someone uploads the transcript. Let me drop in a real conversation."

**What you do:**
1. **Paste the sample transcript** (from above) into the transcript textarea
2. Show the model status indicator (e.g., "Google Gemini" or "Qwen2.5 7B local")
3. Click **"Analyze retrospective"**
4. Show the **live progress bar** as chunks are processed: *"It's processing the transcript in chunks, extracting both explicit action items the team stated, and coach-suggested improvements they might have missed."*
5. Wait for analysis to complete → **Review modal** opens automatically

---

### 🎬 Act 4: Action Item Review (1.5 minutes)

**What you say:**
> "The agent extracts two types of action items — things the team explicitly committed to, and coaching suggestions based on patterns it detected."

**What you do:**
1. Show the **proposal cards** — highlight the difference between:
   - 🟢 **Explicit** actions (things the team said): "Run gateway review onboarding session" (Owner: Jordan), "Establish 24-hour PR review SLA", "Implement config drift detection" (Owner: Marcus)
   - 🤖 **Coach** suggestions: items the AI inferred from patterns (e.g., "Address flaky CI test suite stability")
2. **Accept 3–4 proposals** → Show them being converted into tracked action items with owners and time estimates
3. Point out: *"Each action item gets an owner, an estimate, and can be exported as a mock Jira ticket."*
4. Click **"Create Jira Ticket"** on one item → show the AGILE-XXXX key generated

---

### 🎬 Act 5: Notifications Tab (1.5 minutes)

**What you say:**
> "The coach doesn't stop when the meeting ends. We've built a complete notification system that keeps the team accountable."

**What you do:**
1. Navigate to the **Notifications** tab
2. Show the **Integration Connections** panel:
   - Slack integration with Channel ID and MCP Project ID
   - Email integration with sender address
3. Walk through the **6 notification triggers** — scroll through each:
   - **Pre-Retro Topic Preview** → *"24 hours before the retro, the team gets the coaching agenda via Slack"*
   - **Action Item Owner Reminders** → *"Jordan would get a DM: 'You own 2 open items going into Sprint 25'"*
   - **Sprint Metric Alerts** → *"When velocity drops 20%, the team gets notified immediately"*
   - **Post-Retro Personal Summaries** → *"After analysis, each person gets their own action items via DM"*
   - **Mid-Sprint Action Follow-Up** → *"Halfway through the sprint, owners get a check-in"*
   - **Coach Insight Share** → *"When the coach detects a pattern — like PR delays recurring in 3 of 4 sprints — it shares with the team"*
4. Show the **Slack/Email channel toggle** on one item — switch it from Slack to Email
5. Click **"Test"** on the Pre-Retro Topic Preview → show the test dispatch in the delivery log

**Key judge talking point:** *"Each notification type can be independently toggled, routed to Slack or Email, and test-triggered. This uses MCP to connect to actual Slack workspaces."*

---

### 🎬 Act 6: Insights Dashboard (1 minute)

**What you say:**
> "Over time, the coach builds up intelligence about the team's patterns. Let me show you what it's learned."

**What you do:**
1. Navigate to the **Insights** tab
2. Show the **Retro Effectiveness Score** (e.g., 72/100) with the info tooltip
3. Walk through the **3 Active Coach Insights**:
   - 🟡 **PR Review Bottleneck Pattern** (88% confidence) — *"This appeared in 3 of the last 4 sprints"*
   - 🟣 **Action Item Completion Arc** (92% confidence) — *"Completion improved from 40% to 75%"*
   - 🔵 **Testing & QA Blind Spot** (Coach Recommendation) — *"30% of blockers are test-related but it's never been a retro topic"*
4. Show the **Key Retrospective Metrics**: Topic Coverage (86%), Speaker Balance (82%), Action Follow-Through (78%)
5. Point out: *"These metrics are computed from actual transcript analysis and action tracking, not self-reported."*

**Key judge talking point:** *"The coach learns across sprints. It's not just a one-shot transcript analyzer — it builds persistent memory and gets smarter over time."*

---

### 🎬 Closing (30 seconds)

**What you say:**
> "To summarize: our Agile Coach Agent operates in a continuous feedback loop. It prepares the team before the retro, analyzes the conversation after, tracks follow-through mid-sprint, and learns from every cycle. It uses MCP to connect to Slack and email for real-time notifications. Everything runs locally — transcripts and team data never leave the machine."

---

## Mock Data Code Changes Required

> [!IMPORTANT]
> These are the specific code changes needed in [`retroRepository.js`](file:///Users/mike/WebstormProjects/openwhispr/src/helpers/retroRepository.js) to add the 2 additional sprints.

### Add Sprint 20 and Sprint 21

Insert two additional `stmt.run(...)` calls after the existing Sprint 22 seed (line 151), inside the `if (count.c === 0)` block:

```javascript
// Sprint 21 — Onboarding (slight improvement from Sprint 20)
stmt.run(
  "sprint-21",
  "Sprint 21 — Onboarding",
  "2026-06-10",
  "2026-06-21",
  32,
  26,
  11,
  8,
  3,
  "behind trend",
  26,
  "Onboarding flow QA handoff delays, Flaky integration test suite still intermittent"
);

// Sprint 20 — Onboarding (the rough start)
stmt.run(
  "sprint-20",
  "Sprint 20 — Onboarding",
  "2026-05-27",
  "2026-06-07",
  34,
  22,
  12,
  7,
  4,
  "behind trend",
  22,
  "CI pipeline flaky tests blocking merges, Unclear ownership on onboarding API endpoints"
);
```

### Database Reset Required

Since sprint seeding only runs when the table is empty, you'll need to delete the existing database file to re-seed:

```bash
# Find and delete the existing retro database to trigger a re-seed
rm ~/Library/Application\ Support/openwhispr/retro.db
```

Then restart the app — migrations will recreate the tables and seed all 5 sprints.

---

## Reset Demo Data Button (In-App)

> [!IMPORTANT]
> Instead of manually deleting the database file and restarting the app between demo runs, add a **"Reset Demo Data"** button directly on the Retrospectives screen so you can reset to a clean slate with one click.

### What It Does

1. **Drops and re-creates** all retro-related tables (`retrospectives`, `retro_proposals`, `retro_tracked_actions`, `coach_topics`, `coach_topic_outcomes`, `coach_insights`, `coach_slack_messages`)
2. **Re-seeds** the 5 mock sprints (Sprint 20–24) and the default "General Engineering" project
3. **Pre-seeds complete retrospective records for Sprints 20, 21, and 22**:
   - Realistic meeting transcripts with multi-speaker dialogue (`Jordan Smith`, `Sarah Jenkins`, `Alex Chen`, `Marcus Vance`)
   - 8 tracked action items (with owner attribution, time estimates, and Jira keys `AGILE-1001` through `AGILE-1008`)
   - Accepted coach topics and cross-sprint active insights
4. **Preserves** notification settings and integration connection config (Slack Channel ID, Email sender) so you don't have to re-enter them between runs
5. **Reloads** the UI state — sprints list, action items, insights — so everything is fresh immediately

### Where It Lives

- A small **"Reset Demo Data"** button in the **header area** of the Retrospectives screen (next to the project dropdown or in the top-right corner)
- Styled as a subtle ghost/outline button with a `RotateCcw` icon so it doesn't distract during the demo but is easy to find between runs
- Clicking it shows a **confirmation dialog**: *"This will delete all retrospectives, action items, coach topics, and insights, and re-seed the sprint data. Notification settings will be preserved. Continue?"*

### Implementation Details

**Backend — IPC handler (`retro:invoke` → `demo.resetData`):**
- Reads current `notification_settings` from the projects table before reset
- Drops data from: `retro_tracked_actions`, `retro_proposals`, `retrospectives`, `coach_topic_outcomes`, `coach_topics`, `coach_insights`, `coach_slack_messages`
- Deletes and re-inserts all `sprint_snapshots` rows (5 mock sprints)
- Pre-populates completed retrospectives & transcripts for Sprints 20, 21, and 22
- Pre-populates tracked action items (`AGILE-1001` through `AGILE-1008`) with owners (`Alex Chen`, `Marcus Vance`, `Sarah Jenkins`, `Jordan Smith`) and estimate durations
- Pre-populates coach topics and active insights
- Deletes and re-inserts the default project, restoring saved `notification_settings`
- Resets `mock_jira_counter` back to 1009 for subsequent tickets

**Frontend — New method on `retroClient`:**
```typescript
async resetDemoData(): Promise<{ success: boolean }> {
  return this._invoke("demo.resetData", {});
}
```

**UI — Button in `RetrospectivesView.tsx` header:**
```tsx
<Button
  variant="ghost"
  size="sm"
  onClick={() => setShowResetConfirm(true)}
  className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-destructive"
>
  <RotateCcw size={13} />
  Reset Demo Data
</Button>
```

### Demo Workflow

1. **Before first demo run:** Click "Reset Demo Data" to ensure clean slate
2. **Run through the full demo** (Acts 1–6)
3. **Between demo runs:** Click "Reset Demo Data" again — everything resets in ~1 second without restarting the app
4. **Notification settings persist** so Slack/Email config doesn't need to be re-entered

---

## Demo Checklist

- [ ] "Reset Demo Data" button implemented and tested
- [ ] Database re-seeded with 5 sprints
- [ ] Sample transcript copied and ready to paste
- [ ] AI model configured and responding (either local Qwen or cloud Gemini)
- [ ] Slack MCP channel ID filled in on Notifications tab
- [ ] Email sender address filled in
- [ ] At least 1–2 notification triggers toggled to Email to show flexibility
- [ ] Test trigger tested at least once before live demo
- [ ] Verified "New Retrospective" → Suggest Topics → Analysis → Review flow end-to-end

---

## Potential Judge Questions & Answers

| Question | Answer |
|----------|--------|
| "How does it connect to Slack?" | "We use MCP (Model Context Protocol) — a standardized way for AI agents to call external tools. The Slack MCP server handles sending DMs and channel messages." |
| "Is the data stored locally?" | "Yes, everything — transcripts, sprint data, action items, coach memory — is stored in a local SQLite database. Nothing leaves the machine unless you explicitly send a Slack or email notification." |
| "What LLM does it use?" | "It's model-agnostic. You can use a local Qwen 7B model for fully offline operation, or connect to cloud providers like Google Gemini for richer analysis." |
| "How does topic suggestion work?" | "The coach ingests sprint metrics (velocity, blockers, burndown), open action items from past sprints, and historical retro outcomes. It uses this context to generate 3–5 prioritized topics with rationale for each." |
| "Can this work with other project management tools?" | "The architecture uses MCP, which means adding Jira, Linear, or Asana integration is a matter of connecting the right MCP server. The action item tracking already has a mock Jira ticket export." |
| "What's the learning loop?" | "After every retro, the coach evaluates which suggested topics were actually discussed and how deeply. Over time, it adjusts confidence and priority — if a topic gets ignored twice, it escalates. If a topic leads to improvement, it marks it resolved." |
