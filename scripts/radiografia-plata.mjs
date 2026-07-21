/**
 * Radiografía de plata de SOMOS MAGMA. Solo lectura.
 *
 * Responde: qué servicio deja más, qué cliente conviene, cuánto se va en gastos fijos,
 * y cuánto hay que facturar por mes para no perder.
 *
 * NO usa BALANCE ni Dashboard_data (tienen fórmulas rotas en MARZO).
 * Todo sale de PROYECTOS / FACTURACION / GASTOS_FIJOS / SUELDOS / PAGOS_STAFF.
 *
 *   node scripts/radiografia-plata.mjs
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
const money=n=>(n<0?'-$':'$')+Math.abs(Math.round(n)).toLocaleString('es-AR')
const pct=(a,b)=>b?Math.round(a/b*100)+'%':'—'
const hoy=new Date(); hoy.setHours(0,0,0,0)
const ANIO=hoy.getFullYear()
const MESES=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']

const r=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,
  ranges:['PROYECTOS','FACTURACION','GASTOS_FIJOS','SUELDOS','PAGOS_STAFF'],valueRenderOption:'FORMATTED_VALUE'})
const [PRO,FAC,GAS,SUE,PAG]=r.data.valueRanges.map(v=>v.values||[])

const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const PRC=[12,15,18,21,24,27,30,33,36,39,42,45,48,61,64,67,70,73,76,79,82]
const STF=[13,16,19,22,25,28,31,34,37,40,43,46,49,62,65,68,71,74,77,80,83]

// normaliza el nombre del servicio: saca emojis y unifica
const svcNorm=s=>{
  let t=txt(s).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F3FB}-\u{1F3FF}]/gu,'').trim()
  t=t.replace(/\s+/g,' ')
  return t
}
// categoría gruesa para agrupar
const svcCat=s=>{
  const t=svcNorm(s).toLowerCase()
  if(/^foto/.test(t)) return t.includes('1/2')||t.includes('½')?'Foto 1/2':'Foto 1'
  if(/^video/.test(t)) return t.includes('1/2')||t.includes('½')?'Video 1/2':'Video 1'
  if(/^film/.test(t)) return t.includes('1/2')||t.includes('½')?'Film 1/2':'Film 1'
  if(/edit/.test(t)) return 'Edición'
  if(/produ/.test(t)) return 'Producción'
  if(/drone/.test(t)) return 'Drone'
  if(/viatic|traslad|comida|hotel/.test(t)) return 'Viáticos'
  if(!t) return null
  return svcNorm(s)
}

// ---------- proyectos normalizados ----------
const proy=PRO.slice(1).filter(x=>txt(x[2])).map(row=>{
  const items=[]
  PED.forEach((pc,i)=>{ const n=txt(row[pc]); if(n) items.push({svc:svcCat(n), raw:svcNorm(n), costo:num(row[PRC[i]]), staff:txt(row[STF[i]])}) })
  const costos=items.reduce((s,x)=>s+x.costo,0)
  const total=num(row[7])
  const feeAg=num(row[10]), dif=num(row[9])
  // Margen bruto = lo que queda después de pagarle al staff.
  // OJO: el 35% Gan + 4% IIBB de la fórmula de precio NO se resta acá — eso está DENTRO
  // del precio que se le cobra al cliente (es ingreso). Los impuestos que realmente se
  // pagan están en GASTOS_FIJOS (categoría Impuestos). Restarlos acá sería contarlos dos veces.
  const margenBruto=total-costos
  return {
    nro:txt(row[2]), fe:fecha(row[3]), agencia:txt(row[4]), cliente:txt(row[5]), proyecto:txt(row[6]),
    pm:txt(row[51]), total, costos, feeAg, dif, margenBruto,
    items, nPers: items.filter(x=>x.staff).length,
  }
})
const p2026=proy.filter(p=>p.fe&&p.fe.getFullYear()===ANIO)

console.log(`\n${'█'.repeat(72)}`)
console.log(`  RADIOGRAFÍA DE PLATA — SOMOS MAGMA · ${hoy.toLocaleDateString('es-AR')}`)
console.log(`${'█'.repeat(72)}`)

// ========================= 1. FOTO GENERAL =========================
const T=p2026.reduce((a,p)=>{a.total+=p.total;a.costos+=p.costos;a.bruto+=p.margenBruto;a.neto+=p.margenBruto;return a},{total:0,costos:0,bruto:0,imp:0,neto:0})
console.log(`\n\n═══ 1. EL AÑO ${ANIO} HASTA HOY (${p2026.length} proyectos) ═══\n`)
console.log(`   Facturado a clientes      ${money(T.total).padStart(16)}`)
console.log(`   Pagado a freelancers      ${money(-T.costos).padStart(16)}   ${pct(T.costos,T.total)} de la venta`)
console.log(`   ${'─'.repeat(46)}`)
console.log(`   MARGEN BRUTO              ${money(T.bruto).padStart(16)}   ${pct(T.bruto,T.total)}`)
console.log(`   Ganancias 35% + IIBB 4%   ${money(-0).padStart(16)}`)
console.log(`   ${'─'.repeat(46)}`)
console.log(`   MARGEN NETO (antes de gastos fijos) ${money(T.bruto).padStart(9)}   ${pct(T.bruto,T.total)}`)

// ========================= 2. GASTOS FIJOS =========================
const gasAct=GAS.slice(1).filter(g=>txt(g[1]) && !/^no$|^false$/i.test(txt(g[7])))
const porCat={}
gasAct.forEach(g=>{ const c=txt(g[0])||'Sin categoría'; porCat[c]=(porCat[c]||0)+num(g[2]) })
const gastoMes=Object.values(porCat).reduce((a,b)=>a+b,0)
console.log(`\n\n═══ 2. GASTOS FIJOS — ${money(gastoMes)} POR MES ═══\n`)
Object.entries(porCat).sort((a,b)=>b[1]-a[1]).forEach(([c,v])=>{
  const barra='█'.repeat(Math.max(1,Math.round(v/gastoMes*30)))
  console.log(`   ${c.padEnd(22)} ${money(v).padStart(14)}  ${pct(v,gastoMes).padStart(4)}  ${barra}`)
})
console.log(`   ${'─'.repeat(60)}`)
console.log(`   ${'TOTAL MENSUAL'.padEnd(22)} ${money(gastoMes).padStart(14)}`)
console.log(`\n   Detalle de los 10 más caros:`)
gasAct.map(g=>({c:txt(g[1]),m:num(g[2]),cat:txt(g[0]),q:txt(g[6])})).sort((a,b)=>b.m-a.m).slice(0,10)
  .forEach(g=>console.log(`     ${money(g.m).padStart(13)}  ${g.c}${g.q?` (${g.q})`:''}`))

// ========================= 3. PUNTO DE EQUILIBRIO =========================
const margenBrutoPct = T.total? T.bruto/T.total : 0
const equilibrio = margenBrutoPct>0 ? gastoMes/margenBrutoPct : 0
console.log(`\n\n═══ 3. PUNTO DE EQUILIBRIO ═══\n`)
console.log(`   De cada $100 que facturás te quedan ${money(margenBrutoPct*100).replace('$','')} después de pagar staff e impuestos.`)
console.log(`   Los gastos fijos son ${money(gastoMes)} por mes.`)
console.log(`\n   ➜ NECESITÁS FACTURAR ${money(equilibrio)} POR MES para no perder plata.`)
const mesesAnio={}
p2026.forEach(p=>{ const k=p.fe.getMonth(); if(!mesesAnio[k])mesesAnio[k]={total:0,neto:0,n:0}; mesesAnio[k].total+=p.total; mesesAnio[k].neto+=p.margenBruto; mesesAnio[k].n++ })
console.log(`\n   Mes a mes ${ANIO}:\n`)
console.log(`   ${'MES'.padEnd(11)}${'FACTURADO'.padStart(15)}${'NETO'.padStart(14)}${'GASTOS FIJOS'.padStart(15)}${'RESULTADO'.padStart(15)}`)
let acum=0
Object.keys(mesesAnio).map(Number).sort((a,b)=>a-b).forEach(m=>{
  const d=mesesAnio[m]; const res=d.neto-gastoMes; acum+=res
  const flag=res<0?' ⚠️':''
  console.log(`   ${MESES[m].slice(0,3).padEnd(11)}${money(d.total).padStart(15)}${money(d.neto).padStart(14)}${money(-gastoMes).padStart(15)}${money(res).padStart(15)}${flag}`)
})
console.log(`   ${'─'.repeat(70)}`)
console.log(`   ${'ACUMULADO'.padEnd(11)}${''.padStart(15)}${''.padStart(14)}${''.padStart(15)}${money(acum).padStart(15)}`)

// ========================= 4. QUÉ SERVICIO DEJA MÁS =========================
console.log(`\n\n═══ 4. QUÉ SERVICIO SE VENDE Y CUÁNTO CUESTA ═══\n`)
const svc={}
p2026.forEach(p=>p.items.forEach(it=>{
  if(!it.svc) return
  const s=svc[it.svc]=svc[it.svc]||{n:0,costo:0}
  s.n++; s.costo+=it.costo
}))
console.log(`   ${'SERVICIO'.padEnd(16)}${'VECES'.padStart(7)}${'COSTO TOTAL'.padStart(15)}${'COSTO PROM.'.padStart(14)}`)
Object.entries(svc).sort((a,b)=>b[1].n-a[1].n).forEach(([s,d])=>{
  console.log(`   ${s.padEnd(16)}${String(d.n).padStart(7)}${money(d.costo).padStart(15)}${money(d.costo/d.n).padStart(14)}`)
})

// ========================= 5. ARQUETIPO DE TRABAJO =========================
console.log(`\n\n═══ 5. EL TRABAJO PROMEDIO: QUÉ COMBO PIDEN Y QUÉ DEJA ═══\n`)
const arq={}
p2026.forEach(p=>{
  const cats=[...new Set(p.items.map(i=>i.svc).filter(Boolean))].sort()
  if(!cats.length) return
  const k=cats.join(' + ')
  const a=arq[k]=arq[k]||{n:0,total:0,bruto:0,neto:0,costos:0}
  a.n++; a.total+=p.total; a.bruto+=p.margenBruto; a.neto+=p.margenBruto; a.costos+=p.costos
})
console.log(`   ${'COMBO'.padEnd(34)}${'N°'.padStart(4)}${'TICKET PROM'.padStart(14)}${'MARGEN %'.padStart(10)}${'NETO TOTAL'.padStart(15)}`)
Object.entries(arq).filter(([,d])=>d.n>=3).sort((a,b)=>b[1].neto-a[1].neto).slice(0,14).forEach(([k,d])=>{
  console.log(`   ${k.slice(0,33).padEnd(34)}${String(d.n).padStart(4)}${money(d.total/d.n).padStart(14)}${pct(d.neto,d.total).padStart(10)}${money(d.neto).padStart(15)}`)
})

// ========================= 6. CLIENTES =========================
console.log(`\n\n═══ 6. CLIENTES: QUIÉN TE DEJA PLATA DE VERDAD ═══\n`)
const cli={}
p2026.forEach(p=>{
  const k=p.cliente||p.agencia||'(sin nombre)'
  const c=cli[k]=cli[k]||{n:0,total:0,neto:0,costos:0}
  c.n++; c.total+=p.total; c.neto+=p.margenBruto; c.costos+=p.costos
})
const cliArr=Object.entries(cli).sort((a,b)=>b[1].neto-a[1].neto)
console.log(`   TOP 12 POR MARGEN NETO (no por facturación):\n`)
console.log(`   ${'CLIENTE'.padEnd(26)}${'TRAB'.padStart(5)}${'FACTURADO'.padStart(15)}${'NETO'.padStart(14)}${'MARGEN'.padStart(9)}`)
cliArr.slice(0,12).forEach(([k,d])=>{
  console.log(`   ${k.slice(0,25).padEnd(26)}${String(d.n).padStart(5)}${money(d.total).padStart(15)}${money(d.neto).padStart(14)}${pct(d.neto,d.total).padStart(9)}`)
})
const malos=cliArr.filter(([,d])=>d.neto<=0)
if(malos.length){
  console.log(`\n   ⚠️  CLIENTES QUE NO DEJAN NADA O DAN PÉRDIDA (${malos.length}):\n`)
  malos.slice(0,10).forEach(([k,d])=>console.log(`   ${k.slice(0,25).padEnd(26)}${String(d.n).padStart(5)}${money(d.total).padStart(15)}${money(d.neto).padStart(14)}${pct(d.neto,d.total).padStart(9)}`))
}

// ========================= 7. JUAN Y SOFI =========================
console.log(`\n\n═══ 7. JUAN Y SOFI: LO QUE PUSIERON VS LO QUE COBRARON ═══\n`)
const esJS=n=>/arauz|grenier\s+basavilbaso/i.test(String(n||''))
const quien=n=>/arauz/i.test(n)?'Juan':'Sofi'
// a) trabajo hecho como staff en proyectos
const trabajo={Juan:{n:0,monto:0},Sofi:{n:0,monto:0}}
p2026.forEach(p=>p.items.forEach(it=>{
  if(it.staff&&esJS(it.staff)){ const q=quien(it.staff); trabajo[q].n++; trabajo[q].monto+=it.costo }
}))
// b) lo que efectivamente les pagaron por esos trabajos
const pagado={Juan:{ade:0,pag:0,n:0},Sofi:{ade:0,pag:0,n:0}}
PAG.slice(1).forEach(row=>{
  const f=txt(row[1]); if(!esJS(f)) return
  const fp=fecha(row[0]); if(fp && fp.getFullYear()!==ANIO) return
  const q=quien(f); pagado[q].n++; pagado[q].ade+=num(row[6]); pagado[q].pag+=num(row[7])
})
// c) sueldos
const sueldos={Juan:{cobr:0,n:0},Sofi:{cobr:0,n:0}}
SUE.slice(1).forEach(row=>{
  const per=txt(row[2]); if(!/^(juan|sofi)$/i.test(per)) return
  if(txt(row[1])&&String(txt(row[1]))!==String(ANIO)) return
  const q=/juan/i.test(per)?'Juan':'Sofi'
  if(/^(si|sí|true|x)$/i.test(txt(row[6]))) { sueldos[q].cobr+=num(row[4]); sueldos[q].n++ }
})
;['Juan','Sofi'].forEach(q=>{
  console.log(`   ── ${q} ──`)
  console.log(`      trabajos hechos como staff : ${String(trabajo[q].n).padStart(3)}  valorizados en ${money(trabajo[q].monto)}`)
  console.log(`      registrado en PAGOS_STAFF  : ${String(pagado[q].n).padStart(3)}  adeudado ${money(pagado[q].ade)} · pagado ${money(pagado[q].pag)}`)
  console.log(`      pendiente de esos pagos    : ${money(pagado[q].ade-pagado[q].pag)}`)
  console.log(`      sueldos ${ANIO} cobrados      : ${String(sueldos[q].n).padStart(3)}  ${money(sueldos[q].cobr)}`)
  console.log('')
})
console.log(`   NOTA: "trabajos como staff" es lo que Juan/Sofi laburaron en proyectos.`)
console.log(`   Si el monto valorizado no se les pagó, esa plata quedó adentro de Magma.`)

// ========================= 8. LO QUE FALTA COBRAR =========================
const esTrue=v=>/^(TRUE|VERDADERO|SI|SÍ|X)$/i.test(txt(v))
const pc=FAC.slice(1).filter(f=>(txt(f[1])||txt(f[8]))&&!esTrue(f[4])&&num(f[12])>0)
const sinEmitir=pc.filter(f=>!txt(f[14]))
console.log(`\n\n═══ 8. PLATA EN LA CALLE ═══\n`)
console.log(`   Por cobrar total          ${money(pc.reduce((s,f)=>s+num(f[12]),0)).padStart(16)}   ${pc.length} facturas`)
console.log(`   ⚠️  sin factura emitida    ${money(sinEmitir.reduce((s,f)=>s+num(f[12]),0)).padStart(16)}   ${sinEmitir.length} filas`)
console.log(`\n   Eso es ${pct(sinEmitir.reduce((s,f)=>s+num(f[12]),0), pc.reduce((s,f)=>s+num(f[12]),0))} del por cobrar que NUNCA SE FACTURÓ.`)
console.log(`   A ${Math.round(margenBrutoPct*100)}% de margen neto, cobrar eso equivale a ${money(sinEmitir.reduce((s,f)=>s+num(f[12]),0)*margenBrutoPct)} de resultado.`)
console.log(`   Equivale a ${(sinEmitir.reduce((s,f)=>s+num(f[12]),0)/equilibrio).toFixed(1)} meses de facturación de equilibrio.`)
console.log('')
