# Prioritized Backlog

Items are ordered by priority within each tier. Review and re-prioritize as needed.

---

## P0 – Critical / Blockers

*(None at this time.)*

---

## P1 – High priority

### 1. Waterfall chart (floating bars)
- **Status:** Deferred; current chart does not match intended behavior.
- **Goal:** Only the first bar (Start) and last bar (End) touch the axis; Income, Expenses, and Investments are floating (visible segment starts at previous cumulative level).
- **Tried:** Excel-style stacked bar (invisible base + visible value). Recharts stacking did not produce the correct layout.
- **Next steps:**
  - Custom Recharts Bar shape that draws each segment from `base` to `base + value` using the Y scale.
  - Or use a charting library with built-in waterfall / bridge chart support.

### 2. Favicon reliability
- **Goal:** House favicon consistently shows in all environments (Cursor preview, external browser, production).
- **Notes:** `app/icon.svg` is in place; Cursor’s embedded browser may still show its own icon. Document for users: “Open in external browser to see app favicon.”

### 3. Form validation and error handling (Entries)
- **Goal:** Client- or server-side validation for amount/budget inputs (numbers, ranges) and clear error messages before saving.
- **Benefit:** Prevents invalid data and accidental overwrites.

---

## P2 – Medium priority

### 4. Starting balance for custom date ranges
- **Goal:** When the selected period does not start in January, “Starting cash balance” is clearly the previous month’s ending balance (already implemented; verify edge cases and copy).

### 5. Category totals: persist sort preference
- **Goal:** Remember “Sort by” (Plan / Actual / Diff / Trend) and direction (e.g. in `localStorage` or URL) so the table opens with the user’s last choice.

### 6. Mobile / responsive improvements
- **Goal:** Tables (dashboard monthly breakdown, entries, category totals) readable and usable on small screens (horizontal scroll, sticky headers, or card layout where appropriate).

### 7. Accessibility (a11y)
- **Goal:** Keyboard navigation, focus management, ARIA labels where needed, and sufficient color contrast (especially for charts and brand colors in dark mode).

### 8. Export / import
- **Goal:** Document or improve CSV export/import (e.g. template, validation, error report) so users can back up or migrate data safely.

---

## P3 – Lower priority / Nice to have

### 9. Dashboard: optional date range presets
- **Goal:** Quick picks (e.g. “Last 3 months”, “This quarter”) in addition to YTD and custom range.

### 10. Entries: bulk edit or copy
- **Goal:** Copy actuals or plan from one month to another (e.g. “Copy last month’s actuals”) to speed data entry.

### 11. Categories: drag-and-drop reorder
- **Goal:** Reorder categories by drag-and-drop in addition to (or instead of) Move up / Move down.

### 12. Tests
- **Goal:** Unit or integration tests for server actions (save entries, clear month, upload CSV) and critical calculations (starting balance, trend %, category totals).

### 13. Performance
- **Goal:** If the dashboard or entries page is slow with large data, add pagination, virtualization, or query optimization.

### 14. Documentation
- **Goal:** Short user guide (how to use Entries, Dashboard, Categories, Settings) and/or in-app hints for first-time users.

---

## Completed (reference)

- Theme (light/dark) with toggle; dark mode across Entries and Settings.
- Categories grouped by type; collapsible groups; permanent delete with confirmation.
- Dashboard: progress charts, trend chart (currency + previous month + %), category totals with sort (Plan/Actual/Diff/Trend), collapsible category totals; starting balance for non-January periods; Recommendations and “How to use” removed.
- Branding: CuKiZa Family Cashflow; logo and house favicon; brand colors (#ff8000, #47c7fc) in logo, header, nav, login, dashboard.
- Chart tooltips: theme-aware colors; trend tooltip space and “Previous month” clarity.
- Collapsibles collapsed by default; Entries form keeps collapsed category inputs in DOM so save does not clear them.
