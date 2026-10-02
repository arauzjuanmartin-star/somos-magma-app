/**
 * IMPUESTOS — los VEP del contador, con su monto, su vencimiento y si el banco dice que se pagaron.
 *
 * Lee los mails de Diego Musco, saca cada volante (el PDF es texto: no hace falta IA) y lo deja en la solapa IMPUESTOS,
 * una fila por VEP. Después cruza cada uno contra los extractos del banco que ya están en MOVIMIENTOS_BANCO: BBVA
 * escribe el número del volante en el pago, los otros bancos se cruzan por monto exacto.
 *
 * La solapa la leen Caja y Hoy de la app (lib/impuestos.mjs): el impuesto aparece con su monto real el día que vence,
 * y el extracto lo marca pagado solo.
 *
 * Nunca borra ni pisa filas: agrega los VEP que no están y marca "Pagado" los que encuentra pagados en el banco.
 *
 * Uso:  node scripts/impuestos-veps.mjs                 (preview: no toca nada)
 *       node scripts/impuestos-veps.mjs --escribir      (crea la solapa si no existe, agrega y marca)
 *   --dias N              solo los mails de los últimos N días (si la solapa ya existe, por defecto 25; si no, todos)
 *   --extracto a.csv --cuenta "Galicia Sofi"   suma como evidencia un extracto que todavía no se subió a la app
 *   --volcar a.json       guarda cómo quedaría la solapa (para probar Caja sin escribir nada)
 */
import { readFileSync, writeFileSync } from 'fs'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const i = l.indexOf('='); if (i < 0) continue; let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); process.env[l.slice(0, i).trim()] = v }
process.removeAllListeners('warning')

const { getSheets } = await import('../lib/sheets.js')
const { vepsDelMail } = await import('../lib/impuestos-mail.mjs')
const { nombreVep, estadoVep, pagoDeVep, TITULARES } = await import('../lib/impuestos.mjs')
const { leerExtracto } = await import('../lib/extracto.mjs')
const { HEADERS_IMPUESTOS, celdaImpuesto, filaDeVep, vepsParaAgregar, reemplazarViejos, tripleVep } = await import('../lib/impuestos-sync.mjs')

const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : '' }
const ESCRIBIR = process.argv.includes('--escribir')
const HOJA = 'IMPUESTOS', FILAS = 1000

// [título, ancho, qué va]. La app lee y escribe por nombre de título, no por posición.
const COLS = [
  ['Titular',      90, 'de quién es: Magma, Sofi, Lucia o Juan'],
  ['Impuesto',    105, 'IVA, IIBB, F.931 (cargas sociales), Autónomos, Monotributo'],
  ['Período',      85, 'el mes que se paga (06-2026)'],
  ['Monto',       130, 'el importe del volante'],
  ['Vencimiento', 105, 'el día que escribe Diego en el mail ("VENCE: 23/09")'],
  ['Mes',          90, 'el mes del vencimiento, para filtrar (se calcula solo)'],
  ['Pagado',       90, 'SI · NO · NO VA (se reemplazó por otro volante) · SIN DATO (anterior a los extractos)'],
  ['Fecha pago',  100, 'cuándo salió la plata'],
  ['Cuenta pago', 150, 'de qué cuenta'],
  ['Monto pagado', 130, 'lo que salió (puede traer intereses)'],
  ['N° VEP',      110, 'el número del volante: es lo que escribe el banco al pagarlo'],
  ['Llegó',       100, 'el día que Diego lo mandó'],
  ['Cómo se supo', 230, 'de dónde sale que está pagado'],
  ['Notas',       330, ''],
  ['Asunto',      260, 'el asunto del mail de Diego'],
]
const HEADERS = COLS.map(c => c[0])
if (HEADERS.join('|') !== HEADERS_IMPUESTOS.join('|')) { console.error('Las columnas de este script no coinciden con las de lib/impuestos-sync.mjs. No hago nada.'); process.exit(1) }
const colLetra = c => String.fromCharCode(65 + c)
// Lo que se sabe por fuera del mail y del banco (dicho por Juan o deducido de los hilos). Solo se aplica en la PRIMERA carga.
const AJUSTES = {
  noVa: { '1674404311': 'Según Juan (29/09): Diego dijo el 16/09 que no se pague y mandó uno nuevo, compensado con el saldo a favor. El que se pagó es el de $2.352.762,62.' },
  filas: [
    { Titular: 'Sofi', Impuesto: 'IVA', 'Período': '06-2026', Monto: 2352762.62, Vencimiento: '21/09/2026', 'Llegó': '16/09/2026', Notas: 'Según Juan (29/09): es el volante nuevo, compensado con el saldo a favor, que Diego mandó por WhatsApp (no está en el mail). El monto es el del gasto "SOFI IVA 06-2026" que cargó el equipo.', Asunto: '' },
  ],
  montos: [{ Titular: 'Sofi', Impuesto: 'Autónomos', 'Período': '08-2026', Monto: 105561.86, Notas: 'El volante llegó como imagen: el importe no se pudo leer. Se toma el del pago a AFIP del 21/09 desde Galicia Sofi, que coincide con lo cargado en gastos fijos.' }],
  notas: {
    '1652530601': 'Probable: es el pago de $38.292,62 del 14/08 desde Santander Lucia (Diego avisó el 13/08 que estaba impago y reenvió el volante). Sin confirmar.',
    '1626521981': 'Probable: es el pago de $216.110,94 del 13/08 desde Galicia Sofi (Diego reenvió el volante ese día en el hilo de este impuesto; la diferencia serían tres meses de intereses). Sin confirmar.',
  },
}

