"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginClient() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok || data?.ok !== true) {
      setMsg(data?.error ?? "Erro no login");
      return;
    }

    router.replace("/"); // ✅ cai no router de roles
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-2xl border p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Entrar</h1>

        <div className="space-y-2">
          <label className="text-sm">Email</label>
          <input
            className="w-full rounded-md border px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm">Palavra-passe</label>
          <input
            className="w-full rounded-md border px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        {msg && <p className="text-sm">{msg}</p>}

        <button type="submit" className="w-full rounded-md bg-black px-3 py-2 text-white disabled:opacity-60" disabled={loading}>
          {loading ? "A entrar..." : "Entrar"}
        </button>

        <p className="text-xs text-neutral-600">Nota: os utilizadores serão criados pelo Admin no backoffice.</p>
      </form>
    </div>
  );
}
