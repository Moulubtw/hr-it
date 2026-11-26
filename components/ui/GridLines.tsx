/**
 * Visible 12-column layout sheet (PLAN.md §3.7): thin rulers with
 * column numbers along the top edge, like a mock-up sheet.
 */
export function GridLines() {
  const cols = Array.from({ length: 12 }, (_, i) => i + 1);
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 px-[var(--gutter)]"
    >
      <div className="grid h-full grid-cols-4 md:grid-cols-12">
        {cols.map((n) => (
          <div
            key={n}
            className={`relative border-l border-line last:border-r ${
              n > 4 ? "hidden md:block" : ""
            }`}
          >
            <span className="label tnum absolute left-1.5 top-1.5 text-[10px] opacity-50">
              {String(n).padStart(2, "0")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
