// Las facturas que el equipo sube a su carpeta, cargadas solas en Pagos_Staff.
//
// Cada persona tiene en su ficha una carpeta "Tus facturas" donde puede escribir.
// Hasta ahora subir el PDF ahí no hacía nada: alguien de administración tenía que
// mirar la carpeta y pegar el link a mano en la columna Factura del sheet.
//
// Este script lo hace solo. El freelancer sube y listo — no marca nada, no avisa.
// Administración corre esto y ve quién facturó y quién no, sin abrir 42 carpetas.
//
//   node scripts/staff-facturas-detectar.mjs              → preview
//   node scripts/staff-facturas-detectar.mjs --escribir   → carga los links
//   node scripts/staff-facturas-detectar.mjs --mes 08     → solo ese mes de referencia

import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
  const i=l.indexOf('='); let v=l.slice(i+1).trim()
  if (v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1)
  return [l.slice(0,i).trim(), v]
}))
const auth = new google.auth.GoogleAuth({
  credentials:{ client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') },
  scopes:['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/drive'],
})
const sheets = google.sheets({ version:'v4', auth })
const drive  = google.drive({ version:'v3', auth })
const SHEET_ID   = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const DRIVE_RRHH = '0AKPc4ZAUvU8YUk9PVA'
const MADRE      = 'FICHAS DEL EQUIPO'

const args = process.argv.slice(2)
const ESCRIBIR = args.includes('--escribir')
const MES = (() => { const i = args.indexOf('--mes'); return i >= 0 ? String(args[i+1]||'').padStart(2,'0') : null })()

const numUS = v => { const n = parseFloat(String(v||'').replace(/[$\s,]/g,'')); return isNaN(n)?0:n }
const plata = n => '$' + Math.round(n).toLocaleString('es-AR')
const norm  = s => String(s||'').trim().toLowerCase()

const bb = await sheets.spreadsheets.values.batchGet({ spreadsheetId: SHEET_ID, ranges:['Pagos_Staff!A:N','RRHH!A:Z'] })
const [pv, rv] = bb.data.valueRanges.map(v => v.values||[])
const hP = pv[0], hR = rv[0]
const cFactura = hP.indexOf('Factura')
const filas = pv.slice(1).map((row,i) => ({ fila:i+2, ...Object.fromEntries(hP.map((k,j)=>[k, row[j]??''])) }))

const madre = await drive.files.list({
  q:`name='${MADRE}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  driveId: DRIVE_RRHH, corpora:'drive', includeItemsFromAllDrives:true, supportsAllDrives:true, fields:'files(id)',
})
if (!madre.data.files?.length) { console.log(`No existe la carpeta "${MADRE}". Corré antes scripts/equipo-fichas.mjs --escribir`); process.exit(1) }

// Todas las carpetas de personas, y dentro de cada una la de facturas.
const personas = []
let token
do {
  const p = await drive.files.list({
    q:`'${madre.data.files[0].id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    driveId: DRIVE_RRHH, corpora:'drive', includeItemsFromAllDrives:true, supportsAllDrives:true,
    fields:'nextPageToken, files(id,name)', pageSize:100, pageToken: token,
  })
  personas.push(...p.data.files); token = p.data.nextPageToken
} while (token)

console.log('════════ FACTURAS SUBIDAS POR EL EQUIPO ════════\n')
console.log(`${personas.length} carpetas${MES ? ` · solo mes ${MES}` : ''}\n`)

