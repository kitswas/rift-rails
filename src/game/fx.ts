import type { GameConfig, ProceduralTheme } from "./types";
import type { SoundFXService } from "./audio";

interface Star {
  x: number;
  y: number;
  z: number;
  pz: number;
  angle: number;
  colorShift: number;
}

export interface ThemeLookup {
  getTheme: (id: string) => ProceduralTheme | undefined;
  getDefaultTheme: () => ProceduralTheme;
}

export interface FXDeps {
  config: GameConfig;
  themes: ThemeLookup;
  sound: Pick<SoundFXService, "init" | "playJumpCharge" | "playArrivalChime" | "updateAmbientTheme">;
  setCssVars?: (vars: Record<string, string>) => void;
  vibrate?: (pattern: number[]) => void;
  requestFrame?: (cb: (now: number) => void) => number;
  cancelFrame?: (id: number) => void;
  now?: () => number;
  random?: () => number;
  setTimeoutFn?: (cb: () => void, ms: number) => number;
  getViewportSize?: () => { width: number; height: number };
}

export class TransitionFXService {
  canvas: HTMLCanvasElement | null = null;
  ctx: CanvasRenderingContext2D | null = null;
  animId = 0;
  stars: Star[] = [];
  running = false;
  artGlyph: HTMLElement | null = null;
  gameEl: HTMLElement | null = null;
  bridgeEl: HTMLElement | null = null;
  fxEl: HTMLElement | null = null;

  private readonly config: GameConfig;
  private readonly themes: ThemeLookup;
  private readonly sound: Pick<
    SoundFXService,
    "init" | "playJumpCharge" | "playArrivalChime" | "updateAmbientTheme"
  >;
  private readonly setCssVars: ((vars: Record<string, string>) => void) | undefined;
  private readonly vibrate: ((pattern: number[]) => void) | undefined;
  private readonly requestFrame: ((cb: (now: number) => void) => number) | undefined;
  private readonly cancelFrame: ((id: number) => void) | undefined;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly setTimeoutFn: ((cb: () => void, ms: number) => number) | undefined;
  private readonly getViewportSize: (() => { width: number; height: number }) | undefined;
  private readonly onResize = (): void => this.resize();

  constructor(deps: FXDeps) {
    this.config = deps.config;
    this.themes = deps.themes;
    this.sound = deps.sound;
    this.setCssVars = deps.setCssVars;
    this.vibrate = deps.vibrate;
    this.requestFrame = deps.requestFrame;
    this.cancelFrame = deps.cancelFrame;
    this.now = deps.now ?? (() => performance.now());
    this.random = deps.random ?? Math.random;
    this.setTimeoutFn = deps.setTimeoutFn;
    this.getViewportSize = deps.getViewportSize;
  }

  bindCanvas(el: HTMLCanvasElement | null): void {
    this.canvas = el;
    this.ctx = el?.getContext("2d") ?? null;
    this.fxEl = el;
  }

  bindArtGlyph(el: HTMLElement | null): void {
    this.artGlyph = el;
  }

  bindChrome(gameEl: HTMLElement | null, bridgeEl: HTMLElement | null): void {
    this.gameEl = gameEl;
    this.bridgeEl = bridgeEl;
  }

  init(): void {
    if (!this.canvas) return;
    this.resize();
    window.addEventListener("resize", this.onResize);
    this.initStars();
  }

  resize(): void {
    if (!this.canvas) return;
    const size = this.getViewportSize?.();
    this.canvas.width = size?.width ?? this.canvas.clientWidth;
    this.canvas.height = size?.height ?? this.canvas.clientHeight;
  }

  initStars(): void {
    this.stars = [];
    const w = this.canvas?.width ?? 0;
    const h = this.canvas?.height ?? 0;
    for (let i = 0; i < this.config.FX_STAR_COUNT; i++) {
      this.stars.push({
        x: (this.random() - 0.5) * w * 2,
        y: (this.random() - 0.5) * h * 2,
        z: this.random() * w,
        pz: this.random() * w,
        angle: this.random() * Math.PI * 2,
        colorShift: this.random(),
      });
    }
  }

  applyThemeStyles(adj: string): void {
    const theme: ProceduralTheme = this.themes.getTheme(adj) ?? this.themes.getDefaultTheme();
    this.setCssVars?.({
      "--theme-primary": theme.primary,
      "--theme-secondary": theme.secondary,
      "--theme-glow": `${theme.primary}55`,
      "--bg": theme.bg,
    });
    if (this.artGlyph) {
      this.artGlyph.innerText = theme.glyph;
      this.artGlyph.style.color = theme.primary;
    }
    this.sound.updateAmbientTheme(adj);
  }

