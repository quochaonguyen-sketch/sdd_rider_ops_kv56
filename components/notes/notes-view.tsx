"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Check, FileText, LoaderCircle, Pin, Plus, RefreshCcw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import styles from "./notes-view.module.css";

type NoteStatus = "ACTIVE" | "ARCHIVED";
type Note = { id: string; title: string; content: string; is_pinned: boolean; status: NoteStatus; created_at: string; updated_at: string };
type Draft = Pick<Note, "title" | "content" | "is_pinned">;
type ApiResponse = { success: boolean; notes?: Note[]; note?: Note; id?: string; error?: string };

const emptyDraft: Draft = { title: "", content: "", is_pinned: false };

export function NotesView() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selected = notes.find((note) => note.id === selectedId) ?? null;
  const visibleNotes = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("vi");
    return notes.filter((note) => (showArchived ? note.status === "ARCHIVED" : note.status === "ACTIVE") && (!term || `${note.title} ${note.content}`.toLocaleLowerCase("vi").includes(term)));
  }, [notes, query, showArchived]);
  const stats = useMemo(() => ({ active: notes.filter((note) => note.status === "ACTIVE").length, pinned: notes.filter((note) => note.status === "ACTIVE" && note.is_pinned).length, archived: notes.filter((note) => note.status === "ARCHIVED").length }), [notes]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const response = await fetch("/api/notes", { cache: "no-store" });
    const result = await response.json().catch(() => null) as ApiResponse | null;
    if (!response.ok || !result?.success) setError(result?.error ?? "Không thể tải note cá nhân.");
    else setNotes(result.notes ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function startNew() {
    setSelectedId(null); setDraft(emptyDraft); setError(null); setNotice(null);
  }

  function selectNote(note: Note) {
    setSelectedId(note.id); setDraft({ title: note.title, content: note.content, is_pinned: note.is_pinned }); setError(null); setNotice(null);
  }

  async function save() {
    const title = draft.title.trim();
    if (!title) return setError("Hãy đặt tiêu đề cho note trước khi lưu.");
    setSaving(true); setError(null); setNotice(null);
    const response = await fetch(selectedId ? `/api/notes/${selectedId}` : "/api/notes", {
      method: selectedId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content: draft.content, is_pinned: draft.is_pinned }),
    });
    const result = await response.json().catch(() => null) as ApiResponse | null;
    setSaving(false);
    if (!response.ok || !result?.note) return setError(result?.error ?? "Không thể lưu note.");
    const saved = result.note;
    setNotes((current) => [saved, ...current.filter((note) => note.id !== saved.id)].sort(sortNotes));
    setSelectedId(saved.id); setDraft({ title: saved.title, content: saved.content, is_pinned: saved.is_pinned }); setNotice("Đã lưu");
  }

  async function changeStatus() {
    if (!selected) return;
    const status: NoteStatus = selected.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
    const response = await fetch(`/api/notes/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const result = await response.json().catch(() => null) as ApiResponse | null;
    if (!response.ok || !result?.note) return setError(result?.error ?? "Không thể cập nhật note.");
    setNotes((current) => current.map((note) => note.id === result.note!.id ? result.note! : note));
    setSelectedId(null); setDraft(emptyDraft); setNotice(status === "ARCHIVED" ? "Đã lưu trữ note" : "Đã khôi phục note");
  }

  async function remove() {
    if (!selected || !window.confirm(`Xoá note “${selected.title}”?`)) return;
    const response = await fetch(`/api/notes/${selected.id}`, { method: "DELETE" });
    const result = await response.json().catch(() => null) as ApiResponse | null;
    if (!response.ok || !result?.success) return setError(result?.error ?? "Không thể xoá note.");
    setNotes((current) => current.filter((note) => note.id !== selected.id)); startNew(); setNotice("Đã xoá note");
  }

  return <div className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>Private workspace · only you</p><h1>My notes</h1><p>Ghi nhanh, lưu rõ và quay lại đúng việc bạn đang xử lý.</p></div>
      <div className={styles.headerActions}><Button type="button" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCcw size={16} className={loading ? styles.spin : undefined} />Làm mới</Button><Button type="button" onClick={startNew}><Plus size={16} />Note mới</Button></div>
    </header>

    <section className={styles.stats} aria-label="Tóm tắt note cá nhân"><Metric label="Đang dùng" value={stats.active} /><Metric label="Đã ghim" value={stats.pinned} /><Metric label="Lưu trữ" value={stats.archived} /></section>

    {error ? <p className={styles.alert} role="alert">{error}</p> : null}
    {notice ? <p className={styles.notice} role="status"><Check size={15} />{notice}</p> : null}

    <section className={styles.workspace} aria-label="Không gian note cá nhân">
      <div className={styles.indexPanel}>
        <div className={styles.indexTop}><div className={styles.search}><Search size={16} aria-hidden="true" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm trong note" aria-label="Tìm trong note" /></div><button type="button" className={styles.archiveToggle} onClick={() => setShowArchived((current) => !current)} aria-pressed={showArchived}>{showArchived ? "Đang xem lưu trữ" : "Đang xem hiện hành"}</button></div>
        <div className={styles.noteList}>
          {loading ? Array.from({ length: 5 }, (_, index) => <div className={styles.skeleton} key={index} />) : null}
          {!loading && visibleNotes.map((note) => <button type="button" key={note.id} className={`${styles.noteCard} ${selectedId === note.id ? styles.selected : ""}`} onClick={() => selectNote(note)}><span className={styles.cardMeta}>{note.is_pinned ? <><Pin size={12} />Đã ghim</> : "Note"}<time>{formatDate(note.updated_at)}</time></span><strong>{note.title}</strong><span>{preview(note.content)}</span></button>)}
          {!loading && visibleNotes.length === 0 ? <div className={styles.empty}><FileText size={25} /><strong>{showArchived ? "Chưa có note đã lưu trữ" : "Chưa có note nào"}</strong><span>{showArchived ? "Các note bạn lưu trữ sẽ hiện tại đây." : "Tạo note đầu tiên để bắt đầu không gian riêng của bạn."}</span></div> : null}
        </div>
      </div>

      <form className={styles.editor} onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <div className={styles.editorTop}><span>{selected ? `Cập nhật · ${formatDate(selected.updated_at)}` : "Note mới · chưa lưu"}</span><div><button type="button" className={`${styles.iconButton} ${draft.is_pinned ? styles.pinned : ""}`} onClick={() => setDraft((current) => ({ ...current, is_pinned: !current.is_pinned }))} aria-label={draft.is_pinned ? "Bỏ ghim note" : "Ghim note"} title={draft.is_pinned ? "Bỏ ghim" : "Ghim"}><Pin size={16} /></button>{selected ? <button type="button" className={styles.iconButton} onClick={() => void remove()} aria-label="Xoá note" title="Xoá note"><Trash2 size={16} /></button> : null}</div></div>
        <Input className={styles.titleInput} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Tiêu đề ngắn, dễ tìm lại" maxLength={160} aria-label="Tiêu đề note" />
        <textarea className={styles.content} value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} placeholder="Viết điều cần nhớ, quyết định, việc tiếp theo…" maxLength={10000} aria-label="Nội dung note" />
        <footer className={styles.editorFooter}><span>{draft.content.length.toLocaleString("vi-VN")} / 10.000 ký tự</span><div>{selected ? <Button type="button" variant="outline" onClick={() => void changeStatus()}><Archive size={16} />{selected.status === "ACTIVE" ? "Lưu trữ" : "Khôi phục"}</Button> : null}<Button type="submit" disabled={saving}>{saving ? <LoaderCircle size={16} className={styles.spin} /> : <Check size={16} />}{saving ? "Đang lưu" : "Lưu note"}</Button></div></footer>
      </form>
    </section>
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function preview(value: string) { const cleaned = value.replace(/\s+/g, " ").trim(); return cleaned || "Chưa có nội dung"; }
function formatDate(value: string) { return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value)); }
function sortNotes(a: Note, b: Note) { return Number(b.is_pinned) - Number(a.is_pinned) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(); }
