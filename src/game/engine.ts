import { DOM } from "../ui/dom";
import { DioramaPipeline } from "./art";
import { SoundFX } from "./audio";
import { ConduitDeck } from "./conduit";
import { CutsceneEngine } from "./cutscene";
import { GAME_DATA } from "./data";
import { TransitionFX } from "./fx";
import { SaveSystem } from "./save";
import { VoyageSession } from "./session";
import { resetNav, setChoices } from "../stores/nav.svelte";
import { syncUI, ui } from "../stores/ui.svelte";
import type {
  ActionId,
  GameAction,
  Phase,
  ResourceKey,
  StateHook,
  TierKey,
  YardItem,
  YardKey,
} from "./types";

export const Engine = {
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
  },

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
  },

  log(msg: string, styleClass: string): void {
    const div = document.createElement("div");
    div.className = `${GAME_DATA.dom.classes.logEntry} ${styleClass}`;
    div.innerHTML = msg;
    DOM.storyLog.appendChild(div);
    DOM.storyLog.scrollTop = DOM.storyLog.scrollHeight;
  },

  inspect(topic: string): void {
    const info = GAME_DATA.glossary[topic];
    if (info) {
      Engine.log(`[INTEL] ${info}`, GAME_DATA.dom.classes.logHelp!);
    }
  },

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

    if (StateHooks[currentPhase]?.onExit) StateHooks[currentPhase].onExit!();
    VoyageSession.setPhase(newPhase);
    if (StateHooks[newPhase]?.onEnter) StateHooks[newPhase].onEnter!();

    Engine.updateUI();
    return true;
  },

  executeAction(actId: ActionId): void {
    const res = VoyageSession.executeAction(actId);
    if (res.isMenu) {
      Engine.transitionTo(res.menuTarget!);
      return;
    }

    Engine.log(res.logText ?? "", res.logClass ?? "");

    const snap = VoyageSession.getSnapshot();
    if (snap.hull <= GAME_DATA.config.DEATH_HULL_THRESHOLD) {
      Engine.transitionTo(GAME_DATA.phases.dead!);
    } else {
      Engine.transitionTo(GAME_DATA.phases.idle!);
      VoyageSession.evaluateSurvival();
    }
  },

  exploreNode(this: void): void {
    const snap = VoyageSession.getSnapshot();
    const node = GAME_DATA.nodes[snap.dimId];
    if (snap.energy < node.exploreCost) return;

    const success = VoyageSession.exploreNode();
    if (!success) return;

    DOM.tutorialCue.hidden = true;
    DOM.btnExplore.classList.remove(GAME_DATA.dom.classes.tutorialHighlight!);

    Engine.log(
      GAME_DATA.text.logEncounterTitle(node.label, node.desc),
      GAME_DATA.dom.classes.logEvent!,
    );
    SoundFX.playDialogueChime();
    Engine.transitionTo(GAME_DATA.phases.encounter!);
    VoyageSession.evaluateSurvival();

    DOM.encounterChoices.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  },

  initiateTravel(this: void): void {
    const travel = VoyageSession.initiateTravel();
    if (!travel) return;

    if (travel.isNavigating) {
      Engine.transitionTo(GAME_DATA.phases.navigating!);
    } else {
      Engine.finalizeJump(travel.targetDimId!, travel.targetDimName!);
    }
  },

  finalizeJump(dimId: string, dimName: string): void {
    VoyageSession.commitJumpTarget(dimId, dimName);
    Engine.transitionTo(GAME_DATA.phases.jumping!);
  },

  desperateScavenge(this: void): void {
    const success = VoyageSession.desperateScavenge();
    if (!success) return;

    Engine.log(GAME_DATA.text.logDesperate, GAME_DATA.dom.classes.logDamage!);
    Engine.updateUI();
    VoyageSession.evaluateSurvival();
  },

  buildMenuButton(
    label: string,
    onClick: () => void,
    uiClass?: string,
    dataActId?: string,
  ): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.innerText = label;
    if (uiClass) btn.className = uiClass;
    if (dataActId) btn.dataset.actId = dataActId;
    btn.addEventListener("click", onClick);
    DOM.encounterChoices.appendChild(btn);
    return btn;
  },

  updateActionBtnData(btn: HTMLButtonElement, act: GameAction): void {
    const snap = VoyageSession.getSnapshot();
    const meetsReqsAndAffords = VoyageSession.canAffordAction(act);
    const reqStrs: string[] = [];
    for (const [rKey, rVal] of Object.entries(act.requires || {})) {
      const key = rKey as ResourceKey;
      const label = GAME_DATA.resources[key];
      reqStrs.push(typeof rVal === "number" ? `Req: ${rVal} ${label}` : `Req: ${String(rVal)}`);
    }
    const costStrs = act.consumes.map((rule) =>
      GAME_DATA.text.formatResVal(VoyageSession.getActualCost(rule), GAME_DATA.resources[rule.res]),
    );
    if (act.probability) {
      costStrs.push(
        GAME_DATA.text.formatChance(Math.floor(act.probability(snap!, GAME_DATA.config) * 100)),
      );
    }
    const prodStrs = (act.produces || []).map((rule) =>
      GAME_DATA.text.formatResVal(
        rule.amount(snap!, GAME_DATA.config),
        GAME_DATA.resources[rule.res],
      ),
    );

    btn.innerText = GAME_DATA.text.formatActionBtn(act.label, costStrs, prodStrs, reqStrs);
    btn.disabled = !meetsReqsAndAffords;
  },

  updateYardBtnData(btn: HTMLButtonElement, item: YardItem): void {
    const snap = VoyageSession.getSnapshot();
    let label = GAME_DATA.text.yardItemLabelMenu(item.name, item.desc, item.cost);
    const currentEq = String(snap[item.type] ?? "");

    if (currentEq === item.name) {
      label += `\n${GAME_DATA.text.yardOwned}`;
      btn.disabled = true;
    } else {
      if (currentEq !== GAME_DATA.text.noneState)
        label += `\n${GAME_DATA.text.yardReplaceWarning(currentEq)}`;
      if (snap.flux < item.cost) btn.disabled = true;
    }
    btn.innerText = label;
  },

  refreshActiveMenu(): void {
    const snap = VoyageSession.getSnapshot();
    if (snap.phase === GAME_DATA.phases.encounter) {
      Array.from(DOM.encounterChoices.children).forEach((btn) => {
        const actId = (btn as HTMLElement).dataset.actId as ActionId | undefined;
        if (actId) Engine.updateActionBtnData(btn as HTMLButtonElement, GAME_DATA.actions[actId]!);
      });
    } else if (snap.phase === GAME_DATA.phases.yard_category) {
      Array.from(DOM.encounterChoices.children).forEach((btn) => {
        const yardId = (btn as HTMLElement).dataset.yardId as YardKey | undefined;
        if (yardId) Engine.updateYardBtnData(btn as HTMLButtonElement, GAME_DATA.yard[yardId]!);
      });
    }
  },

  renderSensors(): void {
    const snap = VoyageSession.getSnapshot();
    if (!DOM.artDisplay || !DOM.bridgeScene) return;

    if (DOM.bridgeScene.dataset.dimName !== snap.dimName) {
      DOM.bridgeScene.innerHTML = "";
      DOM.bridgeScene.dataset.dimName = snap.dimName;
    }

    const artworkMarkup = DioramaPipeline.render(snap.dimName, (asyncArtwork) => {
      const current = VoyageSession.getSnapshot();
      if (asyncArtwork && current.dimName === snap.dimName) {
        DOM.bridgeScene.innerHTML = asyncArtwork;
        if (current.isSurveyed) DOM.artDisplay.innerHTML = asyncArtwork;
      }
    });
    if (artworkMarkup) DOM.bridgeScene.innerHTML = artworkMarkup;

    if (snap.isSurveyed) {
      if (artworkMarkup) {
        DOM.artDisplay.innerHTML = artworkMarkup;
      }
    } else {
      DOM.artDisplay.innerHTML = `
              <div id="art-glyph"></div>
              <span id="art-label">SIGNAL LOCKED</span>
            `;
      DOM.artLabel = document.getElementById("art-label") as HTMLElement;
      DOM.artGlyph = document.getElementById("art-glyph") as HTMLElement;
      TransitionFX.applyThemeStyles(snap.dimName.split(" ")[0] ?? "");
    }
  },

  renderVitals(): void {
    syncUI();
    if (DOM.locationName) DOM.locationName.innerText = ui.locationName;
    if (DOM.locationType) DOM.locationType.innerText = ui.locationType;
    if (DOM.dimTypeCodex) DOM.dimTypeCodex.innerText = ui.dimTypeCodex;
    if (DOM.statRep) DOM.statRep.innerText = ui.rep;
    if (DOM.corvusPortrait) {
      DOM.corvusPortrait.hidden = VoyageSession.hasObserverDeparted();
    }
  },

  renderInteractiveControls(): void {
    syncUI();
  },

  renderForge(): void {
    syncUI();
  },

  forgeUpgrade(tierKey: TierKey, onUpgrade?: () => void): void {
    const success = VoyageSession.forgeUpgrade(tierKey, onUpgrade);
    if (success) {
      Engine.updateUI();
      VoyageSession.evaluateSurvival();
    }
  },

  resetGame(confirmPrompt: boolean = true): void {
    if (confirmPrompt && !confirm("Purge all voyage telemetry and restart from Waypoint 1?")) {
      return;
    }
    SaveSystem.clear();
    location.reload();
  },

  lockdownGameOver(logMessage: string): void {
    SaveSystem.clear();
    SoundFX.silenceOnDeath();
    document.querySelectorAll("button").forEach((b) => (b.disabled = true));
    DOM.rightPanel.classList.add(GAME_DATA.dom.classes.lockedUI!);
    Engine.log(logMessage, GAME_DATA.dom.classes.logDamage!);
  },

  updateUI(): void {
    VoyageSession.enforceStateBounds();
    Engine.renderVitals();
    Engine.renderInteractiveControls();
    Engine.renderForge();
    Engine.refreshActiveMenu();
    Engine.renderSensors();
    VoyageSession.assertInvariants();
  },

  cacheDOM(): void {
    Object.entries(GAME_DATA.dom.ids).forEach(([domKey, elementId]) => {
      const el = document.getElementById(elementId);
      if (el) (DOM as unknown as Record<string, HTMLElement>)[domKey] = el;
    });
    DOM.panes = [DOM.paneSettings, DOM.paneSensors, DOM.paneBridge, DOM.paneForge, DOM.paneManual];
    DOM.tabs = [DOM.tabSettings, DOM.tabSensors, DOM.tabBridge, DOM.tabForge, DOM.tabManual];
  },

  setupStaticText(): void {
    const snap = VoyageSession.getSnapshot();
    const audioPrefs = SaveSystem.loadAudioPrefs();
    if (audioPrefs) {
      SoundFX.ambientMode = audioPrefs.mode ?? "rails";
      SoundFX.ambientSliderVal = audioPrefs.ambientSlider ?? 100;
      SoundFX.sfxSliderVal = audioPrefs.sfxSlider ?? 100;
      SoundFX.ambientVolume = SoundFX.sliderToGain(SoundFX.ambientSliderVal);
      SoundFX.sfxVolume = SoundFX.sliderToGain(SoundFX.sfxSliderVal);
      SoundFX.isMuted = !!audioPrefs.muted;

      if (DOM.selectAmbientMode) DOM.selectAmbientMode.value = SoundFX.ambientMode;
      if (DOM.sliderAmbientVol) DOM.sliderAmbientVol.value = String(SoundFX.ambientSliderVal);
      if (DOM.lblAmbientVol) DOM.lblAmbientVol.innerText = `${SoundFX.ambientSliderVal}%`;
      if (DOM.sliderSfxVol) DOM.sliderSfxVol.value = String(SoundFX.sfxSliderVal);
      if (DOM.lblSfxVol) DOM.lblSfxVol.innerText = `${SoundFX.sfxSliderVal}%`;
      if (DOM.btnToggleMute) {
        DOM.btnToggleMute.innerText = `Mute Audio: ${SoundFX.isMuted ? "ON" : "OFF"}`;
      }
    }

    if (SaveSystem.hasSave()) {
      const saved = SaveSystem.load();
      DOM.btnIgnite.innerText = `Resume Journey (Waypoint ${saved ? saved.jumpCount : 1})`;
      if (DOM.btnStartFresh) {
        DOM.btnStartFresh.innerText = GAME_DATA.text.btnNewGame;
        DOM.btnStartFresh.style.display = "flex";
      }
    } else {
      DOM.btnIgnite.innerText = GAME_DATA.text.btnIgnite;
      if (DOM.btnStartFresh) {
        DOM.btnStartFresh.style.display = "none";
      }
    }
    if (DOM.btnResetSave) {
      DOM.btnResetSave.innerText = GAME_DATA.text.btnNewGame;
    }
    DOM.lblForge.innerText = GAME_DATA.text.lblForge;
    DOM.lblNavTitle.innerText = GAME_DATA.text.lblNavTitle;
    TransitionFX.applyThemeStyles(snap.dimName.split(" ")[0] ?? "");
    Engine.log(GAME_DATA.text.initLog, GAME_DATA.dom.classes.logSystem!);
  },

  syncTabsWithScroll(this: void): void {
    const container = DOM.snapSlider;
    if (!container || !DOM.panes) return;

    const containerCenter = container.scrollLeft + container.clientWidth / 2;
    let closestIdx = 0;
    let minDiff = Infinity;

    DOM.panes.forEach((pane, idx) => {
      if (!pane) return;
      const paneCenter = pane.offsetLeft - container.offsetLeft + pane.offsetWidth / 2;
      const diff = Math.abs(containerCenter - paneCenter);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });

    DOM.tabs.forEach((tab, i) => {
      if (tab) tab.classList.toggle("active", i === closestIdx);
    });
  },

  scrollToPane(index: number): void {
    const container = DOM.snapSlider;
    const target = DOM.panes?.[index];
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
  },

  bindEvents(): void {
    DOM.btnExplore.addEventListener("click", Engine.exploreNode);
    DOM.btnTravel.addEventListener("click", Engine.initiateTravel);
    DOM.btnDesperate.addEventListener("click", Engine.desperateScavenge);

    DOM.btnForgeEng.addEventListener("click", () => {
      VoyageSession.forgeUpgrade("engineTier");
      Engine.updateUI();
      VoyageSession.evaluateSurvival();
    });

    DOM.btnForgeWpn.addEventListener("click", () => {
      VoyageSession.forgeUpgrade("weaponTier");
      Engine.updateUI();
      VoyageSession.evaluateSurvival();
    });

    DOM.btnResetSave.addEventListener("click", () => Engine.resetGame(true));

    DOM.btnStartFresh.addEventListener("click", () => Engine.resetGame(true));

    DOM.cutsceneBtnA.addEventListener("click", () => CutsceneEngine.advance());
    DOM.cutsceneBtnB.addEventListener("click", () => CutsceneEngine.advance());
    document.addEventListener("keydown", CutsceneEngine.trapFocus);
    document.addEventListener("focusin", CutsceneEngine.trapFocus);

    DOM.selectAmbientMode.addEventListener("change", (e) => {
      const target = e.target as HTMLSelectElement;
      SoundFX.setAmbientMode(target.value as "rails" | "telemetry" | "none");
      Engine.log(
        `[ACOUSTICS] Soundscape shifted to: ${target.options[target.selectedIndex]?.text ?? target.value}`,
        GAME_DATA.dom.classes.logSystem!,
      );
    });

    DOM.sliderAmbientVol.addEventListener("input", (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      DOM.lblAmbientVol.innerText = `${val}%`;
      SoundFX.setAmbientVolume(val);
    });

    DOM.sliderSfxVol.addEventListener("input", (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      DOM.lblSfxVol.innerText = `${val}%`;
      SoundFX.setSfxVolume(val);
    });

    DOM.btnToggleMute.addEventListener("click", () => {
      const isMuted = SoundFX.toggleMute();
      DOM.btnToggleMute.innerText = `Mute Audio: ${isMuted ? "ON" : "OFF"}`;
      DOM.btnToggleMute.style.borderColor = isMuted ? "var(--danger)" : "var(--border-bright)";
      DOM.btnToggleMute.style.color = isMuted ? "var(--danger)" : "var(--text)";
    });

    DOM.btnIgnite.addEventListener("click", () => {
      SoundFX.init();
      DOM.startScreen.style.display = "none";
      DOM.gameContainer.style.display = "flex";

      const saved = SaveSystem.load();
      if (saved) {
        VoyageSession.loadState(saved);
        const snap = VoyageSession.getSnapshot();
        TransitionFX.applyThemeStyles(snap.dimName.split(" ")[0] ?? "");
        Engine.log(
          `[CONDUIT] Resumed trajectory at ${snap.dimName} (Waypoint ${snap.jumpCount}).`,
          GAME_DATA.dom.classes.logSystem!,
        );
      } else {
        ConduitDeck.init();
      }

      Engine.transitionTo(GAME_DATA.phases.idle!);

      setTimeout(() => {
        Engine.scrollToPane(2);
      }, 50);

      const snap = VoyageSession.getSnapshot();
      if (snap.jumpCount === 1 && !snap.seenCutscenes?.includes("wp1")) {
        setTimeout(() => {
          CutsceneEngine.play("wp1");
        }, 120);
      }
    });

    DOM.tabs.forEach((tab, idx) => {
      if (tab) {
        tab.addEventListener("click", () => Engine.scrollToPane(idx));
      }
    });

    DOM.snapSlider.addEventListener("scroll", Engine.syncTabsWithScroll, {
      passive: true,
    });
  },

  init(): void {
    Engine.verifyGraphIntegrity();
    Engine.verifyPaletteIntegrity();
    Engine.cacheDOM();
    DioramaPipeline.init();
    TransitionFX.init();
    Engine.setupStaticText();
    Engine.bindEvents();
  },
};

