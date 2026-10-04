// Genera guia-mi-magma.html: la guía para los freelancers, un paso por pantalla, con las capturas de guia/*.jpg adentro.
import { readFileSync, writeFileSync } from 'fs'
const DIR = process.argv[2] || '_preview-mi-magma-2'
const img = n => `data:image/jpeg;base64,${readFileSync(`${DIR}/guia/${n}.jpg`).toString('base64')}`
const LOGO = `data:image/png;base64,${readFileSync('/Users/dronjuan/somos-magma-app/public/branding/logo-magma.png').toString('base64')}`
const LINEA = `data:image/png;base64,${readFileSync('/Users/dronjuan/somos-magma-app/public/branding/linea-titulo.png').toString('base64')}`
const LINK = 'https://somos-magma-app.vercel.app/mi'

let n = 0
const paso = ({ titulo, texto, foto, alt, dibujo, nota }) => `<section class="paso">
  <div class="txt"><span class="n">${String(++n).padStart(2, '0')}</span><h3>${titulo}</h3><p>${texto}</p>${nota ? `<p class="nota">${nota}</p>` : ''}</div>
  <div class="vis">${foto ? `<div class="cel"><img src="${img(foto)}" alt="${alt}" loading="lazy"></div>` : dibujo}</div>
</section>`
const parte = (k, t, s) => `<header class="parte"><span>Parte ${k}</span><h2>${t}</h2><img class="linea" src="${LINEA}" alt=""><p>${s}</p></header>`

// Los dos dibujos de "ponerla como app": son pantallas del celular, no de Mi Magma, así que van dibujadas.
const ANDROID = `<div class="cel dib"><div class="os">
  <div class="barra"><span class="url">somos-magma-app.vercel.app/mi</span><span class="punto marca">⋮</span></div>
  <ul class="menu"><li>Nueva pestaña</li><li>Historial</li><li>Compartir…</li><li class="marca">Agregar a la pantalla principal</li><li>Sitio de escritorio</li></ul>
  <p class="pie">Chrome en Android</p></div></div>`
const IPHONE = `<div class="cel dib"><div class="os">
  <ul class="menu hoja"><li>Copiar</li><li>Agregar a marcadores</li><li class="marca">Agregar a inicio</li><li>Buscar en la página</li></ul>
  <div class="barra abajo"><span>‹</span><span>›</span><span class="punto marca"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Compartir"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg></span><span>▢</span><span>⧉</span></div>
  <p class="pie">Safari en iPhone</p></div></div>`

