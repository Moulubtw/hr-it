import { describe, expect, it } from "vitest";
import { createFieldStreamer, scanPartialObject } from "./partial-json";

describe("scanPartialObject", () => {
  it("reads complete and cut-off string fields, skipping other values", () => {
    const m = scanPartialObject('{"a":"x\\"y","n":4.5,"arr":["q","}"],"o":{"k":"v"},"b":"Прив');
    expect(m.get("a")).toEqual({ value: 'x"y', complete: true });
    expect(m.get("b")).toEqual({ value: "Прив", complete: false });
    expect(m.has("n")).toBe(false);
    expect(m.has("k")).toBe(false);
  });

  it("does not emit half of an escape sequence", () => {
    expect(scanPartialObject('{"a":"x\\').get("a")?.value).toBe("x");
    expect(scanPartialObject('{"a":"x\\u04').get("a")?.value).toBe("x");
    expect(scanPartialObject('{"a":"x\\u0416"').get("a")?.value).toBe("xЖ");
  });
});

describe("createFieldStreamer", () => {
  it("turns arbitrary chunks into per-field deltas that add up to the final values", () => {
    const json = JSON.stringify({
      hrReaction: "И это всё?\nКонкретнее.",
      score: 4,
      feedback: ["a"],
      idealAnswer: "Я бы \"сказал\" так…",
    });
    const s = createFieldStreamer(["hrReaction", "idealAnswer"]);
    const acc: Record<string, string> = {};
    for (let i = 0; i < json.length; i += 3) {
      for (const d of s.push(json.slice(i, i + 3))) acc[d.field] = (acc[d.field] ?? "") + d.delta;
    }
    expect(acc).toEqual({ hrReaction: "И это всё?\nКонкретнее.", idealAnswer: 'Я бы "сказал" так…' });
  });

  it("starts over after reset", () => {
    const s = createFieldStreamer(["a"]);
    s.push('{"a":"old');
    s.reset();
    expect(s.push('{"a":"new"}')).toEqual([{ field: "a", delta: "new" }]);
  });
});
