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
  // Fotografía
  'Foto ½':       'Media jornada fotógrafo (hasta 4 horas, edición incluida)',
  'Foto 1/2':     'Media jornada fotógrafo (hasta 4 horas, edición incluida)',
  'Foto 1':       'Jornada completa fotógrafo (hasta 8 horas, edición incluida)',
  'Foto 2':       'Doble jornada fotógrafo (2 jornadas completas, edición incluida)',
  'Foto 12hs':    'Jornada extendida fotógrafo (hasta 12 horas, edición incluida)',
  // Video / Filmmaker
  'Video ½':      'Media jornada videógrafo (hasta 4 horas)',
  'Video 1/2':    'Media jornada videógrafo (hasta 4 horas)',
  'Video 1':      'Jornada completa videógrafo (hasta 8 horas)',
  'Video 2':      'Doble jornada videógrafo (2 jornadas completas)',
  'Film ½':       'Media jornada filmmaker (hasta 4 horas)',
  'Film 1/2':     'Media jornada filmmaker (hasta 4 horas)',
  'Film 1':       'Jornada completa filmmaker (hasta 8 horas)',
  'Film 12hs':    'Jornada extendida filmmaker (hasta 12 horas)',
  // Equipos especiales
  'Drone':        'Operador de drone con piloto habilitado',
  'FPV':          'Dron FPV (cinematic FPV con piloto especializado)',
  'Go Pro':       'Cámara GoPro adicional para tomas dinámicas',
  'Rental':       'Rental de equipos (cámaras, lentes, luces, accesorios)',
  // Postproducción / Animación
  'Motion':       'Animación motion graphics 2D',
  'Edit 60s':     'Edición video resumen 60 segundos + adaptación vertical 9:16',
  'Edit 60s+':    'Edición video resumen extendido (más de 60 segundos)',
  'Edit 15-30s':  'Edición video corto (15 a 30 segundos)',
  // Directores y roles especializados
  'Sonido':       'Sonido directo (microfonía + grabador)',
  'DirFoto':      'Director de Fotografía (DOP)',
  // Streaming
  'Vivo 1':       'Streaming en vivo jornada completa (1 cámara + transmisión)',
  'Vivo ½':       'Streaming en vivo media jornada (1 cámara + transmisión)',
  'Vivo 1/2':     'Streaming en vivo media jornada (1 cámara + transmisión)',
  // Asistentes y producción
  'Asist 1':      'Asistente de producción jornada completa',
  'Asist ½':      'Asistente de producción media jornada',
  'Asist 1/2':    'Asistente de producción media jornada',
  'Produ':        'Productor en set',
  // Misceláneos / talento
  'MakeUp':       'Maquilladora profesional',
  'Model':        'Modelo (talento contratado)',
  'Catering':     'Catering en set',
  'Viaticos':     'Viáticos (hospedaje, transportes y comida)',
  'Crudos':       'Entrega de archivos crudos sin editar',
  'Fotos':        'Fotografías editadas en alta resolución',
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
