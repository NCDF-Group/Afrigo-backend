import { env } from '../../config/env.js'
import { layout, mailer } from '../../lib/mailer.js'

export function sendOrganisationInvite(to: string, organisation: string, inviter: string, token: string) {
  const content = layout({
    preheader: `${inviter} invited you to work with ${organisation} on AfriGoOS.`,
    heading: `Join ${organisation} on AfriGoOS`,
    body: [`${inviter} has invited you to work with ${organisation} on AfriGoOS.`, 'Together you can manage enquiries, quotations, documents and trade cases in one shared workspace.'],
    details: [['Business', organisation], ['Invited by', inviter], ['Invitation sent to', to]],
    action: { label: 'Accept invitation', url: `${env.WEB_APP_URL}/invitations/accept?token=${encodeURIComponent(token)}` },
    footnote: 'This invitation expires in 7 days. Sign in or create an account with this email address to accept it.'
  })
  return mailer.send({ to, subject: `${inviter} invited you to ${organisation} on AfriGoOS`, ...content })
}

export function sendVerificationDecision(to: string, organisation: string, verified: boolean, note?: string) {
  const content = layout({
    preheader: verified ? `${organisation} now shows a verified badge on AfriGoOS.` : `${organisation} needs a few changes before it can be verified.`,
    heading: verified ? `${organisation} is verified` : `${organisation} needs a few changes`,
    body: verified
      ? 'Great news. The AfriGoOS team has reviewed and verified your business. Trading partners now see your verified badge, which builds trust in every enquiry and trade case.'
      : 'The AfriGoOS team reviewed your business but could not verify it yet. Update your business profile and submit it again.',
    details: [['Business', organisation], ['Status', verified ? 'Verified' : 'Changes needed'], ...(note ? [['Note from our team', note] as [string, string]] : [])],
    action: { label: verified ? 'Open my workspace' : 'Update business profile', url: `${env.WEB_APP_URL}${verified ? '/app' : '/app/business'}` }
  })
  return mailer.send({ to, subject: verified ? `${organisation} is now verified on AfriGoOS` : `Action needed on ${organisation}`, ...content })
}
