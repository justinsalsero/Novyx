import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import {
  db,
  error,
  isAppDatabaseError,
  json,
  requireAuth,
  secrets,
  type RouterRoutes,
} from '@appdeploy/sdk';
import { localDay, validDate, type RecordItem } from '../shared/domain';
import { hash, modernTable } from './records';

export const CALENDAR_SCOPE =
  'https://www.googleapis.com/auth/calendar.events.readonly';
export const GOOGLE_REDIRECT_URI =
  'https://novyx-3-0-9o43mh.v2.appdeploy.ai/?nyx_google=1';
const CONTROL_ID = 'google_calendar';
const STATE_ID = 'pending';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const EVENTS_URL =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const connectionTable = (user: string) =>
  modernTable(user, 'google_connection');
const stateTable = (user: string) => modernTable(user, 'google_oauth');

type Config = { clientId: string; clientSecret: string };
type Tokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
};
type Connection = RecordItem & {
  id: string;
  connected?: boolean;
  generation: string;
  authEpoch: string;
  version: string;
  encryptedTokens?: string;
  accountSub?: string;
  email?: string;
  runId?: string;
  phase?: 'fetch' | 'cleanup' | 'disconnect';
  cursor?: string;
  timeMin?: string;
  timeMax?: string;
  lastSyncedAt?: string;
  reconnectRequired?: boolean;
};

export class CalendarError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

async function config(): Promise<Config> {
  const names = await secrets.listSecretNames();
  if (
    !names.includes('GOOGLE_CLIENT_ID') ||
    !names.includes('GOOGLE_CLIENT_SECRET')
  )
    throw new CalendarError(
      'Google Calendar needs the app owner’s Google OAuth setup before accounts can connect.',
      503,
    );
  const [clientId, clientSecret] = await Promise.all([
    secrets.readSecret('GOOGLE_CLIENT_ID'),
    secrets.readSecret('GOOGLE_CLIENT_SECRET'),
  ]);
  if (
    !clientId.endsWith('.apps.googleusercontent.com') ||
    clientSecret.length < 16
  )
    throw new CalendarError(
      'Google OAuth configuration is invalid. Ask the app owner to check the credentials.',
      503,
    );
  return { clientId, clientSecret };
}

function encryptionKey(secret: string) {
  return Buffer.from(
    hkdfSync(
      'sha256',
      secret,
      'novyx-3-0-9o43mh',
      'novyx-google-calendar-v1',
      32,
    ),
  );
}
export function sealGoogleValue(
  value: unknown,
  user: string,
  purpose: string,
  secret: string,
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  cipher.setAAD(Buffer.from(user + ':' + purpose));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString('base64url'))
    .join('.');
}
export function openGoogleValue<T>(
  value: string,
  user: string,
  purpose: string,
  secret: string,
): T {
  try {
    const parts = value.split('.');
    if (parts.length !== 3) throw new Error('Invalid envelope');
    const [iv, tag, encrypted] = parts.map((part) =>
      Buffer.from(part, 'base64url'),
    );
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), iv);
    decipher.setAAD(Buffer.from(user + ':' + purpose));
    decipher.setAuthTag(tag);
    return JSON.parse(
      Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
        'utf8',
      ),
    ) as T;
  } catch {
    throw new CalendarError(
      'Saved Google authorization cannot be read. Disconnect and connect again.',
      409,
    );
  }
}

