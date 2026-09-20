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

import React, { useState, useMemo, useEffect, useRef } from 'react'
import { T, MONO, useEsCelular } from '../lib/ui'
import { canonStaff } from '../lib/staff'
import {
  ESTADOS, PRIORIDADES, semaforo, COLOR_SEM, estaCerrado, ESTADO_IDX, estadoDe,
  limpiarPedido, parseFechaAR, aAR, aISO, fechaSugerida, hoyCero, diasEntre,
  CAMPOS_PIEZA, CAMPOS_BRIEF, briefLleno, briefTotal, piezaLlena, piezaTotal,
  textoPedirBrief, textoParaElEditor, esperaAlPM, esperaAlCliente, ES_MAGMA, esPedidoEdicion,
  esPedidoFoto, llevaFotos,
} from '../lib/edicion'
import FotosProyecto from './FotosProyecto'
import { quienSoy, esMio } from '../lib/quien-soy'

// Lo que cada uno elige (ver solo lo suyo, qué secciones deja abiertas) queda en
// su navegador. No va al sheet: es cómo le gusta mirar a cada uno, no un dato.
const recordar = (k, v) => { try { window.localStorage.setItem(k, v) } catch (e) {} }
const recordado = k => { try { return window.localStorage.getItem(k) } catch (e) { return null } }

