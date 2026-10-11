const test = require('node:test');
const assert = require('node:assert/strict');
const u = require('../electron/update-schedule.cjs');

test('interval is 6h and first check is a few seconds after launch', () => {
  assert.equal(u.UPDATE_CHECK_INTERVAL_MS, 6 * 60 * 60 * 1000);
  assert.ok(u.FIRST_CHECK_DELAY_MS >= 1000 && u.FIRST_CHECK_DELAY_MS <= 15000);
});

test('periodic check is skipped while checking, downloading or an update is ready', () => {
  for (const s of ['checking', 'downloading', 'ready']) assert.equal(u.shouldRunPeriodicCheck(s), false);
  for (const s of ['idle', 'error', undefined]) assert.equal(u.shouldRunPeriodicCheck(s), true);
});

test('restart prompt shows once per version', () => {
  assert.equal(u.shouldPromptForVersion(null, '3.21.0'), true);
  assert.equal(u.shouldPromptForVersion('3.21.0', '3.21.0'), false);
  assert.equal(u.shouldPromptForVersion('3.21.0', '3.21.1'), true);
  assert.equal(u.shouldPromptForVersion(null, null), false);
});

test('check is overdue after wake only when older than one interval', () => {
  const now = 1e12;
  assert.equal(u.isCheckOverdue(0, now), true);
  assert.equal(u.isCheckOverdue(now - 1000, now), false);
  assert.equal(u.isCheckOverdue(now - u.UPDATE_CHECK_INTERVAL_MS, now), true);
});
