import { GAME_DATA } from "./data";
import { SaveSystem } from "./save";
import { VoyageSession } from "./session";
import type { AmbientMode } from "./types";

interface WebkitWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
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

  sliderToGain(sliderVal: number): number {
    const clamped = Math.max(0, Math.min(100, sliderVal));
    if (clamped <= 0) return 0;
    return Math.pow(clamped / 100, GAME_DATA.audio.LOG_AUDIO_EXPONENT);
  }

  init(): void {
    if (!this.ctx) {
      const AudioContextCtor = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
      if (AudioContextCtor) {
        this.ctx = new AudioContextCtor();

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 1.0, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
        this.sfxGain.connect(this.masterGain);

        this.ambientGain = this.ctx.createGain();
        this.ambientGain.gain.setValueAtTime(this.ambientVolume, this.ctx.currentTime);
        this.ambientGain.connect(this.masterGain);

        this.startActiveSoundscape();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
  }

  stopAllAmbient(): void {
    if (this.railsTimer !== null) clearInterval(this.railsTimer);
    if (this.telemetryTimer !== null) clearTimeout(this.telemetryTimer);
  }

  startActiveSoundscape(): void {
    if (!this.ctx || !this.ambientGain) return;
    this.stopAllAmbient();

    const phase = VoyageSession.getPhase();
    if (
      phase === GAME_DATA.phases.dead ||
      phase === GAME_DATA.phases.stranded ||
      this.ambientMode === "none"
    ) {
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
    SaveSystem.saveAudioPrefs();
    if (this.ctx) this.startActiveSoundscape();
  }

  setAmbientVolume(sliderVal: number): void {
    this.ambientSliderVal = sliderVal;
    this.ambientVolume = this.sliderToGain(sliderVal);
    SaveSystem.saveAudioPrefs();
    if (this.ambientGain && this.ctx) {
      this.ambientGain.gain.setTargetAtTime(this.ambientVolume, this.ctx.currentTime, 0.05);
    }
  }

  setSfxVolume(sliderVal: number): void {
    this.sfxSliderVal = sliderVal;
    this.sfxVolume = this.sliderToGain(sliderVal);
    SaveSystem.saveAudioPrefs();
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.05);
    }
  }

  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    SaveSystem.saveAudioPrefs();
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 1, this.ctx.currentTime, 0.05);
    }
    return this.isMuted;
  }

  startRailsEngine(): void {
    this.railsStep = 0;
    const interval = 195;

    this.railsTimer = window.setInterval(() => {
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
    const scheduleNext = (): void => {
      const delay = 140 + Math.random() * 680;
      this.telemetryTimer = window.setTimeout(() => {
        this.playTelemetryBlip();
        scheduleNext();
      }, delay);
    };
    scheduleNext();
  }

  playTelemetryBlip(): void {
    if (!this.ctx || !this.ambientGain) return;
    const now = this.ctx.currentTime;
    const isPing = Math.random() < 0.22;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (isPing) {
      osc.type = "sine";
      osc.frequency.setValueAtTime(1750 + Math.random() * 950, now);
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
    this.duckAmbientForJump(breachSec + 0.6);
    const now = this.ctx.currentTime;

    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = "sawtooth";
    osc1.frequency.setValueAtTime(GAME_DATA.audio.chargeRumbleStartFreq, now);
    osc1.frequency.exponentialRampToValueAtTime(
      GAME_DATA.audio.chargeRumbleEndFreq,
      now + breachSec,
    );

    gain1.gain.setValueAtTime(0.01, now);
    gain1.gain.linearRampToValueAtTime(0.2, now + breachSec * 0.9);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + breachSec + 0.04);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(GAME_DATA.audio.chargeBandpassStartFreq, now);
    filter.frequency.exponentialRampToValueAtTime(
      GAME_DATA.audio.chargeBandpassEndFreq,
      now + breachSec,
    );
    filter.Q.setValueAtTime(GAME_DATA.audio.chargeBandpassQ, now);

    osc1.connect(filter);
    filter.connect(gain1);
    gain1.connect(this.sfxGain!);

    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(GAME_DATA.audio.chargeWhistleStartFreq, now);
    osc2.frequency.exponentialRampToValueAtTime(
      GAME_DATA.audio.chargeWhistleEndFreq,
      now + breachSec,
    );

    gain2.gain.setValueAtTime(0.01, now);
    gain2.gain.linearRampToValueAtTime(0.14, now + breachSec * 0.9);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + breachSec + 0.04);

    osc2.connect(gain2);
    gain2.connect(this.sfxGain!);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + breachSec + 0.05);
    osc2.stop(now + breachSec + 0.05);
  }

  playArrivalChime(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(GAME_DATA.audio.chimeNoteStart, now);
    osc.frequency.exponentialRampToValueAtTime(GAME_DATA.audio.chimeNoteEnd, now + 0.08);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(now);
    osc.stop(now + 0.55);
  }

  playDialogueChime(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(GAME_DATA.audio.dialogueChimeFreq, now);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  playActionSuccess(): void {
    if (!this.ctx || this.isMuted) return;
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
      gain.connect(this.sfxGain!);
      osc.start(now);
      osc.stop(now + 0.3);
    } catch {
      // Ignore audio device errors; gameplay continues silently.
    }
  }

  playActionDamage(): void {
    if (!this.ctx || this.isMuted) return;
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
      gain.connect(this.sfxGain!);
      osc.start(now);
      osc.stop(now + 0.24);
    } catch {
      // Ignore audio device errors; gameplay continues silently.
    }
  }
}

export const SoundFX = new SoundFXService();
