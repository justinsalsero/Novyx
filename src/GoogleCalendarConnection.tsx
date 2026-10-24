import { useEffect, useRef, useState } from 'react';
import { api } from '@appdeploy/client';
import { CalendarDays, Link2, RefreshCw } from 'lucide-react';
import { apiError, workspaceChanged } from './data';
import { finishGoogleCallback } from './googleCallback';

type Status = {
  configured: boolean;
  connected: boolean;
  email: string;
  lastSyncedAt: string;
  syncing: boolean;
  phase: string | null;
  reconnectRequired: boolean;
  revocationFailed: boolean;
  redirectUri: string;
  scope: string;
};
export default function GoogleCalendarConnection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [authorizationUrl, setAuthorizationUrl] = useState('');
  const pause = useRef(false);
  async function refresh() {
    const response = await api.get('/api/google-calendar/status');
    setStatus(response.data as Status);
  }
  useEffect(() => {
    let alive = true;
    void refresh().catch(() => {
      if (alive)
        setNotice(
          'Could not load the Google Calendar connection. Retry below.',
        );
    });
    const callback = finishGoogleCallback();
    if (callback) {
      setBusy(true);
      void callback
        .then((result) => {
          if (alive) {
            setNotice(result.message);
            return refresh();
          }
        })
        .catch((cause) => {
          if (alive)
            setNotice(
              apiError(
                cause,
                'Could not finish Google authorization. Start a fresh connection.',
              ),
            );
        })
        .finally(async () => {
          if (alive) {
            await refresh().catch(() => {});
            setBusy(false);
          }
        });
    }
    return () => {
      alive = false;
      pause.current = true;
    };
  }, []);
  async function prepare() {
    setBusy(true);
    setNotice('');
    setAuthorizationUrl('');
    try {
      const result = await api.post('/api/google-calendar/begin');
      const url = new URL(String(result.data.authorizationUrl));
      if (
        url.origin !== 'https://accounts.google.com' ||
        url.pathname !== '/o/oauth2/v2/auth'
      )
        throw new Error('Invalid provider URL');
      setAuthorizationUrl(url.href);
      setNotice(
        'Continue to Google in a new tab to choose your account and grant read-only Calendar access. This sign-in link expires in 10 minutes.',
      );
    } catch (cause) {
      setNotice(
        apiError(cause, 'Could not prepare Google sign-in. Please retry.'),
      );
    } finally {
      setBusy(false);
    }
  }
  async function sync() {
    setBusy(true);
    pause.current = false;
    let processed = 0;
    try {
      const started = await api.post('/api/google-calendar/sync/start');
      for (let pages = 0; pages < 200; pages++) {
        if (pause.current) {
          setNotice(
            'Sync paused after the last confirmed page. Select Resume sync to continue.',
          );
          break;
        }
        const response = await api.post('/api/google-calendar/sync/page', {
          runId: started.data.runId,
        });
        processed += Number(response.data.processed || 0);
        setNotice(
          (response.data.phase === 'cleanup'
            ? 'Checking removed and moved appointments'
            : 'Importing appointments') +
            ' · ' +
            processed +
            ' records processed.',
        );
        if (response.data.done) {
          setNotice(
            'Calendar sync complete. Imported appointments are available in Calendar and the daily focus planner.',
          );
          break;
        }
        if (pages === 199)
          setNotice(
            'Progress saved. Select Resume sync to continue the remaining pages.',
          );
      }
      workspaceChanged();
    } catch (cause) {
      setNotice(
        apiError(
          cause,
          'Sync stopped before completion. Confirmed pages are retained; select Resume sync to continue.',
        ),
      );
    } finally {
      await refresh().catch(() => {});
      setBusy(false);
    }
  }
  async function disconnect() {
    if (
      status?.connected &&
      !window.confirm(
        'Disconnect Google Calendar? Novyx will revoke access where possible, remove its saved tokens, and archive imported appointments so they no longer block your planner. Manual Novyx events are kept. Google warns that revocation affects this Google Cloud project’s grants.',
      )
    )
      return;
    setBusy(true);
    pause.current = false;
    setAuthorizationUrl('');
    try {
      const response = await api.post('/api/google-calendar/disconnect');
      const warning = response.data.revocationFailed
        ? ' Local access stopped, but Google revocation could not be confirmed. Remove Novyx access in your Google Account’s third-party connections.'
        : '';
      let done = Boolean(response.data.done);
      for (let page = 0; !done && page < 200 && !pause.current; page++) {
        const result = await api.post('/api/google-calendar/disconnect/page');
        done = Boolean(result.data.done);
        setNotice('Archiving imported calendar snapshots…');
      }
      setNotice(
        (done
          ? 'Google Calendar disconnected. Imported snapshots no longer block planning; your manual events are unchanged.'
          : 'Access stopped. Select Finish disconnect to archive the remaining snapshots.') +
          warning,
      );
      workspaceChanged();
    } catch (cause) {
      setNotice(
        apiError(
          cause,
          'Disconnect did not finish. Refresh and select Finish disconnect if shown.',
        ),
      );
    } finally {
      await refresh().catch(() => {});
      setBusy(false);
    }
  }
  return (
    <section className="nyx-google-connection nyx-planner">
      <h3>
        <CalendarDays size={20} /> Google Calendar
      </h3>
      <p>
        Read your primary Google calendar so Nyx plans around real appointments.
        One Google account is supported. Imported events are read-only; Novyx
        focus sessions stay in Novyx.
      </p>
      {status ? (
        <>
          <p>
            <strong>
              {status.connected
                ? 'Connected: ' + status.email
                : status.configured
                  ? 'Ready to connect'
                  : 'App owner setup required'}
            </strong>
          </p>
          {status.lastSyncedAt && (
            <p>
              Last completed sync:{' '}
              {new Date(status.lastSyncedAt).toLocaleString()}
            </p>
          )}
          {status.revocationFailed && !status.connected && (
            <p role="alert">
              Novyx stopped local access, but Google revocation was not
              confirmed. Remove Novyx from your Google Account’s third-party
              connections if you want to revoke the provider grant.
            </p>
          )}
          {status.reconnectRequired && (
            <p role="alert">
              Google authorization needs renewal. Disconnect, then connect
              again.
            </p>
          )}
          {!status.configured && (
            <details>
              <summary>Google OAuth setup details</summary>
              <p>
                The app owner must enable the Google Calendar API and register a
                Web application OAuth client. Add this exact authorized redirect
                URI:
              </p>
              <code>{status.redirectUri}</code>
              <p>
                Store GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET using the secure
                app configuration form. Calendar access requires a separate
                consent step after setup. Full instructions are in the project’s{' '}
                <a
                  href="https://github.com/justinsalsero/Novyx/blob/main/docs/google-calendar-setup.md"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Google Calendar setup guide
                </a>
                .
              </p>
            </details>
          )}
          <p className="fine-print">
            Sync imports the previous 7 days and next 60 days in resumable
            pages. Until sync finishes, imported data may be incomplete. Sync is
            manual; Novyx does not monitor Google continuously.
          </p>
          <div className="nyx-proposal-buttons">
            {!status.connected && status.phase !== 'disconnect' && (
              <button disabled={busy} onClick={() => void prepare()}>
                <Link2 size={16} /> Connect Google Calendar
              </button>
            )}
            {status.connected && (
              <button
                disabled={busy || status.reconnectRequired}
                onClick={() => void sync()}
              >
                <RefreshCw size={16} />{' '}
                {status.syncing ? 'Resume sync' : 'Sync appointments'}
              </button>
            )}
            {(status.connected || status.phase === 'disconnect') && (
              <button disabled={busy} onClick={() => void disconnect()}>
                {status.connected ? 'Disconnect' : 'Finish disconnect'}
              </button>
            )}
            <button
              disabled={busy}
              onClick={() =>
                void refresh().catch(() =>
                  setNotice('Could not refresh connection status.'),
                )
              }
            >
              Refresh status
            </button>
            {busy && (status?.connected || status?.phase === 'disconnect') && (
              <button
                onClick={() => {
                  pause.current = true;
                }}
              >
                Pause after this page
              </button>
            )}
          </div>
          {authorizationUrl && (
            <p>
              <a
                className="primary-btn"
                href={authorizationUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Continue to Google ↗
              </a>
            </p>
          )}
        </>
      ) : (
        <button
          onClick={() =>
            void refresh().catch(() =>
              setNotice('Could not load connection status.'),
            )
          }
        >
          Load connection status
        </button>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
