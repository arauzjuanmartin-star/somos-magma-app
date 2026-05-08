import { getSheets } from '../../lib/sheets'

const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const mail = req.headers['x-user-email'] || ''
  if (!MAILS.includes(mail)) return res.status(401).json({ error: 'No autorizado' })

  const { fila, revisado, categoria, comercio } = req.body
  if (!fila) return res.status(400).json({ error: 'Falta fila' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'MOVIMIENTOS_TARJETA!1:1' })
    const headers = r.data.values?.[0] || []
    const H = name => headers.indexOf(name)

    const updates = []
    if (revisado !== undefined && H('Revisado') !== -1) updates.push({ range: `MOVIMIENTOS_TARJETA!${colLetra(H('Revisado'))}${fila}`, values: [[revisado ? 'SI' : 'NO']] })
    if (revisado === true && H('Fecha revisado') !== -1) {
      const d = new Date()
      updates.push({ range: `MOVIMIENTOS_TARJETA!${colLetra(H('Fecha revisado'))}${fila}`, values: [[`${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`]] })
    }
    if (categoria !== undefined && H('Categoria') !== -1) updates.push({ range: `MOVIMIENTOS_TARJETA!${colLetra(H('Categoria'))}${fila}`, values: [[categoria]] })
    if (comercio !== undefined && H('Comercio') !== -1) updates.push({ range: `MOVIMIENTOS_TARJETA!${colLetra(H('Comercio'))}${fila}`, values: [[comercio]] })

    if (updates.length === 0) return res.json({ ok: true })
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
    })
    res.json({ ok: true })
  } catch(e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
