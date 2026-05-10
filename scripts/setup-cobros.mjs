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

// 1. Agregar columnas Z..AF a FACTURACION (headers en fila 1)
const NEW_HEADERS = ['Cuenta destino', 'Forma de pago', 'Ret. Ganancias', 'Ret. IIBB', 'Ret. IVA', 'Comision banco', 'Monto cobrado']

// Primero check si ya existen
const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!1:1' })
const existing = (r.data.values || [[]])[0] || []
console.log('Headers actuales en FACTURACION:', existing.length, 'columnas')

const yaExisten = NEW_HEADERS.filter(h => existing.includes(h))
if (yaExisten.length > 0) {
  console.log('⚠️  Estos headers ya existen, salteando:', yaExisten.join(', '))
  process.exit(0)
}

// Expandir el grid de FACTURACION para soportar las nuevas columnas
const metaPre = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties' })
const factSheet = metaPre.data.sheets.find(s => s.properties.title === 'FACTURACION')
const factSheetId = factSheet.properties.sheetId
const currentCols = factSheet.properties.gridProperties.columnCount
const neededCols = existing.length + NEW_HEADERS.length
if (currentCols < neededCols) {
  console.log(`Expandiendo grid de ${currentCols} a ${neededCols} columnas`)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ appendDimension: { sheetId: factSheetId, dimension: 'COLUMNS', length: neededCols - currentCols } }] },
  })
}

const startCol = existing.length // 0-indexed, lo siguiente
const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }
const range = `FACTURACION!${colLetra(startCol)}1:${colLetra(startCol+NEW_HEADERS.length-1)}1`
console.log(`Agregando headers en ${range}`)

await sheets.spreadsheets.values.update({
  spreadsheetId: SHEET_ID,
  range,
  valueInputOption: 'USER_ENTERED',
  requestBody: { values: [NEW_HEADERS] },
})
console.log('✓ Columnas agregadas a FACTURACION')

// 2. Crear hoja COBROS si no existe
const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties.title' })
const tabs = meta.data.sheets.map(s => s.properties.title)

if (!tabs.includes('COBROS')) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: 'COBROS', gridProperties: { rowCount: 1000, columnCount: 12 } } } }] },
  })
  console.log('✓ Hoja COBROS creada')
} else {
  console.log('⚠️  Hoja COBROS ya existe, no la recreo')
}

// Headers de COBROS
const COBROS_HEADERS = ['Timestamp', 'N° Presupuesto', 'Cliente', 'Tipo', 'Monto', 'Cuenta destino', 'Forma de pago', 'Ret. Ganancias', 'Ret. IIBB', 'Ret. IVA', 'Comision', 'Notas']
const rC = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'COBROS!A1:L1' })
const cobrosExisting = (rC.data.values || [[]])[0] || []
if (cobrosExisting.length === 0) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: 'COBROS!A1:L1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [COBROS_HEADERS] },
  })
  console.log('✓ Headers de COBROS escritos')
}

// 3. Migrar facturas ya cobradas: setear "Monto cobrado" = Precio FINAL para las que tienen Cobrado=TRUE
const rF = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A1:AG200' })
const rows = rF.data.values || []
const headers = rows[0] || []
const idxCobrado = headers.indexOf('Cobrado')
const idxPrecioFinal = headers.indexOf('Precio FINAL')
const idxMontoCobrado = headers.indexOf('Monto cobrado')
console.log(`Cobrado col=${idxCobrado}, Precio FINAL col=${idxPrecioFinal}, Monto cobrado col=${idxMontoCobrado}`)

if (idxMontoCobrado === -1) { console.log('No encuentro "Monto cobrado", abort migración'); process.exit(0) }

const updates = []
for (let i = 1; i < rows.length; i++) {
  const row = rows[i]
  const cobrado = String(row[idxCobrado] || '').toUpperCase() === 'TRUE'
  const yaTieneMonto = row[idxMontoCobrado]
  if (cobrado && !yaTieneMonto) {
    const precio = row[idxPrecioFinal]
    if (precio) {
      updates.push({ range: `FACTURACION!${colLetra(idxMontoCobrado)}${i+1}`, values: [[precio]] })
    }
  }
}
console.log(`Migrando ${updates.length} filas (Cobrado=TRUE sin Monto cobrado)`)
if (updates.length > 0) {
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
  })
  console.log('✓ Migración completa')
}
