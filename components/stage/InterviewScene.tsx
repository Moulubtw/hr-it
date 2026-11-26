"use client";

import Link from "next/link";
import { KineticText } from "@/components/ui/KineticText";
import { ErrorBar } from "@/components/ui/ErrorBar";
import { DIFFICULTIES, DIFFICULTY_RULES, GRADES, KIND_LABELS, TONES } from "@/lib/session/options";
import { AnswerBox } from "./AnswerBox";
import { HrCharacter, type HrState } from "./HrCharacter";
import { ReviewSheet } from "./ReviewSheet";
import { TimerBar, TimerDigits } from "./Timer";
import { useInterview, type InterviewState } from "./useInterview";

const label = <T extends string>(list: readonly { id: T; label: string }[], id: T) =>
  list.find((x) => x.id === id)!.label;

function hrState(s: InterviewState): HrState {
  if (s.phase === "loading" || s.phase === "evaluating") return s.live.score === null ? "thinking" : scoreState(s);
  if (s.phase === "reviewed") return scoreState(s);
  return "listening";
}

function scoreState(s: InterviewState): HrState {
  const score = s.live.score ?? 5;
  if (score >= 7) return "nodding";
  if (score <= 4) return s.session?.tone === "rude" ? "annoyed" : "skeptical";
  return "listening";
}

export function InterviewScene({ id }: { id: string }) {
  const { state, submit, advance, dismissError } = useInterview(id);
  const { session, current, phase, live } = state;

  if (phase === "missing") {
    return (
      <main className="relative z-10 flex flex-1 flex-col justify-center gap-8 px-[var(--gutter)]">
        <h1 className="display text-[clamp(28px,5vw,72px)] font-extrabold">Сессия не найдена</h1>
        <p className="max-w-[44ch] text-text-2">{state.error?.message ?? "Возможно, она истекла. Начните новую."}</p>
        <Link href="/setup" className="display w-fit bg-invert-bg px-7 py-5 text-[15px] font-semibold text-invert-text">
          Новая сессия →
        </Link>
      </main>
    );
  }

  const tone = session?.tone ?? "polite";
  const seconds = session ? DIFFICULTY_RULES[session.difficulty].answerSeconds : null;
  const timed = !!seconds && phase === "answering";
  const total = session?.totalQuestions ?? 0;
  const number = current ? String(current.index + 1).padStart(2, "0") : "—";
  const hrLine = phase === "evaluating" || phase === "reviewed" ? live.hrReaction : "";
  const showSheet = (phase === "evaluating" && live.idealAnswer.length > 0) || phase === "reviewed";

  function next() {
    advance();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="relative z-10 flex flex-1 flex-col px-[var(--gutter)]">
      {timed && current && <TimerBar key={`timer-${current.index}`} seconds={seconds!} startedAt={state.startedAt} />}

      {/* meta row */}
      <header className="flex items-center justify-between gap-4 border-b border-line py-5">
        <Link href="/" className="display text-[15px] tracking-[-0.02em] hover:opacity-70">
          HR‑IT
        </Link>
        {session && (
          <span className="label hidden md:inline">
            {label(GRADES, session.grade)} · {label(DIFFICULTIES, session.difficulty)} · {label(TONES, session.tone)}
          </span>
        )}
        <div className="flex items-center gap-5">
          {timed && current && <TimerDigits key={current.index} seconds={seconds!} startedAt={state.startedAt} running={timed} />}
          {state.model && (
            <span className="label" title={state.model.name}>
              {state.model.fallback ? "Fast" : "H"}
            </span>
          )}
          {session && session.turns.length > 0 && phase !== "evaluating" && (
            <Link href={`/report?id=${id}`} className="label hover:text-text-1">
              Завершить
            </Link>
          )}
        </div>
      </header>

      {/* stage */}
      <section className="grid grid-cols-12 gap-y-6 pb-10 pt-8 lg:min-h-[62svh] lg:items-center lg:pt-12">
        <aside className="relative col-span-12 flex items-end gap-5 lg:col-span-4 lg:flex-col lg:items-start">
          <div className="beam -top-12 left-0 lg:left-[10%]" aria-hidden />
          <HrCharacter state={hrState(state)} className="relative w-20 shrink-0 sm:w-24 lg:w-[min(100%,300px)]" />
          <p className="relative min-h-[1.5em] max-w-[30ch] pb-1 text-[15px] leading-[1.45] text-text-1 lg:text-[17px]" aria-live="polite">
            {hrLine ? `«${hrLine}»` : <span className="label">{phase === "answering" ? "Слушает" : "Думает…"}</span>}
          </p>
        </aside>

        <div className="col-span-12 lg:col-span-8 lg:pl-6">
          <div className={`mb-6 flex items-baseline gap-4 ${current ? "" : "invisible"}`}>
            <span className="display tnum text-[clamp(40px,6vw,88px)] font-extrabold leading-none">
              <span key={number} className="flip-in">{number}</span>
              <span className="text-line-strong">/{String(total).padStart(2, "0")}</span>
            </span>
            {current && (
              <span className="label">
                {KIND_LABELS[current.kind]}
                {current.isFollowUp && " · уточнение"}
              </span>
            )}
          </div>
          {current ? (
            <KineticText
              key={current.index}
              as="h1"
              text={current.question}
              tone={tone}
              className="jolt display max-w-[24ch] text-[clamp(24px,4.2vw,64px)] font-extrabold"
            />
          ) : (
            <span className="caret" aria-hidden />
          )}
        </div>
      </section>

      {state.error && (
        <ErrorBar error={state.error} onClose={dismissError} className="-mx-[var(--gutter)] mb-4" />
      )}

      {/* answer */}
      {phase === "answering" && current && session && (
        <AnswerBox key={`answer-${current.index}`} sessionId={id} index={current.index} onSubmit={submit} />
      )}
      {phase === "evaluating" && !showSheet && (
        <div className="border-t border-line py-8">
          <span className="label mb-4 block">Ваш ответ</span>
          <p className="max-w-[70ch] whitespace-pre-wrap text-[18px] leading-[1.6] text-text-2">{state.answer}</p>
        </div>
      )}

      {showSheet && (
        <ReviewSheet
          sessionId={id}
          answer={state.answer}
          live={live}
          streaming={phase === "evaluating"}
          hasNext={!!state.next}
          onNext={next}
        />
      )}
    </main>
  );
}
