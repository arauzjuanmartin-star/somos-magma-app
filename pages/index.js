import React, { useState, useEffect, useRef } from 'react'
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
        </div>
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
              mod==='dashboard' ? <Dashboard data={data} goTo={goTo}/>
            : mod==='presupuestos' ? <Presupuestos data={data} onRefresh={()=>load(true)} showToast={showToast} nav={nav} clearNav={clearNav}/>
            : mod==='calendario' ? <Calendario data={data} onRefresh={()=>load(true)} showToast={showToast}/>
            : mod==='proyectos' ? <Proyectos data={data} onRefresh={()=>load(true)} showToast={showToast} nav={nav} clearNav={clearNav}/>
            : mod==='facturacion' ? <Facturacion data={data} onRefresh={()=>load(true)} showToast={showToast} nav={nav} clearNav={clearNav} goTo={goTo}/>
            : mod==='pagos' ? <PagosStaff data={data} onRefresh={()=>load(true)} showToast={showToast} nav={nav} clearNav={clearNav}/>
            : mod==='freelancers' ? <Freelancers data={data} nav={nav} clearNav={clearNav}/>
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

// ============================ DASHBOARD ============================
function Dashboard({data, goTo}){
  const [verCuentas,setVerCuentas]=useState(false)
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

  return <>
    <PageHead title="Dashboard" sub={`${MESES_LARGO[mesActual-1]} ${anioActual} · hoy ${diaHoy}`}/>

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
                <span style={{fontSize:12, color:T.ink3}}>→</span>
              </div>
            </div>
          ))}
      </div>

      <div style={{flex:1, display:'flex', flexDirection:'column', gap:14}}>
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
  useEffect(()=>{ if(nav?.mod==='presupuestos'){ if(nav.filtro)setF(nav.filtro); if(nav.q){setQ(nav.q); setF('todos')} clearNav&&clearNav() } /* eslint-disable-next-line */ },[nav])
  const presus = rows
  const [q,setQ]=useState(''), [f,setF]=useState('todos'), [anio,setAnio]=useState('todos'), [mes,setMes]=useState('todos'), [pm,setPm]=useState('todos'), [open,setOpen]=useState(null), [editing,setEditing]=useState(null), [nuevo,setNuevo]=useState(false), [represu,setRepresu]=useState(null), [aprobAdic,setAprobAdic]=useState(null), [aprobSaving,setAprobSaving]=useState(false)

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
          {abierto && <DetallePresupuesto p={p} id={id} onEdit={()=>setEditing(p)} onRepresupuestar={()=>setRepresu(p)}/>}
        </div>
      })}
    </div>
    {filtered.length>200 && <div style={{fontSize:12, color:T.ink3, textAlign:'center', marginTop:12}}>Mostrando primeros 200 de {filtered.length}</div>}
    {editing && <EditarModal p={editing} data={data} onClose={()=>setEditing(null)} showToast={showToast}
      onSaved={(id,cambios)=>{ setRows(rs=>rs.map(r=>String(r['Columna 1'])===String(id)?{...r,...cambios}:r)); setEditing(null); if(onRefresh) onRefresh() }}/>}
    {nuevo && <NuevoPresupuesto data={data} showToast={showToast} onClose={()=>setNuevo(false)} onGuardado={()=>{ setNuevo(false); if(onRefresh) onRefresh() }}/>}
    {represu && <NuevoPresupuesto data={data} initialData={represu} showToast={showToast} onClose={()=>setRepresu(null)} onGuardado={()=>{ setRepresu(null); if(onRefresh) onRefresh() }}/>}
    {aprobAdic && <AprobarAdicionalesModal presu={aprobAdic} saving={aprobSaving} onClose={()=>setAprobAdic(null)} onConfirm={aprobarConAdic}/>}
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

