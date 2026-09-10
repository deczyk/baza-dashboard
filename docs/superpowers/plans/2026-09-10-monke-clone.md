# Monke Clone (Faza 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Faza 1 of the Monke habit-game clone as a new PWA (`monke.html` + ES modules) on decz.pl: habits+goals, focus timer, XP/level/rank/streak, banana currency, a simple animated island, stats, and a first-run onboarding — backed by a new `monke-state` route on the existing Supabase-backed API.

**Architecture:** Plain JS, no bundler. `monke.html` is the entry point and loads focused ES modules via `<script type="module">`. Pure calculation logic (XP, streak, goal progress, island stage, focus rewards) lives in dependency-free modules so it can be tested with Node's built-in `assert` — no test framework exists in this repo, so that's the closest thing to TDD available. DOM/network code (state sync, rendering, animations, onboarding) is verified by manual browser QA, matching how `baza.html` and `werboard.webmanifest` already work in this repo. Backend state is one more field (`monkeState`) in the same Supabase blob every other module already uses, following the exact `werboard-state`/`tataboard-state` GET/POST + `_updatedAt` conflict pattern in `api/[...route].js`.

**Tech Stack:** Vanilla JS (ES modules, no build step), vanilla CSS animations (`@keyframes`), Node.js (only for local zero-dependency logic tests, not shipped), Vercel serverless functions (`api/[...route].js`), Supabase (`panel_store` table, `save_debrain_store` RPC) via `api/_supabase-store.js`-style optimistic-concurrency save.

## Global Constraints

