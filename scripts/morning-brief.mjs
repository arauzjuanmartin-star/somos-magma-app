/**
 * Morning Brief — radar del día para Juan. Solo lectura.
 *   node scripts/morning-brief.mjs           → el texto de siempre (/brief)
 *   node scripts/morning-brief.mjs --json    → los mismos datos estructurados (los usa scripts/diaria.mjs)
 * La lógica vive en lib/brief.mjs, compartida con la página /diaria de la app.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { calcularBrief, briefMarkdown } from '../lib/brief.mjs'

const env = Object.fromEntries(
  readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
    const i=l.indexOf('='); let v=l.slice(i+1).trim()
    if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1)
    return [l.slice(0,i).trim(),v]
  })
)
const auth = new google.auth.GoogleAuth({
  credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},
  scopes:['https://www.googleapis.com/auth/spreadsheets.readonly'],
})
const sheets = google.sheets({version:'v4',auth})
const ID = env.SHEET_ID || '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

// una sola llamada para las 4 solapas (cuidar cuota de Google)
const r = await sheets.spreadsheets.values.batchGet({
  spreadsheetId: ID,
  ranges: ['PRESUPUESTOS','PROYECTOS','FACTURACION','RRHH'],
  valueRenderOption: 'FORMATTED_VALUE',
})
const [PRE, PRO, FAC, RH] = r.data.valueRanges.map(v => v.values||[])
const d = calcularBrief({ PRE, PRO, FAC, RH })

if (process.argv.includes('--json')) console.log(JSON.stringify(d))
else console.log('\n' + briefMarkdown(d) + '\n')
