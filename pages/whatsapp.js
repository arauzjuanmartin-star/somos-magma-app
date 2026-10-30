import { useSession, signIn } from 'next-auth/react'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'

// La bandeja de WhatsApp de Magma (+54 9 11 3011-6883). Lee la solapa WHATSAPP vía /api/whatsapp-bandeja y contesta
// con /api/whatsapp-send. El bot (lib/whatsapp.js) contesta solo; cuando alguien del equipo escribe desde acá, el bot
// se calla 24 h con ese número. Es la página a la que apuntan los mails de "lead por WhatsApp" (?tel=549...).

const T = {
  bg:'#FBFAF8', surface:'#FFFFFF', surfaceAlt:'#F6F4F1', border:'#ECE9E4',
  ink:'#1A1917', ink2:'#6F6B63', ink3:'#A8A39A',
  brand:'#CE2637', brandSoft:'#FBEAEC', pos:'#1E8A5A', posSoft:'#E7F3EC',
  warn:'#B07712', warnSoft:'#F8EFDC', azul:'#1543F8', azulSoft:'#E9EDFF',
}
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'
const ESTADO = { 'bot-lead': ['lead completo', T.pos, T.posSoft], 'bot-derivado': ['pide una persona', T.brand, T.brandSoft] }
const telLindo = t => { const m = String(t).match(/^549(11|\d{3})(\d{3,4})(\d{4})$/); return m ? `+54 9 ${m[1]} ${m[2]}-${m[3]}` : '+' + t }

function Pill({children, color, soft}){
  return <span style={{fontFamily:MONO, fontSize:10.5, padding:'2px 7px', borderRadius:999, background:soft, color, whiteSpace:'nowrap', fontWeight:600}}>{children}</span>
}

