import { cn } from "@/lib/utils";

export type WeatherKind = "clear" | "partly" | "cloudy" | "fog" | "rain" | "snow" | "storm";

/** Open-Meteo weather code → the scene to draw. */
export function weatherKind(code: number): WeatherKind {
  if (code === 0) return "clear";
  if (code <= 2) return "partly";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "storm";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
  return "cloudy";
}

/** Soft background tint of the card for the weather and the time of day. */
export function weatherTint(kind: WeatherKind, night: boolean) {
  if (night && (kind === "clear" || kind === "partly")) {
    return "from-indigo-100/80 via-white to-slate-50 dark:from-indigo-500/20 dark:via-transparent dark:to-slate-500/5";
  }
  switch (kind) {
    case "clear":
    case "partly":
      return "from-amber-100/70 via-white to-sky-50 dark:from-amber-400/15 dark:via-transparent dark:to-sky-500/10";
    case "rain":
    case "storm":
      return "from-sky-100/80 via-white to-slate-100 dark:from-sky-500/15 dark:via-transparent dark:to-slate-500/10";
    case "snow":
      return "from-sky-50 via-white to-white dark:from-sky-300/10 dark:via-transparent dark:to-transparent";
    default:
      return "from-slate-100 via-white to-slate-50 dark:from-slate-400/10 dark:via-transparent dark:to-transparent";
  }
}

function Cloud({ x = 0, y = 0, scale = 1, className }: { x?: number; y?: number; scale?: number; className?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <g className={className}>
        <circle cx="18" cy="20" r="8" />
        <circle cx="29" cy="15" r="11" />
        <circle cx="40" cy="21" r="7.5" />
        <rect x="10" y="20" width="38" height="9" rx="4.5" />
      </g>
    </g>
  );
}

function Sun({ cx, cy, r = 9 }: { cx: number; cy: number; r?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 6} className="wx-glow fill-amber-300/60" />
      <g className="wx-spin stroke-amber-400" strokeWidth="2" strokeLinecap="round">
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return (
            <line
              key={i}
              x1={cx + Math.cos(a) * (r + 3)}
              y1={cy + Math.sin(a) * (r + 3)}
              x2={cx + Math.cos(a) * (r + 7)}
              y2={cy + Math.sin(a) * (r + 7)}
            />
          );
        })}
      </g>
      <circle cx={cx} cy={cy} r={r} className="fill-amber-400" />
    </g>
  );
}

function Moon({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      {[
        [12, 10, 0],
        [24, 34, 1.2],
        [70, 8, 0.6],
        [74, 38, 1.8],
        [8, 30, 2.3],
      ].map(([x, y, d], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={1.2}
          className="wx-twinkle fill-amber-300 dark:fill-amber-200"
          style={{ animationDelay: `${d}s` }}
        />
      ))}
      <circle cx={cx} cy={cy} r={13} className="wx-glow fill-indigo-300/40" />
      <path
        d={`M ${cx + 3} ${cy - 9} A 9 9 0 1 0 ${cx + 8} ${cy + 5} A 7 7 0 1 1 ${cx + 3} ${cy - 9} Z`}
        className="fill-amber-200 stroke-amber-300"
        strokeWidth="0.8"
      />
    </g>
  );
}

const cloudLight = "fill-white stroke-slate-200 dark:fill-slate-200 dark:stroke-slate-300";
const cloudGrey = "fill-slate-200 stroke-slate-300 dark:fill-slate-400 dark:stroke-slate-500";
const cloudDark = "fill-slate-400 stroke-slate-500 dark:fill-slate-500 dark:stroke-slate-600";

/** Small animated drawing of the current weather (80 × 48). Movements stop with « reduce motion ». */
export function WeatherScene({ kind, night, className }: { kind: WeatherKind; night: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 80 48" className={cn("h-12 w-20 shrink-0 overflow-visible", className)} aria-hidden>
      {kind === "clear" ? night ? <Moon cx={46} cy={22} /> : <Sun cx={44} cy={22} /> : null}

      {kind === "partly" ? (
        <>
          {night ? <Moon cx={40} cy={16} /> : <Sun cx={42} cy={15} r={7.5} />}
          <Cloud x={4} y={12} scale={0.95} className={cn("wx-drift", cloudLight)} />
        </>
      ) : null}

      {kind === "cloudy" ? (
        <>
          <Cloud x={26} y={2} scale={0.8} className={cn("wx-drift-slow", cloudGrey)} />
          <Cloud x={6} y={12} className={cn("wx-drift", cloudLight)} />
        </>
      ) : null}

      {kind === "fog" ? (
        <>
          <Cloud x={14} y={0} scale={0.85} className={cn("wx-drift-slow", cloudGrey)} />
          {[30, 36, 42].map((y, i) => (
            <line
              key={y}
              x1={12 + i * 4}
              x2={66 - i * 3}
              y1={y}
              y2={y}
              strokeWidth="3"
              strokeLinecap="round"
              className="wx-haze stroke-slate-300 dark:stroke-slate-500"
              style={{ animationDelay: `${i * 0.9}s` }}
            />
          ))}
        </>
      ) : null}

      {kind === "rain" || kind === "storm" ? (
        <>
          <g strokeWidth="1.8" strokeLinecap="round" className="stroke-sky-500 dark:stroke-sky-400">
            {[22, 30, 38, 46, 54].map((x, i) => (
              <line
                key={x}
                x1={x}
                y1={30}
                x2={x - 2}
                y2={36}
                className="wx-fall"
                style={{ animationDelay: `${(i * 0.23) % 1.1}s` }}
              />
            ))}
          </g>
          {kind === "storm" ? (
            <path
              d="M 40 26 L 33 38 L 39 38 L 35 47 L 46 33 L 40 33 L 44 26 Z"
              className="wx-flash fill-amber-400 stroke-amber-500"
              strokeWidth="0.8"
            />
          ) : null}
          <Cloud x={8} y={2} scale={1.05} className={cn("wx-drift", kind === "storm" ? cloudDark : cloudGrey)} />
        </>
      ) : null}

      {kind === "snow" ? (
        <>
          <g className="fill-sky-300 dark:fill-sky-200">
            {[20, 29, 38, 47, 56].map((x, i) => (
              <circle key={x} cx={x} cy={32} r={1.8} className="wx-snow" style={{ animationDelay: `${i * 0.6}s` }} />
            ))}
          </g>
          <Cloud x={8} y={2} scale={1.05} className={cn("wx-drift", cloudLight)} />
        </>
      ) : null}
    </svg>
  );
}
