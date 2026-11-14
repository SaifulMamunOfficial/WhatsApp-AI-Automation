"use client";

import { KeyRound, Loader2, Search, ShieldCheck, UserCheck, UserPlus, UserX, Users } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";
import { Modal } from "@/components/modal";
import { Alert, Avatar, Badge, Card, EmptyState, Field, buttonClass, cn, fieldClass } from "@/components/ui";
import { createMemberAction, memberAction, type TeamFormState } from "@/core/auth/team-actions";
import { useI18n } from "@/lib/i18n/client";

export interface MemberView {
  id: string;
  name: string;
  email: string;
  role: "admin" | "agent";
  active: boolean;
  mustChangePassword: boolean;
  lastLogin: string;
  joined: string;
  isMe: boolean;
}

type Intent = "role" | "reset" | "deactivate" | "activate";
interface Target {
  member: MemberView;
  intent: Intent;
  /** For intent "role": the role to give. */
  role?: "admin" | "agent";
}

/** A temporary password is shown once: it cannot be looked up again. */
function TempPassword({ password }: { password: string }) {
  const { t } = useI18n();
  return (
    <Alert tone="warning">
      <p className="font-semibold">{t("সাময়িক পাসওয়ার্ড (এখনই কপি করে সদস্যকে দিন, আর দেখানো হবে না):")}</p>
      <p className="mt-1 select-all break-all rounded-lg bg-surface px-3 py-2 font-mono text-base">{password}</p>
      <p className="mt-1 text-xs">{t("প্রথম লগইনেই তাঁকে নিজের পাসওয়ার্ড বানাতে হবে।")}</p>
    </Alert>
  );
}

function Stat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone?: "success" | "danger" }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tone === "success" ? "bg-success-soft text-success" : tone === "danger" ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand")} aria-hidden>
          {icon}
        </span>
        <p className="min-w-0 text-sm font-semibold text-muted">{label}</p>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight">{value}</p>
    </Card>
  );
}

/** The "New member" popup. After it succeeds the popup shows the generated password instead of the form. */
function AddMemberDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal open={open} onClose={onClose} title={t("নতুন সদস্য")}>
      {/* key: a fresh form (and a fresh result) every time the popup is opened */}
      {open && <AddMemberForm key="form" onClose={onClose} />}
    </Modal>
  );
}

