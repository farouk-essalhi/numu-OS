"use client";

// Panels that open on demand (new task, edit forms, search) are downloaded
// after the page is up, so the first load carries less code. They are fetched
// as soon as the browser has a quiet moment, so opening one doesn't wait.

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

export const NewDeliverableSheet = dynamic(() => import("./new-deliverable-sheet").then((m) => m.NewDeliverableSheet), { ssr: false });
export const EditSheet = dynamic(() => import("./entity-forms").then((m) => m.EditSheet), { ssr: false });
export const CommandPalette = dynamic(() => import("./shell/command-palette").then((m) => m.CommandPalette), { ssr: false });

/** True once the browser has been idle for a moment, or as soon as `now` is. Stays true. */
export function useIdle(now = false): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(() => setIdle(true), { timeout: 2500 });
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(() => setIdle(true), 1200);
    return () => clearTimeout(t);
  }, []);
  const [asked, setAsked] = useState(now);
  if (now && !asked) setAsked(true);
  return idle || asked;
}
