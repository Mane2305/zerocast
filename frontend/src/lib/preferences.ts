"use client";
import { useMemo, useSyncExternalStore } from "react";
const memory = new Map<string, string>();
function read(key: string) {
  try {
    return localStorage.getItem(key) || memory.get(key) || "";
  } catch {
    return memory.get(key) || "";
  }
}
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("zerocast-preferences", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("zerocast-preferences", callback);
  };
}
type Preferences = {
  accuracyJob?: string;
  job?: string;
  selected?: string;
  horizon?: number;
  level?: number;
  picked?: string[];
};
export function useDatasetPreferences(id: string) {
  const key = `zerocast-planning:${id}`;
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => "",
  );
  const preferences = useMemo((): Preferences => {
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== "object") return {};
      return {
        accuracyJob:
          typeof value.accuracyJob === "string" ? value.accuracyJob : undefined,
        job: typeof value.job === "string" ? value.job : undefined,
        selected:
          typeof value.selected === "string" ? value.selected : undefined,
        horizon:
          Number.isInteger(value.horizon) &&
          value.horizon >= 1 &&
          value.horizon <= 256
            ? value.horizon
            : undefined,
        level:
          Number.isInteger(value.level) &&
          value.level >= 50 &&
          value.level <= 90
            ? value.level
            : undefined,
        picked:
          Array.isArray(value.picked) &&
          value.picked.length <= 100 &&
          value.picked.every((item: unknown) => typeof item === "string")
            ? value.picked
            : undefined,
      };
    } catch {
      return {};
    }
  }, [raw]);
  const update = (patch: Preferences) => {
    let current = preferences;
    try {
      const stored = JSON.parse(read(key));
      if (stored && typeof stored === "object" && !Array.isArray(stored))
        current = stored;
    } catch {
      /* Use the validated snapshot. */
    }
    const value = JSON.stringify({ ...current, ...patch });
    memory.set(key, value);
    try {
      localStorage.setItem(key, value);
    } catch {
      /* The in-memory fallback keeps controls usable. */
    }
    window.dispatchEvent(new Event("zerocast-preferences"));
  };
  return { ...preferences, update };
}
