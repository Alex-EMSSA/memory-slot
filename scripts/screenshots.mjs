/**
 * Takes the AMO listing screenshots in a real Firefox with the built extension installed.
 *
 * Drives Firefox over WebDriver BiDi directly (no geckodriver, no extra dependencies): a
 * throwaway profile, a temporary install of dist/, a local demo article, and a trusted
 * double-click so the content script behaves exactly as it does for a reader.
 *
 * Needs Firefox 140+ and a network connection (the translation is real).
 * Usage: npm run build && node scripts/screenshots.mjs [path-to-firefox]
 */
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const FIREFOX = process.argv[2] ?? defaultFirefox()
const PORT = 9333
const DEMO_PORT = 8765
/** Resolved to 127.0.0.1 by the profile, so the settings list a site rather than "localhost". */
const DEMO_HOST = 'morgenblatt.example'
const OUT_DIR = resolve('docs/screenshots')
const EXTENSION_ID = JSON.parse(readFileSync('dist/manifest.json', 'utf8'))
  .browser_specific_settings.gecko.id
const UUID = '6d1f0c3e-9a52-4c8e-8f3b-2f6a1d7e4b90'
const BASE = `moz-extension://${UUID}`
const VIEWPORT = { width: 1280, height: 800 }

function defaultFirefox() {
  if (process.platform === 'win32') return 'C:\\Program Files\\Mozilla Firefox\\firefox.exe'
  if (process.platform === 'darwin') return '/Applications/Firefox.app/Contents/MacOS/firefox'
  return 'firefox'
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

// --- demo article ---------------------------------------------------------------------------

const ARTICLE = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Warum wir beim Lesen lernen</title>
<style>
  body { margin: 0; background: #faf8f4; color: #2b2a28; font: 19px/1.7 Georgia, 'Times New Roman', serif; }
  header { border-bottom: 1px solid #e6e1d8; padding: 18px 0; background: #fff; }
  .wrap { max-width: 700px; margin: 0 auto; padding: 0 24px; }
  .brand { font: 700 15px/1 system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #8a6d3b; }
  h1 { font-size: 40px; line-height: 1.2; margin: 44px 0 10px; }
  .meta { font: 14px system-ui, sans-serif; color: #857f75; margin-bottom: 30px; }
  p { margin: 0 0 22px; }
</style></head>
<body>
<header><div class="wrap"><span class="brand">Morgenblatt · Wissen</span></div></header>
<main class="wrap">
  <h1>Warum wir beim Lesen am besten lernen</h1>
  <div class="meta">Von Lena Hartmann · 6 Minuten Lesezeit</div>
  <p>Wer eine Sprache lernt, kennt das Gefühl: Man liest einen Artikel, versteht fast alles, und
  dann bleibt man an einem einzigen Wort hängen. Genau in diesem Moment ist das
  <span id="target">Gedächtnis</span> besonders aufnahmefähig, denn das Wort steht in einem
  Zusammenhang, der uns interessiert.</p>
  <p>Forscher sprechen von beiläufigem Lernen. Neue Wörter, die wir in einer echten Geschichte
  entdecken, bleiben länger hängen als Vokabeln aus einer Liste. Entscheidend ist allerdings,
  dass wir ihnen später noch einmal begegnen, bevor wir sie wieder vergessen.</p>
  <p>Deshalb lohnt es sich, unbekannte Wörter nicht nur nachzuschlagen, sondern sie auch
  aufzubewahren und in wachsenden Abständen zu wiederholen. Ein paar Minuten am Tag genügen.</p>
</main>
</body></html>`

const server = createServer((_, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  response.end(ARTICLE)
}).listen(DEMO_PORT)

// --- Firefox ---------------------------------------------------------------------------------

const profile = mkdtempSync(join(tmpdir(), 'memory-slot-shots-'))
writeFileSync(
  join(profile, 'user.js'),
  [
    ['extensions.webextOptionalPermissionPrompts', false],
    ['extensions.webextensions.uuids', JSON.stringify({ [EXTENSION_ID]: UUID })],
    ['browser.shell.checkDefaultBrowser', false],
    ['datareporting.policy.dataSubmissionEnabled', false],
    ['toolkit.telemetry.reportingpolicy.firstRun', false],
    ['browser.aboutwelcome.enabled', false],
    ['ui.systemUsesDarkTheme', 0],
    ['intl.locale.requested', 'en-US'],
    ['network.dns.localDomains', DEMO_HOST],
  ]
    .map(([key, value]) => `user_pref(${JSON.stringify(key)}, ${JSON.stringify(value)});`)
    .join('\n'),
)

const firefox = spawn(FIREFOX, [
  '-headless',
  '-no-remote',
  '-remote-allow-system-access',
  '-profile',
  profile,
  '--remote-debugging-port',
  String(PORT),
])

await new Promise((ready, fail) => {
  const onData = (chunk) => {
    if (String(chunk).includes('WebDriver BiDi listening')) ready()
  }
  firefox.stderr.on('data', onData)
  firefox.stdout.on('data', onData)
  firefox.on('exit', (code) => fail(new Error(`Firefox exited early with ${code}`)))
  setTimeout(() => fail(new Error('Firefox did not open the BiDi port')), 30_000)
})

const socket = new WebSocket(`ws://127.0.0.1:${PORT}/session`)
await new Promise((open) => socket.addEventListener('open', open, { once: true }))

let nextId = 1
const pending = new Map()
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  const waiter = pending.get(message.id)
  if (!waiter) return
  pending.delete(message.id)
  if (message.type === 'error')
    waiter.fail(new Error(`${waiter.method}: ${message.error}: ${message.message}`))
  else waiter.done(message.result)
})

function send(method, params = {}) {
  const id = nextId++
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((done, fail) => pending.set(id, { done, fail, method }))
}

async function run() {
  await send('session.new', { capabilities: {} })
  await send('webExtension.install', {
    extensionData: { type: 'path', path: resolve('dist') },
  })

  const { context } = await send('browsingContext.create', { type: 'tab' })
  await send('browsingContext.setViewport', { context, viewport: VIEWPORT })

  const go = (url) => send('browsingContext.navigate', { context, url, wait: 'complete' })
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send('script.evaluate', {
      expression,
      target: { context },
      awaitPromise: true,
    })
    if (exceptionDetails) throw new Error(`evaluate: ${exceptionDetails.text}`)
    return result?.value
  }
  // captureScreenshot refuses moz-extension pages, so the chrome window draws the tab instead.
  const { contexts: chrome } = await send('browsingContext.getTree', { 'moz:scope': 'chrome' })
  const chromeEval = async (expression) => {
    const { result, exceptionDetails } = await send('script.evaluate', {
      expression,
      target: { context: chrome[0].context },
      awaitPromise: true,
    })
    if (exceptionDetails) throw new Error(`chrome: ${exceptionDetails.text}`)
    return result?.value
  }
  const save = (name, data) => {
    writeFileSync(join(OUT_DIR, `${name}.png`), Buffer.from(data, 'base64'))
    console.log(`[shots] ${name}.png`)
  }
  const shoot = async (name) =>
    save(
      name,
      await chromeEval(`(async () => {
        const bitmap = await gBrowser.selectedBrowser.browsingContext.currentWindowGlobal.drawSnapshot(null, 1, 'white')
        const canvas = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        canvas.getContext('2d').drawImage(bitmap, 0, 0)
        return canvas.toDataURL('image/png').split(',')[1]
      })()`),
    )

  mkdirSync(OUT_DIR, { recursive: true })
  await sleep(1500)

  // First-run page. Taken before anything is enabled, as a new user sees it.
  await go(`${BASE}/welcome.html`)
  await sleep(500)
  await shoot('6-welcome')

  // Set up as a reader of German who wants English, and enable the demo site.
  await evaluate(`(async () => {
    await browser.storage.local.set({ 'settings.v1': {
      targetLang: 'en', sourceLang: 'auto', apiKey: '', tooltipColour: '', newPerDay: 20, reviewsPerDay: 200,
    } })
  })()`)
  // permissions.request wants a click on a Firefox prompt; grant the same origin from chrome.
  await chromeEval(`(async () => {
    const { ExtensionPermissions } = ChromeUtils.importESModule('resource://gre/modules/ExtensionPermissions.sys.mjs')
    const extension = WebExtensionPolicy.getByID(${JSON.stringify(EXTENSION_ID)}).extension
    await ExtensionPermissions.add(extension.id, { permissions: [], origins: ['http://${DEMO_HOST}/*'] }, extension)
  })()`)
  await sleep(1000)

  // The demo article, with the site already switched on.
  await go(`http://${DEMO_HOST}:${DEMO_PORT}/`)
  await sleep(1500)

  // Toolbar popup, pinned and opened for real, drawn over the article it belongs to.
  save(
    '2-enable',
    await chromeEval(`(async () => {
      const widget = ${JSON.stringify(EXTENSION_ID)}.toLowerCase().replace(/[^a-z0-9_-]/g, '_') + '-browser-action'
      CustomizableUI.addWidgetToArea(widget, CustomizableUI.AREA_NAVBAR)
      const node = CustomizableUI.getWidget(widget).forWindow(window).node
      ;(node.querySelector('.unified-extensions-item-action-button') ?? node).click()

      let popup = null
      for (let i = 0; i < 50 && !popup; i++) {
        await new Promise((r) => setTimeout(r, 100))
        popup = document.querySelector('browser.webextension-popup-browser')
      }
      if (!popup) throw new Error('popup did not open')
      await new Promise((r) => setTimeout(r, 1200))

      const page = await gBrowser.selectedBrowser.browsingContext.currentWindowGlobal.drawSnapshot(null, 1, 'white')
      const shot = await popup.browsingContext.currentWindowGlobal.drawSnapshot(null, 1, 'white')
      for (const panel of document.querySelectorAll('panel')) if (panel.state === 'open') panel.hidePopup()

      const canvas = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas')
      canvas.width = page.width
      canvas.height = page.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(page, 0, 0)
      const x = page.width - shot.width - 16
      const y = 12
      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.22)'
      ctx.shadowBlur = 24
      ctx.shadowOffsetY = 6
      ctx.beginPath()
      ctx.roundRect(x, y, shot.width, shot.height, 8)
      ctx.fillStyle = 'white'
      ctx.fill()
      ctx.restore()
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(x, y, shot.width, shot.height, 8)
      ctx.clip()
      ctx.drawImage(shot, x, y)
      ctx.restore()
      return canvas.toDataURL('image/png').split(',')[1]
    })()`),
  )
  await sleep(500)
  // A trusted double-click on one word, so the content script sees what a reader would do.
  const box = await evaluate(`(() => {
    const r = document.getElementById('target').getBoundingClientRect()
    return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]
  })()`)
  const [x, y] = box.map((n) => n.value)
  const click = [
    { type: 'pointerDown', button: 0 },
    { type: 'pointerUp', button: 0 },
  ]
  await send('input.performActions', {
    context,
    actions: [
      {
        type: 'pointer',
        id: 'mouse',
        parameters: { pointerType: 'mouse' },
        actions: [
          { type: 'pointerMove', x, y },
          ...click,
          { type: 'pause', duration: 60 },
          ...click,
        ],
      },
    ],
  })
  await sleep(3000)
  await shoot('1-translate')

  // Seed a small deck so the review and the manager have something to show.
  await go(`${BASE}/manager.html`)
  await evaluate(`(async () => {
    const source = { sourceUrl: 'http://${DEMO_HOST}:${DEMO_PORT}/', sourceTitle: 'Warum wir beim Lesen lernen' }
    const cards = [
      ['beiläufig', 'incidental', 'Forscher sprechen von beiläufigem Lernen.'],
      ['aufbewahren', 'to keep', 'Unbekannte Wörter nicht nur nachschlagen, sondern auch aufbewahren.'],
      ['Abstand', 'interval', 'In wachsenden Abständen wiederholen.'],
      ['genügen', 'to be enough', 'Ein paar Minuten am Tag genügen.'],
      ['Zusammenhang', 'context', 'Das Wort steht in einem Zusammenhang, der uns interessiert.'],
      ['hängen bleiben', 'to get stuck', 'Dann bleibt man an einem einzigen Wort hängen.'],
      ['aufnahmefähig', 'receptive', 'Das Gedächtnis ist besonders aufnahmefähig.'],
      ['begegnen', 'to encounter', 'Dass wir ihnen später noch einmal begegnen.'],
    ]
    for (const [front, back, context] of cards) {
      await browser.runtime.sendMessage({ type: 'add-card', front, back, langFrom: 'de', langTo: 'en', context, ...source })
    }
  })()`)

  // Review, answer shown.
  await go(`${BASE}/review.html`)
  await sleep(800)
  await evaluate(
    `document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))`,
  )
  await sleep(500)
  await shoot('3-review')

  // Card manager.
  await go(`${BASE}/manager.html`)
  await sleep(800)
  await shoot('4-cards')

  // Settings.
  await go(`${BASE}/options.html`)
  await sleep(800)
  await shoot('5-settings')
}

try {
  await run()
} finally {
  socket.close()
  firefox.kill()
  server.close()
  await sleep(1000)
  rmSync(profile, { recursive: true, force: true })
}
