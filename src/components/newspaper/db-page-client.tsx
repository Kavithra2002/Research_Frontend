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
            Preview and download historical financial statements in the COMB FS
            Excel format. To populate or refresh DB values, use{" "}
            <span className="font-medium">Development → Run DB Annual</span>,{" "}
            <span className="font-medium">Run DB Quarter</span>, or{" "}
            <span className="font-medium">Run DB selected all</span> after
            downloading reports from the CSE.
          </p>
        </div>
      </div>
      <NewspaperDbExplorer />
    </div>
  );
}
