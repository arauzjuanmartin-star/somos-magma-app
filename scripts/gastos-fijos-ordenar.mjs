/**
 * Ordena GASTOS_FIJOS para que Caja deje de trabajar con supuestos (paso 4 de administración, 01/10/2026).
 *
 * Caja arma "lo que sale este mes" con esta solapa. Estaba contando cosas que ya no corren y no sabía
 * cuáles se debitan solas y cuáles hay que pagar a mano:
 *   - gastos que terminaron y seguían como mensuales (monotributo de Juan, plan de AFIP de Magma, Mastercard Galicia)
 *   - el IVA de junio cargado como "todos los meses" (son pagos de una vez)
 *   - 25 gastos sin "Medio de pago" (Caja los tomaba todos como pago a mano)
 *   - 70 filas sin Rubro (la lista única es la solapa RUBROS)
 * Y le faltaban dos cosas que sí salen en octubre: el IVA de julio de Magma y el plan de AFIP de Sofi.
 *
 * Cada cambio va con la fila Y el nombre del gasto: si la fila ya no tiene ese nombre, frena sin escribir.
 * Es idempotente: lo que ya está como tiene que estar no se vuelve a escribir, y las filas nuevas no se duplican.
 *
 * Uso:  node scripts/gastos-fijos-ordenar.mjs            (preview)
 *       node scripts/gastos-fijos-ordenar.mjs --escribir
 */
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
    const i=l.indexOf('='); let v=l.slice(i+1).trim()
    if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1)
    return [l.slice(0,i).trim(),v]
  })
)
const auth = new google.auth.GoogleAuth({
  credentials:{client_email:env.GOOGLE_CLIENT_EMAIL,private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')},
  scopes:['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({version:'v4',auth})
const ID='1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const HOJA='GASTOS_FIJOS'
const ESCRIBIR = process.argv.includes('--escribir')
const colLetra = n => { let s=''; n++; while(n>0){ const m=(n-1)%26; s=String.fromCharCode(65+m)+s; n=(n-m-1)/26 } return s }
const f = x => '$'+Math.round(x).toLocaleString('es-AR')
const norm = s => String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim()

// ---------- Los rubros, con los nombres EXACTOS de la solapa RUBROS
const SUELDOS='Sueldos', OFICINA='Oficina', IMP='Impuestos', SEG='Seguros', ADS='Marketing / Ads'
const BANCO=['Costos bancarios / financieros','Comisiones e impuestos bancarios'], FIN=['Costos bancarios / financieros','']
const SW='Software y suscripciones', WEB=[SW,'Web / productividad / otros'], IA=[SW,'IA']
const RUBRO = {
  2:SUELDOS, 3:SUELDOS, 4:SUELDOS, 5:SUELDOS, 6:SUELDOS, 7:SUELDOS,
  8:OFICINA, 9:OFICINA, 10:OFICINA, 11:OFICINA, 12:OFICINA, 25:OFICINA, 45:OFICINA,
  13:ADS, 22:ADS, 14:[SW,'Edición / diseño'], 47:[SW,'Stock / música / assets'],
  15:IMP, 16:IMP, 17:IMP, 18:IMP, 19:IMP, 20:IMP, 21:IMP, 23:IMP, 24:IMP, 26:IMP, 27:IMP, 28:IMP, 31:IMP, 32:IMP, 33:IMP, 36:IMP,
  41:IMP, 42:IMP, 43:IMP, 44:IMP, 66:IMP, 67:IMP, 68:IMP, 69:IMP, 70:IMP,
  29:FIN, 30:FIN, 34:BANCO, 37:BANCO, 38:BANCO, 39:BANCO, 59:BANCO, 60:BANCO, 61:BANCO, 62:BANCO, 63:BANCO, 64:BANCO, 65:BANCO,
  40:['Compras varias','Comida / restaurantes'],
  48:WEB, 53:WEB, 54:WEB, 55:WEB, 56:WEB, 57:WEB, 58:WEB, 51:IA, 52:IA, 49:SEG, 50:SEG,
}

// ---------- Los cambios de fondo: fila, cómo empieza el nombre (para no pisar otra fila), qué cambia y por qué
const sumarObs = txt => actual => { const a=String(actual||'').trim(); return a.includes(txt) ? a : (a ? `${a} · ${txt}` : txt) }
const CAMBIOS = [
  { fila:16, nombre:'Monotributo Juan', set:{ 'Activo':'NO' }, por:'Juan se dio de baja del monotributo: último pago julio 2026 (lo dice la propia fila)' },
  { fila:19, nombre:'IIBB Juan', set:{ 'Activo':'NO', 'Observacion':sumarObs('Baja junto con el monotributo de Juan: desde agosto 2026 no corre') }, por:'se dio de baja junto con el monotributo' },
  { fila:23, nombre:'AFIP Plan de pago RG5321 ultima', set:{ 'Activo':'NO', 'Observacion':sumarObs('Plan de Magma TERMINADO: última cuota pagada el 30/9/2026') }, por:'era la última cuota y se pagó el 30/9' },
  { fila:24, nombre:'AFIP Plan de pago RG5321 (b)', set:{ 'Activo':'NO', 'Observacion':sumarObs('Diego Musco, 14/08/2026: Magma tenía un solo plan activo, con cuotas en agosto y septiembre. Desde octubre no corre') }, por:'Diego (mail del 14/08): al plan de Magma le quedaban agosto y septiembre' },
  { fila:39, nombre:'Costo Mastercard Galicia', set:{ 'Activo':'NO', 'Observacion':sumarObs('Tarjeta dada de baja (Juan, 01/10/2026)') }, por:'la Mastercard Galicia ya no se usa' },
  { fila:66, nombre:'MAGMA IVA 06-2026', set:{ 'Frecuencia':'único', 'Tipo':'impuesto' }, por:'es el IVA de UN mes (pagado el 21/9), no un gasto de todos los meses' },
  { fila:67, nombre:'SOFI IVA 06-2026', set:{ 'Frecuencia':'único', 'Tipo':'impuesto' }, por:'ídem' },
  { fila:35, nombre:'Consultoria', set:{ 'Concepto':'Consultoría (Mariana Tarido)', 'Categoria':'Operativos' }, por:'estaba dentro de Impuestos' },
  { fila:22, nombre:'Ads (Gloria)', set:{ 'Categoria':'Operativos' }, por:'estaba dentro de Sueldos' },
  { fila:63, nombre:'Costos bancarios Galicia — comisión de cuenta', set:{ 'Concepto':'Costos bancarios Santander — comisión de cuenta' }, por:'la cuenta es Santander Sofi, el nombre decía Galicia' },
  { fila:41, nombre:'Empleadores SICOSS', set:{ 'Dia pago':10 }, por:'el VEP del 931 vence el 10 (mails de Diego)' },
  { fila:37, nombre:'Costos bancarios BBVA', set:{ 'Medio de pago':'Débito automático', 'Mes carga':'' }, por:'lo cobra el banco solo' },
  { fila:38, nombre:'Impuesto ley 25.413', set:{ 'Medio de pago':'Débito automático', 'Mes carga':'' }, por:'lo cobra el banco solo' },
  { fila:39, nombre:'Costo Mastercard Galicia', set:{ 'Mes carga':'' }, por:'tenía una fecha suelta en "Mes carga"' },
  { fila:26, nombre:'cargas sociales junio', set:{ 'Dia pago':13 }, por:'el día estaba cargado como fecha entera' },
]

// ---------- Filas que faltan (lo que sí sale en octubre y Caja no veía)
const NUEVAS = [
  { 'Categoria':'Impuestos', 'Concepto':'IVA 07-2026 Magma', 'Monto':2584486, 'Moneda':'ARS', 'Frecuencia':'único', 'Dia pago':21, 'Persona/Cuenta':'BBVA Somos Magma', 'Activo':'SI',
    'Observacion':'Monto de la DDJJ de Diego Musco. El IVA se paga a 90 días: el VEP con la fecha exacta llega a principios de octubre. Agendado el 21/10 en el calendario Somos Magma.',
    'Mes carga':'10', 'Año carga':2026, 'Tipo':'impuesto', 'Pagado':'NO', 'Medio de pago':'Transferencia', 'Rubro':'Impuestos' },
  { 'Categoria':'Impuestos', 'Concepto':'AFIP plan de pago Sofi (termina en diciembre 2026)', 'Monto':595813.26, 'Moneda':'ARS', 'Frecuencia':'mensual', 'Dia pago':16, 'Persona/Cuenta':'', 'Activo':'SI',
    'Observacion':'Diego Musco, 14/08/2026: un plan vigente de Sofi, cuotas de $595.813,26 hasta diciembre 2026. Dar de baja en enero 2027. Día 16 = primer intento de débito de AFIP (reintenta el 26). FALTA: de qué cuenta se debita.',
    'Mes carga':'10', 'Año carga':2026, 'Tipo':'impuesto', 'Pagado':'NO', 'Medio de pago':'Débito automático', 'Rubro':'Impuestos' },
]

// ---------- Leer
const [fmt, raw] = await Promise.all(['FORMATTED_VALUE','UNFORMATTED_VALUE'].map(v => sheets.spreadsheets.values.get({ spreadsheetId: ID, range: `${HOJA}!A:W`, valueRenderOption: v })))
const rows = fmt.data.values || [], rawRows = raw.data.values || []
const H = rows[0].map(h => String(h).trim()), col = n => H.indexOf(n)
for (const n of ['Concepto','Activo','Frecuencia','Medio de pago','Rubro','Subrubro','Dia pago','Mes carga','Cuenta pago','Persona/Cuenta','Observacion','Categoria','Tipo']) if (col(n) < 0) { console.error(`Falta la columna "${n}" en ${HOJA}. Freno.`); process.exit(1) }
const celda = (fila, n) => String(rows[fila-1]?.[col(n)] ?? '').trim()
const si = v => /^(s[ií]|true)$/i.test(String(v).trim())

const escrituras = []   // { range, values, raw }
const poner = (fila, n, valor) => {
  const actual = celda(fila, n), nuevo = String(valor ?? '')
  // "Dia pago" puede estar con formato de fecha: el valor de adentro es lo que cuenta
  const actualCrudo = String(rawRows[fila-1]?.[col(n)] ?? '').trim()
  if (actual === nuevo || (n === 'Dia pago' && actualCrudo === nuevo && actual === nuevo)) return false
  escrituras.push({ range: `${HOJA}!${colLetra(col(n))}${fila}`, values: [[valor]] })
  return true
}

console.log(`\n${ESCRIBIR ? '✍  ESCRIBIENDO' : '👀 PREVIEW (no escribe nada)'} · ${HOJA} · ${rows.length-1} filas\n`)

// 1) Cambios de fondo
console.log('── 1. Lo que cambia de fondo')
for (const c of CAMBIOS) {
  const nombre = celda(c.fila, 'Concepto')
  const yaRenombrada = c.set['Concepto'] && norm(nombre) === norm(c.set['Concepto'])
  if (!norm(nombre).startsWith(norm(c.nombre)) && !yaRenombrada) { console.error(`\n✋ La fila ${c.fila} ya no es "${c.nombre}" (ahora dice "${nombre}"). Freno sin escribir nada.`); process.exit(1) }
  const hechos = []
  for (const [n, v] of Object.entries(c.set)) {
    const valor = typeof v === 'function' ? v(celda(c.fila, n)) : v
    const antes = celda(c.fila, n)
    if (poner(c.fila, n, valor)) hechos.push(n === 'Observacion' ? 'nota' : `${n}: "${antes}" → "${valor}"`)
  }
  console.log(hechos.length ? `  fila ${String(c.fila).padStart(2)} · ${nombre.slice(0,44).padEnd(44)} ${f(parseFloat(rawRows[c.fila-1][col('Monto')])||0).padStart(11)} · ${hechos.join(' · ')}\n           ↳ ${c.por}` : `  fila ${String(c.fila).padStart(2)} · ${nombre.slice(0,44)} · ya estaba`)
}

// 2) Medio de pago en los que no lo tienen (los que quedan activos o son pagos viejos)
console.log('\n── 2. "Medio de pago" donde faltaba')
const bajas = new Set(CAMBIOS.filter(c => c.set['Activo'] === 'NO').map(c => c.fila))
const medios = {}
for (let i = 1; i < rows.length; i++) {
  const fila = i + 1, concepto = celda(fila, 'Concepto')
  if (!concepto || celda(fila, 'Medio de pago') || CAMBIOS.some(c => c.fila === fila && c.set['Medio de pago'])) continue
  if (!celda(fila, 'Monto')) continue   // la fila separadora "AGREGAR GASTOS TARJETA"
  const cuenta = celda(fila, 'Cuenta pago')
  const medio = /^sueldo\s+(juan|sof)/i.test(concepto) ? 'Cuenta de socios' : /efectivo/i.test(cuenta) ? 'Efectivo' : 'Transferencia'
  if (poner(fila, 'Medio de pago', medio)) (medios[medio] = medios[medio] || []).push(`${concepto}${bajas.has(fila) ? ' (de baja)' : ''}`)
}
for (const [m, l] of Object.entries(medios)) console.log(`  ${m} (${l.length}): ${l.join(' · ')}`)
if (!Object.keys(medios).length) console.log('  ya estaban todos')

// 3) Rubro y subrubro en las filas viejas
console.log('\n── 3. Rubro de la lista única (solapa RUBROS)')
const rubrosOk = new Set(((await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: 'RUBROS!A3:B' })).data.values || []).map(r => `${String(r[0]||'').trim()}|${String(r[1]||'').trim().replace(/^—$/,'')}`))
const porRubro = {}; let sinRubro = []
for (let i = 1; i < rows.length; i++) {
  const fila = i + 1, concepto = celda(fila, 'Concepto'); if (!concepto || !celda(fila, 'Monto')) continue
  const r = RUBRO[fila]
  if (!r) { if (!celda(fila, 'Rubro')) sinRubro.push(`fila ${fila} ${concepto}`); continue }
  const [rubro, sub] = Array.isArray(r) ? r : [r, '']
  if (!rubrosOk.has(`${rubro}|${sub}`) && !(sub === '' && [...rubrosOk].some(k => k.startsWith(rubro + '|')))) { console.error(`✋ "${rubro} · ${sub}" no está en la solapa RUBROS. Freno.`); process.exit(1) }
  const a = poner(fila, 'Rubro', rubro), b = sub ? poner(fila, 'Subrubro', sub) : false
  if (a || b) (porRubro[rubro] = porRubro[rubro] || []).push(concepto.slice(0, 28))
}
for (const [r, l] of Object.entries(porRubro)) console.log(`  ${r} (${l.length}): ${l.slice(0, 7).join(' · ')}${l.length > 7 ? ` … y ${l.length - 7} más` : ''}`)
if (!Object.keys(porRubro).length) console.log('  ya estaban todos')
if (sinRubro.length) console.log(`  Quedan sin rubro (no hay uno en la lista que les calce): ${sinRubro.join(' · ')}`)

// 4) Filas nuevas
console.log('\n── 4. Lo que falta cargar')
const conceptos = new Set(rows.slice(1).map(r => norm(r[col('Concepto')])))
const aAgregar = NUEVAS.filter(n => !conceptos.has(norm(n['Concepto'])))
for (const n of NUEVAS) console.log(`  ${conceptos.has(norm(n['Concepto'])) ? 'ya está' : 'NUEVA  '} · ${n['Concepto'].padEnd(52)} ${f(n['Monto']).padStart(11)} · ${n['Frecuencia']} · día ${n['Dia pago']} · ${n['Medio de pago']} · ${n['Persona/Cuenta'] || 'CUENTA A CONFIRMAR'}`)

// 5) Qué cuenta Caja en octubre, antes y después (solo la parte de gastos fijos)
const MES = 10, ANIO = 2026
const cuentaOctubre = (get, extra = []) => {
  let total = 0, n = 0
  for (let i = 1; i < rows.length; i++) {
    const fila = i + 1, g = k => get(fila, k)
    if (!g('Concepto') || !(si(g('Activo')) || g('Activo') === '')) continue
    if (/^tarjeta$/i.test(g('Medio de pago'))) continue
    if (/[uú]nico/i.test(g('Frecuencia')) && !(parseInt(g('Mes carga')) === MES && g('Año carga').includes(String(ANIO)))) continue
    total += parseFloat(rawRows[i][col('Monto')]) || 0; n++
  }
  extra.forEach(x => { total += x['Monto']; n++ })
  return { total, n }
}
const despuesDe = (fila, k) => { const e = [...escrituras].reverse().find(x => x.range === `${HOJA}!${colLetra(col(k))}${fila}`); return e ? String(e.values[0][0] ?? '').trim() : celda(fila, k) }
const antes = cuentaOctubre(celda), despues = cuentaOctubre(despuesDe, aAgregar)
console.log(`\n── Gastos fijos que Caja cuenta en octubre 2026: ${f(antes.total)} (${antes.n}) → ${f(despues.total)} (${despues.n}) · diferencia ${f(despues.total - antes.total)}`)
console.log(`   ${escrituras.length} celdas a escribir · ${aAgregar.length} filas nuevas`)

if (!ESCRIBIR) { console.log('\nNo se escribió nada. Para aplicar: node scripts/gastos-fijos-ordenar.mjs --escribir\n'); process.exit(0) }
if (!escrituras.length && !aAgregar.length) { console.log('\nNada para escribir: ya estaba todo.\n'); process.exit(0) }

// ---------- Escribir. RAW: los textos quedan como texto ("Mes carga" como número con formato de fecha se leía 1/1900).
if (escrituras.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: ID, requestBody: { valueInputOption: 'RAW', data: escrituras } })
if (aAgregar.length) await sheets.spreadsheets.values.append({ spreadsheetId: ID, range: `${HOJA}!A:W`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: aAgregar.map(n => H.map(h => n[h] ?? '')) } })

