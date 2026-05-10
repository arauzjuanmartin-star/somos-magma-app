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

const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A1:AG200' })
const rows = r.data.values || []
const headers = rows[0]

console.log('Buscando facturas con "fabrica" o "Fabrica" en cliente/proyecto:')
const matches = []
for (let i = 1; i < rows.length; i++) {
  const cliente = String(rows[i][headers.indexOf('Cliente')] || '').toLowerCase()
  const proyecto = String(rows[i][headers.indexOf('Proyecto')] || '').toLowerCase()
  if (cliente.includes('fabric') || proyecto.includes('fabric')) {
    matches.push({ fila: i+1, row: rows[i] })
  }
}

console.log(`Encontradas ${matches.length} filas con "fabric"`)
matches.forEach(m => {
  const obj = {}
  headers.forEach((h, i) => { if (m.row[i]) obj[h] = m.row[i] })
  console.log(`\nFila ${m.fila}:`)
  Object.entries(obj).forEach(([k, v]) => console.log(`  ${k}: ${v}`))
})

console.log('\n--- Últimos cobros de COBROS (top 5) ---')
const c = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'COBROS!A1:L20' })
const cRows = c.data.values || []
cRows.slice(1).slice(-5).forEach(row => {
  console.log(`  ${row.slice(0,7).join(' | ')}`)
})
