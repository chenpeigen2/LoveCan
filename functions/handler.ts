const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const CAN_ID_RE = /^[A-Za-z0-9_-]{12}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const CIPHERTEXT_RE = /^[A-Za-z0-9_-]+$/;
const SKINS = new Set(["spring", "winter", "night"]);

const MAX_BODY_BYTES = 2_000_000;
const MAX_LABEL_CIPHERTEXT = 16_000;
const MAX_CONTENT_CIPHERTEXT = 1_600_000;
const MIN_UNLOCK_SECONDS = 45;
const MAX_UNLOCK_YEARS = 10;
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

type Skin = "spring" | "winter" | "night";
type CanState = "sealed" | "ready" | "opened" | "revoked";

interface StoredCan {
  v: 1;
  id: string;
  skin: Skin;
  unlockAt: string;
  createdAt: string;
  ownerHash: string;
  openHash: string;
  requestHash: string;
  labelCiphertext: string;
  contentCiphertext: string | null;
  openedAt: string | null;
  revokedAt: string | null;
}

export interface StorageAdapter {
  download(objectPath: string): Promise<Response>;
  upload(
    objectPath: string,
    bytes: Uint8Array,
    options?: { contentType?: string; upsert?: boolean },
  ): Promise<unknown>;
  remove(objectPaths: string[]): Promise<unknown>;
}

class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const encoder = new TextEncoder();

function jsonResponse(
  payload: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

function errorResponse(status: number, code: string): Response {
  return jsonResponse({ ok: false, error: code }, status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(
  body: Record<string, unknown>,
  key: string,
): string | null {
  const value = body[key];
  return typeof value === "string" ? value : null;
}

function canonicalIso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const iso = date.toISOString();
  return iso === value ? iso : null;
}

function validCiphertext(value: string, maxLength: number): boolean {
  return (
    value.length >= 40 &&
    value.length <= maxLength &&
    CIPHERTEXT_RE.test(value)
  );
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function requestDigest(parts: string[]): Promise<string> {
  return sha256Hex(parts.join("\u0000"));
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "invalid_request");
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new HttpError(413, "too_large");
  }

  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "invalid_request");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new HttpError(413, "too_large");
      }
      chunks.push(value);
    }
  }
  if (total === 0) throw new HttpError(400, "invalid_request");

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(merged));
  } catch {
    throw new HttpError(400, "invalid_request");
  }
  if (!isRecord(parsed)) throw new HttpError(400, "invalid_request");
  return parsed;
}

function canPath(id: string): string {
  return `cans/${id}.json`;
}

function isNotFoundError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const status = error.status ?? error.statusCode;
  if (status === 404) return true;
  const code = typeof error.code === "string" ? error.code.toLowerCase() : "";
  if (code === "not_found" || code === "notfound") return true;
  const message = typeof error.message === "string" ? error.message : "";
  return /not[\s_-]?found|404/i.test(message);
}

function isStoredCan(value: unknown): value is StoredCan {
  if (!isRecord(value)) return false;
  return (
    value.v === 1 &&
    typeof value.id === "string" &&
    CAN_ID_RE.test(value.id) &&
    typeof value.skin === "string" &&
    SKINS.has(value.skin) &&
    canonicalIso(value.unlockAt) !== null &&
    canonicalIso(value.createdAt) !== null &&
    typeof value.ownerHash === "string" &&
    HASH_RE.test(value.ownerHash) &&
    typeof value.openHash === "string" &&
    HASH_RE.test(value.openHash) &&
    typeof value.requestHash === "string" &&
    HASH_RE.test(value.requestHash) &&
    typeof value.labelCiphertext === "string" &&
    (value.contentCiphertext === null ||
      typeof value.contentCiphertext === "string") &&
    (value.openedAt === null || canonicalIso(value.openedAt) !== null) &&
    (value.revokedAt === null || canonicalIso(value.revokedAt) !== null)
  );
}

async function readCan(
  storage: StorageAdapter,
  id: string,
): Promise<StoredCan | null> {
  try {
    const response = await storage.download(canPath(id));
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error("storage_read_failed");
    }
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("storage_corrupt");
    }
    if (!isStoredCan(parsed)) throw new Error("storage_corrupt");
    return parsed;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

async function writeCan(
  storage: StorageAdapter,
  can: StoredCan,
  upsert: boolean,
): Promise<void> {
  await storage.upload(
    canPath(can.id),
    encoder.encode(JSON.stringify(can)),
    { contentType: "application/json; charset=utf-8", upsert },
  );
}

