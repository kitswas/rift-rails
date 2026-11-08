/// <reference types="vite/client" />
import "./style.css";
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
import { RiftCouplingBoard } from "./game/board";
import { VECTOR_IDLE_ANGLE, RiftVectorDial } from "./game/dial";
import { RiftEyes } from "./game/eyes";
import { DOM } from "./ui/dom";

const w: any = window;
w.GAME_DATA = GAME_DATA;
w.calcEffectiveWeaponTier = calcEffectiveWeaponTier;
w.DioramaPipeline = DioramaPipeline;
w.ConduitDeck = ConduitDeck;
w.SoundFX = SoundFX;
w.INITIAL_STATE = INITIAL_STATE;
w.VoyageSession = VoyageSession;
w.SaveSystem = SaveSystem;
w.TransitionFX = TransitionFX;
w.CutsceneEngine = CutsceneEngine;
w.Engine = Engine;
w.clearEncounterChoices = clearEncounterChoices;
w.StateHooks = StateHooks;
w.RiftReducedMotion = RiftReducedMotion;
w.RiftMotion = RiftMotion;
w.RiftCouplingBoard = RiftCouplingBoard;
w.VECTOR_IDLE_ANGLE = VECTOR_IDLE_ANGLE;
w.RiftVectorDial = RiftVectorDial;
w.RiftEyes = RiftEyes;
w.DOM = DOM;

RiftReducedMotion.addEventListener?.("change", () => {
  RiftEyes.center();
  RiftVectorDial.reset();
});
RiftVectorDial.init();
RiftEyes.start();
Engine.init();
