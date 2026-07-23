/**
 * Punto de equilibrio de CAJA: el de resultado no alcanza porque las cuotas de préstamo
 * salen igual todos los meses aunque el capital no sea "gasto". Lo marcó Juan en la
 * reunión del 22/07 ("Mariana dice que es otro número porque también están los préstamos").
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
const esTrue=v=>/^(TRUE|VERDADERO|SI|SÍ|X)$/i.test(txt(v))
const hoy=new Date();hoy.setHours(0,0,0,0)

const r=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS','GASTOS_FIJOS','PRESTAMOS'],valueRenderOption:'FORMATTED_VALUE'})
const [PRO,GAS,PST]=r.data.valueRanges.map(v=>v.values||[])
const PRC=[12,15,18,21,24,27,30,33,36,39,42,45,48,61,64,67,70,73,76,79,82]

const STF=[13,16,19,22,25,28,31,34,37,40,43,46,49,62,65,68,71,74,77,80,83]
const SOCIOS=/arauz|sofia\s+maria\s+grenier/i

// margen bruto real 2026 (solo eventos ya pasados)
const p26=PRO.slice(1).filter(x=>{const f=fecha(x[3]);return txt(x[2])&&f&&f.getFullYear()===2026&&f<hoy})
const fact=p26.reduce((s,x)=>s+num(x[7]),0)
const costo=p26.reduce((s,x)=>s+PRC.reduce((a,c)=>a+num(x[c]),0),0)
// Lo que trabajaron Juan y Sofi NO sale de caja: decidieron no cobrarlo hasta
// limpiar las deudas. Para el equilibrio de CAJA hay que descontarlo.
const costoSocios=p26.reduce((s,x)=>s+STF.reduce((a,sc,k)=>a+(SOCIOS.test(txt(x[sc]))?num(x[PRC[k]]):0),0),0)
const margen=(fact-costo)/fact                        // contable
const margenCaja=(fact-(costo-costoSocios))/fact      // plata que sale de verdad

// Gastos fijos: SOLO los recurrentes. La solapa mezcla pagos únicos (IVA de un mes,
// balance, VEPs sueltos) que no son estructura mensual y disparaban el número.
const gasAct=GAS.slice(1).filter(g=>txt(g[1])&&!/^no$|^false$/i.test(txt(g[7])))
const esMensual=g=>!/[uú]nico/i.test(txt(g[4]))
const gastoMes=gasAct.filter(esMensual).reduce((s,g)=>s+num(g[2]),0)
const gastoUnico=gasAct.filter(g=>!esMensual(g)).reduce((s,g)=>s+num(g[2]),0)

// cuotas de préstamo pendientes
const cuotas=PST.slice(1).filter(x=>txt(x[0])&&!esTrue(x[6])&&num(x[4])>0)
const totalPend=cuotas.reduce((s,x)=>s+num(x[4]),0)
const conFecha=cuotas.filter(x=>fecha(x[3]))
const prox12=conFecha.filter(x=>{const f=fecha(x[3]);return f>=hoy&&(f-hoy)/86400000<=365})
const cuotaMes=prox12.length?prox12.reduce((s,x)=>s+num(x[4]),0)/12:(totalPend?totalPend/12:0)

console.log(`\n${'█'.repeat(64)}\n  PUNTO DE EQUILIBRIO — RESULTADO vs CAJA\n${'█'.repeat(64)}`)
console.log(`\nFacturado 2026 (eventos ya pasados): ${money(fact)}`)
console.log(`   staff total valorizado        ${money(costo)}   → margen contable ${Math.round(margen*100)}%`)
console.log(`   de eso, trabajo de Juan y Sofi ${money(costoSocios)}   (NO sale de caja: lo financian ellos)`)
console.log(`   staff que SÍ se paga           ${money(costo-costoSocios)}   → margen de caja ${Math.round(margenCaja*100)}%`)
console.log(`\nGastos fijos RECURRENTES: ${money(gastoMes)}/mes`)
console.log(`Pagos ÚNICOS cargados aparte: ${money(gastoUnico)}  ← IVA de un mes, balance, VEPs sueltos.`)
console.log(`   No son estructura mensual, pero hay que pagarlos igual (mochila).`)

console.log(`\n── PRÉSTAMOS ──`)
const porPrest={}
cuotas.forEach(x=>{const p=txt(x[0]);porPrest[p]=porPrest[p]||{n:0,monto:0};porPrest[p].n++;porPrest[p].monto+=num(x[4])})
Object.entries(porPrest).forEach(([p,d])=>console.log(`   ${p.padEnd(30)} ${d.n} cuotas pendientes · ${money(d.monto)}`))
console.log(`   ${'─'.repeat(58)}`)
console.log(`   TOTAL pendiente cargado: ${money(totalPend)}`)
console.log(`   Cuotas que vencen en los próximos 12 meses: ${prox12.length} · ${money(prox12.reduce((s,x)=>s+num(x[4]),0))}`)
console.log(`   ➜ SALIDA DE CAJA POR PRÉSTAMOS: ${money(cuotaMes)}/mes`)

const eqResultado=gastoMes/margenCaja
const eqCaja=(gastoMes+cuotaMes)/margenCaja
console.log(`\n${'═'.repeat(64)}`)
console.log(`   Sin préstamos             ${money(eqResultado).padStart(16)}/mes`)
console.log(`   CON préstamos (el real)   ${money(eqCaja).padStart(16)}/mes   ← hay que facturar esto`)
console.log(`   diferencia                ${money(eqCaja-eqResultado).padStart(16)}/mes`)
console.log(`${'═'.repeat(64)}`)

// mes a mes contra el equilibrio de caja
const mm={}
PRO.slice(1).forEach(x=>{if(!txt(x[2]))return;const f=fecha(x[3]);if(!f||f.getFullYear()!==2026||f>=hoy)return
  const k=f.getMonth();mm[k]=(mm[k]||0)+num(x[7])})
const MES=['ene','feb','mar','abr','may','jun','jul']
console.log(`\nMes a mes contra el equilibrio de CAJA (${money(eqCaja)}):\n`)
Object.keys(mm).map(Number).sort((a,b)=>a-b).forEach(m=>{
  const f=mm[m], res=f*margenCaja-gastoMes-cuotaMes
  console.log(`   ${MES[m].padEnd(5)} facturó ${money(f).padStart(14)} → ${res>=0?'✓':'✗'} ${money(res).padStart(14)}`)
})
console.log(`\n   OJO: esto asume que los gastos fijos de hoy (${money(gastoMes)}) valían también`)
console.log(`   en enero. Juan marcó en la reunión que antes NO había oficina: los meses`)
console.log(`   viejos se ven peor de lo que fueron. Para el histórico hay que cargar el`)
console.log(`   gasto real de cada mes.`)
