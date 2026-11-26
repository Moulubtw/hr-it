import { describe, expect, it } from "vitest";
import { pickDefaultModels } from "./settings";

describe("pickDefaultModels", () => {
  it("prefers Gemini 4 Hydrogen and adds a Flash and a Flash-Lite fallback", () => {
    const r = pickDefaultModels([
      "gemini-2.5-pro",
      "gemini-4-hydrogen",
      "gemini-3-flash",
      "gemini-2.5-flash",
      "gemini-3-flash-lite",
      "text-embedding-004",
      "gemini-2.5-flash-preview-tts",
    ]);
    expect(r).toEqual({ primary: "gemini-4-hydrogen", fallbacks: ["gemini-3-flash", "gemini-3-flash-lite"] });
  });

  it("falls back to the newest Pro model when Hydrogen is not available", () => {
    const r = pickDefaultModels(["gemini-2.5-pro", "gemini-3-pro", "gemini-2.5-flash"]);
    expect(r.primary).toBe("gemini-3-pro");
    expect(r.fallbacks).toEqual(["gemini-2.5-flash"]);
  });

  it("copes with a key that only has flash models", () => {
    const r = pickDefaultModels(["gemini-2.5-flash-lite", "gemini-2.5-flash"]);
    expect(r).toEqual({ primary: "gemini-2.5-flash", fallbacks: ["gemini-2.5-flash-lite"] });
  });
});
