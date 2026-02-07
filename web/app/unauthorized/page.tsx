import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-3 rounded-2xl border p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Acesso não autorizado</h1>
        <p className="text-sm text-neutral-700">
          A tua conta não tem permissões para aceder a esta área.
        </p>
        <div className="flex gap-3">
          <Link className="rounded-md border px-3 py-2 text-sm" href="/">
            Voltar
          </Link>
          <Link className="rounded-md bg-black px-3 py-2 text-sm text-white" href="/login">
            Ir para Login
          </Link>
        </div>
      </div>
    </div>
  );
}
