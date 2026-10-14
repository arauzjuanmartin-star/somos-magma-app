// Correcciones aprobadas por Juan el 15/10/2026 (pedidos de Sofi y Juan del 14/10).
//   A. Links de pre-entrega mal puestos por la búsqueda automática vieja (#2331 Pani Feroz, #2298 Mesa)
//   B. Telefe: vencimiento de #2255, #2256, #2257 → 1/12/2026
//   C. Monotributo de Lucho: ACUERDOS pasa a $112.190,12 y queda pendiente la diferencia de septiembre ($46.170)
//   D. Lucho: monotributo y horas extra de septiembre se pagaron el 5/10 desde Santander Lucia (no el 14/10 desde
//      BBVA). Los saldos reales se cargaron el 14/10 12:56 y el tilde fue 13:53: BBVA quedó $126.020,12 de menos.
//   E. Green Deco #2300: la factura A 0001-00000163 ($834.900 con IVA) se anuló con nota de crédito y se cobró
//      $690.000 en efectivo. El saldo de la caja de efectivo no se toca (Juan lo carga a mano).
// Uso: node scripts/correcciones-2026-10-15.mjs            → preview
//      node scripts/correcciones-2026-10-15.mjs --escribir → aplica y deja rollback
import { writeFileSync } from 'fs'
import { getSheets } from '../lib/sheets.js'

const ESCRIBIR = process.argv.includes('--escribir')
const { sheets, SHEET_ID } = await getSheets()
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
const get = async r => (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: r })).data.values || []
const updates = [], rollback = [], frenos = []
const poner = (hoja, H, rows, fila, col, valor, esperado) => {
  const i = H.indexOf(col); if (i < 0) { frenos.push(`${hoja}: no existe la columna "${col}"`); return }
  const antes = String(rows[fila - 1]?.[i] ?? '')
  if (esperado !== undefined && !esperado(antes)) { frenos.push(`${hoja} fila ${fila} "${col}": esperaba otra cosa y hay "${antes}"`); return }
  const range = `${hoja}!${colLetra(i)}${fila}`
  updates.push({ range, values: [[valor]] }); rollback.push({ range, values: [[antes]] })
  console.log(`  ${range}  "${antes.slice(0, 60)}" → "${String(valor).slice(0, 60)}"`)
}

// ---------- A ----------
console.log('\nA. Links de pre-entrega')
const ED = await get('EDICION!A:AO'), hE = ED[0]
const LINKS = {
  '2331-2': 'https://drive.google.com/file/d/1JXWuVTELjW848owZ5f1L1sLLqF5Mugvg/view?usp=drivesdk',
  '2331-3': 'https://drive.google.com/file/d/1CAX0oZ9IBCeJa743riERXKl--8f6vzYQ/view?usp=drivesdk',
  '2331-4': 'https://drive.google.com/file/d/1fZxn92EhghSClgzAnMGGwOQS01dxWfgI/view?usp=drivesdk',
  '2331-5': 'https://drive.google.com/file/d/1HjnP_oyg0WTd_bz-QHAcjFMCOjmgnJwq/view?usp=drivesdk',
  '2298-M1': 'https://drive.google.com/file/d/1-gWxEPz-2pFCVi9nITENUI-j1q3vsvfy/view?usp=drivesdk',
}
const MAL = { '2331': '1XS7vlFuo1L4GYBIj6U7je8tqe3EjUlj_', '2298': '1CUqr2_mCL_jWPgFY-jfo68lXuBgCyXmw' }
for (const [id, link] of Object.entries(LINKS)) {
  const fila = ED.findIndex(r => String(r[hE.indexOf('ID')]).trim() === id) + 1
  if (fila < 2) { frenos.push(`EDICION: no está ${id}`); continue }
  poner('EDICION', hE, ED, fila, 'Link pre-entrega', link, a => a.includes(MAL[id.split('-')[0]]))
}

// ---------- B ----------
console.log('\nB. Telefe: vencimiento 1/12/2026')
const FC = await get('FACTURACION!A:AJ'), hF = FC[0]
for (const n of ['2255', '2256', '2257']) {
  const filas = FC.map((r, i) => ({ r, f: i + 1 })).filter(x => x.f > 1 && String(x.r[hF.indexOf('N° Presupuesto')]).trim() === n && /telefe/i.test(x.r[hF.indexOf('Agencia')]))
  if (filas.length !== 1) { frenos.push(`FACTURACION #${n}: ${filas.length} filas`); continue }
  poner('FACTURACION', hF, FC, filas[0].f, 'Vencimiento', '1/12/2026')
}

