import { App } from '@modelcontextprotocol/ext-apps';
import type { Activity, Catalog, Host, Locale, Scope, Snapshot, Task, TaskStatus, TrackingSession } from '../types.js';
import { activityLabel, errorLabel, hostLabel, progressText, relativeTime, t, type TranslationKey } from '../i18n.js';
import { trackingContext, type ContextIntent } from './context.js';
import { RetryingMutations } from './mutations.js';
import { RequestError, bridgeError, toolPayload } from './rpc.js';

type Args = Record<string, unknown>;
type Call = (name: string, args: Args) => Promise<unknown>;

const root = document.getElementById('app')!;
let locale: Locale = 'ko';
let catalog: Catalog = { projects: [], sessions: [], settings: { locale } };
let snapshot: Snapshot | null = null;
let trackingSessionId: string | null = null;
let scope: Scope = 'session';
let expanded = false;
let setupOpen = true;
let ready = false;
let disposed = false;
let disconnected = false;
let mutating = false;
let polling = false;
let viewRevision = 0;
let refreshRequested = false;
let catalogRefreshRequested = false;
const pollWaiters: (() => void)[] = [];
let errorCode: string | null = null;
let validationKey: TranslationKey | null = null;
let copied = false;
let interval: ReturnType<typeof setInterval> | null = null;
let lastCatalogFetch = 0;
let lastRender = '';
let call: Call;
let syncContext: ((data: Snapshot, intent: ContextIntent) => Promise<void>) | null = null;
const drafts: Record<string, string> = {
  title: '', host: 'codex', group: 'standalone', projectName: '', projectId: '',
  resumeId: '', taskLines: '', joinMode: 'existing', joinProjectId: '', joinProjectName: '',
};
const tr = (key: TranslationKey) => t(locale, key);
const id = () => crypto.randomUUID();
const mutationRequests = new RetryingMutations((action, args) => call(action, args), id);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(label: string, handler: () => void, className = 'btn'): HTMLButtonElement {
  const node = el('button', className, label);
  node.type = 'button'; node.disabled = mutating;
  node.addEventListener('click', handler);
  return node;
}
function option(value: string, label: string): HTMLOptionElement {
  const node = el('option', '', label); node.value = value; return node;
}
function select(name: string, options: [string, string][], onChange?: (value: string) => void): HTMLSelectElement {
  const node = el('select'); node.id = `field-${name}`;
  node.append(...options.map(([value, label]) => option(value, label)));
  node.value = drafts[name] ?? ''; node.disabled = mutating;
  node.addEventListener('change', () => { drafts[name] = node.value; onChange?.(node.value); });
  return node;
}
function input(name: string, placeholder: string): HTMLInputElement {
  const node = el('input'); node.id = `field-${name}`; node.value = drafts[name];
  node.placeholder = placeholder; node.autocomplete = 'off'; node.maxLength = 300; node.disabled = mutating;
  node.addEventListener('input', () => { drafts[name] = node.value; }); return node;
}
function field(label: string, control: HTMLElement): HTMLElement {
  const wrap = el('div', 'field');
  const caption = el('label', '', label); caption.htmlFor = control.id;
  wrap.append(caption, control); return wrap;
}
function note(key: TranslationKey): HTMLElement { return el('p', 'note', tr(key)); }
function divider(): HTMLElement { return el('div', 'divider'); }
function sectionHead(label: string, right?: HTMLElement, count?: number): HTMLElement {
  const wrap = el('div', 'section-head'), title = el('h2', '', label);
  if (count !== undefined) title.append(el('span', 'count', String(count)));
  wrap.append(title); if (right) wrap.append(right); return wrap;
}
function badge(activity: Activity | 'completed' | 'disconnected', ended = false): HTMLElement {
  return el('span', `badge ${activity}`, ended ? tr('ended') : activity === 'completed' || activity === 'disconnected' ? tr(activity) : activityLabel(locale, activity));
}
function languageControl(): HTMLElement {
  const wrap = el('div', 'inline-settings');
  const label = el('label', 'muted', tr('language')); label.htmlFor = 'locale';
  const control = el('select', 'locale-select'); control.id = 'locale'; control.setAttribute('aria-label', tr('language'));
  control.append(option('ko', '한국어'), option('en', 'English')); control.value = locale; control.disabled = mutating;
  control.addEventListener('change', () => void mutate('save_settings', { locale: control.value }));
  wrap.append(label, control); return wrap;
}
function brandHeader(): HTMLElement {
  const wrap = el('header', 'brand-header');
  const mark = el('span', 'brand-mark'); mark.setAttribute('aria-hidden', 'true');
  wrap.append(mark, el('span', 'brand-name', 'CheckYourProcess'));
  return wrap;
}
function localError(key: TranslationKey): void { validationKey = key; errorCode = null; render(true); }

