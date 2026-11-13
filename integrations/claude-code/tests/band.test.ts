import { expect, mock, test } from 'claude-code/testing';
const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { offset: 0, bodyRows: 12 }, view: {} } } as const;
const snapshot = {
  trackingSessionId: 'tracking-1', scope: 'session', project: { id: 'project-1', name: 'Shared project' },
  session: { title: 'Session one', activity: 'waiting', activitySource: 'hook', lastAgentEventAt: '2026-11-11T00:00:00Z', endedAt: null },
  sessions: [{ id: 'tracking-1', title: 'Session one', host: 'claude-code', activity: 'waiting', endedAt: null }],
  tasks: [{ id: 'task-1', title: '<script>literal task</script>', status: 'completed', revision: 1 }],
  progress: { completed: 1, total: 2, percent: 50 }, settings: { locale: 'en' },
};

function stubService(on: any, available: () => boolean = () => true, data: any = snapshot, projects: any[] = []) {
  let locale = data.settings.locale;
  const requests: any[] = [];
  on('env.get', ($: any, e: any) => ({ value: e.name === 'USERPROFILE' ? 'C:/test' : e.name === 'LOCALAPPDATA' ? 'C:/virtualized-app-data' : undefined }));
  on('fs.read', (_$: any, e: any) => {
    expect(String(e.path).replace(/\\/g, '/')).toBe('C:/test/.checkyourprocess/runtime.json');
    return { value: JSON.stringify({ port: 49173, token: 'test-placeholder' }) };
  });
  on('session.id', () => ({ value: 'native-1' }));
  on('session.start', () => ({ cwd: '/work' }));
  on('http.fetch', ($: any, e: any) => {
    const request = JSON.parse(e.init?.body ?? '{}');
    requests.push({ url: e.url, body: request });
    if (request.action === 'save_settings') locale = request.args.locale;
    const result = request.action === 'get_binding' ? { trackingSessionId: 'tracking-1' }
      : request.action === 'get_catalog' ? { projects, sessions: [], settings: { locale: 'en' } }
      : { ...data, settings: { locale }, scope: request.args?.scope ?? 'session' };
    return { value: { ok: available(), status: available() ? 200 : 503, headers: {}, text: JSON.stringify({ result }) } };
  });
  return requests;
}

test('untracked sessions show opt-in, without a fabricated percentage', async ($, on) => {
  mock.clock(on);
  const ui = await $.ui.mount({ plugin: 'checkyourprocess', surface: 'terminal', ...BAND });
  expect(await ui.find({ key: 'checkyourprocess:track' })).toBeDefined();
  const panel = await ui.find({ key: 'checkyourprocess:panel' });
  expect(panel?.props.borderStyle).toBe('single');
  expect(panel?.props.marginY).toBe(1);
  expect(await ui.find({ type: 'Text', text: /0%/ })).toBeUndefined();
  await ui.unmount();
});

test('another mod stays outside the progress panel and its details button remains independent', async ($, on) => {
  mock.clock(on);
  stubService(on);
  let otherPresses = 0;
  on('ui.render', ($: any, e: any) => {
    const { Box, Text, Button } = $.ui.resolve(e);
    return Box({ key: 'other-panel', children: [
      Text({ children: ['Other extension'] }),
      Button({ key: 'details', label: 'Other details', onPress: () => { otherPresses++; } }),
    ] });
  });
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' });
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'checkyourprocess', surface, ...BAND });
    const panel = await ui.find({ key: 'checkyourprocess:panel' });
    expect(panel?.props.borderStyle).toBe('single');
    expect(panel?.props.marginY).toBe(1);
    expect(JSON.stringify(panel).includes('Other extension')).toBe(false);
    expect(await ui.find({ key: 'other-panel' })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: /^CheckYourProcess/ })).toBeDefined();
    expect(await ui.find({ key: 'details' })).toBeDefined();
    expect(await ui.find({ key: 'checkyourprocess:locale-ko' })).toBeUndefined();
    await ui.press({ key: 'checkyourprocess:details' });
    expect(await ui.find({ key: 'checkyourprocess:locale-ko' })).toBeDefined();
    expect(await ui.find({ key: 'other-panel' })).toBeDefined();
    await ui.press({ key: 'checkyourprocess:details' });
    await ui.unmount();
  }
  expect(otherPresses).toBe(0);
});

