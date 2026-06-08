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

const PEDIDO_KEYS = ['Pedido 1','Pedido 2','Pedido3 ','Pedido 4','Pedido 5','Pedido 6','Pedido 7','Pedido 8','Pedido 9','Pedido 10','Pedido 11','Pedido 12']

// Limpia emojis y variation selectors. Mantiene letras latinas, números, puntuación común.
const stripSvc = s => String(s||'')
  .replace(/[\u{1F300}-\u{1FAFF}]/gu,'')
  .replace(/[☀-➿]/g,'')
  .replace(/[︀-️]/g,'')
  .replace(/[​-‏‪-‮]/g,'')
  .replace(/[ -⁯]/g,'')
  .replace(/^[\s!'"`þÞ]+/, '')
  .trim()

// Mapeo de códigos cortos del sheet a descripciones amigables para el cliente del PDF.
// El usuario puede editar libremente después en el formulario.
const SVC_LABELS = {
  'Foto ½':       '1 Fotógrafo (media jornada)',
  'Foto 1/2':     '1 Fotógrafo (media jornada)',
  'Foto 1':       '1 Fotógrafo (jornada completa)',
  'Video ½':      '1 Videografo (media jornada)',
  'Video 1/2':    '1 Videografo (media jornada)',
  'Video 1':      '1 Videografo (jornada completa)',
  'Film ½':       '1 Filmmaker (media jornada)',
  'Film 1/2':     '1 Filmmaker (media jornada)',
  'Film 1':       '1 Filmmaker (jornada completa)',
  'Film 12hs':    '1 Filmmaker (jornada extendida 12 hs)',
  'Drone':        'Drone',
  'FPV':          'Dron FPV',
  'Motion':       'Animación motion graphics',
  'Sonido':       'Sonido',
  'DirFoto':      'Director de Fotografía',
  'Edit 60s':     'Edición 1 video resumen horizontal con adaptación vertical',
  'Edit 60s+':    'Edición video resumen extendido (más de 60s)',
  'Edit 15-30s':  'Edición video corto (15 a 30 segundos)',
  'Vivo 1':       '1 Streaming en vivo (jornada completa)',
  'Vivo ½':       'Streaming en vivo (media jornada)',
  'Vivo 1/2':     'Streaming en vivo (media jornada)',
  'Go Pro':       'Cámara GoPro',
  'Asist 1':      '1 Asistente (jornada completa)',
  'Asist ½':      '1 Asistente (media jornada)',
  'Asist 1/2':    '1 Asistente (media jornada)',
  'MakeUp':       'Maquilladora',
  'Model':        'Modelo',
  'Produ':        'Productor',
  'Catering':     'Catering',
  'Viaticos':     'Viáticos',
  'Crudos':       'Entrega de material crudo',
  'Fotos':        'Fotografías',
  'Rental':       'Rental de equipos',
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

export default function Presupuesto() {
  const hoy = new Date().toISOString().slice(0,10)
  const [form, setForm] = useState({
    nro:'', fechaEmision:hoy, cliente:'', agencia:'', proyecto:'', fechaEvento:'',
    servicios:[''], observaciones:'', precioTotal:'',
    pagoAlt:false, pagoAltDias:'30', pagoAltMonto:'', plazo:'7',
  })
  const [validez, setValidez] = useState(addDays(hoy, 20))
  const [clausulas, setClausulas] = useState([
    'No se entregan crudos ni archivos editables salvo acuerdo expreso por escrito.',
    'Se incluyen hasta dos rondas de correcciones sin costo. Cambios adicionales tendrán un costo a convenir. Las revisiones deben solicitarse dentro de los 7 días posteriores a la primera entrega.',
    'El pago debe realizarse dentro del plazo indicado. En caso de demora, Somos Magma se reserva el derecho de pausar la entrega hasta regularizar el pago.',
    'Este presupuesto tiene validez hasta el [fecha]. Pasada esa fecha los precios podrán ser revisados.',
    'El material es para uso exclusivo del cliente indicado. Somos Magma se reserva el derecho de utilizarlo con fines de portfolio, salvo acuerdo en contrario.',
  ])
  const [loading, setLoading] = useState(false)
  const [generando, setGenerando] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const nro = params.get('nro')
    if (!nro) return
    setLoading(true)
    const mail = localStorage.getItem('magma_mail') || ''
    fetch('/api/data')
      .then(r => r.json())
      .then(d => {
        const p = (d.data?.presupuestos || []).find(x => String(x['Columna 1']) === String(nro))
        if (!p) return
        const svcs = PEDIDO_KEYS.map(k => p[k]).filter(Boolean).map(prettifySvc)
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
      const W=210, H=297, M=22
      let y=0

      // ====== FONDO BLANCO + BANDA SUPERIOR DE COLOR ======
      doc.setFillColor(255,255,255); doc.rect(0,0,W,H,'F')
      doc.setFillColor(206,38,55); doc.rect(0,0,W,6,'F')
      doc.setFillColor(21,67,248); doc.rect(W*0.55,0,W*0.45,6,'F')

      // ====== HEADER LOGO ======
      y=24
      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(120,120,120)
      doc.text('somos', M, y-7)
      doc.setFont('helvetica','bold'); doc.setFontSize(26); doc.setTextColor(206,38,55)
      doc.text('MAGMA', M, y)
      const mw = doc.getTextWidth('MAGMA')
      doc.setFontSize(18); doc.setTextColor(21,67,248)
      doc.text('//', M+mw+3, y)

      // Datos arriba derecha
      const rX = W-M
      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(130,130,130)
      doc.text('Buenos Aires · Argentina', rX, y-10, {align:'right'})
      doc.text('hola@somosmagma.com', rX, y-5, {align:'right'})
      doc.text('somosmagma.com', rX, y, {align:'right'})

      // ====== TÍTULO BIG ======
      y+=22
      doc.setFont('helvetica','bold'); doc.setFontSize(36); doc.setTextColor(20,20,20)
      doc.text('Presupuesto', M, y)
      // Pequeño número junto al título
      const titleW = doc.getTextWidth('Presupuesto')
      doc.setFontSize(11); doc.setTextColor(206,38,55); doc.setFont('helvetica','normal')
      doc.text('N° '+(form.nro||'___'), M+titleW+5, y-2)
      doc.setFontSize(9); doc.setTextColor(130,130,130)
      doc.text(toDisplay(form.fechaEmision), M+titleW+5, y+4)

      // Subtítulo
      y+=10; doc.setFontSize(13); doc.setTextColor(80,80,80); doc.setFont('helvetica','normal')
      doc.text('Cobertura audiovisual', M, y)

      // ====== CAJA DATOS DEL CLIENTE (con fondo gris muy claro) ======
      y+=14
      const filas = [
        ['Cliente', form.cliente],
        form.agencia ? ['Agencia', form.agencia] : null,
        form.proyecto ? ['Proyecto', form.proyecto] : null,
        form.fechaEvento ? ['Fecha del evento', form.fechaEvento] : null,
      ].filter(Boolean)
      const filaH = 9
      const boxH = filas.length * filaH + 10
      doc.setFillColor(248,248,248); doc.roundedRect(M, y, W-M*2, boxH, 2, 2, 'F')
      doc.setDrawColor(206,38,55); doc.setLineWidth(0.8); doc.line(M, y, M, y+boxH)  // borde izq rojo
      let yBox = y+9
      for(const [k,v] of filas){
        doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(140,140,140); doc.text(k.toUpperCase(), M+5, yBox)
        doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(30,30,30); doc.text(String(v), M+50, yBox)
        yBox += filaH
      }
      y += boxH+12

      // ====== SERVICIOS ======
      doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(206,38,55)
      doc.text('SERVICIOS INCLUIDOS', M, y)
      const swLine = doc.getTextWidth('SERVICIOS INCLUIDOS')
      doc.setDrawColor(220,220,220); doc.setLineWidth(0.3); doc.line(M+swLine+4, y-1, W-M, y-1)
      y+=8

      const svcsLimpios = form.servicios.map(s => prettifySvc(s)).filter(Boolean)
      const svcsMap = {}
      const ordenInsercion = []
      for(const s of svcsLimpios){
        if (!svcsMap[s]) { svcsMap[s] = 0; ordenInsercion.push(s) }
        svcsMap[s]++
      }
      for(let idx=0; idx<ordenInsercion.length; idx++){
        const s = ordenInsercion[idx]
        const cant = svcsMap[s]
        // Fondo alternado para legibilidad
        if (idx % 2 === 0) { doc.setFillColor(252,252,252); doc.rect(M-1, y-4.5, W-M*2+2, 7.5, 'F') }
        // Bullet en cuadrado de color
        doc.setFillColor(21,67,248); doc.rect(M, y-3, 1.8, 1.8, 'F')
        doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(50,50,50)
        const lines = doc.splitTextToSize(s, W-M*2-15)
        doc.text(lines, M+5, y)
        if (cant > 1) {
          doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(206,38,55)
          doc.text('×'+cant, W-M, y, {align:'right'})
        }
        y += lines.length * 5.5 + 1
      }

      if(form.observaciones){
        y+=6
        doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(140,140,140)
        doc.text('OBSERVACIONES', M, y); y+=5
        doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(80,80,80)
        const obs = doc.splitTextToSize(form.observaciones, W-M*2)
        doc.text(obs, M, y); y+=obs.length*5
      }

      y+=10

      // ====== CAJA TOTAL (destacado) ======
      const totH = form.pagoAlt && parseFloat(form.pagoAltMonto) > 0 ? 30 : 22
      doc.setFillColor(20,20,20); doc.roundedRect(M, y, W-M*2, totH, 3, 3, 'F')

      // Opción pago a plazo (arriba del total si existe)
      if(form.pagoAlt && parseFloat(form.pagoAltMonto) > 0){
        doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(160,160,160)
        doc.text('Pago a '+form.pagoAltDias+' días', M+6, y+8)
        doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(220,220,220)
        doc.text('$'+fmt$(form.pagoAltMonto)+' + IVA', W-M-6, y+8, {align:'right'})
        // Línea separadora interna
        doc.setDrawColor(50,50,50); doc.setLineWidth(0.3); doc.line(M+6, y+11.5, W-M-6, y+11.5)
        // Total contado
        doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(255,255,255)
        doc.text('Total contado ('+form.plazo+' días)', M+6, y+21)
        doc.setFontSize(16); doc.setTextColor(206,38,55)
        doc.text('$'+fmt$(form.precioTotal)+' + IVA', W-M-6, y+21, {align:'right'})
      } else {
        doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(255,255,255)
        doc.text('Valor total', M+6, y+14)
        doc.setFontSize(8); doc.setTextColor(160,160,160); doc.setFont('helvetica','normal')
        doc.text('Pago a '+form.plazo+' días · IVA por fuera', M+6, y+18.5)
        doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(206,38,55)
        doc.text('$'+fmt$(form.precioTotal)+' + IVA', W-M-6, y+15, {align:'right'})
      }
      y += totH+12

      // ====== TÉRMINOS Y CONDICIONES (compacto, fondo gris claro) ======
      const tcTitulos = ['1. Entrega de material','2. Revisiones','3. Pago','4. Validez','5. Derechos de uso']
      const tc = tcTitulos.map((t,i) => {
        let texto = clausulas[i] || ''
        if(i===3) texto = texto.replace('[fecha]', toDisplay(validez))
        return [t, texto]
      })

      doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(206,38,55)
      doc.text('TÉRMINOS Y CONDICIONES', M, y)
      const tcw = doc.getTextWidth('TÉRMINOS Y CONDICIONES')
      doc.setDrawColor(220,220,220); doc.setLineWidth(0.3); doc.line(M+tcw+4, y-1, W-M, y-1)
      y+=7

      doc.setFontSize(7.5)
      for(const [titulo, texto] of tc){
        doc.setFont('helvetica','bold'); doc.setTextColor(60,60,60)
        doc.text(titulo+': ', M, y)
        const tw = doc.getTextWidth(titulo+': ')
        doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100)
        const ls = doc.splitTextToSize(texto, W-M*2-tw)
        if(ls[0]) doc.text(ls[0], M+tw, y)
        for(let i=1;i<ls.length;i++){ y+=3.8; doc.text(ls[i], M, y) }
        y+=5.5
      }

      // ====== FOOTER ======
      // Banda inferior color
      doc.setFillColor(206,38,55); doc.rect(0,H-6,W*0.45,6,'F')
      doc.setFillColor(21,67,248); doc.rect(W*0.45,H-6,W*0.55,6,'F')

      const fY = H-12
      doc.setFontSize(8)
      doc.setFont('helvetica','normal'); doc.setTextColor(120,120,120); doc.text('somos ', M, fY)
      const sw=doc.getTextWidth('somos ')
      doc.setFont('helvetica','bold'); doc.setTextColor(206,38,55); doc.text('MAGMA', M+sw, fY)
      const mw2=doc.getTextWidth('MAGMA')
      doc.setTextColor(21,67,248); doc.text(' //', M+sw+mw2, fY)
      doc.setFont('helvetica','normal'); doc.setTextColor(120,120,120)
      doc.text(' · Productora audiovisual · Buenos Aires', M+sw+mw2+5, fY)
      doc.setTextColor(21,67,248); doc.text('somosmagma.com', W-M, fY, {align:'right'})

      doc.save(`presu-${form.nro||'borrador'}-${(form.cliente||'cliente').toLowerCase().replace(/\s+/g,'-')}.pdf`)
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
            <div style={{...S.sec,color:'#CE2637'}}>Datos del presupuesto</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <label><span style={S.lbl}>N° presupuesto</span><input style={S.inp} value={form.nro} onChange={e=>setF('nro',e.target.value)} placeholder="ej: 944a"/></label>
              <label><span style={S.lbl}>Fecha de emisión</span><input style={S.inp} type="date" value={form.fechaEmision} onChange={e=>setF('fechaEmision',e.target.value)}/></label>
            </div>
            <div style={{marginTop:8,padding:'7px 10px',background:'#0D0D0D',borderRadius:6,fontSize:11,color:'#555'}}>
              Válido hasta: <span style={{color:'#1D9E75',fontFamily:'monospace'}}>{toDisplay(validez)}</span><span style={{color:'#333'}}> (20 días automático)</span>
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

          <div style={S.card}>
            <div style={{...S.sec,color:'#555'}}>Observaciones</div>
            <textarea style={{...S.inp,minHeight:70,resize:'vertical'}} value={form.observaciones} onChange={e=>setF('observaciones',e.target.value)} placeholder="Ej: Evento de 3 días Hotel AMBA · 1 día 9am a 18hs 21hs a 24hs · 2 día..."/>
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
            <div style={{fontSize:11,color:'#555',marginBottom:12}}>Podés editar cada cláusula antes de generar el PDF.</div>
            {[
              '1. Entrega de material',
              '2. Revisiones',
              '3. Pago',
              '4. Validez',
              '5. Derechos de uso',
            ].map((titulo,i)=>(
              <div key={i} style={{marginBottom:10}}>
                <div style={{fontSize:11,color:'#9635AB',fontWeight:600,marginBottom:4}}>{titulo}</div>
                <textarea
                  style={{...S.inp,minHeight:52,resize:'vertical',fontSize:11}}
                  value={i===3?clausulas[i].replace('[fecha]',toDisplay(validez)):clausulas[i]}
                  onChange={e=>{const n=[...clausulas];n[i]=e.target.value;setClausulas(n)}}
                />
              </div>
            ))}
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
