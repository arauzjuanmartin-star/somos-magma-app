// ============================ POST-PRODUCCIÓN ============================
// Lógica pura del módulo Edición. NO importa googleapis a propósito: la usan
// el front (components/Edicion.js) y el back (pages/api/edicion-*.js) por igual.
//
// El modelo: una fila por ENTREGABLE, no por proyecto. Un evento puede tener
// resumen + reels con editores y plazos distintos, y el quilombo de WhatsApp
// es justamente por entregable ("¿el reel 2 va?", "¿mandaste el resumen?").
// Cada fila se identifica con  <N° presupuesto>-<slot>  (ej "2143-5").

// Qué pedidos de PROYECTOS son post-producción. Los nombres del sheet vienen
// con o sin emoji: "✂️ Edit 60s", "Edit 60s", "🪄 Edit 60s+", "✨ Motion".
export const RE_EDICION = /edit|edic|reel|motion|colorista|post ?produc|montaje|aftermovie/i
export const esPedidoEdicion = ped => RE_EDICION.test(String(ped || ''))

// El tablero incluye TAMBIÉN la entrega de fotos: en Magma "Foto 1" es cobertura
// + selección + retoque + entrega, o sea trabajo de post con su propio plazo.
export const esPedidoPost = ped => esPedidoEdicion(ped) || esPedidoFoto(ped)

// Limpia el emoji de adelante para mostrar cortito
export const limpiarPedido = ped => String(ped || '').replace(/^[^\p{L}\p{N}]+/u, '').trim()

// ---- Qué TIPO de trabajo es cada pedido (para armar las subcarpetas de Drive) ----
// Ojo con "DirFoto": es dirección de fotografía, o sea video, no fotografía fija.
export const esPedidoFoto = ped => {
  const p = String(ped || '')
  if (/dir\.? ?foto|direccion de foto/i.test(p)) return false
  return /foto/i.test(p)
}
export const esPedidoVideo = ped =>
  /video|film|edit|motion|drone|fpv|vivo|go ?pro|sonido|dir\.? ?foto|colorista|locucion/i.test(String(ped || ''))

// Dado los pedidos de un proyecto, qué subcarpetas hacen falta.
// Las fotos SIEMPRE van a la carpeta de entrega del cliente (regla de Juan).
export function subcarpetasDe(pedidos = []) {
  const hayFoto  = pedidos.some(esPedidoFoto)
  const hayVideo = pedidos.some(esPedidoVideo)
  const crudo = [], entregas = []
  if (hayFoto)  { crudo.push('Fotos');  entregas.push('Fotos') }
  if (hayVideo) { crudo.push('Videos'); entregas.push('Videos') }
  // Si el presupuesto no dice nada reconocible, al menos que el material tenga dónde ir.
  if (!crudo.length)    crudo.push('Fotos', 'Videos')
  if (!entregas.length) entregas.push('Fotos')
  return { crudo, entregas }
}

// ---------------------------- ESTADOS ----------------------------
// El orden ES el flujo. El índice se usa para saber si algo avanzó o está trabado.
// Hay DOS aprobaciones y antes se confundían en una: primero el PM decide si
// la versión se le puede mostrar al cliente, después el cliente decide si va.
// Separarlas es lo que permite saber de quién es el problema: si rebota mucho
// adentro, es la edición; si rebota el cliente, es el brief.
export const ESTADOS = [
  'Sin material',        // el evento pasó pero nadie subió el crudo
  'Material listo',      // el crudo está en Drive, el editor puede arrancar
  'Editando',
  'Para revisar',        // subió a Pre-entregas — espera el OK interno
  'Cambios internos',    // lo rebotó Magma, el cliente no se enteró
  'Con el cliente',      // se lo mandamos, esperamos respuesta
  'Cambios del cliente', // rebotó el cliente (estas son las 2 rondas del manual)
  'Entregado',           // aprobado, en Finales y con acceso dado
]
export const ESTADO_IDX = e => { const i = ESTADOS.indexOf(String(e || '').trim()); return i === -1 ? 0 : i }
// 'Aprobado' es del modelo viejo: se sigue reconociendo para no reabrir lo ya cerrado.
export const estaCerrado = e => ['Aprobado', 'Entregado'].includes(String(e || '').trim())
// Cuando alguien rebota, hay que sumar la ronda al contador que corresponde.
export const CONTADOR_DE = { 'Cambios internos': 'Rondas internas', 'Cambios del cliente': 'Rondas cliente' }
// Los que esperan una acción NUESTRA (para la vista del celular).
export const esperaAlPM = e => ['Para revisar'].includes(String(e || '').trim())
export const esperaAlCliente = e => ['Con el cliente'].includes(String(e || '').trim())

