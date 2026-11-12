import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { dataDir, ensureService, healthProblem, isHealthy, SERVICE_ID, VERSION, type RuntimeInfo } from '../src/runtime.js';
import { startService } from '../src/service.js';

async function stubService(t: TestContext, reply: object): Promise<RuntimeInfo> {
  const server = createServer((_request, response) => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(reply)); });
  await new Promise<void>(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  t.after(() => new Promise<void>(resolveClose => server.close(() => resolveClose())));
  const { port } = server.address() as AddressInfo;
  return { port, token: 'unused', pid: 1, version: VERSION, url: `http://127.0.0.1:${port}` };
}

test('a live service is healthy; a wrong token or pid names the rejection reason', async t => {
  const root = resolve('.local');
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, 'runtime-test-'));
  const htmlPath = join(directory, 'test.html');
  await writeFile(htmlPath, '<!doctype html><html><body>Progress UI</body></html>');
  const service = await startService({ dataDir: directory, port: 0, htmlPath });
  t.after(async () => { await service.close(); await rm(directory, { recursive: true, force: true }); });
  const live = service.runtime;
  assert.equal(await healthProblem(live), null);
  assert.equal(await isHealthy(live), true);
  assert.match(await healthProblem({ ...live, token: 'wrong' }) ?? '', /HTTP 401/);
  assert.match(await healthProblem({ ...live, pid: live.pid + 1 }) ?? '', /runtime\.json says pid/);
  assert.equal(await isHealthy({ ...live, pid: live.pid + 1 }), false);
});

test('a stale version, a foreign listener and a dead port each get a distinct reason', async t => {
  const oldVersion = await stubService(t, { service: SERVICE_ID, pid: 1, version: '0.0.1' });
  assert.match(await healthProblem(oldVersion) ?? '', /version 0\.0\.1 .*stop the old service/);
  const foreign = await stubService(t, { service: 'something-else', pid: 1, version: VERSION });
  assert.match(await healthProblem(foreign) ?? '', /not a CheckYourProcess service/);
  const closed = createServer();
  await new Promise<void>(resolveListen => closed.listen(0, '127.0.0.1', resolveListen));
  const { port } = closed.address() as AddressInfo;
  await new Promise<void>(resolveClose => closed.close(() => resolveClose()));
  const dead: RuntimeInfo = { port, token: 'unused', pid: 1, version: VERSION, url: `http://127.0.0.1:${port}` };
  assert.match(await healthProblem(dead) ?? '', /unreachable/);
});

test('default storage follows the user profile across virtualized AppData environments; explicit override wins', t => {
  const original = { USERPROFILE: process.env.USERPROFILE, LOCALAPPDATA: process.env.LOCALAPPDATA, CYP_DATA_DIR: process.env.CYP_DATA_DIR };
  t.after(() => { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  delete process.env.CYP_DATA_DIR;
  process.env.USERPROFILE = resolve('.local/profile-test');
  process.env.LOCALAPPDATA = resolve('.local/plain-appdata');
  const normal = dataDir();
  process.env.LOCALAPPDATA = resolve('.local/packaged-appdata');
  assert.equal(dataDir(), normal);
  assert.equal(normal, resolve('.local/profile-test/.checkyourprocess'));
  process.env.CYP_DATA_DIR = resolve('.local/custom-storage');
  assert.equal(dataDir(), resolve('.local/custom-storage'));
  delete process.env.CYP_DATA_DIR;
  delete process.env.USERPROFILE;
  assert.equal(dataDir(), join(homedir(), '.checkyourprocess'));
});

test('two AppData views reuse one profile service and preserve both legacy databases', async t => {
  const root = resolve('.local');
  await mkdir(root, { recursive: true });
  const fixture = await mkdtemp(join(root, 'shared-profile-test-'));
  const profile = join(fixture, 'profile');
  const shared = join(profile, '.checkyourprocess');
  const appDataViews = [join(fixture, 'terminal'), join(fixture, 'desktop')];
  for (const directory of appDataViews) {
    await mkdir(join(directory, 'CheckYourProcess'), { recursive: true });
    await writeFile(join(directory, 'CheckYourProcess/progress.sqlite'), `legacy:${directory}`);
  }
  const service = await startService({ dataDir: shared, port: 0 });
  const original = { USERPROFILE: process.env.USERPROFILE, LOCALAPPDATA: process.env.LOCALAPPDATA, CYP_DATA_DIR: process.env.CYP_DATA_DIR };
  t.after(async () => {
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await service.close();
    assert.ok(resolve(fixture).startsWith(root + sep));
    await rm(fixture, { recursive: true, force: true });
  });
  const warnings: string[] = [];
  t.mock.method(process.stderr, 'write', (value: string | Uint8Array) => { warnings.push(String(value)); return true; });
  process.env.USERPROFILE = profile;
  delete process.env.CYP_DATA_DIR;
  for (const directory of appDataViews) {
    process.env.LOCALAPPDATA = directory;
    const reused = await ensureService();
    assert.equal(reused.pid, service.runtime.pid);
    assert.equal(reused.port, service.runtime.port);
    assert.equal(reused.token, service.runtime.token);
    assert.equal(await readFile(join(directory, 'CheckYourProcess/progress.sqlite'), 'utf8'), `legacy:${directory}`);
  }
  assert.equal(warnings.length, 2);
  assert.ok(warnings.every(warning => warning.includes('not migrated or merged')));
});
