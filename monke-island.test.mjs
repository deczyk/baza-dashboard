import assert from 'node:assert/strict';
import { islandStageForBananas, unlockedDecorations, bananasToNextStage, ISLAND_STAGES } from './monke-island.js';

assert.equal(ISLAND_STAGES.length, 5);

assert.equal(islandStageForBananas(0), 0);
assert.equal(islandStageForBananas(9), 0);
assert.equal(islandStageForBananas(10), 1);
assert.equal(islandStageForBananas(24), 1);
assert.equal(islandStageForBananas(25), 2);
assert.equal(islandStageForBananas(100), 4);
assert.equal(islandStageForBananas(999), 4);

assert.deepEqual(unlockedDecorations(0), ['campfire']);
assert.deepEqual(unlockedDecorations(10), ['campfire', 'grass']);
assert.deepEqual(unlockedDecorations(25), ['campfire', 'grass', 'pond']);
assert.deepEqual(unlockedDecorations(100), ['campfire', 'grass', 'pond', 'palm', 'hut']);

assert.equal(bananasToNextStage(0), 10);
assert.equal(bananasToNextStage(5), 5);
assert.equal(bananasToNextStage(10), 15);
assert.equal(bananasToNextStage(100), null);

console.log('monke-island.test.mjs: all assertions passed');
