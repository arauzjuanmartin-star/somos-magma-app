// ============================ AVISOS AL CELULAR (push) ============================
// Juan, 03/10/2026: "instalá web-push, lo pienso hacer para cuando Felipe me confirme que está para agarrar fijo los
// laburos: le propongo el laburo a varios y el que primero confirma está adentro".
//
// Cómo funciona: el freelancer entra a /mi desde el celular, toca "Activar avisos en este celular" y el navegador nos
// da una SUSCRIPCIÓN (una dirección única de ese celular). La guardamos en la solapa PUSH, una fila por celular. Cuando
// hay algo que avisarle (lo sumaron a un trabajo, se entregó lo que filmó), le mandamos el aviso a esa dirección con
// web-push y el service worker (public/sw.js) lo muestra aunque la app esté cerrada.
//   · Android: anda directo desde Chrome. iPhone: solo después de "Agregar a pantalla de inicio" (iOS 16.4+).
//   · Si el celular dio de baja la suscripción (404/410), la fila queda "Baja" y no se insiste.
// Las claves VAPID (identifican a Magma ante Google/Apple) viven en el entorno: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT. Sin ellas, nada se manda y nada se rompe.

import { canonStaff, canonKey } from './staff.js'

export const HOJA_PUSH = 'PUSH'
export const HEADERS_PUSH = ['ID', 'Persona', 'Mail', 'Creado el', 'Navegador', 'Endpoint', 'Claves', 'Estado', 'Último envío', 'Último error']
export const ESTADO_PUSH = { activa: 'Activa', baja: 'Baja' }
const txt = v => String(v ?? '').trim()
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
const dd = n => String(n).padStart(2, '0')
const ahoraAR = () => { const d = new Date(Date.now() - 3 * 3600e3); return `${dd(d.getUTCDate())}/${dd(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${dd(d.getUTCHours())}:${dd(d.getUTCMinutes())}` }

export const hayPush = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
export const clavePublica = () => process.env.VAPID_PUBLIC_KEY || ''
export const nuevoIdPush = (ahora = Date.now()) => `P-${ahora.toString(36).toUpperCase()}${Math.floor(Math.random() * 36).toString(36).toUpperCase()}`

/** Las suscripciones activas de una persona (por nombre canónico). */
export function suscripcionesDe(filas, persona) {
  const k = canonKey(canonStaff(persona))
  return (filas || []).filter(r => txt(r['ID']) && txt(r['Endpoint']) && !/^baja/i.test(txt(r['Estado'])) && canonKey(canonStaff(r['Persona'])) === k)
}

/**
 * Manda un aviso a todos los celulares de una lista de personas. Lee la solapa PUSH en el momento (no usa cache: una
 * suscripción recién dada de alta tiene que servir ya). Marca "Baja" las que el navegador ya no reconoce.
 * @param {{ sheets, SHEET_ID, personas: string[], titulo, cuerpo, url, tag }} p
 * @returns { mandados: [persona], sinCelular: [persona], fallos: [{persona, error}] }
 */
export async function mandarPush({ sheets, SHEET_ID, personas, titulo, cuerpo, url = '/mi', tag = '' }) {
  const out = { mandados: [], sinCelular: [], fallos: [] }
  if (!hayPush() || !personas?.length) { out.sinCelular = [...(personas || [])]; return out }
  let webpush
  try { webpush = (await import('web-push')).default } catch (e) { out.fallos.push({ persona: '*', error: 'web-push no instalado' }); return out }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:juan@somosmagma.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY)

  let rows = []
  try { rows = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${HOJA_PUSH}!A:${colLetra(HEADERS_PUSH.length - 1)}` })).data.values || [] } catch (e) { out.sinCelular = [...personas]; return out }
  const H = (rows[0] || []).map(txt), col = n => H.indexOf(n)
  if (col('Endpoint') < 0) { out.sinCelular = [...personas]; return out }
  const filas = rows.slice(1).map((r, i) => ({ fila: i + 2, o: Object.fromEntries(H.map((h, j) => [h, r[j] ?? ''])) }))
  const updates = []
  const poner = (fila, campo, valor) => { if (col(campo) >= 0) updates.push({ range: `${HOJA_PUSH}!${colLetra(col(campo))}${fila}`, values: [[valor]] }) }
  const payload = JSON.stringify({ titulo, cuerpo, url, tag: tag || undefined })

  for (const persona of [...new Set(personas.map(txt).filter(Boolean))]) {
    const subs = suscripcionesDe(filas.map(f => f.o), persona).map(o => filas.find(f => f.o === o))
    if (!subs.length) { out.sinCelular.push(persona); continue }
    let alguno = false
    for (const s of subs) {
      let claves = {}
      try { claves = JSON.parse(txt(s.o['Claves']) || '{}') } catch (e) { /* mal guardada */ }
      try {
        await webpush.sendNotification({ endpoint: txt(s.o['Endpoint']), keys: claves }, payload, { TTL: 60 * 60 * 24 })
        alguno = true; poner(s.fila, 'Último envío', ahoraAR()); poner(s.fila, 'Último error', '')
      } catch (e) {
        const code = e.statusCode || 0
        poner(s.fila, 'Último error', `${ahoraAR()} · ${code || ''} ${String(e.body || e.message || '').slice(0, 120)}`.trim())
        if (code === 404 || code === 410) poner(s.fila, 'Estado', ESTADO_PUSH.baja)
        else out.fallos.push({ persona, error: `${code} ${e.message}` })
      }
    }
    if (alguno) out.mandados.push(persona); else if (!out.fallos.some(f => f.persona === persona)) out.sinCelular.push(persona)
  }
  if (updates.length) { try { await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: updates } }) } catch (e) { /* el registro no frena */ } }
  return out
}
