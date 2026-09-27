type NotificationStatus = "SENT" | "FAILED" | "NOT_CONFIGURED";

type OffRequestDecisionEmail = {
  to: string;
  riderName: string | null;
  riderCode: string;
  offDate: string;
  shift: "FULL_DAY" | "MORNING" | "AFTERNOON";
  decision: "APPROVED" | "REJECTED";
  reviewNote?: string | null;
};

export type OffRequestEmailResult = {
  status: NotificationStatus;
  providerId?: string;
  error?: string;
};

const shiftLabels = {
  FULL_DAY: "Cả ngày",
  MORNING: "Buổi sáng",
  AFTERNOON: "Buổi chiều",
};

const RESEND_ONBOARDING_FROM = "Rider Operations <beth.t@example.com>";

function escapeHtml(value: string) {
  const amp = String.fromCharCode(38);
  return value.replace(/[&<>"']/g, (character) => {
    if (character === "&") return amp + "amp;";
    if (character === "<") return amp + "lt;";
    if (character === ">") return amp + "gt;";
    if (character === '"') return amp + "quot;";
    return amp + "#39;";
  });
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(`${date}T00:00:00+07:00`));
}

function extractEmail(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

function canUseAsResendFrom(value: string) {
  const email = extractEmail(value);
  if (!email.includes("@")) return false;
  const domain = email.split("@")[1] ?? "";
  return !/(gmail|googlemail|yahoo|outlook|hotmail|icloud)\.com$/i.test(domain);
}

function resolveFromAddress(configured: string | undefined) {
  if (configured && canUseAsResendFrom(configured)) {
    return configured.includes("<") ? configured : `Rider Operations <${configured}>`;
  }
  return RESEND_ONBOARDING_FROM;
}

function buildEmailHtml(input: OffRequestDecisionEmail) {
  const approved = input.decision === "APPROVED";
  const decisionText = approved ? "đã được duyệt" : "không được duyệt";
  const accent = approved ? "#087443" : "#b42318";
  const riderName = escapeHtml(input.riderName || input.riderCode);
  const note = input.reviewNote?.trim()
    ? `<tr><td style="padding:10px 0;color:#667085">Ghi chú</td><td style="padding:10px 0;text-align:right;color:#101828">${escapeHtml(input.reviewNote.trim())}</td></tr>`
    : "";

  return {
    decisionText,
    html: [
      '<div style="margin:0;background:#f4f7fb;padding:32px 16px;font-family:Arial,sans-serif;color:#101828">',
      '<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #d7deea;border-radius:10px;overflow:hidden">',
      '<div style="padding:24px 28px;background:#111827;color:#f8fafc">',
      '<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#a8b3c7">Rider Operations · KV5 + KV6</div>',
      '<h1 style="margin:8px 0 0;font-size:22px;line-height:1.25">Kết quả đăng ký lịch OFF</h1>',
      "</div>",
      '<div style="padding:28px">',
      `<p style="margin:0 0 20px;line-height:1.6">Chào <strong>${riderName}</strong>, yêu cầu OFF phép của bạn <strong style="color:${accent}">${decisionText}</strong>.</p>`,
      '<table style="width:100%;border-collapse:collapse;font-size:14px">',
      `<tr><td style="padding:10px 0;color:#667085;border-bottom:1px solid #eaecf0">Mã rider</td><td style="padding:10px 0;text-align:right;color:#101828;border-bottom:1px solid #eaecf0">${escapeHtml(input.riderCode)}</td></tr>`,
      `<tr><td style="padding:10px 0;color:#667085;border-bottom:1px solid #eaecf0">Ngày OFF</td><td style="padding:10px 0;text-align:right;color:#101828;border-bottom:1px solid #eaecf0">${formatDate(input.offDate)}</td></tr>`,
      `<tr><td style="padding:10px 0;color:#667085">Khung thời gian</td><td style="padding:10px 0;text-align:right;color:#101828">${shiftLabels[input.shift]}</td></tr>`,
      note,
      "</table>",
      '<p style="margin:22px 0 0;color:#667085;font-size:12px;line-height:1.5">Đây là email tự động từ hệ thống Rider Operations. Vui lòng liên hệ điều phối viên nếu thông tin chưa chính xác.</p>',
      "</div></div></div>",
    ].join(""),
  };
}

async function sendWithResend(input: OffRequestDecisionEmail, apiKey: string): Promise<OffRequestEmailResult> {
  const configuredFrom = process.env.OFF_REQUEST_FROM_EMAIL?.trim();
  const from = resolveFromAddress(configuredFrom);
  const replyTo = configuredFrom && extractEmail(configuredFrom).includes("@")
    ? extractEmail(configuredFrom)
    : undefined;
  const { decisionText, html } = buildEmailHtml(input);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      ...(replyTo ? { reply_to: [replyTo] } : {}),
      subject: `Lịch OFF ${formatDate(input.offDate)} ${decisionText}`,
      html,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  const result = await response.json().catch(() => null) as { id?: string; message?: string; name?: string } | null;
  if (!response.ok || !result?.id) {
    return {
      status: "FAILED",
      error: result?.message || result?.name || `Resend returned HTTP ${response.status}`,
    };
  }
  return { status: "SENT", providerId: result.id };
}

export async function sendOffRequestDecisionEmail(input: OffRequestDecisionEmail): Promise<OffRequestEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return {
      status: "NOT_CONFIGURED",
      error: "Thiếu RESEND_API_KEY trên Vercel. Tạo key tại resend.com rồi gán vào project.",
    };
  }
  if (!input.to?.includes("@")) {
    return { status: "FAILED", error: "Yêu cầu không có email người đăng ký" };
  }

  try {
    return await sendWithResend(input, apiKey);
  } catch (error) {
    return {
      status: "FAILED",
      error: error instanceof Error ? error.message : "Unable to send decision email",
    };
  }
}
