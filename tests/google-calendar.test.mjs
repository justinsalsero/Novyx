import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { router } from './support/sdk.mjs';
import {
  eventInterval,
  upcomingEvent,
  validateItem,
} from '../shared/domain.ts';

await mkdir('.local', { recursive: true });
await build({
  entryPoints: ['backend/google-calendar.ts'],
  outfile: '.local/google-test.mjs',
  bundle: true,
  format: 'esm',
  platform: 'node',
  alias: { '@appdeploy/sdk': resolve('tests/support/sdk.mjs') },
});
const {
  googleCalendarRoutes,
  mapGoogleEvent,
  sealGoogleValue,
  openGoogleValue,
  CALENDAR_SCOPE,
  GOOGLE_REDIRECT_URI,
} = await import(pathToFileURL(resolve('.local/google-test.mjs')).href);
const handler = router(googleCalendarRoutes);
const userA = { userId: 'calendar-user-a' };
const userB = { userId: 'calendar-user-b' };
const call = (method, path, body, user = userA) =>
  handler({ method, path: '/api/google-calendar/' + path, body, user });
const fixtures = {
  clientId: 'fixture.apps.googleusercontent.com',
  secret: 'TEST_ONLY_FAKE_CLIENT_SECRET_32_CHARS',
  access: 'TEST_ONLY_ACCESS',
  refresh: 'TEST_ONLY_REFRESH',
};
const actualFetch = globalThis.fetch;
let googleCalls = [];
let pageResponse = { items: [] };
let tokenError = null;
const tables = () => [...globalThis.__novyxTestStore.entries()];
const connection = () =>
  tables()
    .find(([name]) => name.endsWith('_google_connection'))?.[1]
    .get('google_calendar');
const eventTable = () =>
  tables().find(([name]) => name.endsWith('_events'))?.[1];
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

async function connect() {
  const started = await call('POST', 'begin');
  assert.equal(started.statusCode, 200);
  const url = new URL(started.data.authorizationUrl);
  const result = await call('POST', 'complete', {
    state: url.searchParams.get('state'),
    code: 'TEST_ONLY_ONE_TIME_CODE',
  });
  assert.equal(result.statusCode, 200);
  return { started, result, state: url.searchParams.get('state') };
}
async function drain(runId) {
  for (let i = 0; i < 20; i++) {
    const result = await call('POST', 'sync/page', { runId });
    assert.equal(result.statusCode, 200);
    if (result.data.done) return;
  }
  assert.fail('Sync did not finish');
}
const event = (
  id,
  start = '2030-01-15T09:00:00-08:00',
  end = '2030-01-15T10:00:00-08:00',
) => ({
  id,
  summary: 'Lesson ' + id,
  start: { dateTime: start },
  end: { dateTime: end },
});

test.beforeEach(() => {
  globalThis.__novyxTestStore = new Map();
  globalThis.__novyxTestSecrets = {
    GOOGLE_CLIENT_ID: fixtures.clientId,
    GOOGLE_CLIENT_SECRET: fixtures.secret,
  };
  googleCalls = [];
  pageResponse = { items: [] };
  tokenError = null;
  globalThis.fetch = async (url, options = {}) => {
    googleCalls.push({
      url: String(url),
      body: options.body?.toString(),
      authorization: options.headers?.Authorization,
    });
    if (String(url).endsWith('/token'))
      return tokenError
        ? response(tokenError, 400)
        : response({
            access_token: fixtures.access,
            refresh_token: fixtures.refresh,
            expires_in: 3600,
            scope: 'openid email ' + CALENDAR_SCOPE,
          });
    if (String(url).endsWith('/userinfo'))
      return response({
        sub: 'google-account-1',
        email: 'fixture@example.test',
        email_verified: true,
      });
    if (String(url).includes('/calendars/primary/events'))
      return response(
        typeof pageResponse === 'function'
          ? pageResponse(new URL(url))
          : pageResponse,
      );
    if (String(url).endsWith('/revoke')) return response({});
    throw new Error('Unexpected Google endpoint');
  };
});
test.afterEach(() => {
  globalThis.fetch = actualFetch;
  delete globalThis.__novyxTestSecrets;
});

test('missing credentials and anonymous access fail without a fabricated connection', async () => {
  delete globalThis.__novyxTestSecrets;
  const status = await call('GET', 'status');
  assert.equal(status.data.configured, false);
  assert.equal(status.data.connected, false);
  assert.equal((await call('POST', 'begin')).statusCode, 503);
  assert.equal((await call('GET', 'status', undefined, null)).statusCode, 401);
  assert.equal(googleCalls.length, 0);
});

