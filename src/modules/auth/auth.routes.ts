import { Router } from 'express'
import { audit } from '../../lib/audit.js'
import { clientContext } from '../../lib/context.js'
import { idSchema } from '../../lib/pagination.js'
import { parse } from '../../lib/validate.js'
import { requireAuth } from '../../middleware/authenticate.js'
import { authLimiter, sensitiveLimiter } from '../../middleware/rate-limit.js'
import { membershipsOf } from '../organisations/organisations.service.js'
import { changePasswordSchema, forgotSchema, googleSchema, loginSchema, mfaChallengeSchema, mfaCodeSchema, mfaEnableSchema, mfaSetupSchema, refreshSchema, registerSchema, resetSchema, tokenSchema } from './auth.schemas.js'
import * as auth from './auth.service.js'

export const authRouter = Router()

authRouter.post('/register', authLimiter, async (request, response) => {
  const input = parse(registerSchema, request.body)
  const result = await auth.register(input, clientContext(request))
  await audit({ actorId: result.user.id, action: 'auth.register', targetType: 'user', targetId: result.user.id, request })
  response.status(201).json(result)
})

authRouter.post('/login', authLimiter, async (request, response) => {
  const input = parse(loginSchema, request.body)
  try {
    const result = await auth.login(input, clientContext(request))
    if ('user' in result) await audit({ actorId: result.user.id, action: 'auth.login', targetType: 'user', targetId: result.user.id, metadata: { platform: input.platform ?? null }, request })
    response.json(result)
  } catch (error) {
    await audit({ action: 'auth.login_failed', metadata: { email: input.email }, request })
    throw error
  }
})

authRouter.post('/google', authLimiter, async (request, response) => {
  const input = parse(googleSchema, request.body)
  const result = await auth.loginWithGoogle(input, clientContext(request))
  if ('user' in result) await audit({ actorId: result.user.id, action: 'auth.login_google', targetType: 'user', targetId: result.user.id, request })
  response.json(result)
})

authRouter.post('/mfa/challenge', authLimiter, async (request, response) => {
  const input = parse(mfaChallengeSchema, request.body)
  const result = await auth.completeMfaChallenge(input, clientContext(request))
  await audit({ actorId: result.user.id, action: input.recoveryCode ? 'auth.login_recovery_code' : 'auth.login', targetType: 'user', targetId: result.user.id, metadata: { mfa: true }, request })
  response.json(result)
})

authRouter.post('/mfa/setup', authLimiter, async (request, response) => {
  const { mfaToken } = parse(mfaSetupSchema, request.body)
  if (mfaToken) {
    response.json(await auth.setupWithMfaToken(mfaToken))
    return
  }
  await requireAuth(request, response, () => {})
  response.json(await auth.beginMfaSetup(request.auth!.user))
})

authRouter.post('/mfa/enable', authLimiter, async (request, response) => {
  const { mfaToken, code } = parse(mfaEnableSchema, request.body)
  if (mfaToken) {
    const result = await auth.enableWithMfaToken(mfaToken, code, clientContext(request))
    await audit({ actorId: result.user.id, action: 'auth.mfa_enabled', targetType: 'user', targetId: result.user.id, request })
    response.json(result)
    return
  }
  await requireAuth(request, response, () => {})
  const { recoveryCodes } = await auth.enableMfa(request.auth!.user, code)
  await audit({ actorId: request.auth!.user.id, action: 'auth.mfa_enabled', targetType: 'user', targetId: request.auth!.user.id, request })
  response.json({ recoveryCodes })
})

authRouter.post('/mfa/disable', sensitiveLimiter, requireAuth, async (request, response) => {
  const { code } = parse(mfaCodeSchema, request.body)
  await auth.disableMfa(request.auth!.user, code)
  await audit({ actorId: request.auth!.user.id, action: 'auth.mfa_disabled', targetType: 'user', targetId: request.auth!.user.id, request })
  response.status(204).end()
})

authRouter.post('/mfa/recovery-codes', sensitiveLimiter, requireAuth, async (request, response) => {
  const { code } = parse(mfaCodeSchema, request.body)
  const recoveryCodes = await auth.regenerateRecoveryCodes(request.auth!.user, code)
  await audit({ actorId: request.auth!.user.id, action: 'auth.mfa_recovery_codes_regenerated', targetType: 'user', targetId: request.auth!.user.id, request })
  response.json({ recoveryCodes })
})

authRouter.post('/refresh', authLimiter, async (request, response) => {
  const { refreshToken } = parse(refreshSchema, request.body)
  response.json(await auth.refresh(refreshToken, clientContext(request)))
})

authRouter.post('/logout', async (request, response) => {
  const { refreshToken } = parse(refreshSchema, request.body)
  await auth.logout(refreshToken)
  response.status(204).end()
})

authRouter.post('/logout-all', requireAuth, async (request, response) => {
  await auth.logoutEverywhere(request.auth!.user.id)
  await audit({ actorId: request.auth!.user.id, action: 'auth.logout_all', targetType: 'user', targetId: request.auth!.user.id, request })
  response.status(204).end()
})

authRouter.get('/me', requireAuth, async (request, response) => {
  response.json({ user: auth.publicUser(request.auth!.user), organisations: await membershipsOf(request.auth!.user.id) })
})

authRouter.post('/email/verify', authLimiter, async (request, response) => {
  const { token } = parse(tokenSchema, request.body)
  const user = await auth.verifyEmail(token)
  await audit({ actorId: user.id, action: 'auth.email_verified', targetType: 'user', targetId: user.id, request })
  response.json({ user })
})

authRouter.post('/email/resend', sensitiveLimiter, requireAuth, async (request, response) => {
  await auth.createEmailVerification(request.auth!.user)
  response.status(202).json({ message: 'If your email is not verified yet, a new link is on its way.' })
})

authRouter.post('/password/forgot', sensitiveLimiter, async (request, response) => {
  const { email } = parse(forgotSchema, request.body)
  await auth.requestPasswordReset(email)
  await audit({ action: 'auth.password_reset_requested', metadata: { email }, request })
  response.status(202).json({ message: 'If an account exists for that email, a reset link is on its way.' })
})

authRouter.post('/password/reset', authLimiter, async (request, response) => {
  const { token, password } = parse(resetSchema, request.body)
  const result = await auth.resetPassword(token, password)
  await audit({ actorId: result.userId, action: result.invite ? 'auth.invite_accepted' : 'auth.password_reset', targetType: 'user', targetId: result.userId, request })
  response.status(204).end()
})

authRouter.post('/password/change', sensitiveLimiter, requireAuth, async (request, response) => {
  const { currentPassword, newPassword } = parse(changePasswordSchema, request.body)
  await auth.changePassword(request.auth!.user, request.auth!.sessionId, currentPassword, newPassword)
  await audit({ actorId: request.auth!.user.id, action: 'auth.password_changed', targetType: 'user', targetId: request.auth!.user.id, request })
  response.status(204).end()
})

authRouter.get('/sessions', requireAuth, async (request, response) => {
  response.json({ items: await auth.listSessions(request.auth!.user.id, request.auth!.sessionId) })
})

authRouter.delete('/sessions/:id', requireAuth, async (request, response) => {
  const { id } = parse(idSchema, request.params)
  await auth.revokeSession(request.auth!.user.id, id)
  response.status(204).end()
})
