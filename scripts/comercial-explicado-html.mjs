/**
 * Arma la página "Comercial, bien explicado" con los números del día.
 * No calcula nada propio: toma el JSON de comercial-tablero.mjs, numeros-base.mjs y brief-comercial.mjs
 * (este último con BRIEF_HOY = hoy) y los vuelca en el HTML. Así cada cifra publicada sale de un script.
 * Solo lectura del sheet.   node scripts/comercial-explicado-html.mjs [salida.html]
 * Después se republica SIEMPRE sobre el mismo artifact (ver memoria project_comercial_explicado).
 */
import { execFileSync } from 'child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'

const ROOT = '/Users/dronjuan/somos-magma-app'
const OUT = process.argv[2] || join(tmpdir(), 'comercial-explicado.html')
mkdirSync(dirname(OUT), { recursive: true })
const run = (script, args = [], env = {}) => execFileSync('node', [join('scripts', script), ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8, env: { ...process.env, ...env } })

const d = new Date()
const ISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const HOY_TXT = d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })

const T = JSON.parse(run('comercial-tablero.mjs', ['--json']))
const N = JSON.parse(run('numeros-base.mjs', ['--json']))
const briefJson = join(dirname(OUT), 'brief-hoy.json')
run('brief-comercial.mjs', [briefJson], { BRIEF_HOY: ISO })
const B = JSON.parse(readFileSync(briefJson, 'utf8'))

