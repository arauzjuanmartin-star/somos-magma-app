import { useState, useEffect } from 'react'
import Head from 'next/head'

const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']

// Parsear montos del Sheets que vienen como "$2,400,000.00"
const parseMonto = v => {
  if (!v) return 0
  const n = parseFloat(String(v).replace(/[$,\s]/g, ''))
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
  {n:'📸 Foto ½',p:220000,fee:true},{n:'📷 Foto 1',p:290000,fee:true},
  {n:'🎥 Video ½',p:220000,fee:true},{n:'📹 Video 1',p:290000,fee:true},
  {n:'🎬 Film ½',p:220000,fee:true},{n:'🎞️ Film 1',p:290000,fee:true},
  {n:'🕛 Film 12hs',p:350000,fee:true},{n:'✂️ Edit 60s',p:116000,fee:true},
  {n:'🪄 Edit 60s+',p:174000,fee:true},{n:'🤝 Asist ½',p:140000,fee:true},
  {n:'🙌 Asist 1',p:210000,fee:true},{n:'💻 Vivo 1',p:350000,fee:true},
  {n:'🖥️ Vivo ½',p:230000,fee:true},{n:'🎛️ DirFoto',p:350000,fee:true},
  {n:'🎙️ Sonido',p:290000,fee:true},{n:'🚁 Drone',p:290000,fee:true},
  {n:'🏎️ FPV',p:405000,fee:true},{n:'✨ Motion',p:230000,fee:true},
  {n:'🗂️ Crudos',p:175000,fee:true},{n:'📲 Edit 15-30s',p:116000,fee:true},
  {n:'🖼️ Fotos',p:60000,fee:true},{n:'🖲️ Go Pro',p:230000,fee:true},
  {n:'🌎 Viaticos',p:0,fee:false},{n:'👷🏽 Produ',p:0,fee:false},
  {n:'💅🏽 MakeUp',p:0,fee:false},{n:'🚚 Rental',p:0,fee:false},
  {n:'👯‍♂️ Model',p:0,fee:false},{n:'🍽️ Catering',p:0,fee:false},
  {n:'Otros',p:0,fee:false},
]
const AGENCIAS_LIST=['Ostara','Minita','Pop Up','Stadium','ADN','Quilmes','Creators Lab','Mole Media','WeCorp','Louder','Smarketing','Bacardi','Integra','Btlandia','OIR','SPA','ABV','Piet','Nodus','Bermuda','United Scale Arts','Meikin','CMQ','Bar de eventos','The Bloom','Velvet','Mucha','Freelance','Zona Prop','azcuy','Blue Mail','Mercurias','KLM']
const CLIENTES_LIST=['Santander','Unilever','Austral','Air France','Iveco','Latam','Campari',"L'Oreal",'Maybelline','Betsson','Disney','Quilmes','Chandon','Honda','Peugeot','Endeavor','Baron B','Google','Microsoft','Coca Cola','Adidas','Mercado Libre','YPF','Volkswagen','Personal','Telecom','Brahma','Off','Integra','Rutini','Visa','Natura']
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

const CSS="@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@300;400;500;700;900&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{background:#090909;color:#F0F0F0;font-family:'Archivo',system-ui,sans-serif;font-size:14px;overflow:hidden}@keyframes spin{to{transform:rotate(360deg)}}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#333;border-radius:2px}input[type=number]::-webkit-inner-spin-button{opacity:0}"
function GS(){return <style>{CSS}</style>}

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

  const NAV=[{id:'dashboard',label:'Dashboard',icon:'◆'},{id:'presupuestos',label:'Presupuestos',icon:'□'},{id:'proyectos',label:'Proyectos',icon:'▷'},{id:'facturacion',label:'Facturación',icon:'$'},{id:'pagos',label:'Pagos Staff',icon:'✓'},{id:'balance',label:'Balance',icon:'≡'}]

  if(!mail) return <><Head><title>Somos Magma</title></Head><GS/><div style={S.lw}><div style={S.lb}><div style={S.logo}>M//</div><div style={S.ls}>SOMOS MAGMA</div><div style={{marginBottom:24,fontSize:13,color:'#555'}}>Ingresá con tu mail de trabajo</div><input style={S.inp} type="email" placeholder="tu@somosmagma.com" value={mi} onChange={e=>setMi(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()} autoFocus/>{err&&<div style={{color:'#E24B4A',fontSize:12,marginBottom:8}}>{err}</div>}<button style={S.bp} onClick={login}>Entrar</button></div></div></>

  if(loading) return <><Head><title>Somos Magma</title></Head><GS/><div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',background:'#090909'}}><div style={S.logo}>M//</div><div style={{color:'#555',marginTop:16}}>Cargando...</div><div style={S.sp}/></div></>

  return <><Head><title>Somos Magma</title></Head><GS/>
    <div style={S.app}>
      <div style={S.sb}>
        <div style={{padding:'20px 16px 16px',borderBottom:'1px solid #2A2A2A'}}><div style={S.logo}>M//</div><div style={S.ls}>SOMOS MAGMA</div></div>
        <nav style={{flex:1,padding:'12px 8px',overflowY:'auto'}}>
          {NAV.map(n=><button key={n.id} style={{...S.ni,...(mod===n.id?{color:'#F0F0F0',background:'#262626'}:{})}} onClick={()=>setMod(n.id)}><span style={{fontSize:12,width:16,textAlign:'center'}}>{n.icon}</span>{n.label}</button>)}
        </nav>
        <div style={{padding:'12px 16px',borderTop:'1px solid #2A2A2A'}}><div style={{fontSize:11,color:'#555',marginBottom:6}}>{mail}</div><button style={{fontSize:11,padding:'4px 10px',borderRadius:4,border:'0.5px solid #333',background:'transparent',color:'#555',cursor:'pointer'}} onClick={logout}>Salir</button><div style={{fontSize:11,color:'#333',marginTop:12}}>Productora Audiovisual<br/>since '23 //</div></div>
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
          {!data?<div style={S.nd}>Sin datos</div>:<Mod id={mod} data={data} onRefresh={()=>load(mail)}/>}
        </div>
      </div>
    </div>
    {showNP&&<NuevoPresupuesto onClose={()=>setShowNP(false)} onGuardado={(p)=>{setData(prev=>({...prev,presupuestos:[...(prev.presupuestos||[]),p]}));setShowNP(false)}} data={data}/>}
  </>
}

function Mod({id,data,onRefresh}){
  switch(id){
    case 'dashboard': return <Dashboard data={data}/>
    case 'presupuestos': return <Presupuestos data={data}/>
    case 'proyectos': return <Proyectos data={data}/>
    case 'facturacion': return <Facturacion data={data}/>
    case 'pagos': return <PagosStaff data={data}/>
    case 'balance': return <Balance data={data}/>
    default: return <div style={S.nd}>En construcción</div>
  }
}

