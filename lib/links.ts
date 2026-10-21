import { TOKEN_RE } from "./crypto";

export const CAN_ID_RE = /^[A-Za-z0-9_-]{12}$/;

export function isCanId(value: string): boolean {
  return CAN_ID_RE.test(value);
}

export function isKey(value: string): boolean {
  return TOKEN_RE.test(value);
}

export function parseShareFragment(hash: string): string | null {
  const value = hash.replace(/^#/, "");
  return isKey(value) ? value : null;
}

export function parseOwnerFragment(
  hash: string,
): { ownerToken: string; key: string } | null {
  const value = hash.replace(/^#/, "");
  const [ownerToken, key, ...rest] = value.split(".");
  if (rest.length > 0) return null;
  if (!ownerToken || !key) return null;
  if (!isKey(ownerToken) || !isKey(key)) return null;
  return { ownerToken, key };
}

export function buildShareUrl(origin: string, id: string, key: string): string {
  return `${origin.replace(/\/$/, "")}/c/${id}/#${key}`;
}

export function buildManageUrl(
  origin: string,
  id: string,
  ownerToken: string,
  key: string,
): string {
  return `${origin.replace(/\/$/, "")}/m/${id}/#${ownerToken}.${key}`;
}
