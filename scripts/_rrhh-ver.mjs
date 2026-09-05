import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['RRHH!A1:Z80','SUELDOS!A1:N30'],valueRenderOption:'FORMATTED_VALUE'})
const col=n=>{let s='';n++;while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26)}return s}
const [RR,SU]=R.data.valueRanges.map(v=>v.values||[])
console.log(`=== RRHH (${RR.length} filas) ===`)
if(RR[0]) RR[0].forEach((h,i)=>{if(String(h).trim())console.log(`  ${col(i)}  ${h}`)})
console.log('\n  --- filas ---')
RR.slice(1).forEach((r,i)=>{ if(r.filter(Boolean).length) console.log(`  ${String(i+2).padStart(3)} | ${r.slice(0,9).join(' | ').slice(0,150)}`) })
console.log(`\n=== SUELDOS (${SU.length} filas) ===`)
if(SU[0]) console.log('  '+SU[0].filter(Boolean).join(' | '))
SU.slice(1,14).forEach(r=>{if(r.filter(Boolean).length)console.log('  '+r.slice(0,8).join(' | ').slice(0,150))})