// ---- DASHBOARD ----
function Dashboard({data}){
  const pr=data.presupuestos||[], fc=data.facturacion||[]
  const ap=pr.filter(isAprobado)
  const pend=pr.filter(p=>!isAprobado(p))
  const pc=fc.filter(f=>!isCobrada(f))
  const co=fc.filter(isCobrada)
  const totalAp=ap.reduce((s,p)=>s+parseMonto(p['Precio Final']),0)
  const totalPend=pend.reduce((s,p)=>s+parseMonto(p['Precio Final']),0)
  const totalPc=pc.reduce((s,f)=>s+parseMonto(f['Precio FINAL']),0)
  const totalCo=co.reduce((s,f)=>s+parseMonto(f['Precio FINAL']),0)

  return <div>
    <div style={S.k4}>
      <K lbl="Aprobados" val={ap.length} sub={fmtM(totalAp)} c="#1543F8"/>
      <K lbl="En espera" val={pend.length} sub={fmtM(totalPend)} c="#BA7517"/>
      <K lbl="Por cobrar" val={fmtM(totalPc)} sub={pc.length+' facturas'} c="#BA7517"/>
      <K lbl="Cobrado" val={fmtM(totalCo)} sub={co.length+' facturas'} c="#1D9E75"/>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:12}}>
      <div style={S.card}><div style={S.ch}>Últimos aprobados</div>
        {ap.slice(-5).reverse().map((p,i)=><Row key={i} cols={['#'+p['Columna 1'],p['Proyecto']||p['Cliente'],fmt(parseMonto(p['Precio Final']))]}/>)}
      </div>
      <div style={S.card}><div style={S.ch}>Facturas por cobrar</div>
        {pc.slice(0,5).map((f,i)=><Row key={i} cols={[f['Nro de Factura']||'—',f['Cliente']||f['Proyecto'],fmt(parseMonto(f['Precio FINAL']))]} vc="#BA7517"/>)}
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

function BadgeEstado({p, onUpdate}){
  const [open,setOpen]=useState(false), [saving,setSaving]=useState(false), [motivo,setMotivo]=useState(''), [pendingE,setPendingE]=useState(null)
  const ec=estadoColor(p['Estado'])

  const handleSelect=async(estado)=>{
    if(estado==='REPRESUPUESTADO'){setPendingE(estado);setOpen(false);return}
    await doSave(estado)
  }

  const doSave=async(estado, mot='')=>{
    setSaving(true);setOpen(false)
    try{
      await fetch('/api/presupuesto-estado',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:p['Columna 1'],estado,motivo:mot})})
      onUpdate(p['Columna 1'],estado)
    }catch(e){}
    setSaving(false);setPendingE(null);setMotivo('')
  }

  return <div style={{position:'relative'}}>
    {pendingE&&<div style={{position:'fixed',inset:0,background:'#000a',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setPendingE(null)}>
      <div style={{background:'#1E1E1E',border:'0.5px solid #2A2A2A',borderRadius:12,padding:24,minWidth:320}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:13,fontWeight:500,marginBottom:12}}>Motivo del represupuesto</div>
        <input style={{...S.inp,marginBottom:12}} placeholder="Ej: Cambió el scope, ajuste de precios..." value={motivo} onChange={e=>setMotivo(e.target.value)} autoFocus/>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button style={{...S.fb}} onClick={()=>setPendingE(null)}>Cancelar</button>
          <button style={{padding:'7px 16px',borderRadius:6,border:'none',background:'#1543F8',color:'#fff',fontSize:12,fontWeight:500,cursor:'pointer'}} onClick={()=>doSave(pendingE,motivo)}>Confirmar</button>
        </div>
      </div>
    </div>}
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
    const pedKey=j===1?'Pedido 1':(j<=9?`Pedido ${j}`:`Pedido${j} `)
    const prcKey=j===1?'Precio 1':`Precio ${j}`
    const ped=p[pedKey]||p[`Pedido ${j}`]||''
    const prc=parseMonto(p[prcKey]||p[`Precio ${j}`])
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

