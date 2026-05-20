import { getSheets } from '../../lib/sheets'

const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const mail = req.headers['x-user-email'] || ''
  if (!MAILS.includes(mail)) return res.status(401).json({ error: 'No autorizado' })

  const { nombre, saldoArs, saldo, saldoUsd, notas } = req.body
  if (!nombre) return res.status(400).json({ error: 'Falta nombre' })
  const ars = saldoArs !== undefined ? saldoArs : saldo  // back-compat con llamadas viejas

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'CUENTAS!A:J' })
    const rows = r.data.values || []
    const headers = rows[0] || []
    const idx = {
      nombre: headers.indexOf('Nombre'),
      saldo: headers.indexOf('Saldo actual'),
      fecha: headers.indexOf('Última actualización'),
      notas: headers.indexOf('Notas'),
      usd: headers.indexOf('Saldo USD'),
      hist: headers.indexOf('Hist saldos'),
    }
    const filaIdx = rows.findIndex((row,i) => i>0 && row[idx.nombre] === nombre)
    if (filaIdx === -1) return res.status(404).json({ error: 'Cuenta no encontrada' })

    const fila = filaIdx + 1
    const hoy = new Date().toLocaleDateString('es-AR')
    const hora = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    const updates = []

    if (ars !== undefined && ars !== null) updates.push({ range: `CUENTAS!${colLetra(idx.saldo)}${fila}`, values: [[Number(ars)||0]] })
    if (saldoUsd !== undefined && saldoUsd !== null && idx.usd >= 0) updates.push({ range: `CUENTAS!${colLetra(idx.usd)}${fila}`, values: [[Number(saldoUsd)||0]] })
    updates.push({ range: `CUENTAS!${colLetra(idx.fecha)}${fila}`, values: [[`${hoy} ${hora}`]] })
    if (notas !== undefined && idx.notas >= 0) updates.push({ range: `CUENTAS!${colLetra(idx.notas)}${fila}`, values: [[notas]] })

    if (idx.hist >= 0) {
      const prev = rows[filaIdx][idx.hist] || ''
      const arsVal = ars !== undefined && ars !== null ? Number(ars)||0 : null
      const usd = saldoUsd !== undefined ? Number(saldoUsd)||0 : null
      const linea = `${hoy} ${hora} [${mail.split('@')[0]}]: ${arsVal!==null?'$'+arsVal.toLocaleString('es-AR'):''}${usd?' + USD '+usd:''}`
      const nuevoHist = (prev + (prev?'\n':'') + linea).split('\n').slice(-15).join('\n')
      updates.push({ range: `CUENTAS!${colLetra(idx.hist)}${fila}`, values: [[nuevoHist]] })
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updates }
    })

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'cuenta-saldo-update', 'CUENTAS', nombre, `ars=${saldoArs} usd=${saldoUsd}`]] }
      })
    } catch (e) {}

    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