test('real progress renders on terminal and desktop and details can expand', async ($, on) => {
  mock.clock(on);
  stubService(on);
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' });
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'checkyourprocess', surface, ...BAND });
    if (surface === 'desktop') expect(await ui.find({ type: 'Svg' })).toBeDefined();
    else expect(await ui.find({ type: 'Text', text: /50%/ })).toBeDefined();
    await ui.press({ key: 'checkyourprocess:details' });
    expect(await ui.find({ key: 'checkyourprocess:locale-ko' })).toBeDefined();
    expect(await ui.find({ key: 'checkyourprocess:scope-project' })).toBeDefined();
    expect(await ui.find({ key: 'checkyourprocess:open-card' })).toBeUndefined();
    expect(await ui.find({ type: 'Text', text: /literal task/ })).toBeDefined();
    await ui.press({ key: 'checkyourprocess:details' });
    await ui.unmount();
  }
});

test('disconnection keeps the last confirmed progress visible', async ($, on) => {
  const clock = mock.clock(on);
  let available = true;
  stubService(on, () => available);
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' });
  available = false;
  await clock.advance(1000);
  const ui = await $.ui.mount({ plugin: 'checkyourprocess', surface: 'desktop', ...BAND });
  expect(await ui.find({ type: 'Text', text: /Disconnected/ })).toBeDefined();
  expect(await ui.find({ type: 'Svg' })).toBeDefined();
  await ui.unmount();
});

test('language buttons persist through the service and update native labels', async ($, on) => {
  mock.clock(on);
  stubService(on);
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' });
  const ui = await $.ui.mount({ plugin: 'checkyourprocess', surface: 'desktop', ...BAND });
  await ui.press({ key: 'checkyourprocess:details' });
  await ui.press({ key: 'checkyourprocess:locale-ko' });
  expect(await ui.find({ type: 'Text', text: /1\/2 완료/ })).toBeDefined();
  expect(await ui.find({ type: 'Button', text: /세션별/ })).toBeDefined();
  await ui.unmount();
});

test('project activity includes another running session', async ($, on) => {
  mock.clock(on);
  const data = { ...snapshot, sessions: [...snapshot.sessions, { id: 'tracking-2', title: 'Parallel session', host: 'codex', activity: 'running', endedAt: null }] };
  stubService(on, () => true, data);
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' });
  const ui = await $.ui.mount({ plugin: 'checkyourprocess', surface: 'terminal', ...BAND });
  expect(await ui.find({ type: 'Text', text: /^Waiting$/ })).toBeDefined();
  await ui.press({ key: 'checkyourprocess:details' });
  await ui.press({ key: 'checkyourprocess:scope-project' });
  expect(await ui.find({ type: 'Text', text: /^Running$/ })).toBeDefined();
  await ui.unmount();
});

test('an aborted main turn reports interruption without completing tasks', async ($, on) => {
  mock.clock(on);
  const requests = stubService(on);
  on('turn.complete', () => ({ text: '' }));
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' });
  await $.turn.complete({ turnId: 'turn-1', answer: '', durationMs: 5, isAborted: true, usage: null });
  expect(requests.filter(request => request.body.event === 'interrupt').length).toBe(1);
  expect(requests.filter(request => request.body.action === 'update_task').length).toBe(0);
});

const manyTasks = Array.from({ length: 6 }, (_, index) => ({ id: `task-${index + 1}`, title: `Step ${index + 1}`, status: index < 2 ? 'completed' : 'pending', revision: 1, sessionIds: ['tracking-1'] }));

test('details page through every task instead of truncating, so no full card is needed', async ($, on) => {
  mock.clock(on);
  stubService(on, () => true, { ...snapshot, tasks: manyTasks, progress: { completed: 2, total: 6, percent: 33 } });
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' });
  const ui = await $.ui.mount({ plugin: 'checkyourprocess', surface: 'terminal', ...BAND });
  await ui.press({ key: 'checkyourprocess:details' });
  expect(await ui.find({ type: 'Text', text: /Step 1$/ })).toBeDefined();
  expect(await ui.find({ type: 'Text', text: /Step 5$/ })).toBeUndefined();
  expect(await ui.find({ key: 'checkyourprocess:open-card' })).toBeUndefined();
  await ui.press({ key: 'checkyourprocess:page-next' });
  expect(await ui.find({ type: 'Text', text: /Step 6$/ })).toBeDefined();
  expect(await ui.find({ type: 'Text', text: /Step 1$/ })).toBeUndefined();
  await ui.press({ key: 'checkyourprocess:page-prev' });
  expect(await ui.find({ type: 'Text', text: /Step 1$/ })).toBeDefined();
  await ui.unmount();
});

