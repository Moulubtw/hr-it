/** Score as ten square divisions — no colour, just fill (PLAN.md §3.2). */
export function ScoreScale({ score, invert = false }: { score: number; invert?: boolean }) {
  const filled = Math.round(score);
  const on = invert ? "bg-invert-text" : "bg-text-1";
  const off = invert ? "border border-invert-text/40" : "border border-line-strong";
  return (
    <div className="flex items-center gap-3" role="img" aria-label={`Оценка ${score} из 10`}>
      <div className="flex gap-[3px]">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={`size-3 ${i < filled ? on : off}`} />
        ))}
      </div>
      <span className="display tnum text-[15px] font-semibold">
        {Number.isInteger(score) ? score : score.toFixed(1)}
        <span className="opacity-50"> / 10</span>
      </span>
    </div>
  );
}
