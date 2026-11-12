import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgeError, RequestError, toolPayload } from '../src/ui/rpc.js';
import { RetryingMutations } from '../src/ui/mutations.js';
import { errorLabel } from '../src/i18n.js';

test('MCP results work with structured content or JSON text; structured content wins', () => {
  const payload = { projects: [], sessions: [], settings: { locale: 'ko' } };
  assert.deepEqual(toolPayload({ content: [{ type: 'text', text: JSON.stringify(payload) }] }), payload);
  assert.equal(toolPayload({ structuredContent: payload, content: [{ type: 'text', text: 'not JSON' }] }), payload);
});

test('host IPC failure is distinct from an unknown host error or lost connection', () => {
  const known = bridgeError(new Error('MCP error -32603: IPC not available for MCP tool call'));
  assert.equal(known.code, 'HOST_TOOL_UNAVAILABLE');
  assert.match(errorLabel('ko', known.code), /호스트.*도구 호출/);
  assert.match(errorLabel('en', known.code), /host.*tool call/);
  for (const error of [new Error('MCP error -32603: internal error'), new Error('timeout'), undefined]) {
    assert.equal(bridgeError(error).code, 'CONNECTION_FAILED');
  }
});

test('tool failures keep their safe code and never expose server details', () => {
  assert.throws(() => toolPayload({ isError: true, structuredContent: { error: { code: 'CONFLICT', message: 'private db path' } } }),
    (error: unknown) => error instanceof RequestError && error.code === 'CONFLICT' && !error.message.includes('private'));
  assert.throws(() => toolPayload({ isError: true, content: [{ type: 'text', text: 'private failure detail' }] }),
    (error: unknown) => error instanceof RequestError && error.code === 'REQUEST_FAILED' && !error.message.includes('private'));
});

test('missing or malformed successful results retain the write ID for a safe retry', async () => {
  for (const result of [{}, { content: [{ type: 'text', text: 'broken' }] }, { structuredContent: null }]) {
    assert.throws(() => toolPayload(result), (error: unknown) => error instanceof RequestError && error.code === 'CONNECTION_FAILED');
  }
  const ids: unknown[] = [];
  let drop = true, sequence = 0, writes = 0;
  const committed = new Set();
  const mutations = new RetryingMutations(async (_action, args) => {
    ids.push(args.mutationId);
    if (!committed.has(args.mutationId)) { committed.add(args.mutationId); writes++; }
    if (drop) { drop = false; return toolPayload({}); }
    return toolPayload({ content: [{ type: 'text', text: '{"saved":true}' }] });
  }, () => `write-${++sequence}`);
  await assert.rejects(mutations.perform('register_tasks', { titles: ['Build'] }));
  await mutations.perform('register_tasks', { titles: ['Build'] });
  assert.deepEqual(ids, ['write-1', 'write-1']);
  assert.equal(writes, 1);
});
