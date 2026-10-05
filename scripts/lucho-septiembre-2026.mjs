/**
 * Septiembre 2026 de Lucho (Jorge Luis Chavez): deja el Master igual a la planilla que él pasó para cobrar.
 * Planilla: https://docs.google.com/spreadsheets/d/1s7inaVf5-RbBNQW2c-HgsSis8cVyZtMM0nvcysXub74 (solapa SEPTIEMBRE)
 *
 * Decisión de Juan (05/10/2026): "dejalo como dice Lucho". Lucho cuenta los días de Austral DENTRO del banco de 10
 * y por día (las dos coberturas del 07/09 son una jornada): 13 jornadas = 10 a $190.000 + 3 extra a $180.000 =
 * $2.440.000. El Master tenía Austral aparte ($750.000) y sumaba $2.650.000. Esto vale SOLO para septiembre:
 * la solapa ACUERDOS no se toca (Juan habla con Lucho por Austral).
 *
 * Qué hace con --escribir:
 *   1. Montos de 6 líneas en PROYECTOS (Precio del slot de Lucho) y en PAGOS_STAFF (Monto Adeudado).
 *   2. PAGOS_STAFF: la fila del #2293 (represupuestado, hoy es el #2302) pasa a "Anulado". No se borra.
 *   3. PAGOS_STAFF: viáticos (Cabify y Uber, con comprobante) en los 4 trabajos fuera de Capital.
 *   4. HORAS_EXTRA: las 3 horas pasadas de las 9, y la tarifa de hora extra de Lucho en RRHH ($20.000).
 *   5. ACUERDOS: fila nueva, Felipe Martinez en Austral a $145.000 la cobertura (Juan, 05/10/2026).
 *   6. PAGOS_STAFF: fila nueva con el monotributo de septiembre que paga Magma por acuerdo (categoría C, $66.020,12).
 *      En su planilla Lucho pide $112.190,12; la diferencia no se carga hasta que Juan lo hable con él.
 * No toca filas pagadas, no manda mails. Guarda la foto de antes en scripts/.rollback-lucho-septiembre-2026.json.
 *
 * Uso:  node scripts/lucho-septiembre-2026.mjs            (preview)
 *       node scripts/lucho-septiembre-2026.mjs --escribir
 */
import { google } from 'googleapis'
import { readFileSync, writeFileSync } from 'fs'
process.removeAllListeners('warning')
const { SLOT_PROY, MAX_SLOTS } = await import('../lib/slots.js')

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })
const ID = env.SHEET_ID || '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')

const txt = v => String(v ?? '').trim()
const num = v => { if (typeof v === 'number') return v; const n = parseFloat(txt(v).replace(/[$,\s]/g, '')); return isNaN(n) ? 0 : n }   // el sheet guarda montos en formato US
const $ = n => '$' + Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
const esLucho = v => /jorge luis ch[aá]vez/i.test(txt(v))
const QUIEN = 'juan@somosmagma.com', MES_REF = /^09/, PERIODO = '2026-09'

