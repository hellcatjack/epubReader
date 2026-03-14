type AudioFactory = () => HTMLAudioElement;

type AudioPlayerDeps = {
  createAudio?: AudioFactory;
  createUrl?: (blob: Blob) => string;
  revokeUrl?: (url: string) => void;
};

export type AudioPlayer = {
  destroy(): void;
  load(blob: Blob): Promise<string>;
  pause(): void;
  play(): Promise<void>;
  playUntilEnded(): Promise<void>;
  resume(): Promise<void>;
  stop(): void;
};

export function createAudioPlayer({
  createAudio = () => new Audio(),
  createUrl = (blob) => URL.createObjectURL(blob),
  revokeUrl = (url) => URL.revokeObjectURL(url),
}: AudioPlayerDeps = {}): AudioPlayer {
  const audio = createAudio();
  let currentUrl = "";
  let activePlayback:
    | {
        reject: (error: Error) => void;
      }
    | null = null;

  function unload() {
    if (!currentUrl) {
      return;
    }

    revokeUrl(currentUrl);
    currentUrl = "";
  }

  function clearPlayback() {
    activePlayback = null;
  }

  function playUntilEnded() {
    return new Promise<void>(async (resolve, reject) => {
      const handleEnded = () => {
        cleanup();
        resolve();
      };

      const handleError = () => {
        cleanup();
        reject(new Error("audio playback failed"));
      };

      const cleanup = () => {
        audio.removeEventListener("ended", handleEnded);
        audio.removeEventListener("error", handleError);
        clearPlayback();
      };

      activePlayback = {
        reject: (error) => {
          cleanup();
          reject(error);
        },
      };

      audio.addEventListener("ended", handleEnded, { once: true });
      audio.addEventListener("error", handleError, { once: true });

      try {
        await audio.play();
      } catch (error) {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  return {
    async load(blob: Blob) {
      unload();
      currentUrl = createUrl(blob);
      audio.src = currentUrl;
      return currentUrl;
    },
    pause() {
      audio.pause();
    },
    async play() {
      await audio.play();
    },
    playUntilEnded,
    async resume() {
      await audio.play();
    },
    stop() {
      audio.pause();
      audio.currentTime = 0;
      activePlayback?.reject(new Error("stopped"));
      clearPlayback();
    },
    destroy() {
      this.stop();
      unload();
      audio.removeAttribute("src");
      audio.load();
    },
  };
}
