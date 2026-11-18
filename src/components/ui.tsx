import { cva, type VariantProps } from "class-variance-authority";
import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "../lib/cn";
import { statusClass } from "../lib/format";

const buttonStyles = cva(
  "inline-flex h-10 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium transition duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-60",
  {
    variants: {
      variant: {
        primary: "bg-brand text-white hover:bg-brand-strong active:bg-brand-strong",
        secondary: "border border-line bg-card text-ink hover:border-brand hover:bg-brand-soft",
        danger: "bg-status-danger text-white hover:opacity-90",
        ghost: "text-ink hover:bg-canvas",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

export function Button({
  className,
  variant,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonStyles>) {
  return <button className={cn(buttonStyles({ variant }), className)} {...props} />;
}

export const controlClass =
  "h-10 w-full rounded-md border border-line bg-card px-3 text-sm text-ink transition duration-200 ease-out outline-none placeholder:text-muted hover:border-brand-mid focus:border-brand focus:ring-2 focus:ring-brand/30 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted";

export const linkClass = "font-medium text-brand-deep hover:text-ink";

export const surfaceClass = "rounded-lg border border-line bg-card p-4 shadow-[0_1px_2px_rgba(17,22,16,0.04)]";

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-ink">{label}</span>
      {children}
      {error ? <span className="text-xs text-status-danger">{error}</span> : null}
      {hint && !error ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, className)} {...props} />;
}

export function SelectInput({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(controlClass, className)} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClass, "h-auto min-h-24 py-2", className)} {...props} />;
}

const COUNTRY_CODES = [
  { code: "+966", label: "SA +966" },
  { code: "+971", label: "AE +971" },
  { code: "+965", label: "KW +965" },
  { code: "+973", label: "BH +973" },
  { code: "+974", label: "QA +974" },
  { code: "+968", label: "OM +968" },
  { code: "+20", label: "EG +20" },
  { code: "+91", label: "IN +91" },
  { code: "+92", label: "PK +92" },
  { code: "+63", label: "PH +63" },
  { code: "+880", label: "BD +880" },
  { code: "+977", label: "NP +977" },
  { code: "+44", label: "GB +44" },
  { code: "+1", label: "US +1" },
];

const SORTED_COUNTRY_CODES = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);

function splitPhone(value: string, fallbackCode: string): { code: string; local: string } {
  const trimmed = value.trim();
  if (!trimmed) return { code: fallbackCode, local: "" };
  const compact = trimmed.startsWith("00") ? `+${trimmed.slice(2)}` : trimmed;
  if (compact.startsWith("+")) {
    const match = SORTED_COUNTRY_CODES.find((item) => compact.startsWith(item.code));
    if (match) {
      return { code: match.code, local: compact.slice(match.code.length).trimStart() };
    }
  }
  if (compact.startsWith("05")) {
    return { code: "+966", local: compact.slice(1) };
  }
  return { code: fallbackCode, local: trimmed };
}

export function PhoneInput({
  value,
  onChange,
  className,
  placeholder,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
}) {
  const [selectedCode, setSelectedCode] = useState("+966");
  const { code, local } = splitPhone(value, selectedCode);

  function handleCodeChange(nextCode: string) {
    setSelectedCode(nextCode);
    const digits = local.replace(/[^\d]/g, "");
    if (digits) onChange(`${nextCode}${digits}`);
  }

  function handleLocalChange(nextLocal: string) {
    const cleaned = nextLocal.replace(/[^\d\s-]/g, "");
    const digits = cleaned.replace(/[^\d]/g, "");
    if (!digits) {
      onChange("");
      return;
    }
    const normalized = code === "+966" && digits.startsWith("0") && digits.length > 1 ? digits.slice(1) : digits;
    onChange(`${code}${normalized}`);
  }

  return (
    <div className="flex gap-2">
      <select
        aria-label="Country code"
        value={code}
        onChange={(event) => handleCodeChange(event.target.value)}
        className="h-10 w-[108px] shrink-0 rounded-md border border-line bg-card px-2.5 text-sm text-ink transition duration-200 ease-out outline-none hover:border-brand-mid focus:border-brand focus:ring-2 focus:ring-brand/30"
      >
        {COUNTRY_CODES.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </select>
      <input
        {...props}
        type="tel"
        inputMode="tel"
        value={local}
        placeholder={placeholder ?? (code === "+966" ? "5X XXX XXXX" : "Mobile number")}
        onChange={(event) => handleLocalChange(event.target.value)}
        className={cn(controlClass, className)}
      />
    </div>
  );
}

export function Badge({ code, label }: { code?: string; label: string }) {
  return <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-medium", statusClass(code))}>{label}</span>;
}

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[1.65rem] leading-tight font-semibold tracking-tight text-brand-deep">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function Tabs({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label={label}>
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={cn(
              "h-9 shrink-0 rounded-md px-3 text-sm font-medium transition duration-150",
              selected ? "bg-brand text-white" : "border border-line bg-card text-ink hover:border-brand hover:bg-brand-soft",
            )}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-lg border border-line bg-card shadow-[0_1px_2px_rgba(17,22,16,0.04)]", className)}>{children}</section>;
}

export function StateMessage({ children }: { children: string }) {
  return <p className="rounded-lg border border-line bg-card px-4 py-10 text-center text-sm text-muted">{children}</p>;
}

export function EmptyState({ icon, title, detail, action }: { icon?: ReactNode; title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-card px-6 py-14 text-center">
      {icon ? (
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-lg bg-brand-soft text-brand">
          {icon}
        </div>
      ) : null}
      <p className="text-base font-semibold text-brand-deep">{title}</p>
      {detail ? <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-muted">{detail}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title, detail, onRetry }: { title: string; detail?: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-line bg-card px-6 py-10 text-center" role="alert">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {detail ? <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted">{detail}</p> : null}
      {onRetry ? (
        <Button className="mt-4" variant="secondary" type="button" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-line", className)} aria-hidden="true" />;
}

export function DataTable({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-card px-4 py-10 text-center text-sm text-muted">No records.</div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-card">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
          <thead className="bg-brand-soft text-xs tracking-wide text-brand-deep uppercase">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-4 py-3 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-t border-line transition-colors duration-150 ease-out hover:bg-canvas">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-4 py-3 align-middle">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-line md:hidden">
        {rows.map((row, index) => (
          <div key={index} className="space-y-2 px-4 py-3">
            {columns.map((column, cellIndex) => (
              <div key={column} className="flex items-start justify-between gap-3 text-sm">
                <span className="shrink-0 text-xs font-medium tracking-wide text-muted uppercase">{column}</span>
                <span className="min-w-0 text-right text-ink">{row[cellIndex]}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
