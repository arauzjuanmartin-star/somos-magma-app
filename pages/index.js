import { useState, useEffect } from 'react'
import Head from 'next/head'

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
  const [mail,setMail]=useState(''), [mi,setMi]=useState(''), [loading,setLoading]=useState(false), [data,setData]=useState(null), [mod,setMod]=useState('dashboard'), [err,setErr]=useState(''), [showNP,setShowNP]=useState(false)

  useEffect(()=>{ const s=localStorage.getItem('magma_mail'); if(s&&MAILS.includes(s)){setMail(s);load(s)} },[])

  async function load(m) {
    setLoading(true);setErr('')
    try {
      const r=await fetch('/api/data',{headers:{'x-user-email':m}})
      const j=await r.json()
      if(j.ok) setData(j.data)
      else setErr('Error: '+j.error)
    } catch(e){setErr('Error de conexión')}
    setLoading(false)
  }

  function login(){
    const m=mi.trim().toLowerCase()
    if(!MAILS.includes(m)){setErr('Mail no autorizado');return}
    localStorage.setItem('magma_mail',m);setMail(m);load(m);setErr('')
  }
  function logout(){localStorage.removeItem('magma_mail');setMail('');setData(null)}

  const NAV=[{id:'dashboard',label:'Dashboard',icon:'◆'},{id:'presupuestos',label:'Presupuestos',icon:'□'},{id:'proyectos',label:'Proyectos',icon:'▷'},{id:'facturacion',label:'Facturación',icon:'$'},{id:'pagos',label:'Pagos Staff',icon:'✓'},{id:'egresos',label:'Egresos',icon:'≡'},{id:'historico',label:'Histórico',icon:'⏱'}]

  if(!mail) return <><Head><title>Somos Magma</title></Head><GS/><div style={S.lw}><div style={S.lb}><div style={S.logo}>M//</div><div style={S.ls}>SOMOS MAGMA</div><div style={{marginBottom:24,fontSize:13,color:'#555'}}>Ingresá con tu mail de trabajo</div><input style={S.inp} type='email' placeholder='tu@somosmagma.com' value={mi} onChange={e=>setMi(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()} autoFocus/>{err&&<div style={{color:'#E24B4A',fontSize:12,marginBottom:8}}>{err}</div>}<button style={S.bp} onClick={login}>Entrar</button></div></div></>

  if(loading) return <><Head><title>Somos Magma</title></Head><GS/><div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',background:'#090909'}}><div style={S.logo}>M//</div><div style={{color:'#555',marginTop:16}}>Cargando...</div><div style={S.sp}/></div></>

  return <><Head><title>Somos Magma</title></Head><GS/>
    <div style={S.app}>
      <div style={S.sb}>
        <div style={{padding:'20px 16px 16px',borderBottom:'1px solid #2A2A2A'}}><div style={S.logo}>M//</div><div style={S.ls}>SOMOS MAGMA</div></div>
        <nav style={{flex:1,padding:'12px 8px',overflowY:'auto'}}>
          {NAV.map(n=><button key={n.id} style={{...S.ni,...(mod===n.id?{color:'#F0F0F0',background:'#262626'}:{})}} onClick={()=>setMod(n.id)}><span style={{fontSize:12,width:16,textAlign:'center'}}>{n.icon}</span>{n.label}</button>)}
        </nav>
        <div style={{padding:'12px 16px',borderTop:'1px solid #2A2A2A'}}><div style={{fontSize:11,color:'#555',marginBottom:6}}>{mail}</div><button style={{fontSize:11,padding:'4px 10px',borderRadius:4,border:'0.5px solid #333',background:'transparent',color:'#555',cursor:'pointer'}} onClick={logout}>Salir</button>{mail==='arauzjuanmartin@gmail.com'&&<SetupBtn mail={mail} onDataChange={()=>load(mail)}/>}<div style={{fontSize:11,color:'#333',marginTop:12}}>Productora Audiovisual<br/>since '23 //</div></div>
      </div>
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div style={{padding:'16px 24px',borderBottom:'1px solid #2A2A2A',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
          <div><div style={{fontSize:18,fontWeight:700}}>{NAV.find(n=>n.id===mod)?.label}</div><div style={{fontSize:12,color:'#555',marginTop:2}}>Vista general</div></div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            {mod==='presupuestos'&&<button style={{fontSize:12,padding:'6px 14px',borderRadius:6,border:'none',background:'#1543F8',color:'#fff',cursor:'pointer',fontWeight:500}} onClick={()=>setShowNP(true)}>+ Nuevo presupuesto</button>}
            <button style={{fontSize:12,padding:'6px 14px',borderRadius:6,border:'0.5px solid #333',background:'transparent',color:'#777',cursor:'pointer'}} onClick={()=>load(mail)}>↻ Actualizar</button>
          </div>
        </div>
        <div style={{flex:1,padding:'16px 24px',overflowY:'auto'}}>
          {err&&<div style={{background:'#E24B4A20',border:'0.5px solid #E24B4A',borderRadius:8,padding:'10px 14px',color:'#E24B4A',fontSize:13,marginBottom:14}}>{err}</div>}
          {!data?<div style={S.nd}>Sin datos</div>:<Mod id={mod} data={data} mail={mail} onRefresh={()=>load(mail)}/>}
        </div>
      </div>
    </div>
    {showNP&&<NuevoPresupuesto mail={mail} onClose={()=>setShowNP(false)} onGuardado={(p)=>{setData(prev=>({...prev,presupuestos:[...(prev.presupuestos||[]),p]}))}} data={data}/>}
  </>
}

function Mod({id,data,mail,onRefresh}){
  switch(id){
    case 'dashboard': return <Dashboard data={data} mail={mail} onRefresh={onRefresh}/>
    case 'presupuestos': return <Presupuestos data={data} mail={mail} onRefresh={onRefresh}/>
    case 'proyectos': return <Proyectos data={data} mail={mail}/>
    case 'facturacion': return <Facturacion data={data} mail={mail} onRefresh={onRefresh}/>
    case 'pagos': return <PagosStaff data={data} mail={mail} onRefresh={onRefresh}/>
    case 'egresos': return <Egresos data={data} mail={mail} onRefresh={onRefresh}/>
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
      const r=await fetch('/api/reserva-nueva',{method:'POST',headers:{'Content-Type':'application/json','x-user-email':mail},body:JSON.stringify({cuenta,concepto:form.concepto,monto:parseFloat(form.monto)||0,tipo:form.tipo,notas:form.notas})})
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
  const [editing,setEditing]=useState(false),[val,setVal]=useState(String(parseMonto(c['Saldo actual']))),[nota,setNota]=useState(c['Notas']||''),[saving,setSaving]=useState(false)
  const [expanded,setExpanded]=useState(false),[creatingReserva,setCreatingReserva]=useState(false)
  const s=parseMonto(c['Saldo actual'])
  const reservasActivas=(reservas||[]).filter(r=>String(r['Activa']||'').toUpperCase()==='SÍ'||String(r['Activa']||'').toUpperCase()==='SI'||r['Activa']===true)
  const totalReservado=reservasActivas.reduce((acc,r)=>acc+parseMonto(r['Monto']),0)
  const disponible=s-totalReservado
  const guardar=async()=>{
    setSaving(true)
    try{
      const r=await fetch('/api/cuenta-saldo',{method:'POST',headers:{'Content-Type':'application/json','x-user-email':mail},body:JSON.stringify({nombre:c['Nombre'],saldo:parseFloat(val)||0,notas:nota})})
      const j=await r.json()
      if(j.ok){setEditing(false);if(onSaved)onSaved()}
      else alert('Error: '+j.error)
    }catch(e){alert('Error: '+e.message)}
    setSaving(false)
  }
  const liberar=async(res)=>{
    if(!confirm(`Liberar reserva "${res['Concepto']}" de ${fmt(parseMonto(res['Monto']))}?`))return
    try{
      const r=await fetch('/api/reserva-liberar',{method:'POST',headers:{'Content-Type':'application/json','x-user-email':mail},body:JSON.stringify({cuenta:res['Cuenta'],concepto:res['Concepto'],fecha:res['Fecha']})})
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
      <input type='number' value={val} onChange={e=>setVal(e.target.value)} autoFocus style={{width:'100%',padding:'4px 6px',borderRadius:4,border:'0.5px solid #1D9E75',background:'#000',color:'#1D9E75',fontFamily:'monospace',fontSize:14,outline:'none',marginBottom:4}}/>
      <input value={nota} onChange={e=>setNota(e.target.value)} placeholder='Nota (opcional)' style={{width:'100%',padding:'3px 6px',borderRadius:4,border:'0.5px solid #333',background:'#000',color:'#aaa',fontSize:10,outline:'none',marginBottom:4}}/>
      <div style={{display:'flex',gap:4}}>
        <button onClick={guardar} disabled={saving} style={{flex:1,fontSize:10,padding:'3px 6px',borderRadius:3,border:'none',background:'#1D9E75',color:'#fff',cursor:'pointer'}}>{saving?'...':'✓'}</button>
        <button onClick={()=>{setEditing(false);setVal(String(s));setNota(c['Notas']||'')}} style={{flex:1,fontSize:10,padding:'3px 6px',borderRadius:3,border:'0.5px solid #333',background:'transparent',color:'#888',cursor:'pointer'}}>✕</button>
      </div>
    </div>:<>
      <div style={{fontFamily:'monospace',fontSize:16,fontWeight:500,color:s>0?'#1D9E75':'#555',cursor:'pointer'}} onClick={()=>setEditing(true)} title='Click para editar saldo bruto'>{fmtM(s)}</div>
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
  const porCobrar=fc.filter(f=>!isCobrada(f)).map(f=>{const venc=parseD(f['Vencimiento']);const dAtraso=venc?Math.floor((hoy-venc)/864e5):0;return {...f,dAtraso,monto:parseMonto(f['Precio FINAL']),neto:parseMonto(f['Precio SIN IVA']),iva:parseMonto(f['IVA'])}}).sort((a,b)=>b.dAtraso-a.dAtraso)
  const totalPorCobrar=porCobrar.reduce((s,f)=>s+f.monto,0)
  const totalPorCobrarSinIVA=porCobrar.reduce((s,f)=>s+f.neto,0)
  const totalIVAporCobrar=porCobrar.reduce((s,f)=>s+f.iva,0)

  // === 4b. PIPELINE PRÓXIMOS 3 MESES (presus aprobados con fecha evento futura) ===
  const presusAprobados=pr.filter(isAprobado)
  const fcByPresu={}; fc.forEach(f=>{fcByPresu[String(f['N° Presupuesto'])]=f})
  const proxMeses=[]
  for(let i=0;i<3;i++){const m=((mesActual-1+i)%12)+1;const a=anioActual+Math.floor((mesActual-1+i)/12);proxMeses.push({m,a})}
  const pipeline=proxMeses.map(({m,a})=>{
    const psAll=pr.filter(p=>esDelMes(p['Fecha Evento'],m,a))
    const ps=psAll.filter(isAprobado)
    const psEnEspera=psAll.filter(p=>String(p['Estado']||'').toUpperCase()==='EN ESPERA')
    const psDesaprobados=psAll.filter(p=>String(p['Estado']||'').toUpperCase()==='DESAPROBADO')
    const facEsperada=ps.reduce((s,p)=>s+parseMonto(p['Precio Final']),0)
    const ganancia=ps.reduce((s,p)=>s+parseMonto(p['Fee Agencia']),0)
    const enEspera=psEnEspera.reduce((s,p)=>s+parseMonto(p['Precio Final']),0)
    const yaFacturado=ps.filter(p=>fcByPresu[String(p['Columna 1'])]).length
    return {m,a,cant:ps.length,facEsperada,ganancia,yaFacturado,enEspera,cantEspera:psEnEspera.length,cantTotal:psAll.length,cantDesa:psDesaprobados.length}
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

  return <div>

    {/* 1. SALDOS EN CUENTA */}
    <div style={{...S.card,marginBottom:12,padding:'14px 18px',background:'#0F1A0F',borderColor:'#1D9E7530'}}>
      <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',marginBottom:12,gap:16,flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:11,color:'#1D9E7599',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Caja bruta</div>
          <div style={{fontSize:28,fontWeight:600,fontFamily:'monospace',color:'#1D9E75'}}>{fmt(totalCaja)}</div>
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
            {pipeline.map(({m,a,cant,facEsperada,ganancia,yaFacturado,enEspera,cantEspera,cantTotal,cantDesa},i)=>(
              <div key={i} style={{background:'#1E1E1E',borderRadius:8,padding:'10px 12px',border:'0.5px solid '+(i===0?'#1543F840':'#2A2A2A')}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                  <span style={{fontSize:10,color:'#888',textTransform:'uppercase',letterSpacing:'.06em'}}>{['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][m-1]} {a}{i===0?' (actual)':''}</span>
                  <span style={{fontSize:9,color:'#555'}}>{cantTotal} presus</span>
                </div>
                <div style={{fontFamily:'monospace',fontSize:15,fontWeight:600,color:'#1543F8'}}>{fmtM(facEsperada)}</div>
                <div style={{fontSize:10,color:'#555'}}>facturación aprobada</div>
                <div style={{borderTop:'0.5px solid #2A2A2A',marginTop:6,paddingTop:6,display:'flex',justifyContent:'space-between',fontSize:11}}>
                  <span style={{color:'#888'}}>Ganancia</span>
                  <span style={{fontFamily:'monospace',color:'#1D9E75',fontWeight:500}}>{fmtM(ganancia)}</span>
                </div>
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
      const r=await fetch('/api/admin/setup-sheets',{method:'POST',headers:{'x-user-email':mail}})
      const j=await r.json()
      setStatus(j.ok?`✓ Creadas: ${j.created.join(', ')||'ninguna'}. Ya existían: ${j.skipped.join(', ')||'ninguna'}`:'✗ '+(j.error||'Error'))
    }catch(e){setStatus('✗ '+e.message)}
    setWorking(false)
  }

  const runBackfill=async(año,dryRun,replace)=>{
    setWorking(true);setStatus(`Backfill ${año} ${dryRun?'(dry run)':'(escribiendo)'}...`)
    try{
      const r=await fetch('/api/admin/backfill-historico',{method:'POST',headers:{'Content-Type':'application/json','x-user-email':mail},body:JSON.stringify({año,dryRun,replaceExisting:replace})})
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
      const r=await fetch('/api/presupuesto-represupuestar',{method:'POST',headers:{'Content-Type':'application/json','x-user-email':mail},body:JSON.stringify(body)})
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

function Presupuestos({data:initialData,mail,onRefresh}){
  const [localData,setLocalData]=useState(initialData)
  const [q,setQ]=useState(''), [f,setF]=useState('todos'), [pm,setPm]=useState('todos'), [anio,setAnio]=useState('todos'), [mes,setMes]=useState('todos'), [open,setOpen]=useState(null), [toast,setToast]=useState('')
  const [repP,setRepP]=useState(null) // presupuesto a represupuestar (abre NuevoPresupuesto con initialData)

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
    const manio=anio==='todos'||fp.includes(anio)
    const mmes=mes==='todos'||parseInt(fp.split('/')[1])===parseInt(mes)
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
          {['N°','Fecha','PM','Agencia','Cliente','Proyecto','Total','Estado'].map(h=>(
            <th key={h} style={{fontSize:10,color:'#555',padding:'8px 12px',textAlign:'left',fontWeight:400,textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:'0.5px solid #2A2A2A'}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {filtered.map((p,i)=>{
            const isOpen=open===p['Columna 1']
            const key=String(p['Columna 1'])
            return <>
              <tr key={key} style={{background:isOpen?'#1E1E1E':i%2===0?'#161616':'#1A1A1A',cursor:'pointer'}} onClick={()=>setOpen(isOpen?null:p['Columna 1'])}>
                <td style={{...S.td,color:'#1543F8',fontFamily:'monospace',fontSize:11}}>#{p['Columna 1']}</td>
                <td style={{...S.td,fontSize:11,color:'#666'}}>{p['Fecha Presupuesto']||'—'}</td>
                <td style={{...S.td,fontSize:12}}>{p['PM Interno']||'—'}</td>
                <td style={{...S.td,fontSize:12}}>{p['Agencia']||'—'}</td>
                <td style={{...S.td,fontSize:12,fontWeight:500}}>{p['Cliente']||'—'}</td>
                <td style={{...S.td,fontSize:12,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p['Proyecto']||'—'}</td>
                <td style={{...S.td,fontFamily:'monospace',fontSize:12}}>{fmt(parseMonto(p['Precio Final']))}</td>
                <td style={{...S.td}} onClick={e=>e.stopPropagation()}>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <BadgeEstado p={p} mail={mail} data={localData} onUpdate={handleEstadoUpdate} onRefresh={onRefresh} onRepresupuestar={setRepP}/>
                    <button title='Generar PDF' onClick={e=>{e.stopPropagation();window.open('/presupuesto?nro='+encodeURIComponent(p['Columna 1']),'_blank')}} style={{padding:'2px 8px',borderRadius:4,border:'0.5px solid #333',background:'transparent',color:'#888',fontSize:11,cursor:'pointer'}}>PDF</button>
                  </div>
                </td>
              </tr>
              {isOpen&&<tr key={key+'d'}><td colSpan={8} style={{padding:0}}><DetallePresupuesto p={p}/></td></tr>}
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
  </div>
}

// ---- PROYECTOS ----
function Proyectos({data,mail}){
  const MESES_F=[['01','Enero'],['02','Febrero'],['03','Marzo'],['04','Abril'],['05','Mayo'],['06','Junio'],['07','Julio'],['08','Agosto'],['09','Septiembre'],['10','Octubre'],['11','Noviembre'],['12','Diciembre']]
  const [open,setOpen]=useState(null),[sels,setSels]=useState({}),[guardados,setGuardados]=useState({}),[saving,setSaving]=useState(null),[toast2,setToast2]=useState('')
  const [q,setQ]=useState(''),[anio,setAnio]=useState('todos'),[mes,setMes]=useState('todos'),[pm,setPm]=useState('todos'),[agencia,setAgencia]=useState('todos'),[estado,setEstado]=useState('todos')
  const proyectos=(data.proyectos||[]).filter(p=>p['N° presupuesto'])
  const staffRRHH=['Somos Magma',...(data.rrhh||[]).map(r=>r['Nombre Apellido']).filter(Boolean).sort()]
  const getPrecioLista=(nombre)=>{if(!nombre)return 0;const s=SVCS_LIST.find(x=>nombre===x.n);return s?s.p:0}
  const anios=[...new Set(proyectos.map(p=>{const f=p['Fecha Evento']||'';const m=f.match(/(\d{4})/);return m?m[1]:null}).filter(Boolean))].sort().reverse()
  const pms=[...new Set(proyectos.map(p=>p['PM']||p['PM Interno']||'').filter(Boolean))].sort()
  const agencias=[...new Set(proyectos.map(p=>p['Agencia']||'').filter(Boolean))].sort()
  const filtrados=proyectos.filter(p=>{
    const fecha=p['Fecha Evento']||''
    const mMatch=mes==='todos'||parseInt(fecha.split('/')[1])===parseInt(mes)
    const aMatch=anio==='todos'||fecha.includes(anio)
    const pmVal=p['PM']||p['PM Interno']||''
    return (agencia==='todos'||(p['Agencia']||'')===agencia)&&(mes==='todos'||mMatch)&&(anio==='todos'||aMatch)&&(estado==='todos'||(estado==='ok'&&(p['Carga Staff']===true||p['Carga Staff']==='TRUE'))||(estado==='pendiente'&&p['Carga Staff']!==true&&p['Carga Staff']!=='TRUE'))&&(!q||[p['N° presupuesto'],p['Proyecto'],p['Cliente'],p['Agencia']].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase())))
  })
  const getBase=(proy)=>{const svcs=[];for(let j=1;j<=12;j++){const ped=proy['Pedido '+j]||proy[j===1?'Pedido':'']||'',qui=proy['Staff '+j]||proy[j===1?'Staff':'']||'',prc=parseMonto(proy['Precio '+j]||proy[j===1?'Precio':'']||0),precioRef=prc||getPrecioLista(ped);if(ped)svcs.push({pedido:ped,quien:qui,precio:precioRef,precioRef,esExtra:false})};return svcs}
  const getSel=(num,base)=>sels[num]||base.map(s=>({...s}))
  const upd=(num,idx,field,val,base)=>setSels(prev=>{const cur=[...getSel(num,base)];cur[idx]={...cur[idx],[field]:field==='precio'?parseFloat(val)||0:val};if(field==='pedido'){const pL=getPrecioLista(val);if(pL>0)cur[idx].precio=pL};return {...prev,[num]:cur}})
  const addExtra=(num,base)=>setSels(prev=>({...prev,[num]:[...getSel(num,base),{pedido:'',quien:'',precio:0,precioRef:0,esExtra:true}]}))
  const delExtra=(num,idx,base)=>setSels(prev=>({...prev,[num]:getSel(num,base).filter((_,i)=>i!==idx)}))
  const resumen=(items,totalProy)=>{let fl=0,mg=0;items.forEach(s=>{if(!s.quien)return;const v=s.precio||0;if(s.quien==='Somos Magma')mg+=v;else fl+=v});return {fl,mg,fee:totalProy-fl-mg}}
  const guardar=async(num,base)=>{setSaving(num);const items=getSel(num,base);try{await fetch('/api/proyecto-staff',{method:'POST',headers:{'Content-Type':'application/json','x-user-email':mail},body:JSON.stringify({num,staffData:items.map(s=>({nombre:s.quien,monto:s.precio||0,pedido:s.pedido}))})});setGuardados(prev=>({...prev,[num]:true}));setOpen(null);setToast2('Staff guardado ✓');setTimeout(()=>setToast2(''),2500)}catch(e){};setSaving(null)}
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
        return <div key={i} style={{...S.card,marginBottom:8}}>
          <div style={{display:'grid',gridTemplateColumns:'80px 1fr 160px 70px 110px 90px 90px',alignItems:'center',cursor:'pointer',padding:'10px 0'}} onClick={()=>setOpen(isOpen?null:num)}>
            <span style={{padding:'0 12px',color:'#1543F8',fontFamily:'monospace',fontSize:11}}>#{num}</span>
            <span style={{padding:'0 12px',fontWeight:500,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p['Proyecto']||'—'}<span style={{fontSize:10,color:'#555',marginLeft:6}}>{p['Fecha Evento']||''}</span></span>
            <span style={{padding:'0 12px',fontSize:12,color:'#555'}}>{[p['Agencia'],p['Cliente']].filter(Boolean).join(' / ')}</span>
            <span style={{padding:'0 12px',fontSize:12,color:'#555'}}>{p['PM']||p['PM Interno']||'—'}</span>
            <span style={{padding:'0 12px',fontFamily:'monospace',fontSize:12}}>{fmt(totalProy)}</span>
            <span style={{padding:'0 12px'}}><span style={{...S.badge,background:ok?'#1D9E7520':'#BA751720',color:ok?'#1D9E75':'#BA7517'}}>{ok?'OK':'Pendiente'}</span></span>
            <span style={{padding:'0 12px'}}><button style={S.fb} onClick={e=>{e.stopPropagation();setOpen(isOpen?null:num)}}>{ok?'Ver':'Cargar'}</button></span>
          </div>
          {isOpen&&<div style={{borderTop:'0.5px solid #2A2A2A',padding:'16px'}}>
            <div style={{fontSize:11,color:'#555',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.06em'}}>Asignar staff — precio precargado. Pods agregar servicios extra.</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1.2fr 110px 28px',gap:8,marginBottom:6}}>{['Servicio','Staff','Monto',''].map(h=><span key={h} style={{fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'0.06em',padding:'0 4px'}}>{h}</span>)}</div>
            {items.map((s,idx)=>{
              const em=s.quien==='Somos Magma'
              const rowSt=em?{background:'#9635AB08',border:'0.5px solid #9635AB30',borderRadius:6,padding:'4px 0'}:{}
              return <div key={idx} style={{display:'grid',gridTemplateColumns:'1fr 1.2fr 110px 28px',gap:8,alignItems:'center',marginBottom:6,...rowSt}}>
                {s.esExtra?<select value={s.pedido} onChange={e=>upd(num,idx,'pedido',e.target.value,base)} style={{...inp,color:s.pedido?'#F0F0F0':'#555'}}><option value="">— Servicio extra —</option>{SVCS_LIST.map(sv=><option key={sv.n} value={sv.n}>{sv.n}</option>)}</select>
                :<div style={{padding:'8px 10px',background:em?'transparent':'#1E1E1E',borderRadius:6,fontSize:13,display:'flex',alignItems:'center',gap:6}}>{s.pedido||'—'}{em&&<span style={{fontSize:10,color:'#9635AB',padding:'2px 6px',background:'#9635AB15',borderRadius:3,fontWeight:500}}>Magma</span>}</div>}
                <select value={s.quien} onChange={e=>upd(num,idx,'quien',e.target.value,base)} style={{...inp,color:em?'#9635AB':'#F0F0F0',border:'0.5px solid '+(em?'#9635AB40':'#333')}}><option value="">— Sin asignar —</option>{staffRRHH.map(st=><option key={st} value={st}>{st}</option>)}</select>
                <input type="number" value={s.precio||''} onChange={e=>upd(num,idx,'precio',e.target.value,base)} placeholder={s.precioRef?String(s.precioRef):'$'} style={{...inp,color:em?'#9635AB':'#F0F0F0',fontFamily:'monospace'}}/>
                <button onClick={()=>s.esExtra&&delExtra(num,idx,base)} style={{width:24,height:24,border:'none',background:'transparent',color:s.esExtra?'#E24B4A':'transparent',cursor:s.esExtra?'pointer':'default',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}>{s.esExtra?'×':''}</button>
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
  </div>
}

// ---- FACTURACION ----
const CUENTAS_FC=['SRL-BBVA','Sofia-Galicia','Sofia-Santander','Lulu-Santander']
const ENT_FC={SRL:{label:'SRL',color:'#1543F8',bg:'#1543F815'},Sofia:{label:'Sofia',color:'#9635AB',bg:'#9635AB15'},Lulu:{label:'Lulu',color:'#1D9E75',bg:'#1D9E7515'},Efectivo:{label:'Efectivo',color:'#BA7517',bg:'#BA751715'}}
function Facturacion({data,mail,onRefresh}){
  const [filtro,setFiltro]=useState('todas'),[abierto,setAbierto]=useState(null),[nuevaOpen,setNuevaOpen]=useState(false),[busqueda,setBusqueda]=useState('')
  const [presuSel,setPresuSel]=useState(null),[montoTipo,setMontoTipo]=useState('total'),[montoCustom,setMontoCustom]=useState('')
  const [formData,setFormData]=useState({entidad:'SRL',tipo:'A',nroFactura:'',plazo:'30',conIVA:true})
  const [saving,setSaving]=useState(false),[toast,setToast]=useState(''),[cobroData,setCobroData]=useState({})
  const [pQuery,setPQuery]=useState('')
  const [pdfFile,setPdfFile]=useState(null),[cuitAuto,setCuitAuto]=useState('')
  const fc=data.facturacion||[]
  const presus=(data.presupuestos||[]).filter(p=>isAprobado(p))
  const parseD=s=>{if(!s)return null;const pts=String(s).split('/');if(pts.length===3){return new Date(pts[2],pts[1]-1,pts[0])}return null}
  const diffD=f=>{const v=parseD(f['Vencimiento']);if(!v)return 0;return Math.floor((v-new Date())/864e5)}
  const estF=f=>{if(isCobrada(f))return'cobrada';const yaCob=parseMonto(f['Monto cobrado']);if(yaCob>0)return'parcial';const d=diffD(f);if(d<-30)return'reclamar';if(d<0)return'vencida';if(d<7)return'por-vencer';return'pendiente'}
  const fechaHoy=()=>{const d=new Date();return d.getDate()+'/'+(d.getMonth()+1)+'/'+d.getFullYear()}
  const calcVencF=()=>{const d=new Date();d.setDate(d.getDate()+parseInt(formData.plazo||30));return d.getDate()+'/'+(d.getMonth()+1)+'/'+d.getFullYear()}
  const textoReclamo=f=>'Estimados, les escribimos para recordarles que la factura '+(f['Nro de Factura']||'')+' por '+fmt(parseMonto(f['Precio FINAL']))+' emitida el '+(f['Fecha emision']||'')+' se encuentra vencida hace '+Math.abs(diffD(f))+' dias. Quedamos a la espera del pago. Muchas gracias.'
  const getEntidad=f=>{const n=f['Nro de Factura']||'';if(n.toLowerCase().includes('sofia'))return'Sofia';if(n.toLowerCase().includes('lulu'))return'Lulu';if(n.toLowerCase().includes('ef-')||n.toLowerCase().includes('efectivo'))return'Efectivo';return'SRL'}
  const parseFC=s=>{if(!s)return null;const p=String(s).split('/');if(p.length===3)return new Date(p[2],p[1]-1,p[0]);return null}
  const filtradas=fc.filter(f=>{
    if(filtro==='pendiente'&&(isCobrada(f)||estF(f)==='parcial'))return false
    if(filtro==='parcial'&&estF(f)!=='parcial')return false
    if(filtro==='cobrada'&&!isCobrada(f))return false
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
  const getCuit=p=>{const ag=p['Agencia']||'';const cl=p['Cliente']||'';const ct=contactos.find(c=>c['Agencia']===ag||c['Agencia']===cl||c['Cliente']===cl);return ct?ct['CUIT']||ct['Cuit']||ct['cuit']||'':''}
  const presusConPendiente=presus.map(p=>{const facturado=fc.filter(f=>String(f['N° Presupuesto'])===String(p['Columna 1'])).reduce((s,f)=>s+parseMonto(f['Precio FINAL']),0);const neto=parseMonto(p['Precio Final']);return{...p,facturado,neto,pendiente:neto-facturado,completo:facturado>=neto}}).filter(p=>!p.completo&&p.neto>0)
  const presusFiltrados=presusConPendiente.filter(p=>!pQuery||[String(p['Columna 1']),p['Proyecto']||'',p['Cliente']||'',p['Agencia']||''].some(v=>v.toLowerCase().includes(pQuery.toLowerCase())))
  const calcNeto=()=>{if(!presuSel)return 0;return montoTipo==='total'?presuSel.pendiente:parseFloat(montoCustom)||0}
  const calcIvaF=()=>formData.conIVA?Math.round(calcNeto()*0.21):0
  const calcTotalF=()=>calcNeto()+calcIvaF()
  const guardarFactura=async()=>{if(!presuSel||!calcNeto())return;setSaving(true);try{await fetch('/api/factura-nueva',{method:'POST',headers:{'Content-Type':'application/json','x-user-email':mail},body:JSON.stringify({presupuestoNum:presuSel['Columna 1'],proyecto:presuSel['Proyecto'],agencia:presuSel['Agencia'],cliente:presuSel['Cliente'],entidad:formData.entidad,tipo:formData.tipo,nroFactura:formData.nroFactura,fechaEmision:fechaHoy(),fechaVenc:calcVencF(),plazo:formData.plazo,conIVA:formData.conIVA,neto:calcNeto(),iva:calcIvaF(),total:calcTotalF()})});setToast('Factura guardada!');setTimeout(()=>setToast(''),2500);if(pdfFile){try{const fd=new FormData();fd.append('file',pdfFile,pdfFile.name);fd.append('entidad',formData.entidad);fd.append('nroFactura',formData.nroFactura);const now=new Date();fd.append('mes',String(now.getMonth()+1));fd.append('anio',String(now.getFullYear()));await fetch('/api/factura-upload',{method:'POST',body:fd});}catch(eu){console.error('upload error',eu)}}setNuevaOpen(false);setPresuSel(null);setMontoCustom('');setPQuery('');setCuitAuto('');setPdfFile(null);setFormData({entidad:'SRL',tipo:'A',nroFactura:'',plazo:'30',conIVA:true})}catch(e){setToast('Error: '+e.message);}setSaving(false)}
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
      const resp=await fetch('/api/factura-cobro',{method:'POST',headers:{'Content-Type':'application/json','x-user-email':mail},body:JSON.stringify({
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
                {l==='Factura por'&&<select style={inp2} value={formData.entidad} onChange={e=>setFormData(p=>({...p,entidad:e.target.value}))}><option value='SRL'>Somos Magma SRL</option><option value='Sofia'>Sofia Grenier</option><option value='Lulu'>Lucia Grenier</option><option value='Efectivo'>Efectivo (sin factura)</option></select>}
                {l==='Tipo'&&<select style={inp2} value={formData.tipo} onChange={e=>setFormData(p=>({...p,tipo:e.target.value}))}>{['A','B','C'].map(o=><option key={o}>{o}</option>)}</select>}
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
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}><div><div style={{fontSize:11,color:'#555',marginBottom:4}}>CUIT del cliente</div><input style={{...inp2,color:cuitAuto?'#1D9E75':'#F0F0F0'}} value={cuitAuto} onChange={e=>setCuitAuto(e.target.value)} placeholder='Autocomplete por agencia/cliente'/></div><div><div style={{fontSize:11,color:'#555',marginBottom:4}}>Adjuntar factura PDF</div><input type='file' accept='.pdf,.PDF' onChange={e=>setPdfFile(e.target.files[0]||null)} style={{padding:'6px',border:'0.5px solid #333',borderRadius:6,background:'#1E1E1E',color:'#F0F0F0',fontSize:11,width:'100%',cursor:'pointer'}}/></div></div><button onClick={guardarFactura} disabled={!calcNeto()||saving} style={{padding:'10px 24px',borderRadius:8,border:'none',background:'#1543F8',color:'#fff',fontSize:13,fontWeight:500,cursor:'pointer',width:'100%',opacity:!calcNeto()||saving?0.4:1}}>{saving?'Guardando...':'Crear factura'}</button>
        </div>}
      </div>}
    </div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,gap:10,flexWrap:'wrap'}}>
      <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
        {[['todas','Todas'],['pendiente','Pendientes'],['parcial','Parciales'],['cobrada','Cobradas'],['SRL','SRL'],['Sofia','Sofia'],['Lulu','Lulu']].map(([id,l])=>(
          <button key={id} style={{...S.fb,...(filtro===id?S.fa:{})}} onClick={()=>setFiltro(id)}>{l}</button>
        ))}
      </div>
      <div style={{display:'flex',gap:6,alignItems:'center',flex:'1 1 240px',maxWidth:380}}>
        <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder='🔍 Buscar nro, cliente, proyecto, agencia, monto...' style={{flex:1,padding:'7px 10px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontSize:12,outline:'none'}}/>
        {busqueda&&<button onClick={()=>setBusqueda('')} style={{padding:'7px 10px',borderRadius:6,border:'0.5px solid #333',background:'transparent',color:'#888',fontSize:11,cursor:'pointer'}}>×</button>}
      </div>
    </div>
    <div style={{fontSize:11,color:'#555',marginBottom:6}}>{filtradas.length} {filtradas.length===1?'factura':'facturas'}{filtro==='cobrada'?' (más recientes arriba)':''}{busqueda?' · filtrado por "'+busqueda+'"':''}</div>
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
          <div style={{display:'grid',gridTemplateColumns:'auto auto 1fr auto auto auto',gap:10,alignItems:'center',padding:'11px 14px',cursor:'pointer'}} onClick={()=>setAbierto(isOpen?null:f['N° Presupuesto'])}>
            <span style={{fontFamily:'monospace',fontSize:11,color:'#1543F8',whiteSpace:'nowrap'}}>{f['Nro de Factura']||'s/n'}</span>
            <span style={{fontSize:10,padding:'2px 6px',borderRadius:3,whiteSpace:'nowrap',fontWeight:500,background:entCfg.bg,color:entCfg.color}}>{entCfg.label}</span>
            <div style={{minWidth:0}}>
              <div style={{fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f['Proyecto']||f['Cliente']}</div>
              <div style={{fontSize:11,color:'#555',marginTop:1}}>{f['Cliente']}{f['Agencia']?' · '+f['Agencia']:''} · {isCobrada(f)?'cobrado '+( f['Fecha cobro']||''):'vence '+(f['Vencimiento']||'—')}</div>
            </div>
            <div style={{textAlign:'right',whiteSpace:'nowrap'}}>
              <div style={{fontFamily:'monospace',fontSize:13,fontWeight:500,color:'#1543F8'}}>{fmt(neto)}</div>
              <div style={{fontFamily:'monospace',fontSize:10,color:'#555'}}>{iva>0?'+IVA '+fmt(iva):'Sin IVA'}</div>
            </div>
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
    </div>
  </div>
}
// ---- PAGOS STAFF ----
function PagosStaff({data,mail,onRefresh}){
  const CUENTAS=['SRL — BBVA','Sofia — Galicia','Sofia — Santander','Lucia — Santander','Efectivo']
  const COLORS=['#1543F8','#CE2637','#9635AB','#1D9E75','#BA7517','#E24B4A']
  const getColor=n=>COLORS[n.charCodeAt(0)%COLORS.length]
  const initials=n=>n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()

  const [mesSel,setMesSel]=useState(null)
  const [abierto,setAbierto]=useState(null)
  const [showDesc,setShowDesc]=useState(null)
  const [cuentaLocal,setCuentaLocal]=useState({})
  const [savingPerson,setSavingPerson]=useState(null)
  const [copiado,setCopiado]=useState(null)

  const proyectos=(data.proyectos||[]).filter(p=>p['N° presupuesto'])
  const pagosPersistidos=data.pagosStaff||[]

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
        await fetch('/api/pago-staff-toggle',{method:'POST',headers:{'Content-Type':'application/json','x-user-email':mail},body:JSON.stringify({mes:mesActual,persona:persona.nombre,nroProyecto:t.nro,proyecto:t.proyecto,pedido:t.pedido,monto:t.precio,fechaEvento:t.fechaEvento,agencia:t.agencia,pagado,cuenta:getCuenta(persona.nombre)})})
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

  return <div>
    {/* Tabs de meses */}
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
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

    {/* KPIs */}
    <div style={S.k4}>
      <K lbl='Total a pagar' val={fmtM(totalPend)} sub={lista.filter(p=>p.totalPendiente>0).length+' persona/s · vence el 15'} c='#E24B4A'/>
      <K lbl='Ya pagado' val={fmtM(totalPag)} sub={personasFullPagadas+' de '+lista.length+' personas'} c='#1D9E75'/>
      <K lbl='Total staff mes' val={fmtM(totalPend+totalPag)} sub={lista.length+' personas · '+proyMes.length+' proyectos'}/>
      <K lbl='Ciclo' val='Pago el 15' sub='del mes siguiente'/>
    </div>

    {/* Lista */}
    <div style={{overflowY:'auto',maxHeight:'calc(100vh - 280px)'}}>
      {lista.length===0&&<div style={S.nd}>Sin staff asignado en proyectos de {mesActual||'este mes'}</div>}
      {lista.map((persona,i)=>{
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
      const r=await fetch('/api/egreso-toggle',{method:'POST',headers:{'Content-Type':'application/json','x-user-email':mail},body:JSON.stringify({
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
      const r=await fetch('/api/egreso-toggle',{method:'POST',headers:{'Content-Type':'application/json','x-user-email':mail},body:JSON.stringify({
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
      await fetch('/api/egreso-toggle',{method:'POST',headers:{'Content-Type':'application/json','x-user-email':mail},body:JSON.stringify({hoja,fila,cuentaPago:nuevaCuenta})})
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
      const r=await fetch('/api/tarjeta-procesar',{method:'POST',headers:{'Content-Type':'application/json','x-user-email':mail},body:JSON.stringify({pdfBase64:b64,fileName:file.name})}).then(r=>r.json())
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
      const r=await fetch('/api/tarjeta-guardar',{method:'POST',headers:{'Content-Type':'application/json','x-user-email':mail},body:JSON.stringify({tarjeta:previewData.tarjeta,mes:Number(previewData.mes),anio:Number(previewData.anio),movimientos:movs})}).then(r=>r.json())
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

  const anios=['2025','2026','2027']
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
    <SEC titulo={`Tarjetas (${MESES[mesNum-1]} ${anio})`} items={tarjMes} hoja='TARJETAS' arrFuente={tarjetas} color='#1543F8' renderExtra={t=>`${t['Tarjeta']} ${t['Moneda']==='USD'?'(USD)':''}`}/>
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
      await fetch('/api/movimiento-toggle',{method:'POST',headers:{'Content-Type':'application/json','x-user-email':mail},body:JSON.stringify({fila,revisado:!isRev(m['Revisado'])})})
      if(typeof onRefresh==='function')await onRefresh()
    }catch(e){alert('Error: '+e.message)}
    setSaving(null)
  }

  const cambiarCategoria=async(m,nueva)=>{
    const fila=findFilaOriginal(m);if(!fila)return
    setSaving(fila)
    try{
      await fetch('/api/movimiento-toggle',{method:'POST',headers:{'Content-Type':'application/json','x-user-email':mail},body:JSON.stringify({fila,categoria:nueva})})
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
      await fetch('/api/sueldo-upsert',{method:'POST',headers:{'Content-Type':'application/json','x-user-email':mail},body:JSON.stringify({mes:mesNum,anio,persona,tipo:'fijo',...updates})})
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
  const out = []
  for (let i=1;i<=12;i++) {
    const pk = findKey('pedido', i), ck = findKey('precio', i)
    const rawSvc = pk ? (p[pk]||'') : ''
    const svcClean = stripSvcPrefix(rawSvc)
    // Match contra SVCS_LIST para validar el nombre
    const match = SVCS_LIST.find(s => stripSvcPrefix(s.n) === svcClean || s.n === rawSvc)
    const svc = match ? match.n : (svcClean || '')
    const precio = ck ? parseMonto(p[ck]) : 0
    if (svc || precio) out.push({svc, precio})
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
      ? pedidosIniciales.map((x,i)=>({id:i+1,svc:x.svc,precio:String(x.precio||''),feeAg:(SVCS_LIST.find(s=>s.n===x.svc)?.fee)??true,manual:false}))
      : [{id:1,svc:'',precio:'',feeAg:true,manual:false},{id:2,svc:'',precio:'',feeAg:true,manual:false}]
  )
  const parseFechaSheet = s => { const parts=String(s||'').split('/'); if(parts.length===3){const yr=parts[2].length===4?parts[2]:'20'+parts[2]; return `${yr}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`}; return '' }
  const [form,setForm]=useState(isRepresupuestar ? {
    fp:new Date().toISOString().slice(0,10),
    fechaMode:'dia',
    fe1:parseFechaSheet(initialData['Fecha Evento']),
    feIni:'',feFin:'',
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
    tajuste:'1',
    ajuste:String(parseMonto(initialData['Ajuste'])||'0'),
    motivo:'',
  } : {fp:new Date().toISOString().slice(0,10),fechaMode:'dia',fe1:'',feIni:'',feFin:'',agencia:'',cliente:'',proyecto:'',contacto:'',pm:'',repr:'',plazo:'0',interes:'0',gan:false,iibb:false,tajuste:'1',ajuste:'0',motivo:''})
  const [saving,setSaving]=useState(false),[ok,setOk]=useState(false)
  const [hintAg,setHintAg]=useState(false),[hintCl,setHintCl]=useState(false),[hintCt,setHintCt]=useState(false)
  const [ctData,setCtData]=useState({mail:'',telefono:'',cuit:'',cargo:''})
  const [diasMulti,setDiasMulti]=useState([''])
  const version=isRepresupuestar ? String(nextNum).match(/v\d+$/i)?.[0] || 'V2' : (form.repr?'V2':'')
  const tieneAg=form.agencia.trim()!==''
  const calcT=()=>{
    const subtotal=peds.reduce((s,p)=>s+(parseFloat(p.precio)||0),0)
    const feeBase=peds.reduce((s,p)=>p.feeAg?(s+(parseFloat(p.precio)||0)):s,0)
    const fee=tieneAg?feeBase:0,base=subtotal+fee
    const gan=form.gan?fee*0.35:0,iibb=form.iibb?fee*0.094:0
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
    if(!form.cliente.trim()||!peds.some(p=>p.svc))return
    if(isRepresupuestar && !form.motivo.trim())return
    setSaving(true)
    const fechaEventoOut = form.fe1 ? form.fe1.split('-').reverse().join('/') : (form.feIni?form.feIni.split('-').reverse().join('/'):'')
    const cantFechas = form.fechaMode==='multi' ? diasMulti.filter(Boolean).length : (form.fechaMode==='rango' && form.feIni && form.feFin ? Math.max(1,Math.round((new Date(form.feFin)-new Date(form.feIni))/864e5)+1) : 1)
    const row={
      'Columna 1':nextNum,
      'Estado':'EN ESPERA',
      'PM Interno':form.pm,
      'Agencia':form.agencia,
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
      'Plazo':form.plazo?String(form.plazo)+(form.plazo==='0'?'':' días'):'Contado',
      'Interes %':form.interes?form.interes+'%':'',
      'Interes $':T.intMto,
      'Total':T.total,
      'Ajuste':T.ajMto,
    }
    peds.filter(p=>p.svc).forEach((p,i)=>{row['Pedido '+(i+1)]=p.svc;row['Precio '+(i+1)]=p.precio})
    try{
      await fetch('/api/presupuesto-nuevo',{method:'POST',headers:{'Content-Type':'application/json','x-user-email':mail||'juan@somosmagma.com'},body:JSON.stringify(row)})
      if (isRepresupuestar) {
        await fetch('/api/presupuesto-estado',{method:'POST',headers:{'Content-Type':'application/json','x-user-email':mail||'juan@somosmagma.com'},body:JSON.stringify({num:initialData['Columna 1'],estado:'REPRESUPUESTADO',motivo:form.motivo})})
      }
    }catch(e){}
    if(hintCt&&form.contacto.trim()){try{await fetch('/api/contacto-nuevo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:form.contacto,agencia:form.agencia,mail:ctData.mail,telefono:ctData.telefono,cuit:ctData.cuit,cargo:ctData.cargo})})}catch(e){}}
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
        <div style={{fontSize:14,color:'#888',marginBottom:8}}>N° <span style={{fontFamily:'monospace',color:'#F0F0F0'}}>#{nextNum}</span></div>
        <div style={{fontSize:12,color:'#555',marginBottom:24}}>Ya está guardado en PRESUPUESTOS{isRepresupuestar?' y el original quedó marcado como REPRESUPUESTADO':''}.</div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          <button style={{width:'100%',padding:'12px 20px',borderRadius:8,border:'none',background:'linear-gradient(135deg,#1543F8,#CE2637)',color:'#fff',fontSize:14,fontWeight:600,cursor:'pointer'}} onClick={()=>window.open('/presupuesto?nro='+encodeURIComponent(nextNum),'_blank')}>📄 Generar PDF del presupuesto</button>
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
                <option value="">— PM —</option><option>Juan</option><option>Sofi</option><option>Lulu</option>
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
              <span style={lbl}>Agencia</span>
              <input style={inp} list="np-ag" value={form.agencia} onChange={e=>{setF('agencia',e.target.value);setHintAg(!!e.target.value&&!AGENCIAS_LIST.some(a=>a.toLowerCase()===e.target.value.toLowerCase()))}} placeholder="Sin agencia / Directo"/>
              <datalist id="np-ag">{AGENCIAS_LIST.map(a=><option key={a} value={a}/>)}</datalist>
              {hintAg&&<span style={{fontSize:10,color:'#1D9E75'}}>Agencia nueva</span>}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              <span style={lbl}>Cliente / Marca</span>
              <input style={inp} list="np-cl" value={form.cliente} onChange={e=>{setF('cliente',e.target.value);setHintCl(!!e.target.value&&!CLIENTES_LIST.some(a=>a.toLowerCase()===e.target.value.toLowerCase()))}} placeholder="Nombre del cliente"/>
              <datalist id="np-cl">{CLIENTES_LIST.map(a=><option key={a} value={a}/>)}</datalist>
              {hintCl&&<span style={{fontSize:10,color:'#1D9E75'}}>Cliente nuevo</span>}
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
            <label style={{display:'flex',flexDirection:'column',gap:4}}><span style={lbl}>Proyecto / descripcion</span><input style={inp} value={form.proyecto} onChange={e=>setF('proyecto',e.target.value)} placeholder="Ej: Evento anual, Film..."/></label>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              <span style={lbl}>Contacto</span>
              <input style={inp} list="np-ct" value={form.contacto} onChange={e=>{setF('contacto',e.target.value);setHintCt(!!e.target.value&&!CONTACTOS_LIST.some(a=>a.n.toLowerCase()===e.target.value.toLowerCase()))}} placeholder="Nombre del contacto"/>
              <datalist id="np-ct">{CONTACTOS_LIST.map(c=><option key={c.n} value={c.n}/>)}</datalist>
              {hintCt&&<div style={{marginTop:6,padding:10,background:'#1D9E7508',border:'0.5px solid #1D9E7530',borderRadius:6}}><div style={{fontSize:10,color:'#1D9E75',marginBottom:8,textTransform:'uppercase',letterSpacing:'.06em'}}>Contacto nuevo - completar datos</div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}><input style={{...inp,fontSize:11}} placeholder='Mail' value={ctData.mail} onChange={e=>setCtData(p=>({...p,mail:e.target.value}))}/><input style={{...inp,fontSize:11}} placeholder='Telefono' value={ctData.telefono} onChange={e=>setCtData(p=>({...p,telefono:e.target.value}))}/><input style={{...inp,fontSize:11}} placeholder='CUIT' value={ctData.cuit} onChange={e=>setCtData(p=>({...p,cuit:e.target.value}))}/><input style={{...inp,fontSize:11}} placeholder='Cargo' value={ctData.cargo} onChange={e=>setCtData(p=>({...p,cargo:e.target.value}))}/></div></div>}
            </div>
          </div>
          <label style={{display:'flex',flexDirection:'column',gap:4,marginBottom:isRepresupuestar?4:12}}><span style={lbl}>Represupuesto del N°</span><input style={inp} value={form.repr} onChange={e=>setF('repr',e.target.value)} placeholder="Dejar vacio si es presupuesto nuevo" readOnly={isRepresupuestar}/></label>
          {isRepresupuestar&&<label style={{display:'flex',flexDirection:'column',gap:4,marginBottom:12}}><span style={{...lbl,color:'#9635AB'}}>Motivo del represupuesto *</span><input style={{...inp,borderColor:form.motivo?'#333':'#9635AB'}} value={form.motivo||''} onChange={e=>setF('motivo',e.target.value)} placeholder="Ej: cambio de scope, ajuste de precios, nuevo pedido del cliente..." autoFocus/></label>}
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
          {[['gan','Imp. Ganancias (35% sobre fee)'],['iibb','IIBB (9.4% sobre fee)']].map(([k,label])=>(
            <div key={k} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 10px',background:'#1A1A1A',borderRadius:6,marginBottom:5}}>
              <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,cursor:'pointer'}}>
                <input type="checkbox" checked={form[k]} onChange={e=>setF(k,e.target.checked)} style={{width:14,height:14,accentColor:'#1543F8'}}/>
                {label}
              </label>
              <span style={{fontFamily:'monospace',fontSize:12,color:'#555'}}>{k==='gan'?fmt(T.fee*0.35):fmt(T.fee*0.094)}</span>
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
            T.iibb>0?['IIBB 9.4%',fmt(T.iibb),'#E24B4A']:null,
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
          {ok?<div style={{marginTop:14,display:'flex',flexDirection:'column',gap:8}}><div style={{background:'#1D9E7520',border:'0.5px solid #1D9E75',borderRadius:6,padding:10,fontSize:12,color:'#1D9E75',textAlign:'center'}}>Presupuesto #{nextNum} cargado</div><button style={{width:'100%',padding:10,borderRadius:8,border:'none',background:'linear-gradient(135deg,#1543F8,#CE2637)',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}} onClick={()=>window.open('/presupuesto?nro='+nextNum,'_blank')}>Generar PDF del presupuesto →</button><button style={{width:'100%',padding:8,borderRadius:8,border:'0.5px solid #2A2A2A',background:'transparent',color:'#555',fontSize:12,cursor:'pointer'}} onClick={onClose}>Cerrar</button></div>
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
    return {
      Año:'2026',Mes:mesNum,Fecha:fechaEv,Nro:nro,
      Cliente:p['Cliente']||(f?f['Cliente']:''),Agencia:p['Agencia']||(f?f['Agencia']:''),
      Proyecto:p['Proyecto']||(f?f['Proyecto']:''),
      Presupuesto:total||subtotal,Total:total,IVA:ivaCalc,
      Magma:fee,Impuestos:impGan+iibb,Viaticos:0,'Extra M':0,
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
  // Ganancia Magma 2024/2025 = Viáticos + Magma + Impuestos + Extra M (según modelo de Juan)
  const totalViaticos=filas.reduce((s,r)=>s+parseMonto(r['Viaticos']),0)
  const totalMagmaCol=filas.reduce((s,r)=>s+parseMonto(r['Magma']),0)
  const totalImpuestos=filas.reduce((s,r)=>s+parseMonto(r['Impuestos']),0)
  const totalExtraM=filas.reduce((s,r)=>s+parseMonto(r['Extra M']),0)
  const gananciaMagma=totalViaticos+totalMagmaCol+totalImpuestos+totalExtraM
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
      <K lbl='Ganancia Magma' val={fmtM(gananciaMagma)} sub={margenPct+'% margen · V '+fmtM(totalViaticos)+' · M '+fmtM(totalMagmaCol)+' · X '+fmtM(totalExtraM)} c='#1D9E75'/>
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

const S={
  app:{display:'flex',height:'100vh',overflow:'hidden'},
  sb:{width:220,background:'#161616',borderRight:'1px solid #2A2A2A',display:'flex',flexDirection:'column',flexShrink:0},
  logo:{fontSize:22,fontWeight:900,background:'linear-gradient(135deg,#1543F8,#9635AB,#CE2637)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'},
  ls:{fontFamily:"'Azeret Mono',monospace",fontSize:9,color:'#555',letterSpacing:'0.12em',textTransform:'uppercase',marginTop:2},
  ni:{display:'flex',alignItems:'center',gap:10,padding:'9px 10px',borderRadius:6,cursor:'pointer',color:'#777',fontSize:13,fontWeight:500,transition:'all 0.15s',marginBottom:2,border:'none',background:'transparent',width:'100%',textAlign:'left'},
  k4:{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:10,marginBottom:12},
  kpi:{background:'#1E1E1E',borderRadius:8,padding:'11px 13px'},
  kl:{fontSize:11,color:'#555',marginBottom:4},
  kv:{fontSize:18,fontWeight:500},
  ks:{fontSize:10,color:'#555',marginTop:3},
  card:{background:'#161616',border:'0.5px solid #2A2A2A',borderRadius:10,overflow:'hidden',marginBottom:8},
  ch:{padding:'10px 14px',background:'#1A1A1A',borderBottom:'0.5px solid #2A2A2A',fontSize:12,fontWeight:500},
  lr:{display:'flex',alignItems:'center',padding:'9px 14px',borderBottom:'0.5px solid #2A2A2A',fontSize:13},
  badge:{display:'inline-flex',padding:'2px 8px',borderRadius:3,fontSize:11,whiteSpace:'nowrap'},
  td:{padding:'9px 12px',borderBottom:'0.5px solid #1E1E1E',fontSize:13},
  fb:{padding:'5px 12px',borderRadius:6,border:'0.5px solid #333',background:'transparent',color:'#555',fontSize:11,cursor:'pointer'},
  fa:{background:'#1E1E1E',color:'#F0F0F0',borderColor:'#555'},
  nd:{textAlign:'center',padding:48,color:'#555',fontSize:13},
  inp:{width:'100%',padding:'10px 12px',borderRadius:8,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontSize:14,outline:'none',marginBottom:12},
  bp:{width:'100%',padding:10,borderRadius:8,border:'none',background:'#1543F8',color:'#fff',fontSize:14,fontWeight:500,cursor:'pointer'},
  lw:{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#090909'},
  lb:{background:'#161616',border:'0.5px solid #2A2A2A',borderRadius:16,padding:'40px 36px',width:360,textAlign:'center'},
  sp:{width:24,height:24,border:'2px solid #1543F820',borderTop:'2px solid #1543F8',borderRadius:'50%',animation:'spin 1s linear infinite',marginTop:16},
}

function GS(){return <style>{"@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@300;400;500;700;900&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{background:#090909;color:#F0F0F0;font-family:'Archivo',sans-serif;font-size:14px;overflow:hidden}@keyframes spin{to{transform:rotate(360deg)}}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#333;border-radius:2px}input[type=number]::-webkit-inner-spin-button{opacity:0}"}</style>}
