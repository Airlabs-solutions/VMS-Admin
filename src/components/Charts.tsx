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
