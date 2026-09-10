import assert from 'node:assert/strict';
import { goalProgress } from './monke-goals.js';

const goal = { id: 'g1', name: 'Forma', habitIds: ['h1', 'h2', 'h3'] };

assert.deepEqual(goalProgress(goal, {}), { done: 0, total: 3 });
assert.deepEqual(goalProgress(goal, { h1: 'full' }), { done: 1, total: 3 });
assert.deepEqual(goalProgress(goal, { h1: 'full', h2: 'minimum', h3: 'full' }), { done: 3, total: 3 });
// habits not linked to the goal don't count
assert.deepEqual(goalProgress(goal, { h9: 'full' }), { done: 0, total: 3 });
// a goal with no linked habits has 0/0
assert.deepEqual(goalProgress({ id: 'g2', name: 'Puste', habitIds: [] }, { h1: 'full' }), { done: 0, total: 0 });

console.log('monke-goals.test.mjs: all assertions passed');
