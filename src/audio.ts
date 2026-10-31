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
const FANFARE_VOLUME = 0.52;

function makeAnthem(file: string) {
  const audio = new Audio(`${BASE}sounds/${file}`);
  audio.preload = 'auto';
  audio.loop = false;
  return audio;
}

const crownAnthem = makeAnthem('god-save-the-queen.mp3');
const flagAnthem = makeAnthem('land-of-hope-and-glory.mp3');
let activeAnthem: HTMLAudioElement | null = null;
let anthemStarted = false;

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

function prime(audio: HTMLAudioElement, volume: number) {
  if (!audio.paused) {
    return;
  }
  audio.volume = 0;
  void audio
    .play()
    .then(() => {
      if (anthemStarted && (audio === crownAnthem || audio === flagAnthem)) {
        audio.volume = FANFARE_VOLUME;
        return;
      }
      audio.pause();
      audio.currentTime = 0;
      audio.volume = volume;
    })
    .catch(() => {
      audio.volume = volume;
    });
}

/** Prime the stop sounds during a click so later playback is allowed. */
export function unlockAudio() {
  for (const clip of [chink, thunk]) {
    for (const audio of clip.pool) {
      prime(audio, clip.volume);
    }
  }
  prime(crownAnthem, FANFARE_VOLUME);
  prime(flagAnthem, FANFARE_VOLUME);
}

function playAnthem(audio: HTMLAudioElement) {
  if (activeAnthem && activeAnthem !== audio) {
    activeAnthem.pause();
    try {
      activeAnthem.currentTime = 0;
    } catch {
      // The other anthem may not have metadata yet.
    }
  }
  anthemStarted = true;
  audio.volume = FANFARE_VOLUME;
  try {
    audio.currentTime = 0;
  } catch {
    // Metadata may still be loading.
  }
  activeAnthem = audio;
  void audio.play().catch(() => {
    // Autoplay block or a missing file.
  });
}

/** Orchestral snippet of God Save the Queen. */
export function playCrownFanfare() {
  playAnthem(crownAnthem);
}

/** Orchestral snippet of Land of Hope and Glory. */
export function playFlagFanfare() {
  playAnthem(flagAnthem);
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
