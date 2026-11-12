import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { VERSION } from './runtime.js';

const id = z.string().min(1).max(200);
const mutationId = id.describe('Unique id for this intended mutation. Reuse it only when retrying the identical operation.');
const session = { trackingSessionId: id };
const scope = z.enum(['session', 'project']).optional();
const host = z.enum(['claude-code', 'codex', 'claude-desktop', 'chatgpt']);
const text = z.string().trim().min(1).max(500);
export const ACTION_SCHEMAS = {
  start_tracking: z.object({ host, title: text, projectId: id.optional(), projectName: text.optional(), hostSessionId: id.optional(), mutationId }).strict(),
  resume_tracking: z.object({ ...session, hostSessionId: id.optional(), mutationId }).strict(),
  create_project: z.object({ name: text, mutationId }).strict(),
  connect_project: z.object({ ...session, projectId: id, mutationId }).strict(),
  register_tasks: z.object({ ...session, titles: z.array(text).min(1).max(100), mutationId }).strict(),
  link_tasks: z.object({ ...session, taskIds: z.array(id).min(1).max(100), mutationId }).strict(),
  update_task: z.object({ ...session, taskId: id, status: z.enum(['pending', 'in_progress', 'completed']), expectedRevision: z.number().int().min(0), mutationId }).strict(),
  report_state: z.object({ ...session, activity: z.enum(['idle', 'running', 'waiting', 'interrupted', 'error']), currentTaskId: id.nullable().optional(), mutationId }).strict(),
  end_tracking: z.object({ ...session, mutationId }).strict(),
  get_snapshot: z.object({ ...session, scope }).strict(),
  get_catalog: z.object({}).strict(),
  save_settings: z.object({ locale: z.enum(['ko', 'en']), mutationId }).strict(),
} as const;

const descriptions: Record<keyof typeof ACTION_SCHEMAS, string> = {
  start_tracking: 'Opt in this conversation to progress tracking. Create a standalone session, a new project via projectName, or join an existing projectId. Save the returned trackingSessionId and canonical task IDs; they are independent of MCP connection IDs.',
  resume_tracking: 'Resume an explicitly selected trackingSessionId. Never guess a session by title. Coding hosts may supply the exact hostSessionId from their hook context.',
  create_project: 'Create a shared project for parallel conversations. Project names are display labels; only IDs identify projects.',
  connect_project: 'Connect a standalone tracking session to a chosen shared project. Existing private tasks move with it. Reassigning an already shared session is rejected.',
  register_tasks: 'Register named steps for a tracked session. New steps receive canonical IDs; matching titles are never merged. Reuse mutationId for retries.',
  link_tasks: 'Attach existing canonical project tasks to another session without duplicating them. Use this for parallel work on the same plan.',
  update_task: 'Update a linked task after confirmed work. Supply its current expectedRevision and a new mutationId. On CONFLICT fetch the latest snapshot and reassess before retrying; never blindly overwrite newer work.',
  report_state: 'Report the current session activity observed by the agent. This is a last-reported state, not direct host telemetry. It never completes tasks.',
  end_tracking: 'Stop tracking this session without completing any unfinished task. Project completion is based only on task states.',
  get_snapshot: 'Show the live progress band for the requested trackingSessionId. Choose session scope or the unique task list of its project.',
  get_catalog: 'Open CheckYourProcess and list available projects and tracked sessions for explicit selection. This read does not advance progress or agent activity.',
  save_settings: 'Set the shared CheckYourProcess display language to Korean (ko) or English (en). User-authored task titles stay unchanged.',
};

export type ExecuteAction = (action: string, args: Record<string, unknown>) => unknown | Promise<unknown>;
export const UI_URI = 'ui://checkyourprocess/progress-v1.html';

