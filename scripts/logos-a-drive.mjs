/**
 * SUBE LOS LOGOS A DRIVE — unidad compartida MARKETING, carpeta "LOGOS CLIENTES Y MARCAS".
 * Espeja public/branding/logos-clientes/ (MARCAS · MARCAS-extras · AGENCIAS · originales).
 * Limpia lo que quedó de corridas anteriores para que no queden logos viejos dando vueltas.
 * Uso: node scripts/logos-a-drive.mjs
 */
import { google } from 'googleapis'
import { readFileSync, readdirSync, createReadStream } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('='); let v = l.slice(i + 1).trim()
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    return [l.slice(0, i).trim(), v]
  })
)
const auth = new google.auth.GoogleAuth({
  credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
  scopes: ['https://www.googleapis.com/auth/drive'],
})
const drive = google.drive({ version: 'v3', auth })

const MARKETING = '0AKRJgVbkc3wgUk9PVA'
const LOCAL = 'public/branding/logos-clientes'
const RAIZ = 'LOGOS CLIENTES Y MARCAS'
const MAPA = [
  ['MARCAS', 'MARCAS Y CLIENTES FINALES'],
  ['MARCAS-extras', 'MARCAS - de repuesto'],
  ['AGENCIAS', 'PRODUCTORAS Y AGENCIAS'],
  ['originales', 'ORIGINALES (tamaño completo)'],
]

const hijos = async (parent) => {
  const r = await drive.files.list({
    q: `'${parent}' in parents and trashed=false`,
    driveId: MARKETING, corpora: 'drive', includeItemsFromAllDrives: true, supportsAllDrives: true,
    fields: 'files(id,name,mimeType)', pageSize: 200,
  })
  return r.data.files || []
}
const carpeta = async (nombre, parent) => {
  const ya = (await hijos(parent)).find(f => f.name === nombre && f.mimeType.includes('folder'))
  if (ya) return ya.id
  const r = await drive.files.create({
    requestBody: { name: nombre, mimeType: 'application/vnd.google-apps.folder', parents: [parent] },
    supportsAllDrives: true, fields: 'id',
  })
  return r.data.id
}

console.log('Subiendo a MARKETING → ' + RAIZ + '\n')
const raizId = await carpeta(RAIZ, MARKETING)

// limpieza: todo lo que no sea una de las 4 carpetas del mapa se va a la papelera
const esperadas = new Set(MAPA.map(m => m[1]))
for (const f of await hijos(raizId)) {
  if (!esperadas.has(f.name)) {
    await drive.files.update({ fileId: f.id, requestBody: { trashed: true }, supportsAllDrives: true })
    console.log(`  🗑  a papelera: ${f.name}`)
  }
}

let total = 0
for (const [local, remoto] of MAPA) {
  const id = await carpeta(remoto, raizId)
  const previos = Object.fromEntries((await hijos(id)).map(f => [f.name, f.id]))
  const files = readdirSync(`${LOCAL}/${local}`).filter(f => f.endsWith('.png'))
  for (const f of files) {
    const media = { mimeType: 'image/png', body: createReadStream(`${LOCAL}/${local}/${f}`) }
    if (previos[f]) { await drive.files.update({ fileId: previos[f], media, supportsAllDrives: true }); delete previos[f] }
    else await drive.files.create({ requestBody: { name: f, parents: [id] }, media, supportsAllDrives: true, fields: 'id' })
    total++
  }
  for (const [nombre, id2] of Object.entries(previos)) {   // sobrantes de corridas viejas
    await drive.files.update({ fileId: id2, requestBody: { trashed: true }, supportsAllDrives: true })
    console.log(`  🗑  a papelera: ${remoto}/${nombre}`)
  }
  console.log(`  ✓ ${remoto}: ${files.length} PNG`)
}

const previosRaiz = (await hijos(raizId)).find(f => f.name.startsWith('LEEME'))
const media = { mimeType: 'text/plain', body: createReadStream(`${LOCAL}/README.md`) }
if (previosRaiz) await drive.files.update({ fileId: previosRaiz.id, media, supportsAllDrives: true })
else await drive.files.create({ requestBody: { name: 'LEEME — de dónde salen y cómo usarlos.txt', parents: [raizId] }, media, supportsAllDrives: true, fields: 'id' })

const link = await drive.files.get({ fileId: raizId, fields: 'webViewLink', supportsAllDrives: true })
console.log(`\n${total} logos en Drive.\nCarpeta: ${link.data.webViewLink}`)
