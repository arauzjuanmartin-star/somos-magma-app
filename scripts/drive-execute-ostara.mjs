// Ejecuta el plan A+B+C+D para CR_OSTARA con log detallado.
// Reglas:
// - "Mover" = cambiar parents (no copia, no destruye)
// - "Fusionar" = mover contenido al destino existente, borrar carpeta vacía origen
// - Borrar SOLO si la carpeta quedó vacía después de mover su contenido
import { google } from 'googleapis'
import { readFileSync, writeFileSync } from 'fs'

readFileSync('.env.local','utf-8').split('\n').forEach(l => {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"|"$/g,'')
})

const auth = new google.auth.GoogleAuth({
  credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') },
  scopes: ['https://www.googleapis.com/auth/drive'],
})
const drive = google.drive({ version: 'v3', auth })
const CRUDO = '0ALsTwjw6_Zc1Uk9PVA'

const log = []
const action = (op, detail) => { console.log(`${op}: ${detail}`); log.push({ op, detail, t: new Date().toISOString() }) }

const listFolder = async (parentId) => {
  const r = await drive.files.list({
    corpora: 'drive', driveId: CRUDO, includeItemsFromAllDrives: true, supportsAllDrives: true,
    q: `'${parentId}' in parents and trashed=false`,
    fields: 'files(id,name,mimeType)',
    pageSize: 1000, orderBy: 'name',
  })
  return r.data.files || []
}
const moveFile = async (id, newParent, newName=null) => {
  const cur = await drive.files.get({ fileId: id, fields: 'parents', supportsAllDrives: true })
  const remove = (cur.data.parents||[]).join(',')
  const body = { supportsAllDrives: true, fileId: id, addParents: newParent, removeParents: remove }
  if (newName) body.requestBody = { name: newName }
  await drive.files.update(body)
}
const renameFile = async (id, newName) => {
  await drive.files.update({ supportsAllDrives: true, fileId: id, requestBody: { name: newName } })
}
const createFolder = async (name, parent) => {
  const r = await drive.files.create({
    supportsAllDrives: true,
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] },
    fields: 'id,name',
  })
  return r.data
}
const deleteIfEmpty = async (id, name) => {
  const items = await listFolder(id)
  if (items.length === 0) {
    await drive.files.update({ supportsAllDrives: true, fileId: id, requestBody: { trashed: true } })
    action('DELETE_EMPTY', `${name} (${id})`)
    return true
  }
  action('SKIP_NONEMPTY', `${name} todavía tiene ${items.length} items — no la borro`)
  return false
}

const norm = s => String(s||'').trim().toUpperCase().replace(/\s+/g,'_').replace(/[^A-Z0-9_-]/g,'')

const top = await listFolder(CRUDO)
const ostara = top.find(f => /^cr_+ostara$/i.test(f.name.replace(/\s+/g,'_')))
if (!ostara) throw new Error('No CR_OSTARA top-level')

const dentro = await listFolder(ostara.id)

// Map de carpetas top-level normalizadas (para fusión)
const topByName = {}
top.forEach(f => { if (f.mimeType==='application/vnd.google-apps.folder') topByName[norm(f.name)] = f })

// =========== A) Mover/fusionar 15 carpetas CR_XXX a top-level ===========
console.log('\n========== A) CR_XXX a top-level ==========')
for (const item of dentro) {
  if (item.mimeType !== 'application/vnd.google-apps.folder') continue
  const m = item.name.match(/^CR_+(.+)$/i)
  if (!m) continue
  if (/^ ?ostara$/i.test(m[1].trim())) continue  // el duplicado CR_ OSTARA va en C
  const cliente = m[1].trim()
  const targetName = `CR_${norm(cliente)}`
  const exist = topByName[norm(targetName)]
  if (exist && exist.id !== item.id) {
    // Fusionar: mover contenido del item al exist, borrar item vacía
    action('FUSION_START', `${item.name} → existente '${exist.name}'`)
    const childs = await listFolder(item.id)
    for (const c of childs) {
      try {
        await moveFile(c.id, exist.id)
        action('  MOVE_CHILD', `'${c.name}' a CR_OSTARA → top '${exist.name}'`)
      } catch(e) { action('  ERROR', `mover '${c.name}': ${e.message}`) }
    }
    await deleteIfEmpty(item.id, item.name)
  } else {
    // Mover la carpeta a top, renombrando si es necesario
    try {
      await moveFile(item.id, CRUDO, item.name === targetName ? null : targetName)
      action('MOVE_TO_TOP', `'${item.name}' → top como '${targetName}'`)
      topByName[norm(targetName)] = { ...item, name: targetName }
    } catch(e) { action('ERROR', `mover '${item.name}': ${e.message}`) }
  }
}

