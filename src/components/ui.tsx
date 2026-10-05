import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "../lib/cn";
import { statusClass } from "../lib/format";

const buttonStyles = cva(
  "inline-flex h-10 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium transition duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-60",
  {
    variants: {
      variant: {
        primary: "bg-brand text-white hover:bg-brand-strong active:bg-brand-deep",
        secondary: "border border-line bg-card text-ink hover:border-brand-mid hover:bg-canvas active:bg-brand-soft/20",
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
  "h-10 w-full rounded-md border border-line bg-card px-3 text-sm text-ink transition duration-200 ease-out outline-none placeholder:text-muted hover:border-brand-mid focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted";

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

export function Badge({ code, label }: { code?: string; label: string }) {
  return <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-medium", statusClass(code))}>{label}</span>;
}

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-lg border border-line bg-card shadow-[0_1px_2px_rgba(28,36,52,0.05)]", className)}>{children}</section>;
}

export function StateMessage({ children }: { children: string }) {
  return <p className="rounded-lg border border-line bg-card px-4 py-10 text-center text-sm text-muted">{children}</p>;
}

export function EmptyState({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-card px-6 py-10 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {detail ? <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted">{detail}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
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
          <thead className="bg-canvas text-xs tracking-wide text-muted uppercase">
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
