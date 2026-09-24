// lib/lunes.mjs — "El lunes de Magma": el reporte de la reunión semanal de los socios (Juan + Sofi, 30 minutos).
// Nadie escribe nada: la app arma el reporte del sheet y ellos solo lo miran y anotan los acuerdos.
// Lo pidieron en la cena del 23/09/2026 ("reuniones semanales con reportes: qué avanzó cada uno, qué puede
// opinar cada uno del lugar del otro") y Mariana lo pide desde la Práctica 5 (nunca se instaló).
//
// Una sola lógica para tres lugares:
//   · pages/api/lunes.js               → la página /lunes de la app (en vivo, al abrir) + guardar los acuerdos
//   · pages/api/cron/diaria/[aviso].js → el mail de los lunes 8:10 (Vercel). Va colgado del cron de la mañana
//                                        porque el plan Hobby de Vercel permite 2 crons y ya están usados.
//   · scripts/lunes.mjs                → lo mismo por consola (y para verificar los números antes de citarlos)
//
// Solo cálculo: no importa googleapis. Las solapas se leen afuera (FORMATTED_VALUE) y llegan en el orden de RANGOS_LUNES.
// El reparto "lo de Juan / lo de Sofi" es por la columna PM del sheet (PRESUPUESTOS col C, PROYECTOS col AZ,
// EDICION col AF): es lo único que está escrito fila por fila y no depende de ninguna discusión de áreas.
// Escribe al sheet (regla de oro #1): una fila por lunes en la solapa SEMANAL — la serie histórica semana a semana
// y los acuerdos de la reunión, que el lunes siguiente vuelven a aparecer para ver si se hicieron.
import { txt, num, fecha, esTrue, money, STAFF_COLS, PED_COLS, calcularBrief } from './brief.mjs'
import { calcularCuentaSocios, fraseSaldo } from './socios.mjs'
import { md2html, partesFecha } from './diaria-mail.mjs'

export const RANGOS_LUNES = ['PRESUPUESTOS', 'PROYECTOS', 'FACTURACION', 'EDICION', 'LOG', 'RRHH', 'SOCIOS_MOVIMIENTOS', 'MOVIMIENTOS_TARJETA', 'PRESTAMOS']
export const SOCIOS = ['Juan', 'Sofi']
export const PMS_EQUIPO = ['Lulu', 'Tomi']
// La seña del 30% es obligatoria desde la reunión Juan+Sofi del 18/08/2026. Se mide solo sobre lo presupuestado desde ahí.
const DESDE_SENA = new Date(2026, 7, 18)

