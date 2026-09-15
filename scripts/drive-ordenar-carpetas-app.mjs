// Ordena lo que la app armó de más en Drive hasta el 14/9/2026.
//
// La app creaba la carpeta de la agencia/cliente adivinando por nombre, y cuando no
// le daba igual creaba otra al lado de la que el equipo ya tenía (FUNDACION_BUNGE_BORN
// junto a BUNGE & BORN, AUSTRAL_DERECHO cuando todo Austral vive en FD DERECHO Y
// ESCUELA DE GOBIERNO). Además dos aprobaciones al mismo tiempo la triplicaron
// (CR_HAPPY_TOGETHER ×3) y el nombre del proyecto no era el del equipo ("9 I 14 …").
//
// Qué hace, en orden:
//   1. Columnas "Drive Crudo" y "Drive Entregas" en AGENCIAS y CLIENTES (con filtro).
//   2. Mueve los proyectos de las carpetas de la app a la carpeta del equipo, y las
//      vacías van a la papelera (SOLO si no tienen ningún archivo adentro).
//   3. Donde el equipo ya había armado la carpeta del mismo evento, el link de
//      PROYECTOS pasa a apuntar a ESA (la de la app, vacía, va a la papelera).
//   4. Renombra toda carpeta "2195_2026-09-14_Premiacion_FBB" → "9 I 14 Premiacion FBB".
//   5. Anota en AGENCIAS / CLIENTES dónde vive cada uno, para que la app no adivine más.
//
// Nada se borra definitivo: la papelera de la unidad la vacía Juan. Mover o
// renombrar NO cambia el ID, así que los links del sheet siguen andando.
//
//   node scripts/drive-ordenar-carpetas-app.mjs              → preview
//   node scripts/drive-ordenar-carpetas-app.mjs --escribir   → aplica y verifica

import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { DRIVE_CRUDO, DRIVE_ENTREGAS, nombreCarpetaProyecto, formatoViejo, mesDia, sinTildes } from '../lib/drive.js'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets'] })
const drive = google.drive({ version: 'v3', auth }), sheets = google.sheets({ version: 'v4', auth })
const ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')
const E = DRIVE_ENTREGAS, C = DRIVE_CRUDO
const link = id => `https://drive.google.com/drive/folders/${id}`
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
const k = s => sinTildes(s).toUpperCase().replace(/[^A-Z0-9]/g, '')
const tokens = s => sinTildes(s).toLowerCase().replace(/^\d+_\d{4}-\d{2}-\d{2}_/, '').replace(/^\s*\d{1,2}\s*[I|]\s*[\d\s\/y]+/i, '').split(/[^a-z0-9]+/).filter(t => t.length >= 3)

// ------------------------------------------------------------ Drive, lectura
const driveDe = new Map()   // id → driveId (para las consultas)
async function hijos(driveId, parent, soloCarpetas = false) {
  const out = []; let t
  do {
    const r = await drive.files.list({ q: `'${parent}' in parents and trashed=false${soloCarpetas ? " and mimeType='application/vnd.google-apps.folder'" : ''}`, driveId, corpora: 'drive', includeItemsFromAllDrives: true, supportsAllDrives: true, pageSize: 1000, pageToken: t, fields: 'nextPageToken,files(id,name,mimeType,createdTime)' })
    out.push(...(r.data.files || [])); t = r.data.nextPageToken
  } while (t)
  out.forEach(f => driveDe.set(f.id, driveId))
  return out.sort((a, b) => a.name.localeCompare(b.name, 'es'))
}
const esC = f => f.mimeType === 'application/vnd.google-apps.folder'
async function archivosDentro(driveId, id) { let n = 0; const q = [id]; while (q.length) { const h = await hijos(driveId, q.shift()); n += h.filter(x => !esC(x)).length; q.push(...h.filter(esC).map(x => x.id)) } return n }
// Resuelve una ruta por nombres exactos. Devuelve la carpeta o null (y avisa).
async function ruta(driveId, partes) {
  let cur = { id: driveId, name: driveId === E ? 'ENTREGAS' : 'CRUDO' }
  for (const p of partes) {
    const h = (await hijos(driveId, cur.id, true)).filter(f => f.name === p)
    if (h.length !== 1) { console.log(`   ⚠ no encuentro (o hay ${h.length}) "${p}" en ${cur.name}`); return null }
    cur = h[0]
  }
  return cur
}
const nombreNuevo = f => { const v = formatoViejo(f.name); return v ? nombreCarpetaProyecto({ fechaEvento: v.iso, proyecto: v.resto.replace(/_/g, ' ') }) : null }

