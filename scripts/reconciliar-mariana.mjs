/**
 * Cruza los números de la minuta de Mariana (Práctica 2, 16/07/2026) contra el sheet real.
 * Solo lectura.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

const ERR=/^#(ERROR!|REF!|N\/A|VALUE!|NAME\?|DIV\/0!|NUM!|NULL!)/
const txt=v=>{const s=String(v??'').trim();return ERR.test(s)?'':s}
const num=v=>{const s=txt(v).replace(/\s/g,'');if(!s)return 0;const neg=/^-/.test(s);const n=parseFloat(s.replace(/[^\d.]/g,''))||0;return neg?-n:n}
const fecha=v=>{const m=txt(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;const d=new Date(y,+m[2]-1,+m[1]);return isNaN(d)?null:d}
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const MES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

const r=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['FACTURACION','PROYECTOS','GASTOS_FIJOS','PRESTAMOS'],valueRenderOption:'FORMATTED_VALUE'})
const [FAC,PRO,GAS,PRE]=r.data.valueRanges.map(v=>v.values||[])

// ============ 1. FACTURACIÓN MENSUAL — dos fuentes ============
// FACTURACION: G[6]FechaEvento, M[12]Precio FINAL  |  también proba F[5] fecha cobro
// PROYECTOS: D[3]FechaEvento, H[7]Total
console.log('\n═══ 1. FACTURACIÓN 2026 POR MES — ¿coinciden las fuentes? ═══\n')
const PRC=[12,15,18,21,24,27,30,33,36,39,42,45,48,61,64,67,70,73,76,79,82]
const facMes={}, proMes={}
FAC.slice(1).forEach(row=>{const f=fecha(row[6]);if(f&&f.getFullYear()===2026){const m=f.getMonth();facMes[m]=(facMes[m]||0)+num(row[12])}})
PRO.slice(1).forEach(row=>{if(!txt(row[2]))return;const f=fecha(row[3]);if(f&&f.getFullYear()===2026){const m=f.getMonth();proMes[m]=(proMes[m]||0)+num(row[7])}})
// USD de Mariana (2026)
const marUSD={0:11786,1:9680,2:29711,3:23627,4:46025,5:23005}
console.log(`   ${'MES'.padEnd(6)}${'FACTURACION $'.padStart(16)}${'PROYECTOS $'.padStart(16)}${'DIF'.padStart(14)}${'Mariana USD'.padStart(13)}${'blue implícito'.padStart(15)}`)
let tf=0,tp=0
for(let m=0;m<7;m++){
  const f=facMes[m]||0, p=proMes[m]||0; tf+=f; tp+=p
  const usd=marUSD[m]
  const blueF=usd?f/usd:0, blueP=usd?p/usd:0
  console.log(`   ${MES[m].padEnd(6)}${money(f).padStart(16)}${money(p).padStart(16)}${money(f-p).padStart(14)}${(usd?'US$'+usd.toLocaleString():'—').padStart(13)}${(usd?Math.round(blueF)+'/'+Math.round(blueP):'—').padStart(15)}`)
}
console.log(`   ${'─'.repeat(80)}`)
console.log(`   ${'ene-jul'.padEnd(6)}${money(tf).padStart(16)}${money(tp).padStart(16)}${money(tf-tp).padStart(14)}`)
console.log(`\n   (blue implícito = ARS de cada fuente ÷ USD de Mariana. Si es errático, no usamos la misma fuente/mes)`)

// ============ 2. TICKET PROMEDIO REAL ============
console.log('\n\n═══ 2. TICKET PROMEDIO REAL (lo que pregunta Mariana: ¿800k o 1.400k?) ═══\n')
const proy2026=PRO.slice(1).filter(row=>{const f=fecha(row[3]);return txt(row[2])&&f&&f.getFullYear()===2026})
const totales=proy2026.map(row=>num(row[7])).filter(x=>x>0).sort((a,b)=>a-b)
const sum=totales.reduce((s,x)=>s+x,0)
const prom=sum/totales.length
const medi=totales[Math.floor(totales.length/2)]
console.log(`   proyectos con monto: ${totales.length}`)
console.log(`   facturación total:   ${money(sum)}`)
console.log(`   TICKET PROMEDIO:     ${money(prom)}  ← media`)
console.log(`   TICKET MEDIANA:      ${money(medi)}  ← el del medio (más representativo, no lo estiran los grandes)`)
console.log(`   más chico ${money(totales[0])} · más grande ${money(totales[totales.length-1])}`)
// cuántos proyectos por semana para el objetivo
const equil=30200000
console.log(`\n   Para facturar el equilibrio (~${money(equil)}/mes):`)
console.log(`     con ticket mediana ${money(medi)}: ${(equil/medi).toFixed(1)} proyectos/mes = ${(equil/medi/4.3).toFixed(1)}/semana`)
console.log(`     con ticket promedio ${money(prom)}: ${(equil/prom).toFixed(1)} proyectos/mes = ${(equil/prom/4.3).toFixed(1)}/semana`)

// ============ 3. 80/20 POR SERVICIO ============
console.log('\n\n═══ 3. EL 80/20 POR SERVICIO (qué se vende y qué deja) ═══\n')
const svcCat=s=>{const t=String(s||'').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu,'').trim().toLowerCase()
  if(/^foto/.test(t))return t.includes('1/2')||t.includes('½')?'Foto 1/2':'Foto 1'
  if(/^video/.test(t))return t.includes('1/2')||t.includes('½')?'Video 1/2':'Video 1'
  if(/^film/.test(t))return t.includes('1/2')||t.includes('½')?'Film 1/2':'Film 1'
  if(/edit/.test(t))return 'Edición'; if(/produ/.test(t))return 'Producción'; if(/drone/.test(t))return 'Drone'
  if(!t)return null; return String(s||'').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu,'').trim()}
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const svc={}
proy2026.forEach(row=>PED.forEach((pc,i)=>{const c=svcCat(row[pc]);if(!c)return;svc[c]=svc[c]||{n:0,monto:0};svc[c].n++;svc[c].monto+=num(row[PRC[i]])}))
const arr=Object.entries(svc).sort((a,b)=>b[1].monto-a[1].monto)
const totSvc=arr.reduce((s,[,d])=>s+d.monto,0)
let acc=0
console.log(`   ${'SERVICIO'.padEnd(16)}${'VECES'.padStart(7)}${'$ STAFF'.padStart(15)}${'% ACUM'.padStart(9)}`)
arr.forEach(([s,d])=>{acc+=d.monto;console.log(`   ${s.padEnd(16)}${String(d.n).padStart(7)}${money(d.monto).padStart(15)}${(Math.round(acc/totSvc*100)+'%').padStart(9)}`)})

// ============ 4. PRÉSTAMOS: capital vs interés + proyección ============
console.log('\n\n═══ 4. PRÉSTAMOS — capital vs interés + cuántas cuotas faltan (pedido de Mariana) ═══\n')
// PRESTAMOS: A[0]Prestamo B[1]CuotaNro C[2]CuotasTotal D[3]Venc E[4]MontoCuota G[6]Pagado
const porPrest={}
PRE.slice(1).forEach(row=>{const p=txt(row[0]);if(!p)return
  porPrest[p]=porPrest[p]||{cuotas:0,total:0,pagadas:0,montoTotal:0,pendiente:0,ultCuota:0,cuotasTot:0}
  const o=porPrest[p]; o.cuotas++; o.montoTotal+=num(row[4])
  o.cuotasTot=Math.max(o.cuotasTot,num(row[2])); o.ultCuota=Math.max(o.ultCuota,num(row[1]))
  const pag=/^(si|sí|true|x)$/i.test(txt(row[6]))
  if(pag){o.pagadas++} else {o.pendiente+=num(row[4])}
})
Object.entries(porPrest).forEach(([p,o])=>{
  console.log(`   ${p}`)
  console.log(`      filas cargadas ${o.cuotas} · cuota máx ${o.ultCuota} de ${o.cuotasTot} · pagadas ${o.pagadas}`)
  console.log(`      pendiente de pago: ${money(o.pendiente)}  (faltan ~${o.cuotasTot-o.ultCuota<0?'?':(o.cuotasTot-o.pagadas)} cuotas)`)
})
// ¿hay préstamos cargados como gasto fijo?
console.log('\n   ¿PRÉSTAMOS cargados en GASTOS_FIJOS? (Mariana: el capital NO es gasto)')
const gastoPrest=GAS.slice(1).filter(g=>/pr[eé]stamo|cuota|galicia|santander/i.test(txt(g[0])+txt(g[1])))
if(gastoPrest.length){gastoPrest.forEach(g=>console.log(`      ⚠️ ${txt(g[0])} / ${txt(g[1])}: ${money(num(g[2]))}/mes`))}
else console.log('      ✓ no hay líneas de préstamo en GASTOS_FIJOS')

// ¿costos bancarios en gastos?
console.log('\n   Costos bancarios en GASTOS_FIJOS (Mariana: son estructura, no financieros):')
const banc=GAS.slice(1).filter(g=>/banc|comisi|manteni/i.test(txt(g[0])+txt(g[1])))
if(banc.length)banc.forEach(g=>console.log(`      ${txt(g[1])}: ${money(num(g[2]))}/mes`))
else console.log('      (ninguno cargado — puede estar faltando)')
