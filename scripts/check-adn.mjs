import { google } from 'googleapis'
import { readFileSync } from 'fs'
readFileSync('.env.local','utf-8').split('\n').forEach(l => {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"|"$/g,'')
})

const auth = new google.auth.GoogleAuth({
  credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version: 'v4', auth })
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

const proy = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A1:BH2000' })
const headers = proy.data.values[0]
const filas = proy.data.values.slice(1)
const adn = filas.filter(r => /adn|beccar/i.test(String(r[5]||'') + ' ' + String(r[6]||'')))
console.log('=== PROYECTOS Adn/Beccar ===')
adn.forEach(r => {
  const obj = {}; headers.forEach((h, i) => obj[h] = r[i] || '')
  console.log(`#${r[0]} | Cli:${r[5]} | Proy:${r[6]} | Estado:${obj['Estado']} | FechaEv:${obj['Fecha Evento']} | Total:${obj['Total']||obj['Precio Final']}`)
})

const pres = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A1:BC2000' })
const hp = pres.data.values[0]
const fp = pres.data.values.slice(1)
const adnP = fp.filter(r => /adn|beccar/i.test(String(r[4]||'') + ' ' + String(r[5]||'') + ' ' + String(r[6]||'')))
console.log('\n=== PRESUPUESTOS Adn/Beccar ===')
adnP.forEach(r => {
  const obj = {}; hp.forEach((h, i) => obj[h] = r[i] || '')
  console.log(`#${r[0]} | Cli:${obj['Cliente']} | Ag:${obj['Agencia']} | Proy:${obj['Proyecto']} | Estado:${obj['Estado']} | PF:${obj['Precio Final']} | Total:${obj['Total']} | FechaEv:${obj['Fecha Evento']}`)
})

const fac = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A1:AG500' })
const hf = fac.data.values[0]
const ff = fac.data.values.slice(1)
console.log('\n=== FACTURACION Headers ===')
console.log(hf.join(' | '))
const adnF = ff.filter(r => /adn|beccar/i.test(r.join(' ')))
console.log('\n=== FACTURACION Adn/Beccar ===')
adnF.forEach(r => {
  const obj = {}; hf.forEach((h, i) => obj[h] = r[i] || '')
  console.log(JSON.stringify(obj))
})
