/**
 * RADAR DEL CONTADOR — el control periódico de lo impositivo.
 * Lee toda la correspondencia con Diego Musco, la clasifica, y detecta:
 *   · qué vence en los próximos días
 *   · qué VEP quedó impago (Diego avisa tarde: hasta 3 meses)
 *   · qué te pidió y no contestaste
 * Con --write vuelca el histórico completo a la solapa CONTADOR del sheet.
 *
 * Uso: node scripts/contador-radar.mjs [--refrescar] [--write]
 *   --refrescar : vuelve a barrer el mail (si no, usa el cache local)
 *   --write     : escribe la solapa CONTADOR (sin el flag, solo preview)
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import { google } from 'googleapis'

const CACHE = 'scripts/.cache-contador-mails.json'
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const HOY = new Date(process.env.HOY_FAKE || Date.now()); HOY.setHours(0,0,0,0)
const args = process.argv.slice(2)
const WRITE = args.includes('--write')

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return[l.slice(0,i).trim(),v]}))

if (args.includes('--refrescar') || !existsSync(CACHE)) {
  console.error('Barriendo el mail del contador...')
  execSync(`node scripts/contador-barrido.mjs ${CACHE}`, { stdio:['ignore','ignore','inherit'] })
}
const mails = JSON.parse(readFileSync(CACHE,'utf8'))

// ---------- clasificación ----------
const TITULARES = [
  [/sofi|sofia|sofía/i, 'Sofi'], [/lucia|lucía|lulu/i, 'Lucia'], [/juan/i, 'Juan'],
  [/somos\s*magma|magma|srl/i, 'MAGMA SRL'],
]
const TIPOS = [
  [/\biva\b/i, 'IVA'], [/iibb|ing\.?\s*brutos|ingresos brutos|arba|agip/i, 'IIBB'],
  [/\b931\b|cargas sociales|seguridad social/i, 'F.931'], [/aut[oó]nomos/i, 'Autónomos'],
  [/monotributo|recategorizaci/i, 'Monotributo'], [/honorarios|\bfc\b/i, 'Honorarios contador'],
  [/sueldos|recibos|sac|aguinaldo/i, 'Sueldos'], [/balance|eecc|certificaci/i, 'Balance'],
  [/plan de pago|deuda/i, 'Deuda / plan'], [/alta|baja|cese|vinculaci|habilitacion/i, 'Trámite'],
]
const clasificar = (re, txt, def) => (re.find(([r])=>r.test(txt))||[])[1] || def
const norm = s => s.replace(/^((RE|RV|FW|FWD)\s*:\s*)+/i,'').trim()
const key  = s => norm(s).toLowerCase()

// período mencionado (07-2026 / 07/2026 / 072026)
const periodo = t => {
  const m = (t||'').match(/\b(0?[1-9]|1[0-2])[-\/](20\d{2})\b/) || (t||'').match(/\b(20\d{2})[-\/](0?[1-9]|1[0-2])\b/)
  if (!m) return ''
  return m[1].length === 4 ? `${String(m[2]).padStart(2,'0')}/${m[1]}` : `${String(m[1]).padStart(2,'0')}/${m[2]}`
}
// "VENCE: 21/08" → Date (asume año en curso, y si ya pasó >6 meses, el que viene)
const vencimiento = (t, fechaMail) => {
  const m = (t||'').match(/VENCE:?\s*(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/i)
  if (!m) return null
  const base = new Date(fechaMail)
  const y = m[3] ? (m[3].length===2 ? 2000+ +m[3] : +m[3]) : base.getFullYear()
  const d = new Date(y, +m[2]-1, +m[1])
  if (d < base) d.setFullYear(d.getFullYear()+1)   // vence el año que viene
  return d
}
const fmt = d => d ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : ''
const dias = d => Math.round((d - HOY) / 86400000)

// ---------- armar hilos ----------
const H = {}
for (const x of mails) (H[key(x.asunto)] = H[key(x.asunto)] || []).push(x)
const hilos = Object.values(H).map(v => v.sort((a,b)=> a.fecha < b.fecha ? -1 : 1))

const PAGADO   = /pagad[oa]|pagamos|pagu[eé]|lo pago|ya est[aá]|transferid|comprobante|list[oa]+|agendado|hecho|cancelad[oa]/i
const IMPAGO   = /impago|no se ha pagado|no se pago|sigue impago|qued[oó] impago|siguen impagos/i
const PIDE     = /me avisan|avisame|me dicen|me confirman|necesito que|nos manden|me pasan|hay que generar|si quieren (?:pagarlo|cancelar)/i

const eventos = []
for (const h of hilos) {
  for (const x of h) {
    const txt = `${x.asunto} ${x.cuerpo}`
    const vto = vencimiento(x.cuerpo, x.fecha)
    const esVep = /vep|volante/i.test(x.asunto) || !!vto
    // ¿alguien confirmó el pago DESPUÉS de este mail, en el mismo hilo?
    const post = h.filter(o => o.fecha >= x.fecha && o !== x)
    const confirmado = post.some(o => o.dir==='enviado' && PAGADO.test(o.cuerpo))
    const avisadoImpago = post.some(o => o.dir==='recibido' && IMPAGO.test(o.cuerpo))
    eventos.push({
      fecha: x.fecha, dir: x.dir, titular: clasificar(TITULARES, x.asunto, '') || clasificar(TITULARES, txt, ''),
      tipo: clasificar(TIPOS, txt, x.dir==='enviado' ? 'Consulta' : 'Aviso'),
      periodo: periodo(x.asunto) || periodo(x.cuerpo), vto, esVep,
      asunto: norm(x.asunto), confirmado, avisadoImpago,
      pide: x.dir==='recibido' && PIDE.test(x.cuerpo||''),
      ultimoDelHilo: h.at(-1) === x, hiloUltimaFecha: h.at(-1).fecha, hiloUltimaDir: h.at(-1).dir,
      resumen: (x.cuerpo||'').split('\n').filter(l=>l.trim() && !/^(beso|abrazo|--|www\.|<dmusco|El .* escribi)/i.test(l.trim())).slice(1,3).join(' ').slice(0,180),
      adjuntos: (x.adjuntos||[]).filter(a=>/\.pdf$/i.test(a)).join(', '),
    })
  }
}

// ---------- radar ----------
const money = v => '$' + Math.round(v).toLocaleString('es-AR')
const H1 = t => { console.log('\n'+'█'.repeat(92)); console.log('  '+t); console.log('█'.repeat(92)) }

H1(`RADAR DEL CONTADOR — Diego Musco · ${mails.length} mails · al ${fmt(HOY)}`)

// 1. VEPs con problema real.
//    Criterio: Diego SIEMPRE hace seguimiento y avisa cuando algo queda impago.
//    · CONFIRMADO IMPAGO = Diego avisó impago y después nadie confirmó el pago.
//    · SIN NOTICIAS       = VEP reciente, sin "pagado" en el hilo y sin aviso de Diego todavía.
const ultimoConfirma = e => {
  const h = hilos.find(h => h.some(x => norm(x.asunto)===e.asunto))
  if (!h) return false
  const post = h.filter(o => o.fecha >= e.fecha)
  const iAviso = post.findLastIndex(o => o.dir==='recibido' && IMPAGO.test(o.cuerpo||''))
  return post.slice(iAviso+1).some(o => o.dir==='enviado' && PAGADO.test(o.cuerpo||''))
}
const porHilo = new Map()
for (const e of eventos.filter(e => e.esVep && e.dir==='recibido')) {
  const prev = porHilo.get(e.asunto)
  // preferimos el mensaje que trae el "VENCE:" (el original), y le pegamos el estado del hilo
  if (!prev || (!prev.vto && e.vto)) porHilo.set(e.asunto, { ...e,
    avisadoImpago: prev?.avisadoImpago || e.avisadoImpago, confirmado: prev?.confirmado || e.confirmado })
  else porHilo.set(e.asunto, { ...prev,
    avisadoImpago: prev.avisadoImpago || e.avisadoImpago, confirmado: prev.confirmado || e.confirmado })
}
const veps = [...porHilo.values()]
const impagos = veps.filter(e => e.avisadoImpago && !ultimoConfirma(e))
const sinNoticias = veps.filter(e => !e.avisadoImpago && !e.confirmado && e.vto && dias(e.vto) > -60)

const linea = e => {
  const d = e.vto ? dias(e.vto) : null
  const alerta = d === null ? '' : d < 0 ? `  ⚠️ venció hace ${-d}d` : d === 0 ? '  🔥 VENCE HOY' : d <= 3 ? `  🔥 vence en ${d}d` : d <= 10 ? `  ⏰ en ${d}d` : ''
  return `   ${(e.titular||'?').padEnd(10)} ${e.tipo.padEnd(10)} ${(e.periodo||'').padEnd(8)} vto ${(fmt(e.vto)||'—').padEnd(11)}${alerta}\n      mail del ${e.fecha} · ${e.asunto}`
}

console.log('\n🔴 IMPAGO CONFIRMADO POR DIEGO — avisó que quedó impago y no hay confirmación posterior\n')
if (!impagos.length) console.log('   (ninguno)')
for (const e of impagos.sort((a,b)=> (a.vto||0) - (b.vto||0))) console.log(linea(e))

console.log('\n\n🟡 SIN NOTICIAS — Diego lo mandó, nadie dijo "pagado", él todavía no reclamó\n')
if (!sinNoticias.length) console.log('   (ninguno)')
for (const e of sinNoticias.sort((a,b)=> (a.vto||0) - (b.vto||0))) console.log(linea(e))

// 2. Hilos donde Diego pide algo y quedó sin respuesta
console.log('\n   ⚠️ OJO: esto sale del MAIL, no del banco. A veces el pago se confirma por WhatsApp')
console.log('      o se contesta en otro hilo. Antes de pagar de nuevo, chequear en ARCA/ARBA.')

console.log('\n\n📩 TE PIDIÓ ALGO Y NO CONTESTASTE\n')
const pendientes = eventos.filter(e => e.pide && e.ultimoDelHilo && e.dir==='recibido' && e.fecha >= '2026-05-01')
if (!pendientes.length) console.log('   (nada pendiente de respuesta)')
for (const e of pendientes.sort((a,b)=> a.fecha<b.fecha?-1:1))
  console.log(`   ${e.fecha}  ${e.asunto}\n              → ${e.resumen}`)

// 3. Cuánto tarda Diego en avisar que algo quedó impago
const avisos = eventos.filter(e => e.dir==='recibido' && IMPAGO.test(e.resumen+e.asunto))
console.log(`\n\n📊 PATRÓN: Diego avisó ${eventos.filter(e=>e.avisadoImpago).length} veces que un VEP había quedado impago.`)
console.log('   Ese aviso llega semanas después del vencimiento → mientras tanto corren intereses.')

// 4. Volumen por tipo
const porTipo = {}
for (const e of eventos) porTipo[e.tipo] = (porTipo[e.tipo]||0)+1
console.log('\n   Correspondencia por tema: ' + Object.entries(porTipo).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${v}`).join(' · '))

// ---------- volcado a la solapa CONTADOR ----------
const filas = eventos.sort((a,b)=> a.fecha<b.fecha?-1:1).map(e => [
  e.fecha, e.dir==='recibido'?'Diego':'Magma', e.titular, e.tipo, e.periodo,
  fmt(e.vto), e.esVep?'SÍ':'', e.confirmado?'pagado':(e.esVep?'sin confirmar':''),
  e.asunto, e.resumen, e.adjuntos,
])
const HEADERS = ['Fecha','Quién','Titular','Tipo','Período','Vence','Es VEP','Estado','Asunto','Resumen','Adjuntos']

console.log(`\n\n📋 SOLAPA "CONTADOR" — ${filas.length} filas listas para escribir`)
console.log('   ' + HEADERS.join(' | '))
for (const f of filas.slice(-5)) console.log('   ' + f.slice(0,9).join(' | ').slice(0,150))

if (!WRITE) { console.log('\n   (preview — corré con --write para escribirlo al sheet)\n'); process.exit(0) }

const auth = new google.auth.GoogleAuth({ credentials:{ client_email:env.GOOGLE_CLIENT_EMAIL, private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') }, scopes:['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version:'v4', auth })
const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
if (!meta.data.sheets.some(s => s.properties.title === 'CONTADOR')) {
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody:{ requests:[{ addSheet:{ properties:{ title:'CONTADOR' } } }] } })
  console.log('   + solapa CONTADOR creada')
}
await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range:'CONTADOR!A:K' })
await sheets.spreadsheets.values.update({
  spreadsheetId: SHEET_ID, range:'CONTADOR!A1',
  valueInputOption:'USER_ENTERED',
  requestBody:{ values:[HEADERS, ...filas] },
})
console.log(`   ✓ ${filas.length} filas escritas en CONTADOR\n`)
