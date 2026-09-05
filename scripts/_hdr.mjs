import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const s=google.sheets({version:'v4',auth})
const R=await s.spreadsheets.values.get({spreadsheetId:'1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc',range:'PROYECTOS!A1:ET2'})
const h=R.data.values[0], r=R.data.values[1]
h.forEach((x,i)=>{ if(i>=10&&i<=30 || (x&&/pedido|staff|precio/i.test(x)&&i<95)) console.log(`  ${String(i).padStart(3)} ${String(x).padEnd(22)} ej: ${String(r[i]??'').slice(0,28)}`) })
console.log('\nvalores crudos vs formateados de un monto:')
const F=await s.spreadsheets.values.get({spreadsheetId:'1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc',range:'ACUERDOS!H2:H3',valueRenderOption:'FORMATTED_VALUE'})
const U=await s.spreadsheets.values.get({spreadsheetId:'1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc',range:'ACUERDOS!H2:H3',valueRenderOption:'UNFORMATTED_VALUE'})
console.log('  FORMATTED  :', JSON.stringify(F.data.values))
console.log('  UNFORMATTED:', JSON.stringify(U.data.values))
