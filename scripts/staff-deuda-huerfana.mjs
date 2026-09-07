// Las filas de Pagos_Staff cargadas contra un presupuesto que nunca se aprobó.
//
// Este es el criterio que destrabó la deuda del staff. Durante un tiempo se buscaron
// "grupos repetidos" (misma persona, mes, proyecto y monto) y daban 19 casos ambiguos:
// "Cobertuna 3 fechas" dos veces puede ser un error de carga o dos jornadas reales, y
// desde afuera no se distingue. El criterio bueno no mira la repetición, mira el
// ESTADO del presupuesto de esa fila:
//
//   - REPRESUPUESTADO o DESAPROBADO → ese presupuesto se rehizo o se cayó. El staff
//     se cargó igual mientras se negociaba y quedó ahí. Lo que se trabajó se paga
//     contra el número que sí se aprobó. Iveco Test Drive del 23/6 tiene CINCO
//     presupuestos represupuestados y uno aprobado: el trabajo fue uno solo.
//   - Sin rastro en PRESUPUESTOS ni en PROYECTOS → el trabajo se hizo pero nadie
//     cargó el proyecto. La deuda es real; lo que falta es el proyecto.
//
//   node scripts/staff-deuda-huerfana.mjs              → preview
//   node scripts/staff-deuda-huerfana.mjs --escribir   → marca los duplicados como Anulado

