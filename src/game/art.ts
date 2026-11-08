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

export class DioramaPipelineService {
  bridgeIframe: HTMLIFrameElement | null = null;
  ready: Promise<void> | null = null;
  cache = new Map<string, string>();
  pending = new Map<string, Promise<string>>();
  processing = new Map<number, PendingEntry>();
  requestId = 0;

  init(): void {
    if (this.bridgeIframe) return;
    const iframe = document.createElement("iframe");
    iframe.id = "art-bridge";
    iframe.src = "artwork-browser.html?bridge=1";
    iframe.style.display = "none";
    this.ready = new Promise<void>((resolve) => {
      iframe.addEventListener("load", () => resolve(), { once: true });
    });
    this.bridgeIframe = iframe;
    window.addEventListener("message", (e) => this.onMessage(e));
    document.body.appendChild(iframe);
  }

  onMessage(event: MessageEvent): void {
    if (!this.bridgeIframe || event.source !== this.bridgeIframe.contentWindow) {
      return;
    }
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
      const pending = this.ready
        ?.then(
          () =>
            new Promise<string>((resolve, reject) => {
              const reqId = ++this.requestId;
              const timeout = setTimeout(() => {
                this.processing.delete(reqId);
                reject(new Error("Artwork bridge timed out."));
              }, 8000);
              this.processing.set(reqId, {
                resolve: (src) => {
                  clearTimeout(timeout);
                  resolve(src);
                },
                reject: (error) => {
                  clearTimeout(timeout);
                  reject(error);
                },
              });
              try {
                this.bridgeIframe?.contentWindow?.postMessage(
                  { type: "RENDER_PIXEL_DIORAMA", dimName, reqId },
                  "*",
                );
              } catch (error) {
                clearTimeout(timeout);
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
        .finally(() => this.pending.delete(dimName));
      this.pending.set(dimName, pending ?? Promise.resolve(""));
    }
    this.pending
      .get(dimName)
      ?.then((markup) => {
        if (callback) callback(markup);
      })
      .catch((error: unknown) => console.error("Diorama rendering failed:", error));
    return "";
  }
}

export const DioramaPipeline = new DioramaPipelineService();
