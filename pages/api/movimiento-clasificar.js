import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

// Cambia la clasificación de UN gasto (fila de MOVIMIENTOS_TARJETA): Empresa <-> Personal
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const { fila, categoria } = req.body
  if (!fila || !categoria) return res.status(400).json({ error: 'Faltan campos' })
  const cat = String(categoria).toLowerCase() === 'empresa' ? 'Empresa' : 'Personal'
  const sub = cat === 'Empresa' ? 'Reclasificado (Magma)' : 'Personal'
  try {
    const { sheets, SHEET_ID } = await getSheets()
    const h = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'MOVIMIENTOS_TARJETA!1:1' })).data.values?.[0] || []
    const iCat = h.indexOf('Categoria'), iSub = h.indexOf('Subcategoria')
    const data = []
    if (iCat !== -1) data.push({ range: `MOVIMIENTOS_TARJETA!${colLetra(iCat)}${fila}`, values: [[cat]] })
    if (iSub !== -1) data.push({ range: `MOVIMIENTOS_TARJETA!${colLetra(iSub)}${fila}`, values: [[sub]] })
    if (data.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'RAW', data } })
    res.json({ ok: true, categoria: cat })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