// ---------------------------------------------------------------- estilos
const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12 }
const inp = { padding: '7px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, fontSize: 13, color: T.ink, outline: 'none', fontFamily: 'inherit' }
const btn = { padding: '7px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.ink2, fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }
const btnPri = { ...btn, background: T.brand, color: '#fff', border: 'none', fontWeight: 600 }
const lbl = { fontSize: 10.5, color: T.ink3, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: 5 }

const COLOR_PRIO = { Urgente: T.brand, Normal: T.ink3, Baja: T.ink3 }
const FILTROS = [
  { id: 'activos',  label: 'Todo lo abierto' },
  { id: 'revisar',  label: 'Esperan tu OK' },
  { id: 'cliente',  label: 'Con el cliente' },   // esperan el OK del cliente: la lista para llamar
  { id: 'rojo',     label: 'Atrasado' },
  { id: 'naranja',  label: 'Vence hoy' },
  { id: 'amarillo', label: 'Esta semana' },
  { id: 'verde',    label: 'En fecha' },
  { id: 'listo',    label: 'Terminados' },
]

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const nombreDe = mail => String(mail || '').split('@')[0]
const esURL = s => /^https?:\/\//i.test(String(s || '').trim())
const claveNombre = s => norm(s).replace(/[^a-z0-9]/g, '')

// ---------------------------------------------------------------- principal
export default function Edicion({ data, onRefresh, showToast, mail, nav, clearNav, goTo }) {
  const [vista, setVista] = useState('tablero')   // 'tablero' | 'info'
  // La FICHA: un trabajo solo en pantalla, sin el resto del tablero alrededor.
  // Dani, 17/9/2026: en Airtable "hacía click en la tarea y se me abría una pág
  // solita con esa tarea sin ver las demás". `abierto` dice cuál, `enfoque` dice
  // que se ve sola. (Abierto sin enfoque = desplegada en la lista: lo recién creado.)
  const [enfoque, setEnfoque] = useState(false)
  const [volverA, setVolverA] = useState(null)    // 'calendario' si vino de ahí
  // "Lo mío": lo que edito o lo que respondo como PM. Queda recordado por navegador.
  const [soloMio, setSoloMio] = useState(false)
  const [local, setLocal] = useState({})          // cambios ya aplicados en pantalla
  const [filtro, setFiltro] = useState('activos')
  const [q, setQ] = useState('')
  const [personaF, setPersonaF] = useState('todos')
  // Filtrar por PM es distinto de filtrar por editor: el editor es quien lo hace, el PM
  // es quien responde por el trabajo ante el cliente. Cada PM tiene que poder ver sus
  // trabajos sin leer los de los otros tres.
  const [pmF, setPmF] = useState('todos')
  // Filtrar por estado es distinto de filtrar por plazo: los chips de arriba
  // ordenan por CUÁNDO vence, esto por EN QUÉ ANDA. Hacía falta porque al pasar
  // algo a "Material listo" la fila se recalcula, cambia de chip y se pierde de
  // vista — y no había forma de volver a encontrarla.
  const [estadoF, setEstadoF] = useState('todos')
  const [abierto, setAbierto] = useState(null)
  const [sincro, setSincro] = useState(false)
  const [drive, setDrive] = useState({})
  const [nueva, setNueva] = useState(false)
  // Lo que se tocó en esta sesión (cambio de estado, alta) se sigue viendo aunque
  // ya no entre en el filtro. Antes, mover una fila la recalculaba, cambiaba de
  // chip y desaparecía de la pantalla: "la apretás y desaparece".
  const [tocados, setTocados] = useState(() => new Set())
  const [scrollA, setScrollA] = useState(null)
  const cel = useEsCelular()

  // Sin ID no es una fila del tablero: no se puede guardar ni reconocer. Las 133
  // filas corridas del 14/9 se veían como renglones en blanco con el cartel MAGMA.
  const crudas = useMemo(() => (data?.edicion || []).filter(f => String(f.ID || '').trim()), [data])
  const hoy = hoyCero()

  // Si llegó desde un aviso por mail (?e=<ID>) o desde el calendario, se abre la
  // FICHA de ese trabajo: él solo en pantalla. Antes se abría en medio del tablero
  // y, para que no quedara escondido, se sacaban todos los filtros — o sea que
  // quien venía de mirar solo lo suyo caía en las tareas de todos ("a veces tengo
  // que andar buscando", Dani 17/9/2026). Los filtros ya no se tocan: al volver,
  // el tablero está como lo dejó.
  useEffect(() => {
    const id = nav?.abrir
    if (!id) return
    setVista('tablero'); setAbierto(id); setEnfoque(true); setVolverA(nav.desde || null)
    clearNav && clearNav()
  }, [nav]) // eslint-disable-line

  const abrir = id => { if (id) { setAbierto(id); setEnfoque(true) } else salirFicha() }
  function salirFicha() {
    const id = abierto
    setEnfoque(false); setAbierto(null); setVolverA(null)
    if (id) setScrollA(id)   // el tablero vuelve parado en la fila de la que salió
  }
  // Esc cierra la ficha, como el registro expandido de Airtable.
  useEffect(() => {
    if (!enfoque) return
    const h = e => { if (e.key === 'Escape' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) salirFicha() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [enfoque, abierto]) // eslint-disable-line
  // Al entrar a una ficha, arriba de todo: si no, queda scrolleada donde estaba el tablero.
  useEffect(() => {
    if (!enfoque || !abierto) return
    const el = document.getElementById('ed-ficha-tope')
    if (el) el.scrollIntoView({ block: 'start' })
  }, [enfoque, abierto])

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

  // Quién soy en el tablero, y qué es "lo mío": lo que edito o lo que respondo como PM.
  const yo = useMemo(() => quienSoy(mail, data?.rrhh), [mail, data])
  const mias = useMemo(() => filas.filter(f => esMio(f, yo)), [filas, yo])
  const miasAbiertas = useMemo(() => mias.filter(f => !estaCerrado(f.Estado)).length, [mias])
  // Al freelancer /api/data ya le manda solo sus filas: el botón no le suma nada.
  const hayMio = mias.length > 0 && !data?.__soloLoSuyo
  // Quien edita arranca en lo suyo; el resto (Juan, Sofi) arranca viendo todo. Una
  // vez que alguien lo cambia, manda lo que eligió.
  const mioListo = useRef(false)
  useEffect(() => {
    if (mioListo.current || !crudas.length) return
    mioListo.current = true
    const g = recordado('ed-solo-mio')
    const edito = !!yo.editor && filas.some(f => !estaCerrado(f.Estado) && canonStaff(String(f.Editor || '').trim()) === yo.editor)
    setSoloMio(g === null ? edito : g === '1')
  }, [crudas]) // eslint-disable-line
  const elegirMio = v => { setSoloMio(v); recordar('ed-solo-mio', v ? '1' : '0'); if (v) { setPersonaF('todos'); setPmF('todos') } }
  // Todo lo que se cuenta y se lista sale de acá: si estoy en "lo mío", los números
  // de arriba también son los míos (si no, dice "5 atrasados" y al tocar hay 2).
  const base = soloMio && hayMio ? mias : filas

  // Solo quien tenga trabajo ABIERTO. Si listamos a todos los que alguna vez
  // aparecieron, el desplegable arrastra fotógrafos y editores viejos con todo
  // entregado, y hay que buscar el nombre propio entre gente que no está
  // trabajando. Ordenado por carga: el que más tiene, primero.
  const personas = useMemo(() => {
    const cuenta = new Map()
    filas.forEach(f => {
      if (estaCerrado(f.Estado)) return
      const e = canonStaff(String(f.Editor || '').trim())
      if (e) cuenta.set(e, (cuenta.get(e) || 0) + 1)
    })
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
  }, [filas])
  // Quién puede editar. Sale de RRHH (rubro Editor / Motion), no de una lista escrita
  // en el código: el día que entra alguien nuevo aparece solo. Es un desplegable y no
  // un campo libre porque el nombre tiene que coincidir EXACTO con RRHH — si dice
  // "Dani" en vez de "Daniela Viviana Ayala", el aviso por mail no le llega a nadie.
  const editores = useMemo(() => {
    const de = new Map()
    ;(data?.rrhh || []).forEach(r => {
      const n = String(r['Nombre Apellido'] || '').trim()
      if (!n || !/edit|motion|post/i.test(String(r.Rubro || ''))) return
      de.set(n, /@/.test(String(r.Mail || '').trim()))
    })
    // Los que ya están asignados en el tablero van igual, aunque no tengan el rubro:
    // si no, abrir la ficha de alguien lo borraría de la lista sin querer.
    // Con el nombre de RRHH: "Dani" y "Daniela Viviana Ayala" son la misma persona.
    filas.forEach(f => { const n = canonStaff(String(f.Editor || '').trim()); if (n && !de.has(n)) de.set(n, false) })
    return [...de.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([nombre, tieneMail]) => ({ nombre, tieneMail }))
  }, [data, filas])

  const sinAsignar = useMemo(() => filas.filter(f => !estaCerrado(f.Estado) && !String(f.Editor || '').trim()).length, [filas])
  // Los PM que tienen trabajo abierto, con cuánto. El PM sale de PROYECTOS y lo copia
  // el sync; las filas viejas sin PM se agrupan en "Sin PM" para que no desaparezcan.
  const pms = useMemo(() => {
    const cuenta = new Map()
    filas.forEach(f => {
      if (estaCerrado(f.Estado)) return
      const p = String(f.PM || '').trim()
      if (p) cuenta.set(p, (cuenta.get(p) || 0) + 1)
    })
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
  }, [filas])
  const sinPM = useMemo(() => filas.filter(f => !estaCerrado(f.Estado) && !String(f.PM || '').trim()).length, [filas])
  const consultas = useMemo(() => base.filter(f => String(f.Consulta || '').trim()), [base])

  const visibles = useMemo(() => {
    const nq = norm(q.trim())
    return base.filter(f => {
      const nivel = f.__sem.nivel
      // Lo abierto desde un link y lo tocado en esta sesión se saltan el chip de
      // plazo y el desplegable de estado — son los que cambian cuando se mueve la
      // fila ("la apretás y desaparece"). El buscador y los filtros de persona NO:
      // escribir "farmacity" mostraba el Stand de Brasil recién tocado (14/9/2026).
      const fijada = abierto === f.ID || tocados.has(f.ID)
      if (!fijada) {
        if (filtro === 'revisar') { if (!esperaAlPM(f.Estado)) return false }
        else if (filtro === 'cliente') { if (!esperaAlCliente(f.Estado)) return false }
        else {
          if (filtro === 'activos' && nivel === 'listo') return false
          if (filtro !== 'activos' && filtro !== nivel) return false
        }
        if (estadoF !== 'todos' && estadoDe(f.Estado) !== estadoF) return false
      }
      if (personaF === '__sin__') { if (String(f.Editor || '').trim()) return false }
      else if (personaF !== 'todos' && String(f.Editor || '').trim() !== personaF) return false
      if (pmF === '__sin__') { if (String(f.PM || '').trim()) return false }
      else if (pmF !== 'todos' && String(f.PM || '').trim() !== pmF) return false
      if (nq && !norm([f['N° presupuesto'], f.Cliente, f.Agencia, f.Proyecto, f.Entregable, f.Editor, f.Notas].join(' ')).includes(nq)) return false
      return true
    })
  }, [base, filtro, q, personaF, pmF, estadoF, abierto, tocados])

  // Cuántos hay en cada estado, para no tener que elegir a ciegas en el desplegable.
  // Cuenta sobre lo que dejó pasar el chip de plazo y el filtro de persona: si estás
  // mirando "Atrasado", el desplegable dice cuántos atrasados hay en cada estado.
  const porEstado = useMemo(() => {
    const c = {}
    base.forEach(f => {
      if (filtro === 'revisar') { if (!esperaAlPM(f.Estado)) return }
      else if (filtro === 'cliente') { if (!esperaAlCliente(f.Estado)) return }
      else if (filtro === 'activos') { if (f.__sem.nivel === 'listo') return }
      else if (filtro !== f.__sem.nivel) return
      if (personaF === '__sin__') { if (String(f.Editor || '').trim()) return }
      else if (personaF !== 'todos' && String(f.Editor || '').trim() !== personaF) return
      if (pmF === '__sin__') { if (String(f.PM || '').trim()) return }
      else if (pmF !== 'todos' && String(f.PM || '').trim() !== pmF) return
      const e = estadoDe(f.Estado)
      c[e] = (c[e] || 0) + 1
    })
    return c
  }, [base, filtro, personaF, pmF])

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
    const c = { activos: 0, revisar: 0, cliente: 0, rojo: 0, naranja: 0, amarillo: 0, verde: 0, listo: 0 }
    base.forEach(f => { c[f.__sem.nivel]++; if (f.__sem.nivel !== 'listo') c.activos++; if (esperaAlPM(f.Estado)) c.revisar++; if (esperaAlCliente(f.Estado)) c.cliente++ })
    return c
  }, [base])

  // `extra.nota` = el texto que se acaba de sumar a la bitácora. Es lo que hace
  // que salga el mail: sin eso, guardar un campo no le escribe a nadie. Y el
  // toast dice a quién le llegó — antes uno escribía el cambio y no sabía si
  // había salido algo (spoiler: no salía).
  async function guardar(id, campos, extra) {
    setLocal(l => ({ ...l, [id]: { ...(l[id] || {}), ...campos } }))
    if (campos.Estado !== undefined) setTocados(t => new Set(t).add(id))
    try {
      const r = await fetch('/api/edicion-guardar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, campos, ...(extra || {}) }) })
      const j = await r.json()
      if (!j.ok) return showToast(j.error || 'No se pudo guardar', 'err')
      if (j.aviso?.avisado) showToast(`Le llegó el mail a ${nombreDe(j.aviso.avisado)} ✓`)
      else if (extra?.nota) showToast('Anotado, pero no salió mail: nadie asignado o sin mail en RRHH', 'err')
    } catch (e) { showToast('Error de conexión', 'err') }
  }

  async function crearTarea(datos) {
    try {
      const r = await fetch('/api/edicion-nuevo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) })
      const j = await r.json()
      if (!j.ok) { showToast(j.error || 'No se pudo crear', 'err'); return false }
      const nombres = (j.nombres || []).join(', ')
      showToast(j.creadas === 1 ? `Agregado: ${nombres || 'tarea'} ✓` : `${j.creadas} agregados: ${nombres} ✓`)
      // Que se vea dónde quedó: se abre y la pantalla baja hasta ahí. "El otro día
      // cargamos una tarea y nos costó encontrarla" (Juan, 14/9/2026).
      if (j.ids?.length) {
        setTocados(t => { const n = new Set(t); j.ids.forEach(i => n.add(i)); return n })
        setAbierto(j.ids[0]); setScrollA(j.ids[0])
      }
      setNueva(false); onRefresh && onRefresh()
      return true
    } catch (e) { showToast('Error de conexión', 'err'); return false }
  }

  // `silencioso`: la corrida automática de al abrir. Solo avisa si cambió algo y
  // no pisa lo que haya en pantalla si no hubo nada que traer.
  async function sincronizar(silencioso = false) {
    setSincro(true)
    try {
      const r = await fetch('/api/edicion-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const j = await r.json()
      if (!j.ok) { if (!silencioso) showToast(j.error || 'No se pudo sincronizar', 'err') }
      else {
        const partes = []
        if (j.nuevas) partes.push(`${j.nuevas} ${j.nuevas === 1 ? 'entregable nuevo' : 'entregables nuevos'}`)
        // Decir cuántas se limpiaron: si desaparece una fila del tablero sin avisar,
        // el que la estaba mirando piensa que se rompió algo.
        if (j.borradas) partes.push(`${j.borradas} ${j.borradas === 1 ? 'huérfana borrada' : 'huérfanas borradas'} (el proyecto ya no existe)`)
        if (partes.length || !silencioso) showToast(partes.length ? partes.join(' · ') : 'Todo al día ✓')
        if (j.huerfanasConTrabajo && !silencioso) showToast(`${j.huerfanasConTrabajo} sin proyecto pero con trabajo cargado: las dejé, miralas`, 'err')
        if (partes.length || j.actualizadas || !silencioso) { setLocal({}); onRefresh && onRefresh() }
      }
    } catch (e) { if (!silencioso) showToast('Error de conexión', 'err') }
    setSincro(false)
  }

  // Al abrir el tablero se pone al día solo. Hasta hoy dependía de que alguien
  // apretara "↻ Actualizar": al 14/9/2026 llevaba una semana sin correrse y le
  // faltaban 17 entregables aprobados (Farmacity #2293 entre ellos).
  const autoSync = useRef(false)
  useEffect(() => {
    if (autoSync.current || !Array.isArray(data?.edicion)) return
    autoSync.current = true
    sincronizar(true)
  }, [data]) // eslint-disable-line

  // Bajar hasta la fila recién creada, cuando ya está en los datos.
  useEffect(() => {
    if (!scrollA) return
    const el = document.getElementById(`ed-${scrollA}`)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setScrollA(null)
  }, [crudas, scrollA])

  // Un número que ya no está en PROYECTOS (represupuestado, desaprobado, borrado)
  // no tiene carpetas ni las va a tener: las tiene el número vigente. Pasó con
  // #2191 → #2293: la fila vieja decía "sin material" con 50 GB ya subidos al 2293.
  const proyectos = data?.proyectos || []
  const numsVivos = useMemo(() => new Set(proyectos.map(p => String(p['N° presupuesto'] || '').trim())), [proyectos])
  // Los links de Drive salen de PROYECTOS (los escribe la app al aprobar). La fila
  // de EDICION tiene los suyos por pieza; si están vacíos, manda el proyecto.
  const proyDe = useMemo(() => new Map(proyectos.map(p => [String(p['N° presupuesto'] || '').trim(), p])), [proyectos])
  const sucesorDe = g => {
    if (!numsVivos.size || numsVivos.has(String(g.num))) return null
    const k = s => norm(s).replace(/[^a-z0-9]/g, '')
    const p = proyectos.find(p => k(p.Cliente) === k(g.cliente) && k(p.Proyecto) === k(g.proyecto))
    return { fantasma: true, sucesor: p ? String(p['N° presupuesto']).trim() : '' }
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
    guardar(f.ID, { Consulta: `${nombreDe(mail)}: ${t}`, Notas: lineaBitacora(mail, '🙋 ' + t) + (String(f.Notas || '').trim() ? '\n' + f.Notas : '') }, { nota: '🙋 ' + t })
  }
  const responder = (f, texto) => {
    const t = texto.trim()
    guardar(f.ID, { Consulta: '', Notas: (t ? lineaBitacora(mail, '💬 ' + t) + '\n' : '') + String(f.Notas || '') }, t ? { nota: '💬 ' + t } : undefined)
  }

  const PMS = useMemo(() => {
    const de = new Set(PMS_FIJOS)
    ;(data?.proyectos || []).forEach(p => { const v = String(p.PM || '').trim(); if (v) de.add(v) })
    filas.forEach(f => { const v = String(f.PM || '').trim(); if (v) de.add(v) })
    return [...de].sort((a, b) => a.localeCompare(b, 'es'))
  }, [data, filas])

  // El logo de cada cliente, sacado de cualquier pieza donde ya se haya cargado:
  // se pega una vez y las demás lo toman con un clic. Juan, 14/9/2026: "dónde lo
  // cargo fácil… recién a Dani le puse el link del logo en los comentarios".
  const logos = useMemo(() => {
    const m = {}
    filas.forEach(f => { const v = String(f['Logo y placas'] || '').trim(); const k = norm(f.Cliente || f.Agencia); if (k && esURL(v) && !m[k]) m[k] = { link: v, num: f['N° presupuesto'], id: f.ID } })
    return m
  }, [filas])

  const horas = data?.horasExtra || []
  // La carpeta Recursos de cada agencia y cliente (logo, gráfica, lo general).
  // Sale de AGENCIAS / CLIENTES, columna "Drive Recursos" (scripts/drive-recursos.mjs).
  const recursosDe = useMemo(() => {
    const ag = new Map((data?.agencias || []).map(a => [claveNombre(a.Nombre), String(a['Drive Recursos'] || '').trim()]).filter(([k, v]) => k && esURL(v)))
    const cl = new Map((data?.clientes || []).map(c => [claveNombre(c.Nombre), String(c['Drive Recursos'] || '').trim()]).filter(([k, v]) => k && esURL(v)))
    return (agencia, cliente) => ({ agencia: ag.get(claveNombre(agencia)) || '', cliente: cl.get(claveNombre(cliente)) || '' })
  }, [data])
  const props = { guardar, carpeta, crudoAlCliente, mail, preguntar, responder, cel, showToast, personaF, editores, PMS, crearTarea, logos, horas, onRefresh, soloLoSuyo: data?.__soloLoSuyo || null, recursosDe }

  // ------------------------------------------------------------ la ficha
  // El trabajo abierto, solo. El grupo se arma con TODAS las piezas del proyecto
  // (el logo se copia a las hermanas, "+ Video" copia el brief de una de ellas)
  // pero se dibuja una sola: `soloId`. No pasa por ningún filtro.
  const fichaF = enfoque && abierto ? filas.find(f => f.ID === abierto) : null
  if (enfoque && abierto) {
    const hermanas = fichaF ? filas.filter(f => String(f['N° presupuesto']) === String(fichaF['N° presupuesto'])) : []
    const g = fichaF && {
      num: String(fichaF['N° presupuesto'] || '—'), fecha: fichaF['Fecha Evento'], cliente: fichaF.Cliente, agencia: fichaF.Agencia, proyecto: fichaF.Proyecto,
      linkCrudo: (hermanas.find(h => h['Link crudo']) || {})['Link crudo'] || '', linkEntrega: (hermanas.find(h => h['Link entrega']) || {})['Link entrega'] || '',
      items: [fichaF, ...hermanas.filter(h => h.ID !== fichaF.ID)],
    }
    return <div id="ed-ficha-tope">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        {volverA === 'calendario' && goTo
          ? <>
              <button onClick={() => goTo('calendario')} style={{ ...btnPri, padding: '8px 14px', fontSize: 13 }}>← Volver al calendario</button>
              <button onClick={salirFicha} style={{ ...btn, padding: '8px 12px' }}>Ver en el tablero</button>
            </>
          : <button onClick={salirFicha} style={{ ...btnPri, padding: '8px 14px', fontSize: 13 }}>← Volver al tablero</button>}
        {!cel && <span style={{ fontSize: 11.5, color: T.ink3 }}>o apretá Esc</span>}
      </div>
      {g
        ? <Grupo key={g.num} g={g} abierto={abierto} setAbierto={abrir} drive={drive} mailsCliente={mailsDe(g.agencia, g.cliente)} {...(sucesorDe(g) || {})} proy={proyDe.get(String(g.num))} {...props} personaF="todos" soloId={abierto} />
        : <div style={{ ...card, padding: 28, textAlign: 'center', color: T.ink2, fontSize: 13.5 }}>
            {crudas.length ? `El trabajo ${abierto} no está en tu tablero: se cerró, se represupuestó o no lo tenés asignado.` : 'Cargando…'}
          </div>}
    </div>
  }

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
            <button onClick={() => sincronizar(false)} disabled={sincro} style={btnPri}>{sincro ? 'Buscando…' : 'Traer los entregables'}</button>
            <div style={{ fontSize: 11.5, color: T.ink3, marginTop: 14 }}>Si da error de solapa, correr <code style={{ fontFamily: MONO }}>node scripts/edicion-setup.mjs --escribir</code></div>
          </div>
        : <>
          {consultas.length > 0 && <Consultas consultas={consultas} responder={responder} setAbierto={abrir} />}

          {/* Lo mío / todo el equipo. Va primero y manda sobre todo lo de abajo: los
              números, los chips y la lista. Dani, 17/9/2026: "siento que cuando aprieto
              veo las de todos y a veces tengo que andar buscando". */}
          {hayMio && <div style={{ display: 'flex', gap: 0, marginBottom: cel ? 10 : 14, border: `1px solid ${T.border}`, borderRadius: 9, overflow: 'hidden', width: cel ? '100%' : 'fit-content' }}>
            {[[true, 'Lo mío', miasAbiertas], [false, 'Todo el equipo', filas.filter(f => !estaCerrado(f.Estado)).length]].map(([v, l, n]) => {
              const activo = soloMio === v
              return <button key={l} onClick={() => elegirMio(v)} style={{ flex: cel ? 1 : undefined, padding: cel ? '10px 12px' : '8px 16px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: activo ? 700 : 500, background: activo ? T.ink : T.surface, color: activo ? '#fff' : T.ink2 }}>{l} <span style={{ fontFamily: MONO, opacity: 0.65, marginLeft: 4 }}>{n}</span></button>
            })}
          </div>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: cel ? 6 : 10, marginBottom: cel ? 12 : 16 }}>
            <Kpi n={cuenta.rojo} l="atrasados" c={COLOR_SEM.rojo.fg} onClick={() => setFiltro('rojo')} activo={filtro === 'rojo'} cel={cel} />
            <Kpi n={cuenta.naranja} l={cel ? 'hoy' : 'vencen hoy'} c={COLOR_SEM.naranja.fg} onClick={() => setFiltro('naranja')} activo={filtro === 'naranja'} cel={cel} />
            <Kpi n={cuenta.amarillo} l={cel ? 'semana' : 'esta semana'} c={COLOR_SEM.amarillo.fg} onClick={() => setFiltro('amarillo')} activo={filtro === 'amarillo'} cel={cel} />
            <Kpi n={cuenta.revisar} l={cel ? 'tu OK' : 'esperan tu OK'} c={T.brand} onClick={() => setFiltro('revisar')} activo={filtro === 'revisar'} cel={cel} />
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
            {/* Siete chips en un teléfono son tres renglones antes del primer
                trabajo. En celular van como un solo desplegable. */}
            {cel && <select value={filtro} onChange={e => setFiltro(e.target.value)} style={{ ...inp, flex: '1 1 100%', fontSize: 13, padding: '9px 10px', cursor: 'pointer' }}>
              {FILTROS.map(f => <option key={f.id} value={f.id}>{f.label} ({cuenta[f.id]})</option>)}
            </select>}
            {!cel && FILTROS.map(f => {
              const activo = filtro === f.id
              return <button key={f.id} onClick={() => setFiltro(f.id)} style={{
                ...btn, padding: '6px 11px', fontSize: 12,
                border: `1px solid ${activo ? T.ink : T.border}`, background: activo ? T.ink : T.surface, color: activo ? '#fff' : T.ink2, fontWeight: activo ? 600 : 500,
              }}>{f.label} <span style={{ fontFamily: MONO, opacity: 0.65, marginLeft: 3 }}>{cuenta[f.id]}</span></button>
            })}
            {!cel && <div style={{ flex: 1 }} />}
            <select value={estadoF} onChange={e => setEstadoF(e.target.value)} title="En qué anda cada entregable (distinto del plazo)" style={{ ...inp, padding: cel ? '9px 10px' : '6px 9px', fontSize: cel ? 13 : 12, flex: cel ? '1 1 100%' : undefined, maxWidth: cel ? '100%' : 200, borderColor: estadoF !== 'todos' ? T.ink : T.border, fontWeight: estadoF !== 'todos' ? 600 : 400 }}>
              <option value="todos">Cualquier estado</option>
              {ESTADOS.filter(e => porEstado[e] || e === estadoF).map(e => <option key={e} value={e}>{e} ({porEstado[e] || 0})</option>)}
            </select>
            <select value={pmF} onChange={e => { setPmF(e.target.value); if (e.target.value !== 'todos') setSoloMio(false) }} title="Quién responde por el trabajo ante el cliente (distinto del editor)" style={{ ...inp, padding: cel ? '9px 10px' : '6px 9px', fontSize: cel ? 13 : 12, flex: cel ? '1 1 100%' : undefined, maxWidth: cel ? '100%' : 180, borderColor: pmF !== 'todos' ? T.ink : T.border, fontWeight: pmF !== 'todos' ? 600 : 400 }}>
              <option value="todos">Cualquier PM</option>
              {sinPM > 0 && <option value="__sin__">Sin PM ({sinPM})</option>}
              {pms.map(([p, n]) => <option key={p} value={p}>PM {p} ({n})</option>)}
            </select>
            <select value={personaF} onChange={e => { setPersonaF(e.target.value); if (e.target.value !== 'todos') setSoloMio(false) }} title="Quién lo edita" style={{ ...inp, padding: cel ? '9px 10px' : '6px 9px', fontSize: cel ? 13 : 12, flex: cel ? '1 1 100%' : undefined, maxWidth: cel ? '100%' : 230 }}>
              <option value="todos">Todo el equipo</option>
              {sinAsignar > 0 && <option value="__sin__">Sin asignar ({sinAsignar})</option>}
              {personas.map(([e, n]) => <option key={e} value={e}>{e} ({n})</option>)}
            </select>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar proyecto, cliente…" style={{ ...inp, padding: cel ? '9px 10px' : '6px 10px', fontSize: cel ? 13 : 12, flex: cel ? '1 1 100%' : undefined, width: cel ? '100%' : 190 }} />
            <button onClick={() => sincronizar(false)} disabled={sincro} title="Trae los entregables nuevos desde Proyectos (también corre solo al abrir)" style={{ ...btn, padding: cel ? '9px 12px' : '6px 11px', fontSize: cel ? 13 : 12, flex: cel ? 1 : undefined }}>{sincro ? '…' : '↻ Actualizar'}</button>
            <button onClick={() => setNueva(n => !n)} title="Para sumar un video a un proyecto que ya está en el tablero, usá el “+ Video” de ese proyecto" style={{ ...btnPri, padding: cel ? '9px 14px' : '6px 12px', fontSize: cel ? 13 : 12, flex: cel ? 1 : undefined }}>{nueva ? 'Cerrar' : '+ Tarea'}</button>
          </div>

          {nueva && <NuevaTarea onCrear={crearTarea} onCancelar={() => setNueva(false)} proyectos={data?.proyectos || []} personas={editores.map(e => e.nombre)} />}

          {!grupos.length
            ? <div style={{ ...card, padding: 30, textAlign: 'center', color: T.ink2, fontSize: 13.5 }}>{soloMio && hayMio ? 'Nada tuyo acá.' : 'Nada acá.'} {(filtro !== 'activos' || estadoF !== 'todos') && <button onClick={() => { setFiltro('activos'); setEstadoF('todos') }} style={{ ...btn, marginLeft: 8, padding: '4px 10px' }}>Ver todo lo abierto</button>}{soloMio && hayMio && <button onClick={() => elegirMio(false)} style={{ ...btn, marginLeft: 8, padding: '4px 10px' }}>Ver todo el equipo</button>}</div>
            : grupos.map(g => <Grupo key={g.num} g={g} abierto={abierto} setAbierto={abrir} drive={drive} mailsCliente={mailsDe(g.agencia, g.cliente)} {...(sucesorDe(g) || {})} proy={proyDe.get(String(g.num))} {...props} />)}
        </>}
    </>}
  </div>
}

// Los PM posibles. Salen de los que ya figuran en PROYECTOS, más el equipo fijo:
// si alguien nuevo toma la posta todavía no está en ningún proyecto y hay que poder
// asignárselo igual.
const PMS_FIJOS = ['Juan', 'Sofi', 'Lulu', 'Tomi']

const lineaBitacora = (mail, texto) => {
  const d = new Date()
  return `[${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${nombreDe(mail)}] ${texto}`
}

// Copiar al portapapeles con feedback. `texto` es una función para no armar el
// mensaje en cada render (son varios por fila).
function BotonCopiar({ texto, etiqueta }) {
  const [ok, setOk] = useState(false)
  const copiar = async () => {
    try { await navigator.clipboard.writeText(typeof texto === 'function' ? texto() : texto); setOk(true); setTimeout(() => setOk(false), 2000) } catch (e) {}
  }
  return <button onClick={copiar} style={{ ...btn, padding: '5px 11px', fontSize: 11.5 }}>{ok ? '✓ Copiado' : etiqueta}</button>
}

// ---------------------------------------------------- el OK del PM
// El paso que faltaba: antes de que algo salga al cliente, alguien de Magma lo
// mira. Aprobar hace las tres cosas de una —mueve el archivo a Finales, le da
// acceso al cliente y marca la fecha real— porque hoy son tres pasos sueltos y
// alguno siempre se olvida. Pedir cambios los cuenta aparte de los del cliente:
// muchas vueltas internas es un problema de edición, muchas del cliente es de brief.
// Aprobar NO cierra: deja la pieza "Con el cliente". Cerrar es el OK de él (abajo).
function Revisar({ f, guardar, mailsCliente, showToast, cel }) {
  const [modo, setModo] = useState(null)      // null | 'aprobar' | 'cambios'
  const [texto, setTexto] = useState('')
  const [mails, setMails] = useState((mailsCliente || []).join(', '))
  const [plan, setPlan] = useState(null)
  const [yendo, setYendo] = useState(false)
  const link = String(f['Link pre-entrega'] || '').trim()

  const pedirPlan = async () => {
    setModo('aprobar'); setYendo(true)
    try {
      const r = await fetch('/api/edicion-aprobar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: f.ID, mailsCliente: mails.split(/[,;\s]+/).filter(x => /@/.test(x)) }) })
      const j = await r.json()
      if (!j.ok) showToast(j.error || 'No se pudo', 'err'); else setPlan(j)
    } catch (e) { showToast('Error de conexión', 'err') }
    setYendo(false)
  }

  const aprobar = async () => {
    setYendo(true)
    try {
      const r = await fetch('/api/edicion-aprobar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: f.ID, mailsCliente: mails.split(/[,;\s]+/).filter(x => /@/.test(x)), confirmar: true }) })
      const j = await r.json()
      if (!j.ok) { showToast(j.error || 'No se pudo', 'err'); setYendo(false); return }
      showToast(j.movido ? 'Con el cliente ✓ el archivo pasó a Finales' : 'Quedó con el cliente ✓')
      guardar(f.ID, { Estado: 'Con el cliente' })
      setModo(null); setPlan(null)
    } catch (e) { showToast('Error de conexión', 'err') }
    setYendo(false)
  }

  const pedirCambios = () => {
    const t = texto.trim()
    guardar(f.ID, {
      Estado: 'Cambios internos',
      Notas: (t ? `[${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}] ✏️ cambios internos: ${t}\n` : '') + String(f.Notas || ''),
    })
    setModo(null); setTexto('')
  }

  return <div style={{ border: `1px solid ${T.brand}40`, background: T.brandSoft, borderRadius: 10, padding: '13px 15px', marginBottom: 14 }}>
    <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 4 }}>Esperando tu OK</div>
    <div style={{ fontSize: 12.5, color: T.ink2, marginBottom: 11 }}>
      {f.Editor || 'El editor'} subió una versión. Si va, se la mandamos al cliente y queda esperando su OK; si no, vuelve sin que él se entere.
    </div>

    {link
      ? <a href={link} target="_blank" rel="noreferrer" style={{
          display: 'block', textAlign: 'center', padding: cel ? '16px' : '12px', borderRadius: 9,
          background: T.surface, border: `1px solid ${T.border}`, color: T.ink, textDecoration: 'none',
          fontSize: 14, fontWeight: 600, marginBottom: 11,
        }}>▶ Ver la versión</a>
      : <div style={{ fontSize: 12, color: T.brand, marginBottom: 11 }}>No hay link de pre-entrega cargado — pedíselo antes de aprobar.</div>}

    {!modo && <div style={{ display: 'flex', gap: 8, flexDirection: cel ? 'column' : 'row' }}>
      <button onClick={pedirPlan} style={{ ...btnPri, flex: 1, padding: '11px', background: '#1E8A5A' }}>Aprobar y mandar al cliente</button>
      <button onClick={() => setModo('cambios')} style={{ ...btn, flex: 1, padding: '11px' }}>Pedir cambios</button>
    </div>}

    {modo === 'cambios' && <div>
      <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2} autoFocus
        placeholder="Qué hay que corregir — queda en la bitácora y le llega al editor"
        style={{ ...inp, width: '100%', resize: 'vertical', marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={pedirCambios} style={btnPri}>Mandar los cambios</button>
        <button onClick={() => setModo(null)} style={btn}>Cancelar</button>
      </div>
    </div>}

    {modo === 'aprobar' && <div>
      <label style={lbl}>Mails del cliente que reciben la entrega</label>
      <input value={mails} onChange={e => setMails(e.target.value)} placeholder="mail@cliente.com, otro@cliente.com"
        style={{ ...inp, width: '100%', marginBottom: 9, fontSize: 12.5 }} />
      {plan && <div style={{ fontSize: 12, color: T.ink2, marginBottom: 10, lineHeight: 1.6 }}>
        {plan.moverArchivo ? '· El archivo pasa a la carpeta Finales' : plan.sinLink ? '· Sin link de pre-entrega: no se mueve ningún archivo' : '· No encontré la carpeta Finales, se crea al aprobar'}<br />
        {plan.compartirCon?.length ? `· Se le da acceso a ${plan.compartirCon.length} ${plan.compartirCon.length === 1 ? 'mail' : 'mails'} — solo a Finales, no al resto` : '· Sin mails cargados: no se comparte con nadie todavía'}<br />
        · Queda "Con el cliente" con la fecha de entrega de hoy. Se cierra como Terminado cuando él dé el OK.
      </div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={aprobar} disabled={yendo} style={{ ...btnPri, background: '#1E8A5A' }}>{yendo ? 'Mandando…' : 'Confirmar y mandar'}</button>
        <button onClick={() => { setModo(null); setPlan(null) }} style={btn}>Cancelar</button>
      </div>
    </div>}
  </div>
}

// ---------------------------------------------------- el OK del cliente
// El cierre que faltaba. "Aprobar" mandaba la pieza al cliente y la fila quedaba
// como entregada, pero el trabajo no termina cuando sale: termina cuando el
// cliente dice que sí. Hasta el 14/9/2026 ese sí no se registraba en ningún lado
// y el Stand de Brasil figuraba cerrado con el cliente todavía mirándolo.
// Si pide correcciones, vuelven al editor con la nota (y suma una ronda suya).
function OKCliente({ f, guardar, showToast, cel }) {
  const [modo, setModo] = useState(null)      // null | 'cambios'
  const [texto, setTexto] = useState('')
  const desde = parseFechaAR(f['Fecha entrega'])
  const dias = desde ? diasEntre(desde, hoyCero()) : null
  const link = String(f['Link entrega'] || f['Link pre-entrega'] || '').trim()

  const terminar = () => {
    guardar(f.ID, { Estado: 'Terminado' })
    showToast && showToast(`${limpiarPedido(f.Entregable)} → Terminado ✓`)
  }
  const pedirCambios = () => {
    const t = texto.trim()
    guardar(f.ID, {
      Estado: 'Cambios del cliente',
      Notas: (t ? `[${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}] ✏️ cambios del cliente: ${t}\n` : '') + String(f.Notas || ''),
    })
    setModo(null); setTexto('')
  }

  return <div style={{ border: `1px solid ${T.pos}55`, background: T.posSoft, borderRadius: 10, padding: '13px 15px', marginBottom: 14 }}>
    <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 4 }}>
      Con el cliente{desde ? ` desde el ${aAR(desde)}` : ''}
      {dias !== null && dias >= 1 && <span style={{ fontWeight: 500, color: dias >= 5 ? T.brand : T.ink2 }}> · hace {dias} {dias === 1 ? 'día' : 'días'}{dias >= 5 ? ', vale un llamado' : ''}</span>}
    </div>
    <div style={{ fontSize: 12.5, color: T.ink2, marginBottom: 11 }}>
      Ya lo tiene. Cuando confirme que va, se cierra; si pide correcciones, le llegan al editor con tu nota.
    </div>
    {link && <a href={link} target="_blank" rel="noreferrer" style={{
      display: 'block', textAlign: 'center', padding: cel ? '16px' : '12px', borderRadius: 9,
      background: T.surface, border: `1px solid ${T.border}`, color: T.ink, textDecoration: 'none',
      fontSize: 14, fontWeight: 600, marginBottom: 11,
    }}>▶ Ver lo que se le mandó</a>}

    {!modo && <div style={{ display: 'flex', gap: 8, flexDirection: cel ? 'column' : 'row' }}>
      <button onClick={terminar} style={{ ...btnPri, flex: 1, padding: '11px', background: T.pos }}>El cliente dio el OK · Terminado</button>
      <button onClick={() => setModo('cambios')} style={{ ...btn, flex: 1, padding: '11px' }}>Pidió cambios</button>
    </div>}

    {modo === 'cambios' && <div>
      <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2} autoFocus
        placeholder="Qué pidió el cliente — queda en la bitácora y le llega al editor"
        style={{ ...inp, width: '100%', resize: 'vertical', marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={pedirCambios} style={btnPri}>Mandar los cambios</button>
        <button onClick={() => setModo(null)} style={btn}>Cancelar</button>
      </div>
    </div>}
  </div>
}

// ------------------------------------------------- qué es la pieza y qué necesita
// Dos capas a propósito: lo de arriba se contesta al presupuestar (y es lo único
// que hace falta para MEDIR, porque hoy el 44% de la post se llama "Edit 60s");
// lo de abajo al aprobar, que es cuando tiene sentido pedirle archivos al cliente.
function Campos({ f, campos, guardar, cols = 3 }) {
  const visibles = campos.filter(c => !c.soloSi || c.soloSi(f))
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10 }}>
    {visibles.map(c => {
      const valor = String(f[c.campo] || '')
      const ancho = c.tipo === 'largo' ? { gridColumn: '1/-1' } : {}
      return <div key={c.campo} style={ancho}>
        <label style={lbl}>{c.label || c.pregunta}</label>
        {c.opciones
          ? <select value={valor} onChange={e => guardar(f.ID, { [c.campo]: e.target.value })}
              style={{ ...inp, width: '100%', cursor: 'pointer', borderColor: valor ? T.border : `${T.brand}55` }}>
              <option value="">— sin definir —</option>
              {c.opciones.filter(Boolean).map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          : c.tipo === 'largo'
            ? <textarea defaultValue={valor} rows={2} placeholder={c.ph}
                onBlur={e => { if (e.target.value !== valor) guardar(f.ID, { [c.campo]: e.target.value }) }}
                style={{ ...inp, width: '100%', resize: 'vertical', borderColor: valor ? T.border : `${T.brand}55` }} />
            : <input defaultValue={valor} placeholder={c.ph}
                onBlur={e => { if (e.target.value !== valor) guardar(f.ID, { [c.campo]: e.target.value }) }}
                style={{ ...inp, width: '100%', borderColor: valor ? T.border : `${T.brand}55` }} />}
        {c.ayuda && <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 3 }}>{c.ayuda}</div>}
      </div>
    })}
  </div>
}

// El logo del cliente, a la vista. Es el campo "Logo y placas" del brief (capa 2),
// que estaba adentro de un desplegable cerrado: al 14/9/2026 lo tenía cargado 1
// fila de 115 y el link terminaba en la bitácora. Se pega una vez: queda para
// las otras piezas del proyecto, y las de otros trabajos del mismo cliente lo
// toman con un clic. Va en el mail al editor.
function Logo({ f, g, guardar, logos = {}, cel, rec = {} }) {
  const actual = String(f['Logo y placas'] || '').trim()
  const [v, setV] = useState(actual)
  useEffect(() => { setV(actual) }, [actual])
  const k = norm(f.Cliente || f.Agencia)
  const sugerido = logos[k] && logos[k].id !== f.ID && logos[k].link !== actual ? logos[k] : null
  const guardarLogo = val => {
    guardar(f.ID, { 'Logo y placas': val })
    ;(g?.items || []).filter(h => h.ID !== f.ID && !String(h['Logo y placas'] || '').trim()).forEach(h => guardar(h.ID, { 'Logo y placas': val }))
  }
  const confirmar = () => { if (v.trim() !== actual) guardarLogo(v.trim()) }
  return <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14, padding: '9px 12px', borderRadius: 9, background: actual ? T.surface : T.brandSoft, border: `1px solid ${actual ? T.border : T.brand + '40'}` }}>
    <span style={{ ...lbl, marginBottom: 0, whiteSpace: 'nowrap' }}>🎨 Logo y gráfica</span>
    {rec.cliente && <a href={rec.cliente} target="_blank" rel="noreferrer" title="La carpeta Recursos del cliente en ENTREGAS: logo, gráfica, lo general" style={{ ...btn, padding: '5px 11px', fontSize: 11.5, textDecoration: 'none', display: 'inline-block' }}>📁 Recursos de {f.Cliente}</a>}
    {rec.agencia && rec.agencia !== rec.cliente && <a href={rec.agencia} target="_blank" rel="noreferrer" title="La carpeta Recursos de la agencia" style={{ ...btn, padding: '5px 11px', fontSize: 11.5, textDecoration: 'none', display: 'inline-block' }}>📁 Recursos de {f.Agencia}</a>}
    {esURL(actual) && <a href={actual} target="_blank" rel="noreferrer" style={{ ...btn, padding: '5px 11px', fontSize: 11.5, textDecoration: 'none', display: 'inline-block' }}>Abrir lo puntual de esta pieza</a>}
    <input value={v} onChange={e => setV(e.target.value)} onBlur={confirmar} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmar() } }}
      placeholder={(rec.cliente || rec.agencia) ? 'Solo si esta pieza necesita algo que no está en Recursos (link o nota)' : 'Pegá el link del logo (Drive, WeTransfer…) o escribí “ya lo tenemos”'} style={{ ...inp, flex: 1, minWidth: cel ? '100%' : 260, fontSize: 12 }} />
    {!actual && sugerido && <button onClick={() => { setV(sugerido.link); guardarLogo(sugerido.link) }} style={{ ...btn, padding: '5px 11px', fontSize: 11.5 }}>Usar el de {f.Cliente || f.Agencia} (#{sugerido.num})</button>}
    {!cel && <span style={{ fontSize: 10.5, color: T.ink3, flexBasis: '100%' }}>{(rec.cliente || rec.agencia) ? 'El logo y la gráfica van en la carpeta Recursos (subilos ahí). Este campo es solo para algo puntual de esta pieza, y va en el mail al editor.' : actual ? 'Queda para las otras piezas de este proyecto y va en el mail al editor.' : 'Sin logo el editor arranca a ciegas: subilo a la carpeta Recursos del cliente en ENTREGAS y pegá el link acá.'}</span>}
  </div>
}

// Horas extra, cargadas en el momento y pegadas al trabajo. Juan, 14/9/2026:
// "así Dani puede cargar ahí si laburó fuera de hora y no esperamos a fin de mes".
// Cada carga es una fila de HORAS_EXTRA; acá se ven las de este proyecto y el
// total del mes de la persona. Quien tiene acceso parcial carga a su nombre.
const fmtH = n => (Math.round(n * 10) / 10).toLocaleString('es-AR') + ' hs'
function HorasExtra({ f, horas = [], editores = [], showToast, onRefresh, soloLoSuyo, cel }) {
  const editorFila = canonStaff(String(f.Editor || '').trim())
  const [quien, setQuien] = useState(soloLoSuyo || (editorFila && !ES_MAGMA(editorFila) ? editorFila : ''))
  const [h, setH] = useState('')
  const [motivo, setMotivo] = useState('')
  const [yendo, setYendo] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const num = String(f['N° presupuesto'] || '').trim()
  const delProyecto = horas.filter(x => String(x['N° presupuesto'] || '').trim() === num)
  const totalProy = delProyecto.reduce((a, x) => a + (parseFloat(String(x.Horas || '').replace(',', '.')) || 0), 0)
  const mesActual = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })()
  const totalMes = quien ? horas.filter(x => canonStaff(x.Persona) === quien && String(x.Mes || '') === mesActual).reduce((a, x) => a + (parseFloat(String(x.Horas || '').replace(',', '.')) || 0), 0) : 0
  const sumar = async () => {
    const n = parseFloat(String(h).replace(',', '.'))
    if (!n || n <= 0) return showToast && showToast('Poné cuántas horas', 'err')
    setYendo(true)
    try {
      const r = await fetch('/api/horas-extra', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: f.ID, horas: n, motivo, persona: quien }) })
      const j = await r.json()
      if (!j.ok) showToast && showToast(j.error || 'No se pudo cargar', 'err')
      else { showToast && showToast(`${fmtH(j.horas)} de ${String(j.persona).split(' ')[0]} anotadas ✓`); setH(''); setMotivo(''); onRefresh && onRefresh() }
    } catch (e) { showToast && showToast('Error de conexión', 'err') }
    setYendo(false)
  }
  return <div style={{ marginBottom: 14, padding: '9px 12px', borderRadius: 9, background: T.surface, border: `1px solid ${T.border}` }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ ...lbl, marginBottom: 0, whiteSpace: 'nowrap' }}>⏱ Horas extra</span>
      <span style={{ fontSize: 12, color: T.ink2 }}>{delProyecto.length ? <>{fmtH(totalProy)} en este trabajo</> : 'ninguna cargada en este trabajo'}{quien && totalMes > 0 && <span style={{ color: T.ink3 }}> · {String(quien).split(' ')[0]} lleva {fmtH(totalMes)} este mes</span>}</span>
      <div style={{ flex: 1 }} />
      <button onClick={() => setAbierto(a => !a)} style={{ ...btn, padding: '5px 11px', fontSize: 11.5 }}>{abierto ? 'Cerrar' : '+ Cargar horas'}</button>
    </div>
    {abierto && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 9 }}>
      {!soloLoSuyo && <select value={quien} onChange={e => setQuien(e.target.value)} style={{ ...inp, fontSize: 12, cursor: 'pointer' }}>
        <option value="">— quién —</option>
        {[...new Set([editorFila, ...editores.map(e => e.nombre)].filter(x => x && !ES_MAGMA(x)))].map(n => <option key={n} value={n}>{n}</option>)}
      </select>}
      <input type="number" step="0.5" min="0.5" max="24" value={h} onChange={e => setH(e.target.value)} placeholder="hs" style={{ ...inp, width: 70, fontFamily: MONO }} />
      <input value={motivo} onChange={e => setMotivo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sumar() }} placeholder="Por qué (cambios del cliente, entrega urgente…)" style={{ ...inp, flex: 1, minWidth: cel ? '100%' : 220, fontSize: 12 }} />
      <button onClick={sumar} disabled={yendo || !quien} style={{ ...btnPri, opacity: quien ? 1 : 0.5 }}>{yendo ? 'Anotando…' : 'Anotar'}</button>
      <span style={{ fontSize: 10.5, color: T.ink3, flexBasis: '100%' }}>Queda con fecha de hoy en HORAS_EXTRA y aparece en Pagos Staff del mes, valorizada con la tarifa de hora extra de RRHH.</span>
    </div>}
    {abierto && delProyecto.length > 0 && <div style={{ marginTop: 8, fontSize: 11.5, color: T.ink2, lineHeight: 1.6 }}>
      {delProyecto.slice(-6).map((x, i) => <div key={i}>{x.Fecha} · {String(x.Persona || '').split(' ')[0]} · <strong>{fmtH(parseFloat(String(x.Horas || '').replace(',', '.')) || 0)}</strong>{x.Motivo ? ` · ${x.Motivo}` : ''}</div>)}
    </div>}
  </div>
}

