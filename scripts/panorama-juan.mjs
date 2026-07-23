/**
 * Panorama de Juan con Magma. Solo lectura. Responde:
 *   - qué le pagó Magma vs qué puso Juan por Magma (VEPs)
 *   - hace cuánto no le pagan los "extras" (trabajo en proyectos)
 *   - gasto de tarjetas por mes
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
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const hoy=new Date();hoy.setHours(0,0,0,0)
const MES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

const r=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['SOCIOS_MOVIMIENTOS','PROYECTOS','PAGOS_STAFF','MOVIMIENTOS_TARJETA'],valueRenderOption:'FORMATTED_VALUE'})
const [SOC,PRO,PAG,MOV]=r.data.valueRanges.map(v=>v.values||[])
const SH=SOC[0], si=n=>SH.findIndex(h=>txt(h).toLowerCase()===n.toLowerCase())
const PRC=[12,15,18,21,24,27,30,33,36,39,42,45,48,61,64,67,70,73,76,79,82]
const STF=[13,16,19,22,25,28,31,34,37,40,43,46,49,62,65,68,71,74,77,80,83]

console.log(`\n${'█'.repeat(64)}\n  PANORAMA DE JUAN CON MAGMA · ${hoy.toLocaleDateString('es-AR')}\n${'█'.repeat(64)}`)

// ---- 1. movimientos de plata ----
const mov=SOC.slice(1).filter(x=>/juan/i.test(txt(x[si('Socio')])))
const magmaAJuan=mov.filter(x=>txt(x[si('Dirección')])==='Magma→Socio')
const juanAMagma=mov.filter(x=>txt(x[si('Dirección')])==='Socio→Magma')
const totMA=magmaAJuan.reduce((s,x)=>s+num(x[si('Monto')]),0)
const totJM=juanAMagma.reduce((s,x)=>s+num(x[si('Monto')]),0)
console.log(`\n═══ 1. PLATA ENTRE JUAN Y MAGMA ═══\n`)
console.log(`   Magma le pagó a Juan (sueldos + pagos): ${money(totMA)}`)
magmaAJuan.forEach(x=>console.log(`      ${txt(x[si('Fecha')]).padEnd(11)} ${money(num(x[si('Monto')])).padStart(13)}  ${txt(x[si('Concepto')])}`))
console.log(`\n   Juan puso plata por Magma (VEPs impuestos): ${money(totJM)}`)
juanAMagma.forEach(x=>console.log(`      ${txt(x[si('Fecha')]).padEnd(11)} ${money(num(x[si('Monto')])).padStart(13)}  ${txt(x[si('Concepto')])}`))
console.log(`\n   ➜ NETO que Juan realmente recibió de Magma: ${money(totMA-totJM)}`)
console.log(`      (le pagaron ${money(totMA)} − ${money(totJM)} que él pagó de impuestos de Magma)`)

// ---- 2. trabajo en proyectos + hace cuánto no cobra extras ----
console.log(`\n\n═══ 2. TRABAJO EN PROYECTOS (extras) ═══\n`)
let trabajado=0, nProy=0
PRO.slice(1).forEach(row=>{const f=fecha(row[3]);if(!txt(row[2])||!f||f.getFullYear()!==2026)return
  STF.forEach((sc,k)=>{if(/arauz/i.test(txt(row[sc]))){trabajado+=num(row[PRC[k]]);nProy++}})})
const pagosExtra=PAG.slice(1).filter(x=>/arauz/i.test(txt(x[1]))&&num(x[7])>0).map(x=>({f:fecha(x[0]),m:num(x[7])})).filter(x=>x.f).sort((a,b)=>b.f-a.f)
const cobradoExtra=pagosExtra.filter(x=>x.f.getFullYear()===2026).reduce((s,x)=>s+x.m,0)
console.log(`   Trabajó en ${nProy} proyectos en 2026, valorizado en ${money(trabajado)}`)
console.log(`   Le pagaron por eso (PAGOS_STAFF 2026): ${money(cobradoExtra)}`)
if(pagosExtra.length){
  const ult=pagosExtra[0]
  const dias=Math.round((hoy-ult.f)/86400000)
  console.log(`\n   ➜ ÚLTIMO PAGO DE EXTRAS: ${ult.f.toLocaleDateString('es-AR')} (hace ${dias} días, ~${Math.round(dias/30)} meses)`)
  console.log(`   ➜ SALDO de extras sin cobrar: ${money(trabajado-cobradoExtra)}`)
}

// ---- 3. tarjetas por mes ----
console.log(`\n\n═══ 3. GASTO DE TARJETAS POR MES (2026) ═══\n`)
const MH=MOV[0], mi=n=>MH.findIndex(h=>txt(h).toLowerCase()===n.toLowerCase())
const porMes={}
MOV.slice(1).forEach(x=>{const a=txt(x[mi('Año')]),m=+txt(x[mi('Mes')]);if(a!=='2026'||!m)return
  const cat=/personal/i.test(txt(x[mi('Categoria')]))?'personal':/empresa|magma/i.test(txt(x[mi('Categoria')]))?'empresa':'sinCat'
  porMes[m]=porMes[m]||{empresa:0,personal:0,sinCat:0};porMes[m][cat]+=num(x[mi('Monto')])})
console.log(`   ${'MES'.padEnd(6)}${'EMPRESA'.padStart(15)}${'PERSONAL'.padStart(15)}${'SIN CLASIF'.padStart(14)}`)
Object.keys(porMes).map(Number).sort((a,b)=>a-b).forEach(m=>{const d=porMes[m]
  console.log(`   ${MES[m-1].padEnd(6)}${money(d.empresa).padStart(15)}${money(d.personal).padStart(15)}${money(d.sinCat).padStart(14)}`)})
console.log(`\n   ⚠️ Esto es el TOTAL de todas las tarjetas juntas. La columna "Persona" está vacía,`)
console.log(`      así que todavía NO puedo separar cuánto gastaste VOS de cuánto Sofi.`)
console.log(`      Decime qué tarjetas son tuyas (BBVA Visa / Master Galicia / Santander Visa / Amex) y lo separo.`)
