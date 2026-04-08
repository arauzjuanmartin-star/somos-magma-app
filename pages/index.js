import { useState, useEffect } from 'react'\
import Head from 'next/head'\
\
const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']\
\
// Parsear montos del Sheets que vienen como \\"$2,400,000.00\\"\
const parseMonto = v => {\
  if (!v) return 0\
  const n = parseFloat(String(v).replace(/[$,\\\\\\\\s]/g, ''))\
  return isNaN(n) ? 0 : n\
}\
const fmt = n => '$' + Math.round(Math.abs(n||0)).toLocaleString('es-AR')\
const fmtM = n => { const a=Math.abs(n||0); return (n<0?'-':'')+(a>=1000000?'$'+(a/1000000).toFixed(1)+'M':'$'+Math.round(a/1000)+'K') }\
\
// Columnas reales del Sheets\
const isAprobado = p => {\
  const e = String(p['Estado']||'').toUpperCase()\
  return e === 'APROBADO' || e === 'EN CURSO' || e === 'ENTREGADO'\
}\
const isCobrada = f => {\
  const v = f['Cobrado']\
  return v === true || v === 'TRUE' || String(v).toUpperCase() === 'TRUE'\
}\
\
// ---- DATOS LISTADO ----\
const SVCS_LIST=[\
  {n:'\ud83d\udcf8 Foto \u00bd',p:220000,fee:true},{n:'\ud83d\udcf7 Foto 1',p:290000,fee:true},\
  {n:'\ud83c\udfa5 Video \u00bd',p:220000,fee:true},{n:'\ud83d\udcf9 Video 1',p:290000,fee:true},\
  {n:'\ud83c\udfac Film \u00bd',p:220000,fee:true},{n:'\ud83c\udf9e\ufe0f Film 1',p:290000,fee:true},\
  {n:'\ud83d\udd5b Film 12hs',p:350000,fee:true},{n:'\u2702\ufe0f Edit 60s',p:116000,fee:true},\
  {n:'\ud83e\ude84 Edit 60s+',p:174000,fee:true},{n:'\ud83e\udd1d Asist \u00bd',p:140000,fee:true},\
  {n:'\ud83d\ude4c Asist 1',p:210000,fee:true},{n:'\ud83d\udcbb Vivo 1',p:350000,fee:true},\
  {n:'\ud83d\udda5\ufe0f Vivo \u00bd',p:230000,fee:true},{n:'\ud83c\udf9b\ufe0f DirFoto',p:350000,fee:true},\
  {n:'\ud83c\udf99\ufe0f Sonido',p:290000,fee:true},{n:'\ud83d\ude81 Drone',p:290000,fee:true},\
  {n:'\ud83c\udfce\ufe0f FPV',p:405000,fee:true},{n:'\u2728 Motion',p:230000,fee:true},\
  {n:'\ud83d\uddc2\ufe0f Crudos',p:175000,fee:true},{n:'\ud83d\udcf2 Edit 15-30s',p:116000,fee:true},\
  {n:'\ud83d\uddbc\ufe0f Fotos',p:60000,fee:true},{n:'\ud83d\uddb2\ufe0f Go Pro',p:230000,fee:true},\
  {n:'\ud83c\udf0e Viaticos',p:0,fee:false},{n:'\ud83d\udc77\ud83c\udffd Produ',p:0,fee:false},\
  {n:'\ud83d\udc85\ud83c\udffd MakeUp',p:0,fee:false},{n:'\ud83d\ude9a Rental',p:0,fee:false},\
  {n:'\ud83d\udc6f\u200d\u2642\ufe0f Model',p:0,fee:false},{n:'\ud83c\udf7d\ufe0f Catering',p:0,fee:false},\
  {n:'Otros',p:0,fee:false},\
]\
const AGENCIAS_LIST=['Ostara','Minita','Pop Up','Stadium','ADN','Quilmes','Creators Lab','Mole Media','WeCorp','Louder','Smarketing','Bacardi','Integra','Btlandia','OIR','SPA','ABV','Piet','Nodus','Bermuda','United Scale Arts','Meikin','CMQ','Bar de eventos','The Bloom','Velvet','Mucha','Freelance','Zona Prop','azcuy','Blue Mail','Mercurias','KLM']\
const CLIENTES_LIST=['Santander','Unilever','Austral','Air France','Iveco','Latam','Campari',\\"L'Oreal\\",'Maybelline','Betsson','Disney','Quilmes','Chandon','Honda','Peugeot','Endeavor','Baron B','Google','Microsoft','Coca Cola','Adidas','Mercado Libre','YPF','Volkswagen','Personal','Telecom','Brahma','Off','Integra','Rutini','Visa','Natura']\
const CONTACTOS_LIST=[\
  {n:'Agostina Caruso',ag:''},{n:'Alejandra Moreno',ag:'Nodus'},{n:'Balado, Natalia',ag:'KLM'},\
  {n:'Belen Infante',ag:'Stadium'},{n:'Belen ST',ag:'Ostara'},{n:'Bruno Dibattista',ag:'Stadium'},\
  {n:'Camila Cabo',ag:'SPA'},{n:'Camila Carrion',ag:'OIR'},{n:'Caro Persico',ag:'Piet'},\
  {n:'Carolina Forestano',ag:'Pop Up'},{n:'Cristian Di Menna',ag:'azcuy'},{n:'Delfina Felice',ag:'Pop Up'},\
  {n:'Emi Perez',ag:'Minita'},{n:'Eugenia Pelaya',ag:'Meikin'},{n:'Facundo Leiton',ag:'Nodus'},\
  {n:'Fernanda Adriano',ag:'Minita'},{n:'Florencia Julian',ag:'Pop Up'},{n:'Freire, Melisa Daiana',ag:'Quilmes'},\
  {n:'Gabriela Capitani',ag:'Stadium'},{n:'Georgia Etchegaray',ag:'Blue Mail'},{n:'Gina',ag:'United Scale Arts'},\
  {n:'Julieta Actis',ag:'Minita'},{n:'Lali Di Stefano',ag:'ADN'},{n:'Lorena Vilanova',ag:'Austral'},\
  {n:'Luc\u00eda Mi\u00f1o',ag:'Ostara'},{n:'Mariana Angulegui',ag:'Ostara'},{n:'Mariel Conti',ag:'ABV'},\
  {n:'Martin Lombardi',ag:'Pop Up'},{n:'Nahuel Corbalan',ag:'Ostara'},{n:'Natalia Dalzotto',ag:'Freelance'},\
  {n:'Natalia Emanuele',ag:'Ostara'},{n:'Natalia Torres',ag:'Ostara'},{n:'Pabla Valenti',ag:'azcuy'},\
  {n:'Pachu Tamargo',ag:'Minita'},{n:'Romina Aguilera',ag:'Stadium'},{n:'Sabrina Seg\u00fa',ag:'Louder'},\
  {n:'Silvia Colussi',ag:'Ostara'},{n:'Valeria Ibarra',ag:'Ostara'},{n:'Victoria Martinez',ag:'Quilmes'},\
  {n:'Victoria Mithieux',ag:'Integra'},{n:'Daniela Torres',ag:'Ostara'},{n:'Gaston Gandara',ag:'ADN'},\
  {n:'Mariano Castellani',ag:'Pop Up'},{n:'Nahiara Fernandez Roman',ag:'Pop Up'},{n:'Lucila Zicari',ag:'Ostara'},\
  {n:'Melina Martinez Claret',ag:'SPA'},{n:'Agustina Monzon',ag:'ADN'},{n:'Gonzalo Gugliottella',ag:'ADN'},\
  {n:'Agustina Ezcurra',ag:'The Bloom'},{n:'Florencia Kralik',ag:'Btlandia'},{n:'Luis Lasaga',ag:'ADN'},\
  {n:'Christian Konig',ag:'Smarketing'},{n:'Bastian Osella',ag:'CMQ'},{n:'Bruno Rossi',ag:'Ostara'},\
  {n:'Sofia Barandalla',ag:'Minita'},{n:'Juani Rojas',ag:'Velvet'},{n:'Ana Iberlucea',ag:'Bermuda'},\
  {n:'Sabrina Wasserman',ag:'Mucha'},\
]\
\
export default function App() {\
  const [mail,setMail]=useState(''), [mi,setMi]=useState(''), [loading,setLoading]=useState(false), [data,setData]=useState(null), [mod,setMod]=useState('dashboard'), [err,setErr]=useState(''), [showNP,setShowNP]=useState(false)\
\
  useEffect(()=>{ const s=localStorage.getItem('magma_mail'); if(s&&MAILS.includes(s)){setMail(s);load(s)} },[])\
\
  async function load(m) {\
    setLoading(true);setErr('')\
    try {\
      const r=await fetch('/api/data',{headers:{'x-user-email':m}})\
      const j=await r.json()\
      if(j.ok) setData(j.data)\
      else setErr('Error: '+j.error)\
    } catch(e){setErr('Error de conexi\u00f3n')}\
    setLoading(false)\
  }\
\
  function login(){\
    const m=mi.trim().toLowerCase()\
    if(!MAILS.includes(m)){setErr('Mail no autorizado');return}\
    localStorage.setItem('magma_mail',m);setMail(m);load(m);setErr('')\
  }\
  function logout(){localStorage.removeItem('magma_mail');setMail('');setData(null)}\
\
  const NAV=[{id:'dashboard',label:'Dashboard',icon:'\u25c6'},{id:'presupuestos',label:'Presupuestos',icon:'\u25a1'},{id:'proyectos',label:'Proyectos',icon:'\u25b7'},{id:'facturacion',label:'Facturaci\u00f3n',icon:'$'},{id:'pagos',label:'Pagos Staff',icon:'\u2713'},{id:'balance',label:'Balance',icon:'\u2261'}]\
\
  if(!mail) return <><Head><title>Somos Magma</title></Head><GS/><div style={S.lw}><div style={S.lb}><div style={S.logo}>M//</div><div style={S.ls}>SOMOS MAGMA</div><div style={{marginBottom:24,fontSize:13,color:'#555'}}>Ingres\u00e1 con tu mail de trabajo</div><input style={S.inp} type=\\"email\\" placeholder=\\"tu@somosmagma.com\\" value={mi} onChange={e=>setMi(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()} autoFocus/>{err&&<div style={{color:'#E24B4A',fontSize:12,marginBottom:8}}>{err}</div>}<button style={S.bp} onClick={login}>Entrar</button></div></div></>\
\
  if(loading) return <><Head><title>Somos Magma</title></Head><GS/><div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',background:'#090909'}}><div style={S.logo}>M//</div><div style={{color:'#555',marginTop:16}}>Cargando...</div><div style={S.sp}/></div></>\
\
  return <><Head><title>Somos Magma</title></Head><GS/>\
    <div style={S.app}>\
      <div style={S.sb}>\
        <div style={{padding:'20px 16px 16px',borderBottom:'1px solid #2A2A2A'}}><div style={S.logo}>M//</div><div style={S.ls}>SOMOS MAGMA</div></div>\
        <nav style={{flex:1,padding:'12px 8px',overflowY:'auto'}}>\
          {NAV.map(n=><button key={n.id} style={{...S.ni,...(mod===n.id?{color:'#F0F0F0',background:'#262626'}:{})}} onClick={()=>setMod(n.id)}><span style={{fontSize:12,width:16,textAlign:'center'}}>{n.icon}</span>{n.label}</button>)}\
        </nav>\
        <div style={{padding:'12px 16px',borderTop:'1px solid #2A2A2A'}}><div style={{fontSize:11,color:'#555',marginBottom:6}}>{mail}</div><button style={{fontSize:11,padding:'4px 10px',borderRadius:4,border:'0.5px solid #333',background:'transparent',color:'#555',cursor:'pointer'}} onClick={logout}>Salir</button><div style={{fontSize:11,color:'#333',marginTop:12}}>Productora Audiovisual<br/>since '23 //</div></div>\
      </div>\
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>\
        <div style={{padding:'16px 24px',borderBottom:'1px solid #2A2A2A',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>\
          <div><div style={{fontSize:18,fontWeight:700}}>{NAV.find(n=>n.id===mod)?.label}</div><div style={{fontSize:12,color:'#555',marginTop:2}}>Vista general</div></div>\
          <div style={{display:'flex',gap:8,alignItems:'center'}}>\
            {mod==='presupuestos'&&<button style={{fontSize:12,padding:'6px 14px',borderRadius:6,border:'none',background:'#1543F8',color:'#fff',cursor:'pointer',fontWeight:500}} onClick={()=>setShowNP(true)}>+ Nuevo presupuesto</button>}\
            <button style={{fontSize:12,padding:'6px 14px',borderRadius:6,border:'0.5px solid #333',background:'transparent',color:'#777',cursor:'pointer'}} onClick={()=>load(mail)}>\u21bb Actualizar</button>\
          </div>\
        </div>\
        <div style={{flex:1,padding:'16px 24px',overflowY:'auto'}}>\
          {err&&<div style={{background:'#E24B4A20',border:'0.5px solid #E24B4A',borderRadius:8,padding:'10px 14px',color:'#E24B4A',fontSize:13,marginBottom:14}}>{err}</div>}\
          {!data?<div style={S.nd}>Sin datos</div>:<Mod id={mod} data={data} mail={mail} onRefresh={()=>load(mail)}/>}\
        </div>\
      </div>\
    </div>\
    {showNP&&<NuevoPresupuesto onClose={()=>setShowNP(false)} onGuardado={(p)=>{setData(prev=>({...prev,presupuestos:[...(prev.presupuestos||[]),p]}));setShowNP(false)}} data={data}/>}\
  </>\
}\
\
function Mod({id,data,mail,onRefresh}){\
  switch(id){\
    case 'dashboard': return <Dashboard data={data}/>\
    case 'presupuestos': return <Presupuestos data={data}/>\
    case 'proyectos': return <Proyectos data={data} mail={mail}/>\
    case 'facturacion': return <Facturacion data={data}/>\
    case 'pagos': return <PagosStaff data={data}/>\
    case 'balance': return <Balance data={data}/>\
    default: return <div style={S.nd}>En construcci\u00f3n</div>\
  }\
}\
\
// ---- DASHBOARD ----\
function Dashboard({data}){\
  const pr=data.presupuestos||[], fc=data.facturacion||[]\
  const ap=pr.filter(isAprobado)\
  const pend=pr.filter(p=>!isAprobado(p))\
  const pc=fc.filter(f=>!isCobrada(f))\
  const co=fc.filter(isCobrada)\
  const totalAp=ap.reduce((s,p)=>s+parseMonto(p['Precio Final']),0)\
  const totalPend=pend.reduce((s,p)=>s+parseMonto(p['Precio Final']),0)\
  const totalPc=pc.reduce((s,f)=>s+parseMonto(f['Precio FINAL']),0)\
  const totalCo=co.reduce((s,f)=>s+parseMonto(f['Precio FINAL']),0)\
\
  return <div>\
    <div style={S.k4}>\
      <K lbl=\\"Aprobados\\" val={ap.length} sub={fmtM(totalAp)} c=\\"#1543F8\\"/>\
      <K lbl=\\"En espera\\" val={pend.length} sub={fmtM(totalPend)} c=\\"#BA7517\\"/>\
      <K lbl=\\"Por cobrar\\" val={fmtM(totalPc)} sub={pc.length+' facturas'} c=\\"#BA7517\\"/>\
      <K lbl=\\"Cobrado\\" val={fmtM(totalCo)} sub={co.length+' facturas'} c=\\"#1D9E75\\"/>\
    </div>\
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:12}}>\
      <div style={S.card}><div style={S.ch}>\u00daltimos aprobados</div>\
        {ap.slice(-5).reverse().map((p,i)=><Row key={i} cols={['#'+p['Columna 1'],p['Proyecto']||p['Cliente'],fmt(parseMonto(p['Precio Final']))]}/>)}\
      </div>\
      <div style={S.card}><div style={S.ch}>Facturas por cobrar</div>\
        {pc.slice(0,5).map((f,i)=><Row key={i} cols={[f['Nro de Factura']||'\u2014',f['Cliente']||f['Proyecto'],fmt(parseMonto(f['Precio FINAL']))]} vc=\\"#BA7517\\"/>)}\
      </div>\
    </div>\
  </div>\
}\
\
// ---- PRESUPUESTOS ----\
const ESTADOS_CONFIG = [\
  {val:'APROBADO',   bg:'#1D9E7520', c:'#1D9E75'},\
  {val:'EN ESPERA',  bg:'#BA751720', c:'#BA7517'},\
  {val:'DESAPROBADO',bg:'#E24B4A20', c:'#E24B4A'},\
  {val:'EN CURSO',   bg:'#1543F820', c:'#1543F8'},\
  {val:'ENTREGADO',  bg:'#9635AB20', c:'#9635AB'},\
  {val:'REPRESUPUESTADO', bg:'#55555520', c:'#555'},\
]\
const estadoColor = e => ESTADOS_CONFIG.find(x=>x.val===String(e||'').toUpperCase()) || {bg:'#BA751720',c:'#BA7517'}\
\
function Toast({msg,onDone}){\
  useEffect(()=>{const t=setTimeout(onDone,2200);return()=>clearTimeout(t)},[])\
  return <div style={{position:'fixed',bottom:28,right:28,background:'#1D9E75',color:'#fff',padding:'10px 20px',borderRadius:8,fontSize:13,fontWeight:500,zIndex:9999,boxShadow:'0 4px 20px #0008'}}>\
    {msg}\
  </div>\
}\
\
function BadgeEstado({p, onUpdate}){\
  const [open,setOpen]=useState(false), [saving,setSaving]=useState(false), [motivo,setMotivo]=useState(''), [pendingE,setPendingE]=useState(null)\
  const ec=estadoColor(p['Estado'])\
\
  const handleSelect=async(estado)=>{\
    if(estado==='REPRESUPUESTADO'){setPendingE(estado);setOpen(false);return}\
    await doSave(estado)\
  }\
\
  const doSave=async(estado, mot='')=>{\
    setSaving(true);setOpen(false)\
    try{\
      await fetch('/api/presupuesto-estado',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:p['Columna 1'],estado,motivo:mot})})\
      onUpdate(p['Columna 1'],estado)\
    }catch(e){}\
    setSaving(false);setPendingE(null);setMotivo('')\
  }\
