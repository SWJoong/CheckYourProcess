import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

test('stdio negotiates and lists tools before the local service is available; failed calls remain retryable', async t => {
  const root = resolve('.local');
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, 'stdio-test-'));
  const client = new Client({ name: 'stdio-startup-test', version: '1.0.0' });
  const options = {
    command: process.execPath, args: ['--import', 'tsx', resolve('src/stdio.ts')],
    env: { ...process.env, CYP_DATA_DIR: directory, CYP_PORT: 'invalid' }, stderr: 'pipe' as const,
  };
  const transport = new StdioClientTransport(options);
  t.after(async () => {
    await client.close();
    assert.ok(resolve(directory).startsWith(root + sep));
    await rm(directory, { recursive: true, force: true });
  });
  const probe = new StdioClientTransport(options);
  let timeout: ReturnType<typeof setTimeout>;
  const response = new Promise<JSONRPCMessage>((resolveMessage, reject) => {
    probe.onmessage = resolveMessage;
    probe.onclose = () => reject(new Error('Server closed before discovery answered'));
    probe.onerror = reject;
    timeout = setTimeout(() => reject(new Error('Discovery timed out')), 5000);
  });
  try {
    await probe.start();
    await probe.send({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: {} });
    const reply = await response;
    assert.ok('error' in reply);
    assert.equal(reply.error.code, -32601);
  } finally { clearTimeout(timeout!); await probe.close(); }
  await client.connect(transport, { timeout: 5000 });
  assert.equal((await client.listTools()).tools.length, 14);
  assert.equal((await client.listResources()).resources.length, 1);
  await assert.rejects(access(join(directory, 'token')));
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await client.callTool({ name: 'get_catalog', arguments: {} });
    assert.equal(result.isError, true);
    assert.equal(((result.structuredContent as { error: { code: string } }).error).code, 'INTERNAL_ERROR');
    if (attempt === 0) await rm(join(directory, 'token'));
  }
  await access(join(directory, 'token'));
  assert.equal((await client.listTools()).tools.length, 14);
});

test('CYP_CARD=off removes the in-chat card but keeps every tracking tool', async t => {
  const root = resolve('.local');
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, 'stdio-card-test-'));
  const open = (card: string | undefined) => {
    const env: Record<string, string> = { ...process.env as Record<string, string>, CYP_DATA_DIR: directory, CYP_PORT: 'invalid' };
    if (card === undefined) delete env.CYP_CARD; else env.CYP_CARD = card;
    return new StdioClientTransport({ command: process.execPath, args: ['--import', 'tsx', resolve('src/stdio.ts')], env, stderr: 'pipe' });
  };
  const withCard = new Client({ name: 'card-on', version: '1.0.0' });
  const withoutCard = new Client({ name: 'card-off', version: '1.0.0' });
  t.after(async () => {
    await withCard.close(); await withoutCard.close();
    assert.ok(resolve(directory).startsWith(root + sep));
    await rm(directory, { recursive: true, force: true });
  });
  await withCard.connect(open(undefined), { timeout: 5000 });
  await withoutCard.connect(open('off'), { timeout: 5000 });
  const on = (await withCard.listTools()).tools;
  const off = (await withoutCard.listTools()).tools;
  assert.equal(on.length, 14);
  assert.ok(on.find(tool => tool.name === 'get_catalog')?._meta?.ui);
  assert.equal(off.length, 13);
  assert.ok(!off.some(tool => tool.name === 'poll_progress'));
  assert.ok(off.every(tool => !tool._meta?.ui && !tool._meta?.['openai/outputTemplate']));
  for (const name of ['start_tracking', 'show_progress', 'link_tasks', 'connect_project', 'save_settings']) assert.ok(off.some(tool => tool.name === name), name);
  assert.equal(await withoutCard.listResources().then(result => result.resources.length, () => 0), 0);
});