function setup(): HTMLElement {
  const content = el('div', 'setup-content');
  content.append(el('h1', '', tr('setupTitle')), el('p', 'setup-description', tr('setupDescription')));
  const columns = el('div', 'setup-grid');
  const form = el('form', 'setup-form');
  form.append(field(tr('taskTitle'), input('title', tr('taskTitlePlaceholder'))));
  form.append(field(tr('host'), select('host', (['codex', 'claude-code', 'claude-desktop', 'chatgpt'] as Host[]).map(host => [host, hostLabel(host)]))));
  form.append(field(tr('grouping'), select('group', [['standalone', tr('standalone')], ['new', tr('newProject')], ['existing', tr('existingProject')]], () => render(true))));
  if (drafts.group === 'new') form.append(field(tr('projectName'), input('projectName', tr('projectNamePlaceholder'))));
  if (drafts.group === 'existing') form.append(field(tr('chooseProject'), select('projectId', [['', tr('chooseProject')], ...catalog.projects.map(p => [p.id, p.name] as [string, string])])));
  const actions = el('div', 'form-actions');
  if (snapshot) actions.append(button(tr('close'), () => { setupOpen = false; render(true); }, 'btn ghost'));
  const submit = el('button', 'btn primary', tr('track')); submit.type = 'submit'; submit.disabled = mutating; actions.append(submit); form.append(actions);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!drafts.title.trim()) return localError('requiredTitle');
    if (drafts.group === 'new' && !drafts.projectName.trim() || drafts.group === 'existing' && !drafts.projectId) return localError('requiredProject');
    void mutate('start_tracking', {
      host: drafts.host, title: drafts.title.trim(),
      ...(drafts.group === 'new' ? { projectName: drafts.projectName.trim() } : {}),
      ...(drafts.group === 'existing' ? { projectId: drafts.projectId } : {}),
    }, result => {
      trackingSessionId = (result as Snapshot).trackingSessionId; scope = 'session'; setupOpen = false;
      drafts.title = ''; drafts.projectName = '';
    });
  });
  const secondary = el('section', 'setup-secondary'); secondary.append(el('h2', '', tr('resume')));
  const sessions = select('resumeId', [['', tr('chooseSession')], ...catalog.sessions.map(s => [s.id, `${s.title} · ${hostLabel(s.host)}`] as [string, string])]);
  secondary.append(field(tr('chooseSession'), sessions));
  const resumeActions = el('div', 'form-actions');
  resumeActions.append(button(tr('open'), () => {
    if (!drafts.resumeId) return localError('notFound');
    void mutate('resume_tracking', { trackingSessionId: drafts.resumeId }, result => {
      trackingSessionId = (result as Snapshot).trackingSessionId; scope = 'session'; setupOpen = false;
    });
  }, 'btn outline'));
  secondary.append(resumeActions, divider(), languageControl());
  columns.append(form, secondary); content.append(columns); return content;
}

