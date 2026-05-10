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

// 1. Cargar PRESUPUESTOS y armar índice por número
const rP = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A1:AV2000' })
const presuRows = rP.data.values || []
const presusByNro = {}
for (let i = 1; i < presuRows.length; i++) {
  const nro = String(presuRows[i][0] || '')
  if (nro) presusByNro[nro] = presuRows[i]
}
console.log(`PRESUPUESTOS cargados: ${Object.keys(presusByNro).length}`)

// 2. Cargar PROYECTOS y procesar
const rPry = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A1:BH500' })
const proyRows = rPry.data.values || []
console.log(`PROYECTOS filas: ${proyRows.length-1}`)

const updates = []
let completos = 0, incompletos = 0, sinPresu = 0
for (let i = 1; i < proyRows.length; i++) {
  const row = proyRows[i]
  const nro = String(row[2] || '')
  if (!nro) continue
  const tieneBA = row[52], tieneBB = row[53], tieneBG = row[58]
  if (tieneBA && tieneBB && tieneBG) { completos++; continue }

  const presu = presusByNro[nro]
  if (!presu) { sinPresu++; continue }
  incompletos++

  const subtotal = presu[38] || ''
  const fee      = presu[39] || ''
  const impGan   = presu[40] || ''
  const iibb     = presu[41] || ''
  const plazo    = presu[42] || ''
  const intPct   = presu[43] || ''
  const intAmt   = presu[44] || ''
  const total    = presu[45] || ''
  const ajuste   = presu[46] || ''
  const cliente  = presu[5]  || ''
  const fechaPresu = presu[9] || ''
  const pmInt    = presu[2]  || ''

  const rowNum = i + 1
  // Update BA:BH (cols 52-59)
  updates.push({ range: `PROYECTOS!BA${rowNum}:BH${rowNum}`, values: [[subtotal, impGan, iibb, plazo, intPct, intAmt, total, ajuste]] })
  // Si Cliente (F=5) está vacío, completarlo
  if (!row[5] && cliente) updates.push({ range: `PROYECTOS!F${rowNum}`, values: [[cliente]] })
  // Si Fee (I=8 / K=10) está vacío, completarlo
  if (!row[8] && fee) updates.push({ range: `PROYECTOS!I${rowNum}`, values: [[fee]] })
  if (!row[10] && fee) updates.push({ range: `PROYECTOS!K${rowNum}`, values: [[fee]] })
  // AY Fecha Presupuesto, AZ PM
  if (!row[50] && fechaPresu) updates.push({ range: `PROYECTOS!AY${rowNum}`, values: [[fechaPresu]] })
  if (!row[51] && pmInt) updates.push({ range: `PROYECTOS!AZ${rowNum}`, values: [[pmInt]] })
}

console.log(`\nResumen:`)
console.log(`  Ya completos: ${completos}`)
console.log(`  A completar: ${incompletos}`)
console.log(`  Sin presu correspondiente: ${sinPresu}`)
console.log(`  Total updates: ${updates.length}`)

if (updates.length === 0) {
  console.log('Nada que hacer.')
  process.exit(0)
}

// Aplicar en batches de 100 para no superar límites
console.log('\nAplicando updates...')
for (let i = 0; i < updates.length; i += 100) {
  const batch = updates.slice(i, i+100)
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data: batch },
  })
  console.log(`  ${Math.min(i+100, updates.length)}/${updates.length}`)
}
console.log('✓ Backfill completo')
