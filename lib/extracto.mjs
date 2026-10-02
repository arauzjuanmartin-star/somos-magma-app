/**
 * EXTRACTO DEL BANCO: leer el archivo que baja el banco y cruzar cada renglón con lo que hay en la app.
 *
 * La idea (paso 6 de administración): que nadie tilde pagos ni cobros a mano. Se sube el extracto y
 * cada movimiento cae en uno de cuatro estados:
 *   'ok'       ya está en la app tal cual (la factura figura cobrada, el gasto figura pagado)
 *   'marcar'   coincide con algo previsto que en la app sigue sin pagar o sin cobrar: se marca al confirmar
 *   'banco'    lo cobra el banco solo (impuesto al cheque, comisiones, retenciones): no hay nada que marcar
 *   'pase'     plata que la misma persona pasó de una cuenta suya a otra: no hay nada que marcar
 *   'revisar'  no se reconoce solo, o hay más de un candidato: lo tiene que mirar una persona
 *
 * Cálculo puro, igual que lib/caja.mjs y lib/hoy.mjs: no lee ni escribe el sheet.
 *
 * Regla de cruce: mismo monto + ventana de fecha. Si hay dos candidatos igual de buenos NO se une solo.
 */
import { num, fechaDe, grupoAgencia } from './caja.mjs'
import { estadoVep, nombreVep } from './impuestos.mjs'

