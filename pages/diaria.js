import { useSession, signIn } from 'next-auth/react'
import { useState, useEffect } from 'react'
import Link from 'next/link'

// La diaria — lo que hay que hacer HOY. Se calcula en vivo al abrir (cobros, proyectos, staff)
// y trae el radar del contador que dejó scripts/diaria.mjs en la solapa DIARIA (8:00 y 15:00).
// Es la página a la que apunta el botón del mail de la diaria. Datos de /api/diaria.

const T = {
  bg:'#FBFAF8', surface:'#FFFFFF', surfaceAlt:'#F6F4F1', border:'#ECE9E4',
  ink:'#1A1917', ink2:'#6F6B63', ink3:'#A8A39A',
  brand:'#CE2637', brandSoft:'#FBEAEC', pos:'#1E8A5A', posSoft:'#E7F3EC',
  warn:'#B07712', warnSoft:'#F8EFDC', azul:'#1543F8', azulSoft:'#E9EDFF',
}
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'
const fmt = n => '$' + Math.round(Math.abs(n||0)).toLocaleString('es-AR')
const fmtM = n => { const a=Math.abs(n||0); return (n<0?'-':'')+(a>=1000000?'$'+(a/1000000).toFixed(1)+'M':'$'+Math.round(a/1000).toLocaleString('es-AR')+'K') }
// "**negrita**" del texto del brief → <b>
const B = t => String(t||'').split(/(\*\*[^*]+\*\*)/g).map((s,i)=> s.startsWith('**') ? <b key={i}>{s.slice(2,-2)}</b> : s)

function Card({children, accent}){
  return <div style={{background:T.surface, border:`1px solid ${accent||T.border}`, borderRadius:14, padding:'18px 20px', boxShadow:'0 1px 2px rgba(0,0,0,.03)'}}>{children}</div>
}
function Label({children, color}){
  return <div style={{fontFamily:MONO, fontSize:10.5, textTransform:'uppercase', letterSpacing:.8, color:color||T.ink3, fontWeight:600}}>{children}</div>
}
function Stat({v,l,color}){
  return <div>
    <div style={{fontFamily:MONO, fontWeight:700, fontSize:23, letterSpacing:-.5, color:color||T.ink, lineHeight:1}}>{v}</div>
    <div style={{fontSize:12, color:T.ink2, marginTop:6, lineHeight:1.35}}>{l}</div>
  </div>
}
function Pill({children, color, soft}){
  return <span style={{fontFamily:MONO, fontSize:11, padding:'2px 8px', borderRadius:999, background:soft, color, whiteSpace:'nowrap', fontWeight:600}}>{children}</span>
}
const pillVto = e => e.dias===null ? <Pill color={T.ink2} soft={T.surfaceAlt}>{e.vto||'sin fecha'}</Pill>
  : e.dias<0 ? <Pill color={T.brand} soft={T.brandSoft}>venció {e.vto} · hace {-e.dias}d</Pill>
  : e.dias===0 ? <Pill color={T.brand} soft={T.brandSoft}>🔥 VENCE HOY</Pill>
  : e.dias<=3 ? <Pill color={T.brand} soft={T.brandSoft}>🔥 en {e.dias}d · {e.vto}</Pill>
  : e.dias<=10 ? <Pill color={T.warn} soft={T.warnSoft}>en {e.dias}d · {e.vto}</Pill>
  : <Pill color={T.ink2} soft={T.surfaceAlt}>{e.vto}</Pill>

function Veps({titulo, lista, vacio}){
  return <div style={{marginTop:14}}>
    <div style={{fontSize:13.5, fontWeight:600, marginBottom:6}}>{titulo} <span style={{color:T.ink3, fontWeight:400}}>({lista.length})</span></div>
    {lista.length===0 ? <div style={{fontSize:13, color:T.ink3}}>{vacio}</div>
    : <div style={{display:'grid', gap:6}}>
      {lista.map((e,i)=><div key={i} style={{display:'flex', flexWrap:'wrap', alignItems:'center', gap:'4px 10px', fontSize:13.5, padding:'7px 0', borderTop:i?`1px solid ${T.border}`:'none'}}>
        <span style={{fontWeight:600, minWidth:60}}>{e.titular}</span>
        <span style={{color:T.ink2, fontFamily:MONO, fontSize:12}}>{e.tipo} {e.periodo}</span>
        {pillVto(e)}
        <span style={{color:T.ink3, fontSize:12.5, flexBasis:'100%'}}>{e.asunto}</span>
      </div>)}
    </div>}
  </div>
}

