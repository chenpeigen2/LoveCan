import type { Skin } from "./prompts";

export type CanState = "sealed" | "ready" | "opened" | "revoked";

export interface CanRecord {
  id: string;
  skin: Skin;
  unlockAt: string;
  createdAt: string;
  openedAt: string | null;
  revokedAt: string | null;
  state: CanState;
  labelCiphertext: string;
  contentCiphertext?: string;
}

export interface CreateCanInput {
  id: string;
  labelCiphertext: string;
  contentCiphertext: string;
  unlockAt: string;
  skin: Skin;
  ownerHash: string;
  openHash: string;
  requestHash: string;
}

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, status = 0) {
    super(code);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export function apiErrorMessage(code: string): string {
  switch (code) {
    case "not_found":
      return "没有找到这只罐子。也许链接缺了一段。";
    case "locked":
      return "还没到时间。再等一等。";
    case "forbidden":
      return "这把钥匙不对。";
    case "revoked":
      return "这罐东西已经被寄件人收回了。";
    case "already_opened":
      return "它已经被打开过了。";
    case "too_large":
      return "这罐东西太重了。换一段短一点的录音吧。";
    case "invalid_request":
      return "有些内容不完整。再试一次。";
    case "id_conflict":
      return "这只罐子已经有别的名字了。再试一次。";
    case "storage_unavailable":
      return "罐子暂时取不出来。过一会儿再试。";
    case "crypto_unavailable":
      return "这一页没法给信上锁。换一个浏览器再试一次。";
    case "network":
      return "这一下没接上。再试一次。";
    default:
      return "出了点小问题。再试一次。";
  }
}

async function requestJson<T>(
  action: string,
  params: Record<string, string>,
  init: RequestInit = {},
  ownerToken?: string,
): Promise<T> {
  const query = new URLSearchParams({ action, ...params });
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (ownerToken) headers.set("x-lovecan-owner", ownerToken);

  let response: Response;
  try {
    response = await fetch(`/functions/v1/app?${query.toString()}`, {
      ...init,
      headers,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError("network");
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("invalid_response", response.status);
  }

  const data = payload as { ok?: boolean; error?: string } | null;
  if (!response.ok || !data || data.ok !== true) {
    throw new ApiError(data?.error ?? "request_failed", response.status);
  }
  return data as T;
}

export interface CanEnvelope {
  can: CanRecord;
  serverNow: string;
}

export async function createCan(
  input: CreateCanInput,
): Promise<{ id: string; replayed?: boolean; serverNow?: string }> {
  return requestJson<{ ok: true; id: string; replayed?: boolean; serverNow?: string }>(
    "create",
    {},
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function getCan(
  id: string,
  ownerToken?: string,
): Promise<CanEnvelope> {
  const result = await requestJson<{
    ok: true;
    can: CanRecord;
    serverNow?: string;
  }>("can", { id }, { method: "GET" }, ownerToken);
  if (!result.can || typeof result.can.id !== "string") {
    throw new ApiError("invalid_response");
  }
  return {
    can: result.can,
    serverNow: result.serverNow ?? new Date().toISOString(),
  };
}

export async function openCan(
  id: string,
  openToken: string,
): Promise<{
  openedAt: string;
  contentCiphertext: string;
  serverNow: string;
}> {
  return requestJson<{
    ok: true;
    openedAt: string;
    contentCiphertext: string;
    serverNow?: string;
  }>("open", {}, { method: "POST", body: JSON.stringify({ id, openToken }) }).then(
    (result) => ({
      openedAt: result.openedAt,
      contentCiphertext: result.contentCiphertext,
      serverNow: result.serverNow ?? new Date().toISOString(),
    }),
  );
}

export async function revokeCan(
  id: string,
  ownerToken: string,
): Promise<{ revokedAt: string; serverNow: string }> {
  const result = await requestJson<{
    ok: true;
    revokedAt: string;
    serverNow?: string;
  }>("revoke", {}, { method: "POST", body: JSON.stringify({ id }) }, ownerToken);
  return {
    revokedAt: result.revokedAt,
    serverNow: result.serverNow ?? new Date().toISOString(),
  };
}
