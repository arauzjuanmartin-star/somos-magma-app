/** Lee GASTOS_FIJOS y muestra todo lo bancario/financiero cargado. Solo lectura. */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env = Object.fromEntries(
  readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
    const i=l.indexOf('='); let v=l.slice(i+1).trim()
    if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1)
    return [l.slice(0,i).trim(),v]
  })
)
const auth = new google.auth.GoogleAuth({
  credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},
  scopes:['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

const r = await sheets.spreadsheets.values.get({spreadsheetId:ID, range:'GASTOS_FIJOS!A1:Z200'})
const rows = r.data.values||[]
console.log('HEADERS:', JSON.stringify(rows[0]))
console.log('filas:', rows.length-1)
console.log('---- TODAS LAS FILAS ----')
rows.slice(1).forEach((f,i)=>console.log(String(i+2).padStart(4), f.join(' | ')))