  playJumpEffect(
    _targetDimId: string,
    targetDimName: string,
    onBreach: () => void,
    onComplete: () => void,
  ): void {
    this.sound.init();
    this.sound.playJumpCharge(this.config.JUMP_CHARGE_MS / 1000);
    this.vibrate?.(this.config.FX_VIBRATE_PATTERN);
    const gameEl = this.gameEl;
    const bridgeEl = this.bridgeEl;
    const fxEl = this.fxEl;
    gameEl?.classList.add("screen-shake");
    bridgeEl?.classList.add("screen-shake");
    fxEl?.classList.add("active");
    this.running = true;
    const adjective = targetDimName.split(" ")[0] ?? "";
    const theme: ProceduralTheme = this.themes.getTheme(adjective) ?? this.themes.getDefaultTheme();
    const startTime = this.now();

    const renderFrame = (frameNow: number): void => {
      if (!this.running) return;
      const canvas = this.canvas;
      const ctx = this.ctx;
      if (!canvas || !ctx) return;
      const elapsed = frameNow - startTime;
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      ctx.fillStyle = "rgba(7, 9, 14, 0.22)";
      ctx.fillRect(0, 0, w, h);
      if (elapsed < this.config.JUMP_CHARGE_MS) {
        const chargeRatio = elapsed / this.config.JUMP_CHARGE_MS;
        const speed = 10 + Math.pow(chargeRatio, 3) * 85;
        const warpRotation = elapsed * 0.003;
        for (let i = 0; i < this.stars.length; i++) {
          const s = this.stars[i];
          if (!s) continue;
          s.pz = s.z;
          s.z -= speed;
          if (s.z <= 0) {
            s.z = w;
            s.pz = s.z;
            s.x = (this.random() - 0.5) * w * 2;
            s.y = (this.random() - 0.5) * h * 2;
          }
          const k = 280 / s.z;
          const pk = 280 / s.pz;
          const px = s.x * pk + cx;
          const py = s.y * pk + cy;
          const sx = s.x * k + cx;
          const sy = s.y * k + cy;
          const alpha = Math.min(1, (1 - s.z / w) * 1.5);
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(sx, sy);
          ctx.strokeStyle = s.colorShift > 0.5 ? theme.primary : theme.secondary;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = Math.max(1, (1 - s.z / w) * 4);
          ctx.stroke();
        }
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(warpRotation);
        const radius = (Math.sin(elapsed * 0.01) + 1.2) * 50 + chargeRatio * 130;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.strokeStyle = theme.primary;
        ctx.lineWidth = 3 + Math.sin(elapsed * 0.02) * 2;
        ctx.shadowColor = theme.secondary;
        ctx.shadowBlur = 18;
        ctx.stroke();
        ctx.restore();
      } else {
        const postProgress =
          (elapsed - this.config.JUMP_CHARGE_MS) /
          (this.config.JUMP_TOTAL_MS - this.config.JUMP_CHARGE_MS);
        const fadeAlpha = Math.max(0, 1 - postProgress * 2.5);
        for (let i = 0; i < this.stars.length; i++) {
          const s = this.stars[i];
          if (!s) continue;
          s.pz = s.z;
          s.z -= 10;
          if (s.z <= 0) s.z = w;
          const k = 280 / s.z;
          const sx = s.x * k + cx;
          const sy = s.y * k + cy;
          ctx.beginPath();
          ctx.arc(sx, sy, Math.max(0.8, (1 - s.z / w) * 2), 0, Math.PI * 2);
          ctx.fillStyle = s.colorShift > 0.5 ? theme.primary : theme.secondary;
          ctx.globalAlpha = fadeAlpha;
          ctx.fill();
        }
      }
      if (elapsed < this.config.JUMP_TOTAL_MS && this.requestFrame) {
        this.animId = this.requestFrame(renderFrame);
      }
    };

    if (this.requestFrame) {
      this.animId = this.requestFrame(renderFrame);
    }
    const schedule = (cb: () => void, ms: number): void => {
      if (this.setTimeoutFn) this.setTimeoutFn(cb, ms);
      else cb();
    };
    schedule(() => {
      onBreach();
      this.applyThemeStyles(adjective);
      gameEl?.classList.remove("screen-shake");
      bridgeEl?.classList.remove("screen-shake");
      gameEl?.classList.add("chromatic-flash");
      bridgeEl?.classList.add("chromatic-flash");
      this.sound.playArrivalChime();
    }, this.config.JUMP_CHARGE_MS);
    schedule(() => {
      this.running = false;
      this.cancelFrame?.(this.animId);
      fxEl?.classList.remove("active");
      gameEl?.classList.remove("chromatic-flash");
      bridgeEl?.classList.remove("chromatic-flash");
      onComplete();
    }, this.config.JUMP_TOTAL_MS);
  }
}

export function createTransitionFX(deps: FXDeps): TransitionFXService {
  return new TransitionFXService(deps);
}
