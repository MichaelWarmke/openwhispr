const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeDedupKey, deduplicateProposals } = require("../../src/utils/retroDedup.ts");

test("normalizeDedupKey - lowercases, trims, strips punctuation and collapses whitespace", () => {
  assert.equal(normalizeDedupKey("  Improve PR Review, Response Time! "), "improve pr review response time");
  assert.equal(normalizeDedupKey("Alex / alex /  Alex "), "alex alex alex");
});

test("deduplicateProposals - cross-chunk duplicates keep longer description", () => {
  const proposals = [
    { title: "Improve PR review time", description: "Short desc", source: "explicit" },
    { title: "improve pr review time!", description: "Much longer and detailed description of PR reviews", source: "explicit" },
  ];

  const deduped = deduplicateProposals(proposals);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].description, "Much longer and detailed description of PR reviews");
});

test("deduplicateProposals - excludes already accepted and dismissed titles", () => {
  const proposals = [
    { title: "Write onboarding runbook", description: "Docs", source: "explicit" },
    { title: "Add mid-sprint scope review", description: "Scope check", source: "coach" },
  ];

  const existingTitles = new Set(["write onboarding runbook"]);

  const deduped = deduplicateProposals(proposals, existingTitles);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].title, "Add mid-sprint scope review");
});
