import { buildShareUrl } from "./links";
import { parseOwnerFragment } from "./links";
import { isSkin, type Skin } from "./prompts";

export interface SealResult {
  id: string;
  shareUrl: string;
  manageUrl: string;
  sender: string;
  recipient: string;
  labelLine: string;
  unlockAt: string;
  createdAt: string;
  skin: Skin;
}

const PREFIX = "lovecan:seal:";

function isSealResult(value: unknown): value is SealResult {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.shareUrl === "string" &&
    typeof item.manageUrl === "string" &&
    typeof item.sender === "string" &&
    typeof item.recipient === "string" &&
    typeof item.labelLine === "string" &&
    typeof item.unlockAt === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.skin === "string" &&
    isSkin(item.skin)
  );
}

export function saveSealResult(result: SealResult): void {
  try {
    window.sessionStorage.setItem(PREFIX + result.id, JSON.stringify(result));
  } catch {
    // The printed card and manage link still work without this copy.
  }
}

export function readSealResult(id: string): SealResult | null {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isSealResult(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function deriveShareUrl(manageUrl: string, id: string): string | null {
  try {
    const url = new URL(manageUrl);
    const owner = parseOwnerFragment(url.hash);
    if (!owner) return null;
    return buildShareUrl(url.origin, id, owner.key);
  } catch {
    return null;
  }
}
