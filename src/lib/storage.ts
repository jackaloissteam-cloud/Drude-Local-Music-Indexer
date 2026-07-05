import type { Library } from "./library";
import { EMPTY_LIBRARY } from "./library";

const KEY = "sift.library.v1";

export function loadLibrary(): Library {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY_LIBRARY;
    const parsed = JSON.parse(raw) as Library;
    if (parsed?.version === 1 && Array.isArray(parsed.tracks)) return parsed;
    return EMPTY_LIBRARY;
  } catch {
    return EMPTY_LIBRARY;
  }
}

export function saveLibrary(lib: Library) {
  localStorage.setItem(KEY, JSON.stringify(lib));
}