function Presupuestos({data:initialData}){
  const [localData,setLocalData]=useState(initialData)
  const [q,setQ]=useState(''), [f,setF]=useState('todos'), [pm,setPm]=useState('todos'), [open,setOpen]=useState(null), [toast,setToast]=useState(''), [anio,setAnio]=useState('todos'), [mes,setMes]=useState('todos')

  useEffect(()=>{setLocalData(initialData)},[initialData])

  const presus=(localData.presupuestos||[]).filter(p=>p['Columna 1'])

  const pms=[...new Set(presus.map(p=>p['PM Interno']).filter(Boolean))].sort()

  const anios=[...new Set(presus.map(p=>String(p['Fecha Presupuesto']||'').split('/')[2]).filter(a=>a&&a.length===4))].sort().reverse()
  const MESES=[['1','Enero'],['2','Febrero'],['3','Marzo'],['4','Abril'],['5','Mayo'],['6','Junio'],['7','Julio'],['8','Agosto'],['9','Septiembre'],['10','Octubre'],['11','Noviembre'],['12','Diciembre']]
  const filtered=presus.filter(p=>{
    const e=String(p['Estado']||'').toUpperCase()
    const mf=f==='todos'||(f==='ap'&&(e==='APROBADO'||e==='EN CURSO'||e==='ENTREGADO'))
      ||(f==='esp'&&e==='EN ESPERA')||(f==='des'&&e==='DESAPROBADO')
      ||(f==='rep'&&e==='REPRESUPUESTADO')||(f==='cur'&&e==='EN CURSO')
    const mpm=pm==='todos'||p['PM Interno']===pm
    const mq=!q||[p['Columna 1'],p['Proyecto'],p['Cliente'],p['Agencia'],p['PM Interno']].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase()))
    const fecha=String(p['Fecha Presupuesto']||'')
    const manio=anio==='todos'||fecha.includes(anio)
    const mmes=mes==='todos'||fecha.startsWith(mes+'/')||fecha.startsWith('0'+mes+'/')
    return mf&&mpm&&mq&&manio&&mmes
  }).reverse()

  const handleEstadoUpdate=(num,nuevoEstado)=>{
    setLocalData(prev=>({...prev,presupuestos:prev.presupuestos.map(p=>String(p['Columna 1'])===String(num)?{...p,Estado:nuevoEstado}:p)}))
    setToast('Estado actualizado ✓')
  }

  return <div>
    {toast&&<Toast msg={toast} onDone={()=>setToast('')}/>}
    <div style={{display:'flex',gap:10,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
      <input style={{...S.inp,flex:1,minWidth:180,marginBottom:0}} placeholder="Buscar N°, cliente, proyecto, PM..." value={q} onChange={e=>setQ(e.target.value)}/>
      <select style={{padding:'7px 10px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:anio==='todos'?'#555':'#F0F0F0',fontSize:12,outline:'none',cursor:'pointer'}} value={anio} onChange={e=>setAnio(e.target.value)}><option value="todos">Todos los años</option>{anios.map(a=><option key={a} value={a}>{a}</option>)}</select><select style={{padding:'7px 10px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:mes==='todos'?'#555':'#F0F0F0',fontSize:12,outline:'none',cursor:'pointer'}} value={mes} onChange={e=>setMes(e.target.value)}><option value="todos">Todos los meses</option>{MESES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><select style={{padding:'7px 10px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:pm==='todos'?'#555':'#F0F0F0',fontSize:12,outline:'none',cursor:'pointer'}} value={pm} onChange={e=>setPm(e.target.value)}>
        <option value="todos">Todos los PM</option>
        {pms.map(p=><option key={p} value={p}>{p}</option>)}
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
            return <>
              <tr key={i} style={{background:isOpen?'#1E1E1E':i%2===0?'#161616':'#1A1A1A',cursor:'pointer'}} onClick={()=>setOpen(isOpen?null:p['Columna 1'])}>
                <td style={{...S.td,color:'#1543F8',fontFamily:'monospace',fontSize:11}}>#{p['Columna 1']}</td>
                <td style={{...S.td,fontSize:11,color:'#666'}}>{p['Fecha Presupuesto']||'—'}</td>
                <td style={{...S.td,fontSize:12}}>{p['PM Interno']||'—'}</td>
                <td style={{...S.td,fontSize:12}}>{p['Agencia']||'—'}</td>
                <td style={{...S.td,fontSize:12,fontWeight:500}}>{p['Cliente']||'—'}</td>
                <td style={{...S.td,fontSize:12,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p['Proyecto']||'—'}</td>
                <td style={{...S.td,fontFamily:'monospace',fontSize:12}}>{fmt(parseMonto(p['Precio Final']))}</td>
                <td style={{...S.td}} onClick={e=>e.stopPropagation()}>
                  <BadgeEstado p={p} onUpdate={handleEstadoUpdate}/>
                </td>
              </tr>
              {isOpen&&<tr key={i+'d'}><td colSpan={8} style={{padding:0}}><DetallePresupuesto p={p}/></td></tr>}
            </>
          })}
        </tbody>
      </table>
      {filtered.length===0&&<div style={S.nd}>Sin resultados</div>}
    </div>
  </div>
}

// ---- PROYECTOS ----
function Proyectos({data}){
  const [open,setOpen]=useState(null)
  // Proyectos vienen de presupuestos aprobados/en curso
  const proj=(data.presupuestos||[]).filter(p=>isAprobado(p)||String(p['Estado']||'').toUpperCase()==='EN CURSO')

  return <div style={{overflowY:'auto',maxHeight:'calc(100vh - 140px)'}}>
    {proj.length===0&&<div style={S.nd}>Sin proyectos activos</div>}
    {proj.map((p,i)=>{
      const io=open===i
      const total=parseMonto(p['Precio Final'])
      // Calcular costo de servicios
      const servicios=[]
      for(let j=1;j<=8;j++){
        const ped=p[`Pedido ${j}`]||p[`Pedido${j} `]||''
        const prec=parseMonto(p[`Precio ${j}`])
        if(ped&&prec>0) servicios.push({nombre:ped,precio:prec})
      }
      const totalServicios=servicios.reduce((s,x)=>s+x.precio,0)
      const diferencia=total-totalServicios

      return <div key={i} style={{...S.card,marginBottom:8}}>
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',cursor:'pointer'}} onClick={()=>setOpen(io?null:i)}>
          <span style={{color:'#1543F8',fontFamily:'monospace',fontSize:11,flexShrink:0}}>#{p['Columna 1']}</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p['Proyecto']||p['Cliente']}</div>
            <div style={{fontSize:11,color:'#555',marginTop:2}}>{[p['Agencia'],p['Cliente']].filter(Boolean).join(' · ')} · PM: {p['PM Interno']||'—'}</div>
          </div>
          <span style={{fontFamily:'monospace',fontSize:13,fontWeight:500,color:'#1543F8',marginRight:12}}>{fmt(total)}</span>
          <span style={{...S.badge,background:'#1D9E7520',color:'#1D9E75',marginRight:8}}>{p['Estado']}</span>
          <span style={{fontSize:11,color:'#555'}}>{io?'▲':'▶'}</span>
        </div>
        {io&&<div style={{borderTop:'0.5px solid #2A2A2A',padding:'14px 16px'}}>
          {servicios.length===0
            ? <div style={{fontSize:12,color:'#555',fontStyle:'italic'}}>Sin servicios cargados</div>
            : <>
              {servicios.map((s,j)=><div key={j} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'0.5px solid #2A2A2A',fontSize:12}}>
                <span>{s.nombre}</span>
                <span style={{fontFamily:'monospace'}}>{fmt(s.precio)}</span>
              </div>)}
              <div style={{display:'flex',gap:20,marginTop:12,padding:'10px 12px',background:'#1E1E1E',borderRadius:8}}>
                {[['Precio total',fmt(total),null],['Servicios',fmt(totalServicios),null],['Diferencia',(diferencia>=0?'+':'')+fmt(diferencia),diferencia>=0?'#1D9E75':'#E24B4A']].map(([k,v,c])=>(
                  <div key={k}><div style={{fontSize:10,color:'#555',marginBottom:3}}>{k}</div><div style={{fontFamily:'monospace',fontWeight:500,color:c||'inherit'}}>{v}</div></div>
                ))}
              </div>
            </>}
        </div>}
      </div>
    })}
  </div>
}

