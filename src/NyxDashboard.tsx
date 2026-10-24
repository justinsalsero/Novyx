import { spendingGradient } from '../shared/domain';
import {
  CalendarDays,
  CircleDollarSign,
  CreditCard,
  FileText,
  Mail,
  Mic2,
  MessageCircle,
  ArrowRight,
  Sparkles,
  Target,
  WalletCards,
  Zap,
  BriefcaseBusiness,
} from 'lucide-react';

type BriefItem = {
  id: string;
  title?: string;
  note?: string;
  amount?: number;
  expected?: number;
  dueDate?: string;
  date?: string;
  eventTime?: string;
  status?: string;
  merchant?: string;
  transactionDate?: string;
  transactionCategory?: string;
  target?: number;
  current?: number;
  client?: string;
};
type BudgetLine = {
  id: string;
  category: string;
  spent: number;
  limit: number;
  pct: number;
};
type SpendingLine = { category: string; amount: number };
type Props = {
  name: string;
  focus: string;
  spending: number;
  income: number;
  debt: number;
  invoicesOwed: number;
  budgetRows: BudgetLine[];
  spendingRows: SpendingLine[];
  upcoming: BriefItem[];
  transactions: BriefItem[];
  invoices: BriefItem[];
  goals: BriefItem[];
  opportunities: BriefItem[];
  subscriptions: BriefItem[];
  inbox: BriefItem[];
  checkedAt: string;
  onNavigate: (section: string) => void;
  onAsk: (prompt: string, mode?: string) => void;
  onVoice: () => void;
  onRefresh: () => void;
};
const money = (n: number) =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(n || 0);
const colors = [
  '#17d5ff',
  '#7b6dff',
  '#d65af9',
  '#25d3a6',
  '#ffaf6a',
  '#ef5b92',
  '#6b98ff',
];

