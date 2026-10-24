// Test-only SDK double. Never imported by production source.
const store = () => (globalThis.__novyxTestStore ||= new Map());
const table = (name) => {
  if (!store().has(name)) store().set(name, new Map());
  return store().get(name);
};
let generatedId = 0;
const copy = (value) =>
  value === undefined ? undefined : structuredClone(value);
const failure = (code) => Object.assign(new Error(code), { code });
export const isAppDatabaseError = (value) =>
  !!value?.code?.startsWith('AppDatabase');
function operation(run) {
  let promise;
  const handle = {
    run,
    then(a, b) {
      return (promise ||= Promise.resolve().then(run)).then(a, b);
    },
  };
  return handle;
}
export const db = {
  async list(name, { limit = 50, nextToken } = {}) {
    const rows = [...table(name)].map(([id, data]) => ({ ...copy(data), id }));
    const offset = Number(nextToken || 0);
    return {
      items: rows.slice(offset, offset + limit),
      nextToken:
        offset + limit < rows.length ? String(offset + limit) : undefined,
    };
  },
  async get(name, ids) {
    return ids.map((id) => copy(table(name).get(id)) || null);
  },
  async add(name, rows) {
    return rows.map((row) => {
      const id = 'legacy-' + ++generatedId;
      table(name).set(id, copy(row));
      return id;
    });
  },
  async update(name, rows) {
    return rows.map((row) => {
      if (!table(name).has(row.id)) return false;
      table(name).set(row.id, copy(row.record));
      return true;
    });
  },
  async delete(name, ids) {
    return ids.map((id) => table(name).delete(id));
  },
  tx: {
    add(name, rows) {
      return operation(() =>
        rows.map((row) => {
          const id = row.id || 'generated-' + ++generatedId;
          if (table(name).has(id)) return null;
          table(name).set(id, copy(row));
          return id;
        }),
      );
    },
    update(name, rows, options = {}) {
      return operation(() =>
        rows.map((row) => {
          const old = table(name).get(row.id);
          if (options.patch && !old) return false;
          if (
            row.if &&
            Object.entries(row.if).some(([key, value]) => old?.[key] !== value)
          )
            return false;
          table(name).set(
            row.id,
            copy(options.patch ? { ...old, ...row.record } : row.record),
          );
          return true;
        }),
      );
    },
    delete(name, ids) {
      return operation(() => ids.map((id) => table(name).delete(id)));
    },
  },
  async transact(operations) {
    const before = structuredClone(store());
    try {
      const results = operations.map((op) => op.run());
      if (
        results.some((items) =>
          items.some((item) => item === false || item === null),
        )
      )
        throw failure('AppDatabaseConditionFailed');
      return results;
    } catch (error) {
      globalThis.__novyxTestStore = before;
      throw error;
    }
  },
};
export const ai = {
  async extract() {
    return {
      data: globalThis.__novyxTestAI || {
        reply: 'Here is a proposed task.',
        actions: [{ kind: 'tasks', title: 'Call the studio' }],
      },
    };
  },
  async ocr() {
    return {
      data: {
        merchant: 'Shop',
        total: 15,
        date: '2026-10-23',
        category: 'Other',
      },
      text: 'Shop 15.00',
    };
  },
};
export const secrets = {
  async listSecretNames() {
    return [];
  },
};
export const notifications = Object.fromEntries(
  ['sendToTopic', 'send', 'subscribeTopic', 'unsubscribeTopic'].map((name) => [
    name,
    async () => ({ sent: 1, failed: 0 }),
  ]),
);
export const requireAuth = () => async (ctx) =>
  ctx.user ? undefined : error('Sign in required', 401);
export const json = (data, statusCode = 200) => ({
  statusCode,
  body: JSON.stringify(data),
});
export const error = (message, statusCode = 400) =>
  json({ error: message }, statusCode);
export function router(routes) {
  return async (request) => {
    for (const [pattern, handlers] of Object.entries(routes)) {
      const [method, route] = pattern.split(' ');
      if (method !== request.method) continue;
      const names = [];
      const expression = route.replace(/:([a-z]+)/g, (_, name) => {
        names.push(name);
        return '([^/]+)';
      });
      const match = new RegExp('^' + expression + '$').exec(request.path);
      if (!match) continue;
      const ctx = {
        body: request.body,
        params: Object.fromEntries(
          names.map((name, i) => [name, match[i + 1]]),
        ),
        query: request.query || {},
        user: request.user,
      };
      for (const handler of handlers) {
        const result = await handler(ctx);
        if (result) return { ...result, data: JSON.parse(result.body) };
      }
    }
    return { statusCode: 404 };
  };
}
