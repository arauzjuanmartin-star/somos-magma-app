/**
 * ACUERDOS, dos ajustes pedidos por Juan el 03/10/2026:
 *
 * 1. Las columnas "Solo cliente" / "Excluye cliente" pasan a llamarse "Vale solo para" / "No vale para".
 *    Juan: "en acuerdos no los limitaría, a veces necesito a uno en un lado y a otro en el otro; lo que cambia es el
 *    arreglo que tengo con cada uno". Las columnas nunca limitaron a quién se manda: solo dicen qué arreglo de plata
 *    corresponde en cada trabajo. El nombre nuevo lo dice.
 *
 * 2. Una fila nueva para Lucho en Austral: "le seguimos pagando Austral como le pagábamos antes; el acuerdo es para
 *    los otros eventos". Lo de antes = $145.000 la media jornada (14 de sus 16 coberturas de Austral de julio y agosto
 *    de 2026 están a ese valor), por cobertura, sin mínimo. Con esta fila el cargador de staff le pone esa tarifa cuando
 *    va a Austral y no le gasta jornadas del banco.
 *
 * Uso:  node scripts/acuerdos-lucho-austral.mjs            (preview)
 *       node scripts/acuerdos-lucho-austral.mjs --escribir
 */
import { readFileSync } from 'fs'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const i = l.indexOf('='); if (i < 0) continue; let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); process.env[l.slice(0, i).trim()] = v }
process.removeAllListeners('warning')
const { getSheets } = await import('../lib/sheets.js')

const ESCRIBIR = process.argv.includes('--escribir')
const HOJA = 'ACUERDOS'
const RENOMBRAR = { 'Solo cliente': 'Vale solo para', 'Excluye cliente': 'No vale para' }
const txt = v => String(v ?? '').trim()
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }

const { sheets, SHEET_ID } = await getSheets()
const filas = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${HOJA}!A:Z` })).data.values || []
const H = (filas[0] || []).map(txt)
console.log(`\n${HOJA} — ${ESCRIBIR ? 'ESCRIBIENDO' : 'PREVIEW (nada se toca)'}\n`)

const cambiosTitulo = Object.entries(RENOMBRAR).filter(([de]) => H.includes(de)).map(([de, a]) => ({ celda: `${HOJA}!${colLetra(H.indexOf(de))}1`, de, a }))
cambiosTitulo.forEach(c => console.log(`  Título ${c.celda}: "${c.de}" → "${c.a}"`))
if (!cambiosTitulo.length) console.log('  Los títulos ya están con el nombre nuevo.')
const H2 = H.map(h => RENOMBRAR[h] || h)

const lucho = filas.find((r, i) => i > 0 && /chavez/i.test(txt(r[H.indexOf('Persona')])))
if (!lucho) { console.error('No encuentro la fila de Lucho. Freno.'); process.exit(1) }
const yaEsta = filas.some((r, i) => i > 0 && /chavez/i.test(txt(r[H.indexOf('Persona')])) && /austral/i.test(txt(r[H2.indexOf('Vale solo para')])))
const nueva = {
  'Persona': txt(lucho[H.indexOf('Persona')]), 'Alcance': 'Universidad Austral — como antes del acuerdo', 'Vale solo para': 'Austral', 'No vale para': '',
  'Modalidad': 'Por cobertura', 'Desde': '01/09/2026', 'Hasta': '', 'Estado': 'Vigente', 'Unidad': 'Cobertura (media jornada)', 'Precio unidad': 145000,
  'Cuándo cobra': 'El 15 del mes siguiente', 'Lo que quedó abierto': 'Cuánto vale la jornada entera en Austral (hubo una a $270.000 el 03/09/2026)',
}
if (yaEsta) console.log('\n  La fila de Lucho en Austral ya existe. No la agrego.')
else { console.log(`\n  Fila nueva (la ${filas.length + 1}):`); Object.entries(nueva).filter(([, v]) => v !== '').forEach(([k, v]) => console.log(`    ${k.padEnd(22)} ${v}`)) }
if (!ESCRIBIR) { console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir para aplicar. ---\n'); process.exit(0) }

if (cambiosTitulo.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: cambiosTitulo.map(c => ({ range: c.celda, values: [[c.a]] })) } })
// La fila va justo debajo de la última con datos, escrita por posición exacta (no append: así no se corre de columna).
if (!yaEsta) await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${HOJA}!A${filas.length + 1}:${colLetra(H2.length - 1)}${filas.length + 1}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [H2.map(h => (h in nueva ? nueva[h] : ''))] } })

const F = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${HOJA}!A:Z` })).data.values || [], HF = F[0].map(txt)
console.log(`\n✓ Títulos: ${HF.slice(0, 5).join(' · ')} …`)
F.slice(1).forEach((r, k) => console.log(`  fila ${k + 2} · ${txt(r[HF.indexOf('Persona')])} · ${txt(r[HF.indexOf('Alcance')])} · vale solo para: ${txt(r[HF.indexOf('Vale solo para')]) || '—'} · no vale para: ${txt(r[HF.indexOf('No vale para')]) || '—'} · ${txt(r[HF.indexOf('Precio unidad')])} · mínimo ${txt(r[HF.indexOf('Mínimo x mes')]) || '—'}`))
console.log('')
