/**
 * Hits every App Router page after `next dev` is listening so Turbopack
 * compiles them into memory *before* Chrome opens. Without this, the first
 * click on each sidebar item waits 5–7s on "Compiling...".
 *
 * SKIP_PAGE_WARMUP=1 skips compilation and only waits for the server
 * (previous behaviour).
 */

import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ORIGIN = (process.env.DEV_ORIGIN || "http://127.0.0.1:3000").replace(/\/+$/, "");
const APP_DIR = join(process.cwd(), "src", "app");
const SKIP = process.env.SKIP_PAGE_WARMUP === "1";
const CONCURRENCY = Math.max(1, Number(process.env.PAGE_WARMUP_CONCURRENCY || 2));
const READY_TIMEOUT_MS = Number(process.env.PAGE_WARMUP_READY_TIMEOUT_MS || 180_000);
const PAGE_TIMEOUT_MS = Number(process.env.PAGE_WARMUP_PAGE_TIMEOUT_MS || 60_000);
const API_TIMEOUT_MS = Number(process.env.PAGE_WARMUP_API_TIMEOUT_MS || 90_000);
const READY_POLL_MS = 400;
const SNAPSHOT_PATH = join(process.cwd(), ".next", "warmup-snapshot.json");

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function extractedFirstDataUrl(list) {
  const company = list?.companies?.[0];
  if (!company) return null;
  const params = new URLSearchParams({
    company: company.name,
    period: "Annual",
  });
  const years = company.years ?? [];
  const withBoth = years.find((y) => (y.availablePeriods ?? []).length >= 2);
  const year = withBoth?.year ?? years[0]?.year;
  if (year != null) params.set("year", String(year));
  return `/api/extracted/data?${params.toString()}`;
}

function firstLoadApiUrls() {
  return [
    "/api/extracted",
    "/api/companies",
    "/api/newspaper",
    "/api/reports",
    "/api/analytics/live",
    "/api/sector-lens/live",
    `/api/sector-lens?asOf=${encodeURIComponent(todayISO())}`,
    "/api/macroeconomics/charts/list",
    "/api/system/newly-uploaded",
    "/api/demo/reports",
    "/api/system/live-extraction/companies",
    "/api/extracted/non-financial",
    "/api/cse/marketStatus",
    "/api/cse/marketSummery",
    "/api/cse/aspiData",
    "/api/cse/snpData",
    "/api/cse/topGainers",
    "/api/cse/topLooses",
    "/api/cse/mostActiveTrades",
    "/api/cse/allSectors",
    "/api/cse/todaySharePrice",
    "/api/cse/dailyMarketSummery",
    "/api/cse/approvedAnnouncement",
    "/api/cse/getNewListingsRelatedNoticesAnnouncements",
    "/api/cse/getBuyInBoardAnnouncements",
    "/api/cse/getNonComplianceAnnouncements",
    "/api/cse/getCOVIDAnnouncements",
    "/api/cse/getFinancialAnnouncement",
    "/api/cse/circularAnnouncement",
    "/api/cse/directiveAnnouncement",
  ];
}

function ts() {
  return new Date().toISOString().slice(11, 19);
}

function log(msg) {
  console.log(`[${ts()}] [warmup] ${msg}`);
}

function warn(msg) {
  console.error(`[${ts()}] [warmup] ${msg}`);
}