async function googleJson(url: string, options: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new CalendarError(
      'Google could not be reached. Your sync can be resumed.',
      502,
    );
  }
  const body = (await response.json().catch(() => ({}))) as RecordItem;
  if (!response.ok) {
    if (url === TOKEN_URL &&
        (body.error === 'invalid_client' || body.error === 'unauthorized_client' ||
         body.error === 'deleted_client' || response.status === 401))
      throw new CalendarError(
        'Google rejected Novyx app credentials. The app owner must check that GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET belong to the same enabled Web application client, then start a fresh connection.',
        503,
      );
    if (body.error === 'invalid_grant') {
      const isSignIn = options.body instanceof URLSearchParams &&
        options.body.get('grant_type') === 'authorization_code';
      throw new CalendarError(
        isSignIn
          ? 'Google rejected this one-time sign-in code. Close old Google sign-in tabs, return to Connections, and select Connect Google Calendar to start again. Complete the new link promptly without refreshing the callback page.'
          : 'Google authorization expired or was revoked. Disconnect and connect again.',
        401,
      );
    }
    if (response.status === 401)
      throw new CalendarError(
        'Google rejected the saved access token. Disconnect and connect Google Calendar again.',
        401,
      );
    if (response.status === 403)
      throw new CalendarError(
        'Google denied Calendar access. Check consent, test-user access and whether the Calendar API is enabled.',
        403,
      );
    if (response.status === 429 || response.status >= 500)
      throw new CalendarError(
        'Google is temporarily limiting requests. Pause and resume the sync later.',
        503,
      );
    throw new CalendarError(
      'Google could not complete authorization. Start a fresh connection and check the registered callback URL.',
      400,
    );
  }
  return body;
}

async function control(user: string) {
  const [row] = await db.get<Connection>(connectionTable(user), [CONTROL_ID], {
    consistent: true,
  });
  return row;
}
function versionCondition(row: Connection) {
  return { version: row.version };
}
async function patchControl(user: string, row: Connection, record: RecordItem) {
  const [ok] = await db.tx.update(
    connectionTable(user),
    [
      {
        id: CONTROL_ID,
        record: { ...record, version: randomUUID() },
        if: versionCondition(row),
      },
    ],
    { patch: true },
  );
  if (!ok)
    throw new CalendarError(
      'The connection changed in another session. Refresh and try again.',
      409,
    );
}

export async function calendarStatus(user: string) {
  const names = await secrets.listSecretNames();
  const configured =
    names.includes('GOOGLE_CLIENT_ID') &&
    names.includes('GOOGLE_CLIENT_SECRET');
  const row = await control(user);
  return {
    configured,
    connected: Boolean(row?.connected),
    email: row?.email || '',
    lastSyncedAt: row?.lastSyncedAt || '',
    syncing: Boolean(row?.runId),
    phase: row?.phase || null,
    reconnectRequired: Boolean(row?.reconnectRequired),
    revocationFailed: Boolean(row?.revocationFailed),
    redirectUri: GOOGLE_REDIRECT_URI,
    scope: 'Read-only access to events on your primary Google calendar',
    windowDays: 60,
  };
}

async function begin(user: string) {
  const settings = await config();
  let row = await control(user);
  if (!row) {
    await db.tx.add(connectionTable(user), [
      {
        id: CONTROL_ID,
        connected: false,
        generation: randomUUID(),
        authEpoch: randomUUID(),
        version: randomUUID(),
      },
    ]);
    row = await control(user);
  }
  if (!row)
    throw new CalendarError(
      'Could not prepare a connection. Please retry.',
      503,
    );
  if (row.connected || row.runId)
    throw new CalendarError(
      'Disconnect the current calendar and finish cleanup before connecting another account.',
      409,
    );
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const epoch = randomUUID();
  await db.transact([
    db.tx.update(
      connectionTable(user),
      [
        {
          id: CONTROL_ID,
          record: { authEpoch: epoch, version: randomUUID() },
          if: versionCondition(row),
        },
      ],
      { patch: true },
    ),
    db.tx.update(stateTable(user), [
      {
        id: STATE_ID,
        record: {
          stateHash: hash(state),
          authEpoch: epoch,
          status: 'pending',
          expiresAt: Date.now() + 600000,
          verifier: sealGoogleValue(
            verifier,
            user,
            'pkce',
            settings.clientSecret,
          ),
        },
      },
    ]),
  ]);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: settings.clientId,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email ' + CALENDAR_SCOPE,
    access_type: 'offline',
    prompt: 'consent select_account',
    state,
    code_challenge: Buffer.from(hash(verifier), 'hex').toString('base64url'),
    code_challenge_method: 'S256',
  }).toString();
  return { authorizationUrl: url.href };
}

