import { SoundFX } from "./audio";
import { GAME_DATA } from "./data";
import { Engine } from "./engine";
import { VoyageSession } from "./session";
import type { AudioPrefs, SerializedVoyage } from "./types";

export const SaveSystem = {
  STORAGE_KEY: "rift_rails_auto_save",
  AUDIO_KEY: "rift_rails_audio_prefs",

  save(): void {
    try {
      const payload = VoyageSession.serialize();
      localStorage.setItem(SaveSystem.STORAGE_KEY, JSON.stringify(payload));
      Engine.log(
        "[CONDUIT] Voyage telemetry archived automatically.",
        GAME_DATA.dom.classes.logSystem!,
      );
    } catch (e) {
      console.warn("Auto-save failed to write to localStorage:", e);
    }
  },

  load(): SerializedVoyage | null {
    try {
      const raw = localStorage.getItem(SaveSystem.STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as SerializedVoyage;
    } catch (e) {
      console.warn("Failed to parse auto-save:", e);
      return null;
    }
  },

  saveAudioPrefs(): void {
    try {
      const prefs: AudioPrefs = {
        mode: SoundFX.ambientMode,
        ambientSlider: SoundFX.ambientSliderVal,
        sfxSlider: SoundFX.sfxSliderVal,
        muted: SoundFX.isMuted,
      };
      localStorage.setItem(SaveSystem.AUDIO_KEY, JSON.stringify(prefs));
    } catch {
      // Storage unavailable; audio prefs are non-essential.
    }
  },

  loadAudioPrefs(): AudioPrefs | null {
    try {
      const raw = localStorage.getItem(SaveSystem.AUDIO_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as AudioPrefs;
    } catch {
      return null;
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(SaveSystem.STORAGE_KEY);
    } catch (e) {
      console.warn("Failed to clear auto-save:", e);
    }
  },

  hasSave(): boolean {
    try {
      return !!localStorage.getItem(SaveSystem.STORAGE_KEY);
    } catch {
      return false;
    }
  },
};
