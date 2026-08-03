/**
 * Genera la página auditable de formatos de rodaje: la tabla resumen + el listado
 * completo de proyectos de cada formato, para poder chequear proyecto por proyecto.
 * Uso: node scripts/formato-rodaje-html.mjs > salida.html
 */
import { execSync } from 'child_process'
const csv=execSync('node scripts/formato-rodaje.mjs --csv',{cwd:'/Users/dronjuan/somos-magma-app',encoding:'utf8'})
const filas=csv.trim().split('\n').slice(1).map(l=>{
  const c=l.match(/("([^"]*)"|[^,]*)/g).filter((_,i)=>i%2===0)
  const q=s=>String(s||'').replace(/^"|"$/g,'')
  return {fmt:q(c[0]),nro:q(c[1]),fecha:q(c[2]),ag:q(c[3]),cli:q(c[4]),proy:q(c[5]),
          total:+q(c[6]),costo:+q(c[7]),margen:+q(c[8]),mg:+q(c[9]),inh:+q(c[10]),imp:+q(c[11]),neto:+q(c[12]),iva:+q(c[13])}
})
const M=n=>'$'+Math.round(n).toLocaleString('es-AR')
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
const g={}
filas.forEach(f=>{(g[f.fmt]=g[f.fmt]||{n:0,v:0,c:0,m:0,i:0,x:0,t:0,iva:0,ps:[]});const G=g[f.fmt]
  G.n++;G.v+=f.total;G.c+=f.costo;G.m+=f.margen;G.i+=f.inh;G.x+=f.imp;G.t+=f.neto;G.iva+=f.iva;G.ps.push(f)})
const orden=Object.entries(g).sort((a,b)=>b[1].v-a[1].v)
const S=k=>filas.reduce((a,f)=>a+f[k],0)
const tN=filas.length, tV=S('total'), tC=S('costo'), tM=S('margen'), tI=S('inh'), tX=S('imp'), tT=S('neto'), tIVA=S('iva')
const jorn=f=>{const m=f.fmt.match(/^(\d+) persona/); if(!m)return 0
  const n=+m[1]; return /media/.test(f.fmt)? n*0.5 : n}