const DIA = 86400000
const p2 = n => String(n).padStart(2, '0')
const fmtF = d => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`
const fmtFull = d => `${fmtF(d)}/${d.getFullYear()}`
// "Juan", "Juands", "juan " → Juan · "Sofi"/"Sofía" → Sofi · "Lulu" → Lulu · "Tom"/"Tomi" → Tomi
const canonPM = s => { const k = txt(s).toLowerCase(); if (!k) return ''; if (/^juan/.test(k)) return 'Juan'; if (/^sof/.test(k)) return 'Sofi'; if (/^lu/.test(k)) return 'Lulu'; if (/^tom/.test(k)) return 'Tomi'; return txt(s) }
const INTERNOS_EDITOR = [[/daniela.*ayala/i, 'Dani'], [/luc[ií]a.*grenier/i, 'Lulu'], [/sof[ií]a.*grenier/i, 'Sofi'], [/arauz/i, 'Juan']]
const nombreCorto = n => { const s = txt(n); for (const [re, c] of INTERNOS_EDITOR) if (re.test(s)) return c; const w = s.split(/\s+/); return w.length > 2 ? `${w[0]} ${w[w.length - 1]}` : s }
// El LOG guarda la hora en UTC (ISO). Para saber en qué semana cayó, hay que mirarla en hora argentina.
const diaArgentino = iso => { const d = new Date(iso); if (isNaN(d)) return null; const ar = new Date(d.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' })); return new Date(ar.getFullYear(), ar.getMonth(), ar.getDate()) }

// La semana que se revisa es la ÚLTIMA COMPLETA (lunes a domingo). Un lunes, es la que acaba de terminar;
// cualquier otro día también (para que el reporte diga lo mismo si se abre el martes).
export function semanaDe(ahora) {
  const hoy = new Date(ahora); hoy.setHours(0, 0, 0, 0)
  const dow = (hoy.getDay() + 6) % 7 // lunes = 0
  const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - dow)
  const desde = new Date(lunes); desde.setDate(lunes.getDate() - 7)
  const hasta = new Date(lunes); hasta.setDate(lunes.getDate() - 1)
  const lunesAnterior = new Date(desde)
  return { hoy, lunes, desde, hasta, lunesAnterior, clave: fmtFull(lunes), claveAnterior: fmtFull(lunesAnterior) }
}

const cnt = (arr, campo = 'monto') => ({ n: arr.length, monto: arr.reduce((s, x) => s + (x[campo] || 0), 0) })

// valores = las solapas en el orden de RANGOS_LUNES. ahora = Date en hora argentina.
export function calcularLunes([PRE, PRO, FAC, ED, LOG, RH, SM, MT, PST], ahora = new Date()) {
  const { hoy, lunes, desde, hasta, clave, claveAnterior } = semanaDe(ahora)
  const ANIO = hoy.getFullYear()
  const dias = d => Math.round((hoy - d) / DIA)
  const enSemana = d => !!d && d >= desde && d <= hasta
  const prox7 = d => !!d && d >= hoy && (d - hoy) / DIA < 7

  // PM por N°: manda PROYECTOS (es el trabajo real); si no está ahí, PRESUPUESTOS.
  const pmPorNro = new Map()
  PRE.slice(1).forEach(p => { const n = txt(p[0]); if (n && !pmPorNro.has(n)) pmPorNro.set(n, canonPM(p[2])) })
  PRO.slice(1).forEach(p => { const n = txt(p[2]); if (n && canonPM(p[51])) pmPorNro.set(n, canonPM(p[51])) })
  const pmDe = nro => pmPorNro.get(txt(nro)) || ''

  // El radar del día (por llamar, con PM) sale de la misma lógica que la diaria.
  const brief = calcularBrief({ PRE, PRO, FAC, RH }, ahora)

  // ===== PRESUPUESTOS: A N° · B Fecha evento · C PM · D Estado · E Agencia · F Cliente · G Proyecto · I Precio · J Fecha presupuesto
  const presus = PRE.slice(1).filter(p => txt(p[0])).map(p => ({ nro: txt(p[0]), fEvento: fecha(p[1]), pm: canonPM(p[2]), estado: txt(p[3]).toUpperCase(), cliente: txt(p[5]) || txt(p[4]), proyecto: txt(p[6]), monto: num(p[8]), fPresu: fecha(p[9]) }))
  const porNro = new Map(presus.map(p => [p.nro, p]))
  const enviados = presus.filter(p => enSemana(p.fPresu))
  const espera = presus.filter(p => /ESPERA|PENDIENTE/.test(p.estado) && p.fEvento && p.fEvento >= hoy)
  const zombis = presus.filter(p => /ESPERA|PENDIENTE/.test(p.estado) && p.fEvento && p.fEvento < hoy)
  // Aprobados la semana pasada: lo dice el LOG (presupuesto-estado → APROBADO), una vez por N°, y solo si HOY sigue aprobado.
  const aprobNros = new Set()
  LOG.slice(1).forEach(l => { if (txt(l[2]) !== 'presupuesto-estado' || !/^APROBADO$/i.test(txt(l[5]))) return; const d = diaArgentino(txt(l[0])); if (enSemana(d)) aprobNros.add(txt(l[4])) })
  const aprobados = [...aprobNros].map(n => porNro.get(n)).filter(p => p && /^APROBADO/.test(p.estado))
  // Seña del 30%: de lo presupuestado desde el 18/08 y aprobado, cuántos tienen "Cobrado 30%" tildado en FACTURACION.
  const conSena = presus.filter(p => /^APROBADO/.test(p.estado) && p.fPresu && p.fPresu >= DESDE_SENA)

  // ===== PROYECTOS: C N° · D Fecha evento · E Agencia · F Cliente · G Proyecto · H Total · AZ PM
  const proyectos = PRO.slice(1).filter(p => txt(p[2])).map(p => {
    const pedidos = PED_COLS.filter(c => txt(p[c])).length, conStaff = STAFF_COLS.filter(c => txt(p[c])).length
    return { nro: txt(p[2]), fEvento: fecha(p[3]), cliente: txt(p[5]) || txt(p[4]), proyecto: txt(p[6]), total: num(p[7]), pm: canonPM(p[51]), sinStaff: pedidos > 0 && conStaff === 0 }
  })
  const hechos = proyectos.filter(p => enSemana(p.fEvento))
  const vienen = proyectos.filter(p => prox7(p.fEvento)).sort((a, b) => a.fEvento - b.fEvento)
  const mes = proyectos.filter(p => p.fEvento && p.fEvento.getFullYear() === ANIO && p.fEvento.getMonth() === hoy.getMonth())

  // ===== FACTURACION: B N° · C Cobrado 30% · E Cobrado · F Fecha cobro · G Fecha evento · I Cliente · J Proyecto · M Precio FINAL · O N° Fc · P Emisión · T Vencimiento · AF Monto cobrado
  // Fecha Evento (col G) suele venir vacía en las facturas cargadas desde la app: si falta, la del proyecto o del presupuesto (mismo criterio que lib/brief.mjs)
  const eventoPorNro = new Map()
  presus.forEach(p => { if (p.fEvento && !eventoPorNro.has(p.nro)) eventoPorNro.set(p.nro, p.fEvento) })
  proyectos.forEach(p => { if (p.fEvento) eventoPorNro.set(p.nro, p.fEvento) })
  const facturas = FAC.slice(1).filter(f => txt(f[1]) || txt(f[8])).map(f => ({
    nro: txt(f[1]), cobrado: esTrue(f[4]), fCobro: fecha(f[5]), fEvento: fecha(f[6]) || eventoPorNro.get(txt(f[1])) || null, cliente: txt(f[8]) || txt(f[7]), proyecto: txt(f[9]),
    monto: num(f[12]), nroFc: txt(f[14]), fEmision: fecha(f[15]), venc: fecha(f[19]), cobradoMonto: num(f[31]) || num(f[12]), sena30: esTrue(f[2]), pm: pmDe(f[1]),
  }))
  const cobradas = facturas.filter(f => f.cobrado && enSemana(f.fCobro))
  const emitidas = facturas.filter(f => f.nroFc && enSemana(f.fEmision))
  const porCobrar = facturas.filter(f => !f.cobrado && f.monto > 0)
  const vencidas = porCobrar.filter(f => f.venc && f.venc < hoy).sort((a, b) => b.monto - a.monto)
  const sinEmitir = porCobrar.filter(f => !f.nroFc).sort((a, b) => b.monto - a.monto)
  const atrasadas = porCobrar.filter(f => f.fEvento && dias(f.fEvento) > 30)
  const senaCobrada = conSena.filter(p => facturas.some(f => f.nro === p.nro && f.sena30))

  // ===== EDICION (por nombre de header): una fila por entregable
  const eh = (ED[0] || []).map(h => txt(h)); const ec = n => eh.indexOf(n)
  const iEst = ec('Estado'), iEd = ec('Editor'), iPM = ec('PM'), iComp = ec('Fecha compromiso'), iEnt = ec('Fecha entrega'), iCli = ec('Cliente'), iEntg = ec('Entregable'), iFe = ec('Fecha Evento'), iNro = ec('N° presupuesto')
  const CERRADO = /^(Terminado|Aprobado|Entregado)$/i
  const piezas = ED.slice(1).filter(f => txt(f[0])).map(f => ({
    id: txt(f[0]), nro: txt(f[iNro]), cliente: txt(f[iCli]), entregable: txt(f[iEntg]).replace(/^[^\p{L}\p{N}]+/u, ''), editor: txt(f[iEd]), editorCorto: nombreCorto(f[iEd]),
    pm: canonPM(f[iPM]), estado: txt(f[iEst]) || 'Sin material', fEvento: fecha(f[iFe]), compromiso: fecha(f[iComp]), entrega: fecha(f[iEnt]), cerrada: CERRADO.test(txt(f[iEst])),
  }))
  // "Abierta" = no cerró y el evento ya pasó (una fila de un evento futuro está "Sin material" con razón)
  const edAbiertas = piezas.filter(p => !p.cerrada && (!p.fEvento || p.fEvento <= hoy))
  const edVencidas = edAbiertas.filter(p => p.compromiso && p.compromiso < hoy).sort((a, b) => a.compromiso - b.compromiso)
  const edParaRevisar = edAbiertas.filter(p => /^Para revisar$/i.test(p.estado))
  const edSinMaterial = edAbiertas.filter(p => /^Sin material$/i.test(p.estado) && p.fEvento && dias(p.fEvento) > 3)
  const edTerminadas = piezas.filter(p => p.cerrada && enSemana(p.entrega))

  // ===== por persona (columna PM)
  const porLlamarPM = {}
  Object.entries(brief.comercial?.porPM || {}).forEach(([pm, v]) => { const k = canonPM(pm) || '(sin PM)'; porLlamarPM[k] = porLlamarPM[k] || { n: 0, monto: 0 }; porLlamarPM[k].n += v.n; porLlamarPM[k].monto += v.monto })
  const listaLlamar = (brief.comercial?.lista || []).map(p => ({ ...p, pm: canonPM(p.pm) }))
  const persona = pm => {
    const mias = a => a.filter(x => x.pm === pm)
    const venc = mias(vencidas), edv = mias(edVencidas), viene = mias(vienen)
    return {
      pm,
      cobrado: cnt(mias(cobradas), 'cobradoMonto'), porCobrar: cnt(mias(porCobrar)), vencidas: cnt(venc), sinEmitir: cnt(mias(sinEmitir)),
      vencidasLista: venc.slice(0, 3).map(f => ({ cliente: f.cliente, proyecto: f.proyecto || `#${f.nro}`, monto: f.monto, dias: dias(f.venc) })),
      enviados: cnt(mias(enviados)), aprobados: cnt(mias(aprobados)), espera: cnt(mias(espera)), zombis: cnt(mias(zombis)),
      porLlamar: porLlamarPM[pm] || { n: 0, monto: 0 },
      porLlamarLista: listaLlamar.filter(p => p.pm === pm).slice(0, 3).map(p => ({ nro: p.nro, cliente: p.cliente, monto: p.monto, evento: p.evento, urgente: p.urgente })),
      aprobadosLista: mias(aprobados).slice(0, 3).map(p => ({ nro: p.nro, cliente: p.cliente, monto: p.monto })),
      hechos: cnt(mias(hechos), 'total'), vienen: cnt(viene, 'total'), vienenSinStaff: viene.filter(p => p.sinStaff).length,
      vienenLista: viene.slice(0, 4).map(p => ({ nro: p.nro, fecha: fmtF(p.fEvento), cliente: p.cliente, proyecto: p.proyecto, sinStaff: p.sinStaff })),
      edicion: { abiertas: mias(edAbiertas).length, vencidas: edv.length, paraRevisar: mias(edParaRevisar).length, sinMaterial: mias(edSinMaterial).length, terminadas: mias(edTerminadas).length,
        vencidasLista: edv.slice(0, 3).map(p => ({ id: p.id, cliente: p.cliente, entregable: p.entregable, editor: p.editorCorto || '(sin editor)', dias: dias(p.compromiso), estado: p.estado })) },
    }
  }
  const socios = SOCIOS.map(persona)
  const equipo = PMS_EQUIPO.map(persona)

  // ===== editores (quién tiene qué en la mesa)
  const ed = {}
  piezas.forEach(p => {
    if (!p.editor || /^somos\s*magma$/i.test(p.editor)) return
    const k = p.editorCorto; ed[k] = ed[k] || { nombre: k, abiertas: 0, vencidas: 0, editando: 0, terminadas: 0 }
    if (!p.cerrada && (!p.fEvento || p.fEvento <= hoy)) { ed[k].abiertas++; if (p.compromiso && p.compromiso < hoy) ed[k].vencidas++; if (/^Editando$/i.test(p.estado)) ed[k].editando++ }
    if (p.cerrada && enSemana(p.entrega)) ed[k].terminadas++
  })
  const editores = Object.values(ed).filter(e => e.abiertas || e.terminadas).sort((a, b) => b.abiertas - a.abiertas || b.terminadas - a.terminadas)

  // ===== cuenta de socios: la MISMA función que usa la app (lib/socios.mjs), nunca otro cálculo
  let cuentaSocios
  try {
    const c = calcularCuentaSocios([SM, MT, PST, PRO], ahora)
    cuentaSocios = { frases: c.socios.map(fraseSaldo), saldos: c.socios.map(s => ({ nombre: s.nombre, saldo: s.saldo })), tarjetasHasta: c.tarjetasCargadas.hasta }
  } catch (e) { cuentaSocios = { error: e.message, frases: [], saldos: [] } }

  const magma = {
    cobrado: cnt(cobradas, 'cobradoMonto'), emitidas: cnt(emitidas), porCobrar: cnt(porCobrar), vencidas: cnt(vencidas), atrasadas: cnt(atrasadas), sinEmitir: cnt(sinEmitir),
    enviados: cnt(enviados), aprobados: cnt(aprobados), espera: cnt(espera), zombis: cnt(zombis), porLlamar: { n: brief.comercial?.porLlamarN || 0, monto: brief.comercial?.porLlamarMonto || 0 },
    hechos: cnt(hechos, 'total'), vienen: cnt(vienen, 'total'), vienenSinStaff: vienen.filter(p => p.sinStaff).length, mes: cnt(mes, 'total'),
    sena: { de: conSena.length, cobradas: senaCobrada.length, desde: fmtF(DESDE_SENA) },
    edicion: { abiertas: edAbiertas.length, vencidas: edVencidas.length, paraRevisar: edParaRevisar.length, sinMaterial: edSinMaterial.length, terminadas: edTerminadas.length },
    vencidasLista: vencidas.slice(0, 5).map(f => ({ cliente: f.cliente, proyecto: f.proyecto || `#${f.nro}`, monto: f.monto, dias: dias(f.venc), pm: f.pm || '(sin PM)' })),
    sinEmitirLista: sinEmitir.slice(0, 5).map(f => ({ cliente: f.cliente, proyecto: f.proyecto || `#${f.nro}`, monto: f.monto, pm: f.pm || '(sin PM)' })),
    vienenLista: vienen.slice(0, 8).map(p => ({ nro: p.nro, fecha: fmtF(p.fEvento), cliente: p.cliente, proyecto: p.proyecto, pm: p.pm, sinStaff: p.sinStaff })),
    edVencidasLista: edVencidas.slice(0, 5).map(p => ({ id: p.id, cliente: p.cliente, entregable: p.entregable, editor: p.editorCorto || '(sin editor)', pm: p.pm, dias: dias(p.compromiso), estado: p.estado })),
  }

  // ===== la agenda de los 30 minutos: lo que más plata mueve primero, máximo 6 temas
  const quien = pm => pm && pm !== '(sin PM)' ? ` · ${pm}` : ''
  const agenda = []
  if (vencidas.length) agenda.push({ tema: `Plata vencida: ${money(magma.vencidas.monto)} en ${vencidas.length} facturas`, detalle: magma.vencidasLista.slice(0, 3).map(f => `${f.cliente} ${money(f.monto)} (venció hace ${f.dias}d${quien(f.pm)})`), pregunta: 'Quién llama a cada uno esta semana.' })
  if (sinEmitir.length) agenda.push({ tema: `Trabajo hecho sin factura: ${money(magma.sinEmitir.monto)} en ${sinEmitir.length}`, detalle: magma.sinEmitirLista.slice(0, 3).map(f => `${f.cliente} ${money(f.monto)}${quien(f.pm)}`), pregunta: 'Se emiten esta semana o se explica por qué no.' })
  if (magma.porLlamar.n) agenda.push({ tema: `Presupuestos esperando un llamado: ${magma.porLlamar.n} por ${money(magma.porLlamar.monto)}`, detalle: Object.entries(porLlamarPM).sort((a, b) => b[1].monto - a[1].monto).map(([pm, v]) => `${pm}: ${v.n} por ${money(v.monto)}`), pregunta: 'Cada uno llama los suyos antes del miércoles.' })
  if (edVencidas.length) agenda.push({ tema: `Edición pasada de fecha: ${edVencidas.length} piezas`, detalle: magma.edVencidasLista.slice(0, 3).map(p => `${p.cliente} · ${p.entregable} · ${p.editor} (hace ${p.dias}d${quien(p.pm)})`), pregunta: 'Nueva fecha o cambio de editor, hoy.' })
  if (magma.vienenSinStaff) agenda.push({ tema: `Eventos de esta semana sin staff: ${magma.vienenSinStaff} de ${vienen.length}`, detalle: magma.vienenLista.filter(p => p.sinStaff).slice(0, 3).map(p => `${p.fecha} ${p.cliente}${quien(p.pm)}`), pregunta: 'Se convoca hoy.' })
  if (conSena.length) agenda.push({ tema: `Seña del 30%: cobrada en ${senaCobrada.length} de ${conSena.length} presupuestos aprobados desde el ${fmtF(DESDE_SENA)}`, detalle: [], pregunta: senaCobrada.length ? '' : 'Es la regla del 18/08 y todavía no se cobró ni una.' })
  if (cuentaSocios.frases.length) agenda.push({ tema: 'Cuenta de socios', detalle: cuentaSocios.frases, pregunta: `Con tarjetas cargadas hasta ${cuentaSocios.tarjetasHasta}.` })

  return {
    generado: new Date(ahora).toISOString(),
    semana: { desde: fmtFull(desde), hasta: fmtFull(hasta), desdeCorto: fmtF(desde), hastaCorto: fmtF(hasta), lunes: fmtFull(lunes), clave, claveAnterior, esLunes: hoy.getDay() === 1 },
    titulo: `Semana del ${fmtF(desde)} al ${fmtF(hasta)}`,
    agenda: agenda.slice(0, 6), magma, socios, equipo, editores, cuentaSocios,
  }
}

