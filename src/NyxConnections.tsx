import { useEffect, useState } from 'react';
import { api } from '@appdeploy/client';
import { allRecords } from './data';
import { Link2, ShieldCheck, Trash2 } from 'lucide-react';
type Request = {
  id: string;
  provider: string;
  label: string;
  scope: string;
  status: string;
};
export default function NyxConnections() {
  const [items, setItems] = useState<Request[]>([]),
    [provider, setProvider] = useState('gmail'),
    [label, setLabel] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  async function refresh() {
    try {
      setItems((await allRecords('connection_requests')) as Request[]);
    } catch {
      setNotice('Could not load connection requests.');
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function add() {
    if (!label.trim()) return;
    setBusy(true);
    try {
      await api.post('/api/connections/requests', {
        provider,
        label: label.trim(),
        scope: 'read-only',
      });
      setLabel('');
      setNotice(
        'Request saved. This does not connect or authorize an account.',
      );
      await refresh();
    } catch {
      setNotice('Could not save request.');
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (!window.confirm('Remove this pending connection request?')) return;
    setBusy(true);
    try {
      await api.delete('/api/connections/requests/' + encodeURIComponent(id));
      setNotice('Request removed.');
      await refresh();
    } catch {
      setNotice('Could not remove request.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      style={{
        padding: 16,
        border: '1px solid rgba(132,161,255,.3)',
        borderRadius: 16,
        margin: '12px 0',
      }}
    >
      <h3>
        <Link2 size={18} /> Multiple account connection centre
      </h3>
      <p>
        Prepare multiple email and bank accounts individually. Actual sign-in,
        consent and data syncing will become available only after secure
        provider OAuth/bank-link integration is configured. A saved request is{' '}
        <strong>not an authorized connection</strong>.
      </p>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'end',
        }}
      >
        <label>
          Account type
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            <option value="gmail">Google / Gmail</option>
            <option value="outlook">Microsoft / Outlook</option>
            <option value="other-email">Other email</option>
            <option value="bank">Bank or credit union</option>
          </select>
        </label>
        <label>
          Account label (no passwords)
          <input
            maxLength={100}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={
              provider === 'bank'
                ? 'e.g. My chequing account'
                : 'e.g. Personal email'
            }
          />
        </label>
        <button
          type="button"
          disabled={busy || !label.trim()}
          onClick={() => void add()}
        >
          Add account request
        </button>
      </div>
      <p style={{ fontSize: 12 }}>
        <ShieldCheck size={14} /> Intended permission: read-only. No passwords,
        banking PINs, access tokens or account numbers should be entered here.
        Sending email, transfers and payments are not authorized.
      </p>
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            borderTop: '1px solid rgba(132,161,255,.2)',
            padding: '10px 0',
          }}
        >
          <div>
            <strong>{item.label}</strong>
            <div style={{ fontSize: 12 }}>
              {item.provider} · Setup required · Not connected
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            aria-label={'Remove ' + item.label}
            onClick={() => void remove(item.id)}
          >
            <Trash2 size={16} /> Remove
          </button>
        </div>
      ))}
      {!items.length && (
        <p>No account requests yet. Add as many as you need.</p>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
