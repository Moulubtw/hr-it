import Link from "next/link";
import { HistoryList } from "@/components/HistoryList";
import { GridLines } from "@/components/ui/GridLines";
import { KineticText } from "@/components/ui/KineticText";
import { DIFFICULTIES, GRADES } from "@/lib/session/options";

const HEADLINE = "Готовься к собеседованию, которое ещё не назначено";

export default function Home() {
  return (
    <>
      <GridLines />

      <main className="relative z-10 flex flex-1 flex-col px-[var(--gutter)]">
        {/* Top meta row */}
        <header className="flex items-center justify-between border-b border-line py-5">
          <span className="display text-[15px] tracking-[-0.02em]">HR‑IT</span>
          <span className="label hidden sm:inline">Тренажёр собеседований</span>
          <span className="label tnum">Дубль 01</span>
        </header>

        {/* Hero */}
        <section className="relative grid min-h-[78svh] grid-cols-12 items-end overflow-hidden pb-14 pt-24">
          <div className="beam left-[58%]" aria-hidden />
          <div className="col-span-12 lg:col-span-11">
            <span className="label mb-8 block">01 / Сцена</span>
            <KineticText
              as="h1"
              text={HEADLINE}
              className="display text-[clamp(28px,7.2vw,128px)] font-extrabold"
            />
          </div>
          <div className="col-span-12 mt-14 flex flex-col gap-8 md:col-span-7 md:col-start-6 md:flex-row md:items-end md:justify-between">
            <p className="max-w-[34ch] text-[17px] leading-[1.5] text-text-2">
              Вставьте вакансию — интервьюер задаст вопросы под ваш грейд.
              После каждого ответа покажем, как этот вопрос закрыл бы сильный
              кандидат.
            </p>
            <Link
              href="/setup"
              className="display group inline-flex shrink-0 items-center gap-4 bg-invert-bg px-7 py-5 text-[15px] font-semibold tracking-[-0.01em] text-invert-text transition-colors hover:bg-transparent hover:text-text-1 hover:outline hover:outline-1 hover:outline-text-1"
            >
              Начать
              <span className="transition-transform duration-300 group-hover:translate-x-1">
                →
              </span>
            </Link>
          </div>
        </section>

        {/* Parameters */}
        <section className="border-t border-line">
          <Row index="02" title="Грейд">
            {GRADES.map((g) => g.label).join(" · ")}
          </Row>
          <Row index="03" title="Сложность">
            {DIFFICULTIES.map((d) => d.label).join(" · ")}
          </Row>
          <div className="grid grid-cols-12 gap-y-6 border-b border-line py-10">
            <span className="label col-span-12 md:col-span-2">04 / Тон</span>
            <ToneSample
              label="Вежливый"
              text="Спасибо. Расскажите чуть подробнее?"
              tone="polite"
            />
            <ToneSample
              label="Грубый"
              text="И это всё? Конкретнее."
              tone="rude"
            />
          </div>
        </section>

        <HistoryList />

        <footer className="flex items-center justify-between py-6">
          <span className="label">
            Ответ <span className="caret ml-2" aria-hidden />
          </span>
          <span className="label tnum">2026</span>
        </footer>
      </main>
    </>
  );
}

function Row({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-12 items-baseline gap-y-4 border-b border-line py-10">
      <span className="label col-span-12 md:col-span-2">
        {index} / {title}
      </span>
      <p className="display col-span-12 text-[clamp(20px,3.2vw,44px)] font-semibold text-text-1 md:col-span-10">
        {children}
      </p>
    </div>
  );
}

function ToneSample({
  label,
  text,
  tone,
}: {
  label: string;
  text: string;
  tone: "polite" | "rude";
}) {
  return (
    <div className="col-span-12 md:col-span-5">
      <span className="label mb-4 block">{label}</span>
      <KineticText
        text={text}
        tone={tone}
        delay={1400}
        className="display text-[clamp(20px,2.6vw,36px)] font-semibold"
      />
    </div>
  );
}
