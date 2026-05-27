import { api } from "./api";

export type SageMessageRole = "user" | "assistant";

export interface SageMessage {
  role: SageMessageRole;
  content: string;
}

export interface SageToolEvent {
  tool: string;
  arguments: unknown;
  result: unknown;
  ok: boolean;
  error?: string;
}

export interface SageChatResponse {
  reply: string;
  tool_events: SageToolEvent[];
}

export async function sendSageChat(
  messages: SageMessage[],
  signal?: AbortSignal,
): Promise<SageChatResponse> {
  return api<SageChatResponse>("/ai/sage/chat", {
    method: "POST",
    body: { messages },
    signal,
  });
}
