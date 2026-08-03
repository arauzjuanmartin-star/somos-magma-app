// Abre UN mail y muestra su contenido (texto). Usa MAIL_USER + MAIL_APP_PASSWORD de .env.local.
// Uso:  node scripts/mail-abrir.mjs "texto del asunto o remitente"
// Ej:   node scripts/mail-abrir.mjs "VEP IVA 04-2026"
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return[l.slice(0,i).trim(),v]}))
const q = (process.argv[2]||'').toLowerCase()
if (!q) { console.log('Pasá texto del asunto/remitente a buscar'); process.exit(1) }

const client = new ImapFlow({ host:'imap.gmail.com', port:993, secure:true, auth:{ user:env.MAIL_USER, pass:env.MAIL_APP_PASSWORD }, logger:false })
await client.connect()
const lock = await client.getMailboxLock('INBOX')
try {
  const total = client.mailbox.exists
  const desde = Math.max(1, total - 60 + 1)   // busca en los últimos 60
  let encontrado = null
  for await (const msg of client.fetch(`${desde}:*`, { envelope:true })) {
    const e = msg.envelope
    const txt = `${e.from?.[0]?.address||''} ${e.from?.[0]?.name||''} ${e.subject||''}`.toLowerCase()
    if (txt.includes(q)) encontrado = msg.seq   // se queda con el más reciente que matchea
  }
  if (!encontrado) { console.log('No encontré ese mail en los últimos 60'); }
  else {
    const { content } = await client.download(`${encontrado}`)
    const parsed = await simpleParser(content)
    console.log('DE:', parsed.from?.text)
    console.log('ASUNTO:', parsed.subject)
    console.log('FECHA:', parsed.date?.toLocaleString('es-AR'))
    console.log('ADJUNTOS:', (parsed.attachments||[]).map(a=>a.filename).join(', ')||'ninguno')
    console.log('\n--- TEXTO ---\n')
    console.log((parsed.text||parsed.html||'(vacío)').slice(0,3000))
  }
} finally { lock.release() }
await client.logout()
