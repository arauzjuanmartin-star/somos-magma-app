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

// 1. Cargar PRESUPUESTOS con valores RAW (números reales)
const rP = await sheets.spreadsheets.values.get({
  spreadsheetId: SHEET_ID,
  range: 'PRESUPUESTOS!A1:AV2000',
  valueRenderOption: 'UNFORMATTED_VALUE',
})
const presuRows = rP.data.values || []
const datosPresu = {}  // nro → { precioFinal, totalBruto, ajuste, fee, subtotal, impGan, iibb, plazo, intPct, intAmt }
for (let i = 1; i < presuRows.length; i++) {
  const nro = String(presuRows[i][0] || '')
  if (!nro) continue
  datosPresu[nro] = {
    precioFinal: presuRows[i][8],    // I
    subtotal: presuRows[i][38],      // AM
    fee: presuRows[i][39],           // AN
    impGan: presuRows[i][40],        // AO
    iibb: presuRows[i][41],          // AP
    plazo: presuRows[i][42],         // AQ
    intPct: presuRows[i][43],        // AR
    intAmt: presuRows[i][44],        // AS
    totalBruto: presuRows[i][45],    // AT
    ajuste: presuRows[i][46],        // AU
  }
}
console.log(`Presupuestos cargados (raw): ${Object.keys(datosPresu).length}`)

// 2. Cargar PROYECTOS con UNFORMATTED para comparar correctamente
const rPry = await sheets.spreadsheets.values.get({
  spreadsheetId: SHEET_ID,
  range: 'PROYECTOS!A1:BH500',
  valueRenderOption: 'UNFORMATTED_VALUE',
})
const proyRows = rPry.data.values || []

const updates = []
let revisados = 0, fixed = 0
const samples = []
for (let i = 1; i < proyRows.length; i++) {
  const row = proyRows[i]
  const nro = String(row[2] || '')
  if (!nro) continue
  revisados++
  const datos = datosPresu[nro]
  if (!datos) continue
  const pfNum = typeof datos.precioFinal === 'number' ? datos.precioFinal : 0
  if (pfNum === 0) continue

  const totalH = typeof row[7] === 'number' ? row[7] : 0
  const totalBG = typeof row[58] === 'number' ? row[58] : 0
  const tolerancia = 1
  const necesitaH = Math.abs(totalH - pfNum) > tolerancia
  const necesitaBG = Math.abs(totalBG - pfNum) > tolerancia

  if (necesitaH || necesitaBG) {
    fixed++
    if (samples.length < 5) samples.push({ nro, fila: i+1, totalH, totalBG, pfNum, ajuste: datos.ajuste })
    if (necesitaH) updates.push({ range: `PROYECTOS!H${i+1}`, values: [[pfNum]] })
    if (necesitaBG) updates.push({ range: `PROYECTOS!BG${i+1}`, values: [[pfNum]] })
    // tambien BH ajuste si raw distinto al esperado
    const ajusteNum = typeof datos.ajuste === 'number' ? datos.ajuste : 0
    if (typeof row[59] !== 'number' || Math.abs((row[59]||0) - ajusteNum) > tolerancia) {
      updates.push({ range: `PROYECTOS!BH${i+1}`, values: [[ajusteNum]] })
    }
  }
}

console.log(`Revisados: ${revisados}`)
console.log(`Filas a fixear: ${fixed}`)
console.log(`Total writes: ${updates.length}`)
console.log('Muestras:')
samples.forEach(s => console.log(`  #${s.nro} fila ${s.fila}: H=${s.totalH} BG=${s.totalBG} → debería ${s.pfNum} (ajuste ${s.ajuste})`))

if (updates.length === 0) { console.log('Nada que hacer.'); process.exit(0) }

console.log('\nAplicando con RAW (valueInputOption: RAW)...')
for (let i = 0; i < updates.length; i += 100) {
  const batch = updates.slice(i, i+100)
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: 'RAW', data: batch },  // RAW para que NO interprete strings
  })
  console.log(`  ${Math.min(i+100, updates.length)}/${updates.length}`)
}
console.log('✓ Hecho')
