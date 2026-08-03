// Baja los adjuntos de UN mail a una carpeta. Usa MAIL_USER + MAIL_APP_PASSWORD de .env.local.
// Uso:  node scripts/mail-adjunto.mjs "texto asunto/remitente" /carpeta/destino
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return[l.slice(0,i).trim(),v]}))
const q = (process.argv[2]||'').toLowerCase()
const outDir = process.argv[3] || '.'
mkdirSync(outDir, { recursive:true })

const client = new ImapFlow({ host:'imap.gmail.com', port:993, secure:true, auth:{ user:env.MAIL_USER, pass:env.MAIL_APP_PASSWORD }, logger:false })
await client.connect()
const lock = await client.getMailboxLock('INBOX')
try {
  const seqs = await client.search({ from: 'dmestudiocontable.com' }, { uid:false })
  const matches = []
  for await (const msg of client.fetch(seqs.length?seqs:'1:*', { envelope:true })) {
    const txt = `${msg.envelope.from?.[0]?.address||''} ${msg.envelope.from?.[0]?.name||''} ${msg.envelope.subject||''}`.toLowerCase()
    if (txt.includes(q)) matches.push(msg.seq)
  }
  if (!matches.length) { console.log('No encontré ese mail'); }
  else {
    let ok = false
    for (const seq of matches.sort((a,b)=>b-a)) {   // del más nuevo al más viejo, hasta encontrar uno con adjuntos
      const { content } = await client.download(`${seq}`)
      const parsed = await simpleParser(content)
      if (!(parsed.attachments||[]).length) continue
      const guardados = []
      for (const a of parsed.attachments) {
        if (!/\.(pdf|xlsx|xls|csv)$/i.test(a.filename||'')) continue   // solo docs útiles, no imágenes de firma
        const p = join(outDir, a.filename)
        writeFileSync(p, a.content); guardados.push(p)
      }
      if (guardados.length) { console.log('Guardados:\n'+guardados.join('\n')); ok=true; break }
    }
    if (!ok) console.log('Sin adjuntos de documento en esos mails')
  }
} finally { lock.release() }
await client.logout()
