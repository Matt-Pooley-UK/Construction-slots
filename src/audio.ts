const BASE = import.meta.env.BASE_URL;

function play(file: string) {
  const audio = new Audio(`${BASE}sounds/${file}`);
  audio.volume = 0.28;
  void audio.play().catch(() => {
    // Missing file or autoplay block.
  });
}

export function playWin() {
  play('win.mp3');
}

export function playReelStop(hasBonus: boolean, hasHat: boolean) {
  if (hasBonus) {
    play('kerchink.mp3');
    return;
  }
  if (hasHat) {
    play('thunk.mp3');
    return;
  }
  play('stop.mp3');
}
