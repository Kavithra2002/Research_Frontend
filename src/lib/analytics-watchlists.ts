export type AnalyticsWatchlist = {
  id: string;
  name: string;
  symbols: string[];
};

export const WATCHLIST_STORAGE_KEY = "ambeon.analytics.watchlists.v1";

export function loadWatchlists(): AnalyticsWatchlist[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (w): w is AnalyticsWatchlist =>
        !!w &&
        typeof (w as AnalyticsWatchlist).id === "string" &&
        typeof (w as AnalyticsWatchlist).name === "string" &&
        Array.isArray((w as AnalyticsWatchlist).symbols),
    );
  } catch {
    return [];
  }
}

export function saveWatchlists(list: AnalyticsWatchlist[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore quota / serialization errors — watchlists are a convenience.
  }
}

export function makeWatchlistId(): string {
  return `wl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
