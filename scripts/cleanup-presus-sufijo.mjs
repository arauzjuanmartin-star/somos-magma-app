// Cleanup de los 4 presus con sufijo de letra creados por el experimento de opciones A/B/C.
// Plan: borrar las copias huérfanas (#1959B, #1962B) y renombrar los originales sin letra (#1959A→#1959, #1962A→#1962).
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

const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A:BC' })
const filas = r.data.values

// Localizar las 4 filas
const idxBy = nro => filas.findIndex((row,i) => i>0 && String(row[0]||'').trim() === nro)

const toRename = [ ['1959A','1959'], ['1962A','1962'] ]
const toDelete = ['1959B','1962B']

// Renombrar
for (const [from, to] of toRename) {
  const idx = idxBy(from)
  if (idx < 0) { console.log(`SKIP: no encontré #${from}`); continue }
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `PRESUPUESTOS!A${idx+1}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[to]] }
  })
  console.log(`RENAME: #${from} → #${to} (fila ${idx+1})`)
}

// Borrar (en orden inverso para no desplazar índices)
const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties)' })
const presuSheet = meta.data.sheets.find(s => s.properties.title === 'PRESUPUESTOS')
const filasABorrar = toDelete.map(nro => {
  const idx = idxBy(nro)
  return idx < 0 ? null : { nro, fila: idx+1 }
}).filter(Boolean).sort((a,b) => b.fila - a.fila)

if (filasABorrar.length) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: filasABorrar.map(f => ({
      deleteDimension: { range: { sheetId: presuSheet.properties.sheetId, dimension: 'ROWS', startIndex: f.fila-1, endIndex: f.fila } }
    })) }
  })
  filasABorrar.forEach(f => console.log(`DELETE: #${f.nro} (fila ${f.fila})`))
}

try {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'LOG!A:F',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[new Date().toISOString(), 'script', 'cleanup-presus-sufijo', 'PRESUPUESTOS', '', `revert MVP opciones A/B/C: borradas ${toDelete.join(',')}, renombrados ${toRename.map(([a,b])=>`${a}→${b}`).join(',')}`]] },
  })
} catch (e) {}

console.log('\n✓ Cleanup completo.')
