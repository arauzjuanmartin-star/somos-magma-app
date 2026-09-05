import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const R=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'RRHH!A1:P80',valueRenderOption:'FORMATTED_VALUE'})
const V=R.data.values||[]
const H=V[0]
console.log('Persona'.padEnd(34), 'TarifaMedia'.padEnd(13), 'TarifaJorn'.padEnd(13), 'Zona'.padEnd(10),'Estado'.padEnd(10),'Notas')
let conTarifa=0
for(const r of V.slice(1)){
  if(!String(r[0]||'').trim()) continue
  const [t1,t2,zona,estado,notas]=[r[11],r[12],r[13],r[14],r[15]].map(x=>String(x??'').trim())
  if(t1||t2||zona||estado||notas){ conTarifa++
    console.log(String(r[0]).slice(0,33).padEnd(34), (t1||'—').padEnd(13), (t2||'—').padEnd(13), (zona||'—').padEnd(10),(estado||'—').padEnd(10),(notas||'').slice(0,40)) }
}
console.log(`\n${conTarifa} de ${V.length-1} filas tienen algo en L–P (tarifa/zona/estado/notas)`)
