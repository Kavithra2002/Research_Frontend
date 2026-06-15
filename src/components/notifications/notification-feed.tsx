"use client";

import * as React from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { getReportScheduleFromServer } from "@/lib/report-schedule";
import { pushNotification } from "./notification-store";

const CSE_CDN = "https://cdn.cse.lk";
const POLL_MS = 60_000;

const AGENT_META: Record<
  string,
  { name: string; href: string; accent: "emerald" | "sky" }
> = {
  robin: { name: "Robin", href: "/ai/robin", accent: "emerald" },
  tuck: { name: "Tuck", href: "/ai/tuck", accent: "sky" },
  marian: { name: "Marian", href: "/ai/marian", accent: "sky" },
};

function cseLogo(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  const trimmed = path.replace(/^\/+/, "");
  if (trimmed.startsWith("cmt/")) return `${CSE_CDN}/${trimmed}`;
  return `${CSE_CDN}/cmt/${trimmed}`;
}

async function fetchCse<T>(endpoint: string): Promise<T | null> {
  try {
    const res = await fetch(`/api/cse/${endpoint}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

type CseAnnouncement = {
  id?: number;
  announcementId?: number;
  title?: string | null;
  company?: string;
  companyName?: string | null;
  symbol?: string | null;
  logoUrl?: string | null;
  createdDate?: string | number;
};

type CseMarketStatus = { status?: string };

type CseIndex = { value?: number; change?: number; percentage?: number };

function annId(row: CseAnnouncement): string {
  return String(row.announcementId ?? row.id ?? "");
}

function annTime(row: CseAnnouncement): number {
  if (typeof row.createdDate === "number") return row.createdDate;
  if (typeof row.createdDate === "string") {
    const t = Date.parse(row.createdDate);
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}

/**
 * Background poller that turns live signals into notifications:
 *   • scheduled agent reports completing (lastRunAt changes)
 *   • CSE market status transitions (open / closed)
 *   • new CSE approved announcements (company logo when available)
 *   • notable ASPI moves
 */
export function NotificationFeed() {
  const { status } = useAuth();
  const lastRunRef = React.useRef<Record<string, string>>({});
  const marketStatusRef = React.useRef<string | null>(null);
  const annIdsRef = React.useRef<Set<string>>(new Set());
  const aspiRef = React.useRef<number | null>(null);
  const bootedRef = React.useRef(false);

  React.useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;

    const pollSchedules = async () => {
      for (const agentId of ["robin", "tuck", "marian"] as const) {
        try {
          const schedule = await getReportScheduleFromServer(agentId);
          if (!schedule?.lastRunAt) continue;
          const prev = lastRunRef.current[agentId];
          if (prev && prev !== schedule.lastRunAt) {
            const meta = AGENT_META[agentId];
            pushNotification({
              id: `report-${agentId}-${schedule.lastRunAt}`,
              kind: "agent",
              agentId,
              title: `${meta.name} report completed`,
              body: `Your scheduled ${schedule.frequency} report was generated and sent.`,
              href: meta.href,
              accent: meta.accent,
            });
          }
          lastRunRef.current[agentId] = schedule.lastRunAt;
        } catch {
          /* schedule may not exist yet */
        }
      }
    };

    const pollCse = async () => {
      const [marketStatus, aspi, approved] = await Promise.all([
        fetchCse<CseMarketStatus>("marketStatus"),
        fetchCse<CseIndex>("aspiData"),
        fetchCse<{ approvedAnnouncements?: CseAnnouncement[] }>(
          "approvedAnnouncement",
        ),
      ]);
      if (cancelled) return;

      // Market status transitions (open / closed / pre-open).
      const statusText = marketStatus?.status?.trim();
      if (statusText) {
        const prev = marketStatusRef.current;
        if (bootedRef.current && prev && prev !== statusText) {
          pushNotification({
            id: `cse-status-${statusText}-${Date.now()}`,
            kind: "system",
            title: `CSE market ${statusText}`,
            body: `Colombo Stock Exchange status changed from "${prev}" to "${statusText}".`,
            href: "/announcement",
            accent: "sky",
          });
        }
        marketStatusRef.current = statusText;
      }

      // Notable ASPI moves (≥ 0.5% since last poll).
      if (aspi?.value != null && aspi.percentage != null) {
        const prev = aspiRef.current;
        if (
          bootedRef.current &&
          prev != null &&
          Math.abs(aspi.percentage) >= 0.5 &&
          Math.abs(aspi.value - prev) > 0.01
        ) {
          const dir = aspi.percentage >= 0 ? "up" : "down";
          pushNotification({
            id: `cse-aspi-${aspi.value.toFixed(2)}-${Date.now()}`,
            kind: "system",
            title: `ASPI ${dir} ${Math.abs(aspi.percentage).toFixed(2)}%`,
            body: `All Share Price Index is at ${aspi.value.toFixed(2)} (${aspi.change != null ? (aspi.change >= 0 ? "+" : "") + aspi.change.toFixed(2) : "—"}).`,
            href: "/announcement",
            accent: aspi.percentage >= 0 ? "emerald" : "rose",
          });
        }
        aspiRef.current = aspi.value;
      }

      // New approved announcements (company logo when available).
      const rows = approved?.approvedAnnouncements ?? [];
      const seen = annIdsRef.current;
      for (const row of rows.slice(0, 25)) {
        const id = annId(row);
        if (!id) continue;
        if (!bootedRef.current) {
          seen.add(id);
          continue;
        }
        if (seen.has(id)) continue;
        seen.add(id);

        const company =
          row.companyName?.trim() ||
          row.company?.trim() ||
          row.symbol?.trim() ||
          "CSE company";
        const title = row.title?.trim() || "New announcement";
        pushNotification({
          id: `cse-ann-${id}`,
          kind: "company",
          company,
          avatarSrc: cseLogo(row.logoUrl),
          fallback: company.slice(0, 2).toUpperCase(),
          title,
          body: `${company}${row.symbol ? ` (${row.symbol})` : ""} · Colombo Stock Exchange`,
          href: "/announcement",
          accent: "amber",
          createdAt: annTime(row),
        });
      }

      // Cap memory for long sessions.
      if (seen.size > 500) {
        annIdsRef.current = new Set([...seen].slice(-300));
      }
    };

    const tick = async () => {
      await Promise.allSettled([pollSchedules(), pollCse()]);
      bootedRef.current = true;
    };

    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [status]);

  return null;
}
