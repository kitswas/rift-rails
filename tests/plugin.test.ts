import { describe, expect, it, vi } from "vitest";
import { PluginHost, PLUGIN_SHUTDOWN_TIMEOUT_MS } from "../src/game/host";
import { isCompatible, ManifestError, parseManifest } from "../src/game/manifest";
import { Registry } from "../src/game/registry";
import { HOST_API_VERSION, MAX_GRANT_AMOUNT } from "../src/game/workerProtocol";
import type {
  GrantOp,
  HostDeps,
  RegistryLike,
  StateSnapshot,
  VoyageLike,
} from "../src/game/workerProtocol";
import type { GameAction, NodeDefinition } from "../src/game/types";
import corvusManifest from "../packages/corvus-tutorial/manifest.json";

const VALID_MANIFEST = {
  id: "test-plugin",
  name: "Test Plugin",
  version: "1.0.0",
  minApi: HOST_API_VERSION,
  entry: "main.js",
  permissions: ["voyage:adjustResource"],
} as const;

describe("manifest validation", () => {
  it("accepts a valid manifest", () => {
    const manifest = parseManifest(VALID_MANIFEST);
    expect(manifest.id).toBe("test-plugin");
    expect(manifest.minApi).toBe(HOST_API_VERSION);
    expect(isCompatible(manifest)).toBe(true);
  });

  it("accepts the explicit network permission", () => {
    expect(parseManifest({ ...VALID_MANIFEST, permissions: ["net:fetch"] }).permissions).toEqual([
      "net:fetch",
    ]);
  });

  it("accepts the bundled Corvus tutorial manifest targeting HOST_API_VERSION", () => {
    const manifest = parseManifest(corvusManifest);
    expect(manifest.id).toBe("corvus-tutorial");
    expect(manifest.entry).toBe("main.js");
    expect(manifest.minApi).toBe(HOST_API_VERSION);
    expect(isCompatible(manifest)).toBe(true);
  });

  it("rejects minApi above the host version", () => {
    expect(() => parseManifest({ ...VALID_MANIFEST, minApi: HOST_API_VERSION + 1 })).toThrow(
      ManifestError,
    );
    expect(isCompatible({ minApi: HOST_API_VERSION + 1 })).toBe(false);
  });

  it("rejects plugins using the removed pre-lifecycle API", () => {
    expect(() => parseManifest({ ...VALID_MANIFEST, minApi: 3 })).toThrow(
      /minApi must be at least 4/,
    );
    expect(isCompatible({ minApi: 3 })).toBe(false);
  });

  it("rejects bad id, version, entry and permissions", () => {
    expect(() => parseManifest({ ...VALID_MANIFEST, id: "bad id!" })).toThrow(ManifestError);
    expect(() => parseManifest({ ...VALID_MANIFEST, version: "1.0" })).toThrow(ManifestError);
    expect(() => parseManifest({ ...VALID_MANIFEST, entry: "../main.js" })).toThrow(ManifestError);
    expect(() => parseManifest({ ...VALID_MANIFEST, permissions: ["voyage:fly"] })).toThrow(
      ManifestError,
    );
  });
});

describe("registry duplicate registration", () => {
  const action: GameAction = { label: "Dup", requires: {}, consumes: [] };
  const node: NodeDefinition = {
    id: "n",
    label: "Node",
    desc: "",
    exploreCost: 1,
    isHub: false,
    actions: [],
  };

  it("throws on duplicate action id", () => {
    const registry = new Registry();
    registry.registerAction("dup", action);
    expect(() => registry.registerAction("dup", action)).toThrow(/Duplicate registration: dup/);
  });

  it("throws on duplicate node id", () => {
    const registry = new Registry();
    registry.registerNode("n", node);
    expect(() => registry.registerNode("n", node)).toThrow(/Duplicate registration: n/);
  });
});

