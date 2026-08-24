/**
 * El N° de factura, sacado del PDF que baja de AFIP.
 *
 * Comprobantes en Línea nombra el archivo así:
 *     CUIT_TIPO_PTOVENTA_NUMERO.pdf
 *     30719228026_001_00001_00000138.pdf   →   0001-00000138
 *
 * Nació el 2026-08-24: de 33 facturas con PDF, 21 tenían el número mal tipeado
 * en el sheet ("0001-0000139", "00002_00000518") y 13 no lo tenían. Uno estaba
 * directamente equivocado: el PDF decía 126 y el sheet 125. Si el número lo
 * pone la máquina leyendo el archivo, no se confunde nadie.
 */

// El "(1)" que agrega Drive/el navegador cuando bajás el mismo archivo dos veces
// no molesta: buscamos el patrón en cualquier parte del nombre.
const RX_AFIP = /(\d{11})_(\d{3})_(\d{5})_(\d{8})/

/** Del nombre del archivo → "0001-00000138", o null si no tiene formato AFIP. */
export function nroDeNombreArchivo(nombre) {
  const m = String(nombre || '').match(RX_AFIP)
  if (!m) return null
  return `${m[3].slice(-4)}-${m[4]}`
}

/** Además del número: CUIT del emisor y tipo de comprobante (001=A, 006=B, 011=C). */
export function datosDeNombreArchivo(nombre) {
  const m = String(nombre || '').match(RX_AFIP)
  if (!m) return null
  const TIPOS = { '001': 'A', '006': 'B', '011': 'C' }
  return { cuit: m[1], tipo: TIPOS[m[2]] || null, puntoVenta: m[3].slice(-4), numero: m[4], nro: `${m[3].slice(-4)}-${m[4]}` }
}

/** Punto de venta y número como enteros, para comparar sin pelearse con los ceros. */
export function partesDeNro(v) {
  const m = String(v || '').match(/(\d+)\D+(\d+)/)
  return m ? { pv: parseInt(m[1]), nro: parseInt(m[2]) } : null
}

/**
 * ¿Son el mismo comprobante? "0001-0000139" y "0001-00000139" sí (mal escrito).
 * "0002-00000088" y "0001-00000088" no: cambia el punto de venta.
 */
export function mismoNumero(a, b) {
  const x = partesDeNro(a), y = partesDeNro(b)
  return !!x && !!y && x.pv === y.pv && x.nro === y.nro
}

/**
 * Qué hacer con el número que ya está cargado, frente al que dice el PDF.
 *   'completar' → estaba vacío
 *   'corregir'  → es el mismo comprobante, mal escrito
 *   'conflicto' → son comprobantes distintos: NO tocar, avisar
 *   'ok'        → ya coincide
 */
export function compararConPdf(cargado, delPdf) {
  const c = String(cargado || '').trim()
  if (!delPdf) return { accion: 'ok' }
  if (!c) return { accion: 'completar', valor: delPdf }
  if (c === delPdf) return { accion: 'ok' }
  if (mismoNumero(c, delPdf)) return { accion: 'corregir', valor: delPdf, antes: c }
  return { accion: 'conflicto', antes: c, delPdf }
}
