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
export const ESTADOS = [
  'Sin material',      // el evento pasó pero nadie subió el crudo
  'Material listo',    // el crudo está en Drive, el editor puede arrancar
  'Editando',
  'V1 enviada',        // el editor mandó la primera versión
  'Cambios pedidos',   // hay correcciones (ronda 1 o 2 del manual)
  'Aprobado',          // interno OK, listo para mandar al cliente
  'Entregado',         // ya lo tiene el cliente
]
export const ESTADO_IDX = e => { const i = ESTADOS.indexOf(String(e || '').trim()); return i === -1 ? 0 : i }
export const estaCerrado = e => ['Aprobado', 'Entregado'].includes(String(e || '').trim())

export const PRIORIDADES = ['Urgente', 'Normal', 'Baja']

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
  'ID',                 // <nro>-<slot>  · llave única
  'N° presupuesto',
  'Fecha Evento',
  'Agencia',
  'Cliente',
  'Proyecto',
  'Entregable',         // el nombre del pedido, ej "✂️ Edit 60s"
  'Editor',             // staff del slot (puede ser "Somos Magma")
  'Estado',
  'Prioridad',
  'Fecha compromiso',   // lo que le prometimos al cliente (DD/MM/AAAA)
  'Fecha entrega',      // cuándo se entregó de verdad
  'Link crudo',
  'Link entrega',
  'Notas',              // el brief: qué pidió el cliente, referencias, música
  'Actualizado',
  'Por',
  'Consulta',           // pregunta abierta del editor — vacío = nada trabado
]
export const IDX_EDICION = Object.fromEntries(HEADERS_EDICION.map((h, i) => [h, i]))
