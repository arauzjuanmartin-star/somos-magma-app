/** Techo salarial para la reunión del 21/08 — estructura nueva vs equilibrio vs caja de Popstars */
const M=n=>(n<0?'-$':'$')+Math.abs(Math.round(n)).toLocaleString('es-AR')
const P=(s,n)=>console.log(s.padEnd(46),M(n).padStart(14))

// === DATOS VERIFICADOS DEL SHEET (ene-ago 2026) ===
const HOY={
  lulu_fijo:1300000, lulu_extras:798750, lulu_extras_edicion:535000,   // costo-equipo-interno.mjs
  tom_fijo:1300000,  tom_extras:303750,  tom_extras_asist:267500,
  edicion_externa:1053600,        // 7,6 ediciones/mes compradas afuera
  camara_externa:6749125,         // 24,9 líneas/mes
  lucho:1929375,                  // Jorge Luis Chavez, 96 trabajos en 8 meses
  cm_maria:300000,                // GASTOS_FIJOS: 'CM (María)' $300.000 — el $1,02M del snapshot estaba mal
  estructura:18999717,            // equilibrio.mjs
  produccion_ritmo:33132427,      // ritmo real ene-jul
  margen:0.50, ticket:1299419,
}
const eventos=p=>p/HOY.ticket
const necesario=e=>e/HOY.margen

console.log('\n████ 1. LO QUE COBRA CADA UNO HOY (real, no el fijo) ████')
P('Lulu  (fijo + extras)', HOY.lulu_fijo+HOY.lulu_extras)
P('Tom   (fijo + extras)', HOY.tom_fijo+HOY.tom_extras)
P('Lucho (freelance, 12 trabajos/mes)', HOY.lucho)
P('Edición comprada afuera', HOY.edicion_externa)
P('  + ediciones que hace Lulu', HOY.lulu_extras_edicion)
P('  = caudal total de edición', HOY.edicion_externa+HOY.lulu_extras_edicion)
P('CM (María)', HOY.cm_maria)

console.log('\n████ 2. ESCENARIOS DE ESTRUCTURA NUEVA ████')
const esc=(nombre,{lulu,tom,sol,editor,lucho,maria_sale=false,ed_afuera_queda=0,cam_afuera_baja=0,dani_ajuste=0})=>{
  const antes=HOY.lulu_fijo+HOY.lulu_extras+HOY.tom_fijo+HOY.tom_extras+HOY.lucho+HOY.edicion_externa+HOY.cm_maria
  const desp = lulu+tom+(sol||0)+(editor||0)+(lucho||HOY.lucho)+ed_afuera_queda+(maria_sale?0:HOY.cm_maria)-cam_afuera_baja+dani_ajuste
  const delta=desp-antes
  const est=HOY.estructura+delta
  console.log(`\n── ${nombre}`)
  console.log(`   Lulu ${M(lulu)} · Tom ${M(tom)}${sol?' · Sol '+M(sol):''}${editor?' · Editor '+M(editor):''}${lucho?' · Lucho fijo '+M(lucho):''}${maria_sale?' · sin María':''}`)
  P('   antes (mismo perímetro)',antes); P('   después',desp)
  P('   Δ estructura mensual',delta)
  P('   estructura total',est)
  const prod=necesario(est)
  console.log(`   → hay que producir ${M(prod)}/mes = ${eventos(prod).toFixed(0)} eventos  (hoy ${eventos(HOY.produccion_ritmo).toFixed(0)}, faltan ${(eventos(prod)-eventos(HOY.produccion_ritmo)).toFixed(0)})`)
  return delta
}
const D_A=esc('A · Solo los aumentos (mañana, nada más)',{lulu:2500000,tom:2200000,ed_afuera_queda:HOY.edicion_externa+HOY.lulu_extras_edicion})
esc('B · Aumentos + editor fijo $1,4M',{lulu:2500000,tom:2200000,editor:1400000,ed_afuera_queda:400000})
const D_D=esc('D · Aumentos + editor + Sol $1,2M (María se va)',{lulu:2500000,tom:2200000,editor:1400000,sol:1200000,ed_afuera_queda:400000,maria_sale:true})
const D_E=esc('E · TODO + Lucho fijo $1,9M (ahorra 4 jorn/mes de cámara)',{lulu:2500000,tom:2200000,editor:1400000,sol:1200000,lucho:1900000,ed_afuera_queda:400000,maria_sale:true,cam_afuera_baja:1000000})
const D_F=esc('F · E + ajuste de Dani en octubre (+15%)',{lulu:2500000,tom:2200000,editor:1400000,sol:1200000,lucho:1900000,ed_afuera_queda:400000,maria_sale:true,cam_afuera_baja:1000000,dani_ajuste:285000})