async function complete(user: string, input: unknown) {
  const body = (input || {}) as RecordItem;
  if (
    typeof body.code !== 'string' ||
    !body.code ||
    body.code.length > 4096 ||
    typeof body.state !== 'string' ||
    !/^[a-zA-Z0-9_-]{43}$/.test(body.state)
  )
    throw new CalendarError(
      'Invalid Google callback. Start a fresh connection.',
    );
  const settings = await config();
  const [state] = await db.get<RecordItem>(stateTable(user), [STATE_ID], {
    consistent: true,
  });
  const row = await control(user);
  if (
    !state ||
    !row ||
    state.stateHash !== hash(body.state) ||
    state.status !== 'pending' ||
    Number(state.expiresAt) < Date.now() ||
    row.authEpoch !== state.authEpoch ||
    row.connected
  )
    throw new CalendarError(
      'This Google authorization is expired, already used, or belongs to a different Novyx account. Start a fresh connection.',
      409,
    );
  const verifier = openGoogleValue<string>(
    String(state.verifier),
    user,
    'pkce',
    settings.clientSecret,
  );
  await db.transact([
    db.tx.update(
      stateTable(user),
      [
        {
          id: STATE_ID,
          record: { status: 'used', verifier: undefined },
          if: { status: 'pending', stateHash: state.stateHash },
        },
      ],
      { patch: true },
    ),
    db.tx.update(
      connectionTable(user),
      [
        {
          id: CONTROL_ID,
          record: { version: randomUUID() },
          if: { authEpoch: state.authEpoch, version: row.version },
        },
      ],
      { patch: true },
    ),
  ]);
  const token = await googleJson(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      code: body.code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: GOOGLE_REDIRECT_URI,
    }),
  });
  const scope = typeof token.scope === 'string' ? token.scope : '';
  if (
    typeof token.access_token !== 'string' ||
    typeof token.refresh_token !== 'string' ||
    !scope.split(' ').includes(CALENDAR_SCOPE)
  )
    throw new CalendarError(
      'Google did not grant offline Calendar access. Connect again and approve the requested Calendar permission.',
      403,
    );
  const identity = await googleJson(USERINFO_URL, {
    headers: { Authorization: 'Bearer ' + token.access_token },
  });
  if (
    typeof identity.sub !== 'string' ||
    typeof identity.email !== 'string' ||
    identity.email_verified !== true
  )
    throw new CalendarError(
      'Google account identity could not be confirmed.',
      403,
    );
  const latest = await control(user);
  if (!latest || latest.authEpoch !== state.authEpoch || latest.connected)
    throw new CalendarError(
      'Connection was cancelled or changed. Start a fresh connection.',
      409,
    );
  const tokens: Tokens = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    scope,
    expiresAt:
      Date.now() +
      Math.max(60, Math.min(86400, Number(token.expires_in) || 3600)) * 1000,
  };
  await patchControl(user, latest, {
    connected: true,
    generation: randomUUID(),
    email: identity.email.slice(0, 254),
    accountSub: identity.sub,
    encryptedTokens: sealGoogleValue(
      tokens,
      user,
      'tokens',
      settings.clientSecret,
    ),
    reconnectRequired: false,
    revocationFailed: false,
    lastSyncedAt: undefined,
    runId: undefined,
    phase: undefined,
    cursor: undefined,
  });
  return { connected: true, email: identity.email };
}

