/**
 * CAJA: todo lo que entra y todo lo que sale en un mes, en una sola lista.
 *
 * Junta lo que hoy está repartido en cuatro pantallas: gastos fijos, cuotas de préstamos y
 * tarjetas (Egresos), lo que se les paga a los freelancers el 15 (Pagos Staff) y lo que falta
 * cobrar (Facturación), contra el saldo de las cuentas. Es un cálculo puro: recibe los datos
 * que la app ya leyó del sheet y devuelve la lista. No lee ni escribe nada.
 *
 * Vive acá, y no adentro de la pantalla, para que la pantalla, el mail de la diaria y cualquier
 * script den el MISMO número (mismo criterio que lib/socios.mjs con la cuenta de socios).
 *
 * Cada cosa que sale dice CÓMO sale:
 *   'mano'    hay que hacer la transferencia (alguien tiene que acordarse)
 *   'debito'  se debita solo de una cuenta (lo único que hay que mirar es que haya saldo)
 *   'socios'  el sueldo de los socios: se anota en la cuenta de socios, no se paga por acá
 *   'falta'   una tarjeta en uso que todavía no tiene cargado el resumen de este mes
 */

export const num = v => { if (v === null || v === undefined || v === '') return 0; if (typeof v === 'number') return v; const n = parseFloat(String(v).replace(/[$,\s]/g, '')); return isNaN(n) ? 0 : n }
export const fechaDe = s => { const m = String(s ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (!m) return null; const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return new Date(y, +m[2] - 1, +m[1]) }
const txt = v => String(v ?? '').trim()
const si = v => v === true || /^(s[ií]|true)$/i.test(txt(v))
const norm = s => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const DIA = 864e5
const dm = d => `${d.getDate()}/${d.getMonth() + 1}`

// Las razones sociales de un mismo grupo se cuentan juntas ("Grupo Ng - (RABBLE S.A)" es Grupo Ng).
export const grupoAgencia = nombre => txt(nombre).split(' - (')[0].trim()
// Los sueldos de los socios no se pagan como un gasto más: van por la cuenta de socios.
const esSueldoSocio = g => /sueldo/i.test(txt(g['Categoria'])) && /^sueldo\s+(juan|sof)/i.test(txt(g['Concepto']))
const esSocio = nombre => /arauz/i.test(nombre) || /sof[ií]a\b.*grenier/i.test(nombre)

/** Semanas del mes, de lunes a domingo, recortadas al mes: [{desde, hasta}] en días del mes. */
export function semanasDelMes(mes, anio) {
  const ultimo = new Date(anio, mes, 0).getDate()
  const out = []
  let d = 1
  while (d <= ultimo) {
    const dow = new Date(anio, mes - 1, d).getDay()          // 0 = domingo
    const hasta = Math.min(ultimo, d + ((7 - dow) % 7))      // hasta el domingo de esa semana
    out.push({ desde: d, hasta })
    d = hasta + 1
  }
  return out
}

/**
 * @param data  lo que devuelve getAllData(): gastosFijos, tarjetas, prestamos, cuentas, facturacion, proyectos, pagosStaff
 * @param opts  { mes (1-12), anio, hoy, maxSlots, canonStaff, tarjetasActivas }
 */
export function calcularCaja(data, opts = {}) {
  const hoy = opts.hoy || new Date()
  const hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const mes = opts.mes || hoy0.getMonth() + 1, anio = opts.anio || hoy0.getFullYear()
  const maxSlots = opts.maxSlots || 40
  const canon = opts.canonStaff || (n => txt(n))
  const esMesActual = mes === hoy0.getMonth() + 1 && anio === hoy0.getFullYear()
  const enMes = d => !!d && d.getMonth() + 1 === mes && d.getFullYear() === anio
  const mesKey = `${mes}/${anio}`
  const ultimoDia = new Date(anio, mes, 0).getDate()
  const gf = data.gastosFijos || [], tarj = data.tarjetas || [], prest = data.prestamos || [], fc = data.facturacion || []

  // ---------- Cuentas (las activas; la de dólares va aparte porque su saldo no es en pesos)
  const cuentas = (data.cuentas || []).filter(c => txt(c['Nombre'])).map(c => ({
    nombre: txt(c['Nombre']), activa: si(c['Activa']), usd: /d[oó]lar|usd/i.test(txt(c['Tipo']) + txt(c['Nombre'])),
    saldo: num(c['Saldo actual']), saldoUsd: num(c['Saldo USD']), actualizada: txt(c['Última actualización']).split(' ')[0],
  }))
  const nombresCuenta = cuentas.map(c => c.nombre)
  // "Persona/Cuenta" a veces trae la cuenta con su número: "Galicia Sofi (CA 4014…)". Si arranca con el nombre de una cuenta, es esa.
  const cuentaEn = s => nombresCuenta.find(n => norm(s).startsWith(norm(n))) || ''

  const items = []

  // ---------- 1. Gastos fijos (los recurrentes, y los puntuales cargados para este mes)
  for (const g of gf) {
    const activo = si(g['Activo']) || txt(g['Activo']) === ''
    if (!activo) continue
    const medio = txt(g['Medio de pago'])
    // Lo que se paga con tarjeta ya viene adentro del resumen de la tarjeta: contarlo acá sería contarlo dos veces.
    if (/^tarjeta$/i.test(medio)) continue
    const unico = /[uú]nico/i.test(txt(g['Frecuencia']))
    if (unico && !(parseInt(g['Mes carga']) === mes && txt(g['Año carga']).includes(String(anio)))) continue
    const monto = num(g['Monto'])
    const dia = parseInt(g['Dia pago'])
    const pagado = txt(g['Meses pagados']).split(',').map(s => s.trim()).includes(mesKey) || (unico && si(g['Pagado']))
    items.push({
      id: 'GF:' + g.__row, hoja: 'GASTOS_FIJOS', fila: g.__row, mesPagoKey: mesKey,
      tipo: /d[eé]bito/i.test(medio) ? 'debito' : esSueldoSocio(g) ? 'socios' : 'mano',
      fuente: txt(g['Categoria']) || 'Otros', nombre: txt(g['Concepto']) || '(sin concepto)', det: '',
      dia: dia >= 1 && dia <= 31 ? Math.min(dia, ultimoDia) : null, monto,
      cuenta: txt(g['Cuenta pago']) || cuentaEn(g['Persona/Cuenta']), pagado, fechaPago: pagado ? txt(g['Fecha pago']) : '',
      unico, sinMedio: !medio,
    })
  }

  // ---------- 2. Cuotas de préstamos bancarios (se debitan solas de la cuenta)
  const ultCuentaPrestamo = {}
  prest.forEach(p => { if (txt(p['Cuenta pago'])) ultCuentaPrestamo[txt(p['Prestamo'])] = txt(p['Cuenta pago']) })
  let atrasadosN = 0, atrasadosMonto = 0
  const primerDia = new Date(anio, mes - 1, 1)
  for (const p of prest) {
    if (/socio/i.test(txt(p['Tipo']))) continue
    const v = fechaDe(p['Vencimiento']); if (!v) continue
    const monto = num(p['Monto cuota']), pagado = si(p['Pagado'])
    if (v < primerDia && !pagado) { atrasadosN++; atrasadosMonto += monto }
    if (!enMes(v)) continue
    const nro = (txt(p['Cuota nro']).match(/\d+/) || [''])[0], total = txt(p['Cuotas total']).replace(/\D/g, '')
    items.push({
      id: 'PR:' + p.__row, hoja: 'PRESTAMOS', fila: p.__row, tipo: 'debito', fuente: 'Préstamos',
      nombre: `Préstamo ${txt(p['Prestamo'])}`, det: nro ? `cuota ${nro}${total ? ` de ${total}` : ''}` : '',
      dia: v.getDate(), monto, cuenta: txt(p['Cuenta pago']) || ultCuentaPrestamo[txt(p['Prestamo'])] || '', pagado, fechaPago: pagado ? txt(p['Fecha pago']) : '',
    })
  }

  // ---------- 3. Tarjetas: van por la fecha en que VENCE el resumen (cuándo sale la plata), no por el mes del resumen
  const venceTarjeta = t => fechaDe(t['Vencimiento'])
  const conResumen = new Set()
  for (const t of tarj) {
    const v = venceTarjeta(t)
    const monto = num(t['Monto']), pagado = si(t['Pagado'])
    if (v && v < primerDia && !pagado) { atrasadosN++; atrasadosMonto += monto }
    const deEsteMes = v ? enMes(v) : (parseInt(t['Mes']) === mes && txt(t['Año']).includes(String(anio)))
    if (!deEsteMes) continue
    conResumen.add(norm(t['Tarjeta']))
    const usd = num(t['Monto USD'])
    items.push({
      id: 'TA:' + t.__row, hoja: 'TARJETAS', fila: t.__row, tipo: 'mano', fuente: 'Tarjetas',
      nombre: txt(t['Tarjeta']), det: `resumen de ${txt(t['Mes'])}/${txt(t['Año'])}${usd > 0 ? ` · más US$ ${Math.round(usd)}` : ''}`,
      dia: v ? v.getDate() : null, monto, cuenta: txt(t['Cuenta pago']), pagado, fechaPago: pagado ? txt(t['Fecha pago']) : '',
    })
  }
  // Las tarjetas en uso que no tienen resumen con vencimiento este mes: falta cargarlo.
  for (const nombre of (opts.tarjetasActivas || [])) {
    if (conResumen.has(norm(nombre))) continue
    const ult = tarj.filter(t => norm(t['Tarjeta']) === norm(nombre) && venceTarjeta(t)).sort((a, b) => venceTarjeta(b) - venceTarjeta(a))[0]
    items.push({
      id: 'FT:' + norm(nombre), tipo: 'falta', fuente: 'Tarjetas', nombre,
      det: `falta subir el resumen que vence este mes${ult ? ` · el último (venció el ${dm(venceTarjeta(ult))}) fue de $${Math.round(num(ult['Monto'])).toLocaleString('es-AR')}` : ''}`,
      dia: null, monto: 0, referencia: ult ? num(ult['Monto']) : 0, cuenta: ult ? txt(ult['Cuenta pago']) : '', pagado: false,
    })
  }

  // ---------- 4. Freelancers: el 15 se paga TODO lo del mes anterior, por persona
  {
    const mAnt = mes === 1 ? 12 : mes - 1, aAnt = mes === 1 ? anio - 1 : anio
    const pagos = data.pagosStaff || []
    const pago = (persona, t) => pagos.some(r => {
      if (norm(canon(r['Freelancer'])) !== norm(persona)) return false
      const est = txt(r['Estado'] || r['Pagado']).toUpperCase()
      if (!(['PAGADO', 'SÍ', 'SI', 'TRUE'].includes(est) || num(r['Monto Pagado']) > 0)) return false
      const rn = txt(r['N° Presupuesto']), tn = txt(t.nro)
      if (rn && tn) { if (rn !== tn) return false; const rs = norm(r['Servicio']), ts = norm(t.pedido); return rs && ts ? rs === ts : true }
      return norm(r['Proyecto']) === norm(t.proyecto)
    })
    const personas = {}
    for (const p of (data.proyectos || [])) {
      // En un trabajo de varias fechas cada línea de staff tiene SU día (col "Fechas Staff": "1:08/09/2026|2:09/09/2026").
      const diaDeSlot = {}; txt(p['Fechas Staff']).split('|').forEach(x => { const [k, ...v] = x.split(':'); if (k && v.length) diaDeSlot[k.trim()] = v.join(':').trim() })
      for (let j = 1; j <= maxSlots; j++) {
        const fe = fechaDe(diaDeSlot[String(j)] || p['Fecha Evento'])
        if (!fe || fe.getMonth() + 1 !== mAnt || fe.getFullYear() !== aAnt) continue
        const pedido = txt(p['Pedido ' + j] || (j === 1 ? p['Pedido'] : '')), precio = num(p['Precio ' + j] || (j === 1 ? p['Precio'] : ''))
        const staffRaw = txt(p['Staff ' + j] || (j === 1 ? p['Staff'] : ''))
        if (!staffRaw || staffRaw === 'Somos Magma' || !pedido || precio <= 0) continue
        const nombre = canon(staffRaw)
        if (esSocio(nombre)) continue   // lo de los socios va por la cuenta de socios
        const t = { nro: txt(p['N° presupuesto']), pedido, proyecto: txt(p['Proyecto'] || p['Cliente']) }
        if (pago(nombre, t)) continue
        const k = norm(nombre)
        personas[k] = personas[k] || { n: nombre, m: 0, trabajos: 0 }
        personas[k].m += precio; personas[k].trabajos++
      }
    }
    const lista = Object.values(personas).sort((a, b) => b.m - a.m)
    if (lista.length) {
      const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][mAnt - 1]
      items.push({
        id: 'ST:' + mAnt + '-' + aAnt, tipo: 'mano', fuente: 'Freelancers', link: 'pagos',
        nombre: `Freelancers de ${MES}`, det: `${lista.length} ${lista.length === 1 ? 'persona' : 'personas'} · sin viáticos, IVA ni horas extra: el número exacto y el pago están en Pagos Staff`,
        dia: 15, monto: lista.reduce((s, x) => s + x.m, 0), cuenta: nombresCuenta.find(n => /bbva|somos magma/i.test(n)) || '',
        pagado: false, partes: lista.map(x => ({ n: `${x.n} · ${x.trabajos} ${x.trabajos === 1 ? 'trabajo' : 'trabajos'}`, m: x.m })),
      })
    }
  }

  // ---------- 5. Lo que entra: facturas sin cobrar. Cada una entra el día que PROMETIERON pagarla; si no hay promesa, el día que vence.
  const real = f => !!(txt(f['Nro de Factura']) || txt(f['Fecha emision']))
  const cobrada = f => si(f['Cobrado'])
  const cobros = []
  for (const f of fc) {
    if (!real(f) || cobrada(f)) continue
    const saldo = Math.max(0, num(f['Precio FINAL']) - num(f['Monto cobrado'])); if (saldo <= 0) continue
    const venc = fechaDe(f['Vencimiento']), promesa = fechaDe(f['Prometió pagar'])
    cobros.push({
      fila: f.__row, nro: txt(f['N° Presupuesto']), agencia: grupoAgencia(f['Agencia'] || f['Cliente']), cliente: txt(f['Cliente']), proyecto: txt(f['Proyecto']),
      saldo, venc, promesa, esperada: promesa || venc, nota: txt(f['Nota cobranza']),
      vencida: !!venc && venc < hoy0,
    })
  }
  // Una agencia "viene atrasada" si hoy tiene algo vencido sin una promesa de pago vigente.
  const atrasadas = new Set(cobros.filter(c => c.vencida && !(c.promesa && c.promesa >= hoy0)).map(c => c.agencia))
  for (const c of cobros) {
    c.promesaVigente = !!c.promesa && c.promesa >= hoy0
    // Segura = con promesa vigente, o de una agencia que hoy no debe nada vencido.
    c.segura = c.promesaVigente || !atrasadas.has(c.agencia)
    // Vencida y sin promesa: nadie sabe cuándo entra. No se cuenta en lo que entra; va al aviso para reclamar.
    c.sinFecha = !c.esperada || (c.esperada < hoy0)
    c.dia = !c.sinFecha && enMes(c.esperada) ? c.esperada.getDate() : null
  }

  // ---------- Semanas y totales
  const sale = i => i.tipo === 'mano' || i.tipo === 'debito' || i.tipo === 'socios'
  const pendientes = items.filter(i => sale(i) && !i.pagado)
  const activasArs = cuentas.filter(c => c.activa && !c.usd)
  const cajaHoy = activasArs.reduce((s, c) => s + c.saldo, 0)
  const cobrosMes = cobros.filter(c => c.dia !== null)
  const semanas = semanasDelMes(mes, anio).map(s => {
    // Lo que quedó sin pagar de días anteriores no desapareció: se suma a la semana en curso.
    const cae = d => d >= s.desde && d <= s.hasta
    const esActual = esMesActual && hoy0.getDate() >= s.desde && hoy0.getDate() <= s.hasta
    const pasada = esMesActual && s.hasta < hoy0.getDate()
    const saleSem = pendientes.filter(i => i.dia !== null && (cae(i.dia) || (esActual && i.dia < s.desde))).reduce((a, i) => a + i.monto, 0)
    const ent = cobrosMes.filter(c => cae(c.dia))
    return { ...s, esActual, pasada, sale: pasada ? 0 : saleSem, entra: ent.reduce((a, c) => a + c.saldo, 0), entraSeguro: ent.filter(c => c.segura).reduce((a, c) => a + c.saldo, 0) }
  })
  let q = cajaHoy, qs = cajaHoy
  for (const s of semanas) { if (s.pasada) { s.queda = null; s.quedaSeguro = null; continue } q += s.entra - s.sale; qs += s.entraSeguro - s.sale; s.queda = q; s.quedaSeguro = qs }

  const suma = (a, f = x => x.monto) => a.reduce((s, x) => s + f(x), 0)
  const sinDia = pendientes.filter(i => i.dia === null)
  const totales = {
    cajaHoy,
    sale: suma(pendientes), mano: suma(pendientes.filter(i => i.tipo === 'mano')), debito: suma(pendientes.filter(i => i.tipo === 'debito')), socios: suma(pendientes.filter(i => i.tipo === 'socios')),
    nMano: pendientes.filter(i => i.tipo === 'mano').length, nDebito: pendientes.filter(i => i.tipo === 'debito').length,
    yaSalio: suma(items.filter(i => sale(i) && i.pagado)), delMes: suma(items.filter(sale)),
    sinDia: suma(sinDia), nSinDia: sinDia.length,
    entra: suma(cobrosMes, c => c.saldo), entraSeguro: suma(cobrosMes.filter(c => c.segura), c => c.saldo), nEntra: cobrosMes.length, nEntraSeguro: cobrosMes.filter(c => c.segura).length,
    vencidoSinFecha: suma(cobros.filter(c => c.vencida && c.sinFecha), c => c.saldo), nVencidoSinFecha: cobros.filter(c => c.vencida && c.sinFecha).length,
    despues: suma(cobros.filter(c => !c.sinFecha && c.dia === null), c => c.saldo), nDespues: cobros.filter(c => !c.sinFecha && c.dia === null).length,
    sinVencimiento: suma(cobros.filter(c => !c.esperada), c => c.saldo), nSinVencimiento: cobros.filter(c => !c.esperada).length,
    tarjetasFaltan: items.filter(i => i.tipo === 'falta').length, tarjetasReferencia: suma(items.filter(i => i.tipo === 'falta'), i => i.referencia || 0),
    atrasadosN, atrasadosMonto,
  }
  totales.termina = cajaHoy + totales.entra - totales.sale
  totales.terminaSeguro = cajaHoy + totales.entraSeguro - totales.sale

  // ---------- Por cuenta: ¿alcanza para lo que sale de acá a 7 días? (y lo que quedó sin pagar de antes)
  const limite = new Date(hoy0.getTime() + 7 * DIA)
  const fechaItem = i => i.dia === null ? null : new Date(anio, mes - 1, i.dia)
  for (const c of cuentas) {
    const prox = pendientes.filter(i => i.cuenta === c.nombre && i.tipo !== 'socios' && fechaItem(i) && fechaItem(i) <= limite)
    c.sale7 = suma(prox); c.nSale7 = prox.length
    c.resto = c.saldo - c.sale7
  }

  // ---------- Para revisar: datos que el sistema no puede resolver solo
  const revisar = []
  const recurrentes = items.filter(i => i.hoja === 'GASTOS_FIJOS' && !i.unico)
  recurrentes.filter(i => i.monto > 0 && i.monto <= 10).forEach(i => revisar.push({ id: i.id, t: i.nombre, d: `Está cargado en $${Math.round(i.monto)}. Falta el monto real.` }))
  recurrentes.filter(i => /\b(0?[1-9]|1[0-2])[-/]20\d\d\b/.test(i.nombre)).forEach(i => revisar.push({ id: i.id, t: i.nombre, d: 'Tiene un mes en el nombre pero está como gasto de todos los meses. Si es un pago puntual, se repite con un monto que ya no es.' }))
  gf.filter(g => (si(g['Activo']) || txt(g['Activo']) === '') && /anual/i.test(txt(g['Frecuencia'])) && !/^tarjeta$/i.test(txt(g['Medio de pago']))).forEach(g => revisar.push({ id: 'GF:' + g.__row, t: txt(g['Concepto']), d: 'Es un gasto anual pero aparece todos los meses.' }))
  const sinCuenta = pendientes.filter(i => i.tipo !== 'socios' && !i.cuenta && !i.link), sinDiaL = pendientes.filter(i => i.dia === null && i.hoja === 'GASTOS_FIJOS'), sinMedio = recurrentes.filter(i => i.sinMedio && i.tipo === 'mano')
  if (sinCuenta.length) revisar.push({ id: 'sin-cuenta', t: `${sinCuenta.length} ${sinCuenta.length === 1 ? 'pago sin cuenta' : 'pagos sin cuenta'}`, d: `No se sabe de dónde salen: ${sinCuenta.slice(0, 4).map(i => i.nombre).join(', ')}${sinCuenta.length > 4 ? '…' : ''}. Se elige al pagar y queda guardada.` })
  if (sinDiaL.length) revisar.push({ id: 'sin-dia', t: `${sinDiaL.length} ${sinDiaL.length === 1 ? 'gasto sin día de pago' : 'gastos sin día de pago'}`, d: `${sinDiaL.slice(0, 4).map(i => i.nombre).join(', ')}${sinDiaL.length > 4 ? '…' : ''}. Sin día no entran en ninguna semana.` })
  if (sinMedio.length) revisar.push({ id: 'sin-medio', t: `${sinMedio.length} gastos sin "Medio de pago"`, d: 'Los tomo como pago a mano. Los que se debitan solos hay que marcarlos como "Débito automático" en la solapa GASTOS_FIJOS.' })

  return { mes, anio, hoy0, esMesActual, items, cobros, cuentas, semanas, totales, revisar, atrasadas: [...atrasadas] }
}
