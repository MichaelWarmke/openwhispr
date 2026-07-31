const { test } = require("node:test");
const assert = require("node:assert/strict");
const { RetroRepository, runRetroMigrations } = require("../../src/helpers/retroRepository.js");

function isNativeBindingUnavailable(error) {
  const message = String(error?.message || error);
  return (
    message.includes("NODE_MODULE_VERSION") || message.includes("Could not locate the bindings file")
  );
}

function createTestRepo(t) {
  try {
    const Database = require("better-sqlite3");
    const db = new Database(":memory:");
    return { db, repo: new RetroRepository(db) };
  } catch (error) {
    if (isNativeBindingUnavailable(error)) {
      t.skip("better-sqlite3 native binding is not available for this Node runtime");
      return null;
    }
    throw error;
  }
}

test("runRetroMigrations - fresh install and idempotent re-run", (t) => {
  const testEnv = createTestRepo(t);
  if (!testEnv) return;
  const { db } = testEnv;

  runRetroMigrations(db);
  assert.equal(db.pragma("user_version", { simple: true }), 2);

  // Re-run
  runRetroMigrations(db);
  assert.equal(db.pragma("user_version", { simple: true }), 2);
});

test("Sprint operations - list, get, and update metrics", async (t) => {
  const testEnv = createTestRepo(t);
  if (!testEnv) return;
  const { repo } = testEnv;

  const sprints = await repo.listSprints();
  assert.ok(sprints.length >= 3);

  const s24 = await repo.getSprintSnapshot("sprint-24");
  assert.equal(s24.name, "Sprint 24 — Payments");

  const updated = await repo.updateSprintMetrics("sprint-24", {
    committed_points: 45,
    completed_points: 40,
    total_issues: 15,
    completed_issues: 12,
    blocked_issues: 1,
    burndown_trend: "on_track",
    velocity: 40,
    blockers: "None",
  });

  assert.equal(updated.is_user_edited, 1);
  assert.equal(updated.committed_points, 45);
  assert.equal(updated.completed_points, 40);
});

test("Retrospective and proposal CRUD and state transitions", async (t) => {
  const testEnv = createTestRepo(t);
  if (!testEnv) return;
  const { repo } = testEnv;

  const retro = await repo.createRetrospective({
    sprintId: "sprint-24",
    title: "Sprint 24 Retro",
    transcript: "We agreed that PR reviews are delaying releases.",
    sourceKind: "text",
  });

  assert.ok(retro.id);
  assert.equal(retro.processing_state, "idle");

  const savedProposals = await repo.saveProposals(
    retro.id,
    [
      { title: "Improve PR review response time", description: "Set 24h SLA", source: "explicit" },
      { title: "Add mid-sprint scope review", description: "Check scope", basis: "Burndown", source: "coach" },
    ],
    1
  );

  assert.equal(savedProposals.length, 2);

  const pending = await repo.listProposals(retro.id);
  assert.equal(pending.length, 2);

  // Dismiss one proposal
  await repo.dismissProposal(savedProposals[1].id);
  const remainingPending = await repo.listProposals(retro.id);
  assert.equal(remainingPending.length, 1);
  assert.equal(remainingPending[0].id, savedProposals[0].id);

  // Accept the other proposal
  const trackedAction = await repo.acceptProposal(savedProposals[0].id, {
    owner: "Alex",
    estimate_value: 2,
    estimate_unit: "days",
  });

  assert.ok(trackedAction.id);
  assert.equal(trackedAction.owner, "Alex");
  assert.equal(trackedAction.owner_normalized, "alex");
  assert.equal(trackedAction.estimate_minutes, 960);
  assert.equal(trackedAction.original_title, "Improve PR review response time");

  const pendingAfterAccept = await repo.listProposals(retro.id);
  assert.equal(pendingAfterAccept.length, 0);
});

test("Manual action creation, filtering, deletion, and owner list", async (t) => {
  const testEnv = createTestRepo(t);
  if (!testEnv) return;
  const { repo } = testEnv;

  const manual = await repo.createManualAction({
    sprintId: "sprint-24",
    title: "Write onboarding runbook",
    description: "Manual item",
    owner: "  Sam  ",
    estimate_value: 4,
    estimate_unit: "hours",
  });

  assert.equal(manual.source, "manual");
  assert.equal(manual.owner, "  Sam  ");
  assert.equal(manual.owner_normalized, "sam");
  assert.equal(manual.estimate_minutes, 240);

  const owners = await repo.listOwners();
  assert.ok(owners.includes("  Sam  "));

  const filtered = await repo.listTrackedActions({ owner: "sam" });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, manual.id);

  const deleted = await repo.deleteTrackedAction(manual.id);
  assert.equal(deleted, true);

  const afterDelete = await repo.listTrackedActions({ owner: "sam" });
  assert.equal(afterDelete.length, 0);
});

test("Mock Jira ticket creation idempotency and key persistence", async (t) => {
  const testEnv = createTestRepo(t);
  if (!testEnv) return;
  const { repo } = testEnv;

  const manual = await repo.createManualAction({
    sprintId: "sprint-24",
    title: "Setup CI pipeline",
    description: "Automate test builds",
    owner: "Alex",
    estimate_value: 1,
    estimate_unit: "day",
  });

  // First call
  const ticket1 = await repo.createMockJiraTicket(manual.id, "Setup CI pipeline", "Automate test builds");
  assert.equal(ticket1.jira_key, "AGILE-1001");
  assert.equal(ticket1.jira_creation_state, "created");

  // Second concurrent/repeated call returns same ticket reference idempotently
  const ticket2 = await repo.createMockJiraTicket(manual.id, "Setup CI pipeline", "Automate test builds");
  assert.equal(ticket2.jira_key, "AGILE-1001");

  // Verify second manual action gets AGILE-1002
  const manual2 = await repo.createManualAction({
    sprintId: "sprint-24",
    title: "Update security docs",
    owner: "Sam",
    estimate_value: 2,
    estimate_unit: "hours",
  });

  const ticket3 = await repo.createMockJiraTicket(manual2.id, "Update security docs", "Docs");
  assert.equal(ticket3.jira_key, "AGILE-1002");
});
