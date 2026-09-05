// Análisis del deal Telefe Popstars a $15M — verifica cada número contra el sheet
const fmt = n => '$' + Math.round(n).toLocaleString('es-AR')
const PRECIO = 15_000_000

// Fórmula Magma verificada contra presu #2150 (ver reference_proyectos_estructura_precio)
// Total = costo + fee(=costo) + 35%*fee + 4%*fee  =>  Total = costo * 2.39
const K = 2.39
console.log('=== 1. VERIFICACIÓN DE LA FÓRMULA contra presu #2150 ===')
const c2150 = 5_440_000
console.log(`  costo ${fmt(c2150)} x 2,39 = ${fmt(c2150*K)}  (el sheet dice $13.000.000) ✓`)

console.log('\n=== 2. CUÁNTO COSTO BANCA $15.000.000 ===')
const costoBanca = PRECIO / K
console.log(`  ${fmt(PRECIO)} / 2,39 = ${fmt(costoBanca)} de freelancers`)

console.log('\n=== 3. QUÉ SE LLEVAN LAS 12 JORNADAS (tarifas reales pagadas) ===')
const escenariosJ = { 'media jornada (Video ½ $220.000)':220_000, 'jornada entera (Video 1 $290.000)':290_000, 'jornada 12hs (Film 12hs $350.000)':350_000 }
for (const [k,v] of Object.entries(escenariosJ)) {
  const j = 12*v, resto = costoBanca - j
  console.log(`  ${k.padEnd(38)} 12 x ${fmt(v)} = ${fmt(j)}  → quedan ${fmt(resto)} para 25 contenidos = ${fmt(resto/25)} c/u`)
}

console.log('\n=== 4. QUÉ PAGA MAGMA DE VERDAD POR UN CONTENIDO (PAGOS_STAFF 2026) ===')
const edits = { 'Edit 60s (mediana pagada)':70_000, 'Edit 60s (promedio pagado)':95_180, 'Edit 60s+ (mediana pagada)':170_000, 'Edit 60s+ (promedio pagado)':179_091 }
const J = 12*290_000
for (const [k,v] of Object.entries(edits)) {
  const total = J + 25*v
  const precioNec = total*K
  const dif = PRECIO - precioNec
  console.log(`  ${k.padEnd(30)} 25 x ${fmt(v)} = ${fmt(25*v)} | costo total ${fmt(total)} | precio que pide la fórmula ${fmt(precioNec)} | ${dif>=0?'✅ sobran '+fmt(dif):'🔴 faltan '+fmt(-dif)}`)
}

console.log('\n=== 5. MARGEN REAL (definición de Juan: facturado sin IVA − freelancers) ===')
const casos = [
  ['OPTIMISTA  · 12 medias + 25 Edit 60s',      12*220_000 + 25*70_000],
  ['REALISTA   · 12 enteras + 25 Edit 60s',     12*290_000 + 25*95_180],
  ['PESIMISTA  · 12 enteras + 25 Edit 60s+',    12*290_000 + 25*170_000],
]
const VIAT = 0.086 // viáticos reales medidos = 8,6% (practica3)
for (const [k,costo] of casos) {
  const viat = costo*VIAT
  const margen = PRECIO - costo - viat
  console.log(`  ${k.padEnd(40)} freelance ${fmt(costo)} + viáticos ${fmt(viat)} → margen ${fmt(margen)} (${(margen/PRECIO*100).toFixed(0)}%)`)
}

console.log('\n=== 6. EL PM (la línea que nadie cotizó) ===')
const sueldoPM = 1_300_000 // Lulu / Tom en SUELDOS 2026
console.log(`  10 semanas = 2,5 meses. Sueldo tipo PM en SUELDOS 2026: ${fmt(sueldoPM)}/mes`)
;[0.3,0.5,1].forEach(d=>console.log(`    dedicación ${d*100}% → ${fmt(sueldoPM*2.5*d)} = ${(sueldoPM*2.5*d/PRECIO*100).toFixed(1)}% del deal`))

console.log('\n=== 7. LA CAJA (esto es lo que duele) ===')
const costoReal = 12*290_000 + 25*95_180
const iva = PRECIO*0.21
console.log(`  Facturás ${fmt(PRECIO)} + IVA ${fmt(iva)} = ${fmt(PRECIO+iva)}`)
console.log(`  Cobrás a 90 días de la factura. Al staff le pagás el 15 del mes siguiente al trabajo.`)
console.log(`  → Si facturás TODO al final (31/10): cobrás ~29/01/2027.`)
console.log(`     Antes de eso ponés de tu bolsillo: freelancers ${fmt(costoReal)} + IVA ${fmt(iva)} = ${fmt(costoReal+iva)}`)
console.log(`  → Si facturás por avance (31/8, 30/9, 31/10): cobrás 29/11, 29/12, 29/01. Adelantás 2 meses ${fmt((PRECIO+iva)*2/3)}.`)

console.log('\n=== 8. PRECIO DE LOS ADICIONALES (fórmula Magma, para fijarlo AHORA) ===')
;[['Jornada presencial entera',290_000],['Jornada 12hs',350_000],['Contenido digital simple (60s)',116_000],['Contenido con motion/placas (60s+)',174_000]].forEach(([k,c])=>{
  console.log(`  ${k.padEnd(34)} costo ${fmt(c)} → precio ${fmt(c*K)} → a cobrar ${fmt(Math.ceil(c*K/50_000)*50_000)}`)
})

console.log('\n=== 9. CONTRASTE: qué pasó con el alcance entre la v2 y hoy ===')
console.log('  v2 (17/08, sobre el brief del 14/08): 23 jornadas · 50 reels · 8 semanas')
const v2 = 23*290_000 + 50*116_000
console.log(`     costo ${fmt(v2)} → precio fórmula ${fmt(v2*K)}  ← "casi el doble" que dijo Juan ✓`)
console.log('  hoy: 12 jornadas · 25 contenidos · 10 SEMANAS')
console.log(`     jornadas -48% · contenidos -50% · precio -${(100-PRECIO/(v2*K)*100).toFixed(0)}% · acompañamiento +25% ⚠️`)