// ── lo que cambia ──
const JORNADAS = [
  { nro: '2258', de: 270000, a: 190000, nota: 'Jornada 2 del banco de septiembre (Lucho cuenta Austral dentro del banco; OK de Juan 05/10/2026). Antes $270.000' },
  { nro: '2240', de: 145000, a: 95000, nota: '07/09: dos coberturas de Austral el mismo día = 1 jornada del banco, $190.000 repartida entre #2240 y #2267 (OK de Juan 05/10/2026). Antes $145.000' },
  { nro: '2267', de: 145000, a: 95000, nota: '07/09: dos coberturas de Austral el mismo día = 1 jornada del banco, $190.000 repartida entre #2240 y #2267 (OK de Juan 05/10/2026). Antes $145.000' },
  { nro: '2211', de: 190000, a: 180000, nota: 'Jornada 11 de septiembre: extra a $180.000' },
  { nro: '2250', de: 190000, a: 180000, nota: 'Jornada 12 de septiembre: extra a $180.000' },
  { nro: '2355', de: 190000, a: 180000, nota: 'Jornada 13 de septiembre: extra a $180.000' },
]
// En pesos enteros, como los guarda la app: el campo Viáticos de Pagos Staff lee el número a la argentina y un
// "61151.33" lo tomaría como 6.115.133 al salir del campo. Los centavos quedan en la nota de cada fila.
const VIATICOS = [
  { nro: '2302', monto: 61151, nota: 'Viáticos: Cabify ida y vuelta a Pilar $24.903,80 + $36.247,53 (comprobantes en la planilla de Lucho)' },
  { nro: '2210', monto: 33178, nota: 'Viáticos: Cabify $19.759,27 + Uber $13.419,00, Munro (comprobantes en la planilla de Lucho)' },
  { nro: '2211', monto: 15862, nota: 'Viáticos: Uber $15.862,00, Munro (comprobante en la planilla de Lucho)' },
  { nro: '2250', monto: 28863, nota: 'Viáticos: Cabify $13.784,86 + $15.078,61, Munro (comprobantes en la planilla de Lucho)' },
]
const ANULAR = { nro: '2293', nota: 'Anulada el 05/10/2026: el #2293 se represupuestó y hoy es el #2302, que ya tiene su fila. Es el mismo trabajo (Farmacity 11/09).' }
const HORAS = [
  { fecha: '03/09/2026', nro: '2258', horas: 2, motivo: 'Rodaje: 2 hs pasadas de las 9 (planilla de Lucho)' },
  { fecha: '11/09/2026', nro: '2302', horas: 1, motivo: 'Rodaje: 1 h pasada de las 9 (planilla de Lucho)' },
]
const TARIFA_HORA = 20000
// El servicio se llama igual que la línea que arma la app en Pagos Staff: es la llave del pago (persona + mes + N° + servicio).
const MONOTRIBUTO = { 'Freelancer': 'Jorge Luis Chavez', 'Mes Referencia': '09 - septiembre', 'Proyecto': 'Monotributo septiembre (acuerdo)', 'Servicio': '🧾 Monotributo', 'Monto Adeudado': 66020.12, 'Estado': 'Pendiente',
  'Notas': 'Lo paga Magma por acuerdo: categoría C, $66.020,12 por mes. En su planilla de septiembre Lucho pide $112.190,12; la diferencia ($46.170) no está cargada hasta que Juan lo hable con él.' }
const FELIPE = { 'Persona': 'Felipe Martinez', 'Alcance': 'Universidad Austral — como antes', 'Vale solo para': 'Austral', 'Modalidad': 'Por cobertura', 'Desde': '01/10/2026', 'Estado': 'Vigente',
  'Unidad': 'Cobertura (media jornada)', 'Precio unidad': 145000, 'Cuándo cobra': 'El 15 del mes siguiente', 'Lo que quedó abierto': 'Regla de Juan del 05/10/2026: Austral se paga lo de antes, a él igual que a Lucho. Falta hablarlo con Felipe.' }

// ── leer ──
const R = await sheets.spreadsheets.values.batchGet({ spreadsheetId: ID, ranges: ['PROYECTOS', 'Pagos_Staff', 'HORAS_EXTRA', 'RRHH', 'ACUERDOS'], valueRenderOption: 'FORMATTED_VALUE' })
const [PRO, PS, HX, RH, AC] = R.data.valueRanges.map(v => v.values || [])
const ph = PRO[0], sh = PS[0], sc = n => sh.indexOf(n)
const iNroP = ph.indexOf('N° presupuesto')
for (const n of ['Freelancer', 'Mes Referencia', 'N° Presupuesto', 'Monto Adeudado', 'Viáticos', 'Monto Pagado', 'Estado', 'Notas', 'Período']) if (sc(n) < 0) { console.log(`Falta la columna "${n}" en Pagos_Staff. No sigo.`); process.exit(1) }

