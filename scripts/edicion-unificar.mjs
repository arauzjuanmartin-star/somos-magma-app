// Una tarea cargada a mano que en realidad ES una línea del presupuesto.
//
// Pasa así: el sync crea "Edit 60s" con staff "Somos Magma" (o sea, sin editor),
// alguien carga a mano una tarea para asignarla y el proyecto queda con dos
// edits que son uno solo (#2231 Evento CEL, 14/9/2026). Borrar la del sync no
// sirve: la vuelve a crear la próxima vez que se abre el tablero.
//
// Lo que sí queda: la tarea manual TOMA el ID de la línea del presupuesto (con
// todo lo suyo: estado, brief, links, bitácora) y la fila vacía del sync se borra.
//
//   node scripts/edicion-unificar.mjs 2231-M1 2231-3              → preview
//   node scripts/edicion-unificar.mjs 2231-M1 2231-3 --escribir   → aplica y verifica
//
// Se niega si la fila del sync tiene trabajo encima (estado avanzado, notas o
// links propios): ahí hay que mirar a mano cuál es cuál.

import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { HEADERS_EDICION } from '../lib/edicion.js'

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
const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
const ESCRIBIR = process.argv.includes('--escribir')
const [ID_MANUAL, ID_SLOT] = args
if (!ID_MANUAL || !ID_SLOT || !/-M\d+$/.test(ID_MANUAL) || !/^\d+-\d+$/.test(ID_SLOT)) {
  console.error('Uso: node scripts/edicion-unificar.mjs <id manual, ej 2231-M1> <id del presupuesto, ej 2231-3> [--escribir]'); process.exit(1)
}
if (ID_MANUAL.split('-')[0] !== ID_SLOT.split('-')[0]) { console.error('Los dos IDs tienen que ser del mismo presupuesto'); process.exit(1) }

const colLetra = c => { let s='', n=c+1; while(n>0){ n--; s=String.fromCharCode(65+(n%26))+s; n=Math.floor(n/26) } return s }
const ULT = colLetra(HEADERS_EDICION.length - 1)
const leer = async () => {
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `EDICION!A:${ULT}` })
  const rows = r.data.values || [], h = rows[0] || []
  const c = n => h.indexOf(n)
  const buscar = id => { const i = rows.findIndex((x, k) => k > 0 && String(x[c('ID')] || '').trim() === id); return i === -1 ? null : { fila: i + 1, row: rows[i] } }
  return { h, c, rows, buscar }
}

const { c, buscar } = await leer()
const man = buscar(ID_MANUAL), slot = buscar(ID_SLOT)
if (!man) { console.error(`No existe ${ID_MANUAL} en EDICION`); process.exit(1) }
if (!slot) { console.error(`No existe ${ID_SLOT} en EDICION (¿ya se unificó?)`); process.exit(1) }
const v = (r, k) => String(r[c(k)] || '').trim()

// La fila del sync tiene que estar vacía de trabajo: si no, no se sabe cuál es la buena.
const trabajoSlot = []
if (!['Sin material', ''].includes(v(slot.row, 'Estado'))) trabajoSlot.push(`estado "${v(slot.row, 'Estado')}"`)
if (v(slot.row, 'Notas')) trabajoSlot.push('bitácora')
if (v(slot.row, 'Link pre-entrega') || v(slot.row, 'Link entrega')) trabajoSlot.push('links de entrega')
if (v(slot.row, 'Editor')) trabajoSlot.push(`editor "${v(slot.row, 'Editor')}"`)
if (trabajoSlot.length) { console.error(`✗ ${ID_SLOT} tiene trabajo encima (${trabajoSlot.join(', ')}). Mirarlo a mano.`); process.exit(1) }