- No bundler, no build step — every JS file must run as-is via native `<script type="module">` in the browser. (Design decision, confirmed with user: avoids the "compiled app with no source in repo" mistake made by the now-deleted Debrain OS.)
- No new npm dependencies. `package.json` currently only has `web-push` and `resend`; do not add anything for Monke.
- No external animation libraries — all animation is CSS `@keyframes` + JS class toggling, matching the existing pattern in `baza.html` (`.level-up`/`levelFlash`, `.just-checked`/`checkPop`).
- No test framework exists in this repo. Pure-logic modules get a co-located `*.test.mjs` file run directly with `node <file>.test.mjs` (uses Node's built-in `node:assert/strict`, zero dependencies). DOM/network/animation work is verified with manual browser QA steps, written out explicitly in each task — never skipped, never replaced with a vague "test it".
- All UI text is Polish, matching the rest of the repo (`baza.html`, `werboard.webmanifest`, etc.).
- Currency name is "banany" (bananas), singular "banan" — same word used throughout this plan and the UI.
- No literal Monke assets/art/code are used anywhere — all visuals are original (emoji-based mascot/decorations styled with CSS, flat SVG icon), per the approved design spec.
- State shape (canonical, all tasks must match this exactly):

```js
{
  _updatedAt: "",
  onboarded: false,
  habits: [
    { id: "h_xxx", name: "", group: "Rano", time: "", minimumVariant: "", goalId: null, createdAt: "" }
  ],
  goals: [
    { id: "g_xxx", name: "", habitIds: [], createdAt: "" }
  ],
  doneLog: { "2026-09-10": { "h_xxx": "full" } }, // value is "full" | "minimum"
  focusSessions: [
    { id: "f_xxx", startedAt: "", minutes: 0, xpEarned: 0 }
  ],
  currency: { bananas: 0 },
  xp: 0,
  streak: { count: 0, lastCompleteDate: "" },
  island: { stage: 0 }
}
```

  (`island.unlocked` from the design doc is derived, not stored — `monke-island.js` computes unlocked decorations from `island.stage`, one source of truth, no risk of the two fields drifting out of sync.)

- Reward constants (all pure functions in `monke-ui.js`/`monke-focus.js`/`monke-island.js`, exported so every task uses the same numbers):
  - `XP_PER_HABIT = 10` (ported from `baza.html`'s existing habit XP value — both `full` and `minimum` variants earn this, so a "bad day" still keeps XP/streak moving)
  - `BANANAS_PER_HABIT = 1` (only the `full` variant earns a banana — `minimum` earns XP but no banana, per the design spec)
  - `XP_PER_FOCUS_MINUTE = 1`
  - `FOCUS_MINUTES_PER_BANANA = 5`
  - Island stages (`monke-island.js`): `[{stage:0, bananasRequired:0, decoration:'campfire'}, {stage:1, bananasRequired:10, decoration:'grass'}, {stage:2, bananasRequired:25, decoration:'pond'}, {stage:3, bananasRequired:50, decoration:'palm'}, {stage:4, bananasRequired:100, decoration:'hut'}]`
  - Ranks (`monke-ui.js`, ported verbatim from `baza.html:1363-1370`): `[{min:1,name:'Brąz',color:'#B08D57'},{min:3,name:'Srebro',color:'#C7CCD1'},{min:6,name:'Złoto',color:'#D6B35A'},{min:10,name:'Platyna',color:'#8FD9C4'},{min:15,name:'Diament',color:'#8FC7E8'},{min:21,name:'Mistrz',color:'#C9A876'}]`

---

## File Structure

| File | Responsibility |
|---|---|
| `api/[...route].js` (modify) | Add `monke-state` GET/POST block (backend persistence) |
| `monke-ui.js` (create) | Pure: `levelFromXp`, `rankFromLevel`, `updateStreak`, shared reward constants, tiny animation-trigger helper `pulse(el, className)` |
| `monke-habits.js` (create) | Pure: grouping, day progress, marking a habit done/undone, XP/banana awarded for a habit |
| `monke-goals.js` (create) | Pure: goal progress calculation |
| `monke-island.js` (create) | Pure: island stage + unlocked decorations from banana count |
| `monke-focus.js` (create) | Pure: XP/banana reward for a focus session + session object factory |
| `monke-state.js` (create) | Not pure: `loadState()`/`saveState()` talking to `/api/monke-state`, default state, debounced save |
| `monke-onboarding.js` (create) | Onboarding step data + step navigation (mostly DOM) |
| `monke.html` (create) | Entry point: markup for all screens, CSS incl. animations, bootstraps and wires up all modules |
| `monke.webmanifest` (create) | PWA manifest for the "Monke" home-screen shortcut |
| `monke-icon.svg` (create) | Original flat-SVG icon (no Monke assets) |
| `index.html` (create) | New simple launcher: 3 tiles (Baza / Debrain / Monke) |
| `debrain.html` (modify) | Fix back-link that currently points at the deleted `index.html` labeled "Baza" |

---

### Task 1: `monke-state` API route

**Files:**
- Modify: `api/[...route].js`

**Interfaces:**
- Consumes: existing `read(getter)`, `mutate(mutator)`, `send(res, status, body)`, `now()` helpers already defined in this file (used by the `habit-state`/`werboard-state` blocks right above where this is added).
- Produces: `GET /api/monke-state` → the canonical state object (see Global Constraints). `POST /api/monke-state` with a full state object in the body → `{ok: true, saved: true|false}`.

- [ ] **Step 1: Add the default-state helper and route block**

Open `api/[...route].js`. Just above `module.exports = async (req, res) => {` (currently line 202), add:

```js
function defaultMonkeState() {
  return {
    _updatedAt: '',
    onboarded: false,
    habits: [],
    goals: [],
    doneLog: {},
    focusSessions: [],
    currency: { bananas: 0 },
    xp: 0,
    streak: { count: 0, lastCompleteDate: '' },
    island: { stage: 0 },
  };
}
```

Inside `module.exports`, immediately after the existing `habit-state` block (after the closing `}` that follows the line `if (route[0] === 'habit-state') { ... }`), add:

```js
    if (route[0] === 'monke-state') {
      if (method === 'GET') { send(res, 200, await read((data) => data.monkeState || defaultMonkeState())); return; }
      if (method === 'POST') {
        const incoming = req.body && typeof req.body === 'object' ? req.body : {};
        const result = await mutate((data) => {
          const current = data.monkeState || defaultMonkeState();
          if (current._updatedAt && incoming._updatedAt && new Date(incoming._updatedAt) < new Date(current._updatedAt)) return { saved: false };
          data.monkeState = { ...defaultMonkeState(), ...incoming };
          return { saved: true };
        });
        send(res, 200, { ok: true, ...result }); return;
      }
    }
```

- [ ] **Step 2: Manual verification — GET returns defaults**

Run (replace the domain with your local/preview URL if not testing against production):

```bash
curl -s https://decz.pl/api/monke-state
```

Expected: a JSON object matching `defaultMonkeState()` above (`"onboarded":false`, empty `habits`/`goals`/`doneLog`/`focusSessions`, `"currency":{"bananas":0}`, `"xp":0`, etc).

- [ ] **Step 3: Manual verification — POST persists and GET reflects it**

```bash
curl -s -X POST https://decz.pl/api/monke-state \
  -H "Content-Type: application/json" \
  -d '{"_updatedAt":"2026-09-10T00:00:00.000Z","onboarded":true,"habits":[],"goals":[],"doneLog":{},"focusSessions":[],"currency":{"bananas":3},"xp":30,"streak":{"count":1,"lastCompleteDate":"2026-09-10"},"island":{"stage":0}}'
curl -s https://decz.pl/api/monke-state
```

Expected: POST returns `{"ok":true,"saved":true}`; the following GET shows `"onboarded":true` and `"currency":{"bananas":3}`.

- [ ] **Step 4: Manual verification — stale write is rejected**

Re-run the exact same POST from Step 3 a second time (same `_updatedAt`). Expected: `{"ok":true,"saved":false}` is NOT what happens here (same timestamp isn't "older", only strictly older is rejected) — instead re-run with an **older** `_updatedAt` (e.g. `"2026-01-01T00:00:00.000Z"`) and confirm the response is `{"ok":true,"saved":false}` and the GET afterwards still shows the Step 3 data unchanged.

- [ ] **Step 5: Commit**

```bash
git add api/\[...route\].js
git commit -m "Add monke-state API route"
```

---

### Task 2: `monke-ui.js` — level, rank, streak

**Files:**
- Create: `monke-ui.js`
- Test: `monke-ui.test.mjs`

**Interfaces:**
- Produces: `XP_PER_HABIT`, `BANANAS_PER_HABIT`, `XP_PER_FOCUS_MINUTE`, `FOCUS_MINUTES_PER_BANANA` (numbers); `RANKS` (array); `levelFromXp(xp) -> {level, inLevel}`; `rankFromLevel(level) -> {min, name, color}`; `updateStreak(streak, todayStr, allDoneToday) -> {count, lastCompleteDate}`; `pulse(el, className, durationMs)` (DOM helper, not covered by the Node test).

- [ ] **Step 1: Write the failing test**

Create `monke-ui.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node monke-ui.test.mjs`
Expected: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../monke-ui.js'`

- [ ] **Step 3: Write the implementation**

Create `monke-ui.js`:

```js
export const XP_PER_HABIT = 10;
export const BANANAS_PER_HABIT = 1;
export const XP_PER_FOCUS_MINUTE = 1;
export const FOCUS_MINUTES_PER_BANANA = 5;

export const RANKS = [
  { min: 1, name: 'Brąz', color: '#B08D57' },
  { min: 3, name: 'Srebro', color: '#C7CCD1' },
  { min: 6, name: 'Złoto', color: '#D6B35A' },
  { min: 10, name: 'Platyna', color: '#8FD9C4' },
  { min: 15, name: 'Diament', color: '#8FC7E8' },
  { min: 21, name: 'Mistrz', color: '#C9A876' },
];

export function levelFromXp(xp) {
  const level = Math.floor(xp / 100) + 1;
  const inLevel = xp % 100;
  return { level, inLevel };
}

export function rankFromLevel(level) {
  let current = RANKS[0];
  for (const rank of RANKS) {
    if (level >= rank.min) current = rank;
  }
  return current;
}

function dayBefore(dateStr) {
  return new Date(new Date(`${dateStr}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
}

export function updateStreak(streak, todayStr, allDoneToday) {
  const current = streak || { count: 0, lastCompleteDate: '' };
  if (allDoneToday) {
    if (current.lastCompleteDate === todayStr) return current;
    const yesterday = dayBefore(todayStr);
    const count = current.lastCompleteDate === yesterday ? current.count + 1 : 1;
    return { count, lastCompleteDate: todayStr };
  }
  if (current.lastCompleteDate === todayStr) {
    return { count: Math.max(0, current.count - 1), lastCompleteDate: '' };
  }
  return current;
}

export function pulse(el, className, durationMs = 700) {
  el.classList.add(className);
  setTimeout(() => el.classList.remove(className), durationMs);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node monke-ui.test.mjs`
Expected: `monke-ui.test.mjs: all assertions passed` printed, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add monke-ui.js monke-ui.test.mjs
git commit -m "Add monke-ui.js: level, rank, streak logic"
```

---

### Task 3: `monke-habits.js` — grouping, progress, marking done

**Files:**
- Create: `monke-habits.js`
- Test: `monke-habits.test.mjs`

**Interfaces:**
- Consumes: `XP_PER_HABIT`, `BANANAS_PER_HABIT` from `monke-ui.js` (Task 2).
- Produces: `groupedHabits(habits) -> Map<groupName, habit[]>`; `dayProgress(habits, doneForDay) -> {done, total}`; `isHabitDone(doneForDay, habitId) -> boolean`; `setHabitVariant(doneLog, dateStr, habitId, variant) -> newDoneLog` (variant is `'full'`, `'minimum'`, or `null` to unmark); `rewardForVariant(variant) -> {xp, bananas}`.

- [ ] **Step 1: Write the failing test**

Create `monke-habits.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node monke-habits.test.mjs`
Expected: `Cannot find module '.../monke-habits.js'`

- [ ] **Step 3: Write the implementation**

Create `monke-habits.js`:

```js
import { XP_PER_HABIT, BANANAS_PER_HABIT } from './monke-ui.js';

export function groupedHabits(habits) {
  const map = new Map();
  for (const habit of habits) {
    const list = map.get(habit.group) || [];
    list.push(habit);
    map.set(habit.group, list);
  }
  return map;
}

export function dayProgress(habits, doneForDay) {
  const done = habits.filter((h) => isHabitDone(doneForDay, h.id)).length;
  return { done, total: habits.length };
}

export function isHabitDone(doneForDay, habitId) {
  const variant = (doneForDay || {})[habitId];
  return variant === 'full' || variant === 'minimum';
}

export function setHabitVariant(doneLog, dateStr, habitId, variant) {
  const nextDay = { ...(doneLog[dateStr] || {}) };
  if (variant === 'full' || variant === 'minimum') nextDay[habitId] = variant;
  else delete nextDay[habitId];
  return { ...doneLog, [dateStr]: nextDay };
}

export function rewardForVariant(variant) {
  if (variant === 'full') return { xp: XP_PER_HABIT, bananas: BANANAS_PER_HABIT };
  if (variant === 'minimum') return { xp: XP_PER_HABIT, bananas: 0 };
  return { xp: 0, bananas: 0 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node monke-habits.test.mjs`
Expected: `monke-habits.test.mjs: all assertions passed`.

- [ ] **Step 5: Commit**

```bash
git add monke-habits.js monke-habits.test.mjs
git commit -m "Add monke-habits.js: grouping, progress, done-marking logic"
```

---

### Task 4: `monke-goals.js` — goal progress

**Files:**
- Create: `monke-goals.js`
- Test: `monke-goals.test.mjs`

**Interfaces:**
- Produces: `goalProgress(goal, doneForDay) -> {done, total}`.

- [ ] **Step 1: Write the failing test**

Create `monke-goals.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node monke-goals.test.mjs`
Expected: `Cannot find module '.../monke-goals.js'`

- [ ] **Step 3: Write the implementation**

Create `monke-goals.js`:

```js
export function goalProgress(goal, doneForDay) {
  const done = goal.habitIds || [];
  const doneCount = done.filter((id) => {
    const variant = (doneForDay || {})[id];
    return variant === 'full' || variant === 'minimum';
  }).length;
  return { done: doneCount, total: done.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node monke-goals.test.mjs`
Expected: `monke-goals.test.mjs: all assertions passed`.

- [ ] **Step 5: Commit**

```bash
git add monke-goals.js monke-goals.test.mjs
git commit -m "Add monke-goals.js: goal progress logic"
```

---

### Task 5: `monke-island.js` — stage + decorations

**Files:**
- Create: `monke-island.js`
- Test: `monke-island.test.mjs`

**Interfaces:**
- Produces: `ISLAND_STAGES` (array); `islandStageForBananas(bananas) -> number`; `unlockedDecorations(bananas) -> string[]`; `bananasToNextStage(bananas) -> number|null` (null once at max stage).

- [ ] **Step 1: Write the failing test**

Create `monke-island.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node monke-island.test.mjs`
Expected: `Cannot find module '.../monke-island.js'`

- [ ] **Step 3: Write the implementation**

Create `monke-island.js`:

```js
export const ISLAND_STAGES = [
  { stage: 0, bananasRequired: 0, decoration: 'campfire' },
  { stage: 1, bananasRequired: 10, decoration: 'grass' },
  { stage: 2, bananasRequired: 25, decoration: 'pond' },
  { stage: 3, bananasRequired: 50, decoration: 'palm' },
  { stage: 4, bananasRequired: 100, decoration: 'hut' },
];

export function islandStageForBananas(bananas) {
  let stage = 0;
  for (const entry of ISLAND_STAGES) {
    if (bananas >= entry.bananasRequired) stage = entry.stage;
  }
  return stage;
}

export function unlockedDecorations(bananas) {
  return ISLAND_STAGES.filter((entry) => bananas >= entry.bananasRequired).map((entry) => entry.decoration);
}

export function bananasToNextStage(bananas) {
  const next = ISLAND_STAGES.find((entry) => entry.bananasRequired > bananas);
  return next ? next.bananasRequired - bananas : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node monke-island.test.mjs`
Expected: `monke-island.test.mjs: all assertions passed`.

- [ ] **Step 5: Commit**

```bash
git add monke-island.js monke-island.test.mjs
git commit -m "Add monke-island.js: island stage and decoration logic"
```

---

### Task 6: `monke-focus.js` — focus session rewards

**Files:**
- Create: `monke-focus.js`
- Test: `monke-focus.test.mjs`

**Interfaces:**
- Consumes: `XP_PER_FOCUS_MINUTE`, `FOCUS_MINUTES_PER_BANANA` from `monke-ui.js` (Task 2).
- Produces: `xpForFocusMinutes(minutes) -> number`; `bananasForFocusMinutes(minutes) -> number`; `createFocusSession(startedAtIso, minutes) -> {id, startedAt, minutes, xpEarned}`.

- [ ] **Step 1: Write the failing test**

Create `monke-focus.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node monke-focus.test.mjs`
Expected: `Cannot find module '.../monke-focus.js'`

- [ ] **Step 3: Write the implementation**

Create `monke-focus.js`:

```js
import { XP_PER_FOCUS_MINUTE, FOCUS_MINUTES_PER_BANANA } from './monke-ui.js';

export function xpForFocusMinutes(minutes) {
  return Math.floor(minutes) * XP_PER_FOCUS_MINUTE;
}

export function bananasForFocusMinutes(minutes) {
  return Math.floor(minutes / FOCUS_MINUTES_PER_BANANA);
}

function newId() {
  return `f_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function createFocusSession(startedAtIso, minutes) {
  return {
    id: newId(),
    startedAt: startedAtIso,
    minutes: Math.floor(minutes),
    xpEarned: xpForFocusMinutes(minutes),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node monke-focus.test.mjs`
Expected: `monke-focus.test.mjs: all assertions passed`.

- [ ] **Step 5: Commit**

```bash
git add monke-focus.js monke-focus.test.mjs
git commit -m "Add monke-focus.js: focus session reward logic"
```

---

### Task 7: `monke-state.js` — client state sync

**Files:**
- Create: `monke-state.js`

**Interfaces:**
- Consumes: `GET`/`POST /api/monke-state` (Task 1).
- Produces: `defaultState() -> state object` (matches Global Constraints shape); `loadState() -> Promise<state>`; `queueSave(state)` (debounced, fire-and-forget, updates a `data-sync` attribute on `document.body` to `'ok' | 'saving' | 'error'` for the UI to reflect — mirrors `baza.html`'s `setSyncStatus` pattern).

This task is not pure (network + timers), so it has no Node test — it's verified manually in the browser once `monke.html` exists (Task 8 wires it in and re-verifies it end to end). For now, verify with a scratch HTML file.

- [ ] **Step 1: Write the implementation**

Create `monke-state.js`:

```js
const API = '/api/monke-state';
let saveTimer = null;

export function defaultState() {
  return {
    _updatedAt: '',
    onboarded: false,
    habits: [],
    goals: [],
    doneLog: {},
    focusSessions: [],
    currency: { bananas: 0 },
    xp: 0,
    streak: { count: 0, lastCompleteDate: '' },
    island: { stage: 0 },
  };
}

export async function loadState() {
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error(`GET ${res.status}`);
    const state = await res.json();
    return { ...defaultState(), ...state };
  } catch (err) {
    document.body.dataset.sync = 'error';
    return defaultState();
  }
}

async function saveNow(state) {
  document.body.dataset.sync = 'saving';
  try {
    const payload = { ...state, _updatedAt: new Date().toISOString() };
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`POST ${res.status}`);
    document.body.dataset.sync = 'ok';
  } catch (err) {
    document.body.dataset.sync = 'error';
  }
}

export function queueSave(state) {
  document.body.dataset.sync = 'saving';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveNow(state), 600);
}
```

- [ ] **Step 2: Manual verification**

Create a throwaway file `scratch-state-check.html` next to it (delete after this step, do not commit it):

```html
<!doctype html>
<script type="module">
  import { loadState, queueSave } from './monke-state.js';
  const state = await loadState();
  console.log('loaded', state);
  state.xp = 12345;
  queueSave(state);
  setTimeout(async () => console.log('after save, sync=', document.body.dataset.sync), 1000);
</script>
```

Serve the repo locally (e.g. `npx vercel dev` if you have the Vercel CLI, or deploy to a preview) and open `scratch-state-check.html` in a browser. Open devtools console.
Expected: `loaded {...}` logs the current state from Task 1's testing; after ~1s, `document.body.dataset.sync` is `'ok'`. Confirm with `curl -s https://decz.pl/api/monke-state` that `xp` is now `12345`.

Delete `scratch-state-check.html` before committing.

- [ ] **Step 3: Commit**

```bash
git add monke-state.js
git commit -m "Add monke-state.js: client state load/save"
```

---

### Task 8: `monke.html` — screens shell wired to state

**Files:**
- Create: `monke.html`

**Interfaces:**
- Consumes: everything from Tasks 2-7 (`monke-ui.js`, `monke-habits.js`, `monke-goals.js`, `monke-island.js`, `monke-focus.js`, `monke-state.js`).
- Produces: the working app shell with 5 tab screens (Dziś / Wyspa / Focus / Cele / Statystyki), habit add/check/uncheck, goal add, focus session start/stop, all wired to load/save state. No onboarding and no animations yet (Tasks 9-10 add those on top).

- [ ] **Step 1: Write `monke.html`**

Create `monke.html`:

```html
<!doctype html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#1f3d2b" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-title" content="Monke" />
  <link rel="apple-touch-icon" href="/monke-icon.svg" />
  <link rel="manifest" href="/monke.webmanifest" />
  <title>Monke</title>
  <style>
    :root { --bg:#1f3d2b; --panel:#28503a; --accent:#f4c752; --text:#eef5ee; --muted:#9db8a6; --danger:#c9577f; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:system-ui,-apple-system,sans-serif; background:var(--bg); color:var(--text); min-height:100vh; }
    header { padding:14px 16px; display:flex; align-items:center; justify-content:space-between; }
    header .brand { font-weight:700; font-size:18px; }
    header .sync-dot { width:8px; height:8px; border-radius:50%; background:var(--accent); display:inline-block; margin-right:6px; }
    body[data-sync="error"] header .sync-dot { background:var(--danger); }
    main { padding:12px 16px 90px; }
    nav.tabs { position:fixed; bottom:0; left:0; right:0; display:flex; background:var(--panel); border-top:1px solid rgba(255,255,255,.08); }
    nav.tabs button { flex:1; background:none; border:none; color:var(--muted); padding:10px 4px; font-size:12px; }
    nav.tabs button.active { color:var(--accent); }
    .screen { display:none; }
    .screen.active { display:block; }
    .group-label { font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:16px 0 6px; }
    .habit-row { display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,.06); }
    .habit-row input[type=checkbox] { width:20px; height:20px; accent-color:var(--accent); }
    .habit-row.done .h-name { text-decoration:line-through; color:var(--muted); }
    .progress-bar { height:6px; border-radius:3px; background:rgba(255,255,255,.1); overflow:hidden; margin:10px 0; }
    .progress-bar .fill { height:100%; background:var(--accent); }
    .banana-count { font-weight:700; color:var(--accent); }
    .card { background:var(--panel); border-radius:12px; padding:14px; margin-bottom:12px; }
    button.primary { background:var(--accent); color:#1f3d2b; border:none; border-radius:8px; padding:10px 14px; font-weight:700; }
    input[type=text] { width:100%; padding:8px; border-radius:8px; border:1px solid rgba(255,255,255,.2); background:rgba(255,255,255,.05); color:var(--text); }
    .island-stage { font-size:64px; text-align:center; margin:20px 0; }
    .focus-timer { font-size:48px; text-align:center; margin:24px 0; font-variant-numeric:tabular-nums; }
    .stat-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .stat-grid .card { text-align:center; }
    .stat-grid .value { font-size:28px; font-weight:700; }
  </style>
</head>
<body data-sync="ok">
  <header>
    <span class="brand">🐒 Monke</span>
    <span><span class="sync-dot"></span><span id="syncLabel">gotowe</span></span>
  </header>

  <main>
    <section class="screen active" id="screen-today">
      <div class="progress-bar"><div class="fill" id="todayFill" style="width:0%"></div></div>
      <div id="habitGroups"></div>
      <div class="card">
        <input type="text" id="newHabitName" placeholder="Nazwa nawyku" />
        <input type="text" id="newHabitGroup" placeholder="Grupa (np. Rano)" style="margin-top:8px" />
        <button class="primary" id="addHabitBtn" style="margin-top:8px">Dodaj nawyk</button>
      </div>
    </section>

    <section class="screen" id="screen-island">
      <div class="card">
        <div class="island-stage" id="islandStage">🏝️</div>
        <div style="text-align:center">🍌 <span class="banana-count" id="bananaCount">0</span></div>
      </div>
    </section>

    <section class="screen" id="screen-focus">
      <div class="card">
        <div class="focus-timer" id="focusTimer">25:00</div>
        <div style="display:flex; gap:8px; justify-content:center">
          <button class="primary" id="focusStartBtn">Start</button>
          <button id="focusStopBtn" disabled>Zakończ</button>
        </div>
      </div>
    </section>

    <section class="screen" id="screen-goals">
      <div id="goalsList"></div>
      <div class="card">
        <input type="text" id="newGoalName" placeholder="Nazwa celu" />
        <button class="primary" id="addGoalBtn" style="margin-top:8px">Dodaj cel</button>
      </div>
    </section>

    <section class="screen" id="screen-stats">
      <div class="stat-grid">
        <div class="card"><div class="value" id="statLevel">1</div>Poziom</div>
        <div class="card"><div class="value" id="statXp">0</div>XP</div>
        <div class="card"><div class="value" id="statStreak">0</div>Streak</div>
        <div class="card"><div class="value" id="statFocusAvg">0</div>Śr. focus (min)</div>
      </div>
    </section>
  </main>

  <nav class="tabs">
    <button class="active" data-screen="today">Dziś</button>
    <button data-screen="island">Wyspa</button>
    <button data-screen="focus">Focus</button>
    <button data-screen="goals">Cele</button>
    <button data-screen="stats">Statystyki</button>
  </nav>

  <script type="module">
    import { loadState, queueSave } from './monke-state.js';
    import { levelFromXp, rankFromLevel, updateStreak } from './monke-ui.js';
    import { groupedHabits, dayProgress, isHabitDone, setHabitVariant, rewardForVariant } from './monke-habits.js';
    import { goalProgress } from './monke-goals.js';
    import { islandStageForBananas } from './monke-island.js';
    import { xpForFocusMinutes, bananasForFocusMinutes, createFocusSession } from './monke-focus.js';

    let state = await loadState();

    const todayStr = () => new Date().toISOString().slice(0, 10);
    function newId(prefix) { return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`; }

    function persist() { queueSave(state); render(); }

    document.querySelectorAll('nav.tabs button').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('nav.tabs button').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`screen-${btn.dataset.screen}`).classList.add('active');
      });
    });

    function renderHabits() {
      const container = document.getElementById('habitGroups');
      container.innerHTML = '';
      const doneToday = state.doneLog[todayStr()] || {};
      for (const [group, habits] of groupedHabits(state.habits)) {
        const label = document.createElement('div');
        label.className = 'group-label';
        label.textContent = group;
        container.appendChild(label);
        for (const habit of habits) {
          const row = document.createElement('div');
          row.className = 'habit-row' + (isHabitDone(doneToday, habit.id) ? ' done' : '');
          row.innerHTML = `<input type="checkbox" ${isHabitDone(doneToday, habit.id) ? 'checked' : ''} /><span class="h-name">${habit.name}</span>`;
          row.querySelector('input').addEventListener('change', (e) => toggleHabit(habit, e.target.checked));
          container.appendChild(row);
        }
      }
      const progress = dayProgress(state.habits, doneToday);
      document.getElementById('todayFill').style.width = progress.total ? `${(progress.done / progress.total) * 100}%` : '0%';
    }

    function toggleHabit(habit, checked) {
      const today = todayStr();
      const doneToday = state.doneLog[today] || {};
      const wasDone = isHabitDone(doneToday, habit.id);
      const variant = checked ? 'full' : null;
      state.doneLog = setHabitVariant(state.doneLog, today, habit.id, variant);
      const reward = checked ? rewardForVariant('full') : rewardForVariant(isHabitDone(doneToday, habit.id) ? 'full' : null);
      if (checked && !wasDone) {
        state.xp += reward.xp;
        state.currency.bananas += reward.bananas;
      } else if (!checked && wasDone) {
        const undone = rewardForVariant(doneToday[habit.id]);
        state.xp = Math.max(0, state.xp - undone.xp);
        state.currency.bananas = Math.max(0, state.currency.bananas - undone.bananas);
      }
      const nowDoneToday = state.doneLog[today] || {};
      const allDone = dayProgress(state.habits, nowDoneToday).done === state.habits.length && state.habits.length > 0;
      state.streak = updateStreak(state.streak, today, allDone);
      state.island.stage = islandStageForBananas(state.currency.bananas);
      persist();
    }

    document.getElementById('addHabitBtn').addEventListener('click', () => {
      const name = document.getElementById('newHabitName').value.trim();
      const group = document.getElementById('newHabitGroup').value.trim() || 'Rano';
      if (!name) return;
      state.habits.push({ id: newId('h'), name, group, time: '', minimumVariant: '', goalId: null, createdAt: new Date().toISOString() });
      document.getElementById('newHabitName').value = '';
      document.getElementById('newHabitGroup').value = '';
      persist();
    });

    function renderIsland() {
      document.getElementById('bananaCount').textContent = state.currency.bananas;
      const emojiByStage = ['🏝️', '🌱', '💧', '🌴', '🏠'];
      document.getElementById('islandStage').textContent = emojiByStage[state.island.stage] || '🏝️';
    }

    function renderGoals() {
      const container = document.getElementById('goalsList');
      container.innerHTML = '';
      const doneToday = state.doneLog[todayStr()] || {};
      for (const goal of state.goals) {
        const progress = goalProgress(goal, doneToday);
        const card = document.createElement('div');
        card.className = 'card';
        const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
        card.innerHTML = `<strong>${goal.name}</strong><div class="progress-bar"><div class="fill" style="width:${pct}%"></div></div><small>${progress.done}/${progress.total}</small>`;
        container.appendChild(card);
      }
    }

    document.getElementById('addGoalBtn').addEventListener('click', () => {
      const name = document.getElementById('newGoalName').value.trim();
      if (!name) return;
      state.goals.push({ id: newId('g'), name, habitIds: [], createdAt: new Date().toISOString() });
      document.getElementById('newGoalName').value = '';
      persist();
    });

    let focusInterval = null;
    let focusSecondsLeft = 25 * 60;
    let focusStartedAt = null;
    function renderFocusTimer() {
      const m = String(Math.floor(focusSecondsLeft / 60)).padStart(2, '0');
      const s = String(focusSecondsLeft % 60).padStart(2, '0');
      document.getElementById('focusTimer').textContent = `${m}:${s}`;
    }
    document.getElementById('focusStartBtn').addEventListener('click', () => {
      if (focusInterval) return;
      focusStartedAt = new Date().toISOString();
      document.getElementById('focusStartBtn').disabled = true;
      document.getElementById('focusStopBtn').disabled = false;
      focusInterval = setInterval(() => {
        focusSecondsLeft -= 1;
        renderFocusTimer();
        if (focusSecondsLeft <= 0) finishFocus();
      }, 1000);
    });
    document.getElementById('focusStopBtn').addEventListener('click', finishFocus);
    function finishFocus() {
      clearInterval(focusInterval);
      focusInterval = null;
      const elapsedMinutes = 25 - focusSecondsLeft / 60;
      if (elapsedMinutes >= 1) {
        const session = createFocusSession(focusStartedAt, elapsedMinutes);
        state.focusSessions.push(session);
        state.xp += session.xpEarned;
        state.currency.bananas += bananasForFocusMinutes(session.minutes);
        state.island.stage = islandStageForBananas(state.currency.bananas);
      }
      focusSecondsLeft = 25 * 60;
      document.getElementById('focusStartBtn').disabled = false;
      document.getElementById('focusStopBtn').disabled = true;
      renderFocusTimer();
      persist();
    }

    function renderStats() {
      const { level } = levelFromXp(state.xp);
      document.getElementById('statLevel').textContent = level;
      document.getElementById('statXp').textContent = state.xp;
      document.getElementById('statStreak').textContent = state.streak.count;
      const sessions = state.focusSessions;
      const avg = sessions.length ? Math.round(sessions.reduce((sum, s) => sum + s.minutes, 0) / sessions.length) : 0;
      document.getElementById('statFocusAvg').textContent = avg;
    }

    function render() {
      renderHabits();
      renderIsland();
      renderGoals();
      renderStats();
      renderFocusTimer();
    }

    new MutationObserver(() => {
      document.getElementById('syncLabel').textContent =
        document.body.dataset.sync === 'saving' ? 'zapisywanie…' : document.body.dataset.sync === 'error' ? 'błąd zapisu' : 'gotowe';
    }).observe(document.body, { attributes: true, attributeFilter: ['data-sync'] });

    render();
  </script>
