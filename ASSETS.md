# Asset inventory

Ship labeled color fallbacks until final art exists. Replace files in place; game IDs stay the same.

## Symbols — `public/symbols/`

| File | ID | Role |
|------|----|------|
| `a.png` | A | Royal |
| `k.png` | K | Royal |
| `q.png` | Q | Royal |
| `j.png` | J | Royal |
| `prem1.png` | PREM1 | Premium |
| `prem2.png` | PREM2 | Premium |
| `prem3.png` | PREM3 | Premium |
| `wild.png` | WILD | Substitutes royals and premiums |
| `bonus.png` | BONUS | Scatter, wheel, saw paints |
| `hat.png` | HAT | Trigger + 1 upgrade step |
| `hat2.png` | HAT2 | Ultra 2× hat (or `hat.png` + 2× badge) |
| `hat3.png` | HAT3 | Ultra 3× hat (or `hat.png` + 3× badge) |

Suggested theme: construction site (hard hat, tools, vehicles) on a high-contrast tile.

## UI — `public/ui/`

| File | Role |
|------|------|
| `background.jpg` | Page / reel plate |
| `favicon.svg` | Tab icon |
| `wheel-bonus.png` | Optional bonus-wheel wedge icon |
| `wheel-hat.png` | Optional hat-wheel wedge icon |

## Sound — `public/sounds/`

| File | When |
|------|------|
| `chink.mp3` | Default reel stop |
| `thunk.mp3` | Heavier reel stop when the column shows a bonus symbol or a crown |
| `god-save-the-queen.mp3` | Short snippet when a crown bonus is won |
| `land-of-hope-and-glory.mp3` | Short snippet when a flag bonus is won |
| `win.mp3` | Any cash award |
| `spin.mp3` | Optional spin loop (unused in the prototype) |

Missing sound files are skipped. Missing images use the colored letter fallback.
