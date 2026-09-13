# AMO listing

Everything to paste into the add-on's pages on addons.mozilla.org. Field names follow the
Developer Hub forms.

---

## Name

Memory Slot

## Add-on URL

`memory-slot`

## Summary

_Limit: 250 characters. Matches `extDescription` in `src/_locales/en/messages.json`._

```
Double-click a word or select a phrase to see its translation and save it as a flashcard. Off by default — you enable it per site.
```

## Description

_Markdown (the form says "Some Markdown supported"); HTML tags would show as text._

```markdown
Learn words while you read, without leaving the page.

Double-click a word, or select a phrase with the mouse. The translation appears right above the text, and a card with the word, its translation and the sentence it came from opens in a small floating window. One click on Add to deck saves it, and spaced repetition brings it back just before you would forget it.

**Off until you turn it on**
Memory Slot does nothing on any website until you enable it there from the toolbar button. On sites you have not enabled, it cannot read the page at all. Enable it on the news site, forum or documentation you read in another language, and leave everything else alone.

**How it works**

- Double-click a word or select a phrase — no extra buttons, no shortcuts to remember.
- The translation shows above the text and disappears on its own when you move on.
- The card window can be dragged anywhere, minimised or closed, and stays where you put it on every page.
- Pronunciation using your system's voices.

**Review**

- Spaced repetition (SM-2): new words come back soon, known words at growing intervals.
- Fully keyboard-driven: Space shows the answer, 1–4 grades it.
- Daily limits for new words and reviews, so a busy week does not turn into a wall of cards.

**Your cards are yours**

- Stored only in your browser. No account, no server, no analytics.
- Search, edit and delete cards in the card manager.
- Export a full backup as JSON, including the review schedule, and import it back.
- Export for Anki as a CSV file.

**Translation**
Works out of the box, no API key needed. Memory Slot asks Google Translate first and falls back to Microsoft Bing and then MyMemory when a service is busy. If you have a Google Cloud Translation API key, you can add it in the settings to use it first.

**Privacy**
The text you select, and the languages, are sent to the translation service — nothing else: not the page address, not the surrounding text, not your cards. Requests carry no cookies. See the privacy policy for the full list.

**Known limitations**

- Enabled per site, on purpose.
- No sync between devices. Cards live in your Firefox profile; export them for a backup.
- Does not work where there is no ordinary text selection: the built-in PDF viewer, Google Docs, Figma and similar editors.
- Does not trigger inside text fields, so it never gets in the way of typing.
- Needs an internet connection; translation quality is that of the service used.
- Interface in English only.

Memory Slot is free and open source (MIT): https://github.com/Alex-EMSSA/memory-slot
```

## Screenshots

In `docs/screenshots/`, 1280×800, regenerated with `npm run screenshots`. Upload in this order;
the captions go in each screenshot's description field.

| File | Caption |
| --- | --- |
| `1-translate.png` | Double-click a word: the translation appears above it, the card opens top right. |
| `2-enable.png` | Off everywhere until you switch it on for a site from the toolbar button. |
| `3-review.png` | Spaced repetition, one key per answer. |
| `4-cards.png` | Every card with its sentence and source. Search, edit, export for Anki. |
| `5-settings.png` | One short settings page, including the list of enabled sites. |
| `6-welcome.png` | The first-run page says plainly what leaves your computer. |

## Categories

- Language Support

## Tags

`translation`, `translate`, `flashcards`, `language learning`, `vocabulary`, `spaced repetition`,
`anki`, `dictionary`

## Support

- Support site: `https://github.com/Alex-EMSSA/memory-slot/issues`
- Support email: _leave empty unless you want a public address_

## Homepage

`https://github.com/Alex-EMSSA/memory-slot`

## Licence

MIT

## Privacy policy

Paste the body of [PRIVACY.md](PRIVACY.md).

## Contributions

`https://ko-fi.com/alexems` — the same address as `SUPPORT_URL` in `src/pages/popup/popup.ts` and
`src/pages/options/options.ts`.

---

## Notes to reviewer

_Only reviewers see this. Plain text._

```
Thank you for reviewing Memory Slot.

WHAT IT DOES
Translates a word the user double-clicks (or a phrase they select) and lets them save it as a flashcard for spaced repetition. Cards and settings are stored locally only.

HOW TO TEST
1. Open any page, e.g. https://en.wikipedia.org/wiki/Firefox
2. Click the toolbar button and switch on "Enable on this site". Firefox asks for permission for that site.
3. Double-click a word. A translation appears above it and a card window opens top right.
4. Click "Add to deck", then open Review from the toolbar popup.
No account or API key is needed.

PERMISSIONS
- No content_scripts in the manifest. optional_host_permissions: <all_urls> is requested for one origin at a time, from a click on the popup toggle, and the content script is then registered with scripting.registerContentScripts for that origin only (src/background/site-gate.ts). Removing the permission unregisters it.
- scripting: the registration above, plus a one-off executeScript from the popup (src/pages/popup/popup.ts) so the current tab works without a reload.
- activeTab: the popup needs the current tab's address to name the site and request permission for it. We deliberately avoided the tabs permission.
- storage: settings, a 7-day translation cache and small state (window position, review counts).
- host_permissions are the four translation endpoints and nothing else.

NETWORK REQUESTS
All requests are made from the background page with credentials: 'omit'. Only the selected text and the language pair are sent.
- translate.googleapis.com/translate_a/single?client=gtx — Google Translate's keyless endpoint, the default (src/lib/providers/google-gtx.ts).
- translation.googleapis.com/language/translate/v2 — the official Cloud Translation API, used only if the user enters their own key in the settings; the key goes in the X-Goog-Api-Key header (src/lib/providers/google-cloud.ts).
- www.bing.com — fallback when Google refuses. There is no keyless Bing API, so the extension loads www.bing.com/translator (no cookies) to read the short-lived token that page embeds, then posts to www.bing.com/ttranslatev3 (src/lib/providers/bing.ts).
- api.mymemory.translated.net/get — last fallback (src/lib/providers/mymemory.ts).
Each provider that refuses (429/403) is paused with exponential backoff before being asked again, so the extension does not hammer any of them.
The data_collection_permissions key declares websiteContent for this reason.

SOURCE CODE
The shipped JavaScript is bundled from TypeScript with esbuild, not minified. The source archive is attached. To reproduce the build:
  npm ci
  npm run build
The output in dist/ matches the submitted package. Full instructions, including required Node.js version, are in README.md under "Build instructions for AMO reviewers".
```
