import type { Cutscene, CutsceneId, Phase } from "./types";
import type { Registry } from "./registry";
import type { Voyage } from "./voyage";
import type { SoundFXService } from "./audio";
import type { StoryScene } from "./storyline";

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
  logLoreClass?: string;
  dialoguePhase?: Phase;
  idlePhase?: Phase;
  firstCutsceneId?: CutsceneId;
}

/**
 * Waypoint cutscenes are keyed by the namespaced ids the host assigns when a
 * plugin registers them (e.g. `corvus-tutorial:wp3`). Bare ids never exist in
 * the registry.
 */
const WAYPOINT_ID_PREFIX = "corvus-tutorial:wp";

export class CutsceneEngine {
  activeCutscene: Cutscene | null = null;
  beatIndex = 0;
  returnFocus: Element | null = null;
  private readonly pending: {
    cutscene: Cutscene;
    speaker: string;
    onChoice?: (choiceIndex: number) => void;
    pluginId?: string;
  }[] = [];
  private activeChoice: ((choiceIndex: number) => void) | null = null;
  private activeSpeaker = "MASTER CORVUS // VEILED SCHOLAR";
  private activeStory = false;
  private activePluginId: string | null = null;
  private interruptedPhase: Phase | null = null;

  private readonly registry: Registry;
  private readonly voyage: Voyage;
  private readonly transitionTo: (phase: Phase) => boolean;
  private readonly log: (text: string, cls?: string) => void;
  private readonly sound: Pick<SoundFXService, "playDialogueChime">;
  private readonly refs: CutsceneRefGetter;
  private readonly formatProgress: (beat: number, total: number) => string;
  private readonly tutorialHighlightClass: string;
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
    this.logLoreClass = deps.logLoreClass ?? "log-lore";
    this.dialoguePhase = deps.dialoguePhase ?? "DIALOGUE";
    this.idlePhase = deps.idlePhase ?? "IDLE";
    this.firstCutsceneId = deps.firstCutsceneId;
  }

  private el(key: string): HTMLElement | null {
    return this.refs.get(key);
  }

  hasSeen(
    cutsceneId: string,
    seen: readonly string[] = this.voyage.state.seenCutscenes ?? [],
  ): boolean {
    if (seen.includes(cutsceneId)) return true;
    const prefix = "corvus-tutorial:";
    return cutsceneId.startsWith(prefix) && seen.includes(cutsceneId.slice(prefix.length));
  }

  /** Waypoint lookup: the tutorial's namespaced wp cutscene for this jump, if unseen. */
  cutsceneForJump(jumpCount: number, seen?: readonly string[]): string | null {
    const seenList = seen ?? [];
    const id = `${WAYPOINT_ID_PREFIX}${jumpCount}`;
    if (this.registry.getCutscene(id) && !this.hasSeen(id, seenList)) return id;
    return null;
  }

  firstCutscene(): string | null {
    if (this.firstCutsceneId !== undefined) {
      return this.registry.getCutscene(this.firstCutsceneId) ? this.firstCutsceneId : null;
    }
    const wp1 = `${WAYPOINT_ID_PREFIX}1`;
    if (this.registry.getCutscene(wp1)) return wp1;
    return this.registry.listCutsceneIds()[0] ?? null;
  }

  trapFocus(event: Event): void {
    if (!this.activeCutscene) return;
    const kb = event as KeyboardEvent;
    if (kb.key === "Tab") {
      event.preventDefault();
      const first = this.el("cutsceneBtnA");
      const second = this.el("cutsceneBtnB");
      const hasSecond = !!second && !second.hidden;
      const active = this.refs.getActiveElement?.();
      if (kb.shiftKey) {
        if (active === first && hasSecond) second?.focus();
        else first?.focus();
      } else if (active === second || !hasSecond) {
        first?.focus();
      } else {
        second?.focus();
      }
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
  }

  play(cutsceneId: string): void {
    const resolved = this.registry.getCutscene(cutsceneId);
    if (!resolved) {
      // Explicit request for a missing scene: no-op (never substitute another plugin's scene).
      this.log(`cutscene not found: ${cutsceneId}`, this.logLoreClass);
      return;
    }
    this.enqueue({
      cutscene: resolved,
      speaker: "MASTER CORVUS // VEILED SCHOLAR",
      ...(cutsceneId.includes(":")
        ? { pluginId: cutsceneId.slice(0, cutsceneId.indexOf(":")) }
        : {}),
    });
  }

  playStory(scene: StoryScene, onChoice: (choiceIndex: number) => void): void {
    const choices = scene.node.choices;
    this.enqueue({
      cutscene: {
        id: `story:${scene.pluginId}:${scene.storyId}:${scene.node.id}`,
        beats: [
          {
            text: scene.node.text,
            choiceA: choices[0]?.label ?? "Continue",
            choiceB: choices[1]?.label ?? "",
          },
        ],
      },
      speaker: `${scene.node.actor} // ${scene.title}`,
      onChoice,
      pluginId: scene.pluginId,
    });
  }

  cancelPluginScenes(pluginId: string): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.pending[i]?.pluginId === pluginId) this.pending.splice(i, 1);
    }
    if (this.activePluginId === pluginId) {
      this.activeChoice = null;
      this.close();
    }
  }

  private enqueue(scene: {
    cutscene: Cutscene;
    speaker: string;
    onChoice?: (choiceIndex: number) => void;
    pluginId?: string;
  }): void {
    if (this.activeCutscene) {
      this.pending.push(scene);
      return;
    }
    this.start(scene);
  }

  private start(scene: {
    cutscene: Cutscene;
    speaker: string;
    onChoice?: (choiceIndex: number) => void;
    pluginId?: string;
  }): void {
    const { cutscene, speaker, onChoice } = scene;
    // Abort rather than soft-lock the game behind an overlay if the phase machine refuses DIALOGUE.
    const phaseBefore = this.voyage.getPhase?.() as Phase | undefined;
    if (!this.transitionTo(this.dialoguePhase)) {
      this.log("cutscene skipped: cannot enter dialogue phase", this.logLoreClass);
      return;
    }
    this.interruptedPhase = phaseBefore ?? null;
    this.activeCutscene = cutscene;
    this.beatIndex = 0;
    this.returnFocus = this.refs.getActiveElement?.() ?? null;
    this.activeChoice = onChoice ?? null;
    this.activeSpeaker = speaker;
    this.activeStory = !!onChoice;
    this.activePluginId = scene.pluginId ?? null;
    if (!this.activeStory) this.voyage.markCutsceneSeen(cutscene.id);
    const game = this.el("gameContainer");
    if (game) (game as HTMLElement & { inert: boolean }).inert = true;
    const overlay = this.el("cutsceneOverlay");
    if (overlay) overlay.hidden = false;
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
    for (let i = 0; i < total; i++) pips += i <= this.beatIndex ? "✦ " : "✧ ";
    this.el("cutsceneProgress")?.setAttribute(
      "aria-label",
      this.activeStory ? "Story dialogue" : this.formatProgress(this.beatIndex + 1, total),
    );
    const progressEl = this.el("cutsceneProgress");
    if (progressEl) progressEl.innerText = this.activeStory ? "STORY" : pips.trim();
    const speaker = this.el("cutsceneSpeaker");
    if (speaker) speaker.textContent = this.activeSpeaker;
    const portrait = this.el("cutscenePortrait");
    if (portrait) portrait.hidden = this.activeStory;
    const body = this.el("cutsceneBody");
    if (body) body.innerText = beat.text;
    const btnA = this.el("cutsceneBtnA");
    if (btnA) btnA.innerText = `[A] "${beat.choiceA}"`;
    const btnB = this.el("cutsceneBtnB");
    if (btnB) {
      btnB.innerText = beat.choiceB ? `[B] "${beat.choiceB}"` : "";
      btnB.hidden = !beat.choiceB;
    }
  }

  advance(choiceIndex = 0): void {
    const cutscene = this.activeCutscene;
    if (!cutscene) return;
    if (this.activeChoice) {
      const choose = this.activeChoice;
      this.activeChoice = null;
      try {
        choose(choiceIndex);
      } finally {
        this.close();
      }
      return;
    }
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
    this.activeChoice = null;
    this.activeStory = false;
    this.activePluginId = null;
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
    const returnPhase =
      this.interruptedPhase && this.interruptedPhase !== this.dialoguePhase
        ? this.interruptedPhase
        : this.idlePhase;
    this.interruptedPhase = null;
    if (!this.transitionTo(returnPhase) && returnPhase !== this.idlePhase) {
      if (!this.transitionTo(this.idlePhase)) {
        this.log(`cutscene close: cannot return to ${this.idlePhase} phase`, this.logLoreClass);
      }
    }
    const next = this.voyage.evaluateSurvival();
    if (next) this.transitionTo(next);
    const nextScene = this.pending.shift();
    if (nextScene) this.start(nextScene);
  }
}

export function createCutscene(deps: CutsceneDeps): CutsceneEngine {
  return new CutsceneEngine(deps);
}
