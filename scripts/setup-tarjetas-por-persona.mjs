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
const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

// 1. Expandir grid de TARJETAS si hace falta
const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties' })
const t = meta.data.sheets.find(s => s.properties.title === 'TARJETAS')
if (t.properties.gridProperties.columnCount < 14) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ appendDimension: { sheetId: t.properties.sheetId, dimension: 'COLUMNS', length: 14 - t.properties.gridProperties.columnCount } }] },
  })
  console.log('Grid expandido a 14 cols')
}

// 2. Reescribir headers con Persona y Monto USD
const NEW_HEADERS = ['Tarjeta','Persona','Mes','Año','Monto','Monto USD','Vencimiento','Pagado','Fecha pago','Cuenta pago','PDF resumen','Notas','Monto pagado','Monto pagado USD']
await sheets.spreadsheets.values.update({
  spreadsheetId: SHEET_ID,
  range: `TARJETAS!A1:${colLetra(NEW_HEADERS.length-1)}1`,
  valueInputOption: 'USER_ENTERED',
  requestBody: { values: [NEW_HEADERS] },
})
console.log('Headers reescritos:', NEW_HEADERS.join(' | '))

// 3. Limpiar filas existentes
await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: 'TARJETAS!A2:N500' })
console.log('Filas anteriores limpiadas')

// 4. Cargar las 11 tarjetas reales (mayo 2026)
// Magma
const tarjetas = [
  // [Tarjeta, Persona, Mes, Año, Monto ARS, Monto USD, Vencimiento, Pagado, Fecha pago, Cuenta pago, PDF, Notas, Monto pagado, Monto pagado USD]
  ['BBVA Visa',         'Magma', 5, 2026, 3238959.29, 689.35,  '', 'NO','','','','',0,0],
  ['Master Galicia',    'Magma', 5, 2026, 5953027.48, 43,      '', 'NO','','','','',0,0],
  ['Santander Visa',    'Magma', 5, 2026, 4394264.71, 102.48,  '', 'NO','','','','',0,0],
  ['Santander Amex',    'Magma', 5, 2026, 1585228.60, 388.50,  '11/5/2026', 'NO','','','','',0,0],
  // Juan
  ['BBVA Visa',         'Juan',  5, 2026, 1247638.21, 14.55,   '', 'NO','','','','',0,0],
  ['Master Galicia',    'Juan',  5, 2026, 1425550.36, 0,       '', 'NO','','','','',0,0],
  ['Santander Visa',    'Juan',  5, 2026, 735087.34,  9.98,    '', 'NO','','','','',0,0],
  ['Visa Galicia',      'Juan',  5, 2026, 666666,     0,       '', 'NO','','','','',0,0],
  // Sofi
  ['BBVA Visa',         'Sofi',  5, 2026, 613636.27,  0,       '', 'NO','','','','',0,0],
  ['Santander Visa',    'Sofi',  5, 2026, 215476.66,  0,       '', 'NO','','','','',0,0],
  ['Visa Galicia',      'Sofi',  5, 2026, 1642830,    0,       '', 'NO','','','','',0,0],
]

await sheets.spreadsheets.values.append({
  spreadsheetId: SHEET_ID,
  range: 'TARJETAS!A:N',
  valueInputOption: 'USER_ENTERED',
  insertDataOption: 'INSERT_ROWS',
  requestBody: { values: tarjetas },
})
console.log(`✓ ${tarjetas.length} tarjetas cargadas`)

// Totales por persona para verificar
const sumByPersona = {}
tarjetas.forEach(t => {
  const p = t[1]
  if (!sumByPersona[p]) sumByPersona[p] = { ars: 0, usd: 0 }
  sumByPersona[p].ars += Number(t[4]) || 0
  sumByPersona[p].usd += Number(t[5]) || 0
})
console.log('\nTotales por persona:')
Object.entries(sumByPersona).forEach(([p, v]) => console.log(`  ${p}: $${v.ars.toLocaleString('es-AR',{minimumFractionDigits:2})} + USD ${v.usd}`))

// 5. Agregar columna Persona a MOVIMIENTOS_TARJETA si no existe
const m2 = meta.data.sheets.find(s => s.properties.title === 'MOVIMIENTOS_TARJETA')
if (m2.properties.gridProperties.columnCount < 15) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ appendDimension: { sheetId: m2.properties.sheetId, dimension: 'COLUMNS', length: 15 - m2.properties.gridProperties.columnCount } }] },
  })
}
await sheets.spreadsheets.values.update({
  spreadsheetId: SHEET_ID,
  range: 'MOVIMIENTOS_TARJETA!O1',
  valueInputOption: 'USER_ENTERED',
  requestBody: { values: [['Persona']] },
})
console.log('✓ Columna Persona agregada a MOVIMIENTOS_TARJETA')
