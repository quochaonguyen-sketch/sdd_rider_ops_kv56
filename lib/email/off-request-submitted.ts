import nodemailer from "nodemailer";

export type OffRequestEmailResult = {
  status: "SENT" | "FAILED" | "NOT_CONFIGURED";
  providerId?: string;
  error?: string;
};

export function getOffRequestOpsRecipients() {
  const configured = process.env.OFF_REQUEST_OPS_EMAIL?.split(/[,;\s]+/).map((item) => item.trim()).filter((item) => item.includes("@"));
  if (configured?.length) return Array.from(new Set(configured.map((item) => item.toLowerCase())));
  const fallback = process.env.OFF_REQUEST_FROM_EMAIL?.trim();
  return fallback?.includes("@") ? [fallback.replace(/.*<|>.*/g, "").trim().toLowerCase()] : [];
}

export async function sendOffRequestSubmittedEmail(input: {
  to: string[];
  riderName: string | null;
  riderCode: string;
  offDates: string[];
  shift: string;
  requestType: string;
  reason?: string | null;
  requesterEmail?: string | null;
}): Promise<OffRequestEmailResult> {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.replaceAll(" ", "").trim();
  const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 587);
  const fromRaw = process.env.OFF_REQUEST_FROM_EMAIL?.trim() || user || "";
  const from = fromRaw.includes("<") ? fromRaw : fromRaw.includes("@") ? `Rider Operations <${fromRaw}>` : "";
  if (!user || !pass) return { status: "NOT_CONFIGURED", error: "Thieu SMTP_USER hoac SMTP_PASS." };
  if (!input.to.length) return { status: "FAILED", error: "Chua cau hinh OFF_REQUEST_OPS_EMAIL." };
  if (!from.includes("@")) return { status: "NOT_CONFIGURED", error: "Thieu OFF_REQUEST_FROM_EMAIL." };

  try {
    const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
    const info = await transporter.sendMail({
      from,
      to: input.to.join(", "),
      replyTo: input.requesterEmail || undefined,
      subject: `[OFF moi] ${input.riderCode} · ${input.offDates.length} ngay`,
      html: `<p>Rider <strong>${input.riderName || input.riderCode}</strong> vua gui yeu cau OFF.</p><p>Ma: ${input.riderCode}<br/>Loai: ${input.requestType}<br/>Ngay: ${input.offDates.join(", ")}<br/>Ca: ${input.shift}<br/>Ly do: ${input.reason || "-"}</p><p>Vao Off Schedule de duyet.</p>`,
    });
    return { status: "SENT", providerId: info.messageId };
  } catch (error) {
    return { status: "FAILED", error: error instanceof Error ? error.message : "Unable to send submitted email" };
  }
}