const txt = v => String(v ?? '').trim()
const si = v => v === true || /^(s[ií]|true)$/i.test(txt(v))
const norm = s => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const pegado = s => norm(s).replace(/[^a-z0-9]/g, '')
const soloDig = s => txt(s).replace(/\D/g, '')
const DIA = 864e5
const dias = (a, b) => Math.abs(Math.round((a - b) / DIA))
const dmy = d => `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
// "1.234.567,89" (como lo escribe el banco) a número
const numAR = s => { const t = txt(s).replace(/[^\d.,-]/g, ''); if (!t) return 0; const v = parseFloat(t.replace(/\./g, '').replace(',', '.')); return isNaN(v) ? 0 : v }

// ---------------------------------------------------------------- 1. Leer el archivo

/**
 * Lee el texto de un extracto (CSV separado por punto y coma). Reconoce el de BBVA Net Cash (sus dos hojas:
 * "Movimientos Históricos" y "Movimientos del Día") y el de Santander ("Últimos movimientos" de la cuenta única).
 * @returns {{ banco, cuentaNro, empresa, saldo, movs: [{ fecha: Date, concepto, codigo, detalle, monto }] }}
 *          monto positivo = entró plata, negativo = salió
 */
export function leerExtracto(texto) {
  if (/^\uFEFF?\s*Banco Galicia/i.test(String(texto || '')) || /Fecha;Movimiento;D[^;]{1,3}bito;Cr[^;]{1,3}dito;Saldo Parcial/i.test(String(texto || ''))) return leerGalicia(String(texto))
  const lineas = String(texto || '').replace(/^﻿/, '').split(/\r?\n/).map(l => l.split(';').map(c => c.trim()))
  if (lineas.some(c => c.some(x => norm(x) === 'sucursal origen'))) return leerSantander(lineas)
  const iCab = lineas.findIndex(c => norm(c[0]) === 'fecha' && c.some(x => /^cr[eé]dito$/i.test(x)) && c.some(x => /^d[eé]bito$/i.test(x)))
  if (iCab < 0) throw new Error('No reconozco el archivo. Tiene que ser el de movimientos de la cuenta de BBVA, de Santander o de Galicia, guardado como CSV.')
  const dato = clave => { const l = lineas.slice(0, iCab).find(c => norm(c[0]).startsWith(clave)); return l ? txt(l[1]) : '' }
  const cab = lineas[iCab].map(norm), col = n => cab.indexOf(n)
  const iF = col('fecha'), iCon = col('concepto'), iCod = col('codigo'), iCr = col('credito'), iDb = col('debito'), iDet = col('detalle')
  const movs = []
  for (const c of lineas.slice(iCab + 1)) {
    const m = txt(c[iF]).match(/^(\d{2})-(\d{2})-(\d{4})$/); if (!m) continue
    const cr = numAR(c[iCr]), db = numAR(c[iDb])
    if (!cr && !db) continue
    movs.push({
      fecha: new Date(+m[3], +m[2] - 1, +m[1]), concepto: txt(c[iCon]).replace(/\s+/g, ' '), codigo: txt(c[iCod]),
      detalle: iDet >= 0 ? txt(c[iDet]).replace(/\s+/g, ' ') : '', monto: cr ? Math.abs(cr) : -Math.abs(db),
    })
  }
  return { banco: 'BBVA', cuentaNro: dato('cuenta'), empresa: dato('empresa'), saldo: numAR(dato('saldo')), movs }
}

// Santander ("Últimos movimientos" de la cuenta única): las columnas arrancan corridas un lugar, el monto viene con
// punto decimal y en una de dos columnas (Caja de Ahorro o Cuenta Corriente), y la descripción trae el concepto y,
// después de un tabulador, el detalle ("Transferencia recibida <tab> De tripin srl / yungas - hon / 33710936299").
// La columna Saldo es el saldo después de cada movimiento: el del primer renglón es el saldo de la cuenta.
function leerSantander(lineas) {
  const iCab = lineas.findIndex(c => c.some(x => norm(x) === 'sucursal origen') && c.some(x => norm(x) === 'saldo'))
  if (iCab < 0) throw new Error('El archivo parece de Santander pero no encuentro la tabla de movimientos.')
  const cab = lineas[iCab].map(norm), col = n => cab.indexOf(n)
  const iF = col('fecha'), iDesc = col('descripcion'), iRef = col('referencia'), iCA = col('caja de ahorro'), iCC = col('cuenta corriente'), iS = col('saldo')
  const dato = clave => { for (const c of lineas.slice(0, iCab)) { const k = c.findIndex(x => norm(x) === clave); if (k >= 0) return txt(c[k + 1]) } return '' }
  const numUS = v => { const n = parseFloat(txt(v).replace(/[^\d.-]/g, '')); return isNaN(n) ? 0 : n }
  const aFecha = v => { const m = txt(v).match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null }
  const movs = []; let saldo = null
  for (const c of lineas.slice(iCab + 1)) {
    const fecha = aFecha(c[iF]); if (!fecha) continue
    const monto = numUS(c[iCA]) || numUS(c[iCC]); if (!monto) continue
    if (saldo === null) saldo = numUS(c[iS])
    const [concepto, ...resto] = txt(c[iDesc]).split('\t')
    movs.push({ fecha, concepto: txt(concepto).replace(/\s+/g, ' '), codigo: txt(c[iRef]), detalle: txt(resto.join(' ')).replace(/\s+/g, ' '), monto })
  }
  // El dueño de la cuenta: su CUIT viene en las retenciones ("Resp:27419156650"). Lo que va o viene de ese CUIT es un
  // movimiento entre cuentas de la misma persona.
  const titular = (movs.map(m => (m.detalle.match(/Resp:(\d{11})/) || [])[1]).find(Boolean)) || ''
  movs.forEach(m => { if (/propia/i.test(m.concepto) || (titular && m.detalle.includes(titular) && !/sircreb|arca|afip/i.test(m.concepto + m.detalle))) m.propia = true })
  const periodo = dato('fecha').match(/(\d{2})\/(\d{2})\/(\d{4})\s*$/)
  return { banco: 'Santander', cuentaNro: (dato('cuenta').match(/\d[\d\-\/]+/) || [''])[0], empresa: '', saldo: saldo || 0, hastaArchivo: periodo ? new Date(+periodo[3], +periodo[2] - 1, +periodo[1]) : null, movs }
}

// Galicia ("Extracto" de la caja de ahorro): cada movimiento trae en UNA celda entre comillas varios renglones: el
// concepto arriba y debajo quién, su CUIT y el banco. Por eso el archivo se parte respetando las comillas, no por línea.
// El débito viene negativo, el crédito positivo, y "Saldo Parcial" es el saldo después de cada movimiento (el primero
// es el más nuevo). Las columnas van por posición: Fecha · Movimiento · Débito · Crédito · Saldo Parcial · Comentarios.
function leerGalicia(texto) {
  const filas = []; let celda = '', fila = [], comillas = false
  const t = texto.replace(/^\uFEFF/, '')
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (comillas) { if (ch === '"') { if (t[i + 1] === '"') { celda += '"'; i++ } else comillas = false } else celda += ch }
    else if (ch === '"') comillas = true
    else if (ch === ';') { fila.push(celda); celda = '' }
    else if (ch === '\n') { fila.push(celda); filas.push(fila); fila = []; celda = '' }
    else if (ch !== '\r') celda += ch
  }
  if (celda || fila.length) { fila.push(celda); filas.push(fila) }
  const cab = filas.slice(0, 12).map(f => txt(f[0]))
  const dato = re => { const l = cab.find(x => re.test(x)); return l ? txt(l.replace(re, '')) : '' }
  const hoyArch = dato(/^Fecha Actual:\s*/i).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  const movs = []; let saldo = null
  for (const f of filas) {
    const d = txt(f[0]).match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (!d) continue
    const monto = numAR(f[3]) + numAR(f[2]); if (!monto) continue   // el débito ya viene con el signo menos
    if (saldo === null) saldo = numAR(f[4])
    const partes = String(f[1] || '').split(/\r?\n/).map(txt).filter(Boolean)
    const m = { fecha: new Date(+d[3], +d[2] - 1, +d[1]), concepto: (partes[0] || '').replace(/\s+/g, ' '), codigo: '', detalle: partes.slice(1).join(' / ').replace(/\s+/g, ' '), monto }
    // Plata que la titular mueve entre sus cuentas, a su fondo o a dólares: no es un cobro ni un gasto
    if (/PROPIA|FIMA|COMPRA VENTA DE DOLARES/i.test(m.concepto)) m.propia = true
    movs.push(m)
  }
  if (!movs.length) throw new Error('El archivo parece de Galicia pero no encuentro movimientos.')
  return { banco: 'Galicia', cuentaNro: dato(/^Nro\. de Cuenta:\s*/i).replace(/^\.+/, ''), empresa: '', saldo: saldo || 0, hastaArchivo: hoyArch ? new Date(+hoyArch[3], +hoyArch[2] - 1, +hoyArch[1]) : null, movs }
}

/** Junta varios archivos del mismo banco (el histórico y el del día) y saca los renglones repetidos. */
export function unirExtractos(extractos) {
  const vistos = new Set(), movs = []
  const base = extractos[0] || { banco: '', cuentaNro: '', empresa: '', saldo: 0 }
  for (const e of extractos) {
    if (base.cuentaNro && e.cuentaNro && e.cuentaNro !== base.cuentaNro) throw new Error(`Los archivos son de cuentas distintas (${base.cuentaNro} y ${e.cuentaNro}). Subí los de una sola cuenta por vez.`)
    conClave(e.movs).forEach(m => { if (!vistos.has(m.clave)) { vistos.add(m.clave); movs.push(m) } })
  }
  movs.sort((a, b) => b.fecha - a.fecha)
  // Las claves cortas (fecha + monto + orden) se numeran sobre la lista ya unida, no archivo por archivo
  const n = {}
  movs.forEach(m => { const k = m.corta.split('|').slice(0, 2).join('|'); n[k] = (n[k] || 0) + 1; m.corta = `${k}|${n[k]}` })
  return { ...base, movs }
}

// La clave que identifica un renglón del banco: sirve para no cargar dos veces el mismo si se sube un extracto que se pisa con otro.
// Dos renglones idénticos el mismo día (dos transferencias de $800.000) se distinguen por el orden en que vienen.
export function conClave(movs) {
  const cuenta = {}
  const cortas = {}
  return movs.map(m => {
    const dia = `${m.fecha.getFullYear()}-${m.fecha.getMonth() + 1}-${m.fecha.getDate()}`, base = `${dia}|${m.concepto}|${m.monto.toFixed(2)}`, sinNombre = `${dia}|${m.monto.toFixed(2)}`
    cuenta[base] = (cuenta[base] || 0) + 1; cortas[sinNombre] = (cortas[sinNombre] || 0) + 1
    // "corta" no lleva el concepto: BBVA escribe distinto el mismo movimiento en "Movimientos del Día" ("TRANSF CREDITO
    // BANELCO") y, al día siguiente, en el histórico ("TRANSF.BANEL 30714252239"). Con la corta no se carga dos veces.
    return { ...m, clave: `${base}|${cuenta[base]}`, corta: `${sinNombre}|${cortas[sinNombre]}` }
  })
}

/**
 * Lo que ya está cargado de una cuenta, para no repetirlo: las claves guardadas y las "cortas" (fecha + monto + orden),
 * rehechas desde las filas de MOVIMIENTOS_BANCO en el orden en que están.
 */
export function yaCargadasDe(filasGuardadas, cuenta) {
  const claves = new Set(), cortas = new Set(), n = {}
  for (const r of filasGuardadas || []) {
    if (txt(r['Cuenta']) !== cuenta) continue
    claves.add(txt(r['Clave']))
    const d = fechaDe(r['Fecha']), monto = num(r['Entró']) - num(r['Salió'])
    if (!d || !monto) continue
    const k = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}|${monto.toFixed(2)}`
    n[k] = (n[k] || 0) + 1; cortas.add(`${k}|${n[k]}`)
  }
  return { claves, cortas }
}

