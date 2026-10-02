/**
 * EXTRACTO DEL BANCO: leer el archivo que baja el banco y cruzar cada renglón con lo que hay en la app.
 *
 * La idea (paso 6 de administración): que nadie tilde pagos ni cobros a mano. Se sube el extracto y
 * cada movimiento cae en uno de cuatro estados:
 *   'ok'       ya está en la app tal cual (la factura figura cobrada, el gasto figura pagado)
 *   'marcar'   coincide con algo previsto que en la app sigue sin pagar o sin cobrar: se marca al confirmar
 *   'banco'    lo cobra el banco solo (impuesto al cheque, comisiones, retenciones): no hay nada que marcar
 *   'revisar'  no se reconoce solo, o hay más de un candidato: lo tiene que mirar una persona
 *
 * Cálculo puro, igual que lib/caja.mjs y lib/hoy.mjs: no lee ni escribe el sheet.
 *
 * Regla de cruce: mismo monto + ventana de fecha. Si hay dos candidatos igual de buenos NO se une solo.
 */
import { num, fechaDe, grupoAgencia } from './caja.mjs'

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
 * Lee el texto de un extracto (CSV separado por punto y coma). Hoy reconoce el de BBVA Net Cash, en sus
 * dos hojas: "Movimientos Históricos" y "Movimientos del Día".
 * @returns {{ banco, cuentaNro, empresa, saldo, movs: [{ fecha: Date, concepto, codigo, detalle, monto }] }}
 *          monto positivo = entró plata, negativo = salió
 */
