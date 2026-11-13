import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Activity, Catalog, Host, Project, Scope, Settings, Snapshot, Task, TrackingSession } from './types.js';

export class StoreError extends Error {
  constructor(public code: string, message: string, public details?: unknown) { super(message); }
}
type Row = Record<string, any>;
export interface PlanItem { content: string; status: string }
export interface HookInput {
  host: Host; hostSessionId: string; event: string; eventId: string; toolUseId?: string;
  /** Set on events raised inside a sub-agent. */
  agentId?: string;
  /** Set on the parent's tool-end that launched a background sub-agent (its hook-side agent ID). */
  asyncAgentId?: string;
  /** Set on the tool-end of a sub-agent's final report (SubagentHandback). */
  handback?: boolean;
  /** The host's plan/todo list, sent on the tool-end of a plan tool. */
  planItems?: PlanItem[];
}
const hookEvents = ['prompt', 'tool-start', 'tool-end', 'permission', 'stop', 'interrupt', 'session-end', 'error', 'subagent-start', 'subagent-stop'] as const;
const statusRank: Record<string, number> = { pending: 0, in_progress: 1, completed: 2 };
const AGENT_SILENCE_MS = 30 * 60 * 1000;
const hosts = ['claude-code', 'codex', 'claude-desktop', 'chatgpt'];
const activities = ['idle', 'running', 'waiting', 'interrupted', 'error'];
const statuses = ['pending', 'in_progress', 'completed'];
const reads = new Set(['get_catalog', 'get_snapshot', 'get_binding']);
function fail(code: string, message: string, details?: unknown): never { throw new StoreError(code, message, details); }
function text(value: unknown, name: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('INVALID_INPUT', `Invalid ${name}`);
  return value.trim();
}
function choice<T extends string>(value: unknown, values: readonly T[], name: string): T {
  if (!values.includes(value as T)) fail('INVALID_INPUT', `Invalid ${name}`);
  return value as T;
}
function strings(value: unknown, name: string, max = 200): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 200) fail('INVALID_INPUT', `Invalid ${name}`);
  return value.map(item => text(item, name, max));
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}

