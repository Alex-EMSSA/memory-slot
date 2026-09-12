import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Live tests hit Google for real. They are run on demand with `npm run test:live`,
    // never in CI, where a network hiccup at Google would fail an unrelated build.
    exclude: ['node_modules/**', 'dist/**', 'test/live/**'],
  },
})