test('OAuth pins redirect URI, uses PKCE and encrypts tokens without returning them', async () => {
  const { started, result } = await connect();
  const url = new URL(started.data.authorizationUrl);
  assert.equal(url.searchParams.get('redirect_uri'), GOOGLE_REDIRECT_URI);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.ok(url.searchParams.get('scope').includes(CALENDAR_SCOPE));
  const status = await call('GET', 'status');
  assert.equal(status.data.connected, true);
  const outward = JSON.stringify([started.data, result.data, status.data]);
  for (const token of [fixtures.secret, fixtures.access, fixtures.refresh])
    assert.equal(outward.includes(token), false);
  const persisted = JSON.stringify(
    [...globalThis.__novyxTestStore].map(([name, table]) => [name, [...table]]),
  );
  assert.equal(persisted.includes(fixtures.refresh), false);
  assert.equal(persisted.includes(fixtures.access), false);
  const stored = connection();
  const tokens = openGoogleValue(
    stored.encryptedTokens,
    userA.userId,
    'tokens',
    fixtures.secret,
  );
  assert.equal(tokens.refreshToken, fixtures.refresh);
});

test('state cannot cross accounts, replay, or survive its expiry', async () => {
  const start = await call('POST', 'begin');
  const state = new URL(start.data.authorizationUrl).searchParams.get('state');
  assert.equal(
    (await call('POST', 'complete', { code: 'test-code', state }, userB))
      .statusCode,
    409,
  );
  assert.equal(googleCalls.length, 0);
  assert.equal(
    (await call('POST', 'complete', { code: 'test-code', state })).statusCode,
    200,
  );
  const calls = googleCalls.length;
  assert.equal(
    (await call('POST', 'complete', { code: 'test-code', state })).statusCode,
    409,
  );
  assert.equal(googleCalls.length, calls);
  globalThis.__novyxTestStore = new Map();
  const fresh = await call('POST', 'begin');
  const expired = tables()
    .find(([name]) => name.endsWith('_google_oauth'))[1]
    .get('pending');
  expired.expiresAt = Date.now() - 1;
  assert.equal(
    (
      await call('POST', 'complete', {
        code: 'test-code',
        state: new URL(fresh.data.authorizationUrl).searchParams.get('state'),
      })
    ).statusCode,
    409,
  );
});

test('encrypted values reject cross-account access and tampering', () => {
  const sealed = sealGoogleValue(
    { accessToken: fixtures.access },
    userA.userId,
    'tokens',
    fixtures.secret,
  );
  assert.throws(() =>
    openGoogleValue(sealed, userB.userId, 'tokens', fixtures.secret),
  );
  assert.throws(() =>
    openGoogleValue(
      sealed.slice(0, -4) + 'AAAA',
      userA.userId,
      'tokens',
      fixtures.secret,
    ),
  );
});

test('Google must actually grant Calendar scope before a connection is stored', async () => {
  globalThis.fetch = async () =>
    response({
      access_token: fixtures.access,
      refresh_token: fixtures.refresh,
      scope: 'openid email',
    });
  const start = await call('POST', 'begin');
  const result = await call('POST', 'complete', {
    code: 'test-code',
    state: new URL(start.data.authorizationUrl).searchParams.get('state'),
  });
  assert.equal(result.statusCode, 403);
  assert.equal((await call('GET', 'status')).data.connected, false);
});

test('sync follows pages, deduplicates IDs and retires events missing from the next sync', async () => {
  await connect();
  pageResponse = (url) =>
    url.searchParams.get('pageToken')
      ? { items: [event('second')] }
      : { items: [event('first')], nextPageToken: 'second-page' };
  const started = await call('POST', 'sync/start');
  await drain(started.data.runId);
  assert.equal(eventTable().size, 2);
  assert.ok((await call('GET', 'status')).data.lastSyncedAt);
  const calls = googleCalls.filter((call) =>
    call.url.includes('/calendars/primary/events'),
  );
  assert.equal(calls.length, 2);
  assert.equal(
    new URL(calls[1].url).searchParams.get('pageToken'),
    'second-page',
  );
  pageResponse = { items: [event('second')] };
  await drain((await call('POST', 'sync/start')).data.runId);
  assert.equal(eventTable().size, 2);
  assert.equal(
    [...eventTable().values()].filter((item) => item.externalActive).length,
    1,
  );
});