\
  return <div style={{position:'relative'}}>\
    {pendingE&&<div style={{position:'fixed',inset:0,background:'#000a',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>setPendingE(null)}>\
      <div style={{background:'#1E1E1E',border:'0.5px solid #2A2A2A',borderRadius:12,padding:24,minWidth:320}} onClick={e=>e.stopPropagation()}>\
        <div style={{fontSize:13,fontWeight:500,marginBottom:12}}>Motivo del represupuesto</div>\
        <input style={{...S.inp,marginBottom:12}} placeholder=\\"Ej: Cambi\u00f3 el scope, ajuste de precios...\\" value={motivo} onChange={e=>setMotivo(e.target.value)} autoFocus/>\
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>\
          <button style={{...S.fb}} onClick={()=>setPendingE(null)}>Cancelar</button>\
          <button style={{padding:'7px 16px',borderRadius:6,border:'none',background:'#1543F8',color:'#fff',fontSize:12,fontWeight:500,cursor:'pointer'}} onClick={()=>doSave(pendingE,motivo)}>Confirmar</button>\
        </div>\
      </div>\
    </div>}\
    <span style={{...S.badge,background:ec.bg,color:ec.c,cursor:'pointer',userSelect:'none',opacity:saving?0.5:1}} onClick={e=>{e.stopPropagation();setOpen(o=>!o)}}>\
      {saving?'...':(p['Estado']||'\u2014')}\
    </span>\
    {open&&<div style={{position:'absolute',right:0,top:'110%',background:'#1E1E1E',border:'0.5px solid #333',borderRadius:8,zIndex:100,minWidth:160,boxShadow:'0 8px 24px #000a',overflow:'hidden'}} onClick={e=>e.stopPropagation()}>\
      {ESTADOS_CONFIG.map(({val,bg,c})=>(\
        <div key={val} style={{padding:'8px 14px',cursor:'pointer',fontSize:12,display:'flex',alignItems:'center',gap:8}} onMouseEnter={e=>e.currentTarget.style.background='#2A2A2A'} onMouseLeave={e=>e.currentTarget.style.background='transparent'} onClick={()=>handleSelect(val)}>\
          <span style={{...S.badge,background:bg,color:c,fontSize:10}}>{val}</span>\
        </div>\
      ))}\
    </div>}\
  </div>\
}\
\
function DetallePresupuesto({p}){\
  const servicios=[]\
  for(let j=1;j<=12;j++){\
    const pedKey=j===1?'Pedido 1':(j<=9?\\\\`Pedido \\\\${j}\\\\`:\\\\`Pedido\\\\${j} \\\\`)\
    const prcKey=j===1?'Precio 1':\\\\`Precio \\\\${j}\\\\`\
    const ped=p[pedKey]||p[\\\\`Pedido \\\\${j}\\\\`]||''\
    const prc=parseMonto(p[prcKey]||p[\\\\`Precio \\\\${j}\\\\`])\
    if(ped&&prc>0) servicios.push({nombre:ped,precio:prc})\
  }\
  const subtotal=servicios.reduce((s,x)=>s+x.precio,0)\
  const total=parseMonto(p['Precio Final'])\
  const ajuste=parseMonto(p['Ajuste'])||parseMonto(p['Total'])||0\
  const fee=total-subtotal\
\
  return <div style={{borderTop:'0.5px solid #2A2A2A',padding:'16px 16px',background:'#111'}}>\
    <div style={{display:'flex',gap:24,marginBottom:14,flexWrap:'wrap'}}>\
      {[['Fecha evento',p['Fecha Presupuesto']||'\u2014'],['Contacto',p['Contacto']||'\u2014'],['Agencia',p['Agencia']||'\u2014']].map(([k,v])=>(\
        <div key={k}><div style={{fontSize:10,color:'#555',marginBottom:2}}>{k}</div><div style={{fontSize:12,fontWeight:500}}>{v}</div></div>\
      ))}\
    </div>\
    {servicios.length>0?<>\
      <div style={{display:'grid',gridTemplateColumns:'1fr 110px',background:'#1A1A1A',borderRadius:'6px 6px 0 0',overflow:'hidden'}}>\
        {['SERVICIO','PRECIO'].map(h=><div key={h} style={{fontSize:10,color:'#555',padding:'6px 12px',textTransform:'uppercase',letterSpacing:'0.06em'}}>{h}</div>)}\
      </div>\
      {servicios.map((s,i)=>(\
        <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 110px',borderBottom:'0.5px solid #2A2A2A',fontSize:12}}>\
          <div style={{padding:'7px 12px'}}>{s.nombre}</div>\
          <div style={{padding:'7px 12px',fontFamily:'monospace'}}>{fmt(s.precio)}</div>\
        </div>\
      ))}\
      <div style={{background:'#1A1A1A',borderRadius:'0 0 6px 6px',padding:'10px 12px',marginBottom:8}}>\
        {[['Subtotal servicios',fmt(subtotal),null],['Fee / Diferencia',(fee>=0?'+':'')+fmt(fee),fee>=0?'#1D9E75':'#E24B4A'],['Precio Final',fmt(total),'#1543F8'],ajuste?['Ajuste',(ajuste>=0?'+':'')+fmt(ajuste),'#BA7517']:null].filter(Boolean).map(([k,v,c])=>(\
          <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',fontSize:12}}>\
            <span style={{color:'#555'}}>{k}</span><span style={{fontFamily:'monospace',color:c||'inherit',fontWeight:k==='Precio Final'?600:400}}>{v}</span>\
          </div>\
        ))}\
      </div>\
    </>:<div style={{fontSize:12,color:'#555',fontStyle:'italic',marginBottom:10}}>Sin servicios cargados</div>}\
  </div>\
}\
\
function Presupuestos({data:initialData}){\
  const [localData,setLocalData]=useState(initialData)\
  const [q,setQ]=useState(''), [f,setF]=useState('todos'), [pm,setPm]=useState('todos'), [open,setOpen]=useState(null), [toast,setToast]=useState('')\
\
  useEffect(()=>{setLocalData(initialData)},[initialData])\
\
  const presus=(localData.presupuestos||[]).filter(p=>p['Columna 1'])\
\
  const pms=[...new Set(presus.map(p=>p['PM Interno']).filter(Boolean))].sort()\
\
  const filtered=presus.filter(p=>{\
    const e=String(p['Estado']||'').toUpperCase()\
    const mf=f==='todos'||(f==='ap'&&(e==='APROBADO'||e==='EN CURSO'||e==='ENTREGADO'))\
      ||(f==='esp'&&e==='EN ESPERA')||(f==='des'&&e==='DESAPROBADO')\
      ||(f==='rep'&&e==='REPRESUPUESTADO')||(f==='cur'&&e==='EN CURSO')\
    const mpm=pm==='todos'||p['PM Interno']===pm\
    const mq=!q||[p['Columna 1'],p['Proyecto'],p['Cliente'],p['Agencia'],p['PM Interno']].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase()))\
    return mf&&mpm&&mq\
  }).reverse()\
