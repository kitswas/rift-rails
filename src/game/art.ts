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

export const DioramaPipeline = {
  bridgeIframe: null as HTMLIFrameElement | null,
  ready: null as Promise<void> | null,
  cache: new Map<string, string>(),
  pending: new Map<string, Promise<string>>(),
  processing: new Map<number, PendingEntry>(),
  requestId: 0,

  init(): void {
    if (DioramaPipeline.bridgeIframe) return;
    const iframe = document.createElement("iframe");
    iframe.id = "art-bridge";
    iframe.src = "artwork-browser.html?bridge=1";
    iframe.style.display = "none";
    DioramaPipeline.ready = new Promise<void>((resolve) => {
      iframe.addEventListener("load", () => resolve(), { once: true });
    });
    DioramaPipeline.bridgeIframe = iframe;
    window.addEventListener("message", DioramaPipeline.onMessage);
    document.body.appendChild(iframe);
  },

  onMessage(this: void, event: MessageEvent): void {
    if (
      !DioramaPipeline.bridgeIframe ||
      event.source !== DioramaPipeline.bridgeIframe.contentWindow
    ) {
      return;
    }
    const data = event.data as ArtResultMessage | null;
    if (!data || !data.reqId) return;
    const entry = DioramaPipeline.processing.get(data.reqId);
    if (!entry) return;
    DioramaPipeline.processing.delete(data.reqId);

    if (data.type === "DIORAMA_PIXEL_RESULT" && data.src) {
      entry.resolve(data.src);
    } else {
      entry.reject(new Error(data.error || "Artwork rendering failed."));
    }
  },

  render(dimName: string, callback?: (markup: string) => void): string {
    if (!dimName) return "";
    const cached = DioramaPipeline.cache.get(dimName);
    if (cached !== undefined) {
      return cached;
    }
    DioramaPipeline.init();
    if (!DioramaPipeline.pending.has(dimName)) {
      const pending = DioramaPipeline.ready
        ?.then(
          () =>
            new Promise<string>((resolve, reject) => {
              const reqId = ++DioramaPipeline.requestId;
              const timeout = setTimeout(() => {
                DioramaPipeline.processing.delete(reqId);
                reject(new Error("Artwork bridge timed out."));
              }, 8000);
              DioramaPipeline.processing.set(reqId, {
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
                DioramaPipeline.bridgeIframe?.contentWindow?.postMessage(
                  { type: "RENDER_PIXEL_DIORAMA", dimName, reqId },
                  "*",
                );
              } catch (error) {
                clearTimeout(timeout);
                DioramaPipeline.processing.delete(reqId);
                reject(error as Error);
              }
            }),
        )
        .then((src) => {
          const markup = `<img src="${src}" alt="Dithered dimension diorama" />`;
          DioramaPipeline.cache.set(dimName, markup);
          return markup;
        })
        .finally(() => DioramaPipeline.pending.delete(dimName));
      DioramaPipeline.pending.set(dimName, pending ?? Promise.resolve(""));
    }
    DioramaPipeline.pending
      .get(dimName)
      ?.then((markup) => {
        if (callback) callback(markup);
      })
      .catch((error: unknown) => console.error("Diorama rendering failed:", error));
    return "";
  },
};
