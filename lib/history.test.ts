import { beforeEach, describe, expect, it } from "vitest";
import { addHistory, clearHistory, findHistory, readHistory, takeLabel, updateHistory, type SessionSettings } from "./history";

// Minimal localStorage for the node test environment.
const mem = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

const settings: SessionSettings = { vacancy: "Аналитик", role: "Аналитик", grade: "middle", difficulty: "hard", tone: "rude" };
const add = (id: string, s = settings) => addHistory({ id, createdAt: "2026-11-26T00:00:00Z", settings: s, totalQuestions: 11 });

describe("history", () => {
  beforeEach(() => clearHistory());

  it("numbers takes per identical settings, newest first", () => {
    expect(add("a").take).toBe(1);
    expect(add("b").take).toBe(2);
    expect(add("c", { ...settings, tone: "polite" }).take).toBe(1);
    expect(add("d", { ...settings, role: "  аналитик " }).take).toBe(3);
    expect(readHistory().map((e) => e.id)).toEqual(["d", "c", "b", "a"]);
    expect(takeLabel(3)).toBe("Дубль 03");
  });

  it("updates progress and score", () => {
    add("a");
    updateHistory("a", { answered: 4 });
    updateHistory("a", { overall: 6.4 });
    expect(findHistory("a")).toMatchObject({ answered: 4, overall: 6.4 });
  });

  it("survives broken storage contents", () => {
    localStorage.setItem("hrit:history", "{not json");
    expect(readHistory()).toEqual([]);
  });
});
