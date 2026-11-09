// Worker <-> host wire protocol. Types here are structural mirrors of the
// core game types (SaveState, GameAction, NodeDefinition) so this file
// stays independent of the core module layout; keep in sync manually.

export const HOST_API_VERSION = 2;

/** Frozen game-state snapshot (SaveState shape, JSON-only). */
export type StateSnapshot = {
  phase: string;
  jumpCount: number;
  dimId: string;
  dimName: string;
  hull: number;
  fuel: number;
  flux: number;
  rep: number;
  energy: number;
  engineTier: number;
  weaponTier: number;
  module: string;
  carriage: string;
  crew: string;
  isSurveyed: boolean;
  seenCutscenes: string[];
};

export type PluginEventName =
  | "onEnter"
  | `onEnter:${string}`
  | "beforeAction"
  | "afterAction"
  | "afterJump"
  | "onDeath"
  | "onSave";

export const KNOWN_EVENTS: ReadonlySet<string> = new Set([
  "beforeAction",
  "afterAction",
  "afterJump",
  "onDeath",
  "onSave",
]);

/** Mutation requests a plugin may make through api.grant(). Closed set. */
export type GrantOp =
  | { kind: "adjustResource"; resource: string; amount: number }
  | { kind: "executeAction"; actionId: string }
  | { kind: "explore" }
  | { kind: "desperateScavenge" };

/** Permission string each GrantOp kind requires (or "*"). */
export const GRANT_PERMISSIONS: Record<GrantOp["kind"], string> = {
  adjustResource: "voyage:adjustResource",
  executeAction: "voyage:executeAction",
  explore: "voyage:explore",
  desperateScavenge: "voyage:desperate",
};

export const ADJUSTABLE_RESOURCES: ReadonlySet<string> = new Set([
  "hull",
  "fuel",
  "energy",
  "flux",
  "rep",
]);

export const MAX_GRANT_AMOUNT = 1_000_000;

export interface RegisteredAction {
  id: string;
  label: string;
  [key: string]: unknown;
}

export interface RegisteredNode {
  id: string;
  label: string;
  desc?: string;
  [key: string]: unknown;
}

export interface RegisteredStoryline {
  id: string;
  [key: string]: unknown;
}

/** Worker-facing plugin API (implemented by the in-blob bridge). */
export interface PluginApi {
  on(event: PluginEventName, fn: (payload: unknown) => void): void;
  registerAction(def: RegisteredAction): void;
  registerNode(def: RegisteredNode): void;
  registerStoryline(def: RegisteredStoryline): void;
  grant(op: GrantOp): Promise<{ ok: boolean; reason?: string }>;
  /** Frozen snapshot of the latest known state (cached from host pushes). */
  state(): Readonly<StateSnapshot>;
  log(msg: unknown): void;
  storage: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<boolean>;
  };
}

// ---- Messages (worker -> host) --------------------------------------------

export type WorkerMessage =
  | { type: "ready" }
  | { type: "fatal"; message: string }
  | { type: "api-call"; method: string; args?: unknown; phase?: "call" | "result" | "event" }
  | { type: "log"; msg: string }
  | { type: "register-action"; def: RegisteredAction }
  | { type: "register-node"; def: RegisteredNode }
  | { type: "register-storyline"; def: RegisteredStoryline }
  | { type: "grant"; reqId: number; op: GrantOp }
  | { type: "storage-get"; reqId: number; key: string }
  | { type: "storage-set"; reqId: number; key: string; value: unknown };

// ---- Messages (host -> worker) --------------------------------------------

export type HostMessage =
  | { type: "init"; pluginId: string; permissions: string[]; snapshot: StateSnapshot }
  | { type: "event"; event: PluginEventName; payload: unknown; snapshot: StateSnapshot }
  | { type: "grant-result"; reqId: number; ok: boolean; reason?: string }
  | { type: "storage-result"; reqId: number; value: unknown }
  | { type: "shutdown" };

// ---- Host-side injected deps ----------------------------------------------

/** Minimal Voyage surface the host needs (structural; matches Voyage). */
export interface VoyageLike {
  getSnapshot(): StateSnapshot;
  executeAction(actionId: string): unknown;
  exploreNode(): boolean;
  desperateScavenge(): boolean;
  /** Apply a validated numeric resource delta (optional; see host fallback). */
  adjustResource?(resource: string, amount: number): void;
  /** Live state bag, used as fallback when adjustResource is absent. */
  state?: StateSnapshot;
  enforceStateBounds?(): void;
}

export interface RegistryLike {
  registerAction(pluginId: string, def: RegisteredAction): void;
  registerNode(pluginId: string, def: RegisteredNode): void;
  removePlugin(pluginId: string): void;
}

export interface StorylineRegistryLike {
  register(pluginId: string, def: unknown): void;
  removePlugin(pluginId: string): void;
}

export interface GameEventSource {
  on(event: string, cb: (payload: unknown) => void): void;
}

export interface HostDeps {
  voyage: VoyageLike;
  registry: RegistryLike;
  storylines?: StorylineRegistryLike;
  log: (msg: string) => void;
  events: GameEventSource;
}