async function accessToken(user: string, row: Connection, settings: Config) {
  if (!row.connected || !row.encryptedTokens)
    throw new CalendarError('Connect a Google calendar first.', 409);
  const tokens = openGoogleValue<Tokens>(
    row.encryptedTokens,
    user,
    'tokens',
    settings.clientSecret,
  );
  if (tokens.expiresAt > Date.now() + 60000) return tokens.accessToken;
  let refreshed: RecordItem;
  try {
    refreshed = await googleJson(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: settings.clientId,
        client_secret: settings.clientSecret,
        refresh_token: tokens.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
  } catch (cause) {
    if (cause instanceof CalendarError && cause.status === 401) {
      await patchControl(user, row, { reconnectRequired: true });
    }
    throw cause;
  }
  if (typeof refreshed.access_token !== 'string')
    throw new CalendarError(
      'Google returned an incomplete token response. Connect again.',
      502,
    );
  const newTokens: Tokens = {
    ...tokens,
    accessToken: refreshed.access_token,
    refreshToken:
      typeof refreshed.refresh_token === 'string'
        ? refreshed.refresh_token
        : tokens.refreshToken,
    expiresAt:
      Date.now() +
      Math.max(60, Math.min(86400, Number(refreshed.expires_in) || 3600)) *
        1000,
  };
  const latest = await control(user);
  if (!latest?.connected || latest.generation !== row.generation)
    throw new CalendarError(
      'Calendar was disconnected while refreshing. No sync was saved.',
      409,
    );
  await patchControl(user, latest, {
    encryptedTokens: sealGoogleValue(
      newTokens,
      user,
      'tokens',
      settings.clientSecret,
    ),
    reconnectRequired: false,
  });
  return newTokens.accessToken;
}

function clock(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Vancouver',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}
export function mapGoogleEvent(
  event: RecordItem,
  account: string,
  runId: string,
): RecordItem | null {
  if (typeof event.id !== 'string' || !event.id || event.id.length > 2048)
    return null;
  const id = 'v4_google_' + hash(account + ':' + event.id);
  if (event.status === 'cancelled')
    return { id, status: 'Cancelled', externalActive: false, syncRun: runId };
  const start = event.start as { date?: string; dateTime?: string } | undefined;
  const end = event.end as { date?: string; dateTime?: string } | undefined;
  if (!start || !end) return null;
  const allDay = Boolean(start.date);
  if (allDay && (!validDate(start.date) || !validDate(end.date))) return null;
  const startDate = new Date(
    (start.dateTime || start.date + 'T12:00:00Z') as string,
  );
  const endDate = new Date((end.dateTime || end.date + 'T12:00:00Z') as string);
  if (
    !Number.isFinite(startDate.getTime()) ||
    !Number.isFinite(endDate.getTime()) ||
    endDate <= startDate
  )
    return null;
  return {
    id,
    title:
      typeof event.summary === 'string'
        ? event.summary.slice(0, 200) || 'Google Calendar event'
        : 'Google Calendar event',
    date: allDay ? start.date : localDay(startDate),
    endDate: allDay ? end.date : localDay(endDate),
    eventTime: allDay ? '' : clock(startDate),
    endTime: allDay ? '' : clock(endDate),
    duration: Math.min(
      1440,
      Math.max(5, Math.ceil((endDate.getTime() - startDate.getTime()) / 60000)),
    ),
    allDay,
    busy:
      event.transparency !== 'transparent' &&
      !(
        Array.isArray(event.attendees) &&
        event.attendees.some(
          (attendee) =>
            attendee &&
            attendee.self === true &&
            attendee.responseStatus === 'declined',
        )
      ),
    status: 'Scheduled',
    source: 'Google Calendar',
    provider: 'google-calendar',
    externalActive: true,
    syncRun: runId,
    externalUpdatedAt: String(event.updated || ''),
  };
}

async function startSync(user: string) {
  await config();
  const row = await control(user);
  if (!row?.connected)
    throw new CalendarError('Connect a Google calendar first.', 409);
  if (row.reconnectRequired)
    throw new CalendarError('Reconnect Google Calendar before syncing.', 409);
  if (row.runId) return { runId: row.runId, phase: row.phase };
  const runId = randomUUID();
  const min = new Date();
  min.setUTCDate(min.getUTCDate() - 7);
  const max = new Date();
  max.setUTCDate(max.getUTCDate() + 60);
  await patchControl(user, row, {
    runId,
    phase: 'fetch',
    cursor: undefined,
    timeMin: min.toISOString(),
    timeMax: max.toISOString(),
  });
  return { runId, phase: 'fetch' };
}

async function syncPage(user: string, input: unknown) {
  const body = (input || {}) as RecordItem;
  const row = await control(user);
  if (
    !row?.connected ||
    !row.runId ||
    body.runId !== row.runId ||
    row.phase === 'disconnect'
  )
    throw new CalendarError(
      'This sync is no longer active. Refresh the connection.',
      409,
    );
  if (row.phase === 'cleanup') return cleanupPage(user, row, false);
  const settings = await config();
  const token = await accessToken(user, row, settings);
  const fresh = await control(user);
  if (
    !fresh?.connected ||
    fresh.generation !== row.generation ||
    fresh.runId !== row.runId ||
    fresh.cursor !== row.cursor ||
    fresh.phase !== 'fetch'
  )
    throw new CalendarError(
      'Sync changed in another session. Resume from the current page.',
      409,
    );
  const url = new URL(EVENTS_URL);
  url.search = new URLSearchParams({
    singleEvents: 'true',
    showDeleted: 'true',
    maxResults: '25',
    timeMin: String(fresh.timeMin),
    timeMax: String(fresh.timeMax),
    timeZone: 'America/Vancouver',
    maxAttendees: '1',
    fields:
      'nextPageToken,items(id,summary,status,start,end,transparency,updated,attendees(self,responseStatus))',
    ...(fresh.cursor ? { pageToken: fresh.cursor } : {}),
  }).toString();
  const response = await googleJson(url.href, {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!Array.isArray(response.items) || response.items.length > 25)
    throw new CalendarError(
      'Google returned an invalid event page. No page was saved.',
      502,
    );
  const mapped = (response.items as RecordItem[])
    .map((event) =>
      mapGoogleEvent(event, String(fresh.accountSub), fresh.runId!),
    )
    .filter((item): item is RecordItem => !!item);
  const table = modernTable(user, 'events');
  const ids = mapped.map((item) => String(item.id));
  if (new Set(ids).size !== ids.length)
    throw new CalendarError(
      'Google returned duplicate event IDs. Retry this sync later.',
      502,
    );
  const existing = ids.length
    ? await db.get<RecordItem>(table, ids, { consistent: true })
    : [];
  const operations: import('@appdeploy/sdk').DbOperation<unknown>[] =
    mapped.flatMap<import('@appdeploy/sdk').DbOperation<unknown>>(
      (item, index) => {
        if (!existing[index] && item.status === 'Cancelled') return [];
        return existing[index]
          ? [
              db.tx.update(table, [
                {
                  id: ids[index],
                  record: {
                    ...existing[index],
                    ...item,
                    syncedAt: new Date().toISOString(),
                  },
                },
              ]),
            ]
          : [
              db.tx.add(table, [
                {
                  ...item,
                  createdAt: new Date().toISOString(),
                  syncedAt: new Date().toISOString(),
                },
              ]),
            ];
      },
    );
  const next =
    typeof response.nextPageToken === 'string' && response.nextPageToken
      ? response.nextPageToken
      : undefined;
  operations.push(
    db.tx.update(
      connectionTable(user),
      [
        {
          id: CONTROL_ID,
          record: {
            cursor: next,
            phase: next ? 'fetch' : 'cleanup',
            version: randomUUID(),
          },
          if: {
            connected: true,
            generation: fresh.generation,
            version: fresh.version,
            runId: fresh.runId,
          },
        },
      ],
      { patch: true },
    ),
  );
  await db.transact(operations);
  return {
    done: false,
    phase: next ? 'fetch' : 'cleanup',
    processed: mapped.length,
  };
}

async function cleanupPage(
  user: string,
  row: Connection,
  disconnecting: boolean,
) {
  if (disconnecting && Number(row.revokingUntil || 0) > Date.now())
    throw new CalendarError(
      'Google disconnect is still settling. Try Finish disconnect shortly.',
      409,
    );
  const page = await db.list<RecordItem>(modernTable(user, 'events'), {
    limit: 50,
    nextToken: row.cursor,
  });
  const stale = page.items.filter(
    (item) =>
      item.provider === 'google-calendar' &&
      item.externalActive !== false &&
      (disconnecting || item.syncRun !== row.runId),
  );
  const operations = stale.map((item) =>
    db.tx.update(
      modernTable(user, 'events'),
      [
        {
          id: item.id,
          record: {
            externalActive: false,
            status: disconnecting
              ? 'Disconnected snapshot'
              : 'Not in current sync',
          },
        },
      ],
      { patch: true },
    ),
  );
  const finished = !page.nextToken;
  operations.push(
    db.tx.update(
      connectionTable(user),
      [
        {
          id: CONTROL_ID,
          record: {
            cursor: page.nextToken,
            version: randomUUID(),
            ...(finished
              ? {
                  runId: undefined,
                  phase: undefined,
                  ...(disconnecting
                    ? {
                        email: undefined,
                        accountSub: undefined,
                        lastSyncedAt: undefined,
                        reconnectRequired: false,
                      }
                    : { lastSyncedAt: new Date().toISOString() }),
                }
              : {}),
          },
          if: {
            version: row.version,
            generation: row.generation,
            runId: row.runId,
            connected: !disconnecting,
          },
        },
      ],
      { patch: true },
    ),
  );
  await db.transact(operations);
  return {
    done: finished,
    phase: finished ? null : disconnecting ? 'disconnect' : 'cleanup',
    processed: stale.length,
  };
}

async function disconnect(user: string) {
  const row = await control(user);
  if (!row) return { done: true, revocationFailed: false };
  if (!row.connected && row.phase === 'disconnect')
    return { done: false, revocationFailed: Boolean(row.revocationFailed) };
  let tokens: Tokens | undefined;
  try {
    const settings = await config();
    if (row.encryptedTokens)
      tokens = openGoogleValue<Tokens>(
        row.encryptedTokens,
        user,
        'tokens',
        settings.clientSecret,
      );
  } catch {
    /* Local disconnect remains possible when credentials change. */
  }
  await patchControl(user, row, {
    connected: false,
    encryptedTokens: undefined,
    authEpoch: randomUUID(),
    generation: randomUUID(),
    runId: randomUUID(),
    phase: 'disconnect',
    cursor: undefined,
    revocationFailed: true,
    revokingUntil: Date.now() + 30000,
  });
  let revocationFailed = Boolean(row.encryptedTokens && !tokens);
  if (tokens) {
    try {
      const response = await fetch(REVOKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: tokens.refreshToken }),
        signal: AbortSignal.timeout(12000),
      });
      revocationFailed = !response.ok;
    } catch {
      revocationFailed = true;
    }
  }
  const settled = await control(user);
  if (settled && !settled.connected && settled.phase === 'disconnect')
    await patchControl(user, settled, { revocationFailed, revokingUntil: 0 });
  return { done: false, revocationFailed };
}

