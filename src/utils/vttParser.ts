/**
 * WebVTT Transcript Parser Utility
 * Extracts clean speaker-annotated transcript text from WebVTT (.vtt) files.
 */

/**
 * Parses WebVTT content and extracts clean transcript text.
 * Preserves speaker names, strips timestamp headers, cue IDs, VTT metadata, and HTML tags.
 */
export function parseVttToTranscript(vttContent: string): string {
  if (!vttContent) return "";

  // Normalize line endings
  const lines = vttContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  const transcriptLines: string[] = [];
  let inNoteBlock = false;

  // Regex pattern for timestamp headers: e.g. "00:00:01.000 --> 00:00:04.500" or "00:01.000 --> 00:04.500"
  const timestampRegex = /^(?:\d{2,}:)?\d{2}:\d{2}[\.,]\d{3}\s*-->\s*(?:\d{2,}:)?\d{2}:\d{2}[\.,]\d{3}/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip WebVTT header line
    if (line.startsWith("WEBVTT")) {
      continue;
    }

    // Handle NOTE blocks (spans until empty line)
    if (line.startsWith("NOTE")) {
      inNoteBlock = true;
      continue;
    }

    if (inNoteBlock) {
      if (line === "") {
        inNoteBlock = false;
      }
      continue;
    }

    // Skip STYLE and REGION blocks
    if (line.startsWith("STYLE") || line.startsWith("REGION")) {
      continue;
    }

    // Skip empty lines
    if (!line) continue;

    // Skip timestamp lines
    if (timestampRegex.test(line)) {
      continue;
    }

    // Skip standalone numeric cue identifiers if followed by timestamp line
    if (/^\d+$/.test(line) && i + 1 < lines.length && timestampRegex.test(lines[i + 1].trim())) {
      continue;
    }

    // Skip standalone cue ID strings if followed by timestamp line
    if (/^[a-f0-9\-]{8,}$/i.test(line) && i + 1 < lines.length && timestampRegex.test(lines[i + 1].trim())) {
      continue;
    }

    let processedLine = line;

    // Convert <v SpeakerName>Spoken text</v> to "SpeakerName: Spoken text"
    processedLine = processedLine.replace(/<v(?:\.[^>]+)?\s+([^>]+)>(.*?)(?:<\/v>|$)/gi, (_match, speaker, text) => {
      const cleanSpeaker = speaker.trim();
      let cleanText = text.replace(/<[^>]+>/g, "").trim();
      if (cleanText.toLowerCase().startsWith(`${cleanSpeaker.toLowerCase()}:`)) {
        return cleanText;
      }
      return cleanText ? `${cleanSpeaker}: ${cleanText}` : "";
    });

    // Strip remaining HTML/VTT tags like <b>, <i>, <c>, etc.
    processedLine = processedLine.replace(/<[^>]+>/g, "").trim();

    if (processedLine) {
      // Avoid duplicate consecutive lines if VTT repeats cues for captions
      if (transcriptLines.length === 0 || transcriptLines[transcriptLines.length - 1] !== processedLine) {
        transcriptLines.push(processedLine);
      }
    }
  }

  return transcriptLines.join("\n");
}
