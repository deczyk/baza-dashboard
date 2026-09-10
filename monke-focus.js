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
