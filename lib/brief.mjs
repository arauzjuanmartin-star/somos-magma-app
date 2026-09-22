// lib/brief.js — el radar del día. Una sola lógica para tres lugares:
//   · scripts/morning-brief.mjs  (terminal, /brief)
//   · scripts/diaria.mjs         (el mail de las 8 y el de las 15)
//   · pages/api/diaria.js        (la página /diaria de la app)
// Solo cálculo: no toca googleapis. Recibe las 4 solapas ya leídas (FORMATTED_VALUE).

export const ERR = /^#(ERROR!|REF!|N\/A|VALUE!|NAME\?|DIV\/0!|NUM!|NULL!)/
export const txt = v => { const s = String(v ?? '').trim(); return ERR.test(s) ? '' : s }
// "$3,107,905.00" -> 3107905 | "- $4,596" -> -4596 (el sheet guarda los montos en formato US)
export const num = v => { const s = txt(v).replace(/\s/g, ''); if (!s) return 0; const neg = /^-|^\(.*\)$/.test(s); const n = parseFloat(s.replace(/[^\d.]/g, '')) || 0; return neg ? -n : n }
// "22/6/2026" -> Date. También "2026-09-16": así guarda la app la Fecha Presupuesto de las filas nuevas.
export const fecha = v => { const s = txt(v); const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]); const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (!m) return null; let y = +m[3]; if (y < 100) y += 2000; const d = new Date(y, +m[2] - 1, +m[1]); return isNaN(d) ? null : d }
export const esTrue = v => /^(TRUE|VERDADERO|SI|SÍ|X)$/i.test(txt(v))
export const money = n => '$' + Math.round(n || 0).toLocaleString('es-AR')

const DIA = 86400000
const fmtF = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
const fmtFull = d => `${fmtF(d)}/${d.getFullYear()}`
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado']

