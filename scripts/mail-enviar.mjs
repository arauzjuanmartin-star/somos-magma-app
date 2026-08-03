// Envía un mail desde la cuenta de Magma (nodemailer + MAIL_USER/MAIL_APP_PASSWORD).
// SOLO se corre cuando Juan confirma explícitamente el envío.
// Uso:  node scripts/mail-enviar.mjs mail.json
//   mail.json = { "to":"...", "cc":"", "subject":"...", "text":"...", "html":"" }
import nodemailer from 'nodemailer'
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return[l.slice(0,i).trim(),v]}))
const m = JSON.parse(readFileSync(process.argv[2]||'mail.json','utf8'))
if (!m.to || !m.subject) { console.log('Falta to/subject'); process.exit(1) }

const t = nodemailer.createTransport({ service:'gmail', auth:{ user:env.MAIL_USER, pass:env.MAIL_APP_PASSWORD } })
const info = await t.sendMail({ from:`Somos Magma <${env.MAIL_USER}>`, to:m.to, cc:m.cc||undefined, subject:m.subject, text:m.text||undefined, html:m.html||undefined })
console.log('✅ Enviado:', info.messageId, '→', m.to)
