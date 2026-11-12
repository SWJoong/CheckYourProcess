import { randomUUID } from 'node:crypto';
import { access, appendFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { dataDir, readRuntime } from '../dist/runtime.js';

// Opt-in diagnostic: while `debug-hook-keys.enabled` exists in the data directory, record only the FIELD NAMES of each
// hook input (plus a few short identifiers) to find out which sub-agent fields the host sends. No prompts, commands,
// file paths, tool input values or transcripts are written. Delete the marker file to stop.
const SAFE_VALUES = new Set(['hook_event_name', 'tool_name', 'agent_id', 'agent_type', 'subagent_type', 'parent_agent_id', 'permission_mode']);
const kind = value => Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
const shape = object => Object.fromEntries(Object.entries(object).map(([key, value]) => [key, kind(value)]));
// Field names only, up to four levels deep. Arrays report their length and the union of field names of their first three items.
function deepShape(value, depth = 0) {
  if (Array.isArray(value)) {
    const merged = {};
    let primitive = null;
    for (const item of value.slice(0, 3)) {
      const inner = deepShape(item, depth + 1);
      if (inner && typeof inner === 'object') Object.assign(merged, inner); else primitive = inner;
    }
    return { array: value.length, of: Object.keys(merged).length ? merged : primitive };
  }
  if (value && typeof value === 'object') return depth >= 4 ? 'object' : Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, inner]) => [key, deepShape(inner, depth + 1)]));
  return kind(value);
}
async function logHookKeys(input, event) {
  try {
    if (typeof input.tool_name === 'string' && input.tool_name.includes('checkyourprocess')) return;
    const directory = dataDir();
    await access(join(directory, 'debug-hook-keys.enabled'));
    const file = join(directory, 'debug-hook-keys.log');
    if ((await stat(file).then(info => info.size, () => 0)) > 2_000_000) return;
    const values = Object.fromEntries(Object.entries(input).filter(([key, value]) => SAFE_VALUES.has(key) && typeof value === 'string').map(([key, value]) => [key, value.slice(0, 80)]));
    const toolInput = input.tool_input && typeof input.tool_input === 'object' && !Array.isArray(input.tool_input) ? deepShape(input.tool_input) : undefined;
    const toolResponse = input.tool_response && typeof input.tool_response === 'object' ? deepShape(input.tool_response) : undefined;
    await appendFile(file, `${JSON.stringify({ at: new Date().toISOString(), event, session: typeof input.session_id === 'string' ? input.session_id.slice(0, 8) : null, keys: shape(input), values, toolInputKeys: toolInput, toolResponseKeys: toolResponse })}
`);
  } catch { /* Diagnostics are best effort and must never affect the host. */ }
}

// A plan tool's list becomes the session's tasks. Only content and status leave this process, and only to the local service.
const PLAN_TOOLS = /(^|__)(update_plan|TodoWrite)$/;
const PLAN_STATUSES = new Set(['pending', 'in_progress', 'completed']);
function planItemsOf(input) {
  if (typeof input.tool_name !== 'string' || !PLAN_TOOLS.test(input.tool_name)) return undefined;
  const list = input.tool_input?.items ?? input.tool_input?.todos;
  if (!Array.isArray(list) || list.length === 0 || list.length > 100) return undefined;
  const items = list.map(item => ({ content: typeof item?.content === 'string' ? item.content.trim().slice(0, 500) : '', status: item?.status }));
  return items.every(item => item.content && PLAN_STATUSES.has(item.status)) ? items : undefined;
}

// Two sub-agent facts that decide when a background sub-agent is really finished. Only an ID and a flag leave this process.
function agentMarkers(input, event, agentId) {
  if (event !== 'tool-end') return {};
  if (input.tool_name === 'SubagentHandback' && agentId) return { handback: true };
  const launched = input.tool_name === 'Agent' && !agentId && input.tool_response?.isAsync === true ? input.tool_response.agentId : undefined;
  return typeof launched === 'string' && launched ? { asyncAgentId: launched } : {};
}

const [host, event] = process.argv.slice(2);
if (!['claude-code', 'codex'].includes(host)) process.exit(0);
let raw = '';
for await (const chunk of process.stdin) {
  raw += chunk;
  if (raw.length > 1_048_576) process.exit(0);
}
try {
  const input = JSON.parse(raw || '{}');
  await logHookKeys(input, event);
  const hostSessionId = input.session_id;
  if (typeof hostSessionId !== 'string' || !hostSessionId) process.exit(0);
  if (event === 'session-start') {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: `CheckYourProcess is installed. This ${host} host session ID is ${JSON.stringify(hostSessionId)}. Only when the user explicitly starts tracking, pass this exact hostSessionId to start_tracking/resume_tracking and host=${JSON.stringify(host)}. Use server-returned trackingSessionId and task IDs afterward. Installing the plugin does not authorize tracking. Never read transcripts for tracking.`,
    } }));
    process.exit(0);
  }
  // UI polling and tracker tools must not make the agent appear busy.
  if (typeof input.tool_name === 'string' && input.tool_name.includes('checkyourprocess')) process.exit(0);
  const runtime = await readRuntime();
  if (!runtime) process.exit(0);
  const toolUseId = typeof input.tool_use_id === 'string' ? input.tool_use_id : undefined;
  const agentId = typeof input.agent_id === 'string' && input.agent_id ? input.agent_id : undefined;
  // A sub-agent can start and stop many times (it pauses while waiting on its own commands), so only tool calls have a stable ID.
  const eventId = toolUseId ? `${hostSessionId}:${toolUseId}:${event}` : `${hostSessionId}:${event}:${randomUUID()}`;
  const response = await fetch(`${runtime.url}/api/hook`, {
    method: 'POST',
    headers: { authorization: `Bearer ${runtime.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ host, hostSessionId, event, eventId, toolUseId, agentId, planItems: event === 'tool-end' ? planItemsOf(input) : undefined, ...agentMarkers(input, event, agentId) }),
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) process.stderr.write('CheckYourProcess: activity update unavailable.\n');
} catch {
  // Tracking must never block or alter the underlying coding operation.
  process.stderr.write('CheckYourProcess: activity update unavailable.\n');
}
