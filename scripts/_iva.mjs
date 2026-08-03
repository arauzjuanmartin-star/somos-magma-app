import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['IVA_CONTROL!A1:L12','FACTURACION!A1:P3'],valueRenderOption:'FORMATTED_VALUE'})
const [IVA,FAC]=R.data.valueRanges.map(v=>v.values||[])
console.log('■ IVA_CONTROL:'); IVA.forEach((r,i)=>console.log(`  ${i===0?'HDR':String(i).padStart(3)} ${r.join(' ¦ ').slice(0,190)}`))
console.log('\n■ FACTURACION (headers + 2 filas):'); FAC.forEach((r,i)=>console.log(`  ${i===0?'HDR':String(i).padStart(3)} ${r.join(' ¦ ').slice(0,190)}`))
