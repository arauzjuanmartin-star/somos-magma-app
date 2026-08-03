import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const PRO=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS!A:CI',valueRenderOption:'FORMATTED_VALUE'})).data.values||[]
const H=PRO[0]
for(const nro of ['1861','1856','1934']){
  const r=PRO.find((x,i)=>i>0&&txt(x[2])===nro); if(!r)continue
  const ped=[]; [11,14,17,20,23,26,29,32,35,38,41,44,47].forEach(c=>{ if(txt(r[c])) ped.push([txt(r[c]),num(r[c+1]),txt(r[c+2])]) })
  const costo=ped.reduce((a,p)=>a+p[1],0)
  const tot=num(r[7]), fee=num(r[10]), sub=num(r[52]), gan=num(r[53]), iibb=num(r[54]), aju=num(r[59])
  console.log(`\n\x1b[1m#${nro} · ${txt(r[4])} · ${txt(r[6])}\x1b[0m`)
  ped.forEach(p=>console.log(`   ${p[0].padEnd(14)} ${M(p[1]).padStart(12)}  ${p[2]||'(sin staff)'}`))
  console.log(`   ${'suma pedidos'.padEnd(14)} ${M(costo).padStart(12)}`)
  console.log(`   ${'Subtotal'.padEnd(14)} ${M(sub).padStart(12)}   ${Math.abs(sub-costo)<1?'\x1b[32m= suma pedidos ✓\x1b[0m':'\x1b[31m≠ suma pedidos ('+M(sub-costo)+')\x1b[0m'}`)
  console.log(`   ${'Fee Agencia'.padEnd(14)} ${M(fee).padStart(12)}`)
  console.log(`   ${'Ganancias'.padEnd(14)} ${M(gan).padStart(12)}   ${(gan/fee*100).toFixed(1)}% del fee`)
  console.log(`   ${'IIBB'.padEnd(14)} ${M(iibb).padStart(12)}   ${(iibb/fee*100).toFixed(1)}% del fee`)
  console.log(`   ${'Ajuste'.padEnd(14)} ${M(aju).padStart(12)}`)
  console.log(`   ${'TOTAL'.padEnd(14)} ${M(tot).padStart(12)}`)
  console.log(`   \x1b[33msuma de partes ${M(costo+fee+gan+iibb+aju)} → descuadre ${M(costo+fee+gan+iibb+aju-tot)}\x1b[0m`)
  // ¿el total cierra si el fee ya incluyera los impuestos?
  console.log(`   sin sumar impuestos: ${M(costo+fee+aju)} → ${Math.abs(costo+fee+aju-tot)<1?'\x1b[32mCIERRA ✓\x1b[0m':'no'}`)
}
