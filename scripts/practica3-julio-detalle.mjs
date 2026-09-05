/**
 * PRACTICA 3 — julio 2026 es el ÚNICO mes cargado movimiento por movimiento
 * (los anteriores están agrupados). Desglose real de julio del gasto de MAGMA:
 * software/suscripciones, equipos en cuotas, viáticos/comida/combustible.
 *
 * OJO: la col 6 es Moneda. Los consumos en USD están guardados EN DÓLARES,
 * así que hay que convertirlos o el software queda subvaluado ~1000x.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const USD = Number(process.argv.find(a=>a.startsWith('--usd='))?.split('=')[1] || 1450) // tarjeta ≈ oficial+30%

const env = Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth = new google.auth.GoogleAuth({ credentials:{ client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') }, scopes:['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version:'v4', auth })
const ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const fmt = n => '$' + Math.round(n).toLocaleString('es-AR')
const parseMonto = v => { if (typeof v==='number') return v; if(!v) return 0; const s=String(v).replace(/[^0-9.,-]/g,''); return parseFloat(s.replace(/,/g,''))||0 }

const r = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'MOVIMIENTOS_TARJETA!A1:S3000' })
const rows = (r.data.values||[]).slice(1)
// col 8 = Categoria (Empresa/Personal) — "Empresa" es el gasto de Magma. col 4 = titular.
const julio = rows.filter(x => String(x[1])==='7' && String(x[2])==='2026' && /empresa/i.test(x[8]||''))

// MerPago a nombre de una PERSONA no es equipo — es pago suelto (proveedor/freelancer/servicio).
const esPersona = c => /^MERPAGO\*[A-Z]{10,}$/i.test(c.trim()) && !/gamestation|gangahome|svccomar|passline|electronica|gallio|appypf|bidcom|obok|anchorena|dongato/i.test(c)

const CAT = [
  ['SOFTWARE / SUSCRIPCIONES', /adobe|anthropic|openai|chatgpt|claude|google|apple|amazon|sqsp|squarespace|dropbox|frame|canva|notion|slack|zoom|vimeo|artlist|epidemic|envato|microsoft|spotify|youtube|skool|linkedin|dragonpass|prime|icloud|halls|elevenlabs|midjourney/i],
  ['ADS', /facebk|facebook|meta ?ads|google ?ads|tiktok/i],
  ['COMBUSTIBLE', /ypf|shell|axion|puma|gnc|combust|nafta/i],
  ['MOVILIDAD / PEAJES', /cabify|uber|didi|taxi|remis|peaje|telepase|autopista|sube|estacionamient|parking/i],
  ['COMIDA / RODAJE', /rappi|pedidosya|pedidos ?ya|mc ?donald|burger|starbucks|havanna|cafe|caf[ée]|resto|restaurant|parrilla|pizza|sushi|helad|panader|kiosco|coto|carrefour|jumbo|dia |disco|vea|chango|super|almacen|pollo|camorra|cramer|prospero|pedrera|sossa|empanad|bar |cervec|dongato/i],
  ['EQUIPOS / INSUMOS', /mercado ?libre|gangahome|svccomar|gamestation|bidcom|macstation|sodimac|easy|fravega|garbarino|full ?h4rd|venex|sony|canon|dji|godox|sandisk|samsung|bater|cable|tripode|micr[oó]fono|lente|memoria|ferreter|electronica|gallio|rouge|obok/i],
  ['SEGUROS', /seguro|la segunda|sancor|zurich|allianz|federacion/i],
  ['SERVICIOS OFICINA', /edenor|edesur|metrogas|aysa|abl|expensas|personal ?flow|persflow|movistar|claro|telecentro|fibertel/i],
  ['COSTOS BANCARIOS / IMPUESTOS', /cargo|comision|comisión|iva|percep|rg ?5617|db\.rg|sircreb|intereses|impuesto/i],
]
const clasif = t => { if (esPersona(t)) return 'PAGOS SUELTOS A PERSONAS (MerPago)'; for (const [n,re] of CAT) if (re.test(t)) return n; return 'OTROS' }

const buckets = {}
let totUSD = 0
for (const row of julio) {
  const com = (row[5]||'').trim()
  const moneda = (row[6]||'ARS').trim().toUpperCase()
  const raw = parseMonto(row[7])
  if (!raw) continue
  const monto = moneda === 'USD' ? raw * USD : raw
  if (moneda === 'USD') totUSD += raw
  const c = clasif(com)
  buckets[c] = buckets[c] || { total: 0, items: {}, usd: 0 }
  buckets[c].total += monto
  if (moneda === 'USD') buckets[c].usd += raw
  const key = moneda === 'USD' ? `${com}  [USD ${raw}]` : com
  buckets[c].items[key] = (buckets[c].items[key]||0) + monto
}

const total = Object.values(buckets).reduce((a,b)=>a+b.total,0)
console.log(`\n═══ JULIO 2026 — GASTO DE TARJETA DE MAGMA: ${fmt(total)} (${julio.length} movs · USD ${totUSD.toFixed(2)} convertidos a $${USD}) ═══\n`)
for (const [c,b] of Object.entries(buckets).sort((a,b)=>b[1].total-a[1].total)) {
  console.log(`▸ ${c.padEnd(36)} ${fmt(b.total).padStart(14)}   ${(b.total/total*100).toFixed(1)}%${b.usd?`   (incl. USD ${b.usd.toFixed(2)})`:''}`)
  for (const [k,v] of Object.entries(b.items).sort((a,b)=>b[1]-a[1]).slice(0,18)) {
    console.log(`     ${k.slice(0,56).padEnd(57)} ${fmt(v).padStart(13)}`)
  }
  console.log('')
}
