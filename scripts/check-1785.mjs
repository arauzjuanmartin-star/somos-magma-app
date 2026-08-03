import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PRESUPUESTOS',valueRenderOption:'FORMATTED_VALUE'})
const rows=r.data.values||[]
console.log('=== Toda fila cuyo N° sea 1785 o 1785vN ===')
rows.forEach((row,ri)=>{ if(ri===0)return; const n=txt(row[0])
  if(n==='1785'||/^1785v/i.test(n)) console.log(`  fila ${ri+1}: N°=${n} | Estado=${txt(row[3])} | ${txt(row[4])} ${txt(row[5])} ${txt(row[6])} | $${txt(row[8])} | presu ${txt(row[9])}`)
})
// conteo de duplicados general
const cont={}
rows.slice(1).forEach(row=>{const n=txt(row[0]);if(n)cont[n]=(cont[n]||0)+1})
const dups=Object.entries(cont).filter(([n,c])=>c>1&&/^\d+$/.test(n)).sort((a,b)=>b[1]-a[1])
console.log(`\n=== N° duplicados (numéricos): ${dups.length} ===`)
dups.slice(0,20).forEach(([n,c])=>console.log(`  ${n} aparece ${c} veces`))
console.log(`\n¿1785 está duplicado? -> ${cont['1785']||0} veces`)