const filaProy = nro => PRO.findIndex((r, i) => i > 0 && txt(r[iNroP]) === nro)
const slotLucho = fp => { const s = []; for (let n = 1; n <= MAX_SLOTS; n++) if (esLucho(PRO[fp][SLOT_PROY(n).staff])) s.push(n); return s }
const filasPago = nro => PS.map((r, i) => ({ r, i })).filter(({ r, i }) => i > 0 && esLucho(r[sc('Freelancer')]) && txt(r[sc('N° Presupuesto')]) === nro && MES_REF.test(txt(r[sc('Mes Referencia')])) && txt(r[sc('Período')]) === PERIODO)
const pagada = r => /^pagad/i.test(txt(r[sc('Estado')])) || num(r[sc('Monto Pagado')]) > 0

const updates = [], rollback = [], problemas = []
const set = (range, antes, valor) => { updates.push({ range, values: [[valor]] }); rollback.push({ range, antes }) }
const sumarNota = (fila, r, nota) => { const ya = txt(r[sc('Notas')]); if (ya.includes(nota)) return; set(`Pagos_Staff!${colLetra(sc('Notas'))}${fila}`, ya, ya ? `${ya} · ${nota}` : nota); r[sc('Notas')] = ya ? `${ya} · ${nota}` : nota }

console.log(`\nLUCHO · SEPTIEMBRE 2026 · dejar el Master como su planilla — ${ESCRIBIR ? 'ESCRIBIENDO' : 'PREVIEW (nada se toca)'}\n`)

console.log('1. Montos de las jornadas (PROYECTOS y Pagos Staff)')
for (const j of JORNADAS) {
  const fp = filaProy(j.nro), pagos = filasPago(j.nro)
  if (fp < 0) { problemas.push(`#${j.nro}: no está en PROYECTOS`); continue }
  const slots = slotLucho(fp)
  if (slots.length !== 1) { problemas.push(`#${j.nro}: Lucho figura en ${slots.length} líneas de PROYECTOS, esperaba 1`); continue }
  if (pagos.length !== 1) { problemas.push(`#${j.nro}: ${pagos.length} filas de Lucho en Pagos Staff, esperaba 1`); continue }
  const cP = SLOT_PROY(slots[0]).precio, ahoraP = num(PRO[fp][cP]), { r, i } = pagos[0], ahoraS = num(r[sc('Monto Adeudado')])
  if (pagada(r)) { problemas.push(`#${j.nro}: ya está pagada en Pagos Staff, no la toco`); continue }
  if (ahoraP === j.a && ahoraS === j.a) { console.log(`   #${j.nro}  ya está en ${$(j.a)}`); continue }
  if ((ahoraP !== j.de && ahoraP !== j.a) || (ahoraS !== j.de && ahoraS !== j.a)) { problemas.push(`#${j.nro}: esperaba ${$(j.de)} y hay ${$(ahoraP)} en PROYECTOS / ${$(ahoraS)} en Pagos Staff`); continue }
  console.log(`   #${j.nro}  ${txt(PRO[fp][ph.indexOf('Fecha Evento')]).padEnd(10)} ${txt(PRO[fp][ph.indexOf('Cliente')]).slice(0, 18).padEnd(18)} ${$(j.de).padStart(9)} → ${$(j.a).padStart(9)}   PROYECTOS!${colLetra(cP)}${fp + 1} · Pagos_Staff!${colLetra(sc('Monto Adeudado'))}${i + 1}`)
  if (ahoraP !== j.a) set(`PROYECTOS!${colLetra(cP)}${fp + 1}`, PRO[fp][cP], j.a)
  if (ahoraS !== j.a) set(`Pagos_Staff!${colLetra(sc('Monto Adeudado'))}${i + 1}`, r[sc('Monto Adeudado')], j.a)
  sumarNota(i + 1, r, j.nota)
}
console.log(`   Jornadas de septiembre: ${$(2650000)} → ${$(2440000)} (−${$(210000)})`)

