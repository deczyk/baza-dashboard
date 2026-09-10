import assert from 'node:assert/strict';
import { levelFromXp, rankFromLevel, updateStreak, XP_PER_HABIT, BANANAS_PER_HABIT, XP_PER_FOCUS_MINUTE, FOCUS_MINUTES_PER_BANANA } from './monke-ui.js';

assert.deepEqual(levelFromXp(0), { level: 1, inLevel: 0 });
assert.deepEqual(levelFromXp(99), { level: 1, inLevel: 99 });
assert.deepEqual(levelFromXp(100), { level: 2, inLevel: 0 });
assert.deepEqual(levelFromXp(250), { level: 3, inLevel: 50 });

assert.equal(rankFromLevel(1).name, 'Brąz');
assert.equal(rankFromLevel(2).name, 'Brąz');
assert.equal(rankFromLevel(3).name, 'Srebro');
assert.equal(rankFromLevel(21).name, 'Mistrz');
assert.equal(rankFromLevel(50).name, 'Mistrz');

// streak: first full day starts it at 1
assert.deepEqual(
  updateStreak({ count: 0, lastCompleteDate: '' }, '2026-09-10', true),
  { count: 1, lastCompleteDate: '2026-09-10' }
);
// consecutive day increments
assert.deepEqual(
  updateStreak({ count: 1, lastCompleteDate: '2026-09-09' }, '2026-09-10', true),
  { count: 2, lastCompleteDate: '2026-09-10' }
);
// gap day resets to 1
assert.deepEqual(
  updateStreak({ count: 5, lastCompleteDate: '2026-09-01' }, '2026-09-10', true),
  { count: 1, lastCompleteDate: '2026-09-10' }
);
// already counted today, calling again with allDone=true is a no-op
assert.deepEqual(
  updateStreak({ count: 2, lastCompleteDate: '2026-09-10' }, '2026-09-10', true),
  { count: 2, lastCompleteDate: '2026-09-10' }
);
// unchecking a habit after today was already completed rolls the streak back
assert.deepEqual(
  updateStreak({ count: 2, lastCompleteDate: '2026-09-10' }, '2026-09-10', false),
  { count: 1, lastCompleteDate: '' }
);
// not done today, and today wasn't already completed: no change
assert.deepEqual(
  updateStreak({ count: 3, lastCompleteDate: '2026-09-08' }, '2026-09-10', false),
  { count: 3, lastCompleteDate: '2026-09-08' }
);

assert.equal(XP_PER_HABIT, 10);
assert.equal(BANANAS_PER_HABIT, 1);
assert.equal(XP_PER_FOCUS_MINUTE, 1);
assert.equal(FOCUS_MINUTES_PER_BANANA, 5);

console.log('monke-ui.test.mjs: all assertions passed');
