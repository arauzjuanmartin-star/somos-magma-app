import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const meta=await sheets.spreadsheets.get({spreadsheetId:ID,fields:'sheets(properties(title))'})
const solapas=meta.data.sheets.map(s=>s.properties.title)
const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:solapas,valueRenderOption:'FORMATTED_VALUE'})
console.log('\n■ Dónde aparece "1891":\n')
R.data.valueRanges.forEach((v,i)=>{ const rows=v.values||[]
  rows.forEach((r,ri)=>{ if(ri===0)return
    if((r||[]).some(c=>txt(c)==='1891')) console.log(`  \x1b[1m${solapas[i]}\x1b[0m fila ${ri+1}: ${(r||[]).filter(Boolean).join(' ¦ ').slice(0,150)}`) })})