console.log('\n2. Farmacity duplicado en Pagos Staff')
{ const pagos = filasPago(ANULAR.nro)
  if (!pagos.length) console.log('   No hay fila del #2293 (ya no está).')
  for (const { r, i } of pagos) {
    if (/^anulad/i.test(txt(r[sc('Estado')]))) { console.log(`   fila ${i + 1}: ya está Anulado`); continue }
    if (pagada(r)) { problemas.push(`#2293 fila ${i + 1}: figura pagada, no la toco`); continue }
    console.log(`   fila ${i + 1}  #2293 ${txt(r[sc('Proyecto')])} · ${$(num(r[sc('Monto Adeudado')]))} · ${txt(r[sc('Estado')])} → Anulado (no se borra)`)
    set(`Pagos_Staff!${colLetra(sc('Estado'))}${i + 1}`, r[sc('Estado')], 'Anulado'); sumarNota(i + 1, r, ANULAR.nota)
  } }

console.log('\n3. Viáticos (Cabify y Uber) en Pagos Staff')
let totV = 0
for (const v of VIATICOS) {
  const pagos = filasPago(v.nro)
  if (pagos.length !== 1) { problemas.push(`viáticos #${v.nro}: ${pagos.length} filas de Lucho en Pagos Staff, esperaba 1`); continue }
  const { r, i } = pagos[0], ya = num(r[sc('Viáticos')])
  totV += v.monto
  if (ya === v.monto) { console.log(`   #${v.nro}  ya tiene ${$(v.monto)}`); continue }
  if (ya) { problemas.push(`viáticos #${v.nro}: ya tiene ${$(ya)} cargado, no lo piso`); continue }
  if (pagada(r)) { problemas.push(`viáticos #${v.nro}: la fila ya está pagada, no la toco`); continue }
  console.log(`   #${v.nro}  ${txt(r[sc('Proyecto')]).slice(0, 34).padEnd(34)} ${$(v.monto).padStart(11)}   Pagos_Staff!${colLetra(sc('Viáticos'))}${i + 1}`)
  set(`Pagos_Staff!${colLetra(sc('Viáticos'))}${i + 1}`, r[sc('Viáticos')] ?? '', v.monto); sumarNota(i + 1, r, v.nota)
}
console.log(`   Total viáticos: ${$(totV)}`)

console.log('\n4. Horas extra')
const hh = HX[0] || [], filasHX = []
{ const rh = RH[0], iNom = rh.indexOf('Nombre Apellido'), iTar = rh.indexOf('Tarifa hora extra'), iMail = rh.indexOf('Mail'), fr = RH.findIndex((r, i) => i > 0 && esLucho(r[iNom]))
  if (fr < 0 || iTar < 0) problemas.push('RRHH: no encuentro a Lucho o la columna "Tarifa hora extra"')
  else { const ya = num(RH[fr][iTar])
    if (ya === TARIFA_HORA) console.log(`   RRHH: Lucho ya tiene tarifa de hora extra ${$(TARIFA_HORA)}`)
    else if (ya) problemas.push(`RRHH: Lucho tiene tarifa de hora extra ${$(ya)}, esperaba vacío`)
    else { console.log(`   RRHH!${colLetra(iTar)}${fr + 1}: tarifa de hora extra de Lucho (vacía) → ${$(TARIFA_HORA)}`); set(`RRHH!${colLetra(iTar)}${fr + 1}`, '', TARIFA_HORA) }
    let fila = HX.length + 1
    for (const h of HORAS) {
      if (HX.some((r, i) => i > 0 && esLucho(r[hh.indexOf('Persona')]) && txt(r[hh.indexOf('N° presupuesto')]) === h.nro)) { console.log(`   #${h.nro}: ya hay horas extra de Lucho cargadas`); continue }
      const fp = filaProy(h.nro)
      const row = { 'Fecha': h.fecha, 'Persona': 'Jorge Luis Chavez', 'Mail': txt(RH[fr][iMail]), 'N° presupuesto': h.nro, 'Cliente': fp > 0 ? txt(PRO[fp][ph.indexOf('Cliente')]) : '', 'Proyecto': fp > 0 ? txt(PRO[fp][ph.indexOf('Proyecto')]) : '',
        'Horas': h.horas, 'Motivo': h.motivo, 'Cargado por': QUIEN, 'Cargado el': new Date().toISOString(), 'Mes': PERIODO }
      console.log(`   HORAS_EXTRA fila ${fila}: ${h.fecha} · #${h.nro} ${row.Cliente} · ${h.horas} h × ${$(TARIFA_HORA)} = ${$(h.horas * TARIFA_HORA)}`)
      filasHX.push({ range: `HORAS_EXTRA!A${fila}:${colLetra(hh.length - 1)}${fila}`, values: [hh.map(k => row[k] ?? '')] }); fila++
    } } }

