import React, { useState, useEffect, useId } from 'react'
import { MONO } from '../lib/ui'

// El <input type="time"> del navegador sale en 12hs con a.m./p.m. cuando la
// compu está en inglés, y obliga a pelearle a tres casilleros para poner una
// hora. Acá se escribe el número y listo — y siempre queda en 24hs:
//   9 → 09:00 · 930 → 09:30 · 18 → 18:00 · 1830 → 18:30 · 9:30 → 09:30
// La flechita del costado ofrece las horas redondas por si es más cómodo elegir.

const pad = n => String(n).padStart(2, '0')

export const HORAS_SUGERIDAS = (() => {
  const a = []
  for (let h = 6; h <= 23; h++) { a.push(pad(h) + ':00'); a.push(pad(h) + ':30') }
  return a
})()

// Devuelve 'HH:MM', '' si está vacío, o null si no se entiende lo que escribió.
export function normalizarHora(txt) {
  const s = String(txt || '').trim().toLowerCase().replace(/\s+/g, '').replace(/h(s|rs)?\.?$/, '')
  if (!s) return ''
  const m = s.match(/^(\d{1,2})[:.,](\d{1,2})$/) || s.match(/^(\d{1,2})(\d{2})$/) || s.match(/^(\d{1,2})$/)
  if (!m) return null
  const h = parseInt(m[1], 10), mi = m[2] ? parseInt(m[2], 10) : 0
  if (h > 23 || mi > 59) return null
  return pad(h) + ':' + pad(mi)
}

export default function HoraInput({ value, onChange, disabled, style, placeholder = '--:--' }) {
  const dl = useId()
  const [txt, setTxt] = useState(value || '')
  const [editando, setEditando] = useState(false)
  // mientras se escribe manda el campo; cuando no, manda lo que tenga el formulario
  useEffect(() => { if (!editando) setTxt(value || '') }, [value, editando])

  const confirmar = () => {
    const n = normalizarHora(txt)
    if (n === null) { setTxt(value || ''); return }   // no se entendió: queda lo que había
    setTxt(n)
    if (n !== (value || '')) onChange(n)
  }

  return <>
    <input
      value={txt} disabled={disabled} placeholder={placeholder}
      list={dl} inputMode="numeric" autoComplete="off"
      onChange={e => {
        const v = e.target.value
        setTxt(v)
        // elegir del desplegable ya deja la hora hecha: no hace falta salir del campo
        if (/^\d{1,2}:\d{2}$/.test(v)) { const n = normalizarHora(v); if (n && n !== (value || '')) onChange(n) }
      }}
      onFocus={e => { setEditando(true); e.target.select() }}
      onBlur={() => { setEditando(false); confirmar() }}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmar(); e.target.blur() } }}
      style={{ fontFamily: MONO, textAlign: 'center', letterSpacing: 0.5, ...style }}
    />
    <datalist id={dl}>{HORAS_SUGERIDAS.map(h => <option key={h} value={h} />)}</datalist>
  </>
}
