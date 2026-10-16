"use client";

import * as React from "react";

import { NewspaperDbExplorer } from "@/components/newspaper/newspaper-db-explorer";

export function DbPageClient() {
  return (
    <div className="flex min-w-0 w-full flex-col gap-3 pt-4">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-lg font-semibold">DB</h1>
          <p className="text-sm text-muted-foreground">
            Same main FS tables as Extracted Tables — with clickable Note
            numbers that open the note table. Run{" "}
            <span className="font-medium">Run Annual</span> first so the year
            is on Extracted Tables, then{" "}
            <span className="font-medium">Development → Run DB Annual</span> to
            copy those tables and extract notes.
          </p>
        </div>
      </div>
      <NewspaperDbExplorer />
    </div>
  );
}
