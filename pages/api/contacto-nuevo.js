import { getSheets, withSheetsRetry } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const { nombre, mail, telefono, cuit, agencia, cargo } = req.body
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'Nombre requerido' })
  try {
    const { sheets, SHEET_ID } = await getSheets()
    const norm = v => String(v||'').toLowerCase().trim().replace(/\s+/g,' ').normalize('NFD').replace(/[̀-ͯ]/g,'')
    // Celda rota del sheet (#ERROR!, #N/A...) = celda vacía, así se puede sobreescribir con el dato bueno
    const sinErr = v => { const s = String(v||'').trim(); return /^#(ERROR!|REF!|N\/A|VALUE!|NAME\?|DIV\/0!|NUM!|NULL!)/.test(s) ? '' : s }

    // Detectar duplicado por (nombre + agencia). Si existe, mergear datos faltantes en lugar de duplicar.
    const r = await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Contactos/agencias!A:H' }))
    const rows = r.data.values || []
    let dup = -1
    for (let i = 1; i < rows.length; i++) {
      if (norm(rows[i][0]) === norm(nombre) && norm(rows[i][2]) === norm(agencia||'')) {
        dup = i + 1; break
      }
    }
    if (dup > 0) {
      const updates = []
      const existing = rows[dup-1]
      if (mail && !sinErr(existing[1])) updates.push({ range: `Contactos/agencias!B${dup}`, values: [[mail]] })
      if (cargo && !sinErr(existing[4])) updates.push({ range: `Contactos/agencias!E${dup}`, values: [[cargo]] })
      if (telefono && !sinErr(existing[5])) updates.push({ range: `Contactos/agencias!F${dup}`, values: [[telefono]] })
      if (cuit && !sinErr(existing[7])) updates.push({ range: `Contactos/agencias!H${dup}`, values: [[cuit]] })
      if (updates.length > 0) {
        // RAW y no USER_ENTERED: un teléfono que arranca con "+" (ej "+54 9 11...") Sheets lo toma
        // como fórmula y deja la celda en #ERROR!. Con RAW se guarda tal cual, como texto.
        await withSheetsRetry(() => sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: { valueInputOption: 'RAW', data: updates }
        }))
      }
      return res.json({ ok: true, accion: 'actualizado', fila: dup, camposCompletados: updates.length })
    }

    // Crear nuevo
    await withSheetsRetry(() => sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Contactos/agencias!A:H',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[nombre, mail||'', agencia||'', '', cargo||'', telefono||'', '', cuit||'']] }
    }))
    res.json({ ok: true, accion: 'creado' })
  } catch(e) {
    console.error(e)
    const status = e.code || e.response?.status
    if (status === 429) return res.status(429).json({ error: 'Google está limitando. Esperá 30s.' })
    res.status(500).json({ error: e.message })
  }
}
