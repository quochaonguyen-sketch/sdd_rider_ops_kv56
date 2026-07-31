import { ChevronRight } from "lucide-react";

const states = [
  "default",
  "hover",
  "focus",
  "active",
  "disabled",
  "loading",
  "error",
  "success",
] as const;

export function ReturningRiderBoardPreview() {
  return (
    <section aria-label="Returning rider board interaction states">
      <p>Dữ liệu mẫu chỉ dùng để kiểm tra tám trạng thái tương tác.</p>
      <ol className="returning-rider-board-list">
        {states.map((state, index) => (
          <li key={state} className={index === 0 ? "is-lead" : undefined}>
            <button
              type="button"
              data-state={state}
              disabled={state === "disabled"}
              className={state === "hover" ? "is-hover" : state === "focus" ? "is-focus" : state === "active" ? "is-active" : undefined}
            >
              <span className="returning-rider-rank">{String(index + 1).padStart(2, "0")}</span>
              <span className="returning-rider-avatar" aria-hidden="true">RT</span>
              <span className="returning-rider-identity">
                <strong>Rider mẫu · KV5</strong>
                <span>{state}</span>
              </span>
              <span className="returning-rider-load">
                <strong>—</strong>
                <span>đã quét</span>
              </span>
              <ChevronRight className="returning-rider-open-icon" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
