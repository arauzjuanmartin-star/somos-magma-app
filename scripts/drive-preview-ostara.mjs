// PREVIEW (sin tocar nada) de cómo quedaría CR_OSTARA con la convención nueva:
//   CR_CLIENTE / AÑO / NRO_FECHA_Proyecto
// Lista el árbol actual de CR_OSTARA + propuesta de mover/renombrar y deja todo en JSON para revisar.
import { google } from 'googleapis'
import { readFileSync, writeFileSync } from 'fs'

readFileSync('.env.local','utf-8').split('\n').forEach(l => {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^"|"$/g,'')
})

const auth = new google.auth.GoogleAuth({
  credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') },
  scopes: ['https://www.googleapis.com/auth/drive','https://www.googleapis.com/auth/spreadsheets'],
})
const drive = google.drive({ version: 'v3', auth })
const sheets = google.sheets({ version: 'v4', auth })
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const CRUDO = '0ALsTwjw6_Zc1Uk9PVA'

const listFolder = async (parentId) => {
  const r = await drive.files.list({
    corpora: 'drive', driveId: CRUDO, includeItemsFromAllDrives: true, supportsAllDrives: true,
    q: `'${parentId}' in parents and trashed=false`,
    fields: 'files(id,name,mimeType,createdTime,modifiedTime,size)',
    pageSize: 1000, orderBy: 'name',
  })
  return r.data.files || []
}

const norm = s => String(s||'').trim().toUpperCase().replace(/\s+/g,'_').replace(/[^A-Z0-9_/-]/g,'')
const safe = s => String(s||'').trim().replace(/[\/\\]/g,'-').replace(/\s+/g,'_').slice(0,80)

// Buscar carpeta CR_OSTARA en top-level (la "verdadera")
const top = await listFolder(CRUDO)
const ostaraTop = top.find(f => f.mimeType==='application/vnd.google-apps.folder' && /^cr_+ostara$/i.test(f.name.replace(/\s+/g,'_')))
if (!ostaraTop) { console.error('No encontré CR_OSTARA en top-level'); process.exit(1) }
console.log(`CR_OSTARA root: ${ostaraTop.id}\n`)

// Listar contenido
const contenido = await listFolder(ostaraTop.id)
console.log(`Items dentro de CR_OSTARA: ${contenido.length}\n`)

// Leer PROYECTOS para cruzar nombres y fechas
const presR = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:BH' })
const ph = presR.data.values[0]
const proy = presR.data.values.slice(1).map(r => { const o={}; ph.forEach((h,i)=>o[h]=r[i]||''); return o })
const presupR = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A:BC' })
const pph = presupR.data.values[0]
const presup = presupR.data.values.slice(1).map(r => { const o={}; pph.forEach((h,i)=>o[h]=r[i]||''); return o })

// Agencias Ostara: cliente='Ostara' o agencia='Ostara' o similar
const isOstaraRow = r => /ostara/i.test((r['Agencia']||'')+' '+(r['Cliente']||''))

// Diccionario de clientes "que en realidad son agencias dentro de Ostara"
// Si dentro de CR_OSTARA encuentro CR_AXION → ese es cliente, no proyecto, → debe quedar en top-level (CR_AXION)
const propuesta = { mover_a_top: [], renombrar_quedan_en_ostara: [], borrar_o_revisar: [], unificar_duplicados: [], ya_estan_bien: [] }

for (const item of contenido) {
  const nameRaw = item.name
  const nameClean = nameRaw.trim()
  const isFolder = item.mimeType === 'application/vnd.google-apps.folder'

  if (!isFolder) {
    propuesta.borrar_o_revisar.push({ id:item.id, nombre:nameRaw, motivo:'archivo suelto en raíz de CR_OSTARA', accion:'preguntar a Juan' })
    continue
  }

  // 1) Duplicados de la propia CR_OSTARA (con espacio o sin)
  if (/^cr_+ ?ostara$/i.test(nameClean.replace(/\s+/g,' ').trim())) {
    propuesta.unificar_duplicados.push({ id:item.id, nombre:nameRaw, motivo:'duplicado de la raíz CR_OSTARA', accion:'mover contenido a CR_OSTARA padre, después borrar' })
    continue
  }

  // 2) CR_X donde X es un cliente conocido → es CLIENTE, debe ir a top-level
  const m = nameClean.match(/^CR_+(.+)$/i)
  if (m) {
    const cliente = m[1].trim()
    const propTop = `CR_${norm(cliente)}`
    // ¿ya existe en top-level?
    const existe = top.find(f => f.mimeType==='application/vnd.google-apps.folder' && norm(f.name)===norm(propTop))
    propuesta.mover_a_top.push({
      id: item.id, nombre_actual: nameRaw,
      destino: existe ? `(YA existe en top como '${existe.name}' — fusionar)` : `crear en top: ${propTop}`,
      cliente_detectado: cliente,
    })
    continue
  }

  // 3) Carpeta sin prefijo CR_: probablemente proyecto VIEJO de Ostara
  // Intentar matchear con PROYECTOS de Ostara
  const matches = proy.filter(p => isOstaraRow(p) && p['Proyecto'] && nameClean.toLowerCase().includes(p['Proyecto'].toLowerCase().slice(0,15)))
  if (matches.length > 0) {
    const p0 = matches[0]
    const nroSafe = String(p0['N° presupuesto']||'').padStart(4,'0')
    const fecha = (p0['Fecha Evento']||'').split('/').reverse().join('-')
    const propuesto = `${nroSafe}_${fecha}_${safe(p0['Proyecto'])}`
    propuesta.renombrar_quedan_en_ostara.push({
      id: item.id, nombre_actual: nameRaw, nombre_nuevo: propuesto, año: fecha.slice(0,4)||'sinaño',
      proyecto: p0['Proyecto'], cliente: p0['Cliente'],
    })
  } else {
    propuesta.borrar_o_revisar.push({ id:item.id, nombre:nameRaw, motivo:'no matchea ningún proyecto Ostara en el sheet', accion:'preguntar a Juan' })
  }
}

console.log('═══════════════════════════════════════════════════════')
console.log('PROPUESTA (NO ejecuto nada — esto es preview):')
console.log('═══════════════════════════════════════════════════════\n')

console.log(`A) MOVER A TOP-LEVEL (son clientes, no proyectos): ${propuesta.mover_a_top.length}`)
propuesta.mover_a_top.forEach(x => console.log(`   - ${x.nombre_actual}  →  ${x.destino}`))

console.log(`\nB) RENOMBRAR Y DEJAR EN CR_OSTARA (son proyectos reales): ${propuesta.renombrar_quedan_en_ostara.length}`)
propuesta.renombrar_quedan_en_ostara.forEach(x => console.log(`   - ${x.nombre_actual}  →  ${x.año}/${x.nombre_nuevo}`))

console.log(`\nC) UNIFICAR DUPLICADOS DE CR_OSTARA: ${propuesta.unificar_duplicados.length}`)
propuesta.unificar_duplicados.forEach(x => console.log(`   - ${x.nombre} (${x.motivo})`))

console.log(`\nD) REVISAR / NO MATCHEAN NADA: ${propuesta.borrar_o_revisar.length}`)
propuesta.borrar_o_revisar.forEach(x => console.log(`   - ${x.nombre}  [${x.motivo}]`))

writeFileSync('/tmp/drive-ostara-plan.json', JSON.stringify(propuesta,null,2))
console.log('\nPlan completo en /tmp/drive-ostara-plan.json')
console.log('Decime: ¿ejecuto plan A+B+C? D lo revisás vos y me decís uno por uno.')
