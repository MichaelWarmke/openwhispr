import type { ExplicitActionProposal, CoachSuggestionProposal } from "./retroResponseParser";

export function normalizeDedupKey(title: string): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}

export interface ProposalItem {
  id?: string;
  title: string;
  description: string;
  basis?: string;
  source: "explicit" | "coach";
}

/**
 * Deduplicates proposals across chunks and filters out items matching existing titles.
 * When duplicates within a chunk/batch are found, keeps the one with the longer description.
 */
export function deduplicateProposals(
  proposals: ProposalItem[],
  existingTitlesSet: Set<string> = new Set()
): ProposalItem[] {
  const seenMap = new Map<string, ProposalItem>();

  // Normalize existing titles set
  const normalizedExisting = new Set<string>();
  for (const title of existingTitlesSet) {
    const key = normalizeDedupKey(title);
    if (key) normalizedExisting.add(key);
  }

  for (const item of proposals) {
    const key = normalizeDedupKey(item.title);
    if (!key) continue;

    // Filter out if already accepted or dismissed
    if (normalizedExisting.has(key)) {
      continue;
    }

    if (seenMap.has(key)) {
      const existing = seenMap.get(key)!;
      // Keep longer description
      if ((item.description || "").length > (existing.description || "").length) {
        seenMap.set(key, { ...item });
      }
    } else {
      seenMap.set(key, { ...item });
    }
  }

  return Array.from(seenMap.values());
}
