import { getSheets, COL_SEGUIMIENTO, HEADERS_SEGUIMIENTO, DIAS_SEGUIMIENTO } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

// Anota que se habló con el cliente de un presupuesto en espera.
// Escribe en PRESUPUESTOS (por nombre de header, no por posición):
//   Último contacto = hoy · Próximo paso = qué pasó y qué sigue · Seguir el = cuándo volver a llamar
// y deja una línea en LOG, que es el historial de todos los contactos de ese presupuesto.
// La diaria de las 8 lee estas columnas para armar "hoy te toca llamar" (lib/brief.mjs).
//
// body: { num, fila?, proximoPaso, seguirEl (dd/mm/yyyy, opcional: default hoy + DIAS_SEGUIMIENTO) }
// `fila` es el __row del presupuesto: hay N° repetidos (#1833 x4) y buscar solo por número
// puede pegarle a la fila equivocada.

const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
const p2 = n => String(n).padStart(2, '0')
const ddmmyyyy = d => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`
// Vercel corre en UTC: "hoy" tiene que ser el de Buenos Aires
const hoyAR = () => { const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' })); d.setHours(0, 0, 0, 0); return d }
const esFecha = s => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(s || '').trim())

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail
  const { num, fila, proximoPaso, seguirEl } = req.body || {}
  if (!num) return res.status(400).json({ error: 'Falta num' })
  const paso = String(proximoPaso || '').trim()
  if (!paso) return res.status(400).json({ error: 'Anotá qué pasó (aunque sea "sin respuesta")' })
  if (seguirEl && !esFecha(seguirEl)) return res.status(400).json({ error: 'La fecha de "Seguir el" tiene que ser dd/mm/aaaa' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A:DS' })
    const rows = r.data.values || []
    const headers = rows[0] || []

    // Las columnas tienen que existir con su nombre: si no están, hay que correr el script, no adivinar la posición.
    const idx = HEADERS_SEGUIMIENTO.map(h => headers.indexOf(h))
    if (idx.some(i => i === -1)) return res.status(500).json({ error: 'A PRESUPUESTOS le faltan las columnas de seguimiento. Correr: node scripts/presupuestos-columnas-seguimiento.mjs --escribir' })
    if (idx[0] !== COL_SEGUIMIENTO) console.warn(`presupuesto-seguimiento: "Último contacto" está en ${colLetra(idx[0])}, lib/slots.js dice ${colLetra(COL_SEGUIMIENTO)}. Se escribe por nombre igual.`)

    let filaTarget = -1
    if (fila && rows[fila - 1] && String(rows[fila - 1][0] || '').trim() === String(num).trim()) filaTarget = Number(fila)
    else for (let i = 1; i < rows.length; i++) if (String(rows[i][0] || '').trim() === String(num).trim()) { filaTarget = i + 1; break }
    if (filaTarget === -1) return res.status(404).json({ error: 'Presupuesto no encontrado' })

    const hoy = hoyAR()
    let seguir = String(seguirEl || '').trim()
    if (!seguir) { const d = new Date(hoy); d.setDate(d.getDate() + DIAS_SEGUIMIENTO); seguir = ddmmyyyy(d) }
    const valores = [ddmmyyyy(hoy), paso, seguir]

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { valueInputOption: 'USER_ENTERED', data: valores.map((v, i) => ({ range: `PRESUPUESTOS!${colLetra(idx[i])}${filaTarget}`, values: [[v]] })) },
    })

    // El historial completo de contactos vive en LOG (una línea por vez que se habló).
    const quien = String(mail || '').split('@')[0]
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'seguimiento', 'PRESUPUESTOS', String(num), `${paso} · seguir el ${seguir} · ${quien}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, fila: filaTarget, ultimoContacto: valores[0], proximoPaso: paso, seguirEl: seguir })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