export const PRIORIDADES = ['Urgente', 'Normal', 'Baja']

// ==================== QUÉ ES LA PIEZA (capa 1 del brief) ====================
// Se contesta al presupuestar, con un clic por campo. Es lo que hace falta para
// medir: hoy el 44% de la post se llama "Edit 60s" y adentro hay siete trabajos
// distintos. Las etiquetas están en idioma del CLIENTE a propósito — si el que
// contesta tiene que traducir "9:16", contesta mal o no contesta.
//
// Las clases las dictó Juan (5/9/2026). No inventar otras: cambiarlas después
// rompe la comparación con lo ya cargado.
export const CLASES_VIDEO = [
  { id: 'Charla',      label: 'Charla o corporativo',           ayuda: 'Cobertura formal de una charla' },
  { id: 'Agencia',     label: 'Cobertura para la agencia',      ayuda: 'Mostrar qué hizo la agencia: en qué puso la plata' },
  { id: 'Activacion',  label: 'Activación de marca',            ayuda: 'Gente con el producto, stand, promotoras, regalos' },
  { id: 'Testimonio',  label: 'Entrevista o testimonio',        ayuda: 'Alguien a cámara + inserts, casi siempre para redes' },
  { id: 'Imagenes',    label: 'Solo imágenes',                  ayuda: 'Corto de redes, ~15 s, sin nadie hablando' },
  { id: 'Inserto',     label: 'Inserto en video de un tercero', ayuda: 'Va metido en un video que graba otro equipo' },
  { id: 'Motion',      label: 'Motion',                         ayuda: 'Gráfica animada' },
]

export const CAMPOS_PIEZA = [
  { campo: 'Clase',        label: 'Qué clase de video es', corto: 'Clase',    opciones: CLASES_VIDEO.map(c => c.label) },
  { campo: 'Duración',     label: 'Duración',              corto: 'Duración', opciones: ['15-30 s', '45 s', '60 s', 'Más de 60 s'] },
  { campo: 'Formato',      label: 'Formato',               corto: 'Formato',  opciones: ['Vertical (redes sociales)', 'Horizontal (YouTube / TV)', 'Los dos'] },
  // La red no es curiosidad: define los MÁRGENES SEGUROS. Cada app tapa una
  // zona distinta de la pantalla con sus botones.
  { campo: 'Red',          label: 'Si es vertical, ¿dónde se publica?', corto: 'Se publica en', opciones: ['Instagram', 'TikTok', 'YouTube Shorts', 'LinkedIn', 'Varias'], soloSi: f => /vertical|los dos/i.test(String(f?.Formato || '')) },
  { campo: 'Adaptaciones', label: 'Adaptaciones incluidas', corto: 'Adaptaciones', opciones: ['0', '1', '2', '3 o más'] },
  { campo: 'Gráfica',      label: '¿Lleva gráfica del cliente?', corto: 'Gráfica del cliente', opciones: ['Sí', 'No', 'A definir'] },
  // Editar material ajeno es otro trabajo: no sabés qué hay hasta que lo abrís.
  { campo: 'Material de',  label: '¿De quién es el material?', corto: 'Material', opciones: ['Lo filmamos nosotros', 'Lo pone el cliente', 'Mixto'] },
]

// ---------------------------- FECHAS ----------------------------
export const parseFechaAR = s => {
  if (!s) return null
  const str = String(s).trim()
  // ISO (lo que escribimos nosotros)
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])
  const p = str.split('/')
  if (p.length < 3) return null
  const d = parseInt(p[0]), mes = parseInt(p[1])
  let y = parseInt(p[2]); if (y < 100) y += 2000
  if (!d || !mes || !y) return null
  return new Date(y, mes - 1, d)
}
export const aISO = d => d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : ''
export const aAR = d => d ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : ''
export const hoyCero = () => { const d = new Date(); d.setHours(0,0,0,0); return d }
export const diasEntre = (a, b) => Math.round((b - a) / 86400000)

