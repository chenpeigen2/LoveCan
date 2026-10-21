import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ORIGIN = process.env.LOVECAN_ORIGIN ?? "https://lovecan-3qpucev7hd9.qoder.zone";
const BASE = `${ORIGIN}/functions/v1/app`;
const headers = {
  "content-type": "application/json",
  origin: ORIGIN,
  "sec-fetch-site": "same-origin",
};

const token = (bytes = 32) => randomBytes(bytes).toString("base64url");
const sha256Hex = (value) => createHash("sha256").update(value).digest("hex");

function encryptJson(key, value, aad) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "base64url"), iv);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return Buffer.concat([iv, encrypted]).toString("base64url");
}

function decryptJson(key, payload, aad) {
  const bytes = Buffer.from(payload, "base64url");
  const iv = bytes.subarray(0, 12);
  const tag = bytes.subarray(bytes.length - 16);
  const ciphertext = bytes.subarray(12, bytes.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(key, "base64url"), iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"));
}

async function call(action, init = {}) {
  const response = await fetch(`${BASE}?action=${action}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

const key = token();
const ownerToken = token();
const openToken = createHash("sha256").update(`lovecan:open:v1:${key}`).digest("base64url");
const ownerHash = sha256Hex(ownerToken);
const openHash = sha256Hex(openToken);
const id = token(9);
const now = Date.now();
const createdAt = new Date(now).toISOString();
const unlockAt = new Date(now + 48_000).toISOString();

const label = { v: 1, senderName: "线上验收", recipientName: "阿禾", labelLine: "拆开看看", createdAt };
const content = {
  v: 1,
  letter: "这是一封从线上罐头里拆出来的信。\n\n服务器在到期之前没有交出它。",
  audio: null,
};
const labelCiphertext = encryptJson(key, label, "lovecan:label:v1");
const contentCiphertext = encryptJson(key, content, "lovecan:content:v1");
const requestHash = sha256Hex(
  [id, labelCiphertext, contentCiphertext, unlockAt, "spring", ownerHash, openHash].join("\u0000"),
);

const created = await call("create", {
  method: "POST",
  body: JSON.stringify({
    id,
    labelCiphertext,
    contentCiphertext,
    unlockAt,
    skin: "spring",
    ownerHash,
    openHash,
    requestHash,
  }),
});
if (created.status !== 201) throw new Error(`create ${created.status} ${JSON.stringify(created.body)}`);

const getCan = async () =>
  (await fetch(`${BASE}?action=can&id=${id}`, { headers })).json();
const sealedCan = await getCan();
if (sealedCan.can.state !== "sealed") throw new Error(`unexpected state ${sealedCan.can.state}`);
if (sealedCan.can.contentCiphertext) throw new Error("content leaked before unlock");
const sealedLabel = decryptJson(key, sealedCan.can.labelCiphertext, "lovecan:label:v1");
if (sealedLabel.recipientName !== "阿禾") throw new Error("label did not decrypt");

const early = await call("open", {
  method: "POST",
  body: JSON.stringify({ id, openToken }),
});
if (early.status !== 423) throw new Error(`expected 423, got ${early.status} ${JSON.stringify(early.body)}`);

console.log(JSON.stringify({ step: "sealed+locked", id, share: `${ORIGIN}/c/${id}/#${key}` }));

const waitMs = Math.max(0, new Date(unlockAt).getTime() - Date.now() + 1800);
await new Promise((resolve) => setTimeout(resolve, waitMs));

const opened = await call("open", {
  method: "POST",
  body: JSON.stringify({ id, openToken }),
});
if (opened.status !== 200) throw new Error(`open ${opened.status} ${JSON.stringify(opened.body)}`);
const openedContent = decryptJson(key, opened.body.contentCiphertext, "lovecan:content:v1");
if (!openedContent.letter.includes("到期")) throw new Error("letter did not decrypt");

const after = await getCan();
if (after.can.state !== "opened") throw new Error(`unexpected state ${after.can.state}`);
if (after.can.openedAt !== opened.body.openedAt) throw new Error("openedAt mismatch");

const wrong = await call("open", {
  method: "POST",
  body: JSON.stringify({ id, openToken: token() }),
});
if (wrong.status !== 403) throw new Error(`expected 403, got ${wrong.status}`);

console.log(
  JSON.stringify(
    {
      step: "opened",
      id,
      status: opened.status,
      openedAt: opened.body.openedAt,
      state: after.can.state,
      share: `${ORIGIN}/c/${id}/#${key}`,
      manage: `${ORIGIN}/m/${id}/#${ownerToken}.${key}`,
      letter: openedContent.letter,
      checks: {
        create: created.status,
        sealedLabel: "ok",
        contentHiddenWhileSealed: true,
        openBeforeUnlock: early.status,
        openAfterUnlock: opened.status,
        wrongKey: wrong.status,
      },
    },
    null,
    2,
  ),
);
