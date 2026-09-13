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
| `npm run source` | source archive for AMO review, from the committed tree |
| `npm run screenshots` | AMO screenshots in `docs/screenshots/`, taken in a real headless Firefox |
| `npm run sign` | signed .xpi for everyday use, see below |

`src/` is never loaded directly — Firefox always runs the build in `dist/`.

The dev run uses its own Firefox profile in `.web-ext-profile/` and keeps it between runs, so
enabled sites and saved cards survive a restart. Delete the directory for a clean slate.

## Build instructions for AMO reviewers

The submitted package is built with [esbuild](https://esbuild.github.io/): TypeScript is
transpiled to JavaScript and the modules are bundled into one file per entry point. Nothing is
minified or obfuscated, so the submitted files are readable, but they are generated — these are
the steps to reproduce them byte for byte.

**Operating system**

Any of Windows, macOS or Linux. Nothing in the build is platform specific: it was developed on
Windows 11 and runs on Ubuntu in CI (`.github/workflows/ci.yml`), producing the same output.

**Required software**

| Program | Version | How to install |
| --- | --- | --- |
| Node.js | 22 LTS (any 20 or newer works) | [nodejs.org/en/download](https://nodejs.org/en/download), or `winget install OpenJS.NodeJS.LTS` on Windows, `sudo apt install nodejs npm` on Debian and Ubuntu, `brew install node` on macOS |
| npm | ships with Node.js | — |

Nothing else is needed. The build reaches the network only during `npm ci`, to fetch the
dependencies pinned in `package-lock.json`.

**Steps**

```bash
npm ci          # exact dependency versions from package-lock.json
npm run build   # the whole build: writes the extension to dist/
```

`npm run build` is the build script referred to above; it runs `node build.mjs` and nothing
else. There is no separate bundler config, task runner or code generation step.

`dist/` is then identical to the contents of the submitted package. `build.mjs` is the whole
build: it runs esbuild over the entry points listed there and copies the static files
(`manifest.json`, HTML, CSS, icons, `_locales`) verbatim.

**Optional checks**

```bash
npm test        # 249 unit tests, offline
npm run lint    # ESLint plus web-ext lint on the built extension
```

**Where the shipped files come from**

| Shipped file | Built from |
| --- | --- |
| `background.js` | `src/background/index.ts` and its imports |
| `content.js` | `src/content/index.ts` and its imports |
| `popup.js`, `options.js`, `manager.js`, `review.js`, `welcome.js` | the matching `src/pages/*/*.ts` |
| everything else | copied unchanged from `src/` |

`npm run source` produces the source archive from the committed tree.

## Installing it in your everyday Firefox

Release Firefox refuses to install an unsigned extension permanently, and a temporary install
from `about:debugging` disappears when the browser restarts. To actually live with it for a
while, sign it on AMO in the **unlisted** channel: no public listing, automated review, and a
`.xpi` that installs like any other add-on.

1. Sign in at [addons.mozilla.org](https://addons.mozilla.org) and create API credentials at
   **Tools → Manage API Keys**.
2. Put them in the environment — never in a file in this repository:

   ```bash
   export WEB_EXT_API_KEY="user:12345678:123"
   export WEB_EXT_API_SECRET="…"
   ```

   On Windows PowerShell: `$env:WEB_EXT_API_KEY = "…"`.
3. `npm version patch` — bumps the number, syncs it into the manifest, commits and tags. AMO
   refuses a version it has already seen, so every signed build needs a new one.
4. `npm run sign` — the signed `.xpi` lands in `web-ext-artifacts/`. Open it in Firefox, or drag
   it onto the browser window.

Two things that are permanent from the first signed build onwards:

- **The extension id** (`browser_specific_settings.gecko.id`). Change it before signing or never.
- Cards and settings belong to that id, so keeping it means everything collected while testing
  carries over to the published version later.

An unlisted build does not update itself. Each new version means signing again and installing
the new `.xpi` over the old one; settings and cards survive that.

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
