import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { nombre, cuit, condIVA, mailFact, telefono, pmDefault, direccion, tipo, notas } = req.body
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'Nombre requerido' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'AGENCIAS!A:L' })
    const headers = r.data.values?.[0] || []
    const rows = r.data.values || []

    // Posición esperada de cada columna. Se usa como respaldo: si la solapa tiene el
    // título en la fila 1, mandan los títulos reales (si alguien reordena columnas,
    // seguimos escribiendo en la correcta en vez de pisar datos de otra).
    const idxDefault = {
      Nombre: 0, CUIT: 1, 'Condicion IVA': 2, 'Mail facturacion': 3, Telefono: 4,
      'PM default': 5, 'Direccion fiscal': 6, Tipo: 7, Notas: 8, Activa: 9, Creada: 10, Modificada: 11,
    }
    const norm2 = s => String(s||'').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    const idx = {}
    Object.entries(idxDefault).forEach(([campo, pos]) => {
      const real = headers.findIndex(h => norm2(h) === norm2(campo))
      idx[campo] = real >= 0 ? real : pos
    })
    const norm = v => String(v||'').trim().toLowerCase()
    const filaExistente = rows.findIndex((row,i) => i>0 && norm(row[0]) === norm(nombre))
    const hoy = new Date().toLocaleDateString('es-AR')

    if (filaExistente > 0) {
      const fila = filaExistente + 1
      const updates = []
      const set = (campo, valor) => {
        if (valor === undefined || valor === null) return
        const col = idx[campo]
        if (col === undefined) return
        updates.push({ range: `AGENCIAS!${colLetra(col)}${fila}`, values: [[String(valor)]] })
      }
      if (cuit !== undefined) set('CUIT', cuit)
      if (condIVA !== undefined) set('Condicion IVA', condIVA)
      if (mailFact !== undefined) set('Mail facturacion', mailFact)
      if (telefono !== undefined) set('Telefono', telefono)
      if (pmDefault !== undefined) set('PM default', pmDefault)
      if (direccion !== undefined) set('Direccion fiscal', direccion)
      if (tipo !== undefined) set('Tipo', tipo)
      if (notas !== undefined) set('Notas', notas)
      set('Modificada', hoy)
      if (updates.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: { valueInputOption: 'RAW', data: updates }
        })
      }
      try {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: 'LOG!A:F',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[new Date().toISOString(), mail, 'agencia-update', 'AGENCIAS', nombre, `campos=${updates.length}`]] },
        })
      } catch (e) {}
      return res.json({ ok: true, accion: 'actualizada', fila })
    }

    // Nueva agencia
    const row = new Array(12).fill('')
    row[0] = nombre.trim()
    row[1] = cuit || ''
    row[2] = condIVA || ''
    row[3] = mailFact || ''
    row[4] = telefono || ''
    row[5] = pmDefault || ''
    row[6] = direccion || ''
    row[7] = tipo || ''
    row[8] = notas || ''
    row[9] = 'SI'
    row[10] = hoy
    row[11] = ''

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'AGENCIAS!A:L',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    })

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'agencia-nueva', 'AGENCIAS', nombre, `cuit=${cuit||''}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, accion: 'creada' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
