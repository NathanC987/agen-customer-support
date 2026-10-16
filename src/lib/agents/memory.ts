import { getConversation, listMessages, updateConversation } from "@/lib/db/repo";
import type { IntentAnalysis } from "./intent";
import type { IssueState, Message } from "@/lib/types";

/** Conversation Memory Agent: loads the full transcript and the evolving issue lifecycle. */
export function loadMemory(conversationId: string) {
  const conversation = getConversation(conversationId);
  if (!conversation) throw new Error("Conversation not found");
  const history: Message[] = listMessages(conversationId);
  return { conversation, history, state: conversation.issue_state };
}

/** Folds a new intent analysis into the issue state without forgetting earlier facts. */
export function mergeIntent(state: IssueState, intent: IntentAnalysis): IssueState {
  const entities = { ...state.entities };
  for (const [k, v] of Object.entries(intent.entities)) if (v) entities[k] = String(v);
  // a brand-new, confidently different issue replaces the intent but keeps the entities
  const switching = state.intent && intent.intent !== state.intent && intent.confidence >= 0.75 && !["greeting", "general_inquiry", "human_request", "feedback"].includes(intent.intent);
  const keepPrevious = state.intent && ["general_inquiry", "greeting"].includes(intent.intent);
  return {
    ...state,
    intent: keepPrevious ? state.intent : intent.intent,
    category: keepPrevious ? state.category : intent.category,
    entities,
    stepsCompleted: switching ? [] : state.stepsCompleted,
    turns: state.turns + 1,
  };
}

export function saveState(conversationId: string, state: IssueState, patch: Parameters<typeof updateConversation>[1] = {}) {
  updateConversation(conversationId, { ...patch, issue_state: state });
}
