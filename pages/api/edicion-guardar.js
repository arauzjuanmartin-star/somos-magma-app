// Guarda los campos que carga el equipo en una fila de EDICION (por ID).
// Escribe solo las celdas que mandan — nunca la fila entera — así dos personas
// tocando cosas distintas del mismo entregable no se pisan.

import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { HEADERS_EDICION, IDX_EDICION, estaCerrado, aAR } from '../../lib/edicion'

const colLetra = c => { let s='', n=c+1; while(n>0){ n--; s=String.fromCharCode(65+(n%26))+s; n=Math.floor(n/26) } return s }
const ULT_COL = colLetra(HEADERS_EDICION.length - 1)

// Lo único que la app puede tocar. El resto (cliente, proyecto…) sale de PROYECTOS.
const EDITABLES = ['Editor','Estado','Prioridad','Fecha compromiso','Fecha entrega','Link crudo','Link entrega','Notas','Consulta']

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { id, campos } = req.body || {}
  if (!id || !campos || typeof campos !== 'object') return res.status(400).json({ error: 'Falta id o campos' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `EDICION!A:${ULT_COL}` })
    const rows = r.data.values || []
    if (!rows.length) return res.status(400).json({ error: 'Falta la solapa EDICION' })
    const hE = rows[0]
    const cE = n => { const i = hE.indexOf(n); return i === -1 ? IDX_EDICION[n] : i }

    let sheetRow = -1, actual = null
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][cE('ID')] || '').trim() === String(id).trim()) { sheetRow = i + 1; actual = rows[i]; break }
    }
    if (sheetRow === -1) return res.status(404).json({ error: `No existe el entregable ${id} — probá "Actualizar" para sincronizar` })

    const data = []
    const cambios = []
    for (const [k, v] of Object.entries(campos)) {
      if (!EDITABLES.includes(k)) continue
      const col = cE(k)
      const antes = String(actual[col] || '')
      const ahora = String(v ?? '')
      if (antes === ahora) continue
      data.push({ range: `EDICION!${colLetra(col)}${sheetRow}`, values: [[ahora]] })
      cambios.push(`${k}: "${antes}" → "${ahora}"`)
    }

    // Si se marca Entregado y nadie puso la fecha real, la ponemos hoy.
    if (estaCerrado(campos.Estado) && !campos['Fecha entrega'] && !String(actual[cE('Fecha entrega')] || '').trim()) {
      data.push({ range: `EDICION!${colLetra(cE('Fecha entrega'))}${sheetRow}`, values: [[aAR(new Date())]] })
      cambios.push('Fecha entrega: hoy (automática)')
    }

    if (!data.length) return res.json({ ok: true, sinCambios: true })

    data.push({ range: `EDICION!${colLetra(cE('Actualizado'))}${sheetRow}`, values: [[new Date().toISOString()]] })
    data.push({ range: `EDICION!${colLetra(cE('Por'))}${sheetRow}`, values: [[mail]] })

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data },
    })
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'edicion-guardar', 'EDICION', String(id), cambios.join(' · ')]] },
      })
    } catch (e) {}

    res.json({ ok: true, cambios })
  } catch (e) {
    console.error('edicion-guardar:', e)
    res.status(500).json({ error: e.message })
  }
}
