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

export class SoundFXService {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  ambientGain: GainNode | null = null;
  sfxGain: GainNode | null = null;
  isMuted = false;
  ambientSliderVal = 100;
  sfxSliderVal = 100;
  ambientVolume = 1.0;
  sfxVolume = 1.0;
  ambientMode: AmbientMode = "rails";
  currentThemeKey = "Fractured";
  railsTimer: number | null = null;
  railsStep = 0;
  telemetryTimer: number | null = null;

  private readonly config: AudioConfig;
  private readonly createContext: (() => AudioContext | null) | undefined;
  private readonly getPhase: (() => Phase | null) | undefined;
  private readonly isTerminalPhase: ((phase: Phase) => boolean) | undefined;
  private readonly onPrefsChanged: ((prefs: AudioPrefs) => void) | undefined;
  private readonly random: () => number;
  private readonly timers: AudioTimers;

  constructor(deps: AudioDeps) {
    this.config = deps.config;
    this.createContext = deps.createContext;
    this.getPhase = deps.getPhase;
    this.isTerminalPhase = deps.isTerminalPhase;
    this.onPrefsChanged = deps.onPrefsChanged;
    this.random = deps.random ?? Math.random;
    this.timers = deps.timers ?? {};
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
    if (this.ambientGain && this.ctx) {
      this.ambientGain.gain.setTargetAtTime(this.ambientVolume, this.ctx.currentTime, 0.05);
    }
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.05);
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 1, this.ctx.currentTime, 0.05);
    }
    if (this.ctx) this.startActiveSoundscape();
  }

  sliderToGain(sliderVal: number): number {
    const clamped = Math.max(0, Math.min(100, sliderVal));
    if (clamped <= 0) return 0;
    return Math.pow(clamped / 100, this.config.LOG_AUDIO_EXPONENT);
  }

  init(): void {
    if (!this.ctx) {
      const ctx = this.createContext?.() ?? null;
      if (ctx) {
        this.ctx = ctx;
        this.masterGain = ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 1.0, ctx.currentTime);
        this.masterGain.connect(ctx.destination);
        this.sfxGain = ctx.createGain();
        this.sfxGain.gain.setValueAtTime(this.sfxVolume, ctx.currentTime);
        this.sfxGain.connect(this.masterGain);
        this.ambientGain = ctx.createGain();
        this.ambientGain.gain.setValueAtTime(this.ambientVolume, ctx.currentTime);
        this.ambientGain.connect(this.masterGain);
        this.startActiveSoundscape();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
  }

  stopAllAmbient(): void {
    if (this.railsTimer !== null) this.timers.clearInterval?.(this.railsTimer);
    if (this.telemetryTimer !== null) this.timers.clearTimeout?.(this.telemetryTimer);
    this.railsTimer = null;
    this.telemetryTimer = null;
  }

  startActiveSoundscape(): void {
    if (!this.ctx || !this.ambientGain) return;
    this.stopAllAmbient();
    const phase = this.getPhase?.() ?? null;
    const terminal = phase
      ? (this.isTerminalPhase?.(phase) ?? (phase === "DEAD" || phase === "STRANDED"))
      : false;
    if (terminal || this.ambientMode === "none") {
      return;
    }
    switch (this.ambientMode) {
      case "rails":
        this.startRailsEngine();
        break;
      case "telemetry":
        this.startTelemetryEngine();
        break;
    }
  }

  setAmbientMode(mode: AmbientMode): void {
    this.ambientMode = mode;
    this.onPrefsChanged?.(this.prefsSnapshot());
    if (this.ctx) this.startActiveSoundscape();
  }

  setAmbientVolume(sliderVal: number): void {
    this.ambientSliderVal = sliderVal;
    this.ambientVolume = this.sliderToGain(sliderVal);
    this.onPrefsChanged?.(this.prefsSnapshot());
    if (this.ambientGain && this.ctx) {
      this.ambientGain.gain.setTargetAtTime(this.ambientVolume, this.ctx.currentTime, 0.05);
    }
  }

  setSfxVolume(sliderVal: number): void {
    this.sfxSliderVal = sliderVal;
    this.sfxVolume = this.sliderToGain(sliderVal);
    this.onPrefsChanged?.(this.prefsSnapshot());
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.05);
    }
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    this.onPrefsChanged?.(this.prefsSnapshot());
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 1, this.ctx.currentTime, 0.05);
    }
    return this.isMuted;
  }

  startRailsEngine(): void {
    this.railsStep = 0;
    const setIntervalFn = this.timers.setInterval;
    if (!setIntervalFn) return;
    const interval = 195;
    this.railsTimer = setIntervalFn(() => {
      if (!this.ctx) return;
      if (this.railsStep === 0) this.playRailClick(true);
      else if (this.railsStep === 1) this.playRailClick(false);
      else if (this.railsStep === 2) this.playRailClick(true);
      this.railsStep = (this.railsStep + 1) % 4;
    }, interval);
  }

  playRailClick(isAccent: boolean): void {
    if (!this.ctx || !this.ambientGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = isAccent ? "triangle" : "sine";
    osc.frequency.setValueAtTime(isAccent ? 140 : 95, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.025);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(isAccent ? 850 : 420, now);
    gain.gain.setValueAtTime(isAccent ? 0.055 : 0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambientGain);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  startTelemetryEngine(): void {
    const setTimeoutFn = this.timers.setTimeout;
    if (!setTimeoutFn) return;
    const scheduleNext = (): void => {
      const delay = 140 + this.random() * 680;
      this.telemetryTimer = setTimeoutFn(() => {
        this.playTelemetryBlip();
        scheduleNext();
      }, delay);
    };
    scheduleNext();
  }

  playTelemetryBlip(): void {
    if (!this.ctx || !this.ambientGain) return;
    const now = this.ctx.currentTime;
    const isPing = this.random() < 0.22;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    if (isPing) {
      osc.type = "sine";
      osc.frequency.setValueAtTime(1750 + this.random() * 950, now);
      gain.gain.setValueAtTime(0.016, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
      osc.start(now);
      osc.stop(now + 0.04);
    } else {
      osc.type = "square";
      osc.frequency.setValueAtTime(45, now);
      gain.gain.setValueAtTime(0.014, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.004);
      osc.start(now);
      osc.stop(now + 0.006);
    }
    osc.connect(gain);
    gain.connect(this.ambientGain);
  }

  updateAmbientTheme(adjective: string): void {
    this.currentThemeKey = adjective;
  }

  duckAmbientForJump(durationSec: number): void {
    if (!this.ctx || !this.ambientGain) return;
    const now = this.ctx.currentTime;
    this.ambientGain.gain.setValueAtTime(this.ambientGain.gain.value, now);
    this.ambientGain.gain.linearRampToValueAtTime(0.02, now + durationSec * 0.4);
    this.ambientGain.gain.linearRampToValueAtTime(this.ambientVolume, now + durationSec);
  }

  silenceOnDeath(): void {
    this.stopAllAmbient();
    if (!this.ctx || !this.ambientGain) return;
    const now = this.ctx.currentTime;
    this.ambientGain.gain.linearRampToValueAtTime(0.0001, now + 1.5);
  }

  playJumpCharge(breachSec: number): void {
    if (!this.ctx) return;
    const sfx = this.sfxGain;
    if (!sfx) return;
    this.duckAmbientForJump(breachSec + 0.6);
    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = "sawtooth";
    osc1.frequency.setValueAtTime(this.config.chargeRumbleStartFreq, now);
    osc1.frequency.exponentialRampToValueAtTime(this.config.chargeRumbleEndFreq, now + breachSec);
    gain1.gain.setValueAtTime(0.01, now);
    gain1.gain.linearRampToValueAtTime(0.2, now + breachSec * 0.9);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + breachSec + 0.04);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(this.config.chargeBandpassStartFreq, now);
    filter.frequency.exponentialRampToValueAtTime(this.config.chargeBandpassEndFreq, now + breachSec);
    filter.Q.setValueAtTime(this.config.chargeBandpassQ, now);
    osc1.connect(filter);
    filter.connect(gain1);
    gain1.connect(sfx);
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(this.config.chargeWhistleStartFreq, now);
    osc2.frequency.exponentialRampToValueAtTime(this.config.chargeWhistleEndFreq, now + breachSec);
    gain2.gain.setValueAtTime(0.01, now);
    gain2.gain.linearRampToValueAtTime(0.14, now + breachSec * 0.9);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + breachSec + 0.04);
    osc2.connect(gain2);
    gain2.connect(sfx);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + breachSec + 0.05);
    osc2.stop(now + breachSec + 0.05);
  }

  playArrivalChime(): void {
    if (!this.ctx) return;
    const sfx = this.sfxGain;
    if (!sfx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(this.config.chimeNoteStart, now);
    osc.frequency.exponentialRampToValueAtTime(this.config.chimeNoteEnd, now + 0.08);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc.connect(gain);
    gain.connect(sfx);
    osc.start(now);
    osc.stop(now + 0.55);
  }

  playDialogueChime(): void {
    if (!this.ctx) return;
    const sfx = this.sfxGain;
    if (!sfx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(this.config.dialogueChimeFreq, now);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(sfx);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  playActionSuccess(): void {
    if (!this.ctx || this.isMuted) return;
    const sfx = this.sfxGain;
    if (!sfx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.06);
      osc.frequency.setValueAtTime(783.99, now + 0.12);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(sfx);
      osc.start(now);
      osc.stop(now + 0.3);
    } catch {
      // Ignore audio device errors; gameplay continues silently.
    }
  }

  playActionDamage(): void {
    if (!this.ctx || this.isMuted) return;
    const sfx = this.sfxGain;
    if (!sfx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.2);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(sfx);
      osc.start(now);
      osc.stop(now + 0.24);
    } catch {
      // Ignore audio device errors; gameplay continues silently.
    }
  }
}

export function createSoundFX(deps: AudioDeps): SoundFXService {
  return new SoundFXService(deps);
}
