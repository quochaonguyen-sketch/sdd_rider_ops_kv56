"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, CircleAlert, ScanBarcode, ScanLine, Volume2, VolumeX } from "lucide-react";
import type { RiderScanResult } from "@/lib/attendance/cot-attendance";
import styles from "./cot-attendance-view.module.css";

type ScanEntry = RiderScanResult & { sequence: number };

export function RiderAttendanceScanner({ enabled, context, disabledReason, onScan }: {
  enabled: boolean;
  context: string;
  disabledReason: string;
  onScan: (code: string) => RiderScanResult;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const sequenceRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);
  const [focused, setFocused] = useState(false);
  const [sound, setSound] = useState(true);
  const [entries, setEntries] = useState<ScanEntry[]>([]);
  const [successCount, setSuccessCount] = useState(0);
  const latest = entries[0];

  useEffect(() => {
    if (!enabled) return;
    inputRef.current?.focus({ preventScroll: true });
    const shortcut = (event: KeyboardEvent) => {
      if (event.key !== "F2" || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [enabled]);

  useEffect(() => () => { void audioRef.current?.close().catch(() => {}); }, []);

  function beep(kind: RiderScanResult["kind"]) {
    if (!sound) return;
    try {
      const context = audioRef.current ?? new AudioContext();
      audioRef.current = context;
      void context.resume().then(() => {
        if (context.state === "closed") return;
        const oscillator = context.createOscillator();
        const volume = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = kind === "success" ? 960 : kind === "duplicate" ? 600 : 260;
        volume.gain.setValueAtTime(0.08, context.currentTime);
        volume.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.14);
        oscillator.connect(volume); volume.connect(context.destination);
        oscillator.start(); oscillator.stop(context.currentTime + 0.15);
        oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
      }).catch(() => {});
    } catch { /* Visual feedback remains available if audio is unsupported or blocked. */ }
  }

  function scan() {
    const input = inputRef.current;
    if (!enabled || !input?.value.trim()) return;
    const code = input.value;
    // Read and clear the actual input synchronously, so rapid consecutive scans cannot reuse React state.
    input.value = "";
    const result = onScan(code);
    const entry = { ...result, sequence: ++sequenceRef.current };
    setEntries((previous) => [entry, ...previous].slice(0, 5));
    if (result.kind === "success") setSuccessCount((previous) => previous + 1);
    beep(result.kind);
    input.focus({ preventScroll: true });
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); scan(); }

  return <section className={styles.scanner} aria-labelledby="rider-scan-title">
    <header className={styles.scannerHeader}>
      <span className={styles.scannerIcon}><ScanBarcode size={24} aria-hidden="true" /></span>
      <div><h2 id="rider-scan-title">Điểm danh nhanh bằng súng scan</h2><p>{context} · Quét mã rider rồi Enter hoặc Tab</p></div>
      <button type="button" className={styles.soundButton} aria-label={sound ? "Tắt âm báo quét" : "Bật âm báo quét"} aria-pressed={sound} onClick={() => setSound((value) => !value)}>{sound ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}</button>
    </header>
    <form className={styles.scanForm} onSubmit={submit}>
      <label className={`${styles.scanField} ${focused ? styles.scanFieldFocused : ""}`}>
        <ScanLine size={23} aria-hidden="true" />
        <span className={styles.scanInputLabel}>Mã rider</span>
        <input ref={inputRef} aria-label="Quét mã rider để điểm danh nhanh" aria-describedby="rider-scan-help" placeholder="Quét thẻ hoặc nhập mã rider..." disabled={!enabled} autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={120} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Tab" && event.currentTarget.value.trim()) { event.preventDefault(); scan(); }
        }} />
        <kbd>Enter ↵</kbd>
      </label>
      <button type="submit" className={`${styles.button} ${styles.primary}`} disabled={!enabled}><CheckCircle2 size={17} aria-hidden="true" />Điểm danh</button>
    </form>
    <div className={styles.scanHelp} id="rider-scan-help"><span className={`${styles.scanReady} ${enabled && focused ? styles.scanReadyActive : ""}`}><span aria-hidden="true" />{!enabled ? disabledReason : focused ? "Sẵn sàng quét liên tục" : "Nhấn F2 hoặc chọn ô mã để tiếp tục quét"}</span><span>Đã điểm danh qua scan: <strong>{successCount}</strong></span></div>
    <div className={`${styles.scanResult} ${latest ? styles[`scan${latest.kind}`] : ""}`} role="status" aria-live="polite" aria-atomic="true">
      {latest ? <><span className={styles.scanResultIcon}>{latest.kind === "success" ? <CheckCircle2 size={22} aria-hidden="true" /> : <CircleAlert size={22} aria-hidden="true" />}</span><div><strong>{latest.message}</strong><p><span>{latest.code}</span>{latest.detail ? ` · ${latest.detail}` : ""}</p></div><span className={styles.scanResultNumber}>#{latest.sequence}</span></> : <><ScanBarcode size={21} aria-hidden="true" /><p>Mỗi lượt quét sẽ điểm danh ngay và tự làm trống ô mã cho rider tiếp theo.</p></>}
    </div>
    {entries.length > 1 ? <div className={styles.scanHistory} aria-label="Các lượt quét gần đây"><span>Vừa quét</span>{entries.slice(1).map((entry) => <span key={entry.sequence} className={styles[`scan${entry.kind}`]} title={entry.message}>{entry.kind === "success" ? <CheckCircle2 size={12} aria-hidden="true" /> : <CircleAlert size={12} aria-hidden="true" />}{entry.code}</span>)}</div> : null}
  </section>;
}
