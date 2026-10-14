import { useEffect, useState } from "react";

export type ChartItem = { label: string; value: number; color: string };

function useDraw() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setReady(true);
      return;
    }
    const id = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(id);
  }, []);
  return ready;
}

export function BarChart({ items }: { items: ChartItem[] }) {
  const ready = useDraw();
  const max = Math.max(1, ...items.map((item) => item.value));

  if (items.every((item) => item.value === 0)) {
    return <p className="text-sm text-muted">Nothing to chart for this period.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const width = Math.round((item.value / max) * 100);
        return (
          <div key={item.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-[13px]">
              <span className="text-ink">{item.label}</span>
              <span className="font-medium text-muted">{item.value}</span>
            </div>
            <div className="h-2 rounded-md bg-canvas">
              <div
                className="h-2 rounded-md transition-[width] duration-300 ease-out"
                style={{ width: ready ? `${width}%` : "0%", background: item.color }}
                title={`${item.label}: ${item.value}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DonutChart({ items }: { items: ChartItem[] }) {
  const ready = useDraw();
  const shown = items.filter((item) => item.value > 0);
  const total = shown.reduce((sum, item) => sum + item.value, 0);
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  let cursor = 0;

  if (total === 0) {
    return <p className="text-sm text-muted">No costs recorded this month.</p>;
  }

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <svg viewBox="0 0 100 100" className="h-36 w-36 shrink-0" role="img" aria-label="Cost mix">
        <circle cx="50" cy="50" r={radius} fill="none" className="stroke-canvas" strokeWidth="12" />
        {shown.map((item) => {
          const length = (item.value / total) * circumference;
          const dash = ready ? `${length} ${circumference - length}` : `0 ${circumference}`;
          const node = (
            <circle
              key={item.label}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth="12"
              strokeDasharray={dash}
              strokeDashoffset={-cursor}
              strokeLinecap="butt"
              transform="rotate(-90 50 50)"
              className="transition-[stroke-dasharray] duration-300 ease-out"
            >
              <title>{`${item.label}: ${item.value}`}</title>
            </circle>
          );
          cursor += length;
          return node;
        })}
      </svg>
      <ul className="w-full space-y-2 text-sm">
        {shown.map((item) => (
          <li key={item.label} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: item.color }} />
              <span className="truncate text-ink">{item.label}</span>
            </span>
            <span className="font-medium text-muted">{Math.round((item.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ColumnChart({
  items,
  formatValue = (value) => value.toLocaleString("en-US"),
  formatAxis,
}: {
  items: ChartItem[];
  formatValue?: (value: number) => string;
  formatAxis?: (value: number) => string;
}) {
  const ready = useDraw();
  const axis = formatAxis ?? formatValue;
  const max = Math.max(1, ...items.map((item) => item.value));
  const peak = items.reduce((best, item, index) => (item.value > items[best].value ? index : best), 0);
  const ticks = [max, max / 2, 0];

  if (items.length === 0 || items.every((item) => item.value === 0)) {
    return <p className="flex h-48 items-center text-sm text-muted">Nothing to chart for this period.</p>;
  }

  return (
    <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2">
      <div className="flex h-40 flex-col justify-between text-right text-[11px] text-muted tabular-nums">
        {ticks.map((tick) => (
          <span key={tick}>{axis(tick)}</span>
        ))}
      </div>
      <div className="flex h-40 items-stretch gap-1.5 border-b border-line">
        {items.map((item, index) => {
          const height = item.value === 0 ? 4 : Math.max(8, Math.round((item.value / max) * 100));
          const hot = index === peak && item.value > 0;
          return (
            <div key={item.label} className="relative h-full min-w-0 flex-1">
              <div className="group absolute inset-x-0 bottom-0 flex justify-center" style={{ height: ready ? `${height}%` : "0%", transition: "height 300ms ease-out" }}>
                <button
                  type="button"
                  className="flex h-full w-full max-w-8 flex-col overflow-hidden rounded-md"
                  aria-label={`${item.label}: ${formatValue(item.value)}`}
                >
                  {hot ? (
                    <>
                      <span className="h-[10%] bg-[#f6f543]" />
                      <span className="min-h-0 flex-1 bg-[#a8d95b]" />
                      <span className="h-[26%] bg-[#ffb765]" />
                    </>
                  ) : (
                    <span className="h-full w-full bg-[#e8e8e8] group-hover:bg-[#dedede]" />
                  )}
                </button>
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-max -translate-x-1/2 rounded-md border border-line bg-card px-2.5 py-2 text-left shadow-[0_8px_24px_rgba(17,22,16,0.08)] group-hover:block group-focus-within:block">
                  <span className="block text-[11px] text-muted">{item.label}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-ink tabular-nums">
                    <span className="h-2 w-2 rounded-sm bg-[#a8d95b]" />
                    {formatValue(item.value)}
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div />
      <div className="mt-2 flex gap-1.5">
        {items.map((item) => (
          <span key={item.label} title={item.label} className="min-w-0 flex-1 text-center text-[10px] leading-3 text-muted">
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Gauge({ value, caption }: { value: number; caption: string }) {
  const ready = useDraw();
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const radius = 42;
  const length = Math.PI * radius;
  const shown = ready ? (clamped / 100) * length : 0;
  const d = "M 16 62 A 42 42 0 0 1 100 62";

  return (
    <figure className="mx-auto w-full max-w-[220px]">
      <div className="relative">
        <svg viewBox="0 0 120 78" className="w-full" role="img" aria-label={`${clamped}% ${caption}`}>
          <defs>
            <linearGradient id="fleet-health-gauge" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#c8e86d" />
              <stop offset="55%" stopColor="#a8d95b" />
              <stop offset="100%" stopColor="#79a857" />
            </linearGradient>
          </defs>
          <path d={d} fill="none" stroke="var(--color-line)" strokeWidth="10" strokeLinecap="round" />
          <path
            d={d}
            fill="none"
            stroke="url(#fleet-health-gauge)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${shown} ${length}`}
            className="transition-[stroke-dasharray] duration-300 ease-out"
          />
        </svg>
        <figcaption className="absolute inset-x-0 bottom-0 text-center">
          <span className="block text-3xl font-semibold tracking-tight text-ink tabular-nums">{clamped}%</span>
          <span className="mt-1 block text-[11px] text-muted">{caption}</span>
        </figcaption>
      </div>
    </figure>
  );
}
