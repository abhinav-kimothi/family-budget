"use client";

const BRAND_PRIMARY = "#ff8000";
const BRAND_SECONDARY = "#47c7fc";

export function CuKiZaLogo({
  variant = "full",
  className = "",
}: {
  variant?: "full" | "compact";
  className?: string;
}) {
  const isCompact = variant === "compact";

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        className="relative inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800"
        aria-hidden
        style={{
          width: isCompact ? 32 : 38,
          height: isCompact ? 32 : 38,
          boxShadow:
            "0 1px 2px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.6)",
        }}
      >
        <svg
          width={isCompact ? 22 : 26}
          height={isCompact ? 22 : 26}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="shrink-0"
        >
          <defs>
            <linearGradient id="cukizaRoof" x1="6" y1="4" x2="26" y2="18" gradientUnits="userSpaceOnUse">
              <stop stopColor={BRAND_PRIMARY} />
              <stop offset="1" stopColor="#ffae52" />
            </linearGradient>
            <linearGradient id="cukizaChart" x1="8" y1="25" x2="25" y2="11" gradientUnits="userSpaceOnUse">
              <stop stopColor={BRAND_SECONDARY} />
              <stop offset="1" stopColor="#96e5ff" />
            </linearGradient>
          </defs>
          <path
            d="M5.5 14.5 16 6l10.5 8.5"
            stroke="url(#cukizaRoof)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M9 14.5V25h14V14.5"
            stroke="#1E293B"
            strokeOpacity="0.25"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M13 25v-6h6v6" fill={BRAND_PRIMARY} fillOpacity="0.14" />
          <path
            d="M9.5 21.5 13.3 19l3.2 1.6 5.6-6.1"
            stroke="url(#cukizaChart)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="13.3" cy="19" r="1.4" fill={BRAND_SECONDARY} />
          <circle cx="16.5" cy="20.6" r="1.4" fill={BRAND_SECONDARY} />
          <circle cx="22.1" cy="14.5" r="1.4" fill={BRAND_PRIMARY} />
        </svg>
      </span>

      {!isCompact && (
        <span className="flex min-w-0 flex-col leading-none">
          <span
            className="text-[16px] font-semibold tracking-[0.01em] text-slate-900 dark:text-slate-100"
            style={{
              fontFamily:
                '"Avenir Next", "Trebuchet MS", "Segoe UI", system-ui, sans-serif',
            }}
          >
            <span style={{ color: BRAND_PRIMARY }}>CuKiZa</span>
            <span className="ml-1 text-slate-500 dark:text-slate-400">Family</span>
          </span>
          <span
            className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400"
            style={{
              fontFamily:
                '"Segoe UI", "Helvetica Neue", Helvetica, Arial, system-ui, sans-serif',
            }}
          >
            <span style={{ color: BRAND_SECONDARY }}>Cashflow</span> Planner
          </span>
        </span>
      )}
    </span>
  );
}
