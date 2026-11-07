import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/core/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "লগইন — Saimum CRM" };

// Already signed in with a valid session: go to the app.
async function RedirectIfSignedIn() {
  if (await getCurrentUser()) redirect("/");
  return null;
}

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <Suspense>
        <RedirectIfSignedIn />
      </Suspense>
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold">Saimum CRM</h1>
        <LoginForm />
      </div>
    </main>
  );
}
