import { useState, useEffect, useRef } from 'react'

// La rutina de LinkedIn del día. A esta página apunta el mail de las 8:45 (scripts/linkedin-dia.mjs).
// Cada paso: qué hacer, dónde tocar, un botón para abrir LinkedIn en el lugar justo y otro para copiar el texto.
// Lo que se tilda se guarda en la solapa LINKEDIN (columna Hechos) vía /api/linkedin.

const T = {
  bg:'#FBFAF8', surface:'#FFFFFF', surfaceAlt:'#F6F4F1', border:'#ECE9E4',
  ink:'#1A1917', ink2:'#6F6B63', ink3:'#A8A39A',
  li:'#0A66C2', liSoft:'#E8F1FA', pos:'#1E8A5A', posSoft:'#E7F3EC', warn:'#B07712', warnSoft:'#F8EFDC',
}

function Copiar({ texto, label = 'Copiar' }){
  const [ok, setOk] = useState(false)
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto) } catch {
      const t = document.createElement('textarea'); t.value = texto; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove()
    }
    setOk(true); setTimeout(() => setOk(false), 1600)
  }
  return <button onClick={copiar} style={{ ...btn, background: ok ? T.pos : T.ink, color:'#fff', borderColor: ok ? T.pos : T.ink }}>{ok ? '✓ Copiado' : `📋 ${label}`}</button>
}
const btn = { border:'1px solid', borderRadius:999, padding:'9px 16px', fontSize:14, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:6 }
const Abrir = ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" style={{ ...btn, background:T.li, color:'#fff', borderColor:T.li }}>{children} ↗</a>

function Tilde({ hecho, onClick }){
  return <button onClick={onClick} aria-label={hecho ? 'Hecho' : 'Marcar como hecho'} style={{ width:30, height:30, flex:'0 0 30px', borderRadius:8, border:`2px solid ${hecho ? T.pos : T.border}`, background: hecho ? T.pos : '#fff', color:'#fff', fontSize:17, cursor:'pointer', lineHeight:1 }}>{hecho ? '✓' : ''}</button>
}

function Paso({ n, titulo, minutos, hecho, children }){
  return <section style={{ background:T.surface, border:`1px solid ${hecho ? T.pos : T.border}`, borderRadius:16, padding:'20px 20px 18px', marginBottom:16 }}>
    <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
      <div style={{ width:34, height:34, borderRadius:999, background: hecho ? T.pos : T.li, color:'#fff', fontWeight:800, display:'grid', placeItems:'center', fontSize:16 }}>{hecho ? '✓' : n}</div>
      <h2 style={{ margin:0, fontSize:19, flex:1 }}>{titulo}</h2>
      {minutos && <span style={{ fontSize:12, color:T.ink3 }}>{minutos}</span>}
    </div>
    {children}
  </section>
}
// "Dónde tocar": la guía en criollo de cada paso
const Guia = ({ children }) => <div style={{ background:T.liSoft, borderRadius:10, padding:'10px 14px', fontSize:14, lineHeight:1.55, margin:'0 0 14px', color:'#123' }}>👆 {children}</div>
const Texto = ({ children }) => <div style={{ background:T.surfaceAlt, borderRadius:10, padding:'12px 14px', fontSize:14.5, lineHeight:1.5, whiteSpace:'pre-wrap', margin:'8px 0 10px' }}>{children}</div>

