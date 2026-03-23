import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Display name: displayNames[id] if set, else id (from workspace/IDENTITY.md).
 */
export function getAgentDisplayName(
  id: string,
  displayNames: Record<string, string> = {}
): string {
  if (displayNames[id]) return displayNames[id]
  return id
}
