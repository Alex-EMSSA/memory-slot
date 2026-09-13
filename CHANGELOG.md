# Changelog

All notable changes to Memory Slot. Versions follow [Semantic Versioning](https://semver.org/).

## [1.0.1] — 2026-09-13

First public release on addons.mozilla.org. Same code as 1.0.0, which was signed in the unlisted
channel by mistake; AMO never reuses a version number.

## [1.0.0] — 2026-09-13

Signed unlisted, not published.

### Added

- Privacy policy (`docs/PRIVACY.md`) and listing texts for AMO (`docs/AMO.md`).
- Support link to Ko-fi in the toolbar popup and the settings.
- `npm run screenshots` takes the listing screenshots in a real Firefox.

## [0.1.1] — 2026-09-13

### Added

- Optional Google Cloud Translation API key in the settings, checked live when entered. With a
  key, Cloud Translation is asked first and the free services remain as fallbacks.
- Build instructions and a source archive for AMO review.

## [0.1.0] — 2026-09-12

First signed build, unlisted.

### Added

- Off everywhere by default; enabled per site from the toolbar button, with permission requested
  for that site only. A badge on the button shows when the extension is active on the tab.
- Translation on double-click of a word or selection of a phrase, shown in a tooltip above the
  text that hides itself when you move on.
- Floating card window with the word, translation, languages, context sentence and pronunciation;
  it can be dragged, minimised and closed, and keeps its place across pages.
- Add to deck with duplicate detection and Undo.
- Card manager: search, inline editing, bulk delete, JSON backup with the review schedule,
  JSON import, CSV export for Anki.
- Spaced repetition review (SM-2) driven from the keyboard, with daily limits for new cards and
  reviews.
- Settings: target and source language, tooltip colour, list of enabled sites with a switch-off.
- Translation through Google Translate, falling back to Microsoft Bing and MyMemory, each paused
  with backoff after refusing; results cached for seven days.
- First-run page explaining per-site enabling and what is sent where.
- Keyboard access, ARIA labels and reduced-motion support.