import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
  const i=l.indexOf('='); let v=l.slice(i+1).trim()
  if (v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1)
  return [l.slice(0,i).trim(), v]
}))
const auth = new google.auth.GoogleAuth({
  credentials:{ client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') },
  scopes:['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version:'v4', auth })
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')

// Los montos del sheet vienen en formato US: $764,800.00 → la coma es de miles.
const numUS = v => { const n = parseFloat(String(v||'').replace(/[$\s,]/g,'')); return isNaN(n)?0:n }
const plata = n => '$' + Math.round(n).toLocaleString('es-AR')
const norm  = s => String(s||'').trim().toLowerCase()
// "📷 Foto 1" y "Foto 1" son el mismo pedido: el emoji lo pone la app al mostrar.
const pedido = s => norm(String(s||'').replace(/^[^\p{L}\p{N}]+/u,''))

const b = await sheets.spreadsheets.values.batchGet({
  spreadsheetId: SHEET_ID, ranges:['Pagos_Staff!A:N','PROYECTOS!A:ET','PRESUPUESTOS!A:J'],
})
const [pv, yv, sv] = b.data.valueRanges.map(v => v.values||[])
const hP = pv[0], hY = yv[0], hS = sv[0]

// En PRESUPUESTOS el N° vive en la columna A, cuyo header dice "Columna 1", y el
// estado en la D. Buscarlo por un nombre que suene a "N° presupuesto" no lo encuentra.
const iSn = 0, iSe = hS.findIndex(x => /^estado$/i.test(String(x||'').trim()))
const estadoDe = {}
sv.slice(1).forEach(r => {
  const n = String(r[iSn]||'').trim()
  if (n) estadoDe[n] = String(r[iSe]||'').trim().toUpperCase()
})
const MURIO = /REPRESUPUESTADO|DESAPROBADO/

const pagos = pv.slice(1).map((r,i) => ({ fila:i+2, ...Object.fromEntries(hP.map((k,j)=>[k, r[j]??''])) }))
const pend  = pagos.filter(x => !/pagad/i.test(String(x.Estado||'')) && numUS(x['Monto Adeudado']) > 0)
const enProyectos = new Set(yv.slice(1).map(r => String(r[2]||'').trim()).filter(Boolean))

const huerfanas = pend.filter(x => {
  const n = String(x['N° Presupuesto']||'').trim()
  if (!n) return false
  // Un presupuesto que se rehizo o se cayó no genera pagos, aunque tenga staff cargado.
  if (MURIO.test(estadoDe[n] || '')) return true
  return !enProyectos.has(n)
})
const sum = a => a.reduce((s,x) => s + numUS(x['Monto Adeudado']), 0)

// Agrupo las huérfanas por N° y busco, para cada una, si existe otro presupuesto con
// el mismo nombre de proyecto que SÍ está en PROYECTOS y cubre las mismas líneas.
const porNro = {}
huerfanas.forEach(x => {
  const n = String(x['N° Presupuesto']).trim()
  ;(porNro[n] = porNro[n] || { proyecto: x.Proyecto, filas: [] }).filas.push(x)
})

const firma = f => f.map(x => `${norm(x.Freelancer)}·${pedido(x.Servicio)}·${numUS(x['Monto Adeudado'])}`).sort().join(' | ')

const duplicados = [], sinProyecto = []
for (const [nro, g] of Object.entries(porNro)) {
  const estado = estadoDe[nro] || ''
  // Candidatos a "el número bueno": mismo proyecto o mismo cliente, aprobado.
  const gemelos = [...new Set(pagos
    .filter(x => norm(x.Proyecto) === norm(g.proyecto) && String(x['N° Presupuesto']).trim() !== nro)
    .map(x => String(x['N° Presupuesto']).trim()))].filter(n => n && enProyectos.has(n))

  const match = gemelos.find(n => {
    const otras = pagos.filter(x => String(x['N° Presupuesto']).trim() === n)
    if (firma(otras) === firma(g.filas)) return true
    const gente = s => [...new Set(s.map(x => norm(x.Freelancer)))].sort().join(',')
    return gente(otras) === gente(g.filas) && otras.length === g.filas.length
  })

  // El estado alcanza por sí solo: si el presupuesto se rehizo o se cayó, esas
  // líneas no se pagan aunque no se pueda señalar cuál es el número que quedó.
  if (MURIO.test(estado)) duplicados.push({ nro, gemelo: match || null, estado, ...g })
  else if (match) duplicados.push({ nro, gemelo: match, estado: estado || 'sin rastro', ...g })
  else sinProyecto.push({ nro, estado: estado || 'sin rastro', ...g })
}

console.log('════════ DEUDA DEL STAFF · FILAS SIN PROYECTO ════════\n')
console.log(`Pendientes totales:            ${String(pend.length).padStart(4)} filas  ${plata(sum(pend))}`)
console.log(`Con presupuesto en PROYECTOS:  ${String(pend.length-huerfanas.length).padStart(4)} filas  ${plata(sum(pend)-sum(huerfanas))}`)
console.log(`Huérfanas (N° inexistente):    ${String(huerfanas.length).padStart(4)} filas  ${plata(sum(huerfanas))}\n`)

const aBorrar = duplicados.flatMap(d => d.filas)
console.log(`🔴 NO SE PAGAN — el presupuesto se rehizo o se cayó: ${aBorrar.length} filas · ${plata(sum(aBorrar))}\n`)
duplicados.sort((a,b)=>sum(b.filas)-sum(a.filas)).forEach(d => {
  const porque = MURIO.test(d.estado || '')
    ? `${d.estado}${d.gemelo ? ` — el trabajo se paga con #${d.gemelo}` : ''}`
    : `ya está cargado como #${d.gemelo}`
  console.log(`   #${d.nro} "${String(d.proyecto).trim()}"  →  ${porque}`)
  d.filas.forEach(x => console.log(`      f${String(x.fila).padStart(4)}  ${String(x.Freelancer).slice(0,24).padEnd(24)} ${String(x.Servicio).padEnd(14)} ${plata(numUS(x['Monto Adeudado'])).padStart(11)}`))
  console.log(`      subtotal ${plata(sum(d.filas))}\n`)
})

console.log(`🟡 SÍ SE PAGAN — el trabajo se hizo pero nadie cargó el proyecto: ${sinProyecto.flatMap(d=>d.filas).length} filas · ${plata(sum(sinProyecto.flatMap(d=>d.filas)))}`)
console.log(`   (esta deuda SE PAGA igual — lo que falta es cargar el proyecto)\n`)
sinProyecto.sort((a,b)=>sum(b.filas)-sum(a.filas)).forEach(d => {
  console.log(`   #${d.nro} "${String(d.proyecto).trim()}" · ${plata(sum(d.filas))}  [${d.estado}]`)
  d.filas.forEach(x => console.log(`      f${String(x.fila).padStart(4)}  ${String(x['Mes Referencia']).padEnd(14)} ${String(x.Freelancer).slice(0,24).padEnd(24)} ${String(x.Servicio).padEnd(14)} ${plata(numUS(x['Monto Adeudado'])).padStart(11)}`))
})

const limpia = sum(pend) - sum(aBorrar)
console.log(`\n────────────────────────────────────────────────`)
console.log(`Deuda hoy:               ${plata(sum(pend))}`)
console.log(`De presupuestos caídos: −${plata(sum(aBorrar))}`)
console.log(`Deuda real:              ${plata(limpia)}`)

if (!ESCRIBIR) {
  console.log('\n👀 PREVIEW — no se tocó nada.')
  console.log('   Con --escribir esas filas pasan a Estado "Anulado" (no se borran: quedan en el sheet con el motivo).')
  process.exit(0)
}

// No se borran. Se marcan: si mañana aparece que una era real, está la fila entera.
const iEstado = hP.indexOf('Estado'), iNotas = hP.indexOf('Notas')
const col = i => String.fromCharCode(65 + i)
const data = aBorrar.flatMap(x => {
  const d = duplicados.find(g => g.filas.includes(x))
  return [
    { range: `Pagos_Staff!${col(iEstado)}${x.fila}`, values: [['Anulado']] },
    { range: `Pagos_Staff!${col(iNotas)}${x.fila}`,  values: [[
      MURIO.test(d.estado||'')
        ? `Presupuesto ${d.estado}${d.gemelo ? ` — se paga con #${d.gemelo}` : ''} — anulado ${new Date().toLocaleDateString('es-AR')}`
        : `Duplicado de #${d.gemelo} — anulado ${new Date().toLocaleDateString('es-AR')}`
    ]] },
  ]
})
await sheets.spreadsheets.values.batchUpdate({
  spreadsheetId: SHEET_ID,
  requestBody: { valueInputOption:'USER_ENTERED', data },
})
console.log(`\n✅ ${aBorrar.length} filas marcadas como Anulado. Deuda real: ${plata(limpia)}`)
