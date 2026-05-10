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

const meta = await sheets.spreadsheets.get({
  spreadsheetId: SHEET_ID,
  fields: 'sheets(properties(title,sheetId,gridProperties))',
})

const tabs = meta.data.sheets.map(s => s.properties.title)
console.log(`\nTotal solapas: ${tabs.length}\n`)

for (const tab of tabs) {
  try {
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${tab}'!A1:AZ500`,
    })
    const rows = r.data.values || []
    const dataRows = rows.slice(1).filter(r => r.some(c => c && String(c).trim() !== ''))
    const headers = (rows[0] || []).filter(h => h && String(h).trim() !== '')
    const colsUsadas = headers.length
    console.log(`${tab.padEnd(28)} | filas: ${String(dataRows.length).padStart(4)} | cols con header: ${colsUsadas}`)
    if (headers.length && headers.length <= 12) {
      console.log(`   headers: ${headers.slice(0,12).join(' | ')}`)
    } else if (headers.length) {
      console.log(`   headers: ${headers.slice(0,8).join(' | ')} ... (+${headers.length-8} más)`)
    }
  } catch (e) {
    console.log(`${tab.padEnd(28)} | ERROR: ${e.message}`)
  }
}