console.log('\n5. ACUERDOS: Felipe en Austral')
const ah = AC[0] || [], filaFelipe = []
if (AC.some((r, i) => i > 0 && /felipe mart/i.test(txt(r[ah.indexOf('Persona')])) && /austral/i.test(txt(r[ah.indexOf('Vale solo para')])))) console.log('   Ya existe una fila de Felipe para Austral.')
else { const faltan = Object.keys(FELIPE).filter(k => ah.indexOf(k) < 0)
  if (faltan.length) problemas.push(`ACUERDOS: faltan las columnas ${faltan.join(', ')}`)
  else { const fila = AC.length + 1
    console.log(`   ACUERDOS fila ${fila}: Felipe Martinez · vale solo para Austral · por cobertura (media jornada) · ${$(145000)} · desde 01/10/2026`)
    filaFelipe.push({ range: `ACUERDOS!A${fila}:${colLetra(ah.length - 1)}${fila}`, values: [ah.map(k => FELIPE[k] ?? '')] }) } }

console.log('\n6. Monotributo de septiembre en Pagos Staff')
const filaMono = []
if (PS.some((r, i) => i > 0 && esLucho(r[sc('Freelancer')]) && /monotributo/i.test(txt(r[sc('Servicio')])) && txt(r[sc('Período')]) === PERIODO)) console.log('   Ya está cargado.')
else { const fila = PS.reduce((u, r, i) => txt(r[sc('Freelancer')]) ? i + 1 : u, 1) + 1, ancho = sc('Período')   // hasta la columna anterior a Período, que tiene su fórmula por fila
  if ((PS[fila - 1] || []).slice(0, ancho).some(c => txt(c))) problemas.push(`Pagos_Staff fila ${fila}: esperaba que estuviera vacía`)
  else { console.log(`   Pagos_Staff fila ${fila}: ${MONOTRIBUTO.Proyecto} · ${$(MONOTRIBUTO['Monto Adeudado'])} · Pendiente`)
    filaMono.push({ range: `Pagos_Staff!A${fila}:${colLetra(ancho - 1)}${fila}`, values: [sh.slice(0, ancho).map(k => MONOTRIBUTO[k] ?? '')] }) } }

