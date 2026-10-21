import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:net";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : "true"];
  }),
);

const url = args.url;
const out = args.out ?? "screenshot.png";
const width = Number(args.w ?? 1440);
const height = Number(args.h ?? 1100);
const media = args.media ?? "screen";
const full = args.full === "true";
const selector = args.selector ?? "";
const waitMs = Number(args.wait ?? 1600);
const evalExpression = args.eval ?? "";

const chrome = "C:/Users/peigen1.chen/AppData/Local/Google/Chrome/Application/chrome.exe";
const port = await new Promise((resolve) => {
  const server = createServer();
  server.listen(0, "127.0.0.1", () => {
    const assigned = server.address().port;
    server.close(() => resolve(assigned));
  });
});

const child = spawn(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=D:/code/LoveCan/.screenshots/cdp-${port}`,
    `--remote-debugging-port=${port}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let target;
for (let attempt = 0; attempt < 40; attempt += 1) {
  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/json/new?${encodeURIComponent("about:blank")}`,
      { method: "PUT" },
    );
    if (response.ok) {
      target = await response.json();
      break;
    }
  } catch {
    // Chrome is still starting.
  }
  await delay(250);
}
if (!target) {
  child.kill();
  throw new Error("cdp_target_unavailable");
}

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = () => reject(new Error("cdp_socket_failed"));
});

let sequence = 0;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  }
};

function send(method, params = {}) {
  sequence += 1;
  const id = sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return result.result?.value;
}

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width,
  height,
  deviceScaleFactor: 1,
  mobile: width < 500,
});
if (media !== "screen") {
  await send("Emulation.setEmulatedMedia", { media });
}

await send("Page.navigate", { url });
await delay(waitMs);

if (evalExpression) {
  console.log(JSON.stringify({ eval: await evaluate(evalExpression) }, null, 2));
}

let clip;
if (selector) {
  const rect = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    element.scrollIntoView({ block: "center" });
    const box = element.getBoundingClientRect();
    return {
      x: 0,
      y: box.top + window.scrollY,
      width: document.documentElement.clientWidth,
      height: box.height,
    };
  })()`);
  await delay(400);
  if (!rect) throw new Error(`selector_not_found:${selector}`);
  clip = { ...rect, scale: 1 };
} else if (full) {
  const metrics = await send("Page.getLayoutMetrics");
  const size = metrics.cssContentSize;
  clip = { x: 0, y: 0, width: size.width, height: size.height, scale: 1 };
}

const screenshot = await send("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: Boolean(clip),
  ...(clip ? { clip } : {}),
});
await writeFile(out, Buffer.from(screenshot.data, "base64"));
console.log(
  JSON.stringify({
    out,
    bytes: Buffer.byteLength(screenshot.data, "base64"),
    media,
    url,
    size: clip ? [Math.round(clip.width), Math.round(clip.height)] : [width, height],
  }),
);

socket.close();
child.kill();
