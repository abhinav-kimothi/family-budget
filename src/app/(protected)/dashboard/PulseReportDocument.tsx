import { PulseReportAutoPrint } from "./PulseReportAutoPrint";

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount ?? 0);
}

type PulseReportDocumentProps = {
  data: any;
  autoPrint?: boolean;
};

export function PulseReportDocument({
  data,
  autoPrint = false,
}: PulseReportDocumentProps) {
  const topInsights = (data.insights ?? []).slice(0, 3);
  const allInsights = data.insights ?? [];
  const generatedAt = data.meta?.generatedAt
    ? new Date(data.meta.generatedAt).toLocaleString()
    : "";
  const pctText = (value: number, plan: number) => {
    if (!plan) return "—";
    const pct = ((value - plan) / Math.abs(plan)) * 100;
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
  };
  const deviationTone = (delta: number) =>
    delta > 0 ? "#dc2626" : delta < 0 ? "#059669" : "#475569";

  return (
    <>
      <style>{`
        header { display: none !important; }
        main { max-width: none !important; padding: 0 !important; }
        body { background: #eef2f7; }
        .pulse-report-shell {
          max-width: 1160px;
          margin: 0 auto;
          padding: 20px;
          color: #0f172a;
        }
        .pulse-report-page {
          background: #ffffff;
          border: 1px solid #dbe5f0;
          border-radius: 18px;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
          padding: 18px;
          margin-bottom: 16px;
          break-inside: avoid-page;
          page-break-inside: avoid;
        }
        .pulse-report-page.break-after {
          break-after: page;
          page-break-after: always;
        }
        .pulse-report-kicker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid #fdba74;
          background: #fff7ed;
          color: #9a3412;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .08em;
          text-transform: uppercase;
          padding: 6px 10px;
        }
        .pulse-report-h1 {
          font-size: 34px;
          line-height: 1.05;
          margin: 10px 0 6px 0;
          font-weight: 800;
          letter-spacing: -0.02em;
        }
        .pulse-report-sub {
          color: #475569;
          margin: 0;
          font-size: 14px;
        }
        .pulse-report-meta {
          margin-top: 10px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .pulse-chip {
          border: 1px solid #dbe5f0;
          background: #f8fafc;
          color: #334155;
          border-radius: 999px;
          font-size: 11px;
          padding: 5px 10px;
        }
        .grid-4 {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-top: 14px;
        }
        .grid-2 {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 14px;
        }
        .metric-card {
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 12px;
          background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
          break-inside: avoid-page;
          page-break-inside: avoid;
        }
        .metric-card h3 {
          margin: 0;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: .08em;
          color: #475569;
        }
        .metric-card .value {
          margin-top: 6px;
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -0.02em;
        }
        .metric-card .muted {
          font-size: 11px;
          color: #64748b;
          margin-top: 5px;
          line-height: 1.35;
        }
        .metric-card .plan-row {
          margin-top: 8px;
          display: flex;
          justify-content: space-between;
          gap: 8px;
          font-size: 11px;
          color: #0f172a;
          font-weight: 700;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 6px 8px;
        }
        .metric-card .dev-row {
          margin-top: 6px;
          display: flex;
          justify-content: space-between;
          gap: 8px;
          font-size: 11px;
          font-weight: 700;
        }
        .metric-card .dev-row.secondary {
          margin-top: 4px;
          font-weight: 600;
          font-size: 10px;
        }
        .section-card {
          border: 1px solid #dbe5f0;
          border-radius: 14px;
          padding: 12px;
          background: #fff;
          break-inside: avoid-page;
          page-break-inside: avoid;
        }
        .section-title {
          margin: 0;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: .08em;
          color: #334155;
          font-weight: 700;
        }
        .section-sub {
          margin: 4px 0 0 0;
          color: #64748b;
          font-size: 11px;
        }
        .mini-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-top: 10px;
        }
        .mini-box {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 8px;
          background: #f8fafc;
        }
        .mini-box .label {
          font-size: 10px;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: .06em;
          font-weight: 700;
        }
        .mini-box .amt {
          margin-top: 3px;
          font-size: 16px;
          font-weight: 700;
        }
        .insight-card {
          border: 1px solid #dbe5f0;
          border-radius: 12px;
          padding: 10px;
          background: #fff;
          break-inside: avoid-page;
          page-break-inside: avoid;
        }
        .insight-card.warn { border-color: #fde68a; background: #fffbeb; }
        .insight-card.good { border-color: #bbf7d0; background: #f0fdf4; }
        .insight-card.info { border-color: #bfdbfe; background: #eff6ff; }
        .insight-title {
          margin: 0;
          font-size: 12px;
          font-weight: 700;
          color: #1e293b;
        }
        .insight-detail {
          margin: 6px 0 0 0;
          font-size: 11px;
          line-height: 1.4;
          color: #334155;
        }
        .insight-rec {
          margin: 6px 0 0 0;
          font-size: 11px;
          line-height: 1.4;
          color: #0f172a;
        }
        .report-table-wrap {
          margin-top: 10px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow: hidden;
          background: #fff;
        }
        .report-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 11px;
        }
        .report-table thead th {
          background: #f8fafc;
          color: #334155;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: .06em;
          text-align: left;
          padding: 8px 10px;
          border-bottom: 1px solid #e2e8f0;
        }
        .report-table tbody td {
          padding: 8px 10px;
          border-bottom: 1px solid #eef2f7;
          color: #1e293b;
          vertical-align: top;
          word-break: break-word;
          overflow-wrap: anywhere;
        }
        .report-table tbody tr:nth-child(even) td {
          background: #fcfdff;
        }
        .num {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .tag-list {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .tag {
          border-radius: 999px;
          border: 1px solid #dbe5f0;
          background: #f8fafc;
          padding: 2px 6px;
          font-size: 10px;
          color: #475569;
        }
        .small-note {
          color: #64748b;
          font-size: 10px;
          margin-top: 8px;
        }
        .page-footer {
          margin-top: 10px;
          font-size: 10px;
          color: #64748b;
          display: flex;
          justify-content: space-between;
          gap: 8px;
        }
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body { background: #fff !important; }
          .pulse-report-shell { max-width: none; margin: 0; padding: 0; }
          .pulse-report-page {
            box-shadow: none !important;
            border-radius: 12px;
            margin: 0 0 10px 0;
          }
          .pulse-report-page.break-after { margin-bottom: 0; }
        }
      `}</style>
      {autoPrint ? <PulseReportAutoPrint /> : null}
      <div className="pulse-report-shell">
        <div className="pulse-report-page break-after">
          <div className="pulse-report-kicker">Pulse Report</div>
          <h1 className="pulse-report-h1">Family Financial Pulse</h1>
          <p className="pulse-report-sub">{data.meta?.periodLabel}</p>
          <div className="pulse-report-meta">
            <span className="pulse-chip">View: {data.meta?.view}</span>
            <span className="pulse-chip">Year: {data.meta?.year}</span>
            <span className="pulse-chip">User: {data.meta?.user}</span>
            <span className="pulse-chip">Generated: {generatedAt}</span>
          </div>

          <div className="grid-4">
            <div className="metric-card">
              <h3>Income</h3>
              {(() => {
                const actual = data.summary?.income?.actual ?? 0;
                const plan = data.summary?.income?.plan ?? 0;
                const delta = actual - plan;
                return (
                  <>
              <div className="value">{formatCurrency(data.summary?.income?.actual ?? 0, data.meta?.currency)}</div>
              <div className="muted">
                YTD total {formatCurrency(data.summary?.income?.ytdTotal ?? 0, data.meta?.currency)} · Average monthly {formatCurrency(data.summary?.income?.averageMonthly ?? 0, data.meta?.currency)}
              </div>
              <div className="plan-row">
                <span>Planned</span>
                <span>{formatCurrency(plan, data.meta?.currency)}</span>
              </div>
              <div className="dev-row" style={{ color: deviationTone(delta) }}>
                <span>Deviation vs plan</span>
                <span>{formatCurrency(delta, data.meta?.currency)} ({pctText(actual, plan)})</span>
              </div>
                  </>
                );
              })()}
            </div>
            <div className="metric-card">
              <h3>Investments</h3>
              {(() => {
                const actual = data.summary?.investments?.actual ?? 0;
                const plan = data.summary?.investments?.plan ?? 0;
                const delta = actual - plan;
                return (
                  <>
              <div className="value">{formatCurrency(data.summary?.investments?.actual ?? 0, data.meta?.currency)}</div>
              <div className="muted">
                YTD total {formatCurrency(data.summary?.investments?.ytdTotal ?? 0, data.meta?.currency)} · Average monthly {formatCurrency(data.summary?.investments?.averageMonthly ?? 0, data.meta?.currency)}
              </div>
              <div className="plan-row">
                <span>Planned</span>
                <span>{formatCurrency(plan, data.meta?.currency)}</span>
              </div>
              <div className="dev-row" style={{ color: deviationTone(delta) }}>
                <span>Deviation vs plan</span>
                <span>{formatCurrency(delta, data.meta?.currency)} ({pctText(actual, plan)})</span>
              </div>
                  </>
                );
              })()}
            </div>
            <div className="metric-card">
              <h3>Expenses (Actual / Recognized)</h3>
              {(() => {
                const actual = data.summary?.expenses?.actual ?? 0;
                const recognized = data.summary?.expenses?.recognized ?? 0;
                const plan = data.summary?.expenses?.plan ?? 0;
                const deltaActual = actual - plan;
                const deltaRecognized = recognized - plan;
                return (
                  <>
              <div className="value">
                {formatCurrency(actual, data.meta?.currency)} / {formatCurrency(recognized, data.meta?.currency)}
              </div>
              <div className="muted">
                Avg monthly {formatCurrency(data.summary?.expenses?.averageMonthlyActual ?? 0, data.meta?.currency)} / {formatCurrency(data.summary?.expenses?.averageMonthlyRecognized ?? 0, data.meta?.currency)}
              </div>
              <div className="plan-row">
                <span>Planned</span>
                <span>{formatCurrency(plan, data.meta?.currency)}</span>
              </div>
              <div className="dev-row" style={{ color: deviationTone(deltaActual) }}>
                <span>Deviation (Actual)</span>
                <span>{formatCurrency(deltaActual, data.meta?.currency)} ({pctText(actual, plan)})</span>
              </div>
              <div className="dev-row secondary" style={{ color: deviationTone(deltaRecognized) }}>
                <span>Deviation (Recognized)</span>
                <span>{formatCurrency(deltaRecognized, data.meta?.currency)} ({pctText(recognized, plan)})</span>
              </div>
                  </>
                );
              })()}
            </div>
            <div className="metric-card">
              <h3>Net Cashflow (Actual / Recognized)</h3>
              {(() => {
                const actual = data.summary?.netCashflow?.actual ?? 0;
                const recognized = data.summary?.netCashflow?.recognized ?? 0;
                const plan = data.summary?.netCashflow?.plan ?? 0;
                const deltaActual = actual - plan;
                const deltaRecognized = recognized - plan;
                return (
                  <>
              <div className="value">
                {formatCurrency(actual, data.meta?.currency)} / {formatCurrency(recognized, data.meta?.currency)}
              </div>
              <div className="muted">
                Avg monthly {formatCurrency(data.summary?.netCashflow?.averageMonthlyActual ?? 0, data.meta?.currency)} / {formatCurrency(data.summary?.netCashflow?.averageMonthlyRecognized ?? 0, data.meta?.currency)}
              </div>
              <div className="plan-row">
                <span>Planned</span>
                <span>{formatCurrency(plan, data.meta?.currency)}</span>
              </div>
              <div className="dev-row" style={{ color: deviationTone(deltaActual) }}>
                <span>Deviation (Actual)</span>
                <span>{formatCurrency(deltaActual, data.meta?.currency)} ({pctText(actual, plan)})</span>
              </div>
              <div className="dev-row secondary" style={{ color: deviationTone(deltaRecognized) }}>
                <span>Deviation (Recognized)</span>
                <span>{formatCurrency(deltaRecognized, data.meta?.currency)} ({pctText(recognized, plan)})</span>
              </div>
                  </>
                );
              })()}
            </div>
          </div>

          <div className="grid-2">
            <div className="section-card">
              <p className="section-title">Balances</p>
              <p className="section-sub">Cash and investable balances for the selected period.</p>
              <div className="mini-grid">
                <div className="mini-box">
                  <div className="label">Cash Start</div>
                  <div className="amt">{formatCurrency(data.balances?.cash?.starting ?? 0, data.meta?.currency)}</div>
                </div>
                <div className="mini-box">
                  <div className="label">Cash End</div>
                  <div className="amt">{formatCurrency(data.balances?.cash?.ending ?? 0, data.meta?.currency)}</div>
                </div>
                <div className="mini-box">
                  <div className="label">Investable Start</div>
                  <div className="amt">{formatCurrency(data.balances?.investable?.starting ?? 0, data.meta?.currency)}</div>
                </div>
                <div className="mini-box">
                  <div className="label">Investable End</div>
                  <div className="amt">{formatCurrency(data.balances?.investable?.ending ?? 0, data.meta?.currency)}</div>
                </div>
              </div>
            </div>
            <div className="section-card">
              <p className="section-title">Top Insights</p>
              <p className="section-sub">Top 3 insights for the selected period and view.</p>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {topInsights.length === 0 ? (
                  <div className="small-note">No insights generated for this selection.</div>
                ) : (
                  topInsights.map((insight: any, idx: number) => (
                    <div key={`${insight.title}-${idx}`} className={`insight-card ${insight.severity ?? "info"}`}>
                      <p className="insight-title">{idx + 1}. {insight.title}</p>
                      <p className="insight-detail">{insight.detail}</p>
                      {insight.recommendation ? (
                        <p className="insight-rec"><strong>Recommendation:</strong> {insight.recommendation}</p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="page-footer">
            <span>{data.meta?.title ?? "Pulse Report"}</span>
            <span>{data.meta?.periodLabel}</span>
          </div>
        </div>

        <div className="pulse-report-page break-after">
          <div className="section-card" style={{ marginBottom: 12 }}>
            <p className="section-title">Expense Mix By Need Tier</p>
            <p className="section-sub">Actual vs recognized mix using allocation tiers and category defaults.</p>
            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Tier</th>
                    <th className="num">Actual</th>
                    <th className="num">Recognized</th>
                    <th className="num">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.needTierMix ?? []).map((row: any) => (
                    <tr key={row.tierKey}>
                      <td>{row.tierLabel}</td>
                      <td className="num">{formatCurrency(row.actual ?? 0, data.meta?.currency)}</td>
                      <td className="num">{formatCurrency(row.recognized ?? 0, data.meta?.currency)}</td>
                      <td className="num">{formatCurrency((row.recognized ?? 0) - (row.actual ?? 0), data.meta?.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="section-card" style={{ marginBottom: 12 }}>
            <p className="section-title">Monthly Breakdown (Cash Actual + Recognized)</p>
            <p className="section-sub">Selected period monthly rollup.</p>
            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th style={{ width: "10%" }}>Month</th>
                    <th className="num">Income</th>
                    <th className="num">Exp Plan</th>
                    <th className="num">Exp Actual</th>
                    <th className="num">Exp Rec</th>
                    <th className="num">Inv Plan</th>
                    <th className="num">Inv Actual</th>
                    <th className="num">Net Plan</th>
                    <th className="num">Net Actual</th>
                    <th className="num">Net Rec</th>
                    <th className="num">End Cash</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.monthlyBreakdown ?? []).map((m: any) => (
                    <tr key={`${m.month}-${m.monthLabel}`}>
                      <td>{m.monthLabel} {data.meta?.year}</td>
                      <td className="num">{formatCurrency(m.income ?? 0, data.meta?.currency)}</td>
                      <td className="num">{formatCurrency(m.expensesPlan ?? 0, data.meta?.currency)}</td>
                      <td className="num">{formatCurrency(m.expensesActual ?? 0, data.meta?.currency)}</td>
                      <td className="num">{formatCurrency(m.expensesRecognized ?? 0, data.meta?.currency)}</td>
                      <td className="num">{formatCurrency(m.investmentsPlan ?? 0, data.meta?.currency)}</td>
                      <td className="num">{formatCurrency(m.investmentsActual ?? 0, data.meta?.currency)}</td>
                      <td className="num">{formatCurrency(m.netPlan ?? 0, data.meta?.currency)}</td>
                      <td className="num">{formatCurrency(m.netActual ?? 0, data.meta?.currency)}</td>
                      <td className="num">{formatCurrency(m.netRecognized ?? 0, data.meta?.currency)}</td>
                      <td className="num">{formatCurrency(m.balance ?? 0, data.meta?.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {(data.annualBudgetRemaining ?? []).length > 0 ? (
            <div className="section-card">
              <p className="section-title">Annual Budget Remaining (Selected Categories)</p>
              <p className="section-sub">Calendar-year remaining budget after the selected period.</p>
              <div className="report-table-wrap">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th className="num">Annual Budget</th>
                      <th className="num">Spent YTD (Actual)</th>
                      <th className="num">Remaining (Actual)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.annualBudgetRemaining ?? []).map((row: any) => (
                      <tr key={row.categoryName}>
                        <td>{row.categoryName}</td>
                        <td className="num">{formatCurrency(row.annualBudget ?? 0, data.meta?.currency)}</td>
                        <td className="num">{formatCurrency(row.spentActualYtd ?? 0, data.meta?.currency)}</td>
                        <td className="num">{formatCurrency(row.remainingActual ?? 0, data.meta?.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="page-footer">
            <span>Monthly and annual budget detail</span>
            <span>{data.meta?.periodLabel}</span>
          </div>
        </div>

        <div className="pulse-report-page">
          <div className="section-card" style={{ marginBottom: 12 }}>
            <p className="section-title">Category Totals (Period)</p>
            <p className="section-sub">Category-wise plan, actual, recognized and variance detail.</p>
            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th style={{ width: "18%" }}>Category</th>
                    <th style={{ width: "10%" }}>Type</th>
                    <th className="num">Plan</th>
                    <th className="num">Actual</th>
                    <th className="num">Recognized</th>
                    <th className="num">Diff (vs Actual)</th>
                    <th className="num">Diff (vs Recognized)</th>
                    <th style={{ width: "18%" }}>Tier Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.categoryTotals ?? []).map((row: any) => {
                    const flags = [
                      row.needTierFlags?.nonEssential ? `NE (${row.needTierFlags.nonEssential})` : "",
                      row.needTierFlags?.travel ? `Travel (${row.needTierFlags.travel})` : "",
                      row.needTierFlags?.luxury ? `Luxury (${row.needTierFlags.luxury})` : "",
                    ].filter(Boolean);
                    return (
                      <tr key={`${row.type}-${row.categoryName}`}>
                        <td>{row.categoryName}</td>
                        <td>{row.type}</td>
                        <td className="num">{formatCurrency(row.plan ?? 0, data.meta?.currency)}</td>
                        <td className="num">{formatCurrency(row.actual ?? 0, data.meta?.currency)}</td>
                        <td className="num">{formatCurrency(row.recognized ?? 0, data.meta?.currency)}</td>
                        <td className="num">{formatCurrency(row.diffVsActual ?? 0, data.meta?.currency)}</td>
                        <td className="num">
                          {row.diffVsRecognized == null
                            ? "—"
                            : formatCurrency(row.diffVsRecognized, data.meta?.currency)}
                        </td>
                        <td>
                          {flags.length ? (
                            <div className="tag-list">
                              {flags.map((f) => (
                                <span key={f} className="tag">{f}</span>
                              ))}
                            </div>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="section-card">
            <p className="section-title">Insights & Recommendations</p>
            <p className="section-sub">Full insights list for the selected period and view.</p>
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {allInsights.length === 0 ? (
                <div className="small-note">No insights available for this selection.</div>
              ) : (
                allInsights.map((insight: any, idx: number) => (
                  <div key={`all-${idx}-${insight.title}`} className={`insight-card ${insight.severity ?? "info"}`}>
                    <p className="insight-title">{idx + 1}. {insight.title}</p>
                    <p className="insight-detail">{insight.detail}</p>
                    {insight.recommendation ? (
                      <p className="insight-rec"><strong>Recommendation:</strong> {insight.recommendation}</p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="page-footer">
            <span>Category detail and insights</span>
            <span>{data.meta?.periodLabel}</span>
          </div>
        </div>
      </div>
    </>
  );
}
