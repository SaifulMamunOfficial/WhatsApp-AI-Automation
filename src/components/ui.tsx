import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, MessagesSquare, XCircle } from "lucide-react";

// Shared UI kit ("Soft UI Evolution"). Pages compose these instead of repeating Tailwind
// strings, so the whole app changes from one place. Server components unless noted.

export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

// ---- brand ----------------------------------------------------------------------------

/** The product mark: a gradient tile with a chat icon. */
export function LogoMark({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl bg-logo text-logo-glyph shadow-card",
        size === "lg" ? "size-14 rounded-2xl" : "size-9",
      )}
    >
      <MessagesSquare className={size === "lg" ? "size-7" : "size-[18px]"} strokeWidth={2.2} />
    </span>
  );
}

// ---- buttons --------------------------------------------------------------------------

type Variant = "primary" | "secondary" | "ghost" | "danger" | "danger-outline";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold whitespace-nowrap transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";
const variants: Record<Variant, string> = {
  primary: "text-brand-fg shadow-[0_1px_2px_rgb(154_52_18/0.35),0_4px_12px_rgb(194_65_12/0.22)] [background-image:var(--brand-grad)] hover:brightness-110",
  secondary: "border border-border-strong bg-surface text-fg shadow-card hover:border-brand/50 hover:bg-brand-soft hover:text-brand",
  ghost: "text-muted hover:bg-surface-2 hover:text-fg",
  danger: "bg-danger text-white hover:brightness-110 dark:text-[#111b21]",
  "danger-outline": "border border-danger/40 bg-surface text-danger hover:bg-danger-soft",
};
// md is 44px tall (touch target); sm is 36px for dense rows.
const sizes: Record<Size, string> = { sm: "min-h-9 px-3.5 text-sm", md: "min-h-11 px-5 text-[15px]" };

/** Class string for any button-like element (<button>, <Link>, <a>). */
export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra?: string): string {
  return cn(base, variants[variant], sizes[size], extra);
}

export function Button({ variant, size, className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button {...props} className={buttonClass(variant, size, className)} />;
}

export function LinkButton({ variant, size, className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link {...props} className={buttonClass(variant, size, className)} />;
}

// ---- form fields ----------------------------------------------------------------------

export const fieldClass =
  "block w-full min-h-11 rounded-xl border border-border-strong bg-surface px-3.5 py-2 text-[15px] text-fg shadow-[inset_0_1px_0_rgb(15_23_42/0.02)] transition-colors placeholder:text-muted/70 hover:border-muted focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:opacity-60";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-semibold leading-snug">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

// ---- surfaces -------------------------------------------------------------------------

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cn("rounded-2xl border border-border bg-surface shadow-card", className)} />;
}

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="space-y-1.5">
      {back && (
        <Link href={back.href} className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-brand">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && <p className="max-w-prose text-[15px] text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** A page's standard width and spacing. */
export function PageBody({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={cn("mx-auto w-full space-y-6 px-4 py-6 sm:px-8 sm:py-8", wide ? "max-w-5xl" : "max-w-3xl")}>{children}</div>;
}

export function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-bold">{title}</h2>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon && <div className="flex size-16 items-center justify-center rounded-full bg-brand-soft text-brand">{icon}</div>}
      <p className="text-base font-semibold">{title}</p>
      {hint && <p className="max-w-xs text-sm text-muted">{hint}</p>}
    </div>
  );
}

// ---- feedback -------------------------------------------------------------------------

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "whatsapp" | "messenger";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  brand: "bg-brand-soft text-brand",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  whatsapp: "bg-whatsapp-soft text-whatsapp",
  messenger: "bg-messenger-soft text-messenger",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}>{children}</span>;
}

const alertIcons = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle } as const;
const alertTones = { info: "bg-info-soft text-info", success: "bg-success-soft text-success", warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger" } as const;

/** Inline message. `danger` announces itself to screen readers (role=alert). */
export function Alert({ tone = "info", children, className }: { tone?: keyof typeof alertTones; children: ReactNode; className?: string }) {
  const Icon = alertIcons[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-xl px-3.5 py-3 text-sm", alertTones[tone], className)}>
      <Icon aria-hidden className="mt-0.5 size-[18px] shrink-0" />
      <div className="min-w-0 flex-1 text-fg [&_a]:underline">{children}</div>
    </div>
  );
}

/** A tag: neutral pill with a dot in the tag's own colour (text stays readable whatever colour was picked). */
export function TagChip({ name, color }: { name: string; color: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-fg">
      <span aria-hidden className="size-2 rounded-full" style={{ background: color ?? "var(--muted)" }} />
      {name}
    </span>
  );
}

// ---- channel identity -----------------------------------------------------------------

export function ChannelBadge({ type }: { type: "whatsapp" | "messenger" }) {
  return (
    <Badge tone={type}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {type === "whatsapp" ? "WhatsApp" : "Messenger"}
    </Badge>
  );
}

/** Stable hue (0-359) from a name, so each person keeps their colour. */
function hueOf(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}

/** Round initial avatar in a soft colour of its own; a corner dot tells the channel. */
export function Avatar({ name, channel, size = "md" }: { name: string; channel?: "whatsapp" | "messenger"; size?: "sm" | "md" | "lg" }) {
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  const dim = { sm: "size-8 text-sm", md: "size-11 text-base", lg: "size-12 text-lg" }[size];
  const dot = channel === "whatsapp" ? "bg-whatsapp-dot" : "bg-messenger-dot";
  return (
    <span className="relative inline-flex shrink-0">
      <span
        aria-hidden
        style={{ "--av-h": hueOf(name) } as React.CSSProperties}
        className={cn(
          "inline-flex items-center justify-center rounded-full font-bold",
          "bg-[hsl(var(--av-h)_75%_91%)] text-[hsl(var(--av-h)_55%_26%)]",
          "dark:bg-[hsl(var(--av-h)_32%_26%)] dark:text-[hsl(var(--av-h)_85%_88%)]",
          dim,
        )}
      >
        {initial}
      </span>
      {channel && <span aria-hidden className={cn("absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full ring-2 ring-surface", dot)} />}
    </span>
  );
}

// ---- page layout shared by the admin / settings pages ---------------------------------

/** Full-width page container (same on every admin page, so nothing is squeezed into a narrow column). */
export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[96rem] space-y-6 px-4 py-6 sm:px-8 sm:py-8", className)}>{children}</div>;
}

/** A number with a label, for the row of summary cards at the top of a page. */
export function StatCard({ icon, label, value, hint, tone }: { icon: ReactNode; label: string; value: ReactNode; hint?: string; tone?: "success" | "danger" | "warning" }) {
  const toneClass = tone === "success" ? "bg-success-soft text-success" : tone === "danger" ? "bg-danger-soft text-danger" : tone === "warning" ? "bg-warning-soft text-warning" : "bg-brand-soft text-brand";
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", toneClass)} aria-hidden>{icon}</span>
        <p className="min-w-0 text-sm font-semibold text-muted">{label}</p>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
    </Card>
  );
}
