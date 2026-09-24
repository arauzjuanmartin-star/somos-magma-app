import { useSession, signIn } from 'next-auth/react'
import { useState, useEffect } from 'react'
import Link from 'next/link'

// El lunes de Magma — la reunión semanal de los socios (30 minutos). La app arma el reporte del sheet:
// agenda, lo de Juan, lo de Sofi, lo de los chicos. Nadie escribe nada, salvo los acuerdos al final,
// que se guardan en la solapa SEMANAL y vuelven a aparecer el lunes siguiente. Datos de /api/lunes.
// Es la página a la que apunta el mail de los lunes (8:10, desde Vercel).

const T = {
  bg:'#FBFAF8', surface:'#FFFFFF', surfaceAlt:'#F6F4F1', border:'#ECE9E4',
  ink:'#1A1917', ink2:'#6F6B63', ink3:'#A8A39A',
  brand:'#CE2637', brandSoft:'#FBEAEC', pos:'#1E8A5A', posSoft:'#E7F3EC',
  warn:'#B07712', warnSoft:'#F8EFDC', azul:'#1543F8', azulSoft:'#E9EDFF',
}
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'
const fmt = n => '$' + Math.round(Math.abs(n||0)).toLocaleString('es-AR')
const fmtM = n => { const a=Math.abs(n||0); return (n<0?'-':'')+(a>=1000000?'$'+(a/1000000).toFixed(1)+'M':'$'+Math.round(a/1000).toLocaleString('es-AR')+'K') }
const nm = c => `${fmtM(c.monto)} · ${c.n}`

function Card({children, accent, style}){
  return <div style={{background:T.surface, border:`1px solid ${accent||T.border}`, borderRadius:14, padding:'18px 20px', boxShadow:'0 1px 2px rgba(0,0,0,.03)', ...style}}>{children}</div>
}
function Label({children, color}){
  return <div style={{fontFamily:MONO, fontSize:10.5, textTransform:'uppercase', letterSpacing:.8, color:color||T.ink3, fontWeight:600}}>{children}</div>
}
function Stat({v,l,color}){
  return <div>
    <div style={{fontFamily:MONO, fontWeight:700, fontSize:21, letterSpacing:-.5, color:color||T.ink, lineHeight:1}}>{v}</div>
    <div style={{fontSize:12, color:T.ink2, marginTop:6, lineHeight:1.35}}>{l}</div>
  </div>
}
function Pill({children, color, soft}){
  return <span style={{fontFamily:MONO, fontSize:11, padding:'2px 8px', borderRadius:999, background:soft, color, whiteSpace:'nowrap', fontWeight:600}}>{children}</span>
}
function Fila({children, dim}){
  return <div style={{display:'flex', flexWrap:'wrap', alignItems:'baseline', gap:'2px 8px', fontSize:13, color:dim?T.ink2:T.ink, padding:'4px 0', borderTop:`1px solid ${T.border}`}}>{children}</div>
}
function Bloque({titulo, children}){
  return <div style={{marginTop:14, paddingTop:10, borderTop:`1px solid ${T.border}`}}>
    <div style={{fontSize:13.5, fontWeight:700, marginBottom:6}}>{titulo}</div>{children}
  </div>
}