const updates = [], conFactura = [], sinFactura = [], efectivo = []
for (const per of personas) {
  const sub = await drive.files.list({
    q:`'${per.id}' in parents and name='Tus facturas' and trashed=false`,
    driveId: DRIVE_RRHH, corpora:'drive', includeItemsFromAllDrives:true, supportsAllDrives:true, fields:'files(id)',
  })
  const carpeta = sub.data.files?.[0]
  const pend = filas.filter(x => norm(x.Freelancer) === norm(per.name)
    && /pendiente/i.test(String(x.Estado||''))
    && numUS(x['Monto Adeudado']) > 0
    && (!MES || String(x['Mes Referencia']||'').trim().startsWith(MES)))
  if (!pend.length) continue

  const debe = pend.reduce((a,x) => a + numUS(x['Monto Adeudado']), 0)
  const archivos = carpeta ? (await drive.files.list({
    q:`'${carpeta.id}' in parents and trashed=false`,
    driveId: DRIVE_RRHH, corpora:'drive', includeItemsFromAllDrives:true, supportsAllDrives:true,
    fields:'files(id,name,createdTime,mimeType)', orderBy:'createdTime desc',
  })).data.files || [] : []

  // Este mes cobra en efectivo: no hay factura que esperar. Se decide mes a mes
  // con scripts/staff-efectivo.mjs, no es un rasgo fijo de la persona.
  if (pend.every(x => /efectivo/i.test(String(x.Cuenta||'')))) { efectivo.push({ nombre: per.name, debe, n: pend.length }); continue }
  if (!archivos.length) { sinFactura.push({ nombre: per.name, debe, n: pend.length }); continue }

  // La factura del mes cubre todas sus líneas de ese mes: es un pago por persona,
  // no por trabajo. Se pega el link en las filas que todavía no tienen ninguno.
  const ultima = archivos[0]
  const link = `https://drive.google.com/file/d/${ultima.id}`
  const aMarcar = pend.filter(x => !String(x.Factura||'').trim())
  conFactura.push({ nombre: per.name, debe, n: pend.length, archivo: ultima.name,
                    cuando: new Date(ultima.createdTime).toLocaleDateString('es-AR'),
                    marca: aMarcar.length, total: archivos.length })
  aMarcar.forEach(x => updates.push({
    range: `Pagos_Staff!${String.fromCharCode(65 + cFactura)}${x.fila}`, values: [[link]],
  }))
}

const sum = a => a.reduce((s,x) => s + x.debe, 0)
console.log(`✅ FACTURARON — ${conFactura.length} personas · ${plata(sum(conFactura))}\n`)
conFactura.sort((a,b)=>b.debe-a.debe).forEach(x =>
  console.log(`   ${x.nombre.slice(0,26).padEnd(26)} ${plata(x.debe).padStart(12)}  ${String(x.n).padStart(2)} trabajos  ·  ${x.archivo.slice(0,34).padEnd(34)} (${x.cuando})${x.marca ? `  → se cargan ${x.marca}` : '  → ya estaba cargada'}`))

console.log(`\n⏳ FALTA SU FACTURA — ${sinFactura.length} personas · ${plata(sum(sinFactura))}\n`)
sinFactura.sort((a,b)=>b.debe-a.debe).forEach(x =>
  console.log(`   ${x.nombre.slice(0,26).padEnd(26)} ${plata(x.debe).padStart(12)}  ${String(x.n).padStart(2)} trabajos`))

if (efectivo.length) {
  console.log(`\n💵 COBRAN EN EFECTIVO — ${efectivo.length} personas · ${plata(sum(efectivo))}  (no facturan, no hay nada que esperar)\n`)
  efectivo.sort((a,b)=>b.debe-a.debe).forEach(x =>
    console.log(`   ${x.nombre.slice(0,26).padEnd(26)} ${plata(x.debe).padStart(12)}  ${String(x.n).padStart(2)} trabajos`))
}

if (!updates.length) { console.log('\nNo hay links nuevos para cargar.'); process.exit(0) }
if (!ESCRIBIR) {
  console.log(`\n👀 PREVIEW — se cargarían ${updates.length} links en la columna Factura. Corré con --escribir.`)
  process.exit(0)
}
await sheets.spreadsheets.values.batchUpdate({
  spreadsheetId: SHEET_ID, requestBody:{ valueInputOption:'USER_ENTERED', data: updates },
})
console.log(`\n✅ ${updates.length} links cargados en Pagos_Staff.`)