function summary(data: Snapshot): HTMLElement {
  const wrap = el('section', 'summary');
  const heading = el('div', 'summary-title');
  const title = el('div', 'title-line', data.scope === 'project' && data.project ? data.project.name : data.session.title);
  title.title = title.textContent ?? '';
  const subtitle = el('div', 'subtitle', data.scope === 'project' ? `${tr('project')} · ${data.sessions.length} ${tr('sessions')}` : hostLabel(data.session.host));
  heading.append(title, subtitle);
  const allDone = data.progress.total > 0 && data.progress.completed === data.progress.total;
  const activity = data.scope === 'project'
    ? (['running', 'error', 'waiting', 'interrupted', 'idle'] as Activity[]).find(value => data.sessions.some(session => !session.endedAt && session.activity === value)) ?? 'idle'
    : data.session.activity;
  const state = allDone ? 'completed' : activity;
  const progress = el('div', 'progress-stack');
  const track = el('div', `progress-track${data.progress.percent === null ? ' empty' : ''}`);
  track.setAttribute('role', 'progressbar'); track.setAttribute('aria-label', tr('progress'));
  track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100');
  if (data.progress.percent !== null) track.setAttribute('aria-valuenow', String(data.progress.percent));
  track.setAttribute('aria-valuetext', data.progress.percent === null ? tr('noPlan') : progressText(locale, data.progress.completed, data.progress.total));
  const fill = el('div', 'progress-fill'); fill.style.width = `${data.progress.percent ?? 0}%`; track.append(fill);
  const meta = el('div', 'progress-meta');
  meta.append(el('span', '', data.progress.total ? progressText(locale, data.progress.completed, data.progress.total) : tr('noPlan')),
    el('span', '', data.scope === 'project' ? tr('project') : tr('session')));
  progress.append(track, meta);
  const number = el('span', `percentage${data.progress.percent === null ? ' no-plan' : ''}`, data.progress.percent === null ? '—' : `${data.progress.percent}%`);
  const toggle = button(expanded ? tr('compact') : tr('details'), () => { expanded = !expanded; render(true); }, 'btn ghost summary-toggle');
  toggle.setAttribute('aria-expanded', String(expanded)); toggle.setAttribute('aria-controls', 'progress-details');
  const chevron = el('span', `chevron${expanded ? ' expanded' : ''}`); chevron.setAttribute('aria-hidden', 'true'); toggle.append(chevron);
  const ended = data.scope === 'project' ? data.sessions.every(session => !!session.endedAt) : !!data.session.endedAt;
  wrap.append(heading, badge(state, ended && !allDone), progress, number, toggle); return wrap;
}

function taskRow(task: Task, data: Snapshot): HTMLElement {
  const row = el('div', `task-row ${task.status}`);
  const icon = el('span', 'task-status-icon'); icon.setAttribute('aria-hidden', 'true');
  const name = el('div', 'task-name'); name.append(el('div', '', task.title));
  const linked = task.sessionIds.includes(data.trackingSessionId);
  if (!linked) name.append(el('div', 'task-extra', tr('sharedTask')));
  row.append(icon, name);
  if (linked) {
    const status = el('select', 'task-status-select'); status.id = `task-${task.id}`; status.setAttribute('aria-label', `${tr('taskState')}: ${task.title}`);
    status.append(...(['pending', 'in_progress', 'completed'] as TaskStatus[]).map(value => option(value, tr(value))));
    status.value = task.status; status.disabled = mutating || !!data.session.endedAt;
    status.addEventListener('change', () => void mutate('update_task', { trackingSessionId: data.trackingSessionId, taskId: task.id, status: status.value, expectedRevision: task.revision }));
    row.append(status);
  } else row.append(button(tr('linkTask'), () => void mutate('link_tasks', { trackingSessionId: data.trackingSessionId, taskIds: [task.id] }), 'btn outline small'));
  return row;
}
function tasksSection(data: Snapshot): HTMLElement {
  const section = el('section');
  const showShared = data.project && data.scope === 'session' ? button(tr('browseShared'), () => { scope = 'project'; viewRevision++; void refresh(); }, 'btn ghost small') : undefined;
  section.append(sectionHead(tr('tasks'), showShared, data.progress.total));
  if (data.tasks.length) {
    const list = el('div', 'task-list'); list.append(...data.tasks.map(task => taskRow(task, data))); section.append(list);
  } else {
    const empty = el('div', 'empty-state'); empty.append(el('p', '', tr('noTasks')), el('p', '', tr('noTasksDescription'))); section.append(empty);
  }
  if (data.project) section.append(note('sharedNote'));
  if (!data.session.endedAt) {
    const form = el('form', 'add-form');
    const textarea = el('textarea'); textarea.id = 'field-taskLines'; textarea.value = drafts.taskLines; textarea.placeholder = tr('taskLinesPlaceholder'); textarea.maxLength = 20_000; textarea.disabled = mutating;
    textarea.addEventListener('input', () => { drafts.taskLines = textarea.value; });
    form.append(field(`${tr('addTasks')} · ${tr('taskLines')}`, textarea));
    const actions = el('div', 'form-actions'); const submit = el('button', 'btn outline', tr('add')); submit.type = 'submit'; submit.disabled = mutating; actions.append(submit); form.append(actions);
    form.addEventListener('submit', event => {
      event.preventDefault(); const titles = drafts.taskLines.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      if (!titles.length) return localError('requiredTasks');
      void mutate('register_tasks', { trackingSessionId: data.trackingSessionId, titles }, () => { drafts.taskLines = ''; });
    });
    section.append(form);
  }
  return section;
}

