/**
 * Cuenta corriente de socios (Juan y Sofi) con Magma. Solo lectura.
 * Atribución de tarjeta: columna Descripción de MOVIMIENTOS_TARJETA (Juan/Sofi/Magma),
 * NO la columna Persona (que está vacía).
 * Honesto con los huecos: ene-mar tarjeta casi sin cargar, abril a revisar.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ERR=/^#(ERROR!|REF!|N\/A|VALUE!|NAME\?|DIV\/0!|NUM!|NULL!)/
const txt=v=>{const s=String(v??'').trim();return ERR.test(s)?'':s}
const num=v=>{const s=txt(v).replace(/\s/g,'');if(!s)return 0;const n=parseFloat(s.replace(/[^\d.]/g,''))||0;return /^-/.test(s)?-n:n}
const fecha=v=>{const m=txt(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const money=n=>(n<0?'-$':'$')+Math.abs(Math.round(n)).toLocaleString('es-AR')

const r=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['SOCIOS_MOVIMIENTOS','PROYECTOS','PAGOS_STAFF','MOVIMIENTOS_TARJETA'],valueRenderOption:'FORMATTED_VALUE'})
const [SOC,PRO,PAG,MOV]=r.data.valueRanges.map(v=>v.values||[])
const SH=SOC[0], si=n=>SH.findIndex(h=>txt(h).toLowerCase()===n.toLowerCase())
const PRC=[12,15,18,21,24,27,30,33,36,39,42,45,48,61,64,67,70,73,76,79,82]
const STF=[13,16,19,22,25,28,31,34,37,40,43,46,49,62,65,68,71,74,77,80,83]

const SOCIOS={ Juan:{re:/arauz/i, card:/juan/i}, Sofi:{re:/sofia\s+maria\s+grenier/i, card:/sofi/i} }

for(const [nombre,cfg] of Object.entries(SOCIOS)){
  console.log(`\n${'█'.repeat(60)}\n  ${nombre.toUpperCase()}\n${'█'.repeat(60)}`)
  // trabajo vs cobrado (extras 2026)
  let trab=0
  PRO.slice(1).forEach(row=>{const f=fecha(row[3]);if(!txt(row[2])||!f||f.getFullYear()!==2026)return
    STF.forEach((sc,k)=>{if(cfg.re.test(txt(row[sc])))trab+=num(row[PRC[k]])})})
  const pagos=PAG.slice(1).filter(x=>cfg.re.test(txt(x[1]))&&num(x[7])>0).map(x=>({f:fecha(x[0]),m:num(x[7])})).filter(x=>x.f&&x.f.getFullYear()===2026)
  const cobExtra=pagos.reduce((s,x)=>s+x.m,0)
  const ult=PAG.slice(1).filter(x=>cfg.re.test(txt(x[1]))&&num(x[7])>0).map(x=>fecha(x[0])).filter(Boolean).sort((a,b)=>b-a)[0]
  console.log(`\n  EXTRAS (trabajo en proyectos 2026)`)
  console.log(`     trabajó ${money(trab)} · cobró ${money(cobExtra)} · SALDO ${money(trab-cobExtra)}`)
  console.log(`     último pago de extras: ${ult?ult.toLocaleDateString('es-AR'):'—'}`)

  // tarjeta personal por mes (de la Descripción)
  const pm={}
  MOV.slice(1).forEach(x=>{if(!/personal/i.test(txt(x[8])))return;if(!cfg.card.test(txt(x[4])))return
    const m=+txt(x[1]),a=txt(x[2]);if(a!=='2026'||!m)return;pm[m]=(pm[m]||0)+num(x[7])})
  const totCard=Object.values(pm).reduce((s,v)=>s+v,0)
  console.log(`\n  TARJETA PERSONAL (Magma pagó gastos personales de ${nombre})`)
  const MES=['ene','feb','mar','abr','may','jun','jul']
  Object.keys(pm).map(Number).sort((a,b)=>a-b).forEach(m=>console.log(`     ${MES[m-1]}: ${money(pm[m])}`))
  console.log(`     TOTAL 2026: ${money(totCard)}`)
}

console.log(`\n\n${'═'.repeat(60)}`)
console.log(`  DATOS A COMPLETAR antes de cerrar el número:`)
console.log(`  · ene-mar: la tarjeta personal está casi sin cargar (solo ~$166k/mes de Juan)`)
console.log(`  · abril: revisar — puede estar a medias`)
console.log(`  · definir si los "Retiros" en efectivo cuentan como sueldo o como extra`)
console.log(`${'═'.repeat(60)}`)
