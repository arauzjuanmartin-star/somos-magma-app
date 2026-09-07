/**
 * Verifica que el desglose por ítem CIERRE con el precio de cada presupuesto.
 *
 * El riesgo del desglose no es que se vea feo: es mandarle al cliente un PDF donde
 * los renglones no suman el total de abajo. Este script agarra los presupuestos
 * reales del sheet, los desglosa y compara la suma contra el Precio Final.
 *
 * Uso:  node scripts/verif-desglose.mjs         (los últimos 40)
 *       node scripts/verif-desglose.mjs 200
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { desglosarPrecio, agruparLineas, itemsDePresu, opcionesDePresu, recalcularTotales } from '../lib/desglose.js'

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
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const CUANTOS = parseInt(process.argv[2]) || 40
const fmt = n => '$'+Math.round(n).toLocaleString('es-AR')

const r = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range:'PRESUPUESTOS!A:DJ' })
const rows = r.data.values||[], H = rows[0]||[]
const obj = row => Object.fromEntries(H.map((h,i)=>[h, row[i]]))
const presus = rows.slice(1).map(obj).filter(p=>p['Columna 1']).slice(-CUANTOS)

console.log(`Desglosando los últimos ${presus.length} presupuestos…\n`)
let ok=0, sinItems=0, fallan=[], desviosGrandes=[]

for (const p of presus) {
  const nro = p['Columna 1']
  const opts = opcionesDePresu(p)
  const base = itemsDePresu(p).filter(i=>!i.adicional)
  if (!base.length || opts.total<=0) { sinItems++; continue }

  const { lineas } = desglosarPrecio(base, { ...opts, total: opts.total })
  const suma = lineas.reduce((s,l)=>s+l.precio, 0)

  if (suma !== Math.round(opts.total)) {
    fallan.push({ nro, suma, total: opts.total, dif: suma-Math.round(opts.total) })
    continue
  }
  ok++

  // Aviso (no error): cuánto tuvo que estirar el desglose para llegar al total.
  // Un desvío grande significa que el presu tiene ajuste/descuento fuerte, o que
  // los servicios cargados no explican el precio. Sirve para detectar presus raros.
  const bruto = suma / (lineas.length ? 1 : 1)
  const totalFormula = recalcularTotales(base, {...opts, totalObjetivo: 0})
  const desvio = totalFormula.total>0 ? (opts.total-totalFormula.total)/totalFormula.total*100 : 0
  if (Math.abs(desvio) > 15) desviosGrandes.push({ nro, formula: totalFormula.total, real: opts.total, desvio })
}

console.log(`✓ ${ok} presupuestos: la suma de las líneas da EXACTO el Precio Final`)
if (sinItems) console.log(`· ${sinItems} salteados (sin servicios cargados o sin precio)`)

if (fallan.length) {
  console.log(`\n✗ ${fallan.length} NO cierran — el PDF mostraría renglones que no suman el total:`)
  fallan.slice(0,10).forEach(f=>console.log(`   #${f.nro}: líneas ${fmt(f.suma)} vs total ${fmt(f.total)} (${f.dif>0?'+':''}${fmt(f.dif)})`))
} else {
  console.log('✓ ninguno quedó descuadrado')
}

if (desviosGrandes.length) {
  console.log(`\n⚠ ${desviosGrandes.length} presupuestos donde el precio final se aleja +15% de lo que da la fórmula`)
  console.log('  (descuento, redondeo o recargo fuerte: el desglose lo reparte igual, pero conviene mirarlos)')
  desviosGrandes.slice(0,8).forEach(d=>console.log(`   #${d.nro}: fórmula ${fmt(d.formula)} → cobrado ${fmt(d.real)} (${d.desvio>0?'+':''}${d.desvio.toFixed(1)}%)`))
}

// Ejemplo concreto para mirar a ojo: el último presu con más de un servicio
const ejemplo = [...presus].reverse().find(p => itemsDePresu(p).filter(i=>!i.adicional).length>1 && opcionesDePresu(p).total>0)
if (ejemplo) {
  const opts = opcionesDePresu(ejemplo)
  const base = itemsDePresu(ejemplo).filter(i=>!i.adicional)
  const { lineas } = desglosarPrecio(base, {...opts, total: opts.total})
  console.log(`\n── Ejemplo: #${ejemplo['Columna 1']} · ${ejemplo['Cliente']||''} — ${ejemplo['Proyecto']||''} ──`)
  agruparLineas(lineas).forEach(l=>{
    const label = l.cantidad>1 ? `${l.cantidad} × ${l.nombre}` : l.nombre
    console.log(`   ${label.padEnd(38).slice(0,38)} costo ${fmt(l.costo).padStart(12)} → cliente ${fmt(l.precio).padStart(12)}${l.fee?'':'   (sin fee)'}`)
  })
  console.log(`   ${''.padEnd(38)} ${''.padStart(12)}   TOTAL     ${fmt(lineas.reduce((s,l)=>s+l.precio,0)).padStart(12)}  (sheet: ${fmt(opts.total)})`)
}

process.exit(fallan.length ? 1 : 0)
