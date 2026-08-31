import { getSheets, withSheetsRetry } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

/**
 * Elimina un presupuesto cargado por error.
 *
 * Se BLOQUEA si el presupuesto ya tiene proyecto o factura: en ese caso no es una
 * carga equivocada, es trabajo real, y borrarlo dejaría huérfanas esas filas.
 *
 * Antes de borrar guarda la fila completa en LOG, así se puede recuperar.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  // `fila` es la fila real del sheet (__row). Es obligatoria porque hay N° de presupuesto
  // repetidos: buscar solo por número borraría la primera coincidencia, que puede ser otra.
  const { num, fila: filaPedida } = req.body
  if (num === undefined || num === null || String(num).trim() === '') {
    return res.status(400).json({ error: 'Falta el número de presupuesto' })
  }
  const nro = String(num).trim()

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const meta = await withSheetsRetry(() => sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties)' }))
    const preSheet = meta.data.sheets.find(s => s.properties.title === 'PRESUPUESTOS')
    if (!preSheet) return res.status(500).json({ error: 'No existe la solapa PRESUPUESTOS' })

    // 1. Chequear que no tenga proyecto ni factura antes de tocar nada
    const [rProy, rFac] = await Promise.all([
      withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:C' })),
      withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A:B' })),
    ])
    const tieneProyecto = (rProy.data.values || []).slice(1).some(r => String(r[2] || '').trim() === nro)
    const tieneFactura  = (rFac.data.values || []).slice(1).some(r => String(r[1] || '').trim() === nro)
    if (tieneProyecto || tieneFactura) {
      const qué = [tieneProyecto && 'un proyecto', tieneFactura && 'una factura'].filter(Boolean).join(' y ')
      return res.status(409).json({
        error: `El presupuesto #${nro} ya tiene ${qué}. No se puede eliminar: primero hay que dar de baja eso.`,
        tieneProyecto, tieneFactura,
      })
    }

    // 2. Ubicar la fila. Si vino `fila`, se usa esa — pero solo después de confirmar que
    // ahí sigue estando el presupuesto esperado (alguien pudo mover filas desde que cargó
    // la pantalla). Si no coincide, se aborta en vez de borrar a ciegas.
    const rPre = await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A:DI' }))
    const rows = rPre.data.values || []
    const headers = rows[0] || []

    let fila = -1
    const n = parseInt(filaPedida, 10)
    if (Number.isInteger(n) && n >= 2) {
      const enEsaFila = String((rows[n - 1] || [])[0] || '').trim()
      if (enEsaFila !== nro) {
        return res.status(409).json({
          error: `Los datos cambiaron desde que abriste la pantalla (en la fila ${n} ahora hay ${enEsaFila ? '#'+enEsaFila : 'otra cosa'}). Recargá y probá de nuevo.`,
          recargar: true,
        })
      }
      fila = n
    } else {
      // Sin fila explícita solo se permite si el número es único: si está repetido no
      // hay forma de saber cuál quiso borrar.
      const coincidencias = []
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0] || '').trim() === nro) coincidencias.push(i + 1)
      }
      if (coincidencias.length === 0) return res.status(404).json({ error: `No se encontró el presupuesto #${nro}` })
      if (coincidencias.length > 1) {
        return res.status(409).json({ error: `Hay ${coincidencias.length} presupuestos con el número #${nro}. Recargá la pantalla para poder eliminar el correcto.`, recargar: true })
      }
      fila = coincidencias[0]
    }

    // 3. Snapshot de la fila en LOG (para poder recuperarla si fue un error)
    const filaData = rows[fila - 1] || []
    const snapshot = {}
    headers.forEach((h, i) => { const v = filaData[i]; if (h && v !== undefined && String(v).trim() !== '') snapshot[h] = v })
    const resumen = `${snapshot['Agencia'] || ''}/${snapshot['Cliente'] || ''} — ${snapshot['Proyecto'] || 'sin nombre'} · ${snapshot['Precio Final'] || ''} · ${snapshot['Estado'] || ''}`

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'RAW',
        requestBody: { values: [[
          new Date().toISOString(), mail, 'presupuesto-eliminar', 'PRESUPUESTOS', nro,
          `fila ${fila} eliminada · ${resumen} · BACKUP=${JSON.stringify(snapshot)}`,
        ]] },
      })
    } catch (e) {
      // Si no se pudo dejar el respaldo, no borramos: preferimos fallar antes que perder el dato.
      console.error('No se pudo escribir el backup en LOG:', e)
      return res.status(500).json({ error: 'No se pudo guardar el respaldo en LOG. No se eliminó nada.' })
    }

    // 4. Borrar la fila
    await withSheetsRetry(() => sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{
        deleteDimension: { range: { sheetId: preSheet.properties.sheetId, dimension: 'ROWS', startIndex: fila - 1, endIndex: fila } },
      }] },
    }))

    // 5. Sacar el evento del Calendar Somos Magma (best-effort, no bloquea).
    //    Antes esto lo hacía SOLO el front. Si el navegador se cerraba o el fetch fallaba,
    //    el evento quedaba huérfano en el calendario para siempre (5 fantasmas al 31/08/2026).
    //    Ahora también lo hace el backend: el front puede repetirlo sin problema (es idempotente).
    try {
      const cookie = req.headers.cookie || ''
      const host = req.headers.host
      const proto = host?.includes('localhost') ? 'http' : 'https'
      await fetch(`${proto}://${host}/api/calendar-evento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({ num: nro, accion: 'borrar' }),
      })
    } catch (e) { console.warn('No se pudo borrar el evento del Calendar (no bloquea):', e.message) }

    res.json({ ok: true, nro, fila, resumen })
  } catch (e) {
    console.error(e)
    const status = e.code || e.response?.status
    if (status === 429) return res.status(429).json({ error: 'Google está limitando. Esperá 30s.' })
    res.status(500).json({ error: e.message })
  }
}