</body>
</html>
```

- [ ] **Step 2: Manual verification**

Deploy to a preview or run locally with the Vercel CLI (`vercel dev`), open `/monke.html` in a browser:
1. On the "Dziś" tab, add a habit named "Woda" in group "Rano". Confirm it appears under a "Rano" group label.
2. Check its checkbox. Confirm the row gets struck-through, the progress bar fills, and (open devtools → Network) a `POST /api/monke-state` fires within ~600ms.
3. Reload the page. Confirm the habit and its checked state persisted (loaded from the API).
4. Switch to "Wyspa" tab — confirm the banana count shows `1` and the island emoji is `🏝️` (stage 0, since 1 banana < 10 required for stage 1).
5. Switch to "Focus" tab, click Start, confirm the countdown ticks down from `25:00`. Click "Zakończ" early — confirm no XP is awarded if elapsed time is under 1 minute (check Statystyki tab XP unchanged).
6. Switch to "Cele" tab, add a goal "Test". Confirm it appears with `0/0` (no linked habits yet — linking habits to goals via UI is out of scope for Task 8, tracked as a known gap in Task 8's own verification, not a blocker for later tasks).
7. Switch to "Statystyki" tab, confirm Level/XP/Streak/Śr. focus reflect the state.

- [ ] **Step 3: Commit**

```bash
git add monke.html
git commit -m "Add monke.html: screens shell wired to state"
```

---

### Task 9: Animations

**Files:**
- Modify: `monke.html`

**Interfaces:**
- Consumes: `pulse(el, className, durationMs)` from `monke-ui.js` (Task 2).
- Produces: visible CSS animations for habit-check, banana-earn, level-up, streak-pulse, and island-stage-unlock, triggered from the existing render functions in `monke.html`.

- [ ] **Step 1: Add the keyframes and animation classes to `monke.html`'s `<style>` block**

Add inside the existing `<style>` tag (after the `.stat-grid .value` rule):

```css
@keyframes checkPop { 0%{transform:scale(1);} 50%{transform:scale(1.15);} 100%{transform:scale(1);} }
.habit-row.just-checked { animation: checkPop .3s ease; }

