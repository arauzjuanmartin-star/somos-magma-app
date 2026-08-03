import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PRESUPUESTOS',valueRenderOption:'FORMATTED_VALUE'})
const rows=r.data.values||[]
const H=rows[0]
console.log('HEADERS:')
H.forEach((h,i)=>{ if(txt(h)) console.log(`  [${i}] ${txt(h)}`) })
console.log('\n=== FILAS QUE MENCIONAN MERCURIA ===')
rows.forEach((row,ri)=>{
  if(ri===0) return
  if(row.some(c=>/mercuria/i.test(txt(c)))){
    console.log(`\n--- fila ${ri+1} (índice ${ri}) ---`)
    row.forEach((c,ci)=>{ if(txt(c)) console.log(`  [${ci}] ${txt(H[ci])||'?'} = ${txt(c)}`) })
  }
})
