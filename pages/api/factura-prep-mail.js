// Prepara el contenido del mail de envío de factura.
// Devuelve: destinatarios sugeridos, asunto, cuerpo, datos de transferencia.
// El frontend usa esto para mostrar el modal pre-poblado.
import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'

const num = v => parseFloat(String(v||'0').replace(/[^\d.-]/g,''))||0
const fmt = n => Math.round(n).toLocaleString('es-AR')

const NOMBRE_USER = {
  'juan@somosmagma.com':'Juan',
  'sofi@somosmagma.com':'Sofi',
  'tom@somosmagma.com':'Tom',
  'lulu@somosmagma.com':'Lulu',
  'admin@somosmagma.com':'Administración',
  'arauzjuanmartin@gmail.com':'Juan',
}

const ENTIDAD_A_CUENTA = {
  'SRL':'BBVA Somos Magma',
  'Sofia':'Galicia Sofi',
  'Lulu':'Santander Lucia',
  'Efectivo':'Efectivo',
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  const { presupuestoNum } = req.body
  if (!presupuestoNum) return res.status(400).json({ error: 'Falta presupuestoNum' })

  try {
    const { sheets, SHEET_ID } = await getSheets()

    // Leer en paralelo: FACTURACION, PRESUPUESTOS, Contactos, CUENTAS, AGENCIAS
    const [factR, presR, ctR, cuR, agR] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'FACTURACION!A:AG' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PRESUPUESTOS!A:K' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Contactos/agencias!A:H' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'CUENTAS!A:L' }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'AGENCIAS!A:L' }),
    ])

    const factHeaders = factR.data.values[0]
    const F = name => factHeaders.indexOf(name)
    const factura = factR.data.values.slice(1).find(row => String(row[F('N° Presupuesto')]||'').trim() === String(presupuestoNum).trim())
    if (!factura) return res.status(404).json({ error: 'Factura no encontrada' })

    const nroFactura = factura[F('Nro de Factura')] || 's/n'
    const tipoFactura = factura[F('Tipo de Factura')] || ''
    const cliente = factura[F('Cliente')] || ''
    const agencia = factura[F('Agencia')] || ''
    const proyecto = factura[F('Proyecto')] || ''
    const total = num(factura[F('Precio FINAL')])
    const neto = num(factura[F('Precio SIN IVA')])
    const iva = num(factura[F('IVA')])
    const fechaEmision = factura[F('Fecha emision')] || ''
    const vencimiento = factura[F('Vencimiento')] || ''
    const linkPDF = factura[F('Factura')] || ''  // URL Drive (si se subió)

    // Detectar entidad facturada del N° de factura (mismo criterio que el resto de la app)
    const nLow = String(nroFactura).toLowerCase()
    const entidadKey = nLow.includes('sofia')?'Sofia':nLow.includes('lulu')?'Lulu':(nLow.includes('ef-')||nLow.includes('efectivo'))?'Efectivo':'SRL'

    // Buscar el presupuesto para obtener el contacto
    const presRow = presR.data.values.slice(1).find(row => String(row[0]||'').trim() === String(presupuestoNum).trim())
    const contactoNombre = presRow ? (presRow[10]||'') : ''

    // Buscar emails de contactos relacionados (en Contactos/agencias)
    // Headers: Nombre | Mail | Agencia | PM | Cargo | Teléfono | Notas | CUIT
    const ctHeaders = ctR.data.values[0]
    const norm = v => String(v||'').toLowerCase().trim()
    const contactos = ctR.data.values.slice(1)

    // La factura NO va a todos los contactos de la agencia (pasó: un mail de Ostara con
    // media agencia en copia). Solo se tildan dos: el contacto con el que se armó el presu
    // y el mail de facturación de la ficha de la agencia. El resto aparece DESMARCADO.
    const destinatariosSugeridos = []
    const push = d => { if (d.mail && !destinatariosSugeridos.find(x => norm(x.mail) === norm(d.mail))) destinatariosSugeridos.push(d) }

    // 1° el contacto del presu — el que pidió el trabajo
    if (contactoNombre) {
      const c = contactos.find(c => norm(c[0]) === norm(contactoNombre))
      if (c && c[1]) push({nombre:c[0], mail:c[1], match:'Contacto del presu', sugerido:true})
    }

    // 2° el mail de facturación cargado en la ficha de la AGENCIA
    const agHeaders = agR.data.values[0]
    const agRow = agR.data.values.slice(1).find(row => norm(row[0]) === norm(agencia) || norm(row[0]) === norm(cliente))
    const mailFacturacionAgencia = agRow ? (agRow[3]||'') : ''
    if (mailFacturacionAgencia) {
      push({nombre:`Facturación ${agencia||cliente}`, mail:mailFacturacionAgencia, match:'Mail de facturación de la agencia', sugerido:true})
    }

    // 3° el resto de los contactos de la agencia — desmarcados, se tildan a mano si hace falta
    contactos.forEach(c => {
      if (!c[1]) return
      if (norm(c[2]) === norm(agencia) || norm(c[2]) === norm(cliente)) {
        push({nombre:c[0]||'(sin nombre)', mail:c[1], match:`Otro contacto de ${c[2]}`, sugerido:false})
      }
    })

    // Datos de transferencia desde CUENTAS
    const cuHeaders = cuR.data.values[0]
    const cuRows = cuR.data.values.slice(1)
    const cuentaDestino = ENTIDAD_A_CUENTA[entidadKey] || 'BBVA Somos Magma'
    const cuentaRow = cuRows.find(r => norm(r[0]) === norm(cuentaDestino))
    const datosTransfer = cuentaRow ? {
      nombre: cuentaRow[0] || '',
      entidadFiscal: cuentaRow[1] || '',
      banco: cuentaRow[2] || '',
      alias: cuentaRow[cuHeaders.indexOf('Alias')] || '',
      cbu: cuentaRow[cuHeaders.indexOf('CBU')] || '',
      titular: cuentaRow[cuHeaders.indexOf('Titular')] || '',
      adicionales: cuentaRow[cuHeaders.indexOf('Datos transferencia adicionales')] || '',
    } : null

    // Armar asunto y cuerpo
    const nombreEmisor = NOMBRE_USER[mail] || mail.split('@')[0]
    const asunto = `Factura ${nroFactura} - Somos Magma${proyecto?' - '+proyecto:''}`

    const lineasTransfer = []
    if (datosTransfer) {
      lineasTransfer.push(`• Titular: ${datosTransfer.titular || datosTransfer.entidadFiscal || 'Somos Magma SRL'}`)
      if (datosTransfer.banco) lineasTransfer.push(`• Banco: ${datosTransfer.banco}`)
      if (datosTransfer.alias) lineasTransfer.push(`• Alias: ${datosTransfer.alias}`)
      if (datosTransfer.cbu) lineasTransfer.push(`• CBU: ${datosTransfer.cbu}`)
      if (datosTransfer.adicionales) lineasTransfer.push(`• ${datosTransfer.adicionales}`)
    } else {
      lineasTransfer.push('(Cargar datos de transferencia en la solapa CUENTAS del Master Magma)')
    }

    // El PDF va ADJUNTO al mail (lo baja factura-enviar de Drive). Antes iba el link de Drive
    // y el cliente caía en "solicitar acceso" porque la carpeta ADMINISTRACION es privada.
    const tienePDF = !!String(linkPDF||'').trim()

    const cuerpo = [
      `Hola${contactoNombre?' '+contactoNombre.split(' ')[0]:''},`,
      ``,
      tienePDF
        ? `Adjunto la factura en PDF y los datos de transferencia por los trabajos realizados.`
        : `Te paso el detalle de la factura y los datos de transferencia por los trabajos realizados.`,
      ``,
      `Detalle:`,
      `• Cliente: ${cliente || agencia || '—'}`,
      proyecto ? `• Proyecto: ${proyecto}` : null,
      presupuestoNum ? `• N° de presupuesto: ${presupuestoNum}` : null,
      nroFactura !== 's/n' ? `• N° de factura: ${nroFactura}` : null,
      tipoFactura ? `• Tipo de factura: ${tipoFactura}` : null,
      fechaEmision ? `• Fecha de emisión: ${fechaEmision}` : null,
      vencimiento ? `• Vencimiento del pago: ${vencimiento}` : null,
      `• Total: $${fmt(total)}${iva > 0 ? ' (IVA incluido)' : ' + IVA'}`,
      ``,
      `Datos para transferir:`,
      ...lineasTransfer,
      ``,
      `Por favor indicar fecha estimada de pago así podemos llevar el control administrativo.`,
      ``,
      `Cualquier consulta quedo a disposición.`,
      ``,
      `Saludos cordiales,`,
      `${nombreEmisor}`,
      `Somos Magma`,
    ].filter(l => l !== null).join('\n')

    res.json({
      ok: true,
      adjuntarPDF: tienePDF,   // el front lo reenvía a factura-enviar para que pegue el PDF al mail
      // Para poder ofrecer "guardar este mail como el de facturación de la agencia":
      // solo 7 de 82 agencias lo tienen cargado, así que la sugerencia se aprende sobre la marcha.
      agenciaNombre: agencia || cliente,
      mailFacturacionAgencia,
      factura: { nroFactura, tipoFactura, cliente, agencia, proyecto, total, fechaEmision, vencimiento, linkPDF, entidadKey },
      destinatarios: destinatariosSugeridos,
      asunto,
      cuerpo,
      datosTransfer,
      contactoNombre,
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
