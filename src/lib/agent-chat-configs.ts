import type { AgentChatConfig } from "@/components/ai/agent-chat-workspace";
import { sendRobinChat } from "@/lib/robin";
import { sendMarianChat } from "@/lib/marian";
import { sendTuckChat } from "@/lib/tuck";

/* ────────────────────────────────────────────────────────────────────────── *
 * Per-agent configuration for the shared full-page chat workspace.
 * ────────────────────────────────────────────────────────────────────────── */

export const ROBIN_CHAT: AgentChatConfig = {
  agent: "robin",
  name: "Robin",
  avatarSrc: "/img/robin-avatar.png",
  fallback: "RB",
  accent: "emerald",
  greeting: (firstName) =>
    `Hi ${firstName}! I'm Robin, your company intelligence assistant. Ask me about financial figures, sector briefings, employees, branches, group structure — or how external events might affect a company. I'll pull answers from the database and the web.`,
  heroSubtitle:
    "Your company intelligence assistant. Ask about financial figures, sectors, employees, branches, group structure — or how external events might affect a company.",
  suggestions: [
    "Which companies do you have data for?",
    "Show the income statement for the latest year",
    "What was total equity in the 2025 annual report?",
    "Compare total assets across the years you have",
  ],
  placeholder:
    "Ask about financials, sector, employees, branches, group structure…",
  send: (messages, signal) => sendRobinChat(messages, signal),
  reportTitleFallback: "Robin Report",
};

export const MARIAN_CHAT: AgentChatConfig = {
  agent: "marian",
  name: "Marian",
  avatarSrc: "/img/marian-avatar.png",
  fallback: "MR",
  accent: "sky",
  greeting: (firstName) =>
    `Hi ${firstName}! I'm Marian. I build the daily market wrap from live Colombo Stock Exchange data — indices, turnover, gainers, losers, most active trades — and I can also answer companies' financial and non-financial questions (sector, employees, branches, group structure) from the database. What would you like to know?`,
  heroSubtitle:
    "I build the daily CSE market wrap — indices, turnover, gainers, losers, most active trades — and answer companies' financial and non-financial questions from the database.",
  suggestions: [
    "Give me today's Daily Market Wrap",
    "How did the ASPI and S&P SL20 do today?",
    "Show today's top gainers and losers",
    "What was total equity in the 2025 annual report?",
  ],
  placeholder:
    "Ask for the market wrap, indices, gainers, financials, sector, employees…",
  send: (messages, signal) => sendMarianChat(messages, signal),
  reportTitleFallback: "Daily Market Wrap",
  pdf: {
    brand: "Ambeon Securities · Daily Market Wrap",
  },
};

export const TUCK_CHAT: AgentChatConfig = {
  agent: "tuck",
  name: "Tuck",
  avatarSrc: "/img/tuck-avatar.png",
  fallback: "TC",
  accent: "sky",
  greeting: (firstName) =>
    `Hi ${firstName}! I'm Tuck. I can pull live Colombo Stock Exchange market data — indices, gainers, losers, most active trades — and answer questions about companies' financial and non-financial data (sector, employees, branches, group structure) from the database. I can also research how external events might affect a company. What would you like to know?`,
  heroSubtitle:
    "Live CSE market data — indices, gainers, losers, most active trades — plus companies' financial and non-financial Q&A from the database, with web research on external events.",
  suggestions: [
    "How did the CSE market do today?",
    "Show today's top gainers and losers",
    "What's the latest ASPI and S&P SL20?",
    "What was total equity in the 2025 annual report?",
  ],
  placeholder: "Ask about the market, financials, sector, employees, branches…",
  send: (messages, signal) => sendTuckChat(messages, signal),
  reportTitleFallback: "Tuck Report",
};
