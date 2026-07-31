import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

// Agrega un servicio nuevo a la solapa "listado" (col H = nombre, col I = precio).
// Es la lista que alimenta los desplegables de servicios en toda la app.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const nombre = String(req.body?.nombre || '').trim()
  const precio = parseFloat(String(req.body?.precio ?? '').replace(/[^\d.-]/g, '')) || 0
  if (!nombre) return res.status(400).json({ error: 'Falta el nombre del servicio' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'listado!H:I' })
    const rows = r.data.values || []

    // ¿ya existe? comparo ignorando emoji, mayúsculas y acentos
    const limpio = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'')
      .replace(/[^\p{L}\p{N}\s/+-]/gu,'').replace(/\s+/g,' ').trim().toLowerCase()
    const target = limpio(nombre)
    for (let i = 1; i < rows.length; i++) {
      const n = String(rows[i]?.[0] || '').trim()
      if (n && limpio(n) === target) {
        return res.status(409).json({ error: `Ya existe como "${n}"`, existente: n })
      }
    }

    // Escribo DESPUÉS del último servicio cargado. Ojo: en "listado" cada columna
    // arranca a distinta altura (el header "Servicio" está en H3, no en H1), así que
    // buscar "la primera fila vacía" mete el dato arriba del título.
    // Tampoco sirve append: la solapa tiene otras columnas con más filas.
    let fila = 0
    rows.forEach((r, i) => { if (String(r?.[0] || '').trim()) fila = i + 1 })
    fila = fila + 1

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: `listado!H${fila}`, values: [[nombre]] },
          { range: `listado!I${fila}`, values: [[precio]] },
        ],
      },
    })

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'servicio-nuevo', 'listado', nombre, `precio=${precio} fila=${fila}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, nombre, precio, fila })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
