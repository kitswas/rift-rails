import { DOM } from "../ui/dom";
import { DioramaPipeline } from "./art";
import { SoundFX } from "./audio";
import { ConduitDeck } from "./conduit";
import { CutsceneEngine } from "./cutscene";
import { GAME_DATA } from "./data";
import { TransitionFX } from "./fx";
import { SaveSystem } from "./save";
import { VoyageSession } from "./session";
import { syncUI, ui } from "../stores/ui.svelte";
import { addMenuItem, clearMenu, syncActiveMenu } from "../stores/menu.svelte";
import { syncSensors } from "../stores/sensors.svelte";
import { syncSettings } from "../stores/settings.svelte";
import { PhaseMachine } from "./phaseMachine";
import type { ActionId, GameAction, Phase, StateHook, TierKey, YardItem } from "./types";

export class EngineService {
  verifyGraphIntegrity(): void {
    const phases = Object.values(GAME_DATA.phases) as Phase[];
    const terminal = [GAME_DATA.phases.dead, GAME_DATA.phases.stranded];
    for (const [phase, targets] of Object.entries(GAME_DATA.transitions)) {
      if (targets.length === 0 && !terminal.includes(phase)) {
        console.error(`FATAL: State Machine Deadlock. Phase '${phase}' has no valid exits.`);
      }
      targets.forEach((t) => {
        if (!phases.includes(t))
          console.error(
            `FATAL: State Machine Orphan. Phase '${phase}' targets invalid phase '${t}'.`,
          );
      });
    }
  }

  verifyPaletteIntegrity(): void {
    const MIN_DELTA_E = 0.08;
    const dummy = document.createElement("div");
    dummy.style.display = "none";
    document.body.appendChild(dummy);

    const types = ["damage", "lore", "success", "system", "event", "help"];
    const colorNodes: { name: string; L: number; a: number; b: number }[] = [];

    types.forEach((type) => {
      dummy.className = `log-entry log-${type}`;
      const style = getComputedStyle(dummy);

      const l = parseFloat(style.getPropertyValue("--base-l").trim()) || 0.48;
      const c = parseFloat(style.getPropertyValue("--c").trim());
      const h = parseFloat(style.getPropertyValue("--h").trim());

      if (!isNaN(c) && !isNaN(h)) {
        const rad = (h * Math.PI) / 180;
        colorNodes.push({
          name: type,
          L: l,
          a: c * Math.cos(rad),
          b: c * Math.sin(rad),
        });
      }
    });

    document.body.removeChild(dummy);

    for (let i = 0; i < colorNodes.length; i++) {
      for (let j = i + 1; j < colorNodes.length; j++) {
        const c1 = colorNodes[i];
        const c2 = colorNodes[j];
        if (!c1 || !c2) continue;
        const deltaE = Math.hypot(c1.L - c2.L, c1.a - c2.a, c1.b - c2.b);

        if (deltaE < MIN_DELTA_E) {
          console.error(
            `PALETTE INVARIANT BREACH: Log types '${c1.name}' and '${c2.name}' are visually indistinguishable (ΔE_ok = ${deltaE.toFixed(4)} < ${MIN_DELTA_E}).`,
          );
        }
      }
    }
  }

  log(msg: string, styleClass: string): void {
    const div = document.createElement("div");
    div.className = `${GAME_DATA.dom.classes.logEntry} ${styleClass}`;
    div.innerHTML = msg;
    DOM.storyLog.appendChild(div);
    DOM.storyLog.scrollTop = DOM.storyLog.scrollHeight;
  }

  inspect(topic: string): void {
    const info = GAME_DATA.glossary[topic];
    if (info) {
      this.log(`[INTEL] ${info}`, GAME_DATA.dom.classes.logHelp!);
    }
  }

  transitionTo(newPhase: Phase): boolean {
    const currentPhase = VoyageSession.getPhase();
    const allowed = GAME_DATA.transitions[currentPhase]!;
    if (!allowed) {
      console.error(`ILLEGAL TRANSITION: Cannot move from ${currentPhase} to ${newPhase}`);
      return false;
    }

    if (!allowed.includes(newPhase)) {
      console.error(`ILLEGAL TRANSITION: Cannot move from ${currentPhase} to ${newPhase}`);
      return false;
    }

    const hooks = phaseMachine.hooks;
    if (hooks[currentPhase]?.onExit) hooks[currentPhase].onExit!();
    VoyageSession.setPhase(newPhase);
    if (hooks[newPhase]?.onEnter) hooks[newPhase].onEnter!();

    this.updateUI();
    return true;
  }

