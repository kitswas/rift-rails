import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const artifacts = path.join(root, "artifacts");
const resultPath = path.join(artifacts, "verify-result.json");
const port = Number(process.env.VERIFY_PORT || 8123);
const debugPort = Number(process.env.VERIFY_DEBUG_PORT || 9344);
const MAX_RESULT_BYTES = 64 * 1024;
const RESULT_FIELDS = new Set(["pass", "total", "error"]);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
};

const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
try {
  execFileSync("pnpm", ["build"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
} catch (err) {
  const code =
    err && typeof err === "object" ? /** @type {{ code?: unknown, status?: unknown }} */ (err) : {};
  // shell:true on win32 surfaces a missing pnpm as exit status 9009, elsewhere as ENOENT.
  if (code.code === "ENOENT" || code.status === 9009) {
    throw new Error(`${pnpmBin} not found, run pnpm install`, { cause: err });
  }
  throw err;
}

fs.mkdirSync(path.join(dist, "artifacts"), { recursive: true });
fs.copyFileSync(
  path.join(artifacts, "verify_nav.html"),
  path.join(dist, "artifacts", "verify_nav.html"),
);
fs.rmSync(resultPath, { force: true });

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/result") {
    let body = "";
    let received = 0;
    let exceeded = false;
    for await (const chunk of req) {
      received += chunk.length;
      if (received > MAX_RESULT_BYTES) {
        exceeded = true;
        break;
      }
      body += chunk;
    }
    if (exceeded) {
      res.writeHead(413, { "content-type": "text/plain", connection: "close" });
      res.end("payload too large");
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("invalid JSON");
      return;
    }
    const isPlainObject =
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      (Object.getPrototypeOf(parsed) === Object.prototype ||
        Object.getPrototypeOf(parsed) === null);
    const keys = isPlainObject ? Object.keys(parsed) : [];
    const onlyKnownFields = keys.every((key) => RESULT_FIELDS.has(key));
    const hasNumericPassTotal =
      typeof parsed?.pass === "number" &&
      Number.isFinite(parsed.pass) &&
      typeof parsed?.total === "number" &&
      Number.isFinite(parsed.total);
    const hasStringError = typeof parsed?.error === "string";
    if (
      !isPlainObject ||
      !onlyKnownFields ||
      !(hasNumericPassTotal || hasStringError) ||
      "pass" in parsed !== "total" in parsed
    ) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("invalid result payload");
      return;
    }

    fs.mkdirSync(artifacts, { recursive: true });
    fs.writeFileSync(resultPath, body);
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }

  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url || "/", "http://x").pathname);
  } catch {
    res.writeHead(400, { "content-type": "text/plain" });
    res.end("bad request");
    return;
  }
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const file = path.resolve(dist, rel);
  const relToDist = path.relative(dist, file);
  const insideDist = relToDist !== "" && !relToDist.startsWith("..") && !path.isAbsolute(relToDist);
  if (!insideDist || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": mime[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

const edgeCandidates = [
  process.env.EDGE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);
const edge = edgeCandidates.find((candidate) => fs.existsSync(candidate));
if (!edge) throw new Error("Edge not found; set EDGE_PATH");

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "edge-verify-"));
const child = spawn(
  edge,
  [
    "--headless=new",
    "--disable-gpu",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    `http://127.0.0.1:${port}/artifacts/verify_nav.html`,
  ],
  { stdio: "ignore" },
);

try {
  const deadline = Date.now() + 30000;
  while (!fs.existsSync(resultPath) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!fs.existsSync(resultPath)) throw new Error("verify result not written");

  let result = null;
  try {
    result = JSON.parse(fs.readFileSync(resultPath, "utf8"));
  } catch {
    // treated as failure below
  }
  const isRecord = result !== null && typeof result === "object" && !Array.isArray(result);
  const pass = isRecord ? result.pass : undefined;
  const total = isRecord ? result.total : undefined;
  const valid =
    isRecord &&
    Number.isInteger(pass) &&
    Number.isInteger(total) &&
    total > 0 &&
    pass === total &&
    !Object.hasOwn(result, "error");

  console.log(`verify pass=${pass} total=${total}`);
  if (isRecord && Array.isArray(result.results)) {
    for (const item of result.results) {
      if (item && !item.ok) console.log(`FAIL ${item.name}: ${item.detail}`);
    }
  }
  if (!valid) {
    const reason =
      isRecord && typeof result.error === "string"
        ? `error: ${result.error}`
        : "missing or mismatched pass/total in verify result";
    console.log(`FAIL ${reason}`);
    process.exitCode = 1;
  }
} finally {
  child.kill();
  server.close();
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch {
    // Edge may still hold the profile briefly; temp dir cleanup is best-effort.
  }
}
