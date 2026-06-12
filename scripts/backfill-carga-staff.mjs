// Backfill: setea Carga Staff = TRUE en proyectos viejos que tienen staff cargado pero el flag en FALSE.
// El endpoint proyecto-staff.js setea el flag al cargar staff desde la app desde ~mayo 2026,
// los proyectos cargados directo al sheet (ene-abril) quedaron con flag vacío aunque tengan staff.
// Resultado: aparecían como "pendientes" en la app pero en realidad estaban OK.
import { google } from 'googleapis'
import { readFileSync } from 'fs'

readFileSync('.env.local','utf-8').split('\n').forEach(l => {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"|"$/g,'')
})

const auth = new google.auth.GoogleAuth({
  credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version: 'v4', auth })
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A1:BH2000' })
const h = r.data.values[0]
const iCarga = h.indexOf('Carga Staff')
const staffCols = []
h.forEach((hd, i) => { if (hd === 'Staff') staffCols.push(i) })

const updates = []
const detalle = []
r.data.values.slice(1).forEach((row, idx) => {
  if (!row.some(c => c)) return
  const flag = row[iCarga]==='TRUE' || row[iCarga]===true
  const tieneStaff = staffCols.some(c => row[c] && String(row[c]).trim())
  if (!flag && tieneStaff) {
    const rowSheet = idx + 2  // header + 1-based
    updates.push({ range: `PROYECTOS!${colLetra(iCarga)}${rowSheet}`, values: [[true]] })
    detalle.push(`  #${row[2]||'?'} | ${row[5]||'?'} - ${row[6]||'?'} | ${row[3]||'?'} | fila ${rowSheet}`)
  }
})

console.log(`Encontré ${updates.length} proyectos a actualizar.\n`)
console.log('Muestra (primeros 10):')
detalle.slice(0,10).forEach(d => console.log(d))
if (detalle.length > 10) console.log(`  ... y ${detalle.length-10} más`)

if (updates.length === 0) { console.log('\nNada que hacer.'); process.exit(0) }

// Ejecutar en batch de 200 (Sheets soporta más, pero por las dudas)
const BATCH = 200
for (let i = 0; i < updates.length; i += BATCH) {
  const slice = updates.slice(i, i+BATCH)
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data: slice },
  })
  console.log(`Batch ${i/BATCH+1}: ${slice.length} actualizados.`)
}

// Log en LOG
try {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'LOG!A:F',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[new Date().toISOString(), 'script', 'backfill-carga-staff', 'PROYECTOS', '', `setea TRUE en ${updates.length} proyectos viejos que ya tenían staff cargado`]] },
  })
} catch(e) {}

console.log(`\n✓ Backfill completo. ${updates.length} proyectos marcados como OK.`)
