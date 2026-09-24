// ============================ SERVICIOS EN EL PDF ============================
// Cómo se llama cada servicio del presupuesto cuando lo ve el cliente.
//
// En el presu se carga el código corto de la solapa "listado" ("🎬 Film ½",
// "✂️ Edit 60s"); el PDF lo reemplaza por una descripción larga. La descripción
// vive en DOS lugares y manda el sheet:
//   1. la solapa "listado", columna J "Descripción PDF" (al lado del nombre y el
//      precio). Es lo que Juan y Sofi editan; la app la lee en cada carga.
//   2. SVC_LABELS acá abajo: el respaldo para lo que el sheet no tenga (un servicio
//      tipeado a mano que no está en la lista, o la celda vacía).
//
// Este archivo NO importa googleapis a propósito: lo usan el front
// (pages/presupuesto.js), la API y los scripts por igual.
//
// Para sembrar la columna del sheet con estos textos:
//   node scripts/listado-columna-descripcion-pdf.mjs            (preview)
//   node scripts/listado-columna-descripcion-pdf.mjs --escribir

// Juan 2026-06-09: descripciones más detalladas (ej. Viáticos → Hospedaje, transportes y comida)
export const SVC_LABELS = {
  // Textos revisados por Juan y Sofi el 24/09/2026. Lo que no aparece en esa revisión
  // conserva el texto anterior (marcado "sin revisar").
  // Fotografía
  'Foto ½':       '1 fotógrafo · media jornada (hasta 4 hs) · incluye edición de fotos',
  'Foto 1/2':     '1 fotógrafo · media jornada (hasta 4 hs) · incluye edición de fotos',
  'Foto 1':       '1 fotógrafo · jornada completa (hasta 8 hs) · incluye edición de fotos',
  'Foto 2':       '1 fotógrafo · doble jornada (2 jornadas completas) · incluye edición de fotos',
  'Foto 12hs':    '1 fotógrafo · jornada extendida (hasta 12 hs) · incluye edición de fotos',
  // Video / Filmmaker
  'Video ½':      '1 videógrafo · media jornada (hasta 4 hs)',
  'Video 1/2':    '1 videógrafo · media jornada (hasta 4 hs)',
  'Video 1':      '1 videógrafo · jornada completa (hasta 8 hs)',
  'Video 2':      '1 videógrafo · doble jornada (2 jornadas completas)',
  'Film ½':       '1 operador de cámara para foto y video · media jornada (hasta 4 hs)',
  'Film 1/2':     '1 operador de cámara para foto y video · media jornada (hasta 4 hs)',
  'Film 1':       '1 operador de cámara para foto y video · jornada completa (hasta 8 hs)',
  'Film 12hs':    '1 operador de cámara para foto y video · jornada extendida (hasta 12 hs)',
  // Equipos especiales
  'Drone':        'Operador de drone con piloto habilitado',                  // sin revisar
  'FPV':          'Dron FPV · piloto certificado ANAC',
  'Go Pro':       'Cámara GoPro adicional para tomas dinámicas',              // sin revisar
  'Rental':       'Rental de equipos (cámaras, lentes, luces, accesorios)',   // sin revisar
  // Postproducción / Animación
  'Motion':       'Animación motion graphics 2D (placas y gráficos)',
  'Edit 60s':     'Edición de 1 video resumen de hasta 60 segundos (horizontal + vertical 9:16)',
  'Edit 60s+':    'Edición de 1 video resumen de hasta 2 minutos',
  'Edit 15-30s':  'Edición de 1 reel / cápsula de hasta 30 segundos',
  // Directores y roles especializados
  'Sonido':       'Sonido directo (microfonía + grabador)',                   // sin revisar
  'DirFoto':      'Director de Fotografía (DOP)',                             // sin revisar
  // Edición en vivo (NO es streaming: es un editor en el evento)
  'Vivo 1':       'Editor en el evento: cápsulas y fotos editadas en vivo · jornada completa',
  'Vivo ½':       'Editor en el evento: cápsulas y fotos editadas en vivo · media jornada',
  'Vivo 1/2':     'Editor en el evento: cápsulas y fotos editadas en vivo · media jornada',
  // Asistentes y producción
  'Asist 1':      'Asistente de producción (coordinación y apoyo en set) · jornada completa',
  'Asist ½':      'Asistente de producción (coordinación y apoyo en set) · media jornada',
  'Asist 1/2':    'Asistente de producción (coordinación y apoyo en set) · media jornada',
  'Produ':        'Productor en set',                                         // sin revisar
  'Hora Extra':   'Hora extra de cobertura',
  // Misceláneos / talento
  'MakeUp':       'Maquilladora profesional',                                 // sin revisar
  'Model':        'Modelo (talento contratado)',                              // sin revisar
  'Catering':     'Catering en set',                                          // sin revisar
  'Viaticos':     'Viáticos (traslados, comidas y hospedaje si corresponde)',
  'Crudos':       'Entrega de archivos crudos sin editar',                    // sin revisar
  'Fotos':        'Fotografías editadas en alta resolución',                  // sin revisar
  'Diseño Gráfico': 'Diseño gráfico de piezas',
  'Locución':     'Locución profesional',
}

// Limpia emojis y variation selectors. Mantiene letras latinas, números, puntuación común.
// BUG histórico: el regex [ -⁯] eliminaba TODO el texto (rango Unicode U+0020 a U+206F incluye letras).
// Ahora apunto a caracteres invisibles específicos sin tocar texto normal.
export const stripSvc = s => String(s||'')
  .replace(/[\u{1F300}-\u{1FAFF}]/gu,'')   // emojis pictográficos (😀🎥🚚 etc)
  .replace(/[☀-➿]/g,'')          // símbolos misceláneos (☀ ✈ ⚠ etc)
  .replace(/[​-‏‪-‮⁠-⁯﻿]/g,'')  // zero-width + bidi + word joiner
  .replace(/[︀-️]/g,'')          // variation selectors
  .replace(/^[\s!'"`þÞ]+/, '')              // prefijos de basura al inicio
  .trim()

// Llave para comparar nombres: sin emoji, "½" y "1/2" son lo mismo, sin mayúsculas.
export const claveSvc = s => stripSvc(s).replace(/\s+/g,' ').replace(/½/g,'1/2').toLowerCase()

const LABELS_CODIGO = Object.fromEntries(Object.entries(SVC_LABELS).map(([k, v]) => [claveSvc(k), v]))

// Arma el mapa {clave → descripción} desde la solapa "listado" (serviciosFull con `desc`).
// Lo que el sheet tenga pisa al código; lo que no, queda como en SVC_LABELS.
export function labelsDeListado(serviciosFull) {
  const out = {}
  for (const s of serviciosFull || []) {
    const d = String(s?.desc || '').trim()
    if (s?.n && d) out[claveSvc(s.n)] = d
  }
  return out
}

// Nombre del servicio como lo ve el cliente. `extra` = lo que vino del sheet.
export function prettifySvc(s, extra) {
  if (!s) return ''
  const limpio = stripSvc(s)
  const k = claveSvc(limpio)
  return (extra && extra[k]) || LABELS_CODIGO[k] || limpio
}
