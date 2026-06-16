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
// BUG histórico: el regex [ -⁯] eliminaba TODO el texto (rango Unicode U+0020 a U+206F incluye letras).
// Ahora apunto a caracteres invisibles específicos sin tocar texto normal.
const stripSvc = s => String(s||'')
  .replace(/[\u{1F300}-\u{1FAFF}]/gu,'')   // emojis pictográficos (😀🎥🚚 etc)
  .replace(/[☀-➿]/g,'')          // símbolos misceláneos (☀ ✈ ⚠ etc)
  .replace(/[​-‏‪-‮⁠-⁯﻿]/g,'')  // zero-width + bidi + word joiner
  .replace(/[︀-️]/g,'')          // variation selectors
  .replace(/^[\s!'"`þÞ]+/, '')              // prefijos de basura al inicio
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
    servicios:[''], adicionales:[], observaciones:'', descripcion:'', precioTotal:'',
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
  const [serviciosRecargando, setServiciosRecargando] = useState(false)
  const [ultimosServiciosDelSheet, setUltimosServiciosDelSheet] = useState([])  // para mostrar en UI

  // Carga el presu del sheet y rellena el form (lo extraemos a función reusable)
  const cargarDelSheet = async (nro) => {
    setLoading(true)
    try {
      const r = await fetch('/api/data?fresh=1&_t='+Date.now(), { cache: 'no-store' })
      const d = await r.json()
      const p = (d.data?.presupuestos || []).find(x => String(x['Columna 1']) === String(nro))
      if (!p) { console.warn('Presu no encontrado:', nro); setLoading(false); return null }
      const pedidosRaw = getPedidos(p)
      // Mapeo precios y flags adicional/precio cliente manual por slot
      const preciosRaw = []
      for (const k of Object.keys(p)) {
        const m = k.match(/^precio\s*(\d+)\s*$/i)
        if (m) preciosRaw[parseInt(m[1])-1] = p[k]
      }
      const esAdicCSV = String(p['Es Adicional']||'').split('|')
      const preciosClienteManualCSV = String(p['Precio Cliente Manual']||'').split('|')
      // Calcular factor del presu base para precio cliente automático de adicionales sin manual
      const parseMontoLocal = v => { const n = parseFloat(String(v||'').replace(/[^\d.-]/g,'')); return isNaN(n)?0:n }
      const subtotalBase = pedidosRaw.reduce((s,_,i) => esAdicCSV[i]==='1' ? s : s+parseMontoLocal(preciosRaw[i]), 0)
      const totalCliente = parseMontoLocal(p['Precio Final'])
      const factor = subtotalBase>0 ? totalCliente/subtotalBase : 1
      // Separar base y adicionales
      const baseSvcs = [], adicionales = []
      pedidosRaw.forEach((ped, i) => {
        if (!ped) return
        const nombre = prettifySvc(ped)
        if (esAdicCSV[i] === '1') {
          const costo = parseMontoLocal(preciosRaw[i])
          const manual = parseMontoLocal(preciosClienteManualCSV[i])
          const precioCliente = manual > 0 ? manual : Math.round(costo * factor)
          adicionales.push({nombre, precio: precioCliente})
        } else {
          baseSvcs.push(nombre)
        }
      })
      console.log('[Presu '+nro+'] base:', baseSvcs, '· adicionales:', adicionales)
      setUltimosServiciosDelSheet(baseSvcs)
      return { p, svcs: baseSvcs, adicionales }
    } catch (e) {
      console.error('Error cargando presu:', e)
      setLoading(false)
      return null
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const nro = params.get('nro')
    if (!nro) return
    cargarDelSheet(nro).then(res => {
      if (!res) { setLoading(false); return }
      const { p, svcs, adicionales } = res
      const fechaHoy = new Date().toISOString().slice(0,10)
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
        adicionales: adicionales || [],
        observaciones: p['Observaciones']||'',
        fechaEmision: fechaHoy,
      }))
      setValidez(addDays(fechaHoy, 20))
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recarga manual de servicios desde el sheet (botón ↻ en el form)
  const recargarServicios = async () => {
    const nro = form.nro || new URLSearchParams(window.location.search).get('nro')
    if (!nro) return
    setServiciosRecargando(true)
    const res = await cargarDelSheet(nro)
    setLoading(false)
    if (res && res.svcs.length > 0) {
      setForm(prev => ({...prev, servicios: res.svcs}))
    }
    setServiciosRecargando(false)
  }

  useEffect(() => {
    if (form.fechaEmision) setValidez(addDays(form.fechaEmision, 20))
  }, [form.fechaEmision])

  const setF = (k,v) => setForm(p => ({...p,[k]:v}))
  const setSvc = (i,v) => { const s=[...form.servicios]; s[i]=v; setF('servicios',s) }
  const addSvc = () => setF('servicios',[...form.servicios,''])
  const delSvc = i => setF('servicios', form.servicios.filter((_,j)=>j!==i))
  const updAdic = (i,k,v) => setForm(p => ({...p, adicionales:(p.adicionales||[]).map((a,j)=>j===i?{...a,[k]:v}:a)}))
  const addAdic = () => setForm(p => ({...p, adicionales:[...(p.adicionales||[]),{nombre:'',precio:''}]}))
  const delAdic = i => setForm(p => ({...p, adicionales:(p.adicionales||[]).filter((_,j)=>j!==i)}))

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
      // Fecha del evento debajo en Courier (azeret mono — destacado) con label "Fecha: "
      if (form.fechaEvento) {
        y += 1
        doc.setFont('courier','normal'); doc.setFontSize(9); doc.setTextColor(...C.magma)
        doc.text('Fecha: '+form.fechaEvento, M, y)
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
        doc.text('DETALLE DE SERVICIO', M+5, y+0.5)
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
      // ADICIONALES OPCIONALES — debajo del total, misma tipografía + total con adicionales
      // ════════════════════════════════════════════════════════════════════
      if ((form.adicionales||[]).length > 0) {
        doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(...C.azul)
        doc.text('Adicionales opcionales', M, y); y += 5
        doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(...C.texto)
        let sumaAdic = 0
        for (const a of form.adicionales) {
          const nombre = prettifySvc(a.nombre)
          sumaAdic += Number(a.precio) || 0
          const precioTxt = '$' + fmt$(a.precio) + ' + IVA'
          const precioW = doc.getTextWidth(precioTxt)
          const nombreLines = doc.splitTextToSize(nombre, W-M*2 - precioW - 8)
          doc.text(nombreLines[0], M, y)
          doc.text(precioTxt, W-M, y, {align:'right'})
          y += 5.5
        }
        doc.setFont('helvetica','italic'); doc.setFontSize(7.5); doc.setTextColor(...C.muted)
        doc.text('Estos servicios se cotizan aparte. Indicanos cuáles querés sumar.', M, y); y += 7
        // Valor total CON adicionales — misma jerarquía que el total
        const totalConAdic = (Number(form.precioTotal)||0) + sumaAdic
        doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.setTextColor(...C.black)
        doc.text('Valor total con adicionales', M, y)
        const lblW = doc.getTextWidth('Valor total con adicionales')
        const pStr = '$' + fmt$(totalConAdic) + ' + IVA'
        const pW = doc.getTextWidth(pStr)
        doc.setLineWidth(0.5); doc.setDrawColor(...C.black)
        doc.line(M+lblW+4, y-0.5, W-M-pW-3, y-0.5)
        doc.text(pStr, W-M, y, {align:'right'})
        y += 5
        if (lineaTotal) { try { doc.addImage(lineaTotal, 'PNG', M, y, W-M*2, 4.5) } catch(e) {} }
        y += 11
      }

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

      // Nombre archivo: Presu-NRO-Agencia-Cliente.pdf (Title Case, sin tildes)
      const titleCase = s => String(s||'')
        .normalize('NFD').replace(/[̀-ͯ]/g,'')                    // sacar tildes
        .replace(/[^a-zA-Z0-9 ]+/g,' ').trim().split(/\s+/)          // limpiar y dividir
        .map(w => w.charAt(0).toUpperCase()+w.slice(1).toLowerCase())  // capitalizar
        .join('-')
      const partesNombre = [
        'Presu',
        form.nro || 'Borrador',
        form.agencia ? titleCase(form.agencia) : null,
        titleCase(form.cliente) || 'Cliente',
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

      <div style={{maxWidth:1480,margin:'0 auto',padding:'24px 20px 60px',display:'grid',gridTemplateColumns:'minmax(360px,1fr) minmax(440px,1.05fr)',gap:24}}>
        <div>
        <h1 style={{fontSize:22,fontWeight:900,margin:'0 0 4px',letterSpacing:-0.5}}>Generar <span style={{color:'#CE2637'}}>PDF</span></h1>
        <p style={{color:'#555',fontSize:12,margin:'0 0 20px'}}>Editá los datos. El preview de la derecha muestra cómo va a quedar el PDF.</p>

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
            <div style={{...S.sec,color:'#9635AB',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span>Servicios</span>
              <button onClick={recargarServicios} disabled={serviciosRecargando} title="Volver a leer los servicios del sheet" style={{fontSize:10,padding:'3px 8px',borderRadius:4,border:'0.5px solid #9635AB60',background:'#9635AB15',color:'#9635AB',cursor:'pointer',fontWeight:500,opacity:serviciosRecargando?0.5:1,textTransform:'none',letterSpacing:0}}>
                {serviciosRecargando ? '...' : '↻ Recargar del sheet'}
              </button>
            </div>
            <div style={{fontSize:11,color:'#555',marginBottom:10}}>Pre-cargados desde el presu con descripción amigable. Editá libremente. Si repetís, aparece agrupado con cantidad.</div>
            {ultimosServiciosDelSheet.length > 0 && <div style={{padding:'8px 10px',background:'#1D9E7508',border:'0.5px solid #1D9E7530',borderRadius:6,marginBottom:10,fontSize:11,color:'#1D9E75'}}>
              <span style={{fontWeight:600}}>Sheet trajo:</span> {ultimosServiciosDelSheet.join(' · ')}
            </div>}
            {ultimosServiciosDelSheet.length === 0 && !loading && <div style={{padding:'8px 10px',background:'#BA751708',border:'0.5px solid #BA751730',borderRadius:6,marginBottom:10,fontSize:11,color:'#BA7517'}}>
              ⚠ El sheet no devolvió servicios. Probá ↻ Recargar o completalos manualmente abajo.
            </div>}
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
            <div style={{...S.sec,color:'#1543F8'}}>Adicionales opcionales</div>
            <div style={{fontSize:11,color:'#555',marginBottom:8}}>Se cotizan aparte. Aparecen debajo del Valor total en el PDF.</div>
            {(form.adicionales||[]).map((a,i)=>(
              <div key={i} style={{display:'flex',gap:8,marginBottom:8}}>
                <input style={{...S.inp,flex:1}} value={a.nombre} onChange={e=>updAdic(i,'nombre',e.target.value)} placeholder="Ej: Edición video 60s"/>
                <input style={{...S.inp,width:120,fontFamily:'monospace'}} type="number" value={a.precio} onChange={e=>updAdic(i,'precio',e.target.value)} placeholder="precio"/>
                <button onClick={()=>delAdic(i)} style={{width:28,height:36,border:'0.5px solid #2A2A2A',background:'transparent',color:'#555',cursor:'pointer',borderRadius:6,fontSize:15}}>×</button>
              </div>
            ))}
            <button onClick={addAdic} style={{padding:'7px',borderRadius:6,border:'0.5px dashed #1543F840',background:'transparent',color:'#1543F8',fontSize:11,cursor:'pointer'}}>+ Agregar adicional</button>
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
        {/* ════════════════ PREVIEW COLUMN ════════════════ */}
        <div style={{position:'sticky',top:14,alignSelf:'flex-start',maxHeight:'calc(100vh - 28px)',overflowY:'auto'}}>
          <div style={{fontSize:10,color:'#666',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8,fontWeight:600}}>Preview del PDF</div>
          <PreviewPDF form={form} clausulas={clausulas}/>
        </div>
      </div>
    </div>
  </>)
}

// ════════════════════════════════════════════════════════════════════
// PREVIEW HTML — réplica simplificada del PDF para edición en vivo
// ════════════════════════════════════════════════════════════════════
function PreviewPDF({form, clausulas}) {
  const titulo = form.tipoPresu === 'produccion' ? 'Presupuesto Producción Audiovisual' : 'Propuesta servicio audiovisual'
  // Servicios prettified + agrupados
  const svcsLimpios = (form.servicios||[]).map(s => prettifySvc(s)).filter(Boolean)
  const svcsMap = {}
  const orden = []
  for (const s of svcsLimpios) { if (!svcsMap[s]) { svcsMap[s]=0; orden.push(s) } svcsMap[s]++ }

  const C = {
    black: '#090909', magma: '#CE2637', azul: '#1543F8',
    texto: '#373737', gris: '#787878', muted: '#8C8C8C',
    bg: '#fff', boxBg: '#FAFAFA',
  }
  const S = {
    page: {background:C.bg, color:C.texto, fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif", padding:'24px 28px', borderRadius:8, border:'0.5px solid #2A2A2A', fontSize:11, lineHeight:1.4},
    mono: {fontFamily:"'Courier New',monospace"},
    label: {fontSize:8.5, color:C.gris, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4, fontWeight:500},
    h1: {fontSize:18, fontWeight:700, color:C.black, lineHeight:1.1, marginBottom:8},
    h2: {fontSize:13, fontWeight:700, color:C.black, lineHeight:1.2, margin:'0 0 4px'},
    cuerpo: {fontSize:10.5, color:C.texto, lineHeight:1.5},
    sec: {fontSize:9, color:C.magma, fontWeight:700, textTransform:'uppercase', letterSpacing:'.04em', margin:'12px 0 5px'},
    bullet: {display:'flex',gap:7,alignItems:'flex-start',padding:'2px 0'},
    cuadrado: {flexShrink:0, width:5, height:5, background:C.black, marginTop:6},
  }

  return <div style={S.page}>
    {/* HEADER */}
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
      <img src="/branding/logo-magma.png" alt="MAGMA" style={{height:32,width:'auto'}} onError={e=>e.target.style.display='none'}/>
      <div style={{textAlign:'right'}}>
        <img src="/branding/banderin.png" alt="" style={{height:8,marginBottom:3,display:'block',marginLeft:'auto'}} onError={e=>e.target.style.display='none'}/>
        <div style={{...S.mono, fontSize:9, color:C.texto, lineHeight:1.5}}>
          <div>Somos Magma</div>
          <div>Buenos Aires</div>
          <div>{toDisplay(form.fechaEmision)}</div>
          <div>Presu. N°{form.nro || '___'}</div>
        </div>
      </div>
    </div>

    <img src="/branding/linea-divider.png" alt="" style={{width:'100%',height:8,objectFit:'fill',display:'block',marginBottom:14}} onError={e=>e.target.style.display='none'}/>

    {/* TÍTULO */}
    <div style={S.h1}>{titulo}</div>
    <img src="/branding/linea-titulo.png" alt="" style={{height:6,marginBottom:14,display:'block'}} onError={e=>e.target.style.display='none'}/>

    {/* CLIENTE | AGENCIA */}
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:6}}>
      <div>
        <div style={S.label}>CLIENTE</div>
        <div style={S.h2}>{form.cliente || '—'}</div>
      </div>
      {form.agencia && <div>
        <div style={S.label}>AGENCIA</div>
        <div style={S.h2}>{form.agencia}</div>
      </div>}
    </div>
    <div style={{borderTop:'0.5px solid #DDD',margin:'4px 0 12px'}}/>

    {/* PROYECTO */}
    <div style={S.label}>PROYECTO</div>
    <div style={{...S.h2,fontSize:14}}>{form.proyecto || '—'}</div>
    {form.fechaEvento && <div style={{...S.mono, fontSize:10, color:C.magma, marginTop:3}}>Fecha: {form.fechaEvento}</div>}

    {/* DESCRIPCIÓN PRODUCCIÓN */}
    {form.descripcion && <div style={{...S.cuerpo, marginTop:10}}>{form.descripcion}</div>}

    {/* SERVICIOS */}
    {orden.length > 0 ? <>
      <div style={{...S.h2,fontSize:11,marginTop:14,marginBottom:5}}>El servicio incluye:</div>
      <div>
        {orden.map((s,i) => <div key={i} style={S.bullet}>
          <span style={S.cuadrado}/>
          <span style={{fontSize:10.5}}>{svcsMap[s] > 1 ? svcsMap[s]+' '+s : s}</span>
        </div>)}
      </div>
    </> : <div style={{padding:'8px 10px',background:'#FEF3E0',border:'0.5px solid #BA7517',borderRadius:4,fontSize:10,color:'#7A5410',marginTop:12}}>
      Sin servicios cargados. Completalos arriba o usá ↻ Recargar del sheet.
    </div>}

    {/* OBSERVACIONES → DETALLE DE SERVICIO */}
    {form.observaciones && form.observaciones.trim() && <div style={{background:C.boxBg,padding:'10px 12px',borderLeft:'2px solid '+C.magma,marginTop:14,whiteSpace:'pre-wrap'}}>
      <div style={S.label}>DETALLE DE SERVICIO</div>
      <div style={{fontSize:10.5, color:C.texto, lineHeight:1.5}}>{form.observaciones}</div>
    </div>}

    {/* VALOR TOTAL */}
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:18, paddingTop:8, gap:10}}>
      <div style={{fontWeight:700, fontSize:14, color:C.black}}>Valor total</div>
      <div style={{flex:1, borderTop:'1px solid '+C.black, transform:'translateY(-4px)'}}/>
      <div style={{fontWeight:700, fontSize:14, color:C.black, whiteSpace:'nowrap'}}>${fmt$(form.precioTotal)} + IVA</div>
    </div>
    <img src="/branding/linea-total.png" alt="" style={{width:'100%',height:10,objectFit:'fill',display:'block',marginTop:4}} onError={e=>e.target.style.display='none'}/>

    {/* ADICIONALES (debajo del total) + total con adicionales */}
    {(form.adicionales||[]).length > 0 && (()=>{ const suma=form.adicionales.reduce((s,a)=>s+(Number(a.precio)||0),0); const totalAdic=(Number(form.precioTotal)||0)+suma; return <>
      <div style={{...S.h2,fontSize:11,marginTop:16,marginBottom:6,color:C.azul}}>Adicionales opcionales</div>
      {form.adicionales.map((a,i) => <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,padding:'3px 0'}}>
        <span style={{fontSize:11.5,color:C.texto}}>{prettifySvc(a.nombre)}</span>
        <span style={{fontSize:11.5,color:C.texto,whiteSpace:'nowrap'}}>${fmt$(a.precio)} + IVA</span>
      </div>)}
      <div style={{fontSize:9,color:C.gris,margin:'4px 0 10px',fontStyle:'italic'}}>Estos servicios se cotizan aparte. Indicanos cuáles querés sumar.</div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:4, gap:10}}>
        <div style={{fontWeight:700, fontSize:14, color:C.black}}>Valor total con adicionales</div>
        <div style={{flex:1, borderTop:'1px solid '+C.black, transform:'translateY(-4px)'}}/>
        <div style={{fontWeight:700, fontSize:14, color:C.black, whiteSpace:'nowrap'}}>${fmt$(totalAdic)} + IVA</div>
      </div>
      <img src="/branding/linea-total.png" alt="" style={{width:'100%',height:10,objectFit:'fill',display:'block',marginTop:4}} onError={e=>e.target.style.display='none'}/>
    </> })()}

    {/* T&C compactos */}
    <div style={{...S.sec, marginTop:18}}>CONDICIONES GENERALES</div>
    <div style={{fontSize:9.5, color:C.texto}}>{clausulas.validez}</div>

    <div style={S.sec}>CONDICIONES DE PAGO</div>
    {clausulas.pago.map((p,i) => <div key={i} style={{fontSize:9.5, marginBottom:4}}>
      <span style={{fontWeight:700, color:C.black}}>{p.titulo}: </span>
      <span style={{color:C.texto}}>{p.texto}</span>
    </div>)}

    <div style={S.sec}>{form.tipoPresu === 'produccion' ? 'CLÁUSULAS PARA EL COBRO Y LA ENTREGA' : 'CLÁUSULAS DEL SERVICIO'}</div>
    {clausulas.clausulas.map((c,i) => <div key={i} style={{fontSize:9.5, marginBottom:4}}>
      <span style={{fontWeight:700, color:C.black}}>{c.titulo}: </span>
      <span style={{color:C.texto}}>{c.texto}</span>
    </div>)}
  </div>
}
