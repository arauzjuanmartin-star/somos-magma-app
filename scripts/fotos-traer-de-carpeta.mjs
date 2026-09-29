// El fotógrafo subió las fotos a SU Drive (o a cualquier carpeta que no es la del proyecto)
// y el botón "🖼 Fotos" de la app no las ve, porque mira la carpeta de entrega.
// Esto las COPIA a Pre-entregas del proyecto. No mueve ni borra nada del origen: entre
// un Drive personal y la unidad ENTREGAS CLIENTES no se puede mover, solo copiar.
// Después se firman con el botón de la app o con scripts/fotos-proyecto.mjs.
//
//   node scripts/fotos-traer-de-carpeta.mjs 2303 <link o id de la carpeta>              → preview
//   node scripts/fotos-traer-de-carpeta.mjs 2303 <link o id de la carpeta> --escribir   → copia
//
// Se puede correr de nuevo: lo que ya está en la carpeta del proyecto (mismo contenido,
// aunque tenga otro nombre) no se vuelve a copiar.

import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('='); let v = l.slice(i + 1).trim()
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    return [l.slice(0, i).trim(), v]
  })
)
const ESCRIBIR = process.argv.includes('--escribir')
const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
const num = args.find(a => /^\d+$/.test(a))
const idDeLink = l => (String(l || '').match(/[-\w]{25,}/) || [])[0] || ''
const ORIGEN = idDeLink(args.find(a => a !== num))
if (!num || !ORIGEN) { console.log('Uso: node scripts/fotos-traer-de-carpeta.mjs <N° presupuesto> <link o id de la carpeta> [--escribir]'); process.exit(1) }

const auth = new google.auth.GoogleAuth({
  credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
  scopes: ['https://www.googleapis.com/auth/spreadsheets', ESCRIBIR ? 'https://www.googleapis.com/auth/drive' : 'https://www.googleapis.com/auth/drive.readonly'],
})
const sheets = google.sheets({ version: 'v4', auth }), drive = google.drive({ version: 'v3', auth })
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const CARPETA = 'application/vnd.google-apps.folder'
const IMAGEN = /\.(jpe?g|png|tiff?|webp|heic|dng|cr2|cr3|nef|arw|raf)$/i
const EN_PARALELO = 4
const orden = (a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })
const mb = n => (n / 1e6).toFixed(0)

async function hijos(id) {
  const out = []; let pageToken
  do {
    const r = await drive.files.list({
      q: `'${id}' in parents and trashed = false`,
      includeItemsFromAllDrives: true, supportsAllDrives: true,
      fields: 'nextPageToken, files(id,name,mimeType,size,md5Checksum)', pageSize: 1000, pageToken,
    })
    out.push(...(r.data.files || [])); pageToken = r.data.nextPageToken
  } while (pageToken)
  return out
}
// Todas las imágenes de una carpeta y sus subcarpetas. Los "._nombre" son basura que
// deja macOS al copiar desde un disco exFAT: pesan 4 KB y no son fotos.
async function imagenes(raizId) {
  const carpetas = [{ id: raizId, ruta: '', nivel: 0 }], fotos = [], basura = []
  for (let i = 0; i < carpetas.length && i < 80; i++) {
    const c = carpetas[i]
    for (const f of await hijos(c.id)) {
      if (f.mimeType === CARPETA) { if (c.nivel < 4) carpetas.push({ id: f.id, name: f.name, ruta: c.ruta ? `${c.ruta}/${f.name}` : f.name, nivel: c.nivel + 1, padre: c.id }) }
      else if (f.name.startsWith('._')) basura.push(f)
      else if (IMAGEN.test(f.name)) fotos.push({ ...f, ruta: c.ruta })
    }
  }
  return { carpetas, fotos, basura }
}
async function conReintento(fn) {
  for (let i = 0; ; i++) {
    try { return await fn() }
    catch (e) {
      const c = e?.code || e?.response?.status
      if (i >= 3 || ![403, 429, 500, 503].includes(c)) throw e
      await new Promise(r => setTimeout(r, 600 * 2 ** i))
    }
  }
}

// ---- el proyecto
const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:FZ' })
const rows = r.data.values || [], h = rows[0] || []
const fila = rows.find((x, i) => i > 0 && String(x[h.indexOf('N° presupuesto')] || '').trim() === num)
if (!fila) { console.log(`#${num}: no está en PROYECTOS`); process.exit(1) }
const raizId = idDeLink(fila[h.indexOf('Drive Entrega')])
if (!raizId) { console.log(`#${num}: no tiene carpeta de entrega (Drive Entrega vacío). Crearla desde la app con "Crear carpetas".`); process.exit(1) }

const metaOrigen = (await drive.files.get({ fileId: ORIGEN, fields: 'name,owners(emailAddress)', supportsAllDrives: true })).data
const metaRaiz = (await drive.files.get({ fileId: raizId, fields: 'name', supportsAllDrives: true })).data
const delProyecto = await imagenes(raizId)
const pre = delProyecto.carpetas.find(c => c.nivel === 1 && /^pre[- ]?entregas$/i.test(c.name))
const origen = await imagenes(ORIGEN)

