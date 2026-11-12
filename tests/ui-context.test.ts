import test from 'node:test';
import assert from 'node:assert/strict';
import type { Snapshot } from '../src/types.js';
import { trackingContext } from '../src/ui/context.js';

function snapshot(overrides: Partial<Snapshot['session']> = {}): Snapshot {
  return {
    trackingSessionId: 'tracker-1', scope: 'session', project: null,
    session: {
      id: 'tracker-1', host: 'codex', title: 'Build', projectId: null,
      activity: 'idle', activitySource: 'reported', currentTaskId: null,
      hostSessionBound: false, lastAgentEventAt: null, createdAt: '2026-11-11T00:00:00Z', endedAt: null,
      ...overrides,
    },
    sessions: [], tasks: [], progress: { completed: 0, total: 0, percent: null },
    settings: { locale: 'ko' }, snapshotAt: '2026-11-11T00:00:00Z',
  };
}

test('ending tracking revokes binding intent even if the caller supplies a resume intent', () => {
  const data = snapshot({ endedAt: '2026-11-11T01:00:00Z' });
  for (const intent of ['start', 'resume', 'update', 'end'] as const) {
    const context = trackingContext(data, intent);
    assert.equal(context.structuredContent.ended, true);
    assert.equal(context.structuredContent.bindingRequested, false);
    assert.match(context.content[0].text, /Do not resume tracking/);
    assert.doesNotMatch(context.content[0].text, /call resume_tracking/);
  }
});

test('only an explicit start or resume can request binding an active unbound coding tracker', () => {
  assert.equal(trackingContext(snapshot(), 'update').structuredContent.bindingRequested, false);
  assert.equal(trackingContext(snapshot(), 'start').structuredContent.bindingRequested, true);
  assert.equal(trackingContext(snapshot(), 'resume').structuredContent.bindingRequested, true);
  assert.equal(trackingContext(snapshot({ hostSessionBound: true }), 'resume').structuredContent.bindingRequested, false);
  assert.equal(trackingContext(snapshot({ host: 'chatgpt' }), 'start').structuredContent.bindingRequested, false);
  assert.equal(trackingContext(snapshot({ host: 'claude-desktop' }), 'resume').structuredContent.bindingRequested, false);
});

test('context updates preserve tracker identity and explicitly forbid cross-session rebinding', () => {
  const context = trackingContext(snapshot(), 'resume');
  assert.equal(context.structuredContent.trackingSessionId, 'tracker-1');
  assert.equal(context.structuredContent.host, 'codex');
  assert.match(context.content[0].text, /Never guess the ID/);
  assert.match(context.content[0].text, /another host\/session/);
});