// Slots de PROYECTOS: pedido (servicio) y staff van de a pares; los primeros 13 y después del salto de columnas
export const STAFF_COLS = [13,16,19,22,25,28,31,34,37,40,43,46,49,62,65,68,71,74,77,80,83]
export const PED_COLS   = [11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
// Equipo interno + el atajo "$1 a Somos Magma" (fee agencia) no son freelancers a pagar (mismo criterio que pagos-staff-respuestas)
const EQUIPO_INTERNO = [/arauz/i, /grenier\s+basavilbaso/i, /somos\s*magma/i]
const esInterno = n => EQUIPO_INTERNO.some(re => re.test(String(n || '')))
// A los cuántos días sin noticias hay que volver a llamar por un presupuesto (acordado 18/08/2026).
// Mismo valor que DIAS_SEGUIMIENTO en lib/slots.js; no se importa de ahí para que Node no avise
// por el tipo de módulo cada vez que corre la diaria.
const DIAS_SEGUIMIENTO = 4
// Con el evento a esta distancia o menos, un presupuesto sin respuesta es urgente: o lo tiene otro o lo resuelven sin video.
const DIAS_EVENTO_URGENTE = 14

export function calcularBrief({ PRE, PRO, FAC, RH }, ahora = new Date()) {
  const hoy = new Date(ahora); hoy.setHours(0, 0, 0, 0)
  const ANIO = hoy.getFullYear()
  const dias = d => Math.round((hoy - d) / DIA)

  // ===== 1. PIPELINE — PRESUPUESTOS: A[0]N° B[1]FechaEvento C[2]PM D[3]Estado E[4]Agencia F[5]Cliente G[6]Proyecto I[8]PrecioFinal
  const presus = PRE.slice(1).filter(p => txt(p[0])).map(p => ({
    nro: txt(p[0]), fEvento: fecha(p[1]), estado: txt(p[3]).toUpperCase(),
    agencia: txt(p[4]), cliente: txt(p[5]), proyecto: txt(p[6]), monto: num(p[8]), pm: txt(p[2]),
  }))
  const delAnio = presus.filter(p => p.fEvento && p.fEvento.getFullYear() === ANIO)
  const espera = delAnio.filter(p => /ESPERA|PENDIENTE/.test(p.estado))
  const aprob = delAnio.filter(p => /APROBADO/.test(p.estado) && !/DESAPROBADO/.test(p.estado))
  const nrosProy = new Set(PRO.slice(1).map(p => txt(p[2])).filter(Boolean))
  const sinProyecto = aprob.filter(p => !nrosProy.has(p.nro))
  const suma = a => a.reduce((s, x) => s + x.monto, 0)

  // ===== 1b. COMERCIAL — a quién hay que volver a llamar hoy.
  // Las columnas del seguimiento (Último contacto · Próximo paso · Seguir el, DQ-DS) se buscan por
  // nombre. El reloj arranca en el último contacto; si nunca se llamó, en la fecha del presupuesto.
  // "Toca" = pasó el día 4 sin noticias, o llegó la fecha que se dejó en "Seguir el".
  // Cuenta todo lo EN ESPERA con el evento por delante, sea del año que sea (la gira de Total es 2027).
  const H = (PRE[0] || []).map(h => txt(h))
  const col = n => H.indexOf(n)
  const iUlt = col('Último contacto'), iPaso = col('Próximo paso'), iSeg = col('Seguir el'), iFp = col('Fecha Presupuesto'), iCon = col('Contacto')
  const vivos = PRE.slice(1).filter(p => txt(p[0]) && /ESPERA|PENDIENTE/.test(txt(p[3]).toUpperCase())).map(p => {
    const fEvento = fecha(p[1]), fPresu = iFp > -1 ? fecha(p[iFp]) : null
    const ultimo = iUlt > -1 ? fecha(p[iUlt]) : null, seguir = iSeg > -1 ? fecha(p[iSeg]) : null
    const base = ultimo || fPresu
    const diasBase = base ? dias(base) : null
    const toca = seguir ? seguir <= hoy : (diasBase === null ? true : diasBase >= DIAS_SEGUIMIENTO)
    return { nro: txt(p[0]), fEvento, diasEvento: fEvento ? -dias(fEvento) : null, cliente: txt(p[5]) || txt(p[4]), agencia: txt(p[4]), proyecto: txt(p[6]), monto: num(p[8]), pm: txt(p[2]),
      contacto: iCon > -1 ? txt(p[iCon]) : '', ultimo, diasUltimo: ultimo ? dias(ultimo) : null, diasPresu: fPresu ? dias(fPresu) : null, seguir, paso: iPaso > -1 ? txt(p[iPaso]) : '', toca }
  }).filter(p => p.fEvento && p.fEvento >= hoy)
  const porLlamar = vivos.filter(p => p.toca)
  const urgentes = porLlamar.filter(p => p.diasEvento <= DIAS_EVENTO_URGENTE)
  // Primero los que se mueren (evento más cercano), después por plata
  porLlamar.sort((a, b) => { const ua = a.diasEvento <= DIAS_EVENTO_URGENTE, ub = b.diasEvento <= DIAS_EVENTO_URGENTE; if (ua && !ub) return -1; if (!ua && ub) return 1; if (ua && ub) return a.diasEvento - b.diasEvento; return b.monto - a.monto })
  const porPM = {}; porLlamar.forEach(p => { const k = p.pm || '(sin PM)'; porPM[k] = porPM[k] || { n: 0, monto: 0 }; porPM[k].n++; porPM[k].monto += p.monto })

  // ===== 2. PRÓXIMOS 7 DÍAS — PROYECTOS: C[2]N° D[3]FechaEvento E[4]Agencia F[5]Cliente G[6]Proyecto H[7]Total AZ[51]PM
  const proyectos = PRO.slice(1).filter(p => txt(p[2])).map(p => {
    const pedidos = PED_COLS.filter(c => txt(p[c])).length
    const conStaff = STAFF_COLS.filter(c => txt(p[c])).length
    return { nro: txt(p[2]), fEvento: fecha(p[3]), agencia: txt(p[4]), cliente: txt(p[5]), proyecto: txt(p[6]), total: num(p[7]), pm: txt(p[51]),
      pedidos, conStaff, sinStaff: pedidos > 0 && conStaff === 0, staffParcial: pedidos > 0 && conStaff > 0 && conStaff < pedidos }
  })
  const en7 = proyectos.filter(p => p.fEvento && p.fEvento >= hoy && (p.fEvento - hoy) / DIA <= 7).sort((a, b) => a.fEvento - b.fEvento)
  const en7SinStaff = en7.filter(p => p.sinStaff)

  // ===== 3. FACTURACIÓN — B[1]N° E[4]Cobrado G[6]FechaEvento H[7]Agencia I[8]Cliente J[9]Proyecto M[12]PrecioFINAL O[14]N°Fc T[19]Vencimiento
  const facturas = FAC.slice(1).filter(f => txt(f[1]) || txt(f[8])).map(f => ({
    nro: txt(f[1]), cobrado: esTrue(f[4]), fEvento: fecha(f[6]), agencia: txt(f[7]), cliente: txt(f[8]), proyecto: txt(f[9]),
    monto: num(f[12]), venc: fecha(f[19]), nroFc: txt(f[14]),
  }))
  const porCobrar = facturas.filter(f => !f.cobrado && f.monto > 0)
  const atrasadas = porCobrar.filter(f => f.fEvento && dias(f.fEvento) > 30).sort((a, b) => dias(b.fEvento) - dias(a.fEvento))
  const vencenSemana = porCobrar.filter(f => f.venc && f.venc >= hoy && (f.venc - hoy) / DIA <= 7).sort((a, b) => a.venc - b.venc)
  const vencidas = porCobrar.filter(f => f.venc && f.venc < hoy).sort((a, b) => a.venc - b.venc)
  const quien = f => f.cliente || f.agencia

  // ===== 4. STAFF — RRHH: A[0]Nombre K[10]CBU. "Activos" = aparecen en proyectos del mes en curso
  const cbuPorNombre = new Map(RH.slice(1).map(x => [txt(x[0]).toLowerCase(), txt(x[10])]))
  const activos = new Set()
  PRO.slice(1).forEach(p => { const fe = fecha(p[3]); if (!fe || fe.getFullYear() !== ANIO || fe.getMonth() !== hoy.getMonth()) return; STAFF_COLS.forEach(c => { const n = txt(p[c]); if (n) activos.add(n) }) })
  const sinCBU = [...activos].filter(n => { if (esInterno(n)) return false; const cbu = cbuPorNombre.get(n.toLowerCase()); return cbu === undefined || cbu === '' })

  // ===== ALERTAS (máximo 5, en orden de gravedad)
  const alertas = []
  if (vencidas.length) alertas.push(`❌ **${vencidas.length} facturas vencidas sin cobrar** por ${money(suma(vencidas))} — la más vieja: ${quien(vencidas[0])} venció hace ${dias(vencidas[0].venc)} días`)
  if (atrasadas.length) alertas.push(`🔥 **${atrasadas.length} facturas +30d desde el evento** por ${money(suma(atrasadas))} — top: ${quien(atrasadas[0])} (${dias(atrasadas[0].fEvento)} días, ${money(atrasadas[0].monto)})`)
  if (urgentes.length) alertas.push(`📞 **${urgentes.length} presupuestos con el evento en ${DIAS_EVENTO_URGENTE} días o menos y sin respuesta** por ${money(suma(urgentes))} — ${urgentes.slice(0, 3).map(p => `#${p.nro} ${p.cliente} (${fmtF(p.fEvento)})`).join(', ')}`)
  if (en7SinStaff.length) alertas.push(`👥 **${en7SinStaff.length} proyectos en los próximos 7 días SIN staff cargado** — ${en7SinStaff.slice(0, 3).map(p => `#${p.nro} ${p.cliente || p.agencia} (${fmtF(p.fEvento)})`).join(', ')}`)
  if (sinProyecto.length) alertas.push(`⚠️ **${sinProyecto.length} presus APROBADOS sin proyecto cargado** por ${money(suma(sinProyecto))} — trabajo confirmado que no está en PROYECTOS`)
  if (sinCBU.length) alertas.push(`🏦 **${sinCBU.length} freelancers activos este mes sin CBU** — no se les puede pagar`)

  return {
    generado: new Date(ahora).toISOString(), hoy: fmtFull(hoy), anio: ANIO,
    titulo: `${DIAS[hoy.getDay()]} ${hoy.getDate()} de ${MESES[hoy.getMonth()]} ${ANIO}`,
    alertas: alertas.slice(0, 5),
    pipeline: { esperaN: espera.length, esperaMonto: suma(espera), aprobN: aprob.length, aprobMonto: suma(aprob), sinProyectoN: sinProyecto.length, sinProyectoMonto: suma(sinProyecto) },
    comercial: {
      diasSeguimiento: DIAS_SEGUIMIENTO, diasUrgente: DIAS_EVENTO_URGENTE, hayColumnas: iUlt > -1,
      vivosN: vivos.length, vivosMonto: suma(vivos), porLlamarN: porLlamar.length, porLlamarMonto: suma(porLlamar), urgentesN: urgentes.length, urgentesMonto: suma(urgentes),
      porPM,
      lista: porLlamar.slice(0, 40).map(p => ({ nro: p.nro, cliente: p.cliente, agencia: p.agencia, proyecto: p.proyecto || '(sin nombre)', monto: p.monto, pm: p.pm, contacto: p.contacto,
        evento: fmtF(p.fEvento), diasEvento: p.diasEvento, urgente: p.diasEvento <= DIAS_EVENTO_URGENTE,
        nunca: !p.ultimo, diasUltimo: p.diasUltimo, diasPresu: p.diasPresu, ultimo: p.ultimo ? fmtF(p.ultimo) : '', seguir: p.seguir ? fmtF(p.seguir) : '', paso: p.paso })),
    },
    en7N: en7.length, en7SinStaffN: en7SinStaff.length,
    en7: en7.slice(0, 8).map(p => ({ nro: p.nro, fecha: fmtF(p.fEvento), cliente: p.cliente || p.agencia, proyecto: p.proyecto || '(sin nombre)', pm: p.pm, sinStaff: p.sinStaff, staffParcial: p.staffParcial, conStaff: p.conStaff, pedidos: p.pedidos })),
    cobros: {
      porCobrar: suma(porCobrar), porCobrarN: porCobrar.length,
      atrasadas: suma(atrasadas), atrasadasN: atrasadas.length,
      vencenSemana: suma(vencenSemana), vencenSemanaN: vencenSemana.length,
      vencidas: suma(vencidas), vencidasN: vencidas.length,
      topAtrasadas: atrasadas.slice(0, 5).map(f => ({ dias: dias(f.fEvento), monto: f.monto, cliente: quien(f), proyecto: f.proyecto || `#${f.nro}` })),
      vencidasLista: vencidas.slice(0, 8).map(f => ({ dias: dias(f.venc), venc: fmtF(f.venc), monto: f.monto, cliente: quien(f), proyecto: f.proyecto || `#${f.nro}`, nroFc: f.nroFc })),
      vencenLista: vencenSemana.slice(0, 8).map(f => ({ venc: fmtF(f.venc), monto: f.monto, cliente: quien(f), proyecto: f.proyecto || `#${f.nro}` })),
    },
    staff: { sinCBU: sinCBU.slice(0, 5), sinCBUN: sinCBU.length },
  }
}

// El mismo texto que siempre imprimió morning-brief.mjs (lo lee /brief y va en el mail de la diaria)
export function briefMarkdown(d) {
  const L = []
  L.push(`# 🌅 Morning Brief — ${d.titulo}`, '')
  L.push('## 🚨 ATENCIÓN HOY')
  L.push(d.alertas.length ? d.alertas.map(a => `- ${a}`).join('\n') : 'Sin nada crítico, día tranquilo.')
  const k = d.comercial
  if (k) {
    L.push('', '## 📞 Comercial — hoy te toca llamar')
    if (!k.porLlamarN) L.push(`Nadie espera tu llamado ✓ · ${k.vivosN} presupuestos vivos por ${money(k.vivosMonto)}, todos con seguimiento al día.`)
    else {
      L.push(`**${k.porLlamarN} presupuestos por ${money(k.porLlamarMonto)}** esperan un llamado, de ${k.vivosN} vivos por ${money(k.vivosMonto)}.${Object.keys(k.porPM).length > 1 ? ' Por PM: ' + Object.entries(k.porPM).sort((a, b) => b[1].monto - a[1].monto).map(([pm, v]) => `${pm} ${v.n}`).join(' · ') + '.' : ''}`, '')
      k.lista.slice(0, 10).forEach(p => {
        const cuando = p.nunca ? `nadie lo llamó desde que se mandó${p.diasPresu !== null ? ` (hace ${p.diasPresu}d)` : ''}` : `último contacto hace ${p.diasUltimo}d${p.paso ? ` → ${p.paso}` : ''}`
        L.push(`- **${money(p.monto)}** · #${p.nro} · ${p.cliente} — ${p.proyecto} · evento ${p.evento}${p.urgente ? ` 🔴 en ${p.diasEvento}d` : ` (en ${p.diasEvento}d)`} · ${cuando}${p.pm ? ` · PM ${p.pm}` : ''}${p.contacto ? ` · ${p.contacto}` : ''}`)
      })
      if (k.porLlamarN > 10) L.push(`- …y ${k.porLlamarN - 10} más en la app (Trabajos → En espera → 📞 Por llamar).`)
      L.push('', k.hayColumnas ? 'Cuando hables, anotalo con el 📞 de la fila en Trabajos: el reloj arranca de nuevo y mañana no te lo repito.' : '⚠️ PRESUPUESTOS no tiene las columnas de seguimiento: correr scripts/presupuestos-columnas-seguimiento.mjs --escribir.')
    }
  }
  L.push('', `## 📊 Pipeline ${d.anio}`)
  L.push(`- ⏳ En espera: ${d.pipeline.esperaN} presus por ${money(d.pipeline.esperaMonto)}`)
  L.push(`- ✅ Aprobado: ${d.pipeline.aprobN} presus por ${money(d.pipeline.aprobMonto)}`)
  if (d.pipeline.sinProyectoN) L.push(`- ⚠️ Aprobados sin proyecto: ${d.pipeline.sinProyectoN} por ${money(d.pipeline.sinProyectoMonto)}`)
  L.push('', '## 📅 Próximos 7 días')
  L.push(`${d.en7N} proyectos · ${d.en7SinStaffN} sin staff cargado`)
  d.en7.forEach(p => {
    const flag = p.sinStaff ? ' 🔴 SIN STAFF' : (p.staffParcial ? ` 🟡 staff ${p.conStaff}/${p.pedidos}` : '')
    L.push(`- **${p.fecha}** · #${p.nro} · ${p.cliente} — ${p.proyecto}${p.pm ? ` · PM ${p.pm}` : ''}${flag}`)
  })
  if (!d.en7N) L.push('_(nada agendado)_')
  const c = d.cobros
  L.push('', '## 💵 Cobros')
  L.push(`- Por cobrar total: **${money(c.porCobrar)}** (${c.porCobrarN} facturas)`)
  L.push(`- 🔥 Atrasadas +30d: ${c.atrasadasN} por ${money(c.atrasadas)}`)
  L.push(`- ⏰ Vencen esta semana: ${c.vencenSemanaN} por ${money(c.vencenSemana)}`)
  L.push(`- ❌ Vencidas no cobradas: ${c.vencidasN} por ${money(c.vencidas)}`)
  if (c.topAtrasadas.length) { L.push('', '**Top 5 más atrasadas:**'); c.topAtrasadas.forEach(f => L.push(`- ${f.dias}d · ${money(f.monto)} · ${f.cliente} — ${f.proyecto}`)) }
  L.push('', '## 👥 Staff')
  L.push(d.staff.sinCBU.length ? d.staff.sinCBU.map(n => `- ${n} — falta CBU`).join('\n') : 'Todos los activos del mes tienen CBU cargado ✓')
  return L.join('\n')
}
