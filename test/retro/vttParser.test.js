const assert = require("assert");
const { test } = require("node:test");
const { parseVttToTranscript } = require("../../src/utils/vttParser.ts");

test("parseVttToTranscript - extracts clean text from WebVTT file with timestamps and voice tags", () => {
  const vttContent = `WEBVTT - Retrospective Meeting

NOTE
This is a comment block

1
00:00:01.000 --> 00:00:04.500
<v Sarah>Welcome everyone to our sprint retrospective.</v>

2
00:00:05.000 --> 00:00:09.200 line:85%
Liam: Thanks Sarah. I think CI build times were our biggest blocker this sprint.

3
00:00:09.500 --> 00:00:14.000
<v Alex><b>Alex:</b> I agree. We should set up caching for node_modules.</v>
`;

  const parsed = parseVttToTranscript(vttContent);
  assert.strictEqual(
    parsed,
    "Sarah: Welcome everyone to our sprint retrospective.\n" +
    "Liam: Thanks Sarah. I think CI build times were our biggest blocker this sprint.\n" +
    "Alex: I agree. We should set up caching for node_modules."
  );
});

test("parseVttToTranscript - handles empty or null input", () => {
  assert.strictEqual(parseVttToTranscript(""), "");
  assert.strictEqual(parseVttToTranscript(null), "");
});
