import { getSheets, withSheetsRetry } from '../../lib/sheets'

const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']
const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const mail = req.headers['x-user-email'] || ''
  if (!MAILS.includes(mail)) return res.status(401).json({ error: 'No autorizado' })

  const { nombreOriginal, agenciaOriginal, cambios } = req.body
  if (!nombreOriginal || !cambios) return res.status(400).json({ error: 'Falta nombreOriginal o cambios' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Contactos/agencias!A:H' }))
    const rows = r.data.values
    // Headers: Nombre | Mail | Agencia | PM | Cargo | Teléfono | Notas | Cuit
    const norm = v => String(v||'').trim().toLowerCase()
    let filaTarget = -1
    for (let i = 1; i < rows.length; i++) {
      if (norm(rows[i][0]) === norm(nombreOriginal) && (!agenciaOriginal || norm(rows[i][2]) === norm(agenciaOriginal))) {
        filaTarget = i + 1; break
      }
    }
    if (filaTarget === -1) return res.status(404).json({ error: 'Contacto no encontrado' })

    const colMap = { nombre: 0, mail: 1, agencia: 2, cargo: 4, telefono: 5, cuit: 7 }
    const updates = []
    Object.entries(cambios).forEach(([k, v]) => {
      const col = colMap[k]
      if (col !== undefined) updates.push({ range: `Contactos/agencias!${colLetra(col)}${filaTarget}`, values: [[v]] })
    })

    if (updates.length === 0) return res.json({ ok: true, msg: 'Nada para actualizar' })

    await withSheetsRetry(() => sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updates }
    }))

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'contacto-editar', 'Contactos/agencias', nombreOriginal, `campos=${Object.keys(cambios).join(',')}`]] },
      })
    } catch (e) {}

    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    const status = e.code || e.response?.status
    if (status === 429) return res.status(429).json({ error: 'Google está limitando. Esperá 30s.' })
    res.status(500).json({ error: e.message })
  }
}
