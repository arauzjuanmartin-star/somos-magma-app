import { useState, useEffect } from 'react'
import Head from 'next/head'

const MAILS = ['juan@somosmagma.com','sofi@somosmagma.com','tom@somosmagma.com','admin@somosmagma.com','lulu@somosmagma.com','arauzjuanmartin@gmail.com']

const parseMonto = v => {
  if (!v) return 0
  const n = parseFloat(String(v).replace(/[$,\s]/g, ''))
  return isNaN(n) ? 0 : n
}
const fmt = n => '$' + Math.round(Math.abs(n||0)).toLocaleString('es-AR')
const fmtM = n => { const a=Math.abs(n||0); return (n<0?'-':'')+(a>=1000000?'$'+(a/1000000).toFixed(1)+'M':'$'+Math.round(a/1000)+'K') }

const isAprobado = p => { const e=String(p['Estado']||'').toUpperCase(); return e==='APROBADO'||e==='EN CURSO'||e==='ENTREGADO' }
const isCobrada = f => { const v=f['Cobrado']; return v===true||v==='TRUE'||String(v).toUpperCase()==='TRUE' }

export default function App() {
  const [mail,setMail]=useState(''), [mi,setMi]=useState(''), [loading,setLoading]=useState(false), [data,setData]=useState(null), [mod,setMod]=useState('dashboard'), [err,setErr]=useState('')
  useEffect(()=>{ const s=localStorage.getItem('magma_mail'); if(s&&MAILS.includes(s)){setMail(s);load(s)} },[])
  async function load(m) {
    setLoading(true);setErr('')
    try { const r=await fetch('/api/data',{headers:{'x-user-email':m}}); const j=await r.json(); if(j.ok)setData(j.data); else setErr('Error: '+j.error) } catch(e){setErr('Error de conexión')}
    setLoading(false)
  }
  function login(){ const m=mi.trim().toLowerCase(); if(!MAILS.includes(m)){setErr('Mail no autorizado');return}; localStorage.setItem('magma_mail',m);setMail(m);load(m);setErr('') }
  function logout(){ localStorage.removeItem('magma_mail');setMail('');setData(null) }
  const NAV=[{id:'dashboard',label:'Dashboard',icon:'◆'},{id:'presupuestos',label:'Presupuestos',icon:'□'},{id:'proyectos',label:'Proyectos',icon:'▷'},{id:'facturacion',label:'Facturación',icon:'$'},{id:'pagos',label:'Pagos Staff',icon:'✓'},{id:'balance',label:'Balance',icon:'≡'}]
  if(!mail) return <><Head><title>Somos Magma</title></Head><GS/><div style={S.lw}><div style={S.lb}><div style={S.logo}>M//</div><div style={S.ls}>SOMOS MAGMA</div><div style={{marginBottom:24,fontSize:13,color:'#555'}}>Ingresá con tu mail de trabajo</div><input style={S.inp} type="email" placeholder="tu@somosmagma.com" value={mi} onChange={e=>setMi(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()} autoFocus/>{err&&<div style={{color:'#E24B4A',fontSize:12,marginBottom:8}}>{err}</div>}<button style={S.bp} onClick={login}>Entrar</button></div></div></>
  if(loading) return <><Head><title>Somos Magma</title></Head><GS/><div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',background:'#090909'}}><div style={S.logo}>M//</div><div style={{color:'#555',marginTop:16}}>Cargando...</div><div style={S.sp}/></div></>
  return <><Head><title>Somos Magma</title></Head><GS/>
    <div style={S.app}>
      <div style={S.sb}>
        <div style={{padding:'20px 16px 16px',borderBottom:'1px solid #2A2A2A'}}><div style={S.logo}>M//</div><div style={S.ls}>SOMOS MAGMA</div></div>
        <nav style={{flex:1,padding:'12px 8px',overflowY:'auto'}}>{NAV.map(n=><button key={n.id} style={{...S.ni,...(mod===n.id?{color:'#F0F0F0',background:'#262626'}:{})}} onClick={()=>setMod(n.id)}><span style={{fontSize:12,width:16,textAlign:'center'}}>{n.icon}</span>{n.label}</button>)}</nav>
        <div style={{padding:'12px 16px',borderTop:'1px solid #2A2A2A'}}><div style={{fontSize:11,color:'#555',marginBottom:6}}>{mail}</div><button style={{fontSize:11,padding:'4px 10px',borderRadius:4,border:'0.5px solid #333',background:'transparent',color:'#555',cursor:'pointer'}} onClick={logout}>Salir</button><div style={{fontSize:11,color:'#333',marginTop:12}}>Productora Audiovisual<br/>since '23 //</div></div>
      </div>
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div style={{padding:'16px 24px',borderBottom:'1px solid #2A2A2A',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
          <div><div style={{fontSize:18,fontWeight:700}}>{NAV.find(n=>n.id===mod)?.label}</div><div style={{fontSize:12,color:'#555',marginTop:2}}>Vista general</div></div>
          <button style={{fontSize:12,padding:'6px 14px',borderRadius:6,border:'0.5px solid #333',background:'transparent',color:'#777',cursor:'pointer'}} onClick={()=>load(mail)}>↻ Actualizar</button>
        </div>
        <div style={{flex:1,padding:'16px 24px',overflowY:'auto'}}>
          {err&&<div style={{background:'#E24B4A20',border:'0.5px solid #E24B4A',borderRadius:8,padding:'10px 14px',color:'#E24B4A',fontSize:13,marginBottom:14}}>{err}</div>}
          {!data?<div style={S.nd}>Sin datos</div>:<Mod id={mod} data={data} onRefresh={()=>load(mail)}/>}
        </div>
      </div>
    </div>
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

function Dashboard({data}){
  const pr=data.presupuestos||[], fc=data.facturacion||[]
  const ap=pr.filter(isAprobado), pend=pr.filter(p=>!isAprobado(p))
  const pc=fc.filter(f=>!isCobrada(f)), co=fc.filter(isCobrada)
  return <div>
    <div style={S.k4}>
      <K lbl="Aprobados" val={ap.length} sub={fmtM(ap.reduce((s,p)=>s+parseMonto(p['Precio Final']),0))} c="#1543F8"/>
      <K lbl="En espera" val={pend.length} sub={fmtM(pend.reduce((s,p)=>s+parseMonto(p['Precio Final']),0))} c="#BA7517"/>
      <K lbl="Por cobrar" val={fmtM(pc.reduce((s,f)=>s+parseMonto(f['Precio FINAL']),0))} sub={pc.length+' facturas'} c="#BA7517"/>
      <K lbl="Cobrado" val={fmtM(co.reduce((s,f)=>s+parseMonto(f['Precio FINAL']),0))} sub={co.length+' facturas'} c="#1D9E75"/>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:12}}>
      <div style={S.card}><div style={S.ch}>Últimos aprobados</div>{ap.slice(-5).reverse().map((p,i)=><Row key={i} cols={['#'+p['Columna 1'],p['Proyecto']||p['Cliente'],fmt(parseMonto(p['Precio Final']))]}/>)}</div>
      <div style={S.card}><div style={S.ch}>Facturas por cobrar</div>{pc.slice(0,5).map((f,i)=><Row key={i} cols={[f['Nro de Factura']||'—',f['Cliente']||f['Proyecto'],fmt(parseMonto(f['Precio FINAL']))]} vc="#BA7517"/>)}</div>
    </div>
  </div>
}

function Presupuestos({data}){
  const [q,setQ]=useState(''), [f,setF]=useState('todos')
  const presus=(data.presupuestos||[]).filter(p=>p['Columna 1']).filter(p=>{
    const ap=isAprobado(p)
    const mf=f==='todos'||(f==='ap'&&ap)||(f==='esp'&&!ap)
    const mq=!q||[p['Columna 1'],p['Proyecto'],p['Cliente'],p['Agencia'],p['PM Interno']].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase()))
    return mf&&mq
  }).reverse()
  const ec=e=>{const s=String(e||'').toUpperCase();if(s==='APROBADO')return{bg:'#1D9E7520',c:'#1D9E75'};if(s==='EN CURSO')return{bg:'#1543F820',c:'#1543F8'};if(s==='ENTREGADO')return{bg:'#9635AB20',c:'#9635AB'};if(s==='DESAPROBADO')return{bg:'#E24B4A20',c:'#E24B4A'};return{bg:'#BA751720',c:'#BA7517'}}
  return <div>
    <div style={{display:'flex',gap:10,marginBottom:12,flexWrap:'wrap'}}>
      <input style={{...S.inp,flex:1,minWidth:180,marginBottom:0}} placeholder="Buscar N°, cliente, proyecto, PM..." value={q} onChange={e=>setQ(e.target.value)}/>
      <div style={{display:'flex',gap:4}}>{[['todos','Todos'],['ap','Aprobados'],['esp','En espera']].map(([id,l])=><button key={id} style={{...S.fb,...(f===id?S.fa:{})}} onClick={()=>setF(id)}>{l}</button>)}</div>
    </div>
    <div style={{overflowY:'auto',maxHeight:'calc(100vh - 210px)'}}>
      <table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead><tr style={{background:'#1A1A1A'}}>{['N°','Fecha','PM','Agencia','Cliente','Proyecto','Total','Estado'].map(h=><th key={h} style={{fontSize:10,color:'#555',padding:'8px 12px',textAlign:'left',fontWeight:400,textTransform:'uppercase',letterSpacing:'0.06em',borderBottom:'0.5px solid #2A2A2A'}}>{h}</th>)}</tr></thead>
        <tbody>{presus.map((p,i)=>{const e=ec(p['Estado']);return <tr key={i} style={{background:i%2===0?'#161616':'#1A1A1A'}}>
          <td style={{...S.td,color:'#1543F8',fontFamily:'monospace',fontSize:11}}>#{p['Columna 1']}</td>
          <td style={{...S.td,fontSize:11,color:'#666'}}>{p['Fecha Presupuesto']||'—'}</td>
          <td style={{...S.td,fontSize:12}}>{p['PM Interno']||'—'}</td>
          <td style={{...S.td,fontSize:12}}>{p['Agencia']||'—'}</td>
          <td style={{...S.td,fontSize:12,fontWeight:500}}>{p['Cliente']||'—'}</td>
          <td style={{...S.td,fontSize:12,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p['Proyecto']||'—'}</td>
          <td style={{...S.td,fontFamily:'monospace',fontSize:12}}>{fmt(parseMonto(p['Precio Final']))}</td>
          <td style={S.td}><span style={{...S.badge,background:e.bg,color:e.c}}>{p['Estado']||'—'}</span></td>
        </tr>})}</tbody>
      </table>
      {presus.length===0&&<div style={S.nd}>Sin resultados</div>}
    </div>
  </div>
}

