import { atom, read, update } from 'claude-code';
import type { EngineInterface, Register } from 'claude-code';

type Locale = 'ko' | 'en';
type Scope = 'session' | 'project';
type View = 'tasks' | 'projects';
type Snapshot = {
  trackingSessionId: string; scope: Scope; project: { id: string; name: string } | null;
  session: { title: string; activity: string; activitySource: string; lastAgentEventAt: string | null; endedAt: string | null; activeAgents?: number };
  sessions: { id: string; title: string; host: string; activity: string; endedAt: string | null; activeAgents?: number }[];
  tasks: { id: string; title: string; status: string; revision: number; sessionIds?: string[] }[];
  progress: { completed: number; total: number; percent: number | null };
  settings: { locale: Locale };
};
type BandState = {
  snapshot: Snapshot | null; locale: Locale; scope: Scope; details: boolean;
  connected: boolean; lastHostSessionId: string;
  page: number; view: View; projects: { id: string; name: string }[]; projectPage: number;
};
const INITIAL: BandState = {
  snapshot: null, locale: 'ko', scope: 'session', details: false, connected: true, lastHostSessionId: '',
  page: 0, view: 'tasks', projects: [], projectPage: 0,
};
// The details view replaces the in-chat card, so long lists are paged instead of truncated.
const PAGE_SIZE = 4;
const pageCount = (length: number) => Math.max(1, Math.ceil(length / PAGE_SIZE));
const band = atom({ plugin: 'checkyourprocess', key: 'band' } as const, INITIAL);
const labels = {
  ko: { details: '상세', compact: '간단히', session: '세션별', project: '프로젝트', idle: '대기', running: '실행 중', waiting: '입력 대기', interrupted: '중단됨', error: '오류', noPlan: '계획 없음', disconnected: '연결 끊김', start: '추적 시작', enable: '추적 시작을 요청하세요', completed: '완료', updated: '최근 활동', sessions: '연결된 세션', reported: '마지막 보고', hook: '앱 이벤트', ended: '추적 종료', language: '표시 언어', retry: '다시 시도', updateFailed: '갱신하지 못했습니다. 최신 상태를 확인한 후 다시 시도하세요.', connectProject: '프로젝트 연결', chooseProject: '연결할 프로젝트를 선택하세요', noProjects: '연결할 수 있는 프로젝트가 없습니다. 대화에서 프로젝트를 먼저 만들어 주세요.', cancel: '취소', prev: '이전', next: '다음', link: '연결', linkAll: '미연결 작업 모두 연결', connectFailed: '프로젝트에 연결하지 못했습니다. 이미 다른 프로젝트에 속한 세션일 수 있습니다.', linkFailed: '작업을 연결하지 못했습니다. 최신 상태를 확인한 후 다시 시도하세요.', unlinkedHint: '프로젝트 작업 중 이 세션에 연결되지 않은 항목은 눌러서 연결합니다', agents: '서브 {n}개 실행' },
  en: { details: 'Details', compact: 'Compact', session: 'Session', project: 'Project', idle: 'Idle', running: 'Running', waiting: 'Waiting', interrupted: 'Interrupted', error: 'Error', noPlan: 'No plan', disconnected: 'Disconnected', start: 'Start tracking', enable: 'Ask to start tracking', completed: 'complete', updated: 'Last activity', sessions: 'Connected sessions', reported: 'Last reported', hook: 'App event', ended: 'Tracking ended', language: 'Language', retry: 'Retry', updateFailed: 'Update failed. Refresh the latest state and try again.', connectProject: 'Connect project', chooseProject: 'Choose a project to connect', noProjects: 'No project to connect. Ask in the chat to create one first.', cancel: 'Cancel', prev: 'Prev', next: 'Next', link: 'link', linkAll: 'Link all unlinked tasks', connectFailed: 'Could not connect to the project. This session may already belong to another project.', linkFailed: 'Could not link the task. Refresh the latest state and try again.', unlinkedHint: 'Project tasks not linked to this session are pressable to link', agents: '{n} sub-agent(s)' },
} as const;

