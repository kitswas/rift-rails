// Conformance test: runs the real worker bootstrap source in a fake worker
// global and asserts both sides speak the same wire protocol.
import { describe, expect, it } from "vitest";
import { WORKER_BOOTSTRAP, WORKER_KICKOFF } from "../src/game/host";
import { API_CALL_PHASE, WORKER_MSG } from "../src/game/workerProtocol";
import type { StateSnapshot } from "../src/game/workerProtocol";

const SNAPSHOT: StateSnapshot = {
  phase: "IDLE",
  jumpCount: 0,
  dimId: "hub",
  dimName: "Scrapyard Outpost",
  hull: 100,
  fuel: 100,
  flux: 0,
  rep: 0,
  energy: 50,
  engineTier: 1,
  weaponTier: 1,
  module: "m",
  carriage: "c",
  crew: "x",
  isSurveyed: true,
  seenCutscenes: [],
};

const PLUGIN_SOURCE = `
const plugin = {
  mount(api) {
    api.on("afterJump", () => { api.log("jumped"); });
    api.registerAction({ id: "test-plugin:poke", label: "Poke" });
    api.grant({ kind: "explore" }).then((r) => { globalThis.__grantResult = r; });
  },
  unmount() { globalThis.__unmounted = true; },
};
`;

const WORKER_TO_HOST = new Set<string>([
  WORKER_MSG.ready,
  WORKER_MSG.unmounted,
  WORKER_MSG.unmountError,
  WORKER_MSG.fatal,
  WORKER_MSG.apiCall,
  WORKER_MSG.log,
  WORKER_MSG.registerAction,
  WORKER_MSG.registerNode,
  WORKER_MSG.registerStoryline,
  WORKER_MSG.registerCutscene,
  WORKER_MSG.grant,
  WORKER_MSG.storageGet,
  WORKER_MSG.storageSet,
  WORKER_MSG.eventSettled,
]);

const PHASES = new Set<string>([API_CALL_PHASE.call, API_CALL_PHASE.result, API_CALL_PHASE.event]);

function spawnWorker() {
  const posted: Record<string, unknown>[] = [];
  const self: Record<string, unknown> = {
    postMessage: (m: Record<string, unknown>) => posted.push(m),
    close: () => {},
  };
  const source = `${WORKER_BOOTSTRAP}\n${PLUGIN_SOURCE}\n${WORKER_KICKOFF}`;
  const run = new Function("self", `"use strict";\n${source}`);
  run(self);
  const send = (m: Record<string, unknown>) =>
    (self.onmessage as (e: { data: Record<string, unknown> }) => void)({ data: m });
  return { posted, send };
}

const flush = () =>
  new Promise<void>((r) => {
    globalThis.setTimeout(r, 0);
  });

describe("worker protocol conformance", () => {
  it("speaks only known message types and reaches ready after init", async () => {
    const { posted, send } = spawnWorker();
    send({ type: WORKER_MSG.init, pluginId: "test-plugin", permissions: [], snapshot: SNAPSHOT });
    await flush();
    await flush();
    for (const m of posted) {
      expect(WORKER_TO_HOST.has(m.type as string), `unknown message type: ${String(m.type)}`).toBe(
        true,
      );
      if (m.type === WORKER_MSG.apiCall) {
        expect(PHASES.has(m.phase as string)).toBe(true);
      }
    }
    expect(posted).toContainEqual({ type: WORKER_MSG.ready });
  });

  it("round-trips a grant through the typed message vocabulary", async () => {
    const { posted, send } = spawnWorker();
    send({
      type: WORKER_MSG.init,
      pluginId: "test-plugin",
      permissions: ["voyage:explore"],
      snapshot: SNAPSHOT,
    });
    await flush();
    await flush();
    const grantMsg = posted.find((m) => m.type === WORKER_MSG.grant);
    expect(grantMsg).toBeDefined();
    send({ type: WORKER_MSG.grantResult, reqId: grantMsg!.reqId, ok: true });
    await flush();
    await flush();
  });

  it("settles events with the typed event-settled message", async () => {
    const { posted, send } = spawnWorker();
    send({ type: WORKER_MSG.init, pluginId: "test-plugin", permissions: [], snapshot: SNAPSHOT });
    await flush();
    await flush();
    send({ type: WORKER_MSG.event, event: "afterJump", payload: {}, snapshot: SNAPSHOT });
    await flush();
    await flush();
    expect(posted).toContainEqual({ type: WORKER_MSG.eventSettled, event: "afterJump" });
  });
});
