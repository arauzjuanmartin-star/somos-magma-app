// Arma las 5 páginas de servicio (semana 3) con el CSS de pagina-cobertura.html.
// Uso: node docs/web/_generar-servicios.mjs  → escribe docs/web/pagina-<slug>.html
import { readFileSync, writeFileSync } from 'fs'
const dir = new URL('.', import.meta.url).pathname
const base = readFileSync(dir + 'pagina-cobertura.html', 'utf8')
const css = base.slice(0, base.indexOf('<div class="mg">')) + `<style>
.mg .stats .w{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.mg .otros{margin:26px 0 0;font-size:16px}
.mg .otros a{margin:0 8px;white-space:nowrap}
</style>
`
const CDN = 'https://images.squarespace-cdn.com/content/v1/6865c44b77d39b36bac20b70/'
const F = {
  'galaxia-01': 'de22d4f9-153e-4663-827d-db92351f0245/quilmes-galaxia-01.jpg',
  'galaxia-03': '01ad9704-bcb6-41a6-80a3-9a3804bd337c/quilmes-galaxia-03.jpg',
  'galaxia-04': 'de5c874e-f0e3-4af6-af1b-5c9929373c96/quilmes-galaxia-04.jpg',
  'sit-01': '359d2d9a-2329-44b7-80f3-0e1ba3f847ab/personal-sit-01.jpg',
  'sit-02': '15579244-bd50-44f1-a464-0c38f31da804/personal-sit-02.jpg',
  'sit-03': '99a2cd5b-9a60-42ee-bcab-0307f0ab0ea1/personal-sit-03.jpg',
  'sit-04': '3e725dab-6448-4da1-8407-753f93533c34/personal-sit-04.jpg',
  'expoagro-01': '6dd91851-df77-45d3-a3fc-48d9a518d4df/expoagro-01.jpg',
  'expoagro-02': 'a6793516-f09b-4460-8224-eab2902bb471/expoagro-02.jpg',
  'expoagro-04': 'f3061535-8fb1-4dba-ace9-095bcd8468d3/expoagro-04.jpg',
  'cerave-01': '5b5136a3-eafb-4d09-b286-c6e6e535c718/cerave-01.jpg',
  'cerave-02': '943ab9b0-c2c2-4697-a8b6-d165021f7406/cerave-02.jpg',
  'cerave-03': '39e1b614-2d30-46bb-be0d-afa8d19c5b10/cerave-03.jpg',
  'bapro-01': '103fc0b4-b198-4cc6-b1ad-22a2a97450c4/banco-provincia-01.jpg',
  'bapro-02': '4d07aaae-f49a-4f19-9bd2-8a5ca069685f/banco-provincia-02.jpg',
  'bapro-03': '293c52aa-b90b-4fc1-a59e-907a6a60b818/banco-provincia-03.jpg',
}
const img = (k, w) => `${CDN}${F[k]}?format=${w}w`

const SERVICIOS = [
  ['/cobertura-eventos-corporativos', 'Eventos corporativos'],
  ['/fotografia-de-eventos', 'Fotografía'],
  ['/video-corporativo', 'Video corporativo'],
  ['/drone-fpv', 'Drone y FPV'],
  ['/edicion-en-vivo', 'Edición en vivo'],
  ['/activaciones-de-marca', 'Activaciones'],
  ['/trabajos', 'Trabajos'],
]
const wa = t => `https://wa.me/5491130116883?text=${encodeURIComponent('Hola Magma, ' + t)}`

