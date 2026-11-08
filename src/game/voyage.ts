import { ConduitDeck } from "./conduit";
import { GAME_DATA } from "./data";
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
  YardKey,
} from "./types";

export const INITIAL_STATE: SaveState = {
  phase: GAME_DATA.phases.start!,
  jumpCount: 1,
  sectorBag: [],
  hull: GAME_DATA.config.MAX_HULL,
  fuel: GAME_DATA.config.START_FUEL,
  flux: 0,
  rep: 0,
  energy: GAME_DATA.config.START_ENERGY,
  engineTier: 0,
  weaponTier: 0,
  module: GAME_DATA.text.noneState,
  carriage: GAME_DATA.text.noneState,
  crew: GAME_DATA.text.noneState,
  dimId: GAME_DATA.nodes.hub.id,
  dimName: "Scrapyard Outpost",
  targetDimId: null,
  targetDimName: null,
  navChoices: [],
  yardCat: null,
  seenCutscenes: [],
  isSurveyed: false,
};

function cloneState(state: SaveState): SaveState {
  return JSON.parse(JSON.stringify(state)) as SaveState;
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

export class Voyage {
  state: SaveState;
  hooks: VoyageHooks;

  constructor(initial: SaveState = cloneState(INITIAL_STATE), hooks: VoyageHooks = {}) {
    this.state = cloneState(initial);
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
  }

  getMaxEnergy(): number {
    return GAME_DATA.config.START_ENERGY + this.state.engineTier;
  }

  getTravelCost(): number {
    return (
      GAME_DATA.config.TRAVEL_BASE_FUEL_COST +
      this.state.engineTier * GAME_DATA.config.TRAVEL_TIER_MULT
    );
  }

  getNextTierTravelCost(): number {
    return (
      GAME_DATA.config.TRAVEL_BASE_FUEL_COST +
      (this.state.engineTier + 1) * GAME_DATA.config.TRAVEL_TIER_MULT
    );
  }

  getForgeCost(tier: number): number {
    return (tier + 1) * GAME_DATA.config.FORGE_BASE_FLUX_COST;
  }

  applyMitigation(resourceKey: ResourceKey, rawAmount: number): number {
    if (resourceKey === "hull" && this.state.module === GAME_DATA.yard.exo.name) {
      return Math.round(rawAmount * GAME_DATA.config.EXO_DMG_MULT);
    }
    return rawAmount;
  }

  getActualCost(rule: {
    res: NumericResource;
    amount: (s: SaveState, c: GameConfig) => number;
  }): number {
    return this.applyMitigation(rule.res, rule.amount(this.state, GAME_DATA.config));
  }

  canAffordAction(act: GameAction): boolean {
    for (const [rKey, rVal] of Object.entries(act.requires || {})) {
      const key = rKey as ResourceKey;
      const current = this.state[key];
      if (typeof current === "number" && typeof rVal === "number" && current < rVal) return false;
      if (typeof rVal === "string" && current !== rVal) return false;
      if (typeof rVal === "number" && typeof current !== "number") return false;
    }
    for (const rule of act.consumes) {
      if (this.state[rule.res] < this.getActualCost(rule)) return false;
    }
    return true;
  }

  canSurvive(): boolean {
    if (this.state.hull <= GAME_DATA.config.DEATH_HULL_THRESHOLD) return false;
    if (this.state.fuel >= this.getTravelCost()) return true;
    if (this.state.hull > GAME_DATA.config.DESPERATE_HULL_COST) return true;

    const node = GAME_DATA.nodes[this.state.dimId];
    if (this.state.phase === GAME_DATA.phases.idle && this.state.energy >= node.exploreCost)
      return true;

    if (this.state.phase === GAME_DATA.phases.encounter) {
      return node.actions.some((actId) => {
        const act = GAME_DATA.actions[actId];
        return act !== undefined && !act.isMenu && this.canAffordAction(act);
      });
    }
    return false;
  }

  evaluateSurvival(): Phase | null {
    if (this.state.phase === GAME_DATA.phases.dialogue) return null;
    if (this.state.hull <= GAME_DATA.config.DEATH_HULL_THRESHOLD) {
      return GAME_DATA.phases.dead!;
    }
    if (!this.canSurvive()) {
      return GAME_DATA.phases.stranded!;
    }
    return null;
  }

  enforceStateBounds(): void {
    if (this.state.hull > GAME_DATA.config.MAX_HULL) this.state.hull = GAME_DATA.config.MAX_HULL;
    if (this.state.hull < 0) this.state.hull = 0;
    if (this.state.energy > this.getMaxEnergy()) this.state.energy = this.getMaxEnergy();
  }

  hasObserverDeparted(): boolean {
    return (this.state.seenCutscenes || []).includes(GAME_DATA.config.CORVUS_FINAL_CUTSCENE);
  }

  assertInvariants(): string[] {
    const breaches: string[] = [];
    if (this.state.hull > GAME_DATA.config.MAX_HULL) breaches.push("Hull > Max");
    if (this.state.hull < 0 || this.state.energy < 0 || this.state.fuel < 0 || this.state.flux < 0)
      breaches.push("Resource dropped below 0");
    if (!GAME_DATA.permissions[this.state.phase])
      breaches.push(`No permissions defined for phase '${this.state.phase}'`);
    return breaches;
  }

  exploreNode(): boolean {
    const node = GAME_DATA.nodes[this.state.dimId];
    if (this.state.energy < node.exploreCost) return false;

    this.state.energy -= node.exploreCost;
    this.state.isSurveyed = true;
    this.enforceStateBounds();
    return true;
  }

  executeAction(actId: ActionId): ExecuteActionResult {
    const act = GAME_DATA.actions[actId];
    if (!act) return { isMenu: false, success: false };

    if (act.isMenu) {
      return { isMenu: true, menuTarget: act.menuTarget! };
    }

    for (const rule of act.consumes) {
      this.state[rule.res] -= this.getActualCost(rule);
    }

    const roll = this.hooks.random ? this.hooks.random() : Math.random();
    const success = !act.probability || roll <= act.probability(this.state, GAME_DATA.config);

    let sound: "success" | "damage" | undefined;
    if (success) {
      if (act.produces) {
        for (const rule of act.produces) {
          this.state[rule.res] += rule.amount(this.state, GAME_DATA.config);
        }
      }
      sound = "success";
    } else {
      if (act.failConsumes) {
        for (const rule of act.failConsumes) {
          this.state[rule.res] -= this.getActualCost(rule);
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
      logClass: success ? GAME_DATA.dom.classes.logSuccess! : GAME_DATA.dom.classes.logDamage!,
    };
  }

  desperateScavenge(): boolean {
    if (this.state.hull <= GAME_DATA.config.DESPERATE_HULL_COST) return false;
    this.state.hull -= GAME_DATA.config.DESPERATE_HULL_COST;
    this.state.fuel += GAME_DATA.config.DESPERATE_FUEL_YIELD;
    this.enforceStateBounds();
    this.hooks.onSound?.("damage");
    return true;
  }

  forgeUpgrade(tierKey: TierKey, onUpgrade?: () => void): boolean {
    const cost = this.getForgeCost(this.state[tierKey]);
    if (this.state.flux >= cost && this.state[tierKey] < GAME_DATA.config.MAX_TIER) {
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

  buyYardItem(itemKey: YardKey): boolean {
    const item = GAME_DATA.yard[itemKey];
    if (!item || this.state.flux < item.cost) return false;

    this.state.flux -= item.cost;
    this.state[item.type] = item.name;
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
    const hasAstrolabe = this.state.module === GAME_DATA.yard.astro.name;
    const choices = ConduitDeck.getTrajectories(this.state.jumpCount, hasAstrolabe);

    if (hasAstrolabe) {
      this.state.navChoices = choices;
      return { isNavigating: true, choices };
    } else {
      const choice = choices[0];
      if (!choice) return null;
      this.state.targetDimId = choice.id;
      this.state.targetDimName = choice.name;
      return {
        isNavigating: false,
        targetDimId: choice.id,
        targetDimName: choice.name,
      };
    }
  }

  commitJumpTarget(dimId: string, dimName: string): void {
    this.state.targetDimId = dimId;
    this.state.targetDimName = dimName;
  }

  completeJump(
    targetDimId: string,
    targetDimName: string,
  ): {
    jumpCount: number;
    greenhouseYield: number;
    goblinYield: number;
  } {
    this.state.jumpCount++;
    this.state.energy = this.getMaxEnergy();

    let greenhouseYield = 0;
    let goblinYield = 0;

    if (this.state.carriage === GAME_DATA.yard.green.name) {
      this.state.fuel += GAME_DATA.config.GREENHOUSE_FUEL_YIELD;
      greenhouseYield = GAME_DATA.config.GREENHOUSE_FUEL_YIELD;
    }
    if (
      this.state.crew === GAME_DATA.yard.goblin.name &&
      this.state.hull < GAME_DATA.config.MAX_HULL
    ) {
      this.state.hull = Math.min(
        GAME_DATA.config.MAX_HULL,
        this.state.hull + GAME_DATA.config.GOBLIN_HULL_YIELD,
      );
      goblinYield = GAME_DATA.config.GOBLIN_HULL_YIELD;
    }

    this.state.dimId = targetDimId as SaveState["dimId"];
    this.state.dimName = targetDimName;
    this.state.targetDimId = null;
    this.state.targetDimName = null;
    this.state.isSurveyed = false;

    this.enforceStateBounds();
    this.hooks.onSave?.();

    return {
      jumpCount: this.state.jumpCount,
      greenhouseYield,
      goblinYield,
    };
  }

  markCutsceneSeen(id: string): void {
    if (!this.state.seenCutscenes) this.state.seenCutscenes = [];
    if (!this.state.seenCutscenes.includes(id)) {
      this.state.seenCutscenes.push(id);
    }
  }

  loadState(saved: SerializedVoyage | null): void {
    if (!saved) return;
    Object.assign(this.state, saved);
    this.state.phase = GAME_DATA.phases.start!;
    ConduitDeck.init(saved.sectorBag);
    this.enforceStateBounds();
  }

  resetState(): void {
    this.state = cloneState(INITIAL_STATE);
    ConduitDeck.init();
  }

  serialize(): SerializedVoyage {
    return {
      jumpCount: this.state.jumpCount,
      sectorBag: ConduitDeck.serialize(),
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
      seenCutscenes: this.state.seenCutscenes || [],
    };
  }
}
