// El botón que cierra el circuito: aprobar una pieza y entregarla.
//
// Hace las tres cosas de una, que es el punto — hoy son tres pasos manuales y
// por eso alguno siempre se olvida:
//   1. mueve el archivo de "Pre-entregas" a "Finales"
//   2. le da acceso al cliente a la carpeta Finales (nunca a la del proyecto:
//      en Drive el acceso se hereda hacia abajo y vería los cortes rebotados)
//   3. marca la fila como Entregada con la fecha real
//
// El movimiento funciona porque las dos carpetas viven en la MISMA unidad
// compartida. Probado: mover entre unidades da "permisos insuficientes".

import { google } from 'googleapis'
import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { HEADERS_EDICION, IDX_EDICION, aAR, SUB_PRE, SUB_FIN } from '../../lib/edicion'

const colLetra = c => { let s='', n=c+1; while(n>0){ n--; s=String.fromCharCode(65+(n%26))+s; n=Math.floor(n/26) } return s }
const ULT = colLetra(HEADERS_EDICION.length - 1)
const idDeLink = l => (String(l||'').match(/[-\w]{25,}/) || [])[0] || ''

function getDrive() {
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
  return google.drive({ version: 'v3', auth })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { id, mailsCliente = [], confirmar = false } = req.body || {}
  if (!id) return res.status(400).json({ error: 'Falta el entregable' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `EDICION!A:${ULT}` })
    const rows = r.data.values || [], hE = rows[0] || []
    const cE = n => { const i = hE.indexOf(n); return i === -1 ? IDX_EDICION[n] : i }

    let sheetRow = -1, actual = null
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][cE('ID')] || '').trim() === String(id).trim()) { sheetRow = i + 1; actual = rows[i]; break }
    }
    if (sheetRow === -1) return res.status(404).json({ error: `No existe el entregable ${id}` })

    const num = String(actual[cE('N° presupuesto')] || '').trim()
    const linkPre = String(actual[cE('Link pre-entrega')] || '').trim()
    const fileId = idDeLink(linkPre)

    // La carpeta de entrega del proyecto sale de PROYECTOS
    const rP = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:ET' })
    const pr = rP.data.values || [], hP = pr[0] || []
    const fp = pr.slice(1).find(x => String(x[hP.indexOf('N° presupuesto')] || '').trim() === num)
    const carpetaEntrega = idDeLink(fp?.[hP.indexOf('Drive Entrega')])

    const drive = getDrive()
    let finales = null, aviso = []

    if (carpetaEntrega) {
      const buscar = async nombre => {
        const q = `'${carpetaEntrega}' in parents and mimeType='application/vnd.google-apps.folder' and name='${nombre}' and trashed=false`
        const l = await drive.files.list({ q, includeItemsFromAllDrives: true, supportsAllDrives: true, fields: 'files(id,name,webViewLink)' })
        return l.data.files?.[0] || null
      }
      finales = await buscar(SUB_FIN)
      if (!finales && confirmar) {
        const c = await drive.files.create({ requestBody: { name: SUB_FIN, mimeType: 'application/vnd.google-apps.folder', parents: [carpetaEntrega] }, supportsAllDrives: true, fields: 'id,name,webViewLink' })
        finales = c.data
      }
    }

    // Preview: contar qué va a pasar antes de tocar nada.
    if (!confirmar) {
      return res.json({
        ok: true, preview: true,
        moverArchivo: !!(fileId && finales),
        sinLink: !linkPre,
        sinCarpeta: !carpetaEntrega,
        finales: finales?.webViewLink || null,
        compartirCon: mailsCliente.filter(m => /@/.test(m)),
      })
    }

    // 1. mover el archivo a Finales
    let movido = false
    if (fileId && finales) {
      try {
        const f = await drive.files.get({ fileId, fields: 'parents,name', supportsAllDrives: true })
        const padres = (f.data.parents || []).join(',')
        await drive.files.update({ fileId, addParents: finales.id, removeParents: padres, supportsAllDrives: true, fields: 'id' })
        movido = true
        aviso.push(`"${f.data.name}" pasó a ${SUB_FIN}`)
      } catch (e) { aviso.push(`no se pudo mover el archivo: ${e.message}`) }
    } else if (!linkPre) {
      aviso.push(`no había link de pre-entrega, así que no se movió nada`)
    }

    // 2. dar acceso al cliente SOLO a Finales
    const dados = []
    if (finales) {
      for (const m of (mailsCliente || []).filter(x => /@/.test(x))) {
        try {
          await drive.permissions.create({ fileId: finales.id, requestBody: { type: 'user', role: 'reader', emailAddress: String(m).trim() }, supportsAllDrives: true, sendNotificationEmail: false })
          dados.push(m)
        } catch (e) { aviso.push(`${m}: ${e.message}`) }
      }
    }

    // 3. marcar entregado
    const data = [
      { range: `EDICION!${colLetra(cE('Estado'))}${sheetRow}`, values: [['Entregado']] },
      { range: `EDICION!${colLetra(cE('Actualizado'))}${sheetRow}`, values: [[new Date().toISOString()]] },
      { range: `EDICION!${colLetra(cE('Por'))}${sheetRow}`, values: [[mail]] },
    ]
    if (!String(actual[cE('Fecha entrega')] || '').trim()) {
      data.push({ range: `EDICION!${colLetra(cE('Fecha entrega'))}${sheetRow}`, values: [[aAR(new Date())]] })
    }
    if (finales?.webViewLink) {
      data.push({ range: `EDICION!${colLetra(cE('Link entrega'))}${sheetRow}`, values: [[finales.webViewLink]] })
    }
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data } })

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'edicion-aprobar', 'EDICION', String(id), `entregado${movido ? ' · archivo movido' : ''}${dados.length ? ` · compartido con ${dados.length}` : ''}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, movido, compartido: dados, link: finales?.webViewLink || null, aviso })
  } catch (e) {
    console.error('edicion-aprobar:', e)
    res.status(500).json({ error: e.message })
  }
}
