# Construction Slots

A free, browser-only slot game. **No real money. Entertainment only.** Wins are credits in this game, not cash.

Live site (GitHub Pages): https://matt-pooley-uk.github.io/Construction-slots/

Rules match the Hard Hat Slots prototype. The math spec lives in the sister repo:

- Prototype + spec: https://github.com/Matt-Pooley-UK/slots (`docs/RECREATION_SPEC.md`)

Test Mode (force wins, simulations) is **off** unless you open the page with `?test=1`.

## Local

```bash
npm install
npm run dev
```

Production build uses base path `/Construction-slots/` so it matches the project Pages URL.

```bash
npm run build
npm run preview
```

## Deploy

Push to `master`. `.github/workflows/pages.yml` builds `dist/` and publishes it.

In the repo: **Settings → Pages → Source: GitHub Actions**.

## Assets

Placeholder tiles and silent audio ship first. See [ASSETS.md](./ASSETS.md) for the generate-later inventory. Drop files into `public/` using those names; IDs do not change.

## Persistence

Each browser keeps its own balance and progressives in `localStorage` key `construction-slots-state`. There is no shared Grand across players.
