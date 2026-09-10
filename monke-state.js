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
