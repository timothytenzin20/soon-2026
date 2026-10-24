"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DevLoginButtons({ staff }: { staff: { email: string; name: string; role: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function login(email: string) {
    const res = await fetch("/api/auth/dev-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    if (!res.ok) return setError("Login failed, did you run `pnpm db:seed`?");
    router.push("/admin");
    router.refresh();
  }
  return (
    <div className="stack">
      {error && <div className="notice notice-danger">{error}</div>}
      {staff.map((s) => (
        <button key={s.email} className="btn btn-secondary btn-block" style={{ justifyContent: "space-between" }} onClick={() => void login(s.email)}>
          <span>{s.name}</span>
          <span className="badge badge-neutral">{s.role}</span>
        </button>
      ))}
    </div>
  );
}
