import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { RANGOS_SOCIOS, calcularCuentaSocios } from '../../lib/socios.mjs'

// Cuenta corriente de cada socio contra Magma. El cálculo vive en lib/socios.mjs y es EL MISMO
// que usan scripts/cuenta-socios.mjs y scripts/numeros-base.mjs: si hay que cambiar un criterio,
// se cambia ahí y la app, la consola y la ficha de números cambian juntas.
export default async function handler(req, res) {
  const auth = await requireAuth(req, res)
  if (!auth) return
  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.batchGet({ spreadsheetId: SHEET_ID,
      ranges: RANGOS_SOCIOS, valueRenderOption: 'FORMATTED_VALUE' })
    const { nombreMes, ...cuenta } = calcularCuentaSocios(r.data.valueRanges.map(v => v.values || []))
    res.json(cuenta)
  } catch (e) {
    console.error('socios-cuenta', e)
    res.status(500).json({ error: e.message })
  }
}
