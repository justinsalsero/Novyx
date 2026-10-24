import { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Settings2,
  Keyboard,
} from 'lucide-react';
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionConstructor = new () => Recognition;
type SpeechWindow = Window & {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
};
const maleNames = [
  'daniel',
  'aaron',
  'alex',
  'oliver',
  'arthur',
  'guy',
  'liam',
  'ryan',
  'evan',
];
const presets = ['am_michael', 'am_fenrir', 'bm_george'] as const;
let enginePromise: Promise<any> | null = null;
async function engine() {
  if (!enginePromise)
    enginePromise = import('kokoro-js')
      .then(({ KokoroTTS }) =>
        KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
          dtype: 'q4',
          device: 'wasm',
        }),
      )
      .catch((e) => {
        enginePromise = null;
        throw e;
      });
  return enginePromise;
}
export default function NyxVoice({
  onAsk,
  reply,
  preferVoice,
  onKeyboard,
}: {
  onAsk: (s: string) => void;
  reply: string;
  preferVoice: boolean;
  onKeyboard?: () => void;
}) {
  const recognizer = useRef<Recognition | null>(null),
    last = useRef(''),
    audio = useRef<HTMLAudioElement | null>(null),
    objectUrl = useRef<string | null>(null),
    generation = useRef(0);
  const [listening, setListening] = useState(false),
    [status, setStatus] = useState('Tap the microphone when you are ready.');
  const [motion, setMotion] = useState(
    () => localStorage.getItem('nyx-avatar-motion') !== 'off',
  );
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]),
    [speaking, setSpeaking] = useState(preferVoice),
    [voiceName, setVoiceName] = useState(
      () => localStorage.getItem('nyx-voice-name') || '',
    ),
    [rate, setRate] = useState(() =>
      Number(localStorage.getItem('nyx-voice-rate') || '0.98'),
    ),
    [options, setOptions] = useState(false);
  const [neural, setNeural] = useState(
      () => localStorage.getItem('nyx-neural-enabled') === 'true',
    ),
    [preset, setPreset] = useState(
      () => localStorage.getItem('nyx-neural-preset') || 'am_michael',
    ),
    [loading, setLoading] = useState(false);
  const win = window as SpeechWindow,
    Constructor = win.SpeechRecognition || win.webkitSpeechRecognition,
    canSpeak = 'speechSynthesis' in window;
  function stop() {
    generation.current++;
    if (canSpeak) window.speechSynthesis.cancel();
    audio.current?.pause();
    audio.current = null;
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
  }
  function browserSpeak(text: string) {
    if (!canSpeak)
      return setStatus('Speech is unavailable. Text replies remain available.');
    const voice =
      voices.find((v) => v.name === voiceName) ||
      voices.find((v) =>
        maleNames.some((n) => v.name.toLowerCase().includes(n)),
      );
    if (!voice) {
      setStatus(
        'No confirmed masculine device voice. Select neural voice or use text replies.',
      );
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.pitch = 1;
    u.rate = Math.max(0.94, Math.min(1.05, rate));
    window.speechSynthesis.speak(u);
  }
  async function speak(text: string) {
    stop();
    const token = generation.current;
    if (!neural) {
      browserSpeak(text);
      return;
    }
    setLoading(true);
    setStatus(
      'Preparing local neural voice. First use downloads the voice model.',
    );
    try {
      const tts = await engine();
      if (token !== generation.current) return;
      const result = await tts.generate(text, { voice: preset });
      if (token !== generation.current) return;
      const url = URL.createObjectURL(result.toBlob());
      objectUrl.current = url;
      const player = new Audio(url);
      audio.current = player;
      player.playbackRate = Math.max(0.94, Math.min(1.05, rate));
      player.onended = () => {
        setStatus('Nyx finished speaking.');
        if (objectUrl.current === url) {
          URL.revokeObjectURL(url);
          objectUrl.current = null;
        }
      };
      await player.play();
      setStatus('Nyx is speaking.');
    } catch {
      if (token === generation.current) {
        setStatus(
          'Local neural playback unavailable on this device. Trying a confirmed masculine device voice.',
        );
        browserSpeak(text);
      }
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (!canSpeak) return;
    const update = () =>
      setVoices(
        window.speechSynthesis
          .getVoices()
          .filter((v) => v.lang.toLowerCase().startsWith('en')),
      );
    update();
    window.speechSynthesis.addEventListener?.('voiceschanged', update);
    return () =>
      window.speechSynthesis.removeEventListener?.('voiceschanged', update);
  }, [canSpeak]);
  useEffect(() => {
    setSpeaking(preferVoice);
  }, [preferVoice]);
  useEffect(() => {
    if (!reply || reply === last.current) return;
    last.current = reply;
    if (speaking) void speak(reply.replace(/[#*_`]/g, ''));
  }, [reply]);
  useEffect(
    () => () => {
      recognizer.current?.stop();
      stop();
    },
    [],
  );
  function toggle() {
    if (listening) {
      recognizer.current?.stop();
      setListening(false);
      return;
    }
    if (!Constructor) {
      setStatus('Voice input unavailable. Please use messaging.');
      return;
    }
    try {
      const r = new Constructor();
      recognizer.current = r;
      r.lang = 'en-CA';
      r.continuous = false;
      r.interimResults = false;
      r.onresult = (e) => {
        const t = e.results[0]?.[0]?.transcript?.trim();
        if (t) {
          setStatus('You said: ' + t);
          onAsk(t);
        }
      };
      r.onerror = (e) => {
        setListening(false);
        setStatus('Microphone: ' + e.error);
      };
      r.onend = () => setListening(false);
      r.start();
      setListening(true);
      setStatus('Listening. Speak naturally.');
    } catch {
      setStatus('Microphone permission unavailable.');
    }
  }
  return (
    <section className="nx31-voice">
      <div
        className={
          'nx31-orb nx4-avatar ' +
          (listening ? 'listening ' : '') +
          (loading ? 'thinking ' : '') +
          (motion ? 'motion-on' : 'motion-off')
        }
        aria-label={
          listening
            ? 'Nyx is listening'
            : loading
              ? 'Nyx is preparing speech'
              : 'Nyx is idle'
        }
      >
        <button type="button" disabled={!Constructor} onClick={toggle}>
          {listening ? <MicOff size={30} /> : <Mic size={30} />}
        </button>
      </div>
      <h3>{listening ? 'Listening…' : 'Talk to Nyx'}</h3>
      <p role="status">{status}</p>
      <div className="nx31-voice-buttons">
        <button onClick={onKeyboard}>
          <Keyboard size={16} /> Message Nyx
        </button>
        <button
          onClick={() => {
            setSpeaking((v) => !v);
            stop();
          }}
        >
          {speaking ? <Volume2 size={16} /> : <VolumeX size={16} />}{' '}
          {speaking ? 'Voice replies on' : 'Voice replies off'}
        </button>
        <button onClick={() => setOptions((v) => !v)}>
          <Settings2 size={16} /> Voice settings
        </button>
      </div>
      {options && (
        <div className="nx31-voice-options">
          <label>
            <input
              type="checkbox"
              checked={motion}
              onChange={(e) => {
                setMotion(e.target.checked);
                localStorage.setItem(
                  'nyx-avatar-motion',
                  e.target.checked ? 'on' : 'off',
                );
              }}
            />{' '}
            Animate Nyx avatar (respects reduced-motion settings)
          </label>
          <label>
            <input
              type="checkbox"
              checked={neural}
              onChange={(e) => {
                setNeural(e.target.checked);
                localStorage.setItem(
                  'nyx-neural-enabled',
                  String(e.target.checked),
                );
                stop();
              }}
            />{' '}
            Use natural local neural voice (optional download, approximately 85
            MB)
          </label>
          {neural ? (
            <label>
              Masculine neural voice
              <select
                value={preset}
                onChange={(e) => {
                  setPreset(e.target.value);
                  localStorage.setItem('nyx-neural-preset', e.target.value);
                }}
              >
                {presets.map((p) => (
                  <option key={p} value={p}>
                    {p
                      .replace('_', ' ')
                      .replace('am ', 'American ')
                      .replace('bm ', 'British ')}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Confirmed masculine device voice
              <select
                value={voiceName}
                onChange={(e) => {
                  setVoiceName(e.target.value);
                  localStorage.setItem('nyx-voice-name', e.target.value);
                }}
              >
                <option value="">Automatic confirmed masculine voice</option>
                {voices
                  .filter((v) =>
                    maleNames.some((n) => v.name.toLowerCase().includes(n)),
                  )
                  .map((v) => (
                    <option key={v.voiceURI} value={v.name}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label>
            Speech pace {Math.round(rate * 100)}%
            <input
              type="range"
              min=".94"
              max="1.05"
              step=".01"
              value={rate}
              onChange={(e) => {
                setRate(Number(e.target.value));
                localStorage.setItem('nyx-voice-rate', e.target.value);
              }}
            />
          </label>
          <button
            disabled={loading}
            onClick={() =>
              void speak('Hello. I am Nyx. How can I help you today?')
            }
          >
            {loading ? 'Loading local voice…' : 'Preview voice'}
          </button>
          <button onClick={stop}>Stop playback</button>
          <small>
            Neural speech runs on your device after downloading the model. Some
            iPhones may not support or may struggle with local generation. Text
            messaging always remains available.
          </small>
        </div>
      )}
    </section>
  );
}
