import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginHost } from "../src/game/host";
import type { PluginRegistry, PluginRegistryEntry } from "../src/game/pluginRegistry";
import { parseManifest } from "../src/game/manifest";
import { ENABLED_KEY, loadRegistryPlugins, readEnabled } from "../src/ui/panels";

const ZERO_HASH = "0".repeat(64);
const REGISTRY_URL = "http://localhost/plugins/registry.json";

function entry(id: string, defaultEnabled: boolean): PluginRegistryEntry {
  return {
    id,
    name: id,
    version: "1.0.0",
    description: `Test plugin ${id}`,
    defaultEnabled,
    source: `./${id}.zip`,
    sha256: ZERO_HASH,
    minApi: 4,
    permissions: [],
  };
}

const registry: PluginRegistry = {
  version: 1,
  plugins: [entry("alpha", true), entry("beta", false)],
};

async function makeZip(id: string, permissions: string[] = []): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    "manifest.json",
    JSON.stringify({
      id,
      name: id,
      version: "1.0.0",
      minApi: 4,
      entry: "main.js",
      permissions,
    }),
  );
  zip.file("main.js", "export default { mount(){}, unmount(){} };");
  return zip.generateAsync({ type: "arraybuffer" });
}

function makeHost(): { host: PluginHost; loaded: string[] } {
  const loaded: string[] = [];
  const host = {
    isPluginActive: (id: string) => loaded.includes(id),
    waitUntilReady: async () => {},
    loadZip: async (bytes: ArrayBuffer) => {
      const zip = await JSZip.loadAsync(bytes);
      const file = zip.file("manifest.json");
      if (!file) throw new Error("manifest.json missing");
      const manifest = parseManifest(JSON.parse(await file.async("string")) as unknown);
      loaded.push(manifest.id);
      return manifest;
    },
    disable: vi.fn(),
    waitUntilStopped: async () => {},
    listPlugins: () => [],
  } as unknown as PluginHost;
  return { host, loaded };
}

function stubFetch(buf: ArrayBuffer): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => buf })),
  );
}

function stubDigest(hash: string): void {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hash.slice(i * 2, i * 2 + 2), 16);
  }
  vi.stubGlobal("crypto", { subtle: { digest: async () => bytes.buffer } });
}

describe("loadRegistryPlugins", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("enables compatible defaults on first run", async () => {
    stubFetch(await makeZip("alpha"));
    stubDigest(ZERO_HASH);
    const { host, loaded } = makeHost();
    const logs: string[] = [];

    expect(
      await loadRegistryPlugins(host, { onLog: (m) => logs.push(m) }, registry, REGISTRY_URL),
    ).toEqual(["alpha"]);
    expect(loaded).toEqual(["alpha"]);
    expect(readEnabled()).toEqual(["alpha"]);
    expect(logs).toEqual([]);
  });

  it("respects a stored selection on later runs", async () => {
    localStorage.setItem(ENABLED_KEY, JSON.stringify(["beta"]));
    stubFetch(await makeZip("beta"));
    stubDigest(ZERO_HASH);
    const { host } = makeHost();

    expect(await loadRegistryPlugins(host, { onLog: () => {} }, registry, REGISTRY_URL)).toEqual([
      "beta",
    ]);
    expect(readEnabled()).toEqual(["beta"]);
  });

  it("rejects a hash mismatch and leaves the plugin disabled", async () => {
    localStorage.setItem(ENABLED_KEY, JSON.stringify(["alpha"]));
    stubFetch(await makeZip("alpha"));
    stubDigest("1".repeat(64));
    const { host, loaded } = makeHost();
    const logs: string[] = [];

    expect(
      await loadRegistryPlugins(host, { onLog: (m) => logs.push(m) }, registry, REGISTRY_URL),
    ).toEqual([]);
    expect(loaded).toEqual([]);
    expect(logs[0]).toContain("sha256 mismatch: alpha");
  });

  it("rejects a zip whose manifest id differs from the registry entry", async () => {
    localStorage.setItem(ENABLED_KEY, JSON.stringify(["alpha"]));
    stubFetch(await makeZip("other"));
    stubDigest(ZERO_HASH);
    const { host, loaded } = makeHost();
    const logs: string[] = [];

    expect(
      await loadRegistryPlugins(host, { onLog: (m) => logs.push(m) }, registry, REGISTRY_URL),
    ).toEqual([]);
    expect(loaded).toEqual([]);
    expect(logs[0]).toContain("manifest id mismatch for alpha");
  });

  it("rejects a manifest whose permissions differ from the registry", async () => {
    localStorage.setItem(ENABLED_KEY, JSON.stringify(["alpha"]));
    stubFetch(await makeZip("alpha", ["*"]));
    stubDigest(ZERO_HASH);
    const { host, loaded } = makeHost();
    const logs: string[] = [];

    expect(
      await loadRegistryPlugins(host, { onLog: (m) => logs.push(m) }, registry, REGISTRY_URL),
    ).toEqual([]);
    expect(loaded).toEqual([]);
    expect(logs[0]).toContain("manifest permissions mismatch for alpha");
  });
});
