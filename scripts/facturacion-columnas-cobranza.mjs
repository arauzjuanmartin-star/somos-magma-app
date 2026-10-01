/**
 * Dos columnas nuevas en FACTURACION para seguir la cobranza:
 *   "Prometió pagar"  → la fecha que dio el cliente cuando se le reclamó
 *   "Nota cobranza"   → con quién se habló y qué dijo
 *
 * Van al final, pegadas a las otras de cobranza (Monto cobrado, Fecha enviada, Período).
 * No se insertan al lado de "Vencimiento" a propósito: la diaria (lib/brief.mjs) y la carga
 * de facturas (pages/api/factura-nueva.js) leen y escriben FACTURACION por posición, y una
 * columna en el medio correría todo lo que está a la derecha.
 *
 * Es idempotente: si las columnas ya existen no las duplica, solo se asegura de que el
 * filtro de la solapa las abarque.
 *
 * Uso:  node scripts/facturacion-columnas-cobranza.mjs            (preview)
 *       node scripts/facturacion-columnas-cobranza.mjs --escribir
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
const HOJA='FACTURACION'
const ESCRIBIR = process.argv.includes('--escribir')
const NUEVAS = [{nombre:'Prometió pagar', ancho:125, fecha:true}, {nombre:'Nota cobranza', ancho:280}]
const colLetra = n => { let s=''; n++; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=(n-m-1)/26 } return s }

const meta = await sheets.spreadsheets.get({ spreadsheetId: ID, ranges:[HOJA],
  fields:'sheets(properties(title,sheetId,gridProperties),basicFilter,tables)' })
const hoja = meta.data.sheets.find(s=>s.properties.title===HOJA)
const sheetId = hoja.properties.sheetId, grid = hoja.properties.gridProperties
// FACTURACION es una "tabla" de Google Sheets (Tabla_7): el filtro es de la tabla, no de un rango suelto.
// Para que las columnas nuevas entren al filtro hay que agrandar la tabla; setBasicFilter ahí da error.
const tabla = (hoja.tables||[]).find(t=>t.range.startRowIndex===0 && t.range.startColumnIndex===0)

const r = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range:`${HOJA}!A:AZ` })
const filas = r.data.values||[], H = (filas[0]||[]).map(h=>String(h).trim()), nDatos = filas.length-1

console.log(`${HOJA} · ${nDatos} filas con datos · ${H.length} columnas con título · la grilla tiene ${grid.columnCount}`)
console.log(`AHORA (últimas): ${H.slice(-5).map((h,i)=>`${colLetra(H.length-5+i)}:${h}`).join(' · ')}`)

const faltan = NUEVAS.filter(c=>!H.includes(c.nombre))
const queda = [...H, ...faltan.map(c=>c.nombre)]
console.log(`QUEDA (últimas): ${queda.slice(-5-faltan.length).map((h,i)=>`${colLetra(queda.length-5-faltan.length+i)}:${h}`).join(' · ')}`)
if (!faltan.length) console.log('\nLas dos columnas ya existen. Solo reviso que el filtro las abarque.')
else console.log(`\nSe agregan ${faltan.length}: ${faltan.map(c=>`"${c.nombre}" en ${colLetra(queda.indexOf(c.nombre))}`).join(' y ')}. Quedan vacías: las llena la app cuando alguien anota una promesa.`)
const bfAhora = tabla?.range || hoja.basicFilter?.range
console.log(`Filtro de la solapa${tabla?` (tabla "${tabla.name}")`:''}: ${bfAhora?`columnas A:${colLetra(bfAhora.endColumnIndex-1)} → A:${colLetra(Math.max(bfAhora.endColumnIndex,queda.length)-1)}`:'no tiene'}`)
console.log('No se mueve ni se borra ninguna columna ni ninguna fila.')

if (!ESCRIBIR) { console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir para aplicar. ---'); process.exit(0) }

// control: una fila del medio y la última, para verificar que nada se movió
const iNro = H.indexOf('N° Presupuesto'), iTot = H.indexOf('Precio FINAL')
const ctrl = [Math.floor(filas.length/2), filas.length-1].map(i=>({i, nro:filas[i][iNro], tot:filas[i][iTot]}))

// Paso 1: lugar en la grilla para las columnas que faltan.
const necesita = queda.length - grid.columnCount
if (necesita>0) await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody:{ requests:[{ appendDimension:{ sheetId, dimension:'COLUMNS', length:necesita } }] } })

// Paso 2: los títulos, ANTES de agrandar la tabla. Si la tabla toma una columna sin título
// le inventa uno ("Columna 1"), que es lo que le pasó al N° de PRESUPUESTOS.
if (faltan.length) {
  const desde = queda.indexOf(faltan[0].nombre)
  await sheets.spreadsheets.values.update({ spreadsheetId: ID, range:`${HOJA}!${colLetra(desde)}1:${colLetra(desde+faltan.length-1)}1`,
    valueInputOption:'USER_ENTERED', requestBody:{ values:[faltan.map(c=>c.nombre)] } })
}

// Paso 3: ancho, formato de fecha y el filtro.
const reqs = []
for (const c of NUEVAS) {
  const idx = queda.indexOf(c.nombre)
  reqs.push({ updateDimensionProperties:{ range:{sheetId, dimension:'COLUMNS', startIndex:idx, endIndex:idx+1},
    properties:{pixelSize:c.ancho}, fields:'pixelSize' } })
  // la promesa es una fecha: que se vea como fecha y no como número
  if (c.fecha) reqs.push({ repeatCell:{ range:{sheetId, startRowIndex:1, startColumnIndex:idx, endColumnIndex:idx+1},
    cell:{ userEnteredFormat:{ numberFormat:{ type:'DATE', pattern:'d/m/yyyy' } } }, fields:'userEnteredFormat.numberFormat' } })
}
// El filtro tiene que abarcar las columnas nuevas, si no no aparecen en el desplegable.
// No se corre ninguna columna, así que los criterios que estén puestos siguen valiendo.
if (tabla) {
  if (tabla.range.endColumnIndex < queda.length)
    reqs.push({ updateTable:{ table:{ tableId:tabla.tableId, range:{ ...tabla.range, endColumnIndex:queda.length } }, fields:'range' } })
} else if (hoja.basicFilter && hoja.basicFilter.range.endColumnIndex < queda.length) {
  const bf = JSON.parse(JSON.stringify(hoja.basicFilter))
  bf.range.endColumnIndex = queda.length
  // sin tabla, el título toma el formato del de al lado
  for (const c of faltan) { const idx=queda.indexOf(c.nombre); reqs.unshift({ copyPaste:{
    source:{sheetId, startRowIndex:0, endRowIndex:1, startColumnIndex:H.length-1, endColumnIndex:H.length},
    destination:{sheetId, startRowIndex:0, endRowIndex:1, startColumnIndex:idx, endColumnIndex:idx+1}, pasteType:'PASTE_FORMAT' } }) }
  reqs.push({ setBasicFilter:{ filter: bf } })
}
if (reqs.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody:{ requests: reqs } })

// ── verificación: títulos en su lugar, ninguno perdido, datos alineados, filtro extendido ──
const v = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range:`${HOJA}!A:AZ` })
const F2 = v.data.values||[], H2 = (F2[0]||[]).map(h=>String(h).trim())
const meta2 = await sheets.spreadsheets.get({ spreadsheetId: ID, ranges:[HOJA], fields:'sheets(properties(title),basicFilter,tables)' })
const hoja2 = meta2.data.sheets.find(s=>s.properties.title===HOJA)
const bf2 = (hoja2.tables||[]).find(t=>t.tableId===tabla?.tableId)?.range || hoja2.basicFilter?.range
let ok = true
for (const c of NUEVAS) { const i=H2.indexOf(c.nombre); console.log(i===-1?`✗ falta "${c.nombre}"`:`✓ "${c.nombre}" en la columna ${colLetra(i)}`); if(i===-1) ok=false }
const perdidos = H.filter(h=>h && !H2.includes(h)), corridos = H.filter((h,i)=>h && H2[i]!==h)
console.log(perdidos.length ? `✗ títulos perdidos: ${perdidos.join(', ')}` : '✓ no se perdió ningún título'); if(perdidos.length) ok=false
console.log(corridos.length ? `✗ títulos que cambiaron de columna: ${corridos.join(', ')}` : '✓ ninguna columna cambió de lugar'); if(corridos.length) ok=false
for (const c of ctrl) { const f=F2[c.i]||[]; const igual=f[iNro]===c.nro&&f[iTot]===c.tot
  console.log(igual?`✓ fila ${c.i+1} intacta (#${c.nro} · ${c.tot})`:`✗ fila ${c.i+1} cambió: antes #${c.nro} ${c.tot}, ahora #${f[iNro]} ${f[iTot]}`); if(!igual) ok=false }
console.log(F2.length===filas.length?`✓ misma cantidad de filas (${F2.length-1})`:`✗ cambió la cantidad de filas: ${filas.length-1} → ${F2.length-1}`); if(F2.length!==filas.length) ok=false
if (bf2) { const cubre=bf2.endColumnIndex>=H2.length; console.log(cubre?`✓ el filtro llega hasta ${colLetra(bf2.endColumnIndex-1)}`:`✗ el filtro llega hasta ${colLetra(bf2.endColumnIndex-1)} y hay títulos hasta ${colLetra(H2.length-1)}`); if(!cubre) ok=false }
if (!ok) process.exit(1)

try { await sheets.spreadsheets.values.append({ spreadsheetId: ID, range:'LOG!A:F', valueInputOption:'USER_ENTERED',
  requestBody:{ values:[[new Date().toISOString(),'juan (script)','facturacion-columnas-cobranza',HOJA,faltan.map(c=>colLetra(queda.indexOf(c.nombre))).join(','),`columnas ${faltan.map(c=>c.nombre).join(' y ')||'(ya existían)'} · filtro hasta ${bf2?colLetra(bf2.endColumnIndex-1):'-'}`]] } }) } catch(e){}
