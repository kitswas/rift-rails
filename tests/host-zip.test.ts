import { describe, expect, it, vi } from "vitest";
import { PluginHost } from "../src/game/host";
import type { HostDeps } from "../src/game/workerProtocol";

function makeHost(): PluginHost {
  const deps = {
    voyage: {},
    registry: {},
    log: vi.fn(),
    events: { on: vi.fn() },
  } as unknown as HostDeps;
  return new PluginHost(deps);
}

describe("PluginHost.loadZip", () => {
  it("rejects non-zip bytes with a clear error", async () => {
    const host = makeHost();
    const bytes = new TextEncoder().encode("<!doctype html><html>fallback</html>").buffer;
    await expect(host.loadZip(bytes)).rejects.toThrow("plugin response is not a zip archive");
  });
});
