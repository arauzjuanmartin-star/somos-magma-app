// ============================ MI MAGMA ============================
// El espacio de cada freelancer, pensado para el celular: su agenda, lo que tiene para
// facturar, cómo quedó lo que filmó y su ficha. Recibe `datos` ya recortados por
// lib/mi-magma.js (la aduana): acá no hay nada que filtrar ni que esconder.
//
// Casi todo es SOLO LECTURA. Lo que escribe:
//   · cargar un gasto de un trabajo con la foto del ticket (/api/mi/ticket → solapa TICKETS; lo aprueba administración)
//   · "Confirmo" / "No puedo" en la ficha de un trabajo, y "este día no puedo" en el calendario de la agenda
//     (/api/mi/disponibilidad → solapa DISPONIBILIDAD; un "no puedo" le llega por mail al PM, la app no lo saca sola)
//   · una nota para la editora desde la ficha del trabajo o desde "Cómo quedó" (/api/mi/nota → bitácora de EDICION + mail)
// Las referencias ("para el que filma") vienen después.
//
// Subcomponentes a nivel de módulo a propósito (si van adentro, React los remonta).

import React, { useState, useEffect } from 'react'
import { T, MONO } from '../lib/ui'

const $ = n => '$' + Math.round(n || 0).toLocaleString('es-AR')
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const aFecha = s => { const [d, m, y] = String(s || '').split('/').map(Number); return d && m && y ? new Date(y, m - 1, d) : null }
const diaSemana = s => { const f = aFecha(s); return f ? DIAS[f.getDay()] : '' }

const caja = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: '13px 14px', marginBottom: 10 }
const tit = { fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: T.ink3, margin: '22px 0 9px' }
const hola = { fontSize: 21, fontWeight: 700, letterSpacing: '-.01em', margin: 0, color: T.ink }
const sub = { fontSize: 12.5, color: T.ink2, margin: '2px 0 0' }
const boton = { border: `1px solid ${T.border}`, background: T.surface, color: T.ink, borderRadius: 10, padding: '11px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'block', textAlign: 'center', width: '100%' }

function Pill({ children, tono }) {
  const c = { ok: [T.posSoft, T.pos], falta: [T.warnSoft, T.warn], rojo: [T.brandSoft, T.brand] }[tono] || [T.surfaceAlt, T.ink2]
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: c[0], color: c[1], whiteSpace: 'nowrap' }}>{children}</span>
}
function KV({ filas }) {
  return <dl style={{ display: 'grid', gridTemplateColumns: '86px minmax(0,1fr)', gap: '7px 10px', fontSize: 13, margin: 0 }}>
    {filas.filter(Boolean).map(([k, v]) => <React.Fragment key={k}><dt style={{ color: T.ink3, fontSize: 11.5, paddingTop: 1 }}>{k}</dt><dd style={{ margin: 0, overflowWrap: 'anywhere', color: T.ink }}>{v}</dd></React.Fragment>)}
  </dl>
}

function Tarjeta({ j, onAbrir }) {
  const f = aFecha(j.fecha)
  return <button onClick={onAbrir} style={{ display: 'grid', gridTemplateColumns: '50px minmax(0,1fr)', gap: 12, width: '100%', textAlign: 'left', ...caja, marginBottom: 8, padding: 12, cursor: 'pointer', fontFamily: 'inherit', ...(j.esHoy ? { borderColor: T.ink, boxShadow: `0 0 0 1px ${T.ink}` } : {}) }}>
    <span style={{ borderRadius: 10, background: j.esHoy ? T.brand : T.surfaceAlt, color: j.esHoy ? '#fff' : T.ink, textAlign: 'center', padding: '7px 0 6px', alignSelf: 'start' }}>
      <b style={{ display: 'block', fontFamily: MONO, fontWeight: 600, fontSize: 19, lineHeight: 1 }}>{f ? f.getDate() : '—'}</b>
      <span style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: '.07em', textTransform: 'uppercase', opacity: 0.75 }}>{diaSemana(j.fecha)}</span>
    </span>
    <span style={{ minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, lineHeight: 1.25, color: T.ink }}>{j.cliente || j.proyecto}</span>
      <span style={{ display: 'block', margin: '2px 0 0', fontSize: 12.5, color: T.ink2, overflowWrap: 'anywhere' }}>{j.rol} · {j.horario || 'sin horario todavía'}{j.lugar ? ` · ${j.lugar}` : ''}</span>
      <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {j.respuesta?.que === 'confirmo' ? <Pill tono="ok">confirmaste</Pill> : j.respuesta?.que === 'nopuedo' ? <Pill tono="rojo">avisaste que no podés</Pill> : <Pill tono="falta">¿vas? confirmá</Pill>}
        {j.falta.length > 0 && <Pill tono="falta">falta {j.falta.join(' y ')}</Pill>}
        {j.equipo.length > 0 && <Pill>con {j.equipo.map(e => e.quien).join(', ')}</Pill>}
      </span>
    </span>
  </button>
}

