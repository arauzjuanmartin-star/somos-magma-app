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

const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A1:BH500' })
const rows = r.data.values || []
const headers = rows[0]

console.log('=== Buscando #1857 y #1141v2 en PROYECTOS ===\n')
let count = 0
for (let i = 1; i < rows.length; i++) {
  const nro = String(rows[i][2] || '')
  if (nro === '1857' || nro === '1141v2') {
    count++
    console.log(`--- Fila ${i+1}, #${nro} ---`)
    rows[i].forEach((v, j) => {
      if (v !== '' && v !== undefined) console.log(`  ${colLetra(j)} (${headers[j]||'?'}): ${v}`)
    })
    console.log()
  }
}
console.log(`Total filas encontradas: ${count}`)

// Búsqueda alternativa: cualquier fila con valores idénticos en columnas clave
const presu1141 = rows.find(r => String(r[2]) === '1141v2')
const presu1857 = rows.find(r => String(r[2]) === '1857')
if (presu1141 && presu1857) {
  console.log('Comparando lado a lado columnas H,I,K,BA,BG:')
  console.log(`  #1141v2: H=${presu1141[7]} I=${presu1141[8]} K=${presu1141[10]} BA=${presu1141[52]} BG=${presu1141[58]}`)
  console.log(`  #1857:   H=${presu1857[7]} I=${presu1857[8]} K=${presu1857[10]} BA=${presu1857[52]} BG=${presu1857[58]}`)
}
