// Busca en TODO el INBOX por remitente o texto. Usa MAIL_USER + MAIL_APP_PASSWORD de .env.local.
// Uso:  node scripts/mail-buscar.mjs "dmestudiocontable.com"
//       node scripts/mail-buscar.mjs --subject "factura"
import { ImapFlow } from 'imapflow'
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return[l.slice(0,i).trim(),v]}))
const bySubject = process.argv[2] === '--subject'
const term = bySubject ? process.argv[3] : process.argv[2]

const client = new ImapFlow({ host:'imap.gmail.com', port:993, secure:true, auth:{ user:env.MAIL_USER, pass:env.MAIL_APP_PASSWORD }, logger:false })
await client.connect()
const lock = await client.getMailboxLock('INBOX')
try {
  const query = bySubject ? { subject: term } : { from: term }
  const seqs = await client.search(query, { uid:false })
  if (!seqs || !seqs.length) { console.log('Sin resultados para', term); }
  else {
    console.log(`${seqs.length} mails para "${term}":\n`)
    const rows = []
    for await (const msg of client.fetch(seqs, { envelope:true, bodyStructure:true })) {
      const e = msg.envelope
      const adj = []
      const walk = n => { if(!n) return; if(n.disposition==='attachment'||(n.dispositionParameters?.filename)||(n.parameters?.name)) adj.push(n.dispositionParameters?.filename||n.parameters?.name||'adj'); (n.childNodes||[]).forEach(walk) }
      walk(msg.bodyStructure)
      rows.push({ d:e.date?new Date(e.date):new Date(0), from:e.from?.[0]?.address||'?', subj:e.subject||'(sin asunto)', adj })
    }
    rows.sort((a,b)=>a.d-b.d)
    for (const r of rows) console.log(`${r.d.toLocaleDateString('es-AR')} | ${r.subj}${r.adj.length?'  📎['+r.adj.join(', ')+']':''}`)
  }
} finally { lock.release() }
await client.logout()