console.log(`<title>Formatos de rodaje 2026 · Somos Magma</title>
<style>
:root{--bg:#fbfaf9;--surf:#fff;--ink:#16130f;--ink2:#4a443c;--ink3:#8b8378;--line:#e8e3dc;--brand:#ce2637;--pos:#1f7a4d;--posbg:#eaf5ef;--warnbg:#fdf0ea;--mono:ui-monospace,"SF Mono",Menlo,monospace}
@media(prefers-color-scheme:dark){:root{--bg:#131110;--surf:#1c1917;--ink:#f2efeb;--ink2:#c3bcb2;--ink3:#8b8378;--line:#2e2a26;--posbg:#152a1f;--warnbg:#2c1c17}}
:root[data-theme=dark]{--bg:#131110;--surf:#1c1917;--ink:#f2efeb;--ink2:#c3bcb2;--ink3:#8b8378;--line:#2e2a26;--posbg:#152a1f;--warnbg:#2c1c17}
:root[data-theme=light]{--bg:#fbfaf9;--surf:#fff;--ink:#16130f;--ink2:#4a443c;--ink3:#8b8378;--line:#e8e3dc;--posbg:#eaf5ef;--warnbg:#fdf0ea}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;padding:28px 20px 60px}
.wrap{max-width:1080px;margin:0 auto}h1{font-size:1.6rem;margin:0 0 4px;letter-spacing:-.02em}
.sub{color:var(--ink3);font-size:.9rem;margin:0 0 26px}
.card{background:var(--surf);border:1px solid var(--line);border-radius:12px;padding:18px;margin-bottom:18px}
h2{font-size:1.05rem;margin:0 0 12px;letter-spacing:-.01em}
.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:.86rem}
th{text-align:left;font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--ink3);padding:6px 9px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:6px 9px;border-bottom:1px solid var(--line)}
.num{text-align:right;font-family:var(--mono);font-variant-numeric:tabular-nums;white-space:nowrap}
tr.tot td{font-weight:700;border-top:2px solid var(--line);background:var(--posbg)}
tr.hi td{background:var(--posbg)}tr.lo td{background:var(--warnbg)}
details{border:1px solid var(--line);border-radius:10px;margin-bottom:10px;background:var(--surf)}
summary{padding:11px 14px;cursor:pointer;font-weight:600;font-size:.92rem;display:flex;justify-content:space-between;gap:12px;align-items:baseline;flex-wrap:wrap}
summary::marker{color:var(--ink3)}summary span{font-family:var(--mono);font-size:.82rem;color:var(--ink2);font-weight:400}
details>div{padding:0 14px 12px}
.nota{font-size:.82rem;color:var(--ink3);margin-top:10px}
b.g{color:var(--pos)}b.r{color:var(--brand)}
</style>
<div class="wrap">
<h1>Formatos de rodaje 2026</h1>
<p class="sub">Los ${tN} proyectos del año, cada uno en un solo formato. La suma de las filas da el total — abrí cualquier formato para ver sus proyectos uno por uno.</p>
<div class="card" style="border-left:3px solid var(--pos)"><h2 style="margin-bottom:6px">Cómo se lee</h2>
<p style="margin:0 0 10px;font-size:1rem"><b>MARGEN = Facturado − Freelancers.</b> Todo lo que no se le paga a alguien de afuera queda en Magma.</p>
<p style="margin:0 0 8px;font-size:.88rem;color:var(--ink2)">Ese margen se abre en tres, y las tres suman el margen (no se restan de él):</p>
<ul style="margin:0 0 10px;font-size:.88rem;color:var(--ink2);padding-left:20px">
<li><b>In house</b> — trabajo cargado con staff "Somos Magma". Lo hace la casa, no sale plata.</li>
<li><b>Impuestos</b> — Ganancias 35% + IIBB 4%. Se cobran al cliente dentro del precio, pero <b>no se pagan al 100%</b>: hay crédito fiscal y gastos que los bajan.</li>
<li><b>Neto</b> — lo que sobra del margen después de esos dos.</li>
</ul>
<p style="margin:0;font-size:.88rem;color:var(--ink2)"><b>El IVA va aparte</b>, por fuera del precio. En 2026 se facturaron <b>${M(tIVA)}</b>. Tampoco se paga entero: en los meses ya cerrados (feb–abr) se facturaron $14.055.371 y se pagaron $11.434.772 — <b>el 81%</b>. La diferencia es crédito fiscal de las facturas A que recibe Magma.</p></div>

<div class="card"><h2>Resumen por formato</h2><div class="scroll"><table>
<thead><tr><th>Formato</th><th class="num">Proy.</th><th class="num">Facturado</th><th class="num">Ticket</th><th class="num">Freelancers</th><th class="num">MARGEN</th><th class="num">%</th><th class="num">↳ in house</th><th class="num">↳ impuestos</th><th class="num">↳ neto</th><th class="num">IVA</th></tr></thead><tbody>`)
orden.forEach(([k,d])=>{
  const cls=/^2 personas × media/.test(k)?' class="hi"':(/^4 personas × jornada/.test(k)?' class="lo"':'')
  console.log(`<tr${cls}><td>${esc(k)}</td><td class="num">${d.n}</td><td class="num">${M(d.v)}</td><td class="num">${M(d.v/d.n)}</td><td class="num">${M(d.c)}</td><td class="num"><b>${M(d.m)}</b></td><td class="num"><b>${(d.m/d.v*100).toFixed(0)}%</b></td><td class="num">${d.i?M(d.i):'—'}</td><td class="num">${M(d.x)}</td><td class="num">${M(d.t)}</td><td class="num">${M(d.iva)}</td></tr>`)})
