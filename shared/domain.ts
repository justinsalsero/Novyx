export type RecordItem = { id?: string; [key: string]: unknown };

export const kinds = [
  'tasks',
  'debts',
  'inbox',
  'social',
  'income',
  'cashflow',
  'goals',
  'invoices',
  'transactions',
  'budgets',
  'subscriptions',
  'clients',
  'events',
  'receipts',
] as const;
export type Kind = (typeof kinds)[number];

export function localDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Vancouver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(value + 'T12:00:00Z');
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function minutes(value: unknown) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    return null;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function eventMinutes(item: RecordItem) {
  return minutes(item.eventTime || item.startTime || item.time);
}

export function activeEvent(item: RecordItem) {
  return (
    item.externalActive !== false &&
    !['cancelled', 'canceled'].includes(String(item.status || '').toLowerCase())
  );
}

export function eventInterval(item: RecordItem, day: string) {
  if (!activeEvent(item) || item.busy === false || !validDate(item.date))
    return null;
  const endDate = validDate(item.endDate) ? item.endDate : item.date;
  if (day < item.date || day > endDate) return null;
  if (item.allDay === true) {
    if (item.endDate && day >= endDate) return null;
    return { start: 0, end: 1440, untimed: false };
  }
  const startTime = eventMinutes(item);
  if (startTime === null)
    return day === item.date ? { start: 0, end: 1440, untimed: true } : null;
  const start = day === item.date ? startTime : 0;
  const explicitEnd = minutes(item.endTime);
  const end =
    day < endDate
      ? 1440
      : (explicitEnd ??
        Math.min(1440, startTime + Number(item.duration || 60)));
  return end > start ? { start, end, untimed: false } : null;
}

export function upcomingEvent(item: RecordItem, today = localDay()) {
  if (item.allDay === true && item.endDate && String(item.endDate) <= today)
    return false;
  return activeEvent(item) && String(item.endDate || item.date || '') >= today;
}

export function monthlySubscription(items: RecordItem[]) {
  return items
    .filter((item) => item.status !== 'Cancelled')
    .reduce((sum, item) => {
      const amount = Number(item.amount || 0);
      return (
        sum +
        amount *
          (item.cadence === 'weekly'
            ? 52 / 12
            : item.cadence === 'biweekly'
              ? 26 / 12
              : item.cadence === 'yearly'
                ? 1 / 12
                : 1)
      );
    }, 0);
}

export function summarize(
  data: Record<string, RecordItem[]>,
  now = new Date(),
) {
  const rows = (kind: string) => data[kind] || [];
  const sum = (items: RecordItem[], field: string) =>
    items.reduce((n, item) => n + Number(item[field] || 0), 0);
  const today = localDay(now);
  const cutoff = new Date(today + 'T12:00:00Z');
  cutoff.setUTCDate(cutoff.getUTCDate() - 29);
  const first = cutoff.toISOString().slice(0, 10);
  const recent = rows('transactions').filter(
    (item) =>
      String(item.transactionDate || '') >= first &&
      String(item.transactionDate || '') <= today,
  );
  return {
    totalDebt: sum(rows('debts'), 'balance'),
    minimumPayments: sum(rows('debts'), 'minPayment'),
    openTasks: rows('tasks').filter((item) => !item.done).length,
    inboxItems: rows('inbox').length,
    expectedIncome: sum(
      rows('income').filter((item) => item.status !== 'Paid'),
      'expected',
    ),
    cashflowNet: rows('cashflow').reduce(
      (n, item) =>
        n + (item.flowType === 'expense' ? -1 : 1) * Number(item.amount || 0),
      0,
    ),
    unpaidInvoices: sum(
      rows('invoices').filter((item) => item.status !== 'Paid'),
      'amount',
    ),
    goalTarget: sum(rows('goals'), 'target'),
    totalSpending30: sum(recent, 'amount'),
    transactionCount: recent.length,
    subscriptionMonthly: monthlySubscription(rows('subscriptions')),
    budgetTotal: sum(rows('budgets'), 'target'),
  };
}

