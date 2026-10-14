"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Check, CheckCircle2, Clock3, Download, Info, Loader2, Plus, RefreshCcw, Search, ShieldCheck, Sun, Sunset, Truck, UsersRound, X, UserRoundX } from "lucide-react";
import type { AttendanceLog, Rider } from "@/types";
import { classifyAttendance, cotForRider, COT_DEADLINES, hasPickupRoute, isScheduledOff, normalizeSearch, parseStoredAttendance, resolveScannedRider, STATUS_LABELS, vietnamDate, type Cot, type CheckinStatus, type DayAttendance, type RiderScanResult } from "@/lib/attendance/cot-attendance";
import { RiderAttendanceScanner } from "./rider-attendance-scanner";
import { demoAttendance, demoRiders } from "./cot-attendance-demo";
import styles from "./cot-attendance-view.module.css";

const timeFormat = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const emptyAttendance = (): DayAttendance => ({ checkins: {}, pickup: {} });
const storageKey = (date: string, demo: boolean) => `rider-ops-cot-attendance-v1:${demo ? "demo" : "live"}:${date}`;
const rowKey = (cot: Cot, id: string) => `${cot}:${id}`;
type Filter = "all" | CheckinStatus;
type AttendanceRow = { rider: Rider; cot: Cot; key: string; hasPickup: boolean; checkin?: string; status: CheckinStatus; lateMinutes: number; deadline: Date };