console.log(`<tr class="tot"><td>TOTAL</td><td class="num">${tN}</td><td class="num">${M(tV)}</td><td class="num">${M(tV/tN)}</td><td class="num">${M(tC)}</td><td class="num">${M(tM)}</td><td class="num">${(tM/tV*100).toFixed(0)}%</td><td class="num">${M(tI)}</td><td class="num">${M(tX)}</td><td class="num">${M(tT)}</td><td class="num">${M(tIVA)}</td></tr>
</tbody></table></div></div>

<div class="card"><h2>Cuánto deja cada formato por jornada entera de una persona</h2>
<p class="nota" style="margin:0 0 12px">Dos personas cuestan el doble de producir, así que el ticket no sirve para comparar. Esto es el margen que deja cada formato por cada jornada de recurso que consume — el número que cubre la estructura.</p>
<div class="scroll"><table>
<thead><tr><th>Formato</th><th class="num">Proy.</th><th class="num">Ticket</th><th class="num">Cobra por jornada</th><th class="num">Margen por jornada</th><th class="num">Margen</th></tr></thead><tbody>`)
orden.filter(([k])=>/persona/.test(k)).map(([k,d])=>{
  const u=d.ps.reduce((a,f)=>a+jorn(f),0)
  return {k,d,u,cobra:d.v/u,deja:d.m/u}
}).sort((a,b)=>b.deja-a.deja).forEach(x=>{
  const cls=x.d.n>=10?(x.deja>650000?' class="hi"':(x.deja<500000?' class="lo"':'')):''
  console.log(`<tr${cls}><td>${esc(x.k)}${x.d.n<5?' <span style="color:var(--ink3);font-size:.8em">(pocos casos)</span>':''}</td><td class="num">${x.d.n}</td><td class="num">${M(x.d.v/x.d.n)}</td><td class="num">${M(x.cobra)}</td><td class="num"><b>${M(x.deja)}</b></td><td class="num">${(x.d.m/x.d.v*100).toFixed(0)}%</td></tr>`)})
console.log(`</tbody></table></div></div>

<div class="card"><h2>Listado completo — cada proyecto en su formato</h2>`)
orden.forEach(([k,d])=>{
  console.log(`<details><summary>${esc(k)} <span>${d.n} proyectos · ${M(d.v)} · margen ${(d.d/d.v*100).toFixed(0)}%</span></summary><div class="scroll"><table>
<thead><tr><th>N°</th><th>Fecha</th><th>Agencia</th><th>Proyecto</th><th class="num">Facturado</th><th class="num">Freelancers</th><th class="num">MARGEN</th><th class="num">%</th><th class="num">↳ in house</th><th class="num">↳ impuestos</th><th class="num">↳ neto</th><th class="num">IVA</th></tr></thead><tbody>`)
  d.ps.sort((a,b)=>b.total-a.total).forEach(f=>
    console.log(`<tr><td>${esc(f.nro)}</td><td>${esc(f.fecha)}</td><td>${esc(f.ag)}</td><td>${esc(f.proy)}</td><td class="num">${M(f.total)}</td><td class="num">${M(f.costo)}</td><td class="num"><b>${M(f.margen)}</b></td><td class="num"><b>${f.mg}%</b></td><td class="num">${f.inh?M(f.inh):'—'}</td><td class="num">${M(f.imp)}</td><td class="num">${M(f.neto)}</td><td class="num">${f.iva?M(f.iva):'—'}</td></tr>`))
  console.log(`</tbody></table></div></details>`)})
console.log(`</div>
<p class="nota">Fuente: solapas PROYECTOS y FACTURACION del Master Magma, año 2026. Margen = facturado − freelancers. Las 50 etiquetas de pedido del sheet se normalizan a: media jornada, jornada completa, edición y apoyo (asistente, drone, producción, motion, sonido, color, rental). Script: <code>formato-rodaje.mjs</code>.</p>
</div>`)
