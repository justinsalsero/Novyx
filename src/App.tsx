import {
  kinds,
  expandCashflow,
  simulateDebt as debtSimulation,
  monthlySubscription,
  localDay,
  validateItem,
  type RecordItem,
} from '../shared/domain';
import { allRecords, loadWorkspace, apiError } from './data';
import NyxActions, { type NyxAction } from './NyxActions';
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api, auth, image, notifications } from '@appdeploy/client';
import { Mic2, Search } from 'lucide-react';
import NyxOnboarding, { type NyxProfile } from './NyxOnboarding';
import NyxDashboard from './NyxDashboard';
import NyxVoice from './NyxVoice';
import NyxMemory from './NyxMemory';
import NyxInsights from './NyxInsights';
import NyxPlanner from './NyxPlanner';
import NyxConnections from './NyxConnections';
import NyxLive from './NyxLive';
import NyxQuickActions from './NyxQuickActions';
import NyxBottomNav from './NyxBottomNav';
import {
  Bell,
  Bot,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Download,
  FileText,
  Inbox,
  Landmark,
  LayoutDashboard,
  Link2,
  LockKeyhole,
  LogOut,
  Mail,
  MessageSquareText,
  Plus,
  ReceiptText,
  ScanLine,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  UsersRound,
  WalletCards,
  Zap,
} from 'lucide-react';

type Kind =
  | 'tasks'
  | 'debts'
  | 'inbox'
  | 'social'
  | 'income'
  | 'cashflow'
  | 'goals'
  | 'invoices'
  | 'transactions'
  | 'budgets'
  | 'subscriptions'
  | 'clients'
  | 'events'
  | 'receipts';

type Tab =
  | 'dashboard'
  | 'money'
  | 'bills'
  | 'debt'
  | 'goals'
  | 'connections'
  | 'calendar'
  | 'receipts'
  | 'reports'
  | 'organize'
  | 'social'
  | 'assistant'
  | 'settings'
  | 'live'
  | 'quick';

type OpportunityStatus = 'Lead' | 'Contacted' | 'Booked' | 'Paid';
type NyxMode = 'Focus' | 'Money' | 'Inbox' | 'Clients' | 'Goals' | 'Reports';

interface AppUser {
  userId: string;
  email?: string;
  name?: string;
}

interface Item {
  [key: string]: unknown;
  id: string;
  title?: string;
  done?: boolean;
  creditor?: string;
  balance?: number;
  minPayment?: number;
  apr?: number;
  source?: string;
  summary?: string;
  priority?: string;
  note?: string;
  expected?: number;
  status?: string;
  amount?: number;
  flowType?: 'income' | 'expense';
  date?: string;
  category?: string;
  recurring?: boolean;
  cadence?: 'weekly' | 'biweekly' | 'monthly';
  client?: string;
  email?: string;
  dueDate?: string;
  goalType?: 'income' | 'savings' | 'purchase' | 'other';
  target?: number;
  current?: number;
  merchant?: string;
  transactionDate?: string;
  transactionCategory?: string;
  eventTime?: string;
  eventType?: string;
  createdAt?: string;
}

interface DashboardData {
  tasks: Item[];
  debts: Item[];
  inbox: Item[];
  social: Item[];
  income: Item[];
  cashflow: Item[];
  goals: Item[];
  invoices: Item[];
  transactions: Item[];
  budgets: Item[];
  subscriptions: Item[];
  clients: Item[];
  events: Item[];
  receipts: Item[];
  summary: {
    totalDebt: number;
    minimumPayments: number;
    openTasks: number;
    inboxItems: number;
    expectedIncome: number;
    cashflowNet: number;
    unpaidInvoices: number;
    goalTarget: number;
    totalSpending30: number;
    transactionCount: number;
    subscriptionMonthly: number;
    budgetTotal: number;
  };
}

interface ConnectionStatus {
  gmailConfigured: boolean;
  bankConfigured: boolean;
  calendarConfigured: boolean;
  billingConfigured: boolean;
}

interface ReceiptResult {
  merchant: string;
  total: number;
  date: string;
  category: string;
  rawText?: string;
}

const emptyDashboard: DashboardData = {
  tasks: [],
  debts: [],
  inbox: [],
  social: [],
  income: [],
  cashflow: [],
  goals: [],
  invoices: [],
  transactions: [],
  budgets: [],
  subscriptions: [],
  clients: [],
  events: [],
  receipts: [],
  summary: {
    totalDebt: 0,
    minimumPayments: 0,
    openTasks: 0,
    inboxItems: 0,
    expectedIncome: 0,
    cashflowNet: 0,
    unpaidInvoices: 0,
    goalTarget: 0,
    totalSpending30: 0,
    transactionCount: 0,
    subscriptionMonthly: 0,
    budgetTotal: 0,
  },
};

const spendingCategories = [
  'Housing',
  'Groceries',
  'Dining',
  'Transportation',
  'Shopping',
  'Health',
  'Entertainment',
  'Subscriptions',
  'Debt',
  'Other',
];

