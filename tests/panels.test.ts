import { afterEach, describe, expect, it, vi } from "vitest";
import { ENABLED_KEY, loadBundledPlugins, readEnabled } from "../src/ui/panels";
import type { PluginHost } from "../src/game/host";

describe("plugin enablement migration", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("ignores removed bundled plugins but preserves user-installed plugin IDs", () => {
    localStorage.setItem(
      ENABLED_KEY,
      JSON.stringify(["black-market", "sample-plugin", "my-plugin", "corvus-tutorial"]),
    );

    expect(readEnabled()).toEqual(["my-plugin", "corvus-tutorial"]);
  });

  it("loads new bundled plugins while preserving Corvus after a retired-plugin upgrade", async () => {
    localStorage.setItem(ENABLED_KEY, JSON.stringify(["black-market", "corvus-tutorial"]));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        status: 200,
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode(url).buffer,
      })),
    );
    const host = {
      isPluginActive: () => false,
      loadZip: async (bytes: ArrayBuffer) => {
        const url = new TextDecoder().decode(bytes);
        return { id: url.split("/").at(-1)?.replace(".zip", "") ?? "" };
      },
    } as unknown as PluginHost;

    const loaded = await loadBundledPlugins(host, { onLog: () => {} });

    expect(loaded).toEqual(["rift-salvager", "field-repair", "corvus-tutorial"]);
    expect(readEnabled()).toEqual(["corvus-tutorial", "rift-salvager", "field-repair"]);
  });
});