function Tile({
  title,
  value,
  note,
  color,
}: {
  title: string;
  value: string;
  note: string;
  color: string;
}) {
  return (
    <div className="nx-hero-tile" style={{ borderColor: color + '66' }}>
      <span>{title}</span>
      <strong style={{ color }}>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

export default function NyxDashboard(p: Props) {
  const alerts: Array<{ label: string; text: string; type: string }> = [];
  p.invoices
    .filter((i) => i.status !== 'Paid')
    .forEach((i) => {
      if (i.dueDate && i.dueDate < new Date().toISOString().slice(0, 10))
        alerts.push({
          label: 'Overdue invoice',
          text: (i.client || 'Client') + ' · ' + money(Number(i.amount || 0)),
          type: 'warning',
        });
    });
  p.budgetRows
    .filter((i) => i.pct > 100)
    .forEach((i) =>
      alerts.push({
        label: 'Budget exceeded',
        text: i.category + ' · ' + money(i.spent - i.limit) + ' over',
        type: 'warning',
      }),
    );
  p.upcoming.slice(0, 2).forEach((i) =>
    alerts.push({
      label: 'Upcoming event',
      text: (i.title || 'Event') + ' · ' + (i.date || ''),
      type: 'info',
    }),
  );
  if (p.inbox.length)
    alerts.push({
      label: 'Messages to review',
      text: String(p.inbox.length) + ' manually captured items',
      type: 'info',
    });
  const transactionTotal = p.spendingRows.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  return (
    <section className="nx-command-view">
      <div className="nx-command-hero">
        <div className="nx-command-intro">
          <div className="nx-hero-art">
            <span className="nx-hero-glow" />
          </div>
          <div className="nx-intro-copy">
            <p className="nx-overline">YOUR NYX BRIEFING</p>
            <h1>
              Good to see you, <em>{p.name || 'there'}.</em>
            </h1>
            <p>Here is what deserves your attention today.</p>
          </div>
        </div>
        <div className="nx-metrics">
          <Tile
            title="Recorded income · 7 days"
            value={money(p.income)}
            note="Manually tracked cash flow"
            color="#2ee3c5"
          />
          <Tile
            title="Tracked spending · month"
            value={money(p.spending)}
            note="From saved transactions"
            color="#ff718e"
          />
          <Tile
            title="Total debt"
            value={money(p.debt)}
            note="Balances you entered"
            color="#b583ff"
          />
          <Tile
            title="Outstanding invoices"
            value={money(p.invoicesOwed)}
            note="Awaiting payment"
            color="#ffc46e"
          />
        </div>
        <div className="nx-actionstrip">
          <button className="nx-primary-action" onClick={p.onVoice}>
            <Mic2 size={19} /> Talk to Nyx
          </button>
          <button onClick={() => p.onNavigate('assistant')}>
            <MessageCircle size={19} /> Ask Nyx
          </button>
          <button
            onClick={() =>
              p.onAsk(
                'Build my top three actions for today using my actual saved data.',
                'Focus',
              )
            }
          >
            <CalendarDays size={19} /> Plan my day
          </button>
          <button onClick={() => p.onNavigate('money')}>
            <CircleDollarSign size={19} /> Review money
          </button>
        </div>
        <div className="nx-source-note">
          <span className="nx-pulse-dot" /> Nyx checks saved workspace data when
          the app is open · Last checked {p.checkedAt || 'just now'}{' '}
          <button onClick={p.onRefresh}>Refresh</button>
        </div>
      </div>

      <div className="nx-command-grid">
        <article className="nx-command-card nx-focus">
          <div className="nx-panel-title">
            <span>
              <Target size={19} /> Nyx Focus
            </span>
            <button
              onClick={() =>
                p.onAsk(
                  'What is my highest priority based on my latest tasks, calendar, bills and opportunities?',
                  'Focus',
                )
              }
            >
              See plan <ArrowRight size={15} />
            </button>
          </div>
          <div className="nx-focus-main">
            <span className="nx-focus-index">01</span>
            <p>{p.focus}</p>
          </div>
          <div className="nx-focus-extras">
            {p.upcoming.slice(0, 2).map((i) => (
              <div key={i.id}>
                <CalendarDays size={15} />
                <span>{i.title}</span>
                <small>{i.date}</small>
              </div>
            ))}
            {!p.upcoming.length && (
              <small>Add an event in Calendar to keep it on your radar.</small>
            )}
          </div>
        </article>
        <article className="nx-command-card">
          <div className="nx-panel-title">
            <span>
              <Sparkles size={19} /> Nyx Recommends
            </span>
            <button onClick={() => p.onNavigate('assistant')}>
              Ask Nyx <ArrowRight size={15} />
            </button>
          </div>
          <div className="nx-recommend">
            <span className="nx-reco-icon">
              <WalletCards size={16} />
            </span>
            <div>
              <b>Review your spending</b>
              <small>
                {p.spending
                  ? money(p.spending) + ' logged this month'
                  : 'Start with your first transaction'}
              </small>
            </div>
            <button onClick={() => p.onNavigate('money')}>
              <ArrowRight size={15} />
            </button>
          </div>
          <div className="nx-recommend">
            <span className="nx-reco-icon">
              <FileText size={16} />
            </span>
            <div>
              <b>Follow up on invoices</b>
              <small>{p.invoices.length} invoices tracked</small>
            </div>
            <button onClick={() => p.onNavigate('bills')}>
              <ArrowRight size={15} />
            </button>
          </div>
          <div className="nx-recommend">
            <span className="nx-reco-icon">
              <Zap size={16} />
            </span>
            <div>
              <b>Make the next move</b>
              <small>Ask Nyx for a practical action plan</small>
            </div>
            <button
              onClick={() =>
                p.onAsk(
                  'Suggest three high-value next actions for me.',
                  'Focus',
                )
              }
            >
              <ArrowRight size={15} />
            </button>
          </div>
        </article>
        <article className="nx-command-card">
          <div className="nx-panel-title">
            <span>
              <CircleDollarSign size={19} /> Spending breakdown
            </span>
            <button onClick={() => p.onNavigate('money')}>
              Details <ArrowRight size={15} />
            </button>
          </div>
          <div className="nx-spending-body">
            <div
              className="nx-donut"
              style={{
                background: transactionTotal
                  ? spendingGradient(p.spendingRows, colors)
                  : 'conic-gradient(#263b59 0 100%)',
              }}
            >
              <div>
                <strong>{money(p.spending)}</strong>
                <small>This month</small>
              </div>
            </div>
            <div className="nx-category-list">
              {p.spendingRows.slice(0, 5).map((i, index) => (
                <div key={i.category}>
                  <span>
                    <i style={{ background: colors[index % colors.length] }} />
                    {i.category}
                  </span>
                  <strong>{money(i.amount)}</strong>
                </div>
              ))}
              {!p.spendingRows.length && (
                <small>
                  No transactions yet. Your chart will fill as you track
                  spending.
                </small>
              )}
            </div>
          </div>
        </article>
        <article className="nx-command-card">
          <div className="nx-panel-title">
            <span>
              <Zap size={19} /> Nyx Live
            </span>
            <button onClick={p.onRefresh}>
              Refresh <ArrowRight size={15} />
            </button>
          </div>
          <p className="nx-subdued">
            Updates from your Novyx records. Bank and email syncing require
            authorization.
          </p>
          <div className="nx-live-list">
            {alerts.slice(0, 4).map((i, index) => (
              <div className={'nx-live-item ' + i.type} key={index}>
                <span className="nx-pulse-dot" />
                <div>
                  <b>{i.label}</b>
                  <small>{i.text}</small>
                </div>
              </div>
            ))}
            {!alerts.length && (
              <div className="nx-empty">
                <Sparkles size={22} />
                <p>
                  No urgent items in your saved workspace. Nyx is ready when you
                  are.
                </p>
              </div>
            )}
          </div>
        </article>
        <article className="nx-command-card">
          <div className="nx-panel-title">
            <span>
              <CalendarDays size={19} /> Upcoming
            </span>
            <button onClick={() => p.onNavigate('calendar')}>
              Calendar <ArrowRight size={15} />
            </button>
          </div>
          {p.upcoming.slice(0, 4).map((i) => (
            <div className="nx-data-line" key={i.id}>
              <span className="nx-calendar-dot" />
              <div>
                <b>{i.title}</b>
                <small>
                  {i.date} {i.eventTime || ''}
                </small>
              </div>
            </div>
          ))}
          {!p.upcoming.length && (
            <div className="nx-empty">
              <CalendarDays size={22} />
              <p>Your upcoming events appear here once added.</p>
              <button onClick={() => p.onNavigate('calendar')}>
                Add event
              </button>
            </div>
          )}
        </article>
        <article className="nx-command-card">
          <div className="nx-panel-title">
            <span>
              <WalletCards size={19} /> Recent transactions
            </span>
            <button onClick={() => p.onNavigate('money')}>
              Money <ArrowRight size={15} />
            </button>
          </div>
          {p.transactions.slice(0, 5).map((i) => (
            <div className="nx-data-line" key={i.id}>
              <span className="nx-money-icon">
                <WalletCards size={15} />
              </span>
              <div>
                <b>{i.merchant || 'Transaction'}</b>
                <small>
                  {i.transactionCategory || 'Other'} · {i.transactionDate || ''}
                </small>
              </div>
              <strong>{money(Number(i.amount || 0))}</strong>
            </div>
          ))}
          {!p.transactions.length && (
            <div className="nx-empty">
              <WalletCards size={22} />
              <p>Record your first transaction in Money.</p>
            </div>
          )}
        </article>
        <article className="nx-command-card nx-small-panel">
          <div className="nx-panel-title">
            <span>
              <Mail size={19} /> Inbox
            </span>
            <button onClick={() => p.onNavigate('organize')}>
              Open <ArrowRight size={15} />
            </button>
          </div>
          <strong className="nx-large-figure">{p.inbox.length}</strong>
          <small>Captured messages awaiting your review</small>
        </article>
        <article className="nx-command-card nx-small-panel">
          <div className="nx-panel-title">
            <span>
              <CreditCard size={19} /> Subscriptions
            </span>
            <button onClick={() => p.onNavigate('money')}>
              Manage <ArrowRight size={15} />
            </button>
          </div>
          <strong className="nx-large-figure">
            {p.subscriptions.filter((s) => s.status !== 'Cancelled').length}
          </strong>
          <small>Tracked active subscriptions</small>
        </article>
        <article className="nx-command-card nx-small-panel">
          <div className="nx-panel-title">
            <span>
              <BriefcaseBusiness size={19} /> Opportunities
            </span>
            <button onClick={() => p.onNavigate('money')}>
              Open <ArrowRight size={15} />
            </button>
          </div>
          <strong className="nx-large-figure">{p.opportunities.length}</strong>
          <small>Leads and paid work in your pipeline</small>
        </article>
        <article className="nx-command-card nx-small-panel">
          <div className="nx-panel-title">
            <span>
              <Target size={19} /> Goals
            </span>
            <button onClick={() => p.onNavigate('goals')}>
              View <ArrowRight size={15} />
            </button>
          </div>
          <strong className="nx-large-figure">{p.goals.length}</strong>
          <small>Goals you are working towards</small>
        </article>
      </div>
    </section>
  );
}