@keyframes bananaFly { 0%{transform:translateY(0) scale(1); opacity:1;} 100%{transform:translateY(-24px) scale(1.4); opacity:0;} }
.banana-fly { position:relative; }
.banana-fly::after { content:'🍌'; position:absolute; right:0; top:0; animation:bananaFly .6s ease forwards; }

@keyframes levelFlash { 0%{transform:scale(1);} 50%{transform:scale(1.3); text-shadow:0 0 12px var(--accent);} 100%{transform:scale(1);} }
.level-up { animation: levelFlash .6s ease; }

@keyframes streakPulse { 0%{opacity:1;} 50%{opacity:.4;} 100%{opacity:1;} }
.streak-growing { animation: streakPulse 1s ease infinite; }

@keyframes stageUnlock { 0%{transform:scale(0.4); opacity:0;} 100%{transform:scale(1); opacity:1;} }
.island-stage.stage-unlocked { animation: stageUnlock .5s ease; }
```

- [ ] **Step 2: Trigger the animations from the existing JS**

In `monke.html`'s `<script type="module">` block:

Replace the `toggleHabit` function's checked-branch row lookup with an animation trigger. Immediately after `state.island.stage = islandStageForBananas(state.currency.bananas);` inside `toggleHabit`, add (before the closing `persist();`):

```js
      if (checked && !wasDone) {
        const row = [...document.querySelectorAll('.habit-row')].find((r) => r.querySelector('.h-name').textContent === habit.name);
        if (row) { pulse(row, 'just-checked'); row.classList.add('banana-fly'); setTimeout(() => row.classList.remove('banana-fly'), 650); }
      }
