import { getServerSession } from 'next-auth/next'
import { authOptions } from '../auth/[...nextauth]'
import { getSheets, getAllData, withSheetsRetry } from '../../../lib/sheets'
import { personaPorMail, PREFIJO_NOTA, sePuedeNotar } from '../../../lib/mi-magma'
import { lineasDeProyecto } from '../../../lib/jornadas'
import { canonStaff, canonKey, STAFF_CANON_MAP } from '../../../lib/staff'
import { HEADERS_EDICION, IDX_EDICION, textoParaElEditor, limpiarPedido, estaCerrado } from '../../../lib/edicion'
import { mailDe, mandarAviso } from '../../../lib/edicion-avisos'
import { mailInternoDe } from '../../../lib/roles'

// Mi Magma: el que filmó le deja una nota a la editora. Pedido de los chicos del 18/9/2026 y de Juan el 03/10:
// "a veces en el lugar les dicen cosas (la productora, la marca) que nunca se comunican".
//
// La nota va a la BITÁCORA de edición del trabajo (columna Notas de cada pieza de ese N° en EDICION, arriba de
// todo, como "[03/10 Lucho] 🎬 texto") y le llega por mail a la editora; si todavía no hay editora, al PM. Así queda
// donde la editora ya mira (la ficha del tablero y el brief que se copia), no en un lado nuevo.
// En EDICION NUNCA se agregan filas desde acá: solo se escribe en las que existen. Si el trabajo todavía no tiene
// piezas en el tablero, se avisa y no se guarda nada.
//
// Misma regla que /api/mi/ticket: la persona sale del MAIL DE LA SESIÓN cruzado con RRHH, y el trabajo tiene que ser
// suyo (se vuelve a buscar en PROYECTOS).

