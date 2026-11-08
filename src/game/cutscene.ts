import type { Cutscene, CutsceneId, Phase } from "./types";
import type { Registry } from "./registry";
import type { Voyage } from "./voyage";
import type { SoundFXService } from "./audio";

export interface CutsceneRefGetter {
  get: (key: string) => HTMLElement | null;
  getActiveElement?: () => Element | null;
}

export interface CutsceneDeps {
  registry: Registry;
  voyage: Voyage;
  transitionTo: (phase: Phase) => boolean;
  log: (text: string, cls?: string) => void;
  sound: Pick<SoundFXService, "playDialogueChime">;
  refs: CutsceneRefGetter;
  formatProgress?: (beat: number, total: number) => string;
  tutorialHighlightClass?: string;
  tutorialCueText?: () => string;
  logLoreClass?: string;
  dialoguePhase?: Phase;
  idlePhase?: Phase;
  firstCutsceneId?: CutsceneId;
}

/**
 * Fallback order used only when the registry holds fewer entries
 * than the baseline set. Canonical lookup is registry-driven.
 */
const FALLBACK_ORDER: readonly string[] = ["wp1", "wp2", "wp3", "wp4", "wp5"];

export class CutsceneEngine {
  activeCutscene: Cutscene | null = null;
  beatIndex = 0;
  returnFocus: Element | null = null;

  private readonly registry: Registry;
  private readonly voyage: Voyage;
  private readonly transitionTo: (phase: Phase) => boolean;
  private readonly log: (text: string, cls?: string) => void;
  private readonly sound: Pick<SoundFXService, "playDialogueChime">;
  private readonly refs: CutsceneRefGetter;
  private readonly formatProgress: (beat: number, total: number) => string;
  private readonly tutorialHighlightClass: string;
  private readonly tutorialCueText: (() => string) | undefined;
  private readonly logLoreClass: string;
  private readonly dialoguePhase: Phase;
  private readonly idlePhase: Phase;
  private readonly firstCutsceneId: CutsceneId | undefined;

  constructor(deps: CutsceneDeps) {
    this.registry = deps.registry;
    this.voyage = deps.voyage;
    this.transitionTo = deps.transitionTo;
    this.log = deps.log;
    this.sound = deps.sound;
    this.refs = deps.refs;
    this.formatProgress =
      deps.formatProgress ?? ((beat: number, total: number) => `Beat ${beat} of ${total}`);
    this.tutorialHighlightClass = deps.tutorialHighlightClass ?? "tutorial-highlight";
    this.tutorialCueText = deps.tutorialCueText;
    this.logLoreClass = deps.logLoreClass ?? "log-lore";
    this.dialoguePhase = deps.dialoguePhase ?? "DIALOGUE";
    this.idlePhase = deps.idlePhase ?? "IDLE";
    this.firstCutsceneId = deps.firstCutsceneId;
  }

  private el(key: string): HTMLElement | null {
    return this.refs.get(key);
  }

  /** Registry-driven waypoint lookup; baseline order is only a fallback. */
  cutsceneForJump(jumpCount: number, seen?: readonly string[]): string | null {
    const seenList = seen ?? [];
    const ids = this.registry.listCutsceneIds();
    const idx = jumpCount - 1;
    const candidate = ids[idx];
    if (candidate && !seenList.includes(candidate)) return candidate;
    const fallback = FALLBACK_ORDER[idx];
    if (fallback && !seenList.includes(fallback) && this.registry.getCutscene(fallback)) {
      return fallback;
    }
    return null;
  }

  firstCutscene(): string | null {
    const first = this.registry.listCutsceneIds()[0];
    if (first) return first;
    if (this.firstCutsceneId && this.registry.getCutscene(this.firstCutsceneId)) {
      return this.firstCutsceneId;
    }
    const fallback = FALLBACK_ORDER[0];
    if (fallback && this.registry.getCutscene(fallback)) return fallback;
    return null;
  }

  trapFocus(event: Event): void {
    if (!this.activeCutscene) return;
    const kb = event as KeyboardEvent;
    if (kb.key === "Tab") {
      event.preventDefault();
      this.el("cutsceneBtnA")?.focus();
      return;
    }
    const target = (event as FocusEvent).target as Node | null;
    const overlay = this.el("cutsceneOverlay");
    if (target && overlay && !overlay.contains(target)) {
      this.el("cutsceneBtnA")?.focus();
    }
  }

