/** Preset market-summary groups (live CSE lists, not user watchlists). */
export type JoneGroupKind = "watchlist" | "top_gainers" | "top_losers";

export const JONE_PRESET_GROUPS = [
  {
    id: "top_gainers",
    kind: "top_gainers" as const,
    name: "Top Gainers",
    description: "Today's biggest risers on the CSE",
  },
  {
    id: "top_losers",
    kind: "top_losers" as const,
    name: "Top Losers",
    description: "Today's biggest fallers on the CSE",
  },
] as const;

export function isPresetGroupId(id: string): boolean {
  return JONE_PRESET_GROUPS.some((g) => g.id === id);
}

export function presetGroupForId(id: string) {
  return JONE_PRESET_GROUPS.find((g) => g.id === id) ?? null;
}

export function groupKindForSelection(
  selectedId: string | null,
): JoneGroupKind {
  if (selectedId === "top_gainers") return "top_gainers";
  if (selectedId === "top_losers") return "top_losers";
  return "watchlist";
}
