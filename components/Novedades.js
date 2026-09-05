// ============================ LO QUE TE TOCA HOY ============================
// Reemplaza al aviso por WhatsApp que no se puede mandar (Meta solo permite
// texto libre dentro de las 24 h desde que la persona escribió). La idea es la
// misma: que nadie tenga que ir a buscar si hay algo para hacer.
//
// Solo muestra lo que necesita una ACCIÓN de quien está mirando. Si aparece de
// más, se ignora y deja de servir — por eso no lista "todo lo abierto".

import React, { useMemo, useState } from 'react'
import { T, MONO } from '../lib/ui'
import { semaforo, hoyCero, limpiarPedido, estaCerrado, esperaAlPM } from '../lib/edicion'

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export default function Novedades({ data, mail, persona, goTo, cel }) {
  const [cerrado, setCerrado] = useState(false)
  const hoy = hoyCero()

  const grupos = useMemo(() => {
    const filas = (data?.edicion || []).filter(f => String(f.ID || '').trim() && !estaCerrado(f.Estado))
    // ¿Cuál de estas filas son mías? El tablero guarda el nombre completo
    // ("Daniela Viviana Ayala") y acá tenemos el mail, así que se cruza por
    // los apodos que ya usa el resto de la app.
    const apodos = (persona?.nombres || []).map(norm)
    const esMio = f => {
      const e = norm(f.Editor)
      return e && apodos.some(a => e.includes(a))
    }
    const verTodo = !!persona?.verTodo

    const mias = filas.filter(esMio)
    const conSemaforo = f => ({ ...f, __sem: semaforo(f, hoy) })

    return {
      // Alguien preguntó algo y nadie contestó: es lo que frena un trabajo.
      consultas: filas.filter(f => String(f.Consulta || '').trim()).map(conSemaforo),
      // Esperan que yo dé el OK antes de que salga al cliente.
      revisar: (verTodo ? filas : mias).filter(f => esperaAlPM(f.Estado)).map(conSemaforo),
      // Mío y atrasado.
      atrasadas: mias.filter(f => semaforo(f, hoy).nivel === 'rojo').map(conSemaforo),
      // Mío y para arrancar o corregir.
      hacer: mias.filter(f => ['Material listo', 'Cambios internos', 'Cambios del cliente'].includes(String(f.Estado || '').trim())).map(conSemaforo),
    }
  }, [data, persona]) // eslint-disable-line

  const total = grupos.consultas.length + grupos.revisar.length + grupos.atrasadas.length + grupos.hacer.length
  if (cerrado || !total) return null

  const bloques = [
    { k: 'consultas', l: 'sin responder', c: T.brand,  items: grupos.consultas },
    { k: 'revisar',   l: 'esperan tu OK', c: T.brand,  items: grupos.revisar },
    { k: 'atrasadas', l: 'atrasadas',     c: '#C8102E', items: grupos.atrasadas },
    { k: 'hacer',     l: 'para hacer',    c: T.ink2,   items: grupos.hacer },
  ].filter(b => b.items.length)

  // Sin repetir: una fila atrasada que además hay que hacer aparece una sola vez.
  const vistos = new Set()
  const lista = []
  bloques.forEach(b => b.items.forEach(f => {
    if (vistos.has(f.ID)) return
    vistos.add(f.ID); lista.push({ ...f, __motivo: b.l, __color: b.c })
  }))

  return <div style={{
    background: T.surface, border: `1px solid ${T.brand}35`, borderLeft: `3px solid ${T.brand}`,
    borderRadius: 12, padding: cel ? '12px 13px' : '14px 18px', marginBottom: 18,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>
        {persona?.nombre ? `${persona.nombre}, ` : ''}tenés {lista.length} {lista.length === 1 ? 'cosa' : 'cosas'} para mirar
      </span>
      <div style={{ flex: 1 }} />
      <button onClick={() => goTo && goTo('edicion')} style={{
        padding: '5px 11px', borderRadius: 8, border: 'none', background: T.brand, color: '#fff',
        fontSize: 12, fontWeight: 600, cursor: 'pointer',
      }}>Abrir Edición</button>
      <button onClick={() => setCerrado(true)} title="Ocultar hasta que recargues" style={{
        padding: '5px 9px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface,
        color: T.ink3, fontSize: 12, cursor: 'pointer',
      }}>✕</button>
    </div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {lista.slice(0, 6).map(f => (
        <div key={f.ID} style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', fontSize: 12.5 }}>
          <span style={{ width: 7, height: 7, borderRadius: 7, background: f.__color, flexShrink: 0 }} />
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: T.ink3 }}>#{f['N° presupuesto']}</span>
          <span style={{ fontWeight: 600, color: T.ink }}>{f.Cliente || f.Agencia}</span>
          <span style={{ color: T.ink2 }}>{limpiarPedido(f.Entregable)}</span>
          {String(f.Consulta || '').trim() && <span style={{ color: T.brand, fontStyle: 'italic' }}>“{String(f.Consulta).slice(0, 60)}”</span>}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: f.__color, whiteSpace: 'nowrap' }}>{f.__motivo}</span>
          <span style={{ fontSize: 11, color: T.ink3, whiteSpace: 'nowrap' }}>{f.__sem?.txt}</span>
        </div>
      ))}
      {lista.length > 6 && <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 2 }}>y {lista.length - 6} más en el tablero</div>}
    </div>
  </div>
}
