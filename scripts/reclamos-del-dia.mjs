/**
 * RECLAMOS DEL DÍA: un mail de reclamo por agencia con las facturas vencidas que nadie prometió pagar.
 * Las facturas son las mismas que cuenta la tarea "Reclamar" de Caja/Hoy (lib/caja.mjs: vencida y sin promesa vigente),
 * y el mail es el mismo que arma el botón "✉ Reclamar cuenta" de Facturación (pages/index.js, ReclamoModal;
 * destinatarios como pages/api/reclamo-prep.js). Si cambia el texto allá, cambiarlo acá.
 * Solo lectura: no escribe en el sheet ni manda nada. Lo usa scripts/programado.mjs (tarea "admin").
 *
 * Uso:  node scripts/reclamos-del-dia.mjs           (para leer)
 *       node scripts/reclamos-del-dia.mjs --json    (para encadenar)
 */
import { readFileSync } from 'fs'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const i = l.indexOf('='); if (i < 0) continue; let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); if (!(l.slice(0, i).trim() in process.env)) process.env[l.slice(0, i).trim()] = v }
process.removeAllListeners('warning')

const { getAllData } = await import('../lib/sheets.js')
const { canonStaff } = await import('../lib/staff.js')
const { MAX_SLOTS } = await import('../lib/slots.js')
const { calcularCaja, grupoAgencia } = await import('../lib/caja.mjs')
const { horaArgentina } = await import('../lib/diaria-mail.mjs')

const hoy = horaArgentina()
const data = await getAllData()
const caja = calcularCaja(data, { hoy, maxSlots: MAX_SLOTS, canonStaff })
const norm = v => String(v || '').toLowerCase().trim()
const plata = n => '$' + Math.round(n).toLocaleString('es-AR')
const fila = Object.fromEntries((data.facturacion || []).map(f => [f.__row, f]))

// Datos de transferencia: la cuenta principal de la SRL, como en reclamo-prep
const cu = (data.cuentas || []).find(c => norm(c['Nombre']) === 'bbva somos magma')
const transfer = cu ? [['Titular', cu['Titular'] || cu['Entidad fiscal']], ['Banco', cu['Banco']], ['Alias', cu['Alias']], ['CBU', cu['CBU']]].filter(x => x[1]).map(([k, v]) => `• ${k}: ${v}`) : []

const porAgencia = {}
// Las anuladas no se reclaman (Caja hoy las cuenta igual: ver lib/caja.mjs, real())
const anulada = c => /^ANULADA/i.test(String(fila[c.fila]?.['Nro de Factura'] || '').trim())
for (const c of caja.cobros.filter(c => c.vencida && !c.promesaVigente && !anulada(c))) (porAgencia[c.agencia] = porAgencia[c.agencia] || []).push(c)

const reclamos = Object.entries(porAgencia).map(([agencia, cobros]) => {
  // Contactos de la agencia + el mail de facturación; el reclamo va a quien tiene cargo de administración
  const dest = []
  ;(data.contactos || []).forEach(c => { const mail = String(c['Mail'] || '').trim(); if (mail && grupoAgencia(c['Agencia']) === agencia && !dest.find(d => norm(d.mail) === norm(mail))) dest.push({ nombre: c['Nombre'] || '', mail, cargo: c['Cargo'] || '' }) })
  const ag = (data.agencias || []).find(a => grupoAgencia(a['Nombre']) === agencia)
  const mailFact = String(ag?.['Mail facturacion'] || '').trim()
  if (mailFact && !dest.find(d => norm(d.mail) === norm(mailFact))) dest.push({ nombre: `Facturación ${agencia}`, mail: mailFact, cargo: 'facturación' })
  const esAdmin = d => /administr|factur|contab|cobranz|pago/i.test(`${d.cargo} ${d.nombre}`)
  const para = dest.filter(esAdmin).length ? dest.filter(esAdmin) : dest.slice(0, 1)

  const facturas = cobros.map(c => {
    const f = fila[c.fila] || {}
    const venc = f['Vencimiento'] || ''
    const dias = c.venc ? Math.round((caja.hoy0 - c.venc) / 864e5) : 0
    return { nroFactura: String(f['Nro de Factura'] || '').trim(), nro: c.nro, proyecto: c.proyecto || c.cliente, monto: c.saldo, emision: f['Fecha emision'] || '', vencimiento: venc, dias, promesaIncumplida: !!c.promesa, nota: c.nota }
  }).sort((a, b) => b.dias - a.dias)
  const total = facturas.reduce((s, f) => s + f.monto, 0)
  const prim = para[0]?.nombre?.split(' ')[0] || ''
  const subject = `Resumen de cuenta - Somos Magma / ${agencia} · ${facturas.length} ${facturas.length === 1 ? 'factura pendiente' : 'facturas pendientes'}`
  const text = [
    `Hola${prim && !/facturaci/i.test(prim) ? ' ' + prim : ''},`, ``,
    `Te paso el resumen de cuenta con los trabajos que tenemos pendientes de cobro:`, ``,
    ...facturas.map(p => {
      const ref = p.nroFactura ? `Factura ${p.nroFactura}` : `Presupuesto #${p.nro}`
      const det = []; if (p.emision) det.push(`emitida ${p.emision}`)
      if (p.vencimiento) det.push(p.dias > 0 ? `venció ${p.vencimiento} (${p.dias} días)` : `vence ${p.vencimiento}`)
      return `• ${ref} — ${p.proyecto || 's/d'}: ${plata(p.monto)}` + (det.length ? `\n   ${det.join(' · ')}` : '')
    }), ``,
    `TOTAL PENDIENTE: ${plata(total)}`,
    `(${facturas.length} ${facturas.length === 1 ? 'factura vencida' : 'facturas vencidas'})`, ``,
    `Datos para transferir:`, ...(transfer.length ? transfer : ['(Cargar datos en la solapa CUENTAS)']), ``,
    `¿Nos podés confirmar fecha estimada de pago así lo ordenamos de nuestro lado?`, ``,
    `Cualquier cosa que necesites (duplicado de alguna factura, detalle de un trabajo), avisame y te lo mando.`, ``,
    `Gracias,`, `Administración`, `Somos Magma`,
  ].join('\n')
  return { agencia, total, facturas, to: para.map(d => d.mail).join(', '), otrosContactos: dest.filter(d => !para.includes(d)).map(d => `${d.nombre} <${d.mail}>`), subject, text }
}).sort((a, b) => b.total - a.total)

if (process.argv.includes('--json')) { console.log(JSON.stringify(reclamos)); process.exit(0) }
console.log(`\nRECLAMOS DEL DÍA · ${hoy.toLocaleDateString('es-AR')} · ${reclamos.length} agencias · ${plata(reclamos.reduce((s, r) => s + r.total, 0))}\n`)
for (const r of reclamos) {
  console.log(`── ${r.agencia} · ${plata(r.total)} → ${r.to || '(SIN MAIL)'}`)
  r.facturas.forEach(f => console.log(`   ${f.nroFactura || '#' + f.nro} · ${f.proyecto} · ${plata(f.monto)} · venció ${f.vencimiento} (${f.dias} d)${f.promesaIncumplida ? ' · prometió y no pagó' : ''}${f.nota ? ' · ' + f.nota : ''}`))
}