// ---------------------------------------------------------------- 2. Qué es cada renglón, según su concepto

// Lo que el banco cobra solo. "rubro" y "subrubro" son los de la solapa RUBROS.
const DEL_BANCO = [
  [/^(IMPUESTO LEY|LEY NRO 25\.4)/i, 'Impuesto al cheque', 'Impuesto ley 25.413 sobre débitos y créditos'],
  [/^REG REC SIRC/i, 'SIRCREB', 'Retención de Ingresos Brutos sobre lo que entra (se recupera en la declaración)'],
  [/^(PERCEPCION|PERC\.CABA)/i, 'Percepciones', 'Percepción de IVA o Ingresos Brutos (se recupera en la declaración)'],
  [/^(COMISION|COM\.TRANSF|COM MANT|OG-GESTION)/i, 'Comisiones', 'Comisión del banco'],
  [/^(IVA TASA GRA|IVA R\.I)/i, 'Comisiones', 'IVA sobre las comisiones del banco'],
  [/^(INTERES SALDO|IMPUESTO SELLOS|IMPUESTO DE SELLOS|COBRO DE INTERES POR DESCUBIERTO)/i, 'Intereses por descubierto', 'Interés por girar en descubierto y su impuesto de sellos'],
  // Santander
  [/^REGIMEN DE RECAUDACION SIRCREB/i, 'SIRCREB', 'Retención de Ingresos Brutos sobre lo que entra (se recupera en la declaración)'],
  [/^IVA 21%/i, 'Comisiones', 'IVA sobre las comisiones del banco'],
  [/^PAGO INTERES POR SALDO/i, 'Intereses a favor', 'Interés que paga el banco por el saldo en cuenta'],
  [/^PROMO /i, 'Reintegros', 'Reintegro de una promoción del banco'],
  // Galicia
  [/^ING\. BRUTOS S\/ CRED/i, 'SIRCREB', 'Retención de Ingresos Brutos sobre lo que entra (se recupera en la declaración)'],
  [/^INTERES CAPITALIZADO/i, 'Intereses a favor', 'Interés que paga el banco por el saldo en cuenta'],
  [/^(ANULACION )?REINTEGRO PROMO/i, 'Reintegros', 'Reintegro de una promoción del banco'],
]
const TIPO = [
  [/^PAGOS AFIP/i, 'afip', 'Pago a AFIP (VEP)'],
  [/PLANRG/i, 'afip', 'Plan de pago de AFIP'],
  [/^UG-DEBITO CU/i, 'prestamo', 'Cuota de préstamo'],
  [/^PAGO VISA/i, 'tarjeta', 'Pago de la tarjeta Visa'],
  [/HABERES/i, 'sueldos', 'Pago de sueldos (haberes)'],
  [/^OP\.TITULOS/i, 'inversion', 'Compra de títulos (inversión)'],
  [/^DEP\.CH/i, 'cobro', 'Depósito de cheque'],
  // Santander
  [/^PAGO (DE )?TARJETA DE CREDITO/i, 'tarjeta', 'Pago de tarjeta de crédito'],
  [/^(DEBITO AUTOMATICO|PAGO DE SERVICIOS).*(ARCA|AFIP)/i, 'afip', 'Pago a AFIP'],
  [/^COMPRA CON TARJETA DE DEBITO/i, 'transferencia', 'Compra con tarjeta de débito'],
  // Galicia
  [/^PAGO TARJETA (VISA|MASTER)/i, 'tarjeta', 'Pago de tarjeta de crédito'],
  [/^PAGO DE SERVICIOS VISA/i, 'tarjeta', 'Pago de tarjeta de crédito'],
  [/^DEB\. AUTOM\. DE SERV\. AFIP/i, 'afip', 'Plan de pago de AFIP'],
]
export function tipoDeMovimiento(m) {
  for (const [re, clase, que] of DEL_BANCO) if (re.test(m.concepto)) return { tipo: 'banco', clase, que }
  for (const [re, tipo, que] of TIPO) if (re.test(`${m.concepto} ${m.detalle || ''}`)) return { tipo, que }
  if (m.propia) return { tipo: 'propia', que: /FIMA/i.test(m.concepto) ? 'Fondo de inversión (FIMA)' : /DOLARES/i.test(m.concepto) ? 'Compra de dólares' : 'Movimiento entre cuentas de la misma persona' }
  if (m.monto > 0) return { tipo: 'cobro', que: 'Entró plata' }
  return { tipo: 'transferencia', que: 'Transferencia' }
}

// ---------------------------------------------------------------- 3. Cruzar contra la app

/**
 * @param movs  los de leerExtracto / unirExtractos
 * @param data  lo que devuelve getAllData()
 * @param opts  { cuenta: nombre de la cuenta en CUENTAS ("BBVA Somos Magma"), yaCargadas: Set de claves que ya están en MOVIMIENTOS_BANCO }
 */
