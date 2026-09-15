// Después de ordenar las carpetas (drive-ordenar-carpetas-app.mjs, 15/9/2026) quedaron
// links en el sheet que apuntan a carpetas de la papelera. NO los rompió el script:
// esas carpetas de la app las tiró alguien del equipo a mano el 2, 4 y 7 de septiembre
// cuando armó las suyas. Esto los deja apuntando a la carpeta del equipo, o vacíos
// si no hay ninguna (la app la vuelve a crear con "Crear carpetas").
//
// También: la fila "Austral EDG" no existía en CLIENTES, así que no tenía dónde
// anotar su carpeta. Se agrega, con las mismas carpetas que Austral Derecho.
//
//   node scripts/drive-links-rotos.mjs             → preview
//   node scripts/drive-links-rotos.mjs --escribir  → aplica y verifica

import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets'] })
const drive = google.drive({ version: 'v3', auth }), sheets = google.sheets({ version: 'v4', auth })
const ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc', E = '0AK9Y6BbDhgekUk9PVA', C = '0ALsTwjw6_Zc1Uk9PVA'
const ESCRIBIR = process.argv.includes('--escribir')
const idDe = l => (String(l || '').match(/[-\w]{25,}/) || [])[0] || ''
const link = id => `https://drive.google.com/drive/folders/${id}`
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
const k = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const hijos = async (driveId, parent) => (await drive.files.list({ q: `'${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`, driveId, corpora: 'drive', includeItemsFromAllDrives: true, supportsAllDrives: true, pageSize: 1000, fields: 'files(id,name)' })).data.files || []
const ruta = async (driveId, partes) => { let cur = { id: driveId }; for (const p of partes) { const h = (await hijos(driveId, cur.id)).filter(f => f.name === p); if (h.length !== 1) throw new Error(`no encuentro "${p}"`); cur = h[0] } return cur }
const vive = async id => { try { return !(await drive.files.get({ fileId: id, fields: 'trashed', supportsAllDrives: true })).data.trashed } catch (e) { return false } }

// Las carpetas del equipo a las que hay que apuntar
const fd = await ruta(E, ['AUSTRAL', 'FD DERECHO Y ESCUELA DE GOBIERNO'])
const h26 = await hijos(E, (await ruta(E, ['AUSTRAL', 'FD DERECHO Y ESCUELA DE GOBIERNO', '2026'])).id)
const contratacion = h26.find(f => /Contrataci.n P.blica/i.test(f.name) && /^8\s*\|\s*26/.test(f.name))
const jornadas = h26.find(f => /XIX Jornadas/i.test(f.name) && /Dia 2/i.test(f.name))
const crAustral = await ruta(C, ['CR_AUSTRAL'])
if (!contratacion || !jornadas) { console.error('No encuentro las carpetas del equipo en FD DERECHO / 2026'); process.exit(1) }

const pr = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'PROYECTOS!A:EW' })).data.values, hP = pr[0], cP = n => hP.indexOf(n)
const cl = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'CLIENTES!A:Z' })).data.values, hC = cl[0], cC = n => hC.indexOf(n)
const filaP = num => pr.findIndex((x, i) => i > 0 && String(x[cP('N° presupuesto')] || '').trim() === num)
const derecho = cl.find((x, i) => i > 0 && k(x[0]) === 'AUSTRALDERECHO')
const yaEDG = cl.find((x, i) => i > 0 && k(x[0]) === 'AUSTRALEDG')