// "Dia pago" de los pagos de julio quedó con formato de fecha (se veía "20/01/1900"): se muestra como número.
const meta = await sheets.spreadsheets.get({ spreadsheetId: ID, ranges: [HOJA], fields: 'sheets(properties(title,sheetId))' })
const sheetId = meta.data.sheets.find(s => s.properties.title === HOJA).properties.sheetId
await sheets.spreadsheets.batchUpdate({ spreadsheetId: ID, requestBody: { requests: [{ repeatCell: { range: { sheetId, startRowIndex: 1, startColumnIndex: col('Dia pago'), endColumnIndex: col('Dia pago') + 1 }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '0' } } }, fields: 'userEnteredFormat.numberFormat' } }] } })

try { await sheets.spreadsheets.values.append({ spreadsheetId: ID, range:'LOG!A:F', valueInputOption:'USER_ENTERED',
  requestBody: { values: [[new Date().toISOString(), 'script', 'gastos-ordenar', HOJA, 'paso 4 administración', `${escrituras.length} celdas · ${aAgregar.length} filas nuevas (${aAgregar.map(n => n['Concepto']).join(', ')}) · bajas: filas ${[...bajas].join(', ')}`.slice(0, 900)]] } }) } catch (e) {}

// ---------- Verificar: releer y comprobar que quedó como se pidió
const ver = (await sheets.spreadsheets.values.get({ spreadsheetId: ID, range: `${HOJA}!A:W` })).data.values || []
let mal = 0
for (const e of escrituras) { const m = e.range.match(/!([A-Z]+)(\d+)$/); const c = [...m[1]].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1
  const quedo = String(ver[+m[2] - 1]?.[c] ?? '').trim(), pedido = String(e.values[0][0] ?? '').trim()
  if (quedo !== pedido) { mal++; console.log(`  ⚠ ${e.range}: pedí "${pedido}" y quedó "${quedo}"`) } }
const nuevasOk = aAgregar.filter(n => ver.some(r => norm(r[col('Concepto')]) === norm(n['Concepto']))).length
console.log(`\n✅ Escrito. ${escrituras.length - mal} de ${escrituras.length} celdas verificadas · ${nuevasOk} de ${aAgregar.length} filas nuevas en la solapa (${ver.length - 1} filas en total)\n`)
