import { getSheets, withSheetsRetry } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { esSocio } from '../../lib/roles'
import { horaArgentina } from '../../lib/diaria-mail.mjs'
import { RANGOS_LUNES, calcularLunes, leerSemanal, acuerdosDe, asegurarSemanal, guardarSemanal, valoresSemanal, semanaDe } from '../../lib/lunes.mjs'

// El lunes de Magma — el reporte de la reunión semanal de los socios, calculado EN VIVO del Master Magma
// (misma lógica que scripts/lunes.mjs y que el mail de los lunes, vía lib/lunes.mjs).
//   GET  → el reporte + los acuerdos guardados (los de hoy y los del lunes pasado)
//   POST { acuerdos } → guarda los acuerdos de la reunión en la solapa SEMANAL (una fila por lunes)
// Solo socios (y Mariana en modo lectura): adentro va la cuenta de socios.

export default async function handler(req, res) {
  const auth = await requireAuth(req, res)
  if (!auth) return
  if (!esSocio(auth.mail) && !auth.readOnly) return res.status(403).json({ error: 'Esta página es de los socios.' })
  try {
    const { sheets, SHEET_ID } = await getSheets()
    const ahora = horaArgentina()

    if (req.method === 'POST') {
      if (!esSocio(auth.mail)) return res.status(403).json({ error: 'Los acuerdos los anotan los socios.' })
      const acuerdos = String(req.body?.acuerdos ?? '').trim().slice(0, 5000)
      const { clave } = semanaDe(ahora)
      await withSheetsRetry(() => asegurarSemanal(sheets, SHEET_ID))
      const filas = await withSheetsRetry(() => leerSemanal(sheets, SHEET_ID))
      // Si la fila del lunes todavía no existe (el mail no salió), se arma con los números de ahora
      let valores
      if (!filas.some(x => String(x[0] || '').trim() === clave)) {
        const r = await withSheetsRetry(() => sheets.spreadsheets.values.batchGet({ spreadsheetId: SHEET_ID, ranges: RANGOS_LUNES, valueRenderOption: 'FORMATTED_VALUE' }))
        valores = valoresSemanal(calcularLunes(r.data.valueRanges.map(v => v.values || []), ahora), ahora)
      }
      await withSheetsRetry(() => guardarSemanal(sheets, SHEET_ID, { clave, valores, acuerdos }))
      try { await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), auth.mail, 'lunes-acuerdos', 'SEMANAL', clave, acuerdos.slice(0, 200)]] } }) } catch (e) { /* el LOG es secundario */ }
      return res.json({ ok: true, clave, acuerdos })
    }

    const r = await withSheetsRetry(() => sheets.spreadsheets.values.batchGet({ spreadsheetId: SHEET_ID, ranges: RANGOS_LUNES, valueRenderOption: 'FORMATTED_VALUE' }))
    const d = calcularLunes(r.data.valueRanges.map(v => v.values || []), ahora)
    let filas = []
    try { filas = await withSheetsRetry(() => leerSemanal(sheets, SHEET_ID)) } catch (e) { /* la solapa SEMANAL la crea el primer guardado o el primer mail */ }
    res.json({ generado: new Date().toISOString(), lunes: d, acuerdos: { actual: acuerdosDe(filas, d.semana.clave), anterior: acuerdosDe(filas, d.semana.claveAnterior) }, puedeEscribir: esSocio(auth.mail) })
  } catch (e) {
    console.error(e)
    const status = e.code || e.response?.status
    if (status === 429) return res.status(429).json({ error: 'Google está limitando. Esperá 30s.' })
    res.status(500).json({ error: e.message })
  }
}
