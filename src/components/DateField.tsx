import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../lib/cn";

const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function parseKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function toKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function labelOf(value: string) {
  const date = parseKey(value);
  if (!date) return "Select date";
  return date.toLocaleDateString("en-GB");
}

function shiftMonth(year: number, month: number, delta: number) {
  return new Date(year, month + delta, 1);
}

export function DateField({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const selected = parseKey(value);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => selected ?? new Date());
  const [place, setPlace] = useState({ top: 0, left: 0, width: 304 });
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const todayKey = toKey(new Date());

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    const start = Math.min(now - 20, year);
    const end = Math.max(now + 30, year);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [year]);

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const lead = first.getDay();
    const count = new Date(year, month + 1, 0).getDate();
    const items: Date[] = [];
    for (let index = 0; index < lead; index += 1) items.push(new Date(year, month, index - lead + 1));
    for (let day = 1; day <= count; day += 1) items.push(new Date(year, month, day));
    while (items.length % 7 !== 0) items.push(new Date(year, month + 1, items.length - lead - count + 1));
    return items;
  }, [year, month]);

  function placePanel() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(304, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const height = 372;
    const below = rect.bottom + 6;
    const top = below + height > window.innerHeight - 8 && rect.top > height ? Math.max(8, rect.top - height - 6) : below;
    setPlace({ top, left, width });
  }

  function openPanel() {
    setCursor(selected ?? new Date());
    placePanel();
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function choose(date: Date) {
    onChange(toKey(date));
    setOpen(false);
    buttonRef.current?.focus();
  }

  function moveDay(date: Date, delta: number) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta);
    setCursor(new Date(next.getFullYear(), next.getMonth(), 1));
    window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLButtonElement>(`[data-date="${toKey(next)}"]`)?.focus();
    });
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-md border bg-card px-3 text-left text-sm transition duration-150 ease-out outline-none",
          invalid ? "border-status-danger" : "border-line hover:border-brand-mid",
          open && "border-brand ring-2 ring-brand/15",
          value ? "text-ink" : "text-muted",
        )}
        onClick={() => (open ? setOpen(false) : openPanel())}
      >
        <span className="truncate">{labelOf(value)}</span>
        <Calendar className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Choose date"
          style={{ top: place.top, left: place.left, width: place.width }}
          className="fixed z-40 rounded-lg border border-line bg-card p-3 shadow-[0_8px_24px_rgba(28,36,52,0.12)] motion-safe:animate-[rise_180ms_ease-out]"
        >
          <div className="mb-3 flex items-center gap-1">
            <button
              type="button"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink transition-colors duration-150 hover:bg-canvas"
              aria-label="Previous month"
              onClick={() => setCursor(shiftMonth(year, month, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <select
              aria-label="Month"
              className="h-8 min-w-0 flex-1 rounded-md border border-line bg-card px-2 text-sm text-ink outline-none focus:border-brand"
              value={month}
              onChange={(event) => setCursor(new Date(year, Number(event.target.value), 1))}
            >
              {months.map((name, index) => (
                <option key={name} value={index}>{name}</option>
              ))}
            </select>
            <select
              aria-label="Year"
              className="h-8 w-[5.5rem] rounded-md border border-line bg-card px-2 text-sm text-ink outline-none focus:border-brand"
              value={year}
              onChange={(event) => setCursor(new Date(Number(event.target.value), month, 1))}
            >
              {years.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <button
              type="button"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink transition-colors duration-150 hover:bg-canvas"
              aria-label="Next month"
              onClick={() => setCursor(shiftMonth(year, month, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {weekdays.map((day) => (
              <span key={day} className="py-1 text-[11px] font-medium tracking-wide text-muted uppercase">{day}</span>
            ))}
            {cells.map((date) => {
              const key = toKey(date);
              const inMonth = date.getMonth() === month;
              const active = key === value;
              const today = key === todayKey;
              return (
                <button
                  key={key}
                  type="button"
                  data-date={key}
                  aria-pressed={active}
                  aria-current={today ? "date" : undefined}
                  className={cn(
                    "h-8 rounded-md text-sm transition-colors duration-150 ease-out",
                    active ? "bg-brand font-medium text-white" : "hover:bg-brand-soft",
                    !active && inMonth && "text-ink",
                    !active && !inMonth && "text-muted",
                    !active && today && "ring-1 ring-brand ring-inset",
                  )}
                  onClick={() => choose(date)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowLeft") moveDay(date, -1);
                    if (event.key === "ArrowRight") moveDay(date, 1);
                    if (event.key === "ArrowUp") moveDay(date, -7);
                    if (event.key === "ArrowDown") moveDay(date, 7);
                    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) event.preventDefault();
                  }}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-line pt-2">
            <button
              type="button"
              className="h-8 rounded-md px-2 text-sm font-medium text-brand-deep transition-colors duration-150 hover:bg-brand/10"
              onClick={() => choose(new Date())}
            >
              Today
            </button>
            <button
              type="button"
              className="h-8 rounded-md px-2 text-sm text-muted transition-colors duration-150 hover:bg-canvas hover:text-ink disabled:opacity-40"
              disabled={!value}
              onClick={() => {
                onChange("");
                setOpen(false);
                buttonRef.current?.focus();
              }}
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
