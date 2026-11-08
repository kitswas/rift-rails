/// <reference types="vite/client" />
import "./style.css";
import { mount } from "svelte";
import App from "./ui/App.svelte";
import { GAME_DATA, calcEffectiveWeaponTier } from "./game/data";
import { DioramaPipeline } from "./game/art";
import { ConduitDeck } from "./game/conduit";
import { SoundFX } from "./game/audio";
import { INITIAL_STATE, VoyageSession } from "./game/session";
import { SaveSystem } from "./game/save";
import { TransitionFX } from "./game/fx";
import { CutsceneEngine } from "./game/cutscene";
import { Engine, clearEncounterChoices, StateHooks } from "./game/engine";
import { RiftReducedMotion, RiftMotion } from "./game/motion";
import { VECTOR_IDLE_ANGLE } from "./game/config";
import { RiftEyes } from "./game/eyes";
import { DOM } from "./ui/dom";
import {
  nav,
  arm,
  breach,
  confirm as confirmNav,
  lock,
  lift,
  needleAngle,
  resetNav,
  setChoices,
  setSlot,
  slotCount,
} from "./stores/nav.svelte";

// Test bridge: Playwright specs drive the live nav store through these
// adapters until the specs are rewritten to click the Svelte UI directly.
const RiftCouplingBoard = {
  get choices() {
    return nav.choices;
  },
  get activeSlot() {
    return nav.activeSlot;
  },
  get armedSlot() {
    return nav.armedSlot;
  },
  get lockSlot() {
    return nav.lockSlot;
  },
  slotCount,
  needleAngle,
  render: (choices: typeof nav.choices) => setChoices(choices),
  arm,
  breach,
  confirm: confirmNav,
  lock,
  lift,
  setSlot,
  reset: resetNav,
};

const RiftVectorDial = {
  get entry() {
    return { target: nav.angle };
  },
  get angle() {
    return nav.angle;
  },
  get armedSlot() {
    return nav.armedSlot;
  },
  needleAngle,
  reset: resetNav,
  init: () => {},
};

declare global {
  interface Window {
    GAME_DATA: typeof GAME_DATA;
    calcEffectiveWeaponTier: typeof calcEffectiveWeaponTier;
    DioramaPipeline: typeof DioramaPipeline;
    ConduitDeck: typeof ConduitDeck;
    SoundFX: typeof SoundFX;
    INITIAL_STATE: typeof INITIAL_STATE;
    VoyageSession: typeof VoyageSession;
    SaveSystem: typeof SaveSystem;
    TransitionFX: typeof TransitionFX;
    CutsceneEngine: typeof CutsceneEngine;
    Engine: typeof Engine;
    clearEncounterChoices: typeof clearEncounterChoices;
    StateHooks: typeof StateHooks;
    RiftReducedMotion: typeof RiftReducedMotion;
    RiftMotion: typeof RiftMotion;
    RiftCouplingBoard: typeof RiftCouplingBoard;
    VECTOR_IDLE_ANGLE: typeof VECTOR_IDLE_ANGLE;
    RiftVectorDial: typeof RiftVectorDial;
    RiftEyes: typeof RiftEyes;
    DOM: typeof DOM;
    __nav: typeof nav;
  }
}

// Compatibility shims for the Playwright harness and inline onclick
// handlers in the shell markup. New Svelte components should import
// directly instead of relying on window globals.
window.GAME_DATA = GAME_DATA;
window.calcEffectiveWeaponTier = calcEffectiveWeaponTier;
window.DioramaPipeline = DioramaPipeline;
window.ConduitDeck = ConduitDeck;
window.SoundFX = SoundFX;
window.INITIAL_STATE = INITIAL_STATE;
window.VoyageSession = VoyageSession;
window.SaveSystem = SaveSystem;
window.TransitionFX = TransitionFX;
window.CutsceneEngine = CutsceneEngine;
window.Engine = Engine;
window.clearEncounterChoices = clearEncounterChoices;
window.StateHooks = StateHooks;
window.RiftReducedMotion = RiftReducedMotion;
window.RiftMotion = RiftMotion;
window.RiftCouplingBoard = RiftCouplingBoard;
window.VECTOR_IDLE_ANGLE = VECTOR_IDLE_ANGLE;
window.RiftVectorDial = RiftVectorDial;
window.RiftEyes = RiftEyes;
window.DOM = DOM;
window.__nav = nav;

const target = document.getElementById("app");
if (target) {
  mount(App, { target });
}
