/**
 * Cómo ve Mi Magma cada uno de los que tienen acceso, leído del Master ahora: su agenda (y qué dato le falta a cada
 * trabajo), lo que tiene para facturar, cómo quedó lo que filmó y su ficha. Más lo que NADIE ve: los trabajos
 * próximos sin staff cargado.
 *
 * Usa la misma aduana que la app (lib/mi-magma.js): lo que imprime es exactamente lo que recibe el celular de cada uno.
 *
 * Uso:  node scripts/mi-magma-como-lo-ve.mjs              (resumen en consola)
 *       node scripts/mi-magma-como-lo-ve.mjs --json ruta   (además guarda el detalle)
 */
import { readFileSync, writeFileSync } from 'fs'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const i = l.indexOf('='); if (i < 0) continue; let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); process.env[l.slice(0, i).trim()] = v }
process.removeAllListeners('warning')
const { getAllData } = await import('../lib/sheets.js')
const { misDatos, tieneAcceso, COL_ACCESO } = await import('../lib/mi-magma.js')
const { lineasDeProyecto } = await import('../lib/jornadas.js')
const { canonStaff } = await import('../lib/staff.js')

const txt = v => String(v ?? '').trim()
const fechaAR = s => { const m = txt(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (!m) return null; let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1]) }
const $ = n => '$' + Math.round(n || 0).toLocaleString('es-AR')
const hoy = new Date(), hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

const data = await getAllData()
const conAcceso = (data.rrhh || []).filter(r => tieneAcceso(r) && txt(r['Nombre Apellido']))
const salida = { hoy: hoy0.toLocaleDateString('es-AR'), personas: [], sinStaff: [] }

for (const r of conAcceso) {
  const nombre = canonStaff(txt(r['Nombre Apellido']))
  const mail = txt(r.Mail), esGoogle = /@(gmail\.com|somosmagma\.com)$/i.test(mail)
  const mio = misDatos(data, nombre, hoy)
  const activo = !/inactiv|baja/i.test(txt(r.Estado))
  if (!mio) { salida.personas.push({ nombre, mail, esGoogle, activo, entra: false, motivo: 'la aduana no devuelve nada (¿es Somos Magma?)' }); continue }
  const proximos = mio.proximos.map(j => ({
    fecha: j.fecha, dia: DIAS[fechaAR(j.fecha).getDay()], cliente: j.cliente, proyecto: j.proyecto, num: j.num, rol: j.rol, monto: j.monto, pm: j.pm,
    horario: j.horario, lugar: j.lugar, clase: j.clase, equipo: j.equipo.map(e => `${e.quien} (${e.rol})`), driveCrudo: !!j.driveCrudo,
    falta: [!j.horario && 'horario', !j.lugar && 'lugar', !j.clase && 'qué clase de video', !j.pm && 'PM', !j.driveCrudo && 'carpeta de Drive'].filter(Boolean),
    respuesta: j.respuesta?.que || null, urgente: j.urgente,
  }))
  const enCurso = mio.meses.find(m => m.enCurso), anterior = mio.meses.find(m => !m.enCurso)
  const f = mio.ficha
  salida.personas.push({
    nombre, apodo: mio.primerNombre, mail, esGoogle, activo, entra: !!mail && esGoogle && activo,
    proximos, diasNoPuedo: mio.diasNoPuedo,
    facturar: { enCurso: enCurso ? { nombre: enCurso.nombre, n: enCurso.lineas.length, total: enCurso.total, pagado: enCurso.pagado, faltanHacer: enCurso.faltanHacer } : null,
      anterior: anterior ? { nombre: anterior.nombre, n: anterior.lineas.length, total: anterior.total, pagado: anterior.pagado, pendiente: anterior.pendiente, sePaga: anterior.sePaga } : null },
    entregas: mio.entregas.map(e => ({ cliente: e.cliente, fecha: e.fecha, etapa: e.etapa, texto: e.texto, link: !!e.link })),
    ficha: { rubro: f.rubro, zona: f.zona, banco: f.banco, alias: !!f.alias, cbu: !!f.cbu, cuit: !!f.cuit, celular: !!f.celular, acuerdo: f.acuerdo, trabajos: f.trabajos,
      faltaFicha: [!f.rubro && 'rubro', !f.cbu && !f.alias && 'CBU o alias', !f.cuit && 'CUIT', !f.celular && 'celular', !f.zona && 'zona'].filter(Boolean) },
  })
}

