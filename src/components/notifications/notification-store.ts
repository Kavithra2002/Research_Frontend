"use client";

/**
 * Global notification store.
 *
 * Aggregates "live" notifications from across the app (scheduled agent reports
 * completing, Colombo Stock Exchange announcements / market status, etc.) into a
 * single feed surfaced by the header bell. Notifications are persisted to
 * localStorage so the feed survives reloads and stays in sync across tabs.
 *
 * Design mirrors components/ai/non-financial-store.ts (globalThis singleton +
 * useSyncExternalStore).
 */

export type NotificationKind = "agent" | "company" | "system";
export type NotificationAccent =
  | "emerald"
  | "sky"
  | "violet"
  | "amber"
  | "rose";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  createdAt: number;
  read: boolean;
  /** Agent id (resolves to its avatar from AGENT_CATALOG). */
  agentId?: string;
  /** Explicit avatar/icon image URL (agent avatar or company logo). */
  avatarSrc?: string;
  /** Initials fallback when no image is available. */
  fallback?: string;
  /** Company display name (used for fallback initials + label). */
  company?: string;
  /** Click target. */
  href?: string;
  /** CSE announcement id — used to scroll to the card on /announcement. */
  announcementId?: string;
  accent?: NotificationAccent;
}

export type NewNotification = Omit<AppNotification, "createdAt" | "read"> & {
  createdAt?: number;
  read?: boolean;
};

const STORAGE_KEY = "ambeon.notifications";
const MAX_ITEMS = 60;

type Internal = {
  items: AppNotification[];
  listeners: Set<() => void>;
  loaded: boolean;
};

const g = globalThis as unknown as { __ambeonNotificationStore?: Internal };
if (!g.__ambeonNotificationStore) {
  g.__ambeonNotificationStore = {
    items: [],
    listeners: new Set(),
    loaded: false,
  };
}
const store = g.__ambeonNotificationStore!;

const EMPTY: AppNotification[] = [];

function loadFromStorage() {
  if (store.loaded || typeof window === "undefined") return;
  store.loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      store.items = parsed.filter(
        (n): n is AppNotification =>
          n && typeof n.id === "string" && typeof n.title === "string",
      );
    }
  } catch {
    /* ignore corrupt storage */
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store.items));
  } catch {
    /* ignore quota errors */
  }
}

function notify() {
  for (const l of store.listeners) {
    try {
      l();
    } catch {
      /* ignore listener errors */
    }
  }
}

export function pushNotification(input: NewNotification): void {
  loadFromStorage();
  // De-duplicate by id so pollers can safely re-emit the same event.
  if (store.items.some((n) => n.id === input.id)) return;
  const item: AppNotification = {
    ...input,
    createdAt: input.createdAt ?? Date.now(),
    read: input.read ?? false,
  };
  store.items = [item, ...store.items].slice(0, MAX_ITEMS);
  persist();
  notify();
}

export function markAllRead(): void {
  if (!store.items.some((n) => !n.read)) return;
  store.items = store.items.map((n) => (n.read ? n : { ...n, read: true }));
  persist();
  notify();
}

export function markRead(id: string): void {
  let changed = false;
  store.items = store.items.map((n) => {
    if (n.id === id && !n.read) {
      changed = true;
      return { ...n, read: true };
    }
    return n;
  });
  if (changed) {
    persist();
    notify();
  }
}

export function removeNotification(id: string): void {
  const next = store.items.filter((n) => n.id !== id);
  if (next.length !== store.items.length) {
    store.items = next;
    persist();
    notify();
  }
}

export function removeNotifications(ids: string[]): void {
  if (ids.length === 0) return;
  const drop = new Set(ids);
  const next = store.items.filter((n) => !drop.has(n.id));
  if (next.length !== store.items.length) {
    store.items = next;
    persist();
    notify();
  }
}

export function clearAll(): void {
  if (store.items.length === 0) return;
  store.items = [];
  persist();
  notify();
}

export function subscribe(fn: () => void): () => void {
  loadFromStorage();
  store.listeners.add(fn);
  // Keep cross-tab state in sync.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      store.loaded = false;
      loadFromStorage();
      notify();
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    store.listeners.delete(fn);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

export function getSnapshot(): AppNotification[] {
  loadFromStorage();
  return store.items;
}

export function getServerSnapshot(): AppNotification[] {
  return EMPTY;
}
