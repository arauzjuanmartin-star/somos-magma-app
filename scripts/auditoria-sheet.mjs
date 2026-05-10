import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('='))
    .map(l => {
      const i = l.indexOf('=')
      let v = l.slice(i+1).trim()
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1,-1)
      return [l.slice(0, i).trim(), v]
    })
)

const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: env.GOOGLE_CLIENT_EMAIL,
    private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version: 'v4', auth })

const RANGES = [
  'PRESUPUESTOS!A:AV',
  'PROYECTOS!A:AQ',
  'FACTURACION!A:AG',
  'COBROS!A:L',
  'PAGOS_STAFF!A:L',
]
const results = await Promise.all(RANGES.map(r =>
  sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: r })
))

const toRows = vals => {
  if (!vals || vals.length < 2) return { headers: [], rows: [] }
  return { headers: vals[0], rows: vals.slice(1).filter(r => r.some(c => c !== '')) }
}
const objify = ({ headers, rows }, opts={}) => rows.map((row, i) => {
  const o = { __fila: i + 2 }
  headers.forEach((h, c) => {
    const key = h || `col${c}`
    if (o[key] !== undefined) o[`${key}_${c}`] = row[c] || ''
    else o[key] = row[c] || ''
  })
  return o
})

const presu  = objify(toRows(results[0].data.values))
const proy   = objify(toRows(results[1].data.values))
const fact   = objify(toRows(results[2].data.values))
const cobros = objify(toRows(results[3].data.values))
const pagos  = objify(toRows(results[4].data.values))

const norm = v => String(v||'').replace(/\s+/g,'').toLowerCase()

console.log('===== AUDITORÍA MASTER MAGMA — '+new Date().toLocaleString('es-AR')+' =====\n')

console.log('TOTALES:')
console.log(`  PRESUPUESTOS: ${presu.length}`)
console.log(`  PROYECTOS:    ${proy.length}`)
console.log(`  FACTURACION:  ${fact.length}`)
console.log(`  COBROS (app): ${cobros.length}`)
console.log(`  PAGOS_STAFF:  ${pagos.length}`)

const presuKeyN = Object.keys(presu[0]||{}).find(k => /columna ?1|n°|nro|numero/i.test(k)) || Object.keys(presu[0]||{})[1]
const presuN = p => p[presuKeyN]

console.log(`\n[debug] presu key N° = "${presuKeyN}"`)

const aprobados = presu.filter(p => String(p['Estado']||'').trim().toUpperCase() === 'APROBADO')
const proyNs = new Set(proy.map(p => norm(p['N° presupuesto'])).filter(Boolean))
const presuApSinProy = aprobados.filter(p => presuN(p) && !proyNs.has(norm(presuN(p))))

console.log(`\n[1] Presupuestos APROBADOS sin proyecto en PROYECTOS:`)
console.log(`    ${presuApSinProy.length} / ${aprobados.length} aprobados (${proy.length} proyectos totales)`)
console.log(`    BUG conocido del sheet: cuando alguien filtra y otro carga presu, no se replica a PROYECTOS`)
const recientes = presuApSinProy
  .filter(p => /202[5-6]/.test(String(p['Fecha Evento']||p['Fecha Presupuesto']||'')))
  .slice(-15)
console.log(`    Mostrando los últimos 15 con fecha 2025-2026:`)
recientes.forEach(p => console.log(`      fila ${p.__fila} | N° ${presuN(p)} | ${p['Cliente']||p['Agencia']} | evento ${p['Fecha Evento']} | $${p['Precio Final']}`))

const staffKeys = Object.keys(proy[0]||{}).filter(k => k === 'Staff' || k.startsWith('Staff '))
const proySinNingunStaff = proy.filter(p => !staffKeys.some(k => String(p[k]||'').trim()))
console.log(`\n[2a] Proyectos sin NINGÚN staff asignado (columnas Staff 1-12 todas vacías):`)
console.log(`    ${proySinNingunStaff.length} / ${proy.length} proyectos`)
proySinNingunStaff.slice(-15).forEach(p => console.log(`      fila ${p.__fila} | N° ${p['N° presupuesto']} | ${p['Cliente']} | ${p['Proyecto']} | evento ${p['Fecha Evento']}`))

const proyNoVerificado = proy.filter(p => String(p['Carga Staff']||'').toUpperCase() !== 'TRUE')
console.log(`\n[2b] Proyectos con "Carga Staff" = FALSE/vacío (Juan no verificó):`)
console.log(`    ${proyNoVerificado.length} / ${proy.length} proyectos`)
proyNoVerificado.slice(-15).forEach(p => console.log(`      fila ${p.__fila} | N° ${p['N° presupuesto']} | ${p['Cliente']} | ${p['Proyecto']} | evento ${p['Fecha Evento']}`))

