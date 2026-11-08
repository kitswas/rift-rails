import { DOM } from "../ui/dom";
import { SoundFX } from "./audio";
import { ConduitDeck } from "./conduit";
import { GAME_DATA } from "./data";
import { Engine } from "./engine";
import { SaveSystem } from "./save";
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

export const VoyageSession = (() => {
  let _state: SaveState = cloneState(INITIAL_STATE);

  const api = {
    getSnapshot(): SaveState {
      return { ..._state };
    },

    getPhase(): Phase {
      return _state.phase;
    },

    setPhase(phase: Phase): void {
      _state.phase = phase;
    },

    getMaxEnergy(): number {
      return GAME_DATA.config.START_ENERGY + _state.engineTier;
    },

    getTravelCost(): number {
      return (
        GAME_DATA.config.TRAVEL_BASE_FUEL_COST +
        _state.engineTier * GAME_DATA.config.TRAVEL_TIER_MULT
      );
    },

    getNextTierTravelCost(): number {
      return (
        GAME_DATA.config.TRAVEL_BASE_FUEL_COST +
        (_state.engineTier + 1) * GAME_DATA.config.TRAVEL_TIER_MULT
      );
    },

    getForgeCost(tier: number): number {
      return (tier + 1) * GAME_DATA.config.FORGE_BASE_FLUX_COST;
    },

    applyMitigation(resourceKey: ResourceKey, rawAmount: number): number {
      if (resourceKey === "hull" && _state.module === GAME_DATA.yard.exo.name) {
        return Math.round(rawAmount * GAME_DATA.config.EXO_DMG_MULT);
      }
      return rawAmount;
    },

    getActualCost(rule: {
      res: NumericResource;
      amount: (s: SaveState, c: GameConfig) => number;
    }): number {
      return api.applyMitigation(rule.res, rule.amount(_state, GAME_DATA.config));
    },

    canAffordAction(act: GameAction): boolean {
      for (const [rKey, rVal] of Object.entries(act.requires || {})) {
        const key = rKey as ResourceKey;
        const current = _state[key];
        if (typeof current === "number" && typeof rVal === "number" && current < rVal) return false;
        if (typeof rVal === "string" && current !== rVal) return false;
        if (typeof rVal === "number" && typeof current !== "number") return false;
      }
      for (const rule of act.consumes) {
        if (_state[rule.res] < api.getActualCost(rule)) return false;
      }
      return true;
    },

    canSurvive(): boolean {
      if (_state.hull <= GAME_DATA.config.DEATH_HULL_THRESHOLD) return false;
      if (_state.fuel >= api.getTravelCost()) return true;
      if (_state.hull > GAME_DATA.config.DESPERATE_HULL_COST) return true;

      const node = GAME_DATA.nodes[_state.dimId];
      if (_state.phase === GAME_DATA.phases.idle && _state.energy >= node.exploreCost) return true;

      if (_state.phase === GAME_DATA.phases.encounter) {
        return node.actions.some((actId) => {
          const act = GAME_DATA.actions[actId];
          return act !== undefined && !act.isMenu && api.canAffordAction(act);
        });
      }
      return false;
    },

    evaluateSurvival(): void {
      if (_state.phase === GAME_DATA.phases.dialogue) return;
      if (_state.hull <= GAME_DATA.config.DEATH_HULL_THRESHOLD) {
        Engine.transitionTo(GAME_DATA.phases.dead!);
      } else if (!api.canSurvive()) {
        Engine.transitionTo(GAME_DATA.phases.stranded!);
      }
    },

    enforceStateBounds(): void {
      if (_state.hull > GAME_DATA.config.MAX_HULL) _state.hull = GAME_DATA.config.MAX_HULL;
      if (_state.hull < 0) _state.hull = 0;
      if (_state.energy > api.getMaxEnergy()) _state.energy = api.getMaxEnergy();
    },

    hasObserverDeparted(): boolean {
      return (_state.seenCutscenes || []).includes(GAME_DATA.config.CORVUS_FINAL_CUTSCENE);
    },

    assertInvariants(): void {
      if (_state.hull > GAME_DATA.config.MAX_HULL) console.error("INVARIANT BREACH: Hull > Max");
      if (_state.hull < 0 || _state.energy < 0 || _state.fuel < 0 || _state.flux < 0)
        console.error("INVARIANT BREACH: Resource dropped below 0");
      if (!GAME_DATA.permissions[_state.phase])
        console.error(`INVARIANT BREACH: No permissions defined for phase '${_state.phase}'`);
      if (DOM.corvusPortrait) {
        const departed = api.hasObserverDeparted();
        if (!!DOM.corvusPortrait.hidden !== departed)
          console.error("INVARIANT BREACH: Observer presence out of sync with save state");
      }
    },

    exploreNode(): boolean {
      const node = GAME_DATA.nodes[_state.dimId];
      if (_state.energy < node.exploreCost) return false;

      _state.energy -= node.exploreCost;
      _state.isSurveyed = true;
      api.enforceStateBounds();
      return true;
    },

    executeAction(
      actId: ActionId,
    ):
      | { isMenu: false; success: boolean; logText?: string; logClass?: string }
      | { isMenu: true; menuTarget: Phase } {
      const act = GAME_DATA.actions[actId];
      if (!act) return { isMenu: false, success: false };

      if (act.isMenu) {
        return { isMenu: true, menuTarget: act.menuTarget! };
      }

      for (const rule of act.consumes) {
        _state[rule.res] -= api.getActualCost(rule);
      }

      const success =
        !act.probability || Math.random() <= act.probability(_state, GAME_DATA.config);

      if (success) {
        if (act.produces) {
          for (const rule of act.produces) {
            _state[rule.res] += rule.amount(_state, GAME_DATA.config);
          }
        }
        SoundFX.playActionSuccess();
      } else {
        if (act.failConsumes) {
          for (const rule of act.failConsumes) {
            _state[rule.res] -= api.getActualCost(rule);
          }
        }
        SoundFX.playActionDamage();
      }

      api.enforceStateBounds();

      return {
        isMenu: false,
        success,
        logText: success ? act.logSuccess : act.logFail,
        logClass: success ? GAME_DATA.dom.classes.logSuccess! : GAME_DATA.dom.classes.logDamage!,
      };
    },

    desperateScavenge(): boolean {
      if (_state.hull <= GAME_DATA.config.DESPERATE_HULL_COST) return false;
      _state.hull -= GAME_DATA.config.DESPERATE_HULL_COST;
      _state.fuel += GAME_DATA.config.DESPERATE_FUEL_YIELD;
      api.enforceStateBounds();
      SoundFX.playActionDamage();
      return true;
    },

    forgeUpgrade(tierKey: TierKey, onUpgrade?: () => void): boolean {
      const cost = api.getForgeCost(_state[tierKey]);
      if (_state.flux >= cost && _state[tierKey] < GAME_DATA.config.MAX_TIER) {
        _state.flux -= cost;
        _state[tierKey]++;
        if (onUpgrade) onUpgrade();
        api.enforceStateBounds();
        SoundFX.playActionSuccess();
        return true;
      }
      return false;
    },

    setYardCategory(cat: string): void {
      _state.yardCat = cat;
    },

    buyYardItem(itemKey: YardKey): boolean {
      const item = GAME_DATA.yard[itemKey];
      if (!item || _state.flux < item.cost) return false;

      _state.flux -= item.cost;
      _state[item.type] = item.name;
      SoundFX.playActionSuccess();
      return true;
    },

    initiateTravel():
      | { isNavigating: true; choices: Trajectory[] }
      | { isNavigating: false; targetDimId: string; targetDimName: string }
      | null {
      const cost = api.getTravelCost();
      if (_state.fuel < cost) return null;

      _state.fuel -= cost;
      const hasAstrolabe = _state.module === GAME_DATA.yard.astro.name;
      const choices = ConduitDeck.getTrajectories(_state.jumpCount, hasAstrolabe);

      if (hasAstrolabe) {
        _state.navChoices = choices;
        return { isNavigating: true, choices };
      } else {
        const choice = choices[0];
        if (!choice) return null;
        _state.targetDimId = choice.id;
        _state.targetDimName = choice.name;
        return {
          isNavigating: false,
          targetDimId: choice.id,
          targetDimName: choice.name,
        };
      }
    },

    commitJumpTarget(dimId: string, dimName: string): void {
      _state.targetDimId = dimId;
      _state.targetDimName = dimName;
    },

    completeJump(
      targetDimId: string,
      targetDimName: string,
    ): {
      jumpCount: number;
      greenhouseYield: number;
      goblinYield: number;
    } {
      _state.jumpCount++;
      _state.energy = api.getMaxEnergy();

      let greenhouseYield = 0;
      let goblinYield = 0;

      if (_state.carriage === GAME_DATA.yard.green.name) {
        _state.fuel += GAME_DATA.config.GREENHOUSE_FUEL_YIELD;
        greenhouseYield = GAME_DATA.config.GREENHOUSE_FUEL_YIELD;
      }
      if (_state.crew === GAME_DATA.yard.goblin.name && _state.hull < GAME_DATA.config.MAX_HULL) {
        _state.hull = Math.min(
          GAME_DATA.config.MAX_HULL,
          _state.hull + GAME_DATA.config.GOBLIN_HULL_YIELD,
        );
        goblinYield = GAME_DATA.config.GOBLIN_HULL_YIELD;
      }

      _state.dimId = targetDimId as SaveState["dimId"];
      _state.dimName = targetDimName;
      _state.targetDimId = null;
      _state.targetDimName = null;
      _state.isSurveyed = false;

      api.enforceStateBounds();
      SaveSystem.save();

      return {
        jumpCount: _state.jumpCount,
        greenhouseYield,
        goblinYield,
      };
    },

    markCutsceneSeen(id: string): void {
      if (!_state.seenCutscenes) _state.seenCutscenes = [];
      if (!_state.seenCutscenes.includes(id)) {
        _state.seenCutscenes.push(id);
      }
    },

    loadState(saved: SerializedVoyage | null): void {
      if (!saved) return;
      Object.assign(_state, saved);
      _state.phase = GAME_DATA.phases.start!;
      ConduitDeck.init(saved.sectorBag);
      api.enforceStateBounds();
    },

    resetState(): void {
      _state = cloneState(INITIAL_STATE);
      ConduitDeck.init();
    },

    serialize(): SerializedVoyage {
      return {
        jumpCount: _state.jumpCount,
        sectorBag: ConduitDeck.serialize(),
        hull: _state.hull,
        fuel: _state.fuel,
        flux: _state.flux,
        rep: _state.rep,
        energy: _state.energy,
        engineTier: _state.engineTier,
        weaponTier: _state.weaponTier,
        module: _state.module,
        carriage: _state.carriage,
        crew: _state.crew,
        dimId: _state.dimId,
        dimName: _state.dimName,
        isSurveyed: !!_state.isSurveyed,
        seenCutscenes: _state.seenCutscenes || [],
      };
    },
  };

  return api;
})();
