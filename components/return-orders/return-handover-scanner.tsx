"use client";

import { FormEvent, MouseEvent, useEffect, useRef, useState } from "react";
import { Camera, Check, LoaderCircle, ScanLine, X } from "lucide-react";

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
  const [riderCode, setRiderCode] = useState(riders[0]?.id ?? "");
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

  const close = () => {
    stopCamera();
    dialogRef.current?.close();
  };

  const open = () => {
    setMessage("");
    setManualCode("");
    dialogRef.current?.showModal();
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
        <ScanLine aria-hidden="true" />
        <span>Quét camera bàn giao</span>
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
            <select id="return-handover-rider" value={riderCode} onChange={(event) => setRiderCode(event.target.value)} disabled={busy}>
              {riders.map((rider) => <option key={rider.id} value={rider.id}>{rider.name || rider.id} · {rider.id}</option>)}
            </select>
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