function sessionRow(session: TrackingSession, currentId: string): HTMLElement {
  const row = el('div', 'session-row');
  row.append(el('span', 'session-avatar', ({ codex: 'CX', 'claude-code': 'CC', 'claude-desktop': 'CL', chatgpt: 'GP' } as const)[session.host]));
  const info = el('div', 'session-info'); info.append(el('div', 'session-name', session.title));
  const meta = el('div', 'session-meta'); meta.append(document.createTextNode(`${hostLabel(session.host)} · `), timeNode(session.lastAgentEventAt)); info.append(meta);
  row.append(info, badge(session.activity, !!session.endedAt));
  if (session.id !== currentId) row.append(button(tr('view'), () => {
    trackingSessionId = session.id; scope = 'session'; viewRevision++; void refresh();
  }, 'btn ghost small'));
  return row;
}
function timeNode(iso: string | null): HTMLElement {
  const node = el('span', 'relative-time', relativeTime(locale, iso));
  if (iso) { node.dataset.iso = iso; node.title = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(iso)); }
  return node;
}
function projectConnection(data: Snapshot): HTMLElement {
  const section = el('section');
  section.append(sectionHead(tr('connectProject')));
  if (data.project) { section.append(el('p', 'muted', data.project.name)); return section; }
  section.append(note('independentNote'));
  const form = el('form', 'add-form');
  form.append(field(tr('grouping'), select('joinMode', [['existing', tr('existingProject')], ['new', tr('newProject')]], () => render(true))));
  if (drafts.joinMode === 'new') form.append(field(tr('projectName'), input('joinProjectName', tr('projectNamePlaceholder'))));
  else form.append(field(tr('chooseProject'), select('joinProjectId', [['', tr('chooseProject')], ...catalog.projects.map(p => [p.id, p.name] as [string, string])])));
  const actions = el('div', 'form-actions'); const submit = el('button', 'btn outline small', tr('linkProject')); submit.type = 'submit'; submit.disabled = mutating || !!data.session.endedAt; actions.append(submit); form.append(actions);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (drafts.joinMode === 'new' && !drafts.joinProjectName.trim() || drafts.joinMode === 'existing' && !drafts.joinProjectId) return localError('requiredProject');
    void connectProject(data);
  });
  section.append(form); return section;
}
async function connectProject(data: Snapshot): Promise<void> {
  await mutation(async () => {
    let projectId = drafts.joinProjectId;
    if (drafts.joinMode === 'new') {
      const created = await mutationRequests.perform('create_project', { name: drafts.joinProjectName.trim() }) as { id: string };
      projectId = created.id; drafts.joinMode = 'existing'; drafts.joinProjectId = projectId;
    }
    await mutationRequests.perform('connect_project', { trackingSessionId: data.trackingSessionId, projectId });
    drafts.joinProjectName = ''; scope = 'project';
  });
}
function details(data: Snapshot): HTMLElement {
  const wrap = el('div', 'details'); wrap.id = 'progress-details';
  const toolbar = el('div', 'toolbar');
  const segmented = el('div', 'segmented'); segmented.setAttribute('role', 'group'); segmented.setAttribute('aria-label', tr('scope'));
  for (const value of ['session', 'project'] as Scope[]) {
    const control = button(tr(value), () => { scope = value; viewRevision++; void refresh(); }, value === data.scope ? 'selected' : '');
    control.disabled = mutating || value === 'project' && !data.project; control.setAttribute('aria-pressed', String(value === data.scope)); segmented.append(control);
  }
  toolbar.append(segmented, button(tr('newSession'), () => { setupOpen = true; validationKey = null; void refresh(true); render(true); }, 'btn ghost small'));
  const columns = el('div', 'columns'), side = el('aside');
  side.append(sectionHead(tr('sessions'), undefined, data.sessions.length));
  const sessions = el('div', 'session-list'); sessions.append(...data.sessions.map(session => sessionRow(session, data.trackingSessionId))); side.append(sessions);
  side.append(divider(), projectConnection(data), divider(), el('h2', 'settings-title', tr('settings')), languageControl());
  const actions = el('div', 'form-actions');
  actions.append(button(copied ? tr('copied') : tr('copySessionId'), () => void copyId(), 'btn ghost small'));
  if (!data.session.endedAt) actions.append(button(tr('endTracking'), () => void mutate('end_tracking', { trackingSessionId: data.trackingSessionId }), 'btn ghost small danger'));
  side.append(actions);
  columns.append(tasksSection(data), side); wrap.append(toolbar, columns); return wrap;
}
function footer(data: Snapshot): HTMLElement {
  const wrap = el('footer', 'meta-footer'), left = el('div', 'footer-left');
  const lastActivity = data.scope === 'project'
    ? data.sessions.map(session => session.lastAgentEventAt).filter((value): value is string => !!value).sort().at(-1) ?? null
    : data.session.lastAgentEventAt;
  left.append(el('span', `live-dot${disconnected ? ' offline' : ''}`), el('span', '', data.scope === 'project' ? tr('project') : data.session.activitySource === 'hook' ? tr('hook') : tr('reported')),
    el('span', '', '·'), el('span', '', tr('lastUpdated')), timeNode(lastActivity));
  wrap.append(left, el('span', '', disconnected ? tr('disconnected') : mutating ? tr('saving') : tr('connected'))); return wrap;
}
function statusMessage(): HTMLElement | null {
  if (!disconnected && !errorCode && !validationKey) return null;
  const wrap = el('div', `status-line${!disconnected ? ' error-line' : ''}`); wrap.setAttribute('role', 'status');
  wrap.append(el('span', '', validationKey ? tr(validationKey) : errorLabel(locale, errorCode ?? (disconnected ? 'CONNECTION_FAILED' : undefined))));
  wrap.append(button(disconnected ? tr('reconnect') : tr('close'), () => {
    if (disconnected) void refresh(true);
    else { errorCode = null; validationKey = null; render(true); }
  }, 'btn ghost small')); return wrap;
}
function render(force = false): void {
  if (disposed) return;
  const { snapshotAt: _ignored, ...data } = snapshot ?? { snapshotAt: '' };
  const signature = JSON.stringify({ data, catalog, expanded, setupOpen, ready, disconnected, mutating, errorCode, validationKey, locale, copied });
  if (!force && signature === lastRender) {
    document.querySelectorAll<HTMLElement>('.relative-time').forEach(node => { node.textContent = relativeTime(locale, node.dataset.iso ?? null); });
    return;
  }
  lastRender = signature;
  const active = document.activeElement;
  const activeId = active instanceof HTMLElement ? active.id : '';
  const selection = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? [active.selectionStart, active.selectionEnd] : null;
  document.documentElement.lang = locale;
  const shell = el('div', 'shell'); shell.append(brandHeader());
  if (!ready) { const loading = el('div', 'loading'); loading.append(el('div', 'spinner'), document.createTextNode(tr('loading'))); shell.append(loading); }
  else if (setupOpen || !snapshot) shell.append(setup());
  else {
    shell.append(summary(snapshot));
    if (!snapshot.session.endedAt && (snapshot.session.host === 'codex' || snapshot.session.host === 'claude-code') && snapshot.session.hostSessionBound === false) {
      shell.append(el('p', 'connect-notice', tr('connectAgent')));
    }
    if (expanded) shell.append(details(snapshot)); shell.append(footer(snapshot));
  }
  const status = statusMessage(); if (status) shell.append(status);
  root.replaceChildren(shell);
  if (activeId) {
    const next = document.getElementById(activeId); next?.focus({ preventScroll: true });
    if (selection && (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement)) try { next.setSelectionRange(selection[0], selection[1]); } catch { /* Some input types do not support text selection. */ }
  }
}

