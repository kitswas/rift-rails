// Guard documentation drift: unique headings, resolvable local links, and no
// references to APIs removed from the codebase. Run via `pnpm check:docs`.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = process.cwd();
const docsDir = join(root, "docs");
const markdownIn = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => join(dir, entry.name))
    : [];

const files = [...markdownIn(root), ...markdownIn(docsDir)];
const removed = [
  "BUNDLED_PLUGINS",
  "loadBundledPlugins",
  "rehydratePlugins",
  "rift.plugins.zips",
  "plugin-file",
  "Install .zip",
];
const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
const failures = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const rel = file.slice(root.length + 1).replace(/\\/g, "/");
  const headings = new Set();
  for (const line of text.split(/\r?\n/)) {
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    if (!heading) continue;
    const name = heading[1].trim();
    const key = name.toLowerCase();
    if (headings.has(key)) failures.push(`${rel}: duplicate heading "${name}"`);
    headings.add(key);
  }
  for (const match of text.matchAll(linkPattern)) {
    const target = match[1].trim();
    if (/^(https?:|mailto:|#)/.test(target) || target.includes("://")) continue;
    const raw = target.split("#")[0].split("?")[0].split(/\s+/)[0];
    if (!raw) continue;
    let path;
    try {
      path = decodeURIComponent(raw);
    } catch {
      failures.push(`${rel}: malformed link "${target}"`);
      continue;
    }
    if (!existsSync(resolve(dirname(file), path))) {
      failures.push(`${rel}: broken link "${target}"`);
    }
  }
  for (const token of removed) {
    if (text.includes(token)) failures.push(`${rel}: removed API "${token}"`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log(`docs ok: ${files.length} files`);
}
