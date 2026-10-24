import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';

await mkdir('.local', { recursive: true });
await build({
  entryPoints: ['backend/index.ts'],
  outfile: '.local/backend-test.mjs',
  bundle: true,
  format: 'esm',
  platform: 'node',
  alias: { '@appdeploy/sdk': resolve('tests/support/sdk.mjs') },
});
const { handler } = await import(pathToFileURL(resolve('.local/backend-test.mjs')).href);
const userA = { userId: 'test-user-a' };
const userB = { userId: 'test-user-b' };
const call = (method, path, body, user = userA, query) =>
  handler({ method, path, body, user, query });
const addTask = (title) =>
  call('POST', '/api/items', {
    kind: 'tasks',
    requestId: 'test-request-' + title,
    data: { title },
  });

test.beforeEach(() => {
  globalThis.__novyxTestStore = new Map();
  delete globalThis.__novyxTestAI;
});

test('anonymous callers are denied and records cannot cross account boundaries', async () => {
  assert.equal(
    (await call('GET', '/api/dashboard', undefined, null)).statusCode,
    401,
  );
  const added = await addTask('Private');
  assert.equal(added.statusCode, 201);
  assert.equal((await call('GET', '/api/dashboard')).data.tasks.length, 1);
  assert.equal(
    (await call('GET', '/api/dashboard', undefined, userB)).data.tasks.length,
    0,
  );
  assert.equal(
    (
      await call(
        'PUT',
        '/api/items/tasks/' + added.data.id,
        { title: 'Stolen' },
        userB,
      )
    ).statusCode,
    404,
  );
});

test('same save request is idempotent and cannot be reused for a different payload', async () => {
  const one = await addTask('Repeat');
  const two = await addTask('Repeat');
  assert.equal(one.data.id, two.data.id);
  assert.equal((await call('GET', '/api/dashboard')).data.tasks.length, 1);
  assert.equal(
    (
      await call('POST', '/api/items', {
        kind: 'tasks',
        requestId: 'test-request-Repeat',
        data: { title: 'Different' },
      })
    ).statusCode,
    400,
  );
});

test('pagination exposes every record and preserves legacy data', async () => {
  const legacy = new Map(
    Array.from({ length: 120 }, (_, index) => [
      'old-' + index,
      { title: 'Old ' + index },
    ]),
  );
  globalThis.__novyxTestStore.set('personal:test-user-a:tasks', legacy);
  await addTask('Modern');
  const dashboard = await call('GET', '/api/dashboard');
  assert.equal(dashboard.data.partial, true);
  const records = [...dashboard.data.tasks];
  let cursor = dashboard.data.cursors.tasks;
  while (cursor) {
    const page = await call('GET', '/api/records/tasks', undefined, userA, {
      cursor,
    });
    records.push(...page.data.items);
    cursor = page.data.nextToken;
  }
  assert.equal(records.length, 121);
  assert.equal(new Set(records.map((item) => item.id)).size, 121);
  assert.equal(
    (await call('PUT', '/api/items/tasks/old-1', { done: true })).statusCode,
    200,
  );
});

test('AI suggestions never execute before approval and approval replays cannot duplicate', async () => {
  const response = await call('POST', '/api/assistant', {
    message: 'Create a task to call the studio.',
  });
  assert.equal(response.statusCode, 200);
  assert.equal((await call('GET', '/api/dashboard')).data.tasks.length, 0);
  const action = response.data.actions[0];
  assert.equal(
    (
      await call(
        'POST',
        '/api/assistant/actions/' + action.id + '/approve',
        {},
        userB,
      )
    ).statusCode,
    404,
  );
  assert.equal(
    (await call('POST', '/api/assistant/actions/' + action.id + '/approve'))
      .statusCode,
    200,
  );
  assert.equal(
    (await call('POST', '/api/assistant/actions/' + action.id + '/approve'))
      .statusCode,
    200,
  );
  assert.equal((await call('GET', '/api/dashboard')).data.tasks.length, 1);
});

test('event approvals reject conflicts with existing canonical calendar times', async () => {
  await call('POST', '/api/items', {
    kind: 'events',
    data: {
      title: 'Appointment',
      date: '2026-10-24',
      eventTime: '09:00',
      duration: 60,
    },
  });
  globalThis.__novyxTestAI = {
    reply: 'Draft only.',
    actions: [
      {
        kind: 'events',
        title: 'Focus',
        date: '2026-10-24',
        eventTime: '09:30',
        duration: 45,
      },
    ],
  };
  const response = await call('POST', '/api/assistant', {
    message: 'Plan a focus session.',
  });
  assert.equal(
    (
      await call(
        'POST',
        '/api/assistant/actions/' + response.data.actions[0].id + '/approve',
      )
    ).statusCode,
    409,
  );
  assert.equal((await call('GET', '/api/dashboard')).data.events.length, 1);
});

test('backup pages are repeatable, reject invalid records before writing, and include memories', async () => {
  const body = {
    kind: 'tasks',
    records: [{ id: 'backup-task', title: 'Recovered' }],
  };
  assert.equal(
    (await call('POST', '/api/backup/import', body)).data.imported,
    1,
  );
  assert.equal(
    (await call('POST', '/api/backup/import', body)).data.skipped,
    1,
  );
  const invalid = await call('POST', '/api/backup/import', {
    kind: 'tasks',
    records: [{ title: 'Valid' }, { title: '' }],
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal((await call('GET', '/api/dashboard')).data.tasks.length, 1);
  await call('POST', '/api/backup/import', {
    kind: 'nyx_memory',
    records: [{ id: 'memory-1', text: 'Prefer mornings' }],
  });
  assert.equal(
    (await call('GET', '/api/records/nyx_memory')).data.items.length,
    1,
  );
});

test('receipt save atomically creates a receipt and transaction exactly once', async () => {
  const body = {
    requestId: 'receipt-request-1',
    data: { merchant: 'Shop', amount: 15, transactionDate: '2026-10-23' },
  };
  assert.equal(
    (await call('POST', '/api/receipts/save', body)).statusCode,
    201,
  );
  assert.equal(
    (await call('POST', '/api/receipts/save', body)).statusCode,
    200,
  );
  const data = (await call('GET', '/api/dashboard')).data;
  assert.equal(data.receipts.length, 1);
  assert.equal(data.transactions.length, 1);
});