async function refresh(withCatalog = false): Promise<void> {
  if (disposed || mutating || !call) return;
  if (polling) { refreshRequested = true; catalogRefreshRequested ||= withCatalog; return; }
  polling = true;
  const revision = viewRevision;
  const requestedSessionId = trackingSessionId;
  const requestedScope = scope;
  try {
    const needCatalog = withCatalog || !ready || Date.now() - lastCatalogFetch >= 5000;
    const result = await Promise.all([
      needCatalog ? call('get_catalog', {}) as Promise<Catalog> : Promise.resolve(null),
      requestedSessionId ? call('poll_progress', { trackingSessionId: requestedSessionId, scope: requestedScope }) as Promise<Snapshot> : Promise.resolve(null),
    ]);
    if (disposed || mutating || revision !== viewRevision) return;
    if (result[0]) { catalog = result[0]; locale = catalog.settings.locale; lastCatalogFetch = Date.now(); }
    if (result[1]) { snapshot = result[1]; locale = snapshot.settings.locale; }
    ready = true; disconnected = false;
    if (errorCode === 'CONNECTION_FAILED' || errorCode === 'HOST_TOOL_UNAVAILABLE') errorCode = null;
    startPolling();
  } catch (error) {
    if (disposed || mutating || revision !== viewRevision) return;
    if (error instanceof RequestError && error.code === 'NOT_FOUND') { errorCode = error.code; disconnected = false; trackingSessionId = null; snapshot = null; setupOpen = true; }
    else {
      disconnected = true;
      errorCode = error instanceof RequestError ? error.code : 'CONNECTION_FAILED';
      if (errorCode === 'HOST_TOOL_UNAVAILABLE') stopPolling();
    }
    ready = true;
  } finally {
    polling = false; render();
    for (const resolve of pollWaiters.splice(0)) resolve();
    if (refreshRequested && !disposed) {
      const includeCatalog = catalogRefreshRequested; refreshRequested = false; catalogRefreshRequested = false;
      void refresh(includeCatalog);
    }
  }
}
async function mutation(operation: () => Promise<void>, intent: ContextIntent | false = 'update'): Promise<void> {
  if (mutating || !call) return;
  mutating = true; viewRevision++; validationKey = null; errorCode = null; render(true);
  let succeeded = false;
  try { await operation(); disconnected = false; succeeded = true; }
  catch (error) {
    errorCode = error instanceof RequestError ? error.code : 'CONNECTION_FAILED';
    disconnected = errorCode === 'CONNECTION_FAILED' || errorCode === 'HOST_TOOL_UNAVAILABLE';
  } finally {
    if (polling) await new Promise<void>(resolve => { pollWaiters.push(resolve); });
    mutating = false;
    // A conflict refreshes the row, but never silently overwrites another session's work.
    await refresh(true);
    const observedEnd = intent === 'end' && !!snapshot?.session.endedAt;
    if ((succeeded || observedEnd) && intent && syncContext && snapshot) {
      try { await syncContext(snapshot, intent); }
      catch { errorCode = 'CONTEXT_SYNC_FAILED'; }
    }
    render(true);
  }
}
async function mutate(name: string, args: Args, onSuccess?: (result: unknown) => void): Promise<void> {
  const intent = name === 'save_settings' ? false : name === 'start_tracking' ? 'start' : name === 'resume_tracking' ? 'resume' : name === 'end_tracking' ? 'end' : 'update';
  return mutation(async () => { const result = await mutationRequests.perform(name, args); onSuccess?.(result); }, intent);
}
async function copyId(): Promise<void> {
  if (!trackingSessionId) return;
  try {
    await navigator.clipboard.writeText(trackingSessionId); copied = true; render(true);
    setTimeout(() => { copied = false; render(true); }, 2000);
  } catch { errorCode = 'COPY_FAILED'; render(true); }
}
function stopPolling(): void { if (interval) clearInterval(interval); interval = null; }
function startPolling(): void {
  if (disposed || document.hidden || interval || errorCode === 'HOST_TOOL_UNAVAILABLE') return;
  interval = setInterval(() => void refresh(), 1000);
}
function dispose(): void { disposed = true; stopPolling(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) stopPolling(); else { void refresh(true); startPolling(); } });
window.addEventListener('pagehide', dispose, { once: true });

