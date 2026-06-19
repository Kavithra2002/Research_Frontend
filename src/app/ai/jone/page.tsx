"use client";

import { AgentChatPage } from "@/components/ai/agent-chat-page";
import { JONE_CHAT } from "@/lib/agent-chat-configs";

export default function JoneChatPage() {
  return <AgentChatPage config={JONE_CHAT} />;
}