const money = n => '$' + Math.round(n).toLocaleString('es-AR')
const mill = n => '$' + (n / 1e6).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'M'
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const pct = (a, b) => Math.round(a / b * 100)
const ddmm = iso => { const x = new Date(iso); return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}` }

// ---- derivados (solo sumas y divisiones sobre lo que devuelven los scripts)
const seg = T.seguimiento
const urgentes = T.listaVivos.filter(p => p.diasAlEvento !== null && p.diasAlEvento <= 14 && p.toca)
const sumUrg = urgentes.reduce((s, p) => s + p.monto, 0)
const brecha = N.brecha_produccion
const eventosFaltan = Math.ceil(N.eventos_faltan)
const pctPila = Math.ceil(brecha / seg.vencidos.monto * 100)
const gira = T.listaVivos[0]
const totalBar = T.espera.monto
const w = n => (n / totalBar * 100).toFixed(2) + '%'
const pmJuan = T.porPM['Juan'] || { n: 0, monto: 0 }
const deOtros = T.vivos.n - pmJuan.n

const cli = B.clientes
const activos = cli.filter(c => c.estado === 'ACTIVO').sort((a, b) => b.y[2026] - a.y[2026])
const sumAct = activos.reduce((s, c) => s + c.y[2026], 0)
const frios = cli.filter(c => c.estado === 'ENFRIÁNDOSE' || c.estado === 'DORMIDO').sort((a, b) => b.y[2026] - a.y[2026])
const sumFrios = frios.reduce((s, c) => s + c.y[2026], 0)
const minDiasFrio = Math.min(...frios.map(c => c.dias))
const perdidos = cli.filter(c => c.estado === 'PERDIDO' && (c.y[2024] + c.y[2025]) > 0).sort((a, b) => (b.y[2024] + b.y[2025]) - (a.y[2024] + a.y[2025]))
const sumPerd = perdidos.reduce((s, c) => s + c.y[2024] + c.y[2025], 0)
const perdConContacto = perdidos.filter(c => (c.contactos || []).length).length
const contacto = c => { const k = (c.contactos || [])[0]; return k ? esc([k.nombre, k.mail || k.tel].filter(Boolean).join(' · ')) : '<span class="dim">sin contacto cargado</span>' }
const pctAgencia = pct(B.totales.viaAgencia2026, B.totales[2026])

const filaPresu = p => `<tr>
  <td class="r num">${money(p.monto)}</td><td class="mono">#${esc(p.n)}</td>
  <td><b>${esc(p.cliente || p.agencia)}</b> <span class="dim">${p.agencia && p.agencia !== p.cliente ? 'vía ' + esc(p.agencia) : ''}</span><br><span class="sub">${esc(p.proyecto)}</span></td>
  <td class="r mono">${p.diasAlEvento}d</td>
  <td class="r mono">${p.ultimo ? 'hablado ' + p.diasUltimo + 'd' : (p.diasPresu ?? '?') + 'd'} ${p.toca ? '<span class="tag t-bad">toca llamar</span>' : '<span class="tag t-ok">en plazo</span>'}</td>
  <td>${esc(p.pm)}</td><td class="sub">${esc(p.contacto) || '<span class="dim">sin contacto</span>'}</td></tr>`

const html = `<title>Comercial bien explicado</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=Azeret+Mono:wght@400;600;700&display=swap">
<style>
:root{
  --paper:#FAF7F5; --surface:#FFFFFF; --ink:#15100E; --ink-2:#4A403D; --muted:#7B6E6A;
  --line:#E6DDD9; --line-2:#D3C7C2; --magma:#CE2637; --magma-soft:#F7E6E7; --blue:#1543F8;
  --ok:#1D7A4F; --ok-soft:#E4F1EA; --warn:#9A6212; --warn-soft:#F7EEDD; --past:#A89C97;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --paper:#100C0B; --surface:#1A1413; --ink:#F4EFEC; --ink-2:#C9BEB9; --muted:#94867F;
    --line:#2C2321; --line-2:#3D312E; --magma:#F2596A; --magma-soft:#2B1517; --blue:#7C97FF;
    --ok:#5CC08C; --ok-soft:#14261D; --warn:#DFAA55; --warn-soft:#2A2013; --past:#5E524E;
  }
}
:root[data-theme="dark"]{
  --paper:#100C0B; --surface:#1A1413; --ink:#F4EFEC; --ink-2:#C9BEB9; --muted:#94867F;
  --line:#2C2321; --line-2:#3D312E; --magma:#F2596A; --magma-soft:#2B1517; --blue:#7C97FF;
  --ok:#5CC08C; --ok-soft:#14261D; --warn:#DFAA55; --warn-soft:#2A2013; --past:#5E524E;
}
*{box-sizing:border-box}
body{background:var(--paper);color:var(--ink);font-family:"Helvetica Neue",Helvetica,Arial,system-ui,sans-serif;font-size:17px;line-height:1.62;margin:0;padding-inline:20px;padding-block:0 96px;-webkit-font-smoothing:antialiased}
.wrap{max-width:1120px;margin:0 auto}
.col{max-width:68ch}
h1,h2,h3{font-family:"Archivo","Arial Narrow","Helvetica Neue",Helvetica,sans-serif;text-wrap:balance}
.mono,.num,.eyebrow,.tag,th,.when{font-family:"Azeret Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.eyebrow{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--magma);font-weight:600}
header{padding:64px 0 40px;border-bottom:3px solid var(--ink)}
h1{font-size:clamp(38px,7vw,66px);line-height:.98;letter-spacing:-.03em;font-weight:800;margin:14px 0 18px}
.dek{font-size:20px;line-height:1.5;color:var(--ink-2);max-width:60ch;margin:0}
.meta{margin-top:26px;font-size:12.5px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase}
section{padding-top:60px}
.sect-label{border-top:1px solid var(--line-2);padding-top:18px}
h2{font-size:clamp(25px,3.4vw,34px);letter-spacing:-.02em;font-weight:800;margin:6px 0 20px;line-height:1.08}
h3{font-size:19px;font-weight:700;letter-spacing:-.01em;margin:34px 0 10px}
p{margin:0 0 18px}
.lede{font-size:19px;color:var(--ink-2)}
strong,b{font-weight:700;color:var(--ink)}
.num{font-weight:700;font-variant-numeric:tabular-nums}
a{color:var(--blue)}
.dim{color:var(--muted)} .sub{color:var(--ink-2);font-size:13.5px}
.verdict{background:var(--surface);border:1px solid var(--line-2);border-left:6px solid var(--magma);padding:30px 32px;margin:34px 0 0}
.verdict p:last-child{margin-bottom:0}
.verdict .eyebrow{display:block;margin-bottom:12px}
.say{background:var(--surface);border:1px solid var(--line-2);padding:16px 20px;margin:14px 0 22px;font-size:16px;color:var(--ink-2)}
.say::before{content:"Qué decir";display:block;font-family:"Azeret Mono",ui-monospace,monospace;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}

/* la barra del embudo, a escala */
.bar{display:flex;height:46px;margin:28px 0 14px;border:1px solid var(--line-2);background:var(--surface)}
.bar i{display:block;height:100%}
.b-ok{background:var(--ok)} .b-bad{background:var(--magma)} .b-past{background:var(--past)} .b-none{background:var(--line-2)}
.legend{display:grid;gap:12px 28px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));margin:0 0 8px;padding:0;list-style:none}
.legend li{display:grid;grid-template-columns:14px 1fr;gap:10px;font-size:14.5px;line-height:1.4;color:var(--ink-2)}
.legend i{width:14px;height:14px;margin-top:3px;display:block}
.legend b{display:block;font-family:"Azeret Mono",ui-monospace,monospace;font-size:15px;font-variant-numeric:tabular-nums}

