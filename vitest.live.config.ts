import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/live/**/*.test.ts'],
    testTimeout: 20_000,
    // Sequential: firing parallel requests at the free endpoint is how it starts refusing us.
    fileParallelism: false,
  },
})
