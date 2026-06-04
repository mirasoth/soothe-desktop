/**
 * Register all built-in event renderers. Called once from main.tsx.
 */
import { registerRenderer, registerFallback } from './registry.js';
import { AssistantBubble, HumanBubble, ToolMessageCard } from './assistant.js';
import { ReasoningCard } from './reasoning.js';
import { ToolCard } from './tool.js';
import { SubagentChip } from './subagent.js';
import { FinalReportCard } from './final-report.js';
import { ErrorBanner } from './error.js';
import { FallbackDebugCard } from './fallback.js';
import { ClarificationCard } from '../features/clarification/ClarificationCard.js';
import { DiffCard } from './diff.js';

export function registerAllRenderers(): void {
  // LangChain wire tags (canonical per IG-440):
  //   short tags: ai, human, system, tool         — used for full messages
  //   long tags : AIMessageChunk, HumanMessageChunk — used for streaming chunks
  registerRenderer('ai', AssistantBubble);
  registerRenderer('AIMessage', AssistantBubble);
  registerRenderer('AIMessageChunk', AssistantBubble);
  registerRenderer('human', HumanBubble);
  registerRenderer('HumanMessage', HumanBubble);
  registerRenderer('HumanMessageChunk', HumanBubble);
  registerRenderer('tool', ToolMessageCard);
  registerRenderer('ToolMessage', ToolMessageCard);

  // Final reports / completion
  registerRenderer('soothe.cognition.agent_loop.completed', FinalReportCard);
  registerRenderer('soothe.cognition.agentic.step.completed', FinalReportCard);

  // Reasoning / plan
  registerRenderer('soothe.cognition.agent_loop.*', ReasoningCard);
  registerRenderer('soothe.cognition.plan.*', ReasoningCard);

  // Tools
  registerRenderer('soothe.tool.execution.*', ToolCard);

  // File diff
  registerRenderer('soothe.tool.execution.file_change', DiffCard);
  registerRenderer('soothe.file.*', DiffCard);

  // Subagents
  registerRenderer('soothe.subagent.*.*', SubagentChip);

  // Clarification
  registerRenderer('soothe.loop.clarification.*', ClarificationCard);

  // Errors
  registerRenderer('soothe.error.*', ErrorBanner);
  registerRenderer('error', ErrorBanner);

  registerFallback(FallbackDebugCard);
}
