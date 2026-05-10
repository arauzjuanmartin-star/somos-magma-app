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

const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties.title' })
const tabs = meta.data.sheets.map(s => s.properties.title)

if (!tabs.includes('MOVIMIENTOS_TARJETA')) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: 'MOVIMIENTOS_TARJETA', gridProperties: { rowCount: 5000, columnCount: 12 } } } }] },
  })
  console.log('✓ Hoja MOVIMIENTOS_TARJETA creada')
}

const headers = ['Tarjeta','Mes','Año','Fecha','Descripcion','Comercio','Moneda','Monto','Categoria','Subcategoria','Cargado por','Notas']
const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'MOVIMIENTOS_TARJETA!A1:L1' })
if ((r.data.values?.[0]||[]).length === 0) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'MOVIMIENTOS_TARJETA!A1:L1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [headers] },
  })
  console.log('✓ Headers escritos')
}
console.log('OK')