// =========== B) Renombrar EXPOAGRO 2024 con convención nueva ===========
console.log('\n========== B) Renombrar proyecto matcheado ==========')
const expoagro = dentro.find(f => f.name === 'EXPOAGRO 2024')
if (expoagro) {
  // Crear año dentro de CR_OSTARA y mover
  const dentro2 = await listFolder(ostara.id)
  let anio2026 = dentro2.find(f => f.name === '2026' && f.mimeType==='application/vnd.google-apps.folder')
  if (!anio2026) {
    anio2026 = await createFolder('2026', ostara.id)
    action('CREATE', `CR_OSTARA/2026 (${anio2026.id})`)
  }
  const nombreNuevo = '1143_2026-03-10_Expoagro'
  await moveFile(expoagro.id, anio2026.id, nombreNuevo)
  action('MOVE_AND_RENAME', `'EXPOAGRO 2024' → CR_OSTARA/2026/${nombreNuevo}`)
}

// =========== C) Unificar CR_ OSTARA duplicada ===========
console.log('\n========== C) Unificar CR_ OSTARA duplicada ==========')
const dentroAhora = await listFolder(ostara.id)
const ostaraDup = dentroAhora.find(f => /^cr_+ ?ostara$/i.test(f.name.replace(/\s+/g,' ').trim()))
if (ostaraDup) {
  const childs = await listFolder(ostaraDup.id)
  action('FUSION_DUP', `${ostaraDup.name} tiene ${childs.length} items adentro`)
  for (const c of childs) {
    try {
      await moveFile(c.id, ostara.id)
      action('  MOVE_OUT', `'${c.name}' de duplicado a CR_OSTARA raíz`)
    } catch(e) { action('  ERROR', `mover '${c.name}': ${e.message}`) }
  }
  await deleteIfEmpty(ostaraDup.id, ostaraDup.name)
}

// =========== D) 14 items sin match ===========
console.log('\n========== D) Items sin match → top-level como CR_NOMBRE ==========')
const dentroFinal = await listFolder(ostara.id)
// Crear carpeta _revisar dentro de CR_OSTARA por si hay archivos sueltos
let revisar = dentroFinal.find(f => f.name === '_revisar' && f.mimeType==='application/vnd.google-apps.folder')
const itemsD = dentroFinal.filter(f => {
  if (f.name === '2026' || f.name === '_revisar') return false
  if (/^CR_+/i.test(f.name)) return false  // ya procesado en A
  // sólo los que quedan sin patrón
  return true
})
for (const item of itemsD) {
  const isFolder = item.mimeType === 'application/vnd.google-apps.folder'
  if (!isFolder) {
    if (!revisar) {
      revisar = await createFolder('_revisar', ostara.id)
      action('CREATE', `CR_OSTARA/_revisar`)
    }
    try {
      await moveFile(item.id, revisar.id)
      action('MOVE_TO_REVISAR', `archivo '${item.name}' → CR_OSTARA/_revisar`)
    } catch(e) { action('ERROR', `mover '${item.name}': ${e.message}`) }
    continue
  }
  const targetName = `CR_${norm(item.name)}`
  const exist = topByName[norm(targetName)]
  if (exist) {
    action('SKIP_EXIST', `'${item.name}' → ya existe '${exist.name}' en top, fusiono contenido`)
    const childs = await listFolder(item.id)
    for (const c of childs) {
      try {
        await moveFile(c.id, exist.id)
        action('  MOVE_CHILD', `'${c.name}' a top '${exist.name}'`)
      } catch(e) { action('  ERROR', `mover '${c.name}': ${e.message}`) }
    }
    await deleteIfEmpty(item.id, item.name)
  } else {
    try {
      await moveFile(item.id, CRUDO, targetName)
      action('MOVE_TO_TOP', `'${item.name}' → top como '${targetName}'`)
      topByName[norm(targetName)] = { ...item, name: targetName }
    } catch(e) { action('ERROR', `mover '${item.name}': ${e.message}`) }
  }
}

writeFileSync('/tmp/drive-ostara-log.json', JSON.stringify(log, null, 2))
console.log(`\n✓ Plan ejecutado. Log de ${log.length} acciones en /tmp/drive-ostara-log.json`)
