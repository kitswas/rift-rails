export type ArtworkKind = "pixel" | "vector";

export interface ArtRenderSize {
  width: number;
  height: number;
}

interface ArtResultMessage {
  type?: string;
  reqId?: number;
  src?: string;
  error?: string;
}

interface PendingEntry {
  resolve: (src: string) => void;
  reject: (error: Error) => void;
}

export interface ArtBridgeHandle {
  ready: Promise<void>;
  postMessage: (message: unknown) => void;
  subscribeMessage: (handler: (event: MessageEvent) => void) => void;
}

export interface ArtDeps {
  createBridge: () => ArtBridgeHandle | null;
  kind?: ArtworkKind;
  setTimeoutFn?: (cb: () => void, ms: number) => number;
  clearTimeoutFn?: (id: number) => void;
  timeoutMs?: number;
}

const ARTWORK_MODES = {
  pixel: {
    requestType: "RENDER_PIXEL_DIORAMA",
    responseType: "DIORAMA_PIXEL_RESULT",
    alt: "Dithered dimension diorama",
    className: "art-pixel",
  },
  vector: {
    requestType: "RENDER_VECTOR_DIORAMA",
    responseType: "DIORAMA_VECTOR_RESULT",
    alt: "Vector dimension diorama",
    className: "art-vector",
  },
} as const;

function normalizeSize(size?: ArtRenderSize): ArtRenderSize | undefined {
  if (!size) return undefined;
  const width = Math.round(size.width);
  const height = Math.round(size.height);
  return Number.isFinite(width) && Number.isFinite(height) && width >= 1 && height >= 1
    ? { width, height }
    : undefined;
}

export class DioramaPipelineService {
  bridge: ArtBridgeHandle | null = null;
  ready: Promise<void> | null = null;
  cache = new Map<string, string>();
  pending = new Map<string, Promise<string>>();
  processing = new Map<number, PendingEntry>();
  requestId = 0;
  private readonly createBridge: () => ArtBridgeHandle | null;
  private readonly mode: (typeof ARTWORK_MODES)[ArtworkKind];
  private readonly setTimeoutFn: ((cb: () => void, ms: number) => number) | undefined;
  private readonly clearTimeoutFn: ((id: number) => void) | undefined;
  private readonly timeoutMs: number;

  constructor(deps: ArtDeps) {
    this.createBridge = deps.createBridge;
    this.mode = ARTWORK_MODES[deps.kind ?? "pixel"];
    this.setTimeoutFn = deps.setTimeoutFn;
    this.clearTimeoutFn = deps.clearTimeoutFn;
    this.timeoutMs = deps.timeoutMs ?? 8000;
  }

  init(): void {
    if (this.bridge) return;
    const bridge = this.createBridge();
    if (!bridge) return;
    this.bridge = bridge;
    this.ready = bridge.ready;
    bridge.subscribeMessage((e) => this.onMessage(e));
  }

  onMessage(event: MessageEvent): void {
    const data = event.data as ArtResultMessage | null;
    if (!data || !data.reqId) return;
    const entry = this.processing.get(data.reqId);
    if (!entry) return;
    this.processing.delete(data.reqId);
    if (data.type === this.mode.responseType && data.src) {
      entry.resolve(data.src);
    } else {
      entry.reject(new Error(data.error || "Artwork rendering failed."));
    }
  }

  render(dimName: string, callback?: (markup: string) => void, size?: ArtRenderSize): string {
    if (!dimName) return "";
    const normalizedSize = normalizeSize(size);
    const key = normalizedSize ? JSON.stringify([dimName, normalizedSize.width, normalizedSize.height]) : dimName;
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    this.init();
    if (!this.pending.has(key)) {
      const started = this.ready
        ?.then(
          () =>
            new Promise<string>((resolve, reject) => {
              const reqId = ++this.requestId;
              let timeoutId = 0;
              if (this.setTimeoutFn) {
                timeoutId = this.setTimeoutFn(() => {
                  this.processing.delete(reqId);
                  reject(new Error("Artwork bridge timed out."));
                }, this.timeoutMs);
              }
              this.processing.set(reqId, {
                resolve: (src) => {
                  this.clearTimeoutFn?.(timeoutId);
                  resolve(src);
                },
                reject: (error) => {
                  this.clearTimeoutFn?.(timeoutId);
                  reject(error);
                },
              });
              try {
                this.bridge?.postMessage({
                  type: this.mode.requestType,
                  dimName,
                  reqId,
                  ...normalizedSize,
                });
              } catch (error) {
                this.clearTimeoutFn?.(timeoutId);
                this.processing.delete(reqId);
                reject(error as Error);
              }
            }),
        )
        .then((src) => {
          // Bridge responses must be base64 data URIs; anything else (or any quote break-out) never reaches innerHTML.
          const safeSrc =
            typeof src === "string" &&
            /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/i.test(src)
              ? src
              : "";
          const markup = safeSrc
            ? `<img class="${this.mode.className}" src="${safeSrc}" alt="${this.mode.alt}" />`
            : "";
          this.cache.set(key, markup);
          return markup;
        })
        .finally(() => {
          this.pending.delete(key);
        });
      this.pending.set(key, started ?? Promise.resolve(""));
    }
    this.pending
      .get(key)
      ?.then((markup) => {
        callback?.(markup);
      })
      .catch((error: unknown) => console.error("Diorama rendering failed:", error));
    return "";
  }
}

export function createDioramaPipeline(deps: ArtDeps): DioramaPipelineService {
  return new DioramaPipelineService(deps);
}