// Lo que nadie ve: rodajes de los próximos 30 días con un puesto sin persona, o directamente sin staff.
for (const p of (data.proyectos || [])) {
  const fe = fechaAR(p['Fecha Evento']); if (!fe || fe < hoy0 || (fe - hoy0) / 864e5 > 30) continue
  const pedidos = []
  for (let j = 1; j <= 40; j++) { const ped = txt(p['Pedido ' + j] || (j === 1 ? p['Pedido'] : '')); if (!ped) continue; pedidos.push({ pedido: ped, quien: txt(p['Staff ' + j] || (j === 1 ? p['Staff'] : '')) }) }
  const vacios = pedidos.filter(x => !x.quien && /film|video|foto|vivo|produ|dron|sonid|c[aá]mara|cobertura|asist/i.test(x.pedido))
  if (!vacios.length) continue
  salida.sinStaff.push({ num: txt(p['N° presupuesto']), fecha: p['Fecha Evento'], dia: DIAS[fe.getDay()], cliente: txt(p.Cliente) || txt(p.Agencia), proyecto: txt(p.Proyecto), pm: txt(p.PM), vacios: vacios.map(x => x.pedido), conGente: lineasDeProyecto(p).map(l => l.nombre.split(' ')[0]) })
}
salida.sinStaff.sort((a, b) => fechaAR(a.fecha) - fechaAR(b.fecha))

// ---- consola
console.log(`\nMI MAGMA — cómo lo ve cada uno · ${salida.hoy} · ${conAcceso.length} con acceso\n`)
for (const p of salida.personas) {
  const flags = [!p.entra && (`NO ENTRA: ${!p.mail ? 'sin mail' : !p.esGoogle ? 'mail no es de Google' : 'inactivo'}`)].filter(Boolean)
  console.log(`■ ${p.nombre}${p.apodo && p.apodo !== p.nombre.split(' ')[0] ? ` (${p.apodo})` : ''} · ${p.mail || 'SIN MAIL'}${flags.length ? ' · ⚠ ' + flags.join(' · ') : ''}`)
  if (!p.proximos) continue
  console.log(`   Agenda: ${p.proximos.length ? '' : 'VACÍA — no tiene ningún trabajo cargado de hoy en adelante'}`)
  for (const j of p.proximos) console.log(`     ${j.dia} ${j.fecha.slice(0, 5)} · ${j.cliente} · ${j.rol} · ${$(j.monto)}${j.equipo.length ? ' · con ' + j.equipo.join(', ') : ''}${j.falta.length ? ' · FALTA: ' + j.falta.join(', ') : ' · completo'}`)
  const fc = p.facturar
  console.log(`   Facturar: ${fc.enCurso ? `${fc.enCurso.nombre}: ${fc.enCurso.n} trabajos ${$(fc.enCurso.total)}` : 'nada este mes'}${fc.anterior ? ` · ${fc.anterior.nombre}: ${$(fc.anterior.total)} ${fc.anterior.pendiente > 0 ? `(falta pagar ${$(fc.anterior.pendiente)}, se paga el ${fc.anterior.sePaga})` : '(pagado)'}` : ''}`)
  console.log(`   Cómo quedó: ${p.entregas.length ? p.entregas.map(e => `${e.cliente} ${e.texto}`).join(' · ') : 'sin ediciones de trabajos suyos en 90 días'}`)
  console.log(`   Ficha: ${p.ficha.faltaFicha.length ? 'FALTA ' + p.ficha.faltaFicha.join(', ') : 'completa'}${p.ficha.acuerdo ? ` · acuerdo ${p.ficha.acuerdo.minimo} jornadas` : ''}\n`)
}
console.log(`\nLO QUE NADIE VE — rodajes de los próximos 30 días con puestos sin persona (${salida.sinStaff.length}):`)
for (const s of salida.sinStaff) console.log(`   ${s.dia} ${s.fecha} · #${s.num} ${s.cliente} · ${s.proyecto} · PM ${s.pm || '—'} · sin nadie en: ${s.vacios.join(', ')}${s.conGente.length ? ` · ya van: ${s.conGente.join(', ')}` : ''}`)

const i = process.argv.indexOf('--json')
if (i > 0 && process.argv[i + 1]) { writeFileSync(process.argv[i + 1], JSON.stringify(salida, null, 1)); console.log(`\n→ ${process.argv[i + 1]}`) }
