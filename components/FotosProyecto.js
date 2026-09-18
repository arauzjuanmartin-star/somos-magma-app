// ============================ LAS FOTOS DE UN PROYECTO ============================
// El fotógrafo las sube, el PM las mira, y con UN botón quedan listas para el cliente:
// pasan a Finales/Fotos, se les pone la firma de Magma y aparece el link para mandar.
//
// Antes esto era "Compartir… → Ver qué fotos hay para firmar": un botón escondido en un
// panel que suena a permisos. No lo encontró nadie (0 firmadas de 1.267, al 18/9/2026).
// Por eso este bloque va a la vista, en el proyecto, y dice en criollo qué hay subido.
//
// Se usa igual en Edición y en Proyectos: un trabajo de filmmaker sin edición (crudo
// solo) no aparece en el tablero, pero las fotos las entrega igual.
//
// El panel ES el preview: muestra cuántas son, de dónde salen, a dónde van y cómo van a
// quedar los nombres. El botón recién ahí toca Drive.

import React, { useState, useEffect, useCallback } from 'react'
import { T, MONO } from '../lib/ui'

const btn = { padding: '7px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.ink2, fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }
const btnPri = { ...btn, background: T.brand, color: '#fff', border: 'none', fontWeight: 600 }
const chip = { fontSize: 11.5, color: T.ink2, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap' }

const pedir = async body => {
  const r = await fetch('/api/drive-fotos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return r.json()
}

export default function FotosProyecto({ num, showToast, onListo }) {
  const [est, setEst] = useState(null)
  const [error, setError] = useState('')
  const [yendo, setYendo] = useState(false)
  const [progreso, setProgreso] = useState(null)   // { hechas, de }
  const [fallos, setFallos] = useState([])
  const [copiado, setCopiado] = useState(false)

  const mirar = useCallback(async () => {
    setError('')
    try {
      const j = await pedir({ num })
      if (!j.ok) { setError(j.error || 'No pude mirar la carpeta'); return null }
      setEst(j); return j
    } catch (e) { setError('Error de conexión'); return null }
  }, [num])
  useEffect(() => { setEst(null); mirar() }, [mirar])

  const dejarListas = async () => {
    const de = est.faltan
    setYendo(true); setFallos([]); setProgreso({ hechas: 0, de })
    let hechas = 0, ultimo = null
    // De a tandas: cada llamada trabaja ~40 s y devuelve cuántas faltan.
    for (let i = 0; i < 40; i++) {
      try { ultimo = await pedir({ num, confirmar: true }) } catch (e) { setError('Se cortó la conexión a mitad de camino. Apretá de nuevo: sigue desde donde quedó.'); break }
      if (!ultimo.ok) { setError(ultimo.error || 'No se pudo'); break }
      hechas += ultimo.hechas || 0
      setProgreso({ hechas, de })
      if (ultimo.fallos?.length) setFallos(ultimo.fallos)
      if (!ultimo.faltan || !ultimo.hechas) break
    }
    const j = await mirar()
    setYendo(false); setProgreso(null)
    if (j && !j.faltan && hechas) { showToast && showToast(`${j.total} fotos listas para el cliente ✓`); onListo && onListo(ultimo) }
  }

  const copiar = async () => { try { await navigator.clipboard.writeText(est.linkFotos); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch (e) {} }

  const caja = { padding: '12px 14px', background: T.bg, borderBottom: `1px solid ${T.border}` }
  if (error && !est) return <div style={{ ...caja, fontSize: 12.5, color: T.brand }}>{error} <button onClick={mirar} style={{ ...btn, marginLeft: 8, padding: '3px 9px', fontSize: 11.5 }}>Reintentar</button></div>
  if (!est) return <div style={{ ...caja, fontSize: 12.5, color: T.ink3 }}>Mirando la carpeta de entrega…</div>

  if (est.sinCarpeta) return <div style={{ ...caja, fontSize: 12.5, color: T.ink2 }}>
    Este proyecto todavía no tiene carpeta de entrega en Drive, así que no hay dónde subir las fotos. Creala con <strong>“📁 Crear carpetas”</strong> y volvé acá.
  </div>

  if (!est.total) return <div style={{ ...caja, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
    <span style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>Todavía no hay fotos subidas</span>
    <span style={{ fontSize: 12, color: T.ink3 }}>{est.vendidas ? 'Este trabajo lleva fotos: cuando el fotógrafo las suba aparecen acá.' : 'Este trabajo no tiene fotos vendidas.'}</span>
    <div style={{ flex: 1 }} />
    <a href={est.linkEntrega} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none', padding: '5px 10px', fontSize: 11.5 }}>Abrir la carpeta</a>
    <button onClick={mirar} style={{ ...btn, padding: '5px 10px', fontSize: 11.5 }}>↻ Volver a mirar</button>
  </div>

  const listo = !est.faltan
  return <div style={caja}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 9 }}>
      <span style={{ fontSize: 13.5, color: T.ink, fontWeight: 600 }}>{est.total} fotos subidas</span>
      <span style={{ fontSize: 12.5, color: listo ? T.pos : T.warn, fontWeight: 600 }}>
        {listo ? '✓ todas firmadas y en su lugar' : `${est.firmadas} firmadas · faltan ${est.faltan}`}
      </span>
      <div style={{ flex: 1 }} />
      {est.porCarpeta.map(c => <span key={c.carpeta} style={chip} title="Dónde están hoy">{c.carpeta} <strong style={{ color: T.ink }}>{c.n}</strong></span>)}
      <button onClick={mirar} disabled={yendo} title="Volver a mirar la carpeta" style={{ ...btn, padding: '3px 9px', fontSize: 11.5 }}>↻</button>
    </div>

    {!listo && <>
      <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.5, marginBottom: 8 }}>
        {est.aMover > 0 && <>Pasa <strong>{est.aMover}</strong> a <strong>{est.destino}</strong> (lo que ve el cliente). </>}
        {est.aFirmar > 0 && <>Les pone el nombre de Magma a <strong>{est.aFirmar}</strong>. </>}
        No borra nada y lo ya firmado no se toca.
      </div>
      {est.ejemplos?.length > 0 && <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 10px', fontFamily: MONO, fontSize: 11, lineHeight: 1.7, marginBottom: 10, overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {est.ejemplos.slice(0, 3).map((p, i) => <div key={i} style={{ color: T.ink3 }}>{p.antes} → <span style={{ color: T.ink }}>{p.despues}</span></div>)}
        {est.faltan > 3 && <div style={{ color: T.ink3 }}>y {est.faltan - 3} más…</div>}
      </div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={dejarListas} disabled={yendo} style={{ ...btnPri, opacity: yendo ? 0.7 : 1 }}>
          {yendo ? `Trabajando… ${progreso?.hechas || 0} de ${progreso?.de || est.faltan}` : `Firmar y dejar listas para el cliente (${est.faltan})`}
        </button>
        {yendo && <span style={{ fontSize: 11.5, color: T.ink3 }}>No cierres esta pestaña. Si se corta, apretás de nuevo y sigue desde donde quedó.</span>}
      </div>
    </>}

    {listo && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <button onClick={copiar} style={{ ...btn, color: T.pos, borderColor: T.pos, fontWeight: 600 }}>{copiado ? '✓ Copiado' : 'Copiar link de las fotos'}</button>
      <a href={est.linkFotos} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none' }}>Abrir las fotos</a>
      <span style={{ fontSize: 11.5, color: T.ink3 }}>Están en {est.destino}. Si suben más, volvé a mirar y firmás solo las nuevas.</span>
    </div>}

    {error && <div style={{ fontSize: 12, color: T.brand, marginTop: 8 }}>{error}</div>}
    {fallos.length > 0 && <div style={{ fontSize: 11.5, color: T.brand, marginTop: 8, lineHeight: 1.5 }}>
      {fallos.length} no se pudieron tocar (¿sin permiso de edición sobre la carpeta?): {fallos.slice(0, 3).join(' · ')}
    </div>}
  </div>
}
