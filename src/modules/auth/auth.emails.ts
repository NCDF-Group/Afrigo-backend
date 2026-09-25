import { env } from '../../config/env.js'
import { layout, mailer } from '../../lib/mailer.js'

export function sendVerificationEmail(to: string, firstName: string, token: string) {
  const url = `${env.WEB_APP_URL}/verify-email?token=${encodeURIComponent(token)}`
  const content = layout({
    heading: `Confirm your email, ${firstName}`,
    body: 'Welcome to AfriGoOS. Confirm your email address to secure your account and unlock verified trading.',
    action: { label: 'Confirm email', url },
    footnote: 'This link expires in 24 hours. If you did not create an AfriGoOS account, you can ignore this email.'
  })
  return mailer.send({ to, subject: 'Confirm your AfriGoOS email', ...content })
}

export function sendPasswordResetEmail(to: string, firstName: string, token: string, staff: boolean) {
  const url = `${staff ? env.ADMIN_APP_URL : env.WEB_APP_URL}/reset-password?token=${encodeURIComponent(token)}`
  const content = layout({
    heading: `Reset your password, ${firstName}`,
    body: 'We received a request to reset the password on your AfriGoOS account.',
    action: { label: 'Choose a new password', url },
    footnote: 'This link expires in 1 hour. If you did not ask for this, you can ignore this email and your password will stay the same.'
  })
  return mailer.send({ to, subject: 'Reset your AfriGoOS password', ...content })
}

export function sendStaffInviteEmail(to: string, firstName: string, role: string, token: string) {
  const url = `${env.ADMIN_APP_URL}/reset-password?token=${encodeURIComponent(token)}&invite=1`
  const content = layout({
    heading: `You have been invited to AfriGoOS Admin`,
    body: `Hello ${firstName}, you have been given ${role} access to the AfriGoOS operations console. Set your password to get started.`,
    action: { label: 'Set your password', url },
    footnote: 'This invitation expires in 72 hours.'
  })
  return mailer.send({ to, subject: 'Your AfriGoOS Admin invitation', ...content })
}

export function sendPasswordChangedEmail(to: string, firstName: string) {
  const content = layout({
    heading: 'Your password was changed',
    body: `Hello ${firstName}, the password on your AfriGoOS account was just changed and other devices were signed out.`,
    footnote: 'If this was not you, reset your password straight away and contact AfriGoOS support.'
  })
  return mailer.send({ to, subject: 'Your AfriGoOS password was changed', ...content })
}