// Avisos al celular (push). Tres estados: no se puede en este navegador (iPhone sin "agregar a pantalla de inicio",
// o navegador viejo) · se puede y no está activado · activado. La suscripción vive en el navegador; en el sheet queda
// una copia por celular (solapa PUSH) para poder mandarle.
const b64aBytes = b64 => { const s = (b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'); const raw = atob(s); return Uint8Array.from([...raw].map(c => c.charCodeAt(0))) }
function usarPush(push) {
  const [estado, setEstado] = useState('viendo')   // viendo · nohay · ios · apagado · prendido · bloqueado
  const [sub, setSub] = useState(null)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        if (!push?.disponible || typeof window === 'undefined') return vivo && setEstado('nohay')
        const iphone = /iPhone|iPad/.test(navigator.userAgent), instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return vivo && setEstado(iphone && !instalada ? 'ios' : 'nohay')
        if (Notification.permission === 'denied') return vivo && setEstado('bloqueado')
        const reg = await navigator.serviceWorker.ready
        const s = await reg.pushManager.getSubscription()
        if (!vivo) return
        setSub(s); setEstado(s ? 'prendido' : 'apagado')
      } catch (e) { vivo && setEstado('nohay') }
    })()
    return () => { vivo = false }
  }, [push?.disponible])
  async function prender() {
    setEstado('viendo')
    try {
      const p = await Notification.requestPermission()
      if (p !== 'granted') return setEstado(p === 'denied' ? 'bloqueado' : 'apagado')
      const reg = await navigator.serviceWorker.ready
      const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aBytes(push.clave) })
      const r = await fetch('/api/mi/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'alta', suscripcion: s.toJSON(), navegador: navigator.userAgent }) }).then(x => x.json())
      if (!r.ok) { await s.unsubscribe().catch(() => {}); setEstado('apagado'); return r.error || 'No se pudo activar' }
      setSub(s); setEstado('prendido'); return ''
    } catch (e) { setEstado('apagado'); return 'No se pudo activar en este navegador.' }
  }
  async function apagar() {
    try { const ep = sub?.endpoint; await sub?.unsubscribe(); await fetch('/api/mi/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'baja', endpoint: ep }) }) } catch (e) { /* nada */ }
    setSub(null); setEstado('apagado')
  }
  return { estado, prender, apagar }
}
function AvisosCelular({ push, compacto, viendoComo }) {
  const { estado, prender, apagar } = usarPush(push)
  const [error, setError] = useState('')
  if (viendoComo || estado === 'nohay' || estado === 'viendo') return null
  if (compacto && estado === 'prendido') return null
  const texto = {
    ios: <>Para recibir avisos en el iPhone, primero agregá Mi Magma a la pantalla de inicio: tocá <b>Compartir</b> (el cuadrado con la flecha) → <b>Agregar a pantalla de inicio</b>. Después entrá desde el ícono y activalos acá.</>,
    apagado: 'Cuando te sumen a un trabajo o se entregue algo que filmaste, te llega un aviso al celular aunque la app esté cerrada.',
    prendido: 'Activados en este celular. Te avisamos cuando te sumen a un trabajo o se entregue algo que filmaste.',
    bloqueado: 'Este navegador tiene los avisos bloqueados para Mi Magma. Se destraban desde la configuración del sitio (el candado al lado de la dirección).',
  }[estado]
  return <div style={{ ...caja, ...(compacto ? { borderColor: T.ink } : {}) }}>
    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: T.ink }}>{estado === 'prendido' ? '✓ Avisos en este celular' : 'Avisos en este celular'}</div>
    <p style={{ ...sub, margin: 0, lineHeight: 1.5 }}>{texto}</p>
    {estado === 'apagado' && <button onClick={async () => setError(await prender())} style={{ ...boton, marginTop: 10, background: T.ink, borderColor: T.ink, color: '#fff' }}>Activar avisos</button>}
    {estado === 'prendido' && !compacto && <button onClick={apagar} style={{ ...boton, marginTop: 10, color: T.ink2, fontWeight: 500 }}>Apagar en este celular</button>}
    {error && <div style={{ marginTop: 10, background: T.brandSoft, color: T.brand, borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>{error}</div>}
  </div>
}

// Una nota para la editora: lo que le dijeron en el lugar, lo que tiene que estar sí o sí, qué cubrió. Va a la bitácora de
// edición del trabajo y le llega por mail a la editora (o al PM si todavía no hay). Se le muestran las notas que ya dejó.
function NotaEditora({ j, notas, viendoComo, onNota, compacto }) {
  const [abierto, setAbierto] = useState(false), [texto, setTexto] = useState(''), [mandando, setMandando] = useState(false), [error, setError] = useState(''), [listo, setListo] = useState('')
  async function mandar() {
    if (texto.trim().length < 3) return setError('Escribí la nota')
    setError(''); setMandando(true)
    try {
      const x = await fetch('/api/mi/nota', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ num: j.num, slot: j.slot, texto }) }).then(r => r.json())
      if (!x.ok) { setError(x.error || 'No se pudo guardar. Probá de nuevo.'); setMandando(false); return }
      try { sessionStorage.setItem('mi-escribi', String(Date.now())) } catch (e) { /* sin storage */ }
      onNota(j.num, x.nota); setTexto(''); setAbierto(false); setListo(x.aQuien === 'pm' ? 'Quedó en el tablero. Todavía no hay editora: le llegó a tu PM.' : 'Quedó en el tablero y le llegó a la editora.')
    } catch (e) { setError('Sin conexión. Probá de nuevo.') }
    setMandando(false)
  }
  return <div style={compacto ? { marginTop: 10 } : caja}>
    {!compacto && <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: T.ink }}>Para la editora</div>}
    {notas.length > 0 && <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
      {notas.map((n, k) => <div key={k} style={{ fontSize: 13, lineHeight: 1.45, color: T.ink, background: T.surfaceAlt, borderRadius: 8, padding: '8px 10px' }}><span style={{ fontFamily: MONO, fontSize: 11, color: T.ink3 }}>{n.cuando}</span> · {n.texto}</div>)}
    </div>}
    {!j.puedeNota
      ? <p style={{ ...sub, margin: 0 }}>Cuando este trabajo tenga su edición armada vas a poder dejarle una nota a la editora acá.</p>
      : viendoComo ? <p style={{ ...sub, margin: 0 }}>Estás mirando como equipo: desde acá no se escriben notas por otra persona.</p>
      : !abierto
        ? compacto
          // En "Cómo quedó" hay muchos trabajos: acá es un link chico, no una caja entera por cada uno.
          ? <p style={{ ...sub, margin: 0 }}>{listo ? listo + ' ' : ''}<button onClick={() => { setAbierto(true); setListo('') }} style={{ border: 0, background: 'transparent', color: T.ink, fontWeight: 600, padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, textDecoration: 'underline' }}>{notas.length ? 'Dejar otra nota' : '＋ Nota para la editora'}</button></p>
          : <>
            <button onClick={() => { setAbierto(true); setListo('') }} style={boton}>{notas.length ? 'Dejar otra nota' : 'Dejar una nota para la editora'}</button>
            <p style={{ ...sub, marginTop: 7 }}>{listo || 'Algo que te dijeron en el lugar, lo que tiene que estar sí o sí, qué cubriste y qué no.'}</p>
          </>
        : <>
          <textarea value={texto} onChange={e => setTexto(e.target.value)} maxLength={500} rows={3} placeholder="Ej: la marca pidió que el logo del stand se vea entero. No pude grabar el cierre, se cortó antes." style={{ ...campo, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            <button onClick={() => { setAbierto(false); setTexto(''); setError('') }} disabled={mandando} style={boton}>Cancelar</button>
            <button onClick={mandar} disabled={mandando} style={{ ...boton, background: T.ink, borderColor: T.ink, color: '#fff' }}>{mandando ? 'Mandando…' : 'Mandar'}</button>
          </div>
          <p style={{ ...sub, marginTop: 7 }}>Queda en la bitácora del trabajo y le llega por mail a la editora.</p>
        </>}
    {error && <div style={{ marginTop: 10, background: T.brandSoft, color: T.brand, borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>{error}</div>}
  </div>
}

// Contestar sobre un trabajo. "Confirmo" es un toque. "No puedo" pide (opcional) por qué, y avisa que el PM se entera
// ya: la persona sigue cargada hasta que el PM ponga a otro, así nadie queda afuera por un toque de más.
function Confirmar({ j, viendoComo, onContestar }) {
  const [abierto, setAbierto] = useState(false), [motivo, setMotivo] = useState(''), [mandando, setMandando] = useState(false), [error, setError] = useState('')
  const r = j.respuesta
  const yaConfirmo = r?.que === 'confirmo'
  async function mandar(accion) {
    // Bajarse después de confirmar es otra cosa: el PM ya cuenta con esa persona. Sin motivo no se manda.
    if (accion === 'nopuedo' && yaConfirmo && motivo.trim().length < 3) return setError('Ya habías confirmado: escribí qué pasó, el PM lo va a leer.')
    setError(''); setMandando(true)
    try {
      const x = await fetch('/api/mi/disponibilidad', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion, num: j.num, slot: j.slot, motivo }) }).then(r => r.json())
      if (!x.ok) { setError(x.error || 'No se pudo guardar. Probá de nuevo.'); setMandando(false); return }
      try { sessionStorage.setItem('mi-escribi', String(Date.now())) } catch (e) { /* sin storage */ }
      onContestar(j, x.respuesta); setAbierto(false); setMotivo('')
    } catch (e) { setError('Sin conexión. Probá de nuevo.') }
    setMandando(false)
  }
  const pm = j.pm || 'tu PM'
  if (viendoComo) return <div style={{ ...caja, color: T.ink2, fontSize: 13, lineHeight: 1.5 }}>{r?.que === 'confirmo' ? `Confirmó el ${r.cuando.slice(0, 5)}.` : r?.que === 'nopuedo' ? `Avisó que no puede${r.motivo ? `: ${r.motivo}` : ''}.` : 'Todavía no contestó.'} Estás mirando como equipo: desde acá no se contesta por otra persona.</div>
  return <div style={{ ...caja, ...(r?.que === 'nopuedo' ? { borderColor: T.brand } : r?.que === 'confirmo' ? {} : { borderColor: T.warn }) }}>
    {r?.que === 'confirmo' && !abierto && <>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: T.pos }}>✓ Confirmaste que vas</div>
      <p style={{ ...sub, marginTop: 3, lineHeight: 1.5 }}>El {r.cuando.slice(0, 5)}. Ya cuentan con vos. Si pasa algo grave y no vas a poder, <button onClick={() => setAbierto(true)} style={{ border: 0, background: 'transparent', color: T.ink, fontWeight: 600, padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, textDecoration: 'underline' }}>avisá acá</button>.</p>
    </>}
    {r?.que === 'nopuedo' && <>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: T.brand }}>Avisaste que no podés</div>
      <p style={{ ...sub, marginTop: 3, lineHeight: 1.5 }}>{pm} ya lo sabe y busca a otra persona.{r.motivo ? ` Dijiste: "${r.motivo}".` : ''} Si al final podés ir, avisá acá antes de que pongan a otro.</p>
      <button onClick={() => mandar('confirmo')} disabled={mandando} style={{ ...boton, marginTop: 10 }}>{mandando ? 'Guardando…' : 'Al final puedo ir'}</button>
    </>}
    {!r && !abierto && <>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>¿Vas a este trabajo?</div>
      <p style={{ ...sub, marginTop: 3 }}>Con un toque {pm} sabe que cuenta con vos.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
        <button onClick={() => mandar('confirmo')} disabled={mandando} style={{ ...boton, background: T.ink, borderColor: T.ink, color: '#fff', padding: '13px 12px', fontSize: 14 }}>{mandando ? 'Guardando…' : 'Confirmo'}</button>
        <button onClick={() => setAbierto(true)} disabled={mandando} style={{ ...boton, padding: '13px 12px', fontSize: 14 }}>No puedo</button>
      </div>
    </>}
    {abierto && <>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{yaConfirmo ? 'Bajarte después de confirmar' : 'Avisar que no podés'}</div>
      <p style={{ ...sub, marginTop: 3, lineHeight: 1.5 }}>{yaConfirmo ? `Ya habías confirmado y ${pm} cuenta con vos: tiene que ser algo grave. Contá qué pasó y, además de avisar acá, llamalo.` : `Le llega un mail a ${pm} ahora mismo. Vos seguís cargado hasta que ponga a otra persona.`}</p>
      {j.urgente && !yaConfirmo && <div style={{ marginTop: 10, background: T.brandSoft, color: T.brand, borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>Falta poco para este trabajo: además de avisar acá, llamá a {pm}.</div>}
      <input value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={200} placeholder={yaConfirmo ? 'Qué pasó' : 'Por qué (opcional)'} style={{ ...campo, marginTop: 10 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
        <button onClick={() => { setAbierto(false); setMotivo(''); setError('') }} disabled={mandando} style={boton}>Cancelar</button>
        <button onClick={() => mandar('nopuedo')} disabled={mandando} style={{ ...boton, background: T.brand, borderColor: T.brand, color: '#fff' }}>{mandando ? 'Avisando…' : 'Avisar que no puedo'}</button>
      </div>
    </>}
    {error && <div style={{ marginTop: 10, background: T.brandSoft, color: T.brand, borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>{error}</div>}
  </div>
}

function Trabajo({ j, notas, viendoComo, conAcuerdo, onVolver, onGasto, onContestar, onNota }) {
  const falta = t => <span style={{ color: T.warn }}>tu PM todavía no cargó {t}</span>
  return <div>
    <button onClick={onVolver} style={{ border: 0, background: 'transparent', color: T.ink2, fontSize: 13, padding: '0 0 12px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>← Agenda</button>
    <p style={hola}>{j.cliente || j.proyecto}</p>
    <p style={sub}>{j.proyecto}{j.num ? ` · #${j.num}` : ''}</p>
    <div style={{ marginTop: 14 }}><Confirmar j={j} viendoComo={viendoComo} onContestar={onContestar} /></div>
    <div style={caja}><KV filas={[
      ['Cuándo', <>{diaSemana(j.fecha)} {j.fecha.slice(0, 5)} · {j.horario || falta('el horario')}</>],
      ['Dónde', j.lugar ? <>{j.lugar} · <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.lugar)}`} target="_blank" rel="noreferrer" style={{ color: T.ink }}>abrir en Maps</a></> : falta('el lugar')],
      ['Qué hacés', j.rol],
      ['Con quién', j.equipo.length ? j.equipo.map(e => `${e.quien} (${e.rol})`).join(', ') : 'Vas solo'],
      j.pm && ['Tu PM', j.pm],
      ['Cobrás', <><b style={{ fontFamily: MONO }}>{$(j.monto)}</b> · {conAcuerdo ? 'según tu acuerdo' : `se paga el ${j.sePaga}`}</>],
    ]} /></div>
    <div style={caja}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: T.ink }}>Qué vas a grabar</div>
      {j.clase
        ? <KV filas={[
            ['Clase', <><b>{j.clase}</b>{j.claseExplicada && <><br /><span style={{ color: T.ink2 }}>{j.claseExplicada}</span></>}</>],
            (j.formato || j.red) && ['Formato', [j.formato, j.red].filter(Boolean).join(' · ')],
            j.sale.length > 0 && ['De esto sale', j.sale.join(' + ')],
          ]} />
        : <p style={{ ...sub, margin: 0 }}>Todavía no está cargado qué clase de video es{j.sale.length ? ` (de esto sale: ${j.sale.join(' + ')})` : ''}. Preguntale a {j.pm || 'tu PM'}.</p>}
    </div>
    <div style={caja}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: T.ink }}>El material</div>
      {j.driveCrudo
        ? <><a href={j.driveCrudo} target="_blank" rel="noreferrer" style={{ ...boton, background: T.ink, borderColor: T.ink, color: '#fff' }}>Subir el crudo a Drive</a><p style={{ ...sub, marginTop: 7 }}>Con tu mail. No te ocupa espacio en tu Drive.</p></>
        : <p style={{ ...sub, margin: 0 }}>La carpeta de este trabajo todavía no está creada.</p>}
    </div>
    <NotaEditora j={j} notas={notas} viendoComo={viendoComo} onNota={onNota} />
    {onGasto && <div style={caja}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: T.ink }}>¿Pagaste algo vos?</div>
      <button onClick={onGasto} style={boton}>Pasar un gasto de este trabajo</button>
      <p style={{ ...sub, marginTop: 7 }}>Nafta, peaje, un taxi. Con la foto del ticket se suma a lo que cobrás.</p>
    </div>}
  </div>
}

// La foto del celular pesa 3 a 8 MB y el servidor no acepta más de 4,5: se achica acá (lado mayor 1600 px, JPEG).
// Un PDF (el comprobante de un peaje o de una app) viaja tal cual.
function leerArchivo(file) {
  return new Promise((ok, no) => {
    if (file.type === 'application/pdf') {
      if (file.size > 3.5 * 1024 * 1024) return no(new Error('El PDF pesa demasiado. Mandá una foto del ticket.'))
      const r = new FileReader(); r.onload = () => ok({ base64: String(r.result).split(',')[1], tipo: 'application/pdf', vista: '' }); r.onerror = () => no(new Error('No se pudo leer el archivo')); r.readAsDataURL(file); return
    }
    const url = URL.createObjectURL(file), img = new Image()
    img.onload = () => {
      try {
        const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas')
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
        const data = c.toDataURL('image/jpeg', 0.82)
        URL.revokeObjectURL(url); ok({ base64: data.split(',')[1], tipo: 'image/jpeg', vista: data })
      } catch (e) { URL.revokeObjectURL(url); no(new Error('No se pudo leer la foto. Probá sacarla de nuevo.')) }
    }
    img.onerror = () => { URL.revokeObjectURL(url); no(new Error('No se pudo leer la foto. Probá sacarla de nuevo.')) }
    img.src = url
  })
}

const ESTADO_GASTO = {
  pendiente: g => <Pill tono="falta">lo está mirando administración</Pill>,
  aprobado: g => <Pill tono="ok">aprobado{g.sePaga ? ` · se paga el ${g.sePaga.slice(0, 5)}` : ''}</Pill>,
  aparte: g => <Pill tono="ok">ya te lo pagaron</Pill>,
  rechazado: g => <Pill tono="rojo">no se aprobó</Pill>,
}
const campo = { width: '100%', padding: '12px 12px', borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, color: T.ink, fontSize: 15, outline: 'none' }
const rotulo = { fontSize: 12, fontWeight: 600, color: T.ink2, margin: '16px 0 7px' }

function CargarGasto({ datos, inicial, onListo, onVolver }) {
  const trabajos = datos.paraGasto || []
  const clave = j => j.num + '|' + j.slot
  const [cual, setCual] = useState(inicial && trabajos.some(j => clave(j) === inicial) ? inicial : trabajos[0] ? clave(trabajos[0]) : '')
  const [que, setQue] = useState(''), [monto, setMonto] = useState(''), [nota, setNota] = useState('')
  const [foto, setFoto] = useState(null), [error, setError] = useState(''), [mandando, setMandando] = useState(false), [hecho, setHecho] = useState(null)
  const j = trabajos.find(x => clave(x) === cual)
  async function elegirFoto(e) {
    const f = e.target.files && e.target.files[0]; if (!f) return
    setError('')
    try { setFoto({ ...(await leerArchivo(f)), nombre: f.name }) } catch (err) { setFoto(null); setError(err.message) }
  }
  async function mandar() {
    const m = parseInt(String(monto).replace(/\D/g, ''), 10) || 0
    if (!j) return setError('Elegí de qué trabajo fue')
    if (!que) return setError('Elegí qué fue el gasto')
    if (!(m > 0)) return setError('Poné cuánto gastaste')
    if (!foto) return setError('Falta la foto del ticket')
    setError(''); setMandando(true)
    try {
      const r = await fetch('/api/mi/ticket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ num: j.num, slot: j.slot, que, monto: m, nota, foto: foto.base64, fotoTipo: foto.tipo }) })
      const x = await r.json().catch(() => ({ error: r.status === 413 ? 'La foto pesa demasiado. Sacala de nuevo, más de lejos.' : 'No se pudo mandar. Probá de nuevo.' }))
      if (!x.ok) { setError(x.error || 'No se pudo mandar. Probá de nuevo.'); setMandando(false); return }
      setHecho({ ...x.ticket, sePaga: j.sePaga }); onListo && onListo({ ...x.ticket, sePaga: j.sePaga })
    } catch (e) { setError('Sin conexión. Probá de nuevo.') }
    setMandando(false)
  }
  if (hecho) return <div>
    <p style={hola}>Listo, ya lo mandaste</p>
    <p style={sub}>{hecho.que} · {$(hecho.monto)} · {j ? j.cliente : hecho.trabajo}</p>
    <div style={{ ...caja, marginTop: 16, fontSize: 13.5, lineHeight: 1.55, color: T.ink }}>Administración lo mira y, si está bien, <b>se suma a lo que cobrás el {hecho.sePaga ? hecho.sePaga.slice(0, 5) : '15'}</b>, junto con ese trabajo. Lo vas a ver en Facturar.</div>
    <button onClick={() => { setHecho(null); setQue(''); setMonto(''); setNota(''); setFoto(null) }} style={{ ...boton, marginTop: 6 }}>Cargar otro gasto</button>
    <button onClick={onVolver} style={{ ...boton, marginTop: 8, background: T.ink, borderColor: T.ink, color: '#fff' }}>Volver</button>
  </div>
  return <div>
    <button onClick={onVolver} style={{ border: 0, background: 'transparent', color: T.ink2, fontSize: 13, padding: '0 0 12px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>← Volver</button>
    <p style={hola}>Pasar un gasto</p>
    <p style={sub}>Algo que pagaste vos en un trabajo: nafta, peaje, un taxi. Con la foto del ticket.</p>
    {!trabajos.length
      ? <div style={{ ...caja, marginTop: 16, color: T.ink2, fontSize: 13, lineHeight: 1.55 }}>No tenés trabajos de los últimos 45 días para cargarles un gasto. Si es de uno más viejo, escribile a administración.</div>
      : <>
        <div style={rotulo}>¿De qué trabajo?</div>
        <select value={cual} onChange={e => setCual(e.target.value)} style={campo}>
          {trabajos.map(x => <option key={clave(x)} value={clave(x)}>{x.fecha.slice(0, 5)} · {x.cliente || x.proyecto} · {x.rol}</option>)}
        </select>
        <div style={rotulo}>¿Qué fue?</div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {(datos.queFue || []).map(q => <button key={q} onClick={() => setQue(q)} style={{ border: `1px solid ${que === q ? T.ink : T.border}`, background: que === q ? T.ink : T.surface, color: que === q ? '#fff' : T.ink, borderRadius: 10, padding: '10px 13px', fontSize: 13.5, fontWeight: que === q ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit' }}>{q}</button>)}
        </div>
        <div style={rotulo}>¿Cuánto?</div>
        <input inputMode="numeric" value={monto ? '$ ' + (parseInt(String(monto).replace(/\D/g, ''), 10) || 0).toLocaleString('es-AR') : ''} onChange={e => setMonto(e.target.value.replace(/\D/g, ''))} placeholder="$ 0" style={{ ...campo, fontFamily: MONO, fontSize: 18 }} />
        <div style={rotulo}>La foto del ticket</div>
        <label style={{ ...boton, cursor: 'pointer', ...(foto ? {} : { background: T.surfaceAlt }) }}>
          {foto ? 'Cambiar la foto' : 'Sacar o elegir la foto'}
          <input type="file" accept="image/*,application/pdf" onChange={elegirFoto} style={{ display: 'none' }} />
        </label>
        {foto && (foto.vista ? <img src={foto.vista} alt="El ticket" style={{ display: 'block', maxWidth: '100%', maxHeight: 260, borderRadius: 10, marginTop: 10, border: `1px solid ${T.border}` }} /> : <p style={{ ...sub, marginTop: 8 }}>{foto.nombre}</p>)}
        <div style={rotulo}>Algo para aclarar (opcional)</div>
        <input value={nota} onChange={e => setNota(e.target.value)} maxLength={300} placeholder="Ej: ida y vuelta a Pilar" style={campo} />
        {error && <div style={{ marginTop: 14, background: T.brandSoft, color: T.brand, borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>{error}</div>}
        {datos.viendoComo
          ? <p style={{ ...sub, marginTop: 16, lineHeight: 1.5 }}>Estás mirando como equipo: desde acá no se cargan gastos a nombre de otra persona.</p>
          : <button onClick={mandar} disabled={mandando} style={{ ...boton, marginTop: 18, background: mandando ? T.ink3 : T.brand, borderColor: mandando ? T.ink3 : T.brand, color: '#fff', padding: '14px 12px', fontSize: 15 }}>{mandando ? 'Mandando…' : 'Mandar a administración'}</button>}
      </>}
  </div>
}

// La factura del mes: PDF o foto. Va a la misma carpeta de Drive donde administración guarda las que llegan por mail,
// y queda linkeada en Pagos Staff. Si ya hay una, se ve y se puede cambiar.
function SubirFactura({ m, viendoComo, cuandoCobra }) {
  const [link, setLink] = useState(m.factura || ''), [subiendo, setSubiendo] = useState(false), [error, setError] = useState('')
  async function elegir(e) {
    const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return
    setError(''); setSubiendo(true)
    try {
      const a = await leerArchivo(f)
      const r = await fetch('/api/mi/factura', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mes: m.clave, archivo: a.base64, tipo: a.tipo }) })
      const x = await r.json().catch(() => ({ error: r.status === 413 ? 'El archivo pesa demasiado. Subila en PDF.' : 'No se pudo subir. Probá de nuevo.' }))
      if (!x.ok) setError(x.error || 'No se pudo subir. Probá de nuevo.')
      else { setLink(x.link); try { sessionStorage.setItem('mi-escribi', String(Date.now())) } catch (err) { /* sin storage */ } }
    } catch (err) { setError(err.message || 'Sin conexión. Probá de nuevo.') }
    setSubiendo(false)
  }
  return <div style={{ ...caja, marginTop: 12 }}>
    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: link ? T.pos : T.ink }}>{link ? `✓ Tu factura de ${m.nombre.toLowerCase()} está subida` : `Tu factura de ${m.nombre.toLowerCase()}`}</div>
    <p style={{ ...sub, margin: 0, lineHeight: 1.5 }}>Tus trabajos: <b style={{ fontFamily: MONO, color: T.ink }}>{$(m.honorarios)}</b>{m.viaticos > 0 ? <> · viáticos: <b style={{ fontFamily: MONO, color: T.ink }}>{$(m.viaticos)}</b></> : null}. {cuandoCobra ? `Se sube del 10 al 15. Cobrás según tu acuerdo: ${cuandoCobra}` : `Se sube del 10 al 15 y se paga el ${m.sePaga.slice(0, 5)}.`}</p>
    {link && <a href={link} target="_blank" rel="noreferrer" style={{ ...boton, marginTop: 10 }}>Ver la factura que subiste</a>}
    {viendoComo
      ? <p style={{ ...sub, marginTop: 8 }}>Estás mirando como equipo: desde acá no se suben facturas por otra persona.</p>
      : <label style={{ ...boton, marginTop: 8, cursor: subiendo ? 'default' : 'pointer', ...(link ? { color: T.ink2, fontWeight: 500 } : { background: T.ink, borderColor: T.ink, color: '#fff' }) }}>
          {subiendo ? 'Subiendo…' : link ? 'Cambiarla por otra' : 'Subir mi factura (PDF o foto)'}
          <input type="file" accept="application/pdf,image/*" onChange={elegir} disabled={subiendo} style={{ display: 'none' }} />
        </label>}
    {error && <div style={{ marginTop: 10, background: T.brandSoft, color: T.brand, borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>{error}</div>}
  </div>
}

function MisGastos({ gastos, onCargar }) {
  return <>
    <div style={tit}>Gastos que pagaste vos</div>
    <button onClick={onCargar} style={{ ...boton, marginBottom: 10 }}>＋ Pasar un gasto (nafta, peaje, taxi…)</button>
    {gastos.map(g => <div key={g.id} style={{ ...caja, padding: '11px 14px', marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>{g.que}</span>
        <b style={{ fontFamily: MONO, fontWeight: 600, fontSize: 13.5, color: T.ink }}>{$(g.monto)}</b>
      </div>
      <p style={{ ...sub, margin: '2px 0 8px', overflowWrap: 'anywhere' }}>{g.fecha ? g.fecha.slice(0, 5) + ' · ' : ''}{g.trabajo}</p>
      {(ESTADO_GASTO[g.estado] || ESTADO_GASTO.pendiente)(g)}
      {g.motivo && <p style={{ ...sub, margin: '8px 0 0', color: T.ink }}>{g.motivo}</p>}
    </div>)}
  </>
}

// El mes, para marcar los días que no puede. Un día con trabajo abre el trabajo (ahí se contesta); un día libre se
// marca con un toque y se desmarca con otro. Todo lo que se marca va a la solapa DISPONIBILIDAD y lo ve el que convoca.
const MESES_CORTO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const claveDMY = f => `${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}/${f.getFullYear()}`
function DiasNoPuedo({ datos, dias, viendoComo, onAbrir, onCambio }) {
  const hoy0 = aFecha(datos.hoy)
  const [mes, setMes] = useState(() => new Date(hoy0.getFullYear(), hoy0.getMonth(), 1))
  const [tocando, setTocando] = useState(''), [error, setError] = useState('')
  const trabajos = {}; datos.proximos.forEach(j => { (trabajos[j.fecha] = trabajos[j.fecha] || []).push(j) })
  const tope = new Date(hoy0.getTime() + (datos.diasAdelante || 120) * 864e5)
  const primero = new Date(mes), ultimo = new Date(mes.getFullYear(), mes.getMonth() + 1, 0)
  const celdas = []; for (let i = (primero.getDay() + 6) % 7; i > 0; i--) celdas.push(null)
  for (let d = 1; d <= ultimo.getDate(); d++) celdas.push(new Date(mes.getFullYear(), mes.getMonth(), d))
  async function tocar(f) {
    const k = claveDMY(f)
    if (trabajos[k]) return onAbrir(trabajos[k][0])
    if (viendoComo || f < hoy0 || f > tope) return
    const marcado = dias.includes(k)
    setError(''); setTocando(k)
    try {
      const x = await fetch('/api/mi/disponibilidad', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: marcado ? 'dia-libre' : 'dia', fecha: k }) }).then(r => r.json())
      if (!x.ok) setError(x.error || 'No se pudo guardar. Probá de nuevo.')
      else { try { sessionStorage.setItem('mi-escribi', String(Date.now())) } catch (e) { /* sin storage */ } onCambio(k, !marcado) }
    } catch (e) { setError('Sin conexión. Probá de nuevo.') }
    setTocando('')
  }
  const flecha = (n, txt) => <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + n, 1))} style={{ border: 0, background: 'transparent', color: T.ink2, fontSize: 18, padding: '0 8px', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1 }}>{txt}</button>
  const marcadosDelMes = dias.filter(k => { const f = aFecha(k); return f && f.getMonth() === mes.getMonth() && f.getFullYear() === mes.getFullYear() })
  return <div style={caja}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      {flecha(-1, '‹')}<b style={{ fontSize: 13.5, color: T.ink }}>{MESES_CORTO[mes.getMonth()]} {mes.getFullYear()}</b>{flecha(1, '›')}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginTop: 8 }}>
      {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <span key={i} style={{ textAlign: 'center', fontSize: 10, color: T.ink3, fontWeight: 600 }}>{d}</span>)}
      {celdas.map((f, i) => {
        if (!f) return <span key={i} />
        const k = claveDMY(f), conTrabajo = !!trabajos[k], marcado = dias.includes(k), pasado = f < hoy0, lejos = f > tope, esHoy = f.getTime() === hoy0.getTime()
        const st = conTrabajo ? { background: T.ink, color: '#fff', fontWeight: 700 } : marcado ? { background: T.brandSoft, color: T.brand, fontWeight: 700, textDecoration: 'line-through' } : { background: T.surfaceAlt, color: pasado || lejos ? T.ink3 : T.ink }
        return <button key={i} onClick={() => tocar(f)} disabled={tocando === k} style={{ border: esHoy ? `1.5px solid ${T.ink}` : '1px solid transparent', borderRadius: 8, padding: '8px 0', fontSize: 13, fontFamily: MONO, cursor: pasado || lejos ? 'default' : 'pointer', opacity: pasado ? 0.45 : tocando === k ? 0.5 : 1, ...st }}>{f.getDate()}</button>
      })}
    </div>
    <p style={{ ...sub, marginTop: 10, lineHeight: 1.5 }}>
      {viendoComo ? 'Estás mirando como equipo: desde acá no se marcan días por otra persona.' : <>Negro: tus trabajos. <span style={{ color: T.brand, fontWeight: 600 }}>Tachado</span>: días que avisaste que no podés. Tocá un día libre para marcarlo, y de nuevo para sacarlo.</>}
    </p>
    {marcadosDelMes.length > 0 && <p style={{ ...sub, margin: '4px 0 0', color: T.ink }}>No podés: {marcadosDelMes.map(k => `${diaSemana(k)} ${k.slice(0, 5)}`).join(' · ')}</p>}
    {error && <div style={{ marginTop: 10, background: T.brandSoft, color: T.brand, borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>{error}</div>}
  </div>
}

function Agenda({ datos, dias, viendoComo, onAbrir, onCambioDia }) {
  const hoy = datos.proximos.filter(j => j.esHoy), viene = datos.proximos.filter(j => !j.esHoy)
  const sinConfirmar = datos.proximos.filter(j => !j.respuesta).length
  return <div>
    <p style={hola}>Hola, {datos.primerNombre}</p>
    <p style={sub}>{hoy.length ? `Hoy: ${hoy.map(j => j.cliente).join(' y ')}` : viene.length ? `Tu próximo trabajo es el ${diaSemana(viene[0].fecha)} ${viene[0].fecha.slice(0, 5)}` : 'No tenés trabajos cargados de hoy en adelante'}{sinConfirmar > 0 ? ` · ${sinConfirmar === 1 ? 'uno sin confirmar' : `${sinConfirmar} sin confirmar`}` : ''}</p>
    {hoy.length > 0 && <><div style={tit}>Hoy</div>{hoy.map(j => <Tarjeta key={j.num + '-' + j.slot} j={j} onAbrir={() => onAbrir(j)} />)}</>}
    {viene.length > 0 && <><div style={tit}>Lo que viene</div>{viene.map(j => <Tarjeta key={j.num + '-' + j.slot + j.fecha} j={j} onAbrir={() => onAbrir(j)} />)}</>}
    {!datos.proximos.length && <div style={{ ...caja, marginTop: 18, color: T.ink2, fontSize: 13, lineHeight: 1.55 }}>Cuando te convoquen para un trabajo va a aparecer acá, con el horario, el lugar y qué hay que grabar.</div>}
    <div style={tit}>Días que no podés</div>
    <DiasNoPuedo datos={datos} dias={dias} viendoComo={viendoComo} onAbrir={onAbrir} onCambio={onCambioDia} />
    <AvisosCelular push={datos.push} viendoComo={viendoComo} compacto />
  </div>
}

function Facturar({ datos, gastos, onCargar }) {
  const [i, setI] = useState(0)
  const m = datos.meses[i]
  if (!m) return <div><p style={hola}>Para facturar</p><p style={sub}>Todavía no hay trabajos cargados a tu nombre.</p><MisGastos gastos={gastos} onCargar={onCargar} /></div>
  const todoPago = m.lineas.length > 0 && m.pendiente === 0
  return <div>
    <p style={hola}>Para facturar</p>
    <p style={sub}>En orden, día por día: lo cruzás contra tu agenda</p>
    <div style={{ display: 'flex', gap: 6, margin: '14px 0 12px', overflowX: 'auto' }}>
      {datos.meses.map((x, k) => <button key={x.clave} onClick={() => setI(k)} style={{ flex: '1 0 auto', border: `1px solid ${k === i ? T.ink : T.border}`, background: k === i ? T.ink : T.surface, color: k === i ? '#fff' : T.ink2, borderRadius: 10, padding: '9px 12px', fontSize: 12.5, fontWeight: k === i ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit' }}>{x.nombre}</button>)}
    </div>
    <div style={caja}>
      {!m.lineas.length && <p style={{ ...sub, margin: 0 }}>Sin trabajos este mes.</p>}
      {m.lineas.map((l, k) => <div key={k} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr) auto', gap: 10, padding: '10px 0', borderTop: k ? `1px solid ${T.border}` : 'none', alignItems: 'baseline', fontSize: 13 }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: T.ink2 }}>{l.dia}</span>
        <span style={{ color: T.ink, minWidth: 0 }}>{l.cliente}<span style={{ display: 'block', color: T.ink2, fontSize: 12 }}>{l.rol} · {l.proyecto}{l.viaticos ? ` · + viáticos ${$(l.viaticos)}` : ''}{!l.yaFue ? ' · todavía no fue' : ''}</span></span>
        <b style={{ fontFamily: MONO, fontWeight: 600, fontSize: 13, color: l.pagado ? T.pos : T.ink }}>{$(l.monto + l.viaticos)}</b>
      </div>)}
      {m.lineas.length > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: `2px solid ${T.ink}`, marginTop: 4, paddingTop: 11, fontWeight: 700, color: T.ink }}>
        <span>{m.lineas.length} {m.lineas.length === 1 ? 'trabajo' : 'trabajos'}</span><b style={{ fontFamily: MONO, fontWeight: 600, fontSize: 19 }}>{$(m.total)}</b>
      </div>}
    </div>
    {m.lineas.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {todoPago ? <Pill tono="ok">Pagado</Pill> : m.pagado > 0 ? <><Pill tono="ok">pagado {$(m.pagado)}</Pill><Pill tono="falta">falta {$(m.pendiente)}</Pill></> : <Pill>{datos.ficha?.acuerdo?.cuandoCobra ? 'se paga según tu acuerdo' : `se paga el ${m.sePaga}, todo junto`}</Pill>}
      {m.enCurso && m.faltanHacer > 0 && <Pill>faltan {m.faltanHacer} del mes</Pill>}
    </div>}
    {m.lineas.length > 0 && !m.enCurso && <SubirFactura key={m.clave} m={m} viendoComo={!!datos.viendoComo} cuandoCobra={datos.ficha?.acuerdo?.cuandoCobra} />}
    {!todoPago && m.lineas.length > 0 && <p style={{ ...sub, marginTop: 10, lineHeight: 1.5 }}>Si algo no coincide con lo que hiciste, avisale a administración antes del 15: <a href="mailto:admin@somosmagma.com" style={{ color: T.ink }}>admin@somosmagma.com</a></p>}
    <MisGastos gastos={gastos} onCargar={onCargar} />
  </div>
}

function Entregas({ datos, notasDe, viendoComo, onNota }) {
  const tono = { entregado: 'ok', cliente: 'ok', espera: 'falta' }
  return <div>
    <p style={hola}>Cómo quedó lo que filmaste</p>
    <p style={sub}>En qué anda cada trabajo, el link cuando se entrega, y tus notas para la editora</p>
    <div style={tit}>Últimos 3 meses</div>
    {!datos.entregas.length && <div style={{ ...caja, color: T.ink2, fontSize: 13 }}>Todavía no hay ediciones de trabajos tuyos.</div>}
    {datos.entregas.map(e => <div key={e.num} style={caja}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{e.cliente}</div>
      <p style={{ ...sub, margin: '1px 0 0' }}>{e.proyecto} · {e.fecha.slice(0, 5)}{e.piezas > 1 ? ` · ${e.listas} de ${e.piezas} piezas listas` : ''}</p>
      <div style={{ marginTop: 8 }}><Pill tono={tono[e.etapa]}>{e.texto}</Pill>{e.etapa !== 'entregado' && e.entregadas.length > 0 && <span style={{ fontSize: 12, color: T.ink2, marginLeft: 8 }}>ya salió: {e.entregadas.join(', ')}</span>}</div>
      {e.link && <a href={e.link} target="_blank" rel="noreferrer" style={{ ...boton, background: T.ink, borderColor: T.ink, color: '#fff', marginTop: 10 }}>Ver cómo quedó</a>}
      {e.links.filter(x => x.link !== e.link).map((x, k) => <a key={k} href={x.link} target="_blank" rel="noreferrer" style={{ ...boton, marginTop: 8 }}>Ver {x.pieza}</a>)}
      {e.etapa === 'entregado' && !e.link && !e.links.length && <p style={{ ...sub, marginTop: 8 }}>Entregado, pero el link todavía no está cargado. Pedíselo a tu PM.</p>}
      {(e.puedeNota || notasDe(e).length > 0) && <NotaEditora j={e} notas={notasDe(e)} viendoComo={viendoComo} onNota={onNota} compacto />}
    </div>)}
  </div>
}

// Cuánto laburó con Magma: por año y, abriendo el año, mes a mes. Jornadas y lo que cobró por ellas.
function Historial({ datos }) {
  const anios = datos.anios || [], hist = datos.historial || []
  const [abierto, setAbierto] = useState(() => anios[0]?.anio || null)
  if (!anios.length) return null
  return <>
    <div style={tit}>Tu historial</div>
    {anios.map(a => <div key={a.anio} style={{ ...caja, padding: '11px 14px' }}>
      <button onClick={() => setAbierto(abierto === a.anio ? null : a.anio)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', width: '100%', border: 0, background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: 'inherit', color: T.ink }}>
        <span><b style={{ fontSize: 15 }}>{a.anio}</b><span style={{ ...sub, display: 'inline', marginLeft: 8 }}>{a.jornadas} {a.jornadas === 1 ? 'jornada' : 'jornadas'} en {a.meses} {a.meses === 1 ? 'mes' : 'meses'}</span></span>
        <b style={{ fontFamily: MONO, fontWeight: 600, fontSize: 14 }}>{$(a.monto)}</b>
      </button>
      {abierto === a.anio && <div style={{ marginTop: 8 }}>
        {hist.filter(h => h.anio === a.anio).map(h => <div key={h.clave} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, padding: '7px 0', borderTop: `1px solid ${T.border}`, fontSize: 13, alignItems: 'baseline' }}>
          <span style={{ color: T.ink }}>{h.mes}<span style={{ display: 'block', color: T.ink2, fontSize: 12 }}>{h.jornadas} {h.jornadas === 1 ? 'jornada' : 'jornadas'}{h.rodajes !== h.jornadas ? ` (${h.rodajes} de rodaje)` : ''} · {h.clientes} {h.clientes === 1 ? 'cliente' : 'clientes'}</span></span>
          <b style={{ fontFamily: MONO, fontWeight: 600, fontSize: 13, color: T.ink }}>{$(h.monto)}</b>
        </div>)}
      </div>}
    </div>)}
  </>
}

function Ficha({ datos, onSalir }) {
  const f = datos.ficha
  return <div>
    <p style={hola}>{f.nombre}</p>
    <p style={sub}>Así te tiene cargado Magma</p>
    <div style={tit}>Tu trabajo</div>
    <div style={caja}><KV filas={[
      ['Hacés', f.rubro || '—'], f.zona && ['Zona', f.zona],
      ['Con Magma', `${f.trabajos} trabajos${f.desde ? ` desde ${f.desde.slice(3)}` : ''}`],
    ]} /></div>
    {f.acuerdo && <>
      <div style={tit}>Tu acuerdo con Magma</div>
      {f.acuerdo.contador && f.acuerdo.minimo > 0 && <div style={caja}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{f.acuerdo.contador.mes}</span>
          <b style={{ fontFamily: MONO, fontWeight: 600, fontSize: 19, color: T.ink }}>{f.acuerdo.contador.van} de {f.acuerdo.minimo}</b>
        </div>
        <div style={{ height: 8, borderRadius: 8, background: T.surfaceAlt, marginTop: 8, overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.min(100, Math.round(f.acuerdo.contador.van / f.acuerdo.minimo * 100))}%`, background: f.acuerdo.contador.van >= f.acuerdo.minimo ? T.pos : T.ink }} /></div>
        <p style={{ ...sub, marginTop: 8, lineHeight: 1.5 }}>Jornadas de tu acuerdo cargadas este mes ({f.acuerdo.contador.hechas} ya hechas).{f.acuerdo.contador.extras > 0 ? ` ${f.acuerdo.contador.extras} ${f.acuerdo.contador.extras === 1 ? 'es extra' : 'son extra'}, a ${$(f.acuerdo.precioExtra)} cada una.` : f.acuerdo.contador.van < f.acuerdo.minimo ? ` Te faltan ${f.acuerdo.minimo - f.acuerdo.contador.van} para llegar al mínimo.` : ' Llegaste al mínimo.'}</p>
      </div>}
      <div style={caja}><KV filas={[
        f.acuerdo.alcance && ['Alcance', f.acuerdo.alcance],
        f.acuerdo.modalidad && ['Modalidad', f.acuerdo.modalidad],
        f.acuerdo.minimo > 0 && ['Mínimo', <>{f.acuerdo.minimo} por mes{f.acuerdo.montoMinimo > 0 ? <> · <b style={{ fontFamily: MONO }}>{$(f.acuerdo.montoMinimo)}</b></> : null}</>],
        f.acuerdo.unidad && ['Qué cuenta', f.acuerdo.unidad],
        f.acuerdo.precio > 0 && ['Cada una', <><b style={{ fontFamily: MONO }}>{$(f.acuerdo.precio)}</b>{f.acuerdo.duracion ? ` · ${f.acuerdo.duracion}` : ''}</>],
        f.acuerdo.precioExtra > 0 && ['Las extra', <><b style={{ fontFamily: MONO }}>{$(f.acuerdo.precioExtra)}</b> cada una, pasado el mínimo</>],
        f.acuerdo.horaAdicional && ['Hora adicional', f.acuerdo.horaAdicional],
        f.acuerdo.viaticos && ['Viáticos', f.acuerdo.viaticos],
        f.acuerdo.cancelacion && ['Cancelación', f.acuerdo.cancelacion],
        f.acuerdo.entrega && ['Entrega', f.acuerdo.entrega],
        f.acuerdo.equipos && ['Equipos', f.acuerdo.equipos],
        f.acuerdo.cuandoCobra && ['Cuándo cobrás', f.acuerdo.cuandoCobra],
        f.acuerdo.monotributo && ['Monotributo', f.acuerdo.monotributo],
        (f.acuerdo.desde || f.acuerdo.hasta) && ['Vigencia', [f.acuerdo.desde && `desde ${f.acuerdo.desde}`, f.acuerdo.hasta && `hasta ${f.acuerdo.hasta}`].filter(Boolean).join(' ')],
      ]} />
      {f.acuerdo.doc && !/claude\.ai\/code\//.test(f.acuerdo.doc) && <a href={f.acuerdo.doc} target="_blank" rel="noreferrer" style={{ ...boton, marginTop: 12 }}>Ver el acuerdo completo</a>}
      </div>
    </>}
    <Historial datos={datos} />
    <div style={tit}>Para pagarte</div>
    <div style={caja}><KV filas={[
      ['Banco', f.banco || '—'], ['Alias', <span style={{ fontFamily: MONO }}>{f.alias || 'sin cargar'}</span>],
      ['CBU', <span style={{ fontFamily: MONO }}>{f.cbu || 'sin cargar'}</span>], ['CUIT', <span style={{ fontFamily: MONO }}>{f.cuit || 'sin cargar'}</span>],
      ['Mail', f.mail], f.celular && ['Celular', <span style={{ fontFamily: MONO }}>{f.celular}</span>],
    ]} /></div>
    <div style={tit}>Avisos</div>
    <AvisosCelular push={datos.push} viendoComo={!!datos.viendoComo} />
    <p style={{ ...sub, lineHeight: 1.5 }}>Se ve solo el final de cada dato, para que confirmes que es el tuyo. Si algo está mal o cambió, escribile a <a href="mailto:admin@somosmagma.com" style={{ color: T.ink }}>admin@somosmagma.com</a>: los datos bancarios no se cambian desde acá.</p>
    {onSalir && <button onClick={onSalir} style={{ ...boton, marginTop: 18, color: T.ink2, fontWeight: 500 }}>Cerrar sesión</button>}
  </div>
}

const TABS = [['agenda', 'Agenda'], ['facturar', 'Facturar'], ['entregas', 'Cómo quedó'], ['ficha', 'Mi ficha']]

export default function MiMagma({ datos, onSalir, tabInicial = 'agenda', abrirNum = null }) {
  const [tab, setTab] = useState(tabInicial)
  const [job, setJob] = useState(abrirNum ? datos.proximos.find(j => j.num === abrirNum) || null : null)
  // Cargar un gasto: null = cerrado · '' = abierto sin trabajo elegido · "num|slot" = abierto con ese trabajo
  const [gasto, setGasto] = useState(null)
  // Los tickets que mandó recién: /api/mi guarda los datos un minuto, así que se suman acá para que los vea ya.
  const [nuevos, setNuevos] = useState([])
  const gastos = [...nuevos.filter(n => !(datos.gastos || []).some(g => g.id === n.id)), ...(datos.gastos || [])]
  // Lo que contestó recién (confirmo / no puedo / un día), para verlo ya sin esperar la lectura siguiente.
  const [respuestas, setRespuestas] = useState({})
  const [dias, setDias] = useState(datos.diasNoPuedo || [])
  const conRespuesta = j => { const r = respuestas[j.num + '|' + j.slot]; return r === undefined ? j : { ...j, respuesta: r } }
  const vista = { ...datos, proximos: (datos.proximos || []).map(conRespuesta) }
  const contestar = (j, r) => setRespuestas(x => ({ ...x, [j.num + '|' + j.slot]: r }))
  // Las notas que dejó recién para la editora, por trabajo: se suman a las que ya venían del sheet.
  const [notasNuevas, setNotasNuevas] = useState({})
  const notasDe = j => [...(notasNuevas[j.num] || []), ...(j.notas || [])]
  const sumarNota = (num, n) => setNotasNuevas(x => ({ ...x, [num]: [n, ...(x[num] || [])] }))
  const arriba = () => { if (typeof window !== 'undefined') window.scrollTo(0, 0) }
  const abrirGasto = cual => { setGasto(cual || ''); arriba() }
  const sePuede = j => (datos.paraGasto || []).some(x => x.num === j.num && x.slot === j.slot)
  const ir = t => { setTab(t); setJob(null); setGasto(null); arriba() }
  return <div style={{ maxWidth: 520, margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
    <div style={{ flex: 1, padding: '18px 16px 96px' }}>
      {gasto !== null ? <CargarGasto datos={datos} inicial={gasto} onListo={t => setNuevos(n => [t, ...n])} onVolver={() => { setGasto(null); arriba() }} />
        : job ? <Trabajo j={conRespuesta(job)} notas={notasDe(job)} viendoComo={!!datos.viendoComo} conAcuerdo={!!datos.ficha?.acuerdo?.cuandoCobra} onVolver={() => setJob(null)} onGasto={sePuede(job) ? () => abrirGasto(job.num + '|' + job.slot) : null} onContestar={contestar} onNota={sumarNota} />
        : tab === 'agenda' ? <Agenda datos={vista} dias={dias} viendoComo={!!datos.viendoComo} onAbrir={j => { setJob(j); arriba() }} onCambioDia={(k, marcado) => setDias(d => marcado ? [...d.filter(x => x !== k), k] : d.filter(x => x !== k))} />
        : tab === 'facturar' ? <Facturar datos={datos} gastos={gastos} onCargar={() => abrirGasto('')} />
        : tab === 'entregas' ? <Entregas datos={datos} notasDe={notasDe} viendoComo={!!datos.viendoComo} onNota={sumarNota} />
        : <Ficha datos={datos} onSalir={onSalir} />}
    </div>
    <nav style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: T.surface, borderTop: `1px solid ${T.border}`, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div style={{ maxWidth: 520, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)' }}>
        {TABS.map(([k, l]) => { const on = gasto !== null ? k === 'facturar' : !job ? tab === k : k === 'agenda'
          return <button key={k} onClick={() => ir(k)} style={{ border: 0, background: 'transparent', padding: '10px 2px 12px', fontSize: 11.5, fontWeight: on ? 700 : 500, color: on ? T.ink : T.ink3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'pointer', fontFamily: 'inherit' }}>
            <i style={{ width: 18, height: 3, borderRadius: 3, background: on ? T.brand : 'transparent' }} />{l}
          </button> })}
      </div>
    </nav>
  </div>
}
