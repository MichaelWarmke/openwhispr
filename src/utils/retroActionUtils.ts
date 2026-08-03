export type EstimateUnit = "minutes" | "hours" | "days" | "weeks" | "story_points";

export function normalizeOwner(owner: string | null | undefined): string {
  if (!owner) return "";
  return owner.trim().toLowerCase();
}

export function calculateEstimateMinutes(value: number, unit: string): number {
  const v = Number(value) || 0;
  const u = (unit || "hours").toLowerCase().trim();

  switch (u) {
    case "minutes":
    case "minute":
    case "mins":
    case "min":
    case "m":
      return v;
    case "hours":
    case "hour":
    case "hrs":
    case "hr":
    case "h":
      return v * 60;
    case "days":
    case "day":
    case "d":
      return v * 480; // 8-hour workday standard
    case "weeks":
    case "week":
    case "w":
      return v * 2400; // 5-day / 40-hour work week
    case "story_points":
    case "points":
    case "point":
    case "pts":
    case "pt":
      return v * 480; // 1 point = 1 day (8 hours)
    default:
      return v * 60;
  }
}

export function extractParticipantsFromTranscript(transcriptText: string | null | undefined): string[] {
  if (!transcriptText) return [];
  const names = new Set<string>();
  const lines = transcriptText.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Pattern 1: <v Speaker Name> or <v.narrator Speaker Name>
    const vMatch = trimmed.match(/<v(?:\.[^>]+)?\s+([^>]+)>/i);
    if (vMatch && vMatch[1]) {
      const name = vMatch[1].replace(/<[^>]+>/g, "").trim();
      if (name && name.length >= 2 && name.length <= 40 && !/^(WEBVTT|NOTE|STYLE|REGION)$/i.test(name)) {
        names.add(name);
      }
    }

    // Pattern 2: Speaker Name: or [Speaker Name]: or Speaker Name -
    const colonMatch = trimmed.match(/^(?:<v[^>]*>)?\s*\[?([A-Z][a-zA-Z0-9_'\- ]{1,35})\]?\s*[:\-]/);
    if (colonMatch && colonMatch[1]) {
      const name = colonMatch[1].trim();
      if (
        name &&
        name.length >= 2 &&
        name.length <= 40 &&
        !/^(WEBVTT|NOTE|STYLE|REGION|TIMESTAMP|SPEAKER|SUMMARY|ACTION|ITEM|RETRO)$/i.test(name) &&
        !/^\d+$/.test(name)
      ) {
        names.add(name);
      }
    }
  }

  return Array.from(names);
}

export interface TrackedActionItem {
  id: string;
  sprint_id: string;
  status: "open" | "completed";
  [key: string]: any;
}

export function getCarriedOverActions<T extends TrackedActionItem>(
  actions: T[],
  currentSprintId: string,
  sprintOrdering: string[]
): T[] {
  const currentIndex = sprintOrdering.indexOf(currentSprintId);
  if (currentIndex <= 0) return []; // If current sprint is first or not found, no previous sprints

  const pastSprintsSet = new Set(sprintOrdering.slice(0, currentIndex));

  return actions.filter(
    (action) => action.status === "open" && pastSprintsSet.has(action.sprint_id)
  );
}