const hoy = new Date()
const fecha = `${String(hoy.getDate()).padStart(2,'0')}/${String(hoy.getMonth()+1).padStart(2,'0')}`
// Si la tarea manual llevaba el nombre de la persona como título, esa persona
// es el editor. El título pasa a ser el de la línea del presupuesto.
const tituloManual = v(man.row, 'Entregable')
const editor = v(man.row, 'Editor') || tituloManual
const cambios = {
  'ID': ID_SLOT,
  'Entregable': v(slot.row, 'Entregable'),
  'Editor': editor,
  'Interno': v(slot.row, 'Interno'),
  'Origen': 'sync',
  'Notas': `[${fecha} app] Era la tarea "${tituloManual}" (${ID_MANUAL}): unificada con la línea del presupuesto "${v(slot.row, 'Entregable')}".` + (v(man.row, 'Notas') ? '\n' + v(man.row, 'Notas') : ''),
  'Actualizado': new Date().toISOString(),
  'Por': 'unificar',
}
if (!v(man.row, 'Link crudo') && v(slot.row, 'Link crudo')) cambios['Link crudo'] = v(slot.row, 'Link crudo')

console.log(`════════ UNIFICAR ${ID_MANUAL} + ${ID_SLOT} ════════\n`)
console.log(`Fila ${man.fila}  ${ID_MANUAL}  "${tituloManual}"  ${v(man.row,'Estado')}  ← se queda, pasa a ser ${ID_SLOT}`)
Object.entries(cambios).filter(([k]) => k !== 'Actualizado' && k !== 'Por').forEach(([k, val]) => {
  const antes = v(man.row, k)
  if (antes !== val) console.log(`     ${k.padEnd(11)} "${antes.slice(0, 40)}" → "${String(val).slice(0, 60)}"`)
})
console.log(`     (se conservan: estado, prioridad, fecha, brief, links, PM y la bitácora entera)`)
console.log(`\nFila ${slot.fila}  ${ID_SLOT}  "${v(slot.row,'Entregable')}"  ${v(slot.row,'Estado')}  ← se borra (vacía)`)

if (!ESCRIBIR) { console.log(`\n(preview) Para aplicar:  node scripts/edicion-unificar.mjs ${ID_MANUAL} ${ID_SLOT} --escribir`); process.exit(0) }

// Primero se escribe, después se borra: borrar corre las filas de abajo.
await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED',
  data: Object.entries(cambios).map(([k, val]) => ({ range: `EDICION!${colLetra(c(k))}${man.fila}`, values: [[val]] })) } })
const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties(title,sheetId))' })
const sid = meta.data.sheets.find(s => s.properties.title === 'EDICION')?.properties.sheetId
await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [{ deleteDimension: { range: { sheetId: sid, dimension: 'ROWS', startIndex: slot.fila - 1, endIndex: slot.fila } } }] } })
try {
  await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[new Date().toISOString(), 'script', 'edicion-unificar', 'EDICION', ID_SLOT, `${ID_MANUAL} "${tituloManual}" pasó a ser ${ID_SLOT}; fila vacía del sync borrada`]] } })
} catch (e) {}

// Verificar releyendo: una sola fila con el ID del slot, ninguna con el manual, y los datos de la manual intactos.
const d = await leer()
const todas = d.rows.slice(1).filter(x => String(x[d.c('ID')] || '').trim() === ID_SLOT)
const quedaManual = d.buscar(ID_MANUAL)
const nueva = todas[0]
const w = k => String(nueva?.[d.c(k)] || '').trim()
const ok = todas.length === 1 && !quedaManual && w('Editor') === editor && w('Estado') === v(man.row, 'Estado')
  && w('Notas').includes(v(man.row, 'Notas').slice(0, 60)) && w('Link pre-entrega') === v(man.row, 'Link pre-entrega')
console.log(ok ? `\n✓ verificado: ${ID_SLOT} es una sola fila, a cargo de ${editor}, estado "${w('Estado')}", bitácora y links intactos; ${ID_MANUAL} ya no existe`
             : `\n✗ algo no cerró: filas con ${ID_SLOT}=${todas.length}, ${ID_MANUAL} ${quedaManual ? 'sigue' : 'no está'}, editor="${w('Editor')}", estado="${w('Estado')}"`)
