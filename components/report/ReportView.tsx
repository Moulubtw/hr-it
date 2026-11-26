"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { HrCharacter } from "@/components/stage/HrCharacter";
import { ScoreScale } from "@/components/stage/ScoreScale";
import { ErrorBar } from "@/components/ui/ErrorBar";
import { ApiClientError, finish, loadSession, type ApiErrorPayload } from "@/lib/client/engine";
import { findHistory, takeLabel, updateHistory } from "@/lib/history";
import type { Report, Session, Turn } from "@/lib/schema";
import { DIFFICULTIES, GRADES, KIND_LABELS, TONES } from "@/lib/session/options";

const label = <T extends string>(list: readonly { id: T; label: string }[], id: T) =>
  list.find((x) => x.id === id)!.label;

const toPayload = (err: unknown): ApiErrorPayload =>
  err instanceof ApiClientError ? err.payload : { code: "unknown", message: "Что-то пошло не так.", retryable: true };

type View =
  | { kind: "loading" }
  | { kind: "confirm"; session: Session } // interview not finished yet
  | { kind: "writing"; session: Session }
  | { kind: "ready"; session: Session; report: Report }
  | { kind: "failed"; session: Session | null; error: ApiErrorPayload };

/** Setup draft key shared with SetupForm, so «ещё дубль» opens with the same settings. */
const DRAFT_KEY = "hrit:setup-draft";

export function ReportView({ id }: { id: string }) {
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "loading" });
  const [take, setTake] = useState<number | null>(null);

  const build = useCallback(
    async (session: Session) => {
      setView({ kind: "writing", session });
      try {
        const report = await finish(id);
        updateHistory(id, { overall: report.overall, answered: session.turns.length });
        setView({ kind: "ready", session: { ...session, pending: null }, report });
      } catch (err) {
        setView({ kind: "failed", session, error: toPayload(err) });
      }
    },
    [id],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read-once from local history after mount
    setTake(findHistory(id)?.take ?? null);
    let cancelled = false;
    loadSession(id)
      .then((session) => {
        if (cancelled) return;
        if (session.report) setView({ kind: "ready", session, report: session.report });
        else if (session.turns.length === 0) setView({ kind: "failed", session, error: { code: "no_answers", message: "В этой сессии ещё нет ни одного ответа — отчёт строить не из чего.", retryable: false } });
        else if (session.pending) setView({ kind: "confirm", session });
        else void build(session);
      })
      .catch((err) => !cancelled && setView({ kind: "failed", session: null, error: toPayload(err) }));
    return () => {
      cancelled = true;
    };
  }, [id, build]);

  function retake(session: Session) {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          vacancy: session.vacancy,
          role: session.role ?? "",
          company: session.company ?? "",
          grade: session.grade,
          difficulty: session.difficulty,
          tone: session.tone,
        }),
      );
    } catch {
      /* storage unavailable: setup opens with defaults */
    }
    router.push("/setup");
  }

  const session = "session" in view ? view.session : null;

  return (
    <main className="relative z-10 flex flex-1 flex-col px-[var(--gutter)] pb-24">
      <header className="flex items-center justify-between gap-4 border-b border-line py-5">
        <Link href="/" className="display text-[15px] tracking-[-0.02em] hover:opacity-70">
          HR‑IT
        </Link>
        <span className="label">{take ? `Отчёт · ${takeLabel(take)}` : "Отчёт"}</span>
      </header>

      {view.kind === "loading" && <span className="label py-16">Загрузка…</span>}

      {view.kind === "confirm" && (
        <section className="flex flex-1 flex-col justify-center gap-10 py-16">
          <h1 className="display max-w-[18ch] text-[clamp(28px,5vw,72px)] font-extrabold">Интервью ещё не закончено</h1>
          <p className="max-w-[48ch] text-[17px] leading-[1.55] text-text-2">
            Отвечено {view.session.turns.length} из {view.session.totalQuestions}. Если получить отчёт сейчас, интервью завершится и
            продолжить его будет нельзя.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => build(view.session)} className="display bg-invert-bg px-7 py-5 text-[15px] font-semibold text-invert-text hover:opacity-85">
              Получить отчёт →
            </button>
            <Link href={`/interview?id=${id}`} className="display border border-line-strong px-7 py-5 text-[15px] font-semibold hover:border-text-1">
              Вернуться к интервью
            </Link>
          </div>
        </section>
      )}

      {view.kind === "writing" && (
        <section className="flex flex-1 flex-col items-start justify-center gap-8 py-16" role="status">
          <div className="relative">
            <div className="beam -top-10 left-0" aria-hidden />
            <HrCharacter state="thinking" className="relative w-28" />
          </div>
          <p className="display text-[clamp(22px,3.4vw,44px)] font-extrabold">
            Интервьюер пишет отчёт <span className="caret" aria-hidden />
          </p>
        </section>
      )}

      {view.kind === "failed" && (
        <section className="flex flex-1 flex-col justify-center gap-8 py-16">
          <ErrorBar
            error={view.error}
            onRetry={view.session ? () => build(view.session!) : undefined}
            onClose={() => router.push("/")}
            className="-mx-[var(--gutter)]"
          />
          {view.session && (
            <Link href={`/interview?id=${id}`} className="label hover:text-text-1">
              ← К интервью
            </Link>
          )}
        </section>
      )}

      {view.kind === "ready" && session && <ReadyReport session={session} report={view.report} onRetake={() => retake(session)} />}
    </main>
  );
}

