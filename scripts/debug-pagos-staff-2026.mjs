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

// 1. Cargar Pagos_Staff
const rPS = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Pagos_Staff!A1:L600' })
const psRows = rPS.data.values || []
const psHeaders = psRows[0]
console.log('Headers Pagos_Staff:', psHeaders.join(' | '))
console.log('Total filas:', psRows.length-1)

// 2. Cargar PROYECTOS 2026
const rPry = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A1:BH500' })
const proyRows = rPry.data.values || []
const proy2026Nros = new Set()
for (let i = 1; i < proyRows.length; i++) {
  const fe = String(proyRows[i][3] || '').split('/')
  if (fe[2] === '2026') proy2026Nros.add(String(proyRows[i][2]))
}
console.log(`\nProyectos 2026: ${proy2026Nros.size}`)

// 3. Pagos por proyecto
const pagosByPresu = {}
const idxNro = psHeaders.indexOf('N° Presupuesto')
const idxFree = psHeaders.indexOf('Freelancer')
const idxMontoP = psHeaders.indexOf('Monto Pagado')
const idxMontoA = psHeaders.indexOf('Monto Adeudado')
console.log(`Indices: nro=${idxNro} free=${idxFree} pagado=${idxMontoP} adeudado=${idxMontoA}`)

for (let i = 1; i < psRows.length; i++) {
  const nro = String(psRows[i][idxNro] || '')
  if (!nro) continue
  if (!pagosByPresu[nro]) pagosByPresu[nro] = []
  pagosByPresu[nro].push({
    free: psRows[i][idxFree],
    pagado: num(psRows[i][idxMontoP]),
    adeudado: num(psRows[i][idxMontoA]),
  })
}

let con2026 = 0, totalPagado = 0, totalAdeudado = 0
const personasUnicas = new Set()
let muestras = 0
for (const nro of proy2026Nros) {
  if (pagosByPresu[nro]) {
    con2026++
    pagosByPresu[nro].forEach(p => {
      totalPagado += p.pagado
      totalAdeudado += p.adeudado
      if (p.free) personasUnicas.add(p.free)
    })
    if (muestras < 3) {
      console.log(`\n  Ejemplo #${nro}:`)
      pagosByPresu[nro].forEach(p => console.log(`    ${p.free}: pagado ${p.pagado} · adeudado ${p.adeudado}`))
      muestras++
    }
  }
}

console.log(`\n=== Resumen ===`)
console.log(`Proyectos 2026 con pagos en Pagos_Staff: ${con2026}/${proy2026Nros.size}`)
console.log(`Total pagado a staff (Monto Pagado): $${totalPagado.toLocaleString('es-AR')}`)
console.log(`Total adeudado: $${totalAdeudado.toLocaleString('es-AR')}`)
console.log(`Personas únicas: ${personasUnicas.size}`)
console.log(`Nombres:`, [...personasUnicas].slice(0,15).join(', '))