const data = [], plan = []
const set = (num, col, val, txt) => { const fi = filaP(num); if (fi < 1) return plan.push(`   ⚠ #${num} no está en PROYECTOS`); data.push({ range: `PROYECTOS!${colLetra(cP(col))}${fi + 1}`, values: [[val]] }); plan.push(`   PROYECTOS #${num}  ${col.padEnd(13)} → ${txt}`) }
set('2156', 'Drive Entrega', link(contratacion.id), contratacion.name.replace(/\s+/g, ' ').slice(0, 60) + '…')
set('2156', 'Drive Finales', link(contratacion.id), 'la misma')
set('2156', 'Drive Crudo', '', '(vacío — la tiraron a mano el 7/9; "Crear carpetas" la arma de nuevo en CR_AUSTRAL / 2026)')
set('2213', 'Drive Entrega', link(jornadas.id), jornadas.name)
set('2213', 'Drive Finales', link(jornadas.id), 'la misma')
set('2224', 'Drive Crudo', '', '(vacío — la tiraron a mano el 4/9)')
set('2225', 'Drive Crudo', '', '(vacío — la tiraron a mano el 4/9)')
// CLIENTES Austral Derecho: Recursos que se fue con AUSTRAL_DERECHO
if (derecho) { const ci = cC('Drive Recursos'); const id = idDe(derecho[ci]); if (id && !(await vive(id))) { data.push({ range: `CLIENTES!${colLetra(ci)}${cl.indexOf(derecho) + 1}`, values: [['']] }); plan.push(`   CLIENTES Austral Derecho  Drive Recursos → (vacío — apuntaba a la papelera; la app la vuelve a crear en FD DERECHO)`) } }
// CLIENTES: fila Austral EDG
let nueva = null
if (!yaEDG) {
  const hoy = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  nueva = new Array(hC.length).fill('')
  nueva[cC('Nombre')] = 'Austral EDG'; nueva[cC('Agencia habitual')] = 'Austral'
  if (cC('Industria') > -1) nueva[cC('Industria')] = derecho?.[cC('Industria')] || ''
  if (cC('Activo') > -1) nueva[cC('Activo')] = derecho?.[cC('Activo')] || ''
  if (cC('Creada') > -1) nueva[cC('Creada')] = hoy
  nueva[cC('Drive Crudo')] = link(crAustral.id); nueva[cC('Drive Entregas')] = link(fd.id)
  plan.push(`   CLIENTES + fila "Austral EDG": agencia Austral · Industria "${nueva[cC('Industria')]}" · Activo "${nueva[cC('Activo')]}" · Drive Crudo → CR_AUSTRAL · Drive Entregas → FD DERECHO Y ESCUELA DE GOBIERNO`)
} else plan.push('   CLIENTES: Austral EDG ya existe, no se agrega')

console.log(`════ LINKS ROTOS ${ESCRIBIR ? '(ESCRIBIENDO)' : '(preview)'} ════`)
plan.forEach(l => console.log(l))
if (!ESCRIBIR) { console.log('\n(preview) Para aplicar:  node scripts/drive-links-rotos.mjs --escribir'); process.exit(0) }

if (data.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: ID, requestBody: { valueInputOption: 'USER_ENTERED', data } })
if (nueva) await sheets.spreadsheets.values.append({ spreadsheetId: ID, range: `CLIENTES!A:${colLetra(hC.length - 1)}`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: [nueva] } })
try { await sheets.spreadsheets.values.append({ spreadsheetId: ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), 'script', 'drive-links-rotos', 'PROYECTOS+CLIENTES', '', `${data.length} celdas${nueva ? ' + fila Austral EDG' : ''}`]] } }) } catch (e) {}

// verificar: releer y comprobar
const pr2 = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'PROYECTOS!A:EW' })).data.values
let mal = 0
for (const num of ['2156', '2213', '2224', '2225']) {
  const x = pr2[filaP(num)]
  for (const col of ['Drive Crudo', 'Drive Entrega', 'Drive Finales']) { const id = idDe(x[cP(col)]); if (id && !(await vive(id))) { mal++; console.log(`   ✗ #${num} ${col} sigue roto`) } }
}
const cl2 = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'CLIENTES!A:Z' })).data.values
const edg = cl2.find((x, i) => i > 0 && k(x[0]) === 'AUSTRALEDG')
if (!edg || !idDe(edg[cC('Drive Entregas')])) { mal++; console.log('   ✗ CLIENTES: Austral EDG no quedó con su carpeta') }
console.log(mal ? `\n✗ ${mal} cosas no cerraron` : `\n✓ verificado: los links de #2156, #2213, #2224 y #2225 apuntan a carpetas vivas (o están vacíos a propósito) y "Austral EDG" está en CLIENTES con sus carpetas`)
