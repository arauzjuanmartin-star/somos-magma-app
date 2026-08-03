import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const PRO=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS!A:CI',valueRenderOption:'FORMATTED_VALUE'})).data.values||[]
const H=PRO[0]
console.log('■ ¿Existen estas columnas?')
;['Total','Fee Final','Fee Agencia','Subtotal','Imp. Ganancias','IIBB','Ajuste','Diferencia'].forEach(n=>{
  const idx=H.map((h,i)=>txt(h)===n?i:-1).filter(i=>i>=0)
  console.log(`  ${n.padEnd(16)} ${idx.length?'col '+idx.join(', '):'\x1b[31mNO EXISTE\x1b[0m'}`)})

const iTot=H.findIndex(x=>txt(x)==='Total'), iFee=H.indexOf('Fee Agencia')
const iGan=H.indexOf('Imp. Ganancias'), iIIBB=H.indexOf('IIBB'), iAju=H.indexOf('Ajuste')
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const p={}
PRO.slice(1).forEach(r=>{const f=fecha(r[3]);if(!f||f.getFullYear()!==2026)return
  const n=txt(r[2]);if(!n)return
  const x=p[n]||={nro:n,nombre:txt(r[6]),total:0,fee:0,gan:0,iibb:0,aju:0,costo:0,propio:0}
  x.total=Math.max(x.total,num(r[iTot])); x.fee=Math.max(x.fee,num(r[iFee]))
  x.gan=Math.max(x.gan,num(r[iGan])); x.iibb=Math.max(x.iibb,num(r[iIIBB])); x.aju=num(r[iAju])||x.aju
  // el precio del pedido es costo AUNQUE no tenga staff asignado todavía
  PED.forEach(c=>{const pe=txt(r[c+2]),v=num(r[c+1]); if(!txt(r[c])||v<=1)return
    if(/somos magma/i.test(pe))x.propio+=v; else x.costo+=v})})
const ps=Object.values(p).filter(x=>x.total>0)
let ok=0,mal=[]
ps.forEach(x=>{ const suma=x.costo+x.propio+x.fee+x.gan+x.iibb+x.aju
  const d=Math.abs(suma-x.total); if(d<2)ok++; else mal.push({...x,suma,d}) })
console.log(`\n■ ¿Total = staff + fee + Ganancias + IIBB + Ajuste?`)
console.log(`  \x1b[32m${ok} de ${ps.length} cierran exacto\x1b[0m`)
if(mal.length){ console.log(`  \x1b[31m${mal.length} no cierran:\x1b[0m`)
  mal.sort((a,b)=>b.d-a.d).slice(0,8).forEach(x=>
    console.log(`     #${x.nro.padEnd(6)} ${x.nombre.slice(0,30).padEnd(32)} total ${M(x.total).padStart(13)}  suma ${M(x.suma).padStart(13)}  dif ${M(x.suma-x.total).padStart(12)}`)) }
const T=k=>ps.reduce((a,x)=>a+x[k],0)
console.log(`\n■ TODO 2026 desarmado:`)
;[['Costo de freelancers','costo'],['Staff propio (Somos Magma)','propio'],['Fee Agencia (queda en Magma)','fee'],['Impuesto a las Ganancias','gan'],['IIBB','iibb'],['Ajustes (descuentos/recargos)','aju']].forEach(([l,k])=>
  console.log(`  ${l.padEnd(32)}${M(T(k)).padStart(16)}${(T(k)/T('total')*100).toFixed(1).padStart(7)}%`))
console.log(`  ${'─'.repeat(55)}`)
console.log(`  ${'TOTAL'.padEnd(32)}${M(T('total')).padStart(16)}`)
console.log(`  ${'suma de las partes'.padEnd(32)}${M(T('costo')+T('propio')+T('fee')+T('gan')+T('iibb')+T('aju')).padStart(16)}`)
