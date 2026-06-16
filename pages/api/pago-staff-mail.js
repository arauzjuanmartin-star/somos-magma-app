import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

// Marca "Mail Enviado" en las filas de PAGOS_STAFF de una persona (por N° de proyecto).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const { persona, nros } = req.body || {}
  if (!persona) return res.status(400).json({ error: 'Falta persona' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PAGOS_STAFF!A:N' })
    const rows = r.data.values || []
    const H = rows[0] || []
    const norm = v => String(v||'').trim().toLowerCase()
    const iFre = H.indexOf('Freelancer') !== -1 ? H.indexOf('Freelancer') : 1
    const iNro = H.indexOf('N° Presupuesto') !== -1 ? H.indexOf('N° Presupuesto') : 3
    const iMail = H.indexOf('Mail Enviado') !== -1 ? H.indexOf('Mail Enviado') : 12
    const setNros = new Set((nros||[]).map(n => String(n).trim()))
    const now = new Date(); const hoy = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()}`
    const updates = []
    for (let i = 1; i < rows.length; i++) {
      const matchPersona = norm(rows[i][iFre]) === norm(persona)
      const matchNro = setNros.size === 0 || setNros.has(String(rows[i][iNro]||'').trim())
      if (matchPersona && matchNro) updates.push({ range: `PAGOS_STAFF!${colLetra(iMail)}${i+1}`, values: [[`SÍ ${hoy}`]] })
    }
    if (updates.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'RAW', data: updates } })
    res.json({ ok: true, marcadas: updates.length })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
