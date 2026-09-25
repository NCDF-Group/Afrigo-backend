import { env } from '../../config/env.js'
import { layout, mailer } from '../../lib/mailer.js'

export function sendOrganisationInvite(to: string, organisation: string, inviter: string, token: string) {
  const content = layout({
    heading: `Join ${organisation} on AfriGoOS`,
    body: `${inviter} has invited you to work with ${organisation} on AfriGoOS, where you can manage enquiries, documents and trade cases together.`,
    action: { label: 'Accept invitation', url: `${env.WEB_APP_URL}/invitations/accept?token=${encodeURIComponent(token)}` },
    footnote: 'This invitation expires in 7 days. Sign in or create an account with this email address to accept it.'
  })
  return mailer.send({ to, subject: `You have been invited to ${organisation} on AfriGoOS`, ...content })
}

export function sendVerificationDecision(to: string, organisation: string, verified: boolean, note?: string) {
  const content = layout({
    heading: verified ? `${organisation} is verified` : `${organisation} needs a few changes`,
    body: verified
      ? 'Your business has been reviewed and verified on AfriGoOS. Your verified badge is now visible to trading partners.'
      : `Your business could not be verified yet. ${note ?? ''}`.trim(),
    action: { label: 'Open AfriGoOS', url: `${env.WEB_APP_URL}/dashboard` }
  })
  return mailer.send({ to, subject: verified ? 'Your business is verified on AfriGoOS' : 'Action needed on your AfriGoOS business profile', ...content })
}
