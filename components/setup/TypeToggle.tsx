"use client";

import { useId } from "react";

type Option<T extends string> = { id: T; label: string };

type Props<T extends string> = {
  name: string;
  legend: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  hint?: string;
};

/**
 * Big typographic radio group (PLAN.md §3.6): words in a row, the chosen
 * one inverted, the rest dimmed. Native radios keep arrow-key navigation
 * and screen-reader semantics.
 */
export function TypeToggle<T extends string>({ name, legend, options, value, onChange, hint }: Props<T>) {
  const hintId = useId();
  return (
    <fieldset aria-describedby={hint ? hintId : undefined}>
      <legend className="sr-only">{legend}</legend>
      <div className="flex flex-wrap items-baseline gap-x-1 gap-y-2">
        {options.map((o, i) => {
          const checked = o.id === value;
          return (
            <label key={o.id} className="group relative cursor-pointer">
              <input
                type="radio"
                name={name}
                value={o.id}
                checked={checked}
                onChange={() => onChange(o.id)}
                className="peer sr-only"
              />
              <span
                className={`display inline-block px-2 py-1 text-[clamp(22px,3.3vw,46px)] font-semibold transition-colors duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-text-1 ${
                  checked
                    ? "bg-invert-bg text-invert-text"
                    : "text-text-2/70 group-hover:text-text-1"
                }`}
              >
                {o.label}
              </span>
              {i < options.length - 1 && (
                <span aria-hidden className="display ml-1 text-[clamp(22px,3.3vw,46px)] text-line-strong">
                  ·
                </span>
              )}
            </label>
          );
        })}
      </div>
      {hint && (
        <p id={hintId} className="mt-5 max-w-[52ch] text-[15px] leading-[1.5] text-text-2" aria-live="polite">
          {hint}
        </p>
      )}
    </fieldset>
  );
}
