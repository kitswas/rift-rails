// @ts-nocheck -- legacy module extracted verbatim; remove per-module as types land.
// Extracted verbatim from index.html during TS migration.
import { DOM } from "../ui/dom";
import { SoundFX } from "./audio";
import { ConduitDeck } from "./conduit";
import { GAME_DATA } from "./data";
import { Engine } from "./engine";
import { SaveSystem } from "./save";
export const INITIAL_STATE: any = {
  phase: GAME_DATA.phases.start,
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

/* ========================================================
         VOYAGE SESSION (DEEP LOCOMOTIVE STATE & LIFECYCLE SEAM)
         ======================================================== */
export const VoyageSession: any = (() => {
  let _state = JSON.parse(JSON.stringify(INITIAL_STATE));

  return {
    getSnapshot: () => ({ ..._state }),

    getPhase: () => _state.phase,

    setPhase: (phase) => {
      _state.phase = phase;
    },

    getMaxEnergy: () => GAME_DATA.config.START_ENERGY + _state.engineTier,

    getTravelCost: () =>
      GAME_DATA.config.TRAVEL_BASE_FUEL_COST +
      _state.engineTier * GAME_DATA.config.TRAVEL_TIER_MULT,

    getNextTierTravelCost: () =>
      GAME_DATA.config.TRAVEL_BASE_FUEL_COST +
      (_state.engineTier + 1) * GAME_DATA.config.TRAVEL_TIER_MULT,

    getForgeCost: (tier) => (tier + 1) * GAME_DATA.config.FORGE_BASE_FLUX_COST,

    applyMitigation: (resourceKey, rawAmount) => {
      if (resourceKey === "hull" && _state.module === GAME_DATA.yard.exo.name) {
        return Math.round(rawAmount * GAME_DATA.config.EXO_DMG_MULT);
      }
      return rawAmount;
    },

    getActualCost: (rule) =>
      VoyageSession.applyMitigation(rule.res, rule.amount(_state, GAME_DATA.config)),

    canAffordAction: (act) => {
      for (const [rKey, rVal] of Object.entries(act.requires || {})) {
        if (_state[rKey] < rVal || (typeof rVal === "string" && _state[rKey] !== rVal))
          return false;
      }
      for (const rule of act.consumes) {
        if (_state[rule.res] < VoyageSession.getActualCost(rule)) return false;
      }
      return true;
    },

    canSurvive: () => {
      if (_state.hull <= GAME_DATA.config.DEATH_HULL_THRESHOLD) return false;
      if (_state.fuel >= VoyageSession.getTravelCost()) return true;
      if (_state.hull > GAME_DATA.config.DESPERATE_HULL_COST) return true;

      const node = GAME_DATA.nodes[_state.dimId];
      if (_state.phase === GAME_DATA.phases.idle && _state.energy >= node.exploreCost) return true;

      if (_state.phase === GAME_DATA.phases.encounter) {
        return node.actions.some((actId) => {
          const act = GAME_DATA.actions[actId];
          return !act.isMenu && VoyageSession.canAffordAction(act);
        });
      }
      return false;
    },

    evaluateSurvival: () => {
      if (_state.phase === GAME_DATA.phases.dialogue) return;
      if (_state.hull <= GAME_DATA.config.DEATH_HULL_THRESHOLD) {
        Engine.transitionTo(GAME_DATA.phases.dead);
      } else if (!VoyageSession.canSurvive()) {
        Engine.transitionTo(GAME_DATA.phases.stranded);
      }
    },

    enforceStateBounds: () => {
      if (_state.hull > GAME_DATA.config.MAX_HULL) _state.hull = GAME_DATA.config.MAX_HULL;
      if (_state.hull < 0) _state.hull = 0;
      if (_state.energy > VoyageSession.getMaxEnergy())
        _state.energy = VoyageSession.getMaxEnergy();
    },

    hasObserverDeparted: () =>
      (_state.seenCutscenes || []).includes(GAME_DATA.config.CORVUS_FINAL_CUTSCENE),

    assertInvariants: () => {
      if (_state.hull > GAME_DATA.config.MAX_HULL) console.error("INVARIANT BREACH: Hull > Max");
      if (_state.hull < 0 || _state.energy < 0 || _state.fuel < 0 || _state.flux < 0)
        console.error("INVARIANT BREACH: Resource dropped below 0");
      if (!GAME_DATA.permissions[_state.phase])
        console.error(`INVARIANT BREACH: No permissions defined for phase '${_state.phase}'`);
      if (DOM.corvusPortrait) {
        const departed = VoyageSession.hasObserverDeparted();
        if (!!DOM.corvusPortrait.hidden !== departed)
          console.error("INVARIANT BREACH: Observer presence out of sync with save state");
      }
    },

    exploreNode: () => {
      const node = GAME_DATA.nodes[_state.dimId];
      if (_state.energy < node.exploreCost) return false;

      _state.energy -= node.exploreCost;
      _state.isSurveyed = true;
      VoyageSession.enforceStateBounds();
      return true;
    },

    executeAction: (actId) => {
      const act = GAME_DATA.actions[actId];
      if (!act) return { isMenu: false, success: false };

      if (act.isMenu) {
        return { isMenu: true, menuTarget: act.menuTarget };
      }

      for (const rule of act.consumes) {
        _state[rule.res] -= VoyageSession.getActualCost(rule);
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
            _state[rule.res] -= VoyageSession.getActualCost(rule);
          }
        }
        SoundFX.playActionDamage();
      }

      VoyageSession.enforceStateBounds();

      return {
        isMenu: false,
        success,
        logText: success ? act.logSuccess : act.logFail,
        logClass: success ? GAME_DATA.dom.classes.logSuccess : GAME_DATA.dom.classes.logDamage,
      };
    },

    desperateScavenge: () => {
      if (_state.hull <= GAME_DATA.config.DESPERATE_HULL_COST) return false;
      _state.hull -= GAME_DATA.config.DESPERATE_HULL_COST;
      _state.fuel += GAME_DATA.config.DESPERATE_FUEL_YIELD;
      VoyageSession.enforceStateBounds();
      SoundFX.playActionDamage();
      return true;
    },

    forgeUpgrade: (tierKey, onUpgrade) => {
      const cost = VoyageSession.getForgeCost(_state[tierKey]);
      if (_state.flux >= cost && _state[tierKey] < GAME_DATA.config.MAX_TIER) {
        _state.flux -= cost;
        _state[tierKey]++;
        if (onUpgrade) onUpgrade();
        VoyageSession.enforceStateBounds();
        SoundFX.playActionSuccess();
        return true;
      }
      return false;
    },

    setYardCategory: (cat) => {
      _state.yardCat = cat;
    },

    buyYardItem: (itemKey) => {
      const item = GAME_DATA.yard[itemKey];
      if (!item || _state.flux < item.cost) return false;

      _state.flux -= item.cost;
      _state[item.type] = item.name;
      SoundFX.playActionSuccess();
      return true;
    },

    initiateTravel: () => {
      const cost = VoyageSession.getTravelCost();
      if (_state.fuel < cost) return null;

      _state.fuel -= cost;
      const hasAstrolabe = _state.module === GAME_DATA.yard.astro.name;
      const choices = ConduitDeck.getTrajectories(_state.jumpCount, hasAstrolabe);

      if (hasAstrolabe) {
        _state.navChoices = choices;
        return { isNavigating: true, choices };
      } else {
        const choice = choices[0];
        _state.targetDimId = choice.id;
        _state.targetDimName = choice.name;
        return {
          isNavigating: false,
          targetDimId: choice.id,
          targetDimName: choice.name,
        };
      }
    },

    commitJumpTarget: (dimId, dimName) => {
      _state.targetDimId = dimId;
      _state.targetDimName = dimName;
    },

    completeJump: (targetDimId, targetDimName) => {
      _state.jumpCount++;
      _state.energy = VoyageSession.getMaxEnergy();

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

      _state.dimId = targetDimId;
      _state.dimName = targetDimName;
      _state.targetDimId = null;
      _state.targetDimName = null;
      _state.isSurveyed = false;

      VoyageSession.enforceStateBounds();
      SaveSystem.save();

      return {
        jumpCount: _state.jumpCount,
        greenhouseYield,
        goblinYield,
      };
    },

    markCutsceneSeen: (id) => {
      if (!_state.seenCutscenes) _state.seenCutscenes = [];
      if (!_state.seenCutscenes.includes(id)) {
        _state.seenCutscenes.push(id);
      }
    },

    loadState: (saved) => {
      if (!saved) return;
      Object.assign(_state, saved);
      _state.phase = GAME_DATA.phases.start;
      ConduitDeck.init(saved.sectorBag);
      VoyageSession.enforceStateBounds();
    },

    resetState: () => {
      _state = JSON.parse(JSON.stringify(INITIAL_STATE));
      ConduitDeck.init();
    },

    serialize: () => ({
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
    }),
  };
})();

/* ========================================================
          LOCAL STORAGE SAVE SYSTEM
         ======================================================== */