  showExploreHint(): void {
    this.el("btnExplore")?.classList.add(this.tutorialHighlightClass);
    const cue = this.el("tutorialCue");
    if (cue) {
      cue.textContent = this.tutorialCueText?.() ?? "";
      cue.hidden = false;
    }
  }

  play(cutsceneId: string): void {
    let resolved = this.registry.getCutscene(cutsceneId);
    if (!resolved) {
      const firstId = this.firstCutscene();
      if (firstId) resolved = this.registry.getCutscene(firstId);
    }
    if (!resolved) return;
    this.activeCutscene = resolved;
    this.beatIndex = 0;
    this.returnFocus = this.refs.getActiveElement?.() ?? null;
    this.voyage.markCutsceneSeen(resolved.id);
    const game = this.el("gameContainer");
    if (game) (game as HTMLElement & { inert: boolean }).inert = true;
    const overlay = this.el("cutsceneOverlay");
    if (overlay) overlay.hidden = false;
    this.transitionTo(this.dialoguePhase);
    this.renderCurrentBeat();
    this.el("cutsceneBtnA")?.focus();
  }

  renderCurrentBeat(): void {
    const cutscene = this.activeCutscene;
    if (!cutscene) return;
    const beat = cutscene.beats[this.beatIndex];
    if (!beat) return;
    this.sound.playDialogueChime();
    const total = cutscene.beats.length;
    let pips = "";
    for (let i = 0; i < total; i++) {
      pips += i <= this.beatIndex ? "✦ " : "✧ ";
    }
    this.el("cutsceneProgress")?.setAttribute(
      "aria-label",
      this.formatProgress(this.beatIndex + 1, total),
    );
    const progressEl = this.el("cutsceneProgress");
    if (progressEl) progressEl.innerText = pips.trim();
    const body = this.el("cutsceneBody");
    if (body) body.innerText = beat.text;
    const btnA = this.el("cutsceneBtnA");
    if (btnA) btnA.innerText = `[A] "${beat.choiceA}"`;
    const btnB = this.el("cutsceneBtnB");
    if (btnB) btnB.innerText = `[B] "${beat.choiceB}"`;
  }

  advance(): void {
    const cutscene = this.activeCutscene;
    if (!cutscene) return;
    this.beatIndex++;
    if (this.beatIndex < cutscene.beats.length) {
      this.renderCurrentBeat();
    } else {
      this.close();
    }
  }

  close(): void {
    const cutscene = this.activeCutscene;
    const overlay = this.el("cutsceneOverlay");
    if (overlay) overlay.hidden = true;
    const game = this.el("gameContainer");
    if (game) (game as HTMLElement & { inert: boolean }).inert = false;
    if (cutscene?.logSummary) {
      this.log(cutscene.logSummary, this.logLoreClass);
    }
    this.activeCutscene = null;
    this.beatIndex = 0;
    this.transitionTo(this.idlePhase);
    const next = this.voyage.evaluateSurvival();
    if (next) this.transitionTo(next);
    if (cutscene?.id === this.firstCutscene()) this.showExploreHint();
    const returnFocus = this.returnFocus as HTMLElement | null;
    let focusRestored = false;
    if (
      returnFocus &&
      returnFocus.isConnected &&
      (returnFocus as HTMLButtonElement).disabled !== true &&
      returnFocus.getClientRects().length > 0
    ) {
      returnFocus.focus();
      focusRestored = this.refs.getActiveElement?.() === returnFocus;
    }
    if (!focusRestored) {
      const explore = this.el("btnExplore") as HTMLButtonElement | null;
      if (explore && explore.disabled !== true) {
        explore.focus();
      } else {
        this.el("locationName")?.focus();
      }
    }
    this.returnFocus = null;
  }
}

export function createCutscene(deps: CutsceneDeps): CutsceneEngine {
  return new CutsceneEngine(deps);
}

export function createCutsceneEngine(deps: CutsceneDeps): CutsceneEngine {
  return new CutsceneEngine(deps);
}
