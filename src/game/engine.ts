// @ts-nocheck -- legacy module extracted verbatim; remove per-module as types land.
// Extracted verbatim from index.html during TS migration.
import { DOM } from "../ui/dom";
import { DioramaPipeline } from "./art";
import { SoundFX } from "./audio";
import { RiftCouplingBoard } from "./board";
import { ConduitDeck } from "./conduit";
import { CutsceneEngine } from "./cutscene";
import { GAME_DATA } from "./data";
import { RiftVectorDial } from "./dial";
import { TransitionFX } from "./fx";
import { SaveSystem } from "./save";
import { VoyageSession } from "./session";
export const Engine: any = {
  verifyGraphIntegrity: () => {
    const phases = Object.values(GAME_DATA.phases);
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

  verifyPaletteIntegrity: () => {
    const MIN_DELTA_E = 0.08;
    const dummy = document.createElement("div");
    dummy.style.display = "none";
    document.body.appendChild(dummy);

    const types = ["damage", "lore", "success", "system", "event", "help"];
    const colorNodes = [];

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
        const deltaE = Math.hypot(c1.L - c2.L, c1.a - c2.a, c1.b - c2.b);

        if (deltaE < MIN_DELTA_E) {
          console.error(
            `PALETTE INVARIANT BREACH: Log types '${c1.name}' and '${c2.name}' are visually indistinguishable (ΔE_ok = ${deltaE.toFixed(4)} < ${MIN_DELTA_E}).`,
          );
        }
      }
    }
  },
  log: (msg, styleClass) => {
    const div = document.createElement("div");
    div.className = `${GAME_DATA.dom.classes.logEntry} ${styleClass}`;
    div.innerHTML = msg;
    DOM.storyLog.appendChild(div);
    DOM.storyLog.scrollTop = DOM.storyLog.scrollHeight;
  },

  inspect: (topic) => {
    const info = GAME_DATA.glossary[topic];
    if (info) {
      Engine.log(`[INTEL] ${info}`, GAME_DATA.dom.classes.logHelp);
    }
  },

  transitionTo: (newPhase) => {
    const currentPhase = VoyageSession.getPhase();
    const allowed = GAME_DATA.transitions[currentPhase];

    if (!allowed.includes(newPhase)) {
      console.error(`ILLEGAL TRANSITION: Cannot move from ${currentPhase} to ${newPhase}`);
      return false;
    }

    if (StateHooks[currentPhase]?.onExit) StateHooks[currentPhase].onExit();
    VoyageSession.setPhase(newPhase);
    if (StateHooks[newPhase]?.onEnter) StateHooks[newPhase].onEnter();

    Engine.updateUI();
    return true;
  },

  executeAction: (actId) => {
    const res = VoyageSession.executeAction(actId);
    if (res.isMenu) {
      Engine.transitionTo(res.menuTarget);
      return;
    }

    Engine.log(res.logText, res.logClass);

    const snap = VoyageSession.getSnapshot();
    if (snap.hull <= GAME_DATA.config.DEATH_HULL_THRESHOLD) {
      Engine.transitionTo(GAME_DATA.phases.dead);
    } else {
      Engine.transitionTo(GAME_DATA.phases.idle);
      VoyageSession.evaluateSurvival();
    }
  },

  exploreNode: () => {
    const snap = VoyageSession.getSnapshot();
    const node = GAME_DATA.nodes[snap.dimId];
    if (snap.energy < node.exploreCost) return;

    const success = VoyageSession.exploreNode();
    if (!success) return;

    DOM.tutorialCue.hidden = true;
    DOM.btnExplore.classList.remove(GAME_DATA.dom.classes.tutorialHighlight);

    Engine.log(
      GAME_DATA.text.logEncounterTitle(node.label, node.desc),
      GAME_DATA.dom.classes.logEvent,
    );
    SoundFX.playDialogueChime();
    Engine.transitionTo(GAME_DATA.phases.encounter);
    VoyageSession.evaluateSurvival();

    DOM.encounterChoices.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  },

  initiateTravel: () => {
    const travel = VoyageSession.initiateTravel();
    if (!travel) return;

    if (travel.isNavigating) {
      Engine.transitionTo(GAME_DATA.phases.navigating);
    } else {
      Engine.finalizeJump(travel.targetDimId, travel.targetDimName);
    }
  },

  finalizeJump: (dimId, dimName) => {
    VoyageSession.commitJumpTarget(dimId, dimName);
    Engine.transitionTo(GAME_DATA.phases.jumping);
  },

  desperateScavenge: () => {
    const success = VoyageSession.desperateScavenge();
    if (!success) return;

    Engine.log(GAME_DATA.text.logDesperate, GAME_DATA.dom.classes.logDamage);
    Engine.updateUI();
    VoyageSession.evaluateSurvival();
  },
  buildMenuButton: (label, onClick, uiClass, dataActId) => {
    const btn = document.createElement("button");
    btn.innerText = label;
    if (uiClass) btn.className = uiClass;
    if (dataActId) btn.dataset.actId = dataActId;
    btn.addEventListener("click", onClick);
    DOM.encounterChoices.appendChild(btn);
    return btn;
  },

  updateActionBtnData: (btn, act) => {
    const snap = VoyageSession.getSnapshot();
    const meetsReqsAndAffords = VoyageSession.canAffordAction(act);
    const reqStrs = [];
    for (const [rKey, rVal] of Object.entries(act.requires || {})) {
      reqStrs.push(
        typeof rVal === "number" ? `Req: ${rVal} ${GAME_DATA.resources[rKey]}` : `Req: ${rVal}`,
      );
    }
    const costStrs = act.consumes.map((rule) =>
      GAME_DATA.text.formatResVal(VoyageSession.getActualCost(rule), GAME_DATA.resources[rule.res]),
    );
    if (act.probability) {
      costStrs.push(
        GAME_DATA.text.formatChance(Math.floor(act.probability(snap, GAME_DATA.config) * 100)),
      );
    }
    const prodStrs = (act.produces || []).map((rule) =>
      GAME_DATA.text.formatResVal(
        rule.amount(snap, GAME_DATA.config),
        GAME_DATA.resources[rule.res],
      ),
    );

    btn.innerText = GAME_DATA.text.formatActionBtn(act.label, costStrs, prodStrs, reqStrs);
    btn.disabled = !meetsReqsAndAffords;
  },

  updateYardBtnData: (btn, item) => {
    const snap = VoyageSession.getSnapshot();
    let label = GAME_DATA.text.yardItemLabelMenu(item.name, item.desc, item.cost);
    const currentEq = snap[item.type];

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

  refreshActiveMenu: () => {
    const snap = VoyageSession.getSnapshot();
    if (snap.phase === GAME_DATA.phases.encounter) {
      Array.from(DOM.encounterChoices.children).forEach((btn) => {
        if (btn.dataset.actId)
          Engine.updateActionBtnData(btn, GAME_DATA.actions[btn.dataset.actId]);
      });
    } else if (snap.phase === GAME_DATA.phases.yard_category) {
      Array.from(DOM.encounterChoices.children).forEach((btn) => {
        if (btn.dataset.yardId) Engine.updateYardBtnData(btn, GAME_DATA.yard[btn.dataset.yardId]);
      });
    }
  },

  renderSensors: () => {
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
      DOM.artLabel = document.getElementById("art-label");
      DOM.artGlyph = document.getElementById("art-glyph");
      TransitionFX.applyThemeStyles(snap.dimName.split(" ")[0]);
    }
  },

  renderVitals: () => {
    const snap = VoyageSession.getSnapshot();
    DOM.locationName.innerText = GAME_DATA.text.formatDimName(snap.dimName);

    DOM.statHull.innerText = GAME_DATA.text.formatPct(Math.floor(snap.hull));
    DOM.statFuel.innerText = Math.floor(snap.fuel);
    DOM.statEnergy.innerText = GAME_DATA.text.formatStatPair(
      snap.energy,
      VoyageSession.getMaxEnergy(),
    );
    DOM.statFlux.innerText = Math.floor(snap.flux);
    DOM.statRep.innerText = snap.rep;
    DOM.statSector.innerText = GAME_DATA.text.formatSectorWaypoint(snap.jumpCount);

    DOM.eqEngine.innerText = GAME_DATA.text.formatTier(snap.engineTier);
    DOM.eqWeapon.innerText = GAME_DATA.text.formatTier(snap.weaponTier);
    DOM.eqModule.innerText = snap.module;
    DOM.eqCarriage.innerText = snap.carriage;
    DOM.eqCrew.innerText = snap.crew;
    DOM.locationType.innerText = GAME_DATA.text.formatDimType(GAME_DATA.nodes[snap.dimId].label);
    DOM.dimTypeCodex.innerText = GAME_DATA.nodes[snap.dimId].label;

    DOM.statHull.style.color =
      snap.hull <= GAME_DATA.config.CRITICAL_HULL_THRESHOLD ? "var(--danger)" : "var(--success)";
    DOM.statFuel.style.color =
      snap.fuel < VoyageSession.getTravelCost() ? "var(--danger)" : "var(--action)";
    DOM.statEnergy.style.color = snap.energy === 0 ? "var(--warning)" : "var(--energy)";

    // Observer presence derives solely from save state, never from
    // ad-hoc DOM writes (DEVELOPER NOTES 4: single source of truth).
    if (DOM.corvusPortrait) {
      DOM.corvusPortrait.hidden = VoyageSession.hasObserverDeparted();
    }
  },

  renderInteractiveControls: () => {
    const snap = VoyageSession.getSnapshot();
    const travelCost = VoyageSession.getTravelCost();
    const node = GAME_DATA.nodes[snap.dimId];
    const perms = GAME_DATA.permissions[snap.phase];

    DOM.btnExplore.innerText = node.isHub
      ? GAME_DATA.text.btnExploreHub(node.exploreCost)
      : GAME_DATA.text.btnExploreClosed(node.exploreCost);
    DOM.btnExplore.disabled = !perms.explore || snap.energy < node.exploreCost;

    DOM.btnTravel.innerText = GAME_DATA.text.btnJump(travelCost);
    DOM.btnTravel.disabled = !perms.travel || snap.fuel < travelCost;

    DOM.btnDesperate.innerText = GAME_DATA.text.btnDesperate(
      GAME_DATA.config.DESPERATE_HULL_COST,
      GAME_DATA.config.DESPERATE_FUEL_YIELD,
    );
    DOM.btnDesperate.style.display =
      snap.fuel < travelCost && snap.hull > GAME_DATA.config.DESPERATE_HULL_COST && perms.travel
        ? "block"
        : "none";
  },

  renderForge: () => {
    const snap = VoyageSession.getSnapshot();
    const fEngCost = VoyageSession.getForgeCost(snap.engineTier);
    const perms = GAME_DATA.permissions[snap.phase];
    const nextJumpCost = VoyageSession.getNextTierTravelCost();

    DOM.btnForgeEng.innerText =
      snap.engineTier >= GAME_DATA.config.MAX_TIER
        ? GAME_DATA.text.btnApexEngine
        : GAME_DATA.text.btnForgeEngine(
            fEngCost,
            GAME_DATA.config.TRAVEL_TIER_MULT,
            nextJumpCost,
            snap.fuel,
          );
    DOM.btnForgeEng.disabled =
      !perms.forge || snap.flux < fEngCost || snap.engineTier >= GAME_DATA.config.MAX_TIER;

    const fWpnCost = VoyageSession.getForgeCost(snap.weaponTier);
    DOM.btnForgeWpn.innerText =
      snap.weaponTier >= GAME_DATA.config.MAX_TIER
        ? GAME_DATA.text.btnApexWeapon
        : GAME_DATA.text.btnForgeWeapon(fWpnCost);
    DOM.btnForgeWpn.disabled =
      !perms.forge || snap.flux < fWpnCost || snap.weaponTier >= GAME_DATA.config.MAX_TIER;
  },

  forgeUpgrade: (tierKey, onUpgrade) => {
    const success = VoyageSession.forgeUpgrade(tierKey, onUpgrade);
    if (success) {
      Engine.updateUI();
      VoyageSession.evaluateSurvival();
    }
  },

  resetGame: (confirmPrompt = true) => {
    if (confirmPrompt && !confirm("Purge all voyage telemetry and restart from Waypoint 1?")) {
      return;
    }
    SaveSystem.clear();
    location.reload();
  },

  lockdownGameOver: (logMessage) => {
    SaveSystem.clear();
    SoundFX.silenceOnDeath();
    document.querySelectorAll("button").forEach((b) => (b.disabled = true));
    DOM.rightPanel.classList.add(GAME_DATA.dom.classes.lockedUI);
    Engine.log(logMessage, GAME_DATA.dom.classes.logDamage);
  },

  updateUI: () => {
    VoyageSession.enforceStateBounds();
    Engine.renderVitals();
    Engine.renderInteractiveControls();
    Engine.renderForge();
    Engine.refreshActiveMenu();
    Engine.renderSensors();
    VoyageSession.assertInvariants();
  },

  cacheDOM: () => {
    Object.entries(GAME_DATA.dom.ids).forEach(([domKey, elementId]) => {
      DOM[domKey] = document.getElementById(elementId);
    });
    DOM.panes = [DOM.paneSettings, DOM.paneSensors, DOM.paneBridge, DOM.paneForge, DOM.paneManual];
    DOM.tabs = [DOM.tabSettings, DOM.tabSensors, DOM.tabBridge, DOM.tabForge, DOM.tabManual];
  },

  setupStaticText: () => {
    const snap = VoyageSession.getSnapshot();
    const audioPrefs = SaveSystem.loadAudioPrefs();
    if (audioPrefs) {
      SoundFX.ambientMode = audioPrefs.mode || "rails";
      SoundFX.ambientSliderVal = audioPrefs.ambientSlider ?? 100;
      SoundFX.sfxSliderVal = audioPrefs.sfxSlider ?? 100;
      SoundFX.ambientVolume = SoundFX.sliderToGain(SoundFX.ambientSliderVal);
      SoundFX.sfxVolume = SoundFX.sliderToGain(SoundFX.sfxSliderVal);
      SoundFX.isMuted = !!audioPrefs.muted;

      if (DOM.selectAmbientMode) DOM.selectAmbientMode.value = SoundFX.ambientMode;
      if (DOM.sliderAmbientVol) DOM.sliderAmbientVol.value = SoundFX.ambientSliderVal;
      if (DOM.lblAmbientVol) DOM.lblAmbientVol.innerText = `${SoundFX.ambientSliderVal}%`;
      if (DOM.sliderSfxVol) DOM.sliderSfxVol.value = SoundFX.sfxSliderVal;
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
    TransitionFX.applyThemeStyles(snap.dimName.split(" ")[0]);
    Engine.log(GAME_DATA.text.initLog, GAME_DATA.dom.classes.logSystem);
  },

  syncTabsWithScroll: () => {
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

  scrollToPane: (index) => {
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

  bindEvents: () => {
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
      SoundFX.setAmbientMode(e.target.value);
      Engine.log(
        `[ACOUSTICS] Soundscape shifted to: ${e.target.options[e.target.selectedIndex].text}`,
        GAME_DATA.dom.classes.logSystem,
      );
    });

    DOM.sliderAmbientVol.addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10);
      DOM.lblAmbientVol.innerText = `${val}%`;
      SoundFX.setAmbientVolume(val);
    });

    DOM.sliderSfxVol.addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10);
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
        TransitionFX.applyThemeStyles(snap.dimName.split(" ")[0]);
        Engine.log(
          `[CONDUIT] Resumed trajectory at ${snap.dimName} (Waypoint ${snap.jumpCount}).`,
          GAME_DATA.dom.classes.logSystem,
        );
      } else {
        ConduitDeck.init();
      }

      Engine.transitionTo(GAME_DATA.phases.idle);

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

  init: () => {
    Engine.verifyGraphIntegrity();
    Engine.verifyPaletteIntegrity();
    Engine.cacheDOM();
    DioramaPipeline.init();
    TransitionFX.init();
    Engine.setupStaticText();
    Engine.bindEvents();
  },
};