export class TrackerStore {
  private db: DatabaseSync;
  constructor(path: string, private now = () => new Date().toISOString()) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA foreign_keys=ON;
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, host TEXT NOT NULL, title TEXT NOT NULL, project_id TEXT REFERENCES projects(id),
        activity TEXT NOT NULL DEFAULT 'idle', activity_source TEXT NOT NULL DEFAULT 'reported',
        current_task_id TEXT, last_agent_event_at TEXT, created_at TEXT NOT NULL, ended_at TEXT,
        turn_active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id), title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS session_tasks (
        session_id TEXT NOT NULL REFERENCES sessions(id), task_id TEXT NOT NULL REFERENCES tasks(id),
        PRIMARY KEY(session_id, task_id)
      );
      CREATE TABLE IF NOT EXISTS bindings (
        host TEXT NOT NULL, host_session_id TEXT NOT NULL, session_id TEXT NOT NULL REFERENCES sessions(id),
        PRIMARY KEY(host, host_session_id)
      );
      CREATE TABLE IF NOT EXISTS mutations (id TEXT PRIMARY KEY, signature TEXT NOT NULL, result TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS hook_events (id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS active_tools (
        session_id TEXT NOT NULL REFERENCES sessions(id), tool_id TEXT NOT NULL,
        PRIMARY KEY(session_id, tool_id)
      );
      DROP TABLE IF EXISTS active_agents;
      CREATE TABLE IF NOT EXISTS subagent_runs (
        session_id TEXT NOT NULL REFERENCES sessions(id), agent_id TEXT NOT NULL,
        is_async INTEGER NOT NULL DEFAULT 0, handed_back INTEGER NOT NULL DEFAULT 0, seen_at TEXT NOT NULL,
        PRIMARY KEY(session_id, agent_id)
      );
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), locale TEXT NOT NULL);
      INSERT OR IGNORE INTO settings(id, locale) VALUES(1, 'ko');
      CREATE INDEX IF NOT EXISTS tasks_project ON tasks(project_id);
      CREATE INDEX IF NOT EXISTS session_tasks_task ON session_tasks(task_id);
      PRAGMA user_version=1;
    `);
  }
  close() { this.db.close(); }
  private one(sql: string, ...args: any[]): Row | undefined { return this.db.prepare(sql).get(...args) as Row | undefined; }
  private all(sql: string, ...args: any[]): Row[] { return this.db.prepare(sql).all(...args) as Row[]; }
  private run(sql: string, ...args: any[]) { return this.db.prepare(sql).run(...args); }
  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  private settings(): Settings { return { locale: this.one('SELECT locale FROM settings WHERE id=1')!.locale }; }
  private project(id: string): Project {
    const row = this.one('SELECT * FROM projects WHERE id=?', id);
    if (!row) fail('NOT_FOUND', 'Project not found');
    return { id: row.id, name: row.name, createdAt: row.created_at };
  }
  private session(id: string, active = false): TrackingSession {
    const row = this.one('SELECT * FROM sessions WHERE id=?', id);
    if (!row) fail('NOT_FOUND', 'Tracking session not found');
    if (active && row.ended_at) fail('SESSION_ENDED', 'Resume tracking before updating this session');
    return {
      id: row.id, host: row.host, title: row.title, projectId: row.project_id,
      activity: row.activity, activitySource: row.activity_source, currentTaskId: row.current_task_id,
      lastAgentEventAt: row.last_agent_event_at, createdAt: row.created_at, endedAt: row.ended_at,
      hostSessionBound: Boolean(this.one('SELECT 1 FROM bindings WHERE session_id=?', id)),
      activeAgents: this.agentCount(id),
    };
  }
  /**
   * Sub-agents still working. A background sub-agent pauses (SubagentStop) while it waits on its own commands and
   * restarts later, so it stays counted until its final report. One that goes silent is dropped after this window.
   */
  private agentCount(sessionId: string): number {
    const cutoff = new Date(Date.parse(this.now()) - AGENT_SILENCE_MS).toISOString();
    return this.one('SELECT COUNT(*) AS n FROM subagent_runs WHERE session_id=? AND seen_at>=?', sessionId, cutoff)!.n as number;
  }
  private task(row: Row): Task {
    return {
      id: row.id, projectId: row.project_id, title: row.title, status: row.status,
      revision: row.revision, updatedAt: row.updated_at,
      sessionIds: this.all('SELECT session_id FROM session_tasks WHERE task_id=? ORDER BY session_id', row.id).map(r => r.session_id),
    };
  }
  private snapshot(id: string, scope: Scope = 'session'): Snapshot {
    const session = this.session(id);
    const project = session.projectId ? this.project(session.projectId) : null;
    if (scope === 'project' && !project) fail('PROJECT_MISMATCH', 'Connect a project to use project scope');
    const tasks = (scope === 'project'
      ? this.all('SELECT * FROM tasks WHERE project_id=? ORDER BY rowid', project!.id)
      : this.all('SELECT t.* FROM tasks t JOIN session_tasks st ON st.task_id=t.id WHERE st.session_id=? ORDER BY t.rowid', id)).map(r => this.task(r));
    const sessions = project
      ? this.all('SELECT id FROM sessions WHERE project_id=? ORDER BY created_at', project.id).map(r => this.session(r.id))
      : [session];
    const completed = tasks.filter(task => task.status === 'completed').length;
    return {
      trackingSessionId: id, scope, session, project, sessions, tasks,
      progress: { completed, total: tasks.length, percent: tasks.length ? Math.floor(completed / tasks.length * 100) : null },
      settings: this.settings(), snapshotAt: this.now(),
    };
  }
  private bind(session: TrackingSession, hostSessionId: unknown) {
    if (hostSessionId === undefined) return;
    const nativeId = text(hostSessionId, 'hostSessionId');
    const existing = this.one('SELECT session_id FROM bindings WHERE host=? AND host_session_id=?', session.host, nativeId);
    if (existing && existing.session_id !== session.id && !this.session(existing.session_id).endedAt) fail('CONFLICT', 'This native session is already tracking another session');
    this.run('DELETE FROM bindings WHERE session_id=? AND (host<>? OR host_session_id<>?)', session.id, session.host, nativeId);
    this.run('INSERT INTO bindings(host,host_session_id,session_id) VALUES(?,?,?) ON CONFLICT(host,host_session_id) DO UPDATE SET session_id=excluded.session_id', session.host, nativeId, session.id);
  }
  execute(action: string, args: Record<string, unknown> = {}): unknown {
    if (reads.has(action)) return this.read(action, args);
    const mutationId = text(args.mutationId, 'mutationId');
    const signature = createHash('sha256').update(JSON.stringify(canonical({ action, args }))).digest('hex');
    return this.transaction(() => {
      const previous = this.one('SELECT * FROM mutations WHERE id=?', mutationId);
      if (previous) {
        if (previous.signature !== signature) fail('CONFLICT', 'mutationId was reused with different input');
        return JSON.parse(previous.result);
      }
      const result = this.mutate(action, args);
      this.run('INSERT INTO mutations(id,signature,result) VALUES(?,?,?)', mutationId, signature, JSON.stringify(result));
      return result;
    });
  }
  private read(action: string, args: Record<string, unknown>): unknown {
    if (action === 'get_catalog') {
      const catalog: Catalog = {
        projects: this.all('SELECT id FROM projects ORDER BY created_at').map(r => this.project(r.id)),
        sessions: this.all('SELECT id FROM sessions ORDER BY created_at').map(r => this.session(r.id)), settings: this.settings(),
      };
      return catalog;
    }
    if (action === 'get_binding') {
      const host = choice(args.host, hosts, 'host');
      const nativeId = text(args.hostSessionId, 'hostSessionId');
      return { trackingSessionId: this.one('SELECT session_id FROM bindings WHERE host=? AND host_session_id=?', host, nativeId)?.session_id ?? null };
    }
    return this.snapshot(text(args.trackingSessionId, 'trackingSessionId'), choice<Scope>(args.scope ?? 'session', ['session', 'project'], 'scope'));
  }
  private newProject(name: string): Project {
    const id = `project_${randomUUID()}`;
    this.run('INSERT INTO projects(id,name,created_at) VALUES(?,?,?)', id, name, this.now());
    return this.project(id);
  }
  private mutate(action: string, args: Record<string, unknown>): unknown {
    if (action === 'create_project') return this.newProject(text(args.name, 'name', 160));
    if (action === 'save_settings') {
      this.run('UPDATE settings SET locale=? WHERE id=1', choice(args.locale, ['ko', 'en'], 'locale'));
      return this.settings();
    }
    if (action === 'start_tracking') {
      const host = choice(args.host, hosts, 'host');
      const title = text(args.title, 'title', 160);
      if (args.projectId !== undefined && args.projectName !== undefined) fail('INVALID_INPUT', 'Choose either projectId or projectName');
      const projectId = args.projectId !== undefined ? this.project(text(args.projectId, 'projectId')).id
        : args.projectName !== undefined ? this.newProject(text(args.projectName, 'projectName', 160)).id : null;
      const id = `session_${randomUUID()}`;
      this.run('INSERT INTO sessions(id,host,title,project_id,created_at) VALUES(?,?,?,?,?)', id, host, title, projectId, this.now());
      this.bind(this.session(id), args.hostSessionId);
      return this.snapshot(id);
    }
    if (action === 'resume_tracking') {
      const id = text(args.trackingSessionId, 'trackingSessionId');
      const session = this.session(id);
      this.bind(session, args.hostSessionId);
      if (session.endedAt) this.run("UPDATE sessions SET ended_at=NULL, activity='idle', current_task_id=NULL,turn_active=1 WHERE id=?", id);
      return this.snapshot(id);
    }
    const supported = ['connect_project', 'register_tasks', 'link_tasks', 'update_task', 'report_state', 'end_tracking'];
    if (!supported.includes(action)) fail('UNKNOWN_ACTION', 'Unknown action');
    const id = text(args.trackingSessionId, 'trackingSessionId');
    const session = this.session(id, true);
    if (action === 'connect_project') {
      const projectId = this.project(text(args.projectId, 'projectId')).id;
      if (session.projectId && session.projectId !== projectId) fail('PROJECT_CHANGE', 'Start a new tracker to change a session already connected to a project');
      this.run('UPDATE sessions SET project_id=? WHERE id=?', projectId, id);
      this.run('UPDATE tasks SET project_id=?, revision=revision+1, updated_at=? WHERE project_id IS NULL AND id IN (SELECT task_id FROM session_tasks WHERE session_id=?)', projectId, this.now(), id);
    } else if (action === 'register_tasks') {
      const titles = strings(args.titles, 'titles', 500);
      for (const title of titles) {
        const taskId = `task_${randomUUID()}`;
        this.run('INSERT INTO tasks(id,project_id,title,updated_at) VALUES(?,?,?,?)', taskId, session.projectId, title, this.now());
        this.run('INSERT INTO session_tasks(session_id,task_id) VALUES(?,?)', id, taskId);
      }
    } else if (action === 'link_tasks') {
      if (!session.projectId) fail('PROJECT_MISMATCH', 'Connect a project before linking tasks');
      for (const taskId of new Set(strings(args.taskIds, 'taskIds'))) {
        const task = this.one('SELECT * FROM tasks WHERE id=?', taskId);
        if (!task) fail('NOT_FOUND', 'Task not found');
        if (task.project_id !== session.projectId) fail('PROJECT_MISMATCH', 'Task belongs to a different project');
        this.run('INSERT OR IGNORE INTO session_tasks(session_id,task_id) VALUES(?,?)', id, taskId);
      }
    } else if (action === 'update_task') {
      const taskId = text(args.taskId, 'taskId');
      const status = choice(args.status, statuses, 'status');
      const revision = args.expectedRevision;
      if (!Number.isSafeInteger(revision) || Number(revision) < 1) fail('INVALID_INPUT', 'Invalid expectedRevision');
      const task = this.one('SELECT t.* FROM tasks t JOIN session_tasks st ON st.task_id=t.id WHERE t.id=? AND st.session_id=?', taskId, id);
      if (!task) fail('PROJECT_MISMATCH', 'Link this task to the session before updating it');
      if (task.revision !== revision) fail('CONFLICT', 'Task changed in another session; refresh before retrying', { task: this.task(task) });
      if (task.status !== status) this.run('UPDATE tasks SET status=?, revision=revision+1, updated_at=? WHERE id=?', status, this.now(), taskId);
    } else if (action === 'report_state') {
      const activity = choice(args.activity, activities, 'activity');
      const source = choice(args.source ?? 'reported', ['hook', 'reported'], 'source');
      const currentTaskId = args.currentTaskId === undefined || args.currentTaskId === null ? null : text(args.currentTaskId, 'currentTaskId');
      if (currentTaskId && !this.one('SELECT 1 FROM session_tasks WHERE session_id=? AND task_id=?', id, currentTaskId)) fail('PROJECT_MISMATCH', 'Current task is not linked to this session');
      this.run('UPDATE sessions SET activity=?,activity_source=?,current_task_id=?,last_agent_event_at=? WHERE id=?', activity, source, currentTaskId, this.now(), id);
    } else if (action === 'end_tracking') {
      this.run("UPDATE sessions SET activity='idle',current_task_id=NULL,ended_at=? WHERE id=?", this.now(), id);
      this.run('DELETE FROM active_tools WHERE session_id=?', id);
      this.run('DELETE FROM subagent_runs WHERE session_id=?', id);
    }
    return this.snapshot(id);
  }
  /**
   * Mirrors the host's plan list into this session's tasks. Titles only identify tasks inside this one session
   * (an equal title reuses an unused task instead of adding a duplicate); they never merge work across projects.
   * A plan can only move a task forward, so a stale list cannot undo a completion recorded another way.
   */
  private applyPlan(sessionId: string, projectId: string | null, items: PlanItem[]) {
    const existing = this.all('SELECT t.* FROM tasks t JOIN session_tasks st ON st.task_id=t.id WHERE st.session_id=? ORDER BY t.rowid', sessionId);
    const used = new Set<string>();
    for (const raw of items) {
      const title = text(raw.content, 'plan item', 500);
      const status = choice(raw.status, statuses, 'plan status');
      const match = existing.find(task => task.title === title && !used.has(task.id));
      if (!match) {
        const taskId = `task_${randomUUID()}`;
        this.run('INSERT INTO tasks(id,project_id,title,status,updated_at) VALUES(?,?,?,?,?)', taskId, projectId, title, status, this.now());
        this.run('INSERT INTO session_tasks(session_id,task_id) VALUES(?,?)', sessionId, taskId);
        used.add(taskId);
        continue;
      }
      used.add(match.id);
      if (statusRank[status] > statusRank[match.status]) this.run('UPDATE tasks SET status=?, revision=revision+1, updated_at=? WHERE id=?', status, this.now(), match.id);
    }
  }
  handleHook(input: HookInput): unknown {
    const host = choice(input.host, ['claude-code', 'codex'], 'host');
    const hostSessionId = text(input.hostSessionId, 'hostSessionId');
    const event = choice(input.event, hookEvents, 'event');
    const eventId = text(input.eventId, 'eventId', 500);
    const agentId = input.agentId === undefined ? null : text(input.agentId, 'agentId');
    if (input.planItems !== undefined && (!Array.isArray(input.planItems) || input.planItems.length > 100)) fail('INVALID_INPUT', 'Invalid planItems');
    return this.transaction(() => {
      const bound = this.one('SELECT session_id FROM bindings WHERE host=? AND host_session_id=?', host, hostSessionId);
      if (!bound) return { ignored: true };
      const session = this.session(bound.session_id);
      if (session.endedAt) return { ignored: true };
      let turnActive = Boolean(this.one('SELECT turn_active FROM sessions WHERE id=?', session.id)!.turn_active);
      // Delayed hooks after interruption or session end belong to the old turn until a new prompt arrives.
      if (!turnActive && session.activity === 'interrupted' && event !== 'prompt') return { ignored: true };
      const key = `${host}:${hostSessionId}:${eventId}`;
      if (this.one('SELECT 1 FROM hook_events WHERE id=?', key)) return { duplicate: true };
      this.run('INSERT INTO hook_events(id) VALUES(?)', key);
      let activity: Activity = 'running';
      const toolId = input.toolUseId ? text(input.toolUseId, 'toolUseId') : null;
      const seenAt = this.now();
      if (event === 'subagent-stop') {
        // Hosts also stop internal helpers that never announced a start; only a known start can be ended.
        const run = agentId ? this.one('SELECT is_async, handed_back FROM subagent_runs WHERE session_id=? AND agent_id=?', session.id, agentId) : undefined;
        if (!run) return { ignored: true };
        // A background sub-agent stops while it waits on its own commands and starts again later. Until it has
        // handed its report back, that stop is a pause, not the end.
        if (run.is_async && !run.handed_back) this.run('UPDATE subagent_runs SET seen_at=? WHERE session_id=? AND agent_id=?', seenAt, session.id, agentId);
        else this.run('DELETE FROM subagent_runs WHERE session_id=? AND agent_id=?', session.id, agentId);
        const remaining = this.agentCount(session.id);
        // The parent may have stopped first; once its last helper finishes the session is waiting, not running.
        const next: Activity = remaining === 0 && !turnActive ? 'waiting' : session.activity === 'waiting' || session.activity === 'interrupted' || session.activity === 'error' ? session.activity : 'running';
        this.run('UPDATE sessions SET activity=?,activity_source=?,last_agent_event_at=? WHERE id=?', next, 'hook', this.now(), session.id);
        return { trackingSessionId: session.id, activity: next, activeAgents: remaining };
      }
      if (event === 'subagent-start' && agentId) {
        // A restart after a pause is the same run, so it keeps its async flag and reopens the report.
        this.run('INSERT INTO subagent_runs(session_id,agent_id,seen_at) VALUES(?,?,?) ON CONFLICT(session_id,agent_id) DO UPDATE SET seen_at=excluded.seen_at, handed_back=0', session.id, agentId, seenAt);
      } else if (agentId) {
        this.run('UPDATE subagent_runs SET seen_at=? WHERE session_id=? AND agent_id=?', seenAt, session.id, agentId);
      }
      if (event === 'tool-end' && input.asyncAgentId) {
        const asyncId = text(input.asyncAgentId, 'asyncAgentId');
        this.run('INSERT INTO subagent_runs(session_id,agent_id,is_async,seen_at) VALUES(?,?,1,?) ON CONFLICT(session_id,agent_id) DO UPDATE SET is_async=1, seen_at=excluded.seen_at', session.id, asyncId, seenAt);
      }
      if (event === 'tool-end' && input.handback && agentId) this.run('UPDATE subagent_runs SET handed_back=1 WHERE session_id=? AND agent_id=?', session.id, agentId);
      if (event === 'tool-end' && input.planItems && !agentId) this.applyPlan(session.id, session.projectId, input.planItems);
      if (event === 'tool-start' && toolId) this.run('INSERT OR IGNORE INTO active_tools(session_id,tool_id) VALUES(?,?)', session.id, toolId);
      if (event === 'tool-end' && toolId) this.run('DELETE FROM active_tools WHERE session_id=? AND tool_id=?', session.id, toolId);
      const helpersRunning = this.agentCount(session.id) > 0;
      if (event === 'stop' || event === 'permission') activity = 'waiting';
      // A parent Stop can arrive before its sub-agents report back; the work is still going on.
      if (event === 'stop' && helpersRunning) activity = 'running';
      if (event === 'interrupt' || event === 'session-end') activity = 'interrupted';
      if (event === 'interrupt' || event === 'session-end') this.run('DELETE FROM subagent_runs WHERE session_id=?', session.id);
      if (event === 'error') activity = 'error';
      if (event === 'prompt') turnActive = true;
      if (['stop', 'interrupt', 'session-end', 'error'].includes(event)) turnActive = false;
      if (['prompt', 'stop', 'interrupt', 'session-end', 'error'].includes(event)) this.run('DELETE FROM active_tools WHERE session_id=?', session.id);
      // Late tool completions must not revive an interrupted or stopped turn.
      if (event === 'tool-end' && !turnActive) activity = session.activity;
      this.run('UPDATE sessions SET activity=?,activity_source=?,last_agent_event_at=?,turn_active=? WHERE id=?', activity, 'hook', this.now(), Number(turnActive), session.id);
      return { trackingSessionId: session.id, activity };
    });
  }
}
