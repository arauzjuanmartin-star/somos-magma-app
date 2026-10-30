// Arma una página por caso (30/10) con el CSS de pagina-cobertura.html. Datos: PROYECTOS 2026 + pagina-trabajos.html.
// Uso: node docs/web/_generar-casos.mjs  → escribe docs/web/caso-<slug>.html
import { readFileSync, writeFileSync } from 'fs'
const dir = new URL('.', import.meta.url).pathname
const base = readFileSync(dir + 'pagina-cobertura.html', 'utf8')
const css = base.slice(0, base.indexOf('<div class="mg">')) + `<style>
.mg .ficha .w{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
.mg .ficha b{font-family:'Archivo',Arial,sans-serif;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.06em;opacity:.85}
.mg .ficha span{font-size:19px;margin-top:4px}
.mg .texto p{font-size:19px;max-width:820px;margin:0 0 18px}
.mg ul.hecho{list-style:none;padding:0;margin:0;max-width:820px}
.mg ul.hecho li{font-size:18px;padding:12px 0;border-top:2px solid var(--n)}
.mg ul.hecho li:last-child{border-bottom:2px solid var(--n)}
.mg .galeria{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
.mg .galeria img{width:100%;aspect-ratio:3/2;object-fit:cover;display:block}
.mg .otros{margin:26px 0 0;font-size:16px}
.mg .otros a{margin:0 8px;white-space:nowrap}
@media(max-width:860px){.mg .galeria{grid-template-columns:1fr}}
</style>
`
const CDN = 'https://images.squarespace-cdn.com/content/v1/6865c44b77d39b36bac20b70/'
const WA = 'https://wa.me/5491130116883?text=Hola!%20Quiero%20cotizar%20la%20cobertura%20de%20un%20evento'

