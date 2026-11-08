import { SoundFX } from "./audio";
import { GAME_DATA } from "./data";
import { Engine } from "./engine";
import { VoyageSession } from "./session";
import type { Cutscene, CutsceneId } from "./types";
import { ref } from "../stores/refs.svelte";
function el(key: string): HTMLElement | null {
  const id = (GAME_DATA.dom.ids as Record<string, string>)[key];
  return ref(id!) as HTMLElement | null;
}

export const CutsceneEngine = {
  activeCutscene: null as Cutscene | null,
  beatIndex: 0,
  returnFocus: null as Element | null,

  trapFocus(this: void, event: Event): void {
    if (!CutsceneEngine.activeCutscene) return;
    if (event instanceof KeyboardEvent && event.key === "Tab") {
      event.preventDefault();
      el("cutsceneBtnA")?.focus();
    } else if (
      event instanceof FocusEvent &&
      !el("cutsceneOverlay")?.contains(event.target as Node)
    ) {
      el("cutsceneBtnA")?.focus();
    }
  },

  showExploreHint(): void {
    const snap = VoyageSession.getSnapshot();
    const node = GAME_DATA.nodes[snap.dimId];
    const cue = el("tutorialCue");
    if (cue) {
      cue.innerText = GAME_DATA.text.tutorialExplore(node.isHub, node.exploreCost);
      cue.hidden = false;
    }
    el("btnExplore")?.classList.add(GAME_DATA.dom.classes.tutorialHighlight!);
  },

  play(cutsceneId: string): void {
    const cutscene = GAME_DATA.cutscenes[cutsceneId as CutsceneId];
    if (!cutscene) return;

    CutsceneEngine.activeCutscene = cutscene;
    CutsceneEngine.beatIndex = 0;
    CutsceneEngine.returnFocus = document.activeElement;
    VoyageSession.markCutsceneSeen(cutsceneId);

    {
      const game = el("gameContainer");
      if (game) (game as HTMLElement & { inert: boolean }).inert = true;
    }
    {
      const overlay = el("cutsceneOverlay");
      if (overlay) overlay.hidden = false;
    }
    Engine.transitionTo(GAME_DATA.phases.dialogue!);
    CutsceneEngine.renderCurrentBeat();
    el("cutsceneBtnA")?.focus();
  },

  renderCurrentBeat(): void {
    const cutscene = CutsceneEngine.activeCutscene;
    if (!cutscene) return;
    const beat = cutscene.beats[CutsceneEngine.beatIndex];
    if (!beat) return;

    SoundFX.playDialogueChime();

    const total = cutscene.beats.length;
    let pips = "";
    for (let i = 0; i < total; i++) {
      pips += i <= CutsceneEngine.beatIndex ? "✦ " : "✧ ";
    }
    el("cutsceneProgress")?.setAttribute(
      "aria-label",
      GAME_DATA.text.formatCutsceneProgress(CutsceneEngine.beatIndex + 1, total),
    );
    {
      const p = el("cutsceneProgress");
      if (p) p.innerText = pips.trim();
    }
    {
      const b = el("cutsceneBody");
      if (b) b.innerText = beat.text;
    }
    {
      const a = el("cutsceneBtnA");
      if (a) a.innerText = `[A] "${beat.choiceA}"`;
    }
    {
      const bb = el("cutsceneBtnB");
      if (bb) bb.innerText = `[B] "${beat.choiceB}"`;
    }
  },

  advance(): void {
    const cutscene = CutsceneEngine.activeCutscene;
    if (!cutscene) return;
    CutsceneEngine.beatIndex++;

    if (CutsceneEngine.beatIndex < cutscene.beats.length) {
      CutsceneEngine.renderCurrentBeat();
    } else {
      CutsceneEngine.close();
    }
  },

  close(): void {
    const cutscene = CutsceneEngine.activeCutscene;
    {
      const overlay = el("cutsceneOverlay");
      if (overlay) overlay.hidden = true;
    }
    {
      const game = el("gameContainer");
      if (game) (game as HTMLElement & { inert: boolean }).inert = false;
    }

    if (cutscene?.logSummary) {
      Engine.log(cutscene.logSummary, GAME_DATA.dom.classes.logLore!);
    }

    CutsceneEngine.activeCutscene = null;
    CutsceneEngine.beatIndex = 0;

    Engine.transitionTo(GAME_DATA.phases.idle!);
    VoyageSession.evaluateSurvival();

    if (cutscene?.id === "wp1") CutsceneEngine.showExploreHint();

    const returnFocus = CutsceneEngine.returnFocus;
    const canRestoreFocus =
      returnFocus !== null &&
      returnFocus instanceof HTMLElement &&
      returnFocus.isConnected &&
      returnFocus !== document.body &&
      returnFocus !== document.documentElement &&
      !(returnFocus as HTMLButtonElement).disabled &&
      returnFocus.getClientRects().length > 0;
    let focusRestored = false;
    if (canRestoreFocus) {
      returnFocus.focus();
      focusRestored = document.activeElement === returnFocus;
    }
    if (!focusRestored) {
      if ((el("btnExplore") as HTMLButtonElement | null)?.disabled !== true) {
        el("btnExplore")?.focus();
      } else {
        el("locationName")?.focus();
      }
    }
    CutsceneEngine.returnFocus = null;
  },
};
