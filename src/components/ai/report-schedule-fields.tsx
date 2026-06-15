"use client";

import * as React from "react";
import { CalendarDays, Clock, Mail, Repeat } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  REPORT_FREQUENCIES,
  useEmailRecipients,
  type ReportFrequency,
  type ReportSchedule,
} from "@/lib/email-recipients";

interface ReportScheduleFieldsProps {
  schedule: ReportSchedule;
  onChange: (next: ReportSchedule) => void;
  /** Tailwind accent classes (e.g. "text-emerald-500"). */
  accent?: string;
  className?: string;
}

/**
 * Expandable form used by agent configuration panels to collect the time,
 * date and recipient emails for a scheduled report. Emails come from the
 * client emails configured on the AI Configuration page.
 */
export function ReportScheduleFields({
  schedule,
  onChange,
  accent = "text-primary",
  className,
}: ReportScheduleFieldsProps) {
  const recipients = useEmailRecipients();

  const toggleEmail = (email: string) => {
    const next = schedule.emails.includes(email)
      ? schedule.emails.filter((e) => e !== email)
      : [...schedule.emails, email];
    onChange({ ...schedule, emails: next });
  };

  const isRecurring = schedule.frequency !== "once";
  const dateLabel = isRecurring ? "Start date" : "Date";
  const dateHint =
    schedule.frequency === "daily"
      ? "The report runs every day at the chosen time, starting on this date."
      : schedule.frequency === "weekly"
        ? "The report runs every week on this weekday at the chosen time."
        : schedule.frequency === "monthly"
          ? "The report runs every month on this day at the chosen time."
          : "The report runs once on this date at the chosen time.";

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-muted/20 p-4",
        className,
      )}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="schedule-time" className="flex items-center gap-1.5">
            <Clock className={cn("size-3.5", accent)} />
            Send time
          </Label>
          <Input
            id="schedule-time"
            type="time"
            value={schedule.time}
            onChange={(e) => onChange({ ...schedule, time: e.target.value })}
            className="h-9"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="schedule-date" className="flex items-center gap-1.5">
            <CalendarDays className={cn("size-3.5", accent)} />
            {dateLabel}
          </Label>
          <Input
            id="schedule-date"
            type="date"
            value={schedule.date}
            onChange={(e) => onChange({ ...schedule, date: e.target.value })}
            className="h-9"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="schedule-frequency"
            className="flex items-center gap-1.5"
          >
            <Repeat className={cn("size-3.5", accent)} />
            Repeat
          </Label>
          <select
            id="schedule-frequency"
            value={schedule.frequency}
            onChange={(e) =>
              onChange({
                ...schedule,
                frequency: e.target.value as ReportFrequency,
              })
            }
            className={cn(
              "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs",
              "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            )}
          >
            {REPORT_FREQUENCIES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="-mt-1 text-xs text-muted-foreground">{dateHint}</p>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Mail className={cn("size-3.5", accent)} />
          <span className="text-sm font-medium">Send report to</span>
          <Badge variant="secondary" className="ml-auto text-[10px]">
            {schedule.emails.length} selected
          </Badge>
        </div>

        {recipients.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-background px-3 py-4 text-center text-xs text-muted-foreground">
            No client emails configured yet. Add them in the Client emails
            section on the Configuration page first.
          </p>
        ) : (
          <div className="flex flex-col gap-1 rounded-lg border bg-background p-2">
            {recipients.map((email) => {
              const checked = schedule.emails.includes(email);
              return (
                <label
                  key={email}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted",
                    checked && "bg-primary/5",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleEmail(email)}
                  />
                  <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm" title={email}>
                    {email}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
