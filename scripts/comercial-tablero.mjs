/**
 * Tablero comercial — los presupuestos EN ESPERA partidos como sirven para vender:
 *   · evento por delante (venta recuperable) vs evento ya pasado (hay que cerrar la fila)
 *   · cuántos pasaron el día 4 sin seguimiento (la regla acordada el 18/08)
 *   · por PM, y la lista de llamados ordenada por plata con contacto
 * Misma definición de embudo que marketing.mjs (una fila con N° = un presu, monto = col I).
 * Solo lectura.   node scripts/comercial-tablero.mjs [--json]
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const JSON_OUT=process.argv.includes('--json')

const ERR=/^#(ERROR!|REF!|N\/A|VALUE!|NAME\?|DIV\/0!|NUM!|NULL!)/
const txt=v=>{const s=String(v??'').trim();return ERR.test(s)?'':s}
const num=v=>{const s=txt(v).replace(/\s/g,'');if(!s)return 0;const neg=/^-/.test(s);const n=parseFloat(s.replace(/[^\d.]/g,''))||0;return neg?-n:n} // el sheet guarda formato US
const fecha=v=>{const s=txt(v);let m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(m){let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return new Date(+m[1],+m[2]-1,+m[3]);return null}
const money=n=>'$'+Math.round(n).toLocaleString('es-AR')
const hoy=new Date();hoy.setHours(0,0,0,0)
const dias=d=>Math.round((hoy-d)/86400000)
const DIA_SEGUIMIENTO=4

const r=await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PRESUPUESTOS',valueRenderOption:'FORMATTED_VALUE'})
const rows=r.data.values||[]
const H=rows[0].map(h=>txt(h).toLowerCase())
const col=n=>H.findIndex(h=>h===n)
const iFe=col('fecha evento'), iPM=col('pm interno'), iEs=col('estado'), iAg=col('agencia'), iCl=col('cliente'), iPr=col('proyecto'), iFp=col('fecha presupuesto'), iCo=col('contacto')
// Seguimiento comercial (DQ-DS, desde el 22/9/2026): si se habló con el cliente, el reloj del día 4 arranca ahí y no en la fecha del presupuesto.
const iUlt=col('último contacto'), iPaso=col('próximo paso'), iSeg=col('seguir el')
const iMonto=8 // col I, sin encabezado propio — igual que marketing.mjs

const pres=rows.slice(1).filter(p=>txt(p[0])).map(p=>({
  n:txt(p[0]), estado:txt(p[iEs]).toUpperCase(), pm:txt(p[iPM])||'(sin PM)', agencia:txt(p[iAg]), cliente:txt(p[iCl]), proyecto:txt(p[iPr]),
  monto:num(p[iMonto]), fEvento:fecha(p[iFe]), fPresu:fecha(p[iFp]), contacto:txt(p[iCo]),
  ultimo:iUlt>-1?fecha(p[iUlt]):null, seguir:iSeg>-1?fecha(p[iSeg]):null, paso:iPaso>-1?txt(p[iPaso]):'' }))

const cuenta=e=>pres.filter(p=>p.estado===e)
const apro=cuenta('APROBADO').length, desa=cuenta('DESAPROBADO').length
const espera=cuenta('EN ESPERA')
const suma=a=>a.reduce((s,p)=>s+p.monto,0)

const vivos=espera.filter(p=>p.fEvento&&p.fEvento>=hoy)
const pasados=espera.filter(p=>p.fEvento&&p.fEvento<hoy)
const sinFecha=espera.filter(p=>!p.fEvento)
// "Toca llamar": llegó la fecha de Seguir el; si no hay, pasó el día 4 desde el último contacto (o desde el presupuesto si nunca se llamó)
const tocaDe=p=>{ const base=p.ultimo||p.fPresu; return p.seguir ? p.seguir<=hoy : (!base || dias(base)>DIA_SEGUIMIENTO) }
const conDias=p=>({...p, diasPresu:p.fPresu?dias(p.fPresu):null, diasUltimo:p.ultimo?dias(p.ultimo):null, diasAlEvento:p.fEvento?-dias(p.fEvento):null, toca:tocaDe(p)})
const vencidosSeguimiento=vivos.filter(p=>(p.fPresu||p.ultimo)&&tocaDe(p))
const dentroPlazo=vivos.filter(p=>(p.fPresu||p.ultimo)&&!tocaDe(p))
const vivosSinFechaPresu=vivos.filter(p=>!p.fPresu&&!p.ultimo)

const porPM={}
vivos.forEach(p=>{porPM[p.pm]=porPM[p.pm]||{n:0,monto:0};porPM[p.pm].n++;porPM[p.pm].monto+=p.monto})

const repetidos=Object.entries(espera.reduce((a,p)=>{a[p.n]=(a[p.n]||0)+1;return a},{})).filter(([,c])=>c>1)

const out={
  fecha:hoy.toISOString().slice(0,10),
  cierre:{aprobados:apro,desaprobados:desa,tasa:Math.round(apro/(apro+desa)*100)},
  espera:{n:espera.length,monto:suma(espera)},
  vivos:{n:vivos.length,monto:suma(vivos)},
  pasados:{n:pasados.length,monto:suma(pasados)},
  sinFecha:{n:sinFecha.length,monto:suma(sinFecha)},
  seguimiento:{dia:DIA_SEGUIMIENTO,vencidos:{n:vencidosSeguimiento.length,monto:suma(vencidosSeguimiento)},enPlazo:{n:dentroPlazo.length,monto:suma(dentroPlazo)},sinFechaPresu:{n:vivosSinFechaPresu.length,monto:suma(vivosSinFechaPresu)}},
  porPM,
  repetidos,
  listaVivos:vivos.map(conDias).sort((a,b)=>b.monto-a.monto),
  listaPasados:pasados.map(conDias).sort((a,b)=>b.monto-a.monto),
}
if(JSON_OUT){console.log(JSON.stringify(out,null,1));process.exit(0)}

console.log(`\nTABLERO COMERCIAL · ${hoy.toLocaleDateString('es-AR')}\n`)
console.log(`Tasa de cierre: ${out.cierre.tasa}% (${apro} aprobados / ${apro+desa} decididos)`)
console.log(`EN ESPERA: ${espera.length} presus · ${money(suma(espera))}`)
console.log(`  ├ evento POR DELANTE: ${vivos.length} · ${money(suma(vivos))}   ← venta recuperable`)
console.log(`  ├ evento YA PASADO:   ${pasados.length} · ${money(suma(pasados))}   ← cerrar la fila (perdido o hecho sin actualizar)`)
console.log(`  └ sin fecha de evento: ${sinFecha.length} · ${money(suma(sinFecha))}`)
console.log(`\nSeguimiento del día ${DIA_SEGUIMIENTO} (sobre los ${vivos.length} vivos):`)
console.log(`  pasaron el día ${DIA_SEGUIMIENTO}: ${vencidosSeguimiento.length} · ${money(suma(vencidosSeguimiento))}`)
console.log(`  todavía en plazo: ${dentroPlazo.length} · ${money(suma(dentroPlazo))}`)
if(vivosSinFechaPresu.length)console.log(`  sin fecha de presupuesto: ${vivosSinFechaPresu.length} · ${money(suma(vivosSinFechaPresu))}`)
console.log(`\nVivos por PM:`)
Object.entries(porPM).sort((a,b)=>b[1].monto-a[1].monto).forEach(([k,d])=>console.log(`  ${k.padEnd(10)} ${String(d.n).padStart(3)} · ${money(d.monto)}`))
if(repetidos.length)console.log(`\n⚠ N° repetidos dentro de EN ESPERA: ${repetidos.map(([n,c])=>`#${n}×${c}`).join(', ')}`)
console.log(`\nLISTA DE LLAMADOS (vivos, por plata):`)
out.listaVivos.forEach(p=>console.log(`  ${money(p.monto).padStart(13)} · #${p.n} · ${(p.agencia||'directo')} / ${p.cliente} — ${p.proyecto} · evento en ${p.diasAlEvento}d · presu hace ${p.diasPresu??'?'}d${p.ultimo?` · hablado hace ${p.diasUltimo}d${p.paso?' ('+p.paso+')':''}`:''}${p.toca?' · 📞 TOCA':''} · PM ${p.pm} · ${p.contacto||'sin contacto'}`))
console.log(`\nCON EVENTO YA PASADO (revisar y cerrar):`)
out.listaPasados.forEach(p=>console.log(`  ${money(p.monto).padStart(13)} · #${p.n} · ${(p.agencia||'directo')} / ${p.cliente} — ${p.proyecto} · evento hace ${-p.diasAlEvento}d · PM ${p.pm}`))
