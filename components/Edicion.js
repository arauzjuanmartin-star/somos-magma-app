// ============================ MÓDULO EDICIÓN ============================
// El tablero de post-producción. Una fila por ENTREGABLE (no por proyecto):
// un evento puede tener resumen + reels + fotos, con gente y plazos distintos.
//
// De dónde sale cada cosa:
//   · cliente / proyecto / entregable / a cargo  → PROYECTOS (los trae /api/edicion-sync)
//   · estado / prioridad / plazo / notas / links → solapa EDICION (los carga el equipo)
//   · "Cómo trabajamos"                          → solapa EDICION_INFO
//
// Todos los subcomponentes están a nivel de módulo A PROPÓSITO: definirlos adentro
// hace que React los remonte en cada tecla y los inputs pierdan el foco.

import React, { useState, useMemo, useEffect } from 'react'
import { T, MONO } from '../lib/ui'
import {
  ESTADOS, PRIORIDADES, semaforo, COLOR_SEM, estaCerrado, ESTADO_IDX,
  limpiarPedido, parseFechaAR, aAR, aISO, fechaSugerida, hoyCero,
} from '../lib/edicion'

// ---------------------------------------------------------------- estilos
const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12 }
const inp = { padding: '7px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, fontSize: 13, color: T.ink, outline: 'none', fontFamily: 'inherit' }
const btn = { padding: '7px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.ink2, fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }
const btnPri = { ...btn, background: T.brand, color: '#fff', border: 'none', fontWeight: 600 }
const lbl = { fontSize: 10.5, color: T.ink3, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: 5 }

const COLOR_PRIO = { Urgente: T.brand, Normal: T.ink3, Baja: T.ink3 }
const FILTROS = [
  { id: 'activos',  label: 'Todo lo abierto' },
  { id: 'rojo',     label: 'Atrasado' },
  { id: 'naranja',  label: 'Vence hoy' },
  { id: 'amarillo', label: 'Esta semana' },
  { id: 'verde',    label: 'En fecha' },
  { id: 'listo',    label: 'Cerrados' },
]

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const nombreDe = mail => String(mail || '').split('@')[0]

// ---------------------------------------------------------------- principal
export default function Edicion({ data, onRefresh, showToast, mail }) {
  const [vista, setVista] = useState('tablero')   // 'tablero' | 'info'
  const [local, setLocal] = useState({})          // cambios ya aplicados en pantalla
  const [filtro, setFiltro] = useState('activos')
  const [q, setQ] = useState('')
  const [personaF, setPersonaF] = useState('todos')
  const [abierto, setAbierto] = useState(null)
  const [sincro, setSincro] = useState(false)
  const [drive, setDrive] = useState({})

  const crudas = data?.edicion || []
  const hoy = hoyCero()

  const contactos = data?.contactos || []
  const mailsDe = (agencia, cliente) => {
    const k = [norm(agencia), norm(cliente)].filter(Boolean)
    return [...new Set(contactos.filter(c => k.includes(norm(c.Agencia))).map(c => String(c.Mail || '').trim()).filter(m => /@/.test(m)))]
  }

  const filas = useMemo(() => crudas.map(f => {
    const id = String(f.ID || '').trim()
    const m = { ...f, ...(local[id] || {}) }
    m.__sem = semaforo(m, hoy)
    return m
  }), [crudas, local]) // eslint-disable-line

  const personas = useMemo(() => [...new Set(filas.map(f => String(f.Editor || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [filas])
  const consultas = useMemo(() => filas.filter(f => String(f.Consulta || '').trim()), [filas])

  const visibles = useMemo(() => {
    const nq = norm(q.trim())
    return filas.filter(f => {
      const nivel = f.__sem.nivel
      if (filtro === 'activos' && nivel === 'listo') return false
      if (filtro !== 'activos' && filtro !== nivel) return false
      if (personaF !== 'todos' && String(f.Editor || '').trim() !== personaF) return false
      if (nq && !norm([f['N° presupuesto'], f.Cliente, f.Agencia, f.Proyecto, f.Entregable, f.Editor, f.Notas].join(' ')).includes(nq)) return false
      return true
    })
  }, [filas, filtro, q, personaF])

  const grupos = useMemo(() => {
    const m = new Map()
    visibles.forEach(f => {
      const k = String(f['N° presupuesto'] || '—')
      if (!m.has(k)) m.set(k, { num: k, fecha: f['Fecha Evento'], cliente: f.Cliente, agencia: f.Agencia, proyecto: f.Proyecto, linkCrudo: '', linkEntrega: '', items: [] })
      const g = m.get(k)
      g.items.push(f)
      if (!g.linkCrudo && f['Link crudo']) g.linkCrudo = f['Link crudo']
      if (!g.linkEntrega && f['Link entrega']) g.linkEntrega = f['Link entrega']
    })
    const gs = [...m.values()]
    gs.forEach(g => { g.items.sort((a, b) => a.__sem.orden - b.__sem.orden); g.orden = Math.min(...g.items.map(i => i.__sem.orden)) })
    return gs.sort((a, b) => a.orden - b.orden)
  }, [visibles])

  const cuenta = useMemo(() => {
    const c = { activos: 0, rojo: 0, naranja: 0, amarillo: 0, verde: 0, listo: 0 }
    filas.forEach(f => { c[f.__sem.nivel]++; if (f.__sem.nivel !== 'listo') c.activos++ })
    return c
  }, [filas])

  async function guardar(id, campos) {
    setLocal(l => ({ ...l, [id]: { ...(l[id] || {}), ...campos } }))
    try {
      const r = await fetch('/api/edicion-guardar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, campos }) })
      const j = await r.json()
      if (!j.ok) showToast(j.error || 'No se pudo guardar', 'err')
    } catch (e) { showToast('Error de conexión', 'err') }
  }

  async function sincronizar() {
    setSincro(true)
    try {
      const r = await fetch('/api/edicion-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const j = await r.json()
      if (!j.ok) showToast(j.error || 'No se pudo sincronizar', 'err')
      else { showToast(j.nuevas ? `${j.nuevas} entregables nuevos` : 'Todo al día ✓'); setLocal({}); onRefresh && onRefresh() }
    } catch (e) { showToast('Error de conexión', 'err') }
    setSincro(false)
  }

  async function carpeta(num, destinos, compartir) {
    setDrive(d => ({ ...d, [num]: 'creando' }))
    try {
      const r = await fetch('/api/drive-carpeta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ num, destinos, compartir }) })
      const j = await r.json()
      if (!j.ok) { showToast(j.error || 'No se pudo crear la carpeta', 'err'); setDrive(d => ({ ...d, [num]: null })); return }
      setDrive(d => ({ ...d, [num]: j.crudo?.link || null }))
      if (j.compartido) {
        const n = j.compartido.ok.length
        showToast(n ? `Compartida con ${n} ${n === 1 ? 'persona' : 'personas'} ✓` : 'Nadie del staff tiene mail cargado en RRHH', n ? 'ok' : 'err')
      } else showToast(j.crudo?.creada || j.entregas?.creada ? 'Carpetas creadas ✓' : 'Las carpetas ya existían')
      const ids = filas.filter(f => String(f['N° presupuesto']) === String(num)).map(f => f.ID)
      setLocal(l => {
        const n = { ...l }
        ids.forEach(i => {
          n[i] = { ...(n[i] || {}) }
          if (j.crudo?.link) n[i]['Link crudo'] = j.crudo.link
          if (j.entregas?.link) n[i]['Link entrega'] = j.entregas.link
        })
        return n
      })
    } catch (e) { showToast('Error de conexión', 'err'); setDrive(d => ({ ...d, [num]: null })) }
  }

  async function crudoAlCliente(num, mails) {
    try {
      const r = await fetch('/api/drive-crudo-cliente', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ num, mails }) })
      const j = await r.json()
      if (!j.ok) { showToast(j.error || 'No se pudo', 'err'); return null }
      const n = j.permisos?.ok?.length || 0
      showToast(n ? `Crudo disponible para ${n} ${n === 1 ? 'mail' : 'mails'} ✓` : 'Acceso directo puesto — falta darle acceso a alguien')
      return j
    } catch (e) { showToast('Error de conexión', 'err'); return null }
  }

  // Preguntar / responder: la consulta queda pegada al entregable y lo sube al tope.
  const preguntar = (f, texto) => {
    const t = texto.trim(); if (!t) return
    guardar(f.ID, { Consulta: `${nombreDe(mail)}: ${t}`, Notas: lineaBitacora(mail, '🙋 ' + t) + (String(f.Notas || '').trim() ? '\n' + f.Notas : '') })
  }
  const responder = (f, texto) => {
    const t = texto.trim()
    guardar(f.ID, { Consulta: '', Notas: (t ? lineaBitacora(mail, '💬 ' + t) + '\n' : '') + String(f.Notas || '') })
  }

  const props = { guardar, carpeta, crudoAlCliente, mail, preguntar, responder }

  return <div>
    <div style={{ marginBottom: 14 }}>
      <h1 style={{ fontSize: 21, fontWeight: 700, color: T.ink, margin: 0 }}>Edición</h1>
      <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 4 }}>Qué se está editando, quién lo tiene y para cuándo. Lo que cambia acá queda en el sheet.</div>
    </div>

    <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: `1px solid ${T.border}` }}>
      {[['tablero', 'Tablero'], ['info', 'Cómo trabajamos']].map(([id, l]) => (
        <button key={id} onClick={() => setVista(id)} style={{
          padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
          fontSize: 13.5, fontWeight: vista === id ? 700 : 500, color: vista === id ? T.ink : T.ink2,
          borderBottom: `2px solid ${vista === id ? T.brand : 'transparent'}`, marginBottom: -1,
        }}>{l}</button>
      ))}
    </div>

    {vista === 'info' ? <Info mail={mail} showToast={showToast} /> : <>
      {!crudas.length
        ? <div style={{ ...card, padding: 28, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.ink, marginBottom: 8 }}>Todavía no hay nada en el tablero</div>
            <div style={{ fontSize: 13, color: T.ink2, marginBottom: 18, lineHeight: 1.6 }}>
              Se arma solo con los entregables de post de los proyectos aprobados<br />
              (fotos, Edit 60s, Edit 60s+, Motion, reels…) de los últimos 30 días en adelante.
            </div>
            <button onClick={sincronizar} disabled={sincro} style={btnPri}>{sincro ? 'Buscando…' : 'Traer los entregables'}</button>
            <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 14 }}>Si da error de solapa, correr <code style={{ fontFamily: MONO }}>node scripts/edicion-setup.mjs --escribir</code></div>
          </div>
        : <>
          {consultas.length > 0 && <Consultas consultas={consultas} responder={responder} setAbierto={setAbierto} />}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
            <Kpi n={cuenta.rojo} l="atrasados" c={COLOR_SEM.rojo.fg} onClick={() => setFiltro('rojo')} activo={filtro === 'rojo'} />
            <Kpi n={cuenta.naranja} l="vencen hoy" c={COLOR_SEM.naranja.fg} onClick={() => setFiltro('naranja')} activo={filtro === 'naranja'} />
            <Kpi n={cuenta.amarillo} l="esta semana" c={COLOR_SEM.amarillo.fg} onClick={() => setFiltro('amarillo')} activo={filtro === 'amarillo'} />
            <Kpi n={cuenta.verde} l="en fecha" c={COLOR_SEM.verde.fg} onClick={() => setFiltro('verde')} activo={filtro === 'verde'} />
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
            {FILTROS.map(f => {
              const activo = filtro === f.id
              return <button key={f.id} onClick={() => setFiltro(f.id)} style={{
                ...btn, padding: '6px 11px', fontSize: 12,
                border: `1px solid ${activo ? T.ink : T.border}`, background: activo ? T.ink : T.surface, color: activo ? '#fff' : T.ink2, fontWeight: activo ? 600 : 500,
              }}>{f.label} <span style={{ fontFamily: MONO, opacity: 0.65, marginLeft: 3 }}>{cuenta[f.id]}</span></button>
            })}
            <div style={{ flex: 1 }} />
            <select value={personaF} onChange={e => setPersonaF(e.target.value)} style={{ ...inp, padding: '6px 9px', fontSize: 12 }}>
              <option value="todos">Todos</option>
              {personas.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar proyecto, cliente…" style={{ ...inp, padding: '6px 10px', fontSize: 12, width: 190 }} />
            <button onClick={sincronizar} disabled={sincro} title="Trae los entregables nuevos desde Proyectos" style={{ ...btn, padding: '6px 11px', fontSize: 12 }}>{sincro ? '…' : '↻ Actualizar'}</button>
          </div>

          {!grupos.length
            ? <div style={{ ...card, padding: 30, textAlign: 'center', color: T.ink2, fontSize: 13.5 }}>Nada acá. {filtro !== 'activos' && <button onClick={() => setFiltro('activos')} style={{ ...btn, marginLeft: 8, padding: '4px 10px' }}>Ver todo lo abierto</button>}</div>
            : grupos.map(g => <Grupo key={g.num} g={g} abierto={abierto} setAbierto={setAbierto} drive={drive} mailsCliente={mailsDe(g.agencia, g.cliente)} {...props} />)}
        </>}
    </>}
  </div>
}

const lineaBitacora = (mail, texto) => {
  const d = new Date()
  return `[${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${nombreDe(mail)}] ${texto}`
}

// ---------------------------------------------------------------- pedazos
function Kpi({ n, l, c, onClick, activo }) {
  return <button onClick={onClick} style={{ ...card, padding: '13px 15px', textAlign: 'left', cursor: 'pointer', borderColor: activo ? c : T.border, borderWidth: activo ? 1.5 : 1 }}>
    <div style={{ fontSize: 25, fontWeight: 700, color: n ? c : T.ink3, fontFamily: MONO, lineHeight: 1.1 }}>{n}</div>
    <div style={{ fontSize: 11.5, color: T.ink2, marginTop: 3 }}>{l}</div>
  </button>
}

function Punto({ nivel }) {
  const c = COLOR_SEM[nivel] || COLOR_SEM.verde
  return <span style={{ width: 9, height: 9, borderRadius: 9, background: c.fg, display: 'inline-block', flexShrink: 0 }} />
}

// Lo que alguien preguntó y todavía nadie contestó. Arriba de todo.
function Consultas({ consultas, responder, setAbierto }) {
  const [resp, setResp] = useState({})
  return <div style={{ ...card, borderColor: `${T.brand}40`, background: T.brandSoft, marginBottom: 16, padding: '12px 14px' }}>
    <div style={{ fontSize: 12.5, fontWeight: 700, color: T.brand, marginBottom: 10 }}>
      {consultas.length} {consultas.length === 1 ? 'pregunta sin responder' : 'preguntas sin responder'}
    </div>
    {consultas.map(f => <div key={f.ID} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 7, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: MONO, fontSize: 11.5, color: T.ink2 }}>#{f['N° presupuesto']}</span>
      <span style={{ fontSize: 12.5, color: T.ink, fontWeight: 600 }}>{f.Cliente || f.Agencia}</span>
      <span style={{ fontSize: 12, color: T.ink2 }}>· {limpiarPedido(f.Entregable)}</span>
      <span style={{ fontSize: 12.5, color: T.ink, flex: 1, minWidth: 200 }}>“{f.Consulta}”</span>
      <input value={resp[f.ID] || ''} onChange={e => setResp(r => ({ ...r, [f.ID]: e.target.value }))}
        onKeyDown={e => { if (e.key === 'Enter') { responder(f, resp[f.ID] || ''); setResp(r => ({ ...r, [f.ID]: '' })) } }}
        placeholder="Responder y Enter" style={{ ...inp, width: 240, fontSize: 12, padding: '5px 9px' }} />
      <button onClick={() => { setAbierto(f.ID) }} style={{ ...btn, padding: '4px 9px', fontSize: 11.5 }}>Ver</button>
    </div>)}
  </div>
}

