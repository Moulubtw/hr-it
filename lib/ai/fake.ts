/**
 * Local-only fake model so the UI can be built and checked without a
 * Gemini key. Enabled with HRIT_FAKE_AI=1 outside production.
 */
import { jsonSchemas } from "@/lib/schema";
import type { AiTransport } from "./client";

const QUESTIONS = [
  ["Почему вы откликнулись именно на эту вакансию?", "motivation"],
  ["Расскажите о задаче, которой вы гордитесь больше всего.", "behavioral"],
  ["Как вы поступите, если сроки горят, а требования меняются каждый день?", "situational"],
  ["Объясните, как вы проверяете качество своей работы перед сдачей.", "technical"],
] as const;

let turn = 0;

function reply(schema: unknown, rude: boolean): object {
  if (schema === jsonSchemas.question) {
    turn = 0;
    return { question: QUESTIONS[0][0], kind: QUESTIONS[0][1] };
  }
  if (schema === jsonSchemas.turn) {
    turn++;
    const [q, kind] = QUESTIONS[turn % QUESTIONS.length];
    return {
      hrReaction: rude ? "И это всё? Звучит общо. Конкретнее." : "Спасибо, понятно. Давайте чуть глубже.",
      idealAnswer:
        "В [компания] я отвечал за [область]. Задача была сократить [метрика] на [цифра]%. Я разбил работу на три этапа: собрал данные, договорился с командой о приоритетах и запустил эксперимент. В итоге [метрика] снизилась на [цифра]%, а подход стал стандартом для команды.",
      feedback: ["Назовите конкретный результат в цифрах.", "Покажите свою роль, а не команды целиком."],
      score: 6,
      nextQuestion: q,
      nextQuestionKind: kind,
      isFollowUp: false,
    };
  }
  return {
    overall: 6.4,
    criteria: [
      { name: "Структура", score: 6, note: "Ответы без явной структуры." },
      { name: "Глубина", score: 7, note: "Хорошее понимание основ." },
      { name: "Релевантность вакансии", score: 6, note: "Мало связи с требованиями." },
      { name: "Примеры", score: 5, note: "Не хватает цифр." },
      { name: "Коммуникация", score: 7, note: "Говорите уверенно." },
    ],
    strengths: ["Уверенная подача.", "Знание базовых инструментов."],
    weaknesses: ["Мало конкретики.", "Нет результатов в цифрах."],
    nextSteps: ["Подготовьте 3 истории по STAR.", "Выпишите цифры по своим проектам.", "Перечитайте требования вакансии."],
  };
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    });
  });

export const fakeTransport: AiTransport = {
  async *stream(_model, req, signal) {
    const rude = /Тон «Грубый»/.test(req.system ?? "");
    const text = JSON.stringify(reply(req.responseSchema, rude));
    await sleep(500, signal);
    for (let i = 0; i < text.length; i += 6) {
      await sleep(18, signal);
      yield text.slice(i, i + 6);
    }
  },
  async listModels() {
    return ["fake-hydrogen"];
  },
};
