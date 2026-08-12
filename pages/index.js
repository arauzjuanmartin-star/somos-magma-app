import React, { useState, useEffect, useRef, useCallback } from 'react'
import Head from 'next/head'
import { useSession, signIn } from 'next-auth/react'

/* ============================================================
   PROTOTIPO DE REDISEÑO — /v2
   Tema CLARO. Un solo color de acción (Magma). Color = sentido.
   Jerarquía: pocos números grandes, el resto chico y gris.
   Usa los MISMOS datos reales (/api/data) y las MISMAS fórmulas
   que la app actual. No toca nada de la app que funciona.
   ============================================================ */

const MONO = "'Azeret Mono', ui-monospace, monospace"

// --- Paleta clara, sobria. Un acento (Magma) + grises + semántica de plata ---
const T = {
  bg:         '#FBFAF8',  // página, blanco cálido
  surface:    '#FFFFFF',  // cards
  surfaceAlt: '#F6F4F1',  // hover / filas alternas sutiles
  border:     '#ECE9E4',  // hairline
  ink:        '#1A1917',  // texto principal
  ink2:       '#6F6B63',  // texto secundario
  ink3:       '#A8A39A',  // muted
  brand:      '#CE2637',  // Magma — acción + atención
  brandSoft:  '#FBEAEC',
  pos:        '#1E8A5A',  // cobrado / rentable
  posSoft:    '#E7F3EC',
  warn:       '#B07712',  // en espera / por vencer
  warnSoft:   '#F8EFDC',
}

// ---------- helpers (idénticos a la app) ----------
const parseMonto = v => { if (!v) return 0; const n = parseFloat(String(v).replace(/[$,\s]/g, '')); return isNaN(n) ? 0 : n }
// --- Plata que escribe Juan (formato argentino: puntos de mil, coma decimal) ---
// El sheet guarda el número plano (927902.19). Estos helpers son SOLO para inputs.
const fmtMontoAR = v => { const s=String(v??'').replace(/[^\d,]/g,''); if(!s) return ''
  const [ent,...resto]=s.split(',')
  const entF=(ent.replace(/^0+(?=\d)/,'')||'0').replace(/\B(?=(\d{3})+(?!\d))/g,'.')
  return resto.length ? `${entF},${resto.join('').slice(0,2)}` : entF }
const parseMontoAR = v => { const n=parseFloat(String(v??'').replace(/\./g,'').replace(',','.').replace(/[^\d.-]/g,'')); return isNaN(n)?0:n }
const numAMontoAR = n => { const v=Number(n)||0; return v ? v.toLocaleString('es-AR',{minimumFractionDigits:0, maximumFractionDigits:2}) : '' }
const fmt = n => '$' + Math.round(Math.abs(n||0)).toLocaleString('es-AR')
const fmtS = n => (n<0?'-':'') + '$' + Math.round(Math.abs(n||0)).toLocaleString('es-AR')
const fmtM = n => { const a=Math.abs(n||0); return (n<0?'-':'')+(a>=1000000?'$'+(a/1000000).toFixed(1)+'M':'$'+Math.round(a/1000)+'K') }
const isAprobado = p => { const e=String(p['Estado']||'').toUpperCase(); return e==='APROBADO'||e==='EN CURSO'||e==='ENTREGADO' }
const isCobrada = f => { const v=f['Cobrado']; return v===true||String(v).toUpperCase()==='TRUE'||String(v).toUpperCase()==='SÍ'||String(v).toUpperCase()==='SI' }
const esActiva = v => { const s=String(v||'').toUpperCase(); return s==='SÍ'||s==='SI'||s==='TRUE'||v===true }
const parseD = s => { if(!s) return null; const p=String(s).split('/'); if(p.length<3) return null; const d=parseInt(p[0]),m=parseInt(p[1]),y=parseInt(p[2]); if(!d||!m||!y) return null; return new Date(y,m-1,d) }
const esDelMes = (s,m,a) => { const d=parseD(s); return !!d && d.getMonth()+1===m && d.getFullYear()===a }
// Dedup case-insensitive: une variantes ("No soup media" / "No Soup Media") en una sola,
// quedándose con la de mejor escritura (más mayúsculas). Para datalists de agencias/clientes.
const dedupCI = arr => { const m=new Map(); arr.map(v=>String(v||'').trim()).filter(Boolean).forEach(v=>{ const k=v.toLowerCase(); const caps=s=>(s.match(/[A-ZÁÉÍÓÚÑ]/g)||[]).length; const cur=m.get(k); if(!cur||caps(v)>caps(cur)) m.set(k,v) }); return [...m.values()].sort((a,b)=>a.localeCompare(b,'es')) }
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const MESES_LARGO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// Mapeo mail → persona, para "Mi espacio" (proyectos a cargo + tareas). verTodo = dueños/admin.
const USER_NAME = {
  'juan@somosmagma.com':        {nombre:'Juan', nombres:['juan'], verTodo:true},
  'arauzjuanmartin@gmail.com':  {nombre:'Juan', nombres:['juan'], verTodo:true},
  'sofi@somosmagma.com':        {nombre:'Sofi', nombres:['sofi','sofia'], verTodo:true},
  'lulu@somosmagma.com':        {nombre:'Lulu', nombres:['lulu','lucia'], verTodo:false},
  'tom@somosmagma.com':         {nombre:'Tom',  nombres:['tom','tomi','tomas','tomás'], verTodo:false},
  'admin@somosmagma.com':       {nombre:'Flor', nombres:['flor'], verTodo:true, admin:true},
}

const NAV = [
  {id:'dashboard',label:'Dashboard'},
  {id:'calendario',label:'Calendario'},
  {id:'presupuestos',label:'Presupuestos'},
  {id:'proyectos',label:'Proyectos'},
  {id:'facturacion',label:'Facturación'},
  {id:'pagos',label:'Pagos Staff'},
  {id:'freelancers',label:'Freelancers'},
  {id:'egresos',label:'Egresos'},
  {id:'agencias',label:'Agencias'},
  {id:'clientes',label:'Clientes'},
  {id:'contactos',label:'Contactos'},
  {id:'historico',label:'Histórico'},
]

// Atrapa errores de un módulo para que no se caiga TODA la app (pantalla negra)
class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state={err:null} }
  static getDerivedStateFromError(err){ return {err} }
  componentDidCatch(err,info){ console.error('Error en módulo:', err, info) }
  render(){
    if(this.state.err) return <div style={{padding:'40px 20px', textAlign:'center'}}>
      <div style={{fontSize:16, fontWeight:700, color:T.brand, marginBottom:8}}>Se rompió esta vista</div>
      <div style={{fontSize:13, color:T.ink2, maxWidth:480, margin:'0 auto 16px', lineHeight:1.5}}>El resto de la app sigue funcionando. Probá actualizar o cambiá de solapa. Detalle: {String(this.state.err?.message||this.state.err)}</div>
      <button onClick={()=>{ this.setState({err:null}); this.props.onReload&&this.props.onReload() }} style={{padding:'9px 20px', borderRadius:9, border:'none', background:T.brand, color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer'}}>↻ Recargar datos</button>
    </div>
    return this.props.children
  }
}

export default function V2() {
  const { data: session, status } = useSession()
  const mail = session?.user?.email || ''
  const readOnly = !!session?.user?.readOnly
  const [data,setData] = useState(null)
  const [loading,setLoading] = useState(false)
  const [refreshing,setRefreshing] = useState(false)
  const [err,setErr] = useState('')
  const [mod,setMod] = useState('dashboard')
  const [nav,setNav] = useState(null)  // {mod, filtro?, q?} → al navegar, deja el destino filtrado/buscado
  const goTo = (m, opts) => { setMod(m); setNav(opts?{mod:m,...(typeof opts==='string'?{filtro:opts}:opts)}:null) }
  const goSearch = (m, q) => { setMod(m); setNav({mod:m, q}) }
  const clearNav = () => setNav(null)
  const [showSearch,setShowSearch] = useState(false)
  const [toast,setToast] = useState(null)  // {msg, tipo:'ok'|'err'}
  const showToast = (msg,tipo='ok') => { setToast({msg,tipo}); setTimeout(()=>setToast(null), 3200) }

  // Atajo Cmd/Ctrl+K → buscador · Esc cierra
  useEffect(()=>{
    const h=(e)=>{ if((e.metaKey||e.ctrlKey)&&(e.key==='k'||e.key==='K')){ e.preventDefault(); setShowSearch(s=>!s) } if(e.key==='Escape') setShowSearch(false) }
    window.addEventListener('keydown',h); return ()=>window.removeEventListener('keydown',h)
  },[])

  useEffect(()=>{ if(status==='authenticated' && mail && !data && !loading) load() // eslint-disable-next-line
  },[status,mail])

  // Modo lectura (invitado): bloquear toda escritura (POST/PUT/DELETE a /api/*) del lado cliente.
  // El backend igual la rechaza (defensa en profundidad).
  useEffect(()=>{
    if(!readOnly) return
    const orig=window.fetch
    window.fetch=(url,opts={})=>{ const u=String(url||''), m=(opts?.method||'GET').toUpperCase()
      if(m!=='GET' && u.includes('/api/') && !u.includes('/api/auth')){
        return Promise.resolve(new Response(JSON.stringify({ok:false,error:'👁 Modo lectura: no podés modificar'}),{status:200,headers:{'Content-Type':'application/json'}}))
      }
      return orig(url,opts) }
    return ()=>{ window.fetch=orig }
  // eslint-disable-next-line
  },[readOnly])

  async function load(silencioso=false){
    if(silencioso) setRefreshing(true); else setLoading(true)
    setErr('')
    try { const r=await fetch('/api/data?fresh=1'); const j=await r.json(); if(j.ok) setData(j.data); else setErr(j.error||'Error') }
    catch(e){ setErr('Error de conexión') }
    setLoading(false); setRefreshing(false)
  }

  if(status==='loading') return <Shell><Center>Verificando sesión…</Center></Shell>
  if(status==='unauthenticated'||!mail) return <Shell><Center><button onClick={()=>signIn('google',{callbackUrl:'/'})} style={btnPrimary}>Ingresar con Google</button></Center></Shell>

  return <Shell>
    <div style={{display:'flex', height:'100vh', overflow:'hidden'}}>
      {/* Sidebar claro y minimal */}
      <aside style={{width:228, flexShrink:0, background:T.surface, borderRight:`1px solid ${T.border}`, display:'flex', flexDirection:'column'}}>
        <div style={{padding:'22px 22px 18px'}}>
          <div style={{display:'flex', alignItems:'center', gap:9}}>
            <span style={{width:9, height:9, borderRadius:9, background:T.brand, display:'inline-block'}}/>
            <span style={{fontSize:13, fontWeight:700, letterSpacing:1.5, color:T.ink}}>SOMOS MAGMA</span>
          </div>
          <div style={{fontSize:10, color:T.ink3, marginTop:5, letterSpacing:0.3, fontFamily:MONO}}>productora audiovisual</div>
          {readOnly && <div style={{marginTop:9, fontSize:10, fontWeight:700, color:T.brand, background:T.brandSoft, padding:'5px 8px', borderRadius:6, letterSpacing:0.4, textAlign:'center'}}>👁 MODO LECTURA</div>}
        </div>
        {!readOnly && <div style={{padding:'0 16px 12px'}}>
          <button onClick={()=>goTo('presupuestos','__nuevo__')} title="Cargar un presupuesto nuevo, desde donde estés" style={{width:'100%', padding:'10px', borderRadius:9, border:'none', background:T.brand, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer'}}>+ Nuevo presupuesto</button>
        </div>}
        <nav style={{flex:1, padding:'4px 12px'}}>
          {NAV.map(n=>{
            const active = mod===n.id
            const ready = true
            return <button key={n.id} onClick={()=>setMod(n.id)} style={{
              width:'100%', textAlign:'left', display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'8px 12px', marginBottom:2, borderRadius:8, border:'none', cursor:'pointer',
              fontSize:13, fontWeight: active?600:500,
              color: active?T.ink:(ready?T.ink2:T.ink3),
              background: active? T.surfaceAlt : 'transparent',
            }}>
              <span>{n.label}</span>
              {active && <span style={{width:5,height:5,borderRadius:5,background:T.brand}}/>}
              {!ready && !active && <span style={{fontSize:9, color:T.ink3, fontFamily:MONO}}>pronto</span>}
            </button>
          })}
        </nav>
        <div style={{padding:'14px 16px'}}>
          <button onClick={()=>load(true)} disabled={refreshing} style={{width:'100%', padding:'8px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:refreshing?T.ink3:T.ink2, fontSize:12.5, fontWeight:500, cursor:refreshing?'default':'pointer'}}>{refreshing?'Actualizando…':'↻ Actualizar'}</button>
        </div>
        <div style={{padding:'14px 22px 16px', borderTop:`1px solid ${T.border}`}}>
          <div style={{fontSize:11, color:T.ink2}}>{mail}</div>
          <a href="/v1" style={{fontSize:11, color:T.ink3, textDecoration:'none', marginTop:6, display:'inline-block'}}>ver versión anterior</a>
        </div>
      </aside>

      {/* Main */}
      <main style={{flex:1, overflowY:'auto', background:T.bg}}>
        <div style={{position:'sticky', top:0, zIndex:50, background:T.bg}}>
          <div style={{maxWidth:1180, margin:'0 auto', padding:'14px 36px 0', display:'flex', justifyContent:'flex-end'}}>
            <button onClick={()=>setShowSearch(true)} title="Buscar (⌘K)" style={{display:'flex', alignItems:'center', gap:8, padding:'8px 14px', borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, cursor:'pointer'}}>
              <span style={{fontSize:13}}>🔍</span><span>Buscar</span>
              <span style={{fontSize:10.5, fontFamily:MONO, padding:'1px 6px', borderRadius:4, background:T.surfaceAlt, color:T.ink3}}>⌘K</span>
            </button>
          </div>
        </div>
        <div style={{maxWidth:1180, margin:'0 auto', padding:'14px 36px 80px'}}>
          {err && <div style={{background:T.brandSoft, color:T.brand, border:`1px solid ${T.brand}30`, borderRadius:10, padding:'12px 16px', fontSize:13, marginBottom:18}}>{err}</div>}
          {loading || !data
            ? <Center>Cargando datos del sheet…</Center>
            : <ErrorBoundary key={mod} onReload={()=>load(true)}>{
              mod==='dashboard' ? <Dashboard data={data} goTo={goTo} onRefresh={()=>load(true)} showToast={showToast} mail={mail}/>
            : mod==='presupuestos' ? <Presupuestos data={data} onRefresh={()=>load(true)} showToast={showToast} nav={nav} clearNav={clearNav}/>
            : mod==='calendario' ? <Calendario data={data} onRefresh={()=>load(true)} showToast={showToast}/>
            : mod==='proyectos' ? <Proyectos data={data} onRefresh={()=>load(true)} showToast={showToast} nav={nav} clearNav={clearNav}/>
            : mod==='facturacion' ? <Facturacion data={data} onRefresh={()=>load(true)} showToast={showToast} nav={nav} clearNav={clearNav} goTo={goTo}/>
            : mod==='pagos' ? <PagosStaff data={data} onRefresh={()=>load(true)} showToast={showToast} nav={nav} clearNav={clearNav}/>
            : mod==='freelancers' ? <Freelancers data={data} nav={nav} clearNav={clearNav} onRefresh={()=>load(true)} showToast={showToast}/>
            : mod==='egresos' ? <Egresos data={data} onRefresh={()=>load(true)} showToast={showToast}/>
            : mod==='agencias' ? <Agencias data={data} onRefresh={()=>load(true)} showToast={showToast} nav={nav} clearNav={clearNav}/>
            : mod==='clientes' ? <Clientes data={data} nav={nav} clearNav={clearNav}/>
            : mod==='contactos' ? <Contactos data={data} onRefresh={()=>load(true)} showToast={showToast} nav={nav} clearNav={clearNav}/>
            : mod==='historico' ? <Historico data={data}/>
            : <Placeholder label={NAV.find(n=>n.id===mod)?.label}/>
            }</ErrorBoundary>}
        </div>
      </main>
    </div>
    {showSearch && <GlobalSearch data={data} onClose={()=>setShowSearch(false)} onNavegar={(m,q)=>{ goSearch(m,q); setShowSearch(false) }}/>}
    {toast && <div style={{position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', zIndex:1000, padding:'11px 20px', borderRadius:10, fontSize:13, fontWeight:500, color:'#fff', background: toast.tipo==='err'?T.brand:T.ink, boxShadow:'0 8px 24px rgba(0,0,0,0.18)'}}>{toast.msg}</div>}
  </Shell>
}

// Cartel de alertas del mail del usuario logueado (sin leer + pedidos de presupuesto)
function MailAlert(){
  const [a,setA]=useState(null)
  useEffect(()=>{ fetch('/api/mis-alertas').then(r=>r.json()).then(setA).catch(()=>{}) },[])
  if(!a || a.unread==null) return null
  const nombre=(a.mailbox||'').split('@')[0]
  const url='https://mail.google.com/mail/?authuser='+encodeURIComponent(a.mailbox||'')
  const pedidos=a.pedidos||[], nPed=a.pedidosCount||pedidos.length
  return <div style={{background:T.brandSoft, border:`1px solid ${T.border}`, borderRadius:12, padding:'12px 16px', marginBottom:14, display:'flex', gap:14, alignItems:'flex-start', flexWrap:'wrap'}}>
    <span style={{fontSize:20}}>📬</span>
    <div style={{flex:1, minWidth:200}}>
      <div style={{fontSize:13.5, color:T.ink, fontWeight:600}}>{nombre}, tenés <span style={{color:T.brand}}>{a.unread} sin leer</span>{nPed>0 && <> · <span style={{color:T.brand}}>{nPed} posible{nPed===1?'':'s'} pedido{nPed===1?'':'s'} de presupuesto</span></>}</div>
      {pedidos.length>0 && <div style={{marginTop:8, display:'flex', flexDirection:'column', gap:6}}>{pedidos.slice(0,5).map((p,i)=>{
        const link = p.id ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(a.mailbox||'')}#all/${p.id}` : url
        const from = (p.from||'').replace(/<[^>]*>/,'').replace(/"/g,'').trim()
        return <a key={i} href={link} target="_blank" rel="noreferrer" title="Abrir este mail en Gmail" style={{display:'block', textDecoration:'none', background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:'7px 11px'}}>
          <div style={{fontSize:12.5, color:T.ink, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{p.subject||'(sin asunto)'} <span style={{color:T.ink3, fontWeight:400}}>— {from}</span></div>
          {p.snippet && <div style={{fontSize:11, color:T.ink3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginTop:2}}>{p.snippet}</div>}
        </a>
      })}</div>}
    </div>
    <a href={url} target="_blank" rel="noreferrer" style={{fontSize:12.5, color:T.brand, fontWeight:600, textDecoration:'none', whiteSpace:'nowrap'}}>Abrir bandeja →</a>
  </div>
}

// Cartel de respuestas de freelancers a los mails de pago (lee admin@somosmagma.com por IMAP).
// Avisa cuántos contestaron y cuántas facturas adjuntaron que todavía no están guardadas.
function RespuestasFreelancerAlert({data, goTo}){
  const [d,setD]=useState(null)
  useEffect(()=>{ fetch('/api/pagos-staff-respuestas').then(r=>r.json()).then(j=>setD(j&&j.ok?j:null)).catch(()=>{}) },[])
  if(!d || !d.resumen || d.resumen.enviados===0) return null
  const {enviados:nEnv, sinResponder, sinGuardar}=d.resumen
  const alerta=sinGuardar>0
  // Resumen corto: un vistazo. El detalle (barra, nombres, guardar) vive en Pagos Staff.
  return <div onClick={()=>goTo&&goTo('pagos')} style={{background:alerta?T.warnSoft:T.surface, border:`1px solid ${alerta?T.warn+'55':T.border}`, borderRadius:12, padding:'12px 16px', marginTop:14, display:'flex', gap:12, alignItems:'center', cursor:'pointer'}}>
    <span style={{fontSize:18}}>📨</span>
    <div style={{flex:1, minWidth:0, fontSize:13.5, color:T.ink, fontWeight:600}}>Pagos a freelancers · {sinResponder>0?<span style={{color:T.warn}}>{sinResponder} sin responder</span>:<span style={{color:T.pos}}>todos respondieron</span>} <span style={{color:T.ink3, fontWeight:400}}>de {nEnv}</span>{sinGuardar>0 && <span style={{color:T.warn}}> · 📎 {sinGuardar} sin guardar</span>}</div>
    <span style={{fontSize:12.5, color:T.brand, fontWeight:600, whiteSpace:'nowrap'}}>Ver detalle →</span>
  </div>
}

// Oversight de mails del equipo — solo dueños (el endpoint devuelve [] si no sos dueño).
function TeamMails(){
  const [d,setD]=useState(null)
  useEffect(()=>{ fetch('/api/equipo-alertas').then(r=>r.json()).then(setD).catch(()=>{}) },[])
  if(!d || !d.equipo || d.equipo.length===0) return null
  return <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', marginTop:14}}>
    <CardHead>Mails del equipo · pedidos sin leer</CardHead>
    {d.equipo.map((m,i)=>(
      <div key={i} style={{padding:'11px 18px', borderTop:`1px solid ${T.border}`}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <span style={{fontSize:13, fontWeight:600, color:T.ink}}>{m.nombre} <span style={{fontWeight:400, color:T.ink3, fontSize:11.5}}>· {m.error?'sin acceso':`${m.unread} sin leer`}</span></span>
          <a href={`https://mail.google.com/mail/?authuser=${encodeURIComponent(m.mailbox||'')}`} target="_blank" rel="noreferrer" style={{fontSize:11.5, color:T.brand, fontWeight:600, textDecoration:'none'}}>ver bandeja →</a>
        </div>
        {(m.pedidos||[]).slice(0,2).map((p,j)=>(
          <a key={j} href={p.id?`https://mail.google.com/mail/?authuser=${encodeURIComponent(m.mailbox||'')}#all/${p.id}`:'#'} target="_blank" rel="noreferrer" style={{display:'block', fontSize:11.5, color:T.ink2, textDecoration:'none', marginTop:4, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>· {p.subject||'(sin asunto)'} <span style={{color:T.ink3}}>— {(p.from||'').replace(/<[^>]*>/,'').replace(/"/g,'').trim()}</span></a>
        ))}
        {(!m.pedidos || m.pedidos.length===0) && !m.error && <div style={{fontSize:11.5, color:T.ink3, marginTop:4}}>Sin pedidos recientes ✓</div>}
      </div>
    ))}
  </div>
}

// ============================ DASHBOARD ============================
function Dashboard({data, goTo, onRefresh, showToast, mail}){
  const [verCuentas,setVerCuentas]=useState(false)
  const [cobrando,setCobrando]=useState(null)  // cobrar directo desde el dashboard
  const [facturando,setFacturando]=useState(null)  // facturar directo desde el dashboard
  const hoy = new Date()
  const mesActual = hoy.getMonth()+1, anioActual = hoy.getFullYear()
  const pr=data.presupuestos||[], fc=data.facturacion||[], cuentas=data.cuentas||[], proyectos=data.proyectos||[], pagosStaff=data.pagosStaff||[], reservas=data.reservas||[]

  // --- Caja (idéntico a la app) ---
  const cuentasActivas = cuentas.filter(c=>esActiva(c['Activa']))
  const totalCaja = cuentasActivas.reduce((s,c)=>s+parseMonto(c['Saldo actual']),0)
  const reservasActivas = reservas.filter(r=>esActiva(r['Activa']))
  const totalReservado = reservasActivas.reduce((s,r)=>s+parseMonto(r['Monto']),0)
  const totalDisponible = totalCaja - totalReservado

  // --- Por cobrar ---
  const porCobrar = fc.filter(f=>!isCobrada(f)).map(f=>{
    const fEv=parseD(f['Fecha Evento']); const diasDesdeEvento = fEv?Math.floor((hoy-fEv)/864e5):0
    const venc=parseD(f['Vencimiento']); const dVenc = venc?Math.floor((venc-hoy)/864e5):null
    return {...f, diasDesdeEvento, dVenc, monto:parseMonto(f['Precio FINAL']||f['Precio Final']), neto:parseMonto(f['Precio SIN IVA'])}
  }).sort((a,b)=>b.diasDesdeEvento-a.diasDesdeEvento)
  const totalPorCobrar = porCobrar.reduce((s,f)=>s+f.monto,0)
  const atrasadas30 = porCobrar.filter(f=>f.diasDesdeEvento>30)
  const totalAtrasadas = atrasadas30.reduce((s,f)=>s+f.monto,0)
  // Listo para facturar: presupuestos aprobados con saldo pendiente y evento ya pasado (accionable).
  const parafacturar = pr.filter(isAprobado).map(p=>{
    const facturado=fc.filter(f=>esFacturaReal(f) && String(f['N° Presupuesto']||'').trim()===String(p['Columna 1']||'').trim() && !String(f['Nro de Factura']||'').toUpperCase().startsWith('ANULADA')).reduce((s,f)=>s+(parseMonto(f['Precio SIN IVA'])||parseMonto(f['Precio FINAL'])),0)
    const neto=parseMonto(p['Precio Final']); const ev=parseD(p['Fecha Evento'])
    return {p, facturado, neto, pendiente:Math.max(0,neto-facturado), ev, paso: ev? ev<=hoy : true}
  }).filter(x=>x.neto>0 && x.pendiente>x.neto*0.05 && x.paso).sort((a,b)=>(a.ev?a.ev.getTime():0)-(b.ev?b.ev.getTime():0))

  // --- A pagar staff (próx 15) ---
  const diaHoy=hoy.getDate()
  const mesACobrar = diaHoy>=15 ? mesActual : mesActual-1
  const proxPagoFecha = new Date(anioActual, diaHoy>=15?mesActual-1:mesActual-2, 15)
  const esPagada = p => { const e=String(p['Estado']||p['Pagado']||'').toUpperCase(); return ['PAGADO','SÍ','SI','TRUE'].includes(e)||parseMonto(p['Monto Pagado'])>0 }
  const staffAPagar = pagosStaff.filter(p=>{
    const m=String(p['Mes Referencia']||p['Mes']||'').toLowerCase()
    const esMes = m.includes(String(mesACobrar).padStart(2,'0'))||m.includes(MESES[(mesACobrar+11)%12])
    return esMes && !esPagada(p)
  })
  const totalAPagar = staffAPagar.reduce((s,p)=>s+parseMonto(p['Monto Adeudado']||p['Monto']||p['Total']),0)

  // --- Plata del mes ---
  // Cobrado: facturas que efectivamente cobramos este mes (plata que entró).
  const facMes = fc.filter(f=>esDelMes(f['Fecha emision'],mesActual,anioActual))
  const facMesCobradas = facMes.filter(isCobrada)
  const ingresosMes = facMesCobradas.reduce((s,f)=>s+parseMonto(f['Precio SIN IVA']),0)
  // Puntualidad de cobro: de las facturas con fecha de envío Y fecha de cobro, cuántas se cobraron ≤30 días.
  // (La fecha de envío se estampa sola al subir/mandar la factura; se puede editar a mano.)
  const facMedibles = fc.filter(f=>parseD(f['Fecha enviada']) && parseD(f['Fecha cobro']))
    // Excluir facturas con fecha de cobro = fecha de evento: es el placeholder del bug viejo de "Ya está" (no es la fecha real de cobro).
    .filter(f=>{ const ev=parseD(f['Fecha Evento']), c=parseD(f['Fecha cobro']); return !(ev && c && ev.getTime()===c.getTime()) })
    .map(f=>({...f, _dias:Math.floor((parseD(f['Fecha cobro'])-parseD(f['Fecha enviada']))/864e5)}))
    .filter(f=>f._dias>=0 && f._dias<400)
  const pctATiempo = facMedibles.length ? Math.round(facMedibles.filter(f=>f._dias<=30).length/facMedibles.length*100) : null
  const diasPromCobro = facMedibles.length ? Math.round(facMedibles.reduce((s,f)=>s+f._dias,0)/facMedibles.length) : 0
  // Eventos APROBADOS cuyo evento cae este mes (los laburos que hago en junio).
  const proyMesEvento = proyectos.filter(p=>esDelMes(p['Fecha Evento'],mesActual,anioActual))
  // Facturado (eventos del mes): valor total de los trabajos cuyo evento es este mes.
  // NO es "lo emitido este mes" — eso arrastraba facturas viejas (ej: Minecraft de mayo).
  const facMesTotales = proyMesEvento.reduce((s,p)=>s+parseMonto(p['Total ']||p['Total']),0)
  // Pagos staff: lo que voy gastando en staff por los eventos del mes.
  // NO cuenta "Somos Magma" (esa línea es ganancia de la empresa, no un gasto).
  const pagosStaffMes = proyMesEvento.reduce((s,p)=>{ let t=0; for(let j=1;j<=20;j++){ const st=String(p['Staff '+j]||(j===1?p['Staff']:'')||'').trim(); const pr2=parseMonto(p['Precio '+j]||(j===1?p['Precio']:'')); if(st&&st!=='Somos Magma'&&pr2>0) t+=pr2 } return s+t },0)
  // Ganancia Magma del mes = fee + líneas "Somos Magma" + diferencia de los eventos del mes.
  const ganMagmaMes = proyMesEvento.reduce((s,p)=>{ const fee=parseMonto(p['Fee Agencia']||p['Fee Final']); let sm=0; for(let j=1;j<=20;j++){ const st=String(p['Staff '+j]||(j===1?p['Staff']:'')||'').trim(); if(st==='Somos Magma'){ const pr2=parseMonto(p['Precio '+j]||(j===1?p['Precio']:'')); if(pr2>0) sm+=pr2 } } return s+fee+sm+parseMonto(p['Diferencia']) },0)
  const rentabilidadMes = ganMagmaMes

  // --- Conversión + ticket ---
  const presusMes = pr.filter(p=>esDelMes(p['Fecha Presupuesto'],mesActual,anioActual))
  const apMes = presusMes.filter(isAprobado).length
  const espMes = presusMes.filter(p=>String(p['Estado']||'').toUpperCase()==='EN ESPERA').length
  const desMes = presusMes.filter(p=>String(p['Estado']||'').toUpperCase()==='DESAPROBADO').length
  const denom = apMes+espMes+desMes
  const tasaConversion = denom>0?Math.round(apMes/denom*100):0
  // Ticket promedio del MES: promedio de los eventos aprobados cuyo evento es este mes.
  const aprobMesEvento = pr.filter(isAprobado).filter(p=>esDelMes(p['Fecha Evento'],mesActual,anioActual))
  const eventosMes = aprobMesEvento.length
  const ticketPromedio = eventosMes>0?Math.round(aprobMesEvento.reduce((s,p)=>s+parseMonto(p['Precio Final']),0)/eventosMes):0

  // --- Pipeline próximos 3 meses ---
  const proyByNro={}; proyectos.forEach(prj=>{proyByNro[String(prj['N° presupuesto'])]=prj})
  const calcGanReal = (presu)=>{
    const proy = proyByNro[String(presu['Columna 1']||presu['N° presupuesto'])]
    const fee = parseMonto((proy?proy['Fee Agencia']:presu['Fee Agencia'])||0)
    if(!proy) return fee
    let somosMagma=0
    for(let j=1;j<=20;j++){ const staff=String(proy['Staff '+j]||(j===1?proy['Staff']:'')||'').trim(); if(staff==='Somos Magma'){ const precio=parseMonto(proy['Precio '+j]||(j===1?proy['Precio']:'')); if(precio>0) somosMagma+=precio } }
    const diferencia = parseMonto(proy['Diferencia'])
    return fee+somosMagma+diferencia
  }
  // Mes anterior + este + 2 siguientes (ej: mayo, junio, julio, agosto)
  const proxMeses = [-1,0,1,2].map(i=>{ const idx=mesActual-1+i+12; return {m:(idx%12)+1, a:anioActual+Math.floor((mesActual-1+i)/12)} })
  const pipeline = proxMeses.map(({m,a})=>{
    const ps = pr.filter(p=>esDelMes(p['Fecha Evento'],m,a)).filter(isAprobado)
    const fact = ps.reduce((s,p)=>s+parseMonto(p['Precio Final']),0)
    const gan = ps.reduce((s,p)=>s+calcGanReal(p),0)
    return {m,a,cant:ps.length,fact,gan,esActual:m===mesActual&&a===anioActual,esPasado:(a<anioActual)||(a===anioActual&&m<mesActual)}
  })

  // --- Alertas (subconjunto, las accionables) ---
  const presusAprobados = pr.filter(isAprobado)
  const sinProyecto = presusAprobados.filter(p=>!proyByNro[String(p['Columna 1']||p['N° presupuesto'])]).length
  const proxSinStaff = proyectos.filter(p=>{ const fe=parseD(p['Fecha Evento']); if(!fe) return false; const d=Math.floor((fe-hoy)/864e5); const carga=String(p['Carga Staff']||'').toUpperCase()==='TRUE'||p['Carga Staff']===true; return d>=0 && d<=14 && !carga }).length
  const facVencen7 = porCobrar.filter(f=>f.dVenc!=null && f.dVenc>=0 && f.dVenc<=7).length
  const alertas = [
    sinProyecto>0 && {sev:'warn', txt:`${sinProyecto} presupuestos aprobados sin proyecto cargado`, to:'presupuestos', filtro:'ap'},
    proxSinStaff>0 && {sev:'brand', txt:`${proxSinStaff} proyectos en ≤14 días sin staff asignado`, to:'proyectos', filtro:'pendiente'},
    facVencen7>0 && {sev:'warn', txt:`${facVencen7} facturas vencen esta semana`, to:'facturacion', filtro:'pendiente'},
    atrasadas30.length>0 && {sev:'brand', txt:`${atrasadas30.length} facturas atrasadas +30 días (${fmt(totalAtrasadas)})`, to:'facturacion', filtro:'atrasadas'},
  ].filter(Boolean)

  // --- Top clientes del año ---
  const porCliente={}
  fc.filter(f=>String(f['Fecha emision']||'').includes(String(anioActual))).forEach(f=>{ const c=f['Cliente']||f['Agencia']||'—'; porCliente[c]=(porCliente[c]||0)+parseMonto(f['Precio SIN IVA']) })
  const topClientes = Object.entries(porCliente).sort((a,b)=>b[1]-a[1]).slice(0,5)

  // --- Mi espacio: proyectos a cargo + tareas del usuario logueado ---
  const yo = USER_NAME[String(mail||'').toLowerCase()] || null
  const misNombres = yo ? yo.nombres : []
  const esMio = p => misNombres.includes(String(p['PM']||'').trim().toLowerCase())
  const misProy = misNombres.length ? proyectos.filter(esMio) : []
  const _tieneStaff = p => p['Carga Staff']===true||String(p['Carga Staff']||'').toUpperCase()==='TRUE'
  const facByNro = {}; fc.forEach(f=>{ if(esFacturaReal(f)) facByNro[String(f['N° Presupuesto']||'').trim()]=true })
  const misSinStaff = misProy.filter(p=>{ const fe=parseD(p['Fecha Evento']); if(!fe) return false; const d=Math.floor((fe-hoy)/864e5); return d>=-1 && d<=14 && !_tieneStaff(p) })
  const misSinFacturar = misProy.filter(p=>{ const fe=parseD(p['Fecha Evento']); const paso=fe? fe<=hoy : false; return paso && !facByNro[String(p['N° presupuesto']||'').trim()] })
  const misPorCobrar = porCobrar.filter(f=>{ const proy=proyByNro[String(f['N° Presupuesto']||'').trim()]; return proy && esMio(proy) })

  // Oversight del equipo (solo dueños/admin): pendientes de cada PM, para que nada se caiga.
  const _tareasDe = (nombres) => {
    const es = p => nombres.includes(String(p['PM']||'').trim().toLowerCase())
    const prj = proyectos.filter(es)
    const ss = prj.filter(p=>{ const fe=parseD(p['Fecha Evento']); if(!fe) return false; const d=Math.floor((fe-hoy)/864e5); return d>=-1 && d<=14 && !_tieneStaff(p) }).length
    const sf = prj.filter(p=>{ const fe=parseD(p['Fecha Evento']); const paso=fe?fe<=hoy:false; return paso && !facByNro[String(p['N° presupuesto']||'').trim()] }).length
    const pc = porCobrar.filter(f=>{ const proy=proyByNro[String(f['N° Presupuesto']||'').trim()]; return proy && es(proy) }).length
    return {n:prj.length, ss, sf, pc}
  }
  const equipo = (yo && yo.verTodo) ? [
    {nombre:'Lulu', nombres:['lulu','lucia']},
    {nombre:'Tom',  nombres:['tom','tomi','tomas','tomás']},
    {nombre:'Sofi', nombres:['sofi','sofia']},
    {nombre:'Juan', nombres:['juan']},
  ].filter(m=>!m.nombres.some(n=>misNombres.includes(n))).map(m=>({...m, t:_tareasDe(m.nombres)})).filter(m=>m.t.n>0) : []

  return <>
    <PageHead title="Dashboard" sub={`${MESES_LARGO[mesActual-1]} ${anioActual} · hoy ${diaHoy}`}/>
    <MailAlert/>
    <RespuestasFreelancerAlert data={data} goTo={goTo}/>

    {/* MI ESPACIO — tus proyectos a cargo + tus tareas (según quién se logueó) */}
    {misProy.length>0 && <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', marginTop:14}}>
      <CardHead>Tu espacio · {yo?.nombre} <span style={{fontWeight:400, color:T.ink3}}>· {misProy.length} proyectos a tu cargo</span></CardHead>
      <div style={{display:'flex', borderTop:`1px solid ${T.border}`}}>
        {[
          {n:misSinStaff.length, l:'sin staff (≤14 días)', to:'proyectos', filtro:'pendiente', c:T.brand},
          {n:misSinFacturar.length, l:'para facturar', to:'facturacion', filtro:undefined, c:T.brand},
          {n:misPorCobrar.length, l:'por cobrar', to:'facturacion', filtro:'pendiente', c:T.warn},
        ].map((t,i)=>(
          <div key={i} onClick={()=>t.n>0&&goTo&&goTo(t.to,t.filtro)} style={{flex:1, padding:'14px 16px', borderLeft:i>0?`1px solid ${T.border}`:'none', cursor:t.n>0?'pointer':'default', textAlign:'center'}}
            onMouseEnter={e=>{if(t.n>0)e.currentTarget.style.background=T.surfaceAlt}} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div style={{fontSize:26, fontWeight:700, fontFamily:MONO, color:t.n>0?t.c:T.ink3}}>{t.n}</div>
            <div style={{fontSize:11.5, color:T.ink2, marginTop:2}}>{t.l}</div>
          </div>
        ))}
      </div>
    </div>}

    {/* EL EQUIPO — oversight para dueños: pendientes de cada PM */}
    {equipo.length>0 && <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', marginTop:14}}>
      <CardHead>El equipo · pendientes de cada uno</CardHead>
      <div style={{display:'grid', gridTemplateColumns:'1.3fr 90px 100px 90px', padding:'8px 18px', fontSize:10.5, fontWeight:600, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, borderTop:`1px solid ${T.border}`}}>
        <span>PM</span><span style={{textAlign:'center'}}>sin staff</span><span style={{textAlign:'center'}}>para facturar</span><span style={{textAlign:'center'}}>por cobrar</span>
      </div>
      {equipo.map((m,i)=>(
        <div key={i} style={{display:'grid', gridTemplateColumns:'1.3fr 90px 100px 90px', padding:'10px 18px', borderTop:`1px solid ${T.border}`, alignItems:'center', fontSize:13}}>
          <span style={{color:T.ink, fontWeight:600}}>{m.nombre} <span style={{fontWeight:400, color:T.ink3, fontSize:11.5}}>· {m.t.n} proy</span></span>
          <span style={{textAlign:'center', fontFamily:MONO, fontWeight:600, color:m.t.ss>0?T.brand:T.ink3}}>{m.t.ss}</span>
          <span style={{textAlign:'center', fontFamily:MONO, fontWeight:600, color:m.t.sf>0?T.brand:T.ink3}}>{m.t.sf}</span>
          <span style={{textAlign:'center', fontFamily:MONO, fontWeight:600, color:m.t.pc>0?T.warn:T.ink3}}>{m.t.pc}</span>
        </div>
      ))}
    </div>}

    {yo && yo.verTodo && <TeamMails/>}

    {/* HERO — los 3 números que mirás todos los días (clickeables) */}
    <div style={{display:'flex', gap:14}}>
      <div style={{flex:1, cursor:'pointer'}} onClick={()=>setVerCuentas(v=>!v)} title="Ver detalle por cuenta">
        <Hero label="Disponible real"
          value={fmt(totalDisponible)}
          sub={`En caja ${fmt(totalCaja)} · reservado ${fmt(totalReservado)} · `} subStrong={verCuentas?'ocultar ▲':'ver cuentas ▼'} subStrongColor={T.ink3}/>
      </div>
      <div style={{flex:1, cursor:'pointer'}} onClick={()=>goTo&&goTo('facturacion', atrasadas30.length>0?'atrasadas':undefined)}>
        <Hero label="Por cobrar"
          value={fmt(totalPorCobrar)}
          accent={atrasadas30.length>0?T.brand:T.ink}
          sub={`${porCobrar.length} facturas · `}
          subStrong={atrasadas30.length>0?`${atrasadas30.length} atrasadas +30d →`:'al día →'}
          subStrongColor={atrasadas30.length>0?T.brand:T.pos}/>
      </div>
      <div style={{flex:1, cursor:'pointer'}} onClick={()=>goTo&&goTo('pagos')}>
        <Hero label={`A pagar staff · ${proxPagoFecha.getDate()}/${proxPagoFecha.getMonth()+1}`}
          value={fmt(totalAPagar)}
          sub={`${staffAPagar.length} freelancers · `} subStrong="ver →" subStrongColor={T.ink3}/>
      </div>
    </div>
    {verCuentas && <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:'14px 18px', marginTop:12}}>
      <div style={{fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:0.4, color:T.ink3, marginBottom:10}}>Plata por cuenta</div>
      {cuentasActivas.map((c,i)=>{ const saldo=parseMonto(c['Saldo actual']); const usd=parseMonto(c['Saldo USD']); return (
        <div key={i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderTop:i===0?'none':`1px solid ${T.border}`}}>
          <div><div style={{fontSize:13, color:T.ink, fontWeight:500}}>{c['Nombre']}</div>{c['Banco']&&<div style={{fontSize:11, color:T.ink3}}>{c['Banco']}</div>}</div>
          <div style={{textAlign:'right'}}><div style={{fontSize:13.5, fontFamily:MONO, color:T.ink}}>{fmt(saldo)}</div>{usd>0&&<div style={{fontSize:11, fontFamily:MONO, color:T.ink3}}>USD {fmt(usd)}</div>}</div>
        </div>
      )})}
      <div style={{display:'flex', justifyContent:'space-between', padding:'10px 0 0', marginTop:6, borderTop:`1px solid ${T.border}`}}>
        <span style={{fontSize:12.5, color:T.ink2}}>En caja</span><span style={{fontSize:13.5, fontFamily:MONO, fontWeight:700, color:T.ink}}>{fmt(totalCaja)}</span>
      </div>
      {totalReservado>0 && <div style={{display:'flex', justifyContent:'space-between', padding:'4px 0'}}><span style={{fontSize:12.5, color:T.warn}}>Reservado (IVA/imp.)</span><span style={{fontSize:13, fontFamily:MONO, color:T.warn}}>-{fmt(totalReservado)}</span></div>}
      <div style={{display:'flex', justifyContent:'space-between', padding:'4px 0'}}><span style={{fontSize:12.5, color:T.ink2, fontWeight:600}}>Disponible real</span><span style={{fontSize:14, fontFamily:MONO, fontWeight:700, color:T.pos}}>{fmt(totalDisponible)}</span></div>
      <div style={{fontSize:11, color:T.ink3, marginTop:8}}>Los saldos se cargan manual en la solapa CUENTAS del sheet. Mañana los actualizás.</div>
    </div>}

    {/* ESTE MES */}
    <SectionTitle>{MESES_LARGO[mesActual-1]} · este mes</SectionTitle>
    <div style={{display:'flex', gap:12, flexWrap:'wrap'}}>
      <Stat label="Cobrado" value={fmt(ingresosMes)} color={T.pos} sub="plata que entró este mes"/>
      {pctATiempo!=null && <Stat label="Cobrado a tiempo" value={pctATiempo+'%'} color={pctATiempo>=70?T.pos:T.brand} sub={`pagadas dentro de 30 días (objetivo). Hoy tardan ${diasPromCobro} días en promedio · ${facMedibles.length} fact.`}/>}
      <Stat label="Facturado (eventos)" value={fmt(facMesTotales)} sub="valor de los trabajos de este mes"/>
      <Stat label="Pagos staff" value={fmt(pagosStaffMes)} sub="staff de eventos de este mes (sin Somos Magma)"/>
      <Stat label="Ganancia Magma" value={fmtS(rentabilidadMes)} color={rentabilidadMes>=0?T.pos:T.brand} sub="fee + Somos Magma + diferencia del mes"/>
      <Stat label="Conversión" value={tasaConversion+'%'} sub={`${apMes} aprob. de ${denom} presus del mes`}/>
      <Stat label="Ticket prom." value={fmt(ticketPromedio)} sub={`${eventosMes} ${eventosMes===1?'evento aprobado':'eventos aprobados'} este mes`}/>
    </div>

    {/* PIPELINE */}
    <SectionTitle>El mes pasado, este, y lo que viene</SectionTitle>
    <div style={{display:'flex', gap:12}}>
      {pipeline.map((p,i)=>(
        <div key={i} style={{flex:1, background:p.esActual?T.brandSoft:T.surface, border:`1px solid ${p.esActual?T.brand:T.border}`, borderRadius:12, padding:'16px 18px'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
            <span style={{fontSize:12.5, fontWeight:p.esActual?700:600, color:p.esActual?T.brand:T.ink}}>{MESES_LARGO[p.m-1]}{p.esActual?' · hoy':''}</span>
            <span style={{fontSize:11, color:T.ink3}}>{p.cant} aprob.</span>
          </div>
          <div style={{fontSize:22, fontWeight:600, fontFamily:MONO, color:T.ink, marginTop:10}}>{fmtM(p.fact)}</div>
          <div style={{fontSize:11.5, color:T.ink2, marginTop:4}}>{p.esPasado?'facturado':'facturación esperada'}</div>
          <div style={{fontSize:13, fontWeight:600, fontFamily:MONO, color:T.pos, marginTop:10}}>{fmtM(p.gan)} <span style={{fontSize:11, fontWeight:400, color:T.ink3, fontFamily:'inherit'}}>ganancia neta</span></div>
        </div>
      ))}
    </div>

    {/* DOS COLUMNAS: atención + alertas */}
    <div style={{display:'flex', gap:14, marginTop:28, alignItems:'flex-start'}}>
      <div style={{flex:1.4, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
        <CardHead>Cobros atrasados</CardHead>
        {atrasadas30.length===0
          ? <Empty>Sin cobros atrasados +30 días 🎉</Empty>
          : atrasadas30.slice(0,8).map((f,i)=>(
            <div key={i} onClick={()=>goTo&&goTo('facturacion','atrasadas')}
              style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'11px 18px', borderTop:`1px solid ${T.border}`, cursor:'pointer'}}
              onMouseEnter={e=>e.currentTarget.style.background=T.surfaceAlt} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div style={{minWidth:0}}>
                <div style={{fontSize:13, color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{f['Cliente']||f['Agencia']||'—'}</div>
                <div style={{fontSize:11.5, color:T.ink3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{f['Proyecto']||''}</div>
              </div>
              <div style={{textAlign:'right', flexShrink:0, marginLeft:12, display:'flex', alignItems:'center', gap:10}}>
                <div><div style={{fontSize:13, fontFamily:MONO, color:T.ink, fontWeight:600}}>{fmt(f.monto)}</div>
                <div style={{fontSize:11, color:T.brand, fontWeight:600}}>{f.diasDesdeEvento}d</div></div>
                <button onClick={e=>{e.stopPropagation(); setCobrando(f)}} title="Registrar el cobro sin salir del Dashboard" style={{fontSize:11, padding:'5px 12px', borderRadius:7, border:'none', background:T.pos, color:'#fff', fontWeight:700, cursor:'pointer', flexShrink:0}}>Cobrar</button>
              </div>
            </div>
          ))}
      </div>

      <div style={{flex:1, display:'flex', flexDirection:'column', gap:14}}>
        <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
          <CardHead>Listo para facturar</CardHead>
          {parafacturar.length===0
            ? <Empty>Nada pendiente de facturar 🎉</Empty>
            : parafacturar.slice(0,6).map((x,i)=>(
              <div key={i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, padding:'10px 18px', borderTop:`1px solid ${T.border}`}}>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:13, color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{x.p['Cliente']||x.p['Agencia']||'—'}</div>
                  <div style={{fontSize:11.5, color:T.ink3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{x.p['Proyecto']||''}</div>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:9, flexShrink:0}}>
                  <span style={{fontSize:12.5, fontFamily:MONO, color:T.ink, fontWeight:600}}>{fmt(x.pendiente)}</span>
                  <button onClick={()=>setFacturando(x)} title="Crear la factura sin salir del Dashboard" style={{fontSize:11, padding:'5px 12px', borderRadius:7, border:'none', background:T.brand, color:'#fff', fontWeight:700, cursor:'pointer'}}>Facturar</button>
                </div>
              </div>
            ))}
        </div>
        <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
          <CardHead>Necesita atención</CardHead>
          {alertas.length===0
            ? <Empty>Todo en orden ✓</Empty>
            : alertas.map((a,i)=>(
              <div key={i} onClick={()=>a.to&&goTo&&goTo(a.to,a.filtro)} style={{display:'flex', gap:10, alignItems:'flex-start', padding:'11px 18px', borderTop:`1px solid ${T.border}`, cursor:a.to?'pointer':'default'}}
                onMouseEnter={e=>{if(a.to)e.currentTarget.style.background=T.surfaceAlt}} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <span style={{width:7,height:7,borderRadius:7,marginTop:5,flexShrink:0,background:a.sev==='brand'?T.brand:T.warn}}/>
                <span style={{fontSize:12.5, color:T.ink2, lineHeight:1.4, flex:1}}>{a.txt}</span>
                {a.to && <span style={{fontSize:12, color:T.ink3}}>→</span>}
              </div>
            ))}
        </div>
        <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
          <CardHead>Top clientes {anioActual}</CardHead>
          {topClientes.map(([c,m],i)=>(
            <div key={i} style={{display:'flex', justifyContent:'space-between', padding:'9px 18px', borderTop:`1px solid ${T.border}`}}>
              <span style={{fontSize:12.5, color:T.ink}}>{c}</span>
              <span style={{fontSize:12.5, fontFamily:MONO, color:T.ink2}}>{fmtM(m)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  {cobrando && <CobroModal f={cobrando} cuentas={cuentas} onClose={()=>setCobrando(null)} onRefresh={onRefresh} showToast={showToast}/>}
  {facturando && <NuevaFactura pendientes={parafacturar} agencias={data.agencias||[]} contactos={data.contactos||[]} initialSel={facturando} onClose={()=>setFacturando(null)} onCreada={()=>{ setFacturando(null); if(onRefresh) onRefresh() }} showToast={showToast}/>}
  </>
}

// ============================ PRESUPUESTOS ============================
const ESTADOS_DOT = {
  'APROBADO':{c:T.pos,l:'Aprobado'},
  'EN CURSO':{c:T.pos,l:'En curso'},
  'ENTREGADO':{c:T.ink3,l:'Entregado'},
  'EN ESPERA':{c:T.warn,l:'En espera'},
  'DESAPROBADO':{c:T.brand,l:'Desaprobado'},
  'REPRESUPUESTADO':{c:T.ink3,l:'Represup.'},
}
const estadoInfo = e => ESTADOS_DOT[String(e||'').toUpperCase()] || {c:T.warn,l:e||'—'}

function Presupuestos({data, onRefresh, showToast, nav, clearNav}){
  const [rows,setRows]=useState(data.presupuestos||[])
  useEffect(()=>{ setRows(data.presupuestos||[]) },[data.presupuestos])
  useEffect(()=>{ if(nav?.mod==='presupuestos'){ if(nav.filtro==='__nuevo__'){ setNuevo(true) } else if(nav.filtro){ setF(nav.filtro) } if(nav.q){setQ(nav.q); setF('todos')} clearNav&&clearNav() } /* eslint-disable-next-line */ },[nav])
  const presus = rows
  const [q,setQ]=useState(''), [f,setF]=useState('todos'), [anio,setAnio]=useState('todos'), [mes,setMes]=useState('todos'), [pm,setPm]=useState('todos'), [open,setOpen]=useState(null), [editing,setEditing]=useState(null), [nuevo,setNuevo]=useState(false), [represu,setRepresu]=useState(null), [aprobAdic,setAprobAdic]=useState(null), [aprobSaving,setAprobSaving]=useState(false), [borrando,setBorrando]=useState(null), [borrSaving,setBorrSaving]=useState(false)

  async function eliminarPresupuesto(){
    const p=borrando; if(!p) return
    const id=p['Columna 1']
    setBorrSaving(true)
    try{
      const r=await fetch('/api/presupuesto-eliminar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, fila:p.__row})})
      const j=await r.json()
      if(j.error){ showToast(j.error,'err'); setBorrSaving(false); if(j.recargar&&onRefresh) onRefresh(); return }
      // filtra por fila, no por número: hay N° repetidos y se borraría el de la fila equivocada
      setRows(rs=>rs.filter(rr=> p.__row ? rr.__row!==p.__row : String(rr['Columna 1'])!==String(id)))
      setBorrando(null); setBorrSaving(false); setOpen(null)
      showToast(`#${id} eliminado`)
      if(onRefresh) onRefresh()
      // Si tenía evento en Calendar, lo sacamos también
      fetch('/api/calendar-evento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, accion:'borrar'})}).catch(()=>{})
    }catch(e){ showToast('Error de conexión','err'); setBorrSaving(false) }
  }

  async function aprobarConAdic({nuevoEsAdic, nuevoTotal}){
    const p=aprobAdic; if(!p) return
    const id=p['Columna 1']
    setAprobSaving(true)
    try{
      await fetch('/api/presupuesto-editar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, cambios:{'Es Adicional':nuevoEsAdic, 'Precio Final':Math.round(nuevoTotal), 'Total':Math.round(nuevoTotal)}})})
      const r=await fetch('/api/presupuesto-estado',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, estado:'APROBADO', noCalendar:true})})
      const j=await r.json(); if(j.error){ showToast(j.error,'err'); setAprobSaving(false); return }
      showToast(`#${id} aprobado`); setAprobAdic(null); setAprobSaving(false)
      if(onRefresh) onRefresh()
      fetch('/api/calendar-evento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, accion:'aprobar'})}).catch(()=>{})
    }catch(e){ showToast('Error de conexión','err'); setAprobSaving(false) }
  }

  async function cambiarEstado(id, nuevo, actual){
    if(String(nuevo).toUpperCase()===String(actual||'').toUpperCase()) return
    const eraActivo = ['APROBADO','EN CURSO','ENTREGADO'].includes(String(actual||'').toUpperCase())
    if(eraActivo && nuevo!=='APROBADO'){
      if(!window.confirm(`Pasar a "${estadoInfo(nuevo).l}" va a sacar este trabajo de PROYECTOS. ¿Seguro?`)) return
    }
    setRows(rs=>rs.map(r=> (String(r['Columna 1'])===String(id) ? {...r, Estado:nuevo} : r)))
    try{
      const r=await fetch('/api/presupuesto-estado',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, estado:nuevo, noCalendar:true})})
      const j=await r.json()
      if(j.error){ showToast(j.error,'err'); setRows(rs=>rs.map(rr=>(String(rr['Columna 1'])===String(id)?{...rr,Estado:actual}:rr))); return }
      showToast(`#${id} → ${estadoInfo(nuevo).l}`)
      if(onRefresh) onRefresh()  // refresca datos globales: Proyectos/Facturación/Calendar quedan sincronizados
      // Calendar en segundo plano
      const accion = nuevo==='APROBADO'?'aprobar':(nuevo==='DESAPROBADO'||nuevo==='REPRESUPUESTADO')?'borrar':'pendiente'
      fetch('/api/calendar-evento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, accion})}).catch(()=>{})
    }catch(e){ showToast('Error de conexión','err'); setRows(rs=>rs.map(rr=>(String(rr['Columna 1'])===String(id)?{...rr,Estado:actual}:rr))) }
  }

  const pms = [...new Set(presus.map(p=>p['PM Interno']).filter(Boolean))].sort()
  const anios = [...new Set(presus.map(p=>{const f=p['Fecha Evento']||p['Fecha Presupuesto']||'';return f.split('/')[2]}).filter(Boolean))].sort().reverse()

  const filtered = presus.filter(p=>{
    const e=String(p['Estado']||'').toUpperCase()
    const mf = f==='todos'||(f==='ap'&&(e==='APROBADO'||e==='EN CURSO'||e==='ENTREGADO'))||(f==='esp'&&e==='EN ESPERA')||(f==='des'&&e==='DESAPROBADO')||(f==='rep'&&e==='REPRESUPUESTADO')||(f==='cur'&&e==='EN CURSO')
    const mpm = pm==='todos'||p['PM Interno']===pm
    const mq = !q||[p['Columna 1'],p['Proyecto'],p['Cliente'],p['Agencia'],p['PM Interno']].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase()))
    const fp=p['Fecha Presupuesto']||'', fe=p['Fecha Evento']||''
    const manio = anio==='todos'||fe.includes(anio)||fp.includes(anio)
    const mmes = mes==='todos'||parseInt((fe||fp).split('/')[1])===parseInt(mes)
    return mf&&mpm&&manio&&mmes&&mq
  }).reverse()

  const FILTROS = [['todos','Todos'],['ap','Aprobados'],['esp','En espera'],['des','Desaprob.'],['rep','Represup.']]

  return <>
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:22}}>
      <div><h1 style={{fontSize:23, fontWeight:700, color:T.ink, margin:0, letterSpacing:-0.3}}>Presupuestos</h1><div style={{fontSize:13, color:T.ink3, marginTop:3}}>{filtered.length} de {presus.length}</div></div>
      <button onClick={()=>setNuevo(true)} style={{padding:'10px 18px', borderRadius:10, border:'none', background:T.brand, color:'#fff', fontSize:13.5, fontWeight:600, cursor:'pointer'}}>+ Nuevo presupuesto</button>
    </div>

    {/* Filtros */}
    <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', marginBottom:16}}>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar N°, cliente, proyecto, PM…"
        style={{flex:'1 1 260px', minWidth:200, padding:'9px 13px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13, outline:'none'}}/>
      <select value={pm} onChange={e=>setPm(e.target.value)} style={selectStyle}><option value="todos">Todos los PM</option>{pms.map(p=><option key={p} value={p}>{p}</option>)}</select>
      <select value={anio} onChange={e=>setAnio(e.target.value)} style={selectStyle}><option value="todos">Año</option>{anios.map(a=><option key={a} value={a}>{a}</option>)}</select>
      <select value={mes} onChange={e=>setMes(e.target.value)} style={selectStyle}><option value="todos">Mes</option>{MESES_LARGO.map((m,i)=><option key={i} value={i+1}>{m}</option>)}</select>
    </div>

    {/* Pills de estado */}
    <div style={{display:'flex', gap:7, marginBottom:14}}>
      {FILTROS.map(([k,l])=>(
        <button key={k} onClick={()=>setF(k)} style={{
          padding:'6px 13px', borderRadius:20, fontSize:12, fontWeight:500, cursor:'pointer',
          border:`1px solid ${f===k?T.ink:T.border}`,
          background:f===k?T.ink:T.surface, color:f===k?'#fff':T.ink2,
        }}>{l}</button>
      ))}
    </div>

    {/* Tabla */}
    <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
      <div style={{display:'grid', gridTemplateColumns:'90px 1.8fr 1.1fr 110px 130px', gap:0, padding:'11px 18px', borderBottom:`1px solid ${T.border}`, fontSize:10.5, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3}}>
        <span>Evento</span><span>Proyecto</span><span>Cliente</span><span style={{textAlign:'right'}}>Total</span><span style={{textAlign:'right'}}>Estado</span>
      </div>
      {filtered.length===0 && <Empty>Sin resultados</Empty>}
      {filtered.slice(0,200).map((p,i)=>{
        const id=p['Columna 1']||p['N° presupuesto']||''
        const info=estadoInfo(p['Estado'])
        const abierto = open===id
        return <div key={id+'_'+i}>
          <div onClick={()=>setOpen(abierto?null:id)} style={{display:'grid', gridTemplateColumns:'90px 1.8fr 1.1fr 110px 130px', gap:0, padding:'12px 18px', borderTop:i===0?'none':`1px solid ${T.border}`, cursor:'pointer', alignItems:'center', background:abierto?T.surfaceAlt:'transparent', fontSize:13}}
            onMouseEnter={e=>{if(!abierto)e.currentTarget.style.background=T.surfaceAlt}} onMouseLeave={e=>{if(!abierto)e.currentTarget.style.background='transparent'}}>
            <span style={{fontSize:12, color:T.ink2}}>{p['Fecha Evento']||'—'}</span>
            <span style={{color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:10}}>{p['Proyecto']||<em style={{color:T.ink3, fontStyle:'normal'}}>sin nombre</em>}</span>
            <span style={{color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:10}}>{p['Cliente']||'—'}</span>
            <span style={{textAlign:'right', fontFamily:MONO, fontSize:12.5, color:T.ink}}>{fmt(parseMonto(p['Precio Final']))}</span>
            <EstadoSelect value={p['Estado']} onChange={nuevo=> nuevo==='REPRESUPUESTADO' ? setRepresu(p) : (nuevo==='APROBADO' && presuTieneAdicionales(p)) ? setAprobAdic(p) : cambiarEstado(id, nuevo, p['Estado'])}/>
          </div>
          {abierto && <DetallePresupuesto p={p} id={id} onEdit={()=>setEditing(p)} onRepresupuestar={()=>setRepresu(p)} onEliminar={()=>setBorrando(p)}/>}
        </div>
      })}
    </div>
    {filtered.length>200 && <div style={{fontSize:12, color:T.ink3, textAlign:'center', marginTop:12}}>Mostrando primeros 200 de {filtered.length}</div>}
    {editing && <EditarModal p={editing} data={data} onClose={()=>setEditing(null)} showToast={showToast}
      onSaved={(id,cambios)=>{ setRows(rs=>rs.map(r=>String(r['Columna 1'])===String(id)?{...r,...cambios}:r)); setEditing(null); if(onRefresh) onRefresh() }}/>}
    {nuevo && <NuevoPresupuesto data={data} showToast={showToast} onClose={()=>setNuevo(false)} onGuardado={()=>{ setNuevo(false); if(onRefresh) onRefresh() }}/>}
    {represu && <NuevoPresupuesto data={data} initialData={represu} showToast={showToast} onClose={()=>setRepresu(null)} onGuardado={()=>{ setRepresu(null); if(onRefresh) onRefresh() }}/>}
    {aprobAdic && <AprobarAdicionalesModal presu={aprobAdic} saving={aprobSaving} onClose={()=>setAprobAdic(null)} onConfirm={aprobarConAdic}/>}
    {borrando && <EliminarPresupuestoModal presu={borrando} saving={borrSaving} onClose={()=>setBorrando(null)} onConfirm={eliminarPresupuesto}/>}
  </>
}

function EstadoSelect({value, onChange}){
  const info = estadoInfo(value)
  const cur = String(value||'').toUpperCase()
  return <span onClick={e=>e.stopPropagation()} style={{display:'inline-flex', alignItems:'center', gap:6, justifyContent:'flex-end'}}>
    <span style={{width:7,height:7,borderRadius:7,background:info.c,flexShrink:0}}/>
    <select value={ESTADOS_DOT[cur]?cur:''} onChange={e=>onChange(e.target.value)}
      title="Cambiar estado"
      style={{border:'none', background:'transparent', color:T.ink2, fontSize:12, cursor:'pointer', outline:'none', WebkitAppearance:'none', MozAppearance:'none', appearance:'none', textAlign:'right'}}>
      {!ESTADOS_DOT[cur] && <option value="">{info.l}</option>}
      {Object.keys(ESTADOS_DOT).map(k=><option key={k} value={k}>{ESTADOS_DOT[k].l}</option>)}
    </select>
  </span>
}

function EditarModal({p, data, onClose, onSaved, showToast}){
  const campos = [
    ['PM Interno','PM',false], ['Fecha Evento','Fecha evento (DD/MM/AAAA)',false],
    ['Proyecto','Proyecto',false], ['Agencia','Agencia','ag'], ['Cliente','Cliente','cl'],
    ['Contacto','Contacto','ct'], ['Horario','Horario (ej 8:00 a 18:00)',false],
    ['Ubicación','Ubicación',false], ['Contacto Lugar','Contacto en el lugar',false],
    ['Observaciones','Observaciones (salen en el PDF)','area'],
  ]
  const [form,setForm]=useState(()=>{ const o={}; campos.forEach(([k])=>o[k]=p[k]||''); return o })
  const [saving,setSaving]=useState(false)
  const [agNew,setAgNew]=useState({cuit:'',condIVA:'Responsable Inscripto',mailFact:'',telefono:''})
  const [ctNew,setCtNew]=useState({mail:'',telefono:'',cargo:'',cuit:''})
  const id = p['Columna 1'] || p['N° presupuesto']
  const ags=dedupCI([...(data?.agencias||[]).map(x=>x['Nombre']),...((data?.presupuestos||[]).map(x=>x['Agencia']))])
  const clis=[...new Set([...(data?.clientes||[]).map(x=>x['Nombre']),...((data?.presupuestos||[]).map(x=>x['Cliente']))].filter(Boolean))].sort()
  const cts=[...new Set([...(data?.contactos||[]).map(x=>x['Nombre']),...((data?.presupuestos||[]).map(x=>x['Contacto']))].filter(Boolean))].sort()
  const pms=[...new Set((data?.presupuestos||[]).map(x=>x['PM Interno']).filter(Boolean))].sort()
  const dl = tipo => tipo==='ag'?ags:tipo==='cl'?clis:tipo==='ct'?cts:null
  const nrm=v=>String(v||'').trim().toLowerCase()
  const agSet=new Set(ags.map(nrm)), clSet=new Set(clis.map(nrm)), ctSet=new Set(cts.map(nrm))
  const agNueva=(form['Agencia']||'').trim() && !/^(sin agencia|directo)/i.test((form['Agencia']||'').trim()) && !agSet.has(nrm(form['Agencia']))
  const clNuevo=(form['Cliente']||'').trim() && !clSet.has(nrm(form['Cliente']))
  const ctNuevo=(form['Contacto']||'').trim() && !ctSet.has(nrm(form['Contacto']))

  async function guardar(){
    const cambios={}
    campos.forEach(([k])=>{ if((form[k]||'')!==(p[k]||'')) cambios[k]=form[k] })
    // Si cambiás la Fecha Evento desde acá, es un día suelto → normalizar el tipo de fecha
    // para que no quede un "rango" viejo con el final desactualizado (rompía el Calendar en silencio).
    if(cambios['Fecha Evento']!==undefined){ cambios['Tipo Fechas']='dia'; cambios['Fechas Adicionales']='' }
    if(Object.keys(cambios).length===0){ showToast('No hay cambios','err'); return }
    setSaving(true)
    try{
      // 1. Fuente de verdad: el presupuesto
      const r=await fetch('/api/presupuesto-editar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, cambios})})
      const j=await r.json()
      if(!j.ok){ showToast(j.error||'Error','err'); setSaving(false); return }
      // 2. Si está aprobado (tiene proyecto), espejar los campos compartidos al proyecto
      const aprobado = (data?.proyectos||[]).some(pr=>String(pr['N° presupuesto']||'').trim()===String(id).trim())
      if(aprobado){
        const camposProy={}; ['Fecha Evento','Cliente','Proyecto','Agencia','PM Interno','Contacto'].forEach(k=>{ if(cambios[k]!==undefined) camposProy[k]=cambios[k] })
        if(Object.keys(camposProy).length) { try{ await fetch('/api/proyecto-editar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, cambios:camposProy, propagarPresupuesto:false})}) }catch(e){} }
      }
      // Guardar entidades nuevas (agencia/contacto/cliente) en sus solapas
      if(ctNuevo){ try{ await fetch('/api/contacto-nuevo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:form['Contacto'], mail:ctNew.mail, telefono:ctNew.telefono, cuit:ctNew.cuit, agencia:form['Agencia'], cargo:ctNew.cargo})}) }catch(e){} }
      if(agNueva){ try{ await fetch('/api/agencia-upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:form['Agencia'], cuit:agNew.cuit, condIVA:agNew.condIVA, mailFact:agNew.mailFact, telefono:agNew.telefono})}) }catch(e){} }
      if(clNuevo){ try{ await fetch('/api/cliente-upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:form['Cliente']})}) }catch(e){} }
      showToast(`#${id} guardado`)
      onSaved(id, cambios)
      // 3. Resincronizar el Calendar en segundo plano (Google es lento)
      fetch('/api/calendar-evento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, accion: aprobado?'aprobar':'pendiente'})}).catch(()=>{})
    }catch(e){ showToast('Error de conexión','err'); setSaving(false) }
  }

  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.35)', zIndex:900, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'48px 20px', overflowY:'auto'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:520, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.15)'}}>
      <div style={{padding:'18px 22px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div><div style={{fontSize:16, fontWeight:700, color:T.ink}}>Editar datos</div><div style={{fontSize:12, color:T.ink3, marginTop:2, fontFamily:MONO}}>#{id} · {p['Proyecto']||'sin nombre'}</div></div>
        <button onClick={onClose} style={{border:'none', background:'transparent', fontSize:20, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
      </div>
      <div style={{padding:'20px 22px', display:'flex', flexDirection:'column', gap:13}}>
        {campos.map(([k,label,tipo])=>(
          <div key={k}>
            <label style={{fontSize:11, fontWeight:600, color:T.ink2, textTransform:'uppercase', letterSpacing:0.3, display:'block', marginBottom:5}}>{label}</label>
            {tipo==='area'
              ? <textarea value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} rows={3} style={{...inpV2, resize:'vertical'}}/>
              : k==='PM Interno'
                ? <input list="v2-pm" value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={inpV2}/>
                : <input list={dl(tipo)?'v2-'+tipo:undefined} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={inpV2}/>}
          </div>
        ))}
        <datalist id="v2-pm">{pms.map(x=><option key={x} value={x}/>)}</datalist>
        <datalist id="v2-ag">{ags.map(x=><option key={x} value={x}/>)}</datalist>
        <datalist id="v2-cl">{clis.map(x=><option key={x} value={x}/>)}</datalist>
        <datalist id="v2-ct">{cts.map(x=><option key={x} value={x}/>)}</datalist>
        {agNueva && <div style={{background:T.warnSoft, border:`1px solid ${T.warn}40`, borderRadius:10, padding:'12px 14px'}}>
          <div style={{fontSize:12, fontWeight:600, color:T.warn, marginBottom:8}}>🏢 Agencia nueva: "{form['Agencia']}" — completá sus datos (se guarda)</div>
          <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
            <div style={{flex:'1 1 130px'}}><label style={lblV2}>CUIT</label><input value={agNew.cuit} onChange={e=>setAgNew(a=>({...a,cuit:e.target.value}))} style={inpV2}/></div>
            <div style={{flex:'1 1 150px'}}><label style={lblV2}>Cond. IVA</label><input value={agNew.condIVA} onChange={e=>setAgNew(a=>({...a,condIVA:e.target.value}))} style={inpV2}/></div>
            <div style={{flex:'1 1 160px'}}><label style={lblV2}>Mail facturación</label><input value={agNew.mailFact} onChange={e=>setAgNew(a=>({...a,mailFact:e.target.value}))} style={inpV2}/></div>
            <div style={{flex:'1 1 130px'}}><label style={lblV2}>Teléfono</label><input value={agNew.telefono} onChange={e=>setAgNew(a=>({...a,telefono:e.target.value}))} style={inpV2}/></div>
          </div>
        </div>}
        {ctNuevo && <div style={{background:T.warnSoft, border:`1px solid ${T.warn}40`, borderRadius:10, padding:'12px 14px'}}>
          <div style={{fontSize:12, fontWeight:600, color:T.warn, marginBottom:8}}>☎ Contacto nuevo: "{form['Contacto']}" — completá sus datos (se guarda)</div>
          <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
            <div style={{flex:'1 1 160px'}}><label style={lblV2}>Mail</label><input value={ctNew.mail} onChange={e=>setCtNew(c=>({...c,mail:e.target.value}))} style={inpV2}/></div>
            <div style={{flex:'1 1 130px'}}><label style={lblV2}>Teléfono</label><input value={ctNew.telefono} onChange={e=>setCtNew(c=>({...c,telefono:e.target.value}))} style={inpV2}/></div>
            <div style={{flex:'1 1 130px'}}><label style={lblV2}>Cargo</label><input value={ctNew.cargo} onChange={e=>setCtNew(c=>({...c,cargo:e.target.value}))} style={inpV2}/></div>
            <div style={{flex:'1 1 130px'}}><label style={lblV2}>CUIT</label><input value={ctNew.cuit} onChange={e=>setCtNew(c=>({...c,cuit:e.target.value}))} style={inpV2}/></div>
          </div>
        </div>}
        {clNuevo && <div style={{fontSize:11.5, color:T.warn, fontWeight:600}}>🎯 Cliente nuevo: "{form['Cliente']}" — se guarda automáticamente.</div>}
      </div>
      <div style={{padding:'16px 22px', borderTop:`1px solid ${T.border}`, display:'flex', gap:10, justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{padding:'9px 18px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:500, cursor:'pointer'}}>Cancelar</button>
        <button onClick={guardar} disabled={saving} style={{padding:'9px 20px', borderRadius:9, border:'none', background:T.brand, color:'#fff', fontSize:13, fontWeight:600, cursor:saving?'default':'pointer', opacity:saving?0.6:1}}>{saving?'Guardando…':'Guardar'}</button>
      </div>
    </div>
  </div>
}

function DetallePresupuesto({p, id, onEdit, onRepresupuestar, onEliminar}){
  const servicios=[]
  for(let j=1;j<=12;j++){
    const ped=p['Pedido '+j]||p['Pedido'+j+' ']||''
    const prc=parseMonto(p['Precio '+j])
    if(ped&&prc>0) servicios.push({nombre:ped, precio:prc})
  }
  const subtotal=servicios.reduce((s,x)=>s+x.precio,0)
  const total=parseMonto(p['Precio Final'])
  const fee=total-subtotal

  return <div style={{padding:'4px 18px 20px', background:T.surfaceAlt, borderTop:`1px solid ${T.border}`}}>
    <div style={{display:'flex', gap:32, padding:'14px 0', flexWrap:'wrap'}}>
      {[['N°',id],['Agencia',p['Agencia']],['Carga',p['Fecha Presupuesto']],['Contacto',p['Contacto']],['PM',p['PM Interno']],['Horario',p['Horario']],['Ubicación',p['Ubicación']]].filter(x=>x[1]).map(([k,v])=>(
        <div key={k}><div style={{fontSize:10.5, textTransform:'uppercase', letterSpacing:0.4, color:T.ink3, fontWeight:600}}>{k}</div><div style={{fontSize:13, color:T.ink, marginTop:3}}>{v}</div></div>
      ))}
    </div>
    <div style={{display:'flex', gap:20, alignItems:'flex-start', flexWrap:'wrap'}}>
      <div style={{flex:'1 1 320px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, overflow:'hidden'}}>
        {servicios.length===0
          ? <div style={{padding:'14px 16px', fontSize:12.5, color:T.ink3}}>Sin servicios detallados</div>
          : servicios.map((s,i)=>(
            <div key={i} style={{display:'flex', justifyContent:'space-between', padding:'9px 16px', borderTop:i===0?'none':`1px solid ${T.border}`}}>
              <span style={{fontSize:12.5, color:T.ink2}}>{s.nombre}</span>
              <span style={{fontSize:12.5, fontFamily:MONO, color:T.ink}}>{fmt(s.precio)}</span>
            </div>
          ))}
      </div>
      <div style={{flex:'0 0 220px', minWidth:200}}>
        <ResumenLine label="Subtotal servicios" value={fmt(subtotal)}/>
        <ResumenLine label="Margen Magma / dif." value={fmt(fee)} color={T.ink2}/>
        <div style={{display:'flex', justifyContent:'space-between', padding:'12px 0 0', marginTop:8, borderTop:`1px solid ${T.border}`}}>
          <span style={{fontSize:13, fontWeight:600, color:T.ink}}>Precio final</span>
          <span style={{fontSize:15, fontWeight:700, fontFamily:MONO, color:T.brand}}>{fmt(total)}</span>
        </div>
        <div style={{display:'flex', gap:8, marginTop:14}}>
          <button onClick={onEdit} style={{flex:1, textAlign:'center', padding:'8px', borderRadius:8, border:'none', background:T.ink, color:'#fff', fontSize:12.5, fontWeight:600, cursor:'pointer'}}>Editar datos</button>
          <button onClick={onRepresupuestar} style={{flex:1, textAlign:'center', padding:'8px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:12.5, fontWeight:600, cursor:'pointer'}}>Represupuestar</button>
          <a href={`/presupuesto?nro=${encodeURIComponent(id)}`} target="_blank" rel="noreferrer" style={{flex:1, textAlign:'center', padding:'8px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:12.5, fontWeight:500, textDecoration:'none'}}>Ver PDF →</a>
        </div>
        <button onClick={onEliminar} style={{width:'100%', marginTop:8, padding:'7px', borderRadius:8, border:`1px solid ${T.border}`, background:'transparent', color:T.ink3, fontSize:12, fontWeight:500, cursor:'pointer'}}
          onMouseEnter={e=>{e.currentTarget.style.color=T.brand; e.currentTarget.style.borderColor=T.brand}}
          onMouseLeave={e=>{e.currentTarget.style.color=T.ink3; e.currentTarget.style.borderColor=T.border}}>Eliminar presupuesto</button>
      </div>
    </div>
  </div>
}

// ============================ NUEVO PRESUPUESTO ============================
const SVCS_LIST=[
  {n:'Foto 1/2',p:220000,fee:true},{n:'Foto 1',p:290000,fee:true},
  {n:'Video 1/2',p:220000,fee:true},{n:'Video 1',p:290000,fee:true},
  {n:'Film 1/2',p:220000,fee:true},{n:'Film 1',p:290000,fee:true},
  {n:'Film 12hs',p:350000,fee:true},{n:'Edit 60s',p:116000,fee:true},
  {n:'Edit 60s+',p:174000,fee:true},{n:'Asist 1/2',p:140000,fee:true},
  {n:'Asist 1',p:210000,fee:true},{n:'Vivo 1',p:350000,fee:true},
  {n:'Vivo 1/2',p:230000,fee:true},{n:'DirFoto',p:350000,fee:true},
  {n:'Sonido',p:290000,fee:true},{n:'Drone',p:290000,fee:true},
  {n:'FPV',p:405000,fee:true},{n:'Motion',p:230000,fee:true},
  {n:'Crudos',p:175000,fee:true},{n:'Edit 15-30s',p:116000,fee:true},
  {n:'Fotos',p:60000,fee:true},{n:'Go Pro',p:230000,fee:true},
  {n:'Viaticos',p:0,fee:false},{n:'Produ',p:0,fee:false},
  {n:'MakeUp',p:0,fee:false},{n:'Rental',p:0,fee:false},
  {n:'Model',p:0,fee:false},{n:'Catering',p:0,fee:false},{n:'Otros',p:0,fee:false},
]
// Normaliza un servicio para comparar: saca emoji y acentos, ½ pasa a 1/2.
// Así "📸 Foto ½" y "Foto 1/2" se reconocen como el mismo servicio.
const svcKey = s => String(s||'').replace(/½/g,'1/2')
  .normalize('NFD').replace(/[̀-ͯ]/g,'')
  .replace(/[^a-zA-Z0-9\s/+-]/g,'').replace(/\s+/g,' ').trim().toLowerCase()
// La lista de servicios sale del sheet (solapa "listado"). SVCS_LIST queda de
// respaldo por si el sheet no responde, y aporta el flag fee (si suma al margen
// Magma). Para un servicio nuevo se infiere: precio 0 = pass-through, sin fee.
const getSvcs = data => {
  const delSheet = data?.listado?.serviciosFull || []
  if(!delSheet.length) return SVCS_LIST
  const base = new Map(SVCS_LIST.map(s=>[svcKey(s.n), s]))
  const out = []
  delSheet.forEach(s=>{
    const k = svcKey(s.n), m = base.get(k)
    out.push({ n:s.n, p:s.p || m?.p || 0, fee: m ? m.fee : s.p > 0 })
    base.delete(k)
  })
  base.forEach(s=>out.push(s))
  return out
}
const isoToDMY = iso => { if(!iso) return ''; const [y,m,d]=String(iso).split('-'); return d&&m&&y?`${d}/${m}/${y}`:'' }
const dmyToISO = s => { const p=String(s||'').split('/'); if(p.length!==3) return ''; const y=p[2].length===4?p[2]:'20'+p[2]; return `${y}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}` }
const parseHorarioStr = s => { const m=String(s||'').match(/(\d{1,2})[:.]?(\d{0,2})\s*(?:a|hasta|-)\s*(\d{1,2})[:.]?(\d{0,2})/i); if(!m) return {h1:'',h2:''}; const pad=n=>String(n).padStart(2,'0'); return {h1:pad(parseInt(m[1]))+':'+(m[2]?pad(parseInt(m[2])):'00'), h2:pad(parseInt(m[3]))+':'+(m[4]?pad(parseInt(m[4])):'00')} }
// Lee los servicios del presupuesto original (para represupuestar) preservando fee/adicional/precio cliente
const readPedidosOrig = p => {
  if(!p) return []
  const feeFlags=String(p['Fee Servicios']||'').split('|')
  const adicFlags=String(p['Es Adicional']||'').split('|')
  const precioCli=String(p['Precio Cliente Manual']||'').split('|')
  const out=[]; let idx=0
  for(let i=1;i<=12;i++){
    const svc=p['Pedido '+i]||(i===1?p['Pedido']:'')||''
    const precio=parseMonto(p['Precio '+i]||(i===1?p['Precio']:''))
    if(svc||precio>0){
      const fl=feeFlags[idx]
      const feeAg=fl==='0'?false:fl==='1'?true:(SVCS_LIST.find(s=>s.n===svc)?.fee ?? true)
      const adicional=adicFlags[idx]==='1'
      out.push({id:idx+1, svc, precio:String(precio||''), feeAg, manual:false, adicional, precioCliente:adicional?(precioCli[idx]||''):''})
      idx++
    }
  }
  return out
}
const semaforo = pct => pct>=50?{c:T.pos,l:'sano'}:pct>=35?{c:T.warn,l:'aceptable'}:{c:T.brand,l:'bajo'}

function NuevoPresupuesto({data, onClose, onGuardado, showToast, initialData}){
  const hoyISO = new Date().toISOString().slice(0,10)
  const isRep = !!initialData
  const tipoOrig = String(initialData?.['Tipo Fechas']||'').toLowerCase().trim() || 'dia'
  const adicOrig = String(initialData?.['Fechas Adicionales']||'').trim()
  const horasOrig = parseHorarioStr(initialData?.['Horario'])
  const ajusteOrig = parseMonto(initialData?.['Ajuste'])
  const [form,setForm]=useState(isRep ? {
    fp:hoyISO,
    fechaMode:(tipoOrig==='rango'||tipoOrig==='multi')?tipoOrig:'dia',
    fe1:dmyToISO(initialData['Fecha Evento']),
    feIni: tipoOrig==='rango'?dmyToISO(initialData['Fecha Evento']):'',
    feFin: tipoOrig==='rango'&&adicOrig?dmyToISO(adicOrig):'',
    feMulti: tipoOrig==='multi'?adicOrig.split('|').filter(Boolean).join(', '):'',
    agencia:initialData['Agencia']||'', cliente:initialData['Cliente']||'', proyecto:initialData['Proyecto']||'',
    contacto:initialData['Contacto']||'', pm:initialData['PM Interno']||'',
    plazo:String(initialData['Plazo']||'0').replace(/[^\d]/g,'')||'0',
    interes:String(initialData['Interes %']||'0').replace(/[^\d.]/g,'')||'0',
    gan:parseMonto(initialData['Impuesto a las ganancias'])>0, iibb:parseMonto(initialData['IIBB'])>0,
    tajuste:ajusteOrig<0?'-1':'1', ajuste:String(Math.abs(ajusteOrig)||'0'),
    observaciones:initialData['Observaciones']||'', horaIni:horasOrig.h1, horaFin:horasOrig.h2,
    ubicacion:initialData['Ubicación']||'', descPct:'', motivo:'',
  } : { fp:hoyISO, fechaMode:'dia', fe1:'', feIni:'', feFin:'', feMulti:'', agencia:'', cliente:'', proyecto:'', contacto:'', pm:'', plazo:'0', interes:'0', gan:true, iibb:true, tajuste:'1', ajuste:'0', observaciones:'', horaIni:'', horaFin:'', ubicacion:'', descPct:'', motivo:'' })
  const [peds,setPeds]=useState(isRep && readPedidosOrig(initialData).length>0 ? readPedidosOrig(initialData) : [{id:1,svc:'',precio:'',feeAg:true,manual:false,adicional:false,precioCliente:''},{id:2,svc:'',precio:'',feeAg:true,manual:false,adicional:false,precioCliente:''}])
  const [saving,setSaving]=useState(false)
  const upd=(k,v)=>setForm(f=>({...f,[k]:v}))
  // datos extra para entidades nuevas
  const [ctNew,setCtNew]=useState({mail:'',telefono:'',cargo:'',cuit:''})
  const [agNew,setAgNew]=useState({cuit:'',condIVA:'Responsable Inscripto',mailFact:'',telefono:''})

  // autocompletes desde el sheet
  const ags=dedupCI([...(data?.agencias||[]).map(a=>a['Nombre']),...(data?.listado?.agencias||[]),...((data?.presupuestos||[]).map(p=>p['Agencia']))])
  const clis=dedupCI([...(data?.listado?.clientes||[]),...(data?.clientes||[]).map(c=>c['Nombre']),...((data?.presupuestos||[]).map(p=>p['Cliente']))])
  const cts=dedupCI([...(data?.contactos||[]).map(c=>c['Nombre']),...((data?.presupuestos||[]).map(p=>p['Contacto']))])
  const pms=[...new Set([...['Juan','Sofi','Lulu','Tomi'],...((data?.presupuestos||[]).map(p=>p['PM Interno']))].filter(Boolean))]
  // detección de nuevos (no están en la lista)
  const nrm=v=>String(v||'').trim().toLowerCase()
  const agSet=new Set(ags.map(nrm)), clSet=new Set(clis.map(nrm)), ctSet=new Set(cts.map(nrm))
  const agNueva=form.agencia.trim() && !/^(sin agencia|directo)/i.test(form.agencia.trim()) && !agSet.has(nrm(form.agencia))
  const clNuevo=form.cliente.trim() && !clSet.has(nrm(form.cliente))
  const ctNuevo=form.contacto.trim() && !ctSet.has(nrm(form.contacto))
  const ctExist=(data?.contactos||[]).find(c=>nrm(c['Nombre'])===nrm(form.contacto))
  const ctIncompleto=!!ctExist && (!sinErr(ctExist['Mail']) || !sinErr(ctExist['Teléfono']))
  const ctMostrar=ctNuevo||ctIncompleto
  // precargar datos del contacto existente para completar lo que falte
  useEffect(()=>{ const c=(data?.contactos||[]).find(x=>nrm(x['Nombre'])===nrm(form.contacto)); if(c) setCtNew({mail:sinErr(c['Mail']),telefono:sinErr(c['Teléfono']),cargo:sinErr(c['Cargo']),cuit:sinErr(c['Cuit'])}) /* eslint-disable-next-line */ },[form.contacto])

  const svcs=getSvcs(data)
  const updPed=(i,ch)=>setPeds(ps=>ps.map((p,j)=>j===i?{...p,...ch}:p))
  const selSvc=(i,nombre)=>{ const m=svcs.find(s=>s.n===nombre)||svcs.find(s=>svcKey(s.n)===svcKey(nombre)); if(m) updPed(i,{svc:m.n, precio:peds[i].manual&&peds[i].precio?peds[i].precio:(m.p||''), feeAg:m.fee}); else updPed(i,{svc:nombre}) }
  // alta de servicio nuevo — queda guardado en la solapa "listado"
  const [svcNew,setSvcNew]=useState(null) // {nombre, precio, fee} | null
  const [svcSaving,setSvcSaving]=useState(false)
  const guardarSvc=async()=>{
    const nombre=String(svcNew?.nombre||'').trim()
    if(!nombre) return showToast('Poné un nombre','err')
    setSvcSaving(true)
    try{
      const r=await fetch('/api/servicio-nuevo',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({nombre, precio:svcNew.precio||0})})
      const j=await r.json()
      if(!r.ok) return showToast(j.error||'No se pudo guardar','err')
      // lo uso en la primera línea vacía, o agrego una
      const idx=peds.findIndex(p=>!p.svc&&!p.adicional)
      const nuevo={svc:nombre, precio:String(svcNew.precio||''), feeAg:!!svcNew.fee, manual:false}
      if(idx>=0) updPed(idx,nuevo)
      else setPeds(ps=>[...ps,{id:Date.now(),...nuevo,adicional:false,precioCliente:''}])
      setSvcNew(null)
      showToast(`"${nombre}" agregado a la lista`,'ok')
    }catch(e){ showToast('Error de red','err') }
    finally{ setSvcSaving(false) }
  }
  const addPed=(adicional=false)=>setPeds(ps=>[...ps,{id:Date.now(),svc:'',precio:'',feeAg:!adicional,manual:false,adicional,precioCliente:''}])
  const delPed=i=>setPeds(ps=>ps.filter((_,j)=>j!==i))

  // ---- CÁLCULO ---- el margen (fee) lo decide el tilde "Fee" de cada servicio, no si hay agencia
  const baseList=peds.filter(p=>!p.adicional), adicList=peds.filter(p=>p.adicional)
  const subtotal=baseList.reduce((s,p)=>s+(parseFloat(p.precio)||0),0)
  const fee=baseList.reduce((s,p)=>p.feeAg?s+(parseFloat(p.precio)||0):s,0)
  const base=subtotal+fee
  const gan=form.gan?fee*0.35:0
  const iibb=form.iibb?fee*0.04:0
  const intMto=(base+gan+iibb)*((parseFloat(form.interes)||0)/100)
  const ajMto=(parseFloat(form.ajuste)||0)*parseInt(form.tajuste)
  const total=base+gan+iibb+intMto+ajMto
  const factor=subtotal>0?(total/subtotal):1
  const adicCalc=adicList.map(p=>{ const costo=parseFloat(p.precio)||0; const man=parseFloat(p.precioCliente)||0; const precioCliente=man>0?man:Math.round(costo*factor); const margen=precioCliente-costo; const margenPct=precioCliente>0?(margen/precioCliente)*100:0; return {svc:p.svc,costo,precioCliente,margen,margenPct} })
  const costoBase=baseList.reduce((s,p)=>s+(parseFloat(p.precio)||0),0)
  const margenBase=total-costoBase, margenBasePct=total>0?(margenBase/total)*100:0

  // Descuento %: calcula el monto exacto de ajuste para bajar el total ese %
  const aplicarDescPct=(v)=>{
    const pct=parseFloat(v)
    const totalSinAjuste=base+gan+iibb+intMto
    setForm(f=>({...f, descPct:v, ...(pct>0 ? {tajuste:'-1', ajuste:String(Math.round(totalSinAjuste*pct/100))} : {ajuste:'0'}) }))
  }

  const falta=[]; if(!form.cliente.trim())falta.push('Cliente'); if(!form.proyecto.trim())falta.push('Proyecto'); if(!form.pm.trim())falta.push('PM'); if(!baseList.some(p=>p.svc.trim()))falta.push('un servicio')
  const fechaOK = form.fechaMode==='dia'?form.fe1:form.fechaMode==='rango'?(form.feIni&&form.feFin):form.fe1
  if(!fechaOK)falta.push('Fecha evento')
  if(isRep && !String(form.motivo||'').trim())falta.push('motivo')
  const puedeGuardar = falta.length===0 && !saving

  async function guardar(){
    setSaving(true)
    // fechas
    let fechaEventoOut='', tipoFechas=form.fechaMode, fechasAdic='', cantFechas=1
    if(form.fechaMode==='dia'){ fechaEventoOut=isoToDMY(form.fe1); cantFechas=1 }
    else if(form.fechaMode==='rango'){ fechaEventoOut=isoToDMY(form.feIni); fechasAdic=isoToDMY(form.feFin); const d=Math.round((new Date(form.feFin)-new Date(form.feIni))/864e5)+1; cantFechas=Math.max(1,d) }
    else { fechaEventoOut=isoToDMY(form.fe1); const extra=String(form.feMulti||'').split(/[\n,]/).map(s=>s.trim()).filter(Boolean).map(s=>s.includes('-')?isoToDMY(s):s); fechasAdic=extra.join('|'); cantFechas=1+extra.length }

    const valid=peds.filter(p=>p.svc.trim())
    const plazoLabel={'0':'Contado','15':'15 días','30':'30 días','60':'60 días'}[form.plazo]||'Contado'
    const row={
      'Estado':'EN ESPERA', 'PM Interno':form.pm, 'Agencia':form.agencia.trim()||'Sin agencia / Directo',
      'Cliente':form.cliente, 'Proyecto':form.proyecto, 'Contacto':form.contacto,
      'Fecha Presupuesto':form.fp, 'Fecha Evento':fechaEventoOut, 'Cant. Fechas':cantFechas,
      'Precio Final':Math.round(total), 'Subtotal':Math.round(subtotal), 'Fee Agencia':Math.round(fee),
      'Impuesto a las ganancias':Math.round(gan), 'IIBB':Math.round(iibb),
      'Plazo':plazoLabel, 'Interes %':(parseFloat(form.interes)||0)?form.interes+'%':'', 'Interes $':Math.round(intMto),
      'Total':Math.round(total), 'Ajuste':Math.round(ajMto),
      'Tipo Fechas':tipoFechas, 'Fechas Adicionales':fechasAdic,
      'Fee Servicios':valid.map(p=>p.feeAg?'1':'0').join('|'),
      'Es Adicional':valid.map(p=>p.adicional?'1':'0').join('|'),
      'Precio Cliente Manual':valid.map(p=>p.adicional?(p.precioCliente||''):'').join('|'),
      'Observaciones':form.observaciones,
      'Horario':(form.horaIni&&form.horaFin)?`${form.horaIni} a ${form.horaFin} hs`:'',
      'Ubicación':form.ubicacion,
      'Contacto Lugar':form.contacto,          // por defecto = el mismo contacto; si es otro, se cambia en el Calendar
    }
    valid.forEach((p,idx)=>{ row[`Pedido ${idx+1}`]=p.svc; row[`Precio ${idx+1}`]=Math.round(parseFloat(p.precio)||0) })
    try{
      const r=await fetch('/api/presupuesto-nuevo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(row)})
      const j=await r.json()
      if(!j.ok){ showToast((j.error||'Error')+(j.detalles?': '+j.detalles.join(', '):''),'err'); setSaving(false); return }
      // Represupuestar: marcar el original como REPRESUPUESTADO (con motivo)
      if(isRep){
        try{ await fetch('/api/presupuesto-estado',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:initialData['Columna 1'], estado:'REPRESUPUESTADO', motivo:form.motivo})}) }
        catch(e){ showToast('Nuevo creado, pero no pude marcar el original — revisá','err') }
      }
      // Guardar entidades nuevas (contacto / agencia / cliente) en sus solapas
      if(ctNuevo || ctIncompleto){ try{ await fetch('/api/contacto-nuevo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:form.contacto, mail:ctNew.mail, telefono:ctNew.telefono, cuit:ctNew.cuit, agencia:form.agencia, cargo:ctNew.cargo})}) }catch(e){} }
      if(agNueva){ try{ await fetch('/api/agencia-upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:form.agencia, cuit:agNew.cuit, condIVA:agNew.condIVA, mailFact:agNew.mailFact, telefono:agNew.telefono})}) }catch(e){} }
      if(clNuevo){ try{ await fetch('/api/cliente-upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:form.cliente})}) }catch(e){} }
      showToast(isRep?`Represupuesto #${j.numero} creado · original marcado`:`Presupuesto #${j.numero} creado`); onGuardado&&onGuardado()
    }catch(e){ showToast('Error de conexión','err'); setSaving(false) }
  }

  const colP = (lbl,key,opts)=> <div style={{flex:1, minWidth:opts?.min||140}}><label style={lblV2}>{lbl}</label>{opts?.list?<><input list={opts.list} value={form[key]} onChange={e=>upd(key,e.target.value)} placeholder={opts.ph||''} style={inpV2}/>{opts.datalist}</>:<input type={opts?.type||'text'} value={form[key]} onChange={e=>upd(key,e.target.value)} placeholder={opts?.ph||''} style={inpV2}/>}</div>

  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:900, display:'flex', justifyContent:'center', overflowY:'auto', padding:'32px 20px'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:900, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)', height:'fit-content'}}>
      <div style={{padding:'18px 24px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, background:T.surface, borderRadius:'16px 16px 0 0', zIndex:2}}>
        <div style={{fontSize:17, fontWeight:700, color:T.ink}}>{isRep?`Represupuestar #${initialData['Columna 1']}`:'Nuevo presupuesto'}</div>
        <button onClick={onClose} style={{border:'none', background:'transparent', fontSize:22, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
      </div>

      <div style={{padding:'20px 24px'}}>
        {isRep && <div style={{background:T.brandSoft, border:`1px solid ${T.brand}30`, borderRadius:10, padding:'12px 14px', marginBottom:16}}>
          <div style={{fontSize:12, color:T.ink2, marginBottom:8}}>Se crea una <strong>versión nueva</strong> (en EN ESPERA) con estos datos editables. El original <strong>#{initialData['Columna 1']}</strong> queda marcado como REPRESUPUESTADO.</div>
          <label style={{...lblV2, color:T.brand}}>Motivo del represupuesto *</label>
          <input value={form.motivo||''} onChange={e=>upd('motivo',e.target.value)} placeholder="Ej: cambio de scope, ajuste de precios, nuevo pedido del cliente…" style={{...inpV2, borderColor:form.motivo?T.border:T.brand}} autoFocus/>
          <div style={{display:'flex', justifyContent:'flex-end', marginTop:10}}>
            <button onClick={async()=>{
              if(!form.motivo||!form.motivo.trim()){ showToast('Poné el motivo primero (ej: duplicado)','err'); return }
              if(!window.confirm(`Marcar #${initialData['Columna 1']} como REPRESUPUESTADO sin crear uno nuevo.\nUsalo si la versión nueva ya está cargada aparte.\n\n¿Confirmás?`)) return
              try{ const r=await fetch('/api/presupuesto-estado',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:initialData['Columna 1'], estado:'REPRESUPUESTADO', motivo:form.motivo})}); const j=await r.json(); if(j.error){showToast(j.error,'err');return} showToast(`#${initialData['Columna 1']} marcado como represupuestado`); onGuardado&&onGuardado() }
              catch(e){ showToast('Error de conexión','err') }
            }} style={{padding:'7px 12px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:11.5, fontWeight:500, cursor:'pointer'}}>Ya lo cargué aparte — marcar este sin crear uno nuevo →</button>
          </div>
        </div>}
        {/* Datos */}
        <div style={{display:'flex', gap:12, flexWrap:'wrap', marginBottom:12}}>
          {colP('Agencia (quién paga)','agencia',{list:'np-ag', ph:'Directo si no hay', datalist:<datalist id="np-ag">{ags.map(a=><option key={a} value={a}/>)}</datalist>})}
          {colP('Cliente / Marca','cliente',{list:'np-cl', datalist:<datalist id="np-cl">{clis.map(a=><option key={a} value={a}/>)}</datalist>})}
        </div>
        <div style={{display:'flex', gap:12, flexWrap:'wrap', marginBottom:12}}>
          {colP('Proyecto','proyecto',{min:200})}
          {colP('Contacto','contacto',{list:'np-ct', datalist:<datalist id="np-ct">{cts.map(a=><option key={a} value={a}/>)}</datalist>})}
          {colP('PM','pm',{list:'np-pm', min:110, datalist:<datalist id="np-pm">{pms.map(a=><option key={a} value={a}/>)}</datalist>})}
        </div>
        {/* Entidades nuevas → completar datos (se guardan al crear el presu) */}
        {agNueva && <div style={{background:T.warnSoft, border:`1px solid ${T.warn}40`, borderRadius:10, padding:'12px 14px', marginBottom:12}}>
          <div style={{fontSize:12, fontWeight:600, color:T.warn, marginBottom:8}}>🏢 Agencia nueva: "{form.agencia}" — completá sus datos (se guarda)</div>
          <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
            <div style={{flex:'1 1 130px'}}><label style={lblV2}>CUIT</label><input value={agNew.cuit} onChange={e=>setAgNew(a=>({...a,cuit:e.target.value}))} style={inpV2}/></div>
            <div style={{flex:'1 1 150px'}}><label style={lblV2}>Cond. IVA</label><input value={agNew.condIVA} onChange={e=>setAgNew(a=>({...a,condIVA:e.target.value}))} style={inpV2}/></div>
            <div style={{flex:'1 1 160px'}}><label style={lblV2}>Mail facturación</label><input value={agNew.mailFact} onChange={e=>setAgNew(a=>({...a,mailFact:e.target.value}))} style={inpV2}/></div>
            <div style={{flex:'1 1 130px'}}><label style={lblV2}>Teléfono</label><input value={agNew.telefono} onChange={e=>setAgNew(a=>({...a,telefono:e.target.value}))} style={inpV2}/></div>
          </div>
        </div>}
        {ctMostrar && <div style={{background:T.warnSoft, border:`1px solid ${T.warn}40`, borderRadius:10, padding:'12px 14px', marginBottom:12}}>
          <div style={{fontSize:12, fontWeight:600, color:T.warn, marginBottom:8}}>☎ {ctNuevo?`Contacto nuevo: "${form.contacto}" — completá sus datos`:`A "${form.contacto}" le faltan datos — completalos`} (se guarda)</div>
          <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
            <div style={{flex:'1 1 160px'}}><label style={lblV2}>Mail</label><input value={ctNew.mail} onChange={e=>setCtNew(c=>({...c,mail:e.target.value}))} style={inpV2}/></div>
            <div style={{flex:'1 1 130px'}}><label style={lblV2}>Teléfono</label><input value={ctNew.telefono} onChange={e=>setCtNew(c=>({...c,telefono:e.target.value}))} style={inpV2}/></div>
            <div style={{flex:'1 1 130px'}}><label style={lblV2}>Cargo</label><input value={ctNew.cargo} onChange={e=>setCtNew(c=>({...c,cargo:e.target.value}))} style={inpV2}/></div>
            <div style={{flex:'1 1 130px'}}><label style={lblV2}>CUIT</label><input value={ctNew.cuit} onChange={e=>setCtNew(c=>({...c,cuit:e.target.value}))} style={inpV2}/></div>
          </div>
        </div>}
        {clNuevo && <div style={{fontSize:11.5, color:T.warn, fontWeight:600, marginBottom:12, marginTop:-2}}>🎯 Cliente nuevo: "{form.cliente}" — se guarda automáticamente al crear el presu.</div>}
        {/* Fecha */}
        <div style={{display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end', marginBottom:18}}>
          <div><label style={lblV2}>Fecha evento</label>
            <select value={form.fechaMode} onChange={e=>upd('fechaMode',e.target.value)} style={{...inpV2, width:'auto'}}>
              <option value="dia">Un día</option><option value="rango">Rango</option><option value="multi">Varias fechas</option>
            </select>
          </div>
          {form.fechaMode==='dia' && <div><label style={lblV2}>Día</label><input type="date" value={form.fe1} onChange={e=>upd('fe1',e.target.value)} style={{...inpV2, width:'auto'}}/></div>}
          {form.fechaMode==='rango' && <><div><label style={lblV2}>Desde</label><input type="date" value={form.feIni} onChange={e=>upd('feIni',e.target.value)} style={{...inpV2, width:'auto'}}/></div><div><label style={lblV2}>Hasta</label><input type="date" value={form.feFin} onChange={e=>upd('feFin',e.target.value)} style={{...inpV2, width:'auto'}}/></div></>}
          {form.fechaMode==='multi' && <><div><label style={lblV2}>Primera</label><input type="date" value={form.fe1} onChange={e=>upd('fe1',e.target.value)} style={{...inpV2, width:'auto'}}/></div><div style={{flex:1, minWidth:180}}><label style={lblV2}>Otras (coma o línea)</label><input value={form.feMulti} onChange={e=>upd('feMulti',e.target.value)} placeholder="15/06/2026, 18/06/2026" style={inpV2}/></div></>}
        </div>

        {/* Servicios */}
        <div style={{fontSize:12.5, fontWeight:600, color:T.ink, marginBottom:8}}>Servicios</div>
        <div style={{display:'grid', gridTemplateColumns:'1.5fr 130px 60px 36px', gap:8, fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, padding:'0 2px 6px'}}>
          <span>Servicio</span><span style={{textAlign:'right'}}>Costo</span><span style={{textAlign:'center'}}>Fee</span><span/>
        </div>
        {peds.map((p,i)=> !p.adicional && (
          <div key={p.id} style={{display:'grid', gridTemplateColumns:'1.5fr 130px 60px 36px', gap:8, marginBottom:7, alignItems:'center'}}>
            <input list="np-svc" value={p.svc} onChange={e=>selSvc(i,e.target.value)} placeholder="Servicio" style={inpV2}/>
            <input type="number" value={p.precio} onChange={e=>updPed(i,{precio:e.target.value, manual:true})} placeholder="0" style={{...inpV2, textAlign:'right', fontFamily:MONO}}/>
            <input type="checkbox" checked={p.feeAg} onChange={e=>updPed(i,{feeAg:e.target.checked})} title="Aplica fee Magma" style={{justifySelf:'center', cursor:'pointer'}}/>
            <button onClick={()=>delPed(i)} style={{border:'none', background:'transparent', color:T.ink3, cursor:'pointer', fontSize:16}}>×</button>
          </div>
        ))}
        <datalist id="np-svc">{svcs.map(s=><option key={s.n} value={s.n}/>)}</datalist>
        <div style={{display:'flex', gap:14, alignItems:'center'}}>
          <button onClick={()=>addPed(false)} style={{fontSize:12, color:T.ink2, background:'transparent', border:'none', cursor:'pointer', padding:'4px 0'}}>+ Agregar servicio</button>
          <button onClick={()=>setSvcNew({nombre:'',precio:'',fee:true})} style={{fontSize:12, color:T.brand, background:'transparent', border:'none', cursor:'pointer', padding:'4px 0'}}>+ Crear servicio nuevo</button>
        </div>
        {svcNew && <div style={{border:`1px solid ${T.brand}`, borderRadius:8, padding:12, marginTop:8, background:T.surfaceAlt}}>
          <div style={{fontSize:11, fontWeight:600, color:T.ink2, marginBottom:8}}>SERVICIO NUEVO — queda guardado para todos los presupuestos</div>
          <div style={{display:'grid', gridTemplateColumns:'1.5fr 130px', gap:8, marginBottom:8}}>
            <input value={svcNew.nombre} onChange={e=>setSvcNew(s=>({...s,nombre:e.target.value}))} placeholder="Ej: Locución" style={inpV2} autoFocus/>
            <input type="number" value={svcNew.precio} onChange={e=>setSvcNew(s=>({...s,precio:e.target.value}))} placeholder="precio" style={{...inpV2, textAlign:'right', fontFamily:MONO}}/>
          </div>
          <label style={{display:'flex', gap:6, alignItems:'center', fontSize:12, color:T.ink2, marginBottom:10, cursor:'pointer'}}>
            <input type="checkbox" checked={svcNew.fee} onChange={e=>setSvcNew(s=>({...s,fee:e.target.checked}))} style={{cursor:'pointer'}}/>
            Aplica fee Magma <span style={{color:T.ink3}}>(destildar si es un costo que se pasa tal cual: viáticos, rental…)</span>
          </label>
          <div style={{display:'flex', gap:8}}>
            <button onClick={guardarSvc} disabled={svcSaving} style={{fontSize:12, padding:'6px 14px', borderRadius:6, border:'none', background:T.brand, color:'#fff', cursor:svcSaving?'wait':'pointer'}}>{svcSaving?'Guardando…':'Guardar'}</button>
            <button onClick={()=>setSvcNew(null)} style={{fontSize:12, padding:'6px 14px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:T.ink2, cursor:'pointer'}}>Cancelar</button>
          </div>
        </div>}

        {/* Adicionales opcionales */}
        {adicList.length>0 && <>
          <div style={{fontSize:12.5, fontWeight:600, color:T.ink, margin:'14px 0 6px'}}>Adicionales opcionales <span style={{fontWeight:400, color:T.ink3}}>(no suman al total principal)</span></div>
          <div style={{display:'grid', gridTemplateColumns:'1.5fr 110px 110px 36px', gap:8, fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, padding:'0 2px 5px'}}>
            <span>Adicional</span><span style={{textAlign:'right'}}>Costo (tuyo)</span><span style={{textAlign:'right'}}>Precio cliente</span><span/>
          </div>
          {peds.map((p,i)=> p.adicional && (()=>{ const costo=parseFloat(p.precio)||0, man=parseFloat(p.precioCliente)||0, cli=man>0?man:Math.round(costo*factor); return (
            <div key={p.id} style={{marginBottom:8}}>
              <div style={{display:'grid', gridTemplateColumns:'1.5fr 110px 110px 36px', gap:8, alignItems:'center'}}>
                <input list="np-svc" value={p.svc} onChange={e=>selSvc(i,e.target.value)} placeholder="Adicional" style={inpV2}/>
                <input type="number" value={p.precio} onChange={e=>updPed(i,{precio:e.target.value, manual:true})} placeholder="costo" style={{...inpV2, textAlign:'right', fontFamily:MONO}}/>
                <input type="number" value={p.precioCliente} onChange={e=>updPed(i,{precioCliente:e.target.value})} placeholder="auto" style={{...inpV2, textAlign:'right', fontFamily:MONO}}/>
                <button onClick={()=>delPed(i)} style={{border:'none', background:'transparent', color:T.ink3, cursor:'pointer', fontSize:16}}>×</button>
              </div>
              <div style={{fontSize:10.5, color:T.ink3, marginTop:3, paddingLeft:2}}>En el PDF el cliente ve: <strong style={{color:T.brand}}>{fmt(cli)} + IVA</strong>{man<=0?' (auto, con tu margen — escribí un precio cliente para fijarlo)':''}</div>
            </div>
          )})())}
        </>}
        <button onClick={()=>addPed(true)} style={{fontSize:12, color:T.ink2, background:'transparent', border:'none', cursor:'pointer', padding:'4px 0', marginLeft:adicList.length>0?0:12}}>+ Agregar adicional opcional</button>

        {/* Opciones de cálculo */}
        <div style={{display:'flex', gap:18, flexWrap:'wrap', alignItems:'flex-end', margin:'18px 0', paddingTop:16, borderTop:`1px solid ${T.border}`}}>
          <label style={{display:'flex', gap:7, alignItems:'center', fontSize:13, color:T.ink2, cursor:'pointer'}}><input type="checkbox" checked={form.gan} onChange={e=>upd('gan',e.target.checked)}/> Ganancias 35%</label>
          <label style={{display:'flex', gap:7, alignItems:'center', fontSize:13, color:T.ink2, cursor:'pointer'}}><input type="checkbox" checked={form.iibb} onChange={e=>upd('iibb',e.target.checked)}/> IIBB 4%</label>
          <div><label style={lblV2}>Plazo</label><select value={form.plazo} onChange={e=>upd('plazo',e.target.value)} style={{...inpV2, width:'auto'}}><option value="0">Contado</option><option value="15">15 días</option><option value="30">30 días</option><option value="60">60 días</option></select></div>
          <div style={{width:90}}><label style={lblV2}>Interés %</label><input type="number" value={form.interes} onChange={e=>upd('interes',e.target.value)} style={{...inpV2, textAlign:'right'}}/></div>
          <div><label style={lblV2}>Ajuste</label><select value={form.tajuste} onChange={e=>upd('tajuste',e.target.value)} style={{...inpV2, width:'auto'}}><option value="1">Recargo</option><option value="-1">Descuento</option></select></div>
          <div style={{width:120}}><label style={lblV2}>Monto ajuste</label><input type="number" value={form.ajuste} onChange={e=>upd('ajuste',e.target.value)} style={{...inpV2, textAlign:'right', fontFamily:MONO}}/></div>
          <div style={{width:100}}><label style={{...lblV2, color:T.warn}}>Desc. % cliente</label><input type="number" value={form.descPct} onChange={e=>aplicarDescPct(e.target.value)} placeholder="ej 15" style={{...inpV2, textAlign:'right', borderColor:T.warn}}/></div>
        </div>

        {/* Horario fácil + ubicación */}
        <div style={{display:'flex', gap:18, flexWrap:'wrap', alignItems:'flex-end', marginBottom:12}}>
          <div><label style={lblV2}>Horario del evento</label>
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <input type="time" value={form.horaIni} onChange={e=>upd('horaIni',e.target.value)} style={{...inpV2, width:'auto'}}/>
              <span style={{fontSize:13, color:T.ink3}}>a</span>
              <input type="time" value={form.horaFin} onChange={e=>upd('horaFin',e.target.value)} style={{...inpV2, width:'auto'}}/>
            </div>
          </div>
          <div style={{flex:1, minWidth:200}}><label style={lblV2}>Ubicación</label><input value={form.ubicacion} onChange={e=>upd('ubicacion',e.target.value)} placeholder="Dirección del evento" style={inpV2}/></div>
        </div>
        <div style={{fontSize:11.5, color:T.ink3, marginBottom:10}}>El contacto del lugar queda igual al Contacto; si es otro, se cambia en el Calendar.</div>
        <label style={lblV2}>Observaciones (salen en el PDF)</label>
        <textarea value={form.observaciones} onChange={e=>upd('observaciones',e.target.value)} rows={2} style={{...inpV2, resize:'vertical'}}/>
      </div>

      {/* Resumen + guardar (sticky bottom) */}
      <div style={{position:'sticky', bottom:0, background:T.surfaceAlt, borderTop:`1px solid ${T.border}`, borderRadius:'0 0 16px 16px', padding:'14px 24px'}}>
        <div style={{display:'flex', gap:20, flexWrap:'wrap', alignItems:'center', marginBottom:12}}>
          <Mini label="Subtotal" val={fmt(subtotal)}/>
          {fee>0&&<Mini label="Fee Magma" val={fmt(fee)} color={T.pos}/>}
          {form.gan&&<Mini label="Ganancias 35%" val={fmt(gan)}/>}
          {form.iibb&&<Mini label="IIBB 4%" val={fmt(iibb)}/>}
          {!!intMto&&<Mini label="Interés" val={fmt(intMto)}/>}
          {!!ajMto&&<Mini label="Ajuste" val={fmtS(ajMto)} color={ajMto<0?T.brand:T.ink}/>}
          <div style={{flex:1}}/>
          <div style={{textAlign:'right'}}><div style={{fontSize:10.5, textTransform:'uppercase', letterSpacing:0.4, color:T.ink3, fontWeight:600}}>Precio final</div><div style={{fontSize:26, fontWeight:700, fontFamily:MONO, color:T.brand}}>{fmt(total)}</div></div>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:14}}>
          <span style={{fontSize:12, color:semaforo(margenBasePct).c, fontWeight:600}}>Margen {Math.round(margenBasePct)}% · {semaforo(margenBasePct).l}</span>
          {adicList.length>0 && <span style={{fontSize:11.5, color:T.ink3}}>+ {fmt(adicCalc.reduce((s,a)=>s+a.precioCliente,0))} en adicionales</span>}
          <div style={{flex:1}}/>
          {falta.length>0 && <span style={{fontSize:12, color:T.warn}}>Falta: {falta.join(', ')}</span>}
          <button onClick={onClose} style={{padding:'10px 18px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:500, cursor:'pointer'}}>Cancelar</button>
          <button onClick={guardar} disabled={!puedeGuardar} style={{padding:'10px 24px', borderRadius:9, border:'none', background:puedeGuardar?T.brand:T.ink3, color:'#fff', fontSize:13.5, fontWeight:600, cursor:puedeGuardar?'pointer':'default'}}>{saving?'Guardando…':(isRep?'Crear represupuesto':'Crear presupuesto')}</button>
        </div>
      </div>
    </div>
  </div>
}

// ============================ APROBAR CON ADICIONALES ============================
// Parsea los pedidos de un presupuesto (en orden) con sus flags adicional + precio cliente
function parsePedidosPresu(presu){
  const esAdicCSV = String(presu['Es Adicional']||'').split('|')
  const precioCliCSV = String(presu['Precio Cliente Manual']||'').split('|')
  const peds=[]; let k=0
  for(let i=1;i<=12;i++){ const svc=presu['Pedido '+i]||(i===1?presu['Pedido']:'')||''; const prc=parseMonto(presu['Precio '+i]||(i===1?presu['Precio']:'')); if(svc||prc>0){ peds.push({k, svc, costo:prc, esAdic:esAdicCSV[k]==='1', precioCliManual:parseMonto(precioCliCSV[k])}); k++ } }
  return peds
}
function presuTieneAdicionales(presu){ return String(presu?.['Es Adicional']||'').split('|').includes('1') }

function AprobarAdicionalesModal({presu, onClose, onConfirm, saving}){
  const peds=parsePedidosPresu(presu)
  const baseSubtotal=peds.filter(p=>!p.esAdic).reduce((s,p)=>s+p.costo,0)
  const total=parseMonto(presu['Precio Final'])
  const factor=baseSubtotal>0?total/baseSubtotal:1
  const adic=peds.filter(p=>p.esAdic).map(p=>({...p, cli:p.precioCliManual>0?p.precioCliManual:Math.round(p.costo*factor)}))
  const [tom,setTom]=useState({})
  const tomados=adic.filter(a=>tom[a.k])
  const sumaTom=tomados.reduce((s,a)=>s+a.cli,0)
  const totalFinal=total+sumaTom
  function confirmar(){
    const nuevoEsAdic=peds.map(p=> (p.esAdic && tom[p.k]) ? '0' : (p.esAdic?'1':'0')).join('|')
    onConfirm({ nuevoEsAdic, nuevoTotal:totalFinal })
  }
  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:920, display:'flex', justifyContent:'center', alignItems:'flex-start', padding:'60px 20px', overflowY:'auto'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:460, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)'}}>
      <div style={{padding:'18px 22px', borderBottom:`1px solid ${T.border}`}}>
        <div style={{fontSize:16, fontWeight:700, color:T.ink}}>Aprobar #{presu['Columna 1']}</div>
        <div style={{fontSize:12, color:T.ink3, marginTop:2}}>{presu['Proyecto']||presu['Cliente']||''}</div>
      </div>
      <div style={{padding:'18px 22px'}}>
        <div style={{fontSize:13, color:T.ink2, marginBottom:12}}>¿El cliente tomó algún adicional? Tildá los que aceptó — se suman al total y al proyecto.</div>
        {adic.map(a=>(
          <label key={a.k} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 12px', border:`1px solid ${tom[a.k]?T.brand:T.border}`, borderRadius:10, marginBottom:8, cursor:'pointer'}}>
            <input type="checkbox" checked={!!tom[a.k]} onChange={e=>setTom(t=>({...t,[a.k]:e.target.checked}))}/>
            <span style={{flex:1, fontSize:13, color:T.ink}}>{a.svc}</span>
            <span style={{fontSize:13, fontFamily:MONO, color:T.ink}}>{fmt(a.cli)}</span>
          </label>
        ))}
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:14, paddingTop:12, borderTop:`1px solid ${T.border}`}}>
          <span style={{fontSize:12.5, color:T.ink2}}>Total a aprobar</span>
          <span style={{fontSize:20, fontWeight:700, fontFamily:MONO, color:T.pos}}>{fmt(totalFinal)}</span>
        </div>
        {sumaTom>0 && <div style={{fontSize:11.5, color:T.ink3, textAlign:'right', marginTop:2}}>base {fmt(total)} + adicionales {fmt(sumaTom)}</div>}
      </div>
      <div style={{padding:'14px 22px', borderTop:`1px solid ${T.border}`, display:'flex', gap:10, justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{padding:'9px 18px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:500, cursor:'pointer'}}>Cancelar</button>
        <button onClick={confirmar} disabled={saving} style={{padding:'9px 22px', borderRadius:9, border:'none', background:T.pos, color:'#fff', fontSize:13.5, fontWeight:600, cursor:saving?'default':'pointer', opacity:saving?0.6:1}}>{saving?'Aprobando…':'Aprobar'}</button>
      </div>
    </div>
  </div>
}

// Confirmación para eliminar un presupuesto cargado por error.
// El backend bloquea si ya tiene proyecto o factura, y deja backup de la fila en LOG.
function EliminarPresupuestoModal({presu, onClose, onConfirm, saving}){
  const id=presu['Columna 1']
  const total=parseMonto(presu['Precio Final'])
  const datos=[['Agencia',presu['Agencia']],['Cliente',presu['Cliente']],['Proyecto',presu['Proyecto']],
    ['Fecha evento',presu['Fecha Evento']],['Contacto',presu['Contacto']],['PM',presu['PM Interno']],
    ['Estado',presu['Estado']]].filter(x=>x[1])
  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:920, display:'flex', justifyContent:'center', alignItems:'flex-start', padding:'60px 20px', overflowY:'auto'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:460, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)'}}>
      <div style={{padding:'18px 22px', borderBottom:`1px solid ${T.border}`}}>
        <div style={{fontSize:16, fontWeight:700, color:T.ink}}>Eliminar presupuesto #{id}</div>
        <div style={{fontSize:12, color:T.ink3, marginTop:2}}>Se borra del sheet. Esto no se puede deshacer desde la app.</div>
      </div>
      <div style={{padding:'18px 22px'}}>
        <div style={{border:`1px solid ${T.border}`, borderRadius:10, overflow:'hidden'}}>
          {datos.map(([k,v],i)=>(
            <div key={k} style={{display:'flex', justifyContent:'space-between', gap:14, padding:'8px 13px', borderTop:i===0?'none':`1px solid ${T.border}`}}>
              <span style={{fontSize:11.5, color:T.ink3}}>{k}</span>
              <span style={{fontSize:12.5, color:T.ink, textAlign:'right'}}>{v}</span>
            </div>
          ))}
          <div style={{display:'flex', justifyContent:'space-between', padding:'9px 13px', borderTop:`1px solid ${T.border}`, background:T.surfaceAlt}}>
            <span style={{fontSize:12.5, fontWeight:600, color:T.ink}}>Precio final</span>
            <span style={{fontSize:14, fontWeight:700, fontFamily:MONO, color:T.ink}}>{fmt(total)}</span>
          </div>
        </div>
        <div style={{fontSize:11.5, color:T.ink3, marginTop:11, lineHeight:1.5}}>
          Queda una copia guardada en la solapa LOG por si hay que recuperarlo.<br/>
          Si el presupuesto ya tiene proyecto o factura cargada, no se va a poder eliminar.
        </div>
      </div>
      <div style={{padding:'14px 22px', borderTop:`1px solid ${T.border}`, display:'flex', gap:10, justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{padding:'9px 18px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:500, cursor:'pointer'}}>Cancelar</button>
        <button onClick={onConfirm} disabled={saving} style={{padding:'9px 22px', borderRadius:9, border:'none', background:T.brand, color:'#fff', fontSize:13.5, fontWeight:600, cursor:saving?'default':'pointer', opacity:saving?0.6:1}}>{saving?'Eliminando…':'Sí, eliminar'}</button>
      </div>
    </div>
  </div>
}

// ============================ CALENDARIO ============================
function fechasDelEvento(fechaPrincipal, tipoFechas, fechasAdicionales){
  const out=[]; const f0=parseD(fechaPrincipal); if(!f0) return out
  const tipo=String(tipoFechas||'').toLowerCase().trim(), ad=String(fechasAdicionales||'').trim()
  if(tipo==='rango'&&ad){ const f1=parseD(ad); if(!f1){out.push(f0);return out} let d=new Date(f0); while(d.getTime()<=f1.getTime()){out.push(new Date(d));d.setDate(d.getDate()+1)} }
  else if(tipo==='multi'&&ad){ out.push(f0); ad.split('|').filter(Boolean).forEach(s=>{const f=parseD(s);if(f)out.push(f)}) }
  else out.push(f0)
  return out
}
const dayKey = d => d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate()
const normTxt = s => String(s||'').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
// Una celda rota del sheet (#ERROR!, #N/A, #REF!...) no es un dato: se trata como vacía.
// Pasa cuando el valor arranca con "+" y Sheets lo interpreta como fórmula (ej: teléfonos +54 9 11...).
const ERR_SHEET = /^#(ERROR!|REF!|N\/A|VALUE!|NAME\?|DIV\/0!|NUM!|NULL!)/
const sinErr = v => { const s = String(v||'').trim(); return ERR_SHEET.test(s) ? '' : s }

function Calendario({data, onRefresh, showToast}){
  const proyectos=data.proyectos||[], presus=data.presupuestos||[], rrhh=data.rrhh||[]
  const now=new Date()
  const [ref,setRef]=useState({a:now.getFullYear(), m:now.getMonth()})
  const [diaSel,setDiaSel]=useState(null)
  const [staffModal,setStaffModal]=useState(null)   // {proy, presu}
  const [pendingStaff,setPendingStaff]=useState(null) // num: abrir staff apenas exista el proyecto (tras aprobar)
  const [editando,setEditando]=useState(null)       // presupuesto a editar (fecha/horario/ubicación/etc)
  const [aprobAdic,setAprobAdic]=useState(null), [aprobSaving,setAprobSaving]=useState(false)
  async function aprobarConAdic({nuevoEsAdic, nuevoTotal}){
    const p=aprobAdic; if(!p) return; const id=p['Columna 1']
    setAprobSaving(true)
    try{
      await fetch('/api/presupuesto-editar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, cambios:{'Es Adicional':nuevoEsAdic, 'Precio Final':Math.round(nuevoTotal), 'Total':Math.round(nuevoTotal)}})})
      const r=await fetch('/api/presupuesto-estado',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, estado:'APROBADO', noCalendar:true})})
      const j=await r.json(); if(j.error){ showToast(j.error,'err'); setAprobSaving(false); return }
      showToast(`#${id} aprobado`); setAprobAdic(null); setAprobSaving(false); setPendingStaff(id)
      if(onRefresh) onRefresh()
      fetch('/api/calendar-evento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, accion:'aprobar'})}).catch(()=>{})
    }catch(e){ showToast('Error de conexión','err'); setAprobSaving(false) }
  }
  const rrhhNames=[...new Set(rrhh.map(r=>r['Nombre Apellido']||r['Nombre']).filter(Boolean))].sort()
  const serviciosConocidos=[...new Set([...getSvcs(data).map(s=>s.n), ...(data.listado?.servicios||[])])].filter(Boolean).sort()

  const presusByNum={}; presus.forEach(p=>{presusByNum[String(p['Columna 1']||'').trim()]=p})
  const proyByNum={}; proyectos.forEach(p=>{proyByNum[String(p['N° presupuesto']||'').trim()]=p})
  // Abrir el cargador de staff apenas el proyecto exista (después de aprobar)
  useEffect(()=>{ if(pendingStaff){ const proy=proyByNum[String(pendingStaff).trim()]; if(proy){ setStaffModal({proy, presu:presusByNum[String(pendingStaff).trim()]}); setPendingStaff(null) } } /* eslint-disable-next-line */ },[data.proyectos, pendingStaff])
  const aprobadosPorDia={}, enEsperaPorDia={}
  proyectos.forEach(p=>{ const presu=presusByNum[String(p['N° presupuesto']||'').trim()]; fechasDelEvento(p['Fecha Evento'], presu?.['Tipo Fechas'], presu?.['Fechas Adicionales']).forEach(f=>{ const k=dayKey(f); (aprobadosPorDia[k]=aprobadosPorDia[k]||[]).push(p) }) })
  presus.forEach(p=>{ if(String(p['Estado']||'').toUpperCase()!=='EN ESPERA') return; fechasDelEvento(p['Fecha Evento'], p['Tipo Fechas'], p['Fechas Adicionales']).forEach(f=>{ const k=dayKey(f); (enEsperaPorDia[k]=enEsperaPorDia[k]||[]).push(p) }) })

  // grilla (lunes primero)
  const primDia=new Date(ref.a, ref.m, 1)
  const ultDia=new Date(ref.a, ref.m+1, 0).getDate()
  const offset=(primDia.getDay()+6)%7
  const celdas=[]; for(let i=0;i<offset;i++) celdas.push(null); for(let d=1;d<=ultDia;d++) celdas.push(new Date(ref.a, ref.m, d))
  while(celdas.length%7!==0) celdas.push(null)

  // KPIs del mes
  let totAprob=0,cntAprob=0,totEsp=0,cntEsp=0
  Object.keys(aprobadosPorDia).forEach(k=>{const [y,m]=k.split('-').map(Number); if(y===ref.a&&m===ref.m) aprobadosPorDia[k].forEach(p=>{totAprob+=parseMonto(p['Total ']||p['Total']||p['Precio Final']);cntAprob++})})
  Object.keys(enEsperaPorDia).forEach(k=>{const [y,m]=k.split('-').map(Number); if(y===ref.a&&m===ref.m) enEsperaPorDia[k].forEach(p=>{totEsp+=parseMonto(p['Precio Final']);cntEsp++})})

  const navMes=delta=>{ const d=new Date(ref.a, ref.m+delta, 1); setRef({a:d.getFullYear(),m:d.getMonth()}); setDiaSel(null) }
  const aprobSel = diaSel ? (aprobadosPorDia[dayKey(diaSel)]||[]) : []
  const espSel = diaSel ? (enEsperaPorDia[dayKey(diaSel)]||[]) : []

  async function setEstado(num, estado){
    if(estado!=='APROBADO' && !window.confirm(`¿Marcar #${num} como ${estadoInfo(estado).l}?`)) return
    try{ const r=await fetch('/api/presupuesto-estado',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num,estado,noCalendar:true})}); const j=await r.json(); if(j.error){showToast(j.error,'err');return} showToast(`#${num} → ${estadoInfo(estado).l}`); if(estado==='APROBADO') setPendingStaff(num); if(onRefresh) onRefresh()
      const accion = estado==='APROBADO'?'aprobar':(estado==='DESAPROBADO'||estado==='REPRESUPUESTADO')?'borrar':'pendiente'
      fetch('/api/calendar-evento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num, accion})}).catch(()=>{})
    }catch(e){showToast('Error de conexión','err')}
  }
  const staffDe=p=>{ const out=[]; for(let j=1;j<=20;j++){ const s=String(p['Staff '+j]||(j===1?p['Staff']:'')||'').trim(); const ped=p['Pedido '+j]||(j===1?p['Pedido']:'')||''; if(s) out.push({persona:s, pedido:ped}) } return out }
  const esHoy=d=>d&&dayKey(d)===dayKey(now)

  return <>
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:20}}>
      <div><h1 style={{fontSize:23, fontWeight:700, color:T.ink, margin:0, letterSpacing:-0.3}}>{MESES_LARGO[ref.m]} {ref.a}</h1>
        <div style={{fontSize:13, color:T.ink3, marginTop:3}}>{cntAprob} aprobados · {fmtM(totAprob)} &nbsp;·&nbsp; {cntEsp} en espera · {fmtM(totEsp)}</div></div>
      <div style={{display:'flex', gap:8}}>
        <button onClick={()=>navMes(-1)} style={navBtn}>←</button>
        <button onClick={()=>{setRef({a:now.getFullYear(),m:now.getMonth()});setDiaSel(null)}} style={{...navBtn, width:'auto', padding:'0 14px'}}>Hoy</button>
        <button onClick={()=>navMes(1)} style={navBtn}>→</button>
      </div>
    </div>
    <div style={{display:'flex', gap:16, alignItems:'flex-start'}}>
      <div style={{flex:1, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(7,1fr)'}}>
          {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d=><div key={d} style={{padding:'9px 0', textAlign:'center', fontSize:10.5, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3, borderBottom:`1px solid ${T.border}`}}>{d}</div>)}
          {celdas.map((d,i)=>{
            if(!d) return <div key={i} style={{minHeight:96, borderRight:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}`, background:T.bg}}/>
            const ap=aprobadosPorDia[dayKey(d)]||[], es=enEsperaPorDia[dayKey(d)]||[], total=ap.length+es.length
            const sel = diaSel&&dayKey(diaSel)===dayKey(d)
            return <div key={i} onClick={()=>setDiaSel(d)} style={{minHeight:96, padding:6, borderRight:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}`, cursor:'pointer', background:sel?T.surfaceAlt:T.surface}}>
              <div style={{fontSize:11.5, fontWeight:esHoy(d)?700:500, color:esHoy(d)?T.brand:T.ink3, marginBottom:4, display:'flex', justifyContent:'space-between'}}>
                <span style={esHoy(d)?{background:T.brand,color:'#fff',borderRadius:10,width:18,height:18,display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:10.5}:{}}>{d.getDate()}</span>
              </div>
              {ap.slice(0,3).map((p,j)=><div key={'a'+j} style={{fontSize:10.5, padding:'2px 5px', marginBottom:2, borderRadius:4, background:T.posSoft, borderLeft:`2px solid ${T.pos}`, color:T.ink, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{p['Cliente']||p['Agencia']||'—'}</div>)}
              {es.slice(0,Math.max(0,3-ap.length)).map((p,j)=><div key={'e'+j} style={{fontSize:10.5, padding:'2px 5px', marginBottom:2, borderRadius:4, background:T.warnSoft, borderLeft:`2px dashed ${T.warn}`, color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{p['Cliente']||p['Agencia']||'—'}</div>)}
              {total>3&&<div style={{fontSize:10, color:T.ink3, paddingLeft:5}}>+{total-3} más</div>}
            </div>
          })}
        </div>
      </div>

      {/* Panel del día */}
      <div style={{flex:'0 0 340px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', position:'sticky', top:0}}>
        {!diaSel ? <Empty>Clickeá un día para ver el detalle</Empty> : <>
          <CardHead>{diaSel.getDate()} de {MESES_LARGO[diaSel.getMonth()]}</CardHead>
          {aprobSel.length===0&&espSel.length===0 && <Empty>Sin eventos este día</Empty>}
          {aprobSel.map((p,i)=>{ const staff=staffDe(p); const num=p['N° presupuesto']
            return <div key={'a'+i} style={{padding:'12px 18px', borderTop:`1px solid ${T.border}`}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <span style={{fontSize:11, fontFamily:MONO, color:T.pos, fontWeight:600}}>● #{num}</span>
                <span style={{fontSize:13, fontFamily:MONO, color:T.ink, fontWeight:600}}>{fmt(parseMonto(p['Total ']||p['Total']))}</span>
              </div>
              <div style={{fontSize:13, color:T.ink, fontWeight:500, marginTop:4}}>{p['Proyecto']||'—'}</div>
              <div style={{fontSize:11.5, color:T.ink3}}>{[p['Agencia'],p['Cliente']].filter(Boolean).join(' · ')}</div>
              {(()=>{ const ev=presusByNum[String(num)]||{}; const extra=[ev['Horario'],ev['Ubicación']].filter(Boolean).join(' · '); return extra?<div style={{fontSize:11.5, color:T.ink2, marginTop:4}}>🕒 {extra}</div>:null })()}
              {staff.length===0
                ? <div style={{fontSize:11.5, color:T.warn, marginTop:6, fontWeight:500}}>⚠ Sin staff cargado todavía</div>
                : <div style={{fontSize:11.5, color:T.ink2, marginTop:6}}><span style={{color:T.ink3}}>Staff:</span> {staff.map(s=>s.persona).join(', ')}</div>}
              <div style={{display:'flex', gap:7, marginTop:9, flexWrap:'wrap'}}>
                <button onClick={()=>{ const proy=proyByNum[String(num).trim()]; if(proy) setStaffModal({proy, presu:presusByNum[String(num).trim()]}); else showToast('El proyecto aún no está disponible, actualizá','err') }} style={{...miniBtn, background:staff.length===0?T.brand:T.surface, color:staff.length===0?'#fff':T.ink2, border:staff.length===0?'none':`1px solid ${T.border}`}}>{staff.length===0?'Cargar staff':'Editar staff'}</button>
                {presusByNum[String(num).trim()] && <button onClick={()=>setEditando(presusByNum[String(num).trim()])} style={miniBtn}>Editar datos</button>}
                <a href={`/presupuesto?nro=${encodeURIComponent(num)}`} target="_blank" rel="noreferrer" style={miniBtn}>PDF</a>
                <button onClick={()=>setEstado(num,'DESAPROBADO')} style={miniBtn}>Desaprobar</button>
              </div>
            </div>
          })}
          {espSel.map((p,i)=>{ const num=p['Columna 1']
            return <div key={'e'+i} style={{padding:'12px 18px', borderTop:`1px solid ${T.border}`}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <span style={{fontSize:11, fontFamily:MONO, color:T.warn, fontWeight:600}}>○ #{num}</span>
                <span style={{fontSize:13, fontFamily:MONO, color:T.ink, fontWeight:600}}>{fmt(parseMonto(p['Precio Final']))}</span>
              </div>
              <div style={{fontSize:13, color:T.ink, fontWeight:500, marginTop:4}}>{p['Proyecto']||'—'}</div>
              <div style={{fontSize:11.5, color:T.ink3}}>{[p['Agencia'],p['Cliente']].filter(Boolean).join(' · ')}</div>
              <div style={{display:'flex', gap:7, marginTop:9, flexWrap:'wrap'}}>
                <button onClick={()=> presuTieneAdicionales(p) ? setAprobAdic(p) : setEstado(num,'APROBADO')} style={{...miniBtn, background:T.pos, color:'#fff', border:'none'}}>✓ Aprobar</button>
                <button onClick={()=>setEditando(p)} style={miniBtn}>Editar datos</button>
                <a href={`/presupuesto?nro=${encodeURIComponent(num)}`} target="_blank" rel="noreferrer" style={miniBtn}>PDF</a>
                <button onClick={()=>setEstado(num,'DESAPROBADO')} style={miniBtn}>Desaprobar</button>
              </div>
            </div>
          })}
        </>}
      </div>
    </div>
    {staffModal && <div onClick={()=>setStaffModal(null)} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:900, display:'flex', justifyContent:'center', overflowY:'auto', padding:'40px 20px'}}>
      <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:680, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)', height:'fit-content', overflow:'hidden'}}>
        <div style={{padding:'16px 22px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div style={{fontSize:16, fontWeight:700, color:T.ink}}>Cargar staff · #{staffModal.proy['N° presupuesto']}</div>
          <button onClick={()=>setStaffModal(null)} style={{border:'none', background:'transparent', fontSize:22, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
        </div>
        <StaffEditor p={staffModal.proy} num={staffModal.proy['N° presupuesto']} rrhhNames={rrhhNames} rrhh={rrhh} serviciosConocidos={serviciosConocidos} presu={staffModal.presu} onRefresh={onRefresh} showToast={showToast} onClose={()=>setStaffModal(null)}/>
      </div>
    </div>}
    {editando && <EditarModal p={editando} data={data} onClose={()=>setEditando(null)} showToast={showToast} onSaved={()=>{ setEditando(null); if(onRefresh) onRefresh() }}/>}
    {aprobAdic && <AprobarAdicionalesModal presu={aprobAdic} saving={aprobSaving} onClose={()=>setAprobAdic(null)} onConfirm={aprobarConAdic}/>}
  </>
}

// ============================ PROYECTOS ============================
function Proyectos({data, onRefresh, showToast, nav, clearNav}){
  const proyectos=data.proyectos||[]
  const rrhh=data.rrhh||[]
  const rrhhNames=[...new Set(rrhh.map(r=>r['Nombre Apellido']||r['Nombre']).filter(Boolean))].sort()
  const serviciosConocidos=[...new Set([...getSvcs(data).map(s=>s.n), ...(data.listado?.servicios||[])])].filter(Boolean).sort()
  const presuByNum={}; (data.presupuestos||[]).forEach(p=>{presuByNum[String(p['Columna 1']||'').trim()]=p})
  const [q,setQ]=useState(''), [estado,setEstado]=useState('todos'), [anio,setAnio]=useState('todos'), [mes,setMes]=useState('todos'), [open,setOpen]=useState(null), [editando,setEditando]=useState(null)
  useEffect(()=>{ if(nav?.mod==='proyectos'){ if(nav.filtro)setEstado(nav.filtro); if(nav.q){setQ(nav.q); setEstado('todos')} clearNav&&clearNav() } /* eslint-disable-next-line */ },[nav])
  const anios=[...new Set(proyectos.map(p=>(p['Fecha Evento']||'').split('/')[2]).filter(Boolean))].sort().reverse()

  const tieneStaff=p=>p['Carga Staff']===true||String(p['Carga Staff']||'').toUpperCase()==='TRUE'
  const facByNum={}; (data.facturacion||[]).forEach(f=>{ const n=String(f['N° Presupuesto']||'').trim(); if(n && !String(f['Nro de Factura']||'').toUpperCase().startsWith('ANULADA')) facByNum[n]=f })
  const facDe=p=>facByNum[String(p['N° presupuesto']||'').trim()]
  const filtrados=proyectos.filter(p=>{
    const fecha=p['Fecha Evento']||''
    const mMes=mes==='todos'||parseInt(fecha.split('/')[1])===parseInt(mes)
    const mAnio=anio==='todos'||fecha.includes(anio)
    const mEst=estado==='todos'||(estado==='ok'&&tieneStaff(p))||(estado==='pendiente'&&!tieneStaff(p))||(estado==='sinfact'&&!facDe(p))
    const mq=!q||[p['N° presupuesto'],p['Proyecto'],p['Cliente'],p['Agencia']].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase()))
    return mMes&&mAnio&&mEst&&mq
  }).sort((a,b)=>{ const fa=parseD(a['Fecha Evento'])?.getTime()||0, fb=parseD(b['Fecha Evento'])?.getTime()||0; const hoy=Date.now()-864e5; const faF=fa>=hoy,fbF=fb>=hoy; if(faF&&!fbF)return -1; if(!faF&&fbF)return 1; if(faF&&fbF)return fa-fb; return fb-fa })

  const pendientes=proyectos.filter(p=>!tieneStaff(p)).length
  const sinFacturar=proyectos.filter(p=>!facDe(p)).length

  return <>
    <PageHead title="Proyectos" sub={`${filtrados.length} de ${proyectos.length}${pendientes?` · ${pendientes} sin staff`:''}${sinFacturar?` · ${sinFacturar} sin facturar`:''}`}/>
    <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', marginBottom:14}}>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar N°, proyecto, cliente, agencia…" style={{flex:'1 1 240px', minWidth:190, padding:'9px 13px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13, outline:'none'}}/>
      <select value={anio} onChange={e=>setAnio(e.target.value)} style={selectStyle}><option value="todos">Año</option>{anios.map(a=><option key={a} value={a}>{a}</option>)}</select>
      <select value={mes} onChange={e=>setMes(e.target.value)} style={selectStyle}><option value="todos">Mes</option>{MESES_LARGO.map((m,i)=><option key={i} value={i+1}>{m}</option>)}</select>
    </div>
    <div style={{display:'flex', gap:7, marginBottom:14}}>
      {[['todos','Todos'],['pendiente','Sin staff'],['ok','Con staff'],['sinfact','Sin facturar']].map(([k,l])=>(
        <button key={k} onClick={()=>setEstado(k)} style={{padding:'6px 13px', borderRadius:20, fontSize:12, fontWeight:500, cursor:'pointer', border:`1px solid ${estado===k?T.ink:T.border}`, background:estado===k?T.ink:T.surface, color:estado===k?'#fff':T.ink2}}>{l}</button>
      ))}
    </div>
    <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
      <div style={{display:'grid', gridTemplateColumns:'88px 1.5fr 1fr 100px 78px 96px', padding:'11px 18px', borderBottom:`1px solid ${T.border}`, fontSize:10.5, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3}}>
        <span>Evento</span><span>Proyecto</span><span>Cliente</span><span style={{textAlign:'right'}}>Total</span><span style={{textAlign:'right'}}>Staff</span><span style={{textAlign:'right'}}>Factura</span>
      </div>
      {filtrados.length===0&&<Empty>Sin resultados</Empty>}
      {filtrados.slice(0,200).map((p,i)=>{
        const num=p['N° presupuesto'], abierto=open===num, ok=tieneStaff(p)
        const fac=facDe(p), cobrada=fac&&isCobrada(fac)
        const facInfo = cobrada?{c:T.pos,l:'Cobrada'}:fac?{c:T.warn,l:'Facturada'}:{c:T.brand,l:'Sin fact.'}
        return <div key={num+'_'+i}>
          <div onClick={()=>setOpen(abierto?null:num)} style={{display:'grid', gridTemplateColumns:'88px 1.5fr 1fr 100px 78px 96px', padding:'12px 18px', borderTop:i===0?'none':`1px solid ${T.border}`, cursor:'pointer', alignItems:'center', background:abierto?T.surfaceAlt:'transparent', fontSize:13}}
            onMouseEnter={e=>{if(!abierto)e.currentTarget.style.background=T.surfaceAlt}} onMouseLeave={e=>{if(!abierto)e.currentTarget.style.background='transparent'}}>
            <span style={{fontSize:12, color:T.ink2}}>{p['Fecha Evento']||'—'}</span>
            <span style={{color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:10}}>{p['Proyecto']||'—'}</span>
            <span style={{color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:10}}>{p['Cliente']||'—'}</span>
            <span style={{textAlign:'right', fontFamily:MONO, fontSize:12.5, color:T.ink}}>{fmt(parseMonto(p['Total ']||p['Total']))}</span>
            <span style={{display:'flex', alignItems:'center', justifyContent:'flex-end', gap:5}}>
              <span style={{width:7,height:7,borderRadius:7,background:ok?T.pos:T.warn}}/>
              <span style={{fontSize:11.5, color:T.ink2}}>{ok?'OK':'Pend.'}</span>
            </span>
            <span style={{display:'flex', alignItems:'center', justifyContent:'flex-end', gap:5}}>
              <span style={{width:7,height:7,borderRadius:7,background:facInfo.c}}/>
              <span style={{fontSize:11.5, color:T.ink2}}>{facInfo.l}</span>
            </span>
          </div>
          {abierto && <StaffEditor p={p} num={num} rrhhNames={rrhhNames} rrhh={rrhh} serviciosConocidos={serviciosConocidos} presu={presuByNum[String(num).trim()]} onRefresh={onRefresh} showToast={showToast} onClose={()=>setOpen(null)} onEditarDatos={()=>setEditando(presuByNum[String(num).trim()]||p)}/>}
        </div>
      })}
    </div>
    {editando && <EditarModal p={editando} data={data} onClose={()=>setEditando(null)} showToast={showToast} onSaved={()=>{ setEditando(null); if(onRefresh) onRefresh() }}/>}
  </>
}

function StaffEditor({p, num, rrhhNames, rrhh=[], serviciosConocidos=[], presu, onRefresh, showToast, onClose, onEditarDatos}){
  // svcKey (no lowercase pelado): en el sheet los servicios vienen con emoji y "½"
  // ("🎥 Video ½") pero acá se guardan sin emoji y con "1/2". Comparados crudos nunca
  // matcheaban y TODO servicio ya existente salía marcado como "+ servicio nuevo".
  const svcSet=new Set(serviciosConocidos.map(svcKey))
  const esSvcNuevo=v=>v && !svcSet.has(svcKey(v))
  const rrhhMap={}; rrhh.forEach(r=>{ const n=normTxt(r['Nombre Apellido']||r['Nombre']); if(n) rrhhMap[n]=r })
  const esFreelancerNuevo=v=>{ const n=normTxt(v); return n && n!=='somos magma' && !rrhhMap[n] }
  const [freel,setFreel]=useState(null)  // nombre del freelancer a completar
  const total=parseMonto(p['Total ']||p['Total'])
  const init=()=>{ const arr=[]; for(let j=1;j<=20;j++){ const ped=p['Pedido '+j]||(j===1?p['Pedido']:'')||''; const quien=String(p['Staff '+j]||(j===1?p['Staff']:'')||'').trim(); const precio=parseMonto(p['Precio '+j]||(j===1?p['Precio']:'')); if(ped||quien||precio>0) arr.push({pedido:ped, quien, precio}) } return arr.length?arr:[{pedido:'',quien:'',precio:0}] }
  const [items,setItems]=useState(init)
  const [saving,setSaving]=useState(false)
  // Horario + ubicación (van al Calendar). Se editan acá cuando hay presu.
  const hOrig=parseHorarioStr(presu?.['Horario'])
  const [horaIni,setHoraIni]=useState(hOrig.h1), [horaFin,setHoraFin]=useState(hOrig.h2), [ubicacion,setUbicacion]=useState(presu?.['Ubicación']||'')
  const upd=(i,campo,val)=>setItems(it=>it.map((x,j)=>j===i?{...x,[campo]:val}:x))
  const addRow=()=>setItems(it=>[...it,{pedido:'',quien:'',precio:0}])
  const delRow=i=>setItems(it=>it.length>1?it.filter((_,j)=>j!==i):[{pedido:'',quien:'',precio:0}])

  let fl=0,mg=0; items.forEach(s=>{ if(!s.quien)return; const v=Number(s.precio)||0; if(s.quien==='Somos Magma')mg+=v; else fl+=v })
  const fee=total-fl-mg
  const sinAsignar=items.filter(s=>s.pedido&&!s.quien).length

  async function guardar(){
    setSaving(true)
    try{
      // 1. Horario/ubicación → al presupuesto (el Calendar los lee de ahí)
      if(presu){
        const horario=(horaIni&&horaFin)?`${horaIni} a ${horaFin} hs`:''
        const cambios={}
        if(horario!==(presu['Horario']||'')) cambios['Horario']=horario
        if(ubicacion!==(presu['Ubicación']||'')) cambios['Ubicación']=ubicacion
        if(Object.keys(cambios).length) await fetch('/api/presupuesto-editar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num, cambios})})
      }
      // 2. Staff → PROYECTOS
      const r=await fetch('/api/proyecto-staff',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num, staffData:items.filter(s=>s.pedido||s.quien).map(s=>({nombre:s.quien, monto:Number(s.precio)||0, pedido:s.pedido}))})})
      const j=await r.json(); if(j&&j.error){showToast(j.error,'err');setSaving(false);return}
      // Listo el guardado → liberamos el botón y cerramos enseguida
      showToast(`#${num} · staff guardado`)
      setSaving(false)
      if(onRefresh) onRefresh()
      if(onClose) onClose()
      // 3. Resync Calendar en segundo plano (Google es lento, no bloqueamos)
      if(presu){ fetch('/api/calendar-evento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num, accion:'aprobar'})}).then(r=>r.json()).then(j=>{ if(j&&j.staffSinMail&&j.staffSinMail.length) showToast('Sin mail (no se pudo invitar): '+j.staffSinMail.join(', '),'err') }).catch(()=>{}) }
    }catch(e){ showToast('Error de conexión','err'); setSaving(false) }
  }

  return <div style={{padding:'14px 18px 18px', background:T.surfaceAlt, borderTop:`1px solid ${T.border}`}}>
    <div style={{display:'flex', gap:20, flexWrap:'wrap', alignItems:'flex-start', paddingBottom:12, marginBottom:10, borderBottom:`1px solid ${T.border}`}}>
      {[['N°',num],['Agencia',p['Agencia']],['Cliente',p['Cliente']],['Evento',p['Fecha Evento']]].filter(x=>x[1]).map(([k,v])=>(
        <div key={k}><div style={{fontSize:10, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, fontWeight:600}}>{k}</div><div style={{fontSize:13, color:T.ink, marginTop:2}}>{v}</div></div>
      ))}
      <div style={{flex:1}}/>
      {onEditarDatos && <button onClick={onEditarDatos} style={{...miniBtn, alignSelf:'center'}}>Editar datos (fecha, etc)</button>}
    </div>
    {presu && <div style={{display:'flex', gap:18, flexWrap:'wrap', alignItems:'flex-end', paddingBottom:12, marginBottom:10, borderBottom:`1px solid ${T.border}`}}>
      <div><label style={lblV2}>Horario (va al Calendar)</label>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <input type="time" value={horaIni} onChange={e=>setHoraIni(e.target.value)} style={{...inpV2, width:'auto'}}/>
          <span style={{fontSize:13, color:T.ink3}}>a</span>
          <input type="time" value={horaFin} onChange={e=>setHoraFin(e.target.value)} style={{...inpV2, width:'auto'}}/>
        </div>
      </div>
      <div style={{flex:1, minWidth:200}}><label style={lblV2}>Ubicación</label><input value={ubicacion} onChange={e=>setUbicacion(e.target.value)} placeholder="Dirección del evento" style={inpV2}/></div>
    </div>}
    <div style={{display:'grid', gridTemplateColumns:'1.3fr 1.4fr 110px 28px', gap:10, fontSize:10.5, fontWeight:600, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, padding:'0 2px 8px'}}>
      <span>Servicio</span><span>Quién lo hace</span><span style={{textAlign:'right'}}>Monto</span><span/>
    </div>
    {items.map((s,i)=>(
      <div key={i} style={{display:'grid', gridTemplateColumns:'1.3fr 1.4fr 110px 28px', gap:10, marginBottom:8, alignItems:'start'}}>
        <div>
          <input list="v2-svcs" value={s.pedido} onChange={e=>upd(i,'pedido',e.target.value)} placeholder="Servicio" style={inpV2}/>
          {esSvcNuevo(s.pedido) && <span style={{fontSize:10, color:T.warn, fontWeight:600, display:'block', marginTop:3}}>+ servicio nuevo</span>}
        </div>
        <div>
          <input list="v2-rrhh" value={s.quien} onChange={e=>upd(i,'quien',e.target.value)} placeholder="Freelancer o Somos Magma" style={{...inpV2, borderColor:s.pedido&&!s.quien?T.warn:(esFreelancerNuevo(s.quien)?T.warn:T.border)}}/>
          {esFreelancerNuevo(s.quien) && <span style={{fontSize:10, color:T.warn, fontWeight:600, display:'block', marginTop:3}}>persona nueva · <button onClick={()=>setFreel(s.quien.trim())} style={{border:'none',background:'transparent',color:T.brand,fontWeight:600,cursor:'pointer',fontSize:10,padding:0,textDecoration:'underline'}}>completar datos</button></span>}
        </div>
        <input type="number" value={s.precio||''} onChange={e=>upd(i,'precio',e.target.value)} placeholder="0" style={{...inpV2, textAlign:'right', fontFamily:MONO}}/>
        <button onClick={()=>delRow(i)} title="Quitar línea" style={{border:'none', background:'transparent', color:T.ink3, cursor:'pointer', fontSize:17, padding:0, alignSelf:'center'}}>×</button>
      </div>
    ))}
    {/* "Somos Magma" salía dos veces: estaba hardcodeado acá Y cargado en RRHH (fila 36).
        Ahora se dedupe por nombre normalizado — sirve igual para los repetidos del sheet. */}
    <datalist id="v2-rrhh">{[...new Map([['somos magma','Somos Magma'], ...rrhhNames.map(n=>[normTxt(n),n])]).values()].map(n=><option key={n} value={n}/>)}</datalist>
    <datalist id="v2-svcs">{serviciosConocidos.map(n=><option key={n} value={n}/>)}</datalist>
    <button onClick={addRow} style={{fontSize:12, color:T.ink2, background:'transparent', border:'none', cursor:'pointer', padding:'4px 0', marginTop:2}}>+ Agregar línea</button>

    {(()=>{ const ganancia=fee+mg; const margenPct=total>0?Math.round((ganancia/total)*100):0; const sem=semaforo(margenPct); return (
    <div style={{display:'flex', gap:24, marginTop:14, paddingTop:14, borderTop:`1px solid ${T.border}`, flexWrap:'wrap', alignItems:'center'}}>
      <Mini label="Presupuestado" val={fmt(total)}/>
      <Mini label="Freelance" val={fmt(fl)}/>
      <Mini label="Somos Magma" val={fmt(mg)} color={T.pos}/>
      <Mini label="Fee Magma" val={fmt(fee)} color={fee<0?T.brand:T.ink}/>
      <Mini label="Ganancia Magma" val={fmt(ganancia)} color={T.pos}/>
      <div><div style={{fontSize:10, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, fontWeight:600}}>Margen</div><div style={{fontSize:14, fontFamily:MONO, color:sem.c, marginTop:2}}>{margenPct}% · {sem.l}</div><div style={{fontSize:9, color:T.ink3, marginTop:1}}>fee + Somos Magma</div></div>
      <div style={{flex:1}}/>
      {sinAsignar>0&&<span style={{fontSize:12, color:T.warn, fontWeight:500}}>{sinAsignar} sin asignar</span>}
      <button onClick={guardar} disabled={saving} style={{padding:'9px 20px', borderRadius:9, border:'none', background:T.brand, color:'#fff', fontSize:13, fontWeight:600, cursor:saving?'default':'pointer', opacity:saving?0.6:1}}>{saving?'Guardando…':'Guardar staff'}</button>
    </div> )})()}
    {freel && <FreelancerModal nombre={freel} datos={{}} rubrosConocidos={[...new Set(rrhh.flatMap(r=>String(r['Rubro']||'').split(',').map(s=>s.trim())))].filter(Boolean)} onClose={()=>setFreel(null)} onSaved={()=>{ setFreel(null); if(onRefresh) onRefresh() }} showToast={showToast}/>}
  </div>
}
function Mini({label,val,color}){ return <div><div style={{fontSize:10, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, fontWeight:600}}>{label}</div><div style={{fontSize:14, fontFamily:MONO, color:color||T.ink, marginTop:2}}>{val}</div></div> }

// ============================ FACTURACIÓN ============================
// Una factura es REAL si tiene número de factura o fecha de emisión. Si no tiene ninguno,
// es un registro fantasma (proyecto migrado del sheet, nunca facturado de verdad).
const esFacturaReal = f => !!(String(f['Nro de Factura']||'').trim() || String(f['Fecha emision']||'').trim())

// Semáforo de fecha de evento para "sin facturar": futuro (no se puede aún), recién pasó (verde),
// pasó hace rato sin facturar (ámbar→rojo). Escala para priorizar lo más atrasado.
function semEvento(fechaEvento){
  const fe=parseD(fechaEvento)
  if(!fe) return {c:T.ink3, l:'sin fecha', fecha:'s/f', dias:-99999, futuro:false}
  const d=Math.floor((new Date()-fe)/864e5)
  const fecha=`${fe.getDate()}/${fe.getMonth()+1}`
  if(d<0)  return {c:T.ink3, l:`evento en ${-d}d (futuro)`, fecha, dias:d, futuro:true}
  if(d===0)return {c:T.pos,  l:'el evento es hoy', fecha, dias:d, futuro:false}
  if(d<=15)return {c:T.pos,  l:'listo para facturar', fecha, dias:d, futuro:false}
  if(d<=30)return {c:T.warn, l:`facturá pronto · ${d}d`, fecha, dias:d, futuro:false}
  return     {c:T.brand,l:`atrasado ${d}d`, fecha, dias:d, futuro:false}
}

function Facturacion({data, onRefresh, showToast, nav, clearNav, goTo}){
  const fc=data.facturacion||[], cuentas=data.cuentas||[]
  const fcReal=fc.filter(esFacturaReal)  // cobranza solo sobre facturas reales (con número/emisión)
  const hoy=new Date()
  const presus=data.presupuestos||[]
  // Fecha del evento por N° de presupuesto (las facturas reales a veces no la tienen en su fila)
  const eventoByNum={}; ;[...(data.proyectos||[]),...presus].forEach(p=>{ const n=String(p['N° presupuesto']||p['Columna 1']||'').trim(); const fe=p['Fecha Evento']; if(n&&fe&&!eventoByNum[n]) eventoByNum[n]=fe })
  const evDe=f=>f['Fecha Evento']||eventoByNum[String(f['N° Presupuesto']||'').trim()]||''
  const [q,setQ]=useState(''), [filt,setFilt]=useState('todas'), [mesF,setMesF]=useState('todos'), [cobrando,setCobrando]=useState(null), [nuevaF,setNuevaF]=useState(false), [nuevaFsel,setNuevaFsel]=useState(null), [yaModal,setYaModal]=useState(null), [mailFactura,setMailFactura]=useState(null), [editarFechas,setEditarFechas]=useState(null), [reclamo,setReclamo]=useState(null)

  // Quién debe plata, agrupado — para reclamar de una todo lo de un mismo cliente
  const agenciasPendientes=(()=>{
    const m={}
    ;(data.facturacion||[]).forEach(f=>{
      if(isCobrada(f)) return
      const monto=parseMonto(f['Precio FINAL']); if(monto<=0) return
      const k=String(f['Agencia']||f['Cliente']||'').trim(); if(!k) return
      m[k]=m[k]||{nombre:k,n:0,monto:0}; m[k].n++; m[k].monto+=monto
    })
    return Object.values(m).sort((a,b)=>b.monto-a.monto)
  })()
  const matchMes=fechaStr=>{ if(mesF==='todos')return true; const d=parseD(fechaStr); return d?`${d.getMonth()+1}-${d.getFullYear()}`===mesF:false }
  useEffect(()=>{ if(nav?.mod==='facturacion'){ if(nav.filtro)setFilt(['atrasadas','pendiente'].includes(nav.filtro)?'porcobrar':nav.filtro); if(nav.q){setQ(nav.q); setFilt('todas')} clearNav&&clearNav() } /* eslint-disable-next-line */ },[nav])

  // presupuestos aprobados con saldo pendiente de facturar
  const pendTodos=presus.filter(isAprobado).map(p=>{
    const facturado=fc.filter(f=>esFacturaReal(f) && String(f['N° Presupuesto']||'').trim()===String(p['Columna 1']||'').trim() && !String(f['Nro de Factura']||'').toUpperCase().startsWith('ANULADA')).reduce((s,f)=>s+(parseMonto(f['Precio SIN IVA'])||parseMonto(f['Precio FINAL'])),0)
    const neto=parseMonto(p['Precio Final'])
    return {p, facturado, neto, pendiente:Math.max(0,neto-facturado)}
  }).filter(x=>x.neto>0 && x.pendiente>x.neto*0.05)
  // "Por facturar" = trabajo YA HECHO que falta facturar. Los eventos que todavía no
  // pasaron no se pueden facturar: contarlos hacía parecer que faltaba cobrar mucho más.
  const pendientes=pendTodos.filter(x=>!semEvento(x.p['Fecha Evento']).futuro)
  const pendFuturos=pendTodos.filter(x=>semEvento(x.p['Fecha Evento']).futuro)
  const montoFuturos=pendFuturos.reduce((s,x)=>s+x.pendiente,0)

  // (se eliminó mandarMail(): abría Outlook con mailto: y ya no lo usaba nadie.
  //  El envío real sale del botón ✉ → MailFacturaModal → /api/factura-enviar)

  function subirPDF(f){
    const input=document.createElement('input'); input.type='file'; input.accept='application/pdf,image/*'
    input.onchange=async()=>{
      const file=input.files?.[0]; if(!file) return
      // Reemplazo: avisar que el PDF viejo se deja de usar (queda en Drive, no se borra)
      if(f['Factura'] && !window.confirm(`Esta factura ya tiene un PDF cargado.\n\n¿Reemplazarlo por "${file.name}"?\n\n(El anterior queda guardado en Drive, solo deja de estar linkeado acá.)`)) return
      const nro=f['Nro de Factura']||'', nl=nro.toLowerCase()
      const entidad=nl.includes('sofia')?'Sofia':nl.includes('lulu')?'Lulu':(nl.includes('ef-')||nl.includes('efectivo'))?'Efectivo':'SRL'
      const fe=parseD(f['Fecha emision']), mes=fe?fe.getMonth()+1:hoy.getMonth()+1, anio=fe?fe.getFullYear():hoy.getFullYear()
      const fd=new FormData()
      fd.append('file', file, file.name); fd.append('entidad', entidad); fd.append('nroFactura', nro)
      fd.append('presupuestoNum', f['N° Presupuesto']||''); fd.append('mes', String(mes)); fd.append('anio', String(anio))
      showToast('Subiendo PDF…')
      try{ const r=await fetch('/api/factura-upload',{method:'POST',body:fd}); const j=await r.json(); if(!j.ok){showToast(j.error||'Error','err');return} showToast('PDF subido ✓'); if(onRefresh) onRefresh() }
      catch(e){ showToast('Error de conexión','err') }
    }
    input.click()
  }

  // Anular/borrar una factura (errores, nota de crédito, duplicados)
  async function borrarFactura(f){
    const numF=f['N° Presupuesto'], total=parseMonto(f['Precio FINAL'])
    if(!window.confirm(`Anular/borrar esta factura?\n#${numF} · ${f['Proyecto']||f['Cliente']||''} · ${fmt(total)}\n\nÚsalo para errores, notas de crédito o duplicados. ¿Seguro?`)) return
    const post=forzar=>fetch('/api/factura-borrar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nroPresupuesto:String(numF), monto:total, forzar})}).then(r=>r.json())
    try{ let j=await post(false)
      if(j.requiereForzar){ if(!window.confirm(j.error+'\n\n¿Borrar igual?')) return; j=await post(true) }
      if(!j.ok){ showToast(j.error||'Error','err'); return }
      showToast('Factura anulada ✓'); if(onRefresh) onRefresh()
    }catch(e){ showToast('Error de conexión','err') }
  }

  // Fecha de referencia de la deuda: vencimiento si hay; si no (filas viejas migradas
  // sin vencimiento), usamos la fecha del evento, o la de emisión como último recurso.
  const fechaRef=f=>{ const v=parseD(f['Vencimiento']); if(v) return {d:v,src:'vence'}; const e=parseD(f['Fecha Evento']); if(e) return {d:e,src:'evento'}; const em=parseD(f['Fecha emision']); if(em) return {d:em,src:'emitida'}; return null }
  const diffVenc=f=>{ const r=fechaRef(f); return r?Math.floor((r.d-hoy)/864e5):null }

  // "Ya está ✓" en Sin facturar: abre mini-modal para confirmar el monto REAL cobrado
  // (sugiere el del presupuesto, lo podés cambiar). Marca factura real + cobrada SIN tocar saldos.
  async function confirmarYaCobrada(x, montoReal, cobrada=true, fechaEnviada='', fechaCobro=''){
    const num=x.p['Columna 1']
    try{ const r=await fetch('/api/factura-confirmar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nroPresupuesto:String(num), cobrada, monto:montoReal, fechaEnviada, fechaCobro})})
      const j=await r.json(); if(!j.ok){showToast(j.error||'Error','err');return}
      showToast(`#${num} ${cobrada?'facturada y cobrada':'facturada (pendiente de cobro)'} por ${fmt(montoReal)} ✓`); setYaModal(null); if(onRefresh) onRefresh()
    }catch(e){ showToast('Error de conexión','err') }
  }
  const estF=f=>{ if(isCobrada(f))return'cobrada'; const ya=parseMonto(f['Monto cobrado']); if(ya>0)return'parcial'; const d=diffVenc(f); if(d==null)return'pendiente'; if(d<-30)return'reclamar'; if(d<0)return'vencida'; if(d<7)return'por-vencer'; return'pendiente' }
  const ESTF={ cobrada:{c:T.pos,l:'Cobrada'}, parcial:{c:T.warn,l:'Parcial'}, 'por-vencer':{c:T.warn,l:'Por vencer'}, pendiente:{c:T.ink3,l:'Pendiente'}, vencida:{c:T.brand,l:'Vencida'}, reclamar:{c:T.brand,l:'¡Reclamar!'} }

  // ¿La factura salió para el cliente? Administración a veces la carga y espera el OK para
  // mandarla: cargada NO es enviada. Marcan envío "Fc Enviada" (mail desde la app) y
  // "Fecha enviada" (cargada a mano o histórico del sheet).
  const enviadaF=f=>/^(TRUE|VERDADERO|SI|SÍ|X)$/i.test(String(f['Fc Enviada']||'').trim()) || !!String(f['Fecha enviada']||'').trim()
  // Solo alarma sobre las que están sin cobrar: si ya la cobraste, obvio que salió.
  const sinEnviarLista=fcReal.filter(f=>!enviadaF(f) && !isCobrada(f))

  // Saldo REAL de cada factura: si hubo cobro parcial, se debe solo el resto.
  // Antes la tarjeta sumaba el precio entero de las parciales y la lista las excluía:
  // por eso el total de arriba no coincidía con la suma de abajo.
  const saldoF=f=>Math.max(0, parseMonto(f['Precio FINAL'])-parseMonto(f['Monto cobrado']))

  // Por cobrar, abierto por estado (para que el total grande no asuste sin contexto)
  const noCobradas=fcReal.filter(f=>!isCobrada(f))
  const pcTotal=noCobradas.reduce((s,f)=>s+saldoF(f),0)
  const vencidasMonto=noCobradas.filter(f=>(diffVenc(f)??99)<0).reduce((s,f)=>s+saldoF(f),0)
  const pcPorVencer=noCobradas.filter(f=>{const d=diffVenc(f); return d!=null&&d>=0&&d<7}).reduce((s,f)=>s+saldoF(f),0)
  const pcEnPlazo=Math.max(0, pcTotal-vencidasMonto-pcPorVencer)

  const porFacturarTotal=pendientes.reduce((s,x)=>s+x.pendiente,0)

  const filtrada=fcReal.filter(f=>{
    const e=estF(f)
    // 'parcial' entra en "Por cobrar": lo que falta cobrar de una parcial también se debe.
    const owed=['pendiente','por-vencer','vencida','reclamar','parcial']
    const mf = filt==='todas' || (filt==='cobrada'&&e==='cobrada') || ((filt==='porcobrar'||filt==='pendiente'||filt==='atrasadas')&&owed.includes(e)) || (filt==='parcial'&&e==='parcial')
      || (filt==='sinenviar'&&!enviadaF(f)&&!isCobrada(f))
    const mq=!q||[f['Nro de Factura'],f['N° Presupuesto'],f['Cliente'],f['Agencia'],f['Proyecto']].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase()))
    return mf&&mq&&matchMes(evDe(f))
  }).sort((a,b)=> filt==='todas'
      ? ((parseD(evDe(b)||b['Fecha emision'])?.getTime()||0)-(parseD(evDe(a)||a['Fecha emision'])?.getTime()||0))  // Todas: más nuevo primero
      : ((diffVenc(a)??99)-(diffVenc(b)??99)))  // resto: más atrasado primero

  // Proyectos aprobados sin facturar (o con saldo), ordenados por evento más atrasado arriba
  const pendOrdenados = pendientes.filter(x=>(!q||[x.p['Columna 1'],x.p['Proyecto'],x.p['Cliente'],x.p['Agencia']].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase())))&&matchMes(x.p['Fecha Evento'])).sort((a,b)=>semEvento(b.p['Fecha Evento']).dias-semEvento(a.p['Fecha Evento']).dias)
  const sinFactAtrasados = pendientes.filter(x=>{const s=semEvento(x.p['Fecha Evento']);return !s.futuro&&s.dias>30}).length
  const sumFiltrada = filtrada.reduce((s,f)=>s+saldoF(f),0)
  const sumPend = pendOrdenados.reduce((s,x)=>s+x.pendiente,0)

  // Trabajos futuros: todavía no pasó el evento, pero a veces el cliente pide la factura
  // por adelantado (orden de compra, cierre de mes de la agencia). Acá se pueden facturar.
  const futOrdenados = pendFuturos.filter(x=>(!q||[x.p['Columna 1'],x.p['Proyecto'],x.p['Cliente'],x.p['Agencia']].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase())))&&matchMes(x.p['Fecha Evento'])).sort((a,b)=>semEvento(b.p['Fecha Evento']).dias-semEvento(a.p['Fecha Evento']).dias)
  const sumFut = futOrdenados.reduce((s,x)=>s+x.pendiente,0)

  // Opciones de mes (por fecha de evento) para el filtro
  const mesesSet={}; ;[...fcReal.map(evDe), ...pendTodos.map(x=>x.p['Fecha Evento'])].forEach(s=>{ const d=parseD(s); if(d) mesesSet[`${d.getMonth()+1}-${d.getFullYear()}`]=`${MESES_LARGO[d.getMonth()]} ${d.getFullYear()}` })
  const monthOpts=Object.entries(mesesSet).sort((a,b)=>{ const [ma,ya]=a[0].split('-').map(Number),[mb,yb]=b[0].split('-').map(Number); return yb-ya||mb-ma })

  const FILTROS=[['todas','Todas'],['porcobrar','Por cobrar'],['parcial','Parciales'],['cobrada','Cobradas'],['sinenviar',`Sin enviar (${sinEnviarLista.length})`],['sinfacturar',`Sin facturar (${pendientes.length})`],['futuros',`Futuros (${pendFuturos.length})`]]

  return <>
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20}}>
      <div><h1 style={{fontSize:23, fontWeight:700, color:T.ink, margin:0, letterSpacing:-0.3}}>Facturación</h1><div style={{fontSize:13, color:T.ink3, marginTop:3}}>{filtrada.length} de {fc.length} · {pendientes.length} sin facturar</div></div>
      <button onClick={()=>setReclamo('')} style={{padding:'10px 16px', borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13.5, fontWeight:600, cursor:'pointer'}} title="Un solo mail con todas las facturas pendientes de un cliente">✉ Reclamar cuenta</button>
      <button onClick={()=>setNuevaF(true)} style={{padding:'10px 18px', borderRadius:10, border:'none', background:T.brand, color:'#fff', fontSize:13.5, fontWeight:600, cursor:'pointer'}}>+ Nueva factura</button>
    </div>
    <div style={{display:'flex', gap:14, marginBottom:20}}>
      <Hero label="Por cobrar" value={fmt(pcTotal)} accent={T.ink} sub={`${noCobradas.length} facturas · saldo real`}
        desglose={[
          {l:'Vencido', v:fmt(vencidasMonto), c:vencidasMonto>0?T.brand:T.ink3},
          {l:'Vence esta semana', v:fmt(pcPorVencer), c:pcPorVencer>0?T.warn:T.ink3},
          {l:'En plazo', v:fmt(pcEnPlazo), c:T.ink2},
        ]}/>
      <Hero label="Por facturar" value={fmt(porFacturarTotal)} accent={T.warn} sub={`${pendientes.length} trabajos ya hechos sin factura`}
        desglose={montoFuturos>0?[{l:`+ ${pendFuturos.length} trabajos futuros · ver para facturar por adelantado`, v:fmt(montoFuturos), c:T.ink3, onClick:()=>setFilt('futuros')}]:null}/>
    </div>
    <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', marginBottom:14}}>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar factura, presu, cliente, proyecto…" style={{flex:'1 1 240px', minWidth:190, padding:'9px 13px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13, outline:'none'}}/>
      <select value={mesF} onChange={e=>setMesF(e.target.value)} title="Filtrar por mes del evento" style={{...selectStyle, minWidth:160}}><option value="todos">Todos los meses</option>{monthOpts.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select>
    </div>
    <div style={{display:'flex', gap:7, marginBottom:14}}>
      {FILTROS.map(([k,l])=><button key={k} onClick={()=>setFilt(k)} style={{padding:'6px 13px', borderRadius:20, fontSize:12, fontWeight:500, cursor:'pointer', border:`1px solid ${filt===k?T.ink:T.border}`, background:filt===k?T.ink:T.surface, color:filt===k?'#fff':T.ink2}}>{l}</button>)}
    </div>
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10, padding:'9px 15px', background:T.surfaceAlt, borderRadius:9}}>
      <span style={{fontSize:13.5, color:T.ink, fontWeight:600}}>{filt==='sinfacturar' ? `${pendOrdenados.length} ${pendOrdenados.length===1?'proyecto':'proyectos'} sin facturar` : filt==='futuros' ? `${futOrdenados.length} ${futOrdenados.length===1?'trabajo futuro':'trabajos futuros'}` : `${filtrada.length} ${filtrada.length===1?'factura':'facturas'}`}{mesF!=='todos' ? ` · ${mesesSet[mesF]}` : ''}</span>
      <span style={{fontSize:13.5, fontFamily:MONO, color:T.ink2, fontWeight:600}}>{fmt(filt==='sinfacturar'?sumPend:filt==='futuros'?sumFut:sumFiltrada)}</span>
    </div>
    {(filt==='sinfacturar'||filt==='todas') && (<>
    {filt==='todas' && <div style={{margin:'4px 0 10px', fontSize:11.5, fontWeight:700, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3}}>Sin facturar · {pendOrdenados.length} · {fmt(sumPend)}</div>}
    <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
      {sinFactAtrasados>0 && <div style={{background:T.brandSoft, color:T.brand, padding:'9px 18px', fontSize:12, fontWeight:600, borderBottom:`1px solid ${T.border}`}}>⚠ {sinFactAtrasados} {sinFactAtrasados===1?'proyecto con evento pasado hace +30 días sin facturar':'proyectos con evento pasado hace +30 días sin facturar'}</div>}
      <div style={{display:'grid', gridTemplateColumns:'110px 1.5fr 110px 180px', padding:'11px 18px', borderBottom:`1px solid ${T.border}`, fontSize:10.5, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3}}>
        <span>Evento</span><span>Proyecto</span><span style={{textAlign:'right'}}>Pendiente</span><span style={{textAlign:'right'}}>Acción</span>
      </div>
      {pendOrdenados.length===0 && <Empty>Nada sin facturar 🎉</Empty>}
      {pendOrdenados.slice(0,200).map((x,i)=>{ const fi=semEvento(x.p['Fecha Evento']); return (
        <div key={i} style={{display:'grid', gridTemplateColumns:'110px 1.5fr 110px 180px', padding:'12px 18px', borderTop:i===0?'none':`1px solid ${T.border}`, alignItems:'center', fontSize:13}}>
          <span style={{display:'flex', flexDirection:'column', gap:1, minWidth:0}}>
            <span style={{display:'flex', alignItems:'center', gap:5}}><span style={{width:7,height:7,borderRadius:7,background:fi.c, flexShrink:0}}/><span style={{fontSize:12.5, fontFamily:MONO, color:T.ink, fontWeight:fi.dias>30?700:500}}>{fi.fecha}</span></span>
            <span style={{fontSize:9.5, color:fi.c, fontWeight:fi.dias>30?700:500}}>{fi.l}</span>
          </span>
          <span style={{minWidth:0, paddingRight:10}}>
            <span style={{display:'block', color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{x.p['Proyecto']||x.p['Cliente']||'—'}</span>
            <span style={{display:'block', fontSize:11, color:T.ink3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>#{x.p['Columna 1']} · {[x.p['Cliente'],x.p['Agencia']].filter(Boolean).join(' · ')}</span>
          </span>
          <span style={{textAlign:'right', fontFamily:MONO, fontSize:12.5, color:T.brand, fontWeight:600}}>{fmt(x.pendiente)}</span>
          <span style={{display:'flex', justifyContent:'flex-end', gap:5}}>
            <button onClick={()=>{setNuevaFsel(x); setNuevaF(true)}} style={{...miniBtn, background:T.brand, color:'#fff', border:'none', padding:'6px 10px'}} title="Crear factura real (con número y mail)">Facturar</button>
            <button onClick={()=>setYaModal(x)} style={{...miniBtn, padding:'6px 10px'}} title="Ya la facturaste y cobraste en su momento — la marca lista sin tocar saldos">Ya está ✓</button>
          </span>
        </div>
      )})}
    </div>
    </>)}
    {filt==='futuros' && (
    <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
      <div style={{background:T.surfaceAlt, color:T.ink2, padding:'9px 18px', fontSize:12, borderBottom:`1px solid ${T.border}`}}>Trabajos aprobados cuyo evento todavía no pasó. Facturalos solo si el cliente te lo pide por adelantado.</div>
      <div style={{display:'grid', gridTemplateColumns:'110px 1.5fr 110px 180px', padding:'11px 18px', borderBottom:`1px solid ${T.border}`, fontSize:10.5, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3}}>
        <span>Evento</span><span>Proyecto</span><span style={{textAlign:'right'}}>Pendiente</span><span style={{textAlign:'right'}}>Acción</span>
      </div>
      {futOrdenados.length===0 && <Empty>No hay trabajos futuros pendientes de facturar</Empty>}
      {futOrdenados.slice(0,200).map((x,i)=>{ const fi=semEvento(x.p['Fecha Evento']); return (
        <div key={i} style={{display:'grid', gridTemplateColumns:'110px 1.5fr 110px 180px', padding:'12px 18px', borderTop:i===0?'none':`1px solid ${T.border}`, alignItems:'center', fontSize:13}}>
          <span style={{display:'flex', flexDirection:'column', gap:1, minWidth:0}}>
            <span style={{display:'flex', alignItems:'center', gap:5}}><span style={{width:7,height:7,borderRadius:7,background:T.ink3, flexShrink:0}}/><span style={{fontSize:12.5, fontFamily:MONO, color:T.ink, fontWeight:500}}>{fi.fecha}</span></span>
            <span style={{fontSize:9.5, color:T.ink3}}>en {-fi.dias}d</span>
          </span>
          <span style={{minWidth:0, paddingRight:10}}>
            <span style={{display:'block', color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{x.p['Proyecto']||x.p['Cliente']||'—'}</span>
            <span style={{display:'block', fontSize:11, color:T.ink3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>#{x.p['Columna 1']} · {[x.p['Cliente'],x.p['Agencia']].filter(Boolean).join(' · ')}</span>
          </span>
          <span style={{textAlign:'right', fontFamily:MONO, fontSize:12.5, color:T.ink2, fontWeight:600}}>{fmt(x.pendiente)}</span>
          <span style={{display:'flex', justifyContent:'flex-end', gap:5}}>
            <button onClick={()=>{setNuevaFsel(x); setNuevaF(true)}} style={{...miniBtn, background:T.brand, color:'#fff', border:'none', padding:'6px 10px'}} title="Facturar por adelantado (el evento todavía no pasó)">Facturar</button>
            <button onClick={()=>setYaModal(x)} style={{...miniBtn, padding:'6px 10px'}} title="Ya la facturaste y cobraste en su momento — la marca lista sin tocar saldos">Ya está ✓</button>
          </span>
        </div>
      )})}
    </div>
    )}
    {filt!=='sinfacturar' && filt!=='futuros' && (<>
    {filt==='todas' && <div style={{margin:'20px 0 10px', fontSize:11.5, fontWeight:700, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3}}>Facturas · {filtrada.length} · {fmt(sumFiltrada)}</div>}
    <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
      <div style={{display:'grid', gridTemplateColumns:'90px 1.2fr 90px 150px 275px', padding:'11px 18px', borderBottom:`1px solid ${T.border}`, fontSize:10.5, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3}}>
        <span>Evento</span><span>Proyecto</span><span style={{textAlign:'right'}}>Neto</span><span style={{textAlign:'right'}}>Estado</span><span style={{textAlign:'right'}}>Acción</span>
      </div>
      {filtrada.length===0&&<Empty>Sin resultados</Empty>}
      {filtrada.slice(0,200).map((f,i)=>{
        const e=estF(f), info=ESTF[e], num=f['N° Presupuesto'], d=diffVenc(f)
        return <div key={i} style={{display:'grid', gridTemplateColumns:'90px 1.2fr 90px 150px 275px', padding:'12px 18px', borderTop:i===0?'none':`1px solid ${T.border}`, alignItems:'center', fontSize:13}}>
          <span style={{display:'flex', flexDirection:'column', gap:1, minWidth:0}}>
            <span style={{display:'flex', alignItems:'center', gap:5}}><span style={{width:7,height:7,borderRadius:7,background:info.c, flexShrink:0}}/><span style={{fontSize:12, fontFamily:MONO, color:T.ink, fontWeight:d!=null&&d<0?700:500}}>{(()=>{const ev=parseD(evDe(f)); return ev?`${ev.getDate()}/${ev.getMonth()+1}`:'—'})()}</span></span>
            <span style={{fontSize:9.5, color:info.c, fontWeight:d!=null&&d<0?700:500}}>{info.l}</span>
          </span>
          <span style={{minWidth:0, paddingRight:10}}>
            <span style={{display:'block', color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{f['Proyecto']||f['Cliente']||'—'}</span>
            <span style={{display:'block', fontSize:11, color:T.ink3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{[f['Cliente'],f['Agencia']].filter(Boolean).join(' · ')}{f['Nro de Factura']?` · ${f['Nro de Factura']}`:''}</span>
          </span>
          <span style={{textAlign:'right', fontFamily:MONO, fontSize:12.5, color:T.ink}}>{fmt(parseMonto(f['Precio SIN IVA']))}</span>
          <span style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2}}>
            <span style={{display:'flex', alignItems:'center', gap:6}}><span style={{width:7,height:7,borderRadius:7,background:info.c}}/><span style={{fontSize:12, color:T.ink2}}>{info.l}</span></span>
            {!isCobrada(f) && (()=>{ const r=fechaRef(f); if(!r) return null; const dd=`${r.d.getDate()}/${r.d.getMonth()+1}`; const lbl=r.src==='vence'?'vence':r.src==='evento'?'evento':'emitida'; const dtxt=d!=null?(d<0?`${Math.abs(d)}d atrasada`:d===0?'hoy':`en ${d}d`):''; return <span style={{fontSize:11, color:info.c, fontWeight:d!=null&&d<0?700:500}}>{lbl} {dd}{dtxt?` · ${dtxt}`:''}</span> })()}
            {/* ¿Salió para el cliente? Cargar el PDF no es enviarlo. */}
            {enviadaF(f)
              ? <span style={{fontSize:10.5, color:T.ink3}} title="La factura ya salió para el cliente">✉ enviada{f['Fecha enviada']?` ${f['Fecha enviada']}`:''}</span>
              : !isCobrada(f) && <span style={{fontSize:10.5, color:T.warn, fontWeight:700}} title={f['Factura']?'La factura está cargada pero todavía no se mandó al cliente':'Todavía no se mandó al cliente'}>{f['Factura']?'📎 cargada · SIN ENVIAR':'✉ SIN ENVIAR'}</span>}
          </span>
          <span style={{display:'flex', gap:5, justifyContent:'flex-end'}}>
            {!isCobrada(f) && <button onClick={()=>setCobrando(f)} style={{...miniBtn, background:T.pos, color:'#fff', border:'none', padding:'6px 9px'}}>Cobrar</button>}
            <button onClick={()=>setMailFactura(f)} style={{...miniBtn, padding:'6px 8px'}} title="Mandar factura por mail (desde la app)">✉</button>
            <button onClick={()=>setEditarFechas(f)} style={{...miniBtn, padding:'6px 8px'}} title="Editar a mano fecha de envío y de cobro (notas de crédito, facturas consolidadas)">📅</button>
            {/* Si ya hay PDF se puede VER y también REEMPLAZAR: antes, con un PDF mal subido
                no había forma de cambiarlo desde la app (el botón de subir desaparecía). */}
            {f['Factura'] && <a href={f['Factura']} target="_blank" rel="noreferrer" style={{...miniBtn, padding:'6px 8px'}} title="Ver PDF de la factura">📎</a>}
            <button onClick={()=>subirPDF(f)} style={{...miniBtn, padding:'6px 8px'}} title={f['Factura']?'Reemplazar el PDF de la factura':'Subir PDF de la factura'}>{f['Factura']?'↻':'⬆'}</button>
            <button onClick={()=>goTo&&goTo('proyectos',{q:String(num)})} style={{...miniBtn, padding:'6px 9px'}} title="Abrir el proyecto">Proyecto</button>
            <button onClick={()=>borrarFactura(f)} style={{...miniBtn, padding:'6px 9px', color:T.brand, borderColor:`${T.brand}55`}} title="Anular/borrar esta factura (error, nota de crédito, duplicado)">✕</button>
          </span>
        </div>
      })}
    </div>
    </>)}
    {cobrando && <CobroModal f={cobrando} cuentas={cuentas} onClose={()=>setCobrando(null)} onRefresh={onRefresh} showToast={showToast}/>}
    {yaModal && <YaCobradaModal x={yaModal} onClose={()=>setYaModal(null)} onConfirm={confirmarYaCobrada}/>}
    {mailFactura && <MailFacturaModal f={mailFactura} onClose={()=>setMailFactura(null)} onSent={()=>{ if(onRefresh) onRefresh() }} showToast={showToast}/>}
    {editarFechas && <EditarFechasModal f={editarFechas} onClose={()=>setEditarFechas(null)} onRefresh={onRefresh} showToast={showToast}/>}
    {nuevaF && <NuevaFactura pendientes={pendTodos} agencias={data.agencias||[]} contactos={data.contactos||[]} initialSel={nuevaFsel} onClose={()=>{setNuevaF(false); setNuevaFsel(null)}} onCreada={()=>{ setNuevaF(false); setNuevaFsel(null); if(onRefresh) onRefresh() }} showToast={showToast}/>}
    {reclamo!==null && <ReclamoModal agenciasPendientes={agenciasPendientes} inicial={reclamo} onClose={()=>setReclamo(null)} onSent={()=>{ if(onRefresh) onRefresh() }} showToast={showToast}/>}
  </>
}

function NuevaFactura({pendientes, agencias=[], contactos=[], initialSel=null, onClose, onCreada, showToast}){
  const hoy=new Date()
  const [sel,setSel]=useState(initialSel), [q,setQ]=useState('')
  // Datos fiscales de a quién se le factura (la agencia que paga, o el cliente si es directo)
  const facturarA = sel ? ((sel.p['Agencia']&&!/sin agencia|directo/i.test(sel.p['Agencia']))?sel.p['Agencia']:sel.p['Cliente']) : ''
  const agRow = sel ? agencias.find(a=>normTxt(a['Nombre'])===normTxt(facturarA)) : null
  const ctRow = (sel && !agRow?.['CUIT']) ? contactos.find(c=>normTxt(c['Agencia'])===normTxt(facturarA)||normTxt(c['Nombre'])===normTxt(facturarA)) : null
  const cuitFact = (agRow?.['CUIT'] || ctRow?.['Cuit'] || '').toString().trim()
  const condIVAFact = (agRow?.['Condicion IVA'] || '').toString().trim()
  const fechaInfo = p=>semEvento(p['Fecha Evento'])
  const [entidad,setEntidad]=useState('SRL'), [tipo,setTipo]=useState('A'), [nro,setNro]=useState(''), [plazo,setPlazo]=useState('30'), [conIVA,setConIVA]=useState(true), [montoNeto,setMontoNeto]=useState(initialSel?String(Math.round(initialSel.pendiente)):''), [saving,setSaving]=useState(false), [pdfFile,setPdfFile]=useState(null)
  const neto = sel ? (parseFloat(montoNeto)||sel.pendiente) : 0
  const iva = conIVA?Math.round(neto*0.21):0
  const total = neto+iva
  const lista = pendientes.filter(x=>!q||[x.p['Columna 1'],x.p['Proyecto'],x.p['Cliente'],x.p['Agencia']].some(v=>normTxt(v).includes(normTxt(q)))).sort((a,b)=>semEvento(b.p['Fecha Evento']).dias-semEvento(a.p['Fecha Evento']).dias)

  async function crear(forzar=false, conMail=true){
    if(!sel) return
    const presuNum=sel.p['Columna 1']
    setSaving(true)
    const fechaEmision=`${hoy.getDate()}/${hoy.getMonth()+1}/${hoy.getFullYear()}`
    const venc=new Date(hoy.getTime()+parseInt(plazo)*864e5); const fechaVenc=`${venc.getDate()}/${venc.getMonth()+1}/${venc.getFullYear()}`
    const body={ entidad, tipo, nroFactura:nro, fechaEmision, fechaVenc, plazo: plazo==='0'?'Contado':plazo+' días', conIVA, neto:Math.round(neto), iva:Math.round(iva), total:Math.round(total), presupuestoNum:presuNum, proyecto:sel.p['Proyecto'], agencia:sel.p['Agencia'], cliente:sel.p['Cliente'], forzar }
    try{
      const r=await fetch('/api/factura-nueva',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      const j=await r.json()
      if(r.status===409){ setSaving(false); if(window.confirm((j.mensaje||'N° de factura duplicado')+'\n\n¿Crear igual?')) return crear(true, conMail); return }
      if(!j.ok){ showToast(j.error||'Error','err'); setSaving(false); return }
      // 1) Subir PDF si se adjuntó (antes del mail, para que el mail incluya el link)
      if(pdfFile){
        try{ const fd=new FormData(); fd.append('file',pdfFile,pdfFile.name); fd.append('entidad',entidad); fd.append('nroFactura',nro); fd.append('presupuestoNum',presuNum); fd.append('mes',String(hoy.getMonth()+1)); fd.append('anio',String(hoy.getFullYear()))
          showToast('Subiendo PDF…'); const ru=await fetch('/api/factura-upload',{method:'POST',body:fd}); const ju=await ru.json(); if(!ju.ok) showToast('Factura creada, pero el PDF falló: '+(ju.error||''),'err')
        }catch(e){ showToast('Factura creada, el PDF falló','err') }
      }
      // 2) Mandar mail al cliente (destinatarios + cuerpo + el PDF adjunto al mail)
      if(conMail){
        // Sale desde admin@somosmagma.com por Gmail (mismo camino que Pagos Staff).
        // Antes abría Outlook con mailto: y el mail quedaba sin mandar.
        try{ const rm=await fetch('/api/factura-prep-mail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({presupuestoNum:presuNum})}); const jm=await rm.json()
          if(jm.ok){
            // Solo los sugeridos: el contacto del presu y facturación de la agencia.
            // Antes salía a TODOS los contactos de la agencia y quedaban todos en copia.
            const to=(jm.destinatarios||[]).filter(d=>d.sugerido).map(d=>d.mail).filter(Boolean)
            if(!to.length) showToast('Factura creada — sin mail de contacto. Mandala con el botón ✉ de la lista.','err')
            else {
              const re=await fetch('/api/factura-enviar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to, asunto:jm.asunto, cuerpo:jm.cuerpo, presupuestoNum:presuNum, adjuntarPDF:!!jm.adjuntarPDF})})
              const je=await re.json()
              if(je.ok) showToast(`Mail enviado a ${to.join(', ')}${je.adjunto?' con la factura adjunta':''} ✓`)
              else showToast('Factura creada — el mail falló: '+(je.error||''),'err')
            }
          }
          else showToast('Factura creada — no pude armar el mail: '+(jm.error||''),'err')
        }catch(e){ showToast('Factura creada — el mail falló','err') }
      }
      showToast(`Factura #${presuNum} creada ✓`); onCreada()
    }catch(e){ showToast('Error de conexión','err'); setSaving(false) }
  }

  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:900, display:'flex', justifyContent:'center', overflowY:'auto', padding:'40px 20px'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:560, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)', height:'fit-content'}}>
      <div style={{padding:'18px 22px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div style={{fontSize:16, fontWeight:700, color:T.ink}}>Nueva factura</div>
        <button onClick={onClose} style={{border:'none', background:'transparent', fontSize:22, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
      </div>
      <div style={{padding:'18px 22px'}}>
        {!sel ? <>
          <label style={lblV2}>¿Para qué proyecto? (aprobados sin facturar)</label>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar proyecto, cliente, N°…" style={{...inpV2, marginBottom:10}}/>
          <div style={{maxHeight:300, overflowY:'auto', border:`1px solid ${T.border}`, borderRadius:10}}>
            {lista.length===0 && <Empty>Nada pendiente de facturar</Empty>}
            {lista.map((x,i)=>{ const fi=fechaInfo(x.p); return (
              <div key={i} onClick={()=>{setSel(x); setMontoNeto(String(Math.round(x.pendiente)))}} style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, padding:'10px 14px', borderTop:i===0?'none':`1px solid ${T.border}`, cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background=T.surfaceAlt} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <div style={{minWidth:0}}><div style={{fontSize:13, color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{x.p['Proyecto']||'—'}</div><div style={{fontSize:11.5, color:T.ink3}}>#{x.p['Columna 1']} · {[x.p['Cliente'],x.p['Agencia']].filter(Boolean).join(' · ')}</div></div>
                <div style={{textAlign:'right', flexShrink:0}}>
                  <span style={{fontSize:12.5, fontFamily:MONO, color:T.brand, fontWeight:600}}>{fmt(x.pendiente)}</span>
                  <div style={{display:'flex', alignItems:'center', gap:5, justifyContent:'flex-end', marginTop:3}} title={fi.l}><span style={{width:6,height:6,borderRadius:6,background:fi.c}}/><span style={{fontSize:10.5, color:fi.c, fontWeight:fi.futuro?600:400}}>{fi.futuro?`📅 ${fi.fecha} (futuro)`:fi.fecha}</span></div>
                </div>
              </div>
            )})}
          </div>
        </> : <>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', background:T.surfaceAlt, borderRadius:10, padding:'10px 14px', marginBottom:10}}>
            <div style={{minWidth:0}}><div style={{fontSize:13, color:T.ink, fontWeight:600}}>{sel.p['Proyecto']||'—'}</div><div style={{fontSize:11.5, color:T.ink3}}>#{sel.p['Columna 1']} · {[sel.p['Cliente'],sel.p['Agencia']].filter(Boolean).join(' · ')} · pendiente {fmt(sel.pendiente)}</div>
              {(()=>{ const fi=fechaInfo(sel.p); return <div style={{display:'flex', alignItems:'center', gap:6, marginTop:5}}><span style={{width:7,height:7,borderRadius:7,background:fi.c}}/><span style={{fontSize:11.5, color:fi.c, fontWeight:600}}>Evento {sel.p['Fecha Evento']||'s/f'} · {fi.futuro?'todavía no pasó':fi.l}</span></div> })()}
            </div>
            <button onClick={()=>setSel(null)} style={miniBtn}>cambiar</button>
          </div>
          <div style={{background:cuitFact?T.surface:T.brandSoft, border:`1px solid ${cuitFact?T.border:T.brand}`, borderRadius:10, padding:'10px 14px', marginBottom:16}}>
            <div style={{fontSize:9.5, textTransform:'uppercase', letterSpacing:0.4, color:T.ink3, fontWeight:600, marginBottom:4}}>Facturar a</div>
            <div style={{fontSize:13, color:T.ink, fontWeight:600}}>{facturarA||'—'}</div>
            {cuitFact
              ? <div style={{display:'flex', alignItems:'center', gap:10, marginTop:5, flexWrap:'wrap'}}>
                  <span onClick={()=>{navigator.clipboard?.writeText(cuitFact); showToast('CUIT copiado')}} title="Copiar CUIT" style={{fontSize:14, fontFamily:MONO, color:T.ink, fontWeight:600, cursor:'pointer', background:T.surfaceAlt, padding:'3px 9px', borderRadius:7, border:`1px solid ${T.border}`}}>{cuitFact} ⧉</span>
                  {condIVAFact && <span style={{fontSize:11.5, color:T.ink2}}>{condIVAFact}</span>}
                </div>
              : <div style={{fontSize:11.5, color:T.brand, marginTop:5, fontWeight:500}}>⚠ Sin CUIT cargado para «{facturarA}». Cargalo en Agencias.</div>}
          </div>
          <div style={{display:'flex', gap:12, flexWrap:'wrap', marginBottom:12}}>
            <div style={{flex:1, minWidth:120}}><label style={lblV2}>Entidad</label><select value={entidad} onChange={e=>setEntidad(e.target.value)} style={inpV2}>{['SRL','Sofia','Lulu','Efectivo'].map(x=><option key={x} value={x}>{x}</option>)}</select></div>
            <div style={{width:90}}><label style={lblV2}>Tipo</label><select value={tipo} onChange={e=>setTipo(e.target.value)} style={inpV2}>{['A','B','C'].map(x=><option key={x} value={x}>{x}</option>)}</select></div>
            <div style={{flex:1, minWidth:140}}><label style={lblV2}>N° de factura</label><input value={nro} onChange={e=>setNro(e.target.value)} placeholder="ej 0001-00001234" style={inpV2}/></div>
          </div>
          <div style={{display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end', marginBottom:8}}>
            <div style={{width:160}}><label style={lblV2}>Monto neto (sin IVA)</label><input type="number" value={montoNeto} onChange={e=>setMontoNeto(e.target.value)} style={{...inpV2, textAlign:'right', fontFamily:MONO}}/></div>
            <div style={{width:120}}><label style={lblV2}>Plazo</label><select value={plazo} onChange={e=>setPlazo(e.target.value)} style={inpV2}><option value="0">Contado</option><option value="15">15 días</option><option value="30">30 días</option><option value="60">60 días</option></select></div>
            <label style={{display:'flex', gap:7, alignItems:'center', fontSize:13, color:T.ink2, cursor:'pointer', paddingBottom:9}}><input type="checkbox" checked={conIVA} onChange={e=>setConIVA(e.target.checked)}/> Con IVA 21%</label>
          </div>
          <div style={{display:'flex', gap:7, alignItems:'center', marginBottom:12, flexWrap:'wrap'}}>
            <span style={{fontSize:11.5, color:T.ink3}}>Facturar:</span>
            {[['50%',0.5],['Total',1]].map(([l,f])=><button key={l} onClick={()=>setMontoNeto(String(Math.round(sel.pendiente*f)))} style={{padding:'5px 12px', borderRadius:20, fontSize:11.5, fontWeight:600, cursor:'pointer', border:`1px solid ${Math.round(neto)===Math.round(sel.pendiente*f)?T.ink:T.border}`, background:Math.round(neto)===Math.round(sel.pendiente*f)?T.ink:T.surface, color:Math.round(neto)===Math.round(sel.pendiente*f)?'#fff':T.ink2}}>{l}</button>)}
            {(()=>{ const restante=Math.max(0, Math.round(sel.pendiente)-Math.round(neto)); return restante>0 ? <span style={{fontSize:11.5, color:T.warn, fontWeight:600, marginLeft:4}}>↳ queda pendiente {fmt(restante)} para facturar después</span> : <span style={{fontSize:11.5, color:T.pos, fontWeight:600, marginLeft:4}}>↳ factura el total, no queda saldo</span> })()}
          </div>
          <div style={{marginBottom:4}}>
            <label style={lblV2}>PDF de la factura (opcional)</label>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              <input type="file" accept="application/pdf,image/*" onChange={e=>setPdfFile(e.target.files?.[0]||null)} style={{fontSize:12.5, color:T.ink2}}/>
              {pdfFile && <span style={{fontSize:11.5, color:T.pos, fontWeight:600}}>✓ {pdfFile.name}</span>}
            </div>
          </div>
          <div style={{display:'flex', justifyContent:'flex-end', gap:20, padding:'12px 0', borderTop:`1px solid ${T.border}`}}>
            <Mini label="Neto" val={fmt(neto)}/>{conIVA&&<Mini label="IVA" val={fmt(iva)}/>}<Mini label="Total" val={fmt(total)} color={T.brand}/>
          </div>
        </>}
      </div>
      {sel && <div style={{padding:'14px 22px', borderTop:`1px solid ${T.border}`, display:'flex', gap:10, justifyContent:'flex-end', alignItems:'center', flexWrap:'wrap'}}>
        <button onClick={onClose} style={{padding:'9px 18px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:500, cursor:'pointer'}}>Cancelar</button>
        <button onClick={()=>crear(false,false)} disabled={saving||neto<=0} style={{padding:'9px 18px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13, fontWeight:600, cursor:(saving||neto<=0)?'default':'pointer', opacity:(saving||neto<=0)?0.5:1}}>Solo crear</button>
        <button onClick={()=>crear(false,true)} disabled={saving||neto<=0} style={{padding:'9px 22px', borderRadius:9, border:'none', background:(saving||neto<=0)?T.ink3:T.brand, color:'#fff', fontSize:13.5, fontWeight:600, cursor:(saving||neto<=0)?'default':'pointer'}}>{saving?'Procesando…':'Crear y mandar mail'}</button>
      </div>}
    </div>
  </div>
}

// Un solo mail con TODAS las facturas pendientes de un cliente.
// Caso real: Ostara debe varias y siempre contesta la misma persona de administración.
function ReclamoModal({ agenciasPendientes, inicial, onClose, onSent, showToast }){
  const [ag,setAg]=useState(inicial||'')
  const [loading,setLoading]=useState(false)
  const [data,setData]=useState(null)
  const [dests,setDests]=useState([])
  const [nuevo,setNuevo]=useState('')
  const [asunto,setAsunto]=useState('')
  const [cuerpo,setCuerpo]=useState('')
  const [saving,setSaving]=useState(false)

  const [items,setItems]=useState([])   // facturas con su tilde
  const [tocado,setTocado]=useState(false) // si Flor editó el texto, no lo pisamos

  const cargar=async(nombre)=>{
    if(!nombre){ setData(null); setItems([]); return }
    setLoading(true); setData(null); setTocado(false)
    try{ const r=await fetch('/api/reclamo-prep',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agencia:nombre})}); const j=await r.json()
      if(!j.ok){ showToast(j.error||'Error','err'); setLoading(false); return }
      setData(j)
      // Se reclama lo VENCIDO. Lo que todavía está en plazo (mes de gracia) viene destildado:
      // no se le reclama a un cliente algo que aún no venció. Igual se puede tildar a mano.
      setItems((j.pendientes||[]).map(p=>({...p, sel:!p.enPlazo})))
      setDests((j.destinatarios||[]).map((d,i)=>({...d, sel:d.admin ? true : (i===0 && !(j.destinatarios||[]).some(x=>x.admin))})))
      setLoading(false)
    }catch(e){ showToast('Error de conexión','err'); setLoading(false) }
  }
  useEffect(()=>{ if(inicial) cargar(inicial) /* eslint-disable-next-line */ },[])

  const elegidas=items.filter(i=>i.sel)
  const totalSel=elegidas.reduce((s,i)=>s+i.monto,0)
  const vencSel=elegidas.filter(i=>i.diasVencida>0).length

  // El mail se rearma solo cada vez que cambia la selección, salvo que ya lo hayan editado a mano
  useEffect(()=>{
    if(!data||tocado) return
    const prim=dests.find(d=>d.sel)?.nombre?.split(' ')[0]||''
    setAsunto(`Resumen de cuenta - Somos Magma / ${ag} · ${elegidas.length} ${elegidas.length===1?'factura pendiente':'facturas pendientes'}`)
    setCuerpo([
      `Hola${prim && !/facturaci/i.test(prim) ? ' '+prim : ''},`,``,
      `Te paso el resumen de cuenta con los trabajos que tenemos pendientes de cobro:`,``,
      ...elegidas.map(p=>{
        const ref=p.nroFactura?`Factura ${p.nroFactura}`:`Presupuesto #${p.nro}`
        const det=[]; if(p.emision)det.push(`emitida ${p.emision}`)
        if(p.vencimiento)det.push(p.diasVencida>0?`venció ${p.vencimiento} (${p.diasVencida} días)`:`vence ${p.vencimiento}`)
        return `• ${ref} — ${p.proyecto||p.cliente||'s/d'}: $${Math.round(p.monto).toLocaleString('es-AR')}`+(det.length?`\n   ${det.join(' · ')}`:'')
      }),``,
      `TOTAL PENDIENTE: $${Math.round(totalSel).toLocaleString('es-AR')}`,
      vencSel?`(${vencSel} ${vencSel===1?'factura vencida':'facturas vencidas'})`:null,``,
      `Datos para transferir:`,...(data.lineasTransfer||[]),``,
      `¿Nos podés confirmar fecha estimada de pago así lo ordenamos de nuestro lado?`,``,
      `Cualquier cosa que necesites (duplicado de alguna factura, detalle de un trabajo), avisame y te lo mando.`,``,
      `Gracias,`,`${data.nombreEmisor}`,`Somos Magma`,
    ].filter(l=>l!==null).join('\n'))
  /* eslint-disable-next-line */ },[items,dests,data])
  const toggle=i=>setDests(d=>d.map((x,j)=>j===i?{...x,sel:!x.sel}:x))
  const agregar=()=>{ const m=nuevo.trim(); if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)){ showToast('Mail inválido','err'); return } if(dests.find(d=>d.mail.toLowerCase()===m.toLowerCase())){setNuevo('');return} setDests(d=>[...d,{mail:m,nombre:'agregado',match:'agregado a mano',sel:true}]); setNuevo('') }
  const elegidos=dests.filter(d=>d.sel).map(d=>d.mail)

  async function enviar(){
    if(!elegidos.length){ showToast('Elegí al menos un destinatario','err'); return }
    setSaving(true)
    try{ const r=await fetch('/api/factura-enviar',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({to:elegidos, asunto, cuerpo, accion:'reclamo-enviado', detalle:`${ag} · ${elegidas.length} facturas · ${fmt(totalSel)}`})})
      const j=await r.json()
      if(!j.ok){ showToast(j.error||'No se pudo enviar','err'); setSaving(false); return }
      showToast(`Reclamo enviado a ${elegidos.length===1?elegidos[0]:elegidos.length+' destinatarios'} ✓`); onSent&&onSent(); onClose()
    }catch(e){ showToast('Error de conexión','err'); setSaving(false) }
  }

  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:910, display:'flex', justifyContent:'center', overflowY:'auto', padding:'40px 20px'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:620, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)', height:'fit-content'}}>
      <div style={{padding:'18px 22px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div><div style={{fontSize:16, fontWeight:700, color:T.ink}}>Reclamar cuenta</div><div style={{fontSize:11.5, color:T.ink3, marginTop:2}}>Un solo mail con todo lo que debe · sale de admin@somosmagma.com</div></div>
        <button onClick={onClose} style={{border:'none', background:'transparent', fontSize:22, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
      </div>
      <div style={{padding:'16px 22px'}}>
        <label style={lblV2}>Cliente / agencia</label>
        <select value={ag} onChange={e=>{ setAg(e.target.value); cargar(e.target.value) }} style={{...inpV2, marginBottom:14}}>
          <option value="">Elegí a quién reclamar…</option>
          {agenciasPendientes.map(a=><option key={a.nombre} value={a.nombre}>{a.nombre} — {a.n} pendiente{a.n===1?'':'s'} · {fmtM(a.monto)}</option>)}
        </select>

        {loading && <div style={{padding:'24px', textAlign:'center', color:T.ink3, fontSize:13}}>Buscando lo pendiente…</div>}

        {data && data.pendientes.length===0 && <div style={{fontSize:13, color:T.pos, padding:'10px 0'}}>No hay facturas pendientes de {ag} ✓</div>}

        {data && data.pendientes.length>0 && <>
          <div style={{background:T.surfaceAlt, border:`1px solid ${T.border}`, borderRadius:10, padding:'12px 14px', marginBottom:14}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8}}>
              <span style={{fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3}}>{elegidas.length} de {items.length} · {vencSel>0?`${vencSel} vencidas`:'ninguna vencida'}</span>
              <span style={{fontSize:16, fontWeight:700, fontFamily:MONO, color:T.brand}}>{fmt(totalSel)}</span>
            </div>
            <div style={{display:'flex', gap:6, marginBottom:8, flexWrap:'wrap'}}>
              <button onClick={()=>setItems(a=>a.map(x=>({...x,sel:x.diasVencida>0})))} style={{...miniBtn, padding:'4px 10px', fontSize:11}}>Solo vencidas</button>
              <button onClick={()=>setItems(a=>a.map(x=>({...x,sel:true})))} style={{...miniBtn, padding:'4px 10px', fontSize:11}}>Todas</button>
              <button onClick={()=>setItems(a=>a.map(x=>({...x,sel:false})))} style={{...miniBtn, padding:'4px 10px', fontSize:11}}>Ninguna</button>
            </div>
            {items.map((p,i)=>(
              <label key={i} style={{display:'flex', alignItems:'center', gap:9, padding:'5px 0', fontSize:12, borderTop:i?`1px solid ${T.border}`:'none', cursor:'pointer', opacity:p.sel?1:0.5}}>
                <input type="checkbox" checked={p.sel} onChange={()=>setItems(a=>a.map((x,j)=>j===i?{...x,sel:!x.sel}:x))}/>
                <span style={{flex:1, minWidth:0, color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                  {p.nroFactura?`Fc ${p.nroFactura}`:`#${p.nro}`} · {p.proyecto||'—'}
                  {p.sinNumero && <span style={{color:T.warn, fontWeight:600}}> · falta N°</span>}
                  {p.enPlazo && <span style={{color:T.ink3}}> · en plazo, vence en {p.diasParaVencer}d</span>}
                </span>
                <span style={{fontFamily:MONO, color:p.diasVencida>0?T.brand:T.ink2, fontWeight:p.diasVencida>0?600:400, flexShrink:0}}>{fmt(p.monto)}{p.diasVencida>0?` · ${p.diasVencida}d`:''}</span>
              </label>
            ))}
          </div>
          {(data.enPlazo>0 || data.sinNumero>0) && <div style={{fontSize:12, color:T.ink2, background:T.surfaceAlt, border:`1px solid ${T.border}`, borderRadius:8, padding:'9px 12px', marginBottom:14, lineHeight:1.5}}>
            {data.enPlazo>0 && <div><b style={{color:T.ink}}>{data.enPlazo} {data.enPlazo===1?'factura todavía no venció':'facturas todavía no vencieron'}</b> — vienen destildadas (están en plazo). Tildalas si igual las querés incluir.</div>}
            {data.sinNumero>0 && <div style={{marginTop:data.enPlazo>0?5:0}}><b style={{color:T.warn}}>{data.sinNumero} sin N° de factura cargado</b> — la factura está emitida, falta anotar el número en el sheet. Se reclaman igual.</div>}
          </div>}

          <label style={lblV2}>Para</label>
          <div style={{display:'flex', flexDirection:'column', gap:6, marginBottom:8}}>
            {dests.length===0 && <div style={{fontSize:12, color:T.ink3}}>Sin contactos cargados para {ag}. Agregá un mail abajo.</div>}
            {dests.map((d,i)=>(
              <label key={i} style={{display:'flex', alignItems:'center', gap:9, fontSize:13, color:T.ink, cursor:'pointer', padding:'7px 10px', borderRadius:8, border:`1px solid ${d.sel?T.ink:T.border}`, background:d.sel?T.surfaceAlt:T.surface}}>
                <input type="checkbox" checked={d.sel} onChange={()=>toggle(i)}/>
                <span style={{flex:1, minWidth:0}}><span style={{fontFamily:MONO, fontSize:12.5}}>{d.mail}</span> <span style={{fontSize:10.5, color:T.ink3}}>· {d.match||d.nombre}</span></span>
              </label>
            ))}
          </div>
          <div style={{display:'flex', gap:8, marginBottom:14}}>
            <input value={nuevo} onChange={e=>setNuevo(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();agregar()}}} placeholder="Agregar otro mail…" style={{...inpV2, flex:1}}/>
            <button onClick={agregar} style={{...miniBtn, padding:'8px 14px'}}>+ Agregar</button>
          </div>
          <label style={lblV2}>Asunto</label>
          <input value={asunto} onChange={e=>{setTocado(true); setAsunto(e.target.value)}} style={{...inpV2, marginBottom:12}}/>
          <label style={lblV2}>Mensaje</label>
          <textarea value={cuerpo} onChange={e=>{setTocado(true); setCuerpo(e.target.value)}} rows={14} style={{...inpV2, resize:'vertical', fontFamily:MONO, fontSize:12, lineHeight:1.5}}/>
        </>}
      </div>
      <div style={{padding:'14px 22px', borderTop:`1px solid ${T.border}`, display:'flex', gap:10, justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{padding:'9px 18px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:500, cursor:'pointer'}}>Cancelar</button>
        <button onClick={enviar} disabled={saving||!elegidas.length} style={{padding:'9px 22px', borderRadius:9, border:'none', background:T.brand, color:'#fff', fontSize:13.5, fontWeight:600, cursor:(saving||!data)?'default':'pointer', opacity:(saving||!elegidas.length)?0.5:1}}>{saving?'Enviando…':`Enviar reclamo${elegidas.length?' · '+fmtM(totalSel):''}`}</button>
      </div>
    </div>
  </div>
}

function MailFacturaModal({ f, onClose, onSent, showToast }){
  const num=f['N° Presupuesto']
  const [loading,setLoading]=useState(true)
  const [dests,setDests]=useState([])   // {mail, nombre, match, sel}
  const [nuevo,setNuevo]=useState('')
  const [asunto,setAsunto]=useState('')
  const [cuerpo,setCuerpo]=useState('')
  const [saving,setSaving]=useState(false)
  const [adjPDF,setAdjPDF]=useState(false)   // el PDF va pegado al mail (no como link de Drive)
  const [agencia,setAgencia]=useState('')      // para aprender el mail de facturación de la agencia
  const [mailFactAg,setMailFactAg]=useState('')
  const [recordar,setRecordar]=useState(false)
  useEffect(()=>{ let vivo=true; (async()=>{
    try{ const r=await fetch('/api/factura-prep-mail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({presupuestoNum:num})}); const j=await r.json()
      if(!vivo) return
      if(!j.ok){ showToast(j.error||'Error preparando el mail','err'); onClose(); return }
      // Solo vienen tildados los sugeridos (contacto del presu + facturación de la agencia).
      // El resto de la agencia queda desmarcado: la factura no va en copia a todo el mundo.
      setDests((j.destinatarios||[]).map(d=>({...d, sel:!!d.sugerido})))
      setAdjPDF(!!j.adjuntarPDF)
      setAgencia(j.agenciaNombre||''); setMailFactAg(j.mailFacturacionAgencia||'')
      setAsunto(j.asunto||''); setCuerpo(j.cuerpo||''); setLoading(false)
    }catch(e){ if(vivo){ showToast('Error de conexión','err'); onClose() } }
  })(); return ()=>{vivo=false} },[])  // eslint-disable-line
  const toggle=i=>setDests(d=>d.map((x,j)=>j===i?{...x,sel:!x.sel}:x))
  const agregar=()=>{ const m=nuevo.trim(); if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)){ showToast('Mail inválido','err'); return } if(dests.find(d=>d.mail.toLowerCase()===m.toLowerCase())){ setNuevo(''); return } setDests(d=>[...d,{mail:m,nombre:'agregado',match:'agregado a mano',sel:true}]); setNuevo('') }
  const seleccionados=dests.filter(d=>d.sel).map(d=>d.mail)
  // Si mandás la factura a alguien que no es el contacto del presu y la agencia no tiene
  // mail de facturación cargado, ofrecemos guardarlo: la próxima ya viene sugerido.
  const candidatoFact=(!mailFactAg && agencia) ? (dests.find(d=>d.sel && !/contacto del presu/i.test(d.match||''))?.mail||'') : ''

  // Subir el PDF sin salir del modal: si falta, el mail sale sin adjunto y no sirve de nada
  const [subiendo,setSubiendo]=useState(false)
  function subirPDF(){
    const input=document.createElement('input'); input.type='file'; input.accept='application/pdf,image/*'
    input.onchange=async()=>{
      const file=input.files?.[0]; if(!file) return
      const nro=f['Nro de Factura']||'', nl=nro.toLowerCase()
      const entidad=nl.includes('sofia')?'Sofia':nl.includes('lulu')?'Lulu':(nl.includes('ef-')||nl.includes('efectivo'))?'Efectivo':'SRL'
      const fe=parseD(f['Fecha emision'])||new Date()
      const fd=new FormData()
      fd.append('file', file, file.name); fd.append('entidad', entidad); fd.append('nroFactura', nro)
      fd.append('presupuestoNum', num||''); fd.append('mes', String(fe.getMonth()+1)); fd.append('anio', String(fe.getFullYear()))
      setSubiendo(true)
      try{ const r=await fetch('/api/factura-upload',{method:'POST',body:fd}); const j=await r.json()
        if(!j.ok){ showToast(j.error||'Error subiendo el PDF','err'); setSubiendo(false); return }
        setAdjPDF(true); setSubiendo(false); showToast('PDF subido ✓ ahora va adjunto')
        // El cuerpo cambia según haya PDF o no: lo re-armamos
        try{ const rp=await fetch('/api/factura-prep-mail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({presupuestoNum:num})}); const jp=await rp.json(); if(jp.ok&&jp.cuerpo) setCuerpo(jp.cuerpo) }catch(e){}
        onSent&&onSent()
      }catch(e){ showToast('Error de conexión','err'); setSubiendo(false) }
    }
    input.click()
  }
  async function enviar(){
    if(!seleccionados.length){ showToast('Elegí al menos un destinatario','err'); return }
    setSaving(true)
    try{ const r=await fetch('/api/factura-enviar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:seleccionados, asunto, cuerpo, presupuestoNum:num, adjuntarPDF:adjPDF})}); const j=await r.json()
      if(!j.ok){ showToast(j.error||'No se pudo enviar','err'); setSaving(false); return }
      // Aprender el mail de facturación de la agencia (queda en la solapa AGENCIAS)
      if(recordar && candidatoFact){
        try{ await fetch('/api/agencia-upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:agencia, mailFact:candidatoFact})}) }catch(e){}
      }
      showToast(`Mail enviado a ${seleccionados.length} ${seleccionados.length===1?'destinatario':'destinatarios'}${j.adjunto?' con la factura adjunta':''} ✓`); onSent&&onSent(); onClose()
    }catch(e){ showToast('Error de conexión','err'); setSaving(false) }
  }
  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:910, display:'flex', justifyContent:'center', overflowY:'auto', padding:'40px 20px'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:560, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)', height:'fit-content'}}>
      <div style={{padding:'18px 22px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div><div style={{fontSize:16, fontWeight:700, color:T.ink}}>Mandar factura por mail</div><div style={{fontSize:11.5, color:T.ink3, marginTop:2}}>#{num} · {f['Proyecto']||f['Cliente']||''} · sale de admin@somosmagma.com</div></div>
        <button onClick={onClose} style={{border:'none', background:'transparent', fontSize:22, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
      </div>
      {loading ? <div style={{padding:'40px', textAlign:'center', color:T.ink3, fontSize:13}}>Preparando…</div> : <>
      <div style={{padding:'16px 22px'}}>
        <label style={lblV2}>Para</label>
        <div style={{display:'flex', flexDirection:'column', gap:6, marginBottom:8}}>
          {dests.length===0 && <div style={{fontSize:12, color:T.ink3}}>No hay contactos sugeridos para esta agencia. Agregá un mail abajo.</div>}
          {dests.map((d,i)=>(
            <span key={i}>
              {/* Separador: de acá para abajo son contactos de la agencia que NO van tildados */}
              {i>0 && !d.sugerido && dests[i-1].sugerido &&
                <div style={{fontSize:10.5, color:T.ink3, textTransform:'uppercase', letterSpacing:0.4, margin:'10px 0 6px'}}>Otros contactos de la agencia — tildá solo si corresponde</div>}
              <label style={{display:'flex', alignItems:'center', gap:9, fontSize:13, color:T.ink, cursor:'pointer', padding:'7px 10px', borderRadius:8, border:`1px solid ${d.sel?T.ink:T.border}`, background:d.sel?T.surfaceAlt:T.surface, opacity:(!d.sugerido&&!d.sel)?0.72:1}}>
                <input type="checkbox" checked={d.sel} onChange={()=>toggle(i)}/>
                <span style={{flex:1, minWidth:0}}><span style={{fontFamily:MONO, fontSize:12.5}}>{d.mail}</span> <span style={{fontSize:10.5, color:T.ink3}}>· {d.match||d.nombre}</span></span>
              </label>
            </span>
          ))}
        </div>
        <div style={{display:'flex', gap:8, marginBottom:16}}>
          <input value={nuevo} onChange={e=>setNuevo(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();agregar()}}} placeholder="Agregar otro mail…" style={{...inpV2, flex:1}}/>
          <button onClick={agregar} style={{...miniBtn, padding:'8px 14px'}}>+ Agregar</button>
        </div>
        {candidatoFact && <label style={{display:'flex', alignItems:'center', gap:8, fontSize:12, color:T.ink2, marginBottom:14, cursor:'pointer'}}>
          <input type="checkbox" checked={recordar} onChange={e=>setRecordar(e.target.checked)}/>
          <span>Guardar <b style={{fontFamily:MONO, fontSize:11.5}}>{candidatoFact}</b> como mail de facturación de {agencia} (la próxima ya viene sugerido)</span>
        </label>}
        {/* El PDF viaja adjunto al mail. Con link de Drive el cliente caía en "solicitar acceso". */}
        {adjPDF
          ? <div style={{display:'flex', alignItems:'center', gap:8, padding:'9px 12px', borderRadius:9, background:T.posSoft, border:`1px solid ${T.pos}33`, marginBottom:16, fontSize:12.5, color:T.pos}}>
              📎 <span style={{color:T.ink}}>La factura va <b>adjunta</b> al mail{f['Nro de Factura']?` (Factura ${f['Nro de Factura']}.pdf)`:''} — el cliente la abre sin pedir acceso.</span>
            </div>
          : <div style={{padding:'11px 12px', borderRadius:9, background:'#FFF7E8', border:`1px solid ${T.warn}33`, marginBottom:16, fontSize:12.5, color:T.ink, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
              <span style={{flex:1, minWidth:180}}>⚠ Esta factura todavía no está cargada: el mail saldría <b>sin adjunto</b>.</span>
              <button onClick={subirPDF} disabled={subiendo} style={{padding:'8px 14px', borderRadius:8, border:'none', background:T.ink, color:'#fff', fontSize:12.5, fontWeight:600, cursor:subiendo?'default':'pointer', opacity:subiendo?0.6:1}}>{subiendo?'Subiendo…':'📎 Cargar la factura'}</button>
            </div>}
        <label style={lblV2}>Asunto</label>
        <input value={asunto} onChange={e=>setAsunto(e.target.value)} style={{...inpV2, marginBottom:12}}/>
        <label style={lblV2}>Mensaje</label>
        <textarea value={cuerpo} onChange={e=>setCuerpo(e.target.value)} rows={11} style={{...inpV2, fontFamily:'inherit', lineHeight:1.5, resize:'vertical'}}/>
      </div>
      <div style={{padding:'14px 22px', borderTop:`1px solid ${T.border}`, display:'flex', gap:10, justifyContent:'space-between', alignItems:'center'}}>
        <span style={{fontSize:11.5, color:T.ink3}}>{seleccionados.length} destinatario{seleccionados.length!==1?'s':''}{adjPDF?' · con factura adjunta':''}</span>
        <div style={{display:'flex', gap:10}}>
          <button onClick={onClose} style={{padding:'9px 18px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:500, cursor:'pointer'}}>Cancelar</button>
          <button onClick={enviar} disabled={saving||!seleccionados.length} style={{padding:'9px 22px', borderRadius:9, border:'none', background:(saving||!seleccionados.length)?T.ink3:T.brand, color:'#fff', fontSize:13.5, fontWeight:600, cursor:(saving||!seleccionados.length)?'default':'pointer'}}>{saving?'Enviando…':(adjPDF?'✉ Enviar con la factura':'✉ Enviar')}</button>
        </div>
      </div>
      </>}
    </div>
  </div>
}

function YaCobradaModal({x, onClose, onConfirm}){
  const presupuestado=Math.round(x.pendiente)
  const [monto,setMonto]=useState(String(presupuestado))
  const [saving,setSaving]=useState(false)
  const [yaCobrada,setYaCobrada]=useState(true)
  const evDef = x.p['Fecha Evento']||''
  const [fEnv,setFEnv]=useState(evDef)
  const [fCob,setFCob]=useState(evDef)
  const real=parseFloat(monto)||0
  const dif=real-presupuestado
  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:910, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'70px 20px'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:430, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.15)'}}>
      <div style={{padding:'18px 22px', borderBottom:`1px solid ${T.border}`}}>
        <div style={{fontSize:16, fontWeight:700, color:T.ink}}>{yaCobrada?'Marcar como ya facturada y cobrada':'Marcar como ya facturada (sin cobrar)'}</div>
        <div style={{fontSize:12, color:T.ink3, marginTop:2}}>#{x.p['Columna 1']} · {x.p['Proyecto']||x.p['Cliente']||''}</div>
      </div>
      <div style={{padding:'20px 22px'}}>
        <label style={lblV2}>{yaCobrada?'¿Cuánto cobraste en realidad? (neto sin IVA)':'¿Por cuánto la facturaste? (neto sin IVA)'}</label>
        <input type="number" value={monto} onChange={e=>setMonto(e.target.value)} autoFocus style={{...inpV2, textAlign:'right', fontFamily:MONO, fontSize:16, marginBottom:8}}/>
        <div style={{fontSize:11.5, color:T.ink3}}>Presupuestado: <span style={{fontFamily:MONO}}>{fmt(presupuestado)}</span>{dif!==0 && <span style={{color:dif>0?T.pos:T.brand, fontWeight:600}}> · {dif>0?'+':''}{fmt(dif)} {dif>0?'de más':'de menos'}</span>}</div>
        <label style={{display:'flex', gap:9, alignItems:'flex-start', fontSize:13, color:T.ink2, cursor:'pointer', marginTop:14, background:yaCobrada?T.surfaceAlt:T.warnSoft, border:`1px solid ${yaCobrada?T.border:T.warn}`, borderRadius:10, padding:'10px 12px'}}>
          <input type="checkbox" checked={yaCobrada} onChange={e=>setYaCobrada(e.target.checked)} style={{marginTop:2}}/>
          <span><strong style={{color:T.ink}}>Ya la cobré también.</strong> Si la <strong>destildás</strong>, queda registrada como <strong>facturada pero SIN cobrar</strong> (aparece pendiente de cobro, no la da por pagada).</span>
        </label>
        <div style={{display:'flex', gap:10, marginTop:12}}>
          <div style={{flex:1}}>
            <label style={{...lblV2, fontSize:11}}>Fecha en que la enviaste</label>
            <input value={fEnv} onChange={e=>setFEnv(e.target.value)} placeholder="DD/MM/AAAA" style={{...inpV2, fontFamily:MONO, fontSize:13}}/>
          </div>
          {yaCobrada && <div style={{flex:1}}>
            <label style={{...lblV2, fontSize:11}}>Fecha en que la cobraste</label>
            <input value={fCob} onChange={e=>setFCob(e.target.value)} placeholder="DD/MM/AAAA" style={{...inpV2, fontFamily:MONO, fontSize:13}}/>
          </div>}
        </div>
        <div style={{fontSize:11, color:T.ink3, marginTop:6}}>Por defecto va la fecha del evento — <strong style={{color:T.brand}}>corregí con las fechas reales</strong> (si no, el "cobrado a tiempo" sale mal).</div>
        <div style={{fontSize:11.5, color:T.ink3, marginTop:12, background:T.surfaceAlt, borderRadius:8, padding:'9px 11px'}}>No toca el saldo de ninguna cuenta (es histórico). El presupuesto y el staff quedan intactos — esto solo registra la factura.</div>
      </div>
      <div style={{padding:'16px 22px', borderTop:`1px solid ${T.border}`, display:'flex', gap:10, justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{padding:'9px 18px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:500, cursor:'pointer'}}>Cancelar</button>
        <button onClick={()=>{setSaving(true); onConfirm(x, Math.round(real), yaCobrada, fEnv, fCob)}} disabled={saving||real<=0} style={{padding:'9px 20px', borderRadius:9, border:'none', background:(saving||real<=0)?T.ink3:T.pos, color:'#fff', fontSize:13, fontWeight:600, cursor:(saving||real<=0)?'default':'pointer'}}>{saving?'Guardando…':'Confirmar'}</button>
      </div>
    </div>
  </div>
}

// Editar a mano las fechas de una factura (envío / cobro). Para notas de crédito,
// facturas consolidadas (Austral) o cualquier corrección. Usa el endpoint genérico factura-editar.
function EditarFechasModal({f, onClose, onRefresh, showToast}){
  const num=f['N° Presupuesto']
  const [env,setEnv]=useState(f['Fecha enviada']||'')
  const [cob,setCob]=useState(f['Fecha cobro']||'')
  const [saving,setSaving]=useState(false)
  const dias=(()=>{ const e=parseD(env), c=parseD(cob); if(!e||!c) return null; return Math.floor((c-e)/864e5) })()
  async function guardar(){
    const cambios={}
    if((env||'')!==(f['Fecha enviada']||'')) cambios['Fecha enviada']=env
    if((cob||'')!==(f['Fecha cobro']||'')) cambios['Fecha cobro']=cob
    if(!Object.keys(cambios).length){ showToast('No hay cambios','err'); return }
    setSaving(true)
    try{
      const r=await fetch('/api/factura-editar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ presupuestoNum:String(num), cambios })})
      const j=await r.json(); if(j&&j.error){ showToast(j.error,'err'); setSaving(false); return }
      showToast(`#${num} · fechas actualizadas ✓`); onClose(); if(onRefresh) onRefresh()
    }catch(e){ showToast('Error de conexión','err'); setSaving(false) }
  }
  const inp={width:'100%', fontSize:15, fontFamily:MONO, color:T.ink, border:`1px solid ${T.border}`, borderRadius:10, padding:'10px 12px', outline:'none', boxSizing:'border-box'}
  const lbl={fontSize:11, textTransform:'uppercase', letterSpacing:0.4, color:T.ink3, fontWeight:600, marginBottom:6, display:'block'}
  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.35)', zIndex:900, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'60px 20px'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:420, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.15)'}}>
      <div style={{padding:'18px 22px', borderBottom:`1px solid ${T.border}`}}><div style={{fontSize:16, fontWeight:700, color:T.ink}}>Editar fechas</div><div style={{fontSize:12, color:T.ink3, marginTop:2, fontFamily:MONO}}>#{num} · {f['Proyecto']||f['Cliente']||''}</div></div>
      <div style={{padding:'20px 22px'}}>
        <div style={{marginBottom:16}}>
          <label style={lbl}>Fecha enviada (cuándo salió la factura)</label>
          <input value={env} onChange={e=>setEnv(e.target.value)} placeholder="DD/MM/AAAA" style={inp}/>
        </div>
        <div>
          <label style={lbl}>Fecha cobro (cuándo la pagaron)</label>
          <input value={cob} onChange={e=>setCob(e.target.value)} placeholder="DD/MM/AAAA" style={inp}/>
        </div>
        <div style={{fontSize:12, color:dias!=null?(dias<=30?T.pos:T.brand):T.ink3, marginTop:12, fontWeight:dias!=null?600:400}}>
          {dias!=null ? `Tardó ${dias} días en cobrarse ${dias<=30?'· a tiempo ✓':'· pasó los 30 días'}` : 'Cargá las dos fechas para ver los días de cobro.'}
        </div>
      </div>
      <div style={{display:'flex', gap:10, padding:'0 22px 20px'}}>
        <button onClick={onClose} style={{...miniBtn, flex:1, padding:'11px'}}>Cancelar</button>
        <button onClick={guardar} disabled={saving} style={{...miniBtn, flex:2, padding:'11px', background:T.brand, color:'#fff', border:'none', opacity:saving?0.6:1}}>{saving?'Guardando…':'Guardar'}</button>
      </div>
    </div>
  </div>
}

function CobroModal({f, cuentas, onClose, onRefresh, showToast}){
  const total=parseMonto(f['Precio FINAL'])
  const cuentaOpts=[...new Set((cuentas||[]).map(c=>c['Nombre']).filter(Boolean))]
  const [cuenta,setCuenta]=useState(cuentaOpts[0]||'')
  const [forma,setForma]=useState('Transferencia')
  const [reservarIVA,setReservarIVA]=useState(String(f['Tipo de Factura']||'').toUpperCase()==='A')
  const [historico,setHistorico]=useState(false)  // ya cobrada hace tiempo: marcar sin tocar saldo
  const [parcial,setParcial]=useState(false)  // cobro parcial: registra parte y deja la factura pendiente por el resto
  const [montoCobrado,setMontoCobrado]=useState(String(Math.round(total)))  // lo que REALMENTE entró (editable)
  const [saving,setSaving]=useState(false)
  const num=f['N° Presupuesto']
  const real=Math.round(parseFloat(montoCobrado)||0)
  const dif=real-Math.round(total)

  async function cobrar(){
    if(!historico && !cuenta){ showToast('Elegí en qué cuenta entra','err'); return }
    if(real<=0){ showToast('Poné el monto cobrado','err'); return }
    const msg = parcial
      ? `Registrar COBRO PARCIAL de #${num} por ${fmt(real)}${historico?' (histórico)':` en ${cuenta}`}.\nLa factura queda PENDIENTE por el resto (${fmt(Math.round(total)-real)}). ¿Confirmás?`
      : historico
      ? `Marcar #${num} como COBRADA (cobro histórico) por ${fmt(real)}.\nNO suma saldo a ninguna cuenta ni reserva IVA — solo deja la factura como cobrada.\n\n¿Confirmás?`
      : `Marcar #${num} como COBRADA por ${fmt(real)} en ${cuenta}. Esto suma ese monto a la cuenta${reservarIVA?' y reserva el IVA':''}. ¿Confirmás?`
    if(!window.confirm(msg)) return
    setSaving(true)
    try{ const r=await fetch('/api/factura-cobro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ nroPresupuesto:String(num), tipoCobro:parcial?'parcial':'total', monto:real, cuentaDestino:historico?'':cuenta, formaPago:historico?'Histórico':forma, retGanancias:0, retIIBB:0, retIVA:0, comision:0, fechaCobro:`${new Date().getDate()}/${new Date().getMonth()+1}/${new Date().getFullYear()}`, reservarIVA:historico?false:reservarIVA, historico })})
      const j=await r.json(); if(j&&j.error){showToast(j.error,'err');setSaving(false);return}
      showToast(`#${num} ${parcial?`cobro parcial de ${fmt(real)} ✓ (queda ${fmt(Math.round(total)-real)})`:'cobrada ✓'}`); onClose(); if(onRefresh) onRefresh()
    }catch(e){ showToast('Error de conexión','err'); setSaving(false) }
  }

  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.35)', zIndex:900, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'60px 20px'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:440, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.15)'}}>
      <div style={{padding:'18px 22px', borderBottom:`1px solid ${T.border}`}}><div style={{fontSize:16, fontWeight:700, color:T.ink}}>Registrar cobro</div><div style={{fontSize:12, color:T.ink3, marginTop:2, fontFamily:MONO}}>#{num} · {f['Proyecto']||f['Cliente']||''}</div></div>
      <div style={{padding:'20px 22px'}}>
        <div style={{textAlign:'center', marginBottom:18}}>
          <div style={{fontSize:11, textTransform:'uppercase', letterSpacing:0.4, color:T.ink3, fontWeight:600, marginBottom:6}}>Monto cobrado (lo que realmente entró)</div>
          <input type="number" value={montoCobrado} onChange={e=>setMontoCobrado(e.target.value)} style={{width:'100%', textAlign:'center', fontSize:28, fontWeight:700, fontFamily:MONO, color:T.pos, border:`1px solid ${T.border}`, borderRadius:10, padding:'8px 6px', outline:'none'}}/>
          <div style={{fontSize:11, color:T.ink3, marginTop:5}}>Facturado: {fmt(total)}{dif!==0 && <span style={{color:dif>0?T.pos:T.warn, fontWeight:600}}> · {dif>0?'+':''}{fmt(dif)} {dif<0?'(retenciones / cobraste menos)':'(cobraste más)'}</span>}</div>
        </div>
        <label style={{display:'flex', gap:9, alignItems:'flex-start', fontSize:13, color:T.ink2, cursor:'pointer', background:parcial?T.brandSoft:T.surfaceAlt, border:`1px solid ${parcial?T.brand:T.border}`, borderRadius:10, padding:'10px 12px', marginBottom:14}}>
          <input type="checkbox" checked={parcial} onChange={e=>setParcial(e.target.checked)} style={{marginTop:2}}/>
          <span><strong style={{color:T.ink}}>Cobro parcial (adelanto)</strong> — cobraste solo una parte. La factura <strong>queda pendiente</strong> por el resto (no la da por cobrada del todo).{parcial && real>0 && real<Math.round(total) && <span style={{display:'block', marginTop:3, color:T.brand, fontWeight:600}}>Queda pendiente: {fmt(Math.round(total)-real)}</span>}</span>
        </label>
        <label style={{display:'flex', gap:9, alignItems:'flex-start', fontSize:13, color:T.ink2, cursor:'pointer', background:historico?T.warnSoft:T.surfaceAlt, border:`1px solid ${historico?T.warn:T.border}`, borderRadius:10, padding:'10px 12px', marginBottom:14}}>
          <input type="checkbox" checked={historico} onChange={e=>setHistorico(e.target.checked)} style={{marginTop:2}}/>
          <span><strong style={{color:T.ink}}>Cobro histórico</strong> — ya la cobraste hace tiempo. Solo la marca como cobrada, <strong>no suma a ninguna cuenta</strong> ni reserva IVA. (Para reconciliar facturas viejas.)</span>
        </label>
        {!historico && <>
        <label style={lblV2}>Entra en la cuenta</label>
        <select value={cuenta} onChange={e=>setCuenta(e.target.value)} style={{...inpV2, marginBottom:13}}>{cuentaOpts.length===0&&<option value="">Sin cuentas</option>}{cuentaOpts.map(c=><option key={c} value={c}>{c}</option>)}</select>
        <label style={lblV2}>Forma de pago</label>
        <select value={forma} onChange={e=>setForma(e.target.value)} style={{...inpV2, marginBottom:13}}>{['Transferencia','eCheq','Efectivo'].map(x=><option key={x} value={x}>{x}</option>)}</select>
        <label style={{display:'flex', gap:9, alignItems:'center', fontSize:13, color:T.ink2, cursor:'pointer'}}><input type="checkbox" checked={reservarIVA} onChange={e=>setReservarIVA(e.target.checked)}/> Reservar IVA (factura A)</label>
        </>}
      </div>
      <div style={{padding:'16px 22px', borderTop:`1px solid ${T.border}`, display:'flex', gap:10, justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{padding:'9px 18px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:500, cursor:'pointer'}}>Cancelar</button>
        <button onClick={cobrar} disabled={saving} style={{padding:'9px 20px', borderRadius:9, border:'none', background:T.pos, color:'#fff', fontSize:13, fontWeight:600, cursor:saving?'default':'pointer', opacity:saving?0.6:1}}>{saving?'Registrando…':'Confirmar cobro'}</button>
      </div>
    </div>
  </div>
}

// ============================ PAGOS STAFF ============================
function PagosStaff({data, onRefresh, showToast, nav, clearNav}){
  const proyectos=data.proyectos||[], rrhh=data.rrhh||[], pagosPersistidos=data.pagosStaff||[]
  const now=new Date()
  const prevMes=new Date(now.getFullYear(), now.getMonth()-1, 1)  // el 15 se paga el mes anterior
  const [mesIdx,setMesIdx]=useState(prevMes.getMonth()+1)  // 1-12
  const [anio,setAnio]=useState(prevMes.getFullYear())
  const cuentaOpts=[...new Set((data.cuentas||[]).filter(c=>{const a=String(c['Activa']||'').toUpperCase();return a==='SÍ'||a==='SI'||a==='TRUE'||c['Activa']===true}).map(c=>c['Nombre']).filter(Boolean))]
  const [q,setQ]=useState(''), [filtro,setFiltro]=useState('todos'), [open,setOpen]=useState(null), [override,setOverride]=useState({}), [freelEdit,setFreelEdit]=useState(null), [mailModal,setMailModal]=useState(null)
  const [cuentaPago,setCuentaPago]=useState(()=>cuentaOpts.find(c=>/bbva|somos magma/i.test(c))||cuentaOpts[0]||'')
  const [staffModalPS,setStaffModalPS]=useState(null)
  const [selPay,setSelPay]=useState({})  // key -> {persona, t} : selección para pagar en tanda
  const [ivaPersona,setIvaPersona]=useState({})  // nombre -> true : pagar +21% IVA (puntual, para RI que factura con IVA)
  const conIvaDe=persona=>!!ivaPersona[persona.nombre]
  const [respuestas,setRespuestas]=useState(null), [loadingResp,setLoadingResp]=useState(false), [resumenResp,setResumenResp]=useState(null)
  const [savingAdj,setSavingAdj]=useState({}), [savedAdj,setSavedAdj]=useState({})
  async function cargarRespuestas(){ setLoadingResp(true)
    try{ const r=await fetch('/api/pagos-staff-respuestas'); const j=await r.json(); setRespuestas(j&&j.ok?(j.respuestas||[]):[]); setResumenResp(j&&j.ok?j.resumen:null) }
    catch(e){ setRespuestas([]) } setLoadingResp(false) }
  // Agarra la factura adjunta del mail y la guarda en Drive + la linkea al pago (mismo destino que "Subir factura")
  async function guardarAdjunto(m){ const p=lista.find(x=>norm(x.nombre)===norm(m.nombre)); const nros=p?p.trabajos.map(t=>t.nro):[]
    setSavingAdj(s=>({...s,[m.uid]:true}))
    try{ const r=await fetch('/api/pago-staff-guardar-adjunto',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:m.uid, persona:p?p.nombre:m.nombre, mes:mesLabel, nros})})
      const j=await r.json(); if(j&&j.error){ showToast(j.error,'err'); setSavingAdj(s=>{const n={...s};delete n[m.uid];return n}); return }
      setSavedAdj(s=>({...s,[m.uid]:j.link})); showToast(`Factura guardada en Drive ✓${j.filas?` · linkeada a ${p?p.nombre:m.nombre}`:''}`); if(onRefresh) onRefresh()
    }catch(e){ showToast('Error de conexión','err') } setSavingAdj(s=>{const n={...s};delete n[m.uid];return n}) }
  useEffect(()=>{ if(nav?.mod==='pagos'&&nav.q){ setQ(nav.q); setFiltro('todos'); clearNav&&clearNav() } /* eslint-disable-next-line */ },[nav])
  useEffect(()=>{ setSelPay({}) },[mesIdx,anio])  // cambiar de mes limpia la selección
  useEffect(()=>{ cargarRespuestas() /* eslint-disable-next-line */ },[])  // respuestas de freelancers al abrir el módulo

  // proyectos del mes/año por Fecha Evento
  const proyMes=proyectos.filter(p=>esDelMes(p['Fecha Evento'], mesIdx, anio))
  // formato real de la columna "Mes Referencia" del sheet: "06 - junio"
  const mesLabel=`${String(mesIdx).padStart(2,'0')} - ${MESES_LARGO[mesIdx-1].toLowerCase()}`
  const norm=s=>String(s||'').toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").trim()

  // detectar pagado — columnas REALES: Freelancer / N° Presupuesto / Estado (Pagado|SÍ) / Monto Pagado
  const isPagado=(persona,t)=>pagosPersistidos.some(r=>{
    const fre=norm(r['Freelancer']||r['Persona']||r['Nombre']||r['Staff'])
    if(fre!==norm(persona)) return false
    const est=String(r['Estado']||r['Pagado']||'').toUpperCase()
    const pagado=['PAGADO','SÍ','SI','TRUE'].includes(est)||parseMonto(r['Monto Pagado'])>0
    if(!pagado) return false
    const rnro=String(r['N° Presupuesto']||r['N° Proyecto']||r['Nro']||'').trim()
    const tnro=String(t.nro).trim()
    if(rnro&&tnro){
      if(rnro!==tnro) return false
      // mismo proyecto: si ambos tienen servicio, exigir que coincida (pago por trabajo, no por proyecto)
      const rsvc=norm(r['Servicio']), tsvc=norm(t.pedido)
      if(rsvc&&tsvc) return rsvc===tsvc
      return true
    }
    return norm(r['Proyecto'])===norm(t.proyecto)  // fallback: filas migradas sin N°
  })

  // agrupar por persona
  const personas={}
  proyMes.forEach(proy=>{
    const nro=proy['N° presupuesto']||'', proyecto=proy['Proyecto']||proy['Cliente']||'', agencia=proy['Agencia']||'', fechaEvento=proy['Fecha Evento']||''
    for(let j=1;j<=20;j++){ const pedido=proy['Pedido '+j]||(j===1?proy['Pedido']:'')||''; const precio=parseMonto(proy['Precio '+j]||(j===1?proy['Precio']:'')); const staffRaw=String(proy['Staff '+j]||(j===1?proy['Staff']:'')||'').trim()
      if(!staffRaw||staffRaw==='Somos Magma'||!pedido||precio<=0) continue
      const staff=canonStaff(staffRaw), gk=canonKey(staff)
      if(!personas[gk]) personas[gk]={nombre:staff, trabajos:[], total:0, totalPagado:0, totalPendiente:0}
      personas[gk].trabajos.push({nro,proyecto,agencia,pedido,precio,fechaEvento, key:nro+'|'+pedido+'|'+j})
      personas[gk].total+=precio
    }
  })
  // Contar filas PAGADAS por (freelancer|N°|servicio) para manejar trabajos idénticos repetidos
  const esPagRow=r=>{ const e=String(r['Estado']||r['Pagado']||'').toUpperCase(); return ['PAGADO','SÍ','SI','TRUE'].includes(e)||parseMonto(r['Monto Pagado'])>0 }
  // Clave INCLUYE el mes de referencia: un pago de mayo no debe marcar como pagado un trabajo de junio.
  // (Antes ignoraba el mes → mostraba pagado pero el botón desmarcar, que sí filtra por mes, no lo encontraba.)
  const paidCount={}
  pagosPersistidos.forEach(r=>{ if(!esPagRow(r)) return; const k=canonKey(canonStaff(r['Freelancer']||r['Persona']||r['Nombre']))+'|'+norm(r['Mes Referencia']||r['Mes'])+'|'+String(r['N° Presupuesto']||r['N° Proyecto']||'').trim()+'|'+norm(r['Servicio']); paidCount[k]=(paidCount[k]||0)+1 })
  Object.values(personas).forEach(p=>{ const used={}; p.trabajos.forEach(t=>{
    let pag
    if(t.key in override) pag=override[t.key]
    else { const k=canonKey(p.nombre)+'|'+norm(mesLabel)+'|'+String(t.nro).trim()+'|'+norm(t.pedido); const cnt=paidCount[k]||0, u=used[k]||0; pag=u<cnt; if(pag) used[k]=u+1 }
    t.pagado=pag; if(pag)p.totalPagado+=t.precio; else p.totalPendiente+=t.precio
  }) })

  let lista=Object.values(personas).sort((a,b)=>b.total-a.total)
  lista=lista.filter(p=>{ const mq=!q||norm(p.nombre).includes(norm(q)); const mf=filtro==='todos'||(filtro==='pend'&&p.totalPendiente>0)||(filtro==='pag'&&p.totalPendiente===0); return mq&&mf })

  const totalPend=Object.values(personas).reduce((s,p)=>s+p.totalPendiente,0)
  const totalPag=Object.values(personas).reduce((s,p)=>s+p.totalPagado,0)

  const rrhhByName={}; rrhh.forEach(r=>{ rrhhByName[String(r['Nombre Apellido']||r['Nombre']||'').trim()]=r })
  const proyByNum={}; proyectos.forEach(p=>{ proyByNum[String(p['N° presupuesto']||'').trim()]=p })
  const presuByNumPS={}; (data.presupuestos||[]).forEach(p=>{ presuByNumPS[String(p['Columna 1']||'').trim()]=p })
  const rrhhNames=[...new Set(rrhh.map(r=>r['Nombre Apellido']||r['Nombre']).filter(Boolean))].sort()
  const serviciosConocidos=[...new Set([...getSvcs(data).map(s=>s.n), ...(data.listado?.servicios||[])])].filter(Boolean).sort()

  const postPago=(persona,t,pagado)=>{
    const conIva = pagado && conIvaDe(persona)
    const montoPagar = conIva ? Math.round(t.precio*1.21) : t.precio
    const obs = conIva ? `Pago con IVA 21% · neto ${fmt(t.precio)} + IVA ${fmt(Math.round(t.precio*0.21))}` : undefined
    return fetch('/api/pago-staff-toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ mes:mesLabel, persona:persona.nombre, nroProyecto:t.nro, proyecto:t.proyecto, pedido:t.pedido, monto:montoPagar, montoAdeudado:t.precio, fechaEvento:t.fechaEvento, agencia:t.agencia, pagado, cuenta:pagado?cuentaPago:'', observacion:obs })}).then(r=>r.json().catch(()=>({})))
  }

  async function togglePago(persona, t, pagado){
    const k=t.key
    // Volver atrás un pago: pedir confirmación (devuelve la plata a la cuenta).
    if(!pagado){ if(!window.confirm(`¿Volver atrás el pago de "${t.pedido||'este trabajo'}" de ${persona.nombre.split(' ')[0]} por ${fmt(t.precio)}?\n\nVuelve a PENDIENTE y devuelve la plata a la cuenta. ¿Seguro?`)) return }
    setOverride(o=>({...o,[k]:pagado}))  // optimista: se tilda al instante
    try{ const j=await postPago(persona,t,pagado); if(j&&j.error){showToast(j.error,'err'); setOverride(o=>{const n={...o};delete n[k];return n}); return}
      showToast(pagado?`Pagado: ${t.pedido||''}`:'Desmarcado')
      if(onRefresh){ await onRefresh(); setOverride(o=>{const n={...o};delete n[k];return n}) }
    }catch(e){ showToast('Error de conexión','err'); setOverride(o=>{const n={...o};delete n[k];return n}) }
  }

  async function pagarTodo(persona){
    const pend=persona.trabajos.filter(t=>!t.pagado)
    if(!pend.length) return
    const nombre=persona.nombre.split(' ')[0]
    if(!cuentaPago){ showToast('Elegí desde qué cuenta pagás (arriba)','err'); return }
    const conIva=conIvaDe(persona), totalPagar=conIva?Math.round(persona.totalPendiente*1.21):persona.totalPendiente
    const detalle=conIva?`${pend.length} trabajos: neto ${fmt(persona.totalPendiente)} + IVA 21% = ${fmt(totalPagar)}`:`${pend.length} trabajos = ${fmt(persona.totalPendiente)}`
    if(!window.confirm(`Pagar TODO lo de ${nombre} de ${MESES_LARGO[mesIdx-1]}:\n${detalle}\nDesde: ${cuentaPago}\n\n¿Confirmás?`)) return
    setOverride(o=>{const n={...o}; pend.forEach(t=>n[t.key]=true); return n})
    try{
      for(const t of pend){ const j=await postPago(persona,t,true); if(j&&j.error) showToast(`Error en ${t.pedido}: ${j.error}`,'err') }
      showToast(`${nombre}: ${pend.length} trabajos pagados`)
      if(onRefresh){ await onRefresh(); setOverride(o=>{const n={...o}; pend.forEach(t=>delete n[t.key]); return n}) }
    }catch(e){ showToast('Error de conexión','err') }
  }
  async function deshacerTodo(persona){
    const pagados=persona.trabajos.filter(t=>t.pagado)
    if(!pagados.length) return
    const nombre=persona.nombre.split(' ')[0]
    if(!window.confirm(`Volver atrás TODOS los pagos de ${nombre} de ${MESES_LARGO[mesIdx-1]}:\n${pagados.length} trabajos = ${fmt(persona.totalPagado)}\n\nVuelven a PENDIENTE y se devuelve la plata a la cuenta. ¿Seguro?`)) return
    setOverride(o=>{const n={...o}; pagados.forEach(t=>n[t.key]=false); return n})
    try{
      for(const t of pagados){ const j=await postPago(persona,t,false); if(j&&j.error) showToast(`Error en ${t.pedido}: ${j.error}`,'err') }
      showToast(`${nombre}: ${pagados.length} pagos deshechos`)
      if(onRefresh){ await onRefresh(); setOverride(o=>{const n={...o}; pagados.forEach(t=>delete n[t.key]); return n}) }
    }catch(e){ showToast('Error de conexión','err') }
  }
  const selList=Object.values(selPay)
  const selTotal=selList.reduce((s,x)=>s+(conIvaDe(x.persona)?Math.round(x.t.precio*1.21):x.t.precio),0)
  const toggleSel=(persona,t)=>setSelPay(s=>{ const n={...s}; if(n[t.key]) delete n[t.key]; else n[t.key]={persona,t}; return n })
  async function pagarSeleccion(){
    if(!selList.length) return
    if(!cuentaPago){ showToast('Elegí desde qué cuenta pagás','err'); return }
    if(!window.confirm(`Pagar ${selList.length} trabajos = ${fmt(selTotal)}\nDesde: ${cuentaPago}\n\n¿Confirmás?`)) return
    const keys=selList.map(x=>x.t.key)
    setOverride(o=>{const n={...o}; keys.forEach(k=>n[k]=true); return n})
    setSelPay({})
    try{
      for(const {persona,t} of selList){ const j=await postPago(persona,t,true); if(j&&j.error) showToast(`Error en ${t.pedido}: ${j.error}`,'err') }
      showToast(`${keys.length} trabajos pagados desde ${cuentaPago}`)
      if(onRefresh){ await onRefresh(); setOverride(o=>{const n={...o}; keys.forEach(k=>delete n[k]); return n}) }
    }catch(e){ showToast('Error de conexión','err') }
  }
  function mensajeDe(persona){
    const nombre=persona.nombre.split(' ')[0]
    const items=persona.trabajos.filter(t=>!t.pagado).map(t=>`- ${t.pedido} — ${t.proyecto}${t.agencia?` (${t.agencia})`:''}${t.fechaEvento?` [${t.fechaEvento}]`:''}: ${fmt(t.precio)}`).join('\n')
    const tot=persona.trabajos.filter(t=>!t.pagado).reduce((s,t)=>s+t.precio,0)
    return `Hola ${nombre}!\n\nTe paso el detalle de los trabajos de ${MESES_LARGO[mesIdx-1]} para que nos hagas factura:\n\n${items}\n\nTotal: ${fmt(tot)}\n\nCuando tengas la factura lista mandala a admin@somosmagma.com\n\n¡Gracias!`
  }
  function copiarDesc(persona){ navigator.clipboard?.writeText(mensajeDe(persona)); showToast('Mensaje copiado al portapapeles') }
  async function marcarMailEnviado(persona){
    try{ await fetch('/api/pago-staff-mail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({persona:persona.nombre, nros:persona.trabajos.map(t=>t.nro)})}); if(onRefresh) onRefresh() }catch(e){}
  }
  function subirFactura(persona){
    const input=document.createElement('input'); input.type='file'; input.accept='application/pdf,image/*'
    input.onchange=async()=>{ const file=input.files?.[0]; if(!file) return
      const fd=new FormData(); fd.append('file',file,file.name); fd.append('persona',persona.nombre); fd.append('mes',mesLabel); fd.append('nros',persona.trabajos.map(t=>t.nro).join(','))
      showToast('Subiendo factura…')
      try{ const r=await fetch('/api/pago-staff-factura',{method:'POST',body:fd}); const j=await r.json(); if(!j.ok){showToast(j.error||'Error','err');return} showToast('Factura guardada ✓'); if(onRefresh) onRefresh() }
      catch(e){ showToast('Error de conexión','err') }
    }
    input.click()
  }

  return <>
    <PageHead title="Pagos Staff" sub={`${MESES_LARGO[mesIdx-1]} ${anio} · ${lista.length} freelancers`}/>
    <div style={{display:'flex', gap:14, marginBottom:20}}>
      <Hero label="Pendiente de pago" value={fmt(totalPend)} accent={totalPend>0?T.brand:T.pos} sub="este mes"/>
      <Hero label="Ya pagado" value={fmt(totalPag)} sub="este mes" subStrong="" />
    </div>
    {/* Respuestas de freelancers a los mails de pago (lee la casilla admin@somosmagma.com) */}
    <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', marginBottom:14}}>
      <div style={{padding:'11px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:((resumenResp&&resumenResp.enviados>0)||(respuestas&&respuestas.length))?`1px solid ${T.border}`:'none'}}>
        <span style={{fontSize:13, fontWeight:700, color:T.ink}}>📨 Respuestas de freelancers{respuestas&&respuestas.length?` · ${respuestas.filter(m=>!m.leido).length} sin leer`:''}</span>
        <button onClick={cargarRespuestas} disabled={loadingResp} style={{fontSize:11.5, padding:'4px 10px', borderRadius:7, border:`1px solid ${T.border}`, background:T.surface, color:T.ink3, cursor:loadingResp?'default':'pointer'}}>{loadingResp?'Buscando…':'↻ Actualizar'}</button>
      </div>
      {resumenResp && resumenResp.enviados>0 && <div style={{padding:'8px 18px', fontSize:11.5, color:T.ink2, background:T.surfaceAlt, borderBottom:(respuestas&&respuestas.length)?`1px solid ${T.border}`:'none'}}><b style={{fontFamily:MONO}}>{resumenResp.enviados}</b> mails enviados · <b style={{color:T.pos}}>{resumenResp.respondieron}</b> respondieron · <b style={{color:T.warn}}>{resumenResp.sinResponder}</b> sin responder{resumenResp.sinGuardar>0?` · 📎 ${resumenResp.sinGuardar} sin guardar`:''}</div>}
      {respuestas && respuestas.length===0 && !loadingResp && <div style={{padding:'10px 18px', fontSize:12, color:T.ink3}}>Sin respuestas todavía. Cuando un freelancer conteste el mail de pago, aparece acá.</div>}
      {respuestas===null && loadingResp && <div style={{padding:'10px 18px', fontSize:12, color:T.ink3}}>Buscando respuestas en admin@somosmagma.com…</div>}
      {(respuestas||[]).map((m,i)=><div key={i} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 18px', borderTop:i?`1px solid ${T.border}`:'none'}}>
        <span style={{width:7, height:7, borderRadius:7, background:m.leido?'transparent':T.brand, flexShrink:0}}/>
        <span style={{flex:1, minWidth:0}}>
          <span style={{fontSize:13, color:T.ink, fontWeight:m.leido?500:700}}>{m.nombre}{m.adjunto && <span title="Adjuntó factura" style={{marginLeft:7}}>📎</span>}</span>
          <div style={{fontSize:11.5, color:T.ink3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{m.asunto}</div>
        </span>
        {m.adjunto && (savedAdj[m.uid]
          ? <a href={savedAdj[m.uid]} target="_blank" rel="noreferrer" style={{...miniBtn, color:T.pos, borderColor:T.pos, fontSize:11.5}}>📄 en Drive ✓</a>
          : <button onClick={()=>guardarAdjunto(m)} disabled={!!savingAdj[m.uid]} style={{...miniBtn, fontSize:11.5, cursor:savingAdj[m.uid]?'default':'pointer'}}>{savingAdj[m.uid]?'Guardando…':'⬇ Guardar en Drive'}</button>)}
        <a href={`https://mail.google.com/mail/u/0/#search/${encodeURIComponent('subject:('+m.asunto+')')}`} target="_blank" rel="noreferrer" title="Abrir en Gmail" style={{fontSize:12, color:T.ink3, textDecoration:'none', whiteSpace:'nowrap'}}>Gmail ↗</a>
        <span style={{fontSize:11, color:T.ink3, whiteSpace:'nowrap'}}>{m.fecha?new Date(m.fecha).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'}):''}</span>
      </div>)}
    </div>
    <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', marginBottom:14}}>
      <button onClick={()=>{ let m=mesIdx-1,a=anio; if(m<1){m=12;a--} setMesIdx(m);setAnio(a) }} style={navBtn}>←</button>
      <span style={{fontSize:13, fontWeight:600, color:T.ink, minWidth:120, textAlign:'center'}}>{MESES_LARGO[mesIdx-1]} {anio}</span>
      <button onClick={()=>{ let m=mesIdx+1,a=anio; if(m>12){m=1;a++} setMesIdx(m);setAnio(a) }} style={navBtn}>→</button>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar freelancer…" style={{flex:'1 1 200px', minWidth:160, padding:'9px 13px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13, outline:'none'}}/>
      {[['todos','Todos'],['pend','Pendientes'],['pag','Pagados']].map(([k,l])=><button key={k} onClick={()=>setFiltro(k)} style={{padding:'7px 13px', borderRadius:20, fontSize:12, fontWeight:500, cursor:'pointer', border:`1px solid ${filtro===k?T.ink:T.border}`, background:filtro===k?T.ink:T.surface, color:filtro===k?'#fff':T.ink2}}>{l}</button>)}
    </div>
    <div style={{display:'flex', gap:10, alignItems:'center', marginBottom:14}}>
      <span style={{fontSize:12.5, color:T.ink2, fontWeight:500}}>Pagás desde:</span>
      <select value={cuentaPago} onChange={e=>setCuentaPago(e.target.value)} style={{...selectStyle, minWidth:180}}>{cuentaOpts.length===0&&<option value="">Sin cuentas</option>}{cuentaOpts.map(c=><option key={c} value={c}>{c}</option>)}</select>
      <span style={{fontSize:11.5, color:T.ink3}}>queda registrado en cada pago</span>
    </div>

    <div style={{display:'flex', flexDirection:'column', gap:10}}>
      {lista.length===0&&<Empty>Sin freelancers con trabajos este mes</Empty>}
      {lista.map((persona,i)=>{
        const abierto=open===persona.nombre, datos=rrhhByName[persona.nombre.trim()]||{}
        const estado = persona.totalPendiente===0 ? {c:T.pos,l:'Pagado'} : persona.totalPagado>0 ? {c:T.warn,l:'Parcial'} : {c:T.brand,l:'Pendiente'}
        const nrosP=new Set(persona.trabajos.map(t=>String(t.nro).trim()))
        let mailEnv=false, facturaURL=''
        pagosPersistidos.forEach(r=>{ if(norm(r['Freelancer'])===norm(persona.nombre)&&nrosP.has(String(r['N° Presupuesto']||'').trim())){ if(String(r['Mail Enviado']||'').trim())mailEnv=true; if(String(r['Factura']||'').trim())facturaURL=r['Factura'] } })
        return <div key={i} style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
          <div onClick={()=>setOpen(abierto?null:persona.nombre)} style={{display:'flex', alignItems:'center', gap:14, padding:'14px 18px', cursor:'pointer'}}>
            <span style={{width:7,height:7,borderRadius:7,background:estado.c, flexShrink:0}}/>
            <div style={{flex:1, minWidth:0}}><div style={{fontSize:14, fontWeight:600, color:T.ink, display:'flex', alignItems:'center', gap:7, flexWrap:'wrap'}}>{persona.nombre}{mailEnv&&<span style={{fontSize:10, fontWeight:600, color:T.pos, background:T.posSoft, padding:'1px 7px', borderRadius:10}}>✉ enviado</span>}{facturaURL&&<span style={{fontSize:10, fontWeight:600, color:T.pos, background:T.posSoft, padding:'1px 7px', borderRadius:10}}>📄 factura</span>}</div><div style={{fontSize:11.5, color:T.ink3}}>{persona.trabajos.length} trabajos · {estado.l}</div></div>
            <div style={{textAlign:'right'}}><div style={{fontSize:14, fontFamily:MONO, fontWeight:600, color:persona.totalPendiente>0?T.brand:T.ink2}}>{fmt(persona.totalPendiente)}</div><div style={{fontSize:11, color:T.ink3}}>de {fmt(persona.total)}</div></div>
            <div style={{display:'flex', gap:7, alignItems:'center', flexShrink:0}}>
              {persona.totalPendiente>0
                ? <button onClick={e=>{e.stopPropagation();pagarTodo(persona)}} style={{padding:'8px 16px', borderRadius:9, border:'none', background:T.pos, color:'#fff', fontSize:12.5, fontWeight:600, cursor:'pointer'}}>{conIvaDe(persona)?'Pagar todo +IVA':'Pagar todo'}</button>
                : <span style={{padding:'8px 8px', fontSize:12, color:T.pos, fontWeight:600}}>✓ Pagado</span>}
              {persona.totalPagado>0 && <button onClick={e=>{e.stopPropagation();deshacerTodo(persona)}} title="Volver atrás todos los pagos de esta persona este mes" style={{padding:'8px 12px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:12, fontWeight:500, cursor:'pointer'}}>↩ Deshacer</button>}
            </div>
          </div>
          {abierto && <div style={{borderTop:`1px solid ${T.border}`, background:T.surfaceAlt, padding:'12px 18px 16px'}}>
            <div style={{display:'flex', gap:20, flexWrap:'wrap', alignItems:'flex-start', padding:'4px 0 12px', marginBottom:8, borderBottom:`1px solid ${T.border}`}}>
              {[['Rubro',datos['Rubro']],['Mail',datos['Mail']],['Tel',datos['Celular']],['DNI',datos['Dni']],['CUIT',datos['CUIT/CUIL']||datos['CUIT']],['Banco',datos['Banco']],['Alias',datos['Alias']],['CBU',datos['CBU']]].filter(x=>x[1]).map(([k,v])=><div key={k}><div style={{fontSize:9.5, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, fontWeight:600}}>{k}</div><div style={{fontSize:12, color:T.ink, fontFamily:MONO, marginTop:2}}>{v}</div></div>)}
              <div style={{flex:1}}/>
              <button onClick={()=>setFreelEdit({nombre:persona.nombre, datos})} style={{...miniBtn, alignSelf:'center'}}>{datos&&Object.keys(datos).length?'✎ Editar datos':'+ Completar datos'}</button>
            </div>
            {persona.totalPendiente>0 && <div style={{fontSize:11, color:T.ink3, marginBottom:6}}>Tildá los trabajos que vas a pagar (podés mezclar varias personas) y dale <strong style={{color:T.pos}}>Pagar seleccionados</strong> abajo. Cada tanda puede ir a una cuenta distinta.</div>}
            {persona.trabajos.map((t,j)=>{ const seleccionado=!!selPay[t.key]; return (
              <div key={j} style={{display:'flex', alignItems:'center', gap:12, padding:'8px 0', opacity:t.pagado?0.55:1, background:seleccionado?T.posSoft:'transparent', borderRadius:seleccionado?7:0, margin:seleccionado?'0 -8px':0, paddingLeft:seleccionado?8:0, paddingRight:seleccionado?8:0}}>
                <input type="checkbox" checked={t.pagado||seleccionado} onChange={()=>{ if(t.pagado) togglePago(persona,t,false); else toggleSel(persona,t) }} style={{cursor:'pointer'}} title={t.pagado?'Pagado — destildá para desmarcar':'Tildá para incluir en el pago'}/>
                <div style={{flex:1, minWidth:0}}><span style={{fontSize:12.5, color:T.ink}}>{t.pedido}</span> <span style={{fontSize:11.5, color:T.ink3}}>· {t.proyecto} {t.fechaEvento?`· ${t.fechaEvento}`:''}</span>{t.pagado&&<span style={{fontSize:10.5, color:T.pos, marginLeft:6}}>✓ pagado</span>}{seleccionado&&!t.pagado&&<span style={{fontSize:10.5, color:T.pos, fontWeight:600, marginLeft:6}}>a pagar</span>}</div>
                <span style={{fontSize:12.5, fontFamily:MONO, color:T.ink}}>{fmt(t.precio)}</span>
                <button onClick={()=>{ const proy=proyByNum[String(t.nro).trim()]; if(proy) setStaffModalPS({proy, presu:presuByNumPS[String(t.nro).trim()]}); else showToast('No encuentro el proyecto','err') }} title="Editar montos / agregar viáticos en el proyecto" style={{border:'none', background:'transparent', color:T.ink3, cursor:'pointer', fontSize:13, padding:'0 2px'}}>✎</button>
              </div>
            )})}
            {persona.totalPendiente>0 && <div style={{marginTop:10, padding:'9px 11px', borderRadius:8, background:conIvaDe(persona)?T.brandSoft:T.surface, border:`1px solid ${conIvaDe(persona)?T.brand+'40':T.border}`}}>
              <label style={{display:'flex', gap:8, alignItems:'center', fontSize:12.5, color:T.ink2, cursor:'pointer', fontWeight:600}}>
                <input type="checkbox" checked={conIvaDe(persona)} onChange={e=>setIvaPersona(s=>({...s,[persona.nombre]:e.target.checked}))}/>
                Pagar con IVA (+21%) <span style={{fontWeight:400, color:T.ink3}}>— si te factura como Responsable Inscripto</span>
              </label>
              {conIvaDe(persona) && <div style={{fontSize:12, color:T.ink2, marginTop:7, fontFamily:MONO}}>neto {fmt(persona.totalPendiente)} + IVA 21% {fmt(Math.round(persona.totalPendiente*0.21))} = <b style={{color:T.brand}}>{fmt(Math.round(persona.totalPendiente*1.21))}</b></div>}
            </div>}
            <div style={{display:'flex', justifyContent:'flex-end', gap:6, marginTop:10, flexWrap:'wrap'}}>
              <button onClick={()=>copiarDesc(persona)} style={miniBtn}>📋 Copiar mensaje</button>
              <button onClick={()=>setMailModal({persona, datos:rrhhByName[persona.nombre.trim()]||{}})} style={{...miniBtn, background:T.ink, color:'#fff', border:'none'}}>✉ Mandar mail</button>
              {facturaURL
                ? <a href={facturaURL} target="_blank" rel="noreferrer" style={{...miniBtn, color:T.pos, borderColor:T.pos}}>📄 Ver factura</a>
                : <button onClick={()=>subirFactura(persona)} style={miniBtn}>⬆ Subir factura</button>}
            </div>
          </div>}
        </div>
      })}
    </div>
    {freelEdit && <FreelancerModal nombre={freelEdit.nombre} datos={freelEdit.datos||{}} rubrosConocidos={[...new Set(rrhh.flatMap(r=>String(r['Rubro']||'').split(',').map(s=>s.trim())))].filter(Boolean)} onClose={()=>setFreelEdit(null)} onSaved={()=>{ setFreelEdit(null); if(onRefresh) onRefresh() }} showToast={showToast}/>}
    {mailModal && <MailStaffModal persona={mailModal.persona} datos={mailModal.datos} cuentas={data.cuentas||[]} mesNombre={MESES_LARGO[mesIdx-1]} onClose={()=>setMailModal(null)} onSent={()=>marcarMailEnviado(mailModal.persona)} showToast={showToast}/>}
    {staffModalPS && <div onClick={()=>setStaffModalPS(null)} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:900, display:'flex', justifyContent:'center', overflowY:'auto', padding:'40px 20px'}}>
      <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:680, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)', height:'fit-content', overflow:'hidden'}}>
        <div style={{padding:'16px 22px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div><div style={{fontSize:16, fontWeight:700, color:T.ink}}>Editar staff · #{staffModalPS.proy['N° presupuesto']}</div><div style={{fontSize:11.5, color:T.ink3, marginTop:2}}>Corregí montos o agregá líneas (viáticos, horas extra…)</div></div>
          <button onClick={()=>setStaffModalPS(null)} style={{border:'none', background:'transparent', fontSize:22, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
        </div>
        <StaffEditor p={staffModalPS.proy} num={staffModalPS.proy['N° presupuesto']} rrhhNames={rrhhNames} rrhh={rrhh} serviciosConocidos={serviciosConocidos} presu={staffModalPS.presu} onRefresh={onRefresh} showToast={showToast} onClose={()=>setStaffModalPS(null)}/>
      </div>
    </div>}
    {selList.length>0 && <div style={{position:'fixed', left:0, right:0, bottom:0, zIndex:850, padding:'0 16px 14px', pointerEvents:'none'}}>
      <div style={{maxWidth:760, margin:'0 auto', background:T.ink, color:'#fff', borderRadius:14, padding:'12px 16px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', boxShadow:'0 -6px 30px rgba(0,0,0,0.25)', pointerEvents:'auto'}}>
        <div style={{fontSize:13.5}}><strong style={{fontSize:15}}>{selList.length}</strong> {selList.length===1?'trabajo':'trabajos'} · <span style={{fontFamily:MONO, fontWeight:600}}>{fmt(selTotal)}</span></div>
        <div style={{flex:1}}/>
        <span style={{fontSize:12, opacity:0.7}}>Desde:</span>
        <select value={cuentaPago} onChange={e=>setCuentaPago(e.target.value)} style={{padding:'8px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.1)', color:'#fff', fontSize:12.5, outline:'none'}}>{cuentaOpts.length===0&&<option value="">Sin cuentas</option>}{cuentaOpts.map(c=><option key={c} value={c} style={{color:T.ink}}>{c}</option>)}</select>
        <button onClick={()=>setSelPay({})} style={{padding:'8px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', fontSize:12.5, fontWeight:500, cursor:'pointer'}}>Cancelar</button>
        <button onClick={pagarSeleccion} style={{padding:'9px 18px', borderRadius:8, border:'none', background:T.pos, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer'}}>Pagar seleccionados</button>
      </div>
    </div>}
  </>
}

// ============================ FREELANCERS ============================
// Unifica nombres de staff repetidos (misma persona, distintas grafías). Solo UI, no toca datos.
const STAFF_CANON_MAP={juan:'Juan Martin Arauz','juan martin':'Juan Martin Arauz',sofi:'Sofia Maria Grenier Basavilbaso',sofia:'Sofia Maria Grenier Basavilbaso',lulu:'Lucía María Grenier Basavilbaso',lucia:'Lucía María Grenier Basavilbaso',luli:'Lucía María Grenier Basavilbaso',dani:'Daniela Viviana Ayala',tom:'Tomás Halbach',santino:'Santino D’ Angelo','santino d angelo':'Santino D’ Angelo',gaspar:'Gaspar Peñalba',felipe:'Felipe Martinez',felip:'Felipe Martinez',ivan:'Ivan Aranda',pablo:'Pablo Leonel Molanes Araujo',lucas:'Lucas Ignacio Godoy',julian:'Julián Exequiel Pérez',blas:'Blas Lafontaine',mailen:'Mailen Santana',pedro:'Pedro Maddonni',nahuel:'Nahuel David Aguilar',lucho:'Jorge Luis Chavez',chanas:'Luciano Nicolas Scigliotti',luciano:'Luciano Nicolas Scigliotti',tutu:'Martin Nahuel Litman (Tutu)','martin litman':'Martin Nahuel Litman (Tutu)',pocho:'Martín Ponczyk (Pocho)','martin dario ponczyk':'Martín Ponczyk (Pocho)',paz:'Paz Bunge',pachu:'Paz Bunge',clari:'Clara Patti',eli:'Eli Cagliano',andy:'Andrés Julio Verón',gabo:'Gabriel Franco',manu:'Manuel Peñalba',nacho:'Ignacio Bettera',teo:'Mateo Minchilli',martin:'Martin Remedi',diego:'Diego Di Ciurcio','diego bariloche':'Diego Di Ciurcio','diego dc':'Diego Di Ciurcio',juli:'Juli Butteri'}
const canonKey=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/['’´`]/g,'').replace(/\s+/g,' ').trim()
const canonStaff=name=>{ const k=canonKey(name); return STAFF_CANON_MAP[k]||String(name||'').trim() }

function Freelancers({data, nav, clearNav, onRefresh, showToast}){
  const proyectos=data.proyectos||[], rrhh=data.rrhh||[], pagos=data.pagosStaff||[]
  const [q,setQ]=useState(''), [sel,setSel]=useState(null), [fAnio,setFAnio]=useState(''), [fMes,setFMes]=useState(''), [lAnio,setLAnio]=useState(''), [lMes,setLMes]=useState('')
  // Editar datos del freelancer acá mismo (antes solo se podía desde Pagos Staff)
  const [editando,setEditando]=useState(null)
  // Por defecto el panel muestra lo activo/reciente, no todo el histórico
  const [verTodos,setVerTodos]=useState(false)
  useEffect(()=>{ setVerTodos(false) },[sel])
  const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim()
  useEffect(()=>{ if(nav?.mod==='freelancers'&&nav.q){ setQ(nav.q); clearNav&&clearNav() } /* eslint-disable-next-line */ },[nav])

  // "Se le debe" se calcula IGUAL que en Pagos Staff (por persona+mes+N°+servicio),
  // para que coincida exacto y no se duplique con los pagos de años anteriores.
  const mesLab=fe=>{ const d=parseD(fe); return d?`${String(d.getMonth()+1).padStart(2,'0')} - ${MESES_LARGO[d.getMonth()].toLowerCase()}`:'' }
  const esPag=r=>{ const e=String(r['Estado']||'').toLowerCase().trim(); return ['pagado','sí','si','true'].includes(e)||parseMonto(r['Monto Pagado'])>0 }
  const paidCount={}
  pagos.forEach(r=>{ if(!esPag(r))return; const k=canonKey(canonStaff(r['Freelancer']||r['Persona']||r['Nombre']))+'|'+norm(r['Mes Referencia']||r['Mes'])+'|'+String(r['N° Presupuesto']||r['N° Proyecto']||'').trim()+'|'+norm(r['Servicio']); paidCount[k]=(paidCount[k]||0)+1 })
  const stats={}, usedG={}
  proyectos.forEach(p=>{ for(let j=1;j<=20;j++){ const st=String(p['Staff '+j]||(j===1?p['Staff']:'')||'').trim(); const pr=parseMonto(p['Precio '+j]||(j===1?p['Precio']:'')); const ped=p['Pedido '+j]||(j===1?p['Pedido']:'')||''
    if(!st||/somos magma|^magma$/i.test(st)||pr<=0) continue
    const cn=canonStaff(st), k=canonKey(cn); if(!stats[k]) stats[k]={nombre:cn, trabajos:0, ganado:0, debe:0, items:[]}
    stats[k].trabajos++; stats[k].ganado+=pr
    const pk=k+'|'+norm(mesLab(p['Fecha Evento']))+'|'+String(p['N° presupuesto']||'').trim()+'|'+norm(ped)
    const cnt=paidCount[pk]||0, u=usedG[pk]||0; const pagado=u<cnt; if(pagado)usedG[pk]=u+1; else stats[k].debe+=pr
    const _d=parseD(p['Fecha Evento'])
    stats[k].items.push({fecha:p['Fecha Evento']||'', anio:_d?_d.getFullYear():'', mes:_d?_d.getMonth()+1:'', proy:p['Proyecto']||p['Cliente']||'—', ag:p['Agencia']||'', ped, monto:pr, pagado, nro:p['N° presupuesto']||''})
  }})
  // Años anteriores (HISTORICO 2023/2024/2025): ya saldados — suman a "total", NO a "se le debe"
  const addHist=(rows,anio)=>{ (rows||[]).forEach(p=>{ for(let j=1;j<=6;j++){ const st=String(p['Staff '+j]||'').trim(); const pr=parseMonto(p['Pago '+j]); if(!st||/somos magma|^magma$/i.test(st)||pr<=0) continue
    const cn=canonStaff(st), k=canonKey(cn); if(!stats[k]) stats[k]={nombre:cn, trabajos:0, ganado:0, debe:0, items:[]}
    stats[k].trabajos++; stats[k].ganado+=pr
    const _d=parseD(p['Fecha'])
    stats[k].items.push({fecha:p['Fecha']||`${anio}`, anio:_d?_d.getFullYear():Number(anio), mes:_d?_d.getMonth()+1:'', proy:p['Proyecto']||p['Cliente']||'—', ag:p['Agencia']||'', ped:'', monto:pr, pagado:true})
  }}) }
  addHist(data.historico2023,'2023'); addHist(data.historico2024,'2024'); addHist(data.historico2025,'2025')
  // RRHH (datos fiscales) + incluir roster que no tenga trabajos
  const rrhhByName={}; rrhh.forEach(r=>{ const n=String(r['Nombre Apellido']||r['Nombre']||'').trim(); if(n){ const cn=canonStaff(n), k=canonKey(cn); rrhhByName[k]=r; if(!stats[k]) stats[k]={nombre:cn, trabajos:0, ganado:0, debe:0, items:[]} } })

  // Vista por período (año/mes) a nivel de toda la lista
  const aniosAll=[...new Set(Object.values(stats).flatMap(p=>p.items.map(it=>it.anio)).filter(Boolean))].sort((a,b)=>b-a)
  const per=it=>(!lAnio||String(it.anio)===String(lAnio))&&(!lMes||String(it.mes)===String(lMes))
  const view=p=>{ const its=p.items.filter(per); const total=its.reduce((s,it)=>s+it.monto,0); const debe=its.filter(it=>!it.pagado).reduce((s,it)=>s+it.monto,0); return {trab:its.length, total, debe, prom:its.length?total/its.length:0} }
  const filtroActivo=!!(lAnio||lMes)
  const lista=Object.values(stats).map(p=>({...p, v:view(p)})).filter(p=>!filtroActivo||p.v.trab>0).sort((a,b)=>b.v.total-a.v.total)
  const filtrados=lista.filter(p=>!q||norm(p.nombre).includes(norm(q)))
  const selP = sel ? stats[canonKey(canonStaff(sel))] : null
  const datos = selP ? (rrhhByName[canonKey(canonStaff(selP.nombre))]||{}) : {}
  const pend = selP ? selP.debe : 0
  const totPeriodo=filtrados.reduce((s,p)=>s+p.v.total,0), trabPeriodo=filtrados.reduce((s,p)=>s+p.v.trab,0)
  const periodoLbl=(lMes?MESES_LARGO[lMes-1]+' ':'')+(lAnio||(filtroActivo?'':'histórico'))

  return <>
    <PageHead title="Freelancers" sub={`${filtrados.length} de ${lista.length}`}/>
    <div style={{display:'flex', gap:10, marginBottom:12, flexWrap:'wrap', alignItems:'center'}}>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar freelancer…" style={{flex:'1 1 240px', maxWidth:360, padding:'9px 13px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13, outline:'none'}}/>
      <select value={lAnio} onChange={e=>setLAnio(e.target.value)} style={selectStyle}><option value="">Todos los años</option>{aniosAll.map(a=><option key={a} value={a}>{a}</option>)}</select>
      <select value={lMes} onChange={e=>setLMes(e.target.value)} style={selectStyle}><option value="">Todo el año</option>{MESES_LARGO.map((m,i)=><option key={i} value={i+1}>{m}</option>)}</select>
    </div>
    <div style={{display:'flex', gap:24, flexWrap:'wrap', padding:'11px 18px', marginBottom:14, background:T.surfaceAlt, border:`1px solid ${T.border}`, borderRadius:10}}>
      <Mini label={`Freelancers · ${periodoLbl}`} val={filtrados.length}/>
      <Mini label="Total pagado a staff" val={fmtM(totPeriodo)}/>
      <Mini label="Trabajos" val={trabPeriodo}/>
      <Mini label="Promedio x trabajo" val={fmtM(trabPeriodo?totPeriodo/trabPeriodo:0)}/>
    </div>
    <div style={{display:'flex', gap:16, alignItems:'flex-start'}}>
      <div style={{flex:1, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
        <div style={{display:'grid', gridTemplateColumns:'1.5fr 55px 110px 105px 110px', padding:'11px 18px', borderBottom:`1px solid ${T.border}`, fontSize:10.5, fontWeight:600, letterSpacing:0.3, textTransform:'uppercase', color:T.ink3}}>
          <span>Nombre</span><span style={{textAlign:'right'}}>Trab.</span><span style={{textAlign:'right'}}>Total</span><span style={{textAlign:'right'}}>Prom.</span><span style={{textAlign:'right'}}>Se le debe</span>
        </div>
        {filtrados.length===0&&<Empty>Sin resultados</Empty>}
        {filtrados.slice(0,300).map((p,i)=>{ const d=p.v.debe; return (
          <div key={i} onClick={()=>setSel(p.nombre)} style={{display:'grid', gridTemplateColumns:'1.5fr 55px 110px 105px 110px', padding:'11px 18px', borderTop:`1px solid ${T.border}`, cursor:'pointer', alignItems:'center', fontSize:13, background:sel===p.nombre?T.surfaceAlt:'transparent'}}>
            <span style={{color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:8}}>{p.nombre}</span>
            <span style={{textAlign:'right', color:T.ink2, fontFamily:MONO, fontSize:12}}>{p.v.trab}</span>
            <span style={{textAlign:'right', color:T.ink, fontFamily:MONO, fontSize:12}}>{fmtM(p.v.total)}</span>
            <span style={{textAlign:'right', color:T.ink2, fontFamily:MONO, fontSize:12}}>{fmtM(p.v.prom)}</span>
            <span style={{textAlign:'right', color:d>0?T.brand:T.ink3, fontFamily:MONO, fontSize:12, fontWeight:d>0?600:400}}>{d>0?fmtM(d):'—'}</span>
          </div>
        )})}
      </div>
      {selP && <div style={{flex:'0 0 360px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', position:'sticky', top:0}}>
        <div style={{padding:'14px 18px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', gap:8}}>
          <span style={{fontSize:15, fontWeight:700, color:T.ink, flex:1, minWidth:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{selP.nombre}</span>
          <button onClick={()=>setEditando({nombre:selP.nombre, datos})} title="Editar datos" style={{border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:11.5, fontWeight:600, padding:'4px 10px', borderRadius:7, cursor:'pointer', whiteSpace:'nowrap'}}>Editar</button>
          <button onClick={()=>setSel(null)} title="Cerrar" style={{border:'none', background:'transparent', fontSize:20, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
        </div>
        <div style={{padding:'14px 18px'}}>
          <div style={{display:'flex', gap:18, flexWrap:'wrap', marginBottom:14}}>
            <Mini label="Trabajos" val={selP.trabajos}/>
            <Mini label="Total (le sale a Magma)" val={fmtM(selP.ganado)}/>
            <Mini label="Promedio x trabajo" val={fmtM(selP.trabajos?selP.ganado/selP.trabajos:0)}/>
            <Mini label="Se le debe" val={pend>0?fmtM(pend):'—'} color={pend>0?T.brand:T.pos}/>
          </div>
          {/* Rubro como etiquetas */}
          {datos['Rubro'] && <div style={{display:'flex', flexWrap:'wrap', gap:5, marginBottom:10}}>
            {String(datos['Rubro']).split(',').map(s=>s.trim()).filter(Boolean).map((r,i)=>(
              <span key={i} style={{padding:'3px 9px', borderRadius:20, background:T.brandSoft, color:T.brand, fontSize:11, fontWeight:600}}>{r}</span>
            ))}
          </div>}
          {/* Tarifas y estado — lo primero que se mira al armar un presupuesto */}
          {(datos['Tarifa media jornada']||datos['Tarifa jornada']||datos['Zona']||datos['Estado']) && (
            <div style={{display:'flex', gap:14, flexWrap:'wrap', padding:'9px 11px', marginBottom:10, background:T.surfaceAlt, borderRadius:9, border:`1px solid ${T.border}`}}>
              {datos['Tarifa media jornada'] && <div><div style={{fontSize:9.5, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, fontWeight:600}}>½ jornada</div><div style={{fontSize:13, fontFamily:MONO, color:T.ink, fontWeight:600}}>{fmt(parseMonto(datos['Tarifa media jornada']))}</div></div>}
              {datos['Tarifa jornada'] && <div><div style={{fontSize:9.5, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, fontWeight:600}}>Jornada</div><div style={{fontSize:13, fontFamily:MONO, color:T.ink, fontWeight:600}}>{fmt(parseMonto(datos['Tarifa jornada']))}</div></div>}
              {datos['Zona'] && <div><div style={{fontSize:9.5, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, fontWeight:600}}>Zona</div><div style={{fontSize:12.5, color:T.ink}}>{datos['Zona']}</div></div>}
              {datos['Estado'] && <div style={{marginLeft:'auto'}}><span style={{padding:'3px 9px', borderRadius:20, fontSize:10.5, fontWeight:600, background:/activo/i.test(datos['Estado'])?T.posSoft:/no llamar|inactivo/i.test(datos['Estado'])?T.brandSoft:T.warnSoft, color:/activo/i.test(datos['Estado'])?T.pos:/no llamar|inactivo/i.test(datos['Estado'])?T.brand:T.warn}}>{datos['Estado']}</span></div>}
            </div>
          )}
          {datos['Notas'] && <div style={{fontSize:12, color:T.ink2, background:T.warnSoft, borderRadius:8, padding:'8px 11px', marginBottom:10, lineHeight:1.45}}>{datos['Notas']}</div>}
          {/* Ficha completa: todo lo que hay cargado en RRHH */}
          {[['Mail',datos['Mail']],['Tel',datos['Celular']],['DNI',datos['Dni']],['Nacimiento',datos['Fecha de nac']||datos['Fecha de Nac']],['Nacionalidad',datos['Nacionalidad']],['CUIT',datos['CUIT/CUIL']||datos['CUIT']],['Banco',datos['Banco']],['Alias',datos['Alias']],['CBU',datos['CBU']]].filter(x=>x[1]).map(([k,v])=>(
            <div key={k} style={{display:'flex', justifyContent:'space-between', gap:8, padding:'4px 0', fontSize:12.5}}><span style={{color:T.ink3}}>{k}</span><span style={{color:T.ink, fontFamily:MONO, fontSize:11.5, textAlign:'right', wordBreak:'break-all'}}>{v}</span></div>
          ))}
          {/* Qué falta cargar — para que el registro se complete solo */}
          {(()=>{
            const falta=[['Mail',datos['Mail']],['Tel',datos['Celular']],['CUIT',datos['CUIT/CUIL']||datos['CUIT']],['CBU',datos['CBU']],['Rubro',datos['Rubro']]].filter(x=>!String(x[1]||'').trim()).map(x=>x[0])
            if(!Object.keys(datos).length) return <button onClick={()=>setEditando({nombre:selP.nombre, datos:{}})} style={{width:'100%', marginTop:6, padding:'8px', borderRadius:8, border:`1px solid ${T.warn}`, background:T.warnSoft, color:T.warn, fontSize:12, fontWeight:600, cursor:'pointer'}}>⚠ Sin ficha en RRHH — cargar datos</button>
            if(falta.length) return <button onClick={()=>setEditando({nombre:selP.nombre, datos})} style={{width:'100%', marginTop:8, padding:'7px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surfaceAlt, color:T.warn, fontSize:11.5, fontWeight:600, cursor:'pointer'}}>Falta cargar: {falta.join(' · ')}</button>
            return null
          })()}
          {(()=>{
            const anios=[...new Set(selP.items.map(it=>it.anio).filter(Boolean))].sort((a,b)=>b-a)
            const its=selP.items.filter(it=>(!fAnio||String(it.anio)===String(fAnio))&&(!fMes||String(it.mes)===String(fMes)))
            const totF=its.reduce((s,it)=>s+it.monto,0), debeF=its.filter(it=>!it.pagado).reduce((s,it)=>s+it.monto,0)
            // Ordenado por fecha (lo más nuevo arriba). Los históricos viejos traen solo el año.
            const ts=it=>{ const d=parseD(it.fecha); return d?d.getTime():(it.anio?new Date(Number(it.anio),0,1).getTime():0) }
            const ord=its.slice().sort((a,b)=>ts(b)-ts(a))
            // Por defecto: lo ACTIVO (lo que se le debe) + los últimos 5. El resto, con los
            // filtros de año/mes o "ver todos". Antes se listaba el histórico completo y era ilegible.
            const hayFiltro=!!(fAnio||fMes)
            const pendientes=ord.filter(it=>!it.pagado)
            const recientes=ord.filter(it=>it.pagado).slice(0,5)
            const resumen=[...pendientes,...recientes]
            const mostrar=(hayFiltro||verTodos)?ord:resumen
            const ocultos=ord.length-mostrar.length
            return <>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, margin:'16px 0 8px'}}>
                <span style={{fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3}}>{hayFiltro||verTodos?'Trabajos':'Activo y reciente'}</span>
                <div style={{display:'flex', gap:6}}>
                  <select value={fAnio} onChange={e=>setFAnio(e.target.value)} style={{...selectStyle, padding:'4px 8px', fontSize:11.5}}><option value="">Año</option>{anios.map(a=><option key={a} value={a}>{a}</option>)}</select>
                  <select value={fMes} onChange={e=>setFMes(e.target.value)} style={{...selectStyle, padding:'4px 8px', fontSize:11.5}}><option value="">Mes</option>{MESES_LARGO.map((m,i)=><option key={i} value={i+1}>{m}</option>)}</select>
                </div>
              </div>
              <div style={{display:'flex', justifyContent:'space-between', fontSize:11.5, color:T.ink2, marginBottom:4}}><span>{its.length} trabajo{its.length===1?'':'s'}</span><span style={{fontFamily:MONO}}>{fmtM(totF)}</span></div>
              {debeF>0 && <div style={{display:'flex', justifyContent:'space-between', fontSize:11.5, color:T.brand, fontWeight:600, marginBottom:6}}><span>Se le debe</span><span style={{fontFamily:MONO}}>{fmtM(debeF)}</span></div>}
              {mostrar.map((it,i)=>(
                <div key={i} style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8, padding:'5px 0', fontSize:12, borderTop:`1px solid ${T.border}`}}>
                  <span style={{flex:1, minWidth:0, color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{it.fecha?String(it.fecha).slice(0,10)+' · ':''}{it.ped||it.proy} <span style={{color:T.ink3}}>· {it.proy}</span></span>
                  <span style={{fontFamily:MONO, color:it.pagado?T.ink3:T.brand, fontWeight:it.pagado?400:600, flexShrink:0}} title={it.pagado?'pagado':'se le debe'}>{fmtM(it.monto)}{it.pagado?'':' •'}</span>
                </div>
              ))}
              {ocultos>0 && !hayFiltro && <button onClick={()=>setVerTodos(true)} style={{width:'100%', marginTop:8, padding:'7px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surfaceAlt, color:T.ink2, fontSize:11.5, cursor:'pointer'}}>Ver los {ocultos} trabajos anteriores</button>}
              {verTodos && !hayFiltro && <button onClick={()=>setVerTodos(false)} style={{width:'100%', marginTop:8, padding:'7px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surfaceAlt, color:T.ink3, fontSize:11.5, cursor:'pointer'}}>Ver menos</button>}
              {!its.length && <div style={{fontSize:11.5, color:T.ink3, padding:'8px 0'}}>Sin trabajos en ese período</div>}
            </>
          })()}
        </div>
      </div>}
    </div>
    {editando && <FreelancerModal
      nombre={editando.nombre}
      datos={editando.datos||{}}
      rubrosConocidos={[...new Set(rrhh.flatMap(r=>String(r['Rubro']||'').split(',').map(s=>s.trim())).filter(Boolean))]}
      showToast={showToast}
      onClose={()=>setEditando(null)}
      onSaved={()=>{ setEditando(null); onRefresh&&onRefresh() }}/>}
  </>
}

// ============================ CONTACTOS ============================
function Contactos({data, onRefresh, showToast, nav, clearNav}){
  const [rows,setRows]=useState(data.contactos||[])
  useEffect(()=>{ setRows(data.contactos||[]) },[data.contactos])
  const [q,setQ]=useState(''), [ag,setAg]=useState('todas'), [edit,setEdit]=useState(null), [form,setForm]=useState({})
  useEffect(()=>{ if(nav?.mod==='contactos'&&nav.q){ setQ(nav.q); setAg('todas'); clearNav&&clearNav() } /* eslint-disable-next-line */ },[nav])
  const agencias=[...new Set(rows.map(c=>c['Agencia']).filter(Boolean))].sort()
  const filtrados=rows.filter(c=>{
    const mq=!q||['Nombre','Mail','Agencia','Cargo','Teléfono','Cuit'].some(k=>normTxt(c[k]).includes(normTxt(q)))
    const ma=ag==='todas'||c['Agencia']===ag
    return mq&&ma
  })
  const empezar=c=>{ setEdit(c['Nombre']+'|'+(c['Agencia']||'')); setForm({nombre:c['Nombre']||'',mail:c['Mail']||'',agencia:c['Agencia']||'',cargo:c['Cargo']||'',telefono:c['Teléfono']||'',cuit:c['Cuit']||''}) }
  async function guardar(c){
    const cambios={}; ['nombre','mail','agencia','cargo','telefono','cuit'].forEach(k=>{ const orig={nombre:c['Nombre'],mail:c['Mail'],agencia:c['Agencia'],cargo:c['Cargo'],telefono:c['Teléfono'],cuit:c['Cuit']}; if((form[k]||'')!==(orig[k]||''))cambios[k]=form[k] })
    if(!Object.keys(cambios).length){ setEdit(null); return }
    try{ const r=await fetch('/api/contacto-editar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombreOriginal:c['Nombre'],agenciaOriginal:c['Agencia'],cambios})})
      const j=await r.json(); if(!j.ok){showToast(j.error||'Error','err');return}
      showToast('Contacto actualizado'); setEdit(null); if(onRefresh) onRefresh()
    }catch(e){ showToast('Error de conexión','err') }
  }
  return <>
    <PageHead title="Contactos" sub={`${filtrados.length} de ${rows.length}`}/>
    <div style={{display:'flex', gap:10, marginBottom:14, flexWrap:'wrap'}}>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar nombre, mail, agencia…" style={{flex:'1 1 240px', minWidth:190, padding:'9px 13px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13, outline:'none'}}/>
      <select value={ag} onChange={e=>setAg(e.target.value)} style={selectStyle}><option value="todas">Todas las agencias</option>{agencias.map(a=><option key={a} value={a}>{a}</option>)}</select>
    </div>
    <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
      <div style={{display:'grid', gridTemplateColumns:'1.3fr 1fr 1.4fr 1fr 90px', padding:'11px 18px', borderBottom:`1px solid ${T.border}`, fontSize:10.5, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3}}>
        <span>Nombre</span><span>Agencia</span><span>Mail</span><span>Teléfono</span><span/>
      </div>
      {filtrados.length===0&&<Empty>Sin resultados</Empty>}
      {filtrados.slice(0,300).map((c,i)=>{
        const editando=edit===(c['Nombre']+'|'+(c['Agencia']||''))
        if(editando) return <div key={i} style={{padding:'12px 18px', borderTop:`1px solid ${T.border}`, background:T.surfaceAlt}}>
          <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
            {[['nombre','Nombre'],['agencia','Agencia'],['mail','Mail'],['telefono','Teléfono'],['cargo','Cargo'],['cuit','CUIT']].map(([k,l])=>(
              <div key={k} style={{flex:'1 1 150px', minWidth:130}}><label style={lblV2}>{l}</label><input value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={inpV2}/></div>
            ))}
          </div>
          <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:10}}>
            <button onClick={()=>setEdit(null)} style={miniBtn}>Cancelar</button>
            <button onClick={()=>guardar(c)} style={{...miniBtn, background:T.pos, color:'#fff', border:'none'}}>✓ Guardar</button>
          </div>
        </div>
        return <div key={i} style={{display:'grid', gridTemplateColumns:'1.3fr 1fr 1.4fr 1fr 90px', padding:'11px 18px', borderTop:`1px solid ${T.border}`, alignItems:'center', fontSize:13}}>
          <span style={{color:T.ink, fontWeight:500}}>{c['Nombre']||'—'}{c['Cargo']?<span style={{color:T.ink3, fontWeight:400}}> · {c['Cargo']}</span>:''}</span>
          <span style={{color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:8}}>{c['Agencia']||'—'}</span>
          <span style={{color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:8}}>{c['Mail']||'—'}</span>
          <span style={{color:T.ink2, fontFamily:MONO, fontSize:12}}>{c['Teléfono']||'—'}</span>
          <button onClick={()=>empezar(c)} style={{...miniBtn, justifySelf:'end'}}>✎ Editar</button>
        </div>
      })}
    </div>
  </>
}

// ============================ AGENCIAS ============================
function Agencias({data, onRefresh, showToast, nav, clearNav}){
  const presus=data.presupuestos||[], fc=data.facturacion||[], contactos=data.contactos||[]
  const [rows,setRows]=useState(data.agencias||[])
  useEffect(()=>{ setRows(data.agencias||[]) },[data.agencias])
  const [q,setQ]=useState(''), [sel,setSel]=useState(null), [edit,setEdit]=useState(false), [form,setForm]=useState({})
  useEffect(()=>{ if(nav?.mod==='agencias'&&nav.q){ setQ(nav.q); clearNav&&clearNav() } /* eslint-disable-next-line */ },[nav])
  const stats=nombre=>{ const n=normTxt(nombre); const ps=presus.filter(p=>normTxt(p['Agencia'])===n); const fcs=fc.filter(f=>normTxt(f['Agencia'])===n); return {presus:ps.length, aprob:ps.filter(isAprobado).length, fact:fcs.length, cobrado:fcs.filter(isCobrada).reduce((s,f)=>s+parseMonto(f['Precio FINAL']),0), psList:ps} }
  const filtrados=rows.filter(a=>!q||normTxt(a['Nombre']).includes(normTxt(q))||normTxt(a['CUIT']).includes(normTxt(q)))
  const agSel = sel ? rows.find(a=>a['Nombre']===sel) : null
  const st = agSel ? stats(agSel['Nombre']) : null

  async function guardar(){
    try{ const r=await fetch('/api/agencia-upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:agSel['Nombre'], cuit:form.cuit, condIVA:form.condIVA, mailFact:form.mailFact, telefono:form.telefono, direccion:form.direccion, notas:form.notas})})
      const j=await r.json(); if(!j.ok){showToast(j.error||'Error','err');return}
      showToast('Agencia guardada'); setEdit(false); if(onRefresh) onRefresh()
    }catch(e){ showToast('Error de conexión','err') }
  }
  const abrir=a=>{ setSel(a['Nombre']); setEdit(false); setForm({cuit:a['CUIT']||'',condIVA:a['Condicion IVA']||'',mailFact:a['Mail facturacion']||'',telefono:a['Telefono']||'',direccion:a['Direccion fiscal']||'',notas:a['Notas']||''}) }

  return <>
    <PageHead title="Agencias" sub={`${filtrados.length} de ${rows.length}`}/>
    <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar agencia o CUIT…" style={{width:'100%', maxWidth:360, padding:'9px 13px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13, outline:'none', marginBottom:14}}/>
    <div style={{display:'flex', gap:16, alignItems:'flex-start'}}>
      <div style={{flex:1, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
        <div style={{display:'grid', gridTemplateColumns:'1.5fr 70px 70px 110px 50px', padding:'11px 18px', borderBottom:`1px solid ${T.border}`, fontSize:10.5, fontWeight:600, letterSpacing:0.3, textTransform:'uppercase', color:T.ink3}}>
          <span>Nombre</span><span style={{textAlign:'right'}}>Presus</span><span style={{textAlign:'right'}}>Aprob</span><span style={{textAlign:'right'}}>Cobrado</span><span style={{textAlign:'center'}}>Datos</span>
        </div>
        {filtrados.map((a,i)=>{ const s=stats(a['Nombre']); const ok=a['CUIT']&&a['Condicion IVA']
          return <div key={i} onClick={()=>abrir(a)} style={{display:'grid', gridTemplateColumns:'1.5fr 70px 70px 110px 50px', padding:'11px 18px', borderTop:`1px solid ${T.border}`, cursor:'pointer', alignItems:'center', fontSize:13, background:sel===a['Nombre']?T.surfaceAlt:'transparent'}}>
            <span style={{color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:8}}>{a['Nombre']}</span>
            <span style={{textAlign:'right', color:T.ink2, fontFamily:MONO, fontSize:12}}>{s.presus}</span>
            <span style={{textAlign:'right', color:T.ink2, fontFamily:MONO, fontSize:12}}>{s.aprob}</span>
            <span style={{textAlign:'right', color:T.ink, fontFamily:MONO, fontSize:12}}>{fmtM(s.cobrado)}</span>
            <span style={{textAlign:'center', color:ok?T.pos:T.warn}}>{ok?'✓':'⚠'}</span>
          </div>
        })}
      </div>
      {agSel && <div style={{flex:'0 0 360px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', position:'sticky', top:0}}>
        <div style={{padding:'14px 18px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', gap:8}}>
          <span style={{fontSize:15, fontWeight:700, color:T.ink, flex:1, minWidth:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{agSel['Nombre']}</span>
          <button onClick={()=>edit?guardar():setEdit(true)} style={{...miniBtn, ...(edit?{background:T.pos,color:'#fff',border:'none'}:{})}}>{edit?'Guardar':'✎ Editar'}</button>
          <button onClick={()=>{setSel(null);setEdit(false)}} title="Cerrar" style={{border:'none', background:'transparent', fontSize:20, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
        </div>
        <div style={{padding:'14px 18px'}}>
          {edit ? <>
            {[['CUIT','cuit'],['Condición IVA','condIVA'],['Mail facturación','mailFact'],['Teléfono','telefono'],['Dirección fiscal','direccion'],['Notas','notas']].map(([l,k])=>(
              <div key={k} style={{marginBottom:9}}><label style={lblV2}>{l}</label><input value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={inpV2}/></div>
            ))}
          </> : <>
            <div style={{display:'flex', gap:18, flexWrap:'wrap', marginBottom:14}}>
              <Mini label="Presupuestos" val={st.presus}/><Mini label="Aprobados" val={st.aprob}/><Mini label="Facturas" val={st.fact}/><Mini label="Cobrado" val={fmtM(st.cobrado)} color={T.pos}/>
            </div>
            {[['CUIT',agSel['CUIT']],['Cond. IVA',agSel['Condicion IVA']],['Mail',agSel['Mail facturacion']],['Tel',agSel['Telefono']]].filter(x=>x[1]).map(([k,v])=>(
              <div key={k} style={{display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:12.5}}><span style={{color:T.ink3}}>{k}</span><span style={{color:T.ink}}>{v}</span></div>
            ))}
            <div style={{fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, margin:'14px 0 6px'}}>Últimos presupuestos</div>
            {st.psList.slice(-10).reverse().map((p,i)=>{ const si=estadoInfo(p['Estado']); return (
              <div key={i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, padding:'5px 0', fontSize:12, borderTop:`1px solid ${T.border}`}}>
                <span style={{width:6,height:6,borderRadius:6,background:si.c,flexShrink:0}} title={si.l}/>
                <span style={{flex:1, color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{p['Proyecto']||p['Cliente']||'—'}</span>
                <span style={{fontFamily:MONO, color:T.ink2}}>{fmtM(parseMonto(p['Precio Final']))}</span>
              </div>
            )})}
          </>}
        </div>
      </div>}
    </div>
  </>
}

// ============================ CLIENTES ============================
function Clientes({data, nav, clearNav}){
  const presus=data.presupuestos||[], fc=data.facturacion||[]
  const rows=data.clientes||[]
  const [q,setQ]=useState(''), [sel,setSel]=useState(null)
  useEffect(()=>{ if(nav?.mod==='clientes'&&nav.q){ setQ(nav.q); clearNav&&clearNav() } /* eslint-disable-next-line */ },[nav])
  const stats=nombre=>{ const n=normTxt(nombre); const ps=presus.filter(p=>normTxt(p['Cliente'])===n); const fcs=fc.filter(f=>normTxt(f['Cliente'])===n)
    const aprob=ps.filter(isAprobado).length
    const espera=ps.filter(p=>String(p['Estado']||'').toUpperCase()==='EN ESPERA').length
    const desaprob=ps.filter(p=>String(p['Estado']||'').toUpperCase()==='DESAPROBADO').length
    return {presus:ps.length, aprob, espera, desaprob, fact:fcs.length, cobrado:fcs.filter(isCobrada).reduce((s,f)=>s+parseMonto(f['Precio FINAL']),0), psList:ps} }
  const filtrados=rows.filter(c=>!q||normTxt(c['Nombre']).includes(normTxt(q)))
  const cliSel = sel?rows.find(c=>c['Nombre']===sel):null
  const st = cliSel?stats(cliSel['Nombre']):null
  return <>
    <PageHead title="Clientes" sub={`${filtrados.length} de ${rows.length}`}/>
    <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar cliente…" style={{width:'100%', maxWidth:360, padding:'9px 13px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13, outline:'none', marginBottom:14}}/>
    <div style={{display:'flex', gap:16, alignItems:'flex-start'}}>
      <div style={{flex:1, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
        <div style={{display:'grid', gridTemplateColumns:'1.5fr 1fr 80px 110px', padding:'11px 18px', borderBottom:`1px solid ${T.border}`, fontSize:10.5, fontWeight:600, letterSpacing:0.3, textTransform:'uppercase', color:T.ink3}}>
          <span>Nombre</span><span>Agencia habitual</span><span style={{textAlign:'right'}}>Presus</span><span style={{textAlign:'right'}}>Cobrado</span>
        </div>
        {filtrados.map((c,i)=>{ const s=stats(c['Nombre'])
          return <div key={i} onClick={()=>setSel(c['Nombre'])} style={{display:'grid', gridTemplateColumns:'1.5fr 1fr 80px 110px', padding:'11px 18px', borderTop:`1px solid ${T.border}`, cursor:'pointer', alignItems:'center', fontSize:13, background:sel===c['Nombre']?T.surfaceAlt:'transparent'}}>
            <span style={{color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:8}}>{c['Nombre']}</span>
            <span style={{color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:8}}>{c['Agencia habitual']||'—'}</span>
            <span style={{textAlign:'right', color:T.ink2, fontFamily:MONO, fontSize:12}}>{s.presus}</span>
            <span style={{textAlign:'right', color:T.ink, fontFamily:MONO, fontSize:12}}>{fmtM(s.cobrado)}</span>
          </div>
        })}
      </div>
      {cliSel && <div style={{flex:'0 0 340px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', position:'sticky', top:0}}>
        <CardHead>{cliSel['Nombre']}</CardHead>
        <div style={{padding:'0 18px 16px'}}>
          <div style={{display:'flex', gap:18, flexWrap:'wrap', marginBottom:10}}>
            <Mini label="Presupuestos" val={st.presus}/><Mini label="Facturas" val={st.fact}/><Mini label="Cobrado" val={fmtM(st.cobrado)} color={T.pos}/>
          </div>
          <div style={{display:'flex', gap:8, flexWrap:'wrap', marginBottom:12}}>
            <span style={{fontSize:11.5, color:T.pos, background:T.posSoft, padding:'3px 9px', borderRadius:20, fontWeight:600}}>{st.aprob} aprobados</span>
            <span style={{fontSize:11.5, color:T.warn, background:T.warnSoft, padding:'3px 9px', borderRadius:20, fontWeight:600}}>{st.espera} en espera</span>
            <span style={{fontSize:11.5, color:T.brand, background:T.brandSoft, padding:'3px 9px', borderRadius:20, fontWeight:600}}>{st.desaprob} desaprob.</span>
          </div>
          {[['Agencia habitual',cliSel['Agencia habitual']],['Industria',cliSel['Industria']],['Última vez',cliSel['Ultima vez']]].filter(x=>x[1]).map(([k,v])=>(
            <div key={k} style={{display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:12.5}}><span style={{color:T.ink3}}>{k}</span><span style={{color:T.ink}}>{v}</span></div>
          ))}
          <div style={{fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, margin:'14px 0 6px'}}>Últimos presupuestos</div>
          {st.psList.slice(-10).reverse().map((p,i)=>{ const si=estadoInfo(p['Estado']); return (
            <div key={i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, padding:'5px 0', fontSize:12, borderTop:`1px solid ${T.border}`}}>
              <span style={{width:6,height:6,borderRadius:6,background:si.c,flexShrink:0}} title={si.l}/>
              <span style={{flex:1, color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{p['Proyecto']||'—'}</span>
              <span style={{fontFamily:MONO, color:T.ink2}}>{fmtM(parseMonto(p['Precio Final']))}</span>
            </div>
          )})}
        </div>
      </div>}
    </div>
  </>
}

// ============================ HISTÓRICO ============================
function Historico({data}){
  const proyectos=data.proyectos||[], fc=data.facturacion||[]
  const [anio,setAnio]=useState('2026')
  const [mesF,setMesF]=useState('todos')
  const fcByNro={}; fc.forEach(f=>{fcByNro[String(f['N° Presupuesto'])]=f})
  const magma2026=p=>{ const fee=parseMonto(p['Fee Agencia']||p['Fee Final']); let sm=0; for(let j=1;j<=20;j++){ if(String(p['Staff '+j]||'').trim()==='Somos Magma') sm+=parseMonto(p['Precio '+j]) } return fee+sm+parseMonto(p['Diferencia']) }

  let filasAll=[]
  if(anio==='2026'){
    filasAll=proyectos.filter(p=>String(p['Fecha Evento']||'').includes('2026')).map(p=>{ const f=fcByNro[String(p['N° presupuesto'])]
      return {mesNum:parseInt((p['Fecha Evento']||'').split('/')[1])||0, fecha:p['Fecha Evento'], nro:p['N° presupuesto'], cliente:p['Cliente'], agencia:p['Agencia'], proyecto:p['Proyecto'], total:parseMonto(p['Total ']||p['Total']), magma:magma2026(p), cobrado:f?isCobrada(f):false} })
  } else {
    const src={'2023':data.historico2023,'2024':data.historico2024,'2025':data.historico2025}[anio]||[]
    filasAll=src.map(r=>({ mesNum:parseInt(String(r['Fecha Evento']||'').split('/')[1])||parseInt(String(r['Mes']||''))||0, fecha:r['Fecha Evento'], nro:r['Nro Presupuesto'], cliente:r['Cliente'], agencia:r['Agencia'], proyecto:r['Proyecto'], total:parseMonto(r['Total']), magma:parseMonto(r['Viaticos'])+parseMonto(r['Magma'])+parseMonto(r['Impuestos'])+parseMonto(r['Extra M']), cobrado:String(r['Cobrado']||'').toUpperCase()==='SÍ'||String(r['Cobrado']||'').toUpperCase()==='SI'||String(r['Cobrado']||'').toUpperCase()==='TRUE' }))
  }
  const filas = mesF==='todos' ? filasAll : filasAll.filter(r=>r.mesNum===parseInt(mesF))
  const facturado=filas.reduce((s,r)=>s+r.total,0)
  const ganancia=filas.reduce((s,r)=>s+r.magma,0)
  const margenPct=facturado>0?(ganancia/facturado)*100:0
  const semMargen=semaforo(margenPct)
  const mesesPresentes=[...new Set(filasAll.map(r=>r.mesNum).filter(Boolean))].sort((a,b)=>a-b)

  // top clientes del período
  const porCli={}; filas.forEach(r=>{ const c=r.cliente||'—'; porCli[c]=(porCli[c]||0)+r.total }); const topCli=Object.entries(porCli).sort((a,b)=>b[1]-a[1]).slice(0,8)

  return <>
    <PageHead title="Histórico" sub={`${filas.length} proyectos${mesF==='todos'?` en ${anio}`:` en ${MESES_LARGO[parseInt(mesF)-1]} ${anio}`}`}/>
    <div style={{display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center'}}>
      {['2023','2024','2025','2026'].map(a=><button key={a} onClick={()=>{setAnio(a);setMesF('todos')}} style={{padding:'7px 16px', borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer', border:`1px solid ${anio===a?T.ink:T.border}`, background:anio===a?T.ink:T.surface, color:anio===a?'#fff':T.ink2}}>{a}</button>)}
      <div style={{flex:1}}/>
      <select value={mesF} onChange={e=>setMesF(e.target.value)} style={selectStyle}><option value="todos">Todo el año</option>{mesesPresentes.map(m=><option key={m} value={m}>{MESES_LARGO[m-1]}</option>)}</select>
    </div>
    <div style={{display:'flex', gap:12, marginBottom:20, flexWrap:'wrap'}}>
      <Stat label="Proyectos" value={filas.length}/>
      <Stat label="Facturado" value={fmt(facturado)}/>
      <Stat label="Ganancia Magma" value={fmt(ganancia)} color={T.pos}/>
      <Stat label={`Margen · ${semMargen.l}`} value={Math.round(margenPct)+'%'} color={semMargen.c}/>
    </div>
    {filas.length===0
      ? <Empty>Sin datos para {anio}. Los históricos viejos se cargan desde Admin → Backfill en la app actual.</Empty>
      : <div style={{display:'flex', gap:16, alignItems:'flex-start'}}>
        <div style={{flex:1.6, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
          <div style={{display:'grid', gridTemplateColumns:'70px 1.5fr 1fr 110px 110px 60px', padding:'11px 16px', borderBottom:`1px solid ${T.border}`, fontSize:10, fontWeight:600, letterSpacing:0.3, textTransform:'uppercase', color:T.ink3}}>
            <span>N°</span><span>Proyecto</span><span>Cliente</span><span style={{textAlign:'right'}}>Total</span><span style={{textAlign:'right'}}>Magma</span><span style={{textAlign:'center'}}>Cob.</span>
          </div>
          <div style={{maxHeight:'60vh', overflowY:'auto'}}>
          {filas.slice().reverse().slice(0,300).map((r,i)=>(
            <div key={i} style={{display:'grid', gridTemplateColumns:'70px 1.5fr 1fr 110px 110px 60px', padding:'9px 16px', borderTop:`1px solid ${T.border}`, alignItems:'center', fontSize:12.5}}>
              <span style={{fontFamily:MONO, fontSize:11, color:T.ink3}}>{r.nro||'—'}</span>
              <span style={{color:T.ink, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:8}}>{r.proyecto||'—'}</span>
              <span style={{color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:8}}>{r.cliente||'—'}</span>
              <span style={{textAlign:'right', fontFamily:MONO, color:T.ink}}>{fmtM(r.total)}</span>
              <span style={{textAlign:'right', fontFamily:MONO, color:T.pos}}>{fmtM(r.magma)}</span>
              <span style={{textAlign:'center', color:r.cobrado?T.pos:T.ink3}}>{r.cobrado?'✓':'·'}</span>
            </div>
          ))}
          </div>
        </div>
        <div style={{flex:1, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
          <CardHead>Top clientes {anio}</CardHead>
          {topCli.map(([c,m],i)=>(
            <div key={i} style={{display:'flex', justifyContent:'space-between', padding:'9px 18px', borderTop:`1px solid ${T.border}`}}>
              <span style={{fontSize:12.5, color:T.ink}}>{c}</span>
              <span style={{fontSize:12.5, fontFamily:MONO, color:T.ink2}}>{fmtM(m)}</span>
            </div>
          ))}
        </div>
      </div>}
  </>
}

// ============================ EGRESOS (lectura) ============================
// Cuenta corriente de cada socio contra Magma: cuánto le queda por cobrar antes de
// sacar más plata. Sin esto se retira a ciegas y se termina sacando por adelantado.
function CuentaSocios({showToast}){
  const [d,setD]=useState(null), [err,setErr]=useState(''), [abierto,setAbierto]=useState(null)
  const [mov,setMov]=useState(null)   // {socio, tipo} cuando se está registrando un movimiento
  const cargar=useCallback(()=>fetch('/api/socios-cuenta').then(r=>r.json()).then(j=>{ if(j.error)setErr(j.error); else {setD(j); setErr('')} })
    .catch(()=>setErr('No se pudo calcular')),[])
  useEffect(()=>{ cargar() },[cargar])
  if(err) return null
  if(!d) return <div style={{fontSize:12, color:T.ink3, padding:'10px 18px'}}>Calculando cuenta de socios…</div>
  const MES=['','ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', marginBottom:14}}>
    <CardHead>Cuenta de socios · cuánto queda por cobrar</CardHead>
    <div style={{padding:'4px 18px 10px', fontSize:11, color:T.ink3}}>
      Sueldo de {MES[d.desdeSueldo]} a {MES[d.hastaSueldo]} ({d.socios[0].meses} × {fmt(d.sueldoMensual)}) + extras de {MES[d.desdeExtras]} a {MES[d.hastaExtras]}, menos lo que ya retiró cada uno (transferencias + gastos personales con tarjeta de la empresa).
    </div>
    <div style={{display:'flex', gap:12, padding:'0 18px 16px', flexWrap:'wrap'}}>
      {d.socios.map(s=>{ const aFavor=s.saldo>=0, icon=/juan/i.test(s.nombre)?'👨':'👩'
        return <div key={s.nombre} style={{flex:'1 1 240px', minWidth:230, border:`1px solid ${aFavor?T.posSoft:T.warnSoft}`, borderLeft:`3px solid ${aFavor?T.pos:T.brand}`, borderRadius:10, padding:'12px 14px', background:aFavor?T.posSoft:T.warnSoft}}>
          <div style={{fontSize:12.5, fontWeight:700, color:T.ink, marginBottom:6}}>{icon} {s.nombre}</div>
          <div style={{fontSize:21, fontFamily:MONO, fontWeight:700, color:aFavor?T.pos:T.brand, lineHeight:1.1}}>{aFavor?'':'–'}{fmt(Math.abs(s.saldo))}</div>
          <div style={{fontSize:11.5, color:T.ink2, marginTop:3, fontWeight:600}}>{aFavor?'le queda por cobrar':'retiró de más — se lo debe a Magma'}</div>
          <div style={{marginTop:9, paddingTop:8, borderTop:`1px solid ${T.border}`, fontSize:11.5, color:T.ink3, display:'grid', gap:2}}>
            <div style={{fontSize:10, fontWeight:700, color:T.ink3, textTransform:'uppercase', letterSpacing:.3}}>Ganó</div>
            <div style={{display:'flex', justifyContent:'space-between'}}><span>Sueldo · {s.meses} meses × {fmtM(d.sueldoMensual)}</span><b style={{fontFamily:MONO, color:T.ink2}}>{fmt(s.sueldo)}</b></div>
            <div style={{display:'flex', justifyContent:'space-between'}}><span>Trabajos extras en proyectos</span><b style={{fontFamily:MONO, color:T.ink2}}>{fmt(s.extra)}</b></div>
            <div style={{display:'flex', justifyContent:'space-between', borderTop:`1px solid ${T.border}`, paddingTop:2, marginTop:1}}><span style={{fontWeight:700, color:T.ink2}}>Le corresponde</span><b style={{fontFamily:MONO, color:T.ink}}>{fmt(s.devengado)}</b></div>
            <div style={{fontSize:10, fontWeight:700, color:T.ink3, textTransform:'uppercase', letterSpacing:.3, marginTop:6}}>Ya sacó</div>
            <div style={{display:'flex', justifyContent:'space-between'}}><span>Transferencias y pagos</span><b style={{fontFamily:MONO, color:T.ink2}}>{fmt(s.recibido)}</b></div>
            <div style={{display:'flex', justifyContent:'space-between'}}><span>Tarjeta (gastos personales)</span><b style={{fontFamily:MONO, color:s.tarjetas>s.recibido?T.brand:T.ink2}}>{fmt(s.tarjetas)}</b></div>
            {s.puso>0 && <div style={{display:'flex', justifyContent:'space-between'}}><span>Puso de su bolsillo</span><b style={{fontFamily:MONO, color:T.pos}}>+{fmt(s.puso)}</b></div>}
          </div>
          <div style={{marginTop:9, display:'flex', gap:6}}>
            <button onClick={()=>setMov({socio:s.nombre, tipo:'saco'})} style={{flex:1, fontSize:11, fontWeight:700, padding:'6px 8px', borderRadius:7, border:'none', background:T.brand, color:'#fff', cursor:'pointer'}}>Sacó plata</button>
            <button onClick={()=>setMov({socio:s.nombre, tipo:'puso'})} style={{flex:1, fontSize:11, fontWeight:700, padding:'6px 8px', borderRadius:7, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, cursor:'pointer'}}>Puso plata</button>
          </div>
          <button onClick={()=>setAbierto(abierto===s.nombre?null:s.nombre)} style={{marginTop:8, fontSize:11, color:T.brand, background:'none', border:'none', cursor:'pointer', fontWeight:600, padding:0}}>{abierto===s.nombre?'Ocultar detalle':'Ver detalle ›'}</button>
          {abierto===s.nombre && <div style={{marginTop:8, paddingTop:8, borderTop:`1px solid ${T.border}`, fontSize:11, color:T.ink3, display:'grid', gap:2}}>
            <div style={{fontWeight:700, color:T.ink2, marginBottom:1}}>Extras sin cobrar, por mes</div>
            {Object.entries(s.extrasPorMes).sort((a,b)=>a[0]-b[0]).map(([m,v])=><div key={m} style={{display:'flex', justifyContent:'space-between'}}><span>{MES[m]}</span><span style={{fontFamily:MONO}}>{fmt(v)}</span></div>)}
            <div style={{fontWeight:700, color:T.ink2, margin:'5px 0 1px'}}>Tarjeta personal, por mes</div>
            {Object.entries(s.tarjPorMes).sort((a,b)=>a[0]-b[0]).map(([m,v])=><div key={m} style={{display:'flex', justifyContent:'space-between'}}><span>{MES[m]}</span><span style={{fontFamily:MONO}}>{fmt(v)}</span></div>)}
          </div>}
        </div> })}
    </div>
    {mov && <MovimientoSocio {...mov} onClose={()=>setMov(null)} onHecho={async()=>{ setMov(null); await cargar() }} showToast={showToast}/>}
  </div>
}

// Alta de un retiro o aporte de socio. Va a SOCIOS_MOVIMIENTOS, que es la fuente
// del saldo — no al "Sueldo X" de GASTOS_FIJOS, que es el compromiso del mes.
function MovimientoSocio({socio, tipo, onClose, onHecho, showToast}){
  const [monto,setMonto]=useState(''), [concepto,setConcepto]=useState(''), [moneda,setMoneda]=useState('ARS'), [busy,setBusy]=useState(false)
  const saco=tipo==='saco'
  async function guardar(){
    const n=parseMontoAR(monto)
    if(!n||n<=0) return showToast('Poné un monto','err')
    setBusy(true)
    try{
      const r=await fetch('/api/socio-movimiento',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({socio, tipo, monto:n, concepto, moneda})})
      const j=await r.json()
      if(j.error){ showToast(j.error,'err'); setBusy(false); return }
      showToast(saco?`${socio} sacó ${fmt(n)} ✓`:`${socio} puso ${fmt(n)} ✓`)
      await onHecho()
    }catch(e){ showToast('Error de conexión','err'); setBusy(false) }
  }
  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:210, display:'flex', alignItems:'center', justifyContent:'center', padding:20}}>
    <div onClick={e=>e.stopPropagation()} style={{background:T.surface, borderRadius:14, padding:20, width:380, maxWidth:'100%', border:`1px solid ${T.border}`}}>
      <h3 style={{margin:'0 0 4px', fontSize:16, fontWeight:700, color:T.ink}}>{saco?`${socio} sacó plata`:`${socio} puso plata`}</h3>
      <p style={{margin:'0 0 14px', fontSize:11.5, color:T.ink3}}>{saco
        ? 'Plata que Magma le dio al socio. Se descuenta de lo que tiene por cobrar.'
        : 'Plata que el socio puso en Magma (un VEP, un préstamo). Se suma a lo que tiene a favor.'}</p>
      <label style={{fontSize:11, fontWeight:700, color:T.ink3, textTransform:'uppercase', letterSpacing:.3}}>Monto</label>
      <div style={{display:'flex', gap:8, margin:'4px 0 12px'}}>
        <input autoFocus inputMode="decimal" value={monto} onChange={e=>setMonto(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')guardar()}} placeholder="0" style={{flex:1, padding:'9px 11px', borderRadius:8, border:`1px solid ${T.border}`, fontSize:15, fontFamily:MONO, textAlign:'right', outline:'none', background:T.surface, color:T.ink}}/>
        <select value={moneda} onChange={e=>setMoneda(e.target.value)} style={{...selectStyle, width:78}}><option>ARS</option><option>USD</option></select>
      </div>
      <label style={{fontSize:11, fontWeight:700, color:T.ink3, textTransform:'uppercase', letterSpacing:.3}}>Concepto</label>
      <input value={concepto} onChange={e=>setConcepto(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')guardar()}} placeholder={saco?'Retiro, adelanto, pago de tarjeta…':'VEP, préstamo en efectivo…'} style={{width:'100%', padding:'9px 11px', borderRadius:8, border:`1px solid ${T.border}`, fontSize:13, margin:'4px 0 16px', outline:'none', background:T.surface, color:T.ink}}/>
      <div style={{display:'flex', gap:8}}>
        <button onClick={onClose} style={{flex:1, padding:'10px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:600, cursor:'pointer'}}>Cancelar</button>
        <button onClick={guardar} disabled={busy} style={{flex:2, padding:'10px', borderRadius:9, border:'none', background:busy?T.ink3:T.brand, color:'#fff', fontSize:13, fontWeight:700, cursor:busy?'default':'pointer'}}>{busy?'Guardando…':'Registrar'}</button>
      </div>
    </div>
  </div>
}

function Egresos({data, onRefresh, showToast}){
  const gf=data.gastosFijos||[], tarj=data.tarjetas||[], prest=data.prestamos||[], cuentas=data.cuentas||[], movTarj=data.movimientosTarjeta||[], cuot=data.cuotas||[], movim=data.movimientos||[]
  const now=new Date()
  const [mesIdx,setMesIdx]=useState(now.getMonth()+1), [anio,setAnio]=useState(now.getFullYear())
  const [override,setOverride]=useState({}), [cuentaSel,setCuentaSel]=useState({}), [usdOv,setUsdOv]=useState({})
  const [editM,setEditM]=useState({})  // key -> true (editando monto)
  const [subir,setSubir]=useState(false)
  const [agregar,setAgregar]=useState(false)
  const [detalle,setDetalle]=useState(null)
  const [editGasto,setEditGasto]=useState(null)
  const itemsDe=t=>movTarj.filter(m=>normTxt(m['Tarjeta'])===normTxt(t['Tarjeta'])&&String(m['Mes']).trim()===String(t['Mes']).trim()&&String(m['Año']).includes(String(t['Año'])))
  const splitDe=t=>{ const its=itemsDe(t); let emp=0,juan=0,sofi=0,eusd=0; its.forEach(m=>{ const mo=parseMonto(m['Monto']); const cat=String(m['Categoria']||'').toLowerCase(); if(String(m['Moneda']||'').toUpperCase()==='USD'){ if(cat==='empresa')eusd+=mo; return } if(cat==='empresa')emp+=mo; else if(/juan/i.test(m['Descripcion']))juan+=mo; else if(/sof/i.test(m['Descripcion']))sofi+=mo }); return {emp,juan,sofi,eusd,n:its.length} }
  const esPagado=v=>{ const s=String(v||'').toUpperCase(); return s==='SÍ'||s==='SI'||s==='TRUE'||v===true }
  const vencTxt=(hoja,it)=>{ if(hoja==='GASTOS_FIJOS'){ const d=it['Dia pago']; return d?`vence día ${d}`:'' } const v=it['Vencimiento']; const d=parseD(v); return d?`vence ${d.getDate()}/${d.getMonth()+1}`:(v?String(v):'') }
  async function saveMonto(hoja,it,val){ const k=hoja+':'+it.__row, n=parseMontoAR(val)
    try{ const r=await fetch('/api/egreso-toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hoja,fila:it.__row,monto:n})})
      const j=await r.json(); if(j&&j.error){showToast(j.error,'err');return}
      showToast('Monto actualizado ✓'); setEditM(e=>{const x={...e};delete x[k];return x}); if(onRefresh) await onRefresh()
    }catch(e){ showToast('Error de conexión','err') } }
  const cuentaOpts=[...new Set(cuentas.filter(c=>{const a=String(c['Activa']||'').toUpperCase();return a==='SÍ'||a==='SI'||a==='TRUE'||c['Activa']===true}).map(c=>c['Nombre']).filter(Boolean))]

  // Un gasto "único" (impuesto/gasto puntual) solo aparece en su mes (Mes carga/Año carga). Los recurrentes (mensual), siempre.
  const gfActivos=gf.filter(g=>{
    const act=esPagado(g['Activo'])||String(g['Activo']||'').trim()===''
    if(!act) return false
    if(/[uú]nico/i.test(String(g['Frecuencia']||''))) return parseInt(g['Mes carga'])===mesIdx && String(g['Año carga']).includes(String(anio))
    return true
  })
  const porCat={}; gfActivos.forEach(g=>{ const c=g['Categoria']||'Otros'; (porCat[c]=porCat[c]||[]).push(g) })
  const totalGF=gfActivos.reduce((s,g)=>s+parseMonto(g['Monto']),0)
  // Las tarjetas se ubican por VENCIMIENTO (cuándo se pagan), no por el mes del resumen.
  // Ej: resumen de mayo con vto en junio → aparece en junio. Fallback al mes del resumen si no hay vencimiento.
  const tarjMes=tarj.filter(t=>{ const v=parseD(t['Vencimiento']); if(v) return v.getMonth()+1===mesIdx && v.getFullYear()===anio; return parseInt(t['Mes'])===mesIdx && String(t['Año']).includes(String(anio)) })
  const totalTarj=tarjMes.reduce((s,t)=>s+parseMonto(t['Monto']),0)
  // Dólares por tarjeta (se pagan aparte del monto en pesos)
  const usdDe=t=>parseMonto(t['Monto USD'])
  const usdPagado=t=>{ const k=t.__row; if(k in usdOv) return usdOv[k]; const pg=parseMonto(t['Monto pagado USD']), tot=usdDe(t); return tot>0 && pg>=tot-0.01 }
  const totalTarjUsd=tarjMes.reduce((s,t)=>s+usdDe(t),0)
  const totalTarjUsdPend=tarjMes.filter(t=>!usdPagado(t)).reduce((s,t)=>s+usdDe(t),0)
  // Préstamos: los del banco (cuotas del mes) vs deudas entre socios (Magma↔Juan/Sofi, sin cronograma)
  const esSocio=p=>/socio/i.test(String(p['Tipo']||''))
  const prestMes=prest.filter(p=>{ const v=parseD(p['Vencimiento']); return v && v.getMonth()+1===mesIdx && v.getFullYear()===anio })
  const prestBancoMes=prestMes.filter(p=>!esSocio(p))
  const prestSocio=prest.filter(p=>esSocio(p) && !esPagado(p['Saldado']))
  const totalPrest=prestBancoMes.reduce((s,p)=>s+parseMonto(p['Monto cuota']),0)
  const totalEgresos=totalGF+totalTarj+totalPrest
  // Movimientos del mes (plata que cambió de lugar, no gastos)
  const movMes=movim.filter(m=>{ const d=parseD(m['Fecha']); return d && d.getMonth()+1===mesIdx && d.getFullYear()===anio })
  async function toggleUsd(t){ const k=t.__row, pagado=!usdPagado(t)
    if(pagado && !window.confirm(`Marcar los US$ ${fmt(usdDe(t))} de ${t['Tarjeta']} como pagados aparte (no toca el pago en pesos). ¿Confirmás?`)) return
    setUsdOv(o=>({...o,[k]:pagado}))
    try{ const r=await fetch('/api/egreso-toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hoja:'TARJETAS', fila:t.__row, pagado, tipoPago:'usd'})})
      const j=await r.json(); if(j&&j.error){showToast(j.error,'err'); setUsdOv(o=>{const n={...o};delete n[k];return n}); return}
      showToast(pagado?'US$ pagado ✓':'US$ desmarcado'); if(onRefresh){ await onRefresh(); setUsdOv(o=>{const n={...o};delete n[k];return n}) }
    }catch(e){ showToast('Error de conexión','err'); setUsdOv(o=>{const n={...o};delete n[k];return n}) } }
  async function saldarSocio(p){ if(!window.confirm(`Marcar como SALDADA la deuda "${p['Prestamo']||`${p['Deudor']} → ${p['Acreedor']}`}" (${fmt(parseMonto(p['Monto cuota']))}). ¿Confirmás?`)) return
    try{ const r=await fetch('/api/prestamo-socio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({saldarFila:p.__row})})
      const j=await r.json(); if(j&&j.error){showToast(j.error,'err');return} showToast('Deuda saldada ✓'); if(onRefresh) await onRefresh()
    }catch(e){ showToast('Error de conexión','err') } }

  // === CUOTAS de tarjeta ya comprometidas (proyección a futuro) ===
  const cuotasAll=cuot.filter(c=>String(c['Estado']||'Activa').toLowerCase()!=='terminada' && (parseInt(c['Cuotas total'])||0)>(parseInt(c['Cuota actual'])||0))
  const absM=(m,a)=>a*12+(m-1)
  const persDe=c=>/juan/i.test(c['Persona'])?'Juan':/sof/i.test(c['Persona'])?'Sofi':'Magma'
  const cuotaEn=(c,m,a)=>{ const base=absM(parseInt(c['Mes base'])||7,parseInt(c['Año base'])||2026); const act=parseInt(c['Cuota actual'])||0, tot=parseInt(c['Cuotas total'])||0; const t=absM(m,a), last=base+(tot-act), first=base-(act-1); if(t<first||t>last)return null; return {num:act+(t-base), monto:parseMonto(c['Monto cuota'])} }
  const proxCuotas=[]; for(let k=0;k<6;k++){ const t=absM(mesIdx,anio)+k, m=(t%12)+1, a=Math.floor(t/12); const its=cuotasAll.map(c=>({c,e:cuotaEn(c,m,a)})).filter(x=>x.e); const per={Juan:0,Sofi:0,Magma:0}; its.forEach(({c,e})=>{ per[persDe(c)]+=e.monto }); proxCuotas.push({m,a,tot:its.reduce((s,x)=>s+x.e.monto,0),per,n:its.length}) }
  const totFutCuota=p=>cuotasAll.filter(c=>persDe(c)===p).reduce((s,c)=>s+parseMonto(c['Monto cuota'])*((parseInt(c['Cuotas total'])||0)-(parseInt(c['Cuota actual'])||0)),0)

  // Los GASTOS_FIJOS (sueldos, alquiler…) son recurrentes: se marcan PAGADOS por mes guardando la lista
  // de meses en "Meses pagados" (ej "7/2026, 8/2026"). Así cada mes es independiente. Tarjetas/préstamos = fila puntual.
  const mesKey=`${mesIdx}/${anio}`
  const estaPagado=(hoja,it)=>{ const k=hoja+':'+it.__row; if(k in override) return override[k]
    if(hoja==='GASTOS_FIJOS'){ return String(it['Meses pagados']||'').split(',').map(s=>s.trim()).includes(mesKey) }
    return esPagado(it['Pagado']) }
  async function toggle(hoja, it, montoItem){
    const k=hoja+':'+it.__row, pagado=!estaPagado(hoja,it)
    const cuenta = cuentaSel[k] || it['Cuenta pago'] || cuentaOpts[0] || ''
    if(pagado && !cuenta){ showToast('Elegí en qué cuenta pagás','err'); return }
    if(pagado && !window.confirm(`Marcar pagado ${fmt(montoItem)} desde ${cuenta}. Descuenta de esa cuenta. ¿Confirmás?`)) return
    setOverride(o=>({...o,[k]:pagado}))
    // La fecha de pago cae en el mes que estás viendo (hoy si es el mes actual, o el día de pago del mes visto).
    const enMesActual = mesIdx===now.getMonth()+1 && anio===now.getFullYear()
    const hoy = enMesActual ? `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()}` : `${it['Dia pago']||15}/${mesIdx}/${anio}`
    try{ const r=await fetch('/api/egreso-toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hoja, fila:it.__row, pagado, tipoPago:'total', cuentaPago:pagado?cuenta:'', fechaPago:pagado?hoy:'', mesPagoKey: hoja==='GASTOS_FIJOS'?mesKey:undefined})})
      const j=await r.json(); if(j&&j.error){showToast(j.error,'err'); setOverride(o=>{const n={...o};delete n[k];return n}); return}
      showToast(pagado?'Pagado ✓':'Desmarcado'); if(onRefresh){ await onRefresh(); setOverride(o=>{const n={...o};delete n[k];return n}) }
    }catch(e){ showToast('Error de conexión','err'); setOverride(o=>{const n={...o};delete n[k];return n}) }
  }

  const Fila=({hoja, it, label, monto, extra})=>{ const pagado=estaPagado(hoja,it), k=hoja+':'+it.__row, venc=vencTxt(hoja,it), editing=!!editM[k]
    return <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, padding:'10px 18px', borderTop:`1px solid ${T.border}`}}>
      <span style={{flex:1, minWidth:0}}>
        <span style={{fontSize:13, color:T.ink}}>{label}</span>
        {venc && <span style={{fontSize:10.5, color:T.ink3, marginLeft:8}}>· {venc}</span>}
        {extra}
      </span>
      {hoja==='GASTOS_FIJOS' && <button onClick={()=>setEditGasto(it)} title="Editar este gasto" style={{fontSize:13, padding:'3px 7px', borderRadius:6, border:`1px solid ${T.border}`, background:T.surface, color:T.ink3, cursor:'pointer'}}>✎</button>}
      {!pagado && cuentaOpts.length>0 && <select value={cuentaSel[k]||it['Cuenta pago']||cuentaOpts[0]} onChange={e=>setCuentaSel(c=>({...c,[k]:e.target.value}))} onClick={e=>e.stopPropagation()} style={{...selectStyle, padding:'5px 8px', fontSize:11.5}}>{cuentaOpts.map(c=><option key={c} value={c}>{c}</option>)}</select>}
      <button onClick={()=>toggle(hoja,it,monto)} style={{fontSize:11, padding:'3px 10px', borderRadius:6, border:'none', cursor:'pointer', background:pagado?T.posSoft:T.warnSoft, color:pagado?T.pos:T.warn, fontWeight:600}}>{pagado?'Pagado ✓':'Pendiente'}</button>
      {editing
        ? <input autoFocus inputMode="decimal" defaultValue={numAMontoAR(monto)} onBlur={e=>saveMonto(hoja,it,e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') e.target.blur(); if(e.key==='Escape') setEditM(x=>{const n={...x};delete n[k];return n}) }} style={{width:110, padding:'4px 7px', borderRadius:6, border:`1px solid ${T.brand}`, fontSize:13, fontFamily:MONO, textAlign:'right', outline:'none'}}/>
        : <span onClick={()=>setEditM(x=>({...x,[k]:true}))} title="Tocá para editar el monto" style={{fontSize:13, fontFamily:MONO, color:T.ink, minWidth:90, textAlign:'right', cursor:'pointer', borderBottom:`1px dashed ${T.border}`}}>{fmt(monto)}</span>}
    </div>
  }
  const Sec=({titulo, children})=> children && <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', marginBottom:14}}><CardHead>{titulo}</CardHead>{children}</div>

  return <>
    <PageHead title="Egresos" sub={`${MESES_LARGO[mesIdx-1]} ${anio}`}/>
    <div style={{display:'flex', gap:14, marginBottom:18}}>
      <Hero label="Total egresos del mes" value={fmt(totalEgresos)} accent={T.brand} sub={`Fijos ${fmtM(totalGF)} · Tarjetas ${fmtM(totalTarj)} · Préstamos ${fmtM(totalPrest)}${totalTarjUsdPend>0?` · 💵 US$ ${fmt(totalTarjUsdPend)} en dólares`:''}`}/>
    </div>
    <div style={{display:'flex', gap:10, alignItems:'center', marginBottom:16}}>
      <button onClick={()=>{ let m=mesIdx-1,a=anio; if(m<1){m=12;a--} setMesIdx(m);setAnio(a) }} style={navBtn}>←</button>
      <span style={{fontSize:13, fontWeight:600, color:T.ink, minWidth:120, textAlign:'center'}}>{MESES_LARGO[mesIdx-1]} {anio}</span>
      <button onClick={()=>{ let m=mesIdx+1,a=anio; if(m>12){m=1;a++} setMesIdx(m);setAnio(a) }} style={navBtn}>→</button>
      <div style={{flex:1}}/>
      <button onClick={()=>setAgregar(true)} style={{fontSize:12.5, fontWeight:700, padding:'9px 16px', borderRadius:9, border:'none', background:T.brand, color:'#fff', cursor:'pointer'}}>➕ Agregar</button>
    </div>
    <CuentaSocios showToast={showToast}/>
    {Object.entries(porCat).map(([cat,items])=>(
      <Sec key={cat} titulo={`Gastos fijos · ${cat}`}>{items.map((g,i)=><Fila key={i} hoja="GASTOS_FIJOS" it={g} label={g['Concepto']} monto={parseMonto(g['Monto'])}/>)}</Sec>
    ))}
    <div style={{display:'flex', justifyContent:'flex-end', marginBottom:8}}><button onClick={()=>setSubir(true)} style={{fontSize:12, fontWeight:600, padding:'7px 14px', borderRadius:9, border:'none', background:T.brand, color:'#fff', cursor:'pointer'}}>⬆ Subir resumen de tarjeta</button></div>
    <Sec titulo="Tarjetas">
      {totalTarjUsd>0 && <div style={{padding:'0 18px 8px', display:'flex', gap:8, alignItems:'center', fontSize:12}}>
        <span style={{color:T.ink2}}>💵 Dólares a pagar este mes: <b style={{fontFamily:MONO}}>US$ {fmt(totalTarjUsd)}</b></span>
        {totalTarjUsdPend>0 ? <span style={{fontSize:11, color:T.warn, background:T.warnSoft, padding:'2px 8px', borderRadius:6, fontWeight:600}}>pendiente US$ {fmt(totalTarjUsdPend)}</span> : <span style={{fontSize:11, color:T.pos, background:T.posSoft, padding:'2px 8px', borderRadius:6, fontWeight:600}}>todo pagado ✓</span>}
      </div>}
      {tarjMes.length?tarjMes.map((t,i)=>{ const rm=parseInt(t['Mes']); const res=rm>=1&&rm<=12?` · resumen ${MESES_LARGO[rm-1]}`:''; const pdf=t['PDF resumen']; const nota=t['Notas']; const sp=splitDe(t); const usd=usdDe(t); const upg=usdPagado(t); return <div key={i}>
      <Fila hoja="TARJETAS" it={t} label={`${t['Tarjeta']}${res}`} monto={parseMonto(t['Monto'])} extra={pdf?<a href={pdf} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{marginLeft:8, fontSize:11, color:T.brand, textDecoration:'none', fontWeight:600}}>📎 PDF</a>:null}/>
      {usd>0 && <div style={{padding:'0 18px 9px 18px', display:'flex', gap:10, alignItems:'center', fontSize:11.5}}>
        <span style={{color:T.ink3}}>💵 En dólares: <b style={{fontFamily:MONO, color:upg?T.pos:T.ink2}}>US$ {fmt(usd)}</b></span>
        <button onClick={()=>toggleUsd(t)} style={{fontSize:10.5, padding:'2px 9px', borderRadius:6, border:'none', cursor:'pointer', background:upg?T.posSoft:T.warnSoft, color:upg?T.pos:T.warn, fontWeight:600}}>{upg?'US$ pagado ✓':'US$ pendiente'}</button>
      </div>}
      {sp.n>0
        ? <div style={{padding:'0 18px 9px 18px', display:'flex', gap:14, alignItems:'center', flexWrap:'wrap', fontSize:11.5, color:T.ink3}}><span>🏢 Empresa {fmt(sp.emp)}{sp.eusd?` +US$${Math.round(sp.eusd)}`:''}</span><span>👨 Juan {fmt(sp.juan)}</span><span>👩 Sofi {fmt(sp.sofi)}</span><button onClick={()=>setDetalle(t)} style={{fontSize:11, color:T.brand, background:'none', border:'none', cursor:'pointer', fontWeight:600, padding:0}}>Ver detalle ›</button></div>
        : (nota&&/empresa/i.test(nota) ? <div style={{padding:'0 18px 9px 18px', fontSize:11.5, color:T.ink3, display:'flex', gap:14, flexWrap:'wrap'}}>{nota.split('·').map((p,k)=><span key={k}>{p.trim()}</span>)}</div> : null)}
    </div> }):<div style={{padding:'12px 18px', fontSize:12.5, color:T.ink3}}>Sin tarjetas a pagar este mes. Subí el resumen ⬆</div>}</Sec>
    <Sec titulo="Préstamos">{prestBancoMes.length?prestBancoMes.map((p,i)=>{ const tot=parseInt(String(p['Cuotas total']).replace(/\D/g,''))||0, nro=parseInt(String(p['Cuota nro']).replace(/\D/g,''))||0, faltan=Math.max(0,tot-nro); const v=parseD(p['Vencimiento']); const ult=v&&faltan?new Date(v.getFullYear(),v.getMonth()+faltan,1):null; const hasta=ult?` · hasta ${MESES_LARGO[ult.getMonth()].slice(0,3)}/${ult.getFullYear()}`:''; return <Fila key={i} hoja="PRESTAMOS" it={p} label={`${p['Prestamo']} · cuota ${nro}/${tot}${faltan?` · faltan ${faltan}${hasta}`:' · última ✓'}`} monto={parseMonto(p['Monto cuota'])}/> }):null}</Sec>
    {prestSocio.length>0 && <Sec titulo="Deudas entre socios">
      {prestSocio.map((p,i)=>{ const deudor=p['Deudor']||'', acreedor=p['Acreedor']||'', magmaDebe=/magma/i.test(deudor); const ic=n=>/juan/i.test(n)?'👤':/sof/i.test(n)?'👩':'🏢'; return <div key={i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, padding:'10px 18px', borderTop:`1px solid ${T.border}`}}>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:13, color:T.ink}}>{ic(deudor)} <b>{deudor}</b> le debe a {ic(acreedor)} <b>{acreedor}</b></div>
          <div style={{fontSize:11, color:T.ink3}}>{p['Prestamo']}{p['Notas']?` · ${p['Notas']}`:''}{magmaDebe?' · Magma tiene que devolver':' · le entra a Magma'}</div>
        </div>
        <span style={{fontSize:13.5, fontFamily:MONO, color:magmaDebe?T.warn:T.pos, fontWeight:600}}>{fmt(parseMonto(p['Monto cuota']))}</span>
        <button onClick={()=>saldarSocio(p)} style={{fontSize:11, padding:'3px 10px', borderRadius:6, border:`1px solid ${T.border}`, cursor:'pointer', background:T.surface, color:T.ink2, fontWeight:600}}>Marcar saldada</button>
      </div> })}
    </Sec>}
    {cuotasAll.length>0 && <Sec titulo="Cuotas de tarjeta a futuro (ya comprometidas)">
      <div style={{padding:'6px 18px 2px'}}>
        <div style={{display:'flex', gap:6, overflowX:'auto', paddingBottom:8}}>
          {proxCuotas.map((mm,i)=><div key={i} style={{minWidth:100, flex:'0 0 auto', background:i===0?T.brandSoft:T.surfaceAlt, borderRadius:9, padding:'8px 10px'}}>
            <div style={{fontSize:10.5, color:T.ink3, fontWeight:600}}>{MESES_LARGO[mm.m-1].slice(0,3)}/{String(mm.a).slice(2)}{i===0?' (este)':''}</div>
            <div style={{fontSize:14, fontWeight:700, fontFamily:MONO, color:T.ink}}>{fmt(mm.tot)}</div>
            <div style={{fontSize:9.5, color:T.ink3}}>{mm.n} cuota{mm.n===1?'':'s'}</div>
          </div>)}
        </div>
        <div style={{fontSize:11, color:T.ink3, marginBottom:4}}>Comprometido de acá en más: 👤 Juan {fmt(totFutCuota('Juan'))} · 👩 Sofi {fmt(totFutCuota('Sofi'))} · 🏢 Magma {fmt(totFutCuota('Magma'))}</div>
      </div>
      {[...cuotasAll].sort((a,b)=> (parseMonto(b['Monto cuota'])*((parseInt(b['Cuotas total'])||0)-(parseInt(b['Cuota actual'])||0))) - (parseMonto(a['Monto cuota'])*((parseInt(a['Cuotas total'])||0)-(parseInt(a['Cuota actual'])||0))) ).map((c,i)=>{
        const act=parseInt(c['Cuota actual'])||0, tot=parseInt(c['Cuotas total'])||0, faltan=Math.max(0,tot-act), lastT=absM(parseInt(c['Mes base'])||7,parseInt(c['Año base'])||2026)+faltan, lm=(lastT%12)+1, la=Math.floor(lastT/12), pIcon=persDe(c)==='Juan'?'👤':persDe(c)==='Sofi'?'👩':'🏢'
        return <div key={i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 18px', borderTop:`1px solid ${T.border}`}}>
          <div><div style={{fontSize:13, color:T.ink, fontWeight:500}}>{pIcon} {c['Comercio']} <span style={{fontSize:10.5, color:T.ink3, fontWeight:400}}>{c['Tarjeta']}</span></div><div style={{fontSize:11, color:T.ink3}}>cuota {act}/{tot} · faltan {faltan} · hasta {MESES_LARGO[lm-1].slice(0,3)}/{String(la).slice(2)}</div></div>
          <div style={{fontFamily:MONO, fontSize:13, color:T.ink2}}>{fmt(parseMonto(c['Monto cuota']))}<span style={{fontSize:10, color:T.ink3}}>/mes</span></div>
        </div>
      })}
    </Sec>}
    {movMes.length>0 && <Sec titulo="Movimientos del mes (cambios de plata, no gastos)">
      {movMes.map((m,i)=>{ const mo=String(m['Moneda origen']||'ARS').toUpperCase(), md=String(m['Moneda destino']||'ARS').toUpperCase(); const showM=(v,cur)=>cur==='USD'?`US$ ${fmt(parseMonto(v))}`:fmt(parseMonto(v)); return <div key={i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, padding:'9px 18px', borderTop:`1px solid ${T.border}`}}>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:13, color:T.ink}}>{m['Tipo']}{m['Descripción']?` · ${m['Descripción']}`:''}</div>
          <div style={{fontSize:11, color:T.ink3}}>{m['Fecha']}{m['Cuenta origen']?` · de ${m['Cuenta origen']}`:''}{m['Cuenta destino']?` → ${m['Cuenta destino']}`:''}{m['Persona']?` · ${m['Persona']}`:''}</div>
        </div>
        <span style={{fontSize:13, fontFamily:MONO, color:T.ink2}}>{m['Cuenta destino']&&parseMonto(m['Monto destino'])?showM(m['Monto destino'],md):showM(m['Monto origen'],mo)}</span>
      </div> })}
    </Sec>}
    {subir && <SubirResumen onClose={()=>setSubir(false)} onDone={()=>{ setSubir(false); if(onRefresh) onRefresh() }} showToast={showToast}/>}
    {agregar && <AgregarEgreso cuentaOpts={cuentaOpts} cuentas={cuentas} mesIdx={mesIdx} anio={anio} onClose={()=>setAgregar(false)} onDone={()=>{ setAgregar(false); if(onRefresh) onRefresh() }} showToast={showToast}/>}
    {editGasto && <EditarGasto g={editGasto} onClose={()=>setEditGasto(null)} onDone={()=>{ setEditGasto(null); if(onRefresh) onRefresh() }} showToast={showToast}/>}
    {detalle && <DetalleTarjeta t={detalle} items={itemsDe(detalle)} cuotas={cuotasAll.filter(c=>normTxt(c['Tarjeta'])===normTxt(detalle['Tarjeta']))} onClose={()=>setDetalle(null)} onRefresh={onRefresh} showToast={showToast}/>}
  </>
}

// Modal "Agregar": gasto (fijo o impuesto puntual) · movimiento de plata (dólares/transferencia/efectivo) · préstamo entre socios
function AgregarEgreso({cuentaOpts, cuentas, mesIdx, anio, onClose, onDone, showToast}){
  const [tab,setTab]=useState('gasto')
  const [saving,setSaving]=useState(false)
  const monedaCuenta=n=>{ const c=(cuentas||[]).find(x=>String(x['Nombre']||'').trim().toLowerCase()===String(n||'').trim().toLowerCase()); return /d[oó]lar|usd/i.test(String(c?.['Tipo']||'')+String(c?.['Nombre']||''))?'USD':'ARS' }
  // --- Gasto ---
  const pad2=n=>String(n).padStart(2,'0')
  const [g,setG]=useState(()=>({recurrencia:'unico', categoria:'Impuestos', concepto:'', monto:'', moneda:'ARS', diaPago:'', fecha:`${anio}-${pad2(mesIdx)}-${pad2(Math.min(new Date().getDate(),28))}`, pagado:false, cuentaPago:cuentaOpts.find(c=>!/d[oó]lar/i.test(c))||cuentaOpts[0]||'', notas:''}))
  const gFy=Number((g.fecha||'').split('-')[0])||anio, gFm=Number((g.fecha||'').split('-')[1])||mesIdx
  // --- Movimiento ---
  const [mv,setMv]=useState({tipo:'Compra dólares', cuentaOrigen:cuentaOpts.find(c=>!/d[oó]lar/i.test(c))||cuentaOpts[0]||'', cuentaDestino:cuentaOpts.find(c=>/d[oó]lar/i.test(c))||'', montoOrigen:'', montoDestino:'', descripcion:'', notas:''})
  const moOrig=monedaCuenta(mv.cuentaOrigen), moDest=monedaCuenta(mv.cuentaDestino), esConv=moOrig!==moDest
  const coti=esConv&&mv.montoOrigen&&mv.montoDestino ? (parseMontoAR(moOrig==='USD'?mv.montoDestino:mv.montoOrigen)/parseMontoAR(moOrig==='USD'?mv.montoOrigen:mv.montoDestino)) : 0
  // --- Préstamo socio ---
  const [pr,setPr]=useState({direccion:'a_magma', persona:'Sofi', monto:'', moneda:'ARS', ajusta:true, cuenta:cuentaOpts.find(c=>!/d[oó]lar/i.test(c))||cuentaOpts[0]||'', notas:''})

  async function post(url, body){ setSaving(true)
    try{ const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const j=await r.json(); if(j&&j.error){ showToast(j.error,'err'); setSaving(false); return false } setSaving(false); return true }
    catch(e){ showToast('Error de conexión','err'); setSaving(false); return false } }

  async function guardarGasto(){ if(!g.concepto.trim()){showToast('Poné el concepto','err');return} if(parseMontoAR(g.monto)<=0){showToast('El monto tiene que ser mayor a 0','err');return}
    if(g.pagado && !g.cuentaPago){showToast('Elegí de qué cuenta se pagó','err');return}
    // Puntual: la fecha del datepicker define el mes/año/día. Fijo: mes/año del que estás viendo + día de pago.
    let mesEnv=mesIdx, anioEnv=anio, diaEnv=g.diaPago, fechaPagoEnv=''
    if(g.recurrencia==='unico'){ const [Y,M,D]=(g.fecha||'').split('-').map(Number); if(Y&&M&&D){ anioEnv=Y; mesEnv=M; diaEnv=D; fechaPagoEnv=`${D}/${M}/${Y}` } }
    const ok=await post('/api/gasto-nuevo',{categoria:g.categoria, concepto:g.concepto, monto:parseMontoAR(g.monto), moneda:g.moneda, recurrencia:g.recurrencia, diaPago:diaEnv, mes:mesEnv, anio:anioEnv, notas:g.notas, pagado:g.pagado, cuentaPago:g.pagado?g.cuentaPago:'', fechaPago:g.pagado?(fechaPagoEnv||undefined):''})
    if(ok){ showToast(g.pagado?'Gasto agregado y pagado ✓':(g.recurrencia==='unico'?'Gasto agregado ✓':'Gasto fijo agregado ✓')); onDone() } }
  async function guardarMov(){ if(parseMontoAR(mv.montoOrigen)<=0){showToast('Poné el monto','err');return} if(esConv&&mv.cuentaDestino&&parseMontoAR(mv.montoDestino)<=0){showToast('Poné cuántos '+moDest+' entran','err');return}
    const ok=await post('/api/movimiento-nuevo',{tipo:mv.tipo, descripcion:mv.descripcion, cuentaOrigen:mv.cuentaOrigen, monedaOrigen:moOrig, montoOrigen:parseMontoAR(mv.montoOrigen), cuentaDestino:mv.cuentaDestino, monedaDestino:moDest, montoDestino:esConv?parseMontoAR(mv.montoDestino):parseMontoAR(mv.montoOrigen), cotizacion:coti?Math.round(coti):'', notas:mv.notas})
    if(ok){ showToast('Movimiento registrado ✓'); onDone() } }
  async function guardarPrestamo(){ if(parseMontoAR(pr.monto)<=0){showToast('Poné el monto','err');return}
    const aMagma=pr.direccion==='a_magma'  // socio → Magma (Magma le debe)
    const deudor=aMagma?'Magma':pr.persona, acreedor=aMagma?pr.persona:'Magma', efecto=aMagma?'entra':'sale'
    const ok=await post('/api/prestamo-socio',{nombre:`${deudor} debe a ${acreedor}`, deudor, acreedor, monto:parseMontoAR(pr.monto), moneda:pr.moneda, cuenta:pr.ajusta?pr.cuenta:'', efecto:pr.ajusta?efecto:'', notas:pr.notas})
    if(ok){ showToast('Préstamo registrado ✓'); onDone() } }

  const TabBtn=({id,label})=><button onClick={()=>setTab(id)} style={{flex:1, padding:'9px 8px', borderRadius:9, border:`1px solid ${tab===id?T.brand:T.border}`, background:tab===id?T.brandSoft:T.surface, color:tab===id?T.brand:T.ink2, fontSize:12.5, fontWeight:tab===id?700:500, cursor:'pointer'}}>{label}</button>

  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:200, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'40px 20px', overflowY:'auto'}}>
    <div onClick={e=>e.stopPropagation()} style={{background:T.surface, borderRadius:16, width:520, maxWidth:'100%', border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)', height:'fit-content'}}>
      <div style={{padding:'16px 22px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div style={{fontSize:16, fontWeight:700, color:T.ink}}>Agregar</div>
        <button onClick={onClose} style={{border:'none', background:'transparent', fontSize:22, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
      </div>
      <div style={{padding:'16px 22px'}}>
        <div style={{display:'flex', gap:8, marginBottom:16}}>
          <TabBtn id="gasto" label="💸 Gasto / Impuesto"/>
          <TabBtn id="movimiento" label="🔁 Movimiento"/>
          <TabBtn id="prestamo" label="🤝 Préstamo"/>
        </div>

        {tab==='gasto' && <>
          <div style={{display:'flex', gap:8, marginBottom:14}}>
            <button onClick={()=>setG(s=>({...s,recurrencia:'unico',categoria:s.categoria==='Otros'?'Impuestos':s.categoria}))} style={{flex:1, padding:'8px', borderRadius:8, border:`1px solid ${g.recurrencia==='unico'?T.brand:T.border}`, background:g.recurrencia==='unico'?T.brandSoft:T.surface, color:g.recurrencia==='unico'?T.brand:T.ink2, fontSize:12, fontWeight:600, cursor:'pointer'}}>Puntual / impuesto<div style={{fontSize:10, fontWeight:400, color:T.ink3}}>un solo pago</div></button>
            <button onClick={()=>setG(s=>({...s,recurrencia:'fijo'}))} style={{flex:1, padding:'8px', borderRadius:8, border:`1px solid ${g.recurrencia==='fijo'?T.brand:T.border}`, background:g.recurrencia==='fijo'?T.brandSoft:T.surface, color:g.recurrencia==='fijo'?T.brand:T.ink2, fontSize:12, fontWeight:600, cursor:'pointer'}}>Fijo mensual<div style={{fontSize:10, fontWeight:400, color:T.ink3}}>todos los meses</div></button>
          </div>
          {g.recurrencia==='unico' && <div style={{fontSize:11.5, color:T.ink3, marginBottom:12, background:T.surfaceAlt, padding:'8px 10px', borderRadius:8}}>Se carga en <b>{MESES_LARGO[gFm-1]} {gFy}</b> (según la fecha que elijas). Lo marcás pagado y se descuenta de la cuenta.</div>}
          <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:12}}>
            <Fld label="Categoría"><input list="ae-cats" value={g.categoria} onChange={e=>setG(s=>({...s,categoria:e.target.value}))} style={inpV2}/><datalist id="ae-cats"><option value="Impuestos"/><option value="Operativos"/><option value="Seguros"/><option value="Software"/><option value="Sueldos"/><option value="Otros"/></datalist></Fld>
            {g.recurrencia==='unico'
              ? <Fld label="Fecha"><input type="date" value={g.fecha} onChange={e=>setG(s=>({...s,fecha:e.target.value}))} style={inpV2}/></Fld>
              : <Fld label="Día de pago"><input value={g.diaPago} onChange={e=>setG(s=>({...s,diaPago:e.target.value}))} placeholder="ej 23" style={inpV2}/></Fld>}
          </div>
          <div style={{marginBottom:12}}><label style={lblV2}>Concepto *</label><input value={g.concepto} onChange={e=>setG(s=>({...s,concepto:e.target.value}))} placeholder={g.recurrencia==='unico'?'ej: IVA julio 2026':'ej: Seguro oficina'} style={inpV2} autoFocus/></div>
          <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:12}}>
            <Fld label="Monto *"><MontoInput value={g.monto} onChange={v=>setG(s=>({...s,monto:v}))} placeholder="0" style={{...inpV2, fontFamily:MONO}}/></Fld>
            <Fld label="Moneda"><select value={g.moneda} onChange={e=>setG(s=>({...s,moneda:e.target.value}))} style={inpV2}><option>ARS</option><option>USD</option></select></Fld>
          </div>
          <div style={{marginBottom:12, background:g.pagado?T.posSoft:T.surfaceAlt, borderRadius:8, padding:'10px 12px'}}>
            <label style={{display:'flex', gap:8, alignItems:'center', fontSize:13, color:T.ink2, cursor:'pointer', fontWeight:600}}>
              <input type="checkbox" checked={g.pagado} onChange={e=>setG(s=>({...s,pagado:e.target.checked}))}/>
              ✅ Ya está pagado (descontar de una cuenta ahora)
            </label>
            {g.pagado && <div style={{marginTop:10}}><label style={lblV2}>Pagado desde</label><select value={g.cuentaPago} onChange={e=>setG(s=>({...s,cuentaPago:e.target.value}))} style={inpV2}>{cuentaOpts.map(c=><option key={c} value={c}>{c}</option>)}</select></div>}
          </div>
          <div style={{marginBottom:16}}><label style={lblV2}>Nota (opcional)</label><input value={g.notas} onChange={e=>setG(s=>({...s,notas:e.target.value}))} style={inpV2}/></div>
          <button disabled={saving} onClick={guardarGasto} style={btnAgregar(saving)}>{saving?'Guardando…':`${g.pagado?'Agregar y marcar pagado':`Agregar ${g.recurrencia==='unico'?'gasto puntual':'gasto fijo'}`}`}</button>
        </>}

        {tab==='movimiento' && <>
          <div style={{marginBottom:12}}><label style={lblV2}>Tipo de movimiento</label>
            <select value={mv.tipo} onChange={e=>setMv(s=>({...s,tipo:e.target.value}))} style={inpV2}>
              <option>Compra dólares</option><option>Venta dólares</option><option>Transferencia entre cuentas</option><option>Retiro de efectivo</option><option>Depósito de efectivo</option><option>Otro</option>
            </select>
          </div>
          <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:12}}>
            <Fld label="Sale de"><select value={mv.cuentaOrigen} onChange={e=>setMv(s=>({...s,cuentaOrigen:e.target.value}))} style={inpV2}>{cuentaOpts.map(c=><option key={c} value={c}>{c}</option>)}</select></Fld>
            <Fld label="Entra a"><select value={mv.cuentaDestino} onChange={e=>setMv(s=>({...s,cuentaDestino:e.target.value}))} style={inpV2}><option value="">— (no entra a otra cuenta)</option>{cuentaOpts.map(c=><option key={c} value={c}>{c}</option>)}</select></Fld>
          </div>
          <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:12}}>
            <Fld label={`Monto que sale (${moOrig})`}><MontoInput value={mv.montoOrigen} onChange={v=>setMv(s=>({...s,montoOrigen:v}))} placeholder="0" style={{...inpV2, fontFamily:MONO}} autoFocus/></Fld>
            {esConv && mv.cuentaDestino && <Fld label={`Monto que entra (${moDest})`}><MontoInput value={mv.montoDestino} onChange={v=>setMv(s=>({...s,montoDestino:v}))} placeholder="0" style={{...inpV2, fontFamily:MONO}}/></Fld>}
          </div>
          {esConv && mv.cuentaDestino && coti>0 && <div style={{fontSize:11.5, color:T.ink3, marginBottom:12}}>Tipo de cambio: <b style={{fontFamily:MONO}}>${Math.round(coti).toLocaleString('es-AR')}</b> por dólar</div>}
          <div style={{marginBottom:16}}><label style={lblV2}>Nota (opcional)</label><input value={mv.notas} onChange={e=>setMv(s=>({...s,notas:e.target.value}))} placeholder="ej: para pagar tarjeta en dólares" style={inpV2}/></div>
          <div style={{fontSize:11, color:T.ink3, marginBottom:12}}>Esto NO cuenta como gasto del mes — solo mueve los saldos de las cuentas.</div>
          <button disabled={saving} onClick={guardarMov} style={btnAgregar(saving)}>{saving?'Guardando…':'Registrar movimiento'}</button>
        </>}

        {tab==='prestamo' && <>
          <div style={{display:'flex', gap:8, marginBottom:14}}>
            <button onClick={()=>setPr(s=>({...s,direccion:'a_magma'}))} style={{flex:1, padding:'8px', borderRadius:8, border:`1px solid ${pr.direccion==='a_magma'?T.brand:T.border}`, background:pr.direccion==='a_magma'?T.brandSoft:T.surface, color:pr.direccion==='a_magma'?T.brand:T.ink2, fontSize:11.5, fontWeight:600, cursor:'pointer'}}>Un socio le presta a Magma<div style={{fontSize:10, fontWeight:400, color:T.ink3}}>Magma le debe</div></button>
            <button onClick={()=>setPr(s=>({...s,direccion:'de_magma'}))} style={{flex:1, padding:'8px', borderRadius:8, border:`1px solid ${pr.direccion==='de_magma'?T.brand:T.border}`, background:pr.direccion==='de_magma'?T.brandSoft:T.surface, color:pr.direccion==='de_magma'?T.brand:T.ink2, fontSize:11.5, fontWeight:600, cursor:'pointer'}}>Magma le presta a un socio<div style={{fontSize:10, fontWeight:400, color:T.ink3}}>el socio le debe</div></button>
          </div>
          <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:12}}>
            <Fld label="Socio"><input list="ae-socios" value={pr.persona} onChange={e=>setPr(s=>({...s,persona:e.target.value}))} style={inpV2}/><datalist id="ae-socios"><option value="Sofi"/><option value="Juan"/></datalist></Fld>
            <Fld label="Monto *"><MontoInput value={pr.monto} onChange={v=>setPr(s=>({...s,monto:v}))} placeholder="ej 650.000" style={{...inpV2, fontFamily:MONO}} autoFocus/></Fld>
            <Fld label="Moneda"><select value={pr.moneda} onChange={e=>setPr(s=>({...s,moneda:e.target.value}))} style={inpV2}><option>ARS</option><option>USD</option></select></Fld>
          </div>
          <label style={{display:'flex', gap:8, alignItems:'center', fontSize:12.5, color:T.ink2, marginBottom:10, cursor:'pointer'}}>
            <input type="checkbox" checked={pr.ajusta} onChange={e=>setPr(s=>({...s,ajusta:e.target.checked}))}/>
            {pr.direccion==='a_magma'?'La plata ya entró a una cuenta (sumar saldo)':'La plata salió de una cuenta (restar saldo)'}
          </label>
          {pr.ajusta && <div style={{marginBottom:12}}><label style={lblV2}>Cuenta</label><select value={pr.cuenta} onChange={e=>setPr(s=>({...s,cuenta:e.target.value}))} style={inpV2}>{cuentaOpts.map(c=><option key={c} value={c}>{c}</option>)}</select></div>}
          <div style={{marginBottom:16}}><label style={lblV2}>Nota (opcional)</label><input value={pr.notas} onChange={e=>setPr(s=>({...s,notas:e.target.value}))} style={inpV2}/></div>
          <div style={{fontSize:11.5, color:T.ink3, marginBottom:12, background:T.surfaceAlt, padding:'8px 10px', borderRadius:8}}>Queda en <b>Préstamos → Deudas entre socios</b>: {pr.direccion==='a_magma'?`Magma le debe ${fmt(parseMontoAR(pr.monto))} a ${pr.persona}`:`${pr.persona} le debe ${fmt(parseMontoAR(pr.monto))} a Magma`}</div>
          <button disabled={saving} onClick={guardarPrestamo} style={btnAgregar(saving)}>{saving?'Guardando…':'Registrar préstamo'}</button>
        </>}
      </div>
    </div>
  </div>
}
const btnAgregar=disabled=>({width:'100%', padding:'11px', borderRadius:10, border:'none', background:disabled?T.ink3:T.brand, color:'#fff', fontSize:13.5, fontWeight:700, cursor:disabled?'default':'pointer'})

// Editar un gasto ya cargado (concepto, categoría, monto, día). Si ya está pagado y cambia el monto, ajusta la cuenta.
function EditarGasto({g, onClose, onDone, showToast}){
  const [f,setF]=useState({Concepto:g['Concepto']||'', Categoria:g['Categoria']||'', Monto:numAMontoAR(parseMonto(g['Monto'])), 'Dia pago':g['Dia pago']||''})
  const [saving,setSaving]=useState(false)
  const pagado=/^s[íi]$|^true$/i.test(String(g['Pagado']||''))||String(g['Meses pagados']||'').trim()!==''
  async function guardar(){
    if(!String(f.Concepto).trim()){showToast('Poné el concepto','err');return}
    if(parseMontoAR(f.Monto)<=0){showToast('El monto tiene que ser mayor a 0','err');return}
    setSaving(true)
    try{ const r=await fetch('/api/gasto-editar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fila:g.__row, cambios:{Concepto:f.Concepto, Categoria:f.Categoria, Monto:parseMontoAR(f.Monto), 'Dia pago':f['Dia pago']}})})
      const j=await r.json(); if(j&&j.error){showToast(j.error,'err');setSaving(false);return}
      showToast('Gasto actualizado ✓'+(j.ajusteCuenta?` · cuenta ajustada ${fmt(Math.abs(j.ajusteCuenta))}`:'')); onDone()
    }catch(e){ showToast('Error de conexión','err'); setSaving(false) } }
  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:210, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'40px 20px', overflowY:'auto'}}>
    <div onClick={e=>e.stopPropagation()} style={{background:T.surface, borderRadius:16, width:460, maxWidth:'100%', border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)', height:'fit-content'}}>
      <div style={{padding:'16px 22px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div style={{fontSize:16, fontWeight:700, color:T.ink}}>Editar gasto</div>
        <button onClick={onClose} style={{border:'none', background:'transparent', fontSize:22, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
      </div>
      <div style={{padding:'16px 22px'}}>
        <div style={{marginBottom:12}}><label style={lblV2}>Concepto</label><input value={f.Concepto} onChange={e=>setF(s=>({...s,Concepto:e.target.value}))} style={inpV2} autoFocus/></div>
        <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:12}}>
          <div style={{flex:'1 1 140px'}}><label style={lblV2}>Categoría</label><input value={f.Categoria} onChange={e=>setF(s=>({...s,Categoria:e.target.value}))} style={inpV2}/></div>
          <div style={{flex:'0 1 100px'}}><label style={lblV2}>Día de pago</label><input value={f['Dia pago']} onChange={e=>setF(s=>({...s,['Dia pago']:e.target.value}))} placeholder="ej 23" style={inpV2}/></div>
        </div>
        <div style={{marginBottom:14}}><label style={lblV2}>Monto{String(g['Moneda']||'').toUpperCase()==='USD'?' (USD)':''}</label><MontoInput value={f.Monto} onChange={v=>setF(s=>({...s,Monto:v}))} style={{...inpV2, fontFamily:MONO}}/></div>
        {pagado && parseMontoAR(f.Monto)!==parseMonto(g['Monto']) && <div style={{fontSize:11.5, color:T.ink2, marginBottom:12, background:T.warnSoft, padding:'8px 10px', borderRadius:8}}>Este gasto ya figura <b>pagado</b>. Al cambiar el monto ajusto la cuenta <b>{g['Cuenta pago']||'—'}</b> por la diferencia (de {fmt(parseMonto(g['Monto']))} a {fmt(parseMontoAR(f.Monto))}).</div>}
        <button disabled={saving} onClick={guardar} style={btnAgregar(saving)}>{saving?'Guardando…':'Guardar cambios'}</button>
      </div>
    </div>
  </div>
}

// Ver detalle de una tarjeta: gastos ya guardados, con toggle Personal <-> Empresa (guarda al instante)
function DetalleTarjeta({t, items, cuotas=[], onClose, onRefresh, showToast}){
  const [busy,setBusy]=useState('')
  // Todos los consumos son editables (Personal ⇄ Magma). Solo los cargos bancarios quedan como agregado fijo.
  const esCargo=m=>/banc/i.test(`${m['Subcategoria']||''} ${m['Comercio']||''}`)
  const indiv=items.filter(m=>!esCargo(m))
  const agg=items.filter(esCargo)
  const itemsSum=items.filter(m=>String(m['Moneda']||'').toUpperCase()!=='USD').reduce((s,m)=>s+parseMonto(m['Monto']),0)
  const totalCard=parseMonto(t['Monto'])
  const deuda=totalCard-itemsSum
  const porPersona={}; indiv.forEach(m=>{ const p=/juan/i.test(m['Descripcion'])?'👨 Juan':/sof/i.test(m['Descripcion'])?'👩 Sofi':(m['Descripcion']||'Otros'); (porPersona[p]=porPersona[p]||[]).push(m) })
  async function flip(m){ if(busy) return; const nueva=String(m['Categoria']||'').toLowerCase()==='empresa'?'Personal':'Empresa'; setBusy(m.__row)
    try{ const r=await fetch('/api/movimiento-clasificar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fila:m.__row,categoria:nueva})}); const j=await r.json(); if(j&&j.error){ showToast(j.error,'err'); setBusy(''); return } showToast(nueva==='Empresa'?'→ Empresa 🏢':'→ Personal 👤'); if(onRefresh) await onRefresh() }
    catch(e){ showToast('Error de conexión','err') } setBusy('') }
  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20}}>
    <div onClick={e=>e.stopPropagation()} style={{background:T.surface, borderRadius:14, padding:20, width:540, maxWidth:'100%', maxHeight:'88vh', overflow:'auto', border:`1px solid ${T.border}`}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
        <h3 style={{margin:0, fontSize:16, fontWeight:700, color:T.ink}}>{t['Tarjeta']} · {MESES_LARGO[(parseInt(t['Mes'])||1)-1]} {t['Año']}</h3>
        <button onClick={onClose} style={{border:'none', background:'transparent', fontSize:22, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
      </div>
      <div style={{fontSize:11.5, color:T.ink3, marginBottom:14}}>Tocá un gasto para pasarlo de Personal 👤 a Empresa 🏢 (o al revés). Se guarda al instante.</div>
      {indiv.length===0 && <div style={{fontSize:12.5, color:T.ink3, padding:'10px 0'}}>Este resumen no tiene el detalle guardado (cargalo por “Subir resumen” para poder editarlo acá).</div>}
      {Object.entries(porPersona).map(([p,arr])=><div key={p} style={{marginBottom:14}}>
        <div style={{fontSize:12, fontWeight:700, color:T.ink2, marginBottom:2}}>{p} · {arr.length}</div>
        {arr.map((m,i)=>{ const emp=String(m['Categoria']||'').toLowerCase()==='empresa'; return <div key={i} onClick={()=>flip(m)} style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, padding:'6px 4px', cursor:'pointer', borderTop:i?`1px solid ${T.border}`:'none', opacity:busy===m.__row?0.4:1}}>
          <span style={{fontSize:12.5, color:emp?T.pos:T.ink2, fontWeight:emp?600:400}}>{emp?'🏢':'👤'} {m['Comercio']} <span style={{color:T.ink3, fontSize:11}}>{m['Fecha']}{String(m['Moneda']||'').toUpperCase()==='USD'?' · USD':''}</span></span>
          <span style={{fontFamily:MONO, fontSize:12.5, color:emp?T.pos:T.ink2}}>{String(m['Moneda']||'').toUpperCase()==='USD'?`US$${fmt(parseMonto(m['Monto']))}`:fmt(parseMonto(m['Monto']))}</span>
        </div> })}
      </div>)}
      {agg.length?<div style={{marginTop:6, paddingTop:10, borderTop:`1px solid ${T.border}`}}><div style={{fontSize:10, fontWeight:700, color:T.ink3, textTransform:'uppercase', letterSpacing:0.3, marginBottom:4}}>Cargos bancarios (fijo)</div>{agg.map((m,i)=><div key={i} style={{display:'flex', justifyContent:'space-between', fontSize:12, color:T.ink3, padding:'2px 4px'}}><span>{m['Comercio']} · {m['Descripcion']}</span><span style={{fontFamily:MONO}}>{fmt(parseMonto(m['Monto']))}{String(m['Moneda']||'').toUpperCase()==='USD'?' US$':''}</span></div>)}</div>:null}
      {deuda>1000?<div style={{marginTop:8, paddingTop:10, borderTop:`1px solid ${T.border}`}}><div style={{display:'flex', justifyContent:'space-between', fontSize:12.5, color:T.ink2, fontWeight:600}}><span>💳 Deuda del mes pasado (financiada)</span><span style={{fontFamily:MONO}}>{fmt(deuda)}</span></div><div style={{fontSize:10.5, color:T.ink3, marginTop:2}}>No es gasto de este mes — es deuda que se arrastra. Seguimiento en la solapa DEUDA_TARJETAS.</div></div>:null}
      <div style={{marginTop:10, paddingTop:10, borderTop:`2px solid ${T.border}`, display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:700, color:T.ink}}><span>Total del resumen (a pagar)</span><span style={{fontFamily:MONO}}>{fmt(totalCard)}</span></div>
      {cuotas.length>0 && <div style={{marginTop:12, paddingTop:10, borderTop:`1px solid ${T.border}`}}>
        <div style={{fontSize:10, fontWeight:700, color:T.ink3, textTransform:'uppercase', letterSpacing:0.3, marginBottom:6}}>Cuotas en curso de esta tarjeta ({cuotas.length})</div>
        {cuotas.map((c,i)=>{ const act=parseInt(c['Cuota actual'])||0, tot=parseInt(c['Cuotas total'])||0, faltan=Math.max(0,tot-act), pIcon=/juan/i.test(c['Persona'])?'👤':/sof/i.test(c['Persona'])?'👩':'🏢'; return <div key={i} style={{display:'flex', justifyContent:'space-between', fontSize:12, padding:'3px 0', color:T.ink2}}>
          <span>{pIcon} {c['Comercio']} <span style={{color:T.ink3, fontSize:10.5}}>cuota {act}/{tot} · faltan {faltan}</span></span>
          <span style={{fontFamily:MONO}}>{fmt(parseMonto(c['Monto cuota']))}/mes</span>
        </div> })}
      </div>}
    </div>
  </div>
}

// Clasifica un movimiento de tarjeta en un rubro + si es empresa, según las reglas de Magma.
function rubroTarjeta(m){
  const txt=`${m.comercio||''} ${m.descripcion||''}`, cat=m.categoria||''
  const has=re=>new RegExp(re,'i').test(txt)
  if(has('ypf|axion|shell|puma|appypf|\\baca\\b|combust|nafta')) return {r:'⛽ Combustible', emp:true}
  if(cat==='Transporte'||has('cabify|didi|uber|subte|emova|peaje|autopista|parking|valet|estacion')) return {r:'🚗 Movilidad', emp:true}
  if(cat==='Suscripciones'||has('adobe|canva|openai|anthropic|claude|artlist|notion|google|higgsfield|motionarray|\\bsirv\\b|wetransfer|workspace')) return {r:'💻 Software', emp:true}
  if(cat==='Viajes'||has('hotel|hilton|posada de los poetas|airbnb|hosped')) return {r:'🏨 Viajes', emp:true}
  if(has('segur|la segunda')) return {r:'🛡️ Seguros', emp:true}
  if(has('dia tienda 317|dia 317')) return {r:'🛒 Insumos (Dia 317)', emp:true}
  if(has('mercadolibre|mercado libre')) return {r:'📦 Mercado Libre', emp:true}
  if(has('\\babl\\b')) return {r:'🏛️ ABL', emp:true}
  if(has('dandy|gangahome|la roble|laroble|mecubrocom')) return {r:'🏢 Varios empresa', emp:true}
  if(cat==='Producción audiovisual') return {r:'🎬 Producción', emp:true}
  if(cat==='Profesional/Servicios') return {r:'🧑‍💼 Servicios', emp:true}
  if(cat==='Cargos bancarios') return {r:'🏦 Cargos bancarios', emp:true}
  if(cat==='Comida y bebida'||has('rappi|coto|carrefour|jumbo|super|resto|cafe|mostaza|grido|helad|pizz|parrilla')) return {r:'🍔 Comida y súper', emp:false}
  return {r:'🛍️ Otros personales', emp:false}
}

// Subir PDF de resumen de tarjeta → IA lo lee → preview agrupado → carga total + movimientos
function SubirResumen({onClose, onDone, showToast}){
  const now=new Date()
  const [tarjeta,setTarjeta]=useState('BBVA Visa')
  const [mes,setMes]=useState(now.getMonth()+1)
  const [anio,setAnio]=useState(now.getFullYear())
  const [file,setFile]=useState(null)
  const [b64,setB64]=useState('')
  const [loading,setLoading]=useState(false)
  const [data,setData]=useState(null)
  const [saving,setSaving]=useState(false)
  const [override,setOverride]=useState({})  // "ti:j" -> 'Empresa' | 'Personal' (marca final del usuario, pisa la de la IA)
  const [expand,setExpand]=useState('')       // 'juan' | 'sofi' | ''
  const TARJS=['BBVA Visa','Master Galicia','Santander Visa','Santander Amex']
  async function procesar(){
    if(!file){ showToast('Elegí el PDF','err'); return }
    setLoading(true)
    try{
      const b=await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result).split(',')[1]); r.onerror=rej; r.readAsDataURL(file) })
      setB64(b)
      const r=await fetch('/api/tarjeta-procesar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pdfBase64:b,fileName:file.name})})
      const j=await r.json(); if(!j.ok){ showToast(j.error||'No se pudo leer el PDF','err'); setLoading(false); return }
      setData(j.data)
    }catch(e){ showToast('Error de conexión','err') }
    setLoading(false)
  }
  const titulares=Array.isArray(data?.titulares)?data.titulares:[]
  const totalPagar=Number(data?.total_a_pagar_ars ?? 0)
  const totalPagarUsd=Number(data?.total_a_pagar_usd ?? 0)
  // Aplanar TODOS los movimientos (empresa + personal). Fallback al formato viejo (personales) = Personal.
  const movsAll=[]
  titulares.forEach((t,ti)=>{ const arr=Array.isArray(t.movimientos)?t.movimientos:(t.personales||[]).map(p=>({...p,categoria:'Personal'})); arr.forEach((it,j)=>movsAll.push({ ti, j, key:ti+':'+j, titular:t.nombre||it.titular||'', fecha:it.fecha||'', comercio:it.comercio||'', monto:Number(it.monto)||0, moneda:String(it.moneda||'ARS').toUpperCase(), rubro:it.rubro||it.subcategoria||'', cuota:it.cuota||'', catAI: String(it.categoria||'Personal').toLowerCase()==='empresa'?'Empresa':'Personal' })) })
  const catOf=m=>override[m.key]||m.catAI
  const isEmp=m=>catOf(m)==='Empresa'
  const sumIf=pred=>movsAll.filter(pred).reduce((s,m)=>s+m.monto,0)
  const idxJuan=titulares.findIndex(t=>/juan/i.test(t.nombre||''))
  const idxSofi=titulares.findIndex(t=>/sof/i.test(t.nombre||''))
  const empresaUsd=sumIf(m=>m.moneda==='USD'&&isEmp(m))
  const empresa=sumIf(m=>m.moneda==='ARS'&&isEmp(m))
  const personalTot=sumIf(m=>m.moneda==='ARS'&&!isEmp(m))
  const consumos=empresa+personalTot
  const persTit=ti=>sumIf(m=>m.ti===ti&&m.moneda==='ARS'&&!isEmp(m))
  const juanPers=idxJuan>=0?persTit(idxJuan):0
  const sofiPers=idxSofi>=0?persTit(idxSofi):0
  const otrosPers=Math.max(0,personalTot-juanPers-sofiPers)
  const rubEmp={}; movsAll.filter(m=>m.moneda==='ARS'&&isEmp(m)).forEach(m=>{ const k=m.rubro||'Empresa'; rubEmp[k]=(rubEmp[k]||0)+m.monto })
  const rubEmpArr=Object.entries(rubEmp).sort((a,b)=>b[1]-a[1])
  const lecturaOk=movsAll.length>0
  const expIdx=expand==='juan'?idxJuan:expand==='sofi'?idxSofi:-1
  const expList=movsAll.filter(m=>m.ti===expIdx)
  const toggleItem=m=>setOverride(o=>({...o,[m.key]: isEmp(m)?'Personal':'Empresa'}))
  async function confirmar(){
    setSaving(true)
    try{
      // cada movimiento con su marca final → se guarda ítem por ítem (después editable en el detalle de la tarjeta)
      const movs=movsAll.map(m=>({ fecha:m.fecha, titular:m.titular, comercio:m.comercio, monto:m.monto, moneda:m.moneda, categoria:catOf(m), subcategoria: catOf(m)==='Empresa'?(m.rubro||'Empresa'):'Personal', cuota:m.cuota||'' }))
      const nota=lecturaOk?`Magma ${Math.round(empresa).toLocaleString('es-AR')}${empresaUsd?` (+US$${empresaUsd.toFixed(0)})`:''} · Juan ${Math.round(juanPers).toLocaleString('es-AR')} · Sofi ${Math.round(sofiPers).toLocaleString('es-AR')}`:'Total cargado (clasificación pendiente)'
      const r=await fetch('/api/tarjeta-guardar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tarjeta,mes,anio,movimientos:movs,movimientosCompletos:true,totalArs:totalPagar,totalUsd:totalPagarUsd,vencimiento:data.vencimiento,resumenNota:nota,pdfBase64:b64,fileName:file?.name})})
      const j=await r.json(); if(j&&j.error){ showToast(j.error,'err'); setSaving(false); return }
      showToast(j.pdfLink?'Cargado ✓ · PDF en Drive':'Cargado ✓'); onDone&&onDone()
    }catch(e){ showToast('Error de conexión','err'); setSaving(false) }
  }
  const inp={padding:'8px 10px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13, outline:'none'}
  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20}}>
    <div onClick={e=>e.stopPropagation()} style={{background:T.surface, borderRadius:14, padding:22, width:500, maxWidth:'100%', maxHeight:'90vh', overflow:'auto', border:`1px solid ${T.border}`}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
        <h3 style={{margin:0, fontSize:17, fontWeight:700, color:T.ink}}>Subir resumen de tarjeta</h3>
        <button onClick={onClose} style={{border:'none', background:'transparent', fontSize:22, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
      </div>
      {!data ? <>
        <div style={{display:'flex', gap:8, marginBottom:12, flexWrap:'wrap'}}>
          <select value={tarjeta} onChange={e=>setTarjeta(e.target.value)} style={{...inp, flex:'1 1 160px'}}>{TARJS.map(t=><option key={t} value={t}>{t}</option>)}</select>
          <select value={mes} onChange={e=>setMes(parseInt(e.target.value))} style={{...inp, width:120}}>{MESES_LARGO.map((m,i)=><option key={i} value={i+1}>{m}</option>)}</select>
          <select value={anio} onChange={e=>setAnio(parseInt(e.target.value))} style={{...inp, width:90}}>{[2025,2026].map(a=><option key={a} value={a}>{a}</option>)}</select>
        </div>
        <input type="file" accept="application/pdf" onChange={e=>setFile(e.target.files?.[0]||null)} style={{marginBottom:16, fontSize:13, color:T.ink2}}/>
        <button onClick={procesar} disabled={loading} style={{width:'100%', padding:'11px', borderRadius:10, border:'none', background:loading?T.ink3:T.brand, color:'#fff', fontSize:14, fontWeight:600, cursor:loading?'default':'pointer'}}>{loading?'📄 Leyendo con IA…':'Leer PDF'}</button>
        <div style={{fontSize:11.5, color:T.ink3, marginTop:10}}>La IA lee el PDF, extrae los consumos y estima Empresa vs Personal. Antes de guardar te muestra el resumen.</div>
      </> : <>
        <div style={{background:T.surfaceAlt, borderRadius:10, padding:14, marginBottom:14}}>
          <div style={{fontSize:12, color:T.ink3}}>{tarjeta} · resumen {MESES_LARGO[mes-1]} {anio}{data.vencimiento?` · vence ${data.vencimiento}`:''}</div>
          <div style={{fontSize:22, fontWeight:700, color:T.ink, fontFamily:MONO, marginTop:4}}>{fmt(totalPagar)}{totalPagarUsd?`  + US$${totalPagarUsd}`:''}</div>
          <div style={{fontSize:12, color:T.ink3, marginTop:2}}>total a pagar (saldo del resumen){consumos?` · consumos del mes ${fmt(consumos)}`:''}</div>
        </div>
        {lecturaOk ? <>
        <div style={{fontSize:11.5, color:T.ink3, marginBottom:6, fontWeight:600}}>Tocá Juan o Sofi para ver sus consumos y marcar cada uno 🏢 Magma o 👤 personal.</div>
        <div style={{display:'flex', gap:8, marginBottom:10}}>
          <div style={{flex:1, background:T.posSoft, borderRadius:10, padding:'10px 12px'}}><div style={{fontSize:11, color:T.ink3}}>🏢 Magma</div><div style={{fontSize:15, fontWeight:700, fontFamily:MONO, color:T.ink}}>{fmt(empresa)}</div>{empresaUsd?<div style={{fontSize:10.5, color:T.ink3, fontFamily:MONO}}>+US${empresaUsd.toFixed(0)}</div>:null}</div>
          {idxJuan>=0 && <div onClick={()=>setExpand(e=>e==='juan'?'':'juan')} style={{flex:1, background:expand==='juan'?T.brandSoft:T.surfaceAlt, borderRadius:10, padding:'10px 12px', cursor:'pointer'}}><div style={{fontSize:11, color:T.ink3}}>👤 Juan {expand==='juan'?'▴':'▾'}</div><div style={{fontSize:15, fontWeight:700, fontFamily:MONO, color:T.ink}}>{fmt(juanPers)}</div></div>}
          {idxSofi>=0 && <div onClick={()=>setExpand(e=>e==='sofi'?'':'sofi')} style={{flex:1, background:expand==='sofi'?T.brandSoft:T.surfaceAlt, borderRadius:10, padding:'10px 12px', cursor:'pointer'}}><div style={{fontSize:11, color:T.ink3}}>👤 Sofi {expand==='sofi'?'▴':'▾'}</div><div style={{fontSize:15, fontWeight:700, fontFamily:MONO, color:T.ink}}>{fmt(sofiPers)}</div></div>}
        </div>
        {expand && expList.length ? <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:'8px 12px', marginBottom:12, maxHeight:260, overflow:'auto'}}>
          <div style={{fontSize:11, color:T.ink3, marginBottom:6}}>Consumos de {expand==='juan'?'Juan':'Sofi'} — tocá para cambiar 👤 personal ⇄ 🏢 Magma</div>
          {expList.map((m,i)=>{ const on=isEmp(m); return <div key={m.key} onClick={()=>toggleItem(m)} style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, padding:'6px 2px', cursor:'pointer', borderTop:i?`1px solid ${T.border}`:'none'}}>
            <span style={{fontSize:12.5, color:on?T.pos:T.ink2, fontWeight:on?600:400}}>{on?'🏢':'👤'} {m.comercio} <span style={{color:T.ink3, fontSize:11}}>{m.fecha}{m.moneda==='USD'?' · US$':''}</span></span>
            <span style={{fontFamily:MONO, fontSize:12.5, color:on?T.pos:T.ink2}}>{fmt(m.monto)}</span>
          </div> })}
        </div> : null}
        {rubEmpArr.length?<div style={{background:T.surfaceAlt, borderRadius:10, padding:'10px 14px', marginBottom:12}}><div style={{fontSize:10, fontWeight:700, color:T.ink3, marginBottom:4, textTransform:'uppercase', letterSpacing:0.4}}>Qué hay en Magma</div>{rubEmpArr.map(([k,v])=><div key={k} style={{display:'flex', justifyContent:'space-between', fontSize:12.5, padding:'2px 0', color:T.ink2}}><span>{k}</span><span style={{fontFamily:MONO}}>{fmt(v)}</span></div>)}</div>:null}
        {otrosPers>0?<div style={{fontSize:11.5, color:T.ink3, marginBottom:12}}>Otros titulares (personal): {fmt(otrosPers)}</div>:null}
        <div style={{fontSize:10.5, color:T.ink3, marginBottom:12}}>Se guarda cada consumo con tu marca (después editable en el detalle de la tarjeta) + el total + el PDF en Drive.</div>
        </> : <div style={{background:T.warnSoft, color:T.warn, borderRadius:10, padding:'11px 14px', fontSize:12, marginBottom:14, fontWeight:500}}>⚠ No pude clasificar bien este resumen. Igual cargo el <b>total a pagar</b> correcto — la división Empresa/Juan/Sofi la hacemos aparte.</div>}
        <div style={{display:'flex', gap:8}}>
          <button onClick={()=>setData(null)} style={{padding:'10px 16px', borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:600, cursor:'pointer'}}>← Otro</button>
          <button onClick={confirmar} disabled={saving} style={{flex:1, padding:'11px', borderRadius:10, border:'none', background:saving?T.ink3:T.pos, color:'#fff', fontSize:14, fontWeight:600, cursor:saving?'default':'pointer'}}>{saving?'Guardando…':'Confirmar y cargar'}</button>
        </div>
      </>}
    </div>
  </div>
}

// ============================ FREELANCER (alta / datos) ============================
const RUBROS_DEFAULT=['Fotógrafo','Videógrafo','Editor','Filmmaker','Dirección de foto','Sonidista','Drone','Asistente','Productor','Motion','Colorista','Iluminador']
function FreelancerModal({nombre, datos={}, rubrosConocidos=[], onClose, onSaved, showToast}){
  const [nombreEdit,setNombreEdit]=useState(nombre||'')
  const [rubros,setRubros]=useState(()=>String(datos['Rubro']||'').split(',').map(s=>s.trim()).filter(Boolean))
  const [rubroInput,setRubroInput]=useState('')
  const fnInit=()=>{ const v=datos['Fecha de nac']||datos['Fecha de Nac']||''; return v?(String(v).includes('/')?dmyToISO(v):v):'' }
  const [form,setForm]=useState(()=>({ celular:datos['Celular']||'', mailFreelancer:datos['Mail']||'', dni:datos['Dni']||'', fechaNac:fnInit(), cuit:datos['CUIT/CUIL']||'', banco:datos['Banco']||'', alias:datos['Alias']||'', cbu:datos['CBU']||'',
    tarifaMedia:datos['Tarifa media jornada']||'', tarifaJornada:datos['Tarifa jornada']||'', zona:datos['Zona']||'', estado:datos['Estado']||'', notas:datos['Notas']||'' }))
  const [saving,setSaving]=useState(false)
  const existe = datos && Object.keys(datos).length>0
  const sugeridos=[...new Set([...RUBROS_DEFAULT, ...rubrosConocidos])].filter(r=>r&&!rubros.includes(r)).sort()
  const addRubro=(t)=>{ const v=String(t||'').trim(); if(v&&!rubros.includes(v)) setRubros(rs=>[...rs,v]); setRubroInput('') }
  const campos=[['tarifaMedia','Tarifa media jornada'],['tarifaJornada','Tarifa jornada completa'],['zona','Zona'],
    ['celular','Celular'],['mailFreelancer','Mail'],['dni','DNI'],['fechaNac','Fecha de nacimiento','date'],['cuit','CUIT / CUIL'],['banco','Banco'],['alias','Alias'],['cbu','CBU']]
  async function guardar(){
    if(!String(nombreEdit).trim()){ showToast('El nombre no puede quedar vacío','err'); return }
    setSaving(true)
    const body={ nombre:nombreEdit.trim(), nombreOriginal:nombre, rubro:rubros.join(', '), ...form, fechaNac: form.fechaNac?isoToDMY(form.fechaNac):'' }
    try{ const r=await fetch('/api/freelancer-upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const j=await r.json(); if(!j.ok){showToast(j.error||'Error','err');setSaving(false);return} showToast(`${String(nombreEdit).split(' ')[0]} guardado`); onSaved&&onSaved() }
    catch(e){ showToast('Error de conexión','err'); setSaving(false) }
  }
  return <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(26,25,23,0.35)',zIndex:950,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'48px 20px',overflowY:'auto'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%',maxWidth:500,background:T.surface,borderRadius:16,border:`1px solid ${T.border}`,boxShadow:'0 16px 50px rgba(0,0,0,0.15)',height:'fit-content'}}>
      <div style={{padding:'18px 22px',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div><div style={{fontSize:16,fontWeight:700,color:T.ink}}>{existe?'Datos del freelancer':'Nuevo freelancer'}</div><div style={{fontSize:12,color:T.ink3,marginTop:2}}>{nombre}</div></div>
        <button onClick={onClose} style={{border:'none',background:'transparent',fontSize:20,color:T.ink3,cursor:'pointer',lineHeight:1}}>×</button>
      </div>
      <div style={{padding:'18px 22px'}}>
        <div style={{marginBottom:14}}><label style={lblV2}>Nombre y apellido</label><input value={nombreEdit} onChange={e=>setNombreEdit(e.target.value)} style={inpV2}/></div>
        {/* Rubro como etiquetas */}
        <label style={lblV2}>Rubro (etiquetas)</label>
        <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>
          {rubros.map((r,i)=>(
            <span key={i} style={{display:'inline-flex',alignItems:'center',gap:5,padding:'4px 9px',borderRadius:20,background:T.brandSoft,color:T.brand,fontSize:12,fontWeight:600}}>{r}<button onClick={()=>setRubros(rs=>rs.filter((_,j)=>j!==i))} style={{border:'none',background:'transparent',color:T.brand,cursor:'pointer',fontSize:13,padding:0,lineHeight:1}}>×</button></span>
          ))}
          {rubros.length===0 && <span style={{fontSize:12,color:T.ink3}}>Sin rubros todavía</span>}
        </div>
        <input list="fl-rubros" value={rubroInput} onChange={e=>{ const v=e.target.value; if(v.includes(',')){addRubro(v.replace(',',''))}else setRubroInput(v) }} onKeyDown={e=>{ if(e.key==='Enter'){e.preventDefault();addRubro(rubroInput)} }} placeholder="Escribí y Enter (ej: Fotógrafo, Editor…)" style={{...inpV2,marginBottom:6}}/>
        <datalist id="fl-rubros">{sugeridos.map(r=><option key={r} value={r}/>)}</datalist>
        <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:16}}>
          {sugeridos.slice(0,8).map(r=><button key={r} onClick={()=>addRubro(r)} style={{padding:'3px 9px',borderRadius:20,border:`1px solid ${T.border}`,background:T.surface,color:T.ink2,fontSize:11.5,cursor:'pointer'}}>+ {r}</button>)}
        </div>
        {/* Estado: para filtrar el roster real de los que ya no trabajan */}
        <div style={{marginBottom:12}}>
          <label style={lblV2}>Estado</label>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {['Activo','Candidato','Inactivo','No llamar'].map(e=>(
              <button key={e} onClick={()=>setForm(f=>({...f,estado:f.estado===e?'':e}))}
                style={{padding:'5px 12px',borderRadius:20,border:`1px solid ${form.estado===e?T.brand:T.border}`,background:form.estado===e?T.brandSoft:T.surface,color:form.estado===e?T.brand:T.ink2,fontSize:12,fontWeight:form.estado===e?600:500,cursor:'pointer'}}>{e}</button>
            ))}
          </div>
        </div>
        {/* Resto de campos */}
        <div style={{display:'flex',flexWrap:'wrap',gap:12}}>
          {campos.map(([k,l,tipo])=>(
            <div key={k} style={{flex:'1 1 45%',minWidth:160}}><label style={lblV2}>{l}</label><input type={tipo||'text'} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={inpV2}/></div>
          ))}
        </div>
        <div style={{marginTop:12}}>
          <label style={lblV2}>Notas (lo que hay que saber de esta persona)</label>
          <textarea value={form.notas} onChange={e=>setForm(f=>({...f,notas:e.target.value}))} rows={2}
            placeholder="Ej: buenísimo con drone · no cobra IVA · avisar con 3 días"
            style={{...inpV2,resize:'vertical',fontFamily:'inherit'}}/>
        </div>
      </div>
      <div style={{padding:'14px 22px',borderTop:`1px solid ${T.border}`,display:'flex',gap:10,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{padding:'9px 18px',borderRadius:9,border:`1px solid ${T.border}`,background:T.surface,color:T.ink2,fontSize:13,fontWeight:500,cursor:'pointer'}}>Cancelar</button>
        <button onClick={guardar} disabled={saving} style={{padding:'9px 22px',borderRadius:9,border:'none',background:T.brand,color:'#fff',fontSize:13.5,fontWeight:600,cursor:saving?'default':'pointer',opacity:saving?0.6:1}}>{saving?'Guardando…':'Guardar'}</button>
      </div>
    </div>
  </div>
}

// ============================ MAIL A STAFF (facturación) ============================
function MailStaffModal({persona, datos={}, cuentas=[], mesNombre, onClose, onSent, showToast}){
  // Entidades fiscales (a quién factura el freelancer) con sus datos, desde CUENTAS
  const entidades={}; cuentas.forEach(c=>{ const ef=c['Entidad fiscal']; if(ef && !entidades[ef]) entidades[ef]={ titular:c['Titular']||'', datos:c['Datos transferencia adicionales']||'' } })
  const FACTURAR_OPC=Object.keys(entidades).length?Object.keys(entidades):['Somos Magma SRL']
  const [para,setPara]=useState(datos['Mail']||'')
  const [cc,setCc]=useState([]), [ccInput,setCcInput]=useState('')
  const [tipo,setTipo]=useState('factura')
  const [saving,setSaving]=useState(false)
  const [facturarA,setFacturarA]=useState(FACTURAR_OPC.find(e=>/somos magma/i.test(e))||FACTURAR_OPC[0])
  const PRECARGADOS=['admin@somosmagma.com','juan@somosmagma.com','sofi@somosmagma.com']
  const pend=persona.trabajos.filter(t=>!t.pagado)
  const items=pend.map(t=>`- ${t.pedido} — ${t.proyecto}${t.agencia?` (${t.agencia})`:''}${t.fechaEvento?` [${t.fechaEvento}]`:''}: ${fmt(t.precio)}`).join('\n')
  const tot=pend.reduce((s,t)=>s+t.precio,0)
  const nombre=String(persona.nombre).split(' ')[0]
  const ent=entidades[facturarA]||{}
  const lineasFact=[`Facturá a: ${facturarA}`]
  if(ent.titular && ent.titular.toLowerCase()!==facturarA.toLowerCase()) lineasFact.push(ent.titular)
  if(ent.datos) lineasFact.push(ent.datos)
  const cuerpo = tipo==='efectivo'
    ? `Hola ${nombre}!\n\nTe paso el detalle de los trabajos de ${mesNombre}:\n\n${items}\n\nTotal: ${fmt(tot)}\n\nEste pago es en EFECTIVO — no hace falta factura.\n\n¡Gracias!`
    : `Hola ${nombre}!\n\nTe paso el detalle de los trabajos de ${mesNombre} para que nos hagas factura:\n\n${items}\n\nTotal: ${fmt(tot)}\n\n${lineasFact.join('\n')}\nCuando tengas la factura lista mandala a admin@somosmagma.com\n\n¡Gracias!`
  const addCc=(v)=>{ const x=String(v||'').trim(); if(x&&!cc.includes(x)) setCc(c=>[...c,x]); setCcInput('') }
  const asuntoMail=`Facturación ${mesNombre} — Somos Magma`
  // Envía DE VERDAD desde admin@somosmagma.com (server-side), sin abrir Outlook.
  async function enviar(){
    if(!para.trim()){ showToast('Falta el mail del freelancer','err'); return }
    setSaving(true)
    try{ const r=await fetch('/api/pago-staff-enviar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:para.trim(), cc, asunto:asuntoMail, cuerpo})})
      const j=await r.json(); if(j&&j.error){ showToast(j.error,'err'); setSaving(false); return }
      showToast('Mail enviado ✓ (desde admin@somosmagma.com)'); if(onSent) onSent(); onClose()
    }catch(e){ showToast('Error de conexión','err'); setSaving(false) } }
  // Fallback: abrir en el cliente de mail propio (por si hiciera falta).
  function abrir(){
    if(!para.trim()){ showToast('Falta el mail del freelancer','err'); return }
    const ccStr=cc.length?`&cc=${encodeURIComponent(cc.join(','))}`:''
    window.location.href=`mailto:${encodeURIComponent(para.trim())}?subject=${encodeURIComponent(asuntoMail)}${ccStr}&body=${encodeURIComponent(cuerpo)}`
    if(onSent) onSent(); onClose()
  }
  return <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(26,25,23,0.35)',zIndex:950,display:'flex',justifyContent:'center',overflowY:'auto',padding:'40px 20px'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%',maxWidth:560,background:T.surface,borderRadius:16,border:`1px solid ${T.border}`,boxShadow:'0 16px 50px rgba(0,0,0,0.18)',height:'fit-content'}}>
      <div style={{padding:'18px 22px',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div><div style={{fontSize:16,fontWeight:700,color:T.ink}}>Mail a {persona.nombre}</div><div style={{fontSize:12,color:T.ink3,marginTop:2}}>{pend.length} trabajos · {fmt(tot)}</div></div>
        <button onClick={onClose} style={{border:'none',background:'transparent',fontSize:20,color:T.ink3,cursor:'pointer',lineHeight:1}}>×</button>
      </div>
      <div style={{padding:'18px 22px'}}>
        <label style={lblV2}>Para</label>
        <input value={para} onChange={e=>setPara(e.target.value)} placeholder="mail del freelancer" style={{...inpV2,marginBottom:13}}/>
        <label style={lblV2}>CC (opcional)</label>
        <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:6}}>
          {cc.map((c,i)=><span key={i} style={{display:'inline-flex',alignItems:'center',gap:5,padding:'4px 9px',borderRadius:20,background:T.surfaceAlt,color:T.ink2,fontSize:12}}>{c}<button onClick={()=>setCc(cs=>cs.filter((_,j)=>j!==i))} style={{border:'none',background:'transparent',color:T.ink3,cursor:'pointer',fontSize:13,padding:0,lineHeight:1}}>×</button></span>)}
        </div>
        <input value={ccInput} onChange={e=>setCcInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addCc(ccInput)}}} placeholder="Agregar mail y Enter" style={{...inpV2,marginBottom:6}}/>
        <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:14}}>
          {PRECARGADOS.filter(m=>!cc.includes(m)).map(m=><button key={m} onClick={()=>addCc(m)} style={{padding:'3px 9px',borderRadius:20,border:`1px solid ${T.border}`,background:T.surface,color:T.ink2,fontSize:11.5,cursor:'pointer'}}>+ {m}</button>)}
        </div>
        <label style={lblV2}>Tipo de pago</label>
        <div style={{display:'flex',gap:8,marginBottom:tipo==='factura'?10:14}}>
          {[['factura','Por factura'],['efectivo','Efectivo (sin factura)']].map(([k,l])=>(
            <button key={k} onClick={()=>setTipo(k)} style={{flex:1,padding:'8px',borderRadius:9,fontSize:12.5,fontWeight:600,cursor:'pointer',border:`1px solid ${tipo===k?T.ink:T.border}`,background:tipo===k?T.ink:T.surface,color:tipo===k?'#fff':T.ink2}}>{l}</button>
          ))}
        </div>
        {tipo==='factura' && <div style={{marginBottom:14}}>
          <label style={lblV2}>Facturar a</label>
          <select value={facturarA} onChange={e=>setFacturarA(e.target.value)} style={inpV2}>{FACTURAR_OPC.map(o=><option key={o} value={o}>{o}</option>)}</select>
          {ent.datos && <div style={{fontSize:11, color:T.ink3, marginTop:5}}>{ent.datos}</div>}
        </div>}
        <label style={lblV2}>Vista previa</label>
        <textarea readOnly value={cuerpo} rows={8} style={{...inpV2,resize:'vertical',fontSize:12,fontFamily:MONO,color:T.ink2}}/>
      </div>
      <div style={{padding:'14px 22px',borderTop:`1px solid ${T.border}`,display:'flex',gap:10,alignItems:'center',justifyContent:'flex-end',flexWrap:'wrap'}}>
        <span style={{fontSize:11,color:T.ink3,marginRight:'auto'}}>Sale de <b>admin@somosmagma.com</b></span>
        <button onClick={()=>{navigator.clipboard?.writeText(cuerpo);showToast('Mensaje copiado')}} style={{padding:'9px 14px',borderRadius:9,border:`1px solid ${T.border}`,background:T.surface,color:T.ink2,fontSize:12.5,fontWeight:500,cursor:'pointer'}}>Copiar</button>
        <button onClick={abrir} style={{padding:'9px 14px',borderRadius:9,border:`1px solid ${T.border}`,background:T.surface,color:T.ink2,fontSize:12.5,fontWeight:500,cursor:'pointer'}}>Abrir en Outlook</button>
        <button onClick={enviar} disabled={saving} style={{padding:'9px 22px',borderRadius:9,border:'none',background:T.brand,color:'#fff',fontSize:13.5,fontWeight:700,cursor:saving?'default':'pointer',opacity:saving?0.6:1}}>{saving?'Enviando…':'✉ Enviar mail'}</button>
      </div>
    </div>
  </div>
}

// ============================ BUSCADOR GLOBAL (⌘K) ============================
function GlobalSearch({data, onClose, onNavegar}){
  const [q,setQ]=useState(''), [idx,setIdx]=useState(0)
  const inputRef=useRef(null)
  useEffect(()=>{ inputRef.current?.focus() },[])
  const [recientes,setRecientes]=useState(()=>{try{return JSON.parse(localStorage.getItem('magma_search_recent')||'[]')}catch(e){return []}})
  const guardarReciente=(r)=>{ const item={tipo:r.tipo,icon:r.icon,mod:r.mod,titulo:r.titulo,sub:r.sub,color:r.color,q:r.q}; const nueva=[item,...recientes.filter(x=>x.titulo!==r.titulo||x.tipo!==r.tipo)].slice(0,6); setRecientes(nueva); try{localStorage.setItem('magma_search_recent',JSON.stringify(nueva))}catch(e){} }
  const nq=normTxt(q.trim())

  const res=[]
  if(nq.length>=1){
    ;(data?.presupuestos||[]).forEach(p=>{ const num=String(p['Columna 1']||''),cli=String(p['Cliente']||''),ag=String(p['Agencia']||''),pr=String(p['Proyecto']||''); if(normTxt(num+' '+cli+' '+ag+' '+pr).includes(nq)) res.push({tipo:'Presupuesto',icon:'📋',mod:'presupuestos',titulo:'#'+num+' · '+(cli||ag||'—'),sub:pr,meta:p['Estado']||'',color:T.brand,q:num}) })
    ;(data?.proyectos||[]).forEach(p=>{ const num=String(p['N° presupuesto']||''),cli=String(p['Cliente']||''),ag=String(p['Agencia']||''),pr=String(p['Proyecto']||''); if(normTxt(num+' '+cli+' '+ag+' '+pr).includes(nq)) res.push({tipo:'Proyecto',icon:'🎬',mod:'proyectos',titulo:'#'+num+' · '+(cli||ag||'—'),sub:pr,meta:p['Fecha Evento']||'',color:T.pos,q:num}) })
    ;(data?.facturacion||[]).forEach(f=>{ const num=String(f['N° Presupuesto']||''),cli=String(f['Cliente']||''),ag=String(f['Agencia']||''),pr=String(f['Proyecto']||''); if(normTxt(num+' '+cli+' '+ag+' '+pr).includes(nq)) res.push({tipo:'Factura',icon:'💵',mod:'facturacion',titulo:'#'+num+' · '+(cli||ag||'—'),sub:pr,meta:isCobrada(f)?'Cobrada':'Pendiente',color:T.warn,q:num}) })
    ;(data?.rrhh||[]).forEach(r=>{ const nombre=String(r['Nombre Apellido']||r['Nombre']||''),rubro=String(r['Rubro']||''),mail=String(r['Mail']||''); if(nombre.trim()&&normTxt(nombre+' '+rubro+' '+mail).includes(nq)) res.push({tipo:'Freelancer',icon:'👤',mod:'pagos',titulo:nombre,sub:rubro,meta:'',color:T.ink2,q:nombre}) })
    ;(data?.agencias||[]).forEach(a=>{ const nombre=String(a['Nombre']||''); if(nombre.trim()&&normTxt(nombre).includes(nq)) res.push({tipo:'Agencia',icon:'🏢',mod:'agencias',titulo:nombre,sub:a['Condicion IVA']||'',meta:'',color:T.ink2,q:nombre}) })
    ;(data?.clientes||[]).forEach(c=>{ const nombre=String(c['Nombre']||''); if(nombre.trim()&&normTxt(nombre).includes(nq)) res.push({tipo:'Cliente',icon:'🎯',mod:'clientes',titulo:nombre,sub:c['Industria']||'',meta:'',color:T.ink2,q:nombre}) })
    ;(data?.contactos||[]).forEach(c=>{ const nombre=String(c['Nombre']||''),agencia=String(c['Agencia']||''),tel=String(c['Teléfono']||''),mail=String(c['Mail']||''); if(nombre.trim()&&normTxt(nombre+' '+agencia+' '+tel+' '+mail).includes(nq)) res.push({tipo:'Contacto',icon:'☎',mod:'contactos',titulo:nombre,sub:agencia,meta:c['Cargo']||'',color:T.ink2,q:nombre}) })
  }
  const visibles=res.slice(0,30)
  useEffect(()=>{ setIdx(0) },[q])
  const elegir=(r)=>{ guardarReciente(r); onNavegar(r.mod, r.q) }
  const onKey=(e)=>{ if(e.key==='ArrowDown'){e.preventDefault();setIdx(i=>Math.min(visibles.length-1,i+1))} if(e.key==='ArrowUp'){e.preventDefault();setIdx(i=>Math.max(0,i-1))} if(e.key==='Enter'&&visibles[idx]){e.preventDefault();elegir(visibles[idx])} }

  const Row=({r,activo})=> <div onClick={()=>elegir(r)} onMouseEnter={()=>{}} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 18px',cursor:'pointer',background:activo?T.surfaceAlt:'transparent',borderLeft:`2px solid ${activo?T.brand:'transparent'}`}}>
    <span style={{fontSize:15,width:20,textAlign:'center'}}>{r.icon}</span>
    <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,color:T.ink,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.titulo}</div>{r.sub&&<div style={{fontSize:11.5,color:T.ink3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.sub}</div>}</div>
    <span style={{fontSize:10.5,color:T.ink3,textTransform:'uppercase',letterSpacing:0.3}}>{r.tipo}</span>
    {r.meta&&<span style={{fontSize:11,color:T.ink2}}>{r.meta}</span>}
  </div>

  return <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(26,25,23,0.35)',zIndex:1000,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:90}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'90%',maxWidth:600,background:T.surface,borderRadius:14,border:`1px solid ${T.border}`,overflow:'hidden',boxShadow:'0 20px 60px rgba(0,0,0,0.2)'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'14px 18px',borderBottom:`1px solid ${T.border}`}}>
        <span style={{fontSize:15}}>🔍</span>
        <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} onKeyDown={onKey} placeholder="Buscar presupuesto, proyecto, factura, freelancer, cliente…" style={{flex:1,border:'none',outline:'none',background:'transparent',fontSize:15,color:T.ink}}/>
        <span style={{fontSize:10.5,fontFamily:MONO,padding:'2px 6px',borderRadius:4,background:T.surfaceAlt,color:T.ink3}}>esc</span>
      </div>
      <div style={{maxHeight:'56vh',overflowY:'auto'}}>
        {nq.length===0
          ? (recientes.length>0 ? <>
              <div style={{fontSize:10.5,fontWeight:600,letterSpacing:0.4,textTransform:'uppercase',color:T.ink3,padding:'10px 18px 4px'}}>Recientes</div>
              {recientes.map((r,i)=><Row key={i} r={r} activo={false}/>)}
            </> : <div style={{padding:'28px 18px',textAlign:'center',fontSize:13,color:T.ink3}}>Escribí para buscar en toda la app</div>)
          : visibles.length===0
            ? <div style={{padding:'28px 18px',textAlign:'center',fontSize:13,color:T.ink3}}>Sin resultados para “{q}”</div>
            : visibles.map((r,i)=><Row key={r.mod+i} r={r} activo={i===idx}/>)}
      </div>
      {visibles.length>0 && <div style={{padding:'8px 18px',borderTop:`1px solid ${T.border}`,fontSize:11,color:T.ink3,display:'flex',gap:14}}><span>↑↓ moverse</span><span>↵ abrir</span><span>{res.length} resultado{res.length!==1?'s':''}</span></div>}
    </div>
  </div>
}

// ============================ PIEZAS UI ============================
function Hero({label, value, sub, subStrong, subStrongColor, accent, desglose}){
  return <div style={{flex:1, padding:'22px 24px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:14}}>
    <div style={{fontSize:11, fontWeight:600, letterSpacing:0.5, textTransform:'uppercase', color:T.ink3}}>{label}</div>
    <div style={{fontSize:33, fontWeight:600, fontFamily:MONO, color:accent||T.ink, marginTop:12, letterSpacing:-0.5}}>{value}</div>
    <div style={{fontSize:12.5, color:T.ink2, marginTop:9}}>{sub}{subStrong && <span style={{color:subStrongColor||T.ink, fontWeight:600}}>{subStrong}</span>}</div>
    {desglose && <div style={{marginTop:12, paddingTop:11, borderTop:`1px solid ${T.border}`, display:'grid', gap:5}}>
      {desglose.map((d,i)=>(
        <div key={i} onClick={d.onClick} style={{display:'flex', justifyContent:'space-between', gap:10, fontSize:12, cursor:d.onClick?'pointer':'default'}}>
          <span style={{color:T.ink3, textDecoration:d.onClick?'underline':'none', textUnderlineOffset:3}}>{d.l}</span>
          <span style={{fontFamily:MONO, color:d.c||T.ink, fontWeight:600}}>{d.v}</span>
        </div>
      ))}
    </div>}
  </div>
}
function Stat({label, value, color, sub}){
  return <div style={{flex:'1 1 130px', minWidth:120, padding:'14px 16px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:11}}>
    <div style={{fontSize:10.5, fontWeight:600, letterSpacing:0.3, textTransform:'uppercase', color:T.ink3}}>{label}</div>
    <div style={{fontSize:19, fontWeight:600, fontFamily:MONO, color:color||T.ink, marginTop:7}}>{value}</div>
    {sub&&<div style={{fontSize:10.5, color:T.ink3, marginTop:4, lineHeight:1.3}}>{sub}</div>}
  </div>
}
function SectionTitle({children}){ return <div style={{fontSize:12.5, fontWeight:600, color:T.ink2, letterSpacing:0.3, textTransform:'uppercase', margin:'30px 0 13px'}}>{children}</div> }
function CardHead({children}){ return <div style={{padding:'13px 18px', fontSize:12.5, fontWeight:600, color:T.ink}}>{children}</div> }
function ResumenLine({label, value, color}){ return <div style={{display:'flex', justifyContent:'space-between', padding:'6px 0'}}><span style={{fontSize:12.5, color:T.ink2}}>{label}</span><span style={{fontSize:12.5, fontFamily:MONO, color:color||T.ink}}>{value}</span></div> }
function Empty({children}){ return <div style={{padding:'22px 18px', fontSize:12.5, color:T.ink3, textAlign:'center'}}>{children}</div> }
function PageHead({title, sub}){ return <div style={{marginBottom:22}}><h1 style={{fontSize:23, fontWeight:700, color:T.ink, margin:0, letterSpacing:-0.3}}>{title}</h1><div style={{fontSize:13, color:T.ink3, marginTop:3}}>{sub}</div></div> }
function Placeholder({label}){ return <div style={{padding:'80px 20px', textAlign:'center'}}><div style={{fontSize:18, fontWeight:600, color:T.ink, marginBottom:8}}>{label}</div><div style={{fontSize:13.5, color:T.ink2, maxWidth:420, margin:'0 auto', lineHeight:1.5}}>Esta vista todavía vive en la app actual. Si te gusta la dirección de Dashboard y Presupuestos, la aplicamos acá también.</div></div> }
function Center({children}){ return <div style={{display:'flex', alignItems:'center', justifyContent:'center', height:'70vh', color:T.ink2, fontSize:14}}>{children}</div> }

function Shell({children}){
  return <>
    <Head>
      <title>Somos Magma</title>
      <link rel="preconnect" href="https://fonts.googleapis.com"/>
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
      <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@300;400;500;600;700&family=Azeret+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
    </Head>
    <style jsx global>{`
      * { box-sizing: border-box; }
      html, body { margin:0; padding:0; background:${T.bg}; font-family:'Archivo', -apple-system, system-ui, sans-serif; color:${T.ink}; -webkit-font-smoothing:antialiased; }
      ::-webkit-scrollbar { width:8px; height:8px; }
      ::-webkit-scrollbar-thumb { background:#D8D4CD; border-radius:8px; }
      ::-webkit-scrollbar-track { background:transparent; }
      select, input, button { font-family:inherit; }
    `}</style>
    {children}
  </>
}

const selectStyle = { padding:'9px 11px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:12.5, cursor:'pointer', outline:'none' }
const inpV2 = { width:'100%', padding:'9px 12px', borderRadius:9, border:`1px solid ${T.border}`, background:T.bg, color:T.ink, fontSize:13.5, outline:'none' }
const lblV2 = { fontSize:11, fontWeight:600, color:T.ink2, textTransform:'uppercase', letterSpacing:0.3, display:'block', marginBottom:5 }
// Campo con label. A nivel módulo a propósito (ver nota de MontoInput).
const Fld=({label,children})=><div style={{flex:'1 1 140px'}}><label style={lblV2}>{label}</label>{children}</div>
// Input de plata: formatea mientras escribís (100.000,55) y mantiene el cursor donde estaba.
// OJO: tiene que vivir a nivel módulo. Si se define adentro de otro componente, React lo
// desmonta en cada render y el input pierde el foco a cada tecla.
function MontoInput({ value, onChange, style, ...rest }){
  const ref=useRef(null), caret=useRef(null)
  useEffect(()=>{ if(caret.current!=null && ref.current){ ref.current.setSelectionRange(caret.current, caret.current); caret.current=null } })
  const handle=e=>{ const el=e.target, raw=el.value, pos=el.selectionStart??raw.length
    const signif=raw.slice(0,pos).replace(/[^\d,]/g,'').length   // dígitos/coma a la izquierda del cursor
    const out=fmtMontoAR(raw)
    let n=0,i=0; while(i<out.length && n<signif){ if(/[\d,]/.test(out[i])) n++; i++ }
    caret.current=i; onChange(out) }
  return <input ref={ref} value={value??''} onChange={handle} inputMode="decimal" style={style} {...rest}/>
}
const navBtn = { width:34, height:34, borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:14, cursor:'pointer' }
const miniBtn = { padding:'6px 11px', borderRadius:7, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:12, fontWeight:500, cursor:'pointer', textDecoration:'none', display:'inline-block' }
const btnPrimary = { padding:'11px 22px', borderRadius:10, border:'none', background:T.brand, color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer' }
