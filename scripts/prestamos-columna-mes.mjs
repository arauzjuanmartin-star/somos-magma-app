/**
 * Columna "Mes" en la solapa PRESTAMOS, derivada de Vencimiento.
 * Formato "2026-08 ago": ordena cronológico y se lee en castellano.
 * Va pegada a los datos que importan (entre "Cuotas total" y "Vencimiento")
 * porque Mariana trabaja en el sheet y filtra desde ahí, no desde la app.
 *
 * Es idempotente: si la columna ya existe la deja donde va y reescribe las
 * fórmulas de todas las filas con datos. Corrélo cada vez que cargues cuotas
 * nuevas a mano y quieran quedar con el mes.
 *
 * Uso:  node scripts/prestamos-columna-mes.mjs            (preview)
 *       node scripts/prestamos-columna-mes.mjs --escribir
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
const DESTINO = 3          // índice 3 = columna D, justo antes de Vencimiento
const colLetra = n => { let s=''; n++; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=(n-m-1)/26 } return s }

const meta = await sheets.spreadsheets.get({ spreadsheetId: ID, ranges:['PRESTAMOS'],
  fields:'sheets(properties(title,sheetId,gridProperties),basicFilter)' })
const hoja = meta.data.sheets.find(s=>s.properties.title==='PRESTAMOS')
const sheetId = hoja.properties.sheetId

const r = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range:'PRESTAMOS!A:Z' })
const filas = r.data.values||[], H = filas[0]||[], nDatos = filas.length-1
const iMes = H.findIndex(h=>String(h).trim().toLowerCase()==='mes')
const iVenc = H.findIndex(h=>String(h).trim().toLowerCase()==='vencimiento')
if (iVenc===-1) { console.error('No encuentro la columna "Vencimiento". Freno.'); process.exit(1) }

console.log(`PRESTAMOS · ${nDatos} cuotas · ${H.length} columnas`)
console.log(`AHORA:  ${H.map((h,i)=>`${colLetra(i)}:${h}`).join(' · ')}`)

// dónde queda Vencimiento después de mover Mes a D
const iVencFinal = iMes===-1 || iMes>DESTINO ? (iVenc>=DESTINO ? iVenc+ (iMes===-1?1:0) : iVenc) : iVenc
const orden = [...H]
if (iMes!==-1) orden.splice(iMes,1); else orden.splice(0,0)
orden.splice(DESTINO,0,'Mes')
console.log(`QUEDA:  ${orden.map((h,i)=>`${colLetra(i)}:${h}`).join(' · ')}`)
const LM = colLetra(DESTINO), LV = colLetra(orden.findIndex(h=>String(h).trim().toLowerCase()==='vencimiento'))
console.log(`\nColumna ${LM} = "Mes", fórmula por fila desde ${LV} (Vencimiento)`)
console.log(`Ejemplo: ${LM}2 = =IF($${LV}2="","",TEXT($${LV}2,"YYYY-MM")&" "&TEXT($${LV}2,"mmm"))`)

if (!ESCRIBIR) { console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir para aplicar. ---'); process.exit(0) }

// snapshot de control: una fila del medio, para verificar que nada se desalineó
const ctrl = filas[Math.floor(filas.length/2)], ctrlNom = ctrl[0], ctrlVenc = ctrl[iVenc]

const reqs = []
if (iMes===-1) {
  reqs.push({ insertDimension:{ range:{sheetId, dimension:'COLUMNS', startIndex:DESTINO, endIndex:DESTINO+1}, inheritFromBefore:true } })
} else if (iMes!==DESTINO) {
  reqs.push({ moveDimension:{ source:{sheetId, dimension:'COLUMNS', startIndex:iMes, endIndex:iMes+1}, destinationIndex:DESTINO } })
}
// el header con el mismo formato que el resto de la fila 1, y ancho para que se lea entero
reqs.push({ copyPaste:{
  source:      {sheetId, startRowIndex:0, endRowIndex:1, startColumnIndex:0, endColumnIndex:1},
  destination: {sheetId, startRowIndex:0, endRowIndex:1, startColumnIndex:DESTINO, endColumnIndex:DESTINO+1},
  pasteType:'PASTE_FORMAT' } })
reqs.push({ updateDimensionProperties:{ range:{sheetId, dimension:'COLUMNS', startIndex:DESTINO, endIndex:DESTINO+1},
  properties:{pixelSize:110}, fields:'pixelSize' } })
// el filtro tiene que abarcar la columna nueva, si no no aparece en el desplegable
if (hoja.basicFilter) {
  const bf = JSON.parse(JSON.stringify(hoja.basicFilter))
  bf.range.endColumnIndex = Math.max(bf.range.endColumnIndex, orden.length)
  delete bf.criteria; delete bf.filterSpecs   // criterios viejos apuntan a columnas que se corrieron
  reqs.push({ setBasicFilter:{ filter: bf } })
}
await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody:{ requests: reqs } })

// Fórmula por fila (no ARRAYFORMULA): si un script appendea una fila, escribe vacío
// en esta celda y listo — una ARRAYFORMULA se rompería entera con #REF!
const vals = [['Mes'], ...Array.from({length:nDatos},(_,k)=>[
  `=IF($${LV}${k+2}="","",TEXT($${LV}${k+2},"YYYY-MM")&" "&TEXT($${LV}${k+2},"mmm"))`])]
await sheets.spreadsheets.values.update({ spreadsheetId: ID, range:`PRESTAMOS!${LM}1:${LM}${nDatos+1}`,
  valueInputOption:'USER_ENTERED', requestBody:{ values: vals } })

// ── verificación: headers en orden, datos alineados, meses calculados ──
const v = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range:'PRESTAMOS!A:Z' })
const F2 = v.data.values||[], H2 = F2[0]||[]
const iM2 = H2.findIndex(h=>String(h).trim().toLowerCase()==='mes')
const iV2 = H2.findIndex(h=>String(h).trim().toLowerCase()==='vencimiento')
const conMes = F2.slice(1).filter(f=>f[iM2]).length
const ctrl2 = F2[Math.floor(F2.length/2)]
console.log(`\n✓ "Mes" en la columna ${colLetra(iM2)} (esperado ${LM})`)
console.log(`✓ ${conMes}/${nDatos} cuotas con mes`)
console.log(`✓ fila de control: "${ctrl2[0]}" venc ${ctrl2[iV2]} → ${ctrl2[iM2]}`)
const okAlin = ctrl2[0]===ctrlNom && ctrl2[iV2]===ctrlVenc
console.log(okAlin ? '✓ datos alineados (nombre y vencimiento intactos)' : `✗ DESALINEADO: antes "${ctrlNom}"/${ctrlVenc}`)
const faltan = H.filter(h=>h && !H2.includes(h))
console.log(faltan.length ? `✗ headers perdidos: ${faltan.join(', ')}` : '✓ no se perdió ningún header')
console.log(`\nHEADERS: ${H2.map((h,i)=>`${colLetra(i)}:${h}`).join(' · ')}`)
if(!okAlin || faltan.length || conMes<nDatos) process.exit(1)

try { await sheets.spreadsheets.values.append({ spreadsheetId: ID, range:'LOG!A:F', valueInputOption:'USER_ENTERED',
  requestBody:{ values:[[new Date().toISOString(),'juan (script)','prestamos-columna-mes','PRESTAMOS',LM,`columna Mes en ${LM}, ${conMes} cuotas`]] } }) } catch(e){}
