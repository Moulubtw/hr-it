/**
 * Gemini SDK adapter. Runs in the visitor's browser with the visitor's own
 * key: requests go straight to Google, the key never touches our hosting.
 */
import { GoogleGenAI } from "@google/genai";
import type { AiTransport } from "./client";

export function createGeminiTransport(apiKey: string): AiTransport {
  const ai = new GoogleGenAI({ apiKey });

  return {
    async *stream(model, req, signal) {
      const response = await ai.models.generateContentStream({
        model,
        contents: req.messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
        config: {
          abortSignal: signal,
          systemInstruction: req.system,
          temperature: req.temperature,
          ...(req.responseSchema
            ? { responseMimeType: "application/json", responseJsonSchema: req.responseSchema }
            : {}),
        },
      });
      for await (const chunk of response) {
        const text = chunk.text;
        if (text) yield text;
      }
    },
    listModels: () => listGenerativeModels(apiKey),
  };
}

export type ModelInfo = { id: string; label: string };

/** Models this key can use for text generation; also validates the key. */
export async function listGenerativeModels(apiKey: string): Promise<string[]> {
  const ai = new GoogleGenAI({ apiKey });
  const ids: string[] = [];
  const pager = await ai.models.list({ config: { pageSize: 100 } });
  for await (const m of pager) {
    if (!m.name) continue;
    if (m.supportedActions && !m.supportedActions.includes("generateContent")) continue;
    ids.push(m.name.replace(/^models\//, ""));
  }
  return ids;
}
