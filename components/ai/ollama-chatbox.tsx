"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Bot, Brain, CalendarClock, Check, Database, LoaderCircle, RotateCcw, Send, Sparkles, Trash2, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { useBrowserAiConfig } from "@/lib/ai/browser-config";

type ChatRole = "user" | "assistant";
type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  dataSources?: string[];
  dataAsOf?: string;
  workDate?: string;
  action?: OffRescheduleProposal;
};

type OffRescheduleProposal = {
  actionId: string;
  riderCode: string;
  riderName: string | null;
  fromDate: string;
  toDate: string;
  offStatus: string;
  expiresAt: string;
  status?: "PENDING" | "EXECUTED" | "CANCELLED" | "FAILED";
  error?: string;
  warning?: string;
};

type OllamaChunk = {
  message?: { role?: string; content?: string };
  error?: string;
  done?: boolean;
};

type MemoryResponse = {
  success: boolean;
  error?: string;
  memoryEnabled?: boolean;
  conversation?: { id: string } | null;
  messages?: Array<{
    id: string;
    role: ChatRole;
    content: string;
    metadata?: { data_sources?: string[]; work_date?: string | null; data_as_of?: string | null };
  }>;
};

type ActionPreviewResponse = {
  success: boolean;
  matched?: boolean;
  error?: string;
  proposal?: OffRescheduleProposal;
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
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [memoryBusy, setMemoryBusy] = useState(true);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const aiConfig = useBrowserAiConfig();

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/ai/memory", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as MemoryResponse;
        if (!response.ok || !result.success) throw new Error(result.error ?? "Không tải được AI Memory.");
        setMemoryEnabled(result.memoryEnabled ?? true);
        setConversationId(result.conversation?.id ?? null);
        if (result.messages?.length) {
          setMessages([
            greeting,
            ...result.messages.map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content,
              dataSources: message.metadata?.data_sources,
              dataAsOf: message.metadata?.data_as_of ?? undefined,
              workDate: message.metadata?.work_date ?? undefined,
            })),
          ]);
        }
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Không tải được AI Memory.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setMemoryBusy(false);
      });
    return () => controller.abort();
  }, []);

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
      const previewResponse = await fetch("/api/ai/actions/off-reschedule/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content }),
        signal: controller.signal,
      });
      const preview = await previewResponse.json() as ActionPreviewResponse;
      if (!previewResponse.ok) throw new Error(preview.error ?? "Không kiểm tra được yêu cầu chỉnh lịch OFF.");
      if (preview.matched) {
        const proposal = preview.proposal ? { ...preview.proposal, status: "PENDING" as const } : undefined;
        const answer = proposal
          ? `Tôi đã tìm thấy lịch OFF cần chuyển. Kiểm tra thông tin bên dưới rồi xác nhận; hệ thống chưa thay đổi dữ liệu.`
          : preview.error ?? "Chưa đủ thông tin để tạo yêu cầu đổi lịch OFF.";
        setMessages((current) => current.map((message) => (
          message.id === assistantId ? { ...message, content: answer, action: proposal } : message
        )));
        return;
      }

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conversation.map(({ role, content: value }) => ({ role, content: value })),
          includeData,
          pagePath: `${window.location.pathname}${window.location.search}`,
          conversationId,
          aiConfig,
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
      const responseConversationId = response.headers.get("X-Rider-Ops-Conversation-Id");
      if (responseConversationId && responseConversationId !== "none") setConversationId(responseConversationId);
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
    setConversationId(null);
    setDraft("");
    setError(null);
    setLoading(false);
    inputRef.current?.focus();
  }

  async function toggleMemory() {
    if (memoryBusy) return;
    const nextValue = !memoryEnabled;
    setMemoryBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/ai/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryEnabled: nextValue }),
      });
      const result = await response.json() as MemoryResponse;
      if (!response.ok || !result.success) throw new Error(result.error ?? "Không cập nhật được AI Memory.");
      setMemoryEnabled(nextValue);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không cập nhật được AI Memory.");
    } finally {
      setMemoryBusy(false);
    }
  }

  async function clearMemory() {
    if (memoryBusy || !window.confirm("Xóa toàn bộ lịch sử AI của account này? Thao tác này không thể hoàn tác.")) return;
    setMemoryBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/ai/memory", { method: "DELETE" });
      const result = await response.json() as MemoryResponse;
      if (!response.ok || !result.success) throw new Error(result.error ?? "Không xóa được AI Memory.");
      resetChat();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không xóa được AI Memory.");
    } finally {
      setMemoryBusy(false);
    }
  }

  async function confirmOffReschedule(messageId: string, action: OffRescheduleProposal) {
    if (actionBusyId) return;
    setActionBusyId(action.actionId);
    setError(null);
    try {
      const response = await fetch("/api/ai/actions/off-reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: action.actionId }),
      });
      const result = await response.json() as { success: boolean; error?: string; sheet_sync?: { success: boolean; error?: string } };
      if (!response.ok || !result.success) throw new Error(result.error ?? "Không thể chuyển lịch OFF.");
      const warning = result.sheet_sync && !result.sheet_sync.success
        ? `Đã đổi trong hệ thống nhưng Google Sheet chưa đồng bộ: ${result.sheet_sync.error ?? "lỗi không xác định"}`
        : undefined;
      setMessages((current) => current.map((message) => (
        message.id === messageId
          ? { ...message, content: `Đã chuyển lịch OFF của ${action.riderName ?? action.riderCode} từ ${formatActionDate(action.fromDate)} sang ${formatActionDate(action.toDate)}.${warning ? " Cần xử lý cảnh báo đồng bộ bên dưới." : " Google Sheet đã được cập nhật."}`, action: { ...action, status: "EXECUTED", warning } }
          : message
      )));
    } catch (caught) {
      const actionError = caught instanceof Error ? caught.message : "Không thể chuyển lịch OFF.";
      setMessages((current) => current.map((message) => (
        message.id === messageId ? { ...message, action: { ...action, status: "FAILED", error: actionError } } : message
      )));
    } finally {
      setActionBusyId(null);
    }
  }

  async function cancelOffReschedule(messageId: string, action: OffRescheduleProposal) {
    if (actionBusyId) return;
    setActionBusyId(action.actionId);
    try {
      const response = await fetch("/api/ai/actions/off-reschedule", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: action.actionId }),
      });
      const result = await response.json() as { success: boolean; error?: string };
      if (!response.ok || !result.success) throw new Error(result.error ?? "Không thể hủy action.");
      setMessages((current) => current.map((message) => (
        message.id === messageId ? { ...message, content: "Đã hủy yêu cầu chuyển lịch OFF.", action: { ...action, status: "CANCELLED" } } : message
      )));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể hủy action.");
    } finally {
      setActionBusyId(null);
    }
  }

  return (
    <div ref={panelRef} className="relative z-[400]">
      {open ? (
        <section
          id="ollama-chat-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="ollama-chat-title"
          className="fixed right-3 top-[4.5rem] flex h-[min(37rem,calc(100dvh-6rem))] w-[min(calc(100vw-1.5rem),27rem)] flex-col overflow-hidden rounded-[1.4rem] border border-slate-200/80 bg-white/97 text-slate-950 shadow-[0_24px_70px_rgba(15,23,42,0.24)] backdrop-blur sm:right-6 sm:top-20 dark:border-slate-700/70 dark:bg-slate-950/97 dark:text-slate-50"
        >
          <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" /> ShopAIKey API
              </p>
              <h2 id="ollama-chat-title" className="mt-1 flex items-center gap-2 text-base font-semibold leading-6">
                <Bot size={18} aria-hidden="true" /> Rider Ops AI
              </h2>
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{aiConfig.model} · {aiConfig.baseUrl ? "máy chủ tùy chỉnh" : "máy chủ mặc định"}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => void toggleMemory()}
                disabled={memoryBusy}
                aria-pressed={memoryEnabled}
                className={cn(
                  "grid size-9 place-items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-wait disabled:opacity-50",
                  memoryEnabled
                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
                    : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800",
                )}
                aria-label={memoryEnabled ? "Tắt ghi nhớ theo account" : "Bật ghi nhớ theo account"}
                title={memoryEnabled ? "AI Memory đang bật" : "AI Memory đang tắt"}
              >
                <Brain size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => void clearMemory()}
                disabled={memoryBusy}
                className="grid size-9 place-items-center rounded-full text-slate-500 outline-none transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-wait disabled:opacity-50 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                aria-label="Xóa lịch sử AI của account"
                title="Xóa AI Memory"
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
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
                  {message.action ? (
                    <OffRescheduleCard
                      action={message.action}
                      busy={actionBusyId === message.action.actionId}
                      onConfirm={() => void confirmOffReschedule(message.id, message.action!)}
                      onCancel={() => void cancelOffReschedule(message.id, message.action!)}
                    />
                  ) : null}
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
        className="group relative inline-grid size-10 shrink-0 place-items-center rounded-xl border border-emerald-400/50 bg-emerald-600 text-sm font-semibold text-white outline-none transition-[background-color,transform] duration-150 hover:bg-emerald-700 active:translate-y-px focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 xl:inline-flex xl:w-auto xl:gap-2 xl:px-3 dark:border-emerald-400/50 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400 dark:focus-visible:ring-offset-slate-950"
      >
        {open ? <X size={22} aria-hidden="true" /> : <Sparkles size={22} aria-hidden="true" />}
        <span className="hidden whitespace-nowrap xl:inline">{open ? "Đóng AI" : "Bật AI"}</span>
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

function OffRescheduleCard({ action, busy, onConfirm, onCancel }: { action: OffRescheduleProposal; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  const pending = (action.status ?? "PENDING") === "PENDING";
  const heading = pending ? "Chờ xác nhận" : action.status === "EXECUTED" ? "Đã chuyển lịch" : action.status === "CANCELLED" ? "Đã hủy" : "Không thực hiện được";
  return (
    <section className="mt-3 overflow-hidden rounded-xl border border-amber-200 bg-amber-50 text-slate-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-slate-100" aria-label="Xác nhận chuyển lịch OFF">
      <div className="flex items-center gap-2 border-b border-amber-200 px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-amber-800 dark:border-amber-800 dark:text-amber-200">
        <CalendarClock size={15} aria-hidden="true" /> {heading}
      </div>
      <div className="space-y-2 px-3 py-3 text-xs leading-5">
        <p><strong>{action.riderName ?? "Chưa có tên"}</strong> · {action.riderCode}</p>
        <div className="flex items-center gap-2 font-semibold">
          <span>{formatActionDate(action.fromDate)}</span><ArrowRight size={14} aria-hidden="true" /><span>{formatActionDate(action.toDate)}</span>
        </div>
        <p className="text-slate-600 dark:text-slate-300">{formatOffStatus(action.offStatus)}</p>
        {pending ? <p className="text-slate-500 dark:text-slate-400">Bản xem trước hết hạn sau 10 phút.</p> : null}
        {action.error ? <p role="alert" className="text-red-700 dark:text-red-300">{action.error}</p> : null}
        {action.warning ? <p role="status" className="text-amber-800 dark:text-amber-200">{action.warning}</p> : null}
      </div>
      {pending ? (
        <div className="grid grid-cols-2 gap-2 border-t border-amber-200 p-2 dark:border-amber-800">
          <button type="button" onClick={onCancel} disabled={busy} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 outline-none hover:bg-slate-100 active:bg-slate-200 disabled:cursor-wait disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Hủy</button>
          <button type="button" onClick={onConfirm} disabled={busy} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white outline-none hover:bg-emerald-800 active:bg-emerald-900 disabled:cursor-wait disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400">
            {busy ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <Check size={14} aria-hidden="true" />} Xác nhận
          </button>
        </div>
      ) : (
        <p className="border-t border-amber-200 px-3 py-2 text-xs font-semibold dark:border-amber-800">
          {action.status === "EXECUTED" ? "Đã thực hiện" : action.status === "CANCELLED" ? "Đã hủy" : "Không thực hiện được"}
        </p>
      )}
    </section>
  );
}

function formatActionDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(date);
}

function formatOffStatus(value: string) {
  if (value === "OFF_APPROVED") return "OFF phép";
  if (value === "OFF_UNEXPECTED") return "OFF đột xuất";
  return "OFF tuần";
}