export function clearEncounterChoices(): void {
  DOM.encounterChoices.innerHTML = "";
}

export const StateHooks: Record<string, StateHook> = {
  ENCOUNTER: {
    onEnter: () => {
      const snap = VoyageSession.getSnapshot();
      GAME_DATA.nodes[snap.dimId].actions.forEach((actId) => {
        const act = GAME_DATA.actions[actId]!;
        const btn = Engine.buildMenuButton(
          "",
          () => Engine.executeAction(actId),
          act.uiClass,
          actId,
        );
        if (act.isMenu) btn.innerText = act.label;
      });
    },
    onExit: clearEncounterChoices,
  },
  YARD_ROOT: {
    onEnter: () => {
      const categories = [
        {
          label: GAME_DATA.text.btnYardModules,
          cat: GAME_DATA.resources.module,
        },
        {
          label: GAME_DATA.text.btnYardCarriages,
          cat: GAME_DATA.resources.carriage,
        },
        {
          label: GAME_DATA.text.btnYardCrew,
          cat: GAME_DATA.resources.crew,
        },
      ];
      categories.forEach(({ label, cat }) => {
        Engine.buildMenuButton(label, () => {
          VoyageSession.setYardCategory(cat);
          Engine.transitionTo(GAME_DATA.phases.yard_category!);
        });
      });
      Engine.buildMenuButton(
        GAME_DATA.text.btnYardLeave,
        () => {
          Engine.transitionTo(GAME_DATA.phases.encounter!);
          VoyageSession.evaluateSurvival();
        },
        GAME_DATA.dom.classes.btnDesperate,
      );
    },
    onExit: clearEncounterChoices,
  },
  YARD_CATEGORY: {
    onEnter: () => {
      const snap = VoyageSession.getSnapshot();
      Object.entries(GAME_DATA.yard)
        .filter(([, i]) => i.type === snap.yardCat)
        .forEach(([k, item]) => {
          const btn = Engine.buildMenuButton("", () => {
            if (VoyageSession.buyYardItem(k as YardKey)) {
              Engine.log(
                GAME_DATA.text.logYardPurchase(item.name),
                GAME_DATA.dom.classes.logSuccess!,
              );
              Engine.updateUI();
            }
          });
          btn.dataset.yardId = k;
        });
      Engine.buildMenuButton(
        GAME_DATA.text.btnYardBack,
        () => Engine.transitionTo(GAME_DATA.phases.yard_root!),
        GAME_DATA.dom.classes.btnTravel,
      );
    },
    onExit: clearEncounterChoices,
  },
  NAVIGATING: {
    onEnter: () => {
      const snap = VoyageSession.getSnapshot();
      DOM.navScreen.style.display = "flex";
      setChoices(snap.navChoices);
    },
    onExit: () => {
      DOM.navScreen.style.display = "none";
      resetNav();
    },
  },
  JUMPING: {
    onEnter: () => {
      const snap = VoyageSession.getSnapshot();
      const targetDimId = snap.targetDimId ?? "";
      const targetDimName = snap.targetDimName ?? "";

      DOM.artDisplay.innerHTML = `
              <div id="art-glyph"></div>
              <span id="art-label">SIGNAL LOCKED</span>
            `;
      DOM.artLabel = document.getElementById("art-label") as HTMLElement;
      DOM.artGlyph = document.getElementById("art-glyph") as HTMLElement;
      TransitionFX.applyThemeStyles(targetDimName.split(" ")[0] ?? "");

      TransitionFX.playJumpEffect(
        targetDimId,
        targetDimName,
        () => {
          const jumpResult = VoyageSession.completeJump(targetDimId, targetDimName);

          if (jumpResult.greenhouseYield > 0) {
            Engine.log(
              GAME_DATA.text.logGreenhouse(jumpResult.greenhouseYield),
              GAME_DATA.dom.classes.logSystem!,
            );
          }
          if (jumpResult.goblinYield > 0) {
            Engine.log(
              GAME_DATA.text.logGoblin(jumpResult.goblinYield),
              GAME_DATA.dom.classes.logSystem!,
            );
          }

          Engine.log(
            GAME_DATA.text.logLocEnter(
              targetDimName,
              GAME_DATA.nodes[targetDimId as "hub"].label,
              jumpResult.jumpCount,
            ),
            GAME_DATA.dom.classes.logSystem!,
          );
        },
        () => {
          Engine.transitionTo(GAME_DATA.phases.idle!);
          VoyageSession.evaluateSurvival();

          const currentSnap = VoyageSession.getSnapshot();
          const wpCutsceneMap: Record<number, string> = {
            2: "wp2",
            3: "wp3",
            4: "wp4",
            5: "wp5",
          };
          const nextCutscene = wpCutsceneMap[currentSnap.jumpCount];
          if (nextCutscene && !currentSnap.seenCutscenes?.includes(nextCutscene)) {
            setTimeout(() => {
              CutsceneEngine.play(nextCutscene);
            }, 150);
          }
        },
      );
    },
  },
  DEAD: {
    onEnter: () => Engine.lockdownGameOver(GAME_DATA.text.logDead),
  },
  STRANDED: {
    onEnter: () => Engine.lockdownGameOver(GAME_DATA.text.logStranded),
  },
};