```

Add the import at the top: change `import { levelFromXp, rankFromLevel, updateStreak } from './monke-ui.js';` to `import { levelFromXp, rankFromLevel, updateStreak, pulse } from './monke-ui.js';`

In `renderStats()`, capture the previous level and flash on level-up. Replace the function body with:

```js
    let lastRenderedLevel = null;
    function renderStats() {
      const { level } = levelFromXp(state.xp);
      const levelEl = document.getElementById('statLevel');
      levelEl.textContent = level;
      if (lastRenderedLevel !== null && level > lastRenderedLevel) pulse(levelEl, 'level-up', 700);
      lastRenderedLevel = level;
      document.getElementById('statXp').textContent = state.xp;
      const streakEl = document.getElementById('statStreak');
      streakEl.textContent = state.streak.count;
      streakEl.classList.toggle('streak-growing', state.streak.count >= 3);
      const sessions = state.focusSessions;
      const avg = sessions.length ? Math.round(sessions.reduce((sum, s) => sum + s.minutes, 0) / sessions.length) : 0;
      document.getElementById('statFocusAvg').textContent = avg;
    }
```

In `renderIsland()`, flash on stage change. Replace the function body with:

```js
    let lastRenderedStage = null;
    function renderIsland() {
      document.getElementById('bananaCount').textContent = state.currency.bananas;
      const emojiByStage = ['🏝️', '🌱', '💧', '🌴', '🏠'];
      const stageEl = document.getElementById('islandStage');
      stageEl.textContent = emojiByStage[state.island.stage] || '🏝️';
      if (lastRenderedStage !== null && state.island.stage > lastRenderedStage) pulse(stageEl, 'stage-unlocked', 500);
      lastRenderedStage = state.island.stage;
    }