// ---- FACTURACIÓN ----
function Facturacion({data}){
  const [f,setF]=useState('todas'), [open,setOpen]=useState(null)
  const fc=data.facturacion||[]

  const parseD=s=>{if(!s)return null;const p=String(s).split('/');return p.length===3?new Date(p[2],p[1]-1,p[0]):null}
  const diffD=x=>{const v=parseD(x['Vencimiento']);if(!v)return 0;return Math.floor((v-new Date())/864e5)}
  const est=x=>{if(isCobrada(x))return'c';const d=diffD(x);if(d<-30)return'r';if(d<0)return'v';return'p'}

  const fil=fc.filter(x=>{
    if(f==='todas')return true
    if(f==='pend')return!isCobrada(x)
    if(f==='cob')return isCobrada(x)
    return false
  })

  const bm={c:{bg:'#1D9E7520',c:'#1D9E75',l:'Cobrada'},p:{bg:'#1543F820',c:'#1543F8',l:'Pendiente'},v:{bg:'#E24B4A20',c:'#E24B4A',l:'Vencida'},r:{bg:'#E24B4A30',c:'#E24B4A',l:'¡Reclamar!'}}
  const pc=fc.filter(x=>!isCobrada(x)).reduce((s,x)=>s+parseMonto(x['Precio FINAL']),0)
  const cb=fc.filter(isCobrada).reduce((s,x)=>s+parseMonto(x['Precio FINAL']),0)
  const venc=fc.filter(x=>['r','v'].includes(est(x)))

  return <div>
    <div style={S.k4}>
      <K lbl="Por cobrar" val={fmtM(pc)} sub={fc.filter(x=>!isCobrada(x)).length+' facturas'} c="#BA7517"/>
      <K lbl="Cobrado" val={fmtM(cb)} sub={fc.filter(isCobrada).length+' facturas'} c="#1D9E75"/>
      <K lbl="Vencidas" val={venc.length} sub={venc.length>0?'Gestionar':''} c="#E24B4A"/>
      <K lbl="Total facturado" val={fmtM(pc+cb)}/>
    </div>

    {venc.map((x,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 14px',borderRadius:8,background:'#E24B4A10',border:'0.5px solid #E24B4A',color:'#E24B4A',fontSize:13,marginBottom:6}}>
      <span style={{flex:1}}><strong>{x['Nro de Factura']||'—'}</strong> — {x['Cliente']} · {fmt(parseMonto(x['Precio FINAL']))} · vencida {Math.abs(diffD(x))} días</span>
      <button style={{...S.badge,background:'#E24B4A',color:'#fff',cursor:'pointer',border:'none',padding:'4px 10px'}} onClick={()=>setOpen(x['Nro de Factura'])}>Ver</button>
    </div>)}

    <div style={{display:'flex',gap:4,marginBottom:12,flexWrap:'wrap'}}>
      {[['todas','Todas'],['pend','Pendientes'],['cob','Cobradas']].map(([id,l])=>(
        <button key={id} style={{...S.fb,...(f===id?S.fa:{})}} onClick={()=>setF(id)}>{l}</button>
      ))}
    </div>

    <div style={{overflowY:'auto',maxHeight:'calc(100vh - 340px)'}}>
      {fil.map((x,i)=>{
        const e=est(x), b=bm[e]||bm.p, io=open===x['Nro de Factura'], d=diffD(x)
        const bl=e==='v'?'Vencida '+Math.abs(d)+'d':e==='r'?'¡Reclamar! '+Math.abs(d)+'d':b.l
        const neto=parseMonto(x['Precio SIN IVA'])
        const iva=parseMonto(x['IVA'])
        const total=parseMonto(x['Precio FINAL'])
        const ret=parseMonto(x['Retenciones'])
        return <div key={i} style={{...S.card,borderLeft:'3px solid '+(e==='c'?'#1D9E75':['r','v'].includes(e)?'#E24B4A':'#2A2A2A'),marginBottom:8}}>
          <div style={{display:'grid',gridTemplateColumns:'auto 1fr auto auto auto',gap:10,alignItems:'center',padding:'10px 14px',cursor:'pointer'}} onClick={()=>setOpen(io?null:x['Nro de Factura'])}>
            <span style={{fontFamily:'monospace',fontSize:10,color:'#1543F8',whiteSpace:'nowrap'}}>{x['Nro de Factura']||'—'}</span>
            <div style={{minWidth:0}}>
              <div style={{fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{x['Proyecto']||x['Cliente']}</div>
              <div style={{fontSize:11,color:'#555'}}>{x['Agencia']} · {x['Cliente']} · vence {x['Vencimiento']}</div>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontFamily:'monospace',fontSize:13,fontWeight:500,color:'#1543F8'}}>{fmt(neto)}</div>
              <div style={{fontSize:10,color:'#555'}}>+IVA {fmt(iva)}</div>
            </div>
            <span style={{...S.badge,background:b.bg,color:b.c}}>{bl}</span>
            <span style={{fontSize:11,color:'#555'}}>{io?'▲':'▶'}</span>
          </div>
          {io&&<div style={{borderTop:'0.5px solid #2A2A2A',padding:'14px 16px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
            <div>
              <div style={{fontSize:11,color:'#555',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>Datos</div>
              {[['Tipo factura',x['Tipo de Factura']||'—'],['N° factura',x['Nro de Factura']||'—'],['Fecha emisión',x['Fecha emision']||'—'],['Plazo',x['Plazo']||'—'],['Vencimiento',x['Vencimiento']||'—'],['CUIT',x['CUIT']||'—']].map(([k,v])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'0.5px solid #1E1E1E',fontSize:12}}><span style={{color:'#555'}}>{k}</span><span style={{fontFamily:'monospace'}}>{v}</span></div>
              ))}
            </div>
            <div>
              <div style={{fontSize:11,color:'#555',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>Liquidación</div>
              {[['Neto s/IVA',fmt(neto),null],['IVA',fmt(iva),null],['Total factura',fmt(total),'#1543F8'],['Retenciones',ret>0?'-'+fmt(ret):'—','#E24B4A'],['Disponible Magma',fmt(total-ret),'#1D9E75']].map(([k,v,c])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'0.5px solid #1E1E1E',fontSize:12}}><span style={{color:'#555'}}>{k}</span><span style={{fontFamily:'monospace',color:c||'inherit'}}>{v}</span></div>
              ))}
            </div>
          </div>}
        </div>
      })}
      {fil.length===0&&<div style={S.nd}>Sin facturas</div>}
    </div>
  </div>
}

// ---- PAGOS STAFF ----
function PagosStaff({data}){
  const [open,setOpen]=useState(null), [pag,setPag]=useState({})
  // Staff viene de proyectos — mostrar por presupuesto
  const proj=(data.presupuestos||[]).filter(p=>isAprobado(p)||String(p['Estado']||'').toUpperCase()==='EN CURSO')

  // Extraer servicios de cada proyecto como si fueran staff
  const trabajos = []
  proj.forEach(p=>{
    for(let j=1;j<=8;j++){
      const ped=p[`Pedido ${j}`]||p[`Pedido${j} `]||''
      const prec=parseMonto(p[`Precio ${j}`])
      if(ped&&prec>0) trabajos.push({proyecto:p['Proyecto']||p['Cliente'],num:p['Columna 1'],servicio:ped,monto:prec,pm:p['PM Interno']||'—'})
    }
  })

  const byPM={}
  trabajos.forEach(t=>{
    if(!byPM[t.pm]) byPM[t.pm]={pm:t.pm,items:[],total:0}
    byPM[t.pm].items.push(t)
    byPM[t.pm].total+=t.monto
  })
  const pms=Object.values(byPM).sort((a,b)=>b.total-a.total)

  const cols=['#1543F8','#CE2637','#9635AB','#1D9E75','#BA7517']
  const col=n=>cols[n.charCodeAt(0)%cols.length]
  const init=n=>n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()

  return <div>
    <div style={S.k4}>
      <K lbl="Servicios activos" val={trabajos.length} sub={proj.length+' proyectos'} c="#1543F8"/>
      <K lbl="Total servicios" val={fmtM(trabajos.reduce((s,t)=>s+t.monto,0))} c="#BA7517"/>
      <K lbl="PMs con trabajo" val={pms.length}/>
      <K lbl="Marcados pagados" val={Object.values(pag).filter(Boolean).length} c="#1D9E75"/>
    </div>
    {pms.length===0&&<div style={S.nd}>Sin proyectos activos con servicios</div>}
    {pms.map((p,i)=>{
      const io=open===p.pm, ip=pag[p.pm], c=col(p.pm)
      return <div key={i} style={{...S.card,marginBottom:8,opacity:ip?0.7:1}}>
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',cursor:'pointer'}} onClick={()=>setOpen(io?null:p.pm)}>
          <div style={{width:36,height:36,borderRadius:'50%',background:c+'20',color:c,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:500,flexShrink:0}}>{init(p.pm)}</div>
          <div style={{flex:1}}><div style={{fontSize:14,fontWeight:500}}>PM: {p.pm}</div><div style={{fontSize:11,color:'#555',marginTop:2}}>{p.items.length} servicio{p.items.length!==1?'s':''}</div></div>
          <span style={{fontFamily:'monospace',fontSize:16,fontWeight:500,color:ip?'#1D9E75':c}}>{fmt(p.total)}</span>
          <span style={{...S.badge,background:ip?'#1D9E7520':'#BA751720',color:ip?'#1D9E75':'#BA7517',marginLeft:8}}>{ip?'Pagado':'Pendiente'}</span>
          <span style={{fontSize:11,color:'#555'}}>{io?'▲':'▶'}</span>
        </div>
        {io&&<div style={{borderTop:'0.5px solid #2A2A2A'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 2fr 100px',background:'#1A1A1A'}}>{['Proyecto','Servicio','Monto'].map(h=><div key={h} style={{fontSize:10,color:'#555',padding:'7px 14px',textTransform:'uppercase',letterSpacing:'0.06em'}}>{h}</div>)}</div>
          {p.items.map((t,j)=><div key={j} style={{display:'grid',gridTemplateColumns:'1fr 2fr 100px',borderBottom:'0.5px solid #2A2A2A',fontSize:12}}>
            <div style={{padding:'9px 14px'}}><div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.proyecto}</div><div style={{color:'#1543F8',fontFamily:'monospace',fontSize:10}}>#{t.num}</div></div>
            <div style={{padding:'9px 14px',color:'#666'}}>{t.servicio}</div>
            <div style={{padding:'9px 14px',fontFamily:'monospace',fontWeight:500}}>{fmt(t.monto)}</div>
          </div>)}
          <div style={{padding:'12px 16px',background:'#1A1A1A',display:'flex',justifyContent:'flex-end'}}>
            {ip?<button style={{...S.fb}} onClick={()=>setPag(prev=>({...prev,[p.pm]:false}))}>Desmarcar</button>
              :<button style={{padding:'7px 16px',borderRadius:6,border:'none',background:'#1543F8',color:'#fff',fontSize:12,fontWeight:500,cursor:'pointer'}} onClick={()=>setPag(prev=>({...prev,[p.pm]:true}))}>Marcar pagado ✓</button>}
          </div>
        </div>}
      </div>
    })}
  </div>
}

// ---- BALANCE ----
function Balance({data}){
  const [mes,setMes]=useState('ABR'), [tc,setTc]=useState(1405)
  const MESES=['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']
  const SU=[{n:'Juan Martin',b:3000000},{n:'Sofia',b:3000000},{n:'Lulu',b:1300000},{n:'Dani',b:1900000},{n:'Tomi',b:1300000},{n:'Contador',b:453750}]
  const GF=[{n:'Alquiler oficina',m:1000000},{n:'Expensas',m:54674},{n:'ABL',m:11793},{n:'Edenor',m:7004},{n:'Metrogas',m:0},{n:'CM',m:1023000}]
  const [se,setSe]=useState({}), [pg,setPg]=useState({}), [ge,setGe]=useState({}), [pgf,setPgf]=useState({}), [vs,setVs]=useState({}), [pgv,setPgv]=useState({}), [nv,setNv]=useState({n:'',m:''})
  const gS=n=>se[mes+n]!==undefined?se[mes+n]:SU.find(s=>s.n===n)?.b||0
  const gG=n=>ge[n]!==undefined?ge[n]:GF.find(g=>g.n===n)?.m||0
  const gV=()=>vs[mes]||[]
  const ts=SU.reduce((s,g)=>s+gS(g.n),0), tf=GF.reduce((s,g)=>s+gG(g.n),0), tv=gV().reduce((s,g)=>s+(parseFloat(g.m)||0),0)

  // Ingresos reales del Sheets — facturado en el mes
  const fc=data.facturacion||[]
  const mesNum={'ENE':'01','FEB':'02','MAR':'03','ABR':'04','MAY':'05','JUN':'06','JUL':'07','AGO':'08','SEP':'09','OCT':'10','NOV':'11','DIC':'12'}[mes]||'04'
  const fcMes=fc.filter(f=>{const m=String(f['Mes']||'');return m.includes(mesNum)||m.toUpperCase().includes(mes)})
  const ingMes=fcMes.reduce((s,f)=>s+parseMonto(f['Precio SIN IVA']),0)
  const resultado=ingMes-(ts+tf+tv)

  return <div>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:10}}>
      <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{MESES.map(m=><button key={m} style={{...S.fb,...(mes===m?S.fa:{})}} onClick={()=>setMes(m)}>{m}</button>)}</div>
      <div style={{display:'flex',alignItems:'center',gap:6,background:'#1E1E1E',border:'0.5px solid #333',borderRadius:8,padding:'5px 10px'}}>
        <span style={{fontSize:11,color:'#555'}}>USD blue $</span>
        <input type="number" value={tc} onChange={e=>setTc(parseFloat(e.target.value)||1405)} style={{width:70,border:'none',background:'transparent',color:'#BA7517',fontFamily:'monospace',fontSize:13,fontWeight:500,outline:'none',textAlign:'right'}}/>
      </div>
    </div>
    <div style={S.k4}>
      <K lbl="Ingresos netos" val={fmtM(ingMes)} sub={fcMes.length+' facturas del mes'} c="#1D9E75"/>
      <K lbl="Sueldos" val={'-'+fmtM(ts)} sub={SU.filter(g=>!pg[mes+g.n]).length+' pendientes'} c="#E24B4A"/>
      <K lbl="Gastos fijos" val={'-'+fmtM(tf)} c="#E24B4A"/>
      <K lbl="Resultado" val={fmtM(resultado)} c={resultado>=0?'#1D9E75':'#E24B4A'}/>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:12}}>
      <div>
        <div style={S.card}>
          <div style={S.ch}>Sueldos equipo</div>
          {SU.map((g,i)=>{const p=pg[mes+g.n]; return <div key={i} style={{...S.lr,opacity:p?0.5:1}}>
            <input type="checkbox" checked={!!p} onChange={e=>setPg(prev=>({...prev,[mes+g.n]:e.target.checked}))} style={{accentColor:'#1543F8',flexShrink:0}}/>
            <span style={{flex:1,marginLeft:10,fontSize:13}}>{g.n}</span>
            <span style={{...S.badge,background:p?'#1D9E7520':'#BA751720',color:p?'#1D9E75':'#BA7517',marginRight:8,fontSize:10}}>{p?'Pagado':'Pend.'}</span>
            <input type="number" value={gS(g.n)} onChange={e=>setSe(prev=>({...prev,[mes+g.n]:parseFloat(e.target.value)||0}))} style={{width:100,padding:'4px 6px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontFamily:'monospace',fontSize:12,outline:'none',textAlign:'right'}}/>
          </div>})}
        </div>
        <div style={{...S.card,marginTop:12}}>
          <div style={S.ch}>Gastos variables</div>
          {gV().map((g,i)=>{const p=pgv[mes+i]; return <div key={i} style={{...S.lr,opacity:p?0.5:1}}>
            <input type="checkbox" checked={!!p} onChange={e=>setPgv(prev=>({...prev,[mes+i]:e.target.checked}))} style={{accentColor:'#1543F8',flexShrink:0}}/>
            <span style={{flex:1,marginLeft:10,fontSize:13}}>{g.n}</span>
            <span style={{fontFamily:'monospace',fontSize:12,marginLeft:'auto'}}>{fmt(g.m)}</span>
          </div>})}
          <div style={{display:'flex',gap:8,padding:'10px 14px',borderTop:'0.5px dashed #2A2A2A'}}>
            <input placeholder="Descripcion..." value={nv.n} onChange={e=>setNv(p=>({...p,n:e.target.value}))} style={{flex:1,padding:'6px 8px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontSize:12,outline:'none'}}/>
            <input type="number" placeholder="$" value={nv.m} onChange={e=>setNv(p=>({...p,m:e.target.value}))} style={{width:90,padding:'6px 8px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontSize:12,outline:'none'}}/>
            <button style={{padding:'6px 12px',borderRadius:6,border:'none',background:'#1543F8',color:'#fff',fontSize:12,cursor:'pointer'}} onClick={()=>{if(!nv.n)return;setVs(prev=>({...prev,[mes]:[...(prev[mes]||[]),{n:nv.n,m:parseFloat(nv.m)||0}]}));setNv({n:'',m:''})}}>OK</button>
          </div>
        </div>
      </div>
      <div>
        <div style={S.card}>
          <div style={S.ch}>Gastos fijos</div>
          {GF.map((g,i)=>{const p=pgf[mes+g.n]; return <div key={i} style={{...S.lr,opacity:p?0.5:1}}>
            <input type="checkbox" checked={!!p} onChange={e=>setPgf(prev=>({...prev,[mes+g.n]:e.target.checked}))} style={{accentColor:'#1543F8',flexShrink:0}}/>
            <span style={{flex:1,marginLeft:10,fontSize:13}}>{g.n}</span>
            <span style={{...S.badge,background:p?'#1D9E7520':'#BA751720',color:p?'#1D9E75':'#BA7517',marginRight:8,fontSize:10}}>{p?'Pagado':'Pend.'}</span>
            <input type="number" value={gG(g.n)} onChange={e=>setGe(prev=>({...prev,[g.n]:parseFloat(e.target.value)||0}))} style={{width:100,padding:'4px 6px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontFamily:'monospace',fontSize:12,outline:'none',textAlign:'right'}}/>
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
function NuevoPresupuesto({onClose, onGuardado, data}){
  const presus=data?.presupuestos||[]
  const nextNum=presus.length>0?Math.max(...presus.map(p=>parseInt(p['Columna 1'])||0))+1:1000
  const [peds,setPeds]=useState([{id:1,svc:'',precio:'',feeAg:true,manual:false},{id:2,svc:'',precio:'',feeAg:true,manual:false}])
  const [form,setForm]=useState({fp:new Date().toISOString().slice(0,10),fechaMode:'dia',fe1:'',feIni:'',feFin:'',agencia:'',cliente:'',proyecto:'',contacto:'',pm:'',repr:'',plazo:'0',interes:'0',gan:false,iibb:false,tajuste:'1',ajuste:'0'})
  const [saving,setSaving]=useState(false), [ok,setOk]=useState(false)
  const [hintAg,setHintAg]=useState(false), [hintCl,setHintCl]=useState(false), [hintCt,setHintCt]=useState(false)
  const [diasMulti,setDiasMulti]=useState([''])

  const version=form.repr?'V2':''
  const tieneAg=form.agencia.trim()!==''

  const calcTotales=()=>{
    const subtotal=peds.reduce((s,p)=>s+(parseFloat(p.precio)||0),0)
    const feeBase=peds.reduce((s,p)=>p.feeAg?(s+(parseFloat(p.precio)||0)):s,0)
    const fee=tieneAg?feeBase:0
    const base=subtotal+fee
    const gan=form.gan?fee*0.35:0
    const iibb=form.iibb?fee*0.094:0
    const intPct=parseFloat(form.interes)||0
    const intMto=(base+gan+iibb)*(intPct/100)
    const ajMto=(parseFloat(form.ajuste)||0)*parseInt(form.tajuste)
    const total=base+gan+iibb+intMto+ajMto
    return {subtotal,fee,base,gan,iibb,intMto,ajMto,total}
  }
  const T=calcTotales()

  const setSvc=(id,val)=>{
    const s=SVCS_LIST.find(x=>x.n===val)
    setPeds(prev=>prev.map(p=>p.id===id?{...p,svc:val,precio:s?.p||'',feeAg:s?.fee??true,manual:false}:p))
  }
  const setPrecio=(id,val)=>setPeds(prev=>prev.map(p=>p.id===id?{...p,precio:val,manual:true}:p))
  const setFeeAg=(id,val)=>setPeds(prev=>prev.map(p=>p.id===id?{...p,feeAg:val}:p))
  const addPed=()=>setPeds(prev=>[...prev,{id:Date.now(),svc:'',precio:'',feeAg:true,manual:false}])
  const delPed=(id)=>setPeds(prev=>prev.filter(p=>p.id!==id))
  const setF=(k,v)=>setForm(prev=>({...prev,[k]:v}))

  async function guardar(){
    if(!form.cliente.trim()||!peds.some(p=>p.svc)){return}
    setSaving(true)
    const row={
      'Columna 1':nextNum,'Estado':'EN ESPERA','PM Interno':form.pm,
      'Agencia':form.agencia,'Cliente':form.cliente,'Proyecto':form.proyecto,
      'Contacto':form.contacto,'Fecha Presupuesto':form.fp,
      'Precio Final':T.total,
    }
    peds.filter(p=>p.svc).forEach((p,i)=>{
      const k=i===0?'':'  '+(i+1)
      row[`Pedido ${i+1}`]=p.svc
      row[`Precio ${i+1}`]=p.precio
    })
    try{
      await fetch('/api/presupuesto-nuevo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(row)})
    }catch(e){}
    setOk(true)
    setTimeout(()=>onGuardado(row),1200)
    setSaving(false)
  }

  const inp={background:'#1E1E1E',border:'0.5px solid #333',borderRadius:6,color:'#F0F0F0',fontSize:12,padding:'7px 10px',outline:'none',width:'100%',fontFamily:'inherit'}
  const sel={...inp}
  const lbl={fontSize:11,color:'#555',display:'block',marginBottom:4}

  return <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:200,display:'flex',alignItems:'flex-start',justifyContent:'flex-end'}} onClick={onClose}>
    <div style={{width:860,height:'100vh',background:'#0D0D0D',borderLeft:'0.5px solid #2A2A2A',display:'flex',flexDirection:'column',overflow:'hidden'}} onClick={e=>e.stopPropagation()}>
      <div style={{padding:'16px 20px',borderBottom:'0.5px solid #2A2A2A',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
        <span style={{background:'#1543F820',color:'#1543F8',border:'0.5px solid #1543F840',borderRadius:4,padding:'2px 8px',fontSize:11,fontFamily:'monospace'}}>#{nextNum}</span>
        {version&&<span style={{background:'#9635AB20',color:'#9635AB',border:'0.5px solid #9635AB40',borderRadius:4,padding:'2px 8px',fontSize:11}}>{version}</span>}
        <span style={{background:'#BA751720',color:'#BA7517',borderRadius:3,padding:'2px 8px',fontSize:10}}>En espera</span>
        <div style={{flex:1}}/>
        <button style={{fontSize:18,background:'transparent',border:'none',color:'#555',cursor:'pointer',padding:'0 4px'}} onClick={onClose}>×</button>
      </div>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        <div style={{flex:1,padding:20,overflowY:'auto',borderRight:'0.5px solid #2A2A2A'}}>

          <div style={{fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8}}>Datos del proyecto</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
            <label style={{display:'flex',flexDirection:'column',gap:4}}><span style={lbl}>Fecha presupuesto</span><input style={inp} type="date" value={form.fp} onChange={e=>setF('fp',e.target.value)}/></label>
            <label style={{display:'flex',flexDirection:'column',gap:4}}><span style={lbl}>PM interno</span>
              <select style={sel} value={form.pm} onChange={e=>setF('pm',e.target.value)}>
                <option value="">— PM —</option><option>Juan</option><option>Sofi</option><option>Lulu</option>
              </select>
            </label>
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:4,marginBottom:8}}>
            <span style={lbl}>Fecha(s) de evento</span>
            <div style={{display:'flex',gap:4,marginBottom:6}}>
              {['dia','rango','multi'].map((m,i)=>(
                <button key={m} style={{padding:'5px 12px',borderRadius:6,border:'0.5px solid #333',background:form.fechaMode===m?'#1E1E1E':'transparent',color:form.fechaMode===m?'#F0F0F0':'#555',fontSize:11,cursor:'pointer'}} onClick={()=>setF('fechaMode',m)}>
                  {['1 día','Rango','Múltiples'][i]}
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
                  {diasMulti.length>1&&<button style={{width:28,height:28,borderRadius:6,border:'0.5px solid #2A2A2A',background:'transparent',color:'#555',cursor:'pointer',fontSize:15}} onClick={()=>setDiasMulti(prev=>prev.filter((_,j)=>j!==i))}>×</button>}
                </div>
              ))}
              <button style={{width:'100%',padding:6,borderRadius:6,border:'0.5px dashed #2A2A2A',background:'transparent',color:'#555',fontSize:11,cursor:'pointer'}} onClick={()=>setDiasMulti(prev=>[...prev,''])}>+ Agregar día</button>
            </div>}
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              <span style={lbl}>Agencia</span>
              <input style={inp} list="np-ag" value={form.agencia} onChange={e=>{setF('agencia',e.target.value);setHintAg(!!e.target.value&&!AGENCIAS_LIST.some(a=>a.toLowerCase()===e.target.value.toLowerCase()))}} placeholder="Sin agencia / Directo"/>
              <datalist id="np-ag">{AGENCIAS_LIST.map(a=><option key={a} value={a}/>)}</datalist>
              {hintAg&&<span style={{fontSize:10,color:'#1D9E75'}}>Agencia nueva — se agregará al listado</span>}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              <span style={lbl}>Cliente / Marca</span>
              <input style={inp} list="np-cl" value={form.cliente} onChange={e=>{setF('cliente',e.target.value);setHintCl(!!e.target.value&&!CLIENTES_LIST.some(a=>a.toLowerCase()===e.target.value.toLowerCase()))}} placeholder="Nombre del cliente"/>
              <datalist id="np-cl">{CLIENTES_LIST.map(a=><option key={a} value={a}/>)}</datalist>
              {hintCl&&<span style={{fontSize:10,color:'#1D9E75'}}>Cliente nuevo — se agregará al listado</span>}
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
            <label style={{display:'flex',flexDirection:'column',gap:4}}><span style={lbl}>Proyecto / descripción</span><input style={inp} value={form.proyecto} onChange={e=>setF('proyecto',e.target.value)} placeholder="Ej: Evento anual, Film..."/></label>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              <span style={lbl}>Contacto</span>
              <input style={inp} list="np-ct" value={form.contacto} onChange={e=>{setF('contacto',e.target.value);setHintCt(!!e.target.value&&!CONTACTOS_LIST.some(a=>a.n.toLowerCase()===e.target.value.toLowerCase()))}} placeholder="Nombre del contacto"/>
              <datalist id="np-ct">{CONTACTOS_LIST.map(c=><option key={c.n} value={c.n}/>)}</datalist>
              {hintCt&&<span style={{fontSize:10,color:'#1D9E75'}}>Contacto nuevo — se agregará al listado</span>}
            </div>
          </div>
          <label style={{display:'flex',flexDirection:'column',gap:4,marginBottom:12}}><span style={lbl}>Represupuesto del N°</span><input style={inp} value={form.repr} onChange={e=>setF('repr',e.target.value)} placeholder="Dejar vacío si es presupuesto nuevo"/></label>

          <div style={{fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8}}>Servicios</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 110px 36px 32px',gap:5,marginBottom:4}}>
            {['Servicio','Precio','Fee ag.',''].map((h,i)=><span key={i} style={{fontSize:10,color:'#555',textAlign:i===2?'center':'left'}}>{h}</span>)}
          </div>
          {peds.map(p=>(
            <div key={p.id} style={{display:'grid',gridTemplateColumns:'1fr 110px 36px 32px',gap:5,alignItems:'center',marginBottom:5}}>
              <select style={sel} value={p.svc} onChange={e=>setSvc(p.id,e.target.value)}>
                <option value="">— Servicio —</option>
                {SVCS_LIST.map(s=><option key={s.n} value={s.n}>{s.n}</option>)}
              </select>
              <input style={{...inp,color:p.manual?'#BA7517':'#1543F8',borderColor:p.manual?'#BA751540':'#333'}} type="number" value={p.precio} placeholder="0" onChange={e=>setPrecio(p.id,e.target.value)}/>
              <input type="checkbox" checked={p.feeAg} onChange={e=>setFeeAg(p.id,e.target.checked)} style={{width:15,height:15,accentColor:'#1543F8',cursor:'pointer',margin:'0 auto',display:'block'}}/>
              <button style={{width:28,height:28,borderRadius:6,border:'0.5px solid #2A2A2A',background:'transparent',color:'#555',cursor:'pointer',fontSize:15}} onClick={()=>delPed(p.id)}>×</button>
            </div>
          ))}
          <button style={{width:'100%',padding:6,borderRadius:6,border:'0.5px dashed #2A2A2A',background:'transparent',color:'#555',fontSize:11,cursor:'pointer',marginTop:4}} onClick={addPed}>+ Agregar servicio</button>

          {tieneAg&&<div style={{fontSize:10,color:'#555',marginTop:8,padding:'6px 10px',background:'#1A1A1A',borderRadius:6,borderLeft:'2px solid #2A2A2A'}}>
            Los servicios con fee marcado se cobran ×2. Ganancias e IIBB van sobre el total del fee.
          </div>}

          <div style={{fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'.08em',margin:'16px 0 8px'}}>Condiciones</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
            <label style={{display:'flex',flexDirection:'column',gap:4}}><span style={lbl}>Plazo de pago</span>
              <select style={sel} value={form.plazo} onChange={e=>setF('plazo',e.target.value)}>
                <option value="0">Contado</option><option value="15">15 días</option><option value="30">30 días</option><option value="60">60 días</option>
              </select>
            </label>
            <label style={{display:'flex',flexDirection:'column',gap:4}}><span style={lbl}>Interés %</span><input style={inp} type="number" value={form.interes} min="0" step="0.5" onChange={e=>setF('interes',e.target.value)}/></label>
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
              <select style={sel} value={form.tajuste} onChange={e=>setF('tajuste',e.target.value)}><option value="1">Recargo (+)</option><option value="-1">Descuento (−)</option></select>
            </label>
            <label style={{display:'flex',flexDirection:'column',gap:4}}><span style={lbl}>Monto $</span><input style={inp} type="number" value={form.ajuste} onChange={e=>setF('ajuste',e.target.value)}/></label>
          </div>
        </div>

        <div style={{width:260,padding:20,background:'#111',display:'flex',flexDirection:'column',gap:0,flexShrink:0}}>
          <div style={{fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:12}}>Resumen</div>
          {[
            ['Subtotal servicios',fmt(T.subtotal),'#F0F0F0',true],
            tieneAg&&T.fee>0?['Fee agencia (×1)',fmt(T.fee),'#9635AB',true]:null,
            tieneAg&&T.fee>0?['Base imponible',fmt(T.base),'#555',true]:null,
            T.gan>0?['Ganancias 35%',fmt(T.gan),'#E24B4A',true]:null,
            T.iibb>0?['IIBB 9.4%',fmt(T.iibb),'#E24B4A',true]:null,
            T.intMto>0?['Interés '+form.interes+'%',fmt(T.intMto),'#BA7517',true]:null,
            Math.abs(T.ajMto)>0?[(parseInt(form.tajuste)>0?'Recargo':'Descuento'),(parseInt(form.tajuste)>0?'+':'-')+fmt(Math.abs(T.ajMto)),parseInt(form.tajuste)>0?'#1D9E75':'#E24B4A',true]:null,
          ].filter(Boolean).map(([label,val,color])=>(
            <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',fontSize:12,borderBottom:'0.5px solid #1A1A1A'}}>
              <span style={{color:'#555',fontSize:11}}>{label}</span>
              <span style={{fontFamily:'monospace',color}}>{val}</span>
            </div>
          ))}
          <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0 0',fontSize:15,fontWeight:500,borderTop:'0.5px solid #333',marginTop:6}}>
            <span>Precio final</span>
            <span style={{color:'#1543F8',fontFamily:'monospace'}}>{fmt(T.total)}</span>
          </div>

          <div style={{background:'#1A1A1A',borderRadius:8,padding:10,marginTop:14}}>
            <div style={{fontSize:10,color:'#555',marginBottom:6,textTransform:'uppercase',letterSpacing:'.06em'}}>Servicios</div>
            {peds.filter(p=>p.svc).length===0
              ?<span style={{fontSize:11,color:'#555',fontStyle:'italic'}}>Ninguno aún</span>
              :peds.filter(p=>p.svc).map((p,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',borderBottom:'0.5px solid #1E1E1E',fontSize:11}}>
                  <span style={{color:p.feeAg&&tieneAg?'#F0F0F0':'#555'}}>{p.svc}</span>
                  <span style={{fontFamily:'monospace',color:p.feeAg&&tieneAg?'#1543F8':'#555'}}>{fmt(parseFloat(p.precio)||0)}</span>
                </div>
              ))
            }
          </div>

          {form.repr&&<div style={{marginTop:10,fontSize:11,color:'#9635AB'}}>Represupuesto de #{form.repr} → V2</div>}

          <div style={{flex:1}}/>
          {ok
            ?<div style={{marginTop:14,background:'#1D9E7520',border:'0.5px solid #1D9E75',borderRadius:6,padding:10,fontSize:12,color:'#1D9E75',textAlign:'center'}}>Presupuesto #{nextNum} cargado ✓</div>
            :<button style={{marginTop:14,width:'100%',padding:10,borderRadius:8,border:'none',background:saving?'#0f35d0':'#1543F8',color:'#fff',fontSize:13,fontWeight:500,cursor:'pointer',opacity:saving?0.7:1}} onClick={guardar} disabled={saving}>
              {saving?'Guardando...':'Cargar presupuesto'}
            </button>
          }
        </div>
      </div>
    </div>
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

