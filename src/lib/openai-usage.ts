import { api } from "./api";

export interface OpenAiBalance {
  /** The manually recorded balance snapshot, in USD. */
  initial: number;
  /** ISO date the snapshot was accurate (UTC). */
  asOf: string;
  /** Spend since the snapshot date, in USD. */
  spentSince: number;
  /** initial - spentSince, in USD. */
  remaining: number;
  /** True when spend could be measured (admin key present). */
  liveDecrement: boolean;
}

export interface OpenAiSpend {
  /** Spend for the current UTC day, in USD (null if no admin key). */
  today: number | null;
  /** Month-to-date spend (current UTC month), in USD (null if no admin key). */
  month: number | null;
  /** Manual balance estimate (null if not configured). */
  balance: OpenAiBalance | null;
  currency: string;
  /** ISO timestamp of when this data was fetched. */
  updatedAt: string;
}

export async function getOpenAiSpend(
  signal?: AbortSignal,
  force = false,
): Promise<OpenAiSpend> {
  const path = force ? "/openai/spend?refresh=1" : "/openai/spend";
  return api<OpenAiSpend>(path, { signal, cache: "no-store" });
}

/**
 * Record a new credit-balance snapshot (admin only). `asOf` defaults to today
 * on the server when omitted. Returns the freshly recomputed spend/balance.
 */
export async function setOpenAiBalance(
  balance: number,
  asOf?: string,
  signal?: AbortSignal,
): Promise<OpenAiSpend> {
  return api<OpenAiSpend>("/openai/balance", {
    method: "POST",
    body: { balance, asOf },
    signal,
    cache: "no-store",
  });
}
