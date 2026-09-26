import nodemailer, { type Transporter } from 'nodemailer'
import { env, isProduction } from '../config/env.js'
import { renderEmail, type EmailContent } from './email-template.js'
import { logger } from './logger.js'

export type Mail = { to: string; subject: string; html: string; text: string }

export type Outbox = { send: (mail: Mail) => Promise<void> }

const sent: Mail[] = []

export const testOutbox = { messages: sent, clear: () => sent.splice(0, sent.length) }

let smtp: Transporter | null = null

function smtpTransport() {
  smtp ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
  })
  return smtp
}

export const emailProvider = () => (env.SMTP_HOST ? 'smtp' : env.BREVO_API_KEY ? 'brevo' : env.RESEND_API_KEY ? 'resend' : 'log')

export function parseSender(value: string) {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  return match ? { name: match[1].replace(/^"|"$/g, '') || undefined, email: match[2].trim() } : { email: value.trim() }
}

export const brevoPayload = (mail: Mail, from: string) => ({ sender: parseSender(from), to: [{ email: mail.to }], subject: mail.subject, htmlContent: mail.html, textContent: mail.text })

async function sendWithBrevo(mail: Mail, apiKey: string) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(brevoPayload(mail, env.EMAIL_FROM))
  })
  if (!response.ok) logger.error({ to: mail.to, status: response.status, body: await response.text() }, 'Email delivery failed')
}

async function deliver(mail: Mail) {
  if (env.NODE_ENV === 'test') {
    sent.push(mail)
    return
  }
  if (env.SMTP_HOST) {
    await smtpTransport().sendMail({ from: env.EMAIL_FROM, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text })
    return
  }
  if (env.BREVO_API_KEY) {
    await sendWithBrevo(mail, env.BREVO_API_KEY)
    return
  }
  if (!env.RESEND_API_KEY) {
    if (isProduction) logger.error({ to: mail.to, subject: mail.subject }, 'Email not sent: no email provider is set')
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

export function layout(content: EmailContent) {
  return renderEmail(content)
}
