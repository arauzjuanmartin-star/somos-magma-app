import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim(), num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS!A:CI','FACTURACION!A1:Z2000'],valueRenderOption:'FORMATTED_VALUE'})
const [PRO,FAC]=R.data.valueRanges.map(v=>v.values||[])
// agencia -> PM
const ag={}
PRO.slice(1).forEach(r=>{const f=fecha(r[3]); if(!f||f.getFullYear()!==2026||f.getMonth()>7)return
  const a=txt(r[4])||txt(r[5])||'(sin agencia)', pm=txt(r[51])||'(sin PM)', t=num(r[7])
  ag[a]=ag[a]||{n:0,$:0,pms:{}}; ag[a].n++; ag[a].$+=t; ag[a].pms[pm]=(ag[a].pms[pm]||0)+1 })
console.log('=== AGENCIAS/CLIENTES 2026 (ene-ago) por volumen, con PM dominante ===')
Object.entries(ag).sort((a,b)=>b[1].$-a[1].$).slice(0,22).forEach(([k,v])=>{
  const top=Object.entries(v.pms).sort((a,b)=>b[1]-a[1])
  console.log(k.slice(0,26).padEnd(27),String(v.n).padStart(3),'proy',M(v.$).padStart(15),' PM:',top.map(([p,c])=>`${p} ${c}`).join(' · '))})
// facturación pendiente
console.log('\n=== FACTURACION headers ===')
console.log((FAC[0]||[]).map((h,i)=>i+':'+h).join(' | '))