export default function WhatsApp(){
  const { data:session, status } = useSession()
  const mail = session?.user?.email?.toLowerCase()
  const router = useRouter()
  const [d,setD]=useState(null),[err,setErr]=useState('')
  const [sel,setSel]=useState(''),[texto,setTexto]=useState(''),[enviando,setEnviando]=useState(false),[aviso,setAviso]=useState('')
  const fin = useRef(null)
  // "Probar el bot": una charla de mentira que no sale por WhatsApp ni se guarda. Para revisar el tono.
  const [probando,setProbando]=useState(false),[prueba,setPrueba]=useState([]),[pTexto,setPTexto]=useState(''),[pPensando,setPPensando]=useState(false),[pInfo,setPInfo]=useState(null)
  const probar=()=>{
    if(!pTexto.trim()) return
    const charla=[...prueba, {direccion:'Entrante', mensaje:pTexto}]
    setPrueba(charla); setPTexto(''); setPPensando(true); setPInfo(null)
    fetch('/api/whatsapp-bandeja',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({prueba:charla})})
      .then(r=>r.json()).then(j=>{ setPPensando(false)
        if(j.error||!j.r) { setPInfo({error: j.error || 'El bot no armó respuesta'}); return }
        setPrueba([...charla, {direccion:'Saliente', mensaje:j.r.respuesta}]); setPInfo(j.r) })
      .catch(()=>{ setPPensando(false); setPInfo({error:'Error de conexión'}) })
  }

  // Alta del número en Meta (solo Juan, se usa una vez): ver cómo está y registrarlo con el PIN.
  const [alta,setAlta]=useState(null),[pin,setPin]=useState(''),[altaCargando,setAltaCargando]=useState(false)
  const pedirAlta=(body)=>{ setAltaCargando(true)
    fetch('/api/whatsapp-bandeja'+(body?'':'?alta=1'), body?{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({alta:'activar', ...body})}:undefined)
      .then(r=>r.json()).then(j=>{ setAltaCargando(false); setAlta(j); if(!j.error) setPin('') }).catch(()=>{ setAltaCargando(false); setAlta({error:'Error de conexión'}) }) }

  const traer=()=>fetch('/api/whatsapp-bandeja').then(r=>r.json()).then(j=>{ if(j.error)setErr(j.error); else { setErr(''); setD(j) } }).catch(()=>setErr('Error de conexión'))
  useEffect(()=>{ if(!mail) return; traer(); const t=setInterval(traer, 20000); return ()=>clearInterval(t) /* eslint-disable-next-line */ },[mail])
  useEffect(()=>{ if(router.query.tel) setSel(String(router.query.tel)) },[router.query.tel])
  const conv = d?.conversaciones?.find(c=>c.telefono===sel)
  useEffect(()=>{ fin.current?.scrollIntoView({block:'end'}) },[sel, conv?.mensajes?.length])

  const mandar=()=>{
    if(!texto.trim()||!conv) return
    setEnviando(true); setAviso('')
    fetch('/api/whatsapp-send',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({to:conv.telefono, text:texto})})
      .then(r=>r.json()).then(j=>{ setEnviando(false); if(j.error) setAviso('⚠️ '+j.error); else { setTexto(''); traer() } })
      .catch(()=>{ setEnviando(false); setAviso('⚠️ no se pudo mandar') })
  }

  const wrap = {minHeight:'100vh', background:T.bg, color:T.ink, fontFamily:'system-ui,-apple-system,Segoe UI,Roboto,sans-serif'}
  if(status==='loading') return <div style={{...wrap, display:'grid', placeItems:'center'}}><span style={{color:T.ink3}}>Cargando…</span></div>
  if(status==='unauthenticated'||!mail) return <div style={{...wrap, display:'grid', placeItems:'center'}}>
    <button onClick={()=>signIn('google',{callbackUrl:'/whatsapp'})} style={{padding:'11px 22px', borderRadius:10, border:'none', background:T.ink, color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer'}}>Ingresar con Google</button>
  </div>

  const lista = d?.conversaciones || []
  const pendientes = lista.filter(c=>c.pendiente).length
  return <div style={wrap}>
    <style>{`.wa-grid{display:grid;grid-template-columns:320px 1fr;gap:14px}@media(max-width:760px){.wa-grid{grid-template-columns:1fr}.wa-oculto{display:none}}`}</style>
    <div style={{maxWidth:1100, margin:'0 auto', padding:'0 16px 40px'}}>
      <div style={{display:'flex', alignItems:'center', gap:12, padding:'22px 0 16px', flexWrap:'wrap'}}>
        <div style={{width:11, height:11, borderRadius:'50%', background:'#25D366'}}/>
        <div style={{flex:1, minWidth:200}}>
          <div style={{fontFamily:MONO, fontSize:11.5, textTransform:'uppercase', letterSpacing:1.2, color:T.ink3}}>WhatsApp de Magma · +54 9 11 3011-6883</div>
          <h1 style={{margin:'4px 0 0', fontSize:24, fontWeight:800, letterSpacing:-.5}}>Bandeja{pendientes ? <span style={{color:T.brand}}> · {pendientes} sin contestar</span> : null}</h1>
        </div>
        {d && <Pill color={d.bot?T.pos:T.warn} soft={d.bot?T.posSoft:T.warnSoft}>{d.bot?'bot contestando':'bot apagado'}</Pill>}
        <button onClick={()=>{ setProbando(!probando); setSel('') }} style={{padding:'7px 12px', borderRadius:9, border:`1px solid ${T.border}`, background:probando?T.ink:T.surface, color:probando?'#fff':T.ink, fontSize:12.5, fontWeight:600, cursor:'pointer'}}>{probando?'Cerrar prueba':'Probar el bot'}</button>
        <Link href="/" style={{fontSize:13, color:T.azul, textDecoration:'none'}}>← app</Link>
      </div>
      {d && !d.conectado && <div style={{background:T.warnSoft, color:T.warn, borderRadius:10, padding:'10px 14px', fontSize:13, marginBottom:12}}>Todavía no está conectado a Meta: faltan WHATSAPP_PHONE_ID y WHATSAPP_TOKEN en Vercel. Se puede mirar, no mandar.</div>}
      {mail==='juan@somosmagma.com' && d && (!d.conectado || alta) && <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, padding:'12px 16px', marginBottom:12, fontSize:13.5}}>
        <div style={{display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
          <div style={{flex:1, fontWeight:700}}>Activar el número en Meta</div>
          <button onClick={()=>pedirAlta()} disabled={altaCargando} style={{padding:'6px 12px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, fontSize:12.5, fontWeight:600, cursor:'pointer'}}>{altaCargando?'…':'Ver estado'}</button>
        </div>
        {alta?.error && <div style={{color:T.brand, marginTop:8}}>⚠️ {alta.error}</div>}
        {alta?.numeros?.map(n=><div key={n.id} style={{marginTop:10, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
          <span style={{fontWeight:600}}>{n.display_phone_number} · {n.verified_name}</span>
          <Pill color={n.status==='CONNECTED'?T.pos:T.warn} soft={n.status==='CONNECTED'?T.posSoft:T.warnSoft}>{n.status||'?'}</Pill>
          <span style={{fontFamily:MONO, fontSize:12, color:T.ink2}}>ID {n.id}{alta.phoneIdCargado===n.id?' ✓ cargado en Vercel':''}</span>
          {n.status!=='CONNECTED' && <>
            <input value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} type="password" inputMode="numeric" placeholder="PIN de 6 dígitos" style={{width:140, border:`1px solid ${T.border}`, borderRadius:8, padding:'6px 9px', fontSize:13}}/>
            <button onClick={()=>pedirAlta({phoneId:n.id, pin})} disabled={altaCargando||pin.length!==6} style={{padding:'6px 12px', borderRadius:9, border:'none', background:'#25D366', color:'#fff', fontSize:12.5, fontWeight:700, cursor:'pointer', opacity:(altaCargando||pin.length!==6)?.5:1}}>Activar</button>
          </>}
        </div>)}
        {alta?.numeros && <div style={{marginTop:8, fontSize:12, color:T.ink3}}>Apps que reciben los mensajes: {alta.apps?.length ? alta.apps.join(', ') : 'ninguna todavía'}</div>}
      </div>}
      {err && <div style={{background:T.brandSoft, color:T.brand, borderRadius:10, padding:'10px 14px', fontSize:13, marginBottom:12}}>{err}</div>}
      {!d && !err && <div style={{color:T.ink3, fontSize:14}}>Cargando conversaciones…</div>}

      {probando && <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, marginBottom:14, overflow:'hidden'}}>
        <div style={{padding:'12px 16px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', gap:10}}>
          <div style={{flex:1}}>
            <div style={{fontWeight:700, fontSize:15}}>Probar el bot</div>
            <div style={{fontSize:12, color:T.ink3}}>Escribí como si fueras un cliente. No sale por WhatsApp ni se guarda en el sheet.</div>
          </div>
          <button onClick={()=>{ setPrueba([]); setPInfo(null) }} style={{border:'none', background:'none', color:T.azul, fontSize:13, cursor:'pointer'}}>empezar de nuevo</button>
        </div>
        <div style={{padding:'14px 16px', background:'#F4F1EC', minHeight:120}}>
          {!prueba.length && <div style={{fontSize:13, color:T.ink3}}>Ej: "Hola! cuánto sale cubrir un evento de 4 horas?"</div>}
          {prueba.map((m,i)=><div key={i} style={{display:'flex', justifyContent:m.direccion==='Saliente'?'flex-end':'flex-start', marginBottom:8}}>
            <div style={{maxWidth:'78%', background:m.direccion==='Saliente'?'#E9F7EF':T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:'8px 11px', fontSize:14, lineHeight:1.4, whiteSpace:'pre-wrap'}}>{m.mensaje}</div>
          </div>)}
          {pPensando && <div style={{fontSize:13, color:T.ink3}}>el bot está escribiendo…</div>}
        </div>
        {pInfo && <div style={{padding:'10px 16px', borderTop:`1px solid ${T.border}`, fontSize:12.5, color:pInfo.error?T.brand:T.ink2, display:'flex', gap:8, flexWrap:'wrap', alignItems:'center'}}>
          {pInfo.error ? '⚠️ '+pInfo.error : <>
            {pInfo.derivar && <Pill color={T.brand} soft={T.brandSoft}>derivaría a una persona</Pill>}
            {pInfo.datos_completos && <Pill color={T.pos} soft={T.posSoft}>lead completo → mail a Juan y Sofi</Pill>}
            <span>Lo que le llegaría al equipo: {pInfo.resumen}</span>
          </>}
        </div>}
        <div style={{borderTop:`1px solid ${T.border}`, padding:12, display:'flex', gap:8}}>
          <textarea value={pTexto} onChange={e=>setPTexto(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); probar() } }} rows={2} placeholder="Escribí como cliente…" style={{flex:1, resize:'vertical', border:`1px solid ${T.border}`, borderRadius:10, padding:'9px 11px', fontSize:14, fontFamily:'inherit'}}/>
          <button onClick={probar} disabled={pPensando||!pTexto.trim()} style={{padding:'0 18px', borderRadius:10, border:'none', background:T.ink, color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', opacity:(pPensando||!pTexto.trim())?.5:1}}>Probar</button>
        </div>
      </div>}

      {d && <div className="wa-grid">
        <div className={sel?'wa-oculto':''} style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, overflow:'hidden', alignSelf:'start'}}>
          {!lista.length && <div style={{padding:18, fontSize:13.5, color:T.ink2}}>Todavía no escribió nadie. Cuando entre el primer mensaje aparece acá (se actualiza solo cada 20 segundos).</div>}
          {lista.map(c=>{
            const u = c.mensajes[c.mensajes.length-1], e = ESTADO[c.estado]
            return <div key={c.telefono} onClick={()=>{ setSel(c.telefono); setAviso('') }} style={{padding:'11px 14px', borderTop:`1px solid ${T.border}`, cursor:'pointer', background:c.telefono===sel?T.surfaceAlt:'transparent'}}>
              <div style={{display:'flex', alignItems:'center', gap:6}}>
                {c.pendiente && <span style={{width:8, height:8, borderRadius:'50%', background:T.brand, flexShrink:0}}/>}
                <span style={{fontWeight:c.pendiente?700:600, fontSize:14, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{c.nombre || telLindo(c.telefono)}</span>
                <span style={{fontSize:11.5, color:T.ink3}}>{u?.fecha} {u?.hora}</span>
              </div>
              <div style={{fontSize:12.5, color:T.ink2, marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{u?.direccion==='Saliente' ? (u.quien==='bot'?'🤖 ':'Vos: ') : ''}{u?.mensaje}</div>
              {e && <div style={{marginTop:5}}><Pill color={e[1]} soft={e[2]}>{e[0]}</Pill></div>}
            </div>
          })}
        </div>

        <div className={sel?'':'wa-oculto'} style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, display:'flex', flexDirection:'column', minHeight:420, maxHeight:'calc(100vh - 140px)'}}>
          {!conv ? <div style={{padding:18, fontSize:13.5, color:T.ink3}}>Elegí una conversación.</div> : <>
            <div style={{padding:'12px 16px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', gap:10}}>
              <button onClick={()=>setSel('')} style={{border:'none', background:'none', color:T.azul, fontSize:13, cursor:'pointer', padding:0}}>←</button>
              <div style={{flex:1}}>
                <div style={{fontWeight:700, fontSize:15}}>{conv.nombre || telLindo(conv.telefono)}</div>
                <div style={{fontSize:12, color:T.ink3}}>{telLindo(conv.telefono)}</div>
              </div>
              {ESTADO[conv.estado] && <Pill color={ESTADO[conv.estado][1]} soft={ESTADO[conv.estado][2]}>{ESTADO[conv.estado][0]}</Pill>}
            </div>
            <div style={{flex:1, overflowY:'auto', padding:'14px 16px', background:'#F4F1EC'}}>
              {conv.mensajes.map((m,i)=>{
                const mio = m.direccion==='Saliente'
                return <div key={i} style={{display:'flex', justifyContent:mio?'flex-end':'flex-start', marginBottom:8}}>
                  <div style={{maxWidth:'78%', background:mio?(m.quien==='bot'?'#E9F7EF':'#DCF8C6'):T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:'8px 11px', fontSize:14, lineHeight:1.4, whiteSpace:'pre-wrap'}}>
                    {m.mensaje}
                    <div style={{fontSize:10.5, color:T.ink3, marginTop:4, textAlign:'right'}}>{mio ? (m.quien==='bot'?'bot · ':m.quien+' · ') : ''}{m.fecha} {m.hora}</div>
                  </div>
                </div>
              })}
              <div ref={fin}/>
            </div>
            <div style={{borderTop:`1px solid ${T.border}`, padding:12}}>
              {!conv.abierta && <div style={{fontSize:12.5, color:T.warn, marginBottom:8}}>Pasaron más de 24 h desde su último mensaje: WhatsApp no deja escribirle texto libre hasta que vuelva a escribir.</div>}
              {conv.abierta && <div style={{fontSize:12, color:T.ink3, marginBottom:8}}>Si contestás vos, el bot deja de responderle a esta persona por 24 h.</div>}
              <div style={{display:'flex', gap:8}}>
                <textarea value={texto} onChange={e=>setTexto(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)) mandar() }} rows={2} placeholder="Escribí la respuesta…" disabled={!conv.abierta||!d.conectado}
                  style={{flex:1, resize:'vertical', border:`1px solid ${T.border}`, borderRadius:10, padding:'9px 11px', fontSize:14, fontFamily:'inherit'}}/>
                <button onClick={mandar} disabled={enviando||!texto.trim()||!conv.abierta||!d.conectado} style={{padding:'0 18px', borderRadius:10, border:'none', background:'#25D366', color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer', opacity:(enviando||!texto.trim()||!conv.abierta||!d.conectado)?.5:1}}>{enviando?'…':'Mandar'}</button>
              </div>
              {aviso && <div style={{fontSize:12.5, color:T.brand, marginTop:8}}>{aviso}</div>}
            </div>
          </>}
        </div>
      </div>}
    </div>
  </div>
}
