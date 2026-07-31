/**
 * ¿Cuántas jornadas necesita un fijo (monotributista, sin cargas) para que convenga?
 * Benchmark real: Dani = $1.992.000/mes por ~21 jornadas = $94.857/jornada.
 * Solo lectura, todo cálculo.
 */
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const T_CAM=243080, T_EDI=120880          // tarifas reales medidas ene-jul 2026
const DEM_CAM=37.7, DEM_EDI=14.6          // jornadas/mes de demanda
const DIAS_RODAJE=13.4                    // techo de cámara: 1 jornada por día de rodaje
const DANI_COSTO=1992000, DANI_JORN=21

console.log(`\n${'█'.repeat(76)}\n  BENCHMARK: el modelo que ya usás con Dani\n${'█'.repeat(76)}`)
console.log(`  Dani: ${money(DANI_COSTO)}/mes por ~${DANI_JORN} jornadas = ${money(DANI_COSTO/DANI_JORN)}/jornada`)
console.log(`  Edición afuera: ${money(T_EDI)}/jornada  →  Dani sale ${Math.round((1-DANI_COSTO/DANI_JORN/T_EDI)*100)}% más barata`)
console.log(`  Cámara afuera:  ${money(T_CAM)}/jornada`)

console.log(`\n${'█'.repeat(76)}\n  ¿CUÁNTAS JORNADAS NECESITÁS PARA QUE CIERRE?\n${'█'.repeat(76)}`)
console.log(`  El fijo no puede hacer más de ${DIAS_RODAJE} jornadas de cámara/mes (no hay más días de rodaje).`)
console.log(`  Lo que sobra va a edición. Mix realista: hasta ${DIAS_RODAJE} cámara + el resto edición.\n`)
const PAGOS=[1200000,1500000,1800000,2000000,2200000,2500000]
console.log(`  ${'le pagás/mes'.padStart(13)}  ${'jornadas mín. p/ empatar'.padStart(24)}  ${'tarifa efectiva a 20 jorn'.padStart(26)}`)
PAGOS.forEach(M=>{
  // encontrar el mínimo N tal que valor(N) >= M, con N repartido cámara-primero
  let need=null
  for(let N=1;N<=25;N+=0.5){
    const c=Math.min(N,DIAS_RODAJE), e=Math.max(0,N-c)
    if(c*T_CAM+e*T_EDI>=M){need=N;break}
  }
  console.log(`  ${money(M).padStart(13)}  ${(need!==null?need+' jornadas':'no cierra').padStart(24)}  ${money(M/20).padStart(26)}`)
})

console.log(`\n${'━'.repeat(76)}\n  MATRIZ: ahorro mensual según jornadas y pago\n${'━'.repeat(76)}`)
const NS=[8,10,12,14,16,18,20,21]
process.stdout.write('  jorn/mes │')
PAGOS.forEach(M=>process.stdout.write(String(money(M)).padStart(12)))
console.log('\n  ─────────┼'+'─'.repeat(PAGOS.length*12))
NS.forEach(N=>{
  const c=Math.min(N,DIAS_RODAJE), e=Math.max(0,N-c)
  const val=c*T_CAM+e*T_EDI
  process.stdout.write(`  ${String(N).padStart(8)} │`)
  PAGOS.forEach(M=>{const a=val-M; process.stdout.write((a>0?'+':'')+Math.round(a/1000)+'k'.padStart(1))
    process.stdout.write(' '.repeat(Math.max(0,12-((a>0?'+':'')+Math.round(a/1000)+'k').length)))})
  console.log(`   (vale ${money(val)})`)
})
console.log(`\n  Cada celda = ahorro por mes. Positivo = ganás.`)

console.log(`\n${'━'.repeat(76)}\n  ESCENARIOS CONCRETOS\n${'━'.repeat(76)}`)
function esc(nom,M,cam,edi,nota){
  const val=cam*T_CAM+edi*T_EDI, a=val-M
  console.log(`\n▓ ${nom}`)
  console.log(`   ${cam} jornadas cámara + ${edi} de edición = ${cam+edi} jornadas/mes`)
  console.log(`   Vale a precio de mercado: ${money(val)}`)
  console.log(`   Le pagás:                 ${money(M)}`)
  console.log(`   AHORRO:                   ${money(a)}/mes  ·  ${money(a*12)}/año`)
  console.log(`   Tarifa efectiva que pagás: ${money(M/(cam+edi))}/jornada`)
  if(nota) console.log(`   ${nota}`)
}
esc('MEDIO TIEMPO — 10 jornadas',1200000,8,2,'~2 días por semana. El más fácil de arrancar y de cortar.')
esc('3/4 — 15 jornadas',1700000,12,3,'~3 días por semana.')
esc('FULL como Dani — 20 jornadas',1992000,13,7,'Mismo costo que Dani. Cámara al techo + edición de relleno.')
esc('FULL bien pago — 20 jornadas',2500000,13,7,'Si hay que pagar más para conseguir a alguien bueno con equipo.')

console.log(`\n${'━'.repeat(76)}\n  COMPARACIÓN CON LO QUE LUCHO YA FACTURA\n${'━'.repeat(76)}`)
const LUCHO_JORN=12.4, LUCHO_MES=1797428
console.log(`  Hoy: ${LUCHO_JORN} jornadas/mes por ${money(LUCHO_MES)} = ${money(LUCHO_MES/LUCHO_JORN)}/jornada`)
;[1900000,2100000,2300000].forEach(M=>{
  const val=13*T_CAM+7*T_EDI
  console.log(`\n  Si le ofrecés ${money(M)}/mes por 20 jornadas:`)
  console.log(`     él gana ${M>LUCHO_MES?'+':''}${money(M-LUCHO_MES)}/mes  ·  su tarifa efectiva baja a ${money(M/20)}/jornada`)
  console.log(`     vos comprás ${money(val)} de trabajo por ${money(M)}  →  ahorro ${money(val-M)}/mes (${money((val-M)*12)}/año)`)
})

console.log(`\n${'━'.repeat(76)}\n  ¿HAY DEMANDA PARA LLENARLE 20 JORNADAS?\n${'━'.repeat(76)}`)
console.log(`  Cámara disponible:  ${DEM_CAM} jornadas/mes (techo real por días de rodaje: ${DIAS_RODAJE})`)
console.log(`  Edición disponible: ${DEM_EDI} jornadas/mes`)
console.log(`  → Techo del fijo: ${DIAS_RODAJE} + ${DEM_EDI} = ${(DIAS_RODAJE+DEM_EDI).toFixed(1)} jornadas/mes`)
console.log(`  Con 20 jornadas usás ${Math.round(20/(DIAS_RODAJE+DEM_EDI)*100)}% de la demanda: SÍ hay trabajo.`)
console.log(`  ⚠ Pero la edición hoy la hacen Dani (fija) + Lulú (fija) + Bruno + otros.`)
console.log(`    Si el nuevo fijo come edición, la sacás de los freelancers, NO de Dani/Lulú (ya las pagás igual).`)