// Los links que hoy tiene PROYECTOS, por N°
const rP = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'PROYECTOS!A:EW' })
const pr = rP.data.values || [], hP = pr[0] || [], cP = n => hP.indexOf(n)
const idDe = l => (String(l || '').match(/[-\w]{25,}/) || [])[0] || ''
const linkActual = (num, col) => { const f = pr.slice(1).find(x => String(x[cP('N° presupuesto')] || '').trim() === String(num)); return f ? idDe(f[cP(col)]) : '' }

// ------------------------------------------------------------ el plan
const acciones = []   // { tipo, driveId, id, nombre, a, aNombre, ruta, motivo, num, col }
const crear = []      // carpetas a crear (padre + nombre) → id al escribir
const A = (tipo, o) => acciones.push({ tipo, ...o })
// "asegurar" una subcarpeta por nombre exacto: existe → id; no existe → se anota para crear
async function asegurar(driveId, parent, nombre) {
  const h = (await hijos(driveId, parent.id, true)).filter(f => f.name === nombre)
  if (h.length) return h[0]
  const c = { driveId, parent: parent.id, nombre, ruta: `${parent.name} / ${nombre}`, id: null }
  crear.push(c); A('crear', { driveId, ruta: c.ruta, pendiente: c })
  return { id: null, name: nombre, pendiente: c }
}
async function moverProyectos(driveId, desde, hacia, contexto) {
  if (!desde) return
  const h = await hijos(driveId, desde.id, true)
  const col = driveId === C ? 'Drive Crudo' : 'Drive Entrega'
  for (const f of h) {
    const v = formatoViejo(f.name)
    // Dos carpetas con el mismo N° (la fecha del evento cambió): se queda la que
    // apunta PROYECTOS, la otra va a la papelera si está vacía.
    if (v && h.filter(x => formatoViejo(x.name)?.nro === v.nro).length > 1 && linkActual(v.nro, col) !== f.id) { await papelera(driveId, f, `el #${v.nro} cambió de fecha, PROYECTOS apunta a la otra`); continue }
    A('mover', { driveId, id: f.id, nombre: f.name, a: hacia, aNombre: hacia.name || hacia.pendiente?.ruta, renombrarA: nombreNuevo(f), ruta: contexto })
  }
}
async function papelera(driveId, f, motivo) {
  if (!f) return
  const n = await archivosDentro(driveDe.get(f.id) || driveId, f.id)
  if (n > 0) { A('dejar', { driveId, id: f.id, nombre: f.name, motivo: `${motivo} — PERO tiene ${n} archivos adentro, se deja` }); return false }
  A('papelera', { driveId, id: f.id, nombre: f.name, motivo }); return true
}
const links = []   // { num, col, id, nombre }
const mapa = []    // { hoja, nombre, col, id, ruta }
const M = (hoja, nombre, col, f) => f && mapa.push({ hoja, nombre, col, id: f.id, ruta: f.name })

// Gemela hecha a mano del mismo evento: mismo mes, ±1 día, y palabras en común.
function gemela(f, candidatas) {
  const v = formatoViejo(f.name); if (!v) return null
  const m = +v.iso.slice(5, 7), d = +v.iso.slice(8, 10)
  const tf = tokens(f.name)
  const ok = candidatas.filter(c => { const md = mesDia(c.name); if (!md || md.m !== m || Math.abs(md.d - d) > 1) return false; const tc = tokens(c.name); const comun = tf.filter(t => tc.includes(t)).length; return comun >= 2 || (tf.length && comun >= Math.ceil(Math.min(tf.length, tc.length) / 2)) })
  return ok.length === 1 ? ok[0] : null
}
const contieneId = async (driveId, raizId, buscado) => { const q = [raizId]; while (q.length) { const p = q.shift(); if (p === buscado) return true; q.push(...(await hijos(driveId, p, true)).map(x => x.id)) } return false }