const C = [
  {
    slug: 'cobertura-galaxia-2026-quilmes', ancla: 'quilmes-galaxia',
    titulo: 'Cobertura de Galaxia 2026 de Quilmes | Somos Magma',
    desc: 'Cómo cubrimos Galaxia 2026 de Cervecería y Maltería Quilmes con diez personas, foto, video, drone y edición en vivo en un solo día.',
    h1: 'Galaxia 2026 de Quilmes',
    bajada: 'Un día de evento con auditorio lleno, show en vivo y activaciones de marca. Diez personas de Magma cubriendo todo a la vez.',
    ficha: [['Cliente', 'Cervecería y Maltería Quilmes'], ['Fecha', 'Mayo 2026'], ['Equipo', '10 personas'], ['Servicios', 'Foto, video, drone y edición en vivo']],
    evento: ['Galaxia 2026 fue el evento de Cervecería y Maltería Quilmes. Tuvo un auditorio con presentaciones, un escenario con shows en vivo y espacios de marca como Pepsi Music.', 'Todo pasaba al mismo tiempo. Diez personas cubrieron el escenario, el público y los stands, y el video se editó durante el evento.'],
    hecho: ['Dos equipos de video.', 'Fotógrafos en el público, los stands y los shows.', 'Un filmmaker durante toda la jornada.', 'Tomas aéreas con drone.', 'Edición en vivo durante el evento.', 'Dos videos de 60 segundos y las fotos editadas.'],
    fotos: [['01ad9704-bcb6-41a6-80a3-9a3804bd337c/quilmes-galaxia-03.jpg', 'Show en vivo bajo el neón de Pepsi Music en Galaxia 2026'], ['de5c874e-f0e3-4af6-af1b-5c9929373c96/quilmes-galaxia-04.jpg', 'Lata de Pepsi en primer plano durante Galaxia 2026']],
    hero: 'de22d4f9-153e-4663-827d-db92351f0245/quilmes-galaxia-01.jpg',
    servicios: [['/cobertura-eventos-corporativos', 'Eventos corporativos'], ['/edicion-en-vivo', 'Edición en vivo'], ['/drone-fpv', 'Drone y FPV']],
  },
  {
    slug: 'cobertura-sit-2026-personal', ancla: 'personal-sit',
    titulo: 'Personal en el congreso SIT 2026 | Somos Magma',
    desc: 'Cubrimos a Personal en los tres días del congreso SIT 2026, con Ostara 360. Ocho personas con foto, video, motion y edición en vivo en cada jornada.',
    h1: 'Personal en SIT 2026',
    bajada: 'Tres días de congreso con stands, acreditación y charlas. Lo cubrimos para Personal junto a la agencia Ostara 360.',
    ficha: [['Cliente', 'Personal'], ['Agencia', 'Ostara 360'], ['Duración', '3 días'], ['Equipo', '8 personas']],
    evento: ['SIT 2026 fue un congreso de tres días con charlas, stands y acreditación. Personal estuvo con su stand y sus experiencias para los asistentes.', 'Ocho personas cubrieron cada jornada, con edición en vivo y piezas de motion.'],
    hecho: ['Video de las charlas, los stands y el público.', 'Fotografía de toda la jornada, de la acreditación al cierre.', 'Edición en vivo para tener contenido durante el congreso.', 'Piezas de motion y locución.', 'Videos resumen editados y las fotos de cada día.'],
    fotos: [['15579244-bd50-44f1-a464-0c38f31da804/personal-sit-02.jpg', 'Asistente con el robot de Personal en SIT 2026'], ['99a2cd5b-9a60-42ee-bcab-0307f0ab0ea1/personal-sit-03.jpg', 'Asistente festejando en los molinetes de SIT 2026'], ['3e725dab-6448-4da1-8407-753f93533c34/personal-sit-04.jpg', 'Dos asistentes frente al círculo SIT 26'], ['359d2d9a-2329-44b7-80f3-0e1ba3f847ab/personal-sit-01.jpg', 'Stand de Personal lleno de asistentes en el congreso SIT 2026']],
    hero: '359d2d9a-2329-44b7-80f3-0e1ba3f847ab/personal-sit-01.jpg',
    servicios: [['/cobertura-eventos-corporativos', 'Eventos corporativos'], ['/fotografia-de-eventos', 'Fotografía de eventos'], ['/edicion-en-vivo', 'Edición en vivo']],
  },
  {
    slug: 'cobertura-expoagro-2026', ancla: 'expoagro',
    titulo: 'Cobertura de Expoagro 2026: Iveco, Santander y Supra | Somos Magma',
    desc: 'En Expoagro 2026 cubrimos tres marcas en paralelo: Iveco, Santander y Supra. Foto, video, drone y edición en vivo en San Nicolás.',
    h1: 'Expoagro 2026',
    bajada: 'Tres marcas en la misma feria y al mismo tiempo, cada una con su propio equipo.',
    ficha: [['Marcas', 'Iveco, Santander y Supra'], ['Lugar', 'San Nicolás, Buenos Aires'], ['Fecha', 'Marzo 2026'], ['Servicios', 'Foto, video, drone y edición en vivo']],
    evento: ['Expoagro es la feria agroindustrial más grande del país. Cada marca tiene su stand, sus activaciones y su propia agenda de visitas.', 'Trabajamos para tres marcas distintas en los mismos días. Cada una tuvo su equipo, sus entregas y su forma de mostrarse.'],
    hecho: ['Iveco: tomas aéreas con drone del stand y los camiones.', 'Santander: foto, video y edición en vivo de la activación, y piezas cortas extra para redes.', 'Supra: foto, video y un resumen de 60 segundos con el detalle de producto.'],
    fotos: [['a6793516-f09b-4460-8224-eab2902bb471/expoagro-02.jpg', 'Promotora de Santander con paraguas rojo atendiendo a un visitante en Expoagro'], ['538c8068-2930-47b0-9400-b65ed35cbcf1/expoagro-03.jpg', 'Bolsa de Supra Semillas entre el maíz en Expoagro 2026'], ['f3061535-8fb1-4dba-ace9-095bcd8468d3/expoagro-04.jpg', 'Camión Iveco rojo en la activación de Expoagro 2026'], ['6dd91851-df77-45d3-a3fc-48d9a518d4df/expoagro-01.jpg', 'Vista aérea con drone del stand de Iveco en Expoagro 2026']],
    hero: '6dd91851-df77-45d3-a3fc-48d9a518d4df/expoagro-01.jpg',
    servicios: [['/drone-fpv', 'Drone y FPV'], ['/activaciones-de-marca', 'Activaciones de marca'], ['/video-corporativo', 'Video corporativo']],
  },
  {
    slug: 'activacion-cerave', ancla: 'cerave',
    titulo: 'Cobertura de la activación de CeraVe | Somos Magma',
    desc: 'Activación de CeraVe con Pop Up. Ceremonia, photobooth y producto en mano, con foto, video y reels editados el mismo día.',
    h1: 'Activación de CeraVe',
    bajada: 'Una activación con ceremonia, photobooth y producto en mano. Lo cubrimos para CeraVe junto a la agencia Pop Up.',
    ficha: [['Cliente', 'CeraVe'], ['Agencia', 'Pop Up'], ['Fecha', 'Septiembre 2026'], ['Servicios', 'Foto, video y reels en el día']],
    evento: ['La activación tuvo una ceremonia frente al arco amarillo de la marca, un photobooth y producto para los invitados.', 'El contenido para redes salió el mismo día. Editamos en el lugar mientras la activación seguía.'],
    hecho: ['Tres camarógrafos en la ceremonia y la activación.', 'Fotografía de los invitados, el photobooth y el producto.', 'Edición en vivo durante la jornada.', 'Tres reels cortos editados el mismo día.', 'Un video resumen y, después, cinco piezas más de 60 segundos.'],
    fotos: [['943ab9b0-c2c2-4697-a8b6-d165021f7406/cerave-02.jpg', 'Pareja mostrando la tira del photobooth de CeraVe'], ['39e1b614-2d30-46bb-be0d-afa8d19c5b10/cerave-03.jpg', 'Asistente con el protector solar de CeraVe'], ['0ec5a262-1447-4f38-9efb-50635259c4d3/cerave-04.jpg', 'Manos con un producto de CeraVe en la bolsa de la activación'], ['5b5136a3-eafb-4d09-b286-c6e6e535c718/cerave-01.jpg', 'Ceremonia de la activación de CeraVe frente al arco amarillo de la marca']],
    hero: '5b5136a3-eafb-4d09-b286-c6e6e535c718/cerave-01.jpg',
    servicios: [['/activaciones-de-marca', 'Activaciones de marca'], ['/edicion-en-vivo', 'Edición en vivo'], ['/fotografia-de-eventos', 'Fotografía de eventos']],
  },
  {
    slug: 'cobertura-banco-provincia-microcreditos', ancla: 'banco-provincia',
    titulo: 'Cobertura del encuentro Provincia Microcréditos | Somos Magma',
    desc: 'Encuentro de Provincia Microcréditos de Banco Provincia con Pop Up. Plenario y entrega de reconocimientos con foto, video y edición en vivo.',
    h1: 'Provincia Microcréditos',
    bajada: 'Un encuentro con plenario y entrega de reconocimientos. Lo cubrimos para Banco Provincia junto a la agencia Pop Up.',
    ficha: [['Cliente', 'Banco Provincia'], ['Agencia', 'Pop Up'], ['Fecha', 'Octubre 2026'], ['Equipo', '2 camarógrafos y foto']],
    evento: ['El encuentro de Provincia Microcréditos tuvo un plenario con oradores y una entrega de reconocimientos en el escenario.', 'Registramos las charlas y editamos durante la jornada para tener piezas listas antes del cierre.'],
    hecho: ['Dos camarógrafos para el plenario y el público.', 'Fotografía de los oradores, los premiados y los asistentes.', 'Edición en vivo durante la jornada.', 'Un video resumen de más de 60 segundos y las fotos editadas.'],
    fotos: [['4d07aaae-f49a-4f19-9bd2-8a5ca069685f/banco-provincia-02.jpg', 'Entrega de reconocimientos en el escenario de Provincia Microcréditos'], ['293c52aa-b90b-4fc1-a59e-907a6a60b818/banco-provincia-03.jpg', 'Asistente sonriendo con el regalo del encuentro'], ['815071ec-0bab-45ce-8f92-b3d2d2259ecf/banco-provincia-04.jpg', 'Cuaderno del encuentro de Provincia Microcréditos'], ['103fc0b4-b198-4cc6-b1ad-22a2a97450c4/banco-provincia-01.jpg', 'Plenario del encuentro de Provincia Microcréditos']],
    hero: '103fc0b4-b198-4cc6-b1ad-22a2a97450c4/banco-provincia-01.jpg',
    servicios: [['/cobertura-eventos-corporativos', 'Eventos corporativos'], ['/video-corporativo', 'Video corporativo'], ['/edicion-en-vivo', 'Edición en vivo']],
  },
]

