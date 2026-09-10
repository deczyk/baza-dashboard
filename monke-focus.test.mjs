import assert from 'node:assert/strict';
import { xpForFocusMinutes, bananasForFocusMinutes, createFocusSession } from './monke-focus.js';

assert.equal(xpForFocusMinutes(0), 0);
assert.equal(xpForFocusMinutes(25), 25);
assert.equal(xpForFocusMinutes(25.7), 25);

assert.equal(bananasForFocusMinutes(0), 0);
assert.equal(bananasForFocusMinutes(4), 0);
assert.equal(bananasForFocusMinutes(5), 1);
assert.equal(bananasForFocusMinutes(12), 2);

const session = createFocusSession('2026-09-10T08:00:00.000Z', 25);
assert.equal(session.startedAt, '2026-09-10T08:00:00.000Z');
assert.equal(session.minutes, 25);
assert.equal(session.xpEarned, 25);
assert.equal(typeof session.id, 'string');
assert.ok(session.id.length > 0);
// two sessions get different ids
const session2 = createFocusSession('2026-09-10T09:00:00.000Z', 10);
assert.notEqual(session.id, session2.id);

console.log('monke-focus.test.mjs: all assertions passed');
