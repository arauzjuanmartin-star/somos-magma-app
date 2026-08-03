import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
    const i=l.indexOf('='); let v=l.slice(i+1).trim()
    if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1)
    return [l.slice(0,i).trim(),v]
  })
)
const auth = new google.auth.GoogleAuth({
  credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},
  scopes:['https://www.googleapis.com/auth/spreadsheets.readonly'],
})
const sheets = google.sheets({version:'v4',auth})
const spreadsheetId = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

const get = async (range) => (await sheets.spreadsheets.values.get({
  spreadsheetId, range, valueRenderOption: 'UNFORMATTED_VALUE' })).data.values || []

// ---------- 1. Catálogo de servicios/rubros que usa Magma ----------
console.log('='.repeat(70))
console.log('CATALOGO DE RUBROS (solapa RUBROS + listado)')
console.log('='.repeat(70))
for (const tab of ['RUBROS', 'listado']) {
  const rows = await get(`'${tab}'!A1:H80`)
  console.log(`\n--- ${tab} ---`)
  rows.slice(0, 60).forEach((r, i) => {
    const t = r.filter(c => c !== '' && c != null).join(' | ')
    if (t) console.log(`  ${i + 1}: ${t}`)
  })
}

// ---------- 2. Todos los "Servicio" distintos en Pagos_Staff ----------
console.log('\n' + '='.repeat(70))
console.log('SERVICIOS DISTINTOS EN Pagos_Staff (con importes)')
console.log('='.repeat(70))
const ps = await get(`'Pagos_Staff'!A1:Z4000`)
const psH = ps[0].map(h => String(h ?? '').trim())
const iServ = psH.indexOf('Servicio')
const iPag  = psH.indexOf('Monto Pagado')
const iAdeu = psH.indexOf('Monto Adeudado')
const iPers = psH.findIndex(h => /persona|nombre|staff/i.test(h))

const porServ = {}
for (let r = 1; r < ps.length; r++) {
  const s = String(ps[r]?.[iServ] ?? '').trim()
  if (!s) continue
  const m = Number(ps[r]?.[iPag]) || Number(ps[r]?.[iAdeu]) || 0
  ;(porServ[s] ||= []).push(m)
}
Object.entries(porServ)
  .sort((a, b) => b[1].length - a[1].length)
  .forEach(([s, arr]) => {
    const vals = arr.filter(v => v > 0).sort((a, b) => a - b)
    const med = vals.length ? vals[Math.floor(vals.length / 2)] : 0
    console.log(`  ${String(arr.length).padStart(4)}x  ${s.padEnd(34)} mediana $${Math.round(med).toLocaleString('es-AR')}`)
  })

// ---------- 3. Detalle de las filas de Viaticos / movilidad ----------
console.log('\n' + '='.repeat(70))
console.log('DETALLE — filas de Viaticos/auto/movilidad en Pagos_Staff')
console.log('='.repeat(70))
for (let r = 1; r < ps.length; r++) {
  const s = String(ps[r]?.[iServ] ?? '')
  if (!/viatico|vi[áa]tico|auto|movilidad|combustible|nafta|traslado/i.test(s)) continue
  const m = Number(ps[r]?.[iPag]) || Number(ps[r]?.[iAdeu]) || 0
  console.log(`  f${r + 1}  ${String(ps[r]?.[iPers] ?? '').slice(0, 26).padEnd(28)} ${s.padEnd(22)} $${Math.round(m).toLocaleString('es-AR')}`)
}

// ---------- 4. Presupuestos con viaticos/auto en el nombre de staff ----------
console.log('\n' + '='.repeat(70))
console.log('PROYECTOS con linea de Viaticos — cuanto se presupuesto')
console.log('='.repeat(70))
const pr = await get(`'PROYECTOS'!A1:BZ2000`)
const prH = pr[0].map(h => String(h ?? '').trim())
const staffCols = prH.map((h, i) => ({ h, i })).filter(x => /^staff\s*\d/i.test(x.h))
const costCols  = prH.map((h, i) => ({ h, i })).filter(x => /costo|monto|precio|valor/i.test(x.h))
console.log(`(columnas staff: ${staffCols.map(c => c.h).join(', ')})`)
console.log(`(columnas costo: ${costCols.map(c => c.h).join(', ')})\n`)
let n = 0
for (let r = 1; r < pr.length && n < 25; r++) {
  for (const sc of staffCols) {
    const v = String(pr[r]?.[sc.i] ?? '')
    if (!/viatico|vi[áa]tico|auto|movilidad/i.test(v)) continue
    const proyecto = String(pr[r]?.[prH.findIndex(h => /proyecto/i.test(h))] ?? '').slice(0, 40)
    const nums = (pr[r] || []).map((x, i) => ({ x, i }))
      .filter(o => typeof o.x === 'number' && o.x > 5000 && o.x < 50e6)
      .slice(0, 5).map(o => `${prH[o.i] || o.i}=${Math.round(o.x).toLocaleString('es-AR')}`)
    console.log(`  f${r + 1} ${proyecto.padEnd(42)} [${sc.h}]="${v}"`)
    console.log(`        ${nums.join(' | ')}`)
    n++; break
  }
}