async function runtime($: EngineInterface): Promise<{ url: string; token: string }> {
  const custom = await $.env.get('CYP_DATA_DIR');
  const profile = custom ? undefined : (await $.env.get('USERPROFILE')) || (await $.env.get('HOME'));
  if (!custom && !profile) throw new Error('User profile directory is unavailable');
  const base = custom || `${profile}/.checkyourprocess`;
  const record = JSON.parse(await $.fs.read(`${base}/runtime.json`));
  if (!Number.isInteger(record.port) || record.port < 1 || record.port > 65535 || typeof record.token !== 'string') throw new Error('Unavailable');
  return { url: `http://127.0.0.1:${record.port}`, token: record.token };
}

async function action($: EngineInterface, name: string, args: Record<string, unknown>): Promise<any> {
  const connection = await runtime($);
  const response = await $.http.fetch(`${connection.url}/api/action`, {
    method: 'POST', headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action: name, args }),
  });
  const envelope = JSON.parse(response.text);
  if (!response.ok || envelope.error) throw new Error('Unavailable');
  return envelope.result;
}

async function mutationId($: EngineInterface, kind: string): Promise<string> {
  return `${kind}:${await $.session.id()}:${await $.clock.now()}:${Math.random()}`;
}

async function interrupted($: EngineInterface, turnId: string) {
  const connection = await runtime($);
  const hostSessionId = await $.session.id();
  await $.http.fetch(`${connection.url}/api/hook`, {
    method: 'POST', headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ host: 'claude-code', hostSessionId, event: 'interrupt', eventId: `${hostSessionId}:${turnId}:interrupt` }),
  });
}

async function refresh($: EngineInterface) {
  const hostSessionId = await $.session.id();
  const previous = await read($, band);
  // /clear and /resume can change the native ID without restarting this module.
  if (previous.lastHostSessionId !== hostSessionId) await update($, band, b => ({ ...b, snapshot: null, scope: 'session', page: 0, view: 'tasks', lastHostSessionId: hostSessionId }));
  try {
    const binding = await action($, 'get_binding', { host: 'claude-code', hostSessionId });
    const current = await read($, band);
    if (!binding.trackingSessionId) {
      const catalog = await action($, 'get_catalog', {});
      await update($, band, b => ({ ...b, snapshot: null, locale: catalog.settings.locale, connected: true }));
      return;
    }
    const scope = current.snapshot?.trackingSessionId === binding.trackingSessionId ? current.scope : 'session';
    const snapshot = await action($, 'get_snapshot', { trackingSessionId: binding.trackingSessionId, scope });
    await update($, band, b => ({ ...b, scope, snapshot, locale: snapshot.settings.locale, connected: true }));
  } catch {
    // Keep the last confirmed values, instead of fabricating new progress.
    await update($, band, b => ({ ...b, connected: false }));
  }
}