console.log(`════════ ORDENAR CARPETAS DE LA APP ${ESCRIBIR ? '(ESCRIBIENDO)' : '(preview)'} ════════`)

// ====================== ENTREGAS ======================
console.log('\n── ENTREGAS ──')
// 1. Bunge & Born (Pop Up)
{
  const popup = await ruta(E, ['POP UP']), bueno = await ruta(E, ['POP UP', 'BUNGE & BORN']), app = await ruta(E, ['POP UP', 'FUNDACION_BUNGE_BORN'])
  if (bueno && app) {
    const y = await asegurar(E, bueno, '2026')
    await moverProyectos(E, await ruta(E, ['POP UP', 'FUNDACION_BUNGE_BORN', '2026']), y, 'Bunge → BUNGE & BORN / 2026')
    const recApp = (await hijos(E, app.id, true)).find(f => f.name === 'Recursos'), recBueno = (await hijos(E, bueno.id, true)).find(f => f.name === 'Recursos')
    if (recApp && !recBueno) A('mover', { driveId: E, id: recApp.id, nombre: 'Recursos', a: bueno, aNombre: bueno.name, ruta: 'Recursos de Bunge' })
    else if (recApp) await papelera(E, recApp, 'Recursos repetido')
    A('papelera-al-final', { driveId: E, id: app.id, nombre: 'POP UP / FUNDACION_BUNGE_BORN', motivo: 'queda vacía después de mover' })
    M('CLIENTES', 'Fundación Bunge & Born', 'Drive Entregas', bueno); M('AGENCIAS', 'Pop Up', 'Drive Entregas', popup)
  }
  const raiz = await ruta(E, ['FUNDACION_BUNGE_BORN'])
  if (raiz) await papelera(E, raiz, 'la de la raíz (anterior al nivel de agencia), vacía')
}
// 2. Austral → FD DERECHO Y ESCUELA DE GOBIERNO / 2026
{
  const austral = await ruta(E, ['AUSTRAL']), fd = await ruta(E, ['AUSTRAL', 'FD DERECHO Y ESCUELA DE GOBIERNO']), fd26 = await ruta(E, ['AUSTRAL', 'FD DERECHO Y ESCUELA DE GOBIERNO', '2026'])
  if (fd26) {
    const humanas = await hijos(E, fd26.id, true)
    for (const nom of ['AUSTRAL_DERECHO', 'AUSTRAL_EDG']) {
      const app = await ruta(E, ['AUSTRAL', nom]); if (!app) continue
      const y = await ruta(E, ['AUSTRAL', nom, '2026'])
      for (const f of y ? await hijos(E, y.id, true) : []) {
        const g = gemela(f, humanas), num = formatoViejo(f.name)?.nro
        if (g && await papelera(E, f, `el equipo ya armó "${g.name}"`)) { links.push({ num, col: 'Drive Entrega', id: g.id, nombre: g.name }); links.push({ num, col: 'Drive Finales', id: g.id, nombre: g.name }) }
        else if (!g) A('mover', { driveId: E, id: f.id, nombre: f.name, a: fd26, aNombre: 'FD DERECHO Y ESCUELA DE GOBIERNO / 2026', renombrarA: nombreNuevo(f), ruta: `${nom} → FD DERECHO` })
      }
      const rec = (await hijos(E, app.id, true)).find(f => f.name === 'Recursos'); if (rec) await papelera(E, rec, 'Recursos de una carpeta que se va')
      A('papelera-al-final', { driveId: E, id: app.id, nombre: `AUSTRAL / ${nom}`, motivo: 'queda vacía después de mover' })
    }
    const recs = (await hijos(E, austral.id, true)).filter(f => f.name === 'Recursos')
    if (recs.length > 1) for (const r of recs.slice(1)) await papelera(E, r, 'Recursos repetido en AUSTRAL')
    M('CLIENTES', 'Austral Derecho', 'Drive Entregas', fd); M('CLIENTES', 'Austral EDG', 'Drive Entregas', fd); M('AGENCIAS', 'Austral', 'Drive Entregas', austral)
  }
}
// 3. Mani King → ENTREGAS / 2026 / <Mes>
{
  const mk = await ruta(E, ['MANI KING']), y = await ruta(E, ['MANI KING', '2026']), ent = await ruta(E, ['MANI KING', 'ENTREGAS'])
  const mes = { '08': 'Agosto', '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre' }
  if (y && ent) {
    for (const f of await hijos(E, y.id, true)) {
      const v = formatoViejo(f.name); const dest = v ? await ruta(E, ['MANI KING', 'ENTREGAS', v.iso.slice(0, 4), mes[v.iso.slice(5, 7)] || '']) : null
      if (dest && await papelera(E, f, `el equipo entrega por mes: "${dest.name}"`)) links.push({ num: v.nro, col: 'Drive Entrega', id: dest.id, nombre: `MANI KING / ENTREGAS / ${v.iso.slice(0, 4)} / ${dest.name}` })
    }
    A('papelera-al-final', { driveId: E, id: y.id, nombre: 'MANI KING / 2026', motivo: 'la app la armó al lado de ENTREGAS' })
    M('CLIENTES', 'Mani King', 'Drive Entregas', ent)
  }
}
// 4. Total Producciones: dos carpetas del equipo + EXPO_LAS_HERAS dos veces
{
  const keep = await ruta(E, ['Total Producciones']), old = await ruta(E, ['TOTAL PRODUCCIONES'])
  if (keep && old) {
    const hk = await hijos(E, keep.id, true)
    for (const f of await hijos(E, old.id, true)) {
      if (f.name === 'Recursos' && hk.find(x => x.name === 'Recursos')) { await papelera(E, f, 'Recursos repetido'); continue }
      A('mover', { driveId: E, id: f.id, nombre: f.name, a: keep, aNombre: keep.name, ruta: 'TOTAL PRODUCCIONES → Total Producciones' })
    }
    A('papelera-al-final', { driveId: E, id: old.id, nombre: 'TOTAL PRODUCCIONES', motivo: 'queda vacía, se unifica en "Total Producciones"' })
    const dup = hk.filter(f => f.name === 'EXPO_LAS_HERAS')
    if (dup.length > 1) { const linkeada = linkActual('2277', 'Drive Entrega'); for (const d of dup) { if (await contieneId(E, d.id, linkeada)) continue; await papelera(E, d, 'EXPO_LAS_HERAS repetida (la otra es la que apunta PROYECTOS)') } }
    M('AGENCIAS', 'Total Producciones', 'Drive Entregas', keep)
  }
}
// 5. Oir / Unilever: People Week ya está hecha a mano
{
  const oir = await ruta(E, ['Oir Comunicaciones']), y = await ruta(E, ['Oir Comunicaciones', '2026']), uni26 = await ruta(E, ['Oir Comunicaciones', 'Unilever', '2026'])
  if (y) await papelera(E, y, 'anterior al nivel de agencia (2208 represupuestado)')
  if (uni26) {
    // Juan (15/9/2026): People Week es UNA carpeta, la que armó el equipo ("9 I 14 People
    // WEEK"). A Unilever se le entrega el crudo, así que va directo a Entregas: los tres
    // links de PROYECTOS (crudo, entrega, finales) apuntan ahí.
    const h = await hijos(E, uni26.id, true)
    const pws = h.filter(x => /people[\s_]*week/i.test(x.name) && !formatoViejo(x.name))
    for (const f of h.filter(x => formatoViejo(x.name))) {
      const v = formatoViejo(f.name), num = v.nro
      // La del mismo mes del evento ("9 I 14 People WEEK"), no el teaser de agosto.
      const mismoMes = pws.filter(x => mesDia(x.name)?.m === +v.iso.slice(5, 7))
      const g = /people[\s_]*week/i.test(f.name) ? (mismoMes.length === 1 ? mismoMes[0] : null) : gemela(f, h.filter(x => !formatoViejo(x.name)))
      if (g && await papelera(E, f, `el equipo ya armó "${g.name}"`)) for (const col of ['Drive Entrega', 'Drive Finales', 'Drive Crudo']) links.push({ num, col, id: g.id, nombre: `Oir Comunicaciones / Unilever / 2026 / ${g.name}` })
    }
  }
  M('AGENCIAS', 'Oir Comunicaciones', 'Drive Entregas', oir)
}