// Una persona (socio o PM del equipo): plata, comercial, eventos, edición. Compacto = para los chicos.
function Persona({p, compacto}){
  const e = p.edicion
  const rojo = p.vencidas.n || p.vienenSinStaff || e.vencidas
  return <Card accent={rojo ? '#F0C9CD' : T.border}>
    <div style={{display:'flex', alignItems:'baseline', gap:10}}>
      <h2 style={{margin:0, fontSize:20, fontWeight:800, letterSpacing:-.3}}>{p.pm}</h2>
      <span style={{fontSize:12, color:T.ink3}}>{compacto ? 'PM' : 'lo que tiene en la mesa'}</span>
    </div>
    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))', gap:12, marginTop:14}}>
      <Stat v={fmtM(p.cobrado.monto)} l={`cobró la semana pasada · ${p.cobrado.n}`} color={p.cobrado.monto?T.pos:T.ink3}/>
      <Stat v={fmtM(p.vencidas.monto)} l={`vencidas sin cobrar · ${p.vencidas.n}`} color={p.vencidas.n?T.brand:T.ink3}/>
      <Stat v={String(p.porLlamar.n)} l={`por llamar · ${fmtM(p.porLlamar.monto)}`} color={p.porLlamar.n?T.warn:T.ink3}/>
      <Stat v={String(e.vencidas)} l={`ediciones pasadas de fecha · ${e.abiertas} abiertas`} color={e.vencidas?T.brand:T.ink3}/>
    </div>

    <Bloque titulo="💸 Plata">
      <div style={{fontSize:13, color:T.ink2}}>Por cobrar {nm(p.porCobrar)}{p.sinEmitir.n ? <> · <b style={{color:T.brand}}>sin factura {nm(p.sinEmitir)}</b></> : null}</div>
      {p.vencidasLista.map((f,i)=><Fila key={i}><span style={{fontWeight:600}}>{f.cliente}</span><span style={{color:T.ink3}}>{f.proyecto}</span><span style={{fontFamily:MONO}}>{fmt(f.monto)}</span><Pill color={T.brand} soft={T.brandSoft}>venció hace {f.dias}d</Pill></Fila>)}
    </Bloque>

    <Bloque titulo="📞 Comercial">
      <div style={{fontSize:13, color:T.ink2}}>{p.enviados.n} enviados por {fmtM(p.enviados.monto)} · <b style={{color:p.aprobados.n?T.pos:T.ink2}}>{p.aprobados.n} aprobados por {fmtM(p.aprobados.monto)}</b> · {p.espera.n} en espera por {fmtM(p.espera.monto)}{p.zombis.n ? ` · ${p.zombis.n} zombis` : ''}</div>
      {p.aprobadosLista.map((x,i)=><Fila key={'a'+i} dim><span style={{color:T.pos}}>✓</span><span>#{x.nro} {x.cliente}</span><span style={{fontFamily:MONO}}>{fmt(x.monto)}</span></Fila>)}
      {p.porLlamarLista.map((x,i)=><Fila key={'l'+i}><span style={{color:T.warn}}>📞</span><span style={{fontWeight:600}}>#{x.nro} {x.cliente}</span><span style={{fontFamily:MONO}}>{fmt(x.monto)}</span><span style={{color:T.ink3}}>evento {x.evento}{x.urgente?' 🔴':''}</span></Fila>)}
      {p.porLlamar.n > p.porLlamarLista.length && <div style={{fontSize:12, color:T.ink3, marginTop:4}}>…y {p.porLlamar.n - p.porLlamarLista.length} más en Trabajos → En espera → 📞 Por llamar</div>}
    </Bloque>

    {!compacto && <Bloque titulo="📅 Eventos">
      <div style={{fontSize:13, color:T.ink2}}>{p.hechos.n} hechos la semana pasada por {fmtM(p.hechos.monto)} · {p.vienen.n} esta semana{p.vienenSinStaff ? <b style={{color:T.brand}}> · {p.vienenSinStaff} sin staff</b> : null}</div>
      {p.vienenLista.map((x,i)=><Fila key={i}><span style={{fontFamily:MONO, color:T.ink2}}>{x.fecha}</span><span style={{fontWeight:600}}>#{x.nro} {x.cliente}</span><span style={{color:T.ink3}}>{x.proyecto}</span>{x.sinStaff && <Pill color={T.brand} soft={T.brandSoft}>SIN STAFF</Pill>}</Fila>)}
    </Bloque>}

    <Bloque titulo="✂️ Edición">
      <div style={{fontSize:13, color:T.ink2}}>{e.abiertas} abiertas · {e.paraRevisar ? <b style={{color:T.warn}}>{e.paraRevisar} esperan {compacto?'su':'tu'} OK</b> : '0 esperan OK'} · {e.sinMaterial} sin material · {e.terminadas} terminadas la semana pasada</div>
      {e.vencidasLista.map((x,i)=><Fila key={i}><span style={{fontWeight:600}}>{x.cliente}</span><span style={{color:T.ink3}}>{x.entregable} · {x.editor} · {x.estado}</span><Pill color={T.brand} soft={T.brandSoft}>hace {x.dias}d</Pill></Fila>)}
    </Bloque>
  </Card>
}

export default function Lunes(){
  const { data:session, status } = useSession()
  const mail = session?.user?.email?.toLowerCase()
  const [d,setD]=useState(null),[err,setErr]=useState(''),[load,setLoad]=useState(false)
  const [acuerdos,setAcuerdos]=useState(''),[guardando,setGuardando]=useState(false),[guardado,setGuardado]=useState('')

  const traer=()=>{ setLoad(true); setErr(''); fetch('/api/lunes').then(r=>r.json()).then(j=>{ if(j.error)setErr(j.error); else { setD(j); setAcuerdos(j.acuerdos?.actual||'') } setLoad(false) }).catch(()=>{ setErr('Error de conexión'); setLoad(false) }) }
  useEffect(()=>{ if(mail) traer() /* eslint-disable-next-line */ },[mail])
  const guardar=()=>{ setGuardando(true); setGuardado(''); fetch('/api/lunes',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({acuerdos})}).then(r=>r.json()).then(j=>{ setGuardando(false); setGuardado(j.error ? '⚠️ '+j.error : '✓ guardado en el sheet (SEMANAL)') }).catch(()=>{ setGuardando(false); setGuardado('⚠️ no se pudo guardar') }) }

  const wrap = {minHeight:'100vh', background:T.bg, color:T.ink, fontFamily:'system-ui,-apple-system,Segoe UI,Roboto,sans-serif'}
  if(status==='loading') return <div style={{...wrap, display:'grid', placeItems:'center'}}><span style={{color:T.ink3}}>Cargando…</span></div>
  if(status==='unauthenticated'||!mail) return <div style={{...wrap, display:'grid', placeItems:'center'}}>
    <button onClick={()=>signIn('google',{callbackUrl:'/lunes'})} style={{padding:'11px 22px', borderRadius:10, border:'none', background:T.ink, color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer'}}>Ingresar con Google</button>
  </div>

  const L = d?.lunes, m = L?.magma
  return <div style={wrap}>
    <div style={{maxWidth:1040, margin:'0 auto', padding:'0 20px 90px'}}>
      <div style={{display:'flex', alignItems:'center', gap:14, padding:'26px 0 20px'}}>
        <div style={{width:11, height:11, borderRadius:'50%', background:T.brand}}/>
        <div style={{flex:1}}>
          <div style={{fontFamily:MONO, fontSize:12, textTransform:'uppercase', letterSpacing:1.4, color:T.ink3}}>Reunión de los lunes · Juan + Sofi · 30 minutos</div>
          <h1 style={{margin:'4px 0 0', fontSize:26, fontWeight:800, letterSpacing:-.5}}>El lunes de Magma{L ? <span style={{color:T.ink3, fontWeight:500}}> · {L.titulo.toLowerCase()}</span> : null}</h1>
        </div>
        <Link href="/diaria" style={{fontSize:13, color:T.azul, textDecoration:'none'}}>diaria</Link>
        <Link href="/semana" style={{fontSize:13, color:T.azul, textDecoration:'none'}}>semana</Link>
        <Link href="/" style={{fontSize:13, color:T.azul, textDecoration:'none'}}>← app</Link>
      </div>
      <div style={{display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', fontSize:12.5, color:T.ink3, borderTop:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}`, padding:'11px 0', marginBottom:22}}>
        <span>Se calcula en vivo del Master Magma. "La semana pasada" es la última completa, de lunes a domingo. El reparto es por la columna PM del sheet.</span>
        <button onClick={traer} disabled={load} style={{marginLeft:'auto', padding:'6px 13px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:12, cursor:load?'default':'pointer', fontFamily:MONO}}>{load?'actualizando…':'↻ actualizar'}</button>
      </div>

      {err && <Card accent={T.brand}><span style={{color:T.brand}}>⚠️ {err}</span></Card>}
      {!d && !err && <div style={{color:T.ink3, textAlign:'center', padding:40}}>Armando el reporte…</div>}

      {L && <div style={{display:'grid', gap:16}}>
        {/* AGENDA */}
        <Card accent="#F0C9CD">
          <Label color={T.brand}>🗓 Los 30 minutos — en este orden</Label>
          <ol style={{margin:'12px 0 0', padding:'0 0 0 22px', display:'grid', gap:10}}>
            {L.agenda.map((a,i)=><li key={i} style={{fontSize:14}}>
              <b>{a.tema}</b>{a.pregunta ? <span style={{color:T.ink2}}> — {a.pregunta}</span> : null}
              {a.detalle.length>0 && <div style={{fontSize:12.5, color:T.ink2, marginTop:3, display:'grid', gap:2}}>{a.detalle.map((x,k)=><span key={k}>· {x}</span>)}</div>}
            </li>)}
            {L.agenda.length===0 && <li style={{color:T.pos}}>Nada urgente esta semana ✓</li>}
          </ol>
        </Card>

        {/* ACUERDOS */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))', gap:16}}>
          <Card>
            <Label>✅ Acuerdos del lunes pasado ({L.semana.claveAnterior})</Label>
            {d.acuerdos?.anterior
              ? <><div style={{whiteSpace:'pre-wrap', fontSize:14, marginTop:10, lineHeight:1.5}}>{d.acuerdos.anterior}</div><p style={{fontSize:12.5, color:T.ink3, marginTop:10}}>¿Se hicieron? Lo que no, se decide hoy: se hace esta semana o se suelta.</p></>
              : <p style={{fontSize:13, color:T.ink3, marginTop:10}}>No quedó nada anotado la semana pasada.</p>}
          </Card>
          <Card accent={T.azulSoft}>
            <Label color={T.azul}>✍️ Acuerdos de hoy ({L.semana.clave}) — quién hace qué, para cuándo</Label>
            <textarea value={acuerdos} onChange={e=>setAcuerdos(e.target.value)} disabled={!d.puedeEscribir} rows={6} placeholder={"Uno por línea. Ej:\nJuan llama a Ostara por las 3 vencidas, jueves\nSofi manda el presu de Ana con seña 30%"} style={{width:'100%', boxSizing:'border-box', marginTop:10, padding:'10px 12px', borderRadius:10, border:`1px solid ${T.border}`, fontSize:14, fontFamily:'inherit', lineHeight:1.5, resize:'vertical', background:d.puedeEscribir?T.surface:T.surfaceAlt}}/>
            <div style={{display:'flex', alignItems:'center', gap:12, marginTop:8}}>
              <button onClick={guardar} disabled={guardando||!d.puedeEscribir} style={{padding:'9px 16px', borderRadius:9, border:'none', background:T.azul, color:'#fff', fontSize:13.5, fontWeight:600, cursor:'pointer', opacity:(guardando||!d.puedeEscribir)?.6:1}}>{guardando?'guardando…':'Guardar acuerdos'}</button>
              <span style={{fontSize:12.5, color:guardado.startsWith('⚠️')?T.brand:T.pos}}>{guardado}</span>
              {!d.puedeEscribir && <span style={{fontSize:12.5, color:T.ink3}}>modo lectura</span>}
            </div>
            <p style={{fontSize:12, color:T.ink3, marginTop:8}}>Queda en la solapa SEMANAL y vuelve a aparecer el lunes que viene, a la izquierda.</p>
          </Card>
        </div>

        {/* MAGMA */}
        <Card>
          <Label color={T.brand}>🌋 Magma — la semana pasada y hoy</Label>
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:14, marginTop:14}}>
            <Stat v={fmtM(m.cobrado.monto)} l={`cobrado la semana pasada · ${m.cobrado.n}`} color={m.cobrado.monto?T.pos:T.ink3}/>
            <Stat v={fmtM(m.emitidas.monto)} l={`facturado la semana pasada · ${m.emitidas.n}`}/>
            <Stat v={fmtM(m.porCobrar.monto)} l={`por cobrar hoy · ${m.porCobrar.n}`}/>
            <Stat v={fmtM(m.vencidas.monto)} l={`vencidas · ${m.vencidas.n}`} color={T.brand}/>
            <Stat v={fmtM(m.sinEmitir.monto)} l={`trabajo hecho sin factura · ${m.sinEmitir.n}`} color={m.sinEmitir.n?T.brand:T.ink3}/>
            <Stat v={fmtM(m.atrasadas.monto)} l={`+30 días del evento · ${m.atrasadas.n}`} color={T.warn}/>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:14, marginTop:18, paddingTop:14, borderTop:`1px solid ${T.border}`}}>
            <Stat v={String(m.enviados.n)} l={`presupuestos enviados · ${fmtM(m.enviados.monto)}`}/>
            <Stat v={String(m.aprobados.n)} l={`aprobados la semana pasada · ${fmtM(m.aprobados.monto)}`} color={m.aprobados.n?T.pos:T.ink3}/>
            <Stat v={String(m.espera.n)} l={`en espera · ${fmtM(m.espera.monto)} · ${m.porLlamar.n} por llamar`}/>
            <Stat v={String(m.hechos.n)} l={`eventos hechos · ${fmtM(m.hechos.monto)}`}/>
            <Stat v={`${m.vienen.n}`} l={`eventos esta semana · ${m.vienenSinStaff} sin staff`} color={m.vienenSinStaff?T.brand:T.ink}/>
            <Stat v={`${m.mes.n}`} l={`eventos en el mes · ${fmtM(m.mes.monto)}`}/>
            <Stat v={`${m.edicion.vencidas}`} l={`ediciones pasadas de fecha · ${m.edicion.abiertas} abiertas · ${m.edicion.paraRevisar} esperan al PM`} color={m.edicion.vencidas?T.brand:T.ink3}/>
            <Stat v={`${m.sena.cobradas}/${m.sena.de}`} l={`señas del 30% cobradas (aprobados desde el ${m.sena.desde})`} color={m.sena.cobradas?T.pos:T.brand}/>
          </div>
        </Card>

        {/* SOCIOS */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))', gap:16}}>
          {L.socios.map(p=><Persona key={p.pm} p={p}/>)}
        </div>

        {/* LOS CHICOS */}
        <Label>👥 Los chicos</Label>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))', gap:16, marginTop:-8}}>
          {L.equipo.map(p=><Persona key={p.pm} p={p} compacto/>)}
          <Card>
            <h2 style={{margin:0, fontSize:20, fontWeight:800, letterSpacing:-.3}}>Editores</h2>
            <span style={{fontSize:12, color:T.ink3}}>qué tiene cada uno en la mesa</span>
            {L.editores.length===0 ? <p style={{fontSize:13, color:T.ink3, marginTop:12}}>Nada asignado.</p>
            : <div style={{marginTop:12}}>
              {L.editores.map((e,i)=><Fila key={i}><span style={{fontWeight:600, minWidth:110}}>{e.nombre}</span><span style={{color:T.ink2}}>{e.abiertas} abiertas</span>{e.vencidas ? <Pill color={T.brand} soft={T.brandSoft}>{e.vencidas} pasadas de fecha</Pill> : null}{e.editando ? <span style={{color:T.ink3}}>{e.editando} editando</span> : null}<span style={{color:e.terminadas?T.pos:T.ink3, marginLeft:'auto'}}>{e.terminadas} terminadas</span></Fila>)}
            </div>}
            <p style={{fontSize:12, color:T.ink3, marginTop:10}}>Abiertas = el evento ya pasó y la pieza no está terminada. Sin contar "Somos Magma" ni las filas sin editor.</p>
          </Card>
        </div>

        {/* CUENTA DE SOCIOS */}
        <Card accent="#C9D2F5">
          <Label color={T.azul}>🤝 Cuenta de socios</Label>
          {L.cuentaSocios.error ? <p style={{color:T.brand, fontSize:13, marginTop:10}}>No se pudo calcular: {L.cuentaSocios.error}</p>
          : <><div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:14, marginTop:14}}>
              {L.cuentaSocios.saldos.map(s=><Stat key={s.nombre} v={fmtM(Math.abs(s.saldo))} l={s.saldo>=0?`Magma le debe a ${s.nombre}`:`${s.nombre} le debe a Magma`} color={s.saldo>=0?T.brand:T.pos}/>)}
            </div>
            <p style={{fontSize:12.5, color:T.ink3, marginTop:12}}>Mismo cálculo que Egresos → Socios. Tarjetas cargadas hasta <b>{L.cuentaSocios.tarjetasHasta}</b>: un mes sin resumen cargado infla el saldo a favor del socio.</p></>}
        </Card>

        <p style={{fontSize:11.5, color:T.ink3, textAlign:'center', fontFamily:MONO, marginTop:6, lineHeight:1.6}}>
          Semana del {L.semana.desde} al {L.semana.hasta} · calculado {new Date(d.generado).toLocaleString('es-AR')} · lib/lunes.mjs
        </p>
      </div>}
    </div>
  </div>
}