// ---------- texto (consola y mail) ----------
const nm = c => `${money(c.monto)} (${c.n})`
function personaMarkdown(p, esSocio = true) {
  const L = [`## ${p.pm}`]
  L.push(`- **Plata:** cobró ${nm(p.cobrado)} · por cobrar ${nm(p.porCobrar)} · vencidas ${nm(p.vencidas)}${p.sinEmitir.n ? ` · sin factura ${nm(p.sinEmitir)}` : ''}`)
  p.vencidasLista.forEach(f => L.push(`  - vencida: ${f.cliente} — ${f.proyecto} · ${money(f.monto)} · hace ${f.dias}d`))
  L.push(`- **Comercial:** ${p.enviados.n} presupuestos enviados por ${money(p.enviados.monto)} · ${p.aprobados.n} aprobados por ${money(p.aprobados.monto)} · ${p.espera.n} en espera por ${money(p.espera.monto)} · **${p.porLlamar.n} por llamar**${p.zombis.n ? ` · ${p.zombis.n} zombis` : ''}`)
  p.porLlamarLista.forEach(x => L.push(`  - llamar: #${x.nro} ${x.cliente} · ${money(x.monto)} · evento ${x.evento}${x.urgente ? ' 🔴' : ''}`))
  L.push(`- **Eventos:** ${p.hechos.n} hechos la semana pasada por ${money(p.hechos.monto)} · ${p.vienen.n} esta semana${p.vienenSinStaff ? ` (**${p.vienenSinStaff} sin staff**)` : ''}`)
  p.vienenLista.forEach(x => L.push(`  - ${x.fecha} #${x.nro} ${x.cliente} — ${x.proyecto}${x.sinStaff ? ' 🔴 SIN STAFF' : ''}`))
  const e = p.edicion
  L.push(`- **Edición:** ${e.abiertas} abiertas · ${e.vencidas} pasadas de fecha · ${e.paraRevisar} esperan ${esSocio ? 'tu' : 'su'} OK · ${e.terminadas} terminadas la semana pasada`)
  e.vencidasLista.forEach(x => L.push(`  - ${x.cliente} · ${x.entregable} · ${x.editor} · ${x.estado} · hace ${x.dias}d`))
  return L.join('\n')
}
export function lunesMarkdown(d, acuerdosAnteriores = '') {
  const m = d.magma, L = []
  L.push(`# 🗓 El lunes de Magma — ${d.titulo}`, '')
  L.push('## Los 30 minutos')
  d.agenda.forEach((a, i) => { L.push(`- **${i + 1}. ${a.tema}**${a.pregunta ? ` — ${a.pregunta}` : ''}`); a.detalle.forEach(x => L.push(`  - ${x}`)) })
  L.push('', '## Acuerdos de la semana pasada')
  L.push(acuerdosAnteriores ? acuerdosAnteriores.split('\n').filter(Boolean).map(x => `- ${x}`).join('\n') + '\n\n¿Se hicieron? Lo que no, se decide hoy: se hace esta semana o se suelta.' : 'No quedó nada anotado. Los acuerdos de hoy se anotan en la app y aparecen acá el lunes que viene.')
  L.push('', '## Magma')
  L.push(`- **Plata:** cobrado ${nm(m.cobrado)} · facturado ${nm(m.emitidas)} · por cobrar ${nm(m.porCobrar)} · vencidas ${nm(m.vencidas)} · +30 días del evento ${nm(m.atrasadas)} · sin factura ${nm(m.sinEmitir)}`)
  L.push(`- **Comercial:** ${m.enviados.n} presupuestos enviados por ${money(m.enviados.monto)} · ${m.aprobados.n} aprobados por ${money(m.aprobados.monto)} · ${m.espera.n} en espera por ${money(m.espera.monto)} · ${m.porLlamar.n} por llamar${m.zombis.n ? ` · ${m.zombis.n} zombis` : ''}`)
  L.push(`- **Eventos:** ${m.hechos.n} hechos la semana pasada por ${money(m.hechos.monto)} · ${m.vienen.n} esta semana (${m.vienenSinStaff} sin staff) · ${m.mes.n} en el mes por ${money(m.mes.monto)}`)
  L.push(`- **Edición:** ${m.edicion.abiertas} abiertas · ${m.edicion.vencidas} pasadas de fecha · ${m.edicion.paraRevisar} esperan al PM · ${m.edicion.sinMaterial} sin material subido · ${m.edicion.terminadas} terminadas`)
  L.push(`- **Seña del 30%:** ${m.sena.cobradas} de ${m.sena.de} (presupuestos aprobados desde el ${m.sena.desde})`)
  if (d.cuentaSocios.frases.length) L.push(`- **Cuenta de socios:** ${d.cuentaSocios.frases.join(' · ')} (tarjetas cargadas hasta ${d.cuentaSocios.tarjetasHasta})`)
  d.socios.forEach(p => L.push('', personaMarkdown(p, true)))
  L.push('', '## Los chicos')
  d.equipo.forEach(p => L.push(`- **${p.pm} (PM):** ${p.espera.n} en espera · ${p.porLlamar.n} por llamar · ${p.vienen.n} eventos esta semana${p.vienenSinStaff ? ` (${p.vienenSinStaff} sin staff)` : ''} · edición ${p.edicion.abiertas} abiertas, ${p.edicion.vencidas} pasadas de fecha · vencidas ${nm(p.vencidas)}`))
  if (d.editores.length) L.push(`- **Editores:** ${d.editores.map(e => `${e.nombre} ${e.abiertas} abiertas${e.vencidas ? ` (${e.vencidas} vencidas)` : ''}, ${e.terminadas} terminadas`).join(' · ')}`)
  return L.join('\n')
}

