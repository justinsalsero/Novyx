import { api, auth } from '@appdeploy/client';
import { kinds, summarize, type RecordItem } from '../shared/domain';

export async function allRecords(
  kind: string,
  initial?: { items: RecordItem[]; nextToken?: string | null },
) {
  const owner = (await auth.getUser())?.userId;
  if (!owner) throw new Error('Sign in to load your records.');
  let page =
    initial || (await api.get('/api/records/' + encodeURIComponent(kind))).data;
  const records: RecordItem[] = [...page.items];
  const seen = new Set<string>();
  while (page.nextToken) {
    if ((await auth.getUser())?.userId !== owner)
      throw new Error('Account changed. Loading stopped.');
    if (seen.has(page.nextToken) || seen.size >= 1000)
      throw new Error(
        'Could not load a complete dataset. No partial totals were substituted.',
      );
    seen.add(page.nextToken);
    page = (
      await api.get(
        '/api/records/' +
          encodeURIComponent(kind) +
          '?cursor=' +
          encodeURIComponent(page.nextToken),
      )
    ).data;
    records.push(...page.items);
  }
  return records;
}

export async function loadWorkspace() {
  const initial = (await api.get('/api/dashboard')).data;
  const data = { ...initial };
  for (const kind of kinds)
    data[kind] = await allRecords(kind, {
      items: initial[kind] || [],
      nextToken: initial.cursors?.[kind],
    });
  data.summary = summarize(data);
  data.partial = false;
  return data;
}

export function apiError(cause: unknown, fallback: string) {
  const response = (
    cause as { response?: { data?: { error?: string; message?: string } } }
  )?.response?.data;
  return typeof response?.error === 'string'
    ? response.error
    : typeof response?.message === 'string'
      ? response.message
      : fallback;
}

export function workspaceChanged() {
  window.dispatchEvent(new Event('novyx:changed'));
}
