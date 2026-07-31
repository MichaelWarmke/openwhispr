import { stripThinkingTags } from "../helpers/stripThinking.js";

export interface ExplicitActionProposal {
  title: string;
  description: string;
}

export interface CoachSuggestionProposal {
  title: string;
  description: string;
  basis: string;
}

export interface RetroParsedOutput {
  explicitActions: ExplicitActionProposal[];
  coachSuggestions: CoachSuggestionProposal[];
  unparsed?: boolean;
}

/**
 * Attempts to repair common JSON syntax errors produced by small LLMs:
 * - Single quotes around keys/values
 * - Trailing commas before closing brackets or braces
 * - Unclosed strings / arrays
 */
export function repairJsonString(input: string): string {
  let s = input.trim();

  // Strip markdown code fences if present
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  // Convert single quotes used for JSON property names or string values to double quotes
  s = s.replace(/(?<=[{\s,\[])'([^'\n]+)'(?=\s*[:,\s}\]])/g, '"$1"');

  // Strip trailing commas before closing braces or brackets
  s = s.replace(/,\s*([}\]])/g, "$1");

  return s;
}

/**
 * Extracts the first balanced JSON object {...} or array [...] from raw LLM output text.
 */
export function extractJsonSpan(raw: string): string | null {
  const cleaned = stripThinkingTags(raw).trim();

  // Look for first '{' or '['
  const firstBrace = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");

  let startIdx = -1;
  let startChar = "";
  let endChar = "";

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    startChar = "{";
    endChar = "}";
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    startChar = "[";
    endChar = "]";
  } else {
    return null;
  }

  let depth = 0;
  let inString = false;
  let quoteChar = "";
  let endIdx = -1;

  for (let i = startIdx; i < cleaned.length; i++) {
    const char = cleaned[i];
    const prevChar = i > 0 ? cleaned[i - 1] : "";

    if (inString) {
      if (char === quoteChar && prevChar !== "\\") {
        inString = false;
      }
    } else {
      if (char === '"') {
        inString = true;
        quoteChar = '"';
      } else if (char === "'") {
        // Only treat as string quote if not mid-word apostrophe
        const nextChar = i < cleaned.length - 1 ? cleaned[i + 1] : "";
        if (/\w/.test(prevChar) && /\w/.test(nextChar)) {
          // apostrophe in word, e.g. don't
        } else {
          inString = true;
          quoteChar = "'";
        }
      } else if (char === startChar) {
        depth++;
      } else if (char === endChar) {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
  }

  if (endIdx !== -1) {
    return cleaned.substring(startIdx, endIdx + 1);
  }

  const lastEnd = cleaned.lastIndexOf(endChar);
  if (lastEnd > startIdx) {
    return cleaned.substring(startIdx, lastEnd + 1);
  }

  return null;
}

/**
 * Normalizes any parsed JSON output into the strict RetroParsedOutput shape.
 */
export function normalizeRetroOutput(obj: any): RetroParsedOutput {
  const result: RetroParsedOutput = {
    explicitActions: [],
    coachSuggestions: [],
  };

  if (!obj || typeof obj !== "object") {
    return { ...result, unparsed: true };
  }

  // If model returned a bare array, treat it as explicitActions
  if (Array.isArray(obj)) {
    obj = { explicitActions: obj };
  }

  const rawExplicit = Array.isArray(obj.explicitActions)
    ? obj.explicitActions
    : Array.isArray(obj.actions)
    ? obj.actions
    : [];

  const rawCoach = Array.isArray(obj.coachSuggestions)
    ? obj.coachSuggestions
    : Array.isArray(obj.suggestions)
    ? obj.suggestions
    : [];

  for (const item of rawExplicit) {
    if (typeof item === "string" && item.trim()) {
      result.explicitActions.push({
        title: item.trim().slice(0, 150),
        description: "",
      });
    } else if (item && typeof item === "object") {
      const title = String(item.title || item.action || item.name || "").trim().slice(0, 150);
      const description = String(item.description || item.detail || item.details || "").trim();
      if (title) {
        result.explicitActions.push({ title, description });
      }
    }
  }

  for (const item of rawCoach) {
    if (typeof item === "string" && item.trim()) {
      result.coachSuggestions.push({
        title: item.trim().slice(0, 150),
        description: "",
        basis: "",
      });
    } else if (item && typeof item === "object") {
      const title = String(item.title || item.suggestion || item.name || "").trim().slice(0, 150);
      const description = String(item.description || item.detail || item.details || "").trim();
      const basis = String(item.basis || item.reason || item.rationale || "").trim();
      if (title) {
        result.coachSuggestions.push({ title, description, basis });
      }
    }
  }

  // Cap at 5 per chunk per spec
  result.explicitActions = result.explicitActions.slice(0, 5);
  result.coachSuggestions = result.coachSuggestions.slice(0, 5);

  return result;
}

/**
 * Parses raw LLM output for retro analysis, applying tolerant JSON extraction, repair, and normalization.
 */
export function parseRetroResponse(rawOutput: string): RetroParsedOutput {
  if (!rawOutput || !rawOutput.trim()) {
    return { explicitActions: [], coachSuggestions: [], unparsed: true };
  }

  const jsonSpan = extractJsonSpan(rawOutput);
  if (!jsonSpan) {
    return { explicitActions: [], coachSuggestions: [], unparsed: true };
  }

  // 1. Direct JSON parse
  try {
    const parsed = JSON.parse(jsonSpan);
    return normalizeRetroOutput(parsed);
  } catch {}

  // 2. Tolerant JSON repair parse
  try {
    const repaired = repairJsonString(jsonSpan);
    const parsed = JSON.parse(repaired);
    return normalizeRetroOutput(parsed);
  } catch {}

  return { explicitActions: [], coachSuggestions: [], unparsed: true };
}

/**
 * Generates prompt instruction for repair retry if model output was invalid.
 */
export function buildRepairPrompt(invalidOutput: string): string {
  return (
    "The previous response was not valid JSON. Return ONLY a valid JSON object matching this exact schema:\n" +
    '{\n  "explicitActions": [{ "title": "...", "description": "..." }],\n  "coachSuggestions": [{ "title": "...", "description": "...", "basis": "..." }]\n}\n' +
    "No markdown fences, no explanatory text. Fix and format this output:\n" +
    invalidOutput.slice(0, 1000)
  );
}
