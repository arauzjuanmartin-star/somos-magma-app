/**
 * Solapa "MOVIMIENTOS_BANCO": cada renglón de los extractos del banco, ya cruzado con lo que hay en la app.
 *
 * Hasta ahora los pagos y los cobros se tildaban a mano y el saldo de cada cuenta se pisaba mirando el
 * home banking. Desde la app se sube el extracto y cada movimiento queda acá con qué es: una factura
 * cobrada, un gasto pagado, una cuota, un cargo del banco, o "para revisar" si no se reconoce solo.
 * Sirve para tres cosas: no cargar dos veces el mismo movimiento, ver de un vistazo lo que quedó sin
 * identificar, y tener por mes lo que cobra el banco de verdad (impuesto al cheque, comisiones, retenciones).
 *
 * Es una solapa nueva y aparte: no toca ninguna columna de las que ya existen.
 * Si la solapa ya existe, no hace nada.
 *
 * Uso:  node scripts/movimientos-banco-setup.mjs            (preview)
 *       node scripts/movimientos-banco-setup.mjs --escribir
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
const HOJA='MOVIMIENTOS_BANCO'
const ESCRIBIR = process.argv.includes('--escribir')
const FILAS = 3000

// [título, ancho, qué va]. El orden es el que lee y escribe pages/api/extracto-guardar.js (por nombre de título).
const COLS = [
  ['Cuenta',        150, 'la cuenta de la app (BBVA Somos Magma)'],
  ['Fecha',          95, 'el día del movimiento según el banco'],
  ['Mes',            80, 'año-mes, para filtrar y sumar (2026-09)'],
  ['Concepto',      230, 'como lo escribe el banco'],
  ['Detalle',       270, 'quién pagó o a quién se le pagó, si el banco lo dice'],
  ['Entró',         120, 'plata que entró'],
  ['Salió',         120, 'plata que salió'],
  ['Qué es',        330, 'la factura, el gasto o la cuota con que coincide; o el tipo de cargo del banco'],
  ['Estado',        185, 'Coincide · Marcado desde el extracto · Cargo del banco · Para revisar'],
  ['Tipo',          170, 'Cobro, Transferencia, Impuesto al cheque, SIRCREB, Comisiones…'],
  ['Hoja',          125, 'la solapa donde está lo que coincide (FACTURACION, GASTOS_FIJOS…)'],
  ['Ref',            95, 'la fila o el N° de trabajo en esa solapa'],
  ['Cargado por',   180, 'quién subió el extracto'],
  ['Cargado el',    130, 'cuándo'],
  ['Clave',         250, 'identifica el renglón: evita cargarlo dos veces. No tocar'],
]
const HEADERS = COLS.map(c=>c[0])
const L = i => String.fromCharCode(65+i)
const col = n => HEADERS.indexOf(n)

const meta = await sheets.spreadsheets.get({ spreadsheetId: ID, fields:'sheets(properties(title,sheetId))' })
const existe = meta.data.sheets.find(s=>s.properties.title===HOJA)

console.log(`\nSOLAPA "${HOJA}" — ${ESCRIBIR?'ESCRIBIENDO':'PREVIEW (nada se toca)'}`)
if (existe) { console.log('\nLa solapa ya existe. No hago nada.\n'); process.exit(0) }
console.log(`\nLa solapa NO existe. Se crea vacía, con ${COLS.length} columnas:\n`)
COLS.forEach((c,i)=>console.log(`  ${L(i)}  ${c[0].padEnd(13)} ${c[2]}`))
console.log('\nFormato: título negro con letra blanca, fila 1 congelada, filtro, fechas como fecha, montos en pesos,')
console.log('"Para revisar" resaltado en amarillo y los cargos del banco en gris.')
console.log('No toca ninguna otra solapa.')
if (!ESCRIBIR) { console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir para aplicar. ---\n'); process.exit(0) }

const add = await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody:{ requests:[
  { addSheet:{ properties:{ title:HOJA, gridProperties:{ rowCount:FILAS, columnCount:COLS.length, frozenRowCount:1 } } } } ] } })
const sid = add.data.replies[0].addSheet.properties.sheetId

await sheets.spreadsheets.values.update({ spreadsheetId: ID, range:`${HOJA}!A1`, valueInputOption:'USER_ENTERED', requestBody:{ values:[HEADERS] } })

const rango = (c, extra={}) => ({ sheetId:sid, startRowIndex:1, startColumnIndex:c, endColumnIndex:c+1, ...extra })
const estado = { sheetId:sid, startRowIndex:1, endRowIndex:FILAS, startColumnIndex:0, endColumnIndex:COLS.length }
await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody:{ requests:[
  { repeatCell:{ range:{sheetId:sid,startRowIndex:0,endRowIndex:1},
      cell:{ userEnteredFormat:{ backgroundColor:{red:.035,green:.035,blue:.035},
        textFormat:{foregroundColor:{red:1,green:1,blue:1},bold:true,fontSize:10}, verticalAlignment:'MIDDLE', wrapStrategy:'WRAP' } },
      fields:'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy)' } },
  { repeatCell:{ range:rango(col('Fecha')), cell:{ userEnteredFormat:{ numberFormat:{type:'DATE',pattern:'d/m/yyyy'} } }, fields:'userEnteredFormat.numberFormat' } },
  ...['Entró','Salió'].map(n=>({ repeatCell:{ range:rango(col(n)), cell:{ userEnteredFormat:{ numberFormat:{type:'CURRENCY',pattern:'"$"#,##0.00'} } }, fields:'userEnteredFormat.numberFormat' } })),
  // Texto puro donde un número o un signo se podría leer como otra cosa (el mes, la referencia, la clave)
  ...['Mes','Concepto','Detalle','Qué es','Ref','Clave'].map(n=>({ repeatCell:{ range:rango(col(n)), cell:{ userEnteredFormat:{ numberFormat:{type:'TEXT'} } }, fields:'userEnteredFormat.numberFormat' } })),
  ...COLS.map((c,i)=>({ updateDimensionProperties:{ range:{sheetId:sid,dimension:'COLUMNS',startIndex:i,endIndex:i+1}, properties:{pixelSize:c[1]}, fields:'pixelSize' } })),
  { setBasicFilter:{ filter:{ range:{ sheetId:sid, startRowIndex:0, endRowIndex:FILAS, startColumnIndex:0, endColumnIndex:COLS.length } } } },
  // Colores que significan algo: lo que hay que mirar en amarillo, lo que cobra el banco en gris
  { addConditionalFormatRule:{ index:0, rule:{ ranges:[estado], booleanRule:{ condition:{ type:'CUSTOM_FORMULA', values:[{ userEnteredValue:`=$${L(col('Estado'))}2="Para revisar"` }] }, format:{ backgroundColor:{red:.97,green:.94,blue:.86} } } } } },
  { addConditionalFormatRule:{ index:1, rule:{ ranges:[estado], booleanRule:{ condition:{ type:'CUSTOM_FORMULA', values:[{ userEnteredValue:`=$${L(col('Estado'))}2="Cargo del banco"` }] }, format:{ textFormat:{ foregroundColor:{red:.55,green:.53,blue:.5} } } } } } },
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
  requestBody:{ values:[[new Date().toISOString(),'juan (script)','movimientos-banco-setup',HOJA,'',`solapa nueva con ${COLS.length} columnas`]] } }) } catch(e){}
