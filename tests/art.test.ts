import { describe, expect, it } from "vitest";
import { DioramaPipelineService } from "../src/game/art";
import type { ArtBridgeHandle, ArtRenderSize, ArtworkKind } from "../src/game/art";

async function renderWithBridge(kind: ArtworkKind, src: string, size?: ArtRenderSize) {
  let handler: (event: MessageEvent) => void = () => {
    throw new Error("Bridge handler was not registered.");
  };
  const sent: unknown[] = [];
  const bridge: ArtBridgeHandle = {
    ready: Promise.resolve(),
    postMessage: (message) => sent.push(message),
    subscribeMessage: (messageHandler) => {
      handler = messageHandler;
    },
  };
  const art = new DioramaPipelineService({ kind, createBridge: () => bridge });
  const markup = new Promise<string>((resolve) => art.render("Fractured Vale", resolve, size));
  await Promise.resolve();
  await Promise.resolve();
  const request = sent[0] as { reqId?: number };
  handler({
    data: {
      type: kind === "vector" ? "DIORAMA_VECTOR_RESULT" : "DIORAMA_PIXEL_RESULT",
      reqId: request.reqId,
      src,
    },
  } as MessageEvent);
  return { sent, markup: await markup };
}

describe("DioramaPipelineService", () => {
  it("requests vector artwork and tags the vector image", async () => {
    const result = await renderWithBridge("vector", "data:image/svg+xml;base64,PHN2Zy8+");
    expect(result.sent).toEqual([
      { type: "RENDER_VECTOR_DIORAMA", dimName: "Fractured Vale", reqId: 1 },
    ]);
    expect(result.markup).toContain('class="art-vector"');
  });

  it("requests pixel artwork at the requested viewport size", async () => {
    const result = await renderWithBridge("pixel", "data:image/png;base64,iVBORw0KGgo=", {
      width: 1280,
      height: 720,
    });
    expect(result.sent).toEqual([
      {
        type: "RENDER_PIXEL_DIORAMA",
        dimName: "Fractured Vale",
        reqId: 1,
        width: 1280,
        height: 720,
      },
    ]);
  });

  it("caps pixel artwork dimensions at 2048", async () => {
    const result = await renderWithBridge("pixel", "data:image/png;base64,iVBORw0KGgo=", {
      width: 4096,
      height: 8192,
    });
    expect(result.sent).toEqual([
      {
        type: "RENDER_PIXEL_DIORAMA",
        dimName: "Fractured Vale",
        reqId: 1,
        width: 2048,
        height: 2048,
      },
    ]);
  });

  it("requests pixel artwork and tags the dithered image", async () => {
    const result = await renderWithBridge("pixel", "data:image/png;base64,iVBORw0KGgo=");
    expect(result.sent).toEqual([
      { type: "RENDER_PIXEL_DIORAMA", dimName: "Fractured Vale", reqId: 1 },
    ]);
    expect(result.markup).toContain('class="art-pixel"');
  });

  it("routes shared-bridge responses only to the matching artwork mode", async () => {
    const handlers: Array<(event: MessageEvent) => void> = [];
    const sent: unknown[] = [];
    const bridge: ArtBridgeHandle = {
      ready: Promise.resolve(),
      postMessage: (message) => sent.push(message),
      subscribeMessage: (handler) => handlers.push(handler),
    };
    const pixel = new DioramaPipelineService({ kind: "pixel", createBridge: () => bridge });
    const vector = new DioramaPipelineService({ kind: "vector", createBridge: () => bridge });

    pixel.render("Fractured Vale");
    vector.render("Fractured Vale");
    const pixelMarkup = pixel.pending.get("Fractured Vale")!;
    const vectorMarkup = vector.pending.get("Fractured Vale")!;
    await Promise.resolve();
    await Promise.resolve();

    expect(sent).toEqual([
      { type: "RENDER_PIXEL_DIORAMA", dimName: "Fractured Vale", reqId: 1 },
      { type: "RENDER_VECTOR_DIORAMA", dimName: "Fractured Vale", reqId: 1 },
    ]);

    const deliver = (type: string, src: string) => {
      const event = { data: { type, reqId: 1, src } } as MessageEvent;
      handlers.forEach((handler) => handler(event));
    };
    deliver("DIORAMA_VECTOR_RESULT", "data:image/svg+xml;base64,PHN2Zy8+");
    await expect(vectorMarkup).resolves.toContain('class="art-vector"');
    expect(pixel.processing.has(1)).toBe(true);

    deliver("DIORAMA_PIXEL_RESULT", "data:image/png;base64,iVBORw0KGgo=");
    await expect(pixelMarkup).resolves.toContain('class="art-pixel"');
  });
});