const txt = v => String(v ?? '').trim()
const num = v => parseFloat(String(v ?? '').replace(/[$,\s]/g, '')) || 0
const fechaDe = s => { const m = txt(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null }
const dmy = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
const plata = n => '$' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const triple = tripleVep, aFila = filaDeVep

const { sheets, SHEET_ID } = await getSheets()
const leer = async r => { try { return (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: r })).data.values || [] } catch (e) { return null } }
const objetos = vals => { const H = (vals?.[0] || []).map(txt); return (vals || []).slice(1).map((r, i) => { const o = { __row: i + 2 }; H.forEach((h, k) => { if (h) o[h] = r[k] ?? '' }); return o }) }

const [vImp, vBanco, vGastos] = await Promise.all([leer(`${HOJA}!A:O`), leer('MOVIMIENTOS_BANCO!A:O'), leer('GASTOS_FIJOS!A:W')])
const existe = vImp !== null
const filas = objetos(vImp).filter(r => txt(r['Impuesto']))
const gastos = objetos(vGastos)

console.log(`\nIMPUESTOS — los VEP del contador · ${ESCRIBIR ? 'ESCRIBIENDO' : 'PREVIEW (nada se toca)'}`)
console.log(existe ? `La solapa ${HOJA} ya existe: ${filas.length} VEP cargados.` : `La solapa ${HOJA} NO existe: es la primera carga.`)

// ---------- 1. Los movimientos del banco que ya están en la app (y, si se pide, un extracto que todavía no se subió)
let movs = objetos(vBanco).map(r => ({ fecha: fechaDe(r['Fecha']), texto: `${txt(r['Concepto'])} ${txt(r['Detalle'])}`, salio: num(r['Salió']), cuenta: txt(r['Cuenta']), de: `fila ${r.__row} de MOVIMIENTOS_BANCO` })).filter(m => m.fecha && m.salio > 0)
if (arg('--extracto')) {
  const cuenta = arg('--cuenta'); if (!cuenta) { console.error('Falta --cuenta "Nombre de la cuenta" para el extracto.'); process.exit(1) }
  const ex = leerExtracto(readFileSync(arg('--extracto'), 'utf8'))
  const extra = ex.movs.filter(m => m.monto < 0).map(m => ({ fecha: m.fecha, texto: `${m.concepto} ${m.detalle || ''}`, salio: -m.monto, cuenta, de: 'extracto sin subir' }))
  console.log(`Sumo como evidencia el extracto de ${cuenta}: ${extra.length} pagos (todavía no está subido a la app).`)
  movs = movs.concat(extra)
}
const cuentasConDatos = [...new Set(movs.map(m => m.cuenta))]
const desdeDe = c => movs.filter(m => m.cuenta === c).reduce((a, m) => !a || m.fecha < a ? m.fecha : a, null)
console.log('Extractos disponibles: ' + (cuentasConDatos.map(c => `${c} desde el ${dmy(desdeDe(c))}`).join(' · ') || 'ninguno'))

