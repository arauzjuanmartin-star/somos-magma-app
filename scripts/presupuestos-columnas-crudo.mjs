/**
 * Agrega a PRESUPUESTOS las columnas "Entrega crudo" (DY) y "Tipo de trabajo" (DZ).
 *
 * Por qué (Juan, 27/10/2026): al presupuestar se marca si al cliente le entregamos el crudo.
 * Si sí, la carpeta del crudo se crea directo en ENTREGAS / … / proyecto / Crudo (la app no
 * puede mover archivos de la unidad CRUDO a ENTREGAS). Y Austral divide cada año en
 * "Jornadas" y "Video producto": el tipo decide en cuál va el proyecto.
 *
 * Van al final (después de "Precio visible") y no en el medio: mover columnas de
 * PRESUPUESTOS corre los 40 slots y rompe todo lo que lee por posición.
 * Desplegables: "Sí" en DY, "Jornadas" / "Video producto" en DZ. Extiende el basicFilter.
 *
 * Uso:  node scripts/presupuestos-columnas-crudo.mjs             (preview)
 *       node scripts/presupuestos-columnas-crudo.mjs --escribir
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { COL_ENTREGA_CRUDO, HEADER_ENTREGA_CRUDO, COL_TIPO_TRABAJO, HEADER_TIPO_TRABAJO, TIPOS_TRABAJO } from '../lib/slots.js'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })
const ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }

const meta = await sheets.spreadsheets.get({ spreadsheetId: ID, fields: 'sheets(properties(title,sheetId,gridProperties),basicFilter)' })
const hoja = meta.data.sheets.find(x => x.properties.title === 'PRESUPUESTOS')
const sid = hoja.properties.sheetId
const anchoActual = hoja.properties.gridProperties.columnCount
const h = ((await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'PRESUPUESTOS!A1:ZZ1' })).data.values || [])[0] || []

console.log(`\nPRESUPUESTOS: ${h.length} headers · la hoja tiene ${anchoActual} columnas · el filtro llega hasta ${colLetra((hoja.basicFilter?.range?.endColumnIndex || 0) - 1)}`)
console.log(`Última columna con nombre: ${colLetra(h.length - 1)} "${h[h.length - 1]}"`)
if (h[COL_ENTREGA_CRUDO] === HEADER_ENTREGA_CRUDO && h[COL_TIPO_TRABAJO] === HEADER_TIPO_TRABAJO) { console.log('\nLas dos columnas ya existen. No hago nada.\n'); process.exit(0) }
if (h.length !== COL_ENTREGA_CRUDO) { console.log(`\n✗ La última columna con nombre es la ${h.length} y lib/slots.js espera que "${HEADER_ENTREGA_CRUDO}" vaya en la ${COL_ENTREGA_CRUDO + 1} (${colLetra(COL_ENTREGA_CRUDO)}). Revisar antes de escribir.\n`); process.exit(1) }

console.log(`\nA crear:`)
console.log(`   ${colLetra(COL_ENTREGA_CRUDO)}1  ${HEADER_ENTREGA_CRUDO}   (desplegable: Sí / vacío)`)
console.log(`   ${colLetra(COL_TIPO_TRABAJO)}1  ${HEADER_TIPO_TRABAJO}   (desplegable: ${TIPOS_TRABAJO.join(' / ')} / vacío)`)
console.log(`\nEl filtro se extiende hasta ${colLetra(COL_TIPO_TRABAJO)}. No se toca ninguna fila de datos (las existentes quedan vacías = sin crudo, sin tipo).`)
if (!ESCRIBIR) { console.log('\n(preview — corré con --escribir para aplicar)\n'); process.exit(0) }

const ultima = COL_TIPO_TRABAJO + 1
const lista = vals => ({ condition: { type: 'ONE_OF_LIST', values: vals.map(v => ({ userEnteredValue: v })) }, showCustomUi: true, strict: false })
const requests = []
if (anchoActual < ultima) requests.push({ appendDimension: { sheetId: sid, dimension: 'COLUMNS', length: ultima - anchoActual } })
requests.push({ updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: COL_ENTREGA_CRUDO, endIndex: ultima }, properties: { pixelSize: 110 }, fields: 'pixelSize' } })
requests.push({ setDataValidation: { range: { sheetId: sid, startRowIndex: 1, startColumnIndex: COL_ENTREGA_CRUDO, endColumnIndex: COL_ENTREGA_CRUDO + 1 }, rule: lista(['Sí']) } })
requests.push({ setDataValidation: { range: { sheetId: sid, startRowIndex: 1, startColumnIndex: COL_TIPO_TRABAJO, endColumnIndex: COL_TIPO_TRABAJO + 1 }, rule: lista(TIPOS_TRABAJO) } })
requests.push({ setBasicFilter: { filter: { range: { sheetId: sid, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: ultima } } } })
await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests } })
await sheets.spreadsheets.values.update({ spreadsheetId: ID, range: `PRESUPUESTOS!${colLetra(COL_ENTREGA_CRUDO)}1:${colLetra(COL_TIPO_TRABAJO)}1`, valueInputOption: 'RAW', requestBody: { values: [[HEADER_ENTREGA_CRUDO, HEADER_TIPO_TRABAJO]] } })

const h2 = ((await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'PRESUPUESTOS!A1:ZZ1' })).data.values || [])[0] || []
if (h2[COL_ENTREGA_CRUDO] !== HEADER_ENTREGA_CRUDO || h2[COL_TIPO_TRABAJO] !== HEADER_TIPO_TRABAJO) { console.log('\n✗ Después de escribir, la fila 1 no quedó como esperaba. Revisar a mano.\n'); process.exit(1) }
console.log(`\n✓ Listo: ${colLetra(COL_ENTREGA_CRUDO)} ${HEADER_ENTREGA_CRUDO} · ${colLetra(COL_TIPO_TRABAJO)} ${HEADER_TIPO_TRABAJO} · filtro hasta ${colLetra(ultima - 1)} · ${h2.length} columnas con nombre.\n`)
try { await sheets.spreadsheets.values.append({ spreadsheetId: ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), 'juan (script)', 'presupuestos-columnas-crudo', 'PRESUPUESTOS', '', `columnas ${colLetra(COL_ENTREGA_CRUDO)}-${colLetra(COL_TIPO_TRABAJO)} entrega crudo / tipo de trabajo`]] } }) } catch (e) {}