// ---------- el mail ----------
export function armarMailLunes({ d, acuerdosAnteriores, ahoraAR, link, origen }) {
  const { ddmmyyyy, hhmm, fechaLarga } = partesFecha(ahoraAR)
  const md = lunesMarkdown(d, acuerdosAnteriores)
  const texto = [md, '---', `Abrí el lunes en la app (y anotá los acuerdos ahí): ${link}`, `Generado por ${origen} · ${ddmmyyyy} ${hhmm}`].join('\n\n')
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = `<!doctype html><html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.45;color:#111;max-width:680px;margin:0 auto;padding:16px">
<style>h1{font-size:22px;margin:18px 0 8px}h2{font-size:16px;margin:22px 0 6px;color:#CE2637}ul{margin:4px 0 8px 18px;padding:0}li{margin:3px 0}p{margin:4px 0}hr{border:0;border-top:1px solid #ddd;margin:16px 0}</style>
<a href="${link}" style="display:inline-block;background:#CE2637;color:#fff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:8px;font-size:15px">Abrir el lunes en la app →</a>
<p style="color:#777;font-size:12.5px;margin:8px 0 18px">Reunión de los lunes · ${esc(fechaLarga)}. Son 30 minutos: la agenda de arriba, en ese orden. Los acuerdos se anotan en la app y vuelven el lunes que viene.</p>
${md2html(md)}
<hr><p style="color:#777;font-size:12px"><a href="${link}" style="color:#1543F8">${link}</a> · generado ${ddmmyyyy} ${hhmm} por ${esc(origen)}</p>
</body></html>`
  return { subject: `🗓 El lunes de Magma — ${d.titulo}`, texto, html }
}