export const clearEncounterChoices: any = () => (DOM.encounterChoices.innerHTML = "");

export const StateHooks: any = {
  ENCOUNTER: {
    onEnter: () => {
      const snap = VoyageSession.getSnapshot();
      GAME_DATA.nodes[snap.dimId].actions.forEach((actId) => {
        const act = GAME_DATA.actions[actId];
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
          Engine.transitionTo(GAME_DATA.phases.yard_category);
        });
      });
      Engine.buildMenuButton(
        GAME_DATA.text.btnYardLeave,
        () => {
          Engine.transitionTo(GAME_DATA.phases.encounter);
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
        .filter(([_, i]) => i.type === snap.yardCat)
        .forEach(([k, item]) => {
          const btn = Engine.buildMenuButton("", () => {
            if (VoyageSession.buyYardItem(k)) {
              Engine.log(
                GAME_DATA.text.logYardPurchase(item.name),
                GAME_DATA.dom.classes.logSuccess,
              );
              Engine.updateUI();
            }
          });
          btn.dataset.yardId = k;
        });
      Engine.buildMenuButton(
        GAME_DATA.text.btnYardBack,
        () => Engine.transitionTo(GAME_DATA.phases.yard_root),
        GAME_DATA.dom.classes.btnTravel,
      );
    },
    onExit: clearEncounterChoices,
  },
  NAVIGATING: {
    onEnter: () => {
      const snap = VoyageSession.getSnapshot();
      DOM.navScreen.style.display = "flex";
      RiftCouplingBoard.render(snap.navChoices);
      RiftVectorDial.reset();
    },
    onExit: () => {
      DOM.navScreen.style.display = "none";
      RiftCouplingBoard.reset();
    },
  },
  JUMPING: {
    onEnter: () => {
      const snap = VoyageSession.getSnapshot();
      const targetDimId = snap.targetDimId;
      const targetDimName = snap.targetDimName;
      // Needle already sits on the committed slot angle from
      // RiftCouplingBoard.confirm(); do not override it here.

      DOM.artDisplay.innerHTML = `
              <div id="art-glyph"></div>
              <span id="art-label">SIGNAL LOCKED</span>
            `;
      DOM.artLabel = document.getElementById("art-label");
      DOM.artGlyph = document.getElementById("art-glyph");
      TransitionFX.applyThemeStyles(targetDimName.split(" ")[0]);

      TransitionFX.playJumpEffect(
        targetDimId,
        targetDimName,
        () => {
          const jumpResult = VoyageSession.completeJump(targetDimId, targetDimName);

          if (jumpResult.greenhouseYield > 0) {
            Engine.log(
              GAME_DATA.text.logGreenhouse(jumpResult.greenhouseYield),
              GAME_DATA.dom.classes.logSystem,
            );
          }
          if (jumpResult.goblinYield > 0) {
            Engine.log(
              GAME_DATA.text.logGoblin(jumpResult.goblinYield),
              GAME_DATA.dom.classes.logSystem,
            );
          }

          Engine.log(
            GAME_DATA.text.logLocEnter(
              targetDimName,
              GAME_DATA.nodes[targetDimId].label,
              jumpResult.jumpCount,
            ),
            GAME_DATA.dom.classes.logSystem,
          );
        },
        () => {
          Engine.transitionTo(GAME_DATA.phases.idle);
          VoyageSession.evaluateSurvival();

          const currentSnap = VoyageSession.getSnapshot();
          const wpCutsceneMap = {
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
