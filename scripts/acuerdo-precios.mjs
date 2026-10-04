/**
 * ¿Los montos cargados a cada persona con acuerdo coinciden con su acuerdo?
 *
 * Para cada acuerdo vigente con precio (Lucho: 10 jornadas a $190.000, de la 11 en adelante $180.000), recorre sus
 * jornadas mes por mes desde que rige, en orden de fecha, y compara lo que DEBERÍA valer cada una con lo que está
 * cargado en PROYECTOS (Precio del slot) y en PAGOS_STAFF (Monto Adeudado). Solo cuenta los trabajos donde el acuerdo
 * vale (columnas "Solo cliente" / "Excluye cliente" de ACUERDOS) y solo rodaje.
 *
 * Con --escribir corrige las que no coinciden: el Precio del slot en PROYECTOS y el Monto Adeudado de la fila de
 * PAGOS_STAFF de esa persona + mes + N° + servicio. NO toca filas ya pagadas (las lista aparte) ni manda mails.
 *
 * Uso:  node scripts/acuerdo-precios.mjs                       (preview, todos los acuerdos)
 *       node scripts/acuerdo-precios.mjs --persona chavez
 *       node scripts/acuerdo-precios.mjs --desde 10/2026        (solo de ese mes en adelante)
 *       node scripts/acuerdo-precios.mjs --nro 2240,2259        (solo esos trabajos; el resto se lista pero no se toca)
 *       node scripts/acuerdo-precios.mjs --escribir
 *
 * OJO con los arreglos "por cobertura (media jornada)": una jornada ENTERA no vale lo mismo y el script no lo sabe.
 * Mirar el preview y usar --nro para corregir solo las que corresponde.
 */
import { readFileSync, writeFileSync } from 'fs'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const i = l.indexOf('='); if (i < 0) continue; let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); process.env[l.slice(0, i).trim()] = v }
process.removeAllListeners('warning')
const { getSheets, getAllData } = await import('../lib/sheets.js')
const { acuerdosVigentes, avisoJornada } = await import('../lib/acuerdos.js')
const { jornadasDelAcuerdo } = await import('../lib/jornadas.js')
const { canonStaff, canonKey } = await import('../lib/staff.js')
const { SLOT_PROY } = await import('../lib/slots.js')

const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : '' }
const ESCRIBIR = process.argv.includes('--escribir'), SOLO = arg('--persona').toLowerCase(), DESDE = arg('--desde')
const NROS = arg('--nro') ? new Set(arg('--nro').split(',').map(x => x.trim())) : null
const txt = v => String(v ?? '').trim()
const norm = s => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const num = v => { if (typeof v === 'number') return v; const n = parseFloat(txt(v).replace(/[$,\s]/g, '')); return isNaN(n) ? 0 : n }
const $ = n => '$' + Math.round(n || 0).toLocaleString('es-AR')
const dd = n => String(n).padStart(2, '0')
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const hoy = new Date()
const desdeMes = (() => { const m = DESDE.match(/^(\d{1,2})\/(\d{4})$/); return m ? new Date(+m[2], +m[1] - 1, 1) : null })()

const data = await getAllData()
const { sheets, SHEET_ID } = await getSheets()
// PROYECTOS crudo, para saber en qué celda está el Precio de cada slot (los títulos "Precio"/"Staff" se repiten)
const pRows = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:EW' })).data.values || []
const pH = pRows[0].map(txt), iNro = pH.indexOf('N° presupuesto')
// Dónde vive el Precio de cada slot: lib/slots.js (el tope y los tres bloques viven ahí, no acá).
const colsPrecio = Array.from({ length: 40 }, (_, k) => SLOT_PROY(k + 1).precio)
const colsStaff = Array.from({ length: 40 }, (_, k) => SLOT_PROY(k + 1).staff)
const filaProy = nro => pRows.findIndex((r, i) => i > 0 && txt(r[iNro]) === txt(nro))
const sRows = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PAGOS_STAFF!A:Z' })).data.values || []
const sH = sRows[0].map(txt), sc = n => sH.indexOf(n)
const PAGADO = r => ['PAGADO', 'SÍ', 'SI', 'TRUE'].includes(txt(r[sc('Estado')]).toUpperCase()) || num(r[sc('Monto Pagado')]) > 0