// ---------- la solapa SEMANAL (una fila por lunes) ----------
export const HEADERS_SEMANAL = ['Semana', 'Generado', 'Cobrado semana $', 'Facturado semana $', 'Por cobrar $', 'Vencidas $', 'Sin emitir $', 'En espera $', 'Presus enviados N', 'Aprobados N', 'Eventos semana N', 'Edición abierta N', 'Edición vencida N', 'Magma→Sofi $', 'Magma→Juan $', 'Acuerdos', 'Mail']
const COL_ACUERDOS = HEADERS_SEMANAL.indexOf('Acuerdos'), COL_MAIL = HEADERS_SEMANAL.indexOf('Mail')
const ULT = 'Q'

export async function asegurarSemanal(sheets, SHEET_ID) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties(title,sheetId)' })
  if (meta.data.sheets.find(s => s.properties.title === 'SEMANAL')) return
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [{ addSheet: { properties: { title: 'SEMANAL', gridProperties: { frozenRowCount: 1, columnCount: HEADERS_SEMANAL.length } } } }] } })
  await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: 'SEMANAL!A1', valueInputOption: 'USER_ENTERED', requestBody: { values: [HEADERS_SEMANAL] } })
}
export async function leerSemanal(sheets, SHEET_ID) {
  const d = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `SEMANAL!A:${ULT}`, valueRenderOption: 'FORMATTED_VALUE' })
  return (d.data.values || []).slice(1)
}
export const filaDe = (filas, clave) => filas.findIndex(x => txt(x[0]) === clave)
export const acuerdosDe = (filas, clave) => { const i = filaDe(filas, clave); return i === -1 ? '' : txt(filas[i][COL_ACUERDOS]) }
export const yaEnviadoLunes = (filas, clave) => { const i = filaDe(filas, clave); return i === -1 ? '' : (/^(mac|vercel)$/i.test(txt(filas[i][COL_MAIL])) ? txt(filas[i][COL_MAIL]) : '') }

