"use client";

import { useState } from "react";

type RoleCode = "ADMIN" | "TECH" | "VALIDATOR" | "PRESIDENT" | "ENTITY";

export default function CreateUserClient() {
  const [role, setRole] = useState<RoleCode>("ENTITY");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const [entityName, setEntityName] = useState("");
  const [entityNif, setEntityNif] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    const payload: any = {
      email,
      password,
      full_name: fullName,
      role,
    };

    if (role === "ENTITY") payload.entity = { name: entityName, nif: entityNif };

    const res = await fetch("/api/admin/users/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setMsg(data?.error ?? "Erro");
      return;
    }

    setMsg("Utilizador criado com sucesso.");
    setEmail("");
    setPassword("");
    setFullName("");
    setEntityName("");
    setEntityNif("");
    window.location.reload();
  }

  return (
    <form onSubmit={submit} className="grid gap-3 max-w-xl">
      <div className="grid gap-2">
        <label className="text-sm">Role</label>
        <select
          className="rounded-md border px-3 py-2"
          value={role}
          onChange={(e) => setRole(e.target.value as RoleCode)}
        >
          <option value="ENTITY">ENTITY (Entidade)</option>
          <option value="TECH">TECH (Técnico)</option>
          <option value="VALIDATOR">VALIDATOR (Validador)</option>
          <option value="PRESIDENT">PRESIDENT (Presidente)</option>
          <option value="ADMIN">ADMIN (Administrador)</option>
        </select>
      </div>

      <div className="grid gap-2">
        <label className="text-sm">Nome completo</label>
        <input className="rounded-md border px-3 py-2" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </div>

      <div className="grid gap-2">
        <label className="text-sm">Email</label>
        <input className="rounded-md border px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
      </div>

      <div className="grid gap-2">
        <label className="text-sm">Password</label>
        <input className="rounded-md border px-3 py-2" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={8} />
      </div>

      {role === "ENTITY" && (
        <div className="rounded-xl border p-3 grid gap-3">
          <p className="text-sm font-medium">Dados da Entidade</p>

          <div className="grid gap-2">
            <label className="text-sm">Nome da entidade</label>
            <input className="rounded-md border px-3 py-2" value={entityName} onChange={(e) => setEntityName(e.target.value)} required />
          </div>

          <div className="grid gap-2">
            <label className="text-sm">NIF</label>
            <input className="rounded-md border px-3 py-2" value={entityNif} onChange={(e) => setEntityNif(e.target.value)} required />
          </div>
        </div>
      )}

      {msg && <p className="text-sm">{msg}</p>}

      <button className="rounded-md bg-black text-white px-3 py-2 disabled:opacity-60" disabled={loading}>
        {loading ? "A criar..." : "Criar"}
      </button>
    </form>
  );
}
