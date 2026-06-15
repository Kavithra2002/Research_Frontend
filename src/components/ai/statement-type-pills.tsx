"use client";

import * as React from "react";
import { AlertCircle, TableProperties } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { statementLabel } from "@/lib/statement-types";

export type StatementPillItem = {
  key: string;
  title?: string | null;
  tableCount?: number;
  imageCount?: number;
  hasError?: boolean;
};

export function StatementTypePills({
  items,
  selectedKey,
  onSelect,
  className,
}: {
  items: StatementPillItem[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  className?: string;
}) {
  if (items.length === 0) return null;

  const activeKey = selectedKey ?? items[0]?.key;

  return (
    <div
      className={cn(
        "min-w-0 overflow-x-auto overflow-y-hidden",
        "[scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]",
        "[&::-webkit-scrollbar]:h-2",
        "[&::-webkit-scrollbar-track]:bg-transparent",
        "[&::-webkit-scrollbar-thumb]:rounded-full",
        "[&::-webkit-scrollbar-thumb]:bg-border",
        className,
      )}
    >
      <div className="flex w-max items-center gap-1.5 pb-1">
        {items.map((item) => {
          const isActive = item.key === activeKey;
          const label = statementLabel(item.key, item.title);
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item.key)}
              title={label}
              className={cn(
                "group flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs whitespace-nowrap transition-colors",
                "hover:bg-muted",
                isActive
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              <TableProperties
                className={cn(
                  "size-3.5 shrink-0",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              />
              <span className="max-w-[220px] truncate font-medium">{label}</span>
              {item.tableCount != null && item.tableCount > 0 ? (
                <Badge
                  variant={isActive ? "default" : "secondary"}
                  className="ml-0.5 text-[10px]"
                >
                  {item.tableCount}
                </Badge>
              ) : null}
              {item.hasError ? (
                <AlertCircle className="size-3 text-amber-500" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
