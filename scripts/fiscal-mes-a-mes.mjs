/**
 * Mes a mes desde ENERO 2026 — sin promedios. Fuente: PROYECTOS (venta cerrada, la confiable).
 * IIBB real = % sobre facturación (3% CABA / 4% BA), contra el fijo cargado en GASTOS_FIJOS.
 * Solo lectura.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const num=v=>{const s=String(v??'').replace(/[\s$]/g,'');if(!s)return 0;return Number(s.replace(/,/g,''))||0}
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const pad=(s,n)=>String(s).padStart(n)
const MES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const mesDe=f=>{const p=String(f||'').split('/');if(p.length<3)return null;const m=+p[1],a=+(p[2].length===2?'20'+p[2]:p[2]);if(!m||!a)return null;return {m,a}}
const get=async r=>(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:r})).data.values||[]

// ---- 1. Venta mes a mes desde PROYECTOS ----
const pRows=await get('PROYECTOS!A:BH')
const pH=pRows[0], pc=n=>pH.indexOf(n)
const iFe=pc('Fecha Evento'), iTot=pc('Total '), iFee=pc('Fee Final')
const M={}
for(const r of pRows.slice(1)){
  const fe=mesDe(r[iFe]); if(!fe||fe.a!==2026) continue
  const t=num(r[iTot]); if(t<=0) continue
  M[fe.m]=M[fe.m]||{venta:0,fee:0,n:0}
  M[fe.m].venta+=t; M[fe.m].fee+=num(r[iFee]); M[fe.m].n++
}
const ms=Object.keys(M).map(Number).sort((a,b)=>a-b)

console.log('\n'+'█'.repeat(96))
console.log('  VENTA MES A MES 2026 — fuente PROYECTOS (por fecha de evento). SIN PROMEDIOS.')
console.log('█'.repeat(96))
console.log(`  ${pad('mes',4)} ${pad('proy',5)} ${pad('VENTA',16)} ${pad('Fee Magma',14)} ${pad('IIBB 3% CABA',14)} ${pad('IIBB 4% BA',13)} ${pad('fijo cargado',13)}`)
const FIJO=402500
let tV=0,tF=0,t3=0,t4=0
for(const m of ms){
  const o=M[m], i3=o.venta*0.03, i4=o.venta*0.04
  tV+=o.venta; tF+=o.fee; t3+=i3; t4+=i4
  console.log(`  ${pad(MES[m-1],4)} ${pad(o.n,5)} ${pad(money(o.venta),16)} ${pad(money(o.fee),14)} ${pad(money(i3),14)} ${pad(money(i4),13)} ${pad(money(FIJO),13)}`)
}
console.log('  '+'─'.repeat(92))
console.log(`  ${pad('TOT',4)} ${pad('',5)} ${pad(money(tV),16)} ${pad(money(tF),14)} ${pad(money(t3),14)} ${pad(money(t4),13)} ${pad(money(FIJO*ms.length),13)}`)
console.log(`\n  IIBB devengado al 3% en ${ms.length} meses: ${money(t3)}  ·  cargado como fijo: ${money(FIJO*ms.length)}  →  diferencia ${(t3>FIJO*ms.length?'+':'')}${money(t3-FIJO*ms.length)}`)
console.log(`  SIRCREB retenido ~$888.626/mes = ${money(888626*ms.length)}  →  ${888626*ms.length>t3?'RETIENEN DE MÁS · saldo a favor '+money(888626*ms.length-t3):'retienen de menos'}`)
console.log(`  Ojo: el 3%/4% depende de dónde se preste el servicio (CABA vs Bs.As.). El número REAL sale de la DDJJ mes a mes.`)

// ---- 2. Quién cobra: cuenta destino, mes a mes ----
const fRows=await get('FACTURACION!A:Z')
const fH=fRows[0], fc=n=>fH.indexOf(n)
const iEm=fc('Fecha emision'), iEv=fc('Fecha Evento'), iNeto=fc('Precio SIN IVA'), iFin=fc('Precio FINAL'), iCta=fc('Cuenta destino'), iNroF=fc('Nro de Factura')
const CT={}, ctas=new Set()
for(const r of fRows.slice(1)){
  const fe=mesDe(r[iEm])||mesDe(r[iEv]); if(!fe||fe.a!==2026) continue
  const neto=num(r[iNeto])||num(r[iFin])/1.21; if(neto<=0) continue
  const cta=String(r[iCta]||'—').trim()||'—'
  ctas.add(cta); CT[fe.m]=CT[fe.m]||{}; CT[fe.m][cta]=(CT[fe.m][cta]||0)+neto
}
const listaCtas=[...ctas]
console.log('\n'+'█'.repeat(96))
console.log('  DÓNDE ENTRA LA PLATA — por cuenta destino, mes a mes (FACTURACION · está incompleta, ver abajo)')
console.log('█'.repeat(96))
console.log(`  ${pad('mes',4)}  ${listaCtas.map(c=>pad(c.slice(0,16),17)).join('')}`)
const totCta={}
for(const m of Object.keys(CT).map(Number).sort((a,b)=>a-b)){
  console.log(`  ${pad(MES[m-1],4)}  ${listaCtas.map(c=>{const v=CT[m][c]||0;totCta[c]=(totCta[c]||0)+v;return pad(v?money(v):'·',17)}).join('')}`)
}
console.log('  '+'─'.repeat(92))
console.log(`  ${pad('TOT',4)}  ${listaCtas.map(c=>pad(money(totCta[c]||0),17)).join('')}`)
const totalF=Object.values(totCta).reduce((a,b)=>a+b,0)
console.log(`\n  Facturado cargado en FACTURACION 2026: ${money(totalF)}  vs  venta en PROYECTOS: ${money(tV)}  →  faltan ${money(tV-totalF)} de facturas sin cargar`)