// ---------- 2. Los VEP del mail
const dias = parseInt(arg('--dias')) || (existe ? 25 : 0)
const desde = dias ? new Date(Date.now() - dias * 864e5) : null
console.log(`Leyendo el mail de Diego${desde ? ` (desde el ${dmy(desde)})` : ' (todo)'}…`)
const { veps: delMail, errores } = await vepsDelMail({ user: process.env.MAIL_USER, pass: process.env.MAIL_APP_PASSWORD, desde })
if (errores.length) { console.log(`\n⚠ ${errores.length} PDF que no se pudieron leer:`); errores.forEach(e => console.log('   ' + e)) }
const { nuevas, conPdf, sinPdf } = vepsParaAgregar(delMail, filas)
console.log(`En el mail: ${conPdf} volantes en PDF y ${sinPdf} avisos sin PDF. Nuevos para la solapa: ${nuevas.length}.`)

if (!existe) {
  for (const r of nuevas) {
    if (AJUSTES.noVa[txt(r['N° VEP'])]) { r.Pagado = 'NO VA'; r.Notas = AJUSTES.noVa[txt(r['N° VEP'])] }
    if (AJUSTES.notas[txt(r['N° VEP'])]) r.Notas = AJUSTES.notas[txt(r['N° VEP'])]
    const m = AJUSTES.montos.find(x => triple(x) === triple(r)); if (m && !num(r.Monto)) { r.Monto = m.Monto; r.Notas = m.Notas }
  }
  for (const f of AJUSTES.filas) nuevas.push({ ...aFila({}), ...f, Pagado: 'NO' })
}
// Un volante nuevo del mismo impuesto, período y titular reemplaza al anterior que seguía sin pagar.
const reemplazos = reemplazarViejos(nuevas, filas).filter(r => r.__row)

// ---------- 3. ¿Cuáles figuran pagados? Primero el banco; si no, lo que alguien marcó a mano en los gastos fijos.
const usados = new Set(), marcados = []
const pendientes = [...filas, ...nuevas].filter(r => estadoVep(r) === 'pendiente' && num(r.Monto) > 0).sort((a, b) => (fechaDe(a['Llegó']) || 0) - (fechaDe(b['Llegó']) || 0))
for (const r of pendientes) {
  const p = pagoDeVep(r, movs, usados)
  if (p) { usados.add(p.mov); Object.assign(r, { Pagado: 'SI', 'Fecha pago': dmy(p.mov.fecha), 'Cuenta pago': p.mov.cuenta, 'Monto pagado': p.mov.salio, 'Cómo se supo': `Banco: ${p.como} (${p.mov.de})` }); marcados.push(r); continue }
  const g = gastos.find(g => /[uú]nico/i.test(txt(g['Frecuencia'])) && /^s[ií]$/i.test(txt(g['Pagado'])) && /impuesto/i.test(`${txt(g['Rubro'])} ${txt(g['Categoria'])}`) && Math.abs(num(g['Monto']) - num(r.Monto)) < 1 && txt(g['Fecha pago']))
  if (g) { Object.assign(r, { Pagado: 'SI', 'Fecha pago': fechaDe(g['Fecha pago']) ? dmy(fechaDe(g['Fecha pago'])) : txt(g['Fecha pago']), 'Cuenta pago': txt(g['Cuenta pago']), 'Monto pagado': num(g['Monto']), 'Cómo se supo': `Lo marcó alguien en la app: "${txt(g['Concepto'])}" (fila ${g.__row} de GASTOS_FIJOS)` }); marcados.push(r) }
}
// Primera carga: lo que venció antes de que haya extractos de la cuenta de ese titular no se puede saber. No es una deuda: es "sin dato".
if (!existe) {
  const cuentaDe = {}; for (const r of marcados) if (/^Banco/.test(r['Cómo se supo'])) cuentaDe[r.Titular] = r['Cuenta pago']
  for (const r of nuevas.filter(r => r.Pagado === 'NO')) {
    const cta = cuentaDe[r.Titular], cubre = cta ? desdeDe(cta) : null, v = fechaDe(r.Vencimiento)
    if (!cubre || (v && v < cubre)) { r.Pagado = 'SIN DATO'; r['Cómo se supo'] = cta ? `Venció antes del primer extracto cargado de ${cta} (${dmy(cubre)})` : 'No hay extractos de la cuenta de donde paga' }
  }
}

