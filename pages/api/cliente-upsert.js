import { getSheets, withSheetsRetry } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { nombre, agenciaHabitual, industria, notas, condicionCobro } = req.body
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'Nombre requerido' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'CLIENTES!A:Z' }))
    const headers = r.data.values?.[0] || []
    const rows = r.data.values || []
    // Cada dato en SU columna, por título. Hasta el 07/10/2026 escribía por letra (B, C, D, G, J): con una
    // columna más en el medio ("Condición de cobro", pegada a "Agencia habitual") habría pisado la de al lado.
    // La posición es solo respaldo si la fila 1 no tiene títulos. "Condición de cobro" y "Modificada" sin
    // respaldo: si la solapa no tiene esa columna, no se escribe.
    const norm2 = s => String(s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    const idxDefault = { Nombre: 0, 'Agencia habitual': 1, Industria: 2, Notas: 3, Activo: 4, 'Primera vez': 5, 'Ultima vez': 6, 'Cant. presus historicos': 7, Creada: 8 }
    const idx = {}
    Object.entries(idxDefault).forEach(([campo, pos]) => { const real = headers.findIndex(h => norm2(h) === norm2(campo)); idx[campo] = real >= 0 ? real : pos })
    ;['Modificada', 'Condición de cobro'].forEach(campo => { const real = headers.findIndex(h => norm2(h) === norm2(campo)); if (real >= 0) idx[campo] = real })

    const norm = v => String(v||'').trim().toLowerCase()
    const filaExistente = rows.findIndex((row,i) => i>0 && norm(row[0]) === norm(nombre))
    const hoy = new Date().toLocaleDateString('es-AR')

    if (filaExistente > 0) {
      // Ya existe → solo actualizar lo que venga + Última vez
      const fila = filaExistente + 1
      const updates = []
      const set = (campo, valor) => { if (valor === undefined || valor === null) return; const col = idx[campo]; if (col === undefined) return; updates.push({ range: `CLIENTES!${colLetra(col)}${fila}`, values: [[valor]] }) }
      if (agenciaHabitual !== undefined) set('Agencia habitual', agenciaHabitual)
      if (industria !== undefined) set('Industria', industria)
      if (notas !== undefined) set('Notas', notas)
      if (condicionCobro !== undefined) set('Condición de cobro', condicionCobro)
      set('Ultima vez', hoy)
      set('Modificada', hoy)
      if (updates.length > 0) {
        await withSheetsRetry(() => sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: { valueInputOption: 'USER_ENTERED', data: updates }
        }))
      }
      return res.json({ ok: true, accion: 'actualizado', fila })
    }

    // Nuevo cliente: cada dato en su columna, por título
    const row = new Array(Math.max(headers.length, 10)).fill('')
    const put = (campo, valor) => { const col = idx[campo]; if (col !== undefined) row[col] = valor }
    put('Nombre', nombre.trim()); put('Agencia habitual', agenciaHabitual || ''); put('Industria', industria || ''); put('Notas', notas || '')
    put('Activo', 'SI'); put('Primera vez', hoy); put('Ultima vez', hoy); put('Cant. presus historicos', 1); put('Creada', hoy)
    if (condicionCobro) put('Condición de cobro', condicionCobro)

    await withSheetsRetry(() => sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: headers.length ? `CLIENTES!A:${colLetra(headers.length - 1)}` : 'CLIENTES!A:J',
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
