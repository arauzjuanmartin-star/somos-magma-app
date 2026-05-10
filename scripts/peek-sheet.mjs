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

const tabs = ['CARGA DATOS 1', 'CARGA DATOS 2', 'CARGA DATOS 3']
for (const tab of tabs) {
  console.log(`\n===== ${tab} =====`)
  const [vals, fmls] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${tab}!A1:H10` }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${tab}!A1:H10`, valueRenderOption: 'FORMULA' }),
  ])
  const v = vals.data.values || []
  const f = fmls.data.values || []
  for (let r = 0; r < Math.max(v.length, f.length); r++) {
    for (let c = 0; c < 8; c++) {
      const val = (v[r]||[])[c]
      const fml = (f[r]||[])[c]
      if (!val && !fml) continue
      const cellRef = String.fromCharCode(65+c) + (r+1)
      if (fml && String(fml).startsWith('=')) {
        console.log(`  ${cellRef}: [VALOR=${val}] [FORMULA=${fml}]`)
      } else if (val) {
        console.log(`  ${cellRef}: ${val}`)
      }
    }
  }
}
