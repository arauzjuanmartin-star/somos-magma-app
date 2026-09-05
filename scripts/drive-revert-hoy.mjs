// Deshace las carpetas que la app creó en CRUDO y ENTREGAS CLIENTES.
// Solo toca carpetas creadas por la cuenta de servicio HOY y que estén VACÍAS
// (una carpeta con material adentro nunca se toca, aunque la hayamos creado).
//
//   node scripts/drive-revert-hoy.mjs              → preview
//   node scripts/drive-revert-hoy.mjs --escribir   → las manda a la papelera

import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
  const i=l.indexOf('='); let v=l.slice(i+1).trim()
  if (v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1)
  return [l.slice(0,i).trim(), v]
}))
const auth = new google.auth.GoogleAuth({
  credentials:{ client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') },
  scopes:['https://www.googleapis.com/auth/drive','https://www.googleapis.com/auth/spreadsheets'],
})
const drive = google.drive({ version:'v3', auth })
const sheets = google.sheets({ version:'v4', auth })
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')

const MADRES = { CRUDO: '0ALsTwjw6_Zc1Uk9PVA', ENTREGAS: '0AK9Y6BbDhgekUk9PVA' }
const desde = new Date(); desde.setHours(0,0,0,0)

const todas = []
for (const [nombre, driveId] of Object.entries(MADRES)) {
  let pageToken
  do {
    const r = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and trashed=false and createdTime > '${desde.toISOString()}'`,
      driveId, corpora: 'drive', includeItemsFromAllDrives: true, supportsAllDrives: true,
      pageSize: 200, pageToken, fields: 'nextPageToken, files(id,name,parents,createdTime)',
    })
    ;(r.data.files || []).forEach(f => todas.push({ ...f, madre: nombre }))
    pageToken = r.data.nextPageToken
  } while (pageToken)
}

// ⚠ Hoy también crearon carpetas a mano en Drive. Solo tocamos las NUESTRAS:
// las que siguen la convención de la app, sus subcarpetas Fotos/Videos, y los
// niveles intermedios (CR_X / año) creados hoy que solo contienen carpetas nuestras.
const ES_PROYECTO = /^\d+_\d{4}-\d{2}-\d{2}_/
const porIdTodas = Object.fromEntries(todas.map(f => [f.id, f]))
const mias = new Set()
todas.forEach(f => { if (ES_PROYECTO.test(f.name)) mias.add(f.id) })
todas.forEach(f => { if (['Fotos','Videos'].includes(f.name) && mias.has(f.parents?.[0])) mias.add(f.id) })
// Los ancestros creados hoy, solo si TODO lo que cuelga de ellos es nuestro
let cambio = true
while (cambio) {
  cambio = false
  for (const f of todas) {
    if (mias.has(f.id)) continue
    const hijos = todas.filter(x => x.parents?.[0] === f.id)
    if (hijos.length && hijos.every(x => mias.has(x.id))) { mias.add(f.id); cambio = true }
  }
}

// De las nuestras, chequear que estén vacías (nunca borrar algo con material)
const conContenido = new Set()
for (const f of todas) {
  if (!mias.has(f.id)) continue
  const r = await drive.files.list({
    q: `'${f.id}' in parents and trashed=false`,
    includeItemsFromAllDrives: true, supportsAllDrives: true, pageSize: 50, fields: 'files(id,name,mimeType)',
  })
  const ajeno = (r.data.files || []).filter(x => !mias.has(x.id))
  if (ajeno.length) conContenido.add(f.id)
}

const borrables = todas.filter(f => mias.has(f.id) && !conContenido.has(f.id))
const seQuedan  = todas.filter(f => mias.has(f.id) &&  conContenido.has(f.id))
const ajenas    = todas.filter(f => !mias.has(f.id))

// Mostrar la ruta completa para que se entienda qué se va
const porId = Object.fromEntries(todas.map(f => [f.id, f]))
const ruta = f => {
  const partes = [f.name]; let p = f.parents?.[0]
  while (p && porId[p]) { partes.unshift(porId[p].name); p = porId[p].parents?.[0] }
  return `${f.madre} / … / ${partes.join(' / ')}`
}

console.log(`\n════ REVERT DE CARPETAS CREADAS HOY ════\n`)
console.log(`${todas.length} carpetas creadas hoy en total · ${todas.length - ajenas.length} son de la app, ${ajenas.length} las hizo alguien a mano (NO se tocan)\n`)
console.log(`🗑  ${borrables.length} vacías → a la papelera:`)
borrables.slice(0, 12).forEach(f => console.log(`     ${ruta(f)}`))
if (borrables.length > 12) console.log(`     … y ${borrables.length - 12} más`)
if (seQuedan.length) {
  console.log(`\n🛑 ${seQuedan.length} de la app NO se tocan (ya tienen material adentro):`)
  seQuedan.forEach(f => console.log(`     ${ruta(f)}`))
}
if (ajenas.length) {
  console.log(`\n✋ ${ajenas.length} creadas a mano hoy — intactas:`)
  ajenas.slice(0, 10).forEach(f => console.log(`     ${f.madre} / … / ${f.name}`))
  if (ajenas.length > 10) console.log(`     … y ${ajenas.length - 10} más`)
}

if (ESCRIBIR) {
  // De adentro hacia afuera: primero las más profundas
  const prof = f => { let n = 0, p = f.parents?.[0]; while (p && porId[p]) { n++; p = porId[p].parents?.[0] } return n }
  const orden = [...borrables].sort((a, b) => prof(b) - prof(a))
  let n = 0
  for (const f of orden) {
    try { await drive.files.update({ fileId: f.id, requestBody: { trashed: true }, supportsAllDrives: true }); n++ }
    catch (e) { console.log(`   ⚠ no pude borrar ${f.name}: ${e.message}`) }
  }
  console.log(`\n✓ ${n} carpetas a la papelera (se pueden restaurar 30 días).`)

  // Limpiar los links de PROYECTOS (ES/ET) y de EDICION (Link crudo / Link entrega)
  const colLetra = c => { let s='', k=c+1; while(k>0){ k--; s=String.fromCharCode(65+(k%26))+s; k=Math.floor(k/26) } return s }
  const rP = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:ET' })
  const rows = rP.data.values || [], h = rows[0] || []
  const iC = h.indexOf('Drive Crudo'), iE = h.indexOf('Drive Entrega')
  const limpiar = []
  rows.slice(1).forEach((r, i) => {
    if (String(r[iC]||'').trim()) limpiar.push({ range: `PROYECTOS!${colLetra(iC)}${i+2}`, values: [['']] })
    if (String(r[iE]||'').trim()) limpiar.push({ range: `PROYECTOS!${colLetra(iE)}${i+2}`, values: [['']] })
  })
  const rE = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'EDICION!A:R' })
  const eRows = rE.data.values || [], eh = eRows[0] || []
  const jC = eh.indexOf('Link crudo'), jE = eh.indexOf('Link entrega')
  eRows.slice(1).forEach((r, i) => {
    if (String(r[jC]||'').trim()) limpiar.push({ range: `EDICION!${colLetra(jC)}${i+2}`, values: [['']] })
    if (String(r[jE]||'').trim()) limpiar.push({ range: `EDICION!${colLetra(jE)}${i+2}`, values: [['']] })
  })
  if (limpiar.length) {
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'RAW', data: limpiar } })
    console.log(`✓ ${limpiar.length} links borrados del sheet.`)
  }
} else {
  console.log('\n👀 PREVIEW — nada se borró. Corré con --escribir.')
}
