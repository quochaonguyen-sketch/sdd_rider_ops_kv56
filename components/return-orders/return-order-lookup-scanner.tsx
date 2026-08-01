"use client";

import { FormEvent, MouseEvent, useEffect, useRef, useState } from "react";
import { Camera, LoaderCircle, RotateCcw, ScanSearch, Search, UserRoundCheck, X } from "lucide-react";

type BarcodeDetectorLike = { detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>> };
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;
type LookupRider = {
  code: string;
  name: string;
  kv: string;
  cot: string;
  source: "handover" | "manual" | "returning" | "planned";
};
type LookupOrder = {
  shipmentId: string;
  trackingNumber: string;
  shopeeOrderSn: string;
  status: number;
  statusLabel: string;
  district: string;
  ward: string;
  returnZone: string;
  snapshotAt: string | null;
  confirmedRider: LookupRider | null;
  plannedRiders: LookupRider[];
  planCot1: string;
  planCot2: string;
  handedOverAt: string | null;
};

const sourceLabels: Record<LookupRider["source"], string> = {
  handover: "Đã bàn giao thực tế",
  manual: "Phân công thủ công",
  returning: "Rider đang trả",
  planned: "Rider kế hoạch",
};

function formatDateTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

export function ReturnOrderLookupScanner() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const scanningRef = useRef(false);
  const busyRef = useRef(false);
  const [manualCode, setManualCode] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<LookupOrder | null>(null);

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
    setManualCode("");
    setError("");
    setOrder(null);
    dialogRef.current?.showModal();
  };

  const lookup = async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/return-orders/lookup?code=${encodeURIComponent(code)}`, { cache: "no-store" });
      const result = (await response.json().catch(() => null)) as { success?: boolean; error?: string; order?: LookupOrder } | null;
      if (!response.ok || !result?.success || !result.order) {
        throw new Error(result?.error ?? "Không tra cứu được đơn hàng");
      }
      stopCamera();
      setOrder(result.order);
      setManualCode("");
      if (navigator.vibrate) navigator.vibrate(80);
    } catch (caught) {
      setOrder(null);
      setError(caught instanceof Error ? caught.message : "Không tra cứu được đơn hàng");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const scanLoop = async () => {
    if (!scanningRef.current) return;
    if (!videoRef.current || !videoRef.current.videoWidth || busyRef.current) {
      timerRef.current = window.setTimeout(() => void scanLoop(), 280);
      return;
    }
    try {
      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
      if (!Detector) throw new Error("Trình duyệt này chưa hỗ trợ quét mã trực tiếp. Bạn vẫn có thể nhập mã ở bên dưới.");
      const detector = new Detector({ formats: ["code_128", "code_39", "ean_13", "qr_code"] });
      const codes = await detector.detect(videoRef.current);
      const raw = codes.find((item) => item.rawValue?.trim())?.rawValue;
      if (raw) await lookup(raw);
    } catch (caught) {
      if (caught instanceof Error && caught.message.includes("chưa hỗ trợ")) {
        setError(caught.message);
        stopCamera();
        return;
      }
    }
    if (scanningRef.current) timerRef.current = window.setTimeout(() => void scanLoop(), 280);
  };

  const startCamera = async () => {
    setError("");
    setOrder(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
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
      setError("Không mở được camera. Hãy cấp quyền camera hoặc nhập mã đơn ở bên dưới.");
    }
  };

  const submitManual = (event: FormEvent) => {
    event.preventDefault();
    void lookup(manualCode);
  };

  const closeFromBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) close();
  };

  const reset = () => {
    setOrder(null);
    setError("");
    setManualCode("");
    void startCamera();
  };

  const confirmedRider = order?.confirmedRider;
  const hasPlanText = Boolean(order?.planCot1 || order?.planCot2);

  return (
    <>
      <button type="button" className="return-lookup-trigger" onClick={open}>
        <ScanSearch aria-hidden="true" />
        <span>Quét tra đơn của ai</span>
      </button>
      <dialog ref={dialogRef} className="return-lookup-dialog" onClick={closeFromBackdrop} onClose={stopCamera}>
        <article className="return-lookup-panel">
          <header>
            <div>
              <p>TRA CỨU NHANH</p>
              <h2>Đơn này của rider nào?</h2>
              <span>Quét mã trên kiện hàng để xem người đang giữ đơn hoặc rider trong kế hoạch trả.</span>
            </div>
            <button type="button" onClick={close} aria-label="Đóng tra cứu"><X aria-hidden="true" /></button>
          </header>

          {!order && cameraOn ? (
            <div className="return-lookup-camera-wrap">
              <video ref={videoRef} muted playsInline className="return-lookup-camera" />
              <span className="return-lookup-frame" aria-hidden="true" />
              <p>Giữ mã vận đơn nằm ngang, ngay giữa khung.</p>
              <button type="button" onClick={stopCamera}>Tắt camera</button>
            </div>
          ) : !order ? (
            <button type="button" className="return-lookup-camera-button" onClick={() => void startCamera()} disabled={busy}>
              <Camera aria-hidden="true" />
              <span>Mở camera sau</span>
              <small>Tối ưu cho quét một tay trên điện thoại</small>
            </button>
          ) : null}

          {!order ? (
            <form className="return-lookup-manual" onSubmit={submitManual}>
              <label htmlFor="return-lookup-code">Hoặc nhập mã vận đơn</label>
              <div>
                <input id="return-lookup-code" value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="Ví dụ: SPXVN..." autoComplete="off" autoCapitalize="characters" inputMode="text" />
                <button type="submit" className={busy ? "is-loading" : undefined} disabled={busy || !manualCode.trim()}>
                  {busy ? <LoaderCircle aria-hidden="true" /> : <Search aria-hidden="true" />}
                  {busy ? "Đang tìm" : "Tra cứu"}
                </button>
              </div>
            </form>
          ) : null}

          {error ? <p className="return-lookup-error" role="alert">{error}</p> : null}

          {order ? (
            <section className="return-lookup-result" aria-live="polite">
              <header>
                <span className={confirmedRider ? "is-confirmed" : "is-planned"}>{confirmedRider ? sourceLabels[confirmedRider.source] : "Chưa có rider xác nhận"}</span>
                <strong>{order.shipmentId}</strong>
                <small>{order.status === 72 ? "Đang trả" : order.statusLabel || `Trạng thái ${order.status}`}</small>
              </header>

              {confirmedRider ? (
                <div className="return-lookup-owner">
                  <UserRoundCheck aria-hidden="true" />
                  <div>
                    <small>Rider phụ trách</small>
                    <h3>{confirmedRider.name || confirmedRider.code}</h3>
                    <p>{confirmedRider.code}{confirmedRider.kv ? ` · KV${confirmedRider.kv.match(/\d+/)?.[0] ?? confirmedRider.kv}` : ""}{confirmedRider.cot ? ` · ${confirmedRider.cot}` : ""}</p>
                    {order.handedOverAt ? <time>Bàn giao lúc {formatDateTime(order.handedOverAt)}</time> : null}
                  </div>
                </div>
              ) : order.plannedRiders.length ? (
                <div className="return-lookup-plan">
                  <p>Đơn chưa được rider nhận trả. Rider trong kế hoạch:</p>
                  <ul>{order.plannedRiders.map((rider) => <li key={rider.code}><strong>{rider.name || rider.code}</strong><span>{rider.code}{rider.kv ? ` · KV${rider.kv.match(/\d+/)?.[0] ?? rider.kv}` : ""}</span></li>)}</ul>
                </div>
              ) : hasPlanText ? (
                <div className="return-lookup-plan">
                  <p>Đơn chưa được rider nhận trả. Danh sách kế hoạch:</p>
                  {order.planCot1 ? <div><strong>COT1</strong><span>{order.planCot1}</span></div> : null}
                  {order.planCot2 ? <div><strong>COT2</strong><span>{order.planCot2}</span></div> : null}
                </div>
              ) : (
                <p className="return-lookup-unassigned">Đơn này chưa có rider nhận và cũng chưa có rider trong kế hoạch trả.</p>
              )}

              <dl>
                <div><dt>Zone trả</dt><dd>{order.returnZone || "Chưa có"}</dd></div>
                <div><dt>Địa bàn</dt><dd>{[order.ward, order.district].filter(Boolean).join(" · ") || "Chưa xác định"}</dd></div>
                <div><dt>Shopee</dt><dd>{order.shopeeOrderSn || "—"}</dd></div>
              </dl>
              <button type="button" className="return-lookup-again" onClick={reset}>
                <RotateCcw aria-hidden="true" />Quét đơn khác
              </button>
            </section>
          ) : null}

          <footer><span>Chỉ tra cứu dữ liệu snapshot mới nhất, không ghi nhận bàn giao.</span><button type="button" onClick={close}>Đóng</button></footer>
        </article>
      </dialog>
    </>
  );
}
