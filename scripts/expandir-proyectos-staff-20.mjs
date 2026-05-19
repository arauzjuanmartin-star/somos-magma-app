// Expande PROYECTOS de 60 cols (12 slots staff) a 84 cols (20 slots staff)
// + Elimina la solapa CARGAR STAFF (legacy, ya no se usa desde la app)
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
    const i=l.indexOf('='); let v=l.slice(i+1).trim()
    if (v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1)
    return [l.slice(0,i).trim(),v]
  })
)
const SHEET_ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const auth = new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets = google.sheets({version:'v4',auth})

const ejecutar = process.argv.includes('--ejecutar')

const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties' })
const cargarStaff = meta.data.sheets.find(s => s.properties.title === 'CARGAR STAFF')
const proy = meta.data.sheets.find(s => s.properties.title === 'PROYECTOS')

console.log('Estado actual:')
console.log(`  CARGAR STAFF: ${cargarStaff ? 'existe (sheetId '+cargarStaff.properties.sheetId+')' : 'no existe'}`)
console.log(`  PROYECTOS: ${proy.properties.gridProperties.columnCount} columnas (necesitamos 84 para 20 slots)`)

if (!ejecutar) {
  console.log('\nQué se va a hacer:')
  console.log('  1. PROYECTOS: expandir a 90 columnas y agregar Staff 13-20 + Precio 13-20')
  console.log('     (estructura actual: ...Pedido N/Precio N/Staff N... para N=1..12)')
  console.log('     (nuevo: extiende hasta N=20)')
  console.log('  2. CARGAR STAFF: ELIMINAR (legacy, la app no la usa)')
  console.log('\nUsá: node scripts/expandir-proyectos-staff-20.mjs --ejecutar')
  process.exit(0)
}

// PROYECTOS: layout actual A=Mes B=CargaStaff C=N° D=FechaEv E=Agencia F=Cliente G=Proyecto
// H=Total I=FeeFinal J=Diferencia K=FeeAgencia
// L..AX = 12 grupos de 3 cols (Pedido/Precio/Staff) — 36 cols total
// AY=Otros AZ=PrecioOtros BA=StaffOtros (3 cols)
// BB=FechaPresu BC=PM BD=Subtotal BE=ImpGan BF=IIBB BG=Plazo BH=Int% BI=Int$ BJ=Total BK=Ajuste
// Hmm, déjame verificar el layout real.
const proyHdrs = await sheets.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:'PROYECTOS!1:1'})
const headers = proyHdrs.data.values[0]
console.log('\nHeaders actuales:')
headers.forEach((h,i) => { if (h) console.log(`  ${i}: ${h}`) })

// Encontrar dónde están los slots actuales y dónde insertar
const staffPositions = []
headers.forEach((h,i) => { if (h==='Staff' || /^Staff \d+$/.test(h)) staffPositions.push(i) })
console.log(`\nSlots Staff encontrados en cols:`, staffPositions.join(', '))
const ultimoStaff = staffPositions[staffPositions.length-1]
console.log(`Último Staff en col ${ultimoStaff} (${colLetra(ultimoStaff)})`)

// Mejor estrategia: dejar la estructura existente intacta y agregar Staff 13-20 al final
// Posiciones de columnas nuevas: después del ajuste (col 59) o donde haya espacio
// Voy a agregar al final de los headers actuales
const currentCols = proy.properties.gridProperties.columnCount
const newCols = currentCols + 16 // 8 nuevos slots × 2 (Pedido/Precio? no, ya tenemos. Solo Staff y Precio extras)
// Mejor: agregar Staff 13/Precio 13 ... Staff 20/Precio 20 al final
if (currentCols < newCols) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ appendDimension: { sheetId: proy.properties.sheetId, dimension: 'COLUMNS', length: newCols - currentCols } }] },
  })
  console.log(`✓ PROYECTOS expandido a ${newCols} columnas`)
}

// Escribir headers nuevos en las posiciones agregadas
const newHeaders = []
for (let n=13; n<=20; n++) {
  newHeaders.push(`Pedido ${n}`, `Precio ${n}`, `Staff ${n}`)
}
// Esperá, son 3 cols por slot (Pedido/Precio/Staff). 8 slots × 3 = 24 cols. Ajustar.
const newColsNeeded = (20-12) * 3 // 24
const startCol = currentCols
// Re-extender si es necesario
if (newCols < currentCols + newColsNeeded) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ appendDimension: { sheetId: proy.properties.sheetId, dimension: 'COLUMNS', length: (currentCols + newColsNeeded) - newCols } }] },
  })
}

await sheets.spreadsheets.values.update({
  spreadsheetId: SHEET_ID,
  range: `PROYECTOS!${colLetra(startCol)}1:${colLetra(startCol + newColsNeeded - 1)}1`,
  valueInputOption: 'USER_ENTERED',
  requestBody: { values: [newHeaders] }
})
console.log(`✓ Headers Pedido/Precio/Staff 13-20 escritos en cols ${colLetra(startCol)} - ${colLetra(startCol + newColsNeeded - 1)}`)

// Eliminar CARGAR STAFF
if (cargarStaff) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ deleteSheet: { sheetId: cargarStaff.properties.sheetId } }] }
  })
  console.log(`✓ Solapa CARGAR STAFF eliminada`)
} else {
  console.log('CARGAR STAFF no existía, skip')
}

function colLetra(c) { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }
