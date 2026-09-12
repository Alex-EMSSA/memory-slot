/** web-ext reads this automatically. dist/ is the built extension, src/ is never loaded directly. */
import { fileURLToPath } from 'node:url'

/**
 * Must be an absolute path: given a relative value web-ext passes `-P <value>`, which Firefox
 * reads as a profile *name* from profiles.ini, silently starts without the debugger server and
 * leaves web-ext hanging on ECONNREFUSED.
 */
const profileDir = fileURLToPath(new URL('.web-ext-profile', import.meta.url))

export default {
  sourceDir: 'dist',
  run: {
    // A plain article page is the fastest way to eyeball the extension after a rebuild.
    startUrl: ['https://en.wikipedia.org/wiki/Firefox'],
    // Keep the profile between runs so enabled sites and saved cards survive a restart.
    firefoxProfile: profileDir,
    profileCreateIfMissing: true,
    keepProfileChanges: true,
  },
  build: {
    overwriteDest: true,
  },
}