function Proyectos({data}){
  const [open,setOpen]=useState(null)
  const proj=(data.presupuestos||[]).filter(p=>isAprobado(p)||String(p['Estado']||'').toUpperCase()==='EN CURSO')
  return <div style={{overflowY:'auto',maxHeight:'calc(100vh - 140px)'}}>
    {proj.length===0&&<div style={S.nd}>Sin proyectos activos</div>}
    {proj.map((p,i)=>{
      const io=open===i, total=parseMonto(p['Precio Final'])
      const servicios=[]
      for(let j=1;j<=8;j++){const ped=p['Pedido '+j]||p['Pedido'+j+' ']||'';const prec=parseMonto(p['Precio '+j]);if(ped&&prec>0)servicios.push({nombre:ped,precio:prec})}
      const totalSvc=servicios.reduce((s,x)=>s+x.precio,0), diff=total-totalSvc
      return <div key={i} style={{...S.card,marginBottom:8}}>
        <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',cursor:'pointer'}} onClick={()=>setOpen(io?null:i)}>
          <span style={{color:'#1543F8',fontFamily:'monospace',fontSize:11,flexShrink:0}}>#{p['Columna 1']}</span>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p['Proyecto']||p['Cliente']}</div><div style={{fontSize:11,color:'#555',marginTop:2}}>{[p['Agencia'],p['Cliente']].filter(Boolean).join(' · ')} · PM: {p['PM Interno']||'—'}</div></div>
          <span style={{fontFamily:'monospace',fontSize:13,fontWeight:500,color:'#1543F8',marginRight:12}}>{fmt(total)}</span>
          <span style={{...S.badge,background:'#1D9E7520',color:'#1D9E75',marginRight:8}}>{p['Estado']}</span>
          <span style={{fontSize:11,color:'#555'}}>{io?'▲':'▶'}</span>
        </div>
        {io&&<div style={{borderTop:'0.5px solid #2A2A2A',padding:'14px 16px'}}>
          {servicios.length===0?<div style={{fontSize:12,color:'#555',fontStyle:'italic'}}>Sin servicios cargados</div>:<>
            {servicios.map((s,j)=><div key={j} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'0.5px solid #2A2A2A',fontSize:12}}><span>{s.nombre}</span><span style={{fontFamily:'monospace'}}>{fmt(s.precio)}</span></div>)}
            <div style={{display:'flex',gap:20,marginTop:12,padding:'10px 12px',background:'#1E1E1E',borderRadius:8}}>
              {[['Total',fmt(total),null],['Servicios',fmt(totalSvc),null],['Diferencia',(diff>=0?'+':'')+fmt(diff),diff>=0?'#1D9E75':'#E24B4A']].map(([k,v,c])=><div key={k}><div style={{fontSize:10,color:'#555',marginBottom:3}}>{k}</div><div style={{fontFamily:'monospace',fontWeight:500,color:c||'inherit'}}>{v}</div></div>)}
            </div>
          </>}
        </div>}
      </div>
    })}
  </div>
}