// Los números de la semana, listos para la fila (sin Acuerdos ni Mail: esos se pisan aparte)
export function valoresSemanal(d, ahoraAR) {
  const { ddmmyyyy, hhmm } = partesFecha(ahoraAR)
  const m = d.magma, saldo = n => { const s = (d.cuentaSocios.saldos || []).find(x => x.nombre === n); return s ? Math.round(s.saldo) : '' }
  return [d.semana.clave, `${ddmmyyyy} ${hhmm}`, Math.round(m.cobrado.monto), Math.round(m.emitidas.monto), Math.round(m.porCobrar.monto), Math.round(m.vencidas.monto), Math.round(m.sinEmitir.monto), Math.round(m.espera.monto),
    m.enviados.n, m.aprobados.n, m.vienen.n, m.edicion.abiertas, m.edicion.vencidas, saldo('Sofi'), saldo('Juan')]
}
// Upsert por Semana: si la fila del lunes existe se pisan los números (y Acuerdos / Mail solo si vienen); si no, se agrega.
export async function guardarSemanal(sheets, SHEET_ID, { clave, valores, acuerdos, mail }) {
  const filas = await leerSemanal(sheets, SHEET_ID)
  const i = filaDe(filas, clave)
  const fila = new Array(HEADERS_SEMANAL.length).fill('')
  if (i > -1) filas[i].forEach((v, k) => { fila[k] = v ?? '' })
  if (valores) valores.forEach((v, k) => { fila[k] = v })
  if (acuerdos !== undefined) fila[COL_ACUERDOS] = acuerdos
  if (mail !== undefined) fila[COL_MAIL] = mail
  if (i > -1) await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `SEMANAL!A${i + 2}:${ULT}${i + 2}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [fila] } })
  else await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: `SEMANAL!A:${ULT}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [fila] } })
  return { actualizada: i > -1 }
}

