import type { ConduitDeck } from "./conduit";
import type { Registry } from "./registry";
import type {
  ActionId,
  GameAction,
  GameConfig,
  NumericResource,
  Phase,
  ResourceKey,
  SaveState,
  SerializedVoyage,
  TierKey,
  Trajectory,
} from "./types";

function cloneState(state: SaveState): SaveState {
  return JSON.parse(JSON.stringify(state)) as SaveState;
}

function finiteNum(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampNum(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createInitialState(config: GameConfig): SaveState {
  return {
    phase: "START",
    jumpCount: 1,
    sectorBag: [],
    hull: config.MAX_HULL,
    fuel: config.START_FUEL,
    flux: 0,
    rep: 0,
    energy: config.START_ENERGY,
    engineTier: 0,
    weaponTier: 0,
    module: "None",
    carriage: "None",
    crew: "None",
    dimId: "hub",
    dimName: "Scrapyard Outpost",
    targetDimId: null,
    targetDimName: null,
    navChoices: [],
    yardCat: null,
    seenCutscenes: [],
    isSurveyed: false,
    pluginState: {},
  };
}

export interface VoyageHooks {
  onTransition?: (phase: Phase) => void;
  onSound?: (kind: "success" | "damage") => void;
  onSave?: () => void;
  random?: () => number;
}

export type ExecuteActionResult =
  | {
      isMenu: false;
      success: boolean;
      logText?: string;
      logClass?: string;
      sound?: "success" | "damage";
    }
  | { isMenu: true; menuTarget: Phase };

/** Pure voyage core. Registry + config injected. */
export class Voyage {
  state: SaveState;
  hooks: VoyageHooks;
  private readonly registry: Registry;
  private readonly config: GameConfig;
  private readonly conduit: ConduitDeck;

  constructor(
    registry: Registry,
    config: GameConfig,
    conduit: ConduitDeck,
    initial?: SaveState,
    hooks: VoyageHooks = {},
  ) {
    this.registry = registry;
    this.config = config;
    this.conduit = conduit;
    this.state = cloneState(initial ?? createInitialState(config));
    this.hooks = hooks;
  }

  getSnapshot(): SaveState {
    return { ...this.state };
  }

  getPhase(): Phase {
    return this.state.phase;
  }

  setPhase(phase: Phase): void {
    this.state.phase = phase;
    this.hooks.onTransition?.(phase);
  }

  getMaxEnergy(): number {
    return this.config.START_ENERGY + this.state.engineTier;
  }

  getTravelCost(): number {
    return this.config.TRAVEL_BASE_FUEL_COST + this.state.engineTier * this.config.TRAVEL_TIER_MULT;
  }

  getNextTierTravelCost(): number {
    return (
      this.config.TRAVEL_BASE_FUEL_COST +
      (this.state.engineTier + 1) * this.config.TRAVEL_TIER_MULT
    );
  }

  getForgeCost(tier: number): number {
    return (tier + 1) * this.config.FORGE_BASE_FLUX_COST;
  }

  private exoName(): string | undefined {
    return this.registry.getYardItem("exo")?.name;
  }

  applyMitigation(resourceKey: ResourceKey, rawAmount: number): number {
    if (resourceKey === "hull" && this.state.module === this.exoName()) {
      return Math.round(rawAmount * this.config.EXO_DMG_MULT);
    }
    return rawAmount;
  }

  getActualCost(rule: {
    res: NumericResource;
    amount: (s: SaveState, c: GameConfig) => number;
  }): number {
    return this.applyMitigation(rule.res, rule.amount(this.state, this.config));
  }

  private node(): { exploreCost: number; actions: ActionId[] } {
    const n = this.registry.getNode(this.state.dimId);
    return { exploreCost: n?.exploreCost ?? 1, actions: n?.actions ?? [] };
  }

  canAffordAction(act: GameAction): boolean {
    for (const [rKey, rVal] of Object.entries(act.requires ?? {})) {
      const key = rKey as ResourceKey;
      const current = (this.state as unknown as Record<string, unknown>)[key];
      if (typeof current === "number" && typeof rVal === "number" && current < rVal) return false;
      if (typeof rVal === "string" && current !== rVal) return false;
      if (typeof rVal === "number" && typeof current !== "number") return false;
    }
    for (const rule of act.consumes) {
      const cur = (this.state as unknown as Record<string, number>)[rule.res] ?? 0;
      if (cur < this.getActualCost(rule)) return false;
    }
    return true;
  }

  canSurvive(): boolean {
    if (this.state.hull <= this.config.DEATH_HULL_THRESHOLD) return false;
    if (this.state.fuel >= this.getTravelCost()) return true;
    if (this.state.hull > this.config.DESPERATE_HULL_COST) return true;

    const node = this.node();
    if (this.state.phase === "IDLE" && this.state.energy >= node.exploreCost) return true;

    if (this.state.phase === "ENCOUNTER") {
      return node.actions.some((actId) => {
        const act = this.registry.getAction(actId);
        return act !== undefined && !act.isMenu && this.canAffordAction(act);
      });
    }
    return false;
  }

  evaluateSurvival(): Phase | null {
    if (this.state.phase === "DIALOGUE") return null;
    if (this.state.hull <= this.config.DEATH_HULL_THRESHOLD) return "DEAD";
    if (!this.canSurvive()) return "STRANDED";
    return null;
  }

  enforceStateBounds(): void {
    const s = this.state;
    const maxHull = this.config.MAX_HULL;
    s.hull = clampNum(finiteNum(s.hull, maxHull), 0, maxHull);
    s.fuel = clampNum(finiteNum(s.fuel, 0), 0, Number.MAX_SAFE_INTEGER);
    s.flux = clampNum(finiteNum(s.flux, 0), 0, Number.MAX_SAFE_INTEGER);
    s.rep = clampNum(finiteNum(s.rep, 0), 0, Number.MAX_SAFE_INTEGER);
    s.engineTier = clampNum(Math.floor(finiteNum(s.engineTier, 0)), 0, this.config.MAX_TIER);
    s.weaponTier = clampNum(Math.floor(finiteNum(s.weaponTier, 0)), 0, this.config.MAX_TIER);
    s.energy = clampNum(finiteNum(s.energy, 0), 0, this.getMaxEnergy());
    s.jumpCount = clampNum(Math.floor(finiteNum(s.jumpCount, 1)), 1, Number.MAX_SAFE_INTEGER);
  }

  hasObserverDeparted(): boolean {
    return (this.state.seenCutscenes ?? []).includes(this.config.CORVUS_FINAL_CUTSCENE);
  }

  assertInvariants(): string[] {
    const breaches: string[] = [];
    if (this.state.hull > this.config.MAX_HULL) breaches.push("Hull > Max");
    if (this.state.hull < 0 || this.state.energy < 0 || this.state.fuel < 0 || this.state.flux < 0)
      breaches.push("Resource dropped below 0");
    return breaches;
  }

  exploreNode(): boolean {
    const node = this.node();
    if (this.state.energy < node.exploreCost) return false;
    this.state.energy -= node.exploreCost;
    this.state.isSurveyed = true;
    this.enforceStateBounds();
    return true;
  }

  private addRes(res: string, delta: number): void {
    const rec = this.state as unknown as Record<string, number>;
    rec[res] = (rec[res] ?? 0) + delta;
  }

  executeAction(actId: ActionId): ExecuteActionResult {
    const act = this.registry.getAction(actId);
    if (!act) return { isMenu: false, success: false };
    if (act.isMenu) return { isMenu: true, menuTarget: act.menuTarget ?? "IDLE" };
    if (!this.canAffordAction(act)) return { isMenu: false, success: false };

    for (const rule of act.consumes) {
      this.addRes(rule.res, -this.getActualCost(rule));
    }

    const roll = this.hooks.random?.() ?? 0.5;
    const success = !act.probability || roll <= act.probability(this.state, this.config);

    let sound: "success" | "damage" | undefined;
    if (success) {
      if (act.produces) {
        for (const rule of act.produces) {
          this.addRes(rule.res, rule.amount(this.state, this.config));
        }
      }
      sound = "success";
    } else {
      if (act.failConsumes) {
        for (const rule of act.failConsumes) {
          this.addRes(rule.res, -this.getActualCost(rule));
        }
      }
      sound = "damage";
    }

    if (sound === "success") this.hooks.onSound?.("success");
    if (sound === "damage") this.hooks.onSound?.("damage");
    this.enforceStateBounds();

    return {
      isMenu: false,
      success,
      sound,
      logText: success ? act.logSuccess : act.logFail,
      logClass: success ? "log-success" : "log-damage",
    };
  }

  desperateScavenge(): boolean {
    if (this.state.hull <= this.config.DESPERATE_HULL_COST) return false;
    this.state.hull -= this.config.DESPERATE_HULL_COST;
    this.state.fuel += this.config.DESPERATE_FUEL_YIELD;
    this.enforceStateBounds();
    this.hooks.onSound?.("damage");
    return true;
  }

  forgeUpgrade(tierKey: TierKey, onUpgrade?: () => void): boolean {
    const cost = this.getForgeCost(this.state[tierKey]);
    if (this.state.flux >= cost && this.state[tierKey] < this.config.MAX_TIER) {
      this.state.flux -= cost;
      this.state[tierKey]++;
      if (onUpgrade) onUpgrade();
      this.enforceStateBounds();
      this.hooks.onSound?.("success");
      return true;
    }
    return false;
  }

  setYardCategory(cat: string): void {
    this.state.yardCat = cat;
  }

  buyYardItem(itemKey: string): boolean {
    const item = this.registry.getYardItem(itemKey);
    if (!item || this.state.flux < item.cost) return false;
    this.state.flux -= item.cost;
    (this.state as unknown as Record<string, string>)[item.type] = item.name;
    this.hooks.onSound?.("success");
    return true;
  }

  initiateTravel():
    | { isNavigating: true; choices: Trajectory[] }
    | { isNavigating: false; targetDimId: string; targetDimName: string }
    | null {
    const cost = this.getTravelCost();
    if (this.state.fuel < cost) return null;
    this.state.fuel -= cost;
    const hasAstrolabe = this.state.module === this.registry.getYardItem("astro")?.name;
    const choices = this.conduit.getTrajectories(this.state.jumpCount, hasAstrolabe);
    if (hasAstrolabe) {
      this.state.navChoices = choices;
      return { isNavigating: true, choices };
    }
    const choice = choices[0];
    if (!choice) return null;
    this.state.targetDimId = choice.id;
    this.state.targetDimName = choice.name;
    return { isNavigating: false, targetDimId: choice.id, targetDimName: choice.name };
  }

  commitJumpTarget(dimId: string, dimName: string): void {
    this.state.targetDimId = dimId;
    this.state.targetDimName = dimName;
  }

  completeJump(
    targetDimId: string,
    targetDimName: string,
  ): { jumpCount: number; greenhouseYield: number; goblinYield: number } {
    this.state.jumpCount++;
    this.state.energy = this.getMaxEnergy();
    let greenhouseYield = 0;
    let goblinYield = 0;
    if (this.state.carriage === this.registry.getYardItem("green")?.name) {
      this.state.fuel += this.config.GREENHOUSE_FUEL_YIELD;
      greenhouseYield = this.config.GREENHOUSE_FUEL_YIELD;
    }
    if (
      this.state.crew === this.registry.getYardItem("goblin")?.name &&
      this.state.hull < this.config.MAX_HULL
    ) {
      this.state.hull = Math.min(
        this.config.MAX_HULL,
        this.state.hull + this.config.GOBLIN_HULL_YIELD,
      );
      goblinYield = this.config.GOBLIN_HULL_YIELD;
    }
    this.state.dimId = targetDimId;
    this.state.dimName = targetDimName;
    this.state.targetDimId = null;
    this.state.targetDimName = null;
    this.state.isSurveyed = false;
    this.enforceStateBounds();
    this.hooks.onSave?.();
    return { jumpCount: this.state.jumpCount, greenhouseYield, goblinYield };
  }

  markCutsceneSeen(id: string): void {
    if (!this.state.seenCutscenes) this.state.seenCutscenes = [];
    if (!this.state.seenCutscenes.includes(id)) this.state.seenCutscenes.push(id);
  }

  loadState(saved: SerializedVoyage | null): void {
    if (!saved) return;
    const cur = this.state;
    const sanitized: SerializedVoyage = {
      jumpCount: clampNum(Math.floor(finiteNum(saved.jumpCount, cur.jumpCount)), 1, Number.MAX_SAFE_INTEGER),
      sectorBag: Array.isArray(saved.sectorBag) ? saved.sectorBag.filter((x): x is string => typeof x === "string") : cur.sectorBag,
      hull: clampNum(finiteNum(saved.hull, cur.hull), 0, this.config.MAX_HULL),
      fuel: clampNum(finiteNum(saved.fuel, cur.fuel), 0, Number.MAX_SAFE_INTEGER),
      flux: clampNum(finiteNum(saved.flux, cur.flux), 0, Number.MAX_SAFE_INTEGER),
      rep: clampNum(finiteNum(saved.rep, cur.rep), 0, Number.MAX_SAFE_INTEGER),
      energy: clampNum(finiteNum(saved.energy, cur.energy), 0, Number.MAX_SAFE_INTEGER),
      engineTier: clampNum(Math.floor(finiteNum(saved.engineTier, cur.engineTier)), 0, this.config.MAX_TIER),
      weaponTier: clampNum(Math.floor(finiteNum(saved.weaponTier, cur.weaponTier)), 0, this.config.MAX_TIER),
      module: typeof saved.module === "string" ? saved.module : cur.module,
      carriage: typeof saved.carriage === "string" ? saved.carriage : cur.carriage,
      crew: typeof saved.crew === "string" ? saved.crew : cur.crew,
      dimId: typeof saved.dimId === "string" && saved.dimId ? saved.dimId : cur.dimId,
      dimName: typeof saved.dimName === "string" && saved.dimName ? saved.dimName : cur.dimName,
      isSurveyed: !!saved.isSurveyed,
      seenCutscenes: Array.isArray(saved.seenCutscenes) ? saved.seenCutscenes.filter((x): x is string => typeof x === "string") : cur.seenCutscenes,
      pluginState:
        typeof saved.pluginState === "object" && saved.pluginState !== null && !Array.isArray(saved.pluginState)
          ? { ...saved.pluginState }
          : {},
    };
    Object.assign(this.state, sanitized);
    this.state.phase = "START";
    this.conduit.init(sanitized.sectorBag);
    this.enforceStateBounds();
  }

  resetState(): void {
    this.state = createInitialState(this.config);
    this.conduit.init();
  }

  serialize(): SerializedVoyage {
    return {
      jumpCount: this.state.jumpCount,
      sectorBag: this.conduit.serialize(),
      hull: this.state.hull,
      fuel: this.state.fuel,
      flux: this.state.flux,
      rep: this.state.rep,
      energy: this.state.energy,
      engineTier: this.state.engineTier,
      weaponTier: this.state.weaponTier,
      module: this.state.module,
      carriage: this.state.carriage,
      crew: this.state.crew,
      dimId: this.state.dimId,
      dimName: this.state.dimName,
      isSurveyed: !!this.state.isSurveyed,
      seenCutscenes: this.state.seenCutscenes ?? [],
      pluginState: { ...this.state.pluginState },
    };
  }
}