```

- [ ] **Step 3: Manual verification**

Open `/monke.html` in a browser:
1. Check a habit checkbox — confirm the row pops (scale animation) and a 🍌 briefly flies up and fades from the row.
2. Earn enough XP to cross a level boundary (e.g. add and check 10 habits worth 10 XP each to cross from level 1 to 2, or temporarily set `state.xp = 95` via devtools console and check one more habit) — confirm the level number on the Statystyki tab flashes/glows.
3. Earn enough bananas to cross an island stage boundary (10 bananas) — confirm the island emoji on the Wyspa tab pops in with a scale-in animation when it changes.
4. Build a streak to 3+ days (or set `state.streak.count = 3` via devtools console and re-render) — confirm the streak number pulses (fades in/out continuously).

- [ ] **Step 4: Commit**

```bash
git add monke.html
git commit -m "Add animations to Monke: check-pop, banana-fly, level-up, streak-pulse, island-unlock"
```

---

### Task 10: `monke-onboarding.js` + wiring into `monke.html`

**Files:**
- Create: `monke-onboarding.js`
- Modify: `monke.html`

**Interfaces:**
- Produces: `ONBOARDING_STEPS` (array of `{title, body}`); `renderOnboarding(container, onComplete)` — renders the current step into `container`, wires Next/Back/Finish buttons, calls `onComplete()` when the user finishes.

- [ ] **Step 1: Create `monke-onboarding.js`**

```js
export const ONBOARDING_STEPS = [
  { title: 'Cześć, tu Monke 🐒', body: 'Twoja mała wyspa i nawyki w jednym miejscu. Odhaczaj nawyki, zbieraj banany, rozwijaj wyspę.' },
  { title: 'Nawyki', body: 'Dodaj swój pierwszy nawyk na zakładce "Dziś" — możesz pogrupować je np. na Rano / W ciągu dnia / Wieczorem.' },
  { title: 'Zły dzień się liczy', body: 'Każdy odhaczony nawyk daje XP i podtrzymuje streaka, nawet w wersji minimum na gorszy dzień.' },
  { title: 'Focus', body: 'Sesja skupienia na zakładce "Focus" daje 1 XP za każdą minutę — a po 5 minutach dorzuca banana.' },
  { title: 'Banany i wyspa', body: 'Zbierane banany odblokowują kolejne etapy wyspy na zakładce "Wyspa".' },
  { title: 'Cele', body: 'Na zakładce "Cele" możesz grupować nawyki w większe cele i śledzić postęp.' },
  { title: 'Zaczynamy!', body: 'To wszystko na start — dodaj pierwszy nawyk i odhacz go, żeby zobaczyć jak to działa.' },
];

