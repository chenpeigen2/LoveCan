import { createCipheriv, createHash, randomBytes } from "node:crypto";

const BASE = process.env.LOVECAN_BASE ?? "http://127.0.0.1:5175/functions/v1/app";
const MIME = "audio/wav";

const token = (bytes = 32) => randomBytes(bytes).toString("base64url");
const sha256Hex = (value) => createHash("sha256").update(value).digest("hex");

function encryptJson(key, value, aad) {
  const keyBytes = Buffer.from(key, "base64url");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes, iv);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return Buffer.concat([iv, encrypted]).toString("base64url");
}

function makeWav(seconds = 3.2, sampleRate = 22050) {
  const samples = Math.floor(seconds * sampleRate);
  const data = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index += 1) {
    const time = index / sampleRate;
    const envelope = Math.min(1, time / 0.25, (seconds - time) / 0.35);
    const tone =
      Math.sin(2 * Math.PI * 196 * time) * 0.5 +
      Math.sin(2 * Math.PI * 293.66 * time) * 0.24 +
      Math.sin(2 * Math.PI * 392 * time) * 0.12;
    data.writeInt16LE(Math.round(tone * envelope * 12000), index * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const key = token();
const ownerToken = token();
const keyHashInput = `lovecan:open:v1:${key}`;
const openToken = createHash("sha256").update(keyHashInput).digest("base64url");
const ownerHash = sha256Hex(ownerToken);
const openHash = sha256Hex(openToken);
const id = token(9);
const now = Date.now();
const createdAt = new Date(now).toISOString();
const unlockAt = new Date(now + 55_000).toISOString();

const labelPayload = {
  v: 1,
  senderName: "小满",
  recipientName: "阿禾",
  labelLine: "听见我",
  createdAt,
};
const audio = {
  mime: MIME,
  base64: makeWav().toString("base64"),
  duration: 3,
};
const contentPayload = {
  v: 1,
  letter:
    "阿禾：\n\n如果这封信到的时候，你刚好在回家的路上，就慢一点走。\n\n我录了一段声音给你。不长，只够说一句：这一年辛苦了。\n\n小满",
  audio,
};

const labelCiphertext = encryptJson(key, labelPayload, "lovecan:label:v1");
const contentCiphertext = encryptJson(key, contentPayload, "lovecan:content:v1");
const requestHash = sha256Hex(
  [id, labelCiphertext, contentCiphertext, unlockAt, "night", ownerHash, openHash].join("\u0000"),
);

const response = await fetch(`${BASE}?action=create`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    id,
    labelCiphertext,
    contentCiphertext,
    unlockAt,
    skin: "night",
    ownerHash,
    openHash,
    requestHash,
  }),
});
const body = await response.json();
if (!response.ok) {
  console.error(body);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: response.status,
      unlockAt,
      unlockInSeconds: Math.round((new Date(unlockAt).getTime() - Date.now()) / 1000),
      sizeBytes: contentCiphertext.length,
      share: `http://127.0.0.1:5175/c/${id}#${key}`,
      manage: `http://127.0.0.1:5175/m/${id}#${ownerToken}.${key}`,
    },
    null,
    2,
  ),
);
