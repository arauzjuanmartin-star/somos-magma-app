/**
 * LA FICHA DE NÚMEROS DE MAGMA — la única fuente para citar montos.
 * Regla: ningún monto de plata se cita de memoria. Se corre esto.
 * Uso: node scripts/numeros-base.mjs [--json]
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const JSONOUT=process.argv.includes('--json')

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,
  ranges:['GASTOS_FIJOS!A:M','PROYECTOS!A:CI'],valueRenderOption:'FORMATTED_VALUE'})
const [GF,PRO]=R.data.valueRanges.map(v=>v.values||[])

// ---- 1. Estructura mensual real (solo activos y mensuales)
const cat={}, fijos={}
GF.slice(1).forEach(r=>{const c=txt(r[0]),co=txt(r[1]),m=num(r[2]),f=txt(r[4]),a=txt(r[7])
  if(!co||!/^si$/i.test(a)||!/mensual/i.test(f))return
  if(/^usd$/i.test(txt(r[3])))return   // las suscripciones en dólares no se suman como pesos
  cat[c]=(cat[c]||0)+m; fijos[co]=m})
const estructura=Object.values(cat).reduce((a,b)=>a+b,0)

// ---- 2. Lo que cobra cada interno (fijo + extras cargados en PROYECTOS)
const NOM={'Lucía María Grenier Basavilbaso':'Lulu','Tomás Halbach':'Tom','Daniela Viviana Ayala':'Dani'}
const SUELDO={Lulu:fijos['Sueldo Lulu']||0,Tom:fijos['Sueldo Tomi']||0,Dani:fijos['Sueldo Dani']||0}

// ---- 3. Producción, margen y equilibrio
// MISMO CRITERIO QUE equilibrio.mjs — no inventar una segunda definición:
//  · margen = (Fee Agencia + "Somos Magma" + Diferencia) / producción  → ~50%, el validado con Sofi.
//    NO usar "producción − freelancers" (~62%): no descuenta Ganancias ni IIBB y da un equilibrio irreal.
//  · "evento" = proyecto con al menos un pedido de foto/video/film en los 6 primeros slots.
//    Las ediciones sueltas no son eventos y bajan el ticket si se cuentan.
//  · solo meses CERRADOS (los que ya pasaron enteros).
const H=PRO[0], iTot=H.findIndex(x=>txt(x)==='Total'), iFee=H.indexOf('Fee Agencia'), iDif=H.indexOf('Diferencia')
const ahora=new Date(), ANIO=ahora.getFullYear(), ULT=ahora.getMonth()-1  // último mes cerrado
const ext={}; let prod=0, gan=0, costoStaff=0; const meses=new Set(), tickets=[]
PRO.slice(1).forEach(r=>{const f=fecha(r[3]); if(!f||f.getFullYear()!==ANIO||f.getMonth()>ULT)return
  const t=num(r[iTot]); prod+=t; meses.add(f.getMonth())
  let sm=0
  PED.forEach(c=>{const ped=txt(r[c]); if(!ped)return; const pr=num(r[c+1]), st=txt(r[c+2])
    if(pr<=1||!st)return
    if(/somos magma/i.test(st)) sm+=pr; else costoStaff+=pr
    const k=NOM[st]; if(k){ext[k]=ext[k]||{n:0,$:0}; ext[k].n++; ext[k].$+=pr}})
  gan+=num(r[iFee])+sm+num(r[iDif])
  if(t>0&&[11,14,17,20,23,26].some(c=>/foto|video|film/i.test(txt(r[c])))) tickets.push(t)})
const NM=meses.size||1
const margen=prod?gan/prod:0
const ticket=tickets.length?tickets.reduce((a,b)=>a+b,0)/tickets.length:0
const necesario=margen?estructura/margen:0
// La brecha se mide en PRODUCCIÓN, no en eventos. necesario/ticket contaba como evento
// también la producción que no viene de eventos (ediciones sueltas) e inflaba el faltante.
const brecha=Math.max(0,necesario-prod/NM)
const eventosFaltan=ticket?brecha/ticket:0
const out={
  generado:ahora.toISOString().slice(0,10), meses_cerrados:NM,
  estructura_mensual:estructura, por_categoria:cat, conceptos:fijos,
  produccion_mes:prod/NM, costo_staff_mes:costoStaff/NM,
  margen, margen_bruto_no_usar:prod?(prod-costoStaff)/prod:0,
  ticket_evento:ticket, eventos_reales:tickets.length/NM,
  produccion_para_empatar:necesario, brecha_produccion:brecha,
  eventos_para_empatar:tickets.length/NM+eventosFaltan, eventos_faltan:eventosFaltan,
  equipo:Object.fromEntries(Object.keys(SUELDO).map(k=>[k,{fijo:SUELDO[k],extras_mes:(ext[k]?.$||0)/NM,cobra:SUELDO[k]+(ext[k]?.$||0)/NM}]))
}
if(JSONOUT){console.log(JSON.stringify(out,null,2));process.exit(0)}

console.log(`\n╔${'═'.repeat(58)}╗`)
console.log(`║  NÚMEROS BASE DE MAGMA · leídos del sheet ${out.generado}      ║`)
console.log(`╚${'═'.repeat(58)}╝`)
console.log('\n── ESTRUCTURA MENSUAL (GASTOS_FIJOS, activos y mensuales)')
Object.entries(cat).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log('   '+k.padEnd(16),M(v).padStart(14)))
console.log('   '+'TOTAL'.padEnd(16),M(estructura).padStart(14))
console.log(`\n── EQUIPO INTERNO (fijo + extras · promedio sobre ${NM} meses CERRADOS)`)
Object.entries(out.equipo).forEach(([k,v])=>
  console.log(`   ${k.padEnd(6)} fijo ${M(v.fijo).padStart(12)} + extras ${M(v.extras_mes).padStart(11)} = cobra ${M(v.cobra).padStart(12)}/mes`))
console.log('   \x1b[2mOJO: costo-equipo-interno.mjs divide por los meses TRANSCURRIDOS (incluye el mes en curso)')
console.log('   y da unos miles menos. Los dos son válidos — pero en un mismo documento usar uno solo.\x1b[0m')
console.log(`\n── PRODUCCIÓN Y EQUILIBRIO (${NM} meses cerrados de ${ANIO})`)
console.log('   producción      ',M(out.produccion_mes).padStart(14),'/mes')
console.log('   costo staff     ',M(out.costo_staff_mes).padStart(14),'/mes')
console.log('   margen Magma    ',(margen*100).toFixed(0)+'%   (Fee + Somos Magma + Diferencia · el criterio validado)')
console.log('   ticket de evento',M(ticket).padStart(14))
console.log('   para empatar    ',M(necesario).padStart(14),'/mes =',out.eventos_para_empatar.toFixed(0),'eventos/mes')
console.log('   ritmo real      ',out.eventos_reales.toFixed(0),'eventos/mes  →',
  eventosFaltan>0
    ? `\x1b[31mFALTAN ${Math.ceil(eventosFaltan)} = ${M(brecha)}/mes de producción\x1b[0m`
    : `\x1b[32mempatado\x1b[0m`)
console.log('   \x1b[2mno usar el margen bruto de '+(out.margen_bruto_no_usar*100).toFixed(0)+'% (producción − freelancers): no descuenta Ganancias ni IIBB\x1b[0m')
console.log('\n── CONCEPTOS QUE SE CITAN SEGUIDO')
;['CM (María)','Alquiler oficina','Contador','ADOBE','Ads (Gloria)','IIBB Magma','Monotributo Lulu'].forEach(c=>
  fijos[c]!==undefined&&console.log('   '+c.padEnd(20),M(fijos[c]).padStart(13)))
console.log('\n   Cualquier monto que se cite en un entregable sale de acá, no de memoria.\n')
