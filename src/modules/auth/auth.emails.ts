import { env } from '../../config/env.js'
import { layout, mailer } from '../../lib/mailer.js'

const when = () => new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(new Date()) + ' UTC'

export function sendVerificationEmail(to: string, firstName: string, token: string) {
  const content = layout({
    preheader: 'One tap to confirm your email and start setting up your business on AfriGoOS.',
    heading: `Welcome to AfriGoOS, ${firstName}`,
    body: ['You are one step away from trading across Africa. Confirm your email address to secure your account and set up your business profile.', 'Once confirmed, you can publish products and buyer requests, receive enquiries and manage trade cases in one workspace.'],
    action: { label: 'Confirm my email', url: `${env.WEB_APP_URL}/verify-email?token=${encodeURIComponent(token)}` },
    footnote: 'This link expires in 24 hours and works once. If you did not create an AfriGoOS account, you can safely ignore this email.'
  })
  return mailer.send({ to, subject: 'Confirm your email to get started on AfriGoOS', ...content })
}

export function sendPasswordResetEmail(to: string, firstName: string, token: string, staff: boolean) {
  const content = layout({
    preheader: 'Use this secure link to choose a new password. It expires in one hour.',
    heading: `Reset your password, ${firstName}`,
    body: 'We received a request to reset the password on your AfriGoOS account. Choose a new password using the secure link below.',
    details: [['Account', to], ['Requested', when()]],
    action: { label: 'Choose a new password', url: `${staff ? env.ADMIN_APP_URL : env.WEB_APP_URL}/reset-password?token=${encodeURIComponent(token)}` },
    footnote: 'This link expires in 1 hour and works once. If you did not ask for this, ignore this email and your password will stay the same.'
  })
  return mailer.send({ to, subject: 'Reset your AfriGoOS password', ...content })
}

export function sendStaffInviteEmail(to: string, firstName: string, role: string, token: string) {
  const content = layout({
    preheader: `You have been given ${role} access to the AfriGoOS operations console.`,
    heading: `You are invited to AfriGoOS Admin`,
    body: [`Hello ${firstName}, you have been given access to the AfriGoOS operations console.`, 'Set your password to get started. You will then add two step verification with an authenticator app, which is required for every administrator.'],
    details: [['Role', role], ['Sign in email', to]],
    action: { label: 'Set my password', url: `${env.ADMIN_APP_URL}/reset-password?token=${encodeURIComponent(token)}&invite=1` },
    footnote: 'This invitation expires in 72 hours. If you were not expecting it, please let the AfriGoOS team know.'
  })
  return mailer.send({ to, subject: 'Your AfriGoOS Admin invitation', ...content })
}

export function sendPasswordChangedEmail(to: string, firstName: string) {
  const content = layout({
    preheader: 'The password on your AfriGoOS account was just changed.',
    heading: 'Your password was changed',
    body: `Hello ${firstName}, the password on your AfriGoOS account was just changed and your other devices were signed out.`,
    details: [['Account', to], ['Changed', when()]],
    action: { label: 'Review my account', url: `${env.WEB_APP_URL}/app/account` },
    footnote: 'If this was not you, reset your password straight away from the sign in page and contact AfriGoOS support.'
  })
  return mailer.send({ to, subject: 'Your AfriGoOS password was changed', ...content })
}
