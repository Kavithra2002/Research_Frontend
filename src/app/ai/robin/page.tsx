"use client";

import { AgentChatPage } from "@/components/ai/agent-chat-page";
import { ROBIN_CHAT } from "@/lib/agent-chat-configs";

export default function RobinChatPage() {
  return <AgentChatPage config={ROBIN_CHAT} />;
}
