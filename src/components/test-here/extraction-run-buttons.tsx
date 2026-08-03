"use client";

import * as React from "react";
import { Play } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ExtractionRunMode =
  | "annual"
  | "quarterly"
  | "all"
  | "db-annual"
  | "db-quarterly"
  | "db-all";

type ExtractionRunButtonsProps = {
  running?: boolean;
  selectedCount: number;
  hasAnnual: boolean;
  hasQuarterly: boolean;
  /** When false, all buttons stay visible but disabled (no CSE company / local reports yet). */
  ready: boolean;
  onRun: (mode: ExtractionRunMode) => void;
  onStop?: () => void;
  className?: string;
};

const RUN_BUTTON_TOOLTIP_CLASS =
  "max-w-[11rem] border-0 bg-popover px-2 py-1 text-[10px] leading-snug text-popover-foreground shadow-md ring-1 ring-foreground/10 [&>svg]:hidden";

const BUTTONS: {
  mode: ExtractionRunMode;
  label: string;
  description: string;
  variant: "default" | "secondary" | "outline";
  needsAnnual?: boolean;
  needsQuarterly?: boolean;
  needsSelection?: boolean;
  /** "all" runners use both the annual + quarterly scripts, so both are required. */
  needsBoth?: boolean;
}[] = [
  {
    mode: "annual",
    label: "Run Annual",
    description: "Extract ticked annual PDFs into MongoDB.",
    variant: "secondary",
    needsAnnual: true,
    needsSelection: true,
  },
  {
    mode: "quarterly",
    label: "Run Quarter",
    description: "Extract ticked quarterly PDFs into MongoDB.",
    variant: "secondary",
    needsQuarterly: true,
    needsSelection: true,
  },
  {
    mode: "all",
    label: "Run selected all",
    description: "Annual + quarterly extract on all ticked files.",
    variant: "default",
    needsSelection: true,
    needsBoth: true,
  },
  {
    mode: "db-annual",
    label: "Run DB Annual",
    description: "Build annual COMB/DB data from stored tables.",
    variant: "outline",
    needsAnnual: true,
    needsSelection: true,
  },
  {
    mode: "db-quarterly",
    label: "Run DB Quarter",
    description: "Build quarterly COMB/DB data from stored tables.",
    variant: "outline",
    needsQuarterly: true,
    needsSelection: true,
  },
  {
    mode: "db-all",
    label: "Run DB selected all",
    description: "Full COMB/DB pipeline for ticked years.",
    variant: "outline",
    needsSelection: true,
    needsBoth: true,
  },
];

function disabledReason(
  spec: (typeof BUTTONS)[number],
  props: ExtractionRunButtonsProps,
): string | undefined {
  if (spec.needsSelection && props.selectedCount === 0) {
    return "Tick the local report(s) in section 2 first";
  }
  if (!props.ready) {
    return "Tick the local report(s) in section 2 first";
  }
  if (spec.needsBoth && !(props.hasAnnual && props.hasQuarterly)) {
    return "Tick both an annual and a quarterly report in section 2";
  }
  if (spec.needsAnnual && !props.hasAnnual) {
    return "Tick an annual report in section 2";
  }
  if (spec.needsQuarterly && !props.hasQuarterly) {
    return "Tick a quarterly report in section 2";
  }
  return undefined;
}

export function ExtractionRunButtons({
  running = false,
  selectedCount,
  hasAnnual,
  hasQuarterly,
  ready,
  onRun,
  onStop,
  className,
}: ExtractionRunButtonsProps) {
  if (running && onStop) {
    return (
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        {BUTTONS.map((spec) => (
          <Button key={spec.mode} size="sm" variant={spec.variant} disabled>
            {spec.label}
          </Button>
        ))}
        <Button variant="destructive" size="sm" onClick={onStop}>
          Stop
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {BUTTONS.map((spec) => {
        const reason = disabledReason(spec, {
          running,
          selectedCount,
          hasAnnual,
          hasQuarterly,
          ready,
          onRun,
        });
        const disabled = Boolean(reason) || running;
        return (
          <Tooltip key={spec.mode}>
            <TooltipTrigger
              render={
                <span className="inline-flex">
                  <Button
                    size="sm"
                    variant={spec.variant}
                    disabled={disabled}
                    onClick={() => onRun(spec.mode)}
                  >
                    <Play className="mr-1 size-3.5" />
                    {spec.label}
                    {spec.mode === "all" && selectedCount > 0 ? (
                      <Badge variant="secondary" className="ml-1 text-[10px]">
                        {selectedCount}
                      </Badge>
                    ) : null}
                  </Button>
                </span>
              }
            />
            <TooltipContent
              side="bottom"
              sideOffset={6}
              className={cn(RUN_BUTTON_TOOLTIP_CLASS, "whitespace-normal text-left")}
            >
              <span>{spec.description}</span>
              {reason ? (
                <span className="mt-0.5 block text-muted-foreground">{reason}</span>
              ) : null}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
