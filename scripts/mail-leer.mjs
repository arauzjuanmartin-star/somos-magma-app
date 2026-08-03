// Lee el mail de Magma por IMAP (usa MAIL_USER + MAIL_APP_PASSWORD de .env.local).
// Uso:  node scripts/mail-leer.mjs [cantidad] [buscar-texto]
// Ej:   node scripts/mail-leer.mjs 10
//       node scripts/mail-leer.mjs 20 factura
import { ImapFlow } from 'imapflow'
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return[l.slice(0,i).trim(),v]}))
const N = parseInt(process.argv[2]) || 8
const buscar = (process.argv[3]||'').toLowerCase()

const client = new ImapFlow({ host:'imap.gmail.com', port:993, secure:true, auth:{ user:env.MAIL_USER, pass:env.MAIL_APP_PASSWORD }, logger:false })
await client.connect()
const lock = await client.getMailboxLock('INBOX')
try {
  const total = client.mailbox.exists
  console.log(`📬 ${env.MAIL_USER} · ${total} mails en INBOX\n`)
  const desde = Math.max(1, total - N + 1)
  const out = []
  for await (const msg of client.fetch(`${desde}:*`, { envelope:true, flags:true })) {
    const e = msg.envelope
    const from = e.from?.[0] ? `${e.from[0].name||''} <${e.from[0].address}>`.trim() : '?'
    const subj = e.subject || '(sin asunto)'
    if (buscar && !(`${from} ${subj}`.toLowerCase().includes(buscar))) continue
    const leido = msg.flags?.has('\\Seen') ? '  ' : '🔵'
    const fecha = e.date ? new Date(e.date).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '?'
    out.push(`${leido} ${fecha} | ${from}\n     ${subj}`)
  }
  console.log(out.reverse().join('\n\n') || '(sin resultados)')
} finally { lock.release() }
await client.logout()
