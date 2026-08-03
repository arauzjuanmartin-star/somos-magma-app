/**
 * FORMATO DE RODAJE — los proyectos del año, cada uno en UN solo formato.
 *
 * Regla de oro de este script: la suma de los formatos tiene que dar el total.
 * Nada de "proyectos con jornada de cámara" por un lado y otro corte por otro:
 * un proyecto entra en un formato y solo uno, y los de solo edición también están.
 *
 * MARGEN = lo facturado (sin IVA) − lo que se le paga a freelancers. Y nada más.
 * Adentro de ese margen quedan tres cosas que se muestran por separado:
 *   · in house  — trabajo hecho por la casa ("Somos Magma" en Staff): no sale plata
 *   · impuestos — Ganancias 35% + IIBB 4%: se cobran al cliente dentro del precio,
 *                 pero NO se pagan al 100% (hay crédito fiscal y gastos deducibles)
 *   · neto      — lo que sobra después de esos dos
 * El IVA va aparte: se cobra por fuera del precio y tampoco se paga entero.
 *
 *   node scripts/formato-rodaje.mjs            → resumen
 *   node scripts/formato-rodaje.mjs --detalle  → + el listado de proyectos de cada formato
 *   node scripts/formato-rodaje.mjs --csv      → CSV para abrir en el sheet
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth}); const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ANIO=parseInt(process.argv.find(a=>/^\d{4}$/.test(a)))||2026
const DETALLE=process.argv.includes('--detalle'), CSV=process.argv.includes('--csv')
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}

// cada línea de pedido → el recurso que consume
const norm=p=>{const s=txt(p).replace(/[^\p{L}\p{N}\s½/+-]/gu,'').trim().toLowerCase()
  if(!s)return null
  if(/^(viaticos|comision|otros|servicio)/.test(s))return null      // administrativo
  if(/edit/.test(s))return 'edicion'
  if(/12hs/.test(s))return 'completa'
  if(/(foto|video|film|fotos)\s*(½|1\/2)/.test(s))return 'media'
  if(/(foto|video|film|fotos)\s*1?$/.test(s))return 'completa'
  return 'apoyo'   // asistente, drone, produ, motion, sonido, color, rental…
}

const RR=await sheets.spreadsheets.values.batchGet({spreadsheetId:ID,ranges:['PROYECTOS!A:CI','FACTURACION!A:P'],valueRenderOption:'FORMATTED_VALUE'})
const [PRO,FAC]=RR.data.valueRanges.map(v=>v.values||[])
// IVA realmente facturado por proyecto (algunos son Factura C y no llevan)
const FH=FAC[0], fNro=FH.indexOf('N° Presupuesto'), fIva=FH.indexOf('IVA')
const ivaDe={}
FAC.slice(1).forEach(r=>{ const n=txt(r[fNro]); if(!n)return; ivaDe[n]=(ivaDe[n]||0)+num(r[fIva]) })
const H=PRO[0]
const iTot=H.findIndex(x=>txt(x)==='Total'), iFee=H.indexOf('Fee Agencia')
const iGan=H.indexOf('Imp. Ganancias'), iIIBB=H.indexOf('IIBB'), iAju=H.indexOf('Ajuste')
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]

const proy={}
PRO.slice(1).forEach(r=>{
  const f=fecha(r[3]); if(!f||f.getFullYear()!==ANIO)return
  const n=txt(r[2]); if(!n)return
  const p=proy[n]||={nro:n, fecha:txt(r[3]), ag:txt(r[4]), cli:txt(r[5]), nombre:txt(r[6]),
                     total:0, media:0, comp:0, edic:0, apoyo:0, costo:0, propio:0, fee:0, gan:0, iibb:0, aju:0}
  p.total=Math.max(p.total,num(r[iTot])); p.fee=Math.max(p.fee,num(r[iFee]))
  p.gan=Math.max(p.gan,num(r[iGan])); p.iibb=Math.max(p.iibb,num(r[iIIBB])); p.aju=num(r[iAju])||p.aju
  PED.forEach(c=>{ const v=norm(r[c]); if(!v)return
    if(v==='media')p.media++; else if(v==='completa')p.comp++; else if(v==='edicion')p.edic++; else p.apoyo++
    // el precio es costo aunque el staff todavía no esté asignado.
    // "Somos Magma" NO es costo: ese trabajo lo hace la casa y la plata se queda.
    const precio=num(r[c+1]), pers=txt(r[c+2])
    if(precio>1){ if(/somos magma/i.test(pers)) p.propio+=precio; else p.costo+=precio } })
})
const todos=Object.values(proy).filter(p=>p.total>0)

// ── UN formato por proyecto, y todos los proyectos tienen uno ──
const formato=p=>{
  const gente=p.media+p.comp
  if(!gente) return p.edic ? 'Solo edición' : (p.apoyo ? 'Solo apoyo (sin cámara)' : 'Sin pedidos cargados')
  if(p.media&&p.comp) return `Mixto · completa + media`
  const tipo=p.media?'media jornada':'jornada completa'
  return `${gente} ${gente===1?'persona':'personas'} × ${tipo}`
}
// Lo que le queda a Magma = lo que cobró − lo que le pagó a freelancers − impuestos.
// El trabajo hecho in house ("Somos Magma") no se resta: por eso mejora el margen.
todos.forEach(p=>{ p.fmt=formato(p)
  p.imp=p.gan+p.iibb                     // Ganancias + IIBB, cobrados dentro del precio
  p.margen$=p.total-p.costo              // EL MARGEN: todo lo que no se le paga a un freelancer
  p.neto=p.margen$-p.propio-p.imp        // lo que sobra del margen tras in house e impuestos
  p.margen=p.total?p.margen$/p.total:0
  p.iva=ivaDe[p.nro]||0 })

const g={}
todos.forEach(p=>{ const k=p.fmt; (g[k]=g[k]||{n:0,v:0,mg:0,costo:0,propio:0,imp:0,neto:0,iva:0,ps:[]})
  g[k].n++; g[k].v+=p.total; g[k].mg+=p.margen$; g[k].costo+=p.costo
  g[k].propio+=p.propio; g[k].imp+=p.imp; g[k].neto+=p.neto; g[k].iva+=p.iva; g[k].ps.push(p) })
const totN=todos.length, totV=todos.reduce((a,p)=>a+p.total,0)

if(CSV){
  console.log('Formato,N°,Fecha,Agencia,Cliente,Proyecto,Facturado,Freelancers,Margen,Margen %,In house,Impuestos,Neto,IVA')
  todos.sort((a,b)=>a.fmt.localeCompare(b.fmt)||b.total-a.total).forEach(p=>
    console.log(`"${p.fmt}",${p.nro},${p.fecha},"${p.ag}","${p.cli}","${p.nombre.replace(/"/g,"'")}",${Math.round(p.total)},${Math.round(p.costo)},${Math.round(p.margen$)},${(p.margen*100).toFixed(0)},${Math.round(p.propio)},${Math.round(p.imp)},${Math.round(p.neto)},${Math.round(p.iva)}`))
  process.exit(0)
}

console.log(`\n${'█'.repeat(96)}\n  FORMATO DE RODAJE — ${ANIO} · ${totN} proyectos · ${M(totV)}\n${'█'.repeat(96)}`)
console.log(`\n  Cada proyecto entra en UN formato. La suma de las filas da el total de arriba.\n`)
console.log(`  ${'formato'.padEnd(29)}${'proy'.padStart(5)}${'facturado'.padStart(15)}${'freelancers'.padStart(14)}${'MARGEN'.padStart(15)}${'mg'.padStart(6)}   ${'in house'.padStart(12)}${'impuestos'.padStart(13)}${'neto'.padStart(14)}`)
console.log(`  ${'─'.repeat(94)}`)
const orden=Object.entries(g).sort((a,b)=>b[1].v-a[1].v)
orden.forEach(([k,d])=>console.log(`  ${k.slice(0,27).padEnd(29)}${String(d.n).padStart(5)}${M(d.v).padStart(15)}${M(d.costo).padStart(14)}\x1b[1m${M(d.mg).padStart(15)}${(d.mg/d.v*100).toFixed(0).padStart(5)}%\x1b[0m   ${M(d.propio).padStart(12)}${M(d.imp).padStart(13)}${M(d.neto).padStart(14)}`))
console.log(`  ${'─'.repeat(94)}`)
const R=k=>orden.reduce((a,[,d])=>a+d[k],0)
const sN=R('n'), sV=R('v'), sG=R('mg'), sC=R('costo')
console.log(`  ${'TOTAL'.padEnd(29)}${String(sN).padStart(5)}${M(sV).padStart(15)}${M(sC).padStart(14)}${M(sG).padStart(15)}${(sG/sV*100).toFixed(0).padStart(5)}%   ${M(R('propio')).padStart(12)}${M(R('imp')).padStart(13)}${M(R('neto')).padStart(14)}`)
console.log(`\n  Facturado ${M(sV)} − freelancers ${M(sC)} = margen ${M(sG)}  ·  y el margen se abre en in house + impuestos + neto = ${M(R('propio')+R('imp')+R('neto'))}`)
console.log(`  \x1b[1mIVA cobrado aparte: ${M(R('iva'))}\x1b[0m — va por fuera del precio y tampoco se paga entero.`)
console.log(`\n  ${sN===totN&&Math.abs(sV-totV)<1?'\x1b[32m✓ cierra: '+sN+' proyectos y '+M(sV)+'\x1b[0m':'\x1b[31m✗ NO CIERRA\x1b[0m'}`)

// ── el precio por jornada entera de una persona (el recurso real) ──
console.log(`\n\x1b[1m■ CUÁNTO PAGA CADA FORMATO POR JORNADA ENTERA DE UNA PERSONA\x1b[0m`)
console.log(`  (dos personas cuestan el doble de producir: el ticket solo no alcanza para comparar)\n`)
orden.filter(([k])=>/persona/.test(k)).map(([k,d])=>{
  const unidades=d.ps.reduce((a,p)=>a+p.media*0.5+p.comp,0)
  return {k, porJornada:d.v/unidades, dejaPorJornada:d.mg/unidades, n:d.n, ticket:d.v/d.n, margen:d.mg/d.v}
}).sort((a,b)=>b.porJornada-a.porJornada).forEach(x=>
  console.log(`  ${x.k.slice(0,30).padEnd(32)}${String(x.n).padStart(4)} proy   ticket ${M(x.ticket).padStart(13)}   →  ${M(x.porJornada).padStart(13)} por jornada   ·  deja ${M(x.dejaPorJornada).padStart(13)} (${(x.margen*100).toFixed(0)}%)`))

if(DETALLE){
  console.log(`\n${'█'.repeat(96)}\n  LISTADO COMPLETO — cada proyecto en su formato\n${'█'.repeat(96)}`)
  orden.forEach(([k,d])=>{
    console.log(`\n\x1b[1m▸ ${k}\x1b[0m — ${d.n} proyectos · ${M(d.v)} · margen ${(d.gana/d.v*100).toFixed(0)}%`)
    console.log(`  ${'n°'.padEnd(6)}${'agencia'.padEnd(18)}${'proyecto'.padEnd(30)}${'facturado'.padStart(13)}${'freelan.'.padStart(12)}${'MARGEN'.padStart(13)}${'mg'.padStart(5)}${'in house'.padStart(11)}${'imp.'.padStart(11)}${'neto'.padStart(12)}`)
    d.ps.sort((a,b)=>b.total-a.total).forEach(p=>
      console.log(`  ${p.nro.padEnd(6)}${p.ag.slice(0,16).padEnd(18)}${p.nombre.slice(0,28).padEnd(30)}${M(p.total).padStart(13)}${M(p.costo).padStart(12)}${M(p.margen$).padStart(13)}${(p.margen*100).toFixed(0).padStart(4)}%${M(p.propio).padStart(11)}${M(p.imp).padStart(11)}${M(p.neto).padStart(12)}`))
  })
}
console.log('')
