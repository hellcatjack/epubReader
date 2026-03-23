type SpeechSynthesisLike = Pick<
  SpeechSynthesis,
  "addEventListener" | "cancel" | "getVoices" | "pause" | "removeEventListener" | "resume" | "speak"
> & {
  pending: boolean;
  speaking: boolean;
};

type UtteranceFactory = (text: string) => SpeechSynthesisUtterance;

export type BrowserTtsVoice = {
  displayName: string;
  gender: "female" | "male" | "unknown";
  id: string;
  isDefault: boolean;
  locale: string;
};

export type BrowserTtsSpeakOptions = {
  initialMarkerFallbackMs?: number;
  onBoundary?: (event: SpeechSynthesisEvent) => void;
  onEnd?: () => void;
  onError?: (error: SpeechSynthesisErrorEvent | Event) => void;
  onStart?: () => void;
  rate: number;
  voiceId: string;
  volume: number;
};

type BrowserTtsClientDeps = {
  speechSynthesis?: SpeechSynthesisLike;
  utteranceFactory?: UtteranceFactory;
};

function inferGender(voice: SpeechSynthesisVoice): BrowserTtsVoice["gender"] {
  const name = voice.name.toLowerCase();

  if (/(ava|aria|bella|jenny|zira|female|woman|girl)/.test(name)) {
    return "female";
  }

  if (/(andrew|adam|david|guy|mark|michael|male|man|boy)/.test(name)) {
    return "male";
  }

  return "unknown";
}

function voiceRank(voice: SpeechSynthesisVoice) {
  const name = voice.name.toLowerCase();
  const locale = voice.lang.toLowerCase();

  return [
    locale.startsWith("en") ? 0 : 1,
    name.includes("natural") ? 0 : 1,
    voice.default ? 0 : 1,
  ] as const;
}

function normalizeVoice(voice: SpeechSynthesisVoice): BrowserTtsVoice {
  return {
    displayName: voice.name,
    gender: inferGender(voice),
    id: voice.voiceURI || voice.name,
    isDefault: voice.default,
    locale: voice.lang,
  };
}

async function waitForVoices(speechSynthesis: SpeechSynthesisLike): Promise<SpeechSynthesisVoice[]> {
  const immediate = speechSynthesis.getVoices();
  if (immediate.length) {
    return immediate;
  }

  return new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const handleVoicesChanged = () => {
      speechSynthesis.removeEventListener("voiceschanged", handleVoicesChanged);
      resolve(speechSynthesis.getVoices());
    };

    speechSynthesis.addEventListener("voiceschanged", handleVoicesChanged);
  });
}

export function createBrowserTtsClient({
  speechSynthesis = globalThis.speechSynthesis as SpeechSynthesisLike | undefined,
  utteranceFactory = (text) => new SpeechSynthesisUtterance(text),
}: BrowserTtsClientDeps = {}) {
  async function getSpeechVoices() {
    if (!speechSynthesis) {
      throw new Error("speechSynthesis unavailable");
    }

    return waitForVoices(speechSynthesis);
  }

  return {
    async getVoices(): Promise<BrowserTtsVoice[]> {
      const voices = await getSpeechVoices();

      return [...voices]
        .sort((left, right) => {
          const leftRank = voiceRank(left);
          const rightRank = voiceRank(right);
          return leftRank < rightRank ? -1 : leftRank > rightRank ? 1 : 0;
        })
        .filter((voice) => voice.lang.toLowerCase().startsWith("en"))
        .map(normalizeVoice);
    },
    pause() {
      speechSynthesis?.pause();
    },
    resume() {
      speechSynthesis?.resume();
    },
    async speakSelection(text: string, options: BrowserTtsSpeakOptions) {
      if (!speechSynthesis) {
        throw new Error("speechSynthesis unavailable");
      }

      const voices = await getSpeechVoices();
      const utterance = utteranceFactory(text);
      const voice = voices.find((item) => (item.voiceURI || item.name) === options.voiceId) ?? voices[0];

      utterance.onstart = () => {
        options.onStart?.();
      };
      utterance.onend = () => {
        options.onEnd?.();
      };
      utterance.onboundary = (event) => {
        options.onBoundary?.(event);
      };
      utterance.onerror = (event) => {
        options.onError?.(event);
      };
      utterance.rate = options.rate;
      utterance.volume = options.volume;
      utterance.voice = voice;
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    },
    stop() {
      speechSynthesis?.cancel();
    },
  };
}
