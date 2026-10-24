import { useState } from 'react';
import { loadWorkspace } from './data';
import { localDay, upcomingEvent } from '../shared/domain';
import { CalendarDays, Wallet } from 'lucide-react';
type Insights = {
  asOf: string;
  source: string;
  finances: {
    trackedSpendingLast30Days: number;
    recurringSubscriptionsMonthlyEstimate: number;
    minimumDebtPayments: number;
    totalRecordedDebt: number;
    unpaidInvoiceTotal: number;
    overdueInvoiceCount: number;
    forecastAvailable: boolean;
  };
  plan: {
    tasks: { title: string; dueDate: string }[];
    events: { title: string; date: string }[];
    uncompletedTaskCount: number;
  };
  warning: string;
};
const cad = (n: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(
    n || 0,
  );
export default function NyxInsights() {
  const [data, setData] = useState<Insights | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const [startingBalance, setStartingBalance] = useState('');
  const [expectedIncome, setExpectedIncome] = useState('');
  const [otherBills, setOtherBills] = useState('');
  const [includeSpending, setIncludeSpending] = useState(false);
  const num = (s: string) => Math.max(0, Number(s) || 0);
  const projected = data
    ? num(startingBalance) +
      num(expectedIncome) -
      num(otherBills) -
      data.finances.recurringSubscriptionsMonthlyEstimate -
      data.finances.minimumDebtPayments -
      (includeSpending ? data.finances.trackedSpendingLast30Days : 0)
    : 0;
  async function load() {
    setBusy(true);
    try {
      const workspace = await loadWorkspace();
      const today = localDay();
      setData({
        asOf: new Date().toISOString(),
        source:
          'Complete saved Novyx records; external accounts are not connected',
        finances: {
          trackedSpendingLast30Days: workspace.summary.totalSpending30,
          recurringSubscriptionsMonthlyEstimate:
            workspace.summary.subscriptionMonthly,
          minimumDebtPayments: workspace.summary.minimumPayments,
          totalRecordedDebt: workspace.summary.totalDebt,
          unpaidInvoiceTotal: workspace.summary.unpaidInvoices,
          overdueInvoiceCount: workspace.invoices.filter(
            (item: { status?: string; dueDate?: string }) =>
              item.status !== 'Paid' && item.dueDate && item.dueDate < today,
          ).length,
          forecastAvailable: false,
        },
        plan: {
          tasks: workspace.tasks
            .filter((item: { done?: boolean }) => !item.done)
            .slice(0, 5),
          events: workspace.events
            .filter((item: { date?: string }) => upcomingEvent(item, today))
            .slice(0, 5),
          uncompletedTaskCount: workspace.summary.openTasks,
        },
        warning:
          'Recorded-data snapshot only. This is not a bank balance or verified spendable cash.',
      });
      setNotice('');
    } catch {
      setNotice('Unable to load your saved-data insights.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      style={{
        padding: 16,
        margin: '12px 0',
        border: '1px solid rgba(132,161,255,.28)',
        borderRadius: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}
      >
        <strong>
          <Wallet size={16} /> Smart briefing
        </strong>
        <button type="button" disabled={busy} onClick={() => void load()}>
          {busy
            ? 'Loading…'
            : data
              ? 'Refresh briefing'
              : 'View financial & daily snapshot'}
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {data && (
        <div>
          <p style={{ fontSize: 12 }}>
            {data.source}. Updated {new Date(data.asOf).toLocaleString()}.
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
              gap: 12,
            }}
          >
            <div>
              <small>30-day recorded spending</small>
              <p>
                <strong>{cad(data.finances.trackedSpendingLast30Days)}</strong>
              </p>
            </div>
            <div>
              <small>Estimated monthly subscriptions</small>
              <p>
                <strong>
                  {cad(data.finances.recurringSubscriptionsMonthlyEstimate)}
                </strong>
              </p>
            </div>
            <div>
              <small>Minimum debt payments</small>
              <p>
                <strong>{cad(data.finances.minimumDebtPayments)}</strong>
              </p>
            </div>
            <div>
              <small>Unpaid invoices</small>
              <p>
                <strong>{cad(data.finances.unpaidInvoiceTotal)}</strong>
              </p>
            </div>
          </div>
          <h4>
            <CalendarDays size={16} /> Upcoming priorities
          </h4>
          <ul>
            {data.plan.tasks.map((t, i) => (
              <li key={i}>
                {t.title}
                {t.dueDate ? ' · due ' + t.dueDate : ''}
              </li>
            ))}
            {data.plan.events.map((e, i) => (
              <li key={'event' + i}>
                {e.title} · {e.date}
              </li>
            ))}
          </ul>
          {!data.plan.tasks.length && !data.plan.events.length && (
            <p>No scheduled priorities in your saved records.</p>
          )}
          <p style={{ fontSize: 12 }}>{data.warning}</p>
          <div
            style={{
              padding: 12,
              border: '1px solid rgba(132,161,255,.22)',
              borderRadius: 12,
            }}
          >
            <h4>30-day what-if cash buffer</h4>
            <p style={{ fontSize: 12 }}>
              Optional scenario only. Your numbers stay in this screen and are
              not saved or sent to Nyx. Enter a starting cash balance, expected
              income and other bills. Existing recorded subscriptions and
              minimum debt payments are subtracted once. This is not a verified
              account balance or bank forecast.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))',
                gap: 10,
              }}
            >
              <label>
                Starting cash (CAD)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={startingBalance}
                  onChange={(e) => setStartingBalance(e.target.value)}
                  placeholder="0"
                />
              </label>
              <label>
                Expected 30-day income
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={expectedIncome}
                  onChange={(e) => setExpectedIncome(e.target.value)}
                  placeholder="0"
                />
              </label>
              <label>
                Other 30-day bills
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={otherBills}
                  onChange={(e) => setOtherBills(e.target.value)}
                  placeholder="0"
                />
              </label>
            </div>
            <label style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input
                type="checkbox"
                checked={includeSpending}
                onChange={(e) => setIncludeSpending(e.target.checked)}
              />
              Also subtract recorded last-30-day spending as an estimate (may
              double-count subscriptions and bills)
            </label>
            <p>
              <strong>
                Illustrative remaining cash:{' '}
                {startingBalance.trim()
                  ? cad(projected)
                  : 'Enter a starting balance'}
              </strong>
            </p>
            <p style={{ fontSize: 12 }}>
              Assumes listed recurring obligations occur within 30 days;
              excludes unrecorded expenses, tax, timing and uncertainty. Never
              treat this estimate as spendable cash without checking your
              accounts.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
