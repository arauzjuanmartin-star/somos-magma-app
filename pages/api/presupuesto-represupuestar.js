import { getSheets, MAX_SLOTS, SLOT_PRESU } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

function calcularSiguienteVersion(nro, todosNros) {
  const base = String(nro).replace(/v\d+$/i, '').trim()
  let maxVer = 1
  for (const n of todosNros) {
    const s = String(n || '').trim()
    if (!s) continue
    const m = s.match(/^(.+?)(?:v(\d+))?$/i)
    if (!m) continue
    if (m[1].trim() === base) {
      const ver = m[2] ? parseInt(m[2]) : 1
      if (ver > maxVer) maxVer = ver
    }
  }
  return base + 'v' + (maxVer + 1)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { num, motivo, fechaEvento, pedidos } = req.body || {}
  if (!num || !motivo) return res.status(400).json({ error: 'Faltan num o motivo' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A:DI' })
    const rows = r.data.values || []
    if (rows.length < 2) return res.status(404).json({ error: 'Sin datos en PRESUPUESTOS' })

    let rowIndex = -1, original = null
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(num).trim()) {
        rowIndex = i + 1
        original = [...rows[i]]
        break
      }
    }
    if (rowIndex === -1) return res.status(404).json({ error: `Presupuesto ${num} no encontrado` })

    const todos = rows.slice(1).map(r => r[0])
    const nuevaVersion = calcularSiguienteVersion(num, todos)

    // Construir nueva fila como copia del original con overrides
    const nueva = [...original]
    nueva[0] = nuevaVersion            // Col A: N°
    nueva[3] = 'EN ESPERA'             // Col D: Estado
    if (fechaEvento) nueva[1] = fechaEvento // Col B: Fecha Evento

    // Calcular ratio del original (precioFinal / subtotal) para escalar fee+impuestos+ajuste proporcional
    const num2 = v => { if (v===undefined||v===null||v==='') return 0; const n=parseFloat(String(v).replace(/[$,\s]/g,'')); return isNaN(n)?0:n }
    let subtotalOriginal = 0
    for (let i = 1; i <= MAX_SLOTS; i++) { subtotalOriginal += num2(original[SLOT_PRESU(i).precio]) }
    const precioFinalOriginal = num2(original[8])
    const ratio = subtotalOriginal > 0 ? (precioFinalOriginal / subtotalOriginal) : 1

    // Aplicar overrides de pedidos (si vinieron del modal)
    if (Array.isArray(pedidos) && pedidos.length > 0) {
      let subtotalNuevo = 0
      for (let i = 1; i <= MAX_SLOTS; i++) {
        const c = SLOT_PRESU(i)
        nueva[c.pedido] = ''
        nueva[c.precio] = ''
      }
      for (const p of pedidos) {
        const n = Math.max(1, Math.min(MAX_SLOTS, Number(p.index) || 1))
        const c = SLOT_PRESU(n)
        nueva[c.pedido] = p.svc || ''
        nueva[c.precio] = p.precio || 0
        subtotalNuevo += Number(p.precio) || 0
      }
      // Precio Final = subtotal nuevo * ratio (mantiene mismo % de fee+impuestos+ajuste)
      // Si el usuario mandó precioFinal explícito, respetarlo.
      const precioFinalNuevo = (req.body.precioFinal != null) ? Number(req.body.precioFinal) : Math.round(subtotalNuevo * ratio)
      nueva[8] = precioFinalNuevo
    }

    // Fecha presupuesto (col J = index 9) = hoy
    const now = new Date()
    nueva[9] = now.toLocaleDateString('es-AR')

    // Append nueva fila
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'PRESUPUESTOS!A:A',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [nueva] },
    })

    // Marcar original como REPRESUPUESTADO
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `PRESUPUESTOS!D${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['REPRESUPUESTADO']] },
    })

    // LOG: registrar acción
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'represupuestar', 'PRESUPUESTOS', num, `${num} -> ${nuevaVersion} | motivo: ${motivo}`]] },
      })
    } catch (e) { /* LOG puede no existir */ }

    res.status(200).json({ ok: true, nuevaVersion, original: num })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, error: err.message })
  }
}
