const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeOwner,
  calculateEstimateMinutes,
  getCarriedOverActions,
} = require("../../src/utils/retroActionUtils.ts");

test("normalizeOwner - trims and lowercases owner strings", () => {
  assert.equal(normalizeOwner(" Alex "), "alex");
  assert.equal(normalizeOwner("ALEX"), "alex");
  assert.equal(normalizeOwner(null), "");
});

test("calculateEstimateMinutes - converts units to minutes", () => {
  assert.equal(calculateEstimateMinutes(30, "minutes"), 30);
  assert.equal(calculateEstimateMinutes(2, "hours"), 120);
  assert.equal(calculateEstimateMinutes(1, "day"), 480);
  assert.equal(calculateEstimateMinutes(2, "weeks"), 4800);
  assert.equal(calculateEstimateMinutes(3, "story_points"), 1440);
});

test("getCarriedOverActions - identifies open actions from previous sprints", () => {
  const sprintOrdering = ["sprint-22", "sprint-23", "sprint-24"];
  const actions = [
    { id: "1", sprint_id: "sprint-22", status: "open", title: "Action 1" },
    { id: "2", sprint_id: "sprint-23", status: "completed", title: "Action 2" },
    { id: "3", sprint_id: "sprint-23", status: "open", title: "Action 3" },
    { id: "4", sprint_id: "sprint-24", status: "open", title: "Action 4" },
  ];

  const carriedOver = getCarriedOverActions(actions, "sprint-24", sprintOrdering);
  assert.equal(carriedOver.length, 2);
  assert.equal(carriedOver[0].id, "1");
  assert.equal(carriedOver[1].id, "3");
});
