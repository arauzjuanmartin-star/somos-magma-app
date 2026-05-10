import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('='))
    .map(l => {
      const i = l.indexOf('=')
      let v = l.slice(i+1).trim()
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1,-1)
      return [l.slice(0, i).trim(), v]
    })
)

const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: env.GOOGLE_CLIENT_EMAIL,
    private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version: 'v4', auth })

const r = await sheets.spreadsheets.values.get({
  spreadsheetId: SHEET_ID,
  range: 'FACTURACION!A1:Y180',
})
const rows = r.data.values || []
const headers = rows[0] || []

console.log('--- HEADERS de FACTURACION ---')
headers.forEach((h, i) => console.log(`  ${String.fromCharCode(65+i)} (${i}): ${h}`))

const colsInteres = ['Cobrado 30%', 'Cobrado 50%', 'Cobrado', 'Fecha cobro', 'Retenciones', 'Precio FINAL']
const idxs = colsInteres.map(c => headers.indexOf(c))

console.log('\n--- EJEMPLOS de filas con datos en columnas de cobro ---')
let count = 0
for (let i = 1; i < rows.length && count < 20; i++) {
  const row = rows[i]
  const vals = idxs.map(j => row[j])
  // mostrar sólo si tiene algo en 30% o 50% o cobrado
  if (vals[0] || vals[1]) {
    const nro = row[headers.indexOf('N° Presupuesto')]
    const cliente = row[headers.indexOf('Cliente')]
    const total = row[headers.indexOf('Precio FINAL')]
    console.log(`  fila ${i+1} #${nro} ${cliente}: total=${total}`)
    colsInteres.forEach((c, j) => { if (vals[j]) console.log(`    ${c}: ${vals[j]}`) })
    count++
  }
}

console.log(`\n--- ESTADISTICAS ---`)
console.log(`Total filas: ${rows.length-1}`)
const con30 = rows.slice(1).filter(r => r[idxs[0]]).length
const con50 = rows.slice(1).filter(r => r[idxs[1]]).length
const conCobrado = rows.slice(1).filter(r => r[idxs[2]]).length
console.log(`Con "Cobrado 30%": ${con30}`)
console.log(`Con "Cobrado 50%": ${con50}`)
console.log(`Con "Cobrado": ${conCobrado}`)