// ---- qué se copia
const yaEsta = new Set(delProyecto.fotos.map(f => f.md5Checksum))
// De dos archivos con el mismo contenido queda el de nombre más limpio ("Foto-39.jpg" antes que "Foto-39 (1).jpg")
const candidatas = [...origen.fotos].sort((a, b) => a.name.length - b.name.length || orden(a.name, b.name))
const vistos = new Set(), repetidas = [], yaCopiadas = [], aCopiar = []
for (const f of candidatas) {
  if (vistos.has(f.md5Checksum)) { repetidas.push(f); continue }
  vistos.add(f.md5Checksum)
  if (yaEsta.has(f.md5Checksum)) yaCopiadas.push(f); else aCopiar.push(f)
}
aCopiar.sort((a, b) => orden(a.ruta, b.ruta) || orden(a.name, b.name))
const conSub = aCopiar.some(f => f.ruta)

console.log(`\n#${num} ${fila[h.indexOf('Cliente')] || ''} — ${fila[h.indexOf('Proyecto')] || ''}`)
console.log(`  origen:  "${metaOrigen.name}" (de ${metaOrigen.owners?.[0]?.emailAddress || 'una unidad compartida'})`)
console.log(`           ${origen.fotos.length} fotos, ${mb(origen.fotos.reduce((a, f) => a + Number(f.size || 0), 0))} MB${origen.basura.length ? ` · ${origen.basura.length} archivos "._" que no son fotos (se ignoran)` : ''}`)
console.log(`  destino: ${metaRaiz.name} / Pre-entregas${pre ? '' : '  (no existe: se crea)'}`)
console.log(`  en el proyecto ya hay ${delProyecto.fotos.length} fotos`)
if (repetidas.length) console.log(`  subidas dos veces, va una sola: ${repetidas.map(f => f.name).join(', ')}`)
if (yaCopiadas.length) console.log(`  ya estaban en el proyecto: ${yaCopiadas.length}`)
console.log(`  A COPIAR: ${aCopiar.length} fotos, ${mb(aCopiar.reduce((a, f) => a + Number(f.size || 0), 0))} MB`)
;[...aCopiar.slice(0, 3), ...(aCopiar.length > 4 ? [null] : []), ...aCopiar.slice(-1)].forEach(f => console.log(f ? `    ${f.ruta ? f.ruta + '/' : ''}${f.name}` : '    …'))
if (conSub) console.log(`  conserva las subcarpetas: ${[...new Set(aCopiar.map(f => f.ruta).filter(Boolean))].join(', ')}`)

if (!ESCRIBIR) { console.log('\n(preview — no se tocó nada. Con --escribir las copia.)'); process.exit(0) }
if (!aCopiar.length) { console.log('\nNada para copiar.'); process.exit(0) }

// ---- copiar
const crear = async (nombre, padre) => (await drive.files.create({ requestBody: { name: nombre, mimeType: CARPETA, parents: [padre] }, fields: 'id', supportsAllDrives: true })).data.id
const preId = pre ? pre.id : await crear('Pre-entregas', raizId)
const subId = {}
for (const ruta of [...new Set(aCopiar.map(f => f.ruta).filter(Boolean))].sort(orden)) {
  let padre = preId, acum = ''
  for (const tramo of ruta.split('/')) {
    acum = acum ? `${acum}/${tramo}` : tramo
    if (!subId[acum]) subId[acum] = await crear(tramo, padre)
    padre = subId[acum]
  }
}
let hechas = 0
const fallos = [], cola = [...aCopiar]
const uno = async f => {
  try {
    const c = await conReintento(() => drive.files.copy({ fileId: f.id, supportsAllDrives: true, fields: 'id,md5Checksum', requestBody: { name: f.name, parents: [f.ruta ? subId[f.ruta] : preId] } }))
    if (c.data.md5Checksum && c.data.md5Checksum !== f.md5Checksum) fallos.push(`${f.name}: la copia no es igual al original`)
    hechas++
    if (hechas % 20 === 0) console.log(`    ${hechas} de ${aCopiar.length}…`)
  } catch (e) { fallos.push(`${f.name}: ${e.message}`) }
}
while (cola.length) await Promise.all(cola.splice(0, EN_PARALELO).map(uno))

// ---- verificar contra lo que quedó en Drive, no contra lo que creo que hice
const despues = await imagenes(raizId)
const quedaron = new Set(despues.fotos.map(f => f.md5Checksum))
const faltan = aCopiar.filter(f => !quedaron.has(f.md5Checksum))
console.log(`\n  ✓ ${hechas} copiadas · en el proyecto ahora hay ${despues.fotos.length} fotos · faltan ${faltan.length}`)
if (fallos.length) console.log(`  ${fallos.length} con error:`, fallos.slice(0, 5))
if (faltan.length) console.log('  no llegaron:', faltan.map(f => f.name).join(', '))
console.log(`  carpeta: https://drive.google.com/drive/folders/${preId}`)
await sheets.spreadsheets.values.append({
  spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
  requestBody: { values: [[new Date().toISOString(), 'script', 'fotos-traer-de-carpeta', 'DRIVE', num, `${hechas} fotos copiadas a Pre-entregas desde "${metaOrigen.name}" (${metaOrigen.owners?.[0]?.emailAddress || ORIGEN})${faltan.length ? ` · faltan ${faltan.length}` : ''}`]] },
})
