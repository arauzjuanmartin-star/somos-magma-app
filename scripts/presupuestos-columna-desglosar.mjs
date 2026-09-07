/**
 * Columna "Desglosar" en PRESUPUESTOS — el tilde que decide si el PDF que ve el
 * cliente muestra el precio de cada servicio o sólo el total.
 *
 * VA AL FINAL (DJ) A PROPÓSITO, no pegada a los datos como manda la regla de oro #4:
 * de L a DI viven los 40 pares Pedido/Precio, que la app lee POR POSICIÓN
 * (lib/slots.js). Insertar una columna en el medio corre todos los slots y rompe
 * los presupuestos existentes. Además esto es un flag del PDF, no un dato que
 * Mariana filtre desde el sheet.
 *
 * Queda como casilla (checkbox) para que se pueda tildar a mano desde el sheet.
 *
 * Es idempotente: si la columna ya existe sólo repone la casilla y el filtro.
 *
 * Uso:  node scripts/presupuestos-columna-desglosar.mjs            (preview)
 *       node scripts/presupuestos-columna-desglosar.mjs --escribir
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
const ESCRIBIR = process.argv.includes('--escribir')
const HEADER = 'Desglosar'
const colLetra = n => { let s=''; n++; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=(n-m-1)/26 } return s }

const meta = await sheets.spreadsheets.get({ spreadsheetId: ID, ranges:['PRESUPUESTOS'],
  fields:'sheets(properties(title,sheetId,gridProperties),basicFilter,tables(tableId,name,range))' })
const hoja = meta.data.sheets.find(s=>s.properties.title==='PRESUPUESTOS')
const sheetId = hoja.properties.sheetId
const colsGrid = hoja.properties.gridProperties.columnCount
// PRESUPUESTOS no es un rango con filtro: es una TABLA nativa de Sheets (Tabla_5).
// El filtro va pegado a la tabla, así que se extiende la tabla — setBasicFilter sobre
// una tabla devuelve "Filter can either be applied to a table or a range, not both".
const tabla = (hoja.tables||[]).find(t => t.range.startColumnIndex === 0) || null

const r = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range:'PRESUPUESTOS!1:1' })
const H = r.data.values?.[0] || []
const rA = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range:'PRESUPUESTOS!A:A' })
const nDatos = (rA.data.values||[]).length - 1

const yaEsta = H.findIndex(h => String(h).trim().toLowerCase() === HEADER.toLowerCase())
const DESTINO = yaEsta !== -1 ? yaEsta : H.length
const L = colLetra(DESTINO)

console.log(`PRESUPUESTOS · ${nDatos} presupuestos · ${H.length} columnas (grilla: ${colsGrid})`)
console.log(`Última columna con header: ${colLetra(H.length-1)} = "${H[H.length-1]}"`)
console.log(yaEsta !== -1
  ? `\n"${HEADER}" YA EXISTE en ${L}. Se repone la casilla y el filtro, nada más.`
  : `\nSe agrega "${HEADER}" en la columna ${L} (después de "${H[H.length-1]}").`)
console.log(`  · casilla de verificación en ${L}2:${L}${Math.max(nDatos+1,2)} (vacío = sin desglosar, como hasta hoy)`)
console.log(tabla
  ? `  · la tabla "${tabla.name}" se extiende de ${colLetra(tabla.range.endColumnIndex-1)} a ${L} (así la columna entra en el filtro)`
  : `  · el filtro de la solapa se extiende hasta ${L} para que aparezca en el desplegable`)
console.log(`  · los ${nDatos} presupuestos existentes quedan SIN tildar: ningún PDF cambia solo`)

if (!ESCRIBIR) { console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir para aplicar. ---'); process.exit(0) }

// snapshot de control: la última columna de slots tiene que seguir donde estaba
const antesUltimoHeader = H[H.length-1]
const rCtrl = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range:'PRESUPUESTOS!A2:L2' })
const ctrlFila = rCtrl.data.values?.[0] || []

const reqs = []
// La grilla tiene que llegar hasta la columna nueva
if (colsGrid < DESTINO + 1) {
  reqs.push({ appendDimension:{ sheetId, dimension:'COLUMNS', length: DESTINO + 1 - colsGrid } })
}
// Header con el mismo formato que el resto de la fila 1
reqs.push({ copyPaste:{
  source:      {sheetId, startRowIndex:0, endRowIndex:1, startColumnIndex:0, endColumnIndex:1},
  destination: {sheetId, startRowIndex:0, endRowIndex:1, startColumnIndex:DESTINO, endColumnIndex:DESTINO+1},
  pasteType:'PASTE_FORMAT' } })
reqs.push({ updateDimensionProperties:{ range:{sheetId, dimension:'COLUMNS', startIndex:DESTINO, endIndex:DESTINO+1},
  properties:{pixelSize:95}, fields:'pixelSize' } })
if (tabla) {
  // Extender la tabla a la columna nueva. El filtro va con la tabla, y el tipo CHECKBOX
  // la deja tildable a mano desde el sheet.
  reqs.push({ updateTable:{
    table:{ tableId: tabla.tableId,
      range:{ ...tabla.range, endColumnIndex: DESTINO + 1 },
      columnProperties:[{ columnIndex: DESTINO, columnName: HEADER, columnType:'BOOLEAN' }] },
    fields:'range,columnProperties' } })
} else {
  // Casilla de verificación en las filas de datos (+200 de colchón para las que vengan)
  reqs.push({ setDataValidation:{
    range:{sheetId, startRowIndex:1, endRowIndex:Math.max(nDatos+201,2), startColumnIndex:DESTINO, endColumnIndex:DESTINO+1},
    rule:{ condition:{type:'BOOLEAN'}, strict:true } } })
  // El filtro tiene que abarcar la columna nueva, si no existe pero no se puede filtrar
  if (hoja.basicFilter) {
    const bf = JSON.parse(JSON.stringify(hoja.basicFilter))
    bf.range.endColumnIndex = Math.max(bf.range.endColumnIndex || 0, DESTINO + 1)
    delete bf.criteria; delete bf.filterSpecs
    reqs.push({ setBasicFilter:{ filter: bf } })
  }
}
await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody:{ requests: reqs } })

await sheets.spreadsheets.values.update({ spreadsheetId: ID, range:`PRESUPUESTOS!${L}1`,
  valueInputOption:'USER_ENTERED', requestBody:{ values: [[HEADER]] } })

// ── verificación: la columna quedó donde va y no se movió nada de lo anterior ──
const v = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range:'PRESUPUESTOS!1:1' })
const H2 = v.data.values?.[0] || []
const iD = H2.findIndex(h=>String(h).trim().toLowerCase()===HEADER.toLowerCase())
const vCtrl = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range:'PRESUPUESTOS!A2:L2' })
const ctrl2 = vCtrl.data.values?.[0] || []

console.log(`\n✓ "${HEADER}" en la columna ${colLetra(iD)} (esperado ${L})`)
const okSlots = H2[11] === 'Pedido 1' && H2[57] === 'Pedido 13' && H2[112] === 'Precio 40'
console.log(okSlots ? '✓ los slots siguen en su lugar (L=Pedido 1, BF=Pedido 13, DI=Precio 40)'
                    : `✗ SE CORRIERON LOS SLOTS: L=${H2[11]} BF=${H2[57]} DI=${H2[112]}`)
const okFila = JSON.stringify(ctrl2) === JSON.stringify(ctrlFila)
console.log(okFila ? '✓ fila de control intacta (A:L de la fila 2)' : `✗ DESALINEADO: antes ${JSON.stringify(ctrlFila)}`)
const faltan = H.filter(h=>h && !H2.includes(h))
console.log(faltan.length ? `✗ headers perdidos: ${faltan.join(', ')}` : `✓ no se perdió ningún header (último: "${antesUltimoHeader}" sigue presente)`)
if (iD !== DESTINO || !okSlots || !okFila || faltan.length) process.exit(1)

try { await sheets.spreadsheets.values.append({ spreadsheetId: ID, range:'LOG!A:F', valueInputOption:'USER_ENTERED',
  requestBody:{ values:[[new Date().toISOString(),'juan (script)','presupuestos-columna-desglosar','PRESUPUESTOS',L,`columna ${HEADER} en ${L}`]] } }) } catch(e){}
console.log('\nListo. Ahora el tilde "Mostrar precio por ítem" del generador de PDF queda guardado en el presupuesto.')
