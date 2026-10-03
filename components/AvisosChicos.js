// ============================ AVISOS DE LOS CHICOS ============================
// Lo que los freelancers dijeron desde Mi Magma y el equipo tiene que ver sin ir a buscarlo:
//   · "no puedo" vigentes de trabajos que vienen (la persona sigue cargada: hay que poner a otra)
//   · notas del rodaje para la editora (quedan en la bitácora de EDICION, acá se ven las de los últimos 2 días)
//   · quién confirmó en los últimos 2 días, y los días que avisaron que no pueden en las próximas 2 semanas
// Nace de la pregunta de Juan del 03/10/2026: "si él me dice que no... ¿cómo lo veo yo?". El mail ya sale; esto es
// para el que está en la app. Cada línea abre el trabajo.

import React, { useMemo, useState } from 'react'
import { T, MONO } from '../lib/ui'
import { leerDisponibilidad, noPuedenDe, queDe, estaVigente, fechaAR } from '../lib/disponibilidad.mjs'
import { PREFIJO_NOTA } from '../lib/mi-magma'

const txt = v => String(v ?? '').trim()
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const corto = s => { const f = fechaAR(s); return f ? `${DIAS[f.getDay()]} ${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}` : txt(s) }
const apodo = n => txt(n).split(' ')[0]
// "02/10/2026 18:22" → hace cuánto, en días enteros
const diasDesde = (s, hoy0) => { const f = fechaAR(s); return f ? Math.round((hoy0 - f) / 864e5) : 999 }

