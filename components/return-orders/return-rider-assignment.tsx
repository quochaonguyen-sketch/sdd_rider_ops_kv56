"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, ChevronDown, LoaderCircle, Search, UserRoundPlus, X } from "lucide-react";
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
  const boxRef = useRef<HTMLDivElement>(null);
  const [riders, setRiders] = useState<RiderOption[]>([]);
  const [selectedCode, setSelectedCode] = useState(currentRiderCode);
  const [riderQuery, setRiderQuery] = useState("");
  const [riderListOpen, setRiderListOpen] = useState(false);
  const [state, setState] = useState<AssignmentState>("idle");
  const [message, setMessage] = useState("");
  const [canAssign, setCanAssign] = useState(true);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setRiderListOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

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
    setRiderQuery("");
    setRiderListOpen(false);
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

  const normalizeRiderText = (value: string) =>
    value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi");

  const riderLabel = (rider: RiderOption) =>
    `${rider.rider_code} · ${rider.full_name || "Chưa có tên"} · ${rider.cot || "Chưa COT"} · ${rider.kv || "Chưa KV"}`;

  const selectedRider = riders.find((rider) => rider.rider_code === selectedCode);
  const filteredRiders = riderQuery.trim()
    ? riders.filter((rider) => normalizeRiderText(riderLabel(rider)).includes(normalizeRiderText(riderQuery)))
    : riders;
  const currentMissing =
    currentRiderCode && !riders.some((rider) => rider.rider_code === currentRiderCode);
  const showUnassign = manualAssignment && !riderQuery.trim();
  const showCurrentMissing = Boolean(currentMissing) && !riderQuery.trim();
  const listEmpty = !filteredRiders.length && !showUnassign && !showCurrentMissing;

  const riderInputValue = (() => {
    if (riderListOpen || riderQuery) return riderQuery;
    if (!selectedCode) return "";
    if (selectedRider) return riderLabel(selectedRider);
    if (showCurrentMissing) return `${currentRiderCode} · ${currentRiderName || "Rider hiện tại"}`;
    return selectedCode;
  })();

  const selectRider = (code: string) => {
    setSelectedCode(code);
    setRiderQuery("");
    setRiderListOpen(false);
    setState("idle");
    setMessage("");
  };

  const onRiderInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setRiderListOpen(false);
    } else if (event.key === "Enter" && riderListOpen) {
      event.preventDefault();
      if (filteredRiders.length) selectRider(filteredRiders[0].rider_code);
    }
  };

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
            <div className="return-assignment-field">
              <label htmlFor={`assign-rider-${shipmentId}`}>Rider trả hàng</label>
              <div className="return-assignment-combobox" ref={boxRef}>
                <div className="return-assignment-combobox-input">
                  <Search aria-hidden="true" />
                  <input
                    id={`assign-rider-${shipmentId}`}
                    autoFocus
                    value={riderInputValue}
                    placeholder="Tìm rider theo mã, tên, COT hoặc KV…"
                    autoComplete="off"
                    disabled={state === "saving"}
                    aria-invalid={state === "error"}
                    aria-describedby={`assign-message-${shipmentId}`}
                    onChange={(event) => {
                      setRiderQuery(event.target.value);
                      setRiderListOpen(true);
                      setState("idle");
                      setMessage("");
                    }}
                    onFocus={() => setRiderListOpen(true)}
                    onKeyDown={onRiderInputKeyDown}
                  />
                  <button
                    type="button"
                    onClick={() => setRiderListOpen((open) => !open)}
                    disabled={state === "saving"}
                    aria-label={riderListOpen ? "Thu danh sách rider" : "Mở danh sách rider"}
                  >
                    <ChevronDown aria-hidden="true" />
                  </button>
                </div>
                {riderListOpen ? (
                  <ul className="return-assignment-combobox-list" role="listbox" aria-label="Danh sách rider trả hàng">
                    {showUnassign ? (
                      <li>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selectedCode === ""}
                          className={selectedCode === "" ? "is-selected" : undefined}
                          onClick={() => selectRider("")}
                        >
                          <span className="return-assignment-option-name">Bỏ gán thủ công</span>
                          <small className="return-assignment-option-meta">Không gán rider cho đơn này</small>
                          <span className="return-assignment-option-check">{selectedCode === "" ? <Check aria-hidden="true" /> : null}</span>
                        </button>
                      </li>
                    ) : null}
                    {showCurrentMissing ? (
                      <li>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selectedCode === currentRiderCode}
                          className={selectedCode === currentRiderCode ? "is-selected" : undefined}
                          onClick={() => selectRider(currentRiderCode)}
                        >
                          <span className="return-assignment-option-name">{currentRiderCode} · {currentRiderName || "Rider hiện tại"}</span>
                          <small className="return-assignment-option-meta">Rider đang gán</small>
                          <span className="return-assignment-option-check">{selectedCode === currentRiderCode ? <Check aria-hidden="true" /> : null}</span>
                        </button>
                      </li>
                    ) : null}
                    {filteredRiders.map((rider) => (
                      <li key={rider.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={rider.rider_code === selectedCode}
                          className={rider.rider_code === selectedCode ? "is-selected" : undefined}
                          onClick={() => selectRider(rider.rider_code)}
                        >
                          <span className="return-assignment-option-name">{rider.full_name || "Chưa có tên"}</span>
                          <small className="return-assignment-option-meta">{rider.rider_code} · {rider.cot || "Chưa COT"} · {rider.kv || "Chưa KV"}</small>
                          <span className="return-assignment-option-check">{rider.rider_code === selectedCode ? <Check aria-hidden="true" /> : null}</span>
                        </button>
                      </li>
                    ))}
                    {listEmpty ? (
                      <li className="return-assignment-combobox-empty">Không tìm thấy rider phù hợp</li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
            </div>
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
