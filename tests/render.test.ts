import { beforeEach, describe, expect, it } from "vitest";
import { appendLog } from "../src/ui/render";

describe("appendLog", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="story-log"></div>';
  });

  it("formats encounter titles without interpreting untrusted HTML", () => {
    appendLog('<b>Market:</b> <img src=x onerror="alert(1)">');
    const log = document.getElementById("story-log");
    expect(log?.querySelector("b")?.textContent).toBe("Market:");
    expect(log?.querySelector("img")).toBeNull();
    expect(log?.textContent).toBe('Market: <img src=x onerror="alert(1)">');
  });
});
