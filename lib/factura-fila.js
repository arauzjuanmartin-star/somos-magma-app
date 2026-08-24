/**
 * Ubicar la fila exacta de una factura dentro de FACTURACION.
 *
 * Desde 2026-08 un proyecto puede tener VARIAS facturas (se cobra el adelanto del 30%
 * al confirmar y el saldo al entregar). Antes cada endpoint hacía
 *     rows.find(r => r['N° Presupuesto'] === presupuestoNum)
 * y se quedaba con la PRIMERA, así que el PDF del saldo pisaba el link del adelanto
 * y el mail salía con el monto viejo.
 *
 * Ahora la UI manda `fila` (el __row que lib/sheets.js le adjunta a cada registro).
 * Si no viene fila y el proyecto tiene más de una factura viva, esto FALLA en vez de
 * elegir a ciegas — mejor un error visible que escribir en la factura equivocada.
 */

const norm = v => String(v ?? '').trim()
const esAnulada = v => norm(v).toUpperCase().startsWith('ANULADA')

export function ubicarFilaFactura({ rows, fila, presupuestoNum }) {
  const headers = rows?.[0] || []
  const iPresu = headers.indexOf('N° Presupuesto')
  const iNro = headers.indexOf('Nro de Factura')
  if (iPresu === -1) return { error: 'FACTURACION no tiene la columna "N° Presupuesto"' }

  const presu = norm(presupuestoNum)

  // Camino nuevo: la UI mandó la fila exacta.
  const n = parseInt(fila)
  if (n > 1) {
    const row = rows[n - 1]
    if (!row) return { error: `La fila ${n} no existe en FACTURACION. Refrescá la pantalla y probá de nuevo.` }
    // Guarda: si alguien movió/borró filas en el sheet mientras la app tenía la lista
    // cargada, el número de fila apunta a otra factura. No escribimos a ciegas.
    if (presu && norm(row[iPresu]) !== presu) {
      return { error: `La fila ${n} ya no es del presupuesto #${presu} (ahora dice "${norm(row[iPresu]) || 'vacío'}"). El sheet cambió desde que abriste la pantalla: refrescá y probá de nuevo.` }
    }
    return { fila: n, row }
  }

  // Camino viejo (compatibilidad): buscar por N° de presupuesto.
  if (!presu) return { error: 'Falta la fila o el N° de presupuesto' }
  const cand = []
  for (let i = 1; i < rows.length; i++) {
    if (norm(rows[i][iPresu]) === presu && !(iNro >= 0 && esAnulada(rows[i][iNro]))) cand.push(i + 1)
  }
  if (cand.length === 0) return { error: `No encontré ninguna factura del presupuesto #${presu}` }
  if (cand.length > 1) {
    return { error: `El presupuesto #${presu} tiene ${cand.length} facturas (adelanto + saldo). Elegí cuál desde la lista de Facturación en vez de hacerlo por N° de proyecto.`, ambigua: true, filas: cand }
  }
  return { fila: cand[0], row: rows[cand[0] - 1] }
}
