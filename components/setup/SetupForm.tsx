"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ErrorBar } from "@/components/ui/ErrorBar";
import { KineticText } from "@/components/ui/KineticText";
import { ApiClientError, createSession, hasAiAccess, type ApiErrorPayload } from "@/lib/client/engine";
import { addHistory } from "@/lib/history";
import { LIMITS } from "@/lib/schema";
import {
  DIFFICULTIES,
  DIFFICULTY_HINTS,
  GRADE_HINTS,
  GRADES,
  questionCount,
  TONE_SAMPLES,
  TONES,
  type Difficulty,
  type Grade,
  type Tone,
} from "@/lib/session/options";
import { KeyPanel } from "@/components/settings/KeyPanel";
import { TypeToggle } from "./TypeToggle";

type Draft = {
  vacancy: string;
  role: string;
  company: string;
  grade: Grade;
  difficulty: Difficulty;
  tone: Tone;
};

const DEFAULT_DRAFT: Draft = {
  vacancy: "",
  role: "",
  company: "",
  grade: "middle",
  difficulty: "medium",
  tone: "polite",
};

const DRAFT_KEY = "hrit:setup-draft";

const label = <T extends string>(list: readonly { id: T; label: string }[], id: T) =>
  list.find((x) => x.id === id)!.label;

function validate(d: Draft): string | null {
  if (d.vacancy.trim().length >= 20 || d.role.trim().length >= 2) return null;
  return "Вставьте текст вакансии (от 20 символов) или хотя бы название должности.";
}

type Status =
  | { kind: "idle" }
  | { kind: "starting"; question: string }
  | { kind: "error"; error: ApiErrorPayload };