function unwrap(value: unknown): unknown {
  const payload = value as { error?: { code?: string; message?: string } };
  if (payload?.error) throw new RequestError(payload.error.code ?? 'REQUEST_FAILED', payload.error.message);
  return value;
}
async function boot(): Promise<void> {
  render(true);
  if (location.pathname === '/preview' && window.parent === window) {
    call = async (name, args) => {
      let response: Response;
      try { response = await fetch('/api/action', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10_000), body: JSON.stringify({ action: name === 'poll_progress' ? 'get_snapshot' : name, args }) }); }
      catch { throw new RequestError('CONNECTION_FAILED'); }
      const payload = await response.json() as { result?: unknown; error?: { code?: string; message?: string } };
      unwrap(payload);
      if (!response.ok) throw new RequestError('REQUEST_FAILED');
      return payload.result;
    };
  } else {
    const app = new App({ name: 'CheckYourProcess', version: '0.1.0-beta.5' });
    syncContext = async (data, intent) => { await app.updateModelContext(trackingContext(data, intent)); };
    app.ontoolinput = params => {
      const args = params.arguments;
      if (typeof args?.trackingSessionId === 'string') { trackingSessionId = args.trackingSessionId; setupOpen = false; viewRevision++; }
      if (args?.host && ['codex', 'claude-code', 'claude-desktop', 'chatgpt'].includes(String(args.host))) drafts.host = String(args.host);
      if (args?.scope === 'project' || args?.scope === 'session') scope = args.scope;
    };
    app.ontoolresult = result => {
      let data: Snapshot;
      try { data = toolPayload(result) as unknown as Snapshot; }
      catch (error) { errorCode = error instanceof RequestError ? error.code : 'REQUEST_FAILED'; render(true); return; }
      if (typeof data?.trackingSessionId === 'string') { trackingSessionId = data.trackingSessionId; snapshot = data; scope = data.scope; locale = data.settings.locale; setupOpen = false; ready = true; viewRevision++; render(); }
    };
    app.onteardown = async () => { dispose(); return {}; };
    call = async (name, args) => {
      let result;
      try { result = await app.callServerTool({ name, arguments: args }, { timeout: name === 'poll_progress' ? 10_000 : 60_000 }); }
      catch (error) { throw bridgeError(error); }
      return toolPayload(result);
    };
    try { await app.connect(); }
    catch { ready = true; errorCode = 'BRIDGE_FAILED'; render(true); return; }
  }
  await refresh(true); startPolling();
}
void boot();
