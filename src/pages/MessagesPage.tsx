import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button, Field, PageHeader, SelectInput, StateMessage, TextArea, TextInput } from "../components/ui";
import { ApiError, api } from "../lib/api";
import type { ListResponse } from "../types";

type DriverOption = { id: string; name: string };
type Message = {
  id: string;
  driverId: string;
  driverName: string;
  body: string;
  fileIds: string[];
  delivered?: boolean;
  createdAt: string | null;
};

const empty = { driverId: "", body: "", fileIds: [] as string[] };

function formatWhen(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function uploadDocument(file: File) {
  const body = new FormData();
  body.append("file", file);
  body.append("module", "messages");
  const uploaded = await api<{ data: { id: string } }>("/files", { method: "POST", form: body });
  return uploaded.data.id;
}

export function MessagesPage() {
  const client = useQueryClient();
  const [form, setForm] = useState(empty);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [editingId, setEditingId] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [driverFilter, setDriverFilter] = useState("");
  const [confirmId, setConfirmId] = useState("");

  const drivers = useQuery({
    queryKey: ["driver-options"],
    queryFn: () => api<ListResponse<DriverOption>>("/drivers?limit=500"),
  });
  const messages = useQuery({
    queryKey: ["messages"],
    queryFn: () => api<{ data: Message[] }>("/messages"),
  });

  const save = useMutation({
    mutationFn: async () => {
      const uploaded = await Promise.all(newFiles.map((file) => uploadDocument(file)));
      const payload = {
        driverId: form.driverId,
        body: form.body.trim(),
        fileIds: [...form.fileIds, ...uploaded],
      };
      if (editingId) return api<{ data: Message }>(`/messages/${editingId}`, { method: "PATCH", body: payload });
      return api<{ data: Message }>("/messages", { method: "POST", body: payload });
    },
    onSuccess: async (result) => {
      const edited = Boolean(editingId);
      setForm(empty);
      setNewFiles([]);
      setEditingId("");
      setError("");
      if (edited) setNote("Message updated.");
      else setNote(result.data.delivered ? "Message sent to the driver." : "Message saved. SMS delivery did not complete.");
      await client.invalidateQueries({ queryKey: ["messages"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not save the message"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/messages/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setConfirmId("");
      if (confirmId === editingId) {
        setEditingId("");
        setForm(empty);
        setNewFiles([]);
      }
      await client.invalidateQueries({ queryKey: ["messages"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not delete the message"),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNote("");
    if (!form.driverId) {
      setError("Select a driver");
      return;
    }
    if (!form.body.trim() && form.fileIds.length === 0 && newFiles.length === 0) {
      setError("Write a message or add a document");
      return;
    }
    save.mutate();
  }

  function startEdit(message: Message) {
    setEditingId(message.id);
    setForm({ driverId: message.driverId, body: message.body, fileIds: message.fileIds ?? [] });
    setNewFiles([]);
    setError("");
    setNote("");
    setConfirmId("");
  }

  function cancelEdit() {
    setEditingId("");
    setForm(empty);
    setNewFiles([]);
    setError("");
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (messages.data?.data ?? []).filter((message) => {
      if (driverFilter && message.driverId !== driverFilter) return false;
      if (!term) return true;
      return `${message.driverName} ${message.body}`.toLowerCase().includes(term);
    });
  }, [messages.data, search, driverFilter]);

  const filtersOn = Boolean(search || driverFilter);

  return (
    <div>
      <PageHeader title="Messages" />
      <form onSubmit={onSubmit} className="mb-4 rounded-md border border-line bg-card p-4">
        <h2 className="text-base font-semibold">{editingId ? "Edit message" : "New message"}</h2>
        <p className="mt-1 text-sm text-muted">
          {editingId
            ? "Saving updates this message. It does not send another SMS."
            : "The text is sent by SMS. Documents stay on this message."}
        </p>
        <div className="mt-4 grid gap-3">
          <Field label="Driver">
            <SelectInput value={form.driverId} onChange={(event) => setForm({ ...form, driverId: event.target.value })}>
              <option value="">Select a driver</option>
              {drivers.data?.data.map((driver) => (
                <option key={driver.id} value={driver.id}>{driver.name}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Message">
            <TextArea value={form.body} maxLength={500} placeholder="Write the message" onChange={(event) => setForm({ ...form, body: event.target.value })} />
          </Field>
          <div>
            <p className="text-sm font-medium">Documents</p>
            <p className="mt-1 text-xs text-muted">Images, PDF, and other documents, up to 10 MB each.</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {form.fileIds.map((id) => (
                <DocThumb key={id} fileId={id} onRemove={() => setForm({ ...form, fileIds: form.fileIds.filter((item) => item !== id) })} />
              ))}
              {newFiles.map((file, index) => (
                <LocalDoc key={`${file.name}-${file.size}-${index}`} file={file} onRemove={() => setNewFiles(newFiles.filter((_, item) => item !== index))} />
              ))}
            </div>
            <label className="mt-3 inline-flex cursor-pointer items-center rounded-md border border-line bg-card px-3 py-2 text-sm">
              Add documents
              <input
                className="sr-only"
                type="file"
                multiple
                onChange={(event) => {
                  setNewFiles((current) => [...current, ...Array.from(event.target.files ?? [])]);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-status-danger">{error}</p> : null}
        {note ? <p className="mt-3 text-sm text-muted">{note}</p> : null}
        <div className="mt-4 flex gap-2">
          <Button disabled={save.isPending}>{save.isPending ? "Saving..." : editingId ? "Save changes" : "Send message"}</Button>
          {editingId ? <Button type="button" variant="secondary" onClick={cancelEdit}>Cancel</Button> : null}
        </div>
      </form>

      <div className="mb-4 rounded-md border border-line bg-card p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Search">
            <TextInput placeholder="Driver or message" value={search} onChange={(event) => setSearch(event.target.value)} />
          </Field>
          <Field label="Driver">
            <SelectInput value={driverFilter} onChange={(event) => setDriverFilter(event.target.value)}>
              <option value="">All drivers</option>
              {drivers.data?.data.map((driver) => (
                <option key={driver.id} value={driver.id}>{driver.name}</option>
              ))}
            </SelectInput>
          </Field>
        </div>
        <div className="mt-3 flex items-center justify-between text-sm">
          <p className="text-muted">{filtered.length} {filtered.length === 1 ? "message" : "messages"}</p>
          {filtersOn ? (
            <button type="button" className="text-accent" onClick={() => { setSearch(""); setDriverFilter(""); }}>Clear filters</button>
          ) : null}
        </div>
      </div>

      {messages.isLoading ? <StateMessage>Loading messages...</StateMessage> : null}
      {messages.isError ? <StateMessage>Could not load messages.</StateMessage> : null}
      {messages.data && filtered.length === 0 ? (
        <StateMessage>{messages.data.data.length === 0 ? "No messages yet." : "No messages match these filters."}</StateMessage>
      ) : null}
      <ul className="space-y-3">
        {filtered.map((message) => (
          <li key={message.id} className="rounded-md border border-line bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{message.driverName}</p>
                <p className="mt-1 text-sm text-muted">{formatWhen(message.createdAt)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => startEdit(message)}>Edit</Button>
                {confirmId === message.id ? (
                  <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate(message.id)}>
                    {remove.isPending ? "Deleting..." : "Confirm delete"}
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => setConfirmId(message.id)}>Delete</Button>
                )}
              </div>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm">{message.body || "Document only"}</p>
            {(message.fileIds ?? []).length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-3">
                {message.fileIds.map((id) => <DocThumb key={id} fileId={id} />)}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LocalDoc({ file, onRemove }: { file: File; onRemove: () => void }) {
  const preview = useMemo(() => (file.type.startsWith("image/") ? URL.createObjectURL(file) : ""), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  return (
    <div className="w-28">
      <div className="flex h-24 items-center justify-center overflow-hidden rounded-md border border-line bg-canvas p-2 text-center text-xs">
        {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : file.name}
      </div>
      <button type="button" className="mt-1 text-xs text-status-danger" onClick={onRemove}>Remove</button>
    </div>
  );
}

function DocThumb({ fileId, onRemove }: { fileId: string; onRemove?: () => void }) {
  const file = useQuery({
    queryKey: ["file-url", fileId],
    queryFn: () => api<{ data: { url: string } }>(`/files/${fileId}/url`),
  });
  const url = file.data?.data.url;
  return (
    <div className="w-28">
      <a href={url ?? "#"} target="_blank" rel="noreferrer" className="block h-24 overflow-hidden rounded-md border border-line bg-canvas">
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-xs text-muted">Open</span>}
      </a>
      {onRemove ? <button type="button" className="mt-1 text-xs text-status-danger" onClick={onRemove}>Remove</button> : null}
    </div>
  );
}
