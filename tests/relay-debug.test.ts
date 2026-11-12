import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

test('the hook relay records field names only while the opt-in marker exists', async t => {
  const root = resolve('.local');
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, 'relay-test-'));
  t.after(async () => {
    assert.ok(resolve(directory).startsWith(root + sep));
    await rm(directory, { recursive: true, force: true });
  });
  const data = join(directory, 'data');
  await mkdir(join(directory, 'hooks'), { recursive: true });
  await mkdir(join(directory, 'dist'), { recursive: true });
  await mkdir(data);
  // The package layout puts relay.mjs beside ../dist/runtime.js; a stub keeps this test independent of a build.
  await cp(resolve('integrations/shared/relay.mjs'), join(directory, 'hooks', 'relay.mjs'));
  await writeFile(join(directory, 'dist', 'runtime.js'), 'export const dataDir = () => process.env.CYP_DATA_DIR; export const readRuntime = async () => null;\n');
  const run = (event: string, input: Record<string, unknown>) => spawnSync(process.execPath, [join(directory, 'hooks', 'relay.mjs'), 'claude-code', event], {
    input: JSON.stringify(input), env: { ...process.env, CYP_DATA_DIR: data }, encoding: 'utf8', timeout: 10_000,
  });
  const log = join(data, 'debug-hook-keys.log');
  const sample = {
    session_id: 'abcdef1234567890', hook_event_name: 'PreToolUse', tool_name: 'Task', agent_id: 'agent-1', agent_type: 'general-purpose',
    prompt: 'PRIVATE-PROMPT', transcript_path: 'C:/private/transcript.jsonl', tool_input: { command: 'SECRET-COMMAND', description: 'SECRET-DESCRIPTION', todos: [{ content: 'SECRET-TODO', status: 'pending', activeForm: 'SECRET-FORM' }, { content: 'SECRET-TODO-2', status: 'completed', owner: 'x' }] },
    tool_response: { output: 'SECRET-OUTPUT', meta: { exitCode: 0 } },
  };

  assert.equal(run('tool-start', sample).status, 0);
  await assert.rejects(access(log));

  await writeFile(join(data, 'debug-hook-keys.enabled'), '');
  assert.equal(run('tool-start', sample).status, 0);
  assert.equal(run('subagent-start', { session_id: 'abcdef1234567890', hook_event_name: 'SubagentStart', agent_id: 'agent-2', agent_type: 'Explore' }).status, 0);
  assert.equal(run('tool-start', { ...sample, tool_name: 'mcp__plugin_checkyourprocess_checkyourprocess__show_progress' }).status, 0);

  const text = await readFile(log, 'utf8');
  const lines = text.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(lines.length, 2, 'tracker tool calls are not logged');
  assert.equal(lines[0].event, 'tool-start');
  assert.equal(lines[0].session, 'abcdef12');
  assert.equal(lines[0].keys.agent_id, 'string');
  assert.equal(lines[0].values.agent_id, 'agent-1');
  assert.equal(lines[0].toolInputKeys.command, 'string');
  assert.equal(lines[0].toolInputKeys.todos.array, 2);
  assert.deepEqual(Object.keys(lines[0].toolInputKeys.todos.of).sort(), ['activeForm', 'content', 'owner', 'status']);
  assert.equal(lines[0].toolInputKeys.todos.of.status, 'string');
  assert.equal(lines[0].toolResponseKeys.meta.exitCode, 'number');
  assert.equal(lines[1].event, 'subagent-start');
  assert.equal(lines[1].values.agent_type, 'Explore');
  for (const secret of ['PRIVATE-PROMPT', 'SECRET-COMMAND', 'SECRET-DESCRIPTION', 'SECRET-TODO', 'SECRET-FORM', 'SECRET-OUTPUT', 'transcript.jsonl']) assert.ok(!text.includes(secret), `${secret} must never be logged`);
});