// ====================== CRUDO ======================
console.log('\n── CRUDO ──')
// 1. Happy Together ×3
{
  const hts = (await hijos(C, C, true)).filter(f => f.name === 'CR_HAPPY_TOGETHER')
  if (hts.length > 1) {
    const con = []; for (const h of hts) con.push({ f: h, n: await archivosDentro(C, h.id) })
    con.sort((a, b) => b.n - a.n); const keep = con[0].f
    for (const { f } of con.slice(1)) await papelera(C, f, `CR_HAPPY_TOGETHER repetida (se queda la que tiene ${con[0].n} archivos)`)
    const linkeada = linkActual('2252', 'Drive Crudo')
    if (linkeada && !(await contieneId(C, keep.id, linkeada))) { const p = await ruta(C, [keep.name, 'CR_STAND_DE_BRASIL', '2026']); const pf = p ? (await hijos(C, p.id, true))[0] : null; if (pf) links.push({ num: '2252', col: 'Drive Crudo', id: pf.id, nombre: `${keep.name} / … / ${pf.name}` }) }
    M('AGENCIAS', 'Happy Together', 'Drive Crudo', keep)
  }
  M('AGENCIAS', 'Happy Together', 'Drive Entregas', await ruta(E, ['Happy together']))
}
// 2. Bunge (CR_POP UP): la app + dos del equipo → "FUNDACIÓN BUNGE Y BORN"
{
  const popup = await ruta(C, ['CR_POP UP']), bueno = await ruta(C, ['CR_POP UP', 'FUNDACIÓN BUNGE Y BORN']), otro = await ruta(C, ['CR_POP UP', 'BUNGE Y BORN']), app = await ruta(C, ['CR_POP UP', 'CR_FUNDACION_BUNGE_BORN'])
  if (bueno) {
    if (app) { const y = await asegurar(C, bueno, '2026'); await moverProyectos(C, await ruta(C, ['CR_POP UP', 'CR_FUNDACION_BUNGE_BORN', '2026']), y, 'Bunge → FUNDACIÓN BUNGE Y BORN / 2026'); A('papelera-al-final', { driveId: C, id: app.id, nombre: 'CR_POP UP / CR_FUNDACION_BUNGE_BORN', motivo: 'queda vacía después de mover' }) }
    if (otro) { for (const f of await hijos(C, otro.id, true)) A('mover', { driveId: C, id: f.id, nombre: f.name, a: bueno, aNombre: bueno.name, ruta: 'BUNGE Y BORN → FUNDACIÓN BUNGE Y BORN (dos carpetas del equipo, propuesta)' }); A('papelera-al-final', { driveId: C, id: otro.id, nombre: 'CR_POP UP / BUNGE Y BORN', motivo: 'queda vacía, se unifica' }) }
    M('CLIENTES', 'Fundación Bunge & Born', 'Drive Crudo', bueno); M('AGENCIAS', 'Pop Up', 'Drive Crudo', popup)
  }
}
// 3. Austral: en Crudo el equipo va directo por año
{
  const au = await ruta(C, ['CR_AUSTRAL'])
  if (au) {
    const y26 = await asegurar(C, au, '2026')
    for (const nom of ['CR_AUSTRAL_DERECHO', 'CR_AUSTRAL_EDG']) {
      const app = await ruta(C, ['CR_AUSTRAL', nom]); if (!app) continue
      for (const y of (await hijos(C, app.id, true)).filter(f => f.name === '2026')) await moverProyectos(C, y, y26, `${nom} → CR_AUSTRAL / 2026`)
      A('papelera-al-final', { driveId: C, id: app.id, nombre: `CR_AUSTRAL / ${nom}`, motivo: 'queda vacía después de mover' })
    }
    M('CLIENTES', 'Austral Derecho', 'Drive Crudo', au); M('CLIENTES', 'Austral EDG', 'Drive Crudo', au); M('AGENCIAS', 'Austral', 'Drive Crudo', au)
  }
}
// 4. Mani King: el crudo ya está en CR_MANI KING / CR_MK 2026 / <mes>
{
  const mk = await ruta(C, ['CR_MANI KING']), inf = await ruta(C, ['CR_INFINITY_MIDIA']), y = await ruta(C, ['CR_INFINITY_MIDIA', 'CR_MANI_KING', '2026'])
  const dest = { '2232': ['CR_MANI KING', 'CR_MK 2026', '8 | 20/8 AGOSTO'], '2233': ['CR_MANI KING', 'CR_MK 2026', '9 | 10/9 SEPTIEMBRE'] }
  if (y && mk) {
    for (const f of await hijos(C, y.id, true)) { const v = formatoViejo(f.name); const d = v && dest[v.nro] ? await ruta(C, dest[v.nro]) : null; if (d && await papelera(C, f, `el crudo ya está en "${d.name}"`)) links.push({ num: v.nro, col: 'Drive Crudo', id: d.id, nombre: dest[v.nro].join(' / ') }) }
    if (inf) A('papelera-al-final', { driveId: C, id: inf.id, nombre: 'CR_INFINITY_MIDIA', motivo: 'Mani King vive en la raíz (CR_MANI KING)' })
    M('CLIENTES', 'Mani King', 'Drive Crudo', mk)
  }
}
// 5. Oir: CR_OIR_COMUNICACIONES (app) está vacía — a Unilever el crudo se le entrega,
//    va directo a Entregas (Juan, 15/9/2026). Toda la carpeta a la papelera.
{
  const bueno = await ruta(C, ['CR_OIR COMUNICACION']), app = await ruta(C, ['CR_OIR_COMUNICACIONES'])
  if (app) await papelera(C, app, 'la app la armó al lado de CR_OIR COMUNICACION; Unilever entrega el crudo, no usa Crudo')
  M('AGENCIAS', 'Oir Comunicaciones', 'Drive Crudo', bueno)
}
// 6. Total: 2277 dos veces
{
  const y = await ruta(C, ['CR_TOTAL_PRODUCCIONES', 'CR_EXPO_LAS_HERAS', '2026']), tp = await ruta(C, ['CR_TOTAL_PRODUCCIONES'])
  if (y) { const linkeada = linkActual('2277', 'Drive Crudo'); for (const f of await hijos(C, y.id, true)) { if (f.id === linkeada) continue; await papelera(C, f, '2277 repetida (la otra es la que apunta PROYECTOS)') } }
  M('AGENCIAS', 'Total Producciones', 'Drive Crudo', tp)
}

