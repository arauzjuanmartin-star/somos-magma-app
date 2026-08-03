/**
 * Completa la solapa TARJETAS de julio 2026: titular, vencimiento y el desglose
 * de cuánto del resumen es de la empresa y cuánto de cada socio.
 * Los tres resúmenes cierran el 30/07 y vencen el 07/08.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const num=v=>{const s=String(v??'').replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const colLetra=c=>{let s='',n=c+1;while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26)}return s}

const TITULAR={ 'BBVA Visa':'Magma (SRL)', 'Master Galicia':'Sofi (adic. Juan)', 'Santander Visa':'Sofi (adic. Juan)' }
const VTO='07/08/2026'

const [T,MT]=(await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['TARJETAS!A:N','MOVIMIENTOS_TARJETA!A:L'],valueRenderOption:'FORMATTED_VALUE'})).data.valueRanges.map(v=>v.values||[])
const th=T[0], TH=n=>th.indexOf(n)
const jul=MT.slice(1).filter(r=>String(r[1])==='7'&&String(r[2]).includes('2026')&&r[6]==='ARS')

const data=[], resumen=[]
T.forEach((row,i)=>{ if(i===0)return
  const tj=String(row[0]||'').trim()
  if(!TITULAR[tj]||String(row[TH('Mes')]).trim()!=='7'||!String(row[TH('Año')]).includes('2026'))return
  const de=f=>jul.filter(r=>r[0]===tj&&f(r)).reduce((a,r)=>a+num(r[7]),0)
  const emp=de(r=>r[8]==='Empresa'), pj=de(r=>r[8]==='Personal'&&r[4]==='Juan'), ps=de(r=>r[8]==='Personal'&&r[4]==='Sofi')
  const nota=`Titular ${TITULAR[tj]}. Cierre 30/07, vence 07/08. Del resumen: empresa ${M(emp)} · personal de Juan ${M(pj)} · personal de Sofi ${M(ps)}.`
  const set=(n,v)=>{ if(TH(n)!==-1) data.push({range:`TARJETAS!${colLetra(TH(n))}${i+1}`, values:[[v]]}) }
  set('Persona',TITULAR[tj]); set('Vencimiento',VTO); set('Notas',nota)
  resumen.push({tj, fila:i+1, monto:num(row[TH('Monto')]), usd:num(row[TH('Monto USD')]), emp, pj, ps})
})
await sheets.spreadsheets.values.batchUpdate({spreadsheetId:ID,requestBody:{valueInputOption:'USER_ENTERED',data}})

console.log(`\n\x1b[1m■ TARJETAS — julio 2026 (todas vencen ${VTO})\x1b[0m\n`)
console.log(`  ${'tarjeta'.padEnd(17)}${'titular'.padEnd(20)}${'a pagar'.padStart(15)}${'empresa'.padStart(15)}${'Juan'.padStart(15)}${'Sofi'.padStart(13)}`)
let a=0,b=0,c=0,d=0
resumen.forEach(r=>{ a+=r.monto;b+=r.emp;c+=r.pj;d+=r.ps
  console.log(`  ${r.tj.padEnd(17)}${TITULAR[r.tj].padEnd(20)}${M(r.monto).padStart(15)}${M(r.emp).padStart(15)}${M(r.pj).padStart(15)}${M(r.ps).padStart(13)}`)})
console.log(`  ${'─'.repeat(95)}`)
console.log(`  ${'TOTAL A PAGAR EL 07/08'.padEnd(37)}${M(a).padStart(15)}${M(b).padStart(15)}${M(c).padStart(15)}${M(d).padStart(13)}`)
console.log(`\n  Los movimientos quedaron en MOVIMIENTOS_TARJETA con el titular en cada fila —`)
console.log(`  la app los agrupa por persona y se pueden pasar de 👤 a 🏢 con un toque.\n`)