console.log('\n████ 2b. CUÁNTO PUEDE COSTAR SOL ████')
console.log('   Sol hace 4 cosas: PM Popstars + community de Magma + creativa Mani King + referencias')
P('   Lo que se libera: María (CM)', HOY.cm_maria)
console.log('   Referencias internas: Tom cobra $1.603.750 · Lulu $2.098.750 · Dani $2.025.345')
;[['Piso   ',900000],['Recomendado',1200000],['TECHO  ',1500000]].forEach(([k,v])=>
  console.log(`   ${k}  ${M(v).padStart(12)}  → neto sobre estructura ${M(v-HOY.cm_maria).padStart(12)}`))
console.log('   Arriba de $1,5M Sol cuesta casi lo mismo que Tom, sin cartera propia ni historia.')

console.log('\n████ 3. POPSTARS — qué banca y cuándo entra ████')
const POP={total:15000000, staff:6280000, meses:2}
P('Producción Popstars', POP.total); P('Staff cargado', POP.staff)
P('Margen Magma del proyecto', POP.total-POP.staff)
P('  por mes (2 meses)', (POP.total-POP.staff)/POP.meses)
console.log('\n   Cobro: factura 31/10 → 90 días → cobra 29/01/2027')
console.log('   Facturando por avance (31/8, 30/9, 31/10) → entra 30/11, 30/12, 29/01')
const meses=['sep','oct','nov','dic']
console.log('\n   Sueldos nuevos que se pagan ANTES de cobrar un peso de Popstars (sep-dic):')
;[['A · solo aumentos',D_A],['D · + editor + Sol',D_D],['E · todo con Lucho fijo',D_E]].forEach(([n,d])=>
  console.log(`   ${n.padEnd(26)} ${M(d).padStart(12)}/mes × 4 meses = ${M(d*4).padStart(13)} puestos de la caja`))
console.log('   (y eso sin contar los $9,0M de freelancers + IVA que Popstars pide por adelantado)')
console.log('\n   Popstars deja $4.360.000/mes de margen mientras dura — pero se cobra en enero.')
console.log('   La estructura nueva se paga todos los meses, también en nov y dic cuando Popstars ya terminó.')

console.log('\n████ 3b. TEMPORADA ALTA — el editor NO se queda sin trabajo ████')
console.log('   2025 (HISTORICO_2025, 458 proyectos):')
console.log('     ene-ago  32,6 proyectos/mes')
console.log('     sep-dic  49,3 proyectos/mes   = +51%   (nov fue el mes más grande del año: $51,7M)')
console.log('   Popstars termina el 21/10 y empalma con nov-dic.')
console.log(`   Caudal de edición base 12/mes × 1,51 = ~18/mes en temporada alta.`)
console.log('   (No se pudo medir la edición de 2025: HISTORICO_2025 no tiene columnas de Servicio.)')

console.log('\n████ 4. EL TECHO PARA MAÑANA ████')
const techo=(quien,hoy_cobra,recomendado,maximo,nota)=>{
  console.log(`\n${quien}  — hoy se lleva ${M(hoy_cobra)}/mes`)
  console.log(`   Recomendado: ${M(recomendado)}  (+${M(recomendado-hoy_cobra)} = ${((recomendado/hoy_cobra-1)*100).toFixed(0)}% real)`)
  console.log(`   TECHO:       ${M(maximo)}  (+${M(maximo-hoy_cobra)} = ${((maximo/hoy_cobra-1)*100).toFixed(0)}%)`)
  console.log(`   ${nota}`)}
techo('LULU',2098750,2500000,2700000,'Sin edición: el editor le saca $535.000/mes de ingreso. A $2,5M igual gana más que hoy en 7 de los últimos 8 meses.')
techo('TOM',1603750,2200000,2400000,'Con asistencia incluida ($267.500/mes que hoy cobra aparte). Es el salto más grande en %: +37%.')
