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
