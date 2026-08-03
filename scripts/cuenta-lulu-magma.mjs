/**
 * LA CUENTA DE LULÚ COMO TERCERA VÍA DE COBRO DE MAGMA.
 * Resúmenes Santander 514-020195/3 (Lucía María Grenier Basavilbaso, CUIL 27-41915665-0),
 * enero a julio 2026. Solo lectura — datos transcritos de los resúmenes.
 */
import { readFileSync } from 'fs'
const CSV='/private/tmp/claude-501/-Users-dronjuan-somos-magma-app/4f0a277d-4a95-4548-aa83-9cf7d4b12413/scratchpad/lulu.csv'
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const filas=readFileSync(CSV,'utf8').trim().split('\n').map(l=>{const [mes,tipo,quien,monto]=l.split(';');return {mes,tipo,quien,m:parseFloat(monto)||0}})
const sum=t=>filas.filter(f=>f.tipo===t).reduce((a,x)=>a+x.m,0)
const n=t=>filas.filter(f=>f.tipo===t).length

console.log(`\n${'█'.repeat(76)}\n  LA CUENTA DE LULÚ — tercera vía por donde circula la plata de Magma\n${'█'.repeat(76)}\n`)
console.log(`■ COBROS DE CLIENTES DE MAGMA EN SU CUENTA PERSONAL\n`)
const porCli={}
filas.filter(f=>f.tipo==='COBRO').forEach(f=>porCli[f.quien]=(porCli[f.quien]||0)+f.m)
Object.entries(porCli).sort((a,b)=>b[1]-a[1]).forEach(([c,v])=>console.log(`   ${c.padEnd(26)}${M(v).padStart(16)}`))
console.log(`   ${'─'.repeat(42)}`)
console.log(`   ${'TOTAL'.padEnd(26)}${M(sum('COBRO')).padStart(16)}   en ${n('COBRO')} operaciones`)

console.log(`\n■ LO QUE SALE DE ESA CUENTA\n`)
console.log(`   Pagos a freelancers de Magma       ${M(sum('FREELANCER')).padStart(15)}   ${n('FREELANCER')} pagos`)
console.log(`   Transferencias a Juan              ${M(sum('A_JUAN')).padStart(15)}   ${n('A_JUAN')} transferencias`)
console.log(`   Transferencias a Sofi              ${M(sum('A_SOFI')).padStart(15)}`)
console.log(`   Monotributo (débito ARCA)          ${M(sum('AFIP_ARCA')).padStart(15)}   ${n('AFIP_ARCA')} débitos`)
console.log(`   Retención SIRCREB (a nombre de Lulú) ${M(sum('SIRCREB')).padStart(13)}`)

console.log(`\n${'━'.repeat(76)}\n  EL MAPA COMPLETO — por dónde entró la cobranza de Magma (ene–jul 2026)\n${'━'.repeat(76)}\n`)
const magma=200725128, sofi=75231976, lulu=sum('COBRO')
const porCuenta=[['Cuenta de Magma (BBVA)',magma-sofi-lulu],['Cuenta personal de Sofi (Galicia)',sofi],['Cuenta personal de Lulú (Santander)',lulu]]
console.log(`   ${'cuenta'.padEnd(38)}${'monto'.padStart(16)}${'%'.padStart(8)}`)
porCuenta.forEach(([k,v])=>console.log(`   ${k.padEnd(38)}${M(v).padStart(16)}${(v/magma*100).toFixed(1).padStart(7)}%`))
console.log(`   ${'─'.repeat(62)}`)
console.log(`   ${'TOTAL COBRADO 2026'.padEnd(38)}${M(magma).padStart(16)}`)
console.log(`\n   → ${((sofi+lulu)/magma*100).toFixed(1)}% de la cobranza de Magma NO pasa por la cuenta de la empresa.`)
console.log(`     Son ${M(sofi+lulu)} en cuentas personales de dos personas distintas.`)
