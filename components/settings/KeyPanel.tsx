"use client";

import { forwardRef, useEffect, useState } from "react";
import { FAKE_AI } from "@/lib/client/engine";
import { clearAiSettings, pickDefaultModels, readAiSettings, saveAiSettings, type AiSettings } from "@/lib/client/settings";
import { listGenerativeModels } from "@/lib/ai/gemini";

type Check = { kind: "idle" } | { kind: "checking" } | { kind: "error"; message: string };

const mask = (key: string) => (key.length > 10 ? `${key.slice(0, 4)}…${key.slice(-4)}` : "••••");

function describeKeyError(err: unknown): string {
  const status = (err as { status?: number })?.status;
  const msg = err instanceof Error ? err.message : "";
  if (status === 400 || status === 401 || status === 403 || /api[_ -]?key/i.test(msg))
    return "Ключ не подошёл. Скопируйте его из Google AI Studio целиком и попробуйте ещё раз.";
  if (status === 429) return "Google ограничил частоту запросов для этого ключа. Подождите минуту.";
  return "Не удалось связаться с Google. Проверьте интернет и попробуйте ещё раз.";
}

/**
 * «00 / Ключ Gemini»: every visitor brings their own key. It stays in this
 * browser and goes straight to Google; the site never sees it.
 */
export const KeyPanel = forwardRef<HTMLDivElement, { attention?: boolean }>(function KeyPanel({ attention }, ref) {
  const [saved, setSaved] = useState<AiSettings | null>(null);
  const [draft, setDraft] = useState("");
  const [check, setCheck] = useState<Check>({ kind: "idle" });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setSaved(readAiSettings());
    setMounted(true);
    const onChange = () => setSaved(readAiSettings());
    window.addEventListener("hrit:ai-settings", onChange);
    return () => window.removeEventListener("hrit:ai-settings", onChange);
  }, []);

  async function verify() {
    const key = draft.trim();
    if (!key) return;
    setCheck({ kind: "checking" });
    try {
      const available = await listGenerativeModels(key);
      const { primary, fallbacks } = pickDefaultModels(available);
      if (!primary) {
        setCheck({ kind: "error", message: "Ключ рабочий, но ему недоступна ни одна модель Gemini для генерации текста." });
        return;
      }
      saveAiSettings({ apiKey: key, primary, fallbacks, available });
      setDraft("");
      setCheck({ kind: "idle" });
    } catch (err) {
      setCheck({ kind: "error", message: describeKeyError(err) });
    }
  }

  function update(patch: Partial<AiSettings>) {
    if (!saved) return;
    saveAiSettings({ ...saved, ...patch });
  }

  const models = saved?.available ?? (saved ? [saved.primary, ...saved.fallbacks] : []);

  return (
    <div ref={ref} className={`scroll-mt-24 ${attention ? "outline outline-2 outline-offset-8 outline-text-1" : ""}`}>
      {FAKE_AI ? (
        <p className="text-[16px] text-text-2">Демо‑сборка: ответы заготовлены, ключ не нужен.</p>
      ) : !mounted ? (
        <span className="label">Загрузка…</span>
      ) : saved ? (
        <div className="space-y-8">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <p className="display text-[clamp(18px,2.2vw,28px)] font-semibold">
              Ключ подключён <span className="tnum text-text-2">{mask(saved.apiKey)}</span>
            </p>
            <button type="button" onClick={() => clearAiSettings()} className="label hover:text-text-1">
              Удалить ключ
            </button>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            <ModelSelect label="Основная модель" value={saved.primary} options={models} onChange={(primary) => update({ primary, fallbacks: saved.fallbacks.filter((f) => f !== primary) })} />
            {[0, 1].map((i) => (
              <ModelSelect
                key={i}
                label={`Резерв ${i + 1}`}
                value={saved.fallbacks[i] ?? ""}
                options={models.filter((m) => m !== saved.primary)}
                allowEmpty
                onChange={(m) => {
                  const next = [...saved.fallbacks];
                  next[i] = m;
                  update({ fallbacks: [...new Set(next.filter(Boolean))] });
                }}
              />
            ))}
          </div>
          <p className="max-w-[60ch] text-[14px] leading-[1.5] text-text-2">
            Если основная модель упрётся в лимит или не ответит, интервью само продолжится на резервной.
          </p>
        </div>
      ) : (
        <div>
          <label className="block border-b border-line-strong focus-within:border-text-1">
            <span className="label mb-3 block">Ваш API‑ключ Gemini</span>
            <input
              type="password"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void verify())}
              placeholder="AIza…"
              autoComplete="off"
              spellCheck={false}
              className="block w-full bg-transparent pb-3 text-[17px] text-text-1 placeholder:text-text-2/60 [caret-color:var(--text-1)] focus:outline-none"
            />
          </label>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="label underline-offset-4 hover:text-text-1 hover:underline">
              Получить ключ в Google AI Studio ↗
            </a>
            <button
              type="button"
              onClick={verify}
              disabled={!draft.trim() || check.kind === "checking"}
              className="display bg-invert-bg px-6 py-4 text-[14px] font-semibold text-invert-text transition-opacity hover:opacity-85 disabled:opacity-40"
            >
              {check.kind === "checking" ? "Проверяю…" : "Проверить и сохранить"}
            </button>
          </div>
          {check.kind === "error" && (
            <p role="alert" className="mt-4 text-[14px] text-text-1">
              — {check.message}
            </p>
          )}
          <p className="mt-6 max-w-[60ch] text-[14px] leading-[1.5] text-text-2">
            Ключ хранится только в этом браузере и отправляется напрямую в Google. Сайт его не видит и никуда не пересылает.
          </p>
        </div>
      )}
    </div>
  );
});

function ModelSelect({
  label,
  value,
  options,
  onChange,
  allowEmpty = false,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <label className="block border-b border-line-strong focus-within:border-text-1">
      <span className="label mb-3 block">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full appearance-none bg-transparent pb-3 text-[16px] text-text-1 focus:outline-none [&>option]:bg-surface-1"
      >
        {allowEmpty && <option value="">— нет —</option>}
        {!options.includes(value) && value && <option value={value}>{value}</option>}
        {options.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </label>
  );
}