const APP = process.env.NEXTAUTH_URL || 'https://somos-magma-app.vercel.app'
const txt = v => String(v ?? '').trim()
const dd = n => String(n).padStart(2, '0')
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
const fechaAR = s => { const m = txt(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (!m) return null; let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1]) }
const apodoDe = nombre => { const k = Object.keys(STAFF_CANON_MAP).find(a => STAFF_CANON_MAP[a] === nombre && !a.includes(' ')); return k ? k[0].toUpperCase() + k.slice(1) : txt(nombre).split(' ')[0] }
const ULT_COL = colLetra(HEADERS_EDICION.length - 1)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Solo para dejar una nota' })
  const session = await getServerSession(req, res, authOptions)
  const mail = session?.user?.email?.toLowerCase()?.trim()
  if (!mail) return res.status(401).json({ ok: false, error: 'No autorizado' })

  const { num: nro, slot, texto } = req.body || {}
  const nota = String(texto || '').replace(/\s+/g, ' ').trim().slice(0, 500)
  if (!txt(nro) || !Number.isInteger(slot)) return res.status(400).json({ ok: false, error: 'No sé de qué trabajo es la nota. Actualizá la página.' })
  if (nota.length < 3) return res.status(400).json({ ok: false, error: 'Escribí la nota' })

  try {
    const data = await getAllData()
    const fila = personaPorMail(data.rrhh, mail)
    if (!fila) return res.status(403).json({ ok: false, error: 'Tu mail no tiene acceso a Mi Magma. Pedíselo a administración.' })
    const persona = canonStaff(txt(fila['Nombre Apellido'])), yo = canonKey(persona), apodo = apodoDe(persona)

    const p = (data.proyectos || []).find(x => txt(x['N° presupuesto']) === txt(nro))
    const linea = p ? lineasDeProyecto(p).find(l => l.slot === slot && l.key === yo) : null
    if (!linea) return res.status(403).json({ ok: false, error: 'Ese trabajo no figura a tu nombre. Actualizá la página y probá de nuevo.' })
    const ahora = new Date(Date.now() - 3 * 3600e3)   // hora de Argentina
    const hoy0 = new Date(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate())
    if (!sePuedeNotar(fechaAR(linea.fecha), hoy0)) return res.status(400).json({ ok: false, error: 'Ese trabajo ya es muy viejo para dejarle una nota. Escribile a tu PM.' })

    // Las piezas de ese trabajo en el tablero, leídas de nuevo: la nota va arriba de la bitácora de cada una.
    const { sheets, SHEET_ID } = await getSheets()
    const rows = (await withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `EDICION!A:${ULT_COL}` }))).data.values || []
    const hE = rows[0] || [], cE = n => { const i = hE.indexOf(n); return i === -1 ? IDX_EDICION[n] : i }
    const piezas = rows.map((r, i) => ({ i, r })).filter(x => x.i > 0 && txt(x.r[cE('ID')]) && txt(x.r[cE('N° presupuesto')]) === txt(nro))
    if (!piezas.length) return res.status(409).json({ ok: false, error: 'La edición de este trabajo todavía no está armada en el tablero. Mandale la nota a tu PM por mensaje.' })

    const linea1 = `[${dd(hoy0.getDate())}/${dd(hoy0.getMonth() + 1)} ${apodo}] ${PREFIJO_NOTA} ${nota}`
    // Dos toques del mismo botón, o la misma nota mandada dos veces: no se repite.
    if (piezas.every(x => txt(x.r[cE('Notas')]).split('\n')[0].trim() === linea1)) return res.json({ ok: true, repetido: true, nota: { cuando: linea1.slice(1, 6), texto: nota } })

    const updates = []
    for (const x of piezas) {
      const notas = txt(x.r[cE('Notas')])
      updates.push({ range: `EDICION!${colLetra(cE('Notas'))}${x.i + 1}`, values: [[linea1 + (notas ? '\n' + notas : '')]] })
      updates.push({ range: `EDICION!${colLetra(cE('Actualizado'))}${x.i + 1}`, values: [[new Date().toISOString()]] })
      updates.push({ range: `EDICION!${colLetra(cE('Por'))}${x.i + 1}`, values: [[mail]] })
    }
    await withSheetsRetry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: updates } }))
    try { await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), mail, 'mi-nota', 'EDICION', txt(nro), `${persona}: ${nota}`]] } }) } catch (e) { /* el log no frena */ }

    // El mail: a la editora de cada pieza (si hay varias, a todas); si ninguna tiene editora, al PM. Un solo mail.
    const filas = piezas.map(x => { const f = {}; hE.forEach((h, i) => { f[h] = x.r[i] ?? '' }); f.Notas = linea1 + (txt(f.Notas) ? '\n' + f.Notas : ''); return f })
    const abiertas = filas.filter(f => !estaCerrado(f.Estado)), paraEditor = (abiertas.length ? abiertas : filas)
    const editores = [...new Set(paraEditor.map(f => mailInternoDe(f.Editor) || mailDe(f.Editor, data.rrhh)).filter(Boolean))]
    const pm = txt(p['PM']) || txt(filas[0].PM)
    const para = editores.length ? editores : [mailInternoDe(pm) || mailDe(pm, data.rrhh) || 'juan@somosmagma.com']
    const titulo = [txt(p['Cliente']) || txt(p['Agencia']), txt(p['Proyecto'])].filter(Boolean).join(' · ')
    const cuerpo = [
      `${persona} (${limpiarPedido(linea.pedido)}, ${linea.fecha}) dejó una nota del rodaje para la edición de este trabajo:`,
      '', `"${nota}"`, '',
      `Quedó arriba de la bitácora de ${piezas.length === 1 ? 'la pieza' : `las ${piezas.length} piezas`}: ${filas.map(f => limpiarPedido(f.Entregable)).join(', ')}.`,
      '', 'ABRIRLO EN EL TABLERO', `${APP}/?e=${encodeURIComponent(txt(filas[0].ID))}`,
      '', '———————————————————————', 'EL TRABAJO, COMPLETO', '', textoParaElEditor(filas[0]),
    ].join('\n')
    const env = await mandarAviso({ para: para.join(', '), asunto: `Nota del rodaje: ${apodo} · #${txt(nro)} ${titulo}`, cuerpo })

    res.json({ ok: true, nota: { cuando: linea1.slice(1, 6), texto: nota }, avisados: env.ok ? para : [], aQuien: editores.length ? 'editora' : 'pm' })
  } catch (e) {
    console.error('mi/nota:', e)
    res.status(500).json({ ok: false, error: 'No se pudo guardar la nota. Probá de nuevo en un minuto.' })
  }
}
