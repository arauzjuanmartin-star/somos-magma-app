/**
 * GASTOS_FIJOS habla el mismo idioma que la solapa RUBROS.
 *
 * La lista única de rubros y subrubros ya existe (solapa RUBROS: "Producción · Rental de equipos",
 * "Oficina", "Compras varias · Súper / almacén"…), pero GASTOS_FIJOS solo tenía cinco categorías
 * contables (Sueldos, Operativos, Impuestos, Financieros, Otros). Lo que se pagaba con tarjeta se
 * clasificaba fino y lo que se pagaba en efectivo caía en "Operativos": no se podían sumar.
 *
 * Agrega tres columnas al final de GASTOS_FIJOS:
 *   Rubro       el de la solapa RUBROS
 *   Subrubro    el de la solapa RUBROS (vacío si el rubro no tiene)
 *   N° trabajo  si el gasto fue para un trabajo (el alquiler de equipos de un rodaje), su número
 * "Categoria" se queda donde está: la siguen usando el detalle por rubro contable y los números de Mariana.
 *
 * Es idempotente: si las columnas ya existen no las duplica.
 *
 * Uso:  node scripts/gastos-columnas-rubro.mjs            (preview)
 *       node scripts/gastos-columnas-rubro.mjs --escribir
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
const HOJA='GASTOS_FIJOS'
const ESCRIBIR = process.argv.includes('--escribir')
const NUEVAS = [{nombre:'Rubro', ancho:190}, {nombre:'Subrubro', ancho:200}, {nombre:'N° trabajo', ancho:95}]
const colLetra = n => { let s=''; n++; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=(n-m-1)/26 } return s }

const meta = await sheets.spreadsheets.get({ spreadsheetId: ID, ranges:[HOJA], fields:'sheets(properties(title,sheetId,gridProperties),basicFilter,tables)' })
const hoja = meta.data.sheets.find(s=>s.properties.title===HOJA)
const sheetId = hoja.properties.sheetId, grid = hoja.properties.gridProperties
if ((hoja.tables||[]).length || hoja.basicFilter) { console.error('La solapa ahora tiene una tabla o un filtro: hay que agrandarlos también. Freno para no dejar las columnas afuera.'); process.exit(1) }

const r = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range:`${HOJA}!A:AZ` })
const filas = r.data.values||[], H = (filas[0]||[]).map(h=>String(h).trim()), nDatos = filas.length-1
const faltan = NUEVAS.filter(c=>!H.includes(c.nombre))
const queda = [...H, ...faltan.map(c=>c.nombre)]
console.log(`${HOJA} · ${nDatos} filas con datos · ${H.length} columnas con título · la grilla tiene ${grid.columnCount}`)
console.log(`AHORA (últimas): ${H.slice(-4).map((h,i)=>`${colLetra(H.length-4+i)}:${h}`).join(' · ')}`)
console.log(`QUEDA (últimas): ${queda.slice(-4-faltan.length).map((h,i)=>`${colLetra(queda.length-4-faltan.length+i)}:${h}`).join(' · ')}`)
console.log(faltan.length ? `\nSe agregan ${faltan.length}: ${faltan.map(c=>`"${c.nombre}" en ${colLetra(queda.indexOf(c.nombre))}`).join(', ')}. Quedan vacías en las ${nDatos} filas que ya están.` : '\nLas tres columnas ya existen. No hago nada.')
console.log('No se mueve ni se borra ninguna columna ni ninguna fila.')
if (!ESCRIBIR) { console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir para aplicar. ---'); process.exit(0) }
if (!faltan.length) process.exit(0)

const iC = H.indexOf('Concepto'), iM = H.indexOf('Monto')
const ctrl = [1, Math.floor(filas.length/2), filas.length-1].map(i=>({i, c:filas[i][iC], m:filas[i][iM]}))

const necesita = queda.length - grid.columnCount
if (necesita>0) await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody:{ requests:[{ appendDimension:{ sheetId, dimension:'COLUMNS', length:necesita } }] } })
const desde = queda.indexOf(faltan[0].nombre)
await sheets.spreadsheets.values.update({ spreadsheetId: ID, range:`${HOJA}!${colLetra(desde)}1:${colLetra(desde+faltan.length-1)}1`, valueInputOption:'USER_ENTERED', requestBody:{ values:[faltan.map(c=>c.nombre)] } })
await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody:{ requests:[
  ...faltan.map(c=>{ const idx=queda.indexOf(c.nombre); return { copyPaste:{
    source:{sheetId, startRowIndex:0, endRowIndex:1, startColumnIndex:H.length-1, endColumnIndex:H.length},
    destination:{sheetId, startRowIndex:0, endRowIndex:1, startColumnIndex:idx, endColumnIndex:idx+1}, pasteType:'PASTE_FORMAT' } } }),
  ...faltan.map(c=>{ const idx=queda.indexOf(c.nombre); return { updateDimensionProperties:{ range:{sheetId, dimension:'COLUMNS', startIndex:idx, endIndex:idx+1}, properties:{pixelSize:c.ancho}, fields:'pixelSize' } } }),
  // Las columnas nuevas heredan el formato de la de al lado (Cotización, en pesos): un N° de trabajo 2355 se veía "$2,355.00".
  // Son texto.
  ...faltan.map(c=>{ const idx=queda.indexOf(c.nombre); return { repeatCell:{ range:{sheetId, startRowIndex:1, startColumnIndex:idx, endColumnIndex:idx+1}, cell:{userEnteredFormat:{numberFormat:{type:'TEXT'}}}, fields:'userEnteredFormat.numberFormat' } } }),
] } })

const v = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range:`${HOJA}!A:AZ` })
const F2 = v.data.values||[], H2 = (F2[0]||[]).map(h=>String(h).trim())
let ok = true
for (const c of NUEVAS) { const i=H2.indexOf(c.nombre); console.log(i===-1?`✗ falta "${c.nombre}"`:`✓ "${c.nombre}" en la columna ${colLetra(i)}`); if(i===-1) ok=false }
const corridos = H.filter((h,i)=>h && H2[i]!==h)
console.log(corridos.length ? `✗ títulos que cambiaron de columna: ${corridos.join(', ')}` : '✓ ninguna columna cambió de lugar'); if(corridos.length) ok=false
for (const c of ctrl) { const f=F2[c.i]||[]; const igual=f[iC]===c.c&&f[iM]===c.m; console.log(igual?`✓ fila ${c.i+1} intacta (${c.c} · ${c.m})`:`✗ fila ${c.i+1} cambió`); if(!igual) ok=false }
console.log(F2.length===filas.length?`✓ misma cantidad de filas (${F2.length-1})`:`✗ cambió la cantidad de filas`); if(F2.length!==filas.length) ok=false
if (!ok) process.exit(1)
try { await sheets.spreadsheets.values.append({ spreadsheetId: ID, range:'LOG!A:F', valueInputOption:'USER_ENTERED',
  requestBody:{ values:[[new Date().toISOString(),'juan (script)','gastos-columnas-rubro',HOJA,faltan.map(c=>colLetra(queda.indexOf(c.nombre))).join(','),`columnas ${faltan.map(c=>c.nombre).join(', ')}`]] } }) } catch(e){}