let timer: { cancel(): void } | undefined;
let polling = false;
async function poll($: EngineInterface) {
  if (polling) return;
  polling = true;
  try { await refresh($); } finally { polling = false; }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    timer?.cancel();
    await poll($);
    timer = $.clock.every(1000, () => poll($));
    return next(e);
  });
  on('session.end', async ($, e, next) => {
    timer?.cancel();
    timer = undefined;
    return next(e);
  });
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && e.isAborted) {
      try { await interrupted($, e.turnId); await poll($); } catch { /* An interrupted turn must stay interrupted even if tracking is offline. */ }
    }
    return next(e);
  });
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e).catch(() => undefined);
    if (e.props.hasSurvey) return below;
    const b = await read($, band);
    const l = labels[b.locale];
    const { Box, Text, Button } = $.ui.resolve(e);
    const text = (value: string, props: Record<string, unknown> = {}) => Text({ color: '#FFFFFF', ...props, children: [value] } as any);
    const button = (key: string, label: string, onPress: () => unknown) => Button({ key: `checkyourprocess:${key}`, children: [text(label)], plain: true, onPress } as any);
    const stack = (mine: any) => {
      // AbovePrompt is shared; keep other mods outside our panel and leave space in either middleware order.
      const panel = Box({ key: 'checkyourprocess:panel', flexDirection: 'column', marginY: 1, paddingX: 1,
        borderStyle: 'single', borderColor: '#FFFFFF', borderDimColor: false, backgroundColor: '#000000', children: [mine] });
      return below ? Box({ flexDirection: 'column', children: [panel, below] }) : panel;
    };
    const toggle = () => update($, band, x => ({ ...x, details: !x.details, view: 'tasks' }));
    if (!b.snapshot) {
      return stack(Box({ flexDirection: 'row', gap: 1, alignItems: 'center', children: [
        text('■'), text('CheckYourProcess'), text(l.enable, { dimColor: true }),
        !b.connected ? text(l.disconnected) : undefined,
        button('track', l.start, () => $.command.run({ command: 'checkyourprocess:track', args: '' })),
      ].filter(Boolean) }));
    }
    const s = b.snapshot;
    const { completed, total, percent } = s.progress;
    const fill = percent === null ? 0 : Math.round(percent / 10);
    const progress = percent === null ? l.noPlan : `${'█'.repeat(fill)}${'░'.repeat(10 - fill)} ${percent}%`;
    const activeStates = s.sessions.filter(session => !session.endedAt).map(session => session.activity);
    const projectActivity = ['error', 'running', 'waiting', 'interrupted', 'idle'].find(value => activeStates.includes(value)) ?? 'idle';
    const activity = b.scope === 'project' ? projectActivity : e.props.isWorking ? 'running' : s.session.activity;
    const activityText = b.scope === 'session' && s.session.endedAt ? l.ended : (l[activity as keyof typeof l] ?? activity);
    const agentCount = b.scope === 'project'
      ? s.sessions.filter(session => !session.endedAt).reduce((sum, session) => sum + (session.activeAgents ?? 0), 0)
      : s.session.endedAt ? 0 : s.session.activeAgents ?? 0;
    let progressElement = text(progress);
    if (e.surface === 'desktop' && percent !== null) {
      const { Svg } = $.ui.resolve(e);
      const blocks = Array.from({ length: 10 }, (_, index) => `<rect x="${4 + index * 10}" y="8" width="7" height="4" fill="${index < Math.floor(percent / 10) ? '#fff' : '#000'}"/>`).join('');
      progressElement = Svg({ source: `<svg xmlns="http://www.w3.org/2000/svg" width="156" height="20" viewBox="0 0 156 20" shape-rendering="crispEdges"><rect x="1" y="5" width="106" height="10" fill="#000" stroke="#fff"/>${blocks}<text x="114" y="15" font-family="monospace" font-size="12" fill="#fff">${percent}%</text></svg>`, alt: `${percent}%`, width: 156, height: 20 });
    }
    const header = Box({ flexDirection: 'row', alignItems: 'center', gap: 1, children: [
      text(activity === 'running' ? '■' : '□'),
      text(`CheckYourProcess · ${s.project?.name ?? s.session.title}`, { bold: true, wrap: 'truncate-end' }),
      text(activityText, { dimColor: true }),
      agentCount > 0 ? text(l.agents.replace('{n}', String(agentCount)), { dimColor: true }) : undefined,
      progressElement,
      text(`${completed}/${total} ${l.completed}`, { dimColor: true }),
      !b.connected ? text(l.disconnected) : undefined,
      Box({ flexGrow: 1 }),
      button('details', b.details ? l.compact : l.details, toggle),
    ].filter(Boolean) });
    if (!b.details) return stack(header);

    const ended = !!s.session.endedAt;
    const setScope = async (scope: Scope) => { await update($, band, x => ({ ...x, scope, page: 0 })); await poll($); };
    const setLocale = async (locale: Locale) => {
      try {
        await action($, 'save_settings', { locale, mutationId: await mutationId($, 'locale') });
        await poll($);
      } catch { await $.ui.toast(l.updateFailed); }
    };
    const movePage = (key: 'page' | 'projectPage', length: number, delta: number) => update($, band, x => ({ ...x, [key]: Math.min(pageCount(length) - 1, Math.max(0, x[key] + delta)) }));
    const pager = (key: 'page' | 'projectPage', length: number, current: number, extra: any[] = []) => Box({ flexDirection: 'row', gap: 1, children: [
      length > PAGE_SIZE ? button(`${key}-prev`, `‹ ${l.prev}`, () => movePage(key, length, -1)) : undefined,
      length > PAGE_SIZE ? text(`${current + 1}/${pageCount(length)}`, { dimColor: true }) : undefined,
      length > PAGE_SIZE ? button(`${key}-next`, `${l.next} ›`, () => movePage(key, length, 1)) : undefined,
      ...extra,
    ].filter(Boolean) });
    const connectProject = async (projectId: string) => {
      try {
        await action($, 'connect_project', { trackingSessionId: s.trackingSessionId, projectId, mutationId: await mutationId($, 'connect') });
        await update($, band, x => ({ ...x, view: 'tasks', page: 0, projects: [] }));
        await poll($);
      } catch { await $.ui.toast(l.connectFailed); }
    };
    const openProjects = async () => {
      try {
        const catalog = await action($, 'get_catalog', {});
        await update($, band, x => ({ ...x, view: 'projects', projectPage: 0, projects: (catalog.projects ?? []).map((project: any) => ({ id: String(project.id), name: String(project.name) })) }));
      } catch { await $.ui.toast(l.updateFailed); }
    };
    const linkTasks = async (taskIds: string[]) => {
      try {
        await action($, 'link_tasks', { trackingSessionId: s.trackingSessionId, taskIds: taskIds.slice(0, 100), mutationId: await mutationId($, 'link') });
        await poll($);
      } catch { await $.ui.toast(l.linkFailed); }
    };

    const body: any[] = [Box({ flexDirection: 'row', gap: 1, children: [
      button('scope-session', `${b.scope === 'session' ? '■ ' : ''}${l.session}`, () => setScope('session')),
      s.project ? button('scope-project', `${b.scope === 'project' ? '■ ' : ''}${l.project}`, () => setScope('project')) : undefined,
      Box({ flexGrow: 1 }), text(l.language, { dimColor: true }),
      button('locale-ko', '한국어', () => setLocale('ko')),
      button('locale-en', 'English', () => setLocale('en')),
      button('refresh', l.retry, () => poll($)),
    ].filter(Boolean) })];
    body.push(text(`${s.session.activitySource === 'hook' ? l.hook : l.reported} · ${l.updated}: ${s.session.lastAgentEventAt ? new Date(s.session.lastAgentEventAt).toLocaleString(b.locale === 'ko' ? 'ko-KR' : 'en-US') : '—'}`, { dimColor: true }));

    if (b.view === 'projects' && !s.project && !ended) {
      const current = Math.min(b.projectPage, pageCount(b.projects.length) - 1);
      body.push(text(l.chooseProject, { bold: true }));
      for (const project of b.projects.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)) body.push(button(`project-${project.id}`, `▸ ${project.name}`, () => connectProject(project.id)));
      if (!b.projects.length) body.push(text(l.noProjects, { dimColor: true }));
      body.push(pager('projectPage', b.projects.length, current, [button('projects-cancel', l.cancel, () => update($, band, x => ({ ...x, view: 'tasks' })))]));
    } else {
      const current = Math.min(b.page, pageCount(s.tasks.length) - 1);
      const mark = (status: string) => status === 'completed' ? '[x]' : status === 'in_progress' ? '[>]' : '[ ]';
      const unlinked = s.tasks.filter(task => task.sessionIds && !task.sessionIds.includes(s.trackingSessionId));
      for (const task of s.tasks.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)) {
        if (!ended && unlinked.includes(task)) body.push(button(`link-${task.id}`, `${mark(task.status)} ${task.title}  (+${l.link})`, () => linkTasks([task.id])));
        else body.push(text(`${mark(task.status)} ${task.title}`, { wrap: 'truncate-end' }));
      }
      if (!s.tasks.length) body.push(text(l.noPlan, { dimColor: true }));
      const extra = [
        !ended && unlinked.length > 1 ? button('link-all', `${l.linkAll} (${unlinked.length})`, () => linkTasks(unlinked.map(task => task.id))) : undefined,
        !ended && !s.project ? button('connect-project', l.connectProject, openProjects) : undefined,
      ].filter(Boolean);
      if (s.tasks.length > PAGE_SIZE || extra.length) body.push(pager('page', s.tasks.length, current, extra));
    }
    body.push(text(`${l.sessions}: ${s.sessions.map(session => `${session.title} (${session.endedAt ? l.ended : l[session.activity as keyof typeof l] ?? session.activity})`).join(' · ')}`, { dimColor: true, wrap: 'truncate-end' }));
    return stack(Box({ flexDirection: 'column', children: [header, Box({ flexDirection: 'column', children: body })] }));
  });
};
