// Proyección de préstamos — responde el pedido de Mariana (Práctica 2):
// capital vs interés, cuántas cuotas faltan, salida de caja mes a mes, y qué es de Magma vs personal
import {google} from 'googleapis'
import fs from 'fs'
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim().replace(/^"|"$/g,'').replace(/\\n/g,'\n')]))
const auth=new google.auth.JWT(env.GOOGLE_CLIENT_EMAIL,null,env.GOOGLE_PRIVATE_KEY,['https://www.googleapis.com/auth/spreadsheets'])
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

const N=v=>{ if(typeof v==='number')return v; if(!v)return 0; const n=parseFloat(String(v).replace(/[^\d.-]/g,'')); return isNaN(n)?0:n }
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const fecha=v=>{const m=String(v||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const cuotaNro=v=>{const m=String(v||'').match(/(\d+)\s*\/\s*(\d+)/);return m?{n:+m[1],de:+m[2]}:null}
const MESN=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const HOY=new Date()

const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PRESTAMOS',valueRenderOption:'FORMATTED_VALUE'})
// Leer por nombre de header, no por posición: la solapa ganó la columna "Mes" (D) y corrió todo lo demás
const H=r.data.values[0]
const idx=name=>{const i=H.indexOf(name); if(i<0) throw new Error(`PRESTAMOS: falta la columna "${name}"`); return i}
const C={prestamo:idx('Prestamo'),cuota:idx('Cuota nro'),total:idx('Cuotas total'),venc:idx('Vencimiento'),monto:idx('Monto cuota'),pagado:idx('Pagado'),notas:idx('Notas'),tipo:idx('Tipo'),deudor:idx('Deudor'),acreedor:idx('Acreedor'),cap:idx('Capital'),int:idx('Interes'),imp:idx('Impuestos')}
const P=r.data.values.slice(1)

const prest={}
for(const row of P){
  const nombre=String(row[C.prestamo]||'').trim(); if(!nombre) continue
  const c=cuotaNro(row[C.cuota])
  const p=prest[nombre]||(prest[nombre]={nombre,total:N(row[C.total]),filas:0,cuotasVistas:new Set(),
    pagadas:0,pend:0,montoPend:0,capPend:0,intPend:0,impPend:0,montoPag:0,capPag:0,intPag:0,impPag:0,
    deudor:String(row[C.deudor]||'').trim(),acreedor:String(row[C.acreedor]||'').trim(),tipo:String(row[C.tipo]||'').trim(),
    notas:String(row[C.notas]||'').trim(),venc:[]})
  p.filas++
  if(c) p.cuotasVistas.add(c.n)
  const pagado=/^s/i.test(String(row[C.pagado]||''))
  const monto=N(row[C.monto]), cap=N(row[C.cap]), int=N(row[C.int]), imp=N(row[C.imp])
  const v=fecha(row[C.venc])
  if(pagado){ p.pagadas++; p.montoPag+=monto; p.capPag+=cap; p.intPag+=int; p.impPag+=imp }
  else { p.pend++; p.montoPend+=monto; p.capPend+=cap; p.intPend+=int; p.impPend+=imp; if(v) p.venc.push({v,monto,cap,int,imp}) }
}

console.log('╔════════════════════════════════════════════════════════════════════╗')
console.log('║  PRÉSTAMOS — capital vs interés y cuotas que faltan (p/ Mariana)  ║')
console.log('╚════════════════════════════════════════════════════════════════════╝\n')

let TmontoPend=0,TcapPend=0,TintPend=0,TimpPend=0
const lista=Object.values(prest).sort((a,b)=>b.montoPend-a.montoPend)
for(const p of lista){
  const faltanCargar = p.total>0 ? p.total-p.cuotasVistas.size : 0
  console.log(`■ ${p.nombre}   [${p.tipo||'?'}]  deudor: ${p.deudor||'—'}`)
  console.log(`   cuotas: ${p.cuotasVistas.size} cargadas de ${p.total||'?'}${faltanCargar>0?`   ⚠️ FALTAN CARGAR ${faltanCargar}`:'   ✓ completo'}`)
  console.log(`   pagadas ${p.pagadas} · pendientes ${p.pend}`)
  console.log(`   PENDIENTE DE PAGO: ${M(p.montoPend)}`)
  console.log(`      capital   ${M(p.capPend).padStart(14)}   ← baja la deuda`)
  console.log(`      interés   ${M(p.intPend).padStart(14)}   ← costo real`)
  console.log(`      impuestos ${M(p.impPend).padStart(14)}`)
  if(p.venc.length){
    const ord=p.venc.slice().sort((a,b)=>a.v-b.v)
    const f=ord[0].v, u=ord[ord.length-1].v
    const fmt=d=>`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
    console.log(`   próximo venc: ${fmt(f)} · termina: ${fmt(u)}`)
    const vencidas=ord.filter(x=>x.v<HOY)
    if(vencidas.length) console.log(`   ⚠️ ${vencidas.length} cuota(s) VENCIDA(S) sin marcar pago: ${M(vencidas.reduce((a,x)=>a+x.monto,0))}`)
  }
  if(p.notas) console.log(`   nota: ${p.notas}`)
  console.log('')
  TmontoPend+=p.montoPend; TcapPend+=p.capPend; TintPend+=p.intPend; TimpPend+=p.impPend
}

console.log('─'.repeat(70))
console.log(`TOTAL PENDIENTE: ${M(TmontoPend)}`)
console.log(`   capital   ${M(TcapPend).padStart(14)}  (${Math.round(TcapPend/TmontoPend*100)}%)  ← esto NO es gasto, baja deuda`)
console.log(`   interés   ${M(TintPend).padStart(14)}  (${Math.round(TintPend/TmontoPend*100)}%)  ← esto SÍ es costo (va al P&L)`)
console.log(`   impuestos ${M(TimpPend).padStart(14)}  (${Math.round(TimpPend/TmontoPend*100)}%)`)

// ===== proyección mes a mes =====
console.log('\n╔════════════════════════════════════════════════════════════════════╗')
console.log('║  SALIDA DE CAJA POR MES — cuánto se va en cuotas hasta terminar    ║')
console.log('╚════════════════════════════════════════════════════════════════════╝\n')
const porMes={}
for(const p of lista) for(const c of p.venc){
  const k=`${c.v.getFullYear()}-${String(c.v.getMonth()).padStart(2,'0')}`
  const m=porMes[k]||(porMes[k]={monto:0,cap:0,int:0,imp:0,y:c.v.getFullYear(),m:c.v.getMonth(),det:[]})
  m.monto+=c.monto; m.cap+=c.cap; m.int+=c.int; m.imp+=c.imp; m.det.push(p.nombre)
}
const meses=Object.values(porMes).sort((a,b)=>a.y-b.y||a.m-b.m)
console.log(`   ${'MES'.padEnd(10)}${'SALE DE CAJA'.padStart(16)}${'capital'.padStart(14)}${'interés'.padStart(14)}  préstamos`)
let acum=0
for(const m of meses){
  acum+=m.monto
  const cnt={}; m.det.forEach(d=>cnt[d]=(cnt[d]||0)+1)
  console.log(`   ${(MESN[m.m]+' '+m.y).padEnd(10)}${M(m.monto).padStart(16)}${M(m.cap).padStart(14)}${M(m.int).padStart(14)}  ${Object.keys(cnt).length} (${Object.keys(cnt).join(', ')})`)
}
console.log(`   ${'─'.repeat(66)}`)
console.log(`   ${'TOTAL'.padEnd(10)}${M(acum).padStart(16)}${M(TcapPend).padStart(14)}${M(TintPend).padStart(14)}`)
const prom=acum/meses.length
console.log(`\n   Promedio mensual mientras dure: ${M(prom)}/mes`)
console.log(`   Pico: ${M(Math.max(...meses.map(m=>m.monto)))} · Piso: ${M(Math.min(...meses.map(m=>m.monto)))}`)

// ===== Magma vs personal =====
console.log('\n■ ¿DE QUIÉN ES LA DEUDA? (Mariana: separar empresa de personal)')
const porDeudor={}
for(const p of lista){ const d=p.deudor||'sin especificar'; porDeudor[d]=(porDeudor[d]||0)+p.montoPend }
for(const [d,v] of Object.entries(porDeudor).sort((a,b)=>b[1]-a[1])) console.log(`   ${d.padEnd(30)}${M(v).padStart(16)}  (${Math.round(v/TmontoPend*100)}%)`)
