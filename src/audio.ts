const BASE = import.meta.env.BASE_URL;

type Clip = {
  volume: number;
  pool: HTMLAudioElement[];
  next: number;
};

function makeClip(file: string, volume: number, size = 5): Clip {
  const pool = Array.from({ length: size }, () => {
    const audio = new Audio(`${BASE}sounds/${file}`);
    audio.preload = 'auto';
    return audio;
  });
  return { volume, pool, next: 0 };
}

const chink = makeClip('chink.mp3', 0.36);
const thunk = makeClip('thunk.mp3', 0.72);

function playClip(clip: Clip) {
  const audio = clip.pool[clip.next];
  clip.next = (clip.next + 1) % clip.pool.length;
  audio.volume = clip.volume;
  try {
    audio.currentTime = 0;
  } catch {
    // The element may not have metadata yet.
  }
  void audio.play().catch(() => {
    // Autoplay block or a missing file.
  });
}

/** Prime the stop sounds during the spin click so later stops can play. */
export function unlockAudio() {
  for (const clip of [chink, thunk]) {
    for (const audio of clip.pool) {
      audio.volume = 0;
      void audio
        .play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = clip.volume;
        })
        .catch(() => {
          audio.volume = clip.volume;
        });
    }
  }
}

export function playWin() {
  const audio = new Audio(`${BASE}sounds/win.mp3`);
  audio.volume = 0.28;
  void audio.play().catch(() => {
    // Missing file or autoplay block.
  });
}

/** Light chink for an ordinary stop. Heavier thunk when a bonus or crown lands. */
export function playReelStop(hasBonus: boolean, hasHat: boolean) {
  playClip(hasBonus || hasHat ? thunk : chink);
}