// ====================== renombrar el formato viejo (las dos unidades) ======================
// Una sola búsqueda por unidad: todas las carpetas creadas desde que la app las arma
// (20/8/2026). Recorrer el árbol entero eran miles de llamadas y 10 minutos.
const yaTocadas = new Set(acciones.filter(a => a.id).map(a => a.id))
for (const a of acciones.filter(x => x.tipo === 'papelera' || x.tipo === 'papelera-al-final')) {
  const q = [a.id]; while (q.length) { const p = q.shift(); for (const f of await hijos(a.driveId, p, true)) { yaTocadas.add(f.id); q.push(f.id) } }
}
for (const [driveId, nombre] of [[E, 'ENTREGAS'], [C, 'CRUDO']]) {
  const todas = []; let t
  do {
    const r = await drive.files.list({ q: "mimeType='application/vnd.google-apps.folder' and trashed=false and createdTime >= '2026-08-20T00:00:00'", driveId, corpora: 'drive', includeItemsFromAllDrives: true, supportsAllDrives: true, pageSize: 1000, pageToken: t, fields: 'nextPageToken,files(id,name,parents)' })
    todas.push(...(r.data.files || [])); t = r.data.nextPageToken
  } while (t)
  const porId = new Map(todas.map(f => [f.id, f]))
  for (const f of todas) {
    const nuevo = nombreNuevo(f); if (!nuevo || yaTocadas.has(f.id)) continue
    let padre = ''; try { padre = (await drive.files.get({ fileId: f.parents?.[0], fields: 'name', supportsAllDrives: true })).data.name } catch (e) {}
    A('renombrar', { driveId, id: f.id, nombre: f.name, renombrarA: nuevo, ruta: `${nombre} / … / ${padre}` })
  }
}

