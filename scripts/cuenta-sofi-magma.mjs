/**
 * LA CUENTA DE SOFI COMO CUENTA OPERATIVA DE MAGMA.
 * Los resúmenes de la caja de ahorro Galicia de Sofía (4014487-8 212-4, CUIT 27-37995971-2)
 * muestran que la operación de Magma pasa por su cuenta personal: cobros de clientes,
 * pagos a freelancers, planes de pago de AFIP y retenciones.
 * Solo lectura — datos transcritos de los resúmenes ene-jun 2026.
 */
import { readFileSync } from 'fs'
const CSV='/private/tmp/claude-501/-Users-dronjuan-somos-magma-app/4f0a277d-4a95-4548-aa83-9cf7d4b12413/scratchpad/sofi.csv'
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const MESES=['ene','feb','mar','abr','may','jun']
const filas=readFileSync(CSV,'utf8').trim().split('\n').map(l=>{const [mes,tipo,quien,monto]=l.split(';');return {mes,tipo,quien,m:parseFloat(monto)||0}})

console.log(`\n${'█'.repeat(78)}\n  LA CUENTA PERSONAL DE SOFI COMO CUENTA OPERATIVA DE MAGMA\n${'█'.repeat(78)}`)

const cobros=filas.filter(f=>f.tipo==='COBRO')
console.log(`\n■ COBROS DE CLIENTES DE MAGMA QUE ENTRARON A SU CUENTA PERSONAL\n`)
console.log(`  ${'mes'.padEnd(6)}${'operaciones'.padStart(13)}${'monto'.padStart(18)}`)
let tot=0
MESES.forEach(m=>{const d=cobros.filter(f=>f.mes===m); if(!d.length)return
  const s=d.reduce((a,x)=>a+x.m,0); tot+=s
  console.log(`  ${m.padEnd(6)}${String(d.length).padStart(13)}${M(s).padStart(18)}`)})
console.log(`  ${'─'.repeat(37)}`)
console.log(`  ${'TOTAL'.padEnd(6)}${String(cobros.length).padStart(13)}${M(tot).padStart(18)}`)

console.log(`\n  por cliente:`)
const porCli={}
cobros.forEach(f=>porCli[f.quien]=(porCli[f.quien]||0)+f.m)
Object.entries(porCli).sort((a,b)=>b[1]-a[1]).forEach(([c,v])=>
  console.log(`     ${c.padEnd(26)}${M(v).padStart(16)}`))

const afip=filas.filter(f=>f.tipo==='AFIP')
const sirc=filas.filter(f=>f.tipo==='SIRCREB')
const sueldo=filas.filter(f=>f.tipo==='SUELDO_MAGMA'&&f.m>0)
console.log(`\n■ OTROS MOVIMIENTOS DE MAGMA EN SU CUENTA\n`)
console.log(`  Planes de pago AFIP (RG5321) debitados:  ${M(afip.reduce((a,x)=>a+x.m,0)).padStart(16)}  en ${afip.length} débitos`)
console.log(`  Retención SIRCREB (a nombre de Sofi):    ${M(sirc.reduce((a,x)=>a+x.m,0)).padStart(16)}`)
console.log(`  Sueldos que Magma le transfirió:         ${M(sueldo.reduce((a,x)=>a+x.m,0)).padStart(16)}  en ${sueldo.length} transferencias`)
sueldo.forEach(s=>console.log(`       ${s.mes}  ${M(s.m)}`))

console.log(`\n${'━'.repeat(78)}\n  ⚠ LO QUE ESTO CAMBIA EN LA CUENTA DE SOCIOS\n${'━'.repeat(78)}`)
console.log(`  Sofi declaró haber recibido de Magma en concepto de haberes:  ${M(2800000)}`)
console.log(`  Los extractos muestran:                                       ${M(sueldo.reduce((a,x)=>a+x.m,0))}`)
console.log(`  Diferencia sin declarar:                                      ${M(sueldo.reduce((a,x)=>a+x.m,0)-2800000)}`)
console.log(`\n  Su saldo a favor pasaría de ${M(8956666)} a ${M(8956666-(sueldo.reduce((a,x)=>a+x.m,0)-2800000))}`)
console.log(`  ⚠ PERO hay que confirmarlo: de esa misma cuenta salen pagos a freelancers de Magma,`)
console.log(`    así que parte de ese dinero pudo entrar para pagar la operación, no como sueldo.`)
