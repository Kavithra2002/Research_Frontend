import { api } from "./api";

export type ChatLogRole = "user" | "assistant";

export interface ChatLogMessage {
  role: ChatLogRole;
  content: string;
  ts: number;
}

export interface ChatSession {
  id: string;
  agent: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: ChatLogMessage[];
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export async function listChatSessions(
  agent: string,
): Promise<ChatSessionSummary[]> {
  const res = await api<{ sessions: ChatSessionSummary[] }>(
    `/ai/chat-log/${agent}`,
  );
  return res.sessions;
}

export async function getChatSession(
  agent: string,
  sessionId: string,
): Promise<ChatSession> {
  const res = await api<{ session: ChatSession }>(
    `/ai/chat-log/${agent}/${sessionId}`,
  );
  return res.session;
}

export async function saveChatSession(
  agent: string,
  input: {
    session_id?: string | null;
    title?: string;
    messages: ChatLogMessage[];
  },
): Promise<ChatSession> {
  const res = await api<{ session: ChatSession }>(`/ai/chat-log/${agent}`, {
    method: "POST",
    body: input,
  });
  return res.session;
}

export async function deleteChatSession(
  agent: string,
  sessionId: string,
): Promise<boolean> {
  const res = await api<{ removed: boolean }>(
    `/ai/chat-log/${agent}/${sessionId}`,
    { method: "DELETE" },
  );
  return res.removed;
}

const ACTIVE_SESSION_PREFIX = "agent-chat-active:";

/** Last in-progress session for an agent (survives route changes within the tab). */
export function getActiveSessionId(agent: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(`${ACTIVE_SESSION_PREFIX}${agent}`);
  } catch {
    return null;
  }
}

export function setActiveSessionId(agent: string, sessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`${ACTIVE_SESSION_PREFIX}${agent}`, sessionId);
  } catch {
    // storage full or unavailable
  }
}

export function clearActiveSessionId(agent: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(`${ACTIVE_SESSION_PREFIX}${agent}`);
  } catch {
    // ignore
  }
}
