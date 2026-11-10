// Opening the "New task" panel from anywhere (a button on a page, the N key),
// optionally with some fields already filled in.

import { createSignal } from "./signals";
import type { IsoDate } from "./types";

export interface NewTaskPreset {
  clientId?: string;
  projectId?: string;
  parentId?: string;
  ownerId?: string;
  due?: IsoDate;
}

/** `null` = closed. A new object each time it opens, so the form starts fresh. */
export const newTaskSignal = createSignal<NewTaskPreset | null>(null);

export function openNewTask(preset: NewTaskPreset = {}): void {
  newTaskSignal.set({ ...preset });
}

export function closeNewTask(): void {
  newTaskSignal.set(null);
}
