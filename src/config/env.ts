import { z } from 'zod'

const list = z
  .string()
  .default('')
  .transform(value =>
    value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
  )

const optional = z
  .string()
  .optional()
  .transform(value => (value?.trim() ? value.trim() : undefined))

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url(),
  DATABASE_SSL: z.enum(['true', 'false']).optional(),
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(10),
  CORS_ORIGINS: list,
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  WEB_APP_URL: z.url().default('http://localhost:3000'),
  ADMIN_APP_URL: z.url().default('http://localhost:3100'),
  EMAIL_FROM: z.string().default('Afrigo <no-reply@afrigo.africa>'),
  RESEND_API_KEY: optional,
  GOOGLE_CLIENT_IDS: list,
  PAYSTACK_SECRET_KEY: optional,
  S3_ENDPOINT: optional,
  S3_REGION: optional,
  S3_BUCKET: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  FIREBASE_PROJECT_ID: optional,
  FIREBASE_CLIENT_EMAIL: optional,
  FIREBASE_PRIVATE_KEY: optional,
  DHL_API_KEY: optional,
  REDIS_URL: optional,
  SENTRY_DSN: optional
})

export type Env = z.infer<typeof schema>

function load(): Env {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map(issue => `  ${issue.path.join('.')}: ${issue.message}`).join('\n')
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }
  return parsed.data
}

export const env = load()

export const isProduction = env.NODE_ENV === 'production'