export default function Diaria(){
  const { data:session, status } = useSession()
  const mail = session?.user?.email?.toLowerCase()
  const [d,setD]=useState(null),[err,setErr]=useState(''),[load,setLoad]=useState(false)

  const traer=()=>{ setLoad(true); setErr(''); fetch('/api/diaria').then(r=>r.json()).then(j=>{ if(j.error)setErr(j.error); else setD(j); setLoad(false) }).catch(()=>{ setErr('Error de conexión'); setLoad(false) }) }
  useEffect(()=>{ if(mail) traer() /* eslint-disable-next-line */ },[mail])

  const wrap = {minHeight:'100vh', background:T.bg, color:T.ink, fontFamily:'system-ui,-apple-system,Segoe UI,Roboto,sans-serif'}
  if(status==='loading') return <div style={{...wrap, display:'grid', placeItems:'center'}}><span style={{color:T.ink3}}>Cargando…</span></div>
  if(status==='unauthenticated'||!mail) return <div style={{...wrap, display:'grid', placeItems:'center'}}>
    <button onClick={()=>signIn('google',{callbackUrl:'/diaria'})} style={{padding:'11px 22px', borderRadius:10, border:'none', background:T.ink, color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer'}}>Ingresar con Google</button>
  </div>

  const b = d?.brief, c = d?.contador
  const hora = new Date().getHours()
  const tarde = hora >= 12

  return <div style={wrap}>
    <div style={{maxWidth:940, margin:'0 auto', padding:'0 20px 90px'}}>
      <div style={{display:'flex', alignItems:'center', gap:14, padding:'26px 0 20px'}}>
        <div style={{width:11, height:11, borderRadius:'50%', background:T.brand}}/>
        <div style={{flex:1}}>
          <div style={{fontFamily:MONO, fontSize:12, textTransform:'uppercase', letterSpacing:1.4, color:T.ink3}}>{tarde ? 'La tarde' : 'La diaria'} · Somos Magma</div>
          <h1 style={{margin:'4px 0 0', fontSize:26, fontWeight:800, letterSpacing:-.5, textTransform:'capitalize'}}>{b ? b.titulo : 'Hoy'}</h1>
        </div>
        <Link href="/semana" style={{fontSize:13, color:T.azul, textDecoration:'none'}}>semana</Link>
        <Link href="/lunes" style={{fontSize:13, color:T.azul, textDecoration:'none'}}>lunes</Link>
        <Link href="/" style={{fontSize:13, color:T.azul, textDecoration:'none'}}>← app</Link>
      </div>
      <div style={{display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', fontSize:12.5, color:T.ink3, borderTop:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}`, padding:'11px 0', marginBottom:22}}>
        <span>Cobros, proyectos y staff se calculan en vivo al abrir{c ? ` · el contador es del radar de las ${c.hora} (${c.aviso})` : ''}</span>
        <button onClick={traer} disabled={load} style={{marginLeft:'auto', padding:'6px 13px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:12, cursor:load?'default':'pointer', fontFamily:MONO}}>{load?'actualizando…':'↻ actualizar'}</button>
      </div>

      {err && <Card accent={T.brand}><span style={{color:T.brand}}>⚠️ {err}</span></Card>}
      {!d && !err && <div style={{color:T.ink3, textAlign:'center', padding:40}}>Calculando…</div>}

      {b && <div style={{display:'grid', gap:16}}>
        {tarde && <div style={{background:T.brandSoft, borderLeft:`3px solid ${T.brand}`, padding:'10px 14px', borderRadius:'0 10px 10px 0', fontSize:13.5, color:T.ink}}>
          Segundo aviso del día: esto es lo que sigue abierto. Lo que ya resolviste a la mañana no aparece más. Lo que quede, se cierra antes de irte o pasa a mañana a las 8.
        </div>}

        {/* ATENCIÓN HOY */}
        <Card accent={b.alertas.length?'#F0C9CD':T.border}>
          <Label color={T.brand}>🚨 Atención hoy</Label>
          {b.alertas.length===0 ? <p style={{color:T.pos, fontSize:14, marginTop:12}}>Sin nada crítico, día tranquilo ✓</p>
          : <div style={{display:'grid', gap:9, marginTop:12}}>
            {b.alertas.map((a,i)=><div key={i} style={{fontSize:14, lineHeight:1.45}}>{B(a)}</div>)}
          </div>}
        </Card>

        {/* COMERCIAL — a quién llamar hoy. Sale de las columnas de seguimiento de PRESUPUESTOS (DQ-DS). */}
        {b.comercial && <Card accent={b.comercial.urgentesN?'#F0C9CD':T.border}>
          <Label color={T.brand}>📞 Comercial · hoy te toca llamar</Label>
          {!b.comercial.porLlamarN
            ? <p style={{color:T.pos, fontSize:14, marginTop:12}}>Nadie espera tu llamado ✓ · {b.comercial.vivosN} presupuestos vivos por {fmt(b.comercial.vivosMonto)}, todos con seguimiento al día.</p>
            : <>
              <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:14, marginTop:14}}>
                <Stat v={b.comercial.porLlamarN} l={`esperan un llamado · ${fmtM(b.comercial.porLlamarMonto)}`} color={T.brand}/>
                <Stat v={b.comercial.urgentesN} l={`con el evento en ${b.comercial.diasUrgente} días o menos · ${fmtM(b.comercial.urgentesMonto)}`} color={b.comercial.urgentesN?T.brand:T.ink}/>
                <Stat v={b.comercial.vivosN} l={`vivos en total · ${fmtM(b.comercial.vivosMonto)}`}/>
              </div>
              {Object.keys(b.comercial.porPM).length>1 && <div style={{display:'flex', gap:8, flexWrap:'wrap', marginTop:12}}>
                {Object.entries(b.comercial.porPM).sort((a,c)=>c[1].monto-a[1].monto).map(([pm,v])=><Pill key={pm} color={T.ink2} soft={T.surfaceAlt}>{pm} · {v.n} · {fmtM(v.monto)}</Pill>)}
              </div>}
              <div style={{display:'grid', gap:0, marginTop:12, borderTop:`1px solid ${T.border}`}}>
                {b.comercial.lista.map((p,i)=><div key={i} style={{display:'flex', flexWrap:'wrap', alignItems:'center', gap:'4px 10px', fontSize:13.5, padding:'9px 0', borderBottom:`1px solid ${T.border}`}}>
                  <span style={{fontFamily:MONO, fontWeight:700, minWidth:96}}>{fmt(p.monto)}</span>
                  <a href={`/?t=${encodeURIComponent(p.nro)}`} style={{color:T.azul, fontFamily:MONO, fontSize:12, textDecoration:'none'}} title="Abrir en Trabajos y anotar el contacto">#{p.nro}</a>
                  <span style={{fontWeight:600}}>{p.cliente}</span>
                  <span style={{color:T.ink2, flex:1, minWidth:120}}>{p.proyecto}</span>
                  {p.urgente ? <Pill color={T.brand} soft={T.brandSoft}>🔴 evento en {p.diasEvento}d · {p.evento}</Pill> : <Pill color={T.ink2} soft={T.surfaceAlt}>evento {p.evento} · en {p.diasEvento}d</Pill>}
                  {p.nunca ? <Pill color={T.warn} soft={T.warnSoft}>sin llamar{p.diasPresu!==null?` · presu hace ${p.diasPresu}d`:''}</Pill> : <Pill color={T.ink2} soft={T.surfaceAlt}>último contacto hace {p.diasUltimo}d</Pill>}
                  {p.pm && <span style={{color:T.ink3, fontSize:12}}>PM {p.pm}</span>}
                  {(p.paso||p.contacto) && <span style={{color:T.ink2, fontSize:12.5, flexBasis:'100%'}}>{p.paso ? <>→ {p.paso}{p.contacto?' · ':''}</> : null}{p.contacto}</span>}
                </div>)}
              </div>
              {b.comercial.porLlamarN>b.comercial.lista.length && <p style={{fontSize:12.5, color:T.ink3, marginTop:8}}>…y {b.comercial.porLlamarN-b.comercial.lista.length} más en la app.</p>}
              <p style={{fontSize:12, color:T.ink3, marginTop:12, lineHeight:1.5}}>{b.comercial.hayColumnas
                ? <>Cuando hables, anotalo con el 📞 de la fila en Trabajos → En espera: el reloj arranca de nuevo y mañana no aparece. "Toca" = pasaron {b.comercial.diasSeguimiento} días sin noticias, o llegó la fecha que dejaste en "Seguir el".</>
                : <>⚠️ PRESUPUESTOS no tiene las columnas de seguimiento: correr scripts/presupuestos-columnas-seguimiento.mjs --escribir.</>}</p>
            </>}
        </Card>}

        {/* PRÓXIMOS 7 DÍAS */}
        <Card accent={b.en7SinStaffN?'#F5E4C6':T.border}>
          <Label color={T.warn}>📅 Próximos 7 días · {b.en7N} proyectos · {b.en7SinStaffN} sin staff</Label>
          {b.en7.length===0 ? <p style={{color:T.ink3, fontSize:13.5, marginTop:12}}>Nada agendado.</p>
          : <div style={{display:'grid', gap:0, marginTop:10}}>
            {b.en7.map((p,i)=><div key={i} style={{display:'flex', flexWrap:'wrap', alignItems:'center', gap:'4px 10px', fontSize:13.5, padding:'8px 0', borderTop:i?`1px solid ${T.border}`:'none'}}>
              <span style={{fontFamily:MONO, fontWeight:700, minWidth:44}}>{p.fecha}</span>
              <span style={{color:T.ink3, fontFamily:MONO, fontSize:12}}>#{p.nro}</span>
              <span style={{fontWeight:600}}>{p.cliente}</span>
              <span style={{color:T.ink2, flex:1, minWidth:120}}>{p.proyecto}</span>
              {p.pm && <span style={{color:T.ink3, fontSize:12}}>PM {p.pm}</span>}
              {p.sinStaff ? <Pill color={T.brand} soft={T.brandSoft}>🔴 sin staff</Pill> : p.staffParcial ? <Pill color={T.warn} soft={T.warnSoft}>🟡 staff {p.conStaff}/{p.pedidos}</Pill> : <Pill color={T.pos} soft={T.posSoft}>staff ✓</Pill>}
            </div>)}
          </div>}
        </Card>

        {/* COBROS */}
        <Card accent={b.cobros.vencidasN?'#F0C9CD':T.border}>
          <Label color={T.brand}>💵 Cobros</Label>
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:14, marginTop:14}}>
            <Stat v={fmtM(b.cobros.porCobrar)} l={`Por cobrar · ${b.cobros.porCobrarN} facturas`}/>
            <Stat v={fmtM(b.cobros.vencidas)} l={`Vencidas sin cobrar · ${b.cobros.vencidasN}`} color={T.brand}/>
            <Stat v={fmtM(b.cobros.vencenSemana)} l={`Vencen esta semana · ${b.cobros.vencenSemanaN}`} color={T.warn}/>
            <Stat v={fmtM(b.cobros.atrasadas)} l={`+30 días del evento · ${b.cobros.atrasadasN}`} color={T.warn}/>
          </div>
          {b.cobros.vencidasLista.length>0 && <div style={{marginTop:14, paddingTop:12, borderTop:`1px solid ${T.border}`}}>
            <Label>Vencidas, la más vieja primero · una llamada por día</Label>
            <div style={{display:'grid', gap:6, marginTop:8}}>
              {b.cobros.vencidasLista.map((f,i)=><div key={i} style={{display:'flex', flexWrap:'wrap', gap:'2px 10px', alignItems:'baseline', fontSize:13.5}}>
                <span style={{fontFamily:MONO, color:T.brand, fontSize:12, minWidth:64}}>hace {f.dias}d</span>
                <span style={{fontWeight:600}}>{f.cliente}</span>
                <span style={{color:T.ink2, flex:1, minWidth:120}}>{f.proyecto}{f.nroFc?` · Fc ${f.nroFc}`:''}</span>
                <span style={{fontFamily:MONO}}>{fmt(f.monto)}</span>
              </div>)}
            </div>
          </div>}
          {b.cobros.vencenLista.length>0 && <div style={{marginTop:14, paddingTop:12, borderTop:`1px solid ${T.border}`}}>
            <Label>Vencen esta semana</Label>
            <div style={{display:'grid', gap:6, marginTop:8}}>
              {b.cobros.vencenLista.map((f,i)=><div key={i} style={{display:'flex', flexWrap:'wrap', gap:'2px 10px', alignItems:'baseline', fontSize:13.5}}>
                <span style={{fontFamily:MONO, color:T.warn, fontSize:12, minWidth:64}}>{f.venc}</span>
                <span style={{fontWeight:600}}>{f.cliente}</span>
                <span style={{color:T.ink2, flex:1, minWidth:120}}>{f.proyecto}</span>
                <span style={{fontFamily:MONO}}>{fmt(f.monto)}</span>
              </div>)}
            </div>
          </div>}
        </Card>

        {/* CONTADOR */}
        <Card accent={c && (c.impagos.length || c.sinNoticias.some(e=>e.dias!==null && e.dias<=3)) ? '#F0C9CD' : T.border}>
          <Label color={T.azul}>🧾 El contador (Diego)</Label>
          {!c ? <p style={{fontSize:13.5, color:T.ink3, marginTop:12}}>Todavía no hay radar del contador cargado: lo escribe el mail de las 8 y el de las 15.</p>
          : <>
            <Veps titulo="🔴 Impago según Diego y sin confirmación tuya" lista={c.impagos} vacio="Ninguno."/>
            <Veps titulo='🟡 Sin noticias: el VEP llegó y nadie dijo "pagado"' lista={c.sinNoticias} vacio="Ninguno."/>
            <div style={{marginTop:14}}>
              <div style={{fontSize:13.5, fontWeight:600, marginBottom:6}}>📩 Te pidió algo y no contestaste <span style={{color:T.ink3, fontWeight:400}}>({c.pendientes.length})</span></div>
              {c.pendientes.length===0 ? <div style={{fontSize:13, color:T.ink3}}>Nada pendiente.</div>
              : c.pendientes.map((e,i)=><div key={i} style={{fontSize:13.5, padding:'5px 0', color:T.ink2}}><span style={{fontFamily:MONO, fontSize:12}}>{e.fecha}</span> · <b style={{color:T.ink}}>{e.asunto}</b> → {e.resumen}</div>)}
            </div>
            <p style={{fontSize:12, color:T.ink3, marginTop:12, lineHeight:1.5}}>Sale del mail de Diego ({c.mails} mails leídos a las {c.hora} del {c.fecha}), no del banco: si pagaste y avisaste por WhatsApp, acá sigue figurando. Chequear en ARCA antes de pagar dos veces.</p>
          </>}
        </Card>

        {/* PIPELINE + STAFF */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:16}}>
          <Card>
            <Label>📊 Pipeline {b.anio}</Label>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginTop:12}}>
              <Stat v={fmtM(b.pipeline.esperaMonto)} l={`En espera · ${b.pipeline.esperaN} presus`} color={T.warn}/>
              <Stat v={fmtM(b.pipeline.aprobMonto)} l={`Aprobado · ${b.pipeline.aprobN} presus`} color={T.pos}/>
            </div>
            {b.pipeline.sinProyectoN>0 && <p style={{fontSize:12.5, color:T.brand, marginTop:10}}>⚠️ {b.pipeline.sinProyectoN} aprobados sin proyecto cargado ({fmt(b.pipeline.sinProyectoMonto)})</p>}
          </Card>
          <Card>
            <Label>👥 Staff</Label>
            {b.staff.sinCBU.length===0 ? <p style={{color:T.pos, fontSize:13.5, marginTop:12}}>Todos los activos del mes tienen CBU ✓</p>
            : <div style={{display:'grid', gap:5, marginTop:12, fontSize:13.5}}>{b.staff.sinCBU.map((n,i)=><div key={i}>⚠ {n} — falta CBU</div>)}</div>}
          </Card>
        </div>

        <p style={{fontSize:11.5, color:T.ink3, textAlign:'center', fontFamily:MONO, marginTop:6, lineHeight:1.6}}>
          Calculado en vivo contra el Master Magma · actualizado {new Date(d.generado).toLocaleString('es-AR')}
        </p>
      </div>}
    </div>
  </div>
}