function DetallePresupuesto({p, id, onEdit, onRepresupuestar}){
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
  const ctIncompleto=!!ctExist && (!String(ctExist['Mail']||'').trim() || !String(ctExist['Teléfono']||'').trim())
  const ctMostrar=ctNuevo||ctIncompleto
  // precargar datos del contacto existente para completar lo que falte
  useEffect(()=>{ const c=(data?.contactos||[]).find(x=>nrm(x['Nombre'])===nrm(form.contacto)); if(c) setCtNew({mail:c['Mail']||'',telefono:c['Teléfono']||'',cargo:c['Cargo']||'',cuit:c['Cuit']||''}) /* eslint-disable-next-line */ },[form.contacto])

  const updPed=(i,ch)=>setPeds(ps=>ps.map((p,j)=>j===i?{...p,...ch}:p))
  const selSvc=(i,nombre)=>{ const m=SVCS_LIST.find(s=>s.n===nombre); if(m) updPed(i,{svc:nombre, precio:peds[i].manual&&peds[i].precio?peds[i].precio:(m.p||''), feeAg:m.fee}); else updPed(i,{svc:nombre}) }
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
        <datalist id="np-svc">{SVCS_LIST.map(s=><option key={s.n} value={s.n}/>)}</datalist>
        <button onClick={()=>addPed(false)} style={{fontSize:12, color:T.ink2, background:'transparent', border:'none', cursor:'pointer', padding:'4px 0'}}>+ Agregar servicio</button>

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
  const serviciosConocidos=[...new Set([...SVCS_LIST.map(s=>s.n), ...(data.listado?.servicios||[])])].filter(Boolean).sort()

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
  const serviciosConocidos=[...new Set([...SVCS_LIST.map(s=>s.n), ...(data.listado?.servicios||[])])].filter(Boolean).sort()
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
  const svcSet=new Set(serviciosConocidos.map(s=>String(s).toLowerCase().trim()))
  const esSvcNuevo=v=>v && !svcSet.has(String(v).toLowerCase().trim())
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
      if(presu){ fetch('/api/calendar-evento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num, accion:'aprobar'})}).catch(()=>{}) }
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
    <datalist id="v2-rrhh"><option value="Somos Magma"/>{rrhhNames.map(n=><option key={n} value={n}/>)}</datalist>
    <datalist id="v2-svcs">{serviciosConocidos.map(n=><option key={n} value={n}/>)}</datalist>
    <button onClick={addRow} style={{fontSize:12, color:T.ink2, background:'transparent', border:'none', cursor:'pointer', padding:'4px 0', marginTop:2}}>+ Agregar línea</button>

    {(()=>{ const margenPct=total>0?Math.round((fee/total)*100):0; const sem=semaforo(margenPct); return (
    <div style={{display:'flex', gap:24, marginTop:14, paddingTop:14, borderTop:`1px solid ${T.border}`, flexWrap:'wrap', alignItems:'center'}}>
      <Mini label="Presupuestado" val={fmt(total)}/>
      <Mini label="Freelance" val={fmt(fl)}/>
      <Mini label="Somos Magma" val={fmt(mg)} color={T.pos}/>
      <Mini label="Fee Magma" val={fmt(fee)} color={fee<0?T.brand:T.ink}/>
      <div><div style={{fontSize:10, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, fontWeight:600}}>Margen</div><div style={{fontSize:14, fontFamily:MONO, color:sem.c, marginTop:2}}>{margenPct}% · {sem.l}</div></div>
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
  const [q,setQ]=useState(''), [filt,setFilt]=useState('todas'), [mesF,setMesF]=useState('todos'), [cobrando,setCobrando]=useState(null), [nuevaF,setNuevaF]=useState(false), [nuevaFsel,setNuevaFsel]=useState(null), [yaModal,setYaModal]=useState(null), [mailFactura,setMailFactura]=useState(null)
  const matchMes=fechaStr=>{ if(mesF==='todos')return true; const d=parseD(fechaStr); return d?`${d.getMonth()+1}-${d.getFullYear()}`===mesF:false }
  useEffect(()=>{ if(nav?.mod==='facturacion'){ if(nav.filtro)setFilt(['atrasadas','pendiente'].includes(nav.filtro)?'porcobrar':nav.filtro); if(nav.q){setQ(nav.q); setFilt('todas')} clearNav&&clearNav() } /* eslint-disable-next-line */ },[nav])

  // presupuestos aprobados con saldo pendiente de facturar
  const pendientes=presus.filter(isAprobado).map(p=>{
    const facturado=fc.filter(f=>esFacturaReal(f) && String(f['N° Presupuesto']||'').trim()===String(p['Columna 1']||'').trim() && !String(f['Nro de Factura']||'').toUpperCase().startsWith('ANULADA')).reduce((s,f)=>s+(parseMonto(f['Precio SIN IVA'])||parseMonto(f['Precio FINAL'])),0)
    const neto=parseMonto(p['Precio Final'])
    return {p, facturado, neto, pendiente:Math.max(0,neto-facturado)}
  }).filter(x=>x.neto>0 && x.pendiente>x.neto*0.05)

  async function mandarMail(f){
    try{ const r=await fetch('/api/factura-prep-mail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({presupuestoNum:f['N° Presupuesto']})})
      const j=await r.json(); if(!j.ok){showToast(j.error||'Error','err');return}
      const to=(j.destinatarios||[]).map(d=>d.mail).join(',')
      if(!to) showToast('Sin email de contacto — revisá el mail antes de mandar','err')
      window.location.href=`mailto:${to}?subject=${encodeURIComponent(j.asunto)}&body=${encodeURIComponent(j.cuerpo)}`
    }catch(e){ showToast('Error de conexión','err') }
  }

  function subirPDF(f){
    const input=document.createElement('input'); input.type='file'; input.accept='application/pdf,image/*'
    input.onchange=async()=>{
      const file=input.files?.[0]; if(!file) return
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
  async function confirmarYaCobrada(x, montoReal){
    const num=x.p['Columna 1']
    try{ const r=await fetch('/api/factura-confirmar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nroPresupuesto:String(num), cobrada:true, monto:montoReal})})
      const j=await r.json(); if(!j.ok){showToast(j.error||'Error','err');return}
      showToast(`#${num} facturada y cobrada por ${fmt(montoReal)} ✓`); setYaModal(null); if(onRefresh) onRefresh()
    }catch(e){ showToast('Error de conexión','err') }
  }
  const estF=f=>{ if(isCobrada(f))return'cobrada'; const ya=parseMonto(f['Monto cobrado']); if(ya>0)return'parcial'; const d=diffVenc(f); if(d==null)return'pendiente'; if(d<-30)return'reclamar'; if(d<0)return'vencida'; if(d<7)return'por-vencer'; return'pendiente' }
  const ESTF={ cobrada:{c:T.pos,l:'Cobrada'}, parcial:{c:T.warn,l:'Parcial'}, 'por-vencer':{c:T.warn,l:'Por vencer'}, pendiente:{c:T.ink3,l:'Pendiente'}, vencida:{c:T.brand,l:'Vencida'}, reclamar:{c:T.brand,l:'¡Reclamar!'} }

  // por cobrar
  const pcTotal=fcReal.filter(f=>!isCobrada(f)).reduce((s,f)=>s+parseMonto(f['Precio FINAL']),0)
  const porFacturarTotal=pendientes.reduce((s,x)=>s+x.pendiente,0)
  const vencidasMonto=fcReal.filter(f=>!isCobrada(f)&&(diffVenc(f)??99)<0).reduce((s,f)=>s+parseMonto(f['Precio FINAL']),0)

  const filtrada=fcReal.filter(f=>{
    const e=estF(f)
    const owed=['pendiente','por-vencer','vencida','reclamar']
    const mf = filt==='todas' || (filt==='cobrada'&&e==='cobrada') || ((filt==='porcobrar'||filt==='pendiente'||filt==='atrasadas')&&owed.includes(e)) || (filt==='parcial'&&e==='parcial')
    const mq=!q||[f['Nro de Factura'],f['N° Presupuesto'],f['Cliente'],f['Agencia'],f['Proyecto']].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase()))
    return mf&&mq&&matchMes(evDe(f))
  }).sort((a,b)=> filt==='todas'
      ? ((parseD(evDe(b)||b['Fecha emision'])?.getTime()||0)-(parseD(evDe(a)||a['Fecha emision'])?.getTime()||0))  // Todas: más nuevo primero
      : ((diffVenc(a)??99)-(diffVenc(b)??99)))  // resto: más atrasado primero

  // Proyectos aprobados sin facturar (o con saldo), ordenados por evento más atrasado arriba
  const pendOrdenados = pendientes.filter(x=>(!q||[x.p['Columna 1'],x.p['Proyecto'],x.p['Cliente'],x.p['Agencia']].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase())))&&matchMes(x.p['Fecha Evento'])).sort((a,b)=>semEvento(b.p['Fecha Evento']).dias-semEvento(a.p['Fecha Evento']).dias)
  const sinFactAtrasados = pendientes.filter(x=>{const s=semEvento(x.p['Fecha Evento']);return !s.futuro&&s.dias>30}).length
  const sumFiltrada = filtrada.reduce((s,f)=>s+parseMonto(f['Precio FINAL']),0)
  const sumPend = pendOrdenados.reduce((s,x)=>s+x.pendiente,0)

  // Opciones de mes (por fecha de evento) para el filtro
  const mesesSet={}; ;[...fcReal.map(evDe), ...pendientes.map(x=>x.p['Fecha Evento'])].forEach(s=>{ const d=parseD(s); if(d) mesesSet[`${d.getMonth()+1}-${d.getFullYear()}`]=`${MESES_LARGO[d.getMonth()]} ${d.getFullYear()}` })
  const monthOpts=Object.entries(mesesSet).sort((a,b)=>{ const [ma,ya]=a[0].split('-').map(Number),[mb,yb]=b[0].split('-').map(Number); return yb-ya||mb-ma })

  const FILTROS=[['todas','Todas'],['porcobrar','Por cobrar'],['parcial','Parciales'],['cobrada','Cobradas'],['sinfacturar',`Sin facturar (${pendientes.length})`]]

  return <>
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20}}>
      <div><h1 style={{fontSize:23, fontWeight:700, color:T.ink, margin:0, letterSpacing:-0.3}}>Facturación</h1><div style={{fontSize:13, color:T.ink3, marginTop:3}}>{filtrada.length} de {fc.length} · {pendientes.length} sin facturar</div></div>
      <button onClick={()=>setNuevaF(true)} style={{padding:'10px 18px', borderRadius:10, border:'none', background:T.brand, color:'#fff', fontSize:13.5, fontWeight:600, cursor:'pointer'}}>+ Nueva factura</button>
    </div>
    <div style={{display:'flex', gap:14, marginBottom:20}}>
      <Hero label="Por cobrar" value={fmt(pcTotal)} accent={vencidasMonto>0?T.brand:T.ink} sub="facturado y sin cobrar · vencido " subStrong={fmt(vencidasMonto)} subStrongColor={vencidasMonto>0?T.brand:T.pos}/>
      <Hero label="Por facturar" value={fmt(porFacturarTotal)} accent={T.warn} sub={`${pendientes.length} proyectos aprobados sin factura`}/>
    </div>
    <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', marginBottom:14}}>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar factura, presu, cliente, proyecto…" style={{flex:'1 1 240px', minWidth:190, padding:'9px 13px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13, outline:'none'}}/>
      <select value={mesF} onChange={e=>setMesF(e.target.value)} title="Filtrar por mes del evento" style={{...selectStyle, minWidth:160}}><option value="todos">Todos los meses</option>{monthOpts.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select>
    </div>
    <div style={{display:'flex', gap:7, marginBottom:14}}>
      {FILTROS.map(([k,l])=><button key={k} onClick={()=>setFilt(k)} style={{padding:'6px 13px', borderRadius:20, fontSize:12, fontWeight:500, cursor:'pointer', border:`1px solid ${filt===k?T.ink:T.border}`, background:filt===k?T.ink:T.surface, color:filt===k?'#fff':T.ink2}}>{l}</button>)}
    </div>
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10, padding:'9px 15px', background:T.surfaceAlt, borderRadius:9}}>
      <span style={{fontSize:13.5, color:T.ink, fontWeight:600}}>{filt==='sinfacturar' ? `${pendOrdenados.length} ${pendOrdenados.length===1?'proyecto':'proyectos'} sin facturar` : `${filtrada.length} ${filtrada.length===1?'factura':'facturas'}`}{mesF!=='todos' ? ` · ${mesesSet[mesF]}` : ''}</span>
      <span style={{fontSize:13.5, fontFamily:MONO, color:T.ink2, fontWeight:600}}>{fmt(filt==='sinfacturar'?sumPend:sumFiltrada)}</span>
    </div>
    {filt==='sinfacturar' ? (
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
    ) : (
    <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
      <div style={{display:'grid', gridTemplateColumns:'90px 1.2fr 90px 150px 235px', padding:'11px 18px', borderBottom:`1px solid ${T.border}`, fontSize:10.5, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3}}>
        <span>Evento</span><span>Proyecto</span><span style={{textAlign:'right'}}>Neto</span><span style={{textAlign:'right'}}>Estado</span><span style={{textAlign:'right'}}>Acción</span>
      </div>
      {filtrada.length===0&&<Empty>Sin resultados</Empty>}
      {filtrada.slice(0,200).map((f,i)=>{
        const e=estF(f), info=ESTF[e], num=f['N° Presupuesto'], d=diffVenc(f)
        return <div key={i} style={{display:'grid', gridTemplateColumns:'90px 1.2fr 90px 150px 235px', padding:'12px 18px', borderTop:i===0?'none':`1px solid ${T.border}`, alignItems:'center', fontSize:13}}>
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
          </span>
          <span style={{display:'flex', gap:5, justifyContent:'flex-end'}}>
            {!isCobrada(f) && <button onClick={()=>setCobrando(f)} style={{...miniBtn, background:T.pos, color:'#fff', border:'none', padding:'6px 9px'}}>Cobrar</button>}
            <button onClick={()=>setMailFactura(f)} style={{...miniBtn, padding:'6px 8px'}} title="Mandar factura por mail (desde la app)">✉</button>
            {f['Factura']
              ? <a href={f['Factura']} target="_blank" rel="noreferrer" style={{...miniBtn, padding:'6px 8px'}} title="Ver PDF de la factura">📎</a>
              : <button onClick={()=>subirPDF(f)} style={{...miniBtn, padding:'6px 8px'}} title="Subir PDF de la factura">⬆</button>}
            <button onClick={()=>goTo&&goTo('proyectos',{q:String(num)})} style={{...miniBtn, padding:'6px 9px'}} title="Abrir el proyecto">Proyecto</button>
            <button onClick={()=>borrarFactura(f)} style={{...miniBtn, padding:'6px 9px', color:T.brand, borderColor:`${T.brand}55`}} title="Anular/borrar esta factura (error, nota de crédito, duplicado)">✕</button>
          </span>
        </div>
      })}
    </div>
    )}
    {cobrando && <CobroModal f={cobrando} cuentas={cuentas} onClose={()=>setCobrando(null)} onRefresh={onRefresh} showToast={showToast}/>}
    {yaModal && <YaCobradaModal x={yaModal} onClose={()=>setYaModal(null)} onConfirm={confirmarYaCobrada}/>}
    {mailFactura && <MailFacturaModal f={mailFactura} onClose={()=>setMailFactura(null)} onSent={()=>{ if(onRefresh) onRefresh() }} showToast={showToast}/>}
    {nuevaF && <NuevaFactura pendientes={pendientes} agencias={data.agencias||[]} contactos={data.contactos||[]} initialSel={nuevaFsel} onClose={()=>{setNuevaF(false); setNuevaFsel(null)}} onCreada={()=>{ setNuevaF(false); setNuevaFsel(null); if(onRefresh) onRefresh() }} showToast={showToast}/>}
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
      // 2) Mandar mail al cliente (con destinatarios + cuerpo + link al PDF)
      if(conMail){
        try{ const rm=await fetch('/api/factura-prep-mail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({presupuestoNum:presuNum})}); const jm=await rm.json()
          if(jm.ok){ const to=(jm.destinatarios||[]).map(d=>d.mail).join(','); if(!to) showToast('Factura lista — sin email de contacto, revisá el destinatario','err'); window.location.href=`mailto:${to}?subject=${encodeURIComponent(jm.asunto)}&body=${encodeURIComponent(jm.cuerpo)}` }
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

function MailFacturaModal({ f, onClose, onSent, showToast }){
  const num=f['N° Presupuesto']
  const [loading,setLoading]=useState(true)
  const [dests,setDests]=useState([])   // {mail, nombre, match, sel}
  const [nuevo,setNuevo]=useState('')
  const [asunto,setAsunto]=useState('')
  const [cuerpo,setCuerpo]=useState('')
  const [saving,setSaving]=useState(false)
  useEffect(()=>{ let vivo=true; (async()=>{
    try{ const r=await fetch('/api/factura-prep-mail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({presupuestoNum:num})}); const j=await r.json()
      if(!vivo) return
      if(!j.ok){ showToast(j.error||'Error preparando el mail','err'); onClose(); return }
      setDests((j.destinatarios||[]).map(d=>({...d, sel:true})))
      setAsunto(j.asunto||''); setCuerpo(j.cuerpo||''); setLoading(false)
    }catch(e){ if(vivo){ showToast('Error de conexión','err'); onClose() } }
  })(); return ()=>{vivo=false} },[])  // eslint-disable-line
  const toggle=i=>setDests(d=>d.map((x,j)=>j===i?{...x,sel:!x.sel}:x))
  const agregar=()=>{ const m=nuevo.trim(); if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)){ showToast('Mail inválido','err'); return } if(dests.find(d=>d.mail.toLowerCase()===m.toLowerCase())){ setNuevo(''); return } setDests(d=>[...d,{mail:m,nombre:'agregado',match:'agregado a mano',sel:true}]); setNuevo('') }
  const seleccionados=dests.filter(d=>d.sel).map(d=>d.mail)
  async function enviar(){
    if(!seleccionados.length){ showToast('Elegí al menos un destinatario','err'); return }
    setSaving(true)
    try{ const r=await fetch('/api/factura-enviar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:seleccionados, asunto, cuerpo, presupuestoNum:num})}); const j=await r.json()
      if(!j.ok){ showToast(j.error||'No se pudo enviar','err'); setSaving(false); return }
      showToast(`Mail enviado a ${seleccionados.length} ${seleccionados.length===1?'destinatario':'destinatarios'} ✓`); onSent&&onSent(); onClose()
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
            <label key={i} style={{display:'flex', alignItems:'center', gap:9, fontSize:13, color:T.ink, cursor:'pointer', padding:'7px 10px', borderRadius:8, border:`1px solid ${d.sel?T.ink:T.border}`, background:d.sel?T.surfaceAlt:T.surface}}>
              <input type="checkbox" checked={d.sel} onChange={()=>toggle(i)}/>
              <span style={{flex:1, minWidth:0}}><span style={{fontFamily:MONO, fontSize:12.5}}>{d.mail}</span> <span style={{fontSize:10.5, color:T.ink3}}>· {d.match||d.nombre}</span></span>
            </label>
          ))}
        </div>
        <div style={{display:'flex', gap:8, marginBottom:16}}>
          <input value={nuevo} onChange={e=>setNuevo(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();agregar()}}} placeholder="Agregar otro mail…" style={{...inpV2, flex:1}}/>
          <button onClick={agregar} style={{...miniBtn, padding:'8px 14px'}}>+ Agregar</button>
        </div>
        <label style={lblV2}>Asunto</label>
        <input value={asunto} onChange={e=>setAsunto(e.target.value)} style={{...inpV2, marginBottom:12}}/>
        <label style={lblV2}>Mensaje</label>
        <textarea value={cuerpo} onChange={e=>setCuerpo(e.target.value)} rows={11} style={{...inpV2, fontFamily:'inherit', lineHeight:1.5, resize:'vertical'}}/>
      </div>
      <div style={{padding:'14px 22px', borderTop:`1px solid ${T.border}`, display:'flex', gap:10, justifyContent:'space-between', alignItems:'center'}}>
        <span style={{fontSize:11.5, color:T.ink3}}>{seleccionados.length} destinatario{seleccionados.length!==1?'s':''}</span>
        <div style={{display:'flex', gap:10}}>
          <button onClick={onClose} style={{padding:'9px 18px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:500, cursor:'pointer'}}>Cancelar</button>
          <button onClick={enviar} disabled={saving||!seleccionados.length} style={{padding:'9px 22px', borderRadius:9, border:'none', background:(saving||!seleccionados.length)?T.ink3:T.brand, color:'#fff', fontSize:13.5, fontWeight:600, cursor:(saving||!seleccionados.length)?'default':'pointer'}}>{saving?'Enviando…':'✉ Enviar'}</button>
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
  const real=parseFloat(monto)||0
  const dif=real-presupuestado
  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:910, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'70px 20px'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:430, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.15)'}}>
      <div style={{padding:'18px 22px', borderBottom:`1px solid ${T.border}`}}>
        <div style={{fontSize:16, fontWeight:700, color:T.ink}}>Marcar como ya facturada y cobrada</div>
        <div style={{fontSize:12, color:T.ink3, marginTop:2}}>#{x.p['Columna 1']} · {x.p['Proyecto']||x.p['Cliente']||''}</div>
      </div>
      <div style={{padding:'20px 22px'}}>
        <label style={lblV2}>¿Cuánto cobraste en realidad? (neto sin IVA)</label>
        <input type="number" value={monto} onChange={e=>setMonto(e.target.value)} autoFocus style={{...inpV2, textAlign:'right', fontFamily:MONO, fontSize:16, marginBottom:8}}/>
        <div style={{fontSize:11.5, color:T.ink3}}>Presupuestado: <span style={{fontFamily:MONO}}>{fmt(presupuestado)}</span>{dif!==0 && <span style={{color:dif>0?T.pos:T.brand, fontWeight:600}}> · {dif>0?'+':''}{fmt(dif)} {dif>0?'de más':'de menos'}</span>}</div>
        <div style={{fontSize:11.5, color:T.ink3, marginTop:10, background:T.surfaceAlt, borderRadius:8, padding:'9px 11px'}}>No toca el saldo de ninguna cuenta (es histórico). El presupuesto y el staff quedan intactos — esto solo registra la factura.</div>
      </div>
      <div style={{padding:'16px 22px', borderTop:`1px solid ${T.border}`, display:'flex', gap:10, justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{padding:'9px 18px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:500, cursor:'pointer'}}>Cancelar</button>
        <button onClick={()=>{setSaving(true); onConfirm(x, Math.round(real))}} disabled={saving||real<=0} style={{padding:'9px 20px', borderRadius:9, border:'none', background:(saving||real<=0)?T.ink3:T.pos, color:'#fff', fontSize:13, fontWeight:600, cursor:(saving||real<=0)?'default':'pointer'}}>{saving?'Guardando…':'Confirmar'}</button>
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
  const [montoCobrado,setMontoCobrado]=useState(String(Math.round(total)))  // lo que REALMENTE entró (editable)
  const [saving,setSaving]=useState(false)
  const num=f['N° Presupuesto']
  const real=Math.round(parseFloat(montoCobrado)||0)
  const dif=real-Math.round(total)

  async function cobrar(){
    if(!historico && !cuenta){ showToast('Elegí en qué cuenta entra','err'); return }
    if(real<=0){ showToast('Poné el monto cobrado','err'); return }
    const msg = historico
      ? `Marcar #${num} como COBRADA (cobro histórico) por ${fmt(real)}.\nNO suma saldo a ninguna cuenta ni reserva IVA — solo deja la factura como cobrada.\n\n¿Confirmás?`
      : `Marcar #${num} como COBRADA por ${fmt(real)} en ${cuenta}. Esto suma ese monto a la cuenta${reservarIVA?' y reserva el IVA':''}. ¿Confirmás?`
    if(!window.confirm(msg)) return
    setSaving(true)
    try{ const r=await fetch('/api/factura-cobro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ nroPresupuesto:String(num), tipoCobro:'total', monto:real, cuentaDestino:historico?'':cuenta, formaPago:historico?'Histórico':forma, retGanancias:0, retIIBB:0, retIVA:0, comision:0, fechaCobro:`${new Date().getDate()}/${new Date().getMonth()+1}/${new Date().getFullYear()}`, reservarIVA:historico?false:reservarIVA, historico })})
      const j=await r.json(); if(j&&j.error){showToast(j.error,'err');setSaving(false);return}
      showToast(`#${num} cobrada ✓`); onClose(); if(onRefresh) onRefresh()
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
  useEffect(()=>{ if(nav?.mod==='pagos'&&nav.q){ setQ(nav.q); setFiltro('todos'); clearNav&&clearNav() } /* eslint-disable-next-line */ },[nav])
  useEffect(()=>{ setSelPay({}) },[mesIdx,anio])  // cambiar de mes limpia la selección

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
    for(let j=1;j<=20;j++){ const pedido=proy['Pedido '+j]||(j===1?proy['Pedido']:'')||''; const precio=parseMonto(proy['Precio '+j]||(j===1?proy['Precio']:'')); const staff=String(proy['Staff '+j]||(j===1?proy['Staff']:'')||'').trim()
      if(!staff||staff==='Somos Magma'||!pedido||precio<=0) continue
      if(!personas[staff]) personas[staff]={nombre:staff, trabajos:[], total:0, totalPagado:0, totalPendiente:0}
      personas[staff].trabajos.push({nro,proyecto,agencia,pedido,precio,fechaEvento, key:nro+'|'+pedido+'|'+j})
      personas[staff].total+=precio
    }
  })
  // Contar filas PAGADAS por (freelancer|N°|servicio) para manejar trabajos idénticos repetidos
  const esPagRow=r=>{ const e=String(r['Estado']||r['Pagado']||'').toUpperCase(); return ['PAGADO','SÍ','SI','TRUE'].includes(e)||parseMonto(r['Monto Pagado'])>0 }
  // Clave INCLUYE el mes de referencia: un pago de mayo no debe marcar como pagado un trabajo de junio.
  // (Antes ignoraba el mes → mostraba pagado pero el botón desmarcar, que sí filtra por mes, no lo encontraba.)
  const paidCount={}
  pagosPersistidos.forEach(r=>{ if(!esPagRow(r)) return; const k=norm(r['Freelancer']||r['Persona']||r['Nombre'])+'|'+norm(r['Mes Referencia']||r['Mes'])+'|'+String(r['N° Presupuesto']||r['N° Proyecto']||'').trim()+'|'+norm(r['Servicio']); paidCount[k]=(paidCount[k]||0)+1 })
  Object.values(personas).forEach(p=>{ const used={}; p.trabajos.forEach(t=>{
    let pag
    if(t.key in override) pag=override[t.key]
    else { const k=norm(p.nombre)+'|'+norm(mesLabel)+'|'+String(t.nro).trim()+'|'+norm(t.pedido); const cnt=paidCount[k]||0, u=used[k]||0; pag=u<cnt; if(pag) used[k]=u+1 }
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
  const serviciosConocidos=[...new Set([...SVCS_LIST.map(s=>s.n), ...(data.listado?.servicios||[])])].filter(Boolean).sort()

  const postPago=(persona,t,pagado)=>fetch('/api/pago-staff-toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ mes:mesLabel, persona:persona.nombre, nroProyecto:t.nro, proyecto:t.proyecto, pedido:t.pedido, monto:t.precio, fechaEvento:t.fechaEvento, agencia:t.agencia, pagado, cuenta:pagado?cuentaPago:'' })}).then(r=>r.json().catch(()=>({})))

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
    if(!window.confirm(`Pagar TODO lo de ${nombre} de ${MESES_LARGO[mesIdx-1]}:\n${pend.length} trabajos = ${fmt(persona.totalPendiente)}\nDesde: ${cuentaPago}\n\n¿Confirmás?`)) return
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
  const selTotal=selList.reduce((s,x)=>s+x.t.precio,0)
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
                ? <button onClick={e=>{e.stopPropagation();pagarTodo(persona)}} style={{padding:'8px 16px', borderRadius:9, border:'none', background:T.pos, color:'#fff', fontSize:12.5, fontWeight:600, cursor:'pointer'}}>Pagar todo</button>
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
function Freelancers({data, nav, clearNav}){
  const proyectos=data.proyectos||[], rrhh=data.rrhh||[], pagos=data.pagosStaff||[]
  const [q,setQ]=useState(''), [sel,setSel]=useState(null)
  const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim()
  useEffect(()=>{ if(nav?.mod==='freelancers'&&nav.q){ setQ(nav.q); clearNav&&clearNav() } /* eslint-disable-next-line */ },[nav])

  // Stats por persona desde PROYECTOS (lo que hizo + lo que vale)
  const stats={}
  proyectos.forEach(p=>{ for(let j=1;j<=20;j++){ const st=String(p['Staff '+j]||(j===1?p['Staff']:'')||'').trim(); const pr=parseMonto(p['Precio '+j]||(j===1?p['Precio']:'')); const ped=p['Pedido '+j]||(j===1?p['Pedido']:'')||''
    if(!st||/somos magma|^magma$/i.test(st)||pr<=0) continue
    const k=norm(st); if(!stats[k]) stats[k]={nombre:st, trabajos:0, ganado:0, pagado:0, items:[]}
    stats[k].trabajos++; stats[k].ganado+=pr
    stats[k].items.push({fecha:p['Fecha Evento']||'', proy:p['Proyecto']||p['Cliente']||'—', ag:p['Agencia']||'', ped, monto:pr, nro:p['N° presupuesto']||''})
  }})
  // Años anteriores (HISTORICO 2023/2024/2025): Staff N / Pago N — ya saldados
  const addHist=(rows,anio)=>{ (rows||[]).forEach(p=>{ for(let j=1;j<=6;j++){ const st=String(p['Staff '+j]||'').trim(); const pr=parseMonto(p['Pago '+j]); if(!st||/somos magma|^magma$/i.test(st)||pr<=0) continue
    const k=norm(st); if(!stats[k]) stats[k]={nombre:st, trabajos:0, ganado:0, pagado:0, items:[]}
    stats[k].trabajos++; stats[k].ganado+=pr; stats[k].pagado+=pr
    stats[k].items.push({fecha:p['Fecha']||`${anio}`, proy:p['Proyecto']||p['Cliente']||'—', ag:p['Agencia']||'', ped:'', monto:pr})
  }}) }
  addHist(data.historico2023,'2023'); addHist(data.historico2024,'2024'); addHist(data.historico2025,'2025')
  // Pagado 2026 desde PAGOS_STAFF
  const esPag=r=>{ const e=String(r['Estado']||'').toLowerCase().trim(); return ['pagado','sí','si','true'].includes(e)||parseMonto(r['Monto Pagado'])>0 }
  pagos.forEach(r=>{ if(!esPag(r)) return; const k=norm(r['Freelancer']||r['Persona']||r['Nombre']); if(stats[k]) stats[k].pagado+=parseMonto(r['Monto Pagado'])||parseMonto(r['Monto Adeudado']) })
  // RRHH (datos fiscales) + incluir roster que no tenga trabajos
  const rrhhByName={}; rrhh.forEach(r=>{ const n=String(r['Nombre Apellido']||r['Nombre']||'').trim(); if(n){ rrhhByName[norm(n)]=r; if(!stats[norm(n)]) stats[norm(n)]={nombre:n, trabajos:0, ganado:0, pagado:0, items:[]} } })

  const lista=Object.values(stats).sort((a,b)=>b.ganado-a.ganado)
  const filtrados=lista.filter(p=>!q||norm(p.nombre).includes(norm(q)))
  const selP = sel ? stats[norm(sel)] : null
  const datos = selP ? (rrhhByName[norm(selP.nombre)]||{}) : {}
  const pend = selP ? Math.max(0, selP.ganado-selP.pagado) : 0

  return <>
    <PageHead title="Freelancers" sub={`${filtrados.length} de ${lista.length}`}/>
    <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar freelancer…" style={{width:'100%', maxWidth:360, padding:'9px 13px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13, outline:'none', marginBottom:14}}/>
    <div style={{display:'flex', gap:16, alignItems:'flex-start'}}>
      <div style={{flex:1, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
        <div style={{display:'grid', gridTemplateColumns:'1.5fr 60px 120px 120px', padding:'11px 18px', borderBottom:`1px solid ${T.border}`, fontSize:10.5, fontWeight:600, letterSpacing:0.3, textTransform:'uppercase', color:T.ink3}}>
          <span>Nombre</span><span style={{textAlign:'right'}}>Trab.</span><span style={{textAlign:'right'}}>Le pagamos</span><span style={{textAlign:'right'}}>Se le debe</span>
        </div>
        {filtrados.length===0&&<Empty>Sin resultados</Empty>}
        {filtrados.slice(0,300).map((p,i)=>{ const d=Math.max(0,p.ganado-p.pagado); return (
          <div key={i} onClick={()=>setSel(p.nombre)} style={{display:'grid', gridTemplateColumns:'1.5fr 60px 120px 120px', padding:'11px 18px', borderTop:`1px solid ${T.border}`, cursor:'pointer', alignItems:'center', fontSize:13, background:sel===p.nombre?T.surfaceAlt:'transparent'}}>
            <span style={{color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:8}}>{p.nombre}</span>
            <span style={{textAlign:'right', color:T.ink2, fontFamily:MONO, fontSize:12}}>{p.trabajos}</span>
            <span style={{textAlign:'right', color:T.ink, fontFamily:MONO, fontSize:12}}>{fmtM(p.ganado)}</span>
            <span style={{textAlign:'right', color:d>0?T.brand:T.ink3, fontFamily:MONO, fontSize:12, fontWeight:d>0?600:400}}>{d>0?fmtM(d):'—'}</span>
          </div>
        )})}
      </div>
      {selP && <div style={{flex:'0 0 360px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', position:'sticky', top:0}}>
        <div style={{padding:'14px 18px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', gap:8}}>
          <span style={{fontSize:15, fontWeight:700, color:T.ink, flex:1, minWidth:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{selP.nombre}</span>
          <button onClick={()=>setSel(null)} title="Cerrar" style={{border:'none', background:'transparent', fontSize:20, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
        </div>
        <div style={{padding:'14px 18px'}}>
          <div style={{display:'flex', gap:18, flexWrap:'wrap', marginBottom:14}}>
            <Mini label="Trabajos" val={selP.trabajos}/>
            <Mini label="Le pagamos (total)" val={fmtM(selP.ganado)}/>
            <Mini label="Promedio x trabajo" val={fmtM(selP.trabajos?selP.ganado/selP.trabajos:0)}/>
            <Mini label="Se le debe" val={pend>0?fmtM(pend):'—'} color={pend>0?T.brand:T.pos}/>
          </div>
          {datos['Rubro'] && <div style={{fontSize:11.5, color:T.ink2, marginBottom:10}}>{datos['Rubro']}</div>}
          {[['Mail',datos['Mail']],['Tel',datos['Celular']],['CUIT',datos['CUIT/CUIL']||datos['CUIT']],['Banco',datos['Banco']],['Alias',datos['Alias']],['CBU',datos['CBU']]].filter(x=>x[1]).map(([k,v])=>(
            <div key={k} style={{display:'flex', justifyContent:'space-between', gap:8, padding:'4px 0', fontSize:12.5}}><span style={{color:T.ink3}}>{k}</span><span style={{color:T.ink, fontFamily:MONO, fontSize:11.5, textAlign:'right', wordBreak:'break-all'}}>{v}</span></div>
          ))}
          {!Object.keys(datos).length && <div style={{fontSize:11.5, color:T.warn}}>⚠ Sin datos fiscales en RRHH</div>}
          <div style={{fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, margin:'14px 0 6px'}}>Últimos trabajos</div>
          {selP.items.slice().reverse().slice(0,15).map((it,i)=>(
            <div key={i} style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8, padding:'5px 0', fontSize:12, borderTop:`1px solid ${T.border}`}}>
              <span style={{flex:1, minWidth:0, color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{it.fecha?it.fecha.slice(0,5)+' · ':''}{it.ped} <span style={{color:T.ink3}}>· {it.proy}</span></span>
              <span style={{fontFamily:MONO, color:T.ink2, flexShrink:0}}>{fmtM(it.monto)}</span>
            </div>
          ))}
        </div>
      </div>}
    </div>
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
function Egresos({data, onRefresh, showToast}){
  const gf=data.gastosFijos||[], tarj=data.tarjetas||[], prest=data.prestamos||[], cuentas=data.cuentas||[]
  const now=new Date()
  const [mesIdx,setMesIdx]=useState(now.getMonth()+1), [anio,setAnio]=useState(now.getFullYear())
  const [override,setOverride]=useState({}), [cuentaSel,setCuentaSel]=useState({})
  const esPagado=v=>{ const s=String(v||'').toUpperCase(); return s==='SÍ'||s==='SI'||s==='TRUE'||v===true }
  const cuentaOpts=[...new Set(cuentas.filter(c=>{const a=String(c['Activa']||'').toUpperCase();return a==='SÍ'||a==='SI'||a==='TRUE'||c['Activa']===true}).map(c=>c['Nombre']).filter(Boolean))]

  const gfActivos=gf.filter(g=>esPagado(g['Activo'])||String(g['Activo']||'').trim()==='')
  const porCat={}; gfActivos.forEach(g=>{ const c=g['Categoria']||'Otros'; (porCat[c]=porCat[c]||[]).push(g) })
  const totalGF=gfActivos.reduce((s,g)=>s+parseMonto(g['Monto']),0)
  const tarjMes=tarj.filter(t=>parseInt(t['Mes'])===mesIdx && String(t['Año']).includes(String(anio)))
  const totalTarj=tarjMes.reduce((s,t)=>s+parseMonto(t['Monto']),0)
  const prestMes=prest.filter(p=>{ const v=parseD(p['Vencimiento']); return v && v.getMonth()+1===mesIdx && v.getFullYear()===anio })
  const totalPrest=prestMes.reduce((s,p)=>s+parseMonto(p['Monto cuota']),0)
  const totalEgresos=totalGF+totalTarj+totalPrest

  const estaPagado=(hoja,it)=>{ const k=hoja+':'+it.__row; return k in override ? override[k] : esPagado(it['Pagado']) }
  async function toggle(hoja, it, montoItem){
    const k=hoja+':'+it.__row, pagado=!estaPagado(hoja,it)
    const cuenta = cuentaSel[k] || it['Cuenta pago'] || cuentaOpts[0] || ''
    if(pagado && !cuenta){ showToast('Elegí en qué cuenta pagás','err'); return }
    if(pagado && !window.confirm(`Marcar pagado ${fmt(montoItem)} desde ${cuenta}. Descuenta de esa cuenta. ¿Confirmás?`)) return
    setOverride(o=>({...o,[k]:pagado}))
    const hoy=`${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()}`
    try{ const r=await fetch('/api/egreso-toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hoja, fila:it.__row, pagado, tipoPago:'total', cuentaPago:pagado?cuenta:'', fechaPago:pagado?hoy:''})})
      const j=await r.json(); if(j&&j.error){showToast(j.error,'err'); setOverride(o=>{const n={...o};delete n[k];return n}); return}
      showToast(pagado?'Pagado ✓':'Desmarcado'); if(onRefresh){ await onRefresh(); setOverride(o=>{const n={...o};delete n[k];return n}) }
    }catch(e){ showToast('Error de conexión','err'); setOverride(o=>{const n={...o};delete n[k];return n}) }
  }

  const Fila=({hoja, it, label, monto})=>{ const pagado=estaPagado(hoja,it), k=hoja+':'+it.__row
    return <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, padding:'10px 18px', borderTop:`1px solid ${T.border}`}}>
      <span style={{fontSize:13, color:T.ink, flex:1, minWidth:0}}>{label}</span>
      {!pagado && cuentaOpts.length>0 && <select value={cuentaSel[k]||it['Cuenta pago']||cuentaOpts[0]} onChange={e=>setCuentaSel(c=>({...c,[k]:e.target.value}))} onClick={e=>e.stopPropagation()} style={{...selectStyle, padding:'5px 8px', fontSize:11.5}}>{cuentaOpts.map(c=><option key={c} value={c}>{c}</option>)}</select>}
      <button onClick={()=>toggle(hoja,it,monto)} style={{fontSize:11, padding:'3px 10px', borderRadius:6, border:'none', cursor:'pointer', background:pagado?T.posSoft:T.warnSoft, color:pagado?T.pos:T.warn, fontWeight:600}}>{pagado?'Pagado ✓':'Pendiente'}</button>
      <span style={{fontSize:13, fontFamily:MONO, color:T.ink, minWidth:90, textAlign:'right'}}>{fmt(monto)}</span>
    </div>
  }
  const Sec=({titulo, children})=> children && <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', marginBottom:14}}><CardHead>{titulo}</CardHead>{children}</div>

  return <>
    <PageHead title="Egresos" sub={`${MESES_LARGO[mesIdx-1]} ${anio}`}/>
    <div style={{display:'flex', gap:14, marginBottom:18}}>
      <Hero label="Total egresos del mes" value={fmt(totalEgresos)} accent={T.brand} sub={`Fijos ${fmtM(totalGF)} · Tarjetas ${fmtM(totalTarj)} · Préstamos ${fmtM(totalPrest)}`}/>
    </div>
    <div style={{display:'flex', gap:10, alignItems:'center', marginBottom:16}}>
      <button onClick={()=>{ let m=mesIdx-1,a=anio; if(m<1){m=12;a--} setMesIdx(m);setAnio(a) }} style={navBtn}>←</button>
      <span style={{fontSize:13, fontWeight:600, color:T.ink, minWidth:120, textAlign:'center'}}>{MESES_LARGO[mesIdx-1]} {anio}</span>
      <button onClick={()=>{ let m=mesIdx+1,a=anio; if(m>12){m=1;a++} setMesIdx(m);setAnio(a) }} style={navBtn}>→</button>
    </div>
    {Object.entries(porCat).map(([cat,items])=>(
      <Sec key={cat} titulo={`Gastos fijos · ${cat}`}>{items.map((g,i)=><Fila key={i} hoja="GASTOS_FIJOS" it={g} label={g['Concepto']} monto={parseMonto(g['Monto'])}/>)}</Sec>
    ))}
    <Sec titulo="Tarjetas">{tarjMes.length?tarjMes.map((t,i)=><Fila key={i} hoja="TARJETAS" it={t} label={`${t['Tarjeta']} ${t['Persona']?`· ${t['Persona']}`:''}`} monto={parseMonto(t['Monto'])}/>):null}</Sec>
    <Sec titulo="Préstamos">{prestMes.length?prestMes.map((p,i)=><Fila key={i} hoja="PRESTAMOS" it={p} label={`${p['Prestamo']} · cuota ${p['Cuota nro']}/${p['Cuotas total']}`} monto={parseMonto(p['Monto cuota'])}/>):null}</Sec>
  </>
}

// ============================ FREELANCER (alta / datos) ============================
const RUBROS_DEFAULT=['Fotógrafo','Videógrafo','Editor','Filmmaker','Dirección de foto','Sonidista','Drone','Asistente','Productor','Motion','Colorista','Iluminador']
function FreelancerModal({nombre, datos={}, rubrosConocidos=[], onClose, onSaved, showToast}){
  const [nombreEdit,setNombreEdit]=useState(nombre||'')
  const [rubros,setRubros]=useState(()=>String(datos['Rubro']||'').split(',').map(s=>s.trim()).filter(Boolean))
  const [rubroInput,setRubroInput]=useState('')
  const fnInit=()=>{ const v=datos['Fecha de nac']||datos['Fecha de Nac']||''; return v?(String(v).includes('/')?dmyToISO(v):v):'' }
  const [form,setForm]=useState(()=>({ celular:datos['Celular']||'', mailFreelancer:datos['Mail']||'', dni:datos['Dni']||'', fechaNac:fnInit(), cuit:datos['CUIT/CUIL']||'', banco:datos['Banco']||'', alias:datos['Alias']||'', cbu:datos['CBU']||'' }))
  const [saving,setSaving]=useState(false)
  const existe = datos && Object.keys(datos).length>0
  const sugeridos=[...new Set([...RUBROS_DEFAULT, ...rubrosConocidos])].filter(r=>r&&!rubros.includes(r)).sort()
  const addRubro=(t)=>{ const v=String(t||'').trim(); if(v&&!rubros.includes(v)) setRubros(rs=>[...rs,v]); setRubroInput('') }
  const campos=[['celular','Celular'],['mailFreelancer','Mail'],['dni','DNI'],['fechaNac','Fecha de nacimiento','date'],['cuit','CUIT / CUIL'],['banco','Banco'],['alias','Alias'],['cbu','CBU']]
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
        {/* Resto de campos */}
        <div style={{display:'flex',flexWrap:'wrap',gap:12}}>
          {campos.map(([k,l,tipo])=>(
            <div key={k} style={{flex:'1 1 45%',minWidth:160}}><label style={lblV2}>{l}</label><input type={tipo||'text'} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={inpV2}/></div>
          ))}
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
  function abrir(){
    if(!para.trim()){ showToast('Falta el mail del freelancer','err'); return }
    const asunto=`Facturación ${mesNombre} — Somos Magma`
    const ccStr=cc.length?`&cc=${encodeURIComponent(cc.join(','))}`:''
    window.location.href=`mailto:${encodeURIComponent(para.trim())}?subject=${encodeURIComponent(asunto)}${ccStr}&body=${encodeURIComponent(cuerpo)}`
    if(onSent) onSent()
    onClose()
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
      <div style={{padding:'14px 22px',borderTop:`1px solid ${T.border}`,display:'flex',gap:10,justifyContent:'flex-end'}}>
        <button onClick={()=>{navigator.clipboard?.writeText(cuerpo);showToast('Mensaje copiado')}} style={{padding:'9px 16px',borderRadius:9,border:`1px solid ${T.border}`,background:T.surface,color:T.ink2,fontSize:13,fontWeight:500,cursor:'pointer'}}>Copiar</button>
        <button onClick={abrir} style={{padding:'9px 22px',borderRadius:9,border:'none',background:T.brand,color:'#fff',fontSize:13.5,fontWeight:600,cursor:'pointer'}}>Abrir mail</button>
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
function Hero({label, value, sub, subStrong, subStrongColor, accent}){
  return <div style={{flex:1, padding:'22px 24px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:14}}>
    <div style={{fontSize:11, fontWeight:600, letterSpacing:0.5, textTransform:'uppercase', color:T.ink3}}>{label}</div>
    <div style={{fontSize:33, fontWeight:600, fontFamily:MONO, color:accent||T.ink, marginTop:12, letterSpacing:-0.5}}>{value}</div>
    <div style={{fontSize:12.5, color:T.ink2, marginTop:9}}>{sub}{subStrong && <span style={{color:subStrongColor||T.ink, fontWeight:600}}>{subStrong}</span>}</div>
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
const navBtn = { width:34, height:34, borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:14, cursor:'pointer' }
const miniBtn = { padding:'6px 11px', borderRadius:7, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:12, fontWeight:500, cursor:'pointer', textDecoration:'none', display:'inline-block' }
const btnPrimary = { padding:'11px 22px', borderRadius:10, border:'none', background:T.brand, color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer' }
