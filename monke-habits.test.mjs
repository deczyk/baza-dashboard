import assert from 'node:assert/strict';
import { groupedHabits, dayProgress, isHabitDone, setHabitVariant, rewardForVariant } from './monke-habits.js';

const habits = [
  { id: 'h1', name: 'Woda', group: 'Rano' },
  { id: 'h2', name: 'Bez telefonu', group: 'Rano' },
  { id: 'h3', name: 'Trening', group: 'Wieczorem' },
];

const grouped = groupedHabits(habits);
assert.equal(grouped.size, 2);
assert.equal(grouped.get('Rano').length, 2);
assert.equal(grouped.get('Wieczorem').length, 1);
assert.equal(grouped.get('Rano')[0].id, 'h1');

assert.deepEqual(dayProgress(habits, {}), { done: 0, total: 3 });
assert.deepEqual(dayProgress(habits, { h1: 'full', h2: 'minimum' }), { done: 2, total: 3 });
assert.deepEqual(dayProgress(habits, { h1: 'full', h2: 'full', h3: 'full' }), { done: 3, total: 3 });

assert.equal(isHabitDone({ h1: 'full' }, 'h1'), true);
assert.equal(isHabitDone({ h1: 'minimum' }, 'h1'), true);
assert.equal(isHabitDone({}, 'h1'), false);

let log = setHabitVariant({}, '2026-09-10', 'h1', 'full');
assert.deepEqual(log, { '2026-09-10': { h1: 'full' } });
log = setHabitVariant(log, '2026-09-10', 'h2', 'minimum');
assert.deepEqual(log, { '2026-09-10': { h1: 'full', h2: 'minimum' } });
log = setHabitVariant(log, '2026-09-10', 'h1', null);
assert.deepEqual(log, { '2026-09-10': { h2: 'minimum' } });
// original object is untouched (pure function)
const original = { '2026-09-09': { h1: 'full' } };
const updated = setHabitVariant(original, '2026-09-09', 'h9', 'full');
assert.deepEqual(original, { '2026-09-09': { h1: 'full' } });
assert.deepEqual(updated, { '2026-09-09': { h1: 'full', h9: 'full' } });

assert.deepEqual(rewardForVariant('full'), { xp: 10, bananas: 1 });
assert.deepEqual(rewardForVariant('minimum'), { xp: 10, bananas: 0 });
assert.deepEqual(rewardForVariant(null), { xp: 0, bananas: 0 });

console.log('monke-habits.test.mjs: all assertions passed');
