"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type App = {
  id: string;
  object_title: string;
  requested_amount: number | null;
  current_status: string;
};

export default function BackofficeApplicationClient({
  application,
}: {
  application: App;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const status = application.current_status;

  const canTechDecide = status === "S2_SUBMITTED";

  async function act(action: "VALIDATE" | "RETURN" | "REJECT") {
    setMsg(null);

    let comment: string | undefined = undefined;

    if (action !== "VALIDATE") {
      const c = window.prompt(
        action === "RETURN"
          ? "Motivo para devolver à entidade (obrigatório):"
          : "Motivo da rejeição (obrigatório):"
      );
      if (!c || !c.trim()) {
        setMsg("Ação cancelada: comentário é obrigatório.");
        return;
      }
      comment = c.trim();
    }

    setLoading(true);

    const res = await fetch(`/api/backoffice/applications/${application.id}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action,
        comment,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok || data?.ok !== true) {
      setMsg(data?.error ?? "Erro ao processar decisão.");
      return;
    }

    setMsg(
      action === "VALIDATE"
        ? "Pedido validado tecnicamente."
        : action === "RETURN"
        ? "Pedido devolvido à entidade."
        : "Pedido rejeitado."
    );

    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Resumo */}
      <section className="rounded-2xl border p-4 shadow-sm">
        <h2 className="font-medium">Pedido</h2>
        <p className="text-sm">{application.object_title}</p>
        <p className="text-xs text-neutral-600">
          Estado atual: <strong>{status}</strong>
        </p>
      </section>

      {/* Ações do Técnico */}
      {canTechDecide && (
        <section className="rounded-2xl border p-4 shadow-sm">
          <h2 className="font-medium mb-3">Decisão técnica</h2>

          <div className="flex gap-2">
            <button
              className="rounded-md bg-green-600 px-3 py-2 text-sm text-white disabled:opacity-60"
              disabled={loading}
              onClick={() => act("VALIDATE")}
            >
              Validar tecnicamente
            </button>

            <button
              className="rounded-md bg-yellow-500 px-3 py-2 text-sm text-white disabled:opacity-60"
              disabled={loading}
              onClick={() => act("RETURN")}
            >
              Devolver à entidade
            </button>

            <button
              className="rounded-md bg-red-600 px-3 py-2 text-sm text-white disabled:opacity-60"
              disabled={loading}
              onClick={() => act("REJECT")}
            >
              Rejeitar pedido
            </button>
          </div>

          {msg && <p className="mt-3 text-sm">{msg}</p>}
        </section>
      )}
    </div>
  );
}
