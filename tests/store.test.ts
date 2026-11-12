import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { TrackerStore, StoreError } from '../src/store.js';
import type { Catalog, Snapshot } from '../src/types.js';

function setup() {
  const store = new TrackerStore(':memory:');
  const call = (action: string, args: Record<string, unknown> = {}) => store.execute(action, { mutationId: randomUUID(), ...args }) as any;
  const start = (args: Record<string, unknown> = {}) => call('start_tracking', { host: 'codex', title: 'Session', ...args }) as Snapshot;
  return { store, call, start };
}

test('parallel sessions aggregate unique project tasks and keep their own views', () => {
  const { store, call, start } = setup();
  try {
    const a = start({ projectName: 'Shared' });
    const b = start({ host: 'claude-code', projectId: a.project!.id });
    const planA = call('register_tasks', { trackingSessionId: a.trackingSessionId, titles: ['Frontend', 'API'] }) as Snapshot;
    const planB = call('register_tasks', { trackingSessionId: b.trackingSessionId, titles: ['Tests'] }) as Snapshot;
    call('link_tasks', { trackingSessionId: b.trackingSessionId, taskIds: [planA.tasks[1].id] });
    call('update_task', { trackingSessionId: a.trackingSessionId, taskId: planA.tasks[0].id, expectedRevision: 1, status: 'completed' });
    call('update_task', { trackingSessionId: b.trackingSessionId, taskId: planB.tasks[0].id, expectedRevision: 1, status: 'completed' });
    const project = call('get_snapshot', { trackingSessionId: a.trackingSessionId, scope: 'project' }) as Snapshot;
    assert.deepEqual(project.progress, { completed: 2, total: 3, percent: 66 });
    assert.equal(project.sessions.length, 2);
    assert.equal(project.tasks.find(t => t.id === planA.tasks[1].id)!.sessionIds.length, 2);
    assert.deepEqual(call('get_snapshot', { trackingSessionId: a.trackingSessionId }).progress, { completed: 1, total: 2, percent: 50 });
  } finally { store.close(); }
});

test('stale task updates fail without overwriting the completed state', () => {
  const { store, call, start } = setup();
  try {
    const s = start();
    const task = call('register_tasks', { trackingSessionId: s.trackingSessionId, titles: ['Shared task'] }).tasks[0];
    const args = { trackingSessionId: s.trackingSessionId, taskId: task.id, expectedRevision: 1 };
    call('update_task', { ...args, status: 'completed' });
    assert.throws(() => call('update_task', { ...args, status: 'in_progress' }), (e: any) => e instanceof StoreError && e.code === 'CONFLICT' && (e.details as any).task.revision === 2);
    assert.equal(call('get_snapshot', { trackingSessionId: s.trackingSessionId }).tasks[0].status, 'completed');
  } finally { store.close(); }
});

test('retries are idempotent, but reusing a mutation ID for different input fails', () => {
  const { store, call, start } = setup();
  try {
    const s = start();
    const args = { trackingSessionId: s.trackingSessionId, titles: ['Task'], mutationId: 'retry-1' };
    const first = call('register_tasks', args);
    assert.deepEqual(call('register_tasks', args), first);
    assert.equal(call('get_snapshot', { trackingSessionId: s.trackingSessionId }).tasks.length, 1);
    assert.throws(() => call('register_tasks', { ...args, titles: ['Other'] }), (e: any) => e.code === 'CONFLICT');
  } finally { store.close(); }
});

test('equal titles do not accidentally merge unrelated work', () => {
  const { store, call, start } = setup();
  try {
    const s = start();
    assert.equal(call('register_tasks', { trackingSessionId: s.trackingSessionId, titles: ['Check', 'Check'] }).tasks.length, 2);
  } finally { store.close(); }
});

test('standalone work can join a project without losing tasks; cross-project links are rejected', () => {
  const { store, call, start } = setup();
  try {
    const alone = start();
    const task = call('register_tasks', { trackingSessionId: alone.trackingSessionId, titles: ['Existing work'] }).tasks[0];
    const target = start({ projectName: 'Target' });
    const connected = call('connect_project', { trackingSessionId: alone.trackingSessionId, projectId: target.project!.id });
    assert.equal(connected.tasks[0].id, task.id);
    assert.equal(connected.tasks[0].projectId, target.project!.id);
    assert.equal(connected.tasks[0].revision, 2);
    const other = start({ projectName: 'Other' });
    assert.throws(() => call('link_tasks', { trackingSessionId: other.trackingSessionId, taskIds: [task.id] }), (e: any) => e.code === 'PROJECT_MISMATCH');
    assert.throws(() => call('connect_project', { trackingSessionId: alone.trackingSessionId, projectId: other.project!.id }), (e: any) => e.code === 'PROJECT_CHANGE');
  } finally { store.close(); }
});

