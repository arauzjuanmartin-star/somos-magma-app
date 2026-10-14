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

// Normaliza para comparar el nombre de la pieza con el del archivo:
// "1. Halloween" → "halloween", "Pizza Libre.mp4" → "pizzalibre", "Cena_v2.mov" → "cenav2".
const clave = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\.[a-z0-9]{2,4}$/, '').replace(/^\s*\d+\s*[.)-]\s*/, '').replace(/[^a-z0-9]/g, '')
const sinVersion = k => k.replace(/(v|version|ver)\d+$/, '').replace(/\d+$/, '')

// Devuelve { link, nombre, subido } del archivo de Pre-entregas que corresponde a ESTA pieza, o null.
//
// 14/10/2026, Pani Feroz #2331: la primera versión tomaba "lo más nuevo de Pre-entregas"
// sin saber de qué pieza se trataba, sin entrar a subcarpetas y aceptando fotos. Dani
// subió los videos a Pre-entregas/Videos, sueltas había 70 fotos del fotógrafo, y las 4
// piezas quedaron apuntando a SAN06716.JPG (y al aprobar se habría mandado esa foto a
// Finales). En Pani Cantina #2298 "Mesa" quedó con General.mp4, el video de otra pieza.
// Ahora:
//   · mira Pre-entregas y sus subcarpetas (un nivel: Videos, Fotos)
//   · solo fotos si la pieza es de fotos; si no, solo videos
//   · descarta lo que ya está linkeado en otra pieza (`usados`)
//   · elige por nombre; si nada coincide y queda UN solo candidato, ese
//   · si es ambiguo, null: un campo vacío es mejor que un link equivocado
export async function ultimaVersion({ sheets, SHEET_ID, num, pieza = '', esFoto = false, usados = [] }) {
  try {
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:ET' })
    const rows = r.data.values || [], h = rows[0] || []
    const fila = rows.slice(1).find(x => String(x[h.indexOf('N° presupuesto')] || '').trim() === String(num).trim())
    const entrega = idDeLink(fila?.[h.indexOf('Drive Entrega')])
    if (!entrega) return null

    const drive = getDrive()
    const opts = { includeItemsFromAllDrives: true, supportsAllDrives: true }
    const carp = await drive.files.list({
      q: `'${entrega}' in parents and mimeType='application/vnd.google-apps.folder' and name='${SUB_PRE}' and trashed=false`,
      ...opts, fields: 'files(id)',
    })
    const pre = carp.data.files?.[0]?.id
    if (!pre) return null
    const subs = (await drive.files.list({ q: `'${pre}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`, ...opts, fields: 'files(id)' })).data.files || []

    // Los .prproj y los sueltos de proyecto no cuentan: lo que va a revisión es lo exportado.
    const tipo = esFoto ? "mimeType contains 'image/'" : "mimeType contains 'video/'"
    // Una consulta por carpeta: con "'a' in parents or 'b' in parents" Drive devuelve vacío en unidades compartidas.
    const listas = await Promise.all([pre, ...subs.map(x => x.id)].map(id => drive.files.list({
      q: `'${id}' in parents and trashed=false and ${tipo}`, ...opts,
      pageSize: 200, fields: 'files(id,name,createdTime,webViewLink)',
    })))
    const ya = new Set(usados.map(idDeLink).filter(Boolean))
    const cands = listas.flatMap(l => l.data.files || []).filter(f => !ya.has(f.id))
      .sort((a, b) => String(b.createdTime).localeCompare(String(a.createdTime)))
    if (!cands.length) return null

    const kp = clave(pieza)
    const coinciden = kp ? cands.filter(f => { const kf = clave(f.name), kb = sinVersion(kf); return kf === kp || kb === kp || (kp.length >= 4 && (kf.includes(kp) || kp.includes(kb) && kb.length >= 4)) }) : []
    const f = coinciden[0] || (cands.length === 1 ? cands[0] : null)   // ordenados del más nuevo al más viejo
    if (!f) return null
    return { link: f.webViewLink, nombre: f.name, subido: f.createdTime, cuantos: cands.length, porNombre: !!coinciden.length }
  } catch (e) {
    console.error('ultimaVersion:', e.message)
    return null
  }
}
