// PluginHost: main-thread authority that runs plugin zips in workers.
//
// The worker script is a Blob source string built here (bootstrap + the
// plugin's entry module + kickoff) and spawned with { type: "module" }.
// A plugin entry must define `activate(api)` and be a single self-contained
// module: relative imports inside the zip do not resolve from a blob URL.
// The game never appears in the worker: no DOM/window/localStorage, and all
// mutations flow through api.grant(), validated against manifest permissions.

import JSZip from "jszip";

import { ID_RE, isCompatible, ManifestError, parseManifest } from "./manifest";
import type { PluginManifest } from "./manifest";
import {
  ADJUSTABLE_RESOURCES,
  GRANT_PERMISSIONS,
  KNOWN_EVENTS,
  MAX_GRANT_AMOUNT,
} from "./workerProtocol";
import type {
  GrantOp,
  HostDeps,
  HostMessage,
  RegisteredAction,
  RegisteredNode,
  StateSnapshot,
  WorkerMessage,
} from "./workerProtocol";

export const MAX_ZIP_BYTES = 5 * 1024 * 1024;
export const MAX_ENTRY_BYTES = 1 * 1024 * 1024;
export const MAX_STORAGE_KEY = 128;
export const MAX_STORAGE_BYTES = 64 * 1024;
export const MAX_MANIFEST_BYTES = 64 * 1024;
export const MAX_ZIP_FILES = 100;
export const MAX_ZIP_TOTAL_BYTES = 5 * 1024 * 1024;
export const MAX_STORAGE_KEYS = 100;
export const MAX_STORAGE_TOTAL_BYTES = 256 * 1024;
export const MAX_LABEL_CHARS = 128;
export const MAX_LOG_CHARS = 500;
export const MAX_RULES = 20;
export const MAX_REQUIRES = 20;
export const MAX_RESOURCE_VALUE = 100000;
export const MAX_GRANT_PER_PLUGIN_PER_EVENT = 10000;
export const MAX_GRANTS_PER_PLUGIN_PER_EVENT = 50;

// ---- Worker source (plain JS; no backticks / ${ so this template is safe) --

