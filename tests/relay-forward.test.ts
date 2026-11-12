import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

test('the relay forwards plan lists, agent IDs and sub-agent lifecycle, and nothing else from tool input', async t => {
  const root = resolve('.local');
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, 'relay-forward-'));
  const received: any[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => { received.push(JSON.parse(body)); res.setHeader('content-type', 'application/json'); res.end('{"result":{}}'); });
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  t.after(async () => {
    server.close();
    assert.ok(resolve(directory).startsWith(root + sep));
    await rm(directory, { recursive: true, force: true });
  });
  const { port } = server.address() as { port: number };
  await mkdir(join(directory, 'hooks'), { recursive: true });
  await mkdir(join(directory, 'dist'), { recursive: true });
  await cp(resolve('integrations/shared/relay.mjs'), join(directory, 'hooks', 'relay.mjs'));
  await writeFile(join(directory, 'dist', 'runtime.js'),
    `export const dataDir = () => ${JSON.stringify(directory)}; export const readRuntime = async () => ({ url: 'http://127.0.0.1:${port}', token: 'test-placeholder' });\n`);
  const run = (event: string, input: Record<string, unknown>) => new Promise<number | null>(done => {
    const child = spawn(process.execPath, [join(directory, 'hooks', 'relay.mjs'), 'claude-code', event], { stdio: ['pipe', 'ignore', 'ignore'] });
    child.on('close', done);
    child.stdin.end(JSON.stringify(input));
  });
  const base = { session_id: 'native-1' };

  await run('tool-end', { ...base, tool_name: 'mcp__ccd_turn__update_plan', tool_use_id: 'u1', tool_input: { scope: 'x', items: [{ content: ' Read code ', status: 'in_progress', extra: 'SECRET' }, { content: 'Ship', status: 'pending' }] } });
  await run('tool-end', { ...base, tool_name: 'TodoWrite', tool_use_id: 'u2', tool_input: { todos: [{ content: 'Todo item', status: 'completed', activeForm: 'SECRET' }] } });
  await run('tool-end', { ...base, tool_name: 'Bash', tool_use_id: 'u3', tool_input: { command: 'SECRET-COMMAND', items: [{ content: 'not a plan tool', status: 'pending' }] } });
  await run('tool-end', { ...base, tool_name: 'mcp__ccd_turn__update_plan', tool_use_id: 'u4', tool_input: { items: [{ content: 'bad', status: 'done' }] } });
  await run('tool-start', { ...base, tool_name: 'Read', tool_use_id: 'u5', agent_id: 'sub-1', agent_type: 'Explore', tool_input: { file_path: 'SECRET-PATH' } });
  await run('subagent-start', { ...base, agent_id: 'sub-1', agent_type: 'Explore' });
  await run('subagent-stop', { ...base, agent_id: 'sub-1' });
  await run('tool-end', { ...base, tool_name: 'Agent', tool_use_id: 'u6', tool_input: { prompt: 'SECRET-PROMPT' }, tool_response: { isAsync: true, agentId: 'sub-9', outputFile: 'SECRET-FILE' } });
  await run('tool-end', { ...base, tool_name: 'Agent', tool_use_id: 'u7', tool_input: { prompt: 'SECRET-PROMPT' }, tool_response: { isAsync: false, content: 'SECRET-RESULT' } });
  await run('tool-end', { ...base, tool_name: 'SubagentHandback', tool_use_id: 'u8', agent_id: 'sub-9', tool_input: { message: 'SECRET-REPORT' } });
  await run('tool-start', { ...base, tool_name: 'SubagentHandback', tool_use_id: 'u9', agent_id: 'sub-9', tool_input: { message: 'SECRET-REPORT' } });

  const byId = (id: string) => received.find(r => r.toolUseId === id);
  assert.deepEqual(byId('u1').planItems, [{ content: 'Read code', status: 'in_progress' }, { content: 'Ship', status: 'pending' }]);
  assert.deepEqual(byId('u2').planItems, [{ content: 'Todo item', status: 'completed' }]);
  assert.equal(byId('u3').planItems, undefined, 'only plan tools carry a list');
  assert.equal(byId('u4').planItems, undefined, 'a list with an unknown status is not forwarded');
  assert.equal(byId('u5').agentId, 'sub-1');
  assert.equal(byId('u5').event, 'tool-start');
  assert.ok(received.some(r => r.event === 'subagent-start' && r.agentId === 'sub-1'));
  assert.ok(received.some(r => r.event === 'subagent-stop' && r.agentId === 'sub-1'));
  assert.ok(!JSON.stringify(received).includes('SECRET'), 'tool input values never leave the relay');
  assert.equal(byId('u6').asyncAgentId, 'sub-9', 'a background launch carries the new sub-agent ID');
  assert.equal(byId('u7').asyncAgentId, undefined, 'a synchronous Agent call is not marked as background');
  assert.equal(byId('u8').handback, true);
  assert.equal(byId('u9').handback, undefined, 'only the tool-end of a final report counts as handed back');
  assert.equal(received.length, 11);

  // A paused background sub-agent stops again later; the repeat must not look like a duplicate to the service.
  const before = received.length;
  await run('subagent-stop', { ...base, agent_id: 'sub-1' });
  await run('subagent-stop', { ...base, agent_id: 'sub-1' });
  const repeats = received.slice(before).map(r => r.eventId);
  assert.equal(repeats.length, 2);
  assert.notEqual(repeats[0], repeats[1], 'each stop of the same sub-agent has its own event ID');
});