// ====================== preview ======================
const porTipo = t => acciones.filter(a => a.tipo === t)
console.log(`\n▸ Carpetas a crear (${porTipo('crear').length}):`); porTipo('crear').forEach(a => console.log(`   + ${a.ruta}`))
console.log(`\n▸ Mover (${porTipo('mover').length}):`); porTipo('mover').forEach(a => console.log(`   ${a.nombre}  →  ${a.aNombre}${a.renombrarA ? `  (y pasa a llamarse "${a.renombrarA}")` : ''}   [${a.ruta}]`))
console.log(`\n▸ Papelera (${porTipo('papelera').length + porTipo('papelera-al-final').length}, todas sin archivos):`)
porTipo('papelera').forEach(a => console.log(`   🗑 ${a.nombre}  — ${a.motivo}`)); porTipo('papelera-al-final').forEach(a => console.log(`   🗑 ${a.nombre}  — ${a.motivo}`))
if (porTipo('dejar').length) { console.log(`\n▸ Se dejan como están (tienen archivos):`); porTipo('dejar').forEach(a => console.log(`   ${a.nombre}  — ${a.motivo}`)) }
console.log(`\n▸ Links de PROYECTOS que pasan a la carpeta del equipo (${links.length}):`); links.forEach(l => console.log(`   #${l.num} ${l.col.padEnd(13)} → ${l.nombre}`))
console.log(`\n▸ Renombrar al formato del equipo (${porTipo('renombrar').length}):`); porTipo('renombrar').forEach(a => console.log(`   ${a.nombre}  →  "${a.renombrarA}"   [${a.ruta}]`))
console.log(`\n▸ Dónde vive cada uno (AGENCIAS / CLIENTES, ${mapa.length} celdas):`); mapa.forEach(m => console.log(`   ${m.hoja.padEnd(8)} ${m.nombre.padEnd(24)} ${m.col.padEnd(14)} → ${m.ruta}`))

