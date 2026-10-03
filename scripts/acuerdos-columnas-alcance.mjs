/**
 * ACUERDOS: dos columnas para que el ALCANCE de cada acuerdo lo entienda la app, no solo una persona leyendo.
 *
 * El problema (visto el 21/09/2026, arreglado el 03/10 por pedido de Juan): el Alcance es texto libre ("Cámara para toda
 * Magma — SIN Austral", "Universidad Austral — toda la cuenta") y el contador de jornadas no lo miraba: a Lucho le
 * contaba las de Austral y le marcaba "extra, $180.000" cuando todavía estaba dentro de las 10.
 *
 *   · "Solo cliente"     el acuerdo vale ÚNICAMENTE para trabajos de ese cliente o agencia (Juani → Austral)
 *   · "Excluye cliente"  el acuerdo vale para todo MENOS ese cliente o agencia (Lucho → Austral)
 * Se compara contra Cliente y Agencia del trabajo, sin mayúsculas ni tildes, por "contiene". Varios, separados por coma.
 *
 * Van al lado de "Alcance" (C y D), que es lo que acompañan. Todo lo que lee ACUERDOS lo hace por nombre de título.
 *
 * Uso:  node scripts/acuerdos-columnas-alcance.mjs            (preview)
 *       node scripts/acuerdos-columnas-alcance.mjs --escribir
 */
import { readFileSync } from 'fs'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const i = l.indexOf('='); if (i < 0) continue; let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); process.env[l.slice(0, i).trim()] = v }
process.removeAllListeners('warning')
const { getSheets } = await import('../lib/sheets.js')

const ESCRIBIR = process.argv.includes('--escribir')
const HOJA = 'ACUERDOS', NUEVAS = ['Solo cliente', 'Excluye cliente']
// Qué va en cada fila de las que ya existen: [texto que identifica a la persona, Solo cliente, Excluye cliente]
const VALORES = [['chavez', '', 'Austral'], ['gugliottella', 'Austral', '']]
const txt = v => String(v ?? '').trim()
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }

const { sheets, SHEET_ID } = await getSheets()
const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, ranges: [HOJA], fields: 'sheets(properties(title,sheetId,gridProperties),basicFilter)' })
const hoja = meta.data.sheets.find(s => s.properties.title === HOJA)
if (!hoja) { console.error(`No existe la solapa ${HOJA}.`); process.exit(1) }
const sid = hoja.properties.sheetId
const filas = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${HOJA}!A:Z` })).data.values || []
const H = (filas[0] || []).map(txt)
const iAlc = H.indexOf('Alcance'), iPer = H.indexOf('Persona')
console.log(`\n${HOJA} · ${filas.length - 1} acuerdos · ${H.length} columnas — ${ESCRIBIR ? 'ESCRIBIENDO' : 'PREVIEW (nada se toca)'}`)
if (iAlc < 0 || iPer < 0) { console.error('No encuentro "Persona" o "Alcance". Freno.'); process.exit(1) }
if (NUEVAS.every(n => H.includes(n))) { console.log('\nLas dos columnas ya existen. No hago nada.\n'); process.exit(0) }
if (NUEVAS.some(n => H.includes(n))) { console.error('Existe una de las dos columnas pero no la otra. Revisar a mano. Freno.'); process.exit(1) }

const D = iAlc + 1
const queda = [...H]; queda.splice(D, 0, ...NUEVAS)
console.log(`\nAHORA: ${H.map((h, i) => `${colLetra(i)}:${h}`).join(' · ')}`)
console.log(`\nQUEDA: ${queda.map((h, i) => `${colLetra(i)}:${h}`).join(' · ')}`)
console.log(`\nSe insertan ${colLetra(D)} "${NUEVAS[0]}" y ${colLetra(D + 1)} "${NUEVAS[1]}", al lado de Alcance. Valores:`)
const plan = filas.slice(1).map((r, k) => { const v = VALORES.find(x => txt(r[iPer]).toLowerCase().includes(x[0])); return { fila: k + 2, persona: txt(r[iPer]), alcance: txt(r[iAlc]), solo: v ? v[1] : '', excluye: v ? v[2] : '' } })
plan.forEach(p => console.log(`  fila ${p.fila} · ${p.persona} · "${p.alcance}"  →  Solo cliente: ${p.solo || '(vacío)'} · Excluye cliente: ${p.excluye || '(vacío)'}`))
console.log(`\nEl filtro de la solapa se extiende a ${queda.length} columnas. lib/sheets.js pasa a leer ${HOJA}!A:W.`)
if (!ESCRIBIR) { console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir para aplicar. ---\n'); process.exit(0) }

const ctrl = filas.slice(1).map(r => [txt(r[iPer]), txt(r[H.indexOf('Precio unidad')]), txt(r[H.indexOf('Mínimo x mes')])].join('|'))
const reqs = [
  { insertDimension: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: D, endIndex: D + 2 }, inheritFromBefore: true } },
  { updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: D, endIndex: D + 2 }, properties: { pixelSize: 130 }, fields: 'pixelSize' } },
]
if (hoja.basicFilter) { const bf = JSON.parse(JSON.stringify(hoja.basicFilter)); bf.range.endColumnIndex = Math.max(bf.range.endColumnIndex + 2, queda.length); delete bf.criteria; delete bf.filterSpecs; reqs.push({ setBasicFilter: { filter: bf } }) }
await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: reqs } })
await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${HOJA}!${colLetra(D)}1:${colLetra(D + 1)}${plan.length + 1}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [NUEVAS, ...plan.map(p => [p.solo, p.excluye])] } })

// verificación: los títulos en orden y los datos de cada fila donde estaban
const F2 = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${HOJA}!A:Z` })).data.values || [], H2 = (F2[0] || []).map(txt)
const ctrl2 = F2.slice(1).map(r => [txt(r[H2.indexOf('Persona')]), txt(r[H2.indexOf('Precio unidad')]), txt(r[H2.indexOf('Mínimo x mes')])].join('|'))
console.log(`\n✓ Títulos: ${H2.join(' · ')}`)
console.log(`${H2.join('|') === queda.join('|') ? '✓' : '⚠'} orden de columnas ${H2.join('|') === queda.join('|') ? 'correcto' : 'NO coincide con lo esperado'}`)
console.log(`${ctrl.join('#') === ctrl2.join('#') ? '✓' : '⚠'} Persona / Precio unidad / Mínimo de cada fila ${ctrl.join('#') === ctrl2.join('#') ? 'siguen alineados' : 'SE DESALINEARON'}`)
F2.slice(1).forEach((r, k) => console.log(`  fila ${k + 2} · ${txt(r[H2.indexOf('Persona')])} · Solo: ${txt(r[H2.indexOf('Solo cliente')]) || '—'} · Excluye: ${txt(r[H2.indexOf('Excluye cliente')]) || '—'}`))
console.log('')
