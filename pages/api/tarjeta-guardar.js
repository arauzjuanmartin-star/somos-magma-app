import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

export const config = { api: { bodyParser: { sizeLimit: '5mb' } } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { tarjeta, mes, anio, movimientos, totalArs, totalUsd, vencimiento, resumenNota } = req.body
  if (!tarjeta || !mes || !anio) return res.status(400).json({ error: 'Faltan campos' })
  const movs = Array.isArray(movimientos) ? movimientos : []
  const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const filas = movs.map(m => [
      tarjeta, mes, anio,
      m.fecha || '', m.descripcion || '', m.comercio || '', m.moneda || 'ARS',
      Number(m.monto) || 0, m.categoria || 'Otros', m.subcategoria || '', mail, m.notas || '',
    ])

    if (filas.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'MOVIMIENTOS_TARJETA!A:L',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: filas },
      })
    }

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'tarjeta-guardar', 'TARJETAS', tarjeta, `${mes}/${anio} · ${resumenNota||''}`]] },
      })
    } catch (e) {}

    // Upsert del total del mes en TARJETAS (para que Egresos muestre cuánto pagar)
    if (totalArs !== undefined && totalArs !== null) {
      try {
        const tr = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'TARJETAS!A:N' })
        const rows = tr.data.values || []
        const th = rows[0] || []
        const TH = n => th.indexOf(n)
        const norm = v => String(v||'').trim().toLowerCase()
        const fila = rows.findIndex((row,i) => i>0 && norm(row[TH('Tarjeta')])===norm(tarjeta) && String(row[TH('Mes')]).trim()===String(mes).trim() && String(row[TH('Año')]).includes(String(anio)))
        const setCol = (name, val) => ({ range: `TARJETAS!${colLetra(TH(name))}${fila+1}`, values: [[val]] })
        if (fila > 0) {
          const ups = []
          if (TH('Monto')!==-1) ups.push(setCol('Monto', Number(totalArs)||0))
          if (TH('Monto USD')!==-1 && totalUsd!==undefined) ups.push(setCol('Monto USD', Number(totalUsd)||0))
          if (TH('Vencimiento')!==-1 && vencimiento) ups.push(setCol('Vencimiento', vencimiento))
          if (TH('Notas')!==-1 && resumenNota) ups.push(setCol('Notas', resumenNota))
          if (ups.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: ups } })
        } else {
          const nueva = new Array(th.length).fill('')
          if (TH('Tarjeta')!==-1) nueva[TH('Tarjeta')] = tarjeta
          if (TH('Mes')!==-1) nueva[TH('Mes')] = mes
          if (TH('Año')!==-1) nueva[TH('Año')] = anio
          if (TH('Monto')!==-1) nueva[TH('Monto')] = Number(totalArs)||0
          if (TH('Monto USD')!==-1) nueva[TH('Monto USD')] = Number(totalUsd)||0
          if (TH('Vencimiento')!==-1) nueva[TH('Vencimiento')] = vencimiento||''
          if (TH('Pagado')!==-1) nueva[TH('Pagado')] = 'NO'
          if (TH('Notas')!==-1) nueva[TH('Notas')] = resumenNota||''
          await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'TARJETAS!A:N', valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: [nueva] } })
        }
      } catch (e) { console.error('upsert TARJETAS', e.message) }
    }

    res.json({ ok: true, guardados: filas.length })
  } catch(e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
