# Memory Slot — Privacy Policy

_Last updated: 13 September 2026_

Memory Slot is a Firefox extension that translates a word or phrase you select and lets you save it
as a flashcard. It has no server of its own, no account and no analytics. This page lists every
piece of data that leaves your computer, and everything the extension keeps on it.

## Off until you turn it on

Memory Slot does not run on any website until you enable it for that site from the toolbar button.
Firefox asks for your permission at that moment, for that one site. On sites you have not enabled,
the extension has no access to the page: it reads nothing and sends nothing.

You can switch a site off again from the toolbar button, from the extension's settings, or by
removing the permission in Firefox's add-on manager.

## What is sent, and to whom

When you double-click a word or select a phrase on an enabled site, the **selected text** is sent
to a translation service, together with the **target language** and, if you set one, the
**source language**. That is the whole request. The page address, the page title, the sentence
around the word, your saved cards and your settings are never sent.

The request goes to the first service in this list that accepts it:

1. **Google Cloud Translation API** (Google), only if you entered your own API key in the
   settings.
2. **Google Translate**, `translate.googleapis.com` (Google), by default.
3. **Bing Translator**, `www.bing.com` (Microsoft), if Google refuses the request.
4. **MyMemory**, `api.mymemory.translated.net` (Translated S.r.l.), if Bing refuses as well.

If you entered a Google Cloud API key, that key is sent to Google with each request so that Google
can bill your account. It is sent in a request header, not in the address.

To use Bing, the extension first loads the public `www.bing.com/translator` page to obtain the
short-lived access token that page contains. This request carries no text of yours.

All requests are made **without cookies**, so they are not tied to any Google or Microsoft account
you may be signed in to. Like any request on the internet, they do reveal your IP address to the
service. What each service does with the text it receives is governed by its own policy:

- Google: https://policies.google.com/privacy
- Microsoft: https://privacy.microsoft.com/privacystatement
- MyMemory / Translated: see https://mymemory.translated.net

When a translation is ready, the extension sends nothing else. Language detection for MyMemory is
done by Firefox on your computer. The pronunciation button uses the speech voices built into
Firefox and your operating system; Memory Slot does not send the text anywhere for it.

## What is stored on your computer

Everything below stays in your Firefox profile and is never uploaded by Memory Slot:

- **Your cards**: the word or phrase, its translation, the languages, the sentence it came from,
  the address and title of the page, and the review schedule.
- **Settings**: languages, colours, your Google Cloud API key if you entered one.
- **A translation cache** of recent results, so the same word is not sent twice. Entries expire
  after seven days.
- **Small working records**: the position of the card window, daily review counts, and how long
  to wait before asking a service that recently refused.

The list of enabled sites is kept by Firefox itself, as the permissions you granted.

Exporting cards writes a file only when you ask for it, to a place you choose. Removing the
extension deletes all of the above.

## What Memory Slot does not do

- No analytics, telemetry, crash reporting or tracking of any kind.
- No reading of pages on sites you have not enabled.
- No browsing history, no access to your tabs beyond the one you are looking at when you open the
  toolbar button.
- No advertising, and no selling or sharing of data. There is no data of yours on our side to sell.

## Changes

If the extension ever starts sending anything new, this policy will be updated before that version
is released, and the change will be listed in the changelog.

## Contact

Questions and reports: https://github.com/Alex-EMSSA/memory-slot/issues
