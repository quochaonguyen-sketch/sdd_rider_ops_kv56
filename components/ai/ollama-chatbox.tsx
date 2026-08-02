"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Database, LoaderCircle, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { cn } from "@/utils/cn";

type ChatRole = "user" | "assistant";
type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  dataSources?: string[];
  dataAsOf?: string;
  workDate?: string;
};

type OllamaChunk = {
  message?: { role?: string; content?: string };
  error?: string;
  done?: boolean;
};

const greeting: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "Chào bạn. Tôi là AI nội bộ chạy trên máy này. Bật “Dữ liệu trang này” để tôi đọc số liệu Supabase đã được giới hạn và phân tích theo ngày/snapshot.",
};

export function OllamaChatbox() {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([greeting]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeData, setIncludeData] = useState(true);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    function onPointerDown(event: PointerEvent) {
      if (panelRef.current && event.target instanceof Node && !panelRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function sendMessage() {
    const content = draft.trim();
    if (!content || loading) return;

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content };
    const assistantId = crypto.randomUUID();
    const conversation = [...messages.filter((message) => message.id !== "welcome"), userMessage].slice(-19);

    setDraft("");
    setError(null);
    setLoading(true);
    setMessages((current) => [...current, userMessage, { id: assistantId, role: "assistant", content: "" }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conversation.map(({ role, content: value }) => ({ role, content: value })),
          includeData,
          pagePath: `${window.location.pathname}${window.location.search}`,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(result?.error ?? "AI nội bộ chưa sẵn sàng.");
      }

      const dataSources = (response.headers.get("X-Rider-Ops-Data-Sources") ?? "")
        .split(",")
        .filter((source) => source && source !== "none");
      const dataAsOf = response.headers.get("X-Rider-Ops-Data-As-Of") ?? undefined;
      const workDate = response.headers.get("X-Rider-Ops-Work-Date") ?? undefined;
      setMessages((current) => current.map((message) => (
        message.id === assistantId
          ? { ...message, dataSources, dataAsOf: dataAsOf === "none" ? undefined : dataAsOf, workDate: workDate === "none" ? undefined : workDate }
          : message
      )));

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = JSON.parse(line) as OllamaChunk;
          if (chunk.error) throw new Error(chunk.error);
          answer += chunk.message?.content ?? "";
          setMessages((current) => current.map((message) => (message.id === assistantId ? { ...message, content: answer } : message)));
        }

        if (done) break;
      }

      if (!answer.trim()) throw new Error("AI không trả về nội dung.");
    } catch (caught) {
      if (controller.signal.aborted) return;
      setMessages((current) => current.filter((message) => message.id !== assistantId));
      setError(caught instanceof Error ? caught.message : "Không thể gửi câu hỏi đến AI nội bộ.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
    }
  }

  function resetChat() {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([greeting]);
    setDraft("");
    setError(null);
    setLoading(false);
    inputRef.current?.focus();
  }

  return (
    <div ref={panelRef} className="fixed bottom-42 right-4 z-[400] sm:bottom-24 sm:right-6">
      {open ? (
        <section
          id="ollama-chat-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="ollama-chat-title"
          className="mb-3 flex h-[min(37rem,calc(100dvh-12rem))] w-[min(calc(100vw-2rem),27rem)] flex-col overflow-hidden rounded-[1.4rem] border border-slate-200/80 bg-white/97 text-slate-950 shadow-[0_24px_70px_rgba(15,23,42,0.24)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-950/97 dark:text-slate-50"
        >
          <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" /> Local LLM
              </p>
              <h2 id="ollama-chat-title" className="mt-1 flex items-center gap-2 text-base font-semibold leading-6">
                <Bot size={18} aria-hidden="true" /> Rider Ops AI
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Qwen3 4B · dữ liệu không rời máy chủ Ollama</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={resetChat} className="grid size-9 place-items-center rounded-full text-slate-500 outline-none transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="Tạo cuộc trò chuyện mới" title="Tạo cuộc trò chuyện mới">
                <RotateCcw size={16} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-full text-slate-500 outline-none transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="Đóng AI chat">
                <X size={17} aria-hidden="true" />
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite" aria-busy={loading}>
            {messages.map((message) => (
              <article key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-6", message.role === "user" ? "rounded-br-md bg-slate-950 text-white dark:bg-white dark:text-slate-950" : "rounded-bl-md border border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100")}>
                  {message.content ? <p className="whitespace-pre-wrap">{message.content}</p> : <span className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400"><LoaderCircle size={15} className="animate-spin" aria-hidden="true" />Đang suy nghĩ…</span>}
                  {message.role === "assistant" && message.dataSources?.length ? (
                    <p className="mt-2 border-t border-slate-200/80 pt-2 text-[0.65rem] leading-4 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      Supabase · {message.workDate ?? "—"} · {formatContextTime(message.dataAsOf)}<br />
                      {message.dataSources.join(" · ")}
                    </p>
                  ) : null}
                </div>
              </article>
            ))}
            <div ref={endRef} />
          </div>

          <div className="border-t border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
            {error ? <p role="alert" className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p> : null}
            <button
              type="button"
              aria-pressed={includeData}
              disabled={loading}
              onClick={() => setIncludeData((current) => !current)}
              className={cn("mb-2 inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500", includeData ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" : "border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400")}
            >
              <Database size={13} aria-hidden="true" />
              Dữ liệu trang này: {includeData ? "Bật" : "Tắt"}
            </button>
            <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-emerald-500/30 dark:border-slate-700 dark:bg-slate-950">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                disabled={loading}
                rows={1}
                maxLength={4000}
                placeholder="Hỏi AI nội bộ…"
                aria-label="Nội dung gửi AI"
                className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-6 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:placeholder:text-slate-500"
              />
              <button type="button" disabled={loading || !draft.trim()} onClick={() => void sendMessage()} className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white outline-none transition-[background-color,transform] hover:bg-emerald-700 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950" aria-label="Gửi câu hỏi">
                {loading ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Send size={17} aria-hidden="true" />}
              </button>
            </div>
            <p className="mt-2 text-center text-[0.68rem] text-slate-400 dark:text-slate-500">Enter để gửi · Shift + Enter xuống dòng · AI có thể trả lời sai</p>
          </div>
        </section>
      ) : null}

      <button
        type="button"
        aria-expanded={open}
        aria-controls="ollama-chat-panel"
        title="Rider Ops AI"
        onClick={() => setOpen((current) => !current)}
        className="group relative grid size-14 place-items-center rounded-2xl border border-emerald-400/50 bg-emerald-600 text-white shadow-[0_16px_40px_rgba(5,150,105,0.28)] outline-none transition-[background-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:bg-emerald-700 active:translate-y-px focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:border-emerald-400/50 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400 dark:focus-visible:ring-offset-slate-950"
      >
        {open ? <X size={22} aria-hidden="true" /> : <Sparkles size={22} aria-hidden="true" />}
        <span className="absolute -right-1 -top-1 size-3 rounded-full bg-emerald-300 ring-2 ring-white dark:ring-slate-950" aria-hidden="true" />
        <span className="sr-only">{open ? "Đóng Rider Ops AI" : "Mở Rider Ops AI"}</span>
      </button>
    </div>
  );
}

function formatContextTime(value?: string) {
  if (!value) return "chưa có snapshot";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(date);
}
