// Las fotos de un proyecto: cuántas hay subidas, dónde cayeron, y el botón que las
// deja listas para el cliente (a Finales/Fotos + la firma de Magma + el link).
//
// Por qué existe (18/9/2026): el firmado vivía escondido adentro de "Compartir…" y
// no lo usó nadie nunca — 1.267 fotos entregadas en 6 proyectos, 0 firmadas. Y el
// fotógrafo subía donde podía: ninguna cayó en Finales, 4 proyectos las tenían en una
// carpeta "Fotos" hecha a mano y 2 sueltas en la raíz. Así que acá no se le pide a
// nadie que suba "bien": se buscan las fotos donde estén y se acomodan (lib/fotos.js).
//
// Sin confirmar:true devuelve solo el estado y el plan. Con confirmar:true trabaja
// de a tandas (el front vuelve a llamar hasta que faltan = 0): 250 fotos no entran
// en un solo request de Vercel.

import { google } from 'googleapis'
import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { mirarFotos, acomodarFotos } from '../../lib/fotos'

export const config = { maxDuration: 60 }
const TANDA_MS = 42000   // cuánto trabaja una tanda antes de devolverle el control al front

function getDrive() {
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
  return google.drive({ version: 'v3', auth })
}

const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  // Un freelancer de edición ve solo lo suyo: no acomoda las entregas de los clientes.
  if (auth.soloLoSuyo) return res.status(403).json({ error: 'No tenés acceso a esta parte de la app' })

  const { num, confirmar = false } = req.body || {}
  if (!num) return res.status(400).json({ error: 'Falta el N° de presupuesto' })
  const t0 = Date.now()

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:FZ' })
    const rows = r.data.values || [], h = rows[0] || []
    const iNum = h.indexOf('N° presupuesto')
    const iFila = rows.findIndex((x, i) => i > 0 && String(x[iNum] || '').trim() === String(num).trim())
    if (iFila < 0) return res.status(404).json({ error: `No encontré el proyecto #${num}` })
    const fila = rows[iFila]

    const drive = getDrive()
    const { estado, plan, ctx } = await mirarFotos({ drive, h, fila, num })
    if (!confirmar || !plan.length) return res.json({ ...estado, preview: !confirmar, hechas: 0 })

    const hecho = await acomodarFotos({ drive, plan, ctx, hasta: t0 + TANDA_MS })

    // Si el proyecto no tenía "Drive Finales" (las fotos estaban sueltas), ahora sí hay
    // un link para el cliente: se anota, que es lo que usa "Copiar para el cliente".
    const iFin = h.indexOf('Drive Finales')
    if (iFin > -1 && !String(fila[iFin] || '').trim()) {
      try {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID, range: `PROYECTOS!${colLetra(iFin)}${iFila + 1}`, valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[hecho.linkCliente]] },
        })
        hecho.finalesNueva = true
      } catch (e) { /* el link se puede completar después; las fotos ya están */ }
    }
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), auth.mail, 'drive-fotos', 'DRIVE', String(num), `${hecho.hechas} fotos a ${estado.destino} y firmadas${hecho.faltan ? ` (faltan ${hecho.faltan})` : ''}${hecho.fallos.length ? ` · ${hecho.fallos.length} con error` : ''}`]] },
      })
    } catch (e) {}

    // El front vuelve a llamar mientras faltan > 0 (y corta si una tanda no hizo nada).
    res.json({ ok: true, preview: false, hechas: hecho.hechas, faltan: hecho.faltan, fallos: hecho.fallos.slice(0, 10), finalesNueva: hecho.finalesNueva, total: estado.total })
  } catch (e) {
    console.error('drive-fotos:', e)
    res.status(500).json({ error: e.message })
  }
}
