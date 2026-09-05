import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;let s=txt(v).replace(/[^\d.,-]/g,'');if(!s)return 0;if(s.includes(',')&&s.includes('.')){s=s.replace(/,/g,'')}else if(s.includes(',')){s=s.replace(/\./g,'').replace(',','.')}else{s=s.replace(/,/g,'')}const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS!A:CI'],valueRenderOption:'FORMATTED_VALUE'})
const PRO=R.data.valueRanges[0].values||[]
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const MESES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
console.log('── Staff de los proyectos de MANI KING 2026')
PRO.slice(1).forEach(r=>{const f=fecha(r[3]); if(!f||f.getFullYear()!==2026)return
  if(!/mani\s*king|infinity/i.test(txt(r[4])+' '+txt(r[5])))return
  const l=PED.map(c=>({ped:txt(r[c]),pr:num(r[c+1]),st:txt(r[c+2])})).filter(x=>x.ped)
  console.log(`${MESES[f.getMonth()]}  ${txt(r[6]).slice(0,34).padEnd(35)}`)
  l.forEach(x=>console.log(`      ${x.ped.replace(/[^\wáéíóúñ½ ]/g,'').trim().padEnd(14)} ${M(x.pr).padStart(12)}  ${x.st}`))})
console.log('\n── Todo lo que cobró alguien llamado Sol/Solci/Soledad en 2026')
let tot=0,n=0
PRO.slice(1).forEach(r=>{const f=fecha(r[3]); if(!f||f.getFullYear()!==2026)return
  PED.forEach(c=>{const st=txt(r[c+2]); if(!/gigena|solange/i.test(st))return
    const pr=num(r[c+1]); if(pr<=1)return; tot+=pr; n++
    console.log(`  ${MESES[f.getMonth()]}  ${txt(r[4]).slice(0,18).padEnd(19)} ${txt(r[c]).replace(/[^\wáéíóúñ½ ]/g,'').trim().padEnd(12)} ${M(pr).padStart(11)}  ${st}`)})})
console.log(`  → ${n} líneas · ${M(tot)}`)
