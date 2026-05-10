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

const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A1:BH5' })
const rows = r.data.values || []
const headers = rows[0] || []

console.log(`PROYECTOS tiene ${headers.length} headers:`)
headers.forEach((h, i) => {
  const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }
  console.log(`  ${colLetra(i).padEnd(3)} (${i}): ${h}`)
})

console.log('\nFila 2 ejemplo:')
const row = rows[1] || []
row.forEach((v, i) => {
  if (v) {
    const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }
    console.log(`  ${colLetra(i)}: ${v}`)
  }
})
