// Barrido TOTAL de la correspondencia con el contador (lo que manda Diego + lo que contesta Juan).
// Lee [Gmail]/Todos, filtra por el dominio del contador en from/to/cc.
// Baja SOLO la parte de texto de cada mail (no los adjuntos) → rápido.
// Uso: node scripts/contador-barrido.mjs [salida.json]
import { ImapFlow } from 'imapflow'
import { readFileSync, writeFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return[l.slice(0,i).trim(),v]}))
const OUT = process.argv[2] || 'contador-mails.json'
const DOM = 'dmestudiocontable.com'

// ubica la parte text/plain dentro del bodyStructure y lista los adjuntos
const analizar = node => {
  let parteTexto = null, adjuntos = []
  const walk = n => {
    if (!n) return
    const fn = n.dispositionParameters?.filename || n.parameters?.name
    if (n.disposition === 'attachment' || (fn && n.type !== 'text/plain')) { if (fn) adjuntos.push(fn); return }
    if (n.type === 'text/plain' && !parteTexto) parteTexto = n.part || '1'
    ;(n.childNodes||[]).forEach(walk)
  }
  walk(node)
  return { parteTexto, adjuntos }
}

// corta la cadena de citas: nos quedamos con lo que se escribió de nuevo
const limpiar = t => (t||'')
  .split(/^\s*El .*escribi[óo]:|^\s*On .*wrote:|^-{2,}\s*Mensaje original|^_{5,}|^\s*De:\s/m)[0]
  .split('\n').filter(l => !/^\s*>/.test(l)).join('\n')
  .replace(/\r/g,'').replace(/\n{3,}/g,'\n\n').trim().slice(0, 4000)

const leerStream = async s => { const c=[]; for await (const x of s) c.push(x); return Buffer.concat(c).toString('utf8') }

const client = new ImapFlow({ host:'imap.gmail.com', port:993, secure:true, auth:{ user:env.MAIL_USER, pass:env.MAIL_APP_PASSWORD }, logger:false })
await client.connect()
const lock = await client.getMailboxLock('[Gmail]/Todos')
const mails = []
try {
  const seqs = await client.search({ or: [{ from: DOM }, { to: DOM }, { cc: DOM }] }, { uid:false })
  console.error(`${seqs.length} mails con ${DOM}. Bajando solo el texto...`)
  const meta = []
  for await (const msg of client.fetch(seqs, { envelope:true, bodyStructure:true })) {
    const e = msg.envelope
    const { parteTexto, adjuntos } = analizar(msg.bodyStructure)
    meta.push({
      seq: msg.seq, parteTexto,
      fecha: e.date ? new Date(e.date).toISOString().slice(0,10) : '?',
      dir: (e.from||[]).some(a=>(a.address||'').includes(DOM)) ? 'recibido' : 'enviado',
      de: (e.from||[]).map(a=>a.address).join(', '),
      para: [...(e.to||[]), ...(e.cc||[])].map(a=>a.address).join(', '),
      asunto: e.subject || '(sin asunto)',
      adjuntos,
    })
  }
  let n = 0
  for (const m of meta) {
    let cuerpo = ''
    if (m.parteTexto) {
      try {
        const d = await client.download(`${m.seq}`, m.parteTexto)
        cuerpo = limpiar(await leerStream(d.content))
      } catch {}
    }
    const { seq, parteTexto, ...resto } = m
    mails.push({ ...resto, cuerpo })
    if (++n % 50 === 0) console.error(`  ${n}/${meta.length}`)
  }
} finally { lock.release() }
await client.logout()

mails.sort((a,b)=> a.fecha < b.fecha ? -1 : 1)
writeFileSync(OUT, JSON.stringify(mails, null, 1))
const rec = mails.filter(m=>m.dir==='recibido').length
console.error(`\n✓ ${mails.length} mails (${rec} de Diego / ${mails.length-rec} contestados por Juan) → ${OUT}`)
console.error(`  Rango: ${mails[0]?.fecha} → ${mails.at(-1)?.fecha}`)