function collectPageFiles(dir, acc = []) {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "api") continue;
      collectPageFiles(full, acc);
    } else if (/^page\.(t|j)sx?$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

function fileToRoute(file) {
  const rel = relative(APP_DIR, file).replaceAll("\\", "/");
  const withoutPage = rel.replace(/\/?page\.(t|j)sx?$/, "");
  const parts = withoutPage.split("/").filter((part) => {
    if (!part) return false;
    if (part.startsWith("(") && part.endsWith(")")) return false;
    if (part.startsWith("@")) return false;
    return true;
  });
  if (parts.some((part) => part.startsWith("[") && part.endsWith("]"))) {
    return null;
  }
  return parts.length === 0 ? "/" : `/${parts.join("/")}`;
}

function discoverRoutes() {
  const files = collectPageFiles(APP_DIR);
  const routes = new Set();
  for (const file of files) {
    const route = fileToRoute(file);
    if (route) routes.add(route);
  }
  const ordered = [...routes].sort((a, b) => {
    if (a === "/") return -1;
    if (b === "/") return 1;
    return a.localeCompare(b);
  });
  return ordered;
}

async function waitForServer() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  log(`waiting for Next.js at ${ORIGIN}`);
  while (Date.now() < deadline) {
    const ctrl = new AbortController();
    // First request compiles `/` + the root layout and can take several seconds.
    const timer = setTimeout(() => ctrl.abort(), PAGE_TIMEOUT_MS);
    try {
      const res = await fetch(ORIGIN, {
        signal: ctrl.signal,
        redirect: "manual",
        headers: { "user-agent": "ambeon-dev-warmup" },
      });
      await res.arrayBuffer().catch(() => null);
      log("Next.js is listening — compiling pages into cache");
      return true;
    } catch {
      // not up yet
    } finally {
      clearTimeout(timer);
    }
    await new Promise((r) => setTimeout(r, READY_POLL_MS));
  }
  warn(`Next.js did not become ready within ${READY_TIMEOUT_MS / 1000}s`);
  return false;
}

async function compileRoute(route) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PAGE_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(`${ORIGIN}${route}`, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": "ambeon-dev-warmup" },
    });
    await res.arrayBuffer().catch(() => null);
    return { route, ok: res.ok || (res.status >= 300 && res.status < 500), ms: Date.now() - started, status: res.status };
  } catch (err) {
    const reason =
      err && typeof err === "object" && "name" in err && err.name === "AbortError"
        ? "timeout"
        : err && typeof err === "object" && "message" in err
          ? String(err.message)
          : String(err);
    return { route, ok: false, ms: Date.now() - started, status: 0, reason };
  } finally {
    clearTimeout(timer);
  }
}

async function mapPool(items, limit, fn) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      await fn(items[index], index);
    }
  }
  const n = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
}

async function fetchJson(path, timeoutMs = API_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(`${ORIGIN}${path}`, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        accept: "application/json",
        "user-agent": "ambeon-dev-warmup",
      },
    });
    const text = await res.text();
    const trimmed = text.trimStart();
    const looksLikeHtml =
      trimmed.startsWith("<") || trimmed.toLowerCase().startsWith("<!doctype");
    if (!res.ok || looksLikeHtml) {
      return {
        path,
        ok: false,
        ms: Date.now() - started,
        status: res.status,
        json: undefined,
      };
    }
    return {
      path,
      ok: true,
      ms: Date.now() - started,
      status: res.status,
      json: JSON.parse(text),
    };
  } catch (err) {
    const reason =
      err && typeof err === "object" && "name" in err && err.name === "AbortError"
        ? "timeout"
        : err && typeof err === "object" && "message" in err
          ? String(err.message)
          : String(err);
    return { path, ok: false, ms: Date.now() - started, status: 0, reason };
  } finally {
    clearTimeout(timer);
  }
}

