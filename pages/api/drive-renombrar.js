// Le pone la firma de Magma a las fotos entregadas de un proyecto.
//
// Juan descartó pedirle al fotógrafo que firme desde Lightroom ("la sacó él, es
// raro") — la firma la ponemos nosotros al entregar, que es cuando la foto pasa
// a ser una entrega de Magma. El link completo de Instagram no entra en un
// nombre de archivo (las barras son caracteres prohibidos), así que va el usuario.
//
// Solo renombra lo que TODAVÍA no tiene la firma: se puede correr las veces que
// haga falta sin renumerar lo ya entregado.
//
// Siempre devuelve el preview primero. Recién con confirmar:true toca Drive.

import { google } from 'googleapis'
import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { sinTildes, nombreProyecto } from '../../lib/drive'

export const USUARIO_IG = '@somosmagma_ar'
const IMAGEN = /\.(jpe?g|png|tiff?|webp|heic|dng|cr2|nef|arw)$/i

function getDrive() {
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
  return google.drive({ version: 'v3', auth })
}

const idDeLink = l => (String(l || '').match(/[-\w]{25,}/) || [])[0] || ''
const limpio = s => sinTildes(String(s || '')).replace(/[^A-Za-z0-9]+/g, '')

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return

  const { num, confirmar = false } = req.body || {}
  if (!num) return res.status(400).json({ error: 'Falta el N° de presupuesto' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:ET' })
    const rows = r.data.values || [], h = rows[0] || []
    const fila = rows.slice(1).find(x => String(x[h.indexOf('N° presupuesto')] || '').trim() === String(num).trim())
    if (!fila) return res.status(404).json({ error: `No encontré el proyecto #${num}` })

    const cliente = String(fila[h.indexOf('Cliente')] || fila[h.indexOf('Agencia')] || '').trim()
    const proyecto = String(fila[h.indexOf('Proyecto')] || '').trim()
    const carpetaId = idDeLink(fila[h.indexOf('Drive Entrega')])
    if (!carpetaId) return res.status(400).json({ error: 'Este proyecto todavía no tiene carpeta de entrega. Creala primero desde el tablero.' })

    const drive = getDrive()
    // Las fotos pueden estar en la carpeta de entrega o en sus subcarpetas.
    const hijas = await drive.files.list({
      q: `'${carpetaId}' in parents and trashed = false`,
      includeItemsFromAllDrives: true, supportsAllDrives: true,
      fields: 'files(id,name,mimeType)', pageSize: 1000, orderBy: 'name',
    })
    const carpetas = [carpetaId, ...(hijas.data.files || []).filter(f => f.mimeType === 'application/vnd.google-apps.folder').map(f => f.id)]

    let fotos = []
    for (const cid of carpetas) {
      let token
      do {
        const l = await drive.files.list({
          q: `'${cid}' in parents and trashed = false and mimeType contains 'image/'`,
          includeItemsFromAllDrives: true, supportsAllDrives: true,
          fields: 'nextPageToken, files(id,name)', pageSize: 1000, orderBy: 'name', pageToken: token,
        })
        fotos.push(...(l.data.files || []))
        token = l.data.nextPageToken
      } while (token)
    }
    fotos = fotos.filter(f => IMAGEN.test(f.name))

    const base = [limpio(cliente), limpio(nombreProyecto(proyecto))].filter(Boolean).join('_') || `Proyecto${num}`
    const yaFirmadas = fotos.filter(f => f.name.includes(USUARIO_IG))
    const aRenombrar = fotos.filter(f => !f.name.includes(USUARIO_IG))

    // La numeración sigue desde la última ya firmada, para no pisar lo entregado.
    let n = yaFirmadas.reduce((max, f) => {
      const m = f.name.match(/_(\d{3})_/)
      return m ? Math.max(max, parseInt(m[1])) : max
    }, 0)

    const plan = aRenombrar.map(f => {
      n++
      const ext = (f.name.match(/\.[A-Za-z0-9]+$/) || ['.jpg'])[0].toLowerCase()
      return { id: f.id, antes: f.name, despues: `${base}_${String(n).padStart(3, '0')}_${USUARIO_IG}${ext}` }
    })

    if (!confirmar) {
      return res.json({ ok: true, preview: true, total: fotos.length, yaFirmadas: yaFirmadas.length, plan: plan.slice(0, 40), aRenombrar: plan.length })
    }

    let hechos = 0
    const fallos = []
    for (const p of plan) {
      try { await drive.files.update({ fileId: p.id, requestBody: { name: p.despues }, supportsAllDrives: true }); hechos++ }
      catch (e) { fallos.push(`${p.antes}: ${e.message}`) }
    }
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), auth.mail, 'drive-renombrar', 'DRIVE', String(num), `${hechos} fotos firmadas`]] },
      })
    } catch (e) {}

    res.json({ ok: true, renombradas: hechos, fallos })
  } catch (e) {
    console.error('drive-renombrar:', e)
    res.status(500).json({ error: e.message })
  }
}
