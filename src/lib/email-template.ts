import { env } from '../config/env.js'

export type EmailContent = {
  heading: string
  body: string | string[]
  action?: { label: string; url: string }
  footnote?: string
  preheader?: string
  details?: [string, string][]
}

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

const COLORS = { brand: '#025344', brandDeep: '#012A22', lime: '#7CB041', ink: '#111A15', muted: '#5F6D65', faint: '#8B968F', line: '#E4E7E1', canvas: '#EEF2EC', card: '#FFFFFF', tint: '#F4F8F2' }

const FONT = "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

function button(action: NonNullable<EmailContent['action']>) {
  const url = escape(action.url)
  const label = escape(action.label)
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:30px 0 8px">
  <tr>
    <td align="center" bgcolor="${COLORS.brand}" style="border-radius:12px">
      <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${url}" style="height:50px;v-text-anchor:middle;width:260px" arcsize="24%" stroke="f" fillcolor="${COLORS.brand}"><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold">${label}</center></v:roundrect><![endif]-->
      <!--[if !mso]><!-->
      <a href="${url}" target="_blank" class="button" style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:16px;font-weight:700;line-height:20px;color:#ffffff;text-decoration:none;border-radius:12px;background:${COLORS.brand}">${label}&nbsp;&rarr;</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>
<p class="muted" style="margin:18px 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.muted}">Button not working? Copy this link into your browser:<br><a href="${url}" style="color:${COLORS.brand};word-break:break-all">${url}</a></p>`
}

function details(rows: [string, string][]) {
  const items = rows
    .map(
      ([label, value], index) => `
  <tr>
    <td class="detail-label" style="padding:12px 16px;${index ? `border-top:1px solid ${COLORS.line};` : ''}font-family:${FONT};font-size:13px;color:${COLORS.muted};width:40%">${escape(label)}</td>
    <td class="detail-value" style="padding:12px 16px;${index ? `border-top:1px solid ${COLORS.line};` : ''}font-family:${FONT};font-size:14px;font-weight:600;color:${COLORS.ink}">${escape(value)}</td>
  </tr>`
    )
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="details" style="margin:24px 0 0;border:1px solid ${COLORS.line};border-radius:12px;background:${COLORS.tint}">${items}</table>`
}

export function renderEmail(content: EmailContent) {
  const paragraphs = Array.isArray(content.body) ? content.body : [content.body]
  const preheader = content.preheader ?? paragraphs[0]
  const site = env.WEB_APP_URL.replace(/\/+$/, '')
  const year = new Date().getFullYear()

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escape(content.heading)}</title>
<style>
  body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; }
  table { border-collapse:collapse; }
  a { color:${COLORS.brand}; }
  @media (max-width: 620px) {
    .container { width:100% !important; }
    .gutter { padding-left:16px !important; padding-right:16px !important; }
    .card-pad { padding:28px 22px !important; }
    .heading { font-size:24px !important; line-height:31px !important; }
    .button { display:block !important; text-align:center !important; }
    .detail-label, .detail-value { display:block !important; width:auto !important; border-top:0 !important; }
    .detail-label { padding-bottom:2px !important; }
    .detail-value { padding-top:0 !important; }
  }
  @media (prefers-color-scheme: dark) {
    .canvas { background:#0B120F !important; }
    .card { background:#131C18 !important; border-color:#26332D !important; }
    .heading, .body, .detail-value { color:#EDF2EF !important; }
    .muted, .detail-label, .footer { color:#9AA8A0 !important; }
    .details { background:#18231E !important; border-color:#26332D !important; }
  }
</style>
</head>
<body class="canvas" style="margin:0;padding:0;background:${COLORS.canvas}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escape(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="canvas" style="background:${COLORS.canvas}">
  <tr>
    <td align="center" class="gutter" style="padding:36px 24px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="container" style="width:600px;max-width:600px">
        <tr>
          <td bgcolor="${COLORS.brandDeep}" style="border-radius:20px 20px 0 0;background:${COLORS.brandDeep};background-image:linear-gradient(135deg,${COLORS.brand} 0%,${COLORS.brandDeep} 75%);padding:26px 32px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:${FONT};font-size:24px;font-weight:800;letter-spacing:-.3px;color:#ffffff">Afri<span style="color:${COLORS.lime}">Go</span>OS</td>
                <td align="right" style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#A8D176">Trade across Africa</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr><td height="4" bgcolor="${COLORS.lime}" style="height:4px;line-height:4px;font-size:0;background:${COLORS.lime}">&nbsp;</td></tr>
        <tr>
          <td class="card card-pad" bgcolor="${COLORS.card}" style="background:${COLORS.card};border:1px solid ${COLORS.line};border-top:0;border-radius:0 0 20px 20px;padding:40px 40px 36px">
            <h1 class="heading" style="margin:0 0 16px;font-family:${FONT};font-size:26px;line-height:34px;font-weight:800;letter-spacing:-.4px;color:${COLORS.ink}">${escape(content.heading)}</h1>
            ${paragraphs.map(text => `<p class="body" style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:26px;color:#34423A">${escape(text)}</p>`).join('')}
            ${content.details?.length ? details(content.details) : ''}
            ${content.action ? button(content.action) : ''}
            ${content.footnote ? `<p class="muted" style="margin:26px 0 0;padding-top:20px;border-top:1px solid ${COLORS.line};font-family:${FONT};font-size:13px;line-height:21px;color:${COLORS.muted}">${escape(content.footnote)}</p>` : ''}
          </td>
        </tr>
        <tr>
          <td align="center" class="footer" style="padding:28px 24px 8px;font-family:${FONT};font-size:12px;line-height:20px;color:${COLORS.faint}">
            <p style="margin:0 0 6px;font-weight:700;color:${COLORS.muted}">AfriGoOS &middot; Find opportunities. Prepare for trade. Manage execution.</p>
            <p style="margin:0 0 10px">Operated by NCDF Group. You are receiving this because of activity on your AfriGoOS account.</p>
            <p style="margin:0"><a href="${site}/contact" style="color:${COLORS.muted};text-decoration:underline">Help</a> &nbsp;&middot;&nbsp; <a href="${site}/privacy" style="color:${COLORS.muted};text-decoration:underline">Privacy</a> &nbsp;&middot;&nbsp; <a href="${site}/terms" style="color:${COLORS.muted};text-decoration:underline">Terms</a></p>
            <p style="margin:12px 0 0">&copy; ${year} NCDF Group</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`

  const text = [
    'AfriGoOS',
    '',
    content.heading,
    '',
    ...paragraphs.flatMap(text => [text, '']),
    ...(content.details?.length ? [...content.details.map(([label, value]) => `${label}: ${value}`), ''] : []),
    ...(content.action ? [`${content.action.label}: ${content.action.url}`, ''] : []),
    ...(content.footnote ? [content.footnote, ''] : []),
    `Operated by NCDF Group. Help: ${site}/contact`
  ].join('\n')

  return { html, text }
}
