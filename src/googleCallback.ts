import { api } from '@appdeploy/client';

type Callback = { code: string; state: string; error: string };
declare global {
  interface Window {
    __nyxGoogleCallback?: Callback;
  }
}
let pending = window.__nyxGoogleCallback || null;
delete window.__nyxGoogleCallback;
let completion: Promise<{ message: string; connected: boolean }> | null = null;
export const hasGoogleCallback = () => !!pending;

export function finishGoogleCallback() {
  if (!pending) return null;
  if (completion) return completion;
  const callback = pending;
  completion = Promise.resolve()
    .then(async () => {
      if (callback.error)
        return {
          message:
            callback.error === 'access_denied'
              ? 'Google access was declined. No calendar was connected.'
              : 'Google authorization did not complete. You can start again.',
          connected: false,
        };
      await api.post('/api/google-calendar/complete', {
        code: callback.code,
        state: callback.state,
      });
      return {
        message:
          'Google Calendar connected. Select Sync appointments to import your primary calendar.',
        connected: true,
      };
    })
    .finally(() => {
      pending = null;
    });
  return completion;
}
