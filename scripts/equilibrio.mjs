/**
 * Punto de equilibrio con la estructura SEPARADA: lo que se repite todos los meses
 * contra lo que se paga una sola vez. Mezclarlos infla el equilibrio.
 * Pedido de la reunión del 02/08 (Sofi: "recalcular cuando los gastos estén bien categorizados").
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const yes=v=>/^(s[ií]|true|x|✓)$/i.test(txt(v))
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['GASTOS_FIJOS!A:H','PROYECTOS!A:CI'],valueRenderOption:'FORMATTED_VALUE'})
const [G,PRO]=R.data.valueRanges.map(v=>v.values||[])
const h=G[0], C=n=>h.indexOf(n)
let mensual=0, unico=0
G.slice(1).forEach(r=>{ if(!r||!txt(r[C('Concepto')])||!yes(r[C('Activo')]))return
  if(txt(r[C('Moneda')]||'ARS').toUpperCase().includes('USD'))return
  const fr=txt(r[C('Frecuencia')]||'mensual').toLowerCase(), m=num(r[C('Monto')])
  if(/mensual/.test(fr)) mensual+=m
  else if(/anual/.test(fr)) mensual+=m/12
  else unico+=m })

// margen real de Magma (Fee Agencia + Somos Magma + Diferencia) / producción
const H=PRO[0], iTot=H.findIndex(x=>txt(x)==='Total'), iFee=H.indexOf('Fee Agencia'), iDif=H.indexOf('Diferencia')
let prod=0, gan=0, meses=new Set()
const tickets=[]
// solo meses CERRADOS (enero a julio): incluir septiembre y octubre, que ya tienen
// proyectos cargados, baja artificialmente el promedio mensual.
PRO.slice(1).forEach(r=>{ const f=fecha(r[3]); if(!f||f.getFullYear()!==2026||f.getMonth()>6)return
  const t=num(r[iTot]); prod+=t; meses.add(f.getMonth())
  let sm=0; PED.forEach(c=>{ if(!txt(r[c]))return; const v=num(r[c+1]), pe=txt(r[c+2])
    if(v>1&&/somos magma/i.test(pe)) sm+=v })
  gan+=num(r[iFee])+sm+num(r[iDif])
  if(t>0&&[11,14,17,20,23,26].some(c=>/foto|video|film/i.test(txt(r[c])))) tickets.push(t) })
const margen=gan/prod
const nm=meses.size
const ticketProm=tickets.reduce((a,b)=>a+b,0)/tickets.length
const prodMes=prod/nm, evMes=tickets.length/nm

console.log(`\n${'█'.repeat(76)}\n  PUNTO DE EQUILIBRIO — con la estructura separada\n${'█'.repeat(76)}`)
console.log(`\n  Margen real de Magma: ${(margen*100).toFixed(0)}%  ·  ticket promedio de evento: ${M(ticketProm)}`)
console.log(`  Ritmo actual: ${M(prodMes)}/mes de producción · ${evMes.toFixed(0)} eventos/mes (promedio ene–jul, ${nm} meses cerrados)\n`)
const linea=(lbl,est)=>{ const necesita=est/margen, ev=necesita/ticketProm
  const dif=ev-evMes
  console.log(`  ${lbl.padEnd(38)}${M(est).padStart(15)}  →  producir ${M(necesita).padStart(15)}  =  ${ev.toFixed(0).padStart(3)} eventos/mes  ${dif>0?`\x1b[31m(faltan ${Math.ceil(dif)})\x1b[0m`:`\x1b[32m(sobran ${Math.abs(Math.floor(dif))})\x1b[0m`}`) }
linea('Estructura que se repite todos los meses', mensual)
linea('+ los pagos de una vez (prorrateados)', mensual+unico)
console.log(`\n  De los ${M(mensual+unico)} que figuran como estructura, \x1b[1m${M(unico)} son pagos únicos\x1b[0m`)
console.log(`  (IVA de abril, VEPs, balance, comisión SGR): ${((unico)/(mensual+unico)*100).toFixed(0)}% del total.`)
console.log(`\n  El equilibrio real es el primero. El segundo mezcla deuda fiscal con estructura.\n`)