// Con `id`, lo que cada uno deja abierto o cerrado queda así para la próxima vez
// (en su navegador). Dani, 17/9/2026: "está bueno para ocultar y mostrar info y que
// no esté toda a la vista". `siempreSiAlerta`: si falta algo se abre igual, aunque
// la haya cerrado — lo que falta no se esconde.
function Plegable({ titulo, contador, alerta, children, abiertoPorDefecto = false, id, siempreSiAlerta = false }) {
  const [abierto, setAbierto] = useState(() => {
    if (alerta && siempreSiAlerta) return true
    const g = id ? recordado('ed-sec-' + id) : null
    return g === null ? abiertoPorDefecto : g === '1'
  })
  const alternar = () => { const n = !abierto; setAbierto(n); if (id) recordar('ed-sec-' + id, n ? '1' : '0') }
  return <div style={{ border: `1px solid ${alerta ? `${T.brand}55` : T.border}`, borderRadius: 10, marginBottom: 12, overflow: 'hidden' }}>
    <button onClick={alternar} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', cursor: 'pointer', flexWrap: 'wrap',
      background: alerta ? T.brandSoft : T.surfaceAlt, border: 'none', textAlign: 'left', fontFamily: 'inherit',
    }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, flex: '1 1 140px' }}>{titulo}</span>
      <span style={{ fontSize: 11.5, fontFamily: MONO, color: alerta ? T.brand : T.ink3 }}>{contador}</span>
      <span style={{ fontSize: 11, color: T.ink3 }}>{abierto ? '▲' : '▼'}</span>
    </button>
    {abierto && <div style={{ padding: '12px', background: T.surface }}>{children}</div>}
  </div>
}

