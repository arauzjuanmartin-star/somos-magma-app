/**
 * Agrega la columna "Mes" a la solapa PRESTAMOS (derivada de Vencimiento).
 * Formato: "2026-08 ago" → ordena cronológico y se lee en castellano.
 * Es una ARRAYFORMULA anclada en S2, así las cuotas que se carguen después
 * ya salen con el mes solo (no hay que volver a correr esto).
 * También extiende el filtro de la solapa para que la columna sea filtrable.
 *
 * Uso:  node scripts/prestamos-columna-mes.mjs           (preview)
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
const FORMULA = '=ARRAYFORMULA(IF($D$2:$D="","",TEXT($D$2:$D,"YYYY-MM")&" "&TEXT($D$2:$D,"mmm")))'

const meta = await sheets.spreadsheets.get({ spreadsheetId: ID, ranges: ['PRESTAMOS'],
  fields: 'sheets(properties(title,sheetId,gridProperties),basicFilter)' })
const hoja = meta.data.sheets.find(s=>s.properties.title==='PRESTAMOS')
const sheetId = hoja.properties.sheetId
const cols = hoja.properties.gridProperties.columnCount

const r = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'PRESTAMOS!A:Z' })
const filas = r.data.values || []
const headers = filas[0] || []
const yaEsta = headers.findIndex(h => String(h).trim().toLowerCase() === 'mes')

console.log(`PRESTAMOS · ${filas.length-1} cuotas · ${cols} columnas · headers: ${headers.join(' | ')}`)
if (yaEsta !== -1) { console.log(`\nYa existe la columna "Mes" (posición ${yaEsta+1}). No hago nada.`); process.exit(0) }

// preview: qué mes le tocaría a cada cuota
const MESES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const parseFecha = s => { const m=String(s||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m?new Date(+m[3],+m[2]-1,+m[1]):null }
const conteo = new Map()
filas.slice(1).forEach(f => {
  const d = parseFecha(f[3]); if(!d) return
  const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')} ${MESES[d.getMonth()]}`
  conteo.set(k, (conteo.get(k)||0)+1)
})
console.log(`\nColumna nueva: S · "Mes" (fórmula, se calcula sola desde Vencimiento)`)
console.log(`Valores que va a tomar (${conteo.size} meses distintos):`)
;[...conteo.entries()].sort().forEach(([m,n]) => console.log(`   ${m}   ${n} cuota${n>1?'s':''}`))

if (!ESCRIBIR) { console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir para aplicar. ---'); process.exit(0) }

// 1) agregar la columna física + copiar formato del header
const reqs = [
  { appendDimension: { sheetId, dimension:'COLUMNS', length:1 } },
  { copyPaste: {
      source:      { sheetId, startRowIndex:0, endRowIndex:1, startColumnIndex:cols-1, endColumnIndex:cols },
      destination: { sheetId, startRowIndex:0, endRowIndex:1, startColumnIndex:cols,   endColumnIndex:cols+1 },
      pasteType:'PASTE_FORMAT' } },
]
// 2) si hay filtro activo, extenderlo para que "Mes" entre en el desplegable
if (hoja.basicFilter) {
  const bf = JSON.parse(JSON.stringify(hoja.basicFilter))
  bf.range.endColumnIndex = cols + 1
  reqs.push({ setBasicFilter: { filter: bf } })
}
await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests: reqs } })

// 3) header + fórmula
const colLetra = n => { let s=''; n++; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=(n-m-1)/26 } return s }
const L = colLetra(cols)
await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: ID, requestBody: { valueInputOption:'USER_ENTERED', data:[
  { range:`PRESTAMOS!${L}1`, values:[['Mes']] },
  { range:`PRESTAMOS!${L}2`, values:[[FORMULA]] },
]}})

// 4) verificar leyendo de vuelta
const v = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: `PRESTAMOS!${L}1:${L}${filas.length}` })
const escritas = (v.data.values||[]).slice(1).filter(x=>x[0])
console.log(`\n✓ Columna ${L} "Mes" creada · ${escritas.length}/${filas.length-1} cuotas con mes`)
console.log(`  primeras: ${escritas.slice(0,3).map(x=>x[0]).join(' · ')}`)
console.log(`  últimas:  ${escritas.slice(-3).map(x=>x[0]).join(' · ')}`)
const vacias = filas.length-1-escritas.length
if (vacias) console.log(`  ⚠ ${vacias} cuotas sin Vencimiento → quedaron sin mes`)

try { await sheets.spreadsheets.values.append({ spreadsheetId: ID, range:'LOG!A:F', valueInputOption:'USER_ENTERED',
  requestBody:{ values:[[new Date().toISOString(),'juan (script)','prestamos-columna-mes','PRESTAMOS','S','columna Mes agregada (fórmula desde Vencimiento)']] } }) } catch(e){}