export function CotAttendanceView({ demo = false, initialDate }: { demo?: boolean; initialDate: string }) {
  const [date, setDate] = useState(initialDate);
  const [now, setNow] = useState(() => new Date(`${initialDate}T16:35:00+07:00`));
  const [demoTime, setDemoTime] = useState("16:35");
  const [active, setActive] = useState<Record<Cot, boolean>>({ COT1: false, COT2: true });
  const [riders, setRiders] = useState<Rider[]>(demo ? demoRiders : []);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [attendance, setAttendance] = useState<DayAttendance>(() => demo ? demoAttendance(initialDate) : emptyAttendance());
  const [loadedDay, setLoadedDay] = useState(demo ? initialDate : "");
  const [canEdit, setCanEdit] = useState(demo);
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [modal, setModal] = useState<"checkin" | "rules" | "undo" | null>(null);
  const [checkinQuery, setCheckinQuery] = useState("");
  const [undoRow, setUndoRow] = useState<AttendanceRow | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const tick = () => setNow(demo ? new Date(`${date}T${demoTime}:00+07:00`) : new Date());
    tick();
    if (!demo) { const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer); }
  }, [date, demo, demoTime]);

  useEffect(() => {
    let saved = demo ? demoAttendance(date) : emptyAttendance();
    try { const raw = window.localStorage.getItem(storageKey(date, demo)); if (raw) saved = parseStoredAttendance(JSON.parse(raw)); }
    // Browser storage is an external source; load it only after hydration and when the selected day changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    catch { setStorageError("Không đọc được dữ liệu lưu trên thiết bị. Hãy xuất báo cáo để giữ lại lượt điểm danh."); }
    setAttendance(saved);
    setLoadedDay(date);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey(date, demo)) return;
      try { setAttendance(event.newValue ? parseStoredAttendance(JSON.parse(event.newValue)) : demo ? demoAttendance(date) : emptyAttendance()); }
      catch { setStorageError("Không thể đọc dữ liệu từ tab khác."); }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [date, demo]);

  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    // A new request must block check-in until the roster and edit permission are available.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setError("");
    void (async () => {
      try {
        const response = await fetch(`/api/attendance/schedule?month=${date.slice(0, 7)}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json() as { success?: boolean; riders?: Rider[]; logs?: AttendanceLog[]; can_edit?: boolean; error?: string };
        if (!response.ok || !result.success) throw new Error(result.error || "Không thể tải danh sách rider.");
        setRiders(result.riders ?? []); setLogs(result.logs ?? []); setCanEdit(Boolean(result.can_edit));
      } catch (caught) { if (!controller.signal.aborted) { setError(caught instanceof Error ? caught.message : "Không thể tải dữ liệu."); setRiders([]); setLogs([]); setCanEdit(false); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [date, demo, revision]);

  useEffect(() => { if (!message) return; const timer = window.setTimeout(() => setMessage(""), 4500); return () => window.clearTimeout(timer); }, [message]);

  const ready = loadedDay === date && !loading;
  const isToday = date === vietnamDate(now);
  const editable = ready && canEdit && (demo || isToday) && !error;
  const rows = useMemo(() => {
    const dayLogs = new Map(logs.filter((log) => log.work_date.slice(0, 10) === date).map((log) => [log.rider_id ?? log.rider_code, log]));
    return riders.flatMap((rider): AttendanceRow[] => {
      const cot = cotForRider(rider.cot);
      if (!cot || !active[cot] || ["INACTIVE", "RESIGNED", "TERMINATED"].includes(rider.status?.toUpperCase() ?? "")) return [];
      const key = rowKey(cot, rider.id), log = dayLogs.get(rider.id) ?? dayLogs.get(rider.rider_code);
      const storedRecord = ready ? attendance.checkins[key] : undefined;
      const record = storedRecord && storedRecord.cot === cot && vietnamDate(new Date(storedRecord.at)) === date && new Date(storedRecord.at) <= now ? storedRecord : undefined;
      const hasPickup = record?.hasPickup ?? attendance.pickup[key] ?? hasPickupRoute(rider, log);
      const result = classifyAttendance({ cot, hasPickup, day: date, now, checkin: record, scheduledOff: isScheduledOff(log) });
      return [{ rider, cot, key, hasPickup, ...result, checkin: record && new Date(record.at) <= now ? record.at : undefined }];
    });
  }, [active, attendance, date, logs, now, ready, riders]);
  const stats = useMemo(() => {
    const counts: Record<CheckinStatus, number> = { pending: 0, ontime: 0, late: 0, absent: 0, off: 0 };
    rows.forEach((row) => counts[row.status]++);
    return { ...counts, total: rows.length - counts.off, present: counts.ontime + counts.late };
  }, [rows]);
  const matches = (row: AttendanceRow, text: string) => normalizeSearch(`${row.rider.full_name ?? ""} ${row.rider.rider_code} ${row.rider.pickup_district ?? ""} ${row.rider.pickup_ward ?? ""}`).includes(normalizeSearch(text.trim()));
  const visible = rows.filter((row) => (filter === "all" || row.status === filter) && matches(row, query));
  const cots = (["COT1", "COT2"] as Cot[]).filter((cot) => active[cot]);
  const candidateRows = rows.filter((row) => !row.checkin && row.status !== "off" && matches(row, checkinQuery));

  function commit(update: (current: DayAttendance) => DayAttendance) {
    let current = attendance;
    try { const raw = localStorage.getItem(storageKey(date, demo)); if (raw) current = parseStoredAttendance(JSON.parse(raw)); } catch { /* Keep the current session usable when browser storage is unavailable. */ }
    const next = update(current);
    try { localStorage.setItem(storageKey(date, demo), JSON.stringify(next)); }
    catch { setStorageError("Lượt điểm danh chỉ giữ trong phiên này vì trình duyệt không cho lưu. Hãy xuất báo cáo trước khi đóng trang."); }
    setAttendance(next);
    return next;
  }

  function checkIn(row: AttendanceRow): RiderScanResult {
    const code = row.rider.rider_code, name = row.rider.full_name ?? code;
    if (!editable) return { kind: "error", code, message: "Chưa thể điểm danh. Kiểm tra ngày, quyền truy cập và dữ liệu rider." };
    if (row.status === "off") return { kind: "error", code, message: `${name} đang nghỉ theo lịch.`, detail: "Kiểm tra lịch làm việc trước khi điểm danh." };
    const at = demo ? now : new Date();
    let alreadyCheckedIn = false;
    const next = commit((current) => {
      const prior = current.checkins[row.key];
      if (prior && prior.cot === row.cot && vietnamDate(new Date(prior.at)) === date && new Date(prior.at) <= at) { alreadyCheckedIn = true; return current; }
      return { ...current, checkins: { ...current.checkins, [row.key]: { at: at.toISOString(), cot: row.cot, hasPickup: current.pickup[row.key] ?? row.hasPickup } } };
    });
    const saved = next.checkins[row.key];
    if (alreadyCheckedIn) return { kind: "duplicate", code, message: `${name} đã điểm danh trước đó.`, detail: `${row.cot} · ${timeFormat.format(new Date(saved.at))} · Giữ nguyên giờ điểm danh` };
    const result = classifyAttendance({ cot: row.cot, hasPickup: saved.hasPickup, day: date, now: at, checkin: saved });
    setMessage(`Đã điểm danh ${row.rider.full_name ?? row.rider.rider_code} lúc ${timeFormat.format(at)}.`);
    return { kind: "success", code, message: `Đã điểm danh ${name}`, detail: `${row.cot} · ${timeFormat.format(at)} · ${result.status === "late" ? `Đi trễ ${result.lateMinutes} phút` : "Đúng giờ"}` };
  }

  function scanRider(rawCode: string): RiderScanResult {
    const match = resolveScannedRider(rawCode, riders);
    if ("error" in match) return { kind: "error", code: match.code, message: match.error };
    const { rider, code } = match;
    const cot = cotForRider(rider.cot);
    if (!cot) return { kind: "error", code, message: "Rider chưa được xếp vào COT1 hoặc COT2." };
    if (!active[cot]) return { kind: "error", code, message: `${cot} đang tắt. Bật ${cot} để điểm danh rider này.`, detail: rider.full_name ?? code };
    const row = rows.find((item) => item.rider.id === rider.id && item.cot === cot);
    if (!row) return { kind: "error", code, message: "Rider không có trong danh sách đang hoạt động của ca.", detail: rider.full_name ?? code };
    // Resolve against the complete active roster, regardless of the search or status filter on the table.
    return checkIn(row);
  }

  function changePickup(row: AttendanceRow, value: boolean) {
    if (!editable || row.checkin || row.status === "off") return;
    commit((current) => ({ ...current, pickup: { ...current.pickup, [row.key]: value } }));
  }

  function exportReport() {
    const cell = (value: string | number) => { const text = String(value); return `"${(/^[=+@\-\t\r]/.test(text) ? "'" : "") + text.replace(/"/g, '""')}"`; };
    const data = [["Ngày", "Mã rider", "Họ tên", "Ca", "Tuyến pick", "Hạn có mặt", "Giờ điểm danh", "Trạng thái", "Phút trễ", "Nguồn"], ...visible.map((r) => [date, r.rider.rider_code, r.rider.full_name ?? "", r.cot, r.hasPickup ? "Có tuyến pick" : "Không có tuyến pick", timeFormat.format(r.deadline), r.checkin ? timeFormat.format(new Date(r.checkin)) : "", STATUS_LABELS[r.status], r.lateMinutes, demo ? "Dữ liệu mẫu" : "Lưu trên thiết bị"])];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + data.map((row) => row.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `diem-danh-${date}${demo ? "-mau" : ""}.csv`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(`Đã xuất ${visible.length} rider trong danh sách đang lọc.`);
  }

  const statusBadge = (row: AttendanceRow) => <span className={`${styles.badge} ${styles[row.status]}`}><span aria-hidden="true" />{STATUS_LABELS[row.status]}</span>;
  const pickupControl = (row: AttendanceRow) => <label className={styles.pickup}><Truck size={14} aria-hidden="true" /><select aria-label={`Tuyến pick của ${row.rider.full_name ?? row.rider.rider_code}`} value={row.hasPickup ? "yes" : "no"} disabled={!editable || Boolean(row.checkin) || row.status === "off"} onChange={(event) => changePickup(row, event.target.value === "yes")}><option value="no">Không có tuyến pick</option><option value="yes">Có tuyến pick</option></select>{row.hasPickup && row.rider.pickup_district ? <small>{row.rider.pickup_district}</small> : null}</label>;
  const rowAction = (row: AttendanceRow) => row.checkin ? <button type="button" className={styles.undo} disabled={!editable} onClick={() => { setUndoRow(row); setModal("undo"); }} aria-label={`Hủy điểm danh ${row.rider.full_name ?? row.rider.rider_code}`}>Hủy điểm danh</button> : <button type="button" className={styles.rowButton} onClick={() => checkIn(row)} disabled={!editable || row.status === "off"}><Check size={14} aria-hidden="true" />Điểm danh</button>;

  return <section className={styles.root} aria-label="Điểm danh COT">
    <header className={styles.heading}><div><p className={styles.eyebrow}><span />RIDER OPERATIONS</p><h1>Điểm danh rider</h1><p className={styles.subtitle}>Theo dõi ca làm, nắm rõ ai đã có mặt.</p></div><div className={styles.headingActions}><label className={styles.date}><CalendarDays size={16} aria-hidden="true" /><input aria-label="Ngày điểm danh" type="date" value={date} onChange={(event) => { if (event.target.value) { setDate(event.target.value); setModal(null); } }} /></label><button type="button" aria-label="Xuất báo cáo" className={styles.button} disabled={!ready || !rows.length} onClick={exportReport}><Download size={16} aria-hidden="true" /><span>Xuất báo cáo</span></button><button type="button" className={`${styles.button} ${styles.primary}`} disabled={!editable || !candidateRows.length} onClick={() => { setCheckinQuery(""); setModal("checkin"); }}><Plus size={17} aria-hidden="true" />Điểm danh rider</button></div></header>
    {demo ? <div className={styles.demoBanner}><Info size={16} aria-hidden="true" /><span><strong>Bản xem thử</strong> · Tên và lượt điểm danh đều là dữ liệu mẫu.</span><label>Giờ mô phỏng <select aria-label="Giờ mô phỏng" value={demoTime} onChange={(event) => setDemoTime(event.target.value)}>{["10:50", "11:10", "12:10", "15:55", "16:05", "16:25", "16:35"].map((time) => <option key={time}>{time}</option>)}</select></label></div> : null}
    <RiderAttendanceScanner key={`${date}:${cots.join(",")}`} enabled={editable && cots.length > 0 && modal === null} context={`${date.split("-").reverse().join("/")} · ${cots.join(" & ") || "Chưa bật ca"}`} disabledReason={!ready ? "Đang tải danh sách rider..." : !cots.length ? "Bật COT1 hoặc COT2 để quét" : !canEdit ? "Tài khoản chỉ được xem" : !isToday && !demo ? "Chỉ điểm danh cho ngày hôm nay" : modal !== null ? "Hoàn tất hộp thoại để tiếp tục quét" : "Chưa thể điểm danh"} onScan={scanRider} />
    <div className={styles.sectionLabel}><h2>Ca điểm danh</h2><span>Bật ca bạn muốn theo dõi</span></div>
    <div className={styles.shifts}>{(["COT1", "COT2"] as Cot[]).map((cot) => { const Icon = cot === "COT1" ? Sun : Sunset; return <article key={cot} className={`${styles.shift} ${active[cot] ? styles.shiftActive : ""}`}><div className={styles.shiftTop}><div className={styles.shiftName}><span className={styles.shiftIcon}><Icon size={20} aria-hidden="true" /></span><h3>{cot}</h3><span className={styles.shiftLabel}>{active[cot] ? "Đang theo dõi" : "Đã tắt"}</span></div><button type="button" className={styles.switch} role="switch" aria-checked={active[cot]} aria-label={`Bật tắt ${cot}`} onClick={() => setActive((value) => ({ ...value, [cot]: !value[cot] }))}><span /></button></div><div className={styles.rules}><div><span>Không có tuyến pick</span><strong>{COT_DEADLINES[cot].noPickup}<small>phải có mặt</small></strong></div><div><span>Có tuyến pick</span><strong>{COT_DEADLINES[cot].pickup}<small>phải có mặt</small></strong></div></div></article>; })}</div>
    <div className={styles.ruleNote}><Info size={16} aria-hidden="true" /><p>{cots.length ? <>Đang theo dõi <strong>{cots.join(" & ")}</strong> · Sau giờ quy định, rider chưa điểm danh được tính <strong>vắng mặt</strong>.</> : "Bật COT1 hoặc COT2 để bắt đầu điểm danh."}</p><button type="button" onClick={() => setModal("rules")}>Xem quy tắc</button><span className={styles.clock}><Clock3 size={14} aria-hidden="true" />{timeFormat.format(now)}<small>{demo ? "Mô phỏng" : "GMT+7"}</small></span></div>
    {error ? <div className={styles.error} role="alert"><span>{error}</span><button className={styles.button} onClick={() => setRevision((value) => value + 1)} type="button"><RefreshCcw size={15} />Thử lại</button></div> : null}
    {storageError ? <p className={styles.error} role="alert">{storageError}</p> : null}
    {!canEdit && ready && !demo && !error ? <p className={styles.readonly}>Tài khoản chỉ có quyền xem. Cần quyền Admin hoặc Leader để điểm danh.</p> : null}
    {!isToday && !demo ? <p className={styles.readonly}>Đang xem ngày {date.split("-").reverse().join("/")}. Chỉ có thể điểm danh cho ngày hôm nay.</p> : null}
    <div className={styles.stats}><article><div className={styles.statLabel}>Tổng rider trong ca<UsersRound size={17} aria-hidden="true" /></div><strong>{ready ? stats.total : "—"}<small>rider</small></strong><p>{cots.join(" + ") || "Chưa bật ca"}{stats.off ? ` · ${stats.off} nghỉ theo lịch` : ""}</p><div className={styles.progress}><span style={{ width: `${stats.total ? stats.present / stats.total * 100 : 0}%` }} /></div></article><article><div className={styles.statLabel}>Đã có mặt<CheckCircle2 size={17} className={styles.successText} aria-hidden="true" /></div><strong>{ready ? stats.present : "—"}</strong><p className={styles.successText}>{stats.ontime} đúng giờ · {stats.total ? Math.round(stats.present / stats.total * 100) : 0}% có mặt</p></article><button type="button" className={`${styles.statButton} ${filter === "late" ? styles.statSelected : ""}`} onClick={() => setFilter(filter === "late" ? "all" : "late")} aria-pressed={filter === "late"}><div className={styles.statLabel}>Đi trễ<Clock3 size={17} className={styles.warningText} aria-hidden="true" /></div><strong>{ready ? stats.late : "—"}</strong><p className={styles.warningText}>Đã điểm danh sau giờ quy định<ArrowRight size={13} aria-hidden="true" /></p></button><button type="button" className={`${styles.statButton} ${filter === "absent" ? styles.statSelected : ""}`} onClick={() => setFilter(filter === "absent" ? "all" : "absent")} aria-pressed={filter === "absent"}><div className={styles.statLabel}>Vắng mặt<UserRoundX size={17} className={styles.errorText} aria-hidden="true" /></div><strong>{ready ? stats.absent : "—"}</strong><p className={styles.errorText}>Quá giờ, chưa có mặt<ArrowRight size={13} aria-hidden="true" /></p></button></div>
    <section className={styles.panel}><div className={styles.panelHeader}><div className={styles.listHeading}><div><h2>Danh sách rider</h2><p>{cots.join(" & ") || "Chưa chọn ca"} · {date.split("-").reverse().join("/")} · {stats.pending} đang chờ điểm danh</p></div><button className={styles.refresh} type="button" aria-label="Tải lại danh sách rider" disabled={loading || demo} onClick={() => setRevision((v) => v + 1)}><RefreshCcw size={17} className={loading ? styles.spinning : ""} aria-hidden="true" /></button></div><div className={styles.toolbar}><div className={styles.tabs} aria-label="Lọc trạng thái">{(["all", "ontime", "late", "absent", "pending", ...(stats.off ? ["off"] : [])] as Filter[]).map((value) => <button type="button" key={value} className={filter === value ? styles.tabActive : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "all" ? "Tất cả" : STATUS_LABELS[value]}<span>{value === "all" ? rows.length : stats[value]}</span></button>)}</div><label className={styles.search}><Search size={16} aria-hidden="true" /><input aria-label="Tìm rider" placeholder="Tìm tên hoặc mã rider..." value={query} onChange={(e) => setQuery(e.target.value)} />{query ? <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setQuery("")}><X size={15} /></button> : null}</label></div></div>
    {loading || !ready ? <div className={styles.empty} role="status"><Loader2 className={styles.spinning} size={27} /><strong>Đang tải danh sách rider...</strong></div> : !visible.length ? <div className={styles.empty}><UsersRound size={30} aria-hidden="true" /><strong>{!cots.length ? "Chưa bật ca điểm danh" : rows.length ? "Không có rider phù hợp" : "Chưa có rider trong ca đã chọn"}</strong><p>{!cots.length ? "Bật COT1 hoặc COT2 ở phía trên để tiếp tục." : rows.length ? "Thử trạng thái khác hoặc xóa từ khóa tìm kiếm." : "Kiểm tra COT của rider trong mục Riders."}</p>{(query || filter !== "all") ? <button className={styles.button} onClick={() => { setQuery(""); setFilter("all"); }}>Xóa bộ lọc</button> : null}</div> : <><div className={styles.tableWrap}><table><thead><tr><th>Rider</th><th>Ca</th><th>Tuyến pick</th><th>Giờ phải có mặt</th><th>Giờ điểm danh</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{visible.map((row) => <tr key={row.key}><td><RiderIdentity rider={row.rider} /></td><td><span className={styles.cotBadge}>{row.cot}</span></td><td>{pickupControl(row)}</td><td className={styles.time}>{timeFormat.format(row.deadline)}</td><td className={styles.time}>{row.checkin ? timeFormat.format(new Date(row.checkin)) : <span className={styles.dash}>—</span>}{row.lateMinutes ? <small className={styles.warningText}>Trễ {row.lateMinutes} phút</small> : null}</td><td>{statusBadge(row)}</td><td>{rowAction(row)}</td></tr>)}</tbody></table></div><div className={styles.mobileList}>{visible.map((row) => <article key={row.key}><div className={styles.mobileTop}><RiderIdentity rider={row.rider} />{statusBadge(row)}</div><div className={styles.mobileDetails}><span>{row.cot} · Hạn có mặt <strong>{timeFormat.format(row.deadline)}</strong></span><span>{row.checkin ? <>Đã đến <strong>{timeFormat.format(new Date(row.checkin))}</strong>{row.lateMinutes ? ` · trễ ${row.lateMinutes} phút` : ""}</> : "Chưa điểm danh"}</span></div><div className={styles.mobileBottom}>{pickupControl(row)}{rowAction(row)}</div></article>)}</div></>}
    <footer className={styles.tableFooter}><span>Hiển thị {ready ? visible.length : 0} / {rows.length} rider</span><span><Info size={13} aria-hidden="true" />Vắng mặt tự cập nhật sau giờ phải có mặt</span></footer></section>
    <footer className={styles.footer}><span><ShieldCheck size={14} aria-hidden="true" />{demo ? "Dữ liệu mẫu, dùng để xem thử giao diện" : "Lượt điểm danh lưu trên trình duyệt này · Chưa đồng bộ giữa thiết bị"}</span>{!demo ? <Link href="/attendance/preview" target="_blank">Xem giao diện với dữ liệu mẫu<ArrowRight size={13} aria-hidden="true" /></Link> : null}</footer>
    {message ? <div className={styles.toast} role="status"><CheckCircle2 size={17} aria-hidden="true" />{message}</div> : null}
    <AttendanceDialog open={modal !== null} onClose={() => setModal(null)} title={modal === "checkin" ? "Điểm danh rider" : modal === "undo" ? "Hủy lượt điểm danh?" : "Quy tắc điểm danh"}>
      {modal === "checkin" ? <><p className={styles.dialogDescription}>Ghi nhận lúc {timeFormat.format(now)} · {cots.join(" & ")}</p><label className={styles.search}><Search size={17} aria-hidden="true" /><input autoFocus aria-label="Tìm rider để điểm danh" value={checkinQuery} onChange={(e) => setCheckinQuery(e.target.value)} placeholder="Nhập tên hoặc mã rider..." /></label><div className={styles.candidates}>{candidateRows.length ? candidateRows.map((row) => <button key={row.key} className={styles.candidate} disabled={!editable} type="button" onClick={() => checkIn(row)}><RiderIdentity rider={row.rider} /><span>{row.cot} · {timeFormat.format(row.deadline)}<small>Điểm danh <ArrowRight size={13} /></small></span></button>) : <p className={styles.dialogDescription}>Không có rider chưa điểm danh phù hợp.</p>}</div></> : modal === "undo" && undoRow ? <><p className={styles.dialogDescription}>{undoRow.rider.full_name ?? undoRow.rider.rider_code} · {undoRow.cot}</p><p>Rider sẽ trở về trạng thái chờ điểm danh hoặc vắng mặt, tùy giờ phải có mặt.</p><div className={styles.dialogActions}><button type="button" className={styles.button} onClick={() => setModal(null)}>Giữ điểm danh</button><button type="button" className={`${styles.button} ${styles.primary}`} disabled={!editable} onClick={() => { commit((current) => { const checkins = { ...current.checkins }; delete checkins[undoRow.key]; return { ...current, checkins }; }); setModal(null); setMessage("Đã hủy lượt điểm danh."); }}>Hủy lượt điểm danh</button></div></> : <><p className={styles.dialogDescription}>Giờ áp dụng theo múi giờ Việt Nam (GMT+7).</p><div className={styles.ruleTable}><div><strong>Ca</strong><strong>Không tuyến pick</strong><strong>Có tuyến pick</strong></div>{(["COT1", "COT2"] as Cot[]).map((cot) => <div key={cot}><strong>{cot}</strong><span>{COT_DEADLINES[cot].noPickup}</span><span>{COT_DEADLINES[cot].pickup}</span></div>)}</div><ul className={styles.ruleList}><li>Đến đúng mốc giờ: <strong>Đúng giờ</strong>.</li><li>Chưa điểm danh trước hạn: <strong>Chờ điểm danh</strong>.</li><li>Quá hạn, chưa điểm danh: <strong>Vắng mặt</strong>.</li><li>Điểm danh sau hạn: <strong>Đi trễ</strong>, kèm số phút trễ.</li><li>Tắt COT chỉ ẩn ca khỏi danh sách và thống kê. Lượt điểm danh vẫn được giữ.</li><li>Rider nghỉ tuần hoặc nghỉ có phép không tính vào quân số phải có mặt.</li></ul></>}
    </AttendanceDialog>
  </section>;
}

function RiderIdentity({ rider }: { rider: Rider }) {
  const name = rider.full_name ?? rider.rider_code;
  const initials = name.split(" ").slice(-2).map((part) => part[0]).join("");
  return <div className={styles.identity}><span className={styles.avatar} aria-hidden="true">{initials}</span><span><strong>{name}</strong><small>{rider.rider_code}</small></span></div>;
}

function AttendanceDialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open && !ref.current?.open) ref.current?.showModal(); else if (!open && ref.current?.open) ref.current.close(); }, [open]);
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="cot-dialog-title"
      aria-modal={open || undefined}
      onCancel={onClose}
      onClose={onClose}
    >
      <header>
        <h2 id="cot-dialog-title">{title}</h2>
        <button type="button" aria-label="Đóng hộp thoại" onClick={onClose}><X size={19} /></button>
      </header>
      <div className={styles.dialogBody}>{children}</div>
    </dialog>
  );
}