function stateOf(can: StoredCan, nowMs: number): CanState {
  if (can.revokedAt) return "revoked";
  if (can.openedAt) return "opened";
  if (nowMs >= new Date(can.unlockAt).getTime()) return "ready";
  return "sealed";
}

function publicCan(can: StoredCan, state: CanState) {
  return {
    id: can.id,
    skin: can.skin,
    unlockAt: can.unlockAt,
    createdAt: can.createdAt,
    openedAt: can.openedAt,
    revokedAt: can.revokedAt,
    state,
    labelCiphertext: can.revokedAt ? "" : can.labelCiphertext,
    ...(state === "opened" && can.contentCiphertext
      ? { contentCiphertext: can.contentCiphertext }
      : {}),
  };
}

async function ownerMatches(
  request: Request,
  can: StoredCan,
): Promise<boolean> {
  const token = request.headers.get("x-lovecan-owner");
  if (!token || !TOKEN_RE.test(token)) return false;
  const hash = await sha256Hex(token);
  return safeEqual(hash, can.ownerHash);
}

async function handleCreate(
  storage: StorageAdapter,
  request: Request,
): Promise<Response> {
  const body = await readJsonBody(request);

  const id = stringField(body, "id");
  const labelCiphertext = stringField(body, "labelCiphertext");
  const contentCiphertext = stringField(body, "contentCiphertext");
  const unlockAt = canonicalIso(body.unlockAt);
  const skin = stringField(body, "skin");
  const ownerHash = stringField(body, "ownerHash");
  const openHash = stringField(body, "openHash");
  const requestHash = stringField(body, "requestHash");

  if (
    !id ||
    !CAN_ID_RE.test(id) ||
    !labelCiphertext ||
    !validCiphertext(labelCiphertext, MAX_LABEL_CIPHERTEXT) ||
    !contentCiphertext ||
    !validCiphertext(contentCiphertext, MAX_CONTENT_CIPHERTEXT) ||
    !unlockAt ||
    !skin ||
    !SKINS.has(skin) ||
    !ownerHash ||
    !HASH_RE.test(ownerHash) ||
    !openHash ||
    !HASH_RE.test(openHash) ||
    !requestHash ||
    !HASH_RE.test(requestHash)
  ) {
    throw new HttpError(400, "invalid_request");
  }

  const now = Date.now();
  const target = new Date(unlockAt).getTime();
  if (target < now + MIN_UNLOCK_SECONDS * 1000) {
    throw new HttpError(400, "invalid_request");
  }
  if (target > now + MAX_UNLOCK_YEARS * YEAR_MS + 86400000) {
    throw new HttpError(400, "invalid_request");
  }

  const expectedHash = await requestDigest([
    id,
    labelCiphertext,
    contentCiphertext,
    unlockAt,
    skin,
    ownerHash,
    openHash,
  ]);
  if (!safeEqual(expectedHash, requestHash)) {
    throw new HttpError(400, "invalid_request");
  }

  const existing = await readCan(storage, id);
  if (existing) {
    if (safeEqual(existing.requestHash, requestHash)) {
      return jsonResponse({ ok: true, id, replayed: true, serverNow: new Date().toISOString() });
    }
    throw new HttpError(409, "id_conflict");
  }

  const can: StoredCan = {
    v: 1,
    id,
    skin: skin as Skin,
    unlockAt,
    createdAt: new Date().toISOString(),
    ownerHash,
    openHash,
    requestHash,
    labelCiphertext,
    contentCiphertext,
    openedAt: null,
    revokedAt: null,
  };

  try {
    await writeCan(storage, can, false);
  } catch {
    const raced = await readCan(storage, id);
    if (raced && safeEqual(raced.requestHash, requestHash)) {
      return jsonResponse({ ok: true, id, replayed: true, serverNow: new Date().toISOString() });
    }
    if (raced) throw new HttpError(409, "id_conflict");
    throw new HttpError(503, "storage_unavailable");
  }

  return jsonResponse(
    {
      ok: true,
      id,
      createdAt: can.createdAt,
      serverNow: new Date().toISOString(),
    },
    201,
  );
}