export function renderOnboarding(container, onComplete) {
  let index = 0;
  function paint() {
    const step = ONBOARDING_STEPS[index];
    const isLast = index === ONBOARDING_STEPS.length - 1;
    container.innerHTML = `
      <div class="card">
        <h2>${step.title}</h2>
        <p>${step.body}</p>
        <div style="display:flex; justify-content:space-between; margin-top:12px">
          <button id="obBack" ${index === 0 ? 'disabled' : ''}>Wstecz</button>
          <span>${index + 1} / ${ONBOARDING_STEPS.length}</span>
          <button class="primary" id="obNext">${isLast ? 'Zaczynamy!' : 'Dalej'}</button>
        </div>
      </div>`;
    container.querySelector('#obBack').addEventListener('click', () => { index = Math.max(0, index - 1); paint(); });
    container.querySelector('#obNext').addEventListener('click', () => {
      if (isLast) onComplete();
      else { index += 1; paint(); }
    });
  }
  paint();
}
```

- [ ] **Step 2: Wire it into `monke.html`**

Add a new screen section right after `<body data-sync="ok">`'s `<header>...</header>` and before `<main>`:

```html
  <div id="onboardingOverlay" style="position:fixed; inset:0; background:var(--bg); z-index:10; padding:24px; display:none;"></div>
```

In the `<script type="module">` block, add the import:

```js
    import { renderOnboarding } from './monke-onboarding.js';
```

Replace the line `render();` at the very bottom of the script with:

```js
    if (!state.onboarded) {
      document.getElementById('onboardingOverlay').style.display = 'block';
      renderOnboarding(document.getElementById('onboardingOverlay'), () => {
        state.onboarded = true;
        document.getElementById('onboardingOverlay').style.display = 'none';
        persist();
      });
    }
    render();
```

- [ ] **Step 3: Manual verification**

1. Clear state to force onboarding: `curl -s -X POST https://decz.pl/api/monke-state -H "Content-Type: application/json" -d '{"_updatedAt":"2026-09-10T00:00:01.000Z","onboarded":false,"habits":[],"goals":[],"doneLog":{},"focusSessions":[],"currency":{"bananas":0},"xp":0,"streak":{"count":0,"lastCompleteDate":""},"island":{"stage":0}}'`
2. Open `/monke.html`. Confirm the onboarding overlay covers the screen showing step 1/7 ("Cześć, tu Monke 🐒").
3. Click "Dalej" through all 7 steps. Confirm "Wstecz" is disabled on step 1 and the last step's button reads "Zaczynamy!".
4. Click "Zaczynamy!" on the last step. Confirm the overlay disappears and the "Dziś" screen is visible underneath.
5. Reload the page. Confirm the onboarding does NOT show again (because `onboarded` is now `true` and was persisted).

- [ ] **Step 4: Commit**

```bash
git add monke-onboarding.js monke.html
git commit -m "Add onboarding flow to Monke"
```

---

### Task 11: PWA manifest + icon

**Files:**
- Create: `monke.webmanifest`
- Create: `monke-icon.svg`
- Modify: `monke.html`

**Interfaces:**
- Produces: an installable home-screen shortcut for Monke, following the exact pattern of `werboard.webmanifest`/`werboard-icon.svg`.

- [ ] **Step 1: Create `monke-icon.svg`**

An original flat-SVG icon (no Monke assets) — rounded square background with a simple monkey-face silhouette (two ear circles, a head circle, two eye dots):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="48" fill="#1f3d2b"/>
  <circle cx="52" cy="70" r="22" fill="#8a5a3b"/>
  <circle cx="140" cy="70" r="22" fill="#8a5a3b"/>
  <circle cx="96" cy="104" r="52" fill="#a9754c"/>
  <ellipse cx="96" cy="122" rx="30" ry="22" fill="#e7c9a3"/>
  <circle cx="78" cy="96" r="8" fill="#28211a"/>
  <circle cx="114" cy="96" r="8" fill="#28211a"/>
  <circle cx="96" cy="128" r="6" fill="#28211a"/>
