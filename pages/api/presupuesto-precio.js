import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

// Fija el PRECIO FINAL de un presupuesto (redondeo, ajuste de última hora, precio cerrado
// con el cliente). El ajuste se recalcula solo: Ajuste = precio nuevo − (subtotal + fee +
// ganancias + IIBB + interés). Así el sheet nunca queda con un total que no cierra con sus partes.
//
// Si el presu ya está aprobado, espeja el nuevo total al PROYECTO (Total, BG Total, BH Ajuste).
// El Fee no se toca: el redondeo vive en Ajuste, igual que un descuento (misma convención
// que usa la app al aprobar).

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }
// Los montos del sheet vienen en formato US (" $1,234,567.00")
const num = v => { const s=String(v||'').replace(/[\s$]/g,''); if(!s) return 0; return Number(s.replace(/,/g,'')) || 0 }

// PRESUPUESTOS — índices de columna
const P = { precioFinal:8, subtotal:38, fee:39, gan:40, iibb:41, interes:44, total:45, ajuste:46 }
// PROYECTOS — índices de columna
const PR = { nro:2, total:7, totalBG:58, ajuste:59 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return

  const { num: nro, precioFinal, fila, confirmar } = req.body
  const nuevo = Math.round(Number(precioFinal) || 0)
  if (!nro) return res.status(400).json({ error: 'Falta el N° de presupuesto' })
  if (!(nuevo > 0)) return res.status(400).json({ error: 'El precio final tiene que ser mayor a 0' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A:BE' })
    const rows = r.data.values || []

    // Hay N° de presupuesto repetidos en el sheet: si el cliente manda la fila, mandamos a esa.
    let filaTarget = -1
    if (fila && rows[fila-1] && String(rows[fila-1][0]||'').trim() === String(nro).trim()) filaTarget = fila
    else for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]||'').trim() === String(nro).trim()) { filaTarget = i + 1; break }
    }
    if (filaTarget === -1) return res.status(404).json({ error: `No encontré el presupuesto #${nro}` })

    const row = rows[filaTarget-1]
    const anterior = num(row[P.precioFinal])
    if (anterior === nuevo) return res.json({ ok: true, sinCambios: true, anterior, nuevo })

    // Total sin ajuste = lo que dan las partes. El ajuste absorbe la diferencia.
    const partes = num(row[P.subtotal]) + num(row[P.fee]) + num(row[P.gan]) + num(row[P.iibb]) + num(row[P.interes])
    const ajuste = Math.round(nuevo - partes)

    // Si ya se facturó contra este presu, avisar antes de tocar el precio.
    let facturas = []
    try {
      const rf = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A:Z' })
      const fRows = rf.data.values || []
      const fH = fRows[0] || []
      const iNro = fH.indexOf('N° Presupuesto'), iFac = fH.indexOf('Nro de Factura'), iPrecio = fH.indexOf('Precio FINAL')
      if (iNro !== -1) facturas = fRows.slice(1)
        .filter(fr => String(fr[iNro]||'').trim() === String(nro).trim() && String(fr[iFac]||'').trim())
        .map(fr => ({ nro: fr[iFac], monto: num(fr[iPrecio]) }))
    } catch (e) {}
    if (facturas.length > 0 && !confirmar) {
      return res.json({
        requiereConfirmar: true,
        facturas,
        error: `#${nro} ya tiene ${facturas.length} factura${facturas.length>1?'s':''} emitida${facturas.length>1?'s':''} (${facturas.map(f=>f.nro).join(', ')}). Cambiar el precio del presu NO cambia la factura.`,
      })
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data: [
        { range: `PRESUPUESTOS!${colLetra(P.precioFinal)}${filaTarget}`, values: [[nuevo]] },
        { range: `PRESUPUESTOS!${colLetra(P.total)}${filaTarget}`,       values: [[nuevo]] },
        { range: `PRESUPUESTOS!${colLetra(P.ajuste)}${filaTarget}`,      values: [[ajuste]] },
      ]},
    })

    // Espejo al proyecto (si está aprobado)
    let proyecto = false
    try {
      const rp = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:C' })
      const pRows = rp.data.values || []
      let filaProy = -1
      for (let i = 1; i < pRows.length; i++) {
        if (String(pRows[i][PR.nro]||'').trim() === String(nro).trim()) { filaProy = i + 1; break }
      }
      if (filaProy > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: { valueInputOption: 'USER_ENTERED', data: [
            { range: `PROYECTOS!${colLetra(PR.total)}${filaProy}`,   values: [[nuevo]] },
            { range: `PROYECTOS!${colLetra(PR.totalBG)}${filaProy}`, values: [[nuevo]] },
            { range: `PROYECTOS!${colLetra(PR.ajuste)}${filaProy}`,  values: [[ajuste]] },
          ]},
        })
        proyecto = true
      }
    } catch (e) {}

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), auth.mail, 'presupuesto-precio', 'PRESUPUESTOS', String(nro), `${anterior} → ${nuevo} (ajuste ${ajuste})${proyecto?' +proyecto':''}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, anterior, nuevo, ajuste, proyecto, facturas })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
