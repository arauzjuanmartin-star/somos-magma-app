/**
 * Columna "Plazo de pago" (en días) en la solapa AGENCIAS, pegada a "Mail facturacion": es un dato de cómo se le
 * factura a esa agencia. La app la lee al armar una factura nueva y propone ese plazo en vez de los 30 días de
 * siempre (pages/index.js: plazoDeAgencia). Se edita desde la app (Agencias → Editar) o directo en la celda.
 *
 * Juan, 05/10/2026: "Oir (Unilever) paga a 90 días. Cada vez que hagamos una factura de Unilever, que sea 90".
 *
 * Qué hace con --escribir:
 *   1. Inserta la columna (si no está) y le pone 90 a Oir Comunicaciones.
 *   2. Vacía las celdas de "Drive Recursos" que tienen una FECHA en vez de un link: las dejó agencia-upsert, que
 *      escribía "Modificada" por posición. Con la fecha ahí, la app no podía anotar el link de la carpeta.
 *   3. FACTURACION: las facturas de Oir Comunicaciones SIN COBRAR pasan a "90 días" y su vencimiento a emisión + 90.
 *      Las cobradas no se tocan.
 * Verifica al final que ninguna columna se haya corrido.
 *
 * OJO con el orden: primero tiene que estar subido el código que lee AGENCIAS por título (agencia-upsert escribía
 * por posición); recién después se corre esto.
 *
 * Uso:  node scripts/agencias-columna-plazo.mjs            (preview)
 *       node scripts/agencias-columna-plazo.mjs --escribir
 */
import { google } from 'googleapis'
import { readFileSync, writeFileSync } from 'fs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })
const ID = env.SHEET_ID || '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')

const COL = 'Plazo de pago', DESPUES_DE = 'Mail facturacion'
const PLAZOS = { 'Oir Comunicaciones': 90 }          // agencia → días
const txt = v => String(v ?? '').trim()
const norm = s => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
const $ = n => '$' + Math.round(n || 0).toLocaleString('es-AR')
const num = v => { if (typeof v === 'number') return v; const n = parseFloat(txt(v).replace(/[$,\s]/g, '')); return isNaN(n) ? 0 : n }
const fechaAR = s => { const m = txt(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null }
const dmy = d => `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`

const meta = await sheets.spreadsheets.get({ spreadsheetId: ID, fields: 'sheets(properties(title,sheetId,gridProperties),basicFilter)' })
const hoja = meta.data.sheets.find(s => s.properties.title === 'AGENCIAS'), sheetId = hoja.properties.sheetId
const R = await sheets.spreadsheets.values.batchGet({ spreadsheetId: ID, ranges: ['AGENCIAS!A:Z', 'FACTURACION!A:AJ'], valueRenderOption: 'FORMATTED_VALUE' })
const RF = await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'FACTURACION!A:AJ', valueRenderOption: 'FORMULA' })
const [AG, FC] = R.data.valueRanges.map(v => v.values || []), FCF = RF.data.values || []
const H = AG[0] || []
const iYa = H.findIndex(h => norm(h) === norm(COL)), iAncla = H.findIndex(h => norm(h) === norm(DESPUES_DE))
if (iAncla < 0) { console.log(`No encuentro la columna "${DESPUES_DE}" en AGENCIAS. Freno.`); process.exit(1) }
const DESTINO = iYa >= 0 ? iYa : iAncla + 1
const queda = iYa >= 0 ? [...H] : [...H.slice(0, DESTINO), COL, ...H.slice(DESTINO)]

console.log(`\nAGENCIAS · ${AG.length - 1} agencias — ${ESCRIBIR ? 'ESCRIBIENDO' : 'PREVIEW (nada se toca)'}\n`)
console.log('1. Columna "Plazo de pago"')
console.log(`   AHORA: ${H.map((h, i) => `${colLetra(i)}:${h}`).join(' · ')}`)
console.log(iYa >= 0 ? `   Ya existe en ${colLetra(iYa)}.` : `   QUEDA: ${queda.map((h, i) => `${colLetra(i)}:${h}`).join(' · ')}`)
const problemas = [], plazos = []
for (const [nombre, dias] of Object.entries(PLAZOS)) {
  const f = AG.map((r, i) => ({ r, i })).filter(({ r, i }) => i > 0 && norm(r[0]) === norm(nombre))
  if (f.length !== 1) { problemas.push(`AGENCIAS: "${nombre}" figura ${f.length} veces, esperaba 1`); continue }
  const ya = iYa >= 0 ? txt(f[0].r[iYa]) : ''
  console.log(`   ${nombre} (fila ${f[0].i + 1}): ${ya || 'sin plazo'} → ${dias} días`)
  plazos.push({ fila: f[0].i + 1, dias, nombre })
}

