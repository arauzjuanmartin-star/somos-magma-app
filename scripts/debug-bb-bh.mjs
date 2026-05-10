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

// 1. Ver el #1860 en PROYECTOS
const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A1:BH200' })
const rows = r.data.values || []
const headers = rows[0] || []

console.log('Buscando #1860 y proyectos recientes con eventos en 2026 (mayo+) en PROYECTOS:')
const buscar = ['1860']
const recientes = []
for (let i = 1; i < rows.length; i++) {
  const nro = String(rows[i][2] || '')
  const fechaEv = String(rows[i][3] || '')
  if (buscar.includes(nro)) {
    console.log(`\n--- Fila ${i+1}, #${nro} ---`)
    rows[i].forEach((v, j) => {
      if (v !== '' && v !== undefined) console.log(`  ${colLetra(j)} (${headers[j]||'?'}): ${v}`)
    })
  }
  if (fechaEv.endsWith('/2026')) {
    recientes.push({ idx: i+1, nro, fechaEv, row: rows[i] })
  }
}

console.log(`\n=== Resumen de eventos 2026 en PROYECTOS (${recientes.length} filas) ===`)
recientes.slice(0,20).forEach(r => {
  const subtotal = r.row[52] || ''
  const impGan = r.row[53] || ''
  const iibb = r.row[54] || ''
  const total = r.row[58] || ''
  const fee = r.row[8] || r.row[10] || ''
  console.log(`  fila ${r.idx}: #${r.nro} ${r.fechaEv} | Fee=${fee} Subtotal=${subtotal} ImpGan=${impGan} IIBB=${iibb} Total=${total}`)
})

// 2. Verificar el #1860 en PRESUPUESTOS también
const rP = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A1:AV1500' })
const presuRows = rP.data.values || []
console.log('\n=== En PRESUPUESTOS ===')
for (let i = 1; i < presuRows.length; i++) {
  if (String(presuRows[i][0]) === '1860') {
    console.log(`\n--- Fila ${i+1}, #1860 ---`)
    const presuHeaders = presuRows[0]
    presuRows[i].forEach((v, j) => {
      if (v !== '' && v !== undefined) console.log(`  ${colLetra(j)} (${presuHeaders[j]||'?'}): ${v}`)
    })
    break
  }
}

// 3. Cuántas filas de 2026 tienen BA-BH llenas vs vacías
const conFin = recientes.filter(r => r.row[52] || r.row[53] || r.row[58]).length
const sinFin = recientes.length - conFin
console.log(`\n=== ESTADÍSTICA ===`)
console.log(`Proyectos 2026 totales: ${recientes.length}`)
console.log(`Con financieros (BA-BH llenas): ${conFin}`)
console.log(`SIN financieros: ${sinFin}`)