function AddMemberForm({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<TeamFormState, FormData>(createMemberAction, {});

  if (state.okAt && state.temporaryPassword) {
    return (
      <div className="space-y-4">
        <Alert tone="success">{t("সদস্য যোগ হয়েছে।")}</Alert>
        <TempPassword password={state.temporaryPassword} />
        <button type="button" onClick={onClose} className={buttonClass("primary", "md")}>{t("সম্পন্ন")}</button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <Field label={t("নাম")}>
        <input name="name" required maxLength={100} autoFocus className={fieldClass} />
      </Field>
      <Field label={t("ইমেইল")}>
        <input name="email" type="email" required maxLength={200} autoComplete="off" className={fieldClass} />
      </Field>
      <Field label={t("রোল")}>
        <select name="role" defaultValue="agent" className={fieldClass}>
          <option value="agent">{t("এজেন্ট")}</option>
          <option value="admin">{t("অ্যাডমিন")}</option>
        </select>
      </Field>
      <Field label={t("সাময়িক পাসওয়ার্ড (ফাঁকা রাখলে নিজে তৈরি হবে)")}>
        <input name="password" type="text" autoComplete="off" spellCheck={false} placeholder={t("কমপক্ষে ১০ অক্ষর")} className={cn(fieldClass, "font-mono")} />
      </Field>
      {state.error && <Alert tone="danger">{t(state.error)}</Alert>}
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className={buttonClass("secondary", "md")}>{t("বাতিল করুন")}</button>
        <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>
          {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {t("সদস্য যোগ করুন")}
        </button>
      </div>
    </form>
  );
}

export function TeamView({ members }: { members: MemberView[] }) {
  const { t, num } = useI18n();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | "admin" | "agent">("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive" | "pending">("");
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);

  // One action state for every row button. When a result arrives (state is a new object) the confirm popup closes;
  // adjusting state while rendering is React's recommended way to react to a changed value.
  const [state, action, pending] = useActionState<TeamFormState, FormData>(memberAction, {});
  const [handled, setHandled] = useState(state);
  const [passwordSeen, setPasswordSeen] = useState<TeamFormState | null>(null);
  if (state !== handled) {
    setHandled(state);
    setTarget(null);
  }

  const stats = {
    total: members.length,
    active: members.filter((m) => m.active).length,
    inactive: members.filter((m) => !m.active).length,
    admins: members.filter((m) => m.role === "admin").length,
    agents: members.filter((m) => m.role === "agent").length,
  };

  const q = query.trim().toLowerCase();
  const shown = members.filter(
    (m) =>
      (!q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)) &&
      (!roleFilter || m.role === roleFilter) &&
      (!statusFilter || (statusFilter === "active" ? m.active : statusFilter === "inactive" ? !m.active : m.mustChangePassword)),
  );
  const filtered = !!(q || roleFilter || statusFilter);

  const confirmText = (tg: Target): string => {
    const name = tg.member.name;
    if (tg.intent === "reset") return t("{name}-এর পাসওয়ার্ড রিসেট করবেন? তিনি সব জায়গা থেকে লগআউট হবেন আর নতুন সাময়িক পাসওয়ার্ড পাবেন।", { name });
    if (tg.intent === "deactivate") return t("{name}-এর অ্যাকাউন্ট বন্ধ করবেন? তিনি আর লগইন করতে পারবেন না।", { name });
    if (tg.intent === "activate") return t("{name}-এর অ্যাকাউন্ট আবার চালু করবেন?", { name });
    return tg.role === "admin" ? t("{name}-কে অ্যাডমিন করবেন? তিনি সব সেটিংস বদলাতে পারবেন।", { name }) : t("{name}-কে এজেন্ট করবেন? অ্যাডমিনের অনুমতি চলে যাবে।", { name });
  };

  const iconBtn = "inline-flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg";

  return (
    <div className="space-y-6">
      <section aria-label={t("মূল সংখ্যা")} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat icon={<Users className="size-5" />} label={t("মোট সদস্য")} value={stats.total} />
        <Stat icon={<UserCheck className="size-5" />} label={t("সক্রিয়")} value={stats.active} tone="success" />
        <Stat icon={<UserX className="size-5" />} label={t("নিষ্ক্রিয়")} value={stats.inactive} tone={stats.inactive > 0 ? "danger" : undefined} />
        <Stat icon={<ShieldCheck className="size-5" />} label={t("অ্যাডমিন")} value={stats.admins} />
        <Stat icon={<Users className="size-5" />} label={t("এজেন্ট")} value={stats.agents} />
      </section>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3 sm:p-4">
          <div className="relative min-w-48 flex-1 sm:max-w-sm">
            <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("নাম বা ইমেইল খুঁজুন")} placeholder={t("নাম বা ইমেইল খুঁজুন")} className={cn(fieldClass, "!min-h-10 pl-10")} />
          </div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)} aria-label={t("রোল")} className={cn(fieldClass, "!min-h-10 !w-auto")}>
            <option value="">{t("সব রোল")}</option>
            <option value="admin">{t("অ্যাডমিন")}</option>
            <option value="agent">{t("এজেন্ট")}</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} aria-label={t("অবস্থা")} className={cn(fieldClass, "!min-h-10 !w-auto")}>
            <option value="">{t("সব অবস্থা")}</option>
            <option value="active">{t("সক্রিয়")}</option>
            <option value="inactive">{t("নিষ্ক্রিয়")}</option>
            <option value="pending">{t("পাসওয়ার্ড বদলানো বাকি")}</option>
          </select>
          <button type="button" onClick={() => setAdding(true)} className={cn(buttonClass("primary", "md"), "sm:ml-auto")}>
            <UserPlus aria-hidden className="size-4" />
            {t("নতুন সদস্য")}
          </button>
        </div>

        {state.error && <div className="border-b border-border p-3 sm:px-4"><Alert tone="danger">{t(state.error)}</Alert></div>}
        {state.ok && !state.temporaryPassword && <div className="border-b border-border p-3 sm:px-4"><Alert tone="success">{t(state.ok)}</Alert></div>}

        {shown.length === 0 ? (
          <EmptyState icon={<Users aria-hidden className="size-8" />} title={t("কোনো সদস্য মেলেনি।")} />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-sm">
              <thead className="bg-surface-2/60 text-xs font-bold uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">{t("সদস্য")}</th>
                  <th scope="col" className="px-4 py-3">{t("রোল")}</th>
                  <th scope="col" className="px-4 py-3">{t("অবস্থা")}</th>
                  <th scope="col" className="px-4 py-3">{t("শেষ লগইন")}</th>
                  <th scope="col" className="px-4 py-3">{t("যোগ হয়েছে")}</th>
                  <th scope="col" className="px-4 py-3 text-right">{t("কাজ")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((m) => (
                  <tr key={m.id} className={cn("transition-colors hover:bg-surface-2/40", !m.active && "opacity-70")}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={m.name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{m.name} {m.isMe && <span className="font-normal text-muted">({t("আপনি")})</span>}</p>
                          <p className="truncate text-xs text-muted">{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><Badge tone={m.role === "admin" ? "brand" : "neutral"}>{m.role === "admin" ? t("অ্যাডমিন") : t("এজেন্ট")}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={m.active ? "success" : "danger"}>{m.active ? t("সক্রিয়") : t("নিষ্ক্রিয়")}</Badge>
                        {m.mustChangePassword && <Badge tone="warning">{t("পাসওয়ার্ড বদলানো বাকি")}</Badge>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{m.lastLogin}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{m.joined}</td>
                    <td className="px-4 py-3">
                      {m.isMe ? (
                        <span className="block text-right text-xs text-muted">—</span>
                      ) : (
                        <div className="flex justify-end gap-0.5">
                          <button type="button" className={iconBtn} title={t("রোল বদলান")} aria-label={t("রোল বদলান") + ": " + m.name} onClick={() => setTarget({ member: m, intent: "role", role: m.role === "admin" ? "agent" : "admin" })}>
                            <ShieldCheck aria-hidden className="size-[18px]" />
                          </button>
                          <button type="button" className={iconBtn} title={t("পাসওয়ার্ড রিসেট")} aria-label={t("পাসওয়ার্ড রিসেট") + ": " + m.name} onClick={() => setTarget({ member: m, intent: "reset" })}>
                            <KeyRound aria-hidden className="size-[18px]" />
                          </button>
                          <button
                            type="button"
                            className={cn(iconBtn, m.active && "hover:bg-danger-soft hover:text-danger")}
                            title={m.active ? t("অ্যাকাউন্ট বন্ধ করুন") : t("আবার চালু করুন")}
                            aria-label={(m.active ? t("অ্যাকাউন্ট বন্ধ করুন") : t("আবার চালু করুন")) + ": " + m.name}
                            onClick={() => setTarget({ member: m, intent: m.active ? "deactivate" : "activate" })}
                          >
                            {m.active ? <UserX aria-hidden className="size-[18px]" /> : <UserCheck aria-hidden className="size-[18px]" />}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-border px-4 py-2.5 text-xs text-muted">{t("{n}টির মধ্যে {m}টি দেখানো হচ্ছে", { n: num(members.length), m: num(shown.length) })}{filtered && " · "}
          {filtered && (
            <button type="button" onClick={() => { setQuery(""); setRoleFilter(""); setStatusFilter(""); }} className="font-semibold text-brand hover:underline">{t("ফিল্টার মুছুন")}</button>
          )}
        </div>
      </Card>

      <p className="max-w-prose text-sm text-muted">
        {t("নতুন বা রিসেট করা অ্যাকাউন্টে সাময়িক পাসওয়ার্ড থাকে; প্রথম লগইনেই সদস্য নিজের পাসওয়ার্ড বানান। বন্ধ করলে বা পাসওয়ার্ড রিসেট করলে তিনি সব জায়গা থেকে লগআউট হয়ে যান। শেষ অ্যাডমিনকে বন্ধ বা এজেন্ট করা যায় না।")}
      </p>

      <AddMemberDialog open={adding} onClose={() => setAdding(false)} />

      {/* confirm popup for role change / reset / deactivate / reactivate */}
      <Modal open={!!target} onClose={() => setTarget(null)} title={t("নিশ্চিত করুন")} size="sm">
        {target && (
          <form action={action} className="space-y-4">
            <input type="hidden" name="id" value={target.member.id} />
            <input type="hidden" name="intent" value={target.intent} />
            {target.intent === "role" && <input type="hidden" name="role" value={target.role} />}
            <p className="text-sm">{confirmText(target)}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setTarget(null)} className={buttonClass("secondary", "md")}>{t("বাতিল করুন")}</button>
              <button type="submit" disabled={pending} className={buttonClass(target.intent === "deactivate" ? "danger" : "primary", "md")}>
                {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
                {t("নিশ্চিত করুন")}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* the new temporary password after a reset */}
      <Modal open={!!state.temporaryPassword && !target && passwordSeen !== state} onClose={() => setPasswordSeen(state)} title={t("সাময়িক পাসওয়ার্ড")} size="sm">
        {state.temporaryPassword && (
          <div className="space-y-4">
            <TempPassword password={state.temporaryPassword} />
            <button type="button" onClick={() => setPasswordSeen(state)} className={buttonClass("primary", "md")}>{t("সম্পন্ন")}</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
