// @vitest-environment jsdom
import { describe, expect, it } from "vite-plus/test";
import { createDesktopTaskProjectIcon } from "./desktopTaskProjectIcon";

function readSvg(url: string) {
  const bytes = Uint8Array.from(atob(url.split(",")[1]!), (character) => character.charCodeAt(0));
  return new DOMParser().parseFromString(new TextDecoder().decode(bytes), "image/svg+xml");
}

describe("desktop project icons", () => {
  it("preserves Unicode monograms and emoji in self-contained images", async () => {
    const monogram = readSvg(
      await createDesktopTaskProjectIcon({ kind: "monogram", text: "क्ष्म", color: "violet" }),
    );
    expect(monogram.querySelector("text")?.textContent).toBe("क्ष्म");
    expect(monogram.querySelector("parsererror")).toBeNull();
    const emoji = readSvg(await createDesktopTaskProjectIcon({ kind: "emoji", emoji: "👩🏽‍💻" }));
    expect(emoji.querySelector("text")?.textContent).toBe("👩🏽‍💻");
  });
  it("resolves saved Lucide icons and falls back for an unknown icon name", async () => {
    for (const name of ["alarm-clock", "missing-custom-icon"]) {
      const svg = readSvg(
        await createDesktopTaskProjectIcon({ kind: "lucide", name, color: "blue" }),
      );
      expect(svg.querySelector("path")).not.toBeNull();
      expect(svg.querySelector("parsererror")).toBeNull();
    }
  });
});
