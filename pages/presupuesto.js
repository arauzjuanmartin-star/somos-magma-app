import { useState, useEffect } from 'react'
import Head from 'next/head'

// Parsea formatos AR ($1.234,56) y US ($1,234.56) de forma robusta
const parseMonto = v => {
  const s = String(v||'').replace(/[\s$]/g,'')
  if (s.includes(',') && s.includes('.')) {
    return s.lastIndexOf(',') > s.lastIndexOf('.')
      ? Number(s.replace(/\./g,'').replace(',','.')) || 0
      : Number(s.replace(/,/g,'')) || 0
  }
  if (s.includes(',')) return Number(s.replace(',','.')) || 0
  return Number(s) || 0
}
const fmt$ = n => parseMonto(n).toLocaleString('es-AR')

const addDays = (dateStr, days) => {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0,10)
}

const toDisplay = iso => {
  if (!iso) return ''
  const [y,m,d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const fromSheet = s => {
  if (!s) return ''
  const p = String(s).split('/')
  if (p.length === 3) {
    const yr = p[2].length === 4 ? p[2] : '20'+p[2]
    return `${yr}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`
  }
  return ''
}

// Extrae todos los pedidos del objeto p de manera robusta — busca cualquier key 'Pedido N' independiente del espaciado
const getPedidos = (p) => {
  if (!p) return []
  const pares = []
  for (const k of Object.keys(p)) {
    const m = k.match(/^pedido\s*(\d+)\s*$/i)
    if (m) pares.push({n: parseInt(m[1]), val: p[k]})
  }
  return pares.sort((a,b) => a.n - b.n).map(x => x.val).filter(Boolean)
}

// Limpia emojis y variation selectors. Mantiene letras latinas, números, puntuación común.
const stripSvc = s => String(s||'')
  .replace(/[\u{1F300}-\u{1FAFF}]/gu,'')
  .replace(/[☀-➿]/g,'')
  .replace(/[︀-️]/g,'')
  .replace(/[​-‏‪-‮]/g,'')
  .replace(/[ -⁯]/g,'')
  .replace(/^[\s!'"`þÞ]+/, '')
  .trim()

// Mapeo de códigos cortos a descripciones ricas para el PDF al cliente.
// Juan 2026-06-09: descripciones más detalladas (ej. Viáticos → Hospedaje, transportes y comida)
const SVC_LABELS = {
  // Fotografía
  'Foto ½':       'Media jornada fotógrafo (hasta 4 horas, edición incluida)',
  'Foto 1/2':     'Media jornada fotógrafo (hasta 4 horas, edición incluida)',
  'Foto 1':       'Jornada completa fotógrafo (hasta 8 horas, edición incluida)',
  'Foto 2':       'Doble jornada fotógrafo (2 jornadas completas, edición incluida)',
  'Foto 12hs':    'Jornada extendida fotógrafo (hasta 12 horas, edición incluida)',
  // Video / Filmmaker
  'Video ½':      'Media jornada videógrafo (hasta 4 horas)',
  'Video 1/2':    'Media jornada videógrafo (hasta 4 horas)',
  'Video 1':      'Jornada completa videógrafo (hasta 8 horas)',
  'Video 2':      'Doble jornada videógrafo (2 jornadas completas)',
  'Film ½':       'Media jornada filmmaker (hasta 4 horas)',
  'Film 1/2':     'Media jornada filmmaker (hasta 4 horas)',
  'Film 1':       'Jornada completa filmmaker (hasta 8 horas)',
  'Film 12hs':    'Jornada extendida filmmaker (hasta 12 horas)',
  // Equipos especiales
  'Drone':        'Operador de drone con piloto habilitado',
  'FPV':          'Dron FPV (cinematic FPV con piloto especializado)',
  'Go Pro':       'Cámara GoPro adicional para tomas dinámicas',
  'Rental':       'Rental de equipos (cámaras, lentes, luces, accesorios)',
  // Postproducción / Animación
  'Motion':       'Animación motion graphics 2D',
  'Edit 60s':     'Edición video resumen 60 segundos + adaptación vertical 9:16',
  'Edit 60s+':    'Edición video resumen extendido (más de 60 segundos)',
  'Edit 15-30s':  'Edición video corto (15 a 30 segundos)',
  // Directores y roles especializados
  'Sonido':       'Sonido directo (microfonía + grabador)',
  'DirFoto':      'Director de Fotografía (DOP)',
  // Streaming
  'Vivo 1':       'Streaming en vivo jornada completa (1 cámara + transmisión)',
  'Vivo ½':       'Streaming en vivo media jornada (1 cámara + transmisión)',
  'Vivo 1/2':     'Streaming en vivo media jornada (1 cámara + transmisión)',
  // Asistentes y producción
  'Asist 1':      'Asistente de producción jornada completa',
  'Asist ½':      'Asistente de producción media jornada',
  'Asist 1/2':    'Asistente de producción media jornada',
  'Produ':        'Productor en set',
  // Misceláneos / talento
  'MakeUp':       'Maquilladora profesional',
  'Model':        'Modelo (talento contratado)',
  'Catering':     'Catering en set',
  'Viaticos':     'Viáticos (hospedaje, transportes y comida)',
  'Crudos':       'Entrega de archivos crudos sin editar',
  'Fotos':        'Fotografías editadas en alta resolución',
}
const prettifySvc = s => {
  if (!s) return ''
  const limpio = stripSvc(s)
  const limpioNorm = limpio.replace(/\s+/g,' ').replace(/½/g,'1/2').toLowerCase()
  for (const [key, label] of Object.entries(SVC_LABELS)) {
    const keyNorm = key.replace(/\s+/g,' ').replace(/½/g,'1/2').toLowerCase()
    if (limpioNorm === keyNorm) return label
  }
  return limpio
}
const cleanSvc = prettifySvc

// Cláusulas predefinidas según tipo de presupuesto
const CLAUSULAS_PROD = {
  validez: 'Este presupuesto es válido por un plazo de 5 días hábiles a partir de la fecha de emisión. Una vez transcurrido este período, los costos y la disponibilidad para el proyecto podrían variar y requerirán una reevaluación.',
  pago: [
    {titulo:'Anticipo 50%', texto:'Se abona a la aceptación del presupuesto para iniciar el trabajo y reservar el tiempo en nuestra agenda.'},
    {titulo:'Pago Intermedio 30%', texto:'Se abona al completar la fase de diseño o animación y antes de comenzar la etapa de correcciones provistas por el cliente.'},
    {titulo:'Pago Final 20%', texto:'Se abona contra entrega del material final y antes de la transferencia de los derechos de uso o archivos fuente.'},
  ],
  clausulas: [
    {titulo:'1. Cláusula de Retraso en el Pago (Morosidad)', texto:'El incumplimiento en las fechas de pago acordadas puede generar un cargo por mora del 15% mensual sobre el monto pendiente, calculado a partir del día siguiente a la fecha de vencimiento. Además, cualquier retraso en el pago de una fase detendrá automáticamente el avance del proyecto hasta que el pago se regularice.'},
    {titulo:'2. Cláusula de Derechos de Propiedad y Explotación', texto:'La propiedad intelectual y los derechos de explotación del material creado (incluidos videos finales, diseños y archivos fuente) seguirán siendo propiedad de SOMOS MAGMA S.R.L. hasta que el pago total del proyecto, incluyendo impuestos y posibles cargos por mora, haya sido recibido en su totalidad. La entrega del material final no realizará una cesión completa de la propiedad del pago del mismo. Asimismo, se reservan los derechos de uso del resultado del proyecto a fines publicitarios como portafolio y promociones propias de SOMOS MAGMA S.R.L. salvo petición indicada por el cliente.'},
    {titulo:'3. Cláusula de Revisiones y Cambios', texto:'El presupuesto incluye un máximo de 3 rondas de revisión por proyecto. Las revisiones adicionales a las incluidas serán cotizadas y facturadas a una tarifa de 10 USD por hora/revisión, o se incluirán en un nuevo presupuesto acordado previamente.'},
    {titulo:'4. Cláusula de Cancelación del Proyecto', texto:'En caso de que el cliente decida cancelar el proyecto por razones ajenas a nuestro control, los pagos realizados hasta la fecha (incluido el anticipo) no son reembolsables y serán retenidos en concepto de compensación por el tiempo y recursos invertidos.'},
  ],
}

const CLAUSULAS_COBERTURA = {
  validez: 'Este presupuesto es válido por 20 días desde la fecha de emisión.',
  pago: [
    {titulo:'Reserva 50%', texto:'Para confirmar la reserva de la fecha se deberá abonar el 50% del valor total del servicio.'},
    {titulo:'Pago Final 50%', texto:'El 50% restante deberá abonarse hasta 7 días antes del evento.'},
  ],
  clausulas: [
    {titulo:'1. Entrega del material', texto:'Incluye fotografías editadas en alta resolución y/o video resumen según servicio contratado. Todo el material se entrega de manera digital. No incluye archivos crudos ni editables salvo acuerdo expreso por escrito.'},
    {titulo:'2. Revisiones', texto:'El video incluye hasta dos rondas de correcciones sin costo adicional. Cambios adicionales podrán presupuestarse por separado.'},
    {titulo:'3. Plazos de entrega', texto:'Las fotografías y/o video serán entregados en formato digital dentro de los plazos acordados previamente entre las partes.'},
    {titulo:'4. Cancelación', texto:'En caso de cancelación por parte del cliente, el importe abonado para la reserva de fecha no será reembolsable, ya que la fecha queda bloqueada exclusivamente para el evento.'},
    {titulo:'5. Uso del material', texto:'Somos Magma podrá utilizar fotografías y fragmentos del material realizado con fines de portfolio, sitio web y redes sociales. Si preferís mantener el material privado, comunicalo por escrito previamente.'},
  ],
}

// Carga una imagen del public y devuelve dataURL (base64). null si falla.
const loadImageAsDataURL = async (url) => {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const blob = await r.blob()
    return await new Promise(resolve => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result)
      fr.onerror = () => resolve(null)
      fr.readAsDataURL(blob)
    })
  } catch { return null }
}

export default function Presupuesto() {
  const hoy = new Date().toISOString().slice(0,10)
  const [form, setForm] = useState({
    nro:'', fechaEmision:hoy, cliente:'', agencia:'', proyecto:'', fechaEvento:'',
    servicios:[''], observaciones:'', descripcion:'', precioTotal:'',
    pagoAlt:false, pagoAltDias:'30', pagoAltMonto:'', plazo:'7',
    tipoPresu: 'cobertura',  // 'cobertura' (eventos, fotos, video) o 'produccion' (animación, motion, larga)
  })
  const [validez, setValidez] = useState(addDays(hoy, 5))
  // Cláusulas editables — se reinician cuando cambia el tipo
  const tipoActual = form.tipoPresu
  const tplBase = tipoActual === 'produccion' ? CLAUSULAS_PROD : CLAUSULAS_COBERTURA
  const [clausulas, setClausulas] = useState(tplBase)
  useEffect(() => {
    setClausulas(form.tipoPresu === 'produccion' ? CLAUSULAS_PROD : CLAUSULAS_COBERTURA)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.tipoPresu])
  const [loading, setLoading] = useState(false)
  const [generando, setGenerando] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const nro = params.get('nro')
    if (!nro) return
    setLoading(true)
    // Forzar fresh (saltear cache de 30s) para que los servicios recién cargados aparezcan
    fetch('/api/data?fresh=1')
      .then(r => r.json())
      .then(d => {
        const p = (d.data?.presupuestos || []).find(x => String(x['Columna 1']) === String(nro))
        if (!p) { console.warn('Presu no encontrado:', nro); return }
        // Usa getPedidos() robusto: busca cualquier key 'Pedido N' sin importar espaciado raro
        const pedidosRaw = getPedidos(p)
        const svcs = pedidosRaw.map(prettifySvc)
        console.log('[Presu '+nro+'] Pedidos raw del sheet:', pedidosRaw, '· prettified:', svcs, '· observaciones:', JSON.stringify(p['Observaciones']||''))
        const fechaHoy = new Date().toISOString().slice(0,10)
        // Fecha evento: usar Fecha Adicionales si hay rango/multiples
        const fechaEv = (() => {
          const tipo = String(p['Tipo Fechas']||'').trim()
          const fe = String(p['Fecha Evento']||'').trim()
          const adicionales = String(p['Fechas Adicionales']||'').trim()
          if (tipo === 'rango' && adicionales) return `${fe} al ${adicionales}`
          if (tipo === 'multi' && adicionales) return [fe, ...adicionales.split('|').filter(Boolean)].join(', ')
          return fe
        })()
        setForm(prev => ({
          ...prev,
          nro: String(p['Columna 1']||''),
          cliente: p['Cliente']||'',
          agencia: p['Agencia']||'',
          proyecto: p['Proyecto']||'',
          fechaEvento: fechaEv,
          precioTotal: String(Math.round(parseMonto(p['Precio Final']))),
          servicios: svcs.length > 0 ? svcs : [''],
          observaciones: p['Observaciones']||'',  // autocompletar desde el sheet (lo que escribió el PM)
          fechaEmision: fechaHoy,
        }))
        setValidez(addDays(fechaHoy, 20))
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (form.fechaEmision) setValidez(addDays(form.fechaEmision, 20))
  }, [form.fechaEmision])

  const setF = (k,v) => setForm(p => ({...p,[k]:v}))
  const setSvc = (i,v) => { const s=[...form.servicios]; s[i]=v; setF('servicios',s) }
  const addSvc = () => setF('servicios',[...form.servicios,''])
  const delSvc = i => setF('servicios', form.servicios.filter((_,j)=>j!==i))

  const S = {
    inp: { background:'#111', border:'0.5px solid #2A2A2A', borderRadius:6, color:'#F0F0F0', fontSize:13, padding:'9px 12px', outline:'none', width:'100%', fontFamily:'inherit', boxSizing:'border-box' },
    lbl: { fontSize:11, color:'#555', display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.06em' },
    card: { background:'#111', border:'0.5px solid #1E1E1E', borderRadius:10, padding:20 },
    sec: { fontSize:10, textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:700, marginBottom:14 },
  }

  const generarPDF = async () => {
    if (!form.cliente || !form.precioTotal) return
    setGenerando(true)
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' })
      const W=210, H=297, M=18
      let y=0

      // Cargar assets (logo + líneas onduladas) en paralelo
      const [logoImg, lineaTitulo, lineaTotal, lineaDivider, lineaSeccion, banderinImg] = await Promise.all([
        loadImageAsDataURL('/branding/logo-magma.png'),
        loadImageAsDataURL('/branding/linea-titulo.png'),
        loadImageAsDataURL('/branding/linea-total.png'),
        loadImageAsDataURL('/branding/linea-divider.png'),
        loadImageAsDataURL('/branding/linea-seccion.png'),
        loadImageAsDataURL('/branding/banderin.png'),
      ])

      // ====== FONDO BLANCO ======
      doc.setFillColor(255,255,255); doc.rect(0,0,W,H,'F')

      // ════════════════════════════════════════════════════════════════════
      // PALETA OFICIAL DEL MANUAL DE MARCA
      // ════════════════════════════════════════════════════════════════════
      const C = {
        black:   [9,9,9],        // BLACK #090909
        magma:   [206,38,55],    // MAGMA #CE2637 (rojo de marca)
        azul:    [21,67,248],    // AZUL #1543f8
        purple:  [150,53,171],   // PURPLE #9635ab
        gris:    [120,120,120],  // gris medio para etiquetas
        grisL:   [191,191,191],  // LAVA LIGHT #bfbfbf
        texto:   [55,55,55],     // cuerpo
        muted:   [140,140,140],  // etiquetas pequeñas
      }
      // TIPOGRAFÍA — Helvetica = stand-in de Archivo/Obviously (no se pueden cargar custom en jsPDF sin embed)
      //              Courier   = stand-in de Azeret Mono (datos técnicos/destacados)

      // ════════════════════════════════════════════════════════════════════
      // HEADER — Logo izq + Datos cliente der (Courier para mono)
      // ════════════════════════════════════════════════════════════════════
      if (logoImg) {
        try { doc.addImage(logoImg, 'PNG', M, 14, 36, 16) } catch(e) {}
      } else {
        doc.setFont('helvetica','bold'); doc.setFontSize(24); doc.setTextColor(...C.black)
        doc.text('MAGMA', M, 26)
      }

      // Banderín colorido encima de los datos
      if (banderinImg) { try { doc.addImage(banderinImg, 'PNG', W-M-26, 12, 22, 2.5) } catch(e) {} }
      else {
        doc.setFillColor(...C.azul); doc.rect(W-M-26, 13, 12, 1.2, 'F')
        doc.setFillColor(...C.magma); doc.rect(W-M-13, 13, 9, 1.2, 'F')
      }

      // Datos en Azeret Mono (Courier proxy) — manual: terminal-style
      doc.setFont('courier','normal'); doc.setFontSize(8.5); doc.setTextColor(...C.texto)
      doc.text('Somos Magma',     W-M, 19,   {align:'right'})
      doc.text('Buenos Aires',    W-M, 23,   {align:'right'})
      doc.text(toDisplay(form.fechaEmision), W-M, 27, {align:'right'})
      doc.text('Presu. N°'+(form.nro||'___'), W-M, 31, {align:'right'})

      // ════════════════════════════════════════════════════════════════════
      // DIVISOR pincelado
      // ════════════════════════════════════════════════════════════════════
      y = 38
      if (lineaDivider) { try { doc.addImage(lineaDivider, 'PNG', M, y-2, W-M*2, 2.5) } catch(e) {} }
      else { doc.setDrawColor(...C.black); doc.setLineWidth(0.3); doc.line(M, y, W-M, y) }

      // ════════════════════════════════════════════════════════════════════
      // TÍTULO PRINCIPAL (single h1 — 18pt) — manual jerarquía: TÍTULO
      // ════════════════════════════════════════════════════════════════════
      y += 12
      doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(...C.black)
      const titulo = form.tipoPresu === 'produccion' ? 'Presupuesto Producción Audiovisual' : 'Propuesta servicio audiovisual'
      doc.text(titulo, M, y)
      // squiggle ondulado debajo del título
      if (lineaTitulo) { try { doc.addImage(lineaTitulo, 'PNG', M, y+1.8, 38, 3) } catch(e) {} }

      // ════════════════════════════════════════════════════════════════════
      // DATOS CLIENTE — sin caja con borde, formato dos columnas con label arriba
      // ════════════════════════════════════════════════════════════════════
      y += 14
      // Cliente | Agencia en grid de 2 cols
      const colW = (W-M*2)/2
      doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...C.muted)
      doc.text('CLIENTE', M, y)
      if (form.agencia) doc.text('AGENCIA', M+colW, y)
      y += 5
      doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(...C.black)
      doc.text(form.cliente || '—', M, y)
      if (form.agencia) doc.text(form.agencia, M+colW, y)
      y += 4
      // línea fina divisoria
      doc.setDrawColor(...C.grisL); doc.setLineWidth(0.2); doc.line(M, y, W-M, y)

      // ════════════════════════════════════════════════════════════════════
      // PROYECTO — bloque separado abajo (orden Juan)
      // ════════════════════════════════════════════════════════════════════
      y += 9
      doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...C.muted)
      doc.text('PROYECTO', M, y)
      y += 5
      doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.setTextColor(...C.black)
      const proyText = form.proyecto || ''
      const proyLines = doc.splitTextToSize(proyText, W-M*2)
      doc.text(proyLines, M, y); y += proyLines.length * 5.8
      // Fecha del evento debajo en Courier (azeret mono — destacado)
      if (form.fechaEvento) {
        y += 1
        doc.setFont('courier','normal'); doc.setFontSize(9); doc.setTextColor(...C.magma)
        doc.text(form.fechaEvento, M, y)
      }
      y += 10

      // ════════════════════════════════════════════════════════════════════
      // DESCRIPCIÓN larga (modo Producción)
      // ════════════════════════════════════════════════════════════════════
      if (form.descripcion) {
        doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(...C.texto)
        const desc = doc.splitTextToSize(form.descripcion, W-M*2)
        doc.text(desc, M, y); y += desc.length*5 + 5
      }

      // ════════════════════════════════════════════════════════════════════
      // SERVICIOS INCLUIDOS — sin warning rojo, sin emojis raros
      // ════════════════════════════════════════════════════════════════════
      const svcsLimpios = form.servicios.map(s => prettifySvc(s)).filter(Boolean)
      if (svcsLimpios.length > 0) {
        doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(...C.black)
        doc.text('El servicio incluye:', M, y); y += 6
        doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(...C.texto)
        const svcsMap = {}, orden = []
        for (const s of svcsLimpios) { if (!svcsMap[s]) { svcsMap[s]=0; orden.push(s) } svcsMap[s]++ }
        for (const s of orden) {
          const cant = svcsMap[s]
          const label = cant > 1 ? `${cant} ${s}` : s
          // Cuadrado pequeño negro como bullet (manual: figuras geométricas simples)
          doc.setFillColor(...C.black); doc.rect(M, y-2, 1.5, 1.5, 'F')
          const lines = doc.splitTextToSize(label, W-M*2-7)
          doc.text(lines, M+5, y)
          y += lines.length * 5
        }
        y += 6
      } else {
        // Si no hay servicios → solo deja el espacio en blanco, sin alarmar
        y += 2
      }

      // ════════════════════════════════════════════════════════════════════
      // OBSERVACIONES — caja sutil con borde izq color magma
      // ════════════════════════════════════════════════════════════════════
      if (form.observaciones && form.observaciones.trim()) {
        const obs = doc.splitTextToSize(form.observaciones.trim(), W-M*2-8)
        const obsH = obs.length*4.8 + 9
        doc.setFillColor(250,250,250); doc.rect(M, y-3, W-M*2, obsH, 'F')
        doc.setDrawColor(...C.magma); doc.setLineWidth(0.8); doc.line(M, y-3, M, y-3+obsH)
        doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...C.muted)
        doc.text('OBSERVACIONES', M+5, y+0.5)
        doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(...C.texto)
        doc.text(obs, M+5, y+5)
        y += obsH + 4
      }

      // ════════════════════════════════════════════════════════════════════
      // VALOR TOTAL — h2 jerarquía
      // ════════════════════════════════════════════════════════════════════
      y += 4
      doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.setTextColor(...C.black)
      doc.text('Valor total', M, y)
      const totalLabelW = doc.getTextWidth('Valor total')
      const precioStr = '$' + fmt$(form.precioTotal) + ' + IVA'
      const precioW = doc.getTextWidth(precioStr)
      doc.setLineWidth(0.5); doc.setDrawColor(...C.black)
      doc.line(M+totalLabelW+4, y-0.5, W-M-precioW-3, y-0.5)
      doc.text(precioStr, W-M, y, {align:'right'})

      // Línea ondulada de color debajo
      y += 5
      if (lineaTotal) { try { doc.addImage(lineaTotal, 'PNG', M, y, W-M*2, 4.5) } catch(e) {} }
      y += 11

      // ════════════════════════════════════════════════════════════════════
      // TÉRMINOS Y CONDICIONES — manual jerarquía: subtítulo + cuerpo + destacado(mono)
      // ════════════════════════════════════════════════════════════════════
      // Validez
      doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(...C.magma)
      doc.text('CONDICIONES GENERALES', M, y); y += 4
      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...C.texto)
      const validezTxt = doc.splitTextToSize(clausulas.validez, W-M*2)
      doc.text(validezTxt, M, y); y += validezTxt.length*3.8 + 4

      // Condiciones de Pago
      doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(...C.magma)
      doc.text('CONDICIONES DE PAGO', M, y); y += 4
      doc.setFontSize(8)
      for (const p of clausulas.pago) {
        doc.setFont('helvetica','bold'); doc.setTextColor(...C.black)
        doc.text(p.titulo+': ', M, y)
        const tw = doc.getTextWidth(p.titulo+': ')
        doc.setFont('helvetica','normal'); doc.setTextColor(...C.texto)
        const ls = doc.splitTextToSize(p.texto, W-M*2-tw)
        if (ls[0]) doc.text(ls[0], M+tw, y)
        for (let i=1; i<ls.length; i++) { y += 3.5; doc.text(ls[i], M, y) }
        y += 4.5
      }
      y += 2

      // Cláusulas
      const tituloClausulas = form.tipoPresu === 'produccion' ? 'CLÁUSULAS PARA EL COBRO Y LA ENTREGA' : 'CLÁUSULAS DEL SERVICIO'
      doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(...C.magma)
      doc.text(tituloClausulas, M, y); y += 4

      doc.setFontSize(8)
      for (const c of clausulas.clausulas) {
        doc.setFont('helvetica','bold'); doc.setTextColor(...C.black)
        doc.text(c.titulo+': ', M, y)
        const tw = doc.getTextWidth(c.titulo+': ')
        doc.setFont('helvetica','normal'); doc.setTextColor(...C.texto)
        const ls = doc.splitTextToSize(c.texto, W-M*2-tw)
        if (ls[0]) doc.text(ls[0], M+tw, y)
        for (let i=1; i<ls.length; i++) { y += 3.5; doc.text(ls[i], M, y) }
        y += 4.5
      }

      if (y > H - 5) console.warn('PDF desbordó la página', y, 'mm de', H)

      // Nombre archivo: presu-NRO-cliente-agencia.pdf
      const slug = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')
      const partesNombre = [
        'presu',
        form.nro || 'borrador',
        slug(form.cliente) || 'cliente',
        form.agencia ? slug(form.agencia) : null,
      ].filter(Boolean)
      doc.save(partesNombre.join('-') + '.pdf')
    } catch(e){ alert('Error: '+e.message) }
    setGenerando(false)
  }

  if(loading) return <div style={{minHeight:'100vh',background:'#090909',display:'flex',alignItems:'center',justifyContent:'center',color:'#555',fontSize:13}}>Cargando presupuesto...</div>

  return (<>
    <Head><title>Presupuesto {form.nro?'#'+form.nro:''} | Somos Magma</title></Head>
    <div style={{minHeight:'100vh',background:'#090909',color:'#F0F0F0',fontFamily:'system-ui,sans-serif'}}>

      <div style={{padding:'14px 28px',borderBottom:'0.5px solid #1A1A1A',display:'flex',alignItems:'center',gap:10,position:'sticky',top:0,background:'#090909',zIndex:10}}>
        <a href="/" style={{textDecoration:'none',display:'flex',alignItems:'baseline',gap:4}}>
          <span style={{fontSize:11,color:'#666'}}>somos</span>
          <span style={{fontSize:17,fontWeight:900,color:'#CE2637',letterSpacing:1}}>MAGMA</span>
          <span style={{fontSize:14,color:'#1543F8',fontWeight:700}}>//</span>
        </a>
        <span style={{color:'#2A2A2A',fontSize:12}}>→</span>
        <span style={{fontSize:12,color:'#555'}}>Generador de Presupuesto</span>
        {form.nro&&<span style={{fontSize:11,fontFamily:'monospace',color:'#1543F8',background:'#1543F810',padding:'2px 8px',borderRadius:4}}>#{form.nro}</span>}
      </div>

      <div style={{maxWidth:700,margin:'0 auto',padding:'32px 20px 60px'}}>
        <h1 style={{fontSize:24,fontWeight:900,margin:'0 0 4px',letterSpacing:-0.5}}>Generar <span style={{color:'#CE2637'}}>PDF</span></h1>
        <p style={{color:'#555',fontSize:13,margin:'0 0 28px'}}>Los datos se cargan automáticamente del presu. Editá lo que necesites y generá el PDF.</p>

        <div style={{display:'grid',gap:14}}>

          <div style={S.card}>
            <div style={{...S.sec,color:'#CE2637'}}>Tipo de presupuesto</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
              <button onClick={()=>setF('tipoPresu','cobertura')} style={{padding:'12px',borderRadius:8,border:'0.5px solid '+(form.tipoPresu==='cobertura'?'#1543F8':'#2A2A2A'),background:form.tipoPresu==='cobertura'?'#1543F818':'transparent',color:form.tipoPresu==='cobertura'?'#1543F8':'#888',fontSize:12,cursor:'pointer',textAlign:'left'}}>
                <div style={{fontWeight:600,marginBottom:3}}>📸 Cobertura / Evento</div>
                <div style={{fontSize:10,color:form.tipoPresu==='cobertura'?'#1543F8':'#555',lineHeight:1.4}}>Fotografía, video, evento corporativo, casamiento. Pago 50/50. Validez 20 días.</div>
              </button>
              <button onClick={()=>setF('tipoPresu','produccion')} style={{padding:'12px',borderRadius:8,border:'0.5px solid '+(form.tipoPresu==='produccion'?'#CE2637':'#2A2A2A'),background:form.tipoPresu==='produccion'?'#CE263718':'transparent',color:form.tipoPresu==='produccion'?'#CE2637':'#888',fontSize:12,cursor:'pointer',textAlign:'left'}}>
                <div style={{fontWeight:600,marginBottom:3}}>🎬 Producción Audiovisual</div>
                <div style={{fontSize:10,color:form.tipoPresu==='produccion'?'#CE2637':'#555',lineHeight:1.4}}>Animación, motion, IA, post-producción larga. Pago 50/30/20. Validez 5 días hábiles.</div>
              </button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <label><span style={S.lbl}>N° presupuesto</span><input style={S.inp} value={form.nro} onChange={e=>setF('nro',e.target.value)} placeholder="ej: 944a"/></label>
              <label><span style={S.lbl}>Fecha de emisión</span><input style={S.inp} type="date" value={form.fechaEmision} onChange={e=>setF('fechaEmision',e.target.value)}/></label>
            </div>
            <div style={{marginTop:8,padding:'7px 10px',background:'#0D0D0D',borderRadius:6,fontSize:11,color:'#555'}}>
              Validez: <span style={{color:'#1D9E75'}}>{form.tipoPresu==='produccion'?'5 días hábiles':'20 días'}</span> · Cambia automáticamente con el tipo de presupuesto
            </div>
          </div>

          <div style={S.card}>
            <div style={{...S.sec,color:'#1543F8'}}>Cliente</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
              <label><span style={S.lbl}>Cliente *</span><input style={S.inp} value={form.cliente} onChange={e=>setF('cliente',e.target.value)} placeholder="ej: CMQ"/></label>
              <label><span style={S.lbl}>Agencia</span><input style={S.inp} value={form.agencia} onChange={e=>setF('agencia',e.target.value)} placeholder="opcional"/></label>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <label><span style={S.lbl}>Fecha del evento</span><input style={S.inp} value={form.fechaEvento} onChange={e=>setF('fechaEvento',e.target.value)} placeholder="ej: 15/10/2025 o 10/10/2026 al 12/10/2026"/></label>
              <label><span style={S.lbl}>Proyecto</span><input style={S.inp} value={form.proyecto} onChange={e=>setF('proyecto',e.target.value)} placeholder="ej: Convencion Ferrero"/></label>
            </div>
          </div>

          <div style={S.card}>
            <div style={{...S.sec,color:'#9635AB'}}>Servicios</div>
            <div style={{fontSize:11,color:'#555',marginBottom:10}}>Pre-cargados desde el presu con descripción amigable. Editá libremente. Si repetís, aparece agrupado con cantidad.</div>
            <div style={{display:'grid',gap:8}}>
              {form.servicios.map((s,i)=>(
                <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 28px',gap:6,alignItems:'center'}}>
                  <input style={S.inp} value={s} onChange={e=>setSvc(i,e.target.value)} placeholder={'Servicio '+(i+1)}/>
                  <button onClick={()=>delSvc(i)} style={{width:28,height:36,border:'0.5px solid #2A2A2A',background:'transparent',color:'#555',cursor:'pointer',borderRadius:6,fontSize:15}}>×</button>
                </div>
              ))}
              <button onClick={addSvc} style={{padding:'7px',borderRadius:6,border:'0.5px dashed #2A2A2A',background:'transparent',color:'#555',fontSize:11,cursor:'pointer'}}>+ Agregar servicio</button>
            </div>
          </div>

          {form.tipoPresu==='produccion'&&<div style={S.card}>
            <div style={{...S.sec,color:'#CE2637'}}>Descripción del proyecto</div>
            <div style={{fontSize:11,color:'#555',marginBottom:8}}>Texto largo descriptivo del proyecto. Aparece arriba de la lista de "Incluye:" en el PDF.</div>
            <textarea style={{...S.inp,minHeight:90,resize:'vertical',fontSize:12,lineHeight:1.5}} value={form.descripcion} onChange={e=>setF('descripcion',e.target.value)} placeholder="Ej: Producción y postproducción de pieza audiovisual corporativa de aproximadamente 5 minutos de duración, desarrollada a partir de assets, referencias visuales, motions y guión provistos por el cliente."/>
          </div>}

          <div style={S.card}>
            <div style={{...S.sec,color:'#555'}}>Observaciones / notas extra</div>
            <textarea style={{...S.inp,minHeight:60,resize:'vertical'}} value={form.observaciones} onChange={e=>setF('observaciones',e.target.value)} placeholder="Ej: Evento de 3 días Hotel AMBA · 1 día 9am a 18hs 21hs a 24hs · 2 día..."/>
          </div>

          <div style={S.card}>
            <div style={{...S.sec,color:'#CE2637'}}>Precio</div>
            <label>
              <span style={S.lbl}>Valor total *</span>
              <input style={{...S.inp,border:'0.5px solid #CE263740',fontSize:14,fontFamily:'monospace'}} type="number" value={form.precioTotal} onChange={e=>setF('precioTotal',e.target.value)} placeholder="ej: 2550000"/>
            </label>
            {form.precioTotal&&<div style={{marginTop:8,padding:'7px 10px',background:'#CE263708',border:'0.5px solid #CE263720',borderRadius:6,fontSize:12,color:'#CE2637',fontFamily:'monospace'}}>${fmt$(form.precioTotal)} + IVA</div>}

            <div style={{marginTop:14,borderTop:'0.5px solid #1A1A1A',paddingTop:14}}>
              <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',marginBottom:form.pagoAlt?12:0}}>
                <input type="checkbox" checked={form.pagoAlt} onChange={e=>setF('pagoAlt',e.target.checked)} style={{accentColor:'#1543F8',width:14,height:14}}/>
                <span style={{fontSize:12,color:'#555'}}>Agregar opción de pago a plazo</span>
              </label>
              {form.pagoAlt&&(
                <div style={{display:'grid',gridTemplateColumns:'120px 1fr',gap:10}}>
                  <label><span style={S.lbl}>Días</span>
                    <select style={{...S.inp,cursor:'pointer'}} value={form.pagoAltDias} onChange={e=>setF('pagoAltDias',e.target.value)}>
                      <option value="30">30 días</option>
                      <option value="60">60 días</option>
                    </select>
                  </label>
                  <label><span style={S.lbl}>Monto</span>
                    <input style={{...S.inp,fontFamily:'monospace'}} type="number" value={form.pagoAltMonto} onChange={e=>setF('pagoAltMonto',e.target.value)} placeholder="ej: 2800000"/>
                  </label>
                </div>
              )}
            </div>

            <div style={{marginTop:12}}>
              <label><span style={S.lbl}>Plazo de pago contado</span>
                <select style={{...S.inp,cursor:'pointer'}} value={form.plazo} onChange={e=>setF('plazo',e.target.value)}>
                  <option value="7">7 días</option>
                  <option value="10">10 días</option>
                  <option value="15">15 días</option>
                  <option value="30">30 días</option>
                </select>
              </label>
            </div>
          </div>

          <div style={S.card}>
            <div style={{...S.sec,color:'#555'}}>Términos y condiciones</div>
            <div style={{fontSize:11,color:'#555',marginBottom:12}}>Editá si necesitás. Si cambiás el tipo de presupuesto arriba, se reinicia con el template default.</div>

            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,color:'#CE2637',fontWeight:600,marginBottom:4}}>Validez (condiciones generales)</div>
              <textarea style={{...S.inp,minHeight:48,resize:'vertical',fontSize:11}} value={clausulas.validez} onChange={e=>setClausulas(c=>({...c,validez:e.target.value}))}/>
            </div>

            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,color:'#CE2637',fontWeight:600,marginBottom:6}}>Condiciones de Pago ({clausulas.pago.length} ítems)</div>
              {clausulas.pago.map((p,i)=>(
                <div key={i} style={{marginBottom:8,padding:'8px 10px',background:'#0D0D0D',borderRadius:6,border:'0.5px solid #1A1A1A'}}>
                  <input style={{...S.inp,fontSize:11,fontWeight:600,marginBottom:6}} value={p.titulo} onChange={e=>{const n=[...clausulas.pago];n[i]={...n[i],titulo:e.target.value};setClausulas(c=>({...c,pago:n}))}}/>
                  <textarea style={{...S.inp,minHeight:40,resize:'vertical',fontSize:11}} value={p.texto} onChange={e=>{const n=[...clausulas.pago];n[i]={...n[i],texto:e.target.value};setClausulas(c=>({...c,pago:n}))}}/>
                </div>
              ))}
            </div>

            <div>
              <div style={{fontSize:11,color:'#CE2637',fontWeight:600,marginBottom:6}}>Cláusulas ({clausulas.clausulas.length} ítems)</div>
              {clausulas.clausulas.map((c,i)=>(
                <div key={i} style={{marginBottom:8,padding:'8px 10px',background:'#0D0D0D',borderRadius:6,border:'0.5px solid #1A1A1A'}}>
                  <input style={{...S.inp,fontSize:11,fontWeight:600,marginBottom:6}} value={c.titulo} onChange={e=>{const n=[...clausulas.clausulas];n[i]={...n[i],titulo:e.target.value};setClausulas(cl=>({...cl,clausulas:n}))}}/>
                  <textarea style={{...S.inp,minHeight:52,resize:'vertical',fontSize:11}} value={c.texto} onChange={e=>{const n=[...clausulas.clausulas];n[i]={...n[i],texto:e.target.value};setClausulas(cl=>({...cl,clausulas:n}))}}/>
                </div>
              ))}
            </div>
          </div>

          <button onClick={generarPDF} disabled={generando||!form.cliente||!form.precioTotal}
            style={{padding:'15px',borderRadius:10,border:'none',
              background:(!form.cliente||!form.precioTotal)?'#1A1A1A':generando?'#333':'linear-gradient(135deg,#1543F8,#CE2637)',
              color:(!form.cliente||!form.precioTotal)?'#333':'#fff',
              fontSize:15,fontWeight:700,cursor:(!form.cliente||!form.precioTotal||generando)?'not-allowed':'pointer',
              width:'100%',letterSpacing:0.5}}>
            {generando?'Generando...':'↓  Generar y descargar PDF'}
          </button>

        </div>
      </div>
    </div>
  </>)
}
