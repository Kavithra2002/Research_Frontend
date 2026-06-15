"use client";

import { AgentChatPage } from "@/components/ai/agent-chat-page";
import { MARIAN_CHAT } from "@/lib/agent-chat-configs";

export default function MarianChatPage() {
  return <AgentChatPage config={MARIAN_CHAT} />;
}
