type AudioFactory = () => HTMLAudioElement;

type AudioPlayerDeps = {
  createAudio?: AudioFactory;
  createUrl?: (blob: Blob) => string;
  revokeUrl?: (url: string) => void;
};

export function createAudioPlayer({
  createAudio = () => new Audio(),
  createUrl = (blob) => URL.createObjectURL(blob),
  revokeUrl = (url) => URL.revokeObjectURL(url),
}: AudioPlayerDeps = {}) {
  const audio = createAudio();
  let currentUrl = "";

  function unload() {
    if (!currentUrl) {
      return;
    }

    revokeUrl(currentUrl);
    currentUrl = "";
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
    play() {
      return audio.play();
    },
    stop() {
      audio.pause();
      audio.currentTime = 0;
    },
    destroy() {
      this.stop();
      unload();
      audio.removeAttribute("src");
      audio.load();
    },
  };
}
