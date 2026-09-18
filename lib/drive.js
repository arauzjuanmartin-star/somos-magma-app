// ============================ CARPETAS EN DRIVE ============================
// Crea la carpeta de un proyecto en las unidades compartidas, respetando la
// convención oficial (ver memoria project_drive_naming_convention):
//
//   CRUDO     CR_AGENCIA / CR_CLIENTE / AAAA / 9 I 14 Proyecto
//   ENTREGAS  AGENCIA / CLIENTE / AAAA / 9 I 14 Proyecto        (sin prefijo CR_)
//
// Es idempotente: si la carpeta ya existe la devuelve, no duplica. El match es
// tolerante (ignora tildes, espacios y el prefijo CR_) porque en Crudo ya hay
// pares como "CR_ CMQ" y "CR_CMQ" — no queremos agregar un tercero.
//
// Y dónde vive cada agencia y cliente NO se adivina si el sheet lo dice: AGENCIAS y
// CLIENTES tienen "Drive Crudo" y "Drive Entregas" con el link de su carpeta. La app
// lo usa primero, y lo que encuentra o crea lo anota ahí. Adivinar por nombre armó
// FUNDACION_BUNGE_BORN al lado de BUNGE & BORN, y AUSTRAL_DERECHO cuando todo Austral
// vive en "FD DERECHO Y ESCUELA DE GOBIERNO" (14/9/2026).

import { google } from 'googleapis'
import { SLOT_PROY, SLOT_PRESU, MAX_SLOTS } from './slots.js'
import { subcarpetasDe, SUB_PRE } from './edicion.js'

export const DRIVE_CRUDO    = '0ALsTwjw6_Zc1Uk9PVA'
export const DRIVE_ENTREGAS = '0AK9Y6BbDhgekUk9PVA'

function getDrive() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
  return google.drive({ version: 'v3', auth })
}

