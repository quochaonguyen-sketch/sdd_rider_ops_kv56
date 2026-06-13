"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bike } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;

    setLoading(false);

    if (!response.ok) {
      setError(result?.error ?? "Unable to sign in");
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-md bg-slate-950 text-white">
            <Bike size={22} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-950">Rider Ops</h1>
            <p className="text-sm text-slate-500">Sign in to manage rider operations</p>
          </div>
        </div>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
            <Input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
            <Input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </div>
      </form>
    </main>
  );
}
