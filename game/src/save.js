// Progress persistence: cash, story progress and the pistol live in localStorage so a
// returning player can pick the night back up from the start screen's Continue button.
const KEY = 'heatline.marisol.save.v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return {
      cash: Math.max(0, Math.floor(data.cash ?? 250)),
      storyIndex: Math.min(3, Math.max(0, data.storyIndex ?? 0)),
      hasPistol: !!data.hasPistol,
      storyDone: !!data.storyDone,
    };
  } catch {
    return null;
  }
}

export function storeSave(S) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      cash: S.cash,
      storyIndex: S.storyIndex,
      hasPistol: S.hasPistol,
      storyDone: S.storyDone,
    }));
  } catch {
    // Private mode or a full store: the night just won't persist, the game still plays.
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