// ---------- Preview
const orden = (a, b) => (fechaDe(a['Llegó']) || 0) - (fechaDe(b['Llegó']) || 0)
nuevas.sort(orden)
const linea = r => `  ${txt(r['Llegó']).padEnd(11)} ${nombreVep(r).padEnd(26)} ${plata(num(r.Monto)).padStart(16)}  vence ${txt(r.Vencimiento).padEnd(11)} ${txt(r.Pagado).padEnd(8)} ${r.Pagado === 'SI' ? `${r['Fecha pago']} · ${r['Cuenta pago']}${Math.abs(num(r['Monto pagado']) - num(r.Monto)) > 1 ? ` · salió ${plata(num(r['Monto pagado']))}` : ''}` : ''}${r.Notas ? `  ← ${r.Notas.slice(0, 70)}` : ''}`
if (nuevas.length) { console.log(`\nSE AGREGAN ${nuevas.length} FILAS:\n`); nuevas.forEach(r => console.log(linea(r))) }
const yaEstaban = marcados.filter(r => r.__row)
if (yaEstaban.length) { console.log(`\nSE MARCAN PAGADOS ${yaEstaban.length} QUE YA ESTABAN EN LA SOLAPA:\n`); yaEstaban.forEach(r => console.log(linea(r) + `  (${r['Cómo se supo']})`)) }
if (reemplazos.length) { console.log(`\nQUEDAN COMO "NO VA" (los reemplazó un volante nuevo): ${reemplazos.map(nombreVep).join(', ')}`) }
const todas = [...filas, ...nuevas]
const cuenta = e => todas.filter(r => txt(r.Pagado).toUpperCase() === e)
const sinPagar = cuenta('NO')
console.log(`\nCÓMO QUEDA: ${todas.length} VEP · ${cuenta('SI').length} pagados · ${sinPagar.length} sin pagar · ${cuenta('NO VA').length} que no van · ${cuenta('SIN DATO').length} sin dato`)
if (sinPagar.length) { console.log('\nSIN PAGAR:'); sinPagar.sort((a, b) => (fechaDe(a.Vencimiento) || 0) - (fechaDe(b.Vencimiento) || 0)).forEach(r => console.log(linea(r))) }
const porTit = TITULARES.map(t => `${t.nombre} ${todas.filter(r => r.Titular === t.nombre).length}`).join(' · ')
console.log(`\nPor titular: ${porTit}`)

