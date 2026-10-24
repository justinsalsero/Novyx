import { useState } from 'react';
import { api } from '@appdeploy/client';
import { CalendarClock } from 'lucide-react';
import {
  eventInterval,
  localDay,
  minutes,
  validDate,
  type RecordItem,
} from '../shared/domain';
import { allRecords, apiError, workspaceChanged } from './data';

type Block = {
  task: RecordItem;
  start: number;
  end: number;
  requestId: string;
};
const clock = (n: number) =>
  String(Math.floor(n / 60)).padStart(2, '0') +
  ':' +
  String(n % 60).padStart(2, '0');
function conflicts(
  events: RecordItem[],
  date: string,
  start: number,
  end: number,
) {
  return events.some((event) => {
    const interval = eventInterval(event, date);
    return interval && start < interval.end && end > interval.start;
  });
}

export default function NyxPlanner() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [date, setDate] = useState(localDay());
  const [start, setStart] = useState('09:00');
  const [hours, setHours] = useState(4);
  const [duration, setDuration] = useState(45);
  const clearDraft = () => {
    setBlocks([]);
    setNotice('Settings changed. Generate a new draft.');
  };
  async function generate() {
    setBusy(true);
    setBlocks([]);
    try {
      if (!validDate(date) || minutes(start) === null)
        throw new Error('Choose a valid date and start time.');
      const [allTasks, events] = await Promise.all([
        allRecords('tasks'),
        allRecords('events'),
      ]);
      const tasks = allTasks
        .filter((task) => !task.done)
        .sort((a, b) =>
          String(a.dueDate || '9999').localeCompare(
            String(b.dueDate || '9999'),
          ),
        )
        .slice(0, 15);
      if (events.some((event) => eventInterval(event, date)?.untimed)) {
        setNotice(
          'An all-day event or an event without a start time needs review. Update it in Calendar before scheduling focus blocks.',
        );
        return;
      }
      let cursor = minutes(start)!;
      const limit = Math.min(1440, cursor + hours * 60);
      const proposed: Block[] = [];
      for (const task of tasks) {
        while (
          cursor + duration <= limit &&
          conflicts(events, date, cursor, cursor + duration)
        )
          cursor += 5;
        if (cursor + duration > limit) break;
        proposed.push({
          task,
          start: cursor,
          end: cursor + duration,
          requestId: crypto.randomUUID(),
        });
        cursor += duration + 10;
      }
      setBlocks(proposed);
      setNotice(
        proposed.length
          ? 'Draft only. Review the times, then approve individual sessions.'
          : 'No open tasks or no available time in this window.',
      );
    } catch (cause) {
      setNotice(
        apiError(cause, 'Could not load a complete plan. Please retry.'),
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(block: Block) {
    setBusy(true);
    try {
      const events = await allRecords('events');
      const alreadySaved = events.some(
        (event) => event.requestKey === block.requestId,
      );
      if (!alreadySaved && conflicts(events, date, block.start, block.end)) {
        setNotice(
          'Your calendar changed and this session now conflicts. Generate a fresh draft.',
        );
        setBlocks([]);
        return;
      }
      await api.post('/api/items', {
        kind: 'events',
        requestId: block.requestId,
        data: {
          title: 'Focus: ' + String(block.task.title || 'Task'),
          date,
          eventTime: clock(block.start),
          duration: block.end - block.start,
          status: 'Planned',
          source: 'nyx-approved-planner',
        },
      });
      setBlocks((old) =>
        old.filter((item) => item.requestId !== block.requestId),
      );
      setNotice('Focus session saved to your Novyx calendar.');
      workspaceChanged();
    } catch (cause) {
      setNotice(
        apiError(
          cause,
          'Could not confirm the save. Retry this session to check the same request.',
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="nyx-planner">
      <h3>
        <CalendarClock size={18} /> Daily focus planner
      </h3>
      <p>
        Plan around your saved Novyx appointments. Each focus session needs your
        approval.
      </p>
      <div className="nyx-planner-fields">
        <label>
          Date
          <input
            type="date"
            value={date}
            disabled={busy}
            onChange={(event) => {
              setDate(event.target.value);
              clearDraft();
            }}
          />
        </label>
        <label>
          Start
          <input
            type="time"
            value={start}
            disabled={busy}
            onChange={(event) => {
              setStart(event.target.value);
              clearDraft();
            }}
          />
        </label>
        <label>
          Hours
          <select
            value={hours}
            disabled={busy}
            onChange={(event) => {
              setHours(Number(event.target.value));
              clearDraft();
            }}
          >
            {[2, 3, 4, 5, 6, 8].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Focus minutes
          <select
            value={duration}
            disabled={busy}
            onChange={(event) => {
              setDuration(Number(event.target.value));
              clearDraft();
            }}
          >
            {[25, 45, 60].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        disabled={busy || !date}
        onClick={() => void generate()}
      >
        Generate draft schedule
      </button>
      {notice && <p role="status">{notice}</p>}
      {blocks.map((block) => (
        <div className="nyx-proposal" key={block.requestId}>
          <span>
            {clock(block.start)}–{clock(block.end)} ·{' '}
            {String(block.task.title || 'Task')}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(block)}
          >
            Approve & save
          </button>
        </div>
      ))}
    </section>
  );
}
