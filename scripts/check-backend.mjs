/**
 * Polls the backend health endpoint and prints a clear status line in the
 * frontend dev terminal so it's obvious whether the API is reachable.
 *
 * Run by `npm run dev` via concurrently. Quits after the first successful
 * response unless WATCH=1, in which case it keeps polling and only logs
 * when the connectivity state changes.
 */

const RAW_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api";
const BASE = RAW_BASE.replace(/\/+$/, "");
const HEALTH_URL = `${BASE}/health`;
const INTERVAL_MS = Number(process.env.BACKEND_CHECK_INTERVAL_MS || 3000);
const TIMEOUT_MS = Number(process.env.BACKEND_CHECK_TIMEOUT_MS || 2500);
const MAX_INITIAL_ATTEMPTS = Number(process.env.BACKEND_CHECK_INITIAL_ATTEMPTS || 5);
const WATCH = process.env.WATCH === "1";

function ts() {
  return new Date().toISOString().slice(11, 19);
}

async function ping() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(HEALTH_URL, { signal: ctrl.signal });
    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status}` };
    }
    const body = await res.json().catch(() => null);
    const dbState = body?.db?.stateName ?? "unknown";
    const dbName = body?.db?.name ?? "?";
    return { ok: true, dbState, dbName };
  } catch (err) {
    const reason =
      err && typeof err === "object" && "message" in err
        ? String(err.message)
        : String(err);
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}

async function runOnce() {
  for (let attempt = 1; attempt <= MAX_INITIAL_ATTEMPTS; attempt += 1) {
    const result = await ping();
    if (result.ok) {
      console.log(
        `[${ts()}] [backend] backend is connected  (url=${HEALTH_URL}, db=${result.dbName} ${result.dbState})`,
      );
      return true;
    }
    if (attempt < MAX_INITIAL_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
    } else {
      console.error(
        `[${ts()}] [backend] not connected to the backend  (url=${HEALTH_URL}, reason=${result.reason})`,
      );
      console.error(
        `[${ts()}] [backend] tip: start it with \`cd backend && npm run dev\``,
      );
      return false;
    }
  }
  return false;
}

async function runWatch() {
  let lastOk = null;
  while (true) {
    const result = await ping();
    if (result.ok && lastOk !== true) {
      console.log(
        `[${ts()}] [backend] backend is connected  (url=${HEALTH_URL}, db=${result.dbName} ${result.dbState})`,
      );
      lastOk = true;
    } else if (!result.ok && lastOk !== false) {
      console.error(
        `[${ts()}] [backend] not connected to the backend  (url=${HEALTH_URL}, reason=${result.reason})`,
      );
      lastOk = false;
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

console.log(`[${ts()}] [backend] checking ${HEALTH_URL} ...`);

if (WATCH) {
  runWatch();
} else {
  runOnce().then((ok) => {
    process.exit(ok ? 0 : 1);
  });
}
