/**
 * HOY: la lista de tareas de administración, armada sola con lo que hay en el sheet.
 *
 * Quien hace administración entra y ve qué tiene que hacer, en el orden en que destraba plata:
 * primero lo que hace ENTRAR plata (facturar lo hecho, mandar lo cargado, reclamar lo vencido),
 * después lo que hay que PAGAR, después lo que falta CARGAR para que los números sean ciertos.
 *
 * Es cálculo puro, igual que lib/caja.mjs: recibe los datos y lo que calculó Caja, y devuelve la
 * lista. Así la pantalla, el mail de la diaria y un agente muestran las MISMAS tareas.
 *
 * Cada tarea: { id, titulo, sub, monto, n, tono, lista:[{t, d, m}], ir:{ donde, label } }
 *   tono    'entra' (trae plata) · 'sale' (hay que pagar) · 'falta' (hay que cargar un dato) · 'alerta' (no alcanza)
 *   ir      a dónde lleva el botón; la pantalla decide cómo navegar
 */
import { num, fechaDe, grupoAgencia } from './caja.mjs'
import { ticketsPendientes } from './tickets.mjs'

const txt = v => String(v ?? '').trim()
const si = v => v === true || /^(s[ií]|true)$/i.test(txt(v))
const DIA = 864e5
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`
const dm = d => `${d.getDate()}/${d.getMonth() + 1}`
// Las más grandes primero, y el resto resumido en un renglón: una tarea se tiene que leer de un vistazo.
const tope = (filas, max = 6) => filas.length <= max ? filas : [...filas.slice(0, max - 1), { t: `y ${filas.length - (max - 1)} más`, m: filas.slice(max - 1).reduce((s, x) => s + (x.m || 0), 0) }]

/**
 * @param data  lo que devuelve getAllData()
 * @param caja  lo que devuelve calcularCaja(data, …) para el mes en curso
 */
export function tareasDeHoy(data, caja) {
  const hoy0 = caja.hoy0
  const fc = data.facturacion || [], presus = data.presupuestos || []
  const real = f => !!(txt(f['Nro de Factura']) || txt(f['Fecha emision']))
  const tareas = []

  // ---------- 1. Facturar lo hecho: trabajos aprobados, con el evento ya pasado, que no tienen toda su factura
  // (mismo criterio que la vista "Por agencia" de Facturación: falta más del 5% del precio).
  const aprobado = p => ['APROBADO', 'EN CURSO', 'ENTREGADO'].includes(txt(p['Estado']).toUpperCase())
  const facturadoDe = {}
  fc.forEach(f => { if (!real(f) || /^ANULADA/i.test(txt(f['Nro de Factura']))) return; const n = txt(f['N° Presupuesto']); if (n) facturadoDe[n] = (facturadoDe[n] || 0) + (num(f['Precio SIN IVA']) || num(f['Precio FINAL'])) })
  // Trabajos para los que ya se pidió la orden de compra: no se pueden facturar hasta que el cliente los cargue en su sistema.
  const ocPedida = {}
  ;(data.ocPedidos || []).forEach(r => { const n = txt(r['N° Presupuesto']), d = fechaDe(r['Fecha pedido']); if (n && d && (!ocPedida[n] || d > ocPedida[n])) ocPedida[n] = d })
  const sinFacturar = presus.filter(aprobado).map(p => {
    const nro = txt(p['Columna 1']), neto = num(p['Precio Final']), ev = fechaDe(p['Fecha Evento'])
    return { nro, neto, pendiente: Math.max(0, neto - (facturadoDe[nro] || 0)), ev, agencia: grupoAgencia(p['Agencia'] || p['Cliente']) || '(sin agencia)' }
  }).filter(x => x.neto > 0 && x.pendiente > x.neto * 0.05 && !(x.ev && x.ev > hoy0))
  const porAgencia = (filas, monto) => { const m = {}; filas.forEach(x => { const a = m[x.agencia] = m[x.agencia] || { agencia: x.agencia, n: 0, m: 0, viejo: null }; a.n++; a.m += monto(x); const f = x.ev || x.venc; if (f && (!a.viejo || f < a.viejo)) a.viejo = f }); return Object.values(m).sort((a, b) => b.m - a.m) }
  const paraFacturar = sinFacturar.filter(x => !ocPedida[x.nro]), esperandoOC = sinFacturar.filter(x => ocPedida[x.nro])
  if (paraFacturar.length) {
    const ag = porAgencia(paraFacturar, x => x.pendiente)
    tareas.push({
      id: 'facturar', tono: 'entra', n: paraFacturar.length, monto: paraFacturar.reduce((s, x) => s + x.pendiente, 0),
      titulo: `Facturar ${plural(paraFacturar.length, 'trabajo ya hecho', 'trabajos ya hechos')}`,
      sub: `De ${plural(ag.length, 'agencia', 'agencias')}. Sin factura no hay vencimiento ni cobro.${esperandoOC.length ? ` Aparte hay ${plural(esperandoOC.length, 'trabajo que espera', 'trabajos que esperan')} la orden de compra del cliente.` : ''}`,
      lista: tope(ag.map(a => ({ t: a.agencia, d: `${plural(a.n, 'trabajo', 'trabajos')}${a.viejo ? ` · el más viejo es del ${dm(a.viejo)}` : ''}`, m: a.m }))),
      ir: { donde: 'facturar', label: 'Ir a facturar' },
    })
  }
  // La orden de compra pedida hace más de una semana y el trabajo sigue sin factura: hay que volver a pedirla.
  const ocViejas = esperandoOC.filter(x => (hoy0 - ocPedida[x.nro]) / DIA > 7)
  if (ocViejas.length) {
    const ag = porAgencia(ocViejas, x => x.pendiente)
    tareas.push({
      id: 'oc', tono: 'entra', n: ocViejas.length, monto: ocViejas.reduce((s, x) => s + x.pendiente, 0),
      titulo: `Reclamar la orden de compra de ${plural(ocViejas.length, 'trabajo', 'trabajos')}`,
      sub: 'Se pidió hace más de una semana y todavía no se pudo facturar.',
      lista: tope(ag.map(a => ({ t: a.agencia, d: plural(a.n, 'trabajo', 'trabajos'), m: a.m }))),
      ir: { donde: 'facturar', label: 'Ver los trabajos' },
    })
  }

  // ---------- 2. Mandar lo cargado: la factura está hecha pero no salió para el cliente
  const enviada = f => /^(TRUE|VERDADERO|SI|SÍ|X)$/i.test(txt(f['Fc Enviada'])) || !!txt(f['Fecha enviada'])
  const saldo = f => Math.max(0, num(f['Precio FINAL']) - num(f['Monto cobrado']))
  const sinEnviar = fc.filter(f => real(f) && !si(f['Cobrado']) && saldo(f) > 0 && !enviada(f)).map(f => ({ fila: f.__row, agencia: grupoAgencia(f['Agencia'] || f['Cliente']) || '(sin agencia)', m: saldo(f) }))
  if (sinEnviar.length) {
    const ag = porAgencia(sinEnviar, x => x.m)
    tareas.push({
      id: 'enviar', tono: 'entra', n: sinEnviar.length, monto: sinEnviar.reduce((s, x) => s + x.m, 0),
      titulo: `Mandar ${plural(sinEnviar.length, 'factura cargada', 'facturas cargadas')}`,
      sub: 'Están cargadas pero no figura que hayan salido. Si ya salieron, se marcan de a varias.',
      lista: tope(ag.map(a => ({ t: a.agencia, d: plural(a.n, 'factura', 'facturas'), m: a.m }))),
      ir: { donde: 'enviar', label: 'Ir a mandarlas' },
    })
  }

  // ---------- 3. Reclamar lo vencido: venció y nadie dijo cuándo paga (o dijo, y esa fecha también pasó)
  const vencidas = (caja.cobros || []).filter(c => c.vencida && !c.promesaVigente)
  if (vencidas.length) {
    const ag = porAgencia(vencidas, c => c.saldo)
    const incumplidas = vencidas.filter(c => c.promesa).length
    const conPromesa = (caja.cobros || []).filter(c => c.vencida && c.promesaVigente).length
    tareas.push({
      id: 'reclamar', tono: 'entra', n: vencidas.length, monto: vencidas.reduce((s, c) => s + c.saldo, 0),
      titulo: `Reclamar ${plural(vencidas.length, 'factura vencida', 'facturas vencidas')}`,
      sub: `A ${plural(ag.length, 'agencia', 'agencias')}. Al hablar, anotá la fecha que prometan: desde ahí Caja la cuenta.${incumplidas ? ` ${plural(incumplidas, 'ya tenía fecha prometida y no se cumplió', 'ya tenían fecha prometida y no se cumplió')}.` : ''}${conPromesa ? ` No se cuentan ${plural(conPromesa, 'vencida que ya tiene', 'vencidas que ya tienen')} fecha prometida.` : ''}`,
      lista: tope(ag.map(a => ({ t: a.agencia, d: `${plural(a.n, 'factura', 'facturas')}${a.viejo ? ` · la más vieja venció el ${dm(a.viejo)}` : ''}`, m: a.m }))),
      ir: { donde: 'reclamar', label: 'Ir a reclamar' },
    })
  }

  // ---------- 4. Pagar: lo que hay que transferir a mano y ya llegó su día (lo de días anteriores no desapareció)
  if (caja.esMesActual) {
    const dia = hoy0.getDate()
    const aMano = (caja.items || []).filter(i => i.tipo === 'mano' && !i.pagado && i.dia !== null)
    const hoy = aMano.filter(i => i.dia <= dia)
    // Hasta el domingo de esta semana (o fin de mes, lo que llegue primero)
    const finSemana = Math.min(new Date(hoy0.getFullYear(), hoy0.getMonth() + 1, 0).getDate(), dia + ((7 - hoy0.getDay()) % 7))
    const semana = aMano.filter(i => i.dia > dia && i.dia <= finSemana)
    const fila = i => ({ t: i.nombre, d: `${i.atrasado ? (txt(i.det).split(' · ')[0] || 'vencido') : i.dia < dia ? `era el ${i.dia}` : i.dia === dia ? 'hoy' : `el ${i.dia}`}${i.cuenta ? ` · de ${i.cuenta}` : ' · falta elegir la cuenta'}`, m: i.monto })
    if (hoy.length) tareas.push({
      id: 'pagar-hoy', tono: 'sale', n: hoy.length, monto: hoy.reduce((s, i) => s + i.monto, 0),
      titulo: hoy.length === 1 ? `Pagar hoy: ${hoy[0].nombre}` : `Pagar hoy: ${hoy.length} pagos que vencen hoy o ya vencieron`,
      sub: 'Son pagos a mano: alguien tiene que hacer la transferencia y marcar "Pagué".',
      lista: tope(hoy.sort((a, b) => b.monto - a.monto).map(fila)), ir: { donde: 'caja', label: 'Ir a pagar' },
    })
    if (semana.length) tareas.push({
      id: 'pagar-semana', tono: 'sale', n: semana.length, monto: semana.reduce((s, i) => s + i.monto, 0),
      titulo: `Tener listo: ${plural(semana.length, 'pago', 'pagos')} de acá al domingo`,
      sub: 'Todavía no vencieron. Sirve para saber cuánta plata tiene que haber en cada cuenta.',
      lista: tope(semana.sort((a, b) => a.dia - b.dia).map(fila)), ir: { donde: 'caja', label: 'Ver la semana' },
    })

    // ---------- 5. No alcanza: en una cuenta sale más de lo que hay, de acá a 7 días
    const cortas = (caja.cuentas || []).filter(c => c.activa && !c.usd && c.nSale7 > 0 && c.resto < 0)
    if (cortas.length) tareas.push({
      id: 'no-alcanza', tono: 'alerta', n: cortas.length, monto: cortas.reduce((s, c) => s - c.resto, 0),
      titulo: `Avisar: no alcanza en ${cortas.map(c => c.nombre).join(' ni en ')}`,
      sub: 'Con lo que hay hoy no se cubre lo que sale en los próximos 7 días. Hay que pasar plata o correr un pago.',
      lista: cortas.map(c => ({ t: c.nombre, d: `hay $${Math.round(c.saldo).toLocaleString('es-AR')} y salen $${Math.round(c.sale7).toLocaleString('es-AR')}`, m: -c.resto })),
      ir: { donde: 'caja', label: 'Ver las cuentas' },
    })
  }

  // ---------- 6. Cargar lo que falta para que los números sean ciertos
  // El extracto del banco: es lo que marca solos los pagos y los cobros, y trae el saldo real. La app lee BBVA, Santander y Galicia.
  const ultimoMov = {}
  ;(data.movimientosBanco || []).forEach(r => { const d = fechaDe(r['Fecha']), c = txt(r['Cuenta']); if (d && c && (!ultimoMov[c] || d > ultimoMov[c])) ultimoMov[c] = d })
  const sinExtracto = (data.cuentas || []).filter(c => si(c['Activa']) && /bbva|santander|galicia/i.test(txt(c['Banco']) + txt(c['Nombre']))).map(c => ({ nombre: txt(c['Nombre']), d: ultimoMov[txt(c['Nombre'])] || null })).filter(x => !x.d || (hoy0 - x.d) / DIA > 3)
  if (sinExtracto.length) tareas.push({
    id: 'extracto', tono: 'falta', n: sinExtracto.length, monto: 0,
    titulo: `Subir el extracto de ${sinExtracto.map(x => x.nombre).join(' y de ')}`,
    sub: 'Con el extracto la app marca sola lo que se pagó y lo que se cobró, y copia el saldo real.',
    lista: sinExtracto.map(x => ({ t: x.nombre, d: x.d ? `el último movimiento cargado es del ${dm(x.d)}` : 'todavía no se subió ninguno', m: 0 })),
    ir: { donde: 'subir-extracto', label: 'Subir extracto' },
  })
  // Lo que el extracto no pudo unir solo: hay que decir qué es cada movimiento (pestaña Banco)
  const sinUnir = (data.movimientosBanco || []).filter(r => txt(r['Estado']) === 'Para revisar').map(r => ({ t: txt(r['Detalle']) || txt(r['Concepto']), d: `${txt(r['Fecha'])} · ${txt(r['Cuenta'])}`, entro: num(r['Entró']), salio: num(r['Salió']) }))
  if (sinUnir.length) {
    const entro = sinUnir.filter(x => x.entro > 0)
    tareas.push({
      id: 'banco', tono: 'falta', n: sinUnir.length, monto: entro.reduce((s, x) => s + x.entro, 0),
      titulo: `Revisar ${plural(sinUnir.length, 'movimiento del banco', 'movimientos del banco')}`,
      sub: `El extracto no pudo unirlos solo. ${entro.length ? `${plural(entro.length, 'es plata que entró', 'son plata que entró')} y no se sabe de qué factura: puede haber facturas cobradas que la app sigue reclamando.` : ''}`,
      lista: tope(entro.sort((a, b) => b.entro - a.entro).map(x => ({ t: x.t, d: x.d, m: x.entro }))),
      ir: { donde: 'banco', label: 'Revisar' },
    })
  }
  // Los tickets que cargaron los chicos desde Mi Magma: hay que mirarlos para que entren en el pago del 15
  const tk = ticketsPendientes(data.tickets)
  if (tk.length) tareas.push({
    id: 'tickets', tono: 'falta', n: tk.length, monto: tk.reduce((s, r) => s + num(r['Monto']), 0),
    titulo: `Revisar ${plural(tk.length, 'ticket de los chicos', 'tickets de los chicos')}`,
    sub: 'Gastos que adelantaron en un trabajo. Al aprobarlos se suman a sus viáticos en Pagos Staff y se pagan el 15.',
    lista: tope(tk.map(r => ({ t: `${txt(r['Persona'])} · ${txt(r['Qué fue'])}`, d: `#${txt(r['N° trabajo'])} ${txt(r['Trabajo'])}`.slice(0, 70), m: num(r['Monto']) }))),
    ir: { donde: 'tickets', label: 'Revisar' },
  })
  const faltanTarjetas = (caja.items || []).filter(i => i.tipo === 'falta')
  if (faltanTarjetas.length) tareas.push({
    id: 'tarjetas', tono: 'falta', n: faltanTarjetas.length, monto: caja.totales?.tarjetasReferencia || 0, montoAprox: true,
    titulo: faltanTarjetas.length === 1 ? `Subir el resumen de ${faltanTarjetas[0].nombre} que vence este mes` : `Subir ${faltanTarjetas.length} resúmenes de tarjeta que vencen este mes`,
    sub: 'Sin el resumen cargado Caja no sabe cuánto hay que pagar de tarjeta. El monto es el del último resumen, como referencia.',
    lista: faltanTarjetas.map(i => ({ t: i.nombre, d: i.det || '', m: i.referencia || 0 })),
    ir: { donde: 'subir-tarjeta', label: 'Subir resumen' },
  })
  // La fecha que vale es la última vez que alguien cargó el saldo mirando el banco (última línea de "Hist saldos"),
  // igual que el aviso del Dashboard: los pagos que restan solos también tocan "Última actualización".
  const chequeo = {}
  ;(data.cuentas || []).forEach(c => { const l = txt(c["Hist saldos"]).split("\n").filter(Boolean).pop() || ""; chequeo[txt(c["Nombre"])] = fechaDe(l) || fechaDe(c["Última actualización"]) })
  const viejas = (caja.cuentas || []).filter(c => c.activa && !c.usd).map(c => ({ c, d: chequeo[c.nombre] || null })).filter(x => !x.d || (hoy0 - x.d) / DIA > 2)
  if (viejas.length) tareas.push({
    id: 'saldos', tono: 'falta', n: viejas.length, monto: 0,
    titulo: `Actualizar el saldo de ${plural(viejas.length, 'cuenta', 'cuentas')}`,
    sub: 'Hace más de 2 días que nadie los mira contra el banco. Todo lo que dice Caja arranca de estos saldos.',
    lista: viejas.map(x => ({ t: x.c.nombre, d: x.d ? `último saldo del ${dm(x.d)}` : 'sin fecha de actualización', m: 0 })),
    ir: { donde: 'saldos', label: 'Actualizar saldos' },
  })
  if ((caja.totales?.atrasadosN || 0) > 0) tareas.push({
    id: 'viejos', tono: 'falta', n: caja.totales.atrasadosN, monto: caja.totales.atrasadosMonto || 0,
    titulo: `Marcar ${plural(caja.totales.atrasadosN, 'pago de un mes anterior', 'pagos de meses anteriores')}`,
    sub: 'Son cuotas y resúmenes que figuran sin pagar. Si ya salieron, se marcan en el mes que corresponde.',
    lista: [], ir: { donde: 'detalle', label: 'Ir al detalle' },
  })

  // ---------- 7. Lo que el sistema no puede resolver solo: hay que preguntarlo
  const dudas = caja.revisar || []
  if (dudas.length) tareas.push({
    id: 'revisar', tono: 'falta', n: dudas.length, monto: 0,
    titulo: `Preguntar ${plural(dudas.length, 'dato que falta', 'datos que faltan')}`,
    sub: 'Con estos datos mal, el número de Caja no es exacto.',
    lista: dudas.map(r => ({ t: r.t, d: r.d, m: 0 })), ir: { donde: 'detalle', label: 'Corregirlos' },
  })

  // Cuánta plata destraban las tareas que traen plata. Una factura puede estar sin enviar Y vencida: se cuenta una sola vez.
  const entra = tareas.filter(t => t.tono === 'entra')
  const porFactura = {}
  sinEnviar.forEach(x => { porFactura[x.fila] = x.m })
  vencidas.forEach(c => { porFactura[c.fila] = c.saldo })
  const porDestrabar = sinFacturar.reduce((s, x) => s + x.pendiente, 0) + Object.values(porFactura).reduce((s, m) => s + m, 0)
  return { tareas, nEntra: entra.length, porDestrabar }
}