// ---------------------------------------------------------------- alta a mano
// Lo que no sale de una línea del presupuesto: "cambiar la placa", "3 videos
// Raid", "cambios". Con cantidad, porque una línea del presu suele ser varias
// piezas reales. Componente a nivel de módulo: si va adentro, los inputs
// pierden el foco a cada tecla.
// Dos cosas distintas que antes eran una: "un video más" (otra pieza igual a una
// que ya está: mismo brief, mismo crudo, mismo PM — sale como "Edit 60s 2") y
// "una tarea" (cambiar la placa, cambios). Juan, 14/9: "no es una tarea porque
// es un video más". Con `numFijo` y `hermanos` viene desde el proyecto.
function NuevaTarea({ onCrear, onCancelar, proyectos, personas, numFijo = '', hermanos = [] }) {
  const [num, setNum] = useState(numFijo)
  const [modo, setModo] = useState(hermanos.length ? 'video' : 'tarea')
  const [copiarDe, setCopiarDe] = useState((hermanos.find(h => esPedidoEdicion(h.Entregable)) || hermanos[0])?.ID || '')
  const [titulo, setTitulo] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const [editor, setEditor] = useState('')
  const [prioridad, setPrioridad] = useState('Normal')
  const [compromiso, setCompromiso] = useState('')
  const [notas, setNotas] = useState('')
  const [yendo, setYendo] = useState(false)

  const proy = useMemo(() => {
    const n = String(num).trim()
    if (!n) return null
    return proyectos.find(p => String(p['N° presupuesto'] || '').trim() === n) || null
  }, [num, proyectos])

  const esVideo = modo === 'video' && !!copiarDe
  const hermana = hermanos.find(h => h.ID === copiarDe)
  const baseNombre = hermana ? limpiarPedido(hermana.Entregable).replace(/\s+\d+$/, '') : ''
  const yaHay = hermana ? hermanos.filter(h => limpiarPedido(h.Entregable).replace(/\s+\d+$/, '').toLowerCase() === baseNombre.toLowerCase()).length : 0
  const puede = esVideo || !!titulo.trim()

  const enviar = async () => {
    if (!puede) return
    setYendo(true)
    await onCrear({ num: num.trim(), titulo: titulo.trim(), cantidad: +cantidad || 1, editor, prioridad, compromiso, notas, copiarDe: esVideo ? copiarDe : '' })
    setYendo(false)
  }
  const cant = +cantidad || 1

  return <div style={{ ...card, borderColor: T.brand, padding: '14px 16px', marginBottom: 14 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, flex: 1 }}>{numFijo ? `Sumar a #${numFijo}` : 'Agregar una tarea de edición'}</div>
      {hermanos.length > 0 && <div style={{ display: 'flex', gap: 4 }}>
        {[['video', 'Un video más'], ['tarea', 'Una tarea']].map(([id, l]) => <button key={id} onClick={() => setModo(id)} style={{
          ...btn, padding: '5px 11px', fontSize: 12, border: `1px solid ${modo === id ? T.ink : T.border}`, background: modo === id ? T.ink : T.surface, color: modo === id ? '#fff' : T.ink2, fontWeight: modo === id ? 600 : 500,
        }}>{l}</button>)}
      </div>}
    </div>
    {modo === 'video' && hermanos.length > 0
      ? <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 90px', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={lbl}>Igual que</label>
            <select value={copiarDe} onChange={e => setCopiarDe(e.target.value)} style={{ ...inp, width: '100%', cursor: 'pointer' }}>
              {hermanos.map(h => <option key={h.ID} value={h.ID}>{limpiarPedido(h.Entregable)}{String(h.Editor || '').trim() ? ` · ${String(h.Editor).split(' ')[0]}` : ''}</option>)}
            </select>
            <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 4, lineHeight: 1.4 }}>Copia el brief, el crudo y el PM de esa pieza. Quién lo edita lo elegís abajo.</div>
          </div>
          <div>
            <label style={lbl}>Nombre (opcional)</label>
            <input value={titulo} onChange={e => setTitulo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') enviar() }}
              placeholder={baseNombre ? `${baseNombre} ${yaHay + 1}` : 'Video'} style={{ ...inp, width: '100%' }} />
          </div>
          <div>
            <label style={lbl}>Cuántos</label>
            <input type="number" min="1" max="20" value={cantidad} onChange={e => setCantidad(e.target.value)} style={{ ...inp, width: '100%', fontFamily: MONO }} />
          </div>
        </div>
      : <div style={{ display: 'grid', gridTemplateColumns: numFijo ? '1fr 90px' : '110px 1fr 90px', gap: 10, marginBottom: 10 }}>
          {!numFijo && <div>
            <label style={lbl}>N° de presu</label>
            <input value={num} onChange={e => setNum(e.target.value)} placeholder="2256" style={{ ...inp, width: '100%', fontFamily: MONO }} />
          </div>}
          <div>
            <label style={lbl}>Qué hay que hacer</label>
            <input value={titulo} onChange={e => setTitulo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') enviar() }}
              placeholder="Cambiar la placa del video largo" style={{ ...inp, width: '100%' }} />
          </div>
          <div>
            <label style={lbl}>Cuántas</label>
            <input type="number" min="1" max="20" value={cantidad} onChange={e => setCantidad(e.target.value)} style={{ ...inp, width: '100%', fontFamily: MONO }} />
          </div>
        </div>}
    {!numFijo && num.trim() && <div style={{ fontSize: 12, color: proy ? T.ink2 : T.brand, marginBottom: 10 }}>
      {proy ? `${proy.Cliente || proy.Agencia} · ${proy.Proyecto || ''} · ${proy['Fecha Evento'] || ''}` : `No encontré el proyecto #${num.trim()}`}
    </div>}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
      <div>
        <label style={lbl}>Quién lo hace</label>
        <input list="personas-edicion" value={editor} onChange={e => setEditor(e.target.value)} placeholder="sin asignar" style={{ ...inp, width: '100%' }} />
        <datalist id="personas-edicion">{(personas || []).map(x => <option key={x} value={x} />)}</datalist>
      </div>
      <div>
        <label style={lbl}>Prioridad</label>
        <select value={prioridad} onChange={e => setPrioridad(e.target.value)} style={{ ...inp, width: '100%', cursor: 'pointer' }}>
          {PRIORIDADES.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>
      <div>
        <label style={lbl}>Entregar el</label>
        <input type="date" value={compromiso} onChange={e => setCompromiso(e.target.value)} style={{ ...inp, width: '100%' }} />
      </div>
    </div>
    <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Nota para el editor (opcional)" style={{ ...inp, width: '100%', marginBottom: 11 }} />
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button onClick={enviar} disabled={yendo || !puede} style={{ ...btnPri, opacity: puede ? 1 : 0.5 }}>
        {yendo ? 'Agregando…' : esVideo ? (cant > 1 ? `Agregar ${cant} videos` : 'Agregar el video') : cant > 1 ? `Agregar ${cant} tareas` : 'Agregar'}
      </button>
      <button onClick={onCancelar} style={btn}>Cancelar</button>
      {esVideo && !titulo.trim() && <span style={{ fontSize: 11.5, color: T.ink3 }}>Queda como “{baseNombre} {yaHay + 1}”{cant > 1 ? `, “${baseNombre} ${yaHay + 2}”…` : ''} — y aparece abajo, abierto.</span>}
      {!esVideo && cant > 1 && <span style={{ fontSize: 11.5, color: T.ink3 }}>Se numeran solas: “{titulo || 'Tarea'} 1”, “{titulo || 'Tarea'} 2”…</span>}
    </div>
  </div>
}

// ------------------------------------------------- la barra de estado
// Reemplaza al desplegable + la flecha "→". La flecha movía la fila al estado
// siguiente y, como los chips de arriba filtran por PLAZO, la fila se
// recalculaba y desaparecía: "la apretás y desaparece" (Juan, 14/9/2026).
// Acá se ve el recorrido entero, en qué paso está y se toca el paso al que va —
// como la barra pagado/pendiente de Egresos, pero con los ocho pasos del flujo.
// Verde lo hecho, oscuro el paso actual (ámbar si es una vuelta atrás), gris
// lo que falta. Y la fila que se movió no se esconde (ver `tocados`).
const ES_VUELTA = e => /^cambios/i.test(String(e || ''))
const colorPaso = (e, i, idx) => i < idx ? T.pos : i === idx ? (ES_VUELTA(e) ? T.warn : estaCerrado(e) ? T.pos : T.ink) : T.border

function Barra({ estado, onChange, compacta = false, soloBarra = false }) {
  const idx = ESTADO_IDX(estado)
  const actual = ESTADOS[idx]
  if (compacta || soloBarra) {
    const cAct = colorPaso(actual, idx, idx)
    return <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, width: soloBarra ? '100%' : undefined }}>
      <div style={{ display: 'flex', gap: 2, flex: soloBarra ? 1 : undefined }} title={`Está en: ${actual}`}>
        {ESTADOS.map((e, i) => <button key={e} onClick={() => onChange && onChange(e)} disabled={!onChange} title={i === idx ? `Está en: ${e}` : `Pasar a: ${e}`}
          style={{ width: soloBarra ? 'auto' : 20, flex: soloBarra ? 1 : undefined, minWidth: soloBarra ? 18 : undefined, height: soloBarra ? 5 : 10, padding: 0, border: 'none', borderRadius: 2, cursor: onChange ? 'pointer' : 'default', background: colorPaso(e, i, idx) }} />)}
      </div>
      {!soloBarra && <span style={{ fontSize: 11.5, fontWeight: 600, color: cAct === T.border ? T.ink2 : cAct, minWidth: 118, whiteSpace: 'nowrap' }}>{actual}</span>}
    </div>
  }
  return <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
    {ESTADOS.map((e, i) => {
      const c = colorPaso(e, i, idx)
      const es = i === idx
      return <button key={e} onClick={() => onChange && onChange(e)} title={es ? 'Está acá' : `Pasar a "${e}"`} style={{
        flex: '1 1 90px', padding: '7px 4px', border: 'none', borderRadius: 6, cursor: onChange ? 'pointer' : 'default', fontFamily: 'inherit',
        background: c, color: c === T.border ? T.ink2 : '#fff', fontSize: 11, fontWeight: es ? 700 : 500, lineHeight: 1.2,
        outline: es ? `2px solid ${c}` : 'none', outlineOffset: 1,
      }}>{i < idx ? '✓ ' : ''}{e}</button>
    })}
  </div>
}

