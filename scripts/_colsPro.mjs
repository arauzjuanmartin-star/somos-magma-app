import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const H=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS!A1:CI1'})).data.values[0]||[]
console.log('PROYECTOS — columnas desde la 48 (después de los pedidos):')
H.forEach((h,i)=>{ if(i>=48&&String(h||'').trim()) console.log(`  ${String(i).padStart(3)} ${h}`)})
console.log('\n¿hay alguna de notas/estado/observaciones?')
;['Observaciones','Notas','Estado','Facturable','Nota'].forEach(n=>console.log(`  ${n}: ${H.indexOf(n)>=0?'col '+H.indexOf(n):'no existe'}`))
