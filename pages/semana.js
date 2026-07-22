import { useSession, signIn } from 'next-auth/react'
import { useState, useEffect } from 'react'
import Link from 'next/link'

// Página del chequeo semanal — se calcula EN VIVO al abrir (siempre actual).
// Visible para todos los autorizados (Juan, Sofi, equipo). Datos de /api/somos-semana.

const T = {
  bg:'#FBFAF8', surface:'#FFFFFF', surfaceAlt:'#F6F4F1', border:'#ECE9E4',
  ink:'#1A1917', ink2:'#6F6B63', ink3:'#A8A39A',
  brand:'#CE2637', brandSoft:'#FBEAEC', pos:'#1E8A5A', posSoft:'#E7F3EC',
  warn:'#B07712', warnSoft:'#F8EFDC', azul:'#1543F8', azulSoft:'#E9EDFF',
}
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'
const fmt = n => '$' + Math.round(Math.abs(n||0)).toLocaleString('es-AR')
const fmtM = n => { const a=Math.abs(n||0); return (n<0?'-':'')+(a>=1000000?'$'+(a/1000000).toFixed(1)+'M':'$'+Math.round(a/1000).toLocaleString('es-AR')+'K') }

function Card({children, accent}){
  return <div style={{background:T.surface, border:`1px solid ${accent||T.border}`, borderRadius:14, padding:'18px 20px', boxShadow:'0 1px 2px rgba(0,0,0,.03)'}}>{children}</div>
}
function Label({children, color}){
  return <div style={{fontFamily:MONO, fontSize:10.5, textTransform:'uppercase', letterSpacing:.8, color:color||T.ink3, fontWeight:600}}>{children}</div>
}

