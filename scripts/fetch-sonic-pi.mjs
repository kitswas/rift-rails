// Pin the Sonic Pi web runtime assets used by src/game/sonicPi.ts.
// Source: sonic-pi.net v5.1 web beta (AGPL-3.0-or-later).
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ORIGIN = "https://sonic-pi.net";
const OUT = "public/sonic-pi";
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

for (const file of FILES) {
  const dest = join(OUT, file);
  if (
    await stat(dest).then(
      () => true,
      () => false,
    )
  )
    continue;
  const response = await fetch(`${ORIGIN}/${file}`);
  if (!response.ok) throw new Error(`${file}: ${response.status} ${response.statusText}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await mkdir(join(dest, ".."), { recursive: true });
  await writeFile(dest, bytes);
  console.log(`${file} ${bytes.length}`);
}
