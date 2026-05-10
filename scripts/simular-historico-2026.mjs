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

// Cargar PROYECTOS y simular el cálculo de Histórico 2026
const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A1:BH500' })
const rows = r.data.values || []
const headers = rows[0]
const H = name => headers.indexOf(name)

const proy2026 = []
for (let i = 1; i < rows.length; i++) {
  const fe = String(rows[i][3] || '').split('/')
  if (fe[2] !== '2026') continue
  proy2026.push(rows[i])
}

console.log(`Proyectos 2026: ${proy2026.length}`)

const totalPresu = proy2026.reduce((s,r) => s + num(r[H('Total')] || r[H('Total ')]), 0)
const totalMagma = proy2026.reduce((s,r) => s + (num(r[H('Fee Agencia')]) || num(r[H('Fee Final')])), 0)
const totalImpGan = proy2026.reduce((s,r) => s + num(r[H('Imp. Ganancias')]), 0)
const totalIIBB = proy2026.reduce((s,r) => s + num(r[H('IIBB')]), 0)
const totalImpuestos = totalImpGan + totalIIBB
const totalSubtotal = proy2026.reduce((s,r) => s + num(r[H('Subtotal')]), 0)
const margen = totalPresu > 0 ? Math.round(totalMagma/totalPresu*100) : 0

const M = (n) => '$' + (n/1000000).toFixed(1) + 'M'
console.log(`\n=== Histórico 2026 según mi cálculo ===`)
console.log(`Cantidad proyectos: ${proy2026.length}`)
console.log(`Total facturado (Total): ${M(totalPresu)} (${totalPresu.toLocaleString('es-AR')})`)
console.log(`Subtotal (sin fee/imp): ${M(totalSubtotal)}`)
console.log(`Magma (Fee Agencia): ${M(totalMagma)}`)
console.log(`Imp. Ganancias: ${M(totalImpGan)}`)
console.log(`IIBB: ${M(totalIIBB)}`)
console.log(`Margen Magma/Total: ${margen}%`)

// Por mes
const porMes = {}
for (let m = 1; m <= 12; m++) porMes[m] = { cantidad: 0, presupuestado: 0, magma: 0 }
proy2026.forEach(r => {
  const fe = String(r[3] || '').split('/')
  const mes = parseInt(fe[1]) || 0
  if (!porMes[mes]) return
  porMes[mes].cantidad++
  porMes[mes].presupuestado += num(r[H('Total')] || r[H('Total ')])
  porMes[mes].magma += num(r[H('Fee Agencia')]) || num(r[H('Fee Final')])
})
console.log(`\n=== Por mes 2026 ===`)
const meses = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
Object.entries(porMes).filter(([m,d]) => d.cantidad > 0).forEach(([m, d]) => {
  console.log(`  ${meses[m]}: ${d.cantidad} proys · facturado ${M(d.presupuestado)} · magma ${M(d.magma)}`)
})
