import test from 'node:test';
import assert from 'node:assert/strict';
import {
  eventMinutes,
  expandCashflow,
  localDay,
  monthlySubscription,
  nextOccurrence,
  simulateDebt,
  spendingGradient,
  summarize,
  validateItem,
  validDate,
} from '../shared/domain.ts';

test('spending chart follows actual category proportions', () => {
  assert.equal(
    spendingGradient([{ amount: 900 }, { amount: 100 }], ['red', 'blue']),
    'conic-gradient(red 0% 90%,blue 90% 100%)',
  );
  assert.match(spendingGradient([], ['red']), /#263b59/);
});
test('cancelled subscriptions are excluded and supported cadences normalize', () => {
  assert.equal(
    monthlySubscription([
      { amount: 100, status: 'Cancelled' },
      { amount: 120, cadence: 'yearly' },
      { amount: 12, cadence: 'monthly' },
    ]),
    22,
  );
  assert.equal(monthlySubscription([{ amount: 12, cadence: 'weekly' }]), 52);
});
test('calendar fields from every existing version are recognized', () => {
  assert.equal(eventMinutes({ eventTime: '09:15' }), 555);
  assert.equal(eventMinutes({ startTime: '10:00' }), 600);
  assert.equal(eventMinutes({ time: '11:00' }), 660);
  assert.equal(eventMinutes({}), null);
  assert.equal(eventMinutes({ eventTime: '25:00' }), null);
});
test('monthly recurrence keeps its original anchor through short months', () => {
  assert.equal(nextOccurrence('2028-01-31', 1, 'monthly'), '2028-02-29');
  assert.equal(nextOccurrence('2028-01-31', 2, 'monthly'), '2028-03-31');
  assert.deepEqual(
    expandCashflow(
      [{ id: 'rent', date: '2026-01-31', recurring: true, cadence: 'monthly' }],
      '2026-02-01',
    ).map((row) => row.date),
    ['2026-02-28'],
  );
  assert.equal(
    expandCashflow(
      [{ date: '2000-01-31', recurring: true, cadence: 'monthly' }],
      '2026-10-02',
    )[0].date,
    '2026-10-31',
  );
});
test('debt estimates distinguish failure to repay and roll freed payments forward', () => {
  const impossible = simulateDebt(
    [{ balance: 10000, apr: 30, minPayment: 0 }],
    0,
    'avalanche',
  );
  assert.equal(impossible.paidOff, false);
  assert.equal(impossible.months, 600);
  const repaid = simulateDebt(
    [
      { balance: 100, apr: 0, minPayment: 50 },
      { balance: 900, apr: 0, minPayment: 50 },
    ],
    0,
    'snowball',
  );
  assert.equal(repaid.paidOff, true);
  assert.equal(repaid.months, 10);
});
test('date ranges use Vancouver days and exclude future transactions', () => {
  assert.equal(localDay(new Date('2026-10-24T02:00:00Z')), '2026-10-23');
  const result = summarize(
    {
      transactions: [
        { amount: 10, transactionDate: '2026-10-23' },
        { amount: 20, transactionDate: '2026-10-24' },
        { amount: 50, transactionDate: '2026-09-23' },
      ],
    },
    new Date('2026-10-24T02:00:00Z'),
  );
  assert.equal(result.totalSpending30, 10);
});
test('validation rejects invalid dates, negative amounts and arbitrary metadata', () => {
  assert.equal(validDate('2026-02-30'), false);
  assert.throws(() =>
    validateItem('transactions', {
      merchant: 'Shop',
      amount: -5,
      transactionDate: '2026-10-23',
    }),
  );
  assert.throws(() => validateItem('tasks', { title: '   ' }));
  assert.throws(() =>
    validateItem('events', {
      title: 'Late',
      date: '2026-10-23',
      eventTime: '23:30',
      duration: 90,
    }),
  );
  assert.deepEqual(
    validateItem('tasks', {
      title: ' Call client ',
      userId: 'someone-else',
      id: 'injected',
    }),
    { title: 'Call client' },
  );
  assert.deepEqual(
    validateItem('budgets', { category: 'Groceries', target: 400 }),
    { category: 'Groceries', target: 400 },
  );
  assert.deepEqual(validateItem('clients', { client: 'Studio' }), {
    client: 'Studio',
  });
});
