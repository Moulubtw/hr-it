import type { CSSProperties, ElementType } from "react";
import type { Tone } from "@/lib/session/options";

type Props = {
  text: string;
  as?: ElementType;
  tone?: Tone;
  /** Extra delay before the first word, in ms. */
  delay?: number;
  className?: string;
};

/**
 * Word-by-word reveal (PLAN.md §3.5). Each word rises out of its own mask;
 * the rude tone switches to short, hard hits. The whole sentence is exposed
 * once to assistive tech so screen readers don't read it word by word.
 */
export function KineticText({
  text,
  as: Tag = "p",
  tone = "polite",
  delay = 0,
  className,
}: Props) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <Tag
      data-tone={tone}
      className={className}
      style={{ "--delay": `${delay}ms`, "--n": words.length } as CSSProperties}
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((word, i) => (
          <span key={`${word}-${i}`}>
            <span className="kw-mask">
              <span className="kw" style={{ "--i": i } as CSSProperties}>
                {word}
              </span>
            </span>
            {i < words.length - 1 ? " " : null}
          </span>
        ))}
      </span>
    </Tag>
  );
}