export function nextOccurrence(
  original: string,
  index: number,
  cadence: string,
) {
  const date = new Date(original + 'T12:00:00Z');
  if (!validDate(original)) return '';
  if (cadence === 'weekly' || cadence === 'biweekly') {
    date.setUTCDate(
      date.getUTCDate() + index * (cadence === 'weekly' ? 7 : 14),
    );
  } else {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + index);
    const last = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(day, last));
  }
  return date.toISOString().slice(0, 10);
}

export function expandCashflow(
  items: RecordItem[],
  today = localDay(),
  days = 30,
) {
  const endDate = new Date(today + 'T12:00:00Z');
  endDate.setUTCDate(endDate.getUTCDate() + days - 1);
  const end = endDate.toISOString().slice(0, 10);
  const result: RecordItem[] = [];
  for (const item of items) {
    if (!validDate(item.date)) continue;
    if (!item.recurring) {
      if (item.date >= today && item.date <= end) result.push(item);
      continue;
    }
    const startDate = new Date(item.date + 'T12:00:00Z');
    const elapsedDays = Math.floor(
      (new Date(today + 'T12:00:00Z').getTime() - startDate.getTime()) /
        86400000,
    );
    const cadence = String(item.cadence || 'monthly');
    const approximate =
      cadence === 'weekly'
        ? Math.floor(elapsedDays / 7)
        : cadence === 'biweekly'
          ? Math.floor(elapsedDays / 14)
          : (Number(today.slice(0, 4)) - startDate.getUTCFullYear()) * 12 +
            Number(today.slice(5, 7)) -
            1 -
            startDate.getUTCMonth();
    for (
      let index = Math.max(0, approximate - 2);
      index < Math.max(0, approximate - 2) + 80;
      index++
    ) {
      const date = nextOccurrence(item.date, index, cadence);
      if (date > end) break;
      if (date >= today)
        result.push({ ...item, id: item.id + '-' + date, date });
    }
  }
  return result.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function simulateDebt(
  items: RecordItem[],
  extra: number,
  strategy: string,
) {
  const debts = items.map((item) => ({
    balance: Math.max(0, Number(item.balance || 0)),
    apr: Math.max(0, Number(item.apr || 0)),
    min: Math.max(0, Number(item.minPayment || 0)),
  }));
  const monthlyBudget =
    debts.reduce((sum, item) => sum + item.min, 0) + Math.max(0, extra);
  let months = 0;
  let interest = 0;
  while (debts.some((item) => item.balance > 0.005) && months < 600) {
    months++;
    let budget = monthlyBudget;
    for (const item of debts) {
      if (item.balance <= 0.005) continue;
      const charge = Math.round(((item.balance * item.apr) / 1200) * 100) / 100;
      interest += charge;
      item.balance += charge;
      const payment = Math.min(item.balance, item.min, budget);
      item.balance -= payment;
      budget -= payment;
    }
    const ordered = debts
      .filter((item) => item.balance > 0.005)
      .sort((a, b) =>
        strategy === 'avalanche' ? b.apr - a.apr : a.balance - b.balance,
      );
    for (const item of ordered) {
      const payment = Math.min(item.balance, budget);
      item.balance -= payment;
      budget -= payment;
    }
  }
  return {
    months,
    interest,
    paidOff: debts.every((item) => item.balance <= 0.005),
    remaining: debts.reduce((sum, item) => sum + item.balance, 0),
  };
}

export function spendingGradient(rows: { amount: number }[], colors: string[]) {
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.amount), 0);
  if (!total) return 'conic-gradient(#263b59 0 100%)';
  let position = 0;
  return (
    'conic-gradient(' +
    rows
      .map((row, index) => {
        const start = position;
        position += (Math.max(0, row.amount) / total) * 100;
        return `${colors[index % colors.length]} ${start}% ${position}%`;
      })
      .join(',') +
    ')'
  );
}

