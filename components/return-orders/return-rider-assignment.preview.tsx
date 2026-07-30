import { AlertCircle, Check, LoaderCircle, UserRoundPlus } from "lucide-react";

const states = [
  ["default", "Gán rider"],
  ["hover", "Gán rider"],
  ["focus", "Gán rider"],
  ["active", "Gán rider"],
  ["disabled", "Gán rider"],
  ["loading", "Đang tải…"],
  ["error", "Thử lại"],
  ["success", "Đã cập nhật"],
] as const;

export function ReturnRiderAssignmentPreview() {
  return (
    <section className="return-assignment-preview" aria-label="Return rider assignment states">
      {states.map(([state, label]) => (
        <div key={state}>
          <span>{state}</span>
          <button
            type="button"
            className={`return-rider-assignment-toggle is-${state}`}
            disabled={state === "disabled"}
          >
            {state === "loading" ? <LoaderCircle aria-hidden="true" /> : null}
            {state === "error" ? <AlertCircle aria-hidden="true" /> : null}
            {state === "success" ? <Check aria-hidden="true" /> : null}
            {!["loading", "error", "success"].includes(state) ? (
              <UserRoundPlus aria-hidden="true" />
            ) : null}
            <span>{label}</span>
          </button>
        </div>
      ))}
    </section>
  );
}