.tablewrap{overflow-x:auto;margin:22px 0;border:1px solid var(--line-2);background:var(--surface)}
table{border-collapse:collapse;width:100%;font-size:14.5px;font-variant-numeric:tabular-nums}
th{text-align:left;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:600;padding:12px 14px;border-bottom:1px solid var(--line-2);white-space:nowrap}
td{padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
.r{text-align:right;white-space:nowrap}
.tag{display:inline-block;font-size:10px;letter-spacing:.06em;text-transform:uppercase;font-weight:600;padding:2px 7px;white-space:nowrap;border:1px solid currentColor;margin-left:6px}
.t-ok{color:var(--ok);background:var(--ok-soft)} .t-bad{color:var(--magma);background:var(--magma-soft)} .t-warn{color:var(--warn);background:var(--warn-soft)}

ol.canillas{list-style:none;counter-reset:c;padding:0;margin:30px 0 0}
ol.canillas>li{counter-increment:c;border-top:3px solid var(--ink);padding:26px 0 8px;margin-top:34px}
ol.canillas>li:first-child{margin-top:0}
.chead{display:grid;grid-template-columns:auto 1fr;gap:6px 18px;align-items:baseline}
.chead::before{content:counter(c);font-family:"Archivo","Arial Narrow",sans-serif;font-weight:800;font-size:54px;line-height:.9;color:var(--magma);grid-row:span 2}
.chead h3{margin:0;font-size:24px;font-weight:800;letter-spacing:-.02em}
.chead .size{font-family:"Azeret Mono",ui-monospace,monospace;font-size:14px;color:var(--ink-2);font-variant-numeric:tabular-nums}
.cbody{margin-top:18px}

.timeline{list-style:none;padding:0;margin:24px 0;border-left:2px solid var(--line-2)}
.timeline li{padding:0 0 20px 22px;position:relative}
.timeline li::before{content:"";position:absolute;left:-6px;top:8px;width:10px;height:10px;background:var(--magma)}
.timeline li.pend::before{background:var(--paper);border:2px solid var(--magma)}
.when{display:block;font-size:12px;letter-spacing:.06em;color:var(--muted);text-transform:uppercase}

.week{display:grid;gap:1px;background:var(--line-2);border:1px solid var(--line-2);margin:26px 0;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.week div{background:var(--surface);padding:20px 22px}
.week .day{font-family:"Azeret Mono",ui-monospace,monospace;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--magma);font-weight:700}
.week .min{float:right;color:var(--muted);font-weight:400}
.week p{margin:8px 0 0;font-size:15.5px;line-height:1.5;color:var(--ink-2)}

ol.steps{list-style:none;counter-reset:s;padding:0;margin:26px 0}
ol.steps li{counter-increment:s;display:grid;grid-template-columns:40px 1fr;gap:16px;padding:18px 0;border-top:1px solid var(--line)}
ol.steps li:last-child{border-bottom:1px solid var(--line)}
ol.steps li::before{content:counter(s);font-family:"Azeret Mono",ui-monospace,monospace;font-size:13px;font-weight:700;color:var(--magma);padding-top:3px}
ol.steps li>b,ol.steps li>span{grid-column:2}
ol.steps b{display:block;font-size:17px;margin-bottom:3px}
ol.steps span{color:var(--ink-2);font-size:15.5px;line-height:1.55}
.note{font-size:14px;color:var(--muted);line-height:1.55;margin-top:12px}
code{font-family:"Azeret Mono",ui-monospace,monospace;font-size:.86em;background:var(--line);padding:1px 5px}
footer{margin-top:72px;padding-top:24px;border-top:3px solid var(--ink);font-size:13px;color:var(--muted)}
</style>

<div class="wrap">
<header class="col">
  <span class="eyebrow">Comercial · Somos Magma</span>
  <h1>Comercial, bien explicado</h1>
  <p class="dek">Cómo compra tu cliente, cuánta plata hay esperando una respuesta, por dónde se empieza y qué se hace cada semana. De lo más fácil de vender a lo más difícil.</p>
  <p class="meta">${esc(HOY_TXT)} · números leídos del Master Magma en el momento</p>
</header>

<section class="col">
  <div class="verdict">
    <span class="eyebrow">La idea entera en un párrafo</span>
    <p>A Magma no le falta que le pidan precio. Hoy hay <strong>${T.vivos.n} presupuestos pedidos, con el evento todavía por delante y sin respuesta, por ${money(T.vivos.monto)}</strong>. Para empatar faltan <strong>${money(brecha)} de producción por mes</strong>, unos ${eventosFaltan} eventos. Esa plata está mucho más cerca en los presupuestos que ya mandaste que en gente que todavía no te conoce.</p>
    <p>Por eso lo comercial, hoy, es sobre todo <strong>volver a llamar</strong>. Salir a buscar clientes nuevos viene después, y también tiene su lugar en la semana.</p>
  </div>
</section>

<section class="col">
  <div class="sect-label"><span class="eyebrow">Primero, el modelo mental</span></div>
  <h2>Cómo compra tu cliente</h2>
  <p class="lede">El <span class="num">${pctAgencia}%</span> de lo facturado en 2026 entró por una agencia o productora de eventos: <span class="num">${money(B.totales.viaAgencia2026)}</span> de <span class="num">${money(B.totales[2026])}</span> (contando los eventos ya agendados). Tu cliente casi nunca es la marca. Es el que le arma el evento a la marca.</p>
  <p>Pensalo con tu propio presupuesto. Cuando cotizás, ponés un renglón "Film ½ jornada", con el costo de Lucho abajo y tu margen arriba. <strong>La agencia hace exactamente eso con vos.</strong> En el presupuesto que le pasa a la marca hay un renglón que dice "cobertura audiovisual", y ese renglón sos vos, con el margen de ellos arriba. Igual que el catering o el sonido.</p>
  <p>De ahí sale lo que una agencia necesita de un proveedor como Magma:</p>
  <ol class="steps">
    <li><b>Un precio, rápido</b><span>Ellos están armando su propuesta contra reloj. Si tu número tarda dos días, ponen el de otro. El que contesta primero queda en la planilla.</span></li>
    <li><b>Que el día del evento no haya sorpresas</b><span>Si fallás vos, los que quedan mal con la marca son ellos. Por eso repiten con quien ya les funcionó, y por eso cuesta entrar y después cuesta poco quedarse.</span></li>
    <li><b>Que no les saltees al cliente</b><span>Entrás como "su equipo audiovisual". Eso ya lo hacen bien, y conviene decirlo siempre.</span></li>
  </ol>
  <p>Entonces venderle a una agencia tiene dos momentos distintos. El primero pasa una sola vez: <strong>entrar en su lista de proveedores</strong>. Para eso sirven la presentación y los logos. El segundo pasa todas las veces: <strong>contestar cada pedido rápido y con un número</strong>. Una vez que estás en la lista, otra presentación no suma nada.</p>
</section>

<section class="col">
  <div class="sect-label"><span class="eyebrow">Un caso de esta semana</span></div>
  <h2>Lo que pasó con Alejandro Verzoub</h2>
  <p class="lede">Sirve de ejemplo porque muestra los dos momentos. Alejandro preside AV Business &amp; Communication y fue presidente mundial de SITE, la asociación de viajes de incentivo. Sofi lo conoció en el evento de Comafi.</p>
  <ul class="timeline">
    <li><span class="when">Lunes 14/09 · 18:08</span>Le mandaste el mail de presentación, con el link del brochure adentro. Iba también a Mónica Beinstein, su socia.</li>
    <li><span class="when">Lunes 14/09 · 18:24</span>Contestó a los 16 minutos: <em>"Los vamos a incluir en alguna solicitud de próximos eventos, específicamente en cobertura audiovisual, fotos y videos. Vale mañana te pasará una solicitud de cobertura de foto y video que nos puede servir de referencia."</em> Y sumó a Vale en copia.</li>
    <li class="pend"><span class="when">Martes 15/09</span>Tenía que llegar la solicitud de Vale. No llegó, ni ese día ni después.</li>
  </ul>
  <p><strong>Ya entraste en la lista.</strong> Eso es el primer momento, y salió bien. Lo que Alejandro pidió después es una "solicitud de referencia": un evento de ejemplo para ver cuánto cotizás. Quiere saber tu nivel de precio para poder ponerte como renglón.</p>
  <p>Por eso no hay que mandarle otra propuesta ni otra presentación. La pelota la tiene Vale, y lo que corresponde es recordárselo con amabilidad y prometerle el número en el día. El borrador de ese mail ya está en tu Gmail, adentro del mismo hilo.</p>
  <p>Y deja a la vista una pieza que falta: <strong>un tarifario de una página para agencias</strong>, con las tres o cuatro coberturas más pedidas y su precio de referencia. Con eso, el próximo Alejandro recibe presentación y número en el mismo mail.</p>
</section>

<section>
  <div class="col">
    <div class="sect-label"><span class="eyebrow">La plata que ya está esperando</span></div>
    <h2>${T.espera.n} presupuestos en espera, partidos como sirve mirarlos</h2>
    <p class="lede">De cada 10 presupuestos que se deciden, Magma gana 6: <span class="num">${T.cierre.aprobados}</span> aprobados sobre <span class="num">${T.cierre.aprobados + T.cierre.desaprobados}</span>. El problema está en los que nadie decide. Hoy son <span class="num">${T.espera.n}</span> por <span class="num">${money(T.espera.monto)}</span>.</p>
  </div>
  <div class="bar" role="img" aria-label="Reparto de los presupuestos en espera por monto">
    <i class="b-ok" style="width:${w(seg.enPlazo.monto)}"></i><i class="b-bad" style="width:${w(seg.vencidos.monto + seg.sinFechaPresu.monto)}"></i><i class="b-past" style="width:${w(T.pasados.monto)}"></i><i class="b-none" style="width:${w(T.sinFecha.monto)}"></i>
  </div>
  <ul class="legend">
    <li><i class="b-ok"></i><span><b>${seg.enPlazo.n} · ${money(seg.enPlazo.monto)}</b>Mandados hace ${seg.dia} días o menos. Todavía es normal que no hayan contestado. Acá adentro está la Gira de ${esc(gira.agencia)}, que sola son ${money(gira.monto)}.</span></li>
    <li><i class="b-bad"></i><span><b>${seg.vencidos.n} · ${money(seg.vencidos.monto)}</b>Evento por delante y más de ${seg.dia} días desde que se mandaron. Esta es la pila que hay que llamar.</span></li>
    <li><i class="b-past"></i><span><b>${T.pasados.n} · ${money(T.pasados.monto)}</b>El evento ya pasó. O se perdió, o se hizo y nadie actualizó la fila. Se cierran, no se llaman.</span></li>
    <li><i class="b-none"></i><span><b>${T.sinFecha.n} · ${money(T.sinFecha.monto)}</b>Sin fecha de evento cargada.</span></li>
  </ul>
  <div class="col">
    <p style="margin-top:26px">La cuenta que ordena la prioridad: faltan <span class="num">${money(brecha)}</span> por mes para empatar, y la pila roja suma <span class="num">${money(seg.vencidos.monto)}</span>. <strong>Con cerrar ${pctPila} de cada 100 pesos de esa pila, cubrís un mes entero de lo que falta.</strong></p>
    <p><strong>Una aclaración importante.</strong> "Más de ${seg.dia} días" cuenta desde que se armó el presupuesto. El sheet no tiene dónde anotar si alguien llamó después, así que en esa pila hay de todo: clientes que ya dijeron "lo estamos viendo" y clientes que nadie volvió a tocar. Hoy no se pueden distinguir. Ese es el primer hueco del sistema, y está más abajo.</p>
    <h3>De quién es cada uno</h3>
  </div>
  <div class="tablewrap col"><table>
    <thead><tr><th>PM del presupuesto</th><th class="r">Vivos</th><th class="r">Monto</th></tr></thead>
    <tbody>${Object.entries(T.porPM).sort((a, b) => b[1].monto - a[1].monto).map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td class="r mono">${v.n}</td><td class="r num">${money(v.monto)}</td></tr>`).join('')}</tbody>
  </table></div>
  <div class="col">
    <p>De los ${T.vivos.n} vivos, ${pmJuan.n} son tuyos y <strong>${deOtros} los mandó otra persona</strong>. Si el seguimiento lo hacés vos solo, esos ${deOtros} dependen de que te acuerdes de presupuestos que no armaste. Lo que más rinde es que <strong>cada PM siga los suyos</strong> y que vos mires el tablero completo los lunes.</p>
    <h3>Los que se mueren esta quincena</h3>
    <p>Evento en 14 días o menos y más de ${seg.dia} días sin respuesta. Si nadie confirma, a esta altura ya lo tiene otro o lo resuelven sin video. Son <span class="num">${urgentes.length}</span> por <span class="num">${money(sumUrg)}</span>, y son los primeros llamados.</p>
  </div>
  <div class="tablewrap"><table>
    <thead><tr><th class="r">Monto</th><th>N°</th><th>Cliente y proyecto</th><th class="r">Evento en</th><th class="r">Mandado hace</th><th>PM</th><th>Contacto</th></tr></thead>
    <tbody>${urgentes.map(filaPresu).join('')}</tbody>
  </table></div>
</section>

<section>
  <div class="col">
    <div class="sect-label"><span class="eyebrow">El orden</span></div>
    <h2>Las cinco canillas, de la más barata a la más cara</h2>
    <p class="lede">Una canilla es un lugar de donde puede salir una venta. Están ordenadas por cuánto cuesta sacarles un peso: arriba, gente que ya te pidió precio; abajo, gente que no sabe que existís. Se abren en este orden, y recién se pasa a la siguiente cuando la anterior está atendida.</p>
  </div>
  <ol class="canillas">
    <li>
      <div class="chead col"><h3>Los presupuestos vivos</h3><span class="size">${T.vivos.n} presupuestos · ${money(T.vivos.monto)} · 2 minutos cada uno</span></div>
      <div class="cbody col">
        <p>Ya te pidieron precio y ya lo tienen. No hay que convencer a nadie de nada: hay que preguntar. La mitad de las veces la respuesta es "uy, sí, confirmame", porque del otro lado también se les pasó.</p>
        <div class="say">"Hola Caro, ¿cómo va? Te escribo por el presupuesto de la fiesta de fin de año que te pasé a fines de agosto. ¿Sigue en pie? Si hay que ajustar algo lo vemos, así les reservo el equipo para esa fecha."</div>
        <p>"Les reservo el equipo" es la frase que mueve. Les da un motivo real para contestar ahora: la fecha se puede ocupar.</p>
      </div>
      <div class="tablewrap"><table>
        <thead><tr><th class="r">Monto</th><th>N°</th><th>Cliente y proyecto</th><th class="r">Evento en</th><th class="r">Mandado hace</th><th>PM</th><th>Contacto</th></tr></thead>
        <tbody>${T.listaVivos.map(filaPresu).join('')}</tbody>
      </table></div>
      <div class="col"><h3>Y los ${T.pasados.n} con el evento ya pasado</h3>
        <p>Estos no se llaman para vender. Se revisan uno por uno y se cierran: si el trabajo se hizo, pasa a aprobado; si se cayó, a desaprobado con el motivo. Mientras sigan "en espera" ensucian todos los números de arriba.</p></div>
      <div class="tablewrap col"><table>
        <thead><tr><th class="r">Monto</th><th>N°</th><th>Cliente y proyecto</th><th class="r">Evento hace</th><th>PM</th></tr></thead>
        <tbody>${T.listaPasados.map(p => `<tr><td class="r num">${money(p.monto)}</td><td class="mono">#${esc(p.n)}</td><td><b>${esc(p.cliente || p.agencia)}</b><br><span class="sub">${esc(p.proyecto)}</span></td><td class="r mono">${-p.diasAlEvento}d</td><td>${esc(p.pm)}</td></tr>`).join('')}</tbody>
      </table></div>
    </li>

    <li>
      <div class="chead col"><h3>Los clientes activos: venderles un programa</h3><span class="size">${activos.length} clientes · ${money(sumAct)} en 2026</span></div>
      <div class="cbody col">
        <p>Son los que trabajaron con Magma en los últimos 60 días o tienen algo agendado. Con ellos la venta es proponerles algo más grande que el próximo evento.</p>
        <p>El modelo ya lo armaste con ${esc(gira.agencia)}: en vez de cotizar 35 coberturas sueltas a lo largo del año, <strong>un programa de ${money(gira.monto)}</strong>. El cliente resuelve todo de una vez y con un precio mejor por jornada. Magma gana lo que más le falta, que es saber de antemano cuánto va a facturar.</p>
        <div class="say">"Este año ya hicimos ${activos[0] ? activos[0].n[2026] : ''} trabajos juntos. ¿Querés que armemos el calendario del año que viene como un paquete? Les queda un precio cerrado por jornada y la fecha reservada."</div>
      </div>
      <div class="tablewrap col"><table>
        <thead><tr><th>Cliente</th><th class="r">Trabajos 2026</th><th class="r">Facturado 2026</th><th class="r">Promedio por trabajo</th></tr></thead>
        <tbody>${activos.slice(0, 10).map(c => `<tr><td><b>${esc(c.nombre)}</b></td><td class="r mono">${c.n[2026]}</td><td class="r num">${money(c.y[2026])}</td><td class="r mono">${money(c.y[2026] / c.n[2026])}</td></tr>`).join('')}</tbody>
      </table></div>
      <div class="col"><p class="note">Los de muchos trabajos y promedio bajo son los candidatos naturales a un abono mensual. Los de pocos trabajos y promedio alto, a un paquete anual de producciones.</p></div>
    </li>

    <li>
      <div class="chead col"><h3>Los que se están enfriando</h3><span class="size">${frios.length} clientes · te compraron ${money(sumFrios)} este año</span></div>
      <div class="cbody col">
        <p>Trabajaron con Magma en 2026, pero hace ${minDiasFrio} días o más que no hacen nada y no tienen nada agendado. Todavía se acuerdan de vos. En seis meses ya no.</p>
        <p>Septiembre es buen momento para este llamado, porque ahora es cuando las empresas arman las fiestas y los cierres de fin de año.</p>
        <div class="say">"Hola Natalia, hace un par de meses que no hacemos nada juntos. ¿Qué tienen en agenda para fin de año? Noviembre y diciembre se nos llenan rápido y prefiero guardarles lugar."</div>
      </div>
      <div class="tablewrap"><table>
        <thead><tr><th>Cliente</th><th class="r">Compró en 2026</th><th class="r">Último trabajo</th><th class="r">Hace</th><th>Contacto</th></tr></thead>
        <tbody>${frios.map(c => `<tr><td><b>${esc(c.nombre)}</b></td><td class="r num">${money(c.y[2026])}</td><td class="r mono">${esc(c.ultima)}</td><td class="r mono">${c.dias}d</td><td class="sub">${contacto(c)}</td></tr>`).join('')}</tbody>
      </table></div>
    </li>

    <li>
      <div class="chead col"><h3>Los perdidos</h3><span class="size">${perdidos.length} clientes · ${money(sumPerd)} entre 2024 y 2025 · cero en 2026</span></div>
      <div class="cbody col">
        <p>Compraron en 2024 o 2025 y este año nada. Es más difícil que lo anterior porque hay que averiguar qué pasó: cambió la persona, se fueron con otro, dejaron de hacer eventos, o simplemente nadie los llamó.</p>
        <p>Hay un obstáculo concreto antes de llamar: <strong>solo ${perdConContacto} de los ${perdidos.length} tienen un contacto cargado</strong>. De los otros ${perdidos.length - perdConContacto} hay que reconstruir con quién se hablaba, por mail o por WhatsApp.</p>
        <p>También hay una decisión sin cerrar con Sofi. El 02/08 acordaron no salir a recuperarlos y el 17/08 propusiste llamar a 10 por mes. Las dos cosas no conviven. Mi recomendación es 10 por mes, empezando por los cinco de arriba.</p>
      </div>
      <div class="tablewrap"><table>
        <thead><tr><th>Cliente</th><th class="r">Facturó 2024 + 2025</th><th class="r">Trabajos</th><th class="r">Última vez</th><th>Contacto</th></tr></thead>
        <tbody>${perdidos.slice(0, 10).map(c => `<tr><td><b>${esc(c.nombre)}</b></td><td class="r num">${money(c.y[2024] + c.y[2025])}</td><td class="r mono">${c.nTotal}</td><td class="r mono">${esc(c.ultima)}</td><td class="sub">${contacto(c)}</td></tr>`).join('')}</tbody>
      </table></div>
    </li>

    <li>
      <div class="chead col"><h3>El frío: las asociaciones</h3><span class="size">3 padrones públicos · 46 mails directos ya extraídos</span></div>
      <div class="cbody col">
        <p>Una asociación o cámara es un club de empresas del mismo rubro. Lo que te sirve es su <strong>padrón de socios</strong>: es público, trae nombre y web, y funciona como una lista de clientes potenciales ya filtrada. Para escribirles no hace falta asociarse ni pagar cuota.</p>
        <p>El 18/08 cruzamos los tres padrones contra tus clientes. Quedaron en este orden:</p>
      </div>
      <div class="tablewrap col"><table>
        <thead><tr><th>Asociación</th><th>Quiénes son</th><th class="r">Socios</th><th class="r">Mails listos</th></tr></thead>
        <tbody>
          <tr><td><b>Agencias Argentinas</b></td><td class="sub">Agencias de publicidad, de medios y productoras. Tu nicho, textual. ADN es socia y es cliente tuyo.</td><td class="r mono">121</td><td class="r mono">31</td></tr>
          <tr><td><b>AOCA</b></td><td class="sub">Congresos, ferias y convenciones. 35 organizadores que pueden contratar. Nadie ahí adentro filma y edita.</td><td class="r mono">135</td><td class="r mono">9</td></tr>
          <tr><td><b>AOFREP</b></td><td class="sub">Organizadores de fiestas y eventos. Mitad es social. Corporativo confirmado son 9, y hay 3 competidores adentro.</td><td class="r mono">85</td><td class="r mono">6</td></tr>
        </tbody>
      </table></div>
      <div class="cbody col">
        <h3>Cómo se trabaja sin quemar la lista</h3>
        <ol class="steps">
          <li><b>Se arranca por AOCA y AOFREP</b><span>Son organizadores de eventos, el mismo perfil que AV Business. El mail que le mandaste a Alejandro es la plantilla. Él venía presentado por Sofi, así que en frío van a contestar menos, pero el texto ya demostró que se entiende.</span></li>
          <li><b>Tandas de 8 por semana, no los 46 juntos</b><span>Cada mail que sale genera un seguimiento a los 4 días. Ocho por semana se pueden seguir. Cuarenta y seis de golpe no, y un mail en frío sin seguimiento casi no rinde.</span></li>
          <li><b>Agencias Argentinas espera a la charla con ADN</b><span>El gancho de esos 31 mails es "trabajamos con ADN, que es socia como ustedes". Antes de usar su nombre hay que avisarle a Gonzalo y preguntarle cómo es la asociación por dentro. Que esa charla vaya aparte del reclamo de facturas que les está haciendo Flor.</span></li>
          <li><b>Las cuotas se piden, no se pagan todavía</b><span>Asociarse sirve si alguien de Magma va a ir a los encuentros. Primero se prueba el padrón gratis. Si contestan, ahí se evalúa la cuota.</span></li>
        </ol>
        <p class="note">Las tablas completas con los 46 mails están en <a href="https://claude.ai/code/artifact/7cd024f4-0db7-486e-b64b-16cf7615c3cf">Dónde se mete Magma</a>.</p>
      </div>
    </li>
  </ol>
</section>

<section>
  <div class="col">
    <div class="sect-label"><span class="eyebrow">La rutina</span></div>
    <h2>La semana comercial: unas tres horas</h2>
    <p class="lede">Es el mismo músculo que tu control diario de Calendar, Proyectos, Facturación y Pagos, aplicado a la venta. Poco tiempo, todos los días, siempre igual.</p>
  </div>
  <div class="week">
    <div><span class="day">Lunes <span class="min">30 min</span></span><p>Correr el tablero y elegir los 10 llamados de la semana. Primero los de evento más cercano. Repartir a cada PM los suyos.</p></div>
    <div><span class="day">Martes a jueves <span class="min">20 min por día</span></span><p>Tres o cuatro seguimientos por día, por WhatsApp o llamado. De la canilla 1 hasta agotarla, después la 3.</p></div>
    <div><span class="day">Miércoles <span class="min">30 min</span></span><p>Sale la tanda de 8 mails en frío, y el seguimiento de la tanda de la semana anterior.</p></div>
    <div><span class="day">Viernes <span class="min">20 min</span></span><p>Cerrar filas: lo que se cayó pasa a desaprobado con su motivo, lo que se hizo a aprobado. El lunes el tablero amanece limpio.</p></div>
  </div>
  <div class="col">
    <p>El 03/09 dejaste un disparador escrito: <strong>si el seguimiento del día 4 se incumple dos semanas seguidas, el área necesita otro ejecutor</strong>. Con ${seg.vencidos.n} presupuestos pasados del día 4, conviene empezar a contar esta semana como la primera.</p>
  </div>
</section>

<section class="col">
  <div class="sect-label"><span class="eyebrow">Lo que falta construir</span></div>
  <h2>Cuatro huecos del sistema, por impacto</h2>
  <ol class="steps">
    <li><b>No hay dónde anotar que llamaste</b><span>Hoy un presupuesto tiene fecha de armado y estado, nada más. Faltan dos columnas en PRESUPUESTOS, al lado de la fecha: "Último contacto" y "Próximo paso", editables desde la app. Con eso, el mail de las 8 de La diaria puede traer un bloque "hoy te toca llamar a estos tres", igual que ya te avisa lo del contador. El seguimiento deja de depender de tu memoria.</span></li>
    <li><b>El tarifario de una página para agencias</b><span>Es lo que AV Business está esperando sin saberlo. Tres o cuatro coberturas con precio de referencia y qué incluye cada una. Sale del catálogo de 6 productos que ya está definido.</span></li>
    <li><b>La columna Origen</b><span>Pendiente desde el 02/09. Hoy no está registrado por dónde llegó ninguno de tus ${cli.length} clientes. Sin ese dato no vas a poder saber si las asociaciones, Instagram o los referidos trajeron algo.</span></li>
    <li><b>Los contactos de los perdidos</b><span>${perdidos.length - perdConContacto} clientes que facturaron sin un nombre al que llamar. Se reconstruye una vez, buscando en el mail.</span></li>
  </ol>
</section>

<section class="col">
  <div class="sect-label"><span class="eyebrow">Hoy</span></div>
  <h2>Tres cosas, en este orden</h2>
  <ol class="steps">
    <li><b>Mandar el borrador a Vale y Alejandro</b><span>Está en tu Gmail, en el hilo. Revisá que salga desde juan@somosmagma.com. Dos minutos.</span></li>
    <li><b>Escribirle a ${esc(gira.contacto)} por la Gira</b><span>#${esc(gira.n)}, ${money(gira.monto)}, mandado hace ${gira.diasPresu} días. Es el ${pct(gira.monto, T.vivos.monto)}% de todo lo que está vivo. ${gira.diasPresu < seg.dia ? (seg.dia - gira.diasPresu === 1 ? 'Mañana se cumple el día ' + seg.dia + '.' : 'El día ' + seg.dia + ' se cumple en ' + (seg.dia - gira.diasPresu) + ' días.') : 'Ya pasó el día ' + seg.dia + '.'}</span></li>
    <li><b>Los ${urgentes.length} de la quincena</b><span>La tabla "Los que se mueren esta quincena". Los tuyos los llamás vos, y el resto se lo pasás hoy a cada PM.</span></li>
  </ol>
</section>

<section class="col">
  <div class="sect-label"><span class="eyebrow">Para ubicarte</span></div>
  <h2>Qué es cada documento que ya tenés</h2>
  <p>Esta página los ordena. Ninguno queda reemplazado.</p>
  <ul>
    <li><a href="https://claude.ai/code/artifact/1fc2168a-37a0-4198-85ab-56777881045b">Qué es el área Comercial</a> (03/09): las reglas del área, el catálogo de 6 productos y quién decide el precio.</li>
    <li><a href="https://claude.ai/code/artifact/dc54f897-ae6e-4b4c-be25-6a818ea1816f">Plan para salir a vender</a> (02/09): de dónde salieron las cinco canillas y los 6 entregables pedidos a Sofi.</li>
    <li><a href="https://claude.ai/code/artifact/7cd024f4-0db7-486e-b64b-16cf7615c3cf">Dónde se mete Magma</a> (18/08): las tres asociaciones con los 46 mails.</li>
    <li><a href="https://claude.ai/code/artifact/1ada5c3b-25ee-43aa-abec-a914500b68ad">Brief comercial para Tom</a> (13/08): la base de clientes para prospectar en paralelo.</li>
  </ul>
</section>

<footer class="col">
  <p>Armado el ${esc(HOY_TXT)} con <code>scripts/comercial-explicado-html.mjs</code>, que toma los números de <code>comercial-tablero.mjs</code> (presupuestos), <code>numeros-base.mjs</code> (equilibrio) y <code>brief-comercial.mjs</code> (clientes) leyendo el Master Magma en el momento. Montos sin IVA. Los conteos de las asociaciones son del análisis del 18/08 sobre los padrones públicos. "Evento en" y "mandado hace" se cuentan en días corridos desde hoy.</p>
</footer>
</div>
`
writeFileSync(OUT, html)
console.log('OK →', OUT)
console.log(JSON.stringify({ vivos: T.vivos, vencidos: seg.vencidos, enPlazo: seg.enPlazo, pasados: T.pasados, urgentes: { n: urgentes.length, monto: sumUrg }, brecha, eventosFaltan, pctPila, activos: { n: activos.length, monto: sumAct }, frios: { n: frios.length, monto: sumFrios, minDias: minDiasFrio }, perdidos: { n: perdidos.length, monto: sumPerd, conContacto: perdConContacto }, pctAgencia, giraPct: pct(gira.monto, T.vivos.monto) }, null, 1))
