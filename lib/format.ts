import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Platform } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Money is stored as integer minor units (fils for QAR). Format only here. */
export function formatMoney(minor: number, currency = "QAR"): string {
  const major = minor / 100;
  const digits = Number.isInteger(major) ? 0 : 2;
  return `${currency} ${major.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: 2 })}`;
}

export function initials(name: string): string {
  const parts = name.replace(/^Dr\.?\s+/i, "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0];
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  snapchat: "Snapchat",
  youtube: "YouTube",
  x: "X",
  linkedin: "LinkedIn",
  facebook: "Facebook",
};

export function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}