export function SetupForm() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [restored, setRestored] = useState(false);
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const vacancyRef = useRef<HTMLTextAreaElement>(null);
  const keyRef = useRef<HTMLDivElement>(null);
  const [keyMissing, setKeyMissing] = useState(false);

  // Per-browser convenience: bring back the last setup.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore after hydration
      if (raw) setDraft({ ...DEFAULT_DRAFT, ...JSON.parse(raw) });
    } catch {
      /* storage unavailable */
    }
    setRestored(true);
    const onKey = () => setKeyMissing(false);
    window.addEventListener("hrit:ai-settings", onKey);
    return () => {
      abortRef.current?.abort();
      window.removeEventListener("hrit:ai-settings", onKey);
    };
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* storage unavailable */
    }
  }, [draft, restored]);

  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const error = touched ? validate(draft) : null;
  const total = questionCount(draft.grade, draft.difficulty);

  async function start(e?: FormEvent) {
    e?.preventDefault();
    setTouched(true);
    if (validate(draft)) {
      vacancyRef.current?.focus();
      vacancyRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    if (status.kind === "starting") return;
    if (!hasAiAccess()) {
      setKeyMissing(true);
      keyRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      keyRef.current?.querySelector("input")?.focus({ preventScroll: true });
      return;
    }
    setKeyMissing(false);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStatus({ kind: "starting", question: "" });

    let sessionId = "";
    try {
      await createSession(
        {
          vacancy: draft.vacancy,
          role: draft.role || undefined,
          company: draft.company || undefined,
          grade: draft.grade,
          difficulty: draft.difficulty,
          tone: draft.tone,
        },
        (msg) => {
          if (msg.event === "session") {
            const data = msg.data as { sessionId: string; totalQuestions: number };
            sessionId = data.sessionId;
            addHistory({
              id: sessionId,
              createdAt: new Date().toISOString(),
              totalQuestions: data.totalQuestions,
              settings: {
                vacancy: draft.vacancy,
                role: draft.role || undefined,
                company: draft.company || undefined,
                grade: draft.grade,
                difficulty: draft.difficulty,
                tone: draft.tone,
              },
            });
          }
          else if (msg.event === "question")
            setStatus((s) => (s.kind === "starting" ? { ...s, question: s.question + (msg.data as { delta: string }).delta } : s));
          else if (msg.event === "reset") setStatus({ kind: "starting", question: "" });
          else if (msg.event === "question_done") router.push(`/interview?id=${sessionId}`);
        },
        ctrl.signal,
      );
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setStatus({
        kind: "error",
        error: err instanceof ApiClientError ? err.payload : { code: "unknown", message: "Что-то пошло не так.", retryable: true },
      });
    }
  }

  return (
    <>
      <form onSubmit={start} noValidate className="pb-40">
        {/* 00 — Own Gemini key */}
        <Row index="00" title="Ключ Gemini">
          <KeyPanel ref={keyRef} attention={keyMissing} />
          {keyMissing && (
            <p role="alert" className="mt-6 text-[14px] text-text-1">
              — Сначала добавьте свой ключ Gemini: интервьюер работает на нём.
            </p>
          )}
        </Row>

        {/* 01 — Vacancy */}
        <Row index="01" title="Вакансия">
          <div className="border-b border-line-strong focus-within:border-text-1">
            <span className="label mb-3 block">
              Текст вакансии <span className="caret ml-1 align-middle" aria-hidden />
            </span>
            <textarea
              ref={vacancyRef}
              value={draft.vacancy}
              onChange={(e) => set("vacancy")(e.target.value)}
              maxLength={LIMITS.vacancy}
              rows={7}
              placeholder="Вставьте описание вакансии целиком: обязанности, требования, стек…"
              aria-invalid={!!error}
              aria-describedby="vacancy-help"
              className="block w-full resize-y bg-transparent text-[17px] leading-[1.55] text-text-1 placeholder:text-text-2/60 [caret-color:var(--text-1)] focus:outline-none"
            />
          </div>
          <div id="vacancy-help" className="mt-3 flex justify-between gap-4">
            <span className={`text-[14px] ${error ? "text-text-1" : "text-text-2"}`} role={error ? "alert" : undefined}>
              {error ? `— ${error}` : "Можно оставить пустым и указать только должность."}
            </span>
            <span className="label tnum shrink-0">
              {draft.vacancy.length} / {LIMITS.vacancy}
            </span>
          </div>

          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            <LineInput label="Должность" value={draft.role} onChange={set("role")} max={LIMITS.role} placeholder="Например, продуктовый дизайнер" />
            <LineInput label="Компания (необязательно)" value={draft.company} onChange={set("company")} max={LIMITS.company} placeholder="Например, финтех‑стартап" />
          </div>
        </Row>

        {/* 02 — Grade */}
        <Row index="02" title="Грейд">
          <TypeToggle name="grade" legend="Грейд" options={GRADES} value={draft.grade} onChange={set("grade")} hint={GRADE_HINTS[draft.grade]} />
        </Row>

        {/* 03 — Difficulty */}
        <Row index="03" title="Сложность">
          <TypeToggle
            name="difficulty"
            legend="Сложность"
            options={DIFFICULTIES}
            value={draft.difficulty}
            onChange={set("difficulty")}
            hint={DIFFICULTY_HINTS[draft.difficulty]}
          />
        </Row>

        {/* 04 — Tone */}
        <Row index="04" title="Тон HR">
          <TypeToggle name="tone" legend="Тон интервьюера" options={TONES} value={draft.tone} onChange={set("tone")} />
          <div className="mt-8 border-l-2 border-text-1 pl-5">
            <span className="label mb-3 block">Так он звучит</span>
            <KineticText
              key={draft.tone}
              text={TONE_SAMPLES[draft.tone]}
              tone={draft.tone}
              className="display text-[clamp(18px,2.2vw,30px)] font-semibold"
            />
          </div>
        </Row>

        {/* Sticky summary */}
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 px-[var(--gutter)] py-4 backdrop-blur-[2px]">
          <div className="flex items-center justify-between gap-4">
            <p className="label tnum hidden leading-[1.6] sm:block">
              {label(GRADES, draft.grade)} · {label(DIFFICULTIES, draft.difficulty)} · {label(TONES, draft.tone)}
              <span className="mx-3 text-line-strong">/</span>
              {total} вопросов
            </p>
            <button
              type="submit"
              disabled={status.kind === "starting"}
              className="display group inline-flex w-full items-center justify-between gap-6 bg-invert-bg px-7 py-5 text-[15px] font-semibold tracking-[-0.01em] text-invert-text transition-colors hover:bg-transparent hover:text-text-1 hover:outline hover:outline-1 hover:outline-text-1 disabled:opacity-60 sm:w-auto"
            >
              Начать интервью
              <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
            </button>
          </div>
        </div>
      </form>

      {status.kind === "starting" && (
        <StartingOverlay question={status.question} tone={draft.tone} onCancel={() => { abortRef.current?.abort(); setStatus({ kind: "idle" }); }} />
      )}

      {status.kind === "error" && (
        <ErrorBar
          error={status.error}
          onRetry={() => start()}
          onClose={() => setStatus({ kind: "idle" })}
          className="fixed inset-x-0 bottom-[92px] z-50"
        />
      )}
    </>
  );
}

function Row({ index, title, children }: { index: string; title: string; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-12 gap-y-6 border-b border-line py-12">
      <h2 className="label col-span-12 md:col-span-2">
        {index} / {title}
      </h2>
      <div className="col-span-12 md:col-span-10">{children}</div>
    </section>
  );
}

function LineInput({
  label: text,
  value,
  onChange,
  max,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  placeholder: string;
}) {
  return (
    <label className="block border-b border-line-strong focus-within:border-text-1">
      <span className="label mb-3 block">{text}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={max}
        placeholder={placeholder}
        className="block w-full bg-transparent pb-3 text-[17px] text-text-1 placeholder:text-text-2/60 [caret-color:var(--text-1)] focus:outline-none"
      />
    </label>
  );
}

function StartingOverlay({ question, tone, onCancel }: { question: string; tone: Tone; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg px-[var(--gutter)] py-6" role="status" aria-live="polite">
      <div className="beam left-[18%]" aria-hidden />
      <div className="relative flex items-center justify-between">
        <span className="label">Интервьюер готовит первый вопрос</span>
        <button type="button" onClick={onCancel} className="label hover:text-text-1">
          Отменить
        </button>
      </div>
      <div className="relative flex flex-1 items-center">
        <p data-tone={tone} className="display max-w-[22ch] text-[clamp(26px,5.2vw,80px)] font-extrabold">
          {question}
          <span className="caret ml-2" aria-hidden />
        </p>
      </div>
      <span className="label tnum relative">01 / Сцена</span>
    </div>
  );
}
