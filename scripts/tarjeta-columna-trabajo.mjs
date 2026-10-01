/**
 * Los consumos de tarjeta pueden decir de qué trabajo fueron.
 *
 * Un gasto en efectivo ya se puede atar a su trabajo (GASTOS_FIJOS, columna "N° trabajo"). Lo que se paga
 * con tarjeta no: el auto que se alquiló para Coronel Suárez está en el resumen de BBVA de agosto como tres
 * consumos de Hertz en "Producción · Movilidad", sin decir para qué fueron, y el trabajo muestra una ganancia
 * $388.121 más alta que la real.
 *
 * Agrega la columna "N° trabajo" al final de MOVIMIENTOS_TARJETA (formato texto) y, con ATAR, pone el número
 * en los consumos que Juan confirmó. Cada consumo va con fila, comercio y monto: si la fila no coincide, frena.
 *
 * Es idempotente: si la columna ya existe no la duplica, y lo que ya está atado no se toca.
 *
 * Uso:  node scripts/tarjeta-columna-trabajo.mjs            (preview)
 *       node scripts/tarjeta-columna-trabajo.mjs --escribir
 */
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
  scopes:['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const HOJA='MOVIMIENTOS_TARJETA', COLUMNA='N° trabajo'
const ESCRIBIR = process.argv.includes('--escribir')
const colLetra = n => { let s=''; n++; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=(n-m-1)/26 } return s }
const f = x => '$'+x.toLocaleString('es-AR',{minimumFractionDigits:2, maximumFractionDigits:2})

// Juan, 01/10/2026: "sí, son esos consumos de Coronel Suárez" (#2033, CNH/ADN, rodaje del 11/8/2026)
const ATAR = [
  { fila:476, comercio:'HERTZ', monto:294230.78, trabajo:'2033' },
  { fila:482, comercio:'HERTZ', monto:7294.98,   trabajo:'2033' },
  { fila:495, comercio:'HERTZ', monto:86595.09,  trabajo:'2033' },
]

const meta = await sheets.spreadsheets.get({ spreadsheetId: ID, ranges:[HOJA], fields:'sheets(properties(title,sheetId,gridProperties),basicFilter,tables)' })
const hoja = meta.data.sheets.find(s=>s.properties.title===HOJA)
const sheetId = hoja.properties.sheetId, grid = hoja.properties.gridProperties
if ((hoja.tables||[]).length || hoja.basicFilter) { console.error('La solapa ahora tiene una tabla o un filtro: hay que agrandarlos también. Freno para no dejar la columna afuera.'); process.exit(1) }

const rows = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range:`${HOJA}!A:Z` })).data.values || []
const H = rows[0].map(h=>String(h).trim()), iCom = H.indexOf('Comercio'), iMon = H.indexOf('Monto'), iFecha = H.indexOf('Fecha')
let iCol = H.indexOf(COLUMNA)
const hayQueCrear = iCol < 0
if (hayQueCrear) iCol = H.length
const faltanColumnas = Math.max(0, iCol + 1 - grid.columnCount)

console.log(`\n${ESCRIBIR ? '✍  ESCRIBIENDO' : '👀 PREVIEW (no escribe nada)'} · ${HOJA} · ${rows.length-1} consumos\n`)
console.log(hayQueCrear ? `Columna nueva: ${colLetra(iCol)} "${COLUMNA}" (después de "${H[H.length-1]}"), formato texto` : `La columna "${COLUMNA}" ya existe en ${colLetra(iCol)}`)

