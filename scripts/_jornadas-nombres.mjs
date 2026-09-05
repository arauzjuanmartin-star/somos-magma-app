import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['RRHH!A:Z','PROYECTOS!A:ET']})
const [RR,PRO]=R.data.valueRanges.map(v=>v.values||[])
console.log('RRHH headers:', (RR[0]||[]).map((x,i)=>`${i}:${x}`).join(' | '))
console.log('\n--- fichas que matchean lucho/chavez/cuglio/juani ---')
RR.slice(1).forEach((r,i)=>{ const s=r.join(' '); if(/lucho|chav|cuglio|juani/i.test(s)) console.log(`fila ${i+2}:`, JSON.stringify(r.slice(0,10))) })

const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const cnt={}
PRO.slice(1).forEach(r=>{ PED.forEach(i=>{ const st=txt(r[i+2]); if(st) cnt[st]=(cnt[st]||0)+1 }) })
console.log('\n--- nombres de staff en PROYECTOS (top 30) ---')
Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,30).forEach(([n,c])=>console.log(`  ${String(c).padStart(4)}  ${n}`))
