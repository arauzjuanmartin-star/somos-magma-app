/**
 * Mete cada carpeta de proyecto suelta de ENTREGAS adentro de su agencia.
 *
 * La app venía creando la carpeta de entrega por CLIENTE en la raíz, así que quedó
 * "IVECO" al lado de "ADN Comunicacion" que ya tenía IVECO adentro. Esto lo junta.
 *
 * La agencia NO se adivina: cada carpeta de proyecto se llama <nro>_<fecha>_<nombre>,
 * y ese número dice en PROYECTOS cuál es la agencia y el cliente. Importa porque el
 * mismo cliente trabaja por dos agencias distintas (IVECO está en ADN y en OSTARA,
 * Unilever en Oir y en POP UP): con el nombre solo, la mitad iría a la carpeta
 * equivocada.
 *
 * Mover NO rompe los links guardados en el sheet: en Drive el link es el ID de la
 * carpeta y el ID no cambia al moverla. Cambia dónde está, no cómo se la abre.
 *
 * Uso:  node scripts/drive-entregas-unificar.mjs             (preview)
 *       node scripts/drive-entregas-unificar.mjs --escribir
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets.readonly'] })
const drive = google.drive({ version: 'v3', auth })
const sheetsApi = google.sheets({ version: 'v4', auth })
const ENT = '0AK9Y6BbDhgekUk9PVA'
const SHEET = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')

const sinTildes = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
const clave = s => sinTildes(s).toUpperCase().replace(/^CR[_\s]*/, '').replace(/[^A-Z0-9]/g, '')
const nombreCarpeta = s => sinTildes(s).toUpperCase().replace(/[\/\\|()[\]{}:;,"'`*?<>#%&]/g, ' ').replace(/[^A-Z0-9\s_.+-]/g, '').trim().replace(/\s+/g, '_').replace(/_+/g, '_')

const hijos = async parent => {
  const out = []; let token
  do {
    const r = await drive.files.list({ q: `'${parent}' in parents and trashed=false`, driveId: ENT, corpora: 'drive', includeItemsFromAllDrives: true, supportsAllDrives: true, pageSize: 1000, pageToken: token, fields: 'nextPageToken,files(id,name,mimeType)' })
    out.push(...(r.data.files || [])); token = r.data.nextPageToken
  } while (token)
  return out
}
const carpetasDe = async p => (await hijos(p)).filter(f => f.mimeType === 'application/vnd.google-apps.folder')

// get-or-create tolerante, igual que lib/drive.js
const asegurar = async (parent, nombre) => {
  const hay = await carpetasDe(parent)
  const k = clave(nombre)
  const exacta = hay.find(f => clave(f.name) === k)
  if (exacta) return { ...exacta, creada: false }
  const cerca = hay.filter(f => { const c = clave(f.name); return k.length >= 3 && (c.startsWith(k) || k.startsWith(c)) })
  if (cerca.length === 1) return { ...cerca[0], creada: false }
  if (!ESCRIBIR) return { id: null, name: nombre + '  ← se crea', creada: true }
  const r = await drive.files.create({ requestBody: { name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }, fields: 'id,name', supportsAllDrives: true })
  return { ...r.data, creada: true }
}

// --- de dónde sale la agencia de cada proyecto
const S = await sheetsApi.spreadsheets.values.batchGet({ spreadsheetId: SHEET, ranges: ['PROYECTOS!A:G', 'PRESUPUESTOS!A:G'] })
const [PRO, PRE] = S.data.valueRanges.map(v => v.values || [])
const deNro = new Map()
const cargar = (rows, iNum, iAg, iCli) => rows.slice(1).forEach(r => {
  const n = String(r[iNum] || '').trim()
  if (!n || deNro.has(n)) return
  deNro.set(n, { agencia: String(r[iAg] || '').trim(), cliente: String(r[iCli] || '').trim() })
})
cargar(PRO, PRO[0].indexOf('N° presupuesto'), PRO[0].indexOf('Agencia'), PRO[0].indexOf('Cliente'))
cargar(PRE, 0, PRE[0].indexOf('Agencia'), PRE[0].indexOf('Cliente'))

// --- qué carpetas de la raíz están de más
const raiz = await carpetasDe(ENT)
const dentroDeOtra = new Set()
const mapaRaiz = new Map()
raiz.forEach(f => { const k = clave(f.name); if (!mapaRaiz.has(k)) mapaRaiz.set(k, []); mapaRaiz.get(k).push(f) })
for (const padre of raiz) {
  for (const s of await carpetasDe(padre.id)) {
    const dup = raiz.filter(x => x.id !== padre.id && clave(x.name) === clave(s.name))
    dup.forEach(d => dentroDeOtra.add(d.id))
  }
}
// Además, los nombres repetidos en la raíz: se resuelven igual, por el N° de cada proyecto.
const repetidos = [...mapaRaiz.values()].filter(v => v.length > 1).flat()
const sospechosas = raiz.filter(f => dentroDeOtra.has(f.id) || repetidos.includes(f))

console.log(`\nENTREGAS: ${raiz.length} carpetas en la raíz · a revisar: ${sospechosas.length}\n`)

const plan = [], sinDatos = [], vacias = []
for (const suelta of sospechosas) {
  const anios = await carpetasDe(suelta.id)
  for (const anio of anios) {
    const proys = /^\d{4}$/.test(anio.name) ? await carpetasDe(anio.id) : [anio]
    for (const p of proys) {
      const m = p.name.match(/^(\d{3,5})[_\s]/)
      if (!m) { sinDatos.push(`${suelta.name} / ${anio.name}${anio === p ? '' : ' / ' + p.name}  (el nombre no empieza con el N° de presu)`); continue }
      const d = deNro.get(m[1])
      if (!d || !d.agencia) { sinDatos.push(`${suelta.name} / ${p.name}  (#${m[1]} no está en el sheet o no tiene agencia)`); continue }
      const ag = nombreCarpeta(d.agencia), cli = nombreCarpeta(d.cliente)
      const destino = (ag && cli && clave(ag) !== clave(cli)) ? [ag, cli] : [cli || ag]
      plan.push({ suelta, carpeta: p, nro: m[1], anio: /^\d{4}$/.test(anio.name) ? anio.name : String(new Date().getFullYear()), destino })
    }
  }
  if (!anios.length && !(await hijos(suelta.id)).length) vacias.push(suelta)
}

// Decir si el destino ya existe o se crea: es lo que hay que mirar antes de dar el OK.
// Si el sheet dice "Pancha Studio" y en Drive la carpeta se llama "PANCHITA LA CREME",
// esto crea una segunda carpeta de agencia en vez de juntar — mejor verlo antes.
const estado = new Map()
for (const x of plan) {
  const k = x.destino.join('/')
  if (estado.has(k)) continue
  let parent = ENT, detalle = []
  for (const n of x.destino) {
    const hay = await carpetasDe(parent)
    const kk = clave(n)
    const ex = hay.find(f => clave(f.name) === kk) || (kk.length >= 3 ? hay.filter(f => { const c = clave(f.name); return c.startsWith(kk) || kk.startsWith(c) }) : [])
    const enc = Array.isArray(ex) ? (ex.length === 1 ? ex[0] : null) : ex
    if (enc) { detalle.push(`«${enc.name}» (ya existe)`); parent = enc.id }
    else { detalle.push(`«${n}» ← SE CREA NUEVA`); parent = null; break }
  }
  estado.set(k, detalle.join(' / '))
}

console.log(`── A MOVER (${plan.length}) ─────────────────────────────`)
plan.forEach(x => console.log(`   ${x.suelta.name} / ${x.anio} / ${x.carpeta.name}\n      →  ${estado.get(x.destino.join('/'))} / ${x.anio}/`))
const creanAgencia = [...estado.entries()].filter(([, v]) => v.includes('SE CREA NUEVA'))
if (creanAgencia.length) {
  console.log(`\n⚠  OJO — estos destinos NO existen en Drive y se crearían de cero (${creanAgencia.length}):`)
  creanAgencia.forEach(([k, v]) => console.log(`   ${k}  →  ${v}`))
  console.log('   Suele significar que el sheet y Drive le dicen distinto a la misma agencia.')
}

// Crear una carpeta de CLIENTE nueva es normal. Crear una de AGENCIA nueva casi
// siempre es que en Drive ya existe con otro nombre ("Pancha Studio" en el sheet,
// "PANCHITA LA CREME" en Drive), y moverla ahí sería partir la cuenta en dos. Esas
// se saltean salvo que se pida explícito.
const CREAR_AG = process.argv.includes('--crear-agencias')
const salteadas = []
if (!CREAR_AG) {
  for (let i = plan.length - 1; i >= 0; i--) {
    const det = estado.get(plan[i].destino.join('/')) || ''
    if (det.split(' / ')[0].includes('SE CREA NUEVA')) salteadas.push(...plan.splice(i, 1))
  }
  if (salteadas.length) {
    console.log(`\n── SALTEADAS (${salteadas.length}) — la AGENCIA no existe en Drive con ese nombre:`)
    salteadas.forEach(x => console.log(`   ${x.suelta.name} / ${x.carpeta.name}  →  ${x.destino.join(' / ')}`))
    console.log('   Decidí a mano si es la misma con otro nombre. Con --crear-agencias se crean igual.')
  }
}
if (sinDatos.length) { console.log(`\n── NO SE PUEDEN DECIDIR (${sinDatos.length}) — quedan donde están:`); sinDatos.forEach(x => console.log('   ' + x)) }
if (vacias.length) { console.log(`\n── VACÍAS en la raíz (${vacias.length}):`); vacias.forEach(x => console.log('   ' + x.name)) }

if (!ESCRIBIR) { console.log('\n(preview — nada tocado. Corré con --escribir para aplicar)\n'); process.exit(0) }
if (!plan.length) { console.log('\nNada para mover.\n'); process.exit(0) }

// Una carpeta que falla no puede frenar a las otras 14: se anota y sigue.
let movidas = 0
const fallaron = []
for (const x of plan) {
  try {
    let parent = ENT
    for (const n of [...x.destino, x.anio]) { const c = await asegurar(parent, n); parent = c.id }
    const actual = (await drive.files.get({ fileId: x.carpeta.id, fields: 'parents', supportsAllDrives: true })).data.parents || []
    await drive.files.update({ fileId: x.carpeta.id, addParents: parent, removeParents: actual.join(','), fields: 'id,parents', supportsAllDrives: true })
    movidas++
    console.log(`   ✓ ${x.carpeta.name} → ${x.destino.join('/')}/${x.anio}`)
  } catch (e) {
    fallaron.push(`${x.suelta.name} / ${x.carpeta.name} → ${x.destino.join('/')}: ${e.message}`)
    console.log(`   ✗ ${x.carpeta.name} — ${e.message}`)
  }
}

// Borrar lo que quedó vacío arriba (solo si de verdad no tiene NADA adentro)
let borradas = 0
for (const suelta of [...new Set(plan.map(x => x.suelta))]) { try {
  const quedan = await hijos(suelta.id)
  const soloAniosVacios = []
  for (const q of quedan) {
    if (q.mimeType !== 'application/vnd.google-apps.folder') { soloAniosVacios.length = 0; break }
    if ((await hijos(q.id)).length) { soloAniosVacios.length = 0; break }
    soloAniosVacios.push(q)
  }
  if (quedan.length && !soloAniosVacios.length) { console.log(`   · "${suelta.name}" queda: todavía tiene cosas adentro`); continue }
  for (const v of soloAniosVacios) await drive.files.delete({ fileId: v.id, supportsAllDrives: true })
  await drive.files.delete({ fileId: suelta.id, supportsAllDrives: true })
  borradas++
  console.log(`   ✓ borrada la carpeta vacía "${suelta.name}"`)
} catch (e) { console.log(`   · "${suelta.name}" no se pudo borrar: ${e.message}`) } }
if (fallaron.length) { console.log(`\n✗ No se movieron (${fallaron.length}):`); fallaron.forEach(x => console.log('   ' + x)) }
console.log(`\n✓ ${movidas} carpetas movidas · ${borradas} sueltas vacías borradas\n`)
