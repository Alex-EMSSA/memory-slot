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
    // Override to land on the site you are debugging: MS_START_URL=https://example.com npm run dev
    startUrl: [process.env.MS_START_URL ?? 'https://en.wikipedia.org/wiki/Firefox'],
    // Keep the profile between runs so enabled sites and saved cards survive a restart.
    firefoxProfile: profileDir,
    profileCreateIfMissing: true,
    keepProfileChanges: true,
    /**
     * Mirror console output from the extension (chrome) and from content scripts (content)
     * onto stdout, so a dev run shows what the extension is doing without opening DevTools.
     */
    pref: ['devtools.console.stdout.chrome=true', 'devtools.console.stdout.content=true'],
  },
  build: {
    overwriteDest: true,
  },
}