function Grupo({ g, abierto, setAbierto, guardar, carpeta, crudoAlCliente, drive, mail, mailsCliente, preguntar, responder }) {
  const peor = g.items[0].__sem
  const estadoDrive = drive[g.num]
  const creando = estadoDrive === 'creando'
  const linkCrudo = (typeof estadoDrive === 'string' && estadoDrive.startsWith('http')) ? estadoDrive : g.linkCrudo
  const [panel, setPanel] = useState(false)

  return <div style={{ ...card, marginBottom: 10, overflow: 'hidden' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: T.surfaceAlt, borderBottom: `1px solid ${T.border}`, flexWrap: 'wrap' }}>
      <Punto nivel={peor.nivel} />
      <span style={{ fontFamily: MONO, fontSize: 12, color: T.ink2 }}>#{g.num}</span>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>{g.cliente || g.agencia || '—'}</span>
      {g.proyecto && <span style={{ fontSize: 12.5, color: T.ink2 }}>· {g.proyecto}</span>}
      <span style={{ fontSize: 11.5, color: T.ink3, fontFamily: MONO }}>{g.fecha}</span>
      <div style={{ flex: 1 }} />
      {(linkCrudo || g.linkEntrega) ? <>
        {linkCrudo && <a href={linkCrudo} target="_blank" rel="noreferrer" style={{ ...btn, padding: '5px 10px', fontSize: 11.5, textDecoration: 'none', display: 'inline-block' }}>📁 Crudo</a>}
        {g.linkEntrega && <a href={g.linkEntrega} target="_blank" rel="noreferrer" style={{ ...btn, padding: '5px 10px', fontSize: 11.5, textDecoration: 'none', display: 'inline-block' }}>📤 Entrega</a>}
        <button onClick={() => setPanel(p => !p)} style={{ ...btn, padding: '5px 10px', fontSize: 11.5, background: panel ? T.ink : T.surface, color: panel ? '#fff' : T.ink2 }}>Compartir…</button>
      </> : <button onClick={() => carpeta(g.num, ['crudo', 'entregas'], false)} disabled={creando} title="Crea la carpeta en CRUDO y en ENTREGAS CLIENTES, con las subcarpetas de lo que se vendió" style={{ ...btn, padding: '5px 10px', fontSize: 11.5 }}>{creando ? 'Creando…' : '📁 Crear carpetas'}</button>}
    </div>

    {panel && <PanelCompartir g={g} carpeta={carpeta} crudoAlCliente={crudoAlCliente} mailsCliente={mailsCliente} />}

    {g.items.map(f => <Fila key={f.ID} f={f} g={g} abierto={abierto} setAbierto={setAbierto} guardar={guardar} mail={mail} preguntar={preguntar} responder={responder} />)}
  </div>
}