console.log('\n2. "Drive Recursos" con una fecha en vez de un link')
const iRec = H.findIndex(h => norm(h) === 'drive recursos'), limpiar = []
AG.forEach((r, i) => { if (i > 0 && iRec >= 0 && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(txt(r[iRec]))) limpiar.push({ fila: i + 1, nombre: txt(r[0]), valor: txt(r[iRec]) }) })
console.log(limpiar.length ? `   ${limpiar.length} agencias: ${limpiar.map(x => `${x.nombre} (${x.valor})`).join(' · ')}` : '   Ninguna.')

console.log('\n3. Facturas sin cobrar de las agencias con plazo propio')
const fh = FC[0], F = n => fh.indexOf(n), cambiosFC = []
for (const n of ['Agencia', 'Cobrado', 'Fecha emision', 'Plazo', 'Vencimiento', 'Precio FINAL', 'N° Presupuesto', 'Nro de Factura']) if (F(n) < 0) problemas.push(`FACTURACION: falta la columna "${n}"`)
if (!problemas.length) FC.forEach((r, i) => { if (!i) return
  const dias = Object.entries(PLAZOS).find(([nombre]) => norm(r[F('Agencia')]) === norm(nombre))?.[1]; if (!dias) return
  if (/^(true|s[ií])$/i.test(txt(r[F('Cobrado')]))) return
  const em = fechaAR(r[F('Fecha emision')])
  if (!em) { console.log(`   fila ${i + 1} #${r[F('N° Presupuesto')]}: sin fecha de emisión, no la toco`); return }
  const venc = dmy(new Date(em.getFullYear(), em.getMonth(), em.getDate() + dias)), plazoNuevo = `${dias} días`
  if (txt(r[F('Plazo')]) === plazoNuevo && txt(r[F('Vencimiento')]) === venc) return
  for (const c of ['Plazo', 'Vencimiento']) if (txt(FCF[i]?.[F(c)]).startsWith('=')) problemas.push(`FACTURACION fila ${i + 1}: "${c}" es una fórmula, no la piso`)
  cambiosFC.push({ fila: i + 1, nro: txt(r[F('N° Presupuesto')]), fc: txt(r[F('Nro de Factura')]), total: num(r[F('Precio FINAL')]), emision: txt(r[F('Fecha emision')]), plazoAntes: txt(r[F('Plazo')]), vencAntes: txt(r[F('Vencimiento')]), plazoNuevo, venc })
})
const hoy0 = new Date(); hoy0.setHours(0, 0, 0, 0)
let vencAntes = 0, vencDespues = 0
cambiosFC.forEach(c => { const a = fechaAR(c.vencAntes), d = fechaAR(c.venc); if (a && a < hoy0) vencAntes += c.total; if (d && d < hoy0) vencDespues += c.total
  console.log(`   fila ${c.fila}  #${c.nro.padEnd(5)} FC ${c.fc.padEnd(14)} ${$(c.total).padStart(11)}  emitida ${c.emision.padEnd(10)} ${c.plazoAntes.padEnd(8)} vence ${c.vencAntes.padEnd(10)} → ${c.plazoNuevo} vence ${c.venc}`) })
console.log(`   ${cambiosFC.length} facturas por ${$(cambiosFC.reduce((s, c) => s + c.total, 0))}. Hoy figuran vencidas ${$(vencAntes)}; con 90 días, ${$(vencDespues)}.`)