// Suma días HÁBILES (sin sábado ni domingo). Los plazos del manual de edición
// están en días hábiles: reels 48hs, resumen 4 días.
export const sumarHabiles = (fecha, n) => {
  const d = new Date(fecha); let quedan = n
  while (quedan > 0) { d.setDate(d.getDate() + 1); const dw = d.getDay(); if (dw !== 0 && dw !== 6) quedan-- }
  return d
}

// Plazo comprometido por defecto según el manual de edición:
//   reels / verticales / 15-30s / motion → 2 días hábiles
//   resumen (Edit 60s, 60s+)            → 4 días hábiles
// Se cuenta desde la fecha del evento (que es cuando existe el material).
// Plazos por tipo (días hábiles desde el evento):
//   reels / verticales / 15-30s / motion → 2   (manual: 48hs hábiles)
//   fotos                                → 3   (selección + retoque + entrega)
//   resumen 60s / 60s+                   → 4   (manual: 4 días hábiles)
export const slaDias = ped => {
  const p = String(ped || '')
  if (/15-30|reel|vertical|9:16|motion/i.test(p)) return 2
  if (esPedidoFoto(p)) return 3
  return 4
}
export const fechaSugerida = (fechaEvento, pedido) => {
  const f = parseFechaAR(fechaEvento)
  return f ? sumarHabiles(f, slaDias(pedido)) : null
}

// ---------------------------- SEMÁFORO ----------------------------
// Devuelve { nivel, orden, txt } — nivel: 'listo' | 'verde' | 'amarillo' | 'naranja' | 'rojo'
// orden sirve para ordenar la lista: lo más urgente arriba.
export function semaforo(fila, hoy = hoyCero()) {
  const estado = String(fila.Estado || '').trim() || 'Sin material'
  if (estaCerrado(estado)) {
    return { nivel: 'listo', orden: 100, txt: estado === 'Entregado' ? 'Entregado' : 'Aprobado' }
  }

  // Una consulta sin responder frena el trabajo: va arriba de todo, en rojo.
  if (String(fila.Consulta || '').trim()) {
    return { nivel: 'rojo', orden: -5000, txt: 'esperando respuesta' }
  }

  const compromiso = parseFechaAR(fila['Fecha compromiso']) || fechaSugerida(fila['Fecha Evento'], fila.Entregable)
  const evento = parseFechaAR(fila['Fecha Evento'])
  const urgente = String(fila.Prioridad || '').trim() === 'Urgente'

  // Trabado: el evento ya pasó hace rato y el material sigue sin estar.
  const diasDesdeEvento = evento ? diasEntre(evento, hoy) : null
  const sinMaterial = estado === 'Sin material'
  if (sinMaterial && diasDesdeEvento !== null && diasDesdeEvento >= 3) {
    return { nivel: 'rojo', orden: -1000 + -diasDesdeEvento, txt: `sin material hace ${diasDesdeEvento} días` }
  }

  if (!compromiso) {
    return { nivel: urgente ? 'naranja' : 'verde', orden: urgente ? -50 : 50, txt: 'sin fecha' }
  }

  const faltan = diasEntre(hoy, compromiso)
  let nivel
  if (faltan < 0) nivel = 'rojo'
  else if (faltan === 0) nivel = 'naranja'
  else if (faltan <= 2) nivel = 'amarillo'
  else nivel = 'verde'
  // Urgente sube un escalón (verde→amarillo, amarillo→naranja, naranja→rojo)
  if (urgente) {
    const esc = ['verde', 'amarillo', 'naranja', 'rojo']
    const i = esc.indexOf(nivel); if (i > -1 && i < 3) nivel = esc[i + 1]
  }
  const txt = faltan < 0 ? `${-faltan} ${-faltan === 1 ? 'día' : 'días'} atrasado`
            : faltan === 0 ? 'vence hoy'
            : faltan === 1 ? 'vence mañana'
            : `en ${faltan} días`
  return { nivel, orden: faltan - (urgente ? 3 : 0), txt }
}

