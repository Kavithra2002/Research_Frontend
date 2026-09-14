/**
 * Dev warmup snapshot: first-load API JSON is fetched before Chrome opens,
 * then injected into the client so pages can render tables immediately.
 */

export const WARMUP_SNAPSHOT_HEADER = "x-bypass-warmup";

export type WarmupSnapshot = Record<string, unknown>;

const LIVE_PREFIXES = [
  "/api/cse/",
  "/api/analytics/live",
  "/api/sector-lens/live",
];

type GlobalWarmup = typeof globalThis & {
  __AMBEON_WARMUP_SNAPSHOT__?: WarmupSnapshot;
  __AMBEON_WARMUP_LIVE_ONCE__?: Set<string>;
  __AMBEON_WARMUP_FETCH_PATCHED__?: boolean;
};

function g(): GlobalWarmup {
  return globalThis as GlobalWarmup;
}

export function warmupKey(input: string): string {
  try {
    const url = input.startsWith("http")
      ? new URL(input)
      : new URL(input, "http://warmup.local");
    return `${url.pathname}${url.search}`;
  } catch {
    return input;
  }
}

export function hydrateWarmupSnapshot(snapshot: WarmupSnapshot | null | undefined) {
  if (!snapshot || typeof snapshot !== "object") return;
  const store = { ...(g().__AMBEON_WARMUP_SNAPSHOT__ ?? {}), ...snapshot };
  g().__AMBEON_WARMUP_SNAPSHOT__ = store;
}

export function getWarmupSnapshot(): WarmupSnapshot {
  return g().__AMBEON_WARMUP_SNAPSHOT__ ?? {};
}

export function peekWarmupJson<T>(url: string): T | undefined {
  const store = g().__AMBEON_WARMUP_SNAPSHOT__;
  if (!store) return undefined;
  const value = store[warmupKey(url)];
  return value as T | undefined;
}

function isLiveKey(key: string): boolean {
  return LIVE_PREFIXES.some((prefix) => key === prefix || key.startsWith(prefix));
}

function headerBypass(init?: RequestInit): boolean {
  if (!init?.headers) return false;
  const headers = new Headers(init.headers);
  return headers.get(WARMUP_SNAPSHOT_HEADER) === "1";
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-warmup-cache": "hit",
    },
  });
}

export function installWarmupFetchPatch() {
  if (typeof window === "undefined") return;
  if (g().__AMBEON_WARMUP_FETCH_PATCHED__) return;
  g().__AMBEON_WARMUP_FETCH_PATCHED__ = true;
  g().__AMBEON_WARMUP_LIVE_ONCE__ ??= new Set();

  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const key = warmupKey(raw);
    const cached = peekWarmupJson(key);

    if (
      method === "GET" &&
      cached !== undefined &&
      !headerBypass(init)
    ) {
      if (isLiveKey(key)) {
        const seen = g().__AMBEON_WARMUP_LIVE_ONCE__!;
        if (!seen.has(key)) {
          seen.add(key);
          return jsonResponse(cached);
        }
      } else {
        return jsonResponse(cached);
      }
    }

    const res = await orig(input, init);
    if (method === "GET" && res.ok) {
      try {
        const clone = res.clone();
        const json = await clone.json();
        hydrateWarmupSnapshot({ [key]: json });
      } catch {
        // not JSON
      }
    }
    return res;
  };
}

export function extractedFirstDataUrl(list: {
  companies?: Array<{
    name: string;
    years?: Array<{ year: number; availablePeriods: string[] }>;
  }>;
} | null | undefined): string | null {
  const company = list?.companies?.[0];
  if (!company) return null;
  const params = new URLSearchParams({
    company: company.name,
    period: "Annual",
  });
  const years = company.years ?? [];
  const withBoth = years.find((y) => y.availablePeriods.length >= 2);
  const year = withBoth?.year ?? years[0]?.year;
  if (year != null) params.set("year", String(year));
  return `/api/extracted/data?${params.toString()}`;
}

export function localISODate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
