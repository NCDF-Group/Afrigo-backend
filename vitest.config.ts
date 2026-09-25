import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/afrigo_test',
      JWT_ACCESS_SECRET: 'test-secret-that-is-long-enough-for-hs256-signing',
      ENCRYPTION_KEY: 'test-encryption-key-that-is-long-enough-to-use',
      CORS_ORIGINS: 'http://localhost:3000'
    }
  }
})
