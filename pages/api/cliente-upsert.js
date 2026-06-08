import { getSheets, withSheetsRetry } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { nombre, agenciaHabitual, industria, notas } = req.body
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'Nombre requerido' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'CLIENTES!A:J' }))
    const headers = r.data.values?.[0] || []
    const rows = r.data.values || []

    const norm = v => String(v||'').trim().toLowerCase()
    const filaExistente = rows.findIndex((row,i) => i>0 && norm(row[0]) === norm(nombre))
    const hoy = new Date().toLocaleDateString('es-AR')

    if (filaExistente > 0) {
      // Ya existe → solo actualizar lo que venga + Última vez
      const fila = filaExistente + 1
      const updates = []
      if (agenciaHabitual !== undefined) updates.push({ range: `CLIENTES!B${fila}`, values: [[agenciaHabitual]] })
      if (industria !== undefined) updates.push({ range: `CLIENTES!C${fila}`, values: [[industria]] })
      if (notas !== undefined) updates.push({ range: `CLIENTES!D${fila}`, values: [[notas]] })
      updates.push({ range: `CLIENTES!G${fila}`, values: [[hoy]] })  // Ultima vez
      updates.push({ range: `CLIENTES!J${fila}`, values: [[hoy]] })  // Modificada
      if (updates.length > 0) {
        await withSheetsRetry(() => sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: { valueInputOption: 'USER_ENTERED', data: updates }
        }))
      }
      return res.json({ ok: true, accion: 'actualizado', fila })
    }

    // Nuevo cliente
    const row = [
      nombre.trim(),
      agenciaHabitual || '',
      industria || '',
      notas || '',
      'SI',
      hoy,        // Primera vez
      hoy,        // Última vez
      1,          // Cant. presus históricos
      hoy,        // Creada
      '',         // Modificada
    ]

    await withSheetsRetry(() => sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'CLIENTES!A:J',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    }))

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'cliente-nuevo', 'CLIENTES', nombre, `agencia=${agenciaHabitual||''}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, accion: 'creado' })
  } catch (e) {
    console.error(e)
    const status = e.code || e.response?.status
    if (status === 429) return res.status(429).json({ error: 'Google está limitando los pedidos. Esperá 30s.' })
    res.status(500).json({ error: e.message })
  }
}
