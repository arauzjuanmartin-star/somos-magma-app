import { useState, useEffect } from 'react'
import Head from 'next/head'

const fmt$ = n => {
  const num = parseFloat(String(n||0).replace(/[^0-9.-]/g,'')) || 0
  return num.toLocaleString('es-AR')
}

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
    fetch('/api/data', { headers: { 'x-user-email': mail } })
      .then(r => r.json())
      .then(d => {
        const p = (d.data?.presupuestos || []).find(x => String(x['Columna 1']) === String(nro))
        if (!p) return
        const svcs = PEDIDO_KEYS.map(k => p[k]).filter(Boolean)
        const fechaHoy = new Date().toISOString().slice(0,10)
        setForm(prev => ({
          ...prev,
          nro: String(p['Columna 1']||''),
          cliente: p['Cliente']||'',
          agencia: p['Agencia']||'',
          proyecto: p['Proyecto']||'',
          fechaEvento: p['Fecha Evento']||'',
          precioTotal: String(p['Precio Final']||'').replace(/[^0-9]/g,''),
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
      const W=210, M=18
      let y=0

      doc.setFillColor(9,9,9); doc.rect(0,0,W,297,'F')

      // HEADER
      y=22
      doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(140,140,140)
      doc.text('somos', M, y-5)
      doc.setFont('helvetica','bold'); doc.setFontSize(20); doc.setTextColor(206,38,55)
      doc.text('MAGMA', M, y)
      doc.setFontSize(16); doc.setTextColor(21,67,248)
      doc.text('//', M+37, y)

      const rX = W-M
      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(130,130,130)
      doc.text('Somos Magma', rX, y-8, {align:'right'})
      doc.text('Buenos Aires', rX, y-3, {align:'right'})
      doc.text(toDisplay(form.fechaEmision), rX, y+2, {align:'right'})
      doc.setTextColor(206,38,55); doc.setFont('helvetica','bold')
      doc.text('Presu. N°'+(form.nro||'___'), rX, y+7, {align:'right'})

      // Línea degradada
      y+=14
      for(let i=0;i<=100;i++){
        const r=Math.round(21+(206-21)*(i/100)), g=Math.round(67+(38-67)*(i/100)), b=Math.round(248+(55-248)*(i/100))
        doc.setDrawColor(r,g,b); doc.setLineWidth(0.4)
        doc.line(M+(W-M*2)*(i/100),y,M+(W-M*2)*((i+1)/100),y)
      }

      // TÍTULO
      y+=12
      doc.setFont('helvetica','bold'); doc.setFontSize(26); doc.setTextColor(255,255,255)
      doc.text('Presupuesto', M, y)
      y+=9; doc.setFontSize(14); doc.setTextColor(206,38,55)
      doc.text('Cobertura Audiovisual', M, y)

      // CLIENTE
      y+=14
      const filas = [
        ['Cliente', form.cliente],
        form.agencia ? ['Agencia', form.agencia] : null,
        form.fechaEvento ? ['Evento', form.fechaEvento] : null,
        form.proyecto ? ['Proyecto', form.proyecto] : null,
      ].filter(Boolean)
      for(const [k,v] of filas){
        doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(21,67,248)
        doc.text(k, M, y)
        doc.setFont('helvetica','normal'); doc.setTextColor(220,220,220)
        doc.text(String(v), M+26, y)
        y+=6
      }

      // Divisoria
      y+=6; doc.setDrawColor(40,40,40); doc.setLineWidth(0.3); doc.line(M,y,W-M,y)

      // SERVICIOS
      y+=10
      doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(206,38,55)
      doc.text('SERVICIOS', M, y); y+=6
      const svcs = form.servicios.filter(Boolean)
      for(const s of svcs){
        const limpio = s.replace(/[\u{1F300}-\u{1FFFF}]/gu,'').replace(/[\u2600-\u27FF]/g,'').trim()
        if(!limpio) continue
        doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(200,200,200)
        const lines = doc.splitTextToSize('→  '+limpio, W-M*2)
        doc.text(lines, M+2, y)
        y += lines.length * 5.5
      }

      // OBSERVACIONES
      if(form.observaciones){
        y+=4
        doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(150,150,150)
        doc.text('OBSERVACIONES', M, y); y+=5
        doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(160,160,160)
        const obs = doc.splitTextToSize(form.observaciones, W-M*2)
        doc.text(obs, M, y); y+=obs.length*5
      }

      // PRECIO
      y+=8; doc.setDrawColor(40,40,40); doc.setLineWidth(0.3); doc.line(M,y,W-M,y); y+=10

      if(form.pagoAlt && form.pagoAltMonto){
        doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(150,150,150)
        doc.text('Pago a '+form.pagoAltDias+' días', M, y)
        doc.setLineDashPattern([1,1.5],0); doc.setDrawColor(50,50,50)
        doc.line(M+32, y-0.8, W-M-34, y-0.8)
        doc.setLineDashPattern([],0)
        doc.setFont('helvetica','bold'); doc.setTextColor(180,180,180)
        doc.text('$'+fmt$(form.pagoAltMonto)+' + IVA', W-M, y, {align:'right'}); y+=9
      }

      doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(255,255,255)
      doc.text('Valor total', M, y)
      doc.setLineDashPattern([1,1.5],0); doc.setDrawColor(60,60,60)
      doc.line(M+27, y-0.8, W-M-44, y-0.8)
      doc.setLineDashPattern([],0)
      doc.setFontSize(14); doc.setTextColor(206,38,55)
      doc.text('$'+fmt$(form.precioTotal)+' + IVA', W-M, y, {align:'right'})

      // Línea degradada
      y+=14
      for(let i=0;i<=100;i++){
        const r=Math.round(21+(206-21)*(i/100)), g=Math.round(67+(38-67)*(i/100)), b=Math.round(248+(55-248)*(i/100))
        doc.setDrawColor(r,g,b); doc.setLineWidth(0.4)
        doc.line(M+(W-M*2)*(i/100),y,M+(W-M*2)*((i+1)/100),y)
      }

      // T&C
      y+=10
      doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(100,100,100)
      doc.text('TÉRMINOS Y CONDICIONES', M, y); y+=7

      const tcTitulos = ['1. Entrega de material','2. Revisiones','3. Pago','4. Validez','5. Derechos de uso']
      const tc = tcTitulos.map((t,i) => {
        let texto = clausulas[i] || ''
        if(i===3) texto = texto.replace('[fecha]', toDisplay(validez))
        return [t, texto]
      })
      doc.setFontSize(7.5)
      for(const [titulo, texto] of tc){
        doc.setFont('helvetica','bold'); doc.setTextColor(155,155,155)
        doc.text(titulo+': ', M, y)
        const tw = doc.getTextWidth(titulo+': ')
        doc.setFont('helvetica','normal'); doc.setTextColor(105,105,105)
        const ls = doc.splitTextToSize(texto, W-M*2-tw)
        if(ls[0]) doc.text(ls[0], M+tw, y)
        for(let i=1;i<ls.length;i++){ y+=4.2; doc.text(ls[i], M, y) }
        y+=6.5
      }

      // FOOTER
      y=287
      doc.setFontSize(7)
      doc.setFont('helvetica','bold'); doc.setTextColor(55,55,55); doc.text('somos ', M, y)
      const sw=doc.getTextWidth('somos ')
      doc.setTextColor(206,38,55); doc.text('MAGMA', M+sw, y)
      const mw=doc.getTextWidth('MAGMA')
      doc.setTextColor(21,67,248); doc.text(' //', M+sw+mw, y)
      doc.setTextColor(45,45,45); doc.text('  Buenos Aires', M+sw+mw+4, y)
      doc.setTextColor(21,67,248); doc.text('somosmagma.com', W-M, y, {align:'right'})

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
        <p style={{color:'#555',fontSize:13,margin:'0 0 28px'}}>Revisá los datos, ajustá lo que necesites y generá el PDF listo para mandar.</p>

        <div style={{display:'grid',gap:14}}>

          {/* Admin */}
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

          {/* Cliente */}
          <div style={S.card}>
            <div style={{...S.sec,color:'#1543F8'}}>Cliente</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
              <label><span style={S.lbl}>Cliente *</span><input style={S.inp} value={form.cliente} onChange={e=>setF('cliente',e.target.value)} placeholder="ej: CMQ"/></label>
              <label><span style={S.lbl}>Agencia</span><input style={S.inp} value={form.agencia} onChange={e=>setF('agencia',e.target.value)} placeholder="opcional"/></label>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <label><span style={S.lbl}>Fecha del evento</span><input style={S.inp} value={form.fechaEvento} onChange={e=>setF('fechaEvento',e.target.value)} placeholder="ej: 15/10/2025"/></label>
              <label><span style={S.lbl}>Proyecto</span><input style={S.inp} value={form.proyecto} onChange={e=>setF('proyecto',e.target.value)} placeholder="ej: Gente que Vende"/></label>
            </div>
          </div>

          {/* Servicios */}
          <div style={S.card}>
            <div style={{...S.sec,color:'#9635AB'}}>Servicios (sin precio)</div>
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

          {/* Observaciones */}
          <div style={S.card}>
            <div style={{...S.sec,color:'#555'}}>Observaciones</div>
            <textarea style={{...S.inp,minHeight:70,resize:'vertical'}} value={form.observaciones} onChange={e=>setF('observaciones',e.target.value)} placeholder="Notas para el cliente (opcional)"/>
          </div>

          {/* Precio */}
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

          {/* T&C editables */}
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

          {/* Botón generar */}
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