// PluginHost grant handling with mocked deps (no Worker needed).
function makeHost(permissions: string[], ready = true) {
  const messages: { type: string; ok?: boolean; reason?: string; message?: string }[] = [];
  const registryRemovals: string[] = [];
  const logs: string[] = [];
  const voyageState: StateSnapshot = {
    phase: "START",
    jumpCount: 1,
    dimId: "hub",
    dimName: "Scrapyard Outpost",
    hull: 100,
    fuel: 50,
    flux: 0,
    rep: 0,
    energy: 2,
    engineTier: 0,
    weaponTier: 0,
    module: "None",
    carriage: "None",
    crew: "None",
    isSurveyed: false,
    seenCutscenes: [],
  };
  const voyage: VoyageLike = {
    getSnapshot: () => ({ ...voyageState }),
    executeAction: vi.fn(),
    exploreNode: vi.fn(() => true),
    desperateScavenge: vi.fn(() => true),
    state: voyageState,
  };
  const actions = new Map<string, unknown>();
  const nodes = new Map<string, unknown>();
  const cutscenes = new Map<string, unknown>();
  const registeredStories: { pluginId: string; definition: unknown }[] = [];
  const registry: RegistryLike & { getAction: (id: string) => unknown } = {
    registerAction: (pluginId, def) => void actions.set(`${pluginId}:${def.id}`, def),
    registerNode: (pluginId, def) => void nodes.set(`${pluginId}:${def.id}`, def),
    registerCutscene: (pluginId, def) =>
      void cutscenes.set(`${pluginId}:${def.id}`, { ...def, id: `${pluginId}:${def.id}` }),
    getAction: (id) => actions.get(id),
    removePlugin: (pluginId) => {
      registryRemovals.push(pluginId);
      for (const key of [...actions.keys()])
        if (key.startsWith(`${pluginId}:`)) actions.delete(key);
      for (const key of [...nodes.keys()]) if (key.startsWith(`${pluginId}:`)) nodes.delete(key);
      for (const key of [...cutscenes.keys()])
        if (key.startsWith(`${pluginId}:`)) cutscenes.delete(key);
    },
  };
  const deps: HostDeps = {
    voyage,
    registry,
    storylines: {
      register: (pluginId, definition) => registeredStories.push({ pluginId, definition }),
      removePlugin: () => {},
    },
    log: (message) => logs.push(message),
    events: { on: () => {} },
  };
  const host = new PluginHost(deps);
  const fakeWorker = {
    postMessage: vi.fn((msg: { type: string; ok?: boolean; reason?: string; message?: string }) =>
      messages.push(msg),
    ),
    terminate: vi.fn(),
  };
  (host as unknown as { plugins: Map<string, unknown> }).plugins.set("test-plugin", {
    manifest: { ...VALID_MANIFEST, permissions },
    worker: fakeWorker,
    blobUrl: "blob:fake",
    active: true,
    ready,
    stopping: false,
    shutdownTimer: null,
    unloadAfterShutdown: false,
  });
  const grant = (op: GrantOp) => {
    (host as unknown as { handleGrant(id: string, reqId: number, op: GrantOp): void }).handleGrant(
      "test-plugin",
      messages.length + 1,
      op,
    );
    return messages[messages.length - 1];
  };
  const registerOne = (id: string, kind: "action" | "node", def: unknown): void => {
    (
      host as unknown as { registerOne(id: string, kind: "action" | "node", def: unknown): void }
    ).registerOne(id, kind, def);
  };
  return {
    grant,
    voyageState,
    voyage,
    registerOne,
    actions,
    nodes,
    cutscenes,
    registeredStories,
    registryRemovals,
    logs,
    fakeWorker,
    host,
  };
}

