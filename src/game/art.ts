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
  setTimeoutFn?: (cb: () => void, ms: number) => number;
  clearTimeoutFn?: (id: number) => void;
  timeoutMs?: number;
}

export class DioramaPipelineService {
  bridge: ArtBridgeHandle | null = null;
  ready: Promise<void> | null = null;
  cache = new Map<string, string>();
  pending = new Map<string, Promise<string>>();
  processing = new Map<number, PendingEntry>();
  requestId = 0;
  private readonly createBridge: () => ArtBridgeHandle | null;
  private readonly setTimeoutFn: ((cb: () => void, ms: number) => number) | undefined;
  private readonly clearTimeoutFn: ((id: number) => void) | undefined;
  private readonly timeoutMs: number;

  constructor(deps: ArtDeps) {
    this.createBridge = deps.createBridge;
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
    if (data.type === "DIORAMA_PIXEL_RESULT" && data.src) {
      entry.resolve(data.src);
    } else {
      entry.reject(new Error(data.error || "Artwork rendering failed."));
    }
  }

  render(dimName: string, callback?: (markup: string) => void): string {
    if (!dimName) return "";
    const cached = this.cache.get(dimName);
    if (cached !== undefined) {
      return cached;
    }
    this.init();
    if (!this.pending.has(dimName)) {
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
                this.bridge?.postMessage({ type: "RENDER_PIXEL_DIORAMA", dimName, reqId });
              } catch (error) {
                this.clearTimeoutFn?.(timeoutId);
                this.processing.delete(reqId);
                reject(error as Error);
              }
            }),
        )
        .then((src) => {
          const markup = `<img src="${src}" alt="Dithered dimension diorama" />`;
          this.cache.set(dimName, markup);
          return markup;
        })
        .finally(() => {
          this.pending.delete(dimName);
        });
      this.pending.set(dimName, started ?? Promise.resolve(""));
    }
    this.pending
      .get(dimName)
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