export function leerExtracto(texto) {
  const lineas = String(texto || '').replace(/^﻿/, '').split(/\r?\n/).map(l => l.split(';').map(c => c.trim()))
  const iCab = lineas.findIndex(c => norm(c[0]) === 'fecha' && c.some(x => /^cr[eé]dito$/i.test(x)) && c.some(x => /^d[eé]bito$/i.test(x)))
  if (iCab < 0) throw new Error('No reconozco el archivo. Tiene que ser el de movimientos de la cuenta de BBVA, guardado como CSV.')
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

/** Junta varios archivos del mismo banco (el histórico y el del día) y saca los renglones repetidos. */
export function unirExtractos(extractos) {
  const vistos = new Set(), movs = []
  const base = extractos[0] || { banco: '', cuentaNro: '', empresa: '', saldo: 0 }
  for (const e of extractos) {
    if (base.cuentaNro && e.cuentaNro && e.cuentaNro !== base.cuentaNro) throw new Error(`Los archivos son de cuentas distintas (${base.cuentaNro} y ${e.cuentaNro}). Subí los de una sola cuenta por vez.`)
    conClave(e.movs).forEach(m => { if (!vistos.has(m.clave)) { vistos.add(m.clave); movs.push(m) } })
  }
  movs.sort((a, b) => b.fecha - a.fecha)
  return { ...base, movs }
}

// La clave que identifica un renglón del banco: sirve para no cargar dos veces el mismo si se sube un extracto que se pisa con otro.
// Dos renglones idénticos el mismo día (dos transferencias de $800.000) se distinguen por el orden en que vienen.
export function conClave(movs) {
  const cuenta = {}
  return movs.map(m => { const base = `${m.fecha.getFullYear()}-${m.fecha.getMonth() + 1}-${m.fecha.getDate()}|${m.concepto}|${m.monto.toFixed(2)}`; cuenta[base] = (cuenta[base] || 0) + 1; return { ...m, clave: `${base}|${cuenta[base]}` } })
}

// ---------------------------------------------------------------- 2. Qué es cada renglón, según su concepto

// Lo que el banco cobra solo. "rubro" y "subrubro" son los de la solapa RUBROS.
const DEL_BANCO = [
  [/^(IMPUESTO LEY|LEY NRO 25\.4)/i, 'Impuesto al cheque', 'Impuesto ley 25.413 sobre débitos y créditos'],
  [/^REG REC SIRC/i, 'SIRCREB', 'Retención de Ingresos Brutos sobre lo que entra (se recupera en la declaración)'],
  [/^(PERCEPCION|PERC\.CABA)/i, 'Percepciones', 'Percepción de IVA o Ingresos Brutos (se recupera en la declaración)'],
  [/^(COMISION|COM\.TRANSF|COM MANT|OG-GESTION)/i, 'Comisiones', 'Comisión del banco'],
  [/^(IVA TASA GRA|IVA R\.I)/i, 'Comisiones', 'IVA sobre las comisiones del banco'],
  [/^(INTERES SALDO|IMPUESTO SELLOS)/i, 'Intereses por descubierto', 'Interés por girar en descubierto y su impuesto de sellos'],
]
const TIPO = [
  [/^PAGOS AFIP/i, 'afip', 'Pago a AFIP (VEP)'],
  [/PLANRG/i, 'afip', 'Plan de pago de AFIP'],
  [/^UG-DEBITO CU/i, 'prestamo', 'Cuota de préstamo'],
  [/^PAGO VISA/i, 'tarjeta', 'Pago de la tarjeta Visa'],
  [/HABERES/i, 'sueldos', 'Pago de sueldos (haberes)'],
  [/^OP\.TITULOS/i, 'inversion', 'Compra de títulos (inversión)'],
  [/^DEP\.CH/i, 'cobro', 'Depósito de cheque'],
]
export function tipoDeMovimiento(m) {
  for (const [re, clase, que] of DEL_BANCO) if (re.test(m.concepto)) return { tipo: 'banco', clase, que }
  for (const [re, tipo, que] of TIPO) if (re.test(m.concepto)) return { tipo, que }
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
  const cuenta = opts.cuenta || '', yaCargadas = opts.yaCargadas || new Set()
  const usados = new Set()   // cada cosa de la app se une con UN solo renglón del banco
  const igual = (a, b) => Math.abs(a - b) < 1

  // Quién es cada CUIT: agencias, contactos y freelancers
  const quienCuit = {}
  ;(data.agencias || []).forEach(a => { const c = soloDig(a['CUIT']); if (c.length === 11) quienCuit[c] = { nombre: txt(a['Nombre']), agencia: grupoAgencia(a['Nombre']) } })
  ;(data.contactos || []).forEach(a => { const c = soloDig(a['Cuit']); if (c.length === 11 && !quienCuit[c]) quienCuit[c] = { nombre: txt(a['Agencia']) || txt(a['Nombre']), agencia: grupoAgencia(a['Agencia']) } })
  ;(data.rrhh || []).forEach(r => { const c = soloDig(r['CUIT/CUIL']); if (c.length === 11 && !quienCuit[c]) quienCuit[c] = { nombre: txt(r['Nombre Apellido']), persona: true } })
  const cuitDe = m => { const c = (m.concepto.match(/\b(\d{11})\b/) || m.detalle.match(/\b(\d{11})\b/) || [])[1]; return c && /^(20|23|24|27|30|33|34)/.test(c) ? c : '' }
  // El nombre de quien paga, como lo escribe el banco: "CTE 315514 007-002389330101 MEIKIN S.R.L."
  const nombreDe = m => txt(m.detalle.replace(/^CTE\s+\d+/i, '').replace(/CTA\.(ORIGEN|DESTINO):.*$/i, '').replace(/\b[\d-]{6,}\b/g, '').replace(/^[\s-]+|[\s-]+$/g, ''))

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
      return c
    }).filter(Boolean)
    return cands.length === 1 ? cands[0] : cands.length > 1 ? { varios: cands.map(c => c.que) } : null
  }
  const cruzarPorVencimiento = (lista, campoMonto, hoja, nombre) => m => {
    const abs = -m.monto
    const cands = lista.filter(x => igual(num(x[campoMonto]), abs) && !usados.has(`${hoja}:${x.__row}`)).map(x => ({ x, v: fechaDe(x['Vencimiento']) })).filter(c => c.v && dias(c.v, m.fecha) <= 12).sort((a, b) => dias(a.v, m.fecha) - dias(b.v, m.fecha))
    if (!cands.length) return null
    const { x } = cands[0]
    return { id: `${hoja}:${x.__row}`, pagado: si(x['Pagado']), que: nombre(x), ref: { hoja, fila: x.__row } }
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
    const palabras = norm(pagador).split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !['s.r.l', 'srl', 'sociedad', 'asociacion', 'civil', 'servicios'].includes(w))
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

  // ---- Renglón por renglón (del más viejo al más nuevo, para que las cuotas se unan en orden)
  const filas = conClaveSiFalta(movs).slice().sort((a, b) => a.fecha - b.fecha).map(m => {
    const t = tipoDeMovimiento(m)
    const fila = { ...m, fechaTxt: dmy(m.fecha), tipo: t.tipo, clase: t.clase || '', yaCargada: yaCargadas.has(m.clave), estado: 'revisar', que: t.que, ref: null, candidatos: [] }
    if (t.tipo === 'banco') { fila.estado = 'banco'; return fila }
    let r = null
    if (m.monto > 0) {
      r = cruzarCobro(m)
      if (r.pagador) fila.quien = r.pagador
    } else {
      const cuit = cuitDe(m); if (cuit && quienCuit[cuit]) fila.quien = quienCuit[cuit].nombre
      r = t.tipo === 'prestamo' ? cruzarPrestamo(m) : t.tipo === 'tarjeta' ? cruzarTarjeta(m) : (() => { const staff = cruzarStaff(m); if (staff) return staff; const g = cruzarGasto(m); if (g?.id && !g.pagado) { const otros = staffQueEspera(-m.monto); if (otros.length) return { varios: [g.que, ...otros] } } return g })()
    }
    if (r?.id) { usados.add(r.id); fila.estado = r.pagado ? 'ok' : 'marcar'; fila.que = r.que; fila.ref = r.ref; if (r.como) fila.como = r.como }
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
    nuevas: filas.filter(x => !x.yaCargada).length,
  }
  return { cuenta, filas, resumen }
}

const conClaveSiFalta = movs => movs.every(m => m.clave) ? movs : conClave(movs)
