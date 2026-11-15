import { cn } from "./ui";

export const STAGE_COLOR_MAP: Record<string, { bg: string; dot: string; label: string }> = {
  blue: { bg: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20", dot: "bg-blue-500", label: "নীল (Blue)" },
  sky: { bg: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20", dot: "bg-sky-500", label: "আকাশি (Sky)" },
  emerald: { bg: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20", dot: "bg-emerald-500", label: "পান্না সবুজ (Emerald)" },
  amber: { bg: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20", dot: "bg-amber-500", label: "হলুদ (Amber)" },
  orange: { bg: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20", dot: "bg-orange-500", label: "কমলা (Orange)" },
  violet: { bg: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20", dot: "bg-violet-500", label: "বেগুনী (Violet)" },
  rose: { bg: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20", dot: "bg-rose-500", label: "গোলাপি (Rose)" },
  slate: { bg: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20", dot: "bg-slate-500", label: "ধূসর (Slate)" },
};

export function StagePill({
  name,
  colorKey = "slate",
  className,
}: {
  name: string;
  colorKey?: string;
  className?: string;
}) {
  const c = STAGE_COLOR_MAP[colorKey] ?? STAGE_COLOR_MAP.slate;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        c.bg,
        className,
      )}
    >
      <span aria-hidden className={cn("size-2 rounded-full shrink-0", c.dot)} />
      <span className="truncate">{name}</span>
    </span>
  );
}
