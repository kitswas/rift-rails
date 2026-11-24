import { describe, expect, it, vi } from "vitest";
import {
  downloadVerifiedPlugin,
  isEntryCompatible,
  loadPluginRegistry,
  resolveRegistrySource,
  validatePluginRegistry,
} from "../src/game/pluginRegistry";
import type { PluginRegistry, PluginRegistryEntry } from "../src/game/pluginRegistry";
import { HOST_API_VERSION, MIN_SUPPORTED_API_VERSION } from "../src/game/workerProtocol";

const REGISTRY_URL = "https://example.test/plugins/registry.json";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

function makeEntry(overrides: Partial<PluginRegistryEntry> = {}): PluginRegistryEntry {
  return {
    id: "alpha-plugin",
    name: "Alpha Plugin",
    version: "1.0.0",
    description: "First test plugin",
    defaultEnabled: true,
    source: "./alpha.zip",
    sha256: SHA_A,
    minApi: HOST_API_VERSION,
    permissions: ["voyage:explore"],
    ...overrides,
  };
}

function makeRegistry(): PluginRegistry {
  return {
    version: 1,
    plugins: [
      makeEntry(),
      makeEntry({
        id: "beta-plugin",
        name: "Beta Plugin",
        description: "Second test plugin",
        source: "./beta.zip",
        sha256: SHA_B,
        defaultEnabled: false,
      }),
    ],
  };
}

describe("validatePluginRegistry", () => {
  it("accepts a valid two-entry registry", () => {
    const raw = makeRegistry();
    expect(validatePluginRegistry(raw)).toEqual(raw);
  });

  it("rejects a bad version", () => {
    const raw: Record<string, unknown> = { ...makeRegistry(), version: 2 };
    expect(validatePluginRegistry(raw)).toBeNull();
  });

  it("rejects duplicate ids", () => {
    const registry = makeRegistry();
    registry.plugins[1]!.id = registry.plugins[0]!.id;
    expect(validatePluginRegistry(registry)).toBeNull();
  });

  it("rejects a bad sha256", () => {
    const registry = makeRegistry();
    registry.plugins[0]!.sha256 = "A".repeat(64);
    expect(validatePluginRegistry(registry)).toBeNull();
  });

  it("rejects an unknown permission", () => {
    const registry = makeRegistry();
    registry.plugins[0]!.permissions = ["voyage:fly"];
    expect(validatePluginRegistry(registry)).toBeNull();
  });

  it("rejects a missing field", () => {
    const incomplete: Record<string, unknown> = { ...makeEntry() };
    delete incomplete.description;
    expect(validatePluginRegistry({ version: 1, plugins: [incomplete] })).toBeNull();
  });

  it("rejects unknown top-level keys", () => {
    expect(validatePluginRegistry({ ...makeRegistry(), extra: true })).toBeNull();
  });
});

describe("loadPluginRegistry", () => {
  it("loads through injected fetchJson with the absolute URL", async () => {
    const raw = makeRegistry();
    const fetchJson = vi.fn(async (_url: string): Promise<unknown> => raw);
    await expect(loadPluginRegistry(REGISTRY_URL, { fetchJson })).resolves.toEqual(raw);
    expect(fetchJson).toHaveBeenCalledWith(REGISTRY_URL);
  });

  it("throws on an invalid registry", async () => {
    const fetchJson = async (): Promise<unknown> => ({ version: 1, plugins: [] });
    await expect(loadPluginRegistry(REGISTRY_URL, { fetchJson })).rejects.toThrow(
      /invalid plugin registry/,
    );
  });
});

describe("resolveRegistrySource", () => {
  it("resolves a relative source against the registry URL", () => {
    expect(resolveRegistrySource("./alpha.zip", REGISTRY_URL)).toBe(
      "https://example.test/plugins/alpha.zip",
    );
  });

  it("rejects file: and data: sources", () => {
    expect(() => resolveRegistrySource("file:///etc/passwd", REGISTRY_URL)).toThrow(
      /unsupported plugin source scheme/,
    );
    expect(() => resolveRegistrySource("data:application/zip,AAAA", REGISTRY_URL)).toThrow(
      /unsupported plugin source scheme/,
    );
  });
});

describe("downloadVerifiedPlugin", () => {
  it("verifies a matching hash and fetches the resolved URL", async () => {
    const entry = makeEntry();
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const fetchBytes = vi.fn(async (_url: string): Promise<ArrayBuffer> => bytes);
    const digest = vi.fn(async (_buf: ArrayBuffer): Promise<string> => SHA_A);
    const result = await downloadVerifiedPlugin(entry, REGISTRY_URL, { fetchBytes, digest });
    expect(fetchBytes).toHaveBeenCalledWith("https://example.test/plugins/alpha.zip");
    expect(digest).toHaveBeenCalledWith(bytes);
    expect(result).toEqual({ entry, bytes });
  });

  it("throws on a hash mismatch", async () => {
    const entry = makeEntry();
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const fetchBytes = async (): Promise<ArrayBuffer> => bytes;
    const digest = async (): Promise<string> => SHA_B;
    await expect(
      downloadVerifiedPlugin(entry, REGISTRY_URL, { fetchBytes, digest }),
    ).rejects.toThrow(`sha256 mismatch: ${entry.id}`);
  });
});

describe("isEntryCompatible", () => {
  it("accepts the current API version", () => {
    expect(isEntryCompatible(makeEntry({ minApi: HOST_API_VERSION }))).toBe(true);
  });

  it("rejects a future minApi", () => {
    expect(isEntryCompatible(makeEntry({ minApi: HOST_API_VERSION + 1 }))).toBe(false);
  });

  it("rejects an unsupported old minApi", () => {
    expect(isEntryCompatible(makeEntry({ minApi: MIN_SUPPORTED_API_VERSION - 1 }))).toBe(false);
  });
});
