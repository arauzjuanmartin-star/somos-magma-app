import React from 'react'
import HoraInput from './HoraInput'
import { T } from '../lib/ui'
import { delDia, armarPorDia, esPorDia, isoADMY } from '../lib/fechas'

// Horario y lugar distintos para cada día de un trabajo de varias fechas (#2450 ABV:
// el 30/10 en Arte BA a la tarde, el 3/11 en Forbes a la noche). En el sheet van en
// las mismas columnas Horario y Ubicación con el día adelante — ver leerPorDia en
// lib/fechas.js. Acá se trabaja con { iso: {h1, h2, lugar} }.

const DIAS_SEM = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const etiqueta = iso => `${DIAS_SEM[new Date(`${iso}T12:00:00`).getDay()]} ${isoADMY(iso).slice(0, 5)}`
const horasDe = s => {
  const m = String(s || '').match(/(\d{1,2})[:.]?(\d{0,2})\s*(?:a|hasta|-)\s*(\d{1,2})[:.]?(\d{0,2})/i)
  if (!m) return { h1: '', h2: '' }
  const pad = n => String(n).padStart(2, '0')
  return { h1: pad(+m[1]) + ':' + (m[2] ? pad(+m[2]) : '00'), h2: pad(+m[3]) + ':' + (m[4] ? pad(+m[4]) : '00') }
}

// Lo que hay en el sheet → el estado por día, o null si es un valor para todos.
export function porDiaDesdeSheet(horario, ubicacion, dias) {
  if (!esPorDia(horario) && !esPorDia(ubicacion)) return null
  const o = {}
  ;(dias || []).forEach(d => { o[d] = { ...horasDe(delDia(horario, d)), lugar: delDia(ubicacion, d) } })
  return o
}

// Arranca con lo general copiado a cada día: casi siempre se cambia uno solo.
export function porDiaInicial(dias, h1, h2, lugar) {
  const o = {}
  ;(dias || []).forEach(d => { o[d] = { h1: h1 || '', h2: h2 || '', lugar: lugar || '' } })
  return o
}

// El estado → { Horario, Ubicación } para el sheet. Solo los días que siguen en el trabajo.
export function porDiaASheet(porDia, dias) {
  const hor = {}, ubi = {}
  ;(dias || []).forEach(d => {
    const v = porDia?.[d] || {}
    hor[d] = v.h1 && v.h2 ? `${v.h1} a ${v.h2} hs` : ''
    ubi[d] = String(v.lugar || '').trim()
  })
  return { 'Horario': armarPorDia(hor), 'Ubicación': armarPorDia(ubi) }
}

export default function HorarioPorDia({ dias, valor, onChange, onTodosIgual, inp }) {
  const set = (d, campo, v) => onChange({ ...valor, [d]: { ...(valor?.[d] || {}), [campo]: v } })
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    {dias.map(d => {
      const v = valor?.[d] || {}
      return <div key={d} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ width: 62, fontSize: 13, fontWeight: 600, color: T.ink }}>{etiqueta(d)}</span>
        <HoraInput value={v.h1 || ''} onChange={x => set(d, 'h1', x)} style={{ ...inp, width: 82 }} />
        <span style={{ fontSize: 13, color: T.ink2 }}>a</span>
        <HoraInput value={v.h2 || ''} onChange={x => set(d, 'h2', x)} style={{ ...inp, width: 82 }} />
        <input value={v.lugar || ''} onChange={e => set(d, 'lugar', e.target.value)} placeholder="Lugar de ese día" style={{ ...inp, flex: 1, minWidth: 160 }} />
      </div>
    })}
    {onTodosIgual && <button type="button" onClick={onTodosIgual} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, fontSize: 12.5, color: T.ink2, textDecoration: 'underline', cursor: 'pointer' }}>Todos los días igual</button>}
  </div>
}