// ---------------------------------------------------------------- pedazos
function Kpi({ n, l, c, onClick, activo, cel }) {
  return <button onClick={onClick} style={{ ...card, padding: cel ? '8px 6px' : '13px 15px', textAlign: cel ? 'center' : 'left', cursor: 'pointer', borderColor: activo ? c : T.border, borderWidth: activo ? 1.5 : 1 }}>
    <div style={{ fontSize: cel ? 19 : 25, fontWeight: 700, color: n ? c : T.ink3, fontFamily: MONO, lineHeight: 1.1 }}>{n}</div>
    <div style={{ fontSize: cel ? 10 : 11.5, color: T.ink2, marginTop: 2 }}>{l}</div>
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

function Grupo({ g, abierto, setAbierto, guardar, carpeta, crudoAlCliente, drive, mail, mailsCliente, preguntar, responder, cel, showToast, personaF, editores, PMS, crearTarea, fantasma = false, sucesor = '', proy, logos = {}, horas = [], onRefresh, soloLoSuyo, recursosDe, soloId = null }) {
  const peor = g.items[0].__sem
  const logoGrupo = g.items.map(h => String(h['Logo y placas'] || '').trim()).find(esURL)
  const rec = recursosDe ? recursosDe(g.agencia, g.cliente) : {}
  const estadoDrive = drive[g.num]
  const creando = estadoDrive === 'creando'
  const linkCrudo = (typeof estadoDrive === 'string' && estadoDrive.startsWith('http')) ? estadoDrive : (g.linkCrudo || String(proy?.['Drive Crudo'] || '').trim())
  const linkEntrega = g.linkEntrega || String(proy?.['Drive Entrega'] || '').trim()
  // Lo que se le manda al cliente: Finales (o Fotos en carpetas viejas), nunca la del proyecto.
  const linkFinales = String(proy?.['Drive Finales'] || '').trim()
  const [copiado, setCopiado] = useState(false)
  const copiarCliente = async () => { try { await navigator.clipboard.writeText(linkFinales || linkEntrega); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch (e) {} }
  const [panel, setPanel] = useState(false)
  // Las fotos van a la vista, no adentro de "Compartir…": ahí no las encontró nadie.
  // El botón aparece si el trabajo lleva fotos — y un Film (filmmaker) las lleva
  // aunque el presupuesto no tenga ninguna línea que diga "Foto".
  const [verFotos, setVerFotos] = useState(false)
  const conFotos = g.items.some(h => esPedidoFoto(h.Entregable)) || llevaFotos(Object.keys(proy || {}).filter(c => /^Pedido \d+$/.test(c)).map(c => proy[c]))
  // "Un video más" se carga desde el proyecto, no desde un formulario suelto arriba
  // donde hay que tipear el número y después buscar dónde cayó.
  const [nuevaAca, setNuevaAca] = useState(false)

  return <div style={{ ...card, marginBottom: 10, overflow: 'hidden' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: cel ? 7 : 10, padding: cel ? '9px 13px' : '11px 14px', background: T.surfaceAlt, borderBottom: `1px solid ${T.border}`, flexWrap: 'wrap' }}>
      <Punto nivel={peor.nivel} />
      <span style={{ fontFamily: MONO, fontSize: cel ? 11 : 12, color: T.ink2 }}>#{g.num}</span>
      <span style={{ fontSize: cel ? 13 : 13.5, fontWeight: 600, color: T.ink }}>{g.cliente || g.agencia || '—'}</span>
      {g.proyecto && <span style={{ fontSize: 12.5, color: T.ink2, ...(cel ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 } : {}) }}>· {g.proyecto}</span>}
      {!cel && <span style={{ fontSize: 11.5, color: T.ink3, fontFamily: MONO }}>{g.fecha}</span>}
      {fantasma && <span title="Este número ya no está en Proyectos: se represupuestó, se desaprobó o se borró. Las carpetas y el material van con el número vigente." style={{ fontSize: 11, fontWeight: 600, color: T.warn, background: T.warnSoft, padding: '2px 8px', borderRadius: 5, whiteSpace: 'nowrap' }}>
        ya no existe{sucesor ? ` · ahora es #${sucesor}` : ''}
      </span>}
      <div style={{ flex: 1 }} />
      {/* El logo vive en la carpeta Recursos del cliente (o de la agencia). El link
          puntual de una pieza solo manda si no hay Recursos: el 14/9 el botón llevaba a
          la referencia del video porque ese link estaba pegado en el campo. */}
      {(rec.cliente || rec.agencia) && <a href={rec.cliente || rec.agencia} target="_blank" rel="noreferrer" title={rec.cliente ? `Recursos de ${g.cliente}: logo, gráfica, lo general` : `Recursos de ${g.agencia}`} style={{ ...btn, padding: '5px 10px', fontSize: 11.5, textDecoration: 'none', display: 'inline-block' }}>🎨 Logo</a>}
      {!(rec.cliente || rec.agencia) && logoGrupo && <a href={logoGrupo} target="_blank" rel="noreferrer" title="Link puntual cargado en la pieza" style={{ ...btn, padding: '5px 10px', fontSize: 11.5, textDecoration: 'none', display: 'inline-block' }}>🎨 Logo</a>}
      {!fantasma && crearTarea && <button onClick={() => setNuevaAca(v => !v)} title="Otro video de este proyecto (copia el brief de la pieza que elijas), o una tarea suelta" style={{ ...btn, padding: '5px 10px', fontSize: 11.5, background: nuevaAca ? T.ink : T.surface, color: nuevaAca ? '#fff' : T.ink2 }}>{nuevaAca ? 'Cerrar' : '+ Video'}</button>}
      {!fantasma && !soloLoSuyo && conFotos && <button onClick={() => setVerFotos(v => !v)} title="Las fotos que subió el fotógrafo: cuántas hay, firmarlas y dejarlas listas para el cliente" style={{ ...btn, padding: '5px 10px', fontSize: 11.5, background: verFotos ? T.ink : T.surface, color: verFotos ? '#fff' : T.ink2 }}>{verFotos ? 'Cerrar' : '🖼 Fotos'}</button>}
      {/* En el celular los botones de Drive se comen la pantalla antes del primer
          trabajo: van adentro, cuando se abre la fila. */}
      {cel ? <>
          {linkCrudo && <a href={linkCrudo} target="_blank" rel="noreferrer" style={{ fontSize: 15, textDecoration: 'none' }}>📁</a>}
          {(linkFinales || linkEntrega) && <a href={linkFinales || linkEntrega} target="_blank" rel="noreferrer" style={{ fontSize: 15, textDecoration: 'none' }}>📸</a>}
        </>
      : (linkCrudo || linkEntrega) ? <>
        {linkCrudo && <a href={linkCrudo} target="_blank" rel="noreferrer" style={{ ...btn, padding: '5px 10px', fontSize: 11.5, textDecoration: 'none', display: 'inline-block' }}>📁 Crudo</a>}
        {linkEntrega && <a href={linkEntrega} target="_blank" rel="noreferrer" title="La carpeta del proyecto en ENTREGAS (Pre-entregas + Finales)" style={{ ...btn, padding: '5px 10px', fontSize: 11.5, textDecoration: 'none', display: 'inline-block' }}>📤 Entrega</a>}
        {linkFinales && <a href={linkFinales} target="_blank" rel="noreferrer" title="Lo que se le manda al cliente" style={{ ...btn, padding: '5px 10px', fontSize: 11.5, textDecoration: 'none', display: 'inline-block' }}>📸 Finales</a>}
        {(linkFinales || linkEntrega) && <button onClick={copiarCliente} title="Copia el link de Finales (o el de entrega si no hay)" style={{ ...btn, padding: '5px 10px', fontSize: 11.5, color: T.pos, borderColor: T.pos }}>{copiado ? '✓ Copiado' : 'Copiar para el cliente'}</button>}
        <button onClick={() => setPanel(p => !p)} style={{ ...btn, padding: '5px 10px', fontSize: 11.5, background: panel ? T.ink : T.surface, color: panel ? '#fff' : T.ink2 }}>Compartir…</button>
      </> : !fantasma && <button onClick={() => carpeta(g.num, ['crudo', 'entregas'], false)} disabled={creando} title="Crea la carpeta en CRUDO y en ENTREGAS CLIENTES, con las subcarpetas de lo que se vendió" style={{ ...btn, padding: '5px 10px', fontSize: 11.5 }}>{creando ? 'Creando…' : '📁 Crear carpetas'}</button>}
    </div>

    {nuevaAca && <div style={{ padding: '10px 14px 0', background: T.bg, borderBottom: `1px solid ${T.border}` }}>
      <NuevaTarea numFijo={g.num} hermanos={g.items} proyectos={[]} personas={editores.map(e => e.nombre)}
        onCrear={async d => { const ok = await crearTarea(d); if (ok) setNuevaAca(false); return ok }} onCancelar={() => setNuevaAca(false)} />
    </div>}

    {verFotos && <FotosProyecto num={g.num} showToast={showToast} onListo={j => { if (j?.finalesNueva && onRefresh) onRefresh() }} />}

    {panel && <PanelCompartir g={g} carpeta={carpeta} crudoAlCliente={crudoAlCliente} mailsCliente={mailsCliente} />}

    {g.items.filter(f => !soloId || f.ID === soloId).map(f => <Fila key={f.ID} f={f} g={g} abierto={abierto} setAbierto={setAbierto} guardar={guardar} mail={mail} preguntar={preguntar} responder={responder} cel={cel} mailsCliente={mailsCliente} showToast={showToast} personaF={personaF} editores={editores} PMS={PMS} logos={logos} horas={horas} onRefresh={onRefresh} soloLoSuyo={soloLoSuyo} recursosDe={recursosDe} enFicha={!!soloId} />)}

    {/* En la ficha se ve una pieza sola; las otras del proyecto quedan a un clic. */}
    {soloId && g.items.length > 1 && <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px', background: T.surfaceAlt, borderTop: `1px solid ${T.border}` }}>
      <span style={{ fontSize: 11.5, color: T.ink3 }}>Otras piezas de este proyecto:</span>
      {g.items.filter(h => h.ID !== soloId).map(h => { const c = COLOR_SEM[h.__sem.nivel] || COLOR_SEM.verde
        return <button key={h.ID} onClick={() => setAbierto(h.ID)} title={`${String(h.Editor || '').trim() || 'sin asignar'} · ${h.__sem.txt}`} style={{ ...btn, padding: '4px 10px', fontSize: 11.5, borderLeft: `3px solid ${c.fg}` }}>{limpiarPedido(h.Entregable)} <span style={{ color: T.ink3 }}>· {estadoDe(h.Estado)}</span></button> })}
    </div>}
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

function Fila({ f, g, abierto, setAbierto, guardar, mail, preguntar, responder, cel, mailsCliente, showToast, personaF, editores, PMS, logos, horas, onRefresh, soloLoSuyo, recursosDe, enFicha = false }) {
  const sem = f.__sem
  const c = COLOR_SEM[sem.nivel] || COLOR_SEM.verde
  const abierta = abierto === f.ID
  const cerrado = estaCerrado(f.Estado)
  const prio = String(f.Prioridad || 'Normal').trim()
  const hayConsulta = !!String(f.Consulta || '').trim()
  // El toast dice a dónde fue; la fila se queda a la vista (ver `tocados` arriba).
  const cambiarEstado = e => { guardar(f.ID, { Estado: e }); showToast && showToast(`${limpiarPedido(f.Entregable)} → ${e}`) }

  // En el teléfono la fila de escritorio se parte y lo que se corta es justo lo
  // que hay que ver: el estado y para cuándo. Acá va apilada, con el estado y el
  // plazo juntos en la última línea y todo el bloque tocable para abrir.
  if (cel) {
    return <div id={`ed-${f.ID}`} style={{ borderBottom: abierta ? `1px solid ${T.border}` : 'none' }}>
      <div onClick={() => { if (!enFicha) setAbierto(abierta ? null : f.ID) }} style={{
        display: 'flex', flexDirection: 'column', gap: 7, padding: '11px 13px',
        borderLeft: `3px solid ${c.fg}`, opacity: cerrado ? 0.6 : 1, cursor: enFicha ? 'default' : 'pointer',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
          <span style={{ fontSize: 14, color: T.ink, fontWeight: 600, flex: 1, lineHeight: 1.3 }}>{limpiarPedido(f.Entregable)}</span>
          {hayConsulta && <span style={{ fontSize: 13 }}>🙋</span>}
          {prio === 'Urgente' && <span style={{ fontSize: 9.5, fontWeight: 700, color: T.brand, background: T.brandSoft, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>URGENTE</span>}
        </div>
        <Barra estado={f.Estado} soloBarra />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span onClick={e => e.stopPropagation()} style={{ display: 'inline-flex' }}>
            <select value={estadoDe(f.Estado)} onChange={e => cambiarEstado(e.target.value)}
              style={{ ...inp, padding: '6px 8px', fontSize: 12.5, cursor: 'pointer', maxWidth: 168 }}>
              {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: c.fg, background: c.bg, padding: '4px 9px', borderRadius: 6, whiteSpace: 'nowrap' }}>{sem.txt}</span>
          <div style={{ flex: 1 }} />
          {!enFicha && <span style={{ fontSize: 11.5, color: T.ink3 }}>{abierta ? 'cerrar ▲' : 'abrir →'}</span>}
        </div>
        {personaF === 'todos' && <div style={{ fontSize: 11.5, color: T.ink2, display: 'flex', alignItems: 'center', gap: 6 }}>
          {String(f.Editor || '').trim() || <em style={{ color: T.brand, fontStyle: 'normal' }}>sin asignar</em>}
          {String(f.Interno || '').trim() && <span style={{ fontSize: 9, fontWeight: 700, color: T.ink3, border: `1px solid ${T.border}`, padding: '1px 4px', borderRadius: 3 }}>MAGMA</span>}
        </div>}
      </div>
      {abierta && <Detalle f={f} g={g} guardar={guardar} mail={mail} preguntar={preguntar} responder={responder} cel={cel} mailsCliente={mailsCliente} showToast={showToast} editores={editores} PMS={PMS} logos={logos} horas={horas} onRefresh={onRefresh} soloLoSuyo={soloLoSuyo} recursosDe={recursosDe} />}
    </div>
  }

  return <div id={`ed-${f.ID}`} style={{ borderBottom: abierta ? `1px solid ${T.border}` : 'none' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderLeft: `3px solid ${c.fg}`, opacity: cerrado ? 0.6 : 1 }}>
      <span style={{ fontSize: 13, color: T.ink, fontWeight: 500, minWidth: 130 }}>{limpiarPedido(f.Entregable)}</span>
      {prio === 'Urgente' && <span style={{ fontSize: 10, fontWeight: 700, color: T.brand, background: T.brandSoft, padding: '2px 6px', borderRadius: 4, letterSpacing: 0.3 }}>URGENTE</span>}
      {hayConsulta && <span style={{ fontSize: 10, fontWeight: 700, color: T.brand, background: T.brandSoft, padding: '2px 6px', borderRadius: 4 }}>🙋 PREGUNTA</span>}
      <span style={{ fontSize: 12.5, color: T.ink2, minWidth: 150, display: 'flex', alignItems: 'center', gap: 6 }}>
        {String(f.Editor || '').trim() || <em style={{ color: T.brand, fontStyle: 'normal' }}>sin asignar</em>}
        {/* "Interno" es de facturación: la plata queda en Magma. No dice quién lo hace. */}
        {String(f.Interno || '').trim() && <span title="Este trabajo lo cobra Magma, no un freelancer" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: .3, color: T.ink3, border: `1px solid ${T.border}`, padding: '1px 5px', borderRadius: 4 }}>MAGMA</span>}
      </span>
      <Barra estado={f.Estado} compacta onChange={cambiarEstado} />
      {esperaAlPM(f.Estado) && <button onClick={() => setAbierto(f.ID)} title="Mirarlo y decidir" style={{ ...btn, padding: '4px 10px', fontSize: 11.5, background: T.brand, color: '#fff', border: 'none', fontWeight: 600 }}>Revisar</button>}
      {/* Un clic cierra: el cliente ya dijo que sí, no hay nada más que mirar. Si pidió
          cambios, se abre la fila y va con la nota. */}
      {esperaAlCliente(f.Estado) && <button onClick={() => cambiarEstado('Terminado')} title="El cliente dio el OK final: se cierra como Terminado. Si pidió cambios, abrí la fila." style={{ ...btn, padding: '4px 10px', fontSize: 11.5, background: T.pos, color: '#fff', border: 'none', fontWeight: 600 }}>✓ OK del cliente</button>}
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 11.5, fontWeight: 600, color: c.fg, background: c.bg, padding: '3px 9px', borderRadius: 6, whiteSpace: 'nowrap' }}>{sem.txt}</span>
      {!enFicha && <button onClick={() => setAbierto(abierta ? null : f.ID)} title={abierta ? undefined : 'Abre este trabajo solo, en su ficha'} style={{ ...btn, padding: '4px 10px', fontSize: 11.5 }}>{abierta ? 'Cerrar' : 'Abrir'}</button>}
    </div>
    {abierta && <Detalle f={f} g={g} guardar={guardar} mail={mail} preguntar={preguntar} responder={responder} cel={cel} mailsCliente={mailsCliente} showToast={showToast} editores={editores} PMS={PMS} logos={logos} horas={horas} onRefresh={onRefresh} soloLoSuyo={soloLoSuyo} recursosDe={recursosDe} />}
  </div>
}

function Detalle({ f, g, guardar, mail, preguntar, responder, cel, mailsCliente, showToast, editores = [], PMS = PMS_FIJOS, logos = {}, horas = [], onRefresh, soloLoSuyo, recursosDe }) {
  const [notas, setNotas] = useState(String(f.Notas || ''))
  const [nueva, setNueva] = useState('')
  const [pregunta, setPregunta] = useState('')
  useEffect(() => { setNotas(String(f.Notas || '')) }, [f.Notas])

  const compromiso = String(f['Fecha compromiso'] || '').trim() || aAR(fechaSugerida(f['Fecha Evento'], f.Entregable))
  const hayConsulta = !!String(f.Consulta || '').trim()

  // Sumar una nota ES avisarle al editor: ese era el agujero. El cambio quedaba
  // escrito en el tablero y del otro lado no se enteraba nadie, salvo que además
  // le movieras el estado. "Solo anotar" queda para el recordatorio propio.
  const agregarNota = (avisar = true) => {
    const t = nueva.trim(); if (!t) return
    const n = lineaBitacora(mail, t) + (notas.trim() ? '\n' + notas : '')
    setNotas(n); setNueva(''); guardar(f.ID, { Notas: n }, avisar ? { nota: t } : undefined)
  }
  const aQuienLeLlega = ES_MAGMA(f.Editor) ? '' : String(f.Editor || '').trim()
  // Sin fecha confirmada o sin nadie a cargo, la sección se abre sola: es lo que hay que resolver.
  const faltaPlazo = !estaCerrado(f.Estado) && (!String(f['Fecha compromiso'] || '').trim() || !String(f.Editor || '').trim())


  return <div style={{ padding: '14px 16px 16px 17px', background: T.bg, borderLeft: `3px solid ${T.border}` }}>
    {hayConsulta && <div style={{ background: T.brandSoft, border: `1px solid ${T.brand}30`, borderRadius: 9, padding: '10px 12px', marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, color: T.ink, marginBottom: 8 }}>🙋 <strong>{f.Consulta}</strong></div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={pregunta} onChange={e => setPregunta(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { responder(f, pregunta); setPregunta('') } }}
          placeholder="Responder — se guarda en la bitácora y saca la bandera" style={{ ...inp, flex: 1, fontSize: 12.5 }} />
        <button onClick={() => { responder(f, pregunta); setPregunta('') }} style={btnPri}>Responder</button>
      </div>
    </div>}

    <div style={{ marginBottom: 14 }}>
      <label style={lbl}>En qué anda — tocá el paso al que pasa</label>
      <Barra estado={f.Estado} onChange={e => { guardar(f.ID, { Estado: e }); showToast && showToast(`${limpiarPedido(f.Entregable)} → ${e}`) }} />
    </div>

    {/* Lo que hay que hacer AHORA va primero; el resto son secciones que se abren. */}
    {esperaAlPM(f.Estado) && <Revisar f={f} guardar={guardar} mailsCliente={mailsCliente} showToast={showToast} cel={cel} />}
    {esperaAlCliente(f.Estado) && <OKCliente f={f} guardar={guardar} showToast={showToast} cel={cel} />}

    <Logo f={f} g={g} guardar={guardar} logos={logos} cel={cel} rec={recursosDe ? recursosDe(f.Agencia, f.Cliente) : {}} />
    <HorasExtra f={f} horas={horas} editores={editores} showToast={showToast} onRefresh={onRefresh} soloLoSuyo={soloLoSuyo} cel={cel} />

    <Plegable id="plazo" titulo="Para cuándo y quién" siempreSiAlerta alerta={faltaPlazo} abiertoPorDefecto={faltaPlazo}
      contador={[`entregar ${compromiso || '—'}${String(f['Fecha compromiso'] || '').trim() ? '' : ' (estimado)'}`, String(f.Prioridad || '') === 'Urgente' ? 'URGENTE' : '', String(f.Editor || '').trim().split(' ')[0] || 'sin asignar', String(f.PM || '').trim() ? `PM ${f.PM}` : 'sin PM'].filter(Boolean).join(' · ')}>
    <div style={{ display: 'grid', gridTemplateColumns: cel ? '1fr' : '1fr 1fr 1fr 1fr', gap: 12 }}>
      <div>
        <label style={lbl}>Entregar el {!String(f['Fecha compromiso'] || '').trim() && <span style={{ color: T.brand }}>· falta</span>}</label>
        <input type="date" defaultValue={aISO(parseFechaAR(compromiso))}
          onChange={e => { const d = e.target.value ? new Date(e.target.value + 'T12:00:00') : null; guardar(f.ID, { 'Fecha compromiso': d ? aAR(d) : '' }) }}
          style={{ ...inp, width: '100%', borderColor: String(f['Fecha compromiso'] || '').trim() ? T.border : T.brand }} />
        <div style={{ fontSize: 10.5, color: String(f['Fecha compromiso'] || '').trim() ? T.ink3 : T.brand, marginTop: 4, lineHeight: 1.4 }}>
          {String(f['Fecha compromiso'] || '').trim()
            ? 'la puso el PM'
            : 'Es una estimación por el plazo del manual. La fecha real la confirma el PM.'}
        </div>
      </div>
      <div>
        <label style={lbl}>Prioridad</label>
        <select value={String(f.Prioridad || 'Normal')} onChange={e => guardar(f.ID, { Prioridad: e.target.value })} style={{ ...inp, width: '100%', cursor: 'pointer', color: COLOR_PRIO[String(f.Prioridad || 'Normal')] || T.ink, fontWeight: String(f.Prioridad) === 'Urgente' ? 700 : 400 }}>
          {PRIORIDADES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div>
        <label style={lbl}>PM · quién responde</label>
        <select value={String(f.PM || '')} onChange={e => guardar(f.ID, { PM: e.target.value })}
          style={{ ...inp, width: '100%', cursor: 'pointer', borderColor: String(f.PM || '').trim() ? T.border : `${T.brand}55` }}>
          <option value="">— sin PM —</option>
          {PMS.map(p => <option key={p} value={p}>{p}</option>)}
          {String(f.PM || '').trim() && !PMS.includes(String(f.PM).trim()) && <option value={String(f.PM).trim()}>{f.PM}</option>}
        </select>
        <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 4, lineHeight: 1.4 }}>Sale del presupuesto. Si lo cambiás acá, manda esto y el sync no lo pisa.</div>
      </div>
      <div>
        <label style={lbl}>A cargo</label>
        <select value={String(f.Editor || '')} onChange={e => guardar(f.ID, { Editor: e.target.value })}
          style={{ ...inp, width: '100%', cursor: 'pointer', borderColor: String(f.Editor || '').trim() ? T.border : `${T.brand}55` }}>
          <option value="">— sin asignar —</option>
          {editores.map(e => <option key={e.nombre} value={e.nombre}>{e.nombre}{e.tieneMail ? '' : ' (sin mail)'}</option>)}
        </select>
        {String(f.Editor || '').trim() && !editores.find(e => e.nombre === String(f.Editor).trim())?.tieneMail &&
          <div style={{ fontSize: 10.5, color: T.brand, marginTop: 4, lineHeight: 1.4 }}>No tiene mail en RRHH: no le van a llegar los avisos.</div>}
      </div>
    </div>
    </Plegable>

    <Plegable id="pieza" titulo="Qué clase de video es" contador={`${piezaLlena(f)}/${piezaTotal(f)}`} alerta={piezaLlena(f) < piezaTotal(f)} abiertoPorDefecto={piezaLlena(f) === 0}>
      <Campos f={f} campos={CAMPOS_PIEZA} guardar={guardar} cols={cel ? 1 : 3} />
      <div style={{ fontSize: 11, color: T.ink3, marginTop: 9, lineHeight: 1.5 }}>
        Esto se contesta al presupuestar. Está acá para completar lo que falte — es lo que después permite saber cuánto tarda cada clase de trabajo.
      </div>
    </Plegable>

    <Plegable id="brief" titulo="Lo que necesita el editor" contador={`${briefLleno(f)}/${briefTotal(f)}`} alerta={briefLleno(f) < briefTotal(f)}>
      <Campos f={f} campos={CAMPOS_BRIEF} guardar={guardar} cols={cel ? 1 : 2} />
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <BotonCopiar texto={() => textoPedirBrief(f)} etiqueta="✉️ Copiar el pedido para el cliente" />
        <BotonCopiar texto={() => textoPedirBrief(f, { porWhatsapp: true })} etiqueta="💬 Para WhatsApp" />
        {String(f['Brief pedido'] || '').trim()
          ? <span style={{ fontSize: 11.5, color: T.ink3 }}>pedido el {f['Brief pedido']}</span>
          : <button onClick={() => guardar(f.ID, { 'Brief pedido': aAR(new Date()) })} style={{ ...btn, padding: '5px 10px', fontSize: 11.5 }}>Marcar como pedido hoy</button>}
      </div>
    </Plegable>

    <Plegable id="links" titulo="Links y vueltas" contador={`${['Link crudo', 'Link pre-entrega', 'Link entrega'].filter(k => String(f[k] || (k === 'Link crudo' ? g?.linkCrudo : '') || '').trim()).length}/3 links · ${(parseInt(f['Rondas internas']) || 0) + (parseInt(f['Rondas cliente']) || 0)} vueltas`}>
    <div style={{ display: 'grid', gridTemplateColumns: cel ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
      <div>
        <label style={lbl}>Link del material (crudo)</label>
        <input defaultValue={String(f['Link crudo'] || '')} onBlur={e => { if (e.target.value !== String(f['Link crudo'] || '')) guardar(f.ID, { 'Link crudo': e.target.value }) }} placeholder="https://drive.google.com/…" style={{ ...inp, width: '100%', fontSize: 12 }} />
      </div>
      <div>
        <label style={lbl}>Link de la pre-entrega</label>
        <input defaultValue={String(f['Link pre-entrega'] || '')} onBlur={e => { if (e.target.value !== String(f['Link pre-entrega'] || '')) guardar(f.ID, { 'Link pre-entrega': e.target.value }) }} placeholder="Se completa solo al mandar a revisar" style={{ ...inp, width: '100%', fontSize: 12 }} />
        <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 4, lineHeight: 1.4 }}>Si subiste el archivo a la carpeta de Pre-entregas, lo busca solo. Pegalo a mano únicamente si está en otro lado.</div>
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: cel ? '1fr' : '1fr 1fr', gap: 12 }}>
      <div>
        <label style={lbl}>Link de la entrega final</label>
        <input defaultValue={String(f['Link entrega'] || '')} onBlur={e => { if (e.target.value !== String(f['Link entrega'] || '')) guardar(f.ID, { 'Link entrega': e.target.value }) }} placeholder="Drive / WeTransfer / Frame.io" style={{ ...inp, width: '100%', fontSize: 12 }} />
      </div>
      <div>
        <label style={lbl}>Vueltas hasta ahora</label>
        <div style={{ ...inp, display: 'flex', gap: 14, alignItems: 'center', fontFamily: MONO, fontSize: 12.5, color: T.ink2 }}>
          <span>internas <strong style={{ color: T.ink }}>{parseInt(f['Rondas internas']) || 0}</strong></span>
          <span>del cliente <strong style={{ color: (parseInt(f['Rondas cliente']) || 0) > 2 ? T.brand : T.ink }}>{parseInt(f['Rondas cliente']) || 0}</strong></span>
          {(parseInt(f['Rondas cliente']) || 0) > 2 && <span style={{ fontSize: 11, color: T.brand }}>se pasó de las 2 del manual</span>}
        </div>
      </div>
    </div>
    </Plegable>

    <Plegable id="bitacora" titulo="Bitácora — lo que se pidió, los cambios, las referencias" abiertoPorDefecto contador={`${notas.split('\n').filter(l => l.trim()).length} ${notas.split('\n').filter(l => l.trim()).length === 1 ? 'nota' : 'notas'}`}>
    <div style={{ display: 'flex', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
      <input value={nueva} onChange={e => setNueva(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarNota(true) } }}
        placeholder={aQuienLeLlega ? `Escribí el cambio y Enter — le llega por mail a ${aQuienLeLlega.split(' ')[0]}` : 'Sumar una nota y Enter — queda fechada y firmada'}
        style={{ ...inp, flex: 1, minWidth: 220 }} />
      <button onClick={() => agregarNota(true)} style={btnPri}>{aQuienLeLlega ? 'Sumar y avisar' : 'Sumar'}</button>
      {aQuienLeLlega && <button onClick={() => agregarNota(false)} style={btn} title="Queda en la bitácora sin mandarle mail a nadie">Solo anotar</button>}
    </div>
    <div style={{ fontSize: 10.5, color: T.ink3, marginBottom: 9, lineHeight: 1.45 }}>
      {aQuienLeLlega
        ? `El mail sale a ${aQuienLeLlega} con el pedido arriba y abajo el trabajo completo: la ficha, el brief, los links y toda la bitácora. No hace falta cambiar el estado para que se entere.`
        : 'No hay nadie a cargo todavía: la nota queda anotada pero no le llega a nadie. Cargá quién lo hace en “A cargo”.'}
    </div>
    <textarea value={notas} onChange={e => setNotas(e.target.value)} onBlur={() => { if (notas !== String(f.Notas || '')) guardar(f.ID, { Notas: notas }) }}
      rows={Math.min(10, Math.max(3, notas.split('\n').length + 1))} style={{ ...inp, width: '100%', resize: 'vertical', lineHeight: 1.55, fontSize: 12.5 }} />
    </Plegable>

    <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <BotonCopiar texto={() => textoParaElEditor({ ...f, Notas: notas, 'Link crudo': f['Link crudo'] || g.linkCrudo })} etiqueta="📋 Copiar el brief para el editor" />
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
