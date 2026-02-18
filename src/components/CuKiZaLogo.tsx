"use client";

const BRAND_PRIMARY = "#ff8000";
const BRAND_SECONDARY = "#47c7fc";

/**
 * CuKiZa Family Cashflow logo: house icon + wordmark using brand colors.
 */
export function CuKiZaLogo({
  variant = "full",
  className = "",
}: {
  variant?: "full" | "compact";
  className?: string;
}) {
  const isCompact = variant === "compact";

  return (
    <span
      className={`inline-flex items-center gap-2 pl-2 ${className}`}
      style={{ borderLeftWidth: 4, borderLeftColor: BRAND_PRIMARY }}
    >
      <span className="flex items-center shrink-0" aria-hidden>
        <svg
          width={isCompact ? 20 : 24}
          height={isCompact ? 20 : 24}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="shrink-0"
        >
          <path d="M12 2L2 10v12h7v-7h6v7h7V10L12 2z" fill={BRAND_PRIMARY} />
          <path
            d="M12 2l10 8v2h-1v10h-6v-7H9v7H3v-2H2v-2l10-8z"
            fill={BRAND_SECONDARY}
            fillOpacity="0.5"
          />
        </svg>
      </span>
      <span className="text-sm font-bold uppercase tracking-tight text-slate-900 dark:text-slate-100">
        <span style={{ color: BRAND_PRIMARY }}>CuKiZa</span>
        <span className="font-semibold" style={{ color: BRAND_SECONDARY }}>
          {" "}
          Family Cashflow
        </span>
      </span>
    </span>
  );
}