export const COLOR_SEM = {
  rojo:     { fg: '#C8102E', bg: '#FBE9EC', label: 'Atrasado' },
  naranja:  { fg: '#B4530A', bg: '#FCEDE0', label: 'Hoy' },
  amarillo: { fg: '#8A6B00', bg: '#FAF3DC', label: 'Esta semana' },
  verde:    { fg: '#1E8A5A', bg: '#E7F3EC', label: 'En fecha' },
  listo:    { fg: '#8C8880', bg: '#F2F0EC', label: 'Cerrado' },
}

// ---------------------------- SOLAPA ----------------------------
// Headers de la solapa EDICION, en orden. Si agregás uno, va AL FINAL.
export const HEADERS_EDICION = [
  // --- Identidad y espejo de PROYECTOS: el sync los refresca, no se tocan a mano ---
  'ID',                 // <nro>-<slot>  ·  <nro>-M<n> si la cargó una persona
  'N° presupuesto',
  'Fecha Evento',
  'Agencia',
  'Cliente',
  'Proyecto',
  'Entregable',         // el nombre del pedido, ej "✂️ Edit 60s", o el de la tarea
  'Editor',

  // --- QUÉ ES LA PIEZA (capa 1 del brief, se contesta al presupuestar) ---
  'Clase',
  'Duración',
  'Formato',
  'Red',
  'Adaptaciones',
  'Gráfica',            // ¿lleva gráfica del cliente? Sí / No / A definir
  'Material de',        // lo filmamos nosotros / lo pone el cliente / mixto

  // --- Cómo viene el trabajo ---
  'Estado',
  'Prioridad',
  'Fecha compromiso',   // lo que le prometimos al cliente (DD/MM/AAAA)
  'Fecha entrega',      // cuándo se entregó de verdad
  'Rondas internas',    // cuántas veces lo rebotó Magma
  'Rondas cliente',     // cuántas veces lo rebotó el cliente (el manual incluye 2)

  // --- Dónde está el material ---
  'Link crudo',
  'Link pre-entrega',
  'Link entrega',

  // --- QUÉ NECESITA EL EDITOR (capa 2, se completa al aprobar) ---
  'Logo y placas',
  'Música',
  'Aparecen',           // gente que SÍ y gente que NO tiene que aparecer
  'Subtítulos',
  'Testimonios',
  'A tener en cuenta',
  'Aprueba cliente',    // quién da el OK del otro lado
  'PM',                 // el responsable de cerrar el brief
  'Brief pedido',       // fecha en que se le mandó el pedido al cliente

  // --- Bitácora ---
  'Notas',
  'Consulta',           // pregunta abierta del editor — vacío = nada trabado
  'Actualizado',
  'Por',
  'Origen',             // 'sync' (sale de PROYECTOS) | 'manual' (tarea cargada a mano)
]
export const IDX_EDICION = Object.fromEntries(HEADERS_EDICION.map((h, i) => [h, i]))

// ==================== QUÉ NECESITA EL EDITOR (capa 2) ====================
// Se completa al APROBAR, no antes: pedirle el logo a alguien que todavía no
// compró el trabajo es pedirle un favor. Lo que falta se pide con un botón, y
// queda la fecha en "Brief pedido" — así "el cliente nunca contestó" es un dato.
export const CAMPOS_BRIEF = [
  { campo: 'Logo y placas',     pregunta: 'Logo y elementos gráficos',                      ph: 'Link a la carpeta, o “ya lo tenemos”', tipo: 'corto', soloSi: f => !/^no$/i.test(String(f?.['Gráfica'] || '').trim()) },
  { campo: 'Aparecen',          pregunta: 'Gente que sí y gente que no tiene que aparecer',  ph: 'Sí: … / No: …', tipo: 'largo' },
  { campo: 'Música',            pregunta: 'Música sugerida',                                 ph: 'Referencia o link', tipo: 'corto' },
  { campo: 'Subtítulos',        pregunta: 'Lleva subtítulos',                              ph: '', tipo: 'opciones', opciones: ['', 'Sí, sobre el video', 'No', 'A definir'] },
  { campo: 'Testimonios',       pregunta: 'Ponemos testimonios',                           ph: '', tipo: 'opciones', opciones: ['', 'Sí', 'No', 'A definir'] },
  { campo: 'A tener en cuenta', pregunta: 'Cosas a tener en cuenta',                         ph: 'Lo que no entra arriba', tipo: 'largo' },
  { campo: 'Aprueba cliente',   pregunta: 'Quién aprueba del lado del cliente',              ph: 'Nombre y mail', tipo: 'corto' },
]

