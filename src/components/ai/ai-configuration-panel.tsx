"use client";

import * as React from "react";
import { Bot, FolderOpen, KeyRound, SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CompanyGroupsManager } from "@/components/ai/company-groups-manager";

const STORAGE_KEY = "ambeon.ai.extraction.config";

export type AiExtractionConfig = {
  model: string;
  option: "1" | "2";
  dpi: number;
};

const DEFAULT_CONFIG: AiExtractionConfig = {
  model: "gpt-4o",
  option: "1",
  dpi: 150,
};

const MODEL_OPTIONS = [
  { value: "gpt-4o", label: "GPT-4o (higher quality)" },
  { value: "gpt-4o-mini", label: "GPT-4o mini (faster, lower cost)" },
];

function loadConfig(): AiExtractionConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<AiExtractionConfig>;
    return {
      model: parsed.model ?? DEFAULT_CONFIG.model,
      option: parsed.option === "2" ? "2" : "1",
      dpi:
        typeof parsed.dpi === "number" && parsed.dpi >= 72 && parsed.dpi <= 300
          ? parsed.dpi
          : DEFAULT_CONFIG.dpi,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(config: AiExtractionConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function AiConfigurationPanel() {
  const [config, setConfig] = React.useState<AiExtractionConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    setConfig(loadConfig());
  }, []);

  const update = (patch: Partial<AiExtractionConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    saveConfig(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SlidersHorizontal className="size-4 text-muted-foreground" />
            Extraction defaults
          </CardTitle>
          <CardDescription>
            Preferences used when running the Data_retrive pipeline from System.
            Stored in this browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ai-model" className="flex items-center gap-2">
              <Bot className="size-3.5 text-muted-foreground" />
              OpenAI model
            </Label>
            <select
              id="ai-model"
              value={config.model}
              onChange={(e) => update({ model: e.target.value })}
              className={cn(
                "flex h-9 w-full max-w-md rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs",
                "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
              )}
            >
              {MODEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="ai-option">Statement scope</Label>
            <select
              id="ai-option"
              value={config.option}
              onChange={(e) =>
                update({ option: e.target.value === "2" ? "2" : "1" })
              }
              className={cn(
                "flex h-9 w-full max-w-md rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs",
                "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
              )}
            >
              <option value="1">Option 1 — Core statements only</option>
              <option value="2">Option 2 — Core statements + Notes</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="ai-dpi">Capture DPI</Label>
            <div className="flex max-w-md items-center gap-3">
              <input
                id="ai-dpi"
                type="range"
                min={72}
                max={300}
                step={6}
                value={config.dpi}
                onChange={(e) => update({ dpi: Number(e.target.value) })}
                className="flex-1"
              />
              <Badge variant="secondary" className="tabular-nums">
                {config.dpi}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Higher DPI improves OCR quality but increases image size and API
              cost.
            </p>
          </div>

          {saved ? (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Settings saved.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="size-4 text-muted-foreground" />
            Data locations
          </CardTitle>
          <CardDescription>
            Where extracted JSON and report captures are read from (server-side).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Extracted output
            </div>
            <code className="mt-1 block rounded-md bg-muted px-2 py-1.5 text-xs">
              ../testing/ (EXTRACTED_JSON_DIR)
            </code>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Source reports
            </div>
            <code className="mt-1 block rounded-md bg-muted px-2 py-1.5 text-xs">
              ../reports/ (REPORTS_DIR)
            </code>
          </div>
        </CardContent>
      </Card>

      <CompanyGroupsManager />

      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" />
            API key
          </CardTitle>
          <CardDescription>
            OpenAI credentials are configured on the server (environment or{" "}
            <code className="text-xs">backend/.env</code>), not in the browser.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Run extractions from the System page or via{" "}
            <code className="rounded bg-muted px-1 text-xs">Data_retrive.py</code>{" "}
            with <code className="rounded bg-muted px-1 text-xs">--apikey</code>{" "}
            or <code className="rounded bg-muted px-1 text-xs">OPENAI_API_KEY</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export function getAiExtractionConfig(): AiExtractionConfig {
  return loadConfig();
}
