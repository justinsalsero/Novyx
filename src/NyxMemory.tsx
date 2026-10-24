import { useEffect, useState } from 'react';
import { api } from '@appdeploy/client';
import { allRecords } from './data';
import { BrainCircuit, Plus, Trash2 } from 'lucide-react';
type Memory = { id: string; text: string };
export default function NyxMemory() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Memory[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  async function refresh() {
    try {
      setItems((await allRecords('nyx_memory')) as Memory[]);
    } catch {
      setNotice('Unable to load saved memories.');
    }
  }
  useEffect(() => {
    if (open) void refresh();
  }, [open]);
  async function add() {
    const text = draft.trim();
    if (!text || text.length > 500) return;
    setBusy(true);
    try {
      await api.post('/api/nyx/memory', { text });
      setDraft('');
      setNotice('Memory saved.');
      await refresh();
    } catch {
      setNotice('Could not save memory.');
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (!window.confirm('Delete this saved Nyx memory?')) return;
    setBusy(true);
    try {
      await api.delete('/api/nyx/memory/' + encodeURIComponent(id));
      setNotice('Memory deleted.');
      await refresh();
    } catch {
      setNotice('Could not delete memory.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      style={{
        margin: '16px 0',
        padding: 16,
        border: '1px solid rgba(132,161,255,.28)',
        borderRadius: 16,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ display: 'flex', gap: 8, alignItems: 'center' }}
      >
        <BrainCircuit size={18} /> Nyx Memory {open ? '−' : '+'}
      </button>
      {open && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 13 }}>
            Only preferences you explicitly save are remembered. Review or
            delete them anytime. Never save passwords or account numbers.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              aria-label="New memory"
              maxLength={500}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Remember that I prefer..."
              style={{ flex: 1, minWidth: 170 }}
            />
            <button
              type="button"
              disabled={busy || !draft.trim()}
              onClick={() => void add()}
            >
              <Plus size={16} /> Save
            </button>
          </div>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {items.map((item) => (
              <li
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 8,
                }}
              >
                <span style={{ overflowWrap: 'anywhere' }}>{item.text}</span>
                <button
                  type="button"
                  aria-label="Delete memory"
                  disabled={busy}
                  onClick={() => void remove(item.id)}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
          {!items.length && (
            <p style={{ fontSize: 13 }}>No saved memories yet.</p>
          )}
          {notice && (
            <p role="status" style={{ fontSize: 13 }}>
              {notice}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