test('bulk linking rolls back every link when any task belongs to another project', () => {
  const { store, call, start } = setup();
  try {
    const a = start({ projectName: 'A' });
    const b = start({ projectId: a.project!.id });
    const c = start({ projectName: 'C' });
    const ta = call('register_tasks', { trackingSessionId: a.trackingSessionId, titles: ['A'] }).tasks[0];
    const tc = call('register_tasks', { trackingSessionId: c.trackingSessionId, titles: ['C'] }).tasks[0];
    assert.throws(() => call('link_tasks', { trackingSessionId: b.trackingSessionId, taskIds: [ta.id, tc.id] }));
    assert.equal(call('get_snapshot', { trackingSessionId: b.trackingSessionId }).tasks.length, 0);
  } finally { store.close(); }
});

test('no plan is unknown; stopping or ending a session never completes its tasks', () => {
  const { store, call, start } = setup();
  try {
    const s = start({ hostSessionId: 'native-1' });
    assert.equal(s.progress.percent, null);
    call('register_tasks', { trackingSessionId: s.trackingSessionId, titles: ['Not finished'] });
    store.handleHook({ host: 'codex', hostSessionId: 'native-1', event: 'stop', eventId: 'stop' });
    let current = call('get_snapshot', { trackingSessionId: s.trackingSessionId });
    assert.equal(current.session.activity, 'waiting');
    assert.equal(current.progress.percent, 0);
    current = call('end_tracking', { trackingSessionId: s.trackingSessionId });
    assert.ok(current.session.endedAt);
    assert.equal(current.progress.percent, 0);
    assert.throws(() => call('register_tasks', { trackingSessionId: s.trackingSessionId, titles: ['More'] }), (e: any) => e.code === 'SESSION_ENDED');
    assert.equal(call('resume_tracking', { trackingSessionId: s.trackingSessionId }).session.endedAt, null);
  } finally { store.close(); }
});

test('native hook tracking is opt-in, deduplicated, and late completion preserves interruption', () => {
  const { store, call, start } = setup();
  try {
    assert.deepEqual(store.handleHook({ host: 'codex', hostSessionId: 'unbound', event: 'prompt', eventId: '1' }), { ignored: true });
    const s = start({ hostSessionId: 'bound' });
    const hook = (event: string, eventId: string, toolUseId?: string) => store.handleHook({ host: 'codex', hostSessionId: 'bound', event, eventId, toolUseId });
    hook('prompt', '1'); hook('tool-start', '2', 'tool-a'); hook('tool-start', '3', 'tool-b');
    assert.deepEqual(hook('tool-start', '3', 'tool-b'), { duplicate: true });
    hook('interrupt', '4'); hook('tool-end', '5', 'tool-a'); hook('tool-end', '6', 'tool-b');
    const snap = call('get_snapshot', { trackingSessionId: s.trackingSessionId });
    assert.equal(snap.session.activity, 'interrupted');
    assert.equal(snap.session.activitySource, 'hook');
  } finally { store.close(); }
});

test('permission wait clears on successful tool return during an active turn', () => {
  const { store, call, start } = setup();
  try {
    const s = start({ hostSessionId: 'permission' });
    const hook = (event: string) => store.handleHook({ host: 'codex', hostSessionId: 'permission', event, eventId: randomUUID(), toolUseId: 'tool' });
    hook('prompt'); hook('tool-start'); hook('permission'); hook('tool-end');
    assert.equal(call('get_snapshot', { trackingSessionId: s.trackingSessionId }).session.activity, 'running');
  } finally { store.close(); }
});

test('reading snapshots never makes old activity look fresh', () => {
  let time = '2026-11-11T00:00:00Z';
  const store = new TrackerStore(':memory:', () => time);
  try {
    const s = store.execute('start_tracking', { host: 'chatgpt', title: 'Chat', mutationId: 'start' }) as Snapshot;
    store.execute('report_state', { trackingSessionId: s.trackingSessionId, activity: 'running', mutationId: 'state' });
    time = '2026-11-11T01:00:00Z';
    const snap = store.execute('get_snapshot', { trackingSessionId: s.trackingSessionId }) as Snapshot;
    assert.equal(snap.session.lastAgentEventAt, '2026-11-11T00:00:00Z');
    assert.equal(snap.snapshotAt, time);
    assert.equal(snap.session.activitySource, 'reported');
  } finally { store.close(); }
});