test('cancelled, free, overnight and all-day events have correct planning intervals', () => {
  const overnight = mapGoogleEvent(
    event('night', '2025-01-15T23:00:00-08:00', '2025-01-16T01:00:00-08:00'),
    'account',
    'run',
  );
  assert.deepEqual(eventInterval(overnight, '2025-01-15'), {
    start: 1380,
    end: 1440,
    untimed: false,
  });
  assert.deepEqual(eventInterval(overnight, '2025-01-16'), {
    start: 0,
    end: 60,
    untimed: false,
  });
  assert.doesNotThrow(() => validateItem('events', overnight));
  const allDay = mapGoogleEvent(
    { id: 'day', start: { date: '2030-01-15' }, end: { date: '2030-01-17' } },
    'account',
    'run',
  );
  assert.deepEqual(eventInterval(allDay, '2030-01-16'), {
    start: 0,
    end: 1440,
    untimed: false,
  });
  assert.equal(eventInterval(allDay, '2030-01-17'), null);
  assert.equal(upcomingEvent(allDay, '2030-01-17'), false);
  const free = mapGoogleEvent(
    { ...event('free'), transparency: 'transparent' },
    'account',
    'run',
  );
  assert.equal(eventInterval(free, '2030-01-15'), null);
  const declined = mapGoogleEvent(
    {
      ...event('declined'),
      attendees: [{ self: true, responseStatus: 'declined' }],
    },
    'account',
    'run',
  );
  assert.equal(eventInterval(declined, '2030-01-15'), null);
  const cancelled = mapGoogleEvent(
    { id: 'cancelled', status: 'cancelled' },
    'account',
    'run',
  );
  assert.equal(eventInterval(cancelled, '2030-01-15'), null);
});

test('expired tokens refresh server-side and revoked refresh tokens require reconnection', async () => {
  await connect();
  let row = connection();
  const expired = {
    accessToken: fixtures.access,
    refreshToken: fixtures.refresh,
    scope: CALENDAR_SCOPE,
    expiresAt: Date.now() - 1000,
  };
  row.encryptedTokens = sealGoogleValue(
    expired,
    userA.userId,
    'tokens',
    fixtures.secret,
  );
  await drain((await call('POST', 'sync/start')).data.runId);
  assert.ok(
    googleCalls.some((item) => item.body?.includes('grant_type=refresh_token')),
  );
  row = connection();
  row.encryptedTokens = sealGoogleValue(
    expired,
    userA.userId,
    'tokens',
    fixtures.secret,
  );
  tokenError = { error: 'invalid_grant' };
  const run = await call('POST', 'sync/start');
  assert.equal(
    (await call('POST', 'sync/page', { runId: run.data.runId })).statusCode,
    401,
  );
  assert.equal((await call('GET', 'status')).data.reconnectRequired, true);
});

test('disconnect stops a running sync, deletes local tokens and archives only imported copies', async () => {
  await connect();
  pageResponse = { items: [event('imported')] };
  await drain((await call('POST', 'sync/start')).data.runId);
  eventTable().set('manual-event', {
    id: 'manual-event',
    title: 'Manual',
    date: '2030-01-15',
    eventTime: '08:00',
  });
  const run = await call('POST', 'sync/start');
  assert.equal((await call('POST', 'disconnect')).statusCode, 200);
  assert.equal(connection().encryptedTokens, undefined);
  assert.equal(
    (await call('POST', 'sync/page', { runId: run.data.runId })).statusCode,
    409,
  );
  while (!(await call('POST', 'disconnect/page')).data.done) {}
  assert.equal((await call('GET', 'status')).data.connected, false);
  assert.equal(eventTable().get('manual-event').title, 'Manual');
  assert.equal(
    [...eventTable().values()].find((row) => row.provider === 'google-calendar')
      .externalActive,
    false,
  );
  assert.ok(googleCalls.some((item) => item.url.endsWith('/revoke')));
});

test('disconnect while a provider page is in flight prevents that page from committing', async () => {
  await connect();
  const started = await call('POST', 'sync/start');
  const before = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('/calendars/primary/events')) {
      const row = connection();
      row.connected = false;
      row.generation = 'disconnected-during-fetch';
      return response({ items: [event('must-not-save')] });
    }
    return before(url, options);
  };
  assert.equal(
    (await call('POST', 'sync/page', { runId: started.data.runId })).statusCode,
    503,
  );
  assert.equal(eventTable()?.size || 0, 0);
});

test('failed provider revocation remains visible after local disconnect completes', async () => {
  await connect();
  const before = globalThis.fetch;
  globalThis.fetch = async (url, options) =>
    String(url).endsWith('/revoke')
      ? response({ error: 'unavailable' }, 500)
      : before(url, options);
  assert.equal((await call('POST', 'disconnect')).data.revocationFailed, true);
  while (!(await call('POST', 'disconnect/page')).data.done) {}
  const status = await call('GET', 'status');
  assert.equal(status.data.connected, false);
  assert.equal(status.data.revocationFailed, true);
  assert.equal(connection().encryptedTokens, undefined);
});