// Los de la capa 2 que le tocan al PM y no se le preguntan al cliente.
const INTERNOS = ['Aprueba cliente']
export const camposParaElCliente = f => CAMPOS_BRIEF.filter(c => !INTERNOS.includes(c.campo) && (!c.soloSi || c.soloSi(f)))

export const briefLleno = f => CAMPOS_BRIEF.filter(c => (!c.soloSi || c.soloSi(f)) && String(f?.[c.campo] || '').trim()).length
export const briefTotal = f => CAMPOS_BRIEF.filter(c => !c.soloSi || c.soloSi(f)).length
export const briefCompleto = f => briefLleno(f) === briefTotal(f)
export const piezaLlena = f => CAMPOS_PIEZA.filter(c => (!c.soloSi || c.soloSi(f)) && String(f?.[c.campo] || '').trim()).length
export const piezaTotal = f => CAMPOS_PIEZA.filter(c => !c.soloSi || c.soloSi(f)).length

// ---- Los mensajes que ya se usan, escritos una vez ----
// Juan: "el PM a veces ya las tiene y se las manda por WhatsApp". Que no tenga
// que redactar de cero cada vez es la diferencia entre que se pida y que no.
const cabecera = f => [f?.Cliente || f?.Agencia, f?.Proyecto].map(x => String(x || '').trim()).filter(Boolean).join(' · ')

// Pedirle al cliente lo que falta. Solo lista lo que está vacío.
export function textoPedirBrief(f, { porWhatsapp = false } = {}) {
  const faltan = camposParaElCliente(f).filter(c => !String(f?.[c.campo] || '').trim())
  const saludo = porWhatsapp ? 'Hola! ' : `Hola,\n\n`
  const intro = `antes de arrancar con la edición de ${cabecera(f)} necesitamos que nos confirmes esto. Son cortas y son clave: cuanto más claras estén desde el arranque, más rápido te entregamos y menos vueltas damos. La mayoría de los cambios que hacemos no son de gusto, son de información que faltaba.`
  const lista = faltan.map(c => `${c.pregunta}:`).join('\n')
  const fecha = String(f?.['Fecha compromiso'] || '').trim()
  const cierre = fecha ? `\n\nLa fecha de entrega que tenemos anotada es el ${fecha}.` : ''
  return `${saludo}${intro}\n\n${lista}${cierre}\n\nGracias!`
}

// Pasarle el trabajo al editor con todo lo que necesita saber.
export function textoParaElEditor(f) {
  const L = []
  L.push(`🎬 #${f?.['N° presupuesto'] || ''} · ${cabecera(f)}`)
  L.push(`${limpiarPedido(f?.Entregable)}${f?.Clase ? ` · ${f.Clase}` : ''}`)
  const ficha = CAMPOS_PIEZA.filter(c => c.campo !== 'Clase' && String(f?.[c.campo] || '').trim())
    .map(c => `${c.corto || c.label}: ${f[c.campo]}`)
  if (ficha.length) L.push('', ...ficha)
  const brief = CAMPOS_BRIEF.filter(c => String(f?.[c.campo] || '').trim()).map(c => `${c.pregunta}: ${f[c.campo]}`)
  if (brief.length) L.push('', ...brief)
  if (f?.['Fecha Evento']) L.push('', `Filmado: ${f['Fecha Evento']}`)
  const compromiso = String(f?.['Fecha compromiso'] || '').trim()
  if (compromiso) L.push(`Entrega: ${compromiso}`)
  L.push(f?.['Link crudo'] ? `Crudo: ${f['Link crudo']}` : 'Crudo: (falta subirlo)')
  L.push(`Subí la versión a la carpeta de Pre-entregas y avisá en el tablero.`)
  const notas = String(f?.Notas || '').trim()
  if (notas) L.push('', 'Notas:', notas)
  return L.join('\n')
}