function Facturacion({data}){
  const [f,setF]=useState('todas'), [open,setOpen]=useState(null)
  const fc=data.facturacion||[]
  const parseD=s=>{if(!s)return null;const p=String(s).split('/');return p.length===3?new Date(p[2],p[1]-1,p[0]):null}
  const diffD=x=>{const v=parseD(x['Vencimiento']);if(!v)return 0;return Math.floor((v-new Date())/864e5)}
  const est=x=>{if(isCobrada(x))return'c';const d=diffD(x);if(d<-30)return'r';if(d<0)return'v';return'p'}
  const fil=fc.filter(x=>f==='todas'||(f==='pend'&&!isCobrada(x))||(f==='cob'&&isCobrada(x)))
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
    <div style={{display:'flex',gap:4,marginBottom:12}}>{[['todas','Todas'],['pend','Pendientes'],['cob','Cobradas']].map(([id,l])=><button key={id} style={{...S.fb,...(f===id?S.fa:{})}} onClick={()=>setF(id)}>{l}</button>)}</div>
    <div style={{overflowY:'auto',maxHeight:'calc(100vh - 340px)'}}>
      {fil.map((x,i)=>{
        const e=est(x),b=bm[e]||bm.p,io=open===x['Nro de Factura'],d=diffD(x)
        const bl=e==='v'?'Vencida '+Math.abs(d)+'d':e==='r'?'¡Reclamar! '+Math.abs(d)+'d':b.l
        const neto=parseMonto(x['Precio SIN IVA']),iva=parseMonto(x['IVA']),total=parseMonto(x['Precio FINAL']),ret=parseMonto(x['Retenciones'])
        return <div key={i} style={{...S.card,borderLeft:'3px solid '+(e==='c'?'#1D9E75':['r','v'].includes(e)?'#E24B4A':'#2A2A2A'),marginBottom:8}}>
          <div style={{display:'grid',gridTemplateColumns:'auto 1fr auto auto auto',gap:10,alignItems:'center',padding:'10px 14px',cursor:'pointer'}} onClick={()=>setOpen(io?null:x['Nro de Factura'])}>
            <span style={{fontFamily:'monospace',fontSize:10,color:'#1543F8',whiteSpace:'nowrap'}}>{x['Nro de Factura']||'—'}</span>
            <div style={{minWidth:0}}><div style={{fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{x['Proyecto']||x['Cliente']}</div><div style={{fontSize:11,color:'#555'}}>{x['Agencia']} · {x['Cliente']} · vence {x['Vencimiento']}</div></div>
            <div style={{textAlign:'right'}}><div style={{fontFamily:'monospace',fontSize:13,fontWeight:500,color:'#1543F8'}}>{fmt(neto)}</div><div style={{fontSize:10,color:'#555'}}>+IVA {fmt(iva)}</div></div>
            <span style={{...S.badge,background:b.bg,color:b.c}}>{bl}</span>
            <span style={{fontSize:11,color:'#555'}}>{io?'▲':'▶'}</span>
          </div>
          {io&&<div style={{borderTop:'0.5px solid #2A2A2A',padding:'14px 16px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
            <div><div style={{fontSize:11,color:'#555',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>Datos</div>
              {[['Tipo',x['Tipo de Factura']||'—'],['N° factura',x['Nro de Factura']||'—'],['Emisión',x['Fecha emision']||'—'],['Plazo',x['Plazo']||'—'],['Vencimiento',x['Vencimiento']||'—'],['CUIT',x['CUIT']||'—']].map(([k,v])=><div key={k} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'0.5px solid #1E1E1E',fontSize:12}}><span style={{color:'#555'}}>{k}</span><span style={{fontFamily:'monospace'}}>{v}</span></div>)}
            </div>
            <div><div style={{fontSize:11,color:'#555',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>Liquidación</div>
              {[['Neto s/IVA',fmt(neto),null],['IVA',fmt(iva),null],['Total',fmt(total),'#1543F8'],['Retenciones',ret>0?'-'+fmt(ret):'—','#E24B4A'],['Disponible',fmt(total-ret),'#1D9E75']].map(([k,v,c])=><div key={k} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'0.5px solid #1E1E1E',fontSize:12}}><span style={{color:'#555'}}>{k}</span><span style={{fontFamily:'monospace',color:c||'inherit'}}>{v}</span></div>)}
            </div>
          </div>}
        </div>
      })}
      {fil.length===0&&<div style={S.nd}>Sin facturas</div>}
    </div>
  </div>
}

function PagosStaff({data}){
  const [open,setOpen]=useState(null),[pag,setPag]=useState({})
  const proj=(data.presupuestos||[]).filter(p=>isAprobado(p)||String(p['Estado']||'').toUpperCase()==='EN CURSO')
  const trabajos=[]
  proj.forEach(p=>{for(let j=1;j<=8;j++){const ped=p['Pedido '+j]||'';const prec=parseMonto(p['Precio '+j]);if(ped&&prec>0)trabajos.push({proyecto:p['Proyecto']||p['Cliente'],num:p['Columna 1'],servicio:ped,monto:prec,pm:p['PM Interno']||'—'})}})
  const byPM={}
  trabajos.forEach(t=>{if(!byPM[t.pm])byPM[t.pm]={pm:t.pm,items:[],total:0};byPM[t.pm].items.push(t);byPM[t.pm].total+=t.monto})
  const pms=Object.values(byPM).sort((a,b)=>b.total-a.total)
  const cols=['#1543F8','#CE2637','#9635AB','#1D9E75','#BA7517']
  const col=n=>cols[n.charCodeAt(0)%cols.length]
  const init=n=>n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
  return <div>
    <div style={S.k4}>
      <K lbl="Servicios activos" val={trabajos.length} sub={proj.length+' proyectos'} c="#1543F8"/>
      <K lbl="Total servicios" val={fmtM(trabajos.reduce((s,t)=>s+t.monto,0))} c="#BA7517"/>
      <K lbl="PMs con trabajo" val={pms.length}/>
      <K lbl="Pagados" val={Object.values(pag).filter(Boolean).length} c="#1D9E75"/>
    </div>
    {pms.length===0&&<div style={S.nd}>Sin proyectos activos con servicios</div>}
    {pms.map((p,i)=>{
      const io=open===p.pm,ip=pag[p.pm],c=col(p.pm)
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
            {ip?<button style={S.fb} onClick={()=>setPag(prev=>({...prev,[p.pm]:false}))}>Desmarcar</button>:<button style={{padding:'7px 16px',borderRadius:6,border:'none',background:'#1543F8',color:'#fff',fontSize:12,fontWeight:500,cursor:'pointer'}} onClick={()=>setPag(prev=>({...prev,[p.pm]:true}))}>Marcar pagado ✓</button>}
          </div>
        </div>}
      </div>
    })}
  </div>
}

function Balance({data}){
  const [mes,setMes]=useState('ABR'),[tc,setTc]=useState(1405)
  const MESES=['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']
  const SU=[{n:'Juan Martin',b:3000000},{n:'Sofia',b:3000000},{n:'Lulu',b:1300000},{n:'Dani',b:1900000},{n:'Tomi',b:1300000},{n:'Contador',b:453750}]
  const GF=[{n:'Alquiler oficina',m:1000000},{n:'Expensas',m:54674},{n:'ABL',m:11793},{n:'Edenor',m:7004},{n:'Metrogas',m:0},{n:'CM',m:1023000}]
  const [se,setSe]=useState({}),[pg,setPg]=useState({}),[ge,setGe]=useState({}),[pgf,setPgf]=useState({}),[vs,setVs]=useState({}),[pgv,setPgv]=useState({}),[nv,setNv]=useState({n:'',m:''})
  const gS=n=>se[mes+n]!==undefined?se[mes+n]:SU.find(s=>s.n===n)?.b||0
  const gG=n=>ge[n]!==undefined?ge[n]:GF.find(g=>g.n===n)?.m||0
  const gV=()=>vs[mes]||[]
  const ts=SU.reduce((s,g)=>s+gS(g.n),0),tf=GF.reduce((s,g)=>s+gG(g.n),0),tv=gV().reduce((s,g)=>s+(parseFloat(g.m)||0),0)
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
        <div style={S.card}><div style={S.ch}>Sueldos equipo</div>
          {SU.map((g,i)=>{const p=pg[mes+g.n];return <div key={i} style={{...S.lr,opacity:p?0.5:1}}>
            <input type="checkbox" checked={!!p} onChange={e=>setPg(prev=>({...prev,[mes+g.n]:e.target.checked}))} style={{accentColor:'#1543F8',flexShrink:0}}/>
            <span style={{flex:1,marginLeft:10,fontSize:13}}>{g.n}</span>
            <span style={{...S.badge,background:p?'#1D9E7520':'#BA751720',color:p?'#1D9E75':'#BA7517',marginRight:8,fontSize:10}}>{p?'Pagado':'Pend.'}</span>
            <input type="number" value={gS(g.n)} onChange={e=>setSe(prev=>({...prev,[mes+g.n]:parseFloat(e.target.value)||0}))} style={{width:100,padding:'4px 6px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontFamily:'monospace',fontSize:12,outline:'none',textAlign:'right'}}/>
          </div>})}
        </div>
        <div style={{...S.card,marginTop:12}}><div style={S.ch}>Gastos variables</div>
          {gV().map((g,i)=>{const p=pgv[mes+i];return <div key={i} style={{...S.lr,opacity:p?0.5:1}}>
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
        <div style={S.card}><div style={S.ch}>Gastos fijos</div>
          {GF.map((g,i)=>{const p=pgf[mes+g.n];return <div key={i} style={{...S.lr,opacity:p?0.5:1}}>
            <input type="checkbox" checked={!!p} onChange={e=>setPgf(prev=>({...prev,[mes+g.n]:e.target.checked}))} style={{accentColor:'#1543F8',flexShrink:0}}/>
            <span style={{flex:1,marginLeft:10,fontSize:13}}>{g.n}</span>
            <span style={{...S.badge,background:p?'#1D9E7520':'#BA751720',color:p?'#1D9E75':'#BA7517',marginRight:8,fontSize:10}}>{p?'Pagado':'Pend.'}</span>
            <input type="number" value={gG(g.n)} onChange={e=>setGe(prev=>({...prev,[g.n]:parseFloat(e.target.value)||0}))} style={{width:100,padding:'4px 6px',borderRadius:6,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontFamily:'monospace',fontSize:12,outline:'none',textAlign:'right'}}/>
          </div>})}
        </div>
        <div style={{...S.card,marginTop:12,padding:'14px 16px'}}>
          <div style={{fontSize:12,fontWeight:500,color:'#555',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:12}}>Resumen {mes}</div>
          {[['Ingresos netos','+'+fmt(ingMes),'#1D9E75'],['Sueldos','-'+fmt(ts),'#E24B4A'],['Gastos fijos','-'+fmt(tf),'#E24B4A'],['Variables','-'+fmt(tv),'#BA7517'],['Resultado',(resultado>=0?'+':'')+fmtM(resultado),resultado>=0?'#1D9E75':'#E24B4A']].map(([k,v,c])=><div key={k} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'0.5px solid #2A2A2A',fontSize:13}}><span style={{color:'#555',fontSize:12}}>{k}</span><span style={{fontFamily:'monospace',color:c,fontWeight:k==='Resultado'?600:400}}>{v}</span></div>)}
        </div>
      </div>
    </div>
  </div>
}

function K({lbl,val,sub,c}){return <div style={S.kpi}><div style={S.kl}>{lbl}</div><div style={{...S.kv,...(c?{color:c}:{})}}>{val}</div>{sub&&<div style={S.ks}>{sub}</div>}</div>}
function Row({cols,vc}){return <div style={S.lr}><span style={{color:'#1543F8',fontFamily:'monospace',fontSize:11,flexShrink:0}}>{cols[0]}</span><span style={{flex:1,marginLeft:10,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cols[1]}</span><span style={{fontFamily:'monospace',fontSize:12,color:vc||'inherit'}}>{cols[2]}</span></div>}

const S={app:{display:'flex',height:'100vh',overflow:'hidden'},sb:{width:220,background:'#161616',borderRight:'1px solid #2A2A2A',display:'flex',flexDirection:'column',flexShrink:0},logo:{fontSize:22,fontWeight:900,background:'linear-gradient(135deg,#1543F8,#9635AB,#CE2637)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'},ls:{fontFamily:"'Azeret Mono',monospace",fontSize:9,color:'#555',letterSpacing:'0.12em',textTransform:'uppercase',marginTop:2},ni:{display:'flex',alignItems:'center',gap:10,padding:'9px 10px',borderRadius:6,cursor:'pointer',color:'#777',fontSize:13,fontWeight:500,transition:'all 0.15s',marginBottom:2,border:'none',background:'transparent',width:'100%',textAlign:'left'},k4:{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:10,marginBottom:12},kpi:{background:'#1E1E1E',borderRadius:8,padding:'11px 13px'},kl:{fontSize:11,color:'#555',marginBottom:4},kv:{fontSize:18,fontWeight:500},ks:{fontSize:10,color:'#555',marginTop:3},card:{background:'#161616',border:'0.5px solid #2A2A2A',borderRadius:10,overflow:'hidden',marginBottom:8},ch:{padding:'10px 14px',background:'#1A1A1A',borderBottom:'0.5px solid #2A2A2A',fontSize:12,fontWeight:500},lr:{display:'flex',alignItems:'center',padding:'9px 14px',borderBottom:'0.5px solid #2A2A2A',fontSize:13},badge:{display:'inline-flex',padding:'2px 8px',borderRadius:3,fontSize:11,whiteSpace:'nowrap'},td:{padding:'9px 12px',borderBottom:'0.5px solid #1E1E1E',fontSize:13},fb:{padding:'5px 12px',borderRadius:6,border:'0.5px solid #333',background:'transparent',color:'#555',fontSize:11,cursor:'pointer'},fa:{background:'#1E1E1E',color:'#F0F0F0',borderColor:'#555'},nd:{textAlign:'center',padding:48,color:'#555',fontSize:13},inp:{width:'100%',padding:'10px 12px',borderRadius:8,border:'0.5px solid #333',background:'#1E1E1E',color:'#F0F0F0',fontSize:14,outline:'none',marginBottom:12},bp:{width:'100%',padding:10,borderRadius:8,border:'none',background:'#1543F8',color:'#fff',fontSize:14,fontWeight:500,cursor:'pointer'},lw:{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#090909'},lb:{background:'#161616',border:'0.5px solid #2A2A2A',borderRadius:16,padding:'40px 36px',width:360,textAlign:'center'},sp:{width:24,height:24,border:'2px solid #1543F820',borderTop:'2px solid #1543F8',borderRadius:'50%',animation:'spin 1s linear infinite',marginTop:16}}

function GS(){return <style>{`@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@300;400;500;700;900&display=swap');*{box-sizing:border-box;margin:0;padding:0}body{background:#090909;color:#F0F0F0;font-family:'Archivo',sans-serif;font-size:14px;overflow:hidden}@keyframes spin{to{transform:rotate(360deg)}}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#333;border-radius:2px}input[type=number]::-webkit-inner-spin-button{opacity:0}`}</style>}
