"use client";

import * as React from "react";
import {
  AtSign,
  Bot,
  Check,
  FolderOpen,
  KeyRound,
  Mail,
  Plus,
  Settings2,
  SlidersHorizontal,
  Trash2,
  Users,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CompanyGroupsManager } from "@/components/ai/company-groups-manager";
import {
  addEmailRecipient,
  removeEmailRecipient,
  useEmailRecipients,
} from "@/lib/email-recipients";
import {
  AGENT_CATALOG,
  addAgent,
  getAgentStatus,
  removeAgent,
  statusStyle,
  useAddedAgentIds,
  useRunningAgentIds,
  type AgentStatus,
  type AiAgent,
} from "@/lib/ai-agents";
import { RobinConfigPanel } from "@/components/ai/robin-config-panel";
import { TuckConfigPanel } from "@/components/ai/tuck-config-panel";
import { MarianConfigPanel } from "@/components/ai/marian-config-panel";

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage on mount
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
            <Users className="size-4 text-muted-foreground" />
            Your agents
          </CardTitle>
          <CardDescription>
            Build your AI team. Add the agents you want to your workspace and
            click any agent to open its configuration panel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AgentsConfigGrid />
        </CardContent>
      </Card>

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

      <EmailRecipientsCard />

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

/* ────────────────────────────────────────────────────────────────────────── *
 * Email recipients — manage the client emails reports can be sent to. Stored
 * in this browser and reused by the Robin/Tuck schedule panels.
 * ────────────────────────────────────────────────────────────────────────── */

function EmailRecipientsCard() {
  const emails = useEmailRecipients();
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const add = () => {
    const err = addEmailRecipient(draft);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setDraft("");
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-4 text-muted-foreground" />
          Client emails
        </CardTitle>
        <CardDescription>
          Add the client email addresses that summary and market reports can be
          delivered to. These are available to pick from when you schedule a
          report in an agent&apos;s configuration.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="relative flex-1">
            <AtSign className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="email"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder="client@example.com"
              className="h-9 pl-8"
              aria-label="Client email address"
            />
          </div>
          <Button type="button" size="sm" onClick={add} className="sm:h-9">
            <Plus className="size-3.5" />
            Add email
          </Button>
        </div>

        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : null}

        {emails.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/20 py-6 text-center text-sm text-muted-foreground">
            <Mail className="size-6" />
            <p>No client emails yet. Add one above to get started.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {emails.map((email) => (
              <li
                key={email}
                className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2"
              >
                <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm" title={email}>
                  {email}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeEmailRecipient(email)}
                  className="-my-1 h-7 px-2 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${email}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Agents configuration grid — shows every agent at once; clicking one opens
 * its dedicated configuration panel.
 * ────────────────────────────────────────────────────────────────────────── */

function AgentsConfigGrid() {
  const addedIds = useAddedAgentIds();
  const runningIds = useRunningAgentIds();
  const runningSet = React.useMemo(() => new Set(runningIds), [runningIds]);
  const [configAgentId, setConfigAgentId] = React.useState<string | null>(null);
  const [genericAgent, setGenericAgent] = React.useState<AiAgent | null>(null);

  const openConfig = (agent: AiAgent) => {
    if (agent.id === "robin" || agent.id === "tuck" || agent.id === "marian") {
      setConfigAgentId(agent.id);
    } else {
      setGenericAgent(agent);
    }
  };

  const genericAdded = genericAgent
    ? addedIds.includes(genericAgent.id)
    : false;

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {AGENT_CATALOG.map((agent) => (
          <AgentConfigCard
            key={agent.id}
            agent={agent}
            status={getAgentStatus(agent.id, runningSet.has(agent.id))}
            isAdded={addedIds.includes(agent.id)}
            onOpen={() => openConfig(agent)}
          />
        ))}
      </div>

      <RobinConfigPanel
        open={configAgentId === "robin"}
        onOpenChange={(o) => setConfigAgentId(o ? "robin" : null)}
      />
      <TuckConfigPanel
        open={configAgentId === "tuck"}
        onOpenChange={(o) => setConfigAgentId(o ? "tuck" : null)}
      />
      <MarianConfigPanel
        open={configAgentId === "marian"}
        onOpenChange={(o) => setConfigAgentId(o ? "marian" : null)}
      />

      {/* Generic placeholder config for agents without a dedicated panel yet. */}
      <Dialog
        open={genericAgent !== null}
        onOpenChange={(o) => {
          if (!o) setGenericAgent(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="size-4 text-primary" />
              {genericAgent?.name} · Configuration
            </DialogTitle>
            <DialogDescription>
              {genericAgent?.role} — {genericAgent?.task}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
            Dedicated configuration options for {genericAgent?.name} are coming
            soon.
          </div>
          <DialogFooter>
            {genericAgent && genericAdded ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => removeAgent(genericAgent.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
                Remove from workspace
              </Button>
            ) : null}
            <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
            {genericAgent && !genericAdded ? (
              <Button type="button" onClick={() => addAgent(genericAgent.id)}>
                <Plus className="size-3.5" />
                Add to workspace
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AgentConfigCard({
  agent,
  status,
  isAdded,
  onOpen,
}: {
  agent: AiAgent;
  status: AgentStatus;
  isAdded: boolean;
  onOpen: () => void;
}) {
  const s = statusStyle[status];
  const isLive = status !== "Offline";

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border bg-card p-4 transition-all duration-300 hover:shadow-lg hover:shadow-foreground/5 hover:ring-1 hover:ring-foreground/10">
      <div
        className={cn(
          "pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br opacity-0 transition-opacity duration-500 group-hover:opacity-100",
          agent.accent,
        )}
      />

      <div className="flex items-start gap-3">
        <div className="relative">
          <Avatar size="lg" className={cn("ring-2 ring-offset-2 ring-offset-card", s.ring)}>
            <AvatarImage src={agent.avatarSrc} alt={agent.name} />
            <AvatarFallback>{agent.fallback}</AvatarFallback>
          </Avatar>
          <span
            className={cn(
              "absolute right-0 bottom-0 z-10 size-3 rounded-full ring-2 ring-card",
              s.dot,
              isLive && "animate-pulse",
            )}
            aria-hidden
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium leading-tight">
              {agent.name}
            </span>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                s.chipBg,
                s.text,
              )}
            >
              <span className={cn("size-1.5 rounded-full", s.dot, isLive && "animate-pulse")} />
              {status}
            </span>
          </div>
          <span className="mt-0.5 text-xs text-muted-foreground">
            {agent.role}
          </span>
        </div>
      </div>

      <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
        {agent.task}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2">
        {isAdded ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
            <Check className="size-3" />
            Added
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Settings2 className="size-3.5 text-primary/70" />
            Configure to add
          </span>
        )}
        <Button
          type="button"
          variant={isAdded ? "secondary" : "default"}
          size="sm"
          onClick={onOpen}
          className="shrink-0"
        >
          {isAdded ? (
            <>
              <Settings2 className="size-3.5" />
              Configure
            </>
          ) : (
            <>
              <Plus className="size-3.5" />
              Add
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