</svg>
```

- [ ] **Step 2: Create `monke.webmanifest`**

```json
{
  "name": "Monke",
  "short_name": "Monke",
  "description": "Nawyki, focus i wyspa w jednym miejscu.",
  "start_url": "/monke.html",
  "display": "standalone",
  "background_color": "#1f3d2b",
  "theme_color": "#1f3d2b",
  "icons": [
    { "src": "/monke-icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 3: Link the manifest and icon in `monke.html`**

In `monke.html`'s `<head>`, the manifest link and apple-touch-icon are already present from Task 8 (`<link rel="apple-touch-icon" href="/monke-icon.svg" />` and `<link rel="manifest" href="/monke.webmanifest" />`) — no change needed here, this step just confirms it.

- [ ] **Step 4: Manual verification**

1. Open `/monke.html` on an iPhone Safari (or Chrome Android). Use "Add to Home Screen".
2. Confirm the added icon shows the monkey-face SVG (not a generic globe/screenshot icon) and the home-screen label reads "Monke".
3. Launch it from the home screen icon. Confirm it opens in standalone mode (no browser address bar), matching how Werboard already behaves.

- [ ] **Step 5: Commit**

```bash
git add monke-icon.svg monke.webmanifest
git commit -m "Add Monke PWA manifest and icon"
```

---

### Task 12: New launcher `index.html` + fix `debrain.html` back-link

**Files:**
- Create: `index.html`
- Modify: `debrain.html`

**Interfaces:**
- Produces: `decz.pl` root shows 3 tiles (Baza / Debrain / Monke) linking to `/baza.html`, `/debrain.html`, `/monke.html`.

- [ ] **Step 1: Create `index.html`**

```html
<!doctype html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#14181B" />
  <link rel="icon" type="image/x-icon" href="/favicon.ico" />
  <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="manifest" href="/site.webmanifest" />
  <title>decz.pl</title>
  <style>
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; background:#14181B; font-family:system-ui,-apple-system,sans-serif; }
    .tiles { display:grid; gap:14px; width:min(320px, 90vw); }
    .tile { display:block; text-decoration:none; background:#20262b; color:#eef5ee; padding:22px; border-radius:14px; font-size:18px; font-weight:700; text-align:center; }
    .tile small { display:block; font-weight:400; font-size:12px; color:#9db8a6; margin-top:4px; }
  </style>
</head>
<body>
  <div class="tiles">
    <a class="tile" href="/baza.html">Baza<small>Dashboard dnia codziennego</small></a>
    <a class="tile" href="/debrain.html">Debrain<small>Czat z agentem</small></a>
    <a class="tile" href="/monke.html">Monke<small>Nawyki, focus i wyspa</small></a>
  </div>
</body>
</html>
```

- [ ] **Step 2: Fix the back-link in `debrain.html`**

`debrain.html` currently has (around line 553) `<a class="back-link" href="index.html">◆ Baza</a>` — this pointed at the old Debrain-OS `index.html` mislabeled "Baza". Now that `index.html` is the 3-tile launcher, update the label to match:

```html
<a class="back-link" href="index.html">◆ Start</a>
```

- [ ] **Step 3: Manual verification**

1. Open `/` (decz.pl root). Confirm 3 tiles: Baza, Debrain, Monke.
2. Click each tile, confirm it lands on `/baza.html`, `/debrain.html`, `/monke.html` respectively.
3. From `/debrain.html`, click "◆ Start" and confirm it returns to the launcher (not a 404).

- [ ] **Step 4: Commit**

```bash
git add index.html debrain.html
git commit -m "Rebuild index.html as a Baza/Debrain/Monke launcher"
```

---

### Task 13: End-to-end QA pass

**Files:** none (verification only).

- [ ] **Step 1: Fresh-state walkthrough**

Reset Monke's state (same POST as Task 10 Step 1's verification, with `onboarded:false`), then on a phone (or phone-sized browser window):
1. Open decz.pl → tap "Monke" tile → onboarding shows → complete it.
2. Add 3 habits across 2 different groups.
3. Check 2 of them full, leave 1 unchecked. Confirm banana count is 2, XP is 20 (via Statystyki), progress bar is at 2/3.
4. Uncheck one of the checked habits. Confirm XP and bananas both decrease accordingly and the progress bar updates.
5. Run a focus session for at least 1 minute (you can temporarily shorten the 25-minute default in devtools by setting `focusSecondsLeft = 65` right after clicking Start, to avoid waiting 25 minutes). Confirm XP increases by the elapsed minutes and, once total focus minutes reach a multiple of 5, bananas increase too.
6. Add a goal. Confirm it shows `0/0` (no linked habits — habit-to-goal linking UI is intentionally out of scope for Faza 1's task list; note this as a Faza-2-adjacent follow-up if the user wants it sooner).
7. Reload the whole app. Confirm every number from steps 2-6 survived the reload (i.e., really came from `/api/monke-state`, not just local memory).
8. Add Monke to the home screen (Task 11) and relaunch from there — confirm the same data loads (proves it's really talking to the shared cloud state, not `localStorage`).

- [ ] **Step 2: Two-device conflict check**

1. Open Monke in two separate browser tabs (simulating two devices).
2. In Tab A, check a habit. Wait for sync (device confirms via `sync-dot` turning back to the "ok" color).
3. In Tab B (which hasn't reloaded), check a *different* habit.
4. Reload Tab A. Confirm Tab B's change is now visible (the `_updatedAt` optimistic-concurrency check from Task 1 means the more recent save wins, and since both tabs edit different fields, no state should be lost between two sequential saves — if Tab B's save happened after Tab A's, the final state should include both changes because Tab B fetched its base state after Tab A's change had already landed).

- [ ] **Step 3: Final commit**

If any bugs were found and fixed during this pass, commit them individually with descriptive messages as you go (don't batch fixes into one "QA fixes" commit — each fix should be its own reviewable commit, consistent with the rest of this plan).

---

## Self-Review Notes

- **Spec coverage:** every Faza 1 bullet in `docs/superpowers/specs/2026-09-10-monke-clone-design.md` (habits+groups+minimum variant, goals+progress, focus timer+XP, XP/level/rank/streak, banany, island stage/decorations, stats, onboarding, animations, PWA manifest, launcher, `monke-state` API) maps to a task above. Two deliberate scope notes carried forward from the spec self-review: (1) `island.unlocked` from the spec's data model is now *derived* from `island.stage` instead of stored separately, to avoid two fields that can drift out of sync — `monke-island.js`'s `unlockedDecorations()` is the only source of truth; (2) linking habits to goals via the UI (setting a habit's `goalId` from the Cele screen) isn't in any task's UI — the data model supports it (`habitIds`/`goalId` fields exist and `goalProgress()` works once populated), but no task wires up an actual "link this habit to this goal" control. Flagged in Task 13 Step 1.7 as a known gap — small enough to add as a follow-up task if the user wants it before Faza 2, but out of the current plan to keep tasks reviewable.
- **Placeholder scan:** no TBD/TODO, no "add appropriate X", no unshown code — every step has literal code or literal verification commands.
- **Type/name consistency:** `state.doneLog[date][habitId]` values (`'full'|'minimum'`), `state.island.stage` (number), `state.currency.bananas` (number) are used with the same names and shapes across Tasks 1, 3, 4, 5, 6, 8, 9, 10. `pulse(el, className, durationMs)` defined in Task 2 is imported with the same signature in Tasks 8/9's `monke.html` edits.
