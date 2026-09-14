// El cierre del tablero de Edición pasa a llamarse "Terminado" (14/9/2026).
//
// Antes "Aprobar" del PM ponía "Entregado" y el trabajo quedaba cerrado con el
// cliente todavía mirándolo. Ahora el OK del PM deja la pieza "Con el cliente",
// y "Terminado" es el OK del cliente. Este script deja el sheet acorde:
//   1. el desplegable de la columna Estado ofrece los estados vigentes
//   2. las filas cerradas con el nombre viejo ("Entregado" / "Aprobado") pasan a
//      "Terminado" — son trabajos cerrados hace semanas, nadie va a ir a pedirles
//      el OK ahora, y con tres nombres para lo mismo el filtro del sheet confunde
//
// Sin --escribir solo muestra. Con --escribir aplica y verifica al terminar.
//   node scripts/edicion-estado-terminado.mjs
//   node scripts/edicion-estado-terminado.mjs --escribir

import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { ESTADOS, HEADERS_EDICION } from '../lib/edicion.js'

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

const VIEJOS = ['Entregado', 'Aprobado']
const NUEVO = 'Terminado'
const colLetra = c => { let s='', n=c+1; while(n>0){ n--; s=String.fromCharCode(65+(n%26))+s; n=Math.floor(n/26) } return s }
const ULT = colLetra(HEADERS_EDICION.length - 1)

const leer = async () => {
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `EDICION!A:${ULT}` })
  const rows = r.data.values || []
  const h = rows[0] || []
  const c = n => h.indexOf(n)
  const filas = rows.slice(1).map((r, i) => ({ fila: i + 2, id: r[c('ID')] || '', num: r[c('N° presupuesto')] || '', cliente: r[c('Cliente')] || r[c('Agencia')] || '', entregable: r[c('Entregable')] || '', estado: String(r[c('Estado')] || '').trim(), fechaEntrega: r[c('Fecha entrega')] || '' }))
  return { h, c, filas }
}

const { h, c, filas } = await leer()
if (c('Estado') === -1) { console.error('No encuentro la columna Estado en EDICION'); process.exit(1) }

console.log(`════════ EDICION · estado "${NUEVO}" ════════\n`)
const porEstado = {}
filas.forEach(f => { const e = f.estado || '(vacío)'; porEstado[e] = (porEstado[e] || 0) + 1 })
console.log('Hoy, por estado:')
Object.entries(porEstado).sort((a, b) => b[1] - a[1]).forEach(([e, n]) => console.log(`   ${String(n).padStart(4)}  ${e}${VIEJOS.includes(e) ? '   ← nombre viejo' : ''}${!ESTADOS.includes(e) && !VIEJOS.includes(e) && e !== '(vacío)' ? '   ⚠ no está en la lista' : ''}`))

const aPasar = filas.filter(f => VIEJOS.includes(f.estado))
console.log(`\n1) Desplegable de Estado → ${ESTADOS.join(' · ')}`)
console.log(`\n2) Filas cerradas con el nombre viejo → "${NUEVO}": ${aPasar.length}`)
aPasar.slice(0, 12).forEach(f => console.log(`   fila ${f.fila}  ${String(f.id).padEnd(8)} #${f.num} ${String(f.cliente).slice(0, 26).padEnd(26)} ${String(f.entregable).replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 18).padEnd(18)} ${f.estado} · entregado ${f.fechaEntrega || '(sin fecha)'}`))
if (aPasar.length > 12) console.log(`   … y ${aPasar.length - 12} más`)

if (!ESCRIBIR) { console.log('\n(preview) Para aplicar:  node scripts/edicion-estado-terminado.mjs --escribir'); process.exit(0) }

// ---- aplicar ----
const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties(title,sheetId))' })
const sid = meta.data.sheets.find(s => s.properties.title === 'EDICION')?.properties.sheetId
await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [{ setDataValidation: {
  range: { sheetId: sid, startRowIndex: 1, endRowIndex: 2000, startColumnIndex: c('Estado'), endColumnIndex: c('Estado') + 1 },
  rule: { condition: { type: 'ONE_OF_LIST', values: ESTADOS.map(v => ({ userEnteredValue: v })) }, showCustomUi: true, strict: false },
}}] } })
console.log('\n✓ desplegable actualizado')

if (aPasar.length) {
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED',
    data: aPasar.map(f => ({ range: `EDICION!${colLetra(c('Estado'))}${f.fila}`, values: [[NUEVO]] })) } })
  console.log(`✓ ${aPasar.length} filas pasadas a "${NUEVO}"`)
  try {
    await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[new Date().toISOString(), 'script', 'edicion-estado-terminado', 'EDICION', '', `${aPasar.length} filas Entregado/Aprobado → Terminado`]] } })
  } catch (e) {}
}

// ---- verificar: releer y comprobar que cada fila tocada quedó bien y sigue siendo la misma ----
const despues = await leer()
const porFila = new Map(despues.filas.map(f => [f.fila, f]))
let mal = 0
aPasar.forEach(f => {
  const d = porFila.get(f.fila)
  if (!d || d.id !== f.id || d.estado !== NUEVO) { mal++; console.log(`   ✗ fila ${f.fila} (${f.id}): ahora ${d ? `${d.id} / ${d.estado}` : 'no existe'}`) }
})
const quedan = despues.filas.filter(f => VIEJOS.includes(f.estado)).length
console.log(mal || quedan ? `\n✗ ${mal} filas no quedaron como esperaba, ${quedan} siguen con nombre viejo` : `\n✓ verificado: ${aPasar.length} filas con "${NUEVO}", mismas IDs, ninguna con nombre viejo`)