if (arg('--volcar')) writeFileSync(arg('--volcar'), JSON.stringify([...filas, ...nuevas].map((r, i) => ({ ...r, __row: r.__row || i + 2 })), null, 1))
if (!ESCRIBIR) { console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir para aplicar. ---\n'); process.exit(0) }
if (!nuevas.length && !yaEstaban.length && !reemplazos.length && existe) { console.log('\nNo hay nada para escribir.\n'); process.exit(0) }

// ---------- Escribir
const celda = celdaImpuesto
const aValores = r => HEADERS.map(h => celda(r, h))
if (!existe) {
  const add = await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [{ addSheet: { properties: { title: HOJA, gridProperties: { rowCount: FILAS, columnCount: COLS.length, frozenRowCount: 1 } } } }] } })
  const sid = add.data.replies[0].addSheet.properties.sheetId
  // Con update (no append): en una solapa recién creada, las filas que inserta un append heredan el formato del título.
  await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${HOJA}!A1`, valueInputOption: 'USER_ENTERED', requestBody: { values: [HEADERS, ...nuevas.map(aValores)] } })
  const col = n => HEADERS.indexOf(n)
  const cuerpo = (c, extra = {}) => ({ sheetId: sid, startRowIndex: 1, endRowIndex: FILAS, startColumnIndex: c, endColumnIndex: c + 1, ...extra })
  const todo = { sheetId: sid, startRowIndex: 1, endRowIndex: FILAS, startColumnIndex: 0, endColumnIndex: COLS.length }
  const color = (r, g, b) => ({ red: r, green: g, blue: b })
  const regla = (formula, fondo, i) => ({ addConditionalFormatRule: { index: i, rule: { ranges: [todo], booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] }, format: { backgroundColor: fondo } } } } })
  const G = colLetra(col('Pagado')), E = colLetra(col('Vencimiento'))
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [
    { repeatCell: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { backgroundColor: color(.035, .035, .035), textFormat: { bold: true, foregroundColor: color(1, 1, 1) }, verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)' } },
    ...COLS.map((c, i) => ({ updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: c[1] }, fields: 'pixelSize' } })),
    ...['Monto', 'Monto pagado'].map(n => ({ repeatCell: { range: cuerpo(col(n)), cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00' }, horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } })),
    ...['Vencimiento', 'Fecha pago', 'Llegó'].map(n => ({ repeatCell: { range: cuerpo(col(n)), cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } })),
    ...['Período', 'N° VEP'].map(n => ({ repeatCell: { range: cuerpo(col(n)), cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' } } }, fields: 'userEnteredFormat.numberFormat' } })),
    { repeatCell: { range: cuerpo(col('Pagado')), cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', textFormat: { bold: true } } }, fields: 'userEnteredFormat(horizontalAlignment,textFormat)' } },
    // Colores que significan algo: rojo = sin pagar y ya venció · amarillo = sin pagar, todavía a tiempo · verde = pagado · gris = no cuenta
    regla(`=AND($${G}2="NO",$${E}2<>"",$${E}2<TODAY())`, color(.96, .80, .80), 0),
    regla(`=$${G}2="NO"`, color(1, .95, .76), 1),
    regla(`=$${G}2="SI"`, color(.85, .94, .85), 2),
    regla(`=OR($${G}2="NO VA",$${G}2="SIN DATO")`, color(.93, .93, .93), 3),
    { setBasicFilter: { filter: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: FILAS, startColumnIndex: 0, endColumnIndex: COLS.length } } } },
  ] } })
  console.log(`\n✓ Solapa ${HOJA} creada con ${nuevas.length} VEP.`)
} else {
  const H = (vImp[0] || []).map(txt), faltan = HEADERS.filter(h => !H.includes(h))
  if (faltan.length) { console.error(`A la solapa ${HOJA} le faltan columnas: ${faltan.join(', ')}. No escribo nada.`); process.exit(1) }
  const updates = []
  for (const r of [...yaEstaban, ...reemplazos]) for (const h of ['Pagado', 'Fecha pago', 'Cuenta pago', 'Monto pagado', 'Cómo se supo', 'Notas']) updates.push({ range: `${HOJA}!${colLetra(H.indexOf(h))}${r.__row}`, values: [[celda(r, h)]] })
  if (updates.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: updates } })
  // Cada dato en la columna que lleva su título, aunque alguien las haya movido. INSERT_ROWS: sin eso Google pisa lo que haya debajo.
  if (nuevas.length) await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: `${HOJA}!A:${colLetra(H.length - 1)}`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: nuevas.map(r => H.map(h => HEADERS.includes(h) ? celda(r, h) : '')) } })
  console.log(`\n✓ ${nuevas.length} VEP agregados · ${yaEstaban.length} marcados pagados · ${reemplazos.length} reemplazados.`)
}

// ---------- Verificar: lo que quedó en el sheet es lo que se quiso escribir
const despues = objetos(await leer(`${HOJA}!A:O`)).filter(r => txt(r['Impuesto']))
const mal = despues.filter(r => !['SI', 'NO', 'NO VA', 'SIN DATO'].includes(txt(r['Pagado']).toUpperCase()) || !txt(r['Titular']) || (txt(r['Vencimiento']) && !fechaDe(r['Vencimiento'])) || /^#/.test(txt(r['Mes'])))
console.log(`Verificación: ${despues.length} filas en la solapa (se esperaban ${todas.length}) · ${mal.length} con algún dato corrido${mal.length ? ': filas ' + mal.map(r => r.__row).join(', ') : ''}.`)
console.log(`Suma de lo que quedó sin pagar: ${plata(despues.filter(r => txt(r['Pagado']).toUpperCase() === 'NO').reduce((s, r) => s + num(r['Monto']), 0))}\n`)
