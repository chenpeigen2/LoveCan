const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const KEY_BYTES = 32;
export const TOKEN_CHARS = 43;
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const AAD_LABEL = "lovecan:label:v1";
export const AAD_CONTENT = "lovecan:content:v1";

export interface AudioPayload {
  mime: string;
  base64: string;
  duration: number;
}

export interface LabelPayload {
  v: 1;
  senderName: string;
  recipientName: string;
  labelLine: string;
  createdAt: string;
}

export interface ContentPayload {
  v: 1;
  letter: string;
  audio: AudioPayload | null;
}

export function cryptoAvailable(): boolean {
  return typeof crypto !== "undefined" && Boolean(crypto.subtle);
}

function toBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function randomToken(byteLength = KEY_BYTES): string {
  return bytesToBase64Url(randomBytes(byteLength));
}

export function randomCanId(): string {
  return bytesToBase64Url(randomBytes(9));
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  if (!cryptoAvailable()) throw new Error("crypto_unavailable");
  const data =
    typeof input === "string" ? encoder.encode(input) : toBuffer(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function deriveOpenToken(key: string): Promise<string> {
  if (!cryptoAvailable()) throw new Error("crypto_unavailable");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`lovecan:open:v1:${key}`),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function encryptJson(
  keyB64: string,
  value: unknown,
  additionalData: string,
): Promise<string> {
  if (!cryptoAvailable()) throw new Error("crypto_unavailable");
  const key = await crypto.subtle.importKey(
    "raw",
    toBuffer(base64UrlToBytes(keyB64)),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = randomBytes(12);
  const cipher = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toBuffer(iv),
      additionalData: encoder.encode(additionalData),
    },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(cipher), iv.length);
  return bytesToBase64Url(combined);
}

export async function decryptJson<T>(
  keyB64: string,
  payload: string,
  additionalData: string,
): Promise<T> {
  if (!cryptoAvailable()) throw new Error("crypto_unavailable");
  const bytes = base64UrlToBytes(payload);
  if (bytes.length < 29) throw new Error("ciphertext_invalid");
  const key = await crypto.subtle.importKey(
    "raw",
    toBuffer(base64UrlToBytes(keyB64)),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toBuffer(bytes.slice(0, 12)),
      additionalData: encoder.encode(additionalData),
    },
    key,
    toBuffer(bytes.slice(12)),
  );
  return JSON.parse(decoder.decode(plain)) as T;
}

export async function contentDigest(parts: string[]): Promise<string> {
  return sha256Hex(parts.join("\u0000"));
}