function PanelCompartir({ g, carpeta, crudoAlCliente, mailsCliente }) {
  const [mails, setMails] = useState((mailsCliente || []).join(', '))
  const [yendo, setYendo] = useState('')
  const darCrudo = async () => {
    const lista = mails.split(/[,;\s]+/).map(x => x.trim()).filter(x => /@/.test(x))
    setYendo('cliente'); await crudoAlCliente(g.num, lista); setYendo('')
  }
  const conStaff = async () => { setYendo('staff'); await carpeta(g.num, ['crudo'], true); setYendo('') }
  return <div style={{ padding: '12px 14px', background: T.bg, borderBottom: `1px solid ${T.border}`, display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>
    <div>
      <div style={lbl}>Al equipo que filma y edita</div>
      <button onClick={conStaff} disabled={yendo === 'staff'} style={{ ...btn, width: '100%' }}>{yendo === 'staff' ? 'Compartiendo…' : 'Dar acceso al staff asignado'}</button>
      <div style={{ fontSize: 11, color: T.ink3, marginTop: 5, lineHeight: 1.45 }}>Permiso de edición sobre la carpeta de crudo, con el mail que cada uno tiene en RRHH.</div>
    </div>
    <div>
      <div style={lbl}>Darle el crudo al cliente</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={mails} onChange={e => setMails(e.target.value)} placeholder="mail del cliente, separados por coma" style={{ ...inp, flex: 1, fontSize: 12 }} />
        <button onClick={darCrudo} disabled={yendo === 'cliente'} style={btnPri}>{yendo === 'cliente' ? '…' : 'Dar crudo'}</button>
      </div>
      <div style={{ fontSize: 11, color: T.ink3, marginTop: 5, lineHeight: 1.45 }}>Pone un acceso directo al crudo dentro de la carpeta de entrega del cliente y le da lectura. No copia archivos.{mailsCliente?.length ? ` Sugeridos de Contactos: ${mailsCliente.length}.` : ''}</div>
    </div>
  </div>
}

function Fila({ f, g, abierto, setAbierto, guardar, mail, preguntar, responder }) {
  const sem = f.__sem
  const c = COLOR_SEM[sem.nivel] || COLOR_SEM.verde
  const abierta = abierto === f.ID
  const cerrado = estaCerrado(f.Estado)
  const idx = ESTADO_IDX(f.Estado)
  const siguiente = idx < ESTADOS.length - 1 ? ESTADOS[idx + 1] : null
  const prio = String(f.Prioridad || 'Normal').trim()
  const hayConsulta = !!String(f.Consulta || '').trim()

  return <div style={{ borderBottom: abierta ? `1px solid ${T.border}` : 'none' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderLeft: `3px solid ${c.fg}`, opacity: cerrado ? 0.6 : 1 }}>
      <span style={{ fontSize: 13, color: T.ink, fontWeight: 500, minWidth: 130 }}>{limpiarPedido(f.Entregable)}</span>
      {prio === 'Urgente' && <span style={{ fontSize: 10, fontWeight: 700, color: T.brand, background: T.brandSoft, padding: '2px 6px', borderRadius: 4, letterSpacing: 0.3 }}>URGENTE</span>}
      {hayConsulta && <span style={{ fontSize: 10, fontWeight: 700, color: T.brand, background: T.brandSoft, padding: '2px 6px', borderRadius: 4 }}>🙋 PREGUNTA</span>}
      <span style={{ fontSize: 12.5, color: String(f.Editor).trim() === 'Somos Magma' ? T.ink : T.ink2, fontWeight: String(f.Editor).trim() === 'Somos Magma' ? 600 : 400, minWidth: 150 }}>
        {String(f.Editor || '').trim() || <em style={{ color: T.brand, fontStyle: 'normal' }}>sin asignar</em>}
      </span>
      <select value={String(f.Estado || 'Sin material')} onChange={e => guardar(f.ID, { Estado: e.target.value })} style={{ ...inp, padding: '4px 8px', fontSize: 12, width: 138, cursor: 'pointer' }}>
        {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
      </select>
      {siguiente && !cerrado && <button onClick={() => guardar(f.ID, { Estado: siguiente })} title={`Pasar a "${siguiente}"`} style={{ ...btn, padding: '4px 9px', fontSize: 11.5 }}>→</button>}
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 11.5, fontWeight: 600, color: c.fg, background: c.bg, padding: '3px 9px', borderRadius: 6, whiteSpace: 'nowrap' }}>{sem.txt}</span>
      <button onClick={() => setAbierto(abierta ? null : f.ID)} style={{ ...btn, padding: '4px 10px', fontSize: 11.5 }}>{abierta ? 'Cerrar' : 'Abrir'}</button>
    </div>
    {abierta && <Detalle f={f} g={g} guardar={guardar} mail={mail} preguntar={preguntar} responder={responder} />}
  </div>
}

function Detalle({ f, g, guardar, mail, preguntar, responder }) {
  const [notas, setNotas] = useState(String(f.Notas || ''))
  const [nueva, setNueva] = useState('')
  const [pregunta, setPregunta] = useState('')
  const [copiado, setCopiado] = useState(false)
  useEffect(() => { setNotas(String(f.Notas || '')) }, [f.Notas])

  const compromiso = String(f['Fecha compromiso'] || '').trim() || aAR(fechaSugerida(f['Fecha Evento'], f.Entregable))
  const hayConsulta = !!String(f.Consulta || '').trim()

  const agregarNota = () => {
    const t = nueva.trim(); if (!t) return
    const n = lineaBitacora(mail, t) + (notas.trim() ? '\n' + notas : '')
    setNotas(n); setNueva(''); guardar(f.ID, { Notas: n })
  }

  const mensaje = [
    `🎬 #${f['N° presupuesto']} · ${f.Cliente || f.Agencia || ''}${f.Proyecto ? ' — ' + f.Proyecto : ''}`,
    `Entregable: ${limpiarPedido(f.Entregable)}`,
    f['Fecha Evento'] ? `Filmado: ${f['Fecha Evento']}` : '',
    compromiso ? `Entrega: ${compromiso}` : '',
    (f['Link crudo'] || g.linkCrudo) ? `Material: ${f['Link crudo'] || g.linkCrudo}` : 'Material: (falta subir el crudo)',
    notas.trim() ? `\nNotas:\n${notas.trim()}` : '',
  ].filter(Boolean).join('\n')

  const copiar = async () => { try { await navigator.clipboard.writeText(mensaje); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch (e) {} }

  return <div style={{ padding: '14px 16px 16px 17px', background: T.bg, borderLeft: `3px solid ${T.border}` }}>
    {hayConsulta && <div style={{ background: T.brandSoft, border: `1px solid ${T.brand}30`, borderRadius: 9, padding: '10px 12px', marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, color: T.ink, marginBottom: 8 }}>🙋 <strong>{f.Consulta}</strong></div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={pregunta} onChange={e => setPregunta(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { responder(f, pregunta); setPregunta('') } }}
          placeholder="Responder — se guarda en la bitácora y saca la bandera" style={{ ...inp, flex: 1, fontSize: 12.5 }} />
        <button onClick={() => { responder(f, pregunta); setPregunta('') }} style={btnPri}>Responder</button>
      </div>
    </div>}

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
      <div>
        <label style={lbl}>Entregar el</label>
        <input type="date" defaultValue={aISO(parseFechaAR(compromiso))}
          onChange={e => { const d = e.target.value ? new Date(e.target.value + 'T12:00:00') : null; guardar(f.ID, { 'Fecha compromiso': d ? aAR(d) : '' }) }}
          style={{ ...inp, width: '100%' }} />
        <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 4 }}>{String(f['Fecha compromiso'] || '').trim() ? 'fijada a mano' : 'sugerida por el plazo del manual'}</div>
      </div>
      <div>
        <label style={lbl}>Prioridad</label>
        <select value={String(f.Prioridad || 'Normal')} onChange={e => guardar(f.ID, { Prioridad: e.target.value })} style={{ ...inp, width: '100%', cursor: 'pointer', color: COLOR_PRIO[String(f.Prioridad || 'Normal')] || T.ink, fontWeight: String(f.Prioridad) === 'Urgente' ? 700 : 400 }}>
          {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div>
        <label style={lbl}>A cargo</label>
        <input defaultValue={String(f.Editor || '')} onBlur={e => { if (e.target.value !== String(f.Editor || '')) guardar(f.ID, { Editor: e.target.value }) }} placeholder="Quién lo hace" style={{ ...inp, width: '100%' }} />
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
      <div>
        <label style={lbl}>Link del material (crudo)</label>
        <input defaultValue={String(f['Link crudo'] || '')} onBlur={e => { if (e.target.value !== String(f['Link crudo'] || '')) guardar(f.ID, { 'Link crudo': e.target.value }) }} placeholder="https://drive.google.com/…" style={{ ...inp, width: '100%', fontSize: 12 }} />
      </div>
      <div>
        <label style={lbl}>Link de la entrega</label>
        <input defaultValue={String(f['Link entrega'] || '')} onBlur={e => { if (e.target.value !== String(f['Link entrega'] || '')) guardar(f.ID, { 'Link entrega': e.target.value }) }} placeholder="Drive / WeTransfer / Frame.io" style={{ ...inp, width: '100%', fontSize: 12 }} />
      </div>
    </div>

    <label style={lbl}>Bitácora — lo que se pidió, los cambios, las referencias</label>
    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
      <input value={nueva} onChange={e => setNueva(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarNota() } }}
        placeholder="Sumar una nota y Enter — queda fechada y firmada" style={{ ...inp, flex: 1 }} />
      <button onClick={agregarNota} style={btnPri}>Sumar</button>
    </div>
    <textarea value={notas} onChange={e => setNotas(e.target.value)} onBlur={() => { if (notas !== String(f.Notas || '')) guardar(f.ID, { Notas: notas }) }}
      rows={Math.min(10, Math.max(3, notas.split('\n').length + 1))} style={{ ...inp, width: '100%', resize: 'vertical', lineHeight: 1.55, fontSize: 12.5 }} />

    <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <button onClick={copiar} style={btn}>{copiado ? '✓ Copiado' : '📋 Copiar mensaje para el editor'}</button>
      {!hayConsulta && <>
        <input value={pregunta} onChange={e => setPregunta(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { preguntar(f, pregunta); setPregunta('') } }}
          placeholder="🙋 Preguntar algo de este trabajo" style={{ ...inp, width: 300, fontSize: 12.5 }} />
        <button onClick={() => { preguntar(f, pregunta); setPregunta('') }} style={btn}>Preguntar</button>
      </>}
      <div style={{ flex: 1 }} />
      {f.Actualizado && <span style={{ fontSize: 10.5, color: T.ink3, fontFamily: MONO }}>últ. cambio {String(f.Actualizado).slice(0, 10)} · {nombreDe(f.Por)}</span>}
    </div>
  </div>
}