\
  const handleEstadoUpdate=(num,nuevoEstado)=>{\
    setLocalData(prev=>({...prev,presupuestos:prev.presupuestos.map(p=>String(p['Columna 1'])===String(num)?{...p,Estado:nuevoEstado}:p)}))\
    setToast('Estado actualizado \u2713')\
  }\
\
  return <div>\
    {toast&&<Toast msg={toast} onDone={()=>setToast('')}/>}\
    <div style={{display:'flex',gap:10,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>\
      <input style={{...S.inp,flex:1,minWidth:180,marginBottom:0}} placeholder=\\"Buscar N\u00b0, cliente, proyecto, PM...\\" value={q} onChange={e=>setQ(e.target.value)}/>\
      <select style={{padding:'7px 10px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:pm==='todos'?'#555':'#F0F0F0',fontSize:12,outline:'none',cursor:'pointer'}} value={pm} onChange={e=>setPm(e.target.value)}>\
        <option value=\\"todos\\">Todos los PM</option>\
        {pms.map(p=><option key={p} value={p}>{p}</option>)}\
      </select>\
    </div>\
    <div style={{display:'flex',gap:4,marginBottom:12,flexWrap:'wrap'}}>\
      {[['todos','Todos'],['ap','Aprobados'],['cur','En curso'],['esp','En espera'],['des','Desaprobados'],['rep','Represupuestados']].map(([id,l])=>(\
        <button key={id} style={{...S.fb,...(f===id?S.fa:{})}} onClick={()=>setF(id)}>{l}</button>\
      ))}\
    </div>\
    <div style={{overflowY:'auto',maxHeight:'calc(100vh - 240px)'}}>\
      <table style={{width:'100%',borderCollapse:'collapse'}}>\
        <thead><tr style={{background:'#1A1A1A'}}>\
          {['N\u00b0','Fecha','PM','Agencia','Cliente','Proyecto','Total','Estado'].map(h=>(\
            <th key={h} style={{fontSize:10,color:'#555',padding:'8px 12px',textAlign:'left',fontWeight:400,textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:'0.5px solid #2A2A2A'}}>{h}</th>\
          ))}\
        </tr></thead>\
        <tbody>\
          {filtered.map((p,i)=>{\
            const isOpen=open===p['Columna 1']\
            return <>\
              <tr key={i} style={{background:isOpen?'#1E1E1E':i%2===0?'#161616':'#1A1A1A',cursor:'pointer'}} onClick={()=>setOpen(isOpen?null:p['Columna 1'])}>\
                <td style={{...S.td,color:'#1543F8',fontFamily:'monospace',fontSize:11}}>#{p['Columna 1']}</td>\
                <td style={{...S.td,fontSize:11,color:'#666'}}>{p['Fecha Presupuesto']||'\u2014'}</td>\
                <td style={{...S.td,fontSize:12}}>{p['PM Interno']||'\u2014'}</td>\
                <td style={{...S.td,fontSize:12}}>{p['Agencia']||'\u2014'}</td>\
                <td style={{...S.td,fontSize:12,fontWeight:500}}>{p['Cliente']||'\u2014'}</td>\
                <td style={{...S.td,fontSize:12,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p['Proyecto']||'\u2014'}</td>\
                <td style={{...S.td,fontFamily:'monospace',fontSize:12}}>{fmt(parseMonto(p['Precio Final']))}</td>\
                <td style={{...S.td}} onClick={e=>e.stopPropagation()}>\
                  <BadgeEstado p={p} onUpdate={handleEstadoUpdate}/>\
                </td>\
              </tr>\
              {isOpen&&<tr key={i+'d'}><td colSpan={8} style={{padding:0}}><DetallePresupuesto p={p}/></td></tr>}\
            </>\
          })}\
        </tbody>\
      </table>\
      {filtered.length===0&&<div style={S.nd}>Sin resultados</div>}\
    </div>\
  </div>\
}\
\
// ---- PROYECTOS ----
function Proyectos({data,mail}){
  const MESES_F=[['01','Enero'],['02','Febrero'],['03','Marzo'],['04','Abril'],['05','Mayo'],['06','Junio'],['07','Julio'],['08','Agosto'],['09','Septiembre'],['10','Octubre'],['11','Noviembre'],['12','Diciembre']]
  const [open,setOpen]=useState(null)
  const [sels,setSels]=useState({})
  const [guardados,setGuardados]=useState({})
  const [saving,setSaving]=useState(null)
  const [toast,setToast]=useState('')
  const [q,setQ]=useState('')
  const [anio,setAnio]=useState('todos')
  const [mes,setMes]=useState('todos')
  const [pm,setPm]=useState('todos')
  const [agencia,setAgencia]=useState('todos')

  const proyectos=(data.proyectos||[]).filter(p=>p['N\u00b0 presupuesto'])
  const staffRRHH=['Somos Magma',...(data.rrhh||[]).map(r=>r['Nombre Apellido']).filter(Boolean).sort()]

  // Precios de lista por nombre de servicio
  const getPrecioLista=(nombre)=>{
    const s=SVCS_LIST.find(x=>x.n===nombre||nombre.includes(x.n.replace(/[^\w\s]/g,'').trim())||x.n.replace(/[^\w\s]/g,'').trim()===nombre.replace(/[^\w\s]/g,'').trim())
    return s?.p||0
  }

  // Filtros dinamicos
  const anios=[...new Set(proyectos.map(p=>{const f=p['Fecha Evento']||'';const m=f.match(/(\d{4})/);return m?m[1]:null}).filter(Boolean))].sort().reverse()
  const pms=[...new Set(proyectos.map(p=>p['PM']||p['PM Interno']||'').filter(Boolean))].sort()
  const agencias=[...new Set(proyectos.map(p=>p['Agencia']||'').filter(Boolean))].sort()

  const filtrados=proyectos.filter(p=>{
    const fecha=p['Fecha Evento']||''
    const mMatch=mes==='todos'||fecha.startsWith(mes+'/')||fecha.includes('/'+mes+'/')
    const aMatch=anio==='todos'||fecha.includes(anio)
    const pmVal=p['PM']||p['PM Interno']||''
    const pmMatch=pm==='todos'||pmVal===pm
    const agMatch=agencia==='todos'||(p['Agencia']||'')===agencia
    const qMatch=!q||[p['N\u00b0 presupuesto'],p['Proyecto'],p['Cliente'],p['Agencia']].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase()))
    return mMatch&&aMatch&&pmMatch&&agMatch&&qMatch
  })

  const getBase=(proy)=>{
    const svcs=[]
    for(let j=1;j<=12;j++){
      const ped=proy[j===1?'Pedido':'Pedido '+j]||''
      const qui=proy[j===1?'Staff':'Staff '+j]||''
      const prc=parseMonto(proy[j===1?'Precio':'Precio '+j])
      const precioRef=prc||getPrecioLista(ped)
      if(ped) svcs.push({pedido:ped,quien:qui,precio:precioRef,precioRef,esExtra:false})
    }
    return svcs
  }

  const getSel=(num,base)=>sels[num]||base.map(s=>({...s}))

  const upd=(num,idx,field,val,base)=>setSels(prev=>{
    const cur=[...getSel(num,base)]
    cur[idx]={...cur[idx],[field]:field==='precio'?parseFloat(val)||0:val}
    // Si se elige servicio en extra, precargar precio de lista
    if(field==='pedido'){
      const pLista=getPrecioLista(val)
      if(pLista>0) cur[idx].precio=pLista
    }
    return {...prev,[num]:cur}
  })

  const addExtra=(num,base)=>setSels(prev=>{
    const cur=[...getSel(num,base),{pedido:'',quien:'',precio:0,precioRef:0,esExtra:true}]
    return {...prev,[num]:cur}
  })

  const delExtra=(num,idx,base)=>setSels(prev=>{
    const cur=getSel(num,base).filter((_,i)=>i!==idx)
    return {...prev,[num]:cur}
  })

  const resumen=(items,totalProy)=>{
    let fl=0,mg=0
    items.forEach(s=>{
      if(!s.quien) return
      const v=s.precio||0
      if(s.quien==='Somos Magma') mg+=v
      else fl+=v
    })
    return {fl,mg,fee:totalProy-fl-mg}
  }

  const guardar=async(num,base)=>{
    setSaving(num)
    const items=getSel(num,base)
    try{
      await fetch('/api/proyecto-staff',{method:'POST',headers:{'Content-Type':'application/json','x-user-email':mail},body:JSON.stringify({num,staffData:items.map(s=>({nombre:s.quien,monto:s.precio||0,pedido:s.pedido}))})})
      setGuardados(prev=>({...prev,[num]:true}))
      setOpen(null)
      setToast('Staff guardado \u2713')
      setTimeout(()=>setToast(''),2500)
    }catch(e){}
    setSaving(null)
  }

  const inp={padding:'7px 10px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontSize:12,outline:'none',width:'100%'}
  const sel2={padding:'7px 10px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:'#555',fontSize:12,outline:'none',cursor:'pointer'}

  return <div>
    {toast&&<div style={{position:'fixed',bottom:20,right:20,background:'#1D9E75',color:'#fff',padding:'8px 16px',borderRadius:8,fontSize:12,fontWeight:500,zIndex:999}}>{toast}</div>}
    <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
      <input style={{...S.inp,flex:1,minWidth:160,marginBottom:0}} placeholder="Buscar N\u00b0, proyecto, cliente..." value={q} onChange={e=>setQ(e.target.value)}/>
      <select style={sel2} value={anio} onChange={e=>setAnio(e.target.value)}>
        <option value="todos">Todos los a\u00f1os</option>
        {anios.map(a=><option key={a} value={a}>{a}</option>)}
      </select>
      <select style={sel2} value={mes} onChange={e=>setMes(e.target.value)}>
        <option value="todos">Todos los meses</option>
        {MESES_F.map(([v,l])=><option key={v} value={v}>{l}</option>)}
      </select>
      <select style={sel2} value={pm} onChange={e=>setPm(e.target.value)}>
        <option value="todos">Todos los PM</option>
        {pms.map(p=><option key={p} value={p}>{p}</option>)}
      </select>
      <select style={sel2} value={agencia} onChange={e=>setAgencia(e.target.value)}>
        <option value="todos">Todas las agencias</option>
        {agencias.map(a=><option key={a} value={a}>{a}</option>)}
      </select>
    </div>
    <div style={{overflowY:'auto',maxHeight:'calc(100vh - 180px)'}}>
      {filtrados.length===0&&<div style={S.nd}>Sin proyectos</div>}
      {filtrados.map((p,i)=>{
        const num=p['N\u00b0 presupuesto']
        const ok=p['Carga Staff']===true||p['Carga Staff']==='TRUE'||guardados[num]
        const isOpen=open===num
        const base=getBase(p)
        const items=getSel(num,base)
        const totalProy=parseMonto(p['Total '])||parseMonto(p['Total'])
        const {fl,mg,fee}=resumen(items,totalProy)
        const magmaSvcs=items.filter(s=>s.quien==='Somos Magma').map(s=>s.pedido).filter(Boolean)

        return <div key={i} style={{...S.card,marginBottom:8}}>
          <div style={{display:'grid',gridTemplateColumns:'80px 1fr 160px 70px 110px 90px 90px',alignItems:'center',cursor:'pointer',padding:'10px 0'}} onClick={()=>setOpen(isOpen?null:num)}>
            <span style={{padding:'0 12px',color:'#1543F8',fontFamily:'monospace',fontSize:11}}>#{num}</span>
            <span style={{padding:'0 12px',fontWeight:500,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p['Proyecto']||'\u2014'}</span>
            <span style={{padding:'0 12px',fontSize:12,color:'#555'}}>{[p['Agencia'],p['Cliente']].filter(Boolean).join(' / ')}</span>
            <span style={{padding:'0 12px',fontSize:12,color:'#555'}}>{p['PM']||p['PM Interno']||'\u2014'}</span>
            <span style={{padding:'0 12px',fontFamily:'monospace',fontSize:12}}>{fmt(totalProy)}</span>
            <span style={{padding:'0 12px'}}><span style={{...S.badge,background:ok?'#1D9E7520':'#BA751720',color:ok?'#1D9E75':'#BA7517'}}>{ok?'OK':'Pendiente'}</span></span>
            <span style={{padding:'0 12px'}}><button style={S.fb} onClick={e=>{e.stopPropagation();setOpen(isOpen?null:num)}}>{ok?'Ver':'Cargar'}</button></span>
          </div>
          {isOpen&&<div style={{borderTop:'0.5px solid #2A2A2A',padding:'16px'}}>
            <div style={{fontSize:11,color:'#555',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.06em'}}>
              Asignar staff \u2014 el precio se precarga de la lista. Pods agregar servicios extra de producci\u00f3n.
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1.2fr 110px 28px',gap:8,marginBottom:6}}>
              {['Servicio','Staff','Monto',''].map(h=><span key={h} style={{fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'0.06em',padding:'0 4px'}}>{h}</span>)}
            </div>
            {items.map((s,idx)=>{
              const em=s.quien==='Somos Magma'
              const rowSt=em?{background:'#9635AB08',border:'0.5px solid #9635AB30',borderRadius:6,padding:'4px 0'}:{}
              return <div key={idx} style={{display:'grid',gridTemplateColumns:'1fr 1.2fr 110px 28px',gap:8,alignItems:'center',marginBottom:6,...rowSt}}>
                {s.esExtra
                  ? <select value={s.pedido} onChange={e=>upd(num,idx,'pedido',e.target.value,base)} style={{...inp,color:s.pedido?'#F0F0F0':'#555'}}>
                      <option value="">\u2014 Servicio extra \u2014</option>
                      {SVCS_LIST.map(sv=><option key={sv.n} value={sv.n}>{sv.n}</option>)}
                    </select>
                  : <div style={{padding:'8px 10px',background:em?'transparent':'#1E1E1E',borderRadius:6,fontSize:13,display:'flex',alignItems:'center',gap:6}}>
                      {s.pedido||'\u2014'}
                      {em&&<span style={{fontSize:10,color:'#9635AB',padding:'2px 6px',background:'#9635AB15',borderRadius:3,fontWeight:500}}>Magma</span>}
                    </div>
                }
                <select value={s.quien} onChange={e=>upd(num,idx,'quien',e.target.value,base)} style={{...inp,color:em?'#9635AB':'#F0F0F0',border:'0.5px solid '+(em?'#9635AB40':'#333')}}>
                  <option value="">\u2014 Sin asignar \u2014</option>
                  {staffRRHH.map(st=><option key={st} value={st}>{st}</option>)}
                </select>
                <input type="number" value={s.precio||''} onChange={e=>upd(num,idx,'precio',e.target.value,base)} placeholder={s.precioRef?String(s.precioRef):'$'} style={{...inp,color:em?'#9635AB':'#F0F0F0',fontFamily:'monospace'}}/>
                <button onClick={()=>s.esExtra&&delExtra(num,idx,base)} style={{width:24,height:24,border:'none',background:'transparent',color:s.esExtra?'#E24B4A':'transparent',cursor:s.esExtra?'pointer':'default',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}>
                  {s.esExtra?'\u00d7':''}
                </button>
              </div>
            })}
            <button onClick={()=>addExtra(num,base)} style={{width:'100%',padding:'6px',borderRadius:6,border:'0.5px dashed #2A2A2A',background:'transparent',color:'#555',fontSize:11,cursor:'pointer',marginTop:4,marginBottom:12}}>
              + Agregar servicio extra
            </button>
            <div style={{display:'flex',gap:16,padding:'10px 14px',background:'#1E1E1E',borderRadius:8,flexWrap:'wrap',borderLeft:'3px solid #2A2A2A'}}>
              {[['Presupuestado',fmt(totalProy),null],['Freelance',fmt(fl),'#BA7517'],['Somos Magma',fmt(mg),'#9635AB'],['Fee Magma',(fee>=0?'+':'')+fmt(fee),fee>=0?'#1D9E75':'#E24B4A']].map(([lbl,val,col])=>(
                <div key={lbl}><div style={{fontSize:10,color:'#555',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:2}}>{lbl}</div><div style={{fontSize:14,fontWeight:500,fontFamily:'monospace',color:col||'inherit'}}>{val}</div></div>
              ))}
            </div>
            {magmaSvcs.length>0&&<div style={{fontSize:11,color:'#9635AB',marginTop:8,padding:'6px 10px',background:'#9635AB08',borderRadius:6,border:'0.5px solid #9635AB20'}}>
              Somos Magma hace {magmaSvcs.join(', ')} \u2014 queda como ingreso interno.
            </div>}
            <button onClick={()=>guardar(num,base)} disabled={saving===num} style={{marginTop:12,padding:'8px 16px',borderRadius:8,border:'none',background:'#1543F8',color:'#fff',fontSize:12,fontWeight:500,cursor:'pointer',width:'100%',opacity:saving===num?0.6:1}}>
              {saving===num?'Guardando...':'Guardar staff'}
            </button>
          </div>}
        </div>
      })}
    </div>
  </div>
}


