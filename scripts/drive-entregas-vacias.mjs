/**
 * Borra de la raíz de ENTREGAS las carpetas que quedaron vacías.
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
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/drive'] })
const drive = google.drive({ version: 'v3', auth })
const ENT = '0AK9Y6BbDhgekUk9PVA'
const ESCRIBIR = process.argv.includes('--escribir')

const hijos = async p => (await drive.files.list({ q: `'${p}' in parents and trashed=false`, driveId: ENT, corpora: 'drive', includeItemsFromAllDrives: true, supportsAllDrives: true, pageSize: 1000, fields: 'files(id,name,mimeType)' })).data.files || []

// ¿Tiene algo de verdad adentro? Baja hasta 3 niveles buscando un archivo.
const tieneAlgo = async (id, nivel = 0) => {
  const hs = await hijos(id)
  if (hs.some(f => f.mimeType !== 'application/vnd.google-apps.folder')) return true
  if (nivel >= 3) return hs.length > 0
  for (const f of hs) if (await tieneAlgo(f.id, nivel + 1)) return true
  return false
}

const raiz = (await hijos(ENT)).filter(f => f.mimeType === 'application/vnd.google-apps.folder')
const vacias = [], conCosas = []
for (const f of raiz) ((await tieneAlgo(f.id)) ? conCosas : vacias).push(f)

console.log(`\nENTREGAS: ${raiz.length} carpetas en la raíz · con contenido: ${conCosas.length}`)
console.log(`\n── VACÍAS, a borrar (${vacias.length}):`)
vacias.forEach(f => console.log(`   ${f.name}   https://drive.google.com/drive/folders/${f.id}`))
if (!ESCRIBIR) { console.log('\n(preview — corré con --escribir para borrarlas)\n'); process.exit(0) }
if (!vacias.length) { console.log('\nNada para borrar.\n'); process.exit(0) }

let n = 0
for (const f of vacias) {
  try { await drive.files.delete({ fileId: f.id, supportsAllDrives: true }); n++; console.log(`   ✓ ${f.name}`) }
  catch (e) { console.log(`   ✗ ${f.name}: ${e.message}`) }
}
const quedan = (await hijos(ENT)).filter(f => f.mimeType === 'application/vnd.google-apps.folder').length
console.log(`\n✓ ${n} borradas · la raíz quedó con ${quedan} carpetas\n`)