const cambios = []
console.log(`\nACUERDOS vs. lo cargado — ${ESCRIBIR ? 'ESCRIBIENDO' : 'PREVIEW (nada se toca)'}${desdeMes ? ` · desde ${DESDE}` : ''}\n`)
for (const ac of acuerdosVigentes(data.acuerdos, hoy)) {
  if (!(ac.precio > 0) || (SOLO && !ac.key.includes(SOLO))) continue
  console.log(`■ ${ac.persona} · ${ac.alcance} · ${ac.minimo ? `${ac.minimo} a ${$(ac.precio)}, después ${$(ac.precioExtra || ac.precio)}` : `${$(ac.precio)} cada una`}`)
  const fin = ac.hasta && ac.hasta < new Date(hoy.getFullYear(), hoy.getMonth() + 4, 1) ? ac.hasta : new Date(hoy.getFullYear(), hoy.getMonth() + 4, 1)
  for (let d = new Date((ac.desde || hoy).getFullYear(), (ac.desde || hoy).getMonth(), 1); d <= fin; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    if (desdeMes && d < desdeMes) continue
    const js = jornadasDelAcuerdo(data.proyectos, ac, d)
    if (!js.length) continue
    const mesLabel = `${dd(d.getMonth() + 1)} - ${MESES[d.getMonth()]}`
    let cargado = 0, debe = 0
    console.log(`\n  ${MESES[d.getMonth()].toUpperCase()} ${d.getFullYear()} · ${js.length} jornadas del acuerdo`)
    js.forEach((l, k) => {
      const esperado = avisoJornada(ac, k).precio
      cargado += l.precio; debe += esperado
      // la fila de PAGOS_STAFF de esa línea (persona + mes + N° + servicio)
      const iS = sRows.findIndex((r, i) => i > 0 && canonKey(canonStaff(r[sc('Freelancer')])) === l.key && norm(r[sc('Mes Referencia')]) === norm(mesLabel) && txt(r[sc('N° Presupuesto')]) === l.nro && norm(r[sc('Servicio')]) === norm(l.pedido))
      const pago = iS > 0 ? { fila: iS + 1, monto: num(sRows[iS][sc('Monto Adeudado')]), pagado: PAGADO(sRows[iS]) } : null
      const mal = l.precio !== esperado, malPago = pago && pago.monto !== esperado
      console.log(`   ${String(k + 1).padStart(2)}  ${dd(l._f.getDate())}/${dd(l._f.getMonth() + 1)}  #${l.nro.padEnd(5)} ${l.cliente.slice(0, 22).padEnd(22)} ${txt(l.pedido).replace(/^[^\p{L}\p{N}]+/u, '').padEnd(9)} cargado ${$(l.precio).padStart(9)}  debe ${$(esperado).padStart(9)}${mal ? '  ← CORREGIR' : ''}${pago ? (pago.pagado ? '  · YA PAGADO' : malPago ? `  · Pagos Staff dice ${$(pago.monto)}` : '') : '  · sin fila en Pagos Staff'}`)
      if (mal || malPago) {
        const fp = filaProy(l.nro)
        cambios.push({ persona: ac.persona, mes: mesLabel, nro: l.nro, slot: l.slot, cliente: l.cliente, de: l.precio, a: esperado, pagado: !!pago?.pagado,
          celdaProy: mal && fp > 0 && colsPrecio[l.slot - 1] >= 0 ? `PROYECTOS!${colLetra(colsPrecio[l.slot - 1])}${fp + 1}` : '', valorProyAhora: fp > 0 ? txt(pRows[fp][colsPrecio[l.slot - 1]]) : '',
          celdaPago: malPago && !pago.pagado ? `PAGOS_STAFF!${colLetra(sc('Monto Adeudado'))}${pago.fila}` : '', valorPagoAhora: pago ? pago.monto : null })
      }
    })
    console.log(`       cargado ${$(cargado)} · según el acuerdo ${$(debe)} · diferencia ${cargado - debe >= 0 ? '+' : '−'}${$(Math.abs(cargado - debe))}`)
  }
  console.log('')
}

const tocables = cambios.filter(c => !c.pagado && (!NROS || NROS.has(c.nro))), pagadas = cambios.filter(c => c.pagado)
if (NROS) console.log(`(Solo se tocan los N° ${[...NROS].join(', ')}; el resto de las diferencias queda como está.)`)
console.log(`A corregir: ${tocables.length} ${tocables.length === 1 ? 'línea' : 'líneas'} (${tocables.reduce((s, c) => s + (c.a - c.de), 0) >= 0 ? '+' : '−'}${$(Math.abs(tocables.reduce((s, c) => s + (c.a - c.de), 0)))} en total).${pagadas.length ? ` Ya pagadas con otro monto, NO se tocan: ${pagadas.length}.` : ''}`)
tocables.forEach(c => console.log(`  #${c.nro} ${c.cliente} · ${$(c.de)} → ${$(c.a)}${c.celdaProy ? ` · ${c.celdaProy}` : ''}${c.celdaPago ? ` · ${c.celdaPago}` : ''}`))
if (!ESCRIBIR) { console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir para aplicar. ---\n'); process.exit(0) }
if (!tocables.length) { console.log('\nNada para corregir.\n'); process.exit(0) }

// Antes de tocar, la foto de lo que había (para volver atrás) y el chequeo de que la celda dice lo que creemos.
const rollback = tocables.map(c => ({ ...c }))
writeFileSync(`scripts/.rollback-acuerdo-precios-${hoy.getFullYear()}-${dd(hoy.getMonth() + 1)}-${dd(hoy.getDate())}.json`, JSON.stringify(rollback, null, 1))
const updates = []
for (const c of tocables) {
  if (c.celdaProy) { const fp = filaProy(c.nro), quien = canonKey(canonStaff(txt(pRows[fp][colsStaff[c.slot - 1]])))
    if (quien !== canonKey(canonStaff(c.persona))) { console.log(`  ⚠ #${c.nro}: en el slot ${c.slot} no está ${c.persona} (dice "${pRows[fp][colsStaff[c.slot - 1]]}"). No la toco.`); continue }
    if (num(c.valorProyAhora) !== c.de) { console.log(`  ⚠ #${c.nro}: la celda ${c.celdaProy} dice ${c.valorProyAhora}, esperaba ${$(c.de)}. No la toco.`); continue } updates.push({ range: c.celdaProy, values: [[c.a]] }) }
  if (c.celdaPago) updates.push({ range: c.celdaPago, values: [[c.a]] })
}
await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: updates } })
try { await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), 'script', 'acuerdo-precios', 'PROYECTOS+PAGOS_STAFF', tocables.map(c => c.nro).join(','), tocables.map(c => `#${c.nro} ${c.de}→${c.a}`).join(' · ')]] } }) } catch (e) { /* el log no frena */ }
console.log(`\n✓ ${updates.length} celdas corregidas. Rollback en scripts/.rollback-acuerdo-precios-*.json\n`)