function ReadyReport({ session, report, onRetake }: { session: Session; report: Report; onRetake: () => void }) {
  const date = new Date(session.createdAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  return (
    <>
      {/* headline score */}
      <section className="grid grid-cols-12 items-end gap-y-8 border-b border-line pb-12 pt-14">
        <div className="col-span-12 md:col-span-7">
          <span className="label mb-6 block">Итог</span>
          <p className="display tnum text-[clamp(96px,22vw,320px)] font-extrabold leading-[0.85] tracking-[-0.06em]">
            {report.overall.toFixed(1)}
          </p>
        </div>
        <dl className="col-span-12 grid grid-cols-2 gap-x-8 gap-y-5 md:col-span-5">
          <Meta term="Должность" value={session.role || "по тексту вакансии"} />
          <Meta term="Дата" value={date} />
          <Meta term="Грейд" value={label(GRADES, session.grade)} />
          <Meta term="Сложность" value={label(DIFFICULTIES, session.difficulty)} />
          <Meta term="Тон HR" value={label(TONES, session.tone)} />
          <Meta term="Ответы" value={`${session.turns.length} из ${session.totalQuestions}`} />
        </dl>
      </section>

      {/* criteria */}
      <section className="border-b border-line py-12">
        <h2 className="label mb-8">01 / Критерии</h2>
        <ul>
          {report.criteria.map((c) => (
            <li key={c.name} className="grid grid-cols-12 items-baseline gap-y-3 border-t border-line py-5 first:border-t-0">
              <span className="display col-span-12 text-[clamp(18px,2.2vw,28px)] font-semibold md:col-span-4">{c.name}</span>
              <span className="col-span-12 md:col-span-3">
                <ScoreScale score={c.score} />
              </span>
              <span className="col-span-12 text-[15px] leading-[1.5] text-text-2 md:col-span-5">{c.note}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* strengths / weaknesses / next */}
      <section className="grid gap-12 border-b border-line py-12 md:grid-cols-3">
        <ListBlock index="02" title="Сильное" items={report.strengths} />
        <ListBlock index="03" title="Слабое" items={report.weaknesses} />
        <ListBlock index="04" title="Что дальше" items={report.nextSteps} invert />
      </section>

      {/* turns */}
      <section className="py-12">
        <h2 className="label mb-8">05 / Ход интервью</h2>
        <div>
          {session.turns.map((t) => (
            <TurnRow key={t.index} turn={t} />
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={onRetake} className="display group inline-flex items-center gap-4 bg-invert-bg px-7 py-5 text-[15px] font-semibold text-invert-text hover:opacity-85">
          Ещё дубль с теми же настройками
          <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
        </button>
        <Link href="/setup" className="display border border-line-strong px-7 py-5 text-[15px] font-semibold hover:border-text-1">
          Новая сессия
        </Link>
      </div>
    </>
  );
}

function Meta({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="label mb-2">{term}</dt>
      <dd className="text-[16px] text-text-1">{value}</dd>
    </div>
  );
}

function ListBlock({ index, title, items, invert = false }: { index: string; title: string; items: string[]; invert?: boolean }) {
  return (
    <div className={invert ? "-mx-[var(--gutter)] bg-invert-bg px-[var(--gutter)] py-8 text-invert-text md:mx-0 md:px-6" : ""}>
      <h2 className={`label mb-6 ${invert ? "!text-invert-text/60" : ""}`}>
        {index} / {title}
      </h2>
      <ol className="space-y-4">
        {items.map((item, i) => (
          <li key={i} className="flex gap-4 text-[16px] leading-[1.5]">
            <span className="display tnum pt-[2px] text-[13px] font-semibold">{String(i + 1).padStart(2, "0")}</span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TurnRow({ turn }: { turn: Turn }) {
  return (
    <details className="group border-t border-line py-6 last:border-b">
      <summary className="grid cursor-pointer list-none grid-cols-12 items-baseline gap-y-3 [&::-webkit-details-marker]:hidden">
        <span className="display tnum col-span-2 text-[clamp(20px,2.4vw,32px)] font-extrabold md:col-span-1">
          {String(turn.index + 1).padStart(2, "0")}
        </span>
        <span className="col-span-10 md:col-span-7">
          <span className="label mb-2 block">
            {KIND_LABELS[turn.kind]}
            {turn.isFollowUp && " · уточнение"}
          </span>
          <span className="text-[17px] leading-[1.45]">{turn.question}</span>
        </span>
        <span className="col-span-10 col-start-3 flex items-center justify-between gap-4 md:col-span-4 md:col-start-auto md:justify-end">
          <ScoreScale score={turn.score} />
          <span aria-hidden className="display text-[20px] transition-transform duration-300 group-open:rotate-45">
            +
          </span>
        </span>
      </summary>
      <div className="mt-8 grid gap-10 md:grid-cols-12">
        <div className="md:col-span-5 md:col-start-2">
          <span className="label mb-3 block">Ваш ответ</span>
          <p className="whitespace-pre-wrap text-[16px] leading-[1.6] text-text-2">{turn.answer}</p>
          {turn.hrReaction && (
            <>
              <span className="label mb-3 mt-6 block">Реакция HR</span>
              <p className="text-[16px] leading-[1.5]">«{turn.hrReaction}»</p>
            </>
          )}
        </div>
        <div className="bg-invert-bg px-6 py-6 text-invert-text md:col-span-6">
          <span className="label mb-3 block !text-invert-text/60">Эталон</span>
          <p className="whitespace-pre-wrap text-[16px] leading-[1.6]">{turn.idealAnswer}</p>
          <span className="label mb-3 mt-6 block !text-invert-text/60">Что усилить</span>
          <ul className="space-y-2 text-[15px] leading-[1.5]">
            {turn.feedback.map((f, i) => (
              <li key={i}>— {f}</li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}
