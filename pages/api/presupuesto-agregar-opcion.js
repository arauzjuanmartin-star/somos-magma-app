// Agregar una opción/variante a un presupuesto existente.
// Convención: el N° presupuesto soporta sufijo de letra (#1957, #1957A, #1957B, #1957C...).
// Ejemplo: si existe '1957' sin letra, al agregar opción → se renombra a '1957A' y se crea '1957B' como copia editable.
// Si ya tiene letras (1957A, 1957B) → crea '1957C' con los datos copiados del original (cliente/proyecto/fecha/PM/contacto/servicios).
//
// El sufijo viaja por todo el pipeline: PROYECTOS, FACTURACION, CALENDAR usan el N° completo.
import { getSheets, withSheetsRetry } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const colLetra = c => { let s='',n=c+1; while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);} return s }
// Parse "1957", "1957A", "1957B" → { base: "1957", letra: "" | "A" | "B" }
const parseNro = s => {
  const m = String(s||'').trim().match(/^(\d+)([A-Z])?$/)
  return m ? { base: m[1], letra: m[2] || '' } : null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { numBase } = req.body
  if (!numBase) return res.status(400).json({ error: 'Falta numBase' })
  const parsed = parseNro(numBase)
  if (!parsed) return res.status(400).json({ error: 'Formato inválido (esperado: 1957 o 1957A)' })
  const base = parsed.base

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const r = await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A:BC' }))
    const rows = r.data.values || []

    // Encontrar TODAS las filas con base coincidente (1957, 1957A, 1957B...)
    const hermanos = []  // {fila, nro, letra, row}
    for (let i = 1; i < rows.length; i++) {
      const p = parseNro(rows[i][0])
      if (p && p.base === base) hermanos.push({ fila: i+1, nro: rows[i][0], letra: p.letra, row: rows[i] })
    }
    if (hermanos.length === 0) return res.status(404).json({ error: `No existe presu #${base}` })

    // El "original" para copiar: el de letra más baja o el sin letra
    hermanos.sort((a,b) => (a.letra||'').localeCompare(b.letra||''))
    const original = hermanos[0]

    // Si el original NO tiene letra → renombrarlo a 'A' antes de crear el nuevo
    let letrasOcupadas = new Set(hermanos.map(h => h.letra).filter(Boolean))
    if (!original.letra) {
      const nuevoNombreOriginal = `${base}A`
      await withSheetsRetry(() => sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `PRESUPUESTOS!A${original.fila}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[nuevoNombreOriginal]] }
      }))
      letrasOcupadas.add('A')
      original.letra = 'A'
      original.nro = nuevoNombreOriginal
      // Propagar el renombrado a PROYECTOS si existe (el original puede estar ya aprobado/en proyectos)
      try {
        const rProy = await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:C' }))
        const proyRows = rProy.data.values || []
        for (let i = 1; i < proyRows.length; i++) {
          if (String(proyRows[i][2]||'').trim() === base) {
            await withSheetsRetry(() => sheets.spreadsheets.values.update({
              spreadsheetId: SHEET_ID,
              range: `PROYECTOS!C${i+1}`,
              valueInputOption: 'USER_ENTERED',
              requestBody: { values: [[nuevoNombreOriginal]] }
            }))
            break
          }
        }
      } catch(e) {}
    }

    // Buscar siguiente letra disponible (A..Z)
    let nuevaLetra = null
    for (let c = 65; c <= 90; c++) {
      const L = String.fromCharCode(c)
      if (!letrasOcupadas.has(L)) { nuevaLetra = L; break }
    }
    if (!nuevaLetra) return res.status(400).json({ error: 'Se acabaron las letras A-Z para este presu' })
    const nuevoNro = `${base}${nuevaLetra}`

    // Construir fila nueva: COPIAR cabecera + servicios del original, RESETEAR estado a EN ESPERA
    const nuevaFila = [...original.row]
    while (nuevaFila.length < 55) nuevaFila.push('')
    nuevaFila[0] = nuevoNro                    // N° presupuesto
    nuevaFila[3] = 'EN ESPERA'                 // Estado
    nuevaFila[9] = new Date().toLocaleDateString('es-AR')  // Fecha Presupuesto (hoy)
    nuevaFila[50] = ''                         // AY Motivo (limpia por las dudas)

    await withSheetsRetry(() => sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'PRESUPUESTOS!A:A',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [nuevaFila] },
    }))

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'LOG!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'presupuesto-agregar-opcion', 'PRESUPUESTOS', nuevoNro, `base=${base} copiado de=${original.nro}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, nuevoNro, base, original: original.nro, letrasOcupadas: [...letrasOcupadas, nuevaLetra].sort() })
  } catch (e) {
    console.error('presupuesto-agregar-opcion:', e)
    res.status(500).json({ error: e.message })
  }
}