export default function AvisosChicos({ data, goTo, cel }) {
  const [cerrado, setCerrado] = useState(false)
  const [permiso, setPermiso] = useState(() => { try { return typeof Notification !== 'undefined' ? Notification.permission : 'nada' } catch (e) { return 'nada' } })
  const hoy0 = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }, [])

  const avisos = useMemo(() => {
    const filas = data?.disponibilidad || []
    const dispo = leerDisponibilidad(filas)
    const proyectos = data?.proyectos || []
    const porNum = Object.fromEntries(proyectos.map(p => [txt(p['N° presupuesto']), p]))
    // No puede, y sigue cargado en el trabajo
    const noPueden = []
    for (const p of proyectos) for (const l of noPuedenDe(p, dispo, hoy0)) {
      const r = dispo.respuesta(l.nombre, l.nro, l.pedido, l.fecha)
      noPueden.push({ num: l.nro, quien: apodo(l.nombre), cliente: txt(p.Cliente) || txt(p.Agencia), proyecto: txt(p.Proyecto), fecha: l.fecha, pedido: txt(l.pedido).replace(/^[^\p{L}\p{N}]+/u, ''), motivo: r?.motivo || '', pm: txt(p.PM), cuando: r?.cuando || '' })
    }
    noPueden.sort((a, b) => fechaAR(a.fecha) - fechaAR(b.fecha))
    // Confirmaron hace poco (2 días)
    const confirmaron = filas.filter(r => queDe(r) === 'confirmo' && estaVigente(r) && diasDesde(r['Cargado el'], hoy0) <= 2 && fechaAR(r['Fecha']) >= hoy0)
      .map(r => ({ quien: apodo(r['Persona']), num: txt(r['N° trabajo']), cliente: txt(r['Trabajo']).split(' · ')[0], fecha: txt(r['Fecha']) }))
    // Días sueltos que no pueden, próximas 2 semanas
    const dias = filas.filter(r => queDe(r) === 'dia' && estaVigente(r)).map(r => ({ quien: apodo(r['Persona']), f: fechaAR(r['Fecha']) }))
      .filter(x => x.f && x.f >= hoy0 && (x.f - hoy0) / 864e5 <= 14).sort((a, b) => a.f - b.f)
    // Notas del rodaje: la primera línea de la bitácora de una pieza, escrita desde Mi Magma, de hoy o ayer
    const notas = [], vistas = new Set()
    for (const f of (data?.edicion || [])) {
      const l1 = txt(f.Notas).split('\n')[0].trim()
      const m = l1.match(new RegExp(`^\\[(\\d{2})/(\\d{2})\\s+([^\\]]+)\\]\\s*${PREFIJO_NOTA}\\s*(.+)$`))
      if (!m) continue
      const fecha = new Date(hoy0.getFullYear(), +m[2] - 1, +m[1]); if (fecha > hoy0) fecha.setFullYear(fecha.getFullYear() - 1)
      if ((hoy0 - fecha) / 864e5 > 2) continue
      const k = txt(f['N° presupuesto']) + '|' + l1; if (vistas.has(k)) continue; vistas.add(k)
      const p = porNum[txt(f['N° presupuesto'])] || {}
      notas.push({ id: txt(f.ID), num: txt(f['N° presupuesto']), quien: m[3], texto: m[4], cliente: txt(f.Cliente) || txt(f.Agencia) || txt(p.Cliente), editor: txt(f.Editor), cuando: `${m[1]}/${m[2]}` })
    }
    return { noPueden, confirmaron, dias, notas }
  }, [data, hoy0])

  const total = avisos.noPueden.length + avisos.notas.length + avisos.confirmaron.length + avisos.dias.length
  if (cerrado || !total) return null
  const abrirTrabajo = num => { goTo && goTo('presupuestos', { q: num }); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const abrirPieza = id => { goTo && goTo('edicion', { abrir: id }); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const pedirPermiso = () => { try { Notification.requestPermission().then(p => setPermiso(p)) } catch (e) { /* no hay */ } }
  const linea = { display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', fontSize: 12.5, cursor: 'pointer', borderRadius: 6, padding: '3px 4px' }

  return <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderLeft: `3px solid ${avisos.noPueden.length ? T.brand : T.ink}`, borderRadius: 12, padding: cel ? '12px 13px' : '14px 18px', marginBottom: 18 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Los chicos, desde Mi Magma</span>
      {avisos.noPueden.length > 0 && <span style={{ fontSize: 11.5, fontWeight: 600, color: T.brand }}>{avisos.noPueden.length === 1 ? '1 puesto para cubrir' : `${avisos.noPueden.length} puestos para cubrir`}</span>}
      <div style={{ flex: 1 }} />
      {permiso === 'default' && <button onClick={pedirPermiso} title="Un aviso en la pantalla cuando alguien dice que no puede o deja una nota, con la app abierta" style={{ padding: '5px 11px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.ink2, fontSize: 12, cursor: 'pointer' }}>Avisarme en la compu</button>}
      <button onClick={() => setCerrado(true)} title="Ocultar hasta que recargues" style={{ padding: '5px 9px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.ink3, fontSize: 12, cursor: 'pointer' }}>✕</button>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {avisos.noPueden.map((x, i) => <div key={'n' + i} onClick={() => abrirTrabajo(x.num)} title="Abrir el trabajo y poner a otra persona" style={linea}>
        <span style={{ width: 7, height: 7, borderRadius: 7, background: T.brand, flexShrink: 0 }} />
        <span style={{ fontWeight: 600, color: T.brand }}>{x.quien} no puede</span>
        <span style={{ fontFamily: MONO, fontSize: 11.5, color: T.ink3 }}>#{x.num}</span>
        <span style={{ fontWeight: 600, color: T.ink }}>{x.cliente}</span>
        <span style={{ color: T.ink2 }}>{x.pedido} · {corto(x.fecha)}{x.pm ? ` · PM ${x.pm}` : ''}</span>
        {x.motivo && <span style={{ color: T.ink2, fontStyle: 'italic' }}>“{x.motivo.slice(0, 80)}”</span>}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: T.brand, whiteSpace: 'nowrap' }}>sigue cargado · poné a otro</span>
      </div>)}
      {avisos.notas.map((x, i) => <div key={'t' + i} onClick={() => abrirPieza(x.id)} title="Abrir la pieza en el tablero" style={linea}>
        <span style={{ width: 7, height: 7, borderRadius: 7, background: T.ink, flexShrink: 0 }} />
        <span style={{ fontWeight: 600, color: T.ink }}>{x.quien} dejó una nota</span>
        <span style={{ fontFamily: MONO, fontSize: 11.5, color: T.ink3 }}>#{x.num}</span>
        <span style={{ color: T.ink2 }}>{x.cliente}{x.editor ? ` · edita ${apodo(x.editor)}` : ' · sin editora'}</span>
        <span style={{ color: T.ink2, fontStyle: 'italic' }}>“{x.texto.slice(0, 90)}{x.texto.length > 90 ? '…' : ''}”</span>
      </div>)}
      {(avisos.confirmaron.length > 0 || avisos.dias.length > 0) && <div style={{ fontSize: 12, color: T.ink2, padding: '3px 4px', lineHeight: 1.6 }}>
        {avisos.confirmaron.length > 0 && <span>Confirmaron: {avisos.confirmaron.map((c, i) => <span key={i}><span onClick={() => abrirTrabajo(c.num)} style={{ cursor: 'pointer', color: T.ink, fontWeight: 600 }}>{c.quien}</span> {c.cliente} {corto(c.fecha)}{i < avisos.confirmaron.length - 1 ? ' · ' : ''}</span>)}</span>}
        {avisos.confirmaron.length > 0 && avisos.dias.length > 0 && <span> &nbsp;·&nbsp; </span>}
        {avisos.dias.length > 0 && <span>No pueden: {avisos.dias.map(d => `${d.quien} ${corto(`${d.f.getDate()}/${d.f.getMonth() + 1}/${d.f.getFullYear()}`)}`).join(' · ')}</span>}
      </div>}
    </div>
  </div>
}
