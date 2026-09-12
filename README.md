# Memory Slot

A Firefox extension for learning words while you read. Double-click a word or select a phrase:
the translation appears above the text, and the card lands in a floating window you can drag,
minimise or close. One click saves it to a deck and spaced repetition takes it from there.

**The extension is off everywhere until you enable it on a site.** It declares no static content
scripts at all — the content script is registered at runtime, only for the origins you allow — so
on a site you have not enabled, nothing of ours runs and nothing is read or sent.

Status: **early development**. See [docs/PLAN.md](docs/PLAN.md) for the roadmap (in Russian).

## Requirements

- Node.js 20 or newer
- Firefox 140 or newer (the data-collection manifest key needs it; 142 on Android)

## Development

```bash
npm install
npm run dev      # rebuild on change and launch Firefox with the extension loaded
```

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run build` | one-off build into `dist/` |
| `npm run watch` | rebuild on change, no browser |
| `npm start` | launch Firefox against an existing `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint plus `web-ext lint` on the build |
| `npm test` | vitest, offline only |
| `npm run test:live` | hits Google for real; run it when you suspect the endpoint changed |
| `npm run package` | zip for AMO in `web-ext-artifacts/` |

`src/` is never loaded directly — Firefox always runs the build in `dist/`.

The dev run uses its own Firefox profile in `.web-ext-profile/` and keeps it between runs, so
enabled sites and saved cards survive a restart. Delete the directory for a clean slate.

## Layout

```
src/
  background/   event page: message router, translation, per-site enabling
  content/      trigger, tooltip, floating window (injected at runtime only)
  lib/          providers, storage, spaced repetition, shared types
  pages/        popup, options, card manager, review session
  manifest.json
build.mjs       esbuild bundle + static asset copy
```

## Conventions

- Bundles ship **unminified**: AMO reviewers read the shipped code, and minified output requires
  a separate source-code submission.
- All network requests live in the background page. A `fetch` from a content script hits the
  page's CSP and CORS rules, which differ from site to site.
- The free `translate_a/single` endpoint is undocumented and unversioned, so its parser is
  isolated in one file behind fixture tests. When Google changes the format, `npm run test:live`
  fails first and only that file needs fixing.
- A 429 is never retried. When Google is already refusing traffic, retrying is how a throttle
  turns into a block.
- Interface language is English only.

## Licence

MIT
