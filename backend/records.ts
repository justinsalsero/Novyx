import { createHash } from 'node:crypto';
import { db, isAppDatabaseError } from '@appdeploy/sdk';
import type { RecordItem } from '../shared/domain';

export const hash = (text: string) =>
  createHash('sha256').update(text).digest('hex');
export const legacyTable = (user: string, kind: string) =>
  'personal:' + user + ':' + kind;
export const modernTable = (user: string, kind: string) =>
  'nyx_' + hash(user).slice(0, 32) + '_' + kind;
export const itemTable = (user: string, kind: string, id: string) =>
  id.startsWith('v4_') ? modernTable(user, kind) : legacyTable(user, kind);

type Cursor = {
  legacy?: string;
  modern?: string;
  legacyDone?: boolean;
  modernDone?: boolean;
};
export async function pageRecords(user: string, kind: string, token?: string) {
  let cursor: Cursor = {};
  if (token) {
    if (token.length > 16000) throw new Error('Invalid page token.');
    cursor = JSON.parse(
      Buffer.from(token, 'base64url').toString('utf8'),
    ) as Cursor;
  }
  const [legacy, modern] = await Promise.all([
    cursor.legacyDone
      ? { items: [], nextToken: undefined }
      : db.list<RecordItem>(legacyTable(user, kind), {
          limit: 50,
          nextToken: cursor.legacy,
        }),
    cursor.modernDone
      ? { items: [], nextToken: undefined }
      : db.list<RecordItem>(modernTable(user, kind), {
          limit: 50,
          nextToken: cursor.modern,
        }),
  ]);
  const next = {
    legacy: legacy.nextToken,
    modern: modern.nextToken,
    legacyDone: !legacy.nextToken,
    modernDone: !modern.nextToken,
  };
  return {
    items: [...legacy.items, ...modern.items],
    nextToken:
      next.legacyDone && next.modernDone
        ? undefined
        : Buffer.from(JSON.stringify(next)).toString('base64url'),
  };
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(
          (key) =>
            JSON.stringify(key) + ':' + canonical((value as RecordItem)[key]),
        )
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value);
}

export async function createRecord(
  user: string,
  kind: string,
  data: RecordItem,
  requestId: string,
) {
  const id = 'v4_' + hash(requestId);
  const table = modernTable(user, kind);
  const fingerprint = hash(canonical(data));
  const [existing] = await db.get<RecordItem>(table, [id], {
    consistent: true,
  });
  if (existing) {
    if (existing.requestFingerprint !== fingerprint)
      throw new Error('This request ID was already used for different data.');
    return { ...existing, id };
  }
  const record = {
    ...data,
    id,
    requestKey: requestId,
    requestFingerprint: fingerprint,
    createdAt: new Date().toISOString(),
  };
  try {
    const [saved] = await db.tx.add(table, [record]);
    if (saved) return { ...record, id: saved };
  } catch (cause) {
    if (
      !isAppDatabaseError(cause) ||
      !['AppDatabaseDuplicateId', 'AppDatabaseUnknownOutcome'].includes(
        cause.code,
      )
    )
      throw cause;
  }
  const [reconciled] = await db.get<RecordItem>(table, [id], {
    consistent: true,
  });
  if (reconciled?.requestFingerprint === fingerprint)
    return { ...reconciled, id };
  throw new Error(
    'Save outcome is not confirmed. Retry the same request to check it.',
  );
}