const textFields = [
  'title',
  'creditor',
  'source',
  'summary',
  'priority',
  'note',
  'status',
  'client',
  'email',
  'merchant',
  'category',
  'transactionCategory',
  'eventType',
  'flowType',
  'cadence',
  'goalType',
];
const numberFields = [
  'balance',
  'minPayment',
  'apr',
  'expected',
  'amount',
  'target',
  'current',
  'duration',
];
export function validateItem(kind: Kind, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('A record is required.');
  const raw = input as RecordItem;
  const record: RecordItem = {};
  for (const key of textFields) {
    if (raw[key] === undefined) continue;
    if (
      typeof raw[key] !== 'string' ||
      String(raw[key]).length >
        (key === 'note' || key === 'summary' ? 8000 : 200)
    )
      throw new Error('Invalid ' + key + '.');
    record[key] = String(raw[key]).trim();
  }
  for (const key of numberFields) {
    if (raw[key] === undefined) continue;
    if (
      typeof raw[key] !== 'number' ||
      !Number.isFinite(raw[key]) ||
      Number(raw[key]) < 0 ||
      Number(raw[key]) > 1e10
    )
      throw new Error('Invalid ' + key + '.');
    record[key] = raw[key];
  }
  for (const key of ['date', 'endDate', 'dueDate', 'transactionDate']) {
    if (raw[key] === undefined || raw[key] === '') continue;
    if (!validDate(raw[key])) throw new Error('Invalid ' + key + '.');
    record[key] = raw[key];
  }
  for (const key of ['eventTime', 'time', 'startTime']) {
    if (raw[key] === undefined || raw[key] === '') continue;
    if (minutes(raw[key]) === null) throw new Error('Invalid event time.');
    record.eventTime = raw[key];
  }
  if (raw.endTime !== undefined && raw.endTime !== '') {
    if (minutes(raw.endTime) === null) throw new Error('Invalid end time.');
    record.endTime = raw.endTime;
  }
  for (const key of ['done', 'recurring', 'allDay', 'busy', 'externalActive']) {
    if (raw[key] === undefined) continue;
    if (typeof raw[key] !== 'boolean') throw new Error('Invalid ' + key + '.');
    record[key] = raw[key];
  }
  if (
    record.endDate &&
    record.date &&
    String(record.endDate) < String(record.date)
  )
    throw new Error('Invalid event end date.');
  const required =
    kind === 'clients' || kind === 'invoices'
      ? 'client'
      : kind === 'budgets'
        ? 'category'
        : kind === 'debts'
          ? 'creditor'
          : kind === 'inbox'
            ? 'summary'
            : kind === 'social'
              ? 'note'
              : kind === 'transactions' || kind === 'receipts'
                ? 'merchant'
                : 'title';
  // Legacy clients use title as their display name.
  if (!record[required]) throw new Error('Enter a ' + required + '.');
  if (kind === 'events' && !record.date)
    throw new Error('Choose an event date.');
  if (kind === 'transactions' && !record.transactionDate)
    throw new Error('Choose a transaction date.');
  if (
    record.flowType &&
    !['income', 'expense'].includes(String(record.flowType))
  )
    throw new Error('Invalid cash flow type.');
  if (
    record.cadence &&
    !['weekly', 'biweekly', 'monthly', 'yearly'].includes(
      String(record.cadence),
    )
  )
    throw new Error('Invalid recurrence.');
  if (
    record.duration &&
    (Number(record.duration) < 5 || Number(record.duration) > 1440)
  )
    throw new Error('Duration must be 5–1440 minutes.');
  if (
    kind === 'events' &&
    record.eventTime &&
    (!record.endDate || record.endDate === record.date) &&
    eventMinutes(record)! + Number(record.duration || 60) > 1440
  )
    throw new Error('Event must end before midnight.');
  return record;
}
