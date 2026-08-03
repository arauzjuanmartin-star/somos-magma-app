/**
 * Ajustes de julio según la clasificación que pasó Juan el 03/08/2026.
 *  1) Master Galicia: de Venti Tickets ($120.750) solo $38.000 son de Sofi; el resto es de Magma.
 *  2) BBVA: Juan pasó la lista de lo que es personal de cada uno → todo lo demás es de Magma.
 * Sin --escribir solo muestra el preview.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const M=n=>'$'+n.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})
const num=v=>{const s=String(v??'').replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const r2=n=>Math.round(n*100)/100

// lo que Juan marcó como PERSONAL en la BBVA (todo lo demás sería de Magma)
const PERS_BBVA=[
  [/MERPAGO\*CHIPOTE/i,'Juan'], [/MERPAGO\*MERCADOLIBRE/i,'Juan'], [/^TOPPER/i,'Juan'],
  [/MERPAGO\*PASAJESCDP/i,'Juan'], [/^EQUUS/i,'Juan'], [/^NETFLIX/i,'Juan'],
  [/EL MUNDO DEL JUGUETE/i,'Juan'], [/MERPAGO\*DMO/i,'Juan'],
  [/MERPAGO\*FLORIAN/i,'Sofi'], [/MERPAGO\*LUBOLOQUE/i,'Sofi'], [/^47 STREET/i,'Sofi'],
  [/^ZARA/i,'Sofi'], [/^LAS PEPAS/i,'Sofi'], [/MERPAGO\*TOYOTATREOS/i,'Sofi'], [/MERPAGO\*MISHKA/i,'Sofi'],
]
const MT=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'MOVIMIENTOS_TARJETA!A:L'})).data.values||[]
const jul=MT.map((r,i)=>({r,fila:i+1})).filter(({r},i)=>i>0&&String(r[1])==='7'&&String(r[2]).includes('2026'))

console.log('\n\x1b[1m■ 1) MASTER GALICIA — Venti Tickets\x1b[0m')
jul.filter(x=>x.r[0]==='Master Galicia'&&/venti/i.test(x.r[5]||'')).forEach(x=>
  console.log(`   fila ${x.fila}: ${x.r[5]} ${M(num(x.r[7])).padStart(14)} · ${x.r[8]}`))
console.log(`   → queda: $38.000,00 Personal de Sofi  +  $82.750,00 Empresa`)

console.log('\n\x1b[1m■ 2) BBVA — qué cambia con tu lista\x1b[0m')
const bbva=jul.filter(x=>x.r[0]==='BBVA Visa'&&x.r[4]!=='Magma')
const aEmpresa=[], aPersonal=[]
bbva.forEach(x=>{
  const hit=PERS_BBVA.find(([rx])=>rx.test(String(x.r[5]||'')))
  const esPersonalAhora=String(x.r[8]).trim()==='Personal'
  if(hit&&!esPersonalAhora) aPersonal.push({...x, quien:hit[1]})
  if(!hit&&esPersonalAhora)  aEmpresa.push(x)
})
const sEmp=aEmpresa.reduce((a,x)=>a+(x.r[6]==='ARS'?num(x.r[7]):0),0)
const sPer=aPersonal.reduce((a,x)=>a+(x.r[6]==='ARS'?num(x.r[7]):0),0)
console.log(`\n   \x1b[36mPasarían de Personal → EMPRESA: ${aEmpresa.length} movimientos · ${M(r2(sEmp))}\x1b[0m`)
const porTipo={}
aEmpresa.forEach(x=>{const c=String(x.r[5])
  const t=/rappi|pedidosya/i.test(c)?'Delivery':/dia tienda|super|prospero|cramer/i.test(c)?'Supermercado'
    :/pedrera|pollo|mc donalds|res cris|gato|brooklyn|anchorena|passline|venti/i.test(c)?'Restaurantes y salidas'
    :/rouge/i.test(c)?'Cuota Rouge':/merpago/i.test(c)?'MercadoPago a personas':'Otros'
  porTipo[t]=(porTipo[t]||0)+(x.r[6]==='ARS'?num(x.r[7]):0)})
Object.entries(porTipo).sort((a,b)=>b[1]-a[1]).forEach(([t,v])=>console.log(`      ${t.padEnd(26)} ${M(r2(v)).padStart(14)}`))
if(aPersonal.length){
  console.log(`\n   \x1b[33mVolverían de Empresa → PERSONAL: ${aPersonal.length} · ${M(r2(sPer))}\x1b[0m`)
  aPersonal.forEach(x=>console.log(`      ${x.r[3]} ${String(x.r[5]).slice(0,40).padEnd(42)} ${M(num(x.r[7])).padStart(14)} → ${x.quien}`))
}
console.log(`\n   \x1b[1mPersonal de la BBVA quedaría en ${M(r2(bbva.filter(x=>{const h=PERS_BBVA.find(([rx])=>rx.test(String(x.r[5]||''))); return h&&x.r[6]==='ARS'}).reduce((a,x)=>a+num(x.r[7]),0)))} (hoy son ${M(r2(bbva.filter(x=>String(x.r[8]).trim()==='Personal'&&x.r[6]==='ARS').reduce((a,x)=>a+num(x.r[7]),0)))})\x1b[0m`)