async function handleGet(
  storage: StorageAdapter,
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  if (!CAN_ID_RE.test(id)) throw new HttpError(400, "invalid_request");

  const can = await readCan(storage, id);
  if (!can) throw new HttpError(404, "not_found");

  const ownerHeader = request.headers.get("x-lovecan-owner");
  if (ownerHeader && !(await ownerMatches(request, can))) {
    throw new HttpError(403, "forbidden");
  }

  const serverNow = new Date().toISOString();
  const state = stateOf(can, new Date(serverNow).getTime());
  return jsonResponse({
    ok: true,
    can: publicCan(can, state),
    serverNow,
  });
}

async function handleOpen(
  storage: StorageAdapter,
  request: Request,
): Promise<Response> {
  const body = await readJsonBody(request);
  const id = stringField(body, "id");
  const openToken = stringField(body, "openToken");
  if (!id || !CAN_ID_RE.test(id) || !openToken || !TOKEN_RE.test(openToken)) {
    throw new HttpError(400, "invalid_request");
  }

  let can = await readCan(storage, id);
  if (!can) throw new HttpError(404, "not_found");
  if (can.revokedAt) throw new HttpError(410, "revoked");

  const now = new Date();
  if (now.getTime() < new Date(can.unlockAt).getTime()) {
    throw new HttpError(423, "locked");
  }

  const hash = await sha256Hex(openToken);
  if (!safeEqual(hash, can.openHash)) {
    throw new HttpError(403, "forbidden");
  }
  if (!can.contentCiphertext) {
    throw new HttpError(404, "not_found");
  }

  if (!can.openedAt) {
    const latest = await readCan(storage, id);
    if (!latest) throw new HttpError(404, "not_found");
    if (latest.revokedAt) throw new HttpError(410, "revoked");
    if (!latest.contentCiphertext) throw new HttpError(404, "not_found");
    if (latest.openedAt) {
      can = latest;
    } else {
      can = { ...latest, openedAt: now.toISOString() };
      await writeCan(storage, can, true);
    }
  }

  const serverNow = new Date().toISOString();
  return jsonResponse({
    ok: true,
    openedAt: can.openedAt,
    contentCiphertext: can.contentCiphertext,
    serverNow,
  });
}

async function handleRevoke(
  storage: StorageAdapter,
  request: Request,
): Promise<Response> {
  const body = await readJsonBody(request);
  const id = stringField(body, "id");
  if (!id || !CAN_ID_RE.test(id)) {
    throw new HttpError(400, "invalid_request");
  }

  let can = await readCan(storage, id);
  if (!can) throw new HttpError(404, "not_found");
  if (!(await ownerMatches(request, can))) {
    throw new HttpError(403, "forbidden");
  }
  if (can.revokedAt) {
    return jsonResponse({
      ok: true,
      revokedAt: can.revokedAt,
      serverNow: new Date().toISOString(),
    });
  }
  if (can.openedAt) throw new HttpError(409, "already_opened");

  const latest = await readCan(storage, id);
  if (!latest) throw new HttpError(404, "not_found");
  if (latest.openedAt) throw new HttpError(409, "already_opened");
  if (!(await ownerMatches(request, latest))) {
    throw new HttpError(403, "forbidden");
  }
  if (latest.revokedAt) {
    return jsonResponse({
      ok: true,
      revokedAt: latest.revokedAt,
      serverNow: new Date().toISOString(),
    });
  }

  const revokedAt = new Date().toISOString();
  can = {
    ...latest,
    revokedAt,
    labelCiphertext: "",
    contentCiphertext: null,
  };
  await writeCan(storage, can, true);

  return jsonResponse({
    ok: true,
    revokedAt,
    serverNow: new Date().toISOString(),
  });
}

export function createHandler(
  storage: StorageAdapter,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const action = new URL(request.url).searchParams.get("action") ?? "";
    try {
      if (action === "can") {
        if (request.method !== "GET") {
          return errorResponse(405, "method_not_allowed");
        }
        return await handleGet(storage, request);
      }
      if (action === "create" || action === "open" || action === "revoke") {
        if (request.method !== "POST") {
          return errorResponse(405, "method_not_allowed");
        }
        if (action === "create") {
          return await handleCreate(storage, request);
        }
        if (action === "open") {
          return await handleOpen(storage, request);
        }
        return await handleRevoke(storage, request);
      }
      return errorResponse(400, "invalid_request");
    } catch (error) {
      if (error instanceof HttpError) {
        return errorResponse(error.status, error.code);
      }
      console.error("lovecan_handler_failed", action);
      return errorResponse(503, "storage_unavailable");
    }
  };
}
