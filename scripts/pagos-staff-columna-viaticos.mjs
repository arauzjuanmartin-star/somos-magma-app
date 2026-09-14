/**
 * Columna "Viáticos" en la solapa Pagos_Staff, pegada a "Monto Adeudado".
 *
 * Para qué: la de admin carga los viáticos de cada trabajo desde Pagos Staff en la app
 * (un campo en cada línea: si lo completa se suma al pago, si no queda en 0). Antes había
 * que abrir el proyecto con el lápiz y agregar una línea de staff "Viáticos" a mano.
 *
 * Va al lado del monto (H) y no colgada al final, porque el sheet también se lee a mano.
 * Las 151 fórmulas de MES A MES que apuntan a Pagos_Staff!$H:$H / $O:$O las corre Sheets
 * solo al insertar (son referencias directas, no texto). Los scripts que leían por
 * posición ya pasaron a leer por nombre de header en el mismo commit.
 *
 * Es idempotente: si la columna ya existe no hace nada (y avisa si está en otro lugar).
 *
 * Uso:  node scripts/pagos-staff-columna-viaticos.mjs            (preview)
 *       node scripts/pagos-staff-columna-viaticos.mjs --escribir
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
const ID = env.SHEET_ID || '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')
const TAB = 'Pagos_Staff'
const NOMBRE = 'Viáticos'
const colLetra = n => { let s=''; n++; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=(n-m-1)/26 } return s }
const norm = v => String(v||'').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')

const meta = await sheets.spreadsheets.get({ spreadsheetId: ID, ranges:[TAB],
  fields:'sheets(properties(title,sheetId,gridProperties),basicFilter)' })
const hoja = meta.data.sheets[0]
if (!hoja) { console.error(`No encuentro la solapa ${TAB}. Freno.`); process.exit(1) }
const sheetId = hoja.properties.sheetId
const rowCount = hoja.properties.gridProperties.rowCount

const r = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range:`${TAB}!A:Z` })
const filas = r.data.values||[], H = filas[0]||[], nDatos = filas.length-1
const iAde = H.findIndex(h=>norm(h)==='monto adeudado')
const iPag = H.findIndex(h=>norm(h)==='monto pagado')
const iVia = H.findIndex(h=>norm(h)==='viaticos')
if (iAde===-1 || iPag===-1) { console.error('No encuentro "Monto Adeudado" / "Monto Pagado". Freno.'); process.exit(1) }
const DESTINO = iAde+1   // justo después de Monto Adeudado, antes de Monto Pagado

console.log(`${TAB} · ${nDatos} filas · ${H.length} columnas`)
console.log(`AHORA:  ${H.map((h,i)=>`${colLetra(i)}:${h}`).join(' · ')}`)

if (iVia!==-1) {
  console.log(`\nLa columna "${NOMBRE}" ya existe en ${colLetra(iVia)}${iVia===DESTINO?' (donde va).':` — esperaba ${colLetra(DESTINO)}. No la muevo sola: avisale a Juan.`}`)
  process.exit(0)
}

const orden = [...H]; orden.splice(DESTINO,0,NOMBRE)
console.log(`QUEDA:  ${orden.map((h,i)=>`${colLetra(i)}:${h}`).join(' · ')}`)
console.log(`\nSe inserta ${colLetra(DESTINO)} = "${NOMBRE}" (vacía: la app la completa; vacío = 0).`)
console.log(`Corren un lugar: ${H.slice(DESTINO).map((h,i)=>`${h} ${colLetra(DESTINO+i)}→${colLetra(DESTINO+i+1)}`).join(' · ')}`)
console.log(`Las fórmulas de MES A MES (Pagos_Staff!$H:$H, $O:$O) las ajusta Sheets solo.`)

// control: una fila del medio, para verificar que nada se desalineó
const ctrlIdx = Math.max(1, Math.floor(filas.length/2))
const ctrl = filas[ctrlIdx]||[]
const snap = { fila: ctrlIdx+1, freelancer: ctrl[1], adeudado: ctrl[iAde], pagado: ctrl[iPag], ultima: ctrl[H.length-1] }
console.log(`\nFila de control ${snap.fila}: ${snap.freelancer} · adeudado ${snap.adeudado} · pagado ${snap.pagado} · ${H[H.length-1]} ${snap.ultima}`)

if (!ESCRIBIR) { console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir para aplicar. ---'); process.exit(0) }

const reqs = []
reqs.push({ insertDimension:{ range:{sheetId, dimension:'COLUMNS', startIndex:DESTINO, endIndex:DESTINO+1}, inheritFromBefore:true } })
// mismo formato que Monto Adeudado (header y números), y un ancho para que se lea
reqs.push({ copyPaste:{
  source:      {sheetId, startRowIndex:0, endRowIndex:rowCount, startColumnIndex:iAde, endColumnIndex:iAde+1},
  destination: {sheetId, startRowIndex:0, endRowIndex:rowCount, startColumnIndex:DESTINO, endColumnIndex:DESTINO+1},
  pasteType:'PASTE_FORMAT' } })
reqs.push({ updateDimensionProperties:{ range:{sheetId, dimension:'COLUMNS', startIndex:DESTINO, endIndex:DESTINO+1},
  properties:{pixelSize:100}, fields:'pixelSize' } })
// el filtro tiene que abarcar la columna nueva, si no no aparece en el desplegable
if (hoja.basicFilter) {
  const bf = JSON.parse(JSON.stringify(hoja.basicFilter))
  bf.range.endColumnIndex = Math.max(bf.range.endColumnIndex||0, orden.length)
  reqs.push({ setBasicFilter:{ filter: bf } })
}
await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody:{ requests: reqs } })
await sheets.spreadsheets.values.update({ spreadsheetId: ID, range:`${TAB}!${colLetra(DESTINO)}1`, valueInputOption:'RAW', requestBody:{ values:[[NOMBRE]] } })

// verificación: headers y fila de control alineados, y una fórmula de MES A MES corrida
const r2 = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range:`${TAB}!A:Z` })
const F2 = r2.data.values||[], H2 = F2[0]||[], c2 = F2[ctrlIdx]||[]
const iVia2 = H2.findIndex(h=>norm(h)==='viaticos'), iPag2 = H2.findIndex(h=>norm(h)==='monto pagado')
const ok = iVia2===DESTINO && iPag2===iPag+1 && String(c2[iPag2]||'')===String(snap.pagado||'') && String(c2[iAde]||'')===String(snap.adeudado||'') && String(c2[H2.length-1]||'')===String(snap.ultima||'')
console.log(`\n${ok?'✓':'✗'} DESPUÉS: ${H2.map((h,i)=>`${colLetra(i)}:${h}`).join(' · ')}`)
console.log(`${ok?'✓':'✗'} Fila ${snap.fila}: adeudado ${c2[iAde]} · pagado ${c2[iPag2]} · ${H2[H2.length-1]} ${c2[H2.length-1]}`)
try {
  const mm = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range:`'MES A MES'!N5`, valueRenderOption:'FORMULA' })
  console.log(`MES A MES!N5 ahora: ${mm.data.values?.[0]?.[0]}`)
} catch(e) { console.log('(no pude leer MES A MES para verificar la fórmula:', e.message, ')') }
if (!ok) { console.error('\n✗ Algo no quedó alineado. Revisar a mano antes de usar la app.'); process.exit(1) }
console.log(`\n✓ Listo. Pagos Staff en la app ya puede guardar viáticos en ${TAB}!${colLetra(DESTINO)}.`)
