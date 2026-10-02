// ============================ MI MAGMA ============================
// El espacio de cada freelancer, pensado para el celular: su agenda, lo que tiene para
// facturar, cómo quedó lo que filmó y su ficha. Recibe `datos` ya recortados por
// lib/mi-magma.js (la aduana): acá no hay nada que filtrar ni que esconder.
//
// Casi todo es SOLO LECTURA. Lo que escribe:
//   · cargar un gasto de un trabajo con la foto del ticket (/api/mi/ticket → solapa TICKETS; lo aprueba administración)
//   · "Confirmo" / "No puedo" en la ficha de un trabajo, y "este día no puedo" en el calendario de la agenda
//     (/api/mi/disponibilidad → solapa DISPONIBILIDAD; un "no puedo" le llega por mail al PM, la app no lo saca sola)
// La nota al editor y las referencias vienen en la etapa siguiente.
//
// Subcomponentes a nivel de módulo a propósito (si van adentro, React los remonta).

import React, { useState } from 'react'
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

// Contestar sobre un trabajo. "Confirmo" es un toque. "No puedo" pide (opcional) por qué, y avisa que el PM se entera
// ya: la persona sigue cargada hasta que el PM ponga a otro, así nadie queda afuera por un toque de más.
function Confirmar({ j, viendoComo, onContestar }) {
  const [abierto, setAbierto] = useState(false), [motivo, setMotivo] = useState(''), [mandando, setMandando] = useState(false), [error, setError] = useState('')
  const r = j.respuesta
  async function mandar(accion) {
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
      <p style={{ ...sub, marginTop: 3 }}>El {r.cuando.slice(0, 5)}. Si te surge algo, <button onClick={() => setAbierto(true)} style={{ border: 0, background: 'transparent', color: T.ink, fontWeight: 600, padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, textDecoration: 'underline' }}>avisá que no podés</button>.</p>
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
      <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Avisar que no podés</div>
      <p style={{ ...sub, marginTop: 3, lineHeight: 1.5 }}>Le llega un mail a {pm} ahora mismo. Vos seguís cargado hasta que ponga a otra persona.</p>
      {j.urgente && <div style={{ marginTop: 10, background: T.brandSoft, color: T.brand, borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>Falta poco para este trabajo: además de avisar acá, llamá a {pm}.</div>}
      <input value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={200} placeholder="Por qué (opcional)" style={{ ...campo, marginTop: 10 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
        <button onClick={() => { setAbierto(false); setMotivo(''); setError('') }} disabled={mandando} style={boton}>Cancelar</button>
        <button onClick={() => mandar('nopuedo')} disabled={mandando} style={{ ...boton, background: T.brand, borderColor: T.brand, color: '#fff' }}>{mandando ? 'Avisando…' : 'Avisar que no puedo'}</button>
      </div>
    </>}
    {error && <div style={{ marginTop: 10, background: T.brandSoft, color: T.brand, borderRadius: 10, padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>{error}</div>}
  </div>
}

function Trabajo({ j, viendoComo, onVolver, onGasto, onContestar }) {
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
      ['Cobrás', <><b style={{ fontFamily: MONO }}>{$(j.monto)}</b> · se paga el {j.sePaga}</>],
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
      {todoPago ? <Pill tono="ok">Pagado</Pill> : m.pagado > 0 ? <><Pill tono="ok">pagado {$(m.pagado)}</Pill><Pill tono="falta">falta {$(m.pendiente)}</Pill></> : <Pill>se paga el {m.sePaga}, todo junto</Pill>}
      {m.enCurso && m.faltanHacer > 0 && <Pill>faltan {m.faltanHacer} del mes</Pill>}
    </div>}
    {!todoPago && m.lineas.length > 0 && <p style={{ ...sub, marginTop: 10, lineHeight: 1.5 }}>Si algo no coincide con lo que hiciste, avisale a administración antes del 15: <a href="mailto:admin@somosmagma.com" style={{ color: T.ink }}>admin@somosmagma.com</a></p>}
    <MisGastos gastos={gastos} onCargar={onCargar} />
  </div>
}

function Entregas({ datos }) {
  const tono = { entregado: 'ok', cliente: 'ok', espera: 'falta' }
  return <div>
    <p style={hola}>Cómo quedó lo que filmaste</p>
    <p style={sub}>En qué anda cada trabajo, y el link cuando se entrega</p>
    <div style={tit}>Últimos 3 meses</div>
    {!datos.entregas.length && <div style={{ ...caja, color: T.ink2, fontSize: 13 }}>Todavía no hay ediciones de trabajos tuyos.</div>}
    {datos.entregas.map(e => <div key={e.num} style={caja}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{e.cliente}</div>
      <p style={{ ...sub, margin: '1px 0 0' }}>{e.proyecto} · {e.fecha.slice(0, 5)}{e.piezas > 1 ? ` · ${e.listas} de ${e.piezas} piezas listas` : ''}</p>
      <div style={{ marginTop: 8 }}><Pill tono={tono[e.etapa]}>{e.texto}</Pill></div>
      {e.link && <a href={e.link} target="_blank" rel="noreferrer" style={{ ...boton, background: T.ink, borderColor: T.ink, color: '#fff', marginTop: 10 }}>Ver cómo quedó</a>}
    </div>)}
  </div>
}

function Ficha({ datos, onSalir }) {
  const f = datos.ficha
  return <div>
    <p style={hola}>{f.nombre}</p>
    <p style={sub}>Así te tiene cargado Magma</p>
    <div style={tit}>Tu trabajo</div>
    <div style={caja}><KV filas={[
      ['Hacés', f.rubro || '—'], f.zona && ['Zona', f.zona],
      f.acuerdo && ['Acuerdo', <>{f.acuerdo.alcance}{f.acuerdo.minimo ? <><br /><span style={{ color: T.ink2 }}>{f.acuerdo.minimo} jornadas por mes · {$(f.acuerdo.precio)} cada una</span></> : null}</>],
      ['Con Magma', `${f.trabajos} trabajos cargados`],
    ]} /></div>
    <div style={tit}>Para pagarte</div>
    <div style={caja}><KV filas={[
      ['Banco', f.banco || '—'], ['Alias', <span style={{ fontFamily: MONO }}>{f.alias || 'sin cargar'}</span>],
      ['CBU', <span style={{ fontFamily: MONO }}>{f.cbu || 'sin cargar'}</span>], ['CUIT', <span style={{ fontFamily: MONO }}>{f.cuit || 'sin cargar'}</span>],
      ['Mail', f.mail], f.celular && ['Celular', <span style={{ fontFamily: MONO }}>{f.celular}</span>],
    ]} /></div>
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
  const arriba = () => { if (typeof window !== 'undefined') window.scrollTo(0, 0) }
  const abrirGasto = cual => { setGasto(cual || ''); arriba() }
  const sePuede = j => (datos.paraGasto || []).some(x => x.num === j.num && x.slot === j.slot)
  const ir = t => { setTab(t); setJob(null); setGasto(null); arriba() }
  return <div style={{ maxWidth: 520, margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
    <div style={{ flex: 1, padding: '18px 16px 96px' }}>
      {gasto !== null ? <CargarGasto datos={datos} inicial={gasto} onListo={t => setNuevos(n => [t, ...n])} onVolver={() => { setGasto(null); arriba() }} />
        : job ? <Trabajo j={conRespuesta(job)} viendoComo={!!datos.viendoComo} onVolver={() => setJob(null)} onGasto={sePuede(job) ? () => abrirGasto(job.num + '|' + job.slot) : null} onContestar={contestar} />
        : tab === 'agenda' ? <Agenda datos={vista} dias={dias} viendoComo={!!datos.viendoComo} onAbrir={j => { setJob(j); arriba() }} onCambioDia={(k, marcado) => setDias(d => marcado ? [...d.filter(x => x !== k), k] : d.filter(x => x !== k))} />
        : tab === 'facturar' ? <Facturar datos={datos} gastos={gastos} onCargar={() => abrirGasto('')} />
        : tab === 'entregas' ? <Entregas datos={datos} />
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
