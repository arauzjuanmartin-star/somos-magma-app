import { getSheets, withSheetsRetry, COL_PDF, HEADER_PDF } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

// Guarda lo que se escribió en el generador de PDF (/presupuesto) en la columna
// "PDF Config" (DT) de PRESUPUESTOS, como JSON: descripción, textos de los servicios,
// cláusulas, plazo, descuento, precios por ítem… La misma pantalla lo lee al reabrir el
// presu, y el represupuesto lo hereda (presupuesto-nuevo copia la celda a la fila nueva).
//
// La columna es técnica (nadie la edita a mano) y se escribe con RAW: un JSON no tiene
// que pasar por el parser de fórmulas del sheet. Si todavía no existe, se crea sola en el
// lugar que dice lib/slots.js — el filtro de la solapa lo extiende
// scripts/presupuestos-columna-pdf.mjs.
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
const MAX_CELDA = 45000   // una celda del sheet aguanta 50.000 caracteres

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return

  const { num, fila, config } = req.body || {}
  if (!num || !config || typeof config !== 'object') return res.status(400).json({ ok: false, error: 'Faltan num o config' })
  const json = JSON.stringify({ ...config, por: auth.mail })
  if (json.length > MAX_CELDA) return res.status(400).json({ ok: false, error: `El PDF guardado es demasiado largo para una celda (${json.length} caracteres, máx. ${MAX_CELDA}). Acortá las cláusulas.` })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const letra = colLetra(COL_PDF)
    const meta = await withSheetsRetry(() => sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, ranges: ['PRESUPUESTOS'], fields: 'sheets(properties(sheetId,gridProperties(columnCount)))' }))
    const hoja = meta.data.sheets?.[0]
    if (!hoja) return res.status(500).json({ ok: false, error: 'No encuentro la solapa PRESUPUESTOS' })
    const r = await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `PRESUPUESTOS!A:${letra}` }))
    const rows = r.data.values || []
    const headers = rows[0] || []

    let col = headers.indexOf(HEADER_PDF)
    if (col === -1) {
      // Primera vez: la columna no existe. Se crea en DT si esa celda está libre.
      if (headers[COL_PDF]) return res.status(500).json({ ok: false, error: `En ${letra}1 hay "${headers[COL_PDF]}" y no "${HEADER_PDF}". Revisar lib/slots.js.` })
      const ancho = hoja.properties.gridProperties?.columnCount || 0
      if (ancho < COL_PDF + 1) {
        await withSheetsRetry(() => sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [
          { appendDimension: { sheetId: hoja.properties.sheetId, dimension: 'COLUMNS', length: COL_PDF + 1 - ancho } },
        ] } }))
      }
      await withSheetsRetry(() => sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `PRESUPUESTOS!${letra}1`, valueInputOption: 'RAW', requestBody: { values: [[HEADER_PDF]] } }))
      col = COL_PDF
    }

    // La fila: por número, salvo que el front mande la fila exacta (hay N° repetidos,
    // #1833 aparece 4 veces) y esa fila efectivamente sea ese presupuesto.
    const esNum = i => String(rows[i]?.[0] || '').trim() === String(num).trim()
    let filaTarget = -1
    if (fila && esNum(fila - 1)) filaTarget = fila
    else for (let i = 1; i < rows.length; i++) if (esNum(i)) { filaTarget = i + 1; break }
    if (filaTarget === -1) return res.status(404).json({ ok: false, error: `Presupuesto ${num} no encontrado` })

    await withSheetsRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `PRESUPUESTOS!${colLetra(col)}${filaTarget}`,
      valueInputOption: 'RAW', requestBody: { values: [[json]] },
    }))

    res.json({ ok: true, fila: filaTarget, col: colLetra(col), largo: json.length })
  } catch (e) {
    console.error(e)
    const status = e.code || e.response?.status
    if (status === 429) return res.status(429).json({ ok: false, error: 'Google está limitando los pedidos. Esperá 30 segundos.' })
    res.status(500).json({ ok: false, error: e.message })
  }
}
