export interface TranscriptChunk {
  text: string;
  chunkIndex: number;
  totalChunks: number;
}

/**
 * Splits a retrospective transcript into overlapping chunks based on model context length or fallback.
 */
export function chunkTranscript(
  transcript: string,
  contextLengthTokens: number = 4096
): TranscriptChunk[] {
  const text = (transcript || "").trim();
  if (!text) return [];

  // Approximate character-to-token ratio: ~3.5 chars per token
  // Subtract ~1000 tokens for system prompt, sprint summary context, and output budget (2048)
  const availableTokens = Math.max(1000, contextLengthTokens - 2500);
  const chunkSizeChars = Math.max(2000, Math.floor(availableTokens * 3.5));
  const overlapChars = Math.floor(chunkSizeChars * 0.1); // 10% overlap

  if (text.length <= chunkSizeChars) {
    return [{ text, chunkIndex: 0, totalChunks: 1 }];
  }

  const chunks: string[] = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    let endIndex = Math.min(startIndex + chunkSizeChars, text.length);

    // Try to break at a paragraph or sentence boundary if not at end
    if (endIndex < text.length) {
      const paragraphBreak = text.lastIndexOf("\n\n", endIndex);
      if (paragraphBreak > startIndex + chunkSizeChars * 0.5) {
        endIndex = paragraphBreak;
      } else {
        const sentenceBreak = text.lastIndexOf(". ", endIndex);
        if (sentenceBreak > startIndex + chunkSizeChars * 0.5) {
          endIndex = sentenceBreak + 1;
        }
      }
    }

    const chunkText = text.substring(startIndex, endIndex).trim();
    if (chunkText) {
      chunks.push(chunkText);
    }

    if (endIndex >= text.length) break;
    startIndex = Math.max(startIndex + 1, endIndex - overlapChars);
  }

  const total = chunks.length;
  return chunks.map((chunkText, i) => ({
    text: chunkText,
    chunkIndex: i,
    totalChunks: total,
  }));
}
