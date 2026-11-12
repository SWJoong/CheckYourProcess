import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startService } from '../src/service.js';
import type { Snapshot } from '../src/types.js';

async function fixture(t: TestContext) {
  const root = resolve('.local');
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, 'http-test-'));
  const htmlPath = join(directory, 'test.html');
  await writeFile(htmlPath, '<!doctype html><html><body>Progress UI</body></html>');
  const service = await startService({ dataDir: directory, port: 0, htmlPath });
  t.after(async () => {
    await service.close();
    assert.ok(resolve(directory).startsWith(root + sep));
    await rm(directory, { recursive: true, force: true });
  });
  const { url, token } = service.runtime;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  async function action(name: string, args: Record<string, unknown> = {}) {
    const response = await fetch(`${url}/api/action`, { method: 'POST', headers, body: JSON.stringify({ action: name, args }) });
    const body = await response.json() as { result: unknown; error?: { code: string } };
    return { response, ...body };
  }
  return { service, url, token, headers, action };
}

test('local API rejects unauthenticated calls, foreign origins, and invalid mutations', async t => {
  const f = await fixture(t);
  assert.equal((await fetch(`${f.url}/health`)).status, 401);
  assert.equal((await fetch(`${f.url}/health`, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await fetch(`${f.url}/health`, { headers: { ...f.headers, Origin: 'https://untrusted.example' } })).status, 403);
  const invalid = await f.action('start_tracking', { host: 'codex', title: 'Missing mutation id' });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.error?.code, 'INVALID_INPUT');
  const catalog = (await f.action('get_catalog')).result as { sessions: unknown[] };
  assert.equal(catalog.sessions.length, 0);
  assert.equal((await f.action('constructor')).error?.code, 'UNKNOWN_ACTION');
});

test('MCP lists tools, serves the embedded app, and polls without reporting activity', async t => {
  const f = await fixture(t);
  const initial = (await f.action('start_tracking', { host: 'codex', title: 'MCP integration', mutationId: randomUUID() })).result as Snapshot;
  const client = new Client({ name: 'cyp-integration-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${f.url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${f.token}` } } }));
  t.after(() => client.close());
  const list = await client.listTools();
  assert.ok(list.tools.some(tool => tool.name === 'start_tracking'));
  const poll = list.tools.find(tool => tool.name === 'poll_progress');
  assert.deepEqual((poll?._meta?.ui as { visibility?: string[] })?.visibility, ['app']);
  assert.ok(!list.tools.some(tool => tool.name === 'get_binding'));
  const result = await client.callTool({ name: 'poll_progress', arguments: { trackingSessionId: initial.trackingSessionId, scope: 'session' } });
  assert.equal(result.isError, undefined);
  const snapshot = result.structuredContent as unknown as Snapshot;
  assert.equal(snapshot.session.lastAgentEventAt, initial.session.lastAgentEventAt);
  assert.equal(snapshot.progress.percent, null);
  const resources = await client.listResources();
  const ui = await client.readResource({ uri: resources.resources[0].uri });
  assert.match(String((ui.contents[0] as { text: string }).text), /Progress UI/);
  assert.ok(!JSON.stringify(ui).includes(f.token));
  const open = await client.callTool({ name: 'show_progress', arguments: { scope: 'project' } });
  assert.equal(open.isError, undefined);
});

test('preview tickets expire after one use and grant only a same-origin UI session', async t => {
  const f = await fixture(t);
  assert.equal((await fetch(`${f.url}/preview`)).status, 401);
  const ticketResponse = await fetch(`${f.url}/api/preview-ticket`, { method: 'POST', headers: f.headers });
  const ticket = await ticketResponse.json() as { url: string };
  assert.ok(!ticket.url.includes(f.token));
  const exchange = await fetch(ticket.url, { redirect: 'manual' });
  assert.equal(exchange.status, 303);
  const cookie = exchange.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal((await fetch(ticket.url, { redirect: 'manual' })).status, 401);
  const html = await fetch(`${f.url}/preview`, { headers: { Cookie: cookie } });
  assert.equal(html.status, 200);
  assert.ok(!(await html.text()).includes(f.token));
  const catalog = await fetch(`${f.url}/api/action`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get_catalog', args: {} }) });
  assert.equal(catalog.status, 200);
  assert.equal((await fetch(`${f.url}/api/shutdown`, { method: 'POST', headers: { Cookie: cookie } })).status, 401);
});

test('MCP state reports cannot impersonate native hook telemetry', async t => {
  const f = await fixture(t);
  const initial = (await f.action('start_tracking', { host: 'claude-code', title: 'Native state', hostSessionId: 'native-test', mutationId: randomUUID() })).result as Snapshot;
  const bad = await f.action('report_state', { trackingSessionId: initial.trackingSessionId, activity: 'running', source: 'hook', mutationId: randomUUID() });
  assert.equal(bad.error?.code, 'INVALID_INPUT');
  const hook = await fetch(`${f.url}/api/hook`, { method: 'POST', headers: f.headers, body: JSON.stringify({ host: 'claude-code', hostSessionId: 'native-test', event: 'prompt', eventId: randomUUID() }) });
  assert.equal(hook.status, 200);
  const snapshot = (await f.action('get_snapshot', { trackingSessionId: initial.trackingSessionId })).result as Snapshot;
  assert.equal(snapshot.session.activitySource, 'hook');
  assert.equal(snapshot.session.activity, 'running');
});
