// ====================== TICKETS DE LOS CHICOS ======================
// Los gastos que cargan los freelancers desde Mi Magma con la foto del ticket (lib/tickets.mjs). Los autoriza el PM
// del trabajo, desde el aviso de arriba de la app (modo 'pm'). Los de trabajos sin PM activo le quedan a
// administración en Caja → Hoy (modo 'admin'). Por cada uno: quién, de qué trabajo, qué fue, cuánto y la foto.
//   Aprobar   → se suma a sus viáticos de ese trabajo en Pagos Staff: se le paga el 15 con el resto.
//   Rechazar  → pide el motivo (la persona lo lee en Mi Magma).
// Si el trabajo ya se le pagó, avisa y deja marcarlo como "pagado aparte".
import React, { useState } from 'react'
import { T, MONO } from '../lib/ui'
import { ticketsDelPM, ticketsSinPM, pmDelTicket, diasCargado } from '../lib/tickets.mjs'

const $ = n => '$' + Math.round(n || 0).toLocaleString('es-AR')
const txt = v => String(v ?? '').trim()
const num = v => parseFloat(String(v ?? '').replace(/[$,\s]/g, '')) || 0
const soloNumero = s => parseInt(String(s || '').replace(/\D/g, ''), 10) || 0

export default function TicketsRevisar({ data, onClose, onDone, showToast, modo = 'admin', mail = '' }) {
  const pend = modo === 'pm' ? ticketsDelPM(data.tickets, data.proyectos, mail) : ticketsSinPM(data.tickets, data.proyectos)
  const [montoDe, setMontoDe] = useState({}), [motivoDe, setMotivoDe] = useState({}), [rechazando, setRechazando] = useState(''), [aparte, setAparte] = useState({}), [busy, setBusy] = useState('')
  const [hechos, setHechos] = useState({})   // id → qué se hizo, para que desaparezca sin esperar a que recargue todo

  async function revisar(r, accion) {
    const id = txt(r['ID']), monto = montoDe[id] !== undefined ? soloNumero(montoDe[id]) : num(r['Monto'])
    if (accion === 'rechazar' && !txt(motivoDe[id])) { showToast('Escribí por qué no se aprueba', 'err'); return }
    if (accion !== 'rechazar' && !(monto > 0)) { showToast('El monto tiene que ser mayor a cero', 'err'); return }
    setBusy(id)
    try {
      const x = await fetch('/api/ticket-revisar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, accion, monto, motivo: motivoDe[id] || '' }) })
      const j = await x.json().catch(() => ({ error: `El servidor no contestó (error ${x.status})` }))
      if (j.yaPagado) { setAparte(o => ({ ...o, [id]: j.error })); setBusy(''); return }
      if (!j.ok) { showToast(j.error || 'No se pudo guardar', 'err'); setBusy(''); return }
      setHechos(o => ({ ...o, [id]: accion }))
      showToast(accion === 'aprobar' ? `Autorizado ✓ · ${$(monto)} se suman a los viáticos de ${txt(r['Persona'])} en Pagos Staff` : accion === 'aparte' ? 'Marcado como pagado aparte ✓' : 'Rechazado: la persona lo va a ver en Mi Magma')
      if (onDone) onDone()
    } catch (e) { showToast('Error de conexión', 'err') }
    setBusy('')
  }

  const lista = pend.filter(r => !hechos[txt(r['ID'])])
  const inp = { padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.ink, fontSize: 13, outline: 'none', fontFamily: 'inherit' }
  const btn = (fondo, color, borde) => ({ padding: '8px 14px', borderRadius: 8, border: `1px solid ${borde || fondo}`, background: fondo, color, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' })
  return <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: 22, width: 620, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', border: `1px solid ${T.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: T.ink }}>{modo === 'pm' ? 'Gastos de tus trabajos para autorizar' : 'Gastos para autorizar'}</h3>
        <button onClick={onClose} aria-label="Cerrar" style={{ border: 'none', background: 'transparent', fontSize: 22, color: T.ink2, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>
      <div style={{ fontSize: 13, color: T.ink2, marginBottom: 14, lineHeight: 1.5 }}>Lo que adelantaron en un trabajo y cargaron desde Mi Magma con la foto del ticket. {modo === 'pm' ? 'Vos sabés si fue para el trabajo: mirá la foto, corregí el monto si no coincide y autorizalo.' : 'Son de trabajos sin PM activo, o que el PM lleva 3 días sin autorizar.'} Al autorizarlo se suma a sus viáticos de ese trabajo en Pagos Staff y se le paga el 15 con el resto.</div>
      {!lista.length && <div style={{ background: T.surfaceAlt, borderRadius: 10, padding: 16, fontSize: 13, color: T.ink2 }}>No hay gastos para autorizar.</div>}
      {lista.map(r => { const id = txt(r['ID']), ocupado = busy === id, monto = montoDe[id] !== undefined ? montoDe[id] : String(Math.round(num(r['Monto'])))
        return <div key={id} style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{txt(r['Persona'])} <span style={{ fontWeight: 500, color: T.ink2 }}>· {txt(r['Qué fue'])}</span></div>
            <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 600, color: T.ink }}>{$(num(r['Monto']))}</div>
          </div>
          <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 3, overflowWrap: 'anywhere' }}>#{txt(r['N° trabajo'])} · {txt(r['Trabajo'])} · {txt(r['Fecha del trabajo']).slice(0, 5)} · cargado el {txt(r['Cargado el'])}{modo !== 'pm' ? (pmDelTicket(r, data.proyectos) ? ` · PM ${pmDelTicket(r, data.proyectos)}, hace ${diasCargado(r)} días` : ' · sin PM') : ''}</div>
          {txt(r['Nota']) && <div style={{ fontSize: 12.5, color: T.ink, marginTop: 6, background: T.surfaceAlt, borderRadius: 8, padding: '7px 10px' }}>“{txt(r['Nota'])}”</div>}
          {aparte[id]
            ? <div style={{ marginTop: 10, background: T.warnSoft, borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: T.ink, lineHeight: 1.5 }}>{aparte[id]}
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button disabled={ocupado} onClick={() => revisar(r, 'aparte')} style={btn(T.ink, '#fff')}>{ocupado ? 'Guardando…' : 'Lo pagué aparte'}</button>
                  <button disabled={ocupado} onClick={() => setAparte(o => { const n = { ...o }; delete n[id]; return n })} style={btn(T.surface, T.ink2, T.border)}>Todavía no</button>
                </div>
              </div>
            : rechazando === id
            ? <div style={{ marginTop: 10 }}>
                <input autoFocus value={motivoDe[id] || ''} onChange={e => setMotivoDe(o => ({ ...o, [id]: e.target.value }))} placeholder="Por qué no se aprueba (lo lee la persona)" style={{ ...inp, width: '100%' }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button disabled={ocupado} onClick={() => revisar(r, 'rechazar')} style={btn(T.brand, '#fff')}>{ocupado ? 'Guardando…' : 'Rechazar el ticket'}</button>
                  <button disabled={ocupado} onClick={() => setRechazando('')} style={btn(T.surface, T.ink2, T.border)}>Volver</button>
                </div>
              </div>
            : <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                {txt(r['Foto']) ? <a href={txt(r['Foto'])} target="_blank" rel="noreferrer" style={{ ...btn(T.surface, T.ink, T.border), textDecoration: 'none' }}>Ver la foto</a> : <span style={{ fontSize: 12.5, color: T.warn }}>sin foto</span>}
                <span style={{ fontSize: 12.5, color: T.ink2, marginLeft: 4 }}>Monto</span>
                <input inputMode="numeric" value={monto ? (parseInt(monto, 10) || 0).toLocaleString('es-AR') : ''} onChange={e => setMontoDe(o => ({ ...o, [id]: e.target.value.replace(/\D/g, '') }))} style={{ ...inp, width: 110, fontFamily: MONO, textAlign: 'right' }} />
                <span style={{ flex: 1 }} />
                <button disabled={ocupado} onClick={() => setRechazando(id)} style={btn(T.surface, T.ink2, T.border)}>Rechazar</button>
                <button disabled={ocupado} onClick={() => revisar(r, 'aprobar')} style={btn(T.ink, '#fff')}>{ocupado ? 'Guardando…' : 'Autorizar'}</button>
              </div>}
        </div> })}
      <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 6 }}>Todos los tickets, con su estado y su foto, quedan en la solapa TICKETS del Master.</div>
    </div>
  </div>
}
