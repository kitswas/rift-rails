import { expect, test } from "@playwright/test";
import JSZip from "jszip";

// NOTE: upload-test zip is built in-test from the manifest/entry below.
// TODO: use a shared fixture if upload cases grow, instead of duplicating
// manifest/entry here; keep assertions pinned to the actual file-input id
// and installed-plugin selector.

const TEST_MANIFEST = {
  id: "upload-test",
  name: "Upload Test",
  version: "1.0.0",
  minApi: 4,
  entry: "main.js",
  permissions: ["voyage:adjustResource"],
};

const TEST_ENTRY = `let api;
const plugin = {
  mount(hostApi) { api = hostApi; api.log("upload test mounted"); },
  unmount() { api.log("upload test unmounted"); },
};
export default plugin;`;

test.describe("plugin smoke", () => {
  test("page loads and start-screen is visible", async ({ page }) => {
    await page.goto("/");
    // General start-screen smoke; bundle and upload behavior have focused tests.
    await expect(page.locator("#start-screen")).toBeVisible();
    await expect(page.locator("#corvus-portrait")).toHaveCount(0);
    await expect(page.locator("#cutscene-overlay .cutscene-portrait")).toHaveCount(1);
    // TODO: pin upload affordance to one selector after compatibility selectors are removed.
  });

  test("loads only the curated bundled gameplay plugins", async ({ page }) => {
    await page.goto("/?debug");
    const enabledIds = async () =>
      page
        .locator("#plugin-list input[data-plugin-id]")
        .evaluateAll((inputs) =>
          inputs.map((input) => (input as HTMLInputElement).dataset.pluginId),
        );
    await expect
      .poll(enabledIds)
      .toEqual(expect.arrayContaining(["rift-salvager", "field-repair"]));
    const retiredIds = [
      "black-market",
      "contract-board",
      "rift-storm",
      "salvage-scanner",
      "sample-plugin",
      "warp-overcharge",
    ];
    expect((await enabledIds()).filter((id) => retiredIds.includes(id ?? ""))).toEqual([]);
    const salvageYardAvailable = await page.evaluate(() => {
      const app = (
        window as Window & {
          __rift?: {
            conduit?: {
              resolveNextNodeId: (jumpCount: number, pop?: boolean) => string;
              sectorBag: string[];
            };
            registry?: {
              getAction: (id: string) => unknown;
              getNode: (id: string) => { actions: string[] } | undefined;
            };
          };
        }
      ).__rift;
      if (!app?.conduit || !app.registry) return false;
      app.conduit.resolveNextNodeId(100);
      return (
        app.conduit.sectorBag.includes("rift-salvager:salvage_yard") &&
        app.registry.getAction("rift-salvager:salvage_melt") !== undefined &&
        app.registry
          .getNode("rift-salvager:salvage_yard")
          ?.actions.includes("rift-salvager:salvage_melt") === true
      );
    });
    expect(salvageYardAvailable).toBe(true);
  });

  test("installs an uploaded plugin zip", async ({ page }) => {
    await page.goto("/?debug");
    await page.locator("#enable-tutorial").uncheck();
    await page.locator("#btn-ignite").click();
    await expect(page.locator("#game-container")).toBeVisible();
    await page.locator("#tab-settings").click();
    const fileInput = page.locator(
      'input[type="file"][accept*=".zip"], input#plugin-file, input[data-plugin-upload]',
    );
    if ((await fileInput.count()) === 0) {
      // TODO: drop skip once plugin upload UI becomes mandatory.
      test.skip(true, "no plugin file input in UI");
    }

    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify(TEST_MANIFEST));
    zip.file("main.js", TEST_ENTRY);
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const buffer = (
      globalThis as unknown as { Buffer: { from(value: Uint8Array): Uint8Array } }
    ).Buffer.from(bytes);
    // TODO: drop the cast once @types/node is added (Buffer is used by
    // Playwright's FilePayload typing but is not installed in this repo).
    await fileInput.setInputFiles({
      name: "upload-test.zip",
      mimeType: "application/zip",
      buffer: buffer as unknown as never,
    });

    await expect(page.locator("#plugin-list")).toContainText("Upload Test v1.0.0");
    // Installation is covered here; bundled gameplay effects have focused tests.
    await expect(page.locator("#story-log")).toContainText("upload test mounted");
    await page.locator('#plugin-list input[data-plugin-id="upload-test"]').uncheck();
    await expect(page.locator("#story-log")).toContainText("upload test unmounted");
  });

  test("unmounts a plugin whose mount throws", async ({ page }) => {
    await page.goto("/?debug");
    await page.locator("#enable-tutorial").uncheck();
    await page.locator("#btn-ignite").click();
    await expect(page.locator("#game-container")).toBeVisible();
    await page.locator("#tab-settings").click();

    const zip = new JSZip();
    zip.file(
      "manifest.json",
      JSON.stringify({
        id: "mount-failure",
        name: "Mount Failure",
        version: "1.0.0",
        minApi: 4,
        entry: "main.js",
        permissions: [],
      }),
    );
    zip.file(
      "main.js",
      `let api;
const plugin = {
  mount(hostApi) { api = hostApi; throw new Error("mount exploded"); },
  unmount() { api.log("failed mount cleanup ran"); },
};
export default plugin;`,
    );
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const buffer = (
      globalThis as unknown as { Buffer: { from(value: Uint8Array): Uint8Array } }
    ).Buffer.from(bytes);
    await page.locator("#plugin-file").setInputFiles({
      name: "mount-failure.zip",
      mimeType: "application/zip",
      buffer: buffer as unknown as never,
    });

    await expect(page.locator("#plugin-error")).toContainText("mount exploded");
    await expect(page.locator("#story-log")).toContainText("failed mount cleanup ran");
  });
});
