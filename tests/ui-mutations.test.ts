import test from 'node:test';
import assert from 'node:assert/strict';
import { RetryingMutations } from '../src/ui/mutations.js';

test('a lost response after commit retries the same intent without duplicating tasks', async () => {
  const committed = new Map<string, number>();
  const ids: string[] = [];
  let sequence = 0, dropResponse = true, taskCount = 0;
  const client = new RetryingMutations(async (_action, args) => {
    const mutationId = String(args.mutationId); ids.push(mutationId);
    if (!committed.has(mutationId)) { taskCount++; committed.set(mutationId, taskCount); }
    if (dropResponse) { dropResponse = false; throw Object.assign(new Error('Response lost after commit'), { code: 'CONNECTION_FAILED' }); }
    return committed.get(mutationId);
  }, () => `intent-${++sequence}`);
  const args = { trackingSessionId: 'session-1', titles: ['Build'] };
  await assert.rejects(client.perform('register_tasks', args));
  assert.equal(await client.perform('register_tasks', { titles: ['Build'], trackingSessionId: 'session-1' }), 1);
  assert.equal(taskCount, 1);
  assert.deepEqual(ids, ['intent-1', 'intent-1']);
  assert.equal(await client.perform('register_tasks', args), 2);
  assert.equal(taskCount, 2);
  assert.equal(ids[2], 'intent-2');
});

test('create/connect each retain their own uncertain write ID', async () => {
  const ids = new Map<string, string[]>();
  const dropped = new Set<string>();
  let sequence = 0;
  const client = new RetryingMutations(async (action, args) => {
    ids.set(action, [...ids.get(action) ?? [], String(args.mutationId)]);
    if (!dropped.has(action)) { dropped.add(action); throw Object.assign(new Error('timeout'), { code: 'CONNECTION_FAILED' }); }
    return { id: 'project-1' };
  }, () => `intent-${++sequence}`);
  await assert.rejects(client.perform('create_project', { name: 'Project' }));
  await client.perform('create_project', { name: 'Project' });
  await assert.rejects(client.perform('connect_project', { projectId: 'project-1', trackingSessionId: 'session-1' }));
  await client.perform('connect_project', { trackingSessionId: 'session-1', projectId: 'project-1' });
  assert.deepEqual(ids.get('create_project'), ['intent-1', 'intent-1']);
  assert.deepEqual(ids.get('connect_project'), ['intent-2', 'intent-2']);
});

test('a definitive rejection clears the failed mutation ID before another attempt', async () => {
  let sequence = 0;
  const ids: unknown[] = [];
  const client = new RetryingMutations(async (_action, args) => {
    ids.push(args.mutationId); throw Object.assign(new Error('stale version'), { code: 'CONFLICT' });
  }, () => `intent-${++sequence}`);
  await assert.rejects(client.perform('update_task', { taskId: 'task-1', expectedRevision: 1 }));
  await assert.rejects(client.perform('update_task', { taskId: 'task-1', expectedRevision: 1 }));
  assert.deepEqual(ids, ['intent-1', 'intent-2']);
});
