// @ts-nocheck -- legacy module extracted verbatim; remove per-module as types land.
// Extracted verbatim from index.html during TS migration.
export const DioramaPipeline: any = {
  bridgeIframe: null,
  ready: null,
  cache: new Map(),
  pending: new Map(),
  processing: new Map(),
  requestId: 0,

  init: () => {
    if (DioramaPipeline.bridgeIframe) return;
    const iframe = document.createElement("iframe");
    iframe.id = "art-bridge";
    iframe.src = "artwork-browser.html?bridge=1";
    iframe.style.display = "none";
    DioramaPipeline.ready = new Promise((resolve) => {
      iframe.addEventListener("load", resolve, { once: true });
    });
    DioramaPipeline.bridgeIframe = iframe;
    window.addEventListener("message", DioramaPipeline.onMessage);
    document.body.appendChild(iframe);
  },

  onMessage: (event) => {
    if (
      !DioramaPipeline.bridgeIframe ||
      event.source !== DioramaPipeline.bridgeIframe.contentWindow
    ) {
      return;
    }
    const data = event.data;
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

  render: (dimName, callback) => {
    if (!dimName) return "";
    if (DioramaPipeline.cache.has(dimName)) {
      return DioramaPipeline.cache.get(dimName);
    }
    DioramaPipeline.init();
    if (!DioramaPipeline.pending.has(dimName)) {
      const pending = DioramaPipeline.ready
        .then(
          () =>
            new Promise((resolve, reject) => {
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
                DioramaPipeline.bridgeIframe.contentWindow.postMessage(
                  { type: "RENDER_PIXEL_DIORAMA", dimName, reqId },
                  "*",
                );
              } catch (error) {
                clearTimeout(timeout);
                DioramaPipeline.processing.delete(reqId);
                reject(error);
              }
            }),
        )
        .then((src) => {
          const markup = `<img src="${src}" alt="Dithered dimension diorama" />`;
          DioramaPipeline.cache.set(dimName, markup);
          return markup;
        })
        .finally(() => DioramaPipeline.pending.delete(dimName));
      DioramaPipeline.pending.set(dimName, pending);
    }
    DioramaPipeline.pending
      .get(dimName)
      .then((markup) => {
        if (callback) callback(markup);
      })
      .catch((error) => console.error("Diorama rendering failed:", error));
    return "";
  },
};
/* ========================================================
  CONDUIT DECK (PROCEDURAL RUNWAY & SECTOR PACING)
  ======================================================== */