const WORKER_BOOTSTRAP = `
"use strict";
// Sandbox: plugin workers run with network globals blocked by default.
// fetch / WebSocket / XMLHttpRequest / EventSource are shadowed with
// throwing stubs unless the plugin manifest grants "net:fetch" (or "*").
// The host sends the granted permission list on "init"; we capture it in
// __permissions and re-apply the block at init. Globals are then frozen
// so plugin code cannot un-shadow, delete, or reassign them.
const pluginApi = (() => {
const __pending = new Map();
let __reqId = 0;
let __snapshot = null;
let __permissions = [];
function __netStub(name) {
  return function () { throw new Error(name + " blocked: missing net:fetch permission"); };
}
function __applySandbox() {
  if (__permissions.indexOf("net:fetch") !== -1 || __permissions.indexOf("*") !== -1) return;
  try { self.fetch = __netStub("fetch"); } catch (e) {}
  try { self.WebSocket = __netStub("WebSocket"); } catch (e) {}
  try { self.XMLHttpRequest = __netStub("XMLHttpRequest"); } catch (e) {}
  try { self.EventSource = __netStub("EventSource"); } catch (e) {}
  try { Object.freeze(self); } catch (e) {}
}
const __listeners = new Map();
function __post(m) { self.postMessage(m); }
function __call(m) {
  return new Promise(function (res) {
    const id = ++__reqId;
    __pending.set(id, res);
    __post(Object.assign({ reqId: id }, m));
  });
}
function __clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function __frozen(v) {
  if (v && typeof v === "object") {
    Object.freeze(v);
    for (const child of Object.values(v)) __frozen(child);
  }
  return v;
}
self.onerror = function (e) {
  __post({ type: "fatal", message: String((e && e.message) || "worker error") });
};
self.onunhandledrejection = function (e) {
  __post({ type: "fatal", message: String((e && e.reason && e.reason.message) || "unhandled rejection") });
};
self.onmessage = function (e) {
  const m = e.data;
  if (!m || typeof m.type !== "string") return;
  if (m.type === "init") {
    __snapshot = m.snapshot || null;
    __permissions = Array.isArray(m.permissions) ? m.permissions : [];
    __applySandbox();
  } else if (m.type === "event") {
    if (m.snapshot) __snapshot = m.snapshot;
    const fns = __listeners.get(m.event) || [];
    for (const fn of fns) {
      try { fn(m.payload); }
      catch (err) { __post({ type: "log", msg: "handler error: " + ((err && err.message) || err) }); }
    }
  } else if (m.type === "grant-result" || m.type === "storage-result") {
    const r = __pending.get(m.reqId);
    if (r) { __pending.delete(m.reqId); r(m); }
  } else if (m.type === "shutdown") {
    if (typeof self.close === "function") self.close();
  }
};
try { Object.defineProperty(self, "onmessage", { value: self.onmessage, writable: false, configurable: false }); } catch (e) {}
try { Object.defineProperty(self, "onerror", { value: self.onerror, writable: false, configurable: false }); } catch (e) {}
try { Object.defineProperty(self, "onunhandledrejection", { value: self.onunhandledrejection, writable: false, configurable: false }); } catch (e) {}
const __storage = Object.freeze({
  get: function (key) {
    return __call({ type: "storage-get", key: String(key) }).then(function (m) {
      return m.value === undefined ? undefined : __clone(m.value);
    });
  },
  set: function (key, value) {
    return __call({ type: "storage-set", key: String(key), value: __clone(value) }).then(function (m) {
      return !!m.value;
    });
  }
});
const __api = {
  on: function (event, fn) {
    if (typeof fn !== "function" || typeof event !== "string") return;
    const list = __listeners.get(event) || [];
    list.push(fn);
    __listeners.set(event, list);
  },
  registerAction: function (def) { __post({ type: "register-action", def: def }); },
  registerNode: function (def) { __post({ type: "register-node", def: def }); },
  grant: function (op) {
    return __call({ type: "grant", op: op }).then(function (m) {
      return { ok: !!m.ok, reason: m.reason };
    });
  },
  state: function () { return __frozen(__clone(__snapshot)); },
  log: function (msg) { __post({ type: "log", msg: String(msg) }); },
  storage: __storage
};
return Object.freeze(__api);
})();
`;

const WORKER_KICKOFF = `
try {
  if (typeof activate !== "function") throw new Error("entry must define activate(api)");
  activate(pluginApi);
  self.postMessage({ type: "ready" });
} catch (err) {
  self.postMessage({ type: "fatal", message: String((err && err.message) || err) });
}
`;

// ---- Host ------------------------------------------------------------------

interface PluginRecord {
  manifest: PluginManifest;
  worker: Worker;
  blobUrl: string;
  active: boolean;
  ready: boolean;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  active: boolean;
  ready: boolean;
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function isValidRegId(id: unknown): id is string {
  return typeof id === "string" && ID_RE.test(id);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** True when value is JSON-cloneable (no functions, symbols, bigint, cycles). */
function isSerializable(v: unknown, depth = 0): boolean {
  if (depth > 10) return false;
  if (v === null || typeof v === "string" || typeof v === "boolean") return true;
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "undefined") return true;
  if (Array.isArray(v)) return v.every((x) => isSerializable(x, depth + 1));
  if (isRecord(v)) {
    return Object.values(v).every((x) => isSerializable(x, depth + 1));
  }
  return false;
}

interface SerializableRule {
  res: string;
  amount: number;
}

function parseRuleList(raw: unknown): SerializableRule[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_RULES) return null;
  const out: SerializableRule[] = [];
  let total = 0;
  for (const rule of raw) {
    if (!isRecord(rule)) return null;
    // Whitelist only: reject phase/dimId/engineTier/etc.
    if (typeof rule.res !== "string" || !ADJUSTABLE_RESOURCES.has(rule.res)) return null;
    // Amounts must be finite, >= 0, within the per-grant cap.
    if (
      typeof rule.amount !== "number" ||
      !Number.isFinite(rule.amount) ||
      rule.amount < 0 ||
      rule.amount > MAX_GRANT_AMOUNT
    ) {
      return null;
    }
    total += rule.amount;
    if (total > MAX_GRANT_AMOUNT) return null; // total grant cap
    out.push({ res: rule.res, amount: rule.amount });
  }
  return out;
}

