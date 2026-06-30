import { getSheets, withSheetsRetry } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const colLetra = col => { let s='',c=col+1; while(c>0){c--;s=String.fromCharCode(65+(c%26))+s;c=Math.floor(c/26);} return s }
const num = v => parseFloat(String(v||'0').replace(/[^\d.-]/g,''))||0
const hoyStr = () => { const d=new Date(); return d.getDate()+'/'+(d.getMonth()+1)+'/'+d.getFullYear() }

// Marca un proyecto aprobado como "ya facturado" (y opcionalmente cobrado) SIN tocar saldos.
// Reconciliación histórica: convierte el registro fantasma (s/n, sin emisión) en factura real
// poniéndole fecha de emisión, y corrige el monto desde el presupuesto actual.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { nroPresupuesto, cobrada = true, monto } = req.body || {}
  if (!nroPresupuesto) return res.status(400).json({ error: 'Falta nroPresupuesto' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const [prR, fcR] = await Promise.all([
      withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A:BE' })),
      withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A:AI' })),
    ])
    const pr = prR.data.values || [], ph = (pr[0] || []).map(x => String(x || ''))
    const P = n => ph.indexOf(n)
    const presu = pr.slice(1).find(r => String(r[P('Columna 1')] || '').trim() === String(nroPresupuesto).trim())
    if (!presu) return res.status(404).json({ error: 'Presupuesto no encontrado' })
    const neto = num(monto) > 0 ? num(monto) : num(presu[P('Precio Final')])  // monto real cobrado si se pasó
    const fechaEvento = presu[P('Fecha Evento')] || ''
    const cliente = presu[P('Cliente')] || ''
    const agencia = presu[P('Agencia')] || ''
    const proyecto = presu[P('Proyecto')] || ''

    const rows = fcR.data.values || [], headers = (rows[0] || []).map(x => String(x || ''))
    const H = n => headers.indexOf(n)
    const iPresu = H('N° Presupuesto'), iNro = H('Nro de Factura'), iEmi = H('Fecha emision')
    const iVenc = H('Vencimiento'), iNeto = H('Precio SIN IVA'), iFinal = H('Precio FINAL')
    const iCob = headers.findIndex(x => /^cobrado$/i.test(x)), iFechaCob = H('Fecha cobro'), iMontoCob = H('Monto cobrado')
    const iCli = H('Cliente'), iAg = H('Agencia'), iProy = H('Proyecto'), iEv = H('Fecha Evento')

    // Buscar fila existente del mismo N°: preferir el registro fantasma (sin número y sin emisión),
    // pero si no hay, usar CUALQUIER fila del N° (para no crear duplicados).
    let rowIdx = -1, rowIdxAny = -1
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][iPresu] || '').trim() !== String(nroPresupuesto).trim()) continue
      if (rowIdxAny === -1) rowIdxAny = i
      const sinNro = !String(rows[i][iNro] || '').trim(), sinEmi = !String(rows[i][iEmi] || '').trim()
      if (sinNro && sinEmi) { rowIdx = i; break }
    }
    if (rowIdx === -1) rowIdx = rowIdxAny

    const emi = fechaEvento || hoyStr()
    if (rowIdx > 0) {
      // Actualizar la fila existente → la convierte en factura real
      const sheetRow = rowIdx + 1
      const updates = [
        { range: `FACTURACION!${colLetra(iEmi)}${sheetRow}`, values: [[emi]] },
        { range: `FACTURACION!${colLetra(iNeto)}${sheetRow}`, values: [[neto]] },  // corrige monto desde el presupuesto
      ]
      if (iCob !== -1) updates.push({ range: `FACTURACION!${colLetra(iCob)}${sheetRow}`, values: [[cobrada ? true : false]] })
      if (cobrada && iFechaCob !== -1) updates.push({ range: `FACTURACION!${colLetra(iFechaCob)}${sheetRow}`, values: [[emi]] })
      if (cobrada && iMontoCob !== -1) updates.push({ range: `FACTURACION!${colLetra(iMontoCob)}${sheetRow}`, values: [[neto]] })
      await withSheetsRetry(() => sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
      }))
    } else {
      // No hay registro: crear una fila nueva ya marcada
      const newRow = new Array(headers.length).fill('')
      const set = (i, v) => { if (i !== -1) newRow[i] = v }
      set(iPresu, String(nroPresupuesto)); set(iEmi, emi); set(iEv, fechaEvento)
      set(iNeto, neto); set(iFinal, neto); set(iCli, cliente); set(iAg, agencia); set(iProy, proyecto)
      if (cobrada) { if (iCob !== -1) newRow[iCob] = true; set(iFechaCob, emi); set(iMontoCob, neto) }
      await withSheetsRetry(() => sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: 'FACTURACION!A:AI',
        valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [newRow] },
      }))
    }

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'factura-confirmar-historico', 'FACTURACION', String(nroPresupuesto), `ya facturada${cobrada ? ' y cobrada' : ''} neto=${neto}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, neto, cobrada })
  } catch (e) {
    console.error('factura-confirmar:', e)
    res.status(500).json({ error: e.message })
  }
}
