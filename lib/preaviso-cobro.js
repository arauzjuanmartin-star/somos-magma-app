// Preaviso de vencimiento: el mail que Flor le manda al cliente unos días ANTES de que venza la factura.
// Juan, 24/10/2026 (minuta de Mariana del 08/10: "preaviso una semana antes del vencimiento"):
// "una vez que Flor manda ese mail, a los 20 días avisar que se está por vencer la factura. Que salga
// del mail de Flor" · "Oir: reclamar a los 75 días diciendo que la factura tiene fecha tal y vence tal fecha".
//
// La regla:   plazo 30 → a los 20 días · plazo 90 (Oir) → a los 75 · cualquier otro → 10 días antes de vencer.
// No sale solo: Flor lo ve en Facturación y lo manda con un clic (pages/api/preaviso-cobro.js).
//
// Solo entran facturas que se le pueden avisar sin quedar mal: con número, no anuladas, ya enviadas al cliente,
// sin promesa de pago cargada y sin preaviso anterior. Las que tocan hoy pero no cumplen vuelven en `fuera`
// con el motivo, para que Flor vea por qué no salen (el 24/10 había dos ANULADAS sin cobrar y facturas
// grandes con "Fc Enviada" en falso: un aviso automático les habría reclamado mal).

export const COL_PREAVISO = 'Preaviso enviado'
export const FIRMA_ADMIN = { nombre: 'Florencia Diez', puesto: 'Administración · Somos Magma', casilla: 'admin@somosmagma.com' }

const DIA = 864e5
const txt = v => String(v ?? '').trim()
const parseMonto = v => { const n = parseFloat(txt(v).replace(/[$,\s]/g, '')); return isNaN(n) ? 0 : n }
const esSi = v => /^(TRUE|VERDADERO|SI|SÍ|X)$/i.test(txt(v))
// d/m/aaaa, o el número de serie que deja el sheet cuando convierte la fecha (46311 = 16/10/2026)
export function parseFecha(v) {
  const s = txt(v)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return Date.UTC(y, +m[2] - 1, +m[1]) }
  if (/^\d{5}$/.test(s)) return Date.UTC(1899, 11, 30) + (+s) * DIA
  return null
}
export const dmy = t => { const d = new Date(t); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` }
// Hoy en Argentina, a las 0 hs (el servidor corre en UTC)
export const hoyAR = () => { const a = new Date(Date.now() - 3 * 3600e3); return Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()) }

export const diasAntes = plazo => (plazo >= 90 ? 15 : 10)

// rows = FACTURACION completa (con la fila de títulos). Devuelve { listas, fuera }, cada una con `fila` real del sheet.
export function preavisosDeHoy(rows, hoy = hoyAR()) {
  const H = (rows[0] || []).map(txt), F = n => H.indexOf(n)
  const g = (r, n) => (F(n) >= 0 ? r[F(n)] : '')
  const listas = [], fuera = []
  rows.slice(1).forEach((r, i) => {
    if (esSi(g(r, 'Cobrado'))) return
    const saldo = Math.max(0, parseMonto(g(r, 'Precio FINAL')) - parseMonto(g(r, 'Monto cobrado')))
    if (saldo <= 0) return
    if (txt(g(r, COL_PREAVISO))) return
    const venc = parseFecha(g(r, 'Vencimiento'))
    if (venc == null) return
    const emision = parseFecha(g(r, 'Fecha emision'))
    const plazo = parseInt(txt(g(r, 'Plazo')).replace(/\D/g, ''), 10) || (emision != null ? Math.round((venc - emision) / DIA) : 30)
    const dia = venc - diasAntes(plazo) * DIA
    if (hoy < dia || hoy > venc) return

    const nroFactura = txt(g(r, 'Nro de Factura'))
    const f = {
      fila: i + 2, nro: txt(g(r, 'N° Presupuesto')), nroFactura,
      agencia: txt(g(r, 'Agencia')) || txt(g(r, 'Cliente')), cliente: txt(g(r, 'Cliente')), proyecto: txt(g(r, 'Proyecto')),
      monto: saldo, parcial: parseMonto(g(r, 'Monto cobrado')) > 0,
      emision: emision != null ? dmy(emision) : '', vencimiento: dmy(venc), plazo,
      diasParaVencer: Math.round((venc - hoy) / DIA),
    }
    const prometio = txt(g(r, 'Prometió pagar'))
    // `tipo` le dice a la pantalla qué botón ofrecer para resolverlo (Juan: "cosa de que ella pueda resolver")
    const [tipo, motivo] = /anulad/i.test(nroFactura) ? ['anulada', 'la factura está ANULADA y sigue sin cobrar: marcala o borrala']
      : !nroFactura ? ['sinnumero', 'no tiene el N° de factura cargado']
      : !(esSi(g(r, 'Fc Enviada')) || txt(g(r, 'Fecha enviada'))) ? ['noenviada', 'figura como NO enviada al cliente']
      : prometio ? ['prometio', `ya prometió pagar el ${prometio}`]
      : ['', '']
    if (motivo) fuera.push({ ...f, tipo, motivo })
    else listas.push(f)
  })
  return { listas, fuera }
}

const pesos = n => '$' + Math.round(n).toLocaleString('es-AR')

// El mail: uno por agencia y destinatarios. Si es una sola factura, va como respuesta en el hilo del mail original de la factura.
export function textoPreaviso({ facturas, saludo = '', lineasTransfer = [] }) {
  const firma = [FIRMA_ADMIN.nombre, FIRMA_ADMIN.puesto, FIRMA_ADMIN.casilla]
  const hola = `Hola${saludo ? ' ' + saludo : ''}, cómo estás?`
  const transferir = lineasTransfer.length ? ['', 'Te dejo los datos para transferir:', ...lineasTransfer] : []
  const cierre = ['', 'Si el pago ya está programado, desestimá este mail. Cualquier cosa que necesites, avisame.', '', 'Gracias!', '', ...firma]
  if (facturas.length === 1) {
    const f = facturas[0]
    return [hola, '',
      `Te escribo para recordarte que la factura ${f.nroFactura} (${f.proyecto}) tiene fecha ${f.emision} y vence el ${f.vencimiento}.`,
      `El monto ${f.parcial ? 'que queda pendiente ' : ''}es de ${pesos(f.monto)}.`,
      ...transferir, ...cierre].join('\n')
  }
  const total = facturas.reduce((s, f) => s + f.monto, 0)
  return [hola, '',
    'Te escribo para recordarte las facturas que están por vencer:', '',
    ...facturas.map(f => `• Factura ${f.nroFactura} (${f.proyecto}): ${pesos(f.monto)}\n   fecha ${f.emision} · vence el ${f.vencimiento}`),
    '', `Total: ${pesos(total)}`,
    ...transferir, ...cierre].join('\n')
}
