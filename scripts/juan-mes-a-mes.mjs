/**
 * La cuenta de Juan con Magma, MES A MES, explicada simple. Solo lectura.
 * Cada mes: lo que Magma le tenía que dar (sueldo + extras + VEPs que puso)
 * vs lo que sacó (transferencias + tarjeta). Saldo del mes y acumulado.
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
const MES=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO']
const SUELDO=3200000
const JUAN=/arauz/i, JUANCARD=/juan/i, JUANSOC=/^juan$/i

const r=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['SOCIOS_MOVIMIENTOS','PROYECTOS','MOVIMIENTOS_TARJETA'],valueRenderOption:'FORMATTED_VALUE'})
const [SOC,PRO,MOV]=r.data.valueRanges.map(v=>v.values||[])
const SH=SOC[0], si=n=>SH.findIndex(h=>txt(h).toLowerCase()===n.toLowerCase())
const PRC=[12,15,18,21,24,27,30,33,36,39,42,45,48,61,64,67,70,73,76,79,82]
const STF=[13,16,19,22,25,28,31,34,37,40,43,46,49,62,65,68,71,74,77,80,83]

// acumuladores por mes (0=ene ... 6=jul)
const M={}; for(let m=3;m<=6;m++) M[m]={sueldo:SUELDO,extras:0,vep:0,haberes:0,tarjeta:0}

// extras: trabajo por mes de evento
PRO.slice(1).forEach(row=>{const f=fecha(row[3]);if(!txt(row[2])||!f||f.getFullYear()!==2026)return;const m=f.getMonth();if(!M[m])return
  STF.forEach((sc,k)=>{if(JUAN.test(txt(row[sc])))M[m].extras+=num(row[PRC[k]])})})
// haberes/transferencias y VEPs por mes
SOC.slice(1).forEach(x=>{if(!JUANSOC.test(txt(x[si('Socio')])))return;const f=fecha(x[si('Fecha')]);if(!f||f.getFullYear()!==2026)return;const m=f.getMonth();if(!M[m])return
  if(/vep/i.test(txt(x[si('Concepto')])))M[m].vep+=num(x[si('Monto')]); else M[m].haberes+=num(x[si('Monto')])})
// tarjeta personal por mes
MOV.slice(1).forEach(x=>{if(!/personal/i.test(txt(x[8]))||!JUANCARD.test(txt(x[4])))return;const m=+txt(x[1])-1,a=txt(x[2]);if(a!=='2026'||!M[m])return;M[m].tarjeta+=num(x[7])})

console.log(`\n${'█'.repeat(60)}`)
console.log(`  LA CUENTA DE JUAN, MES A MES`)
console.log(`${'█'.repeat(60)}`)
console.log(`\n  Regla simple: cada mes Magma te TIENE QUE DAR (sueldo + extras).`)
console.log(`  Y cada mes vos SACASTE (transferencias + tarjeta de la empresa).`)
console.log(`  Si sacaste más de lo que te tienen que dar → quedás debiendo.\n`)

let acum=0
for(let m=3;m<=6;m++){
  const d=M[m]
  const teTienenQueDar=d.sueldo+d.extras+d.vep
  const sacaste=d.haberes+d.tarjeta
  const saldoMes=teTienenQueDar-sacaste
  acum+=saldoMes
  console.log(`${'─'.repeat(60)}`)
  console.log(`  ${MES[m]}`)
  console.log(`     Te tienen que dar:`)
  console.log(`        Sueldo                         ${money(d.sueldo).padStart(14)}`)
  console.log(`        Extras (lo que trabajaste)     ${money(d.extras).padStart(14)}`)
  if(d.vep)console.log(`        VEPs que pagaste vos           ${money(d.vep).padStart(14)}`)
  console.log(`        = TOTAL a favor tuyo           ${money(teTienenQueDar).padStart(14)}`)
  console.log(`     Sacaste:`)
  console.log(`        Transferencias                 ${money(d.haberes).padStart(14)}`)
  console.log(`        Tarjeta (gastos personales)    ${money(d.tarjeta).padStart(14)}`)
  console.log(`        = TOTAL que sacaste            ${money(sacaste).padStart(14)}`)
  console.log(`     ${saldoMes>=0?'✓ Este mes te quedaron a favor':'✗ Este mes sacaste de más'}: ${money(saldoMes)}`)
  console.log(`     ➜ ACUMULADO hasta acá: ${money(acum)}  ${acum>=0?'(Magma te debe)':'(le debés a Magma)'}`)
  console.log('')
}
console.log(`${'━'.repeat(60)}`)
console.log(`  RESULTADO FINAL (abril a julio):`)
console.log(`  ${acum>=0?'MAGMA TE DEBE':'LE DEBÉS A MAGMA'}: ${money(Math.abs(acum))}`)
console.log(`${'━'.repeat(60)}`)
console.log(`\n  Nota: julio todavía lo estás trabajando (lo cobrás en agosto), por eso`)
console.log(`  julio te muestra mucho "a favor" y poco "sacaste" — es normal, falta cobrarlo.`)