function CyberWolf({ small = false }: { small?: boolean }) {
  const [fallback, setFallback] = useState(false);
  if (!fallback)
    return (
      <img
        className={small ? 'cyber-wolf small' : 'cyber-wolf'}
        src="/resources/nyx-icon-512.png"
        alt="Nyx cyber wolf"
        onError={() => setFallback(true)}
      />
    );
  return (
    <svg
      className={small ? 'cyber-wolf small' : 'cyber-wolf'}
      viewBox="0 0 180 180"
      role="img"
      aria-label="Nyx, the Novyx cyber wolf assistant"
    >
      <defs>
        <linearGradient id="wolfGlow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#55e8ff" />
          <stop offset="48%" stopColor="#5974ff" />
          <stop offset="100%" stopColor="#d85cff" />
        </linearGradient>
        <filter id="wolfBloom">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d="M19 69 37 20 63 43 90 26 117 43 143 20 161 69 147 119 119 151 90 169 61 151 33 119Z"
        fill="#071021"
        stroke="url(#wolfGlow)"
        strokeWidth="4"
      />
      <path
        d="M37 20 57 57 31 77 48 82 31 102 53 100 42 124 69 110 90 169 61 151 33 119 19 69Z"
        fill="#0d1b34"
        stroke="#4fdcff"
        strokeWidth="2.5"
      />
      <path
        d="M143 20 123 57 149 77 132 82 149 102 127 100 138 124 111 110 90 169 119 151 147 119 161 69Z"
        fill="#111638"
        stroke="#bc63ff"
        strokeWidth="2.5"
      />
      <path
        d="M57 57 78 50 90 62 102 50 123 57 113 82 90 98 67 82Z"
        fill="#111b3f"
        stroke="#6f75ff"
        strokeWidth="2"
      />
      <path
        d="M49 78 78 72 69 94 47 89ZM131 78 102 72 111 94 133 89Z"
        fill="#53e7ff"
        filter="url(#wolfBloom)"
      />
      <path
        d="M69 94 90 104 111 94 106 128 90 146 74 128Z"
        fill="#101a31"
        stroke="url(#wolfGlow)"
        strokeWidth="3"
      />
      <path d="M79 113 90 107 101 113 96 123 90 127 84 123Z" fill="#70edff" />
      <path
        d="M73 132 90 140 107 132M59 58 90 39 121 58M50 102 71 111M130 102 109 111"
        fill="none"
        stroke="url(#wolfGlow)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authError, setAuthError] = useState('');
  const [workspaceNotice, setWorkspaceNotice] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);
  const [actions, setActions] = useState<NyxAction[]>([]);
  const [conversation, setConversation] = useState<
    Array<{ role: 'user' | 'assistant'; content: string }>
  >([]);
  const loadEpoch = useRef(0);
  const accountEpoch = useRef(0);
  const pendingWrites = useRef(new Map<string, string>());
  const writing = useRef(false);
  const asking = useRef(false);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [data, setData] = useState<DashboardData>(emptyDashboard);
  const [loading, setLoading] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [profile, setProfile] = useState<NyxProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [lastChecked, setLastChecked] = useState('');

  const [taskTitle, setTaskTitle] = useState('');
  const [inboxSource, setInboxSource] = useState('Email');
  const [inboxSummary, setInboxSummary] = useState('');
  const [socialNote, setSocialNote] = useState('');

  const [creditor, setCreditor] = useState('');
  const [balance, setBalance] = useState('');
  const [minPayment, setMinPayment] = useState('');
  const [apr, setApr] = useState('');
  const [extraDebtPayment, setExtraDebtPayment] = useState('100');
  const [debtStrategy, setDebtStrategy] = useState<'avalanche' | 'snowball'>(
    'avalanche',
  );

  const [opportunityTitle, setOpportunityTitle] = useState('');
  const [opportunityAmount, setOpportunityAmount] = useState('');

  const [flowTitle, setFlowTitle] = useState('');
  const [flowAmount, setFlowAmount] = useState('');
  const [flowType, setFlowType] = useState<'income' | 'expense'>('income');
  const [flowDate, setFlowDate] = useState('');
  const [flowRecurring, setFlowRecurring] = useState(false);
  const [flowCadence, setFlowCadence] = useState<
    'weekly' | 'biweekly' | 'monthly'
  >('monthly');

  const [invoiceClient, setInvoiceClient] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceDueDate, setInvoiceDueDate] = useState('');

  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientNote, setClientNote] = useState('');

  const [goalTitle, setGoalTitle] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalCurrent, setGoalCurrent] = useState('');
  const [goalType, setGoalType] = useState<
    'income' | 'savings' | 'purchase' | 'other'
  >('income');
  const [goalDueDate, setGoalDueDate] = useState('');

  const [transactionMerchant, setTransactionMerchant] = useState('');
  const [transactionAmount, setTransactionAmount] = useState('');
  const [transactionDate, setTransactionDate] = useState('');
  const [transactionCategory, setTransactionCategory] = useState('Other');

  const [budgetCategory, setBudgetCategory] = useState('Groceries');
  const [budgetAmount, setBudgetAmount] = useState('');

  const [subscriptionName, setSubscriptionName] = useState('');
  const [subscriptionAmount, setSubscriptionAmount] = useState('');
  const [subscriptionCadence, setSubscriptionCadence] = useState<
    'weekly' | 'monthly'
  >('monthly');

  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [eventType, setEventType] = useState('Personal');

  const [assistantInput, setAssistantInput] = useState('');
  const [assistantReply, setAssistantReply] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [nyxMode, setNyxMode] = useState<NyxMode>('Focus');

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    gmailConfigured: false,
    bankConfigured: false,
    calendarConfigured: false,
    billingConfigured: false,
  });
  const [connectionMessage, setConnectionMessage] = useState('');

  const receiptRequest = useRef('');
  const [receiptSaving, setReceiptSaving] = useState(false);
  const [receiptScanning, setReceiptScanning] = useState(false);
  const [receiptResult, setReceiptResult] = useState<ReceiptResult | null>(
    null,
  );
  const [receiptError, setReceiptError] = useState('');

  const [notificationStatus, setNotificationStatus] = useState('Not checked');
  const [sessionTimeout, setSessionTimeout] = useState(() =>
    Number(localStorage.getItem('novyx-session-timeout') || 30),
  );
  const [restoreMessage, setRestoreMessage] = useState('');

  const loadDashboard = useCallback(async () => {
    const epoch = ++loadEpoch.current;
    setLoading(true);
    try {
      const [workspace, integrations, profileResult] = await Promise.all([
        loadWorkspace(),
        api.get('/api/integrations/status'),
        api.get('/api/profile'),
      ]);
      if (epoch !== loadEpoch.current || !auth.isSignedIn()) return;
      setData(workspace as DashboardData);
      setWorkspaceReady(true);
      setConnectionStatus(integrations.data as ConnectionStatus);
      setProfile((profileResult.data.profile || null) as NyxProfile | null);
      setLastChecked(
        new Date().toLocaleTimeString('en-CA', {
          hour: 'numeric',
          minute: '2-digit',
        }),
      );
      setWorkspaceNotice('');
    } catch {
      if (epoch === loadEpoch.current)
        setWorkspaceNotice(
          'Could not refresh your complete workspace. The last confirmed view is retained. Retry refresh before relying on totals.',
        );
    } finally {
      if (epoch === loadEpoch.current) {
        setProfileLoading(false);
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const changed = () => {
      if (auth.isSignedIn()) void loadDashboard();
    };
    window.addEventListener('novyx:changed', changed);
    return () => window.removeEventListener('novyx:changed', changed);
  }, [loadDashboard]);

  useEffect(() => {
    auth
      .getUser()
      .then((current) => {
        setUser(current as AppUser | null);
        if (current) void loadDashboard();
      })
      .catch(() =>
        setAuthError('Could not check your sign-in. Please sign in again.'),
      )
      .finally(() => setCheckingAuth(false));
  }, [loadDashboard]);

  const signIn = async () => {
    setAuthError('');
    try {
      const result = await auth.signIn();
      setUser(result.user as AppUser);
      await loadDashboard();
    } catch (err) {
      const authErr = err as { code?: string };
      if (authErr.code === 'popup_closed')
        setAuthError('Sign-in was cancelled.');
      else if (authErr.code === 'popup_blocked')
        setAuthError('Please allow popups to sign in.');
      else setAuthError('Unable to sign in right now.');
    }
  };

  const signOut = useCallback(async () => {
    loadEpoch.current++;
    accountEpoch.current++;
    asking.current = false;
    writing.current = false;
    pendingWrites.current.clear();
    setUser(null);
    setData(emptyDashboard);
    setWorkspaceReady(false);
    setProfile(null);
    setAssistantInput('');
    setAssistantReply('');
    setAssistantLoading(false);
    setConversation([]);
    setActions([]);
    setReceiptResult(null);
    setReceiptError('');
    setRestoreMessage('');
    setWorkspaceNotice('');
    setConnectionMessage('');
    setSearchQuery('');
    setVoiceOpen(false);
    setTab('dashboard');
    setLoading(false);
    // Clear every private form, not only the dashboard.
    setTaskTitle('');
    setInboxSummary('');
    setSocialNote('');
    setCreditor('');
    setBalance('');
    setMinPayment('');
    setApr('');
    setOpportunityTitle('');
    setOpportunityAmount('');
    setFlowTitle('');
    setFlowAmount('');
    setInvoiceClient('');
    setInvoiceAmount('');
    setClientName('');
    setClientEmail('');
    setClientNote('');
    setGoalTitle('');
    setTransactionMerchant('');
    setTransactionAmount('');
    setSubscriptionName('');
    setSubscriptionAmount('');
    setEventTitle('');
    setGoalTarget('');
    setGoalCurrent('');
    setGoalDueDate('');
    setBudgetAmount('');
    setFlowDate('');
    setInvoiceDueDate('');
    setTransactionDate('');
    setEventDate('');
    setEventTime('');
    setConnectionStatus({
      gmailConfigured: false,
      bankConfigured: false,
      calendarConfigured: false,
      billingConfigured: false,
    });
    setNotificationStatus('Not checked');
    setLastChecked('');
    setBackupBusy(false);
    setReceiptSaving(false);
    receiptRequest.current = '';
    try {
      await auth.signOut();
    } catch {
      setAuthError(
        'Sign-out could not be confirmed. Close this browser tab before sharing the device.',
      );
    }
  }, []);

  useEffect(() => {
    if (!user || sessionTimeout <= 0) return;
    let timer = window.setTimeout(
      () => void signOut(),
      sessionTimeout * 60_000,
    );
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void signOut(), sessionTimeout * 60_000);
    };
    const events = ['mousemove', 'keydown', 'touchstart', 'click'];
    events.forEach((name) => window.addEventListener(name, reset));
    return () => {
      window.clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, reset));
    };
  }, [user, sessionTimeout, signOut]);

  const addItem = async (kind: Kind, payload: Record<string, unknown>) => {
    if (writing.current) return false;
    writing.current = true;
    const key = kind + ':' + JSON.stringify(payload);
    const id = pendingWrites.current.get(key) || crypto.randomUUID();
    pendingWrites.current.set(key, id);
    try {
      validateItem(kind, payload);
      await api.post('/api/items', { kind, data: payload, requestId: id });
      pendingWrites.current.delete(key);
      await loadDashboard();
      return true;
    } catch (cause) {
      setWorkspaceNotice(
        apiError(
          cause,
          cause instanceof Error &&
            /^(Enter|Choose|Invalid)/.test(cause.message)
            ? cause.message
            : 'Could not confirm the save. Your form is retained; retry the same form to check it.',
        ),
      );
      return false;
    } finally {
      writing.current = false;
    }
  };

  const updateItem = async (
    kind: Kind,
    id: string,
    patch: Record<string, unknown>,
  ) => {
    try {
      await api.put('/api/items/' + kind + '/' + encodeURIComponent(id), patch);
      await loadDashboard();
    } catch (cause) {
      setWorkspaceNotice(
        apiError(cause, 'Could not update this record. Please retry.'),
      );
    }
  };

  const deleteItem = async (kind: Kind, id: string) => {
    if (!window.confirm('Delete this record? This cannot be undone.')) return;
    try {
      await api.delete('/api/items/' + kind + '/' + encodeURIComponent(id));
      await loadDashboard();
    } catch (cause) {
      setWorkspaceNotice(
        apiError(
          cause,
          'Could not confirm deletion. Refresh to check the record before retrying.',
        ),
      );
    }
  };

  const submitSimple = async (
    event: FormEvent,
    kind: Kind,
    payload: Record<string, unknown>,
    clear: () => void,
  ) => {
    event.preventDefault();
    if (await addItem(kind, payload)) clear();
  };

  const submitTransaction = async (event: FormEvent) => {
    event.preventDefault();
    if (
      !transactionMerchant.trim() ||
      Number(transactionAmount) <= 0 ||
      !transactionDate
    ) {
      setWorkspaceNotice(
        'Enter a merchant, positive amount and valid transaction date.',
      );
      return;
    }
    const saved = await addItem('transactions', {
      merchant: transactionMerchant.trim(),
      amount: Number(transactionAmount),
      transactionDate,
      transactionCategory,
    });
    if (!saved) return;
    setTransactionMerchant('');
    setTransactionAmount('');
    setTransactionDate('');
    setTransactionCategory('Other');
  };

  const saveOnboarding = async (nextProfile: NyxProfile) => {
    setSavingProfile(true);
    try {
      await api.post('/api/profile', nextProfile);
      setProfile(nextProfile);
      await loadDashboard();
    } catch {
      setConnectionMessage('Could not save your setup. Please try again.');
    } finally {
      setSavingProfile(false);
    }
  };

  const localSearch = searchQuery.trim().toLowerCase();
  const searchMatches = localSearch
    ? [
        ...data.tasks.map((item) => ({ item, section: 'organize' })),
        ...data.transactions.map((item) => ({ item, section: 'money' })),
        ...data.invoices.map((item) => ({ item, section: 'bills' })),
        ...data.events.map((item) => ({ item, section: 'calendar' })),
        ...data.goals.map((item) => ({ item, section: 'goals' })),
        ...data.inbox.map((item) => ({ item, section: 'organize' })),
        ...data.debts.map((item) => ({ item, section: 'debt' })),
        ...data.clients.map((item) => ({ item, section: 'bills' })),
      ]
        .filter(({ item }) =>
          JSON.stringify(item).toLowerCase().includes(localSearch),
        )
        .slice(0, 8)
    : [];

  useEffect(() => {
    if (!user || !profile?.completed) return;
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadDashboard();
    }, 180000);
    return () => window.clearInterval(poll);
  }, [user, profile?.completed, loadDashboard]);

  const runNyx = async (prompt: string, mode: NyxMode = nyxMode) => {
    if (!prompt.trim() || asking.current) return;
    asking.current = true;
    const epoch = accountEpoch.current;
    setAssistantLoading(true);
    setAssistantInput('');
    setNyxMode(mode);
    setTab('assistant');
    try {
      const response = await api.post('/api/assistant', {
        message: prompt.trim(),
        mode,
        history: conversation.slice(-10),
      });
      if (epoch !== accountEpoch.current) return;
      const reply = String(response.data.reply || '');
      setAssistantReply(reply);
      setActions((response.data.actions || []) as NyxAction[]);
      setConversation((old) =>
        [
          ...old,
          { role: 'user' as const, content: prompt.trim() },
          { role: 'assistant' as const, content: reply },
        ].slice(-20),
      );
      if (response.data.partial)
        setWorkspaceNotice(
          'Nyx used a limited saved-record snapshot. Dashboard totals use all loaded pages. Ask about a specific record for precision.',
        );
    } catch (cause) {
      if (epoch !== accountEpoch.current) return;
      setAssistantInput(prompt);
      setWorkspaceNotice(
        apiError(
          cause,
          'Nyx could not reply. Your message is retained; please retry.',
        ),
      );
    } finally {
      if (epoch === accountEpoch.current) {
        asking.current = false;
        setAssistantLoading(false);
      }
    }
  };

  const askNyx = async (event: FormEvent) => {
    event.preventDefault();
    await runNyx(assistantInput);
  };

  const scanReceipt = async (file?: File) => {
    if (!file) return;
    const epoch = accountEpoch.current;
    setReceiptScanning(true);
    setReceiptError('');
    setReceiptResult(null);
    receiptRequest.current = crypto.randomUUID();
    try {
      const prepared = await image.resizeIfNeeded(file);
      const response = await api.post('/api/receipts/scan', {
        data: prepared.data,
        mimeType: prepared.mimeType,
      });
      if (epoch === accountEpoch.current)
        setReceiptResult(response.data as ReceiptResult);
    } catch {
      setReceiptError(
        'Nyx could not read that receipt. Try a clearer photo with the total visible.',
      );
    } finally {
      setReceiptScanning(false);
    }
  };

  const saveScannedReceipt = async () => {
    if (!receiptResult || receiptSaving) return;
    setReceiptSaving(true);
    if (!receiptRequest.current) receiptRequest.current = crypto.randomUUID();
    try {
      await api.post('/api/receipts/save', {
        requestId: receiptRequest.current,
        data: {
          merchant: receiptResult.merchant || 'Unknown merchant',
          amount: Number(receiptResult.total || 0),
          transactionDate: receiptResult.date || localDay(),
          transactionCategory: receiptResult.category || 'Other',
          note: receiptResult.rawText || '',
        },
      });
      setReceiptResult(null);
      receiptRequest.current = '';
      await loadDashboard();
    } catch (cause) {
      setReceiptError(
        apiError(
          cause,
          'Could not confirm saving this receipt. Retry to check the same receipt; do not scan it again.',
        ),
      );
    } finally {
      setReceiptSaving(false);
    }
  };

  const enableNotifications = async () => {
    try {
      await notifications.subscribe();
      await api.post('/api/notifications/topics', { enabled: true });
      const env = await notifications.getEnvironment();
      setNotificationStatus(
        env.permission === 'granted' ? 'Enabled' : env.permission,
      );
    } catch {
      const guidance = await notifications.getEnableGuidance();
      setNotificationStatus(guidance.message);
    }
  };

  const disableNotifications = async () => {
    try {
      await api.post('/api/notifications/topics', { enabled: false });
      await notifications.unsubscribe({ showUi: false });
      setNotificationStatus('Disabled');
    } catch {
      setNotificationStatus('Could not disable notifications on this device.');
    }
  };

  const sendTestNotification = async () => {
    try {
      await api.post('/api/notifications/test');
      setNotificationStatus('Test notification sent');
    } catch {
      setNotificationStatus(
        'Enable notifications first, then try the test again.',
      );
    }
  };

  const saveSessionTimeout = (minutes: number) => {
    setSessionTimeout(minutes);
    localStorage.setItem('novyx-session-timeout', String(minutes));
  };

  const downloadBlob = (filename: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportBackup = async () => {
    const epoch = accountEpoch.current;
    setBackupBusy(true);
    try {
      const [workspace, profileResponse, memories, requests] =
        await Promise.all([
          loadWorkspace(),
          api.get('/api/profile'),
          allRecords('nyx_memory'),
          allRecords('connection_requests'),
        ]);
      if (epoch !== accountEpoch.current) return;
      const records = Object.fromEntries(
        kinds.map((kind) => [kind, workspace[kind]]),
      );
      downloadBlob(
        'novyx-backup.json',
        JSON.stringify(
          {
            version: 4,
            exportedAt: new Date().toISOString(),
            data: records,
            profile: profileResponse.data.profile,
            memories,
            connectionRequests: requests,
          },
          null,
          2,
        ),
        'application/json',
      );
      setWorkspaceNotice(
        'Complete backup downloaded: records, profile, Nyx memories and pending connection requests. It contains private data; store it securely.',
      );
    } catch {
      setWorkspaceNotice(
        'Could not download a complete backup. No partial backup was created. Please retry.',
      );
    } finally {
      setBackupBusy(false);
    }
  };

  const exportTransactionsCsv = () => {
    const rows = [['Date', 'Merchant', 'Category', 'Amount']];
    data.transactions.forEach((item) => {
      rows.push([
        item.transactionDate || '',
        item.merchant || '',
        item.transactionCategory || 'Other',
        String(Number(item.amount || 0)),
      ]);
    });
    const csv = rows
      .map((row) =>
        row
          .map(
            (value) =>
              '"' +
              (/^[=+@\-\t\r]/.test(value) ? "'" : '') +
              value.replaceAll('"', '""') +
              '"',
          )
          .join(','),
      )
      .join('\n');
    downloadBlob('novyx-transactions.csv', csv, 'text/csv');
  };

  const restoreBackup = async (file?: File) => {
    if (!file || backupBusy) return;
    const epoch = accountEpoch.current;
    let imported = 0;
    let skipped = 0;
    try {
      if (file.size > 30 * 1024 * 1024)
        throw new Error('Backup exceeds 30 MB.');
      const parsed = JSON.parse(await file.text()) as {
        version?: number;
        data?: Record<string, RecordItem[]>;
        profile?: NyxProfile;
        memories?: RecordItem[];
        connectionRequests?: RecordItem[];
      };
      if (
        !parsed.data ||
        typeof parsed.data !== 'object' ||
        Array.isArray(parsed.data) ||
        (parsed.version !== undefined && ![2, 3, 4].includes(parsed.version))
      )
        throw new Error('Unsupported backup format.');
      const groups: Array<[string, RecordItem[]]> = [];
      for (const kind of kinds) {
        const records = parsed.data[kind];
        if (records === undefined) continue;
        if (!Array.isArray(records))
          throw new Error('Invalid backup category: ' + kind);
        records.forEach((record) => validateItem(kind, record));
        groups.push([kind, records]);
      }
      if (parsed.memories) {
        if (
          !Array.isArray(parsed.memories) ||
          parsed.memories.some(
            (record) =>
              typeof record.text !== 'string' ||
              !record.text.trim() ||
              record.text.length > 500,
          )
        )
          throw new Error('Invalid memories.');
        groups.push(['nyx_memory', parsed.memories]);
      }
      if (parsed.connectionRequests) {
        if (
          !Array.isArray(parsed.connectionRequests) ||
          parsed.connectionRequests.some(
            (record) =>
              !['gmail', 'outlook', 'other-email', 'bank'].includes(
                String(record.provider),
              ) ||
              typeof record.label !== 'string' ||
              !record.label.trim() ||
              record.label.length > 100,
          )
        )
          throw new Error('Invalid connection requests.');
        groups.push(['connection_requests', parsed.connectionRequests]);
      }
      if (
        parsed.profile &&
        (!parsed.profile.name || parsed.profile.name.length > 90)
      )
        throw new Error('Invalid profile.');
      const count = groups.reduce((sum, group) => sum + group[1].length, 0);
      if (
        !window.confirm(
          'Restore ' +
            count +
            ' records? Existing matching records are kept. ' +
            (parsed.profile
              ? 'Your profile will be replaced by the backup profile. '
              : '') +
            'This backup never connects external accounts.',
        )
      )
        return;
      setBackupBusy(true);
      setRestoreMessage('Restoring backup…');
      for (const [kind, records] of groups) {
        for (let offset = 0; offset < records.length; offset += 20) {
          if (epoch !== accountEpoch.current)
            throw new Error('Account changed. Restore stopped.');
          const response = await api.post('/api/backup/import', {
            kind,
            records: records.slice(offset, offset + 20),
          });
          imported += Number(response.data.imported || 0);
          skipped += Number(response.data.skipped || 0);
          setRestoreMessage(
            'Restoring: ' +
              imported +
              ' added, ' +
              skipped +
              ' already present.',
          );
        }
      }
      if (epoch !== accountEpoch.current)
        throw new Error('Account changed. Restore stopped.');
      if (parsed.profile) await api.post('/api/backup/profile', parsed.profile);
      await loadDashboard();
      setRestoreMessage(
        'Restore complete: ' +
          imported +
          ' added, ' +
          skipped +
          ' already present. Reimporting the same backup does not duplicate records.',
      );
    } catch (cause) {
      setRestoreMessage(
        'Restore stopped: ' +
          imported +
          ' records confirmed added, ' +
          skipped +
          ' already present. ' +
          apiError(
            cause,
            cause instanceof Error
              ? cause.message
              : 'Please retry the same backup; confirmed records will not be duplicated.',
          ),
      );
    } finally {
      setBackupBusy(false);
    }
  };

  const showProviderSetup = (provider: 'gmail' | 'bank' | 'calendar') => {
    const label =
      provider === 'gmail'
        ? 'Email sync'
        : provider === 'bank'
          ? 'Bank sync'
          : 'External calendar sync';
    setConnectionMessage(
      label +
        ' is not available in this build. Your saved Novyx records work independently. Live connections need provider authorization and a tested synchronization service, not just credentials.',
    );
  };

  const expandedThirtyDays = useMemo(
    () => expandCashflow(data.cashflow) as Item[],
    [data.cashflow],
  );

  const nextThirtyNet = expandedThirtyDays.reduce(
    (sum, item) =>
      sum +
      (item.flowType === 'expense'
        ? -Number(item.amount || 0)
        : Number(item.amount || 0)),
    0,
  );

  const weekly = useMemo(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    let income = 0;
    let expenses = 0;
    data.cashflow.forEach((item) => {
      if (!item.date) return;
      const d = new Date(item.date + 'T12:00:00');
      if (d < start || d > end) return;
      if (item.flowType === 'expense') expenses += Number(item.amount || 0);
      else income += Number(item.amount || 0);
    });
    return { income, expenses, net: income - expenses };
  }, [data.cashflow]);

  const currentMonth = localDay().slice(0, 7);
  const monthlyTransactions = useMemo(
    () =>
      data.transactions.filter(
        (item) =>
          String(item.transactionDate || '').startsWith(currentMonth) &&
          String(item.transactionDate || '') <= localDay(),
      ),
    [data.transactions, currentMonth],
  );

  const spendingBreakdown = useMemo(() => {
    const totals: Record<string, number> = {};
    monthlyTransactions.forEach((item) => {
      const category = item.transactionCategory || 'Other';
      totals[category] = (totals[category] || 0) + Number(item.amount || 0);
    });
    return Object.entries(totals)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [monthlyTransactions]);

  const monthlySpending = monthlyTransactions.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0,
  );

  const budgetRows = data.budgets.map((budget) => {
    const category = budget.category || 'Other';
    const limit = Number(budget.target || 0);
    const spent =
      spendingBreakdown.find((row) => row.category === category)?.amount || 0;
    return {
      ...budget,
      category,
      limit,
      spent,
      pct: limit > 0 ? Math.round((spent / limit) * 100) : 0,
    };
  });

  const subscriptionCandidates = useMemo(() => {
    const merchants: Record<
      string,
      { merchant: string; count: number; total: number }
    > = {};
    data.transactions.forEach((item) => {
      const merchant = (item.merchant || '').trim();
      if (!merchant) return;
      const key = merchant.toLowerCase();
      const current = merchants[key] || { merchant, count: 0, total: 0 };
      current.count += 1;
      current.total += Number(item.amount || 0);
      merchants[key] = current;
    });
    const tracked = new Set(
      data.subscriptions.map((item) => String(item.title || '').toLowerCase()),
    );
    return Object.values(merchants)
      .filter(
        (item) => item.count >= 2 && !tracked.has(item.merchant.toLowerCase()),
      )
      .map((item) => ({
        ...item,
        average: Math.round((item.total / item.count) * 100) / 100,
      }))
      .sort((a, b) => b.count - a.count);
  }, [data.transactions, data.subscriptions]);

  const subscriptionMonthly = monthlySubscription(data.subscriptions);

  const upcomingEvents = useMemo(() => {
    const today = localDay();
    return [...data.events]
      .filter((item) => String(item.date || '') >= today)
      .sort((a, b) =>
        (String(a.date) + String(a.eventTime || '')).localeCompare(
          String(b.date) + String(b.eventTime || ''),
        ),
      )
      .slice(0, 8);
  }, [data.events]);

  const overdueInvoices = data.invoices.filter(
    (item) =>
      item.status !== 'Paid' &&
      item.dueDate &&
      new Date(item.dueDate + 'T23:59:59') < new Date(),
  );
  const invoiceOutstanding = data.invoices
    .filter((item) => item.status !== 'Paid')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const dailyIncomeTarget = Math.max(0, Math.ceil(-nextThirtyNet / 30));

  const debtOrder = useMemo(() => {
    return [...data.debts]
      .filter((item) => Number(item.balance || 0) > 0)
      .sort((a, b) =>
        debtStrategy === 'avalanche'
          ? Number(b.apr || 0) - Number(a.apr || 0)
          : Number(a.balance || 0) - Number(b.balance || 0),
      );
  }, [data.debts, debtStrategy]);

  const simulateDebt = (extra: number) =>
    debtSimulation(data.debts, extra, debtStrategy);

  const baselineDebt = simulateDebt(0);
  const selectedDebt = simulateDebt(Math.max(0, Number(extraDebtPayment || 0)));
  const debtFreeDate =
    selectedDebt.paidOff && selectedDebt.months
      ? new Date(
          new Date().setMonth(new Date().getMonth() + selectedDebt.months),
        ).toLocaleDateString('en-CA', { month: 'short', year: 'numeric' })
      : selectedDebt.paidOff
        ? 'No debt recorded'
        : 'Not reached within 50 years';

  const nyxFocus =
    overdueInvoices.length > 0
      ? 'Follow up on ' +
        overdueInvoices.length +
        ' overdue invoice' +
        (overdueInvoices.length > 1 ? 's' : '') +
        ' worth ' +
        money(
          overdueInvoices.reduce(
            (sum, item) => sum + Number(item.amount || 0),
            0,
          ),
        ) +
        '.'
      : budgetRows.some((row) => row.pct > 100)
        ? 'One or more budget categories are over target. Review the largest overage before spending more today.'
        : dailyIncomeTarget > 0
          ? 'Your 30-day forecast is short. Aim for at least ' +
            money(dailyIncomeTarget) +
            ' in extra income today.'
          : upcomingEvents.length > 0
            ? 'Your next scheduled item is ' +
              (upcomingEvents[0].title || 'an event') +
              ' on ' +
              upcomingEvents[0].date +
              '.'
            : data.cashflow.length
              ? 'Review your recorded cash flow and choose one goal to move forward.'
              : 'Add your next income and bills to build a useful plan.';

  if (checkingAuth || (user && profileLoading)) {
    return (
      <div className="boot-screen">
        <CyberWolf small />
        <p>Nyx is initializing Novyx 4.0…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <main className="login-shell">
        <div className="login-glow" />
        <section className="login-card">
          <div className="login-mascot">
            <CyberWolf />
          </div>
          <div className="brand-mark">
            <span>NOVYX</span>
          </div>
          <p className="kicker">GUIDED BY NYX</p>
          <h1>
            Your life.
            <br />
            <span>One command center.</span>
          </h1>
          <p className="lead">
            Nyx is your cyber-wolf intelligence for money, work, goals, clients,
            receipts, schedules and everyday decisions.
          </p>
          <div className="privacy-line">
            <ShieldCheck size={18} /> Your saved information is scoped to your
            signed-in account.
          </div>
          <button className="primary-btn wide" onClick={signIn}>
            <LockKeyhole size={18} /> Enter Novyx
          </button>
          {authError && <p className="form-error">{authError}</p>}
        </section>
      </main>
    );
  }

  if (!workspaceReady) {
    return (
      <main className="boot-screen">
        <h1>Novyx could not load your workspace</h1>
        <p role="alert">
          {workspaceNotice || 'Your saved data has not been loaded.'}
        </p>
        <button onClick={() => void loadDashboard()}>Retry loading</button>
        <button onClick={() => void signOut()}>Sign out</button>
      </main>
    );
  }

  if (!profile?.completed) {
    return (
      <NyxOnboarding
        initialName={profile?.name || user.name || ''}
        initialProfile={profile || undefined}
        saveError={connectionMessage}
        providers={connectionStatus}
        saving={savingProfile}
        onFinish={saveOnboarding}
      />
    );
  }

  const navItems: Array<{
    id: Tab;
    label: string;
    icon: typeof LayoutDashboard;
  }> = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'live', label: 'Nyx Live', icon: Sparkles },
    { id: 'quick', label: 'Quick Actions', icon: Zap },
    { id: 'assistant', label: 'Ask Nyx', icon: Sparkles },
    { id: 'money', label: 'Money', icon: CircleDollarSign },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'settings', label: 'More', icon: Settings },
    { id: 'connections', label: 'Banking & Email', icon: Link2 },
    { id: 'receipts', label: 'Receipts', icon: ScanLine },
    { id: 'debt', label: 'Debt', icon: CreditCard },
    { id: 'goals', label: 'Goals', icon: Target },
    { id: 'reports', label: 'Reports', icon: TrendingUp },
    { id: 'organize', label: 'Organize', icon: CheckCircle2 },
    { id: 'bills', label: 'Bills', icon: ReceiptText },
    { id: 'social', label: 'Social', icon: UsersRound },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mascot">
          <CyberWolf small />
          <div>
            <strong>
              NOVYX <em>4.0</em>
            </strong>
            <small>GUIDED BY NYX</small>
          </div>
        </div>
        <nav>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={tab === id ? 'nav-item active' : 'nav-item'}
              onClick={() => setTab(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-chip">
            <div className="avatar">
              {(user.name || 'J').charAt(0).toUpperCase()}
            </div>
            <div>
              <strong>{user.name || 'User'}</strong>
              <small>{user.email || 'Private account'}</small>
            </div>
          </div>
          <button
            className="icon-btn"
            onClick={() => void signOut()}
            title="Lock Novyx"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <main className="main-panel">
        {workspaceNotice && (
          <div className="nyx-workspace-notice" role="status">
            <span>{workspaceNotice}</span>
            <button onClick={() => void loadDashboard()}>Refresh</button>
            <button
              aria-label="Dismiss notice"
              onClick={() => setWorkspaceNotice('')}
            >
              ×
            </button>
          </div>
        )}

        <header className="topbar nx-topbar">
          <div className="nx-search-wrap">
            <Search size={18} />
            <input
              aria-label="Search your workspace"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search bills, goals, transactions, clients…"
            />
            {localSearch && (
              <div className="nx-search-results">
                {searchMatches.length ? (
                  searchMatches.map(({ item, section }) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setTab(section as Tab);
                        setSearchQuery('');
                      }}
                    >
                      {item.title ||
                        item.merchant ||
                        item.creditor ||
                        item.client ||
                        item.note ||
                        'Saved item'}{' '}
                      <small>{section}</small>
                    </button>
                  ))
                ) : (
                  <p>No matching saved records</p>
                )}
              </div>
            )}
          </div>
          <div className="nx-top-actions">
            <span className="secure-pill">
              <ShieldCheck size={15} /> Private workspace
            </span>
            <button
              title="Talk to Nyx"
              onClick={() => {
                setVoiceOpen(true);
                setTab('assistant');
              }}
            >
              <Mic2 size={18} />
            </button>
            <span className="nx-top-avatar">
              {(profile?.name || user.name || 'N').slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        <div className="nx-mobile-jump">
          <label>
            Explore Novyx{' '}
            <select
              value={tab}
              onChange={(event) => setTab(event.target.value as Tab)}
            >
              {navItems.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {tab === 'dashboard' && (
          <NyxDashboard
            name={profile?.name || user.name?.split(' ')[0] || ''}
            focus={nyxFocus}
            spending={monthlySpending}
            income={weekly.income}
            debt={data.summary.totalDebt}
            invoicesOwed={invoiceOutstanding}
            budgetRows={budgetRows}
            spendingRows={spendingBreakdown}
            upcoming={upcomingEvents}
            transactions={data.transactions}
            invoices={data.invoices}
            goals={data.goals}
            opportunities={data.income}
            subscriptions={data.subscriptions}
            inbox={data.inbox}
            checkedAt={lastChecked}
            onNavigate={(section) => setTab(section as Tab)}
            onAsk={(prompt, mode) =>
              void runNyx(prompt, (mode || 'Focus') as NyxMode)
            }
            onVoice={() => {
              setVoiceOpen(true);
              setTab('assistant');
            }}
            onRefresh={() => void loadDashboard()}
          />
        )}

        {tab === 'live' && (
          <NyxLive
            data={{
              events: data.events,
              invoices: data.invoices,
              income: data.income,
              goals: data.goals,
              budgetAlerts: budgetRows
                .filter((r) => r.pct > 100)
                .map((r) => ({
                  category: r.category,
                  overBy: Math.max(0, r.spent - r.limit),
                })),
            }}
            onOpen={(section) => setTab(section)}
            onRefresh={() => void loadDashboard()}
            checkedAt={lastChecked}
          />
        )}
        {tab === 'quick' && (
          <NyxQuickActions
            onAsk={(prompt) => void runNyx(prompt)}
            onNavigate={(section) => setTab(section)}
            onVoice={() => {
              setVoiceOpen(true);
              setTab('assistant');
            }}
          />
        )}
        {tab === 'money' && (
          <section className="view">
            <SectionHead
              title="Money"
              text="Budgets, income, transactions and subscriptions in one place."
            />
            <div className="money-score-grid">
              <Score
                label="This month spending"
                value={money(monthlySpending)}
                note="Tracked transactions"
              />
              <Score
                label="Budget total"
                value={money(data.summary.budgetTotal)}
                note={
                  budgetRows.filter((row) => row.pct > 100).length +
                  ' over target'
                }
                warning={budgetRows.some((row) => row.pct > 100)}
              />
              <Score
                label="Subscriptions"
                value={money(subscriptionMonthly)}
                note="Monthly equivalent"
              />
              <Score
                label="30-day recorded cash flow"
                value={money(nextThirtyNet)}
                note={
                  dailyIncomeTarget > 0
                    ? money(dailyIncomeTarget) + '/day shortfall'
                    : data.cashflow.length
                      ? 'Recorded income minus expenses'
                      : 'No cash flow recorded'
                }
                warning={nextThirtyNet < 0}
              />
            </div>

            <div className="content-grid">
              <Panel title="Budget Planner" icon={WalletCards}>
                <form
                  className="stack-form"
                  onSubmit={(event) =>
                    void submitSimple(
                      event,
                      'budgets',
                      {
                        category: budgetCategory,
                        target: Number(budgetAmount || 0),
                      },
                      () => setBudgetAmount(''),
                    )
                  }
                >
                  <select
                    value={budgetCategory}
                    onChange={(e) => setBudgetCategory(e.target.value)}
                  >
                    {spendingCategories.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                  <input
                    value={budgetAmount}
                    onChange={(e) => setBudgetAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="Monthly limit $"
                  />
                  <button className="primary-btn" type="submit">
                    <Plus size={16} /> Add budget
                  </button>
                </form>
                <div className="list">
                  {budgetRows.map((row) => (
                    <div className="budget-row" key={row.id}>
                      <div>
                        <strong>{row.category}</strong>
                        <span>
                          {money(row.spent)} spent of {money(row.limit)}
                        </span>
                        <Progress
                          value={Math.min(100, row.pct)}
                          danger={row.pct > 100}
                        />
                      </div>
                      <b className={row.pct > 100 ? 'cash-out' : ''}>
                        {row.pct}%
                      </b>
                      <button
                        className="danger-btn"
                        onClick={() => void deleteItem('budgets', row.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Subscription Detector" icon={ReceiptText}>
                <form
                  className="stack-form"
                  onSubmit={(event) =>
                    void submitSimple(
                      event,
                      'subscriptions',
                      {
                        title: subscriptionName.trim(),
                        amount: Number(subscriptionAmount || 0),
                        cadence: subscriptionCadence,
                        status: 'Active',
                      },
                      () => {
                        setSubscriptionName('');
                        setSubscriptionAmount('');
                      },
                    )
                  }
                >
                  <input
                    value={subscriptionName}
                    onChange={(e) => setSubscriptionName(e.target.value)}
                    placeholder="Subscription name"
                  />
                  <div className="two-fields">
                    <input
                      value={subscriptionAmount}
                      onChange={(e) => setSubscriptionAmount(e.target.value)}
                      inputMode="decimal"
                      placeholder="Amount"
                    />
                    <select
                      value={subscriptionCadence}
                      onChange={(e) =>
                        setSubscriptionCadence(
                          e.target.value as 'weekly' | 'monthly',
                        )
                      }
                    >
                      <option value="monthly">Monthly</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                  <button className="secondary-btn" type="submit">
                    <Plus size={16} /> Track subscription
                  </button>
                </form>
                {data.subscriptions.map((item) => (
                  <div className="subscription-row" key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <span>
                        {money(Number(item.amount || 0))} ·{' '}
                        {item.cadence || 'monthly'}
                      </span>
                    </div>
                    <button
                      className={
                        item.status === 'Cancelled'
                          ? 'status-paid'
                          : 'status-unpaid'
                      }
                      onClick={() =>
                        void updateItem('subscriptions', item.id, {
                          status:
                            item.status === 'Cancelled'
                              ? 'Active'
                              : 'Cancelled',
                        })
                      }
                    >
                      {item.status === 'Cancelled' ? 'Cancelled' : 'Active'}
                    </button>
                    <button
                      className="danger-btn"
                      onClick={() => void deleteItem('subscriptions', item.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                {subscriptionCandidates.slice(0, 4).map((candidate) => (
                  <div className="detected-card" key={candidate.merchant}>
                    <div>
                      <span>POSSIBLE RECURRING</span>
                      <strong>{candidate.merchant}</strong>
                      <small>
                        {candidate.count} charges · avg{' '}
                        {money(candidate.average)}
                      </small>
                    </div>
                    <button
                      className="text-btn"
                      onClick={() =>
                        void addItem('subscriptions', {
                          title: candidate.merchant,
                          amount: candidate.average,
                          cadence: 'monthly',
                          status: 'Active',
                        })
                      }
                    >
                      Track
                    </button>
                  </div>
                ))}
              </Panel>
            </div>

            <div className="content-grid">
              <Panel title="Opportunity Pipeline" icon={BriefcaseBusiness}>
                <form
                  className="money-form"
                  onSubmit={(event) =>
                    void submitSimple(
                      event,
                      'income',
                      {
                        title: opportunityTitle.trim(),
                        expected: Number(opportunityAmount || 0),
                        status: 'Lead',
                      },
                      () => {
                        setOpportunityTitle('');
                        setOpportunityAmount('');
                      },
                    )
                  }
                >
                  <input
                    value={opportunityTitle}
                    onChange={(e) => setOpportunityTitle(e.target.value)}
                    placeholder="Job, client, gig or sale"
                  />
                  <input
                    value={opportunityAmount}
                    onChange={(e) => setOpportunityAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="Expected $"
                  />
                  <button className="primary-btn" type="submit">
                    <Plus size={16} /> Track
                  </button>
                </form>
                {data.income.map((item) => (
                  <div className="opportunity-row" key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{money(Number(item.expected || 0))}</span>
                    </div>
                    <select
                      value={(item.status || 'Lead') as OpportunityStatus}
                      onChange={(e) =>
                        void updateItem('income', item.id, {
                          status: e.target.value,
                        })
                      }
                    >
                      <option>Lead</option>
                      <option>Contacted</option>
                      <option>Booked</option>
                      <option>Paid</option>
                    </select>
                    <button
                      className="danger-btn"
                      onClick={() => void deleteItem('income', item.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </Panel>

              <Panel title="Transactions" icon={Landmark}>
                <form className="stack-form" onSubmit={submitTransaction}>
                  <input
                    value={transactionMerchant}
                    onChange={(e) => setTransactionMerchant(e.target.value)}
                    placeholder="Merchant"
                  />
                  <div className="two-fields">
                    <input
                      value={transactionAmount}
                      onChange={(e) => setTransactionAmount(e.target.value)}
                      inputMode="decimal"
                      placeholder="Amount"
                    />
                    <input
                      value={transactionDate}
                      onChange={(e) => setTransactionDate(e.target.value)}
                      type="date"
                    />
                  </div>
                  <select
                    value={transactionCategory}
                    onChange={(e) => setTransactionCategory(e.target.value)}
                  >
                    {spendingCategories.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                  <button className="secondary-btn" type="submit">
                    <Plus size={16} /> Add transaction
                  </button>
                </form>
                {data.transactions.slice(0, 8).map((item) => (
                  <div className="transaction-row" key={item.id}>
                    <div>
                      <strong>{item.merchant}</strong>
                      <span>
                        {item.transactionDate} ·{' '}
                        {item.transactionCategory || 'Other'}
                      </span>
                    </div>
                    <b>{money(Number(item.amount || 0))}</b>
                    <button
                      className="danger-btn"
                      onClick={() => void deleteItem('transactions', item.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </Panel>
            </div>
          </section>
        )}

        {tab === 'connections' && (
          <section className="view">
            <SectionHead
              title="Connections"
              text="Read-only data connections give Nyx more context without permission to move money or send messages."
            />
            <NyxConnections />
            <div className="connection-grid three">
              <ConnectionCard
                icon={Mail}
                title="Gmail"
                subtitle="Bills, receipts and reminders"
                ready={connectionStatus.gmailConfigured}
                onClick={() => showProviderSetup('gmail')}
              />
              <ConnectionCard
                icon={Landmark}
                title="Bank accounts"
                subtitle="Transactions and balances"
                ready={connectionStatus.bankConfigured}
                onClick={() => showProviderSetup('bank')}
              />
              <ConnectionCard
                icon={CalendarDays}
                title="Google Calendar"
                subtitle="Schedule context"
                ready={connectionStatus.calendarConfigured}
                onClick={() => showProviderSetup('calendar')}
              />
            </div>
            {connectionMessage && (
              <div className="connection-note">
                <ShieldCheck size={17} />
                <span>{connectionMessage}</span>
              </div>
            )}
            <div className="content-grid">
              <Panel title="Spending Breakdown" icon={CircleDollarSign}>
                <div className="spending-total">
                  <span>This month</span>
                  <strong>{money(monthlySpending)}</strong>
                  <small>
                    {monthlyTransactions.length} tracked transactions
                  </small>
                </div>
                <div className="spending-bars">
                  {spendingBreakdown.map((row) => {
                    const pct =
                      monthlySpending > 0
                        ? Math.round((row.amount / monthlySpending) * 100)
                        : 0;
                    return (
                      <div className="spending-row" key={row.category}>
                        <div>
                          <strong>{row.category}</strong>
                          <span>{pct}%</span>
                        </div>
                        <Progress value={pct} />
                        <b>{money(row.amount)}</b>
                      </div>
                    );
                  })}
                </div>
              </Panel>
              <Panel title="Email Intelligence" icon={Inbox}>
                <Metric
                  label="Captured messages"
                  value={String(data.inbox.length)}
                />
                <p className="connection-copy">
                  Until Gmail OAuth is activated, Nyx can still analyze messages
                  you manually capture in Organize.
                </p>
                <button
                  className="text-btn"
                  onClick={() =>
                    void runNyx(
                      'Review my captured inbox for bills, receipts, deadlines and messages that need a reply.',
                      'Inbox',
                    )
                  }
                >
                  Ask Nyx to review inbox →
                </button>
              </Panel>
            </div>
          </section>
        )}

        {tab === 'calendar' && (
          <section className="view">
            <SectionHead
              title="Calendar"
              text="Keep work, classes, interviews, bills and personal commitments in Nyx’s planning context."
            />
            <div className="content-grid">
              <Panel title="Add Event" icon={CalendarDays}>
                <form
                  className="stack-form"
                  onSubmit={(event) =>
                    void submitSimple(
                      event,
                      'events',
                      {
                        title: eventTitle.trim(),
                        date: eventDate,
                        eventTime,
                        eventType,
                      },
                      () => {
                        setEventTitle('');
                        setEventDate('');
                        setEventTime('');
                      },
                    )
                  }
                >
                  <input
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    placeholder="Event title"
                  />
                  <div className="two-fields">
                    <input
                      type="date"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                    />
                    <input
                      type="time"
                      value={eventTime}
                      onChange={(e) => setEventTime(e.target.value)}
                    />
                  </div>
                  <select
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value)}
                  >
                    <option>Personal</option>
                    <option>Work</option>
                    <option>Class</option>
                    <option>Client</option>
                    <option>Interview</option>
                    <option>Bill</option>
                  </select>
                  <button className="primary-btn" type="submit">
                    <Plus size={16} /> Add event
                  </button>
                </form>
              </Panel>
              <Panel title="Upcoming" icon={CalendarDays}>
                {upcomingEvents.map((item) => (
                  <div className="event-row" key={item.id}>
                    <div className="date-badge">
                      <strong>{String(item.date || '').slice(8, 10)}</strong>
                      <span>{formatMonth(item.date)}</span>
                    </div>
                    <div>
                      <strong>{item.title}</strong>
                      <span>
                        {item.eventTime || 'All day'} ·{' '}
                        {item.eventType || 'Event'}
                      </span>
                    </div>
                    <button
                      className="danger-btn"
                      onClick={() => void deleteItem('events', item.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                {upcomingEvents.length === 0 && (
                  <Empty text="Nothing scheduled yet." />
                )}
              </Panel>
            </div>
            <Panel title="Calendar Connection" icon={Link2}>
              <p className="connection-copy">
                Your Novyx calendar works immediately. Google Calendar
                synchronization is integration-ready but requires Google OAuth
                credentials and your consent before it can activate.
              </p>
              <button
                className="secondary-btn"
                onClick={() => showProviderSetup('calendar')}
              >
                Check Google Calendar setup
              </button>
            </Panel>
          </section>
        )}

        {tab === 'receipts' && (
          <section className="view">
            <SectionHead
              title="Receipt Scanner"
              text="Photograph a receipt and Nyx will extract the merchant, total, date and spending category."
            />
            <div className="content-grid">
              <Panel title="Scan Receipt" icon={ScanLine}>
                <label className="upload-box">
                  <ScanLine size={30} />
                  <strong>
                    {receiptScanning
                      ? 'Nyx is reading the receipt…'
                      : 'Choose or photograph a receipt'}
                  </strong>
                  <span>
                    JPG, PNG or WEBP. Images are resized before AI analysis.
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => void scanReceipt(e.target.files?.[0])}
                    disabled={receiptScanning}
                  />
                </label>
                {receiptError && <p className="form-error">{receiptError}</p>}
              </Panel>
              <Panel title="Extracted Details" icon={ReceiptText}>
                {receiptResult ? (
                  <div className="receipt-result">
                    <Metric
                      label="Merchant"
                      value={receiptResult.merchant || 'Unknown'}
                    />
                    <Metric
                      label="Total"
                      value={money(Number(receiptResult.total || 0))}
                    />
                    <Metric
                      label="Date"
                      value={receiptResult.date || 'Not found'}
                    />
                    <Metric
                      label="Category"
                      value={receiptResult.category || 'Other'}
                    />
                    <button
                      className="primary-btn wide"
                      disabled={receiptSaving}
                      onClick={() => void saveScannedReceipt()}
                    >
                      Save receipt & transaction
                    </button>
                  </div>
                ) : (
                  <Empty text="Scanned receipt details will appear here before you save them." />
                )}
              </Panel>
            </div>
            <Panel title="Receipt History" icon={ReceiptText}>
              {data.receipts.map((item) => (
                <div className="transaction-row" key={item.id}>
                  <div>
                    <strong>{item.merchant}</strong>
                    <span>
                      {item.transactionDate} ·{' '}
                      {item.transactionCategory || 'Other'}
                    </span>
                  </div>
                  <b>{money(Number(item.amount || 0))}</b>
                  <button
                    className="danger-btn"
                    onClick={() => void deleteItem('receipts', item.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              {data.receipts.length === 0 && (
                <Empty text="No receipts saved yet." />
              )}
            </Panel>
          </section>
        )}

        {tab === 'debt' && (
          <section className="view">
            <SectionHead
              title="Debt Attack Center"
              text="Compare payoff strategies and see how extra payments change your debt-free date."
            />
            <div className="debt-strategy-panel">
              <div>
                <p className="kicker">NYX PAYOFF SIMULATOR</p>
                <h4>
                  {debtStrategy === 'avalanche'
                    ? 'Avalanche: highest APR first'
                    : 'Snowball: smallest balance first'}
                </h4>
                <p>
                  {debtStrategy === 'avalanche'
                    ? 'Usually saves more interest.'
                    : 'Creates faster account wins.'}
                </p>
              </div>
              <div className="strategy-controls">
                <select
                  value={debtStrategy}
                  onChange={(e) =>
                    setDebtStrategy(e.target.value as 'avalanche' | 'snowball')
                  }
                >
                  <option value="avalanche">Debt avalanche</option>
                  <option value="snowball">Debt snowball</option>
                </select>
                <label>
                  Extra monthly: {money(Number(extraDebtPayment || 0))}
                  <input
                    type="range"
                    min="0"
                    max="1000"
                    step="25"
                    value={extraDebtPayment}
                    onChange={(e) => setExtraDebtPayment(e.target.value)}
                  />
                </label>
              </div>
            </div>
            <div className="payoff-strip">
              <Metric
                label="Debt total"
                value={money(data.summary.totalDebt)}
              />
              <Metric
                label="Estimated payoff"
                value={
                  selectedDebt.paidOff
                    ? selectedDebt.months
                      ? selectedDebt.months + ' months'
                      : 'No debt recorded'
                    : 'Not paid off within 50 years'
                }
              />
              <Metric label="Debt-free target" value={debtFreeDate} />
              <Metric
                label="Est. interest saved"
                value={
                  baselineDebt.paidOff && selectedDebt.paidOff
                    ? money(
                        Math.max(
                          0,
                          baselineDebt.interest - selectedDebt.interest,
                        ),
                      )
                    : 'Not comparable'
                }
                good
              />
            </div>
            <p className="fine-print">
              Estimates assume monthly interest, no new borrowing or fees, and a
              fixed total monthly payment with freed payments rolled into
              remaining debts. Actual lender calculations may differ.
            </p>
            <Panel title="Add Debt" icon={CreditCard}>
              <form
                className="debt-form"
                onSubmit={(event) =>
                  void submitSimple(
                    event,
                    'debts',
                    {
                      creditor: creditor.trim(),
                      balance: Number(balance || 0),
                      minPayment: Number(minPayment || 0),
                      apr: Number(apr || 0),
                    },
                    () => {
                      setCreditor('');
                      setBalance('');
                      setMinPayment('');
                      setApr('');
                    },
                  )
                }
              >
                <input
                  value={creditor}
                  onChange={(e) => setCreditor(e.target.value)}
                  placeholder="Creditor"
                />
                <input
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  placeholder="Balance"
                  inputMode="decimal"
                />
                <input
                  value={minPayment}
                  onChange={(e) => setMinPayment(e.target.value)}
                  placeholder="Minimum"
                  inputMode="decimal"
                />
                <input
                  value={apr}
                  onChange={(e) => setApr(e.target.value)}
                  placeholder="APR %"
                  inputMode="decimal"
                />
                <button className="primary-btn" type="submit">
                  <Plus size={16} /> Add
                </button>
              </form>
            </Panel>
            <div className="debt-list">
              {debtOrder.map((item, index) => (
                <div className="debt-card" key={item.id}>
                  <div className="target-rank">#{index + 1}</div>
                  <div>
                    <span>ACCOUNT</span>
                    <h4>{item.creditor}</h4>
                  </div>
                  <div>
                    <span>BALANCE</span>
                    <strong>{money(Number(item.balance || 0))}</strong>
                  </div>
                  <div>
                    <span>MINIMUM</span>
                    <strong>{money(Number(item.minPayment || 0))}</strong>
                  </div>
                  <div>
                    <span>APR</span>
                    <strong>{Number(item.apr || 0)}%</strong>
                  </div>
                  <button
                    className="danger-btn"
                    onClick={() => void deleteItem('debts', item.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'goals' && (
          <section className="view">
            <SectionHead
              title="Goals"
              text="Give Nyx a target and deadline so progress can be translated into a realistic pace."
            />
            <Panel title="Create Goal" icon={Target}>
              <form
                className="goal-form"
                onSubmit={(event) =>
                  void submitSimple(
                    event,
                    'goals',
                    {
                      title: goalTitle.trim(),
                      target: Number(goalTarget || 0),
                      current: Number(goalCurrent || 0),
                      goalType,
                      dueDate: goalDueDate,
                    },
                    () => {
                      setGoalTitle('');
                      setGoalTarget('');
                      setGoalCurrent('');
                      setGoalDueDate('');
                    },
                  )
                }
              >
                <input
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                  placeholder="Goal name"
                />
                <select
                  value={goalType}
                  onChange={(e) =>
                    setGoalType(
                      e.target.value as
                        'income' | 'savings' | 'purchase' | 'other',
                    )
                  }
                >
                  <option value="income">Income</option>
                  <option value="savings">Savings</option>
                  <option value="purchase">Purchase</option>
                  <option value="other">Other</option>
                </select>
                <input
                  value={goalTarget}
                  onChange={(e) => setGoalTarget(e.target.value)}
                  placeholder="Target $"
                  inputMode="decimal"
                />
                <input
                  value={goalCurrent}
                  onChange={(e) => setGoalCurrent(e.target.value)}
                  placeholder="Current $"
                  inputMode="decimal"
                />
                <input
                  value={goalDueDate}
                  onChange={(e) => setGoalDueDate(e.target.value)}
                  type="date"
                />
                <button className="primary-btn" type="submit">
                  <Plus size={16} /> Add
                </button>
              </form>
            </Panel>
            <div className="goal-grid">
              {data.goals.map((goal) => {
                const target = Math.max(1, Number(goal.target || 0));
                const current = Math.max(0, Number(goal.current || 0));
                const pct = Math.min(100, Math.round((current / target) * 100));
                const days = goal.dueDate
                  ? Math.max(
                      1,
                      Math.ceil(
                        (new Date(goal.dueDate).getTime() - Date.now()) /
                          86400000,
                      ),
                    )
                  : 0;
                const pace = days
                  ? Math.max(0, target - current) /
                    Math.max(1, Math.ceil(days / 7))
                  : 0;
                return (
                  <div className="goal-card" key={goal.id}>
                    <div className="goal-card-head">
                      <div>
                        <span>{goal.goalType}</span>
                        <h4>{goal.title}</h4>
                      </div>
                      <button
                        className="danger-btn"
                        onClick={() => void deleteItem('goals', goal.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <strong>
                      {money(current)} <small>/ {money(target)}</small>
                    </strong>
                    <Progress value={pct} />
                    <div className="goal-math">
                      <span>
                        <b>{pct}%</b>complete
                      </span>
                      <span>
                        <b>{goal.dueDate || 'No deadline'}</b>deadline
                      </span>
                      {days > 0 && (
                        <span>
                          <b>{money(Math.ceil(pace))}</b>needed / week
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tab === 'bills' && (
          <section className="view">
            <SectionHead
              title="Bills & Clients"
              text="Track cash commitments, clients and invoices that deserve a follow-up."
            />
            <div className="content-grid">
              <Panel title="Clients" icon={UsersRound}>
                <form
                  className="stack-form"
                  onSubmit={(event) =>
                    void submitSimple(
                      event,
                      'clients',
                      {
                        client: clientName.trim(),
                        email: clientEmail.trim(),
                        note: clientNote.trim(),
                      },
                      () => {
                        setClientName('');
                        setClientEmail('');
                        setClientNote('');
                      },
                    )
                  }
                >
                  <input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Client / company"
                  />
                  <input
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="Email (optional)"
                  />
                  <input
                    value={clientNote}
                    onChange={(e) => setClientNote(e.target.value)}
                    placeholder="Notes"
                  />
                  <button className="secondary-btn" type="submit">
                    <Plus size={16} /> Add client
                  </button>
                </form>
                {data.clients.map((item) => (
                  <div className="client-row" key={item.id}>
                    <div>
                      <strong>{item.client}</strong>
                      <span>{item.email || item.note || 'No details'}</span>
                    </div>
                    <button
                      className="danger-btn"
                      onClick={() => void deleteItem('clients', item.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </Panel>
              <Panel title="Invoice Tracker" icon={FileText}>
                <form
                  className="stack-form"
                  onSubmit={(event) =>
                    void submitSimple(
                      event,
                      'invoices',
                      {
                        client: invoiceClient.trim(),
                        amount: Number(invoiceAmount || 0),
                        dueDate: invoiceDueDate,
                        status: 'Unpaid',
                      },
                      () => {
                        setInvoiceClient('');
                        setInvoiceAmount('');
                        setInvoiceDueDate('');
                      },
                    )
                  }
                >
                  <select
                    value={invoiceClient}
                    onChange={(e) => setInvoiceClient(e.target.value)}
                  >
                    <option value="">Select or add client</option>
                    {data.clients.map((item) => (
                      <option key={item.id} value={item.client}>
                        {item.client}
                      </option>
                    ))}
                  </select>
                  {!data.clients.length && (
                    <input
                      value={invoiceClient}
                      onChange={(e) => setInvoiceClient(e.target.value)}
                      placeholder="Client name"
                    />
                  )}
                  <div className="two-fields">
                    <input
                      value={invoiceAmount}
                      onChange={(e) => setInvoiceAmount(e.target.value)}
                      placeholder="Amount"
                      inputMode="decimal"
                    />
                    <input
                      type="date"
                      value={invoiceDueDate}
                      onChange={(e) => setInvoiceDueDate(e.target.value)}
                    />
                  </div>
                  <button className="primary-btn" type="submit">
                    <Plus size={16} /> Add invoice
                  </button>
                </form>
                {data.invoices.map((item) => (
                  <div className="invoice-row" key={item.id}>
                    <div>
                      <strong>{item.client}</strong>
                      <span>
                        Due {item.dueDate} · {money(Number(item.amount || 0))}
                      </span>
                    </div>
                    <button
                      className={
                        item.status === 'Paid' ? 'status-paid' : 'status-unpaid'
                      }
                      onClick={() =>
                        void updateItem('invoices', item.id, {
                          status: item.status === 'Paid' ? 'Unpaid' : 'Paid',
                        })
                      }
                    >
                      {item.status === 'Paid' ? 'Paid' : 'Mark paid'}
                    </button>
                    <button
                      className="danger-btn"
                      onClick={() => void deleteItem('invoices', item.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <button
                  className="text-btn"
                  onClick={() =>
                    void runNyx(
                      'Draft concise follow-up advice for my unpaid and overdue invoices.',
                      'Clients',
                    )
                  }
                >
                  Nyx follow-up plan →
                </button>
              </Panel>
            </div>
            <Panel title="30-Day Cash Flow" icon={CalendarDays}>
              <form
                className="cashflow-form"
                onSubmit={(event) =>
                  void submitSimple(
                    event,
                    'cashflow',
                    {
                      title: flowTitle.trim(),
                      amount: Number(flowAmount || 0),
                      flowType,
                      date: flowDate,
                      recurring: flowRecurring,
                      cadence: flowRecurring ? flowCadence : undefined,
                    },
                    () => {
                      setFlowTitle('');
                      setFlowAmount('');
                      setFlowDate('');
                      setFlowRecurring(false);
                    },
                  )
                }
              >
                <input
                  value={flowTitle}
                  onChange={(e) => setFlowTitle(e.target.value)}
                  placeholder="Payday, rent, phone bill…"
                />
                <div className="cashflow-fields">
                  <select
                    value={flowType}
                    onChange={(e) =>
                      setFlowType(e.target.value as 'income' | 'expense')
                    }
                  >
                    <option value="income">Income</option>
                    <option value="expense">Expense</option>
                  </select>
                  <input
                    value={flowAmount}
                    onChange={(e) => setFlowAmount(e.target.value)}
                    placeholder="Amount"
                    inputMode="decimal"
                  />
                  <input
                    type="date"
                    value={flowDate}
                    onChange={(e) => setFlowDate(e.target.value)}
                  />
                </div>
                <div className="recurring-row">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={flowRecurring}
                      onChange={(e) => setFlowRecurring(e.target.checked)}
                    />{' '}
                    Recurring
                  </label>
                  {flowRecurring && (
                    <select
                      value={flowCadence}
                      onChange={(e) =>
                        setFlowCadence(
                          e.target.value as 'weekly' | 'biweekly' | 'monthly',
                        )
                      }
                    >
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Every 2 weeks</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  )}
                </div>
                <button className="secondary-btn" type="submit">
                  <Plus size={16} /> Add forecast item
                </button>
              </form>
            </Panel>
          </section>
        )}

        {tab === 'reports' && (
          <section className="view">
            <SectionHead
              title="Reports"
              text="Turn your week into numbers, patterns and next actions instead of vague guilt."
            />
            <div className="money-score-grid">
              <Score
                label="Weekly income"
                value={money(weekly.income)}
                note="Tracked cash flow"
              />
              <Score
                label="Weekly expenses"
                value={money(weekly.expenses)}
                note="Tracked cash flow"
              />
              <Score
                label="Weekly net"
                value={money(weekly.net)}
                note={weekly.net >= 0 ? 'Positive' : 'Negative'}
                warning={weekly.net < 0}
              />
              <Score
                label="Debt"
                value={money(data.summary.totalDebt)}
                note={data.debts.length + ' accounts'}
              />
            </div>
            <div className="content-grid">
              <Panel title="Spending Categories" icon={CircleDollarSign}>
                {spendingBreakdown.map((row) => (
                  <div className="compact-row" key={row.category}>
                    <span>{row.category}</span>
                    <b>{money(row.amount)}</b>
                  </div>
                ))}
                {!spendingBreakdown.length && (
                  <Empty text="No spending data this month." />
                )}
              </Panel>
              <Panel title="Export & Backup" icon={Download}>
                <p className="connection-copy">
                  Export your data whenever you want. Backups are JSON;
                  transaction reports are CSV.
                </p>
                <div className="button-stack">
                  <button
                    className="primary-btn"
                    disabled={backupBusy}
                    onClick={() => void exportBackup()}
                  >
                    <Download size={16} /> Download backup
                  </button>
                  <button
                    className="secondary-btn"
                    onClick={exportTransactionsCsv}
                  >
                    <Download size={16} /> Export transactions CSV
                  </button>
                  <button
                    className="text-btn"
                    onClick={() =>
                      void runNyx(
                        'Give me my weekly report with spending, budgets, debt, income, subscriptions, invoices, goals and next actions.',
                        'Reports',
                      )
                    }
                  >
                    Generate Nyx Report →
                  </button>
                </div>
              </Panel>
            </div>
          </section>
        )}

        {tab === 'organize' && (
          <section className="view">
            <SectionHead
              title="Organize"
              text="Capture tasks and messages before they vanish into the tiny black hole humans call an inbox."
            />
            <div className="content-grid">
              <Panel title="Tasks" icon={CheckCircle2}>
                <form
                  className="inline-form"
                  onSubmit={(event) =>
                    void submitSimple(
                      event,
                      'tasks',
                      { title: taskTitle.trim(), done: false },
                      () => setTaskTitle(''),
                    )
                  }
                >
                  <input
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="What needs to get done?"
                  />
                  <button className="primary-btn" type="submit">
                    <Plus size={16} /> Add
                  </button>
                </form>
                {data.tasks.map((item) => (
                  <div
                    className={item.done ? 'list-row done' : 'list-row'}
                    key={item.id}
                  >
                    <button
                      className="row-main"
                      onClick={() =>
                        void updateItem('tasks', item.id, { done: !item.done })
                      }
                    >
                      <span className="check-dot" />
                      {item.title}
                    </button>
                    <button
                      className="danger-btn"
                      onClick={() => void deleteItem('tasks', item.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </Panel>
              <Panel title="Inbox Intelligence" icon={Inbox}>
                <form
                  className="stack-form"
                  onSubmit={(event) =>
                    void submitSimple(
                      event,
                      'inbox',
                      {
                        source: inboxSource,
                        summary: inboxSummary.trim(),
                        priority: 'Normal',
                      },
                      () => setInboxSummary(''),
                    )
                  }
                >
                  <select
                    value={inboxSource}
                    onChange={(e) => setInboxSource(e.target.value)}
                  >
                    <option>Email</option>
                    <option>Text / iMessage</option>
                    <option>WhatsApp</option>
                    <option>Social DM</option>
                    <option>Other</option>
                  </select>
                  <textarea
                    value={inboxSummary}
                    onChange={(e) => setInboxSummary(e.target.value)}
                    placeholder="Paste or summarize an important message…"
                    rows={4}
                  />
                  <button className="secondary-btn" type="submit">
                    <Plus size={16} /> Capture
                  </button>
                </form>
                {data.inbox.map((item) => (
                  <div className="message-row" key={item.id}>
                    <span className="source-pill">{item.source}</span>
                    <p>{item.summary}</p>
                    <button
                      className="danger-btn"
                      onClick={() => void deleteItem('inbox', item.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </Panel>
            </div>
          </section>
        )}

        {tab === 'social' && (
          <section className="view">
            <SectionHead
              title="People & Plans"
              text="Keep social commitments and follow-ups visible."
            />
            <Panel title="Social Notes" icon={UsersRound}>
              <form
                className="inline-form"
                onSubmit={(event) =>
                  void submitSimple(
                    event,
                    'social',
                    { note: socialNote.trim() },
                    () => setSocialNote(''),
                  )
                }
              >
                <input
                  value={socialNote}
                  onChange={(e) => setSocialNote(e.target.value)}
                  placeholder="Dinner Friday, call someone back, birthday plan…"
                />
                <button className="primary-btn" type="submit">
                  <Plus size={16} /> Save
                </button>
              </form>
              <div className="social-grid">
                {data.social.map((item) => (
                  <div className="social-card" key={item.id}>
                    <MessageSquareText size={18} />
                    <p>{item.note}</p>
                    <button
                      className="danger-btn"
                      onClick={() => void deleteItem('social', item.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          </section>
        )}

        {tab === 'assistant' && (
          <section className="view assistant-view">
            <SectionHead
              title="Ask Nyx"
              text="Switch Nyx into the mode that matches what you need."
            />
            <div className="assistant-card">
              <div className="assistant-identity">
                <CyberWolf small />
                <div>
                  <strong>NYX LIVE</strong>
                  <span>
                    Tap to talk or message your assistant. Microphone works only
                    when requested.
                  </span>
                </div>
              </div>
              <NyxVoice
                onAsk={(text) => void runNyx(text)}
                reply={assistantReply}
                preferVoice={voiceOpen || profile.communication === 'voice'}
                onKeyboard={() => setVoiceOpen(false)}
              />
              <button
                className="nx-hide-voice"
                onClick={() => setVoiceOpen((v) => !v)}
              >
                {voiceOpen ? 'Stop voice-first mode' : 'Prefer voice responses'}
              </button>
              <div className="mode-tabs">
                {(
                  [
                    'Focus',
                    'Money',
                    'Inbox',
                    'Clients',
                    'Goals',
                    'Reports',
                  ] as NyxMode[]
                ).map((mode) => (
                  <button
                    key={mode}
                    className={
                      nyxMode === mode ? 'mode-chip active' : 'mode-chip'
                    }
                    onClick={() => setNyxMode(mode)}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <div className="assistant-shortcuts">
                <button
                  onClick={() =>
                    void runNyx('Build my plan for today.', 'Focus')
                  }
                >
                  Build my day
                </button>
                <button
                  onClick={() =>
                    void runNyx(
                      'Analyze my spending, budgets and subscriptions.',
                      'Money',
                    )
                  }
                >
                  Analyze spending
                </button>
                <button
                  onClick={() =>
                    void runNyx('What inbox items need action?', 'Inbox')
                  }
                >
                  Review inbox
                </button>
                <button
                  onClick={() =>
                    void runNyx(
                      'Which client or invoice should I follow up on?',
                      'Clients',
                    )
                  }
                >
                  Review clients
                </button>
                <button
                  onClick={() =>
                    void runNyx('Which goal needs attention most?', 'Goals')
                  }
                >
                  Review goals
                </button>
                <button
                  onClick={() =>
                    void runNyx('Give me my weekly report.', 'Reports')
                  }
                >
                  Weekly report
                </button>
              </div>
              <NyxPlanner />
              <NyxInsights />
              <NyxMemory />
              <NyxActions actions={actions} />
              {conversation.length > 2 && (
                <details className="nyx-conversation">
                  <summary>Earlier in this conversation</summary>
                  {conversation.slice(0, -2).map((message, index) => (
                    <p key={index}>
                      <strong>
                        {message.role === 'user' ? 'You' : 'Nyx'}:
                      </strong>{' '}
                      {message.content}
                    </p>
                  ))}
                </details>
              )}
              <button
                className="text-btn"
                disabled={assistantLoading}
                onClick={() => {
                  setConversation([]);
                  setActions([]);
                  setAssistantReply('');
                }}
              >
                New conversation
              </button>
              <p className="fine-print">
                Conversation context lasts for this signed-in session. Only
                preferences you explicitly save in Nyx Memory are retained
                separately.
              </p>
              <div className="assistant-output">
                {assistantReply ? (
                  <p>{assistantReply}</p>
                ) : (
                  <p className="muted">
                    Nyx is in {nyxMode} mode. Ask for the next move, not a
                    motivational poster.
                  </p>
                )}
              </div>
              <form className="command-bar" onSubmit={askNyx}>
                <input
                  value={assistantInput}
                  onChange={(e) => setAssistantInput(e.target.value)}
                  placeholder={'Ask Nyx in ' + nyxMode + ' mode…'}
                />
                <button
                  className="primary-btn"
                  type="submit"
                  disabled={assistantLoading}
                >
                  <Send size={16} />
                  {assistantLoading ? 'Thinking…' : 'Ask Nyx'}
                </button>
              </form>
            </div>
          </section>
        )}

        {tab === 'settings' && (
          <section className="view">
            <SectionHead
              title="Settings & Privacy"
              text="Profile, account consent, reminders, data export and personal preferences."
            />
            <Panel title="Profile & getting started" icon={ShieldCheck}>
              <div className="nx-profile-grid">
                <p>
                  <strong>Name:</strong> {profile.name}
                </p>
                <p>
                  <strong>Communication:</strong> {profile.communication}
                </p>
                <p>
                  <strong>Birthday:</strong>{' '}
                  {profile.birthDate || 'Not provided'}
                </p>
              </div>
              <button
                className="secondary-btn"
                onClick={() => setProfile({ ...profile, completed: false })}
              >
                Repeat first-time setup / update profile
              </button>
              <p className="fine-print">
                You can import a JSON backup exported from Novyx 2.0 using
                Restore Backup below. Data is not migrated automatically.
              </p>
            </Panel>
            <div className="content-grid">
              <Panel title="Notifications" icon={Bell}>
                <p className="connection-copy">
                  Enable Novyx push notifications on this device. Daily and
                  weekly topic reminders are opt-in.
                </p>
                <div className="button-stack">
                  <button
                    className="primary-btn"
                    onClick={() => void enableNotifications()}
                  >
                    <Bell size={16} /> Enable notifications
                  </button>
                  <button
                    className="secondary-btn"
                    onClick={() => void sendTestNotification()}
                  >
                    Send test
                  </button>
                  <button
                    className="text-btn"
                    onClick={() => void disableNotifications()}
                  >
                    Disable on this device
                  </button>
                </div>
                <p className="status-copy">{notificationStatus}</p>
              </Panel>
              <Panel title="Security" icon={ShieldCheck}>
                <label className="field-label">
                  Auto-lock after inactivity
                  <select
                    value={sessionTimeout}
                    onChange={(e) => saveSessionTimeout(Number(e.target.value))}
                  >
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={60}>1 hour</option>
                    <option value={0}>Never on this device</option>
                  </select>
                </label>
                <button
                  className="secondary-btn wide"
                  onClick={() => void signOut()}
                >
                  <LockKeyhole size={16} /> Lock Novyx now
                </button>
                <p className="fine-print">
                  Biometric locking is not enabled in this web build; it
                  requires supported platform/native authentication. Your server
                  data remains protected by sign-in.
                </p>
              </Panel>
            </div>
            <div className="content-grid">
              <Panel title="Restore Backup" icon={Upload}>
                <label className="restore-box">
                  <Upload size={22} />
                  <span>
                    Select a Novyx JSON backup. Restore keeps matching records
                    and adds missing records. Version 4 backups include your
                    profile and memories.
                  </span>
                  <input
                    type="file"
                    accept="application/json,.json"
                    disabled={backupBusy}
                    onChange={(e) => {
                      void restoreBackup(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
                {restoreMessage && (
                  <p className="status-copy">{restoreMessage}</p>
                )}
              </Panel>
              <Panel title="Product Tiers" icon={Sparkles}>
                <div className="plan-grid">
                  <Plan
                    name="Free"
                    text="Manual tracking, goals, debt and basic Nyx."
                  />
                  <Plan
                    name="Pro"
                    text="Connections, advanced forecasts, reports and subscriptions."
                  />
                  <Plan
                    name="Creator"
                    text="Clients, invoices, opportunity pipeline and business tools."
                  />
                  <Plan
                    name="Premium AI"
                    text="Expanded Nyx intelligence and automation."
                  />
                </div>
                <p className="fine-print">
                  {connectionStatus.billingConfigured
                    ? 'Billing credentials are configured for future activation.'
                    : 'Billing is not connected yet, so these remain product tiers rather than active paid plans.'}
                </p>
              </Panel>
            </div>
          </section>
        )}

        {loading && (
          <div className="sync-toast">Nyx is syncing your workspace…</div>
        )}
      </main>
      <NyxBottomNav
        active={
          (
            ['dashboard', 'live', 'assistant', 'money', 'settings'] as const
          ).includes(
            tab as 'dashboard' | 'live' | 'assistant' | 'money' | 'settings',
          )
            ? (tab as 'dashboard' | 'live' | 'assistant' | 'money' | 'settings')
            : 'settings'
        }
        onChange={setTab}
      />
    </div>
  );
}

function SectionHead({ title, text }: { title: string; text: string }) {
  return (
    <div className="section-head">
      <p className="kicker">NOVYX · NYX</p>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Bot;
  children: React.ReactNode;
}) {
  return (
    <div className="panel">
      <div className="panel-head">
        <Icon size={17} />
        <h3>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Score({
  label,
  value,
  note,
  warning = false,
}: {
  label: string;
  value: string;
  note: string;
  warning?: boolean;
}) {
  return (
    <div className={warning ? 'money-score-card warning' : 'money-score-card'}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function Metric({
  label,
  value,
  good = false,
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={good ? 'good-text' : ''}>{value}</strong>
    </div>
  );
}

function Progress({
  value,
  danger = false,
}: {
  value: number;
  danger?: boolean;
}) {
  return (
    <div className={danger ? 'progress danger' : 'progress'}>
      <span style={{ width: Math.max(0, Math.min(100, value)) + '%' }} />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function ConnectionCard({
  icon: Icon,
  title,
  subtitle,
  ready,
  onClick,
}: {
  icon: typeof Bot;
  title: string;
  subtitle: string;
  ready: boolean;
  onClick: () => void;
}) {
  return (
    <div className="connection-hub-card">
      <div className="connection-provider">
        <div className="provider-icon">
          <Icon size={24} />
        </div>
        <div>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
      </div>
      <div className={ready ? 'connection-state ready' : 'connection-state'}>
        {ready ? 'Provider credentials ready' : 'Setup required'}
      </div>
      <button className="secondary-btn wide" onClick={onClick}>
        {ready ? 'Continue setup' : 'Connection details'}
      </button>
    </div>
  );
}

function Plan({ name, text }: { name: string; text: string }) {
  return (
    <div className="plan-card">
      <strong>{name}</strong>
      <p>{text}</p>
      <span>Pricing / billing activation pending</span>
    </div>
  );
}

function money(value: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatMonth(date?: string) {
  if (!date) return '';
  return new Date(date + 'T12:00:00').toLocaleString('en-CA', {
    month: 'short',
  });
}

export default App;
