// Guarda los campos que carga el equipo en una fila de EDICION (por ID).
// Escribe solo las celdas que mandan — nunca la fila entera — así dos personas
// tocando cosas distintas del mismo entregable no se pisan.

import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { HEADERS_EDICION, IDX_EDICION, estaCerrado, aAR, CAMPOS_BRIEF, CAMPOS_PIEZA, CONTADOR_DE } from '../../lib/edicion'
import { armarAviso, mandarAviso } from '../../lib/edicion-avisos'

const colLetra = c => { let s='', n=c+1; while(n>0){ n--; s=String.fromCharCode(65+(n%26))+s; n=Math.floor(n/26) } return s }
const ULT_COL = colLetra(HEADERS_EDICION.length - 1)

// Lo único que la app puede tocar. El resto (cliente, proyecto…) sale de PROYECTOS.
const EDITABLES = [
  'Editor','Estado','Prioridad','Fecha compromiso','Fecha entrega',
  'Link crudo','Link pre-entrega','Link entrega','Notas','Consulta','PM',
  ...CAMPOS_PIEZA.map(c => c.campo),   // qué es la pieza (capa 1)
  ...CAMPOS_BRIEF.map(c => c.campo),   // qué necesita el editor (capa 2)
  'Brief pedido',
  // El título solo se puede cambiar en las tareas cargadas a mano (ver más abajo):
  // en las que vienen del presupuesto lo pisa el sync en la próxima corrida.
  'Entregable',
]

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { id, campos, borrar } = req.body || {}
  if (!id) return res.status(400).json({ error: 'Falta id' })
  if (!borrar && (!campos || typeof campos !== 'object')) return res.status(400).json({ error: 'Falta id o campos' })

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

    // Solo se borran las tareas cargadas a mano. Las que espejan una línea del
    // presupuesto no: el sync las volvería a crear en la corrida siguiente.
    const esManual = /-M\d+$/.test(String(id).trim())
    if (borrar) {
      if (!esManual) return res.status(400).json({ error: 'Ese entregable sale del presupuesto — no se borra desde acá' })
      const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties(title,sheetId))' })
      const sid = meta.data.sheets.find(x => x.properties.title === 'EDICION')?.properties.sheetId
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { requests: [{ deleteDimension: { range: { sheetId: sid, dimension: 'ROWS', startIndex: sheetRow - 1, endIndex: sheetRow } } }] },
      })
      try {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[new Date().toISOString(), mail, 'edicion-borrar', 'EDICION', String(id), 'tarea manual borrada']] },
        })
      } catch (e) {}
      return res.json({ ok: true, borrado: true })
    }

    const data = []
    const cambios = []
    for (const [k, v] of Object.entries(campos)) {
      if (!EDITABLES.includes(k)) continue
      if (k === 'Entregable' && !esManual) continue   // lo pisaría el sync
      const col = cE(k)
      const antes = String(actual[col] || '')
      const ahora = String(v ?? '')
      if (antes === ahora) continue
      data.push({ range: `EDICION!${colLetra(col)}${sheetRow}`, values: [[ahora]] })
      cambios.push(`${k}: "${antes}" → "${ahora}"`)
    }

    // Cada vez que algo se rebota se suma una ronda al contador que corresponde.
    // Es lo que después dice de quién es el problema: muchas internas = edición,
    // muchas del cliente = brief flojo. El manual incluye 2 rondas DEL CLIENTE.
    const contador = CONTADOR_DE[String(campos.Estado || '').trim()]
    if (contador && String(actual[cE('Estado')] || '').trim() !== String(campos.Estado).trim()) {
      const col = cE(contador)
      if (col > -1) {
        const ahora = (parseInt(actual[col]) || 0) + 1
        data.push({ range: `EDICION!${colLetra(col)}${sheetRow}`, values: [[ahora]] })
        cambios.push(`${contador}: ${ahora}`)
      }
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

    // Aviso a quien le toca mover la ficha. Va después de guardar y nunca frena
    // la respuesta: si el mail falla, el cambio ya quedó en el sheet igual.
    let aviso = null
    if (campos.Estado && String(actual[cE('Estado')] || '').trim() !== String(campos.Estado).trim()) {
      try {
        const fila = {}
        hE.forEach((h, i) => { fila[h] = actual[i] ?? '' })
        Object.assign(fila, campos)
        const rrhh = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'RRHH!A:D' })).data.values || []
        const hR = rrhh[0] || []
        const lista = rrhh.slice(1).map(r => Object.fromEntries(hR.map((k, i) => [k, r[i]])))
        const a = armarAviso({ fila, estadoNuevo: campos.Estado, rrhh: lista, mailQuienCambio: mail })
        const env = await mandarAviso(a)
        aviso = env.ok ? { avisado: env.para } : null
      } catch (e) { console.error('aviso:', e.message) }
    }

    res.json({ ok: true, cambios, aviso })
  } catch (e) {
    console.error('edicion-guardar:', e)
    res.status(500).json({ error: e.message })
  }
}