function pagina(p) {
  const otros = SERVICIOS.filter(([u]) => u !== '/' + p.slug).map(([u, t]) => `<a href="${u}">${t}</a>`).join(' &middot; ')
  return `${css}<div class="mg">

<header class="hero" style="background-image:url('${img(p.hero, 2500)}')"><div class="w">
<h1>${p.h1}</h1>
<p>${p.bajada}</p>
<a class="btn" href="${wa(p.wa)}" target="_blank" rel="noopener">Cotizá por WhatsApp</a>
<a class="btn o" href="#trabajos">Ver trabajos</a>
</div></header>

<div class="stats"><div class="w">
${p.stats.map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('\n')}
</div></div>

<section class="s"><div class="w">
<span class="num">01 / ${p.queTitulo}</span>
<h2>${p.queH2}</h2>
<div class="cols">
${p.que.map(([h, t]) => `<div class="item"><h3>${h}</h3><p>${t}</p></div>`).join('\n')}
</div>
</div></section>

<section class="s gr" id="trabajos"><div class="w">
<span class="num">02 / Algunos trabajos</span>
<h2>${p.trabajosH2}</h2>
<div class="cards">
${p.cards.map(c => `<article class="card"><a href="/trabajos#${c.ancla}" style="text-decoration:none"><img src="${img(c.foto, 1000)}" alt="${c.alt}" loading="lazy"><div><h3>${c.h3}</h3><p>${c.p}</p></div></a></article>`).join('\n')}
</div>
${p.extra ? `<div class="cols" style="margin-top:40px">\n${p.extra.map(([h, t]) => `<div class="item"><h3>${h}</h3><p>${t}</p></div>`).join('\n')}\n</div>` : ''}
</div></section>

<section class="s faq"><div class="w faq">
<span class="num">03 / Preguntas frecuentes</span>
<h2>Lo que nos preguntan</h2>
${p.faq.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('\n')}
</div></section>

<section class="s cierre"><div class="w">
<h2>${p.cierre}</h2>
<p>Contanos la fecha y te armamos el presupuesto en el día.</p>
<a class="btn" href="${wa(p.wa)}" target="_blank" rel="noopener">Cotizá por WhatsApp</a>
<p class="otros">${otros}</p>
</div></section>

</div>
`
}