const escrituras = []; let total = 0
for (const a of ATAR) {
  const r = rows[a.fila-1] || []
  const monto = parseFloat(String(r[iMon]||'').replace(/[^\d.-]/g,''))
  if (!String(r[iCom]||'').toUpperCase().includes(a.comercio) || Math.abs(monto - a.monto) > 0.01) { console.error(`\n✋ La fila ${a.fila} no es el consumo esperado (${a.comercio} ${f(a.monto)}): dice "${r[iCom]}" ${r[iMon]}. Freno sin escribir nada.`); process.exit(1) }
  const actual = String(r[iCol]||'').trim()
  total += monto
  console.log(`  fila ${a.fila} · ${r[iFecha]} · ${String(r[iCom]).padEnd(18)} ${f(monto).padStart(13)} → trabajo #${a.trabajo}${actual === a.trabajo ? ' (ya estaba)' : actual ? ` (decía "${actual}")` : ''}`)
  if (actual !== a.trabajo) escrituras.push({ range:`${HOJA}!${colLetra(iCol)}${a.fila}`, values:[[a.trabajo]] })
}
console.log(`  Total atado al #2033: ${f(total)}`)

if (!ESCRIBIR) { console.log('\nNo se escribió nada. Para aplicar: node scripts/tarjeta-columna-trabajo.mjs --escribir\n'); process.exit(0) }

if (hayQueCrear) {
  const requests = []
  if (faltanColumnas) requests.push({ appendDimension: { sheetId, dimension:'COLUMNS', length: faltanColumnas } })
  // Una columna nueva hereda el formato de la de al lado. El número de trabajo es un texto, no un monto ni una fecha.
  requests.push({ repeatCell: { range:{ sheetId, startColumnIndex:iCol, endColumnIndex:iCol+1 }, cell:{ userEnteredFormat:{ numberFormat:{ type:'TEXT' }, horizontalAlignment:'CENTER' } }, fields:'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment' } })
  requests.push({ updateDimensionProperties: { range:{ sheetId, dimension:'COLUMNS', startIndex:iCol, endIndex:iCol+1 }, properties:{ pixelSize:95 }, fields:'pixelSize' } })
  // El título, con el mismo formato que el de al lado
  requests.push({ copyPaste: { source:{ sheetId, startRowIndex:0, endRowIndex:1, startColumnIndex:iCol-1, endColumnIndex:iCol }, destination:{ sheetId, startRowIndex:0, endRowIndex:1, startColumnIndex:iCol, endColumnIndex:iCol+1 }, pasteType:'PASTE_FORMAT' } })
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody:{ requests } })
  await sheets.spreadsheets.values.update({ spreadsheetId: ID, range:`${HOJA}!${colLetra(iCol)}1`, valueInputOption:'RAW', requestBody:{ values:[[COLUMNA]] } })
}
if (escrituras.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: ID, requestBody:{ valueInputOption:'RAW', data: escrituras } })

try { await sheets.spreadsheets.values.append({ spreadsheetId: ID, range:'LOG!A:F', valueInputOption:'USER_ENTERED',
  requestBody:{ values:[[new Date().toISOString(), 'script', 'tarjeta-trabajo', HOJA, ATAR.map(a=>a.fila).join(', '), `${hayQueCrear ? `columna ${colLetra(iCol)} "${COLUMNA}" creada · ` : ''}${escrituras.length} consumos atados (Hertz → #2033, ${f(total)})`]] } }) } catch (e) {}

// Verificar: la columna está, los tres consumos tienen su número y nada más se movió
const ver = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range:`${HOJA}!A:Z` })).data.values || []
const okTitulo = String(ver[0][iCol]||'').trim() === COLUMNA
const okFilas = ATAR.every(a => String(ver[a.fila-1]?.[iCol]||'').trim() === a.trabajo && String(ver[a.fila-1]?.[iCom]||'') === String(rows[a.fila-1][iCom]||''))
const otras = ver.filter((r,i) => i && String(r[iCol]||'').trim()).length
console.log(`\n${okTitulo && okFilas ? '✅' : '⚠'} Título en ${colLetra(iCol)}: ${okTitulo ? 'ok' : 'NO'} · consumos atados: ${okFilas ? 'ok' : 'NO'} · filas con número de trabajo: ${otras} · consumos en la solapa: ${ver.length-1} (antes ${rows.length-1})\n`)
