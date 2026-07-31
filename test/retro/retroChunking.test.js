const { test } = require("node:test");
const assert = require("node:assert/strict");
const { chunkTranscript } = require("../../src/utils/retroChunking.ts");

test("chunkTranscript - single chunk for short transcript", () => {
  const text = "We discussed PR review bottlenecks and agreed to set SLAs.";
  const chunks = chunkTranscript(text, 4096);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].chunkIndex, 0);
  assert.equal(chunks[0].totalChunks, 1);
  assert.equal(chunks[0].text, text);
});

test("chunkTranscript - multiple chunks for long transcript", () => {
  const paragraph = "This is a paragraph of retrospective transcript detailing sprint progress.\n\n";
  const longText = paragraph.repeat(300);

  const chunks = chunkTranscript(longText, 2048);
  assert.ok(chunks.length > 1);
  assert.equal(chunks[0].chunkIndex, 0);
  assert.equal(chunks[chunks.length - 1].chunkIndex, chunks.length - 1);
  assert.equal(chunks[0].totalChunks, chunks.length);
});