// Saca tildes preservando la letra base (NFD), no strip ASCII: BAGÓ → BAGO.
export const sinTildes = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// Nombre de agencia/cliente: MAYÚSCULAS, sin tildes, espacios → _, sin especiales.
export const nombreCarpeta = s => sinTildes(s).toUpperCase()
  .replace(/[\/\\|()[\]{}:;,"'`*?<>#%&]/g, ' ')
  .replace(/[^A-Z0-9\s_.+-]/g, '')
  .trim().replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')

// Nombre VIEJO del proyecto (con guiones bajos, sin tildes): lo siguen usando los
// scripts que reconocen carpetas creadas antes del 14/9/2026. Para crear, ver
// nombreCarpetaProyecto.
export const nombreProyecto = s => {
  const limpio = sinTildes(s)
    .replace(/[\/\\|*?<>:"()[\]{}]/g, ' ')
    .replace(/[,;]/g, ' ')
    .trim().replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  if (limpio.length <= 80) return limpio
  const corte = limpio.slice(0, 80)
  const ult = corte.lastIndexOf('_')
  return (ult > 40 ? corte.slice(0, ult) : corte).replace(/_$/, '')
}

// Nombre de la carpeta del proyecto como lo escribe el equipo: "9 I 14 Premiación FBB"
// (mes, I, día, nombre). Hasta el 14/9/2026 la app ponía "2195_2026-09-14_Premiacion_FBB",
// el equipo no lo reconocía como suyo y armaba otra carpeta al lado con su nombre.
// El N° de presupuesto no va: el link vive en PROYECTOS y el ID no cambia al renombrar.
export const limpiarNombre = s => String(s || '').replace(/[\/\\|*?<>:"[\]{}]/g, ' ').replace(/\s+/g, ' ').trim()
export const nombreCarpetaProyecto = ({ fechaEvento, proyecto }) => {
  const iso = fechaISO(fechaEvento)
  const nombre = limpiarNombre(proyecto).slice(0, 80).trim()
  if (!iso) return nombre || 'Proyecto'
  return `${parseInt(iso.slice(5, 7))} I ${parseInt(iso.slice(8, 10))} ${nombre}`.trim()
}
// "9 I 14 …", "9 | 14 …", "9 | 3 y 4/9 …" → { m: 9, d: 14 }. Null si no arranca así.
export const mesDia = s => {
  const m = String(s || '').match(/^\s*(\d{1,2})\s*[I|]\s*(\d{1,2})(?!\d)/i)
  if (!m) return null
  const r = { m: +m[1], d: +m[2] }
  return r.m >= 1 && r.m <= 12 && r.d >= 1 && r.d <= 31 ? r : null
}
// Carpeta con el formato viejo de la app: "2195_2026-09-14_Premiacion_FBB" → { nro, iso, resto }
export const formatoViejo = s => {
  const m = String(s || '').match(/^(\d{3,5})_(\d{4}-\d{2}-\d{2})_(.*)$/)
  return m ? { nro: m[1], iso: m[2], resto: m[3] } : null
}

// Clave de comparación: "CR_ CMQ", "CR_CMQ" y "cmq" son lo mismo.
const clave = s => sinTildes(s).toUpperCase().replace(/^CR[_\s]*/, '').replace(/[^A-Z0-9]/g, '')

// Fecha DD/MM/AAAA (o ISO) → AAAA-MM-DD. Devuelve null si no parsea.
export function fechaISO(f) {
  const s = String(f || '').trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`
  const p = s.split('/'); if (p.length < 3) return null
  const d = parseInt(p[0]), mes = parseInt(p[1]); let y = parseInt(p[2]); if (y < 100) y += 2000
  if (!d || !mes || !y) return null
  return `${y}-${String(mes).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}

// Las subcarpetas de una carpeta (todas, con paginado).
async function listar(drive, parentId, driveId) {
  const out = []; let pageToken
  do {
    const r = await drive.files.list({
      q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      driveId, corpora: 'drive', includeItemsFromAllDrives: true, supportsAllDrives: true,
      pageSize: 1000, pageToken, fields: 'nextPageToken,files(id,name,createdTime)',
    })
    out.push(...(r.data.files || [])); pageToken = r.data.nextPageToken
  } while (pageToken)
  return out
}
const masVieja = fs => [...fs].sort((a, b) => String(a.createdTime || '').localeCompare(String(b.createdTime || '')) || a.id.localeCompare(b.id))[0]

// Busca una subcarpeta por nombre (tolerante). Devuelve {id,name} o null.
// `tipo` afina la tolerancia según el nivel:
//   'anio'     → "CR_MK 2026" cuenta como "2026" (el equipo pone el cliente adelante)
//   'proyecto' → la carpeta del MISMO DÍA que alguien ya armó a mano cuenta como la del
//                proyecto ("9 | 14 People WEEK" para "9 I 14 People Week Unilever"), si
//                hay una sola ese día. Y una con el formato viejo de la app y el mismo
//                N° también (viene marcada para renombrar).
async function buscar(drive, parentId, driveId, nombre, tipo = '', nro = '') {
  const files = await listar(drive, parentId, driveId)
  const k = clave(nombre)
  const exactas = files.filter(f => clave(f.name) === k)
  if (exactas.length) return masVieja(exactas)
  if (tipo === 'anio') {
    const conAnio = files.filter(f => { const c = clave(f.name); return c.endsWith(k) && c.length <= k.length + 6 })
    return conAnio.length === 1 ? conAnio[0] : null
  }
  if (tipo === 'proyecto') {
    if (nro) {
      const viejas = files.filter(f => formatoViejo(f.name)?.nro === String(nro).trim())
      if (viejas.length === 1) return { ...viejas[0], renombrar: true }
    }
    const md = mesDia(nombre)
    if (md) {
      const mismoDia = files.filter(f => { const x = mesDia(f.name); return x && x.m === md.m && x.d === md.d })
      if (mismoDia.length === 1) return mismoDia[0]
    }
    return null
  }
  // El sheet dice "ADN" y en Drive la carpeta se llama "ADN Comunicacion": sin esto
  // se crea una segunda carpeta al lado de la que ya tiene todo el material.
  // Solo si hay UNA sola candidata: con "AUSTRAL" hay tres (AUSTRAL, AUSTRAL_DERECHO,
  // AUSTRAL_EDG) y adivinar ahí sería peor que crear la carpeta.
  if (k.length >= 3) {
    const empiezan = files.filter(f => { const c = clave(f.name); return c.startsWith(k) || k.startsWith(c) })
    if (empiezan.length === 1) return empiezan[0]
  }
  return null
}

// get-or-create de una subcarpeta. crear=false → no la crea, solo busca.
export async function asegurarCarpeta(drive, parentId, driveId, nombre, crear = true, tipo = '', nro = '') {
  const existe = await buscar(drive, parentId, driveId, nombre, tipo, nro)
  if (existe) {
    // Formato viejo de la app con el mismo N°: se renombra a la convención (el ID no cambia).
    if (existe.renombrar) {
      try {
        await drive.files.update({ fileId: existe.id, requestBody: { name: nombre }, supportsAllDrives: true })
        return { id: existe.id, name: nombre, creada: false, renombradaDe: existe.name }
      } catch (e) { /* se usa con el nombre viejo */ }
    }
    return { id: existe.id, name: existe.name, creada: false }
  }
  if (!crear) return null
  const r = await drive.files.create({
    requestBody: { name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id,name,createdTime', supportsAllDrives: true,
  })
  // Carrera: dos aprobaciones al mismo tiempo crean la misma carpeta (CR_HAPPY_TOGETHER
  // quedó 3 veces el 8/9/2026). Se vuelve a mirar: si ahora hay otra igual más vieja,
  // la nuestra —recién creada, vacía— va a la papelera y se usa la otra.
  try {
    const otra = await buscar(drive, parentId, driveId, nombre)
    if (otra && otra.id !== r.data.id) {
      await drive.files.update({ fileId: r.data.id, requestBody: { trashed: true }, supportsAllDrives: true })
      return { id: otra.id, name: otra.name, creada: false }
    }
  } catch (e) { /* si no se pudo mirar, queda la nuestra */ }
  return { id: r.data.id, name: r.data.name, creada: true }
}

// ¿La carpeta sigue existiendo (no está en la papelera)?
async function vive(drive, id) {
  if (!id) return false
  try { const f = await drive.files.get({ fileId: id, fields: 'id,trashed', supportsAllDrives: true }); return !f.data.trashed } catch (e) { return false }
}

const linkDe = id => `https://drive.google.com/drive/folders/${id}`

// ---- La función que usa la app ----
// Crea (o encuentra) la carpeta del proyecto en CRUDO y/o ENTREGAS, con las
// subcarpetas que correspondan según lo que se vendió (Fotos / Videos).
//
// `entidades`: dónde vive cada agencia y cliente en Drive según el sheet (AGENCIAS y
// CLIENTES, columnas "Drive Crudo" / "Drive Entregas"), como IDs de carpeta.
//   · Si está la del CLIENTE, se usa esa y no se adivina nada. Es lo que resuelve
//     Austral ("Austral Derecho" y "Austral EDG" viven las dos en AUSTRAL / FD DERECHO
//     Y ESCUELA DE GOBIERNO) y Mani King (CR_MANI KING en la raíz, no bajo su agencia).
//   · Si solo está la de la AGENCIA, el cliente se busca (o crea) adentro.
//   · Si no hay nada, se busca por nombre desde la raíz como siempre.
// Lo que encuentra o crea vuelve en `entidades` para anotarlo en el sheet.
//
// `existentes`: la carpeta que PROYECTOS ya tiene linkeada para cada destino. Si
// sigue viva, se respeta tal cual y no se busca ni crea nada: un proyecto tiene UNA
// carpeta aunque le cambien la fecha o el nombre (el #2195 pasó del 15/8 al 14/9 y
// quedaron dos), y si el equipo la eligió a mano (People Week de Unilever, donde el
// crudo va directo a Entregas) esa es la buena.
//   { nro, fechaEvento, agencia, cliente, proyecto, destinos, subcarpetas, entidades, existentes, dryRun }
// Devuelve { crudo:{id,link,ruta,subs,creada,recursos,entidades}, entregas:{...}, pasos:[] }
export async function carpetaProyecto({ nro, fechaEvento, agencia, cliente, proyecto, destinos = ['crudo'], subcarpetas = {}, entidades = {}, existentes = {}, dryRun = false }) {
  const drive = getDrive()
  const iso = fechaISO(fechaEvento)
  const anio = iso ? iso.slice(0, 4) : String(new Date().getFullYear())
  const nomProy = nombreCarpetaProyecto({ fechaEvento, proyecto: proyecto || cliente || agencia || 'Proyecto' })

  const out = { pasos: [] }

  for (const destino of destinos) {
    const esCrudo = destino === 'crudo'
    const driveId = esCrudo ? DRIVE_CRUDO : DRIVE_ENTREGAS
    const ya = existentes[destino]
    if (ya && await vive(drive, ya)) {
      out[destino] = { id: ya, link: linkDe(ya), ruta: 'la carpeta que ya tiene PROYECTOS', subs: {}, creada: false, renombrada: null, recursos: {}, entidades: {} }
      out.pasos.push(`${destino}: ya tenía carpeta, se respeta`)
      continue
    }
    const ag = nombreCarpeta(agencia), cli = nombreCarpeta(cliente)
    const dosNiveles = !!(ag && cli && clave(ag) !== clave(cli))
    const pre = esCrudo ? 'CR_' : ''
    const mapAg = (await vive(drive, entidades.agencia?.[destino])) ? entidades.agencia[destino] : null
    const mapCli = (await vive(drive, entidades.cliente?.[destino])) ? entidades.cliente[destino] : null

    // Qué niveles de entidad hay que buscar/crear, y desde dónde se arranca.
    let parent = driveId
    const ruta = []
    const nivelesEntidad = []   // [{ nombre, rol }]
    if (mapCli) { parent = mapCli; ruta.push('cliente (del sheet)') }
    else if (mapAg) { parent = mapAg; ruta.push('agencia (del sheet)'); if (dosNiveles) nivelesEntidad.push({ nombre: `${pre}${cli}`, rol: 'cliente' }) }
    else if (dosNiveles) nivelesEntidad.push({ nombre: `${pre}${ag}`, rol: 'agencia' }, { nombre: `${pre}${cli}`, rol: 'cliente' })
    else nivelesEntidad.push({ nombre: `${pre}${cli || ag || 'SIN_CLIENTE'}`, rol: 'cliente' })

    const vistas = { agencia: mapAg, cliente: mapCli }
    let creadaAlguna = false, renombrada = null, seguir = true

    for (const { nombre, rol } of nivelesEntidad) {
      if (dryRun) {
        const hay = await buscar(drive, parent, driveId, nombre)
        ruta.push(hay ? hay.name : nombre + '  ← se crea')
        if (!hay) { seguir = false; creadaAlguna = true; break }
        parent = hay.id; vistas[rol] = hay.id; continue
      }
      const c = await asegurarCarpeta(drive, parent, driveId, nombre)
      ruta.push(c.name); parent = c.id; vistas[rol] = c.id
      if (c.creada) creadaAlguna = true
    }
    // Agencia y cliente son el mismo (CMQ / CMQ): la carpeta sirve para las dos filas del sheet.
    if (!dosNiveles && ag && !vistas.agencia) vistas.agencia = vistas.cliente

    // En ENTREGAS, la agencia y el cliente tienen su carpeta "Recursos": logo, gráfica y
    // todo lo general (Juan, 14/9/2026). El link va a AGENCIAS / CLIENTES ("Drive Recursos").
    const recursos = {}
    if (!esCrudo && !dryRun) {
      for (const rol of dosNiveles ? ['agencia', 'cliente'] : ['cliente']) {
        if (!vistas[rol]) continue
        try { const rc = await asegurarCarpeta(drive, vistas[rol], driveId, 'Recursos'); recursos[rol] = { id: rc.id, link: linkDe(rc.id), creada: rc.creada } } catch (e) { /* sin Recursos no se frena nada */ }
      }
    }

    // AÑO y la carpeta del proyecto
    if (seguir && dryRun) {
      const y = await buscar(drive, parent, driveId, anio, 'anio')
      ruta.push(y ? y.name : anio + '  ← se crea')
      if (y) {
        const p = await buscar(drive, y.id, driveId, nomProy, 'proyecto', nro)
        ruta.push(p ? p.name + (p.renombrar ? `  → ${nomProy}` : '') : nomProy + '  ← se crea')
        parent = p ? p.id : null
      } else parent = null
    } else if (seguir) {
      const y = await asegurarCarpeta(drive, parent, driveId, anio, true, 'anio')
      ruta.push(y.name); if (y.creada) creadaAlguna = true
      const p = await asegurarCarpeta(drive, y.id, driveId, nomProy, true, 'proyecto', nro)
      ruta.push(p.renombradaDe ? `${p.name}  (era ${p.renombradaDe})` : p.name)
      parent = p.id
      if (p.creada) creadaAlguna = true
      if (p.renombradaDe) renombrada = p.renombradaDe
    } else parent = null

    // Subcarpetas por tipo de material (Fotos / Videos)
    const subs = {}
    const pedidas = subcarpetas[destino] || []
    if (!dryRun && parent) {
      for (const sn of pedidas) {
        const c = await asegurarCarpeta(drive, parent, driveId, sn)
        subs[sn] = { id: c.id, link: linkDe(c.id) }
        if (c.creada) creadaAlguna = true
      }
    }
    out[destino] = {
      id: dryRun ? null : parent,
      link: dryRun || !parent ? null : linkDe(parent),
      ruta: ruta.join(' / '),
      subs,
      creada: creadaAlguna,
      renombrada,
      recursos,
      entidades: {
        agencia: vistas.agencia ? { id: vistas.agencia, link: linkDe(vistas.agencia) } : null,
        cliente: vistas.cliente ? { id: vistas.cliente, link: linkDe(vistas.cliente) } : null,
      },
    }
    out.pasos.push(`${destino}: ${ruta.join(' / ')}${pedidas.length ? ' → ' + pedidas.join(' + ') : ''}`)
  }
  return out
}

// Comparte una carpeta con una lista de mails (writer por defecto).
// No manda mail de notificación: el aviso se lo damos nosotros por WhatsApp/mail.
export async function compartirCarpeta(folderId, mails, role = 'writer') {
  const drive = getDrive()
  const ok = [], fallo = []
  for (const m of [...new Set((mails || []).map(x => String(x || '').trim()).filter(x => /@/.test(x)))]) {
    try {
      await drive.permissions.create({
        fileId: folderId,
        requestBody: { type: 'user', role, emailAddress: m },
        sendNotificationEmail: false, supportsAllDrives: true,
      })
      ok.push(m)
    } catch (e) { fallo.push({ mail: m, error: e.message }) }
  }
  return { ok, fallo }
}

// ------------------------------------------------------------------
// Crea las carpetas de un proyecto que YA está en el sheet y guarda el link.
// La usan el endpoint /api/drive-carpeta y el flujo de aprobar presupuesto.
// { sheets, SHEET_ID, num, destinos, compartir, dryRun } → resultado + links
// ------------------------------------------------------------------
// Dónde sube el fotógrafo las fotos ya editadas: "Pre-entregas" del proyecto, con
// permiso de edición para su mail. Antes la citación le daba el link de la carpeta del
// proyecto entera (que adentro tiene Pre-entregas y Finales, sin decir en cuál) y encima
// no se la compartía: la app solo daba permiso sobre Crudo. Resultado al 18/9/2026:
// ninguna foto subida por un fotógrafo con su mail, todas por alguien de Magma o con la
// cuenta "equipo". De Pre-entregas las saca el PM con "🖼 Fotos" (api/drive-fotos.js).
export async function carpetaParaSubirFotos(entregaId, mails = []) {
  const drive = getDrive()
  const c = await asegurarCarpeta(drive, entregaId, DRIVE_ENTREGAS, SUB_PRE)
  const compartido = mails.length ? await compartirCarpeta(c.id, mails) : { ok: [], fallo: [] }
  return { id: c.id, link: linkDe(c.id), compartido }
}

export async function asegurarCarpetasProyecto({ sheets, SHEET_ID, num, destinos = ['crudo', 'entregas'], compartir = false, dryRun = false }) {
  const colLetra = c => { let s='', n=c+1; while(n>0){ n--; s=String.fromCharCode(65+(n%26))+s; n=Math.floor(n/26) } return s }

  const rP = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:EW' })
  const rows = rP.data.values || []
  const h = rows[0] || []
  const iNum = h.indexOf('N° presupuesto')
  let fila = null, sheetRow = -1
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][iNum] || '').trim() === String(num).trim()) { fila = rows[i]; sheetRow = i + 1; break }
  }

  let datos, pedidos = []
  if (fila) {
    datos = {
      nro: num,
      fechaEvento: fila[h.indexOf('Fecha Evento')] || '',
      agencia: fila[h.indexOf('Agencia')] || '',
      cliente: fila[h.indexOf('Cliente')] || '',
      proyecto: fila[h.indexOf('Proyecto')] || '',
    }
    for (let n = 1; n <= MAX_SLOTS; n++) {
      const p = String(fila[SLOT_PROY(n).pedido] || '').trim()
      if (p) pedidos.push(p)
    }
  } else {
    // Todavía no está en PROYECTOS (ej: se aprobó recién) → leer del presupuesto
    const rB = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A:K' })
    const bRows = rB.data.values || [], bh = bRows[0] || []
    const bFila = bRows.slice(1).find(r => String(r[0] || '').trim() === String(num).trim())
    if (!bFila) throw new Error(`No encontré el presupuesto #${num}`)
    // Un número represupuestado o desaprobado no tiene carpeta: la tiene el número
    // vigente. Si se crea igual, aparece una carpeta "2191_…" al lado de la
    // "2293_…" que ya tiene el material (por poco pasa con Farmacity, 14/9/2026).
    const estadoB = String(bFila[3] || '').trim().toUpperCase()
    if (estadoB === 'REPRESUPUESTADO' || estadoB === 'DESAPROBADO') {
      const k = s => sinTildes(s).toLowerCase().replace(/[^a-z0-9]/g, '')
      const cli = k(bFila[bh.indexOf('Cliente')]), pro = k(bFila[bh.indexOf('Proyecto')])
      const iC = h.indexOf('Cliente'), iP = h.indexOf('Proyecto')
      const sucesor = rows.slice(1).find(r2 => k(r2[iC]) === cli && k(r2[iP]) === pro)
      const suc = sucesor ? String(sucesor[iNum] || '').trim() : ''
      throw new Error(`El #${num} está ${estadoB.toLowerCase()}${suc ? ` — ahora es el #${suc}` : ''}. Las carpetas van con el número vigente: apretá "↻ Actualizar" en el tablero.`)
    }
    datos = {
      nro: num,
      fechaEvento: bFila[bh.indexOf('Fecha Evento')] || '',
      agencia: bFila[bh.indexOf('Agencia')] || '',
      cliente: bFila[bh.indexOf('Cliente')] || '',
      proyecto: bFila[bh.indexOf('Proyecto')] || '',
    }
    // Los pedidos del presupuesto (para saber si hay foto, video o las dos)
    const rB2 = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A:DI' })
    const b2 = (rB2.data.values || []).slice(1).find(r2 => String(r2[0] || '').trim() === String(num).trim())
    if (b2) for (let n = 1; n <= MAX_SLOTS; n++) {
      const p = String(b2[SLOT_PRESU(n).pedido] || '').trim()
      if (p) pedidos.push(p)
    }
  }

  const subcarpetas = subcarpetasDe(pedidos)

  // Dónde vive cada agencia y cliente en Drive, según el sheet (ver carpetaProyecto).
  const k = s => sinTildes(s).toUpperCase().replace(/[^A-Z0-9]/g, '')
  const idDe = l => (String(l || '').match(/[-\w]{25,}/) || [])[0] || ''
  const hojas = {}
  for (const [hoja, nombre] of [['AGENCIAS', datos.agencia], ['CLIENTES', datos.cliente]]) {
    try {
      const rr = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${hoja}!A:Z` })
      const rows2 = rr.data.values || []
      hojas[hoja] = { rows: rows2, hh: rows2[0] || [], fi: nombre ? rows2.findIndex((x, i) => i > 0 && k(x[0]) === k(nombre)) : -1 }
    } catch (e) { hojas[hoja] = { rows: [], hh: [], fi: -1 } }
  }
  const celda = (hoja, col) => { const H = hojas[hoja]; const i = H.hh.indexOf(col); return (H.fi > 0 && i > -1) ? String(H.rows[H.fi][i] || '').trim() : '' }
  const entidades = {
    agencia: { crudo: idDe(celda('AGENCIAS', 'Drive Crudo')), entregas: idDe(celda('AGENCIAS', 'Drive Entregas')) },
    cliente: { crudo: idDe(celda('CLIENTES', 'Drive Crudo')), entregas: idDe(celda('CLIENTES', 'Drive Entregas')) },
  }

  // La carpeta que el proyecto ya tiene (si sigue viva, se respeta: ver carpetaProyecto)
  const existentes = fila ? { crudo: idDe(fila[h.indexOf('Drive Crudo')]), entregas: idDe(fila[h.indexOf('Drive Entrega')]) } : {}
  const r = await carpetaProyecto({ ...datos, destinos, subcarpetas, entidades, existentes, dryRun })
  if (dryRun) return { ...r, datos, dryRun: true }

  // Anotar en AGENCIAS / CLIENTES lo que se encontró o creó, si la celda está vacía:
  // la carpeta de la entidad ("Drive Crudo" / "Drive Entregas") y sus "Recursos".
  // La carpeta del CLIENTE se anota sola únicamente si es cliente directo (sin agencia
  // arriba): Iveco vive bajo ADN y bajo Ostara, y una sola celda no puede decir las
  // dos. Para los casos como Austral o Mani King la carga alguien a mano, y manda.
  const dosNiveles = !!(nombreCarpeta(datos.agencia) && nombreCarpeta(datos.cliente) && k(datos.agencia) !== k(datos.cliente))
  const escribir = []
  for (const [hoja, rol] of [['AGENCIAS', 'agencia'], ['CLIENTES', 'cliente']]) {
    const H = hojas[hoja]; if (!H || H.fi <= 0) continue
    const poner = (col, link) => { const i = H.hh.indexOf(col); if (i > -1 && link && !String(H.rows[H.fi][i] || '').trim()) escribir.push({ range: `${hoja}!${colLetra(i)}${H.fi + 1}`, values: [[link]] }) }
    poner('Drive Recursos', r.entregas?.recursos?.[rol]?.link)
    if (rol === 'cliente' && dosNiveles) continue
    poner('Drive Crudo', r.crudo?.entidades?.[rol]?.link)
    poner('Drive Entregas', r.entregas?.entidades?.[rol]?.link)
  }
  if (escribir.length) {
    try { await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: escribir } }) } catch (e) { /* best-effort */ }
  }

  // Guardar los links en PROYECTOS
  const data = []
  const iCrudo = h.indexOf('Drive Crudo'), iEnt = h.indexOf('Drive Entrega'), iFin = h.indexOf('Drive Finales')
  // "Drive Finales" es el link que se le manda al cliente: la subcarpeta Finales
  // (o Fotos, en las carpetas viejas), nunca la del proyecto, que tiene Pre-entregas.
  const linkFinales = r.entregas?.subs?.['Finales']?.link || r.entregas?.subs?.['Fotos']?.link || ''
  if (sheetRow > 0) {
    if (r.crudo?.link && iCrudo > -1) data.push({ range: `PROYECTOS!${colLetra(iCrudo)}${sheetRow}`, values: [[r.crudo.link]] })
    if (r.entregas?.link && iEnt > -1) data.push({ range: `PROYECTOS!${colLetra(iEnt)}${sheetRow}`, values: [[r.entregas.link]] })
    if (linkFinales && iFin > -1) data.push({ range: `PROYECTOS!${colLetra(iFin)}${sheetRow}`, values: [[linkFinales]] })
    if (data.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data } })
  }

  // Compartir la carpeta de crudo con el staff asignado (mails de RRHH)
  let compartido = null
  if (compartir && r.crudo?.id && fila) {
    const nombres = []
    h.forEach((col, i) => {
      const ht = String(col || '').trim()
      if ((ht === 'Staff' || /^Staff \d+$/.test(ht)) && fila[i]) {
        const nom = String(fila[i]).trim()
        if (nom && nom !== 'Somos Magma') nombres.push(nom)
      }
    })
    const rRH = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'RRHH!A:D' })
    const rh = rRH.data.values || []
    const iNom = (rh[0] || []).indexOf('Nombre Apellido'), iMail = (rh[0] || []).indexOf('Mail')
    const mailDe = {}
    rh.slice(1).forEach(x => { const n = String(x[iNom] || '').trim().toLowerCase(); const m = String(x[iMail] || '').trim(); if (n && /@/.test(m)) mailDe[n] = m })
    const mails = [...new Set(nombres)].map(n => mailDe[n.toLowerCase()]).filter(Boolean)
    const sinMail = [...new Set(nombres)].filter(n => !mailDe[n.toLowerCase()])
    compartido = { ...(await compartirCarpeta(r.crudo.id, mails)), sinMail }
  }

  return { ...r, datos, compartido, guardadoEnSheet: data.length > 0 }
}

// ------------------------------------------------------------------
// "Dar el crudo al cliente": pone un ACCESO DIRECTO a la carpeta de CRUDO
// dentro de la carpeta de entrega del cliente y le da lectura sobre el crudo.
// No copia archivos — si después se sube más material, el cliente lo ve solo.
// ------------------------------------------------------------------
export async function darCrudoAlCliente({ sheets, SHEET_ID, num, mails = [] }) {
  const drive = getDrive()
  const r = await asegurarCarpetasProyecto({ sheets, SHEET_ID, num, destinos: ['crudo', 'entregas'] })
  const crudoId = r.crudo?.id, entregaId = r.entregas?.id
  if (!crudoId || !entregaId) throw new Error('No pude resolver las dos carpetas del proyecto')

  // ¿ya está el acceso directo?
  const ya = await drive.files.list({
    q: `'${entregaId}' in parents and trashed=false and mimeType='application/vnd.google-apps.shortcut'`,
    includeItemsFromAllDrives: true, supportsAllDrives: true,
    fields: 'files(id,name,shortcutDetails)',
  })
  let atajo = (ya.data.files || []).find(f => f.shortcutDetails?.targetId === crudoId)
  if (!atajo) {
    const c = await drive.files.create({
      requestBody: {
        name: 'Crudo', mimeType: 'application/vnd.google-apps.shortcut',
        parents: [entregaId], shortcutDetails: { targetId: crudoId },
      },
      fields: 'id,name', supportsAllDrives: true,
    })
    atajo = c.data
  }

  // El atajo solo se ve si el cliente tiene permiso sobre el destino
  const permisos = mails.length ? await compartirCarpeta(crudoId, mails, 'reader') : null

  return {
    atajo: { id: atajo.id, creado: !ya.data.files?.length },
    crudo: r.crudo, entregas: r.entregas,
    permisos,
    faltaCompartir: !mails.length,
  }
}
