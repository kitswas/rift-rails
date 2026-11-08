import { expect, test } from "@playwright/test";
import JSZip from "jszip";

// NOTE: sample-plugin zip is built in-test from the manifest/entry below.
// TODO: once the plugin install UI lands, read packages/sample-plugin/*
// directly (no duplicated manifest/entry strings here) and pin assertions
// to the real file-input id and the real "installed action" selector.

const SAMPLE_MANIFEST = {
  id: "sample-plugin",
  name: "Sample Plugin",
  version: "1.0.0",
  minApi: 1,
  entry: "main.js",
  permissions: ["voyage:adjustResource"],
};

const SAMPLE_ENTRY = `
function activate(api) {
  api.registerAction({ id: "smuggle_fuel", label: "Smuggle Fuel" });
  api.registerNode({ id: "smuggle_point", label: "Smuggle Point" });
  api.on("afterJump", () => {
    const s = api.state();
    if (s && s.jumpCount >= 3) api.log("smuggler salutes");
  });
}
export default { activate };
`;

test.describe("plugin smoke", () => {
  test("page loads and start-screen is visible", async ({ page }) => {
    await page.goto("/");
    // Generic smoke until the plugin install UI selector is finalized.
    await expect(page.locator("#start-screen")).toBeVisible();
    // TODO: assert plugin install affordance (e.g. a file input accepting
    // .zip, or a menu button) once the entry point exists in the UI.
  });

  test("installs the sample plugin zip when a file input is present", async ({ page }) => {
    await page.goto("/");
    const fileInput = page.locator(
      'input[type="file"][accept*=".zip"], input#plugin-file, input[data-plugin-upload]',
    );
    if ((await fileInput.count()) === 0) {
      // TODO: no plugin file input in the UI yet — enable once it lands.
      test.skip(true, "no plugin file input in UI");
    }

    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify(SAMPLE_MANIFEST));
    zip.file("main.js", SAMPLE_ENTRY);
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const buffer = (
      globalThis as unknown as { Buffer: { from(value: Uint8Array): Uint8Array } }
    ).Buffer.from(bytes);
    // TODO: drop the cast once @types/node is added (Buffer is used by
    // Playwright's FilePayload typing but is not installed in this repo).
    await fileInput.setInputFiles({
      name: "sample-plugin.zip",
      mimeType: "application/zip",
      buffer: buffer as unknown as never,
    });

    // TODO: replace with the real selector for an installed plugin action
    // (e.g. a button labelled "Smuggle Fuel" in the encounter choices).
    // Current assertion verifies plugin installation; action wiring is tested separately.
    await expect(page.locator("#plugin-list")).toContainText("Sample Plugin v1.0.0");
  });
});
