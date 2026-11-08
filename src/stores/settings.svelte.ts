import { SoundFX } from "../game/audio";
import { SaveSystem } from "../game/save";
import { GAME_DATA } from "../game/data";
import type { AmbientMode } from "../game/types";

export const settings = $state({
  ambientMode: "rails" as AmbientMode,
  ambientSlider: 100,
  sfxSlider: 100,
  isMuted: false,
  igniteLabel: GAME_DATA.text.btnIgnite,
  freshLabel: GAME_DATA.text.btnNewGame,
  hasSave: false,
  resetLabel: GAME_DATA.text.btnNewGame,
  lblForge: GAME_DATA.text.lblForge,
  lblNavTitle: GAME_DATA.text.lblNavTitle,
});

export function syncSettings(): void {
  const prefs = SaveSystem.loadAudioPrefs();
  if (prefs) {
    SoundFX.ambientMode = prefs.mode ?? "rails";
    SoundFX.ambientSliderVal = prefs.ambientSlider ?? 100;
    SoundFX.sfxSliderVal = prefs.sfxSlider ?? 100;
    SoundFX.ambientVolume = SoundFX.sliderToGain(SoundFX.ambientSliderVal);
    SoundFX.sfxVolume = SoundFX.sliderToGain(SoundFX.sfxSliderVal);
    SoundFX.isMuted = !!prefs.muted;
  }
  settings.ambientMode = SoundFX.ambientMode;
  settings.ambientSlider = SoundFX.ambientSliderVal;
  settings.sfxSlider = SoundFX.sfxSliderVal;
  settings.isMuted = SoundFX.isMuted;
  settings.hasSave = SaveSystem.hasSave();
  if (settings.hasSave) {
    const saved = SaveSystem.load();
    settings.igniteLabel = `Resume Journey (Waypoint ${saved ? saved.jumpCount : 1})`;
  } else {
    settings.igniteLabel = GAME_DATA.text.btnIgnite;
  }
}
