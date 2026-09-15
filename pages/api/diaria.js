import { getSheets, withSheetsRetry } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { calcularBrief } from '../../lib/brief.mjs'

// La diaria calculada EN VIVO desde el Master Magma (misma lógica que scripts/morning-brief.mjs, vía lib/brief.mjs).
// El bloque del contador no se puede calcular acá (necesita leer el mail de Diego): lo escribe
// scripts/diaria.mjs en la solapa DIARIA a las 8 y a las 15, y acá se lee la última fila.
// Protegido por auth: solo mails autorizados.

export default async function handler(req, res) {
  const auth = await requireAuth(req, res)
  if (!auth) return
  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await withSheetsRetry(() => sheets.spreadsheets.values.batchGet({
      spreadsheetId: SHEET_ID,
      ranges: ['PRESUPUESTOS', 'PROYECTOS', 'FACTURACION', 'RRHH'],
      valueRenderOption: 'FORMATTED_VALUE',
    }))
    const [PRE, PRO, FAC, RH] = r.data.valueRanges.map(v => v.values || [])
    const brief = calcularBrief({ PRE, PRO, FAC, RH })

    let contador = null
    try {
      const d = await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'DIARIA!A:M', valueRenderOption: 'FORMATTED_VALUE' }))
      const filas = (d.data.values || []).slice(1).filter(x => x[12])
      const ult = filas[filas.length - 1]
      if (ult) contador = { fecha: ult[0], hora: ult[1], aviso: ult[2], ...JSON.parse(ult[12]) }
    } catch (e) { /* todavía no existe la solapa DIARIA: la crea scripts/diaria.mjs en su primera corrida */ }

    res.json({ generado: new Date().toISOString(), brief, contador })
  } catch (e) {
    console.error(e)
    const status = e.code || e.response?.status
    if (status === 429) return res.status(429).json({ error: 'Google está limitando. Esperá 30s.' })
    res.status(500).json({ error: e.message })
  }
}
