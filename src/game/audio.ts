import { ambientProgram, SonicPiAudio } from "./sonicPi";
import type { AmbientMode, AudioConfig, AudioPrefs, Phase } from "./types";

export interface AudioTimers {
  setInterval?: (cb: () => void, ms: number) => number;
  clearInterval?: (id: number) => void;
  setTimeout?: (cb: () => void, ms: number) => number;
  clearTimeout?: (id: number) => void;
}

export interface AudioDeps {
  config: AudioConfig;
  createContext?: () => AudioContext | null;
  getPhase?: () => Phase | null;
  isTerminalPhase?: (phase: Phase) => boolean;
  onPrefsChanged?: (prefs: AudioPrefs) => void;
  random?: () => number;
  timers?: AudioTimers;
}

// Public surface stays the Web Audio-era API; every sound comes from Sonic Pi.
export class SoundFXService {
  isMuted = false;
  ambientSliderVal = 100;
  sfxSliderVal = 100;
  ambientVolume = 1.0;
  sfxVolume = 1.0;
  ambientMode: AmbientMode = "rails";
  currentThemeKey = "Fractured";

  private readonly config: AudioConfig;
  private readonly getPhase: (() => Phase | null) | undefined;
  private readonly isTerminalPhase: ((phase: Phase) => boolean) | undefined;
  private readonly onPrefsChanged: ((prefs: AudioPrefs) => void) | undefined;
  private readonly sonicPi = new SonicPiAudio();
  private ambientTimer: number | null = null;

  constructor(deps: AudioDeps) {
    this.config = deps.config;
    this.getPhase = deps.getPhase;
    this.isTerminalPhase = deps.isTerminalPhase;
    this.onPrefsChanged = deps.onPrefsChanged;
  }

  prefsSnapshot(): AudioPrefs {
    return {
      mode: this.ambientMode,
      ambientSlider: this.ambientSliderVal,
      sfxSlider: this.sfxSliderVal,
      muted: this.isMuted,
    };
  }

  applyPrefs(prefs: AudioPrefs): void {
    if (prefs.mode) this.ambientMode = prefs.mode;
    if (typeof prefs.ambientSlider === "number") {
      this.ambientSliderVal = prefs.ambientSlider;
      this.ambientVolume = this.sliderToGain(prefs.ambientSlider);
    }
    if (typeof prefs.sfxSlider === "number") {
      this.sfxSliderVal = prefs.sfxSlider;
      this.sfxVolume = this.sliderToGain(prefs.sfxSlider);
    }
    if (typeof prefs.muted === "boolean") this.isMuted = prefs.muted;
    this.startActiveSoundscape();
  }

  sliderToGain(sliderVal: number): number {
    const clamped = Math.max(0, Math.min(100, sliderVal));
    if (clamped <= 0) return 0;
    return Math.pow(clamped / 100, this.config.LOG_AUDIO_EXPONENT);
  }

  init(): void {
    void this.sonicPi.start().then(() => this.applyAmbient());
  }

  stopAllAmbient(): void {
    void this.sonicPi.playAmbient(null);
  }

  startActiveSoundscape(): void {
    this.applyAmbient();
  }

  setAmbientMode(mode: AmbientMode): void {
    this.ambientMode = mode;
    this.onPrefsChanged?.(this.prefsSnapshot());
    this.applyAmbient();
  }

  setAmbientVolume(sliderVal: number): void {
    this.ambientSliderVal = sliderVal;
    this.ambientVolume = this.sliderToGain(sliderVal);
    this.onPrefsChanged?.(this.prefsSnapshot());
    // Slider drags fire often; restart the ambient run once the drag settles.
    if (this.ambientTimer !== null) window.clearTimeout(this.ambientTimer);
    this.ambientTimer = window.setTimeout(() => {
      this.ambientTimer = null;
      this.applyAmbient();
    }, 150);
  }

  setSfxVolume(sliderVal: number): void {
    this.sfxSliderVal = sliderVal;
    this.sfxVolume = this.sliderToGain(sliderVal);
    this.onPrefsChanged?.(this.prefsSnapshot());
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    this.onPrefsChanged?.(this.prefsSnapshot());
    this.applyAmbient();
    return this.isMuted;
  }

  // Kept for callers; the jump SFX performs its own duck in Sonic Pi.
  duckAmbientForJump(_durationSec: number): void {}

  updateAmbientTheme(adjective: string): void {
    this.currentThemeKey = adjective;
  }

  silenceOnDeath(): void {
    this.stopAllAmbient();
    this.sonicPi.eval("sfx_silence()");
  }

  playJumpCharge(breachSec: number): void {
    this.sfx("sfx_jump", breachSec);
  }

  playArrivalChime(): void {
    this.sfx("sfx_arrival");
  }

  playDialogueChime(): void {
    this.sfx("sfx_dialogue");
  }

  playActionSuccess(): void {
    this.sfx("sfx_success");
  }

  playActionDamage(): void {
    this.sfx("sfx_damage");
  }

  private applyAmbient(): void {
    if (!this.sonicPi.ready) return;
    const phase = this.getPhase?.() ?? null;
    const terminal = phase
      ? (this.isTerminalPhase?.(phase) ?? (phase === "DEAD" || phase === "STRANDED"))
      : false;
    const mode = terminal || this.isMuted ? "none" : this.ambientMode;
    void this.sonicPi.playAmbient(ambientProgram(mode, this.ambientVolume));
  }

  private sfx(name: string, seconds?: number): void {
    if (this.isMuted) return;
    const call = seconds === undefined ? `${name}()` : `${name}(${seconds})`;
    // Set the level in the same job as the call: no cross-job state dependency.
    this.sonicPi.eval(`set :sfx_amp, ${this.sfxVolume}\n${call}`);
  }
}
