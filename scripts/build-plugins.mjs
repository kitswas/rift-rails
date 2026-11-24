// Build plugin zips from TypeScript sources. Deterministic: fixed entry order,
// fixed timestamps, unix platform attributes, level-9 deflate. Committed zips
// are verified fresh by CI (pnpm plugins:build + git diff --exit-code).
import { build } from "esbuild";
import JSZip from "jszip";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PLUGINS = [
  "rift-salvager",
  "field-repair",
  "corvus-tutorial",
  "rail-keeper",
  "glass-courier",
];
const ZIP_DATE = new Date(Date.UTC(2000, 0, 1));
const plugins = [];

for (const id of PLUGINS) {
  const result = await build({
    entryPoints: [join("packages", id, "main.ts")],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    write: false,
    logLevel: "warning",
  });
  const code = result.outputFiles[0].text;
  const manifest = readFileSync(join("packages", id, "manifest.json"), "utf8");
  const meta = JSON.parse(manifest);

  const zip = new JSZip();
  zip.file("main.js", code, { date: ZIP_DATE });
  zip.file("manifest.json", manifest, { date: ZIP_DATE });
  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    platform: "unix",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  const out = join("public", "plugins", `${id}.zip`);
  writeFileSync(out, buffer);
  console.log(`built ${out}`);

  plugins.push({
    id: meta.id,
    name: meta.name,
    version: meta.version,
    description: meta.description,
    defaultEnabled: meta.defaultEnabled,
    source: `./${id}.zip`,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    minApi: meta.minApi,
    permissions: meta.permissions,
  });
}

writeFileSync(
  join("public", "plugins", "registry.json"),
  `${JSON.stringify({ version: 1, plugins }, null, 2)}\n`,
);
