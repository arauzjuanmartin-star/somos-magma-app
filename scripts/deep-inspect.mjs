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

const TABS = ['RESUMEN', 'BALANCE', 'Dashboard_data']

for (const tab of TABS) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`SOLAPA: ${tab}`)
  console.log('='.repeat(80))
  const [vals, fmls] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `'${tab}'!A1:T60` }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `'${tab}'!A1:T60`, valueRenderOption: 'FORMULA' }),
  ])
  const v = vals.data.values || []
  const f = fmls.data.values || []
  const maxRow = Math.max(v.length, f.length)
  for (let r = 0; r < maxRow; r++) {
    const row = v[r] || []
    const fmlRow = f[r] || []
    const hasContent = row.some(c => c && String(c).trim() !== '')
    if (!hasContent) continue
    const cols = row.map((c, i) => {
      const fml = fmlRow[i] || ''
      const isFormula = String(fml).startsWith('=')
      const text = String(c || '').slice(0, 25).padEnd(25)
      return isFormula ? `${text}(F)` : text
    }).join(' | ')
    console.log(`  ${String(r+1).padStart(3)}: ${cols}`)
    // si hay fórmulas, mostrarlas
    fmlRow.forEach((fml, i) => {
      if (String(fml || '').startsWith('=') && String(fml).length > 8) {
        const colLetter = String.fromCharCode(65+i)
        console.log(`         ${colLetter}${r+1} formula: ${String(fml).slice(0,180)}`)
      }
    })
  }
}
