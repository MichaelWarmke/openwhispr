const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseRetroResponse,
  repairJsonString,
  extractJsonObject,
  normalizeRetroOutput,
} = require("../../src/utils/retroResponseParser.ts");

test("parseRetroResponse - valid JSON", () => {
  const input = JSON.stringify({
    explicitActions: [{ title: "Improve PR review time", description: "Set SLAs" }],
    coachSuggestions: [{ title: "Scope review", description: "Mid-sprint check", basis: "Burndown" }],
  });

  const res = parseRetroResponse(input);
  assert.equal(res.unparsed, undefined);
  assert.equal(res.explicitActions.length, 1);
  assert.equal(res.explicitActions[0].title, "Improve PR review time");
  assert.equal(res.coachSuggestions.length, 1);
  assert.equal(res.coachSuggestions[0].basis, "Burndown");
});

test("parseRetroResponse - fenced and prose wrapped", () => {
  const input = `Here is the analysis result:
\`\`\`json
{
  "explicitActions": [{ "title": "Add test coverage", "description": "Write unit tests" }],
  "coachSuggestions": []
}
\`\`\`
Hope this helps!`;

  const res = parseRetroResponse(input);
  assert.equal(res.unparsed, undefined);
  assert.equal(res.explicitActions.length, 1);
  assert.equal(res.explicitActions[0].title, "Add test coverage");
});

test("parseRetroResponse - trailing commas and single quotes repair", () => {
  const input = `{
    'explicitActions': [
      { 'title': 'Fix bug in auth', 'description': 'Investigate token expiration', },
    ],
  }`;

  const res = parseRetroResponse(input);
  assert.equal(res.unparsed, undefined);
  assert.equal(res.explicitActions.length, 1);
  assert.equal(res.explicitActions[0].title, "Fix bug in auth");
});

test("parseRetroResponse - bare array fallback", () => {
  const input = `[
    { "title": "Refactor database module", "description": "Split into repository" }
  ]`;

  const res = parseRetroResponse(input);
  assert.equal(res.unparsed, undefined);
  assert.equal(res.explicitActions.length, 1);
  assert.equal(res.explicitActions[0].title, "Refactor database module");
});

test("parseRetroResponse - wholly unparseable input", () => {
  const input = "I am a language model and I cannot parse this retro transcript into JSON.";

  const res = parseRetroResponse(input);
  assert.equal(res.unparsed, true);
  assert.equal(res.explicitActions.length, 0);
  assert.equal(res.coachSuggestions.length, 0);
});
