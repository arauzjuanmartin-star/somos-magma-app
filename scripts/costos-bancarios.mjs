/**
 * COSTOS BANCARIOS BBVA — punto A.4 de la Práctica 2 de Mariana.
 * Procesa el extracto de la cuenta corriente 118-029419/7 y separa:
 *   · COSTO REAL de estructura (comisiones + su IVA)
 *   · IMPUESTO ley 25.413 (débitos y créditos) — es costo, pero 33% se computa contra Ganancias
 *   · RETENCIONES/PERCEPCIONES (SIRCREB, IVA) — NO son costo: son pago a cuenta, se recuperan
 * Solo lectura.
 */
import { readFileSync } from 'fs'
const CSV='/private/tmp/claude-501/-Users-dronjuan-somos-magma-app/4f0a277d-4a95-4548-aa83-9cf7d4b12413/scratchpad/mov.csv'
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const num=s=>{const v=parseFloat(String(s).replace(/\./g,'').replace(',','.'));return isNaN(v)?0:Math.abs(v)}

const filas=readFileSync(CSV,'utf8').trim().split('\n').map(l=>{const [f,c,m]=l.split(';');return {f,c,m:num(m)}})
function clase(c){
  if(/IMPUESTO LEY|LEY NRO 25\.4/i.test(c)) return 'LEY25413'
  if(/REG REC SIRC/i.test(c))               return 'SIRCREB'
  if(/PERCEPCION|PERC\.CABA/i.test(c))      return 'PERCEPCION'
  if(/COMISION|COM\.TRANSF|OG-GESTION/i.test(c)) return 'COMISION'
  if(/IVA TASA GRA/i.test(c))               return 'IVA_COMISION'
  if(/OP\.TITULOS/i.test(c))                return 'COMISION'
  return 'OPERATIVO'
}
const g={}
filas.forEach(x=>{const k=clase(x.c); if(k==='OPERATIVO')return; (g[k]=g[k]||{n:0,$:0}); g[k].n++; g[k].$+=x.m})

console.log(`\n${'█'.repeat(76)}\n  COSTOS BANCARIOS BBVA — cuenta corriente, 60 días (jun–jul 2026)\n${'█'.repeat(76)}\n`)
const etiq={COMISION:'Comisiones (transferencia, gestión, custodia)',IVA_COMISION:'IVA sobre esas comisiones',
  LEY25413:'Impuesto ley 25.413 (débitos y créditos)',SIRCREB:'Retención SIRCREB (IIBB)',PERCEPCION:'Percepciones IVA / CABA'}
console.log(`  ${'concepto'.padEnd(46)}${'veces'.padStart(7)}${'60 días'.padStart(15)}${'por mes'.padStart(14)}`)
Object.entries(g).sort((a,b)=>b[1].$-a[1].$).forEach(([k,v])=>
  console.log(`  ${etiq[k].padEnd(46)}${String(v.n).padStart(7)}${M(v.$).padStart(15)}${M(v.$/2).padStart(14)}`))

const costoReal=(g.COMISION?.$||0)+(g.IVA_COMISION?.$||0)
const ley=g.LEY25413?.$||0
const recuperable=(g.SIRCREB?.$||0)+(g.PERCEPCION?.$||0)
console.log(`\n${'─'.repeat(76)}`)
console.log(`  COSTO REAL de estructura (comisiones + IVA)   ${M(costoReal).padStart(14)} → ${M(costoReal/2)}/mes`)
console.log(`  Impuesto ley 25.413                           ${M(ley).padStart(14)} → ${M(ley/2)}/mes`)
console.log(`  ${'─'.repeat(72)}`)
console.log(`  TOTAL COSTO BANCARIO                          ${M(costoReal+ley).padStart(14)} → ${M((costoReal+ley)/2)}/mes`)
console.log(`\n  NO son costo (son pago a cuenta, se recuperan):`)
console.log(`  Retenciones y percepciones                    ${M(recuperable).padStart(14)} → ${M(recuperable/2)}/mes`)

// serie oficial del banco (cuadro de los resúmenes mensuales)
console.log(`\n${'━'.repeat(76)}\n  IMPUESTO LEY 25.413 — cuadro oficial de los resúmenes mensuales\n${'━'.repeat(76)}\n`)
const serie=[
 ['Febrero',7260.00,2395.80],['Marzo',117259.15+11216.84,38695.52+3701.56],
 ['Abril',249360.46+258.25,82288.95+85.22],['Mayo',255373.21,84273.16],
]
console.log(`  ${'mes'.padEnd(10)}${'retenido'.padStart(14)}${'computable contra Ganancias'.padStart(30)}`)
let tr=0,tc=0
serie.forEach(([m,r,c])=>{tr+=r;tc+=c;console.log(`  ${m.padEnd(10)}${M(r).padStart(14)}${M(c).padStart(30)}`)})
console.log(`  ${'─'.repeat(54)}`)
console.log(`  ${'feb–may'.padEnd(10)}${M(tr).padStart(14)}${M(tc).padStart(30)}`)
console.log(`  promedio mensual: ${M(tr/4)}   ·   recuperable: ${M(tc/4)}/mes (${Math.round(tc/tr*100)}%)`)
console.log(`\n  → El impuesto es costo, pero UN TERCIO se computa contra Ganancias.`)
console.log(`    Costo NETO del impuesto: ${M((tr-tc)/4)}/mes`)
