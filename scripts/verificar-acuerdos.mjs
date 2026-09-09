/**
 * Verifica los dos cambios del 02/09/2026:
 *  1. el aviso de jornadas (solapa ACUERDOS + conteo real de PROYECTOS)
 *  2. el multiplicador de margen (MULT_MARGEN) contra el precio final
 * Solo lectura.
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { acuerdosVigentes, avisoJornada, esJornada } from '../lib/acuerdos.js'
import { jornadasDePersona, repartoDelMes } from '../lib/jornadas.js'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const obj=v=>{const h=v[0]||[];return v.slice(1).filter(r=>r.some(c=>c!=='')).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))}
// PROYECTOS: en el sheet los slots 1-12 tienen "Precio"/"Staff" sin numerar. Los numera
// toProyectos() en lib/sheets.js — replicado acá para verificar contra lo que ve la app.
const objProy=v=>{const h=v[0]||[];return v.slice(1).filter(r=>r.some(c=>c!=='')).map(r=>{
  const o={}; let st=0,pc=0
  h.forEach((k,i)=>{ if(k==='Staff'){st++;o['Staff '+st]=r[i]||''} else if(k==='Precio'){pc++;o['Precio '+pc]=r[i]||''} else o[k]=r[i]||'' })
  return o })}

const R=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['ACUERDOS!A:U','PROYECTOS!A:EV']})
const acuerdos=obj(R.data.valueRanges[0].values||[])
const proyectos=objProy(R.data.valueRanges[1].values||[])

console.log('\n'+'█'.repeat(74))
console.log('  VERIFICACIÓN · aviso de jornadas + margen +5%')
console.log('█'.repeat(74))

// ── 1. Acuerdos que la app va a leer
const hoy=new Date(2026,8,15)   // un día de septiembre, con los dos acuerdos vigentes
const vig=acuerdosVigentes(acuerdos, hoy)
console.log(`\n  ACUERDOS VIGENTES al 15/09/2026: ${vig.length}`)
vig.forEach(a=>console.log(`    ${a.persona.padEnd(20)} ${M(a.precio).padStart(10)}/${a.unidad.split(' ')[0].toLowerCase()}` +
  (a.minimo?`  · mínimo ${a.minimo}/mes, extra ${M(a.precioExtra)}`:'  · sin mínimo') + `  → ${a.alcance}`))
if(vig.length!==2) console.log('  ✗ esperaba 2')

// ── 2. Simulación mes a mes: qué diría el aviso al cargar cada jornada de Lucho
const lucho=vig.find(a=>/chavez/i.test(a.persona))
console.log(`\n  SIMULACIÓN — cargando las jornadas de ${lucho.persona} mes a mes (datos reales 2026)`)
console.log('     mes   jornadas reales    lo que iría diciendo el aviso            costo del mes')
const MES=['','ene','feb','mar','abr','may','jun','jul','ago']
let okTot=0
for(let m=1;m<=8;m++){
  const n=jornadasDePersona(proyectos, lucho.keys, m, 2026)
  let costo=0; const muestras=[]
  for(let k=0;k<n;k++){ const a=avisoJornada(lucho,k); costo+=a.precio
    if(k===0||k===lucho.minimo-1||k===lucho.minimo||k===n-1) muestras.push(`${a.contador} ${M(a.precio)}`) }
  // el mínimo se paga aunque no se llegue
  const costoReal=Math.max(costo, n>0?lucho.montoMinimo:0)
  console.log(`     ${MES[m]}   ${String(n).padStart(2)}  ${'█'.repeat(n).padEnd(16)} ${[...new Set(muestras)].join(' → ').padEnd(40)} ${M(costoReal).padStart(12)}`)
  okTot++
}
console.log(`\n  Chequeo del corte en el mínimo (${lucho.minimo}):`)
;[1,9,10,11,14].forEach(k=>{ const a=avisoJornada(lucho,k-1)
  const esperado = k<=lucho.minimo ? lucho.precio : lucho.precioExtra
  console.log(`    jornada ${String(k).padStart(2)} → "${a.contador} · ${M(a.precio)} · ${a.nota}"  ${a.precio===esperado?'✓':'✗ esperaba '+M(esperado)}`)})

const juani=vig.find(a=>/gugliot/i.test(a.persona))
console.log(`\n  ${juani.persona} — sin mínimo, todas al mismo precio:`)
;[1,7,12].forEach(k=>{ const a=avisoJornada(juani,k-1)
  console.log(`    cobertura ${String(k).padStart(2)} → "${a.contador} · ${M(a.precio)} · ${a.nota}"  ${a.precio===juani.precio?'✓':'✗'}`)})

// ── 3. Qué NO cuenta como jornada
console.log('\n  Lo que NO suma jornada (edición y viáticos quedaron fuera del acuerdo):')
;['🎥 Video ½','Cobertura','Edición','Edicion de video','Viático','Viatico Pilar','Foto entera'].forEach(sv=>
  console.log(`    ${esJornada(sv)?'cuenta   ':'NO cuenta'}  ${sv}`))

// ── 3.5 Reparto del mes: el gráfico y el contador del formulario tienen que dar igual
console.log('\n'+'─'.repeat(74))
console.log('  REPARTO DEL MES — lo que muestra el gráfico de Freelancers / Pagos Staff')
console.log('─'.repeat(74))
let coinciden=0, difieren=0
for(const m of [7,8,9]){
  const rep=repartoDelMes(proyectos, m, 2026)
  const tot=rep.reduce((s,x)=>s+x.jornadas,0)
  console.log(`\n  ${['','ene','feb','mar','abr','may','jun','julio','agosto','septiembre'][m]} 2026 — ${tot} convocatorias entre ${rep.length} personas`)
  rep.slice(0,8).forEach(x=>{
    // el mismo número que muestra el formulario de staff al lado del nombre
    const delFormulario=jornadasDePersona(proyectos, [x.key], m, 2026)
    const ok = delFormulario===x.jornadas
    if(ok) coinciden++; else difieren++
    console.log(`    ${String(x.jornadas).padStart(3)}  ${'█'.repeat(Math.min(24,x.jornadas)).padEnd(24)} ${x.nombre.padEnd(34)} ${M(x.monto).padStart(12)}  ${ok?'✓':'✗ el formulario dice '+delFormulario}`)
  })
}
console.log(`\n  Gráfico vs contador del formulario: ${coinciden} coinciden${difieren?`, ${difieren} NO`:''}  ${difieren?'✗':'✓'}`)

// ── 4. El margen +5%
console.log('\n'+'─'.repeat(74))
console.log('  MARGEN — MULT_MARGEN 1,086 (era 1)')
console.log('─'.repeat(74))
const MULT=parseFloat(readFileSync('lib/desglose.js','utf8').match(/MULT_MARGEN\s*=\s*([\d.]+)/)[1])
console.log(`  leído de lib/desglose.js: ${MULT}\n`)
console.log('     costo staff        antes        ahora      sube')
for(const costo of [130000,190000,220000,400000,1500000]){
  const t=(k)=>{ const fee=costo*k; return costo+fee+fee*0.35+fee*0.04 }
  const a=t(1), b=t(MULT), d=(b/a-1)*100
  console.log(`     ${M(costo).padStart(11)}  ${M(a).padStart(11)}  ${M(b).padStart(11)}   ${d.toFixed(1)}%  ${Math.abs(d-5)<0.05?'✓':'✗'}`)
}
console.log(`\n  El freelancer sigue cobrando el costo: el 5% es margen de Magma.\n`)
