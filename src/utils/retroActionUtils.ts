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
