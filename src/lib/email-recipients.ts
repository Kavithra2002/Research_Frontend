"use client";

import * as React from "react";

/* ────────────────────────────────────────────────────────────────────────── *
 * Client email recipients — a reactive, localStorage-backed list of email
 * addresses that summary/market reports can be sent to. Mirrors the store +
 * hook pattern used by `ai-agents.ts` so every panel stays in sync.
 * ────────────────────────────────────────────────────────────────────────── */

const STORAGE_KEY = "ambeon.ai.email.recipients";
export const EMAILS_UPDATED_EVENT = "ambeon:ai-emails-updated";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e): e is string => typeof e === "string");
  } catch {
    return [];
  }
}

function write(emails: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(emails));
  window.dispatchEvent(new CustomEvent(EMAILS_UPDATED_EVENT));
}

export function getEmailRecipients(): string[] {
  return read();
}

/**
 * Adds an email to the recipient list. Returns an error string when the email
 * is invalid or already present, otherwise `null` on success.
 */
export function addEmailRecipient(email: string): string | null {
  const value = email.trim().toLowerCase();
  if (!value) return "Enter an email address.";
  if (!isValidEmail(value)) return "Enter a valid email address.";
  const emails = read();
  if (emails.some((e) => e.toLowerCase() === value)) {
    return "That email is already added.";
  }
  write([...emails, value]);
  return null;
}

export function removeEmailRecipient(email: string) {
  const emails = read();
  write(emails.filter((e) => e.toLowerCase() !== email.toLowerCase()));
}

/**
 * Reactive list of the client emails the user has added. Stays in sync across
 * components (and browser tabs) via a custom event + the storage event.
 */
export function useEmailRecipients(): string[] {
  const [emails, setEmails] = React.useState<string[]>([]);

  React.useEffect(() => {
    const sync = () => setEmails(read());
    sync();
    window.addEventListener(EMAILS_UPDATED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EMAILS_UPDATED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return emails;
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Per-agent report schedule — the time, date and chosen recipient emails for
 * an agent's summary report. Stored locally, keyed by agent id.
 * ────────────────────────────────────────────────────────────────────────── */

/** How often the report should be generated and sent. */
export type ReportFrequency = "once" | "daily" | "weekly" | "monthly";

export const REPORT_FREQUENCIES: { value: ReportFrequency; label: string }[] = [
  { value: "once", label: "One time (on the date)" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
];

export interface ReportSchedule {
  /** 24h time string, e.g. "09:00". */
  time: string;
  /** ISO date string, e.g. "2026-06-09". For recurring runs this is the start date. */
  date: string;
  /** How often the report runs. */
  frequency: ReportFrequency;
  /** Recipient emails (subset of the configured recipients). */
  emails: string[];
}

export const EMPTY_SCHEDULE: ReportSchedule = {
  time: "09:00",
  date: "",
  frequency: "once",
  emails: [],
};

function normalizeFrequency(value: unknown): ReportFrequency {
  return value === "daily" || value === "weekly" || value === "monthly"
    ? value
    : "once";
}

function scheduleKey(agentId: string): string {
  return `ambeon.ai.schedule.${agentId}`;
}

export function getReportSchedule(agentId: string): ReportSchedule {
  if (typeof window === "undefined") return { ...EMPTY_SCHEDULE };
  try {
    const raw = localStorage.getItem(scheduleKey(agentId));
    if (!raw) return { ...EMPTY_SCHEDULE };
    const parsed = JSON.parse(raw) as Partial<ReportSchedule>;
    return {
      time: typeof parsed.time === "string" ? parsed.time : EMPTY_SCHEDULE.time,
      date: typeof parsed.date === "string" ? parsed.date : EMPTY_SCHEDULE.date,
      frequency: normalizeFrequency(parsed.frequency),
      emails: Array.isArray(parsed.emails)
        ? parsed.emails.filter((e): e is string => typeof e === "string")
        : [],
    };
  } catch {
    return { ...EMPTY_SCHEDULE };
  }
}

export function saveReportSchedule(agentId: string, schedule: ReportSchedule) {
  if (typeof window === "undefined") return;
  localStorage.setItem(scheduleKey(agentId), JSON.stringify(schedule));
}
