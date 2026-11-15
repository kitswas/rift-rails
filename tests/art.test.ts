import { describe, expect, it } from "vitest";
import { DioramaPipelineService } from "../src/game/art";
import type { ArtBridgeHandle, ArtRenderSize, ArtworkKind } from "../src/game/art";

async function renderWithBridge(
  kind: ArtworkKind,
  src: string,
  size?: ArtRenderSize,
) {
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
      { type: "RENDER_PIXEL_DIORAMA", dimName: "Fractured Vale", reqId: 1, width: 1280, height: 720 },
    ]);
  });

  it("requests pixel artwork and tags the dithered image", async () => {
    const result = await renderWithBridge("pixel", "data:image/png;base64,iVBORw0KGgo=");
    expect(result.sent).toEqual([
      { type: "RENDER_PIXEL_DIORAMA", dimName: "Fractured Vale", reqId: 1 },
    ]);
    expect(result.markup).toContain('class="art-pixel"');
  });
});
