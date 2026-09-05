/** Explora qué solapas tienen info de cuenta bancaria (para dimensionar el volumen por banco). Solo lectura. */
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

const meta = await sheets.spreadsheets.get({spreadsheetId:ID})
const tabs = meta.data.sheets.map(s=>s.properties.title)
console.log('SOLAPAS:', tabs.join(' · '))
console.log()
for (const t of tabs) {
  try {
    const r = await sheets.spreadsheets.values.get({spreadsheetId:ID, range:`'${t}'!A1:BZ2`})
    const h = (r.data.values?.[0]||[]).filter(Boolean)
    const rel = h.filter(x=>/cuenta|banco|galicia|santander|bbva|entidad|cobro|forma/i.test(x))
    if (rel.length) console.log(`${t.padEnd(24)} → ${rel.join(' | ')}`)
  } catch(e){ console.log(`${t.padEnd(24)} ERR ${e.message.slice(0,50)}`) }
}
