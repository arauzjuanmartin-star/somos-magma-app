/**
 * Solapa "OC_PEDIDOS": el registro de los pedidos de orden de compra.
 *
 * Hay clientes (Universidad Austral) que no reciben la factura por mail: Magma les manda la
 * lista de trabajos hechos, ellos los cargan en su sistema de cobro (ahí nace la orden de
 * compra) y recién entonces ese sistema habilita subir la factura. Cada vez que desde la app
 * se manda ese mail, queda acá una fila por trabajo: qué se pidió, cuándo, a quién y quién lo
 * mandó. Así se ve qué trabajos están esperando la orden de compra y desde cuándo.
 *
 * Es una solapa nueva y aparte: no toca ninguna columna de las que ya existen.
 * Si la solapa ya existe, no hace nada.
 *
 * Uso:  node scripts/oc-pedidos-setup.mjs            (preview)
 *       node scripts/oc-pedidos-setup.mjs --escribir
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
const HOJA='OC_PEDIDOS'
const ESCRIBIR = process.argv.includes('--escribir')

// [título, ancho, qué va]
const COLS = [
  ['Fecha pedido',     110, 'el día que salió el mail'],
  ['Agencia',          130, 'a quién se le pidió (Austral)'],
  ['N° Presupuesto',   110, 'el trabajo'],
  ['Proyecto',         330, 'nombre del trabajo'],
  ['Cliente',          150, 'Austral Derecho, Austral EDG…'],
  ['Fecha evento',     110, 'cuándo fue'],
  ['Monto sin IVA',    125, 'lo que hay que facturar'],
  ['OC',               150, '"General" o "Aparte (Comunicación)"'],
  ['Enviado a',        230, 'el mail de quien lo recibe'],
  ['Enviado por',      190, 'quién lo mandó desde la app'],
  ['N° OC',            120, 'se completa cuando lo cargan en su sistema'],
  ['Notas',            260, ''],
]
const HEADERS = COLS.map(c=>c[0])
const L = i => String.fromCharCode(65+i)

const meta = await sheets.spreadsheets.get({ spreadsheetId: ID, fields:'sheets(properties(title,sheetId))' })
const existe = meta.data.sheets.find(s=>s.properties.title===HOJA)

console.log(`\nSOLAPA "${HOJA}" — ${ESCRIBIR?'ESCRIBIENDO':'PREVIEW (nada se toca)'}`)
if (existe) { console.log('\nLa solapa ya existe. No hago nada.\n'); process.exit(0) }
console.log(`\nLa solapa NO existe. Se crea vacía, con ${COLS.length} columnas:\n`)
COLS.forEach((c,i)=>console.log(`  ${L(i)}  ${c[0].padEnd(16)} ${c[2]}`))
console.log('\nFormato: título negro con letra blanca, fila 1 congelada, filtro, fechas como fecha y el monto en pesos.')
console.log('No toca ninguna otra solapa.')
if (!ESCRIBIR) { console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir para aplicar. ---\n'); process.exit(0) }

const add = await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody:{ requests:[
  { addSheet:{ properties:{ title:HOJA, gridProperties:{ rowCount:500, columnCount:COLS.length, frozenRowCount:1 } } } } ] } })
const sid = add.data.replies[0].addSheet.properties.sheetId

await sheets.spreadsheets.values.update({ spreadsheetId: ID, range:`${HOJA}!A1`, valueInputOption:'USER_ENTERED', requestBody:{ values:[HEADERS] } })

await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody:{ requests:[
  { repeatCell:{ range:{sheetId:sid,startRowIndex:0,endRowIndex:1},
      cell:{ userEnteredFormat:{ backgroundColor:{red:.035,green:.035,blue:.035},
        textFormat:{foregroundColor:{red:1,green:1,blue:1},bold:true,fontSize:10}, verticalAlignment:'MIDDLE', wrapStrategy:'WRAP' } },
      fields:'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy)' } },
  ...[0,5].map(c=>({ repeatCell:{ range:{sheetId:sid,startRowIndex:1,startColumnIndex:c,endColumnIndex:c+1},
      cell:{ userEnteredFormat:{ numberFormat:{type:'DATE',pattern:'d/m/yyyy'} } }, fields:'userEnteredFormat.numberFormat' } })),
  { repeatCell:{ range:{sheetId:sid,startRowIndex:1,startColumnIndex:6,endColumnIndex:7},
      cell:{ userEnteredFormat:{ numberFormat:{type:'CURRENCY',pattern:'"$"#,##0'} } }, fields:'userEnteredFormat.numberFormat' } },
  ...COLS.map((c,i)=>({ updateDimensionProperties:{ range:{sheetId:sid,dimension:'COLUMNS',startIndex:i,endIndex:i+1}, properties:{pixelSize:c[1]}, fields:'pixelSize' } })),
  { setBasicFilter:{ filter:{ range:{ sheetId:sid, startRowIndex:0, endRowIndex:500, startColumnIndex:0, endColumnIndex:COLS.length } } } },
] } })

// ── verificación ──
const v = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range:`${HOJA}!1:1` })
const H2 = v.data.values?.[0] || []
const ok = HEADERS.every((h,i)=>H2[i]===h)
console.log(ok ? `\n✓ Solapa creada con sus ${H2.length} títulos en orden` : `\n✗ Los títulos no quedaron como se esperaba: ${H2.join(' | ')}`)
const m2 = await sheets.spreadsheets.get({ spreadsheetId: ID, fields:'sheets(properties(title))' })
console.log(`✓ El archivo tiene ${m2.data.sheets.length} solapas (antes ${meta.data.sheets.length})`)
if (!ok) process.exit(1)
try { await sheets.spreadsheets.values.append({ spreadsheetId: ID, range:'LOG!A:F', valueInputOption:'USER_ENTERED',
  requestBody:{ values:[[new Date().toISOString(),'juan (script)','oc-pedidos-setup',HOJA,'',`solapa nueva con ${COLS.length} columnas`]] } }) } catch(e){}