export default function LinkedIn(){
  const [d, setD] = useState(null)
  const [hechos, setHechos] = useState([])
  const [error, setError] = useState('')
  const guardar = useRef(null)

  useEffect(() => {
    fetch('/api/linkedin').then(r => r.json()).then(x => { if (x.error) setError(x.error); else { setD(x); setHechos(x.hechos || []) } }).catch(e => setError(e.message))
  }, [])

  const toggle = k => {
    const nuevo = hechos.includes(k) ? hechos.filter(x => x !== k) : [...hechos, k]
    setHechos(nuevo)
    clearTimeout(guardar.current) // se guarda en el sheet medio segundo después del último tilde
    guardar.current = setTimeout(() => fetch('/api/linkedin', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ fecha: d.fecha, hechos: nuevo }) }), 500)
  }
  const h = k => hechos.includes(k)

  if (error) return <Marco><p>No pude cargar la rutina: {error}</p></Marco>
  if (!d) return <Marco><p style={{ color:T.ink2 }}>Cargando…</p></Marco>
  if (d.vacio) return <Marco><p>Todavía no hay rutina armada. Sale todos los días hábiles a las 8:45.</p></Marco>

  const inv = d.invitar || []
  const invHechas = inv.filter(p => h('inv:' + p.key)).length
  const total = (d.red?.invitadosTotal || 0) + invHechas
  const pasos = [inv.length && invHechas === inv.length, h('bienvenida'), (d.comentarios || []).every(c => h('com:' + c.agencia)), !d.compartir || h('compartir'), !d.mejora || h('mejora:' + d.mejora.id)]
  const listos = pasos.filter(Boolean).length

  return <Marco>
    <p style={{ margin:0, fontSize:13, color:T.ink2, textTransform:'capitalize' }}>LinkedIn · {d.dia} {d.fecha}</p>
    <h1 style={{ margin:'4px 0 6px', fontSize:28, letterSpacing:-.5 }}>Tu rutina de hoy</h1>
    <p style={{ margin:'0 0 16px', color:T.ink2, fontSize:15 }}>15 minutos. Andá en orden y tildá cada cosa: queda anotada en el Master y mañana no se repite.</p>

    <div style={{ display:'flex', gap:12, marginBottom:18, flexWrap:'wrap' }}>
      <Barra label="Pasos de hoy" v={listos} de={pasos.length} />
      <Barra label="Invitaciones mandadas (meta noviembre)" v={total} de={d.red?.meta || 250} />
    </div>
    {d.consejo && <div style={{ background:T.warnSoft, color:'#5a3d05', borderRadius:12, padding:'12px 16px', marginBottom:16, fontSize:14.5 }}>💡 {d.consejo}</div>}

    <Paso n={1} titulo={`Invitar a ${inv.length} personas`} minutos="5 min" hecho={pasos[0]}>
      <Guia>Tocá <b>Abrir</b>. En el perfil: si ves el botón azul <b>Conectar</b>, tocalo. Si no está, tocá <b>Más</b> → <b>Conectar</b>. Después <b>Enviar sin nota</b>. Volvé acá y tildá.{inv.some(p => p.buscar) && <> Los que dicen <b>buscar</b> abren la búsqueda: entrá al que tenga la empresa correcta.</>}</Guia>
      {inv.map(p => <div key={p.key} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderTop:`1px solid ${T.border}` }}>
        <Tilde hecho={h('inv:' + p.key)} onClick={() => toggle('inv:' + p.key)} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:15 }}>{p.nombre} {p.tipo === 'cliente' && <span style={{ fontSize:11, background:T.posSoft, color:T.pos, borderRadius:999, padding:'2px 8px', marginLeft:4 }}>cliente</span>}</div>
          <div style={{ fontSize:13, color:T.ink2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{[p.cargo, p.empresa].filter(Boolean).join(' · ')}</div>
        </div>
        <Abrir href={p.link}>{p.buscar ? 'Buscar' : 'Abrir'}</Abrir>
      </div>)}
    </Paso>

    <Paso n={2} titulo="Contestar a los que aceptaron" minutos="3 min" hecho={pasos[1]}>
      <Guia>Tocá <b>Ver quién aceptó</b>: arriba de todo están los últimos. A cada uno nuevo: <b>Enviar mensaje</b> → pegá el texto → cambiá <b>[nombre]</b> por su nombre → <b>Enviar</b>. Sin tarifario: si te preguntan precio, ahí sí.</Guia>
      <Texto>{d.bienvenida}</Texto>
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
        <Copiar texto={d.bienvenida} label="Copiar mensaje" />
        <Abrir href={d.aceptaron}>Ver quién aceptó</Abrir>
        <span style={{ flex:1 }} /><Tilde hecho={h('bienvenida')} onClick={() => toggle('bienvenida')} />
      </div>
    </Paso>

    <Paso n={3} titulo="Comentar en 3 agencias" minutos="5 min" hecho={pasos[2]}>
      <Guia>Tocá <b>Ver posts</b>: salen los últimos posts que nombran a esa agencia. Elegí uno de esta semana, tocá <b>Comentar</b>, pegá el que corresponda y ajustá algo para que hable de ESE post. Cuando comentás, tu nombre le aparece a toda la red de esa agencia.</Guia>
      {(d.comentarios || []).map(c => <div key={c.agencia} style={{ borderTop:`1px solid ${T.border}`, padding:'14px 0 6px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
          <Tilde hecho={h('com:' + c.agencia)} onClick={() => toggle('com:' + c.agencia)} />
          <b style={{ flex:1, fontSize:16 }}>{c.agencia}</b>
          <Abrir href={c.link}>Ver posts</Abrir>
        </div>
        <div style={{ fontSize:12, color:T.ink3, marginTop:8 }}>SI EL POST MUESTRA UN EVENTO O ACTIVACIÓN</div>
        <Texto>{c.evento}</Texto><Copiar texto={c.evento} />
        <div style={{ fontSize:12, color:T.ink3, marginTop:14 }}>SI ANUNCIA ALGO (CUENTA NUEVA, ANIVERSARIO, EQUIPO)</div>
        <Texto>{c.anuncio}</Texto><Copiar texto={c.anuncio} />
      </div>)}
    </Paso>

    {d.compartir && <Paso n={4} titulo="Compartir el post de la página" minutos="1 min" hecho={pasos[3]}>
      <Guia>Hoy sale <b>{d.compartir.post}</b>. Tocá <b>Abrir la página</b>, en el post tocá <b>Compartir</b> (la flechita) → <b>Compartir con comentarios</b>, pegá el texto y <b>Publicar</b>. Así llega a TU red, que es la que crece.</Guia>
      <Texto>{d.compartir.texto}</Texto>
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
        <Copiar texto={d.compartir.texto} /><Abrir href={d.compartir.link}>Abrir la página</Abrir>
        <span style={{ flex:1 }} /><Tilde hecho={h('compartir')} onClick={() => toggle('compartir')} />
      </div>
    </Paso>}

    {d.mejora && <Paso n={d.compartir ? 5 : 4} titulo={`Mejora del día: ${d.mejora.titulo}`} minutos="2 min" hecho={pasos[4]}>
      {d.mejora.para_que && <p style={{ margin:'0 0 12px', fontSize:15 }}><b>Para qué:</b> {d.mejora.para_que}</p>}
      {(d.mejora.pasos || []).length > 0 && <ol style={{ margin:'0 0 12px', paddingLeft:22, lineHeight:1.7, fontSize:15 }}>{d.mejora.pasos.map((p, i) => <li key={i}>{p}</li>)}</ol>}
      {d.mejora.texto && <><Texto>{d.mejora.texto}</Texto><Copiar texto={d.mejora.texto} /></>}
      <div style={{ display:'flex', gap:10, alignItems:'center', marginTop:12 }}>
        <Abrir href="https://www.linkedin.com/in/me/">Abrir mi perfil</Abrir>
        <span style={{ flex:1 }} /><span style={{ fontSize:13, color:T.ink2 }}>¿La hiciste?</span><Tilde hecho={h('mejora:' + d.mejora.id)} onClick={() => toggle('mejora:' + d.mejora.id)} />
      </div>
    </Paso>}

    {listos === pasos.length && <div style={{ textAlign:'center', padding:'18px', background:T.posSoft, color:T.pos, borderRadius:14, fontWeight:700, fontSize:17 }}>🎉 Listo por hoy. Mañana a las 8:45 llega la próxima.</div>}
  </Marco>
}

function Barra({ label, v, de }){
  const pct = Math.min(100, Math.round(v / Math.max(1, de) * 100))
  return <div style={{ flex:'1 1 220px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:'12px 14px' }}>
    <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:T.ink2, marginBottom:8 }}><span>{label}</span><b style={{ color:T.ink }}>{v} / {de}</b></div>
    <div style={{ height:8, background:T.surfaceAlt, borderRadius:99 }}><div style={{ width:pct + '%', height:'100%', background:T.li, borderRadius:99 }} /></div>
  </div>
}

function Marco({ children }){
  return <div style={{ minHeight:'100vh', background:T.bg, color:T.ink, fontFamily:'-apple-system, "Segoe UI", Roboto, Arial, sans-serif' }}>
    <div style={{ maxWidth:720, margin:'0 auto', padding:'28px 16px 60px' }}>{children}</div>
  </div>
}
