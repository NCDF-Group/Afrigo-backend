import { z } from 'zod'
import { PLATFORMS } from '../../lib/roles.js'

export const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address.'))

export const password = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(128, 'Use at most 128 characters.')
  .regex(/[A-Za-z]/, 'Include at least one letter.')
  .regex(/\d/, 'Include at least one number.')

const name = z.string().trim().min(1, 'Required.').max(80)

export const platform = z.enum(PLATFORMS).optional()

export const registerSchema = z.object({
  firstName: name,
  lastName: name,
  email,
  password,
  phone: z.string().trim().max(32).optional(),
  country: z.string().trim().length(2, 'Use a two letter country code.').toLowerCase().optional(),
  platform
})

export const loginSchema = z.object({ email, password: z.string().min(1, 'Enter your password.').max(128), platform })

export const googleSchema = z.object({ idToken: z.string().min(20).max(4096), platform })

export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(512) })

export const tokenSchema = z.object({ token: z.string().min(20).max(512) })

export const forgotSchema = z.object({ email })

export const resetSchema = z.object({ token: z.string().min(20).max(512), password })

export const changePasswordSchema = z.object({ currentPassword: z.string().max(128).optional(), newPassword: password })