function parseRequires(raw: unknown): Record<string, number | string> | null {
  if (raw === undefined) return {};
  if (!isRecord(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length > MAX_REQUIRES) return null;
  const out: Record<string, number | string> = {};
  for (const key of keys) {
    if (key.length === 0 || key.length > 32) return null;
    // Requires keys must be adjustable resources only (no phase/dimId/etc.).
    if (!ADJUSTABLE_RESOURCES.has(key)) return null;
    const value = raw[key];
    if (typeof value === "number") {
      if (!Number.isFinite(value) || value < 0 || value > MAX_GRANT_AMOUNT) return null;
      out[key] = value;
    } else if (typeof value === "string") {
      if (value.length > 128) return null;
      out[key] = value;
    } else {
      return null;
    }
  }
  return out;
}

/** Validate a serializable GameAction (worker form) or return null to reject. */
function parseActionDef(def: unknown): RegisteredAction | null {
  if (!isRecord(def)) return null;
  if (!isValidRegId(def.id)) return null;
  if (
    typeof def.label !== "string" ||
    def.label.trim().length === 0 ||
    def.label.length > MAX_LABEL_CHARS
  ) {
    return null;
  }
  const consumes = parseRuleList(def.consumes);
  if (consumes === null) return null;
  let produces: SerializableRule[] = [];
  if (def.produces !== undefined) {
    const parsed = parseRuleList(def.produces);
    if (parsed === null) return null;
    produces = parsed;
  }
  let failConsumes: SerializableRule[] = [];
  if (def.failConsumes !== undefined) {
    const parsed = parseRuleList(def.failConsumes);
    if (parsed === null) return null;
    failConsumes = parsed;
  }
  // Combined consumes + produces total must not exceed the grant cap.
  const combined =
    consumes.reduce((s, r) => s + r.amount, 0) +
    produces.reduce((s, r) => s + r.amount, 0) +
    failConsumes.reduce((s, r) => s + r.amount, 0);
  if (combined > MAX_GRANT_AMOUNT) return null;
  const requires = parseRequires(def.requires);
  if (requires === null) return null;
  for (const field of ["logSuccess", "logFail"] as const) {
    const value = def[field];
    if (value !== undefined && (typeof value !== "string" || value.length > MAX_LOG_CHARS)) {
      return null;
    }
  }
  if (def.isMenu !== undefined && typeof def.isMenu !== "boolean") return null;
  if (def.menuTarget !== undefined && typeof def.menuTarget !== "string") return null;
  if (def.uiClass !== undefined && (typeof def.uiClass !== "string" || def.uiClass.length > 64)) {
    return null;
  }
  if (!isSerializable(def)) return null;
  const normalized: Record<string, unknown> = {
    ...clone(def),
    id: def.id as string,
    label: def.label as string,
    consumes: consumes.map(({ res, amount }) => ({ res, amount: () => amount })),
    produces: produces.map(({ res, amount }) => ({ res, amount: () => amount })),
    failConsumes: failConsumes.map(({ res, amount }) => ({ res, amount: () => amount })),
    requires,
  };
  return normalized as unknown as RegisteredAction;
}

/** Validate a serializable NodeDefinition (worker form) or return null to reject. */
function parseNodeDef(def: unknown): RegisteredNode | null {
  if (!isRecord(def)) return null;
  if (!isValidRegId(def.id)) return null;
  if (
    typeof def.label !== "string" ||
    def.label.trim().length === 0 ||
    def.label.length > MAX_LABEL_CHARS
  ) {
    return null;
  }
  if (def.desc !== undefined && (typeof def.desc !== "string" || def.desc.length > 2048)) {
    return null;
  }
  if (
    def.exploreCost !== undefined &&
    (typeof def.exploreCost !== "number" || !Number.isFinite(def.exploreCost) || def.exploreCost < 0)
  ) {
    return null;
  }
  if (def.isHub !== undefined && typeof def.isHub !== "boolean") return null;
  if (def.actions !== undefined) {
    if (!Array.isArray(def.actions) || def.actions.length > 64) return null;
    for (const a of def.actions) {
      if (!isValidRegId(a)) return null;
    }
  }
  if (!isSerializable(def)) return null;
  const normalized: Record<string, unknown> = {
    ...clone(def),
    id: def.id as string,
    label: def.label as string,
  };
  return normalized as unknown as RegisteredNode;
}

function zipFileSize(file: JSZip.JSZipObject | null): number | null {
  if (!file) return null;
  const data = (file as unknown as { _data?: { uncompressedSize?: unknown } })._data;
  if (data && typeof data.uncompressedSize === "number" && Number.isFinite(data.uncompressedSize)) {
    return data.uncompressedSize;
  }
  return null;
}

function maxHullFor(voyage: HostDeps["voyage"]): number {
  const any = voyage as unknown as Record<string, unknown>;
  const config = any["config"] as { MAX_HULL?: unknown } | undefined;
  if (config && typeof config.MAX_HULL === "number" && Number.isFinite(config.MAX_HULL) && config.MAX_HULL > 0) {
    return config.MAX_HULL;
  }
  if (typeof any["getMaxHull"] === "function") {
    try {
      const v = (any["getMaxHull"] as () => unknown).call(voyage);
      if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
    } catch {
      // fall through to default
    }
  }
  return 100;
}

function maxEnergyFor(voyage: HostDeps["voyage"]): number {
  const any = voyage as unknown as Record<string, unknown>;
  if (typeof any["getMaxEnergy"] === "function") {
    try {
      const v = (any["getMaxEnergy"] as () => unknown).call(voyage);
      if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
    } catch {
      // fall through
    }
  }
  const config = any["config"] as { START_ENERGY?: unknown } | undefined;
  let start = 2;
  if (config && typeof config.START_ENERGY === "number" && Number.isFinite(config.START_ENERGY)) {
    start = config.START_ENERGY;
  }
  let tier = 0;
  const state = any["state"] as { engineTier?: unknown } | undefined;
  if (state && typeof state.engineTier === "number" && Number.isFinite(state.engineTier)) {
    tier = state.engineTier;
  } else {
    try {
      const snap = voyage.getSnapshot() as unknown as Record<string, unknown>;
      if (typeof snap["engineTier"] === "number" && Number.isFinite(snap["engineTier"] as number)) {
        tier = snap["engineTier"] as number;
      }
    } catch {
      // keep 0
    }
  }
  return Math.max(0, start + tier);
}

function resourceCap(resource: string, voyage: HostDeps["voyage"]): number {
  if (resource === "hull") return maxHullFor(voyage);
  if (resource === "energy") return maxEnergyFor(voyage);
  return MAX_RESOURCE_VALUE;
}

function currentResource(voyage: HostDeps["voyage"], resource: string): number | null {
  const any = voyage as unknown as Record<string, unknown>;
  const state = any["state"] as Record<string, unknown> | undefined;
  if (state && typeof state[resource] === "number") return state[resource] as number;
  try {
    const snap = voyage.getSnapshot() as unknown as Record<string, unknown>;
    const v = snap[resource];
    if (typeof v === "number") return v;
  } catch {
    return null;
  }
  return null;
}

function clampResource(value: number, cap: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(cap, Math.max(0, value));
}

/** Clamped + validated adjust; uses voyage.adjustResource when present. */
function applyAdjust(voyage: HostDeps["voyage"], resource: string, amount: number): void {
  const cap = resourceCap(resource, voyage);
  const current = currentResource(voyage, resource);
  if (current === null || !Number.isFinite(current)) {
    throw new Error("voyage does not support adjustResource");
  }
  const next = clampResource(current + amount, cap);
  const delta = next - current;
  if (typeof voyage.adjustResource === "function") {
    voyage.adjustResource(resource, delta);
    try {
      voyage.enforceStateBounds?.();
    } catch {
      // helpers are best-effort here
    }
    const after = currentResource(voyage, resource);
    if (after !== null && after !== next) {
      const state = (voyage as unknown as { state?: Record<string, number> }).state;
      if (state && typeof state[resource] === "number") {
        state[resource] = next;
        try {
          voyage.enforceStateBounds?.();
        } catch {
          // ignore
        }
      }
    }
    return;
  }
  if (voyage.state) {
    const bag = voyage.state as unknown as Record<string, unknown>;
    if (typeof bag[resource] !== "number" || !Number.isFinite(bag[resource] as number)) {
      throw new Error("voyage does not support adjustResource");
    }
    bag[resource] = next;
    try {
      voyage.enforceStateBounds?.();
    } catch {
      // ignore
    }
    const after = bag[resource] as number;
    if (Number.isFinite(after) && (after < 0 || after > cap)) {
      bag[resource] = clampResource(after, cap);
    }
    return;
  }
  throw new Error("voyage does not support adjustResource");
}

export class PluginHost {
  private readonly deps: HostDeps;
  private readonly plugins = new Map<string, PluginRecord>();
  private readonly storage = new Map<string, Map<string, unknown>>();
  private grantSeq = 0;
  private readonly grantUsage = new Map<string, { seq: number; total: number; count: number }>();

  constructor(deps: HostDeps) {
    this.deps = deps;
    const sub = (event: string) =>
      deps.events.on(event, (payload: unknown) => {
        if (event === "onEnter") {
          const phase = (payload as { phase?: string } | null)?.phase;
          this.emit(phase ? (`onEnter:${phase}` as never) : ("onEnter" as never), payload);
        } else if (event === "onSave") {
          this.emit("onSave", { storage: this.serializeAllStorage() });
        } else {
          this.emit(event as never, payload);
        }
      });
    for (const e of ["onEnter", "beforeAction", "afterAction", "afterJump", "onDeath", "onSave"]) {
      sub(e);
    }
  }

  /** Load, validate and activate a plugin from a zip file. */
  async loadZip(input: File | ArrayBuffer): Promise<PluginManifest> {
    const buf: ArrayBuffer =
      typeof File !== "undefined" && input instanceof File
        ? await input.arrayBuffer()
        : (input as ArrayBuffer);
    if (buf.byteLength > MAX_ZIP_BYTES) {
      throw new Error(`plugin zip too large (${buf.byteLength} bytes)`);
    }

    const zip = await JSZip.loadAsync(buf);
    const allFiles = Object.values(zip.files).filter((f) => !f.dir);
    if (allFiles.length > MAX_ZIP_FILES) {
      throw new Error(`plugin zip has too many files (${allFiles.length})`);
    }
    let totalUncompressed = 0;
    for (const file of allFiles) {
      const size = zipFileSize(file);
      if (size !== null) {
        if (size < 0) throw new Error(`plugin zip has invalid file size: ${file.name}`);
        totalUncompressed += size;
        if (totalUncompressed > MAX_ZIP_TOTAL_BYTES) {
          throw new Error(`plugin zip too large (${totalUncompressed} bytes uncompressed)`);
        }
      }
    }
    const manifestFile = zip.file("manifest.json");
    if (!manifestFile) throw new ManifestError(["manifest.json missing from zip"]);
    const manifestSize = zipFileSize(manifestFile);
    if (manifestSize !== null && manifestSize > MAX_MANIFEST_BYTES) {
      throw new Error(`manifest.json too large (${manifestSize} bytes)`);
    }
    const manifestText = await manifestFile.async("string");
    if (manifestText.length > MAX_MANIFEST_BYTES) {
      throw new Error(`manifest.json too large (${manifestText.length} chars)`);
    }
    const parsed: unknown = JSON.parse(manifestText);
    const manifest = parseManifest(parsed); // includes HOST_API_VERSION check
    if (!isCompatible(manifest)) {
      throw new ManifestError([`requires host API >= ${manifest.minApi}`]);
    }
    const existing = this.plugins.get(manifest.id);
    if (existing?.active) throw new Error(`plugin already loaded: ${manifest.id}`);

    const entryFile = zip.file(manifest.entry);
    if (!entryFile) throw new ManifestError([`entry file not in zip: ${manifest.entry}`]);
    const entrySize = zipFileSize(entryFile);
    if (entrySize !== null && entrySize > MAX_ENTRY_BYTES) {
      throw new Error(`plugin entry too large (${entrySize} bytes)`);
    }
    const entrySource = await entryFile.async("string");
    if (entrySource.length > MAX_ENTRY_BYTES) {
      throw new Error(`plugin entry too large (${entrySource.length} chars)`);
    }

    const source =
      WORKER_BOOTSTRAP + "\n// ---- plugin entry ----\n" + entrySource + "\n" + WORKER_KICKOFF;
    const blob = new Blob([source], { type: "text/javascript" });
    const blobUrl = URL.createObjectURL(blob);
    const worker = new Worker(blobUrl, { type: "module" });

    const record: PluginRecord = {
      manifest,
      worker,
      blobUrl,
      active: true,
      ready: false,
    };
    this.plugins.set(manifest.id, record);
    if (!this.storage.has(manifest.id)) this.storage.set(manifest.id, new Map());

    worker.onmessage = (e: MessageEvent<WorkerMessage>) =>
      this.handleMessage(manifest.id, e.data);
    worker.onerror = (e: ErrorEvent) => this.disable(manifest.id, `worker error: ${e.message}`);
    worker.onmessageerror = () => this.disable(manifest.id, "message decode error");

    const init: HostMessage = {
      type: "init",
      pluginId: manifest.id,
      permissions: manifest.permissions,
      snapshot: clone(this.deps.voyage.getSnapshot()),
    };
    worker.postMessage(init);
    this.deps.log(`plugin loaded: ${manifest.id} (${manifest.name} ${manifest.version})`);
    return manifest;
  }

  /** Forward a game event to every active plugin worker. */
  emit(event: string, payload: unknown): void {
    this.grantSeq += 1;
    const snapshot: StateSnapshot = clone(this.deps.voyage.getSnapshot());
    for (const record of this.plugins.values()) {
      if (!record.active) continue;
      const msg: HostMessage = { type: "event", event: event as never, payload, snapshot };
      record.worker.postMessage(msg);
    }
  }

  /** Disable + terminate a plugin (crash path); storage is kept for resume. */
  disable(id: string, reason: string): void {
    const record = this.plugins.get(id);
    if (!record?.active) return;
    record.active = false;
    record.ready = false;
    record.worker.terminate();
    URL.revokeObjectURL(record.blobUrl);
    this.deps.registry.removePlugin(id);
    this.deps.log(`plugin disabled: ${id} (${reason})`);
  }

  /** Disable a plugin and drop its namespaced storage. */
  unload(id: string): void {
    this.disable(id, "unloaded");
    this.plugins.delete(id);
    this.storage.delete(id);
    this.grantUsage.delete(id);
  }

  isPluginActive(id: string): boolean {
    return this.plugins.get(id)?.active ?? false;
  }

  listPlugins(): PluginInfo[] {
    return [...this.plugins.values()].map((r) => ({
      id: r.manifest.id,
      name: r.manifest.name,
      version: r.manifest.version,
      active: r.active,
      ready: r.ready,
    }));
  }

  /** All plugin storage, keyed by plugin id (for onSave payloads). */
  serializeAllStorage(): Record<string, Record<string, unknown>> {
    const out: Record<string, Record<string, unknown>> = {};
    for (const [id, map] of this.storage) {
      out[id] = Object.fromEntries(map);
    }
    return out;
  }

  // ---- Worker message handling ---------------------------------------------

  private handleMessage(id: string, msg: WorkerMessage): void {
    const record = this.plugins.get(id);
    if (!record || !record.active) return;
    switch (msg.type) {
      case "ready":
        record.ready = true;
        break;
      case "fatal":
        this.disable(id, msg.message);
        break;
      case "log":
        this.deps.log(`[${id}] ${msg.msg}`);
        break;
      case "register-action":
        this.registerOne(id, "action", msg.def);
        break;
      case "register-node":
        this.registerOne(id, "node", msg.def);
        break;
      case "grant":
        this.handleGrant(id, msg.reqId, msg.op);
        break;
      case "storage-get":
        record.worker.postMessage({
          type: "storage-result",
          reqId: msg.reqId,
          value: clone(this.storage.get(id)?.get(msg.key)),
        });
        break;
      case "storage-set":
        this.handleStorageSet(id, msg.reqId, msg.key, msg.value);
        break;
    }
  }

  private registerOne(
    id: string,
    kind: "action" | "node",
    def: RegisteredAction | RegisteredNode,
  ): void {
    const parsed = kind === "action" ? parseActionDef(def) : parseNodeDef(def);
    if (parsed === null) {
      this.deps.log(`[${id}] rejected ${kind}: invalid definition`);
      return;
    }
    try {
      if (kind === "action") {
        this.deps.registry.registerAction(id, parsed as RegisteredAction);
      } else {
        const node = parsed as RegisteredNode;
        const actions = node.actions;
        this.deps.registry.registerNode(id, {
          ...node,
          ...(Array.isArray(actions) ? { actions: actions.map((actionId) => `${id}:${actionId}`) } : {}),
        });
      }
    } catch (err) {
      this.deps.log(
        `[${id}] ${kind} registration failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private usageFor(id: string): { seq: number; total: number; count: number } {
    const existing = this.grantUsage.get(id);
    if (existing && existing.seq === this.grantSeq) return existing;
    const fresh = { seq: this.grantSeq, total: 0, count: 0 };
    this.grantUsage.set(id, fresh);
    return fresh;
  }

  /** Affordability for serializable numeric rules (function rules defer to voyage). */
  private checkNumericAfford(act: unknown, voyage: HostDeps["voyage"]): boolean {
    if (!isRecord(act)) return true;
    const consumes = act["consumes"];
    if (Array.isArray(consumes)) {
      for (const rule of consumes) {
        if (!isRecord(rule) || typeof rule["res"] !== "string") continue;
        const amount = rule["amount"];
        if (typeof amount !== "number") continue; // function rule: handled by voyage
        const current = currentResource(voyage, rule["res"]);
        if (current === null || current < amount) return false;
      }
    }
    const requires = act["requires"];
    if (isRecord(requires)) {
      for (const [key, need] of Object.entries(requires)) {
        if (typeof need === "number") {
          const current = currentResource(voyage, key);
          if (current === null || current < need) return false;
        } else if (typeof need === "string") {
          let held: unknown;
          const any = voyage as unknown as Record<string, unknown>;
          const state = any["state"] as Record<string, unknown> | undefined;
          if (state && key in state) held = state[key];
          else {
            try {
              held = (voyage.getSnapshot() as unknown as Record<string, unknown>)[key];
            } catch {
              return false;
            }
          }
          if (held !== need) return false;
        }
      }
    }
    return true;
  }

  /** Validate a grant against the manifest, then run via voyage callbacks. */
  private handleGrant(id: string, reqId: number, op: GrantOp): void {
    const reply = (ok: boolean, reason?: string) => {
      const record = this.plugins.get(id);
      if (!record?.active) return;
      const msg: HostMessage = { type: "grant-result", reqId, ok, reason };
      record.worker.postMessage(msg);
    };

    const record = this.plugins.get(id);
    if (!record?.active) return;
    const perms = record.manifest.permissions;
    if (
      !op ||
      typeof op !== "object" ||
      typeof op.kind !== "string" ||
      !Object.hasOwn(GRANT_PERMISSIONS, op.kind)
    ) {
      reply(false, "unknown op");
      return;
    }
    if (!perms.includes("*") && !perms.includes(GRANT_PERMISSIONS[op.kind])) {
      reply(false, `missing permission ${GRANT_PERMISSIONS[op.kind]}`);
      return;
    }
    try {
      const voyage = this.deps.voyage;
      switch (op.kind) {
        case "adjustResource": {
          if (!ADJUSTABLE_RESOURCES.has(op.resource)) {
            reply(false, `resource not adjustable: ${op.resource}`);
            return;
          }
          if (typeof op.amount !== "number" || !Number.isFinite(op.amount)) {
            reply(false, "amount out of range");
            return;
          }
          if (Math.abs(op.amount) > MAX_GRANT_AMOUNT) {
            reply(false, "amount out of range");
            return;
          }
          const usage = this.usageFor(id);
          const nextTotal = usage.total + Math.abs(op.amount);
          const nextCount = usage.count + 1;
          if (
            nextTotal > MAX_GRANT_PER_PLUGIN_PER_EVENT ||
            nextCount > MAX_GRANTS_PER_PLUGIN_PER_EVENT
          ) {
            reply(false, "grant rate limit exceeded");
            return;
          }
          try {
            applyAdjust(voyage, op.resource, op.amount);
          } catch (err) {
            reply(false, err instanceof Error ? err.message : String(err));
            return;
          }
          usage.total = nextTotal;
          usage.count = nextCount;
          reply(true);
          return;
        }
        case "executeAction": {
          if (typeof op.actionId !== "string" || op.actionId.length === 0) {
            reply(false, "actionId required");
            return;
          }
          let phase = "";
          try {
            phase = voyage.getSnapshot().phase ?? "";
          } catch {
            phase = "";
          }
          if (phase === "DEAD" || phase === "JUMPING" || phase === "STRANDED") {
            reply(false, `cannot execute action while ${phase}`);
            return;
          }
          let act: unknown;
          let hasLookup = false;
          const regGet = (this.deps.registry as unknown as { getAction?: unknown }).getAction;
          let actionId = `${id}:${op.actionId}`;
          if (typeof regGet === "function") {
            hasLookup = true;
            const getAction = regGet as (v: string) => unknown;
            act = getAction.call(this.deps.registry, actionId);
            if (!act) {
              actionId = op.actionId;
              act = getAction.call(this.deps.registry, actionId);
            }
          } else {
            const vreg = (voyage as unknown as { registry?: { getAction?: unknown } }).registry;
            if (vreg && typeof vreg.getAction === "function") {
              hasLookup = true;
              const getAction = vreg.getAction as (v: string) => unknown;
              act = getAction.call(vreg, actionId);
              if (!act) {
                actionId = op.actionId;
                act = getAction.call(vreg, actionId);
              }
            }
          }
          if (hasLookup && !act) {
            reply(false, `unknown action: ${actionId}`);
            return;
          }
          if (act !== undefined && act !== null) {
            const canAfford = (voyage as unknown as { canAffordAction?: unknown }).canAffordAction;
            if (typeof canAfford === "function") {
              let affordable = false;
              try {
                affordable = (canAfford as (a: unknown) => boolean).call(voyage, act) === true;
              } catch {
                affordable = this.checkNumericAfford(act, voyage);
              }
              if (!affordable) {
                reply(false, "cannot afford action");
                return;
              }
            } else if (!this.checkNumericAfford(act, voyage)) {
              reply(false, "cannot afford action");
              return;
            }
          }
          const result: unknown = voyage.executeAction(actionId);
          if (result === false) {
            reply(false, "action failed");
            return;
          }
          if (result !== null && typeof result === "object") {
            const r = result as { isMenu?: unknown; success?: unknown };
            if (r.isMenu === true) {
              reply(true);
              return;
            }
            if (r.success === false) {
              reply(false, "action failed");
              return;
            }
          }
          reply(true);
          return;
        }
        case "explore":
          reply(voyage.exploreNode());
          return;
        case "desperateScavenge":
          reply(voyage.desperateScavenge());
          return;
      }
    } catch (err) {
      reply(false, err instanceof Error ? err.message : String(err));
    }
  }

  private handleStorageSet(id: string, reqId: number, key: string, value: unknown): void {
    const reply = (ok: boolean) => {
      const record = this.plugins.get(id);
      if (!record?.active) return;
      const msg: HostMessage = { type: "storage-result", reqId, value: ok };
      record.worker.postMessage(msg);
    };
    const map = this.storage.get(id);
    if (!map || typeof key !== "string" || key.length === 0 || key.length > MAX_STORAGE_KEY) {
      reply(false);
      return;
    }
    let size: number;
    try {
      size = JSON.stringify(value)?.length ?? 0;
    } catch {
      reply(false);
      return;
    }
    if (size > MAX_STORAGE_BYTES) {
      this.deps.log(`[${id}] storage rejected: value too large`);
      reply(false);
      return;
    }
    const isNewKey = !map.has(key);
    if (isNewKey && map.size >= MAX_STORAGE_KEYS) {
      this.deps.log(`[${id}] storage rejected: too many keys`);
      reply(false);
      return;
    }
    let total = 0;
    try {
      for (const [k, v] of map) {
        if (k === key) continue;
        total += JSON.stringify(v)?.length ?? 0;
      }
    } catch {
      reply(false);
      return;
    }
    if (total + size > MAX_STORAGE_TOTAL_BYTES) {
      this.deps.log(`[${id}] storage rejected: total too large`);
      reply(false);
      return;
    }
    map.set(key, clone(value));
    reply(true);
  }
}

// Re-exported so callers can distinguish bad manifests without deep imports.
export { ManifestError };
export type { PluginManifest };
export { KNOWN_EVENTS };
