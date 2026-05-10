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

const NEW_FORMULA = '=IF(D5<>"",D5,MAX(FILTER(PRESUPUESTOS!A2:A, ISNUMBER(PRESUPUESTOS!A2:A)))+1)'
const tabs = ['CARGA DATOS 1', 'CARGA DATOS 2', 'CARGA DATOS 3']

for (const tab of tabs) {
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${tab}!C5`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[NEW_FORMULA]] },
    })
    console.log(`✓ ${tab}: actualizado`)
  } catch (e) {
    console.log(`✗ ${tab}: ${e.errors?.[0]?.message || e.message}`)
  }
}

console.log('\n--- Estado final ---')
for (const tab of tabs) {
  const [vals, fmls] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${tab}!C5:D5` }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${tab}!C5:D5`, valueRenderOption: 'FORMULA' }),
  ])
  const v = (vals.data.values || [[]])[0] || []
  const f = (fmls.data.values || [[]])[0] || []
  console.log(`${tab}: C5=${v[0]} | D5(manual)=${v[1]||'(vacio)'}`)
  console.log(`  formula C5: ${f[0]}`)
}
