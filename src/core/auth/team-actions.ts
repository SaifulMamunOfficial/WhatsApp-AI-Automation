"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { hashSessionToken } from "@/lib/session-token";
import { requireRole, requireUserAllowingPasswordChange } from "./dal";
import { SESSION_COOKIE } from "./session";
import { changeOwnPassword, createMember, resetMemberPassword, setMemberActive, setMemberRole, updateOwnName } from "./team";

// Every action re-checks the role. Temporary passwords are returned once, in the response to the
// admin who asked for them, and are never logged or stored in plain text.

export interface TeamFormState {
  ok?: string;
  error?: string;
  temporaryPassword?: string;
  /** Changes on every successful submit so the form can reset itself. */
  okAt?: number;
}

const done = () => revalidatePath("/settings/team");
const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function createMemberAction(_prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  await requireRole("admin");
  const r = await createMember(db, { name: str(formData, "name"), email: str(formData, "email"), role: str(formData, "role"), password: str(formData, "password") });
  done();
  return r.ok ? { ok: "সদস্য যোগ হয়েছে।", temporaryPassword: r.temporaryPassword, okAt: Date.now() } : { error: r.error };
}

/** One action for the buttons on a member row; `intent` says which. */
export async function memberAction(_prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  const actor = await requireRole("admin");
  const id = str(formData, "id");
  const intent = str(formData, "intent");
  let out: TeamFormState = { error: "ভুল অনুরোধ।" };
  if (intent === "role") {
    const r = await setMemberRole(db, actor.id, id, str(formData, "role"));
    out = r.ok ? { ok: "রোল বদলেছে।" } : { error: r.error };
  } else if (intent === "activate" || intent === "deactivate") {
    const r = await setMemberActive(db, actor.id, id, intent === "activate");
    out = r.ok ? { ok: intent === "activate" ? "চালু করা হয়েছে।" : "বন্ধ করা হয়েছে।" } : { error: r.error };
  } else if (intent === "reset") {
    const r = await resetMemberPassword(db, actor.id, id);
    out = r.ok ? { ok: "সাময়িক পাসওয়ার্ড তৈরি হয়েছে।", temporaryPassword: r.temporaryPassword } : { error: r.error };
  }
  done();
  return out;
}

export async function updateNameAction(_prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  const me = await requireUserAllowingPasswordChange();
  const r = await updateOwnName(db, me.id, str(formData, "name"));
  revalidatePath("/", "layout");
  return r.ok ? { ok: "সেভ হয়েছে।" } : { error: r.error };
}

export async function changePasswordAction(_prev: TeamFormState, formData: FormData): Promise<TeamFormState> {
  const me = await requireUserAllowingPasswordChange();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const r = await changeOwnPassword(
    db,
    me.id,
    { current: str(formData, "current"), next: str(formData, "next"), confirm: str(formData, "confirm") },
    token ? hashSessionToken(token) : undefined,
  );
  if (!r.ok) return { error: r.error };
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