const factNs = new Set(fact.map(f => norm(f['N° Presupuesto'])).filter(Boolean))
const proySinFact = proy.filter(p => p['N° presupuesto'] && !factNs.has(norm(p['N° presupuesto'])))
console.log(`\n[3] Proyectos SIN entrada en FACTURACION:`)
console.log(`    ${proySinFact.length} / ${proy.length} proyectos`)
proySinFact.slice(-15).forEach(p => console.log(`      fila ${p.__fila} | N° ${p['N° presupuesto']} | ${p['Cliente']} | ${p['Proyecto']} | evento ${p['Fecha Evento']}`))
if (proySinFact.length > 15) console.log(`      ... y ${proySinFact.length-15} más`)

const factSinCobrar = fact.filter(f => String(f['Cobrado']||'').trim().toUpperCase() !== 'TRUE')
console.log(`\n[4] Facturas SIN fecha de cobro:`)
console.log(`    ${factSinCobrar.length} / ${fact.length} facturas`)
const cobAtrasadas = factSinCobrar
  .filter(f => /202[5-6]/.test(String(f['Fecha Evento']||'')))
  .slice(-15)
console.log(`    Últimas 15 (eventos 2025-2026):`)
cobAtrasadas.forEach(f => console.log(`      fila ${f.__fila} | N° pres ${f['N° Presupuesto']} | ${f['Cliente']} | ${f['Proyecto']} | $${f['Precio FINAL']} | evento ${f['Fecha Evento']}`))

const proyConFact = proy.filter(p => factNs.has(norm(p['N° presupuesto'])))
const proyFactCobr = proyConFact.filter(p => {
  const f = fact.find(ff => norm(ff['N° Presupuesto']) === norm(p['N° presupuesto']))
  return f && String(f['Cobrado']||'').toUpperCase() === 'TRUE'
})
const pagosByProy = {}
pagos.forEach(p => {
  const k = norm(p['N° Presupuesto'])
  if (!k) return
  if (!pagosByProy[k]) pagosByProy[k] = { total: 0, pagado: 0, count: 0 }
  pagosByProy[k].total += Number(String(p['Monto Adeudado']||0).replace(/[^\d.-]/g,'')) || 0
  pagosByProy[k].pagado += Number(String(p['Monto Pagado']||0).replace(/[^\d.-]/g,'')) || 0
  pagosByProy[k].count++
})
const proyCobradoSinPagar = proyFactCobr.filter(p => {
  const k = norm(p['N° presupuesto'])
  const ps = pagosByProy[k]
  return ps && ps.total > ps.pagado + 1
})
console.log(`\n[5] Proyectos COBRADOS pero con staff sin pagar (Monto Adeudado > Monto Pagado):`)
console.log(`    ${proyCobradoSinPagar.length} de ${proyFactCobr.length} proyectos cobrados`)
proyCobradoSinPagar.slice(0,15).forEach(p => {
  const k = norm(p['N° presupuesto'])
  const ps = pagosByProy[k]
  console.log(`      fila ${p.__fila} | N° ${p['N° presupuesto']} | ${p['Cliente']} | adeudado $${ps.total.toFixed(0)} pagado $${ps.pagado.toFixed(0)} pendiente $${(ps.total-ps.pagado).toFixed(0)}`)
})

const pagosHuerfanos = pagos.filter(p => p['N° Presupuesto'] && !proyNs.has(norm(p['N° Presupuesto'])))
console.log(`\n[6] PAGOS_STAFF con N° presupuesto que no existe en PROYECTOS:`)
console.log(`    ${pagosHuerfanos.length} / ${pagos.length} pagos`)
console.log(`    (probable: pagos viejos cuando los proyectos vivían en otra solapa o sin numerar)`)

console.log('\n===== RESUMEN EJECUTIVO =====')
console.log(`Presupuestos APROBADOS sin proyecto:     ${presuApSinProy.length}  (BUG sheet — perdimos la replicación)`)
console.log(`Proyectos sin staff asignado:            ${proySinNingunStaff.length}  (datos faltantes)`)
console.log(`Proyectos no verificados (Carga Staff):  ${proyNoVerificado.length}  (Juan no chequeó)`)
console.log(`Proyectos sin facturar:                  ${proySinFact.length}  (a facturar)`)
console.log(`Facturas emitidas sin cobrar:            ${factSinCobrar.length}  (a cobrar)`)
console.log(`Proyectos cobrados con staff impago:     ${proyCobradoSinPagar.length}  (a pagar)`)
console.log(`Pagos staff sin proyecto match:          ${pagosHuerfanos.length}  (probable: viejos o N° distinto)`)
