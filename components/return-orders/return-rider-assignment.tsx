"use client";

import { useRef, useState } from "react";
import { AlertCircle, Check, LoaderCircle, UserRoundPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";

type RiderOption = {
  id: string;
  rider_code: string;
  full_name: string | null;
  cot: string | null;
  kv: string | null;
};

type RiderResponse = {
  success: boolean;
  can_assign?: boolean;
  riders?: RiderOption[];
  error?: string;
};

type AssignmentState = "idle" | "loading" | "saving" | "success" | "error";

let riderOptionsRequest: Promise<RiderResponse> | null = null;

function loadRiderOptions() {
  riderOptionsRequest ??= fetch("/api/return-orders/assign", {
    cache: "no-store",
  }).then(async (response) => {
    const data = (await response.json().catch(() => null)) as RiderResponse | null;
    if (!response.ok || !data?.success) {
      throw new Error(data?.error || "Không tải được danh sách rider");
    }
    return data;
  });
  return riderOptionsRequest;
}

export function ReturnRiderAssignment({
  shipmentId,
  currentRiderCode,
  currentRiderName,
  manualAssignment,
  returnZone,
  sellerArea,
}: {
  shipmentId: string;
  currentRiderCode: string;
  currentRiderName: string;
  manualAssignment: boolean;
  returnZone: string;
  sellerArea: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [riders, setRiders] = useState<RiderOption[]>([]);
  const [selectedCode, setSelectedCode] = useState(currentRiderCode);
  const [state, setState] = useState<AssignmentState>("idle");
  const [message, setMessage] = useState("");
  const [canAssign, setCanAssign] = useState(true);

  const openDialog = async () => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    if (riders.length || state === "loading") return;

    setState("loading");
    setMessage("");
    try {
      const result = await loadRiderOptions();
      setCanAssign(Boolean(result.can_assign));
      setRiders(result.riders ?? []);
      setState("idle");
      if (!result.can_assign) setMessage("Tài khoản này chỉ có quyền xem đơn trả.");
    } catch (error) {
      riderOptionsRequest = null;
      setState("error");
      setMessage(error instanceof Error ? error.message : "Không tải được danh sách rider");
    }
  };

  const closeDialog = () => {
    dialogRef.current?.close();
    setSelectedCode(currentRiderCode);
    setState("idle");
    setMessage("");
  };

  const save = async () => {
    setState("saving");
    setMessage("");
    try {
      const response = await fetch("/api/return-orders/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipment_id: shipmentId,
          rider_code: selectedCode || null,
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Không thể gán rider");
      }

      setState("success");
      router.refresh();
      dialogRef.current?.close();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Không thể gán rider");
    }
  };

  const currentMissing =
    currentRiderCode && !riders.some((rider) => rider.rider_code === currentRiderCode);
  const triggerLabel = manualAssignment || currentRiderCode ? "Đổi rider" : "Gán rider";

  return (
    <div className="return-rider-assignment" data-state={state}>
      <button
        type="button"
        className="return-rider-assignment-toggle"
        onClick={openDialog}
        aria-haspopup="dialog"
      >
        {state === "success" ? <Check aria-hidden="true" /> : <UserRoundPlus aria-hidden="true" />}
        <span>{state === "success" ? "Đã cập nhật" : triggerLabel}</span>
      </button>

      <dialog
        ref={dialogRef}
        className="return-rider-assignment-dialog"
        aria-labelledby={`assign-title-${shipmentId}`}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
      >
        <form
          className="return-rider-assignment-panel"
          data-state={state}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <header>
            <div>
              <h3 id={`assign-title-${shipmentId}`}>
                {currentRiderCode ? "Đổi rider trả hàng" : "Gán rider trả hàng"}
              </h3>
              <p className="return-assignment-shipment">{shipmentId}</p>
            </div>
            <button
              type="button"
              className="return-assignment-close"
              onClick={closeDialog}
              aria-label="Đóng hộp gán rider"
            >
              <X aria-hidden="true" />
            </button>
          </header>

          <dl className="return-assignment-context">
            <div>
              <dt>Tuyến trả</dt>
              <dd>{returnZone || "Chưa phân tuyến"}</dd>
            </div>
            <div>
              <dt>Khu vực</dt>
              <dd>{sellerArea || "Chưa map khu vực"}</dd>
            </div>
          </dl>

          {state === "loading" ? (
            <div className="return-assignment-loading" role="status">
              <LoaderCircle aria-hidden="true" />
              <span>Đang tải danh sách rider…</span>
            </div>
          ) : null}

          {state !== "loading" && canAssign ? (
            <label className="return-assignment-field">
              <span>Rider trả hàng</span>
              <select
                autoFocus
                value={selectedCode}
                onChange={(event) => {
                  setSelectedCode(event.target.value);
                  setState("idle");
                  setMessage("");
                }}
                disabled={state === "saving"}
                aria-invalid={state === "error"}
                aria-describedby={`assign-message-${shipmentId}`}
              >
                <option
                  value=""
                  disabled={Boolean(currentRiderCode) && !manualAssignment}
                >
                  {manualAssignment ? "Bỏ gán thủ công" : "Chọn rider"}
                </option>
                {currentMissing ? (
                  <option value={currentRiderCode}>
                    {currentRiderCode} · {currentRiderName || "Rider hiện tại"}
                  </option>
                ) : null}
                {riders.map((rider) => (
                  <option key={rider.id} value={rider.rider_code}>
                    {rider.rider_code} · {rider.full_name || "Chưa có tên"} · {rider.cot || "Chưa COT"} · {rider.kv || "Chưa KV"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div
            id={`assign-message-${shipmentId}`}
            className={`return-assignment-note is-${state}`}
            role={state === "error" ? "alert" : "status"}
          >
            {state === "error" ? <AlertCircle aria-hidden="true" /> : null}
            <span>{message}</span>
          </div>

          <footer>
            <button
              type="button"
              className="return-assignment-cancel"
              onClick={closeDialog}
            >
              Hủy
            </button>
            {canAssign ? (
              <button
                type="submit"
                className="return-rider-assignment-save"
                disabled={
                  state === "loading" ||
                  state === "saving" ||
                  selectedCode === currentRiderCode
                }
              >
                {state === "saving" ? (
                  <>
                    <LoaderCircle aria-hidden="true" />
                    <span>Đang lưu…</span>
                  </>
                ) : (
                  <>
                    <Check aria-hidden="true" />
                    <span>Lưu rider</span>
                  </>
                )}
              </button>
            ) : null}
          </footer>
        </form>
      </dialog>
    </div>
  );
}
