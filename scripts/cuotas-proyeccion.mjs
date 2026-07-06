// Proyección de cuotas de tarjeta pendientes (las que marcamos en los 3 resúmenes de julio).
// La "cuota actual" se paga en el resumen de julio; las restantes caen a partir de AGOSTO/26.
const fmt = n => Math.round(n).toLocaleString('es-AR')
// {comercio, tarjeta, persona, montoCuota, actual, total}
const cuotas = [
  // SANTANDER (Juan personal)
  ['AILES SA (grande)','Santander','Juan',304148.88,6,9],
  ['AILES SA (chica)','Santander','Juan',26666.11,4,9],
  ['Chipote','Santander','Juan',6177.84,1,9],
  ['DF Festival','Santander','Juan',107500,1,6],
  // GALICIA
  ['Bidcom','Galicia','Magma',32349.66,2,3],
  // BBVA Juan
  ['Rouge','BBVA','Juan',45000,3,9],
  ['Chipote (BBVA)','BBVA','Juan',2666.66,3,6],
  ['Topper','BBVA','Juan',26033,2,3],
  ['PasajesCDP','BBVA','Juan',59756.66,2,3],
  ['Equus','BBVA','Juan',64616.62,2,6],
  // BBVA Magma
  ['MercadoLibre','BBVA','Magma',28498.50,2,6],
  ['Svccomar','BBVA','Magma',24405.32,1,6],
  ['Gamestation','BBVA','Magma',51416.50,1,6],
  ['GangaHome','BBVA','Magma',20150.88,3,9],
  // BBVA Sofi
  ['Florian','BBVA','Sofi',46325,3,12],
  ['Luboloque','BBVA','Sofi',8333.33,3,6],
  ['47 Street','BBVA','Sofi',23091.38,2,6],
  ['Zara','BBVA','Sofi',36550.96,2,3],
  ['Las Pepas','BBVA','Sofi',59966.66,2,3],
  ['Toyota','BBVA','Sofi',158329.18,2,3],
  ['Mishka','BBVA','Sofi',67465.59,1,6],
].map(([comercio,tarjeta,persona,montoCuota,actual,total])=>({comercio,tarjeta,persona,montoCuota,actual,total,rem:total-actual}))

const MESES = ['Ago/26','Sep/26','Oct/26','Nov/26','Dic/26','Ene/27','Feb/27','Mar/27','Abr/27']
const proj = MESES.map(()=>({Juan:0,Sofi:0,Magma:0}))
for (const c of cuotas) for (let k=0;k<c.rem;k++) if(k<MESES.length) proj[k][c.persona]+=c.montoCuota

console.log('=== CUOTAS PENDIENTES (compromiso ya asumido) ===')
const totPers=p=>cuotas.filter(c=>c.persona===p).reduce((s,c)=>s+c.montoCuota*c.rem,0)
console.log(`Total a pagar en cuotas futuras: Juan $${fmt(totPers('Juan'))} · Sofi $${fmt(totPers('Sofi'))} · Magma $${fmt(totPers('Magma'))}`)
console.log(`(${cuotas.filter(c=>c.rem>0).length} compras en cuotas activas)\n`)

console.log('=== CÓMO ARRANCA CADA MES (solo cuotas ya comprometidas) ===')
console.log('Mes'.padEnd(8), 'Juan'.padStart(12), 'Sofi'.padStart(12), 'Magma'.padStart(12), 'TOTAL'.padStart(13))
proj.forEach((m,i)=>{
  const tot=m.Juan+m.Sofi+m.Magma
  if(tot>0) console.log(MESES[i].padEnd(8), ('$'+fmt(m.Juan)).padStart(12), ('$'+fmt(m.Sofi)).padStart(12), ('$'+fmt(m.Magma)).padStart(12), ('$'+fmt(tot)).padStart(13))
})

console.log('\n=== DETALLE por compra (faltan / hasta) ===')
const MM=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
cuotas.filter(c=>c.rem>0).sort((a,b)=>b.montoCuota*b.rem-a.montoCuota*a.rem).forEach(c=>{
  const finMes=(6+c.rem)%12, finAnio=2026+Math.floor((6+c.rem)/12) // jul=6 base
  console.log(`  ${c.persona.padEnd(5)} ${c.comercio.padEnd(20)} $${fmt(c.montoCuota).padStart(9)}/mes · cuota ${c.actual}/${c.total} · faltan ${c.rem} · hasta ${MM[finMes]}/${finAnio} (${c.tarjeta})`)
})
