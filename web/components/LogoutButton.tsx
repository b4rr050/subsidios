"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setLoading(false);
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loading}
      className={className ?? "rounded-md border px-3 py-2 text-sm disabled:opacity-60"}
      title="Terminar sessão"
    >
      {loading ? "A sair..." : "Sair"}
    </button>
  );
}
