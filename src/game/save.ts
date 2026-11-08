// @ts-nocheck -- legacy module extracted verbatim; remove per-module as types land.
// Extracted verbatim from index.html during TS migration.
import { SoundFX } from "./audio";
import { GAME_DATA } from "./data";
import { Engine } from "./engine";
import { VoyageSession } from "./session";
export const SaveSystem: any = {
  STORAGE_KEY: "rift_rails_auto_save",
  AUDIO_KEY: "rift_rails_audio_prefs",

  save: () => {
    try {
      const payload = VoyageSession.serialize();
      localStorage.setItem(SaveSystem.STORAGE_KEY, JSON.stringify(payload));
      Engine.log(
        "[CONDUIT] Voyage telemetry archived automatically.",
        GAME_DATA.dom.classes.logSystem,
      );
    } catch (e) {
      console.warn("Auto-save failed to write to localStorage:", e);
    }
  },

  load: () => {
    try {
      const raw = localStorage.getItem(SaveSystem.STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn("Failed to parse auto-save:", e);
      return null;
    }
  },

  saveAudioPrefs: () => {
    try {
      const prefs = {
        mode: SoundFX.ambientMode,
        ambientSlider: SoundFX.ambientSliderVal,
        sfxSlider: SoundFX.sfxSliderVal,
        muted: SoundFX.isMuted,
      };
      localStorage.setItem(SaveSystem.AUDIO_KEY, JSON.stringify(prefs));
    } catch (e) {}
  },

  loadAudioPrefs: () => {
    try {
      const raw = localStorage.getItem(SaveSystem.AUDIO_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },

  clear: () => {
    try {
      localStorage.removeItem(SaveSystem.STORAGE_KEY);
    } catch (e) {
      console.warn("Failed to clear auto-save:", e);
    }
  },

  hasSave: () => {
    try {
      return !!localStorage.getItem(SaveSystem.STORAGE_KEY);
    } catch (e) {
      return false;
    }
  },
};
/* ========================================================
         WARP CANVAS & THEMATIC FX
         ======================================================== */
