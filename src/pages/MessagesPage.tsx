import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, FileText, Folder, Mic, Paperclip, Search, Send, Square, Users, X } from "lucide-react";
import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api } from "../lib/api";
import { cn } from "../lib/cn";
import type { ListResponse } from "../types";

type DriverOption = {
  id: string;
  name: string;
  photoUrl?: string | null;
  status?: { code: string; label: string };
};

type Message = {
  id: string;
  driverId: string;
  driverName: string;
  senderRole?: "admin" | "driver";
  body: string;
  fileIds: string[];
  broadcastId?: string | null;
  unread?: boolean;
  delivered?: boolean | number;
  sent?: number;
  createdAt: string | null;
};

type FileMeta = { url: string; mime?: string; name?: string };

const ALL = "all";
const MAX_BYTES = 10 * 1024 * 1024;
const EDIT_MS = 2 * 60 * 1000;

function canEditMessage(createdAt: string | null, now: number) {
  if (!createdAt) return false;
  const sent = new Date(createdAt).getTime();
  if (Number.isNaN(sent)) return false;
  return now - sent < EDIT_MS;
}

function formatWhen(value: string | null, withDate = false) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", day: "2-digit", month: "2-digit", year: "numeric" });
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" });
  const today = day.format(new Date());
  if (!withDate && day.format(date) === today) return time.format(date);
  return `${day.format(date)} ${time.format(date)}`;
}

function preview(message: Message | undefined) {
  if (!message) return "No messages yet";
  if (message.body.trim()) return message.body.trim();
  if (message.fileIds?.length) return "Attachment";
  return "No messages yet";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "D";
}

function fileAllowed(file: File) {
  if (file.size > MAX_BYTES) return "Each file must be 10 MB or smaller.";
  const name = file.name.toLowerCase();
  const ok = /\.(jpe?g|png|pdf|webm|ogg|mp3|m4a|wav|aac)$/.test(name);
  if (!ok) return "Use a JPG, PNG, PDF, or a voice note.";
  return "";
}

async function uploadDocument(file: File) {
  const body = new FormData();
  body.append("file", file);
  body.append("module", "messages");
  const uploaded = await api<{ data: { id: string } }>("/files", { method: "POST", form: body });
  return uploaded.data.id;
}

