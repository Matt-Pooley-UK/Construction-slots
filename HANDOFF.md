# Handoff — Construction Slots Pages app

Parked here so a later agent can clone `Matt-Pooley-UK/slots` and recover the
work. **Do not merge this folder into the React prototype.** The intended home
is https://github.com/Matt-Pooley-UK/Construction-slots (`master`).

Source run: https://cursor.com/agents/bc-9cb179bb-ef83-433d-abe8-52aa3980c451

## Push to the Pages repo

From a machine whose GitHub token can write `Construction-slots`:

```bash
cd construction-slots
git init -b master
git add .
git commit -m "Add Construction Slots GitHub Pages game."
git remote add origin https://github.com/Matt-Pooley-UK/Construction-slots.git
git push -u origin master
```

Then in that repo: **Settings → Pages → Source: GitHub Actions**.

Intended live URL: https://matt-pooley-uk.github.io/Construction-slots/

## Locked product decisions

- Project Pages site, Vite `base: '/Construction-slots/'`
- HTML + Canvas 2D + TypeScript (no React / Pixi / Howler)
- Test Mode only with `?test=1`
- Persist key `construction-slots-state`
- Per-browser progressives, no shared Grand
- No-real-money labeling; title Construction Slots
- Art later; see `ASSETS.md`

Sister docs PR (prototype README + spec link): https://github.com/Matt-Pooley-UK/slots/pull/27