if (!ESCRIBIR) { console.log('\n(preview) Para aplicar:  node scripts/drive-ordenar-carpetas-app.mjs --escribir'); process.exit(0) }

// ====================== escribir ======================
console.log('\n══ aplicando ══')
// 1. columnas en AGENCIAS / CLIENTES
for (const hoja of ['AGENCIAS', 'CLIENTES']) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: ID, ranges: [hoja], fields: 'sheets(properties(title,sheetId,gridProperties(columnCount)),basicFilter,tables(tableId,name,range))' })
  const s = meta.data.sheets[0], sheetId = s.properties.sheetId
  const hdr = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: `${hoja}!1:1` })).data.values?.[0] || []
  const faltan = ['Drive Crudo', 'Drive Entregas'].filter(c => !hdr.includes(c))
  if (faltan.length) {
    const desde = hdr.length, hasta = hdr.length + faltan.length
    const reqs = []
    if (s.properties.gridProperties.columnCount < hasta) reqs.push({ appendDimension: { sheetId, dimension: 'COLUMNS', length: hasta - s.properties.gridProperties.columnCount } })
    reqs.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: desde, endIndex: hasta }, properties: { pixelSize: 160 }, fields: 'pixelSize' } })
    const tabla = (s.tables || []).find(x => x.tableId === s.basicFilter?.tableId)
    if (s.basicFilter?.tableId && tabla) reqs.push({ updateTable: { table: { tableId: tabla.tableId, range: { ...tabla.range, endColumnIndex: Math.max(tabla.range.endColumnIndex || 0, hasta) } }, fields: 'range' } })
    else if (s.basicFilter) { const bf = JSON.parse(JSON.stringify(s.basicFilter)); bf.range.endColumnIndex = Math.max(bf.range.endColumnIndex || 0, hasta); delete bf.criteria; delete bf.filterSpecs; reqs.push({ setBasicFilter: { filter: bf } }) }
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests: reqs } })
    await sheets.spreadsheets.values.update({ spreadsheetId: ID, range: `${hoja}!${colLetra(desde)}1`, valueInputOption: 'RAW', requestBody: { values: [faltan] } })
    console.log(`✓ ${hoja}: columnas ${faltan.join(' + ')}`)
  }
}
// 2. crear, mover, renombrar
for (const c of crear) { const r = await drive.files.create({ requestBody: { name: c.nombre, mimeType: 'application/vnd.google-apps.folder', parents: [c.parent] }, fields: 'id', supportsAllDrives: true }); c.id = r.data.id; console.log(`✓ creada ${c.ruta}`) }
for (const a of porTipo('mover')) {
  const destId = a.a.id || a.a.pendiente?.id; if (!destId) { console.log(`✗ sin destino para ${a.nombre}`); continue }
  const f = (await drive.files.get({ fileId: a.id, fields: 'parents', supportsAllDrives: true })).data
  await drive.files.update({ fileId: a.id, addParents: destId, removeParents: (f.parents || []).join(','), ...(a.renombrarA ? { requestBody: { name: a.renombrarA } } : {}), supportsAllDrives: true })
  console.log(`✓ movida ${a.nombre} → ${a.aNombre}`)
}
for (const a of porTipo('renombrar')) { await drive.files.update({ fileId: a.id, requestBody: { name: a.renombrarA }, supportsAllDrives: true }) }
console.log(`✓ ${porTipo('renombrar').length} renombradas`)
// 3. papelera (re-chequeando que sigan vacías)
for (const a of [...porTipo('papelera'), ...porTipo('papelera-al-final')]) {
  const n = await archivosDentro(a.driveId, a.id)
  if (n > 0) { console.log(`✗ ${a.nombre}: ahora tiene ${n} archivos, NO se tira`); continue }
  await drive.files.update({ fileId: a.id, requestBody: { trashed: true }, supportsAllDrives: true }); console.log(`✓ papelera ${a.nombre}`)
}
// 4. links en PROYECTOS
const data = []
for (const l of links) { const fi = pr.findIndex((x, i) => i > 0 && String(x[cP('N° presupuesto')] || '').trim() === String(l.num)); const ci = cP(l.col); if (fi > 0 && ci > -1) data.push({ range: `PROYECTOS!${colLetra(ci)}${fi + 1}`, values: [[link(l.id)]] }) }
// 5. mapa en AGENCIAS / CLIENTES (solo celdas vacías)
for (const hoja of ['AGENCIAS', 'CLIENTES']) {
  const rows = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: `${hoja}!A:Z` })).data.values || [], hh = rows[0] || []
  for (const m of mapa.filter(x => x.hoja === hoja)) {
    const fi = rows.findIndex((x, i) => i > 0 && k(x[0]) === k(m.nombre)), ci = hh.indexOf(m.col)
    if (fi < 1 || ci < 0) { console.log(`   ⚠ ${hoja}: no encuentro "${m.nombre}"`); continue }
    if (String(rows[fi][ci] || '').trim()) continue
    data.push({ range: `${hoja}!${colLetra(ci)}${fi + 1}`, values: [[link(m.id)]] })
  }
}
if (data.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: ID, requestBody: { valueInputOption: 'USER_ENTERED', data } })
console.log(`✓ ${data.length} celdas escritas en el sheet (links + mapa)`)
try { await sheets.spreadsheets.values.append({ spreadsheetId: ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), 'script', 'drive-ordenar-carpetas-app', 'DRIVE+PROYECTOS+AGENCIAS+CLIENTES', '', `${porTipo('mover').length} movidas · ${porTipo('renombrar').length} renombradas · ${porTipo('papelera').length + porTipo('papelera-al-final').length} a papelera · ${links.length} links · ${mapa.length} mapa`]] } }) } catch (e) {}

// 6. verificar: todos los links de PROYECTOS 2026 apuntan a carpetas vivas
const rP2 = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'PROYECTOS!A:EW' })).data.values || []
let vivos = 0, rotos = []
for (const x of rP2.slice(1)) for (const col of ['Drive Crudo', 'Drive Entrega', 'Drive Finales']) {
  const id = idDe(x[cP(col)]); if (!id) continue
  try { const f = (await drive.files.get({ fileId: id, fields: 'trashed', supportsAllDrives: true })).data; if (f.trashed) rotos.push(`#${x[cP('N° presupuesto')]} ${col} (papelera)`); else vivos++ } catch (e) { rotos.push(`#${x[cP('N° presupuesto')]} ${col} (${e.message.slice(0, 30)})`) }
}
console.log(rotos.length ? `\n✗ ${rotos.length} links rotos: ${rotos.join(' · ')}` : `\n✓ verificado: los ${vivos} links de Drive en PROYECTOS apuntan a carpetas vivas`)