const P = [
  {
    slug: 'drone-fpv',
    titulo: 'Filmación con drone y FPV para eventos | Somos Magma',
    desc: 'Tomas aéreas con drone y recorridos FPV en interiores para eventos, lanzamientos, ferias y relevamientos. Buenos Aires y todo el país.',
    hero: 'expoagro-01',
    h1: 'Filmación con drone y FPV para eventos y marcas',
    bajada: 'Tomas aéreas del lugar, recorridos FPV en interiores y relevamientos. Como servicio solo o sumado a la cobertura de tu evento.',
    wa: 'quiero cotizar drone o FPV',
    stats: [['17', 'trabajos de 2026 con drone o FPV'], ['2', 'lanzamientos con FPV en interiores'], ['4', 'provincias y Uruguay']],
    queTitulo: 'Qué filmamos', queH2: 'Desde arriba y desde adentro',
    que: [
      ['Tomas aéreas del evento', 'El predio, el stand y la gente llegando. En Expoagro 2026 filmamos desde el aire el stand de Iveco.'],
      ['FPV en interiores', 'Un recorrido continuo que entra al lugar y pasa entre la gente. Lo usamos en Minecraft Experience y en un lanzamiento de Hard Rock.'],
      ['Estadios y espectáculos', 'Volamos en la cancha de Racing y en el escenario de Galaxia 2026 de Quilmes.'],
      ['Relevamientos', 'Terrenos, obras y parques solares, con el material editado o en crudo.'],
    ],
    trabajosH2: 'Drone en 2026',
    cards: [
      { foto: 'expoagro-01', ancla: 'expoagro', h3: 'Iveco · Expoagro 2026', p: 'Vista aérea del stand y la activación.', alt: 'Vista aérea con drone del stand de Iveco en Expoagro 2026' },
      { foto: 'galaxia-01', ancla: 'quilmes-galaxia', h3: 'Quilmes · Galaxia 2026', p: 'Drone sumado a la cobertura de foto, video y edición en vivo.', alt: 'Auditorio lleno frente al escenario de Galaxia 2026 de Quilmes' },
      { foto: 'expoagro-04', ancla: 'expoagro', h3: 'Expoagro 2026', p: 'Tres marcas cubiertas en paralelo en la misma feria.', alt: 'Camión Iveco rojo en la activación de Expoagro 2026' },
    ],
    extra: [
      ['Microsoft · Minecraft Experience', 'FPV con Stadium.'],
      ['Mercado Libre', 'Drone sobre un cartel de la marca, con edición.'],
      ['Santander · Mozarteum', 'Drone con Ostara 360.'],
      ['Expo San Fernando y Expo Las Heras', 'Tomas aéreas de las dos ferias.'],
    ],
    faq: [
      ['¿Se puede volar dentro de un salón?', 'Sí, con FPV. Es un drone chico que hace recorridos entre la gente y por pasillos.'],
      ['¿Lo puedo sumar a una cobertura de foto y video?', 'Sí, es lo más común. En Galaxia 2026 el drone fue parte de un equipo de diez personas.'],
      ['¿Entregan el material editado?', 'Sí, editado o en crudo, según lo que necesites.'],
      ['¿Vuelan fuera de Buenos Aires?', 'Sí. Volamos en Expoagro, en San Nicolás, y en ferias del interior de la provincia.'],
    ],
    cierre: '¿Querés tomas aéreas de tu evento?',
  },
  {
    slug: 'edicion-en-vivo',
    titulo: 'Edición en vivo de video y fotos para eventos | Somos Magma',
    desc: 'Editamos video y fotos durante el evento para pantallas, redes y prensa. Galaxia de Quilmes, SIT de Personal, CeraVe y más.',
    hero: 'galaxia-03',
    h1: 'Edición en vivo de video y fotos durante el evento',
    bajada: 'Un editor trabaja en el lugar con el material que filma el equipo. El resumen, los reels y las fotos salen antes de que termine el evento.',
    wa: 'quiero cotizar edición en vivo para un evento',
    stats: [['10', 'trabajos de 2026 con edición en vivo'], ['3', 'días seguidos editando en el SIT de Personal'], ['10', 'personas en Galaxia 2026, edición incluida']],
    queTitulo: 'Qué editamos', queH2: 'Para usar en el momento',
    que: [
      ['Resumen para el cierre', 'Un video del día que se proyecta en las pantallas antes de que termine el evento.'],
      ['Reels para redes', 'Piezas verticales cortas para publicar mientras el evento sigue. En CeraVe salieron el mismo día.'],
      ['Fotos editadas', 'Una selección de fotos editadas durante la jornada, para prensa y redes.'],
      ['Eventos de varios días', 'Cada jornada con su entrega. En el SIT 2026 editamos los tres días.'],
    ],
    trabajosH2: 'Edición en vivo en 2026',
    cards: [
      { foto: 'galaxia-03', ancla: 'quilmes-galaxia', h3: 'Quilmes · Galaxia 2026', p: 'El video se editó durante el evento.', alt: 'Show en vivo bajo el neón de Pepsi Music en Galaxia 2026' },
      { foto: 'sit-03', ancla: 'personal-sit', h3: 'Personal · SIT 2026', p: 'Tres días con edición en vivo y motion. Con Ostara 360.', alt: 'Asistente festejando en los molinetes de SIT 2026' },
      { foto: 'cerave-02', ancla: 'cerave', h3: 'CeraVe', p: 'Reels editados el mismo día. Con Pop Up.', alt: 'Pareja mostrando la tira del photobooth de CeraVe' },
    ],
    extra: [
      ['Banco Provincia', 'Plenario y reconocimientos con edición durante la jornada. Con Pop Up.'],
      ['Iveco y Santander · Expoagro', 'Dos marcas con edición en vivo en la misma feria.'],
      ['Iveco · Oil & Gas', 'Edición en vivo y drone. Con ADN.'],
      ['Compartir 2026', 'Prearmado y día del evento. Con Ostara 360.'],
    ],
    faq: [
      ['¿Cuánto tarda el resumen?', 'Depende de la duración del evento. Lo armamos para que esté listo antes del cierre.'],
      ['¿Se pueden editar video y fotos a la vez?', 'Sí. Hay eventos donde editamos los dos en paralelo.'],
      ['¿Entregan también el material completo después?', 'Sí. Lo editado en vivo es una entrega más y el resto llega por Drive.'],
    ],
    cierre: '¿Necesitás el video antes del cierre?',
  },
  {
    slug: 'fotografia-de-eventos',
    titulo: 'Fotografía de eventos corporativos en Buenos Aires | Somos Magma',
    desc: 'Fotógrafos para congresos, convenciones, lanzamientos y activaciones. Fotos editadas por Drive y edición en vivo. Buenos Aires y todo el país.',
    hero: 'sit-01',
    h1: 'Fotografía de eventos corporativos en Buenos Aires',
    bajada: 'Fotógrafos para congresos, convenciones, lanzamientos y activaciones de marca. Fotos editadas del evento completo, de la acreditación al cierre.',
    wa: 'quiero cotizar fotografía para un evento',
    stats: [['+100', 'trabajos de 2026 con fotografía'], ['5', 'coberturas el mismo día, nuestro récord'], ['+30', 'profesionales en el equipo']],
    queTitulo: 'Qué fotografiamos', queH2: 'Todo lo que pasa en el evento',
    que: [
      ['Escenario y charlas', 'Oradores, plenarios, entregas de premios y shows.'],
      ['Público y networking', 'La gente llegando, la acreditación, los stands y los momentos entre charlas.'],
      ['Marca y producto', 'El producto en mano, la ambientación y los detalles de la activación.'],
      ['Retratos', 'Fotos de directivos, oradores e invitados durante el evento.'],
    ],
    trabajosH2: 'Fotografía en 2026',
    cards: [
      { foto: 'bapro-02', ancla: 'banco-provincia', h3: 'Banco Provincia', p: 'Plenario y entrega de reconocimientos. Con Pop Up.', alt: 'Entrega de reconocimientos en el escenario de Provincia Microcréditos' },
      { foto: 'sit-04', ancla: 'personal-sit', h3: 'Personal · SIT 2026', p: 'Tres días de congreso. Con Ostara 360.', alt: 'Dos asistentes frente al círculo SIT 26' },
      { foto: 'cerave-03', ancla: 'cerave', h3: 'CeraVe', p: 'Activación con ceremonia y photobooth. Con Pop Up.', alt: 'Asistente con el protector solar de CeraVe' },
    ],
    faq: [
      ['¿Cuándo entregan las fotos?', 'En el plazo que pida el evento. Si hace falta, editamos una selección durante la jornada.'],
      ['¿Cuántos fotógrafos hacen falta?', 'Depende de la cantidad de gente y de salas. Te lo recomendamos en el presupuesto.'],
      ['¿Pueden sumar video?', 'Sí. La mayoría de nuestras coberturas son de foto y video con el mismo equipo.'],
      ['¿Cubren eventos fuera de Buenos Aires?', 'Sí. Trabajamos en Córdoba, Santa Fe, Mendoza, la Costa Atlántica y Uruguay.'],
    ],
    cierre: '¿Necesitás fotógrafo para tu evento?',
  },
  {
    slug: 'video-corporativo',
    titulo: 'Video corporativo y entrevistas en Buenos Aires | Somos Magma',
    desc: 'Resúmenes de eventos, entrevistas, testimoniales y piezas para redes para empresas, universidades y agencias. Productora audiovisual en Buenos Aires.',
    hero: 'bapro-01',
    h1: 'Video corporativo y entrevistas para empresas',
    bajada: 'Resúmenes de eventos, entrevistas, testimoniales y piezas cortas para redes. Filmamos, editamos y entregamos listo para publicar.',
    wa: 'quiero cotizar un video corporativo',
    stats: [['+200', 'trabajos de 2026 con video'], ['458', 'trabajos en 2025'], ['+30', 'profesionales en el equipo']],
    queTitulo: 'Qué hacemos', queH2: 'Videos para comunicar',
    que: [
      ['Resumen de evento', 'El video del congreso, la convención o el lanzamiento, para mostrar lo que pasó.'],
      ['Entrevistas y testimoniales', 'Directivos, oradores y clientes contando en primera persona.'],
      ['Piezas para redes', 'Cortes verticales y cortos a partir del mismo material.'],
      ['Motion y gráfica', 'Placas, zócalos y animaciones con la marca del cliente.'],
    ],
    trabajosH2: 'Video en 2026',
    cards: [
      { foto: 'sit-02', ancla: 'personal-sit', h3: 'Personal · SIT 2026', p: 'Video y motion de tres días de congreso. Con Ostara 360.', alt: 'Asistente con el robot de Personal en SIT 2026' },
      { foto: 'galaxia-04', ancla: 'quilmes-galaxia', h3: 'Quilmes · Galaxia 2026', p: 'Resumen del evento editado en el día.', alt: 'Lata de Pepsi en primer plano durante Galaxia 2026' },
      { foto: 'bapro-03', ancla: 'banco-provincia', h3: 'Banco Provincia', p: 'Video del encuentro con dos camarógrafos. Con Pop Up.', alt: 'Asistente sonriendo con el regalo del encuentro' },
    ],
    extra: [
      ['Universidad Austral', 'Entrevistas en TN y Radio Mitre, filmadas y editadas.'],
      ['Entrevistas mensuales', 'Una serie de entrevistas por mes para un medio digital.'],
    ],
    faq: [
      ['¿Hacen videos que no sean de eventos?', 'Sí. Entrevistas, testimoniales y piezas institucionales.'],
      ['¿Editan con la gráfica de la marca?', 'Sí. Armamos placas, zócalos y animaciones con el manual de la marca.'],
      ['¿Entregan versiones para redes?', 'Sí, en vertical y en horizontal a partir del mismo material.'],
      ['¿Cuánto cuesta un video?', 'Depende de las horas de rodaje, del equipo y de la edición. Escribinos y te mandamos el tarifario.'],
    ],
    cierre: '¿Tenés un video para hacer?',
  },
  {
    slug: 'activaciones-de-marca',
    titulo: 'Cobertura de activaciones de marca | Somos Magma',
    desc: 'Foto, video y reels en el día para activaciones de marca en shoppings, ferias y la Costa Atlántica. CeraVe, Dove, Pampers, Santander.',
    hero: 'cerave-01',
    h1: 'Cobertura de activaciones de marca',
    bajada: 'Foto, video y reels editados en el día para activaciones en shoppings, ferias y la Costa Atlántica.',
    wa: 'quiero cotizar la cobertura de una activación',
    stats: [['81', 'días de 2026 con dos o más coberturas a la vez'], ['5', 'coberturas el mismo día, nuestro récord'], ['4', 'provincias y Uruguay']],
    queTitulo: 'Dónde cubrimos', queH2: 'Donde esté la marca',
    que: [
      ['Shoppings', 'En Alto Palermo cubrimos la activación de Dove con Ostara 360.'],
      ['Costa Atlántica', 'Activaciones de verano en Pinamar y Mar del Plata, entre ellas Pampers con The Bloom.'],
      ['Ferias', 'En Expoagro 2026 cubrimos la activación de Santander y el stand de Iveco.'],
      ['Eventos de marca', 'Activaciones con ceremonia, photobooth y producto, como la de CeraVe con Pop Up.'],
    ],
    trabajosH2: 'Activaciones en 2026',
    cards: [
      { foto: 'cerave-01', ancla: 'cerave', h3: 'CeraVe', p: 'Tres videos, fotos y reels editados el mismo día. Con Pop Up.', alt: 'Ceremonia de la activación de CeraVe frente al arco amarillo de la marca' },
      { foto: 'expoagro-02', ancla: 'expoagro', h3: 'Santander · Expoagro', p: 'Activación en la feria con su propio equipo.', alt: 'Promotora de Santander con paraguas rojo atendiendo a un visitante en Expoagro' },
      { foto: 'galaxia-04', ancla: 'quilmes-galaxia', h3: 'Quilmes · Galaxia 2026', p: 'Activaciones de marca dentro del evento.', alt: 'Lata de Pepsi en primer plano durante Galaxia 2026' },
    ],
    faq: [
      ['¿Cubren activaciones en la Costa en verano?', 'Sí. En el verano de 2026 cubrimos activaciones en Pinamar y Mar del Plata.'],
      ['¿Pueden entregar reels el mismo día?', 'Sí. Editamos en el lugar y salen durante la activación.'],
      ['¿Cubren varias activaciones el mismo día?', 'Sí. Cada una tiene su propio equipo.'],
      ['¿Trabajan con agencias?', 'Sí, es la mayor parte de lo que hacemos. <a href="/agencias">Así trabajamos con agencias</a>.'],
    ],
    cierre: '¿Tenés una activación en las próximas semanas?',
  },
]

// tildes y ñ como entidades: al pegar en el bloque de código de Squarespace no se rompen
const ent = s => s.replace(/[^\x00-\x7f]/g, c => `&#${c.codePointAt(0)};`)
for (const p of P) {
  writeFileSync(dir + `pagina-${p.slug}.html`, ent(pagina(p)))
  console.log(`/${p.slug}\n  título: ${p.titulo}\n  descripción: ${p.desc}`)
}
