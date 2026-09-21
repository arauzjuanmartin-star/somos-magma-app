// ============================ MI MAGMA ============================
// El espacio de cada freelancer, pensado para el celular: su agenda, lo que tiene para
// facturar, cómo quedó lo que filmó y su ficha. Recibe `datos` ya recortados por
// lib/mi-magma.js (la aduana): acá no hay nada que filtrar ni que esconder.
//
// Primera etapa: SOLO LECTURA. Confirmar / "no puedo", la nota al editor y las
// referencias escriben al sheet y vienen en la etapa siguiente.
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
      {(j.falta.length > 0 || j.equipo.length > 0) && <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {j.falta.length > 0 && <Pill tono="falta">falta {j.falta.join(' y ')}</Pill>}
        {j.equipo.length > 0 && <Pill>con {j.equipo.map(e => e.quien).join(', ')}</Pill>}
      </span>}
    </span>
  </button>
}

function Trabajo({ j, onVolver }) {
  const falta = t => <span style={{ color: T.warn }}>tu PM todavía no cargó {t}</span>
  return <div>
    <button onClick={onVolver} style={{ border: 0, background: 'transparent', color: T.ink2, fontSize: 13, padding: '0 0 12px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>← Agenda</button>
    <p style={hola}>{j.cliente || j.proyecto}</p>
    <p style={sub}>{j.proyecto}{j.num ? ` · #${j.num}` : ''}</p>
    <div style={{ ...caja, marginTop: 14 }}><KV filas={[
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
  </div>
}

function Agenda({ datos, onAbrir }) {
  const hoy = datos.proximos.filter(j => j.esHoy), viene = datos.proximos.filter(j => !j.esHoy)
  return <div>
    <p style={hola}>Hola, {datos.primerNombre}</p>
    <p style={sub}>{hoy.length ? `Hoy: ${hoy.map(j => j.cliente).join(' y ')}` : viene.length ? `Tu próximo trabajo es el ${diaSemana(viene[0].fecha)} ${viene[0].fecha.slice(0, 5)}` : 'No tenés trabajos cargados de hoy en adelante'}</p>
    {hoy.length > 0 && <><div style={tit}>Hoy</div>{hoy.map(j => <Tarjeta key={j.num + '-' + j.slot} j={j} onAbrir={() => onAbrir(j)} />)}</>}
    {viene.length > 0 && <><div style={tit}>Lo que viene</div>{viene.map(j => <Tarjeta key={j.num + '-' + j.slot + j.fecha} j={j} onAbrir={() => onAbrir(j)} />)}</>}
    {!datos.proximos.length && <div style={{ ...caja, marginTop: 18, color: T.ink2, fontSize: 13, lineHeight: 1.55 }}>Cuando te convoquen para un trabajo va a aparecer acá, con el horario, el lugar y qué hay que grabar.</div>}
  </div>
}

function Facturar({ datos }) {
  const [i, setI] = useState(0)
  const m = datos.meses[i]
  if (!m) return <div><p style={hola}>Para facturar</p><p style={sub}>Todavía no hay trabajos cargados a tu nombre.</p></div>
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
  const ir = t => { setTab(t); setJob(null); if (typeof window !== 'undefined') window.scrollTo(0, 0) }
  return <div style={{ maxWidth: 520, margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
    <div style={{ flex: 1, padding: '18px 16px 96px' }}>
      {job ? <Trabajo j={job} onVolver={() => setJob(null)} />
        : tab === 'agenda' ? <Agenda datos={datos} onAbrir={j => { setJob(j); if (typeof window !== 'undefined') window.scrollTo(0, 0) }} />
        : tab === 'facturar' ? <Facturar datos={datos} />
        : tab === 'entregas' ? <Entregas datos={datos} />
        : <Ficha datos={datos} onSalir={onSalir} />}
    </div>
    <nav style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: T.surface, borderTop: `1px solid ${T.border}`, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div style={{ maxWidth: 520, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)' }}>
        {TABS.map(([k, l]) => { const on = !job ? tab === k : k === 'agenda'
          return <button key={k} onClick={() => ir(k)} style={{ border: 0, background: 'transparent', padding: '10px 2px 12px', fontSize: 11.5, fontWeight: on ? 700 : 500, color: on ? T.ink : T.ink3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'pointer', fontFamily: 'inherit' }}>
            <i style={{ width: 18, height: 3, borderRadius: 3, background: on ? T.brand : 'transparent' }} />{l}
          </button> })}
      </div>
    </nav>
  </div>
}
