import React, { useState } from 'react'
import { T, MONO } from '../lib/ui'
import { resumenFechas, sumarDias } from '../lib/fechas'

// Elegir las fechas de un trabajo escribiendo "15/06/2026, 18/06/2026" en un
// campo de texto era el paso más lento de cargar un presu — y el que quedaba a
// medias cuando todavía no se sabían los días (Telefe: "en octubre, 12 jornadas").
// Acá se hace clic en el calendario: un día, varios sueltos, o shift para tirar
// un tramo entero.
//
// Cada día tiene tres estados y el clic los va rotando, porque un mismo trabajo
// tiene días ya hechos y días sin definir al mismo tiempo (Popstars: el 3 y el 4
// se filmaron, el resto del mes todavía no se sabe):
//   vacío → confirmado (rojo) → a confirmar (ocre) → vacío
// Los confirmados van al Calendar como un evento por día e invitan al staff; los
// "a confirmar" van como un solo bloque gris que no le ocupa la agenda a nadie.

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const DIAS = ['L','M','M','J','V','S','D']
const pad = n => String(n).padStart(2, '0')
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` }

export default function CampoFechas({ dias = [], tentativos = [], onChange, compacto }) {
  const [mes, setMes] = useState(() => {
    const base = (dias || []).slice().sort()[0]
    const d = new Date()
    return base ? { y: +base.slice(0,4), m: +base.slice(5,7) - 1 } : { y: d.getFullYear(), m: d.getMonth() }
  })
  const [ancla, setAncla] = useState(null)   // para shift+clic

  const sel = new Set(dias || [])
  const tent = new Set(tentativos === true ? (dias || []) : (tentativos || []))
  const hoy = hoyISO()
  const pre = `${mes.y}-${pad(mes.m+1)}`
  const largo = new Date(mes.y, mes.m + 1, 0).getDate()
  const offset = (new Date(mes.y, mes.m, 1).getDay() + 6) % 7   // la semana arranca lunes
  const celdas = [...Array(offset).fill(null), ...Array.from({ length: largo }, (_, i) => `${pre}-${pad(i+1)}`)]
  const delMes = (dias || []).filter(d => d.startsWith(pre))
  const deOtrosMeses = (dias || []).filter(d => !d.startsWith(pre)).sort()
  const diasDelMes = Array.from({ length: largo }, (_, i) => `${pre}-${pad(i+1)}`)

  const aplicar = (l, t) => onChange([...new Set(l)].sort(), [...new Set(t)].filter(d => l.includes(d)).sort())
  const tocar = (iso, shift) => {
    if (shift && ancla) {
      const [a, b] = [ancla, iso].sort()
      const tramo = []
      for (let d = a, i = 0; d <= b && i < 400; d = sumarDias(d, 1), i++) tramo.push(d)
      aplicar([...(dias||[]), ...tramo], [...tent].filter(d => !tramo.includes(d)))
    } else if (!sel.has(iso)) {
      aplicar([...(dias||[]), iso], [...tent])                                   // vacío → confirmado
    } else if (!tent.has(iso)) {
      aplicar([...(dias||[])], [...tent, iso])                                   // confirmado → a confirmar
    } else {
      aplicar((dias||[]).filter(d => d !== iso), [...tent].filter(d => d !== iso))  // a confirmar → vacío
    }
    setAncla(iso)
  }
  const mover = n => setMes(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() } })
  const todoElMes = aConfirmar => aplicar([...(dias||[]), ...diasDelMes], aConfirmar ? [...tent, ...diasDelMes] : [...tent])
  const limpiarMes = () => aplicar((dias||[]).filter(d => !d.startsWith(pre)), [...tent].filter(d => !d.startsWith(pre)))
  const todasAConfirmar = v => aplicar([...(dias||[])], v ? [...(dias||[])] : [])

  const celda = { border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: compacto ? 12 : 12.5, fontFamily: MONO, padding: compacto ? '5px 0' : '6px 0', lineHeight: 1.35 }
  const navBtn = { border: 'none', background: 'transparent', color: T.ink2, cursor: 'pointer', fontSize: 16, padding: '2px 8px', lineHeight: 1, borderRadius: 6 }
  const accion = { border: `1px solid ${T.border}`, background: T.surface, color: T.ink2, cursor: 'pointer', fontSize: 11, padding: '4px 9px', borderRadius: 7 }
  const pinta = iso => {
    if (tent.has(iso)) return { background: T.warnSoft, color: T.warn, fontWeight: 600, boxShadow: `inset 0 0 0 1px ${T.warn}` }
    if (sel.has(iso))  return { background: T.brand, color: '#fff', fontWeight: 600 }
    if (iso === hoy)   return { background: T.brandSoft, color: T.brand, fontWeight: 600, boxShadow: `inset 0 0 0 1px ${T.brand}` }
    return { background: 'transparent', color: T.ink }
  }

  return <div style={{ border: `1px solid ${T.border}`, borderRadius: 11, background: T.surface, padding: compacto ? 9 : 11, maxWidth: 288 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
      <button type="button" onClick={() => mover(-1)} style={navBtn}>‹</button>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{MESES[mes.m]} {mes.y}</div>
      <button type="button" onClick={() => mover(1)} style={navBtn}>›</button>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 3 }}>
      {DIAS.map((d, i) => <div key={i} style={{ textAlign: 'center', fontSize: 9.5, fontWeight: 600, color: T.ink3, textTransform: 'uppercase' }}>{d}</div>)}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
      {celdas.map((iso, i) => iso === null
        ? <div key={'v' + i} />
        : <button key={iso} type="button"
            title={tent.has(iso) ? 'A confirmar — clic para sacarlo' : sel.has(iso) ? 'Confirmado — clic para pasarlo a “a confirmar”' : 'Clic para confirmarlo (shift = tramo)'}
            onClick={e => tocar(iso, e.shiftKey)}
            style={{ ...celda, ...pinta(iso) }}>
            {+iso.slice(8,10)}
          </button>)}
    </div>
    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
      <button type="button" onClick={() => todoElMes(false)} style={accion}>Todo el mes</button>
      <button type="button" onClick={() => todoElMes(true)} style={accion}>El mes, a confirmar</button>
      {delMes.length > 0 && <button type="button" onClick={limpiarMes} style={accion}>Limpiar</button>}
    </div>
    {(dias||[]).length > 0 && <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11.5, color: T.ink2, marginTop: 9, cursor: 'pointer', lineHeight: 1.35 }}>
      <input type="checkbox" checked={tent.size > 0 && tent.size === (dias||[]).length} onChange={e => todasAConfirmar(e.target.checked)} style={{ marginTop: 1 }}/>
      <span>Ninguna está definida todavía — todas “a confirmar”</span>
    </label>}
    <div style={{ fontSize: 11.5, color: (dias||[]).length ? T.ink2 : T.ink3, marginTop: 8, lineHeight: 1.4 }}>
      {resumenFechas(dias, [...tent])}
      {deOtrosMeses.length > 0 && <div style={{ color: T.warn, marginTop: 3 }}>
        + {deOtrosMeses.length} en otro mes ({[...new Set(deOtrosMeses.map(d => MESES[+d.slice(5,7)-1]))].join(', ')})
      </div>}
    </div>
    <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 5, lineHeight: 1.45 }}>
      Cada clic rota: <b style={{ color: T.brand }}>confirmado</b> → <b style={{ color: T.warn }}>a confirmar</b> → vacío. Shift+clic para un tramo.
    </div>
  </div>
}
