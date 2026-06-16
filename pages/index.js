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
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const MESES_LARGO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const NAV = [
  {id:'dashboard',label:'Dashboard'},
  {id:'presupuestos',label:'Presupuestos'},
  {id:'calendario',label:'Calendario'},
  {id:'proyectos',label:'Proyectos'},
  {id:'facturacion',label:'Facturación'},
  {id:'pagos',label:'Pagos Staff'},
  {id:'egresos',label:'Egresos'},
  {id:'agencias',label:'Agencias'},
  {id:'clientes',label:'Clientes'},
  {id:'contactos',label:'Contactos'},
  {id:'historico',label:'Histórico'},
]

export default function V2() {
  const { data: session, status } = useSession()
  const mail = session?.user?.email || ''
  const [data,setData] = useState(null)
  const [loading,setLoading] = useState(false)
  const [refreshing,setRefreshing] = useState(false)
  const [err,setErr] = useState('')
  const [mod,setMod] = useState('dashboard')
  const [nav,setNav] = useState(null)  // {mod, filtro?, q?} → al navegar, deja el destino filtrado/buscado
  const goTo = (m, filtro) => { setMod(m); setNav(filtro?{mod:m,filtro}:null) }
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
            : mod==='dashboard' ? <Dashboard data={data} goTo={goTo}/>
            : mod==='presupuestos' ? <Presupuestos data={data} onRefresh={()=>load(true)} showToast={showToast} nav={nav} clearNav={clearNav}/>
            : mod==='calendario' ? <Calendario data={data} onRefresh={()=>load(true)} showToast={showToast}/>
            : mod==='proyectos' ? <Proyectos data={data} onRefresh={()=>load(true)} showToast={showToast} nav={nav} clearNav={clearNav}/>
            : mod==='facturacion' ? <Facturacion data={data} onRefresh={()=>load(true)} showToast={showToast} nav={nav} clearNav={clearNav}/>
            : mod==='pagos' ? <PagosStaff data={data} onRefresh={()=>load(true)} showToast={showToast} nav={nav} clearNav={clearNav}/>
            : mod==='egresos' ? <Egresos data={data} onRefresh={()=>load(true)} showToast={showToast}/>
            : mod==='agencias' ? <Agencias data={data} onRefresh={()=>load(true)} showToast={showToast} nav={nav} clearNav={clearNav}/>
            : mod==='clientes' ? <Clientes data={data} nav={nav} clearNav={clearNav}/>
            : mod==='contactos' ? <Contactos data={data} onRefresh={()=>load(true)} showToast={showToast} nav={nav} clearNav={clearNav}/>
            : mod==='historico' ? <Historico data={data}/>
            : <Placeholder label={NAV.find(n=>n.id===mod)?.label}/>}
        </div>
      </main>
    </div>
    {showSearch && <GlobalSearch data={data} onClose={()=>setShowSearch(false)} onNavegar={(m,q)=>{ goSearch(m,q); setShowSearch(false) }}/>}
    {toast && <div style={{position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', zIndex:1000, padding:'11px 20px', borderRadius:10, fontSize:13, fontWeight:500, color:'#fff', background: toast.tipo==='err'?T.brand:T.ink, boxShadow:'0 8px 24px rgba(0,0,0,0.18)'}}>{toast.msg}</div>}
  </Shell>
}

// ============================ DASHBOARD ============================
function Dashboard({data, goTo}){
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
  const staffAPagar = pagosStaff.filter(p=>{
    const m=String(p['Mes']||'').toLowerCase()
    const esMes = m.includes(String(mesACobrar).padStart(2,'0'))||m.includes(MESES[(mesACobrar+11)%12])
    const yaPagado = String(p['Pagado']||'').toUpperCase()==='TRUE'||p['Pagado']===true
    return esMes && !yaPagado
  })
  const totalAPagar = staffAPagar.reduce((s,p)=>s+parseMonto(p['Monto']||p['Total']),0)

  // --- Rentabilidad del mes ---
  const facMes = fc.filter(f=>esDelMes(f['Fecha emision'],mesActual,anioActual))
  const facMesCobradas = facMes.filter(isCobrada)
  const ingresosMes = facMesCobradas.reduce((s,f)=>s+parseMonto(f['Precio SIN IVA']),0)
  const facMesTotales = facMes.reduce((s,f)=>s+parseMonto(f['Precio SIN IVA']),0)
  const egresosStaffMes = pagosStaff.filter(p=>{const m=String(p['Mes']||'').toLowerCase();return m.includes(String(mesActual).padStart(2,'0'))||m.includes(MESES[mesActual-1])}).reduce((s,p)=>s+parseMonto(p['Monto']||p['Total']),0)
  const rentabilidadMes = ingresosMes - egresosStaffMes

  // --- Conversión + ticket ---
  const presusMes = pr.filter(p=>esDelMes(p['Fecha Presupuesto'],mesActual,anioActual))
  const apMes = presusMes.filter(isAprobado).length
  const espMes = presusMes.filter(p=>String(p['Estado']||'').toUpperCase()==='EN ESPERA').length
  const desMes = presusMes.filter(p=>String(p['Estado']||'').toUpperCase()==='DESAPROBADO').length
  const denom = apMes+espMes+desMes
  const tasaConversion = denom>0?Math.round(apMes/denom*100):0
  const ticketPromedio = facMesCobradas.length>0?Math.round(ingresosMes/facMesCobradas.length):0

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
  const proxMeses = [0,1,2].map(i=>{ const idx=mesActual-1+i; return {m:(idx%12)+1, a:anioActual+Math.floor(idx/12)} })
  const pipeline = proxMeses.map(({m,a})=>{
    const ps = pr.filter(p=>esDelMes(p['Fecha Evento'],m,a)).filter(isAprobado)
    const fact = ps.reduce((s,p)=>s+parseMonto(p['Precio Final']),0)
    const gan = ps.reduce((s,p)=>s+calcGanReal(p),0)
    return {m,a,cant:ps.length,fact,gan}
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

    {/* HERO — los 3 números que mirás todos los días */}
    <div style={{display:'flex', gap:14}}>
      <Hero label="Disponible real"
        value={fmt(totalDisponible)}
        sub={`En caja ${fmt(totalCaja)} · reservado ${fmt(totalReservado)}`}/>
      <Hero label="Por cobrar"
        value={fmt(totalPorCobrar)}
        accent={atrasadas30.length>0?T.brand:T.ink}
        sub={`${porCobrar.length} facturas · `}
        subStrong={atrasadas30.length>0?`${atrasadas30.length} atrasadas +30d`:'al día'}
        subStrongColor={atrasadas30.length>0?T.brand:T.pos}/>
      <Hero label={`A pagar staff · ${proxPagoFecha.getDate()}/${proxPagoFecha.getMonth()+1}`}
        value={fmt(totalAPagar)}
        sub={`${staffAPagar.length} freelancers · mes ${MESES_LARGO[(mesACobrar+11)%12]}`}/>
    </div>

    {/* ESTE MES */}
    <SectionTitle>Este mes</SectionTitle>
    <div style={{display:'flex', gap:12, flexWrap:'wrap'}}>
      <Stat label="Ingresos cobrados" value={fmt(ingresosMes)} color={T.pos}/>
      <Stat label="Facturado (neto)" value={fmt(facMesTotales)}/>
      <Stat label="Pagos staff" value={fmt(egresosStaffMes)}/>
      <Stat label="Resultado" value={fmtS(rentabilidadMes)} color={rentabilidadMes>=0?T.pos:T.brand}/>
      <Stat label="Conversión" value={tasaConversion+'%'}/>
      <Stat label="Ticket prom." value={fmt(ticketPromedio)}/>
    </div>

    {/* PIPELINE */}
    <SectionTitle>Forecast · próximos 3 meses</SectionTitle>
    <div style={{display:'flex', gap:12}}>
      {pipeline.map((p,i)=>(
        <div key={i} style={{flex:1, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:'16px 18px'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
            <span style={{fontSize:12.5, fontWeight:600, color:T.ink}}>{MESES_LARGO[p.m-1]}</span>
            <span style={{fontSize:11, color:T.ink3}}>{p.cant} aprob.</span>
          </div>
          <div style={{fontSize:22, fontWeight:600, fontFamily:MONO, color:T.ink, marginTop:10}}>{fmtM(p.fact)}</div>
          <div style={{fontSize:11.5, color:T.ink2, marginTop:4}}>facturación esperada</div>
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
  const [q,setQ]=useState(''), [f,setF]=useState('todos'), [anio,setAnio]=useState('todos'), [mes,setMes]=useState('todos'), [pm,setPm]=useState('todos'), [open,setOpen]=useState(null), [editing,setEditing]=useState(null), [nuevo,setNuevo]=useState(false), [represu,setRepresu]=useState(null)

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
            <EstadoSelect value={p['Estado']} onChange={nuevo=> nuevo==='REPRESUPUESTADO' ? setRepresu(p) : cambiarEstado(id, nuevo, p['Estado'])}/>
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
  const id = p['Columna 1'] || p['N° presupuesto']
  const ags=[...new Set([...(data?.agencias||[]).map(x=>x['Nombre']),...((data?.presupuestos||[]).map(x=>x['Agencia']))].filter(Boolean))].sort()
  const clis=[...new Set([...(data?.clientes||[]).map(x=>x['Nombre']),...((data?.presupuestos||[]).map(x=>x['Cliente']))].filter(Boolean))].sort()
  const cts=[...new Set([...(data?.contactos||[]).map(x=>x['Nombre']),...((data?.presupuestos||[]).map(x=>x['Contacto']))].filter(Boolean))].sort()
  const pms=[...new Set((data?.presupuestos||[]).map(x=>x['PM Interno']).filter(Boolean))].sort()
  const dl = tipo => tipo==='ag'?ags:tipo==='cl'?clis:tipo==='ct'?cts:null

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

  // autocompletes desde el sheet
  const ags=[...new Set([...(data?.agencias||[]).map(a=>a['Nombre']),...(data?.listado?.agencias||[]),...((data?.presupuestos||[]).map(p=>p['Agencia']))].map(v=>String(v||'').trim()).filter(Boolean))].sort()
  const clis=[...new Set([...(data?.listado?.clientes||[]),...(data?.clientes||[]).map(c=>c['Nombre']),...((data?.presupuestos||[]).map(p=>p['Cliente']))].map(v=>String(v||'').trim()).filter(Boolean))].sort()
  const cts=[...new Set([...(data?.contactos||[]).map(c=>c['Nombre']),...((data?.presupuestos||[]).map(p=>p['Contacto']))].map(v=>String(v||'').trim()).filter(Boolean))].sort()
  const pms=[...new Set([...['Juan','Sofi','Lulu','Tomi'],...((data?.presupuestos||[]).map(p=>p['PM Interno']))].filter(Boolean))]

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
          <div style={{fontSize:12.5, fontWeight:600, color:T.ink, margin:'14px 0 8px'}}>Adicionales opcionales <span style={{fontWeight:400, color:T.ink3}}>(no suman al total principal)</span></div>
          {peds.map((p,i)=> p.adicional && (
            <div key={p.id} style={{display:'grid', gridTemplateColumns:'1.5fr 110px 110px 36px', gap:8, marginBottom:7, alignItems:'center'}}>
              <input list="np-svc" value={p.svc} onChange={e=>selSvc(i,e.target.value)} placeholder="Adicional" style={inpV2}/>
              <input type="number" value={p.precio} onChange={e=>updPed(i,{precio:e.target.value, manual:true})} placeholder="costo" style={{...inpV2, textAlign:'right', fontFamily:MONO}}/>
              <input type="number" value={p.precioCliente} onChange={e=>updPed(i,{precioCliente:e.target.value})} placeholder="precio cli." style={{...inpV2, textAlign:'right', fontFamily:MONO}}/>
              <button onClick={()=>delPed(i)} style={{border:'none', background:'transparent', color:T.ink3, cursor:'pointer', fontSize:16}}>×</button>
            </div>
          ))}
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
                <button onClick={()=>setEstado(num,'APROBADO')} style={{...miniBtn, background:T.pos, color:'#fff', border:'none'}}>✓ Aprobar</button>
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
  const filtrados=proyectos.filter(p=>{
    const fecha=p['Fecha Evento']||''
    const mMes=mes==='todos'||parseInt(fecha.split('/')[1])===parseInt(mes)
    const mAnio=anio==='todos'||fecha.includes(anio)
    const mEst=estado==='todos'||(estado==='ok'&&tieneStaff(p))||(estado==='pendiente'&&!tieneStaff(p))
    const mq=!q||[p['N° presupuesto'],p['Proyecto'],p['Cliente'],p['Agencia']].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase()))
    return mMes&&mAnio&&mEst&&mq
  }).sort((a,b)=>{ const fa=parseD(a['Fecha Evento'])?.getTime()||0, fb=parseD(b['Fecha Evento'])?.getTime()||0; const hoy=Date.now()-864e5; const faF=fa>=hoy,fbF=fb>=hoy; if(faF&&!fbF)return -1; if(!faF&&fbF)return 1; if(faF&&fbF)return fa-fb; return fb-fa })

  const pendientes=proyectos.filter(p=>!tieneStaff(p)).length

  return <>
    <PageHead title="Proyectos" sub={`${filtrados.length} de ${proyectos.length}${pendientes?` · ${pendientes} sin staff`:''}`}/>
    <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', marginBottom:14}}>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar N°, proyecto, cliente, agencia…" style={{flex:'1 1 240px', minWidth:190, padding:'9px 13px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13, outline:'none'}}/>
      <select value={anio} onChange={e=>setAnio(e.target.value)} style={selectStyle}><option value="todos">Año</option>{anios.map(a=><option key={a} value={a}>{a}</option>)}</select>
      <select value={mes} onChange={e=>setMes(e.target.value)} style={selectStyle}><option value="todos">Mes</option>{MESES_LARGO.map((m,i)=><option key={i} value={i+1}>{m}</option>)}</select>
    </div>
    <div style={{display:'flex', gap:7, marginBottom:14}}>
      {[['todos','Todos'],['pendiente','Sin staff'],['ok','Con staff']].map(([k,l])=>(
        <button key={k} onClick={()=>setEstado(k)} style={{padding:'6px 13px', borderRadius:20, fontSize:12, fontWeight:500, cursor:'pointer', border:`1px solid ${estado===k?T.ink:T.border}`, background:estado===k?T.ink:T.surface, color:estado===k?'#fff':T.ink2}}>{l}</button>
      ))}
    </div>
    <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
      <div style={{display:'grid', gridTemplateColumns:'90px 1.8fr 1.1fr 110px 90px', padding:'11px 18px', borderBottom:`1px solid ${T.border}`, fontSize:10.5, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3}}>
        <span>Evento</span><span>Proyecto</span><span>Cliente</span><span style={{textAlign:'right'}}>Total</span><span style={{textAlign:'right'}}>Staff</span>
      </div>
      {filtrados.length===0&&<Empty>Sin resultados</Empty>}
      {filtrados.slice(0,200).map((p,i)=>{
        const num=p['N° presupuesto'], abierto=open===num, ok=tieneStaff(p)
        return <div key={num+'_'+i}>
          <div onClick={()=>setOpen(abierto?null:num)} style={{display:'grid', gridTemplateColumns:'90px 1.8fr 1.1fr 110px 90px', padding:'12px 18px', borderTop:i===0?'none':`1px solid ${T.border}`, cursor:'pointer', alignItems:'center', background:abierto?T.surfaceAlt:'transparent', fontSize:13}}
            onMouseEnter={e=>{if(!abierto)e.currentTarget.style.background=T.surfaceAlt}} onMouseLeave={e=>{if(!abierto)e.currentTarget.style.background='transparent'}}>
            <span style={{fontSize:12, color:T.ink2}}>{p['Fecha Evento']||'—'}</span>
            <span style={{color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:10}}>{p['Proyecto']||'—'}</span>
            <span style={{color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:10}}>{p['Cliente']||'—'}</span>
            <span style={{textAlign:'right', fontFamily:MONO, fontSize:12.5, color:T.ink}}>{fmt(parseMonto(p['Total ']||p['Total']))}</span>
            <span style={{display:'flex', alignItems:'center', justifyContent:'flex-end', gap:6}}>
              <span style={{width:7,height:7,borderRadius:7,background:ok?T.pos:T.warn}}/>
              <span style={{fontSize:12, color:T.ink2}}>{ok?'OK':'Pend.'}</span>
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

    <div style={{display:'flex', gap:24, marginTop:14, paddingTop:14, borderTop:`1px solid ${T.border}`, flexWrap:'wrap', alignItems:'center'}}>
      <Mini label="Presupuestado" val={fmt(total)}/>
      <Mini label="Freelance" val={fmt(fl)}/>
      <Mini label="Somos Magma" val={fmt(mg)} color={T.pos}/>
      <Mini label="Fee Magma" val={fmt(fee)} color={fee<0?T.brand:T.ink}/>
      <div style={{flex:1}}/>
      {sinAsignar>0&&<span style={{fontSize:12, color:T.warn, fontWeight:500}}>{sinAsignar} sin asignar</span>}
      <button onClick={guardar} disabled={saving} style={{padding:'9px 20px', borderRadius:9, border:'none', background:T.brand, color:'#fff', fontSize:13, fontWeight:600, cursor:saving?'default':'pointer', opacity:saving?0.6:1}}>{saving?'Guardando…':'Guardar staff'}</button>
    </div>
    {freel && <FreelancerModal nombre={freel} datos={{}} onClose={()=>setFreel(null)} onSaved={()=>{ setFreel(null); if(onRefresh) onRefresh() }} showToast={showToast}/>}
  </div>
}
function Mini({label,val,color}){ return <div><div style={{fontSize:10, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, fontWeight:600}}>{label}</div><div style={{fontSize:14, fontFamily:MONO, color:color||T.ink, marginTop:2}}>{val}</div></div> }

// ============================ FACTURACIÓN ============================
function Facturacion({data, onRefresh, showToast, nav, clearNav}){
  const fc=data.facturacion||[], cuentas=data.cuentas||[]
  const hoy=new Date()
  const presus=data.presupuestos||[]
  const [q,setQ]=useState(''), [filt,setFilt]=useState('todas'), [cobrando,setCobrando]=useState(null), [nuevaF,setNuevaF]=useState(false)
  useEffect(()=>{ if(nav?.mod==='facturacion'){ if(nav.filtro)setFilt(nav.filtro); if(nav.q){setQ(nav.q); setFilt('todas')} clearNav&&clearNav() } /* eslint-disable-next-line */ },[nav])

  // presupuestos aprobados con saldo pendiente de facturar
  const pendientes=presus.filter(isAprobado).map(p=>{
    const facturado=fc.filter(f=>String(f['N° Presupuesto']||'').trim()===String(p['Columna 1']||'').trim() && !String(f['Nro de Factura']||'').toUpperCase().startsWith('ANULADA')).reduce((s,f)=>s+(parseMonto(f['Precio SIN IVA'])||parseMonto(f['Precio FINAL'])),0)
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

  const diffVenc=f=>{ const v=parseD(f['Vencimiento']); return v?Math.floor((v-hoy)/864e5):null }
  const estF=f=>{ if(isCobrada(f))return'cobrada'; const ya=parseMonto(f['Monto cobrado']); if(ya>0)return'parcial'; const d=diffVenc(f); if(d==null)return'pendiente'; if(d<-30)return'reclamar'; if(d<0)return'vencida'; if(d<7)return'por-vencer'; return'pendiente' }
  const ESTF={ cobrada:{c:T.pos,l:'Cobrada'}, parcial:{c:T.warn,l:'Parcial'}, 'por-vencer':{c:T.warn,l:'Por vencer'}, pendiente:{c:T.ink3,l:'Pendiente'}, vencida:{c:T.brand,l:'Vencida'}, reclamar:{c:T.brand,l:'¡Reclamar!'} }

  // por cobrar
  const pcTotal=fc.filter(f=>!isCobrada(f)).reduce((s,f)=>s+parseMonto(f['Precio FINAL']),0)
  const cbTotal=fc.filter(isCobrada).reduce((s,f)=>s+parseMonto(f['Precio FINAL']),0)
  const vencidasMonto=fc.filter(f=>!isCobrada(f)&&(diffVenc(f)??99)<0).reduce((s,f)=>s+parseMonto(f['Precio FINAL']),0)

  const filtrada=fc.filter(f=>{
    const e=estF(f)
    const mf = filt==='todas' || (filt==='cobrada'&&e==='cobrada') || (filt==='pendiente'&&['pendiente','por-vencer'].includes(e)) || (filt==='atrasadas'&&['vencida','reclamar'].includes(e)) || (filt==='parcial'&&e==='parcial')
    const mq=!q||[f['Nro de Factura'],f['N° Presupuesto'],f['Cliente'],f['Agencia'],f['Proyecto']].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase()))
    return mf&&mq
  }).sort((a,b)=>(diffVenc(a)??99)-(diffVenc(b)??99))

  const FILTROS=[['todas','Todas'],['pendiente','Pendientes'],['atrasadas','Atrasadas'],['parcial','Parciales'],['cobrada','Cobradas']]

  return <>
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20}}>
      <div><h1 style={{fontSize:23, fontWeight:700, color:T.ink, margin:0, letterSpacing:-0.3}}>Facturación</h1><div style={{fontSize:13, color:T.ink3, marginTop:3}}>{filtrada.length} de {fc.length} · {pendientes.length} sin facturar</div></div>
      <button onClick={()=>setNuevaF(true)} style={{padding:'10px 18px', borderRadius:10, border:'none', background:T.brand, color:'#fff', fontSize:13.5, fontWeight:600, cursor:'pointer'}}>+ Nueva factura</button>
    </div>
    <div style={{display:'flex', gap:14, marginBottom:20}}>
      <Hero label="Por cobrar" value={fmt(pcTotal)} accent={vencidasMonto>0?T.brand:T.ink} sub="Vencido: " subStrong={fmt(vencidasMonto)} subStrongColor={vencidasMonto>0?T.brand:T.pos}/>
      <Hero label="Cobrado (total histórico)" value={fmt(cbTotal)} sub="suma de facturas marcadas cobradas"/>
    </div>
    <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', marginBottom:14}}>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar factura, presu, cliente, proyecto…" style={{flex:'1 1 240px', minWidth:190, padding:'9px 13px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13, outline:'none'}}/>
    </div>
    <div style={{display:'flex', gap:7, marginBottom:14}}>
      {FILTROS.map(([k,l])=><button key={k} onClick={()=>setFilt(k)} style={{padding:'6px 13px', borderRadius:20, fontSize:12, fontWeight:500, cursor:'pointer', border:`1px solid ${filt===k?T.ink:T.border}`, background:filt===k?T.ink:T.surface, color:filt===k?'#fff':T.ink2}}>{l}</button>)}
    </div>
    <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
      <div style={{display:'grid', gridTemplateColumns:'130px 1.5fr 100px 120px 165px', padding:'11px 18px', borderBottom:`1px solid ${T.border}`, fontSize:10.5, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3}}>
        <span>Factura</span><span>Proyecto</span><span style={{textAlign:'right'}}>Neto</span><span style={{textAlign:'right'}}>Estado</span><span style={{textAlign:'right'}}>Acción</span>
      </div>
      {filtrada.length===0&&<Empty>Sin resultados</Empty>}
      {filtrada.slice(0,200).map((f,i)=>{
        const e=estF(f), info=ESTF[e], num=f['N° Presupuesto'], d=diffVenc(f)
        return <div key={i} style={{display:'grid', gridTemplateColumns:'130px 1.5fr 100px 120px 165px', padding:'12px 18px', borderTop:i===0?'none':`1px solid ${T.border}`, alignItems:'center', fontSize:13}}>
          <span style={{fontFamily:MONO, fontSize:11.5, color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:8}}>{f['Nro de Factura']||'s/n'}</span>
          <span style={{minWidth:0, paddingRight:10}}>
            <span style={{display:'block', color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{f['Proyecto']||f['Cliente']||'—'}</span>
            <span style={{display:'block', fontSize:11, color:T.ink3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{[f['Cliente'],f['Agencia']].filter(Boolean).join(' · ')}</span>
          </span>
          <span style={{textAlign:'right', fontFamily:MONO, fontSize:12.5, color:T.ink}}>{fmt(parseMonto(f['Precio SIN IVA']))}</span>
          <span style={{display:'flex', alignItems:'center', justifyContent:'flex-end', gap:6}}>
            <span style={{width:7,height:7,borderRadius:7,background:info.c}}/>
            <span style={{fontSize:12, color:T.ink2}}>{info.l}{!isCobrada(f)&&d!=null&&d<0?` ${Math.abs(d)}d`:''}</span>
          </span>
          <span style={{display:'flex', gap:5, justifyContent:'flex-end'}}>
            {!isCobrada(f) && <button onClick={()=>setCobrando(f)} style={{...miniBtn, background:T.pos, color:'#fff', border:'none', padding:'6px 9px'}}>Cobrar</button>}
            <button onClick={()=>mandarMail(f)} style={{...miniBtn, padding:'6px 8px'}} title="Mandar por mail">✉</button>
            {f['Factura']
              ? <a href={f['Factura']} target="_blank" rel="noreferrer" style={{...miniBtn, padding:'6px 8px'}} title="Ver PDF de la factura">📎</a>
              : <button onClick={()=>subirPDF(f)} style={{...miniBtn, padding:'6px 8px'}} title="Subir PDF de la factura">⬆</button>}
            <a href={`/presupuesto?nro=${encodeURIComponent(num)}`} target="_blank" rel="noreferrer" style={{...miniBtn, padding:'6px 8px'}} title="PDF del presupuesto">Presu</a>
          </span>
        </div>
      })}
    </div>
    {cobrando && <CobroModal f={cobrando} cuentas={cuentas} onClose={()=>setCobrando(null)} onRefresh={onRefresh} showToast={showToast}/>}
    {nuevaF && <NuevaFactura pendientes={pendientes} onClose={()=>setNuevaF(false)} onCreada={()=>{ setNuevaF(false); if(onRefresh) onRefresh() }} showToast={showToast}/>}
  </>
}

function NuevaFactura({pendientes, onClose, onCreada, showToast}){
  const hoy=new Date()
  const [sel,setSel]=useState(null), [q,setQ]=useState('')
  const [entidad,setEntidad]=useState('SRL'), [tipo,setTipo]=useState('A'), [nro,setNro]=useState(''), [plazo,setPlazo]=useState('30'), [conIVA,setConIVA]=useState(true), [montoNeto,setMontoNeto]=useState(''), [saving,setSaving]=useState(false), [pdfFile,setPdfFile]=useState(null)
  const neto = sel ? (parseFloat(montoNeto)||sel.pendiente) : 0
  const iva = conIVA?Math.round(neto*0.21):0
  const total = neto+iva
  const lista = pendientes.filter(x=>!q||[x.p['Columna 1'],x.p['Proyecto'],x.p['Cliente'],x.p['Agencia']].some(v=>normTxt(v).includes(normTxt(q))))

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
            {lista.map((x,i)=>(
              <div key={i} onClick={()=>{setSel(x); setMontoNeto(String(Math.round(x.pendiente)))}} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px', borderTop:i===0?'none':`1px solid ${T.border}`, cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background=T.surfaceAlt} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <div style={{minWidth:0}}><div style={{fontSize:13, color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{x.p['Proyecto']||'—'}</div><div style={{fontSize:11.5, color:T.ink3}}>#{x.p['Columna 1']} · {[x.p['Cliente'],x.p['Agencia']].filter(Boolean).join(' · ')}</div></div>
                <span style={{fontSize:12.5, fontFamily:MONO, color:T.brand, fontWeight:600}}>{fmt(x.pendiente)}</span>
              </div>
            ))}
          </div>
        </> : <>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', background:T.surfaceAlt, borderRadius:10, padding:'10px 14px', marginBottom:16}}>
            <div><div style={{fontSize:13, color:T.ink, fontWeight:600}}>{sel.p['Proyecto']||'—'}</div><div style={{fontSize:11.5, color:T.ink3}}>#{sel.p['Columna 1']} · {[sel.p['Cliente'],sel.p['Agencia']].filter(Boolean).join(' · ')} · pendiente {fmt(sel.pendiente)}</div></div>
            <button onClick={()=>setSel(null)} style={miniBtn}>cambiar</button>
          </div>
          <div style={{display:'flex', gap:12, flexWrap:'wrap', marginBottom:12}}>
            <div style={{flex:1, minWidth:120}}><label style={lblV2}>Entidad</label><select value={entidad} onChange={e=>setEntidad(e.target.value)} style={inpV2}>{['SRL','Sofia','Lulu','Efectivo'].map(x=><option key={x} value={x}>{x}</option>)}</select></div>
            <div style={{width:90}}><label style={lblV2}>Tipo</label><select value={tipo} onChange={e=>setTipo(e.target.value)} style={inpV2}>{['A','B','C'].map(x=><option key={x} value={x}>{x}</option>)}</select></div>
            <div style={{flex:1, minWidth:140}}><label style={lblV2}>N° de factura</label><input value={nro} onChange={e=>setNro(e.target.value)} placeholder="ej 0001-00001234" style={inpV2}/></div>
          </div>
          <div style={{display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end', marginBottom:12}}>
            <div style={{width:140}}><label style={lblV2}>Monto neto (sin IVA)</label><input type="number" value={montoNeto} onChange={e=>setMontoNeto(e.target.value)} style={{...inpV2, textAlign:'right', fontFamily:MONO}}/></div>
            <div style={{width:120}}><label style={lblV2}>Plazo</label><select value={plazo} onChange={e=>setPlazo(e.target.value)} style={inpV2}><option value="0">Contado</option><option value="15">15 días</option><option value="30">30 días</option><option value="60">60 días</option></select></div>
            <label style={{display:'flex', gap:7, alignItems:'center', fontSize:13, color:T.ink2, cursor:'pointer', paddingBottom:9}}><input type="checkbox" checked={conIVA} onChange={e=>setConIVA(e.target.checked)}/> Con IVA 21%</label>
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

function CobroModal({f, cuentas, onClose, onRefresh, showToast}){
  const total=parseMonto(f['Precio FINAL'])
  const cuentaOpts=[...new Set((cuentas||[]).map(c=>c['Nombre']).filter(Boolean))]
  const [cuenta,setCuenta]=useState(cuentaOpts[0]||'')
  const [forma,setForma]=useState('Transferencia')
  const [reservarIVA,setReservarIVA]=useState(String(f['Tipo de Factura']||'').toUpperCase()==='A')
  const [saving,setSaving]=useState(false)
  const num=f['N° Presupuesto']

  async function cobrar(){
    if(!cuenta){ showToast('Elegí en qué cuenta entra','err'); return }
    if(!window.confirm(`Marcar #${num} como COBRADA por ${fmt(total)} en ${cuenta}. Esto suma el saldo a la cuenta${reservarIVA?' y reserva el IVA':''}. ¿Confirmás?`)) return
    setSaving(true)
    try{ const r=await fetch('/api/factura-cobro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ nroPresupuesto:String(num), tipoCobro:'total', monto:total, cuentaDestino:cuenta, formaPago:forma, retGanancias:0, retIIBB:0, retIVA:0, comision:0, fechaCobro:`${new Date().getDate()}/${new Date().getMonth()+1}/${new Date().getFullYear()}`, reservarIVA })})
      const j=await r.json(); if(j&&j.error){showToast(j.error,'err');setSaving(false);return}
      showToast(`#${num} cobrada ✓`); onClose(); if(onRefresh) onRefresh()
    }catch(e){ showToast('Error de conexión','err'); setSaving(false) }
  }

  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.35)', zIndex:900, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'60px 20px'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:440, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.15)'}}>
      <div style={{padding:'18px 22px', borderBottom:`1px solid ${T.border}`}}><div style={{fontSize:16, fontWeight:700, color:T.ink}}>Registrar cobro</div><div style={{fontSize:12, color:T.ink3, marginTop:2, fontFamily:MONO}}>#{num} · {f['Proyecto']||f['Cliente']||''}</div></div>
      <div style={{padding:'20px 22px'}}>
        <div style={{textAlign:'center', marginBottom:18}}><div style={{fontSize:11, textTransform:'uppercase', letterSpacing:0.4, color:T.ink3, fontWeight:600}}>Monto a cobrar</div><div style={{fontSize:30, fontWeight:700, fontFamily:MONO, color:T.pos, marginTop:4}}>{fmt(total)}</div></div>
        <label style={lblV2}>Entra en la cuenta</label>
        <select value={cuenta} onChange={e=>setCuenta(e.target.value)} style={{...inpV2, marginBottom:13}}>{cuentaOpts.length===0&&<option value="">Sin cuentas</option>}{cuentaOpts.map(c=><option key={c} value={c}>{c}</option>)}</select>
        <label style={lblV2}>Forma de pago</label>
        <select value={forma} onChange={e=>setForma(e.target.value)} style={{...inpV2, marginBottom:13}}>{['Transferencia','eCheq','Efectivo'].map(x=><option key={x} value={x}>{x}</option>)}</select>
        <label style={{display:'flex', gap:9, alignItems:'center', fontSize:13, color:T.ink2, cursor:'pointer'}}><input type="checkbox" checked={reservarIVA} onChange={e=>setReservarIVA(e.target.checked)}/> Reservar IVA (factura A)</label>
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
  const [q,setQ]=useState(''), [filtro,setFiltro]=useState('todos'), [open,setOpen]=useState(null), [override,setOverride]=useState({}), [freelEdit,setFreelEdit]=useState(null)
  useEffect(()=>{ if(nav?.mod==='pagos'&&nav.q){ setQ(nav.q); setFiltro('todos'); clearNav&&clearNav() } /* eslint-disable-next-line */ },[nav])

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
    if(rnro&&tnro) return rnro===tnro
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
  Object.values(personas).forEach(p=>{ p.trabajos.forEach(t=>{ t.pagado=(t.key in override)?override[t.key]:isPagado(p.nombre,t); if(t.pagado)p.totalPagado+=t.precio; else p.totalPendiente+=t.precio }) })

  let lista=Object.values(personas).sort((a,b)=>b.total-a.total)
  lista=lista.filter(p=>{ const mq=!q||norm(p.nombre).includes(norm(q)); const mf=filtro==='todos'||(filtro==='pend'&&p.totalPendiente>0)||(filtro==='pag'&&p.totalPendiente===0); return mq&&mf })

  const totalPend=Object.values(personas).reduce((s,p)=>s+p.totalPendiente,0)
  const totalPag=Object.values(personas).reduce((s,p)=>s+p.totalPagado,0)

  const rrhhByName={}; rrhh.forEach(r=>{ rrhhByName[String(r['Nombre Apellido']||r['Nombre']||'').trim()]=r })

  const postPago=(persona,t,pagado)=>fetch('/api/pago-staff-toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ mes:mesLabel, persona:persona.nombre, nroProyecto:t.nro, proyecto:t.proyecto, pedido:t.pedido, monto:t.precio, fechaEvento:t.fechaEvento, agencia:t.agencia, pagado, cuenta:'' })}).then(r=>r.json().catch(()=>({})))

  async function togglePago(persona, t, pagado){
    const k=t.key
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
    if(!window.confirm(`Pagar TODO lo de ${nombre} de ${MESES_LARGO[mesIdx-1]}:\n${pend.length} trabajos = ${fmt(persona.totalPendiente)}\n\n¿Confirmás?`)) return
    setOverride(o=>{const n={...o}; pend.forEach(t=>n[t.key]=true); return n})
    try{
      for(const t of pend){ const j=await postPago(persona,t,true); if(j&&j.error) showToast(`Error en ${t.pedido}: ${j.error}`,'err') }
      showToast(`${nombre}: ${pend.length} trabajos pagados`)
      if(onRefresh){ await onRefresh(); setOverride(o=>{const n={...o}; pend.forEach(t=>delete n[t.key]); return n}) }
    }catch(e){ showToast('Error de conexión','err') }
  }
  function mensajeDe(persona){
    const nombre=persona.nombre.split(' ')[0]
    const items=persona.trabajos.filter(t=>!t.pagado).map(t=>`- ${t.pedido} — ${t.proyecto}${t.agencia?` (${t.agencia})`:''}${t.fechaEvento?` [${t.fechaEvento}]`:''}: ${fmt(t.precio)}`).join('\n')
    const tot=persona.trabajos.filter(t=>!t.pagado).reduce((s,t)=>s+t.precio,0)
    return `Hola ${nombre}!\n\nTe paso el detalle de los trabajos de ${MESES_LARGO[mesIdx-1]} para que nos hagas factura:\n\n${items}\n\nTotal: ${fmt(tot)}\n\nCuando tengas la factura lista mandala a admin@somosmagma.com\n\n¡Gracias!`
  }
  function copiarDesc(persona){ navigator.clipboard?.writeText(mensajeDe(persona)); showToast('Mensaje copiado al portapapeles') }
  function mailDe(persona){
    const datos=rrhhByName[persona.nombre.trim()]||{}
    const email=datos['Mail']||datos['Mail freelancer']||datos['Email']||''
    if(!email){ showToast('Este freelancer no tiene mail cargado en RRHH','err'); return }
    const asunto=`Facturación ${MESES_LARGO[mesIdx-1]} ${anio} — Somos Magma`
    window.location.href=`mailto:${email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(mensajeDe(persona))}`
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

    <div style={{display:'flex', flexDirection:'column', gap:10}}>
      {lista.length===0&&<Empty>Sin freelancers con trabajos este mes</Empty>}
      {lista.map((persona,i)=>{
        const abierto=open===persona.nombre, datos=rrhhByName[persona.nombre.trim()]
        const estado = persona.totalPendiente===0 ? {c:T.pos,l:'Pagado'} : persona.totalPagado>0 ? {c:T.warn,l:'Parcial'} : {c:T.brand,l:'Pendiente'}
        return <div key={i} style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
          <div onClick={()=>setOpen(abierto?null:persona.nombre)} style={{display:'flex', alignItems:'center', gap:14, padding:'14px 18px', cursor:'pointer'}}>
            <span style={{width:7,height:7,borderRadius:7,background:estado.c, flexShrink:0}}/>
            <div style={{flex:1, minWidth:0}}><div style={{fontSize:14, fontWeight:600, color:T.ink}}>{persona.nombre}</div><div style={{fontSize:11.5, color:T.ink3}}>{persona.trabajos.length} trabajos · {estado.l}</div></div>
            <div style={{textAlign:'right'}}><div style={{fontSize:14, fontFamily:MONO, fontWeight:600, color:persona.totalPendiente>0?T.brand:T.ink2}}>{fmt(persona.totalPendiente)}</div><div style={{fontSize:11, color:T.ink3}}>de {fmt(persona.total)}</div></div>
            {persona.totalPendiente>0
              ? <button onClick={e=>{e.stopPropagation();pagarTodo(persona)}} style={{padding:'8px 16px', borderRadius:9, border:'none', background:T.pos, color:'#fff', fontSize:12.5, fontWeight:600, cursor:'pointer', flexShrink:0}}>Pagar todo</button>
              : <span style={{padding:'8px 14px', fontSize:12, color:T.pos, fontWeight:600, flexShrink:0}}>✓ Pagado</span>}
          </div>
          {abierto && <div style={{borderTop:`1px solid ${T.border}`, background:T.surfaceAlt, padding:'12px 18px 16px'}}>
            <div style={{display:'flex', gap:20, flexWrap:'wrap', alignItems:'flex-start', padding:'4px 0 12px', marginBottom:8, borderBottom:`1px solid ${T.border}`}}>
              {[['Rubro',datos['Rubro']],['Mail',datos['Mail']],['Tel',datos['Celular']],['DNI',datos['Dni']],['CUIT',datos['CUIT/CUIL']||datos['CUIT']],['Banco',datos['Banco']],['Alias',datos['Alias']],['CBU',datos['CBU']]].filter(x=>x[1]).map(([k,v])=><div key={k}><div style={{fontSize:9.5, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, fontWeight:600}}>{k}</div><div style={{fontSize:12, color:T.ink, fontFamily:MONO, marginTop:2}}>{v}</div></div>)}
              <div style={{flex:1}}/>
              <button onClick={()=>setFreelEdit({nombre:persona.nombre, datos})} style={{...miniBtn, alignSelf:'center'}}>{datos&&Object.keys(datos).length?'✎ Editar datos':'+ Completar datos'}</button>
            </div>
            {persona.totalPendiente>0 && <div style={{fontSize:11, color:T.ink3, marginBottom:6}}>Tildá solo si es un <strong style={{color:T.ink2}}>adelanto</strong> (pagás algunos). Para el pago del mes completo, usá <strong style={{color:T.pos}}>Pagar todo</strong>.</div>}
            {persona.trabajos.map((t,j)=>(
              <div key={j} style={{display:'flex', alignItems:'center', gap:12, padding:'8px 0', opacity:t.pagado?0.55:1}}>
                <input type="checkbox" checked={!!t.pagado} onChange={e=>togglePago(persona,t,e.target.checked)} style={{cursor:'pointer'}}/>
                <div style={{flex:1, minWidth:0}}><span style={{fontSize:12.5, color:T.ink}}>{t.pedido}</span> <span style={{fontSize:11.5, color:T.ink3}}>· {t.proyecto} {t.fechaEvento?`· ${t.fechaEvento}`:''}</span></div>
                <span style={{fontSize:12.5, fontFamily:MONO, color:T.ink}}>{fmt(t.precio)}</span>
              </div>
            ))}
            <div style={{display:'flex', justifyContent:'flex-end', marginTop:10}}>
              <button onClick={()=>copiarDesc(persona)} style={miniBtn}>📋 Copiar mensaje</button>
              <button onClick={()=>mailDe(persona)} style={{...miniBtn, background:T.ink, color:'#fff', border:'none'}}>✉ Mandar mail</button>
            </div>
          </div>}
        </div>
      })}
    </div>
    {freelEdit && <FreelancerModal nombre={freelEdit.nombre} datos={freelEdit.datos||{}} onClose={()=>setFreelEdit(null)} onSaved={()=>{ setFreelEdit(null); if(onRefresh) onRefresh() }} showToast={showToast}/>}
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
        if(editando) return <div key={i} style={{display:'grid', gridTemplateColumns:'1.3fr 1fr 1.4fr 1fr 90px', gap:8, padding:'8px 18px', borderTop:`1px solid ${T.border}`, alignItems:'center', background:T.surfaceAlt}}>
          <input value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} style={inpV2}/>
          <input value={form.agencia} onChange={e=>setForm(f=>({...f,agencia:e.target.value}))} style={inpV2}/>
          <input value={form.mail} onChange={e=>setForm(f=>({...f,mail:e.target.value}))} style={inpV2}/>
          <input value={form.telefono} onChange={e=>setForm(f=>({...f,telefono:e.target.value}))} style={inpV2}/>
          <div style={{display:'flex', gap:4}}><button onClick={()=>guardar(c)} style={{...miniBtn, background:T.pos, color:'#fff', border:'none'}}>✓</button><button onClick={()=>setEdit(null)} style={miniBtn}>×</button></div>
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
            {st.psList.slice(-8).reverse().map((p,i)=>(
              <div key={i} style={{display:'flex', justifyContent:'space-between', padding:'5px 0', fontSize:12, borderTop:`1px solid ${T.border}`}}>
                <span style={{color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:8}}>{p['Proyecto']||p['Cliente']||'—'}</span>
                <span style={{fontFamily:MONO, color:T.ink2}}>{fmtM(parseMonto(p['Precio Final']))}</span>
              </div>
            ))}
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
  const stats=nombre=>{ const n=normTxt(nombre); const ps=presus.filter(p=>normTxt(p['Cliente'])===n); const fcs=fc.filter(f=>normTxt(f['Cliente'])===n); return {presus:ps.length, fact:fcs.length, cobrado:fcs.filter(isCobrada).reduce((s,f)=>s+parseMonto(f['Precio FINAL']),0), psList:ps} }
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
          <div style={{display:'flex', gap:18, flexWrap:'wrap', marginBottom:12}}>
            <Mini label="Presupuestos" val={st.presus}/><Mini label="Facturas" val={st.fact}/><Mini label="Cobrado" val={fmtM(st.cobrado)} color={T.pos}/>
          </div>
          {[['Agencia habitual',cliSel['Agencia habitual']],['Industria',cliSel['Industria']],['Última vez',cliSel['Ultima vez']]].filter(x=>x[1]).map(([k,v])=>(
            <div key={k} style={{display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:12.5}}><span style={{color:T.ink3}}>{k}</span><span style={{color:T.ink}}>{v}</span></div>
          ))}
          <div style={{fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, margin:'14px 0 6px'}}>Últimos presupuestos</div>
          {st.psList.slice(-8).reverse().map((p,i)=>(
            <div key={i} style={{display:'flex', justifyContent:'space-between', padding:'5px 0', fontSize:12, borderTop:`1px solid ${T.border}`}}>
              <span style={{color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:8}}>{p['Proyecto']||'—'}</span>
              <span style={{fontFamily:MONO, color:T.ink2}}>{fmtM(parseMonto(p['Precio Final']))}</span>
            </div>
          ))}
        </div>
      </div>}
    </div>
  </>
}

// ============================ HISTÓRICO ============================
function Historico({data}){
  const proyectos=data.proyectos||[], fc=data.facturacion||[]
  const [anio,setAnio]=useState('2026')
  const fcByNro={}; fc.forEach(f=>{fcByNro[String(f['N° Presupuesto'])]=f})
  const magma2026=p=>{ const fee=parseMonto(p['Fee Agencia']||p['Fee Final']); let sm=0; for(let j=1;j<=20;j++){ if(String(p['Staff '+j]||'').trim()==='Somos Magma') sm+=parseMonto(p['Precio '+j]) } return fee+sm+parseMonto(p['Diferencia']) }

  let filas=[]
  if(anio==='2026'){
    filas=proyectos.filter(p=>String(p['Fecha Evento']||'').includes('2026')).map(p=>{ const f=fcByNro[String(p['N° presupuesto'])]
      return {mes:(p['Fecha Evento']||'').split('/')[1]||'', fecha:p['Fecha Evento'], nro:p['N° presupuesto'], cliente:p['Cliente'], agencia:p['Agencia'], proyecto:p['Proyecto'], total:parseMonto(p['Total ']||p['Total']), magma:magma2026(p), cobrado:f?isCobrada(f):false} })
  } else {
    const src={'2023':data.historico2023,'2024':data.historico2024,'2025':data.historico2025}[anio]||[]
    filas=src.map(r=>({ mes:r['Mes'], fecha:r['Fecha Evento'], nro:r['Nro Presupuesto'], cliente:r['Cliente'], agencia:r['Agencia'], proyecto:r['Proyecto'], total:parseMonto(r['Total']), magma:parseMonto(r['Viaticos'])+parseMonto(r['Magma'])+parseMonto(r['Impuestos'])+parseMonto(r['Extra M']), cobrado:String(r['Cobrado']||'').toUpperCase()==='SÍ'||String(r['Cobrado']||'').toUpperCase()==='SI'||String(r['Cobrado']||'').toUpperCase()==='TRUE' }))
  }
  const facturado=filas.reduce((s,r)=>s+r.total,0)
  const ganancia=filas.reduce((s,r)=>s+r.magma,0)
  const margenPct=facturado>0?(ganancia/facturado)*100:0

  // top clientes del año
  const porCli={}; filas.forEach(r=>{ const c=r.cliente||'—'; porCli[c]=(porCli[c]||0)+r.total }); const topCli=Object.entries(porCli).sort((a,b)=>b[1]-a[1]).slice(0,8)

  return <>
    <PageHead title="Histórico" sub={`${filas.length} proyectos en ${anio}`}/>
    <div style={{display:'flex', gap:8, marginBottom:18}}>
      {['2023','2024','2025','2026'].map(a=><button key={a} onClick={()=>setAnio(a)} style={{padding:'7px 16px', borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer', border:`1px solid ${anio===a?T.ink:T.border}`, background:anio===a?T.ink:T.surface, color:anio===a?'#fff':T.ink2}}>{a}</button>)}
    </div>
    <div style={{display:'flex', gap:12, marginBottom:20, flexWrap:'wrap'}}>
      <Stat label="Proyectos" value={filas.length}/>
      <Stat label="Facturado" value={fmt(facturado)}/>
      <Stat label="Ganancia Magma" value={fmt(ganancia)} color={T.pos}/>
      <Stat label="Margen" value={Math.round(margenPct)+'%'}/>
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
function FreelancerModal({nombre, datos={}, onClose, onSaved, showToast}){
  const [form,setForm]=useState(()=>({ rubro:datos['Rubro']||'', celular:datos['Celular']||'', mailFreelancer:datos['Mail']||'', dni:datos['Dni']||'', cuit:datos['CUIT/CUIL']||'', banco:datos['Banco']||'', alias:datos['Alias']||'', cbu:datos['CBU']||'' }))
  const [saving,setSaving]=useState(false)
  const existe = datos && Object.keys(datos).length>0
  const campos=[['rubro','Rubro'],['celular','Celular'],['mailFreelancer','Mail'],['dni','DNI'],['cuit','CUIT / CUIL'],['banco','Banco'],['alias','Alias'],['cbu','CBU']]
  async function guardar(){
    setSaving(true)
    try{ const r=await fetch('/api/freelancer-upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre, ...form})}); const j=await r.json(); if(!j.ok){showToast(j.error||'Error','err');setSaving(false);return} showToast(`${String(nombre).split(' ')[0]} guardado`); onSaved&&onSaved() }
    catch(e){ showToast('Error de conexión','err'); setSaving(false) }
  }
  return <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(26,25,23,0.35)',zIndex:950,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'48px 20px',overflowY:'auto'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%',maxWidth:480,background:T.surface,borderRadius:16,border:`1px solid ${T.border}`,boxShadow:'0 16px 50px rgba(0,0,0,0.15)',height:'fit-content'}}>
      <div style={{padding:'18px 22px',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div><div style={{fontSize:16,fontWeight:700,color:T.ink}}>{existe?'Datos del freelancer':'Nuevo freelancer'}</div><div style={{fontSize:12,color:T.ink3,marginTop:2}}>{nombre}</div></div>
        <button onClick={onClose} style={{border:'none',background:'transparent',fontSize:20,color:T.ink3,cursor:'pointer',lineHeight:1}}>×</button>
      </div>
      <div style={{padding:'18px 22px',display:'flex',flexWrap:'wrap',gap:12}}>
        {campos.map(([k,l])=>(
          <div key={k} style={{flex:'1 1 45%',minWidth:160}}><label style={lblV2}>{l}</label><input value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={inpV2}/></div>
        ))}
      </div>
      <div style={{padding:'14px 22px',borderTop:`1px solid ${T.border}`,display:'flex',gap:10,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{padding:'9px 18px',borderRadius:9,border:`1px solid ${T.border}`,background:T.surface,color:T.ink2,fontSize:13,fontWeight:500,cursor:'pointer'}}>Cancelar</button>
        <button onClick={guardar} disabled={saving} style={{padding:'9px 22px',borderRadius:9,border:'none',background:T.brand,color:'#fff',fontSize:13.5,fontWeight:600,cursor:saving?'default':'pointer',opacity:saving?0.6:1}}>{saving?'Guardando…':'Guardar'}</button>
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
function Stat({label, value, color}){
  return <div style={{flex:'1 1 130px', minWidth:120, padding:'14px 16px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:11}}>
    <div style={{fontSize:10.5, fontWeight:600, letterSpacing:0.3, textTransform:'uppercase', color:T.ink3}}>{label}</div>
    <div style={{fontSize:19, fontWeight:600, fontFamily:MONO, color:color||T.ink, marginTop:7}}>{value}</div>
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
