import type { Snapshot } from '../types.js';

export type ContextIntent = 'start' | 'resume' | 'update' | 'end';

/** Read-only navigation never grants permission to resume or rebind a tracker. */
export function trackingContext(data: Snapshot, intent: ContextIntent = 'update') {
  const ended = !!data.session.endedAt;
  const codingHost = data.session.host === 'codex' || data.session.host === 'claude-code';
  const bindingRequested = !ended && codingHost && data.session.hostSessionBound === false && (intent === 'start' || intent === 'resume');
  let text = ended
    ? 'Progress tracking for this session has ended. Do not resume tracking, bind a native host session, or update this tracker unless the user explicitly requests tracking again. Ending tracking does not complete unfinished tasks.'
    : 'The user selected this CheckYourProcess tracker. Reuse its trackingSessionId and canonical task IDs when reporting confirmed progress. A UI refresh or read-only view of another session never authorizes resuming or rebinding it.';
  if (bindingRequested) text += ' The user explicitly started or resumed this tracker. Only if it belongs to the current native coding host session, call resume_tracking with the actual hostSessionId supplied by lifecycle hook context to bind it. Never guess the ID, use an MCP transport ID, or bind a tracker from another host/session.';
  return {
    content: [{ type: 'text' as const, text }],
    structuredContent: {
      trackingSessionId: data.trackingSessionId, projectId: data.project?.id ?? null,
      host: data.session.host, ended, bindingRequested,
      tasks: data.tasks.map(task => ({ taskId: task.id, title: task.title, status: task.status, revision: task.revision, linked: task.sessionIds.includes(data.trackingSessionId) })),
    },
  };
}
