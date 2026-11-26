// Refresh the vendored Sonic Pi web runtime used by src/game/sonicPi.ts.
// Source: sonic-pi.net v5.1 web beta. Commit byte changes together with an
// updated public/sonic-pi/SHA256SUMS so CI can verify the runtime stays offline.
// `--dry-run` verifies the committed files without network access.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ORIGIN = "https://sonic-pi.net";
const OUT = "public/sonic-pi";
const MANIFEST = join(OUT, "SHA256SUMS");
const TIMEOUT_MS = 15000;

const FILES = [
  "sonic_pi.js",
  "runtime.js",
  "live-core.js",
  "live-worker.js",
  "osc.js",
  "gui-stream.js",
  "engine/supersonic.js",
  "engine/version.json",
  "engine/osc_channel.js",
  "engine/osc_in_pump.js",
  "engine/midi_event.js",
  "engine/metrics_component.js",
  "runtime/sp_runtime.wasm",
  "runtime/sp_runtime.mjs",
  "samples.json",
  "buffers/rand-stream.wav",
  "synthdefs/sonic-pi-winwood_lead.scsyndef",
];

const dryRun = process.argv.includes("--dry-run");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function expectedHashes() {
  const text = await readFile(MANIFEST, "utf8");
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length === 2) map.set(fields[1], fields[0]);
  }
  return map;
}

if (dryRun) {
  const expected = await expectedHashes();
  const failures = [];
  if ([...expected.keys()].sort().join("\n") !== [...FILES].sort().join("\n")) {
    failures.push(`SHA256SUMS does not list exactly ${FILES.length} runtime files`);
  }
  for (const file of FILES) {
    let bytes;
    try {
      bytes = await readFile(join(OUT, file));
    } catch {
      failures.push(`${file}: missing`);
      continue;
    }
    if (expected.get(file) !== sha256(bytes)) failures.push(`${file}: hash mismatch`);
  }
  if (failures.length) {
    for (const failure of failures) console.error(failure);
    process.exitCode = 1;
  } else {
    console.log(`sonic-pi offline check ok: ${FILES.length} files`);
  }
} else {
  const expected = await expectedHashes();
  let drift = 0;
  for (const file of FILES) {
    const response = await fetch(`${ORIGIN}/${file}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`${file}: ${response.status} ${response.statusText}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const dest = join(OUT, file);
    await mkdir(join(dest, ".."), { recursive: true });
    await writeFile(dest, bytes);
    const matches = expected.get(file) === sha256(bytes);
    if (!matches) drift++;
    console.log(`${file} ${bytes.length} ${matches ? "ok" : "DRIFT"}`);
  }
  if (drift > 0) {
    console.log(`${drift} file(s) differ from SHA256SUMS; review before updating the manifest.`);
    process.exitCode = 1;
  }
}
