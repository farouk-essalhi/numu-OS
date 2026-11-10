"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

/** True while the media query matches (e.g. "(min-width: 768px)"). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * State that survives leaving the page: kept in this browser tab (session) or
 * for good on this device (local). Screens only render in the browser, so
 * reading storage on the first render is safe.
 */
export function useStored<T>(key: string, initial: T, where: "session" | "local" = "session"): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = (where === "local" ? localStorage : sessionStorage).getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          (where === "local" ? localStorage : sessionStorage).setItem(key, JSON.stringify(v));
        } catch {
          // private mode: just don't remember
        }
        return v;
      });
    },
    [key, where],
  );
  return [value, set];
}