const html = `<title>Mi Magma, cómo se usa</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;500;600;700&family=Azeret+Mono:wght@500;600&display=swap">
<style>
/* Layout: como un mazo de fichas para pasar con el dedo. Tapa negra, tres partes, un paso por ficha: número grande, una frase y la pantalla real del celular con el botón marcado en rojo. En compu, texto a la izquierda y celular a la derecha. */
:root { --bg:#ffffff; --fg:#090909; --dim:#626262; --line:#e6e4e1; --soft:#f4f3f1; --magma:#CE2637; --azul:#1543f8; --marco:#090909;
  --display:'Anton', 'Archivo Black', Impact, sans-serif; --body:'Archivo', -apple-system, system-ui, sans-serif; --mono:'Azeret Mono', ui-monospace, Menlo, monospace }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#090909; --fg:#f4f2f0; --dim:#a8a6a3; --line:#2b2a29; --soft:#171616; --marco:#3a3938; color-scheme:dark } }
:root[data-theme="dark"] { --bg:#090909; --fg:#f4f2f0; --dim:#a8a6a3; --line:#2b2a29; --soft:#171616; --marco:#3a3938; color-scheme:dark }
* { box-sizing:border-box }
body { background:var(--bg); color:var(--fg); font-family:var(--body); font-size:17px; line-height:1.5; margin:0; padding-block:0 56px; padding-inline:16px }
.wrap { max-width:860px; margin:0 auto }
.tapa { background:#090909; color:#fff; margin:0 -16px; padding:36px 16px 30px }
.tapa .wrap { display:grid; gap:16px }
.tapa img.logo { height:26px; width:auto; filter:invert(1) }
h1 { font-family:var(--display); font-weight:400; text-transform:uppercase; font-size:clamp(44px, 12vw, 84px); line-height:.92; margin:0; letter-spacing:.01em; text-wrap:balance }
.tapa p { color:#c8c6c3; margin:0; max-width:46ch }
.link { display:block; background:var(--magma); color:#fff; font-family:var(--mono); font-weight:600; font-size:16px; padding:15px 16px; border-radius:10px; text-decoration:none; text-align:center; overflow-wrap:anywhere; max-width:520px }
.link:focus-visible { outline:3px solid #fff; outline-offset:3px }
.resumen { display:flex; flex-wrap:wrap; gap:8px; margin:0; padding:0; list-style:none }
.resumen li { border:1px solid #444; border-radius:999px; padding:5px 12px; font-size:13.5px; color:#e8e6e3 }
.parte { margin:44px 0 6px; padding-top:26px; border-top:3px solid var(--fg) }
.parte span { font-family:var(--mono); font-size:12.5px; letter-spacing:.1em; text-transform:uppercase; color:var(--magma); font-weight:600 }
.parte h2 { font-family:var(--display); font-weight:400; text-transform:uppercase; font-size:clamp(32px, 8vw, 52px); line-height:.95; margin:4px 0 0; letter-spacing:.01em; text-wrap:balance }
.parte .linea { display:block; height:10px; width:min(240px, 60%); object-fit:cover; object-position:left; margin:8px 0 6px }
.parte p { margin:0; color:var(--dim); max-width:52ch }
.paso { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,300px); gap:18px 40px; align-items:center; padding:28px 0; border-bottom:1px solid var(--line) }
@media (max-width:680px) { .paso { grid-template-columns:minmax(0,1fr); gap:16px } .vis { justify-self:center } }
.txt, .vis { min-width:0 }
.vis { width:100%; display:grid; justify-items:center }
.n { display:block; font-family:var(--display); font-size:54px; line-height:1; color:var(--magma) }
.paso h3 { font-size:24px; line-height:1.15; font-weight:700; margin:6px 0 8px; text-wrap:balance }
.paso p { margin:0 0 8px; max-width:40ch }
.paso p:last-child { margin:0 }
.paso b { font-weight:700 }
.nota { color:var(--dim); font-size:15px; border-left:3px solid var(--azul); padding-left:11px }
.cel { width:100%; max-width:300px; min-width:0; border:8px solid var(--marco); border-radius:30px; overflow:hidden; background:#fff }
.cel img { display:block; width:100% }
.dos { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:14px; width:100%; justify-items:center }
@media (max-width:680px) { .dos { grid-template-columns:minmax(0,1fr) } }
.paso.ancho { grid-template-columns:minmax(0,1fr) }
.paso.ancho .vis { justify-self:stretch }
.dib { background:#fff; color:#090909 }
.os { padding:14px 12px 12px; display:grid; grid-template-columns:minmax(0,1fr); gap:10px; font-size:14px }
.barra { display:flex; align-items:center; gap:8px; min-width:0; background:#f1efec; border-radius:999px; padding:7px 8px 7px 14px }
.barra.abajo { justify-content:space-around; border-radius:14px; padding:9px 8px; font-size:20px; color:#1543f8 }
.url { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:var(--mono); font-size:11.5px; color:#444 }
.punto { display:inline-grid; place-items:center; width:32px; height:32px; border-radius:50%; font-size:20px; font-weight:700; line-height:1; color:#090909 }
.menu { list-style:none; margin:0; padding:6px; border:1px solid #dedbd7; border-radius:12px; box-shadow:0 6px 18px rgba(0,0,0,.12); display:grid; gap:2px }
.menu li { padding:9px 10px; border-radius:8px; color:#333 }
.menu.hoja { box-shadow:none; background:#f6f5f3 }
.marca { outline:3px solid #CE2637; outline-offset:2px; font-weight:700; color:#090909 !important }
.pie { margin:0; text-align:center; font-family:var(--mono); font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:#777 }
.cierre { margin-top:40px; background:#090909; color:#fff; border-radius:14px; padding:24px 20px }
.cierre h2 { font-family:var(--display); font-weight:400; text-transform:uppercase; font-size:30px; line-height:1; margin:0 0 10px }
.cierre p { margin:0 0 6px; color:#d9d7d4 } .cierre p:last-child { margin:0 }
footer { margin-top:22px; color:var(--dim); font-size:13.5px }
</style>

<div class="tapa"><div class="wrap">
  <img class="logo" src="${LOGO}" alt="Somos Magma">
  <h1>Mi Magma, cómo se usa</h1>
  <p>Tu agenda, lo que cobrás y cómo quedó lo que filmaste. Todo en el celular. Son 5 minutos, una sola vez.</p>
  <a class="link" href="${LINK}">somos-magma-app.vercel.app/mi</a>
  <ul class="resumen"><li>1 · Entrar</li><li>2 · Ponerla como app</li><li>3 · Lo que hacés siempre</li></ul>
</div></div>

<div class="wrap">
${parte(1, 'Entrar', 'Con tu Gmail, el mismo que tenés con Magma. Sin contraseña nueva.')}
${paso({ titulo: 'Abrí el link y tocá <b>Ingresar con Google</b>', texto: 'Tocá el botón rojo de arriba. Se abre esta pantalla negra. Elegí <b>tu Gmail, el que tenés con Magma</b> (al que te llegan los mails de los trabajos).', foto: '01-entrar', alt: 'La pantalla de entrada de Somos Magma con el botón Ingresar con Google marcado', nota: 'Con otro mail no entra.' })}
${paso({ titulo: 'Listo, esta es tu agenda', texto: 'Arriba dice "Hola" y tu nombre, y abajo tus próximos trabajos. Las cuatro solapas de abajo son todo lo que hay.', foto: '02-agenda', alt: 'La agenda de Mi Magma con dos trabajos', nota: 'Si dice "Tu mail no tiene acceso", avisale a Juan: falta activarte.' })}

${parte(2, 'Ponela como app', 'Así te queda el ícono de Magma en el celular y te llegan los avisos. Se hace una sola vez.')}
<section class="paso ancho">
  <div class="txt"><span class="n">${String(++n).padStart(2, '0')}</span><h3>Agregala a la pantalla de inicio</h3>
  <p><b>Android:</b> tocá los <b>tres puntos</b> de arriba a la derecha y después <b>Agregar a la pantalla principal</b>. En algunos dice <b>Instalar app</b>.</p>
  <p><b>iPhone:</b> tocá <b>Compartir</b> (el cuadrado con la flecha, abajo) y después <b>Agregar a inicio</b>. Si no lo ves, deslizá la lista para arriba.</p></div>
  <div class="vis"><div class="dos">${ANDROID}${IPHONE}</div></div>
</section>
${paso({ titulo: 'Activá los avisos', texto: 'Entrá desde el ícono nuevo. Abajo de la agenda tocá <b>Activar avisos</b> y, cuando el celular pregunte, <b>Permitir</b>. Te llega un aviso de prueba al toque.', foto: '05-avisos', alt: 'La tarjeta Avisos en este celular con el botón Activar avisos', nota: 'En iPhone solo funciona entrando desde el ícono, no desde Safari.' })}

${parte(3, 'Lo que hacés siempre', 'Cada cosa es un toque. Sin mandar mensajes.')}
${paso({ titulo: 'Confirmá cada trabajo', texto: 'Cuando te suman a un trabajo te llega un aviso. Abrilo y tocá <b>Confirmo</b>. Con eso Magma sabe que cuenta con vos.', foto: '03-confirmar', alt: 'La ficha de un trabajo con los botones Confirmo y No puedo', nota: 'Ahí mismo tenés el horario, el lugar, con quién vas y qué hay que grabar.' })}
${paso({ titulo: 'Si no podés, avisá desde ahí', texto: 'Tocá <b>No puedo</b>, contá por qué y tocá <b>Avisar que no puedo</b>. Le llega a tu PM al instante.', foto: '04-no-puedo', alt: 'El formulario para avisar que no podés ir a un trabajo', nota: 'Si ya habías confirmado tiene que ser algo grave: además llamalo.' })}
${paso({ titulo: 'Marcá los días que no podés', texto: 'Abajo de la agenda hay un calendario. Tocá un día libre y queda tachado: ese día no te convocan. Otro toque lo saca.', foto: '06-dias', alt: 'El calendario del mes con un día tachado', nota: 'En negro están los días que ya tenés trabajo.' })}
${paso({ titulo: 'Dejale una nota a la editora', texto: 'Si en el lugar te dijeron algo (la marca, la productora) o no pudiste grabar algo, tocá <b>Dejar una nota para la editora</b> y escribilo.', foto: '07-nota', alt: 'La sección Para la editora dentro de un trabajo', nota: 'Está adentro de cada trabajo, abajo de todo.' })}
${paso({ titulo: 'Pasá los gastos con el ticket', texto: 'Nafta, peaje, un taxi. En <b>Facturar</b> tocá <b>Pasar un gasto</b>, elegí el trabajo, poné cuánto y sacale una foto al ticket.', foto: '09-gasto', alt: 'La sección Gastos que pagaste vos con el botón Pasar un gasto', nota: 'Cuando administración lo aprueba, se suma a lo que cobrás.' })}
${paso({ titulo: 'Subí tu factura', texto: 'En <b>Facturar</b> elegí el mes y tocá <b>Subir mi factura</b>. En PDF o con una foto. Se sube del 10 al 15.', foto: '08-facturar', alt: 'La tarjeta Tu factura de septiembre con el botón Subir mi factura', nota: 'Arriba ves el detalle día por día para armarla.' })}
${paso({ titulo: 'Mirá cómo quedó', texto: 'En <b>Cómo quedó</b> ves en qué anda la edición de lo que filmaste. Cuando se entrega aparece <b>Ver cómo quedó</b> con el video.', foto: '10-como-quedo', alt: 'La solapa Cómo quedó con un trabajo entregado y otro en edición' })}
${paso({ titulo: 'Tu ficha y tu historial', texto: 'En <b>Mi ficha</b> están tus datos, tu acuerdo si tenés, y cuánto laburaste y cobraste cada mes.', foto: '11-ficha', alt: 'La solapa Mi ficha con el historial del año', nota: 'Si un dato está mal, avisale a administración.' })}

<div class="cierre">
  <h2>Si algo no anda</h2>
  <p>Cerrá la app y volvé a abrirla.</p>
  <p>Si sigue igual, sacale una captura y mandásela a Juan.</p>
</div>
<footer>Las pantallas de esta guía tienen datos de ejemplo. En la tuya vas a ver solo lo tuyo.</footer>
</div>
`
writeFileSync(`${DIR}/guia-mi-magma.html`, html)   // publicar SIEMPRE sobre el mismo artifact (MZMNdhj762GendAnXTdM18)
console.log('ok', Math.round(html.length / 1024), 'KB ·', n, 'pasos')
