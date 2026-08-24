// ============================ CARPETAS EN DRIVE ============================
// Crea la carpeta de un proyecto en las unidades compartidas, respetando la
// convención oficial (ver memoria project_drive_naming_convention):
//
//   CRUDO     CR_AGENCIA / CR_CLIENTE / AAAA / NRO_AAAA-MM-DD_Proyecto
//   ENTREGAS  CLIENTE / AAAA / NRO_AAAA-MM-DD_Proyecto     (sin prefijo CR_)
//
// Es idempotente: si la carpeta ya existe la devuelve, no duplica. El match es
// tolerante (ignora tildes, espacios y el prefijo CR_) porque en Crudo ya hay
// pares como "CR_ CMQ" y "CR_CMQ" — no queremos agregar un tercero.

import { google } from 'googleapis'
import { SLOT_PROY, SLOT_PRESU, MAX_SLOTS } from './slots.js'
import { subcarpetasDe } from './edicion.js'

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

// Nombre del proyecto (nivel 4): respeta mayúsculas/minúsculas, saca lo raro.
// Corta en 80 chars pero en el último "_" para no partir una palabra al medio.
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

// Busca una subcarpeta por nombre (tolerante). Devuelve {id,name} o null.
async function buscar(drive, parentId, driveId, nombre) {
  const r = await drive.files.list({
    q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    driveId, corpora: 'drive', includeItemsFromAllDrives: true, supportsAllDrives: true,
    pageSize: 200, fields: 'files(id,name)',
  })
  const files = r.data.files || []
  const k = clave(nombre)
  return files.find(f => clave(f.name) === k) || null
}

// get-or-create de una subcarpeta. crear=false → no la crea, solo busca.
export async function asegurarCarpeta(drive, parentId, driveId, nombre, crear = true) {
  const existe = await buscar(drive, parentId, driveId, nombre)
  if (existe) return { ...existe, creada: false }
  if (!crear) return null
  const r = await drive.files.create({
    requestBody: { name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id,name', supportsAllDrives: true,
  })
  return { ...r.data, creada: true }
}

const linkDe = id => `https://drive.google.com/drive/folders/${id}`

// ---- La función que usa la app ----
// Crea (o encuentra) la carpeta del proyecto en CRUDO y/o ENTREGAS, con las
// subcarpetas que correspondan según lo que se vendió (Fotos / Videos).
// { nro, fechaEvento, agencia, cliente, proyecto, destinos, subcarpetas, dryRun }
// Devuelve { crudo:{id,link,ruta,subs,creada}, entregas:{...}, pasos:[] }
export async function carpetaProyecto({ nro, fechaEvento, agencia, cliente, proyecto, destinos = ['crudo'], subcarpetas = {}, dryRun = false }) {
  const drive = getDrive()
  const iso = fechaISO(fechaEvento)
  const anio = iso ? iso.slice(0, 4) : String(new Date().getFullYear())
  const nomProy = [String(nro || '').trim(), iso, nombreProyecto(proyecto || cliente || agencia || 'Proyecto')]
    .filter(Boolean).join('_')

  const out = { pasos: [] }

  for (const destino of destinos) {
    const esCrudo = destino === 'crudo'
    const driveId = esCrudo ? DRIVE_CRUDO : DRIVE_ENTREGAS
    // Ruta de niveles intermedios
    const ag = nombreCarpeta(agencia), cli = nombreCarpeta(cliente)
    let niveles
    if (esCrudo) {
      // Con agencia: CR_AGENCIA/CR_CLIENTE. Sin agencia (o igual al cliente): CR_CLIENTE.
      niveles = (ag && cli && clave(ag) !== clave(cli)) ? [`CR_${ag}`, `CR_${cli}`]
              : [`CR_${ag || cli || 'SIN_CLIENTE'}`]
    } else {
      // Entregas no usa prefijo y va por el cliente final (es lo que ve el cliente).
      niveles = [cli || ag || 'SIN_CLIENTE']
    }
    niveles.push(anio, nomProy)

    let parent = driveId
    const ruta = []
    let creadaAlguna = false
    for (const n of niveles) {
      if (dryRun) {
        const hay = await buscar(drive, parent, driveId, n)
        ruta.push(hay ? n : n + '  ← se crea')
        if (!hay) { parent = null; creadaAlguna = true; break }  // no podemos seguir bajando en dry-run
        parent = hay.id
        continue
      }
      const c = await asegurarCarpeta(drive, parent, driveId, n)
      ruta.push(c.name); parent = c.id
      if (c.creada) creadaAlguna = true
    }
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
export async function asegurarCarpetasProyecto({ sheets, SHEET_ID, num, destinos = ['crudo', 'entregas'], compartir = false, dryRun = false }) {
  const colLetra = c => { let s='', n=c+1; while(n>0){ n--; s=String.fromCharCode(65+(n%26))+s; n=Math.floor(n/26) } return s }

  const rP = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:ET' })
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
  const r = await carpetaProyecto({ ...datos, destinos, subcarpetas, dryRun })
  if (dryRun) return { ...r, datos, dryRun: true }

  // Guardar los links en PROYECTOS
  const data = []
  const iCrudo = h.indexOf('Drive Crudo'), iEnt = h.indexOf('Drive Entrega')
  if (sheetRow > 0) {
    if (r.crudo?.link && iCrudo > -1) data.push({ range: `PROYECTOS!${colLetra(iCrudo)}${sheetRow}`, values: [[r.crudo.link]] })
    if (r.entregas?.link && iEnt > -1) data.push({ range: `PROYECTOS!${colLetra(iEnt)}${sheetRow}`, values: [[r.entregas.link]] })
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