// ---------------------------------------------------------------- "Cómo trabajamos"
// La página editable del área. Vive en la solapa EDICION_INFO.
function Info({ mail, showToast }) {
  const [secciones, setSecciones] = useState(null)
  const [editando, setEditando] = useState(null)   // orden en edición
  const [borr, setBorr] = useState({ titulo: '', contenido: '' })

  const cargar = () => fetch('/api/edicion-info').then(r => r.json()).then(j => setSecciones(j.secciones || [])).catch(() => setSecciones([]))
  useEffect(() => { cargar() }, [])

  const guardar = async (orden, titulo, contenido) => {
    const r = await fetch('/api/edicion-info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orden, titulo, contenido }) })
    const j = await r.json()
    if (!j.ok) return showToast(j.error || 'No se pudo guardar', 'err')
    showToast('Guardado ✓'); setEditando(null); cargar()
  }
  const borrar = async orden => {
    if (!window.confirm('¿Borrar esta sección?')) return
    await fetch('/api/edicion-info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orden, borrar: true }) })
    showToast('Borrada'); setEditando(null); cargar()
  }

  if (!secciones) return <div style={{ ...card, padding: 30, textAlign: 'center', color: T.ink2, fontSize: 13.5 }}>Cargando…</div>

  const proxOrden = (secciones.length ? Math.max(...secciones.map(s => s.orden)) : 0) + 10

  return <div>
    <div style={{ fontSize: 12.5, color: T.ink2, marginBottom: 16, lineHeight: 1.6, ...card, padding: '12px 14px' }}>
      Todo lo que alguien nuevo necesita saber para editar en Magma sin preguntar. Cualquiera del equipo lo puede editar y queda guardado en el sheet.
    </div>

    {secciones.map(s => editando === s.orden
      ? <EditorSeccion key={s.orden} inicial={s} onGuardar={(t, c) => guardar(s.orden, t, c)} onCancelar={() => setEditando(null)} onBorrar={() => borrar(s.orden)} />
      : <div key={s.orden} style={{ ...card, padding: '16px 18px', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: T.ink, margin: 0, flex: 1 }}>{s.titulo}</h3>
            {s.por && s.por !== 'setup' && <span style={{ fontSize: 10.5, color: T.ink3, fontFamily: MONO }}>{nombreDe(s.por)} · {String(s.actualizado).slice(0, 10)}</span>}
            <button onClick={() => setEditando(s.orden)} style={{ ...btn, padding: '3px 9px', fontSize: 11.5 }}>Editar</button>
          </div>
          <div style={{ fontSize: 13, color: T.ink2, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{s.contenido}</div>
        </div>)}

    {editando === 'nueva'
      ? <EditorSeccion inicial={borr} onGuardar={(t, c) => { guardar(proxOrden, t, c); setBorr({ titulo: '', contenido: '' }) }} onCancelar={() => setEditando(null)} />
      : <button onClick={() => setEditando('nueva')} style={{ ...btn, width: '100%', padding: '11px' }}>+ Agregar una sección</button>}
  </div>
}

function EditorSeccion({ inicial, onGuardar, onCancelar, onBorrar }) {
  const [titulo, setTitulo] = useState(inicial.titulo || '')
  const [contenido, setContenido] = useState(inicial.contenido || '')
  return <div style={{ ...card, padding: '16px 18px', marginBottom: 10, borderColor: T.brand }}>
    <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título de la sección" style={{ ...inp, width: '100%', fontSize: 15, fontWeight: 700, marginBottom: 10 }} />
    <textarea value={contenido} onChange={e => setContenido(e.target.value)} placeholder="Escribí acá…" rows={Math.max(6, contenido.split('\n').length + 2)}
      style={{ ...inp, width: '100%', resize: 'vertical', lineHeight: 1.65, fontSize: 13 }} />
    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
      <button onClick={() => onGuardar(titulo, contenido)} style={btnPri}>Guardar</button>
      <button onClick={onCancelar} style={btn}>Cancelar</button>
      <div style={{ flex: 1 }} />
      {onBorrar && <button onClick={onBorrar} style={{ ...btn, color: T.brand }}>Borrar sección</button>}
    </div>
  </div>
}
