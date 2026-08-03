/**
 * 80/20 POR PROYECTO (no por servicio suelto) — pedido de Juan 03/08/2026.
 *
 * La idea: un proyecto no es "una edición" ni "media jornada", es una RECETA
 * — la combinación de recursos que se arma. "½ jornada + edición" es lo mismo
 * se llame Foto ½, Video ½ o Film ½. Agrupa por esa receta para ver qué se
 * presupuesta de verdad y qué recursos hacen falta.
 *
 * Solo lectura.  node scripts/pareto-proyectos.mjs [año]
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env=Object.fromEntries(readFileSync('/Users/dronjuan/somos-magma-app/.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return [l.slice(0,i).trim(),v]}))
const auth=new google.auth.GoogleAuth({credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']})
const sheets=google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ANIO=parseInt(process.argv[2])||2026
const txt=v=>String(v??'').trim()
const num=v=>{if(typeof v==='number')return v;const s=txt(v).replace(/[^\d.-]/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const fecha=v=>{const m=txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}

// ── normalización: 50 etiquetas distintas → un puñado de recursos reales ──
// El emoji y el tipo (foto/video/film) no cambian el recurso: es una persona con una cámara.
const norm = p => {
  const s = txt(p).replace(/[^\p{L}\p{N}\s½/+-]/gu,'').trim().toLowerCase()
  if(!s) return null
  if(/^(viaticos|comision|otros|servicio)/.test(s))          return null          // administrativo, no es recurso
  if(/edit/.test(s))                                          return 'Edición'
  if(/asist/.test(s))                                         return 'Asistente'
  if(/produ/.test(s))                                         return 'Producción'
  if(/drone|fpv/.test(s))                                     return 'Drone'
  if(/vivo/.test(s))                                          return 'Vivo/streaming'
  if(/motion/.test(s))                                        return 'Motion'
  if(/makeup|model/.test(s))                                  return 'Maquillaje/modelo'
  if(/sonido|locu/.test(s))                                   return 'Sonido/locución'
  if(/dirfoto|colorista/.test(s))                             return 'Dir. foto/color'
  if(/rental/.test(s))                                        return 'Rental'
  if(/crudos/.test(s))                                        return 'Entrega de crudos'
  if(/12hs/.test(s))                                          return 'Jornada larga (12hs)'
  if(/(foto|video|film|fotos)\s*(½|1\/2)/.test(s))            return '½ jornada'
  if(/(foto|video|film|fotos)\s*1?$/.test(s))                 return '1 jornada'
  return 'Otros'
}
const ORDEN=['1 jornada','½ jornada','Jornada larga (12hs)','Edición','Asistente','Producción','Drone','Vivo/streaming','Motion','Dir. foto/color','Sonido/locución','Maquillaje/modelo','Rental','Entrega de crudos','Otros']
const ordenar=a=>[...a].sort((x,y)=>(ORDEN.indexOf(x)+99*(ORDEN.indexOf(x)<0))-(ORDEN.indexOf(y)+99*(ORDEN.indexOf(y)<0)))

const PRO=(await sheets.spreadsheets.values.get({spreadsheetId:ID,range:'PROYECTOS!A:CI',valueRenderOption:'FORMATTED_VALUE'})).data.values||[]
const H=PRO[0], iTot=H.findIndex(x=>txt(x)==='Total')
const PED=[11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]

// un mismo N° de presupuesto puede ocupar más de una fila → se juntan
const proy={}
PRO.slice(1).forEach(r=>{
  const f=fecha(r[3]); if(!f||f.getFullYear()!==ANIO)return
  const n=txt(r[2]); if(!n)return
  const p = proy[n] ||= { nro:n, ag:txt(r[4]), cli:txt(r[5]), nombre:txt(r[6]), total:0, rec:[] }
  p.total=Math.max(p.total, num(r[iTot]))          // máximo, no suma: la fila repetida trae el mismo total
  PED.forEach(c=>{ const v=norm(r[c]); if(v) p.rec.push(v) })
})
const proyectos=Object.values(proy).filter(p=>p.rec.length&&p.total>0)

// receta = CON cantidad, porque mandar una persona media jornada no es lo mismo
// que mandar dos: son dos productos distintos y consumen distintos recursos.
const receta = p => { const c={}; p.rec.forEach(x=>c[x]=(c[x]||0)+1)
  return ordenar(Object.keys(c)).map(k=>c[k]>1?`${k} ×${c[k]}`:k).join(' + ') || '(sin pedidos)' }
// familia = ignorando la cantidad, para ver el patrón general
const familia = p => ordenar([...new Set(p.rec)]).join(' + ') || '(sin pedidos)'

const total=proyectos.reduce((a,p)=>a+p.total,0)
console.log(`\n${'█'.repeat(88)}`)
console.log(`  80/20 POR PROYECTO — ${ANIO} · ${proyectos.length} proyectos · ${M(total)}`)
console.log(`${'█'.repeat(88)}`)

// ── 1) por receta ──
const fam={}
proyectos.forEach(p=>{ const k=receta(p); (fam[k]=fam[k]||{n:0,v:0,ps:[]}); fam[k].n++; fam[k].v+=p.total; fam[k].ps.push(p) })
const ranking=Object.entries(fam).sort((a,b)=>b[1].v-a[1].v)
console.log(`\n\x1b[1m■ QUÉ SE PRESUPUESTA — combinaciones ordenadas por facturación\x1b[0m\n`)
console.log(`  ${'#'.padStart(3)} ${'receta'.padEnd(44)}${'proyectos'.padStart(10)}${'facturado'.padStart(16)}${'%'.padStart(7)}${'acum'.padStart(7)}${'ticket'.padStart(14)}`)
let acum=0, corte80=null
ranking.forEach(([k,d],i)=>{
  acum+=d.v; const pct=d.v/total*100, ac=acum/total*100
  if(corte80===null&&ac>=80) corte80=i+1
  if(i<18) console.log(`  ${String(i+1).padStart(3)} ${k.slice(0,42).padEnd(44)}${String(d.n).padStart(10)}${M(d.v).padStart(16)}${pct.toFixed(1).padStart(6)}%${ac.toFixed(0).padStart(6)}%${M(d.v/d.n).padStart(14)}`)
})
if(ranking.length>18) console.log(`  ... y ${ranking.length-18} recetas más`)
console.log(`\n  \x1b[1m→ ${corte80} de ${ranking.length} recetas explican el 80% de la facturación.\x1b[0m`)

// ── 2) recursos que consume el año ──
console.log(`\n\x1b[1m■ RECURSOS QUE CONSUMIÓ EL AÑO\x1b[0m\n`)
const rec={}
proyectos.forEach(p=>p.rec.forEach(x=>rec[x]=(rec[x]||0)+1))
const totRec=Object.values(rec).reduce((a,b)=>a+b,0)
Object.entries(rec).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>{
  const pct=v/totRec*100
  console.log(`  ${k.padEnd(24)}${String(v).padStart(5)}  ${(pct).toFixed(1).padStart(5)}%  \x1b[36m${'█'.repeat(Math.max(1,Math.round(pct/1.5)))}\x1b[0m`)})
const jorn=(rec['½ jornada']||0)/2+(rec['1 jornada']||0)+(rec['Jornada larga (12hs)']||0)
console.log(`\n  Equivale a \x1b[1m${jorn.toFixed(0)} jornadas enteras de cámara\x1b[0m en el año · ${(jorn/12).toFixed(1)} por mes`)
console.log(`  Ediciones: ${rec['Edición']||0} (${((rec['Edición']||0)/jorn).toFixed(2)} por jornada de rodaje)`)

// ── 3) la receta típica de cada cliente ──
console.log(`\n\x1b[1m■ QUÉ LE VENDEMOS A CADA UNO — top 15 por facturación\x1b[0m\n`)
const porCli={}
proyectos.forEach(p=>{ const k=p.ag||p.cli||'(sin agencia)'
  ;(porCli[k]=porCli[k]||{n:0,v:0,recetas:{}}); porCli[k].n++; porCli[k].v+=p.total
  const r=receta(p); porCli[k].recetas[r]=(porCli[k].recetas[r]||0)+1 })
Object.entries(porCli).sort((a,b)=>b[1].v-a[1].v).slice(0,15).forEach(([k,d])=>{
  const top=Object.entries(d.recetas).sort((a,b)=>b[1]-a[1])[0]
  const domin=(top[1]/d.n*100).toFixed(0)
  console.log(`  ${k.slice(0,22).padEnd(24)}${String(d.n).padStart(4)} proy ${M(d.v).padStart(15)}   →  ${top[0].slice(0,40)} \x1b[36m(${domin}% de sus trabajos)\x1b[0m`)})

// ── 4) las variantes con cantidad, dentro de la receta más grande ──
console.log(`\n\x1b[1m■ ¿UNA PERSONA O DOS? — proyectos con jornada de cámara\x1b[0m\n`)
const porPersonas={}
proyectos.forEach(p=>{ const n=p.rec.filter(x=>/jornada/.test(x)).length; if(!n)return
  const k=n===1?'1 persona':`${n} personas`
  ;(porPersonas[k]=porPersonas[k]||{n:0,v:0}); porPersonas[k].n++; porPersonas[k].v+=p.total })
const totP=Object.values(porPersonas).reduce((a,x)=>a+x.n,0)
Object.entries(porPersonas).sort((a,b)=>parseInt(a[0])-parseInt(b[0])).forEach(([k,d])=>
  console.log(`  ${k.padEnd(12)}${String(d.n).padStart(5)} proy  ${(d.n/totP*100).toFixed(0).padStart(3)}%  ${M(d.v).padStart(15)}   ticket ${M(d.v/d.n).padStart(13)}`))

console.log(`\n\x1b[1m■ DETALLE DE LAS 3 RECETAS MÁS GRANDES\x1b[0m`)
ranking.slice(0,3).forEach(([k,d])=>{
  console.log(`\n  \x1b[1m${k}\x1b[0m — ${d.n} proyectos · ${M(d.v)} · ticket ${M(d.v/d.n)}`)
  const v={}; d.ps.forEach(p=>{ const x=receta(p); (v[x]=v[x]||{n:0,v:0}); v[x].n++; v[x].v+=p.total })
  Object.entries(v).sort((a,b)=>b[1].v-a[1].v).slice(0,6).forEach(([x,y])=>
    console.log(`     ${x.slice(0,50).padEnd(52)}${String(y.n).padStart(4)}×${M(y.v).padStart(15)}   ticket ${M(y.v/y.n)}`))
})
console.log('')