// ---------- C + D ----------
console.log('\nC. Monotributo de Lucho')
const AC = await get('ACUERDOS!A:W'), hA = AC[0]
const fAc = AC.findIndex(r => /Chavez/i.test(r[hA.indexOf('Persona')])) + 1
poner('ACUERDOS', hA, AC, fAc, 'Monotributo', 'Magma — categoría C, $112.190,12/mes', a => a.includes('66.020,12'))
console.log('\nD. Pago del 5 de Lucho')
const PS = await get('PAGOS_STAFF!A:P'), hP = PS[0]
for (const f of [1325, 1353, 1354]) {
  const r = PS[f - 1] || []
  if (!/Chavez/.test(r[hP.indexOf('Freelancer')]) || String(r[hP.indexOf('Cuenta')]).trim() !== 'BBVA Somos Magma') { frenos.push(`PAGOS_STAFF fila ${f} no es la que esperaba`); continue }
  poner('PAGOS_STAFF', hP, PS, f, 'Fecha Pago', '5/10/2026')
  poner('PAGOS_STAFF', hP, PS, f, 'Cuenta', 'Santander Lucia')
}
const CU = await get('CUENTAS!A:N'), hC = CU[0]
const fB = CU.findIndex(r => String(r[0]).trim() === 'BBVA Somos Magma') + 1
const saldoB = parseFloat(String(CU[fB - 1][hC.indexOf('Saldo actual')]).replace(/[^\d.-]/g, ''))
poner('CUENTAS', hC, CU, fB, 'Saldo actual', Math.round((saldoB + 126020.12) * 100) / 100)
// La diferencia de septiembre, pendiente (la app la muestra como línea "va con el pago del 5")
const filaDif = new Array(hP.length).fill('')
const setP = (k, v) => { filaDif[hP.indexOf(k)] = v }
setP('Freelancer', 'Jorge Luis Chavez'); setP('Mes Referencia', '09 - septiembre'); setP('Proyecto', 'Monotributo septiembre (diferencia)')
setP('Servicio', '🧾 Monotributo (diferencia)'); setP('Monto Adeudado', 46170); setP('Estado', 'Pendiente'); setP('Período', '2026-09')
setP('Notas', 'Septiembre se pagó a $66.020,12 y su monotributo es $112.190,12 (Juan, 15/10/2026). Va con el pago del 5.')
const yaDif = PS.some(r => /Monotributo \(diferencia\)/.test(r[hP.indexOf('Servicio')]) && /septiembre/.test(r[hP.indexOf('Mes Referencia')]))
console.log(yaDif ? '  ✓ la diferencia de septiembre ya estaba' : '  + PAGOS_STAFF: 🧾 Monotributo (diferencia) septiembre $46.170 pendiente')

// ---------- E ----------
console.log('\nE. Green Deco #2300')
const fGD = FC.findIndex((r, i) => i > 0 && String(r[hF.indexOf('N° Presupuesto')]).trim() === '2300' && String(r[hF.indexOf('Nro de Factura')]).trim() === '0001-00000163') + 1
let filaEf = null
if (fGD < 2) frenos.push('FACTURACION: no encontré #2300 con la factura 0001-00000163')
else {
  const r = FC[fGD - 1]
  poner('FACTURACION', hF, FC, fGD, 'Nro de Factura', 'ANULADA - 0001-00000163')
  poner('FACTURACION', hF, FC, fGD, 'COMENTARIOS', `Anulada 15/10/2026 con nota de crédito (iba sin IVA). Se cobró $690.000 en efectivo: ver la fila "Efectivo" del #2300.${r[hF.indexOf('COMENTARIOS')] ? ' | ' + r[hF.indexOf('COMENTARIOS')] : ''}`)
  filaEf = hF.map((k, i) => r[i] ?? '')
  const setF = (k, v) => { const i = hF.indexOf(k); if (i > -1) filaEf[i] = v }
  setF('Nro de Factura', 'Efectivo'); setF('Tipo de Factura', 'Sin factura (efectivo)'); setF('Precio SIN IVA', 690000); setF('IVA', 0); setF('Precio FINAL', 690000)
  setF('Cobrado', 'TRUE'); setF('Fecha cobro', '15/10/2026'); setF('Monto cobrado', 690000); setF('Cuenta destino', 'Efectivo'); setF('Forma de pago', 'Efectivo')
  setF('Fc Enviada', 'FALSE'); setF('Factura', ''); setF('COMENTARIOS', 'Cobrado en efectivo después de anular la factura A 0001-00000163 con nota de crédito (Juan, 15/10/2026). Fecha de cobro = el día que se cargó.')
  console.log('  + FACTURACION: #2300 Green Deco · Efectivo · $690.000 · cobrado')
  console.log('  + COBROS: #2300 total $690.000 Efectivo (sin tocar el saldo)')
}

if (frenos.length) { console.log('\n⛔ FRENOS:\n  ' + frenos.join('\n  ')); process.exit(1) }
if (!ESCRIBIR) { console.log('\n👀 PREVIEW — nada se escribió. Correr con --escribir.'); process.exit(0) }

await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'RAW', data: updates } })
if (!yaDif) await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'PAGOS_STAFF!A:P', valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: [filaDif] } })
if (filaEf) {
  await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A:AJ', valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: [filaEf] } })
  await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'COBROS!A:L', valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[new Date().toISOString(), '2300', 'Green Deco', 'total', 690000, 'Efectivo', 'Efectivo', 0, 0, 0, 0, 'Después de la NC de la factura 0001-00000163 · sin tocar el saldo']] } })
}
await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
  requestBody: { values: [[new Date().toISOString(), 'juan (script)', 'correcciones-2026-10-15', 'VARIAS', '2331/2298/2255-7/Lucho/2300', `${updates.length} celdas · BBVA +126020,12 · Lucho dif. monotributo sept $46.170 · Green Deco NC + efectivo $690.000`]] } })
writeFileSync('scripts/.rollback-correcciones-2026-10-15.json', JSON.stringify({ rollback, agregadas: ['PAGOS_STAFF diferencia monotributo', 'FACTURACION #2300 Efectivo', 'COBROS #2300'] }, null, 2))
console.log(`\n✅ ${updates.length} celdas escritas. Rollback: scripts/.rollback-correcciones-2026-10-15.json`)
