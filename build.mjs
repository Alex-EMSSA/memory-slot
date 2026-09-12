/**
 * Build script for the Memory Slot extension.
 *
 * Bundles TypeScript entry points with esbuild and copies static assets into dist/.
 * Output is intentionally NOT minified: AMO reviewers read the shipped code, and
 * minified bundles require a separate source-code submission.
 *
 *   node build.mjs            one-off build
 *   node build.mjs --watch    rebuild on change
 *   node build.mjs --watch --run   rebuild on change and launch Firefox via web-ext
 */
import { context } from 'esbuild'
import { cp, mkdir, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'

const watch = process.argv.includes('--watch')
const run = process.argv.includes('--run')
const outdir = 'dist'

/** Files copied verbatim: [source, destination relative to outdir]. */
const STATIC_ASSETS = [
  ['src/manifest.json', 'manifest.json'],
  ['src/icons', 'icons'],
  ['src/_locales', '_locales'],
  ['src/pages/popup/popup.html', 'popup.html'],
  ['src/pages/popup/popup.css', 'popup.css'],
]

async function copyStatic() {
  await mkdir(outdir, { recursive: true })
  for (const [from, to] of STATIC_ASSETS) {
    await cp(from, `${outdir}/${to}`, { recursive: true })
  }
}

/** Re-copies static assets after every esbuild pass, so watch mode picks up HTML/CSS too. */
const staticAssetsPlugin = {
  name: 'static-assets',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length === 0) await copyStatic()
    })
  },
}

await rm(outdir, { recursive: true, force: true })

const ctx = await context({
  entryPoints: {
    background: 'src/background/index.ts',
    popup: 'src/pages/popup/popup.ts',
  },
  outdir,
  bundle: true,
  format: 'iife',
  target: 'firefox128',
  platform: 'browser',
  charset: 'utf8',
  minify: false,
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info',
  plugins: [staticAssetsPlugin],
})

if (watch) {
  await ctx.watch()
  console.log(`[build] watching, output in ${outdir}/`)
  if (run) {
    // web-ext reloads the extension itself whenever dist/ changes.
    const webExt = spawn('npx', ['web-ext', 'run'], { stdio: 'inherit', shell: true })
    webExt.on('exit', async (code) => {
      await ctx.dispose()
      process.exit(code ?? 0)
    })
  }
} else {
  await ctx.rebuild()
  await ctx.dispose()
  console.log(`[build] done, output in ${outdir}/`)
}