// ---------- todo junto: leer, calcular, mandar, anotar ----------
// enviar: async ({ to, subject, text, html }) => void — o null para no mandar (dry). retry: withSheetsRetry o identidad.
export async function correrLunes({ sheets, SHEET_ID, ahoraAR, enviar, para, link, origen, dry = false, forzar = false, retry = fn => fn() }) {
  const { clave, claveAnterior } = semanaDe(ahoraAR)
  let filas = []
  try { filas = await retry(() => leerSemanal(sheets, SHEET_ID)) } catch { /* sin solapa todavía */ }
  const quien = yaEnviadoLunes(filas, clave)
  if (quien && !forzar) return { ok: true, enviado: false, motivo: `El lunes ${clave} ya lo mandó ${quien}.` }

  const r = await retry(() => sheets.spreadsheets.values.batchGet({ spreadsheetId: SHEET_ID, ranges: RANGOS_LUNES, valueRenderOption: 'FORMATTED_VALUE' }))
  const d = calcularLunes(r.data.valueRanges.map(v => v.values || []), ahoraAR)
  const acuerdosAnteriores = acuerdosDe(filas, claveAnterior)
  const { subject, texto, html } = armarMailLunes({ d, acuerdosAnteriores, ahoraAR, link, origen })
  if (dry || !enviar) return { ok: true, dry: true, enviaria: true, clave, para, subject, agenda: d.agenda.map(a => a.tema), texto, html }

  let mail = origen, fallo = null
  try { await enviar({ to: para, subject, text: texto, html }) }
  catch (e) { fallo = e.message; mail = `falló en ${origen}: ${e.message}`.slice(0, 200) }
  // Regla de oro #1: salga o no el mail, la semana queda anotada en SEMANAL (y los acuerdos que ya hubiera no se tocan)
  await retry(() => asegurarSemanal(sheets, SHEET_ID))
  await retry(() => guardarSemanal(sheets, SHEET_ID, { clave, valores: valoresSemanal(d, ahoraAR), mail }))
  if (fallo) return { ok: false, enviado: false, error: `No se pudo mandar el lunes: ${fallo}`, clave }
  return { ok: true, enviado: true, clave, para, subject }
}
