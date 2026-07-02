// Lee un buzón @somosmagma.com por impersonación (DWD). No usa claves sueltas.
// Uso:  node scripts/gmail-leer.mjs juan@somosmagma.com [cantidad] [query]
//   query opcional estilo Gmail, ej: "is:unread", "subject:presupuesto"
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return[l.slice(0,i).trim(),v]}))
const buzon = process.argv[2] || 'juan@somosmagma.com'
const N = parseInt(process.argv[3]) || 8
const q = process.argv[4] || 'in:inbox'

const auth = new google.auth.GoogleAuth({
  credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') },
  scopes: ['https://www.googleapis.com/auth/gmail.modify'],
  clientOptions: { subject: buzon },
})
const gmail = google.gmail({ version:'v1', auth })

const inbox = await gmail.users.labels.get({ userId:'me', id:'INBOX' })
console.log(`📬 ${buzon} · ${inbox.data.messagesUnread} sin leer (de ${inbox.data.messagesTotal} en INBOX)\n`)

const list = await gmail.users.messages.list({ userId:'me', q, maxResults:N })
const msgs = list.data.messages || []
for (const m of msgs) {
  const g = await gmail.users.messages.get({ userId:'me', id:m.id, format:'metadata', metadataHeaders:['From','Subject','Date'] })
  const H = n => (g.data.payload.headers.find(h=>h.name===n)||{}).value || ''
  const unread = (g.data.labelIds||[]).includes('UNREAD') ? '🔵' : '  '
  const fecha = H('Date') ? new Date(H('Date')).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '?'
  console.log(`${unread} ${fecha} | ${H('From')}\n     ${H('Subject')||'(sin asunto)'}`)
}