export function cruzarExtracto(movs, data, opts = {}) {
  const cuenta = opts.cuenta || '', canon = opts.canonStaff || (n => txt(n))
  const ya = opts.yaCargadas || {}, yaClaves = ya.claves || new Set(), yaCortas = ya.cortas || new Set()
  const usados = new Set()   // cada cosa de la app se une con UN solo renglón del banco
  const igual = (a, b) => Math.abs(a - b) < 1

  // Quién es cada CUIT: agencias, contactos y freelancers
  const quienCuit = {}
  ;(data.agencias || []).forEach(a => { const c = soloDig(a['CUIT']); if (c.length === 11) quienCuit[c] = { nombre: txt(a['Nombre']), agencia: grupoAgencia(a['Nombre']) } })
  ;(data.contactos || []).forEach(a => { const c = soloDig(a['Cuit']); if (c.length === 11 && !quienCuit[c]) quienCuit[c] = { nombre: txt(a['Agencia']) || txt(a['Nombre']), agencia: grupoAgencia(a['Agencia']) } })
  ;(data.rrhh || []).forEach(r => { const c = soloDig(r['CUIT/CUIL']); if (c.length === 11 && !quienCuit[c]) quienCuit[c] = { nombre: txt(r['Nombre Apellido']), persona: true } })
  const cuitDe = m => { const c = (m.concepto.match(/\b(\d{11})\b/) || m.detalle.match(/\b(\d{11})\b/) || [])[1]; return c && /^(20|23|24|27|30|33|34)/.test(c) ? c : '' }
  // El nombre de quien paga, como lo escribe el banco: "CTE 315514 007-002389330101 MEIKIN S.R.L."
  // Santander: "De tripin srl / yungas - hon / 33710936299" o "A halbach tomas / varios - var / 20317223650".
  const nombreDe = m => txt(m.detalle.replace(/^CTE\s+\d+/i, '').replace(/CTA\.(ORIGEN|DESTINO):.*$/i, '').replace(/^(de|a)\s+/i, '').split(' / ')[0].replace(/\b[\d-]{6,}\b/g, '').replace(/\b\d{1,3}\b/g, '').replace(/^[\s-]+|[\s-]+$/g, ''))
  // A quién le fue la plata, en palabras: el nombre cargado para ese CUIT (RRHH, agencias) y el que escribe el banco.
  const palabrasDe = s => norm(s).split(/[^a-z0-9ñ]+/).filter(w => w.length >= 4)
  const destinatario = m => { const c = cuitDe(m); return new Set([...palabrasDe(c && quienCuit[c] ? quienCuit[c].nombre : ''), ...palabrasDe(nombreDe(m))]) }
  // De quién es un gasto fijo, en palabras: "Sueldo Tomi" es Tomás Halbach (los apodos se resuelven con lib/staff.js).
  const DE_PERSONA = /^(sueldo|monotributo|iibb|aut[oó]nomos)\s+/i
  const personaDeGasto = g => {
    const apodo = txt(g['Concepto']).replace(DE_PERSONA, '')
    return { apodo: palabrasDe(apodo), nombre: new Set([...palabrasDe(canon(apodo)), ...palabrasDe(canon(txt(g['Persona/Cuenta'])))]) }
  }
  // ¿El gasto es de la persona a la que se le transfirió? Dos palabras iguales del nombre completo ("lucia" y "grenier":
  // una sola no alcanza, "maria" la tiene medio equipo), o el apodo con que está escrito el gasto, si arranca igual que
  // una palabra del destinatario ("Tomi" y "Tomás").
  const esDeLaPersona = (g, dest) => { const p = personaDeGasto(g); return [...p.nombre].filter(w => dest.has(w)).length >= 2 || p.apodo.some(w => w.length <= 5 && [...dest].some(d => d.startsWith(w.slice(0, 3)))) }

  // ---- Lo previsto en la app
  const gastos = (data.gastosFijos || []).filter(g => txt(g['Concepto']) && num(g['Monto']) > 0 && !/^tarjeta$/i.test(txt(g['Medio de pago'])))
  const prestamos = (data.prestamos || []).filter(p => num(p['Monto cuota']) > 0)
  const tarjetas = (data.tarjetas || []).filter(t => num(t['Monto']) > 0)
  const facturas = (data.facturacion || []).filter(f => (txt(f['Nro de Factura']) || txt(f['Fecha emision'])) && !/^ANULADA/i.test(txt(f['Nro de Factura'])) && num(f['Precio FINAL']) > 0)
  // Pagos a freelancers ya marcados: lo que se le pagó a cada persona cada día
  const pagosStaff = {}
  ;(data.pagosStaff || []).forEach(p => { const d = fechaDe(p['Fecha Pago']), monto = num(p['Monto Pagado']); if (!d || monto <= 0) return; const k = `${norm(p['Freelancer'])}|${d.getTime()}`; const g = pagosStaff[k] = pagosStaff[k] || { persona: txt(p['Freelancer']), fecha: d, total: 0, n: 0 }; g.total += monto; g.n++ })

  const cruzarGasto = m => {
    const abs = -m.monto
    const mesDe = k => { const d = new Date(m.fecha.getFullYear(), m.fecha.getMonth() + k, 1); return { d, key: `${d.getMonth() + 1}/${d.getFullYear()}` } }
    const cands = gastos.filter(g => igual(num(g['Monto']), abs)).map(g => {
      const activo = si(g['Activo']) || txt(g['Activo']) === ''
      const unico = /[uú]nico/i.test(txt(g['Frecuencia']))
      let c = null
      if (unico) {
        if (!(parseInt(g['Mes carga']) === m.fecha.getMonth() + 1 && txt(g['Año carga']).includes(String(m.fecha.getFullYear())))) return null
        // Si ya figura pagado, tiene que haberse pagado por esos días: que coincidan el mes y el monto no alcanza
        // (una limpieza de $30.000 pagada en efectivo el 19 no es una transferencia de $30.000 del día 3).
        const fPago = fechaDe(g['Fecha pago'])
        if (si(g['Pagado']) && fPago && dias(fPago, m.fecha) > 6) return null
        c = { id: `GF:${g.__row}:u`, pagado: si(g['Pagado']), que: txt(g['Concepto']), ref: { hoja: 'GASTOS_FIJOS', fila: g.__row, mesKey: '' } }
      } else {
        // Un gasto de todos los meses: ¿de qué mes es este pago? El del vencimiento más cercano (un pago del 30/9 de algo
        // que vence el día 2 es el de octubre, adelantado). Si no tiene día de pago, el mes en que salió la plata.
        const diaPago = parseInt(g['Dia pago'])
        let mes = mesDe(0)
        if (diaPago >= 1 && diaPago <= 31) {
          const cerca = [-1, 0, 1].map(k => { const x = mesDe(k); const v = new Date(x.d.getFullYear(), x.d.getMonth(), Math.min(diaPago, new Date(x.d.getFullYear(), x.d.getMonth() + 1, 0).getDate())); return { ...x, dist: dias(v, m.fecha) } }).sort((a, b) => a.dist - b.dist)[0]
          if (cerca.dist > 12) return null   // lejos de cualquier vencimiento: que coincida el monto no alcanza
          mes = cerca
        }
        const pagados = txt(g['Meses pagados']).split(',').map(x => x.trim())
        c = { id: `GF:${g.__row}:${mes.key}`, pagado: pagados.includes(mes.key), que: `${txt(g['Concepto'])}${mes.key !== mesDe(0).key ? ` · mes ${mes.key}` : ''}`, ref: { hoja: 'GASTOS_FIJOS', fila: g.__row, mesKey: mes.key } }
      }
      if (usados.has(c.id)) return null
      // Un gasto dado de baja puede explicar un pago viejo que ya figura pagado, pero nunca se marca desde acá.
      if (!activo && !c.pagado) return null
      c.g = g
      return c
    }).filter(Boolean)
    if (cands.length > 1) {
      // Dos gastos del mismo monto (dos sueldos de $1.300.000): el que es de la persona a la que se le transfirió.
      const dest = destinatario(m)
      const suyos = dest.size ? cands.filter(c => esDeLaPersona(c.g, dest)) : []
      if (suyos.length === 1) return suyos[0]
    }
    // Un solo candidato, pero es el sueldo (o el monotributo) de una persona y el banco dice que la plata fue a OTRA:
    // no se une solo, queda como candidato para mirar.
    if (cands.length === 1 && DE_PERSONA.test(txt(cands[0].g['Concepto']))) { const dest = destinatario(m); if (dest.size && !esDeLaPersona(cands[0].g, dest)) return { varios: [cands[0].que] } }
    return cands.length === 1 ? cands[0] : cands.length > 1 ? { varios: cands.map(c => c.que) } : null
  }
  const cruzarPorVencimiento = (lista, campoMonto, hoja, nombre) => m => {
    const abs = -m.monto
    const cands = lista.filter(x => igual(num(x[campoMonto]), abs) && !usados.has(`${hoja}:${x.__row}`)).map(x => ({ x, v: fechaDe(x['Vencimiento']) })).filter(c => c.v && dias(c.v, m.fecha) <= 12).sort((a, b) => dias(a.v, m.fecha) - dias(b.v, m.fecha))
    if (!cands.length) return null
    const { x } = cands[0]
    return { id: `${hoja}:${x.__row}`, pagado: si(x['Pagado']), que: nombre(x), ref: { hoja, fila: x.__row } }
  }
  // Los VEP del contador (solapa IMPUESTOS). BBVA escribe el número del volante en el pago: es seguro. Los otros bancos
  // no lo escriben: vale el monto exacto de un pago a AFIP, hecho después de que llegó el volante (hasta 60 días) o, si
  // ya figura pagado, por los días en que se pagó. Uno que "NO VA" (reemplazado por otro volante) no se une nunca.
  const impuestos = (data.impuestos || []).filter(r => txt(r['Impuesto']) && !/^no va$/i.test(txt(r['Pagado'])) && num(r['Monto']) > 0)
  const cruzarImpuesto = m => {
    const texto = `${m.concepto} ${m.detalle || ''}`, abs = -m.monto
    const libres = impuestos.filter(r => !usados.has(`IM:${r.__row}`))
    let r = libres.find(x => /^\d{6,}$/.test(txt(x['N° VEP'])) && new RegExp(`\\b${txt(x['N° VEP'])}\\b`).test(texto))
    if (!r) r = libres.filter(x => {
      const pagado = estadoVep(x) === 'pagado', fPago = fechaDe(x['Fecha pago']), llego = fechaDe(x['Llegó']) || fechaDe(x['Vencimiento'])
      if (pagado) return !!fPago && dias(fPago, m.fecha) <= 6 && (igual(num(x['Monto pagado']), abs) || igual(num(x['Monto']), abs))
      return igual(num(x['Monto']), abs) && !!llego && m.fecha - llego >= -2 * DIA && m.fecha - llego <= 60 * DIA
    // Con dos del mismo monto: primero el que figura sin pagar o pagado (uno "SIN DATO" es viejo y dudoso), y entre iguales el que vence antes.
    }).sort((a, b) => (Number(estadoVep(a) === 'fuera') - Number(estadoVep(b) === 'fuera')) || ((fechaDe(a['Vencimiento']) || 0) - (fechaDe(b['Vencimiento']) || 0)))[0]
    return r ? { id: `IM:${r.__row}`, pagado: estadoVep(r) === 'pagado', que: nombreVep(r), ref: { hoja: 'IMPUESTOS', fila: r.__row } } : null
  }
  const cruzarPrestamo = cruzarPorVencimiento(prestamos, 'Monto cuota', 'PRESTAMOS', p => `Préstamo ${txt(p['Prestamo'])} · ${txt(p['Cuota nro'])}`)
  const cruzarTarjeta = cruzarPorVencimiento(tarjetas, 'Monto', 'TARJETAS', t => `${txt(t['Tarjeta'])} · resumen de ${txt(t['Mes'])}/${txt(t['Año'])}`)

  const staffPendiente = {}
  ;(data.pagosStaff || []).forEach(p => { if (fechaDe(p['Fecha Pago']) || num(p['Monto Pagado']) > 0) return; const monto = num(p['Monto Adeudado']) + num(p['Viáticos']); if (monto <= 0) return; const k = `${norm(p['Freelancer'])}|${txt(p['Mes Referencia'])}`; const g = staffPendiente[k] = staffPendiente[k] || { persona: txt(p['Freelancer']), mes: txt(p['Mes Referencia']), total: 0 }; g.total += monto })
  const staffQueEspera = abs => Object.values(staffPendiente).filter(g => igual(g.total, abs)).map(g => `Pago a ${g.persona} (${g.mes}, figura pendiente)`)
  const cruzarStaff = m => {
    const abs = -m.monto
    const c = Object.values(pagosStaff).filter(g => igual(g.total, abs) && dias(g.fecha, m.fecha) <= 4 && !usados.has(`PS:${norm(g.persona)}|${g.fecha.getTime()}`)).sort((a, b) => dias(a.fecha, m.fecha) - dias(b.fecha, m.fecha))[0]
    return c ? { id: `PS:${norm(c.persona)}|${c.fecha.getTime()}`, pagado: true, que: `Pago a ${c.persona} (${c.n} ${c.n === 1 ? 'trabajo' : 'trabajos'})`, ref: { hoja: 'PAGOS_STAFF', persona: c.persona } } : null
  }

  // Un cobro contra las facturas. Puntos: monto exacto 3 · monto menos retenciones 3 · monto "cerca" (hasta 7% menos,
  // por retenciones que no están cargadas) 1 y solo si coincide quién paga · mismo pagador 3 · fecha de cobro igual 1.
  const cruzarCobro = m => {
    const cuit = cuitDe(m), quien = cuit ? quienCuit[cuit] : null
    const pagador = quien?.agencia || quien?.nombre || nombreDe(m)
    const palabras = norm(pagador).split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !['s.r.l', 'srl', 'sociedad', 'asociacion', 'civil', 'servicios', 'comunicacion', 'comunicaciones', 'producciones'].includes(w))
    const mismoPagador = f => { if (!palabras.length) return false; const donde = pegado(`${f['Agencia']} ${f['Cliente']}`); return palabras.some(w => donde.includes(w)) || (!!cuit && soloDig(f['CUIT']) === cuit) }
    const cands = []
    for (const f of facturas) {
      if (usados.has(`FC:${f.__row}`)) continue
      const final = num(f['Precio FINAL']), cobrado = num(f['Monto cobrado']), ret = num(f['Ret. Ganancias']) + num(f['Ret. IIBB']) + num(f['Ret. IVA']) + num(f['Comision banco'])
      const cobrada = si(f['Cobrado']), fCobro = fechaDe(f['Fecha cobro']), fEmi = fechaDe(f['Fecha emision'])
      // Ventana de fecha: una ya cobrada tiene que haberse cobrado por esos días; una sin cobrar tiene que estar emitida antes
      if (cobrada ? !(fCobro && dias(fCobro, m.fecha) <= 6) : (fEmi && fEmi - m.fecha > 3 * DIA)) continue
      const saldo = Math.max(0, final - (cobrada ? 0 : cobrado))
      let pts = 0, como = ''
      if (igual(saldo, m.monto) || (cobrada && igual(cobrado, m.monto))) { pts = 3; como = 'mismo monto' }
      else if (ret > 0 && igual(final - ret, m.monto)) { pts = 3; como = 'monto menos retenciones' }
      else if (final > m.monto && (final - m.monto) / final <= 0.07 && mismoPagador(f)) { pts = 1; como = `faltan $${Math.round(final - m.monto).toLocaleString('es-AR')}, puede ser una retención` }
      if (!pts) continue
      if (mismoPagador(f)) pts += 3
      // La razón social exacta ("Grupo Ng - (PARMENTTIER)") desempata entre facturas del mismo grupo
      if (quien?.nombre && norm(quien.nombre) === norm(f['Agencia'])) pts += 2
      if (fCobro && dias(fCobro, m.fecha) === 0) pts += 1
      cands.push({ f, pts, como, cobrada, final, emi: fEmi ? fEmi.getTime() : 0 })
    }
    // A igual puntaje: primero la que ya figura cobrada, después la más vieja
    cands.sort((a, b) => (b.pts - a.pts) || (Number(b.cobrada) - Number(a.cobrada)) || (a.emi - b.emi))
    const etiqueta = c => `Factura #${txt(c.f['N° Presupuesto'])} · ${grupoAgencia(c.f['Agencia'] || c.f['Cliente'])}${txt(c.f['Cliente']) && txt(c.f['Cliente']) !== txt(c.f['Agencia']) ? ` · ${txt(c.f['Cliente'])}` : ''}`
    if (!cands.length) return { pagador }
    const empatadas = cands.filter(c => c.pts === cands[0].pts)
    // Empate entre facturas equivalentes (misma razón social, mismo monto, mismo estado): da igual cuál, se toman en orden.
    // Cualquier otro empate no se une solo.
    const equivalentes = empatadas.every(c => grupoAgencia(c.f['Agencia'] || c.f['Cliente']) === grupoAgencia(empatadas[0].f['Agencia'] || empatadas[0].f['Cliente']) && norm(c.f['Agencia']) === norm(empatadas[0].f['Agencia']) && igual(c.final, empatadas[0].final) && c.cobrada === empatadas[0].cobrada && mismoPagador(c.f))
    if (empatadas.length > 1 && !equivalentes) return { pagador, varios: empatadas.slice(0, 4).map(etiqueta) }
    const c = cands[0]
    // Con el monto "cerca" no se marca sola: falta saber qué retención fue. Se muestra como candidata.
    if (c.como.startsWith('faltan') && !c.cobrada) return { pagador, varios: [`${etiqueta(c)} (${c.como})`] }
    return { pagador, id: `FC:${c.f.__row}`, pagado: c.cobrada, que: etiqueta(c), como: c.como, ref: { hoja: 'FACTURACION', fila: c.f.__row, nro: txt(c.f['N° Presupuesto']) } }
  }

  // PASES ENTRE CUENTAS DE MAGMA. Cada cuenta de la app tiene sus CUIT: los que figuran en sus datos (CUENTAS) y el de
  // su titular (cruzando el nombre con RRHH). Si la plata viene de, o va a, el CUIT de OTRA cuenta de la app, es un pase
  // (BBVA le transfiere a la cuenta de Sofi; Sofi le pasa a la de Lulu), no un cobro ni un gasto. El CUIT de la propia
  // cuenta no cuenta: BBVA lo escribe en todas las transferencias que salen, y esas sí son pagos.
  const nombreOrdenado = t => norm(t).split(/[^a-z0-9ñ]+/).filter(w => w.length >= 3).sort().join(' ')
  const cuitsDe = c => { const out = new Set(); for (const x of `${c['Datos transferencia adicionales'] || ''} ${c['Notas'] || ''}`.matchAll(/\b(\d{2})-?(\d{8})-?(\d)\b/g)) out.add(x[1] + x[2] + x[3])
    const tit = nombreOrdenado(c['Titular']); if (tit) (data.rrhh || []).forEach(r => { const cu = soloDig(r['CUIT/CUIL']); if (cu.length === 11 && nombreOrdenado(r['Nombre Apellido']) === tit) out.add(cu) }); return out }
  const deEstaCuenta = new Set(), deOtrasCuentas = new Set()
  ;(data.cuentas || []).forEach(c => cuitsDe(c).forEach(x => (txt(c['Nombre']) === cuenta ? deEstaCuenta : deOtrasCuentas).add(x)))
  const esDeOtraCuenta = m => { const c = cuitDe(m); return !!c && deOtrasCuentas.has(c) && !deEstaCuenta.has(c) }

  // ---- Renglón por renglón (del más viejo al más nuevo, para que las cuotas se unan en orden)
  const filas = conClaveSiFalta(movs).slice().sort((a, b) => a.fecha - b.fecha).map(m => {
    let t = tipoDeMovimiento(m)
    if ((t.tipo === 'cobro' || t.tipo === 'transferencia') && esDeOtraCuenta(m)) t = { tipo: 'propia', que: m.monto > 0 ? 'Vino de otra cuenta de Magma' : 'Fue a otra cuenta de Magma' }
    const fila = { ...m, fechaTxt: dmy(m.fecha), tipo: t.tipo, clase: t.clase || '', yaCargada: yaClaves.has(m.clave) || yaCortas.has(m.corta), estado: 'revisar', que: t.que, ref: null, candidatos: [] }
    if (t.tipo === 'banco') { fila.estado = 'banco'; return fila }
    let r = null
    if (m.monto > 0) {
      r = t.tipo === 'propia' ? null : cruzarCobro(m)   // plata que el titular se pasó a sí mismo no es el cobro de una factura
      if (r?.pagador) fila.quien = r.pagador
    } else {
      const cuit = cuitDe(m); if (cuit && quienCuit[cuit]) fila.quien = quienCuit[cuit].nombre
      // Un pago a AFIP: primero contra los VEP del contador; si no es ninguno, sigue el camino de siempre (gastos fijos).
      r = t.tipo === 'afip' && cruzarImpuesto(m) || (t.tipo === 'prestamo' ? cruzarPrestamo(m) : t.tipo === 'tarjeta' ? cruzarTarjeta(m) : (() => { const staff = t.tipo === 'propia' ? null : cruzarStaff(m); if (staff) return staff; const g = cruzarGasto(m); if (g?.id && !g.pagado) { const otros = staffQueEspera(-m.monto); if (otros.length) return { varios: [g.que, ...otros] } } return g })())
    }
    if (r?.id) { usados.add(r.id); fila.estado = r.pagado ? 'ok' : 'marcar'; fila.que = r.que; fila.ref = r.ref; if (r.como) fila.como = r.como }
    else if (t.tipo === 'propia') { fila.estado = 'pase' }   // plata que la misma persona pasó de una cuenta suya a otra: no hay nada que marcar
    else if (r?.varios) { fila.candidatos = r.varios }
    return fila
  }).sort((a, b) => b.fecha - a.fecha)

  // ---- Resumen
  const de = e => filas.filter(x => x.estado === e), suma = l => l.reduce((s, x) => s + x.monto, 0)
  const banco = {}; de('banco').forEach(x => { banco[x.clase] = (banco[x.clase] || 0) + x.monto })
  const resumen = {
    total: filas.length, desde: filas.length ? filas[filas.length - 1].fecha : null, hasta: filas.length ? filas[0].fecha : null,
    entro: suma(filas.filter(x => x.monto > 0)), salio: suma(filas.filter(x => x.monto < 0)),
    ok: de('ok').length, marcar: de('marcar').length, montoMarcar: de('marcar').reduce((s, x) => s + Math.abs(x.monto), 0),
    banco: de('banco').length, montoBanco: suma(de('banco')), bancoPorClase: banco,
    revisar: de('revisar').length, montoRevisar: de('revisar').reduce((s, x) => s + Math.abs(x.monto), 0),
    pases: de('pase').length, montoPases: suma(de('pase')),
    nuevas: filas.filter(x => !x.yaCargada).length,
  }
  return { cuenta, filas, resumen }
}

