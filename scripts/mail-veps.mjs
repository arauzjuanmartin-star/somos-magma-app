// Barre los mails del contador, baja cada VEP (PDF) y saca CUIT/período/importe/nro.
// Uso: node scripts/mail-veps.mjs
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { PDFParse } = require('pdf-parse')

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return[l.slice(0,i).trim(),v]}))
const CUITS = { '30-71922802-6':'MAGMA SRL', '27-37995971-2':'Sofi', '23-30783743-9':'Juan', '27-41915665-0':'Lucia' }
const norm = c => (c||'').replace(/[^0-9]/g,'')
const nombreCuit = c => CUITS[c] || Object.entries(CUITS).find(([k])=>norm(k)===norm(c))?.[1] || c

const client = new ImapFlow({ host:'imap.gmail.com', port:993, secure:true, auth:{ user:env.MAIL_USER, pass:env.MAIL_APP_PASSWORD }, logger:false })
await client.connect()
const lock = await client.getMailboxLock('INBOX')
const veps = new Map()  // por nro VEP (dedup)
try {
  const seqs = await client.search({ from:'dmestudiocontable.com' }, { uid:false })
  const taxRe = /vep|iva|iibb|931|autonom|monotributo|brutos/i
  const wanted = []
  for await (const msg of client.fetch(seqs, { envelope:true })) {
    if (taxRe.test(msg.envelope.subject||'')) wanted.push({ seq:msg.seq, subj:msg.envelope.subject, date:msg.envelope.date })
  }
  for (const w of wanted) {
    const { content } = await client.download(`${w.seq}`)
    const parsed = await simpleParser(content)
    for (const a of parsed.attachments||[]) {
      if (!/vep/i.test(a.filename||'') || !/\.pdf$/i.test(a.filename||'')) continue
      try {
        const r = await new PDFParse({ data:a.content }).getText()
        const t = r.text || ''
        if (!/importe total a pagar/i.test(t)) continue
        const nro = (t.match(/Nro\.?\s*VEP:\s*(\d+)/i)||[])[1] || a.filename
        const cuit = (t.match(/CUIT:\s*([\d-]+)/i)||[])[1] || '?'
        const per = (t.match(/Per[ií]odo:\s*([\d-]+)/i)||[])[1] || '?'
        const imp = (t.match(/Importe total a pagar\s*\$?\s*([\d.,]+)/i)||[])[1] || '?'
        // tipo por keyword en texto + asunto
        const hay = /iva/i.test(w.subj)||/IVA \(/i.test(t) ? 'IVA'
                  : /iibb|brutos|CM-/i.test(w.subj)||/ingresos brutos|CM-/i.test(t) ? 'IIBB'
                  : /931/.test(w.subj)||/seguridad social|931|sicoss/i.test(t) ? 'F.931'
                  : /autonom/i.test(w.subj) ? 'Autónomos'
                  : /monotributo/i.test(w.subj) ? 'Monotributo' : '?'
        veps.set(nro, { cuit:nombreCuit(cuit), tipo:hay, per, imp, nro, subj:w.subj, date:w.date })
      } catch(e){}
    }
  }
} finally { lock.release() }
await client.logout()

const rows = [...veps.values()].sort((a,b)=> (a.per>b.per?1:-1) )
console.log(`\n${rows.length} VEPs encontrados:\n`)
console.log('TITULAR        | TIPO       | PERÍODO  | IMPORTE          | Nro VEP')
for (const r of rows) console.log(`${r.cuit.padEnd(14)} | ${r.tipo.padEnd(10)} | ${(r.per||'').padEnd(8)} | $${(r.imp||'').padStart(14)} | ${r.nro}`)
