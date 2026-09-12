/**
 * Builds the source archive AMO asks for.
 *
 * The shipped bundles are produced by esbuild, which both transpiles TypeScript and combines
 * many files into one, so reviewers cannot read the submitted package alone — they need the
 * sources and a way to reproduce the build.
 *
 * Uses `git archive` so the contents are exactly what is committed: no node_modules, no build
 * output, no local profile, and nothing accidentally lying around in the working directory.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'

const OUT_DIR = 'web-ext-artifacts'

const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
const output = `${OUT_DIR}/memory-slot-source-${version}.zip`

const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()
if (dirty !== '') {
  console.warn('[source] uncommitted changes are NOT in the archive:')
  console.warn(dirty)
}

mkdirSync(OUT_DIR, { recursive: true })
execFileSync('git', ['archive', '--format=zip', '--output', output, 'HEAD'], { stdio: 'inherit' })

console.log(`[source] ${output}`)