const conClaveSiFalta = movs => movs.every(m => m.clave) ? movs : conClave(movs)

// ---------------------------------------------------------------- 4. Revisar a mano lo que no se reconoció solo

/**
 * Para un movimiento del banco que ENTRÓ y quedó "para revisar": las facturas que puede estar pagando, de la más
 * probable a la menos. No decide nada: es la lista que se le muestra a la persona para que elija una o varias
 * (un cliente puede pagar varias facturas juntas, o una en partes).
 *
 * @param mov   { fecha: Date, monto: number, concepto, detalle }
 * @returns [{ fila, nro, agencia, cliente, proyecto, final, pendiente, cobrada, fechaCobro, vence, puntos, porque }]
 *          pendiente = lo que falta cobrar de esa factura (0 si ya figura cobrada)
 */
export function facturasCandidatas(mov, data, opts = {}) {
  // Las facturas que ya están unidas a OTRO movimiento del banco: se muestran avisando, y nunca se proponen solas.
  const unidas = new Set()
  ;(data.movimientosBanco || []).forEach(r => { if (txt(r['Hoja']) !== 'FACTURACION' || r.__row === opts.filaMov) return; txt(r['Ref']).split(/[,\s]+/).filter(Boolean).forEach(n => unidas.add(n)) })
  const quienCuit = {}
  ;(data.agencias || []).forEach(a => { const c = soloDig(a['CUIT']); if (c.length === 11) quienCuit[c] = txt(a['Nombre']) })
  ;(data.contactos || []).forEach(a => { const c = soloDig(a['Cuit']); if (c.length === 11 && !quienCuit[c]) quienCuit[c] = txt(a['Agencia']) || txt(a['Nombre']) })
  const texto = `${mov.concepto || ''} ${mov.detalle || ''}`
  const cuit = (texto.match(/\b((?:20|23|24|27|30|33|34)\d{9})\b/) || [])[1] || ''
  const nombre = txt(String(mov.detalle || '').replace(/^CTE\s+\d+/i, '').replace(/CTA\.(ORIGEN|DESTINO):.*$/i, '').replace(/^(de|a)\s+/i, '').split(' / ')[0].replace(/\b[\d-]{6,}\b/g, '').replace(/\b\d{1,3}\b/g, ''))
  // Palabras del nombre de quien paga. Las genéricas no dicen nada ("ADN COMUNICACION" no es Oir Comunicaciones).
  const GENERICAS = ['sociedad', 'asociacion', 'civil', 'servicios', 'grupo', 'comunicacion', 'comunicaciones', 'producciones', 'srl', 'the', 'del', 'los', 'las', 'ano']
  const palabras = norm(`${quienCuit[cuit] || ''} ${nombre}`).split(/[^a-z0-9ñ]+/).filter(w => w.length >= 3 && !GENERICAS.includes(w))
  const esDelPagador = f => {
    if (cuit && soloDig(f['CUIT']) === cuit) return true
    if (cuit && quienCuit[cuit] && norm(quienCuit[cuit]) === norm(f['Agencia'])) return true
    if (!palabras.length) return false
    // Una palabra larga alcanza con que esté adentro del nombre ("popup" en "Pop Up"); una de 3 letras ("adn") tiene que ser una palabra entera.
    const donde = pegado(`${f['Agencia']} ${f['Cliente']}`), enteras = norm(`${f['Agencia']} ${f['Cliente']}`).split(/[^a-z0-9ñ]+/)
    return palabras.some(w => w.length >= 4 ? donde.includes(w) : enteras.includes(w))
  }
  const out = []
  for (const f of data.facturacion || []) {
    if (!(txt(f['Nro de Factura']) || txt(f['Fecha emision'])) || /^ANULADA/i.test(txt(f['Nro de Factura']))) continue
    const final = num(f['Precio FINAL']); if (final <= 0) continue
    const cobrada = si(f['Cobrado']), cobrado = num(f['Monto cobrado']), fCobro = fechaDe(f['Fecha cobro']), fEmi = fechaDe(f['Fecha emision'])
    const pendiente = cobrada ? 0 : Math.max(0, final - cobrado)
    const vale = cobrada ? (cobrado || final) : pendiente
    // Una ya cobrada solo es candidata si se cobró por esos días; una sin cobrar, si ya estaba emitida.
    if (cobrada ? !(fCobro && dias(fCobro, mov.fecha) <= 20) : (fEmi && fEmi - mov.fecha > 3 * DIA)) continue
    let puntos = 0; const porque = []
    if (esDelPagador(f)) { puntos += 3; porque.push('mismo cliente') }
    if (Math.abs(vale - mov.monto) < 1 || Math.abs(final - mov.monto) < 1) { puntos += 3; porque.push('mismo monto') }
    else if (final > mov.monto && (final - mov.monto) / final <= 0.08) { puntos += 2; porque.push(`$${Math.round(final - mov.monto).toLocaleString('es-AR')} menos: puede ser una retención`) }
    if (cobrada && fCobro && dias(fCobro, mov.fecha) <= 3) { puntos += 1; porque.push('cobrada por esos días') }
    if (!puntos) continue
    if (unidas.has(txt(f['N° Presupuesto']))) porque.push('ya está unida a otro movimiento del banco')
    out.push({ unida: unidas.has(txt(f['N° Presupuesto'])), diasCobro: cobrada && fCobro ? dias(fCobro, mov.fecha) : null, fila: f.__row, nro: txt(f['N° Presupuesto']), agencia: txt(f['Agencia'] || f['Cliente']), cliente: txt(f['Cliente']), proyecto: txt(f['Proyecto']), final, pendiente, vale, cobrada, fechaCobro: txt(f['Fecha cobro']), vence: txt(f['Vencimiento']), puntos, porque })
  }
  out.sort((a, b) => (b.puntos - a.puntos) || (Math.abs(a.vale - mov.monto) - Math.abs(b.vale - mov.monto)))
  // Si entre las del mismo cliente hay un grupo que suma justo lo que entró, es casi seguro ese: se propone elegido.
  // Solo se propone lo que no está unido a otro movimiento y, si ya figura cobrado, que se haya cobrado esa misma semana.
  const proponible = c => !c.unida && (!c.cobrada || (c.diasCobro !== null && c.diasCobro <= 7))
  const suyas = out.filter(c => c.porque.includes('mismo cliente') && proponible(c)).slice(0, 12)
  const exacta = out.find(c => Math.abs(c.vale - mov.monto) < 1 && proponible(c))
  let justas = exacta ? [exacta.fila] : []
  if (!justas.length) {
    const buscar = (desde, resto, elegidas) => { if (Math.abs(resto) < 1 && elegidas.length > 1) return elegidas; if (elegidas.length >= 5 || resto < 1) return null; for (let i = desde; i < suyas.length; i++) { const r = buscar(i + 1, resto - suyas[i].vale, [...elegidas, suyas[i].fila]); if (r) return r } return null }
    justas = buscar(0, mov.monto, []) || []
  }
  return { candidatas: out.slice(0, 25), sumanJusto: justas, pagador: quienCuit[cuit] || nombre }
}