  executeAction(actId: ActionId): void {
    const res = VoyageSession.executeAction(actId);
    if (res.isMenu) {
      this.transitionTo(res.menuTarget!);
      return;
    }

    this.log(res.logText ?? "", res.logClass ?? "");

    const snap = VoyageSession.getSnapshot();
    if (snap.hull <= GAME_DATA.config.DEATH_HULL_THRESHOLD) {
      this.transitionTo(GAME_DATA.phases.dead!);
    } else {
      this.transitionTo(GAME_DATA.phases.idle!);
      VoyageSession.evaluateSurvival();
    }
  }

  exploreNode(): void {
    const snap = VoyageSession.getSnapshot();
    const node = GAME_DATA.nodes[snap.dimId];
    if (snap.energy < node.exploreCost) return;

    const success = VoyageSession.exploreNode();
    if (!success) return;

    DOM.tutorialCue.hidden = true;
    DOM.btnExplore.classList.remove(GAME_DATA.dom.classes.tutorialHighlight!);

    this.log(
      GAME_DATA.text.logEncounterTitle(node.label, node.desc),
      GAME_DATA.dom.classes.logEvent!,
    );
    SoundFX.playDialogueChime();
    this.transitionTo(GAME_DATA.phases.encounter!);
    VoyageSession.evaluateSurvival();

    DOM.encounterChoices.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }

  initiateTravel(): void {
    const travel = VoyageSession.initiateTravel();
    if (!travel) return;

    if (travel.isNavigating) {
      this.transitionTo(GAME_DATA.phases.navigating!);
    } else {
      this.finalizeJump(travel.targetDimId!, travel.targetDimName!);
    }
  }

  finalizeJump(dimId: string, dimName: string): void {
    VoyageSession.commitJumpTarget(dimId, dimName);
    this.transitionTo(GAME_DATA.phases.jumping!);
  }

  desperateScavenge(): void {
    const success = VoyageSession.desperateScavenge();
    if (!success) return;

    this.log(GAME_DATA.text.logDesperate, GAME_DATA.dom.classes.logDamage!);
    this.updateUI();
    VoyageSession.evaluateSurvival();
  }

  buildMenuButton(
    label: string,
    onClick: () => void,
    uiClass?: string,
    dataActId?: string,
  ): HTMLButtonElement {
    const id = addMenuItem(label, onClick, uiClass, dataActId as ActionId | undefined);
    const btn = document.createElement("button");
    btn.dataset.menuId = id;
    btn.innerText = label;
    if (uiClass) btn.className = uiClass;
    if (dataActId) btn.dataset.actId = dataActId;
    return btn;
  }

  updateActionBtnData(_btn: HTMLButtonElement, _act: GameAction): void {
    syncActiveMenu();
  }

  updateYardBtnData(_btn: HTMLButtonElement, _item: YardItem): void {
    syncActiveMenu();
  }

  refreshActiveMenu(): void {
    syncActiveMenu();
  }

  renderSensors(): void {
    syncSensors();
    const snap = VoyageSession.getSnapshot();
    if (!snap.isSurveyed) {
      TransitionFX.applyThemeStyles(snap.dimName.split(" ")[0] ?? "");
    }
  }

  renderVitals(): void {
    syncUI();
    if (DOM.locationName) DOM.locationName.innerText = ui.locationName;
    if (DOM.locationType) DOM.locationType.innerText = ui.locationType;
    if (DOM.dimTypeCodex) DOM.dimTypeCodex.innerText = ui.dimTypeCodex;
    if (DOM.statRep) DOM.statRep.innerText = ui.rep;
    if (DOM.corvusPortrait) {
      DOM.corvusPortrait.hidden = VoyageSession.hasObserverDeparted();
    }
  }

  renderInteractiveControls(): void {
    syncUI();
  }

  renderForge(): void {
    syncUI();
  }

  forgeUpgrade(tierKey: TierKey, onUpgrade?: () => void): void {
    const success = VoyageSession.forgeUpgrade(tierKey, onUpgrade);
    if (success) {
      this.updateUI();
      VoyageSession.evaluateSurvival();
    }
  }

  resetGame(confirmPrompt: boolean = true): void {
    if (confirmPrompt && !confirm("Purge all voyage telemetry and restart from Waypoint 1?")) {
      return;
    }
    SaveSystem.clear();
    location.reload();
  }

  lockdownGameOver(logMessage: string): void {
    SaveSystem.clear();
    SoundFX.silenceOnDeath();
    document.querySelectorAll("button").forEach((b) => (b.disabled = true));
    DOM.rightPanel.classList.add(GAME_DATA.dom.classes.lockedUI!);
    this.log(logMessage, GAME_DATA.dom.classes.logDamage!);
  }

  updateUI(): void {
    VoyageSession.enforceStateBounds();
    this.renderVitals();
    this.renderInteractiveControls();
    this.renderForge();
    this.refreshActiveMenu();
    this.renderSensors();
    VoyageSession.assertInvariants();
  }

