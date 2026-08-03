import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const PRO=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS!A:CI',valueRenderOption:'FORMATTED_VALUE'})).data.values||[]
const H=PRO[0]
console.log('■ Todas las columnas de PROYECTOS con nombre:\n')
H.forEach((h,i)=>{ if(txt(h)) console.log(`  ${String(i).padStart(3)} ${h}`) })
const fila=PRO.find((r,i)=>i>0&&txt(r[2])==='2029')
console.log('\n■ Proyecto #2029 (Llama Que Llama) — TODOS sus campos con valor:\n')
fila.forEach((v,i)=>{ if(txt(v)&&txt(v)!=='0'&&txt(v)!=='$0.00') console.log(`  ${String(i).padStart(3)} ${String(H[i]||'?').slice(0,30).padEnd(32)} ${v}`) })
