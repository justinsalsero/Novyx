import { localDay, validDate } from '../shared/domain';
import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Compass,
  Landmark,
  Mail,
  MessageCircle,
  Mic2,
  ShieldCheck,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';

export type NyxProfile = {
  name: string;
  birthDate: string;
  communication: 'voice' | 'message' | 'both';
  emailInterest: boolean;
  bankInterest: boolean;
  completed: boolean;
};

type Props = {
  initialName: string;
  providers: { gmailConfigured: boolean; bankConfigured: boolean };
  saving: boolean;
  initialProfile?: NyxProfile;
  saveError?: string;
  onFinish: (profile: NyxProfile) => Promise<void>;
};

const chapters = [
  'Meet Nyx',
  'Your profile',
  'Connections',
  'Communication',
  'Your command centre',
];

export default function NyxOnboarding({
  initialName,
  initialProfile,
  saveError,
  providers,
  saving,
  onFinish,
}: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName);
  const [birthDate, setBirthDate] = useState(initialProfile?.birthDate || '');
  const [communication, setCommunication] = useState<
    NyxProfile['communication']
  >(initialProfile?.communication || 'both');
  const [emailInterest, setEmailInterest] = useState(
    initialProfile?.emailInterest || false,
  );
  const [bankInterest, setBankInterest] = useState(
    initialProfile?.bankInterest || false,
  );
  const [connectionHelp, setConnectionHelp] = useState('');
  const [error, setError] = useState('');

  const next = () => {
    if (step === 1 && !name.trim()) {
      setError('Please enter your name so Nyx knows how to address you.');
      return;
    }
    if (
      step === 1 &&
      birthDate &&
      (!validDate(birthDate) || birthDate > localDay())
    ) {
      setError('Choose a valid birthday or leave it blank.');
      return;
    }
    setError('');
    setStep((s) => Math.min(chapters.length - 1, s + 1));
  };

  const introduce = () => {
    if (!('speechSynthesis' in window)) {
      setConnectionHelp(
        'Voice playback is not available in this browser. Messaging will still work.',
      );
      return;
    }
    const utterance = new SpeechSynthesisUtterance(
      'Hello. I am Nyx, your Novyx assistant. I can help organize your schedule, track the money you enter, review bills, manage goals, and prioritize your day. You are always in control.',
    );
    utterance.rate = 0.96;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  return (
    <main className="nx-onboard-shell">
      <div className="nx-onboard-head">
        <div className="nx-wordmark">
          NOVYX <span>4.0</span>
        </div>
        <span>GUIDED BY NYX</span>
      </div>
      <div className="nx-onboard-layout">
        <aside className="nx-onboard-progress">
          <div className="nx-welcome-mark">
            <img
              src="/resources/nyx-icon-512.png"
              alt="Nyx wolf mascot"
              className="cyber-wolf small"
            />
            <strong>Meet Nyx.</strong>
          </div>
          <p>
            A calmer way to manage money, commitments, opportunities and your
            next move.
          </p>
          {chapters.map((chapter, i) => (
            <div
              key={chapter}
              className={
                'nx-progress-item ' +
                (step === i ? 'active' : '') +
                (step > i ? ' complete' : '')
              }
            >
              <span>{step > i ? <CheckCircle2 size={16} /> : i + 1}</span>
              <b>{chapter}</b>
            </div>
          ))}
          <div className="nx-small-privacy">
            <ShieldCheck size={16} /> You choose what Nyx can see. No accounts
            are connected without your consent.
          </div>
        </aside>
        <section className="nx-onboard-card">
          <div className="nx-step-counter">
            STEP {step + 1} OF {chapters.length}
          </div>
          {step === 0 && (
            <div className="nx-onboard-body">
              <div className="nx-onboard-symbol">
                <Sparkles size={45} />
              </div>
              <h1>
                Welcome to your
                <br />
                <em>command centre.</em>
              </h1>
              <p>
                I'm <strong>Nyx</strong>, your cyber-wolf AI guide. I'll help
                turn bills, messages, goals, clients and tasks into clear
                decisions and manageable actions.
              </p>
              <div className="nx-benefit-grid">
                <span>
                  <Zap /> Proactive insights
                </span>
                <span>
                  <CircleDollarSign /> Money clarity
                </span>
                <span>
                  <Target /> Goal tracking
                </span>
              </div>
              <button className="nx-outline" onClick={introduce}>
                <Mic2 size={18} /> Hear Nyx introduce himself
              </button>
            </div>
          )}
          {step === 1 && (
            <div className="nx-onboard-body">
              <h1>
                Let's make this <em>yours.</em>
              </h1>
              <p>
                Nyx will use your preferred name in briefings. Your birthday is
                optional and is never needed to connect your accounts.
              </p>
              <label>
                Your name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="What should Nyx call you?"
                  autoComplete="given-name"
                />
              </label>
              <label>
                Birth date <small>(optional)</small>
                <input
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </label>
              {error && <p className="nx-form-error">{error}</p>}
              <div className="nx-privacy-row">
                <ShieldCheck size={17} /> Your profile is stored under your
                signed-in account. You can change your preferences later.
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="nx-onboard-body">
              <h1>
                Connect only what <em>you want.</em>
              </h1>
              <p>
                Connecting accounts is optional. Live access requires provider
                setup and a separate secure authorization step. Nyx cannot
                access them yet.
              </p>
              <div className="nx-provider">
                <div className="nx-provider-title">
                  <Mail size={24} />
                  <span>
                    <b>Email accounts</b>
                    <small>Receipts, reminders, important messages</small>
                  </span>
                </div>
                <div className="nx-provider-footer">
                  <span>
                    {providers.gmailConfigured
                      ? 'Provider configuration detected; authorization not yet active'
                      : 'Live email linking is not configured'}
                  </span>
                  <button
                    onClick={() => {
                      setEmailInterest((v) => !v);
                      setConnectionHelp(
                        'Your choice will be saved when you finish setup. No email permissions have been granted.',
                      );
                    }}
                  >
                    {emailInterest ? 'Interested ✓' : 'Set up later'}
                  </button>
                </div>
              </div>
              <div className="nx-provider">
                <div className="nx-provider-title">
                  <Landmark size={24} />
                  <span>
                    <b>Bank accounts</b>
                    <small>Spending, budgets, subscriptions</small>
                  </span>
                </div>
                <div className="nx-provider-footer">
                  <span>
                    {providers.bankConfigured
                      ? 'Provider configuration detected; authorization not yet active'
                      : 'Live bank linking is not configured'}
                  </span>
                  <button
                    onClick={() => {
                      setBankInterest((v) => !v);
                      setConnectionHelp(
                        'Your interest has been saved. No bank permissions have been granted.',
                      );
                    }}
                  >
                    {bankInterest ? 'Interested ✓' : 'Set up later'}
                  </button>
                </div>
              </div>
              {connectionHelp && (
                <div className="nx-note">{connectionHelp}</div>
              )}
              <p className="nx-muted">
                You can still manually enter transactions and messages and
                import a Novyx 2.0 backup after setup.
              </p>
            </div>
          )}
          {step === 3 && (
            <div className="nx-onboard-body">
              <h1>
                How should we <em>talk?</em>
              </h1>
              <p>
                Choose a default. Switch whenever you like. Voice recognition
                depends on your device and browser; Nyx never listens without
                you pressing the microphone.
              </p>
              <div className="nx-choices">
                <button
                  className={communication === 'voice' ? 'active' : ''}
                  onClick={() => setCommunication('voice')}
                >
                  <Mic2 size={26} />
                  <b>Voice first</b>
                  <small>Tap to speak naturally</small>
                </button>
                <button
                  className={communication === 'message' ? 'active' : ''}
                  onClick={() => setCommunication('message')}
                >
                  <MessageCircle size={26} />
                  <b>Message first</b>
                  <small>Type whenever you need help</small>
                </button>
                <button
                  className={communication === 'both' ? 'active' : ''}
                  onClick={() => setCommunication('both')}
                >
                  <Sparkles size={26} />
                  <b>Both</b>
                  <small>Switch between voice and text</small>
                </button>
              </div>
            </div>
          )}
          {step === 4 && (
            <div className="nx-onboard-body">
              <h1>
                Your day, <em>simplified.</em>
              </h1>
              <p>Here's how to get value from Novyx on day one.</p>
              <div className="nx-tour-list">
                <div>
                  <Compass />
                  <span>
                    <b>Home · Nyx Briefing</b>
                    <small>See your priorities and upcoming events.</small>
                  </span>
                </div>
                <div>
                  <CircleDollarSign />
                  <span>
                    <b>Money & Banking</b>
                    <small>
                      Add transactions and budgets; Nyx analyzes what you
                      actually track.
                    </small>
                  </span>
                </div>
                <div>
                  <CalendarDays />
                  <span>
                    <b>Calendar, clients & invoices</b>
                    <small>
                      Record classes, jobs, upcoming bills and client
                      follow-ups.
                    </small>
                  </span>
                </div>
                <div>
                  <Mic2 />
                  <span>
                    <b>Talk or message Nyx</b>
                    <small>
                      Ask for an action plan. Enable reminders later in
                      Settings.
                    </small>
                  </span>
                </div>
                <div>
                  <ShieldCheck />
                  <span>
                    <b>Your data, your choice</b>
                    <small>
                      Export it from Reports, restore a 2.0 backup and sign out
                      at any time.
                    </small>
                  </span>
                </div>
              </div>
            </div>
          )}
          {saveError && (
            <p role="alert" className="form-error">
              {saveError}
            </p>
          )}
          <footer className="nx-onboard-footer">
            <button
              className="nx-back"
              disabled={step === 0 || saving}
              onClick={() => setStep((s) => s - 1)}
            >
              <ArrowLeft size={16} /> Back
            </button>
            <button
              className="nx-next"
              disabled={saving}
              onClick={() =>
                step === chapters.length - 1
                  ? void onFinish({
                      name: name.trim(),
                      birthDate,
                      communication,
                      emailInterest,
                      bankInterest,
                      completed: true,
                    })
                  : next()
              }
            >
              {step === chapters.length - 1
                ? saving
                  ? 'Saving…'
                  : 'Open my dashboard'
                : 'Continue'}{' '}
              <ArrowRight size={18} />
            </button>
          </footer>
        </section>
      </div>
    </main>
  );
}