describe("plugin registration", () => {
  it("waits for mount readiness", async () => {
    const { host } = makeHost([], false);
    const ready = host.waitUntilReady("test-plugin");
    (
      host as unknown as {
        handleMessage(id: string, message: { type: string }): void;
      }
    ).handleMessage("test-plugin", { type: "ready" });
    await expect(ready).resolves.toBeUndefined();
  });

  it("runs unmount before terminating and removes plugin registrations immediately", async () => {
    const { host, fakeWorker, registryRemovals } = makeHost([], false);
    const ready = host.waitUntilReady("test-plugin");
    host.disable("test-plugin", "user-disabled");
    await expect(ready).rejects.toThrow("user-disabled");
    expect(host.isPluginActive("test-plugin")).toBe(false);
    expect(registryRemovals).toContain("test-plugin");
    expect(fakeWorker.postMessage).toHaveBeenCalledWith({ type: "shutdown" });
    expect(fakeWorker.terminate).not.toHaveBeenCalled();

    (
      host as unknown as {
        handleMessage(id: string, message: { type: string }): void;
      }
    ).handleMessage("test-plugin", { type: "unmounted" });
    expect(fakeWorker.terminate).toHaveBeenCalledOnce();
  });

  it("force-terminates after unmount failure and records the error", () => {
    const { host, fakeWorker, logs } = makeHost([]);
    host.disable("test-plugin", "user-disabled");
    (
      host as unknown as {
        handleMessage(id: string, message: { type: string; message?: string }): void;
      }
    ).handleMessage("test-plugin", { type: "unmount-error", message: "cleanup failed" });
    expect(fakeWorker.terminate).toHaveBeenCalledOnce();
    expect(logs).toContain("plugin unmount incomplete: test-plugin (cleanup failed)");
  });

  it("force-terminates when unmount never acknowledges", async () => {
    vi.useFakeTimers();
    try {
      const { host, fakeWorker, logs } = makeHost([]);
      host.disable("test-plugin", "user-disabled");
      await vi.advanceTimersByTimeAsync(PLUGIN_SHUTDOWN_TIMEOUT_MS);
      expect(fakeWorker.terminate).toHaveBeenCalledOnce();
      expect(logs).toContain("plugin unmount incomplete: test-plugin (unmount timed out)");
    } finally {
      vi.useRealTimers();
    }
  });

  it("namespaces node action references and makes numeric rules executable", () => {
    const { registerOne, actions, nodes } = makeHost(["voyage:executeAction"]);
    registerOne("test-plugin", "action", {
      id: "trade",
      label: "Trade",
      consumes: [{ res: "fuel", amount: 2 }],
      produces: [{ res: "flux", amount: 3 }],
    });
    registerOne("test-plugin", "node", {
      id: "market",
      label: "Market",
      actions: ["trade"],
    });

    const action = actions.get("test-plugin:trade") as {
      consumes: { amount: (state: unknown, config: unknown) => number }[];
      produces: { amount: (state: unknown, config: unknown) => number }[];
    };
    expect(action.consumes[0]?.amount({}, {})).toBe(2);
    expect(action.produces[0]?.amount({}, {})).toBe(3);
    expect(nodes.get("test-plugin:market")).toMatchObject({ actions: ["test-plugin:trade"] });
  });

  it("executes plugin actions by local id through grants", () => {
    const { registerOne, grant, voyage } = makeHost(["voyage:executeAction"]);
    registerOne("test-plugin", "action", { id: "trade", label: "Trade" });
    grant({ kind: "executeAction", actionId: "trade" });
    expect(voyage.executeAction).toHaveBeenCalledWith("test-plugin:trade");
  });

  it("forwards worker storyline registrations to the host storyline service", () => {
    const { host, registeredStories } = makeHost([]);
    const definition = { id: "short-story", title: "Short Story" };
    (
      host as unknown as {
        handleMessage(id: string, message: { type: string; def: unknown }): void;
      }
    ).handleMessage("test-plugin", { type: "register-storyline", def: definition });
    expect(registeredStories).toEqual([{ pluginId: "test-plugin", definition }]);
  });

  it("registers plugin-owned cutscenes under the plugin namespace", () => {
    const { host, cutscenes } = makeHost([]);
    const definition = {
      id: "wp1",
      beats: [{ text: "Welcome aboard.", choiceA: "Continue", choiceB: "Later" }],
    };
    (
      host as unknown as {
        handleMessage(id: string, message: { type: string; def: unknown }): void;
      }
    ).handleMessage("test-plugin", { type: "register-cutscene", def: definition });
    expect(cutscenes.get("test-plugin:wp1")).toMatchObject({
      id: "test-plugin:wp1",
      beats: definition.beats,
    });
  });

  it("writes plugin API calls to the browser console", () => {
    const { host } = makeHost([]);
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      (
        host as unknown as {
          handleMessage(
            id: string,
            message: { type: string; method: string; phase: string; args: unknown },
          ): void;
        }
      ).handleMessage("test-plugin", {
        type: "api-call",
        method: "registerStoryline",
        phase: "call",
        args: { id: "lost-lantern" },
      });

      expect(consoleLog).toHaveBeenCalledWith("[plugin-api] test-plugin.registerStoryline", {
        phase: "call",
        args: { id: "lost-lantern" },
      });
    } finally {
      consoleLog.mockRestore();
    }
  });
});

describe("host grant bounds", () => {
  it("rejects ops without the matching permission", () => {
    const { grant } = makeHost([]);
    expect(grant({ kind: "adjustResource", resource: "fuel", amount: 5 })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("missing permission"),
    });
  });

  it("rejects unknown op kinds", () => {
    const { grant } = makeHost(["*"]);
    expect(grant({ kind: "fly" } as unknown as GrantOp)).toMatchObject({
      ok: false,
      reason: "unknown op",
    });
  });

  it("rejects non-adjustable resources", () => {
    const { grant } = makeHost(["*"]);
    expect(grant({ kind: "adjustResource", resource: "jumpCount", amount: 5 })).toMatchObject({
      ok: false,
      reason: "resource not adjustable: jumpCount",
    });
  });

  it("rejects amounts above MAX_GRANT_AMOUNT", () => {
    const { grant } = makeHost(["*"]);
    expect(
      grant({ kind: "adjustResource", resource: "fuel", amount: MAX_GRANT_AMOUNT + 1 }),
    ).toMatchObject({ ok: false, reason: "amount out of range" });
  });

  it("applies permitted adjustResource grants", () => {
    const { grant, voyageState } = makeHost(["voyage:adjustResource"]);
    expect(grant({ kind: "adjustResource", resource: "fuel", amount: 5 })).toMatchObject({
      ok: true,
    });
    expect(voyageState.fuel).toBe(55);
  });
});
