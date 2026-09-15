// "Este proyecto vive en ESTA carpeta del equipo."
//
// El equipo arma la carpeta del evento con su propio nombre ("9 I 3 Conceptos básicos
// de la cerveza") y la app había creado otra al lado con el nombre del presupuesto
// ("9 I 3 Evento CEL"), vacía. Esto deja UNA sola:
//   · PROYECTOS: Drive Entrega → la carpeta del equipo; Drive Finales → su subcarpeta
//     de finales ("Video final" / "Finales" / "Videos") si hay; Drive Crudo → su
//     subcarpeta de crudo ("Clips" / "Crudo" / "Crudos") si hay, si no la carpeta.
//   · EDICION: las filas del proyecto que apuntaban a la carpeta vacía de la app pasan
//     a la del equipo.
//   · La carpeta vacía de la app (Entregas y Crudo) va a la papelera — SOLO si no tiene
//     ningún archivo adentro.
//
//   node scripts/drive-proyecto-a-carpeta.mjs 2231 "9 I 3 Conceptos básicos de la cerveza"              → preview
//   node scripts/drive-proyecto-a-carpeta.mjs 2231 "9 I 3 Conceptos básicos de la cerveza" --escribir   → aplica y verifica
//
// La carpeta del equipo se busca en ENTREGAS / <agencia> / <cliente> / <año> (o sin el
// nivel de cliente si agencia y cliente son el mismo), con el nombre exacto.

import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { DRIVE_CRUDO, DRIVE_ENTREGAS } from '../lib/drive.js'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets'] })
const drive = google.drive({ version: 'v3', auth }), sheets = google.sheets({ version: 'v4', auth })
const ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
const ESCRIBIR = process.argv.includes('--escribir')
const [NUM, NOMBRE] = args
if (!NUM || !NOMBRE) { console.error('Uso: node scripts/drive-proyecto-a-carpeta.mjs <N° presupuesto> "<nombre exacto de la carpeta del equipo>" [--escribir]'); process.exit(1) }

const idDe = l => (String(l || '').match(/[-\w]{25,}/) || [])[0] || ''
const link = id => `https://drive.google.com/drive/folders/${id}`
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
const k = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/^CR[_\s]*/, '').replace(/[^A-Z0-9]/g, '')
const hijos = async (driveId, parent, soloCarpetas = true) => (await drive.files.list({ q: `'${parent}' in parents and trashed=false${soloCarpetas ? " and mimeType='application/vnd.google-apps.folder'" : ''}`, driveId, corpora: 'drive', includeItemsFromAllDrives: true, supportsAllDrives: true, pageSize: 1000, fields: 'files(id,name,mimeType)' })).data.files || []
const esC = f => f.mimeType === 'application/vnd.google-apps.folder'
const archivosDentro = async (driveId, id) => { let n = 0; const q = [id]; while (q.length) { const h = await hijos(driveId, q.shift(), false); n += h.filter(x => !esC(x)).length; q.push(...h.filter(esC).map(x => x.id)) } return n }
const info = async id => { try { const f = (await drive.files.get({ fileId: id, fields: 'id,name,trashed,driveId', supportsAllDrives: true })).data; return f.trashed ? null : f } catch (e) { return null } }

// El proyecto
const pr = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'PROYECTOS!A:EW' })).data.values, hP = pr[0], cP = n => hP.indexOf(n)
const fi = pr.findIndex((x, i) => i > 0 && String(x[cP('N° presupuesto')] || '').trim() === NUM)
if (fi < 1) { console.error(`#${NUM} no está en PROYECTOS`); process.exit(1) }
const p = pr[fi]
const agencia = String(p[cP('Agencia')] || '').trim(), cliente = String(p[cP('Cliente')] || '').trim(), fecha = String(p[cP('Fecha Evento')] || '').trim()
const anio = (fecha.match(/(\d{4})/) || [])[1] || String(new Date().getFullYear())
console.log(`#${NUM}  ${agencia} / ${cliente}  ·  ${p[cP('Proyecto')]}  ·  ${fecha}`)

// La carpeta del equipo: ENTREGAS / agencia / [cliente] / año / NOMBRE (match tolerante en los niveles de entidad, exacto en el nombre)
const buscar = async (parent, nombre, exacto = false) => { const h = await hijos(DRIVE_ENTREGAS, parent); const ex = h.filter(f => exacto ? f.name.trim() === nombre.trim() : k(f.name) === k(nombre)); if (ex.length === 1) return ex[0]; if (!exacto) { const emp = h.filter(f => k(f.name).startsWith(k(nombre)) || k(nombre).startsWith(k(f.name))); if (emp.length === 1) return emp[0] } return null }
let cur = { id: DRIVE_ENTREGAS, name: 'ENTREGAS' }, rutaTxt = []
const niveles = (agencia && cliente && k(agencia) !== k(cliente)) ? [agencia, cliente] : [cliente || agencia]
for (const n of [...niveles, anio]) { const f = await buscar(cur.id, n); if (!f) { console.error(`No encuentro "${n}" en ${rutaTxt.join(' / ') || 'la raíz de ENTREGAS'}`); process.exit(1) } cur = f; rutaTxt.push(f.name) }
const equipo = await buscar(cur.id, NOMBRE, true)
if (!equipo) { console.error(`No encuentro "${NOMBRE}" en ${rutaTxt.join(' / ')}. Hay: ${(await hijos(DRIVE_ENTREGAS, cur.id)).map(f => f.name).join(' · ')}`); process.exit(1) }
const subs = await hijos(DRIVE_ENTREGAS, equipo.id)
// Por prioridad, no por orden de aparición: para un video el crudo es "Clips", no "Fotos".
const porPrioridad = (...res) => { for (const re of res) { const f = subs.find(x => re.test(x.name.trim())); if (f) return f } return null }
const subFinales = porPrioridad(/^video final$/i, /^finales?$/i, /^videos?$/i, /^entrega$/i)
const subCrudo = porPrioridad(/^clips?$/i, /^crudos?$/i, /^material$/i, /^fotos$/i)
const nFiles = await archivosDentro(DRIVE_ENTREGAS, equipo.id)
console.log(`Carpeta del equipo: ${rutaTxt.join(' / ')} / ${equipo.name}  (${nFiles} archivos; adentro: ${subs.map(s => s.name).join(' · ') || 'nada'})`)

