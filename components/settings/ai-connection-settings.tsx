"use client";

import { useState } from "react";
import { Bot, CheckCircle2, LoaderCircle, PlugZap, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { saveBrowserAiConfig, useBrowserAiConfig, type BrowserAiConfig } from "@/lib/ai/browser-config";

type ConnectionState = "idle" | "testing" | "success" | "error";

export function AiConnectionSettings() {
  const savedConfig = useBrowserAiConfig();
  const [draft, setDraft] = useState<Partial<BrowserAiConfig>>({});
  const config = { ...savedConfig, ...draft };
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function testConnection() {
    setConnectionState("testing");
    setMessage(null);
    const response = await fetch("/api/ai/connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    const result = await response.json().catch(() => null) as { success?: boolean; message?: string; error?: string } | null;
    if (!response.ok || !result?.success) {
      setConnectionState("error");
      setMessage(result?.error ?? "Không thể kết nối máy chủ AI.");
      return;
    }
    setConnectionState("success");
    setMessage(result.message ?? "Kết nối thành công.");
  }

  function save() {
    saveBrowserAiConfig(config);
    setDraft({});
    setMessage("Đã lưu cấu hình AI cho trình duyệt trên máy này.");
    setConnectionState("success");
  }

  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Bot size={19} /></span>
        <div>
          <h2 className="font-bold text-slate-950">Kết nối AI cho máy này</h2>
          <p className="mt-1 text-sm text-slate-500">Nhập địa chỉ Ollama đang chạy trong LAN hoặc VPN. Cấu hình chỉ được lưu trên trình duyệt hiện tại.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.35fr)]">
        <Field label="URL máy chủ AI">
          <Input
            type="url"
            inputMode="url"
            value={config.baseUrl}
            onChange={(event) => { setDraft((current) => ({ ...current, baseUrl: event.target.value })); setConnectionState("idle"); setMessage(null); }}
            placeholder="Ví dụ: http://192.168.1.50:11434"
          />
        </Field>
        <Field label="Model Ollama">
          <Input
            value={config.model}
            onChange={(event) => { setDraft((current) => ({ ...current, model: event.target.value })); setConnectionState("idle"); setMessage(null); }}
            placeholder="qwen3:4b-instruct"
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" disabled={connectionState === "testing"} onClick={() => void testConnection()}>
          {connectionState === "testing" ? <LoaderCircle className="animate-spin" size={16} /> : <PlugZap size={16} />}
          {connectionState === "testing" ? "Đang kiểm tra..." : "Kiểm tra kết nối"}
        </Button>
        <Button type="button" onClick={save}><Save size={16} />Lưu cho máy này</Button>
      </div>

      {message ? <p role={connectionState === "error" ? "alert" : "status"} className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${connectionState === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{connectionState !== "error" ? <CheckCircle2 className="mt-0.5 shrink-0" size={16} /> : null}{message}</p> : null}
      <p className="mt-4 text-xs leading-5 text-slate-500">Để trống URL để dùng cấu hình mặc định <code>OLLAMA_BASE_URL</code> của máy chủ website. Không nhập API key vào URL.</p>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>{children}</label>;
}
