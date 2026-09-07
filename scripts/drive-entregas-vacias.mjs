/**
 * Manda a la papelera las carpetas de la raíz de ENTREGAS que quedaron vacías.
 *
 * Después de unificar, la carpeta suelta queda con el año adentro y nada más
 * ("IVECO/2026/" sin ningún proyecto). Eso es cáscara: confunde igual que antes.
 *
 * Solo borra lo que NO tiene un archivo ni una carpeta de proyecto adentro. Si algo
 * tiene contenido de verdad, lo lista y no lo toca.
 *
 * Uso:  node scripts/drive-entregas-vacias.mjs             (preview)
 *       node scripts/drive-entregas-vacias.mjs --escribir
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets.readonly'] })
const drive = google.drive({ version: 'v3', auth })
const sheetsApi = google.sheets({ version: 'v4', auth })
const SHEET = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ENT = '0AK9Y6BbDhgekUk9PVA'
const ESCRIBIR = process.argv.includes('--escribir')

const hijos = async p => (await drive.files.list({ q: `'${p}' in parents and trashed=false`, driveId: ENT, corpora: 'drive', includeItemsFromAllDrives: true, supportsAllDrives: true, pageSize: 1000, fields: 'files(id,name,mimeType)' })).data.files || []

// Los IDs de carpeta que el sheet tiene guardados. Una carpeta puede estar sin un
// solo archivo y ser la carpeta de entrega de un proyecto: el link ya está en
// PROYECTOS y borrarla lo rompe. Esto es la red de seguridad de verdad.
const S = await sheetsApi.spreadsheets.values.get({ spreadsheetId: SHEET, range: 'PROYECTOS!A:ET' })
const filas = S.data.values || []
const hS = filas[0] || []
const enElSheet = new Set()
;['Drive Entrega', 'Drive Crudo'].forEach(col => {
  const i = hS.indexOf(col); if (i < 0) return
  filas.slice(1).forEach(r => { const m = String(r[i] || '').match(/folders\/([A-Za-z0-9_-]{20,})/); if (m) enElSheet.add(m[1]) })
})
console.log(`Links de carpeta guardados en PROYECTOS: ${enElSheet.size}`)

// Motivo por el que una carpeta NO se puede borrar: un archivo, una carpeta de
// proyecto (empieza con el N° de presu) o un ID que el sheet ya tiene guardado.
const motivoParaNoBorrar = async (id, nivel = 0) => {
  if (enElSheet.has(id)) return 'el sheet la tiene guardada como carpeta del proyecto'
  const hs = await hijos(id)
  const arch = hs.find(f => f.mimeType !== 'application/vnd.google-apps.folder')
  if (arch) return `tiene archivos (${arch.name})`
  const proy = hs.find(f => /^\d{3,5}[_\s]/.test(f.name))
  if (proy) return `tiene la carpeta de un proyecto (${proy.name})`
  if (nivel >= 4) return hs.length ? 'tiene cosas adentro' : null
  for (const f of hs) { const m = await motivoParaNoBorrar(f.id, nivel + 1); if (m) return m }
  return null
}

const raiz = (await hijos(ENT)).filter(f => f.mimeType === 'application/vnd.google-apps.folder')
const vacias = [], conCosas = []
for (const f of raiz) {
  const m = await motivoParaNoBorrar(f.id)
  if (m) conCosas.push({ ...f, motivo: m }); else vacias.push(f)
}

console.log(`\nENTREGAS: ${raiz.length} carpetas en la raíz · con contenido: ${conCosas.length}`)
console.log(`\n── CÁSCARAS a borrar (${vacias.length}) — sin archivos, sin carpeta de proyecto y sin link en el sheet:`)
vacias.forEach(f => console.log(`   ${f.name}   https://drive.google.com/drive/folders/${f.id}`))
const dudosas = conCosas.filter(f => !/tiene archivos/.test(f.motivo))
if (dudosas.length) {
  console.log(`\n── NO se tocan, para que veas por qué (${dudosas.length}):`)
  dudosas.forEach(f => console.log(`   ${f.name.padEnd(24)} ${f.motivo}`))
}
if (!ESCRIBIR) { console.log('\n(preview — corré con --escribir para borrarlas)\n'); process.exit(0) }
if (!vacias.length) { console.log('\nNada para borrar.\n'); process.exit(0) }

let n = 0
for (const f of vacias) {
  // A la papelera, no borrado definitivo: la cuenta de servicio no tiene permiso de
  // borrar en la unidad compartida (canDeleteChildren=false) pero sí de tirar a la
  // papelera. Y es mejor así: en la papelera se recupera 30 días.
  try { await drive.files.update({ fileId: f.id, requestBody: { trashed: true }, supportsAllDrives: true }); n++; console.log(`   ✓ ${f.name} → papelera`) }
  catch (e) { console.log(`   ✗ ${f.name}: ${e.message}`) }
}
const quedan = (await hijos(ENT)).filter(f => f.mimeType === 'application/vnd.google-apps.folder').length
console.log(`\n✓ ${n} mandadas a la papelera · la raíz quedó con ${quedan} carpetas\n`)
