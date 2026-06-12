// REVERT del movimiento erróneo: todos los CR_X que metí en top-level desde adentro de Ostara
// son CLIENTES de Ostara (agencia). La convención correcta es:
//   CR_AGENCIA / CR_CLIENTE / AÑO / NRO_FECHA_Proyecto
// Este script:
// - Mueve CR_X (que originalmente estaban en CR_OSTARA) de vuelta a CR_OSTARA/
// - Arregla tildes mal stripeadas (CR_BAG_1 → CR_BAGO_1, CR_COLORN → CR_COLORIN)
// - Mueve Fotos retratos a CR_OSTARA
// - Mueve el EXPOAGRO mezclado a CR_OSTARA/CR_SANTANDER/_legacy_Expoagro_2024-2026
// - Reporta el conflicto CR_PERSONAL (no toca, hay que separar manual)
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
    fields: 'files(id,name,mimeType)', pageSize: 1000, orderBy: 'name',
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
    action('DELETE_EMPTY', name)
    return true
  }
  return false
}

// Normalizador MEJORADO: reemplaza tildes por la letra base (Ó→O), no las strip
const stripAccents = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'')
const norm = s => stripAccents(s).trim().toUpperCase().replace(/\s+/g,'_').replace(/[^A-Z0-9_-]/g,'')

// Lista de carpetas que fueron MOVIDAS DESDE ADENTRO de CR_OSTARA → deben volver
// Renombrar las que perdieron tildes
const renombres = {
  'CR_BAG_1': 'CR_BAGO_1',
  'CR_COLORN': 'CR_COLORIN',
  'CR_11__3_-_LATAM': 'CR_LATAM_11_3',
}
// Lista completa de las que estaban dentro de CR_OSTARA originalmente (del primer run)
const aMoverDeVuelta = [
  'CR_AXION','CR_CASTROL','CR_CITROEN','CR_CONTENIDO_OSTARA','CR_HONDA','CR_LATAM',
  'CR_NUTRICIA','CR_S34_GIN','CR_SANTANDER','CR_SUPRA','CR_SYNGENTA','CR_ZEBRA',
  'CR_11__3_-_LATAM','CR_BAG_1','CR_BAGO_2','CR_BANCO_CENTRAL','CR_BAYER','CR_COLORN',
  'CR_EVENTO_INSPIRING_MINDS','CR_EXPO_ENERGIA_FOTOS','CR_FOTOS_RETRATOS',
  'CR_MERCADO_LIBRE_CRUDO','CR_NUTRICIA_UNIVERSO','CR_PAE','CR_TELECOM',
]

const top = await listFolder(CRUDO)
const ostara = top.find(f => /^cr_ostara$/i.test(f.name))
if (!ostara) throw new Error('No CR_OSTARA top-level')
const dentroOstara = await listFolder(ostara.id)
const dentroByName = {}
dentroOstara.forEach(f => { dentroByName[norm(f.name)] = f })

console.log('========== REVERT: mover CR_X de top → CR_OSTARA/CR_X ==========\n')
for (const name of aMoverDeVuelta) {
  const folder = top.find(f => f.mimeType==='application/vnd.google-apps.folder' && f.name === name)
  if (!folder) { action('SKIP_MISSING', `${name} no está en top`); continue }
  const nombreFinal = renombres[name] || name
  // ¿Ya existe dentro de CR_OSTARA?
  const existe = dentroByName[norm(nombreFinal)]
  if (existe) {
    // Fusionar contenido
    action('FUSION_START', `${name} (top) → CR_OSTARA/${existe.name}`)
    const childs = await listFolder(folder.id)
    for (const c of childs) {
      try { await moveFile(c.id, existe.id); action('  MOVE_CHILD', `'${c.name}' → CR_OSTARA/${existe.name}`) }
      catch(e) { action('  ERROR', `'${c.name}': ${e.message}`) }
    }
    await deleteIfEmpty(folder.id, name)
  } else {
    try {
      await moveFile(folder.id, ostara.id, nombreFinal !== name ? nombreFinal : null)
      action('MOVE_BACK', `${name}${nombreFinal!==name?` (rename → ${nombreFinal})`:''} → CR_OSTARA/`)
      dentroByName[norm(nombreFinal)] = { ...folder, name: nombreFinal }
    } catch(e) { action('ERROR', `${name}: ${e.message}`) }
  }
}

// ========== EXPOAGRO mezclado: mover a CR_OSTARA/CR_SANTANDER/_legacy_Expoagro_2024-2026 ==========
console.log('\n========== EXPOAGRO mezclado → CR_SANTANDER/_legacy ==========')
const dentroAhora = await listFolder(ostara.id)
const anio2026 = dentroAhora.find(f => f.name === '2026' && f.mimeType==='application/vnd.google-apps.folder')
let santander = dentroAhora.find(f => f.name === 'CR_SANTANDER')
if (!santander) santander = { id: dentroByName['CR_SANTANDER']?.id }
if (anio2026 && santander.id) {
  const items = await listFolder(anio2026.id)
  const expoagro = items.find(f => /expoagro/i.test(f.name))
  if (expoagro) {
    try {
      await moveFile(expoagro.id, santander.id, '_legacy_Expoagro_2024-2026_revisar')
      action('MOVE_EXPOAGRO', `→ CR_OSTARA/CR_SANTANDER/_legacy_Expoagro_2024-2026_revisar`)
    } catch(e) { action('ERROR', `expoagro: ${e.message}`) }
  }
  await deleteIfEmpty(anio2026.id, 'CR_OSTARA/2026')
}

writeFileSync('/tmp/drive-ostara-revert-log.json', JSON.stringify(log, null, 2))
console.log(`\n✓ Revert completo. ${log.length} acciones en /tmp/drive-ostara-revert-log.json`)
console.log('\n⚠️ CONFLICTO CR_PERSONAL en top: existía antes + fusioné contenido de Ostara.')
console.log('   Quedó mezclado de OTRA agencia + Ostara. Hay que separar manual o decime cuál es la otra agencia.')
