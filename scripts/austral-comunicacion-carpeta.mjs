/**
 * Austral Comunicación: que sus trabajos vayan a "FD COMUNICACIÓN" (la carpeta que usa el cliente)
 * y no a una carpeta suelta "AUSTRAL_COMUNICACION" que la app creó sola porque CLIENTES no tenía
 * cargado su "Drive Entregas" (Juan, 27/10/2026).
 *
 * 1. CLIENTES / "Austral Comunicacion" → Drive Entregas = FD COMUNICACIÓN (solo si está vacío).
 * 2. Mueve los proyectos que hay en AUSTRAL_COMUNICACION / <año> a FD COMUNICACIÓN / <año> / Videos producto.
 *    Mover dentro de la misma unidad conserva el ID: los links de PROYECTOS y los que tenga el cliente siguen andando.
 * No borra nada: lo que quede vacío se informa.
 *
 * Uso:  node scripts/austral-comunicacion-carpeta.mjs             (preview)
 *       node scripts/austral-comunicacion-carpeta.mjs --escribir
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'] })
const sheets = google.sheets({ version: 'v4', auth }), drive = google.drive({ version: 'v3', auth })
const ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')
const FD_COM = '1Jly2JQeZi9fSdWtTAM4rXZ6d9WHqoGQF', SUELTA = '1z1SBQExl14MKS8WqX_Ix0ZYdL_ZCIrBl'
const link = id => `https://drive.google.com/drive/folders/${id}`
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
const hijos = async id => ((await drive.files.list({ q: `'${id}' in parents and trashed=false`, includeItemsFromAllDrives: true, supportsAllDrives: true, fields: 'files(id,name,mimeType)', pageSize: 500 })).data.files || [])
const esCarpeta = f => f.mimeType === 'application/vnd.google-apps.folder'

// 1. CLIENTES
const C = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'CLIENTES!A:Z' })).data.values || []
const hc = C[0], fi = C.findIndex((x, i) => i > 0 && /^austral comunicaci[oó]n$/i.test(String(x[0] || '').trim()))
const iEnt = hc.indexOf('Drive Entregas')
console.log('\n1) CLIENTES')
let cambioCliente = null
if (fi < 1 || iEnt < 0) console.log('   ✗ no encontré la fila "Austral Comunicacion" o la columna "Drive Entregas"')
else if (String(C[fi][iEnt] || '').trim()) console.log(`   ya tiene Drive Entregas: ${C[fi][iEnt]} (no lo toco)`)
else { cambioCliente = { range: `CLIENTES!${colLetra(iEnt)}${fi + 1}`, values: [[link(FD_COM)]] }; console.log(`   ${cambioCliente.range}  Drive Entregas ← FD COMUNICACIÓN`) }

// 2. Proyectos sueltos
console.log('\n2) AUSTRAL_COMUNICACION (la carpeta suelta)')
const movidas = []
for (const y of (await hijos(SUELTA)).filter(f => esCarpeta(f) && /^\d{4}$/.test(f.name))) {
  for (const p of (await hijos(y.id)).filter(esCarpeta)) movidas.push({ anio: y.name, anioId: y.id, p })
}
const otros = (await hijos(SUELTA)).filter(f => !/^\d{4}$/.test(f.name))
const fdAnios = await hijos(FD_COM)
for (const m of movidas) {
  const fy = fdAnios.find(f => esCarpeta(f) && f.name === m.anio)
  const vp = fy ? (await hijos(fy.id)).find(f => esCarpeta(f) && /^videos?\s+producto$/i.test(f.name.trim())) : null
  m.destino = vp ? { id: vp.id, ruta: `FD COMUNICACIÓN / ${m.anio} / ${vp.name}` } : { id: null, ruta: `FD COMUNICACIÓN / ${m.anio} / Video producto  ← se crea`, anioId: fy?.id }
  console.log(`   mover "${m.p.name}"  →  ${m.destino.ruta}`)
}
if (!movidas.length) console.log('   no hay proyectos para mover')
console.log(`   queda en la carpeta suelta: ${otros.map(f => f.name).join(', ') || 'nada'} (no se borra)`)
if (!ESCRIBIR) { console.log('\n(preview — corré con --escribir para aplicar)\n'); process.exit(0) }

if (cambioCliente) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: ID, requestBody: { valueInputOption: 'USER_ENTERED', data: [cambioCliente] } })
for (const m of movidas) {
  let dest = m.destino.id
  if (!dest) {
    if (!m.destino.anioId) { console.log(`   ✗ FD COMUNICACIÓN no tiene la carpeta ${m.anio}: no muevo "${m.p.name}"`); continue }
    dest = (await drive.files.create({ requestBody: { name: 'Video producto', mimeType: 'application/vnd.google-apps.folder', parents: [m.destino.anioId] }, fields: 'id', supportsAllDrives: true })).data.id
  }
  await drive.files.update({ fileId: m.p.id, addParents: dest, removeParents: m.anioId, supportsAllDrives: true, fields: 'id,parents' }, { timeout: 30000 })
  const v = (await drive.files.get({ fileId: m.p.id, fields: 'parents', supportsAllDrives: true })).data.parents || []
  console.log(v.includes(dest) ? `   ✓ "${m.p.name}" movida (mismo ID ${m.p.id})` : `   ✗ "${m.p.name}" no quedó en el destino, revisar`)
}
try { await sheets.spreadsheets.values.append({ spreadsheetId: ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), 'juan (script)', 'austral-comunicacion-carpeta', 'CLIENTES', 'Austral Comunicacion', `Drive Entregas → FD COMUNICACIÓN; ${movidas.length} proyecto(s) movidos a Videos producto`]] } }) } catch (e) {}
console.log('\n✓ Listo.\n')