// Qué apunta hoy PROYECTOS, y si es una carpeta de la app vacía
const hoy = {}
for (const col of ['Drive Crudo', 'Drive Entrega', 'Drive Finales']) hoy[col] = idDe(p[cP(col)])
const nuevo = { 'Drive Entrega': equipo, 'Drive Finales': subFinales || equipo, 'Drive Crudo': subCrudo || equipo }
const data = [], papelera = [], plan = []
for (const col of ['Drive Entrega', 'Drive Finales', 'Drive Crudo']) {
  if (hoy[col] === nuevo[col].id) { plan.push(`   PROYECTOS ${col.padEnd(13)} ya apunta ahí`); continue }
  data.push({ range: `PROYECTOS!${colLetra(cP(col))}${fi + 1}`, values: [[link(nuevo[col].id)]] })
  plan.push(`   PROYECTOS ${col.padEnd(13)} → ${equipo.name}${nuevo[col].id !== equipo.id ? ' / ' + nuevo[col].name : ''}`)
}
// Las carpetas de la app que quedan huérfanas (la de entrega y la de crudo), si están vacías
const yaVistas = new Set()
for (const col of ['Drive Entrega', 'Drive Crudo']) {
  const id = hoy[col]; if (!id || yaVistas.has(id) || id === nuevo[col].id || id === equipo.id) continue
  yaVistas.add(id)
  const f = await info(id); if (!f) continue
  const n = await archivosDentro(f.driveId || DRIVE_CRUDO, f.id)
  if (n > 0) { plan.push(`   (se deja "${f.name}": tiene ${n} archivos)`); continue }
  papelera.push(f); plan.push(`   🗑 "${f.name}" (${f.driveId === DRIVE_CRUDO ? 'Crudo' : 'Entregas'}) — la de la app, vacía`)
}
// EDICION: filas del proyecto que apuntaban a lo que se va
const ed = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'EDICION!A:AO' })).data.values, hE = ed[0], cE = n => hE.indexOf(n)
const idsViejos = new Set([hoy['Drive Entrega'], hoy['Drive Crudo'], hoy['Drive Finales']].filter(Boolean))
ed.forEach((x, i) => {
  if (i === 0 || String(x[cE('N° presupuesto')] || '').trim() !== NUM) return
  for (const [col, dest] of [['Link crudo', nuevo['Drive Crudo']], ['Link entrega', nuevo['Drive Finales']]]) {
    const id = idDe(x[cE(col)]); if (!id || !idsViejos.has(id)) continue
    data.push({ range: `EDICION!${colLetra(cE(col))}${i + 1}`, values: [[link(dest.id)]] }); plan.push(`   EDICION ${x[cE('ID')]} ${col.padEnd(13)} → ${equipo.name}${dest.id !== equipo.id ? ' / ' + dest.name : ''}`)
  }
})

console.log(`\n${ESCRIBIR ? '══ aplicando ══' : '(preview)'}`); plan.forEach(l => console.log(l))
if (!ESCRIBIR) { console.log(`\nPara aplicar:  node scripts/drive-proyecto-a-carpeta.mjs ${NUM} "${NOMBRE}" --escribir`); process.exit(0) }

if (data.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: ID, requestBody: { valueInputOption: 'USER_ENTERED', data } })
for (const f of papelera) { if (await archivosDentro(f.driveId || DRIVE_CRUDO, f.id) > 0) { console.log(`   ✗ "${f.name}" ahora tiene archivos, no se tira`); continue } await drive.files.update({ fileId: f.id, requestBody: { trashed: true }, supportsAllDrives: true }) }
try { await sheets.spreadsheets.values.append({ spreadsheetId: ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), 'script', 'drive-proyecto-a-carpeta', 'PROYECTOS+EDICION+DRIVE', NUM, `→ "${equipo.name}" · ${data.length} celdas · ${papelera.length} a papelera`]] } }) } catch (e) {}
// verificar
const p2 = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: `PROYECTOS!A${fi + 1}:EW${fi + 1}` })).data.values[0]
let mal = 0
for (const col of ['Drive Entrega', 'Drive Finales', 'Drive Crudo']) { const id = idDe(p2[cP(col)]); if (id !== nuevo[col].id || !(await info(id))) { mal++; console.log(`   ✗ ${col} no quedó bien`) } }
console.log(mal ? `\n✗ ${mal} cosas no cerraron` : `\n✓ verificado: #${NUM} apunta a "${equipo.name}" (entrega, finales y crudo), ${papelera.length} carpetas vacías a la papelera`)
