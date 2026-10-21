export interface SavedCan {
  id: string;
  recipient: string;
  unlockAt: string;
  createdAt: string;
  manageUrl: string;
  sender?: string;
  labelLine?: string;
  skin?: string;
}

const STORAGE_KEY = "lovecan:sealed:v1";
const LIMIT = 12;

function isSavedCan(value: unknown): value is SavedCan {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.recipient === "string" &&
    typeof item.unlockAt === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.manageUrl === "string"
  );
}

export function readSavedCans(): SavedCan[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedCan).slice(0, LIMIT);
  } catch {
    return [];
  }
}

export function saveSealedCan(entry: SavedCan): void {
  try {
    const existing = readSavedCans().filter((item) => item.id !== entry.id);
    const next = [entry, ...existing].slice(0, LIMIT);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Local history is a convenience; the printed stub remains the source of truth.
  }
}

export function clearSavedCans(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
