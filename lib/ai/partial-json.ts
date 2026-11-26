/**
 * Streams top-level string fields out of a JSON object that is still
 * arriving (PLAN.md §2.3): the HR line can appear on screen before the
 * ideal answer is finished. Re-scans the buffer on each chunk — answers are
 * a few KB, so this stays cheap and simple.
 */

export type FieldDelta = { field: string; delta: string };

/** Reads the top-level object; string values may be cut off at the end. */
export function scanPartialObject(src: string): Map<string, { value: string; complete: boolean }> {
  const out = new Map<string, { value: string; complete: boolean }>();
  let i = 0;
  const ws = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };

  // Decodes a JSON string starting after its opening quote.
  const readString = (): { value: string; complete: boolean } => {
    let value = "";
    while (i < src.length) {
      const ch = src[i];
      if (ch === '"') {
        i++;
        return { value, complete: true };
      }
      if (ch === "\\") {
        const esc = src[i + 1];
        if (esc === undefined) break; // escape cut off
        if (esc === "u") {
          const hex = src.slice(i + 2, i + 6);
          if (hex.length < 4) break;
          value += String.fromCharCode(parseInt(hex, 16));
          i += 6;
          continue;
        }
        const map: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", '"': '"', "\\": "\\", "/": "/" };
        value += map[esc] ?? esc;
        i += 2;
        continue;
      }
      value += ch;
      i++;
    }
    i = src.length;
    return { value, complete: false };
  };

  // Skips a non-string value (number, bool, null, array, object).
  const skipValue = () => {
    let depth = 0;
    while (i < src.length) {
      const ch = src[i];
      if (ch === '"') {
        i++;
        readString();
        continue;
      }
      if (ch === "[" || ch === "{") depth++;
      else if (ch === "]" || ch === "}") {
        if (depth === 0) return;
        depth--;
      } else if (ch === "," && depth === 0) return;
      i++;
    }
  };

  ws();
  if (src[i] !== "{") return out;
  i++;
  while (i < src.length) {
    ws();
    if (src[i] === "}") break;
    if (src[i] === ",") {
      i++;
      continue;
    }
    if (src[i] !== '"') break;
    i++;
    const key = readString();
    if (!key.complete) break;
    ws();
    if (src[i] !== ":") break;
    i++;
    ws();
    if (i >= src.length) break;
    if (src[i] === '"') {
      i++;
      out.set(key.value, readString());
    } else {
      skipValue();
    }
  }
  return out;
}

export function createFieldStreamer(fields: readonly string[]) {
  let buffer = "";
  const sent = new Map<string, number>();

  return {
    push(chunk: string): FieldDelta[] {
      buffer += chunk;
      const parsed = scanPartialObject(buffer);
      const deltas: FieldDelta[] = [];
      for (const field of fields) {
        const v = parsed.get(field);
        if (!v) continue;
        const already = sent.get(field) ?? 0;
        if (v.value.length > already) {
          deltas.push({ field, delta: v.value.slice(already) });
          sent.set(field, v.value.length);
        }
      }
      return deltas;
    },
    reset() {
      buffer = "";
      sent.clear();
    },
    get text() {
      return buffer;
    },
  };
}
