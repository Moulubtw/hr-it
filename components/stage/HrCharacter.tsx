/**
 * Monochrome HR interviewer under a single beam (PLAN.md §3.4).
 * Flat vector shapes, square glasses, no gradients on the figure itself.
 * The face changes per state; motion lives in globals.css (`.hr-*`).
 */

export type HrState = "listening" | "thinking" | "nodding" | "skeptical" | "annoyed";

const MOUTH: Record<HrState, string> = {
  listening: "M109 183 L131 183",
  thinking: "M113 184 L127 184",
  nodding: "M107 181 Q120 190 133 181",
  skeptical: "M108 186 L132 181",
  annoyed: "M107 187 Q120 179 133 187",
};

// [left brow, right brow]
const BROWS: Record<HrState, [string, string]> = {
  listening: ["M88 131 L111 131", "M129 131 L152 131"],
  thinking: ["M88 128 L111 130", "M129 130 L152 128"],
  nodding: ["M88 130 L111 129", "M129 129 L152 130"],
  skeptical: ["M88 132 L111 132", "M129 126 L152 122"],
  annoyed: ["M88 127 L111 134", "M129 134 L152 127"],
};

export function HrCharacter({ state, className = "" }: { state: HrState; className?: string }) {
  const [lb, rb] = BROWS[state];
  return (
    <svg
      viewBox="0 0 240 320"
      role="img"
      aria-label={`Интервьюер: ${LABELS[state]}`}
      data-state={state}
      className={`hr ${className}`}
    >
      <g className="hr-body">
        {/* torso */}
        <path
          d="M18 320 C22 252 68 230 120 228 C172 230 218 252 222 320 Z"
          fill="var(--surface-2)"
          stroke="var(--line-strong)"
          strokeWidth="1.5"
        />
        <path d="M98 230 L120 266 L142 230" fill="none" stroke="var(--text-2)" strokeWidth="1.5" />
        <path d="M120 266 L120 320" stroke="var(--line-strong)" strokeWidth="1.5" />
        {/* neck */}
        <rect x="106" y="194" width="28" height="38" fill="var(--surface-2)" stroke="var(--line-strong)" strokeWidth="1.5" />

        <g className="hr-head">
          <ellipse cx="120" cy="150" rx="46" ry="56" fill="var(--surface-1)" stroke="var(--line-strong)" strokeWidth="1.5" />
          {/* hair */}
          <path
            d="M73 146 C68 100 96 86 122 87 C152 88 174 106 168 146 C160 122 142 112 120 113 C99 113 82 124 73 146 Z"
            fill="#070707"
            stroke="var(--line-strong)"
            strokeWidth="1.5"
          />
          {/* glasses */}
          <g fill="none" stroke="var(--text-1)" strokeWidth="2">
            <rect x="86" y="139" width="27" height="17" />
            <rect x="127" y="139" width="27" height="17" />
            <path d="M113 146 L127 146" />
          </g>
          {/* eyes */}
          <g className="hr-eyes" fill="var(--text-1)">
            <rect x="97" y="145" width="5" height="5" />
            <rect x="138" y="145" width="5" height="5" />
          </g>
          {/* brows */}
          <g fill="none" stroke="var(--text-1)" strokeWidth="2.5" strokeLinecap="square">
            <path className="hr-brow" d={lb} />
            <path className="hr-brow" d={rb} />
          </g>
          <path className="hr-mouth" d={MOUTH[state]} fill="none" stroke="var(--text-1)" strokeWidth="2" />
        </g>
      </g>

      {/* desk edge with a notepad */}
      <rect x="0" y="292" width="240" height="28" fill="var(--bg)" />
      <path d="M0 292 L240 292" stroke="var(--text-2)" strokeWidth="1.5" />
      <rect x="146" y="280" width="54" height="12" fill="var(--text-1)" />
      <path d="M152 286 L190 286" stroke="var(--invert-text)" strokeWidth="1" />
    </svg>
  );
}

const LABELS: Record<HrState, string> = {
  listening: "слушает",
  thinking: "думает",
  nodding: "одобрительно кивает",
  skeptical: "сомневается",
  annoyed: "раздражён",
};
