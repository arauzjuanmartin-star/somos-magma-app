/**
 * Columna "Condición de cobro" en AGENCIAS (pegada a "Plazo de pago") y en CLIENTES (pegada a "Agencia habitual").
 * Es la regla de resguardo que la app aplica al APROBAR un presupuesto (pages/api/presupuesto-estado.js):
 *
 *   Seña 30%          nuevos y chicos: sin la seña cobrada no se aprueba (es el default si la celda está vacía)
 *   OC                sin la orden de compra del cliente no se aprueba
 *   OC después        la OC llega después de la fecha, antes de facturar (Austral): se aprueba sin pedir nada
 *   Cuenta corriente  de confianza, pagan después y dan volumen: se aprueba sin pedir nada
 *
 * Juan, 07/10/2026: "Ostara nos paga después. ADN nos paga después, un poco gracias a esto nos dan un montón de
 * trabajo. Meikin le cobramos el 30, Mucha también, algunos nuevos les estamos cobrando el 30. Austral la orden de
 * compra la hacen después de que hacemos la fecha." Y confirmó la lista de cuenta corriente.
 *
 * La celda tiene un desplegable con las 4 opciones (Mariana y Sofi trabajan en el sheet). Lo que no está en la lista
 * queda vacío = Seña 30%. Se busca a la agencia primero y al cliente después, por nombre.
 *
 * Qué hace con --escribir: inserta las dos columnas (si no están), pone el desplegable, carga los 7 valores y
 * verifica que ningún otro título se haya corrido.
 *
 * OJO con el orden: la columna de CLIENTES va en el medio (C) y hasta el 07/10/2026 cliente-upsert escribía por
 * letra. Primero deployar el código que escribe por título; recién después correr sin --solo.
 *
 * Uso:  node scripts/condicion-cobro-columnas.mjs                          (preview)
 *       node scripts/condicion-cobro-columnas.mjs --escribir --solo=AGENCIAS  (hoy)
 *       node scripts/condicion-cobro-columnas.mjs --escribir                 (CLIENTES, después del deploy)
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { COL_CONDICION, CONDICIONES, SIN_PEDIR } from '../lib/condicion-cobro.js'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })
const ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')
// --solo=AGENCIAS: hasta que esté deployado el cliente-upsert que escribe por título (07/10/2026), la columna de
// CLIENTES NO se inserta: en producción el endpoint viejo escribe por letra y correría Industria, Notas y fechas.
const SOLO = (process.argv.find(a => a.startsWith('--solo=')) || '').split('=')[1] || ''
const txt = v => String(v ?? '').trim()
const norm = s => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }

// Lo que confirmó Juan el 07/10/2026 (todos viven en AGENCIAS, que es quien paga)
const VALORES = {
  AGENCIAS: { 'Ostara': 'Cuenta corriente', 'ADN': 'Cuenta corriente', 'CMQ': 'Cuenta corriente', 'Stadium': 'Cuenta corriente', 'Oir Comunicaciones': 'Cuenta corriente', 'Infinity Midia': 'Cuenta corriente', 'Austral': 'OC después' },
  CLIENTES: {},
}
const SOLAPAS = [{ t: 'AGENCIAS', despuesDe: 'Plazo de pago' }, { t: 'CLIENTES', despuesDe: 'Agencia habitual' }].filter(s => !SOLO || s.t === SOLO)

const meta = await sheets.spreadsheets.get({ spreadsheetId: ID, fields: 'sheets(properties(title,sheetId,gridProperties),basicFilter)' })
const R = await sheets.spreadsheets.values.batchGet({ spreadsheetId: ID, ranges: SOLAPAS.map(s => `${s.t}!A:Z`) })
const datos = Object.fromEntries(SOLAPAS.map((s, i) => [s.t, R.data.valueRanges[i].values || []]))
console.log(`\nCondición de cobro — ${ESCRIBIR ? 'ESCRIBIENDO' : 'PREVIEW (nada se toca)'}`)
console.log(`Opciones del desplegable: ${CONDICIONES.join(' · ')} · (vacío = ${CONDICIONES[0]}) · no piden nada al aprobar: ${SIN_PEDIR.join(', ')}\n`)

const planes = [], problemas = []
for (const s of SOLAPAS) {
  const hoja = meta.data.sheets.find(x => x.properties.title === s.t), H = datos[s.t][0] || []
  const iYa = H.findIndex(h => norm(h) === norm(COL_CONDICION)), iAncla = H.findIndex(h => norm(h) === norm(s.despuesDe))
  if (iAncla < 0) { problemas.push(`${s.t}: no encuentro "${s.despuesDe}"`); continue }
  const destino = iYa >= 0 ? iYa : iAncla + 1
  const queda = iYa >= 0 ? [...H] : [...H.slice(0, destino), COL_CONDICION, ...H.slice(destino)]
  console.log(`${s.t} · ${datos[s.t].length - 1} filas · filtro ${hoja.basicFilter ? 'sí' : 'no tiene'}`)
  console.log(`   AHORA: ${H.map((h, i) => `${colLetra(i)}:${h}`).join(' · ')}`)
  console.log(iYa >= 0 ? `   "${COL_CONDICION}" ya existe en ${colLetra(iYa)}.` : `   QUEDA: ${queda.map((h, i) => `${colLetra(i)}:${h}`).join(' · ')}`)
  const filas = []
  for (const [nombre, valor] of Object.entries(VALORES[s.t])) {
    const f = datos[s.t].map((r, i) => ({ r, i })).filter(({ r, i }) => i > 0 && norm(r[0]) === norm(nombre))
    if (f.length !== 1) { problemas.push(`${s.t}: "${nombre}" figura ${f.length} veces, esperaba 1`); continue }
    const ya = iYa >= 0 ? txt(f[0].r[iYa]) : ''
    console.log(`   ${nombre.padEnd(20)} fila ${String(f[0].i + 1).padStart(3)} · ${ya || 'vacío'} → ${valor}`)
    filas.push({ fila: f[0].i + 1, valor })
  }
  planes.push({ s, hoja, H, iYa, destino, queda, filas })
  console.log()
}
if (problemas.length) { console.log('✗ Problemas:\n   ' + problemas.join('\n   ') + '\n'); process.exit(1) }
if (!ESCRIBIR) { console.log('(preview — corré con --escribir para aplicar)\n'); process.exit(0) }

for (const p of planes) {
  const sid = p.hoja.properties.sheetId, filasTotal = p.hoja.properties.gridProperties.rowCount
  const requests = []
  if (p.iYa < 0) requests.push({ insertDimension: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: p.destino, endIndex: p.destino + 1 }, inheritFromBefore: false } })
  requests.push({ setDataValidation: {
    range: { sheetId: sid, startRowIndex: 1, endRowIndex: filasTotal, startColumnIndex: p.destino, endColumnIndex: p.destino + 1 },
    rule: { condition: { type: 'ONE_OF_LIST', values: CONDICIONES.map(v => ({ userEnteredValue: v })) }, showCustomUi: true, strict: false },
  } })
  if (p.hoja.basicFilter?.range) {
    const r = p.hoja.basicFilter.range
    requests.push({ setBasicFilter: { filter: { range: { ...r, endColumnIndex: Math.max(r.endColumnIndex || 0, p.queda.length) } } } })
  }
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests } })
  const L = colLetra(p.destino)
  const data = [{ range: `${p.s.t}!${L}1`, values: [[COL_CONDICION]] }, ...p.filas.map(f => ({ range: `${p.s.t}!${L}${f.fila}`, values: [[f.valor]] }))]
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: ID, requestBody: { valueInputOption: 'USER_ENTERED', data } })
  // Verificar: la fila 1 tiene que ser exactamente "queda" (ningún título corrido)
  const H2 = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: `${p.s.t}!1:1` })).data.values?.[0] || []
  const mal = p.queda.filter((h, i) => norm(H2[i]) !== norm(h))
  if (mal.length) { console.log(`✗ ${p.s.t}: después de escribir no coinciden los títulos: ${mal.join(', ')}. Revisar la fila 1 a mano.`); process.exit(1) }
  console.log(`✓ ${p.s.t}: "${COL_CONDICION}" en ${L} con desplegable · ${p.filas.length} valores cargados · ${H2.length} títulos, ninguno corrido`)
}
console.log()