if (problemas.length) { console.log('\n⚠ NO CIERRA, no escribo nada:'); problemas.forEach(p => console.log('   · ' + p)); process.exit(1) }
if (!ESCRIBIR) { console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir para aplicar. ---\n'); process.exit(0) }

// ── escribir ──
writeFileSync('scripts/.rollback-agencias-columna-plazo.json', JSON.stringify({ cuando: new Date().toISOString(), headersAntes: H, columnaInsertadaEn: iYa >= 0 ? null : DESTINO, driveRecursosVaciadas: limpiar, facturas: cambiosFC }, null, 1))
const ctrl = AG.filter((r, i) => i > 0 && txt(r[0])).map(r => ({ nombre: txt(r[0]), fila: H.map((h, j) => [h, txt(r[j])]) }))   // foto de TODAS las filas, por título

if (iYa < 0) {
  const reqs = [
    { insertDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: DESTINO, endIndex: DESTINO + 1 }, inheritFromBefore: true } },
    { copyPaste: { source: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 }, destination: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: DESTINO, endColumnIndex: DESTINO + 1 }, pasteType: 'PASTE_FORMAT' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: DESTINO, endIndex: DESTINO + 1 }, properties: { pixelSize: 120 }, fields: 'pixelSize' } },
  ]
  // el filtro tiene que abarcar la columna nueva, si no no aparece en el desplegable
  if (hoja.basicFilter) { const bf = JSON.parse(JSON.stringify(hoja.basicFilter)); bf.range.endColumnIndex = Math.max(bf.range.endColumnIndex, queda.length); delete bf.criteria; delete bf.filterSpecs; reqs.push({ setBasicFilter: { filter: bf } }) }
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests: reqs } })
  await sheets.spreadsheets.values.update({ spreadsheetId: ID, range: `AGENCIAS!${colLetra(DESTINO)}1`, valueInputOption: 'RAW', requestBody: { values: [[COL]] } })
}
const LP = colLetra(DESTINO), iRec2 = queda.findIndex(h => norm(h) === 'drive recursos')
const data = [
  ...plazos.map(p => ({ range: `AGENCIAS!${LP}${p.fila}`, values: [[p.dias]] })),
  ...limpiar.map(x => ({ range: `AGENCIAS!${colLetra(iRec2)}${x.fila}`, values: [['']] })),
  ...cambiosFC.flatMap(c => [{ range: `FACTURACION!${colLetra(F('Plazo'))}${c.fila}`, values: [[c.plazoNuevo]] }, { range: `FACTURACION!${colLetra(F('Vencimiento'))}${c.fila}`, values: [[c.venc]] }]),
]
if (data.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: ID, requestBody: { valueInputOption: 'USER_ENTERED', data } })
await sheets.spreadsheets.values.append({ spreadsheetId: ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [
  [new Date().toISOString(), 'juan@somosmagma.com', 'agencias-columna-plazo', 'AGENCIAS', LP, `Columna "${COL}" en ${LP} · ${plazos.map(p => `${p.nombre}=${p.dias}`).join(', ')} · ${limpiar.length} fechas sacadas de Drive Recursos`],
  [new Date().toISOString(), 'juan@somosmagma.com', 'agencias-columna-plazo', 'FACTURACION', cambiosFC.map(c => c.nro).join(','), `Plazo y vencimiento a 90 días en ${cambiosFC.length} facturas sin cobrar de Oir: ` + cambiosFC.map(c => `#${c.nro} ${c.vencAntes}→${c.venc}`).join(' · ')],
] } })

// ── verificación: cada agencia conserva cada dato bajo el MISMO título ──
const V = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'AGENCIAS!A:Z' })).data.values || [], H2 = V[0] || []
const esperado = queda.map(norm).join('|'), real = H2.map(norm).join('|')
console.log(`\n${real === esperado ? '✓' : '✗'} títulos: ${H2.map((h, i) => `${colLetra(i)}:${h}`).join(' · ')}`)
let corridas = 0
ctrl.forEach(c => { const r = V.find((x, i) => i > 0 && txt(x[0]) === c.nombre); if (!r) { corridas++; return }
  for (const [h, v] of c.fila) { if (!h) continue; const j = H2.indexOf(h), ahora = txt(r[j]); const eraFecha = norm(h) === 'drive recursos' && limpiar.some(x => x.nombre === c.nombre)
    if (!(eraFecha ? ahora === '' : ahora === v)) { corridas++; console.log(`   ✗ ${c.nombre} · ${h}: antes "${v}", ahora "${ahora}"`); break } } })
console.log(`${corridas ? '✗' : '✓'} ${ctrl.length - corridas}/${ctrl.length} agencias con todos sus datos en la misma columna`)
plazos.forEach(p => { const r = V.find((x, i) => i > 0 && norm(x[0]) === norm(p.nombre)); console.log(`${txt(r?.[H2.indexOf(COL)]) === String(p.dias) ? '✓' : '✗'} ${p.nombre}: plazo ${txt(r?.[H2.indexOf(COL)])} días`) })
const V2 = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'FACTURACION!A:AJ' })).data.values || []
const okFC = cambiosFC.filter(c => txt(V2[c.fila - 1]?.[F('Plazo')]) === c.plazoNuevo && txt(V2[c.fila - 1]?.[F('Vencimiento')]) === c.venc).length
console.log(`${okFC === cambiosFC.length ? '✓' : '✗'} ${okFC}/${cambiosFC.length} facturas con 90 días y su vencimiento nuevo`)
console.log('   Rollback en scripts/.rollback-agencias-columna-plazo.json\n')
if (real !== esperado || corridas || okFC !== cambiosFC.length) process.exit(1)