test('settings, tasks, idempotency, and explicit session identity survive restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cyp-store-'));
  const path = join(dir, 'tracker.sqlite');
  let store = new TrackerStore(path);
  try {
    const s = store.execute('start_tracking', { host: 'claude-code', title: 'Persistent', hostSessionId: 'native', mutationId: 's' }) as Snapshot;
    const args = { trackingSessionId: s.trackingSessionId, titles: ['Persist'], mutationId: 'task' };
    store.execute('register_tasks', args);
    store.execute('save_settings', { locale: 'en', mutationId: 'lang' });
    store.close(); store = new TrackerStore(path);
    assert.equal((store.execute('get_catalog') as Catalog).settings.locale, 'en');
    assert.equal((store.execute('register_tasks', args) as Snapshot).tasks.length, 1);
    assert.deepEqual(store.execute('get_binding', { host: 'claude-code', hostSessionId: 'native' }), { trackingSessionId: s.trackingSessionId });
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('input boundaries reject invalid locale, status, blank names and malformed revisions', () => {
  const { store, call, start } = setup();
  try {
    assert.throws(() => start({ title: '  ' }), (e: any) => e.code === 'INVALID_INPUT');
    assert.throws(() => call('save_settings', { locale: 'fr' }), (e: any) => e.code === 'INVALID_INPUT');
    const s = start();
    const t = call('register_tasks', { trackingSessionId: s.trackingSessionId, titles: ['Task'] }).tasks[0];
    assert.throws(() => call('update_task', { trackingSessionId: s.trackingSessionId, taskId: t.id, expectedRevision: '1', status: 'completed' }), (e: any) => e.code === 'INVALID_INPUT');
    assert.throws(() => call('report_state', { trackingSessionId: s.trackingSessionId, activity: 'thinking' }), (e: any) => e.code === 'INVALID_INPUT');
  } finally { store.close(); }
});

test('viewing or binding an active session preserves its reported activity and resumes only one native chat', () => {
  const { store, call, start } = setup();
  try {
    const s = start({ hostSessionId: 'old-chat' });
    assert.equal(s.session.hostSessionBound, true);
    call('report_state', { trackingSessionId: s.trackingSessionId, activity: 'running' });
    const resumed = call('resume_tracking', { trackingSessionId: s.trackingSessionId, hostSessionId: 'new-chat' });
    assert.equal(resumed.session.activity, 'running');
    assert.deepEqual(call('get_binding', { host: 'codex', hostSessionId: 'old-chat' }), { trackingSessionId: null });
    assert.deepEqual(call('get_binding', { host: 'codex', hostSessionId: 'new-chat' }), { trackingSessionId: s.trackingSessionId });
  } finally { store.close(); }
});

function hooks(store: TrackerStore, hostSessionId: string) {
  let n = 0;
  return (event: string, extra: Record<string, unknown> = {}) =>
    store.handleHook({ host: 'claude-code', hostSessionId, event, eventId: `e${++n}`, ...extra } as any) as any;
}

test('a host plan list becomes session tasks: new items add work, repeats reuse tasks, stale lists never undo progress', () => {
  const { store, call, start } = setup();
  try {
    const s = start({ host: 'claude-code', hostSessionId: 'plan-1' });
    const hook = hooks(store, 'plan-1');
    const snap = () => call('get_snapshot', { trackingSessionId: s.trackingSessionId }) as Snapshot;

    hook('tool-end', { toolUseId: 't1', planItems: [{ content: 'Read code', status: 'in_progress' }, { content: 'Write tests', status: 'pending' }] });
    assert.deepEqual(snap().tasks.map(t => [t.title, t.status]), [['Read code', 'in_progress'], ['Write tests', 'pending']]);
    assert.equal(snap().progress.percent, 0);

    const ids = snap().tasks.map(t => t.id);
    hook('tool-end', { toolUseId: 't2', planItems: [{ content: 'Read code', status: 'completed' }, { content: 'Write tests', status: 'pending' }, { content: 'Added later', status: 'pending' }] });
    assert.deepEqual(snap().tasks.slice(0, 2).map(t => t.id), ids, 'equal titles keep their canonical IDs');
    assert.equal(snap().progress.total, 3, 'a request added mid-session grows the total');
    assert.equal(snap().progress.percent, 33);

    hook('tool-end', { toolUseId: 't3', planItems: [{ content: 'Read code', status: 'pending' }, { content: 'Write tests', status: 'in_progress' }] });
    assert.equal(snap().tasks[0].status, 'completed', 'a stale list cannot reopen a completed task');
    assert.equal(snap().tasks[1].status, 'in_progress');
    assert.equal(snap().progress.total, 3, 'tasks missing from a later list are kept');
  } finally { store.close(); }
});

test('plan lists reuse tasks the agent registered with the same title and ignore unbound or sub-agent sources', () => {
  const { store, call, start } = setup();
  try {
    const s = start({ host: 'claude-code', hostSessionId: 'plan-2' });
    call('register_tasks', { trackingSessionId: s.trackingSessionId, titles: ['Shared step'] });
    const hook = hooks(store, 'plan-2');
    hook('tool-end', { toolUseId: 't1', planItems: [{ content: 'Shared step', status: 'completed' }, { content: 'Other', status: 'pending' }] });
    const snap = call('get_snapshot', { trackingSessionId: s.trackingSessionId }) as Snapshot;
    assert.equal(snap.tasks.length, 2);
    assert.equal(snap.tasks[0].status, 'completed');

    hook('tool-end', { toolUseId: 't2', agentId: 'sub-1', planItems: [{ content: 'Sub-agent private plan', status: 'pending' }] });
    assert.equal((call('get_snapshot', { trackingSessionId: s.trackingSessionId }) as Snapshot).tasks.length, 2, 'a sub-agent plan does not move the parent total');

    assert.deepEqual(hooks(store, 'never-tracked')('tool-end', { toolUseId: 't3', planItems: [{ content: 'x', status: 'pending' }] }), { ignored: true });
  } finally { store.close(); }
});

test('an invalid plan list is rejected as a whole and leaves no partial work or consumed event', () => {
  const { store, call, start } = setup();
  try {
    const s = start({ host: 'claude-code', hostSessionId: 'plan-3' });
    const bad = { host: 'claude-code', hostSessionId: 'plan-3', event: 'tool-end', eventId: 'same', planItems: [{ content: 'Good', status: 'pending' }, { content: 'Bad', status: 'done' }] };
    assert.throws(() => store.handleHook(bad as any), (error: any) => error instanceof StoreError && error.code === 'INVALID_INPUT');
    assert.equal((call('get_snapshot', { trackingSessionId: s.trackingSessionId }) as Snapshot).tasks.length, 0);
    assert.notDeepEqual(store.handleHook({ ...bad, planItems: [{ content: 'Good', status: 'pending' }] } as any), { duplicate: true });
  } finally { store.close(); }
});

test('sub-agents keep the session running past a parent Stop and are counted until they report back', () => {
  const { store, call, start } = setup();
  try {
    const s = start({ host: 'claude-code', hostSessionId: 'agents-1' });
    const hook = hooks(store, 'agents-1');
    const view = () => (call('get_snapshot', { trackingSessionId: s.trackingSessionId }) as Snapshot).session;
    hook('prompt');
    hook('subagent-start', { agentId: 'a1' });
    hook('subagent-start', { agentId: 'a2' });
    assert.equal(view().activeAgents, 2);

    hook('stop');
    assert.equal(view().activity, 'running', 'the parent stopped first but helpers are still working');

    assert.equal(hook('subagent-stop', { agentId: 'a1' }).activeAgents, 1);
    assert.equal(view().activity, 'running');
    assert.deepEqual(hook('subagent-stop', { agentId: 'internal-helper' }), { ignored: true }, 'a stop without a recorded start is ignored');
    assert.equal(view().activeAgents, 1);

    assert.equal(hook('subagent-stop', { agentId: 'a2' }).activity, 'waiting');
    assert.equal(view().activeAgents, 0);
    assert.equal(view().activity, 'waiting');
  } finally { store.close(); }
});

test('interrupting or ending clears sub-agents, and a Stop never completes tasks', () => {
  const { store, call, start } = setup();
  try {
    const s = start({ host: 'claude-code', hostSessionId: 'agents-2' });
    call('register_tasks', { trackingSessionId: s.trackingSessionId, titles: ['Unfinished'] });
    const hook = hooks(store, 'agents-2');
    hook('prompt'); hook('subagent-start', { agentId: 'a1' }); hook('interrupt');
    let snap = call('get_snapshot', { trackingSessionId: s.trackingSessionId }) as Snapshot;
    assert.equal(snap.session.activeAgents, 0);
    assert.equal(snap.session.activity, 'interrupted');
    hook('prompt'); hook('subagent-start', { agentId: 'a2' });
    call('end_tracking', { trackingSessionId: s.trackingSessionId });
    snap = call('get_snapshot', { trackingSessionId: s.trackingSessionId }) as Snapshot;
    assert.equal(snap.session.activeAgents, 0);
    assert.equal(snap.tasks[0].status, 'pending');
  } finally { store.close(); }
});

test('a background sub-agent stays counted through its pauses and ends at its final report', () => {
  const { store, call, start } = setup();
  try {
    const s = start({ host: 'claude-code', hostSessionId: 'agents-3' });
    const hook = hooks(store, 'agents-3');
    const view = () => (call('get_snapshot', { trackingSessionId: s.trackingSessionId }) as Snapshot).session;
    hook('prompt');
    hook('subagent-start', { agentId: 'b1' });
    hook('tool-end', { toolUseId: 'launch', asyncAgentId: 'b1' });
    hook('stop');
    assert.equal(view().activity, 'running', 'the parent stopped while its background sub-agent works');

    hook('subagent-stop', { agentId: 'b1' });
    assert.equal(view().activeAgents, 1, 'a pause for its own commands is not the end');
    assert.equal(view().activity, 'running');

    hook('subagent-start', { agentId: 'b1' });
    hook('tool-end', { toolUseId: 'report', agentId: 'b1', handback: true });
    assert.equal(view().activeAgents, 1, 'the report alone does not end it; its stop does');
    assert.equal(hook('subagent-stop', { agentId: 'b1' }).activity, 'waiting');
    assert.equal(view().activeAgents, 0);
  } finally { store.close(); }
});

test('a foreground sub-agent still ends at its stop, and a restart after its report reopens the run', () => {
  const { store, call, start } = setup();
  try {
    const s = start({ host: 'claude-code', hostSessionId: 'agents-4' });
    const hook = hooks(store, 'agents-4');
    const count = () => (call('get_snapshot', { trackingSessionId: s.trackingSessionId }) as Snapshot).session.activeAgents;
    hook('prompt');
    hook('subagent-start', { agentId: 'f1' });
    hook('tool-end', { toolUseId: 'sync', toolName: undefined });
    hook('subagent-stop', { agentId: 'f1' });
    assert.equal(count(), 0, 'without a background launch there is no pause to wait out');

    hook('subagent-start', { agentId: 'b2' });
    hook('tool-end', { toolUseId: 'launch', asyncAgentId: 'b2' });
    hook('tool-end', { toolUseId: 'report', agentId: 'b2', handback: true });
    hook('subagent-start', { agentId: 'b2' });
    hook('subagent-stop', { agentId: 'b2' });
    assert.equal(count(), 1, 'a restart reopens the report, so the next stop is only a pause');
  } finally { store.close(); }
});

test('a silent background sub-agent stops counting after the silence window, and activity keeps it alive', () => {
  let at = Date.parse('2026-11-12T00:00:00Z');
  const store = new TrackerStore(':memory:', () => new Date(at).toISOString());
  try {
    const call = (action: string, args: Record<string, unknown> = {}) => store.execute(action, { mutationId: randomUUID(), ...args }) as any;
    const s = call('start_tracking', { host: 'claude-code', title: 'Clock', hostSessionId: 'agents-5' }) as Snapshot;
    const hook = hooks(store, 'agents-5');
    const count = () => (call('get_snapshot', { trackingSessionId: s.trackingSessionId }) as Snapshot).session.activeAgents;
    hook('prompt');
    hook('subagent-start', { agentId: 'b3' });
    hook('tool-end', { toolUseId: 'launch', asyncAgentId: 'b3' });
    hook('subagent-stop', { agentId: 'b3' });
    at += 20 * 60_000;
    assert.equal(count(), 1);
    hook('tool-start', { toolUseId: 'work', agentId: 'b3' });
    at += 20 * 60_000;
    assert.equal(count(), 1, 'activity inside the window renews it');
    at += 11 * 60_000;
    assert.equal(count(), 0, 'a sub-agent silent for over 30 minutes is no longer shown as running');
  } finally { store.close(); }
});