export function errorPayload(error: unknown) {
  if (error instanceof z.ZodError) return { code: 'INVALID_INPUT', message: 'Invalid input.', details: error.issues.map(issue => ({ path: issue.path, message: issue.message })) };
  const value = error as { code?: string; message?: string; details?: unknown };
  return { code: typeof value?.code === 'string' ? value.code : 'INTERNAL_ERROR', message: value?.code ? value.message || 'Request failed.' : 'The local service could not complete this request.', ...(value?.details === undefined ? {} : { details: value.details }) };
}

export interface McpOptions {
  /** false removes the in-chat card (UI resource, UI metadata and the app-only refresh tool); the tools keep working. */
  card?: boolean;
}

export function createMcpServer(execute: ExecuteAction, htmlPath = fileURLToPath(new URL('./progress.html', import.meta.url)), options: McpOptions = {}): McpServer {
  const card = options.card !== false;
  const server = new McpServer({ name: 'checkyourprocess', version: VERSION }, {
    instructions: 'Only track work after the user opts in. Start or explicitly resume a tracking session and preserve its ID. Register the agreed steps and save returned task IDs; mark a step completed only after confirmed work. Before doing work report running; report waiting, interruption, or error when known. End of an answer never means all tasks completed. Shared project tasks use the same canonical IDs across sessions. A hostSessionId must come from host hook context, never MCP transport IDs.',
  });

  for (const [name, schema] of Object.entries(ACTION_SCHEMAS)) {
    const readOnly = name === 'get_snapshot' || name === 'get_catalog';
    const renders = card && (name === 'start_tracking' || readOnly);
    registerAppTool(server, name, {
      title: name.replaceAll('_', ' '), description: descriptions[name as keyof typeof descriptions],
      inputSchema: schema.shape,
      annotations: { readOnlyHint: readOnly, destructiveHint: false, openWorldHint: false, idempotentHint: true },
      _meta: renders ? { ui: { resourceUri: UI_URI }, 'openai/outputTemplate': UI_URI } : {},
    }, async (args: Record<string, unknown>) => resultFor(execute, name, schema.parse(args)));
  }
  if (card) registerAppTool(server, 'poll_progress', {
    title: 'Refresh progress', description: 'Read-only live progress refresh for the displayed app. Does not change agent activity.',
    inputSchema: ACTION_SCHEMAS.get_snapshot.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    _meta: { ui: { resourceUri: UI_URI, visibility: ['app'] } },
  }, async args => resultFor(execute, 'get_snapshot', ACTION_SCHEMAS.get_snapshot.parse(args)));
  registerAppTool(server, 'show_progress', {
    title: 'Show CheckYourProcess',
    description: card
      ? 'Open the progress UI; include a trackingSessionId to select a session, or omit it to choose/start one.'
      : 'Return the progress snapshot for a trackingSessionId, or the catalog when omitted. This host shows progress in its own bar, so no card opens.',
    inputSchema: { trackingSessionId: id.optional(), scope },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    _meta: card ? { ui: { resourceUri: UI_URI }, 'openai/outputTemplate': UI_URI } : {},
  }, async args => resultFor(execute, args.trackingSessionId ? 'get_snapshot' : 'get_catalog', args.trackingSessionId ? args : {}));

  if (card) registerAppResource(server, 'CheckYourProcess progress', UI_URI, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
    contents: [{ uri: UI_URI, mimeType: RESOURCE_MIME_TYPE, text: await readFile(htmlPath, 'utf8'), _meta: {
      ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: false },
      'openai/widgetDescription': 'Compact progress band with session/project view, task list, and Korean/English settings. Activity is either host-observed or explicitly last reported.',
      'openai/widgetPrefersBorder': false,
    } }],
  }));
  return server;
}

async function resultFor(execute: ExecuteAction, action: string, args: Record<string, unknown>) {
  try {
    const result = await execute(action, args) as Record<string, unknown>;
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result };
  } catch (error) {
    const payload = errorPayload(error);
    return { isError: true, content: [{ type: 'text' as const, text: `${payload.code}: ${payload.message}` }], structuredContent: { error: payload } };
  }
}
