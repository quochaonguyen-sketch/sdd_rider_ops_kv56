"use client";

import { FormEvent, KeyboardEvent, MouseEvent, useEffect, useRef, useState } from "react";
import { Camera, Check, ChevronDown, ClipboardCheck, LoaderCircle, ScanLine, Search, X } from "lucide-react";

type ScannerRider = { id: string; name: string; kv: string };
type ScanResult = { shipment_id: string; rider_code: string; rider_name: string; handed_over_at: string; source: string };
type BarcodeDetectorLike = { detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>> };
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

export function ReturnHandoverScanner({ riders }: { riders: ScannerRider[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const scanningRef = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const [riderCode, setRiderCode] = useState(riders[0]?.id ?? "");
  const [riderQuery, setRiderQuery] = useState("");
  const [riderListOpen, setRiderListOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [recent, setRecent] = useState<ScanResult[]>([]);

  const stopCamera = () => {
    scanningRef.current = false;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  useEffect(() => stopCamera, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setRiderListOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const close = () => {
    stopCamera();
    dialogRef.current?.close();
  };

  const open = () => {
    setMessage("");
    setManualCode("");
    dialogRef.current?.showModal();
  };

  const normalizeRiderText = (value: string) =>
    value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi");

  const selectedRider = riders.find((rider) => rider.id === riderCode);
  const filteredRiders = riderQuery.trim()
    ? riders.filter((rider) => normalizeRiderText(`${rider.name} ${rider.id} ${rider.kv}`).includes(normalizeRiderText(riderQuery)))
    : riders;
  const riderInputValue =
    riderListOpen || riderQuery ? riderQuery : selectedRider ? `${selectedRider.name || selectedRider.id} · ${selectedRider.id}` : "";

  const selectRider = (id: string) => {
    setRiderCode(id);
    setRiderQuery("");
    setRiderListOpen(false);
  };

  const onRiderInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setRiderListOpen(false);
    } else if (event.key === "Enter" && filteredRiders.length) {
      event.preventDefault();
      selectRider(filteredRiders[0].id);
    }
  };

  const submitCode = async (rawCode: string, source: "camera" | "manual") => {
    const code = rawCode.trim();
    if (!code || !riderCode || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/return-orders/handover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipment_id: code, rider_code: riderCode, source }),
      });
      const result = (await response.json().catch(() => null)) as { success?: boolean; error?: string; handover?: ScanResult } | null;
      if (!response.ok || !result?.success || !result.handover) throw new Error(result?.error ?? "Không ghi nhận được bàn giao");
      setRecent((current) => [result.handover!, ...current.filter((item) => item.shipment_id !== code)].slice(0, 8));
      setMessage(`Đã ghi nhận bàn giao ${code}`);
      setMessageTone("success");
      setManualCode("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không ghi nhận được bàn giao");
      setMessageTone("error");
    } finally {
      setBusy(false);
    }
  };

  const scanLoop = async () => {
    if (!scanningRef.current) return;
    if (!videoRef.current || !videoRef.current.videoWidth) {
      timerRef.current = window.setTimeout(() => void scanLoop(), 280);
      return;
    }
    try {
      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
      if (!Detector) throw new Error("Trình duyệt chưa hỗ trợ nhận diện mã bằng camera. Dùng ô nhập mã bên dưới.");
      const detector = new Detector({ formats: ["code_128", "code_39", "ean_13", "qr_code"] });
      const codes = await detector.detect(videoRef.current);
      const raw = codes.find((item) => item.rawValue?.trim())?.rawValue;
      if (raw) await submitCode(raw, "camera");
    } catch (error) {
      if (error instanceof Error && error.message.includes("chưa hỗ trợ")) {
        setMessage(error.message);
        setMessageTone("error");
        stopCamera();
        return;
      }
    }
    if (scanningRef.current) timerRef.current = window.setTimeout(() => void scanLoop(), 280);
  };

  const startCamera = async () => {
    setMessage("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      setCameraOn(true);
      requestAnimationFrame(() => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        void videoRef.current.play();
        scanningRef.current = true;
        void scanLoop();
      });
    } catch {
      setMessage("Không mở được camera. Hãy cấp quyền camera hoặc dùng ô nhập mã bên dưới.");
      setMessageTone("error");
    }
  };

  const submitManual = (event: FormEvent) => {
    event.preventDefault();
    void submitCode(manualCode, "manual");
  };

  const closeFromBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) close();
  };

  return (
    <>
      <button type="button" className="return-handover-trigger" onClick={open} disabled={!riders.length}>
        <span className="return-handover-trigger-icon"><ClipboardCheck aria-hidden="true" /></span>
        <span className="return-handover-trigger-copy">
          <strong>Bàn giao cho rider</strong>
          <small>{riders.length ? `${riders.length} rider đang chờ nhận hàng` : "Chưa có rider đang trả hàng"}</small>
        </span>
        <ScanLine aria-hidden="true" className="return-handover-trigger-arrow" />
      </button>
      <dialog ref={dialogRef} className="return-handover-dialog" onClick={closeFromBackdrop} onClose={stopCamera}>
        <article className="return-handover-panel">
          <header>
            <div>
              <p>BÀN GIAO HÀNG TRẢ</p>
              <h2>Quét mã đơn bằng điện thoại</h2>
              <span>Chọn rider một lần, sau đó đưa mã vận đơn vào khung camera.</span>
            </div>
            <button type="button" onClick={close} aria-label="Đóng quét bàn giao"><X aria-hidden="true" /></button>
          </header>

          <div className="return-handover-form">
            <label htmlFor="return-handover-rider">Rider bàn giao</label>
            <div className="return-rider-combobox" ref={boxRef}>
              <div className="return-rider-combobox-input">
                <Search aria-hidden="true" />
                <input
                  id="return-handover-rider"
                  value={riderInputValue}
                  placeholder="Tìm rider theo tên, mã hoặc KV..."
                  autoComplete="off"
                  disabled={busy}
                  onChange={(event) => {
                    setRiderQuery(event.target.value);
                    setRiderListOpen(true);
                  }}
                  onFocus={() => setRiderListOpen(true)}
                  onKeyDown={onRiderInputKeyDown}
                />
                <button
                  type="button"
                  onClick={() => setRiderListOpen((open) => !open)}
                  disabled={busy}
                  aria-label={riderListOpen ? "Thu danh sách rider" : "Mở danh sách rider"}
                >
                  <ChevronDown aria-hidden="true" />
                </button>
              </div>
              {riderListOpen ? (
                <ul className="return-rider-combobox-list" role="listbox" aria-label="Danh sách rider bàn giao">
                  {filteredRiders.length ? (
                    filteredRiders.map((rider) => (
                      <li key={rider.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={rider.id === riderCode}
                          className={rider.id === riderCode ? "is-selected" : undefined}
                          onClick={() => selectRider(rider.id)}
                        >
                          <span className="return-rider-option-name">{rider.name || rider.id}</span>
                          <small className="return-rider-option-code">
                            {rider.kv ? `${rider.kv} · ` : ""}{rider.id}
                          </small>
                          <span className="return-rider-option-check">{rider.id === riderCode ? <Check aria-hidden="true" /> : null}</span>
                        </button>
                      </li>
                    ))
                  ) : (
                    <li className="return-rider-combobox-empty">{riders.length ? "Không tìm thấy rider phù hợp" : "Chưa có rider đang trả hàng"}</li>
                  )}
                </ul>
              ) : null}
            </div>
          </div>

          {cameraOn ? (
            <div className="return-handover-camera-wrap">
              <video ref={videoRef} muted playsInline className="return-handover-camera" />
              <span className="return-handover-frame" aria-hidden="true" />
              <p>Đưa mã vận đơn vào giữa khung. Camera sẽ tự ghi nhận.</p>
              <button type="button" onClick={stopCamera}>Tắt camera</button>
            </div>
          ) : (
            <button type="button" className="return-handover-camera-button" onClick={() => void startCamera()} disabled={busy || !riderCode}>
              <Camera aria-hidden="true" />
              <span>Mở camera sau</span>
            </button>
          )}

          <form className="return-handover-manual" onSubmit={submitManual}>
            <label htmlFor="return-handover-code">Hoặc nhập mã vận đơn</label>
            <div>
              <input id="return-handover-code" value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="Ví dụ: SPXVN..." autoComplete="off" />
              <button type="submit" disabled={busy || !riderCode || !manualCode.trim()}>
                {busy ? <LoaderCircle aria-hidden="true" /> : <Check aria-hidden="true" />}
                {busy ? "Đang ghi..." : "Ghi nhận"}
              </button>
            </div>
          </form>

          {message ? <p className={`return-handover-message is-${messageTone}`} role={messageTone === "error" ? "alert" : "status"}>{message}</p> : null}
          {recent.length ? (
            <section className="return-handover-recent" aria-labelledby="return-handover-recent-title">
              <header><h3 id="return-handover-recent-title">Vừa ghi nhận</h3><span>{recent.length} đơn</span></header>
              <ol>{recent.map((item) => <li key={item.shipment_id}><strong>{item.shipment_id}</strong><span>{item.rider_name || item.rider_code}</span><time>{new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(item.handed_over_at))}</time></li>)}</ol>
            </section>
          ) : null}

          <footer><span>Quét trùng cùng một mã sẽ bị từ chối để tránh ghi nhận hai lần.</span><button type="button" onClick={close}>Đóng</button></footer>
        </article>
      </dialog>
    </>
  );
}