function Avatar({ name, photoUrl, size = "md" }: { name: string; photoUrl?: string | null; size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-11 w-11 text-sm" : "h-10 w-10 text-xs";
  if (photoUrl) {
    return <img src={photoUrl} alt="" className={cn(box, "rounded-md object-cover")} />;
  }
  return <span className={cn(box, "grid place-items-center rounded-md bg-brand font-semibold text-ink")}>{initials(name)}</span>;
}

function ChatFile({ fileId, card = false }: { fileId: string; card?: boolean }) {
  const file = useQuery({
    queryKey: ["file-url", fileId],
    queryFn: () => api<{ data: FileMeta }>(`/files/${fileId}/url`),
    staleTime: 10 * 60 * 1000,
  });
  const data = file.data?.data;
  if (!data?.url) {
    return <span className="text-xs text-muted">{file.isError ? "File unavailable" : "Loading file..."}</span>;
  }
  const audio = data.mime?.startsWith("audio/") || /\.(webm|ogg|mp3|m4a|wav|aac)$/i.test(data.name ?? "");
  const image = data.mime?.startsWith("image/") || /\.(jpe?g|png|gif|webp)$/i.test(data.name ?? "");
  if (audio) {
    return (
      <div className={cn(card && "rounded-md border border-line bg-card p-3")}>
        <p className="mb-2 text-xs font-medium text-muted">Voice note</p>
        <audio controls src={data.url} className="h-9 w-full max-w-xs" />
      </div>
    );
  }
  if (image) {
    return (
      <a href={data.url} target="_blank" rel="noreferrer" className={cn(card && "block overflow-hidden rounded-md border border-line bg-card")}>
        <img src={data.url} alt={data.name || "Photo"} className={cn("object-cover", card ? "h-36 w-full" : "max-h-52 rounded-md")} />
      </a>
    );
  }
  return (
    <a href={data.url} target="_blank" rel="noreferrer" className={cn("inline-flex items-center gap-2 text-sm font-medium text-brand-deep", card && "rounded-md border border-line bg-card p-3")}>
      <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{data.name || "Open file"}</span>
    </a>
  );
}

export function MessagesPage() {
  const client = useQueryClient();
  const threadRef = useRef<HTMLDivElement>(null);
  const holdTimer = useRef<number | null>(null);
  const holdStart = useRef<{ x: number; y: number } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [selected, setSelected] = useState<string>("");
  const [folder, setFolder] = useState<"chats" | "files">("chats");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [editingId, setEditingId] = useState("");
  const [keptIds, setKeptIds] = useState<string[]>([]);
  const [menu, setMenu] = useState<{ id: string; top: number; left: number; confirm: boolean } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const drivers = useQuery({
    queryKey: ["driver-options"],
    queryFn: () => api<ListResponse<DriverOption>>("/drivers?limit=500&sort=name"),
  });
  const messages = useQuery({
    queryKey: ["messages"],
    queryFn: () => api<{ data: Message[] }>("/messages"),
    refetchInterval: 15000,
  });

  const rows = messages.data?.data ?? [];
  const people = drivers.data?.data ?? [];
  const activeCount = people.filter((driver) => driver.status?.code === "active").length;

  const chats = useMemo(() => {
    const term = search.trim().toLowerCase();
    return people
      .filter((driver) => !term || driver.name.toLowerCase().includes(term))
      .map((driver) => ({
        driver,
        latest: rows.find((message) => message.driverId === driver.id),
        unread: rows.filter((message) => message.driverId === driver.id && message.senderRole === "driver" && message.unread).length,
      }))
      .sort((a, b) => {
        const left = a.latest?.createdAt ? new Date(a.latest.createdAt).getTime() : 0;
        const right = b.latest?.createdAt ? new Date(b.latest.createdAt).getTime() : 0;
        return right - left;
      });
  }, [people, rows, search]);

  const thread = useMemo(() => {
    if (selected === ALL) {
      const seen = new Set<string>();
      const grouped: Message[] = [];
      for (const message of [...rows].reverse()) {
        if (!message.broadcastId || seen.has(message.broadcastId)) continue;
        seen.add(message.broadcastId);
        const sent = rows.filter((row) => row.broadcastId === message.broadcastId).length;
        grouped.push({ ...message, sent, driverName: "All drivers" });
      }
      return grouped;
    }
    if (!selected) return [];
    return rows.filter((message) => message.driverId === selected).slice().reverse();
  }, [rows, selected]);

  const fileRows = useMemo(() => {
    const source = selected === ALL
      ? thread
      : selected
        ? rows.filter((message) => message.driverId === selected)
        : rows;
    const list: Array<{ fileId: string; message: Message }> = [];
    const seen = new Set<string>();
    for (const message of source) {
      for (const fileId of message.fileIds ?? []) {
        const key = message.broadcastId ? `${message.broadcastId}:${fileId}` : `${message.id}:${fileId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push({ fileId, message });
      }
    }
    return list;
  }, [rows, selected, thread]);

  const current = people.find((driver) => driver.id === selected);
  const inactive = Boolean(current && current.status && current.status.code !== "active");
  const showPanel = folder === "files" || Boolean(selected);

  useEffect(() => {
    const node = threadRef.current;
    if (!node || folder === "files") return;
    node.scrollTop = node.scrollHeight;
  }, [thread, selected, folder, newFiles.length]);

  useEffect(() => {
    if (!menu && !editingId) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [menu, editingId]);

  useEffect(() => {
    if (!editingId) return;
    const message = rows.find((row) => row.id === editingId);
    if (!message || canEditMessage(message.createdAt, Date.now())) return;
    setEditingId("");
    setDraft("");
    setKeptIds([]);
    setNewFiles([]);
    setMenu(null);
    setNote("Edit closed after 2 minutes.");
  }, [editingId, now, rows]);

  useEffect(() => {
    if (!menu) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  useEffect(() => {
    return () => {
      cancelHold();
      const rec = recorder.current;
      if (rec && rec.state !== "inactive") {
        rec.onstop = null;
        rec.stop();
      }
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const viewingUnread = selected !== "" && selected !== ALL && rows.some((message) => message.driverId === selected && message.senderRole === "driver" && message.unread);

  useEffect(() => {
    if (!viewingUnread || selected === ALL) return;
    const driverId = selected;
    void api("/messages/read", { method: "POST", body: { driverId } }).then(() => {
      client.setQueryData<{ data: Message[] }>(["messages"], (current) => {
        if (!current) return current;
        return {
          data: current.data.map((message) => (
            message.driverId === driverId && message.senderRole === "driver" ? { ...message, unread: false } : message
          )),
        };
      });
      void client.invalidateQueries({ queryKey: ["message-unread"] });
    });
  }, [client, selected, viewingUnread]);

  function openChat(id: string) {
    setSelected(id);
    setFolder("chats");
    setEditingId("");
    setKeptIds([]);
    setDraft("");
    setNewFiles([]);
    setMenu(null);
    setError("");
    setNote("");
    if (id === ALL) return;
    client.setQueryData<{ data: Message[] }>(["messages"], (current) => {
      if (!current) return current;
      return {
        data: current.data.map((message) => (
          message.driverId === id && message.senderRole === "driver" ? { ...message, unread: false } : message
        )),
      };
    });
    void api("/messages/read", { method: "POST", body: { driverId: id } })
      .then(() => client.invalidateQueries({ queryKey: ["message-unread"] }))
      .catch(() => {
        void client.invalidateQueries({ queryKey: ["messages"] });
      });
  }

  function cancelHold() {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
    holdStart.current = null;
  }

  function openMenu(id: string, clientX: number, clientY: number) {
    const width = 180;
    const height = 108;
    const left = Math.max(8, Math.min(clientX, window.innerWidth - width - 8));
    const top = clientY + height > window.innerHeight - 8 ? Math.max(8, clientY - height) : clientY;
    setMenu({ id, top, left, confirm: false });
  }

  function startHold(message: Message, event: ReactPointerEvent<HTMLDivElement>) {
    if (selected === ALL || message.senderRole === "driver") return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    cancelHold();
    const x = event.clientX;
    const y = event.clientY;
    holdStart.current = { x, y };
    holdTimer.current = window.setTimeout(() => {
      openMenu(message.id, x, y);
      holdTimer.current = null;
    }, 500);
  }

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const next = [...newFiles];
    for (const file of Array.from(list)) {
      const problem = fileAllowed(file);
      if (problem) {
        setError(problem);
        continue;
      }
      if (next.length >= 12) {
        setError("You can attach up to 12 files.");
        break;
      }
      next.push(file);
      setError("");
    }
    setNewFiles(next);
  }

  async function toggleRecording() {
    if (recorder.current && recorder.current.state === "recording") {
      recorder.current.stop();
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      const rec = new MediaRecorder(media);
      chunks.current = [];
      rec.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      rec.onstop = () => {
        media.getTracks().forEach((track) => track.stop());
        stream.current = null;
        const type = rec.mimeType || "audio/webm";
        const blob = new Blob(chunks.current, { type });
        const extension = type.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `voice-${Date.now()}.${extension}`, { type });
        setNewFiles((currentFiles) => [...currentFiles, file].slice(0, 12));
        setRecording(false);
        recorder.current = null;
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
      setError("");
    } catch {
      setError("Allow microphone access to record a voice note.");
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      const uploaded = await Promise.all(newFiles.map((file) => uploadDocument(file)));
      const fileIds = [...keptIds, ...uploaded];
      const body = draft.trim();
      if (!body && fileIds.length === 0) throw new ApiError("Write a message or add a file.", 400);
      if (editingId && selected !== ALL) {
        return api<{ data: Message }>(`/messages/${editingId}`, { method: "PATCH", body: { driverId: selected, body, fileIds } });
      }
      if (selected === ALL) {
        return api<{ data: Message }>("/messages/broadcast", { method: "POST", body: { body, fileIds } });
      }
      return api<{ data: Message }>("/messages", { method: "POST", body: { driverId: selected, body, fileIds } });
    },
    onSuccess: async (result) => {
      const edited = Boolean(editingId);
      setDraft("");
      setNewFiles([]);
      setKeptIds([]);
      setEditingId("");
      setError("");
      if (edited) setNote("Message updated.");
      else if (selected === ALL) {
        const sent = result.data.sent ?? 0;
        const delivered = result.data.delivered;
        setNote(typeof delivered === "number" ? `Sent to ${sent} drivers. SMS reached ${delivered}.` : `Sent to ${sent} drivers.`);
      } else setNote(result.data.delivered ? "Message sent." : "Message saved. SMS delivery did not complete.");
      await client.invalidateQueries({ queryKey: ["messages"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not send the message."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/messages/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      setMenu(null);
      setError("");
      if (menu && editingId === menu.id) {
        setEditingId("");
        setDraft("");
        setKeptIds([]);
      }
      await client.invalidateQueries({ queryKey: ["messages"] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not delete the message."),
  });

  function onSend(event: FormEvent) {
    event.preventDefault();
    if (recording || save.isPending || inactive) return;
    save.mutate();
  }

  const title = selected === ALL ? "All drivers" : current?.name ?? "Messages";
  const subtitle = selected === ALL
    ? `${activeCount} active driver${activeCount === 1 ? "" : "s"}`
    : current?.status?.label ?? "Direct chat";

  return (
    <div className="flex h-[calc(100dvh-11.5rem)] min-h-[32rem] overflow-hidden rounded-lg border border-line bg-card shadow-[0_8px_24px_rgba(17,22,16,0.04)] md:h-[calc(100dvh-8rem)]">
      <aside className={cn("w-full shrink-0 flex-col border-line bg-card lg:flex lg:w-80 lg:border-r", showPanel ? "hidden" : "flex")}>
        <div className="border-b border-line px-4 py-4">
          <h1 className="text-lg font-semibold text-ink">Messages</h1>
          <p className="mt-0.5 text-sm text-muted">Chat with one driver, or everyone at once.</p>
          <label className="relative mt-3 block">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search drivers"
              aria-label="Search drivers"
              className="h-10 w-full rounded-md border border-line bg-canvas pr-3 pl-9 text-sm text-ink outline-none placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/25"
            />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-md bg-canvas p-1">
            <button type="button" className={cn("h-9 rounded-md text-sm font-medium", folder === "chats" ? "bg-brand text-ink" : "text-muted hover:text-ink")} onClick={() => setFolder("chats")}>Chats</button>
            <button type="button" className={cn("inline-flex h-9 items-center justify-center gap-1.5 rounded-md text-sm font-medium", folder === "files" ? "bg-brand text-ink" : "text-muted hover:text-ink")} onClick={() => setFolder("files")}>
              <Folder className="h-4 w-4" aria-hidden="true" />
              Files
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {(!search || "all drivers".includes(search.trim().toLowerCase())) ? (
            <button type="button" className={cn("flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left", selected === ALL && folder === "chats" ? "bg-brand-soft" : "hover:bg-canvas")} onClick={() => openChat(ALL)}>
              <span className="grid h-10 w-10 place-items-center rounded-md bg-highlight text-ink"><Users className="h-4 w-4" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-ink">All drivers</span>
                  <span className="shrink-0 text-xs text-muted">{activeCount}</span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted">Send one message to every active driver</span>
              </span>
            </button>
          ) : null}
          {drivers.isLoading || messages.isLoading ? <p className="px-4 py-6 text-sm text-muted">Loading chats...</p> : null}
          {drivers.isError || messages.isError ? <p className="px-4 py-6 text-sm text-status-danger">Could not load chats.</p> : null}
          {chats.map(({ driver, latest, unread }) => (
            <button key={driver.id} type="button" className={cn("flex w-full items-center gap-3 px-4 py-3 text-left", selected === driver.id && folder === "chats" ? "bg-brand-soft" : "hover:bg-canvas")} onClick={() => openChat(driver.id)}>
              <span className="relative shrink-0">
                <Avatar name={driver.name} photoUrl={driver.photoUrl} />
                {unread > 0 ? <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-highlight ring-2 ring-card" aria-hidden="true" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-ink">{driver.name}</span>
                  <span className="shrink-0 text-xs text-muted">{formatWhen(latest?.createdAt ?? null)}</span>
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className={cn("min-w-0 truncate text-xs", unread > 0 ? "font-semibold text-ink" : "text-muted")}>{preview(latest)}</span>
                  {unread > 0 ? (
                    <span className="shrink-0 rounded-md bg-highlight px-1.5 py-0.5 text-[11px] font-semibold text-ink">
                      {unread === 1 ? "New" : `${unread} new`}
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          ))}
          {!drivers.isLoading && chats.length === 0 ? <p className="px-4 py-6 text-sm text-muted">No drivers match that search.</p> : null}
        </div>
      </aside>

      <section className={cn("min-w-0 flex-1 flex-col bg-card", showPanel ? "flex" : "hidden lg:flex")}>
        {folder === "files" ? (
          <>
            <header className="flex items-center gap-3 border-b border-line px-3 py-3 sm:px-4">
              <button type="button" className="grid h-10 w-10 place-items-center rounded-md text-ink hover:bg-brand-soft lg:hidden" aria-label="Back to chats" onClick={() => setFolder("chats")}>
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-ink">Files</h2>
                <p className="truncate text-xs text-muted">{selected ? `Shared in ${title}` : "Photos, voice notes, and documents from every chat"}</p>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto bg-brand-soft p-4">
              {fileRows.length === 0 ? <p className="rounded-lg border border-dashed border-line bg-card px-4 py-10 text-center text-sm text-muted">No files in this view yet.</p> : null}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {fileRows.map(({ fileId, message }) => (
                  <div key={`${message.id}-${fileId}`} className="space-y-2">
                    <ChatFile fileId={fileId} card />
                    <p className="truncate text-xs text-muted">{message.driverName} · {formatWhen(message.createdAt, true)}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : selected ? (
          <>
            <header className="flex items-center gap-3 border-b border-line px-3 py-3 sm:px-4">
              <button type="button" className="grid h-10 w-10 place-items-center rounded-md text-ink hover:bg-brand-soft lg:hidden" aria-label="Back to chats" onClick={() => setSelected("")}>
                <ArrowLeft className="h-4 w-4" />
              </button>
              {selected === ALL ? (
                <span className="grid h-11 w-11 place-items-center rounded-md bg-highlight text-ink"><Users className="h-5 w-5" aria-hidden="true" /></span>
              ) : (
                <Avatar name={current?.name ?? "Driver"} photoUrl={current?.photoUrl} size="lg" />
              )}
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold text-ink">{title}</h2>
                <p className="truncate text-xs text-muted">{subtitle}</p>
              </div>
              <button type="button" className="inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-ink hover:bg-brand-soft" onClick={() => setFolder("files")}>
                <Folder className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Files</span>
              </button>
            </header>

            <div ref={threadRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-brand-soft px-3 py-4 sm:px-5" onScroll={() => { if (menu) setMenu(null); }}>
              {thread.length === 0 ? (
                <p className="mx-auto max-w-sm rounded-lg border border-dashed border-line bg-card px-4 py-8 text-center text-sm text-muted">
                  {selected === ALL ? "A message here goes to every active driver, with an SMS as well." : "No messages with this driver yet."}
                </p>
              ) : null}
              {thread.map((message) => {
                const mine = message.senderRole !== "driver";
                const holdable = mine && selected !== ALL;
                return (
                  <div key={message.broadcastId && selected === ALL ? message.broadcastId : message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div
                      className={cn("max-w-[min(100%,28rem)] rounded-lg px-3 py-2 shadow-[0_1px_2px_rgba(17,22,16,0.06)]", mine ? "rounded-br-sm bg-brand text-ink" : "rounded-bl-sm bg-card text-ink", holdable && "cursor-pointer")}
                      style={holdable ? { WebkitTouchCallout: "none" } : undefined}
                      onPointerDown={holdable ? (event) => startHold(message, event) : undefined}
                      onPointerMove={holdable ? (event) => {
                        if (!holdStart.current || !holdTimer.current) return;
                        const dx = event.clientX - holdStart.current.x;
                        const dy = event.clientY - holdStart.current.y;
                        if (dx * dx + dy * dy > 64) cancelHold();
                      } : undefined}
                      onPointerUp={holdable ? cancelHold : undefined}
                      onPointerCancel={holdable ? cancelHold : undefined}
                      onContextMenu={holdable ? (event) => {
                        event.preventDefault();
                        cancelHold();
                        openMenu(message.id, event.clientX, event.clientY);
                      } : undefined}
                    >
                      {message.body ? <p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p> : null}
                      {message.fileIds?.length ? (
                        <div className={cn("space-y-2", message.body && "mt-2")}>
                          {message.fileIds.map((fileId) => <ChatFile key={fileId} fileId={fileId} />)}
                        </div>
                      ) : null}
                      <p className="mt-1 text-right text-[11px] text-ink/70">
                        {selected === ALL && message.sent ? `Sent to ${message.sent} · ` : ""}
                        {formatWhen(message.createdAt, true)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={onSend} className="border-t border-line bg-card px-3 py-3 sm:px-4">
              {inactive ? <p className="mb-2 text-sm text-muted">This driver is inactive, so new messages stay off.</p> : null}
              {editingId ? (
                <div className="mb-2 flex items-center justify-between gap-3 rounded-md bg-brand-soft px-3 py-2 text-sm text-ink">
                  <span>Editing this message.</span>
                  <button type="button" className="font-medium" onClick={() => { setEditingId(""); setDraft(""); setKeptIds([]); setNewFiles([]); }}>Cancel</button>
                </div>
              ) : null}
              {note ? <p className="mb-2 text-sm text-brand-deep">{note}</p> : null}
              {error ? <p className="mb-2 text-sm text-status-danger">{error}</p> : null}
              {recording ? <p className="mb-2 text-sm text-ink">Recording a voice note. Tap stop when you are done.</p> : null}
              {(newFiles.length > 0 || keptIds.length > 0) ? (
                <ul className="mb-2 flex flex-wrap gap-2">
                  {keptIds.map((fileId) => (
                    <li key={fileId} className="inline-flex max-w-full items-center gap-2 rounded-md border border-line bg-canvas px-2 py-1 text-xs text-ink">
                      <span className="truncate">Attached file</span>
                      <button type="button" aria-label="Remove file" onClick={() => setKeptIds((ids) => ids.filter((id) => id !== fileId))}><X className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                  {newFiles.map((file, index) => (
                    <li key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-2 rounded-md border border-line bg-canvas px-2 py-1 text-xs text-ink">
                      <span className="max-w-[12rem] truncate">{file.name}</span>
                      <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setNewFiles((files) => files.filter((_, item) => item !== index))}><X className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex items-end gap-1.5 sm:gap-2">
                <input ref={cameraRef} type="file" accept="image/jpeg,image/png" capture="environment" className="hidden" onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf" multiple className="hidden" onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
                <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-ink hover:bg-brand-soft disabled:opacity-50" aria-label="Take a photo" disabled={inactive || recording} onClick={() => cameraRef.current?.click()}>
                  <Camera className="h-4 w-4" />
                </button>
                <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-ink hover:bg-brand-soft disabled:opacity-50" aria-label="Attach a file" disabled={inactive || recording} onClick={() => fileRef.current?.click()}>
                  <Paperclip className="h-4 w-4" />
                </button>
                <button type="button" className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-md text-ink hover:bg-brand-soft disabled:opacity-50", recording && "bg-highlight")} aria-label={recording ? "Stop recording" : "Record a voice note"} disabled={inactive} onClick={() => void toggleRecording()}>
                  {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
                <textarea
                  value={draft}
                  maxLength={500}
                  rows={1}
                  disabled={inactive}
                  placeholder={selected === ALL ? "Message every active driver" : "Write a message"}
                  aria-label="Message"
                  className="max-h-28 min-h-10 flex-1 resize-none rounded-md border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/25 disabled:opacity-60"
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <button type="submit" className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-brand text-ink hover:bg-brand-strong disabled:opacity-50" aria-label="Send message" disabled={inactive || recording || save.isPending}>
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 flex items-center justify-between gap-3 text-[11px] text-muted">
                <span>{selected === ALL || editingId ? "" : "Press and hold your message to edit or delete. Edit closes after 2 minutes."}</span>
                <span>{draft.length}/500</span>
              </p>
            </form>
          </>
        ) : (
          <div className="grid flex-1 place-items-center bg-brand-soft px-6 text-center">
            <div>
              <p className="text-base font-semibold text-ink">Choose a chat</p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-muted">Open a driver for a private message, or All drivers to reach the whole fleet at once.</p>
            </div>
          </div>
        )}
      </section>
      {menu ? (
        <>
          <button type="button" className="fixed inset-0 z-40 cursor-default" aria-label="Close message actions" onClick={() => setMenu(null)} />
          <div className="fixed z-50 w-44 rounded-lg border border-line bg-card p-1 shadow-[0_8px_24px_rgba(17,22,16,0.12)]" style={{ top: menu.top, left: menu.left }} role="menu">
            {menu.confirm ? (
              <div className="px-2 py-2">
                <p className="text-sm text-ink">Delete this message?</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" className="h-9 flex-1 rounded-md bg-status-danger text-sm font-medium text-white disabled:opacity-60" disabled={remove.isPending} onClick={() => remove.mutate(menu.id)}>Delete</button>
                  <button type="button" className="h-9 flex-1 rounded-md border border-line text-sm font-medium text-ink" onClick={() => setMenu(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                {canEditMessage(rows.find((row) => row.id === menu.id)?.createdAt ?? null, Date.now()) ? (
                  <button
                    type="button"
                    className="h-9 w-full rounded-md px-3 text-left text-sm font-medium text-ink hover:bg-brand-soft"
                    role="menuitem"
                    onClick={() => {
                      const message = rows.find((row) => row.id === menu.id);
                      if (!message) return;
                      setEditingId(message.id);
                      setDraft(message.body);
                      setKeptIds(message.fileIds ?? []);
                      setNewFiles([]);
                      setMenu(null);
                    }}
                  >
                    Edit
                  </button>
                ) : (
                  <p className="px-3 py-2 text-xs text-muted">Edit closed after 2 minutes.</p>
                )}
                <button type="button" className="h-9 w-full rounded-md px-3 text-left text-sm font-medium text-status-danger hover:bg-status-danger-bg" role="menuitem" onClick={() => setMenu({ ...menu, confirm: true })}>
                  Delete
                </button>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
