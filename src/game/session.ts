import { GAME_DATA } from "./data";
import { SoundFX } from "./audio";
import { ref } from "../stores/refs.svelte";
import { Engine } from "./engine";
import { SaveSystem } from "./save";
import { Voyage } from "./voyage";
import { INITIAL_STATE } from "./voyage";
import type {
  ActionId,
  GameAction,
  NumericResource,
  Phase,
  ResourceKey,
  SaveState,
  SerializedVoyage,
  TierKey,
  Trajectory,
  YardKey,
} from "./types";

export { INITIAL_STATE };

const inner = new Voyage(undefined, {
  onSound: (kind) => {
    if (kind === "success") SoundFX.playActionSuccess();
    else SoundFX.playActionDamage();
  },
  onSave: () => SaveSystem.save(),
});

export const VoyageSession = {
  getSnapshot(): SaveState {
    return inner.getSnapshot();
  },
  getPhase(): Phase {
    return inner.getPhase();
  },
  setPhase(phase: Phase): void {
    inner.setPhase(phase);
  },
  getMaxEnergy(): number {
    return inner.getMaxEnergy();
  },
  getTravelCost(): number {
    return inner.getTravelCost();
  },
  getNextTierTravelCost(): number {
    return inner.getNextTierTravelCost();
  },
  getForgeCost(tier: number): number {
    return inner.getForgeCost(tier);
  },
  applyMitigation(resourceKey: ResourceKey, rawAmount: number): number {
    return inner.applyMitigation(resourceKey, rawAmount);
  },
  getActualCost(rule: {
    res: NumericResource;
    amount: (s: SaveState, c: import("./types").GameConfig) => number;
  }): number {
    return inner.getActualCost(rule);
  },
  canAffordAction(act: GameAction): boolean {
    return inner.canAffordAction(act);
  },
  canSurvive(): boolean {
    return inner.canSurvive();
  },
  evaluateSurvival(): void {
    const next = inner.evaluateSurvival();
    if (next) Engine.transitionTo(next);
  },
  enforceStateBounds(): void {
    inner.enforceStateBounds();
  },
  hasObserverDeparted(): boolean {
    return inner.hasObserverDeparted();
  },
  assertInvariants(): void {
    for (const breach of inner.assertInvariants()) {
      console.error(`INVARIANT BREACH: ${breach}`);
    }
    const portrait = ref(GAME_DATA.dom.ids.corvusPortrait!);
    if (portrait) {
      const departed = inner.hasObserverDeparted();
      if (!!portrait.hidden !== departed)
        console.error("INVARIANT BREACH: Observer presence out of sync with save state");
    }
  },
  exploreNode(): boolean {
    return inner.exploreNode();
  },
  executeAction(
    actId: ActionId,
  ):
    | { isMenu: false; success: number | boolean; logText?: string; logClass?: string }
    | { isMenu: true; menuTarget: Phase } {
    const res = inner.executeAction(actId);
    if (res.isMenu) return res;
    return res as { isMenu: false; success: number | boolean; logText?: string; logClass?: string };
  },
  desperateScavenge(): boolean {
    return inner.desperateScavenge();
  },
  forgeUpgrade(tierKey: TierKey, onUpgrade?: () => void): boolean {
    return inner.forgeUpgrade(tierKey, onUpgrade);
  },
  setYardCategory(cat: string): void {
    inner.setYardCategory(cat);
  },
  buyYardItem(itemKey: YardKey): boolean {
    return inner.buyYardItem(itemKey);
  },
  initiateTravel():
    | { isNavigating: true; choices: Trajectory[] }
    | { isNavigating: false; targetDimId: string; targetDimName: string }
    | null {
    return inner.initiateTravel();
  },
  commitJumpTarget(dimId: string, dimName: string): void {
    inner.commitJumpTarget(dimId, dimName);
  },
  completeJump(
    targetDimId: string,
    targetDimName: string,
  ): {
    jumpCount: number;
    greenhouseYield: number;
    goblinYield: number;
  } {
    return inner.completeJump(targetDimId, targetDimName);
  },
  markCutsceneSeen(id: string): void {
    inner.markCutsceneSeen(id);
  },
  loadState(saved: SerializedVoyage | null): void {
    inner.loadState(saved);
  },
  resetState(): void {
    inner.resetState();
  },
  serialize(): SerializedVoyage {
    return inner.serialize();
  },
};
