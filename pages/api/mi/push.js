import { getServerSession } from 'next-auth/next'
import { authOptions } from '../auth/[...nextauth]'
import { getSheets, getAllData, withSheetsRetry } from '../../../lib/sheets'
import { personaPorMail } from '../../../lib/mi-magma'
import { canonStaff } from '../../../lib/staff'
import { HOJA_PUSH, HEADERS_PUSH, ESTADO_PUSH, nuevoIdPush, hayPush, mandarPush } from '../../../lib/push'

// Mi Magma: el celular de un freelancer se da de alta (o de baja) para recibir avisos (ver lib/push.js).
//   alta    { suscripcion: {endpoint, keys}, navegador }  → una fila en PUSH (si ese endpoint ya está, se reactiva)
//   baja    { endpoint }                                   → la fila queda "Baja"
//   prueba  {}                                             → le manda un aviso de prueba a sus celulares
// La persona sale del MAIL DE LA SESIÓN cruzado con RRHH, como en el resto de /api/mi.

const txt = v => String(v ?? '').trim()
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
const dd = n => String(n).padStart(2, '0')
const texto = v => { const s = txt(v); return s ? `'${s}` : '' }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Solo POST' })
  const session = await getServerSession(req, res, authOptions)
  const mail = session?.user?.email?.toLowerCase()?.trim()
  if (!mail) return res.status(401).json({ ok: false, error: 'No autorizado' })
  if (!hayPush()) return res.status(503).json({ ok: false, error: 'Los avisos al celular todavía no están configurados. Avisale a Juan.' })

  const { accion, suscripcion, navegador = '', endpoint: ep } = req.body || {}
  try {
    const data = await getAllData()
    const fila = personaPorMail(data.rrhh, mail)
    if (!fila) return res.status(403).json({ ok: false, error: 'Tu mail no tiene acceso a Mi Magma.' })
    const persona = canonStaff(txt(fila['Nombre Apellido']))
    const { sheets, SHEET_ID } = await getSheets()
    const rango = `${HOJA_PUSH}!A:${colLetra(HEADERS_PUSH.length - 1)}`
    let rows = []
    try { rows = (await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: rango }))).data.values || [] } catch (e) { /* no existe */ }
    const H = (rows[0] || []).map(txt), col = n => H.indexOf(n)
    if (HEADERS_PUSH.some(h => col(h) < 0)) return res.status(503).json({ ok: false, error: 'Todavía no se pueden activar los avisos. Avisale a Juan.' })
    const ahora = new Date(Date.now() - 3 * 3600e3)
    const cuando = `${dd(ahora.getUTCDate())}/${dd(ahora.getUTCMonth() + 1)}/${ahora.getUTCFullYear()} ${dd(ahora.getUTCHours())}:${dd(ahora.getUTCMinutes())}`

    if (accion === 'alta') {
      const endpoint = txt(suscripcion?.endpoint), keys = suscripcion?.keys || {}
      if (!/^https:\/\//.test(endpoint) || !txt(keys.p256dh) || !txt(keys.auth)) return res.status(400).json({ ok: false, error: 'El navegador no devolvió una suscripción válida. Probá de nuevo.' })
      const existente = rows.findIndex((r, i) => i > 0 && txt(r[col('Endpoint')]) === endpoint)
      if (existente > 0) {
        await withSheetsRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: [
          { range: `${HOJA_PUSH}!${colLetra(col('Estado'))}${existente + 1}`, values: [[ESTADO_PUSH.activa]] },
          { range: `${HOJA_PUSH}!${colLetra(col('Claves'))}${existente + 1}`, values: [[texto(JSON.stringify({ p256dh: keys.p256dh, auth: keys.auth }))]] },
          { range: `${HOJA_PUSH}!${colLetra(col('Último error'))}${existente + 1}`, values: [['']] },
        ] } }))
      } else {
        const dato = { 'ID': nuevoIdPush(), 'Persona': texto(persona), 'Mail': texto(mail), 'Creado el': texto(cuando), 'Navegador': texto(String(navegador).slice(0, 120)), 'Endpoint': texto(endpoint), 'Claves': texto(JSON.stringify({ p256dh: keys.p256dh, auth: keys.auth })), 'Estado': ESTADO_PUSH.activa, 'Último envío': '', 'Último error': '' }
        await withSheetsRetry(() => sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: rango, valueInputOption: 'USER_ENTERED', requestBody: { values: [H.map(h => (h in dato ? dato[h] : ''))] } }))
      }
      try { await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), mail, 'mi-push', HOJA_PUSH, 'alta', `${persona} · ${String(navegador).slice(0, 60)}`]] } }) } catch (e) { /* el log no frena */ }
      // El primer aviso, ya: así la persona ve que anda y sabe cómo se ve.
      const r = await mandarPush({ sheets, SHEET_ID, personas: [persona], titulo: 'Mi Magma', cuerpo: 'Listo: por acá te van a llegar los avisos de tus trabajos.', url: '/mi', tag: 'prueba' })
      return res.json({ ok: true, prueba: r.mandados.length > 0 })
    }
    if (accion === 'baja') {
      const i = rows.findIndex((r, i) => i > 0 && txt(r[col('Endpoint')]) === txt(ep))
      if (i > 0) await withSheetsRetry(() => sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${HOJA_PUSH}!${colLetra(col('Estado'))}${i + 1}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[ESTADO_PUSH.baja]] } }))
      return res.json({ ok: true })
    }
    if (accion === 'prueba') {
      const r = await mandarPush({ sheets, SHEET_ID, personas: [persona], titulo: 'Mi Magma', cuerpo: 'Aviso de prueba: así te van a llegar.', url: '/mi', tag: 'prueba' })
      return res.json({ ok: true, mandado: r.mandados.length > 0, fallos: r.fallos })
    }
    return res.status(400).json({ ok: false, error: 'No entendí la acción' })
  } catch (e) {
    console.error('mi/push:', e)
    res.status(500).json({ ok: false, error: 'No se pudo guardar. Probá de nuevo en un minuto.' })
  }
}
