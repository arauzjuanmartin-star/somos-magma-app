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

const num = v => parseFloat(String(v||'0').replace(/[^\d.-]/g,''))||0

// 1. Cargar PRESUPUESTOS para mapear precio final por nro
const rP = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A1:AV2000' })
const presuRows = rP.data.values || []
const precioFinalByNro = {}
const ajusteByNro = {}
for (let i = 1; i < presuRows.length; i++) {
  const nro = String(presuRows[i][0] || '')
  if (!nro) continue
  precioFinalByNro[nro] = presuRows[i][8] || ''  // I — Precio Final
  ajusteByNro[nro] = presuRows[i][46] || ''       // AU — Ajuste
}

// 2. Cargar PROYECTOS y comparar Total (BG=58, H=7) con Precio Final
const rPry = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A1:BH500' })
const proyRows = rPry.data.values || []

const updates = []
let revisados = 0, fixedH = 0, fixedBG = 0
for (let i = 1; i < proyRows.length; i++) {
  const row = proyRows[i]
  const nro = String(row[2] || '')
  if (!nro) continue
  revisados++

  const precioFinal = precioFinalByNro[nro]
  if (!precioFinal) continue
  const pfNum = num(precioFinal)
  if (pfNum === 0) continue

  const totalH = num(row[7])     // H "Total "
  const totalBG = num(row[58])   // BG "Total"

  const tolerancia = 0.5
  if (Math.abs(totalH - pfNum) > tolerancia) {
    updates.push({ range: `PROYECTOS!H${i+1}`, values: [[precioFinal]] })
    fixedH++
  }
  if (Math.abs(totalBG - pfNum) > tolerancia) {
    updates.push({ range: `PROYECTOS!BG${i+1}`, values: [[precioFinal]] })
    fixedBG++
  }
}

console.log(`Revisados: ${revisados}`)
console.log(`H (Total) a corregir: ${fixedH}`)
console.log(`BG (Total) a corregir: ${fixedBG}`)
console.log(`Total updates: ${updates.length}`)

if (updates.length === 0) {
  console.log('Nada que hacer.')
  process.exit(0)
}

console.log('\nAplicando...')
for (let i = 0; i < updates.length; i += 100) {
  const batch = updates.slice(i, i+100)
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'USER_ENTERED', data: batch },
  })
  console.log(`  ${Math.min(i+100, updates.length)}/${updates.length}`)
}
console.log('✓ Hecho')