export default function Semana(){
  const { data:session, status } = useSession()
  const mail = session?.user?.email?.toLowerCase()
  const [d,setD]=useState(null),[err,setErr]=useState(''),[load,setLoad]=useState(false)

  const traer=()=>{ setLoad(true); setErr(''); fetch('/api/somos-semana').then(r=>r.json()).then(j=>{ if(j.error)setErr(j.error); else setD(j); setLoad(false) }).catch(()=>{ setErr('Error de conexión'); setLoad(false) }) }
  useEffect(()=>{ if(mail) traer() /* eslint-disable-next-line */ },[mail])

  const wrap = {minHeight:'100vh', background:T.bg, color:T.ink, fontFamily:'system-ui,-apple-system,Segoe UI,Roboto,sans-serif'}
  if(status==='loading') return <div style={{...wrap, display:'grid', placeItems:'center'}}><span style={{color:T.ink3}}>Cargando…</span></div>
  if(status==='unauthenticated'||!mail) return <div style={{...wrap, display:'grid', placeItems:'center'}}>
    <button onClick={()=>signIn('google',{callbackUrl:'/semana'})} style={{padding:'11px 22px', borderRadius:10, border:'none', background:T.ink, color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer'}}>Ingresar con Google</button>
  </div>

  const hoy = new Date().toLocaleDateString('es-AR',{weekday:'long', day:'2-digit', month:'long'})

  return <div style={wrap}>
    <div style={{maxWidth:940, margin:'0 auto', padding:'0 20px 90px'}}>
      {/* header */}
      <div style={{display:'flex', alignItems:'center', gap:14, padding:'26px 0 20px'}}>
        <div style={{width:11, height:11, borderRadius:'50%', background:T.brand}}/>
        <div style={{flex:1}}>
          <div style={{fontFamily:MONO, fontSize:12, textTransform:'uppercase', letterSpacing:1.4, color:T.ink3}}>Chequeo semanal · Somos Magma</div>
          <h1 style={{margin:'4px 0 0', fontSize:26, fontWeight:800, letterSpacing:-.5}}>Números de la semana</h1>
        </div>
        <Link href="/" style={{fontSize:13, color:T.azul, textDecoration:'none'}}>← app</Link>
      </div>
      <div style={{display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', fontSize:12.5, color:T.ink3, borderTop:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}`, padding:'11px 0', marginBottom:22}}>
        <span style={{textTransform:'capitalize'}}>{hoy}</span>
        <span>· se calcula en vivo del Master Magma cada vez que abrís</span>
        <button onClick={traer} disabled={load} style={{marginLeft:'auto', padding:'6px 13px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:12, cursor:load?'default':'pointer', fontFamily:MONO}}>{load?'actualizando…':'↻ actualizar'}</button>
      </div>

      {err && <Card accent={T.brand}><span style={{color:T.brand}}>⚠️ {err}</span></Card>}
      {!d && !err && <div style={{color:T.ink3, textAlign:'center', padding:40}}>Calculando…</div>}

      {d && <div style={{display:'grid', gap:16}}>
        {/* COBRANZAS */}
        <Card accent={d.cobranzas.sinEmitir>0?'#F0C9CD':T.border}>
          <Label color={T.brand}>💸 Cobranzas y facturación</Label>
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:14, marginTop:14}}>
            <Stat v={fmtM(d.cobranzas.porCobrar)} l={`Por cobrar · ${d.cobranzas.porCobrarN} fact.`}/>
            <Stat v={fmtM(d.cobranzas.sinEmitir)} l={`Sin emitir · ${d.cobranzas.sinEmitirN} filas`} color={T.brand}/>
            <Stat v={fmtM(d.cobranzas.vencidas)} l={`Vencidas · ${d.cobranzas.vencidasN}`} color={T.brand}/>
            <Stat v={fmtM(d.cobranzas.gapMes)} l="Falta facturar este mes" color={T.warn}/>
          </div>
          {d.cobranzas.topSinEmitir.length>0 && <div style={{marginTop:14, paddingTop:12, borderTop:`1px solid ${T.border}`}}>
            <Label>Top sin emitir</Label>
            <div style={{display:'grid', gap:5, marginTop:8}}>
              {d.cobranzas.topSinEmitir.map((f,i)=><div key={i} style={{display:'flex', justifyContent:'space-between', fontSize:13}}>
                <span style={{color:T.ink2}}>{f.cliente} — {f.proyecto||'—'}</span><span style={{fontFamily:MONO, color:T.ink}}>{fmt(f.monto)}</span></div>)}
            </div>
          </div>}
        </Card>

        {/* CHURN */}
        <Card accent={d.churn.length?'#F5E4C6':T.border}>
          <Label color={T.warn}>📉 Clientes que se enfrían</Label>
          {d.churn.length===0 ? <p style={{color:T.pos, fontSize:14, marginTop:12}}>Ningún cliente recurrente frío esta semana ✓</p>
          : <div style={{display:'grid', gap:8, marginTop:12}}>
            {d.churn.map((c,i)=><div key={i} style={{display:'flex', alignItems:'center', gap:12, fontSize:13.5}}>
              <span style={{fontWeight:600, flex:1}}>{c.cliente}</span>
              <span style={{color:T.ink3, fontFamily:MONO, fontSize:12}}>{c.proyectos} proy · {fmt(c.monto)}</span>
              <span style={{fontFamily:MONO, fontSize:12, color:T.warn, minWidth:90, textAlign:'right'}}>hace {c.dias} días</span>
            </div>)}
          </div>}
        </Card>

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
          {/* PRESTAMOS */}
          <Card>
            <Label color={T.azul}>🏦 Préstamos</Label>
            <div style={{marginTop:12}}><Stat v={fmtM(d.prestamos.pendiente)} l="Pendiente cargado"/></div>
            <div style={{marginTop:12, display:'grid', gap:6}}>
              {d.prestamos.proximas.length===0 ? <p style={{fontSize:12.5, color:T.ink3}}>Sin cuotas venciendo en 35 días. Ojo: la solapa PRESTAMOS está incompleta.</p>
              : d.prestamos.proximas.map((p,i)=><div key={i} style={{fontSize:12.5, color:T.ink2}}>⏰ {p.venc} · {p.prestamo} cuota {p.cuota} · <b style={{fontFamily:MONO}}>{fmt(p.monto)}</b></div>)}
            </div>
          </Card>
          {/* ZOMBIS */}
          <Card>
            <Label color={T.warn}>🧟 Presupuestos zombis</Label>
            <div style={{marginTop:12}}><Stat v={String(d.zombis.n)} l={`en espera, evento pasado · ${fmtM(d.zombis.monto)}`}/></div>
            <p style={{fontSize:12.5, color:T.ink3, marginTop:10}}>Hay que cerrarlos: aprobado o desaprobado.</p>
          </Card>
        </div>

        {/* DEUDA JUAN/SOFI */}
        <Card accent="#C9D2F5">
          <Label color={T.azul}>🤝 Lo que Magma les debe a Juan y Sofi</Label>
          <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginTop:14}}>
            <Stat v={fmtM(d.deuda.juan)} l="Juan" color={T.brand}/>
            <Stat v={fmtM(d.deuda.sofi)} l="Sofi" color={T.brand}/>
            <Stat v={fmtM(d.deuda.total)} l="Total, y creciendo" color={T.brand}/>
          </div>
          <p style={{fontSize:12.5, color:T.ink3, marginTop:12}}>Financian la empresa: se cobra cuando Magma limpie sus deudas. Queda a la vista para no olvidarlo.</p>
        </Card>

        {/* SALUD DE DATOS */}
        <Card>
          <Label>🔧 Salud de los datos</Label>
          <div style={{display:'grid', gap:7, marginTop:12, fontSize:13.5}}>
            <Chk ok={d.datos.rotas===0} t={`Celdas #ERROR! en Contactos/Agencias: ${d.datos.rotas}`}/>
            <Chk ok={d.datos.tarSinPers===0&&d.datos.movSinPers===0} t={`Tarjetas sin "Persona": ${d.datos.tarSinPers} resúmenes, ${d.datos.movSinPers} movimientos`}/>
            <Chk ok={d.datos.duplicados.length===0} t={`N° de presupuesto duplicados: ${d.datos.duplicados.length}${d.datos.duplicados.length?' ('+d.datos.duplicados.slice(0,5).map(x=>'#'+x.nro+'×'+x.veces).join(', ')+')':''}`}/>
          </div>
        </Card>

        <p style={{fontSize:11.5, color:T.ink3, textAlign:'center', fontFamily:MONO, marginTop:6, lineHeight:1.6}}>
          Verificado contra el Master Magma en vivo · no usa BALANCE ni Dashboard_data (fórmulas rotas en marzo)<br/>
          actualizado {new Date(d.generado).toLocaleString('es-AR')}
        </p>
      </div>}
    </div>
  </div>
}

function Stat({v,l,color}){
  return <div>
    <div style={{fontFamily:MONO, fontWeight:700, fontSize:23, letterSpacing:-.5, color:color||T.ink, lineHeight:1}}>{v}</div>
    <div style={{fontSize:12, color:T.ink2, marginTop:6, lineHeight:1.35}}>{l}</div>
  </div>
}
function Chk({ok,t}){
  return <div style={{display:'flex', gap:9, alignItems:'baseline'}}>
    <span style={{color:ok?T.pos:T.brand, fontFamily:MONO}}>{ok?'✓':'⚠'}</span>
    <span style={{color:ok?T.ink2:T.ink}}>{t}</span>
  </div>
}
