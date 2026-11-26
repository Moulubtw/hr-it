/**
 * The visitor's own Gemini settings, kept only in their browser.
 */
export type AiSettings = {
  apiKey: string;
  primary: string;
  fallbacks: string[];
  /** Models the key could use when it was checked. */
  available?: string[];
};

const KEY = "hrit:ai-settings";

export function readAiSettings(): AiSettings | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AiSettings;
    return s.apiKey && s.primary ? s : null;
  } catch {
    return null;
  }
}

export function saveAiSettings(s: AiSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event("hrit:ai-settings"));
}

export function clearAiSettings() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("hrit:ai-settings"));
}

const isFlash = (id: string) => /flash/i.test(id);
const isLite = (id: string) => /lite/i.test(id);
const isOddVariant = (id: string) => /(embed|tts|audio|image|vision|live|native|aqa|learnlm|robotics|computer-use|exp-\d)/i.test(id);

/** Newer versions first: compares the first version number in the id. */
function version(id: string): number {
  const m = id.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

/**
 * Picks the primary model (Gemini 4 Hydrogen when the key has it) and fast
 * fallbacks (Flash, then Flash‑Lite) from what the key can actually use.
 */
export function pickDefaultModels(available: string[]): { primary: string; fallbacks: string[] } {
  const usable = available.filter((id) => /gemini/i.test(id) && !isOddVariant(id));
  const pool = usable.length ? usable : available;
  const byNewest = [...pool].sort((a, b) => version(b) - version(a));

  const primary =
    byNewest.find((id) => /hydrogen/i.test(id)) ??
    byNewest.find((id) => /pro/i.test(id) && !isFlash(id)) ??
    byNewest.find((id) => !isLite(id)) ??
    byNewest[0] ??
    "";

  const fallbacks = [
    ...byNewest.filter((id) => id !== primary && isFlash(id) && !isLite(id)).slice(0, 1),
    ...byNewest.filter((id) => id !== primary && isLite(id)).slice(0, 1),
  ];
  return { primary, fallbacks };
}