const TOTAL = 2440000 + 60000 + totV + MONOTRIBUTO['Monto Adeudado']
console.log(`\nLO QUE QUEDA A PAGARLE POR SEPTIEMBRE: jornadas ${$(2440000)} + horas extra ${$(60000)} + viáticos ${$(totV)} + monotributo ${$(MONOTRIBUTO['Monto Adeudado'])} = ${$(TOTAL)}`)
if (problemas.length) { console.log('\n⚠ NO CIERRA, no escribo nada:'); problemas.forEach(p => console.log('   · ' + p)); process.exit(1) }
if (!ESCRIBIR) { console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir para aplicar. ---\n'); process.exit(0) }
if (!updates.length && !filasHX.length && !filaFelipe.length && !filaMono.length) { console.log('\nNada para escribir: ya estaba todo.\n'); process.exit(0) }

writeFileSync('scripts/.rollback-lucho-septiembre-2026.json', JSON.stringify({ cuando: new Date().toISOString(), celdas: rollback, filasNuevas: [...filasHX, ...filaFelipe, ...filaMono].map(f => f.range) }, null, 1))
await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: ID, requestBody: { valueInputOption: 'USER_ENTERED', data: [...updates, ...filasHX, ...filaFelipe, ...filaMono] } })
const log = [
  ['PROYECTOS+Pagos_Staff', JORNADAS.map(j => j.nro).join(','), 'Lucho septiembre como su planilla: ' + JORNADAS.map(j => `#${j.nro} ${j.de}→${j.a}`).join(' · ')],
  ['Pagos_Staff', '2293', 'Fila de Lucho del #2293 (represupuestado, hoy #2302) → Anulado'],
  ['Pagos_Staff', VIATICOS.map(v => v.nro).join(','), 'Viáticos de Lucho: ' + VIATICOS.map(v => `#${v.nro} ${v.monto}`).join(' · ')],
  ['HORAS_EXTRA+RRHH', HORAS.map(h => h.nro).join(','), `Horas extra de Lucho: ${HORAS.map(h => `#${h.nro} ${h.horas} h`).join(' · ')} · tarifa ${TARIFA_HORA}`],
  ['ACUERDOS', 'Felipe Martinez', 'Fila nueva: Austral a 145000 la cobertura (Juan, 05/10/2026)'],
  ['Pagos_Staff', 'Jorge Luis Chavez', 'Fila nueva: monotributo de septiembre 66020.12 (acuerdo, categoría C)'],
]
await sheets.spreadsheets.values.append({ spreadsheetId: ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: log.map(l => [new Date().toISOString(), QUIEN, 'lucho-septiembre-2026', ...l]) } })

// ── releer y comprobar que cierra ──
const V = await sheets.spreadsheets.values.batchGet({ spreadsheetId: ID, ranges: ['PROYECTOS', 'Pagos_Staff'], valueRenderOption: 'UNFORMATTED_VALUE' })
const [PRO2, PS2] = V.data.valueRanges.map(v => v.values || [])
// (por N° y no por la columna "Mes": en algunas filas esa celda es una fecha y no el texto "09 - SEPTIEMBRE")
const NROS_SEP = ['2253', '2258', '2259', '2240', '2267', '2215', '2233', '2302', '2252', '2209', '2210', '2211', '2250', '2355']
let sumP = 0; PRO2.forEach((r, i) => { if (!i || !NROS_SEP.includes(txt(r[iNroP]))) return; for (let n = 1; n <= MAX_SLOTS; n++) { const s = SLOT_PROY(n); if (esLucho(r[s.staff]) && !/vi[aá]tic/i.test(txt(r[s.pedido]))) sumP += num(r[s.precio]) } })
let sumS = 0, sumV = 0, sumM = 0; PS2.forEach((r, i) => { if (!i || !esLucho(r[sc('Freelancer')]) || txt(r[sc('Período')]) !== PERIODO || /^anulad/i.test(txt(r[sc('Estado')]))) return
  if (/monotributo/i.test(txt(r[sc('Servicio')]))) { sumM += num(r[sc('Monto Adeudado')]); return }
  sumS += num(r[sc('Monto Adeudado')]); sumV += num(r[sc('Viáticos')]) })
console.log(`\n✓ Escrito. Releído del sheet:`)
console.log(`   PROYECTOS, líneas de Lucho de septiembre: ${$(sumP)} ${sumP === 2440000 ? '✓' : '✗ esperaba $2.440.000'}`)
console.log(`   Pagos Staff, septiembre sin anuladas:     ${$(sumS)} ${sumS === 2440000 ? '✓' : '✗ esperaba $2.440.000'}`)
console.log(`   Pagos Staff, viáticos:                    ${$(sumV)} ${Math.abs(sumV - totV) < 0.01 ? '✓' : '✗ esperaba ' + $(totV)}`)
console.log(`   Pagos Staff, monotributo:                 ${$(sumM)} ${sumM === MONOTRIBUTO['Monto Adeudado'] ? '✓' : '✗ esperaba ' + $(MONOTRIBUTO['Monto Adeudado'])}`)
console.log('   Rollback en scripts/.rollback-lucho-septiembre-2026.json\n')
