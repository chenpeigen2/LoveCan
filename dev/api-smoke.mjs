import { readFile } from "node:fs/promises";

const BASE = process.env.LOVECAN_BASE ?? "http://127.0.0.1:5175/functions/v1/app";

const enc = new TextEncoder();
const b64url = (bytes) =>
  Buffer.from(bytes).toString("base64url");
const randomToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
const randomId = () => b64url(crypto.getRandomValues(new Uint8Array(9)));
const sha256Hex = async (value) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value)))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
const digest = (parts) => sha256Hex(parts.join("\u0000"));

let failures = 0;
const check = (label, condition, detail = "") => {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

async function call(action, { method = "POST", body, headers = {} } = {}) {
  const response = await fetch(`${BASE}?action=${action}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: response.status, json, headers: response.headers };
}

async function buildCan(offsetSeconds) {
  const key = randomToken();
  const ownerToken = randomToken();
  const openToken = randomToken();
  const id = randomId();
  const labelCiphertext = b64url(crypto.getRandomValues(new Uint8Array(96)));
  const contentCiphertext = b64url(crypto.getRandomValues(new Uint8Array(512)));
  const unlockAt = new Date(Date.now() + offsetSeconds * 1000).toISOString();
  const skin = "spring";
  const ownerHash = await sha256Hex(ownerToken);
  const openHash = await sha256Hex(openToken);
  const requestHash = await digest([
    id,
    labelCiphertext,
    contentCiphertext,
    unlockAt,
    skin,
    ownerHash,
    openHash,
  ]);
  return {
    id,
    ownerToken,
    openToken,
    unlockAt,
    payload: {
      id,
      labelCiphertext,
      contentCiphertext,
      unlockAt,
      skin,
      ownerHash,
      openHash,
      requestHash,
    },
  };
}

console.log("create / replay / sealed state");
const can = await buildCan(48);
const created = await call("create", { body: can.payload });
check("create returns 201", created.status === 201, JSON.stringify(created.json));
check("create hides ciphertext", !("contentCiphertext" in (created.json ?? {})));
const replay = await call("create", { body: can.payload });
check("replay is idempotent", replay.status === 200 && replay.json?.replayed === true);

const tampered = { ...can.payload, id: randomId() };
tampered.requestHash = await digest([
  tampered.id,
  tampered.labelCiphertext,
  tampered.contentCiphertext,
  tampered.unlockAt,
  tampered.skin,
  tampered.ownerHash,
  tampered.openHash,
]);
tampered.labelCiphertext = b64url(crypto.getRandomValues(new Uint8Array(96)));
check(
  "tampered digest rejected",
  (await call("create", { body: tampered })).status === 400,
);

const sealedGet = await call(`can&id=${can.id}`, { method: "GET" });
check("sealed state", sealedGet.json?.can?.state === "sealed", JSON.stringify(sealedGet.json));
check("sealed label present", Boolean(sealedGet.json?.can?.labelCiphertext));
check(
  "sealed content absent",
  !("contentCiphertext" in (sealedGet.json?.can ?? {})),
);
check(
  "no-store header",
  sealedGet.headers.get("cache-control") === "no-store",
);
check(
  "wrong owner header forbidden",
  (await call(`can&id=${can.id}`, {
    method: "GET",
    headers: { "x-lovecan-owner": randomToken() },
  })).status === 403,
);
check(
  "owner header accepted",
  (await call(`can&id=${can.id}`, {
    method: "GET",
    headers: { "x-lovecan-owner": can.ownerToken },
  })).status === 200,
);
check(
  "unknown can 404",
  (await call(`can&id=${randomId()}`, { method: "GET" })).status === 404,
);
check(
  "wrong method 405",
  (await call("create", { method: "GET" })).status === 405,
);

const lockedOpen = await call("open", {
  body: { id: can.id, openToken: can.openToken },
});
check("open before unlock is 423", lockedOpen.status === 423, JSON.stringify(lockedOpen.json));
check("locked response has no ciphertext", !("contentCiphertext" in (lockedOpen.json ?? {})));

console.log("revoke before unlock");
const revoked = await buildCan(600);
const revokedCreated = await call("create", { body: revoked.payload });
check("second can created", revokedCreated.status === 201, JSON.stringify(revokedCreated.json));
check(
  "revoke needs owner",
  (await call("revoke", {
    body: { id: revoked.id },
    headers: { "x-lovecan-owner": randomToken() },
  })).status === 403,
);
const revokedOk = await call("revoke", {
  body: { id: revoked.id },
  headers: { "x-lovecan-owner": revoked.ownerToken },
});
check("revoke returns 200", revokedOk.status === 200, JSON.stringify(revokedOk.json));
const revokedGet = await call(`can&id=${revoked.id}`, { method: "GET" });
check("revoked tombstone", revokedGet.json?.can?.state === "revoked");
check("revoked label erased", revokedGet.json?.can?.labelCiphertext === "");
check(
  "revoked open is 410",
  (await call("open", {
    body: { id: revoked.id, openToken: revoked.openToken },
  })).status === 410,
);
const revokedRecord = JSON.parse(
  await readFile(`.local-storage/cans/${revoked.id}.json`, "utf8"),
);
check(
  "revoked ciphertext erased on disk",
  revokedRecord.labelCiphertext === "" && revokedRecord.contentCiphertext === null,
);

console.log("waiting for unlock…");
const waitMs = new Date(can.unlockAt).getTime() - Date.now() + 1200;
if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));

check(
  "wrong open token forbidden",
  (await call("open", {
    body: { id: can.id, openToken: randomToken() },
  })).status === 403,
);
const readyGet = await call(`can&id=${can.id}`, { method: "GET" });
check("ready state", readyGet.json?.can?.state === "ready", JSON.stringify(readyGet.json?.can?.state));
const opened = await call("open", {
  body: { id: can.id, openToken: can.openToken },
});
check("open after unlock returns ciphertext", opened.status === 200, JSON.stringify(opened.json));
check(
  "returned ciphertext matches",
  opened.json?.contentCiphertext === can.payload.contentCiphertext,
);
check("openedAt set", Boolean(opened.json?.openedAt));
const openedAgain = await call("open", {
  body: { id: can.id, openToken: can.openToken },
});
check("open is idempotent", openedAgain.status === 200 && openedAgain.json?.openedAt === opened.json?.openedAt);
check(
  "revoke after open is 409",
  (await call("revoke", {
    body: { id: can.id },
    headers: { "x-lovecan-owner": can.ownerToken },
  })).status === 409,
);
const afterGet = await call(`can&id=${can.id}`, { method: "GET" });
check("opened state", afterGet.json?.can?.state === "opened");

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} checks failed`);
process.exitCode = failures === 0 ? 0 : 1;
