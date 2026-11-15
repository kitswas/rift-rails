// @ts-expect-error - @types/node is not installed in this repo (see tests/e2e/plugins.spec.ts)
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { isCompatible, parseManifest } from "../src/game/manifest";
import { HOST_API_VERSION } from "../src/game/workerProtocol";

describe("corvus-tutorial bundle", () => {
  it("ships manifest.json and main.js matching the sources", async () => {
    const zip = await JSZip.loadAsync(readFileSync("public/plugins/corvus-tutorial.zip"));
    const names = Object.keys(zip.files).filter((name) => !zip.files[name]?.dir);
    expect(names.sort()).toEqual(["main.js", "manifest.json"]);

    const zippedManifest = await zip.file("manifest.json")?.async("text");
    const zippedMain = await zip.file("main.js")?.async("text");
    const sourceManifest = readFileSync("packages/corvus-tutorial/manifest.json", "utf8");
    const sourceMain = readFileSync("packages/corvus-tutorial/main.js", "utf8");
    expect(zippedManifest).toBe(sourceManifest);
    expect(zippedMain).toBe(sourceMain);

    const manifest = parseManifest(JSON.parse(zippedManifest ?? "{}"));
    expect(manifest.id).toBe("corvus-tutorial");
    expect(manifest.minApi).toBe(HOST_API_VERSION);
    expect(isCompatible(manifest)).toBe(true);
  });
});