const pagina = c => `${css}<div class="mg">
<section class="hero" style="background-image:url('${CDN}${c.hero}?format=2500w')"><div class="w">
<span class="num" style="color:#fff!important">Caso · <a href="/trabajos" style="color:#fff">Trabajos</a></span>
<h1>${c.h1}</h1>
<p>${c.bajada}</p>
<a class="btn" href="${WA}" target="_blank" rel="noopener">Cotizá tu evento</a>
</div></section>

<section class="stats ficha"><div class="w">
${c.ficha.map(([k, v]) => `<div><b>${k}</b><span>${v}</span></div>`).join('\n')}
</div></section>

<section class="s texto"><div class="w">
<span class="num">01 · El evento</span>
<h2>Qué había que cubrir</h2>
${c.evento.map(p => `<p>${p}</p>`).join('\n')}
</div></section>

<section class="s gr"><div class="w">
<span class="num">02 · El trabajo</span>
<h2>Qué hicimos</h2>
<ul class="hecho">
${c.hecho.map(h => `<li>${h}</li>`).join('\n')}
</ul>
</div></section>

<section class="s"><div class="w">
<span class="num">03 · Fotos</span>
<h2>Cómo se vio</h2>
<div class="galeria">
${c.fotos.map(([f, a]) => `<img src="${CDN}${f}?format=1000w" alt="${a}" loading="lazy">`).join('\n')}
</div>
</div></section>

<section class="s cierre"><div class="w">
<h2>¿Tenés un evento parecido?</h2>
<p>Contanos la fecha, el lugar y qué necesitás cubrir.</p>
<a class="btn" href="${WA}" target="_blank" rel="noopener">Cotizá por WhatsApp</a>
<p class="otros">Servicios de este caso: ${c.servicios.map(([u, t]) => `<a href="${u}">${t}</a>`).join(' · ')}</p>
<p class="otros">Otros casos: ${C.filter(o => o !== c).map(o => `<a href="/${o.slug}">${o.h1}</a>`).join(' · ')}</p>
</div></section>
</div>`

for (const c of C) {
  const s = pagina(c).replace(/[^\x00-\x7f]/g, ch => `&#${ch.codePointAt(0)};`)
  writeFileSync(dir + `caso-${c.slug}.html`, s)
  console.log(`caso-${c.slug}.html  título ${c.titulo.length}  desc ${c.desc.length}`)
}
writeFileSync(dir + '_casos-meta.json', JSON.stringify(C.map(({ slug, ancla, titulo, desc, h1 }) => ({ slug, ancla, titulo, desc, h1 })), null, 1))
