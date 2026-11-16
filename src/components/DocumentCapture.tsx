import { useState } from "react";
import { ApiError, api } from "../lib/api";
import { linkClass } from "./ui";

type ReadPayload = {
  file: { id: string; name: string };
  found?: boolean;
  notice: string;
  fields: Record<string, string>;
};

export function DocumentCapture({
  kind,
  vehicleId,
  title,
  description,
  buttonLabel,
  onRead,
}: {
  kind: "istimara" | "insurance" | "driver_license";
  vehicleId?: string;
  title?: string;
  description?: string;
  buttonLabel?: string;
  onRead: (fileId: string, fields: Record<string, string>) => void;
}) {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [found, setFound] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const defaultTitle =
    kind === "driver_license"
      ? "Driver License / Iqama OCR Scan"
      : kind === "insurance"
        ? "Insurance Policy Copy OCR Scan"
        : "Istimara Copy OCR Scan";

  const defaultDesc =
    kind === "driver_license"
      ? "Upload Driver License or Iqama (JPG, PNG, or PDF, up to 10 MB) to auto-fill driver fields via OCR. You can also enter or edit all fields manually below."
      : kind === "insurance"
        ? "Upload Insurance Copy (JPG, PNG, or PDF, up to 10 MB) to auto-fill policy dates and details via OCR. You can also enter or edit all fields manually below."
        : "Upload a JPG, PNG, or PDF, up to 10 MB. The form stays open for manual entry if the document cannot be read.";

  async function onFile(file: File | null) {
    if (!file) return;
    const allowed =
      ["image/jpeg", "image/png", "application/pdf"].includes(file.type) ||
      /\.(jpe?g|png|pdf)$/i.test(file.name);
    if (!allowed || file.size > 10 * 1024 * 1024) {
      setError("Use a JPG, PNG, or PDF, up to 10 MB.");
      setNotice("");
      setFound(null);
      return;
    }
    setPending(true);
    setError("");
    setNotice("");
    setFound(null);
    setName(file.name);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", kind);
      if (vehicleId) body.append("vehicleId", vehicleId);
      const result = await api<{ data: ReadPayload }>("/documents/read", { method: "POST", form: body });
      setNotice(result.data.notice);
      setFound(Boolean(result.data.found));
      onRead(result.data.file.id, result.data.fields);
    } catch (err) {
      setNotice("");
      setFound(false);
      setError(
        err instanceof ApiError
          ? `${err.message}. You can enter the details manually below.`
          : "OCR could not read this document. Please enter the details manually below.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-brand-mid bg-brand-soft/40 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{title || defaultTitle}</p>
          <p className="mt-0.5 text-xs leading-5 text-muted">{description || defaultDesc}</p>
        </div>
        <label className="inline-flex h-9 shrink-0 cursor-pointer items-center rounded-md bg-brand px-3.5 text-xs font-semibold text-ink transition-colors hover:bg-brand-strong">
          {pending ? "Running OCR..." : buttonLabel || "Upload & Extract (OCR)"}
          <input
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
            disabled={pending}
            onChange={(event) => {
              void onFile(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      {name ? <p className="mt-2 text-xs font-medium text-ink">Attached file: {name}</p> : null}
      {notice ? (
        <p className={`mt-1.5 text-xs font-medium ${found ? "text-brand-deep" : "text-status-warn"}`}>
          {notice}
        </p>
      ) : null}
      {error ? <p className="mt-1.5 text-xs font-medium text-status-danger">{error}</p> : null}
    </div>
  );
}

export function DocumentLink({ id }: { id: string }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className={linkClass}
      disabled={pending}
      onClick={() => {
        setPending(true);
        void api<{ data: { url: string } }>(`/files/${id}/url`)
          .then((result) => window.open(result.data.url, "_blank", "noopener,noreferrer"))
          .finally(() => setPending(false));
      }}
    >
      {pending ? "Opening..." : "View"}
    </button>
  );
}