const guarded = (run: (user: string, body: unknown) => Promise<unknown>) => [
  requireAuth(),
  async (ctx: import('@appdeploy/sdk').RouterContext) => {
    try {
      return json(await run(ctx.user!.userId, ctx.body));
    } catch (cause) {
      if (cause instanceof CalendarError)
        return error(cause.message, cause.status);
      if (isAppDatabaseError(cause))
        return error(
          cause.code === 'AppDatabaseQuotaExceeded'
            ? 'Storage limit reached. Resume later.'
            : 'Calendar storage changed or is unavailable. Refresh the connection and resume; no unconfirmed page is treated as complete.',
          cause.code === 'AppDatabaseQuotaExceeded' ? 429 : 503,
        );
      return error(
        'Google Calendar could not complete this request. Refresh and retry.',
        503,
      );
    }
  },
];

export const googleCalendarRoutes: RouterRoutes = {
  'GET /api/google-calendar/status': guarded((user) => calendarStatus(user)),
  'POST /api/google-calendar/begin': guarded((user) => begin(user)),
  'POST /api/google-calendar/complete': guarded(complete),
  'POST /api/google-calendar/sync/start': guarded((user) => startSync(user)),
  'POST /api/google-calendar/sync/page': guarded(syncPage),
  'POST /api/google-calendar/disconnect': guarded((user) => disconnect(user)),
  'POST /api/google-calendar/disconnect/page': guarded(async (user) => {
    const row = await control(user);
    if (!row || row.connected || row.phase !== 'disconnect')
      return { done: !row?.connected };
    return cleanupPage(user, row, true);
  }),
};
