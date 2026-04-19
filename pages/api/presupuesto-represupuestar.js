import { getSheets } from '../../lib/sheets'

const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']

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
  const mail = req.headers['x-user-email'] || ''
  if (!MAILS.includes(mail)) return res.status(401).json({ error: 'No autorizado' })

  const { num, motivo, fechaEvento, pedidos } = req.body || {}
  if (!num || !motivo) return res.status(400).json({ error: 'Faltan num o motivo' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A:AV' })
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

    // Aplicar overrides de pedidos (si vinieron del modal)
    // pedidos: [{index: 1..12, svc, precio}, ...]
    if (Array.isArray(pedidos)) {
      let subtotal = 0
      for (let i = 0; i < 12; i++) {
        const col = 11 + i * 2       // Pedido N en col L, N, P, R, ...
        nueva[col] = ''
        nueva[col + 1] = ''
      }
      for (const p of pedidos) {
        const idx = Math.max(1, Math.min(12, Number(p.index) || 1)) - 1
        const col = 11 + idx * 2
        nueva[col] = p.svc || ''
        nueva[col + 1] = p.precio || 0
        subtotal += Number(p.precio) || 0
      }
      // Si viene subtotal recalculado, actualizar precio final (col I = index 8)
      // Por ahora copiamos total original si no viene total; si hay pedidos, usamos subtotal como approx Precio Final
      // (el usuario puede ajustar impuestos/fees desde Presupuestos si hace falta)
      if (subtotal > 0) nueva[8] = subtotal
    }

    // Fecha presupuesto (col J = index 9) = hoy
    const now = new Date()
    nueva[9] = now.toLocaleDateString('es-AR')

    // Append nueva fila
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'PRESUPUESTOS!A:A',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [nueva] },
    })

    // Marcar original como REPRESUPUESTADO
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `PRESUPUESTOS!D${rowIndex}`,
      valueInputOption: 'RAW',
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
