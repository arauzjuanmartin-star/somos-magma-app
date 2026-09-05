// Lee las DDJJ de IIBB (CM03) que manda el contador y arma la serie real mes a mes.
// Impuesto determinado vs retenciones sufridas vs saldo a favor. Solo lectura.
// Uso: node scripts/fiscal-ddjj-iibb.mjs [titular]   (ej: "SOMOS MAGMA")
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { PDFParse } = require('pdf-parse')

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return[l.slice(0,i).trim(),v]}))
const FILTRO = (process.argv[2] || 'SOMOS MAGMA').toUpperCase()
const n = s => Number(String(s||'0').replace(/\./g,'').replace(',','.')) || 0
const money = v => '$' + Math.round(v).toLocaleString('es-AR')

const client = new ImapFlow({ host:'imap.gmail.com', port:993, secure:true, auth:{ user:env.MAIL_USER, pass:env.MAIL_APP_PASSWORD }, logger:false })
await client.connect()
const lock = await client.getMailboxLock('[Gmail]/Todos')
const djj = new Map()
try {
  const seqs = await client.search({ from:'dmestudiocontable.com', subject:'IIBB' }, { uid:false })
  for (const seq of seqs) {
    const { content } = await client.download(`${seq}`)
    const p = await simpleParser(content)
    for (const a of p.attachments||[]) {
      if (!/\.pdf$/i.test(a.filename||'')) continue
      let t = ''
      try { t = (await new PDFParse({ data:a.content }).getText()).text || '' } catch { continue }
      if (!/CM03|DJ MENSUAL/i.test(t)) continue
      const rs = (t.match(/Raz[óo]n Social:\s*(.+)/i)||[])[1]?.trim() || '?'
      if (!rs.toUpperCase().includes(FILTRO)) continue
      const per = (t.match(/Anticipo:\s*(\d{6})/)||[])[1]; if (!per) continue
      const tot = t.match(/TOTALES\s+\$([\d.,]+)\s+\$([\d.,]+)\s+\$([\d.,]+)\s+\$([\d.,]+)\s+\$([\d.,]+)\s+\$([\d.,]+)/)
      if (!tot) continue
      const juris = [...t.matchAll(/^(CABA|BUENOS AIRES|[A-ZÁÉÍÓÚÑ ]{4,})\s+\$([\d.,]+)\s+\$([\d.,]+)\s+\$([\d.,]+)\s+\$([\d.,]+)\s+\$([\d.,]+)\s+\$([\d.,]+)$/gm)]
        .filter(m => !/TOTALES/.test(m[1]))
        .map(m => ({ j:m[1].trim(), determinado:n(m[2]), restan:n(m[3]), aFavor:n(m[5]), aPagar:n(m[7]) }))
      djj.set(per, {
        per, determinado:n(tot[1]), restan:n(tot[2]), suman:n(tot[3]),
        aFavor:n(tot[4]), aFavorFisco:n(tot[5]), aPagar:n(tot[6]),
        pres: (t.match(/presentada el ([\d/]+)/i)||[])[1] || '',
        juris,
      })
    }
  }
} finally { lock.release() }
await client.logout()

const rows = [...djj.values()].sort((a,b)=> a.per < b.per ? -1 : 1)
const per = p => `${p.slice(4)}/${p.slice(0,4)}`
console.log('\n' + '█'.repeat(94))
console.log(`  IIBB CONVENIO MULTILATERAL — ${FILTRO} · serie real desde las DDJJ del contador`)
console.log('█'.repeat(94))
console.log(`  ${'período'.padEnd(9)} ${'impuesto'.padStart(14)} ${'le retuvieron'.padStart(15)} ${'A PAGAR'.padStart(14)} ${'saldo a favor'.padStart(15)}`)
console.log('  ' + '─'.repeat(90))
for (const r of rows) {
  const flag = r.aPagar === 0 ? '  ← nada que pagar' : ''
  console.log(`  ${per(r.per).padEnd(9)} ${money(r.determinado).padStart(14)} ${money(r.restan).padStart(15)} ${money(r.aPagar).padStart(14)} ${money(r.aFavor).padStart(15)}${flag}`)
  for (const j of r.juris||[]) {
    const et = j.j.replace('BUENOS AIRES','BS AS'); const nota = j.aPagar > 0 && r.juris.some(o=>o.aFavor>0) ? '  ⚠️ pagás acá teniendo saldo a favor en la otra' : ''
    console.log(`  ${('  · '+et).padEnd(9)} ${money(j.determinado).padStart(14)} ${money(j.restan).padStart(15)} ${money(j.aPagar).padStart(14)} ${money(j.aFavor).padStart(15)}${nota}`)
  }
}
console.log('  ' + '─'.repeat(90))
const T = rows.reduce((a,r)=>({d:a.d+r.determinado, r:a.r+r.restan, p:a.p+r.aPagar}),{d:0,r:0,p:0})
console.log(`  ${'TOTAL'.padEnd(9)} ${money(T.d).padStart(14)} ${money(T.r).padStart(15)} ${money(T.p).padStart(14)}`)
console.log(`\n  Saldo a favor vigente (última DDJJ ${rows.length?per(rows.at(-1).per):'-'}): ${money(rows.at(-1)?.aFavor||0)}`)
const dif = T.r - T.d
console.log(dif >= 0
  ? `  En el período le retuvieron ${money(dif)} MÁS que el impuesto.`
  : `  En el período le retuvieron ${money(-dif)} MENOS que el impuesto (por eso hubo meses con VEP).`)
console.log(`\n  OJO: CABA y Buenos Aires NO se compensan entre sí. Podés tener saldo a favor en una`)
console.log(`  y pagar en la otra el mismo mes.\n`)
