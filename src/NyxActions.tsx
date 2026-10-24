import { useState } from 'react';
import { api } from '@appdeploy/client';
import { apiError, workspaceChanged } from './data';

export type NyxAction = {
  id: string;
  kind: 'tasks' | 'events';
  data: {
    title: string;
    date?: string;
    dueDate?: string;
    eventTime?: string;
    duration?: number;
  };
};

export default function NyxActions({ actions }: { actions: NyxAction[] }) {
  const [busy, setBusy] = useState('');
  const [states, setStates] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  async function decide(action: NyxAction, decision: 'approve' | 'dismiss') {
    setBusy(action.id);
    setNotice('');
    try {
      await api.post(
        '/api/assistant/actions/' +
          encodeURIComponent(action.id) +
          '/' +
          decision,
      );
      setStates((old) => ({
        ...old,
        [action.id]: decision === 'approve' ? 'Saved' : 'Dismissed',
      }));
      if (decision === 'approve') workspaceChanged();
    } catch (cause) {
      setNotice(
        apiError(
          cause,
          'Could not confirm this action. Retry the same draft to check its status.',
        ),
      );
    } finally {
      setBusy('');
    }
  }
  if (!actions.length) return null;
  return (
    <section className="nyx-action-proposals" aria-label="Nyx proposed actions">
      <h3>Review proposed actions</h3>
      <p>
        Nothing is saved until you approve it. These changes stay inside Novyx.
      </p>
      {actions.map((action) => (
        <article key={action.id} className="nyx-proposal">
          <div>
            <strong>{action.data.title}</strong>
            <p>
              {action.kind === 'events' ? 'Calendar event' : 'Task'}{' '}
              {action.data.date || action.data.dueDate || ''}{' '}
              {action.data.eventTime || ''}
              {action.data.duration
                ? ' · ' + action.data.duration + ' min'
                : ''}
            </p>
          </div>
          {states[action.id] ? (
            <strong role="status">{states[action.id]}</strong>
          ) : (
            <div className="nyx-proposal-buttons">
              <button
                disabled={!!busy}
                onClick={() => void decide(action, 'approve')}
              >
                Approve & save
              </button>
              <button
                disabled={!!busy}
                onClick={() => void decide(action, 'dismiss')}
              >
                Dismiss
              </button>
            </div>
          )}
        </article>
      ))}
      {notice && <p role="alert">{notice}</p>}
    </section>
  );
}
