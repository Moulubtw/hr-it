import type { ApiErrorPayload } from "@/lib/client/engine";

/** Inverted error strip with optional retry (PLAN.md §3.2: inversion = important). */
export function ErrorBar({
  error,
  onRetry,
  onClose,
  className = "",
}: {
  error: ApiErrorPayload;
  onRetry?: () => void;
  onClose: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={`px-[var(--gutter)] ${className}`}>
      <div className="flex flex-col gap-4 bg-invert-bg px-6 py-5 text-invert-text sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[15px] leading-[1.45]">
          <span className="display mr-3 text-[13px] font-semibold">Не вышло</span>
          {error.message}
        </p>
        <div className="flex shrink-0 gap-2">
          {error.retryable && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="display border border-invert-text px-4 py-2 text-[12px] font-semibold hover:bg-invert-text hover:text-invert-bg"
            >
              Повторить
            </button>
          )}
          <button type="button" onClick={onClose} className="display px-4 py-2 text-[12px] font-semibold underline-offset-4 hover:underline">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
