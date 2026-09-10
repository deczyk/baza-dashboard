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
