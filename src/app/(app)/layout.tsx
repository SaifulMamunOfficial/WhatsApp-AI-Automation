import Link from "next/link";
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
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/inbox" className="font-semibold">
            Saimum CRM
          </Link>
          <Link href="/contacts" className="text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400">
            কন্টাক্ট
          </Link>
          {user.role === "admin" && (
            <Link href="/settings/channels" className="text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400">
              চ্যানেল
            </Link>
          )}
          {user.role === "admin" && (
            <Link href="/broadcasts" className="text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400">
              Broadcast
            </Link>
          )}
          {user.role === "admin" && (
            <Link href="/settings/automations" className="text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400">
              অটোমেশন
            </Link>
          )}
          {user.role === "admin" && (
            <Link href="/settings/knowledge" className="text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400">
              জ্ঞানভান্ডার ও AI
            </Link>
          )}
        </nav>
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