test('a standalone session can connect to an existing project from the details view', async ($, on) => {
  mock.clock(on);
  const requests = stubService(on, () => true, { ...snapshot, project: null }, [{ id: 'project-9', name: 'Shared experiment', createdAt: '2026-11-12T00:00:00Z' }]);
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' });
  const ui = await $.ui.mount({ plugin: 'checkyourprocess', surface: 'terminal', ...BAND });
  await ui.press({ key: 'checkyourprocess:details' });
  expect(await ui.find({ key: 'checkyourprocess:scope-project' })).toBeUndefined();
  await ui.press({ key: 'checkyourprocess:connect-project' });
  expect(await ui.find({ type: 'Button', text: /Shared experiment/ })).toBeDefined();
  expect(requests.some(request => request.body.action === 'connect_project')).toBe(false);
  await ui.press({ key: 'checkyourprocess:project-project-9' });
  const connect = requests.find(request => request.body.action === 'connect_project');
  expect(connect?.body.args.trackingSessionId).toBe('tracking-1');
  expect(connect?.body.args.projectId).toBe('project-9');
  expect(typeof connect?.body.args.mutationId).toBe('string');
  await ui.unmount();
});

test('project view links only the tasks this session is missing', async ($, on) => {
  mock.clock(on);
  const tasks = [
    { id: 'task-1', title: 'Already mine', status: 'completed', revision: 1, sessionIds: ['tracking-1'] },
    { id: 'task-2', title: 'Shared elsewhere', status: 'pending', revision: 1, sessionIds: ['tracking-2'] },
    { id: 'task-3', title: 'Also elsewhere', status: 'pending', revision: 1, sessionIds: ['tracking-2'] },
  ];
  const requests = stubService(on, () => true, { ...snapshot, tasks, progress: { completed: 1, total: 3, percent: 33 } });
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' });
  const ui = await $.ui.mount({ plugin: 'checkyourprocess', surface: 'terminal', ...BAND });
  await ui.press({ key: 'checkyourprocess:details' });
  await ui.press({ key: 'checkyourprocess:scope-project' });
  expect(await ui.find({ key: 'checkyourprocess:link-task-1' })).toBeUndefined();
  await ui.press({ key: 'checkyourprocess:link-task-2' });
  expect(requests.find(request => request.body.action === 'link_tasks')?.body.args.taskIds).toEqual(['task-2']);
  await ui.press({ key: 'checkyourprocess:link-all' });
  expect(requests.filter(request => request.body.action === 'link_tasks').pop()?.body.args.taskIds).toEqual(['task-2', 'task-3']);
  await ui.unmount();
});

test('running sub-agents render on terminal and desktop in both languages', async ($, on) => {
  mock.clock(on);
  stubService(on, () => true, { ...snapshot, session: { ...snapshot.session, activeAgents: 2 } });
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' });
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'checkyourprocess', surface, ...BAND });
    expect(await ui.find({ type: 'Text', text: /^2 sub-agent\(s\)$/ })).toBeDefined();
    await ui.press({ key: 'checkyourprocess:details' });
    await ui.press({ key: 'checkyourprocess:locale-ko' });
    expect(await ui.find({ type: 'Text', text: /^서브 2개 실행$/ })).toBeDefined();
    await ui.press({ key: 'checkyourprocess:locale-en' });
    await ui.press({ key: 'checkyourprocess:details' });
    await ui.unmount();
  }
});

test('no sub-agent text appears when none are running', async ($, on) => {
  mock.clock(on);
  stubService(on, () => true, { ...snapshot, session: { ...snapshot.session, activeAgents: 0 } });
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' });
  const ui = await $.ui.mount({ plugin: 'checkyourprocess', surface: 'terminal', ...BAND });
  expect(await ui.find({ type: 'Text', text: /sub-agent/ })).toBeUndefined();
  await ui.unmount();
});
