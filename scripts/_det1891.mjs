import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS!A:CI','Pagos_Staff!A:K','PRESUPUESTOS!A:BZ','FACTURACION!A:V'],valueRenderOption:'FORMATTED_VALUE'})
const [PRO,PS,PRE,FAC]=R.data.valueRanges.map(v=>v.values||[])
const p=PRO.find((r,i)=>i>0&&txt(r[2])==='1891')
console.log('\n■ PROYECTOS fila 102 — campos con valor:')
p.forEach((v,i)=>{ if(txt(v)&&txt(v)!=='$0.00'&&txt(v)!=='0') console.log(`   ${String(PRO[0][i]||'col'+i).slice(0,26).padEnd(28)} ${v}`)})
console.log('\n■ Pagos_Staff fila 836:')
const s=PS.find((r,i)=>i>0&&txt(r[3])==='1891')
s.forEach((v,i)=>{ if(txt(v)) console.log(`   ${String(PS[0][i]||'col'+i).slice(0,26).padEnd(28)} ${v}`)})
console.log('\n■ ¿está en PRESUPUESTOS?  ' + (PRE.some((r,i)=>i>0&&txt(r[0])==='1891') ? 'SÍ' : '\x1b[31mNO\x1b[0m'))
console.log('■ ¿está en FACTURACION?   ' + (FAC.some((r,i)=>i>0&&txt(r[1])==='1891') ? 'SÍ' : '\x1b[31mNO — nunca se facturó\x1b[0m'))
