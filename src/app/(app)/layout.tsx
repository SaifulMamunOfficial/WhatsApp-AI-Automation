import { Suspense } from "react";
import { logout } from "@/core/auth/actions";
import { requireUser } from "@/core/auth/dal";

// Every page in this group requires a valid session. With Cache Components the
// session read must sit behind <Suspense>, so the guard wraps header + children.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="p-4 text-sm">লোড হচ্ছে…</p>}>
      <AuthShell>{children}</AuthShell>
    </Suspense>
  );
}

async function AuthShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <span className="font-semibold">Saimum CRM</span>
        <div className="flex items-center gap-3 text-sm">
          <span>
            {user.name} ({user.role === "admin" ? "অ্যাডমিন" : "এজেন্ট"})
          </span>
          <form action={logout}>
            <button type="submit" className="underline">
              লগআউট
            </button>
          </form>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