  ignite(): void {
    SoundFX.init();
    const startEl = document.getElementById("start-screen");
    if (startEl) startEl.style.display = "none";
    const gameEl = document.getElementById("game-container");
    if (gameEl) gameEl.style.display = "flex";
    const saved = SaveSystem.load();
    if (saved) {
      VoyageSession.loadState(saved);
      const snap = VoyageSession.getSnapshot();
      TransitionFX.applyThemeStyles(snap.dimName.split(" ")[0] ?? "");
      this.log(
        `[CONDUIT] Resumed trajectory at ${snap.dimName} (Waypoint ${snap.jumpCount}).`,
        GAME_DATA.dom.classes.logSystem!,
      );
    } else {
      ConduitDeck.init();
    }
    this.transitionTo(GAME_DATA.phases.idle!);
    setTimeout(() => {
      this.scrollToPane(2);
    }, 50);
    const snap = VoyageSession.getSnapshot();
    if (snap.jumpCount === 1 && !snap.seenCutscenes?.includes("wp1")) {
      setTimeout(() => {
        CutsceneEngine.play("wp1");
      }, 120);
    }
  }

  cacheDOM(): void {
    Object.entries(GAME_DATA.dom.ids).forEach(([domKey, elementId]) => {
      const el = document.getElementById(elementId);
      if (el) (DOM as unknown as Record<string, HTMLElement>)[domKey] = el;
    });
    DOM.panes = [DOM.paneSettings, DOM.paneSensors, DOM.paneBridge, DOM.paneForge, DOM.paneManual];
    DOM.tabs = [DOM.tabSettings, DOM.tabSensors, DOM.tabBridge, DOM.tabForge, DOM.tabManual];
  }

  setupStaticText(): void {
    syncSettings();
    const snap = VoyageSession.getSnapshot();
    TransitionFX.applyThemeStyles(snap.dimName.split(" ")[0] ?? "");
    this.log(GAME_DATA.text.initLog, GAME_DATA.dom.classes.logSystem!);
  }

  syncTabsWithScroll(): void {
    const container = document.getElementById("snap-slider");
    if (!container) return;
    const panes = [
      document.getElementById("pane-settings"),
      document.getElementById("pane-sensors"),
      document.getElementById("pane-bridge"),
      document.getElementById("pane-forge"),
      document.getElementById("pane-manual"),
    ];
    const tabs = [
      document.getElementById("tab-settings"),
      document.getElementById("tab-sensors"),
      document.getElementById("tab-bridge"),
      document.getElementById("tab-forge"),
      document.getElementById("tab-manual"),
    ];

    const containerCenter = container.scrollLeft + container.clientWidth / 2;
    let closestIdx = 0;
    let minDiff = Infinity;

    panes.forEach((pane, idx) => {
      if (!pane) return;
      const paneCenter = pane.offsetLeft - container.offsetLeft + pane.offsetWidth / 2;
      const diff = Math.abs(containerCenter - paneCenter);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });

    tabs.forEach((tab, i) => {
      if (tab) tab.classList.toggle("active", i === closestIdx);
    });
  }

  scrollToPane(index: number): void {
    const container = document.getElementById("snap-slider");
    const panes = [
      document.getElementById("pane-settings"),
      document.getElementById("pane-sensors"),
      document.getElementById("pane-bridge"),
      document.getElementById("pane-forge"),
      document.getElementById("pane-manual"),
    ];
    const target = panes[index];
    if (!target || !container) return;

    if (window.innerWidth >= 900) {
      const targetLeft = target.offsetLeft - container.offsetLeft;
      const targetCenter = targetLeft + target.offsetWidth / 2;
      const scrollPos = targetCenter - container.clientWidth / 2;
      container.scrollTo({ left: scrollPos, behavior: "smooth" });
    } else {
      target.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }

  bindEvents(): void {
    // Svelte components own button wiring (Start/Panels/Log/Forge/Cutscene).
    // Kept as init hook for focus-trap parity; no DOM lookups here.
  }

  init(): void {
    this.verifyGraphIntegrity();
    this.verifyPaletteIntegrity();
    this.cacheDOM();
    DioramaPipeline.init();
    TransitionFX.init();
    this.setupStaticText();
    this.bindEvents();
  }
}

export const Engine = new EngineService();

export function clearEncounterChoices(): void {
  clearMenu();
}

const phaseMachine = new PhaseMachine({
  transitionTo: (phase) => Engine.transitionTo(phase),
  executeAction: (actId) => Engine.executeAction(actId),
  log: (text, cls) => Engine.log(text, cls ?? GAME_DATA.dom.classes.logSystem!),
  updateUI: () => Engine.updateUI(),
  lockdownGameOver: (msg) => Engine.lockdownGameOver(msg),
});

export const StateHooks: Record<string, StateHook> = phaseMachine.hooks;
