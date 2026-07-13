// Crea la solapa WHATSAPP (bandeja: mensajes entrantes y salientes). Idempotente.
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env = Object.fromEntries(
  readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
    const i=l.indexOf('='); let v=l.slice(i+1).trim()
    if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1)
    return [l.slice(0,i).trim(),v]
  })
)
const auth = new google.auth.GoogleAuth({ credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')}, scopes:['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({version:'v4',auth})
const SHEET_ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

const meta = await sheets.spreadsheets.get({spreadsheetId:SHEET_ID, fields:'sheets(properties(title))'})
const existe = meta.data.sheets.some(s=>s.properties.title==='WHATSAPP')
if(existe){ console.log('Solapa WHATSAPP: ya existe'); }
else {
  await sheets.spreadsheets.batchUpdate({spreadsheetId:SHEET_ID, requestBody:{requests:[{addSheet:{properties:{title:'WHATSAPP'}}}]}})
  const H=['Timestamp','Fecha','Hora','Direccion','Telefono','Nombre','Mensaje','Tipo','WA Message ID','Estado','Respondido','Notas']
  await sheets.spreadsheets.values.update({spreadsheetId:SHEET_ID, range:'WHATSAPP!A1', valueInputOption:'RAW', requestBody:{values:[H]}})
  console.log('Solapa WHATSAPP: creada con headers')
}
console.log('✅ listo')
