// Busca sola la versión que subió el editor.
//
// Antes había que pegar el link a mano, que es pedirle a alguien que copie una
// dirección de Drive justo cuando terminó de exportar. Si el archivo está en la
// carpeta de Pre-entregas del proyecto, la app lo encuentra: toma el más nuevo.
//
// Si hay varios (v1, v2, v3), el más reciente es el que se está mandando a
// revisar — que es exactamente lo que queremos.

import { google } from 'googleapis'
import { SUB_PRE } from './edicion.js'

const idDeLink = l => (String(l || '').match(/[-\w]{25,}/) || [])[0] || ''

function getDrive() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })
  return google.drive({ version: 'v3', auth })
}

// Devuelve { link, nombre, subido } del archivo más nuevo de Pre-entregas, o null.
export async function ultimaVersion({ sheets, SHEET_ID, num }) {
  try {
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:ET' })
    const rows = r.data.values || [], h = rows[0] || []
    const fila = rows.slice(1).find(x => String(x[h.indexOf('N° presupuesto')] || '').trim() === String(num).trim())
    const entrega = idDeLink(fila?.[h.indexOf('Drive Entrega')])
    if (!entrega) return null

    const drive = getDrive()
    const carp = await drive.files.list({
      q: `'${entrega}' in parents and mimeType='application/vnd.google-apps.folder' and name='${SUB_PRE}' and trashed=false`,
      includeItemsFromAllDrives: true, supportsAllDrives: true, fields: 'files(id)',
    })
    const pre = carp.data.files?.[0]?.id
    if (!pre) return null

    // El más nuevo primero. Los .prproj y los sueltos de proyecto no cuentan:
    // lo que va a revisión es el video o la imagen exportada.
    const l = await drive.files.list({
      q: `'${pre}' in parents and trashed=false and (mimeType contains 'video/' or mimeType contains 'image/')`,
      includeItemsFromAllDrives: true, supportsAllDrives: true,
      orderBy: 'createdTime desc', pageSize: 5,
      fields: 'files(id,name,createdTime,webViewLink)',
    })
    const f = l.data.files?.[0]
    if (!f) return null
    return { link: f.webViewLink, nombre: f.name, subido: f.createdTime, cuantos: l.data.files.length }
  } catch (e) {
    console.error('ultimaVersion:', e.message)
    return null
  }
}