async function warmupApis() {
  const payloads = {};
  const urls = firstLoadApiUrls();
  log(`prefetching ${urls.length} first-load APIs into the data cache`);
  let done = 0;
  let failed = 0;
  const started = Date.now();

  await mapPool(urls, CONCURRENCY, async (path) => {
    const result = await fetchJson(path);
    done += 1;
    if (result.ok) payloads[path] = result.json;
    else failed += 1;
    const suffix = result.ok
      ? `${result.status} in ${(result.ms / 1000).toFixed(1)}s`
      : `FAILED ${result.reason || result.status} after ${(result.ms / 1000).toFixed(1)}s`;
    log(`api ${String(done).padStart(2)}/${urls.length}  ${path}  ${suffix}`);
  });

  const extracted = payloads["/api/extracted"];
  const extra = [];
  const dataUrl = extractedFirstDataUrl(extracted);
  if (dataUrl) extra.push(dataUrl);
  const firstCompany = extracted?.companies?.[0];
  if (firstCompany?.name) {
    extra.push(
      `/api/db/preview?${new URLSearchParams({ view: "notes", company: firstCompany.name })}`,
    );
    const captureParams = new URLSearchParams({
      company: firstCompany.name,
      period: "Annual",
    });
    const years = firstCompany.years ?? [];
    const withBoth = years.find((y) => (y.availablePeriods ?? []).length >= 2);
    const year = withBoth?.year ?? years[0]?.year;
    if (year != null) captureParams.set("year", String(year));
    extra.push(`/api/extracted/captures?${captureParams.toString()}`);
  }
  const nf = payloads["/api/extracted/non-financial"];
  const nfCompany = nf?.companies?.[0]?.name;
  const nfReport = nf?.companies?.[0]?.reports?.[0]?.reportKey;
  if (nfCompany && nfReport) {
    extra.push(
      `/api/extracted/non-financial-data?${new URLSearchParams({
        company: nfCompany,
        report: nfReport,
      })}`,
    );
  }

  if (extra.length) {
    log(`prefetching ${extra.length} default table payloads`);
    for (const path of extra) {
      const result = await fetchJson(path);
      if (result.ok) payloads[path] = result.json;
      const suffix = result.ok
        ? `${result.status} in ${(result.ms / 1000).toFixed(1)}s`
        : `FAILED ${result.reason || result.status} after ${(result.ms / 1000).toFixed(1)}s`;
      log(`api extra  ${path}  ${suffix}`);
    }
  }

  mkdirSync(join(process.cwd(), ".next"), { recursive: true });
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(payloads));
  await fetch(`${ORIGIN}/api/warmup/snapshot`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payloads }),
  }).catch(() => null);

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const cached = Object.keys(payloads).length;
  if (failed) {
    warn(`data cache stored ${cached} payloads in ${secs}s (${failed} API(s) failed)`);
  } else {
    log(`data cache stored ${cached} payloads in ${secs}s — tables should appear instantly`);
  }
}

async function main() {
  if (SKIP) {
    log("SKIP_PAGE_WARMUP=1 — waiting for server only");
    const ready = await waitForServer();
    process.exit(ready ? 0 : 1);
  }

  const routes = discoverRoutes();
  if (routes.length === 0) {
    warn("no pages found under src/app");
    process.exit(0);
  }

  const ready = await waitForServer();
  if (!ready) {
    process.exit(1);
  }

  log(`compiling ${routes.length} pages (concurrency ${CONCURRENCY}) so navigation is instant`);
  const started = Date.now();
  let done = 0;
  let failed = 0;

  await mapPool(routes, CONCURRENCY, async (route) => {
    const result = await compileRoute(route);
    done += 1;
    if (!result.ok) failed += 1;
    const suffix = result.ok
      ? `${result.status} in ${(result.ms / 1000).toFixed(1)}s`
      : `FAILED ${result.reason || result.status} after ${(result.ms / 1000).toFixed(1)}s`;
    log(`${String(done).padStart(2)}/${routes.length}  ${route}  ${suffix}`);
  });

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  if (failed) {
    warn(`finished in ${secs}s with ${failed} page(s) that did not compile cleanly — opening the browser anyway`);
  } else {
    log(`all ${routes.length} pages cached in ${secs}s — navigation should be instant`);
  }

  await warmupApis();
}

main().catch((err) => {
  warn(err && typeof err === "object" && "stack" in err ? String(err.stack) : String(err));
  process.exit(1);
});
