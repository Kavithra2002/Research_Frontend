"use client";

import { AgentChatPage } from "@/components/ai/agent-chat-page";
import { TUCK_CHAT } from "@/lib/agent-chat-configs";

export default function TuckChatPage() {
  return <AgentChatPage config={TUCK_CHAT} />;
}
