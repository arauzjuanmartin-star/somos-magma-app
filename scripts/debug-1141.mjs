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

const rP = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A1:AV2000' })
const presuRows = rP.data.values || []
const presuHeaders = presuRows[0]
console.log('=== PRESUPUESTOS #1141v2 ===')
for (let i = 1; i < presuRows.length; i++) {
  if (String(presuRows[i][0]) === '1141v2') {
    presuRows[i].forEach((v, j) => {
      if (v !== '' && v !== undefined) console.log(`  ${colLetra(j)} (${presuHeaders[j]||'?'}): ${v}`)
    })
    console.log('  AM Subtotal:', presuRows[i][38], '| AN Fee:', presuRows[i][39], '| AO ImpGan:', presuRows[i][40], '| AP IIBB:', presuRows[i][41], '| AT Total:', presuRows[i][45], '| AU Ajuste:', presuRows[i][46], '| I PrecioFinal:', presuRows[i][8])
    break
  }
}

const rPry = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A1:BH500' })
const proyRows = rPry.data.values || []
const proyHeaders = proyRows[0]
console.log('\n=== PROYECTOS #1141v2 ===')
for (let i = 1; i < proyRows.length; i++) {
  if (String(proyRows[i][2]) === '1141v2') {
    proyRows[i].forEach((v, j) => {
      if (v !== '' && v !== undefined) console.log(`  ${colLetra(j)} (${proyHeaders[j]||'?'}): ${v}`)
    })
    break
  }
}
