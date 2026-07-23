// Prepara UN mail de reclamo con TODAS las facturas pendientes de un cliente/agencia.
// Caso real: Ostara debe varias facturas y siempre responde la misma persona de administración
// — en vez de mandar un mail por factura, se manda uno solo con el resumen de cuenta.
import { getSheets, withSheetsRetry } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const num = v => parseFloat(String(v||'0').replace(/[^\d.-]/g,''))||0
const fmt = n => Math.round(n).toLocaleString('es-AR')
const norm = v => String(v||'').toLowerCase().trim()
const parseD = s => { const m=String(s||'').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if(!m) return null; let y=+m[3]; if(y<100)y+=2000; const d=new Date(y,+m[2]-1,+m[1]); return isNaN(d)?null:d }

const NOMBRE_USER = {
  'juan@somosmagma.com':'Juan', 'sofi@somosmagma.com':'Sofi', 'tom@somosmagma.com':'Tom',
  'lulu@somosmagma.com':'Lulu', 'admin@somosmagma.com':'Administración', 'arauzjuanmartin@gmail.com':'Juan',
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { agencia } = req.body
  if (!agencia) return res.status(400).json({ error: 'Falta la agencia/cliente' })

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const [factR, ctR, cuR, agR] = await Promise.all([
      withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A:AG' })),
      withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Contactos/agencias!A:H' })),
      withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'CUENTAS!A:N' })),
      withSheetsRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'AGENCIAS!A:L' })),
    ])

    const H = factR.data.values[0]
    const F = n => H.indexOf(n)
    const esTrue = v => /^(TRUE|VERDADERO|SI|SÍ|X)$/i.test(String(v||'').trim())
    const hoy = new Date(); hoy.setHours(0,0,0,0)

    // Todas las facturas impagas de esa agencia/cliente
    const pendientes = factR.data.values.slice(1)
      .filter(r => (norm(r[F('Agencia')]) === norm(agencia) || norm(r[F('Cliente')]) === norm(agencia))
                && !esTrue(r[F('Cobrado')]) && num(r[F('Precio FINAL')]) > 0)
      .map(r => {
        const venc = parseD(r[F('Vencimiento')])
        return {
          nro: String(r[F('N° Presupuesto')]||'').trim(),
          nroFactura: String(r[F('Nro de Factura')]||'').trim(),
          proyecto: r[F('Proyecto')] || '',
          cliente: r[F('Cliente')] || '',
          monto: num(r[F('Precio FINAL')]),
          emision: r[F('Fecha emision')] || '',
          vencimiento: r[F('Vencimiento')] || '',
          fechaEvento: r[F('Fecha Evento')] || '',
          diasVencida: venc && venc < hoy ? Math.round((hoy - venc) / 86400000) : 0,
          sinEmitir: !String(r[F('Nro de Factura')]||'').trim(),
        }
      })
      .sort((a, b) => b.diasVencida - a.diasVencida || b.monto - a.monto)

    if (!pendientes.length) return res.json({ ok: true, pendientes: [], destinatarios: [], asunto: '', cuerpo: '', total: 0 })

    // Destinatarios: contactos de esa agencia + mail de facturación de la agencia
    const contactos = ctR.data.values.slice(1)
    const dest = []
    contactos.forEach(c => {
      if (!c[1]) return
      if (norm(c[2]) === norm(agencia) || norm(c[0]) === norm(agencia)) {
        if (!dest.find(d => norm(d.mail) === norm(c[1]))) {
          dest.push({ nombre: c[0] || '(sin nombre)', mail: c[1], match: c[4] ? `${c[4]} · ${c[2]||''}` : (c[2]||'contacto') })
        }
      }
    })
    const agRow = agR.data.values.slice(1).find(r => norm(r[0]) === norm(agencia))
    const mailFact = agRow ? (agRow[3] || '') : ''
    if (mailFact && !dest.find(d => norm(d.mail) === norm(mailFact))) {
      dest.push({ nombre: `Facturación ${agencia}`, mail: mailFact, match: 'Mail de facturación de la agencia' })
    }
    // Un reclamo va a administración/facturación, no a los productores. Se ordenan primero
    // los que tienen ese cargo para que quien manda no tenga que buscarlos entre 16 contactos.
    const esAdmin = d => /administr|factur|contab|cobranz|pago/i.test(`${d.match} ${d.nombre}`)
    dest.sort((a, b) => (esAdmin(b) ? 1 : 0) - (esAdmin(a) ? 1 : 0))
    dest.forEach(d => { d.admin = esAdmin(d) })

    // Datos de transferencia (cuenta principal de la SRL)
    const cuH = cuR.data.values[0]
    const cu = cuR.data.values.slice(1).find(r => norm(r[0]) === 'bbva somos magma') || cuR.data.values[1]
    const lineasTransfer = []
    if (cu) {
      const g = n => cu[cuH.indexOf(n)] || ''
      if (g('Titular') || g('Entidad fiscal')) lineasTransfer.push(`• Titular: ${g('Titular') || g('Entidad fiscal')}`)
      if (g('Banco')) lineasTransfer.push(`• Banco: ${g('Banco')}`)
      if (g('Alias')) lineasTransfer.push(`• Alias: ${g('Alias')}`)
      if (g('CBU')) lineasTransfer.push(`• CBU: ${g('CBU')}`)
    }

    const total = pendientes.reduce((s, p) => s + p.monto, 0)
    const vencidas = pendientes.filter(p => p.diasVencida > 0)
    const nombreEmisor = NOMBRE_USER[mail] || mail.split('@')[0]

    // El cuerpo lo arma el frontend según qué facturas queden tildadas (no se puede reclamar
    // una factura que nunca se emitió). Acá van las piezas fijas.
    res.json({
      ok: true, agencia, pendientes, destinatarios: dest, total, vencidas: vencidas.length,
      lineasTransfer: lineasTransfer.length ? lineasTransfer : ['(Cargar datos en la solapa CUENTAS)'],
      nombreEmisor,
      sinEmitir: pendientes.filter(p => p.sinEmitir).length,
    })
  } catch (e) {
    console.error('reclamo-prep:', e)
    res.status(500).json({ error: e.message })
  }
}
