import nodemailer from "nodemailer";

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
  FULL_DAY: "Ca ngay",
  MORNING: "Buoi sang",
  AFTERNOON: "Buoi chieu",
};

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

function resolveFromAddress() {
  const configured = process.env.OFF_REQUEST_FROM_EMAIL?.trim();
  const user = process.env.SMTP_USER?.trim();
  if (configured && configured.includes("@")) {
    return configured.includes("<") ? configured : `Rider Operations <${configured}>`;
  }
  if (user) return `Rider Operations <${user}>`;
  return "";
}

function buildEmailHtml(input: OffRequestDecisionEmail) {
  const approved = input.decision === "APPROVED";
  const decisionText = approved ? "da duoc duyet" : "khong duoc duyet";
  const accent = approved ? "#087443" : "#b42318";
  const riderName = escapeHtml(input.riderName || input.riderCode);
  const note = input.reviewNote?.trim()
    ? `<tr><td style="padding:10px 0;color:#667085">Ghi chu</td><td style="padding:10px 0;text-align:right;color:#101828">${escapeHtml(input.reviewNote.trim())}</td></tr>`
    : "";

  return {
    decisionText,
    html: [
      '<div style="margin:0;background:#f4f7fb;padding:32px 16px;font-family:Arial,sans-serif;color:#101828">',
      '<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #d7deea;border-radius:10px;overflow:hidden">',
      '<div style="padding:24px 28px;background:#111827;color:#f8fafc">',
      '<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#a8b3c7">Rider Operations · KV5 + KV6</div>',
      '<h1 style="margin:8px 0 0;font-size:22px;line-height:1.25">Ket qua dang ky lich OFF</h1>',
      "</div>",
      '<div style="padding:28px">',
      `<p style="margin:0 0 20px;line-height:1.6">Chao <strong>${riderName}</strong>, yeu cau OFF phep cua ban <strong style="color:${accent}">${decisionText}</strong>.</p>`,
      '<table style="width:100%;border-collapse:collapse;font-size:14px">',
      `<tr><td style="padding:10px 0;color:#667085;border-bottom:1px solid #eaecf0">Ma rider</td><td style="padding:10px 0;text-align:right;color:#101828;border-bottom:1px solid #eaecf0">${escapeHtml(input.riderCode)}</td></tr>`,
      `<tr><td style="padding:10px 0;color:#667085;border-bottom:1px solid #eaecf0">Ngay OFF</td><td style="padding:10px 0;text-align:right;color:#101828;border-bottom:1px solid #eaecf0">${formatDate(input.offDate)}</td></tr>`,
      `<tr><td style="padding:10px 0;color:#667085">Khung thoi gian</td><td style="padding:10px 0;text-align:right;color:#101828">${shiftLabels[input.shift]}</td></tr>`,
      note,
      "</table>",
      '<p style="margin:22px 0 0;color:#667085;font-size:12px;line-height:1.5">Day la email tu dong tu he thong Rider Operations. Vui long lien he dieu phoi vien neu thong tin chua chinh xac.</p>',
      "</div></div></div>",
    ].join(""),
  };
}

export async function sendOffRequestDecisionEmail(input: OffRequestDecisionEmail): Promise<OffRequestEmailResult> {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.replaceAll(" ", "").trim();
  const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 587);
  const from = resolveFromAddress();

  if (!user || !pass) {
    return {
      status: "NOT_CONFIGURED",
      error: "Thieu SMTP_USER hoac SMTP_PASS. Dung Gmail App Password, khong dung mat khau dang nhap.",
    };
  }
  if (!input.to?.includes("@")) {
    return { status: "FAILED", error: "Yeu cau khong co email nguoi dang ky" };
  }
  if (!from.includes("@")) {
    return { status: "NOT_CONFIGURED", error: "Thieu OFF_REQUEST_FROM_EMAIL hoac SMTP_USER." };
  }

  const { decisionText, html } = buildEmailHtml(input);

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const info = await transporter.sendMail({
      from,
      to: input.to,
      replyTo: extractEmail(from),
      subject: `Lich OFF ${formatDate(input.offDate)} ${decisionText}`,
      html,
    });

    return { status: "SENT", providerId: info.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send decision email";
    return { status: "FAILED", error: message };
  }
}
