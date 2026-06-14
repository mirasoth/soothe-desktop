/**
 * Register all built-in event renderers. Called once from main.tsx.
 */
import { registerRenderer, registerFallback } from './registry.js';
import { AssistantBubble, HumanBubble, ToolMessageCard } from './assistant.js';
import { ReasoningCard } from './reasoning.js';
import { ToolCard } from './tool.js';
import { SubagentChip } from './subagent.js';
import { FinalReportCard } from './final-report.js';
import { GoalCard } from './goal-card.js';
import { ErrorBanner } from './error.js';
import { FallbackDebugCard } from './fallback.js';
import { ClarificationCard } from '../features/clarification/ClarificationCard.js';
import { DiffCard } from './diff.js';
import { PlanDecisionCard } from './plan-decision.js';

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

  // Goal started
  registerRenderer('soothe.cognition.strange_loop.started', GoalCard);

  // Final reports / completion
  registerRenderer('soothe.cognition.strange_loop.completed', FinalReportCard);
  registerRenderer('soothe.cognition.strange_loop.step.completed', FinalReportCard);

  // Step events — normally consumed by step-group coalescing in MessageList,
  // registered here as fallback for events that appear outside step groups.
  registerRenderer('soothe.cognition.strange_loop.step.started', ReasoningCard);
  registerRenderer('soothe.cognition.strange_loop.step.queued', ReasoningCard);
  registerRenderer('soothe.cognition.strange_loop.step.completed', FinalReportCard);

  // Plan decision — structured tree view
  registerRenderer('soothe.cognition.strange_loop.plan.decision', PlanDecisionCard);

  // Reasoning / plan
  registerRenderer('soothe.cognition.strange_loop.*', ReasoningCard);
  registerRenderer('soothe.cognition.strange_loop.*.*', ReasoningCard);
  registerRenderer('soothe.cognition.plan.*', ReasoningCard);
  registerRenderer('soothe.cognition.plan.*.*', ReasoningCard);

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
