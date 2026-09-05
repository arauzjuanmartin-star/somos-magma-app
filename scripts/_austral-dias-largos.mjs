import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { SLOT_PROY, MAX_SLOTS } from '../lib/slots.js'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[$\s]/g,'').replace(/,/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const R=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS!A:ER',valueRenderOption:'FORMATTED_VALUE'})
const P=R.data.values||[]
const ES_COB=s=>/film|foto|video|drone|dron/i.test(s)&&!/edit/i.test(s)
const dias={}
for(const r of P.slice(1)){
  const f=txt(r[3]); const m=f.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if(!m) continue
  let y=+m[3]; if(y<100)y+=2000; if(y!==2026) continue
  if(!/austral/i.test(txt(r[5]))&&!/austral/i.test(txt(r[4]))) continue
  const key=`${String(m[1]).padStart(2,'0')}/${String(m[2]).padStart(2,'0')}`
  for(let n=1;n<=MAX_SLOTS;n++){const s=SLOT_PROY(n);const sv=txt(r[s.pedido]);if(!sv||!ES_COB(sv))continue
    ;(dias[key] ||= []).push({nro:txt(r[2]),proy:txt(r[6]),serv:sv,costo:num(r[s.precio]),quien:txt(r[s.staff])})}
}
console.log('\n  DÍAS DE AUSTRAL CON MÁS DE UNA COBERTURA (2026)')
console.log('  '+'─'.repeat(74))
let n2=0, tot=0
for(const [d,v] of Object.entries(dias).sort()){
  tot++
  if(v.length<2) continue
  n2++
  console.log(`\n  ${d}  →  ${v.length} coberturas · ${M(v.reduce((s,x)=>s+x.costo,0))}`)
  v.forEach(x=>console.log(`      #${x.nro.padEnd(5)} ${x.proy.slice(0,44).padEnd(44)} ${x.serv.padEnd(12)} ${M(x.costo).padStart(10)}  ${x.quien}`))
}
console.log(`\n  ${n2} de ${tot} días de evento tuvieron 2+ coberturas (${(100*n2/tot).toFixed(0)}%)`)
