import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const artifacts = path.join(root, "artifacts");
const resultPath = path.join(artifacts, "verify-result.json");
const port = Number(process.env.VERIFY_PORT || 8100);
const debugPort = Number(process.env.VERIFY_DEBUG_PORT || 9344);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
};

execFileSync("pnpm", ["build"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});

fs.mkdirSync(path.join(dist, "artifacts"), { recursive: true });
fs.copyFileSync(
  path.join(artifacts, "verify_nav.html"),
  path.join(dist, "artifacts", "verify_nav.html"),
);
fs.rmSync(resultPath, { force: true });

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/result") {
    let body = "";
    for await (const chunk of req) body += chunk;
    fs.mkdirSync(artifacts, { recursive: true });
    fs.writeFileSync(resultPath, body);
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }

  const urlPath = decodeURIComponent(new URL(req.url || "/", "http://x").pathname);
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const file = path.resolve(dist, rel);
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
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
  const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));
  console.log(`verify pass=${result.pass} total=${result.total}`);
  for (const item of result.results || []) {
    if (!item.ok) console.log(`FAIL ${item.name}: ${item.detail}`);
  }
  if (result.pass !== result.total) process.exitCode = 1;
} finally {
  child.kill();
  server.close();
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch {
    // Edge may still hold the profile briefly; temp dir cleanup is best-effort.
  }
}
