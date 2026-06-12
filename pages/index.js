import React, { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import { useSession, signIn, signOut } from 'next-auth/react'

const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']

// Parsear montos del Sheets que vienen como '$2,400,000.00'
const parseMonto = v => {
  if (!v) return 0
  const n = parseFloat(String(v).replace(/[$,\\\\\\\\s]/g, ''))
  return isNaN(n) ? 0 : n
}
const fmt = n => '$' + Math.round(Math.abs(n||0)).toLocaleString('es-AR')
const fmtM = n => { const a=Math.abs(n||0); return (n<0?'-':'')+(a>=1000000?'$'+(a/1000000).toFixed(1)+'M':'$'+Math.round(a/1000)+'K') }

// Columnas reales del Sheets
const isAprobado = p => {
  const e = String(p['Estado']||'').toUpperCase()
  return e === 'APROBADO' || e === 'EN CURSO' || e === 'ENTREGADO'
}
const isCobrada = f => {
  const v = f['Cobrado']
  return v === true || v === 'TRUE' || String(v).toUpperCase() === 'TRUE'
}

// ---- DATOS LISTADO ----
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
const AGENCIAS_LIST=['Ostara','Minita','Pop Up','Stadium','ADN','Quilmes','Creators Lab','Mole Media','WeCorp','Louder','Smarketing','Bacardi','Integra','Btlandia','OIR','SPA','ABV','Piet','Nodus','Bermuda','United Scale Arts','Meikin','CMQ','Bar de eventos','The Bloom','Velvet','Mucha','Freelance','Zona Prop','azcuy','Blue Mail','Mercurias','KLM']
const CLIENTES_LIST=['Santander','Unilever','Austral','Air France','Iveco','Latam','Campari','LOreal','Maybelline','Betsson','Disney','Quilmes','Chandon','Honda','Peugeot','Endeavor','Baron B','Google','Microsoft','Coca Cola','Adidas','Mercado Libre','YPF','Volkswagen','Personal','Telecom','Brahma','Off','Integra','Rutini','Visa','Natura']
const CONTACTOS_LIST=[
  {n:'Agostina Caruso',ag:''},{n:'Alejandra Moreno',ag:'Nodus'},{n:'Balado, Natalia',ag:'KLM'},
  {n:'Belen Infante',ag:'Stadium'},{n:'Belen ST',ag:'Ostara'},{n:'Bruno Dibattista',ag:'Stadium'},
  {n:'Camila Cabo',ag:'SPA'},{n:'Camila Carrion',ag:'OIR'},{n:'Caro Persico',ag:'Piet'},
  {n:'Carolina Forestano',ag:'Pop Up'},{n:'Cristian Di Menna',ag:'azcuy'},{n:'Delfina Felice',ag:'Pop Up'},
  {n:'Emi Perez',ag:'Minita'},{n:'Eugenia Pelaya',ag:'Meikin'},{n:'Facundo Leiton',ag:'Nodus'},
  {n:'Fernanda Adriano',ag:'Minita'},{n:'Florencia Julian',ag:'Pop Up'},{n:'Freire, Melisa Daiana',ag:'Quilmes'},
  {n:'Gabriela Capitani',ag:'Stadium'},{n:'Georgia Etchegaray',ag:'Blue Mail'},{n:'Gina',ag:'United Scale Arts'},
  {n:'Julieta Actis',ag:'Minita'},{n:'Lali Di Stefano',ag:'ADN'},{n:'Lorena Vilanova',ag:'Austral'},
  {n:'Lucía Miño',ag:'Ostara'},{n:'Mariana Angulegui',ag:'Ostara'},{n:'Mariel Conti',ag:'ABV'},
  {n:'Martin Lombardi',ag:'Pop Up'},{n:'Nahuel Corbalan',ag:'Ostara'},{n:'Natalia Dalzotto',ag:'Freelance'},
  {n:'Natalia Emanuele',ag:'Ostara'},{n:'Natalia Torres',ag:'Ostara'},{n:'Pabla Valenti',ag:'azcuy'},
  {n:'Pachu Tamargo',ag:'Minita'},{n:'Romina Aguilera',ag:'Stadium'},{n:'Sabrina Segú',ag:'Louder'},
  {n:'Silvia Colussi',ag:'Ostara'},{n:'Valeria Ibarra',ag:'Ostara'},{n:'Victoria Martinez',ag:'Quilmes'},
  {n:'Victoria Mithieux',ag:'Integra'},{n:'Daniela Torres',ag:'Ostara'},{n:'Gaston Gandara',ag:'ADN'},
  {n:'Mariano Castellani',ag:'Pop Up'},{n:'Nahiara Fernandez Roman',ag:'Pop Up'},{n:'Lucila Zicari',ag:'Ostara'},
  {n:'Melina Martinez Claret',ag:'SPA'},{n:'Agustina Monzon',ag:'ADN'},{n:'Gonzalo Gugliottella',ag:'ADN'},
  {n:'Agustina Ezcurra',ag:'The Bloom'},{n:'Florencia Kralik',ag:'Btlandia'},{n:'Luis Lasaga',ag:'ADN'},
  {n:'Christian Konig',ag:'Smarketing'},{n:'Bastian Osella',ag:'CMQ'},{n:'Bruno Rossi',ag:'Ostara'},
  {n:'Sofia Barandalla',ag:'Minita'},{n:'Juani Rojas',ag:'Velvet'},{n:'Ana Iberlucea',ag:'Bermuda'},
  {n:'Sabrina Wasserman',ag:'Mucha'},
]

export default function App() {
  const { data: session, status } = useSession()
  const mail = session?.user?.email || ''
  const [loading,setLoading]=useState(false), [data,setData]=useState(null), [mod,setMod]=useState('dashboard'), [err,setErr]=useState(''), [showNP,setShowNP]=useState(false)
  const [showSearch,setShowSearch]=useState(false)
  const [showAtajos,setShowAtajos]=useState(false)
  const [openTarget,setOpenTarget]=useState(null)  // {mod, query, num} → filtro automático al cambiar de módulo desde Cmd+K

  // Listener global de atajos de teclado
  useEffect(()=>{
    const handler = (e) => {
      // Si el foco está en input/textarea/select → no aplicar atajos numéricos (solo Cmd+K y Esc)
      const enInput = ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName) || e.target.isContentEditable

      // Cmd+K / Ctrl+K → buscador (siempre, incluso en inputs)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault(); setShowSearch(true); return
      }
      // Esc cierra modales (siempre)
      if (e.key === 'Escape') { setShowSearch(false); setShowAtajos(false); return }
      // ? muestra ayuda (solo fuera de inputs)
      if (!enInput && e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault(); setShowAtajos(true); return
      }
      // Atajos numéricos para módulos (solo fuera de inputs)
      if (!enInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const num = parseInt(e.key)
        if (num >= 1 && num <= 9 && NAV[num-1]) { e.preventDefault(); setMod(NAV[num-1].id) }
        if (e.key === '0' && NAV[9]) { e.preventDefault(); setMod(NAV[9].id) }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  // Cargar data cuando hay sesión válida
  useEffect(()=>{
    if (status === 'authenticated' && mail && !data && !loading) {
      load()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[status, mail])

  async function load() {
    setLoading(true);setErr('')
    try {
      // Ya no necesita 'x-user-email' header — el middleware + getServerSession valida del cookie
      // Siempre fresh: el cache de 30s del endpoint causaba que represupuestos / nuevos proyectos no aparecieran al refrescar
      const r=await fetch('/api/data?fresh=1')
      const j=await r.json()
      if(j.ok) setData(j.data)
      else setErr('Error: '+j.error)
    } catch(e){setErr('Error de conexión')}
    setLoading(false)
  }

  function logout(){ signOut({callbackUrl:'/login'}) }

  const NAV=[{id:'dashboard',label:'Dashboard',icon:'⌂'},{id:'calendario',label:'Calendario',icon:'📅'},{id:'presupuestos',label:'Presupuestos',icon:'📋'},{id:'proyectos',label:'Proyectos',icon:'🎬'},{id:'facturacion',label:'Facturación',icon:'💵'},{id:'pagos',label:'Pagos Staff',icon:'👥'},{id:'egresos',label:'Egresos',icon:'💳'},{id:'agencias',label:'Agencias',icon:'🏢'},{id:'clientes',label:'Clientes',icon:'🎯'},{id:'contactos',label:'Contactos',icon:'☎'},{id:'historico',label:'Histórico',icon:'📊'}]

  // Mientras NextAuth resuelve la sesión
  if(status === 'loading') return <><Head><title>Somos Magma</title></Head><GS/><div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',background:'#090909'}}><div style={S.logo}>M//</div><div style={{color:'#555',marginTop:16}}>Verificando sesión...</div></div></>

  // Sin sesión: el middleware ya debería haber redirigido a /login. Por las dudas, botón manual.
  if(status === 'unauthenticated' || !mail) return <><Head><title>Somos Magma</title></Head><GS/><div style={S.lw}><div style={S.lb}><div style={S.logo}>M//</div><div style={S.ls}>SOMOS MAGMA</div><div style={{marginBottom:24,fontSize:13,color:'#555'}}>Necesitás iniciar sesión</div><button style={S.bp} onClick={()=>signIn('google',{callbackUrl:'/'})}>Ingresar con Google</button></div></div></>

  if(loading) return <><Head><title>Somos Magma</title></Head><GS/><div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',background:'#090909'}}><div style={S.logo}>M//</div><div style={{color:'#555',marginTop:16}}>Cargando...</div><div style={S.sp}/></div></>

  return <><Head><title>Somos Magma</title></Head><GS/>
    <div style={S.app}>
      <div style={S.sb}>
        <div style={{padding:'20px 16px 16px',borderBottom:'1px solid #2A2A2A'}}><div style={S.logo}>M//</div><div style={S.ls}>SOMOS MAGMA</div></div>
        <nav style={{flex:1,padding:'12px 8px',overflowY:'auto'}}>
          {NAV.map((n,i)=>{
            const badge = n.id==='proyectos' ? (data?.proyectos||[]).filter(p=>{const carga=p['Carga Staff'];if(carga===true||carga==='TRUE')return false;const staffs=[];for(let j=1;j<=20;j++){if(p['Staff '+j]||(j===1?p['Staff']:null))staffs.push(true)}return staffs.length===0}).length : null
            const atajo = i < 9 ? String(i+1) : (i===9 ? '0' : null)
            return <button key={n.id} style={{...S.ni,...(mod===n.id?{color:'#F0F0F0',background:'#262626'}:{})}} onClick={()=>setMod(n.id)} title={atajo?`Atajo: ${atajo}`:''}>
              <span style={{fontSize:12,width:16,textAlign:'center'}}>{n.icon}</span>
              <span style={{flex:1}}>{n.label}</span>
              {badge!=null&&badge>0&&<span style={{fontSize:9,padding:'1px 6px',borderRadius:8,background:'#E24B4A30',color:'#E24B4A',fontWeight:600}}>{badge}</span>}
              {atajo&&<span style={{fontSize:9,padding:'1px 5px',borderRadius:3,background:mod===n.id?'#1A1A1A':'#161616',color:'#555',fontFamily:'monospace'}}>{atajo}</span>}
            </button>
          })}
        </nav>
        <div style={{padding:'12px 16px',borderTop:'1px solid #2A2A2A'}}><div style={{fontSize:11,color:'#555',marginBottom:6}}>{mail}</div><button style={{fontSize:11,padding:'4px 10px',borderRadius:4,border:'0.5px solid #333',background:'transparent',color:'#555',cursor:'pointer'}} onClick={logout}>Salir</button>{mail==='arauzjuanmartin@gmail.com'&&<SetupBtn mail={mail} onDataChange={()=>load()}/>}<div style={{fontSize:11,color:'#333',marginTop:12}}>Productora Audiovisual<br/>since '23 //</div></div>
      </div>
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div style={{padding:'16px 24px',borderBottom:'1px solid #2A2A2A',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
          <div><div style={{fontSize:18,fontWeight:700}}>{NAV.find(n=>n.id===mod)?.label}</div><div style={{fontSize:12,color:'#555',marginTop:2}}>Vista general</div></div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <button onClick={()=>setShowSearch(true)} title="Buscar (Cmd+K)" style={{display:'flex',alignItems:'center',gap:8,padding:'6px 12px',borderRadius:6,border:'0.5px solid #333',background:'#1A1A1A',color:'#888',fontSize:12,cursor:'pointer'}}>
              <span style={{fontSize:13}}>🔍</span>
              <span>Buscar...</span>
              <span style={{fontSize:10,padding:'1px 5px',borderRadius:3,background:'#262626',color:'#666',fontFamily:'monospace'}}>⌘K</span>
            </button>
            {mod==='presupuestos'&&<button style={{fontSize:12,padding:'6px 14px',borderRadius:6,border:'none',background:'#1543F8',color:'#fff',cursor:'pointer',fontWeight:500}} onClick={()=>setShowNP(true)}>+ Nuevo presupuesto</button>}
            <button style={{fontSize:12,padding:'6px 14px',borderRadius:6,border:'0.5px solid #333',background:'transparent',color:'#777',cursor:'pointer'}} onClick={()=>load()}>↻ Actualizar</button>
          </div>
        </div>
        <div style={{flex:1,padding:'16px 24px',overflowY:'auto'}}>
          {err&&<div style={{background:'#E24B4A20',border:'0.5px solid #E24B4A',borderRadius:8,padding:'10px 14px',color:'#E24B4A',fontSize:13,marginBottom:14}}>{err}</div>}
          {!data?<div style={S.nd}>Sin datos</div>:<Mod id={mod} data={data} mail={mail} onRefresh={()=>load()} openTarget={openTarget} clearTarget={()=>setOpenTarget(null)}/>}
        </div>
      </div>
    </div>
    {showNP&&<NuevoPresupuesto mail={mail} onClose={()=>setShowNP(false)} onGuardado={(p)=>{setData(prev=>({...prev,presupuestos:[...(prev.presupuestos||[]),p]}))}} data={data}/>}
    {showSearch&&<GlobalSearch data={data} onClose={()=>setShowSearch(false)} onNavegar={(modulo, target)=>{setMod(modulo);setOpenTarget(target);setShowSearch(false)}}/>}
    {showAtajos&&<AtajosModal onClose={()=>setShowAtajos(false)} nav={NAV}/>}
  </>
}

function Mod({id,data,mail,onRefresh,openTarget,clearTarget}){
  const targetForThis = openTarget && openTarget.q ? openTarget : null
  switch(id){
    case 'dashboard': return <Dashboard data={data} mail={mail} onRefresh={onRefresh}/>
    case 'presupuestos': return <Presupuestos data={data} mail={mail} onRefresh={onRefresh} openTarget={targetForThis} clearTarget={clearTarget}/>
    case 'proyectos': return <Proyectos data={data} mail={mail} onRefresh={onRefresh} openTarget={targetForThis} clearTarget={clearTarget}/>
    case 'facturacion': return <Facturacion data={data} mail={mail} onRefresh={onRefresh} openTarget={targetForThis} clearTarget={clearTarget}/>
    case 'pagos': return <PagosStaff data={data} mail={mail} onRefresh={onRefresh}/>
    case 'egresos': return <Egresos data={data} mail={mail} onRefresh={onRefresh}/>
    case 'agencias': return <Agencias data={data} mail={mail} onRefresh={onRefresh}/>
    case 'clientes': return <Clientes data={data} mail={mail}/>
    case 'contactos': return <Contactos data={data} mail={mail}/>
    case 'calendario': return <Calendario data={data} mail={mail} onRefresh={onRefresh}/>
    case 'historico': return <Historico data={data}/>
    default: return <div style={S.nd}>En construcción</div>
  }
}

// ---- DASHBOARD HOME SOCIOS ----
const RESERVA_TIPOS=['IVA','FIMA','Sueldos','Ganancias','IIBB','Otros']

function NuevaReservaForm({cuenta,mail,onDone,onCancel}){
  const [form,setForm]=useState({concepto:'',monto:'',tipo:'IVA',notas:''})
  const [saving,setSaving]=useState(false),[err,setErr]=useState('')
  const guardar=async()=>{
    if(!form.concepto||!form.monto){setErr('Faltan concepto o monto');return}
    setSaving(true);setErr('')
    try{
      const r=await fetch('/api/reserva-nueva',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cuenta,concepto:form.concepto,monto:parseFloat(form.monto)||0,tipo:form.tipo,notas:form.notas})})
      const j=await r.json()
      if(j.ok){onDone()}else setErr(j.error)
    }catch(e){setErr(e.message)}
    setSaving(false)
  }
  const i={width:'100%',padding:'4px 6px',borderRadius:3,border:'0.5px solid #333',background:'#000',color:'#F0F0F0',fontSize:10,outline:'none',marginBottom:3}
  return <div style={{background:'#050505',border:'0.5px solid #BA7517',borderRadius:6,padding:8,marginTop:6}}>
    <select value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})} style={i}>{RESERVA_TIPOS.map(t=><option key={t}>{t}</option>)}</select>
    <input value={form.concepto} onChange={e=>setForm({...form,concepto:e.target.value})} placeholder='Concepto (ej: IVA abril)' style={i}/>
    <input type='number' value={form.monto} onChange={e=>setForm({...form,monto:e.target.value})} placeholder='Monto $' style={i}/>
    <input value={form.notas} onChange={e=>setForm({...form,notas:e.target.value})} placeholder='Notas (opcional)' style={i}/>
    {err&&<div style={{fontSize:9,color:'#E24B4A',marginBottom:3}}>{err}</div>}
    <div style={{display:'flex',gap:3}}>
      <button onClick={guardar} disabled={saving} style={{flex:1,fontSize:9,padding:'3px 6px',borderRadius:3,border:'none',background:'#BA7517',color:'#fff',cursor:'pointer'}}>{saving?'...':'Reservar'}</button>
      <button onClick={onCancel} style={{flex:1,fontSize:9,padding:'3px 6px',borderRadius:3,border:'0.5px solid #333',background:'transparent',color:'#888',cursor:'pointer'}}>Cancelar</button>
    </div>
  </div>
}

function CuentaCard({c,reservas,mail,onSaved}){
  const [editing,setEditing]=useState(false)
  const [val,setVal]=useState(String(parseMonto(c['Saldo actual'])))
  const [valUsd,setValUsd]=useState(String(parseMonto(c['Saldo USD']||0)))
  const [nota,setNota]=useState(c['Notas']||''),[saving,setSaving]=useState(false)
  const [expanded,setExpanded]=useState(false),[creatingReserva,setCreatingReserva]=useState(false)
  const s=parseMonto(c['Saldo actual'])
  const sUsd=parseMonto(c['Saldo USD']||0)
  const muestraUsd = sUsd > 0 || c['Tipo']==='Efectivo' || c['Nombre']==='Efectivo'
  const reservasActivas=(reservas||[]).filter(r=>String(r['Activa']||'').toUpperCase()==='SÍ'||String(r['Activa']||'').toUpperCase()==='SI'||r['Activa']===true)
  const totalReservado=reservasActivas.reduce((acc,r)=>acc+parseMonto(r['Monto']),0)
  const disponible=s-totalReservado
  const guardar=async()=>{
    setSaving(true)
    try{
      const r=await fetch('/api/cuenta-saldo-update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:c['Nombre'],saldoArs:parseFloat(val)||0,saldoUsd:parseFloat(valUsd)||0,notas:nota})})
      const j=await r.json()
      if(j.ok){setEditing(false);if(onSaved)onSaved()}
      else alert('Error: '+j.error)
    }catch(e){alert('Error: '+e.message)}
    setSaving(false)
  }
  const liberar=async(res)=>{
    if(!confirm(`Liberar reserva "${res['Concepto']}" de ${fmt(parseMonto(res['Monto']))}?`))return
    try{
      const r=await fetch('/api/reserva-liberar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cuenta:res['Cuenta'],concepto:res['Concepto'],fecha:res['Fecha']})})
      const j=await r.json()
      if(j.ok&&onSaved)onSaved()
      else alert('Error: '+(j.error||'desconocido'))
    }catch(e){alert('Error: '+e.message)}
  }
  return <div style={{background:'#0A0A0A',border:'0.5px solid #1D9E7520',borderRadius:8,padding:'10px 12px',position:'relative'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:3}}>
      <div style={{fontSize:10,color:'#888',textTransform:'uppercase',letterSpacing:'0.05em',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{c['Nombre']}</div>
      {reservasActivas.length>0&&<span style={{fontSize:9,color:'#BA7517',marginLeft:4}} title={`${reservasActivas.length} reservas activas`}>●{reservasActivas.length}</span>}
    </div>
    {editing?<div>
      <div style={{fontSize:9,color:'#888',marginBottom:2}}>Saldo ARS</div>
      <input type='number' value={val} onChange={e=>setVal(e.target.value)} autoFocus style={{width:'100%',padding:'4px 6px',borderRadius:4,border:'0.5px solid #1D9E75',background:'#000',color:'#1D9E75',fontFamily:'monospace',fontSize:14,outline:'none',marginBottom:4}}/>
      {muestraUsd&&<>
        <div style={{fontSize:9,color:'#888',marginBottom:2}}>Saldo USD</div>
        <input type='number' value={valUsd} onChange={e=>setValUsd(e.target.value)} style={{width:'100%',padding:'4px 6px',borderRadius:4,border:'0.5px solid #1543F8',background:'#000',color:'#1543F8',fontFamily:'monospace',fontSize:13,outline:'none',marginBottom:4}}/>
      </>}
      <input value={nota} onChange={e=>setNota(e.target.value)} placeholder='Nota (opcional)' style={{width:'100%',padding:'3px 6px',borderRadius:4,border:'0.5px solid #333',background:'#000',color:'#aaa',fontSize:10,outline:'none',marginBottom:4}}/>
      <div style={{display:'flex',gap:4}}>
        <button onClick={guardar} disabled={saving} style={{flex:1,fontSize:10,padding:'3px 6px',borderRadius:3,border:'none',background:'#1D9E75',color:'#fff',cursor:'pointer'}}>{saving?'...':'✓'}</button>
        <button onClick={()=>{setEditing(false);setVal(String(s));setValUsd(String(sUsd));setNota(c['Notas']||'')}} style={{flex:1,fontSize:10,padding:'3px 6px',borderRadius:3,border:'0.5px solid #333',background:'transparent',color:'#888',cursor:'pointer'}}>✕</button>
      </div>
    </div>:<>
      <div style={{fontFamily:'monospace',fontSize:16,fontWeight:500,color:s>0?'#1D9E75':'#555',cursor:'pointer'}} onClick={()=>setEditing(true)} title='Click para editar saldo'>{fmtM(s)}</div>
      {muestraUsd&&<div style={{fontFamily:'monospace',fontSize:12,color:sUsd>0?'#1543F8':'#444',marginTop:1,cursor:'pointer'}} onClick={()=>setEditing(true)}>USD {sUsd.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2})}</div>}
      {totalReservado>0&&<>
        <div style={{fontSize:9,color:'#BA7517',marginTop:2}}>-{fmt(totalReservado)} reservado</div>
        <div style={{fontSize:11,fontFamily:'monospace',color:disponible>=0?'#1D9E75':'#E24B4A',fontWeight:500,marginTop:1}}>= {fmtM(disponible)} disp.</div>
      </>}
      <div style={{fontSize:9,color:'#555',marginTop:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c['Entidad fiscal']||''}</div>
      {c['Última actualización']&&<div style={{fontSize:9,color:'#444',marginTop:1}}>Act: {c['Última actualización']}</div>}
      <div style={{display:'flex',gap:4,marginTop:6}}>
        <button onClick={()=>setExpanded(!expanded)} style={{flex:1,fontSize:9,padding:'3px 4px',borderRadius:3,border:'0.5px solid #333',background:'transparent',color:'#888',cursor:'pointer'}}>{expanded?'−':'+'} Reservas</button>
      </div>
      {expanded&&<div style={{marginTop:6}}>
        {reservasActivas.length===0&&<div style={{fontSize:9,color:'#555',textAlign:'center',padding:'4px 0'}}>Sin reservas activas</div>}
        {reservasActivas.map((r,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:4,padding:'3px 4px',background:'#000',borderRadius:3,marginBottom:2,fontSize:9}}>
          <span style={{color:'#BA7517',width:30}}>{r['Tipo']||''}</span>
          <span style={{flex:1,color:'#ccc',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r['Concepto']||''}</span>
          <span style={{fontFamily:'monospace',color:'#BA7517'}}>{fmt(parseMonto(r['Monto']))}</span>
          <button onClick={()=>liberar(r)} title='Marcar usada (liberar)' style={{width:14,height:14,padding:0,border:'none',background:'transparent',color:'#E24B4A',cursor:'pointer',fontSize:10,lineHeight:1}}>×</button>
        </div>)}
        {creatingReserva?<NuevaReservaForm cuenta={c['Nombre']} mail={mail} onDone={()=>{setCreatingReserva(false);if(onSaved)onSaved()}} onCancel={()=>setCreatingReserva(false)}/>
        :<button onClick={()=>setCreatingReserva(true)} style={{width:'100%',fontSize:9,padding:'3px 4px',borderRadius:3,border:'0.5px dashed #BA7517',background:'transparent',color:'#BA7517',cursor:'pointer',marginTop:2}}>+ Nueva reserva</button>}
      </div>}
    </>}
  </div>
}

function Dashboard({data,mail,onRefresh}){
  const pr=data.presupuestos||[], fc=data.facturacion||[], cuentas=data.cuentas||[], proyectos=data.proyectos||[], pagosStaff=data.pagosStaff||[], reservas=data.reservas||[]
  const [calHuerfanos,setCalHuerfanos]=useState(null)
  const [calLoading,setCalLoading]=useState(false)
  const [ignorados,setIgnorados]=useState(()=>{try{return new Set(JSON.parse(localStorage.getItem('cal_ignorar')||'[]'))}catch(e){return new Set()}})
  useEffect(()=>{
    setCalLoading(true)
    fetch('/api/calendar-huerfanos')
      .then(r=>r.json()).then(j=>setCalHuerfanos(j)).catch(()=>{}).finally(()=>setCalLoading(false))
  },[mail])
  const ignorarEvento=(id)=>{const n=new Set(ignorados);n.add(id);setIgnorados(n);localStorage.setItem('cal_ignorar',JSON.stringify([...n]))}
  const designorar=(id)=>{const n=new Set(ignorados);n.delete(id);setIgnorados(n);localStorage.setItem('cal_ignorar',JSON.stringify([...n]))}
  // Filtros heurísticos para distinguir ruido vs trabajos reales
  const esRuido=(e)=>{const t=String(e.titulo||'').toLowerCase();return /cumple|vence|pago cuota|vacac|feriado|reunion interna|reunión interna|interno/.test(t)}

  const hoy=new Date(), mesActual=hoy.getMonth()+1, anioActual=hoy.getFullYear()
  const mesAnterior=mesActual===1?12:mesActual-1, anioAnterior=mesActual===1?anioActual-1:anioActual

  // Parsear fecha DD/MM/YYYY
  const parseD=s=>{if(!s)return null;const p=String(s).split('/');if(p.length===3)return new Date(+p[2],+p[1]-1,+p[0]);return null}
  const mesDe=d=>{const f=parseD(d);return f?{m:f.getMonth()+1,a:f.getFullYear()}:null}
  const esDelMes=(fecha,m,a)=>{const x=mesDe(fecha);return x&&x.m===m&&x.a===a}
  const diasEntre=d=>{const f=parseD(d);return f?Math.floor((hoy-f)/864e5):0}

  // === 1. SALDOS POR CUENTA + RESERVAS ===
  const cuentasActivas=cuentas.filter(c=>String(c['Activa']||'').toUpperCase()==='SÍ'||String(c['Activa']||'').toUpperCase()==='SI'||c['Activa']===true||c['Activa']==='TRUE')
  const totalCaja=cuentasActivas.reduce((s,c)=>s+parseMonto(c['Saldo actual']),0)
  const totalCajaUsd=cuentasActivas.reduce((s,c)=>s+parseMonto(c['Saldo USD']||0),0)
  const reservasActivasTodas=(reservas||[]).filter(r=>String(r['Activa']||'').toUpperCase()==='SÍ'||String(r['Activa']||'').toUpperCase()==='SI'||r['Activa']===true)
  const totalReservadoGlobal=reservasActivasTodas.reduce((s,r)=>s+parseMonto(r['Monto']),0)
  const totalDisponible=totalCaja-totalReservadoGlobal
  const reservasPorCuenta=reservasActivasTodas.reduce((acc,r)=>{const k=r['Cuenta'];if(!acc[k])acc[k]=[];acc[k].push(r);return acc},{})

  // === 2. PROYECTOS ACTIVOS DEL MES ===
  const proyMes=proyectos.filter(p=>esDelMes(p['Fecha Evento'],mesActual,anioActual))
  const proyMesTop5=[...proyMes].sort((a,b)=>(parseMonto(b['Total '])||parseMonto(b['Total']))-(parseMonto(a['Total '])||parseMonto(a['Total']))).slice(0,5)
  const proyMesAnt=proyectos.filter(p=>esDelMes(p['Fecha Evento'],mesAnterior,anioAnterior)).length

  // === 3. RENTABILIDAD DEL MES ===
  const facMes=fc.filter(f=>esDelMes(f['Fecha emision'],mesActual,anioActual))
  const facMesCobradas=facMes.filter(isCobrada)
  const ingresosMes=facMesCobradas.reduce((s,f)=>s+parseMonto(f['Precio SIN IVA']),0)
  const facMesTotales=facMes.reduce((s,f)=>s+parseMonto(f['Precio SIN IVA']),0)
  const egresosMesPagosStaff=pagosStaff.filter(p=>{const m=String(p['Mes']||'').toLowerCase();return m.includes(String(mesActual).padStart(2,'0'))||m.includes(['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][mesActual-1])}).reduce((s,p)=>s+parseMonto(p['Monto']||p['Total']),0)
  const rentabilidadMes=ingresosMes-egresosMesPagosStaff

  // Mes anterior para comparativa
  const facMesAnt=fc.filter(f=>esDelMes(f['Fecha emision'],mesAnterior,anioAnterior)).filter(isCobrada).reduce((s,f)=>s+parseMonto(f['Precio SIN IVA']),0)
  const pctProyectos=proyMesAnt?Math.round((proyMes.length-proyMesAnt)/proyMesAnt*100):0
  const pctFacturacion=facMesAnt?Math.round((ingresosMes-facMesAnt)/facMesAnt*100):0

  // === 4. POR COBRAR (separado IVA / sin IVA) ===
  const esPagaAtrasado=f=>{const cli=String(f['Cliente']||'').toLowerCase();const ag=String(f['Agencia']||'').toLowerCase();return cli.includes('unilever')||ag.includes('oir')}
  const porCobrar=fc.filter(f=>!isCobrada(f)).map(f=>{const venc=parseD(f['Vencimiento']);const dAtraso=venc?Math.floor((hoy-venc)/864e5):0;const fEv=parseD(f['Fecha Evento']);const diasDesdeEvento=fEv?Math.floor((hoy-fEv)/864e5):0;return {...f,dAtraso,diasDesdeEvento,pagaAtrasado:esPagaAtrasado(f),monto:parseMonto(f['Precio FINAL']),neto:parseMonto(f['Precio SIN IVA']),iva:parseMonto(f['IVA'])}}).sort((a,b)=>b.diasDesdeEvento-a.diasDesdeEvento)
  const totalPorCobrar=porCobrar.reduce((s,f)=>s+f.monto,0)
  const totalPorCobrarSinIVA=porCobrar.reduce((s,f)=>s+f.neto,0)
  const totalIVAporCobrar=porCobrar.reduce((s,f)=>s+f.iva,0)
  // Atrasadas por antigüedad desde fecha de evento
  const atrasadas90=porCobrar.filter(f=>f.diasDesdeEvento>90)
  const atrasadas60=porCobrar.filter(f=>f.diasDesdeEvento>60&&f.diasDesdeEvento<=90)
  const atrasadas30=porCobrar.filter(f=>f.diasDesdeEvento>30&&f.diasDesdeEvento<=60)
  const totalAtrasadas=atrasadas90.reduce((s,f)=>s+f.monto,0)+atrasadas60.reduce((s,f)=>s+f.monto,0)+atrasadas30.reduce((s,f)=>s+f.monto,0)

  // === 4b. PIPELINE PRÓXIMOS 3 MESES (presus aprobados con fecha evento futura) ===
  const presusAprobados=pr.filter(isAprobado)
  const fcByPresu={}; fc.forEach(f=>{fcByPresu[String(f['N° Presupuesto'])]=f})
  // Map de proyecto por N° presupuesto (para acceder a Staff/SM y Diferencia)
  const proyByNro={}; proyectos.forEach(prj=>{proyByNro[String(prj['N° presupuesto'])]=prj})
  // Calcula ganancia REAL de un presupuesto cruzando con su proyecto si existe:
  // Ganancia = Fee Agencia + sum(Precios donde Staff='Somos Magma') + Diferencia
  const calcGanReal = (presu) => {
    const proy = proyByNro[String(presu['Columna 1']||presu['N° presupuesto'])]
    const fee = parseMonto((proy?proy['Fee Agencia']:presu['Fee Agencia'])||0)
    if (!proy) return { fee, somosMagma: 0, diferencia: 0, neta: fee, impuestos: parseMonto(presu['Impuesto a las ganancias'])+parseMonto(presu['IIBB']) }
    let somosMagma = 0
    for (let j=1; j<=20; j++) {
      const staff = String(proy['Staff '+j]||(j===1?proy['Staff']:'')||'').trim()
      if (staff === 'Somos Magma') {
        const precio = parseMonto(proy['Precio '+j]||(j===1?proy['Precio']:''))
        if (precio > 0) somosMagma += precio
      }
    }
    const diferencia = parseMonto(proy['Diferencia'])
    const impuestos = parseMonto(proy['Imp. Ganancias']||presu['Impuesto a las ganancias'])+parseMonto(proy['IIBB']||presu['IIBB'])
    return { fee, somosMagma, diferencia, neta: fee+somosMagma+diferencia, impuestos }
  }
  const proxMeses=[]
  for(let i=0;i<3;i++){const m=((mesActual-1+i)%12)+1;const a=anioActual+Math.floor((mesActual-1+i)/12);proxMeses.push({m,a})}
  const pipeline=proxMeses.map(({m,a})=>{
    const psAll=pr.filter(p=>esDelMes(p['Fecha Evento'],m,a))
    const ps=psAll.filter(isAprobado)
    const psEnEspera=psAll.filter(p=>String(p['Estado']||'').toUpperCase()==='EN ESPERA')
    const psDesaprobados=psAll.filter(p=>String(p['Estado']||'').toUpperCase()==='DESAPROBADO')
    const facEsperada=ps.reduce((s,p)=>s+parseMonto(p['Precio Final']),0)
    const gananciaDetalle = ps.reduce((acc,p)=>{
      const g = calcGanReal(p)
      acc.fee += g.fee; acc.sm += g.somosMagma; acc.dif += g.diferencia; acc.neta += g.neta; acc.imp += g.impuestos
      return acc
    }, {fee:0, sm:0, dif:0, neta:0, imp:0})
    const ganancia = gananciaDetalle.neta
    const impuestos = gananciaDetalle.imp
    const gananciaFee = gananciaDetalle.fee
    const gananciaSM = gananciaDetalle.sm
    const gananciaDif = gananciaDetalle.dif
    const enEspera=psEnEspera.reduce((s,p)=>s+parseMonto(p['Precio Final']),0)
    const yaFacturado=ps.filter(p=>fcByPresu[String(p['Columna 1'])]).length
    return {m,a,cant:ps.length,facEsperada,ganancia,gananciaFee,gananciaSM,gananciaDif,impuestos,yaFacturado,enEspera,cantEspera:psEnEspera.length,cantTotal:psAll.length,cantDesa:psDesaprobados.length}
  })

  // === 4c. TASA CONVERSIÓN + TICKET PROMEDIO (último mes con datos) ===
  const presusMes=pr.filter(p=>esDelMes(p['Fecha Presupuesto'],mesActual,anioActual))
  const presusMesAprobados=presusMes.filter(isAprobado).length
  const presusMesEnEspera=presusMes.filter(p=>String(p['Estado']||'').toUpperCase()==='EN ESPERA').length
  const presusMesDesaprobados=presusMes.filter(p=>String(p['Estado']||'').toUpperCase()==='DESAPROBADO').length
  const denom=presusMesAprobados+presusMesEnEspera+presusMesDesaprobados
  const tasaConversion=denom>0?Math.round(presusMesAprobados/denom*100):0
  const ticketPromedio=facMesCobradas.length>0?Math.round(ingresosMes/facMesCobradas.length):0

  // === 4d. PUNTO EQUILIBRIO (subsistencia) ===
  const gastosFijosMes=SU_DEFAULTS.reduce((s,x)=>s+x.b,0)+GF_DEFAULTS.reduce((s,g)=>s+g.m,0)
  const gananciaEsperadaMes=pipeline[0]?.ganancia||0
  const dif=gananciaEsperadaMes-gastosFijosMes
  const subsistencia=dif>=0?{ok:true,texto:`Mes rentable +${fmt(dif)}`,color:'#1D9E75'}:{ok:false,texto:`Faltan ${fmt(Math.abs(dif))} para cubrir gastos fijos`,color:'#E24B4A'}

  // === 5. POR PAGAR STAFF ===
  const diaHoy=hoy.getDate()
  const proxPagoFecha=new Date(anioActual,diaHoy>=15?mesActual:mesActual-1,15)
  const mesACobrar=diaHoy>=15?mesActual:mesActual-1 // el 15 paga el mes anterior
  const staffAPagar=pagosStaff.filter(p=>{const m=String(p['Mes']||'').toLowerCase();const esMesACobrar=m.includes(String(mesACobrar).padStart(2,'0'))||m.includes(['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][(mesACobrar+11)%12]);const yaPagado=String(p['Pagado']||'').toUpperCase()==='TRUE'||p['Pagado']===true;return esMesACobrar&&!yaPagado})
  const totalAPagar=staffAPagar.reduce((s,p)=>s+parseMonto(p['Monto']||p['Total']),0)

  // === 6. ALERTAS ===
  const alertas=[]
  atrasadas90.filter(f=>!f.pagaAtrasado).forEach(f=>alertas.push({tipo:'cobro-critico',texto:`🚨 ${f['Cliente']} sin cobrar hace ${f.diasDesdeEvento}d — ${f['Proyecto']||'s/p'} ${fmt(f.monto)}`,color:'#E24B4A'}))
  porCobrar.filter(f=>f.dAtraso>0&&f.dAtraso<=30).forEach(f=>alertas.push({tipo:'factura-vencida',texto:`Factura ${f['Nro de Factura']||'s/n'} vencida hace ${f.dAtraso}d — ${f['Cliente']} ${fmt(f.monto)}`,color:'#E24B4A'}))
  porCobrar.filter(f=>f.dAtraso<0&&f.dAtraso>=-3).forEach(f=>alertas.push({tipo:'factura-por-vencer',texto:`Factura ${f['Nro de Factura']||'s/n'} vence en ${Math.abs(f.dAtraso)}d — ${f['Cliente']}`,color:'#BA7517'}))
  proyectos.filter(p=>{const fe=parseD(p['Fecha Evento']);if(!fe)return false;const diasAlRodaje=Math.floor((fe-hoy)/864e5);const sinStaff=!(p['Carga Staff']===true||p['Carga Staff']==='TRUE');return diasAlRodaje>=0&&diasAlRodaje<=7&&sinStaff}).forEach(p=>alertas.push({tipo:'proyecto-sin-staff',texto:`#${p['N° presupuesto']} "${p['Proyecto']||'—'}" sin staff — rodaje ${p['Fecha Evento']}`,color:'#BA7517'}))

  // === 7. TOP CLIENTES DEL AÑO ===
  const clientesAnio={}
  fc.filter(f=>{const x=mesDe(f['Fecha emision']);return x&&x.a===anioActual}).forEach(f=>{
    const k=f['Cliente']||f['Agencia']||'—'
    if(!clientesAnio[k])clientesAnio[k]={nombre:k,total:0,cant:0,cobrado:0}
    clientesAnio[k].total+=parseMonto(f['Precio SIN IVA'])
    clientesAnio[k].cant++
    if(isCobrada(f))clientesAnio[k].cobrado+=parseMonto(f['Precio SIN IVA'])
  })
  const topClientes=Object.values(clientesAnio).sort((a,b)=>b.total-a.total).slice(0,5)

  const nombreMes=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][mesActual-1]
  const cColor=(val)=>val===0?'#555':val>0?'#1D9E75':'#E24B4A'
  const fmtPct=v=>(v>0?'+':'')+v+'%'

  // ════════════════════════════════════════════════════════════════════
  // BANNER DE ALERTAS — top de cosas pendientes que requieren acción (separate from alertas array)
  // ════════════════════════════════════════════════════════════════════
  const alertasBanner = (() => {
    const out = []
    // Presus aprobados sin proyecto (bug clásico del sheet)
    const proyectosNumSet = new Set(proyectos.map(p => String(p['N° presupuesto']||'').trim()).filter(Boolean))
    const aprobadosSinProy = pr.filter(p => isAprobado(p) && !proyectosNumSet.has(String(p['Columna 1']||'').trim()))
    if (aprobadosSinProy.length > 0) out.push({tipo:'critico', icon:'⚠', titulo:aprobadosSinProy.length+' presu'+(aprobadosSinProy.length>1?'s':'')+' aprobado'+(aprobadosSinProy.length>1?'s':'')+' sin proyecto', sub:'Ej: '+aprobadosSinProy.slice(0,3).map(p=>'#'+p['Columna 1']).join(', '), mod:'presupuestos'})

    // Proyectos próximos (siguientes 14 días) sin staff
    const proxSinStaff = proyectos.filter(p => {
      const f = parseD(p['Fecha Evento'])
      if (!f) return false
      const dias = (f.getTime() - hoy.getTime())/86400000
      if (dias < 0 || dias > 14) return false
      // chequear si tiene staff
      let tieneStaff = false
      for (let j=1; j<=20; j++) {
        const s = String(p['Staff '+j]||(j===1?p['Staff']:'')||'').trim()
        if (s && s !== 'Somos Magma') { tieneStaff = true; break }
      }
      return !tieneStaff
    })
    if (proxSinStaff.length > 0) out.push({tipo:'critico', icon:'👥', titulo:proxSinStaff.length+' proyecto'+(proxSinStaff.length>1?'s':'')+' en 14d sin staff', sub:'Ej: '+proxSinStaff.slice(0,3).map(p=>'#'+p['N° presupuesto']+' '+p['Fecha Evento']).join(', '), mod:'proyectos'})

    // Facturas vencen esta semana
    const venceSemana = porCobrar.filter(f => { const v = parseD(f['Vencimiento']); if (!v) return false; const dias = (v.getTime()-hoy.getTime())/86400000; return dias >= 0 && dias <= 7 })
    if (venceSemana.length > 0) out.push({tipo:'aviso', icon:'💵', titulo:venceSemana.length+' factura'+(venceSemana.length>1?'s':'')+' vence'+(venceSemana.length>1?'n':'')+' en 7 días', sub:'Total: '+fmt(venceSemana.reduce((s,f)=>s+f.monto,0)), mod:'facturacion'})

    // Facturas atrasadas +30d (uso variables locales del Dashboard, no kpis que es de Facturación)
    const cantAtrasadasTotal = atrasadas90.length + atrasadas60.length + atrasadas30.length
    if (cantAtrasadasTotal > 0) out.push({tipo:'aviso', icon:'🔥', titulo:cantAtrasadasTotal+' factura'+(cantAtrasadasTotal>1?'s':'')+' atrasada'+(cantAtrasadasTotal>1?'s':'')+' +30d', sub:fmt(totalAtrasadas)+' pendientes de cobro', mod:'facturacion'})

    // Agencias sin CUIT con presus este año
    const agSinCuit = (data.agencias||[]).filter(a => !a['CUIT'] && a['Activa']==='SI').length
    if (agSinCuit > 5) out.push({tipo:'info', icon:'🏢', titulo:agSinCuit+' agencias activas sin CUIT', sub:'Crítico para facturar — completar fichas', mod:'agencias'})

    // FACTURAS ZOMBIES: facturas cuyo presu está en REPRESUPUESTADO/DESAPROBADO/EN ESPERA o ya no existe
    const estadoByPresu = {}
    pr.forEach(p => { const n=String(p['Columna 1']||'').trim(); if(n) estadoByPresu[n] = String(p['Estado']||'').toUpperCase() })
    const zombies = fc.filter(f => {
      const nro = String(f['N° Presupuesto']||'').trim()
      if (!nro) return false
      const nroFact = String(f['Nro de Factura']||'').trim().toUpperCase()
      if (nroFact.startsWith('ANULADA')) return false  // ya anuladas no cuentan
      const estado = estadoByPresu[nro]
      return !estado || ['REPRESUPUESTADO','DESAPROBADO','EN ESPERA'].includes(estado)
    })
    if (zombies.length > 0) {
      const cobradas = zombies.filter(z => isCobrada(z)).length
      out.push({tipo:'critico', icon:'🧟', titulo:zombies.length+' factura'+(zombies.length>1?'s':'')+' zombie'+(zombies.length>1?'s':'')+' (presu represupuestado/desaprobado)', sub: cobradas>0 ? cobradas+' YA COBRADAS — investigar urgente' : 'Revisar y anular o anclar al presu correcto', mod:'facturacion'})
    }

    // PROYECTOS APROBADOS SIN FACTURA EMITIDA — del año actual
    const facturasPorPresuSet = new Set(fc.map(f => String(f['N° Presupuesto']||'').trim()).filter(Boolean))
    const proysSinFactura = proyectos.filter(p => {
      const nro = String(p['N° presupuesto']||'').trim()
      if (!nro) return false
      const fe = String(p['Fecha Evento']||'')
      if (!fe.includes(String(anioActual))) return false  // solo del año
      return !facturasPorPresuSet.has(nro)
    })
    if (proysSinFactura.length > 0) {
      const montoTotal = proysSinFactura.reduce((s,p)=>s+parseMonto(p['Total ']||p['Total']),0)
      out.push({tipo:'aviso', icon:'📄', titulo:proysSinFactura.length+' proyecto'+(proysSinFactura.length>1?'s':'')+' aprobado'+(proysSinFactura.length>1?'s':'')+' sin factura emitida', sub:fmtM(montoTotal)+' potencial de facturar', mod:'proyectos'})
    }

    return out
  })()

  return <div>

    {/* ALERTAS — banner top con cosas que requieren acción */}
    {alertasBanner.length > 0 && <div style={{marginBottom:14}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,fontSize:11,color:'#888',textTransform:'uppercase',letterSpacing:'.06em'}}>
        <span>Necesita tu atención</span>
        <span style={{padding:'1px 6px',borderRadius:8,background:'#E24B4A30',color:'#E24B4A',fontSize:10,fontWeight:600}}>{alertasBanner.length}</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:8}}>
        {alertasBanner.map((a,i) => {
          const colorBg = a.tipo==='critico'?'#E24B4A':a.tipo==='aviso'?'#BA7517':'#1543F8'
          return <div key={i} onClick={()=>typeof onRefresh==='function'?null:null} style={{padding:'10px 12px',background:colorBg+'10',border:'0.5px solid '+colorBg+'40',borderRadius:6,borderLeft:'3px solid '+colorBg,display:'flex',alignItems:'flex-start',gap:10}}>
            <span style={{fontSize:18,lineHeight:1}}>{a.icon}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:600,color:'#F0F0F0',marginBottom:2}}>{a.titulo}</div>
              <div style={{fontSize:10,color:'#888',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{a.sub}</div>
            </div>
          </div>
        })}
      </div>
    </div>}

    {/* 1. SALDOS EN CUENTA */}
    <div style={{...S.card,marginBottom:12,padding:'14px 18px',background:'#0F1A0F',borderColor:'#1D9E7530'}}>
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',marginBottom:12,gap:16,flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:11,color:'#1D9E7599',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Caja bruta</div>
          <div style={{fontSize:28,fontWeight:600,fontFamily:'monospace',color:'#1D9E75'}}>{fmt(totalCaja)}</div>
          {totalCajaUsd>0&&<div style={{fontSize:13,fontFamily:'monospace',color:'#1543F8',marginTop:2}}>+ USD {totalCajaUsd.toLocaleString('en-US',{maximumFractionDigits:0})}</div>}
        </div>
        <div>
          <div style={{fontSize:11,color:'#BA751799',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Reservado</div>
          <div style={{fontSize:22,fontWeight:500,fontFamily:'monospace',color:'#BA7517'}}>-{fmt(totalReservadoGlobal)}</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:11,color:'#F0F0F099',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Disponible real</div>
          <div style={{fontSize:32,fontWeight:700,fontFamily:'monospace',color:totalDisponible>=0?'#F0F0F0':'#E24B4A'}}>{fmt(totalDisponible)}</div>
        </div>
      </div>
      {cuentasActivas.length===0?<div style={{fontSize:12,color:'#BA7517',padding:'8px 0'}}>Sin cuentas cargadas. Revisá la hoja CUENTAS del Sheet.</div>:
      <div style={{display:'grid',gridTemplateColumns:`repeat(${Math.min(cuentasActivas.length,5)},minmax(0,1fr))`,gap:8}}>
        {cuentasActivas.map((c,i)=><CuentaCard key={i} c={c} reservas={reservasPorCuenta[c['Nombre']]||[]} mail={mail} onSaved={onRefresh}/>)}
      </div>}
      <div style={{fontSize:10,color:'#555',marginTop:8,display:'flex',justifyContent:'space-between'}}>
        <span>Click en monto = editar saldo · Click en "+ Reservas" = gestionar</span>
        <span>{reservasActivasTodas.length} reservas activas</span>
      </div>
    </div>

    {/* 2. PROYECTOS + 3. RENTABILIDAD (side by side) */}
    <div style={{display:'grid',gridTemplateColumns:'1.3fr 1fr',gap:12,marginBottom:12}}>
      <div style={S.card}>
        <div style={{...S.ch,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span>Proyectos de {nombreMes}</span>
          <span style={{fontSize:11,color:'#555',fontWeight:400}}>{proyMes.length} activos · {fmtPct(pctProyectos)} vs {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][mesAnterior-1]}</span>
        </div>
        {proyMesTop5.length===0?<div style={{padding:'14px 16px',color:'#555',fontSize:12}}>Sin proyectos este mes</div>:proyMesTop5.map((p,i)=>{const ok=p['Carga Staff']===true||p['Carga Staff']==='TRUE';return <div key={i} style={{...S.lr,gap:10}}>
          <span style={{color:'#1543F8',fontFamily:'monospace',fontSize:11}}>#{p['N° presupuesto']}</span>
          <span style={{flex:1,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p['Proyecto']||p['Cliente']||'—'} <span style={{fontSize:10,color:'#555'}}>· {p['Fecha Evento']||''}</span></span>
          <span style={{...S.badge,background:ok?'#1D9E7520':'#BA751720',color:ok?'#1D9E75':'#BA7517',fontSize:10}}>{ok?'OK':'Staff pend.'}</span>
          <span style={{fontFamily:'monospace',fontSize:12,minWidth:70,textAlign:'right'}}>{fmt(parseMonto(p['Total '])||parseMonto(p['Total']))}</span>
        </div>})}
      </div>

      <div style={{...S.card,padding:'14px 18px'}}>
        <div style={{fontSize:11,color:'#555',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>Rentabilidad {nombreMes}</div>
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:12}}><span style={{color:'#888'}}>Ingresos cobrados</span><span style={{fontFamily:'monospace',color:'#1D9E75'}}>+{fmt(ingresosMes)}</span></div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:12}}><span style={{color:'#888'}}>Facturado (bruto mes)</span><span style={{fontFamily:'monospace',color:'#555'}}>{fmt(facMesTotales)}</span></div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:12}}><span style={{color:'#888'}}>Pagos staff mes</span><span style={{fontFamily:'monospace',color:'#E24B4A'}}>-{fmt(egresosMesPagosStaff)}</span></div>
          <div style={{borderTop:'0.5px solid #2A2A2A',margin:'6px 0'}}/>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:15,fontWeight:600}}><span>Resultado</span><span style={{fontFamily:'monospace',color:rentabilidadMes>=0?'#1D9E75':'#E24B4A'}}>{rentabilidadMes>=0?'+':''}{fmt(rentabilidadMes)}</span></div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#555'}}><span>Facturación vs mes anterior</span><span style={{color:cColor(pctFacturacion)}}>{fmtPct(pctFacturacion)}</span></div>
        </div>
      </div>
    </div>

    {/* 4. FORECAST: POR COBRAR + PIPELINE 3 MESES + KPIs OPERATIVOS */}
    <div style={{...S.card,marginBottom:12,padding:'14px 18px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{fontSize:11,color:'#555',textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:500}}>Forecast — lo que viene</div>
        <div style={{fontSize:10,color:subsistencia.color,fontWeight:500}}>{subsistencia.texto}</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1.2fr 2fr',gap:14}}>
        <div style={{background:'#1E1E1E',borderRadius:8,padding:'12px 14px'}}>
          <div style={{fontSize:11,color:'#888',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>Por cobrar (ya facturado)</div>
          <div style={{fontFamily:'monospace',fontSize:24,fontWeight:600,color:'#BA7517'}}>{fmtM(totalPorCobrarSinIVA)}</div>
          <div style={{fontSize:11,color:'#555',marginTop:2}}>{porCobrar.length} facturas · sin IVA</div>
          <div style={{borderTop:'0.5px solid #2A2A2A',marginTop:8,paddingTop:8,display:'flex',justifyContent:'space-between',fontSize:12}}>
            <span style={{color:'#888'}}>+ IVA por cobrar</span>
            <span style={{fontFamily:'monospace',color:'#E24B4A'}}>{fmtM(totalIVAporCobrar)}</span>
          </div>
          <div style={{fontSize:10,color:'#555',marginTop:4,fontStyle:'italic'}}>El IVA se separa cuando entra → AFIP</div>
        </div>
        <div>
          <div style={{fontSize:11,color:'#888',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>Pipeline próximos 3 meses (presus aprobados con fecha evento)</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
            {pipeline.map(({m,a,cant,facEsperada,ganancia,gananciaFee,gananciaSM,gananciaDif,impuestos,yaFacturado,enEspera,cantEspera,cantTotal,cantDesa},i)=>(
              <div key={i} style={{background:'#1E1E1E',borderRadius:8,padding:'10px 12px',border:'0.5px solid '+(i===0?'#1543F840':'#2A2A2A')}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                  <span style={{fontSize:10,color:'#888',textTransform:'uppercase',letterSpacing:'.06em'}}>{['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][m-1]} {a}{i===0?' (actual)':''}</span>
                  <span style={{fontSize:9,color:'#555'}}>{cantTotal} presus</span>
                </div>
                <div style={{fontFamily:'monospace',fontSize:15,fontWeight:600,color:'#1543F8'}}>{fmtM(facEsperada)}</div>
                <div style={{fontSize:10,color:'#555'}}>facturación aprobada</div>
                <div style={{borderTop:'0.5px solid #2A2A2A',marginTop:6,paddingTop:6,display:'flex',justifyContent:'space-between',fontSize:11}}>
                  <span style={{color:'#888'}}>Ganancia neta</span>
                  <span style={{fontFamily:'monospace',color:'#1D9E75',fontWeight:500}} title={`Fee ${fmtM(gananciaFee)} + Somos Magma ${fmtM(gananciaSM)} + Dif ${fmtM(gananciaDif)}`}>{fmtM(ganancia)}</span>
                </div>
                {gananciaSM>0&&<div style={{display:'flex',justifyContent:'space-between',fontSize:10,marginTop:2}}>
                  <span style={{color:'#9635AB'}}>↳ Somos Magma</span>
                  <span style={{fontFamily:'monospace',color:'#9635AB'}}>{fmtM(gananciaSM)}</span>
                </div>}
                {impuestos>0&&<div style={{display:'flex',justifyContent:'space-between',fontSize:10,marginTop:2}}>
                  <span style={{color:'#888'}}>Impuestos (al fisco)</span>
                  <span style={{fontFamily:'monospace',color:'#E24B4A'}}>{fmtM(impuestos)}</span>
                </div>}
                <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginTop:4}}>
                  <span style={{color:'#888'}}>En espera</span>
                  <span style={{fontFamily:'monospace',color:'#BA7517'}}>{fmtM(enEspera)}</span>
                </div>
                <div style={{fontSize:10,color:'#555',marginTop:6,display:'flex',gap:6,flexWrap:'wrap'}}>
                  <span style={{color:'#1D9E75'}}>✓{cant}</span>
                  <span style={{color:'#BA7517'}}>⏳{cantEspera}</span>
                  {cantDesa>0&&<span style={{color:'#E24B4A'}}>✗{cantDesa}</span>}
                  <span style={{marginLeft:'auto'}}>{yaFacturado} fact</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8,marginTop:12,paddingTop:12,borderTop:'0.5px solid #2A2A2A'}}>
        <div><div style={{fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:3}}>Tasa conversión {nombreMes}</div><div style={{fontFamily:'monospace',fontSize:18,fontWeight:600,color:'#1543F8'}}>{tasaConversion}%</div><div style={{fontSize:10,color:'#555'}}>{presusMesAprobados} aprobados de {denom}</div></div>
        <div><div style={{fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:3}}>Ticket promedio</div><div style={{fontFamily:'monospace',fontSize:18,fontWeight:600,color:'#1D9E75'}}>{fmtM(ticketPromedio)}</div><div style={{fontSize:10,color:'#555'}}>{facMesCobradas.length} cobros del mes</div></div>
        <div><div style={{fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:3}}>Gastos fijos mes</div><div style={{fontFamily:'monospace',fontSize:18,fontWeight:600,color:'#E24B4A'}}>{fmtM(gastosFijosMes)}</div><div style={{fontSize:10,color:'#555',fontStyle:'italic'}}>aprox · cargar en Egresos</div></div>
        <div><div style={{fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:3}}>Subsistencia mes</div><div style={{fontFamily:'monospace',fontSize:18,fontWeight:600,color:subsistencia.color}}>{dif>=0?'+':''}{fmtM(dif)}</div><div style={{fontSize:10,color:'#555'}}>ganancia esperada − gastos fijos</div></div>
      </div>
    </div>

    {/* 4b. COBROS ATRASADOS — vista por antigüedad */}
    {(atrasadas90.length+atrasadas60.length+atrasadas30.length)>0 && <div style={{...S.card,marginBottom:12,padding:'14px 18px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
        <div style={{fontSize:11,color:'#E24B4A',textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600}}>🚨 Cobros atrasados</div>
        <div style={{fontSize:11,color:'#888'}}>Total atrasado: <span style={{fontFamily:'monospace',color:'#E24B4A',fontWeight:600}}>{fmtM(totalAtrasadas)}</span></div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
        {[
          {label:'+ 90 días',color:'#E24B4A',list:atrasadas90},
          {label:'60-90 días',color:'#E27B17',list:atrasadas60},
          {label:'30-60 días',color:'#BA7517',list:atrasadas30},
        ].map((b,i)=>(<div key={i} style={{background:'#1E1E1E',borderRadius:8,padding:'10px 12px',border:'0.5px solid #2A2A2A'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:6}}>
            <span style={{fontSize:10,color:b.color,textTransform:'uppercase',letterSpacing:'.06em',fontWeight:600}}>{b.label}</span>
            <span style={{fontSize:10,color:'#555'}}>{b.list.length} fact.</span>
          </div>
          <div style={{fontFamily:'monospace',fontSize:18,fontWeight:600,color:b.color,marginBottom:6}}>{fmtM(b.list.reduce((s,f)=>s+f.monto,0))}</div>
          <div style={{maxHeight:140,overflowY:'auto',fontSize:11,display:'flex',flexDirection:'column',gap:3}}>
            {b.list.length===0?<span style={{color:'#555',fontStyle:'italic'}}>—</span>:b.list.slice(0,8).map((f,j)=>(<div key={j} style={{display:'flex',justifyContent:'space-between',gap:6}}>
              <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'#ccc'}}>
                {f['Cliente']||f['Agencia']||'—'}
                {f.pagaAtrasado&&<span style={{color:'#888',fontSize:9,marginLeft:4}}>· paga atras.</span>}
              </span>
              <span style={{fontFamily:'monospace',color:'#888'}}>{fmtM(f.monto)}</span>
            </div>))}
            {b.list.length>8&&<span style={{color:'#555',fontSize:10,fontStyle:'italic'}}>+{b.list.length-8} más</span>}
          </div>
        </div>))}
      </div>
    </div>}

    {/* 4c. CALENDAR — eventos sin proyecto en sistema */}
    {calHuerfanos&&(()=>{const visibles=(calHuerfanos.huerfanos||[]).filter(e=>!ignorados.has(e.id)&&!esRuido(e));if(visibles.length===0)return null;return <div style={{...S.card,marginBottom:12,padding:'14px 18px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
        <div style={{fontSize:11,color:'#9635AB',textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600}}>📅 Eventos en Calendar sin presupuesto / proyecto</div>
        <div style={{fontSize:11,color:'#888'}}>
          {calLoading?'Cargando...':<>
            <span style={{color:'#9635AB'}}>{visibles.length} sin sistema</span>
            <span style={{color:'#555'}}> · {calHuerfanos.conProyecto||0} con proyecto · {calHuerfanos.conPresuAprobado||0} con presu aprobado</span>
          </>}
        </div>
      </div>
      <div style={{fontSize:10,color:'#555',marginBottom:8}}>El equipo carga eventos al Calendar — éstos no están todavía en Presupuestos ni Proyectos. Si es un trabajo real, hay que presupuestarlo. Si es ruido (cumples, vencimientos, etc.), tocá "ignorar".</div>
      <div style={{maxHeight:280,overflowY:'auto',display:'flex',flexDirection:'column',gap:4}}>
        {visibles.slice(0,20).map((e,i)=>{
          const f=String(e.inicio||'').slice(0,10)
          return <div key={e.id||i} style={{display:'grid',gridTemplateColumns:'90px 1fr auto',gap:10,alignItems:'center',padding:'6px 10px',background:'#1E1E1E',borderRadius:6,borderLeft:'2px solid #9635AB'}}>
            <span style={{fontSize:10,fontFamily:'monospace',color:'#888'}}>{f}</span>
            <div>
              <div style={{fontSize:12,color:'#F0F0F0'}}>{e.titulo}</div>
              {e.lugar&&<div style={{fontSize:10,color:'#555',marginTop:1}}>📍 {e.lugar}</div>}
            </div>
            <button onClick={()=>ignorarEvento(e.id)} title='Marcar como no relevante (queda guardado localmente)' style={{padding:'3px 8px',borderRadius:3,border:'0.5px solid #333',background:'transparent',color:'#555',fontSize:10,cursor:'pointer'}}>ignorar</button>
          </div>
        })}
        {visibles.length>20&&<div style={{fontSize:10,color:'#555',padding:6,textAlign:'center'}}>+ {visibles.length-20} más</div>}
      </div>
      {ignorados.size>0&&<div style={{fontSize:10,color:'#555',marginTop:6,paddingTop:6,borderTop:'0.5px solid #2A2A2A',textAlign:'right'}}>
        {ignorados.size} eventos ignorados · <button onClick={()=>{setIgnorados(new Set());localStorage.removeItem('cal_ignorar')}} style={{background:'transparent',border:'none',color:'#1543F8',fontSize:10,cursor:'pointer',padding:0}}>restaurar todos</button>
      </div>}
    </div>})()}

    {/* 5. KPIs PAGOS + ALERTAS */}
    <div style={S.k4}>
      <K lbl={`A pagar staff el 15/${String(proxPagoFecha.getMonth()+1).padStart(2,'0')}`} val={fmtM(totalAPagar)} sub={staffAPagar.length+' freelancers'} c='#E24B4A'/>
      <K lbl='Aprobados (total)' val={pr.filter(isAprobado).length} sub={fmtM(pr.filter(isAprobado).reduce((s,p)=>s+parseMonto(p['Precio Final']),0))} c='#1543F8'/>
      <K lbl='Por cobrar (con IVA)' val={fmtM(totalPorCobrar)} sub={porCobrar.length+' facturas'} c='#BA7517'/>
      <K lbl='Alertas' val={alertas.length} sub={alertas.length===0?'Todo al día':'Revisar abajo'} c={alertas.length>0?'#E24B4A':'#1D9E75'}/>
    </div>

    {/* 6. ALERTAS + 7. TOP CLIENTES */}
    <div style={{display:'grid',gridTemplateColumns:'1.2fr 1fr',gap:12}}>
      <div style={S.card}>
        <div style={S.ch}>Alertas ({alertas.length})</div>
        {alertas.length===0?<div style={{padding:'14px 16px',color:'#1D9E75',fontSize:12}}>✓ Todo al día</div>:alertas.slice(0,8).map((a,i)=><div key={i} style={{...S.lr,borderLeft:'3px solid '+a.color}}>
          <span style={{flex:1,fontSize:12,color:'#ccc'}}>{a.texto}</span>
        </div>)}
      </div>
      <div style={S.card}>
        <div style={S.ch}>Top clientes {anioActual}</div>
        {topClientes.length===0?<div style={{padding:'14px 16px',color:'#555',fontSize:12}}>Sin datos aún</div>:topClientes.map((c,i)=><div key={i} style={S.lr}>
          <span style={{width:20,color:'#555',fontSize:11}}>{i+1}.</span>
          <span style={{flex:1,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.nombre}</span>
          <span style={{fontSize:10,color:'#555',marginRight:8}}>{c.cant} fac.</span>
          <span style={{fontFamily:'monospace',fontSize:12}}>{fmtM(c.total)}</span>
        </div>)}
      </div>
    </div>
  </div>
}

// ---- PRESUPUESTOS ----
const ESTADOS_CONFIG = [
  {val:'APROBADO',   bg:'#1D9E7520', c:'#1D9E75'},
  {val:'EN ESPERA',  bg:'#BA751720', c:'#BA7517'},
  {val:'DESAPROBADO',bg:'#E24B4A20', c:'#E24B4A'},
  {val:'EN CURSO',   bg:'#1543F820', c:'#1543F8'},
  {val:'ENTREGADO',  bg:'#9635AB20', c:'#9635AB'},
  {val:'REPRESUPUESTADO', bg:'#55555520', c:'#555'},
]
const estadoColor = e => ESTADOS_CONFIG.find(x=>x.val===String(e||'').toUpperCase()) || {bg:'#BA751720',c:'#BA7517'}

function Toast({msg,onDone}){
  useEffect(()=>{const t=setTimeout(onDone,2200);return()=>clearTimeout(t)},[])
  return <div style={{position:'fixed',bottom:28,right:28,background:'#1D9E75',color:'#fff',padding:'10px 20px',borderRadius:8,fontSize:13,fontWeight:500,zIndex:9999,boxShadow:'0 4px 20px #0008'}}>
    {msg}
  </div>
}

function SetupBtn({mail,onDataChange}){
  const [status,setStatus]=useState('')
  const [expanded,setExpanded]=useState(false)
  const [working,setWorking]=useState(false)

  const runSetup=async()=>{
    setWorking(true);setStatus('Setup...')
    try{
      const r=await fetch('/api/admin/setup-sheets',{method:'POST'})
      const j=await r.json()
      setStatus(j.ok?`✓ Creadas: ${j.created.join(', ')||'ninguna'}. Ya existían: ${j.skipped.join(', ')||'ninguna'}`:'✗ '+(j.error||'Error'))
    }catch(e){setStatus('✗ '+e.message)}
    setWorking(false)
  }

  const runBackfill=async(año,dryRun,replace)=>{
    setWorking(true);setStatus(`Backfill ${año} ${dryRun?'(dry run)':'(escribiendo)'}...`)
    try{
      const r=await fetch('/api/admin/backfill-historico',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({año,dryRun,replaceExisting:replace})})
      const j=await r.json()
      if(j.ok){
        if(dryRun){
          const ej=j.ejemplos&&j.ejemplos[0]
          const ejStr=ej?`\nEj: ${ej.cliente||'-'} / ${ej.proyecto||'-'} / mes=${ej.mes||'?'} / $${ej.total||0}`:''
          setStatus(`✓ ${año} dry: ${j.totalMapeadas}/${j.totalRowsEnFuente} filas (${j.conCliente} con cliente, ${j.conMes} con mes, ${j.conTotal} con total). Header row #${j.headerRowDetected} (score ${j.headerScore}). Headers: ${(j.headers||[]).slice(0,5).filter(Boolean).join(', ')}${ejStr}`)
        } else {
          setStatus(`✓ ${año} insertadas ${j.inserted} filas en ${j.target}. Refrescando...`)
          if(onDataChange) await onDataChange()
          setStatus(`✓ ${año}: ${j.inserted} filas cargadas. Andá a Histórico → ${año}.`)
        }
      } else setStatus('✗ '+(j.error||'Error'))
    }catch(e){setStatus('✗ '+e.message)}
    setWorking(false)
  }

  const btnS={fontSize:10,padding:'3px 8px',borderRadius:4,border:'0.5px solid',background:'transparent',cursor:'pointer',whiteSpace:'nowrap'}
  return <div style={{marginTop:8}}>
    <button style={{...btnS,borderColor:'#1543F8',color:'#1543F8'}} onClick={()=>setExpanded(!expanded)}>{expanded?'▲':'▼'} Admin tools</button>
    {expanded&&<div style={{marginTop:6,padding:8,background:'#0A0A0A',border:'0.5px solid #1E1E1E',borderRadius:6,display:'flex',flexDirection:'column',gap:4}}>
      <button disabled={working} style={{...btnS,borderColor:'#1543F8',color:'#1543F8'}} onClick={runSetup}>Setup hojas nuevas</button>
      <div style={{fontSize:9,color:'#444',marginTop:4,textTransform:'uppercase',letterSpacing:'.06em'}}>Backfill histórico</div>
      {['2023','2024','2025'].map(año=>(
        <div key={año} style={{display:'flex',gap:3}}>
          <button disabled={working} style={{...btnS,flex:1,borderColor:'#555',color:'#888'}} onClick={()=>runBackfill(año,true,false)}>{año} dry</button>
          <button disabled={working} style={{...btnS,flex:1,borderColor:'#1D9E75',color:'#1D9E75'}} onClick={()=>{if(confirm(`Escribir ${año} en HISTORICO_${año}? (append)`))runBackfill(año,false,false)}}>{año} escribir</button>
          <button disabled={working} style={{...btnS,flex:1,borderColor:'#E24B4A',color:'#E24B4A'}} onClick={()=>{if(confirm(`REEMPLAZAR HISTORICO_${año} completo?`))runBackfill(año,false,true)}}>{año} reset</button>
        </div>
      ))}
      <div style={{fontSize:9,color:'#555',marginTop:4,lineHeight:1.4}}>Primero "dry" para ver cuántas filas. Después "escribir" (append) o "reset" (borrar + escribir).</div>
    </div>}
    {status&&<div style={{fontSize:9,color:'#777',marginTop:4,whiteSpace:'pre-wrap'}}>{status}</div>}
  </div>
}

function RepresupuestarModal({p, mail, onClose, onDone}){
  // Los headers del Sheet son inconsistentes: 'Pedido 1 ' (con trailing space), 'Pedido3 ' (sin espacio antes del número), etc.
  // Escaneamos TODAS las keys del objeto que matchean /^\s*pedido\s*\d+\s*$/i
  const findKeyForIndex = (prefix, idx) => {
    const keys = Object.keys(p)
    const regex = new RegExp('^\\s*'+prefix+'\\s*'+idx+'\\s*$','i')
    return keys.find(k => regex.test(k)) || null
  }
  const pedidosIniciales = []
  for (let i=1;i<=12;i++){
    const pedKey = findKeyForIndex('pedido', i)
    const prcKey = findKeyForIndex('precio', i)
    const svc = pedKey ? (p[pedKey]||'') : ''
    const precio = prcKey ? parseMonto(p[prcKey]) : 0
    if (svc || precio) pedidosIniciales.push({index:i, svc, precio})
  }
  const subtotalOriginal = pedidosIniciales.reduce((s,x)=>s+(x.precio||0),0)
  const precioFinalOriginal = parseMonto(p['Precio Final'])
  const deltaOriginal = precioFinalOriginal - subtotalOriginal // fee + impuestos + ajuste del original

  const [pedidos,setPedidos]=useState(pedidosIniciales.length?pedidosIniciales:[{index:1,svc:'',precio:0}])
  const [motivo,setMotivo]=useState('')
  const [fechaEvento,setFechaEvento]=useState(p['Fecha Evento']||'')
  const [precioFinalManual,setPrecioFinalManual]=useState('')
  const [saving,setSaving]=useState(false),[err,setErr]=useState('')
  const [creadoVersion,setCreadoVersion]=useState('')

  // Al elegir servicio, auto-llena precio de lista (solo si el usuario no lo tocó)
  const updPed=(i,field,val)=>setPedidos(prev=>prev.map((x,idx)=>{
    if(idx!==i) return x
    if(field==='svc'){
      const svc=SVCS_LIST.find(s=>s.n===val)
      const nuevoPrecio=svc&&svc.p>0?svc.p:x.precio
      return {...x,svc:val,precio:nuevoPrecio}
    }
    if(field==='precio') return {...x,precio:parseFloat(val)||0}
    return {...x,[field]:val}
  }))
  const addPed=()=>{const used=new Set(pedidos.map(x=>x.index));let next=1;while(used.has(next)&&next<=12)next++;if(next>12)return;setPedidos([...pedidos,{index:next,svc:'',precio:0}])}
  const delPed=i=>setPedidos(prev=>prev.filter((_,idx)=>idx!==i))

  const subtotalNuevo = pedidos.reduce((s,x)=>s+(x.precio||0),0)
  // Mantener la misma proporción entre subtotal y total del original
  // ratio incluye fee+imp+ajuste escalado con el subtotal
  const ratio = subtotalOriginal>0?(precioFinalOriginal/subtotalOriginal):1
  const precioFinalCalc = precioFinalManual!==''?(parseFloat(precioFinalManual)||0):Math.round(subtotalNuevo*ratio)
  const deltaNuevo = precioFinalCalc-subtotalNuevo

  const guardar=async()=>{
    if(!motivo.trim()){setErr('El motivo es obligatorio');return}
    setSaving(true);setErr('')
    try{
      const body={num:p['Columna 1'],motivo,fechaEvento,pedidos:pedidos.filter(x=>x.svc||x.precio)}
      if(precioFinalManual!=='') body.precioFinal=parseFloat(precioFinalManual)||0
      const r=await fetch('/api/presupuesto-represupuestar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      const j=await r.json()
      if(j.ok){setCreadoVersion(j.nuevaVersion);onDone(j.nuevaVersion)}
      else setErr(j.error||'Error')
    }catch(e){setErr(e.message)}
    setSaving(false)
  }

  const inp={padding:'7px 10px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontSize:12,outline:'none',width:'100%'}

  return <div style={{position:'fixed',inset:0,background:'#000c',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={onClose}>
    <div style={{background:'#0D0D0D',border:'0.5px solid #2A2A2A',borderRadius:12,padding:20,width:680,maxHeight:'90vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
      <div style={{fontSize:16,fontWeight:600,marginBottom:4}}>Represupuestar #{p['Columna 1']}</div>
      <div style={{fontSize:11,color:'#555',marginBottom:16}}>Se crea una copia con nueva versión (ej: v2, v3…) en EN ESPERA. El original queda marcado como REPRESUPUESTADO.</div>

      <div style={{background:'#161616',border:'0.5px solid #2A2A2A',borderRadius:8,padding:10,marginBottom:12,fontSize:12,color:'#888'}}>
        <div style={{marginBottom:3}}><span style={{color:'#555'}}>Cliente:</span> {p['Cliente']||'—'} · <span style={{color:'#555'}}>Agencia:</span> {p['Agencia']||'—'}</div>
        <div><span style={{color:'#555'}}>Proyecto:</span> {p['Proyecto']||'—'}</div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
        <div>
          <div style={{fontSize:11,color:'#555',marginBottom:4}}>Motivo *</div>
          <input style={inp} value={motivo} onChange={e=>setMotivo(e.target.value)} placeholder='Ej: Cambió scope, ajuste precios...' autoFocus/>
        </div>
        <div>
          <div style={{fontSize:11,color:'#555',marginBottom:4}}>Fecha del evento</div>
          <input style={inp} value={fechaEvento} onChange={e=>setFechaEvento(e.target.value)} placeholder='DD/MM/YYYY'/>
        </div>
      </div>

      <div style={{marginBottom:10}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
          <div style={{fontSize:11,color:'#555'}}>Pedidos (editá precios o servicios)</div>
          <button onClick={addPed} style={{fontSize:10,padding:'3px 8px',borderRadius:4,border:'0.5px solid #1543F8',background:'transparent',color:'#1543F8',cursor:'pointer'}}>+ Pedido</button>
        </div>
        {pedidos.map((ped,i)=>(
          <div key={i} style={{display:'grid',gridTemplateColumns:'30px 1fr 120px 24px',gap:6,marginBottom:4,alignItems:'center'}}>
            <span style={{fontSize:10,color:'#555',textAlign:'center'}}>#{ped.index}</span>
            <select value={ped.svc} onChange={e=>updPed(i,'svc',e.target.value)} style={{...inp,color:ped.svc?'#F0F0F0':'#555'}}>
              <option value=''>— Servicio —</option>
              {SVCS_LIST.map(s=><option key={s.n} value={s.n}>{s.n}</option>)}
            </select>
            <input type='number' value={ped.precio||''} onChange={e=>updPed(i,'precio',e.target.value)} placeholder='$' style={{...inp,fontFamily:'monospace'}}/>
            <button onClick={()=>delPed(i)} style={{width:24,height:28,border:'none',background:'transparent',color:'#E24B4A',cursor:'pointer',fontSize:16}}>×</button>
          </div>
        ))}
      </div>

      {/* Desglose financiero */}
      <div style={{background:'#1A1A1A',borderRadius:8,padding:'12px 14px',marginBottom:12}}>
        <div style={{fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Desglose financiero</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <div>
            <div style={{fontSize:10,color:'#444',marginBottom:6}}>ORIGINAL</div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:11,padding:'3px 0'}}><span style={{color:'#888'}}>Subtotal servicios</span><span style={{fontFamily:'monospace'}}>{fmt(subtotalOriginal)}</span></div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:11,padding:'3px 0'}}><span style={{color:'#888'}}>Fee + impuestos + ajuste</span><span style={{fontFamily:'monospace',color:deltaOriginal>=0?'#1D9E75':'#E24B4A'}}>{deltaOriginal>=0?'+':''}{fmt(deltaOriginal)}</span></div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'6px 0 3px',borderTop:'0.5px solid #2A2A2A',fontWeight:500}}><span>Precio Final original</span><span style={{fontFamily:'monospace',color:'#1543F8'}}>{fmt(precioFinalOriginal)}</span></div>
          </div>
          <div>
            <div style={{fontSize:10,color:'#444',marginBottom:6}}>NUEVO ({precioFinalManual!==''?'manual':'auto — ratio ×'+ratio.toFixed(3)})</div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:11,padding:'3px 0'}}><span style={{color:'#888'}}>Subtotal servicios nuevo</span><span style={{fontFamily:'monospace'}}>{fmt(subtotalNuevo)}</span></div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:11,padding:'3px 0'}}><span style={{color:'#888'}}>+ fee+impuestos+ajuste (escalados)</span><span style={{fontFamily:'monospace',color:deltaNuevo>=0?'#1D9E75':'#E24B4A'}}>{deltaNuevo>=0?'+':''}{fmt(deltaNuevo)}</span></div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:12,padding:'6px 0 3px',borderTop:'0.5px solid #2A2A2A',fontWeight:500}}>
              <span>Precio Final nuevo</span>
              <input type='number' value={precioFinalManual} onChange={e=>setPrecioFinalManual(e.target.value)} placeholder={String(Math.round(precioFinalCalc))} style={{width:130,padding:'4px 8px',borderRadius:4,border:'0.5px solid #1543F8',background:'#000',color:'#1543F8',fontFamily:'monospace',fontSize:13,outline:'none',textAlign:'right'}}/>
            </div>
            <div style={{display:'flex',gap:3,marginTop:4,flexWrap:'wrap'}}>
              {[[-15,'-15%'],[-10,'-10%'],[-5,'-5%'],[5,'+5%'],[10,'+10%'],[15,'+15%'],[20,'+20%']].map(([pct,lbl])=><button key={pct} onClick={()=>{const base=precioFinalManual!==''?parseFloat(precioFinalManual)||0:precioFinalCalc;setPrecioFinalManual(String(Math.round(base*(1+pct/100))))}} style={{flex:'1 1 auto',fontSize:9,padding:'2px 4px',borderRadius:3,border:'0.5px solid #333',background:'transparent',color:pct<0?'#E24B4A':'#1D9E75',cursor:'pointer'}}>{lbl}</button>)}
            </div>
            {precioFinalManual!==''&&<button onClick={()=>setPrecioFinalManual('')} style={{fontSize:9,color:'#555',background:'transparent',border:'none',cursor:'pointer',padding:0,marginTop:6}}>↺ volver a auto</button>}
          </div>
        </div>
        <div style={{fontSize:10,color:'#555',marginTop:8,lineHeight:1.5}}>El fee + impuestos escala proporcionalmente con el subtotal (manteniendo el mismo % del original). Los botones +%/-% aplican descuento o margen sobre el precio actual. Si querés un valor exacto, escribilo a mano.</div>
      </div>

      {err&&<div style={{color:'#E24B4A',fontSize:12,marginBottom:10}}>{err}</div>}

      {creadoVersion?<div style={{background:'#0F1A0F',border:'0.5px solid #1D9E75',borderRadius:8,padding:'12px 14px',marginBottom:10}}>
        <div style={{fontSize:13,fontWeight:500,color:'#1D9E75',marginBottom:4}}>✓ Represupuesto creado: #{creadoVersion}</div>
        <div style={{fontSize:11,color:'#888',marginBottom:10}}>Ya está en PRESUPUESTOS en estado EN ESPERA. Generá el PDF para mandar al cliente.</div>
        <div style={{display:'flex',gap:8}}>
          <a href={`/presupuesto?nro=${encodeURIComponent(creadoVersion)}`} target='_blank' rel='noreferrer' style={{flex:1,padding:'8px 14px',borderRadius:6,border:'none',background:'#1D9E75',color:'#fff',fontSize:12,fontWeight:500,cursor:'pointer',textAlign:'center',textDecoration:'none'}}>📄 Generar PDF</a>
          <button onClick={onClose} style={{padding:'8px 14px',borderRadius:6,border:'0.5px solid #333',background:'transparent',color:'#888',fontSize:12,cursor:'pointer'}}>Cerrar</button>
        </div>
      </div>:<div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
        <button style={{padding:'7px 14px',borderRadius:6,border:'0.5px solid #333',background:'transparent',color:'#888',fontSize:12,cursor:'pointer'}} onClick={onClose}>Cancelar</button>
        <button disabled={saving||!motivo.trim()} style={{padding:'7px 16px',borderRadius:6,border:'none',background:'#1543F8',color:'#fff',fontSize:12,fontWeight:500,cursor:'pointer',opacity:saving||!motivo.trim()?0.5:1}} onClick={guardar}>{saving?'Creando...':'Crear represupuesto'}</button>
      </div>}
    </div>
  </div>
}

function BadgeEstado({p, mail, data, onUpdate, onRefresh, onRepresupuestar}){
  const [open,setOpen]=useState(false), [saving,setSaving]=useState(false)
  const ec=estadoColor(p['Estado'])

  const handleSelect=async(estado)=>{
    if(estado==='REPRESUPUESTADO'){onRepresupuestar&&onRepresupuestar(p);setOpen(false);return}
    await doSave(estado)
  }

  const doSave=async(estado)=>{
    setSaving(true);setOpen(false)
    try{
      await fetch('/api/presupuesto-estado',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:p['Columna 1'],estado})})
      onUpdate(p['Columna 1'],estado);if(onRefresh)setTimeout(onRefresh,500)
    }catch(e){}
    setSaving(false)
  }

  return <div style={{position:'relative'}}>
    <span style={{...S.badge,background:ec.bg,color:ec.c,cursor:'pointer',userSelect:'none',opacity:saving?0.5:1}} onClick={e=>{e.stopPropagation();setOpen(o=>!o)}}>
      {saving?'...':(p['Estado']||'—')}
    </span>
    {open&&<div style={{position:'absolute',right:0,top:'110%',background:'#1E1E1E',border:'0.5px solid #333',borderRadius:8,zIndex:100,minWidth:160,boxShadow:'0 8px 24px #000a',overflow:'hidden'}} onClick={e=>e.stopPropagation()}>
      {ESTADOS_CONFIG.map(({val,bg,c})=>(
        <div key={val} style={{padding:'8px 14px',cursor:'pointer',fontSize:12,display:'flex',alignItems:'center',gap:8}} onMouseEnter={e=>e.currentTarget.style.background='#2A2A2A'} onMouseLeave={e=>e.currentTarget.style.background='transparent'} onClick={()=>handleSelect(val)}>
          <span style={{...S.badge,background:bg,color:c,fontSize:10}}>{val}</span>
        </div>
      ))}
    </div>}
  </div>
}

function DetallePresupuesto({p}){
  const servicios=[]
  for(let j=1;j<=12;j++){
    const pedKey=j===1?'Pedido 1':(j<=9?('Pedido '+j):('Pedido'+j+' '))
    const prcKey=j===1?'Precio 1':('Precio '+j)
    const ped=p[pedKey]||p[('Pedido '+j)]||''
    const prc=parseMonto(p[prcKey]||p[('Precio '+j)])
    if(ped&&prc>0) servicios.push({nombre:ped,precio:prc})
  }
  const subtotal=servicios.reduce((s,x)=>s+x.precio,0)
  const total=parseMonto(p['Precio Final'])
  const ajuste=parseMonto(p['Ajuste'])||parseMonto(p['Total'])||0
  const fee=total-subtotal

  return <div style={{borderTop:'0.5px solid #2A2A2A',padding:'16px 16px',background:'#111'}}>
    <div style={{display:'flex',gap:24,marginBottom:14,flexWrap:'wrap'}}>
      {[['Fecha evento',p['Fecha Presupuesto']||'—'],['Contacto',p['Contacto']||'—'],['Agencia',p['Agencia']||'—']].map(([k,v])=>(
        <div key={k}><div style={{fontSize:10,color:'#555',marginBottom:2}}>{k}</div><div style={{fontSize:12,fontWeight:500}}>{v}</div></div>
      ))}
    </div>
    {servicios.length>0?<>
      <div style={{display:'grid',gridTemplateColumns:'1fr 110px',background:'#1A1A1A',borderRadius:'6px 6px 0 0',overflow:'hidden'}}>
        {['SERVICIO','PRECIO'].map(h=><div key={h} style={{fontSize:10,color:'#555',padding:'6px 12px',textTransform:'uppercase',letterSpacing:'0.06em'}}>{h}</div>)}
      </div>
      {servicios.map((s,i)=>(
        <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 110px',borderBottom:'0.5px solid #2A2A2A',fontSize:12}}>
          <div style={{padding:'7px 12px'}}>{s.nombre}</div>
          <div style={{padding:'7px 12px',fontFamily:'monospace'}}>{fmt(s.precio)}</div>
        </div>
      ))}
      <div style={{background:'#1A1A1A',borderRadius:'0 0 6px 6px',padding:'10px 12px',marginBottom:8}}>
        {[['Subtotal servicios',fmt(subtotal),null],['Fee / Diferencia',(fee>=0?'+':'')+fmt(fee),fee>=0?'#1D9E75':'#E24B4A'],['Precio Final',fmt(total),'#1543F8'],ajuste?['Ajuste',(ajuste>=0?'+':'')+fmt(ajuste),'#BA7517']:null].filter(Boolean).map(([k,v,c])=>(
          <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',fontSize:12}}>
            <span style={{color:'#555'}}>{k}</span><span style={{fontFamily:'monospace',color:c||'inherit',fontWeight:k==='Precio Final'?600:400}}>{v}</span>
          </div>
        ))}
      </div>
    </>:<div style={{fontSize:12,color:'#555',fontStyle:'italic',marginBottom:10}}>Sin servicios cargados</div>}
  </div>
}

function Presupuestos({data:initialData,mail,onRefresh,openTarget,clearTarget}){
  const [localData,setLocalData]=useState(initialData)
  const [q,setQ]=useState(''), [f,setF]=useState('todos'), [pm,setPm]=useState('todos'), [anio,setAnio]=useState(String(new Date().getFullYear())), [mes,setMes]=useState('todos'), [open,setOpen]=useState(null), [toast,setToast]=useState('')
  // Aplica el filtro automáticamente cuando llegamos desde el buscador global
  useEffect(()=>{
    if (openTarget?.q) {
      setQ(openTarget.q); setF('todos'); setPm('todos'); setMes('todos'); setAnio('todos')
      if (openTarget.num) setOpen(openTarget.num) // expandir la fila
      clearTarget?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[openTarget?.q])
  const [repP,setRepP]=useState(null) // presupuesto a represupuestar (abre NuevoPresupuesto con initialData)
  const [completarP,setCompletarP]=useState(null) // presu a completar datos faltantes
  const faltas=p=>{const f=[];if(!p['PM Interno'])f.push('PM');if(!p['Cliente'])f.push('Cliente');if(!p['Proyecto'])f.push('Proyecto');if(!p['Contacto'])f.push('Contacto');if(!p['Fecha Evento'])f.push('Fecha Evento');return f}

  useEffect(()=>{setLocalData(initialData)},[initialData])

  const presus=(localData.presupuestos||[]).filter(p=>p['Columna 1'])

  const pms=[...new Set(presus.map(p=>p['PM Interno']).filter(Boolean))].sort()
  const anios=[...new Set(presus.map(p=>{const d=p['Fecha Presupuesto']||'';const m=d.match(/(\d{4})/);return m?m[1]:null}).filter(Boolean))].sort().reverse()
  const MESES_P=[['01','Enero'],['02','Febrero'],['03','Marzo'],['04','Abril'],['05','Mayo'],['06','Junio'],['07','Julio'],['08','Agosto'],['09','Septiembre'],['10','Octubre'],['11','Noviembre'],['12','Diciembre']]

  const filtered=presus.filter(p=>{
    const e=String(p['Estado']||'').toUpperCase()
    const mf=f==='todos'||(f==='ap'&&(e==='APROBADO'||e==='EN CURSO'||e==='ENTREGADO'))
      ||(f==='esp'&&e==='EN ESPERA')||(f==='des'&&e==='DESAPROBADO')
      ||(f==='rep'&&e==='REPRESUPUESTADO')||(f==='cur'&&e==='EN CURSO')
    const mpm=pm==='todos'||p['PM Interno']===pm
    const mq=!q||[p['Columna 1'],p['Proyecto'],p['Cliente'],p['Agencia'],p['PM Interno']].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase()))
    const fp=p['Fecha Presupuesto']||''
    const fe=p['Fecha Evento']||''
    const manio=anio==='todos'||fe.includes(anio)||fp.includes(anio)
    const mmes=mes==='todos'||parseInt((fe||fp).split('/')[1])===parseInt(mes)
    return mf&&mpm&&manio&&mmes&&mq
  }).reverse()

  const handleEstadoUpdate=(num,nuevoEstado)=>{
    setLocalData(prev=>({...prev,presupuestos:prev.presupuestos.map(p=>String(p['Columna 1'])===String(num)?{...p,Estado:nuevoEstado}:p)}))
    setToast('Estado actualizado ✓')
  }

  return <div>
    {toast&&<Toast msg={toast} onDone={()=>setToast('')}/>}
    <div style={{display:'flex',gap:10,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
      <input style={{...S.inp,flex:1,minWidth:180,marginBottom:0}} placeholder='Buscar N°, cliente, proyecto, PM...' value={q} onChange={e=>setQ(e.target.value)}/>
      <select style={{padding:'7px 10px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:pm==='todos'?'#555':'#F0F0F0',fontSize:12,outline:'none',cursor:'pointer'}} value={pm} onChange={e=>setPm(e.target.value)}>
        <option value='todos'>Todos los PM</option>
        {pms.map(p=><option key={p} value={p}>{p}</option>)}
      </select>
      <select style={{padding:'7px 10px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:anio==='todos'?'#555':'#F0F0F0',fontSize:12,outline:'none',cursor:'pointer'}} value={anio} onChange={e=>setAnio(e.target.value)}>
        <option value='todos'>Todos los anos</option>
        {anios.map(a=><option key={a} value={a}>{a}</option>)}
      </select>
      <select style={{padding:'7px 10px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:mes==='todos'?'#555':'#F0F0F0',fontSize:12,outline:'none',cursor:'pointer'}} value={mes} onChange={e=>setMes(e.target.value)}>
        <option value='todos'>Todos los meses</option>
        {MESES_P.map(([v,l])=><option key={v} value={v}>{l}</option>)}
      </select>
    </div>
    <div style={{display:'flex',gap:4,marginBottom:12,flexWrap:'wrap'}}>
      {[['todos','Todos'],['ap','Aprobados'],['cur','En curso'],['esp','En espera'],['des','Desaprobados'],['rep','Represupuestados']].map(([id,l])=>(
        <button key={id} style={{...S.fb,...(f===id?S.fa:{})}} onClick={()=>setF(id)}>{l}</button>
      ))}
    </div>
    <div style={{overflowY:'auto',maxHeight:'calc(100vh - 240px)'}}>
      <table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead><tr style={{background:'#1A1A1A'}}>
          {['N°','Carga','Evento','PM','Agencia','Cliente','Proyecto','Total','Estado'].map(h=>(
            <th key={h} style={{fontSize:10,color:'#555',padding:'8px 12px',textAlign:'left',fontWeight:400,textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:'0.5px solid #2A2A2A'}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {filtered.map((p,i)=>{
            const isOpen=open===p['Columna 1']
            const key=String(p['Columna 1'])
            return <>
              <tr key={key} style={{background:isOpen?'#1E1E1E':i%2===0?'#161616':'#1A1A1A',cursor:'pointer'}} onClick={()=>setOpen(isOpen?null:p['Columna 1'])}>
                <td style={{...S.td,color:'#1543F8',fontFamily:'monospace',fontSize:11}}>
                  <span>#{p['Columna 1']}</span>
                  {faltas(p).length>0&&<button title={'Faltan: '+faltas(p).join(', ')} onClick={e=>{e.stopPropagation();setCompletarP(p)}} style={{marginLeft:6,padding:'1px 5px',borderRadius:3,border:'0.5px solid #E24B4A',background:'#E24B4A15',color:'#E24B4A',fontSize:9,cursor:'pointer'}}>⚠ {faltas(p).length}</button>}
                </td>
                <td style={{...S.td,fontSize:11,color:'#666'}}>{p['Fecha Presupuesto']||'—'}</td>
                <td style={{...S.td,fontSize:11}}>
                  {p['Fecha Evento'] ? <>
                    <span style={{color:'#F0F0F0'}}>{p['Fecha Evento']}</span>
                    {(()=>{ const t=String(p['Tipo Fechas']||'').toLowerCase().trim(); const ad=String(p['Fechas Adicionales']||'').trim()
                      if (t==='rango' && ad) return <span style={{marginLeft:5,color:'#BA7517',fontSize:10}}>→ {ad}</span>
                      if (t==='multi' && ad) return <span style={{marginLeft:5,padding:'1px 5px',borderRadius:3,background:'#9635AB20',color:'#9635AB',fontSize:9,fontWeight:600}}>+{ad.split('|').filter(Boolean).length} fechas</span>
                      return null
                    })()}
                  </> : <span style={{color:'#E24B4A',fontSize:10}}>—</span>}
                </td>
                <td style={{...S.td,fontSize:12}}>{p['PM Interno']||'—'}</td>
                <td style={{...S.td,fontSize:12}}>{p['Agencia']||'—'}</td>
                <td style={{...S.td,fontSize:12,fontWeight:500}}>{p['Cliente']||'—'}</td>
                <td style={{...S.td,fontSize:12,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p['Proyecto']||'—'}</td>
                <td style={{...S.td,fontFamily:'monospace',fontSize:12}}>{fmt(parseMonto(p['Precio Final']))}</td>
                <td style={{...S.td}} onClick={e=>e.stopPropagation()}>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <BadgeEstado p={p} mail={mail} data={localData} onUpdate={handleEstadoUpdate} onRefresh={onRefresh} onRepresupuestar={setRepP}/>
                    <button title='Editar datos del presu (cliente, agencia, proyecto, observaciones)' onClick={e=>{e.stopPropagation();setCompletarP(p)}} style={{padding:'2px 8px',borderRadius:4,border:'0.5px solid #333',background:'transparent',color:'#888',fontSize:11,cursor:'pointer'}}>✎</button>
                    <button title='Generar PDF' onClick={e=>{e.stopPropagation();window.open('/presupuesto?nro='+encodeURIComponent(p['Columna 1']),'_blank')}} style={{padding:'2px 8px',borderRadius:4,border:'0.5px solid #333',background:'transparent',color:'#888',fontSize:11,cursor:'pointer'}}>PDF</button>
                  </div>
                </td>
              </tr>
              {isOpen&&<tr key={key+'d'}><td colSpan={9} style={{padding:0}}><DetallePresupuesto p={p}/></td></tr>}
            </>
          })}
        </tbody>
      </table>
      {filtered.length===0&&<div style={S.nd}>Sin resultados</div>}
    </div>
    {repP&&<NuevoPresupuesto
      mail={mail}
      data={localData}
      initialData={repP}
      onClose={()=>{setRepP(null);if(onRefresh)setTimeout(onRefresh,500)}}
      onGuardado={()=>{handleEstadoUpdate(repP['Columna 1'],'REPRESUPUESTADO')}}
    />}
    {completarP&&<CompletarPresupuestoModal
      p={completarP}
      data={localData}
      mail={mail}
      onClose={()=>setCompletarP(null)}
      onSaved={(num,cambios)=>{setLocalData(prev=>({...prev,presupuestos:prev.presupuestos.map(x=>String(x['Columna 1'])===String(num)?{...x,...cambios}:x)}));setToast('Datos actualizados ✓');setCompletarP(null);if(onRefresh)setTimeout(onRefresh,800)}}
    />}
  </div>
}

function CompletarPresupuestoModal({p,data,mail,onClose,onSaved}){
  const [pm,setPm]=useState(p['PM Interno']||'')
  const [agencia,setAgencia]=useState(p['Agencia']||'')
  const [cliente,setCliente]=useState(p['Cliente']||'')
  const [proyecto,setProyecto]=useState(p['Proyecto']||'')
  const [contacto,setContacto]=useState(p['Contacto']||'')
  const [fechaEv,setFechaEv]=useState(p['Fecha Evento']||'')
  const [observaciones,setObservaciones]=useState(p['Observaciones']||'')
  const [horario,setHorario]=useState(p['Horario']||'')
  const [ubicacion,setUbicacion]=useState(p['Ubicación']||'')
  const [contactoLugar,setContactoLugar]=useState(p['Contacto Lugar']||'')
  const [saving,setSaving]=useState(false),[err,setErr]=useState('')
  // Si NO hay campos faltantes, el modal funciona como "Editar"; si hay → como "Completar"
  const faltasCount=[p['PM Interno'],p['Agencia'],p['Cliente'],p['Proyecto'],p['Contacto'],p['Fecha Evento']].filter(v=>!v).length
  const titulo = faltasCount > 0 ? 'Completar datos' : 'Editar datos'
  const ags=[...new Set([...(data?.agencias||[]).map(x=>x['Nombre']),...((data?.presupuestos||[]).map(x=>x['Agencia']))].filter(Boolean))].sort()
  const clis=[...new Set([...(data?.clientes||[]).map(x=>x['Nombre']),...((data?.presupuestos||[]).map(x=>x['Cliente']))].filter(Boolean))].sort()
  const cts=[...new Set([...(data?.contactos||[]).map(x=>x['Nombre']),...((data?.presupuestos||[]).map(x=>x['Contacto']))].filter(Boolean))].sort()
  const guardar=async(luegoGenerarPDF=false)=>{
    setSaving(true);setErr('')
    const cambios={}
    if(pm!==(p['PM Interno']||''))cambios['PM Interno']=pm
    if(agencia!==(p['Agencia']||''))cambios['Agencia']=agencia
    if(cliente!==(p['Cliente']||''))cambios['Cliente']=cliente
    if(proyecto!==(p['Proyecto']||''))cambios['Proyecto']=proyecto
    if(contacto!==(p['Contacto']||''))cambios['Contacto']=contacto
    if(fechaEv!==(p['Fecha Evento']||''))cambios['Fecha Evento']=fechaEv
    if(observaciones!==(p['Observaciones']||''))cambios['Observaciones']=observaciones
    if(horario!==(p['Horario']||''))cambios['Horario']=horario
    if(ubicacion!==(p['Ubicación']||''))cambios['Ubicación']=ubicacion
    if(contactoLugar!==(p['Contacto Lugar']||''))cambios['Contacto Lugar']=contactoLugar
    if(Object.keys(cambios).length===0){
      // Si no hay cambios pero quería generar PDF → directamente abre el PDF
      if (luegoGenerarPDF) { window.open('/presupuesto?nro='+encodeURIComponent(p['Columna 1']),'_blank'); onClose(); return }
      setErr('No hay cambios');setSaving(false);return
    }
    try{
      const r=await fetch('/api/presupuesto-editar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:p['Columna 1'],cambios})})
      const j=await r.json()
      if(!j.ok){setErr(j.error||'Error');setSaving(false);return}
      onSaved(p['Columna 1'],cambios)
      if (luegoGenerarPDF) {
        // Pequeño delay para que el cache de /api/data se invalide y el PDF lea fresh
        setTimeout(()=>window.open('/presupuesto?nro='+encodeURIComponent(p['Columna 1'])+'&t='+Date.now(),'_blank'), 800)
      }
    }catch(e){setErr(e.message);setSaving(false)}
  }
  const inp={background:'#1E1E1E',border:'0.5px solid #333',borderRadius:6,color:'#F0F0F0',fontSize:12,padding:'7px 10px',outline:'none',width:'100%',fontFamily:'inherit'}
  const lbl={fontSize:11,color:'#555',display:'block',marginBottom:4}
  const campoFaltante=(actual)=>!actual ? {border:'0.5px solid #E24B4A',background:'#E24B4A08'} : {}
  return <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
    <div style={{width:560,maxHeight:'90vh',background:'#0D0D0D',borderRadius:10,border:'0.5px solid #2A2A2A',overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <div style={{padding:'16px 20px',borderBottom:'0.5px solid #2A2A2A',display:'flex',alignItems:'center',gap:10}}>
        <span style={{background:'#1543F820',color:'#1543F8',borderRadius:4,padding:'2px 8px',fontSize:11,fontFamily:'monospace'}}>#{p['Columna 1']}</span>
        <span style={{fontSize:13,fontWeight:500}}>{titulo}</span>
        <div style={{flex:1}}/>
        <button onClick={onClose} style={{fontSize:18,background:'transparent',border:'none',color:'#555',cursor:'pointer'}}>×</button>
      </div>
      <div style={{padding:20,overflowY:'auto'}}>
        <div style={{fontSize:11,color:'#888',marginBottom:12}}>{faltasCount>0?'Campos en rojo están faltando. Los podés completar y guardar.':'Editá cliente, agencia, proyecto o cualquier dato básico sin necesidad de represupuestar.'}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
          <label style={{display:'flex',flexDirection:'column',gap:4}}><span style={lbl}>PM interno</span>
            <select style={{...inp,...campoFaltante(p['PM Interno'])}} value={pm} onChange={e=>setPm(e.target.value)}>
              <option value="">— PM —</option><option>Juan</option><option>Sofi</option><option>Lulu</option><option>Tomi</option>
            </select>
          </label>
          <label style={{display:'flex',flexDirection:'column',gap:4}}><span style={lbl}>Fecha evento (DD/MM/YYYY)</span>
            <input style={{...inp,...campoFaltante(p['Fecha Evento'])}} value={fechaEv} onChange={e=>setFechaEv(e.target.value)} placeholder="ej: 15/3/2026"/>
          </label>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
          <label style={{display:'flex',flexDirection:'column',gap:4}}><span style={lbl}>Agencia</span>
            <input list="ed-ag" style={{...inp,...campoFaltante(p['Agencia'])}} value={agencia} onChange={e=>setAgencia(e.target.value)} placeholder="Sin agencia / Directo"/>
            <datalist id="ed-ag">{ags.map(a=><option key={a} value={a}/>)}</datalist>
          </label>
          <label style={{display:'flex',flexDirection:'column',gap:4}}><span style={lbl}>Cliente</span>
            <input list="ed-cl" style={{...inp,...campoFaltante(p['Cliente'])}} value={cliente} onChange={e=>setCliente(e.target.value)} placeholder="Nombre del cliente"/>
            <datalist id="ed-cl">{clis.map(a=><option key={a} value={a}/>)}</datalist>
          </label>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
          <label style={{display:'flex',flexDirection:'column',gap:4}}><span style={lbl}>Proyecto / descripción</span>
            <input style={{...inp,...campoFaltante(p['Proyecto'])}} value={proyecto} onChange={e=>setProyecto(e.target.value)} placeholder="Ej: Evento anual"/>
          </label>
          <label style={{display:'flex',flexDirection:'column',gap:4}}><span style={lbl}>Contacto</span>
            <input list="ed-ct" style={{...inp,...campoFaltante(p['Contacto'])}} value={contacto} onChange={e=>setContacto(e.target.value)} placeholder="Nombre del contacto"/>
            <datalist id="ed-ct">{cts.map(c=><option key={c} value={c}/>)}</datalist>
          </label>
        </div>
        {/* Datos operativos del día — van al Calendar al aprobar */}
        <div style={{padding:'10px 12px',background:'#1543F808',border:'0.5px solid #1543F820',borderRadius:6,marginBottom:10}}>
          <div style={{fontSize:10,color:'#1543F8',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8,fontWeight:600}}>📅 Datos del día (van al Calendar del staff)</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
            <label style={{display:'flex',flexDirection:'column',gap:4}}>
              <span style={lbl}>Horario</span>
              <input style={inp} value={horario} onChange={e=>setHorario(e.target.value)} placeholder="ej: 8:00 a 18:00 hs"/>
            </label>
            <label style={{display:'flex',flexDirection:'column',gap:4}}>
              <span style={lbl}>Contacto en el lugar</span>
              <input style={inp} value={contactoLugar} onChange={e=>setContactoLugar(e.target.value)} placeholder="Nombre + tel"/>
            </label>
          </div>
          <label style={{display:'flex',flexDirection:'column',gap:4}}>
            <span style={lbl}>Ubicación / Dirección</span>
            <input style={inp} value={ubicacion} onChange={e=>setUbicacion(e.target.value)} placeholder="ej: Hotel Sheraton Hudson, Av. Bunge 1234"/>
          </label>
        </div>
        <label style={{display:'flex',flexDirection:'column',gap:4,marginBottom:10}}>
          <span style={lbl}>Observaciones (aparecen en el PDF)</span>
          <textarea style={{...inp,minHeight:55,resize:'vertical',fontFamily:'inherit'}} value={observaciones} onChange={e=>setObservaciones(e.target.value)} placeholder="Notas que querés que vea el cliente en el PDF"/>
        </label>
        {err&&<div style={{marginTop:10,padding:8,background:'#E24B4A15',border:'0.5px solid #E24B4A',borderRadius:6,fontSize:11,color:'#E24B4A'}}>{err}</div>}
      </div>
      <div style={{padding:'14px 20px',borderTop:'0.5px solid #2A2A2A',display:'flex',gap:10,justifyContent:'flex-end',flexWrap:'wrap'}}>
        <button onClick={onClose} style={{padding:'8px 16px',borderRadius:6,border:'0.5px solid #2A2A2A',background:'transparent',color:'#888',fontSize:12,cursor:'pointer'}}>Cancelar</button>
        <button onClick={()=>guardar(true)} disabled={saving} style={{padding:'8px 14px',borderRadius:6,border:'0.5px solid #1543F8',background:'#1543F815',color:'#1543F8',fontSize:12,fontWeight:500,cursor:'pointer',opacity:saving?0.5:1}}>{saving?'Guardando...':'Guardar y abrir PDF'}</button>
        <button onClick={()=>guardar(false)} disabled={saving} style={{padding:'8px 20px',borderRadius:6,border:'none',background:'#1D9E75',color:'#fff',fontSize:12,fontWeight:500,cursor:'pointer',opacity:saving?0.5:1}}>{saving?'Guardando...':'Guardar cambios'}</button>
      </div>
    </div>
  </div>
}

// ---- PROYECTOS ----
function Proyectos({data,mail,onRefresh,openTarget,clearTarget}){
  const MESES_F=[['01','Enero'],['02','Febrero'],['03','Marzo'],['04','Abril'],['05','Mayo'],['06','Junio'],['07','Julio'],['08','Agosto'],['09','Septiembre'],['10','Octubre'],['11','Noviembre'],['12','Diciembre']]
  const [open,setOpen]=useState(null),[sels,setSels]=useState({}),[guardados,setGuardados]=useState({}),[saving,setSaving]=useState(null),[toast2,setToast2]=useState('')
  const [q,setQ]=useState(''),[anio,setAnio]=useState(String(new Date().getFullYear())),[mes,setMes]=useState('todos'),[pm,setPm]=useState('todos'),[agencia,setAgencia]=useState('todos'),[estado,setEstado]=useState('todos')
  useEffect(()=>{
    if (openTarget?.q) {
      setQ(openTarget.q); setAnio('todos'); setMes('todos'); setPm('todos'); setAgencia('todos'); setEstado('todos')
      if (openTarget.num) setOpen(openTarget.num)
      clearTarget?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[openTarget?.q])
  const [freelancerNuevo,setFreelancerNuevo]=useState(null) // {nombre, ctx:{num,idx}}
  const [editarP,setEditarP]=useState(null) // proyecto a editar (fecha, datos básicos)
  const [borrarP,setBorrarP]=useState(null) // proyecto a confirmar borrado
  const proyectos=(data.proyectos||[]).filter(p=>p['N° presupuesto'])
  const rrhhRoster=(data.rrhh||[]).map(r=>String(r['Nombre Apellido']||'').trim()).filter(n=>n&&n.toLowerCase()!=='somos magma')
  const rrhhSet=new Set([...rrhhRoster, 'Somos Magma'].map(n=>n.toLowerCase()))
  const staffRRHH=['Somos Magma',...rrhhRoster.sort()]
  // Cruce de dobles jornadas: por cada (Staff, FechaEvento), listar proyectos
  const dobleJornadaMap=(()=>{
    const m={}
    proyectos.forEach(p => {
      const fE=p['Fecha Evento']||''
      if (!fE) return
      for (let j=1; j<=20; j++) {
        const st = String(p['Staff '+j]||(j===1?p['Staff']:'')||'').trim()
        if (!st || st==='Somos Magma') continue
        const key = st+'__'+fE
        if (!m[key]) m[key] = []
        m[key].push({nro: p['N° presupuesto'], cliente: p['Cliente']||'', proyecto: p['Proyecto']||''})
      }
    })
    return m
  })()
  const dobleJornadaWarning=(nombre, fechaEv, nroActual) => {
    if (!nombre || nombre==='Somos Magma' || !fechaEv) return null
    const key = nombre+'__'+fechaEv
    const otros = (dobleJornadaMap[key]||[]).filter(o => String(o.nro)!==String(nroActual))
    return otros.length ? otros : null
  }
  const getPrecioLista=(nombre)=>{if(!nombre)return 0;const s=SVCS_LIST.find(x=>nombre===x.n);return s?s.p:0}
  const anios=[...new Set(proyectos.map(p=>{const f=p['Fecha Evento']||'';const m=f.match(/(\d{4})/);return m?m[1]:null}).filter(Boolean))].sort().reverse()
  const pms=[...new Set(proyectos.map(p=>p['PM']||p['PM Interno']||'').filter(Boolean))].sort()
  const agencias=[...new Set(proyectos.map(p=>p['Agencia']||'').filter(Boolean))].sort()
  const parseFechaEv=(s)=>{const m=String(s||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return 0;const y=Number(m[3])<100?2000+Number(m[3]):Number(m[3]);return new Date(y,Number(m[2])-1,Number(m[1])).getTime()}
  const filtrados=proyectos.filter(p=>{
    const fecha=p['Fecha Evento']||''
    const mMatch=mes==='todos'||parseInt(fecha.split('/')[1])===parseInt(mes)
    const aMatch=anio==='todos'||fecha.includes(anio)
    return (agencia==='todos'||(p['Agencia']||'')===agencia)&&(mes==='todos'||mMatch)&&(anio==='todos'||aMatch)&&(estado==='todos'||(estado==='ok'&&(p['Carga Staff']===true||p['Carga Staff']==='TRUE'))||(estado==='pendiente'&&p['Carga Staff']!==true&&p['Carga Staff']!=='TRUE'))&&(!q||[p['N° presupuesto'],p['Proyecto'],p['Cliente'],p['Agencia']].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase())))
  }).sort((a,b)=>{
    const fa=parseFechaEv(a['Fecha Evento']), fb=parseFechaEv(b['Fecha Evento'])
    const hoy=Date.now()
    const faF=fa>=hoy-86400000, fbF=fb>=hoy-86400000  // futuro o de hoy (24h tolerancia)
    if (faF && !fbF) return -1   // futuros primero
    if (!faF && fbF) return 1
    if (faF && fbF) return fa-fb // entre futuros: el más próximo primero (ASC)
    return fb-fa                  // entre pasados: el más reciente primero (DESC)
  })
  const getBase=(proy)=>{const svcs=[];for(let j=1;j<=20;j++){const ped=proy['Pedido '+j]||(j===1?proy['Pedido']:'')||'',qui=proy['Staff '+j]||(j===1?proy['Staff']:'')||'',prc=parseMonto(proy['Precio '+j]||(j===1?proy['Precio']:'')||0),precioRef=prc||getPrecioLista(ped);if(ped)svcs.push({pedido:ped,quien:qui,precio:precioRef,precioRef,esExtra:false})};return svcs}
  const getSel=(num,base)=>sels[num]||base.map(s=>({...s}))
  const upd=(num,idx,field,val,base)=>setSels(prev=>{const cur=[...getSel(num,base)];cur[idx]={...cur[idx],[field]:field==='precio'?parseFloat(val)||0:val};if(field==='pedido'){const pL=getPrecioLista(val);if(pL>0)cur[idx].precio=pL};return {...prev,[num]:cur}})
  const addExtra=(num,base)=>setSels(prev=>({...prev,[num]:[...getSel(num,base),{pedido:'',quien:'',precio:0,precioRef:0,esExtra:true}]}))
  const delExtra=(num,idx,base)=>setSels(prev=>({...prev,[num]:getSel(num,base).filter((_,i)=>i!==idx)}))
  const resumen=(items,totalProy)=>{let fl=0,mg=0;items.forEach(s=>{if(!s.quien)return;const v=s.precio||0;if(s.quien==='Somos Magma')mg+=v;else fl+=v});return {fl,mg,fee:totalProy-fl-mg}}
  const guardar=async(num,base)=>{setSaving(num);const items=getSel(num,base);try{await fetch('/api/proyecto-staff',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num,staffData:items.map(s=>({nombre:s.quien,monto:s.precio||0,pedido:s.pedido}))})});setGuardados(prev=>({...prev,[num]:true}));setOpen(null);setToast2('Staff guardado ✓');setTimeout(()=>setToast2(''),2500)}catch(e){};setSaving(null)}
  const inp={padding:'7px 10px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontSize:12,outline:'none',width:'100%'}
  const sel3={padding:'7px 10px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:'#555',fontSize:12,outline:'none',cursor:'pointer'}
  return <div>
    {toast2&&<div style={{position:'fixed',bottom:20,right:20,background:'#1D9E75',color:'#fff',padding:'8px 16px',borderRadius:8,fontSize:12,fontWeight:500,zIndex:999}}>{toast2}</div>}
    <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
      <input style={{...S.inp,flex:1,minWidth:160,marginBottom:0}} placeholder="Buscar N°, proyecto, cliente..." value={q} onChange={e=>setQ(e.target.value)}/>
      <select style={sel3} value={anio} onChange={e=>setAnio(e.target.value)}><option value="todos">Todos los años</option>{anios.map(a=><option key={a} value={a}>{a}</option>)}</select>
      <select style={sel3} value={mes} onChange={e=>setMes(e.target.value)}><option value="todos">Todos los meses</option>{MESES_F.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>

      <select style={sel3} value={agencia} onChange={e=>setAgencia(e.target.value)}><option value="todos">Todas las agencias</option>{agencias.map(a=><option key={a} value={a}>{a}</option>)}</select>
      <select style={sel3} value={estado} onChange={e=>setEstado(e.target.value)}><option value="todos">Todos</option><option value="ok">OK</option><option value="pendiente">Pendiente</option></select>
    </div>
    <div style={{overflowY:'auto',maxHeight:'calc(100vh - 190px)'}}>
      {filtrados.length===0&&<div style={S.nd}>Sin proyectos</div>}
      {filtrados.map((p,i)=>{
        const num=p['N° presupuesto'],ok=p['Carga Staff']===true||p['Carga Staff']==='TRUE'||guardados[num],isOpen=open===num
        const base=getBase(p),items=getSel(num,base),totalProy=parseMonto(p['Total '])||parseMonto(p['Total'])
        const {fl,mg,fee}=resumen(items,totalProy)
        const magmaSvcs=items.filter(s=>s.quien==='Somos Magma').map(s=>s.pedido).filter(Boolean)
        const sinAsignar=items.filter(s=>!s.quien).length
        const fechaEv=p['Fecha Evento']||''
        const diasAlEvento=fechaEv?Math.floor((parseFechaEv(fechaEv)-Date.now())/864e5):null
        const fechaColor=diasAlEvento==null?'#555':diasAlEvento<0?'#666':diasAlEvento<=3?'#E24B4A':diasAlEvento<=7?'#BA7517':'#1D9E75'
        return <div key={i} style={{...S.card,marginBottom:8,borderLeft:!ok&&sinAsignar>0?'3px solid #E24B4A':'3px solid transparent'}}>
          <div style={{display:'grid',gridTemplateColumns:'72px 95px 1fr 130px 60px 100px 100px 130px',alignItems:'center',cursor:'pointer',padding:'10px 0',gap:4}} onClick={()=>setOpen(isOpen?null:num)}>
            <span style={{padding:'0 12px',color:'#1543F8',fontFamily:'monospace',fontSize:11}}>#{num}</span>
            <span style={{padding:'0 8px',fontFamily:'monospace',fontSize:11,color:fechaColor,fontWeight:diasAlEvento!=null&&diasAlEvento<=7?600:400}}>{fechaEv||'—'}{diasAlEvento!=null&&diasAlEvento>=0&&diasAlEvento<=14&&<span style={{display:'block',fontSize:9,color:fechaColor}}>en {diasAlEvento}d</span>}</span>
            <span style={{padding:'0 8px',fontWeight:500,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p['Proyecto']||'—'}{!ok&&sinAsignar>0&&<span style={{fontSize:9,color:'#E24B4A',marginLeft:8,padding:'1px 6px',background:'#E24B4A15',borderRadius:3}}>falta {sinAsignar}</span>}</span>
            <span style={{padding:'0 8px',fontSize:12,color:'#888'}}>{[p['Agencia'],p['Cliente']].filter(Boolean).join(' / ')}</span>
            <span style={{padding:'0 8px',fontSize:12,color:'#555'}}>{p['PM']||p['PM Interno']||'—'}</span>
            <span style={{padding:'0 8px',fontFamily:'monospace',fontSize:12}}>{fmt(totalProy)}</span>
            <span style={{padding:'0 8px'}}><span style={{...S.badge,background:ok?'#1D9E7520':'#BA751720',color:ok?'#1D9E75':'#BA7517'}}>{ok?'OK':'Pendiente'}</span></span>
            <span style={{padding:'0 8px',display:'flex',gap:4}}>
              <button title="Editar fecha / datos" onClick={e=>{e.stopPropagation();setEditarP(p)}} style={{padding:'4px 7px',borderRadius:4,border:'0.5px solid #2A2A2A',background:'transparent',color:'#888',fontSize:10,cursor:'pointer'}}>✎</button>
              <button title="Eliminar proyecto" onClick={e=>{e.stopPropagation();setBorrarP(p)}} style={{padding:'4px 7px',borderRadius:4,border:'0.5px solid #E24B4A40',background:'transparent',color:'#E24B4A',fontSize:10,cursor:'pointer'}}>🗑</button>
              <button style={S.fb} onClick={e=>{e.stopPropagation();setOpen(isOpen?null:num)}}>{ok?'Ver':'Cargar'}</button>
            </span>
          </div>
          {isOpen&&<div style={{borderTop:'0.5px solid #2A2A2A',padding:'16px'}}>
            <div style={{fontSize:11,color:'#555',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.06em'}}>Asignar staff — precio precargado. Pods agregar servicios extra.</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1.2fr 110px 28px',gap:8,marginBottom:6}}>{['Servicio','Staff','Monto',''].map(h=><span key={h} style={{fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'0.06em',padding:'0 4px'}}>{h}</span>)}</div>
            {items.map((s,idx)=>{
              const em=s.quien==='Somos Magma'
              const rowSt=em?{background:'#9635AB08',border:'0.5px solid #9635AB30',borderRadius:6,padding:'4px 0'}:{}
              const esNuevoFreelancer = s.quien && !em && !rrhhSet.has(String(s.quien).toLowerCase())
              const dobles = dobleJornadaWarning(s.quien, p['Fecha Evento'], num)
              return <div key={idx} style={{marginBottom:dobles||esNuevoFreelancer?10:6}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1.2fr 110px 28px',gap:8,alignItems:'center',...rowSt}}>
                {s.esExtra?<select value={s.pedido} onChange={e=>upd(num,idx,'pedido',e.target.value,base)} style={{...inp,color:s.pedido?'#F0F0F0':'#555'}}><option value="">— Servicio extra —</option>{SVCS_LIST.map(sv=><option key={sv.n} value={sv.n}>{sv.n}</option>)}</select>
                :<div style={{padding:'8px 10px',background:em?'transparent':'#1E1E1E',borderRadius:6,fontSize:13,display:'flex',alignItems:'center',gap:6}}>{s.pedido||'—'}{em&&<span style={{fontSize:10,color:'#9635AB',padding:'2px 6px',background:'#9635AB15',borderRadius:3,fontWeight:500}}>Magma</span>}</div>}
                <div style={{position:'relative'}}>
                  <input list={'rrhh-'+num+'-'+idx} value={s.quien||''} onChange={e=>upd(num,idx,'quien',e.target.value,base)} placeholder="Buscar freelancer..." style={{...inp,color:em?'#9635AB':esNuevoFreelancer?'#1D9E75':'#F0F0F0',border:'0.5px solid '+(em?'#9635AB40':esNuevoFreelancer?'#1D9E7560':dobles?'#E24B4A60':s.quien?'#333':'#BA751740'),background:em?'transparent':'#1E1E1E'}}/>
                  <datalist id={'rrhh-'+num+'-'+idx}>{staffRRHH.map(st=><option key={st} value={st}/>)}</datalist>
                </div>
                <input type="number" value={s.precio||''} onChange={e=>upd(num,idx,'precio',e.target.value,base)} placeholder={s.precioRef?String(s.precioRef):'$'} style={{...inp,color:em?'#9635AB':'#F0F0F0',fontFamily:'monospace'}}/>
                <button onClick={()=>s.esExtra&&delExtra(num,idx,base)} style={{width:24,height:24,border:'none',background:'transparent',color:s.esExtra?'#E24B4A':'transparent',cursor:s.esExtra?'pointer':'default',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}>{s.esExtra?'×':''}</button>
                </div>
                {esNuevoFreelancer&&<div style={{marginTop:4,padding:'5px 10px',background:'#1D9E7510',borderRadius:4,fontSize:10,color:'#1D9E75',display:'flex',justifyContent:'space-between',alignItems:'center',gap:6}}>
                  <span>✨ Freelancer nuevo: <strong>{s.quien}</strong> — completá sus datos para poder pagarle</span>
                  <button onClick={()=>setFreelancerNuevo({nombre:s.quien,num,idx})} style={{padding:'2px 8px',borderRadius:3,border:'none',background:'#1D9E75',color:'#fff',fontSize:10,cursor:'pointer'}}>+ Completar</button>
                </div>}
                {dobles&&!esNuevoFreelancer&&<div style={{marginTop:4,padding:'5px 10px',background:'#E24B4A10',borderRadius:4,fontSize:10,color:'#E24B4A'}}>
                  ⚠ <strong>Doble jornada</strong> — {s.quien} ya tiene asignado el {p['Fecha Evento']}: {dobles.map(d=>`#${d.nro} ${d.cliente||d.proyecto}`).join(', ')}. Ojo con precio especial.
                </div>}
              </div>
            })}
            <button onClick={()=>addExtra(num,base)} style={{width:'100%',padding:'6px',borderRadius:6,border:'0.5px dashed #2A2A2A',background:'transparent',color:'#555',fontSize:11,cursor:'pointer',marginTop:4,marginBottom:12}}>+ Agregar servicio extra</button>
            <div style={{display:'flex',gap:16,padding:'10px 14px',background:'#1E1E1E',borderRadius:8,flexWrap:'wrap',borderLeft:'3px solid #2A2A2A'}}>
              {[['Presupuestado',fmt(totalProy),null],['Freelance',fmt(fl),'#BA7517'],['Somos Magma',fmt(mg),'#9635AB'],['Fee Magma',(fee>=0?'+':'')+fmt(fee),fee>=0?'#1D9E75':'#E24B4A']].map(([lbl,val,col])=>(
                <div key={lbl}><div style={{fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:2}}>{lbl}</div><div style={{fontSize:14,fontWeight:500,fontFamily:'monospace',color:col||'inherit'}}>{val}</div></div>
              ))}
            </div>
            {magmaSvcs.length>0&&<div style={{fontSize:11,color:'#9635AB',marginTop:8,padding:'6px 10px',background:'#9635AB08',borderRadius:6,border:'0.5px solid #9635AB20'}}>Somos Magma hace {magmaSvcs.join(', ')} — queda como ingreso interno.</div>}
            <button onClick={()=>guardar(num,base)} disabled={saving===num} style={{marginTop:12,padding:'8px 16px',borderRadius:8,border:'none',background:'#1543F8',color:'#fff',fontSize:12,fontWeight:500,cursor:'pointer',width:'100%',opacity:saving===num?0.6:1}}>{saving===num?'Guardando...':'Guardar staff'}</button>
          </div>}
        </div>
      })}
    </div>
    {freelancerNuevo&&<FreelancerNuevoModal nombre={freelancerNuevo.nombre} mail={mail} onClose={()=>setFreelancerNuevo(null)} onSaved={()=>{setFreelancerNuevo(null);setToast2('Freelancer agregado ✓');setTimeout(()=>setToast2(''),2500);if(onRefresh)setTimeout(onRefresh,500)}}/>}
    {editarP&&<EditarProyectoModal p={editarP} data={data} mail={mail} onClose={()=>setEditarP(null)} onSaved={()=>{setEditarP(null);setToast2('Proyecto actualizado ✓');setTimeout(()=>setToast2(''),2500);if(onRefresh)setTimeout(onRefresh,500)}}/>}
    {borrarP&&<BorrarProyectoModal p={borrarP} mail={mail} onClose={()=>setBorrarP(null)} onBorrado={()=>{setBorrarP(null);setToast2('Proyecto eliminado ✓');setTimeout(()=>setToast2(''),2500);if(onRefresh)setTimeout(onRefresh,500)}}/>}
  </div>
}

function EditarProyectoModal({p,data,mail,onClose,onSaved}){
  // Buscar presupuesto original para conocer modo de fechas
  const presu = (data?.presupuestos||[]).find(x => String(x['Columna 1'])===String(p['N° presupuesto']))
  const tipoOrig = String(presu?.['Tipo Fechas']||'').toLowerCase().trim() || 'dia'
  const adicionalesOrig = String(presu?.['Fechas Adicionales']||'').trim()
  const parseFechaSheet = s => { const parts=String(s||'').split('/'); if(parts.length===3){const yr=parts[2].length===4?parts[2]:'20'+parts[2]; return `${yr}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`}; return '' }
  const toDMY = iso => { const [y,m,d]=iso.split('-'); return `${parseInt(d)}/${parseInt(m)}/${y}` }
  const fechaEv1 = parseFechaSheet(p['Fecha Evento'])

  const [form,setForm]=useState({
    fechaMode: (tipoOrig==='rango'||tipoOrig==='multi') ? tipoOrig : 'dia',
    fe1: fechaEv1,
    feIni: tipoOrig==='rango' ? fechaEv1 : '',
    feFin: tipoOrig==='rango' && adicionalesOrig ? parseFechaSheet(adicionalesOrig) : '',
    cliente: p['Cliente']||'',
    proyecto: p['Proyecto']||'',
    agencia: p['Agencia']||'',
    pm: p['PM']||p['PM Interno']||'',
    contacto: p['Contacto']||presu?.['Contacto']||'',
  })
  const [diasMulti,setDiasMulti]=useState(
    tipoOrig==='multi' && adicionalesOrig
      ? [fechaEv1, ...adicionalesOrig.split('|').filter(Boolean).map(parseFechaSheet)]
      : ['']
  )
  const [saving,setSaving]=useState(false),[err,setErr]=useState('')
  const set=(k,v)=>setForm(p=>({...p,[k]:v}))

  // Autocompletes dinámicos del sheet
  const agenciasAuto = [...new Set([...(data?.agencias||[]).map(x=>x['Nombre']),...((data?.presupuestos||[]).map(x=>x['Agencia']))].filter(Boolean))].sort()
  const clientesAuto = [...new Set([...(data?.clientes||[]).map(x=>x['Nombre']),...((data?.presupuestos||[]).map(x=>x['Cliente']))].filter(Boolean))].sort()
  const contactosAuto = [...new Set([...(data?.contactos||[]).map(x=>x['Nombre']),...((data?.presupuestos||[]).map(x=>x['Contacto']))].filter(Boolean))].sort()

  const guardar=async()=>{
    setSaving(true);setErr('')
    // Determinar Fecha Evento + Tipo + Adicionales según modo
    let fechaEvento='', tipo='dia', adicionales='', cantFechas=1
    if (form.fechaMode==='dia') {
      if(!form.fe1){setErr('Falta la fecha');setSaving(false);return}
      fechaEvento = toDMY(form.fe1); tipo='dia'; cantFechas=1
    } else if (form.fechaMode==='rango') {
      if(!form.feIni||!form.feFin){setErr('Faltan fechas del rango');setSaving(false);return}
      if(new Date(form.feFin)<new Date(form.feIni)){setErr('La fecha fin no puede ser antes que la inicial');setSaving(false);return}
      fechaEvento = toDMY(form.feIni); tipo='rango'; adicionales = toDMY(form.feFin)
      cantFechas = Math.max(1, Math.round((new Date(form.feFin)-new Date(form.feIni))/864e5)+1)
    } else {
      const ms = diasMulti.filter(Boolean)
      if(ms.length<2){setErr('Cargá al menos 2 fechas');setSaving(false);return}
      const dmy = ms.map(toDMY)
      fechaEvento = dmy[0]; tipo='multi'; adicionales = dmy.slice(1).join('|'); cantFechas = dmy.length
    }
    const cambios={}
    if(fechaEvento!==(p['Fecha Evento']||''))cambios['Fecha Evento']=fechaEvento
    if(form.cliente!==(p['Cliente']||''))cambios['Cliente']=form.cliente
    if(form.proyecto!==(p['Proyecto']||''))cambios['Proyecto']=form.proyecto
    if(form.agencia!==(p['Agencia']||''))cambios['Agencia']=form.agencia
    if(form.pm!==(p['PM']||p['PM Interno']||''))cambios['PM Interno']=form.pm
    if(form.contacto!==(p['Contacto']||presu?.['Contacto']||''))cambios['Contacto']=form.contacto
    // Siempre mandamos tipo/adicionales si hay cambio en modo o fechas (van a PRESUPUESTOS via propagables)
    if(tipo!==tipoOrig || adicionales!==adicionalesOrig){
      cambios['Tipo Fechas']=tipo
      cambios['Fechas Adicionales']=adicionales
      cambios['Cant. Fechas']=cantFechas
    }
    if(Object.keys(cambios).length===0){setErr('No hay cambios');setSaving(false);return}
    try{
      const r=await fetch('/api/proyecto-editar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:p['N° presupuesto'],cambios,propagarPresupuesto:true})})
      const j=await r.json()
      if(!j.ok){setErr(j.error||'Error');setSaving(false);return}
      onSaved()
    }catch(e){setErr(e.message);setSaving(false)}
  }
  const inp={background:'#1E1E1E',border:'0.5px solid #333',borderRadius:6,color:'#F0F0F0',fontSize:12,padding:'8px 10px',outline:'none',width:'100%',fontFamily:'inherit',boxSizing:'border-box'}
  const lbl={fontSize:10,color:'#777',display:'block',marginBottom:4,textTransform:'uppercase',letterSpacing:'.06em',fontWeight:600}
  const modoBtn = (v,label) => <button onClick={()=>set('fechaMode',v)} style={{flex:1,padding:'7px',borderRadius:5,border:'0.5px solid '+(form.fechaMode===v?'#1543F8':'#2A2A2A'),background:form.fechaMode===v?'#1543F818':'transparent',color:form.fechaMode===v?'#1543F8':'#888',fontSize:11,cursor:'pointer',fontWeight:form.fechaMode===v?600:400}}>{label}</button>

  return <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
    <div style={{width:580,maxHeight:'90vh',overflowY:'auto',background:'#0D0D0D',borderRadius:12,border:'0.5px solid #2A2A2A',overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <div style={{padding:'16px 22px',borderBottom:'0.5px solid #2A2A2A',display:'flex',alignItems:'center',gap:10,background:'#111'}}>
        <span style={{background:'#1543F820',color:'#1543F8',borderRadius:4,padding:'3px 9px',fontSize:11,fontFamily:'monospace',fontWeight:600}}>#{p['N° presupuesto']}</span>
        <div>
          <div style={{fontSize:14,fontWeight:600,color:'#F0F0F0'}}>Editar proyecto</div>
          <div style={{fontSize:10,color:'#666',marginTop:1}}>{p['Cliente']||p['Agencia']||'—'} · {p['Proyecto']||''}</div>
        </div>
        <div style={{flex:1}}/>
        <button onClick={onClose} style={{fontSize:20,background:'transparent',border:'none',color:'#555',cursor:'pointer',width:30,height:30}}>×</button>
      </div>

      <div style={{padding:'18px 22px',overflowY:'auto'}}>
        <div style={{fontSize:11,color:'#666',marginBottom:14,padding:'8px 10px',background:'#1543F808',borderLeft:'2px solid #1543F8',borderRadius:'3px 5px 5px 3px'}}>Los cambios se reflejan también en PRESUPUESTOS — fecha, tipo de jornada y todo lo demás queda sincronizado.</div>

        {/* MODO DE FECHA */}
        <div style={{marginBottom:14}}>
          <div style={lbl}>Modo de fecha</div>
          <div style={{display:'flex',gap:6}}>
            {modoBtn('dia','📅 Un día')}
            {modoBtn('rango','↔ Rango')}
            {modoBtn('multi','🗓 Varios días')}
          </div>
        </div>

        {form.fechaMode==='dia'&&<label style={{display:'block',marginBottom:14}}><span style={lbl}>Fecha del evento</span><input style={inp} type="date" value={form.fe1} onChange={e=>set('fe1',e.target.value)}/></label>}
        {form.fechaMode==='rango'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
          <label><span style={lbl}>Desde</span><input style={inp} type="date" value={form.feIni} onChange={e=>set('feIni',e.target.value)}/></label>
          <label><span style={lbl}>Hasta</span><input style={inp} type="date" value={form.feFin} onChange={e=>set('feFin',e.target.value)}/></label>
        </div>}
        {form.fechaMode==='multi'&&<div style={{marginBottom:14}}>
          <span style={lbl}>Fechas del evento</span>
          {diasMulti.map((d,i)=>(
            <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 32px',gap:6,alignItems:'center',marginBottom:6}}>
              <input style={inp} type="date" value={d} onChange={e=>{const n=[...diasMulti];n[i]=e.target.value;setDiasMulti(n)}}/>
              <button onClick={()=>{if(diasMulti.length>1)setDiasMulti(diasMulti.filter((_,j)=>j!==i))}} style={{width:32,height:34,border:'0.5px solid #2A2A2A',background:'transparent',color:'#666',borderRadius:5,cursor:'pointer',fontSize:14}}>×</button>
            </div>
          ))}
          <button onClick={()=>setDiasMulti([...diasMulti,''])} style={{padding:'6px',borderRadius:5,border:'0.5px dashed #2A2A2A',background:'transparent',color:'#666',fontSize:11,cursor:'pointer',width:'100%'}}>+ Agregar día</button>
        </div>}

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
          <label><span style={lbl}>Agencia</span>
            <input list="ep-ag" style={inp} value={form.agencia} onChange={e=>set('agencia',e.target.value)}/>
            <datalist id="ep-ag">{agenciasAuto.map(a=><option key={a} value={a}/>)}</datalist>
          </label>
          <label><span style={lbl}>Cliente / Marca</span>
            <input list="ep-cl" style={inp} value={form.cliente} onChange={e=>set('cliente',e.target.value)}/>
            <datalist id="ep-cl">{clientesAuto.map(a=><option key={a} value={a}/>)}</datalist>
          </label>
        </div>
        <label style={{display:'block',marginBottom:10}}><span style={lbl}>Proyecto / descripción</span><input style={inp} value={form.proyecto} onChange={e=>set('proyecto',e.target.value)}/></label>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
          <label><span style={lbl}>PM interno</span>
            <select style={inp} value={form.pm} onChange={e=>set('pm',e.target.value)}>
              <option value="">— PM —</option><option>Juan</option><option>Sofi</option><option>Lulu</option><option>Tomi</option>
            </select>
          </label>
          <label><span style={lbl}>Contacto</span>
            <input list="ep-ct" style={inp} value={form.contacto} onChange={e=>set('contacto',e.target.value)}/>
            <datalist id="ep-ct">{contactosAuto.map(c=><option key={c} value={c}/>)}</datalist>
          </label>
        </div>
        {err&&<div style={{marginTop:8,padding:9,background:'#E24B4A15',border:'0.5px solid #E24B4A',borderRadius:6,fontSize:11,color:'#E24B4A'}}>{err}</div>}
      </div>

      <div style={{padding:'14px 22px',borderTop:'0.5px solid #2A2A2A',display:'flex',gap:10,justifyContent:'flex-end',background:'#0A0A0A'}}>
        <button onClick={onClose} style={{padding:'9px 18px',borderRadius:6,border:'0.5px solid #2A2A2A',background:'transparent',color:'#888',fontSize:12,cursor:'pointer'}}>Cancelar</button>
        <button onClick={guardar} disabled={saving} style={{padding:'9px 22px',borderRadius:6,border:'none',background:'#1D9E75',color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',opacity:saving?0.5:1}}>{saving?'Guardando...':'Guardar cambios'}</button>
      </div>
    </div>
  </div>
}

function BorrarProyectoModal({p,mail,onClose,onBorrado}){
  const [accionPresu,setAccionPresu]=useState('mantener') // 'mantener' | 'desaprobado' | 'represupuestado'
  const [saving,setSaving]=useState(false),[err,setErr]=useState('')
  const borrar=async()=>{
    setSaving(true);setErr('')
    try{
      const r=await fetch('/api/proyecto-eliminar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:p['N° presupuesto'],accionPresupuesto:accionPresu})})
      const j=await r.json()
      if(!j.ok){setErr(j.error||'Error');setSaving(false);return}
      onBorrado()
    }catch(e){setErr(e.message);setSaving(false)}
  }
  const opcion = (val, label, color, desc) => (
    <label style={{display:'flex',gap:10,cursor:'pointer',padding:'10px 12px',background:accionPresu===val?'#1A1A1A':'transparent',borderRadius:6,fontSize:12,color:accionPresu===val?'#F0F0F0':'#888',border:'0.5px solid '+(accionPresu===val?color:'#2A2A2A'),marginBottom:6}}>
      <input type="radio" name="accionPresu" checked={accionPresu===val} onChange={()=>setAccionPresu(val)} style={{accentColor:color,marginTop:2}}/>
      <div style={{flex:1}}>
        <div style={{fontWeight:accionPresu===val?500:400}}>{label}</div>
        <div style={{fontSize:10,color:'#555',marginTop:2,lineHeight:1.4}}>{desc}</div>
      </div>
    </label>
  )
  return <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
    <div style={{width:520,background:'#0D0D0D',borderRadius:10,border:'0.5px solid #E24B4A40',overflow:'hidden'}}>
      <div style={{padding:'16px 20px',borderBottom:'0.5px solid #2A2A2A',display:'flex',alignItems:'center',gap:10}}>
        <span style={{color:'#E24B4A',fontSize:14}}>🗑 Eliminar proyecto</span>
        <div style={{flex:1}}/>
        <button onClick={onClose} style={{fontSize:18,background:'transparent',border:'none',color:'#555',cursor:'pointer'}}>×</button>
      </div>
      <div style={{padding:20}}>
        <div style={{fontSize:13,marginBottom:14}}>¿Borrar el proyecto <strong style={{color:'#1543F8'}}>#{p['N° presupuesto']}</strong>?</div>
        <div style={{padding:'10px 12px',background:'#1E1E1E',borderRadius:6,fontSize:12,color:'#888',marginBottom:16}}>
          <div>{p['Cliente']||p['Agencia']||'—'}</div>
          <div style={{color:'#666',marginTop:2}}>{p['Proyecto']||'(sin proyecto)'}</div>
          <div style={{color:'#666',marginTop:2}}>Evento: {p['Fecha Evento']||'—'}</div>
        </div>
        <div style={{fontSize:10,color:'#9635AB',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:8}}>¿Qué pasa con el presupuesto #{p['N° presupuesto']}?</div>
        {opcion('mantener','Dejar como está','#888','Solo se borra de PROYECTOS. El presupuesto queda en su estado actual (APROBADO).')}
        {opcion('desaprobado','Marcar como DESAPROBADO','#E24B4A','El cliente canceló o decidió no avanzar. Queda en histórico como rechazado.')}
        {opcion('represupuestado','Marcar como REPRESUPUESTADO','#9635AB','Hay una versión más reciente. Queda en histórico como reemplazado por otra versión.')}
        {err&&<div style={{marginTop:10,padding:8,background:'#E24B4A15',border:'0.5px solid #E24B4A',borderRadius:6,fontSize:11,color:'#E24B4A'}}>{err}</div>}
      </div>
      <div style={{padding:'14px 20px',borderTop:'0.5px solid #2A2A2A',display:'flex',gap:10,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{padding:'8px 16px',borderRadius:6,border:'0.5px solid #2A2A2A',background:'transparent',color:'#888',fontSize:12,cursor:'pointer'}}>Cancelar</button>
        <button onClick={borrar} disabled={saving} style={{padding:'8px 20px',borderRadius:6,border:'none',background:'#E24B4A',color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',opacity:saving?0.5:1}}>{saving?'Eliminando...':'Sí, eliminar'}</button>
      </div>
    </div>
  </div>
}

function FreelancerNuevoModal({nombre,mail,onClose,onSaved}){
  const [f,setF]=useState({nombre,rubro:'',celular:'',mailFreelancer:'',dni:'',cuit:'',banco:'',alias:'',cbu:'',fechaNac:'',nacionalidad:'Argentino'})
  const [saving,setSaving]=useState(false),[err,setErr]=useState('')
  const set=(k,v)=>setF(p=>({...p,[k]:v}))
  const guardar=async()=>{
    if(!f.nombre.trim()){setErr('Nombre requerido');return}
    setSaving(true);setErr('')
    try{
      const r=await fetch('/api/freelancer-upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(f)})
      const j=await r.json()
      if(!j.ok){setErr(j.error||'Error');setSaving(false);return}
      onSaved()
    }catch(e){setErr(e.message);setSaving(false)}
  }
  const inp={background:'#1E1E1E',border:'0.5px solid #333',borderRadius:6,color:'#F0F0F0',fontSize:12,padding:'7px 10px',outline:'none',width:'100%',fontFamily:'inherit',boxSizing:'border-box'}
  const lbl={fontSize:10,color:'#555',display:'block',marginBottom:3,textTransform:'uppercase',letterSpacing:'.05em'}
  return <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
    <div style={{width:560,maxHeight:'92vh',background:'#0D0D0D',borderRadius:10,border:'0.5px solid #2A2A2A',overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <div style={{padding:'16px 20px',borderBottom:'0.5px solid #2A2A2A',display:'flex',alignItems:'center',gap:10}}>
        <span style={{background:'#1D9E7520',color:'#1D9E75',borderRadius:4,padding:'3px 10px',fontSize:11,fontWeight:600}}>✨ Freelancer nuevo</span>
        <div style={{flex:1}}/>
        <button onClick={onClose} style={{fontSize:18,background:'transparent',border:'none',color:'#555',cursor:'pointer'}}>×</button>
      </div>
      <div style={{padding:20,overflowY:'auto'}}>
        <div style={{fontSize:11,color:'#888',marginBottom:14}}>Estos datos quedan en la solapa RRHH del sheet para poder pagarle correctamente. Lo único obligatorio es el nombre — el resto lo podés completar después.</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
          <label><span style={lbl}>Nombre y apellido *</span><input style={{...inp,border:'0.5px solid '+(f.nombre.trim()?'#333':'#E24B4A60')}} value={f.nombre} onChange={e=>set('nombre',e.target.value)}/></label>
          <label><span style={lbl}>Rubro</span><input style={inp} value={f.rubro} onChange={e=>set('rubro',e.target.value)} placeholder="ej: Filmmaker, Fotógrafo, Editor, Drone..."/></label>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
          <label><span style={lbl}>Celular</span><input style={inp} value={f.celular} onChange={e=>set('celular',e.target.value)} placeholder="ej: 11 5990-6456"/></label>
          <label><span style={lbl}>Mail</span><input style={inp} type="email" value={f.mailFreelancer} onChange={e=>set('mailFreelancer',e.target.value)}/></label>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
          <label><span style={lbl}>DNI</span><input style={inp} value={f.dni} onChange={e=>set('dni',e.target.value)}/></label>
          <label><span style={lbl}>CUIT/CUIL</span><input style={inp} value={f.cuit} onChange={e=>set('cuit',e.target.value)}/></label>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:10}}>
          <label><span style={lbl}>Fecha nac</span><input style={inp} value={f.fechaNac} onChange={e=>set('fechaNac',e.target.value)} placeholder="DD/MM/YYYY"/></label>
          <label><span style={lbl}>Nacionalidad</span><input style={inp} value={f.nacionalidad} onChange={e=>set('nacionalidad',e.target.value)}/></label>
          <label><span style={lbl}>Banco</span><input style={inp} value={f.banco} onChange={e=>set('banco',e.target.value)} placeholder="ej: Galicia"/></label>
        </div>
        <div style={{fontSize:10,color:'#9635AB',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6,marginTop:8}}>Datos bancarios para pagar</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:10}}>
          <label><span style={lbl}>Alias</span><input style={inp} value={f.alias} onChange={e=>set('alias',e.target.value)} placeholder="MAR.LUCA.GATO"/></label>
          <label><span style={lbl}>CBU</span><input style={inp} value={f.cbu} onChange={e=>set('cbu',e.target.value)} placeholder="22 dígitos"/></label>
        </div>
        {err&&<div style={{marginTop:10,padding:8,background:'#E24B4A15',border:'0.5px solid #E24B4A',borderRadius:6,fontSize:11,color:'#E24B4A'}}>{err}</div>}
      </div>
      <div style={{padding:'14px 20px',borderTop:'0.5px solid #2A2A2A',display:'flex',gap:10,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{padding:'8px 16px',borderRadius:6,border:'0.5px solid #2A2A2A',background:'transparent',color:'#888',fontSize:12,cursor:'pointer'}}>Cancelar</button>
        <button onClick={guardar} disabled={saving||!f.nombre.trim()} style={{padding:'8px 20px',borderRadius:6,border:'none',background:'#1D9E75',color:'#fff',fontSize:12,fontWeight:500,cursor:'pointer',opacity:saving||!f.nombre.trim()?0.5:1}}>{saving?'Guardando...':'Guardar freelancer'}</button>
      </div>
    </div>
  </div>
}

// ---- FACTURACION ----
const CUENTAS_FC=['SRL-BBVA','Sofia-Galicia','Sofia-Santander','Lulu-Santander']
const ENT_FC={SRL:{label:'SRL',color:'#1543F8',bg:'#1543F815'},Sofia:{label:'Sofia',color:'#9635AB',bg:'#9635AB15'},Lulu:{label:'Lulu',color:'#1D9E75',bg:'#1D9E7515'},Efectivo:{label:'Efectivo',color:'#BA7517',bg:'#BA751715'}}
function Facturacion({data,mail,onRefresh,openTarget,clearTarget}){
  const [filtro,setFiltro]=useState('todas'),[abierto,setAbierto]=useState(null),[nuevaOpen,setNuevaOpen]=useState(false),[busqueda,setBusqueda]=useState('')
  useEffect(()=>{
    if (openTarget?.q) {
      setBusqueda(openTarget.q); setFiltro('todas')
      if (openTarget.num) setAbierto(openTarget.num)
      clearTarget?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[openTarget?.q])
  const [presuSel,setPresuSel]=useState(null),[montoTipo,setMontoTipo]=useState('total'),[montoCustom,setMontoCustom]=useState('')
  const [formData,setFormData]=useState({entidad:'SRL',tipo:'A',nroFactura:'',plazo:'30',conIVA:true})
  const [saving,setSaving]=useState(false),[toast,setToast]=useState(''),[cobroData,setCobroData]=useState({})
  const [pQuery,setPQuery]=useState('')
  const [pdfFile,setPdfFile]=useState(null),[cuitAuto,setCuitAuto]=useState('')
  // Marcar como cobrada al guardar (atajo para Flor cuando ya entró el dinero y aún no tenés el N° de factura)
  const [cobrarAlGuardar,setCobrarAlGuardar]=useState(false)
  const [cuentaDestinoNueva,setCuentaDestinoNueva]=useState('BBVA Somos Magma')
  const [editarF,setEditarF]=useState(null) // factura a editar
  const [enviarF,setEnviarF]=useState(null) // factura a mandar por mail
  const fc=data.facturacion||[]
  const presus=(data.presupuestos||[]).filter(p=>isAprobado(p))
  const proyectos=data.proyectos||[]
  const parseD=s=>{if(!s)return null;const pts=String(s).split('/');if(pts.length===3){return new Date(pts[2],pts[1]-1,pts[0])}return null}
  const diffD=f=>{const v=parseD(f['Vencimiento']);if(!v)return 0;return Math.floor((v-new Date())/864e5)}
  const estF=f=>{if(isCobrada(f))return'cobrada';const yaCob=parseMonto(f['Monto cobrado']);if(yaCob>0)return'parcial';const d=diffD(f);if(d<-30)return'reclamar';if(d<0)return'vencida';if(d<7)return'por-vencer';return'pendiente'}
  const fechaHoy=()=>{const d=new Date();return d.getDate()+'/'+(d.getMonth()+1)+'/'+d.getFullYear()}
  const calcVencF=()=>{const d=new Date();d.setDate(d.getDate()+parseInt(formData.plazo||30));return d.getDate()+'/'+(d.getMonth()+1)+'/'+d.getFullYear()}
  const textoReclamo=f=>'Estimados, les escribimos para recordarles que la factura '+(f['Nro de Factura']||'')+' por '+fmt(parseMonto(f['Precio FINAL']))+' emitida el '+(f['Fecha emision']||'')+' se encuentra vencida hace '+Math.abs(diffD(f))+' dias. Quedamos a la espera del pago. Muchas gracias.'
  const getEntidad=f=>{const n=f['Nro de Factura']||'';if(n.toLowerCase().includes('sofia'))return'Sofia';if(n.toLowerCase().includes('lulu'))return'Lulu';if(n.toLowerCase().includes('ef-')||n.toLowerCase().includes('efectivo'))return'Efectivo';return'SRL'}
  const parseFC=s=>{if(!s)return null;const p=String(s).split('/');if(p.length===3)return new Date(p[2],p[1]-1,p[0]);return null}
  // KPIs para Flor — vista clara del estado de cobros
  const kpis = (() => {
    const totalF = fc.length
    const cobradas = fc.filter(f => isCobrada(f))
    const sinCobrar = fc.filter(f => !isCobrada(f))
    const parsedDiff = f => { const fE=parseD(f['Fecha Evento']); return fE ? Math.floor((Date.now()-fE)/864e5) : 0 }
    const atrasadas = sinCobrar.filter(f => parsedDiff(f) > 30)
    const montoSinCobrar = sinCobrar.reduce((s,f)=>s+parseMonto(f['Precio FINAL']),0)
    const montoAtrasado = atrasadas.reduce((s,f)=>s+parseMonto(f['Precio FINAL']),0)
    // Proyectos sin factura: cruzar PROYECTOS con FACTURACION por N° presupuesto
    const facNums = new Set(fc.map(f => String(f['N° Presupuesto']||'').trim()).filter(Boolean))
    const sinFacturar = proyectos.filter(p => p['N° presupuesto'] && !facNums.has(String(p['N° presupuesto']).trim()))
    // Facturas en el sheet SIN N° AFIP (borrador / pendiente de cargar el nro real)
    const sinNroAfip = fc.filter(f => {
      const nro = String(f['Nro de Factura']||'').trim()
      const tipo = String(f['Tipo de Factura']||'').toUpperCase()
      return !nro && !tipo.includes('ANULADA') && f['N° Presupuesto']
    })
    const montoSinNroAfip = sinNroAfip.reduce((s,f)=>s+parseMonto(f['Precio FINAL']),0)
    return { totalF, cobradas:cobradas.length, sinCobrar:sinCobrar.length, atrasadas:atrasadas.length, montoSinCobrar, montoAtrasado, sinFacturar, sinNroAfip, montoSinNroAfip }
  })()

  const filtradas=fc.filter(f=>{
    if(filtro==='pendiente'&&(isCobrada(f)||estF(f)==='parcial'))return false
    if(filtro==='parcial'&&estF(f)!=='parcial')return false
    if(filtro==='cobrada'&&!isCobrada(f))return false
    if(filtro==='atrasadas'){const fE=parseD(f['Fecha Evento']);const d=fE?Math.floor((Date.now()-fE)/864e5):0;if(isCobrada(f)||d<=30)return false}
    if(filtro==='sin-nro'){const nro=String(f['Nro de Factura']||'').trim();const tipo=String(f['Tipo de Factura']||'').toUpperCase();if(nro||tipo.includes('ANULADA')||!f['N° Presupuesto'])return false}
    if(['SRL','Sofia','Lulu'].includes(filtro)&&getEntidad(f)!==filtro)return false
    if(busqueda){
      const q=busqueda.toLowerCase()
      const haystack=[f['N° Presupuesto'],f['Nro de Factura'],f['Cliente'],f['Agencia'],f['Proyecto'],f['Precio FINAL']].map(v=>String(v||'').toLowerCase()).join(' ')
      if(!haystack.includes(q))return false
    }
    return true
  }).sort((a,b)=>{
    if(filtro==='cobrada'){
      const da=parseFC(a['Fecha cobro'])||new Date(0)
      const db=parseFC(b['Fecha cobro'])||new Date(0)
      return db-da
    }
    return (isCobrada(a)?1:0)-(isCobrada(b)?1:0)||diffD(a)-diffD(b)
  })
  const reclamar=fc.filter(f=>estF(f)==='reclamar')
  const vencidas=fc.filter(f=>estF(f)==='vencida')
  const pcTotal=fc.filter(f=>!isCobrada(f)).reduce((s,f)=>s+parseMonto(f['Precio FINAL']),0)
  const cbTotal=fc.filter(isCobrada).reduce((s,f)=>s+parseMonto(f['Precio FINAL']),0)
  const ivaCobrado=fc.filter(isCobrada).reduce((s,f)=>s+parseMonto(f['IVA']),0)
  const retIVATotal=Object.values(cobroData).reduce((s,c)=>s+(c.retIV||0),0)
  const ivaAFIP=Math.max(0,ivaCobrado-retIVATotal)
  const calcCuentas=()=>{const res={};CUENTAS_FC.forEach(c=>{res[c]={saldo:0,pend:0}});fc.forEach(f=>{const cobro=cobroData[f['N° Presupuesto']]||{};const cuenta=cobro.cuenta||'SRL-BBVA';const total=parseMonto(f['Precio FINAL']);const ll=total-(cobro.retG||0)-(cobro.retI||0)-(cobro.retIV||0)-(cobro.com||0);if(isCobrada(f)){if(res[cuenta])res[cuenta].saldo+=ll}else{if(res[cuenta])res[cuenta].pend+=total}});return res}
  const cuentasSaldos=calcCuentas()
  const contactos=data.contactos||[]
  const agenciasData=data.agencias||[]
  const getCuit=p=>{
    const ag=String(p['Agencia']||'').trim()
    const cl=String(p['Cliente']||'').trim()
    // 1° intentar AGENCIAS (la ficha fiscal nueva)
    const agMatch=agenciasData.find(a=>String(a['Nombre']||'').toLowerCase()===ag.toLowerCase())
    if(agMatch&&agMatch['CUIT'])return String(agMatch['CUIT'])
    // 2° intentar Contactos/agencias (legacy)
    const ct=contactos.find(c=>c['Agencia']===ag||c['Agencia']===cl||c['Cliente']===cl)
    if(ct&&(ct['CUIT']||ct['Cuit']||ct['cuit']))return ct['CUIT']||ct['Cuit']||ct['cuit']||''
    // 3° si "Sin agencia / Directo", buscar por cliente
    if(!ag||/sin agencia|directo/i.test(ag)){
      const clMatch=agenciasData.find(a=>String(a['Nombre']||'').toLowerCase()===cl.toLowerCase())
      if(clMatch&&clMatch['CUIT'])return String(clMatch['CUIT'])
    }
    return ''
  }
  const presusConPendiente=presus.map(p=>{
    // Sumar SOLO facturas no anuladas. Comparar SIN IVA para que coincida con el monto del presu.
    const facturasActivas = fc.filter(f =>
      String(f['N° Presupuesto']||'').trim() === String(p['Columna 1']||'').trim() &&
      !String(f['Nro de Factura']||'').toUpperCase().startsWith('ANULADA')
    )
    const facturado = facturasActivas.reduce((s,f) => s + (parseMonto(f['Precio SIN IVA']) || parseMonto(f['Precio FINAL'])), 0)
    const neto = parseMonto(p['Precio Final'])
    // Considera completo si está facturado >= 95% del neto (tolerancia por redondeo)
    const completo = neto > 0 && facturado >= (neto * 0.95)
    return {...p, facturado, neto, pendiente: Math.max(0, neto-facturado), completo, cantFacturas: facturasActivas.length}
  }).filter(p => !p.completo && p.neto > 0)
  const presusFiltrados=presusConPendiente.filter(p=>!pQuery||[String(p['Columna 1']),p['Proyecto']||'',p['Cliente']||'',p['Agencia']||''].some(v=>v.toLowerCase().includes(pQuery.toLowerCase())))
  const calcNeto=()=>{if(!presuSel)return 0;return montoTipo==='total'?presuSel.pendiente:parseFloat(montoCustom)||0}
  const calcIvaF=()=>formData.conIVA?Math.round(calcNeto()*0.21):0
  const calcTotalF=()=>calcNeto()+calcIvaF()
  const guardarFactura=async()=>{
    if(!presuSel||!calcNeto())return
    setSaving(true)
    try{
      const bodyFact={presupuestoNum:presuSel['Columna 1'],proyecto:presuSel['Proyecto'],agencia:presuSel['Agencia'],cliente:presuSel['Cliente'],entidad:formData.entidad,tipo:formData.tipo,nroFactura:formData.nroFactura,fechaEmision:fechaHoy(),fechaVenc:calcVencF(),plazo:formData.plazo,conIVA:formData.conIVA,neto:calcNeto(),iva:calcIvaF(),total:calcTotalF()}
      let rf=await fetch('/api/factura-nueva',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(bodyFact)})
      if(rf.status===409){
        const jd=await rf.json()
        if(confirm(jd.mensaje+'\n\n¿Crear de todos modos? (Cancelar para corregir el N°)')){
          rf=await fetch('/api/factura-nueva',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...bodyFact,forzar:true})})
        }else{setSaving(false);return}
      }
      if(rf.status===429){
        alert('⚠ Google está limitando los pedidos.\n\nEsperá 30 segundos y volvé a apretar "Crear factura".\nLa factura NO se guardó.')
        setSaving(false);return
      }
      if(!rf.ok&&rf.status!==409){const e=await rf.json().catch(()=>({}));throw new Error(e.error||'Error guardando factura (status '+rf.status+')')}
      // Confirmar éxito leyendo la respuesta
      const jOk=await rf.json().catch(()=>({}))
      if(!jOk.ok){throw new Error(jOk.error||'El servidor no confirmó el guardado')}
      setToast('✓ Factura guardada')
      // Si se eligió marcar cobrada, llamamos a factura-cobro con el monto total
      if(cobrarAlGuardar && cuentaDestinoNueva){
        try{
          setToast('Marcando cobrada...')
          const totalCobro = calcTotalF()
          const rC = await fetch('/api/factura-cobro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
            nroPresupuesto: String(presuSel['Columna 1']),
            tipoCobro: 'total',
            monto: totalCobro,
            cuentaDestino: cuentaDestinoNueva,
            formaPago: 'Transferencia',
            retGanancias: 0, retIIBB: 0, retIVA: 0, comision: 0,
            fechaCobro: fechaHoy(),
            reservarIVA: formData.tipo === 'A' && formData.conIVA,
          })}).then(r=>r.json())
          if(rC.ok || rC.completa){
            setToast('✓ Factura + cobro registrados en '+cuentaDestinoNueva)
          } else {
            setToast('Factura OK, pero cobro falló: '+(rC.error||'?'))
          }
        }catch(eC){console.error('cobro al guardar:',eC);setToast('Factura OK pero cobro falló')}
      }
      if(pdfFile){
        try{
          setToast('Subiendo PDF a Drive...')
          const fd=new FormData()
          fd.append('file',pdfFile,pdfFile.name)
          fd.append('entidad',formData.entidad)
          fd.append('nroFactura',formData.nroFactura)
          fd.append('presupuestoNum',String(presuSel['Columna 1']))
          const now=new Date()
          fd.append('mes',String(now.getMonth()+1))
          fd.append('anio',String(now.getFullYear()))
          const ur=await fetch('/api/factura-upload',{method:'POST',body:fd})
          const uj=await ur.json()
          if(uj.ok){setToast('Factura + PDF guardado ✓')}
          else{setToast('Factura OK, PDF falló: '+(uj.error||'?'))}
        }catch(eu){console.error('upload error',eu);setToast('Factura OK pero PDF falló')}
      }
      setTimeout(()=>setToast(''),3000)
      setNuevaOpen(false);setPresuSel(null);setMontoCustom('');setPQuery('');setCuitAuto('');setPdfFile(null)
      setFormData({entidad:'SRL',tipo:'A',nroFactura:'',plazo:'30',conIVA:true})
      setCobrarAlGuardar(false);setCuentaDestinoNueva('BBVA Somos Magma')
      if(typeof onRefresh==='function')setTimeout(onRefresh,800)
    }catch(e){
      alert('❌ NO se pudo guardar la factura:\n\n'+e.message+'\n\nLa factura NO quedó cargada. Volvé a intentar.')
      setToast('Error: '+e.message)
    }
    setSaving(false)
  }
  const registrarCobro=async(f,tipoCobro,opts={})=>{
    const nro=f['N° Presupuesto']
    const cobro=cobroData[nro]||{}
    const total=parseMonto(f['Precio FINAL'])
    const yaCobrado=parseMonto(f['Monto cobrado'])||(isCobrada(f)?total:0)
    const pendiente=Math.max(0,total-yaCobrado)
    let monto=opts.monto
    if(monto===undefined){
      if(tipoCobro==='total')monto=pendiente
      else if(tipoCobro==='adelanto'){const pctStr=prompt('% del adelanto (ej 30, 50)','30');if(!pctStr)return;const pct=parseFloat(pctStr)||30;monto=Math.round(total*pct/100);opts.porcentajeAdelanto=pct}
      else{const m=prompt(`Monto del pago parcial (pendiente: ${fmt(pendiente)})`,String(pendiente));if(!m)return;monto=parseFloat(m)||0}
    }
    if(!monto||monto<=0){setToast('Monto invalido');return}
    if(!cobro.cuenta){setToast('Elegi cuenta destino');return}
    const tipoFC=String(f['Tipo de Factura']||'').toUpperCase()
    const reservarIVA=tipoFC==='A'&&parseMonto(f['IVA'])>0&&(opts.reservarIVA!==false)
    try{
      const resp=await fetch('/api/factura-cobro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        nroPresupuesto:nro,
        tipoCobro,
        monto,
        cuentaDestino:cobro.cuenta,
        formaPago:cobro.forma||'',
        retGanancias:cobro.retG||0,
        retIIBB:cobro.retI||0,
        retIVA:cobro.retIV||0,
        comision:cobro.com||0,
        fechaCobro:fechaHoy(),
        reservarIVA,
        porcentajeAdelanto:opts.porcentajeAdelanto,
      })}).then(r=>r.json())
      if(resp.error){setToast('Error: '+resp.error);return}
      const partes=[`+${fmt(resp.llegoACuenta)} en ${cobro.cuenta}`]
      if(resp.reservaCreada)partes.push(`Reserva IVA ${fmt(resp.reservaCreada.monto)}`)
      if(resp.completa)partes.push('FACTURA COMPLETA')
      else partes.push(`acum ${fmt(resp.acumulado)}/${fmt(resp.precioFinal)}`)
      setToast(partes.join(' · '))
      setTimeout(()=>setToast(''),5000)
      setCobroData(prev=>({...prev,[nro]:{...cobro,retG:0,retI:0,retIV:0,com:0}}))
      if(typeof onRefresh==='function')await onRefresh()
    }catch(e){setToast('Error: '+e.message)}
  }
  const marcarCobrada=f=>registrarCobro(f,'total')
  const inp2={padding:'7px 9px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontSize:13,outline:'none',width:'100%'}
  const bmap={cobrada:{bg:'#1D9E7520',c:'#1D9E75',l:'Cobrada'},parcial:{bg:'#9635AB20',c:'#9635AB',l:'Parcial'},pendiente:{bg:'#1543F820',c:'#1543F8',l:'Pendiente'},'por-vencer':{bg:'#BA751720',c:'#BA7517',l:'Por vencer'},vencida:{bg:'#E24B4A20',c:'#E24B4A',l:'Vencida'},reclamar:{bg:'#FCEBEB',c:'#A32D2D',l:'Reclamar!'}}
  const cobrosForFc=(nro)=>(data.cobros||[]).filter(c=>String(c['N° Presupuesto'])===String(nro))
  return <div>
    {toast&&<div style={{position:'fixed',bottom:20,right:20,background:'#1D9E75',color:'#fff',padding:'8px 16px',borderRadius:8,fontSize:12,fontWeight:500,zIndex:999}}>{toast}</div>}
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:10}}>
      {CUENTAS_FC.map(c=>{const s=cuentasSaldos[c]||{saldo:0,pend:0};return <div key={c} style={{background:'#161616',border:'0.5px solid #2A2A2A',borderRadius:8,padding:'9px 11px'}}><div style={{fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:3}}>{c}</div><div style={{fontFamily:'monospace',fontSize:14,fontWeight:500,color:s.saldo>0?'#1D9E75':'#555'}}>{s.saldo>0?fmtM(s.saldo):'$0'}</div>{s.pend>0&&<div style={{fontSize:10,color:'#555',marginTop:2}}>+{fmtM(s.pend)} pend.</div>}</div>})}
    </div>
    <div style={{background:'#161616',border:'0.5px solid #2A2A2A',borderRadius:8,padding:'11px 16px',marginBottom:10,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
      <div style={{fontSize:11,fontWeight:500,color:'#555',textTransform:'uppercase',letterSpacing:'0.06em'}}>Posicion IVA</div>
      {[['IVA cobrado','+'+fmt(ivaCobrado),'#E24B4A'],['Ret. IVA clientes','-'+fmt(retIVATotal),'#1D9E75'],['Credito fiscal (contador)','$0','#1D9E75']].map(([l,v,c])=>(
        <div key={l}><div style={{fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3}}>{l}</div><div style={{fontFamily:'monospace',fontSize:14,fontWeight:500,color:c}}>{v}</div></div>
      ))}
      <div style={{borderLeft:'0.5px solid #2A2A2A',paddingLeft:16}}><div style={{fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3}}>A depositar AFIP</div><div style={{fontFamily:'monospace',fontSize:17,fontWeight:500,color:'#E24B4A'}}>{fmt(ivaAFIP)}</div></div>
    </div>
    <div style={S.k4}>
      <K lbl='Por cobrar' val={fmtM(pcTotal)} sub={fc.filter(f=>!isCobrada(f)).length+' facturas'} c='#BA7517'/>
      <K lbl='Cobrado' val={fmtM(cbTotal)} sub={fc.filter(isCobrada).length+' facturas'} c='#1D9E75'/>
      <K lbl='Vencidas / Reclamar' val={vencidas.length+reclamar.length} sub={reclamar.length>0?reclamar.length+' para reclamar':''} c='#E24B4A'/>
      <K lbl='IVA a depositar' val={fmtM(ivaAFIP)} sub='posicion fiscal' c='#E24B4A'/>
    </div>
    {[...reclamar,...vencidas].map((f,i)=>{const dias=Math.abs(diffD(f));const esRecl=estF(f)==='reclamar';return <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 14px',borderRadius:8,background:esRecl?'#FCEBEB':'#FAEEDA',border:'0.5px solid '+(esRecl?'#E24B4A':'#BA7517'),color:esRecl?'#A32D2D':'#633806',fontSize:13,marginBottom:6}}><span style={{flex:1}}><strong>{f['Nro de Factura']||'s/n'}</strong> — {f['Cliente']} · {dias} dias vencida · {fmt(parseMonto(f['Precio FINAL']))}</span><button style={{padding:'3px 10px',borderRadius:3,border:'none',background:esRecl?'#E24B4A':'#BA7517',color:'#fff',fontSize:11,cursor:'pointer',fontWeight:500}} onClick={()=>setAbierto(abierto===f['N° Presupuesto']?null:f['N° Presupuesto'])}>{esRecl?'Ver y reclamar':'Gestionar'}</button></div>})}
    <div style={{background:'#161616',border:'0.5px solid #1543F8',borderRadius:10,marginBottom:12,overflow:'hidden'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',cursor:'pointer',background:'#1543F808'}} onClick={()=>setNuevaOpen(!nuevaOpen)}>
        <span style={{fontSize:13,fontWeight:500,color:'#1543F8'}}>+ Nueva factura</span>
        <span style={{fontSize:11,color:'#1543F8'}}>{nuevaOpen?'Cerrar':'Abrir'}</span>
      </div>
      {nuevaOpen&&<div style={{padding:16,borderTop:'0.5px solid #2A2A2A'}}>
        {!presuSel?<div>
          <div style={{fontSize:12,color:'#555',marginBottom:10}}>Presupuestos aprobados con saldo pendiente:</div>
          <input style={{...inp2,marginBottom:8}} placeholder='Buscar N°, cliente, proyecto...' value={pQuery} onChange={e=>setPQuery(e.target.value)}/>
          <div style={{border:'0.5px solid #2A2A2A',borderRadius:8,overflow:'hidden',maxHeight:220,overflowY:'auto'}}>
            {presusFiltrados.length===0&&<div style={{padding:14,fontSize:12,color:'#555',fontStyle:'italic'}}>Sin presupuestos pendientes</div>}
            {presusFiltrados.map(p=>{const pct=p.facturado>0?Math.round(p.facturado/p.neto*100):0;return <div key={p['Columna 1']} style={{padding:'10px 12px',cursor:'pointer',borderBottom:'0.5px solid #2A2A2A'}} onClick={()=>{setPresuSel(p);setPQuery('');setCuitAuto(getCuit(p))}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontFamily:'monospace',fontSize:11,color:'#1543F8',flexShrink:0}}>#{p['Columna 1']}</span>
                <span style={{fontSize:13,fontWeight:500,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p['Proyecto']}</span>
                <span style={{fontFamily:'monospace',fontSize:12,fontWeight:500,flexShrink:0}}>{fmt(p.neto)}</span>
                <span style={{fontSize:10,padding:'1px 6px',borderRadius:3,background:p.facturado>0?'#1543F815':'#1D9E7515',color:p.facturado>0?'#1543F8':'#1D9E75',flexShrink:0}}>{p.facturado>0?'Parcial':'Sin facturar'}</span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8,marginTop:4,fontSize:11,color:'#555'}}>
                <span>{[p['Agencia'],p['Cliente']].filter(Boolean).join(' / ')}</span>
                {p.facturado>0&&<><div style={{flex:1,height:3,background:'#2A2A2A',borderRadius:2,maxWidth:100,overflow:'hidden'}}><div style={{height:3,background:'#1543F8',borderRadius:2,width:pct+'%'}}></div></div><span>{pct}%</span></>}
                <span style={{color:'#1D9E75',fontWeight:500,marginLeft:'auto'}}>Pendiente: {fmt(p.pendiente)}</span>
              </div>
            </div>})}
          </div>
        </div>
        :<div>
          <div style={{padding:'10px 12px',background:'#1543F808',border:'0.5px solid #1543F8',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,cursor:'pointer'}} onClick={()=>setPresuSel(null)}>
            <span style={{fontSize:13,fontWeight:500,color:'#1543F8'}}>#{presuSel['Columna 1']} — {presuSel['Proyecto']} ({presuSel['Cliente']})</span>
            <span style={{fontSize:11,color:'#555',textDecoration:'underline'}}>Cambiar</span>
          </div>
          <div style={{display:'flex',gap:16,flexWrap:'wrap',padding:'10px 12px',background:'#1E1E1E',borderRadius:8,marginBottom:12}}>
            {[['Total presupuesto',fmt(presuSel.neto),null],['Ya facturado',fmt(presuSel.facturado),'#555'],['Pendiente',fmt(presuSel.pendiente),'#1D9E75']].map(([l,v,c])=>(
              <div key={l}><div style={{fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:3}}>{l}</div><div style={{fontFamily:'monospace',fontSize:14,fontWeight:500,color:c||'inherit'}}>{v}</div></div>
            ))}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10,marginBottom:10}}>
            {[['Factura por',' '],['Tipo',' '],['N° factura',' '],['Plazo',' ']].map(([l])=>(
              <div key={l} style={{display:'flex',flexDirection:'column',gap:4}}>
                <label style={{fontSize:11,color:'#555'}}>{l}</label>
                {l==='Factura por'&&<select style={inp2} value={formData.entidad} onChange={e=>{const v=e.target.value;setFormData(p=>({...p,entidad:v,conIVA:v==='Efectivo'?false:p.conIVA}))}}><option value='SRL'>Somos Magma SRL</option><option value='Sofia'>Sofia Grenier</option><option value='Lulu'>Lucia Grenier</option><option value='Efectivo'>Efectivo (sin factura)</option></select>}
                {l==='Tipo'&&<select style={inp2} value={formData.tipo} onChange={e=>{const v=e.target.value;setFormData(p=>({...p,tipo:v,conIVA:v==='A'?true:false}))}}>{['A','B','C'].map(o=><option key={o}>{o}</option>)}</select>}
                {l==='N° factura'&&<input style={{...inp2,fontFamily:'monospace'}} value={formData.nroFactura} onChange={e=>setFormData(p=>({...p,nroFactura:e.target.value}))} placeholder='0001-00001234'/>}
                {l==='Plazo'&&<select style={inp2} value={formData.plazo} onChange={e=>setFormData(p=>({...p,plazo:e.target.value}))}>{[['0','Contado'],['15','15 dias'],['30','30 dias'],['60','60 dias']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>}
              </div>
            ))}
          </div>
          <label style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:8,background:'#1E1E1E',cursor:'pointer',fontSize:13,marginBottom:12,width:'fit-content'}}><input type='checkbox' checked={formData.conIVA} onChange={e=>setFormData(p=>({...p,conIVA:e.target.checked}))} style={{accentColor:'#1543F8',width:15,height:15}}/> Facturar con IVA (21%)</label>
          <div style={{fontSize:11,color:'#555',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.06em'}}>Monto a facturar</div>
          <div style={{display:'flex',gap:8,marginBottom:12}}>
            {[['total','Total pendiente '+fmt(presuSel.pendiente)],['custom','Parcial']].map(([v,l])=>(
              <label key={v} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:8,border:'0.5px solid '+(montoTipo===v?'#1543F8':'#333'),background:montoTipo===v?'#1543F808':'transparent',cursor:'pointer',fontSize:13,flex:1}} onClick={()=>setMontoTipo(v)}>
                <input type='radio' name='mt' value={v} checked={montoTipo===v} onChange={()=>setMontoTipo(v)} style={{accentColor:'#1543F8'}}/>{l}
              </label>
            ))}
          </div>
          {montoTipo==='custom'&&<input type='number' style={{...inp2,fontFamily:'monospace',marginBottom:12}} value={montoCustom} onChange={e=>setMontoCustom(e.target.value)} placeholder='Monto parcial...'/>}
          <div style={{background:'#1E1E1E',borderRadius:8,padding:12,marginBottom:12}}>
            {[['Neto (sin IVA)',fmt(calcNeto()),null],['IVA 21%',formData.conIVA?fmt(calcIvaF()):'No aplica',formData.conIVA?'#E24B4A':'#555']].map(([l,v,c])=>(
              <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'0.5px solid #2A2A2A',fontSize:13}}><span style={{color:'#555',fontSize:12}}>{l}</span><span style={{fontFamily:'monospace',fontSize:12,color:c||'inherit'}}>{v}</span></div>
            ))}
            <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',fontSize:13,fontWeight:500}}><span>Total a facturar</span><span style={{fontFamily:'monospace',fontSize:15,color:'#1543F8'}}>{fmt(calcTotalF())}</span></div>
            {montoTipo==='custom'&&calcNeto()>0&&calcNeto()<presuSel.pendiente&&<div style={{display:'flex',justifyContent:'space-between',padding:'4px 0',fontSize:12}}><span style={{color:'#BA7517'}}>Queda pendiente</span><span style={{fontFamily:'monospace',color:'#BA7517'}}>{fmt(presuSel.pendiente-calcNeto())}</span></div>}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}><div><div style={{fontSize:11,color:'#555',marginBottom:4}}>CUIT del cliente</div><input style={{...inp2,color:cuitAuto?'#1D9E75':'#F0F0F0'}} value={cuitAuto} onChange={e=>setCuitAuto(e.target.value)} placeholder='Autocomplete por agencia/cliente'/></div><div><div style={{fontSize:11,color:'#555',marginBottom:4}}>Adjuntar factura PDF</div><input type='file' accept='.pdf,.PDF' onChange={e=>setPdfFile(e.target.files[0]||null)} style={{padding:'6px',border:'0.5px solid #333',borderRadius:6,background:'#1E1E1E',color:'#F0F0F0',fontSize:11,width:'100%',cursor:'pointer'}}/></div></div>
          {/* Atajo: marcar como cobrada en el mismo paso */}
          <div style={{padding:'10px 12px',background:'#1D9E7510',border:'0.5px solid #1D9E7530',borderRadius:8,marginBottom:12}}>
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:12,color:'#F0F0F0'}}>
              <input type='checkbox' checked={cobrarAlGuardar} onChange={e=>setCobrarAlGuardar(e.target.checked)} style={{accentColor:'#1D9E75'}}/>
              <span><strong style={{color:'#1D9E75'}}>Marcar como cobrada</strong> · si ya entró la plata pero no tenés el N° de factura todavía</span>
            </label>
            {cobrarAlGuardar&&<div style={{marginTop:8,paddingTop:8,borderTop:'0.5px solid #1D9E7520'}}>
              <div style={{fontSize:11,color:'#888',marginBottom:4}}>Cuenta donde entró:</div>
              <select style={{...inp2,fontSize:12}} value={cuentaDestinoNueva} onChange={e=>setCuentaDestinoNueva(e.target.value)}>
                {(data?.cuentas||[]).filter(c=>String(c['Activa']||'').toUpperCase()==='SÍ'||String(c['Activa']||'').toUpperCase()==='SI'||c['Activa']==='TRUE').map(c=><option key={c['Nombre']} value={c['Nombre']}>{c['Nombre']}</option>)}
                <option value='Efectivo'>Efectivo</option>
              </select>
              <div style={{fontSize:10,color:'#666',marginTop:6}}>Se va a registrar cobro por {fmt(calcTotalF())} y sumar al saldo de la cuenta.</div>
            </div>}
          </div>
          <button onClick={guardarFactura} disabled={!calcNeto()||saving} style={{padding:'10px 24px',borderRadius:8,border:'none',background:cobrarAlGuardar?'#1D9E75':'#1543F8',color:'#fff',fontSize:13,fontWeight:500,cursor:'pointer',width:'100%',opacity:!calcNeto()||saving?0.4:1}}>{saving?'Guardando...':(cobrarAlGuardar?'Crear factura y marcar cobrada':'Crear factura')}</button>
        </div>}
      </div>}
    </div>
    {/* KPIs para Flor */}
    <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:8,marginBottom:14}}>
      <div style={{...S.card,padding:'10px 12px',borderLeft:'3px solid #1543F8'}}>
        <div style={{fontSize:9,color:'#555',textTransform:'uppercase',letterSpacing:'.06em'}}>Total facturas</div>
        <div style={{fontSize:20,fontWeight:600,color:'#F0F0F0',marginTop:3}}>{kpis.totalF}</div>
      </div>
      <div onClick={()=>setFiltro('pendiente')} style={{...S.card,padding:'10px 12px',borderLeft:'3px solid #BA7517',cursor:'pointer'}}>
        <div style={{fontSize:9,color:'#555',textTransform:'uppercase',letterSpacing:'.06em'}}>Por cobrar</div>
        <div style={{fontSize:20,fontWeight:600,color:'#BA7517',marginTop:3}}>{kpis.sinCobrar}</div>
        <div style={{fontSize:10,color:'#888',fontFamily:'monospace',marginTop:1}}>{fmtM(kpis.montoSinCobrar)}</div>
      </div>
      <div onClick={()=>setFiltro('atrasadas')} style={{...S.card,padding:'10px 12px',borderLeft:'3px solid #E24B4A',cursor:'pointer'}}>
        <div style={{fontSize:9,color:'#555',textTransform:'uppercase',letterSpacing:'.06em'}}>Atrasadas +30d</div>
        <div style={{fontSize:20,fontWeight:600,color:'#E24B4A',marginTop:3}}>{kpis.atrasadas}</div>
        <div style={{fontSize:10,color:'#888',fontFamily:'monospace',marginTop:1}}>{fmtM(kpis.montoAtrasado)}</div>
      </div>
      <div onClick={()=>setFiltro('cobrada')} style={{...S.card,padding:'10px 12px',borderLeft:'3px solid #1D9E75',cursor:'pointer'}}>
        <div style={{fontSize:9,color:'#555',textTransform:'uppercase',letterSpacing:'.06em'}}>Cobradas</div>
        <div style={{fontSize:20,fontWeight:600,color:'#1D9E75',marginTop:3}}>{kpis.cobradas}</div>
      </div>
      <div onClick={()=>setFiltro('sin-facturar')} style={{...S.card,padding:'10px 12px',borderLeft:'3px solid #9635AB',cursor:'pointer'}}>
        <div style={{fontSize:9,color:'#555',textTransform:'uppercase',letterSpacing:'.06em'}}>Sin facturar</div>
        <div style={{fontSize:20,fontWeight:600,color:'#9635AB',marginTop:3}}>{kpis.sinFacturar.length}</div>
        <div style={{fontSize:10,color:'#888',marginTop:1}}>proyectos</div>
      </div>
      <div onClick={()=>setFiltro('sin-nro')} style={{...S.card,padding:'10px 12px',borderLeft:'3px solid #FF9F0A',cursor:'pointer'}}>
        <div style={{fontSize:9,color:'#555',textTransform:'uppercase',letterSpacing:'.06em'}}>Sin N° AFIP</div>
        <div style={{fontSize:20,fontWeight:600,color:'#FF9F0A',marginTop:3}}>{kpis.sinNroAfip.length}</div>
        <div style={{fontSize:10,color:'#888',fontFamily:'monospace',marginTop:1}}>{fmtM(kpis.montoSinNroAfip)}</div>
      </div>
    </div>

    {filtro==='sin-facturar'?<div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
        <div style={{fontSize:13,fontWeight:500}}>Proyectos sin factura emitida</div>
        <button onClick={()=>setFiltro('todas')} style={{padding:'5px 12px',borderRadius:6,border:'0.5px solid #333',background:'transparent',color:'#888',fontSize:11,cursor:'pointer'}}>← volver al listado</button>
      </div>
      <div style={{fontSize:11,color:'#555',marginBottom:8}}>Estos proyectos están en PROYECTOS pero no tienen entrada en FACTURACION. {kpis.sinFacturar.length} pendientes.</div>
      <div style={{overflowY:'auto',maxHeight:'calc(100vh - 380px)'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr style={{background:'#1A1A1A'}}>
            {['N°','Evento','Agencia','Cliente','Proyecto','Total','PM',''].map(h=><th key={h} style={{fontSize:10,color:'#555',padding:'8px 12px',textAlign:'left',fontWeight:400,textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:'0.5px solid #2A2A2A'}}>{h}</th>)}
          </tr></thead>
          <tbody>
            {kpis.sinFacturar.sort((a,b)=>{const pa=String(a['Fecha Evento']||'').split('/').reverse().join('-');const pb=String(b['Fecha Evento']||'').split('/').reverse().join('-');return pa.localeCompare(pb)}).map((p,i)=>{
              const fE=parseD(p['Fecha Evento']);const dias=fE?Math.floor((Date.now()-fE)/864e5):null
              const color=dias==null?'#555':dias<0?'#888':dias>30?'#E24B4A':dias>14?'#BA7517':'#1D9E75'
              return <tr key={i} style={{background:i%2===0?'#161616':'#1A1A1A'}}>
                <td style={{...S.td,color:'#1543F8',fontFamily:'monospace',fontSize:11}}>#{p['N° presupuesto']}</td>
                <td style={{...S.td,fontSize:11,color}}>{p['Fecha Evento']||'—'}{dias!=null&&dias>0&&<span style={{fontSize:9,marginLeft:6,color}}>{dias}d</span>}</td>
                <td style={{...S.td,fontSize:12,color:'#888'}}>{p['Agencia']||'—'}</td>
                <td style={{...S.td,fontSize:12,fontWeight:500}}>{p['Cliente']||'—'}</td>
                <td style={{...S.td,fontSize:12,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p['Proyecto']||'—'}</td>
                <td style={{...S.td,fontFamily:'monospace',fontSize:12}}>{fmtM(parseMonto(p['Total ']||p['Total']))}</td>
                <td style={{...S.td,fontSize:11,color:'#888'}}>{p['PM']||p['PM Interno']||'—'}</td>
                <td style={{...S.td}}><button onClick={()=>{
                  const nro=String(p['N° presupuesto'])
                  let presu=presus.find(x=>String(x['Columna 1'])===nro)
                  if(!presu){
                    // Proyecto huérfano (sin presu en la app, ej cargado directo al sheet). Construimos un presu mínimo a partir del proyecto.
                    const total=parseMonto(p['Total ']||p['Total'])
                    presu={
                      'Columna 1':nro,
                      'Cliente':p['Cliente']||'',
                      'Agencia':p['Agencia']||'',
                      'Proyecto':p['Proyecto']||'',
                      'Fecha Evento':p['Fecha Evento']||'',
                      'PM Interno':p['PM']||'',
                      'Precio Final':total,
                      'Total':total,
                      'Estado':'APROBADO',
                      '__huerfano':true,
                    }
                  }
                  setPresuSel({...presu,pendiente:parseMonto(presu['Precio Final'])})
                  setNuevaOpen(true)
                }} style={{padding:'4px 10px',borderRadius:4,border:'none',background:'#1543F8',color:'#fff',fontSize:11,cursor:'pointer'}}>+ Facturar</button></td>
              </tr>
            })}
          </tbody>
        </table>
        {kpis.sinFacturar.length===0&&<div style={{padding:'20px',textAlign:'center',color:'#1D9E75',fontSize:13}}>✓ No hay proyectos pendientes de facturar</div>}
      </div>
    </div>:<><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,gap:10,flexWrap:'wrap'}}>
      <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
        {[['todas','Todas'],['sin-facturar','Sin facturar'],['pendiente','Pendientes'],['parcial','Parciales'],['atrasadas','Atrasadas'],['cobrada','Cobradas'],['SRL','SRL'],['Sofia','Sofia'],['Lulu','Lulu']].map(([id,l])=>{
          const count = id==='sin-facturar'?kpis.sinFacturar.length:null
          return <button key={id} style={{...S.fb,...(filtro===id?S.fa:{}),...(id==='sin-facturar'&&count>0?{borderColor:'#9635AB',color:filtro===id?'#fff':'#9635AB'}:{})}} onClick={()=>setFiltro(id)}>{l}{count!=null&&count>0?` (${count})`:''}</button>
        })}
      </div>
      <div style={{display:'flex',gap:6,alignItems:'center',flex:'1 1 240px',maxWidth:380}}>
        <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder='🔍 Buscar nro, cliente, proyecto, agencia, monto...' style={{flex:1,padding:'7px 10px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontSize:12,outline:'none'}}/>
        {busqueda&&<button onClick={()=>setBusqueda('')} style={{padding:'7px 10px',borderRadius:6,border:'0.5px solid #333',background:'transparent',color:'#888',fontSize:11,cursor:'pointer'}}>×</button>}
      </div>
    </div>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6,gap:10,flexWrap:'wrap'}}>
      <div style={{fontSize:11,color:'#555'}}>{filtradas.length} {filtradas.length===1?'factura':'facturas'}{filtro!=='todas'?' · estado: '+filtro:''}{busqueda?' · buscando "'+busqueda+'"':''}</div>
      {(filtro!=='todas'||busqueda)&&<button onClick={()=>{setFiltro('todas');setBusqueda('')}} style={{fontSize:10,padding:'4px 10px',borderRadius:4,border:'0.5px solid #BA7517',background:'#BA751715',color:'#BA7517',cursor:'pointer'}}>↺ Limpiar filtros</button>}
    </div>
    {filtradas.length===0&&fc.length>0&&<div style={{padding:'24px 16px',textAlign:'center',background:'#1A1A1A',border:'0.5px dashed #BA7517',borderRadius:8,marginBottom:10}}>
      <div style={{fontSize:13,color:'#BA7517',marginBottom:8,fontWeight:500}}>Ninguna factura matchea los filtros actuales</div>
      <div style={{fontSize:11,color:'#888',marginBottom:12}}>
        {filtro!=='todas'&&<span>Filtro: <strong>{filtro}</strong> · </span>}
        {busqueda&&<span>Búsqueda: <strong>"{busqueda}"</strong> · </span>}
        Hay {fc.length} facturas en total. Probá limpiar para verlas.
      </div>
      <button onClick={()=>{setFiltro('todas');setBusqueda('')}} style={{fontSize:12,padding:'7px 16px',borderRadius:6,border:'none',background:'#1543F8',color:'#fff',cursor:'pointer',fontWeight:500}}>↺ Limpiar todos los filtros</button>
    </div>}
    <div style={{overflowY:'auto',maxHeight:'calc(100vh - 420px)'}}>
      {filtradas.map((f,i)=>{
        const e=estF(f),bm=bmap[e]||bmap.pendiente,isOpen=abierto===f['N° Presupuesto'],d=diffD(f)
        const bl=e==='vencida'?'Vencida '+Math.abs(d)+'d':e==='reclamar'?'Reclamar! '+Math.abs(d)+'d':e==='por-vencer'?'Vence en '+d+'d':bm.l
        const neto=parseMonto(f['Precio SIN IVA']),iva=parseMonto(f['IVA']),total=parseMonto(f['Precio FINAL'])
        const cobro=cobroData[f['N° Presupuesto']]||{}
        const llego=total-(cobro.retG||0)-(cobro.retI||0)-(cobro.retIV||0)-(cobro.com||0)
        const ivaAFIPf=f['IVA']&&parseMonto(f['IVA'])>0?(iva-(cobro.retIV||0)):0
        const disponible=llego-ivaAFIPf
        const ent=getEntidad(f),entCfg=ENT_FC[ent]||ENT_FC.SRL
        const bord=e==='reclamar'?'3px solid #E24B4A':e==='cobrada'?'3px solid #1D9E75':e==='vencida'?'3px solid #BA7517':'3px solid #2A2A2A'
        return <div key={i} style={{background:'#161616',border:'0.5px solid #2A2A2A',borderLeft:bord,borderRadius:10,marginBottom:8,overflow:'hidden'}}>
          <div style={{display:'grid',gridTemplateColumns:'auto auto 1fr auto auto auto auto auto',gap:10,alignItems:'center',padding:'11px 14px',cursor:'pointer'}} onClick={()=>setAbierto(isOpen?null:f['N° Presupuesto'])}>
            <span style={{fontFamily:'monospace',fontSize:11,color:'#1543F8',whiteSpace:'nowrap'}}>{f['Nro de Factura']||'s/n'}</span>
            <span style={{fontSize:10,padding:'2px 6px',borderRadius:3,whiteSpace:'nowrap',fontWeight:500,background:entCfg.bg,color:entCfg.color}}>{entCfg.label}</span>
            <div style={{minWidth:0}}>
              <div style={{fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f['Proyecto']||f['Cliente']}</div>
              <div style={{fontSize:11,color:'#555',marginTop:1}}>{f['Cliente']}{f['Agencia']?' · '+f['Agencia']:''}{f['Fecha Evento']?' · evento '+f['Fecha Evento']:''} · {isCobrada(f)?'cobrado '+( f['Fecha cobro']||''):'vence '+(f['Vencimiento']||'—')}</div>
            </div>
            <div style={{textAlign:'right',whiteSpace:'nowrap'}}>
              <div style={{fontFamily:'monospace',fontSize:13,fontWeight:500,color:'#1543F8'}}>{fmt(neto)}</div>
              <div style={{fontFamily:'monospace',fontSize:10,color:'#555'}}>{iva>0?'+IVA '+fmt(iva):'Sin IVA'}</div>
            </div>
            <button onClick={e=>{e.stopPropagation();setEnviarF(f)}} title="Enviar factura por mail al cliente" style={{padding:'4px 8px',borderRadius:4,border:'0.5px solid #1543F840',background:'#1543F810',color:'#1543F8',fontSize:10,cursor:'pointer',whiteSpace:'nowrap'}}>✉ Enviar</button>
            {f['Factura']&&String(f['Factura']).startsWith('http')
              ? <a href={f['Factura']} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} title="Ver PDF en Drive" style={{padding:'4px 8px',borderRadius:4,border:'0.5px solid #1D9E7540',background:'#1D9E7510',color:'#1D9E75',fontSize:10,textDecoration:'none',whiteSpace:'nowrap'}}>📄 PDF</a>
              : <label onClick={e=>e.stopPropagation()} title="Subir PDF de la factura" style={{padding:'4px 8px',borderRadius:4,border:'0.5px dashed #BA751740',background:'transparent',color:'#BA7517',fontSize:10,cursor:'pointer',whiteSpace:'nowrap'}}>📎 PDF
                  <input type="file" accept=".pdf,.PDF" style={{display:'none'}} onChange={async e=>{
                    const file=e.target.files?.[0];if(!file)return
                    setToast('Subiendo PDF a Drive...')
                    try{
                      const now=new Date()
                      const fd=new FormData()
                      fd.append('file',file,file.name)
                      fd.append('entidad',ent)
                      fd.append('nroFactura',f['Nro de Factura']||'')
                      fd.append('presupuestoNum',String(f['N° Presupuesto']))
                      const fEv=parseD(f['Fecha emision'])||parseD(f['Fecha Evento'])||now
                      fd.append('mes',String(fEv.getMonth()+1))
                      fd.append('anio',String(fEv.getFullYear()))
                      const r=await fetch('/api/factura-upload',{method:'POST',body:fd})
                      const j=await r.json()
                      if(j.ok){setToast('PDF subido ✓ ('+j.carpeta+')');if(typeof onRefresh==='function')setTimeout(onRefresh,800)}
                      else{setToast('Error: '+(j.error||'?'))}
                      setTimeout(()=>setToast(''),3000)
                    }catch(eu){setToast('Error subiendo: '+eu.message);setTimeout(()=>setToast(''),3000)}
                  }}/>
                </label>
            }
            <span style={{...S.badge,background:bm.bg,color:bm.c,whiteSpace:'nowrap'}}>{bl}</span>
            <span style={{fontSize:11,color:'#555'}}>{isOpen?'▲':'▶'}</span>
          </div>
          {isOpen&&(()=>{
            const yaCob=parseMonto(f['Monto cobrado'])||(isCobrada(f)?total:0)
            const pendiente=Math.max(0,total-yaCob)
            const pctCob=total>0?Math.round(yaCob/total*100):0
            const cobrosFc=cobrosForFc(f['N° Presupuesto'])
            const fpago=f['Forma de pago'],cuenta=f['Cuenta destino'],retG=parseMonto(f['Ret. Ganancias']),retI=parseMonto(f['Ret. IIBB']),retV=parseMonto(f['Ret. IVA']),com=parseMonto(f['Comision banco'])
            const llegoReal=yaCob-retG-retI-retV-com
            const cobrosTabla=cobrosFc.length>0&&<div style={{marginTop:10,background:'#1E1E1E',borderRadius:8,overflow:'hidden'}}>
              <div style={{padding:'7px 10px',background:'#161616',fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'.06em'}}>Historial de cobros ({cobrosFc.length})</div>
              {cobrosFc.map((c,k)=><div key={k} style={{display:'grid',gridTemplateColumns:'auto 1fr auto auto',gap:8,padding:'6px 10px',fontSize:12,borderTop:'0.5px solid #2A2A2A'}}>
                <span style={{color:'#9635AB',textTransform:'uppercase',fontSize:10}}>{c['Tipo']||'—'}</span>
                <span style={{color:'#888',fontSize:11}}>{(c['Timestamp']||'').slice(0,10)} · {c['Cuenta destino']||'—'} · {c['Forma de pago']||''}</span>
                <span style={{fontFamily:'monospace',fontSize:12}}>{fmt(parseMonto(c['Monto']))}</span>
              </div>)}
            </div>;
            if(isCobrada(f))return <div style={{borderTop:'0.5px solid #2A2A2A',padding:'14px 16px',background:'#1D9E7508'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                <div>
                  <div style={{fontSize:11,color:'#1D9E75',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10,fontWeight:500}}>✓ Cobrada el {f['Fecha cobro']||'—'}</div>
                  {[['Forma de pago',fpago||'—'],['Cuenta destino',cuenta||'—'],['Monto cobrado',fmt(yaCob)],['Llego a la cuenta',fmt(llegoReal)]].map(([l,v])=>(
                    <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'0.5px solid #2A2A2A',fontSize:13}}><span style={{color:'#555',fontSize:12}}>{l}</span><span style={{fontFamily:'monospace',fontSize:12}}>{v}</span></div>
                  ))}
                </div>
                <div>
                  <div style={{fontSize:11,color:'#555',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>Retenciones aplicadas</div>
                  {[['Ret. Ganancias',retG],['Ret. IIBB',retI],['Ret. IVA',retV],['Comision banco',com]].map(([l,v])=>(
                    <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'0.5px solid #2A2A2A',fontSize:13}}><span style={{color:'#555',fontSize:12}}>{l}</span><span style={{fontFamily:'monospace',fontSize:12,color:v>0?'#E24B4A':'#555'}}>{v>0?'-'+fmt(v):'$0'}</span></div>
                  ))}
                </div>
              </div>
              {cobrosTabla}
              <div style={{padding:'10px 16px',borderTop:'0.5px solid #2A2A2A',display:'flex',gap:8,justifyContent:'flex-end'}}>
                <button onClick={()=>setEnviarF(f)} style={{padding:'4px 10px',borderRadius:4,border:'0.5px solid #1543F840',background:'#1543F810',color:'#1543F8',fontSize:11,cursor:'pointer'}}>✉ Enviar por mail</button>
                <button onClick={()=>setEditarF(f)} style={{padding:'4px 10px',borderRadius:4,border:'0.5px solid #333',background:'transparent',color:'#888',fontSize:11,cursor:'pointer'}}>✎ Editar datos</button>
                <button onClick={async()=>{
                  const motivo=prompt('Motivo de anulación:');if(motivo===null)return
                  const r=await fetch('/api/factura-anular',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({presupuestoNum:f['N° Presupuesto'],motivo})})
                  const j=await r.json()
                  if(j.ok){setToast('Factura anulada ✓');setTimeout(()=>setToast(''),2500);if(typeof onRefresh==='function')setTimeout(onRefresh,500)}
                  else{alert('Error: '+(j.error||'?'))}
                }} style={{padding:'4px 10px',borderRadius:4,border:'0.5px solid #E24B4A40',background:'transparent',color:'#E24B4A',fontSize:11,cursor:'pointer'}}>⊘ Anular factura</button>
              </div>
            </div>;
            const eCobr=estF(f)
            const sinCuenta=!cobro.cuenta
            const btnDis={opacity:sinCuenta?0.4:1,cursor:sinCuenta?'not-allowed':'pointer'}
            return <div style={{borderTop:'0.5px solid #2A2A2A',display:'grid',gridTemplateColumns:'1fr 1fr',gap:0}}>
              <div style={{padding:'14px 16px',borderRight:'0.5px solid #2A2A2A'}}>
                <div style={{fontSize:11,color:'#555',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>1. Datos del cobro</div>
                <div style={{marginBottom:8}}><div style={{fontSize:11,color:'#555',marginBottom:4}}>Forma de pago</div><select style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontSize:13,outline:'none',marginTop:4}} value={cobro.forma||''} onChange={ev=>setCobroData(prev=>({...prev,[f['N° Presupuesto']]:{...cobro,forma:ev.target.value}}))}>
                  <option value=''>— Seleccionar —</option>{['Transferencia','eCheq','Efectivo'].map(o=><option key={o}>{o}</option>)}</select></div>
                <div style={{marginBottom:8}}><div style={{fontSize:11,color:sinCuenta?'#E24B4A':'#555',marginBottom:4}}>Acreditar en cuenta {sinCuenta&&<span style={{color:'#E24B4A',fontWeight:500}}>· requerido</span>}</div><select style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'0.5px solid '+(sinCuenta?'#E24B4A':'#333'),background:'#1E1E1E',color:'#F0F0F0',fontSize:13,outline:'none',marginTop:4}} value={cobro.cuenta||''} onChange={ev=>setCobroData(prev=>({...prev,[f['N° Presupuesto']]:{...cobro,cuenta:ev.target.value}}))}>
                  <option value=''>— Elegir cuenta —</option>{CUENTAS_FC.map(c=><option key={c}>{c}</option>)}</select></div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  {[['retG','Ret. Ganancias'],['retI','Ret. IIBB'],['retIV','Ret. IVA'],['com','Comision banco']].map(([k,lbl])=>(
                    <div key={k}><div style={{fontSize:11,color:'#555',marginBottom:4}}>{lbl} $</div><input type='number' value={cobro[k]||''} placeholder='0' onChange={ev=>setCobroData(prev=>({...prev,[f['N° Presupuesto']]:{...cobro,[k]:parseFloat(ev.target.value)||0}}))} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontSize:13,outline:'none',fontFamily:'monospace'}}/></div>
                  ))}
                </div>
                {eCobr==='reclamar'&&<div style={{background:'#FCEBEB',borderRadius:8,padding:'10px 12px',marginTop:10}}><div style={{fontSize:10,color:'#A32D2D',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:6}}>Texto para reclamar</div><div style={{fontSize:11,lineHeight:1.6,color:'#A32D2D',marginBottom:8}}>{textoReclamo(f)}</div><button onClick={()=>navigator.clipboard.writeText(textoReclamo(f))} style={{padding:'5px 12px',borderRadius:3,border:'none',background:'#E24B4A',color:'#fff',fontSize:11,cursor:'pointer'}}>Copiar mensaje</button></div>}
              </div>
              <div style={{padding:'14px 16px'}}>
                {yaCob>0&&<div style={{marginBottom:14,padding:'10px 12px',background:'#9635AB10',borderRadius:8,border:'0.5px solid #9635AB30'}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:6,color:'#9635AB',fontWeight:500,textTransform:'uppercase',letterSpacing:'.06em'}}><span>Avance</span><span>{pctCob}%</span></div>
                  <div style={{height:8,background:'#2A2A2A',borderRadius:4,overflow:'hidden',marginBottom:6}}><div style={{height:'100%',width:pctCob+'%',background:'linear-gradient(90deg,#9635AB,#1D9E75)'}}/></div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#888'}}><span>Cobrado: <strong style={{color:'#1D9E75'}}>{fmt(yaCob)}</strong></span><span>Falta: <strong style={{color:'#BA7517'}}>{fmt(pendiente)}</strong></span></div>
                </div>}
                <div style={{fontSize:11,color:'#555',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>{yaCob>0?'2. Próximo cobro':'Liquidacion proyectada'}</div>
                {[['Factura total',fmt(total),null],['− Ret. Ganancias','-'+fmt(cobro.retG||0),'#E24B4A'],['− Ret. IIBB','-'+fmt(cobro.retI||0),'#E24B4A'],['− Ret. IVA','-'+fmt(cobro.retIV||0),'#E24B4A'],['− Comision '+(cobro.forma||''),'-'+fmt(cobro.com||0),'#E24B4A']].map(([l,v,c])=>(
                  <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'0.5px solid #2A2A2A',fontSize:13}}><span style={{color:'#555',fontSize:12}}>{l}</span><span style={{fontFamily:'monospace',fontSize:12,color:c||'inherit'}}>{v}</span></div>
                ))}
                <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderTop:'1px solid #2A2A2A',marginTop:4}}><span style={{fontWeight:500}}>Llegaria a la cuenta</span><span style={{fontFamily:'monospace',fontSize:14,fontWeight:500,color:'#1543F8'}}>{fmt(llego)}</span></div>
                <div style={{marginTop:14,paddingTop:10,borderTop:'0.5px dashed #2A2A2A'}}>
                  <div style={{fontSize:11,color:'#555',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>3. Registrar cobro</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6}}>
                    <button disabled={sinCuenta} onClick={()=>registrarCobro(f,'adelanto')} style={{padding:'8px 6px',borderRadius:6,border:'0.5px solid #BA7517',background:'transparent',color:'#BA7517',fontSize:12,fontWeight:500,...btnDis}}>Adelanto / Seña</button>
                    <button disabled={sinCuenta} onClick={()=>registrarCobro(f,'parcial')} style={{padding:'8px 6px',borderRadius:6,border:'0.5px solid #9635AB',background:'transparent',color:'#9635AB',fontSize:12,fontWeight:500,...btnDis}}>Pago parcial</button>
                    <button disabled={sinCuenta} onClick={()=>registrarCobro(f,'total')} style={{padding:'8px 6px',borderRadius:6,border:'none',background:'#1D9E75',color:'#fff',fontSize:12,fontWeight:500,...btnDis}}>Cobro total</button>
                  </div>
                  {sinCuenta&&<div style={{fontSize:10,color:'#E24B4A',marginTop:6,textAlign:'center'}}>↑ Elegí una cuenta para poder cobrar</div>}
                </div>
                {cobrosTabla}
              </div>
            </div>
          })()}
        </div>
      })}
      {filtradas.length===0&&<div style={S.nd}>Sin facturas</div>}
    </div></>}
    {editarF&&<EditarFacturaModal f={editarF} mail={mail} onClose={()=>setEditarF(null)} onSaved={()=>{setEditarF(null);setToast('Factura actualizada ✓');setTimeout(()=>setToast(''),2500);if(typeof onRefresh==='function')setTimeout(onRefresh,500)}}/>}
    {enviarF&&<EnviarFacturaModal f={enviarF} mail={mail} onClose={()=>setEnviarF(null)}/>}
  </div>
}

function EnviarFacturaModal({f,mail,onClose}){
  const [loading,setLoading]=useState(true)
  const [prep,setPrep]=useState(null),[err,setErr]=useState('')
  const [to,setTo]=useState(''),[cc,setCc]=useState('')
  const [asunto,setAsunto]=useState(''),[cuerpo,setCuerpo]=useState('')
  useEffect(()=>{
    fetch('/api/factura-prep-mail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({presupuestoNum:f['N° Presupuesto']})})
      .then(r=>r.json()).then(j=>{
        if(!j.ok){setErr(j.error||'Error');setLoading(false);return}
        setPrep(j)
        setAsunto(j.asunto||'')
        setCuerpo(j.cuerpo||'')
        if(j.destinatarios?.[0]?.mail)setTo(j.destinatarios[0].mail)
        setLoading(false)
      }).catch(e=>{setErr(e.message);setLoading(false)})
  },[])
  const abrirGmail=()=>{
    const url='https://mail.google.com/mail/?view=cm&fs=1'
      +'&to='+encodeURIComponent(to)
      +(cc?'&cc='+encodeURIComponent(cc):'')
      +'&su='+encodeURIComponent(asunto)
      +'&body='+encodeURIComponent(cuerpo)
    window.open(url,'_blank')
  }
  const copiarCuerpo=()=>{
    navigator.clipboard?.writeText(cuerpo).then(()=>alert('✓ Texto copiado al portapapeles')).catch(()=>alert('No pude copiar — seleccionalo manualmente'))
  }
  const inp={background:'#1E1E1E',border:'0.5px solid #333',borderRadius:6,color:'#F0F0F0',fontSize:12,padding:'7px 10px',outline:'none',width:'100%',fontFamily:'inherit',boxSizing:'border-box'}
  const lbl={fontSize:10,color:'#555',display:'block',marginBottom:3,textTransform:'uppercase',letterSpacing:'.05em'}
  return <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
    <div style={{width:680,maxHeight:'92vh',background:'#0D0D0D',borderRadius:10,border:'0.5px solid #2A2A2A',overflow:'hidden',display:'flex',flexDirection:'column'}}>
      <div style={{padding:'16px 20px',borderBottom:'0.5px solid #2A2A2A',display:'flex',alignItems:'center',gap:10}}>
        <span style={{background:'#1543F820',color:'#1543F8',borderRadius:4,padding:'2px 8px',fontSize:11,fontFamily:'monospace'}}>#{f['N° Presupuesto']}</span>
        <span style={{fontSize:13,fontWeight:500}}>✉ Enviar factura por mail</span>
        <div style={{flex:1}}/>
        <button onClick={onClose} style={{fontSize:18,background:'transparent',border:'none',color:'#555',cursor:'pointer'}}>×</button>
      </div>
      <div style={{padding:20,overflowY:'auto'}}>
        {loading&&<div style={{color:'#888',fontSize:12,textAlign:'center',padding:20}}>Preparando datos...</div>}
        {err&&<div style={{padding:10,background:'#E24B4A15',border:'0.5px solid #E24B4A',borderRadius:6,fontSize:11,color:'#E24B4A'}}>{err}</div>}
        {prep&&<>
          <div style={{fontSize:11,color:'#888',marginBottom:14,padding:'8px 10px',background:'#1A1A1A',borderRadius:6,lineHeight:1.5}}>
            El mail se abre en Gmail desde tu cuenta <strong>{mail}</strong>. Revisalo, adjuntá el PDF si querés, y mandalo.
            {prep.factura.linkPDF&&<div style={{marginTop:4,color:'#1D9E75'}}>📎 El link al PDF en Drive ya está incluido en el cuerpo del mail.</div>}
            {!prep.factura.linkPDF&&<div style={{marginTop:4,color:'#BA7517'}}>⚠ Esta factura no tiene PDF subido. Subilo primero con el botón 📎 PDF en la lista.</div>}
          </div>
          {prep.destinatarios.length>0&&<div style={{marginBottom:12}}>
            <div style={lbl}>Destinatarios sugeridos (click para usar)</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
              {prep.destinatarios.map((d,i)=>(
                <button key={i} onClick={()=>setTo(d.mail)} title={d.match} style={{padding:'4px 10px',borderRadius:4,border:'0.5px solid #2A2A2A',background:to===d.mail?'#1543F820':'transparent',color:to===d.mail?'#1543F8':'#888',fontSize:10,cursor:'pointer'}}>
                  {d.nombre} <span style={{color:'#555'}}>·</span> {d.mail}
                </button>
              ))}
            </div>
          </div>}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
            <label><span style={lbl}>Para *</span><input style={inp} type="email" value={to} onChange={e=>setTo(e.target.value)} placeholder="contacto@cliente.com"/></label>
            <label><span style={lbl}>CC (opcional)</span><input style={inp} value={cc} onChange={e=>setCc(e.target.value)} placeholder="cc@ejemplo.com"/></label>
          </div>
          <label style={{display:'block',marginBottom:10}}><span style={lbl}>Asunto</span><input style={inp} value={asunto} onChange={e=>setAsunto(e.target.value)}/></label>
          <label style={{display:'block'}}><span style={lbl}>Cuerpo del mail</span>
            <textarea style={{...inp,minHeight:280,resize:'vertical',fontFamily:'inherit',lineHeight:1.5}} value={cuerpo} onChange={e=>setCuerpo(e.target.value)}/>
          </label>
          {prep.datosTransfer&&!prep.datosTransfer.cbu&&<div style={{marginTop:8,padding:8,background:'#BA751710',borderRadius:6,fontSize:11,color:'#BA7517'}}>
            ⚠ La cuenta <strong>{prep.datosTransfer.nombre}</strong> no tiene Alias ni CBU cargado en la solapa CUENTAS del Master Magma. Completá esos datos para que aparezcan automáticamente.
          </div>}
        </>}
      </div>
      <div style={{padding:'14px 20px',borderTop:'0.5px solid #2A2A2A',display:'flex',gap:10,justifyContent:'flex-end',flexWrap:'wrap'}}>
        <button onClick={copiarCuerpo} disabled={!cuerpo} style={{padding:'8px 14px',borderRadius:6,border:'0.5px solid #2A2A2A',background:'transparent',color:'#888',fontSize:12,cursor:'pointer'}}>Copiar texto</button>
        <button onClick={onClose} style={{padding:'8px 16px',borderRadius:6,border:'0.5px solid #2A2A2A',background:'transparent',color:'#888',fontSize:12,cursor:'pointer'}}>Cancelar</button>
        <button onClick={abrirGmail} disabled={!to||!asunto} style={{padding:'8px 20px',borderRadius:6,border:'none',background:'linear-gradient(135deg,#1543F8,#CE2637)',color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',opacity:(!to||!asunto)?0.5:1}}>📨 Abrir en Gmail</button>
      </div>
    </div>
  </div>
}

function EditarFacturaModal({f,mail,onClose,onSaved}){
  const [form,setForm]=useState({
    nroFactura: f['Nro de Factura']||'',
    fechaEmision: f['Fecha emision']||'',
    fechaVenc: f['Vencimiento']||'',
    tipoFactura: f['Tipo de Factura']||'',
    plazo: String(f['Plazo']||''),
    cuit: f['CUIT']||'',
    cuenta: f['Cuenta destino']||'',
    notas: f['COMENTARIOS']||'',
  })
  const [saving,setSaving]=useState(false),[err,setErr]=useState('')
  const set=(k,v)=>setForm(p=>({...p,[k]:v}))
  const guardar=async()=>{
    setSaving(true);setErr('')
    const cambios={}
    if(form.nroFactura!==(f['Nro de Factura']||''))cambios['Nro de Factura']=form.nroFactura
    if(form.fechaEmision!==(f['Fecha emision']||''))cambios['Fecha emision']=form.fechaEmision
    if(form.fechaVenc!==(f['Vencimiento']||''))cambios['Vencimiento']=form.fechaVenc
    if(form.tipoFactura!==(f['Tipo de Factura']||''))cambios['Tipo de Factura']=form.tipoFactura
    if(form.plazo!==String(f['Plazo']||''))cambios['Plazo']=form.plazo
    if(form.cuit!==(f['CUIT']||''))cambios['CUIT']=form.cuit
    if(form.cuenta!==(f['Cuenta destino']||''))cambios['Cuenta destino']=form.cuenta
    if(form.notas!==(f['COMENTARIOS']||''))cambios['COMENTARIOS']=form.notas
    if(Object.keys(cambios).length===0){setErr('No hay cambios');setSaving(false);return}
    try{
      const r=await fetch('/api/factura-editar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({presupuestoNum:f['N° Presupuesto'],cambios})})
      const j=await r.json()
      if(!j.ok){setErr(j.error||'Error');setSaving(false);return}
      onSaved()
    }catch(e){setErr(e.message);setSaving(false)}
  }
  const inp={background:'#1E1E1E',border:'0.5px solid #333',borderRadius:6,color:'#F0F0F0',fontSize:12,padding:'7px 10px',outline:'none',width:'100%',fontFamily:'inherit',boxSizing:'border-box'}
  const lbl={fontSize:10,color:'#555',display:'block',marginBottom:3,textTransform:'uppercase',letterSpacing:'.05em'}
  return <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
    <div style={{width:560,background:'#0D0D0D',borderRadius:10,border:'0.5px solid #2A2A2A',overflow:'hidden'}}>
      <div style={{padding:'16px 20px',borderBottom:'0.5px solid #2A2A2A',display:'flex',alignItems:'center',gap:10}}>
        <span style={{background:'#1543F820',color:'#1543F8',borderRadius:4,padding:'2px 8px',fontSize:11,fontFamily:'monospace'}}>Pres #{f['N° Presupuesto']}</span>
        <span style={{fontSize:13,fontWeight:500}}>Editar factura</span>
        <div style={{flex:1}}/>
        <button onClick={onClose} style={{fontSize:18,background:'transparent',border:'none',color:'#555',cursor:'pointer'}}>×</button>
      </div>
      <div style={{padding:20}}>
        <div style={{fontSize:11,color:'#888',marginBottom:14}}>Para corregir errores. Los montos (neto/IVA/total) y datos del cobro NO se editan acá. Para anular usá el botón "⊘ Anular".</div>
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:10,marginBottom:10}}>
          <label><span style={lbl}>N° de Factura</span><input style={inp} value={form.nroFactura} onChange={e=>set('nroFactura',e.target.value)}/></label>
          <label><span style={lbl}>Tipo</span><select style={{...inp,cursor:'pointer'}} value={form.tipoFactura} onChange={e=>set('tipoFactura',e.target.value)}><option value="">—</option><option value="Factura A">Factura A</option><option value="Factura B">Factura B</option><option value="Factura C">Factura C</option><option value="Factura E">Factura E</option></select></label>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 80px',gap:10,marginBottom:10}}>
          <label><span style={lbl}>Fecha emisión</span><input style={inp} value={form.fechaEmision} onChange={e=>set('fechaEmision',e.target.value)} placeholder="DD/MM/YYYY"/></label>
          <label><span style={lbl}>Vencimiento</span><input style={inp} value={form.fechaVenc} onChange={e=>set('fechaVenc',e.target.value)} placeholder="DD/MM/YYYY"/></label>
          <label><span style={lbl}>Plazo</span><input style={inp} value={form.plazo} onChange={e=>set('plazo',e.target.value)} placeholder="30"/></label>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
          <label><span style={lbl}>CUIT cliente</span><input style={inp} value={form.cuit} onChange={e=>set('cuit',e.target.value)}/></label>
          <label><span style={lbl}>Cuenta destino</span><input style={inp} value={form.cuenta} onChange={e=>set('cuenta',e.target.value)}/></label>
        </div>
        <label style={{display:'block'}}><span style={lbl}>Notas / Comentarios</span><textarea style={{...inp,minHeight:60,resize:'vertical'}} value={form.notas} onChange={e=>set('notas',e.target.value)}/></label>
        {err&&<div style={{marginTop:10,padding:8,background:'#E24B4A15',border:'0.5px solid #E24B4A',borderRadius:6,fontSize:11,color:'#E24B4A'}}>{err}</div>}
        <div style={{marginTop:18,padding:12,background:'#E24B4A08',border:'0.5px solid #E24B4A30',borderRadius:6}}>
          <div style={{fontSize:11,color:'#E24B4A',fontWeight:600,marginBottom:6,textTransform:'uppercase',letterSpacing:'.05em'}}>⚠ Zona peligrosa</div>
          <div style={{fontSize:11,color:'#888',marginBottom:8,lineHeight:1.5}}>Si esta factura muestra un cobro o adelanto que NUNCA pasó (típico de migración del histórico), podés resetear todos los datos de cobro y borrar las entradas erróneas de COBROS.</div>
          <button onClick={async()=>{
            const soloMigrados=confirm('¿Borrar SOLO los cobros migrados del histórico?\n\nOK = solo los marcados como migración\nCancelar = TODOS los cobros de esta factura (incluso los reales)')
            const revertirSaldo=confirm('¿También descontar de la cuenta destino los montos a borrar?\n\n(Solo si ya se habían sumado al saldo de alguna cuenta)')
            try{
              const r=await fetch('/api/factura-resetear-cobro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({presupuestoNum:f['N° Presupuesto'],soloMigrados,revertirSaldoCuenta:revertirSaldo})})
              const j=await r.json()
              if(j.ok){alert(`✓ Reseteado. Cobros borrados: ${j.cobrosBorrados}${j.saldoActualizado?'. Cuenta(s) ajustada(s): '+j.saldoActualizado.map(s=>s.cuenta).join(', '):''}`);onSaved()}
              else{alert('Error: '+(j.error||'?'))}
            }catch(e){alert('Error: '+e.message)}
          }} style={{padding:'6px 12px',borderRadius:4,border:'0.5px solid #E24B4A',background:'transparent',color:'#E24B4A',fontSize:11,cursor:'pointer'}}>↺ Resetear cobros de esta factura</button>
        </div>
      </div>
      <div style={{padding:'14px 20px',borderTop:'0.5px solid #2A2A2A',display:'flex',gap:10,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{padding:'8px 16px',borderRadius:6,border:'0.5px solid #2A2A2A',background:'transparent',color:'#888',fontSize:12,cursor:'pointer'}}>Cancelar</button>
        <button onClick={guardar} disabled={saving} style={{padding:'8px 20px',borderRadius:6,border:'none',background:'#1D9E75',color:'#fff',fontSize:12,fontWeight:500,cursor:'pointer',opacity:saving?0.5:1}}>{saving?'Guardando...':'Guardar cambios'}</button>
      </div>
    </div>
  </div>
}

// ---- PAGOS STAFF ----
function PagosStaff({data,mail,onRefresh}){
  const CUENTAS=['SRL — BBVA','Sofia — Galicia','Sofia — Santander','Lucia — Santander','Efectivo']
  const COLORS=['#1543F8','#CE2637','#9635AB','#1D9E75','#BA7517','#E24B4A']
  const getColor=n=>COLORS[n.charCodeAt(0)%COLORS.length]
  const initials=n=>n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
  const normNombre=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim()

  const [mesSel,setMesSel]=useState(null)
  const [abierto,setAbierto]=useState(null)
  const [showDesc,setShowDesc]=useState(null)
  const [editBank,setEditBank]=useState(null)  // nombre persona con banco abierto
  const [bankForm,setBankForm]=useState({})    // {nombre: {cuit, banco, alias, cbu, mail, celular}}
  const [savingBank,setSavingBank]=useState(false)
  const [cuentaLocal,setCuentaLocal]=useState({})
  const [savingPerson,setSavingPerson]=useState(null)
  const [copiado,setCopiado]=useState(null)
  const [busqueda,setBusqueda]=useState('')
  const [filtroEstado,setFiltroEstado]=useState('todos') // todos / pendientes / pagados

  const proyectos=(data.proyectos||[]).filter(p=>p['N° presupuesto'])
  const pagosPersistidos=data.pagosStaff||[]
  const rrhh=data.rrhh||[]

  // Mapeo rápido: nombre normalizado → fila de RRHH (para datos bancarios)
  const rrhhMap = {}
  rrhh.forEach(r => { const k = normNombre(r['Nombre Apellido']); if (k) rrhhMap[k] = r })
  const datosFreelancer = (nombre) => rrhhMap[normNombre(nombre)] || null

  // Copiar al portapapeles (CBU/alias)
  const copiarTexto = (texto, etiqueta) => {
    navigator.clipboard.writeText(String(texto||'').trim()).then(()=>{
      setCopiado(etiqueta); setTimeout(()=>setCopiado(null), 1500)
    })
  }

  // Abre el form de edición bancaria con datos actuales del freelancer
  const abrirEditBank = (nombre) => {
    const d = datosFreelancer(nombre) || {}
    setBankForm(prev => ({...prev, [nombre]: {
      cuit: String(d['CUIT/CUIL']||'').replace(/[^\d]/g,''),
      banco: d['Banco']||'',
      alias: d['Alias']||'',
      cbu: String(d['CBU']||'').replace(/[^\d]/g,''),
      mail: d['Mail']||'',
      celular: d['Celular']||'',
    }}))
    setEditBank(editBank===nombre ? null : nombre)
  }
  const guardarBank = async (nombre) => {
    const f = bankForm[nombre] || {}
    setSavingBank(true)
    try {
      const body = {nombre, cuit:f.cuit, banco:f.banco, alias:f.alias, cbu:f.cbu, mailFreelancer:f.mail, celular:f.celular}
      const r = await fetch('/api/freelancer-upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      const j = await r.json()
      if (j.ok) {
        setEditBank(null)
        if (onRefresh) await onRefresh()
      } else {
        alert('Error: '+(j.error||'?'))
      }
    } catch(e){ alert('Error: '+e.message) }
    setSavingBank(false)
  }

  const MESES_VALIDOS=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']
  const meses=[...new Set(proyectos.map(p=>p['2']||'').filter(m=>m&&MESES_VALIDOS.some(mv=>m.includes(mv))))].sort()
  const mesActual=mesSel||(meses[meses.length-1]||'')

  const proyMes=proyectos.filter(p=>(p['2']||'')=== mesActual)

  const [seleccionados,setSeleccionados]=useState({}) // {personaKey_nro_pedido: true}
  const personas={}
  proyMes.forEach(proy=>{
    const nro=proy['N° presupuesto']||''
    const proyecto=proy['Proyecto']||proy['Cliente']||''
    const agencia=proy['Agencia']||''
    const fechaEvento=proy['Fecha Evento']||''
    for(let j=1;j<=12;j++){
      const pedido=proy['Pedido '+j]||''
      const precio=parseMonto(proy['Precio '+j]||0)
      const staff=proy['Staff '+j]||''
      if(!staff||staff==='Somos Magma'||!pedido||precio<=0)continue
      if(!personas[staff])personas[staff]={nombre:staff,trabajos:[],total:0,totalPendiente:0,totalPagado:0}
      personas[staff].trabajos.push({nro,proyecto,agencia,pedido,precio,fechaEvento,key:nro+'|'+pedido+'|'+j})
      personas[staff].total+=precio
    }
  })
  const findPagoTrabajo=(persona,nro,pedido)=>pagosPersistidos.find(r=>{
    const m=String(r['Mes']||'').trim()
    const p=String(r['Persona']||r['Nombre']||r['Staff']||'').trim()
    const n=String(r['N° Proyecto']||r['N° presupuesto']||r['Nro']||r['Proyecto']||'').trim()
    const pd=String(r['Pedido']||r['Servicio']||'').trim()
    return m===mesActual && p===persona && (n===String(nro).trim() || pd===String(pedido).trim() && n==='')
  })
  const isTrabajoPagado=(persona,t)=>{const r=findPagoTrabajo(persona,t.nro,t.pedido);if(!r)return false;const v=String(r['Pagado']||'').toUpperCase();return v==='SÍ'||v==='SI'||r['Pagado']===true}
  Object.values(personas).forEach(p=>{
    p.trabajos.forEach(t=>{t.pagado=isTrabajoPagado(p.nombre,t);if(t.pagado)p.totalPagado+=t.precio;else p.totalPendiente+=t.precio})
  })
  const lista=Object.values(personas).sort((a,b)=>b.total-a.total)

  const getPersonaPagado=p=>p.trabajos.length>0&&p.trabajos.every(t=>t.pagado)
  const getCuentaPersisted=nombre=>{const r=pagosPersistidos.find(x=>String(x['Persona']||x['Nombre']||x['Staff']||'').trim()===nombre);return r?(r['Cuenta']||''):''}
  const getCuenta=nombre=>cuentaLocal[nombre]||getCuentaPersisted(nombre)||CUENTAS[0]
  const setCuenta=(nombre,val)=>setCuentaLocal(prev=>({...prev,[nombre]:val}))

  const toggleSel=(personaKey,trabajoKey)=>setSeleccionados(prev=>{const k=personaKey+'||'+trabajoKey;return {...prev,[k]:!prev[k]}})
  const isSel=(personaKey,trabajoKey)=>!!seleccionados[personaKey+'||'+trabajoKey]
  const selectAllPendientes=(persona)=>{const p={...seleccionados};persona.trabajos.filter(t=>!t.pagado).forEach(t=>{p[persona.nombre+'||'+t.key]=true});setSeleccionados(p)}
  const clearSelPersona=(persona)=>{const p={...seleccionados};persona.trabajos.forEach(t=>{delete p[persona.nombre+'||'+t.key]});setSeleccionados(p)}

  const marcarSeleccionados=async(persona,pagado=true)=>{
    const trabajosAMarcar=persona.trabajos.filter(t=>pagado?(isSel(persona.nombre,t.key)&&!t.pagado):(t.pagado))
    if(trabajosAMarcar.length===0){alert(pagado?'No hay trabajos seleccionados':'No hay trabajos pagados para desmarcar');return}
    setSavingPerson(persona.nombre)
    try{
      for(const t of trabajosAMarcar){
        await fetch('/api/pago-staff-toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mes:mesActual,persona:persona.nombre,nroProyecto:t.nro,proyecto:t.proyecto,pedido:t.pedido,monto:t.precio,fechaEvento:t.fechaEvento,agencia:t.agencia,pagado,cuenta:getCuenta(persona.nombre)})})
      }
      clearSelPersona(persona)
      if(onRefresh)await onRefresh()
    }catch(e){alert('Error: '+e.message)}
    setSavingPerson(null)
  }

  const generarDesc=(persona,soloPendientes=false)=>{
    const nombre=persona.nombre.split(' ')[0]
    const mesLabel=mesActual.split(' - ')[1]||mesActual
    const trabajos=soloPendientes?persona.trabajos.filter(t=>!t.pagado):persona.trabajos
    const items=trabajos.map(t=>'- '+t.pedido+' — '+t.proyecto+(t.agencia?' ('+t.agencia+')':'')+(t.fechaEvento?' ['+t.fechaEvento+']':'')+': '+fmt(t.precio)).join('\n')
    const total=trabajos.reduce((s,t)=>s+t.precio,0)
    return 'Hola '+nombre+'!\n\nTe paso el detalle de los trabajos de '+mesLabel+' para que nos hagas factura:\n\n'+items+'\n\nTotal: '+fmt(total)+'\n\nCuando tengas la factura lista mandala a admin@somosmagma.com\n\n¡Gracias!'
  }

  const copiar=(nombre,texto)=>{
    navigator.clipboard.writeText(texto).then(()=>{setCopiado(nombre);setTimeout(()=>setCopiado(null),2000)})
  }

  const totalPend=lista.reduce((s,p)=>s+p.totalPendiente,0)
  const totalPag=lista.reduce((s,p)=>s+p.totalPagado,0)
  const personasFullPagadas=lista.filter(p=>getPersonaPagado(p)).length

  // Filtrado: búsqueda por nombre + estado (todos/pendientes/pagados)
  const listaFiltrada = lista.filter(p => {
    if (busqueda && !normNombre(p.nombre).includes(normNombre(busqueda))) return false
    if (filtroEstado === 'pendientes' && p.totalPendiente <= 0) return false
    if (filtroEstado === 'pagados' && !getPersonaPagado(p)) return false
    return true
  })

  return <div>
    {/* Tabs de meses */}
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10,flexWrap:'wrap',gap:8}}>
      <div style={{fontSize:13,fontWeight:500,color:'#555'}}>Pagos staff — se paga el 15 de cada mes</div>
      <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
        {meses.map(m=>{
          const label=m.split(' - ')
          return <button key={m} style={{padding:'5px 11px',borderRadius:6,border:'0.5px solid '+(m===mesActual?'#2A2A2A':'#1E1E1E'),background:m===mesActual?'#1E1E1E':'transparent',color:m===mesActual?'#F0F0F0':'#555',fontSize:11,cursor:'pointer'}} onClick={()=>setMesSel(m)}>
            {label[1]||m}
          </button>
        })}
      </div>
    </div>

    {/* Buscador + filtros */}
    <div style={{display:'flex',gap:8,marginBottom:14,alignItems:'center',flexWrap:'wrap'}}>
      <div style={{position:'relative',flex:'1 1 280px',maxWidth:380}}>
        <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#555',fontSize:13,pointerEvents:'none'}}>🔍</span>
        <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar freelancer (nombre o apellido)" style={{width:'100%',padding:'8px 32px 8px 32px',borderRadius:6,border:'0.5px solid #2A2A2A',background:'#1A1A1A',color:'#F0F0F0',fontSize:12,outline:'none',fontFamily:'inherit',boxSizing:'border-box'}}/>
        {busqueda&&<button onClick={()=>setBusqueda('')} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',background:'transparent',border:'none',color:'#666',cursor:'pointer',fontSize:14,padding:'2px 6px'}}>×</button>}
      </div>
      <div style={{display:'flex',gap:0,borderRadius:6,overflow:'hidden',border:'0.5px solid #2A2A2A'}}>
        {[['todos','Todos',lista.length],['pendientes','Pendientes',lista.filter(p=>p.totalPendiente>0).length],['pagados','Pagados',personasFullPagadas]].map(([v,l,c])=>
          <button key={v} onClick={()=>setFiltroEstado(v)} style={{padding:'7px 12px',background:filtroEstado===v?'#1E1E1E':'transparent',color:filtroEstado===v?'#F0F0F0':'#666',border:'none',fontSize:11,cursor:'pointer',borderRight:v!=='pagados'?'0.5px solid #2A2A2A':'none'}}>{l} <span style={{color:'#555',fontSize:10,marginLeft:3}}>{c}</span></button>
        )}
      </div>
      {listaFiltrada.length<lista.length&&<span style={{fontSize:11,color:'#777'}}>Mostrando {listaFiltrada.length} de {lista.length}</span>}
    </div>

    {/* KPIs */}
    <div style={S.k4}>
      <K lbl='Total a pagar' val={fmtM(totalPend)} sub={lista.filter(p=>p.totalPendiente>0).length+' persona/s · vence el 15'} c='#E24B4A'/>
      <K lbl='Ya pagado' val={fmtM(totalPag)} sub={personasFullPagadas+' de '+lista.length+' personas'} c='#1D9E75'/>
      <K lbl='Total staff mes' val={fmtM(totalPend+totalPag)} sub={lista.length+' personas · '+proyMes.length+' proyectos'}/>
      <K lbl='Ciclo' val='Pago el 15' sub='del mes siguiente'/>
    </div>

    {/* Lista */}
    <div style={{overflowY:'auto',maxHeight:'calc(100vh - 320px)'}}>
      {lista.length===0&&<div style={S.nd}>Sin staff asignado en proyectos de {mesActual||'este mes'}</div>}
      {lista.length>0&&listaFiltrada.length===0&&<div style={S.nd}>Ningún freelancer coincide con "{busqueda}"</div>}
      {listaFiltrada.map((persona,i)=>{
        const fullPagado=getPersonaPagado(persona)
        const isOpen=abierto===persona.nombre
        const isDesc=showDesc===persona.nombre
        const color=getColor(persona.nombre)
        const cuenta=getCuenta(persona.nombre)
        const selCount=persona.trabajos.filter(t=>!t.pagado&&isSel(persona.nombre,t.key)).length
        const selTotal=persona.trabajos.filter(t=>!t.pagado&&isSel(persona.nombre,t.key)).reduce((s,t)=>s+t.precio,0)
        const rank=i+1
        const rankStyle=rank===1?{background:'#FFD70025',color:'#FFD700'}:rank===2?{background:'#C0C0C025',color:'#C0C0C0'}:rank===3?{background:'#CD7F3225',color:'#CD7F32'}:{background:'#2A2A2A',color:'#555'}
        return <div key={i} style={{...S.card,marginBottom:8,borderLeft:'3px solid '+(fullPagado?'#1D9E75':persona.totalPagado>0?'#BA7517':'#2A2A2A'),opacity:fullPagado?0.65:1}}>
          {/* Header persona */}
          <div style={{display:'flex',alignItems:'center',gap:12,padding:'13px 16px',cursor:'pointer'}} onClick={()=>setAbierto(isOpen?null:persona.nombre)}>
            <div style={{width:28,height:28,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:600,flexShrink:0,...rankStyle}} title={`#${rank} en el mes`}>#{rank}</div>
            <div style={{width:36,height:36,borderRadius:'50%',background:color+'20',color:color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:500,flexShrink:0}}>
              {initials(persona.nombre)}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:500}}>{persona.nombre}</div>
              <div style={{fontSize:11,color:'#555',marginTop:2}}>{persona.trabajos.length} trabajo{persona.trabajos.length!==1?'s':''} · {mesActual.split(' - ')[1]||mesActual}{persona.totalPagado>0?' · pagado '+fmt(persona.totalPagado):''}</div>
            </div>
            <span style={{fontFamily:'monospace',fontSize:14,fontWeight:500,color:persona.totalPendiente>0?color:'#1D9E75',whiteSpace:'nowrap'}}>{persona.totalPendiente>0?fmt(persona.totalPendiente)+' pend.':fmt(persona.total)}</span>
            <span style={{fontSize:10,padding:'3px 9px',borderRadius:3,marginLeft:8,whiteSpace:'nowrap',background:fullPagado?'#1D9E7520':persona.totalPagado>0?'#BA751720':'#E24B4A20',color:fullPagado?'#1D9E75':persona.totalPagado>0?'#BA7517':'#E24B4A'}}>{fullPagado?'Pagado':persona.totalPagado>0?'Parcial':'Pendiente'}</span>
            <span style={{fontSize:11,color:'#555',marginLeft:8}}>{isOpen?'▲':'▶'}</span>
          </div>

          {/* Panel detalle */}
          {isOpen&&<div style={{borderTop:'0.5px solid #2A2A2A'}}>
            {/* DATOS BANCARIOS Y CONTACTO */}
            {(() => {
              const fl = datosFreelancer(persona.nombre)
              const isEdit = editBank === persona.nombre
              const form = bankForm[persona.nombre] || {cuit:'',banco:'',alias:'',cbu:'',mail:'',celular:''}
              const setF = (k,v) => setBankForm(prev => ({...prev, [persona.nombre]: {...(prev[persona.nombre]||form), [k]:v}}))
              const cbuClean = String(fl?.['CBU']||'').replace(/[^\d]/g,'')
              const cuitClean = String(fl?.['CUIT/CUIL']||'').replace(/[^\d]/g,'')
              const aliasV = fl?.['Alias']||''
              const bancoV = fl?.['Banco']||''
              const mailV = fl?.['Mail']||''
              const celV = fl?.['Celular']||''
              const tienAlgo = cbuClean || aliasV || cuitClean
              const faltaInfo = !cbuClean || !aliasV
              const inp = {flex:1,minWidth:0,padding:'6px 9px',borderRadius:5,border:'0.5px solid #2A2A2A',background:'#0D0D0D',color:'#F0F0F0',fontSize:11,outline:'none',fontFamily:'inherit'}

              if (isEdit) return <div style={{background:'#0F0F0F',padding:'12px 16px',borderBottom:'0.5px solid #2A2A2A'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                  <span style={{fontSize:11,color:'#1D9E75',textTransform:'uppercase',letterSpacing:'.06em',fontWeight:600}}>{fl ? 'Editar datos bancarios' : 'Cargar freelancer + datos bancarios'}</span>
                  <button onClick={()=>setEditBank(null)} style={{padding:'3px 8px',borderRadius:4,border:'0.5px solid #2A2A2A',background:'transparent',color:'#666',fontSize:11,cursor:'pointer'}}>Cancelar</button>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginBottom:6}}>
                  <input style={inp} placeholder="CUIT (solo números)" value={form.cuit||''} onChange={e=>setF('cuit',e.target.value.replace(/[^\d]/g,''))} maxLength={11}/>
                  <input style={inp} placeholder="Banco" value={form.banco||''} onChange={e=>setF('banco',e.target.value)}/>
                  <input style={inp} placeholder="Alias" value={form.alias||''} onChange={e=>setF('alias',e.target.value)}/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:6,marginBottom:8}}>
                  <input style={inp} placeholder="CBU (22 dígitos)" value={form.cbu||''} onChange={e=>setF('cbu',e.target.value.replace(/[^\d]/g,''))} maxLength={22}/>
                  <input style={inp} placeholder="Mail" value={form.mail||''} onChange={e=>setF('mail',e.target.value)}/>
                  <input style={inp} placeholder="Celular" value={form.celular||''} onChange={e=>setF('celular',e.target.value)}/>
                </div>
                <button disabled={savingBank} onClick={()=>guardarBank(persona.nombre)} style={{padding:'6px 14px',borderRadius:5,border:'none',background:'#1D9E75',color:'#fff',fontSize:11,fontWeight:600,cursor:'pointer',opacity:savingBank?0.5:1}}>{savingBank?'Guardando...':'Guardar en RRHH'}</button>
                {!fl && <span style={{fontSize:10,color:'#888',marginLeft:10}}>Crea ficha nueva en RRHH</span>}
              </div>

              return <div style={{background:faltaInfo?'#BA751708':'#0F0F0F',padding:'10px 16px',borderBottom:'0.5px solid #2A2A2A',display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
                {!fl && <>
                  <span style={{fontSize:11,color:'#E24B4A'}}>⚠ {persona.nombre} no está en RRHH</span>
                  <button onClick={()=>abrirEditBank(persona.nombre)} style={{padding:'4px 10px',borderRadius:4,border:'0.5px solid #1D9E7560',background:'#1D9E7515',color:'#1D9E75',fontSize:11,cursor:'pointer'}}>+ Cargar ficha</button>
                </>}
                {fl && <>
                  {cuitClean && <div onClick={()=>copiarTexto(cuitClean,'cuit-'+i)} style={{cursor:'pointer'}} title="Click para copiar">
                    <span style={{fontSize:9,color:'#666',textTransform:'uppercase',letterSpacing:'.06em',marginRight:4}}>CUIT</span>
                    <span style={{fontSize:11,fontFamily:'monospace',color:'#B0B0B0'}}>{cuitClean}</span>
                    {copiado==='cuit-'+i&&<span style={{fontSize:10,color:'#1D9E75',marginLeft:4}}>✓</span>}
                  </div>}
                  {bancoV && <div><span style={{fontSize:9,color:'#666',textTransform:'uppercase',letterSpacing:'.06em',marginRight:4}}>Banco</span><span style={{fontSize:11,color:'#B0B0B0'}}>{bancoV}</span></div>}
                  {aliasV && <div onClick={()=>copiarTexto(aliasV,'alias-'+i)} style={{cursor:'pointer'}} title="Click para copiar">
                    <span style={{fontSize:9,color:'#666',textTransform:'uppercase',letterSpacing:'.06em',marginRight:4}}>Alias</span>
                    <span style={{fontSize:11,fontFamily:'monospace',color:'#1D9E75'}}>{aliasV}</span>
                    {copiado==='alias-'+i&&<span style={{fontSize:10,color:'#1D9E75',marginLeft:4}}>✓</span>}
                  </div>}
                  {cbuClean && <div onClick={()=>copiarTexto(cbuClean,'cbu-'+i)} style={{cursor:'pointer'}} title="Click para copiar">
                    <span style={{fontSize:9,color:'#666',textTransform:'uppercase',letterSpacing:'.06em',marginRight:4}}>CBU</span>
                    <span style={{fontSize:11,fontFamily:'monospace',color:'#1543F8'}}>{cbuClean}</span>
                    {copiado==='cbu-'+i&&<span style={{fontSize:10,color:'#1D9E75',marginLeft:4}}>✓</span>}
                  </div>}
                  {mailV && <div><span style={{fontSize:9,color:'#666',textTransform:'uppercase',letterSpacing:'.06em',marginRight:4}}>Mail</span><span style={{fontSize:11,color:'#B0B0B0'}}>{mailV}</span></div>}
                  {celV && <div><span style={{fontSize:9,color:'#666',textTransform:'uppercase',letterSpacing:'.06em',marginRight:4}}>Tel</span><span style={{fontSize:11,color:'#B0B0B0'}}>{celV}</span></div>}
                  {!tienAlgo && <span style={{fontSize:11,color:'#BA7517'}}>⚠ Ficha vacía — falta info bancaria</span>}
                  {faltaInfo && tienAlgo && <span style={{fontSize:10,color:'#BA7517'}}>⚠ Falta {!cbuClean?'CBU':''}{!cbuClean&&!aliasV?' y ':''}{!aliasV?'Alias':''}</span>}
                  <button onClick={()=>abrirEditBank(persona.nombre)} style={{marginLeft:'auto',padding:'4px 10px',borderRadius:4,border:'0.5px solid '+(faltaInfo?'#BA7517':'#2A2A2A'),background:faltaInfo?'#BA751715':'transparent',color:faltaInfo?'#BA7517':'#888',fontSize:11,cursor:'pointer'}}>{faltaInfo?'Completar':'Editar'}</button>
                </>}
              </div>
            })()}

            {/* Headers */}
            <div style={{display:'grid',gridTemplateColumns:'32px 1fr 2fr 80px 110px',background:'#1A1A1A'}}>
              {['','Proyecto','Servicio','Fecha','Monto'].map((h,k)=><div key={k} style={{fontSize:10,color:'#555',padding:'7px 10px',textTransform:'uppercase',letterSpacing:'0.06em'}}>{h}</div>)}
            </div>
            {/* Trabajos */}
            {persona.trabajos.map((t,idx)=>{
              const sel=isSel(persona.nombre,t.key)
              return <div key={idx} style={{display:'grid',gridTemplateColumns:'32px 1fr 2fr 80px 110px',borderBottom:'0.5px solid #1A1A1A',opacity:t.pagado?0.5:1,background:sel&&!t.pagado?'#1D9E7510':'transparent'}}>
                <div style={{padding:'9px 10px',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  {t.pagado?<span style={{fontSize:14,color:'#1D9E75'}}>✓</span>
                    :<input type='checkbox' checked={sel} onChange={()=>toggleSel(persona.nombre,t.key)} style={{width:15,height:15,accentColor:'#1D9E75',cursor:'pointer'}}/>}
                </div>
                <div style={{padding:'9px 10px'}}>
                  <div style={{fontSize:12,textDecoration:t.pagado?'line-through':'none'}}>{t.proyecto}</div>
                  <div style={{fontSize:11,color:'#1543F8',fontFamily:'monospace'}}>#{t.nro}{t.agencia?' · '+t.agencia:''}</div>
                </div>
                <div style={{padding:'9px 10px',fontSize:12,color:'#555',display:'flex',alignItems:'center'}}>{t.pedido}</div>
                <div style={{padding:'9px 10px',fontSize:11,color:'#777',display:'flex',alignItems:'center'}}>{t.fechaEvento||'—'}</div>
                <div style={{padding:'9px 10px',fontFamily:'monospace',fontSize:12,fontWeight:500,display:'flex',alignItems:'center',justifyContent:'flex-end',textDecoration:t.pagado?'line-through':'none'}}>{fmt(t.precio)}</div>
              </div>
            })}

            {/* Panel acción */}
            <div style={{padding:'12px 16px',background:'#1A1A1A',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <div style={{display:'flex',gap:4}}>
                <button style={{padding:'5px 10px',borderRadius:6,border:'0.5px solid #2A2A2A',background:'transparent',color:'#888',fontSize:11,cursor:'pointer'}} onClick={()=>selectAllPendientes(persona)}>Seleccionar todos</button>
                <button style={{padding:'5px 10px',borderRadius:6,border:'0.5px solid #2A2A2A',background:'transparent',color:'#888',fontSize:11,cursor:'pointer'}} onClick={()=>clearSelPersona(persona)}>Limpiar</button>
              </div>
              <span style={{fontSize:12,color:'#555',whiteSpace:'nowrap'}}>Pagar desde:</span>
              <select style={{padding:'6px 10px',borderRadius:6,border:'0.5px solid #333',background:'#0D0D0D',color:'#F0F0F0',fontSize:12,outline:'none'}} value={cuenta} onChange={e=>setCuenta(persona.nombre,e.target.value)}>
                {CUENTAS.map(c=><option key={c}>{c}</option>)}
              </select>
              <button style={{padding:'6px 12px',borderRadius:6,border:'0.5px solid #2A2A2A',background:'transparent',color:'#555',fontSize:12,cursor:'pointer'}} onClick={()=>setShowDesc(isDesc?null:persona.nombre)}>
                {isDesc?'Ocultar descripción':'Ver descripción para factura'}
              </button>
              <div style={{marginLeft:'auto',display:'flex',gap:6,alignItems:'center'}}>
                {persona.totalPagado>0&&<button disabled={savingPerson===persona.nombre} style={{padding:'6px 12px',borderRadius:6,border:'0.5px solid #BA7517',background:'transparent',color:'#BA7517',fontSize:11,cursor:'pointer',opacity:savingPerson===persona.nombre?0.5:1}} onClick={()=>marcarSeleccionados(persona,false)}>Desmarcar pagados</button>}
                <button disabled={savingPerson===persona.nombre||selCount===0} style={{padding:'8px 16px',borderRadius:6,border:'none',background:selCount>0?'#1D9E75':'#2A2A2A',color:selCount>0?'#fff':'#555',fontSize:13,fontWeight:500,cursor:selCount>0?'pointer':'default',opacity:savingPerson===persona.nombre?0.5:1}} onClick={()=>marcarSeleccionados(persona,true)}>
                  {savingPerson===persona.nombre?'Marcando...':(selCount>0?'Pagar '+selCount+' ('+fmt(selTotal)+')':'Marcar pagado ✓')}
                </button>
              </div>
            </div>

            {/* Descripción para factura */}
            {isDesc&&<div style={{padding:'12px 16px',borderTop:'0.5px solid #2A2A2A'}}>
              <div style={{fontSize:11,color:'#555',marginBottom:8}}>Texto para enviarle a {persona.nombre.split(' ')[0]} (solo pendientes):</div>
              <div style={{background:'#1A1A1A',border:'0.5px solid #2A2A2A',borderRadius:8,padding:'12px 14px',fontSize:12,lineHeight:1.6,fontFamily:'monospace',color:'#F0F0F0',whiteSpace:'pre-wrap',marginBottom:10}}>
                {generarDesc(persona,true)}
              </div>
              <button style={{padding:'6px 14px',borderRadius:6,border:'0.5px solid #2A2A2A',background:'transparent',color:'#1543F8',fontSize:12,cursor:'pointer'}} onClick={()=>copiar(persona.nombre,generarDesc(persona,true))}>
                {copiado===persona.nombre?'¡Copiado! ✓':'Copiar mensaje'}
              </button>
            </div>}
          </div>}
        </div>
      })}
    </div>
  </div>
}
// ---- BALANCE ----
const SU_DEFAULTS=[{n:'Juan Martin',b:3000000},{n:'Sofia',b:3000000},{n:'Lulu',b:1300000},{n:'Dani',b:1900000},{n:'Tomi',b:1300000},{n:'Contador',b:453750}]
const GF_DEFAULTS=[{n:'Alquiler oficina',m:1000000},{n:'Expensas',m:54674},{n:'ABL',m:11793},{n:'Edenor',m:7004},{n:'Metrogas',m:0},{n:'CM',m:1023000}]

// ---- EGRESOS (gastos fijos / tarjetas / préstamos) ----
function Egresos({data,mail,onRefresh}){
  const MESES=['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']
  const hoy=new Date()
  const [mesNum,setMesNum]=useState(hoy.getMonth()+1)
  const [anio,setAnio]=useState(String(hoy.getFullYear()))
  const [saving,setSaving]=useState(null)
  const [toast,setToast]=useState('')
  // Upload PDF tarjeta
  const [uploadOpen,setUploadOpen]=useState(false)
  const [uploading,setUploading]=useState(false)
  const [previewData,setPreviewData]=useState(null)
  const [pdfFileName,setPdfFileName]=useState('')

  const gastosFijos=data.gastosFijos||[]
  const tarjetas=data.tarjetas||[]
  const prestamos=data.prestamos||[]
  const fc=data.facturacion||[]
  const cuentas=data.cuentas||[]
  const cuentasNombres=cuentas.filter(c=>String(c['Activa']||'').toUpperCase().match(/SI|SÍ|TRUE/)).map(c=>c['Nombre']).filter(Boolean)

  const isPagado=v=>String(v||'').toUpperCase().match(/SI|SÍ|TRUE|OK/)
  const parseD=s=>{if(!s)return null;const p=String(s).split('/');if(p.length===3)return new Date(+p[2],+p[1]-1,+p[0]);return null}

  // Filtrar gastos fijos del mes seleccionado: usamos los activos (Mes carga puede ser referencia, pero tomamos todos los activos)
  const gfActivos=gastosFijos.filter(g=>{
    const activo=String(g['Activo']||'').toUpperCase().match(/SI|SÍ|TRUE/)
    if(!activo)return false
    return true
  })
  const gfPorCat={}
  gfActivos.forEach(g=>{const c=g['Categoria']||'Otros';if(!gfPorCat[c])gfPorCat[c]=[];gfPorCat[c].push(g)})

  // Tarjetas del mes/año
  const tarjMes=tarjetas.filter(t=>String(t['Mes'])===String(mesNum)&&String(t['Año'])===String(anio))
  // Préstamos con vencimiento en mes/año
  const prestMes=prestamos.filter(p=>{const d=parseD(p['Vencimiento']);return d&&d.getMonth()+1===mesNum&&d.getFullYear()===Number(anio)})

  // Totales
  const sumActivos=arr=>arr.reduce((s,r)=>s+parseMonto(r['Monto']||r['Monto cuota']),0)
  const sumPagados=arr=>arr.filter(r=>isPagado(r['Pagado'])).reduce((s,r)=>s+parseMonto(r['Monto']||r['Monto cuota']),0)
  const totalSueldos=sumActivos(gfPorCat['Sueldos']||[])
  const totalImpuestos=sumActivos(gfPorCat['Impuestos']||[])
  const totalOperativos=sumActivos(gfPorCat['Operativos']||[])
  const totalTarjetas=sumActivos(tarjMes)
  const totalPrestamos=sumActivos(prestMes)
  const totalEgresos=totalSueldos+totalImpuestos+totalOperativos+totalTarjetas+totalPrestamos

  // Ingresos cobrados del mes
  const facMesCob=fc.filter(f=>{const d=parseD(f['Fecha cobro']);return d&&d.getMonth()+1===mesNum&&d.getFullYear()===Number(anio)})
  const ingresos=facMesCob.reduce((s,f)=>s+parseMonto(f['Precio SIN IVA']),0)
  const resultado=ingresos-totalEgresos

  // Encontrar índice de fila en el sheet (1-based, +1 por header)
  const findFila=(arr,item)=>{const i=arr.indexOf(item);return i>=0?i+2:null}

  const togglePagado=async(hoja,arrFuente,item,extras={})=>{
    const fila=findFila(arrFuente,item)
    if(!fila){setToast('No encuentro la fila');return}
    const nuevoPagado=!isPagado(item['Pagado'])
    setSaving(`${hoja}-${fila}`)
    try{
      const r=await fetch('/api/egreso-toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        hoja,fila,pagado:nuevoPagado,tipoPago:'total',
        fechaPago:nuevoPagado?(hoy.getDate()+'/'+(hoy.getMonth()+1)+'/'+hoy.getFullYear()):'',
        ...extras,
      })}).then(r=>r.json())
      setToast(nuevoPagado?`Pagado ${fmt(r.pagoEvento||0)} ${extras.cuentaPago?'desde '+extras.cuentaPago:''}`:'Marcado pendiente')
      setTimeout(()=>setToast(''),3000)
      if(typeof onRefresh==='function')await onRefresh()
    }catch(e){setToast('Error: '+e.message)}
    setSaving(null)
  }

  const pagoParcial=async(hoja,arrFuente,item)=>{
    const fila=findFila(arrFuente,item);if(!fila)return
    const cuenta=item['Cuenta pago']
    if(!cuenta){setToast('Elegí cuenta de pago primero');return}
    const tipoH=hoja==='PRESTAMOS'?'Monto cuota':'Monto'
    const total=parseMonto(item[tipoH])
    const yaPagado=parseMonto(item['Monto pagado'])
    const pendiente=Math.max(0,total-yaPagado)
    const m=prompt(`Monto del pago parcial (pendiente: ${fmt(pendiente)})`,String(pendiente))
    if(!m)return
    const montoNum=parseFloat(m);if(!montoNum||montoNum<=0){setToast('Monto invalido');return}
    setSaving(`${hoja}-${fila}-pp`)
    try{
      const r=await fetch('/api/egreso-toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        hoja,fila,tipoPago:'parcial',montoParcial:montoNum,cuentaPago:cuenta,
        fechaPago:hoy.getDate()+'/'+(hoy.getMonth()+1)+'/'+hoy.getFullYear(),
      })}).then(r=>r.json())
      const partes=[`-${fmt(montoNum)} de ${cuenta}`]
      if(r.completado)partes.push('PAGO COMPLETO')
      else partes.push(`acum ${fmt(r.acumulado)}/${fmt(total)}`)
      setToast(partes.join(' · '))
      setTimeout(()=>setToast(''),4000)
      if(typeof onRefresh==='function')await onRefresh()
    }catch(e){setToast('Error: '+e.message)}
    setSaving(null)
  }

  const cambiarCuenta=async(hoja,arrFuente,item,nuevaCuenta)=>{
    const fila=findFila(arrFuente,item);if(!fila)return
    setSaving(`${hoja}-${fila}-cta`)
    try{
      await fetch('/api/egreso-toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hoja,fila,cuentaPago:nuevaCuenta})})
      if(typeof onRefresh==='function')await onRefresh()
    }catch(e){setToast('Error: '+e.message)}
    setSaving(null)
  }

  const procesarPDF=async(file)=>{
    if(!file)return
    setUploading(true);setPreviewData(null);setPdfFileName(file.name)
    try{
      const buf=await file.arrayBuffer()
      const bytes=new Uint8Array(buf)
      let bin='';for(let i=0;i<bytes.byteLength;i++)bin+=String.fromCharCode(bytes[i])
      const b64=btoa(bin)
      const r=await fetch('/api/tarjeta-procesar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pdfBase64:b64,fileName:file.name})}).then(r=>r.json())
      if(r.error){setToast('Error: '+r.error);setUploading(false);return}
      // Pre-llenar datos editables con default mes/año
      const d=r.data
      setPreviewData({
        tarjeta:d.tarjeta||'',
        mes:String(mesNum),
        anio:anio,
        movimientos:(d.movimientos||[]).map((m,i)=>({...m,_keep:true,_idx:i})),
        meta:{titular:d.titular,periodo:d.periodo,vencimiento:d.vencimiento,total_ars:d.total_ars,total_usd:d.total_usd},
      })
      setToast(`Extraídos ${d.movimientos?.length||0} movimientos`)
      setTimeout(()=>setToast(''),3000)
    }catch(e){setToast('Error al procesar PDF: '+e.message)}
    setUploading(false)
  }

  const guardarMovs=async()=>{
    if(!previewData)return
    const movs=previewData.movimientos.filter(m=>m._keep)
    if(movs.length===0){setToast('No hay movimientos para guardar');return}
    setUploading(true)
    try{
      const r=await fetch('/api/tarjeta-guardar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tarjeta:previewData.tarjeta,mes:Number(previewData.mes),anio:Number(previewData.anio),movimientos:movs})}).then(r=>r.json())
      if(r.error){setToast('Error: '+r.error);setUploading(false);return}
      setToast(`Guardados ${r.guardados} movimientos en ${previewData.tarjeta}`)
      setTimeout(()=>setToast(''),4000)
      setPreviewData(null);setUploadOpen(false);setPdfFileName('')
      if(typeof onRefresh==='function')await onRefresh()
    }catch(e){setToast('Error: '+e.message)}
    setUploading(false)
  }

  const updateMov=(idx,campo,val)=>{
    setPreviewData(p=>({...p,movimientos:p.movimientos.map(m=>m._idx===idx?{...m,[campo]:val}:m)}))
  }

  const SEC=({titulo,items,hoja,arrFuente,color,renderExtra})=>(<div style={{...S.card,marginBottom:10}}>
    <div style={{...S.ch,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <span>{titulo} <span style={{color:'#555',fontWeight:400,fontSize:11,marginLeft:8}}>{items.length} items</span></span>
      <span style={{fontFamily:'monospace',fontSize:13,color}}>{fmt(sumActivos(items))} <span style={{fontSize:10,color:'#555'}}>· pagado {fmt(sumPagados(items))}</span></span>
    </div>
    {items.length===0?<div style={{padding:'12px 16px',color:'#555',fontSize:12}}>Sin items</div>:items.map((it,i)=>{
      const pag=isPagado(it['Pagado'])
      const fila=findFila(arrFuente,it)
      const monto=parseMonto(it['Monto']||it['Monto cuota'])
      const yaPagado=parseMonto(it['Monto pagado'])
      const pendiente=Math.max(0,monto-yaPagado)
      const tieneParcial=yaPagado>0&&!pag
      const cuenta=it['Cuenta pago']||''
      const isSaving=saving===`${hoja}-${fila}`||saving===`${hoja}-${fila}-cta`||saving===`${hoja}-${fila}-pp`
      const permiteParcial=hoja==='TARJETAS'||hoja==='PRESTAMOS'
      return <div key={i} style={{padding:'8px 14px',borderTop:'0.5px solid #2A2A2A',opacity:pag?0.6:1,fontSize:12}}>
        <div style={{display:'grid',gridTemplateColumns:'auto 1fr auto auto auto auto auto',gap:10,alignItems:'center'}}>
          <input type='checkbox' checked={pag} disabled={isSaving} onChange={()=>togglePagado(hoja,arrFuente,it,{cuentaPago:cuenta})} style={{accentColor:'#1D9E75'}}/>
          <div style={{minWidth:0}}>
            <div style={{fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{renderExtra?renderExtra(it):(it['Concepto']||it['Tarjeta']||it['Prestamo'])}</div>
            {(it['Vencimiento']||it['Dia pago'])&&<div style={{fontSize:10,color:'#555'}}>{it['Vencimiento']?'vto '+it['Vencimiento']:'dia '+it['Dia pago']}{it['Moneda']&&it['Moneda']!=='ARS'?' · '+it['Moneda']:''}</div>}
          </div>
          <select value={cuenta} disabled={pag||isSaving} onChange={e=>cambiarCuenta(hoja,arrFuente,it,e.target.value)} style={{padding:'4px 6px',borderRadius:4,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontSize:11,minWidth:110}}>
            <option value=''>— cuenta —</option>
            {cuentasNombres.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <span style={{fontFamily:'monospace',fontSize:13,minWidth:90,textAlign:'right'}}>{fmt(monto)}</span>
          {permiteParcial&&!pag&&<button onClick={()=>pagoParcial(hoja,arrFuente,it)} disabled={isSaving} style={{padding:'3px 8px',borderRadius:4,border:'0.5px solid #9635AB',background:'transparent',color:'#9635AB',fontSize:10,cursor:'pointer'}}>Parcial</button>}
          <span style={{...S.badge,background:pag?'#1D9E7520':(tieneParcial?'#9635AB20':'#BA751720'),color:pag?'#1D9E75':(tieneParcial?'#9635AB':'#BA7517'),fontSize:10}}>{pag?'PAGADO':(tieneParcial?'PARCIAL':'PEND')}</span>
          <span style={{fontSize:10,color:'#555',minWidth:40}}>{isSaving?'...':(pag?(it['Fecha pago']||''):'')}</span>
        </div>
        {tieneParcial&&<div style={{marginTop:4,marginLeft:30,padding:'4px 8px',background:'#9635AB10',borderRadius:4,fontSize:10,color:'#9635AB'}}>Pagado {fmt(yaPagado)} / {fmt(monto)} · falta {fmt(pendiente)}</div>}
      </div>
    })}
  </div>)

  const anios=['2026','2027']
  return <div>
    {toast&&<div style={{position:'fixed',bottom:20,right:20,background:'#1D9E75',color:'#fff',padding:'8px 16px',borderRadius:8,fontSize:12,fontWeight:500,zIndex:999}}>{toast}</div>}
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:10}}>
      <div style={{display:'flex',gap:4,flexWrap:'wrap',alignItems:'center'}}>
        {MESES.map((m,i)=><button key={m} style={{...S.fb,...(mesNum===i+1?S.fa:{})}} onClick={()=>setMesNum(i+1)}>{m}</button>)}
        <select value={anio} onChange={e=>setAnio(e.target.value)} style={{padding:'5px 10px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontSize:11,outline:'none',marginLeft:6}}>
          {anios.map(a=><option key={a}>{a}</option>)}
        </select>
      </div>
      <button onClick={()=>setUploadOpen(!uploadOpen)} style={{padding:'7px 14px',borderRadius:6,border:'0.5px solid #1543F8',background:uploadOpen?'#1543F8':'transparent',color:uploadOpen?'#fff':'#1543F8',fontSize:12,fontWeight:500,cursor:'pointer'}}>📄 {uploadOpen?'Cerrar':'Subir resumen tarjeta PDF'}</button>
    </div>
    {uploadOpen&&<div style={{...S.card,padding:'14px 18px',marginBottom:12,border:'0.5px solid #1543F840'}}>
      <div style={{fontSize:11,color:'#1543F8',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8,fontWeight:500}}>Subir resumen de tarjeta</div>
      {!previewData&&<div>
        <div style={{fontSize:12,color:'#888',marginBottom:10,lineHeight:1.5}}>Subí el PDF del resumen de Master / Visa / Amex. Lo proceso con IA, extraigo todos los movimientos, los categorizo y vos confirmás antes de guardarlos en la hoja MOVIMIENTOS_TARJETA.</div>
        <input type='file' accept='.pdf' disabled={uploading} onChange={e=>procesarPDF(e.target.files?.[0])} style={{padding:8,border:'0.5px dashed #333',borderRadius:6,background:'#1E1E1E',color:'#F0F0F0',fontSize:12,width:'100%',cursor:'pointer'}}/>
        {uploading&&<div style={{marginTop:10,fontSize:12,color:'#1543F8'}}>Procesando "{pdfFileName}"... esto puede tardar 30-60s para PDFs grandes.</div>}
      </div>}
      {previewData&&<div>
        <div style={{display:'grid',gridTemplateColumns:'auto 1fr 1fr 1fr 1fr',gap:10,marginBottom:10,padding:'10px 12px',background:'#1E1E1E',borderRadius:8,fontSize:12}}>
          <div><div style={{fontSize:10,color:'#555'}}>Tarjeta</div><select value={previewData.tarjeta} onChange={e=>setPreviewData(p=>({...p,tarjeta:e.target.value}))} style={{padding:'4px 6px',borderRadius:4,border:'0.5px solid #333',background:'#161616',color:'#F0F0F0',fontSize:12}}>
            {['Master','Santander Visa','Amex','Visa','Otra'].map(t=><option key={t}>{t}</option>)}
          </select></div>
          <div><div style={{fontSize:10,color:'#555'}}>Mes</div><input type='number' min='1' max='12' value={previewData.mes} onChange={e=>setPreviewData(p=>({...p,mes:e.target.value}))} style={{padding:'4px 6px',borderRadius:4,border:'0.5px solid #333',background:'#161616',color:'#F0F0F0',fontSize:12,width:60}}/></div>
          <div><div style={{fontSize:10,color:'#555'}}>Año</div><input value={previewData.anio} onChange={e=>setPreviewData(p=>({...p,anio:e.target.value}))} style={{padding:'4px 6px',borderRadius:4,border:'0.5px solid #333',background:'#161616',color:'#F0F0F0',fontSize:12,width:80}}/></div>
          <div><div style={{fontSize:10,color:'#555'}}>Total ARS</div><div style={{fontFamily:'monospace',fontSize:13,color:'#1D9E75'}}>{fmt(previewData.meta?.total_ars||0)}</div></div>
          <div><div style={{fontSize:10,color:'#555'}}>Total USD</div><div style={{fontFamily:'monospace',fontSize:13,color:'#1D9E75'}}>{previewData.meta?.total_usd?'US$'+previewData.meta.total_usd:'—'}</div></div>
        </div>
        <div style={{fontSize:11,color:'#555',marginBottom:6}}>Revisá y editá los movimientos. Destildá los que no quieras guardar.</div>
        <div style={{maxHeight:'50vh',overflowY:'auto',border:'0.5px solid #2A2A2A',borderRadius:8}}>
          <div style={{display:'grid',gridTemplateColumns:'30px 80px 1fr 60px 100px 150px',gap:6,padding:'6px 8px',background:'#1A1A1A',fontSize:10,color:'#555',textTransform:'uppercase',position:'sticky',top:0}}>
            <span></span><span>Fecha</span><span>Comercio / Descripción</span><span>Mon</span><span style={{textAlign:'right'}}>Monto</span><span>Categoria</span>
          </div>
          {previewData.movimientos.map(m=>(
            <div key={m._idx} style={{display:'grid',gridTemplateColumns:'30px 80px 1fr 60px 100px 150px',gap:6,padding:'5px 8px',borderTop:'0.5px solid #2A2A2A',fontSize:11,alignItems:'center',opacity:m._keep?1:0.4}}>
              <input type='checkbox' checked={m._keep} onChange={e=>updateMov(m._idx,'_keep',e.target.checked)} style={{accentColor:'#1D9E75'}}/>
              <input value={m.fecha||''} onChange={e=>updateMov(m._idx,'fecha',e.target.value)} style={{padding:'2px 4px',borderRadius:3,border:'0.5px solid #333',background:'#161616',color:'#F0F0F0',fontSize:10,fontFamily:'monospace',width:'100%'}}/>
              <input value={m.comercio||m.descripcion||''} onChange={e=>updateMov(m._idx,'comercio',e.target.value)} style={{padding:'2px 4px',borderRadius:3,border:'0.5px solid #333',background:'#161616',color:'#F0F0F0',fontSize:11,width:'100%'}}/>
              <select value={m.moneda||'ARS'} onChange={e=>updateMov(m._idx,'moneda',e.target.value)} style={{padding:'2px 4px',borderRadius:3,border:'0.5px solid #333',background:'#161616',color:'#F0F0F0',fontSize:10}}><option>ARS</option><option>USD</option></select>
              <input type='number' value={m.monto||0} onChange={e=>updateMov(m._idx,'monto',parseFloat(e.target.value)||0)} style={{padding:'2px 4px',borderRadius:3,border:'0.5px solid #333',background:'#161616',color:'#F0F0F0',fontSize:11,fontFamily:'monospace',textAlign:'right',width:'100%'}}/>
              <select value={m.categoria||'Otros'} onChange={e=>updateMov(m._idx,'categoria',e.target.value)} style={{padding:'2px 4px',borderRadius:3,border:'0.5px solid #333',background:'#161616',color:'#F0F0F0',fontSize:11}}>
                {['Comida y bebida','Transporte','Viajes','Suscripciones','Producción audiovisual','Profesional/Servicios','Equipos/Tecnología','Personal','Pagos/Transferencias','Cargos bancarios','Otros'].map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div style={{display:'flex',gap:8,marginTop:10}}>
          <button onClick={()=>{setPreviewData(null);setPdfFileName('')}} style={{padding:'8px 14px',borderRadius:6,border:'0.5px solid #333',background:'transparent',color:'#888',fontSize:12,cursor:'pointer'}}>Descartar</button>
          <button onClick={guardarMovs} disabled={uploading} style={{padding:'8px 18px',borderRadius:6,border:'none',background:'#1D9E75',color:'#fff',fontSize:12,fontWeight:500,cursor:'pointer',opacity:uploading?0.5:1,marginLeft:'auto'}}>
            {uploading?'Guardando...':`Guardar ${previewData.movimientos.filter(m=>m._keep).length} movimientos`}
          </button>
        </div>
      </div>}
    </div>}
    <div style={S.k4}>
      <K lbl='Ingresos cobrados' val={fmtM(ingresos)} sub={facMesCob.length+' facturas'} c='#1D9E75'/>
      <K lbl='Total a pagar' val={'-'+fmtM(totalEgresos)} sub='sueldos+imp+oper+tarj+prest' c='#E24B4A'/>
      <K lbl='Pagado' val={fmtM(sumPagados(gfActivos)+sumPagados(tarjMes)+sumPagados(prestMes))} sub={`${[...gfActivos,...tarjMes,...prestMes].filter(r=>isPagado(r['Pagado'])).length} items`} c='#1D9E75'/>
      <K lbl='Resultado' val={fmtM(resultado)} c={resultado>=0?'#1D9E75':'#E24B4A'}/>
    </div>
    <SEC titulo='Sueldos equipo' items={gfPorCat['Sueldos']||[]} hoja='GASTOS_FIJOS' arrFuente={gastosFijos} color='#E24B4A'/>
    <SEC titulo='Impuestos / Monotributos / IIBB' items={gfPorCat['Impuestos']||[]} hoja='GASTOS_FIJOS' arrFuente={gastosFijos} color='#9635AB'/>
    <SEC titulo='Operativos (alquiler, servicios, suscripciones)' items={gfPorCat['Operativos']||[]} hoja='GASTOS_FIJOS' arrFuente={gastosFijos} color='#BA7517'/>
    <TarjetasPorPersona items={tarjMes} arrFuente={tarjetas} mesNum={mesNum} anio={anio} mesesNombres={MESES} cuentasNombres={cuentasNombres} mail={mail} onRefresh={onRefresh} saving={saving} setSaving={setSaving} setToast={setToast} findFila={findFila} togglePagado={togglePagado} cambiarCuenta={cambiarCuenta} pagoParcial={pagoParcial}/>
    <SEC titulo={`Préstamos (vto ${MESES[mesNum-1]} ${anio})`} items={prestMes} hoja='PRESTAMOS' arrFuente={prestamos} color='#9635AB' renderExtra={p=>`${p['Prestamo']} cuota ${p['Cuota nro']}/${p['Cuotas total']}`}/>
    <MovimientosTarjeta data={data} mail={mail} mesNum={mesNum} anio={anio} onRefresh={onRefresh}/>
    <div style={{...S.card,padding:'14px 18px',marginTop:12}}>
      <div style={{fontSize:12,color:'#555',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10,fontWeight:500}}>Resumen del mes</div>
      {[['Ingresos cobrados',ingresos,'#1D9E75','+'],['Sueldos',totalSueldos,'#E24B4A','-'],['Impuestos',totalImpuestos,'#9635AB','-'],['Operativos',totalOperativos,'#BA7517','-'],['Tarjetas',totalTarjetas,'#1543F8','-'],['Préstamos',totalPrestamos,'#9635AB','-'],['Resultado',resultado,resultado>=0?'#1D9E75':'#E24B4A',resultado>=0?'+':'']].map(([l,v,c,s])=>(
        <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'0.5px solid #2A2A2A',fontSize:13}}><span style={{color:'#555',fontSize:12}}>{l}</span><span style={{fontFamily:'monospace',fontSize:l==='Resultado'?14:12,color:c,fontWeight:l==='Resultado'?600:400}}>{s}{fmt(Math.abs(v))}</span></div>
      ))}
    </div>
    <div style={{fontSize:10,color:'#555',marginTop:12,textAlign:'center'}}>Para cargar nuevos gastos / tarjetas / préstamos: editá las hojas GASTOS_FIJOS, TARJETAS, PRESTAMOS del Sheet (después agregamos UI para crearlos desde acá)</div>
  </div>
}

// ---- Tarjetas agrupadas por persona (Magma / Juan / Sofi) ----
function TarjetasPorPersona({items,arrFuente,mesNum,anio,mesesNombres,cuentasNombres,mail,onRefresh,saving,setSaving,setToast,findFila,togglePagado,cambiarCuenta,pagoParcial}){
  const [openP,setOpenP]=useState({Magma:true,Juan:true,Sofi:true})
  const isPagado=v=>String(v||'').toUpperCase().match(/SI|SÍ|TRUE|OK/)
  const PERSONAS=['Magma','Juan','Sofi']
  const COLOR={Magma:'#1543F8',Juan:'#1D9E75',Sofi:'#9635AB'}
  const ICON={Magma:'🟡',Juan:'👨',Sofi:'👩'}

  // Agrupar por persona
  const porPersona={}
  PERSONAS.forEach(p=>porPersona[p]=[])
  items.forEach(t=>{
    const p=t['Persona']||'Magma'
    if(!porPersona[p])porPersona[p]=[]
    porPersona[p].push(t)
  })
  // Otras personas no contempladas
  Object.keys(porPersona).forEach(p=>{if(!PERSONAS.includes(p))PERSONAS.push(p)})

  const sumARS=arr=>arr.reduce((s,t)=>s+parseMonto(t['Monto']),0)
  const sumUSD=arr=>arr.reduce((s,t)=>s+parseMonto(t['Monto USD']),0)
  const sumPagARS=arr=>arr.filter(t=>isPagado(t['Pagado'])).reduce((s,t)=>s+parseMonto(t['Monto']),0)

  return <div style={{...S.card,marginBottom:10}}>
    <div style={S.ch}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span>Tarjetas ({mesesNombres[mesNum-1]} {anio}) <span style={{color:'#555',fontWeight:400,fontSize:11,marginLeft:8}}>{items.length} items</span></span>
        <span style={{display:'flex',gap:14,fontSize:11}}>
          {PERSONAS.filter(p=>porPersona[p].length>0).map(p=>(
            <span key={p} style={{color:COLOR[p]||'#888'}}>
              {ICON[p]||'•'} <strong>{p}</strong>: {fmt(sumARS(porPersona[p]))}{sumUSD(porPersona[p])>0?' + US$'+sumUSD(porPersona[p]).toFixed(2):''}
            </span>
          ))}
        </span>
      </div>
    </div>
    {PERSONAS.filter(p=>porPersona[p].length>0).map(persona=>{
      const arr=porPersona[persona]
      const isOpen=openP[persona]!==false
      return <div key={persona}>
        <div onClick={()=>setOpenP(o=>({...o,[persona]:!isOpen}))} style={{padding:'8px 14px',background:'#0F0F0F',borderTop:'0.5px solid #2A2A2A',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:11,color:COLOR[persona]||'#888',fontWeight:500,letterSpacing:'.04em',textTransform:'uppercase'}}>{ICON[persona]||'•'} {persona} · {arr.length} tarjetas</span>
          <span style={{fontFamily:'monospace',fontSize:12,color:COLOR[persona]||'#888'}}>{fmt(sumARS(arr))}{sumUSD(arr)>0?' + US$'+sumUSD(arr).toFixed(2):''} <span style={{color:'#555',fontSize:10,marginLeft:6}}>· pagado {fmt(sumPagARS(arr))}</span> <span style={{marginLeft:8,fontSize:11,color:'#555'}}>{isOpen?'▲':'▼'}</span></span>
        </div>
        {isOpen&&arr.map((it,i)=>{
          const pag=isPagado(it['Pagado'])
          const fila=findFila(arrFuente,it)
          const monto=parseMonto(it['Monto'])
          const montoUSD=parseMonto(it['Monto USD'])
          const yaPagado=parseMonto(it['Monto pagado'])
          const pendiente=Math.max(0,monto-yaPagado)
          const tieneParcial=yaPagado>0&&!pag
          const cuenta=it['Cuenta pago']||''
          const isSaving=saving===`TARJETAS-${fila}`||saving===`TARJETAS-${fila}-cta`||saving===`TARJETAS-${fila}-pp`
          return <div key={i} style={{padding:'8px 14px',borderTop:'0.5px solid #1A1A1A',opacity:pag?0.6:1,fontSize:12}}>
            <div style={{display:'grid',gridTemplateColumns:'auto 1fr auto auto auto auto auto',gap:10,alignItems:'center'}}>
              <input type='checkbox' checked={pag} disabled={isSaving} onChange={()=>togglePagado('TARJETAS',arrFuente,it,{cuentaPago:cuenta})} style={{accentColor:'#1D9E75'}}/>
              <div style={{minWidth:0}}>
                <div style={{fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{it['Tarjeta']}{montoUSD>0?<span style={{fontSize:10,color:'#888',marginLeft:6}}>+ US${montoUSD.toFixed(2)}</span>:''}</div>
                {it['Vencimiento']&&<div style={{fontSize:10,color:'#555'}}>vto {it['Vencimiento']}</div>}
              </div>
              <select value={cuenta} disabled={pag||isSaving} onChange={e=>cambiarCuenta('TARJETAS',arrFuente,it,e.target.value)} style={{padding:'4px 6px',borderRadius:4,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontSize:11,minWidth:110}}>
                <option value=''>— cuenta —</option>
                {cuentasNombres.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              <span style={{fontFamily:'monospace',fontSize:13,minWidth:90,textAlign:'right'}}>{fmt(monto)}</span>
              {!pag&&<button onClick={()=>pagoParcial('TARJETAS',arrFuente,it)} disabled={isSaving} style={{padding:'3px 8px',borderRadius:4,border:'0.5px solid #9635AB',background:'transparent',color:'#9635AB',fontSize:10,cursor:'pointer'}}>Parcial</button>}
              <span style={{...S.badge,background:pag?'#1D9E7520':(tieneParcial?'#9635AB20':'#BA751720'),color:pag?'#1D9E75':(tieneParcial?'#9635AB':'#BA7517'),fontSize:10}}>{pag?'PAGADO':(tieneParcial?'PARCIAL':'PEND')}</span>
              <span style={{fontSize:10,color:'#555',minWidth:40}}>{isSaving?'...':(pag?(it['Fecha pago']||''):'')}</span>
            </div>
            {tieneParcial&&<div style={{marginTop:4,marginLeft:30,padding:'4px 8px',background:'#9635AB10',borderRadius:4,fontSize:10,color:'#9635AB'}}>Pagado {fmt(yaPagado)} / {fmt(monto)} · falta {fmt(pendiente)}</div>}
          </div>
        })}
      </div>
    })}
  </div>
}

// ---- Vista de movimientos de tarjeta cargados (detalle) ----
function MovimientosTarjeta({data,mail,mesNum,anio,onRefresh}){
  const movs=(data.movimientosTarjeta||[]).filter(m=>String(m['Mes'])===String(mesNum)&&String(m['Año'])===String(anio))
  const [open,setOpen]=useState(false)
  const [filtroCat,setFiltroCat]=useState('todas')
  const [filtroTar,setFiltroTar]=useState('todas')
  const [busq,setBusq]=useState('')
  const [saving,setSaving]=useState(null)

  if(movs.length===0&&!open)return <div style={{...S.card,padding:'10px 14px',marginBottom:10,fontSize:11,color:'#555',textAlign:'center'}}>Sin movimientos de tarjeta cargados para {mesNum}/{anio}. Subí un PDF arriba para agregar.</div>

  const tarjetas=[...new Set(movs.map(m=>m['Tarjeta']).filter(Boolean))]
  const categorias=[...new Set(movs.map(m=>m['Categoria']).filter(Boolean))]
  const isRev=v=>String(v||'').toUpperCase().match(/SI|SÍ|TRUE/)
  const filtrados=movs.filter(m=>{
    if(filtroCat!=='todas'&&m['Categoria']!==filtroCat)return false
    if(filtroTar!=='todas'&&m['Tarjeta']!==filtroTar)return false
    if(busq){const q=busq.toLowerCase();const hay=[m['Comercio'],m['Descripcion'],m['Notas']].map(v=>String(v||'').toLowerCase()).join(' ');if(!hay.includes(q))return false}
    return true
  })
  const totARS=filtrados.filter(m=>m['Moneda']==='ARS').reduce((s,m)=>s+parseMonto(m['Monto']),0)
  const totUSD=filtrados.filter(m=>m['Moneda']==='USD').reduce((s,m)=>s+parseMonto(m['Monto']),0)
  const revisados=filtrados.filter(m=>isRev(m['Revisado'])).length
  const totalesPorCat={}
  filtrados.forEach(m=>{const c=m['Categoria']||'Otros';if(!totalesPorCat[c])totalesPorCat[c]={ars:0,usd:0,cant:0};const mon=parseMonto(m['Monto']);if(m['Moneda']==='USD')totalesPorCat[c].usd+=mon;else totalesPorCat[c].ars+=mon;totalesPorCat[c].cant++})

  // findFila: en data.movimientosTarjeta, buscar el index. Las filas en sheet son index+2 (1-based + header)
  const findFilaOriginal=(m)=>{const idx=(data.movimientosTarjeta||[]).indexOf(m);return idx>=0?idx+2:null}

  const toggleRevisado=async(m)=>{
    const fila=findFilaOriginal(m);if(!fila)return
    setSaving(fila)
    try{
      await fetch('/api/movimiento-toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fila,revisado:!isRev(m['Revisado'])})})
      if(typeof onRefresh==='function')await onRefresh()
    }catch(e){alert('Error: '+e.message)}
    setSaving(null)
  }

  const cambiarCategoria=async(m,nueva)=>{
    const fila=findFilaOriginal(m);if(!fila)return
    setSaving(fila)
    try{
      await fetch('/api/movimiento-toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fila,categoria:nueva})})
      if(typeof onRefresh==='function')await onRefresh()
    }catch(e){alert('Error: '+e.message)}
    setSaving(null)
  }

  return <div style={{...S.card,marginBottom:10,border:'0.5px solid #1543F840'}}>
    <div style={{...S.ch,display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer'}} onClick={()=>setOpen(!open)}>
      <span style={{color:'#1543F8'}}>📋 Movimientos de tarjeta cargados ({movs.length}) <span style={{color:'#555',fontWeight:400,fontSize:11,marginLeft:6}}>· {revisados} revisados · ${fmt(movs.reduce((s,m)=>s+(m['Moneda']==='ARS'?parseMonto(m['Monto']):0),0))}</span></span>
      <span style={{fontSize:11,color:'#555'}}>{open?'▲ cerrar':'▼ ver detalle'}</span>
    </div>
    {open&&<div style={{padding:'12px 14px'}}>
      <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
        <select value={filtroTar} onChange={e=>setFiltroTar(e.target.value)} style={{padding:'5px 8px',borderRadius:4,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontSize:11}}>
          <option value='todas'>Todas las tarjetas</option>
          {tarjetas.map(t=><option key={t}>{t}</option>)}
        </select>
        <select value={filtroCat} onChange={e=>setFiltroCat(e.target.value)} style={{padding:'5px 8px',borderRadius:4,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontSize:11}}>
          <option value='todas'>Todas las categorías</option>
          {categorias.map(c=><option key={c}>{c}</option>)}
        </select>
        <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder='🔍 buscar comercio/descripcion' style={{padding:'5px 8px',borderRadius:4,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontSize:11,flex:1,minWidth:180}}/>
        <span style={{fontSize:10,color:'#555'}}>{filtrados.length} mov · ARS {fmt(totARS)} {totUSD?'· USD '+totUSD.toFixed(2):''}</span>
      </div>
      {Object.keys(totalesPorCat).length>0&&<div style={{display:'flex',gap:6,marginBottom:8,flexWrap:'wrap'}}>
        {Object.entries(totalesPorCat).sort((a,b)=>(b[1].ars+b[1].usd*1500)-(a[1].ars+a[1].usd*1500)).map(([cat,t])=>(
          <span key={cat} style={{padding:'3px 8px',borderRadius:3,background:'#1E1E1E',fontSize:10,color:'#888'}}>{cat}: <strong style={{color:'#F0F0F0'}}>{fmt(t.ars)}</strong>{t.usd>0?' + US$'+t.usd.toFixed(0):''} <span style={{color:'#555'}}>· {t.cant}</span></span>
        ))}
      </div>}
      <div style={{maxHeight:'50vh',overflowY:'auto',border:'0.5px solid #2A2A2A',borderRadius:6}}>
        <div style={{display:'grid',gridTemplateColumns:'30px 70px 1fr 80px 100px 150px',gap:6,padding:'6px 8px',background:'#1A1A1A',fontSize:10,color:'#555',textTransform:'uppercase',position:'sticky',top:0}}>
          <span></span><span>Fecha</span><span>Comercio</span><span>Tarjeta</span><span style={{textAlign:'right'}}>Monto</span><span>Categoría</span>
        </div>
        {filtrados.map((m,i)=>{
          const fila=findFilaOriginal(m)
          const rev=isRev(m['Revisado'])
          return <div key={i} style={{display:'grid',gridTemplateColumns:'30px 70px 1fr 80px 100px 150px',gap:6,padding:'5px 8px',borderTop:'0.5px solid #2A2A2A',fontSize:11,alignItems:'center',opacity:rev?0.5:1}}>
            <input type='checkbox' checked={rev} disabled={saving===fila} onChange={()=>toggleRevisado(m)} style={{accentColor:'#1D9E75'}}/>
            <span style={{fontFamily:'monospace',fontSize:10,color:'#888'}}>{m['Fecha']||''}</span>
            <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:11}}>{m['Comercio']||m['Descripcion']||'—'}</span>
            <span style={{fontSize:10,color:'#555'}}>{m['Tarjeta']}</span>
            <span style={{fontFamily:'monospace',fontSize:11,textAlign:'right',color:parseMonto(m['Monto'])<0?'#1D9E75':'inherit'}}>{m['Moneda']==='USD'?'US$':''}{fmt(parseMonto(m['Monto']))}</span>
            <select value={m['Categoria']||'Otros'} disabled={saving===fila} onChange={e=>cambiarCategoria(m,e.target.value)} style={{padding:'2px 4px',borderRadius:3,border:'0.5px solid #333',background:'#161616',color:'#F0F0F0',fontSize:10}}>
              {['Comida y bebida','Transporte','Viajes','Suscripciones','Producción audiovisual','Profesional/Servicios','Equipos/Tecnología','Personal','Pagos/Transferencias','Cargos bancarios','Otros'].map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
        })}
      </div>
      <div style={{fontSize:10,color:'#555',marginTop:8,textAlign:'center'}}>Tildá los movimientos a medida que los revisás. Podés cambiar categoría desde acá si ves alguno mal clasificado.</div>
    </div>}
  </div>
}

function Balance({data,mail,onRefresh}){
  const hoy=new Date(), mesActualNum=hoy.getMonth()+1, anioActualNum=hoy.getFullYear()
  const MESES=['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']
  const mesStrToNum={'ENE':1,'FEB':2,'MAR':3,'ABR':4,'MAY':5,'JUN':6,'JUL':7,'AGO':8,'SEP':9,'OCT':10,'NOV':11,'DIC':12}
  const [mes,setMes]=useState(MESES[mesActualNum-1]||'ABR')
  const [anio,setAnio]=useState(String(anioActualNum))
  const [tc,setTc]=useState(1405)
  const [saving,setSaving]=useState(null)
  const [nuevoPersona,setNuevoPersona]=useState('')
  const mesNum=mesStrToNum[mes]||4

  // SUELDOS desde el Sheet
  const sueldos=(data.sueldos||[]).filter(s=>{
    const m=parseInt(s['Mes'])||0; const a=String(s['Año']||'').trim()
    return m===mesNum && a===anio
  })
  const personas=[...new Set([...SU_DEFAULTS.map(x=>x.n),...sueldos.map(s=>s['Persona']).filter(Boolean)])]
  const getSueldoRow=(persona)=>sueldos.find(s=>String(s['Persona']||'').trim()===persona && String(s['Tipo']||'fijo').trim()==='fijo')
  const getMonto=(persona)=>{const r=getSueldoRow(persona);if(r)return parseMonto(r['Monto']);return SU_DEFAULTS.find(s=>s.n===persona)?.b||0}
  const isPagado=(persona)=>{const r=getSueldoRow(persona);return r&&(String(r['Pagado']||'').toUpperCase()==='SÍ'||String(r['Pagado']||'').toUpperCase()==='SI'||r['Pagado']===true)}

  const upsertSueldo=async(persona,updates)=>{
    setSaving(persona)
    try{
      await fetch('/api/sueldo-upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mes:mesNum,anio,persona,tipo:'fijo',...updates})})
      if(onRefresh)await onRefresh()
    }catch(e){alert('Error: '+e.message)}
    setSaving(null)
  }

  const [ge,setGe]=useState({}), [pgf,setPgf]=useState({}), [vs,setVs]=useState({}), [pgv,setPgv]=useState({}), [nv,setNv]=useState({n:'',m:''})
  const gG=n=>ge[n]!==undefined?ge[n]:GF_DEFAULTS.find(g=>g.n===n)?.m||0
  const gV=()=>vs[mes+anio]||[]
  const ts=personas.reduce((s,p)=>s+getMonto(p),0)
  const tf=GF_DEFAULTS.reduce((s,g)=>s+gG(g.n),0)
  const tv=gV().reduce((s,g)=>s+(parseFloat(g.m)||0),0)

  // Ingresos reales
  const fc=data.facturacion||[]
  const mesPad=String(mesNum).padStart(2,'0')
  const fcMes=fc.filter(f=>{const m=String(f['Mes']||'');return m.includes(mesPad)||m.toUpperCase().includes(mes)})
  const ingMes=fcMes.reduce((s,f)=>s+parseMonto(f['Precio SIN IVA']),0)
  const resultado=ingMes-(ts+tf+tv)
  const anios=['2023','2024','2025','2026','2027']

  return <div>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:10}}>
      <div style={{display:'flex',gap:4,flexWrap:'wrap',alignItems:'center'}}>
        {MESES.map(m=><button key={m} style={{...S.fb,...(mes===m?S.fa:{})}} onClick={()=>setMes(m)}>{m}</button>)}
        <select value={anio} onChange={e=>setAnio(e.target.value)} style={{padding:'5px 10px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontSize:11,outline:'none',marginLeft:6}}>
          {anios.map(a=><option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:6,background:'#1E1E1E',border:'0.5px solid #333',borderRadius:8,padding:'5px 10px'}}>
        <span style={{fontSize:11,color:'#555'}}>USD blue $</span>
        <input type='number' value={tc} onChange={e=>setTc(parseFloat(e.target.value)||1405)} style={{width:70,border:'none',background:'transparent',color:'#BA7517',fontFamily:'monospace',fontSize:13,fontWeight:500,outline:'none',textAlign:'right'}}/>
      </div>
    </div>
    <div style={S.k4}>
      <K lbl='Ingresos netos' val={fmtM(ingMes)} sub={fcMes.length+' facturas del mes'} c='#1D9E75'/>
      <K lbl='Sueldos' val={'-'+fmtM(ts)} sub={personas.filter(p=>!isPagado(p)).length+' pendientes'} c='#E24B4A'/>
      <K lbl='Gastos fijos' val={'-'+fmtM(tf)} c='#E24B4A'/>
      <K lbl='Resultado' val={fmtM(resultado)} c={resultado>=0?'#1D9E75':'#E24B4A'}/>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:12}}>
      <div>
        <div style={S.card}>
          <div style={S.ch}>Sueldos equipo — {mes} {anio}</div>
          {personas.map((nombre,i)=>{const pagado=isPagado(nombre),monto=getMonto(nombre); return <div key={i} style={{...S.lr,opacity:pagado?0.6:1,gap:8}}>
            <input type='checkbox' checked={pagado} disabled={saving===nombre} onChange={e=>upsertSueldo(nombre,{pagado:e.target.checked,fechaPago:e.target.checked?(new Date().toLocaleDateString('es-AR')):'',monto})} style={{accentColor:'#1D9E75',flexShrink:0}}/>
            <span style={{flex:1,marginLeft:4,fontSize:13}}>{nombre}</span>
            <span style={{...S.badge,background:pagado?'#1D9E7520':'#BA751720',color:pagado?'#1D9E75':'#BA7517',marginRight:8,fontSize:10}}>{pagado?'Pagado':'Pend.'}</span>
            <input type='number' defaultValue={monto} onBlur={e=>{const v=parseFloat(e.target.value)||0;if(v!==monto)upsertSueldo(nombre,{monto:v,pagado})}} style={{width:110,padding:'4px 6px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontFamily:'monospace',fontSize:12,outline:'none',textAlign:'right'}}/>
            {saving===nombre&&<span style={{fontSize:10,color:'#888'}}>...</span>}
          </div>})}
          <div style={{display:'flex',gap:8,padding:'10px 14px',borderTop:'0.5px dashed #2A2A2A'}}>
            <input placeholder='Nombre de nueva persona...' value={nuevoPersona} onChange={e=>setNuevoPersona(e.target.value)} style={{flex:1,padding:'6px 8px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontSize:12,outline:'none'}}/>
            <button onClick={async()=>{if(!nuevoPersona.trim())return;await upsertSueldo(nuevoPersona.trim(),{monto:0,pagado:false});setNuevoPersona('')}} style={{padding:'6px 12px',borderRadius:6,border:'none',background:'#1543F8',color:'#fff',fontSize:12,cursor:'pointer'}}>+ Agregar</button>
          </div>
        </div>
        <div style={{...S.card,marginTop:12}}>
          <div style={S.ch}>Gastos variables — {mes} {anio}</div>
          {gV().map((g,i)=>{const p=pgv[mes+anio+i]; return <div key={i} style={{...S.lr,opacity:p?0.5:1}}>
            <input type='checkbox' checked={!!p} onChange={e=>setPgv(prev=>({...prev,[mes+anio+i]:e.target.checked}))} style={{accentColor:'#1543F8',flexShrink:0}}/>
            <span style={{flex:1,marginLeft:10,fontSize:13}}>{g.n}</span>
            <span style={{fontFamily:'monospace',fontSize:12,marginLeft:'auto'}}>{fmt(g.m)}</span>
          </div>})}
          <div style={{display:'flex',gap:8,padding:'10px 14px',borderTop:'0.5px dashed #2A2A2A'}}>
            <input placeholder='Descripcion...' value={nv.n} onChange={e=>setNv(p=>({...p,n:e.target.value}))} style={{flex:1,padding:'6px 8px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontSize:12,outline:'none'}}/>
            <input type='number' placeholder='$' value={nv.m} onChange={e=>setNv(p=>({...p,m:e.target.value}))} style={{width:90,padding:'6px 8px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontSize:12,outline:'none'}}/>
            <button style={{padding:'6px 12px',borderRadius:6,border:'none',background:'#1543F8',color:'#fff',fontSize:12,cursor:'pointer'}} onClick={()=>{if(!nv.n)return;setVs(prev=>({...prev,[mes+anio]:[...(prev[mes+anio]||[]),{n:nv.n,m:parseFloat(nv.m)||0}]}));setNv({n:'',m:''})}}>OK</button>
          </div>
        </div>
      </div>
      <div>
        <div style={S.card}>
          <div style={S.ch}>Gastos fijos</div>
          {GF_DEFAULTS.map((g,i)=>{const p=pgf[mes+anio+g.n]; return <div key={i} style={{...S.lr,opacity:p?0.5:1}}>
            <input type='checkbox' checked={!!p} onChange={e=>setPgf(prev=>({...prev,[mes+anio+g.n]:e.target.checked}))} style={{accentColor:'#1543F8',flexShrink:0}}/>
            <span style={{flex:1,marginLeft:10,fontSize:13}}>{g.n}</span>
            <span style={{...S.badge,background:p?'#1D9E7520':'#BA751720',color:p?'#1D9E75':'#BA7517',marginRight:8,fontSize:10}}>{p?'Pagado':'Pend.'}</span>
            <input type='number' value={gG(g.n)} onChange={e=>setGe(prev=>({...prev,[g.n]:parseFloat(e.target.value)||0}))} style={{width:100,padding:'4px 6px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontFamily:'monospace',fontSize:12,outline:'none',textAlign:'right'}}/>
          </div>})}
        </div>
        <div style={{...S.card,marginTop:12,padding:'14px 16px'}}>
          <div style={{fontSize:12,fontWeight:500,color:'#555',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:12}}>Resumen {mes}</div>
          {[['Ingresos netos','+'+fmt(ingMes),'#1D9E75'],['Sueldos equipo','-'+fmt(ts),'#E24B4A'],['Gastos fijos','-'+fmt(tf),'#E24B4A'],['Variables','-'+fmt(tv),'#BA7517'],['Resultado neto',(resultado>=0?'+':'')+fmtM(resultado),resultado>=0?'#1D9E75':'#E24B4A']].map(([k,v,c])=>(
            <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'0.5px solid #2A2A2A',fontSize:13}}>
              <span style={{color:'#555',fontSize:12}}>{k}</span><span style={{fontFamily:'monospace',color:c,fontWeight:k.includes('Resultado')?600:400}}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
}

// ---- NUEVO PRESUPUESTO ----
// Limpia emojis/simbolos raros del inicio del nombre del servicio para matchear SVCS_LIST
const stripSvcPrefix = s => String(s||'').replace(/^[^a-zA-Z0-9]+\s*/, '').trim()
// Reading defensivo de Pedido/Precio con todas las variantes posibles del Sheet
const readPedidos = p => {
  if (!p) return []
  const findKey = (prefix, idx) => {
    const rx = new RegExp('^\\s*'+prefix+'\\s*'+idx+'\\s*$','i')
    return Object.keys(p).find(k => rx.test(k)) || null
  }
  // Lee 'Fee Servicios' guardado como csv '1|0|1' — preserva el flag por servicio del original
  const feeFlags = String(p['Fee Servicios']||'').split('|')
  const out = []
  let svcIdx = 0
  for (let i=1;i<=12;i++) {
    const pk = findKey('pedido', i), ck = findKey('precio', i)
    const rawSvc = pk ? (p[pk]||'') : ''
    const svcClean = stripSvcPrefix(rawSvc)
    const match = SVCS_LIST.find(s => stripSvcPrefix(s.n) === svcClean || s.n === rawSvc)
    const svc = match ? match.n : (svcClean || '')
    const precio = ck ? parseMonto(p[ck]) : 0
    if (svc || precio) {
      // Fee del original: '0' explícito → false, '1' → true, vacío → fallback al default del servicio
      const flag = feeFlags[svcIdx]
      const fee = flag === '0' ? false : flag === '1' ? true : (SVCS_LIST.find(s=>s.n===svc)?.fee ?? true)
      out.push({svc, precio, fee})
      svcIdx++
    }
  }
  return out
}
// Calcula siguiente versión (1805 -> 1805v2 -> 1805v3)
const nextVersion = (num, todosNums) => {
  const base = String(num).replace(/v\d+$/i, '').trim()
  let maxV = 1
  todosNums.forEach(n => {
    const s = String(n||'').trim()
    const m = s.match(/^(.+?)(?:v(\d+))?$/i)
    if (m && m[1].trim() === base) { const v = m[2]?parseInt(m[2]):1; if (v > maxV) maxV = v }
  })
  return base + 'v' + (maxV + 1)
}

function NuevoPresupuesto({onClose,onGuardado,data,initialData,mail}){
  const presus=data?.presupuestos||[]
  const isRepresupuestar = !!initialData
  const defaultNum = presus.length>0?Math.max(...presus.map(p=>parseInt(p['Columna 1'])||0))+1:1000
  const nextNum = isRepresupuestar ? nextVersion(initialData['Columna 1'], presus.map(x=>x['Columna 1'])) : defaultNum
  const pedidosIniciales = isRepresupuestar ? readPedidos(initialData) : []
  const [peds,setPeds]=useState(
    isRepresupuestar && pedidosIniciales.length > 0
      ? pedidosIniciales.map((x,i)=>({id:i+1,svc:x.svc,precio:String(x.precio||''),feeAg:x.fee,manual:false}))
      : [{id:1,svc:'',precio:'',feeAg:true,manual:false},{id:2,svc:'',precio:'',feeAg:true,manual:false}]
  )
  const parseFechaSheet = s => { const parts=String(s||'').split('/'); if(parts.length===3){const yr=parts[2].length===4?parts[2]:'20'+parts[2]; return `${yr}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`}; return '' }
  // Para represupuestar: recuperar tipo de fechas y adicionales (col 47/48 del sheet)
  const tipoOrig = String(initialData?.['Tipo Fechas']||'').toLowerCase().trim() || 'dia'
  const adicionalesOrig = String(initialData?.['Fechas Adicionales']||'').trim()
  // Para represupuestar: el ajuste original puede ser negativo (descuento) o positivo (recargo)
  const ajusteOrig = parseMonto(initialData?.['Ajuste'])
  const [form,setForm]=useState(isRepresupuestar ? {
    fp:new Date().toISOString().slice(0,10),
    fechaMode:(tipoOrig==='rango'||tipoOrig==='multi')?tipoOrig:'dia',
    fe1:parseFechaSheet(initialData['Fecha Evento']),
    feIni: tipoOrig==='rango' ? parseFechaSheet(initialData['Fecha Evento']) : '',
    feFin: tipoOrig==='rango' && adicionalesOrig ? parseFechaSheet(adicionalesOrig) : '',
    agencia:initialData['Agencia']||'',
    cliente:initialData['Cliente']||'',
    proyecto:initialData['Proyecto']||'',
    contacto:initialData['Contacto']||'',
    pm:initialData['PM Interno']||'',
    repr:String(initialData['Columna 1']||''),
    plazo:String(initialData['Plazo']||'0').replace(/[^\d]/g,'')||'0',
    interes:String(initialData['Interes %']||'0').replace(/[^\d.]/g,'')||'0',
    gan: parseMonto(initialData['Impuesto a las ganancias'])>0,
    iibb: parseMonto(initialData['IIBB'])>0,
    tajuste: ajusteOrig < 0 ? '-1' : '1',
    ajuste:String(Math.abs(ajusteOrig)||'0'),
    motivo:'',
    observaciones: initialData['Observaciones']||'',
    horario: initialData['Horario']||'',
    ubicacion: initialData['Ubicación']||'',
    contactoLugar: initialData['Contacto Lugar']||'',
  } : {fp:new Date().toISOString().slice(0,10),fechaMode:'dia',fe1:'',feIni:'',feFin:'',agencia:'',cliente:'',proyecto:'',contacto:'',pm:'',repr:'',plazo:'0',interes:'0',gan:true,iibb:true,tajuste:'1',ajuste:'0',motivo:'',observaciones:'',horario:'',ubicacion:'',contactoLugar:''})
  const [saving,setSaving]=useState(false),[ok,setOk]=useState(false),[numAsignado,setNumAsignado]=useState(null)
  const [hintAg,setHintAg]=useState(false),[hintCl,setHintCl]=useState(false),[hintCt,setHintCt]=useState(false)
  const [ctData,setCtData]=useState({mail:'',telefono:'',cuit:'',cargo:''})
  const [agData,setAgData]=useState({cuit:'',condIVA:'Responsable Inscripto',mailFact:'',telefono:''})
  const [diasMulti,setDiasMulti]=useState(
    isRepresupuestar && tipoOrig==='multi' && adicionalesOrig
      ? [parseFechaSheet(initialData['Fecha Evento']), ...adicionalesOrig.split('|').filter(Boolean).map(parseFechaSheet)]
      : ['']
  )
  const agenciasData = data?.agencias || []
  const listadoData = data?.listado || {}
  // Combinar fuentes: AGENCIAS (con ficha fiscal) + listado.agencias (histórico) + presupuestos previos
  const agenciasAutocomplete = [...new Set([
    ...agenciasData.map(a => a['Nombre']),
    ...(listadoData.agencias||[]),
    ...((data?.presupuestos||[]).map(p => p['Agencia']))
  ].map(v => String(v||'').trim()).filter(Boolean))].sort()
  // Clientes/Marcas: listado (180 históricos) + CLIENTES sheet + presupuestos previos
  const clientesAutocomplete = [...new Set([
    ...(listadoData.clientes||[]),
    ...((data?.clientes||[]).map(c => c['Nombre'])),
    ...((data?.presupuestos||[]).map(p => p['Cliente']))
  ].map(v => String(v||'').trim()).filter(Boolean))].sort()
  // Contactos: solapa Contactos/agencias (real) + historico CONTACTOS_LIST + presupuestos previos
  // Antes era solo CONTACTOS_LIST hardcoded → no aparecían contactos cargados al sheet (bug Analia Canepa 2026-06-08)
  const contactosAutocomplete = [...new Set([
    ...((data?.contactos||[]).map(c => c['Nombre'])),
    ...CONTACTOS_LIST.map(c => c.n),
    ...((data?.presupuestos||[]).map(p => p['Contacto']))
  ].map(v => String(v||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'))
  const agenciaSeleccionada = agenciasData.find(a => String(a['Nombre']||'').toLowerCase() === form.agencia.toLowerCase().trim())
  const [erroresValidacion,setErroresValidacion]=useState([])
  const validar = () => {
    const errs = []
    if (!form.pm) errs.push('Falta PM interno')
    const tieneFecha = form.fechaMode==='dia' ? !!form.fe1 : form.fechaMode==='rango' ? (!!form.feIni && !!form.feFin) : diasMulti.filter(Boolean).length>0
    if (!tieneFecha) errs.push('Falta fecha de evento')
    if (!form.cliente.trim()) errs.push('Falta cliente')
    if (!form.proyecto.trim()) errs.push('Falta proyecto / descripción')
    if (!form.contacto.trim()) errs.push('Falta contacto')
    if (!peds.some(p=>p.svc)) errs.push('Falta al menos un servicio')
    if (isRepresupuestar && !form.motivo.trim()) errs.push('Falta motivo del represupuesto')
    return errs
  }
  const version=isRepresupuestar ? String(nextNum).match(/v\d+$/i)?.[0] || 'V2' : (form.repr?'V2':'')
  const tieneAg=form.agencia.trim()!==''
  const calcT=()=>{
    const subtotal=peds.reduce((s,p)=>s+(parseFloat(p.precio)||0),0)
    const feeBase=peds.reduce((s,p)=>p.feeAg?(s+(parseFloat(p.precio)||0)):s,0)
    const fee=tieneAg?feeBase:0,base=subtotal+fee
    const gan=form.gan?fee*0.35:0,iibb=form.iibb?fee*0.04:0
    const intMto=(base+gan+iibb)*((parseFloat(form.interes)||0)/100)
    const ajMto=(parseFloat(form.ajuste)||0)*parseInt(form.tajuste)
    return {subtotal,fee,base,gan,iibb,intMto,ajMto,total:base+gan+iibb+intMto+ajMto}
  }
  const T=calcT()
  const setSvc=(id,val)=>{const s=SVCS_LIST.find(x=>x.n===val);setPeds(prev=>prev.map(p=>p.id===id?{...p,svc:val,precio:s?.p||'',feeAg:s?.fee??true,manual:false}:p))}
  const setPrecio=(id,val)=>setPeds(prev=>prev.map(p=>p.id===id?{...p,precio:val,manual:true}:p))
  const setFeeAg=(id,val)=>setPeds(prev=>prev.map(p=>p.id===id?{...p,feeAg:val}:p))
  const setF=(k,v)=>setForm(prev=>({...prev,[k]:v}))
  async function guardar(){
    const errs = validar()
    if (errs.length>0) { setErroresValidacion(errs); return }
    setErroresValidacion([])
    // Si agencia quedó vacía, normalizar a "Sin agencia / Directo"
    const agenciaFinal = form.agencia.trim() || 'Sin agencia / Directo'
    setSaving(true)
    const toDMY = (iso) => iso ? iso.split('-').reverse().join('/') : ''
    let fechaEventoOut = '', fechasAdicionales = '', tipoFechas = form.fechaMode
    if (form.fechaMode === 'dia') {
      fechaEventoOut = toDMY(form.fe1)
    } else if (form.fechaMode === 'rango') {
      fechaEventoOut = toDMY(form.feIni)
      fechasAdicionales = toDMY(form.feFin)
    } else if (form.fechaMode === 'multi') {
      const fs = diasMulti.filter(Boolean).map(toDMY)
      fechaEventoOut = fs[0] || ''
      fechasAdicionales = fs.slice(1).join('|')
    }
    const cantFechas = form.fechaMode==='multi' ? diasMulti.filter(Boolean).length : (form.fechaMode==='rango' && form.feIni && form.feFin ? Math.max(1,Math.round((new Date(form.feFin)-new Date(form.feIni))/864e5)+1) : 1)
    const feeServicios = peds.filter(p=>p.svc).map(p=>p.feeAg?'1':'0').join('|')
    const row={
      'Columna 1':nextNum,
      'Estado':'EN ESPERA',
      'PM Interno':form.pm,
      'Agencia':agenciaFinal,
      'Cliente':form.cliente,
      'Proyecto':form.proyecto,
      'Contacto':form.contacto,
      'Fecha Presupuesto':form.fp,
      'Fecha Evento':fechaEventoOut,
      'Cant. Fechas':cantFechas,
      'Precio Final':T.total,
      'Subtotal':T.subtotal,
      'Fee Agencia':T.fee,
      'Impuesto a las ganancias':T.gan,
      'IIBB':T.iibb,
      'Plazo':!form.plazo||form.plazo==='0'?'Contado':String(form.plazo)+' días',
      'Interes %':form.interes?form.interes+'%':'',
      'Interes $':T.intMto,
      'Total':T.total,
      'Ajuste':T.ajMto,
      'Tipo Fechas':tipoFechas,
      'Fechas Adicionales':fechasAdicionales,
      'Fee Servicios':feeServicios,
      'Observaciones':form.observaciones||'',
      'Horario':form.horario||'',
      'Ubicación':form.ubicacion||'',
      'Contacto Lugar':form.contactoLugar||'',
    }
    peds.filter(p=>p.svc).forEach((p,i)=>{row['Pedido '+(i+1)]=p.svc;row['Precio '+(i+1)]=p.precio})
    try{
      const r = await fetch('/api/presupuesto-nuevo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(row)})
      const j = await r.json().catch(()=>({}))
      if (!j.ok) { setErroresValidacion(j.detalles||[j.error||'Error al guardar']); setSaving(false); return }
      if (j.numero) { setNumAsignado(j.numero); row['Columna 1'] = j.numero }
      if (isRepresupuestar) {
        await fetch('/api/presupuesto-estado',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:initialData['Columna 1'],estado:'REPRESUPUESTADO',motivo:form.motivo})})
      }
    }catch(e){}
    if(hintCt&&form.contacto.trim()){try{await fetch('/api/contacto-nuevo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:form.contacto,agencia:agenciaFinal,mail:ctData.mail,telefono:ctData.telefono,cuit:ctData.cuit,cargo:ctData.cargo})})}catch(e){}}
    // Persistir cliente nuevo a CLIENTES (no solo en presu)
    if(hintCl&&form.cliente.trim()){
      try{await fetch('/api/cliente-upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:form.cliente,agenciaHabitual:agenciaFinal})})}catch(e){}
    }
    // Persistir agencia nueva (con datos fiscales)
    if(hintAg&&agenciaFinal&&agenciaFinal.toLowerCase()!=='sin agencia / directo'){
      try{await fetch('/api/agencia-upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:agenciaFinal,cuit:agData.cuit,condIVA:agData.condIVA,mailFact:agData.mailFact,telefono:agData.telefono,pmDefault:form.pm})})}catch(e){}
    }
    setOk(true);onGuardado(row);setSaving(false)
  }
  const inp={background:'#1E1E1E',border:'0.5px solid #333',borderRadius:6,color:'#F0F0F0',fontSize:12,padding:'7px 10px',outline:'none',width:'100%',fontFamily:'inherit'}
  const lbl={fontSize:11,color:'#555',display:'block',marginBottom:4}
  return <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:200,display:'flex',alignItems:'flex-start',justifyContent:'flex-end'}}>
    <div style={{width:860,height:'100vh',background:'#0D0D0D',borderLeft:'0.5px solid #2A2A2A',display:'flex',flexDirection:'column',overflow:'hidden',position:'relative'}}>
    {ok&&<div style={{position:'absolute',inset:0,background:'rgba(10,20,10,0.96)',zIndex:10,display:'flex',alignItems:'center',justifyContent:'center',padding:40}}>
      <div style={{background:'#0F1A0F',border:'1px solid #1D9E75',borderRadius:16,padding:'32px 40px',maxWidth:480,width:'100%',textAlign:'center'}}>
        <div style={{fontSize:48,marginBottom:12}}>✓</div>
        <div style={{fontSize:20,fontWeight:600,color:'#1D9E75',marginBottom:6}}>{isRepresupuestar?'Represupuesto creado':'Presupuesto cargado'}</div>
        <div style={{fontSize:14,color:'#888',marginBottom:8}}>N° <span style={{fontFamily:'monospace',color:'#F0F0F0'}}>#{numAsignado||nextNum}</span></div>
        <div style={{fontSize:12,color:'#555',marginBottom:24}}>Ya está guardado en PRESUPUESTOS{isRepresupuestar?' y el original quedó marcado como REPRESUPUESTADO':''}.</div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          <button style={{width:'100%',padding:'12px 20px',borderRadius:8,border:'none',background:'linear-gradient(135deg,#1543F8,#CE2637)',color:'#fff',fontSize:14,fontWeight:600,cursor:'pointer'}} onClick={()=>window.open('/presupuesto?nro='+encodeURIComponent(numAsignado||nextNum),'_blank')}>📄 Generar PDF del presupuesto</button>
          <button style={{width:'100%',padding:'10px 20px',borderRadius:8,border:'0.5px solid #2A2A2A',background:'transparent',color:'#888',fontSize:13,cursor:'pointer'}} onClick={onClose}>Cerrar y volver al listado</button>
        </div>
      </div>
    </div>}
      <div style={{padding:'16px 20px',borderBottom:'0.5px solid #2A2A2A',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
        <span style={{background:'#1543F820',color:'#1543F8',borderRadius:4,padding:'2px 8px',fontSize:11,fontFamily:'monospace'}}>#{nextNum}</span>
        {version&&<span style={{background:'#9635AB20',color:'#9635AB',borderRadius:4,padding:'2px 8px',fontSize:11}}>{version}</span>}
        <span style={{background:'#BA751720',color:'#BA7517',borderRadius:3,padding:'2px 8px',fontSize:10}}>En espera</span>
        <div style={{flex:1}}/>
        <button style={{fontSize:18,background:'transparent',border:'none',color:'#555',cursor:'pointer'}} onClick={onClose}>×</button>
      </div>
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        <div style={{flex:1,padding:20,overflowY:'auto',borderRight:'0.5px solid #2A2A2A'}}>
          <div style={{fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8}}>Datos del proyecto</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
            <label style={{display:'flex',flexDirection:'column',gap:4}}><span style={lbl}>Fecha presupuesto</span><input style={inp} type="date" value={form.fp} onChange={e=>setF('fp',e.target.value)}/></label>
            <label style={{display:'flex',flexDirection:'column',gap:4}}><span style={lbl}>PM interno</span>
              <select style={inp} value={form.pm} onChange={e=>setF('pm',e.target.value)}>
                <option value="">— PM —</option><option>Juan</option><option>Sofi</option><option>Lulu</option><option>Tomi</option>
              </select>
            </label>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:4,marginBottom:8}}>
            <span style={lbl}>Fecha(s) de evento</span>
            <div style={{display:'flex',gap:4,marginBottom:6}}>
              {['dia','rango','multi'].map((m,i)=>(
                <button key={m} style={{padding:'5px 12px',borderRadius:6,border:'0.5px solid #333',background:form.fechaMode===m?'#1E1E1E':'transparent',color:form.fechaMode===m?'#F0F0F0':'#555',fontSize:11,cursor:'pointer'}} onClick={()=>setF('fechaMode',m)}>
                  {['1 dia','Rango','Multiples'][i]}
                </button>
              ))}
            </div>
            {form.fechaMode==='dia'&&<input style={inp} type="date" value={form.fe1} onChange={e=>setF('fe1',e.target.value)}/>}
            {form.fechaMode==='rango'&&<div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',gap:8,alignItems:'center'}}>
              <input style={inp} type="date" value={form.feIni} onChange={e=>setF('feIni',e.target.value)}/>
              <span style={{fontSize:11,color:'#555'}}>al</span>
              <input style={inp} type="date" value={form.feFin} onChange={e=>setF('feFin',e.target.value)}/>
            </div>}
            {form.fechaMode==='multi'&&<div>
              {diasMulti.map((d,i)=>(
                <div key={i} style={{display:'flex',gap:6,alignItems:'center',marginBottom:5}}>
                  <input style={{...inp,flex:1}} type="date" value={d} onChange={e=>{const a=[...diasMulti];a[i]=e.target.value;setDiasMulti(a)}}/>
                  {diasMulti.length>1&&<button style={{width:28,height:28,borderRadius:6,border:'0.5px solid #2A2A2A',background:'transparent',color:'#555',cursor:'pointer',fontSize:15}} onClick={()=>setDiasMulti(prev=>prev.filter((_,j)=>j!==i))}>x</button>}
                </div>
              ))}
              <button style={{width:'100%',padding:6,borderRadius:6,border:'0.5px dashed #2A2A2A',background:'transparent',color:'#555',fontSize:11,cursor:'pointer'}} onClick={()=>setDiasMulti(prev=>[...prev,''])}>+ Agregar dia</button>
            </div>}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              <span style={lbl}>Agencia (quien paga)</span>
              <input style={inp} list="np-ag" value={form.agencia} onChange={e=>{
                const v=e.target.value;setF('agencia',v)
                const match=agenciasData.find(a=>String(a['Nombre']||'').toLowerCase()===v.toLowerCase().trim())
                setHintAg(!!v.trim()&&!match&&v.toLowerCase().trim()!=='sin agencia / directo')
              }} placeholder="Sin agencia / Directo"/>
              <datalist id="np-ag">{agenciasAutocomplete.map(a=><option key={a} value={a}/>)}</datalist>
              {hintAg&&<div style={{marginTop:6,padding:10,background:'#1D9E7508',border:'0.5px solid #1D9E7530',borderRadius:6}}>
                <div style={{fontSize:10,color:'#1D9E75',marginBottom:8,textTransform:'uppercase',letterSpacing:'.06em'}}>Agencia nueva — datos de facturación</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:6}}>
                  <input style={{...inp,fontSize:11}} placeholder='CUIT (sin guiones)' value={agData.cuit} onChange={e=>setAgData(p=>({...p,cuit:e.target.value}))}/>
                  <select style={{...inp,fontSize:11}} value={agData.condIVA} onChange={e=>setAgData(p=>({...p,condIVA:e.target.value}))}>
                    <option value="Responsable Inscripto">Responsable Inscripto</option>
                    <option value="Monotributo">Monotributo</option>
                    <option value="Consumidor Final">Consumidor Final</option>
                    <option value="Exento">Exento</option>
                  </select>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                  <input style={{...inp,fontSize:11}} placeholder='Mail facturación' value={agData.mailFact} onChange={e=>setAgData(p=>({...p,mailFact:e.target.value}))}/>
                  <input style={{...inp,fontSize:11}} placeholder='Teléfono' value={agData.telefono} onChange={e=>setAgData(p=>({...p,telefono:e.target.value}))}/>
                </div>
              </div>}
              {agenciaSeleccionada&&!hintAg&&!agenciaSeleccionada['CUIT']&&<div style={{marginTop:4,padding:'4px 8px',background:'#BA751510',borderRadius:4,fontSize:10,color:'#BA7517'}}>Agencia conocida pero sin CUIT cargado en ficha</div>}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              <span style={lbl}>Cliente / Marca (para quién es)</span>
              <input style={inp} list="np-cl" value={form.cliente} onChange={e=>{setF('cliente',e.target.value);setHintCl(!!e.target.value&&!clientesAutocomplete.some(a=>a.toLowerCase()===e.target.value.toLowerCase()))}} placeholder="Nombre del cliente o marca"/>
              <datalist id="np-cl">{clientesAutocomplete.map(a=><option key={a} value={a}/>)}</datalist>
              {hintCl&&<span style={{fontSize:10,color:'#888'}}>Marca/cliente nuevo (queda solo en este presu)</span>}
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
            <label style={{display:'flex',flexDirection:'column',gap:4}}><span style={lbl}>Proyecto / descripcion</span><input style={inp} value={form.proyecto} onChange={e=>setF('proyecto',e.target.value)} placeholder="Ej: Evento anual, Film..."/></label>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              <span style={lbl}>Contacto</span>
              <input style={inp} list="np-ct" value={form.contacto} onChange={e=>{setF('contacto',e.target.value);setHintCt(!!e.target.value&&!contactosAutocomplete.some(a=>a.toLowerCase()===e.target.value.toLowerCase()))}} placeholder="Nombre del contacto"/>
              <datalist id="np-ct">{contactosAutocomplete.map(c=><option key={c} value={c}/>)}</datalist>
              {hintCt&&<div style={{marginTop:6,padding:10,background:'#1D9E7508',border:'0.5px solid #1D9E7530',borderRadius:6}}><div style={{fontSize:10,color:'#1D9E75',marginBottom:8,textTransform:'uppercase',letterSpacing:'.06em'}}>Contacto nuevo - completar datos</div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}><input style={{...inp,fontSize:11}} placeholder='Mail' value={ctData.mail} onChange={e=>setCtData(p=>({...p,mail:e.target.value}))}/><input style={{...inp,fontSize:11}} placeholder='Telefono' value={ctData.telefono} onChange={e=>setCtData(p=>({...p,telefono:e.target.value}))}/><input style={{...inp,fontSize:11}} placeholder='CUIT' value={ctData.cuit} onChange={e=>setCtData(p=>({...p,cuit:e.target.value}))}/><input style={{...inp,fontSize:11}} placeholder='Cargo' value={ctData.cargo} onChange={e=>setCtData(p=>({...p,cargo:e.target.value}))}/></div></div>}
            </div>
          </div>
          <label style={{display:'flex',flexDirection:'column',gap:4,marginBottom:isRepresupuestar?4:12}}><span style={lbl}>Represupuesto del N°</span><input style={inp} value={form.repr} onChange={e=>setF('repr',e.target.value)} placeholder="Dejar vacio si es presupuesto nuevo" readOnly={isRepresupuestar}/></label>
          {isRepresupuestar&&<label style={{display:'flex',flexDirection:'column',gap:4,marginBottom:12}}><span style={{...lbl,color:'#9635AB'}}>Motivo del represupuesto *</span><input style={{...inp,borderColor:form.motivo?'#333':'#9635AB'}} value={form.motivo||''} onChange={e=>setF('motivo',e.target.value)} placeholder="Ej: cambio de scope, ajuste de precios, nuevo pedido del cliente..." autoFocus/></label>}
          {/* Datos operativos del día del evento — van al Calendar al aprobar */}
          <div style={{padding:'10px 12px',background:'#1543F808',border:'0.5px solid #1543F820',borderRadius:8,marginBottom:12}}>
            <div style={{fontSize:10,color:'#1543F8',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8,fontWeight:600}}>📅 Datos del día (van al Calendar del staff)</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={lbl}>Horario</span>
                <input style={inp} value={form.horario||''} onChange={e=>setF('horario',e.target.value)} placeholder="ej: 8:00 a 18:00 hs"/>
              </label>
              <label style={{display:'flex',flexDirection:'column',gap:4}}>
                <span style={lbl}>Contacto en el lugar</span>
                <input style={inp} value={form.contactoLugar||''} onChange={e=>setF('contactoLugar',e.target.value)} placeholder="Nombre + tel del que los recibe"/>
              </label>
            </div>
            <label style={{display:'flex',flexDirection:'column',gap:4}}>
              <span style={lbl}>Ubicación / Dirección</span>
              <input style={inp} value={form.ubicacion||''} onChange={e=>setF('ubicacion',e.target.value)} placeholder="ej: Hotel Sheraton Hudson, Av. Bunge 1234"/>
            </label>
          </div>
          <label style={{display:'flex',flexDirection:'column',gap:4,marginBottom:12}}>
            <span style={lbl}>Observaciones (para el cliente)</span>
            <textarea style={{...inp,minHeight:50,resize:'vertical',fontFamily:'inherit'}} value={form.observaciones||''} onChange={e=>setF('observaciones',e.target.value)} placeholder="Notas que querés que aparezcan en el PDF"/>
            <span style={{fontSize:10,color:'#555'}}>Aparece en el PDF debajo de los servicios. Opcional.</span>
          </label>
          <div style={{fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8}}>Servicios</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 110px 36px 32px',gap:5,marginBottom:4}}>
            {['Servicio','Precio','Fee ag.',''].map((h,i)=><span key={i} style={{fontSize:10,color:'#555',textAlign:i===2?'center':'left'}}>{h}</span>)}
          </div>
          {peds.map(p=>(
            <div key={p.id} style={{display:'grid',gridTemplateColumns:'1fr 110px 36px 32px',gap:5,alignItems:'center',marginBottom:5}}>
              <select style={inp} value={p.svc} onChange={e=>setSvc(p.id,e.target.value)}>
                <option value="">— Servicio —</option>
                {SVCS_LIST.map(s=><option key={s.n} value={s.n}>{s.n}</option>)}
              </select>
              <input style={{...inp,color:p.manual?'#BA7517':'#1543F8'}} type="number" value={p.precio} placeholder="0" onChange={e=>setPrecio(p.id,e.target.value)}/>
              <input type="checkbox" checked={p.feeAg} onChange={e=>setFeeAg(p.id,e.target.checked)} style={{width:15,height:15,accentColor:'#1543F8',cursor:'pointer',margin:'0 auto',display:'block'}}/>
              <button style={{width:28,height:28,borderRadius:6,border:'0.5px solid #2A2A2A',background:'transparent',color:'#555',cursor:'pointer',fontSize:15}} onClick={()=>setPeds(prev=>prev.filter(x=>x.id!==p.id))}>x</button>
            </div>
          ))}
          <button style={{width:'100%',padding:6,borderRadius:6,border:'0.5px dashed #2A2A2A',background:'transparent',color:'#555',fontSize:11,cursor:'pointer',marginTop:4}} onClick={()=>setPeds(prev=>[...prev,{id:Date.now(),svc:'',precio:'',feeAg:true,manual:false}])}>+ Agregar servicio</button>
          {tieneAg&&<div style={{fontSize:10,color:'#555',marginTop:8,padding:'6px 10px',background:'#1A1A1A',borderRadius:6}}>Servicios con fee marcado se cobran x2. Ganancias e IIBB van sobre el fee.</div>}
          <div style={{fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'.08em',margin:'16px 0 8px'}}>Condiciones</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
            <label style={{display:'flex',flexDirection:'column',gap:4}}><span style={lbl}>Plazo de pago</span>
              <select style={inp} value={form.plazo} onChange={e=>setF('plazo',e.target.value)}>
                <option value="0">Contado</option><option value="15">15 dias</option><option value="30">30 dias</option><option value="60">60 dias</option>
              </select>
            </label>
            <label style={{display:'flex',flexDirection:'column',gap:4}}><span style={lbl}>Interes %</span><input style={inp} type="number" value={form.interes} min="0" step="0.5" onChange={e=>setF('interes',e.target.value)}/></label>
          </div>
          {[['gan','Imp. Ganancias (35% sobre fee)'],['iibb','IIBB (4% sobre fee)']].map(([k,label])=>(
            <div key={k} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 10px',background:'#1A1A1A',borderRadius:6,marginBottom:5}}>
              <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,cursor:'pointer'}}>
                <input type="checkbox" checked={form[k]} onChange={e=>setF(k,e.target.checked)} style={{width:14,height:14,accentColor:'#1543F8'}}/>
                {label}
              </label>
              <span style={{fontFamily:'monospace',fontSize:12,color:'#555'}}>{k==='gan'?fmt(T.fee*0.35):fmt(T.fee*0.04)}</span>
            </div>
          ))}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
            <label style={{display:'flex',flexDirection:'column',gap:4}}><span style={lbl}>Tipo ajuste</span>
              <select style={inp} value={form.tajuste} onChange={e=>setF('tajuste',e.target.value)}><option value="1">Recargo (+)</option><option value="-1">Descuento (-)</option></select>
            </label>
            <label style={{display:'flex',flexDirection:'column',gap:4}}><span style={lbl}>Monto $</span><input style={inp} type="number" value={form.ajuste} onChange={e=>setF('ajuste',e.target.value)}/></label>
          </div>
        </div>
        <div style={{width:260,padding:20,background:'#111',display:'flex',flexDirection:'column',flexShrink:0}}>
          <div style={{fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:12}}>Resumen</div>
          {[
            ['Subtotal servicios',fmt(T.subtotal),'#F0F0F0'],
            tieneAg&&T.fee>0?['Fee agencia (x1)',fmt(T.fee),'#9635AB']:null,
            tieneAg&&T.fee>0?['Base imponible',fmt(T.base),'#555']:null,
            T.gan>0?['Ganancias 35%',fmt(T.gan),'#E24B4A']:null,
            T.iibb>0?['IIBB 4%',fmt(T.iibb),'#E24B4A']:null,
            T.intMto>0?['Interes '+form.interes+'%',fmt(T.intMto),'#BA7517']:null,
            Math.abs(T.ajMto)>0?[(parseInt(form.tajuste)>0?'Recargo':'Descuento'),(parseInt(form.tajuste)>0?'+':'-')+fmt(Math.abs(T.ajMto)),parseInt(form.tajuste)>0?'#1D9E75':'#E24B4A']:null,
          ].filter(Boolean).map(([label,val,color])=>(
            <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',fontSize:12,borderBottom:'0.5px solid #1A1A1A'}}>
              <span style={{color:'#555',fontSize:11}}>{label}</span><span style={{fontFamily:'monospace',color}}>{val}</span>
            </div>
          ))}
          <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0 0',fontSize:15,fontWeight:500,borderTop:'0.5px solid #333',marginTop:6}}>
            <span>Precio final</span><span style={{color:'#1543F8',fontFamily:'monospace'}}>{fmt(T.total)}</span>
          </div>
          {/* Si es represupuesto, mostrar el precio del ORIGINAL como referencia + ayuda para igualar */}
          {isRepresupuestar && (()=>{
            const precioOrig = parseMonto(initialData?.['Precio Final'])
            const diff = T.total - precioOrig
            const igual = Math.abs(diff) < 1
            return <div style={{marginTop:10,padding:'8px 10px',background:igual?'#1D9E7508':'#9635AB10',border:'0.5px solid '+(igual?'#1D9E7530':'#9635AB30'),borderRadius:6}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:igual?0:4}}>
                <span style={{color:'#888'}}>Original #{initialData['Columna 1']}</span>
                <span style={{fontFamily:'monospace',color:'#B0B0B0'}}>{fmt(precioOrig)}</span>
              </div>
              {!igual && <>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:diff>0?'#E24B4A':'#1D9E75',marginBottom:6}}>
                  <span>Diferencia con el nuevo</span>
                  <span style={{fontFamily:'monospace'}}>{diff>0?'+':''}{fmt(diff)}</span>
                </div>
                <button onClick={()=>{
                  // Calcular qué ajuste hace falta para igualar al original
                  const subtotal = peds.reduce((s,p)=>s+(parseFloat(p.precio)||0),0)
                  const feeBase = peds.reduce((s,p)=>p.feeAg?(s+(parseFloat(p.precio)||0)):s,0)
                  const fee = tieneAg?feeBase:0
                  const base = subtotal+fee
                  const gan = form.gan?fee*0.35:0
                  const iibb = form.iibb?fee*0.04:0
                  const intRatio = (parseFloat(form.interes)||0)/100
                  const intMto = (base+gan+iibb)*intRatio
                  const totalSinAjuste = base+gan+iibb+intMto
                  const ajusteNecesario = precioOrig - totalSinAjuste
                  setF('tajuste', ajusteNecesario >= 0 ? '1' : '-1')
                  setF('ajuste', String(Math.round(Math.abs(ajusteNecesario))))
                }} style={{width:'100%',padding:'6px',borderRadius:4,border:'0.5px solid #9635AB',background:'#9635AB20',color:'#9635AB',fontSize:11,fontWeight:500,cursor:'pointer'}}>↺ Forzar precio igual al original</button>
              </>}
            </div>
          })()}
          <div style={{background:'#1A1A1A',borderRadius:8,padding:10,marginTop:14}}>
            <div style={{fontSize:10,color:'#555',marginBottom:6,textTransform:'uppercase',letterSpacing:'.06em'}}>Servicios</div>
            {peds.filter(p=>p.svc).length===0?<span style={{fontSize:11,color:'#555',fontStyle:'italic'}}>Ninguno aun</span>
              :peds.filter(p=>p.svc).map((p,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',borderBottom:'0.5px solid #1E1E1E',fontSize:11}}>
                  <span style={{color:p.feeAg&&tieneAg?'#F0F0F0':'#555'}}>{p.svc}</span>
                  <span style={{fontFamily:'monospace',color:p.feeAg&&tieneAg?'#1543F8':'#555'}}>{fmt(parseFloat(p.precio)||0)}</span>
                </div>
              ))
            }
          </div>
          {form.repr&&<div style={{marginTop:10,fontSize:11,color:'#9635AB'}}>Represupuesto de #{form.repr} V2</div>}
          <div style={{flex:1}}/>
          {erroresValidacion.length>0&&<div style={{marginTop:10,padding:10,background:'#E24B4A15',border:'0.5px solid #E24B4A',borderRadius:6}}>
            <div style={{fontSize:11,color:'#E24B4A',fontWeight:600,marginBottom:6}}>Faltan datos obligatorios:</div>
            {erroresValidacion.map((e,i)=><div key={i} style={{fontSize:11,color:'#E24B4A',lineHeight:1.5}}>• {e}</div>)}
          </div>}
          {ok?<div style={{marginTop:14,display:'flex',flexDirection:'column',gap:8}}><div style={{background:'#1D9E7520',border:'0.5px solid #1D9E75',borderRadius:6,padding:10,fontSize:12,color:'#1D9E75',textAlign:'center'}}>Presupuesto #{numAsignado||nextNum} cargado</div><button style={{width:'100%',padding:10,borderRadius:8,border:'none',background:'linear-gradient(135deg,#1543F8,#CE2637)',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}} onClick={()=>window.open('/presupuesto?nro='+(numAsignado||nextNum),'_blank')}>Generar PDF del presupuesto →</button><button style={{width:'100%',padding:8,borderRadius:8,border:'0.5px solid #2A2A2A',background:'transparent',color:'#555',fontSize:12,cursor:'pointer'}} onClick={onClose}>Cerrar</button></div>
            :<button style={{marginTop:14,width:'100%',padding:10,borderRadius:8,border:'none',background:isRepresupuestar?'#9635AB':'#1543F8',color:'#fff',fontSize:13,fontWeight:500,cursor:'pointer',opacity:saving||(isRepresupuestar&&!form.motivo?.trim())?0.6:1}} onClick={guardar} disabled={saving||(isRepresupuestar&&!form.motivo?.trim())}>
              {saving?'Guardando...':(isRepresupuestar?'Crear represupuesto':'Cargar presupuesto')}
            </button>
          }
        </div>
      </div>
    </div>
  </div>
}

// ---- HISTORICO ----
function Historico({data}){
  const [añoSel,setAñoSel]=useState('2025')
  // Para 2026: derivamos del Sheet en vivo - PROYECTOS (con BB-BH llenas) + FACTURACION (cobrado)
  // Staff: para 2026 lo calculamos APARTE desde Pagos_Staff por año (los nros de presu no siempre matchean proyectos)
  const facByPresu={};(data.facturacion||[]).forEach(f=>{facByPresu[String(f['N° Presupuesto'])]=f})
  const proy2026=(data.proyectos||[]).filter(p=>{const fe=String(p['Fecha Evento']||'').split('/');return fe[2]==='2026'}).map(p=>{
    const nro=String(p['N° presupuesto']||'')
    const f=facByPresu[nro]
    const subtotal=parseMonto(p['Subtotal'])
    const fee=parseMonto(p['Fee Agencia'])||parseMonto(p['Fee Final'])
    const impGan=parseMonto(p['Imp. Ganancias'])
    const iibb=parseMonto(p['IIBB'])
    const total=parseMonto(p['Total'])||parseMonto(p['Total '])
    const ivaCalc=f?parseMonto(f['IVA']):0
    const fechaEv=String(p['Fecha Evento']||'')
    const mesNum=parseInt((fechaEv.split('/')[1])||'0')||0
    // Calcular servicios "Somos Magma" + Diferencia
    let somosMagma = 0
    for (let j=1; j<=20; j++) {
      const staff = String(p['Staff '+j]||(j===1?p['Staff']:'')||'').trim()
      if (staff === 'Somos Magma') {
        const precio = parseMonto(p['Precio '+j]||(j===1?p['Precio']:''))
        if (precio > 0) somosMagma += precio
      }
    }
    const diferencia = parseMonto(p['Diferencia'])
    return {
      Año:'2026',Mes:mesNum,Fecha:fechaEv,Nro:nro,
      Cliente:p['Cliente']||(f?f['Cliente']:''),Agencia:p['Agencia']||(f?f['Agencia']:''),
      Proyecto:p['Proyecto']||(f?f['Proyecto']:''),
      Presupuesto:total||subtotal,Total:total,IVA:ivaCalc,
      // Magma = Fee + SM + Diferencia (ganancia neta)
      Magma:fee+somosMagma+diferencia,
      'Fee':fee,'Somos Magma':somosMagma,'Diferencia':diferencia,
      Impuestos:impGan+iibb,
      Viaticos:0,'Extra M':0,
      Cobrado:f&&isCobrada(f)?'SÍ':'NO',
      'Tipo FC':f?f['Tipo de Factura']:'','Nro FC':f?f['Nro de Factura']:'',
    }
  })
  const fuentes={
    '2023':data.historico2023||[],
    '2024':data.historico2024||[],
    '2025':data.historico2025||[],
    '2026':proy2026,
  }
  // Staff 2026: calcular desde Pagos_Staff filtrado por fecha de pago o mes referencia
  const NO_STAFF_2026=['magma','somos magma','viaticos','viáticos','rental','catering','produ','producción','produccion','makeup','make up','otros','efectivo']
  const staff2026={}
  let totalStaff2026=0
  ;(data.pagosStaff||[]).forEach(p=>{
    const fp=String(p['Fecha Pago']||'').split('/')
    const mr=String(p['Mes Referencia']||'')
    const esDe2026=fp[2]==='2026'||mr.includes('2026')
    if(!esDe2026)return
    const nombre=String(p['Freelancer']||'').trim()
    if(!nombre)return
    if(NO_STAFF_2026.some(n=>nombre.toLowerCase().includes(n)))return
    const monto=parseMonto(p['Monto Pagado'])||parseMonto(p['Monto Adeudado'])
    if(monto<=0)return
    totalStaff2026+=monto
    if(!staff2026[nombre])staff2026[nombre]={nombre,total:0,cant:0}
    staff2026[nombre].total+=monto
    staff2026[nombre].cant++
  })
  const años=['2023','2024','2025','2026']
  const filas=fuentes[añoSel]||[]
  const PAGOS_KEYS=['Pago 1','Pago 2','Pago 3','Pago 4','Pago 5','Pago 6']
  const totalPresupuestado=filas.reduce((s,r)=>s+parseMonto(r['Presupuesto']),0)
  const totalFacturado=filas.reduce((s,r)=>s+parseMonto(r['Total']),0)
  // Ganancia Magma:
  // - 2026: col Magma ya viene como NETA (Fee + SM + Diferencia). Impuestos NO se suman.
  // - 2024/2025: modelo legacy de Juan = Viáticos + Magma + Impuestos + Extra M
  const totalViaticos=filas.reduce((s,r)=>s+parseMonto(r['Viaticos']),0)
  const totalMagmaCol=filas.reduce((s,r)=>s+parseMonto(r['Magma']),0)
  const totalImpuestos=filas.reduce((s,r)=>s+parseMonto(r['Impuestos']),0)
  const totalExtraM=filas.reduce((s,r)=>s+parseMonto(r['Extra M']),0)
  const totalSomosMagma2026=añoSel==='2026'?filas.reduce((s,r)=>s+parseMonto(r['Somos Magma']),0):0
  const totalDiferencia2026=añoSel==='2026'?filas.reduce((s,r)=>s+parseMonto(r['Diferencia']),0):0
  const totalFee2026=añoSel==='2026'?filas.reduce((s,r)=>s+parseMonto(r['Fee']),0):0
  const gananciaMagma = añoSel==='2026'
    ? totalMagmaCol           // ya viene neta (Fee + SM + Diferencia)
    : totalViaticos+totalMagmaCol+totalImpuestos+totalExtraM  // legacy
  const totalStaffFromFilas=filas.reduce((s,r)=>s+PAGOS_KEYS.reduce((a,k)=>a+parseMonto(r[k]),0),0)
  const totalStaff=añoSel==='2026'?totalStaff2026:totalStaffFromFilas
  const totalIVA=filas.reduce((s,r)=>s+parseMonto(r['IVA']),0)
  const cantidad=filas.length
  const margenPct=totalPresupuestado>0?Math.round(gananciaMagma/totalPresupuestado*100):0

  // Top clientes año
  const clientesMap={}
  filas.forEach(r=>{
    const k=String(r['Cliente']||'—').trim()||'—'
    if(!clientesMap[k])clientesMap[k]={nombre:k,total:0,cant:0,cobrado:0}
    clientesMap[k].total+=parseMonto(r['Presupuesto'])
    clientesMap[k].cant++
    if(String(r['Cobrado']||'').toUpperCase().match(/SÍ|SI|OK/))clientesMap[k].cobrado+=parseMonto(r['Presupuesto'])
  })
  const topClientes=Object.values(clientesMap).sort((a,b)=>b.total-a.total).slice(0,10)

  // Top agencias
  const agenciasMap={}
  filas.forEach(r=>{
    const k=String(r['Agencia']||'').trim()
    if(!k)return
    if(!agenciasMap[k])agenciasMap[k]={nombre:k,total:0,cant:0}
    agenciasMap[k].total+=parseMonto(r['Presupuesto'])
    agenciasMap[k].cant++
  })
  const topAgencias=Object.values(agenciasMap).sort((a,b)=>b.total-a.total).slice(0,10)

  // Top staff - escanea 6 slots y excluye valores que son gastos internos (viaticos, rental, magma, etc)
  const staffMapFromFilas={}
  const NO_STAFF=['magma','somos magma','viaticos','viáticos','rental','catering','produ','producción','produccion','makeup','make up','otros','efectivo']
  filas.forEach(r=>{
    for(let i=1;i<=6;i++){
      const nombre=String(r['Staff '+i]||'').trim()
      const pago=parseMonto(r['Pago '+i])
      if(!nombre||pago<=0)continue
      if(NO_STAFF.some(n=>nombre.toLowerCase().includes(n)))continue
      if(!staffMapFromFilas[nombre])staffMapFromFilas[nombre]={nombre,total:0,cant:0}
      staffMapFromFilas[nombre].total+=pago
      staffMapFromFilas[nombre].cant++
    }
  })
  // Para 2026 usamos staff2026 calculado desde Pagos_Staff por año
  const staffMap=añoSel==='2026'?staff2026:staffMapFromFilas
  const topStaff=Object.values(staffMap).sort((a,b)=>b.total-a.total).slice(0,15)

  // Por mes
  const MESES=['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const porMes={}
  for(let i=1;i<=12;i++)porMes[i]={mes:i,cantidad:0,presupuestado:0,facturado:0,magma:0,staff:0}
  filas.forEach(r=>{
    const m=parseInt(r['Mes'])||0
    if(m<1||m>12)return
    porMes[m].cantidad++
    porMes[m].presupuestado+=parseMonto(r['Presupuesto'])
    porMes[m].facturado+=parseMonto(r['Total'])
    porMes[m].magma+=parseMonto(r['Viaticos'])+parseMonto(r['Magma'])+parseMonto(r['Impuestos'])+parseMonto(r['Extra M'])
    porMes[m].staff+=PAGOS_KEYS.reduce((a,k)=>a+parseMonto(r[k]),0)
  })

  // Comparativa años - ganancia = Viaticos+Magma+Impuestos+Extra M
  const yrStats=años.map(a=>{
    const rows=fuentes[a]||[]
    const pres=rows.reduce((s,r)=>s+parseMonto(r['Presupuesto']),0)
    const magma=rows.reduce((s,r)=>s+parseMonto(r['Viaticos'])+parseMonto(r['Magma'])+parseMonto(r['Impuestos'])+parseMonto(r['Extra M']),0)
    return {año:a,cantidad:rows.length,presupuestado:pres,magma,margen:pres>0?magma/pres:0}
  })

  const mesMax=Math.max(...Object.values(porMes).map(m=>m.presupuestado),1)

  return <div>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14,flexWrap:'wrap'}}>
      <div style={{fontSize:13,fontWeight:500,color:'#555'}}>Vista histórica de la productora</div>
      <div style={{display:'flex',gap:4,marginLeft:'auto'}}>{años.map(a=><button key={a} style={{...S.fb,...(a===añoSel?S.fa:{})}} onClick={()=>setAñoSel(a)}>{a}</button>)}</div>
    </div>

    {/* KPIs del año */}
    <div style={S.k4}>
      <K lbl='Proyectos' val={cantidad} sub={'año '+añoSel} c='#1543F8'/>
      <K lbl='Facturación' val={fmtM(totalPresupuestado)} sub={fmt(totalPresupuestado)+' sin IVA'} c='#1D9E75'/>
      <K lbl='Ganancia neta Magma' val={fmtM(gananciaMagma)} sub={añoSel==='2026'
        ? margenPct+'% margen · Fee '+fmtM(totalFee2026)+' · SM '+fmtM(totalSomosMagma2026)+' · Dif '+fmtM(totalDiferencia2026)
        : margenPct+'% margen · V '+fmtM(totalViaticos)+' · M '+fmtM(totalMagmaCol)+' · X '+fmtM(totalExtraM)} c='#1D9E75'/>
      {añoSel==='2026'&&<K lbl='Impuestos al fisco' val={fmtM(totalImpuestos)} sub='35% Gan + 4% IIBB s/Fee (cliente paga, empresa paga)' c='#E24B4A'/>}
      <K lbl='A Staff' val={'-'+fmtM(totalStaff)} sub={Object.keys(staffMap).length+' personas'} c='#BA7517'/>
    </div>

    {/* Comparativa años */}
    <div style={{...S.card,marginBottom:12}}>
      <div style={S.ch}>Comparativa anual — evolución de la productora</div>
      <div style={{display:'grid',gridTemplateColumns:'80px 1fr 1fr 1fr 1fr',padding:'8px 14px',background:'#1A1A1A'}}>
        {['Año','Proyectos','Facturado','Ganancia','Margen'].map(h=><div key={h} style={{fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'.06em'}}>{h}</div>)}
      </div>
      {yrStats.map((y,i)=>{
        const prev=i>0?yrStats[i-1]:null
        const growth=prev&&prev.presupuestado>0?Math.round((y.presupuestado-prev.presupuestado)/prev.presupuestado*100):null
        return <div key={y.año} style={{display:'grid',gridTemplateColumns:'80px 1fr 1fr 1fr 1fr',padding:'9px 14px',borderBottom:'0.5px solid #1A1A1A',fontSize:13}}>
          <div style={{fontWeight:500,color:y.año===añoSel?'#1543F8':'inherit'}}>{y.año}</div>
          <div style={{fontFamily:'monospace'}}>{y.cantidad}</div>
          <div style={{fontFamily:'monospace'}}>{fmtM(y.presupuestado)} {growth!==null&&<span style={{fontSize:10,color:growth>=0?'#1D9E75':'#E24B4A',marginLeft:4}}>{growth>=0?'+':''}{growth}%</span>}</div>
          <div style={{fontFamily:'monospace',color:'#1D9E75'}}>{fmtM(y.magma)}</div>
          <div style={{fontFamily:'monospace',color:'#1D9E75'}}>{Math.round(y.margen*100)}%</div>
        </div>
      })}
    </div>

    {/* Evolución mensual */}
    <div style={{...S.card,marginBottom:12}}>
      <div style={S.ch}>Evolución mensual {añoSel}</div>
      <div style={{padding:'12px 14px'}}>
        {Object.values(porMes).map(m=>{
          if(m.cantidad===0&&añoSel!=='2026')return null
          const pct=mesMax>0?Math.round(m.presupuestado/mesMax*100):0
          return <div key={m.mes} style={{display:'grid',gridTemplateColumns:'40px 1fr 120px 100px 80px',alignItems:'center',gap:8,padding:'4px 0',fontSize:12}}>
            <div style={{color:'#555',fontSize:11}}>{MESES[m.mes]}</div>
            <div style={{position:'relative',height:14,background:'#1A1A1A',borderRadius:3,overflow:'hidden'}}>
              <div style={{position:'absolute',left:0,top:0,bottom:0,width:pct+'%',background:'linear-gradient(90deg,#1543F8,#9635AB)',transition:'width 0.3s'}}/>
            </div>
            <div style={{fontFamily:'monospace',textAlign:'right'}}>{fmtM(m.presupuestado)}</div>
            <div style={{fontFamily:'monospace',textAlign:'right',color:'#1D9E75',fontSize:11}}>+{fmtM(m.magma)}</div>
            <div style={{fontFamily:'monospace',textAlign:'right',color:'#555',fontSize:11}}>{m.cantidad} proys</div>
          </div>
        })}
      </div>
    </div>

    {/* Top clientes + staff */}
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
      <div style={S.card}>
        <div style={S.ch}>Top 10 clientes {añoSel}</div>
        {topClientes.length===0?<div style={{padding:14,color:'#555',fontSize:12}}>Sin datos</div>:
        topClientes.map((c,i)=><div key={i} style={S.lr}>
          <span style={{width:24,color:'#555',fontSize:11}}>#{i+1}</span>
          <span style={{flex:1,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.nombre}</span>
          <span style={{fontSize:10,color:'#555',marginRight:8}}>{c.cant}p</span>
          <span style={{fontFamily:'monospace',fontSize:12}}>{fmtM(c.total)}</span>
        </div>)}
      </div>
      <div style={S.card}>
        <div style={S.ch}>Top 15 staff (lo que les pagaste) {añoSel}</div>
        {topStaff.length===0?<div style={{padding:14,color:'#555',fontSize:12}}>Sin datos</div>:
        topStaff.map((s,i)=><div key={i} style={S.lr}>
          <span style={{width:24,color:'#555',fontSize:11}}>#{i+1}</span>
          <span style={{flex:1,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.nombre}</span>
          <span style={{fontSize:10,color:'#555',marginRight:8}}>{s.cant} trabajos</span>
          <span style={{fontFamily:'monospace',fontSize:12,color:'#BA7517'}}>{fmtM(s.total)}</span>
        </div>)}
      </div>
    </div>

    {/* Top agencias */}
    <div style={S.card}>
      <div style={S.ch}>Top 10 agencias {añoSel}</div>
      {topAgencias.length===0?<div style={{padding:14,color:'#555',fontSize:12}}>Sin datos</div>:
      topAgencias.map((a,i)=><div key={i} style={S.lr}>
        <span style={{width:24,color:'#555',fontSize:11}}>#{i+1}</span>
        <span style={{flex:1,fontSize:13}}>{a.nombre}</span>
        <span style={{fontSize:10,color:'#555',marginRight:8}}>{a.cant} proyectos</span>
        <span style={{fontFamily:'monospace',fontSize:12}}>{fmtM(a.total)}</span>
      </div>)}
    </div>

    {filas.length===0&&<div style={{background:'#1E1E1E',border:'0.5px solid #BA7517',borderRadius:8,padding:'14px 18px',marginTop:12}}>
      <div style={{fontSize:12,color:'#BA7517',fontWeight:500,marginBottom:4}}>Sin datos del {añoSel} cargados todavía</div>
      <div style={{fontSize:11,color:'#888',lineHeight:1.5}}>Usá el botón "Admin tools" en la sidebar izquierda → "Backfill {añoSel}" para traer los datos. Primero "dry" para ver cuántas filas. Después "escribir" para guardar.<br/>Si es la primera vez, antes corré "Setup hojas nuevas" para crear la hoja HISTORICO_{añoSel} en Master Magma.<br/><br/><strong>IMPORTANTE:</strong> la cuenta de servicio de la app (GOOGLE_CLIENT_EMAIL) tiene que tener permiso de lectura sobre los sheets originales:<br/>• ADMIN MAGMA (2024/2025)<br/>• ADMIN MAGMA Back up (2023)</div>
    </div>}
  </div>
}

function K({lbl,val,sub,c}){return <div style={S.kpi}><div style={S.kl}>{lbl}</div><div style={{...S.kv,...(c?{color:c}:{})}}>{val}</div>{sub&&<div style={S.ks}>{sub}</div>}</div>}
function Row({cols,vc}){return <div style={S.lr}><span style={{color:'#1543F8',fontFamily:'monospace',fontSize:11,flexShrink:0}}>{cols[0]}</span><span style={{flex:1,marginLeft:10,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cols[1]}</span><span style={{fontFamily:'monospace',fontSize:12,color:vc||'inherit'}}>{cols[2]}</span></div>}

// Paleta consolidada (de 6 niveles de gris a 3 + acentos)
// Fondos: #0A0A0A (app) → #161616 (card) → #1E1E1E (input/hover)
// Texto: #F0F0F0 (principal) → #B0B0B0 (secundario) → #777 (terciario/labels)
// Bordes: #262626 (sutil) → #333 (input) → #404040 (hover)
const S={
  app:{display:'flex',height:'100vh',overflow:'hidden'},
  sb:{width:220,background:'#161616',borderRight:'1px solid #262626',display:'flex',flexDirection:'column',flexShrink:0},
  logo:{fontSize:22,fontWeight:900,background:'linear-gradient(135deg,#1543F8,#9635AB,#CE2637)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'},
  ls:{fontFamily:"'Azeret Mono',monospace",fontSize:9,color:'#777',letterSpacing:'0.12em',textTransform:'uppercase',marginTop:2},
  ni:{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:6,cursor:'pointer',color:'#B0B0B0',fontSize:13,fontWeight:500,transition:'all 0.15s',marginBottom:2,border:'none',background:'transparent',width:'100%',textAlign:'left'},
  k4:{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:10,marginBottom:12},
  kpi:{background:'#1E1E1E',borderRadius:8,padding:'12px 14px'},
  kl:{fontSize:11,color:'#888',marginBottom:4,fontWeight:500,letterSpacing:'.02em'},
  kv:{fontSize:19,fontWeight:600,color:'#F0F0F0'},
  ks:{fontSize:11,color:'#888',marginTop:3},
  card:{background:'#161616',border:'0.5px solid #262626',borderRadius:10,overflow:'hidden',marginBottom:8},
  ch:{padding:'11px 14px',background:'#1A1A1A',borderBottom:'0.5px solid #262626',fontSize:12,fontWeight:600,color:'#E0E0E0',letterSpacing:'.02em'},
  lr:{display:'flex',alignItems:'center',padding:'10px 14px',borderBottom:'0.5px solid #262626',fontSize:13},
  badge:{display:'inline-flex',padding:'3px 9px',borderRadius:4,fontSize:11,whiteSpace:'nowrap',fontWeight:500},
  td:{padding:'10px 12px',borderBottom:'0.5px solid #1E1E1E',fontSize:13,color:'#D8D8D8'},
  fb:{padding:'6px 12px',borderRadius:6,border:'0.5px solid #333',background:'transparent',color:'#888',fontSize:11.5,cursor:'pointer',fontWeight:500,transition:'all 0.15s'},
  fa:{background:'#1E1E1E',color:'#F0F0F0',borderColor:'#555'},
  nd:{textAlign:'center',padding:48,color:'#888',fontSize:13},
  inp:{width:'100%',padding:'10px 12px',borderRadius:8,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontSize:14,outline:'none',marginBottom:12},
  bp:{width:'100%',padding:10,borderRadius:8,border:'none',background:'#1543F8',color:'#fff',fontSize:14,fontWeight:500,cursor:'pointer'},
  lw:{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#090909'},
  lb:{background:'#161616',border:'0.5px solid #2A2A2A',borderRadius:16,padding:'40px 36px',width:360,textAlign:'center'},
  sp:{width:24,height:24,border:'2px solid #1543F820',borderTop:'2px solid #1543F8',borderRadius:'50%',animation:'spin 1s linear infinite',marginTop:16},
}

function GS(){return <style>{"@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@300;400;500;700;900&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{background:#090909;color:#F0F0F0;font-family:'Archivo',sans-serif;font-size:14px;overflow:hidden}@keyframes spin{to{transform:rotate(360deg)}}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#333;border-radius:2px}input[type=number]::-webkit-inner-spin-button{opacity:0}"}</style>}

// ---- AGENCIAS ----
function Agencias({data,mail,onRefresh}){
  const agencias=data?.agencias||[]
  const presus=data?.presupuestos||[]
  const proy=data?.proyectos||[]
  const fact=data?.facturacion||[]
  const contactos=data?.contactos||[]
  const [q,setQ]=useState('')
  const [sel,setSel]=useState(null)
  const [editando,setEditando]=useState(false)

  const norm=v=>String(v||'').toLowerCase()
  const metrics=ag=>{
    const nom=norm(ag['Nombre'])
    const ps=presus.filter(p=>norm(p['Agencia'])===nom)
    const pys=proy.filter(p=>norm(p['Agencia'])===nom)
    const fs=fact.filter(f=>norm(f['Agencia'])===nom)
    const cobrado=fs.filter(f=>String(f['Cobrado']||'').toUpperCase()==='TRUE').reduce((s,f)=>s+parseMonto(f['Precio FINAL']),0)
    const aprobados=ps.filter(p=>String(p['Estado']||'').toUpperCase()==='APROBADO').length
    return {presus:ps.length,proy:pys.length,fact:fs.length,cobrado,aprobados}
  }

  const filtradas=agencias.filter(a=>!q||norm(a['Nombre']).includes(norm(q))||norm(a['CUIT']).includes(norm(q)))
  .map(a=>({...a,_m:metrics(a)}))
  .sort((a,b)=>b._m.presus-a._m.presus)

  if(sel){
    const m=metrics(sel)
    const psList=presus.filter(p=>norm(p['Agencia'])===norm(sel['Nombre'])).sort((a,b)=>{const fa=String(a['Fecha Presupuesto']||a['Fecha Evento']||'').split('/').reverse().join('-');const fb=String(b['Fecha Presupuesto']||b['Fecha Evento']||'').split('/').reverse().join('-');return fb.localeCompare(fa)})
    const ctsList=contactos.filter(c=>norm(c['Agencia'])===norm(sel['Nombre']))
    return <div>
      <button onClick={()=>setSel(null)} style={{padding:'6px 14px',borderRadius:6,border:'0.5px solid #333',background:'transparent',color:'#888',fontSize:12,cursor:'pointer',marginBottom:14}}>← Volver a listado</button>
      <FichaAgencia ag={sel} m={m} presus={psList} contactos={ctsList} mail={mail} onSaved={(updated)=>{Object.assign(sel,updated);setEditando(false);if(onRefresh)setTimeout(onRefresh,800)}} editando={editando} setEditando={setEditando}/>
    </div>
  }

  return <div>
    <div style={{display:'flex',gap:10,marginBottom:14,alignItems:'center'}}>
      <input style={{...S.inp,flex:1,marginBottom:0}} placeholder='Buscar por nombre o CUIT...' value={q} onChange={e=>setQ(e.target.value)}/>
      <span style={{fontSize:11,color:'#555'}}>{filtradas.length} agencias</span>
    </div>
    <div style={{overflowY:'auto',maxHeight:'calc(100vh - 200px)'}}>
      <table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead><tr style={{background:'#1A1A1A',position:'sticky',top:0}}>
          {['Nombre','CUIT','Cond. IVA','Presus','Aprobados','Facturas','Cobrado','Datos'].map(h=><th key={h} style={{fontSize:10,color:'#555',padding:'8px 12px',textAlign:'left',fontWeight:400,textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:'0.5px solid #2A2A2A'}}>{h}</th>)}
        </tr></thead>
        <tbody>
          {filtradas.map((a,i)=>{
            const datosOK=!!a['CUIT']&&!!a['Condicion IVA']
            return <tr key={a['Nombre']} style={{background:i%2===0?'#161616':'#1A1A1A',cursor:'pointer'}} onClick={()=>setSel(a)}>
              <td style={{...S.td,fontWeight:500}}>{a['Nombre']}</td>
              <td style={{...S.td,fontSize:11,fontFamily:'monospace',color:a['CUIT']?'#ccc':'#555'}}>{a['CUIT']||'(falta)'}</td>
              <td style={{...S.td,fontSize:11,color:a['Condicion IVA']?'#ccc':'#555'}}>{a['Condicion IVA']||'(falta)'}</td>
              <td style={{...S.td,fontSize:12}}>{a._m.presus}</td>
              <td style={{...S.td,fontSize:12,color:'#1D9E75'}}>{a._m.aprobados}</td>
              <td style={{...S.td,fontSize:12}}>{a._m.fact}</td>
              <td style={{...S.td,fontFamily:'monospace',fontSize:11,color:'#1D9E75'}}>{a._m.cobrado>0?fmtM(a._m.cobrado):'—'}</td>
              <td style={{...S.td}}>{!datosOK?<span style={{padding:'2px 6px',borderRadius:3,border:'0.5px solid #E24B4A',background:'#E24B4A15',color:'#E24B4A',fontSize:9}}>⚠ Completar</span>:<span style={{color:'#1D9E75',fontSize:10}}>✓</span>}</td>
            </tr>
          })}
        </tbody>
      </table>
    </div>
  </div>
}

function FichaAgencia({ag,m,presus,contactos,mail,onSaved,editando,setEditando}){
  const [form,setForm]=useState({
    cuit:ag['CUIT']||'',
    condIVA:ag['Condicion IVA']||'Responsable Inscripto',
    mailFact:ag['Mail facturacion']||'',
    telefono:ag['Telefono']||'',
    direccion:ag['Direccion fiscal']||'',
    notas:ag['Notas']||'',
  })
  const [saving,setSaving]=useState(false)
  const guardar=async()=>{
    setSaving(true)
    try{
      const r=await fetch('/api/agencia-upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:ag['Nombre'],cuit:form.cuit,condIVA:form.condIVA,mailFact:form.mailFact,telefono:form.telefono,direccion:form.direccion,notas:form.notas})})
      const j=await r.json()
      if(j.ok)onSaved({'CUIT':form.cuit,'Condicion IVA':form.condIVA,'Mail facturacion':form.mailFact,'Telefono':form.telefono,'Direccion fiscal':form.direccion,'Notas':form.notas})
    }catch(e){}
    setSaving(false)
  }
  const inp={background:'#1E1E1E',border:'0.5px solid #333',borderRadius:6,color:'#F0F0F0',fontSize:12,padding:'7px 10px',outline:'none',width:'100%'}
  const lbl={fontSize:10,color:'#555',display:'block',marginBottom:4,textTransform:'uppercase',letterSpacing:'.06em'}
  return <div style={{display:'grid',gridTemplateColumns:'1fr 1.4fr',gap:14}}>
    <div>
      <div style={{...S.card,padding:16,marginBottom:12}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          <div style={{fontSize:18,fontWeight:600}}>{ag['Nombre']}</div>
          {!editando?<button onClick={()=>setEditando(true)} style={{padding:'4px 10px',borderRadius:4,border:'0.5px solid #333',background:'transparent',color:'#888',fontSize:11,cursor:'pointer'}}>Editar</button>:null}
        </div>
        {editando?<div>
          <label><span style={lbl}>CUIT</span><input style={inp} value={form.cuit} onChange={e=>setForm(p=>({...p,cuit:e.target.value}))}/></label>
          <div style={{marginTop:8}}/>
          <label><span style={lbl}>Condición IVA</span><select style={inp} value={form.condIVA} onChange={e=>setForm(p=>({...p,condIVA:e.target.value}))}><option>Responsable Inscripto</option><option>Monotributo</option><option>Consumidor Final</option><option>Exento</option></select></label>
          <div style={{marginTop:8}}/>
          <label><span style={lbl}>Mail facturación</span><input style={inp} value={form.mailFact} onChange={e=>setForm(p=>({...p,mailFact:e.target.value}))}/></label>
          <div style={{marginTop:8}}/>
          <label><span style={lbl}>Teléfono</span><input style={inp} value={form.telefono} onChange={e=>setForm(p=>({...p,telefono:e.target.value}))}/></label>
          <div style={{marginTop:8}}/>
          <label><span style={lbl}>Dirección fiscal</span><input style={inp} value={form.direccion} onChange={e=>setForm(p=>({...p,direccion:e.target.value}))}/></label>
          <div style={{marginTop:8}}/>
          <label><span style={lbl}>Notas</span><textarea style={{...inp,minHeight:50}} value={form.notas} onChange={e=>setForm(p=>({...p,notas:e.target.value}))}/></label>
          <div style={{display:'flex',gap:8,marginTop:12}}>
            <button onClick={()=>setEditando(false)} style={{flex:1,padding:8,borderRadius:6,border:'0.5px solid #333',background:'transparent',color:'#888',fontSize:12,cursor:'pointer'}}>Cancelar</button>
            <button onClick={guardar} disabled={saving} style={{flex:1,padding:8,borderRadius:6,border:'none',background:'#1D9E75',color:'#fff',fontSize:12,fontWeight:500,cursor:'pointer',opacity:saving?0.5:1}}>{saving?'...':'Guardar'}</button>
          </div>
        </div>:<div style={{display:'flex',flexDirection:'column',gap:10}}>
          {[['CUIT',ag['CUIT']],['Condición IVA',ag['Condicion IVA']],['Mail facturación',ag['Mail facturacion']],['Teléfono',ag['Telefono']],['Dirección fiscal',ag['Direccion fiscal']],['Notas',ag['Notas']]].map(([k,v])=>(
            <div key={k} style={{display:'flex',justifyContent:'space-between',fontSize:12,borderBottom:'0.5px solid #1E1E1E',paddingBottom:6}}>
              <span style={{color:'#555'}}>{k}</span>
              <span style={{color:v?'#F0F0F0':'#555',fontFamily:k==='CUIT'?'monospace':'inherit'}}>{v||'(falta)'}</span>
            </div>
          ))}
        </div>}
      </div>
      <div style={{...S.card,padding:16}}>
        <div style={{fontSize:11,color:'#555',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10}}>Métricas</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,fontSize:12}}>
          {[['Total presupuestos',m.presus,'#F0F0F0'],['Aprobados',m.aprobados,'#1D9E75'],['Proyectos',m.proy,'#1543F8'],['Facturas emitidas',m.fact,'#BA7517'],['Total cobrado',fmtM(m.cobrado),'#1D9E75']].map(([k,v,c],i)=>(
            <div key={i} style={{background:'#1E1E1E',borderRadius:6,padding:'8px 10px'}}>
              <div style={{fontSize:9,color:'#555',textTransform:'uppercase',letterSpacing:'.06em'}}>{k}</div>
              <div style={{fontSize:16,fontWeight:600,color:c,fontFamily:'monospace',marginTop:3}}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
    <div>
      <div style={{...S.card,padding:14,marginBottom:12,maxHeight:300,overflowY:'auto'}}>
        <div style={{fontSize:11,color:'#555',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10}}>Histórico de presupuestos ({presus.length})</div>
        {presus.length===0?<div style={{fontSize:12,color:'#555',padding:8}}>Sin presupuestos</div>:<table style={{width:'100%',fontSize:11}}>
          <tbody>{presus.slice(0,40).map(p=><tr key={p['Columna 1']} style={{borderBottom:'0.5px solid #1E1E1E'}}>
            <td style={{padding:'5px 6px',fontFamily:'monospace',color:'#1543F8'}}>#{p['Columna 1']}</td>
            <td style={{padding:'5px 6px'}}>{p['Cliente']||'—'}</td>
            <td style={{padding:'5px 6px',color:'#888',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p['Proyecto']||'—'}</td>
            <td style={{padding:'5px 6px',color:'#555',fontSize:10}}>{p['Fecha Evento']||p['Fecha Presupuesto']||'—'}</td>
            <td style={{padding:'5px 6px',fontFamily:'monospace'}}>{fmtM(parseMonto(p['Precio Final']))}</td>
            <td style={{padding:'5px 6px',fontSize:9}}>{p['Estado']==='APROBADO'?<span style={{color:'#1D9E75'}}>✓</span>:p['Estado']==='DESAPROBADO'?<span style={{color:'#E24B4A'}}>✗</span>:p['Estado']==='EN ESPERA'?<span style={{color:'#BA7517'}}>⏳</span>:<span style={{color:'#888'}}>·</span>}</td>
          </tr>)}</tbody>
        </table>}
      </div>
      <div style={{...S.card,padding:14}}>
        <div style={{fontSize:11,color:'#555',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10}}>Contactos ({contactos.length})</div>
        {contactos.length===0?<div style={{fontSize:12,color:'#555',padding:8}}>Sin contactos asociados</div>:contactos.slice(0,10).map((c,i)=><div key={i} style={{padding:'6px 0',borderBottom:'0.5px solid #1E1E1E',fontSize:11}}>
          <div style={{fontWeight:500}}>{c['Nombre']}</div>
          <div style={{color:'#888',fontSize:10}}>{c['Cargo']||'—'} · {c['Mail']||'—'} · {c['Teléfono']||c['Telefono']||'—'}</div>
        </div>)}
      </div>
    </div>
  </div>
}

// ---- CLIENTES ----
function Clientes({data,mail}){
  const clientes=data?.clientes||[]
  const presus=data?.presupuestos||[]
  const fact=data?.facturacion||[]
  const [q,setQ]=useState('')
  const [sel,setSel]=useState(null)

  const norm=v=>String(v||'').toLowerCase()
  const metrics=cli=>{
    const nom=norm(cli['Nombre'])
    const ps=presus.filter(p=>norm(p['Cliente'])===nom)
    const fs=fact.filter(f=>norm(f['Cliente'])===nom)
    const cobrado=fs.filter(f=>String(f['Cobrado']||'').toUpperCase()==='TRUE').reduce((s,f)=>s+parseMonto(f['Precio FINAL']),0)
    return {presus:ps.length,fact:fs.length,cobrado}
  }
  const filtrados=clientes.filter(c=>!q||norm(c['Nombre']).includes(norm(q))).map(c=>({...c,_m:metrics(c)})).sort((a,b)=>parseInt(b['Cant. presus historicos']||0)-parseInt(a['Cant. presus historicos']||0))

  if(sel){
    const m=metrics(sel)
    const psList=presus.filter(p=>norm(p['Cliente'])===norm(sel['Nombre']))
    const fsList=fact.filter(f=>norm(f['Cliente'])===norm(sel['Nombre']))
    return <div>
      <button onClick={()=>setSel(null)} style={{padding:'6px 14px',borderRadius:6,border:'0.5px solid #333',background:'transparent',color:'#888',fontSize:12,cursor:'pointer',marginBottom:14}}>← Volver a listado</button>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1.4fr',gap:14}}>
        <div>
          <div style={{...S.card,padding:16,marginBottom:12}}>
            <div style={{fontSize:18,fontWeight:600,marginBottom:14}}>{sel['Nombre']}</div>
            <div style={{display:'flex',flexDirection:'column',gap:8,fontSize:12}}>
              {[['Agencia habitual',sel['Agencia habitual']],['Industria',sel['Industria']],['Primera vez',sel['Primera vez']],['Última vez',sel['Ultima vez']],['Cant. histórica',sel['Cant. presus historicos']],['Notas',sel['Notas']]].map(([k,v])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',borderBottom:'0.5px solid #1E1E1E',paddingBottom:6}}>
                  <span style={{color:'#555'}}>{k}</span>
                  <span style={{color:v?'#F0F0F0':'#555'}}>{v||'—'}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{...S.card,padding:16}}>
            <div style={{fontSize:11,color:'#555',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10}}>Métricas actuales</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              {[['Presupuestos vivos',m.presus,'#F0F0F0'],['Facturas',m.fact,'#BA7517'],['Cobrado',fmtM(m.cobrado),'#1D9E75']].map(([k,v,c],i)=>(
                <div key={i} style={{background:'#1E1E1E',borderRadius:6,padding:'8px 10px'}}>
                  <div style={{fontSize:9,color:'#555',textTransform:'uppercase'}}>{k}</div>
                  <div style={{fontSize:14,fontWeight:600,color:c,fontFamily:'monospace',marginTop:3}}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div>
          <div style={{...S.card,padding:14,marginBottom:12,maxHeight:300,overflowY:'auto'}}>
            <div style={{fontSize:11,color:'#555',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10}}>Presupuestos ({psList.length})</div>
            {psList.length===0?<div style={{fontSize:12,color:'#555',padding:8}}>Sin presupuestos</div>:<table style={{width:'100%',fontSize:11}}>
              <tbody>{psList.slice(0,40).map(p=><tr key={p['Columna 1']} style={{borderBottom:'0.5px solid #1E1E1E'}}>
                <td style={{padding:'5px 6px',fontFamily:'monospace',color:'#1543F8'}}>#{p['Columna 1']}</td>
                <td style={{padding:'5px 6px'}}>{p['Agencia']||'—'}</td>
                <td style={{padding:'5px 6px',color:'#888',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p['Proyecto']||'—'}</td>
                <td style={{padding:'5px 6px',color:'#555',fontSize:10}}>{p['Fecha Evento']||'—'}</td>
                <td style={{padding:'5px 6px',fontFamily:'monospace'}}>{fmtM(parseMonto(p['Precio Final']))}</td>
              </tr>)}</tbody>
            </table>}
          </div>
        </div>
      </div>
    </div>
  }

  return <div>
    <div style={{display:'flex',gap:10,marginBottom:14,alignItems:'center'}}>
      <input style={{...S.inp,flex:1,marginBottom:0}} placeholder='Buscar cliente...' value={q} onChange={e=>setQ(e.target.value)}/>
      <span style={{fontSize:11,color:'#555'}}>{filtrados.length} clientes</span>
    </div>
    <div style={{overflowY:'auto',maxHeight:'calc(100vh - 200px)'}}>
      <table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead><tr style={{background:'#1A1A1A',position:'sticky',top:0}}>
          {['Nombre','Agencia habitual','Histórico','Presus activos','Facturas','Cobrado','Última vez'].map(h=><th key={h} style={{fontSize:10,color:'#555',padding:'8px 12px',textAlign:'left',fontWeight:400,textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:'0.5px solid #2A2A2A'}}>{h}</th>)}
        </tr></thead>
        <tbody>
          {filtrados.map((c,i)=><tr key={c['Nombre']} style={{background:i%2===0?'#161616':'#1A1A1A',cursor:'pointer'}} onClick={()=>setSel(c)}>
            <td style={{...S.td,fontWeight:500}}>{c['Nombre']}</td>
            <td style={{...S.td,fontSize:11,color:'#888'}}>{c['Agencia habitual']||'—'}</td>
            <td style={{...S.td,fontSize:12}}>{c['Cant. presus historicos']||'0'}</td>
            <td style={{...S.td,fontSize:12,color:'#1D9E75'}}>{c._m.presus}</td>
            <td style={{...S.td,fontSize:12}}>{c._m.fact}</td>
            <td style={{...S.td,fontFamily:'monospace',fontSize:11,color:'#1D9E75'}}>{c._m.cobrado>0?fmtM(c._m.cobrado):'—'}</td>
            <td style={{...S.td,fontSize:11,color:'#555'}}>{c['Ultima vez']||'—'}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>
}

// ---- CONTACTOS ----
function Contactos({data,mail}){
  const contactos=data?.contactos||[]
  const [q,setQ]=useState('')
  const [agFilter,setAgFilter]=useState('todas')
  const [editandoFila,setEditandoFila]=useState(null)
  const [editForm,setEditForm]=useState({})
  const [saving,setSaving]=useState(false)
  const [toast,setToast]=useState('')

  const norm=v=>String(v||'').toLowerCase()
  const agencias=[...new Set(contactos.map(c=>c['Agencia']).filter(Boolean))].sort()
  const filtrados=contactos.filter(c=>{
    const matchQ=!q||[c['Nombre'],c['Mail'],c['Agencia'],c['Cargo'],c['Teléfono'],c['Cuit']].some(v=>norm(v).includes(norm(q)))
    const matchAg=agFilter==='todas'||c['Agencia']===agFilter
    return matchQ&&matchAg
  }).sort((a,b)=>(a['Nombre']||'').localeCompare(b['Nombre']||''))

  const empezarEditar=(c,i)=>{setEditandoFila(i);setEditForm({nombre:c['Nombre']||'',mail:c['Mail']||'',agencia:c['Agencia']||'',cargo:c['Cargo']||'',telefono:c['Teléfono']||'',cuit:c['Cuit']||''})}
  const guardarEdit=async(c)=>{
    setSaving(true)
    try{
      const r=await fetch('/api/contacto-editar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombreOriginal:c['Nombre'],agenciaOriginal:c['Agencia'],cambios:editForm})})
      const j=await r.json()
      if(j.ok){setToast('Contacto actualizado ✓');setTimeout(()=>setToast(''),2000);setEditandoFila(null)}
      else{alert('Error: '+(j.error||'?'))}
    }catch(e){alert('Error: '+e.message)}
    setSaving(false)
  }

  const inp={padding:'5px 7px',borderRadius:4,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontSize:11,outline:'none',width:'100%',fontFamily:'inherit',boxSizing:'border-box'}

  return <div>
    {toast&&<div style={{position:'fixed',bottom:20,right:20,background:'#1D9E75',color:'#fff',padding:'8px 16px',borderRadius:8,fontSize:12,zIndex:999}}>{toast}</div>}
    <div style={{display:'flex',gap:10,marginBottom:14,alignItems:'center',flexWrap:'wrap'}}>
      <input style={{...S.inp,flex:1,minWidth:200,marginBottom:0}} placeholder='Buscar nombre, mail, CUIT, agencia, teléfono...' value={q} onChange={e=>setQ(e.target.value)}/>
      <select style={{padding:'7px 10px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontSize:12,outline:'none'}} value={agFilter} onChange={e=>setAgFilter(e.target.value)}>
        <option value='todas'>Todas las agencias ({contactos.length})</option>
        {agencias.map(a=><option key={a} value={a}>{a}</option>)}
      </select>
      <span style={{fontSize:11,color:'#555'}}>{filtrados.length} contactos</span>
    </div>
    <div style={{overflowY:'auto',maxHeight:'calc(100vh - 200px)'}}>
      <table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead><tr style={{background:'#1A1A1A',position:'sticky',top:0,zIndex:1}}>
          {['Nombre','Agencia','Cargo','Mail','Teléfono','CUIT',''].map(h=><th key={h} style={{fontSize:10,color:'#555',padding:'8px 12px',textAlign:'left',fontWeight:400,textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:'0.5px solid #2A2A2A'}}>{h}</th>)}
        </tr></thead>
        <tbody>
          {filtrados.map((c,i)=>{
            const editando=editandoFila===i
            return <tr key={i} style={{background:i%2===0?'#161616':'#1A1A1A'}}>
              <td style={{...S.td,fontSize:12,fontWeight:500}}>{editando?<input style={inp} value={editForm.nombre} onChange={e=>setEditForm(p=>({...p,nombre:e.target.value}))}/>:c['Nombre']||'—'}</td>
              <td style={{...S.td,fontSize:11,color:'#888'}}>{editando?<input style={inp} value={editForm.agencia} onChange={e=>setEditForm(p=>({...p,agencia:e.target.value}))}/>:c['Agencia']||'—'}</td>
              <td style={{...S.td,fontSize:11,color:'#555'}}>{editando?<input style={inp} value={editForm.cargo} onChange={e=>setEditForm(p=>({...p,cargo:e.target.value}))}/>:c['Cargo']||'—'}</td>
              <td style={{...S.td,fontSize:11}}>{editando?<input style={inp} type='email' value={editForm.mail} onChange={e=>setEditForm(p=>({...p,mail:e.target.value}))}/>:c['Mail']?<a href={'mailto:'+c['Mail']} style={{color:'#1543F8',textDecoration:'none'}}>{c['Mail']}</a>:<span style={{color:'#555'}}>—</span>}</td>
              <td style={{...S.td,fontSize:11,fontFamily:'monospace',color:'#888'}}>{editando?<input style={inp} value={editForm.telefono} onChange={e=>setEditForm(p=>({...p,telefono:e.target.value}))}/>:c['Teléfono']||'—'}</td>
              <td style={{...S.td,fontSize:10,fontFamily:'monospace',color:'#666'}}>{editando?<input style={inp} value={editForm.cuit} onChange={e=>setEditForm(p=>({...p,cuit:e.target.value}))}/>:c['Cuit']||'—'}</td>
              <td style={{...S.td}}>
                {editando?<div style={{display:'flex',gap:4}}>
                  <button onClick={()=>guardarEdit(c)} disabled={saving} style={{padding:'3px 8px',borderRadius:3,border:'none',background:'#1D9E75',color:'#fff',fontSize:10,cursor:'pointer',opacity:saving?0.5:1}}>{saving?'...':'✓'}</button>
                  <button onClick={()=>setEditandoFila(null)} style={{padding:'3px 8px',borderRadius:3,border:'0.5px solid #333',background:'transparent',color:'#888',fontSize:10,cursor:'pointer'}}>×</button>
                </div>:<button onClick={()=>empezarEditar(c,i)} style={{padding:'3px 8px',borderRadius:3,border:'0.5px solid #333',background:'transparent',color:'#888',fontSize:10,cursor:'pointer'}}>✎</button>}
              </td>
            </tr>
          })}
        </tbody>
      </table>
      {filtrados.length===0&&<div style={{padding:30,textAlign:'center',color:'#555',fontSize:13}}>Sin contactos que coincidan</div>}
    </div>
  </div>
}

// ---- CALENDARIO ----
function Calendario({data,mail,onRefresh}){
  const hoy=new Date()
  const [mesActual,setMesActual]=useState(new Date(hoy.getFullYear(),hoy.getMonth(),1))
  const [diaSel,setDiaSel]=useState(null)
  const [mostrarPresus,setMostrarPresus]=useState(true)
  const [cambiandoEstado,setCambiandoEstado]=useState(null)  // {num, estado, motivo}
  const [savingEstado,setSavingEstado]=useState(false)
  const [toast,setToast]=useState('')

  const proyectos=data?.proyectos||[]
  const presus=data?.presupuestos||[]

  // Lee staff asignados a un proyecto desde la fila de PROYECTOS
  // Keys reales: 'Staff 1'..'Staff 12' (toProyectos renumera). Puede haber múltiples personas separadas por coma/| en una celda.
  const staffDeProyecto = (p) => {
    if (!p) return []
    const out = []
    for (let j=1; j<=12; j++) {
      const s = String(p['Staff '+j]||'').trim()
      const ped = String(p['Pedido '+j]||'').trim()
      if (!s) continue
      s.split(/[,|]/).map(x=>x.trim()).filter(Boolean).forEach(persona => out.push({pedido:ped, persona}))
    }
    return out
  }

  // Cambiar estado: si DESAPROBADO o REPRESUPUESTADO → pide motivo. Si APROBADO → confirma.
  const iniciarCambioEstado = (num, estadoNuevo) => {
    if (estadoNuevo === 'DESAPROBADO' || estadoNuevo === 'REPRESUPUESTADO') {
      setCambiandoEstado({num, estado:estadoNuevo, motivo:''})
    } else {
      ejecutarCambioEstado(num, estadoNuevo, '')
    }
  }
  const ejecutarCambioEstado = async (num, estado, motivo) => {
    setSavingEstado(true)
    try {
      const r = await fetch('/api/presupuesto-estado',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num,estado,motivo})})
      const j = await r.json()
      if (j.ok) {
        setToast('Estado actualizado ✓')
        setCambiandoEstado(null)
        if (onRefresh) setTimeout(onRefresh, 500)
        setTimeout(()=>setToast(''), 2200)
      } else {
        setToast('Error: '+(j.error||'?'))
        setTimeout(()=>setToast(''), 3000)
      }
    } catch(e) {
      setToast('Error de conexión')
      setTimeout(()=>setToast(''), 3000)
    }
    setSavingEstado(false)
  }

  const parseFecha=s=>{const m=String(s||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;const y=Number(m[3])<100?2000+Number(m[3]):Number(m[3]);return new Date(y,Number(m[2])-1,Number(m[1]))}
  const sameDay=(a,b)=>a&&b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()

  // Mapa presus por N° para cruzar fechas adicionales (multi/rango)
  const presusByNum = {}
  presus.forEach(p => { const n = String(p['Columna 1']||'').trim(); if (n) presusByNum[n] = p })

  // Genera TODAS las fechas que aplican a un evento — soporta dia/rango/multi
  const fechasDelEvento = (fechaPrincipal, tipoFechas, fechasAdicionales) => {
    const out = []
    const f0 = parseFecha(fechaPrincipal)
    if (!f0) return out
    const tipo = String(tipoFechas||'').toLowerCase().trim()
    const ad = String(fechasAdicionales||'').trim()
    if (tipo === 'rango' && ad) {
      const f1 = parseFecha(ad)
      if (!f1) { out.push(f0); return out }
      // Todos los días entre f0 y f1 inclusive
      let d = new Date(f0)
      while (d.getTime() <= f1.getTime()) { out.push(new Date(d)); d.setDate(d.getDate()+1) }
    } else if (tipo === 'multi' && ad) {
      out.push(f0)
      ad.split('|').filter(Boolean).forEach(s => { const f = parseFecha(s); if (f) out.push(f) })
    } else {
      out.push(f0)
    }
    return out
  }

  // APROBADOS: proyectos en PROYECTOS — se distribuyen en TODAS sus fechas (multi/rango)
  const aprobadosPorDia={}
  proyectos.forEach(p=>{
    const num = String(p['N° presupuesto']||'').trim()
    const presu = presusByNum[num]  // info de fechas multi/rango está en el PRESUPUESTO
    const fechas = fechasDelEvento(p['Fecha Evento'], presu?.['Tipo Fechas'], presu?.['Fechas Adicionales'])
    fechas.forEach(f => {
      const key=f.getFullYear()+'-'+f.getMonth()+'-'+f.getDate()
      if(!aprobadosPorDia[key])aprobadosPorDia[key]=[]
      aprobadosPorDia[key].push(p)
    })
  })

  // PRESUPUESTADOS: EN ESPERA — también en todas sus fechas
  const enEsperaPorDia={}
  presus.forEach(p=>{
    if(String(p['Estado']||'').toUpperCase()!=='EN ESPERA')return
    const fechas = fechasDelEvento(p['Fecha Evento'], p['Tipo Fechas'], p['Fechas Adicionales'])
    fechas.forEach(f => {
      const key=f.getFullYear()+'-'+f.getMonth()+'-'+f.getDate()
      if(!enEsperaPorDia[key])enEsperaPorDia[key]=[]
      enEsperaPorDia[key].push(p)
    })
  })

  // Construir grilla del mes
  const año=mesActual.getFullYear(), mes=mesActual.getMonth()
  const primDiaMes=new Date(año,mes,1)
  const ultDiaMes=new Date(año,mes+1,0).getDate()
  const offsetInicio=(primDiaMes.getDay()+6)%7
  const semanas=[]
  let semana=[]
  for(let i=0;i<offsetInicio;i++)semana.push(null)
  for(let d=1;d<=ultDiaMes;d++){
    semana.push(new Date(año,mes,d))
    if(semana.length===7){semanas.push(semana);semana=[]}
  }
  if(semana.length>0){while(semana.length<7)semana.push(null);semanas.push(semana)}

  const NOMBRES_MES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const DIAS_SEM=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
  const navMes=delta=>setMesActual(new Date(año,mes+delta,1))

  // KPIs del mes visible
  let totAprob=0, totEsperaQty=0, totEsperaMonto=0, cntAprob=0
  Object.keys(aprobadosPorDia).forEach(k=>{
    const [y,m]=k.split('-').map(Number)
    if (y===año && m===mes) {
      aprobadosPorDia[k].forEach(p=>{ totAprob+=parseMonto(p['Total ']||p['Total']||p['Precio Final']); cntAprob++ })
    }
  })
  Object.keys(enEsperaPorDia).forEach(k=>{
    const [y,m]=k.split('-').map(Number)
    if (y===año && m===mes) {
      enEsperaPorDia[k].forEach(p=>{ totEsperaMonto+=parseMonto(p['Precio Final']); totEsperaQty++ })
    }
  })

  const aprobDiaSel=diaSel?aprobadosPorDia[diaSel.getFullYear()+'-'+diaSel.getMonth()+'-'+diaSel.getDate()]||[]:[]
  const enEsperaDiaSel=diaSel?enEsperaPorDia[diaSel.getFullYear()+'-'+diaSel.getMonth()+'-'+diaSel.getDate()]||[]:[]

  const VERDE='#1D9E75', NARANJA='#BA7517'

  return <div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,gap:10,flexWrap:'wrap'}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <button onClick={()=>navMes(-1)} style={{padding:'6px 12px',borderRadius:6,border:'0.5px solid #333',background:'transparent',color:'#B0B0B0',fontSize:14,cursor:'pointer'}}>◀</button>
        <div style={{fontSize:18,fontWeight:600,color:'#F0F0F0',minWidth:200,textAlign:'center'}}>{NOMBRES_MES[mes]} {año}</div>
        <button onClick={()=>navMes(1)} style={{padding:'6px 12px',borderRadius:6,border:'0.5px solid #333',background:'transparent',color:'#B0B0B0',fontSize:14,cursor:'pointer'}}>▶</button>
        <button onClick={()=>setMesActual(new Date(hoy.getFullYear(),hoy.getMonth(),1))} style={{padding:'6px 12px',borderRadius:6,border:'0.5px solid #1543F840',background:'#1543F810',color:'#1543F8',fontSize:11,cursor:'pointer',marginLeft:6}}>Hoy</button>
      </div>
      <label style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'#B0B0B0',cursor:'pointer',userSelect:'none'}}>
        <input type="checkbox" checked={mostrarPresus} onChange={e=>setMostrarPresus(e.target.checked)} style={{accentColor:NARANJA}}/>
        Mostrar presupuestos en espera
      </label>
    </div>

    {/* KPIs del mes */}
    <div style={{display:'grid',gridTemplateColumns:mostrarPresus?'1fr 1fr':'1fr',gap:10,marginBottom:14}}>
      <div style={{background:VERDE+'10',border:'0.5px solid '+VERDE+'30',borderRadius:8,padding:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:10,color:VERDE,textTransform:'uppercase',letterSpacing:'.06em',fontWeight:600}}>Aprobados este mes</div>
          <div style={{fontSize:18,fontWeight:700,color:'#F0F0F0',marginTop:2}}>{cntAprob} <span style={{fontSize:11,color:'#888',fontWeight:400}}>proyectos</span></div>
        </div>
        <div style={{fontSize:16,fontFamily:'monospace',color:VERDE,fontWeight:700}}>{fmtM(totAprob)}</div>
      </div>
      {mostrarPresus&&<div style={{background:NARANJA+'10',border:'0.5px solid '+NARANJA+'30',borderRadius:8,padding:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:10,color:NARANJA,textTransform:'uppercase',letterSpacing:'.06em',fontWeight:600}}>Presupuestados en espera</div>
          <div style={{fontSize:18,fontWeight:700,color:'#F0F0F0',marginTop:2}}>{totEsperaQty} <span style={{fontSize:11,color:'#888',fontWeight:400}}>presus</span></div>
        </div>
        <div style={{fontSize:16,fontFamily:'monospace',color:NARANJA,fontWeight:700}}>{fmtM(totEsperaMonto)}</div>
      </div>}
    </div>

    <div style={{display:'grid',gridTemplateColumns:diaSel?'1fr 400px':'1fr',gap:12}}>
      <div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4,marginBottom:4}}>
          {DIAS_SEM.map(d=><div key={d} style={{fontSize:10,color:'#888',textTransform:'uppercase',letterSpacing:'.06em',textAlign:'center',padding:6,fontWeight:600}}>{d}</div>)}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4}}>
          {semanas.flat().map((d,i)=>{
            if(!d)return <div key={i} style={{minHeight:100,background:'#0E0E0E',borderRadius:6}}/>
            const key=d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate()
            const aprob=aprobadosPorDia[key]||[]
            const esp=mostrarPresus?(enEsperaPorDia[key]||[]):[]
            const esHoy=sameDay(d,hoy)
            const esSel=diaSel&&sameDay(d,diaSel)
            const total=aprob.length+esp.length
            const finde=d.getDay()===0||d.getDay()===6
            return <div key={i} onClick={()=>setDiaSel(d)} style={{minHeight:100,background:esSel?'#1F1F1F':(finde?'#131313':'#161616'),border:esSel?'1px solid '+VERDE:(esHoy?'0.5px solid '+VERDE:'0.5px solid #262626'),borderRadius:6,padding:6,cursor:'pointer',position:'relative',transition:'all .12s'}}>
              <div style={{fontSize:11,fontWeight:esHoy?700:500,color:esHoy?VERDE:(finde?'#777':'#E0E0E0'),marginBottom:4,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span>{d.getDate()}</span>
                {esHoy&&<span style={{fontSize:7.5,color:VERDE,textTransform:'uppercase',fontWeight:700,letterSpacing:'.06em'}}>Hoy</span>}
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:2}}>
                {aprob.slice(0,4).map((p,j)=><div key={'a'+j} style={{fontSize:10,padding:'2.5px 5px',background:VERDE+'25',color:'#E0F4EA',borderLeft:'2px solid '+VERDE,borderRadius:'2px 3px 3px 2px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500}} title={(p['Cliente']||'')+' / '+(p['Proyecto']||'')}>{p['Cliente']||p['Agencia']||'—'}</div>)}
                {esp.slice(0,Math.max(0,4-aprob.length)).map((p,j)=><div key={'e'+j} style={{fontSize:10,padding:'2.5px 5px',background:NARANJA+'18',color:'#F0D9B0',borderLeft:'2px dashed '+NARANJA,borderRadius:'2px 3px 3px 2px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={'EN ESPERA: '+(p['Cliente']||'')+' / '+(p['Proyecto']||'')}>{p['Cliente']||p['Agencia']||'—'}</div>)}
                {total>4&&<div style={{fontSize:9,color:'#666',padding:'1px 4px'}}>+{total-4} más</div>}
              </div>
            </div>
          })}
        </div>
        <div style={{display:'flex',gap:14,fontSize:10,color:'#888',alignItems:'center',justifyContent:'center',marginTop:10,flexWrap:'wrap'}}>
          <span style={{display:'flex',alignItems:'center',gap:5}}><span style={{width:14,height:10,borderLeft:'2px solid '+VERDE,background:VERDE+'25'}}/>Proyecto aprobado</span>
          {mostrarPresus&&<span style={{display:'flex',alignItems:'center',gap:5}}><span style={{width:14,height:10,borderLeft:'2px dashed '+NARANJA,background:NARANJA+'18'}}/>Presupuesto en espera</span>}
        </div>
      </div>

      {diaSel&&<div style={{background:'#161616',border:'0.5px solid #262626',borderRadius:10,padding:16,position:'sticky',top:0,maxHeight:'calc(100vh - 200px)',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          <div>
            <div style={{fontSize:11,color:'#888',textTransform:'uppercase',letterSpacing:'.06em'}}>{DIAS_SEM[(diaSel.getDay()+6)%7]}</div>
            <div style={{fontSize:20,fontWeight:600,color:'#F0F0F0'}}>{diaSel.getDate()} de {NOMBRES_MES[diaSel.getMonth()].toLowerCase()}</div>
          </div>
          <button onClick={()=>setDiaSel(null)} style={{padding:'4px 10px',borderRadius:4,border:'0.5px solid #333',background:'transparent',color:'#888',fontSize:11,cursor:'pointer'}}>×</button>
        </div>
        {aprobDiaSel.length===0&&enEsperaDiaSel.length===0&&<div style={{padding:20,textAlign:'center',color:'#666',fontSize:12}}>Sin actividad este día</div>}
        {aprobDiaSel.length>0&&<div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:VERDE,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6,fontWeight:600}}>Aprobados ({aprobDiaSel.length})</div>
          {aprobDiaSel.map((p,i)=>{
            const staff = staffDeProyecto(p)
            const num = p['N° presupuesto']
            // Cruzar con presu para info multi/rango
            const presuRef = presusByNum[String(num).trim()]
            const tipoF = String(presuRef?.['Tipo Fechas']||'').toLowerCase().trim()
            const adF = String(presuRef?.['Fechas Adicionales']||'').trim()
            return <div key={i} style={{background:VERDE+'08',border:'0.5px solid '+VERDE+'30',borderRadius:6,padding:10,marginBottom:8}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:3}}>
                <span style={{fontSize:11,color:'#1543F8',fontFamily:'monospace'}}>#{num}</span>
                <span style={{fontSize:10,color:'#888'}}>PM: {p['PM']||p['PM Interno']||'—'}</span>
              </div>
              <div style={{fontSize:13,color:'#F0F0F0',fontWeight:500}}>{p['Cliente']||p['Agencia']||'—'}</div>
              <div style={{fontSize:11,color:'#B0B0B0',marginTop:2}}>{p['Proyecto']||'—'}</div>
              {(tipoF==='rango'||tipoF==='multi')&&adF&&<div style={{fontSize:10,color:'#9635AB',marginTop:3,padding:'2px 6px',background:'#9635AB12',borderRadius:3,display:'inline-block'}}>{tipoF==='rango'?'Evento multi-día: '+p['Fecha Evento']+' al '+adF:'Evento en varias fechas: '+p['Fecha Evento']+', '+adF.replace(/\|/g,', ')}</div>}
              {staff.length>0 ? <div style={{marginTop:6,padding:'6px 8px',background:'#0E0E0E',borderRadius:4,border:'0.5px solid #1F1F1F'}}>
                <div style={{fontSize:9,color:'#666',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:3,fontWeight:600}}>Staff asignado</div>
                {staff.map((s,j)=><div key={j} style={{fontSize:10,color:'#B0B0B0',display:'flex',justifyContent:'space-between',padding:'1px 0'}}><span>{s.persona}</span><span style={{color:'#555'}}>{s.pedido}</span></div>)}
              </div> : <div style={{marginTop:6,padding:'5px 8px',background:'#BA751712',borderLeft:'2px solid '+NARANJA,fontSize:10,color:NARANJA,borderRadius:'2px 4px 4px 2px'}}>⚠ Sin staff cargado todavía</div>}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8,paddingTop:6,borderTop:'0.5px solid '+VERDE+'15',gap:6}}>
                <span style={{fontSize:10,color:'#888'}}>Total: <span style={{fontFamily:'monospace',color:VERDE,fontWeight:600}}>{fmtM(parseMonto(p['Total ']||p['Total']))}</span></span>
                <div style={{display:'flex',gap:4}}>
                  <button onClick={()=>iniciarCambioEstado(num,'DESAPROBADO')} disabled={savingEstado} title="Marcar desaprobado" style={{fontSize:10,color:'#E24B4A',background:'#E24B4A12',border:'0.5px solid #E24B4A40',padding:'3px 7px',borderRadius:3,cursor:'pointer'}}>Desaprobar</button>
                  <button onClick={()=>iniciarCambioEstado(num,'REPRESUPUESTADO')} disabled={savingEstado} title="Marcar represupuestado" style={{fontSize:10,color:'#9635AB',background:'#9635AB12',border:'0.5px solid #9635AB40',padding:'3px 7px',borderRadius:3,cursor:'pointer'}}>Represup.</button>
                  <a href={'/presupuesto?nro='+encodeURIComponent(num)} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:10,color:'#1543F8',textDecoration:'none',padding:'3px 7px',borderRadius:3,border:'0.5px solid #1543F840'}}>📄 PDF</a>
                </div>
              </div>
            </div>
          })}
        </div>}
        {enEsperaDiaSel.length>0&&<div>
          <div style={{fontSize:10,color:NARANJA,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6,fontWeight:600}}>En espera ({enEsperaDiaSel.length})</div>
          {enEsperaDiaSel.map((p,i)=>{
            const num = p['Columna 1']
            const tipoF = String(p['Tipo Fechas']||'').toLowerCase().trim()
            const adF = String(p['Fechas Adicionales']||'').trim()
            return <div key={i} style={{background:NARANJA+'08',border:'0.5px dashed '+NARANJA+'40',borderRadius:6,padding:10,marginBottom:8}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:3}}>
                <span style={{fontSize:11,color:'#1543F8',fontFamily:'monospace'}}>#{num}</span>
                <span style={{fontSize:10,color:'#888'}}>PM: {p['PM Interno']||'—'}</span>
              </div>
              <div style={{fontSize:13,color:'#F0F0F0',fontWeight:500}}>{p['Cliente']||p['Agencia']||'—'}</div>
              <div style={{fontSize:11,color:'#B0B0B0',marginTop:2}}>{p['Proyecto']||'—'}</div>
              {(tipoF==='rango'||tipoF==='multi')&&adF&&<div style={{fontSize:10,color:'#9635AB',marginTop:3,padding:'2px 6px',background:'#9635AB12',borderRadius:3,display:'inline-block'}}>{tipoF==='rango'?'Multi-día: '+p['Fecha Evento']+' al '+adF:'Varias fechas: '+p['Fecha Evento']+', '+adF.replace(/\|/g,', ')}</div>}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8,paddingTop:6,borderTop:'0.5px solid '+NARANJA+'15',gap:6}}>
                <span style={{fontSize:10,color:'#888'}}>Precio: <span style={{fontFamily:'monospace',color:NARANJA,fontWeight:600}}>{p['Precio Final']||'—'}</span></span>
                <div style={{display:'flex',gap:4}}>
                  <button onClick={()=>iniciarCambioEstado(num,'APROBADO')} disabled={savingEstado} title="Aprobar" style={{fontSize:10,color:VERDE,background:VERDE+'15',border:'0.5px solid '+VERDE+'60',padding:'3px 7px',borderRadius:3,cursor:'pointer',fontWeight:600}}>✓ Aprobar</button>
                  <button onClick={()=>iniciarCambioEstado(num,'DESAPROBADO')} disabled={savingEstado} title="Marcar desaprobado" style={{fontSize:10,color:'#E24B4A',background:'#E24B4A12',border:'0.5px solid #E24B4A40',padding:'3px 7px',borderRadius:3,cursor:'pointer'}}>Desaprobar</button>
                  <a href={'/presupuesto?nro='+encodeURIComponent(num)} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:10,color:'#1543F8',textDecoration:'none',padding:'3px 7px',borderRadius:3,border:'0.5px solid #1543F840'}}>📄 PDF</a>
                </div>
              </div>
            </div>
          })}
        </div>}
      </div>}
    </div>

    {/* Modal de motivo cuando se cambia a DESAPROBADO o REPRESUPUESTADO */}
    {cambiandoEstado&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.78)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:20}} onClick={()=>!savingEstado&&setCambiandoEstado(null)}>
      <div onClick={e=>e.stopPropagation()} style={{width:460,background:'#0D0D0D',borderRadius:10,border:'0.5px solid #2A2A2A',overflow:'hidden'}}>
        <div style={{padding:'14px 20px',borderBottom:'0.5px solid #2A2A2A',display:'flex',alignItems:'center',gap:10,background:'#111'}}>
          <span style={{background:(cambiandoEstado.estado==='DESAPROBADO'?'#E24B4A':'#9635AB')+'20',color:cambiandoEstado.estado==='DESAPROBADO'?'#E24B4A':'#9635AB',borderRadius:4,padding:'3px 9px',fontSize:11,fontWeight:600}}>{cambiandoEstado.estado}</span>
          <span style={{fontSize:13,color:'#F0F0F0',fontWeight:500}}>Presu #{cambiandoEstado.num}</span>
          <div style={{flex:1}}/>
          <button onClick={()=>setCambiandoEstado(null)} disabled={savingEstado} style={{fontSize:18,background:'transparent',border:'none',color:'#555',cursor:'pointer'}}>×</button>
        </div>
        <div style={{padding:20}}>
          <div style={{fontSize:11,color:'#888',marginBottom:10}}>{cambiandoEstado.estado==='DESAPROBADO' ? '¿Por qué se desaprobó? (elegí una o escribí libre)' : 'Motivo del represupuesto'}</div>
          {cambiandoEstado.estado==='DESAPROBADO' && <div style={{display:'flex',flexWrap:'wrap',gap:5,marginBottom:10}}>
            {['Precio alto','No contestaron','Cambió alcance','Eligió otra productora','Se suspendió el evento','Fecha no disponible'].map(m=>
              <button key={m} onClick={()=>setCambiandoEstado(c=>({...c,motivo:m}))} style={{padding:'5px 10px',borderRadius:4,border:'0.5px solid '+(cambiandoEstado.motivo===m?'#E24B4A':'#2A2A2A'),background:cambiandoEstado.motivo===m?'#E24B4A15':'transparent',color:cambiandoEstado.motivo===m?'#E24B4A':'#888',fontSize:11,cursor:'pointer'}}>{m}</button>
            )}
          </div>}
          <textarea autoFocus value={cambiandoEstado.motivo} onChange={e=>setCambiandoEstado(c=>({...c,motivo:e.target.value}))} placeholder={cambiandoEstado.estado==='DESAPROBADO'?'Ej: precio muy alto vs competencia, o escribí el detalle':'Ej: cliente pidió más cámaras / cambio de fecha'} style={{width:'100%',minHeight:60,padding:10,borderRadius:6,border:'0.5px solid #2A2A2A',background:'#1A1A1A',color:'#F0F0F0',fontSize:12,fontFamily:'inherit',resize:'vertical',boxSizing:'border-box'}}/>
        </div>
        <div style={{padding:'12px 20px',borderTop:'0.5px solid #2A2A2A',display:'flex',gap:10,justifyContent:'flex-end',background:'#0A0A0A'}}>
          <button onClick={()=>setCambiandoEstado(null)} disabled={savingEstado} style={{padding:'8px 16px',borderRadius:6,border:'0.5px solid #2A2A2A',background:'transparent',color:'#888',fontSize:12,cursor:'pointer'}}>Cancelar</button>
          <button onClick={()=>ejecutarCambioEstado(cambiandoEstado.num,cambiandoEstado.estado,cambiandoEstado.motivo.trim())} disabled={savingEstado||!cambiandoEstado.motivo.trim()} style={{padding:'8px 20px',borderRadius:6,border:'none',background:cambiandoEstado.estado==='DESAPROBADO'?'#E24B4A':'#9635AB',color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',opacity:savingEstado||!cambiandoEstado.motivo.trim()?0.5:1}}>{savingEstado?'Guardando...':'Confirmar'}</button>
        </div>
      </div>
    </div>}

    {/* Toast */}
    {toast&&<div style={{position:'fixed',bottom:24,right:24,padding:'10px 16px',background:'#1A1A1A',border:'0.5px solid #333',borderRadius:8,fontSize:12,color:'#F0F0F0',boxShadow:'0 4px 16px #000a',zIndex:400}}>{toast}</div>}
  </div>
}

// ════════════════════════════════════════════════════════════════════
// BUSCADOR GLOBAL — Cmd+K
// ════════════════════════════════════════════════════════════════════
function GlobalSearch({data, onClose, onNavegar}){
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef(null)
  useEffect(()=>{ inputRef.current?.focus() },[])

  // Items recientes (últimos 8 abiertos desde el buscador)
  const [recientes,setRecientes] = useState(()=>{try{return JSON.parse(localStorage.getItem('magma_search_recent')||'[]')}catch(e){return []}})
  const guardarReciente = (r) => {
    const item = {tipo:r.tipo, icon:r.icon, mod:r.mod, titulo:r.titulo, sub:r.sub, color:r.color, ts:Date.now()}
    const nueva = [item, ...recientes.filter(x=>x.titulo!==r.titulo||x.tipo!==r.tipo)].slice(0,8)
    setRecientes(nueva)
    try{localStorage.setItem('magma_search_recent',JSON.stringify(nueva))}catch(e){}
  }
  const limpiarRecientes = () => { setRecientes([]); try{localStorage.removeItem('magma_search_recent')}catch(e){} }

  const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
  const nq = norm(q.trim())

  const resultados = []
  if (nq.length >= 1) {
    // PRESUPUESTOS
    ;(data?.presupuestos||[]).forEach(p => {
      const num = String(p['Columna 1']||''), cli=String(p['Cliente']||''), ag=String(p['Agencia']||''), pr=String(p['Proyecto']||'')
      const blob = norm(num+' '+cli+' '+ag+' '+pr)
      if (blob.includes(nq)) {
        resultados.push({tipo:'Presupuesto', icon:'📋', mod:'presupuestos', titulo:'#'+num+' · '+(cli||ag||'—'), sub:pr, meta:p['Estado']||'', color:'#1543F8'})
      }
    })
    // PROYECTOS
    ;(data?.proyectos||[]).forEach(p => {
      const num=String(p['N° presupuesto']||''), cli=String(p['Cliente']||''), ag=String(p['Agencia']||''), pr=String(p['Proyecto']||'')
      const blob = norm(num+' '+cli+' '+ag+' '+pr)
      if (blob.includes(nq)) {
        resultados.push({tipo:'Proyecto', icon:'🎬', mod:'proyectos', titulo:'#'+num+' · '+(cli||ag||'—'), sub:pr, meta:p['Fecha Evento']||'', color:'#1D9E75'})
      }
    })
    // FACTURAS
    ;(data?.facturacion||[]).forEach(f => {
      const num=String(f['N° Presupuesto']||f['N° Factura']||''), cli=String(f['Cliente']||''), ag=String(f['Agencia']||''), pr=String(f['Proyecto']||'')
      const blob = norm(num+' '+cli+' '+ag+' '+pr)
      if (blob.includes(nq)) {
        const cobrada = String(f['cobrados']||'').toUpperCase()==='TRUE' || String(f['Pagado']||'').toUpperCase()==='SÍ'
        resultados.push({tipo:'Factura', icon:'💵', mod:'facturacion', titulo:'#'+num+' · '+(cli||ag||'—'), sub:pr, meta:cobrada?'Cobrada':'Pendiente', color:'#BA7517'})
      }
    })
    // FREELANCERS (RRHH)
    ;(data?.rrhh||[]).forEach(r => {
      const nombre=String(r['Nombre Apellido']||''), rubro=String(r['Rubro']||''), mail=String(r['Mail']||'')
      const blob = norm(nombre+' '+rubro+' '+mail)
      if (blob.includes(nq) && nombre.trim()) {
        resultados.push({tipo:'Freelancer', icon:'👤', mod:'pagos', titulo:nombre, sub:rubro, meta:r['Banco']?'Con CBU':'Sin CBU', color:'#9635AB'})
      }
    })
    // AGENCIAS
    ;(data?.agencias||[]).forEach(a => {
      const nombre=String(a['Nombre']||'')
      if (norm(nombre).includes(nq) && nombre.trim()) {
        resultados.push({tipo:'Agencia', icon:'🏢', mod:'agencias', titulo:nombre, sub:a['Tipo']||'', meta:a['Activa']==='SI'?'Activa':'', color:'#E24B4A'})
      }
    })
    // CLIENTES
    ;(data?.clientes||[]).forEach(c => {
      const nombre=String(c['Nombre']||'')
      if (norm(nombre).includes(nq) && nombre.trim()) {
        resultados.push({tipo:'Cliente', icon:'🎯', mod:'clientes', titulo:nombre, sub:c['Industria']||'', meta:c['Cant. presus historicos']?(c['Cant. presus historicos']+' presus'):'', color:'#CE2637'})
      }
    })
    // CONTACTOS
    ;(data?.contactos||[]).forEach(c => {
      const nombre=String(c['Nombre']||''), agencia=String(c['Agencia']||''), tel=String(c['Teléfono']||''), mail=String(c['Mail']||'')
      const blob = norm(nombre+' '+agencia+' '+tel+' '+mail)
      if (blob.includes(nq) && nombre.trim()) {
        resultados.push({tipo:'Contacto', icon:'☎', mod:'contactos', titulo:nombre, sub:agencia, meta:c['Cargo']||'', color:'#4A90E2'})
      }
    })
  }

  // Limitar a 30 para no saturar
  const visibles = resultados.slice(0, 30)
  const total = resultados.length

  // Navegar con flechas
  useEffect(()=>{ setIdx(0) },[q])
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(visibles.length-1, i+1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx(i => Math.max(0, i-1)) }
    if (e.key === 'Enter' && visibles[idx]) { e.preventDefault(); const r = visibles[idx]; guardarReciente(r); onNavegar(r.mod, {q: extraerQuery(r), num: extraerNum(r)}) }
  }
  // Extrae el N° del título "#1949 · BBVA" → "1949"
  const extraerNum = (r) => {
    const m = String(r.titulo||'').match(/#([\w\d-]+)/)
    return m ? m[1] : null
  }
  // Extrae el texto buscable: si tiene #N°, usa eso; si no, el título
  const extraerQuery = (r) => extraerNum(r) || String(r.titulo||'').split('·')[0].trim()
  const elegir = (r) => { guardarReciente(r); onNavegar(r.mod, {q: extraerQuery(r), num: extraerNum(r)}) }

  return <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:500,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:90}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'90%',maxWidth:640,background:'#0D0D0D',borderRadius:12,border:'0.5px solid #2A2A2A',overflow:'hidden',boxShadow:'0 20px 60px #000a'}}>
      <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 18px',borderBottom:'0.5px solid #2A2A2A'}}>
        <span style={{fontSize:16,color:'#666'}}>🔍</span>
        <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} onKeyDown={onKey} placeholder="Buscar presus, proyectos, facturas, freelancers, agencias..." style={{flex:1,background:'transparent',border:'none',color:'#F0F0F0',fontSize:15,outline:'none',fontFamily:'inherit'}}/>
        <span style={{fontSize:10,color:'#555',fontFamily:'monospace'}}>ESC para cerrar</span>
      </div>
      <div style={{maxHeight:'60vh',overflowY:'auto'}}>
        {!q && recientes.length === 0 && <div style={{padding:'30px 20px',textAlign:'center',color:'#555',fontSize:12}}>Escribí algo para buscar en todos los módulos · usá ↑↓ para navegar, Enter para abrir</div>}
        {!q && recientes.length > 0 && <>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 18px',fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'.06em'}}>
            <span>Recientes</span>
            <button onClick={limpiarRecientes} style={{fontSize:10,color:'#666',background:'transparent',border:'none',cursor:'pointer'}}>Limpiar</button>
          </div>
          {recientes.map((r,i) => (
            <div key={'rec'+i} onClick={()=>elegir(r)} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 18px',cursor:'pointer',borderBottom:'0.5px solid #161616'}} onMouseEnter={e=>e.currentTarget.style.background='#1E1E1E'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <span style={{fontSize:18,width:24,textAlign:'center'}}>{r.icon}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,color:'#F0F0F0',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.titulo}</div>
                {r.sub && <div style={{fontSize:11,color:'#777',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.sub}</div>}
              </div>
              <span style={{fontSize:9,padding:'2px 7px',borderRadius:3,background:r.color+'20',color:r.color,textTransform:'uppercase',letterSpacing:'.06em',fontWeight:600}}>{r.tipo}</span>
            </div>
          ))}
        </>}
        {q && visibles.length === 0 && <div style={{padding:'24px 20px',textAlign:'center',color:'#666',fontSize:13}}>No encontré nada con "{q}"</div>}
        {q && visibles.map((r,i) => (
          <div key={i} onClick={()=>elegir(r)} onMouseEnter={()=>setIdx(i)} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 18px',cursor:'pointer',background:i===idx?'#1E1E1E':'transparent',borderBottom:'0.5px solid #161616'}}>
            <span style={{fontSize:18,width:24,textAlign:'center'}}>{r.icon}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,color:'#F0F0F0',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.titulo}</div>
              {r.sub && <div style={{fontSize:11,color:'#777',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.sub}</div>}
            </div>
            <span style={{fontSize:9,padding:'2px 7px',borderRadius:3,background:r.color+'20',color:r.color,textTransform:'uppercase',letterSpacing:'.06em',fontWeight:600}}>{r.tipo}</span>
            {r.meta && <span style={{fontSize:10,color:'#666'}}>{r.meta}</span>}
          </div>
        ))}
        {q && total > 30 && <div style={{padding:'10px 18px',fontSize:10,color:'#555',textAlign:'center',borderTop:'0.5px solid #1A1A1A'}}>+{total-30} resultados más · refiná la búsqueda</div>}
      </div>
      {q && total > 0 && <div style={{display:'flex',gap:14,padding:'8px 18px',background:'#0A0A0A',borderTop:'0.5px solid #2A2A2A',fontSize:10,color:'#555',justifyContent:'flex-end'}}>
        <span><kbd style={{padding:'1px 4px',background:'#1A1A1A',borderRadius:3,fontFamily:'monospace'}}>↑↓</kbd> navegar</span>
        <span><kbd style={{padding:'1px 4px',background:'#1A1A1A',borderRadius:3,fontFamily:'monospace'}}>Enter</kbd> ir</span>
        <span><kbd style={{padding:'1px 4px',background:'#1A1A1A',borderRadius:3,fontFamily:'monospace'}}>ESC</kbd> cerrar</span>
      </div>}
    </div>
  </div>
}

// ════════════════════════════════════════════════════════════════════
// ATAJOS DE TECLADO — Modal de ayuda (se abre con ?)
// ════════════════════════════════════════════════════════════════════
function AtajosModal({onClose, nav}){
  const Kbd = ({children}) => <kbd style={{padding:'3px 8px',background:'#1A1A1A',border:'0.5px solid #2A2A2A',borderRadius:4,fontSize:11,fontFamily:'monospace',color:'#F0F0F0',minWidth:24,display:'inline-block',textAlign:'center'}}>{children}</kbd>
  return <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:550,display:'flex',alignItems:'center',justifyContent:'center'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'90%',maxWidth:520,background:'#0D0D0D',borderRadius:12,border:'0.5px solid #2A2A2A',overflow:'hidden',maxHeight:'85vh',display:'flex',flexDirection:'column'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 18px',borderBottom:'0.5px solid #2A2A2A'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:16}}>⌨️</span>
          <span style={{fontSize:14,fontWeight:600,color:'#F0F0F0'}}>Atajos de teclado</span>
        </div>
        <button onClick={onClose} style={{fontSize:18,background:'transparent',border:'none',color:'#666',cursor:'pointer'}}>×</button>
      </div>
      <div style={{padding:'16px 18px',overflowY:'auto'}}>
        <div style={{fontSize:10,color:'#666',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8,fontWeight:600}}>General</div>
        <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:'10px 14px',marginBottom:20,alignItems:'center'}}>
          <div><Kbd>⌘</Kbd> + <Kbd>K</Kbd></div><div style={{fontSize:12,color:'#B0B0B0'}}>Abrir buscador global</div>
          <div><Kbd>?</Kbd></div><div style={{fontSize:12,color:'#B0B0B0'}}>Mostrar esta ayuda</div>
          <div><Kbd>Esc</Kbd></div><div style={{fontSize:12,color:'#B0B0B0'}}>Cerrar modal / cancelar</div>
        </div>

        <div style={{fontSize:10,color:'#666',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8,fontWeight:600}}>Cambiar módulo</div>
        <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:'8px 14px',marginBottom:20,alignItems:'center'}}>
          {nav.slice(0,10).map((n,i) => {
            const k = i < 9 ? String(i+1) : '0'
            return <React.Fragment key={n.id}>
              <div><Kbd>{k}</Kbd></div>
              <div style={{fontSize:12,color:'#B0B0B0'}}><span style={{marginRight:6}}>{n.icon}</span>{n.label}</div>
            </React.Fragment>
          })}
        </div>

        <div style={{fontSize:10,color:'#666',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8,fontWeight:600}}>En el buscador</div>
        <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:'10px 14px',alignItems:'center'}}>
          <div><Kbd>↑</Kbd> <Kbd>↓</Kbd></div><div style={{fontSize:12,color:'#B0B0B0'}}>Navegar resultados</div>
          <div><Kbd>Enter</Kbd></div><div style={{fontSize:12,color:'#B0B0B0'}}>Abrir seleccionado</div>
        </div>

        <div style={{marginTop:20,padding:'10px 12px',background:'#1543F810',border:'0.5px solid #1543F830',borderRadius:6,fontSize:11,color:'#B0B0B0'}}>
          💡 Los atajos numéricos solo funcionan cuando NO estás escribiendo en un input.
        </div>
      </div>
    </div>
  </div>
}
