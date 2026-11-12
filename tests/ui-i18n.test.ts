import test from 'node:test';
import assert from 'node:assert/strict';
import { errorLabel, messages, progressText, relativeTime, t } from '../src/i18n.js';

test('Korean and English contain exactly the same interface messages', () => {
  assert.deepEqual(Object.keys(messages.ko).sort(), Object.keys(messages.en).sort());
  for (const language of ['ko', 'en'] as const) for (const value of Object.values(messages[language])) assert.ok(value.trim());
  assert.equal(t('ko', 'noPlan'), '계획 없음');
  assert.equal(t('en', 'noPlan'), 'No plan yet');
});

test('completion formatting does not assume weighted progress', () => {
  assert.equal(progressText('ko', 3, 5), '3/5 완료');
  assert.equal(progressText('en', 3, 5), '3/5 done');
  assert.equal(progressText('en', 0, 0), '0/0 done');
});

test('activity timestamps do not invent events and future clock skew is clamped', () => {
  const now = Date.parse('2026-11-11T12:00:00Z');
  assert.equal(relativeTime('ko', null, now), '아직 활동 보고 없음');
  assert.equal(relativeTime('en', 'bad-date', now), 'Unknown');
  assert.equal(relativeTime('en', '2026-11-11T12:01:00Z', now), 'now');
  assert.equal(relativeTime('en', '2026-11-11T11:58:00Z', now), '2 minutes ago');
});

test('known errors are localized and unknown server details do not leak into UI', () => {
  assert.match(errorLabel('ko', 'CONFLICT'), /다른 세션/);
  assert.match(errorLabel('en', 'PROJECT_CHANGE'), /another project/);
  assert.equal(errorLabel('ko', 'SQLITE_INTERNAL_ERROR'), t('ko', 'requestFailed'));
  for (const code of ['constructor', 'toString', '__proto__']) assert.equal(errorLabel('ko', code), t('ko', 'requestFailed'));
});
