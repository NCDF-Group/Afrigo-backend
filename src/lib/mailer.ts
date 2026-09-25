import { env, isProduction } from '../config/env.js'
import { logger } from './logger.js'

export type Mail = { to: string; subject: string; html: string; text: string }

export type Outbox = { send: (mail: Mail) => Promise<void> }

const sent: Mail[] = []

export const testOutbox = { messages: sent, clear: () => sent.splice(0, sent.length) }

async function deliver(mail: Mail) {
  if (env.NODE_ENV === 'test') {
    sent.push(mail)
    return
  }
  if (!env.RESEND_API_KEY) {
    if (isProduction) logger.error({ to: mail.to, subject: mail.subject }, 'Email not sent: RESEND_API_KEY is missing')
    else logger.info({ to: mail.to, subject: mail.subject, text: mail.text }, 'Email (development outbox)')
    return
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text })
  })
  if (!response.ok) logger.error({ to: mail.to, status: response.status, body: await response.text() }, 'Email delivery failed')
}

export const mailer: Outbox = {
  send: mail => deliver(mail).catch(error => logger.error({ err: error, to: mail.to }, 'Email delivery failed'))
}

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

export function layout({ heading, body, action, footnote }: { heading: string; body: string; action?: { label: string; url: string }; footnote?: string }) {
  const button = action
    ? `<p style="margin:28px 0"><a href="${escape(action.url)}" style="background:#025344;color:#ffffff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block">${escape(action.label)}</a></p>`
    : ''
  const note = footnote ? `<p style="color:#6b7280;font-size:13px;line-height:1.6">${escape(footnote)}</p>` : ''
  const html = `<div style="background:#f6f7f4;padding:32px 16px;font-family:Arial,Helvetica,sans-serif"><div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e5e7e1"><p style="color:#7cb041;font-weight:700;letter-spacing:.08em;font-size:12px;margin:0 0 12px">AFRIGOOS</p><h1 style="color:#025344;font-size:22px;margin:0 0 16px">${escape(heading)}</h1><p style="color:#1f2a24;font-size:15px;line-height:1.6">${escape(body)}</p>${button}${note}</div></div>`
  const text = [heading, '', body, action ? `\n${action.label}: ${action.url}` : '', footnote ? `\n${footnote}` : ''].join('\n')
  return { html, text }
}
