// @ts-expect-error - @types/node is not installed in this repo (see tests/e2e/plugins.spec.ts)
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { PluginHost } from "../src/game/host";
import { isCompatible, parseManifest } from "../src/game/manifest";
import { HOST_API_VERSION } from "../src/game/workerProtocol";
import type {
  GrantOp,
  HostDeps,
  RegistryLike,
  StateSnapshot,
  VoyageLike,
} from "../src/game/workerProtocol";
import fieldRepairManifest from "../packages/field-repair/manifest.json";

// Import the real lifecycle object exactly as written, not copied logic.
type TestPlugin = { mount: (api: unknown) => void; unmount: () => void };
let cachedPlugin: TestPlugin | null = null;
async function loadPlugin(): Promise<TestPlugin> {
  if (cachedPlugin) return cachedPlugin;
  const mod = (await import("../packages/field-repair/main.js")) as {
    default: TestPlugin;
  };
  cachedPlugin = mod.default;
  return cachedPlugin;
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

type Listener = (payload?: unknown) => unknown;
type Store = Map<string, unknown>;

interface Harness {
  voyageState: StateSnapshot;
  logs: string[];
  grants: GrantOp[];
  storage: Store;
  events: Set<string>;
  fire: (event: string) => Promise<void>;
}

// Drive the plugin through the REAL PluginHost grant validation (permission
// check, adjustable-resource check, hull clamp) with a mocked voyage bag,
// exactly like tests/plugin.test.ts does. The only re-implementation is the
// worker side (api.state/storage/log), mirroring src/game/host.ts semantics.
async function makeHarness(stored?: Store): Promise<Harness> {
  const voyageState: StateSnapshot = {
    phase: "ENCOUNTER",
    jumpCount: 3,
    dimId: "hunt",
    dimName: "Wilds",
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
  const registry: RegistryLike & { getAction: (id: string) => unknown } = {
    registerAction: () => {},
    registerNode: () => {},
    registerCutscene: () => {},
    getAction: () => undefined,
    removePlugin: () => {},
  };
  const deps: HostDeps = {
    voyage,
    registry,
    log: () => {},
    events: { on: () => {} },
  };
  const host = new PluginHost(deps);

  const logs: string[] = [];
  const grants: GrantOp[] = [];
  const storage: Store = stored ?? new Map<string, unknown>();
  const listeners = new Map<string, Listener[]>();
  let snapshot: StateSnapshot = clone(voyageState);
  let reqSeq = 0;
  const pending = new Map<number, (msg: { ok: boolean; reason?: string }) => void>();

  const fakeWorker = {
    postMessage: (msg: { type: string; reqId?: number; ok?: boolean; reason?: string }) => {
      if (msg.type === "grant-result" && typeof msg.reqId === "number") {
        const resolve = pending.get(msg.reqId);
        if (resolve) {
          pending.delete(msg.reqId);
          resolve({ ok: msg.ok === true, reason: msg.reason });
        }
      }
    },
    terminate: () => {},
  };
  (host as unknown as { plugins: Map<string, unknown> }).plugins.set("field-repair", {
    manifest: parseManifest(fieldRepairManifest),
    worker: fakeWorker,
    blobUrl: "blob:fake",
    active: true,
    ready: true,
  });

  const grant = (op: GrantOp) => {
    grants.push(op);
    return new Promise<{ ok: boolean; reason?: string }>((resolve) => {
      pending.set(++reqSeq, resolve);
      (
        host as unknown as {
          handleGrant(id: string, reqId: number, op: GrantOp): void;
        }
      ).handleGrant("field-repair", reqSeq, op);
    });
  };

  const api = {
    on: (event: string, fn: Listener) => {
      const list = listeners.get(event) ?? [];
      list.push(fn);
      listeners.set(event, list);
    },
    state: () => deepFreeze(clone(snapshot)),
    grant,
    log: (msg: unknown) => {
      logs.push(String(msg));
    },
    storage: {
      get: (key: string) => Promise.resolve(clone(storage.get(String(key)))),
      set: (key: string, value: unknown) => {
        const k = String(key);
        if (k.length === 0 || k.length > 128) return Promise.resolve(false);
        storage.set(k, clone(value));
        return Promise.resolve(true);
      },
    },
  };

  (await loadPlugin()).mount(api);

  const settle = async (): Promise<void> => {
    for (let i = 0; i < 5; i++) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  };

  const fire = async (event: string): Promise<void> => {
    // Worker semantics: the snapshot for an event is the state at emit time,
    // installed just before the handlers run.
    snapshot = clone(voyageState);
    for (const fn of listeners.get(event) ?? []) await fn({ jumpCount: snapshot.jumpCount });
    await settle();
  };

  return {
    voyageState,
    logs,
    grants,
    storage,
    events: new Set(listeners.keys()),
    fire,
  };
}

describe("field-repair manifest", () => {
  it("declares the minimal permission surface it needs", () => {
    const manifest = parseManifest(fieldRepairManifest);
    expect(manifest.id).toBe("field-repair");
    expect(manifest.minApi).toBeLessThanOrEqual(HOST_API_VERSION);
    expect(isCompatible(manifest)).toBe(true);
    expect(manifest.permissions).toEqual(["voyage:adjustResource"]);
  });
});

describe("field-repair bundled zip", () => {
  it("ships manifest.json and main.js that parse and contain the mechanic", async () => {
    const zip = await JSZip.loadAsync(readFileSync("public/plugins/field-repair.zip"));
    const names = Object.keys(zip.files);
    expect(names).toContain("manifest.json");
    expect(names).toContain("main.js");

    const manifestText = await zip.file("manifest.json")?.async("string");
    const entryText = await zip.file("main.js")?.async("string");
    expect(manifestText).toBeTruthy();
    expect(entryText).toBeTruthy();
    expect(names.filter((name) => !zip.files[name]?.dir).sort()).toEqual([
      "main.js",
      "manifest.json",
    ]);
    expect(parseManifest(JSON.parse(manifestText ?? "{}"))).toEqual(
      parseManifest(fieldRepairManifest),
    );
    expect(entryText).toBe(readFileSync("packages/field-repair/main.js", "utf8"));
  });
});

describe("field-repair behaviour", () => {
  it("listens to afterAction and afterJump", async () => {
    const h = await makeHarness();
    expect(h.events).toEqual(new Set(["afterAction", "afterJump"]));
    await h.fire("afterJump");
    expect(h.logs).toContain("field-repair: stabilizer ready");
  });

  it("deploys +25 hull once at critical hull and persists the use", async () => {
    const h = await makeHarness();
    h.voyageState.hull = 25;
    h.voyageState.jumpCount = 3;
    await h.fire("afterAction");

    expect(h.grants).toEqual([{ kind: "adjustResource", resource: "hull", amount: 25 }]);
    expect(h.voyageState.hull).toBe(50);
    expect(h.storage.get("stabilizer")).toEqual({ used: true, jump: 3, hullBefore: 25 });
    expect(h.logs).toContain(
      "field-repair: emergency hull stabilizer deployed at jump 3 (hull 25, +25 hull)",
    );
  });

  it("never fires twice in one session, even when hull dives again", async () => {
    const h = await makeHarness();
    h.voyageState.hull = 25;
    await h.fire("afterAction");
    expect(h.grants).toHaveLength(1);

    h.voyageState.hull = 5;
    await h.fire("afterAction");
    await h.fire("afterJump");
    expect(h.grants).toHaveLength(1);
    expect(h.voyageState.hull).toBe(5);
    expect(h.logs).toContain("field-repair: stabilizer spent (jump 3)");
  });

  it("honours persisted usage across a plugin reload", async () => {
    const first = await makeHarness();
    first.voyageState.hull = 20;
    await first.fire("afterAction");
    expect(first.grants).toHaveLength(1);

    // Fresh worker/host, same persisted storage — like a save/load reload.
    const second = await makeHarness(first.storage);
    second.voyageState.hull = 15;
    await second.fire("afterAction");
    expect(second.grants).toHaveLength(0);
    expect(second.voyageState.hull).toBe(15);
  });

  it("stays silent above the critical band", async () => {
    const h = await makeHarness();
    h.voyageState.hull = 60;
    await h.fire("afterAction");
    await h.fire("afterJump");
    expect(h.grants).toHaveLength(0);
    expect(h.voyageState.hull).toBe(60);
    expect(h.storage.get("stabilizer")).toBeUndefined();
  });

  it("does not resurrect a terminal voyage", async () => {
    const dead = await makeHarness();
    dead.voyageState.hull = 5;
    dead.voyageState.phase = "DEAD";
    await dead.fire("afterAction");
    expect(dead.grants).toHaveLength(0);
    expect(dead.voyageState.hull).toBe(5);

    const stranded = await makeHarness();
    stranded.voyageState.hull = 5;
    stranded.voyageState.phase = "STRANDED";
    await stranded.fire("afterAction");
    expect(stranded.grants).toHaveLength(0);
    expect(stranded.voyageState.hull).toBe(5);
  });
});
