/**
 * Copies the version from package.json into the manifest.
 *
 * npm runs this from the `version` script, after bumping package.json and before the commit,
 * so `npm version patch` moves both in one step. The two numbers must agree: AMO reads the
 * manifest, everything else reads package.json, and a mismatch is only noticed when a signed
 * build turns out to carry the wrong number.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const MANIFEST = 'src/manifest.json'

const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))

if (manifest.version === version) {
  console.log(`[version] manifest already at ${version}`)
} else {
  manifest.version = version
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.log(`[version] manifest set to ${version}`)
}
