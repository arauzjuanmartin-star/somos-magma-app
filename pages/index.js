import React, { useState, useEffect, useRef, useCallback, useMemo, useId } from 'react'
import Head from 'next/head'
import { useSession, signIn } from 'next-auth/react'
import { MAX_SLOTS, DIAS_SEGUIMIENTO } from '../lib/slots'
import { condicionDe, sinPedir, esOC, CONDICIONES } from '../lib/condicion-cobro'
import { armarMailSeguro, datosSeguro, vigenciaSugerida, requisitosSugeridos, lugaresConocidos, BROKER_MAILS } from '../lib/seguros'
import { CLASES_VIDEO, esPedidoEdicion, llevaFotos, duracionDePedido, materialDePedidos, semaforo as semaforoEd, hoyCero as hoyCeroEd, fechaSugerida as fechaSugeridaEd, parseFechaAR as parseFechaAREd, estaCerrado as estaCerradoEd, limpiarPedido as limpiarPedidoEd, nombrePieza as nombrePiezaEd, COLOR_SEM as COLOR_SEM_ED } from '../lib/edicion'
import { MULT_MARGEN, itemsDePresu, opcionesDePresu, presuDesglosado, desglosarPrecio, recalcularTotales } from '../lib/desglose'
import { acuerdosVigentes, avisoJornada, esJornada, acuerdoPara, monotributosDelMes } from '../lib/acuerdos'
import { repartoDelMes, previasDelAcuerdo } from '../lib/jornadas'
import { leerDisponibilidad, noPuedenDe } from '../lib/disponibilidad.mjs'
import { canonStaff, canonKey, esMagma } from '../lib/staff'
import { T, MONO, useEsCelular } from '../lib/ui'
import { nroDeNombreArchivo, emisorDelArchivo, avisoPdfAjeno, esNroDeFactura } from '../lib/factura-numero'
import Edicion from '../components/Edicion'
import { quienSoy } from '../lib/quien-soy'
import FotosProyecto from '../components/FotosProyecto'
import Novedades from '../components/Novedades'
import AvisosChicos from '../components/AvisosChicos'
import HoraInput from '../components/HoraInput'
import CampoFechas from '../components/CampoFechas'
import RepartoStaff from '../components/RepartoStaff'
import { codificarFechas, decodificarFechas, tentativosDe } from '../lib/fechas'
import { TARJETAS_ACTIVAS } from '../lib/socios.mjs'
import { calcularCaja } from '../lib/caja.mjs'
import { tareasDeHoy } from '../lib/hoy.mjs'
import TicketsRevisar from '../components/TicketsRevisar'
import { leerExtracto, unirExtractos, cruzarExtracto, yaCargadasDe, facturasCandidatas } from '../lib/extracto.mjs'

/* ============================================================
   PROTOTIPO DE REDISEÑO — /v2
   Tema CLARO. Un solo color de acción (Magma). Color = sentido.
   Jerarquía: pocos números grandes, el resto chico y gris.
   Usa los MISMOS datos reales (/api/data) y las MISMAS fórmulas
   que la app actual. No toca nada de la app que funciona.
   ============================================================ */

// Paleta y tipografía: viven en lib/ui.js para que components/ use los mismos colores.

// ---------- helpers (idénticos a la app) ----------
const parseMonto = v => { if (!v) return 0; const n = parseFloat(String(v).replace(/[$,\s]/g, '')); return isNaN(n) ? 0 : n }
// --- Plata que escribe Juan (formato argentino: puntos de mil, coma decimal) ---
// El sheet guarda el número plano (927902.19). Estos helpers son SOLO para inputs.
const fmtMontoAR = v => { const s=String(v??'').replace(/[^\d,]/g,''); if(!s) return ''
  const [ent,...resto]=s.split(',')
  const entF=(ent.replace(/^0+(?=\d)/,'')||'0').replace(/\B(?=(\d{3})+(?!\d))/g,'.')
  return resto.length ? `${entF},${resto.join('').slice(0,2)}` : entF }
const parseMontoAR = v => { const n=parseFloat(String(v??'').replace(/\./g,'').replace(',','.').replace(/[^\d.-]/g,'')); return isNaN(n)?0:n }
const numAMontoAR = n => { const v=Number(n)||0; return v ? v.toLocaleString('es-AR',{minimumFractionDigits:0, maximumFractionDigits:2}) : '' }
const fmt = n => '$' + Math.round(Math.abs(n||0)).toLocaleString('es-AR')
const fmtS = n => (n<0?'-':'') + '$' + Math.round(Math.abs(n||0)).toLocaleString('es-AR')
const fmtM = n => { const a=Math.abs(n||0); return (n<0?'-':'')+(a>=1000000?'$'+(a/1000000).toFixed(1)+'M':'$'+Math.round(a/1000)+'K') }
const isAprobado = p => { const e=String(p['Estado']||'').toUpperCase(); return e==='APROBADO'||e==='EN CURSO'||e==='ENTREGADO' }
const isCobrada = f => { const v=f['Cobrado']; return v===true||String(v).toUpperCase()==='TRUE'||String(v).toUpperCase()==='SÍ'||String(v).toUpperCase()==='SI' }
const esActiva = v => { const s=String(v||'').toUpperCase(); return s==='SÍ'||s==='SI'||s==='TRUE'||v===true }
const parseD = s => { if(!s) return null; const p=String(s).split('/'); if(p.length<3) return null; const d=parseInt(p[0]),m=parseInt(p[1]),y=parseInt(p[2]); if(!d||!m||!y) return null; return new Date(y,m-1,d) }
const esDelMes = (s,m,a) => { const d=parseD(s); return !!d && d.getMonth()+1===m && d.getFullYear()===a }
// "2026-09-16" (así guarda la app la Fecha Presupuesto) o "16/9/2026"
const parseFechaAny = s => { const m=String(s||'').trim().match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1],+m[2]-1,+m[3]) : parseD(s) }
const fechaDDMMYYYY = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
// Seguimiento comercial de un presupuesto en espera (PRESUPUESTOS DQ-DS, ver lib/slots.js).
// El reloj arranca en el último contacto; si nunca se llamó, en la fecha del presupuesto.
// "Toca" = pasó el día 4 sin noticias, o llegó la fecha que se dejó en "Seguir el".
// Misma regla que lib/brief.mjs (la diaria): si se cambia acá, cambiarla allá.
const segDe = p => {
  const hoy=new Date(); hoy.setHours(0,0,0,0)
  const d=x=>x?Math.round((hoy-x)/864e5):null
  const ultimo=parseFechaAny(p['Último contacto']), seguir=parseFechaAny(p['Seguir el']), presu=parseFechaAny(p['Fecha Presupuesto'])
  const dUlt=d(ultimo), dPre=d(presu), base=ultimo?dUlt:dPre
  const toca = seguir ? seguir<=hoy : (base===null ? true : base>=DIAS_SEGUIMIENTO)
  return { ultimo, seguir, dUlt, dPre, toca, nunca:!ultimo, paso:String(p['Próximo paso']||'').trim() }
}
// Dedup case-insensitive: une variantes ("No soup media" / "No Soup Media") en una sola,
// quedándose con la de mejor escritura (más mayúsculas). Para datalists de agencias/clientes.
const dedupCI = arr => { const m=new Map(); arr.map(v=>String(v||'').trim()).filter(Boolean).forEach(v=>{ const k=v.toLowerCase(); const caps=s=>(s.match(/[A-ZÁÉÍÓÚÑ]/g)||[]).length; const cur=m.get(k); if(!cur||caps(v)>caps(cur)) m.set(k,v) }); return [...m.values()].sort((a,b)=>a.localeCompare(b,'es')) }
// Margen Magma = costo del staff × este multiplicador. Estuvo en 1 (margen = costo)
// hasta el 02/09/2026; Juan lo subió para actualizar precios por inflación.
// OJO: subir esto 5% NO sube el precio final 5% — Ganancias e IIBB se calculan sobre el
// margen, así que el total se mueve menos. Total = costo × (1 + 1,39 × MULT_MARGEN).
// 1,086 es el número que da +5,0% al cliente (de $525.800 a $552.099 sobre costo $220.000).
// El número vive en lib/desglose.js (se importa arriba) porque el desglose por ítem del
// PDF repite esta misma cadena: con dos copias, el desglose dejaría de cerrar con el total.
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const MESES_LARGO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// Mapeo mail → persona, para "Mi espacio" (proyectos a cargo + tareas). verTodo = dueños/admin.
const USER_NAME = {
  'juan@somosmagma.com':        {nombre:'Juan', nombres:['juan'], verTodo:true},
  'arauzjuanmartin@gmail.com':  {nombre:'Juan', nombres:['juan'], verTodo:true},
  'sofi@somosmagma.com':        {nombre:'Sofi', nombres:['sofi','sofia'], verTodo:true},
  'lulu@somosmagma.com':        {nombre:'Lulu', nombres:['lulu','lucia'], verTodo:false},
  'tom@somosmagma.com':         {nombre:'Tom',  nombres:['tom','tomi','tomas','tomás'], verTodo:false},
  'dani@somosmagma.com':        {nombre:'Dani', nombres:['dani','daniela'], verTodo:false},
  'admin@somosmagma.com':       {nombre:'Flor', nombres:['flor'], verTodo:true, admin:true},
}

const NAV = [
  {id:'dashboard',label:'Dashboard'},
  {id:'calendario',label:'Calendario'},
  // Presupuestos + Proyectos = Trabajos (una fila por trabajo, del presupuesto a la factura).
  // El id sigue siendo 'presupuestos' para no tocar permisos ni links.
  {id:'presupuestos',label:'Trabajos'},
  {id:'edicion',label:'Edición'},
  {id:'facturacion',label:'Facturación'},
  {id:'pagos',label:'Pagos Staff'},
  {id:'freelancers',label:'Freelancers'},
  // Caja reemplaza a Egresos: una sola entrada en el menú. Adentro, la pestaña "Caja" (lo que entra, lo que
  // sale, si alcanza) y la pestaña "Cargar y detalle" (lo que era Egresos). El id sigue siendo 'egresos'
  // para no tocar permisos ni links.
  {id:'egresos',label:'Caja'},
  {id:'agencias',label:'Agencias'},
  {id:'clientes',label:'Clientes'},
  {id:'contactos',label:'Contactos'},
  {id:'historico',label:'Histórico'},
]

// Atrapa errores de un módulo para que no se caiga TODA la app (pantalla negra)
class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state={err:null} }
  static getDerivedStateFromError(err){ return {err} }
  componentDidCatch(err,info){ console.error('Error en módulo:', err, info) }
  render(){
    if(this.state.err) return <div style={{padding:'40px 20px', textAlign:'center'}}>
      <div style={{fontSize:16, fontWeight:700, color:T.brand, marginBottom:8}}>Se rompió esta vista</div>
      <div style={{fontSize:13, color:T.ink2, maxWidth:480, margin:'0 auto 16px', lineHeight:1.5}}>El resto de la app sigue funcionando. Probá actualizar o cambiá de solapa. Detalle: {String(this.state.err?.message||this.state.err)}</div>
      <button onClick={()=>{ this.setState({err:null}); this.props.onReload&&this.props.onReload() }} style={{padding:'9px 20px', borderRadius:9, border:'none', background:T.brand, color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer'}}>↻ Recargar datos</button>
    </div>
    return this.props.children
  }
}

export default function V2() {
  const { data: session, status } = useSession()
  const mail = session?.user?.email || ''
  const readOnly = !!session?.user?.readOnly
  // Acceso parcial: null = ve todo. Ej Dani solo ['edicion','calendario'].
  const modulos = session?.user?.modulos || null
  const puede = id => !modulos || modulos.includes(id)
  const [data,setData] = useState(null)
  const [loading,setLoading] = useState(false)
  const [refreshing,setRefreshing] = useState(false)
  const [err,setErr] = useState('')
  const [mod,setMod] = useState('dashboard')
  // Si el usuario tiene acceso parcial, arrancamos en su primer módulo
  useEffect(()=>{ if(modulos && !modulos.includes(mod)) setMod(modulos[0]) /* eslint-disable-next-line */ },[modulos])
  const [nav,setNav] = useState(null)  // {mod, filtro?, q?} → al navegar, deja el destino filtrado/buscado
  // Un aviso por mail linkea a ?e=<ID del entregable>: la app abre Edición con
  // ese trabajo desplegado, en vez de dejarlo en el tablero entero buscándolo.
  // Y ?t=<N° de presupuesto> (desde la diaria, "hoy te toca llamar") abre ese trabajo en Trabajos.
  useEffect(()=>{
    if(typeof window==='undefined') return
    const params = new URLSearchParams(window.location.search)
    // Y ?caja=1 (desde la diaria, "administración: N cosas para hoy") abre Caja, que arranca en la lista de tareas.
    const id = params.get('e'), t = params.get('t'), caja = params.get('caja')
    if(!id && !t && !caja) return
    if(id){ setMod('edicion'); setNav({mod:'edicion', abrir:id}) }
    else if(t){ setMod('presupuestos'); setNav({mod:'presupuestos', q:t}) }
    else setMod('egresos')
    window.history.replaceState({}, '', window.location.pathname)
  },[])
  // 'proyectos' ya no es una solapa: es una vista de Trabajos. Los links de antes (dashboard,
  // facturación, búsquedas recientes guardadas) siguen andando: el nav conserva de dónde venía.
  const modReal = m => m==='proyectos' ? 'presupuestos' : m
  const goTo = (m, opts) => { setMod(modReal(m)); setNav(opts?{mod:m,...(typeof opts==='string'?{filtro:opts}:opts)}:null) }
  const goSearch = (m, q) => { setMod(modReal(m)); setNav({mod:m, q}) }
  const clearNav = () => setNav(null)
  const [showSearch,setShowSearch] = useState(false)
  const cel = useEsCelular()
  const [menuAbierto,setMenuAbierto] = useState(false)
  const [toast,setToast] = useState(null)  // {msg, tipo:'ok'|'err'}
  const showToast = (msg,tipo='ok') => { setToast({msg,tipo}); setTimeout(()=>setToast(null), 3200) }

  // Atajo Cmd/Ctrl+K → buscador · Esc cierra
  useEffect(()=>{
    const h=(e)=>{ if((e.metaKey||e.ctrlKey)&&(e.key==='k'||e.key==='K')){ e.preventDefault(); setShowSearch(s=>!s) } if(e.key==='Escape') setShowSearch(false) }
    window.addEventListener('keydown',h); return ()=>window.removeEventListener('keydown',h)
  },[])

  useEffect(()=>{ if(status==='authenticated' && mail && !data && !loading) load() // eslint-disable-next-line
  },[status,mail])

  // Modo lectura (invitado): bloquear toda escritura (POST/PUT/DELETE a /api/*) del lado cliente.
  // El backend igual la rechaza (defensa en profundidad).
  useEffect(()=>{
    if(!readOnly) return
    const orig=window.fetch
    window.fetch=(url,opts={})=>{ const u=String(url||''), m=(opts?.method||'GET').toUpperCase()
      if(m!=='GET' && u.includes('/api/') && !u.includes('/api/auth')){
        return Promise.resolve(new Response(JSON.stringify({ok:false,error:'👁 Modo lectura: no podés modificar'}),{status:200,headers:{'Content-Type':'application/json'}}))
      }
      return orig(url,opts) }
    return ()=>{ window.fetch=orig }
  // eslint-disable-next-line
  },[readOnly])

  const ultimaCarga = useRef(0)
  async function load(silencioso=false){
    if(silencioso) setRefreshing(true); else setLoading(true)
    setErr('')
    // __soloLoSuyo: el nombre del usuario de acceso parcial (Dani). Edición lo usa
    // para que las horas extra se carguen a su nombre y nada más.
    try { const r=await fetch('/api/data?fresh=1'); const j=await r.json(); if(j.ok) setData(atarGastosATrabajos({...j.data, __soloLoSuyo:j.soloLoSuyo||null})); else setErr(j.error||'Error') }
    catch(e){ setErr('Error de conexión') }
    ultimaCarga.current = Date.now()
    setLoading(false); setRefreshing(false)
  }

  // Refresco solo (Juan, 03/10/2026: "¿se puede refrescar la app sola cada tanto?"): cada 5 minutos con la pestaña
  // a la vista, y al volver a la pestaña si pasaron más de 2. Nunca mientras alguien escribe en un campo: un re-render
  // en el medio es lo que hace perder el foco. Cambiar de solapa NO relee el sheet (es instantáneo porque usa lo cargado).
  useEffect(()=>{
    if(!data || typeof document==='undefined') return
    const escribiendo = () => { const a=document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) }
    const refrescar = min => { if(document.visibilityState==='visible' && !escribiendo() && Date.now()-ultimaCarga.current > min*60e3) load(true) }
    const tick = setInterval(()=>refrescar(5), 30e3)
    const vis = () => refrescar(2)
    document.addEventListener('visibilitychange', vis)
    return ()=>{ clearInterval(tick); document.removeEventListener('visibilitychange', vis) }
  // eslint-disable-next-line
  },[!!data])

  // Avisos en la compu: cuando entra un "no puedo" o una nota del rodaje nuevos desde Mi Magma, un toast y (si dio
  // permiso) una notificación del navegador. Se comparan los IDs de DISPONIBILIDAD y la primera línea de cada bitácora.
  const vistos = useRef(null)
  useEffect(()=>{
    if(!data) return
    const ahora = new Set([
      ...(data.disponibilidad||[]).filter(r=>String(r['ID']||'').trim()).map(r=>'d|'+String(r['ID']).trim()),
      ...(data.edicion||[]).map(f=>{ const l1=String(f.Notas||'').split('\n')[0].trim(); return l1.includes('🎬') ? 'n|'+String(f['N° presupuesto']||'')+'|'+l1 : '' }).filter(Boolean),
    ])
    if(vistos.current){
      const avisar = (titulo, cuerpo) => { showToast(`${titulo} · ${cuerpo}`,'err'); try{ if(typeof Notification!=='undefined' && Notification.permission==='granted') new Notification(titulo, { body: cuerpo }) }catch(e){} }
      ;(data.disponibilidad||[]).forEach(r=>{ const id='d|'+String(r['ID']||'').trim(); if(id==='d|' || vistos.current.has(id)) return
        if(/^no puede/i.test(String(r['Qué']||'')) && !/^anulad/i.test(String(r['Estado']||''))) avisar(`${String(r['Persona']||'').split(' ')[0]} no puede`, `#${r['N° trabajo']} ${r['Trabajo']} · ${r['Fecha']}${r['Motivo']?` · "${r['Motivo']}"`:''}`) })
      const notasVistas = new Set()
      ;(data.edicion||[]).forEach(f=>{ const l1=String(f.Notas||'').split('\n')[0].trim(); const k='n|'+String(f['N° presupuesto']||'')+'|'+l1
        if(!l1.includes('🎬') || vistos.current.has(k) || notasVistas.has(k)) return
        notasVistas.add(k); const m=l1.match(/^\[[^\]]*\s([^\]]+)\]\s*🎬\s*(.*)$/); avisar(`${m?m[1]:'Alguien'} dejó una nota del rodaje`, `#${f['N° presupuesto']} ${f.Cliente||f.Agencia||''} · ${m?m[2]:l1}`) })
    }
    vistos.current = ahora
  // eslint-disable-next-line
  },[data])

  if(status==='loading') return <Shell><Center>Verificando sesión…</Center></Shell>
  if(status==='unauthenticated'||!mail) return <Shell><Center><button onClick={()=>signIn('google',{callbackUrl:'/'})} style={btnPrimary}>Ingresar con Google</button></Center></Shell>

  return <Shell>
    <div style={{display:'flex', flexDirection: cel?'column':'row', height:'100vh', overflow:'hidden'}}>
      {/* Sidebar claro y minimal */}
      {/* En celular la barra lateral no entra: pasa a ser un encabezado con el
          menú desplegable. Misma información, apilada. */}
      {cel
        ? <div style={{position:'sticky', top:0, zIndex:60, background:T.surface, borderBottom:`1px solid ${T.border}`}}>
            <div style={{display:'flex', alignItems:'center', gap:10, padding:'11px 14px'}}>
              <span style={{width:9, height:9, borderRadius:9, background:T.brand, flexShrink:0}}/>
              <span style={{fontSize:12.5, fontWeight:700, letterSpacing:1.2, color:T.ink}}>SOMOS MAGMA</span>
              <div style={{flex:1}}/>
              {readOnly && <span style={{fontSize:9.5, fontWeight:700, color:T.brand, background:T.brandSoft, padding:'3px 7px', borderRadius:5}}>LECTURA</span>}
              <button onClick={()=>load(true)} disabled={refreshing} style={{padding:'6px 10px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:12, cursor:'pointer'}}>{refreshing?'…':'↻'}</button>
              <button onClick={()=>setMenuAbierto(m=>!m)} style={{padding:'6px 12px', borderRadius:8, border:`1px solid ${T.border}`, background:menuAbierto?T.ink:T.surface, color:menuAbierto?'#fff':T.ink, fontSize:13, fontWeight:600, cursor:'pointer'}}>
                {NAV.find(n=>n.id===mod)?.label || 'Menú'} {menuAbierto?'▲':'▼'}
              </button>
            </div>
            {menuAbierto && <div style={{padding:'0 10px 12px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, borderTop:`1px solid ${T.border}`, paddingTop:10}}>
              {NAV.filter(n=>puede(n.id)).map(n=>(
                <button key={n.id} onClick={()=>{setMod(n.id); setMenuAbierto(false)}} style={{
                  padding:'11px 12px', borderRadius:9, border:`1px solid ${mod===n.id?T.brand:T.border}`, cursor:'pointer',
                  background: mod===n.id?T.brandSoft:T.surface, color: mod===n.id?T.brand:T.ink2,
                  fontSize:13, fontWeight: mod===n.id?700:500, textAlign:'left', fontFamily:'inherit',
                }}>{n.label}</button>
              ))}
              {!readOnly && puede('presupuestos') && <button onClick={()=>{goTo('presupuestos','__nuevo__'); setMenuAbierto(false)}} style={{gridColumn:'1/-1', padding:'11px', borderRadius:9, border:'none', background:T.brand, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer'}}>+ Nuevo presupuesto</button>}
              <div style={{gridColumn:'1/-1', fontSize:10.5, color:T.ink3, textAlign:'center', marginTop:4}}>{mail}</div>
            </div>}
          </div>
        : <aside style={{width:228, flexShrink:0, background:T.surface, borderRight:`1px solid ${T.border}`, display:'flex', flexDirection:'column'}}>
        <div style={{padding:'22px 22px 18px'}}>
          <div style={{display:'flex', alignItems:'center', gap:9}}>
            <span style={{width:9, height:9, borderRadius:9, background:T.brand, display:'inline-block'}}/>
            <span style={{fontSize:13, fontWeight:700, letterSpacing:1.5, color:T.ink}}>SOMOS MAGMA</span>
          </div>
          <div style={{fontSize:10, color:T.ink3, marginTop:5, letterSpacing:0.3, fontFamily:MONO}}>productora audiovisual</div>
          {readOnly && <div style={{marginTop:9, fontSize:10, fontWeight:700, color:T.brand, background:T.brandSoft, padding:'5px 8px', borderRadius:6, letterSpacing:0.4, textAlign:'center'}}>👁 MODO LECTURA</div>}
        </div>
        {!readOnly && puede('presupuestos') && <div style={{padding:'0 16px 12px'}}>
          <button onClick={()=>goTo('presupuestos','__nuevo__')} title="Cargar un presupuesto nuevo, desde donde estés" style={{width:'100%', padding:'10px', borderRadius:9, border:'none', background:T.brand, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer'}}>+ Nuevo presupuesto</button>
        </div>}
        <nav style={{flex:1, padding:'4px 12px'}}>
          {NAV.filter(n=>puede(n.id)).map(n=>{
            const active = mod===n.id
            const ready = true
            return <button key={n.id} onClick={()=>setMod(n.id)} style={{
              width:'100%', textAlign:'left', display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'8px 12px', marginBottom:2, borderRadius:8, border:'none', cursor:'pointer',
              fontSize:13, fontWeight: active?600:500,
              color: active?T.ink:(ready?T.ink2:T.ink3),
              background: active? T.surfaceAlt : 'transparent',
            }}>
              <span>{n.label}</span>
              {active && <span style={{width:5,height:5,borderRadius:5,background:T.brand}}/>}
              {!ready && !active && <span style={{fontSize:9, color:T.ink3, fontFamily:MONO}}>pronto</span>}
            </button>
          })}
        </nav>
        <div style={{padding:'14px 16px'}}>
          <button onClick={()=>load(true)} disabled={refreshing} style={{width:'100%', padding:'8px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:refreshing?T.ink3:T.ink2, fontSize:12.5, fontWeight:500, cursor:refreshing?'default':'pointer'}}>{refreshing?'Actualizando…':'↻ Actualizar'}</button>
        </div>
        <div style={{padding:'14px 22px 16px', borderTop:`1px solid ${T.border}`}}>
          <div style={{fontSize:11, color:T.ink2}}>{mail}</div>
          <a href="/v1" style={{fontSize:11, color:T.ink3, textDecoration:'none', marginTop:6, display:'inline-block'}}>ver versión anterior</a>
        </div>
      </aside>
      }

      {/* Main */}
      <main style={{flex:1, overflowY:'auto', background:T.bg, minWidth:0}}>
        <div>
          <div style={{maxWidth:1180, margin:'0 auto', padding: cel?'10px 14px 0':'14px 36px 0', display:'flex', justifyContent:'flex-end'}}>
            {!modulos && !cel && <button onClick={()=>setShowSearch(true)} title="Buscar (⌘K)" style={{display:'flex', alignItems:'center', gap:8, padding:'8px 14px', borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, cursor:'pointer'}}>
              <span style={{fontSize:13}}>🔍</span><span>Buscar</span>
              <span style={{fontSize:10.5, fontFamily:MONO, padding:'1px 6px', borderRadius:4, background:T.surfaceAlt, color:T.ink3}}>⌘K</span>
            </button>}
          </div>
        </div>
        <div style={{maxWidth:1180, margin:'0 auto', padding: cel?'12px 14px 60px':'14px 36px 80px'}}>
          {err && <div style={{background:T.brandSoft, color:T.brand, border:`1px solid ${T.brand}30`, borderRadius:10, padding:'12px 16px', fontSize:13, marginBottom:18}}>{err}</div>}
          {data && puede('presupuestos') && <AvisosChicos data={data} goTo={goTo} cel={cel}/>}
          {data && puede('edicion') && <Novedades data={data} mail={mail} persona={USER_NAME[mail]} goTo={goTo} cel={cel}/>}
          {loading || !data
            ? <Center>Cargando datos del sheet…</Center>
            : <ErrorBoundary key={mod} onReload={()=>load(true)}>{
              mod==='dashboard' ? <Dashboard data={data} goTo={goTo} onRefresh={()=>load(true)} showToast={showToast} mail={mail}/>
            : (mod==='presupuestos'||mod==='proyectos') ? <Trabajos data={data} onRefresh={()=>load(true)} showToast={showToast} nav={nav} clearNav={clearNav} goTo={goTo}/>
            : mod==='calendario' ? <Calendario data={data} onRefresh={()=>load(true)} showToast={showToast} soloVer={!!modulos} goTo={goTo} mail={mail}/>
            : mod==='edicion' ? <Edicion data={data} onRefresh={()=>load(true)} showToast={showToast} nav={nav} clearNav={clearNav} goTo={goTo} mail={mail}/>
            : mod==='facturacion' ? <Facturacion data={data} onRefresh={()=>load(true)} showToast={showToast} nav={nav} clearNav={clearNav} goTo={goTo}/>
            : mod==='pagos' ? <PagosStaff data={data} onRefresh={()=>load(true)} showToast={showToast} nav={nav} clearNav={clearNav}/>
            : mod==='freelancers' ? <Freelancers data={data} nav={nav} clearNav={clearNav} onRefresh={()=>load(true)} showToast={showToast}/>
            : (mod==='egresos'||mod==='caja') ? <Caja data={data} onRefresh={()=>load(true)} showToast={showToast} goTo={goTo}/>
            : mod==='agencias' ? <Agencias data={data} onRefresh={()=>load(true)} showToast={showToast} nav={nav} clearNav={clearNav}/>
            : mod==='clientes' ? <Clientes data={data} nav={nav} clearNav={clearNav}/>
            : mod==='contactos' ? <Contactos data={data} onRefresh={()=>load(true)} showToast={showToast} nav={nav} clearNav={clearNav}/>
            : mod==='historico' ? <Historico data={data}/>
            : <Placeholder label={NAV.find(n=>n.id===mod)?.label}/>
            }</ErrorBoundary>}
        </div>
      </main>
    </div>
    {showSearch && <GlobalSearch data={data} onClose={()=>setShowSearch(false)} onNavegar={(m,q)=>{ goSearch(m,q); setShowSearch(false) }}/>}
    {toast && <div style={{position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', zIndex:1000, padding:'11px 20px', borderRadius:10, fontSize:13, fontWeight:500, color:'#fff', background: toast.tipo==='err'?T.brand:T.ink, boxShadow:'0 8px 24px rgba(0,0,0,0.18)'}}>{toast.msg}</div>}
  </Shell>
}

// Cartel de alertas del mail del usuario logueado (sin leer + pedidos de presupuesto)
function MailAlert(){
  const [a,setA]=useState(null)
  useEffect(()=>{ fetch('/api/mis-alertas').then(r=>r.json()).then(setA).catch(()=>{}) },[])
  if(!a || a.unread==null) return null
  const nombre=(a.mailbox||'').split('@')[0]
  const url='https://mail.google.com/mail/?authuser='+encodeURIComponent(a.mailbox||'')
  const pedidos=a.pedidos||[], nPed=a.pedidosCount||pedidos.length
  return <div style={{background:T.brandSoft, border:`1px solid ${T.border}`, borderRadius:12, padding:'12px 16px', marginBottom:14, display:'flex', gap:14, alignItems:'flex-start', flexWrap:'wrap'}}>
    <span style={{fontSize:20}}>📬</span>
    <div style={{flex:1, minWidth:200}}>
      <div style={{fontSize:13.5, color:T.ink, fontWeight:600}}>{nombre}, tenés <span style={{color:T.brand}}>{a.unread} sin leer</span>{nPed>0 && <> · <span style={{color:T.brand}}>{nPed} posible{nPed===1?'':'s'} pedido{nPed===1?'':'s'} de presupuesto</span></>}</div>
      {pedidos.length>0 && <div style={{marginTop:8, display:'flex', flexDirection:'column', gap:6}}>{pedidos.slice(0,5).map((p,i)=>{
        const link = p.id ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(a.mailbox||'')}#all/${p.id}` : url
        const from = (p.from||'').replace(/<[^>]*>/,'').replace(/"/g,'').trim()
        return <a key={i} href={link} target="_blank" rel="noreferrer" title="Abrir este mail en Gmail" style={{display:'block', textDecoration:'none', background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:'7px 11px'}}>
          <div style={{fontSize:12.5, color:T.ink, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{p.subject||'(sin asunto)'} <span style={{color:T.ink3, fontWeight:400}}>— {from}</span></div>
          {p.snippet && <div style={{fontSize:11, color:T.ink3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginTop:2}}>{p.snippet}</div>}
        </a>
      })}</div>}
    </div>
    <a href={url} target="_blank" rel="noreferrer" style={{fontSize:12.5, color:T.brand, fontWeight:600, textDecoration:'none', whiteSpace:'nowrap'}}>Abrir bandeja →</a>
  </div>
}

// Cartel de respuestas de freelancers a los mails de pago (lee admin@somosmagma.com por IMAP).
// Avisa cuántos contestaron y cuántas facturas adjuntaron que todavía no están guardadas.
function RespuestasFreelancerAlert({data, goTo}){
  const [d,setD]=useState(null)
  useEffect(()=>{ fetch('/api/pagos-staff-respuestas').then(r=>r.json()).then(j=>setD(j&&j.ok?j:null)).catch(()=>{}) },[])
  if(!d || !d.resumen || d.resumen.enviados===0) return null
  const {enviados:nEnv, sinResponder, sinGuardar}=d.resumen
  const alerta=sinGuardar>0
  // Resumen corto: un vistazo. El detalle (barra, nombres, guardar) vive en Pagos Staff.
  return <div onClick={()=>goTo&&goTo('pagos')} style={{background:alerta?T.warnSoft:T.surface, border:`1px solid ${alerta?T.warn+'55':T.border}`, borderRadius:12, padding:'12px 16px', marginTop:14, display:'flex', gap:12, alignItems:'center', cursor:'pointer'}}>
    <span style={{fontSize:18}}>📨</span>
    <div style={{flex:1, minWidth:0, fontSize:13.5, color:T.ink, fontWeight:600}}>Pagos a freelancers · {sinResponder>0?<span style={{color:T.warn}}>{sinResponder} sin responder</span>:<span style={{color:T.pos}}>todos respondieron</span>} <span style={{color:T.ink3, fontWeight:400}}>de {nEnv}</span>{sinGuardar>0 && <span style={{color:T.warn}}> · 📎 {sinGuardar} sin guardar</span>}</div>
    <span style={{fontSize:12.5, color:T.brand, fontWeight:600, whiteSpace:'nowrap'}}>Ver detalle →</span>
  </div>
}

// Oversight de mails del equipo — solo dueños (el endpoint devuelve [] si no sos dueño).
function TeamMails(){
  const [d,setD]=useState(null)
  useEffect(()=>{ fetch('/api/equipo-alertas').then(r=>r.json()).then(setD).catch(()=>{}) },[])
  if(!d || !d.equipo || d.equipo.length===0) return null
  return <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', marginTop:14}}>
    <CardHead>Mails del equipo · pedidos sin leer</CardHead>
    {d.equipo.map((m,i)=>(
      <div key={i} style={{padding:'11px 18px', borderTop:`1px solid ${T.border}`}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <span style={{fontSize:13, fontWeight:600, color:T.ink}}>{m.nombre} <span style={{fontWeight:400, color:T.ink3, fontSize:11.5}}>· {m.error?'sin acceso':`${m.unread} sin leer`}</span></span>
          <a href={`https://mail.google.com/mail/?authuser=${encodeURIComponent(m.mailbox||'')}`} target="_blank" rel="noreferrer" style={{fontSize:11.5, color:T.brand, fontWeight:600, textDecoration:'none'}}>ver bandeja →</a>
        </div>
        {(m.pedidos||[]).slice(0,2).map((p,j)=>(
          <a key={j} href={p.id?`https://mail.google.com/mail/?authuser=${encodeURIComponent(m.mailbox||'')}#all/${p.id}`:'#'} target="_blank" rel="noreferrer" style={{display:'block', fontSize:11.5, color:T.ink2, textDecoration:'none', marginTop:4, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>· {p.subject||'(sin asunto)'} <span style={{color:T.ink3}}>— {(p.from||'').replace(/<[^>]*>/,'').replace(/"/g,'').trim()}</span></a>
        ))}
        {(!m.pedidos || m.pedidos.length===0) && !m.error && <div style={{fontSize:11.5, color:T.ink3, marginTop:4}}>Sin pedidos recientes ✓</div>}
      </div>
    ))}
  </div>
}

// ============================ DASHBOARD ============================
function Dashboard({data, goTo, onRefresh, showToast, mail}){
  const [verCuentas,setVerCuentas]=useState(false)
  const [editSaldos,setEditSaldos]=useState(false)  // "Actualizar saldos" adentro de "ver cuentas"
  const [cobrando,setCobrando]=useState(null)  // cobrar directo desde el dashboard
  const [facturando,setFacturando]=useState(null)  // facturar directo desde el dashboard
  const hoy = new Date()
  const mesActual = hoy.getMonth()+1, anioActual = hoy.getFullYear()
  const pr=data.presupuestos||[], fc=data.facturacion||[], cuentas=data.cuentas||[], proyectos=data.proyectos||[], pagosStaff=data.pagosStaff||[], reservas=data.reservas||[]

  // --- Caja (idéntico a la app) ---
  const cuentasActivas = cuentas.filter(c=>esActiva(c['Activa']))
  const totalCaja = cuentasActivas.reduce((s,c)=>s+parseMonto(c['Saldo actual']),0)
  const reservasActivas = reservas.filter(r=>esActiva(r['Activa']))
  const totalReservado = reservasActivas.reduce((s,r)=>s+parseMonto(r['Monto']),0)
  const totalDisponible = totalCaja - totalReservado
  // Los cobros/pagos de la app mueven el saldo, pero no son un chequeo contra el banco: eso es
  // lo que registra "Hist saldos" (solo lo escribe cuenta-saldo-update). Con más de 2 días, aviso.
  const cuentasPesos = cuentasActivas.filter(c=>!esCuentaUsd(c))
  const chequeos = cuentasPesos.map(ultimoChequeoCuenta)
  const ultChequeo = chequeos.length && chequeos.every(Boolean) ? new Date(Math.min(...chequeos.map(d=>d.getTime()))) : null
  const diasChequeo = ultChequeo ? Math.floor((hoy-ultChequeo)/864e5) : null
  const saldosViejos = diasChequeo==null || diasChequeo>2

  // --- Por cobrar ---
  const porCobrar = fc.filter(f=>!isCobrada(f)).map(f=>{
    const fEv=parseD(f['Fecha Evento']); const diasDesdeEvento = fEv?Math.floor((hoy-fEv)/864e5):0
    const venc=parseD(f['Vencimiento']); const dVenc = venc?Math.floor((venc-hoy)/864e5):null
    return {...f, diasDesdeEvento, dVenc, monto:parseMonto(f['Precio FINAL']||f['Precio Final']), neto:parseMonto(f['Precio SIN IVA'])}
  }).sort((a,b)=>b.diasDesdeEvento-a.diasDesdeEvento)
  const totalPorCobrar = porCobrar.reduce((s,f)=>s+f.monto,0)
  const atrasadas30 = porCobrar.filter(f=>f.diasDesdeEvento>30)
  const totalAtrasadas = atrasadas30.reduce((s,f)=>s+f.monto,0)
  // Listo para facturar: presupuestos aprobados con saldo pendiente y evento ya pasado (accionable).
  const parafacturar = pr.filter(isAprobado).map(p=>{
    const facturas=fc.filter(f=>esFacturaReal(f) && String(f['N° Presupuesto']||'').trim()===String(p['Columna 1']||'').trim() && !String(f['Nro de Factura']||'').toUpperCase().startsWith('ANULADA'))
    const facturado=facturas.reduce((s,f)=>s+(parseMonto(f['Precio SIN IVA'])||parseMonto(f['Precio FINAL'])),0)
    const neto=parseMonto(p['Precio Final']); const ev=parseD(p['Fecha Evento'])
    return {p, facturas, facturado, neto, pendiente:Math.max(0,neto-facturado), ev, paso: ev? ev<=hoy : true}
  }).filter(x=>x.neto>0 && x.pendiente>x.neto*0.05 && x.paso).sort((a,b)=>(a.ev?a.ev.getTime():0)-(b.ev?b.ev.getTime():0))

  // --- A pagar staff (próx 15) ---
  const diaHoy=hoy.getDate()
  const mesACobrar = diaHoy>=15 ? mesActual : mesActual-1
  const proxPagoFecha = new Date(anioActual, diaHoy>=15?mesActual-1:mesActual-2, 15)
  const esPagada = p => { const e=String(p['Estado']||p['Pagado']||'').toUpperCase(); return ['PAGADO','SÍ','SI','TRUE'].includes(e)||parseMonto(p['Monto Pagado'])>0 }
  const staffAPagar = pagosStaff.filter(p=>{
    const m=String(p['Mes Referencia']||p['Mes']||'').toLowerCase()
    const esMes = m.includes(String(mesACobrar).padStart(2,'0'))||m.includes(MESES[(mesACobrar+11)%12])
    return esMes && !esPagada(p)
  })
  const totalAPagar = staffAPagar.reduce((s,p)=>s+parseMonto(p['Monto Adeudado']||p['Monto']||p['Total'])+parseMonto(p['Viáticos']||p['Viaticos']),0)

  // --- Plata del mes ---
  // Cobrado: facturas que efectivamente cobramos este mes (plata que entró).
  const facMes = fc.filter(f=>esDelMes(f['Fecha emision'],mesActual,anioActual))
  const facMesCobradas = facMes.filter(isCobrada)
  const ingresosMes = facMesCobradas.reduce((s,f)=>s+parseMonto(f['Precio SIN IVA']),0)
  // Puntualidad de cobro: de las facturas con fecha de envío Y fecha de cobro, cuántas se cobraron ≤30 días.
  // (La fecha de envío se estampa sola al subir/mandar la factura; se puede editar a mano.)
  const facMedibles = fc.filter(f=>parseD(f['Fecha enviada']) && parseD(f['Fecha cobro']))
    // Excluir facturas con fecha de cobro = fecha de evento: es el placeholder del bug viejo de "Ya está" (no es la fecha real de cobro).
    .filter(f=>{ const ev=parseD(f['Fecha Evento']), c=parseD(f['Fecha cobro']); return !(ev && c && ev.getTime()===c.getTime()) })
    .map(f=>({...f, _dias:Math.floor((parseD(f['Fecha cobro'])-parseD(f['Fecha enviada']))/864e5)}))
    .filter(f=>f._dias>=0 && f._dias<400)
  const pctATiempo = facMedibles.length ? Math.round(facMedibles.filter(f=>f._dias<=30).length/facMedibles.length*100) : null
  const diasPromCobro = facMedibles.length ? Math.round(facMedibles.reduce((s,f)=>s+f._dias,0)/facMedibles.length) : 0
  // Eventos APROBADOS cuyo evento cae este mes (los laburos que hago en junio).
  const proyMesEvento = proyectos.filter(p=>esDelMes(p['Fecha Evento'],mesActual,anioActual))
  // Facturado (eventos del mes): valor total de los trabajos cuyo evento es este mes.
  // NO es "lo emitido este mes" — eso arrastraba facturas viejas (ej: Minecraft de mayo).
  const facMesTotales = proyMesEvento.reduce((s,p)=>s+parseMonto(p['Total ']||p['Total']),0)
  // Pagos staff: lo que voy gastando en staff por los eventos del mes.
  // NO cuenta "Somos Magma" (esa línea es ganancia de la empresa, no un gasto).
  const pagosStaffMes = proyMesEvento.reduce((s,p)=>{ let t=0; for(let j=1;j<=MAX_SLOTS;j++){ const st=String(p['Staff '+j]||(j===1?p['Staff']:'')||'').trim(); const pr2=parseMonto(p['Precio '+j]||(j===1?p['Precio']:'')); if(st&&st!=='Somos Magma'&&pr2>0) t+=pr2 } return s+t },0)
  // Ganancia Magma del mes = precio − staff de afuera − gastos de cada trabajo, de los eventos del mes (ver gananciaProyecto).
  const ganMagmaMes = proyMesEvento.reduce((s,p)=>s+gananciaProyecto(p),0)
  const rentabilidadMes = ganMagmaMes

  // --- Conversión + ticket ---
  const presusMes = pr.filter(p=>esDelMes(p['Fecha Presupuesto'],mesActual,anioActual))
  const apMes = presusMes.filter(isAprobado).length
  const espMes = presusMes.filter(p=>String(p['Estado']||'').toUpperCase()==='EN ESPERA').length
  const desMes = presusMes.filter(p=>String(p['Estado']||'').toUpperCase()==='DESAPROBADO').length
  const denom = apMes+espMes+desMes
  const tasaConversion = denom>0?Math.round(apMes/denom*100):0
  // Ticket promedio del MES: promedio de los eventos aprobados cuyo evento es este mes.
  const aprobMesEvento = pr.filter(isAprobado).filter(p=>esDelMes(p['Fecha Evento'],mesActual,anioActual))
  const eventosMes = aprobMesEvento.length
  const ticketPromedio = eventosMes>0?Math.round(aprobMesEvento.reduce((s,p)=>s+parseMonto(p['Precio Final']),0)/eventosMes):0

  // --- Pipeline próximos 3 meses ---
  const proyByNro={}; proyectos.forEach(prj=>{proyByNro[String(prj['N° presupuesto'])]=prj})
  // Con proyecto, el staff real (o presupuestado donde falta cargar); sin proyecto, el presu.
  const calcGanReal = (presu)=>{
    const proy = proyByNro[String(presu['Columna 1']||presu['N° presupuesto'])]
    return proy ? gananciaProyecto(proy) : gananciaPresu(presu)
  }
  // Mes anterior + este + 2 siguientes (ej: mayo, junio, julio, agosto)
  const proxMeses = [-1,0,1,2].map(i=>{ const idx=mesActual-1+i+12; return {m:(idx%12)+1, a:anioActual+Math.floor((mesActual-1+i)/12)} })
  const pipeline = proxMeses.map(({m,a})=>{
    const ps = pr.filter(p=>esDelMes(p['Fecha Evento'],m,a)).filter(isAprobado)
    const fact = ps.reduce((s,p)=>s+parseMonto(p['Precio Final']),0)
    const gan = ps.reduce((s,p)=>s+calcGanReal(p),0)
    return {m,a,cant:ps.length,fact,gan,esActual:m===mesActual&&a===anioActual,esPasado:(a<anioActual)||(a===anioActual&&m<mesActual)}
  })

  // --- Alertas (subconjunto, las accionables) ---
  const presusAprobados = pr.filter(isAprobado)
  const sinProyecto = presusAprobados.filter(p=>!proyByNro[String(p['Columna 1']||p['N° presupuesto'])]).length
  const proxSinStaff = proyectos.filter(p=>{ const fe=parseD(p['Fecha Evento']); if(!fe) return false; const d=Math.floor((fe-hoy)/864e5); const carga=String(p['Carga Staff']||'').toUpperCase()==='TRUE'||p['Carga Staff']===true; return d>=0 && d<=14 && !carga }).length
  const facVencen7 = porCobrar.filter(f=>f.dVenc!=null && f.dVenc>=0 && f.dVenc<=7).length
  const alertas = [
    sinProyecto>0 && {sev:'warn', txt:`${sinProyecto} presupuestos aprobados sin proyecto cargado`, to:'presupuestos', filtro:'ap'},
    proxSinStaff>0 && {sev:'brand', txt:`${proxSinStaff} proyectos en ≤14 días sin staff asignado`, to:'proyectos', filtro:'pendiente'},
    facVencen7>0 && {sev:'warn', txt:`${facVencen7} facturas vencen esta semana`, to:'facturacion', filtro:'pendiente'},
    atrasadas30.length>0 && {sev:'brand', txt:`${atrasadas30.length} facturas atrasadas +30 días (${fmt(totalAtrasadas)})`, to:'facturacion', filtro:'atrasadas'},
  ].filter(Boolean)

  // --- Top clientes del año ---
  const porCliente={}
  fc.filter(f=>String(f['Fecha emision']||'').includes(String(anioActual))).forEach(f=>{ const c=f['Cliente']||f['Agencia']||'—'; porCliente[c]=(porCliente[c]||0)+parseMonto(f['Precio SIN IVA']) })
  const topClientes = Object.entries(porCliente).sort((a,b)=>b[1]-a[1]).slice(0,5)

  // --- Mi espacio: proyectos a cargo + tareas del usuario logueado ---
  const yo = USER_NAME[String(mail||'').toLowerCase()] || null
  const misNombres = yo ? yo.nombres : []
  const esMio = p => misNombres.includes(String(p['PM']||'').trim().toLowerCase())
  const misProy = misNombres.length ? proyectos.filter(esMio) : []
  const _tieneStaff = p => p['Carga Staff']===true||String(p['Carga Staff']||'').toUpperCase()==='TRUE'
  const facByNro = {}; fc.forEach(f=>{ if(esFacturaReal(f)) facByNro[String(f['N° Presupuesto']||'').trim()]=true })
  const misSinStaff = misProy.filter(p=>{ const fe=parseD(p['Fecha Evento']); if(!fe) return false; const d=Math.floor((fe-hoy)/864e5); return d>=-1 && d<=14 && !_tieneStaff(p) })
  const misSinFacturar = misProy.filter(p=>{ const fe=parseD(p['Fecha Evento']); const paso=fe? fe<=hoy : false; return paso && !facByNro[String(p['N° presupuesto']||'').trim()] })
  const misPorCobrar = porCobrar.filter(f=>{ const proy=proyByNro[String(f['N° Presupuesto']||'').trim()]; return proy && esMio(proy) })

  // Oversight del equipo (solo dueños/admin): pendientes de cada PM, para que nada se caiga.
  const _tareasDe = (nombres) => {
    const es = p => nombres.includes(String(p['PM']||'').trim().toLowerCase())
    const prj = proyectos.filter(es)
    const ss = prj.filter(p=>{ const fe=parseD(p['Fecha Evento']); if(!fe) return false; const d=Math.floor((fe-hoy)/864e5); return d>=-1 && d<=14 && !_tieneStaff(p) }).length
    const sf = prj.filter(p=>{ const fe=parseD(p['Fecha Evento']); const paso=fe?fe<=hoy:false; return paso && !facByNro[String(p['N° presupuesto']||'').trim()] }).length
    const pc = porCobrar.filter(f=>{ const proy=proyByNro[String(f['N° Presupuesto']||'').trim()]; return proy && es(proy) }).length
    return {n:prj.length, ss, sf, pc}
  }
  const equipo = (yo && yo.verTodo) ? [
    {nombre:'Lulu', nombres:['lulu','lucia']},
    {nombre:'Tom',  nombres:['tom','tomi','tomas','tomás']},
    {nombre:'Sofi', nombres:['sofi','sofia']},
    {nombre:'Juan', nombres:['juan']},
  ].filter(m=>!m.nombres.some(n=>misNombres.includes(n))).map(m=>({...m, t:_tareasDe(m.nombres)})).filter(m=>m.t.n>0) : []

  return <>
    <PageHead title="Dashboard" sub={`${MESES_LARGO[mesActual-1]} ${anioActual} · hoy ${diaHoy}`}/>
    <MailAlert/>
    <RespuestasFreelancerAlert data={data} goTo={goTo}/>

    {/* MI ESPACIO — tus proyectos a cargo + tus tareas (según quién se logueó) */}
    {misProy.length>0 && <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', marginTop:14}}>
      <CardHead>Tu espacio · {yo?.nombre} <span style={{fontWeight:400, color:T.ink3}}>· {misProy.length} proyectos a tu cargo</span></CardHead>
      <div style={{display:'flex', borderTop:`1px solid ${T.border}`}}>
        {[
          {n:misSinStaff.length, l:'sin staff (≤14 días)', to:'proyectos', filtro:'pendiente', c:T.brand},
          {n:misSinFacturar.length, l:'para facturar', to:'facturacion', filtro:undefined, c:T.brand},
          {n:misPorCobrar.length, l:'por cobrar', to:'facturacion', filtro:'pendiente', c:T.warn},
        ].map((t,i)=>(
          <div key={i} onClick={()=>t.n>0&&goTo&&goTo(t.to,t.filtro)} style={{flex:1, padding:'14px 16px', borderLeft:i>0?`1px solid ${T.border}`:'none', cursor:t.n>0?'pointer':'default', textAlign:'center'}}
            onMouseEnter={e=>{if(t.n>0)e.currentTarget.style.background=T.surfaceAlt}} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div style={{fontSize:26, fontWeight:700, fontFamily:MONO, color:t.n>0?t.c:T.ink3}}>{t.n}</div>
            <div style={{fontSize:11.5, color:T.ink2, marginTop:2}}>{t.l}</div>
          </div>
        ))}
      </div>
    </div>}

    {/* EL EQUIPO — oversight para dueños: pendientes de cada PM */}
    {equipo.length>0 && <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', marginTop:14}}>
      <CardHead>El equipo · pendientes de cada uno</CardHead>
      <div style={{display:'grid', gridTemplateColumns:'1.3fr 90px 100px 90px', padding:'8px 18px', fontSize:10.5, fontWeight:600, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, borderTop:`1px solid ${T.border}`}}>
        <span>PM</span><span style={{textAlign:'center'}}>sin staff</span><span style={{textAlign:'center'}}>para facturar</span><span style={{textAlign:'center'}}>por cobrar</span>
      </div>
      {equipo.map((m,i)=>(
        <div key={i} style={{display:'grid', gridTemplateColumns:'1.3fr 90px 100px 90px', padding:'10px 18px', borderTop:`1px solid ${T.border}`, alignItems:'center', fontSize:13}}>
          <span style={{color:T.ink, fontWeight:600}}>{m.nombre} <span style={{fontWeight:400, color:T.ink3, fontSize:11.5}}>· {m.t.n} proy</span></span>
          <span style={{textAlign:'center', fontFamily:MONO, fontWeight:600, color:m.t.ss>0?T.brand:T.ink3}}>{m.t.ss}</span>
          <span style={{textAlign:'center', fontFamily:MONO, fontWeight:600, color:m.t.sf>0?T.brand:T.ink3}}>{m.t.sf}</span>
          <span style={{textAlign:'center', fontFamily:MONO, fontWeight:600, color:m.t.pc>0?T.warn:T.ink3}}>{m.t.pc}</span>
        </div>
      ))}
    </div>}

    {yo && yo.verTodo && <TeamMails/>}

    {/* HERO — los 3 números que mirás todos los días (clickeables) */}
    <div style={{display:'flex', gap:14}}>
      <div style={{flex:1, cursor:'pointer'}} onClick={()=>setVerCuentas(v=>!v)} title="Ver detalle por cuenta">
        <Hero label="Disponible real"
          value={fmtS(totalDisponible)}
          sub={`En caja ${fmtS(totalCaja)} · reservado ${fmt(totalReservado)} · `} subStrong={verCuentas?'ocultar ▲':saldosViejos?(diasChequeo==null?'saldos sin chequear ▼':`saldos de hace ${diasChequeo} días ▼`):'ver cuentas ▼'} subStrongColor={!verCuentas&&saldosViejos?T.warn:T.ink3}/>
      </div>
      <div style={{flex:1, cursor:'pointer'}} onClick={()=>goTo&&goTo('facturacion', atrasadas30.length>0?'atrasadas':undefined)}>
        <Hero label="Por cobrar"
          value={fmt(totalPorCobrar)}
          accent={atrasadas30.length>0?T.brand:T.ink}
          sub={`${porCobrar.length} facturas · `}
          subStrong={atrasadas30.length>0?`${atrasadas30.length} atrasadas +30d →`:'al día →'}
          subStrongColor={atrasadas30.length>0?T.brand:T.pos}/>
      </div>
      <div style={{flex:1, cursor:'pointer'}} onClick={()=>goTo&&goTo('pagos')}>
        <Hero label={`A pagar staff · ${proxPagoFecha.getDate()}/${proxPagoFecha.getMonth()+1}`}
          value={fmt(totalAPagar)}
          sub={`${staffAPagar.length} freelancers · `} subStrong="ver →" subStrongColor={T.ink3}/>
      </div>
    </div>
    {verCuentas && <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:'14px 18px', marginTop:12}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
        <div style={{fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:0.4, color:T.ink3}}>Plata por cuenta</div>
        {!editSaldos && <button style={{...miniBtn, ...(saldosViejos?{borderColor:T.warn, color:T.warn}:{})}} onClick={()=>setEditSaldos(true)}>Actualizar saldos</button>}
      </div>
      {editSaldos
        ? <SaldosEditor cuentas={cuentasActivas} onClose={()=>setEditSaldos(false)} onSaved={()=>{ setEditSaldos(false); if(onRefresh) onRefresh() }} showToast={showToast}/>
        : <>
          {cuentasActivas.filter(c=>!esCuentaUsd(c) || parseMonto(c['Saldo USD'])>0).map((c,i)=>{ const saldo=parseMonto(c['Saldo actual']); const usd=parseMonto(c['Saldo USD']); const chq=ultimoChequeoCuenta(c); const enUsd=esCuentaUsd(c); return (
            <div key={i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderTop:i===0?'none':`1px solid ${T.border}`}}>
              <div><div style={{fontSize:13, color:T.ink, fontWeight:500}}>{c['Nombre']}</div><div style={{fontSize:11, color:T.ink3}}>{[c['Banco']&&c['Banco']!=='—'?c['Banco']:null, enUsd?null:chq?`chequeado ${chq.getDate()}/${chq.getMonth()+1}`:'nunca chequeado'].filter(Boolean).join(' · ')}</div></div>
              <div style={{textAlign:'right'}}>{enUsd
                ? <div style={{fontSize:13.5, fontFamily:MONO, color:T.ink}}>USD {fmt(usd)}</div>
                : <><div style={{fontSize:13.5, fontFamily:MONO, color:saldo<0?T.brand:T.ink}}>{fmtS(saldo)}</div>{usd>0&&<div style={{fontSize:11, fontFamily:MONO, color:T.ink3}}>USD {fmt(usd)}</div>}</>}</div>
            </div>
          )})}
          <div style={{display:'flex', justifyContent:'space-between', padding:'10px 0 0', marginTop:6, borderTop:`1px solid ${T.border}`}}>
            <span style={{fontSize:12.5, color:T.ink2}}>En caja</span><span style={{fontSize:13.5, fontFamily:MONO, fontWeight:700, color:T.ink}}>{fmtS(totalCaja)}</span>
          </div>
          {totalReservado>0 && <div style={{display:'flex', justifyContent:'space-between', padding:'4px 0'}}><span style={{fontSize:12.5, color:T.warn}}>Reservado (IVA/imp.)</span><span style={{fontSize:13, fontFamily:MONO, color:T.warn}}>-{fmt(totalReservado)}</span></div>}
          <div style={{display:'flex', justifyContent:'space-between', padding:'4px 0'}}><span style={{fontSize:12.5, color:T.ink2, fontWeight:600}}>Disponible real</span><span style={{fontSize:14, fontFamily:MONO, fontWeight:700, color:totalDisponible<0?T.brand:T.pos}}>{fmtS(totalDisponible)}</span></div>
          <div style={{fontSize:11, color:saldosViejos?T.warn:T.ink3, marginTop:8}}>{diasChequeo==null
            ? 'Hay cuentas que nunca se chequearon contra el banco. Mirá el home banking y cargá los saldos con "Actualizar saldos".'
            : saldosViejos
              ? `Último chequeo contra el banco hace ${diasChequeo} días. Los cobros y pagos de la app lo van moviendo, pero el banco es el que manda: actualizalo.`
              : `Chequeado contra el banco ${diasChequeo===0?'hoy':'ayer'}. Cada cobro o pago que cargás en la app lo va moviendo solo.`}</div>
        </>}
    </div>}

    {/* ESTE MES */}
    <SectionTitle>{MESES_LARGO[mesActual-1]} · este mes</SectionTitle>
    <div style={{display:'flex', gap:12, flexWrap:'wrap'}}>
      <Stat label="Cobrado" value={fmt(ingresosMes)} color={T.pos} sub="plata que entró este mes"/>
      {pctATiempo!=null && <Stat label="Cobrado a tiempo" value={pctATiempo+'%'} color={pctATiempo>=70?T.pos:T.brand} sub={`pagadas dentro de 30 días (objetivo). Hoy tardan ${diasPromCobro} días en promedio · ${facMedibles.length} fact.`}/>}
      <Stat label="Facturado (eventos)" value={fmt(facMesTotales)} sub="valor de los trabajos de este mes"/>
      <Stat label="Pagos staff" value={fmt(pagosStaffMes)} sub="staff de eventos de este mes (sin Somos Magma)"/>
      <Stat label="Ganancia Magma" value={fmtS(rentabilidadMes)} color={rentabilidadMes>=0?T.pos:T.brand} sub="precio − staff de afuera − gastos del trabajo (impuestos y Somos Magma adentro)"/>
      <Stat label="Conversión" value={tasaConversion+'%'} sub={`${apMes} aprob. de ${denom} presus del mes`}/>
      <Stat label="Ticket prom." value={fmt(ticketPromedio)} sub={`${eventosMes} ${eventosMes===1?'evento aprobado':'eventos aprobados'} este mes`}/>
    </div>

    {/* PIPELINE */}
    <SectionTitle>El mes pasado, este, y lo que viene</SectionTitle>
    <div style={{display:'flex', gap:12}}>
      {pipeline.map((p,i)=>(
        <div key={i} style={{flex:1, background:p.esActual?T.brandSoft:T.surface, border:`1px solid ${p.esActual?T.brand:T.border}`, borderRadius:12, padding:'16px 18px'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
            <span style={{fontSize:12.5, fontWeight:p.esActual?700:600, color:p.esActual?T.brand:T.ink}}>{MESES_LARGO[p.m-1]}{p.esActual?' · hoy':''}</span>
            <span style={{fontSize:11, color:T.ink3}}>{p.cant} aprob.</span>
          </div>
          <div style={{fontSize:22, fontWeight:600, fontFamily:MONO, color:T.ink, marginTop:10}}>{fmtM(p.fact)}</div>
          <div style={{fontSize:11.5, color:T.ink2, marginTop:4}}>{p.esPasado?'facturado':'facturación esperada'}</div>
          <div style={{fontSize:13, fontWeight:600, fontFamily:MONO, color:T.pos, marginTop:10}}>{fmtM(p.gan)} <span style={{fontSize:11, fontWeight:400, color:T.ink3, fontFamily:'inherit'}}>ganancia neta</span></div>
        </div>
      ))}
    </div>

    {/* DOS COLUMNAS: atención + alertas */}
    <div style={{display:'flex', gap:14, marginTop:28, alignItems:'flex-start'}}>
      <div style={{flex:1.4, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
        <CardHead>Cobros atrasados</CardHead>
        {atrasadas30.length===0
          ? <Empty>Sin cobros atrasados +30 días 🎉</Empty>
          : atrasadas30.slice(0,8).map((f,i)=>(
            <div key={i} onClick={()=>goTo&&goTo('facturacion','atrasadas')}
              style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'11px 18px', borderTop:`1px solid ${T.border}`, cursor:'pointer'}}
              onMouseEnter={e=>e.currentTarget.style.background=T.surfaceAlt} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div style={{minWidth:0}}>
                <div style={{fontSize:13, color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{f['Cliente']||f['Agencia']||'—'}</div>
                <div style={{fontSize:11.5, color:T.ink3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{f['Proyecto']||''}</div>
              </div>
              <div style={{textAlign:'right', flexShrink:0, marginLeft:12, display:'flex', alignItems:'center', gap:10}}>
                <div><div style={{fontSize:13, fontFamily:MONO, color:T.ink, fontWeight:600}}>{fmt(f.monto)}</div>
                <div style={{fontSize:11, color:T.brand, fontWeight:600}}>{f.diasDesdeEvento}d</div></div>
                <button onClick={e=>{e.stopPropagation(); setCobrando(f)}} title="Registrar el cobro sin salir del Dashboard" style={{fontSize:11, padding:'5px 12px', borderRadius:7, border:'none', background:T.pos, color:'#fff', fontWeight:700, cursor:'pointer', flexShrink:0}}>Cobrar</button>
              </div>
            </div>
          ))}
      </div>

      <div style={{flex:1, display:'flex', flexDirection:'column', gap:14}}>
        <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
          <CardHead>Listo para facturar</CardHead>
          {parafacturar.length===0
            ? <Empty>Nada pendiente de facturar 🎉</Empty>
            : parafacturar.slice(0,6).map((x,i)=>(
              <div key={i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, padding:'10px 18px', borderTop:`1px solid ${T.border}`}}>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:13, color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{x.p['Cliente']||x.p['Agencia']||'—'}</div>
                  <div style={{fontSize:11.5, color:T.ink3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{x.p['Proyecto']||''}</div>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:9, flexShrink:0}}>
                  <span style={{fontSize:12.5, fontFamily:MONO, color:T.ink, fontWeight:600}}>{fmt(x.pendiente)}</span>
                  <button onClick={()=>setFacturando(x)} title="Crear la factura sin salir del Dashboard" style={{fontSize:11, padding:'5px 12px', borderRadius:7, border:'none', background:T.brand, color:'#fff', fontWeight:700, cursor:'pointer'}}>Facturar</button>
                </div>
              </div>
            ))}
        </div>
        <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
          <CardHead>Necesita atención</CardHead>
          {alertas.length===0
            ? <Empty>Todo en orden ✓</Empty>
            : alertas.map((a,i)=>(
              <div key={i} onClick={()=>a.to&&goTo&&goTo(a.to,a.filtro)} style={{display:'flex', gap:10, alignItems:'flex-start', padding:'11px 18px', borderTop:`1px solid ${T.border}`, cursor:a.to?'pointer':'default'}}
                onMouseEnter={e=>{if(a.to)e.currentTarget.style.background=T.surfaceAlt}} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <span style={{width:7,height:7,borderRadius:7,marginTop:5,flexShrink:0,background:a.sev==='brand'?T.brand:T.warn}}/>
                <span style={{fontSize:12.5, color:T.ink2, lineHeight:1.4, flex:1}}>{a.txt}</span>
                {a.to && <span style={{fontSize:12, color:T.ink3}}>→</span>}
              </div>
            ))}
        </div>
        <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
          <CardHead>Top clientes {anioActual}</CardHead>
          {topClientes.map(([c,m],i)=>(
            <div key={i} style={{display:'flex', justifyContent:'space-between', padding:'9px 18px', borderTop:`1px solid ${T.border}`}}>
              <span style={{fontSize:12.5, color:T.ink}}>{c}</span>
              <span style={{fontSize:12.5, fontFamily:MONO, color:T.ink2}}>{fmtM(m)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  {cobrando && <CobroModal f={cobrando} cuentas={cuentas} onClose={()=>setCobrando(null)} onRefresh={onRefresh} showToast={showToast}/>}
  {facturando && <NuevaFactura pendientes={parafacturar} agencias={data.agencias||[]} contactos={data.contactos||[]} initialSel={facturando} onClose={()=>setFacturando(null)} onCreada={()=>{ setFacturando(null); if(onRefresh) onRefresh() }} showToast={showToast}/>}
  </>
}

// ============================ PRESUPUESTOS ============================
const ESTADOS_DOT = {
  'APROBADO':{c:T.pos,l:'Aprobado'},
  'EN CURSO':{c:T.pos,l:'En curso'},
  'ENTREGADO':{c:T.ink3,l:'Entregado'},
  'EN ESPERA':{c:T.warn,l:'En espera'},
  'DESAPROBADO':{c:T.brand,l:'Desaprobado'},
  'REPRESUPUESTADO':{c:T.ink3,l:'Represup.'},
}
const estadoInfo = e => ESTADOS_DOT[String(e||'').toUpperCase()] || {c:T.warn,l:e||'—'}

// ── Por qué se cayó un trabajo ────────────────────────────────────────────────
// Desaprobar sin motivo deja el dato muerto: de 194 desaprobados históricos solo 7
// tenían el porqué cargado, así que no se puede analizar nada. Este modal lo pide
// siempre; se guarda en PRESUPUESTOS col AY (Motivo Desaprobado) vía /api/presupuesto-estado.
// A nivel módulo a propósito: adentro de otro componente el textarea pierde el foco
// a cada tecla (ver [[project_bug_inputs_pierden_foco]]).
// Los de represupuestar salen de contar los 100 motivos que ya estaban escritos a mano:
// 28% error propio de cotización, 28% el cliente cambió el pedido, 20% pidió bajar el
// precio, 3% la comisión. "Error en la cotización" es el que más importa y el que no
// estaba — es el único de la lista que no depende del cliente. Se llama así y no
// "nos equivocamos" a propósito: si suena a culpa nadie lo tilda y el dato se pierde.
const MOTIVOS_DESAPROBADO = ['Precio alto','No contestaron','No lo seguimos a tiempo','Eligió otra productora','Se suspendió el evento','Fecha no disponible','Lo hizo in-house']
const MOTIVOS_REPRESUPUESTADO = ['Error en la cotización','El cliente cambió el pedido','El cliente pidió bajar el precio','Cambió la fecha','Cambió la comisión','Duplicado']
// ── Saldos de CUENTAS ──────────────────────────────────────────────────────
// Cuenta en dólares: el saldo vive en "Saldo USD" (la col "Saldo actual" queda en 0 para no ensuciar la caja).
const esCuentaUsd = c => /d[oó]lar|usd/i.test(String(c?.['Tipo']||''))
// Última vez que alguien cargó el saldo mirando el banco = última línea de "Hist saldos"
// (solo la escribe cuenta-saldo-update; los cobros/pagos automáticos no la tocan).
const ultimoChequeoCuenta = c => { const lineas=String(c?.['Hist saldos']||'').trim().split('\n').filter(Boolean); const m=(lineas[lineas.length-1]||'').match(/^(\d{1,2}\/\d{1,2}\/\d{4})/); return m?parseD(m[1]):null }

// Editor de saldos del Dashboard: un input por cuenta activa, lo que ves en el home banking tal cual.
// Escribe CUENTAS (Saldo actual / Saldo USD + fecha + Hist saldos) vía cuenta-saldo-update, solo lo que cambió.
// Vive a nivel módulo: si se define adentro de Dashboard, los inputs pierden el foco a cada tecla.
function SaldosEditor({cuentas, onClose, onSaved, showToast}){
  const [vals,setVals]=useState(()=>Object.fromEntries(cuentas.map(c=>[c['Nombre'], numAMontoAR(esCuentaUsd(c)?parseMonto(c['Saldo USD']):parseMonto(c['Saldo actual']))])))
  const [saving,setSaving]=useState(false)
  const actualDe = c => esCuentaUsd(c)?parseMonto(c['Saldo USD']):parseMonto(c['Saldo actual'])
  const cambiados = cuentas.filter(c=>Math.abs(parseMontoAR(vals[c['Nombre']])-actualDe(c))>=0.005)
  const totalPesos = cuentas.filter(c=>!esCuentaUsd(c)).reduce((s,c)=>s+parseMontoAR(vals[c['Nombre']]),0)
  const guardar=async()=>{
    if(cambiados.length===0){ showToast('No cambiaste ningún saldo'); onClose(); return }
    setSaving(true)
    let ok=0, err=0
    for(const c of cambiados){
      const nuevo=parseMontoAR(vals[c['Nombre']])
      const body=esCuentaUsd(c)?{nombre:c['Nombre'], saldoUsd:nuevo}:{nombre:c['Nombre'], saldoArs:nuevo}
      try{
        const r=await fetch('/api/cuenta-saldo-update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
        const j=await r.json()
        if(j.ok) ok++; else { err++; showToast(`${c['Nombre']}: ${j.error||'error'}`,'err') }
      }catch(e){ err++; showToast(`${c['Nombre']}: error de conexión`,'err') }
    }
    setSaving(false)
    if(ok>0) showToast(ok===1?'1 saldo actualizado en CUENTAS':`${ok} saldos actualizados en CUENTAS`)
    if(err===0) onSaved()
  }
  return <div>
    {cuentas.map((c,i)=>{ const enUsd=esCuentaUsd(c); return (
      <div key={c['Nombre']} style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, padding:'6px 0', borderTop:i===0?'none':`1px solid ${T.border}`}}>
        <div><div style={{fontSize:13, color:T.ink, fontWeight:500}}>{c['Nombre']}</div><div style={{fontSize:11, color:T.ink3}}>en la app: {enUsd?'USD '+fmt(actualDe(c)):fmtS(actualDe(c))}</div></div>
        <div style={{display:'flex', alignItems:'center', gap:6}}>
          <span style={{fontSize:12, color:T.ink3, fontFamily:MONO}}>{enUsd?'USD':'$'}</span>
          <MontoInput value={vals[c['Nombre']]} onChange={v=>setVals(s=>({...s,[c['Nombre']]:v}))} disabled={saving} placeholder="0" style={{...inpV2, width:150, textAlign:'right', fontFamily:MONO}}/>
        </div>
      </div>
    )})}
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8, marginTop:10, paddingTop:10, borderTop:`1px solid ${T.border}`}}>
      <span style={{fontSize:12.5, color:T.ink2}}>En caja quedaría <b style={{fontFamily:MONO, color:T.ink}}>{fmtS(totalPesos)}</b>{cambiados.length>0&&<span style={{color:T.ink3}}> · {cambiados.length} {cambiados.length===1?'cuenta cambia':'cuentas cambian'}</span>}</span>
      <div style={{display:'flex', gap:8}}>
        <button style={miniBtn} onClick={onClose} disabled={saving}>Cancelar</button>
        <button style={{...miniBtn, background:T.brand, color:'#fff', border:'none', fontWeight:600, opacity:saving?0.6:1}} onClick={guardar} disabled={saving}>{saving?'Guardando…':'Guardar saldos'}</button>
      </div>
    </div>
    <div style={{fontSize:11, color:T.ink3, marginTop:8}}>Copiá el saldo del home banking tal cual. Queda en la solapa CUENTAS con fecha, quién lo cargó y el historial.</div>
  </div>
}

function MotivoEstadoModal({num, estado, saving, onClose, onConfirm}){
  const [motivo,setMotivo]=useState('')
  const esDes = estado==='DESAPROBADO'
  const chips = esDes ? MOTIVOS_DESAPROBADO : MOTIVOS_REPRESUPUESTADO
  const color = esDes ? T.brand : T.ink2
  return <div onClick={()=>!saving&&onClose()} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:950, display:'flex', alignItems:'center', justifyContent:'center', padding:20}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:470, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)'}}>
      <div style={{padding:'16px 22px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', gap:10}}>
        <span style={{width:8,height:8,borderRadius:8,background:color}}/>
        <span style={{fontSize:15.5, fontWeight:700, color:T.ink}}>{esDes?'Desaprobar':'Marcar represupuestado'} #{num}</span>
        <div style={{flex:1}}/>
        <button onClick={onClose} disabled={saving} style={{border:'none', background:'transparent', fontSize:22, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
      </div>
      <div style={{padding:'18px 22px'}}>
        <div style={{fontSize:12.5, color:T.ink2, marginBottom:10}}>{esDes?'¿Por qué no salió? Elegí una o escribí el detalle.':'¿Por qué se rehace?'} <span style={{color:T.ink3}}>Queda en el sheet para poder analizarlo después.</span></div>
        <div style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:11}}>
          {chips.map(m=>{ const sel=motivo===m
            return <button key={m} onClick={()=>setMotivo(sel?'':m)} style={{padding:'6px 12px', borderRadius:20, fontSize:12, cursor:'pointer', border:`1px solid ${sel?color:T.border}`, background:sel?(esDes?T.brandSoft:T.surfaceAlt):T.surface, color:sel?color:T.ink2, fontWeight:sel?600:400}}>{m}</button>
          })}
        </div>
        <textarea autoFocus value={motivo} onChange={e=>setMotivo(e.target.value)}
          placeholder={esDes?'Ej: quedamos $200k arriba de la otra productora':'Ej: el cliente pidió sumar una cámara'}
          style={{...inpV2, minHeight:64, resize:'vertical', fontFamily:'inherit', boxSizing:'border-box'}}/>
      </div>
      <div style={{padding:'13px 22px', borderTop:`1px solid ${T.border}`, display:'flex', gap:10, justifyContent:'flex-end'}}>
        <button onClick={onClose} disabled={saving} style={miniBtn}>Cancelar</button>
        <button onClick={()=>onConfirm(motivo.trim())} disabled={saving||!motivo.trim()}
          style={{padding:'8px 20px', borderRadius:8, border:'none', background:motivo.trim()?color:T.ink3, color:'#fff', fontSize:12.5, fontWeight:600, cursor:motivo.trim()?'pointer':'default', opacity:saving?0.6:1}}>
          {saving?'Guardando…':(esDes?'Desaprobar':'Confirmar')}</button>
      </div>
    </div>
  </div>
}

// ── Seguimiento comercial: "hablé con el cliente" ─────────────────────────────
// Un presupuesto en espera solo tenía la fecha en que se armó; no se distinguía "lo están
// viendo" de "nadie lo volvió a llamar". Esto anota qué pasó y cuándo volver a llamar.
// Los chips existen para que después se pueda contar por qué se demoran (escritos a mano
// cada uno sale distinto). Lo que se guarda: Último contacto = hoy · Próximo paso = chip + nota
// · Seguir el = la fecha. Historial completo en LOG.
const SEG_CHIPS = ['Lo están viendo','Sin respuesta, insistí','Piden ajustar el precio','Esperan al cliente final','Confirman esta semana','Cambió la fecha']
function SeguimientoModal({p, saving, onClose, onConfirm}){
  const s = segDe(p)
  const [chip,setChip]=useState(''), [nota,setNota]=useState('')
  const hoy=new Date(); hoy.setHours(0,0,0,0)
  const masDias=n=>{ const d=new Date(hoy); d.setDate(d.getDate()+n); return d }
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const [seguir,setSeguir]=useState(iso(masDias(DIAS_SEGUIMIENTO)))
  const evento=parseFechaAny(p['Fecha Evento'])
  const texto=[chip, nota.trim()].filter(Boolean).join(' · ')
  const seguirD=seguir?new Date(seguir+'T00:00:00'):null
  const atajos=[[2,'en 2 días'],[DIAS_SEGUIMIENTO,`en ${DIAS_SEGUIMIENTO} días`],[7,'en 1 semana']]
  return <div onClick={()=>!saving&&onClose()} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:950, display:'flex', alignItems:'center', justifyContent:'center', padding:20}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:490, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)'}}>
      <div style={{padding:'16px 22px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', gap:10}}>
        <span style={{fontSize:16}}>📞</span>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:15.5, fontWeight:700, color:T.ink}}>Hablé con el cliente · #{p['Columna 1']}</div>
          <div style={{fontSize:12, color:T.ink3, marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{p['Cliente']||p['Agencia']} — {p['Proyecto']||'sin nombre'}{p['Contacto']?` · ${p['Contacto']}`:''}{evento?` · evento ${fechaDDMMYYYY(evento)}`:''}</div>
        </div>
        <button onClick={onClose} disabled={saving} style={{border:'none', background:'transparent', fontSize:22, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
      </div>
      <div style={{padding:'16px 22px'}}>
        <div style={{fontSize:12, color:T.ink3, marginBottom:12}}>{s.nunca
          ? <>Nadie lo llamó desde que se mandó{s.dPre!==null?` (hace ${s.dPre} días)`:''}.</>
          : <>Último contacto hace {s.dUlt} días{s.paso?<>: <span style={{color:T.ink2}}>{s.paso}</span></>:null}.</>}</div>
        <div style={{fontSize:12.5, color:T.ink2, marginBottom:8}}>¿Qué pasó?</div>
        <div style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:10}}>
          {SEG_CHIPS.map(m=>{ const sel=chip===m
            return <button key={m} onClick={()=>setChip(sel?'':m)} style={{padding:'6px 12px', borderRadius:20, fontSize:12, cursor:'pointer', border:`1px solid ${sel?T.ink:T.border}`, background:sel?T.ink:T.surface, color:sel?'#fff':T.ink2, fontWeight:sel?600:400}}>{m}</button>
          })}
        </div>
        <textarea autoFocus value={nota} onChange={e=>setNota(e.target.value)} placeholder="Y qué sigue. Ej: lo ve con su jefa el jueves · pide versión con 1 cámara"
          style={{...inpV2, minHeight:56, resize:'vertical', fontFamily:'inherit', boxSizing:'border-box'}}/>
        <div style={{fontSize:12.5, color:T.ink2, margin:'16px 0 8px'}}>Volver a llamar el</div>
        <div style={{display:'flex', gap:6, flexWrap:'wrap', alignItems:'center'}}>
          {atajos.map(([n,l])=>{ const d=masDias(n), sel=seguir===iso(d)
            return <button key={n} onClick={()=>setSeguir(iso(d))} style={{padding:'6px 12px', borderRadius:20, fontSize:12, cursor:'pointer', border:`1px solid ${sel?T.ink:T.border}`, background:sel?T.ink:T.surface, color:sel?'#fff':T.ink2, fontWeight:sel?600:400}}>{l}</button>
          })}
          <input type="date" value={seguir} onChange={e=>setSeguir(e.target.value)} style={{...inpV2, width:'auto', padding:'6px 10px', fontSize:12.5}}/>
        </div>
        {evento && seguirD && seguirD>evento && <div style={{fontSize:12, color:T.warn, marginTop:8}}>Ojo: esa fecha es después del evento ({fechaDDMMYYYY(evento)}).</div>}
      </div>
      <div style={{padding:'13px 22px', borderTop:`1px solid ${T.border}`, display:'flex', gap:10, justifyContent:'flex-end', alignItems:'center'}}>
        <span style={{fontSize:11.5, color:T.ink3, marginRight:'auto'}}>Queda en PRESUPUESTOS y en la diaria de mañana.</span>
        <button onClick={onClose} disabled={saving} style={miniBtn}>Cancelar</button>
        <button onClick={()=>onConfirm({proximoPaso:texto, seguirEl:seguirD?fechaDDMMYYYY(seguirD):''})} disabled={saving||!texto}
          style={{padding:'8px 20px', borderRadius:8, border:'none', background:texto?T.brand:T.ink3, color:'#fff', fontSize:12.5, fontWeight:600, cursor:texto?'pointer':'default', opacity:saving?0.6:1}}>
          {saving?'Guardando…':'Anotar'}</button>
      </div>
    </div>
  </div>
}
// El chip de la fila: cuánto hace que no se habla y si toca llamar. Un clic abre el modal.
function SegChip({p, onClick, corto}){
  const s = segDe(p)
  const fmtDM = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
  const label = s.toca ? (s.nunca ? (corto?`📞 ${s.dPre??'?'}d`:`📞 sin llamar · ${s.dPre??'?'}d`) : (corto?`📞 ${s.dUlt}d`:`📞 hace ${s.dUlt}d`))
    : s.seguir ? `⏳ ${fmtDM(s.seguir)}` : `✓ ${s.dUlt}d`
  const title = s.toca ? (s.nunca ? `Nadie lo llamó desde que se mandó (hace ${s.dPre} días). Clic para anotar que hablaste.` : `Último contacto hace ${s.dUlt} días${s.paso?`: ${s.paso}`:''}. Clic para anotar.`)
    : s.seguir ? `Seguir el ${fechaDDMMYYYY(s.seguir)}${s.paso?` · ${s.paso}`:''}` : `Hablaste hace ${s.dUlt} días${s.paso?`: ${s.paso}`:''}`
  return <span onClick={e=>{e.stopPropagation(); onClick()}} title={title} style={{display:'inline-flex', alignItems:'center', justifyContent:'flex-end', gap:4, fontSize:11.5, fontFamily:MONO, padding:'3px 8px', borderRadius:20, cursor:'pointer', whiteSpace:'nowrap',
    background:s.toca?T.brandSoft:T.surfaceAlt, color:s.toca?T.brand:T.ink2, border:`1px solid ${s.toca?T.brand+'55':T.border}`, fontWeight:s.toca?600:500}}>{label}</span>
}

// ── Por qué se caen los trabajos ──────────────────────────────────────────────
// Desaprobado y represupuestado NO son lo mismo y no se suman: el desaprobado es
// plata que se perdió, el represupuestado se rehizo y sigue vivo en otra versión.
// Cada panel mira sólo lo suyo. Los motivos se agrupan normalizados (los chips ya
// vienen iguales; lo escrito a mano se agrupa por texto en minúscula).
function AnalisisMotivos({presus, esDesaprobado}){
  const monto = p => parseMonto(p['Precio Final'])
  const total = presus.reduce((s,p)=>s+monto(p),0)
  const grupos = new Map()
  let sinMotivo=0, sinMotivoMonto=0
  presus.forEach(p=>{
    const m = String(p['Motivo Desaprobado']||'').trim()
    if(!m){ sinMotivo++; sinMotivoMonto+=monto(p); return }
    const k = m.toLowerCase()
    const g = grupos.get(k) || {label:m, n:0, monto:0}
    g.n++; g.monto+=monto(p)
    if(m.length<g.label.length) g.label=m   // el más corto suele ser el chip
    grupos.set(k,g)
  })
  const todos = [...grupos.values()].sort((a,b)=>b.monto-a.monto)
  // Los motivos viejos son texto libre y casi no se repiten (99 represupuestados
  // dieron ~100 textos distintos). Se muestran los 8 más pesados y el resto junto.
  const ranking = todos.slice(0,8)
  const resto = todos.slice(8)
  const restoN = resto.reduce((s,g)=>s+g.n,0), restoMonto = resto.reduce((s,g)=>s+g.monto,0)
  const conMotivo = presus.length-sinMotivo
  const cobertura = presus.length ? Math.round(conMotivo/presus.length*100) : 0
  const maxMonto = ranking.length ? ranking[0].monto : 1
  const color = esDesaprobado ? T.brand : T.ink2

  // Quién carga el motivo y quién no. Es el dato para la charla con el equipo:
  // si un PM tiene 0% no es que no pierda trabajos, es que no los anota.
  const porPM = new Map()
  presus.forEach(p=>{
    const pm = String(p['PM Interno']||'').trim() || '—'
    const g = porPM.get(pm) || {n:0, con:0}
    g.n++; if(String(p['Motivo Desaprobado']||'').trim()) g.con++
    porPM.set(pm,g)
  })
  const pms = [...porPM.entries()].filter(([,g])=>g.n>=3).sort((a,b)=>(a[1].con/a[1].n)-(b[1].con/b[1].n))

  if(!presus.length) return null
  return <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:'16px 18px', marginBottom:14}}>
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', flexWrap:'wrap', gap:8, marginBottom:14}}>
      <div style={{fontSize:14, fontWeight:700, color:T.ink}}>{esDesaprobado?'Por qué no salieron':'Por qué se rehicieron'}</div>
      <div style={{fontSize:12.5, color:T.ink2}}>{presus.length} {presus.length===1?'trabajo':'trabajos'} · <span style={{fontFamily:MONO, color:esDesaprobado?T.brand:T.ink}}>{fmt(total)}</span></div>
    </div>

    {conMotivo===0
      ? <div style={{fontSize:12.5, color:T.warn, background:T.warnSoft, borderRadius:9, padding:'11px 13px'}}>
          Ninguno tiene el motivo cargado, así que no hay nada para analizar todavía. Se pide solo al desaprobar desde el Calendario o desde acá.
        </div>
      : <>
        {ranking.map((g,i)=>(
          <div key={i} style={{marginBottom:9}}>
            <div style={{display:'flex', justifyContent:'space-between', fontSize:12.5, marginBottom:3}}>
              <span style={{color:T.ink}}>{g.label}</span>
              <span style={{color:T.ink2}}><span style={{fontFamily:MONO, color:T.ink}}>{fmt(g.monto)}</span> <span style={{color:T.ink3}}>· {g.n}</span></span>
            </div>
            <div style={{height:6, borderRadius:6, background:T.surfaceAlt, overflow:'hidden'}}>
              <div style={{height:'100%', width:`${Math.max(2,Math.round(g.monto/maxMonto*100))}%`, background:color, opacity:1-i*0.12, borderRadius:6}}/>
            </div>
          </div>
        ))}
        {restoN>0 && <div style={{display:'flex', justifyContent:'space-between', fontSize:12, color:T.ink3, marginTop:2}}>
          <span>otros {resto.length} motivos</span><span><span style={{fontFamily:MONO}}>{fmt(restoMonto)}</span> · {restoN}</span>
        </div>}
        {sinMotivo>0 && <div style={{marginTop:12, paddingTop:11, borderTop:`1px solid ${T.border}`, fontSize:12.5, color:T.ink2}}>
          <strong style={{color:T.ink}}>{sinMotivo}</strong> sin motivo cargado (<span style={{fontFamily:MONO}}>{fmt(sinMotivoMonto)}</span>) — el análisis de arriba cubre el <strong style={{color:T.ink}}>{cobertura}%</strong>.
        </div>}
      </>}

    {pms.length>0 && conMotivo>0 && <div style={{marginTop:13, paddingTop:12, borderTop:`1px solid ${T.border}`}}>
      <div style={{fontSize:10.5, fontWeight:600, textTransform:'uppercase', letterSpacing:0.4, color:T.ink3, marginBottom:8}}>Quién lo está anotando</div>
      <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
        {pms.map(([pm,g])=>{ const pct=Math.round(g.con/g.n*100)
          return <span key={pm} style={{fontSize:12, padding:'4px 10px', borderRadius:20, border:`1px solid ${T.border}`, background:pct===0?T.warnSoft:T.surface, color:pct===0?T.warn:T.ink2}}>
            {pm} <strong style={{color:pct===0?T.warn:T.ink}}>{pct}%</strong> <span style={{color:T.ink3}}>({g.con}/{g.n})</span>
          </span>
        })}
      </div>
    </div>}
  </div>
}

// ============================ TRABAJOS ============================
// Presupuestos y Proyectos eran dos solapas para la misma cosa: los 309 aprobados
// aparecían en las dos, con las mismas cuatro columnas y el mismo "Editar datos", y no
// había un botón para pasar de una a la otra (Juan, 20/9/2026: "siento que son casi lo
// mismo"). Acá un trabajo es UNA fila que va cambiando: se cotiza, se aprueba, se le
// carga el staff, se factura. Lo que eran dos solapas ahora son vistas de esta lista.
//
// El sheet NO cambia: PRESUPUESTOS y PROYECTOS siguen siendo dos solapas y cada bloque
// escribe donde escribía (lo cotizado → PRESUPUESTOS, producción → PROYECTOS).
const VISTAS_TRABAJOS = [['todos','Todos'],['esp','En espera'],['prod','En producción'],['sinstaff','Sin staff'],['sinfact','Sin facturar'],['des','Caídos'],['rep','Represup.']]
// Con qué filtro llegan los links de antes (dashboard, facturación, buscador) y a qué vista van.
const VISTA_DE_FILTRO = {ap:'prod', cur:'prod', ok:'prod', pendiente:'sinstaff'}
const VISTAS_DE_PRODUCCION = ['prod','sinstaff','sinfact']
const GRID_TRABAJOS = '88px 1.6fr 1fr 104px 78px 96px 56px 124px'

function Trabajos({data, onRefresh, showToast, nav, clearNav, goTo}){
  const cel = useEsCelular()
  const [rows,setRows]=useState(data.presupuestos||[])
  useEffect(()=>{ setRows(data.presupuestos||[]) },[data.presupuestos])
  const presus = rows
  const proyectos = data.proyectos||[]
  const rrhh=data.rrhh||[]
  const rrhhNames=[...new Set(rrhh.map(r=>r['Nombre Apellido']||r['Nombre']).filter(Boolean))].sort()
  const serviciosConocidos=[...new Set([...getSvcs(data).map(s=>s.n), ...(data.listado?.servicios||[])])].filter(Boolean).sort()
  // La vista en la que cada uno dejó la lista queda en su navegador (es cómo mira, no un dato).
  const [vista,setVistaSt]=useState(()=>{ try{ const g=window.localStorage.getItem('trabajos-vista'); return VISTAS_TRABAJOS.some(v=>v[0]===g)?g:'todos' }catch(e){ return 'todos' } })
  const elegirVista=v=>{ setVistaSt(v); setOpen(null); try{ window.localStorage.setItem('trabajos-vista', v) }catch(e){} }
  const [q,setQ]=useState(''), [anio,setAnio]=useState('todos'), [mes,setMes]=useState('todos'), [pm,setPm]=useState('todos'), [open,setOpen]=useState(null), [tab,setTab]=useState('prod'), [editing,setEditing]=useState(null), [nuevo,setNuevo]=useState(false), [represu,setRepresu]=useState(null), [aprobAdic,setAprobAdic]=useState(null), [aprobSaving,setAprobSaving]=useState(false), [borrando,setBorrando]=useState(null), [borrSaving,setBorrSaving]=useState(false)
  const [motivoModal,setMotivoModal]=useState(null), [motivoSaving,setMotivoSaving]=useState(false)
  // Seguimiento comercial: el presupuesto al que se le anota "hablé con el cliente", y el filtro "📞 Por llamar" de En espera
  const [seg,setSeg]=useState(null), [segSaving,setSegSaving]=useState(false), [soloLlamar,setSoloLlamar]=useState(false)
  // Llegar con un número (desde Facturación, el buscador, el dashboard) abre ese trabajo.
  const [abrirQ,setAbrirQ]=useState(null)
  useEffect(()=>{ if(nav?.mod==='presupuestos'||nav?.mod==='proyectos'){
    if(nav.filtro==='__nuevo__'){ setNuevo(true) } else if(nav.filtro){ setVistaSt(VISTA_DE_FILTRO[nav.filtro]||(VISTAS_TRABAJOS.some(v=>v[0]===nav.filtro)?nav.filtro:'todos')) }
    if(nav.q){ setQ(nav.q); setVistaSt('todos'); setAbrirQ({q:nav.q, tab:nav.mod==='proyectos'?'prod':'coti'}) }
    clearNav&&clearNav() } /* eslint-disable-next-line */ },[nav])

  async function eliminarPresupuesto(){
    const p=borrando; if(!p) return
    const id=p['Columna 1']
    setBorrSaving(true)
    try{
      const r=await fetch('/api/presupuesto-eliminar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, fila:p.__row})})
      const j=await r.json()
      if(j.error){ showToast(j.error,'err'); setBorrSaving(false); if(j.recargar&&onRefresh) onRefresh(); return }
      // filtra por fila, no por número: hay N° repetidos y se borraría el de la fila equivocada
      setRows(rs=>rs.filter(rr=> p.__row ? rr.__row!==p.__row : String(rr['Columna 1'])!==String(id)))
      setBorrando(null); setBorrSaving(false); setOpen(null)
      showToast(`#${id} eliminado`)
      if(onRefresh) onRefresh()
      // Si tenía evento en Calendar, lo sacamos también
      fetch('/api/calendar-evento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, accion:'borrar'})}).catch(()=>{})
    }catch(e){ showToast('Error de conexión','err'); setBorrSaving(false) }
  }

  const [resg,setResg]=useState(null), [resgPend,setResgPend]=useState(null)   // 🔒 resguardo del cobro antes de aprobar
  async function aprobarConAdic({nuevoEsAdic, nuevoTotal, extras}){
    const p=aprobAdic; if(!p) return
    const id=p['Columna 1']
    setAprobSaving(true)
    try{
      await fetch('/api/presupuesto-editar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, cambios:{'Es Adicional':nuevoEsAdic, 'Precio Final':Math.round(nuevoTotal), 'Total':Math.round(nuevoTotal), ...(extras||{})}})})
      const r=await fetch('/api/presupuesto-estado',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, estado:'APROBADO', noCalendar:true, resguardo: resgPend?.num===id ? resgPend.r : undefined})})
      const j=await r.json(); if(j.error){ showToast(j.error,'err'); setAprobSaving(false); return }
      showToast(`#${id} aprobado`); setAprobAdic(null); setAprobSaving(false)
      if(onRefresh) onRefresh()
      fetch('/api/calendar-evento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, accion:'aprobar'})}).catch(()=>{})
    }catch(e){ showToast('Error de conexión','err'); setAprobSaving(false) }
  }

  async function guardarSeguimiento({proximoPaso, seguirEl}){
    const p=seg; if(!p) return
    const id=p['Columna 1']
    setSegSaving(true)
    try{
      const r=await fetch('/api/presupuesto-seguimiento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, fila:p.__row, proximoPaso, seguirEl})})
      const j=await r.json()
      if(j.error){ showToast(j.error,'err'); setSegSaving(false); return }
      // por fila, no por número: hay N° repetidos
      setRows(rs=>rs.map(rr=> (p.__row ? rr.__row===p.__row : String(rr['Columna 1'])===String(id)) ? {...rr, 'Último contacto':j.ultimoContacto, 'Próximo paso':j.proximoPaso, 'Seguir el':j.seguirEl} : rr))
      setSeg(null); setSegSaving(false)
      showToast(`#${id} anotado · volver a llamar el ${j.seguirEl}`)
      if(onRefresh) onRefresh()
    }catch(e){ showToast('Error de conexión','err'); setSegSaving(false) }
  }

  async function cambiarEstado(id, nuevo, actual, motivo, resguardo){
    if(String(nuevo).toUpperCase()===String(actual||'').toUpperCase()) return
    const eraActivo = ['APROBADO','EN CURSO','ENTREGADO'].includes(String(actual||'').toUpperCase())
    if(eraActivo && nuevo!=='APROBADO'){
      if(!window.confirm(`Pasar a "${estadoInfo(nuevo).l}" va a sacar este trabajo de PROYECTOS. ¿Seguro?`)) return
    }
    setRows(rs=>rs.map(r=> (String(r['Columna 1'])===String(id) ? {...r, Estado:nuevo, ...(motivo?{'Motivo Desaprobado':motivo}:{})} : r)))
    try{
      const r=await fetch('/api/presupuesto-estado',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, estado:nuevo, motivo, noCalendar:true, resguardo})})
      const j=await r.json()
      if(j.error){ showToast(j.error,'err'); setRows(rs=>rs.map(rr=>(String(rr['Columna 1'])===String(id)?{...rr,Estado:actual}:rr)))
        if(j.sinResguardo){ const p=rows.find(rr=>String(rr['Columna 1'])===String(id)); if(p) setResg(p) }   // el servidor lo exige: pedirlo
        return }
      showToast(`#${id} → ${estadoInfo(nuevo).l}`)
      if(onRefresh) onRefresh()  // refresca datos globales: producción/Facturación/Calendar quedan sincronizados
      // Calendar en segundo plano
      const accion = nuevo==='APROBADO'?'aprobar':(nuevo==='DESAPROBADO'||nuevo==='REPRESUPUESTADO')?'borrar':'pendiente'
      fetch('/api/calendar-evento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, accion})}).catch(()=>{})
    }catch(e){ showToast('Error de conexión','err'); setRows(rs=>rs.map(rr=>(String(rr['Columna 1'])===String(id)?{...rr,Estado:actual}:rr))) }
  }

  // ---- un trabajo = el presupuesto + (si está aprobado) su fila de PROYECTOS
  const tieneStaff=p=>p['Carga Staff']===true||String(p['Carga Staff']||'').toUpperCase()==='TRUE'
  // Alguien del staff avisó desde Mi Magma que no puede y sigue cargado: para la lista es un puesto sin cubrir,
  // aunque "Carga Staff" diga que sí. Entra en la vista "Sin staff" y se ve en rojo en la fila.
  const dispoTrab = useMemo(()=>leerDisponibilidad(data.disponibilidad), [data.disponibilidad])
  const hoy0Trab = useMemo(()=>{ const d=new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }, [])
  const noPuedenDeTrab = p => noPuedenDe(p, dispoTrab, hoy0Trab)
  // Un proyecto puede tener varias facturas (adelanto + saldo): las juntamos todas.
  const facByNum={}; (data.facturacion||[]).forEach(f=>{ const n=String(f['N° Presupuesto']||'').trim(); if(n && !String(f['Nro de Factura']||'').toUpperCase().startsWith('ANULADA')) (facByNum[n]||=[]).push(f) })
  const facsDe=num=>facByNum[String(num||'').trim()]||[]
  const proyByNum={}; proyectos.forEach(p=>{ proyByNum[String(p['N° presupuesto']||'').trim()]=p })
  const numsPresu=new Set(presus.map(p=>String(p['Columna 1']||'').trim()))
  const items=[
    // lo último cargado, primero (como estaba Presupuestos)
    ...presus.map(p=>{ const num=String(p['Columna 1']||p['N° presupuesto']||'').trim(), est=String(p['Estado']||'').toUpperCase()
      return {key:'r'+(p.__row??num), num, p, est, proy: est==='APROBADO' ? (proyByNum[num]||null) : null} }).reverse(),
    // Proyectos que no tienen presupuesto (viejos, cargados a mano en el sheet). Antes
    // solo se veían en Proyectos: si la lista saliera de PRESUPUESTOS nada más, desaparecían.
    ...proyectos.filter(y=>!numsPresu.has(String(y['N° presupuesto']||'').trim())).map(y=>{ const num=String(y['N° presupuesto']||'').trim(); return {key:'y'+num, num, p:null, est:'APROBADO', proy:y} }),
  ]
  const dato=(it,c)=>String((it.p?it.p[c]:'')||(it.proy?it.proy[c]:'')||'')
  const pmDe=it=>String(it.p?.['PM Interno']||it.proy?.['PM']||'')
  const totalDe=it=>it.p ? parseMonto(it.p['Precio Final']) : parseMonto(it.proy?.['Total ']||it.proy?.['Total'])

  const pms=[...new Set(items.map(pmDe).filter(Boolean))].sort()
  const anios=[...new Set(items.map(it=>(dato(it,'Fecha Evento')||dato(it,'Fecha Presupuesto')).split('/')[2]).filter(Boolean))].sort().reverse()

  const enVista=(it,v)=> v==='esp' ? it.est==='EN ESPERA'
    : v==='prod' ? ['APROBADO','EN CURSO','ENTREGADO'].includes(it.est)
    : v==='sinstaff' ? !!it.proy&&(!tieneStaff(it.proy)||noPuedenDeTrab(it.proy).length>0)
    : v==='sinfact' ? !!it.proy&&!facsDe(it.num).length
    : v==='des' ? it.est==='DESAPROBADO'
    : v==='rep' ? it.est==='REPRESUPUESTADO' : true
  const base=items.filter(it=>{
    const fe=dato(it,'Fecha Evento'), fp=dato(it,'Fecha Presupuesto')
    const mpm = pm==='todos'||pmDe(it)===pm
    const mq = !q||[it.num,dato(it,'Proyecto'),dato(it,'Cliente'),dato(it,'Agencia'),pmDe(it)].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase()))
    const manio = anio==='todos'||fe.includes(anio)||fp.includes(anio)
    const mmes = mes==='todos'||parseInt((fe||fp).split('/')[1])===parseInt(mes)
    return mpm&&mq&&manio&&mmes
  })
  // Cada vista dice cuántos tiene, sobre lo que dejaron pasar el buscador, el PM, el año y el mes.
  const cuenta={}; VISTAS_TRABAJOS.forEach(([k])=>{ cuenta[k]=base.filter(it=>enVista(it,k)).length })
  let filtered=base.filter(it=>enVista(it,vista))
  // En espera: cuántos esperan un llamado (evento por delante y pasó el día 4 sin noticias), y el filtro para ver solo esos
  const hoy0=new Date(); hoy0.setHours(0,0,0,0)
  const tocaLlamar=it=>{ if(!it.p||it.est!=='EN ESPERA') return false; const fe=parseFechaAny(it.p['Fecha Evento']); return !!fe && fe>=hoy0 && segDe(it.p).toca }
  const porLlamar=vista==='esp' ? filtered.filter(tocaLlamar) : []
  if(vista==='esp' && soloLlamar) filtered=porLlamar
  // En producción importa qué viene: lo próximo arriba, después lo que ya pasó (como estaba Proyectos).
  if(VISTAS_DE_PRODUCCION.includes(vista)) filtered=[...filtered].sort((a,b)=>{ const fa=parseD(dato(a,'Fecha Evento'))?.getTime()||0, fb=parseD(dato(b,'Fecha Evento'))?.getTime()||0; const hoy=Date.now()-864e5; const faF=fa>=hoy,fbF=fb>=hoy; if(faF&&!fbF)return -1; if(!faF&&fbF)return 1; if(faF&&fbF)return fa-fb; return fb-fa })

  useEffect(()=>{ if(!abrirQ||q!==abrirQ.q) return
    const exactos=filtered.filter(it=>it.num===String(abrirQ.q).trim()), uno=exactos.length===1?exactos[0]:filtered.length===1?filtered[0]:null
    if(uno){ setOpen(uno.key); setTab(abrirQ.tab) }
    setAbrirQ(null) /* eslint-disable-next-line */ },[abrirQ,q])

  const abrirFila=it=>{ if(open===it.key){ setOpen(null); return } setOpen(it.key); setTab(it.proy?'prod':'coti') }
  const onEstado=(it,nuevo)=>{ const p=it.p, id=it.num
    if(nuevo==='APROBADO' && necesitaResguardo(p, data.agencias, data.clientes)) return setResg(p)   // 🔒 seña u OC primero
    return nuevo==='REPRESUPUESTADO' ? setRepresu(p) : nuevo==='DESAPROBADO' ? setMotivoModal({num:id, estado:'DESAPROBADO', actual:p['Estado']}) : (nuevo==='APROBADO' && presuTieneOpciones(p)) ? setAprobAdic(p) : cambiarEstado(id, nuevo, p['Estado']) }

  return <>
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:22, gap:12}}>
      <div><h1 style={{fontSize:23, fontWeight:700, color:T.ink, margin:0, letterSpacing:-0.3}}>Trabajos</h1><div style={{fontSize:13, color:T.ink3, marginTop:3}}>{filtered.length} de {items.length} · del presupuesto a la factura, en una sola lista</div></div>
      <button onClick={()=>setNuevo(true)} style={{padding:'10px 18px', borderRadius:10, border:'none', background:T.brand, color:'#fff', fontSize:13.5, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap'}}>+ Nuevo presupuesto</button>
    </div>

    {/* Filtros */}
    <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', marginBottom:16}}>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar N°, cliente, proyecto, agencia, PM…"
        style={{flex:'1 1 260px', minWidth:200, padding:'9px 13px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13, outline:'none'}}/>
      <select value={pm} onChange={e=>setPm(e.target.value)} style={selectStyle}><option value="todos">Todos los PM</option>{pms.map(p=><option key={p} value={p}>{p}</option>)}</select>
      <select value={anio} onChange={e=>setAnio(e.target.value)} style={selectStyle}><option value="todos">Año</option>{anios.map(a=><option key={a} value={a}>{a}</option>)}</select>
      <select value={mes} onChange={e=>setMes(e.target.value)} style={selectStyle}><option value="todos">Mes</option>{MESES_LARGO.map((m,i)=><option key={i} value={i+1}>{m}</option>)}</select>
    </div>

    {/* Las vistas: lo que antes eran dos solapas y sus chips */}
    {cel
      ? <select value={vista} onChange={e=>elegirVista(e.target.value)} style={{...selectStyle, width:'100%', marginBottom:14, padding:'10px 11px', fontSize:13}}>
          {VISTAS_TRABAJOS.map(([k,l])=><option key={k} value={k}>{l} ({cuenta[k]})</option>)}
        </select>
      : <div style={{display:'flex', gap:7, marginBottom:14, flexWrap:'wrap'}}>
          {VISTAS_TRABAJOS.map(([k,l])=>(
            <button key={k} onClick={()=>elegirVista(k)} style={{
              padding:'6px 13px', borderRadius:20, fontSize:12, fontWeight:500, cursor:'pointer',
              border:`1px solid ${vista===k?T.ink:T.border}`,
              background:vista===k?T.ink:T.surface, color:vista===k?'#fff':T.ink2,
            }}>{l} <span style={{fontFamily:MONO, opacity:0.65, marginLeft:3}}>{cuenta[k]}</span></button>
          ))}
        </div>}

    {/* El porqué, sobre lo que esté filtrado (año/mes/PM valen) */}
    {(vista==='des'||vista==='rep') && <AnalisisMotivos presus={filtered.map(it=>it.p).filter(Boolean)} esDesaprobado={vista==='des'}/>}

    {/* En espera: la lista de llamados del día. Mismo criterio que la diaria de las 8. */}
    {vista==='esp' && <div style={{display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:12, fontSize:12.5, color:T.ink2}}>
      <button onClick={()=>setSoloLlamar(v=>!v)} style={{padding:'6px 13px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer', border:`1px solid ${soloLlamar?T.brand:T.brand+'66'}`, background:soloLlamar?T.brand:T.brandSoft, color:soloLlamar?'#fff':T.brand}}>
        📞 Por llamar <span style={{fontFamily:MONO, opacity:0.8, marginLeft:3}}>{porLlamar.length}</span>{porLlamar.length ? <span style={{fontFamily:MONO, opacity:0.8, marginLeft:6}}>{fmt(porLlamar.reduce((s,it)=>s+totalDe(it),0))}</span> : null}
      </button>
      <span style={{color:T.ink3}}>{porLlamar.length ? `Evento por delante y ${DIAS_SEGUIMIENTO} días sin noticias (o llegó la fecha de "Seguir el"). Tocá el 📞 de la fila cuando hables.` : 'Nadie espera un llamado: todos con seguimiento al día ✓'}</span>
    </div>}

    {/* Tabla */}
    <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
      {!cel && <div style={{display:'grid', gridTemplateColumns:GRID_TRABAJOS, gap:0, padding:'11px 18px', borderBottom:`1px solid ${T.border}`, fontSize:10.5, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3}}>
        <span>Evento</span><span>Proyecto</span><span>Cliente</span><span style={{textAlign:'right'}}>Total</span><span style={{textAlign:'right'}}>{vista==='esp'?'':'Staff'}</span><span style={{textAlign:'right'}}>{vista==='esp'?'Llamar':'Factura'}</span><span style={{textAlign:'right'}}>{vista==='esp'?'':'Drive'}</span><span style={{textAlign:'right'}}>Estado</span>
      </div>}
      {filtered.length===0 && <Empty>Sin resultados</Empty>}
      {filtered.slice(0,200).map((it,i)=>{
        const {p, proy:y, num}=it
        const abierto = open===it.key
        const noPueden = y ? noPuedenDeTrab(y) : []
        const ok = y&&tieneStaff(y)&&!noPueden.length
        // Con adelanto + saldo el proyecto tiene 2 facturas: mostramos cuántas se cobraron
        // ("1/2 cobr.") en vez de decir "Cobrada" porque entró la seña.
        const facs=y?facsDe(num):[], cobradas=facs.filter(isCobrada).length
        const facInfo = !facs.length ? {c:T.brand,l:'Sin fact.'}
          : facs.length>1 ? {c:cobradas===facs.length?T.pos:T.warn, l:`${cobradas}/${facs.length} cobr.`}
          : cobradas ? {c:T.pos,l:'Cobrada'} : {c:T.warn,l:'Facturada'}
        const celdaStaff = y
          ? <span title={noPueden.length?`Avisó que no puede: ${noPueden.map(l=>l.nombre).join(', ')}. Sigue cargado hasta que pongas a otra persona.`:undefined} style={{display:'flex', alignItems:'center', justifyContent:'flex-end', gap:5}}><span style={{width:7,height:7,borderRadius:7,background:noPueden.length?T.brand:ok?T.pos:T.warn}}/><span style={{fontSize:11.5, color:noPueden.length?T.brand:T.ink2, fontWeight:noPueden.length?600:400}}>{noPueden.length?`No puede: ${noPueden.map(l=>String(l.nombre).split(' ')[0]).join(', ')}`:cel?(ok?'Staff OK':'Sin staff'):(ok?'OK':'Pend.')}</span></span>
          : it.est==='APROBADO' ? <span title="Está aprobado pero todavía no tiene fila en PROYECTOS. Si recién lo aprobaste, aparece al actualizar." style={{fontSize:11, color:T.ink3, textAlign:'right'}}>sin proyecto</span> : (cel?null:<span/>)
        // Un presupuesto en espera no tiene factura: en esa celda va el seguimiento (📞 cuánto hace que no se habla).
        const enEspera = !!p && it.est==='EN ESPERA'
        const celdaFac = y
          ? <span onClick={goTo?e=>{e.stopPropagation(); goTo('facturacion',{q:String(num)})}:undefined} title={goTo?'Ver en Facturación':undefined} style={{display:'flex', alignItems:'center', justifyContent:'flex-end', gap:5, cursor:goTo?'pointer':undefined}}><span style={{width:7,height:7,borderRadius:7,background:facInfo.c}}/><span style={{fontSize:11.5, color:T.ink2}}>{facInfo.l}</span></span>
          : enEspera ? <span style={{display:'flex', justifyContent:'flex-end'}}><SegChip p={p} corto={!cel} onClick={()=>setSeg(p)}/></span>
          : (cel?null:<span/>)
        // Las carpetas del proyecto a un clic, sin abrir nada: 📁 crudo, 📸 lo que se le manda al cliente
        const celdaDrive = y
          ? <span onClick={e=>e.stopPropagation()} style={{display:'flex', alignItems:'center', justifyContent:'flex-end', gap:6, fontSize:14}}>
              {y['Drive Crudo'] && <a href={y['Drive Crudo']} target="_blank" rel="noreferrer" title="Crudo (lo que se filmó)" style={{textDecoration:'none'}}>📁</a>}
              {(y['Drive Finales']||y['Drive Entrega']) && <a href={y['Drive Finales']||y['Drive Entrega']} target="_blank" rel="noreferrer" title={y['Drive Finales']?'Finales: lo que se le manda al cliente':'Carpeta de entrega'} style={{textDecoration:'none'}}>📸</a>}
              {!y['Drive Crudo'] && !y['Drive Entrega'] && <span title="Sin carpetas en Drive todavía" style={{fontSize:11, color:T.ink3}}>—</span>}
            </span>
          : (cel?null:<span/>)
        const celdaEstado = p
          ? <EstadoSelect value={p['Estado']} onChange={nuevo=>onEstado(it,nuevo)}/>
          : <span title="Está en PROYECTOS pero no tiene presupuesto cargado" style={{fontSize:11, color:T.ink3, textAlign:'right'}}>sin presupuesto</span>
        const proyecto = dato(it,'Proyecto') || <em style={{color:T.ink3, fontStyle:'normal'}}>sin nombre</em>
        const dosCaras = !!(p&&y), tabActual = dosCaras ? tab : (y?'prod':'coti')
        return <div key={it.key+'_'+i}>
          {cel
            ? <div onClick={()=>abrirFila(it)} style={{padding:'12px 14px', borderTop:i===0?'none':`1px solid ${T.border}`, cursor:'pointer', background:abierto?T.surfaceAlt:'transparent'}}>
                <div style={{display:'flex', justifyContent:'space-between', gap:10, alignItems:'baseline'}}>
                  <span style={{fontSize:13.5, fontWeight:600, color:T.ink, flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{proyecto}</span>
                  <span style={{fontFamily:MONO, fontSize:12.5, color:T.ink}}>{fmt(totalDe(it))}</span>
                </div>
                <div style={{fontSize:12, color:T.ink2, marginTop:2}}>{dato(it,'Fecha Evento')||'—'} · {dato(it,'Cliente')||dato(it,'Agencia')||'—'} · #{num}</div>
                <div style={{display:'flex', gap:12, alignItems:'center', marginTop:7, flexWrap:'wrap'}}>{celdaEstado}{celdaStaff}{celdaFac}{celdaDrive}</div>
              </div>
            : <div onClick={()=>abrirFila(it)} style={{display:'grid', gridTemplateColumns:GRID_TRABAJOS, gap:0, padding:'12px 18px', borderTop:i===0?'none':`1px solid ${T.border}`, cursor:'pointer', alignItems:'center', background:abierto?T.surfaceAlt:'transparent', fontSize:13}}
                onMouseEnter={e=>{if(!abierto)e.currentTarget.style.background=T.surfaceAlt}} onMouseLeave={e=>{if(!abierto)e.currentTarget.style.background='transparent'}}>
                <span style={{fontSize:12, color:T.ink2}}>{dato(it,'Fecha Evento')||'—'}</span>
                <span style={{color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:10}}>{proyecto}</span>
                <span style={{color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:10}}>{dato(it,'Cliente')||'—'}</span>
                <span style={{textAlign:'right', fontFamily:MONO, fontSize:12.5, color:T.ink}}>{fmt(totalDe(it))}</span>
                {celdaStaff}{celdaFac}{celdaDrive}{celdaEstado}
              </div>}
          {/* Un trabajo aprobado tiene dos caras: lo que se cotizó y cómo se produce. Antes
              eran dos solapas y había que buscar el número dos veces. */}
          {abierto && dosCaras && <div style={{display:'flex', gap:0, background:T.surfaceAlt, borderTop:`1px solid ${T.border}`, padding:'0 18px'}}>
            {[['prod','Producción','staff · Drive · margen'],['coti','Lo cotizado','servicios · precio · PDF']].map(([k,l,s])=>(
              <button key={k} onClick={()=>setTab(k)} style={{padding:'10px 14px 9px', border:'none', background:'transparent', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:tabActual===k?700:500, color:tabActual===k?T.ink:T.ink2, borderBottom:`2px solid ${tabActual===k?T.brand:'transparent'}`}}>{l}{!cel && <span style={{fontSize:11, fontWeight:400, color:T.ink3, marginLeft:7}}>{s}</span>}</button>
            ))}
          </div>}
          {abierto && tabActual==='coti' && p && <DetallePresupuesto p={p} id={num} onEdit={()=>setEditing(p)} onRepresupuestar={()=>setRepresu(p)} onEliminar={()=>setBorrando(p)} onSeguimiento={enEspera?()=>setSeg(p):null}/>}
          {abierto && tabActual==='prod' && y && <StaffEditor p={y} num={num} rrhhNames={rrhhNames} rrhh={rrhh} serviciosConocidos={serviciosConocidos} proyectos={proyectos} acuerdos={data.acuerdos||[]} disponibilidad={data.disponibilidad||[]} agencias={data.agencias||[]} clientes={data.clientes||[]} seguros={data.seguros||[]} presu={p} onRefresh={onRefresh} showToast={showToast} onClose={()=>setOpen(null)} onEditarDatos={()=>setEditing(p||y)}/>}
        </div>
      })}
    </div>
    {filtered.length>200 && <div style={{fontSize:12, color:T.ink3, textAlign:'center', marginTop:12}}>Mostrando primeros 200 de {filtered.length}</div>}
    {editing && <EditarModal p={editing} data={data} onClose={()=>setEditing(null)} showToast={showToast}
      onSaved={(id,cambios)=>{ setRows(rs=>rs.map(r=>String(r['Columna 1'])===String(id)?{...r,...cambios}:r)); setEditing(null); if(onRefresh) onRefresh() }}/>}
    {nuevo && <NuevoPresupuesto data={data} showToast={showToast} onClose={()=>setNuevo(false)} onGuardado={()=>{ setNuevo(false); if(onRefresh) onRefresh() }}/>}
    {represu && <NuevoPresupuesto data={data} initialData={represu} showToast={showToast} onClose={()=>setRepresu(null)} onGuardado={()=>{ setRepresu(null); if(onRefresh) onRefresh() }}/>}
    {resg && <ResguardoModal presu={resg} condicion={condicionDe(resg, data.agencias, data.clientes)} onClose={()=>setResg(null)} onConfirm={r=>{ const p=resg; setResg(null); setResgPend({num:p['Columna 1'], r}); presuTieneOpciones(p) ? setAprobAdic(p) : cambiarEstado(p['Columna 1'],'APROBADO',p['Estado'],undefined,r) }}/>}
    {aprobAdic && <AprobarAdicionalesModal presu={aprobAdic} saving={aprobSaving} onClose={()=>setAprobAdic(null)} onConfirm={aprobarConAdic}/>}
    {motivoModal && <MotivoEstadoModal num={motivoModal.num} estado={motivoModal.estado} saving={motivoSaving}
      onClose={()=>setMotivoModal(null)}
      onConfirm={async motivo=>{ setMotivoSaving(true); await cambiarEstado(motivoModal.num, motivoModal.estado, motivoModal.actual, motivo); setMotivoSaving(false); setMotivoModal(null) }}/>}
    {borrando && <EliminarPresupuestoModal presu={borrando} saving={borrSaving} onClose={()=>setBorrando(null)} onConfirm={eliminarPresupuesto}/>}
    {seg && <SeguimientoModal p={seg} saving={segSaving} onClose={()=>setSeg(null)} onConfirm={guardarSeguimiento}/>}
  </>
}

function EstadoSelect({value, onChange}){
  const info = estadoInfo(value)
  const cur = String(value||'').toUpperCase()
  return <span onClick={e=>e.stopPropagation()} style={{display:'inline-flex', alignItems:'center', gap:6, justifyContent:'flex-end'}}>
    <span style={{width:7,height:7,borderRadius:7,background:info.c,flexShrink:0}}/>
    <select value={ESTADOS_DOT[cur]?cur:''} onChange={e=>onChange(e.target.value)}
      title="Cambiar estado"
      style={{border:'none', background:'transparent', color:T.ink2, fontSize:12, cursor:'pointer', outline:'none', WebkitAppearance:'none', MozAppearance:'none', appearance:'none', textAlign:'right'}}>
      {!ESTADOS_DOT[cur] && <option value="">{info.l}</option>}
      {/* "En curso" y "Entregado" no se ofrecen: no los usa nadie (0 de 712 al 20/9/2026) y
          cualquier estado que no sea Aprobado saca el trabajo de PROYECTOS. */}
      {Object.keys(ESTADOS_DOT).filter(k=>!['EN CURSO','ENTREGADO'].includes(k)||k===cur).map(k=><option key={k} value={k}>{ESTADOS_DOT[k].l}</option>)}
    </select>
  </span>
}

// El horario se escribía a mano y era donde más se confundían los freelancers.
// Dos relojes de 24hs, y si todavía no se sabe que lo diga — mejor "a confirmar"
// que un campo vacío que cada uno interpreta a su manera.
function CampoHorario({valor, onChange}){
  const m = String(valor||'').match(/(\d{1,2})[:.]?(\d{0,2})\s*(?:a|hasta|-)\s*(\d{1,2})[:.]?(\d{0,2})/i)
  const pad = n => String(n).padStart(2,'0')
  const ini = m ? pad(parseInt(m[1]))+':'+(m[2]?pad(parseInt(m[2])):'00') : ''
  const fin = m ? pad(parseInt(m[3]))+':'+(m[4]?pad(parseInt(m[4])):'00') : ''
  const aConfirmar = /confirmar/i.test(String(valor||''))
  const set = (a,b) => onChange(a && b ? `${a} a ${b} hs` : '')
  return <div>
    <div style={{display:'flex', gap:8, alignItems:'center'}}>
      <HoraInput value={ini} disabled={aConfirmar} onChange={v=>set(v, fin||'18:00')} style={{...inpV2, flex:1, opacity:aConfirmar?0.45:1}}/>
      <span style={{fontSize:12, color:T.ink3}}>a</span>
      <HoraInput value={fin} disabled={aConfirmar} onChange={v=>set(ini||'09:00', v)} style={{...inpV2, flex:1, opacity:aConfirmar?0.45:1}}/>
    </div>
    <label style={{display:'flex', alignItems:'center', gap:6, fontSize:11.5, color:T.ink2, marginTop:6, cursor:'pointer'}}>
      <input type="checkbox" checked={aConfirmar} onChange={e=>onChange(e.target.checked?'A confirmar':'')}/>
      Todavía no se sabe — poner “a confirmar” en la citación
    </label>
  </div>
}

// La ubicación viaja al Calendar y ahí Google la geocodifica: si está bien
// escrita, el freelancer abre la invitación y toca para que le arme el viaje.
function CampoUbicacion({valor, onChange}){
  const q = String(valor||'').trim()
  return <div>
    <input value={valor||''} onChange={e=>onChange(e.target.value)} placeholder="Dirección completa, como la buscarías en Maps" style={inpV2}/>
    <div style={{display:'flex', gap:10, marginTop:6, alignItems:'center'}}>
      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q||'Buenos Aires')}`} target="_blank" rel="noreferrer"
         style={{fontSize:11.5, color:T.brand, textDecoration:'none', fontWeight:600}}>📍 {q?'Ver en Maps':'Buscar en Maps'}</a>
      <span style={{fontSize:11, color:T.ink3}}>Comprobá que caiga donde tiene que caer antes de guardar</span>
    </div>
  </div>
}

function EditarModal({p, data, onClose, onSaved, showToast}){
  const campos = [
    ['PM Interno','PM',false],
    ['Proyecto','Proyecto',false], ['Agencia','Agencia','ag'], ['Cliente','Cliente','cl'],
    ['Contacto','Contacto','ct'], ['Horario','Horario de la jornada','hora'],
    ['Ubicación','Ubicación','mapa'], ['Contacto Lugar','Contacto en el lugar',false],
    ['Observaciones','Observaciones (salen en el PDF)','area'],
  ]
  const [form,setForm]=useState(()=>{ const o={}; campos.forEach(([k])=>o[k]=p[k]||''); return o })
  const [saving,setSaving]=useState(false)
  const [agNew,setAgNew]=useState({cuit:'',condIVA:'Responsable Inscripto',mailFact:'',telefono:''})
  const [ctNew,setCtNew]=useState({mail:'',telefono:'',cargo:'',cuit:''})
  const id = p['Columna 1'] || p['N° presupuesto']
  // Las fechas viven en PRESUPUESTOS (Tipo Fechas / Fechas Adicionales): si esto se
  // abrió desde un proyecto hay que ir a buscar la fila del presu, que es la fuente.
  const presuRow = (data?.presupuestos||[]).find(x=>String(x['Columna 1']||'').trim()===String(id).trim()) || p
  const diasOrig = decodificarFechas(presuRow['Fecha Evento']||p['Fecha Evento'], presuRow['Tipo Fechas'], presuRow['Fechas Adicionales'])
  const tentOrig = tentativosDe(presuRow['Fecha Evento']||p['Fecha Evento'], presuRow['Tipo Fechas'], presuRow['Fechas Adicionales'])
  const [dias,setDias]=useState(diasOrig)
  const [tentativos,setTentativos]=useState(tentOrig)
  const ags=dedupCI([...(data?.agencias||[]).map(x=>x['Nombre']),...((data?.presupuestos||[]).map(x=>x['Agencia']))])
  const clis=dedupCI([...(data?.clientes||[]).map(x=>x['Nombre']),...((data?.presupuestos||[]).map(x=>x['Cliente']))])
  const cts=dedupCI([...(data?.contactos||[]).map(x=>x['Nombre']),...((data?.presupuestos||[]).map(x=>x['Contacto']))])
  const pms=dedupCI((data?.presupuestos||[]).map(x=>x['PM Interno']))
  const dl = tipo => tipo==='ag'?ags:tipo==='cl'?clis:tipo==='ct'?cts:null
  const nrm=v=>String(v||'').trim().toLowerCase()
  const agSet=new Set(ags.map(nrm)), clSet=new Set(clis.map(nrm)), ctSet=new Set(cts.map(nrm))
  const agNueva=(form['Agencia']||'').trim() && !/^(sin agencia|directo)/i.test((form['Agencia']||'').trim()) && !agSet.has(nrm(form['Agencia']))
  const clNuevo=(form['Cliente']||'').trim() && !clSet.has(nrm(form['Cliente']))
  const ctNuevo=(form['Contacto']||'').trim() && !ctSet.has(nrm(form['Contacto']))

  async function guardar(){
    const cambios={}
    campos.forEach(([k])=>{ if((form[k]||'')!==(p[k]||'')) cambios[k]=form[k] })
    // Fechas: el tipo (dia/rango/multi) y las adicionales se derivan de los días
    // marcados en el calendario, así nunca queda un "rango" viejo con el final
    // desactualizado (rompía el Calendar en silencio).
    const cod=codificarFechas(dias,tentativos), origF=codificarFechas(diasOrig,tentOrig)
    // Tenía fecha y quedó sin ningún día marcado: se guardaba igual y el trabajo
    // desaparecía del calendario (#2209 Unilever, 14/9/2026: sacando el 15 se fue
    // también el 14). Cada clic rota confirmado → a confirmar → vacío, así que es
    // fácil vaciar un día sin darse cuenta. Sin fecha no se guarda.
    if(diasOrig.length>0 && !dias.length){ showToast('No quedó ningún día marcado — así el trabajo desaparece del calendario. Dejá al menos uno (puede ser “a confirmar”).','err'); return }
    if(cod.fechaEvento!==origF.fechaEvento||cod.tipo!==origF.tipo||cod.adicionales!==origF.adicionales){
      cambios['Fecha Evento']=cod.fechaEvento; cambios['Tipo Fechas']=cod.tipo
      cambios['Fechas Adicionales']=cod.adicionales; cambios['Cant. Fechas']=cod.cant
    }
    if(Object.keys(cambios).length===0){ showToast('No hay cambios','err'); return }
    setSaving(true)
    try{
      // 1. Fuente de verdad: el presupuesto
      const r=await fetch('/api/presupuesto-editar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, cambios})})
      const j=await r.json()
      if(!j.ok){ showToast(j.error||'Error','err'); setSaving(false); return }
      // 2. Si está aprobado (tiene proyecto), espejar los campos compartidos al proyecto
      const aprobado = (data?.proyectos||[]).some(pr=>String(pr['N° presupuesto']||'').trim()===String(id).trim())
      if(aprobado){
        const camposProy={}; ['Fecha Evento','Cliente','Proyecto','Agencia','PM Interno','Contacto'].forEach(k=>{ if(cambios[k]!==undefined) camposProy[k]=cambios[k] })
        if(Object.keys(camposProy).length) { try{ await fetch('/api/proyecto-editar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, cambios:camposProy, propagarPresupuesto:false})}) }catch(e){} }
      }
      // Guardar entidades nuevas (agencia/contacto/cliente) en sus solapas
      if(ctNuevo){ try{ await fetch('/api/contacto-nuevo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:form['Contacto'], mail:ctNew.mail, telefono:ctNew.telefono, cuit:ctNew.cuit, agencia:form['Agencia'], cargo:ctNew.cargo})}) }catch(e){} }
      if(agNueva){ try{ await fetch('/api/agencia-upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:form['Agencia'], cuit:agNew.cuit, condIVA:agNew.condIVA, mailFact:agNew.mailFact, telefono:agNew.telefono})}) }catch(e){} }
      if(clNuevo){ try{ await fetch('/api/cliente-upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:form['Cliente']})}) }catch(e){} }
      showToast(`#${id} guardado`)
      onSaved(id, cambios)
      // 3. Resincronizar el Calendar en segundo plano (Google es lento)
      // Un presu DESAPROBADO/REPRESUPUESTADO no vuelve al Calendar: editarlo mandaba
      // 'pendiente' y le resucitaba el evento en amarillo. Fixed 2026-08-31.
      const estCal=String(form['Estado']||p['Estado']||'').toUpperCase()
      const accionCal=(estCal==='DESAPROBADO'||estCal==='REPRESUPUESTADO')?'borrar':(aprobado?'aprobar':'pendiente')
      // Y avisar qué quedó agendado: un trabajo de varias fechas son varios eventos,
      // y si sacaste un día se borró uno. Guardarlo en silencio no deja verlo.
      fetch('/api/calendar-evento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, accion: accionCal})})
        .then(r=>r.json()).then(j=>{
          if(!j||!j.ok||accionCal==='borrar') return
          const partes=[]
          const firmes=(j.eventos||0)-(j.aConfirmar||0)
          if(firmes) partes.push(`${firmes} ${firmes===1?'día':'días'} en el Calendar`)
          if(j.aConfirmar) partes.push('+ bloque “a confirmar”')
          if(j.borrados) partes.push(`${j.borrados} ${j.borrados===1?'borrado':'borrados'}`)
          if(j.staffSinMail&&j.staffSinMail.length) partes.push(`sin mail: ${j.staffSinMail.join(', ')}`)
          if(partes.length) showToast(`#${id} · ${partes.join(' · ')}`)
        }).catch(()=>{})
    }catch(e){ showToast('Error de conexión','err'); setSaving(false) }
  }

  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.35)', zIndex:900, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'48px 20px', overflowY:'auto'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:520, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.15)'}}>
      <div style={{padding:'18px 22px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div><div style={{fontSize:16, fontWeight:700, color:T.ink}}>Editar datos</div><div style={{fontSize:12, color:T.ink3, marginTop:2, fontFamily:MONO}}>#{id} · {p['Proyecto']||'sin nombre'}</div></div>
        <button onClick={onClose} style={{border:'none', background:'transparent', fontSize:20, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
      </div>
      <div style={{padding:'20px 22px', display:'flex', flexDirection:'column', gap:13}}>
        <div>
          <label style={{fontSize:11, fontWeight:600, color:T.ink2, textTransform:'uppercase', letterSpacing:0.3, display:'block', marginBottom:5}}>Fechas del evento</label>
          <CampoFechas dias={dias} tentativos={tentativos} onChange={(d,t)=>{setDias(d); setTentativos(t)}}/>
        </div>
        {campos.map(([k,label,tipo])=>(
          <div key={k}>
            <label style={{fontSize:11, fontWeight:600, color:T.ink2, textTransform:'uppercase', letterSpacing:0.3, display:'block', marginBottom:5}}>{label}</label>
            {tipo==='hora'
              ? <CampoHorario valor={form[k]} onChange={v=>setForm(f=>({...f,[k]:v}))}/>
              : tipo==='mapa'
              ? <CampoUbicacion valor={form[k]} onChange={v=>setForm(f=>({...f,[k]:v}))}/>
              : tipo==='area'
              ? <textarea value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} rows={3} style={{...inpV2, resize:'vertical'}}/>
              : k==='PM Interno'
                ? <input list="v2-pm" value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={inpV2}/>
                : <input list={dl(tipo)?'v2-'+tipo:undefined} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={inpV2}/>}
          </div>
        ))}
        <datalist id="v2-pm">{pms.map(x=><option key={x} value={x}/>)}</datalist>
        <datalist id="v2-ag">{ags.map(x=><option key={x} value={x}/>)}</datalist>
        <datalist id="v2-cl">{clis.map(x=><option key={x} value={x}/>)}</datalist>
        <datalist id="v2-ct">{cts.map(x=><option key={x} value={x}/>)}</datalist>
        {agNueva && <div style={{background:T.warnSoft, border:`1px solid ${T.warn}40`, borderRadius:10, padding:'12px 14px'}}>
          <div style={{fontSize:12, fontWeight:600, color:T.warn, marginBottom:8}}>🏢 Agencia nueva: "{form['Agencia']}" — completá sus datos (se guarda)</div>
          <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
            <div style={{flex:'1 1 130px'}}><label style={lblV2}>CUIT</label><input value={agNew.cuit} onChange={e=>setAgNew(a=>({...a,cuit:e.target.value}))} style={inpV2}/></div>
            <div style={{flex:'1 1 150px'}}><label style={lblV2}>Cond. IVA</label><input value={agNew.condIVA} onChange={e=>setAgNew(a=>({...a,condIVA:e.target.value}))} style={inpV2}/></div>
            <div style={{flex:'1 1 160px'}}><label style={lblV2}>Mail facturación</label><input value={agNew.mailFact} onChange={e=>setAgNew(a=>({...a,mailFact:e.target.value}))} style={inpV2}/></div>
            <div style={{flex:'1 1 130px'}}><label style={lblV2}>Teléfono</label><input value={agNew.telefono} onChange={e=>setAgNew(a=>({...a,telefono:e.target.value}))} style={inpV2}/></div>
          </div>
        </div>}
        {ctNuevo && <div style={{background:T.warnSoft, border:`1px solid ${T.warn}40`, borderRadius:10, padding:'12px 14px'}}>
          <div style={{fontSize:12, fontWeight:600, color:T.warn, marginBottom:8}}>☎ Contacto nuevo: "{form['Contacto']}" — completá sus datos (se guarda)</div>
          <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
            <div style={{flex:'1 1 160px'}}><label style={lblV2}>Mail</label><input value={ctNew.mail} onChange={e=>setCtNew(c=>({...c,mail:e.target.value}))} style={inpV2}/></div>
            <div style={{flex:'1 1 130px'}}><label style={lblV2}>Teléfono</label><input value={ctNew.telefono} onChange={e=>setCtNew(c=>({...c,telefono:e.target.value}))} style={inpV2}/></div>
            <div style={{flex:'1 1 130px'}}><label style={lblV2}>Cargo</label><input value={ctNew.cargo} onChange={e=>setCtNew(c=>({...c,cargo:e.target.value}))} style={inpV2}/></div>
            <div style={{flex:'1 1 130px'}}><label style={lblV2}>CUIT</label><input value={ctNew.cuit} onChange={e=>setCtNew(c=>({...c,cuit:e.target.value}))} style={inpV2}/></div>
          </div>
        </div>}
        {clNuevo && <div style={{fontSize:11.5, color:T.warn, fontWeight:600}}>🎯 Cliente nuevo: "{form['Cliente']}" — se guarda automáticamente.</div>}
      </div>
      <div style={{padding:'16px 22px', borderTop:`1px solid ${T.border}`, display:'flex', gap:10, justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{padding:'9px 18px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:500, cursor:'pointer'}}>Cancelar</button>
        <button onClick={guardar} disabled={saving} style={{padding:'9px 20px', borderRadius:9, border:'none', background:T.brand, color:'#fff', fontSize:13, fontWeight:600, cursor:saving?'default':'pointer', opacity:saving?0.6:1}}>{saving?'Guardando…':'Guardar'}</button>
      </div>
    </div>
  </div>
}

function DetallePresupuesto({p, id, onEdit, onRepresupuestar, onEliminar, onSeguimiento}){
  const servicios=[]
  for(let j=1;j<=MAX_SLOTS;j++){
    const ped=p['Pedido '+j]||p['Pedido'+j+' ']||''
    const prc=parseMonto(p['Precio '+j])
    if(ped&&prc>0) servicios.push({nombre:ped, precio:prc})
  }
  const subtotal=servicios.reduce((s,x)=>s+x.precio,0)
  const total=parseMonto(p['Precio Final'])
  const fee=total-subtotal

  // Por qué se cayó (col AY del sheet). Solo tiene sentido en los que no salieron.
  const estU = String(p['Estado']||'').toUpperCase()
  const motivo = String(p['Motivo Desaprobado']||'').trim()
  return <div style={{padding:'4px 18px 20px', background:T.surfaceAlt, borderTop:`1px solid ${T.border}`}}>
    {(estU==='DESAPROBADO'||estU==='REPRESUPUESTADO') && <div style={{marginTop:12, padding:'9px 13px', borderRadius:9, background:motivo?T.surface:'transparent', border:`1px solid ${motivo?T.border:T.warn+'55'}`, fontSize:12.5, color:motivo?T.ink2:T.warn}}>
      {motivo ? <><span style={{color:T.ink3}}>{estU==='DESAPROBADO'?'Por qué no salió:':'Por qué se rehizo:'}</span> <strong style={{color:T.ink, fontWeight:600}}>{motivo}</strong></>
              : <>Sin motivo cargado — cambiale el estado de nuevo para dejarlo anotado.</>}
    </div>}
    {/* Seguimiento comercial: solo mientras está en espera. Cuánto hace que no se habla y qué sigue. */}
    {onSeguimiento && (()=>{ const s=segDe(p)
      return <div style={{marginTop:12, padding:'10px 13px', borderRadius:9, background:s.toca?T.brandSoft:T.surface, border:`1px solid ${s.toca?T.brand+'55':T.border}`, fontSize:12.5, color:T.ink2, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap'}}>
        <span style={{flex:1, minWidth:200}}>
          {s.nunca ? <><strong style={{color:s.toca?T.brand:T.ink, fontWeight:600}}>Nadie lo llamó desde que se mandó</strong>{s.dPre!==null?` (hace ${s.dPre} días)`:''}.</>
            : <><span style={{color:T.ink3}}>Último contacto:</span> <strong style={{color:T.ink, fontWeight:600}}>{fechaDDMMYYYY(s.ultimo)}</strong> (hace {s.dUlt} días){s.paso?<> · {s.paso}</>:null}{s.seguir?<> · <span style={{color:T.ink3}}>seguir el</span> <strong style={{color:s.toca?T.brand:T.ink, fontWeight:600}}>{fechaDDMMYYYY(s.seguir)}</strong></>:null}</>}
          {s.toca && !s.nunca && <span style={{color:T.brand, fontWeight:600}}> · toca llamar</span>}
        </span>
        <button onClick={e=>{e.stopPropagation(); onSeguimiento()}} style={{...miniBtn, background:s.toca?T.brand:T.surface, color:s.toca?'#fff':T.ink2, border:`1px solid ${s.toca?T.brand:T.border}`, fontWeight:600}}>📞 Hablé con el cliente</button>
      </div> })()}
    <div style={{display:'flex', gap:32, padding:'14px 0', flexWrap:'wrap'}}>
      {[['N°',id],['Agencia',p['Agencia']],['Carga',p['Fecha Presupuesto']],['Contacto',p['Contacto']],['PM',p['PM Interno']],['Horario',p['Horario']],['Ubicación',p['Ubicación']]].filter(x=>x[1]).map(([k,v])=>(
        <div key={k}><div style={{fontSize:10.5, textTransform:'uppercase', letterSpacing:0.4, color:T.ink3, fontWeight:600}}>{k}</div><div style={{fontSize:13, color:T.ink, marginTop:3}}>{v}</div></div>
      ))}
    </div>
    <div style={{display:'flex', gap:20, alignItems:'flex-start', flexWrap:'wrap'}}>
      <div style={{flex:'1 1 320px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, overflow:'hidden'}}>
        {servicios.length===0
          ? <div style={{padding:'14px 16px', fontSize:12.5, color:T.ink3}}>Sin servicios detallados</div>
          : servicios.map((s,i)=>(
            <div key={i} style={{display:'flex', justifyContent:'space-between', padding:'9px 16px', borderTop:i===0?'none':`1px solid ${T.border}`}}>
              <span style={{fontSize:12.5, color:T.ink2}}>{s.nombre}</span>
              <span style={{fontSize:12.5, fontFamily:MONO, color:T.ink}}>{fmt(s.precio)}</span>
            </div>
          ))}
      </div>
      <div style={{flex:'0 0 220px', minWidth:200}}>
        <ResumenLine label="Subtotal servicios" value={fmt(subtotal)}/>
        <ResumenLine label="Margen Magma / dif." value={fmt(fee)} color={T.ink2}/>
        <div style={{display:'flex', justifyContent:'space-between', padding:'12px 0 0', marginTop:8, borderTop:`1px solid ${T.border}`}}>
          <span style={{fontSize:13, fontWeight:600, color:T.ink}}>Precio final</span>
          <span style={{fontSize:15, fontWeight:700, fontFamily:MONO, color:T.brand}}>{fmt(total)}</span>
        </div>
        <div style={{display:'flex', gap:8, marginTop:14}}>
          <button onClick={onEdit} style={{flex:1, textAlign:'center', padding:'8px', borderRadius:8, border:'none', background:T.ink, color:'#fff', fontSize:12.5, fontWeight:600, cursor:'pointer'}}>Editar datos</button>
          <button onClick={onRepresupuestar} style={{flex:1, textAlign:'center', padding:'8px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:12.5, fontWeight:600, cursor:'pointer'}}>Represupuestar</button>
          <a href={`/presupuesto?nro=${encodeURIComponent(id)}`} target="_blank" rel="noreferrer" style={{flex:1, textAlign:'center', padding:'8px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:12.5, fontWeight:500, textDecoration:'none'}}>Ver PDF →</a>
        </div>
        <button onClick={onEliminar} style={{width:'100%', marginTop:8, padding:'7px', borderRadius:8, border:`1px solid ${T.border}`, background:'transparent', color:T.ink3, fontSize:12, fontWeight:500, cursor:'pointer'}}
          onMouseEnter={e=>{e.currentTarget.style.color=T.brand; e.currentTarget.style.borderColor=T.brand}}
          onMouseLeave={e=>{e.currentTarget.style.color=T.ink3; e.currentTarget.style.borderColor=T.border}}>Eliminar presupuesto</button>
      </div>
    </div>
  </div>
}

// ============================ NUEVO PRESUPUESTO ============================
const SVCS_LIST=[
  {n:'Foto 1/2',p:220000,fee:true},{n:'Foto 1',p:290000,fee:true},
  {n:'Video 1/2',p:220000,fee:true},{n:'Video 1',p:290000,fee:true},
  {n:'Film 1/2',p:220000,fee:true},{n:'Film 1',p:290000,fee:true},
  {n:'Film 12hs',p:350000,fee:true},{n:'Edit 60s',p:116000,fee:true},
  {n:'Edit 60s+',p:174000,fee:true},{n:'Asist 1/2',p:140000,fee:true},
  {n:'Asist 1',p:210000,fee:true},{n:'Vivo 1',p:350000,fee:true},
  {n:'Vivo 1/2',p:230000,fee:true},{n:'DirFoto',p:350000,fee:true},
  {n:'Sonido',p:290000,fee:true},{n:'Drone',p:290000,fee:true},
  {n:'FPV',p:405000,fee:true},{n:'Motion',p:230000,fee:true},
  {n:'Crudos',p:175000,fee:true},{n:'Edit 15-30s',p:116000,fee:true},
  {n:'Fotos',p:60000,fee:true},{n:'Go Pro',p:230000,fee:true},
  {n:'Viaticos',p:0,fee:false},{n:'Produ',p:0,fee:false},
  {n:'MakeUp',p:0,fee:false},{n:'Rental',p:0,fee:false},
  {n:'Model',p:0,fee:false},{n:'Catering',p:0,fee:false},{n:'Otros',p:0,fee:false},
]
// Normaliza un servicio para comparar: saca emoji y acentos, ½ pasa a 1/2.
// Así "📸 Foto ½" y "Foto 1/2" se reconocen como el mismo servicio.
const svcKey = s => String(s||'').replace(/½/g,'1/2')
  .normalize('NFD').replace(/[̀-ͯ]/g,'')
  .replace(/[^a-zA-Z0-9\s/+-]/g,'').replace(/\s+/g,' ').trim().toLowerCase()
// La lista de servicios sale del sheet (solapa "listado"). SVCS_LIST queda de
// respaldo por si el sheet no responde, y aporta el flag fee (si suma al margen
// Magma). Para un servicio nuevo se infiere: precio 0 = pass-through, sin fee.
const getSvcs = data => {
  const delSheet = data?.listado?.serviciosFull || []
  if(!delSheet.length) return SVCS_LIST
  const base = new Map(SVCS_LIST.map(s=>[svcKey(s.n), s]))
  const out = []
  delSheet.forEach(s=>{
    const k = svcKey(s.n), m = base.get(k)
    out.push({ n:s.n, p:s.p || m?.p || 0, fee: m ? m.fee : s.p > 0 })
    base.delete(k)
  })
  base.forEach(s=>out.push(s))
  return out
}
const isoToDMY = iso => { if(!iso) return ''; const [y,m,d]=String(iso).split('-'); return d&&m&&y?`${d}/${m}/${y}`:'' }
const dmyToISO = s => { const p=String(s||'').split('/'); if(p.length!==3) return ''; const y=p[2].length===4?p[2]:'20'+p[2]; return `${y}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}` }
const parseHorarioStr = s => { const m=String(s||'').match(/(\d{1,2})[:.]?(\d{0,2})\s*(?:a|hasta|-)\s*(\d{1,2})[:.]?(\d{0,2})/i); if(!m) return {h1:'',h2:''}; const pad=n=>String(n).padStart(2,'0'); return {h1:pad(parseInt(m[1]))+':'+(m[2]?pad(parseInt(m[2])):'00'), h2:pad(parseInt(m[3]))+':'+(m[4]?pad(parseInt(m[4])):'00')} }
// Lee los servicios del presupuesto original (para represupuestar) preservando fee/adicional/precio cliente
const readPedidosOrig = p => {
  if(!p) return []
  const feeFlags=String(p['Fee Servicios']||'').split('|')
  const adicFlags=String(p['Es Adicional']||'').split('|')
  const precioCli=String(p['Precio Cliente Manual']||'').split('|')
  const visFlags=String(p['Precio visible']||'').split('|')   // "$" por línea: el cliente ve ese precio aunque el presu vaya cerrado
  const out=[]; let idx=0
  for(let i=1;i<=MAX_SLOTS;i++){
    const svc=p['Pedido '+i]||(i===1?p['Pedido']:'')||''
    const precio=parseMonto(p['Precio '+i]||(i===1?p['Precio']:''))
    if(svc||precio>0){
      const fl=feeFlags[idx]
      const feeAg=fl==='0'?false:fl==='1'?true:(SVCS_LIST.find(s=>s.n===svc)?.fee ?? true)
      const adicional=adicFlags[idx]==='1'
      const verPrecio=visFlags[idx]==='1'
      // Las líneas iguales y seguidas vuelven juntas como una sola con cantidad:
      // 3 cápsulas se cargaron como 3 slots, pero editarlas de a una es un dolor.
      const ult=out[out.length-1]
      if(ult && ult.svc===svc && ult.precio===String(precio||'') && ult.feeAg===feeAg && ult.adicional===adicional && !adicional && !!ult.verPrecio===verPrecio) ult.cant++
      else out.push({id:idx+1, svc, precio:String(precio||''), cant:1, feeAg, manual:false, adicional, precioCliente:adicional?(precioCli[idx]||''):'', verPrecio})
      idx++
    }
  }
  return out
}
// ---- Ganancia Magma: UNA sola definición (Juan, 24/09/2026) ----
// Es la "diferencia total": lo que queda del precio después de pagar al staff de afuera.
// Adentro van el fee, los impuestos (Ganancias, IIBB), el ajuste, las líneas "Somos Magma"
// y el ahorro (o sobrecosto) entre lo presupuestado y lo pagado. Cuánto de eso se va en
// impuestos es una pregunta aparte, no una resta acá.
// Por línea: si la hace "Somos Magma" no es costo; si tiene otro nombre (o todavía nadie)
// cuesta lo que dice Precio N — el presupuestado hasta que se carga el staff.
// Antes había dos números con el mismo nombre: Histórico y Dashboard sumaban Fee Agencia
// + Somos Magma + Diferencia (sin impuestos y sin el ahorro de staff) y Trabajos restaba
// el staff pagado. Caso #1729 Santander: $1.540.000 vs $2.700.000 para el mismo trabajo.
const costoStaffProyecto = p => { let c=0; for(let j=1;j<=MAX_SLOTS;j++){ const st=String(p['Staff '+j]||(j===1?p['Staff']:'')||'').trim(); if(st==='Somos Magma') continue; c+=parseMonto(p['Precio '+j]||(j===1?p['Precio']:'')) } return c }
// Desde el 01/10/2026 también se restan los GASTOS DEL TRABAJO: lo que se pagó para ese trabajo fuera de las
// líneas de staff (el alquiler de equipos, el auto, la nafta). La línea "Rental" o "Viáticos" del presupuesto
// suele ir a nombre de "Somos Magma" (es lo que se le cobra al cliente) y el gasto real salía por otro lado sin
// decir de qué trabajo era: el trabajo mostraba una ganancia que no había tenido. Ahora cada gasto lleva el N°
// del trabajo (GASTOS_FIJOS, columna "N° trabajo") y atarGastosATrabajos se lo cuelga al proyecto al cargar.
const gananciaProyecto = p => parseMonto(p['Total ']||p['Total']) - costoStaffProyecto(p) - (p.__gastoTotal||0)
// Le cuelga a cada proyecto sus gastos (p.__gastos, p.__gastoTotal). Se llama una vez, cuando llegan los datos.
function atarGastosATrabajos(data){
  const porNro={}
  ;(data.gastosFijos||[]).forEach(g=>{ const n=String(g['N° trabajo']||'').trim(); if(!n) return
    const act=String(g['Activo']||'').trim(); if(act && !/^(s[ií]|true)$/i.test(act)) return
    ;(porNro[n]=porNro[n]||[]).push({concepto:String(g['Concepto']||'').trim(), monto:parseMonto(g['Monto']), fecha:String(g['Fecha pago']||'').trim(), cuenta:String(g['Cuenta pago']||'').trim(), rubro:[g['Rubro'],g['Subrubro']].map(x=>String(x||'').trim()).filter(Boolean).join(' · ')}) })
  // Lo que se pagó con tarjeta y dice de qué trabajo fue (el auto alquilado para un rodaje). Los consumos en dólares
  // no se restan: no hay con qué cotización pasarlos a pesos.
  ;(data.movimientosTarjeta||[]).forEach(m=>{ const n=String(m['N° trabajo']||'').trim(); if(!n || String(m['Moneda']||'').toUpperCase()==='USD') return
    ;(porNro[n]=porNro[n]||[]).push({concepto:String(m['Comercio']||m['Descripcion']||'').trim(), monto:parseMonto(m['Monto']), fecha:String(m['Fecha']||'').trim(), cuenta:String(m['Tarjeta']||'').trim(), rubro:String(m['Subcategoria']||'').trim()}) })
  // Los viáticos que se le pagan a alguien por un trabajo (Pagos Staff, columna "Viáticos"): ahí caen los tickets que
  // cargan los chicos desde Mi Magma cuando administración los aprueba. Llevan el N° del trabajo, así que son un gasto suyo.
  ;(data.pagosStaff||[]).forEach(r=>{ const n=String(r['N° Presupuesto']||'').trim(), v=parseMonto(r['Viáticos']); if(!n || !(v>0)) return
    ;(porNro[n]=porNro[n]||[]).push({concepto:`Viáticos de ${String(r['Freelancer']||'').trim()}`, monto:v, fecha:String(r['Fecha Pago']||'').trim(), cuenta:String(r['Cuenta']||'').trim(), rubro:'Producción · Viáticos'}) })
  ;(data.proyectos||[]).forEach(p=>{ const n=String(p['N° presupuesto']||'').trim(); p.__gastos=(n&&porNro[n])||[]; p.__gastoTotal=p.__gastos.reduce((t,x)=>t+x.monto,0) })
  return data
}
// Un presupuesto que todavía no es proyecto: el precio menos lo que se presupuestó de staff.
const gananciaPresu = p => parseMonto(p['Precio Final']) - parseMonto(p['Subtotal'])
// Semáforo recalibrado a la definición nueva. Con la vieja el corte era 50/35 y la mediana
// 2026 daba 49%; con esta la mediana es 60% (326 proyectos, medido el 24/09/2026), así que
// "sano" sigue siendo estar arriba de la mitad de los trabajos, y "bajo" menos de 45%.
const semaforo = pct => pct>=60?{c:T.pos,l:'sano'}:pct>=45?{c:T.warn,l:'aceptable'}:{c:T.brand,l:'bajo'}

function NuevoPresupuesto({data, onClose, onGuardado, showToast, initialData}){
  const hoyISO = new Date().toISOString().slice(0,10)
  const isRep = !!initialData
  const tipoOrig = String(initialData?.['Tipo Fechas']||'').toLowerCase().trim() || 'dia'
  const adicOrig = String(initialData?.['Fechas Adicionales']||'').trim()
  const horasOrig = parseHorarioStr(initialData?.['Horario'])
  const ajusteOrig = parseMonto(initialData?.['Ajuste'])
  const [form,setForm]=useState(isRep ? {
    fp:hoyISO,
    dias: decodificarFechas(initialData['Fecha Evento'], tipoOrig, adicOrig),
    tentativos: tentativosDe(initialData['Fecha Evento'], tipoOrig, adicOrig),
    agencia:initialData['Agencia']||'', cliente:initialData['Cliente']||'', proyecto:initialData['Proyecto']||'',
    contacto:initialData['Contacto']||'', pm:initialData['PM Interno']||'',
    plazo:String(initialData['Plazo']||'0').replace(/[^\d]/g,'')||'0',
    interes:String(initialData['Interes %']||'0').replace(/[^\d.]/g,'')||'0',
    gan:parseMonto(initialData['Impuesto a las ganancias'])>0, iibb:parseMonto(initialData['IIBB'])>0,
    tajuste:ajusteOrig<0?'-1':'1', ajuste:String(Math.abs(ajusteOrig)||'0'),
    observaciones:initialData['Observaciones']||'', horaIni:horasOrig.h1, horaFin:horasOrig.h2,
    ubicacion:initialData['Ubicación']||'', descPct:'', motivo:'',
    desglosar:presuDesglosado(initialData),
    edClase:initialData['Ed. Clase']||'', edFormato:initialData['Ed. Formato']||'', edRed:initialData['Ed. Red']||'', edGrafica:initialData['Ed. Gráfica']||'',
  } : { fp:hoyISO, dias:[], tentativos:[], agencia:'', cliente:'', proyecto:'', contacto:'', pm:'', plazo:'0', interes:'0', gan:true, iibb:true, tajuste:'1', ajuste:'0', observaciones:'', horaIni:'', horaFin:'', ubicacion:'', descPct:'', motivo:'', desglosar:false, edClase:'', edFormato:'', edRed:'', edGrafica:'' })
  const [peds,setPeds]=useState(isRep && readPedidosOrig(initialData).length>0 ? readPedidosOrig(initialData) : [{id:1,svc:'',precio:'',cant:1,feeAg:true,manual:false,adicional:false,precioCliente:''},{id:2,svc:'',precio:'',cant:1,feeAg:true,manual:false,adicional:false,precioCliente:''}])
  const [saving,setSaving]=useState(false)
  const upd=(k,v)=>setForm(f=>({...f,[k]:v}))
  // datos extra para entidades nuevas
  const [ctNew,setCtNew]=useState({mail:'',telefono:'',cargo:'',cuit:''})
  const [agNew,setAgNew]=useState({cuit:'',condIVA:'Responsable Inscripto',mailFact:'',telefono:''})

  // autocompletes desde el sheet
  const ags=dedupCI([...(data?.agencias||[]).map(a=>a['Nombre']),...(data?.listado?.agencias||[]),...((data?.presupuestos||[]).map(p=>p['Agencia']))])
  const clis=dedupCI([...(data?.listado?.clientes||[]),...(data?.clientes||[]).map(c=>c['Nombre']),...((data?.presupuestos||[]).map(p=>p['Cliente']))])
  const cts=dedupCI([...(data?.contactos||[]).map(c=>c['Nombre']),...((data?.presupuestos||[]).map(p=>p['Contacto']))])
  const pms=dedupCI([...['Juan','Sofi','Lulu','Tomi'],...((data?.presupuestos||[]).map(p=>p['PM Interno']))])
  // detección de nuevos (no están en la lista)
  const nrm=v=>String(v||'').trim().toLowerCase()
  const agSet=new Set(ags.map(nrm)), clSet=new Set(clis.map(nrm)), ctSet=new Set(cts.map(nrm))
  const agNueva=form.agencia.trim() && !/^(sin agencia|directo)/i.test(form.agencia.trim()) && !agSet.has(nrm(form.agencia))
  const clNuevo=form.cliente.trim() && !clSet.has(nrm(form.cliente))
  const ctNuevo=form.contacto.trim() && !ctSet.has(nrm(form.contacto))
  const ctExist=(data?.contactos||[]).find(c=>nrm(c['Nombre'])===nrm(form.contacto))
  const ctIncompleto=!!ctExist && (!sinErr(ctExist['Mail']) || !sinErr(ctExist['Teléfono']))
  const ctMostrar=ctNuevo||ctIncompleto
  // precargar datos del contacto existente para completar lo que falte
  useEffect(()=>{ const c=(data?.contactos||[]).find(x=>nrm(x['Nombre'])===nrm(form.contacto)); if(c) setCtNew({mail:sinErr(c['Mail']),telefono:sinErr(c['Teléfono']),cargo:sinErr(c['Cargo']),cuit:sinErr(c['Cuit'])}) /* eslint-disable-next-line */ },[form.contacto])

  const svcs=getSvcs(data)
  const updPed=(i,ch)=>setPeds(ps=>ps.map((p,j)=>j===i?{...p,...ch}:p))
  const selSvc=(i,nombre)=>{ const m=svcs.find(s=>s.n===nombre)||svcs.find(s=>svcKey(s.n)===svcKey(nombre)); if(m) updPed(i,{svc:m.n, precio:peds[i].manual&&peds[i].precio?peds[i].precio:(m.p||''), feeAg:m.fee}); else updPed(i,{svc:nombre}) }
  // alta de servicio nuevo — queda guardado en la solapa "listado"
  const [svcNew,setSvcNew]=useState(null) // {nombre, precio, fee} | null
  const [svcSaving,setSvcSaving]=useState(false)
  const guardarSvc=async()=>{
    const nombre=String(svcNew?.nombre||'').trim()
    if(!nombre) return showToast('Poné un nombre','err')
    setSvcSaving(true)
    try{
      const r=await fetch('/api/servicio-nuevo',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({nombre, precio:svcNew.precio||0})})
      const j=await r.json()
      if(!r.ok) return showToast(j.error||'No se pudo guardar','err')
      // lo uso en la primera línea vacía, o agrego una
      const idx=peds.findIndex(p=>!p.svc&&!p.adicional)
      const nuevo={svc:nombre, precio:String(svcNew.precio||''), feeAg:!!svcNew.fee, manual:false}
      if(idx>=0) updPed(idx,nuevo)
      else setPeds(ps=>[...ps,{id:Date.now(),...nuevo,cant:1,adicional:false,precioCliente:''}])
      setSvcNew(null)
      showToast(`"${nombre}" agregado a la lista`,'ok')
    }catch(e){ showToast('Error de red','err') }
    finally{ setSvcSaving(false) }
  }
  const addPed=(adicional=false)=>setPeds(ps=>[...ps,{id:Date.now(),svc:'',precio:'',cant:1,feeAg:!adicional,manual:false,adicional,precioCliente:''}])
  const delPed=i=>setPeds(ps=>ps.filter((_,j)=>j!==i))

  // ---- CÁLCULO ---- el margen (fee) lo decide el tilde "Fee" de cada servicio, no si hay agencia
  // La cantidad es un atajo de carga: "Edit 60s × 3" se guarda como 3 líneas en el
  // sheet (ver `expandir` en guardar). Acá multiplica el costo, nada más.
  const cantDe=p=>Math.max(1, parseInt(p.cant)||1)
  const baseList=peds.filter(p=>!p.adicional), adicList=peds.filter(p=>p.adicional)
  const subtotal=baseList.reduce((s,p)=>s+(parseFloat(p.precio)||0)*cantDe(p),0)
  const fee=baseList.reduce((s,p)=>p.feeAg?s+(parseFloat(p.precio)||0)*cantDe(p)*MULT_MARGEN:s,0)
  const base=subtotal+fee
  const gan=form.gan?fee*0.35:0
  const iibb=form.iibb?fee*0.04:0
  const intMto=(base+gan+iibb)*((parseFloat(form.interes)||0)/100)
  const ajMto=(parseFloat(form.ajuste)||0)*parseInt(form.tajuste)
  const total=base+gan+iibb+intMto+ajMto
  const factor=subtotal>0?(total/subtotal):1
  const adicCalc=adicList.map(p=>{ const costo=parseFloat(p.precio)||0; const man=parseFloat(p.precioCliente)||0; const precioCliente=man>0?man:Math.round(costo*factor); const margen=precioCliente-costo; const margenPct=precioCliente>0?(margen/precioCliente)*100:0; return {svc:p.svc,costo,precioCliente,margen,margenPct} })
  const costoBase=baseList.reduce((s,p)=>s+(parseFloat(p.precio)||0)*cantDe(p),0)
  const margenBase=total-costoBase, margenBasePct=total>0?(margenBase/total)*100:0

  // ---- Desglose por ítem: lo que va a ver el cliente, acá y no recién en el PDF ----
  // Se arma con las MISMAS líneas que van al sheet (la cantidad ya expandida) y contra
  // el precio final, así el número que se ve mientras se arma el presu es exactamente
  // el que después sale en el PDF. El cálculo vive en lib/desglose.js: una sola copia.
  const itemsDesglose=baseList.filter(p=>p.svc.trim()||(parseFloat(p.precio)||0)>0)
    .flatMap(p=>Array.from({length:cantDe(p)},()=>({id:p.id, nombre:p.svc, costo:parseFloat(p.precio)||0, fee:!!p.feeAg})))
  // También se calcula cuando alguna línea tiene el "$" puesto (precio visible de un ítem
  // suelto, pedido del equipo 08/10/2026): el número que se ve acá es el mismo que sale en el PDF.
  const hayVerPrecio=baseList.some(p=>p.verPrecio&&p.svc.trim())
  const precioItem={}
  if((form.desglosar||hayVerPrecio)&&itemsDesglose.length){
    desglosarPrecio(itemsDesglose,{gan:form.gan, iibb:form.iibb, interesPct:parseFloat(form.interes)||0, total:Math.round(total)})
      .lineas.forEach(l=>{ precioItem[l.id]=(precioItem[l.id]||0)+l.precio })
  }

  // Descuento %: calcula el monto exacto de ajuste para bajar el total ese %
  const totalSinAjuste=base+gan+iibb+intMto
  const aplicarDescPct=(v)=>{
    const pct=parseFloat(v)
    setForm(f=>({...f, descPct:v, ...(pct>0 ? {tajuste:'-1', ajuste:String(Math.round(totalSinAjuste*pct/100))} : {ajuste:'0'}) }))
  }
  // Redondeo: al cliente no le mandamos $877.240 porque así dieron ganancias + IIBB.
  // Cierra el precio final en un número redondo moviendo SOLO el ajuste (los servicios no se tocan).
  const fijarTotal=(target)=>{ const dif=Math.round(target-totalSinAjuste); setForm(f=>({...f, descPct:'', tajuste:dif<0?'-1':'1', ajuste:String(Math.abs(dif))})) }
  const opcRedondeo = total>0 ? [10000,50000,100000].map(p=>Math.ceil(total/p)*p).filter((v,i,a)=>Math.round(v-total)>=1 && a.indexOf(v)===i) : []

  // ¿Este presu lleva post? Es lo que decide si preguntamos el brief de edición.
  const hayEdicion = peds.some(p=>esPedidoEdicion(p.svc))
  const briefDerivado = hayEdicion
    ? [duracionDePedido(peds.find(p=>esPedidoEdicion(p.svc))?.svc||''), materialDePedidos(peds.map(p=>p.svc))].filter(Boolean).join(' · ')
    : ''

  const falta=[]; if(!form.cliente.trim())falta.push('Cliente'); if(!form.proyecto.trim())falta.push('Proyecto'); if(!form.pm.trim())falta.push('PM'); if(!baseList.some(p=>p.svc.trim()))falta.push('un servicio')
  // Cada unidad ocupa un slot del sheet. Pasarse no da error: los de más se pierden
  // en silencio (ya pasó, $5,9M — ver lib/slots.js). Mejor frenar acá.
  const lineasTotales=peds.filter(p=>p.svc.trim()).reduce((s,p)=>s+cantDe(p),0)
  if(lineasTotales>MAX_SLOTS) falta.push(`bajar a ${MAX_SLOTS} servicios (contando cantidades hay ${lineasTotales})`)
  if(!(form.dias||[]).length)falta.push('Fecha evento')
  if(isRep && !String(form.motivo||'').trim())falta.push('motivo')
  const puedeGuardar = falta.length===0 && !saving

  async function guardar(){
    setSaving(true)
    // fechas
    // El tipo (dia/rango/multi) sale solo de los días elegidos — ver lib/fechas.js
    const { fechaEvento:fechaEventoOut, tipo:tipoFechas, adicionales:fechasAdic, cant:cantFechas } = codificarFechas(form.dias, form.tentativos)

    // Acá se deshace el atajo: "Edit 60s × 3" sale como 3 líneas idénticas. Al sheet
    // llega exactamente lo mismo que si se hubieran cargado a mano, así que los slots,
    // el tablero de Edición (una tarea por línea) y el staff no se enteran del cambio.
    // El PDF desglosado las vuelve a juntar solo, como "3 × Edición 60s".
    const valid=peds.filter(p=>p.svc.trim()).flatMap(p=>Array.from({length:cantDe(p)},()=>p))
    const plazoLabel={'0':'Contado','15':'15 días','30':'30 días','60':'60 días'}[form.plazo]||'Contado'
    const row={
      'Estado':'EN ESPERA', 'PM Interno':form.pm, 'Agencia':form.agencia.trim()||'Sin agencia / Directo',
      'Cliente':form.cliente, 'Proyecto':form.proyecto, 'Contacto':form.contacto,
      'Fecha Presupuesto':form.fp, 'Fecha Evento':fechaEventoOut, 'Cant. Fechas':cantFechas,
      'Precio Final':Math.round(total), 'Subtotal':Math.round(subtotal), 'Fee Agencia':Math.round(fee),
      'Impuesto a las ganancias':Math.round(gan), 'IIBB':Math.round(iibb),
      'Plazo':plazoLabel, 'Interes %':(parseFloat(form.interes)||0)?form.interes+'%':'', 'Interes $':Math.round(intMto),
      'Total':Math.round(total), 'Ajuste':Math.round(ajMto),
      'Tipo Fechas':tipoFechas, 'Fechas Adicionales':fechasAdic,
      'Fee Servicios':valid.map(p=>p.feeAg?'1':'0').join('|'),
      'Es Adicional':valid.map(p=>p.adicional?'1':'0').join('|'),
      'Precio Cliente Manual':valid.map(p=>p.adicional?(p.precioCliente||''):'').join('|'),
      'Desglosar':!!form.desglosar,   // DJ: el PDF sale con el precio de cada servicio
      'Precio visible':valid.map(p=>(p.verPrecio&&!p.adicional)?'1':'0').join('|'),   // DX: qué líneas salen con precio aunque el presu vaya cerrado
      // DK-DP: el brief de edición. Duración y material no se preguntan: ya están en el
      // presu (el pedido dice "Edit 60s"; si hay jornadas de cámara, lo filmamos nosotros).
      'Ed. Clase':form.edClase, 'Ed. Formato':form.edFormato, 'Ed. Red':form.edRed, 'Ed. Gráfica':form.edGrafica,
      'Ed. Duración':duracionDePedido(valid.find(p=>esPedidoEdicion(p.svc))?.svc||''),
      'Ed. Material':materialDePedidos(valid.map(p=>p.svc)),
      'Observaciones':form.observaciones,
      'Horario':(form.horaIni&&form.horaFin)?`${form.horaIni} a ${form.horaFin} hs`:'',
      'Ubicación':form.ubicacion,
      'Contacto Lugar':form.contacto,          // por defecto = el mismo contacto; si es otro, se cambia en el Calendar
    }
    valid.forEach((p,idx)=>{ row[`Pedido ${idx+1}`]=p.svc; row[`Precio ${idx+1}`]=Math.round(parseFloat(p.precio)||0) })
    // El PDF que ya se armó para el original viaja a la versión nueva (col "PDF Config"):
    // represupuestar es el mismo trabajo con otro número, no un PDF de cero. El generador
    // cruza línea por línea lo que cambió (precio, servicios) y conserva el resto.
    if(isRep && initialData['PDF Config']) row['PDF Config']=initialData['PDF Config']
    try{
      const r=await fetch('/api/presupuesto-nuevo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(row)})
      const j=await r.json()
      if(!j.ok){ showToast((j.error||'Error')+(j.detalles?': '+j.detalles.join(', '):''),'err'); setSaving(false); return }
      if(j.aviso) showToast(j.aviso,'err')   // p. ej. falta la columna "Precio visible" en el sheet
      // Represupuestar: marcar el original como REPRESUPUESTADO (con motivo)
      // `nuevo` va para que las tareas de Edición del original pasen al número nuevo
      // en vez de quedar huérfanas (y sin link a las carpetas, que se crean con el nuevo).
      if(isRep){
        try{ await fetch('/api/presupuesto-estado',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:initialData['Columna 1'], estado:'REPRESUPUESTADO', motivo:form.motivo, nuevo:j.numero})}) }
        catch(e){ showToast('Nuevo creado, pero no pude marcar el original — revisá','err') }
      }
      // Guardar entidades nuevas (contacto / agencia / cliente) en sus solapas
      if(ctNuevo || ctIncompleto){ try{ await fetch('/api/contacto-nuevo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:form.contacto, mail:ctNew.mail, telefono:ctNew.telefono, cuit:ctNew.cuit, agencia:form.agencia, cargo:ctNew.cargo})}) }catch(e){} }
      if(agNueva){ try{ await fetch('/api/agencia-upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:form.agencia, cuit:agNew.cuit, condIVA:agNew.condIVA, mailFact:agNew.mailFact, telefono:agNew.telefono})}) }catch(e){} }
      if(clNuevo){ try{ await fetch('/api/cliente-upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:form.cliente})}) }catch(e){} }
      limpiarBorrador()
      showToast(isRep?`Represupuesto #${j.numero} creado · original marcado`:`Presupuesto #${j.numero} creado`); onGuardado&&onGuardado()
    }catch(e){ showToast('Error de conexión','err'); setSaving(false) }
  }

  // ---- Que no se pierda lo cargado ----
  // Dos cosas distintas arreglan el mismo dolor: un clic de más afuera del cuadro
  // cerraba el modal y borraba media hora de trabajo, y cerrar la pestaña también.
  // El borrador se guarda en el navegador a cada tecla y vuelve solo al reabrir.
  const CLAVE_BORRADOR = isRep ? null : 'magma:presu-borrador'
  const hayDatos = !!(form.cliente.trim() || form.proyecto.trim() || form.agencia.trim() || (form.dias||[]).length || peds.some(x=>x.svc.trim()||x.precio))
  const [recuperado, setRecuperado] = useState(false)

  useEffect(()=>{
    if(!CLAVE_BORRADOR) return
    try{
      const b = JSON.parse(localStorage.getItem(CLAVE_BORRADOR)||'null')
      if(b?.form && (b.form.cliente||b.form.proyecto||b.form.agencia||(b.form.dias||[]).length||(b.peds||[]).some(x=>x.svc))){
        setForm(f=>({...f, ...b.form})); if(b.peds?.length) setPeds(b.peds); setRecuperado(true)
      }
    }catch(e){}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  useEffect(()=>{
    if(!CLAVE_BORRADOR) return
    if(!hayDatos){ try{ localStorage.removeItem(CLAVE_BORRADOR) }catch(e){}; return }
    try{ localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({form, peds, cuando:Date.now()})) }catch(e){}
  },[form, peds, hayDatos, CLAVE_BORRADOR])

  // Cerrar la pestaña con algo a medio cargar: el navegador pregunta.
  useEffect(()=>{
    if(!hayDatos) return
    const h = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return ()=>window.removeEventListener('beforeunload', h)
  },[hayDatos])

  const limpiarBorrador = ()=>{ try{ if(CLAVE_BORRADOR) localStorage.removeItem(CLAVE_BORRADOR) }catch(e){} }
  // El clic afuera ya no cierra y listo: si hay algo cargado, pregunta. Y aunque
  // digas que sí, el borrador queda guardado para recuperarlo.
  const cerrar = ()=>{
    if(hayDatos && !confirm('¿Cerrar el presupuesto?\n\nLo que cargaste queda guardado como borrador y vuelve solo la próxima vez que abras uno nuevo.')) return
    onClose && onClose()
  }
  const empezarDeCero = ()=>{
    if(!confirm('¿Descartar lo que quedó a medio cargar y empezar de cero?')) return
    limpiarBorrador(); onClose && onClose()
  }

  const colP = (lbl,key,opts)=> <div style={{flex:1, minWidth:opts?.min||140}}><label style={lblV2}>{lbl}</label>{opts?.list?<><input list={opts.list} value={form[key]} onChange={e=>upd(key,e.target.value)} placeholder={opts.ph||''} style={inpV2}/>{opts.datalist}</>:<input type={opts?.type||'text'} value={form[key]} onChange={e=>upd(key,e.target.value)} placeholder={opts?.ph||''} style={inpV2}/>}</div>

  return <div onClick={cerrar} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:900, display:'flex', justifyContent:'center', overflowY:'auto', padding:'32px 20px'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:900, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)', height:'fit-content'}}>
      <div style={{padding:'18px 24px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, background:T.surface, borderRadius:'16px 16px 0 0', zIndex:2}}>
        <div style={{fontSize:17, fontWeight:700, color:T.ink}}>{isRep?`Represupuestar #${initialData['Columna 1']}`:'Nuevo presupuesto'}</div>
        <button onClick={cerrar} style={{border:'none', background:'transparent', fontSize:22, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
      </div>

      <div style={{padding:'20px 24px'}}>
        {recuperado && <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', background:T.surfaceAlt, border:`1px solid ${T.border}`, borderRadius:10, padding:'10px 13px', marginBottom:14}}>
          <span style={{fontSize:12.5, color:T.ink2, flex:1}}>Recuperamos el presupuesto que habías dejado a medio cargar.</span>
          <button onClick={empezarDeCero} style={{padding:'5px 11px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:12, cursor:'pointer'}}>Empezar de cero</button>
        </div>}
        {isRep && <div style={{background:T.brandSoft, border:`1px solid ${T.brand}30`, borderRadius:10, padding:'12px 14px', marginBottom:16}}>
          <div style={{fontSize:12, color:T.ink2, marginBottom:8}}>Se crea una <strong>versión nueva</strong> (en EN ESPERA) con estos datos editables. El original <strong>#{initialData['Columna 1']}</strong> queda marcado como REPRESUPUESTADO.</div>
          <label style={{...lblV2, color:T.brand}}>Motivo del represupuesto *</label>
          {/* Chips = motivos comparables entre sí. Escritos a mano cada uno sale distinto
              y después no se puede agrupar para ver por qué se rehacen los presus. */}
          <div style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:8}}>
            {MOTIVOS_REPRESUPUESTADO.map(m=>{ const sel=form.motivo===m
              return <button key={m} type="button" onClick={()=>upd('motivo', sel?'':m)} style={{padding:'5px 11px', borderRadius:20, fontSize:11.5, cursor:'pointer', border:`1px solid ${sel?T.brand:T.border}`, background:sel?T.brandSoft:T.surface, color:sel?T.brand:T.ink2, fontWeight:sel?600:400}}>{m}</button>
            })}
          </div>
          <input value={form.motivo||''} onChange={e=>upd('motivo',e.target.value)} placeholder="Ej: cambio de scope, ajuste de precios, nuevo pedido del cliente…" style={{...inpV2, borderColor:form.motivo?T.border:T.brand}} autoFocus/>
          <div style={{display:'flex', justifyContent:'flex-end', marginTop:10}}>
            <button onClick={async()=>{
              if(!form.motivo||!form.motivo.trim()){ showToast('Poné el motivo primero (ej: duplicado)','err'); return }
              if(!window.confirm(`Marcar #${initialData['Columna 1']} como REPRESUPUESTADO sin crear uno nuevo.\nUsalo si la versión nueva ya está cargada aparte.\n\n¿Confirmás?`)) return
              try{ const r=await fetch('/api/presupuesto-estado',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:initialData['Columna 1'], estado:'REPRESUPUESTADO', motivo:form.motivo})}); const j=await r.json(); if(j.error){showToast(j.error,'err');return} showToast(`#${initialData['Columna 1']} marcado como represupuestado`); onGuardado&&onGuardado() }
              catch(e){ showToast('Error de conexión','err') }
            }} style={{padding:'7px 12px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:11.5, fontWeight:500, cursor:'pointer'}}>Ya lo cargué aparte — marcar este sin crear uno nuevo →</button>
          </div>
        </div>}
        {/* Datos */}
        <div style={{display:'flex', gap:12, flexWrap:'wrap', marginBottom:12}}>
          {colP('Agencia (quién paga)','agencia',{list:'np-ag', ph:'Directo si no hay', datalist:<datalist id="np-ag">{ags.map(a=><option key={a} value={a}/>)}</datalist>})}
          {colP('Cliente / Marca','cliente',{list:'np-cl', datalist:<datalist id="np-cl">{clis.map(a=><option key={a} value={a}/>)}</datalist>})}
        </div>
        <div style={{display:'flex', gap:12, flexWrap:'wrap', marginBottom:12}}>
          {colP('Proyecto','proyecto',{min:200})}
          {colP('Contacto','contacto',{list:'np-ct', datalist:<datalist id="np-ct">{cts.map(a=><option key={a} value={a}/>)}</datalist>})}
          {colP('PM','pm',{list:'np-pm', min:110, datalist:<datalist id="np-pm">{pms.map(a=><option key={a} value={a}/>)}</datalist>})}
        </div>
        {/* Entidades nuevas → completar datos (se guardan al crear el presu) */}
        {agNueva && <div style={{background:T.warnSoft, border:`1px solid ${T.warn}40`, borderRadius:10, padding:'12px 14px', marginBottom:12}}>
          <div style={{fontSize:12, fontWeight:600, color:T.warn, marginBottom:8}}>🏢 Agencia nueva: "{form.agencia}" — completá sus datos (se guarda)</div>
          <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
            <div style={{flex:'1 1 130px'}}><label style={lblV2}>CUIT</label><input value={agNew.cuit} onChange={e=>setAgNew(a=>({...a,cuit:e.target.value}))} style={inpV2}/></div>
            <div style={{flex:'1 1 150px'}}><label style={lblV2}>Cond. IVA</label><input value={agNew.condIVA} onChange={e=>setAgNew(a=>({...a,condIVA:e.target.value}))} style={inpV2}/></div>
            <div style={{flex:'1 1 160px'}}><label style={lblV2}>Mail facturación</label><input value={agNew.mailFact} onChange={e=>setAgNew(a=>({...a,mailFact:e.target.value}))} style={inpV2}/></div>
            <div style={{flex:'1 1 130px'}}><label style={lblV2}>Teléfono</label><input value={agNew.telefono} onChange={e=>setAgNew(a=>({...a,telefono:e.target.value}))} style={inpV2}/></div>
          </div>
        </div>}
        {ctMostrar && <div style={{background:T.warnSoft, border:`1px solid ${T.warn}40`, borderRadius:10, padding:'12px 14px', marginBottom:12}}>
          <div style={{fontSize:12, fontWeight:600, color:T.warn, marginBottom:8}}>☎ {ctNuevo?`Contacto nuevo: "${form.contacto}" — completá sus datos`:`A "${form.contacto}" le faltan datos — completalos`} (se guarda)</div>
          <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
            <div style={{flex:'1 1 160px'}}><label style={lblV2}>Mail</label><input value={ctNew.mail} onChange={e=>setCtNew(c=>({...c,mail:e.target.value}))} style={inpV2}/></div>
            <div style={{flex:'1 1 130px'}}><label style={lblV2}>Teléfono</label><input value={ctNew.telefono} onChange={e=>setCtNew(c=>({...c,telefono:e.target.value}))} style={inpV2}/></div>
            <div style={{flex:'1 1 130px'}}><label style={lblV2}>Cargo</label><input value={ctNew.cargo} onChange={e=>setCtNew(c=>({...c,cargo:e.target.value}))} style={inpV2}/></div>
            <div style={{flex:'1 1 130px'}}><label style={lblV2}>CUIT</label><input value={ctNew.cuit} onChange={e=>setCtNew(c=>({...c,cuit:e.target.value}))} style={inpV2}/></div>
          </div>
        </div>}
        {clNuevo && <div style={{fontSize:11.5, color:T.warn, fontWeight:600, marginBottom:12, marginTop:-2}}>🎯 Cliente nuevo: "{form.cliente}" — se guarda automáticamente al crear el presu.</div>}
        {/* Fecha */}
        <div style={{marginBottom:18}}>
          <label style={lblV2}>Fechas del evento</label>
          <CampoFechas dias={form.dias} tentativos={form.tentativos} onChange={(d,t)=>setForm(f=>({...f, dias:d, tentativos:t}))}/>
        </div>

        {/* Servicios */}
        <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:8}}>
          <div style={{fontSize:12.5, fontWeight:600, color:T.ink}}>Servicios</div>
          <div style={{flex:1}}/>
          <label title="El cliente ve cuánto sale cada servicio, no sólo el total. Se guarda en el presu y el PDF sale así." style={{display:'flex', gap:6, alignItems:'center', fontSize:11.5, fontWeight:form.desglosar?600:400, color:form.desglosar?T.pos:T.ink2, cursor:'pointer'}}>
            <input type="checkbox" checked={!!form.desglosar} onChange={e=>upd('desglosar',e.target.checked)} style={{cursor:'pointer'}}/>
            Mostrar precio por ítem al cliente
          </label>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'1.5fr 130px 58px 60px 48px 36px', gap:8, fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, padding:'0 2px 6px'}}>
          <span>Servicio</span><span style={{textAlign:'right'}}>Costo c/u</span><span style={{textAlign:'center'}}>Cant.</span><span style={{textAlign:'center'}}>Fee</span><span style={{textAlign:'center'}} title="El cliente ve el precio de ESTA línea (viáticos, rental…) aunque el resto del presu vaya sin precios. El precio final no cambia.">Ver $</span><span/>
        </div>
        {peds.map((p,i)=> !p.adicional && (()=>{ const n=cantDe(p), costo=parseFloat(p.precio)||0; return (
          <div key={p.id} style={{marginBottom:7}}>
            <div style={{display:'grid', gridTemplateColumns:'1.5fr 130px 58px 60px 48px 36px', gap:8, alignItems:'center'}}>
              <input list="np-svc" value={p.svc} onChange={e=>selSvc(i,e.target.value)} placeholder="Servicio" style={inpV2}/>
              <input type="number" value={p.precio} onChange={e=>updPed(i,{precio:e.target.value, manual:true})} placeholder="0" style={{...inpV2, textAlign:'right', fontFamily:MONO}}/>
              {/* 3 cápsulas = poner 3 acá, no cargar la misma línea tres veces */}
              <input type="number" min="1" max={MAX_SLOTS} value={p.cant ?? 1} onChange={e=>updPed(i,{cant:e.target.value})} title="Cuántos de este servicio" style={{...inpV2, textAlign:'center', fontFamily:MONO, padding:'8px 4px', color:n>1?T.brand:T.ink, fontWeight:n>1?600:400}}/>
              <input type="checkbox" checked={p.feeAg} onChange={e=>updPed(i,{feeAg:e.target.checked})} title="Aplica fee Magma" style={{justifySelf:'center', cursor:'pointer'}}/>
              {/* "$" de una línea sola: el cliente ve ese precio (viáticos, rental) sin abrir el resto */}
              <input type="checkbox" checked={!!form.desglosar||!!p.verPrecio} disabled={!!form.desglosar} onChange={e=>updPed(i,{verPrecio:e.target.checked})} title={form.desglosar?'Con "Mostrar precio por ítem" ya salen todos con precio':'El cliente ve el precio de esta línea aunque el resto vaya cerrado'} style={{justifySelf:'center', cursor:form.desglosar?'default':'pointer', accentColor:T.pos}}/>
              <button onClick={()=>delPed(i)} style={{border:'none', background:'transparent', color:T.ink3, cursor:'pointer', fontSize:16}}>×</button>
            </div>
            {n>1 && costo>0 && <div style={{fontSize:10.5, color:T.ink3, marginTop:3, paddingLeft:2}}>{n} × {fmt(costo)} = <strong style={{color:T.ink2}}>{fmt(costo*n)}</strong> de costo · van {n} líneas al sheet y {n} tareas al tablero de Edición</div>}
            {(form.desglosar||p.verPrecio) && (p.svc.trim()||costo>0) && <div style={{fontSize:10.5, marginTop:3, paddingLeft:2, color:costo>0?T.pos:T.warn}}>
              {costo>0
                ? <>El cliente ve <strong>{fmt(precioItem[p.id]||0)} + IVA</strong>{n>1?<span style={{color:T.ink3}}> · {fmt(Math.round((precioItem[p.id]||0)/n))} c/u</span>:null}{!form.desglosar && <span style={{color:T.ink3}}> · solo esta línea sale con precio, el resto no</span>}</>
                : <>Sin costo cargado — en el PDF sale listado sin precio</>}
            </div>}
          </div>
        )})())}
        <datalist id="np-svc">{svcs.map(s=><option key={s.n} value={s.n}/>)}</datalist>
        <div style={{display:'flex', gap:14, alignItems:'center'}}>
          <button onClick={()=>addPed(false)} style={{fontSize:12, color:T.ink2, background:'transparent', border:'none', cursor:'pointer', padding:'4px 0'}}>+ Agregar servicio</button>
          <button onClick={()=>setSvcNew({nombre:'',precio:'',fee:true})} style={{fontSize:12, color:T.brand, background:'transparent', border:'none', cursor:'pointer', padding:'4px 0'}}>+ Crear servicio nuevo</button>
        </div>
        {svcNew && <div style={{border:`1px solid ${T.brand}`, borderRadius:8, padding:12, marginTop:8, background:T.surfaceAlt}}>
          <div style={{fontSize:11, fontWeight:600, color:T.ink2, marginBottom:8}}>SERVICIO NUEVO — queda guardado para todos los presupuestos</div>
          <div style={{display:'grid', gridTemplateColumns:'1.5fr 130px', gap:8, marginBottom:8}}>
            <input value={svcNew.nombre} onChange={e=>setSvcNew(s=>({...s,nombre:e.target.value}))} placeholder="Ej: Locución" style={inpV2} autoFocus/>
            <input type="number" value={svcNew.precio} onChange={e=>setSvcNew(s=>({...s,precio:e.target.value}))} placeholder="precio" style={{...inpV2, textAlign:'right', fontFamily:MONO}}/>
          </div>
          <label style={{display:'flex', gap:6, alignItems:'center', fontSize:12, color:T.ink2, marginBottom:10, cursor:'pointer'}}>
            <input type="checkbox" checked={svcNew.fee} onChange={e=>setSvcNew(s=>({...s,fee:e.target.checked}))} style={{cursor:'pointer'}}/>
            Aplica fee Magma <span style={{color:T.ink3}}>(destildar si es un costo que se pasa tal cual: viáticos, rental…)</span>
          </label>
          <div style={{display:'flex', gap:8}}>
            <button onClick={guardarSvc} disabled={svcSaving} style={{fontSize:12, padding:'6px 14px', borderRadius:6, border:'none', background:T.brand, color:'#fff', cursor:svcSaving?'wait':'pointer'}}>{svcSaving?'Guardando…':'Guardar'}</button>
            <button onClick={()=>setSvcNew(null)} style={{fontSize:12, padding:'6px 14px', borderRadius:6, border:`1px solid ${T.border}`, background:'transparent', color:T.ink2, cursor:'pointer'}}>Cancelar</button>
          </div>
        </div>}

        {/* Adicionales opcionales */}
        {adicList.length>0 && <>
          <div style={{fontSize:12.5, fontWeight:600, color:T.ink, margin:'14px 0 6px'}}>Adicionales opcionales <span style={{fontWeight:400, color:T.ink3}}>(no suman al total principal)</span></div>
          <div style={{display:'grid', gridTemplateColumns:'1.5fr 110px 110px 36px', gap:8, fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, padding:'0 2px 5px'}}>
            <span>Adicional</span><span style={{textAlign:'right'}}>Costo (tuyo)</span><span style={{textAlign:'right'}}>Precio cliente</span><span/>
          </div>
          {peds.map((p,i)=> p.adicional && (()=>{ const costo=parseFloat(p.precio)||0, man=parseFloat(p.precioCliente)||0, cli=man>0?man:Math.round(costo*factor); return (
            <div key={p.id} style={{marginBottom:8}}>
              <div style={{display:'grid', gridTemplateColumns:'1.5fr 110px 110px 36px', gap:8, alignItems:'center'}}>
                <input list="np-svc" value={p.svc} onChange={e=>selSvc(i,e.target.value)} placeholder="Adicional" style={inpV2}/>
                <input type="number" value={p.precio} onChange={e=>updPed(i,{precio:e.target.value, manual:true})} placeholder="costo" style={{...inpV2, textAlign:'right', fontFamily:MONO}}/>
                <input type="number" value={p.precioCliente} onChange={e=>updPed(i,{precioCliente:e.target.value})} placeholder="auto" style={{...inpV2, textAlign:'right', fontFamily:MONO}}/>
                <button onClick={()=>delPed(i)} style={{border:'none', background:'transparent', color:T.ink3, cursor:'pointer', fontSize:16}}>×</button>
              </div>
              <div style={{fontSize:10.5, color:T.ink3, marginTop:3, paddingLeft:2}}>En el PDF el cliente ve: <strong style={{color:T.brand}}>{fmt(cli)} + IVA</strong>{man<=0?' (auto, con tu margen — escribí un precio cliente para fijarlo)':''}</div>
            </div>
          )})())}
        </>}
        <button onClick={()=>addPed(true)} style={{fontSize:12, color:T.ink2, background:'transparent', border:'none', cursor:'pointer', padding:'4px 0', marginLeft:adicList.length>0?0:12}}>+ Agregar adicional opcional</button>

        {/* Opciones de cálculo */}
        <div style={{display:'flex', gap:18, flexWrap:'wrap', alignItems:'flex-end', margin:'18px 0', paddingTop:16, borderTop:`1px solid ${T.border}`}}>
          <label style={{display:'flex', gap:7, alignItems:'center', fontSize:13, color:T.ink2, cursor:'pointer'}}><input type="checkbox" checked={form.gan} onChange={e=>upd('gan',e.target.checked)}/> Ganancias 35%</label>
          <label style={{display:'flex', gap:7, alignItems:'center', fontSize:13, color:T.ink2, cursor:'pointer'}}><input type="checkbox" checked={form.iibb} onChange={e=>upd('iibb',e.target.checked)}/> IIBB 4%</label>
          <div><label style={lblV2}>Plazo</label><select value={form.plazo} onChange={e=>upd('plazo',e.target.value)} style={{...inpV2, width:'auto'}}><option value="0">Contado</option><option value="15">15 días</option><option value="30">30 días</option><option value="60">60 días</option></select></div>
          <div style={{width:90}}><label style={lblV2}>Interés %</label><input type="number" value={form.interes} onChange={e=>upd('interes',e.target.value)} style={{...inpV2, textAlign:'right'}}/></div>
          <div><label style={lblV2}>Ajuste</label><select value={form.tajuste} onChange={e=>upd('tajuste',e.target.value)} style={{...inpV2, width:'auto'}}><option value="1">Recargo</option><option value="-1">Descuento</option></select></div>
          <div style={{width:120}}><label style={lblV2}>Monto ajuste</label><input type="number" value={form.ajuste} onChange={e=>upd('ajuste',e.target.value)} style={{...inpV2, textAlign:'right', fontFamily:MONO}}/></div>
          <div style={{width:100}}><label style={{...lblV2, color:T.warn}}>Desc. % cliente</label><input type="number" value={form.descPct} onChange={e=>aplicarDescPct(e.target.value)} placeholder="ej 15" style={{...inpV2, textAlign:'right', borderColor:T.warn}}/></div>
        </div>

        {/* Horario fácil + ubicación */}
        <div style={{display:'flex', gap:18, flexWrap:'wrap', alignItems:'flex-end', marginBottom:12}}>
          <div><label style={lblV2}>Horario del evento</label>
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <HoraInput value={form.horaIni} onChange={v=>upd('horaIni',v)} style={{...inpV2, width:88}}/>
              <span style={{fontSize:13, color:T.ink3}}>a</span>
              <HoraInput value={form.horaFin} onChange={v=>upd('horaFin',v)} style={{...inpV2, width:88}}/>
            </div>
          </div>
          <div style={{flex:1, minWidth:200}}><label style={lblV2}>Ubicación</label><input value={form.ubicacion} onChange={e=>upd('ubicacion',e.target.value)} placeholder="Dirección del evento" style={inpV2}/></div>
        </div>
        <div style={{fontSize:11.5, color:T.ink3, marginBottom:10}}>El contacto del lugar queda igual al Contacto; si es otro, se cambia en el Calendar.</div>
        {/* Brief de edición — sólo si el presu lleva post. Es el momento en que estás
            hablando con el cliente: después nadie vuelve a preguntar y el editor termina
            averiguándolo por WhatsApp. Nada es obligatorio: lo que falte se completa en
            el tablero de Edición. Duración y material salen solos del presupuesto. */}
        {hayEdicion && <div style={{border:`1px solid ${T.border}`, borderRadius:10, padding:'12px 14px', marginBottom:14, background:T.surfaceAlt}}>
          <div style={{fontSize:12.5, fontWeight:600, color:T.ink, marginBottom:3}}>El video que hay que editar</div>
          <div style={{fontSize:11.5, color:T.ink3, marginBottom:10, lineHeight:1.45}}>
            Se lo preguntás al cliente ahora y le llega solo al editor. {briefDerivado && <span>Del presu ya sale: <strong style={{color:T.ink2}}>{briefDerivado}</strong>.</span>}
          </div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:10}}>
            <div>
              <label style={lblV2}>Qué clase de video es</label>
              <select value={form.edClase} onChange={e=>upd('edClase',e.target.value)} style={{...inpV2, cursor:'pointer'}}>
                <option value="">— a definir —</option>
                {CLASES_VIDEO.map(c=><option key={c.id} value={c.label}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lblV2}>Formato</label>
              <select value={form.edFormato} onChange={e=>upd('edFormato',e.target.value)} style={{...inpV2, cursor:'pointer'}}>
                <option value="">— a definir —</option>
                {['Vertical (redes sociales)','Horizontal (YouTube / TV)','Los dos'].map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            {/vertical|los dos/i.test(form.edFormato) && <div>
              <label style={lblV2}>¿Dónde se publica?</label>
              <select value={form.edRed} onChange={e=>upd('edRed',e.target.value)} style={{...inpV2, cursor:'pointer'}}>
                <option value="">— a definir —</option>
                {['Instagram','TikTok','YouTube Shorts','LinkedIn','Varias'].map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            </div>}
            <div>
              <label style={lblV2}>¿Lleva gráfica del cliente?</label>
              <select value={form.edGrafica} onChange={e=>upd('edGrafica',e.target.value)} style={{...inpV2, cursor:'pointer'}}>
                <option value="">— a definir —</option>
                {['Sí','No','A definir'].map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
        </div>}
        <label style={lblV2}>Observaciones (salen en el PDF)</label>
        <textarea value={form.observaciones} onChange={e=>upd('observaciones',e.target.value)} rows={2} style={{...inpV2, resize:'vertical'}}/>
      </div>

      {/* Resumen + guardar (sticky bottom) */}
      <div style={{position:'sticky', bottom:0, background:T.surfaceAlt, borderTop:`1px solid ${T.border}`, borderRadius:'0 0 16px 16px', padding:'14px 24px'}}>
        <div style={{display:'flex', gap:20, flexWrap:'wrap', alignItems:'center', marginBottom:12}}>
          <Mini label="Subtotal" val={fmt(subtotal)}/>
          {fee>0&&<Mini label="Fee Magma" val={fmt(fee)} color={T.pos}/>}
          {form.gan&&<Mini label="Ganancias 35%" val={fmt(gan)}/>}
          {form.iibb&&<Mini label="IIBB 4%" val={fmt(iibb)}/>}
          {!!intMto&&<Mini label="Interés" val={fmt(intMto)}/>}
          {!!ajMto&&<Mini label="Ajuste" val={fmtS(ajMto)} color={ajMto<0?T.brand:T.ink}/>}
          <div style={{flex:1}}/>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:10.5, textTransform:'uppercase', letterSpacing:0.4, color:T.ink3, fontWeight:600}}>Precio final</div>
            <div style={{fontSize:26, fontWeight:700, fontFamily:MONO, color:T.brand}}>{fmt(total)}</div>
            {(opcRedondeo.length>0 || !!ajMto) && <div style={{display:'flex', gap:6, justifyContent:'flex-end', alignItems:'center', marginTop:6}}>
              <span style={{fontSize:10.5, color:T.ink3, textTransform:'uppercase', letterSpacing:0.3, fontWeight:600}}>Redondear a</span>
              {opcRedondeo.map(v=><button key={v} onClick={()=>fijarTotal(v)} title={`Precio final ${fmt(v)} — la diferencia va al ajuste`} style={{padding:'4px 9px', borderRadius:6, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:11.5, fontFamily:MONO, cursor:'pointer'}}>{fmt(v)}</button>)}
              {!!ajMto && <button onClick={()=>setForm(f=>({...f, ajuste:'0', descPct:''}))} title="Sacar el ajuste y volver al precio calculado" style={{padding:'4px 8px', borderRadius:6, border:'none', background:'transparent', color:T.ink3, fontSize:11.5, cursor:'pointer'}}>↺ sin ajuste</button>}
            </div>}
          </div>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:14}}>
          <span style={{fontSize:12, color:semaforo(margenBasePct).c, fontWeight:600}}>Margen {Math.round(margenBasePct)}% · {semaforo(margenBasePct).l}</span>
          {form.desglosar && <span style={{fontSize:11.5, color:T.pos}}>Precio abierto · los ítems suman {fmt(Object.values(precioItem).reduce((s,v)=>s+v,0))}</span>}
          {!form.desglosar && hayVerPrecio && <span style={{fontSize:11.5, color:T.pos}}>Con precio a la vista: {baseList.filter(p=>p.verPrecio&&p.svc.trim()).map(p=>p.svc).join(', ')}</span>}
          {adicList.length>0 && <span style={{fontSize:11.5, color:T.ink3}}>+ {fmt(adicCalc.reduce((s,a)=>s+a.precioCliente,0))} en adicionales</span>}
          <div style={{flex:1}}/>
          {falta.length>0 && <span style={{fontSize:12, color:T.warn}}>Falta: {falta.join(', ')}</span>}
          <button onClick={cerrar} style={{padding:'10px 18px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:500, cursor:'pointer'}}>Cancelar</button>
          <button onClick={guardar} disabled={!puedeGuardar} style={{padding:'10px 24px', borderRadius:9, border:'none', background:puedeGuardar?T.brand:T.ink3, color:'#fff', fontSize:13.5, fontWeight:600, cursor:puedeGuardar?'pointer':'default'}}>{saving?'Guardando…':(isRep?'Crear represupuesto':'Crear presupuesto')}</button>
        </div>
      </div>
    </div>
  </div>
}

// ============================ APROBAR: QUÉ SE LLEVÓ EL CLIENTE ============================
// El parseo de los pedidos vive en lib/desglose.js (itemsDePresu): lo comparten este
// modal y el generador de PDF, y tienen que leer los slots igual.
function presuTieneAdicionales(presu){ return String(presu?.['Es Adicional']||'').split('|').includes('1') }
// Cuándo hay algo que elegir al aprobar: o hay adicionales opcionales, o el presu se
// mandó con el precio abierto por ítem y el cliente pudo recortar líneas.
function presuTieneOpciones(presu){ return presuTieneAdicionales(presu) || presuDesglosado(presu) }

// Una línea tildable del modal. Va afuera del componente a propósito: definirla adentro
// la recrea en cada render y React remonta el input en cada clic (ver [[project_bug_inputs_pierden_foco]]).
function FilaOpcion({marcado, nombre, precio, esAdic, onToggle}){
  return <label style={{display:'flex', alignItems:'center', gap:10, padding:'10px 12px', border:`1px solid ${marcado?(esAdic?T.brand:T.pos):T.border}`, borderRadius:10, marginBottom:8, cursor:'pointer', background:marcado?'transparent':T.surfaceAlt}}>
    <input type="checkbox" checked={marcado} onChange={onToggle}/>
    <span style={{flex:1, fontSize:13, color:marcado?T.ink:T.ink3, textDecoration:marcado?'none':'line-through'}}>{nombre}</span>
    <span style={{fontSize:13, fontFamily:MONO, color:marcado?T.ink:T.ink3}}>{fmt(precio)}</span>
  </label>
}

// 🔒 Resguardo del cobro. Desde el 08/10/2026 nada se aprueba sin la seña del 30 % cobrada o la
// orden de compra del cliente (lo exige /api/presupuesto-estado; acá se pide ANTES para no chocar
// contra el error). CeraVe #2355 fue la gota: 4 presupuestos, 11 piezas por 8 cotizadas, $0 de seña.
// Un presupuesto en $0 o que ya tiene resguardo (col Resguardo de PRESUPUESTOS) no vuelve a pedirlo.
// Con "Cuenta corriente" u "OC después" (condición de la agencia o del cliente) no se pide nada: el servidor lo anota solo.
const necesitaResguardo = (p, agencias, clientes) => parseMonto(p['Precio Final'])>0 && !String(p['Resguardo']||'').trim() && !sinPedir(condicionDe(p, agencias, clientes))
function ResguardoModal({presu, onClose, onConfirm, condicion=''}){
  const num=presu['Columna 1'], total=parseMonto(presu['Precio Final']), sena30=Math.round(total*0.3)
  const [tipo,setTipo]=useState(esOC(condicion)?'oc':'sena'), [monto,setMonto]=useState(sena30), [ref,setRef]=useState(''), [copiado,setCopiado]=useState(false)
  const [fecha,setFecha]=useState(()=>new Date().toLocaleDateString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'}))
  const ok = tipo==='sena' ? Number(monto)>0 : ref.trim()!==''
  const pedido=`Hola! Para dejar reservada la fecha${presu['Fecha Evento']?' del '+presu['Fecha Evento']:''} necesitamos la seña del 30% del presupuesto #${num}: ${fmt(sena30)} + IVA. Con la transferencia confirmamos el equipo. Gracias!`
  async function copiar(){ try{ await navigator.clipboard.writeText(pedido); setCopiado(true); setTimeout(()=>setCopiado(false),2000) }catch(e){} }
  const inp={width:'100%', padding:'9px 11px', borderRadius:8, border:`1px solid ${T.border}`, fontSize:13.5, background:T.surface, color:T.ink, boxSizing:'border-box', marginTop:4}
  const lab={fontSize:11.5, color:T.ink3, display:'block'}
  const opcion=(k,titulo,sub)=><button type="button" onClick={()=>setTipo(k)} style={{flex:1, textAlign:'left', padding:'12px 14px', borderRadius:10, border:`2px solid ${tipo===k?T.pos:T.border}`, background:T.surface, cursor:'pointer'}}>
    <div style={{fontSize:13.5, fontWeight:600, color:T.ink}}>{tipo===k?'● ':'○ '}{titulo}</div><div style={{fontSize:11.5, color:T.ink3, marginTop:2}}>{sub}</div></button>
  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:930, display:'flex', justifyContent:'center', alignItems:'flex-start', padding:'60px 20px', overflowY:'auto'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:460, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)'}}>
      <div style={{padding:'18px 22px', borderBottom:`1px solid ${T.border}`}}>
        <div style={{fontSize:16, fontWeight:700, color:T.ink}}>Antes de aprobar #{num}</div>
        <div style={{fontSize:12, color:T.ink3, marginTop:2}}>{presu['Proyecto']||presu['Cliente']||''} · {fmt(total)} + IVA</div>
      </div>
      <div style={{padding:'18px 22px'}}>
        <div style={{fontSize:12, color:condicion?T.ink2:T.warn, marginBottom:8}}>{condicion ? `Condición de ${presu['Agencia']||presu['Cliente']}: ${condicion}` : `${presu['Agencia']||presu['Cliente']||'Este cliente'} no tiene condición de cobro cargada: rige Seña 30%. Se cambia en Agencias.`}</div>
        <div style={{fontSize:13, color:T.ink2, marginBottom:12}}>¿Cómo está resguardado el cobro? Sin seña ni orden de compra el trabajo no se aprueba ni se agenda.</div>
        <div style={{display:'flex', gap:8}}>
          {opcion('sena','Seña cobrada','El 30% ya entró')}
          {opcion('oc','Orden de compra','El cliente mandó la OC (agencias a 60/90 días)')}
        </div>
        {tipo==='sena' ? <div style={{marginTop:14, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
            <label style={lab}>Monto cobrado (sugerido: 30% de {fmt(total)})<input id="resg-monto" type="number" value={monto} onChange={e=>setMonto(e.target.value)} style={inp}/></label>
            <label style={lab}>Fecha<input id="resg-fecha" value={fecha} onChange={e=>setFecha(e.target.value)} style={inp}/></label>
            <label style={{...lab, gridColumn:'1 / -1'}}>Cómo entró (opcional)<input id="resg-ref" value={ref} onChange={e=>setRef(e.target.value)} placeholder="transferencia BBVA, efectivo…" style={inp}/></label>
          </div>
        : <div style={{marginTop:14, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
            <label style={{...lab, gridColumn:'1 / -1'}}>N° de orden de compra (o link)<input id="resg-oc" value={ref} onChange={e=>setRef(e.target.value)} placeholder="4500123456" style={inp}/></label>
            <label style={lab}>Fecha<input id="resg-fecha-oc" value={fecha} onChange={e=>setFecha(e.target.value)} style={inp}/></label>
          </div>}
        <div style={{marginTop:16, padding:'10px 12px', background:'rgba(0,0,0,0.035)', borderRadius:8, fontSize:12, color:T.ink2, display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap'}}>
          <span>¿Todavía no hay ninguna de las dos? Pedí la seña y volvé.</span>
          <button type="button" onClick={copiar} style={miniBtn}>{copiado?'Copiado ✓':'Copiar el pedido de seña'}</button>
        </div>
      </div>
      <div style={{padding:'14px 22px', borderTop:`1px solid ${T.border}`, display:'flex', gap:10, justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{padding:'9px 18px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:500, cursor:'pointer'}}>Todavía no</button>
        <button onClick={()=>onConfirm({tipo, monto:Number(monto)||0, ref:ref.trim(), fecha})} disabled={!ok} style={{padding:'9px 22px', borderRadius:9, border:'none', background:T.pos, color:'#fff', fontSize:13.5, fontWeight:600, cursor:ok?'pointer':'default', opacity:ok?1:0.6}}>Aprobar #{num}</button>
      </div>
    </div>
  </div>
}
function AprobarAdicionalesModal({presu, onClose, onConfirm, saving}){
  const desglosado=presuDesglosado(presu)
  const items=itemsDePresu(presu)
  const opts=opcionesDePresu(presu)
  const total=opts.total
  const base=items.filter(i=>!i.adicional), adicRaw=items.filter(i=>i.adicional)
  // Precio de cada línea base = el mismo desglose que vio el cliente en el PDF (suma = total).
  const preciosBase={}; desglosarPrecio(base, {...opts, total}).lineas.forEach(l=>{ preciosBase[l.k]=l.precio })
  // Adicionales: precio manual si lo tiene, si no el automático por factor (como siempre).
  const baseSubtotal=base.reduce((s,p)=>s+p.costo,0)
  const factor=baseSubtotal>0?total/baseSubtotal:1
  const adic=adicRaw.map(a=>({...a, cli:a.precioClienteManual>0?a.precioClienteManual:Math.round(a.costo*factor)}))
  // Las líneas base arrancan tildadas (es lo que se presupuestó), los adicionales no.
  const [tom,setTom]=useState(()=>Object.fromEntries(items.map(i=>[i.k, !i.adicional])))
  const baseTom=base.filter(b=>tom[b.k]), adicTom=adic.filter(a=>tom[a.k])
  const sacadas=base.filter(b=>!tom[b.k])
  const sumaBase=desglosado ? baseTom.reduce((s,b)=>s+(preciosBase[b.k]||0),0) : total
  const sumaTom=adicTom.reduce((s,a)=>s+a.cli,0)
  const totalFinal=sumaBase+sumaTom
  const sinNada=totalFinal<=0 || (desglosado && baseTom.length===0 && adicTom.length===0)
  function confirmar(){
    // Lo que el cliente no tomó viaja en 'Es Adicional': es el flag que mira
    // presupuesto-estado para NO copiar esa línea a PROYECTOS (no se le paga a nadie).
    const nuevoEsAdic=items.map(i=> tom[i.k] ? '0' : '1').join('|')
    // Un adicional tomado ya viene con margen adentro de su precio: marcarlo con fee
    // deja el margen en "Fee Agencia" en vez de disfrazarlo de ajuste.
    const nuevoFee=items.map(i=> (i.adicional && tom[i.k]) ? '1' : (i.fee?'1':'0')).join('|')
    // Sacar una línea no es sólo restar plata: subtotal, fee e impuestos tienen que volver a dar.
    const finales=items.filter(i=>tom[i.k]).map(i=>({...i, fee: i.adicional ? true : i.fee}))
    const t=recalcularTotales(finales, {...opts, totalObjetivo: totalFinal})
    onConfirm({ nuevoEsAdic, nuevoTotal: totalFinal, extras:{
      'Fee Servicios': nuevoFee,
      'Subtotal': t.subtotal, 'Fee Agencia': t.fee,
      'Impuesto a las ganancias': t.gan, 'IIBB': t.iibb,
      'Interes $': t.interes, 'Ajuste': t.ajuste,
    }})
  }
  const toggle=k=>setTom(t=>({...t,[k]:!t[k]}))
  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:920, display:'flex', justifyContent:'center', alignItems:'flex-start', padding:'60px 20px', overflowY:'auto'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:460, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)'}}>
      <div style={{padding:'18px 22px', borderBottom:`1px solid ${T.border}`}}>
        <div style={{fontSize:16, fontWeight:700, color:T.ink}}>Aprobar #{presu['Columna 1']}</div>
        <div style={{fontSize:12, color:T.ink3, marginTop:2}}>{presu['Proyecto']||presu['Cliente']||''}</div>
      </div>
      <div style={{padding:'18px 22px'}}>
        <div style={{fontSize:13, color:T.ink2, marginBottom:12}}>
          {desglosado
            ? '¿Qué aprobó el cliente? Este presu se mandó con el precio por ítem, así que puede haber sacado alguno. Destildá lo que no va — sale del total y del proyecto.'
            : '¿El cliente tomó algún adicional? Tildá los que aceptó — se suman al total y al proyecto.'}
        </div>
        {desglosado && base.map(b=><FilaOpcion key={b.k} marcado={!!tom[b.k]} nombre={b.nombre} precio={preciosBase[b.k]||0} onToggle={()=>toggle(b.k)}/>)}
        {desglosado && adic.length>0 && <div style={{fontSize:11, color:T.ink3, textTransform:'uppercase', letterSpacing:'0.06em', margin:'14px 0 8px'}}>Adicionales opcionales</div>}
        {adic.map(a=><FilaOpcion key={a.k} marcado={!!tom[a.k]} nombre={a.nombre} precio={a.cli} esAdic onToggle={()=>toggle(a.k)}/>)}
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:14, paddingTop:12, borderTop:`1px solid ${T.border}`}}>
          <span style={{fontSize:12.5, color:T.ink2}}>Total a aprobar</span>
          <span style={{fontSize:20, fontWeight:700, fontFamily:MONO, color:T.pos}}>{fmt(totalFinal)}</span>
        </div>
        {(sumaTom>0 || sacadas.length>0) && <div style={{fontSize:11.5, color:T.ink3, textAlign:'right', marginTop:2}}>
          de {fmt(total)} presupuestado
          {sumaTom>0 && ` · + ${fmt(sumaTom)} en adicionales`}
          {sacadas.length>0 && ` · − ${fmt(total-sumaBase)} (${sacadas.map(s=>s.nombre).join(', ')})`}
        </div>}
      </div>
      <div style={{padding:'14px 22px', borderTop:`1px solid ${T.border}`, display:'flex', gap:10, justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{padding:'9px 18px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:500, cursor:'pointer'}}>Cancelar</button>
        <button onClick={confirmar} disabled={saving||sinNada} style={{padding:'9px 22px', borderRadius:9, border:'none', background:T.pos, color:'#fff', fontSize:13.5, fontWeight:600, cursor:(saving||sinNada)?'default':'pointer', opacity:(saving||sinNada)?0.6:1}}>{saving?'Aprobando…':'Aprobar'}</button>
      </div>
    </div>
  </div>
}

// Confirmación para eliminar un presupuesto cargado por error.
// El backend bloquea si ya tiene proyecto o factura, y deja backup de la fila en LOG.
function EliminarPresupuestoModal({presu, onClose, onConfirm, saving}){
  const id=presu['Columna 1']
  const total=parseMonto(presu['Precio Final'])
  const datos=[['Agencia',presu['Agencia']],['Cliente',presu['Cliente']],['Proyecto',presu['Proyecto']],
    ['Fecha evento',presu['Fecha Evento']],['Contacto',presu['Contacto']],['PM',presu['PM Interno']],
    ['Estado',presu['Estado']]].filter(x=>x[1])
  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:920, display:'flex', justifyContent:'center', alignItems:'flex-start', padding:'60px 20px', overflowY:'auto'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:460, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)'}}>
      <div style={{padding:'18px 22px', borderBottom:`1px solid ${T.border}`}}>
        <div style={{fontSize:16, fontWeight:700, color:T.ink}}>Eliminar presupuesto #{id}</div>
        <div style={{fontSize:12, color:T.ink3, marginTop:2}}>Se borra del sheet. Esto no se puede deshacer desde la app.</div>
      </div>
      <div style={{padding:'18px 22px'}}>
        <div style={{border:`1px solid ${T.border}`, borderRadius:10, overflow:'hidden'}}>
          {datos.map(([k,v],i)=>(
            <div key={k} style={{display:'flex', justifyContent:'space-between', gap:14, padding:'8px 13px', borderTop:i===0?'none':`1px solid ${T.border}`}}>
              <span style={{fontSize:11.5, color:T.ink3}}>{k}</span>
              <span style={{fontSize:12.5, color:T.ink, textAlign:'right'}}>{v}</span>
            </div>
          ))}
          <div style={{display:'flex', justifyContent:'space-between', padding:'9px 13px', borderTop:`1px solid ${T.border}`, background:T.surfaceAlt}}>
            <span style={{fontSize:12.5, fontWeight:600, color:T.ink}}>Precio final</span>
            <span style={{fontSize:14, fontWeight:700, fontFamily:MONO, color:T.ink}}>{fmt(total)}</span>
          </div>
        </div>
        <div style={{fontSize:11.5, color:T.ink3, marginTop:11, lineHeight:1.5}}>
          Queda una copia guardada en la solapa LOG por si hay que recuperarlo.<br/>
          Si el presupuesto ya tiene proyecto o factura cargada, no se va a poder eliminar.
        </div>
      </div>
      <div style={{padding:'14px 22px', borderTop:`1px solid ${T.border}`, display:'flex', gap:10, justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{padding:'9px 18px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:500, cursor:'pointer'}}>Cancelar</button>
        <button onClick={onConfirm} disabled={saving} style={{padding:'9px 22px', borderRadius:9, border:'none', background:T.brand, color:'#fff', fontSize:13.5, fontWeight:600, cursor:saving?'default':'pointer', opacity:saving?0.6:1}}>{saving?'Eliminando…':'Sí, eliminar'}</button>
      </div>
    </div>
  </div>
}

// ============================ CALENDARIO ============================
// Devuelve [{d, tent}] — tent = el día todavía no está confirmado. Un trabajo puede
// tener las dos cosas a la vez: Popstars #2256 filmó el 3 y el 4 de septiembre y los
// otros 17 días son "a confirmar" (van con "?" en Fechas Adicionales, ver lib/fechas.js).
// Tipo 'tentativa' = ninguno confirmado todavía (el trabajo sí, las fechas no).
function fechasDelEvento(fechaPrincipal, tipoFechas, fechasAdicionales){
  const out=[]; const f0=parseD(fechaPrincipal); if(!f0) return out
  const tipo=String(tipoFechas||'').toLowerCase().trim(), ad=String(fechasAdicionales||'').trim()
  if(tipo==='tentativa'){ out.push({d:f0, tent:true}); ad.split('|').filter(Boolean).forEach(s=>{const f=parseD(s.trim().replace(/^\?/,''));if(f)out.push({d:f, tent:true})}); return out }
  // Rango sin fin, o con el fin ANTES del inicio (pasa al editar la fecha y no el rango):
  // se muestra el día principal, igual que lib/fechas.js y el sync de Calendar. Antes el
  // while no corría nunca y el trabajo no se dibujaba en NINGÚN día (#2257 Popstars, $7,5M).
  if(tipo==='rango'&&ad){ const f1=parseD(ad); if(!f1||f1.getTime()<f0.getTime()){out.push({d:f0, tent:false});return out} let d=new Date(f0); while(d.getTime()<=f1.getTime()){out.push({d:new Date(d), tent:false});d.setDate(d.getDate()+1)} }
  else if(tipo==='multi'&&ad){ out.push({d:f0, tent:false}); ad.split('|').filter(Boolean).forEach(s=>{const t=s.trim(); const esT=t.startsWith('?'); const f=parseD(t.replace(/^\?/,'')); if(f)out.push({d:f, tent:esT})}) }
  else out.push({d:f0, tent:false})
  return out
}
const dayKey = d => d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate()
// Normaliza para comparar. Saca los espacios invisibles que el sheet arrastra al copiar y pegar
// (NBSP, zero-width), colapsa los espacios de mas, baja a minuscula y saca tildes. Sin esto
// "Somos Magma" y "Somos  Magma" se ven identicos en pantalla pero cuentan como dos personas.
const normTxt = s => String(s||'').replace(/[\u00a0\u200b-\u200d\ufeff]/g,' ').trim().replace(/\s+/g,' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
// Una celda rota del sheet (#ERROR!, #N/A, #REF!...) no es un dato: se trata como vacía.
// Pasa cuando el valor arranca con "+" y Sheets lo interpreta como fórmula (ej: teléfonos +54 9 11...).
const ERR_SHEET = /^#(ERROR!|REF!|N\/A|VALUE!|NAME\?|DIV\/0!|NUM!|NULL!)/
const sinErr = v => { const s = String(v||'').trim(); return ERR_SHEET.test(s) ? '' : s }

// soloVer = usuario de acceso parcial (ej Dani): ve la agenda, no aprueba ni edita.
// El calendario se desmonta al abrir una entrega en Edición. Al volver tiene que
// estar como quedó — mes, día elegido, capa y de quién — y no otra vez en "todo el
// equipo". Vive lo que dura la pestaña.
const calMem={}
function Calendario({data, onRefresh, showToast, soloVer=false, goTo, mail}){
  const proyectos=data.proyectos||[], presus=data.presupuestos||[], rrhh=data.rrhh||[]
  const now=new Date()
  const [ref,setRef]=useState(calMem.ref||{a:now.getFullYear(), m:now.getMonth()})
  const [diaSel,setDiaSel]=useState(calMem.diaSel||null)
  // Dos capas: los RODAJES (lo que ya estaba) y las ENTREGAS de edición, cada
  // una en el día en que se prometió. Juan, 14/9/2026: "un calendario con los
  // edits, así Dani y Lulu ven más visual lo que tienen que hacer". Quien solo
  // ve Edición + Calendario (Dani) arranca en Entregas; el resto ve las dos.
  const [capa,setCapa]=useState(calMem.capa||(soloVer?'entregas':'todo'))
  // Quien edita arranca viendo SUS entregas (Dani, 17/9/2026: "si yo quiero ver solo
  // mi calendario…"). Lo que elija después queda recordado en su navegador.
  const [editorF,setEditorF]=useState(()=>{
    if(calMem.editorF) return calMem.editorF
    let g=null; try{ g=window.localStorage.getItem('cal-editor') }catch(e){}
    if(g) return g
    const yo=quienSoy(mail, rrhh).editor
    return yo && (data.edicion||[]).some(f=>!estaCerradoEd(f.Estado) && canonStaff(String(f.Editor||'').trim())===yo) ? yo : 'todos'
  })
  const elegirEditor=v=>{ setEditorF(v); try{ window.localStorage.setItem('cal-editor', v) }catch(e){} }
  useEffect(()=>{ Object.assign(calMem,{ref,diaSel,capa,editorF}) },[ref,diaSel,capa,editorF])
  // Un clic en la entrega abre su ficha: ese trabajo solo, sin el resto del tablero.
  const abrirEntrega=(f,d)=>{ if(!goTo) return; if(d) calMem.diaSel=d; goTo('edicion',{abrir:f.ID, desde:'calendario'}) }
  const verRod = capa!=='entregas', verEnt = capa!=='rodajes'
  const edicion=(data.edicion||[]).filter(f=>String(f.ID||'').trim())
  const hoy0=hoyCeroEd()
  const entregasPorDia={}; let sinFecha=0
  edicion.forEach(f=>{
    const ed=canonStaff(String(f.Editor||'').trim())
    if(editorF==='__sin__'){ if(ed) return } else if(editorF!=='todos' && ed!==editorF) return
    const cerrado=estaCerradoEd(f.Estado)
    // Abiertas: el día prometido (o el que sugiere el manual si el PM no puso fecha).
    // Cerradas: el día en que se entregaron, en gris, para ver qué salió.
    const d = cerrado ? parseFechaAREd(f['Fecha entrega']) : (parseFechaAREd(f['Fecha compromiso'])||fechaSugeridaEd(f['Fecha Evento'], f.Entregable))
    if(!d){ if(!cerrado) sinFecha++; return }
    const k=dayKey(d)
    ;(entregasPorDia[k]=entregasPorDia[k]||[]).push({...f, __sem:semaforoEd(f,hoy0), __estimada:!cerrado&&!String(f['Fecha compromiso']||'').trim(), __cerrado:cerrado})
  })
  const editores=[...new Set(edicion.filter(f=>!estaCerradoEd(f.Estado)).map(f=>canonStaff(String(f.Editor||'').trim())).filter(Boolean))].sort()
  const sinAsignar=edicion.filter(f=>!estaCerradoEd(f.Estado)&&!String(f.Editor||'').trim()).length
  const [staffModal,setStaffModal]=useState(null)   // {proy, presu}
  const [pendingStaff,setPendingStaff]=useState(null) // num: abrir staff apenas exista el proyecto (tras aprobar)
  const [editando,setEditando]=useState(null)       // presupuesto a editar (fecha/horario/ubicación/etc)
  const [aprobAdic,setAprobAdic]=useState(null), [aprobSaving,setAprobSaving]=useState(false)
  const [motivoModal,setMotivoModal]=useState(null)   // {num, estado} — pide el porqué antes de desaprobar
  const [motivoSaving,setMotivoSaving]=useState(false)
  const [represu,setRepresu]=useState(null)           // presupuesto a represupuestar (versión nueva)
  const [resg,setResg]=useState(null), [resgPend,setResgPend]=useState(null)   // 🔒 resguardo del cobro antes de aprobar
  async function aprobarConAdic({nuevoEsAdic, nuevoTotal, extras}){
    const p=aprobAdic; if(!p) return; const id=p['Columna 1']
    setAprobSaving(true)
    try{
      await fetch('/api/presupuesto-editar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, cambios:{'Es Adicional':nuevoEsAdic, 'Precio Final':Math.round(nuevoTotal), 'Total':Math.round(nuevoTotal), ...(extras||{})}})})
      const r=await fetch('/api/presupuesto-estado',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, estado:'APROBADO', noCalendar:true, resguardo: resgPend?.num===id ? resgPend.r : undefined})})
      const j=await r.json(); if(j.error){ showToast(j.error,'err'); setAprobSaving(false); return }
      showToast(`#${id} aprobado`); setAprobAdic(null); setAprobSaving(false); setPendingStaff(id)
      if(onRefresh) onRefresh()
      fetch('/api/calendar-evento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num:id, accion:'aprobar'})}).catch(()=>{})
    }catch(e){ showToast('Error de conexión','err'); setAprobSaving(false) }
  }
  const rrhhNames=[...new Set(rrhh.map(r=>r['Nombre Apellido']||r['Nombre']).filter(Boolean))].sort()
  const serviciosConocidos=[...new Set([...getSvcs(data).map(s=>s.n), ...(data.listado?.servicios||[])])].filter(Boolean).sort()

  const presusByNum={}; presus.forEach(p=>{presusByNum[String(p['Columna 1']||'').trim()]=p})
  const proyByNum={}; proyectos.forEach(p=>{proyByNum[String(p['N° presupuesto']||'').trim()]=p})
  // Abrir el cargador de staff apenas el proyecto exista (después de aprobar)
  useEffect(()=>{ if(pendingStaff){ const proy=proyByNum[String(pendingStaff).trim()]; if(proy){ setStaffModal({proy, presu:presusByNum[String(pendingStaff).trim()]}); setPendingStaff(null) } } /* eslint-disable-next-line */ },[data.proyectos, pendingStaff])
  // Clave de un trabajo. Los presus se identifican por fila porque hay N° repetidos
  // (#1833 aparece 4 veces); los proyectos no traen __row, van por N°+nombre.
  const claveTrab = p => String(p.__row ?? '')+'#'+String(p['N° presupuesto']||p['Columna 1']||'')+'|'+(p['Proyecto']||'')
  const aprobadosPorDia={}, enEsperaPorDia={}
  const tentPorDia={}   // dayKey → Set de trabajos que ESE día todavía no tienen confirmado
  const marcarTent=(k,p)=>{ (tentPorDia[k]=tentPorDia[k]||new Set()).add(claveTrab(p)) }
  proyectos.forEach(p=>{ const presu=presusByNum[String(p['N° presupuesto']||'').trim()]; fechasDelEvento(p['Fecha Evento'], presu?.['Tipo Fechas'], presu?.['Fechas Adicionales']).forEach(({d,tent})=>{ const k=dayKey(d); (aprobadosPorDia[k]=aprobadosPorDia[k]||[]).push(p); if(tent) marcarTent(k,p) }) })
  presus.forEach(p=>{ if(String(p['Estado']||'').toUpperCase()!=='EN ESPERA') return; fechasDelEvento(p['Fecha Evento'], p['Tipo Fechas'], p['Fechas Adicionales']).forEach(({d,tent})=>{ const k=dayKey(d); (enEsperaPorDia[k]=enEsperaPorDia[k]||[]).push(p); if(tent) marcarTent(k,p) }) })
  const esTentDia=(k,p)=> !!tentPorDia[k]?.has(claveTrab(p))

  // grilla (lunes primero)
  const primDia=new Date(ref.a, ref.m, 1)
  const ultDia=new Date(ref.a, ref.m+1, 0).getDate()
  const offset=(primDia.getDay()+6)%7
  const celdas=[]; for(let i=0;i<offset;i++) celdas.push(null); for(let d=1;d<=ultDia;d++) celdas.push(new Date(ref.a, ref.m, d))
  while(celdas.length%7!==0) celdas.push(null)

  // KPIs del mes — un trabajo cuenta UNA sola vez aunque ocupe varios días del calendario.
  // Antes se sumaba el total completo por cada jornada: Popstars (19 días × $6,9M) solito
  // inflaba septiembre 2026 en $131,9M sobre $35,5M reales. Las jornadas van aparte, que
  // es el dato operativo (cuántos días de rodaje tiene el mes), no plata.
  let totAprob=0,cntAprob=0,totEsp=0,cntEsp=0,jorAprob=0,jorEsp=0,porConfirmar=0
  const vistosAp=new Set(), vistosEs=new Set()
  const esDelMesRef = k => { const [y,m]=k.split('-').map(Number); return y===ref.a&&m===ref.m }
  Object.keys(aprobadosPorDia).filter(esDelMesRef).forEach(k=> aprobadosPorDia[k].forEach(p=>{
    if(esTentDia(k,p)) porConfirmar++; else jorAprob++   // un día sin confirmar no es una jornada agendada
    const key=claveTrab(p)
    if(vistosAp.has(key)) return
    vistosAp.add(key); totAprob+=parseMonto(p['Total ']||p['Total']||p['Precio Final']); cntAprob++
  }))
  Object.keys(enEsperaPorDia).filter(esDelMesRef).forEach(k=> enEsperaPorDia[k].forEach(p=>{
    jorEsp++
    const key=claveTrab(p)
    if(vistosEs.has(key)) return
    vistosEs.add(key); totEsp+=parseMonto(p['Precio Final']); cntEsp++
  }))

  // Entregas del mes: cuántas y cuántas ya están atrasadas
  let cntEnt=0, entAtras=0, entHechas=0
  Object.keys(entregasPorDia).filter(esDelMesRef).forEach(k=> entregasPorDia[k].forEach(f=>{ if(f.__cerrado) entHechas++; else { cntEnt++; if(f.__sem.nivel==='rojo') entAtras++ } }))

  const navMes=delta=>{ const d=new Date(ref.a, ref.m+delta, 1); setRef({a:d.getFullYear(),m:d.getMonth()}); setDiaSel(null) }
  const aprobSel = diaSel&&verRod ? (aprobadosPorDia[dayKey(diaSel)]||[]) : []
  const espSel = diaSel&&verRod ? (enEsperaPorDia[dayKey(diaSel)]||[]) : []
  const entSel = diaSel&&verEnt ? (entregasPorDia[dayKey(diaSel)]||[]) : []

  async function setEstado(num, estado, motivo, resguardo){
    if(estado!=='APROBADO' && !motivo && !window.confirm(`¿Marcar #${num} como ${estadoInfo(estado).l}?`)) return
    try{ const r=await fetch('/api/presupuesto-estado',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num,estado,motivo,noCalendar:true,resguardo})}); const j=await r.json(); if(j.error){ showToast(j.error,'err'); if(j.sinResguardo){ const p=presusByNum[String(num).trim()]; if(p) setResg(p) } return } showToast(`#${num} → ${estadoInfo(estado).l}`); if(estado==='APROBADO') setPendingStaff(num); if(onRefresh) onRefresh()
      const accion = estado==='APROBADO'?'aprobar':(estado==='DESAPROBADO'||estado==='REPRESUPUESTADO')?'borrar':'pendiente'
      fetch('/api/calendar-evento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num, accion})}).catch(()=>{})
    }catch(e){showToast('Error de conexión','err')}
  }
  const staffDe=p=>{ const out=[]; for(let j=1;j<=MAX_SLOTS;j++){ const s=String(p['Staff '+j]||(j===1?p['Staff']:'')||'').trim(); const ped=p['Pedido '+j]||(j===1?p['Pedido']:'')||''; if(s) out.push({persona:s, pedido:ped}) } return out }
  const esHoy=d=>d&&dayKey(d)===dayKey(now)

  return <>
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap'}}>
      <h1 style={{fontSize:23, fontWeight:700, color:T.ink, margin:0, letterSpacing:-0.3}}>{MESES_LARGO[ref.m]} {ref.a}</h1>
      <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', justifyContent:'flex-end'}}>
        {edicion.length>0 && <div style={{display:'flex', gap:4, marginRight:6}}>
          {[['todo','Todo'],['rodajes','Rodajes'],['entregas','✂ Entregas']].map(([id,l])=><button key={id} onClick={()=>{setCapa(id);setDiaSel(null)}} style={{...navBtn, width:'auto', padding:'0 12px', fontSize:12, background:capa===id?T.ink:T.surface, color:capa===id?'#fff':T.ink2, borderColor:capa===id?T.ink:T.border}}>{l}</button>)}
        </div>}
        {verEnt && edicion.length>0 && <select value={editorF} onChange={e=>elegirEditor(e.target.value)} title="Quién edita" style={{...navBtn, width:'auto', padding:'0 10px', fontSize:12, cursor:'pointer', marginRight:6, ...(editorF!=='todos'?{borderColor:T.ink, fontWeight:600}:{})}}>
          <option value="todos">Todo el equipo</option>
          {editorF!=='todos'&&editorF!=='__sin__'&&!editores.includes(editorF) && <option value={editorF}>{editorF}</option>}
          {sinAsignar>0 && <option value="__sin__">Sin asignar ({sinAsignar})</option>}
          {editores.map(e=><option key={e} value={e}>{e}</option>)}
        </select>}
        <button onClick={()=>navMes(-1)} style={navBtn}>←</button>
        <button onClick={()=>{setRef({a:now.getFullYear(),m:now.getMonth()});setDiaSel(null)}} style={{...navBtn, width:'auto', padding:'0 14px'}}>Hoy</button>
        <button onClick={()=>navMes(1)} style={navBtn}>→</button>
      </div>
    </div>
    {/* Los números van en su propia fila, a todo el ancho: al lado de los botones no entraban y se partían en dos renglones */}
    <div style={{fontSize:13, color:T.ink3, marginTop:6, marginBottom:18, lineHeight:1.6}}>
      <span title="Trabajos distintos con evento este mes. La plata de cada uno cuenta una sola vez, aunque el trabajo ocupe varios días.">{cntAprob} aprobados · {fmtM(totAprob)}{jorAprob>0&&<span style={{color:T.ink3}}> · {jorAprob} {jorAprob===1?'jornada':'jornadas'}</span>}{porConfirmar>0&&<span style={{color:T.ink3}} title="Días del trabajo que todavía no tienen fecha confirmada — se ven en gris en la grilla."> · {porConfirmar} a confirmar</span>}</span>
      &nbsp;·&nbsp;
      <span title="Presupuestos en espera con evento este mes. Idem: cada uno cuenta una vez.">{cntEsp} en espera · {fmtM(totEsp)}{jorEsp>cntEsp&&<span style={{color:T.ink3}}> · {jorEsp} jornadas</span>}</span>
      {verEnt && <>&nbsp;·&nbsp;<span title="Entregas de edición con fecha este mes (la prometida por el PM, o la del manual si no hay)">✂ {cntEnt} {cntEnt===1?'entrega':'entregas'}{entAtras>0&&<span style={{color:T.brand, fontWeight:600}}> · {entAtras} atrasadas</span>}{entHechas>0&&<span style={{color:T.ink3}}> · {entHechas} hechas</span>}{sinFecha>0&&<span style={{color:T.ink3}} title="Trabajos abiertos sin fecha de evento ni compromiso: no se pueden ubicar en el calendario"> · {sinFecha} sin fecha</span>}</span></>}
    </div>
    <div style={{display:'flex', gap:16, alignItems:'flex-start'}}>
      <div style={{flex:1, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
        {/* minmax(0,1fr) y minWidth:0: las fichas en una línea sin cortar ("Edit 60s · Austral Derecho")
            estiraban las columnas hasta que sábado y domingo quedaban fuera de la caja, recortados. */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(7,minmax(0,1fr))'}}>
          {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d=><div key={d} style={{padding:'9px 0', textAlign:'center', fontSize:10.5, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3, borderBottom:`1px solid ${T.border}`}}>{d}</div>)}
          {celdas.map((d,i)=>{
            if(!d) return <div key={i} style={{minHeight:96, minWidth:0, borderRight:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}`, background:T.bg}}/>
            const ap=verRod?(aprobadosPorDia[dayKey(d)]||[]):[], es=verRod?(enEsperaPorDia[dayKey(d)]||[]):[], en=verEnt?(entregasPorDia[dayKey(d)]||[]):[], total=ap.length+es.length+en.length
            const TOPE=capa==='todo'?4:3, quedan=n=>Math.max(0,TOPE-n)
            const sel = diaSel&&dayKey(diaSel)===dayKey(d)
            return <div key={i} onClick={()=>setDiaSel(d)} style={{minHeight:96, minWidth:0, padding:6, borderRight:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}`, cursor:'pointer', background:sel?T.surfaceAlt:T.surface}}>
              <div style={{fontSize:11.5, fontWeight:esHoy(d)?700:500, color:esHoy(d)?T.brand:T.ink3, marginBottom:4, display:'flex', justifyContent:'space-between'}}>
                <span style={esHoy(d)?{background:T.brand,color:'#fff',borderRadius:10,width:18,height:18,display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:10.5}:{}}>{d.getDate()}</span>
              </div>
              {/* Gris = el trabajo está confirmado pero ESE día todavía no. Popstars tiene
                  las dos cosas en el mismo mes: el 3 y el 4 firmes, el resto a ubicar. */}
              {ap.slice(0,3).map((p,j)=>{ const tent=esTentDia(dayKey(d),p)
                return <div key={'a'+j} title={tent?'Día a confirmar':undefined} style={{fontSize:10.5, padding:'2px 5px', marginBottom:2, borderRadius:4, background:tent?T.surfaceAlt:T.posSoft, borderLeft:`2px ${tent?'dashed':'solid'} ${tent?T.ink3:T.pos}`, color:tent?T.ink3:T.ink, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{p['Cliente']||p['Agencia']||'—'}</div>
              })}
              {es.slice(0,quedan(ap.length)).map((p,j)=><div key={'e'+j} style={{fontSize:10.5, padding:'2px 5px', marginBottom:2, borderRadius:4, background:T.warnSoft, borderLeft:`2px dashed ${T.warn}`, color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{p['Cliente']||p['Agencia']||'—'}</div>)}
              {/* ✂ Entregas: el color es el semáforo del trabajo (rojo atrasado, naranja hoy,
                  amarillo esta semana, verde en fecha, gris entregado). Punteado = fecha del
                  manual, todavía no la confirmó el PM. */}
              {en.slice(0,quedan(ap.length+es.length)).map((f,j)=>{ const c=COLOR_SEM_ED[f.__sem.nivel]||COLOR_SEM_ED.verde
                return <div key={'n'+j} onClick={goTo?e=>{e.stopPropagation(); abrirEntrega(f,d)}:undefined} title={`${nombrePiezaEd(f)} · ${f.Cliente||f.Agencia||''} · ${String(f.Editor||'').trim()||'sin asignar'} · ${f.__sem.txt}${f.__estimada?' · fecha del manual':''}${goTo?' — clic para abrirla':''}`} style={{cursor:goTo?'pointer':undefined, fontSize:10.5, padding:'2px 5px', marginBottom:2, borderRadius:4, background:c.bg, borderLeft:`2px ${f.__estimada?'dashed':'solid'} ${c.fg}`, color:f.__cerrado?T.ink3:T.ink, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>✂ {limpiarPedidoEd(f.Entregable)} · {f.Cliente||f.Agencia||'—'}</div>
              })}
              {total>TOPE&&<div style={{fontSize:10, color:T.ink3, paddingLeft:5}}>+{total-TOPE} más</div>}
            </div>
          })}
        </div>
      </div>

      {/* Panel del día */}
      <div style={{flex:'0 0 340px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', position:'sticky', top:0}}>
        {!diaSel ? <Empty>Clickeá un día para ver el detalle</Empty> : <>
          <CardHead>{diaSel.getDate()} de {MESES_LARGO[diaSel.getMonth()]}</CardHead>
          {aprobSel.length===0&&espSel.length===0&&entSel.length===0 && <Empty>{capa==='entregas'?'Sin entregas este día':'Sin eventos este día'}</Empty>}
          {entSel.map((f,i)=>{ const c=COLOR_SEM_ED[f.__sem.nivel]||COLOR_SEM_ED.verde; const ed=String(f.Editor||'').trim()
            return <div key={'n'+i} style={{padding:'12px 18px', borderTop:`1px solid ${T.border}`, borderLeft:`3px solid ${c.fg}`}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8}}>
                <span style={{fontSize:11, fontFamily:MONO, color:T.ink3}}>✂ #{f['N° presupuesto']}</span>
                <span style={{fontSize:11, fontWeight:600, color:c.fg, background:c.bg, padding:'2px 8px', borderRadius:6, whiteSpace:'nowrap'}}>{f.__sem.txt}</span>
              </div>
              <div style={{fontSize:13, color:T.ink, fontWeight:600, marginTop:4}}>{nombrePiezaEd(f)}</div>
              <div style={{fontSize:12, color:T.ink2}}>{[f.Cliente||f.Agencia, f.Proyecto].filter(Boolean).join(' · ')}</div>
              <div style={{fontSize:11.5, color:T.ink2, marginTop:5}}><span style={{color:T.ink3}}>Estado:</span> {String(f.Estado||'Sin material')} <span style={{color:T.ink3}}>· Edita:</span> {ed||<span style={{color:T.brand}}>sin asignar</span>}{f.PM&&<span style={{color:T.ink3}}> · PM {f.PM}</span>}</div>
              {f.__estimada && <div style={{fontSize:11, color:T.warn, marginTop:4}}>Fecha del manual: el PM todavía no confirmó cuándo se entrega.</div>}
              {goTo && <div style={{display:'flex', gap:7, marginTop:9}}><button onClick={()=>abrirEntrega(f)} style={{...miniBtn, background:T.ink, color:'#fff', border:'none'}}>Abrir este trabajo</button></div>}
            </div>
          })}
          {aprobSel.map((p,i)=>{ const staff=staffDe(p); const num=p['N° presupuesto']; const tent=esTentDia(dayKey(diaSel),p)
            return <div key={'a'+i} style={{padding:'12px 18px', borderTop:`1px solid ${T.border}`}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <span style={{fontSize:11, fontFamily:MONO, color:tent?T.ink3:T.pos, fontWeight:600}}>{tent?'○':'●'} #{num}{tent&&<span style={{fontFamily:'inherit', fontWeight:500}}> · día a confirmar</span>}</span>
                <span style={{fontSize:13, fontFamily:MONO, color:T.ink, fontWeight:600}}>{fmt(parseMonto(p['Total ']||p['Total']))}</span>
              </div>
              <div style={{fontSize:13, color:T.ink, fontWeight:500, marginTop:4}}>{p['Proyecto']||'—'}</div>
              <div style={{fontSize:11.5, color:T.ink3}}>{[p['Agencia'],p['Cliente']].filter(Boolean).join(' · ')}</div>
              {(()=>{ const ev=presusByNum[String(num)]||{}; const extra=[ev['Horario'],ev['Ubicación']].filter(Boolean).join(' · '); return extra?<div style={{fontSize:11.5, color:T.ink2, marginTop:4}}>🕒 {extra}</div>:null })()}
              {staff.length===0
                ? <div style={{fontSize:11.5, color:T.warn, marginTop:6, fontWeight:500}}>⚠ Sin staff cargado todavía</div>
                : <div style={{fontSize:11.5, color:T.ink2, marginTop:6}}><span style={{color:T.ink3}}>Staff:</span> {staff.map(s=>s.persona).join(', ')}</div>}
              <div style={{display:'flex', gap:7, marginTop:9, flexWrap:'wrap'}}>
                {!soloVer && <button onClick={()=>{ const proy=proyByNum[String(num).trim()]; if(proy) setStaffModal({proy, presu:presusByNum[String(num).trim()]}); else showToast('El proyecto aún no está disponible, actualizá','err') }} style={{...miniBtn, background:staff.length===0?T.brand:T.surface, color:staff.length===0?'#fff':T.ink2, border:staff.length===0?'none':`1px solid ${T.border}`}}>{staff.length===0?'Cargar staff':'Editar staff'}</button>}
                {!soloVer && presusByNum[String(num).trim()] && <button onClick={()=>setEditando(presusByNum[String(num).trim()])} style={miniBtn}>Editar datos</button>}
                <a href={`/presupuesto?nro=${encodeURIComponent(num)}`} target="_blank" rel="noreferrer" style={miniBtn}>PDF</a>
                {!soloVer && presusByNum[String(num).trim()] && <button onClick={()=>setRepresu(presusByNum[String(num).trim()])} style={miniBtn}>Represupuestar</button>}
                {!soloVer && <button onClick={()=>setMotivoModal({num, estado:'DESAPROBADO'})} style={miniBtn}>Desaprobar</button>}
              </div>
            </div>
          })}
          {espSel.map((p,i)=>{ const num=p['Columna 1']
            return <div key={'e'+i} style={{padding:'12px 18px', borderTop:`1px solid ${T.border}`}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <span style={{fontSize:11, fontFamily:MONO, color:T.warn, fontWeight:600}}>○ #{num}</span>
                <span style={{fontSize:13, fontFamily:MONO, color:T.ink, fontWeight:600}}>{fmt(parseMonto(p['Precio Final']))}</span>
              </div>
              <div style={{fontSize:13, color:T.ink, fontWeight:500, marginTop:4}}>{p['Proyecto']||'—'}</div>
              <div style={{fontSize:11.5, color:T.ink3}}>{[p['Agencia'],p['Cliente']].filter(Boolean).join(' · ')}</div>
              <div style={{display:'flex', gap:7, marginTop:9, flexWrap:'wrap'}}>
                {!soloVer && <button onClick={()=> necesitaResguardo(p, data.agencias, data.clientes) ? setResg(p) : presuTieneOpciones(p) ? setAprobAdic(p) : setEstado(num,'APROBADO')} style={{...miniBtn, background:T.pos, color:'#fff', border:'none'}}>✓ Aprobar</button>}
                {!soloVer && <button onClick={()=>setEditando(p)} style={miniBtn}>Editar datos</button>}
                <a href={`/presupuesto?nro=${encodeURIComponent(num)}`} target="_blank" rel="noreferrer" style={miniBtn}>PDF</a>
                {!soloVer && <button onClick={()=>setRepresu(p)} style={miniBtn}>Represupuestar</button>}
                {!soloVer && <button onClick={()=>setMotivoModal({num, estado:'DESAPROBADO'})} style={miniBtn}>Desaprobar</button>}
              </div>
            </div>
          })}
        </>}
      </div>
    </div>
    {staffModal && <div onClick={()=>setStaffModal(null)} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:900, display:'flex', justifyContent:'center', overflowY:'auto', padding:'40px 20px'}}>
      <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:680, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)', height:'fit-content', overflow:'hidden'}}>
        <div style={{padding:'16px 22px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div style={{fontSize:16, fontWeight:700, color:T.ink}}>Cargar staff · #{staffModal.proy['N° presupuesto']}</div>
          <button onClick={()=>setStaffModal(null)} style={{border:'none', background:'transparent', fontSize:22, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
        </div>
        <StaffEditor p={staffModal.proy} num={staffModal.proy['N° presupuesto']} rrhhNames={rrhhNames} rrhh={rrhh} serviciosConocidos={serviciosConocidos} proyectos={proyectos} acuerdos={data.acuerdos||[]} disponibilidad={data.disponibilidad||[]} agencias={data.agencias||[]} clientes={data.clientes||[]} seguros={data.seguros||[]} presu={staffModal.presu} onRefresh={onRefresh} showToast={showToast} onClose={()=>setStaffModal(null)}/>
      </div>
    </div>}
    {editando && <EditarModal p={editando} data={data} onClose={()=>setEditando(null)} showToast={showToast} onSaved={()=>{ setEditando(null); if(onRefresh) onRefresh() }}/>}
    {resg && <ResguardoModal presu={resg} condicion={condicionDe(resg, data.agencias, data.clientes)} onClose={()=>setResg(null)} onConfirm={r=>{ const p=resg; setResg(null); setResgPend({num:p['Columna 1'], r}); presuTieneOpciones(p) ? setAprobAdic(p) : setEstado(p['Columna 1'],'APROBADO',undefined,r) }}/>}
    {aprobAdic && <AprobarAdicionalesModal presu={aprobAdic} saving={aprobSaving} onClose={()=>setAprobAdic(null)} onConfirm={aprobarConAdic}/>}
    {motivoModal && <MotivoEstadoModal num={motivoModal.num} estado={motivoModal.estado} saving={motivoSaving}
      onClose={()=>setMotivoModal(null)}
      onConfirm={async motivo=>{ setMotivoSaving(true); await setEstado(motivoModal.num, motivoModal.estado, motivo); setMotivoSaving(false); setMotivoModal(null) }}/>}
    {represu && <NuevoPresupuesto data={data} initialData={represu} showToast={showToast} onClose={()=>setRepresu(null)} onGuardado={()=>{ setRepresu(null); setDiaSel(null); if(onRefresh) onRefresh() }}/>}
  </>
}

// ============================ PRODUCCIÓN DE UN TRABAJO ============================
// (La lista de Proyectos ahora es una vista de Trabajos. Esto es el bloque "Producción".)
function StaffEditor({p, num, rrhhNames, rrhh=[], serviciosConocidos=[], presu, proyectos=[], acuerdos=[], disponibilidad=[], agencias=[], clientes=[], seguros=[], onRefresh, showToast, onClose, onEditarDatos}){
  // svcKey (no lowercase pelado): en el sheet los servicios vienen con emoji y "½"
  // ("🎥 Video ½") pero acá se guardan sin emoji y con "1/2". Comparados crudos nunca
  // matcheaban y TODO servicio ya existente salía marcado como "+ servicio nuevo".
  const svcSet=new Set(serviciosConocidos.map(svcKey))
  const esSvcNuevo=v=>v && !svcSet.has(svcKey(v))
  const rrhhMap={}; rrhh.forEach(r=>{ const n=normTxt(r['Nombre Apellido']||r['Nombre']); if(n) rrhhMap[n]=r })
  const esFreelancerNuevo=v=>{ const n=normTxt(v); return n && n!=='somos magma' && !rrhhMap[n] }
  // La lista del desplegable sale de RRHH (ahi vive "Somos Magma" como una fila mas) y se dedupe
  // por nombre normalizado: dos escrituras de la misma persona son UNA sola opcion. "Somos Magma"
  // va primera por ser la mas usada; si alguien borrara su fila de RRHH se agrega igual.
  const opcionesStaff = useMemo(()=>{
    const m=new Map()
    ;(rrhhNames||[]).forEach(n=>{ const k=normTxt(n); if(k && !m.has(k)) m.set(k, String(n).replace(/\s+/g,' ').trim()) })
    if(!m.has('somos magma')) m.set('somos magma','Somos Magma')
    const magma=m.get('somos magma'); m.delete('somos magma')
    return [magma, ...[...m.values()].sort((a,b)=>a.localeCompare(b,'es'))]
  },[rrhhNames])
  // id propio por editor abierto: dos <datalist> con el mismo id en la pagina es lo que
  // hace que el navegador muestre el mismo nombre repetido.
  const dlStaff = 'rrhh-'+useId().replace(/:/g,'')
  const [freel,setFreel]=useState(null)  // nombre del freelancer a completar
  const total=parseMonto(p['Total ']||p['Total'])
  // Las fechas del trabajo. Si son varias, cada línea de staff puede llevar la suya:
  // en Popstars son 30 días y 12 jornadas repartidas entre tres personas, y sin el día
  // no se sabe a quién avisarle ni cuánto pagarle.
  const fechasProyecto = useMemo(()=>{
    const base = String(presu?.['Fecha Evento'] || p['Fecha Evento'] || '').trim()
    // El "?" marca los días que todavía no están confirmados (ver lib/fechas.js). En el
    // desplegable van igual — se le puede asignar gente a un día tentativo — pero sin la marca.
    const mas = String(presu?.['Fechas Adicionales'] || '').split('|').map(x=>x.trim().replace(/^\?/,'')).filter(Boolean)
    const tipo = String(presu?.['Tipo Fechas'] || '').trim()
    // Un rango se guarda como dos extremos ("del 1 al 5") pero se trabaja día por día:
    // en Minecraft algunos fueron 3 días y otros 2. Así que el rango se abre en días
    // sueltos, que es lo que hace falta para decir quién va cada uno.
    if(tipo === 'rango'){
      const d1 = parseD(base), d2 = parseD(mas[mas.length-1])
      if(!d1 || !d2 || d2 < d1) return [base].filter(Boolean)
      const out = []
      for(let d = new Date(d1); d <= d2 && out.length < 90; d.setDate(d.getDate()+1)){
        out.push(`${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`)
      }
      return out
    }
    return [...new Set([base, ...mas].filter(Boolean))]
  }, [presu, p])
  const porFecha = fechasProyecto.length > 1
  // Lo guardado: "1:08/09/2026|2:09/09/2026" — la llave es el número de slot.
  const fechasGuardadas = useMemo(()=>{
    const m = {}
    String(p['Fechas Staff']||'').split('|').forEach(x=>{ const [k,...v]=x.split(':'); if(k&&v.length) m[k.trim()] = v.join(':').trim() })
    return m
  }, [p])
  const init=()=>{ const arr=[]; for(let j=1;j<=MAX_SLOTS;j++){ const ped=p['Pedido '+j]||(j===1?p['Pedido']:'')||''; const quien=String(p['Staff '+j]||(j===1?p['Staff']:'')||'').trim(); const precio=parseMonto(p['Precio '+j]||(j===1?p['Precio']:'')); if(ped||quien||precio>0) arr.push({pedido:ped, quien, precio, fecha:fechasGuardadas[String(arr.length+1)]||''}) } return arr.length?arr:[{pedido:'',quien:'',precio:0,fecha:''}] }
  const [items,setItems]=useState(init)
  const [saving,setSaving]=useState(false)
  const GRID_STAFF = porFecha ? '1.2fr 1.3fr 130px 105px 28px' : '1.3fr 1.4fr 110px 28px'

  // ── Cuántas lleva cada uno en el mes ────────────────────────────────────────
  // Arrancó para Lucho y Juani (tienen mínimo pactado en la solapa ACUERDOS) y
  // ahora sale para TODOS: al lado del nombre dice "3ª del mes". Es el dato que
  // hace que el reparto salga parejo sin tener que ir a mirar otra pantalla.
  // Con acuerdo además dice el precio de ESA jornada (dentro del mínimo o extra)
  // y, si el monto está vacío, lo completa solo.
  const acVig = useMemo(()=>acuerdosVigentes(acuerdos, parseD(p['Fecha Evento'])||new Date()), [acuerdos, p])
  // El arreglo que corresponde a ESTE trabajo (una persona puede tener más de uno: Lucho tiene el banco y, para
  // Austral, lo de antes). `conArreglo` = tiene alguno, aunque ninguno cubra este trabajo.
  const acDe = useCallback(nombre=>acuerdoPara(acVig, normTxt(nombre), p), [acVig, p])
  const conArreglo = useCallback(nombre=>{ const k=normTxt(nombre); return acVig.some(a=>a.keys.includes(k)) }, [acVig])
  const feEv = parseD(p['Fecha Evento'])
  // El mes entero de una pasada, SIN este proyecto: sus líneas se cuentan abajo
  // desde el formulario, así el número se mueve mientras se escribe.
  const previasSheet = useMemo(()=>{
    if(!feEv) return {}
    const otros = proyectos.filter(x=>String(x['N° presupuesto']||'').trim()!==String(num||'').trim())
    return Object.fromEntries(repartoDelMes(otros, feEv.getMonth()+1, feEv.getFullYear()).map(r=>[r.key, r.jornadas]))
  }, [proyectos, feEv, num])
  const keyDe = nombre => canonKey(canonStaff(nombre))
  const otrosProy = useMemo(()=>proyectos.filter(x=>String(x['N° presupuesto']||'').trim()!==String(num||'').trim()), [proyectos, num])
  // Con acuerdo, el número que importa es cuántas jornadas DEL ACUERDO van antes de esta, en orden de fecha: las
  // primeras 10 de Lucho valen $190.000 y de la 11 en adelante $180.000. Solo cuentan los trabajos donde el acuerdo
  // vale (el suyo es "sin Austral": antes las de Austral le gastaban el mínimo y le marcaba extra antes de tiempo).
  const previasAcuerdo = useCallback((a, lista, i, quien) => {
    const fL = parseD(lista[i].fecha) || feEv, k = keyDe(quien)
    const enEsteForm = lista.filter((y,z)=>{ if(z===i || keyDe(y.quien)!==k || !esJornada(y.pedido)) return false
      const fy = parseD(y.fecha) || feEv; return fy < fL || (fy.getTime()===fL.getTime() && z<i) }).length
    return previasDelAcuerdo(otrosProy, a, fL, num) + enEsteForm
  // eslint-disable-next-line
  }, [otrosProy, feEv, num])
  // Por línea: cuántas lleva esa persona contando las de arriba en este mismo formulario.
  const avisos = useMemo(()=>{
    if(!feEv) return []
    const corridas={}
    return items.map((it,i)=>{
      const nombre=canonStaff(it.quien)
      if(!nombre || esMagma(nombre) || !esJornada(it.pedido)) return null
      const k=canonKey(nombre)
      const previas=(previasSheet[k]||0)+(corridas[k]||0)
      corridas[k]=(corridas[k]||0)+1
      const a=acDe(it.quien)
      // Sin arreglo para este trabajo no hay mínimo ni tarifa pactada: solo el contador. Si la persona tiene arreglos
      // pero ninguno cubre este trabajo, se avisa (la tarifa se pone a mano).
      if(!a) return {nro:previas+1, contador:`${previas+1}ª del mes`, soloContador:true, fuera:conArreglo(it.quien)}
      return avisoJornada(a, previasAcuerdo(a, items, i, it.quien))
    })
  }, [items, acDe, conArreglo, previasSheet, feEv, previasAcuerdo])

  // ── Qué contestó cada uno desde Mi Magma ────────────────────────────────────
  // "Confirmó" en verde, "no puede" en rojo (sigue cargado a propósito: lo saca el PM poniendo a otro),
  // y si la persona avisó que ESE día no puede, se ve antes de guardar. Ver lib/disponibilidad.mjs.
  const dispo = useMemo(()=>leerDisponibilidad(disponibilidad), [disponibilidad])
  const conAcceso = useMemo(()=>new Set(rrhh.filter(r=>/^(s[ií]|x|true|1|✓)$/i.test(String(r['Acceso Mi Magma']||'').trim())).map(r=>canonKey(canonStaff(r['Nombre Apellido']||r['Nombre'])))), [rrhh])
  const hoy0Dispo = useMemo(()=>{ const d=new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }, [])
  const respuestas = useMemo(()=>items.map(it=>{
    const nombre=canonStaff(it.quien); if(!nombre || esMagma(nombre) || !it.pedido) return null
    const fecha = it.fecha || p['Fecha Evento']; if(!parseD(fecha)) return null
    const r = dispo.respuesta(nombre, num, it.pedido, fecha)
    if(r?.que==='confirmo') return {tono:T.pos, texto:`✓ confirmó el ${String(r.cuando).slice(0,5)}`}
    if(r?.que==='nopuedo') return {tono:T.brand, texto:`✗ avisó que no puede${r.motivo?`: ${r.motivo}`:''} · poné a otra persona`}
    const dia = dispo.diaBloqueado(nombre, fecha)
    if(dia) return {tono:T.brand, texto:`⚠ avisó que ese día no puede${dia.motivo?`: ${dia.motivo}`:''}`}
    if(conAcceso.has(canonKey(nombre)) && parseD(fecha)>=hoy0Dispo) return {tono:T.ink3, texto:'sin confirmar todavía'}
    return null
  }), [items, dispo, conAcceso, num, p, hoy0Dispo])

  // Al elegir a alguien con acuerdo, si el monto está vacío se completa con su tarifa.
  const setQuien=(i,val)=>setItems(it=>it.map((x,j)=>{
    if(j!==i) return x
    const a=acDe(val)
    if(!a || Number(x.precio)>0 || !esJornada(x.pedido)) return {...x, quien:val}
    return {...x, quien:val, precio:avisoJornada(a, previasAcuerdo(a, it, j, val)).precio}
  }))
  // Horario + ubicación (van al Calendar). Se editan acá cuando hay presu.
  const hOrig=parseHorarioStr(presu?.['Horario'])
  const [horaIni,setHoraIni]=useState(hOrig.h1), [horaFin,setHoraFin]=useState(hOrig.h2), [ubicacion,setUbicacion]=useState(presu?.['Ubicación']||'')
  const upd=(i,campo,val)=>setItems(it=>it.map((x,j)=>j===i?{...x,[campo]:val}:x))
  const addRow=()=>setItems(it=>[...it,{pedido:'',quien:'',precio:0}])
  const delRow=i=>setItems(it=>it.length>1?it.filter((_,j)=>j!==i):[{pedido:'',quien:'',precio:0}])

  let fl=0,mg=0; items.forEach(s=>{ if(!s.quien)return; const v=Number(s.precio)||0; if(s.quien==='Somos Magma')mg+=v; else fl+=v })
  const fee=total-fl-mg
  const sinAsignar=items.filter(s=>s.pedido&&!s.quien).length
  // 🛡 Seguro de accidentes personales: qué se pidió ya para este trabajo (solapa SEGUROS, una fila por persona)
  const [seguroModal,setSeguroModal]=useState(false)
  const segurosTrabajo=(seguros||[]).filter(r=>String(r['N° Presupuesto']||'').trim()===String(num).trim())
  const seguroResumen=(()=>{ if(!segurosTrabajo.length) return ''; const ult=segurosTrabajo[segurosTrabajo.length-1]; const fecha=String(ult['Fecha pedido']||'').trim()
    const quienes=[...new Set(segurosTrabajo.filter(r=>String(r['Fecha pedido']||'').trim()===fecha).map(r=>String(r['Persona']||'').trim().split(' ')[0]))]
    return `Seguro pedido el ${fecha} para ${quienes.join(', ')}${ult['Vigencia']?` · ${ult['Vigencia']}`:''} · a ${ult['Enviado a']||''}` })()

  async function guardar(){
    setSaving(true)
    try{
      // 1. Horario/ubicación → al presupuesto (el Calendar los lee de ahí)
      if(presu){
        const horario=(horaIni&&horaFin)?`${horaIni} a ${horaFin} hs`:''
        const cambios={}
        if(horario!==(presu['Horario']||'')) cambios['Horario']=horario
        if(ubicacion!==(presu['Ubicación']||'')) cambios['Ubicación']=ubicacion
        if(Object.keys(cambios).length) await fetch('/api/presupuesto-editar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num, cambios})})
      }
      // 2. Staff → PROYECTOS
      const r=await fetch('/api/proyecto-staff',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num, staffData:items.filter(s=>s.pedido||s.quien).map(s=>({nombre:s.quien, monto:Number(s.precio)||0, pedido:s.pedido, fecha:s.fecha||''}))})})
      const j=await r.json(); if(j&&j.error){showToast(j.error,'err');setSaving(false);return}
      // Listo el guardado → liberamos el botón y cerramos enseguida
      // Decir a quién le llegó el mail: el aviso sale solo y si no se ve, nadie
      // sabe si el freelancer se enteró o hay que escribirle igual.
      const avis = (j?.avisados||[]).length ? ` · avisados por mail: ${j.avisados.join(', ')}` : ''
      const cel = (j?.alCelular||[]).length ? ` · al celular: ${j.alCelular.map(n=>String(n).split(' ')[0]).join(', ')}` : ''
      showToast(`#${num} · staff guardado${avis}${cel}`)
      if(j?.sinMail?.length) showToast(`Sin mail en RRHH, avisales vos: ${j.sinMail.join(', ')}`,'err')
      setSaving(false)
      if(onRefresh) onRefresh()
      if(onClose) onClose()
      // 3. Resync Calendar en segundo plano (Google es lento, no bloqueamos)
      if(presu){ fetch('/api/calendar-evento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num, accion:'aprobar'})}).then(r=>r.json()).then(j=>{ if(j&&j.staffSinMail&&j.staffSinMail.length) showToast('Sin mail (no se pudo invitar): '+j.staffSinMail.join(', '),'err') }).catch(()=>{}) }
    }catch(e){ showToast('Error de conexión','err'); setSaving(false) }
  }

  return <div style={{padding:'14px 18px 18px', background:T.surfaceAlt, borderTop:`1px solid ${T.border}`}}>
    <div style={{display:'flex', gap:20, flexWrap:'wrap', alignItems:'flex-start', paddingBottom:12, marginBottom:10, borderBottom:`1px solid ${T.border}`}}>
      {[['N°',num],['Agencia',p['Agencia']],['Cliente',p['Cliente']],['Evento',p['Fecha Evento']]].filter(x=>x[1]).map(([k,v])=>(
        <div key={k}><div style={{fontSize:10, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, fontWeight:600}}>{k}</div><div style={{fontSize:13, color:T.ink, marginTop:2}}>{v}</div></div>
      ))}
      <div style={{flex:1}}/>
      {onEditarDatos && <button onClick={onEditarDatos} style={{...miniBtn, alignSelf:'center'}}>Editar datos (fecha, etc)</button>}
    </div>
    <DriveDelProyecto p={p} num={num} showToast={showToast} onRefresh={onRefresh} agencias={agencias} clientes={clientes}/>
    {presu && <div style={{display:'flex', gap:18, flexWrap:'wrap', alignItems:'flex-end', paddingBottom:12, marginBottom:10, borderBottom:`1px solid ${T.border}`}}>
      <div><label style={lblV2}>Horario (va al Calendar)</label>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <HoraInput value={horaIni} onChange={setHoraIni} style={{...inpV2, width:88}}/>
          <span style={{fontSize:13, color:T.ink3}}>a</span>
          <HoraInput value={horaFin} onChange={setHoraFin} style={{...inpV2, width:88}}/>
        </div>
      </div>
      <div style={{flex:1, minWidth:200}}><label style={lblV2}>Ubicación</label><input value={ubicacion} onChange={e=>setUbicacion(e.target.value)} placeholder="Dirección del evento" style={inpV2}/></div>
    </div>}
    {porFecha && <div style={{fontSize:11.5, color:T.ink2, background:T.surfaceAlt, border:`1px solid ${T.border}`, borderRadius:8, padding:'8px 11px', marginBottom:10, lineHeight:1.45}}>
      Este trabajo tiene <strong>{fechasProyecto.length} fechas</strong>. Poné qué día va cada uno: es lo que después le llega en el mail y lo que dice cuánto pagarle por jornada.
    </div>}
    <div style={{display:'grid', gridTemplateColumns:GRID_STAFF, gap:10, fontSize:10.5, fontWeight:600, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, padding:'0 2px 8px'}}>
      <span>Servicio</span><span>Quién lo hace</span>{porFecha&&<span>Qué día</span>}<span style={{textAlign:'right'}}>Monto</span><span/>
    </div>
    {items.map((s,i)=>(
      <div key={i} style={{display:'grid', gridTemplateColumns:GRID_STAFF, gap:10, marginBottom:8, alignItems:'start'}}>
        <div>
          <input list="v2-svcs" value={s.pedido} onChange={e=>upd(i,'pedido',e.target.value)} placeholder="Servicio" style={inpV2}/>
          {esSvcNuevo(s.pedido) && <span style={{fontSize:10, color:T.warn, fontWeight:600, display:'block', marginTop:3}}>+ servicio nuevo</span>}
        </div>
        <div>
          <input list={dlStaff} autoComplete="off" value={s.quien} onChange={e=>setQuien(i,e.target.value)} placeholder="Freelancer o Somos Magma" style={{...inpV2, borderColor:s.pedido&&!s.quien?T.warn:(esFreelancerNuevo(s.quien)?T.warn:T.border)}}/>
          {avisos[i] && (avisos[i].soloContador
            ? <span title="Veces que lo convocaste este mes (rodaje, sin contar edición)" style={{fontSize:10.5, display:'block', marginTop:3, color:T.ink3}}>{avisos[i].contador}{avisos[i].fuera?' · ninguno de sus arreglos cubre este trabajo: el monto va a mano':''}</span>
            : <span title={avisos[i].alcance} style={{fontSize:10.5, fontWeight:600, display:'block', marginTop:3, color:avisos[i].dentro?T.ink2:T.warn}}>
                {avisos[i].contador} · {fmt(avisos[i].precio)} <span style={{fontWeight:400, color:T.ink3}}>· {avisos[i].nota}</span>
              </span>)}
          {respuestas[i] && <span style={{fontSize:10.5, fontWeight:600, display:'block', marginTop:3, color:respuestas[i].tono}}>{respuestas[i].texto}</span>}
          {esFreelancerNuevo(s.quien) && <span style={{fontSize:10, color:T.warn, fontWeight:600, display:'block', marginTop:3}}>persona nueva · <button onClick={()=>setFreel(s.quien.trim())} style={{border:'none',background:'transparent',color:T.brand,fontWeight:600,cursor:'pointer',fontSize:10,padding:0,textDecoration:'underline'}}>completar datos</button></span>}
        </div>
        {porFecha && <select value={s.fecha||''} onChange={e=>upd(i,'fecha',e.target.value)} style={{...inpV2, cursor:'pointer', borderColor:s.quien&&!s.fecha?T.warn:T.border}}>
          <option value="">— sin día —</option>
          {fechasProyecto.map(f=><option key={f} value={f}>{f}</option>)}
        </select>}
        <input type="number" value={s.precio||''} onChange={e=>upd(i,'precio',e.target.value)} placeholder="0" style={{...inpV2, textAlign:'right', fontFamily:MONO}}/>
        <button onClick={()=>delRow(i)} title="Quitar línea" style={{border:'none', background:'transparent', color:T.ink3, cursor:'pointer', fontSize:17, padding:0, alignSelf:'center'}}>×</button>
      </div>
    ))}
    <datalist id={dlStaff}>{opcionesStaff.map(n=><option key={n} value={n}/>)}</datalist>
    <datalist id="v2-svcs">{serviciosConocidos.map(n=><option key={n} value={n}/>)}</datalist>
    <button onClick={addRow} style={{fontSize:12, color:T.ink2, background:'transparent', border:'none', cursor:'pointer', padding:'4px 0', marginTop:2}}>+ Agregar línea</button>
    {seguroResumen && <div style={{fontSize:11.5, color:T.pos, marginTop:6}}>🛡 {seguroResumen}</div>}

    {/* Gastos de este trabajo: lo que se pagó aparte del staff (alquiler de equipos, auto, nafta). Se anotan desde
        Caja → "¿Pagaste algo?", eligiendo el trabajo. Acá se ven y se restan de la ganancia. */}
    {(p.__gastos||[]).length>0 && <div style={{marginTop:14, paddingTop:12, borderTop:`1px solid ${T.border}`}}>
      <div style={{fontSize:10.5, fontWeight:700, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3, marginBottom:4}}>Gastos de este trabajo · {fmt(p.__gastoTotal)}</div>
      {p.__gastos.map((g,k)=><div key={k} style={{display:'flex', justifyContent:'space-between', gap:12, padding:'6px 0', borderTop:k===0?'none':`1px solid ${T.border}`, fontSize:12.5}}>
        <span style={{minWidth:0}}><span style={{color:T.ink}}>{g.concepto}</span><span style={{color:T.ink3}}>{[g.rubro, g.fecha, g.cuenta].filter(Boolean).map(x=>` · ${x}`).join('')}</span></span>
        <span style={{fontFamily:MONO, color:T.brand, whiteSpace:'nowrap'}}>−{fmt(g.monto)}</span>
      </div>)}
    </div>}
    {(()=>{ const gastosT=p.__gastoTotal||0, ganancia=fee+mg-gastosT; const margenPct=total>0?Math.round((ganancia/total)*100):0; const sem=semaforo(margenPct); return (
    <div style={{display:'flex', gap:24, marginTop:14, paddingTop:14, borderTop:`1px solid ${T.border}`, flexWrap:'wrap', alignItems:'center'}}>
      <Mini label="Presupuestado" val={fmt(total)}/>
      <Mini label="Freelance" val={fmt(fl)}/>
      <Mini label="Somos Magma" val={fmt(mg)} color={T.pos}/>
      <Mini label="Fee Magma" val={fmt(fee)} color={fee<0?T.brand:T.ink}/>
      {gastosT>0 && <Mini label="Gastos del trabajo" val={'−'+fmt(gastosT)} color={T.brand}/>}
      <Mini label="Ganancia Magma" val={(ganancia<0?'−':'')+fmt(ganancia)} color={ganancia<0?T.brand:T.pos}/>
      <div><div style={{fontSize:10, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, fontWeight:600}}>Margen</div><div style={{fontSize:14, fontFamily:MONO, color:sem.c, marginTop:2}}>{margenPct}% · {sem.l}</div><div style={{fontSize:9, color:T.ink3, marginTop:1}}>{gastosT>0?'fee + Somos Magma − gastos':'fee + Somos Magma'}</div></div>
      <div style={{flex:1}}/>
      {sinAsignar>0&&<span style={{fontSize:12, color:T.warn, fontWeight:500}}>{sinAsignar} sin asignar</span>}
      <button onClick={()=>setSeguroModal(true)} title="Mail a La Segunda con los datos de quienes van (nombre, DNI, nacimiento) para el certificado de accidentes personales. Queda anotado en SEGUROS." style={{...miniBtn, padding:'8px 14px', fontWeight:600, color:segurosTrabajo.length?T.pos:T.ink2, borderColor:segurosTrabajo.length?T.pos:T.border}}>🛡 {segurosTrabajo.length?'Seguro pedido':'Pedir seguro'}</button>
      <button onClick={guardar} disabled={saving} style={{padding:'9px 20px', borderRadius:9, border:'none', background:T.brand, color:'#fff', fontSize:13, fontWeight:600, cursor:saving?'default':'pointer', opacity:saving?0.6:1}}>{saving?'Guardando…':'Guardar staff'}</button>
    </div> )})()}
    {freel && <FreelancerModal nombre={freel} datos={{}} rubrosConocidos={[...new Set(rrhh.flatMap(r=>String(r['Rubro']||'').split(',').map(s=>s.trim())))].filter(Boolean)} onClose={()=>setFreel(null)} onSaved={()=>{ setFreel(null); if(onRefresh) onRefresh() }} showToast={showToast}/>}
    {seguroModal && <PedirSeguroModal p={p} num={num} presu={presu} items={items} rrhh={rrhh} rrhhNames={rrhhNames} clientes={clientes} seguros={seguros} onClose={()=>setSeguroModal(false)} onSent={()=>{ setSeguroModal(false); if(onRefresh) onRefresh() }} showToast={showToast}/>}
  </div>
}

// 🛡 PEDIDO DE SEGURO — el mail a La Segunda con la nómina del rodaje.
// Juan, 08/10/2026: "una vez que confirmamos un laburo y ponemos a los que van, deberíamos
// poder mandarle un mail a la aseguradora con las personas que necesitamos asegurar y los
// datos necesarios… también podría tener un historial de los seguros o datos por cliente".
// Los datos (DNI, nacimiento, nacionalidad) salen de RRHH; si a alguien le falta algo se
// completa acá y queda guardado en RRHH. Lo que exigen para asegurar (cláusula de no repetición
// a favor de tal razón social, monto, papeles) depende del LUGAR, no del cliente: "hay muchos
// que es la única vez y otros se repiten" (Juan). El PM pega lo que le mandaron, queda en la fila
// de SEGUROS, y la próxima vez en el mismo lugar sale precargado (lib/seguros.js).
// El mail sale desde la casilla de quien lo manda (queda en sus Enviados) y cada persona queda
// anotada en SEGUROS (pages/api/seguro-pedir.js). El texto vive en lib/seguros.js.
function PedirSeguroModal({p, num, presu, items=[], rrhh=[], rrhhNames=[], clientes=[], seguros=[], onClose, onSent, showToast}){
  const { data: session } = useSession()
  const yo=String(session?.user?.email||'').toLowerCase().trim()
  const firma=String(session?.user?.name||'').trim().split(' ')[0]
  const cliente=String(p['Cliente']||'').trim(), agencia=String(p['Agencia']||'').trim(), proyecto=String(p['Proyecto']||'').trim()
  const rrhhDe=nombre=>{ const k=canonKey(canonStaff(nombre)); return rrhh.find(r=>canonKey(canonStaff(r['Nombre Apellido']||r['Nombre']))===k) }
  // Quiénes van: las líneas de staff con nombre (sin "Somos Magma"), sin repetir
  const delStaff=[...new Set(items.map(s=>String(s.quien||'').trim()).filter(n=>n && !esMagma(n)))]
  const armar=nombre=>{ const d=datosSeguro(nombre, rrhhDe(nombre)); return {...d, sel:true, edit:{dni:d.dni, nacimiento:d.nacimiento, nacionalidad:d.nacionalidad||'Argentino'}} }
  const [personas,setPersonas]=useState(()=>delStaff.map(armar))
  const [otro,setOtro]=useState('')
  const agregar=()=>{ const n=otro.trim(); if(!n) return; if(personas.some(x=>canonKey(canonStaff(x.nombre))===canonKey(canonStaff(n)))){ setOtro(''); return } setPersonas(ps=>[...ps,armar(n)]); setOtro('') }
  const updP=(i,ch)=>setPersonas(ps=>ps.map((x,j)=>j===i?{...x, edit:{...x.edit,...ch}}:x))
  const elegidas=personas.filter(x=>x.sel)
  // Las fechas y el lugar del trabajo (del presupuesto: el "?" marca los días sin confirmar)
  const fechas=[...new Set([String(presu?.['Fecha Evento']||p['Fecha Evento']||'').trim(), ...String(presu?.['Fechas Adicionales']||'').split('|').map(x=>x.trim().replace(/^\?/,''))].filter(Boolean))]
  const [vigencia,setVigencia]=useState(()=>vigenciaSugerida(fechas, presu?.['Tipo Fechas']))
  const [lugar,setLugar]=useState(String(presu?.['Ubicación']||'').trim())
  // Lo que piden depende del lugar: se propone lo que se cargó la última vez ahí (o para ese
  // cliente) y sigue al campo "Dónde" hasta que el PM escribe algo a mano.
  const sug=useMemo(()=>requisitosSugeridos(seguros,{lugar, cliente}),[seguros, lugar, cliente])
  const [requisitos,setRequisitos]=useState(()=>sug.texto)
  const [reqTocado,setReqTocado]=useState(false)
  useEffect(()=>{ if(!reqTocado) setRequisitos(sug.texto) },[sug.texto, reqTocado])
  const lugares=useMemo(()=>[...new Set([String(presu?.['Ubicación']||'').trim(), ...lugaresConocidos(seguros)].filter(Boolean))],[seguros, presu])
  // Lo que mandó el cliente en PDF: archivos nuevos (van al mail y a Drive) y los de un pedido anterior
  // en el mismo lugar (se vuelven a adjuntar desde Drive). Tope 3 MB en total: Vercel corta en 4,5 MB.
  const MAX_ADJ=3*1024*1024
  const [archivos,setArchivos]=useState([])
  const [reusar,setReusar]=useState(()=>(sug.adjuntos||[]).map(a=>a.id))
  useEffect(()=>{ if(!reqTocado) setReusar((sug.adjuntos||[]).map(a=>a.id)) },[sug.adjuntos, reqTocado])
  const pesoAdj=archivos.reduce((s,f)=>s+f.size,0)
  const agregarArchivos=lista=>{ const nuevos=[...lista].filter(f=>!archivos.some(x=>x.name===f.name&&x.size===f.size)); const total=pesoAdj+nuevos.reduce((s,f)=>s+f.size,0)
    if(total>MAX_ADJ){ showToast(`Los archivos pesan ${(total/1024/1024).toFixed(1)} MB y el tope es 3 MB. Comprimí el PDF o mandalo aparte.`,'err'); return } setArchivos(a=>[...a,...nuevos]) }
  const adjReusados=(sug.adjuntos||[]).filter(a=>reusar.includes(a.id))
  const kb=n=>n>=1024*1024?`${(n/1024/1024).toFixed(1)} MB`:`${Math.round(n/1024)} KB`
  // A quién se le pide: lo último que se usó (SEGUROS → "Enviado a"); si no hay nada, el productor de siempre
  const ultimo=[...seguros].reverse().find(r=>String(r['Enviado a']||'').trim())
  const [to,setTo]=useState(()=>String(ultimo?.['Enviado a']||BROKER_MAILS.join(', ')))
  const [cc,setCc]=useState(()=>yo && yo!=='sofi@somosmagma.com' ? 'sofi@somosmagma.com' : '')
  const [asuntoM,setAsuntoM]=useState(null), [cuerpoM,setCuerpoM]=useState(null)
  const [saving,setSaving]=useState(false)
  const auto=armarMailSeguro({ personas:elegidas.map(x=>({nombre:x.nombre, ...x.edit})), trabajo:{cliente, agencia, proyecto, fechas, lugar}, vigencia, requisitos, adjuntos:[...archivos.map(f=>f.name), ...adjReusados.map(a=>a.nombre)], firma })
  const asunto=asuntoM??auto.asunto, cuerpo=cuerpoM??auto.cuerpo
  const faltan=elegidas.filter(x=>!x.edit.dni||!x.edit.nacimiento)
  // Historial de este cliente: qué se pidió antes, para quién
  const hist=(()=>{ const m={}; seguros.filter(r=>normTxt(r['Cliente'])===normTxt(cliente)).forEach(r=>{ const k=`${r['Fecha pedido']}|${r['N° Presupuesto']}`
    ;(m[k]=m[k]||{fecha:String(r['Fecha pedido']||'').trim(), nro:String(r['N° Presupuesto']||'').trim(), proyecto:String(r['Proyecto']||'').trim(), vigencia:String(r['Vigencia']||'').trim(), personas:[]}).personas.push(String(r['Persona']||'').trim().split(' ')[0]) })
    return Object.values(m).reverse().slice(0,6) })()
  const partir=s=>String(s||'').split(/[,;\s]+/).map(x=>x.trim()).filter(Boolean)
  async function enviar(){
    if(!elegidas.length){ showToast('Tildá al menos una persona','err'); return }
    const dests=partir(to); if(!dests.length){ showToast('Falta a quién se lo mandás','err'); return }
    setSaving(true)
    try{
      // Lo que se completó acá (DNI, nacimiento) → a RRHH, así la próxima sale solo
      for(const x of elegidas){ const ch={}
        if(x.edit.dni && x.edit.dni!==x.dni) ch.dni=x.edit.dni
        if(x.edit.nacimiento && x.edit.nacimiento!==x.nacimiento) ch.fechaNac=x.edit.nacimiento
        if(x.edit.nacionalidad && x.edit.nacionalidad!==x.nacionalidad) ch.nacionalidad=x.edit.nacionalidad
        if(Object.keys(ch).length){ try{ await fetch('/api/freelancer-upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:x.nombre, ...ch})}) }catch(e){} } }
      // Los archivos viajan en base64 adentro del JSON (como el PDF de la tarjeta)
      const adjuntos=[]
      for(const f of archivos){ const b=await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result).split(',')[1]); r.onerror=rej; r.readAsDataURL(f) }); adjuntos.push({nombre:f.name, tipo:f.type||'application/octet-stream', base64:b}) }
      const r=await fetch('/api/seguro-pedir',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num, to:dests, cc:partir(cc), asunto, cuerpo,
        personas:elegidas.map(x=>({nombre:x.nombre, dni:x.edit.dni, nacimiento:x.edit.nacimiento, nacionalidad:x.edit.nacionalidad})),
        trabajo:{cliente, agencia, proyecto, fechaEvento:fechas[0]||'', lugar}, vigencia, requisitos, adjuntos, reutilizar:adjReusados.map(a=>({id:a.id, nombre:a.nombre, link:a.link}))})})
      const j=await r.json(); if(!j.ok){ showToast(j.error||'No se pudo enviar','err'); setSaving(false); return }
      showToast(j.aviso || `Seguro pedido ✓ · ${elegidas.length} ${elegidas.length===1?'persona':'personas'}${j.adjuntos?` · ${j.adjuntos} ${j.adjuntos===1?'adjunto':'adjuntos'}`:''} · desde ${j.desde}`, j.aviso?'err':undefined); onSent&&onSent()
    }catch(e){ showToast('Error de conexión','err'); setSaving(false) }
  }
  const chk={display:'flex', gap:9, alignItems:'flex-start', padding:'7px 0', fontSize:12.5}
  const mini={...inpV2, padding:'5px 8px', fontSize:12}
  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:950, display:'flex', justifyContent:'center', overflowY:'auto', padding:'40px 20px'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:640, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)', height:'fit-content'}}>
      <div style={{padding:'18px 22px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', gap:12}}>
        <div><div style={{fontSize:16, fontWeight:700, color:T.ink}}>🛡 Pedir seguro · #{num}</div><div style={{fontSize:12, color:T.ink3, marginTop:2}}>{[cliente, proyecto].filter(Boolean).join(' · ')} · mail a La Segunda con la nómina. Queda anotado en SEGUROS.</div></div>
        <button onClick={onClose} style={{border:'none', background:'transparent', fontSize:22, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
      </div>
      <div style={{padding:'18px 22px'}}>
        <label style={lblV2}>Quiénes van · {elegidas.length}</label>
        <div style={{border:`1px solid ${T.border}`, borderRadius:10, padding:'2px 12px', marginBottom:8}}>
          {personas.length===0 && <div style={{fontSize:12.5, color:T.ink3, padding:'9px 0'}}>Todavía no hay nadie en el staff de este trabajo. Agregá abajo a quien vaya.</div>}
          {personas.map((x,i)=><div key={x.nombre} style={{...chk, borderTop:i===0?'none':`1px solid ${T.border}`}}>
            <input type="checkbox" checked={!!x.sel} onChange={()=>setPersonas(ps=>ps.map((y,j)=>j===i?{...y,sel:!y.sel}:y))} style={{marginTop:3, cursor:'pointer'}}/>
            <div style={{flex:1, minWidth:0}}>
              <div style={{color:T.ink, fontWeight:600}}>{x.nombre}{!x.enRRHH && <span style={{color:T.warn, fontSize:11}}> · no está en RRHH: se crea con estos datos</span>}</div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginTop:5}}>
                <input value={x.edit.dni} onChange={e=>updP(i,{dni:e.target.value.replace(/\D/g,'')})} placeholder="DNI" style={{...mini, fontFamily:MONO, borderColor:x.edit.dni?T.border:T.warn}}/>
                <input value={x.edit.nacimiento} onChange={e=>updP(i,{nacimiento:e.target.value})} placeholder="Nacimiento dd/mm/aaaa" style={{...mini, fontFamily:MONO, borderColor:x.edit.nacimiento?T.border:T.warn}}/>
                <input value={x.edit.nacionalidad} onChange={e=>updP(i,{nacionalidad:e.target.value})} placeholder="Nacionalidad" style={mini}/>
              </div>
              {(!x.edit.dni||!x.edit.nacimiento) && <div style={{fontSize:11, color:T.warn, marginTop:4}}>Falta {[!x.edit.dni&&'DNI', !x.edit.nacimiento&&'fecha de nacimiento'].filter(Boolean).join(' y ')} en RRHH. Completalo acá y queda guardado.</div>}
            </div>
          </div>)}
        </div>
        <div style={{display:'flex', gap:8, marginBottom:16}}>
          <input list="seg-rrhh" value={otro} onChange={e=>setOtro(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); agregar() } }} placeholder="Agregar a alguien más (Juan, Sofi, un asistente…)" style={{...inpV2, flex:1}}/>
          <datalist id="seg-rrhh">{rrhhNames.filter(n=>!esMagma(n)).map(n=><option key={n} value={n}/>)}</datalist>
          <button onClick={agregar} style={{...miniBtn, padding:'8px 14px'}}>Agregar</button>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1.4fr', gap:10, marginBottom:14}}>
          <div><label style={lblV2}>Para cuándo</label><input value={vigencia} onChange={e=>setVigencia(e.target.value)} placeholder="el sábado 10/10/2026 · todo octubre 2026" style={inpV2}/></div>
          <div><label style={lblV2}>Dónde</label><input list="seg-lugares" value={lugar} onChange={e=>setLugar(e.target.value)} placeholder="Dirección del evento" style={inpV2}/>
            <datalist id="seg-lugares">{lugares.map(l=><option key={l} value={l}/>)}</datalist></div>
        </div>
        <label style={lblV2}>Lo que piden para este lugar (cláusula de no repetición, monto, papeles)</label>
        <textarea value={requisitos} onChange={e=>{ setReqTocado(true); setRequisitos(e.target.value) }} rows={3} placeholder="Pegá acá lo que mandó el cliente. Ej: cláusula de no repetición a favor de Winter 99 SRL, CUIT 30-71780733-9, por $50.000.000." style={{...inpV2, resize:'vertical', marginBottom:4}}/>
        <div style={{fontSize:11, color:T.ink3, marginBottom:10, lineHeight:1.45}}>
          {sug.fuente && requisitos===sug.texto
            ? <>Precargado de {sug.fuente}. <button onClick={()=>{ setReqTocado(true); setRequisitos(''); setReusar([]) }} style={{border:'none', background:'transparent', color:T.brand, cursor:'pointer', fontSize:11, padding:0}}>Esta vez es otra cosa, borrar</button></>
            : 'Va en el mail y queda guardado con este pedido: la próxima vez en el mismo lugar sale solo.'}
        </div>
        {/* Archivos: lo que mandó el cliente (protocolo, planilla). Van al mail, a Drive, y vuelven la próxima vez. */}
        <div style={{border:`1px dashed ${T.border}`, borderRadius:10, padding:'10px 12px', marginBottom:14}}>
          {(sug.adjuntos||[]).map(a=><label key={a.id} style={{display:'flex', gap:8, alignItems:'center', fontSize:12.5, padding:'3px 0', cursor:'pointer'}}>
            <input type="checkbox" checked={reusar.includes(a.id)} onChange={e=>setReusar(r=>e.target.checked?[...r,a.id]:r.filter(x=>x!==a.id))}/>
            <span style={{color:T.ink}}>Volver a adjuntar <strong>{a.nombre}</strong></span><a href={a.link} target="_blank" rel="noreferrer" style={{fontSize:11, color:T.ink3}}>ver</a>
          </label>)}
          {archivos.map((f,i)=><div key={f.name+f.size} style={{display:'flex', gap:8, alignItems:'center', fontSize:12.5, padding:'3px 0'}}>
            <span style={{color:T.ink, flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>📎 {f.name} <span style={{color:T.ink3}}>· {kb(f.size)}</span></span>
            <button onClick={()=>setArchivos(a=>a.filter((_,j)=>j!==i))} style={{border:'none', background:'transparent', color:T.ink3, cursor:'pointer', fontSize:15, padding:0}}>×</button>
          </div>)}
          <label style={{display:'flex', gap:8, alignItems:'center', fontSize:12, color:T.brand, cursor:'pointer', padding:'4px 0', fontWeight:600}}>
            <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" onChange={e=>{ agregarArchivos(e.target.files||[]); e.target.value='' }} style={{display:'none'}}/>
            + Adjuntar lo que mandó el cliente (PDF, planilla)
            <span style={{color:T.ink3, fontWeight:400}}>· hasta 3 MB en total{pesoAdj?` · ${kb(pesoAdj)}`:''}</span>
          </label>
        </div>
        {hist.length>0 && <div style={{background:T.surfaceAlt, border:`1px solid ${T.border}`, borderRadius:10, padding:'8px 12px', margin:'6px 0 14px'}}>
          <div style={{fontSize:10.5, fontWeight:700, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3, marginBottom:4}}>Seguros pedidos para {cliente}</div>
          {hist.map((h,i)=><div key={i} style={{fontSize:12, color:T.ink2, padding:'3px 0'}}>{h.fecha} · #{h.nro} {h.proyecto} · {h.personas.join(', ')}{h.vigencia?` · ${h.vigencia}`:''}</div>)}
        </div>}
        <div style={{display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:10, marginBottom:12}}>
          <div><label style={lblV2}>Para</label><input value={to} onChange={e=>setTo(e.target.value)} style={inpV2}/></div>
          <div><label style={lblV2}>CC</label><input value={cc} onChange={e=>setCc(e.target.value)} placeholder="opcional" style={inpV2}/></div>
        </div>
        <label style={lblV2}>Asunto</label>
        <input value={asunto} onChange={e=>setAsuntoM(e.target.value)} style={{...inpV2, marginBottom:12}}/>
        <label style={lblV2}>Mail {(asuntoM!=null||cuerpoM!=null) && <button onClick={()=>{setAsuntoM(null);setCuerpoM(null)}} style={{border:'none', background:'transparent', color:T.brand, cursor:'pointer', fontSize:11, padding:0, marginLeft:6}}>volver al texto automático</button>}</label>
        <textarea value={cuerpo} onChange={e=>setCuerpoM(e.target.value)} rows={13} style={{...inpV2, resize:'vertical', fontFamily:MONO, fontSize:12.5, lineHeight:1.45}}/>
      </div>
      <div style={{padding:'14px 22px', borderTop:`1px solid ${T.border}`, display:'flex', gap:10, alignItems:'center'}}>
        <span style={{fontSize:11.5, color:faltan.length?T.warn:T.ink3, flex:1, lineHeight:1.4}}>{faltan.length?`A ${faltan.map(x=>x.nombre.split(' ')[0]).join(' y ')} le falta DNI o nacimiento: el mail sale igual, pero el productor lo va a pedir.`:`Sale desde ${yo||'tu casilla'} y queda en Enviados.`}</span>
        <button onClick={onClose} style={{padding:'9px 18px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:500, cursor:'pointer'}}>Cancelar</button>
        <button onClick={enviar} disabled={saving||!elegidas.length} style={{padding:'9px 22px', borderRadius:9, border:'none', background:T.brand, color:'#fff', fontSize:13.5, fontWeight:600, cursor:saving||!elegidas.length?'default':'pointer', opacity:saving||!elegidas.length?0.6:1}}>{saving?'Enviando…':'Enviar a La Segunda'}</button>
      </div>
    </div>
  </div>
}
// Los links de Drive del proyecto, a la vista de todos. Juan, 14/9/2026: "tengo que
// tener los links de entrega de fotos en cada proyecto, así vemos fácil todos qué
// mandarle al cliente". Lo que se manda es FINALES (o Fotos en las carpetas
// viejas): nunca la carpeta del proyecto, que tiene Pre-entregas adentro.
function DriveDelProyecto({p, num, showToast, onRefresh, agencias=[], clientes=[]}){
  const [creando,setCreando]=useState(false)
  // Recursos de la agencia y del cliente (logo, gráfica): AGENCIAS / CLIENTES → "Drive Recursos"
  const kk=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'')
  const recAg=(agencias.find(a=>kk(a.Nombre)===kk(p['Agencia']))||{})['Drive Recursos']||''
  const recCl=(clientes.find(c=>kk(c.Nombre)===kk(p['Cliente']))||{})['Drive Recursos']||''
  const [copiado,setCopiado]=useState(false)
  const [verFotos,setVerFotos]=useState(false)
  const conFotos=llevaFotos(Object.keys(p).filter(c=>/^Pedido \d+$/.test(c)).map(c=>p[c]))
  const crudo=String(p['Drive Crudo']||'').trim(), entrega=String(p['Drive Entrega']||'').trim(), finales=String(p['Drive Finales']||'').trim()
  const paraCliente=finales||entrega
  const copiar=async()=>{ try{ await navigator.clipboard.writeText(paraCliente); setCopiado(true); setTimeout(()=>setCopiado(false),2000) }catch(e){} }
  const crear=async()=>{
    setCreando(true)
    try{
      const r=await fetch('/api/drive-carpeta',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({num, destinos:['crudo','entregas']})})
      const j=await r.json()
      if(!j.ok){ showToast(j.error||'No se pudo crear','err') } else { showToast(j.crudo?.creada||j.entregas?.creada?'Carpetas creadas ✓':'Las carpetas ya existían ✓'); onRefresh&&onRefresh() }
    }catch(e){ showToast('Error de conexión','err') }
    setCreando(false)
  }
  const link=(href,label,title)=><a href={href} target="_blank" rel="noreferrer" title={title} style={{...miniBtn, textDecoration:'none', display:'inline-block'}}>{label}</a>
  return <div style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', paddingBottom:12, marginBottom:10, borderBottom:`1px solid ${T.border}`}}>
    <span style={{fontSize:10, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, fontWeight:600, marginRight:4}}>Drive</span>
    {crudo && link(crudo,'📁 Crudo','Lo que se filmó')}
    {entrega && link(entrega,'📤 Entrega','La carpeta del proyecto en ENTREGAS CLIENTES (con Pre-entregas y Finales)')}
    {finales && link(finales,'📸 Finales','Lo que se le manda al cliente')}
    {recCl && link(recCl,`🎨 Recursos de ${p['Cliente']}`,'Logo, gráfica y lo general del cliente')}
    {/* Si agencia y cliente son el mismo (CMQ/CMQ) es una sola carpeta: un solo botón. */}
    {recAg && recAg!==recCl && link(recAg,`🎨 Recursos de ${p['Agencia']}`,'Logo, gráfica y lo general de la agencia')}
    {paraCliente && <button onClick={copiar} style={{...miniBtn, color:T.pos, borderColor:T.pos}}>{copiado?'✓ Copiado':'Copiar link para el cliente'}</button>}
    {!crudo && !entrega && <>
      <span style={{fontSize:12, color:T.ink2}}>Este proyecto no tiene carpetas en Drive todavía.</span>
      <button onClick={crear} disabled={creando} style={miniBtn}>{creando?'Creando…':'📁 Crear carpetas'}</button>
    </>}
    {paraCliente && !finales && <span style={{fontSize:11, color:T.ink3}}>Carpeta vieja sin “Finales”: el link es el de la carpeta entera.</span>}
    {/* Las fotos también acá: un filmmaker sin edición no aparece en el tablero de Edición. */}
    {conFotos && entrega && <button onClick={()=>setVerFotos(v=>!v)} style={{...miniBtn, background:verFotos?T.ink:undefined, color:verFotos?'#fff':undefined}}>{verFotos?'Cerrar fotos':'🖼 Fotos'}</button>}
    {verFotos && <div style={{flexBasis:'100%', border:`1px solid ${T.border}`, borderRadius:10, overflow:'hidden'}}><FotosProyecto num={num} showToast={showToast} onListo={j=>{ if(j?.finalesNueva&&onRefresh) onRefresh() }}/></div>}
  </div>
}

function Mini({label,val,color}){ return <div><div style={{fontSize:10, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, fontWeight:600}}>{label}</div><div style={{fontSize:14, fontFamily:MONO, color:color||T.ink, marginTop:2}}>{val}</div></div> }

// ============================ FACTURACIÓN ============================
// Una factura es REAL si tiene número de factura o fecha de emisión. Si no tiene ninguno,
// es un registro fantasma (proyecto migrado del sheet, nunca facturado de verdad).
const esFacturaReal = f => !!(String(f['Nro de Factura']||'').trim() || String(f['Fecha emision']||'').trim())

// Un trabajo se puede facturar en partes (seña + saldo). La barrita muestra cuánto del
// trabajo ya tiene factura: se ve de un vistazo que falta la otra.
function BarraFacturado({pct, ancho=54}){
  return <span style={{display:'inline-block', width:ancho, height:5, borderRadius:5, background:T.border, overflow:'hidden', flexShrink:0}}><span style={{display:'block', width:`${Math.max(4,Math.min(100,pct))}%`, height:'100%', background:T.warn, borderRadius:5}}/></span>
}
// La segunda factura de un trabajo hereda el plazo y el IVA de la primera: es el mismo
// cliente y el mismo acuerdo, no hay por qué volver a elegirlos.
function heredarDeFactura(x){
  const ult=x?.facturas?.[x.facturas.length-1]; if(!ult) return null
  const pl=String(ult['Plazo']||'').trim(), dias=/contado/i.test(pl)?'0':(pl.match(/\d+/)||[''])[0]
  return { plazo:PLAZOS_FACTURA.includes(dias)?dias:null, conIVA: parseMonto(ult['IVA'])>0 || !parseMonto(ult['Precio SIN IVA']) }
}
// Los plazos que ofrece la factura nueva. 90 se sumó el 5/10/2026: Oir (Unilever) paga a 90 días.
const PLAZOS_FACTURA=['0','15','30','60','90']
// A quién se le factura un trabajo: a la agencia, o al cliente si es directo.
const aQuienSeFactura = p => (p?.['Agencia']&&!/sin agencia|directo/i.test(p['Agencia']))?p['Agencia']:(p?.['Cliente']||'')
// El plazo con el que paga ESA agencia (solapa AGENCIAS, columna "Plazo de pago", en días). Juan, 5/10/2026:
// "cada vez que hagamos una factura de Unilever sea 90 días". Manda sobre el 30 de siempre y sobre lo que se
// hereda de la factura anterior del mismo trabajo. Sin dato devuelve null y todo sigue como antes.
function plazoDeAgencia(agencias, p){
  const quien=normTxt(aQuienSeFactura(p)); if(!quien) return null
  const ag=(agencias||[]).find(a=>normTxt(a['Nombre'])===quien)
  const dias=(String(ag?.['Plazo de pago']||'').match(/\d+/)||[''])[0]
  return dias ? String(parseInt(dias)) : null
}

// Semáforo de fecha de evento para "sin facturar": futuro (no se puede aún), recién pasó (verde),
// pasó hace rato sin facturar (ámbar→rojo). Escala para priorizar lo más atrasado.
function semEvento(fechaEvento){
  const fe=parseD(fechaEvento)
  if(!fe) return {c:T.ink3, l:'sin fecha', fecha:'s/f', dias:-99999, futuro:false}
  const d=Math.floor((new Date()-fe)/864e5)
  const fecha=`${fe.getDate()}/${fe.getMonth()+1}`
  if(d<0)  return {c:T.ink3, l:`evento en ${-d}d (futuro)`, fecha, dias:d, futuro:true}
  if(d===0)return {c:T.pos,  l:'el evento es hoy', fecha, dias:d, futuro:false}
  if(d<=15)return {c:T.pos,  l:'listo para facturar', fecha, dias:d, futuro:false}
  if(d<=30)return {c:T.warn, l:`facturá pronto · ${d}d`, fecha, dias:d, futuro:false}
  return     {c:T.brand,l:`atrasado ${d}d`, fecha, dias:d, futuro:false}
}

function Facturacion({data, onRefresh, showToast, nav, clearNav, goTo}){
  const fc=data.facturacion||[], cuentas=data.cuentas||[]
  const fcReal=fc.filter(esFacturaReal)  // cobranza solo sobre facturas reales (con número/emisión)
  const hoy=new Date()
  const presus=data.presupuestos||[]
  // Fecha del evento por N° de presupuesto (las facturas reales a veces no la tienen en su fila)
  const eventoByNum={}; ;[...(data.proyectos||[]),...presus].forEach(p=>{ const n=String(p['N° presupuesto']||p['Columna 1']||'').trim(); const fe=p['Fecha Evento']; if(n&&fe&&!eventoByNum[n]) eventoByNum[n]=fe })
  const evDe=f=>f['Fecha Evento']||eventoByNum[String(f['N° Presupuesto']||'').trim()]||''
  const [q,setQ]=useState(''), [filt,setFilt]=useState('todas'), [mesF,setMesF]=useState('todos'), [cobrando,setCobrando]=useState(null), [nuevaF,setNuevaF]=useState(false), [nuevaFsel,setNuevaFsel]=useState(null), [yaModal,setYaModal]=useState(null), [mailFactura,setMailFactura]=useState(null), [editarFechas,setEditarFechas]=useState(null), [reclamo,setReclamo]=useState(null)

  // Quién debe plata, agrupado — para reclamar de una todo lo de un mismo cliente
  const agenciasPendientes=(()=>{
    const m={}
    ;(data.facturacion||[]).forEach(f=>{
      if(isCobrada(f)) return
      const monto=parseMonto(f['Precio FINAL']); if(monto<=0) return
      const k=String(f['Agencia']||f['Cliente']||'').trim(); if(!k) return
      m[k]=m[k]||{nombre:k,n:0,monto:0}; m[k].n++; m[k].monto+=monto
    })
    return Object.values(m).sort((a,b)=>b.monto-a.monto)
  })()
  const matchMes=fechaStr=>{ if(mesF==='todos')return true; const d=parseD(fechaStr); return d?`${d.getMonth()+1}-${d.getFullYear()}`===mesF:false }
  // Dos formas de mirar lo mismo: "Por agencia" (qué debe y qué falta facturarle a cada una)
  // y "Lista" (todas las facturas una por una, con sus filtros de siempre).
  const [vista,setVista]=useState('agencias'), [agF,setAgF]=useState('todas'), [agOpen,setAgOpen]=useState({})
  const cel=useEsCelular()
  // Seguimiento de cobranza por agencia: lo que se está tipeando (fecha prometida + nota) antes de guardar,
  // y qué acción de a varias facturas está en curso (para no mandarla dos veces).
  const [promDraft,setPromDraft]=useState({}), [loteBusy,setLoteBusy]=useState('')
  // Al abrir "Nueva factura" desde una agencia con varios trabajos tildados: los que van en la misma factura.
  const [nuevaFextras,setNuevaFextras]=useState([])
  // Pedido de orden de compra (Austral): la agencia para la que está abierto el mail, y por cada
  // trabajo, cuándo fue la última vez que se pidió (solapa OC_PEDIDOS).
  const [pedirOC,setPedirOC]=useState(null)
  const ocDe={}; (data.ocPedidos||[]).forEach(r=>{ const n=String(r['N° Presupuesto']||'').trim(), d=parseD(r['Fecha pedido']); if(!n||!d) return; if(!ocDe[n]||d>=ocDe[n].d) ocDe[n]={d, fecha:`${d.getDate()}/${d.getMonth()+1}`, nOC:String(r['N° OC']||'').trim()} })
  // Las columnas "Prometió pagar" y "Nota cobranza" pueden no estar todavía en el sheet: sin ellas el control no aparece.
  const hayPromesa=fc.length>0 && Object.prototype.hasOwnProperty.call(fc[0],'Prometió pagar')
  const aISO=s=>{ const d=parseD(s); return d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:'' }
  const deISO=s=>{ const m=String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m?`${+m[3]}/${+m[2]}/${m[1]}`:'' }
  // Cambia lo mismo en varias facturas de una (marcar enviadas, anotar la promesa de pago).
  async function lote(filas, cambios, accion, okMsg, porFila){
    if(loteBusy) return false
    setLoteBusy(accion)
    try{ const r=await fetch('/api/facturas-lote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion, cambios, filas:filas.map(f=>({fila:f.__row, presupuestoNum:String(f['N° Presupuesto']||'').trim(), ...(porFila?{cambios:porFila(f)}:{})}))})})
      const j=await r.json(); if(!j.ok){ showToast(j.error||'Error','err'); setLoteBusy(''); return false }
      showToast(okMsg); if(onRefresh) await onRefresh(); setLoteBusy(''); return true
    }catch(e){ showToast('Error de conexión','err'); setLoteBusy(''); return false } }
  // Cuando se llega desde otro módulo buscando una factura puntual, se abre la lista: ahí está la fila exacta.
  useEffect(()=>{ if(nav?.mod==='facturacion'){ if(nav.agF){ setVista('agencias'); setAgF(nav.agF) } if(nav.filtro||nav.q) setVista('lista'); if(nav.filtro)setFilt(['atrasadas','pendiente'].includes(nav.filtro)?'porcobrar':nav.filtro); if(nav.q){setQ(nav.q); setFilt('todas')} clearNav&&clearNav() } /* eslint-disable-next-line */ },[nav])

  // presupuestos aprobados con saldo pendiente de facturar
  const pendTodos=presus.filter(isAprobado).map(p=>{
    const facturas=fc.filter(f=>esFacturaReal(f) && String(f['N° Presupuesto']||'').trim()===String(p['Columna 1']||'').trim() && !String(f['Nro de Factura']||'').toUpperCase().startsWith('ANULADA'))
    const facturado=facturas.reduce((s,f)=>s+(parseMonto(f['Precio SIN IVA'])||parseMonto(f['Precio FINAL'])),0)
    const neto=parseMonto(p['Precio Final'])
    return {p, facturas, facturado, neto, pendiente:Math.max(0,neto-facturado)}
  }).filter(x=>x.neto>0 && x.pendiente>x.neto*0.05)
  // Trabajos facturados EN PARTE (la seña ya está cargada, falta el saldo), por N° de
  // presupuesto. La fila de la factura ya cargada avisa cuánto falta y deja cargar la
  // otra de un toque: antes había que acordarse e ir a buscar el trabajo a "Sin facturar".
  const enPartes={}; pendTodos.forEach(x=>{ if(x.facturado>0) enPartes[String(x.p['Columna 1']||'').trim()]=x })
  // "Por facturar" = trabajo YA HECHO que falta facturar. Los eventos que todavía no
  // pasaron no se pueden facturar: contarlos hacía parecer que faltaba cobrar mucho más.
  const pendientes=pendTodos.filter(x=>!semEvento(x.p['Fecha Evento']).futuro)
  const pendFuturos=pendTodos.filter(x=>semEvento(x.p['Fecha Evento']).futuro)
  const montoFuturos=pendFuturos.reduce((s,x)=>s+x.pendiente,0)

  // (se eliminó mandarMail(): abría Outlook con mailto: y ya no lo usaba nadie.
  //  El envío real sale del botón ✉ → MailFacturaModal → /api/factura-enviar)

  function subirPDF(f){
    const input=document.createElement('input'); input.type='file'; input.accept='application/pdf,image/*'
    input.onchange=async()=>{
      const file=input.files?.[0]; if(!file) return
      // Reemplazo: avisar que el PDF viejo se deja de usar (queda en Drive, no se borra)
      if(f['Factura'] && !window.confirm(`Esta factura ya tiene un PDF cargado.\n\n¿Reemplazarlo por "${file.name}"?\n\n(El anterior queda guardado en Drive, solo deja de estar linkeado acá.)`)) return
      const nro=f['Nro de Factura']||'', nl=nro.toLowerCase()
      const entidad=nl.includes('sofia')?'Sofia':nl.includes('lulu')?'Lulu':(nl.includes('ef-')||nl.includes('efectivo'))?'Efectivo':'SRL'
      const fe=parseD(f['Fecha emision']), mes=fe?fe.getMonth()+1:hoy.getMonth()+1, anio=fe?fe.getFullYear():hoy.getFullYear()
      const fd=new FormData()
      fd.append('file', file, file.name); fd.append('entidad', entidad); fd.append('nroFactura', nro)
      fd.append('presupuestoNum', f['N° Presupuesto']||''); fd.append('mes', String(mes)); fd.append('anio', String(anio))
      fd.append('fila', String(f.__row||''))   // adelanto + saldo: sin la fila el PDF pisaba la otra factura
      showToast('Subiendo PDF…')
      try{ const r=await fetch('/api/factura-upload',{method:'POST',body:fd}); const j=await r.json(); if(!j.ok){showToast(j.error||'Error','err');return}
        showToast(msgUpload(j), (j.avisoLink||j.accionNro==='conflicto')?'err':undefined); if(onRefresh) onRefresh() }
      catch(e){ showToast('Error de conexión','err') }
    }
    input.click()
  }

  // Qué decirle a Flor después de subir un PDF. El N° sale del nombre del archivo
// de AFIP: si estaba vacío se completa, si estaba mal escrito se corrige, y si el
// PDF es de OTRA factura no se toca nada y se avisa fuerte.
function msgUpload(j, base='PDF subido ✓'){
  if(j.avisoLink) return 'PDF subido a Drive, pero no quedó linkeado: '+j.avisoLink
  if(j.accionNro==='conflicto') return `⚠ OJO: el PDF es la factura ${j.nroDetectado}, pero acá dice ${j.nroAnterior}. No toqué nada — fijate si adjuntaste el PDF que va.`
  if(j.accionNro==='completar') return `${base} · N° de factura completado: ${j.nroDetectado}`
  if(j.accionNro==='corregir') return `${base} · N° corregido: ${j.nroAnterior} → ${j.nroDetectado}`
  return base
}

// Anular/borrar una factura (errores, nota de crédito, duplicados)
  async function borrarFactura(f){
    const numF=f['N° Presupuesto'], total=parseMonto(f['Precio FINAL'])
    if(!window.confirm(`Anular/borrar esta factura?\n#${numF} · ${f['Proyecto']||f['Cliente']||''} · ${fmt(total)}\n\nÚsalo para errores, notas de crédito o duplicados. ¿Seguro?`)) return
    const post=forzar=>fetch('/api/factura-borrar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nroPresupuesto:String(numF), monto:total, fila:f.__row, forzar})}).then(r=>r.json())
    try{ let j=await post(false)
      if(j.requiereForzar){ if(!window.confirm(j.error+'\n\n¿Borrar igual?')) return; j=await post(true) }
      if(!j.ok){ showToast(j.error||'Error','err'); return }
      showToast('Factura anulada ✓'); if(onRefresh) onRefresh()
    }catch(e){ showToast('Error de conexión','err') }
  }

  // Fecha de referencia de la deuda: vencimiento si hay; si no (filas viejas migradas
  // sin vencimiento), usamos la fecha del evento, o la de emisión como último recurso.
  const fechaRef=f=>{ const v=parseD(f['Vencimiento']); if(v) return {d:v,src:'vence'}; const e=parseD(f['Fecha Evento']); if(e) return {d:e,src:'evento'}; const em=parseD(f['Fecha emision']); if(em) return {d:em,src:'emitida'}; return null }
  // Contra el día de hoy a las 00:00: con la hora adentro, una factura que vence HOY ya
  // contaba como vencida desde la medianoche (y la diaria, que sí compara por día, decía otra cosa).
  const hoy0=new Date(hoy.getFullYear(),hoy.getMonth(),hoy.getDate())
  const diffVenc=f=>{ const r=fechaRef(f); return r?Math.round((r.d-hoy0)/864e5):null }

  // "Ya está ✓" en Sin facturar: abre mini-modal para confirmar el monto REAL cobrado
  // (sugiere el del presupuesto, lo podés cambiar). Marca factura real + cobrada SIN tocar saldos.
  async function confirmarYaCobrada(x, montoReal, cobrada=true, fechaEnviada='', fechaCobro=''){
    const num=x.p['Columna 1']
    try{ const r=await fetch('/api/factura-confirmar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nroPresupuesto:String(num), cobrada, monto:montoReal, fechaEnviada, fechaCobro})})
      const j=await r.json(); if(!j.ok){showToast(j.error||'Error','err');return}
      showToast(`#${num} ${cobrada?'facturada y cobrada':'facturada (pendiente de cobro)'} por ${fmt(montoReal)} ✓`); setYaModal(null); if(onRefresh) onRefresh()
    }catch(e){ showToast('Error de conexión','err') }
  }
  const estF=f=>{ if(isCobrada(f))return'cobrada'; const ya=parseMonto(f['Monto cobrado']); if(ya>0)return'parcial'; const d=diffVenc(f); if(d==null)return'pendiente'; if(d<-30)return'reclamar'; if(d<0)return'vencida'; if(d<7)return'por-vencer'; return'pendiente' }
  const ESTF={ cobrada:{c:T.pos,l:'Cobrada'}, parcial:{c:T.warn,l:'Parcial'}, 'por-vencer':{c:T.warn,l:'Por vencer'}, pendiente:{c:T.ink3,l:'Pendiente'}, vencida:{c:T.brand,l:'Vencida'}, reclamar:{c:T.brand,l:'¡Reclamar!'} }

  // ¿La factura salió para el cliente? Administración a veces la carga y espera el OK para
  // mandarla: cargada NO es enviada. Marcan envío "Fc Enviada" (mail desde la app) y
  // "Fecha enviada" (cargada a mano o histórico del sheet).
  const enviadaF=f=>/^(TRUE|VERDADERO|SI|SÍ|X)$/i.test(String(f['Fc Enviada']||'').trim()) || !!String(f['Fecha enviada']||'').trim()
  // Solo alarma sobre las que están sin cobrar: si ya la cobraste, obvio que salió.
  const sinEnviarLista=fcReal.filter(f=>!enviadaF(f) && !isCobrada(f))

  // Saldo REAL de cada factura: si hubo cobro parcial, se debe solo el resto.
  // Antes la tarjeta sumaba el precio entero de las parciales y la lista las excluía:
  // por eso el total de arriba no coincidía con la suma de abajo.
  const saldoF=f=>Math.max(0, parseMonto(f['Precio FINAL'])-parseMonto(f['Monto cobrado']))

  // Por cobrar, abierto por estado (para que el total grande no asuste sin contexto)
  const noCobradas=fcReal.filter(f=>!isCobrada(f))
  const pcTotal=noCobradas.reduce((s,f)=>s+saldoF(f),0)
  const vencidasMonto=noCobradas.filter(f=>(diffVenc(f)??99)<0).reduce((s,f)=>s+saldoF(f),0)
  const pcPorVencer=noCobradas.filter(f=>{const d=diffVenc(f); return d!=null&&d>=0&&d<7}).reduce((s,f)=>s+saldoF(f),0)
  const pcEnPlazo=Math.max(0, pcTotal-vencidasMonto-pcPorVencer)

  const porFacturarTotal=pendientes.reduce((s,x)=>s+x.pendiente,0)

  // ===== Vista "Por agencia": una fila por agencia con lo vencido, lo que está en plazo y lo
  // que falta facturarle. Es lo que se pregunta administración: "¿qué nos debe X y qué le tengo
  // que facturar?". Las razones sociales de un mismo grupo se muestran juntas: "Grupo Ng - (RABBLE S.A)"
  // y "Grupo Ng - (PARMENTTIER)" son Grupo Ng, que factura con una u otra según el día del evento.
  // Cada factura conserva su razón social, y el reclamo sale por razón social.
  const grupoDe=nombre=>String(nombre||'').split(' - (')[0].trim()
  const claveAg=o=>String(o['Agencia']||o['Cliente']||'').trim()
  const agMap={}
  const agDe=k=>{ const g=grupoDe(k)||'(sin agencia)'; return agMap[g]=agMap[g]||{nombre:g, razones:new Set(), deben:[], sinFact:[], atrasos:[]} }
  noCobradas.forEach(f=>{ if(saldoF(f)<=0) return; const k=claveAg(f), a=agDe(k); a.deben.push(f); if(k&&k!==a.nombre) a.razones.add(k) })
  pendientes.forEach(x=>{ const k=claveAg(x.p), a=agDe(k); a.sinFact.push(x); if(k&&k!==a.nombre) a.razones.add(k) })
  // Cómo paga cada una: días entre el vencimiento y el cobro de lo que ya pagó (la mediana, para
  // que una factura que se colgó seis meses no tape cómo paga normalmente).
  fcReal.forEach(f=>{ if(!isCobrada(f)) return; const v=parseD(f['Vencimiento']), c=parseD(f['Fecha cobro']); if(!v||!c) return; const a=agMap[grupoDe(claveAg(f))||'(sin agencia)']; if(a) a.atrasos.push(Math.round((c-v)/864e5)) })
  // Las otras filas sin cobrar de la MISMA factura (mismo N°, misma agencia): una factura que cubre varios trabajos.
  const hermanasDe=f=>{ const n=String(f['Nro de Factura']||'').trim(); if(!esNroDeFactura(n)) return []; return noCobradas.filter(g=>g!==f && g.__row!==f.__row && String(g['Nro de Factura']||'').trim()===n && claveAg(g)===claveAg(f) && saldoF(g)>0) }
  const mediana=a=>{ if(!a.length) return null; const b=[...a].sort((x,y)=>x-y), m=Math.floor(b.length/2); return b.length%2?b[m]:Math.round((b[m-1]+b[m])/2) }
  const agLista=Object.values(agMap).map(a=>{
    const venc=a.deben.filter(f=>(diffVenc(f)??99)<0)
    const vencido=venc.reduce((s,f)=>s+saldoF(f),0), debe=a.deben.reduce((s,f)=>s+saldoF(f),0)
    // Lo que prometió pagar va POR FACTURA: en Ostara cada factura tiene su tiempo. La agencia muestra la
    // fecha más próxima. "Misma fecha para todas" queda para cuando de verdad entra todo junto (Telefe:
    // un trabajo partido en tres facturas) y solo muestra una fecha si todas las que abarca la comparten.
    const proms=a.deben.map(f=>parseD(f['Prometió pagar'])).filter(Boolean).sort((x,y)=>x-y)
    const grupoProm=venc.length?venc:a.deben
    const comun=campo=>{ const v=[...new Set(grupoProm.map(f=>String(f[campo]||'').trim()))]; return v.length===1?v[0]:'' }
    return {...a, razones:[...a.razones], venc, vencido, enPlazo:debe-vencido, sinFactMonto:a.sinFact.reduce((s,x)=>s+x.pendiente,0), sinEnviar:a.deben.filter(f=>!enviadaF(f)), atraso:mediana(a.atrasos), promProx:proms[0]||null, nProm:proms.length, promesa:comun('Prometió pagar'), notaCob:comun('Nota cobranza')}
  }).sort((a,b)=>(b.vencido-a.vencido)||((b.enPlazo+b.sinFactMonto)-(a.enPlazo+a.sinFactMonto)))
  const ql=q.trim().toLowerCase(), tiene=v=>String(v||'').toLowerCase().includes(ql)
  const agFiltradas=agLista.filter(a=>{
    if(agF==='vencido'&&!(a.vencido>0)) return false
    if(agF==='facturar'&&!a.sinFact.length) return false
    if(agF==='sinenviar'&&!a.sinEnviar.length) return false
    if(!ql) return true
    return tiene(a.nombre) || a.razones.some(tiene) || a.deben.some(f=>[f['Nro de Factura'],f['N° Presupuesto'],f['Cliente'],f['Proyecto']].some(tiene)) || a.sinFact.some(x=>[x.p['Columna 1'],x.p['Proyecto'],x.p['Cliente']].some(tiene))
  })
  const AGF=[['todas',`Todas (${agLista.length})`],['vencido',`Con algo vencido (${agLista.filter(a=>a.vencido>0).length})`],['facturar',`Con algo para facturar (${agLista.filter(a=>a.sinFact.length).length})`],['sinenviar',`Con facturas sin enviar (${agLista.filter(a=>a.sinEnviar.length).length})`]]
  // Si paga en fecha o cuántos días tarde: solo con 3 cobros medidos o más, con menos no dice nada.
  const comoPaga=a=>a.atrasos.length<3?'':(a.atraso<=0?'suele pagar en fecha':`suele pagar ${a.atraso} días tarde`)

  const filtrada=fcReal.filter(f=>{
    const e=estF(f)
    // 'parcial' entra en "Por cobrar": lo que falta cobrar de una parcial también se debe.
    const owed=['pendiente','por-vencer','vencida','reclamar','parcial']
    const mf = filt==='todas' || (filt==='cobrada'&&e==='cobrada') || ((filt==='porcobrar'||filt==='pendiente'||filt==='atrasadas')&&owed.includes(e)) || (filt==='parcial'&&e==='parcial')
      || (filt==='sinenviar'&&!enviadaF(f)&&!isCobrada(f))
    const mq=!q||[f['Nro de Factura'],f['N° Presupuesto'],f['Cliente'],f['Agencia'],f['Proyecto']].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase()))
    return mf&&mq&&matchMes(evDe(f))
  }).sort((a,b)=> filt==='todas'
      ? ((parseD(evDe(b)||b['Fecha emision'])?.getTime()||0)-(parseD(evDe(a)||a['Fecha emision'])?.getTime()||0))  // Todas: más nuevo primero
      : ((diffVenc(a)??99)-(diffVenc(b)??99)))  // resto: más atrasado primero

  // Proyectos aprobados sin facturar (o con saldo), ordenados por evento más atrasado arriba
  const pendOrdenados = pendientes.filter(x=>(!q||[x.p['Columna 1'],x.p['Proyecto'],x.p['Cliente'],x.p['Agencia']].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase())))&&matchMes(x.p['Fecha Evento'])).sort((a,b)=>semEvento(b.p['Fecha Evento']).dias-semEvento(a.p['Fecha Evento']).dias)
  const sinFactAtrasados = pendientes.filter(x=>{const s=semEvento(x.p['Fecha Evento']);return !s.futuro&&s.dias>30}).length
  const sumFiltrada = filtrada.reduce((s,f)=>s+saldoF(f),0)
  const sumPend = pendOrdenados.reduce((s,x)=>s+x.pendiente,0)

  // Trabajos futuros: todavía no pasó el evento, pero a veces el cliente pide la factura
  // por adelantado (orden de compra, cierre de mes de la agencia). Acá se pueden facturar.
  const futOrdenados = pendFuturos.filter(x=>(!q||[x.p['Columna 1'],x.p['Proyecto'],x.p['Cliente'],x.p['Agencia']].some(v=>String(v||'').toLowerCase().includes(q.toLowerCase())))&&matchMes(x.p['Fecha Evento'])).sort((a,b)=>semEvento(b.p['Fecha Evento']).dias-semEvento(a.p['Fecha Evento']).dias)
  const sumFut = futOrdenados.reduce((s,x)=>s+x.pendiente,0)

  // Opciones de mes (por fecha de evento) para el filtro
  const mesesSet={}; ;[...fcReal.map(evDe), ...pendTodos.map(x=>x.p['Fecha Evento'])].forEach(s=>{ const d=parseD(s); if(d) mesesSet[`${d.getMonth()+1}-${d.getFullYear()}`]=`${MESES_LARGO[d.getMonth()]} ${d.getFullYear()}` })
  const monthOpts=Object.entries(mesesSet).sort((a,b)=>{ const [ma,ya]=a[0].split('-').map(Number),[mb,yb]=b[0].split('-').map(Number); return yb-ya||mb-ma })

  const FILTROS=[['todas','Todas'],['porcobrar','Por cobrar'],['parcial','Parciales'],['cobrada','Cobradas'],['sinenviar',`Sin enviar (${sinEnviarLista.length})`],['sinfacturar',`Sin facturar (${pendientes.length})`],['futuros',`Futuros (${pendFuturos.length})`]]

  return <>
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20}}>
      <div><h1 style={{fontSize:23, fontWeight:700, color:T.ink, margin:0, letterSpacing:-0.3}}>Facturación</h1><div style={{fontSize:13, color:T.ink3, marginTop:3}}>{filtrada.length} de {fc.length} · {pendientes.length} sin facturar</div></div>
      <button onClick={()=>setReclamo('')} style={{padding:'10px 16px', borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13.5, fontWeight:600, cursor:'pointer'}} title="Un solo mail con todas las facturas pendientes de un cliente">✉ Reclamar cuenta</button>
      <button onClick={()=>setNuevaF(true)} style={{padding:'10px 18px', borderRadius:10, border:'none', background:T.brand, color:'#fff', fontSize:13.5, fontWeight:600, cursor:'pointer'}}>+ Nueva factura</button>
    </div>
    <div style={{display:'flex', gap:14, marginBottom:20}}>
      <Hero label="Por cobrar" value={fmt(pcTotal)} accent={T.ink} sub={`${noCobradas.length} facturas · saldo real`}
        desglose={[
          {l:'Vencido', v:fmt(vencidasMonto), c:vencidasMonto>0?T.brand:T.ink3},
          {l:'Vence esta semana', v:fmt(pcPorVencer), c:pcPorVencer>0?T.warn:T.ink3},
          {l:'En plazo', v:fmt(pcEnPlazo), c:T.ink2},
        ]}/>
      <Hero label="Por facturar" value={fmt(porFacturarTotal)} accent={T.warn} sub={`${pendientes.length} trabajos ya hechos sin factura`}
        desglose={montoFuturos>0?[{l:`+ ${pendFuturos.length} trabajos futuros · ver para facturar por adelantado`, v:fmt(montoFuturos), c:T.ink3, onClick:()=>setFilt('futuros')}]:null}/>
    </div>
    <div style={{display:'flex', marginBottom:16, borderBottom:`1px solid ${T.border}`}}>
      {[['agencias','Por agencia','qué debe y qué falta facturarle a cada una'],['lista','Lista','todas las facturas, una por una']].map(([k,l,s])=>
        <button key={k} onClick={()=>setVista(k)} style={{padding:'10px 14px 9px', border:'none', background:'transparent', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:vista===k?700:500, color:vista===k?T.ink:T.ink2, borderBottom:`2px solid ${vista===k?T.brand:'transparent'}`}}>{l}{!cel && <span style={{fontSize:11, fontWeight:400, color:T.ink3, marginLeft:7}}>{s}</span>}</button>)}
    </div>
    {vista==='agencias' && (<>
    <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', marginBottom:14}}>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar agencia, cliente, proyecto, N°…" style={{flex:'1 1 240px', minWidth:190, padding:'9px 13px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13, outline:'none'}}/>
    </div>
    <div style={{display:'flex', gap:7, marginBottom:14, flexWrap:'wrap'}}>
      {AGF.map(([k,l])=><button key={k} onClick={()=>setAgF(k)} style={{padding:'6px 13px', borderRadius:20, fontSize:12, fontWeight:500, cursor:'pointer', border:`1px solid ${agF===k?T.ink:T.border}`, background:agF===k?T.ink:T.surface, color:agF===k?'#fff':T.ink2}}>{l}</button>)}
    </div>
    <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
      {!cel && <div style={{display:'grid', gridTemplateColumns:'minmax(0,1.6fr) 125px 125px 125px 22px', gap:10, padding:'11px 18px', borderBottom:`1px solid ${T.border}`, fontSize:10.5, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3}}>
        <span>Agencia</span><span style={{textAlign:'right'}}>Vencido</span><span style={{textAlign:'right'}}>En plazo</span><span style={{textAlign:'right'}}>Falta facturar</span><span/>
      </div>}
      {agFiltradas.length===0 && <Empty>Ninguna agencia con ese filtro</Empty>}
      {agFiltradas.map((a,i)=>{
        const ab=!!agOpen[a.nombre], paga=comoPaga(a)
        const Num=({l,v,c})=><span style={{textAlign:cel?'left':'right', minWidth:0}}>{cel && <span style={{display:'block', fontSize:9.5, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3}}>{l}</span>}<span style={{fontFamily:MONO, fontSize:13, fontWeight:v>0?600:400, color:v>0?c:T.ink3}}>{v>0?fmt(v):'—'}</span></span>
        // El reclamo sale por razón social: si lo vencido es de varias, un botón por cada una.
        const razonesVenc=[...new Set(a.venc.map(claveAg))].filter(Boolean)
        // La fecha que prometió: verde si todavía no llegó, roja si ya pasó y sigue debiendo.
        const prom=a.promProx, promPaso=!!prom && prom<hoy0
        const promTodas=a.nProm===a.deben.length && new Set(a.deben.map(f=>String(f['Prometió pagar']||'').trim())).size===1
        return <div key={a.nombre} style={{borderTop:i===0?'none':`1px solid ${T.border}`}}>
          <div onClick={()=>setAgOpen(o=>({...o,[a.nombre]:!ab}))} style={{display:'grid', gridTemplateColumns:cel?'repeat(3,minmax(0,1fr))':'minmax(0,1.6fr) 125px 125px 125px 22px', gap:10, padding:'13px 18px', alignItems:'center', cursor:'pointer', background:ab?T.surfaceAlt:'transparent'}}>
            <span style={{minWidth:0, gridColumn:cel?'1 / -1':'auto'}}>
              <span style={{display:'block', fontSize:14, fontWeight:600, color:T.ink}}>{a.nombre}{a.razones.length>1 && <span style={{fontSize:10.5, fontWeight:600, color:T.ink2, background:T.surfaceAlt, border:`1px solid ${T.border}`, padding:'2px 8px', borderRadius:20, marginLeft:8}}>{a.razones.length} razones sociales</span>}</span>
              <span style={{display:'block', fontSize:11.5, color:T.ink3, marginTop:2}}>{[a.deben.length?`${a.deben.length} ${a.deben.length===1?'factura':'facturas'} sin cobrar`:'', a.sinFact.length?`${a.sinFact.length} ${a.sinFact.length===1?'trabajo':'trabajos'} sin facturar`:'', paga].filter(Boolean).join(' · ')}{a.sinEnviar.length>0 && <span style={{color:T.warn, fontWeight:600}}> · {a.sinEnviar.length} sin enviar</span>}{prom && <span style={{color:promPaso?T.brand:T.pos, fontWeight:600}}> · {promTodas?'prometió pagar el':`${a.nProm} de ${a.deben.length} con fecha prometida, la próxima el`} {prom.getDate()}/{prom.getMonth()+1}{promPaso?' y no entró':''}</span>}</span>
            </span>
            <Num l="Vencido" v={a.vencido} c={T.brand}/><Num l="En plazo" v={a.enPlazo} c={T.ink}/><Num l="Falta facturar" v={a.sinFactMonto} c={T.warn}/>
            {!cel && <span style={{fontSize:10, color:T.ink3, textAlign:'right'}}>{ab?'▼':'▶'}</span>}
          </div>
          {ab && <div style={{padding:cel?'4px 14px 14px':'4px 18px 16px', background:T.bg, borderTop:`1px dashed ${T.border}`}}>
            {(razonesVenc.length>0 || a.sinEnviar.length>0) && <div style={{display:'flex', gap:8, flexWrap:'wrap', padding:'12px 0 2px'}}>
              {razonesVenc.map(k=><button key={k} onClick={()=>setReclamo(k)} style={{padding:'8px 14px', borderRadius:9, border:'none', background:T.brand, color:'#fff', fontSize:12.5, fontWeight:700, cursor:'pointer'}} title="Un solo mail con todo lo vencido de esta razón social">✉ Reclamar lo vencido{razonesVenc.length>1?` · ${k.includes(' - (')?k.split(' - (')[1].replace(/\)\s*$/,''):k}`:''}</button>)}
              {/* Facturas que salieron por fuera de la app (mail directo, WhatsApp): se marcan todas juntas en vez de entrar una por una. */}
              {a.sinEnviar.length>0 && <button disabled={!!loteBusy} onClick={async()=>{ const n=a.sinEnviar.length, hoyStr=`${hoy.getDate()}/${hoy.getMonth()+1}/${hoy.getFullYear()}`
                if(!window.confirm(`¿Marcar como ENVIADAS ${n===1?'la factura':`las ${n} facturas`} de ${a.nombre} que ${n===1?'figura':'figuran'} sin enviar?\n\nUsalo solo si ya ${n===1?'salió':'salieron'} por fuera de la app (mail directo, WhatsApp). Como fecha de envío queda la de emisión de cada factura.`)) return
                await lote(a.sinEnviar, {'Fc Enviada':true}, `enviadas ${a.nombre}`, `${a.nombre}: ${n} ${n===1?'factura marcada como enviada':'facturas marcadas como enviadas'} ✓`, f=>({'Fecha enviada':String(f['Fecha emision']||'').trim()||hoyStr})) }}
                style={{padding:'8px 14px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:12.5, fontWeight:600, cursor:loteBusy?'default':'pointer', opacity:loteBusy?0.6:1}} title="Si ya salieron por mail directo o WhatsApp, se marcan todas de una">Ya salieron: marcar {a.sinEnviar.length===1?'1 como enviada':`las ${a.sinEnviar.length} como enviadas`}</button>}
            </div>}
            {/* La misma fecha para varias facturas de una: sirve cuando entra todo junto (Telefe, un trabajo en tres
                facturas). Se aplica a lo vencido de la agencia, o a todo lo que debe si no tiene nada vencido.
                Cuando cada factura tiene su tiempo (Ostara), la fecha se pone en cada fila con "Prometió…". */}
            {hayPromesa && a.deben.length>1 && (()=>{ const dr=promDraft[a.nombre]||{}, fechaV=dr.fecha!==undefined?dr.fecha:aISO(a.promesa), notaV=dr.nota!==undefined?dr.nota:a.notaCob
              const cambio=fechaV!==aISO(a.promesa) || notaV.trim()!==a.notaCob
              const destino=a.venc.length?a.venc:a.deben
              const escribir=v=>setPromDraft(o=>({...o,[a.nombre]:{...(o[a.nombre]||{}), ...v}}))
              const guardar=async()=>{ const ok=await lote(destino, {'Prometió pagar':deISO(fechaV), 'Nota cobranza':notaV.trim()}, `promesa ${a.nombre}`, fechaV?`${a.nombre}: prometió pagar el ${deISO(fechaV)} ✓`:`${a.nombre}: seguimiento guardado ✓`); if(ok) setPromDraft(o=>{ const n={...o}; delete n[a.nombre]; return n }) }
              return <div style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', padding:'12px 0 2px'}}>
                <span style={{fontSize:12, color:T.ink2, fontWeight:600}} title="Pone la misma fecha en varias facturas de una. Para una sola factura, usá «Prometió…» en su fila.">Misma fecha para {a.venc.length===1?'la vencida':a.venc.length?`las ${a.venc.length} vencidas`:`las ${a.deben.length} facturas`}</span>
                <input type="date" value={fechaV} onChange={e=>escribir({fecha:e.target.value})} style={{padding:'6px 9px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:12.5, fontFamily:'inherit', outline:'none'}}/>
                <input value={notaV} onChange={e=>escribir({nota:e.target.value})} onKeyDown={e=>{ if(e.key==='Enter'&&cambio) guardar() }} placeholder="Con quién hablaste y qué dijo" style={{flex:'1 1 220px', minWidth:160, padding:'6px 10px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:12.5, fontFamily:'inherit', outline:'none'}}/>
                {cambio && <button disabled={!!loteBusy} onClick={guardar} style={{padding:'7px 14px', borderRadius:8, border:'none', background:T.ink, color:'#fff', fontSize:12.5, fontWeight:700, cursor:loteBusy?'default':'pointer', opacity:loteBusy?0.6:1}}>{loteBusy?'Guardando…':'Guardar'}</button>}
              </div> })()}
            {a.deben.length>0 && <div style={{fontSize:10.5, fontWeight:700, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3, margin:'14px 0 2px'}}>Te debe · {fmt(a.vencido+a.enPlazo)}</div>}
            {[...a.deben].sort((x,y)=>(diffVenc(x)??99)-(diffVenc(y)??99)).map((f,j)=>{ const d=diffVenc(f), r=fechaRef(f), dd=r?`${r.d.getDate()}/${r.d.getMonth()+1}`:'', lbl=!r?'sin fecha':r.src==='vence'?'vence':r.src==='evento'?'evento':'emitida', tot=parseMonto(f['Precio FINAL']), k=claveAg(f)
              // La fecha que prometió para ESTA factura (cada una tiene la suya) y el editor que se abre en la fila.
              const pf=parseD(f['Prometió pagar']), pfPaso=!!pf && pf<hoy0, notaF=String(f['Nota cobranza']||'').trim(), keyP='f'+f.__row, drP=promDraft[keyP]
              const cerrarP=()=>setPromDraft(o=>{ const n={...o}; delete n[keyP]; return n })
              const guardarP=async fecha=>{ const ok=await lote([f], {'Prometió pagar':deISO(fecha), 'Nota cobranza':String(drP?.nota||'').trim()}, `promesa #${f['N° Presupuesto']}`, fecha?`#${f['N° Presupuesto']}: prometió pagar el ${deISO(fecha)} ✓`:`#${f['N° Presupuesto']}: fecha prometida borrada ✓`); if(ok) cerrarP() }
              return <div key={'d'+j} style={{display:'grid', gridTemplateColumns:cel?'minmax(0,1fr) auto':'118px minmax(0,1fr) 112px auto', gap:10, padding:'9px 0', borderTop:`1px solid ${T.border}`, alignItems:'center', fontSize:12.5}}>
                <span style={{fontSize:11.5, fontWeight:d!=null&&d<0?700:500, color:d!=null&&d<0?T.brand:d!=null&&d<7?T.warn:T.ink2, gridColumn:cel?'1 / -1':'auto'}}>{d!=null&&d<0?`${-d}d atrasada`:d===0?'vence hoy':`${lbl} ${dd}`}</span>
                <span style={{minWidth:0}}>
                  <span style={{display:'block', color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{f['Proyecto']||f['Cliente']||'—'}</span>
                  <span style={{display:'block', fontSize:11, color:T.ink3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>#{f['N° Presupuesto']}{f['Cliente']?` · ${f['Cliente']}`:''}{f['Nro de Factura']?` · ${f['Nro de Factura']}`:''}{a.razones.length>1&&k.includes(' - (')?` · ${k.split(' - (')[1].replace(/\)\s*$/,'')}`:''}{!enviadaF(f) && <span style={{color:T.warn, fontWeight:700}}> · SIN ENVIAR</span>}</span>
                </span>
                <span style={{textAlign:'right', fontFamily:MONO, fontSize:12.5, color:T.ink, fontWeight:600}}>{fmt(saldoF(f))}{saldoF(f)<tot && <span style={{display:'block', fontSize:10, color:T.ink3, fontWeight:400}}>de {fmt(tot)}</span>}</span>
                <span style={{display:'flex', gap:5, justifyContent:'flex-end', gridColumn:cel?'1 / -1':'auto'}}>
                  <button onClick={()=>setCobrando(f)} style={{...miniBtn, background:T.pos, color:'#fff', border:'none', padding:'6px 9px'}}>Cobrar</button>
                  <button onClick={()=>setReclamo({agencia:k, fila:f.__row, nro:String(f['N° Presupuesto']||'').trim()})} style={{...miniBtn, padding:'6px 9px', ...(d!=null&&d<0?{color:T.brand, borderColor:`${T.brand}66`, fontWeight:600}:{})}} title="Reclamar esta factura por mail (junto con lo demás que deba)">Reclamar</button>
                  {hayPromesa && <button onClick={()=>drP?cerrarP():setPromDraft(o=>({...o,[keyP]:{fecha:aISO(f['Prometió pagar']), nota:notaF}}))} style={{...miniBtn, padding:'6px 9px', ...(pf?{color:pfPaso?T.brand:T.pos, borderColor:`${pfPaso?T.brand:T.pos}66`, fontWeight:600}:{})}} title={pf?`Prometió pagar esta factura el ${f['Prometió pagar']}${notaF?` · ${notaF}`:''}. Tocá para cambiarlo.`:'Anotar la fecha que prometió para ESTA factura'}>{pf?`Prometió ${pf.getDate()}/${pf.getMonth()+1}`:'Prometió…'}</button>}
                  <button onClick={()=>setMailFactura(f)} style={{...miniBtn, padding:'6px 8px'}} title="Mandar la factura por mail (desde la app)">✉</button>
                  {f['Factura'] && <a href={f['Factura']} target="_blank" rel="noreferrer" style={{...miniBtn, padding:'6px 8px'}} title="Ver PDF de la factura">📎</a>}
                </span>
                {drP && <div style={{gridColumn:'1 / -1', display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', padding:'9px 11px', borderRadius:9, background:T.surfaceAlt}}>
                  <span style={{fontSize:12, color:T.ink2, fontWeight:600}}>Esta factura: prometió pagar el</span>
                  <input type="date" value={drP.fecha} onChange={e=>setPromDraft(o=>({...o,[keyP]:{...o[keyP], fecha:e.target.value}}))} style={{padding:'6px 9px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:12.5, fontFamily:'inherit', outline:'none'}}/>
                  <input value={drP.nota} onChange={e=>setPromDraft(o=>({...o,[keyP]:{...o[keyP], nota:e.target.value}}))} onKeyDown={e=>{ if(e.key==='Enter') guardarP(drP.fecha) }} placeholder="Con quién hablaste y qué dijo" style={{flex:'1 1 200px', minWidth:150, padding:'6px 10px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:12.5, fontFamily:'inherit', outline:'none'}}/>
                  <button disabled={!!loteBusy} onClick={()=>guardarP(drP.fecha)} style={{padding:'7px 14px', borderRadius:8, border:'none', background:T.ink, color:'#fff', fontSize:12.5, fontWeight:700, cursor:loteBusy?'default':'pointer', opacity:loteBusy?0.6:1}}>{loteBusy?'Guardando…':'Guardar'}</button>
                  {pf && <button disabled={!!loteBusy} onClick={()=>guardarP('')} style={{...miniBtn, padding:'6px 10px'}}>Quitar la fecha</button>}
                  <button onClick={cerrarP} style={{...miniBtn, padding:'6px 10px'}}>Cancelar</button>
                </div>}
              </div> })}
            {a.sinFact.length>0 && <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', margin:'16px 0 4px'}}>
              <span style={{fontSize:10.5, fontWeight:700, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3}}>Falta facturar · {fmt(a.sinFactMonto)} sin IVA</span>
              {/* Una factura para varios trabajos (caso Austral: una orden de compra, una factura). Los de
                  Comunicación van en otra orden de compra, así que se ofrecen aparte. Se juntan por razón social. */}
              {(()=>{ const esCom=x=>/comunicaci/i.test(String(x.p['Cliente']||'')), orden=[...a.sinFact].sort((x,y)=>semEvento(y.p['Fecha Evento']).dias-semEvento(x.p['Fecha Evento']).dias)
                const tandas={}; orden.forEach(x=>{ const k=claveAg(x.p)+(esCom(x)?'|com':''); (tandas[k]=tandas[k]||[]).push(x) })
                return Object.values(tandas).filter(g=>g.length>1).map((g,k)=><button key={k} onClick={()=>{ setNuevaFsel(g[0]); setNuevaFextras(g.slice(1).map(x=>String(x.p['Columna 1']||'').trim())); setNuevaF(true) }} style={{...miniBtn, background:T.ink, color:'#fff', border:'none', padding:'6px 12px', fontWeight:600}} title="Una sola factura que cubre todos estos trabajos. En el formulario podés destildar los que no van.">Facturar juntos {esCom(g[0])?'los de Comunicación':''} · {g.length} trabajos · {fmt(g.reduce((t,x)=>t+x.pendiente,0))}</button>) })()}
              {/* Clientes que no reciben la factura por mail (Austral): primero se les pide que carguen los trabajos en su sistema. */}
              <button onClick={()=>setPedirOC(a)} style={{...miniBtn, padding:'6px 12px', fontWeight:600}} title="Mail con la lista de trabajos hechos para que el cliente los cargue en su sistema de cobro. Queda anotado qué se pidió y cuándo.">✉ Pedir orden de compra{(()=>{ const n=a.sinFact.filter(x=>ocDe[String(x.p['Columna 1']||'').trim()]).length; return n?` · ${n} ya ${n===1?'pedida':'pedidas'}`:'' })()}</button>
            </div>}
            {[...a.sinFact].sort((x,y)=>semEvento(y.p['Fecha Evento']).dias-semEvento(x.p['Fecha Evento']).dias).map((x,j)=>{ const fi=semEvento(x.p['Fecha Evento'])
              return <div key={'s'+j} style={{display:'grid', gridTemplateColumns:cel?'minmax(0,1fr) auto':'118px minmax(0,1fr) 112px auto', gap:10, padding:'9px 0', borderTop:`1px solid ${T.border}`, alignItems:'center', fontSize:12.5}}>
                <span style={{fontSize:11.5, fontWeight:fi.dias>30?700:500, color:fi.c, gridColumn:cel?'1 / -1':'auto'}}>{fi.fecha==='s/f'?'sin fecha':`evento ${fi.fecha}`}{fi.dias>0?` · hace ${fi.dias}d`:''}</span>
                <span style={{minWidth:0}}>
                  <span style={{display:'block', color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{x.p['Proyecto']||x.p['Cliente']||'—'}</span>
                  <span style={{display:'block', fontSize:11, color:T.ink3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>#{x.p['Columna 1']}{x.p['Cliente']?` · ${x.p['Cliente']}`:''}{x.facturado>0?` · ya facturado ${fmt(x.facturado)} (${Math.round(x.facturado/x.neto*100)}%)`:''}{(()=>{ const oc=ocDe[String(x.p['Columna 1']||'').trim()]; if(!oc) return null; const dd=Math.round((hoy0-oc.d)/864e5); return <span style={{color:dd>7?T.warn:T.ink2, fontWeight:600}}> · orden de compra pedida el {oc.fecha}{dd>0?` (hace ${dd}d)`:''}</span> })()}</span>
                </span>
                <span style={{textAlign:'right', fontFamily:MONO, fontSize:12.5, color:T.warn, fontWeight:600}}>{fmt(x.pendiente)}</span>
                <span style={{display:'flex', gap:5, justifyContent:'flex-end', gridColumn:cel?'1 / -1':'auto'}}>
                  <button onClick={()=>{setNuevaFsel(x); setNuevaF(true)}} style={{...miniBtn, background:T.brand, color:'#fff', border:'none', padding:'6px 10px'}} title={x.facturado>0?'Cargar la factura del saldo: viene con el monto que falta ya puesto':'Crear factura real (con número y mail)'}>{x.facturado>0?'Facturar saldo':'Facturar'}</button>
                  <button onClick={()=>setYaModal(x)} style={{...miniBtn, padding:'6px 10px'}} title="Ya la facturaste por fuera de la app. La registra sin tocar saldos (adentro tildás si también la cobraste)">Ya está ✓</button>
                </span>
              </div> })}
          </div>}
        </div>
      })}
    </div>
    </>)}
    {vista==='lista' && (<>
    <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', marginBottom:14}}>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar factura, presu, cliente, proyecto…" style={{flex:'1 1 240px', minWidth:190, padding:'9px 13px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13, outline:'none'}}/>
      <select value={mesF} onChange={e=>setMesF(e.target.value)} title="Filtrar por mes del evento" style={{...selectStyle, minWidth:160}}><option value="todos">Todos los meses</option>{monthOpts.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select>
    </div>
    <div style={{display:'flex', gap:7, marginBottom:14}}>
      {FILTROS.map(([k,l])=><button key={k} onClick={()=>setFilt(k)} style={{padding:'6px 13px', borderRadius:20, fontSize:12, fontWeight:500, cursor:'pointer', border:`1px solid ${filt===k?T.ink:T.border}`, background:filt===k?T.ink:T.surface, color:filt===k?'#fff':T.ink2}}>{l}</button>)}
    </div>
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10, padding:'9px 15px', background:T.surfaceAlt, borderRadius:9}}>
      <span style={{fontSize:13.5, color:T.ink, fontWeight:600}}>{filt==='sinfacturar' ? `${pendOrdenados.length} ${pendOrdenados.length===1?'proyecto':'proyectos'} sin facturar` : filt==='futuros' ? `${futOrdenados.length} ${futOrdenados.length===1?'trabajo futuro':'trabajos futuros'}` : `${filtrada.length} ${filtrada.length===1?'factura':'facturas'}`}{/* buscando: aclarar que abajo también hay sin facturar y futuros */}{filt==='todas'&&q.trim() ? ` · ${pendOrdenados.length} sin facturar · ${futOrdenados.length} ${futOrdenados.length===1?'futuro':'futuros'}` : ''}{mesF!=='todos' ? ` · ${mesesSet[mesF]}` : ''}</span>
      <span style={{fontSize:13.5, fontFamily:MONO, color:T.ink2, fontWeight:600}}>{fmt(filt==='sinfacturar'?sumPend:filt==='futuros'?sumFut:sumFiltrada)}</span>
    </div>
    {(filt==='sinfacturar'||filt==='todas') && (<>
    {filt==='todas' && <div style={{margin:'4px 0 10px', fontSize:11.5, fontWeight:700, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3}}>Sin facturar · {pendOrdenados.length} · {fmt(sumPend)}</div>}
    <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
      {sinFactAtrasados>0 && <div style={{background:T.brandSoft, color:T.brand, padding:'9px 18px', fontSize:12, fontWeight:600, borderBottom:`1px solid ${T.border}`}}>⚠ {sinFactAtrasados} {sinFactAtrasados===1?'proyecto con evento pasado hace +30 días sin facturar':'proyectos con evento pasado hace +30 días sin facturar'}</div>}
      <div style={{display:'grid', gridTemplateColumns:'110px 1.5fr 110px 200px', padding:'11px 18px', borderBottom:`1px solid ${T.border}`, fontSize:10.5, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3}}>
        <span>Evento</span><span>Proyecto</span><span style={{textAlign:'right'}}>Pendiente</span><span style={{textAlign:'right'}}>Acción</span>
      </div>
      {pendOrdenados.length===0 && <Empty>Nada sin facturar 🎉</Empty>}
      {pendOrdenados.slice(0,200).map((x,i)=>{ const fi=semEvento(x.p['Fecha Evento']); return (
        <div key={i} style={{display:'grid', gridTemplateColumns:'110px 1.5fr 110px 200px', padding:'12px 18px', borderTop:i===0?'none':`1px solid ${T.border}`, alignItems:'center', fontSize:13}}>
          <span style={{display:'flex', flexDirection:'column', gap:1, minWidth:0}}>
            <span style={{display:'flex', alignItems:'center', gap:5}}><span style={{width:7,height:7,borderRadius:7,background:fi.c, flexShrink:0}}/><span style={{fontSize:12.5, fontFamily:MONO, color:T.ink, fontWeight:fi.dias>30?700:500}}>{fi.fecha}</span></span>
            <span style={{fontSize:9.5, color:fi.c, fontWeight:fi.dias>30?700:500}}>{fi.l}</span>
          </span>
          <span style={{minWidth:0, paddingRight:10}}>
            <span style={{display:'block', color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{x.p['Proyecto']||x.p['Cliente']||'—'}</span>
            <span style={{display:'block', fontSize:11, color:T.ink3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>#{x.p['Columna 1']} · {[x.p['Cliente'],x.p['Agencia']].filter(Boolean).join(' · ')}</span>
            {x.facturado>0 && <span style={{display:'flex', alignItems:'center', gap:7, marginTop:4, fontSize:11, color:T.warn, fontWeight:600}}><BarraFacturado pct={x.facturado/x.neto*100}/>ya facturado {fmt(x.facturado)} · {Math.round(x.facturado/x.neto*100)}% del trabajo</span>}
          </span>
          <span style={{textAlign:'right', fontFamily:MONO, fontSize:12.5, color:T.brand, fontWeight:600}}>{fmt(x.pendiente)}</span>
          <span style={{display:'flex', justifyContent:'flex-end', gap:5}}>
            <button onClick={()=>{setNuevaFsel(x); setNuevaF(true)}} style={{...miniBtn, background:T.brand, color:'#fff', border:'none', padding:'6px 10px'}} title={x.facturado>0?'Cargar la factura del saldo: viene con el monto que falta ya puesto':'Crear factura real (con número y mail)'}>{x.facturado>0?'Facturar saldo':'Facturar'}</button>
            <button onClick={()=>setYaModal(x)} style={{...miniBtn, padding:'6px 10px'}} title="Ya la facturaste por fuera de la app. La registra sin tocar saldos (adentro tildás si también la cobraste)">Ya está ✓</button>
          </span>
        </div>
      )})}
    </div>
    </>)}
    {/* Los trabajos con evento futuro viven en su propio filtro, pero cuando BUSCÁS algo
        tienen que aparecer igual: si no, buscás "casamiento" y parece que no existe. */}
    {(filt==='futuros' || (filt==='todas' && q.trim() && futOrdenados.length>0)) && (<>
    {filt==='todas' && <div style={{margin:'20px 0 10px', fontSize:11.5, fontWeight:700, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3}}>Trabajos futuros · {futOrdenados.length} · {fmt(sumFut)}</div>}
    <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
      <div style={{background:T.surfaceAlt, color:T.ink2, padding:'9px 18px', fontSize:12, borderBottom:`1px solid ${T.border}`}}>Trabajos aprobados cuyo evento todavía no pasó. Facturalos solo si el cliente te lo pide por adelantado.</div>
      <div style={{display:'grid', gridTemplateColumns:'110px 1.5fr 110px 200px', padding:'11px 18px', borderBottom:`1px solid ${T.border}`, fontSize:10.5, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3}}>
        <span>Evento</span><span>Proyecto</span><span style={{textAlign:'right'}}>Pendiente</span><span style={{textAlign:'right'}}>Acción</span>
      </div>
      {futOrdenados.length===0 && <Empty>No hay trabajos futuros pendientes de facturar</Empty>}
      {futOrdenados.slice(0,200).map((x,i)=>{ const fi=semEvento(x.p['Fecha Evento']); return (
        <div key={i} style={{display:'grid', gridTemplateColumns:'110px 1.5fr 110px 200px', padding:'12px 18px', borderTop:i===0?'none':`1px solid ${T.border}`, alignItems:'center', fontSize:13}}>
          <span style={{display:'flex', flexDirection:'column', gap:1, minWidth:0}}>
            <span style={{display:'flex', alignItems:'center', gap:5}}><span style={{width:7,height:7,borderRadius:7,background:T.ink3, flexShrink:0}}/><span style={{fontSize:12.5, fontFamily:MONO, color:T.ink, fontWeight:500}}>{fi.fecha}</span></span>
            <span style={{fontSize:9.5, color:T.ink3}}>en {-fi.dias}d</span>
          </span>
          <span style={{minWidth:0, paddingRight:10}}>
            <span style={{display:'block', color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{x.p['Proyecto']||x.p['Cliente']||'—'}</span>
            <span style={{display:'block', fontSize:11, color:T.ink3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>#{x.p['Columna 1']} · {[x.p['Cliente'],x.p['Agencia']].filter(Boolean).join(' · ')}</span>
            {x.facturado>0 && <span style={{display:'flex', alignItems:'center', gap:7, marginTop:4, fontSize:11, color:T.warn, fontWeight:600}}><BarraFacturado pct={x.facturado/x.neto*100}/>ya facturado {fmt(x.facturado)} · {Math.round(x.facturado/x.neto*100)}% del trabajo</span>}
          </span>
          <span style={{textAlign:'right', fontFamily:MONO, fontSize:12.5, color:T.ink2, fontWeight:600}}>{fmt(x.pendiente)}</span>
          <span style={{display:'flex', justifyContent:'flex-end', gap:5}}>
            <button onClick={()=>{setNuevaFsel(x); setNuevaF(true)}} style={{...miniBtn, background:T.brand, color:'#fff', border:'none', padding:'6px 10px'}} title={x.facturado>0?'Cargar la factura del saldo: viene con el monto que falta ya puesto':'Facturar por adelantado (el evento todavía no pasó)'}>{x.facturado>0?'Facturar saldo':'Facturar'}</button>
            <button onClick={()=>setYaModal(x)} style={{...miniBtn, padding:'6px 10px'}} title="Ya la facturaste por fuera de la app. La registra sin tocar saldos (adentro tildás si también la cobraste)">Ya está ✓</button>
          </span>
        </div>
      )})}
    </div>
    </>)}
    {filt!=='sinfacturar' && filt!=='futuros' && (<>
    {filt==='todas' && <div style={{margin:'20px 0 10px', fontSize:11.5, fontWeight:700, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3}}>Facturas · {filtrada.length} · {fmt(sumFiltrada)}</div>}
    <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
      <div style={{display:'grid', gridTemplateColumns:'90px minmax(0,1.2fr) 105px 150px 390px', padding:'11px 18px', borderBottom:`1px solid ${T.border}`, fontSize:10.5, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3}}>
        <span>Evento</span><span>Proyecto</span><span style={{textAlign:'right'}}>Total</span><span style={{textAlign:'right'}}>Estado</span><span style={{textAlign:'right'}}>Acción</span>
      </div>
      {filtrada.length===0&&<Empty>Sin resultados</Empty>}
      {filtrada.slice(0,200).map((f,i)=>{
        const e=estF(f), info=ESTF[e], num=f['N° Presupuesto'], d=diffVenc(f)
        return <div key={i} style={{display:'grid', gridTemplateColumns:'90px minmax(0,1.2fr) 105px 150px 390px', padding:'12px 18px', borderTop:i===0?'none':`1px solid ${T.border}`, alignItems:'center', fontSize:13}}>
          <span style={{display:'flex', flexDirection:'column', gap:1, minWidth:0}}>
            <span style={{display:'flex', alignItems:'center', gap:5}}><span style={{width:7,height:7,borderRadius:7,background:info.c, flexShrink:0}}/><span style={{fontSize:12, fontFamily:MONO, color:T.ink, fontWeight:d!=null&&d<0?700:500}}>{(()=>{const ev=parseD(evDe(f)); return ev?`${ev.getDate()}/${ev.getMonth()+1}`:'—'})()}</span></span>
            <span style={{fontSize:9.5, color:info.c, fontWeight:d!=null&&d<0?700:500}}>{info.l}</span>
          </span>
          <span style={{minWidth:0, paddingRight:10}}>
            <span style={{display:'block', color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{f['Proyecto']||f['Cliente']||'—'}</span>
            <span style={{display:'block', fontSize:11, color:T.ink3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{[f['Cliente'],f['Agencia']].filter(Boolean).join(' · ')}{f['Nro de Factura']?` · ${f['Nro de Factura']}`:''}</span>
          </span>
          {/* Total CON IVA en grande: es el número que Flor cruza contra lo que entra al banco.
              El neto va chico abajo, solo si la factura lleva IVA. Antes la columna mostraba el
              neto y no coincidía con ninguna transferencia. */}
          {(()=>{ const tot=parseMonto(f['Precio FINAL']), net=parseMonto(f['Precio SIN IVA']), ivaF=parseMonto(f['IVA']), cob=parseMonto(f['Monto cobrado'])
            return <span style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:1, minWidth:0}}>
              <span style={{fontFamily:MONO, fontSize:12.5, color:T.ink, fontWeight:600}} title={ivaF>0?'Total con IVA':'Total (sin IVA)'}>{fmt(tot||net)}</span>
              {ivaF>0 && tot>0 && <span style={{fontSize:10, color:T.ink3, fontFamily:MONO}}>neto {fmt(net)}</span>}
              {cob>0 && !isCobrada(f) && <span style={{fontSize:10, color:T.warn, fontFamily:MONO, fontWeight:600}}>falta {fmt(saldoF(f))}</span>}
            </span> })()}
          <span style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2}}>
            <span style={{display:'flex', alignItems:'center', gap:6}}><span style={{width:7,height:7,borderRadius:7,background:info.c}}/><span style={{fontSize:12, color:T.ink2}}>{info.l}</span></span>
            {!isCobrada(f) && (()=>{ const r=fechaRef(f); if(!r) return null; const dd=`${r.d.getDate()}/${r.d.getMonth()+1}`; const lbl=r.src==='vence'?'vence':r.src==='evento'?'evento':'emitida'; const dtxt=d!=null?(d<0?`${Math.abs(d)}d atrasada`:d===0?'hoy':`en ${d}d`):''; return <span style={{fontSize:11, color:info.c, fontWeight:d!=null&&d<0?700:500}}>{lbl} {dd}{dtxt?` · ${dtxt}`:''}</span> })()}
            {/* ¿Salió para el cliente? Cargar el PDF no es enviarlo. */}
            {enviadaF(f)
              ? <span style={{fontSize:10.5, color:T.ink3}} title="La factura ya salió para el cliente">✉ enviada{f['Fecha enviada']?` ${f['Fecha enviada']}`:''}</span>
              : !isCobrada(f) && <span style={{fontSize:10.5, color:T.warn, fontWeight:700}} title={f['Factura']?'La factura está cargada pero todavía no se mandó al cliente':'Todavía no se mandó al cliente'}>{f['Factura']?'📎 cargada · SIN ENVIAR':'✉ SIN ENVIAR'}</span>}
          </span>
          {/* 8 botones en una factura sin cobrar y con PDF: en 340px no entraban y "Cobrar" tapaba el estado */}
          <span style={{display:'flex', gap:5, justifyContent:'flex-end', flexWrap:'wrap'}}>
            {!isCobrada(f) && <button onClick={()=>setCobrando(f)} style={{...miniBtn, background:T.pos, color:'#fff', border:'none', padding:'6px 9px'}}>Cobrar</button>}
            {/* Reclamar desde la fila: abre el reclamo de cuenta de ese cliente con ESTA factura ya tildada
                (más lo vencido que tenga). Antes había que ir al botón de arriba y buscar el cliente. */}
            {!isCobrada(f) && <button onClick={()=>setReclamo({agencia:String(f['Agencia']||f['Cliente']||'').trim(), fila:f.__row, nro:String(num||'').trim()})} style={{...miniBtn, padding:'6px 9px', ...(['vencida','reclamar'].includes(e)?{color:T.brand, borderColor:`${T.brand}66`, fontWeight:600}:{})}} title="Reclamar esta factura por mail (junto con lo demás que deba este cliente)">Reclamar</button>}
            <button onClick={()=>setMailFactura(f)} style={{...miniBtn, padding:'6px 8px'}} title="Mandar factura por mail (desde la app)">✉</button>
            <button onClick={()=>setEditarFechas(f)} style={{...miniBtn, padding:'6px 8px'}} title="Editar a mano fecha de envío y de cobro (notas de crédito, facturas consolidadas)">📅</button>
            {/* Si ya hay PDF se puede VER y también REEMPLAZAR: antes, con un PDF mal subido
                no había forma de cambiarlo desde la app (el botón de subir desaparecía). */}
            {f['Factura'] && <a href={f['Factura']} target="_blank" rel="noreferrer" style={{...miniBtn, padding:'6px 8px'}} title="Ver PDF de la factura">📎</a>}
            <button onClick={()=>subirPDF(f)} style={{...miniBtn, padding:'6px 8px'}} title={f['Factura']?'Reemplazar el PDF de la factura':'Subir PDF de la factura'}>{f['Factura']?'↻':'⬆'}</button>
            <button onClick={()=>goTo&&goTo('proyectos',{q:String(num)})} style={{...miniBtn, padding:'6px 9px'}} title="Abrir el proyecto">Proyecto</button>
            <button onClick={()=>borrarFactura(f)} style={{...miniBtn, padding:'6px 9px', color:T.brand, borderColor:`${T.brand}55`}} title="Anular/borrar esta factura (error, nota de crédito, duplicado)">✕</button>
          </span>
          {/* Trabajo facturado en parte: franja debajo de la fila con cuánto va, cuánto falta y el
              botón para cargar la otra factura con el saldo ya puesto. Va acá porque es donde mira
              quien carga: la fila de la factura que ya hizo. Franja y no chip: adentro de la
              columna Proyecto no entraba y se pisaba con el total. */}
          {(()=>{ const x=enPartes[String(num||'').trim()]; if(!x) return null; const pct=Math.round(x.facturado/x.neto*100)
            return <div style={{gridColumn:'2 / -1', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginTop:10, padding:'7px 8px 7px 12px', borderRadius:9, background:T.warnSoft, border:`1px solid ${T.warn}44`}}>
              <BarraFacturado pct={pct} ancho={70}/>
              <span style={{fontSize:12, color:T.warn, fontWeight:600}}>Trabajo facturado en parte · va el {pct}% · falta facturar {fmt(x.pendiente)}</span>
              <button onClick={()=>{setNuevaFsel(x); setNuevaF(true)}} title="Cargar la factura del saldo: viene con el monto que falta ya puesto" style={{...miniBtn, marginLeft:'auto', background:T.ink, color:'#fff', border:'none', padding:'6px 12px', fontWeight:600}}>+ Facturar saldo</button>
            </div> })()}
        </div>
      })}
    </div>
    </>)}
    </>)}
    {pedirOC && <PedirOCModal agencia={pedirOC.nombre} trabajos={pedirOC.sinFact} ocDe={ocDe} agencias={data.agencias||[]} contactos={data.contactos||[]} onClose={()=>setPedirOC(null)} onSent={()=>{ if(onRefresh) onRefresh() }} showToast={showToast}/>}
    {cobrando && <CobroModal f={cobrando} hermanas={hermanasDe(cobrando)} cuentas={cuentas} onClose={()=>setCobrando(null)} onRefresh={onRefresh} showToast={showToast}/>}
    {yaModal && <YaCobradaModal x={yaModal} onClose={()=>setYaModal(null)} onConfirm={confirmarYaCobrada}/>}
    {mailFactura && <MailFacturaModal f={mailFactura} onClose={()=>setMailFactura(null)} onSent={()=>{ if(onRefresh) onRefresh() }} showToast={showToast}/>}
    {editarFechas && <EditarFechasModal f={editarFechas} onClose={()=>setEditarFechas(null)} onRefresh={onRefresh} showToast={showToast}/>}
    {nuevaF && <NuevaFactura pendientes={pendTodos} agencias={data.agencias||[]} contactos={data.contactos||[]} initialSel={nuevaFsel} initialExtras={nuevaFextras} onClose={()=>{setNuevaF(false); setNuevaFsel(null); setNuevaFextras([])}} onCreada={fMail=>{ setNuevaF(false); setNuevaFsel(null); setNuevaFextras([]); if(fMail) setMailFactura(fMail); if(onRefresh) onRefresh() }} showToast={showToast}/>}
    {reclamo!==null && <ReclamoModal agenciasPendientes={agenciasPendientes} inicial={reclamo} onClose={()=>setReclamo(null)} onSent={()=>{ if(onRefresh) onRefresh() }} showToast={showToast}/>}
  </>
}

// Pedir la orden de compra: el mail con la lista de trabajos hechos para que el cliente los cargue
// en SU sistema de cobro (Universidad Austral). No lleva la factura: la factura se sube después a
// ese sistema, cuando lo habilitan. Lo puede mandar cualquiera del equipo; sale desde administración
// con copia a quien lo manda, y cada trabajo queda anotado en la solapa OC_PEDIDOS.
function PedirOCModal({agencia, trabajos, ocDe, agencias=[], contactos=[], onClose, onSent, showToast}){
  const { data: session } = useSession()
  const firma=String(session?.user?.name||'').trim().split(' ')[0]
  const nroDe=x=>String(x.p['Columna 1']||'').trim()
  // Los de Comunicación van en una orden de compra aparte: en el mail salen en su propia lista.
  const esCom=x=>/comunicaci/i.test(String(x.p['Cliente']||''))
  const orden=[...trabajos].sort((a,b)=>semEvento(b.p['Fecha Evento']).dias-semEvento(a.p['Fecha Evento']).dias)
  const sinPedir=orden.filter(x=>!ocDe[nroDe(x)])
  // Por defecto van los que todavía no se pidieron. Si ya se pidieron todos, es un recordatorio y van todos.
  const [sel,setSel]=useState(()=>(sinPedir.length?sinPedir:orden).map(nroDe))
  const elegidos=orden.filter(x=>sel.includes(nroDe(x)))
  const esRecordatorio=elegidos.length>0 && elegidos.every(x=>ocDe[nroDe(x)])
  const agRow=agencias.find(a=>normTxt(a['Nombre'])===normTxt(agencia))
  const mailAg=String(agRow?.['Mail facturacion']||'').trim()
  const [dests,setDests]=useState(()=>{ const d=[]; const push=x=>{ if(x.mail && !d.find(y=>y.mail.toLowerCase()===x.mail.toLowerCase())) d.push(x) }
    if(mailAg) push({mail:mailAg, nombre:`Administración de ${agencia}`, sel:true})
    contactos.filter(c=>normTxt(c['Agencia'])===normTxt(agencia) && String(c['Mail']||'').trim()).forEach(c=>push({mail:String(c['Mail']).trim(), nombre:[c['Nombre'],c['Cargo']].filter(Boolean).join(' · '), sel:false}))
    return d })
  const [nuevo,setNuevo]=useState(''), [recordar,setRecordar]=useState(true), [copia,setCopia]=useState(true), [saving,setSaving]=useState(false)
  // null = el texto que arma la app (sigue a los trabajos tildados); con valor = lo editó quien lo manda y no se pisa
  const [asuntoM,setAsuntoM]=useState(null), [cuerpoM,setCuerpoM]=useState(null)
  const linea=(x,i)=>`${i+1}. ${semEvento(x.p['Fecha Evento']).fecha} · ${String(x.p['Proyecto']||'Trabajo').trim()}${x.p['Cliente']?` (${x.p['Cliente']})`:''} · ${fmt(x.pendiente)} + IVA`
  const gen=elegidos.filter(x=>!esCom(x)), com=elegidos.filter(esCom), suma=a=>a.reduce((s,x)=>s+x.pendiente,0)
  const totalDe=a=>`Total: ${a.length} ${a.length===1?'trabajo':'trabajos'} · ${fmt(suma(a))} + IVA`
  const asuntoAuto=`${esRecordatorio?'Recordatorio: ':''}Somos Magma · ${elegidos.length} ${elegidos.length===1?'trabajo':'trabajos'} para cargar en el sistema`
  const cuerpoAuto=[
    'Hola,', '',
    esRecordatorio
      ? 'Te vuelvo a pasar estos trabajos que ya realizamos y todavía no pudimos facturar. ¿Los podrás cargar en el sistema, así subimos la factura?'
      : 'Te paso los trabajos que ya realizamos, para que los puedas cargar en el sistema y así subimos la factura.',
    '',
    ...(gen.length&&com.length ? ['Para la orden de compra general:'] : []),
    ...gen.map(linea), ...(gen.length?[totalDe(gen), '']:[]),
    ...(com.length ? [gen.length?'Estos son de Comunicación y van en una orden de compra aparte:':'Son de Comunicación:', ...com.map(linea), totalDe(com), ''] : []),
    'Cuando estén cargados avisanos y subimos la factura.', '',
    'Muchas gracias,', ...(firma?[firma]:[]), 'Somos Magma',
  ].join('\n')
  const asunto=asuntoM??asuntoAuto, cuerpo=cuerpoM??cuerpoAuto
  const elegidosDest=dests.filter(d=>d.sel).map(d=>d.mail)
  // Si la agencia no tiene cargado a quién se le pide, se ofrece guardar el mail que se use ahora.
  const candidato=!mailAg && agRow ? (elegidosDest[0]||'') : ''
  const agregar=()=>{ const m=nuevo.trim(); if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)){ showToast('Mail inválido','err'); return } if(dests.find(d=>d.mail.toLowerCase()===m.toLowerCase())){ setNuevo(''); return } setDests(d=>[...d,{mail:m, nombre:'agregado a mano', sel:true}]); setNuevo('') }
  async function enviar(){
    if(!elegidos.length){ showToast('Tildá al menos un trabajo','err'); return }
    if(!elegidosDest.length){ showToast('Elegí a quién se lo mandás','err'); return }
    setSaving(true)
    try{ const r=await fetch('/api/oc-pedir',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agencia, to:elegidosDest, asunto, cuerpo, copiaAMi:copia,
        trabajos:elegidos.map(x=>({presupuestoNum:nroDe(x), proyecto:x.p['Proyecto']||'', cliente:x.p['Cliente']||'', fechaEvento:x.p['Fecha Evento']||'', monto:Math.round(x.pendiente), aparte:esCom(x)}))})})
      const j=await r.json(); if(!j.ok){ showToast(j.error||'No se pudo enviar','err'); setSaving(false); return }
      if(recordar && candidato){ try{ await fetch('/api/agencia-upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:agRow['Nombre'], mailFact:candidato})}) }catch(e){} }
      showToast(j.aviso || `Pedido enviado ✓ · ${elegidos.length} ${elegidos.length===1?'trabajo':'trabajos'} a ${elegidosDest.join(', ')}`, j.aviso?'err':undefined); onSent&&onSent(); onClose()
    }catch(e){ showToast('Error de conexión','err'); setSaving(false) }
  }
  const chk={display:'flex', gap:9, alignItems:'center', padding:'6px 0', cursor:'pointer', fontSize:12.5}
  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:900, display:'flex', justifyContent:'center', overflowY:'auto', padding:'40px 20px'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:620, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)', height:'fit-content'}}>
      <div style={{padding:'18px 22px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div><div style={{fontSize:16, fontWeight:700, color:T.ink}}>Pedir orden de compra · {agencia}</div><div style={{fontSize:12, color:T.ink3, marginTop:2}}>Un mail con los trabajos hechos, para que los carguen en su sistema. La factura no va en este mail.</div></div>
        <button onClick={onClose} style={{border:'none', background:'transparent', fontSize:22, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
      </div>
      <div style={{padding:'18px 22px'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:10}}>
          <label style={{...lblV2, marginBottom:0}}>Trabajos · {elegidos.length} de {orden.length} · {fmt(suma(elegidos))} + IVA</label>
          <span style={{display:'flex', gap:6}}><button onClick={()=>setSel(orden.map(nroDe))} style={miniBtn}>Todos</button><button onClick={()=>setSel([])} style={miniBtn}>Ninguno</button></span>
        </div>
        <div style={{maxHeight:210, overflowY:'auto', border:`1px solid ${T.border}`, borderRadius:10, padding:'2px 12px', margin:'8px 0 16px'}}>
          {orden.map((x,i)=>{ const n=nroDe(x), on=sel.includes(n), oc=ocDe[n]; return (
            <label key={n} style={{...chk, borderTop:i===0?'none':`1px solid ${T.border}`}}>
              <input type="checkbox" checked={on} onChange={()=>setSel(s=>on?s.filter(v=>v!==n):[...s,n])}/>
              <span style={{flex:1, minWidth:0}}><span style={{display:'block', color:T.ink, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{x.p['Proyecto']||'—'}</span><span style={{display:'block', fontSize:11, color:T.ink3}}>#{n} · {x.p['Cliente']||''} · {semEvento(x.p['Fecha Evento']).fecha}{esCom(x) && <span style={{color:T.ink2, fontWeight:600}}> · orden de compra aparte</span>}{oc && <span style={{color:T.warn, fontWeight:600}}> · ya se pidió el {oc.fecha}</span>}</span></span>
              <span style={{fontFamily:MONO, fontSize:12, color:on?T.ink:T.ink3}}>{fmt(x.pendiente)}</span>
            </label> )})}
        </div>
        <label style={lblV2}>Para</label>
        <div style={{border:`1px solid ${T.border}`, borderRadius:10, padding:'2px 12px', marginBottom:8}}>
          {dests.length===0 && <div style={{fontSize:12.5, color:T.ink3, padding:'9px 0'}}>{agencia} no tiene cargado a quién se le pide. Escribí el mail abajo y queda guardado para la próxima.</div>}
          {dests.map((d,i)=><label key={d.mail} style={{...chk, borderTop:i===0?'none':`1px solid ${T.border}`}}>
            <input type="checkbox" checked={!!d.sel} onChange={()=>setDests(a=>a.map((x,j)=>j===i?{...x,sel:!x.sel}:x))}/>
            <span style={{flex:1, minWidth:0}}><span style={{color:T.ink}}>{d.mail}</span>{d.nombre && <span style={{color:T.ink3}}> · {d.nombre}</span>}</span>
          </label>)}
        </div>
        <div style={{display:'flex', gap:8, marginBottom:8}}>
          <input value={nuevo} onChange={e=>setNuevo(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); agregar() } }} placeholder="Agregar otro mail" style={{...inpV2, flex:1}}/>
          <button onClick={agregar} style={{...miniBtn, padding:'8px 14px'}}>Agregar</button>
        </div>
        {candidato && <label style={{...chk, color:T.ink2, padding:'2px 0 8px'}}><input type="checkbox" checked={recordar} onChange={e=>setRecordar(e.target.checked)}/> Guardar {candidato} como el mail de administración de {agRow['Nombre']}</label>}
        <label style={{...chk, color:T.ink2, padding:'2px 0 14px'}}><input type="checkbox" checked={copia} onChange={e=>setCopia(e.target.checked)}/> Mandarme una copia (la respuesta te llega a vos y a administración)</label>
        <label style={lblV2}>Asunto</label>
        <input value={asunto} onChange={e=>setAsuntoM(e.target.value)} style={{...inpV2, marginBottom:12}}/>
        <label style={lblV2}>Mensaje{cuerpoM!==null && <button onClick={()=>{setCuerpoM(null); setAsuntoM(null)}} style={{border:'none', background:'none', color:T.brand, cursor:'pointer', fontSize:11, fontWeight:600, textTransform:'none', letterSpacing:0, marginLeft:8}}>volver al texto armado</button>}</label>
        <textarea value={cuerpo} onChange={e=>setCuerpoM(e.target.value)} rows={13} style={{...inpV2, fontFamily:'inherit', lineHeight:1.5, resize:'vertical'}}/>
        {cuerpoM!==null && <div style={{fontSize:11, color:T.warn, marginTop:4}}>Editaste el mensaje: si cambiás los trabajos tildados, la lista del mensaje no se actualiza sola.</div>}
      </div>
      <div style={{padding:'16px 22px', borderTop:`1px solid ${T.border}`, display:'flex', gap:10, justifyContent:'flex-end', alignItems:'center'}}>
        <span style={{flex:1, fontSize:11.5, color:T.ink3}}>Queda anotado en la solapa OC_PEDIDOS.</span>
        <button onClick={onClose} style={{padding:'9px 18px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:500, cursor:'pointer'}}>Cancelar</button>
        <button onClick={enviar} disabled={saving} style={{padding:'9px 20px', borderRadius:9, border:'none', background:T.brand, color:'#fff', fontSize:13, fontWeight:700, cursor:saving?'default':'pointer', opacity:saving?0.6:1}}>{saving?'Enviando…':`Mandar el pedido · ${elegidos.length} ${elegidos.length===1?'trabajo':'trabajos'}`}</button>
      </div>
    </div>
  </div>
}

function NuevaFactura({pendientes, agencias=[], contactos=[], initialSel=null, initialExtras=[], onClose, onCreada, showToast}){
  const hoy=new Date()
  const [sel,setSel]=useState(initialSel), [q,setQ]=useState('')
  // Otros trabajos que cubre ESTA MISMA factura (N° de presupuesto). Caso Austral: una orden de
  // compra junta varios trabajos y contra esa orden sale una sola factura.
  const [extras,setExtras]=useState(initialExtras)
  // Datos fiscales de a quién se le factura (la agencia que paga, o el cliente si es directo)
  const facturarA = sel ? ((sel.p['Agencia']&&!/sin agencia|directo/i.test(sel.p['Agencia']))?sel.p['Agencia']:sel.p['Cliente']) : ''
  const agRow = sel ? agencias.find(a=>normTxt(a['Nombre'])===normTxt(facturarA)) : null
  const ctRow = (sel && !agRow?.['CUIT']) ? contactos.find(c=>normTxt(c['Agencia'])===normTxt(facturarA)||normTxt(c['Nombre'])===normTxt(facturarA)) : null
  const cuitFact = (agRow?.['CUIT'] || ctRow?.['Cuit'] || '').toString().trim()
  const condIVAFact = (agRow?.['Condicion IVA'] || '').toString().trim()
  const fechaInfo = p=>semEvento(p['Fecha Evento'])
  const [nroAuto,setNroAuto]=useState('')   // de dónde salió el N°: lo puso el PDF, no Flor
  const her0 = heredarDeFactura(initialSel)   // 2ª factura del trabajo: mismo plazo e IVA que la 1ª
  const [entidad,setEntidad]=useState('SRL'), [tipo,setTipo]=useState('A'), [nro,setNro]=useState(''), [plazo,setPlazo]=useState(plazoDeAgencia(agencias, initialSel?.p)||her0?.plazo||'30'), [conIVA,setConIVA]=useState(her0?her0.conIVA:true), [montoNeto,setMontoNeto]=useState(initialSel?String(Math.round(initialSel.pendiente)):''), [saving,setSaving]=useState(false), [pdfFile,setPdfFile]=useState(null)
  // A quién se le factura cada trabajo: solo se pueden juntar trabajos de la misma agencia (o cliente directo).
  const aQuien = p => (p['Agencia']&&!/sin agencia|directo/i.test(p['Agencia']))?p['Agencia']:p['Cliente']
  const nroDe = x => String(x.p['Columna 1']||'').trim()
  const candidatos = sel ? pendientes.filter(x=>nroDe(x)!==nroDe(sel) && normTxt(aQuien(x.p))===normTxt(facturarA) && !semEvento(x.p['Fecha Evento']).futuro).sort((a,b)=>semEvento(b.p['Fecha Evento']).dias-semEvento(a.p['Fecha Evento']).dias) : []
  const elegidos = candidatos.filter(x=>extras.includes(nroDe(x)))
  const varios = elegidos.length>0
  // Con varios trabajos cada uno entra por lo que le falta facturar; el monto no se edita a mano.
  const neto = sel ? (varios ? Math.round(sel.pendiente)+elegidos.reduce((s,x)=>s+Math.round(x.pendiente),0) : (parseFloat(montoNeto)||sel.pendiente)) : 0
  const iva = !conIVA ? 0 : varios ? [sel,...elegidos].reduce((s,x)=>s+Math.round(Math.round(x.pendiente)*0.21),0) : Math.round(neto*0.21)
  const total = neto+iva
  const lista = pendientes.filter(x=>!q||[x.p['Columna 1'],x.p['Proyecto'],x.p['Cliente'],x.p['Agencia']].some(v=>normTxt(v).includes(normTxt(q)))).sort((a,b)=>semEvento(b.p['Fecha Evento']).dias-semEvento(a.p['Fecha Evento']).dias)

  async function crear(forzar=false, conMail=true){
    if(!sel) return
    const presuNum=sel.p['Columna 1']
    // El N° es lo que une las filas de una factura de varios trabajos: sin N° ni PDF quedarían sueltas.
    if(varios && !nro.trim() && !pdfFile){ showToast('Para una factura de varios trabajos poné el N° o adjuntá el PDF (el N° sale del archivo)','err'); return }
    setSaving(true)
    const fechaEmision=`${hoy.getDate()}/${hoy.getMonth()+1}/${hoy.getFullYear()}`
    const venc=new Date(hoy.getTime()+parseInt(plazo)*864e5); const fechaVenc=`${venc.getDate()}/${venc.getMonth()+1}/${venc.getFullYear()}`
    // Cada trabajo va en su fila con SU monto; todos comparten N° de factura, fechas y PDF.
    const parte = x => { const n=Math.round(x.pendiente), i=conIVA?Math.round(n*0.21):0; return { presupuestoNum:x.p['Columna 1'], proyecto:x.p['Proyecto'], agencia:x.p['Agencia'], cliente:x.p['Cliente'], neto:n, iva:i, total:n+i } }
    const body = varios
      ? { entidad, tipo, nroFactura:nro, fechaEmision, fechaVenc, plazo: plazo==='0'?'Contado':plazo+' días', conIVA, ...parte(sel), otros:elegidos.map(parte), forzar }
      : { entidad, tipo, nroFactura:nro, fechaEmision, fechaVenc, plazo: plazo==='0'?'Contado':plazo+' días', conIVA, neto:Math.round(neto), iva:Math.round(iva), total:Math.round(total), presupuestoNum:presuNum, proyecto:sel.p['Proyecto'], agencia:sel.p['Agencia'], cliente:sel.p['Cliente'], forzar }
    try{
      const r=await fetch('/api/factura-nueva',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      const j=await r.json()
      if(r.status===409){ setSaving(false); if(window.confirm((j.mensaje||'N° de factura duplicado')+'\n\n¿Crear igual?')) return crear(true, conMail); return }
      if(!j.ok){ showToast(j.error||'Error','err'); setSaving(false); return }
      // Fila donde quedó ESTA factura. Con adelanto + saldo hay varias del mismo proyecto:
      // el PDF y el mail tienen que ir contra esta fila, no contra "la factura del #X".
      const filaNueva = j.filaVerificada || j.fila || ''
      // Las filas de los otros trabajos de esta misma factura (el PDF y el mail van para todas)
      const hermanasNuevas = (j.filas||[]).filter(h=>String(h.fila)!==String(filaNueva))
      // 1) Subir PDF si se adjuntó (antes del mail, para que el mail lo lleve adjunto)
      if(pdfFile){
        try{ const fd=new FormData(); fd.append('file',pdfFile,pdfFile.name); fd.append('entidad',entidad); fd.append('nroFactura',nro); fd.append('presupuestoNum',presuNum); fd.append('fila',String(filaNueva)); fd.append('mes',String(hoy.getMonth()+1)); fd.append('anio',String(hoy.getFullYear()))
          if(hermanasNuevas.length) fd.append('hermanas', JSON.stringify(hermanasNuevas))
          showToast('Subiendo PDF…'); const ru=await fetch('/api/factura-upload',{method:'POST',body:fd}); const ju=await ru.json(); if(!ju.ok) showToast('Factura creada, pero el PDF falló: '+(ju.error||''),'err')
          if(varios && !nro.trim() && !(ju.ok && ju.nroDetectado)) window.alert(`Los ${elegidos.length+1} trabajos quedaron cargados, pero SIN N° de factura: no pude leerlo del PDF.\n\nEl N° es lo que los une como una sola factura (para el mail y para el cobro). Completalo en cada fila desde la pestaña Lista.`)
        }catch(e){ showToast('Factura creada, el PDF falló','err') }
      }
      // 2) El mail NO sale solo. Se abre el modal de envío (el mismo del botón ✉) con los
      //    destinatarios sugeridos tildados y el resto de la agencia destildado, para que quien
      //    carga VEA a quién va y qué dice antes de mandarlo. Antes salía automático y Flor no
      //    sabía a quién le había llegado ni qué texto llevaba.
      const fMail = conMail ? { 'N° Presupuesto':String(presuNum), __row:filaNueva, 'Proyecto':sel.p['Proyecto']||'', 'Cliente':sel.p['Cliente']||'', 'Agencia':sel.p['Agencia']||'', 'Nro de Factura':nro||'', 'Fecha emision':fechaEmision } : null
      // Si fue una parte, decir dónde queda el resto: la fila de esta factura lo muestra y lo deja cargar.
      const resta=Math.max(0, Math.round(sel.pendiente)-Math.round(neto))
      showToast(varios ? `Factura creada ✓ · ${elegidos.length+1} trabajos · ${fmt(total)}${conMail?' · elegí a quién mandarla (sale un solo mail)':''}` : `Factura #${presuNum} creada ✓${resta>sel.neto*0.05?` · quedan ${fmt(resta)} por facturar (botón "+ Facturar saldo" en su fila)`:''}${conMail?' · elegí a quién mandarla':''}`); onCreada(fMail)
    }catch(e){ showToast('Error de conexión','err'); setSaving(false) }
  }

  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:900, display:'flex', justifyContent:'center', overflowY:'auto', padding:'40px 20px'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:560, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)', height:'fit-content'}}>
      <div style={{padding:'18px 22px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div style={{fontSize:16, fontWeight:700, color:T.ink}}>{sel?.facturado>0 ? `Factura ${(sel.facturas||[]).length+1} de este trabajo · el saldo` : 'Nueva factura'}</div>
        <button onClick={onClose} style={{border:'none', background:'transparent', fontSize:22, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
      </div>
      <div style={{padding:'18px 22px'}}>
        {!sel ? <>
          <label style={lblV2}>¿Para qué proyecto? (aprobados sin facturar)</label>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar proyecto, cliente, N°…" style={{...inpV2, marginBottom:10}}/>
          <div style={{maxHeight:300, overflowY:'auto', border:`1px solid ${T.border}`, borderRadius:10}}>
            {lista.length===0 && <Empty>Nada pendiente de facturar</Empty>}
            {lista.map((x,i)=>{ const fi=fechaInfo(x.p); return (
              <div key={i} onClick={()=>{setSel(x); setMontoNeto(String(Math.round(x.pendiente))); const h=heredarDeFactura(x), pa=plazoDeAgencia(agencias, x.p); if(h){ if(h.plazo) setPlazo(h.plazo); setConIVA(h.conIVA) } if(pa) setPlazo(pa) }} style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, padding:'10px 14px', borderTop:i===0?'none':`1px solid ${T.border}`, cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background=T.surfaceAlt} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <div style={{minWidth:0}}><div style={{fontSize:13, color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{x.p['Proyecto']||'—'}</div><div style={{fontSize:11.5, color:T.ink3}}>#{x.p['Columna 1']} · {[x.p['Cliente'],x.p['Agencia']].filter(Boolean).join(' · ')}</div>
                  {x.facturado>0 && <div style={{display:'flex', alignItems:'center', gap:6, marginTop:3, fontSize:10.5, color:T.warn, fontWeight:600}}><BarraFacturado pct={x.facturado/x.neto*100} ancho={40}/>ya facturado {Math.round(x.facturado/x.neto*100)}% · falta el saldo</div>}
                </div>
                <div style={{textAlign:'right', flexShrink:0}}>
                  <span style={{fontSize:12.5, fontFamily:MONO, color:T.brand, fontWeight:600}}>{fmt(x.pendiente)}</span>
                  <div style={{display:'flex', alignItems:'center', gap:5, justifyContent:'flex-end', marginTop:3}} title={fi.l}><span style={{width:6,height:6,borderRadius:6,background:fi.c}}/><span style={{fontSize:10.5, color:fi.c, fontWeight:fi.futuro?600:400}}>{fi.futuro?`📅 ${fi.fecha} (futuro)`:fi.fecha}</span></div>
                </div>
              </div>
            )})}
          </div>
        </> : <>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', background:T.surfaceAlt, borderRadius:10, padding:'10px 14px', marginBottom:10}}>
            <div style={{minWidth:0}}><div style={{fontSize:13, color:T.ink, fontWeight:600}}>{sel.p['Proyecto']||'—'}</div><div style={{fontSize:11.5, color:T.ink3}}>#{sel.p['Columna 1']} · {[sel.p['Cliente'],sel.p['Agencia']].filter(Boolean).join(' · ')} · pendiente {fmt(sel.pendiente)}</div>
              {(()=>{ const fi=fechaInfo(sel.p); return <div style={{display:'flex', alignItems:'center', gap:6, marginTop:5}}><span style={{width:7,height:7,borderRadius:7,background:fi.c}}/><span style={{fontSize:11.5, color:fi.c, fontWeight:600}}>Evento {sel.p['Fecha Evento']||'s/f'} · {fi.futuro?'todavía no pasó':fi.l}</span></div> })()}
            </div>
            <button onClick={()=>{setSel(null); setExtras([])}} style={miniBtn}>cambiar</button>
          </div>
          {/* Trabajo facturado en partes: qué se facturó ya y cuánto queda. Así la segunda
              carga no arranca de cero ni hay que ir a mirar la otra factura para sacar la cuenta. */}
          {sel.facturado>0 && <div style={{border:`1px solid ${T.warn}55`, background:T.warnSoft, borderRadius:10, padding:'10px 14px', marginBottom:10}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, marginBottom:7}}>
              <span style={{fontSize:9.5, textTransform:'uppercase', letterSpacing:0.4, color:T.warn, fontWeight:700}}>Ya facturado de este trabajo</span>
              <span style={{fontSize:11.5, color:T.ink2, fontFamily:MONO}}>trabajo entero {fmt(sel.neto)}</span>
            </div>
            {(sel.facturas||[]).map((f,i)=>{ const n=parseMonto(f['Precio SIN IVA'])||parseMonto(f['Precio FINAL']); return (
              <div key={i} style={{display:'flex', justifyContent:'space-between', gap:10, fontSize:12.5, color:T.ink, padding:'2px 0'}}>
                <span style={{fontFamily:MONO}}>{f['Nro de Factura']||'sin N°'}{f['Fecha emision']?<span style={{color:T.ink3}}> · {f['Fecha emision']}</span>:null}</span>
                <span style={{fontFamily:MONO}}>{fmt(n)} <span style={{color:T.ink3}}>· {Math.round(n/sel.neto*100)}%</span></span>
              </div> )})}
            <div style={{display:'flex', alignItems:'center', gap:9, marginTop:8, paddingTop:8, borderTop:`1px solid ${T.warn}33`}}>
              <BarraFacturado pct={sel.facturado/sel.neto*100} ancho={90}/>
              <span style={{fontSize:12.5, color:T.ink, fontWeight:700}}>falta facturar {fmt(sel.pendiente)}</span>
              <span style={{fontSize:11.5, color:T.ink3}}>· {Math.round(sel.pendiente/sel.neto*100)}% · neto, sin IVA</span>
            </div>
          </div>}
          <div style={{background:cuitFact?T.surface:T.brandSoft, border:`1px solid ${cuitFact?T.border:T.brand}`, borderRadius:10, padding:'10px 14px', marginBottom:16}}>
            <div style={{fontSize:9.5, textTransform:'uppercase', letterSpacing:0.4, color:T.ink3, fontWeight:600, marginBottom:4}}>Facturar a</div>
            <div style={{fontSize:13, color:T.ink, fontWeight:600}}>{facturarA||'—'}</div>
            {cuitFact
              ? <div style={{display:'flex', alignItems:'center', gap:10, marginTop:5, flexWrap:'wrap'}}>
                  <span onClick={()=>{navigator.clipboard?.writeText(cuitFact); showToast('CUIT copiado')}} title="Copiar CUIT" style={{fontSize:14, fontFamily:MONO, color:T.ink, fontWeight:600, cursor:'pointer', background:T.surfaceAlt, padding:'3px 9px', borderRadius:7, border:`1px solid ${T.border}`}}>{cuitFact} ⧉</span>
                  {condIVAFact && <span style={{fontSize:11.5, color:T.ink2}}>{condIVAFact}</span>}
                </div>
              : <div style={{fontSize:11.5, color:T.brand, marginTop:5, fontWeight:500}}>⚠ Sin CUIT cargado para «{facturarA}». Cargalo en Agencias.</div>}
          </div>
          {/* Una factura para varios trabajos: se tildan los otros de la misma agencia y entran todos con el mismo N°. */}
          {candidatos.length>0 && <div style={{border:`1px solid ${varios?T.ink:T.border}`, borderRadius:10, padding:'10px 14px', marginBottom:16}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap'}}>
              <div style={{fontSize:12.5, color:T.ink, fontWeight:600}}>¿Esta factura cubre más trabajos de {facturarA}?<span style={{fontWeight:400, color:T.ink3}}> · {candidatos.length} sin facturar</span></div>
              <span style={{display:'flex', gap:6}}>
                <button onClick={()=>setExtras(candidatos.map(nroDe))} style={miniBtn}>Todos</button>
                {varios && <button onClick={()=>setExtras([])} style={miniBtn}>Ninguno</button>}
              </span>
            </div>
            <div style={{maxHeight:190, overflowY:'auto', marginTop:8}}>
              {candidatos.map(x=>{ const n=nroDe(x), on=extras.includes(n), fi=fechaInfo(x.p); return (
                <label key={n} style={{display:'flex', gap:9, alignItems:'center', padding:'6px 0', borderTop:`1px solid ${T.border}`, cursor:'pointer', fontSize:12.5}}>
                  <input type="checkbox" checked={on} onChange={()=>setExtras(e=>on?e.filter(v=>v!==n):[...e,n])}/>
                  <span style={{flex:1, minWidth:0}}><span style={{display:'block', color:T.ink, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{x.p['Proyecto']||'—'}</span><span style={{display:'block', fontSize:11, color:T.ink3}}>#{n} · {x.p['Cliente']||''} · {fi.fecha}</span></span>
                  <span style={{fontFamily:MONO, fontSize:12, color:on?T.ink:T.ink3}}>{fmt(x.pendiente)}</span>
                </label> )})}
            </div>
            {varios && <div style={{fontSize:11.5, color:T.ink2, marginTop:8, paddingTop:8, borderTop:`1px solid ${T.border}`}}>Una sola factura por <b>{elegidos.length+1} trabajos</b>: se guarda una fila por trabajo con el mismo N°, un solo PDF y un solo mail.</div>}
          </div>}
          <div style={{display:'flex', gap:12, flexWrap:'wrap', marginBottom:12}}>
            <div style={{flex:1, minWidth:120}}><label style={lblV2}>Entidad</label><select value={entidad} onChange={e=>setEntidad(e.target.value)} style={inpV2}>{['SRL','Sofia','Lulu','Efectivo'].map(x=><option key={x} value={x}>{x}</option>)}</select></div>
            <div style={{width:90}}><label style={lblV2}>Tipo</label><select value={tipo} onChange={e=>setTipo(e.target.value)} style={inpV2}>{['A','B','C'].map(x=><option key={x} value={x}>{x}</option>)}</select></div>
            <div style={{flex:1, minWidth:140}}><label style={lblV2}>N° de factura</label>
              <input value={nro} onChange={e=>{setNro(e.target.value); setNroAuto('')}} placeholder="Adjuntá el PDF y se completa solo" style={{...inpV2, ...(nroAuto&&nro===nroAuto?{borderColor:T.pos, fontFamily:MONO}:{})}}/>
              {nroAuto&&nro===nroAuto && <div style={{fontSize:10.5, color:T.pos, marginTop:3, fontWeight:600}}>✓ leído del PDF</div>}
            </div>
          </div>
          <div style={{display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end', marginBottom:8}}>
            <div style={{width:160}}><label style={lblV2}>Monto neto (sin IVA)</label>{varios
              ? <div title="Con varios trabajos, cada uno entra por lo que le falta facturar" style={{...inpV2, textAlign:'right', fontFamily:MONO, background:T.surfaceAlt, color:T.ink2}}>{Math.round(neto).toLocaleString('es-AR')}</div>
              : <input type="number" value={montoNeto} onChange={e=>setMontoNeto(e.target.value)} style={{...inpV2, textAlign:'right', fontFamily:MONO}}/>}</div>
            <div style={{width:120}}><label style={lblV2}>Plazo</label><select value={plazo} onChange={e=>setPlazo(e.target.value)} style={inpV2}>{[...new Set([...PLAZOS_FACTURA, plazo])].sort((x,y)=>x-y).map(d=><option key={d} value={d}>{d==='0'?'Contado':d+' días'}</option>)}</select>{plazoDeAgencia(agencias, sel?.p)===plazo && <div style={{fontSize:10.5, color:T.ink3, marginTop:3, whiteSpace:'nowrap'}}>el plazo de {facturarA}</div>}</div>
            <label style={{display:'flex', gap:7, alignItems:'center', fontSize:13, color:T.ink2, cursor:'pointer', paddingBottom:9}}><input type="checkbox" checked={conIVA} onChange={e=>setConIVA(e.target.checked)}/> Con IVA 21%</label>
          </div>
          {/* Los porcentajes son para facturar UN trabajo en partes; con varios trabajos en la factura no aplican. */}
          <div style={{display:varios?'none':'flex', gap:7, alignItems:'center', marginBottom:12, flexWrap:'wrap'}}>
            <span style={{fontSize:11.5, color:T.ink3}}>Facturar:</span>
            {/* Los % son SIEMPRE del trabajo entero. En la 2ª factura antes eran del saldo
                ("30%" daba el 30% de lo que faltaba, un número que no es de nada). */}
            {(sel.facturado>0
                ? [['Todo el saldo',sel.pendiente],['30% del trabajo',sel.neto*0.3],['50% del trabajo',sel.neto*0.5]].filter(([,m],i)=>i===0||m<sel.pendiente-1)
                : [['20%',sel.neto*0.2],['30% (seña)',sel.neto*0.3],['50%',sel.neto*0.5],['Total',sel.pendiente]]
              ).map(([l,m])=>{ const on=Math.round(neto)===Math.round(m); return <button key={l} onClick={()=>setMontoNeto(String(Math.round(m)))} style={{padding:'5px 12px', borderRadius:20, fontSize:11.5, fontWeight:600, cursor:'pointer', border:`1px solid ${on?T.ink:T.border}`, background:on?T.ink:T.surface, color:on?'#fff':T.ink2}}>{l}</button> })}
            {(()=>{ const restante=Math.max(0, Math.round(sel.pendiente)-Math.round(neto)); return restante>0 ? <span style={{fontSize:11.5, color:T.warn, fontWeight:600, marginLeft:4}}>↳ queda pendiente {fmt(restante)} para facturar después</span> : <span style={{fontSize:11.5, color:T.pos, fontWeight:600, marginLeft:4}}>{sel.facturado>0?'↳ con esta el trabajo queda 100% facturado':'↳ factura el total, no queda saldo'}</span> })()}
          </div>
          <div style={{marginBottom:4}}>
            <label style={lblV2}>PDF de la factura (opcional)</label>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              <input type="file" accept="application/pdf,image/*" onChange={e=>{
                const f=e.target.files?.[0]||null
                // El CUIT emisor viene en el nombre: si no es nuestro, es la factura de un
                // freelancer a Magma. No se adjunta ni se le copia el número.
                const emisor=f?emisorDelArchivo(f.name):null
                if(emisor && !emisor.propio){
                  e.target.value=''; setPdfFile(null); if(nroAuto&&nro===nroAuto) setNro(''); setNroAuto('')
                  showToast(avisoPdfAjeno(emisor),'err'); return
                }
                setPdfFile(f)
                // El PDF que baja de AFIP se llama CUIT_TIPO_PTOVTA_NRO.pdf: el número
                // lo sacamos de ahí en vez de que alguien lo tipee.
                const detectado=f?nroDeNombreArchivo(f.name):null
                if(detectado){ setNro(detectado); setNroAuto(detectado) } else setNroAuto('')
                // Y de paso la entidad y el tipo: 26 facturas de Sofi están en la carpeta de la SRL.
                if(emisor){ setEntidad(emisor.entidad); if(emisor.tipo) setTipo(emisor.tipo) }
              }} style={{fontSize:12.5, color:T.ink2}}/>
              {pdfFile && <span style={{fontSize:11.5, color:T.pos, fontWeight:600}}>✓ {pdfFile.name}</span>}
            </div>
          </div>
          <div style={{display:'flex', justifyContent:'flex-end', gap:20, padding:'12px 0', borderTop:`1px solid ${T.border}`}}>
            <Mini label="Neto" val={fmt(neto)}/>{conIVA&&<Mini label="IVA" val={fmt(iva)}/>}<Mini label="Total" val={fmt(total)} color={T.brand}/>
          </div>
        </>}
      </div>
      {sel && <div style={{padding:'14px 22px', borderTop:`1px solid ${T.border}`, display:'flex', gap:10, justifyContent:'flex-end', alignItems:'center', flexWrap:'wrap'}}>
        <button onClick={onClose} style={{padding:'9px 18px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:500, cursor:'pointer'}}>Cancelar</button>
        <button onClick={()=>crear(false,false)} disabled={saving||neto<=0} style={{padding:'9px 18px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13, fontWeight:600, cursor:(saving||neto<=0)?'default':'pointer', opacity:(saving||neto<=0)?0.5:1}}>Solo crear</button>
        <button onClick={()=>crear(false,true)} disabled={saving||neto<=0} style={{padding:'9px 22px', borderRadius:9, border:'none', background:(saving||neto<=0)?T.ink3:T.brand, color:'#fff', fontSize:13.5, fontWeight:600, cursor:(saving||neto<=0)?'default':'pointer'}}>{saving?'Procesando…':'Crear y mandar mail'}</button>
      </div>}
    </div>
  </div>
}

// Un solo mail con TODAS las facturas pendientes de un cliente.
// Caso real: Ostara debe varias y siempre contesta la misma persona de administración.
function ReclamoModal({ agenciasPendientes, inicial, onClose, onSent, showToast }){
  // `inicial` puede ser el nombre del cliente (botón de arriba) o {agencia, fila, nro}
  // (botón Reclamar de una fila): en ese caso ESA factura viene tildada aunque esté en plazo.
  const iniAg = typeof inicial==='string' ? inicial : (inicial?.agencia||'')
  const iniFact = (inicial && typeof inicial==='object') ? inicial : null
  const esLaInicial = p => !!iniFact && ((iniFact.fila && String(p.fila)===String(iniFact.fila)) || (!iniFact.fila && iniFact.nro && String(p.nro)===String(iniFact.nro)))
  const [ag,setAg]=useState(iniAg)
  const [loading,setLoading]=useState(false)
  const [data,setData]=useState(null)
  const [dests,setDests]=useState([])
  const [nuevo,setNuevo]=useState('')
  const [asunto,setAsunto]=useState('')
  const [cuerpo,setCuerpo]=useState('')
  const [saving,setSaving]=useState(false)

  const [items,setItems]=useState([])   // facturas con su tilde
  const [tocado,setTocado]=useState(false) // si Flor editó el texto, no lo pisamos

  const cargar=async(nombre)=>{
    if(!nombre){ setData(null); setItems([]); return }
    setLoading(true); setData(null); setTocado(false)
    try{ const r=await fetch('/api/reclamo-prep',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agencia:nombre})}); const j=await r.json()
      if(!j.ok){ showToast(j.error||'Error','err'); setLoading(false); return }
      setData(j)
      // Se reclama lo VENCIDO. Lo que todavía está en plazo (mes de gracia) viene destildado:
      // no se le reclama a un cliente algo que aún no venció. Igual se puede tildar a mano.
      setItems((j.pendientes||[]).map(p=>({...p, sel: (nombre===iniAg && esLaInicial(p)) ? true : !p.enPlazo})))
      setDests((j.destinatarios||[]).map((d,i)=>({...d, sel:d.admin ? true : (i===0 && !(j.destinatarios||[]).some(x=>x.admin))})))
      setLoading(false)
    }catch(e){ showToast('Error de conexión','err'); setLoading(false) }
  }
  useEffect(()=>{ if(iniAg) cargar(iniAg) /* eslint-disable-next-line */ },[])
  // Si el cliente de la fila no está en el desplegable (ej: factura con monto 0), igual se muestra
  const agOpts = (!ag || agenciasPendientes.some(a=>a.nombre===ag)) ? agenciasPendientes : [{nombre:ag,n:0,monto:0},...agenciasPendientes]

  const elegidas=items.filter(i=>i.sel)
  const totalSel=elegidas.reduce((s,i)=>s+i.monto,0)
  const vencSel=elegidas.filter(i=>i.diasVencida>0).length

  // El mail se rearma solo cada vez que cambia la selección, salvo que ya lo hayan editado a mano
  useEffect(()=>{
    if(!data||tocado) return
    const prim=dests.find(d=>d.sel)?.nombre?.split(' ')[0]||''
    setAsunto(`Resumen de cuenta - Somos Magma / ${ag} · ${elegidas.length} ${elegidas.length===1?'factura pendiente':'facturas pendientes'}`)
    setCuerpo([
      `Hola${prim && !/facturaci/i.test(prim) ? ' '+prim : ''},`,``,
      `Te paso el resumen de cuenta con los trabajos que tenemos pendientes de cobro:`,``,
      ...elegidas.map(p=>{
        const ref=p.nroFactura?`Factura ${p.nroFactura}`:`Presupuesto #${p.nro}`
        const det=[]; if(p.emision)det.push(`emitida ${p.emision}`)
        if(p.vencimiento)det.push(p.diasVencida>0?`venció ${p.vencimiento} (${p.diasVencida} días)`:`vence ${p.vencimiento}`)
        return `• ${ref} — ${p.proyecto||p.cliente||'s/d'}: $${Math.round(p.monto).toLocaleString('es-AR')}`+(det.length?`\n   ${det.join(' · ')}`:'')
      }),``,
      `TOTAL PENDIENTE: $${Math.round(totalSel).toLocaleString('es-AR')}`,
      vencSel?`(${vencSel} ${vencSel===1?'factura vencida':'facturas vencidas'})`:null,``,
      `Datos para transferir:`,...(data.lineasTransfer||[]),``,
      `¿Nos podés confirmar fecha estimada de pago así lo ordenamos de nuestro lado?`,``,
      `Cualquier cosa que necesites (duplicado de alguna factura, detalle de un trabajo), avisame y te lo mando.`,``,
      `Gracias,`,`${data.nombreEmisor}`,`Somos Magma`,
    ].filter(l=>l!==null).join('\n'))
  /* eslint-disable-next-line */ },[items,dests,data])
  const toggle=i=>setDests(d=>d.map((x,j)=>j===i?{...x,sel:!x.sel}:x))
  const agregar=()=>{ const m=nuevo.trim(); if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)){ showToast('Mail inválido','err'); return } if(dests.find(d=>d.mail.toLowerCase()===m.toLowerCase())){setNuevo('');return} setDests(d=>[...d,{mail:m,nombre:'agregado',match:'agregado a mano',sel:true}]); setNuevo('') }
  const elegidos=dests.filter(d=>d.sel).map(d=>d.mail)

  async function enviar(){
    if(!elegidos.length){ showToast('Elegí al menos un destinatario','err'); return }
    setSaving(true)
    try{ const r=await fetch('/api/factura-enviar',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({to:elegidos, asunto, cuerpo, accion:'reclamo-enviado', detalle:`${ag} · ${elegidas.length} facturas · ${fmt(totalSel)}`})})
      const j=await r.json()
      if(!j.ok){ showToast(j.error||'No se pudo enviar','err'); setSaving(false); return }
      showToast(`Reclamo enviado a ${elegidos.length===1?elegidos[0]:elegidos.length+' destinatarios'} ✓`); onSent&&onSent(); onClose()
    }catch(e){ showToast('Error de conexión','err'); setSaving(false) }
  }

  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:910, display:'flex', justifyContent:'center', overflowY:'auto', padding:'40px 20px'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:620, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)', height:'fit-content'}}>
      <div style={{padding:'18px 22px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div><div style={{fontSize:16, fontWeight:700, color:T.ink}}>Reclamar cuenta</div><div style={{fontSize:11.5, color:T.ink3, marginTop:2}}>Un solo mail con todo lo que debe · sale de admin@somosmagma.com</div></div>
        <button onClick={onClose} style={{border:'none', background:'transparent', fontSize:22, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
      </div>
      <div style={{padding:'16px 22px'}}>
        <label style={lblV2}>Cliente / agencia</label>
        <select value={ag} onChange={e=>{ setAg(e.target.value); cargar(e.target.value) }} style={{...inpV2, marginBottom:14}}>
          <option value="">Elegí a quién reclamar…</option>
          {agOpts.map(a=><option key={a.nombre} value={a.nombre}>{a.nombre}{a.n?` — ${a.n} pendiente${a.n===1?'':'s'} · ${fmtM(a.monto)}`:''}</option>)}
        </select>

        {loading && <div style={{padding:'24px', textAlign:'center', color:T.ink3, fontSize:13}}>Buscando lo pendiente…</div>}

        {data && data.pendientes.length===0 && <div style={{fontSize:13, color:T.pos, padding:'10px 0'}}>No hay facturas pendientes de {ag} ✓</div>}

        {data && data.pendientes.length>0 && <>
          <div style={{background:T.surfaceAlt, border:`1px solid ${T.border}`, borderRadius:10, padding:'12px 14px', marginBottom:14}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8}}>
              <span style={{fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3}}>{elegidas.length} de {items.length} · {vencSel>0?`${vencSel} vencidas`:'ninguna vencida'}</span>
              <span style={{fontSize:16, fontWeight:700, fontFamily:MONO, color:T.brand}}>{fmt(totalSel)}</span>
            </div>
            <div style={{display:'flex', gap:6, marginBottom:8, flexWrap:'wrap'}}>
              <button onClick={()=>setItems(a=>a.map(x=>({...x,sel:x.diasVencida>0})))} style={{...miniBtn, padding:'4px 10px', fontSize:11}}>Solo vencidas</button>
              <button onClick={()=>setItems(a=>a.map(x=>({...x,sel:true})))} style={{...miniBtn, padding:'4px 10px', fontSize:11}}>Todas</button>
              <button onClick={()=>setItems(a=>a.map(x=>({...x,sel:false})))} style={{...miniBtn, padding:'4px 10px', fontSize:11}}>Ninguna</button>
            </div>
            {items.map((p,i)=>(
              <label key={i} style={{display:'flex', alignItems:'center', gap:9, padding:'5px 0', fontSize:12, borderTop:i?`1px solid ${T.border}`:'none', cursor:'pointer', opacity:p.sel?1:0.5}}>
                <input type="checkbox" checked={p.sel} onChange={()=>setItems(a=>a.map((x,j)=>j===i?{...x,sel:!x.sel}:x))}/>
                <span style={{flex:1, minWidth:0, color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                  {p.nroFactura?`Fc ${p.nroFactura}`:`#${p.nro}`} · {p.proyecto||'—'}
                  {ag===iniAg && esLaInicial(p) && <span style={{color:T.brand, fontWeight:600}}> · esta</span>}
                  {p.sinNumero && <span style={{color:T.warn, fontWeight:600}}> · falta N°</span>}
                  {p.enPlazo && <span style={{color:T.ink3}}> · en plazo, vence en {p.diasParaVencer}d</span>}
                </span>
                <span style={{fontFamily:MONO, color:p.diasVencida>0?T.brand:T.ink2, fontWeight:p.diasVencida>0?600:400, flexShrink:0}}>{fmt(p.monto)}{p.diasVencida>0?` · ${p.diasVencida}d`:''}</span>
              </label>
            ))}
          </div>
          {(data.enPlazo>0 || data.sinNumero>0) && <div style={{fontSize:12, color:T.ink2, background:T.surfaceAlt, border:`1px solid ${T.border}`, borderRadius:8, padding:'9px 12px', marginBottom:14, lineHeight:1.5}}>
            {data.enPlazo>0 && <div><b style={{color:T.ink}}>{data.enPlazo} {data.enPlazo===1?'factura todavía no venció':'facturas todavía no vencieron'}</b> — vienen destildadas (están en plazo). Tildalas si igual las querés incluir.</div>}
            {data.sinNumero>0 && <div style={{marginTop:data.enPlazo>0?5:0}}><b style={{color:T.warn}}>{data.sinNumero} sin N° de factura cargado</b> — la factura está emitida, falta anotar el número en el sheet. Se reclaman igual.</div>}
          </div>}

          <label style={lblV2}>Para</label>
          <div style={{display:'flex', flexDirection:'column', gap:6, marginBottom:8}}>
            {dests.length===0 && <div style={{fontSize:12, color:T.ink3}}>Sin contactos cargados para {ag}. Agregá un mail abajo.</div>}
            {dests.map((d,i)=>(
              <label key={i} style={{display:'flex', alignItems:'center', gap:9, fontSize:13, color:T.ink, cursor:'pointer', padding:'7px 10px', borderRadius:8, border:`1px solid ${d.sel?T.ink:T.border}`, background:d.sel?T.surfaceAlt:T.surface}}>
                <input type="checkbox" checked={d.sel} onChange={()=>toggle(i)}/>
                <span style={{flex:1, minWidth:0}}><span style={{fontFamily:MONO, fontSize:12.5}}>{d.mail}</span> <span style={{fontSize:10.5, color:T.ink3}}>· {d.match||d.nombre}</span></span>
              </label>
            ))}
          </div>
          <div style={{display:'flex', gap:8, marginBottom:14}}>
            <input value={nuevo} onChange={e=>setNuevo(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();agregar()}}} placeholder="Agregar otro mail…" style={{...inpV2, flex:1}}/>
            <button onClick={agregar} style={{...miniBtn, padding:'8px 14px'}}>+ Agregar</button>
          </div>
          <label style={lblV2}>Asunto</label>
          <input value={asunto} onChange={e=>{setTocado(true); setAsunto(e.target.value)}} style={{...inpV2, marginBottom:12}}/>
          <label style={lblV2}>Mensaje</label>
          <textarea value={cuerpo} onChange={e=>{setTocado(true); setCuerpo(e.target.value)}} rows={14} style={{...inpV2, resize:'vertical', fontFamily:MONO, fontSize:12, lineHeight:1.5}}/>
        </>}
      </div>
      <div style={{padding:'14px 22px', borderTop:`1px solid ${T.border}`, display:'flex', gap:10, justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{padding:'9px 18px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:500, cursor:'pointer'}}>Cancelar</button>
        <button onClick={enviar} disabled={saving||!elegidas.length} style={{padding:'9px 22px', borderRadius:9, border:'none', background:T.brand, color:'#fff', fontSize:13.5, fontWeight:600, cursor:(saving||!data)?'default':'pointer', opacity:(saving||!elegidas.length)?0.5:1}}>{saving?'Enviando…':`Enviar reclamo${elegidas.length?' · '+fmtM(totalSel):''}`}</button>
      </div>
    </div>
  </div>
}

function MailFacturaModal({ f, onClose, onSent, showToast }){
  const num=f['N° Presupuesto']
  const [loading,setLoading]=useState(true)
  const [dests,setDests]=useState([])   // {mail, nombre, match, sel}
  const [nuevo,setNuevo]=useState('')
  const [asunto,setAsunto]=useState('')
  const [cuerpo,setCuerpo]=useState('')
  const [saving,setSaving]=useState(false)
  const [adjPDF,setAdjPDF]=useState(false)   // el PDF va pegado al mail (no como link de Drive)
  const [agencia,setAgencia]=useState('')      // para aprender el mail de facturación de la agencia
  const [mailFactAg,setMailFactAg]=useState('')
  const [recordar,setRecordar]=useState(false)
  // Si la factura cubre varios trabajos: las otras filas del mismo N° (las marca como enviadas el mismo mail)
  const [hermanas,setHermanas]=useState([])
  useEffect(()=>{ let vivo=true; (async()=>{
    try{ const r=await fetch('/api/factura-prep-mail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({presupuestoNum:num, fila:f.__row})}); const j=await r.json()
      if(!vivo) return
      if(!j.ok){ showToast(j.error||'Error preparando el mail','err'); onClose(); return }
      // Solo vienen tildados los sugeridos (contacto del presu + facturación de la agencia).
      // El resto de la agencia queda desmarcado: la factura no va en copia a todo el mundo.
      setDests((j.destinatarios||[]).map(d=>({...d, sel:!!d.sugerido})))
      setAdjPDF(!!j.adjuntarPDF); setHermanas(j.hermanas||[])
      setAgencia(j.agenciaNombre||''); setMailFactAg(j.mailFacturacionAgencia||'')
      setAsunto(j.asunto||''); setCuerpo(j.cuerpo||''); setLoading(false)
    }catch(e){ if(vivo){ showToast('Error de conexión','err'); onClose() } }
  })(); return ()=>{vivo=false} },[])  // eslint-disable-line
  const toggle=i=>setDests(d=>d.map((x,j)=>j===i?{...x,sel:!x.sel}:x))
  const agregar=()=>{ const m=nuevo.trim(); if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)){ showToast('Mail inválido','err'); return } if(dests.find(d=>d.mail.toLowerCase()===m.toLowerCase())){ setNuevo(''); return } setDests(d=>[...d,{mail:m,nombre:'agregado',match:'agregado a mano',sel:true}]); setNuevo('') }
  const seleccionados=dests.filter(d=>d.sel).map(d=>d.mail)
  // Si mandás la factura a alguien que no es el contacto del presu y la agencia no tiene
  // mail de facturación cargado, ofrecemos guardarlo: la próxima ya viene sugerido.
  const candidatoFact=(!mailFactAg && agencia) ? (dests.find(d=>d.sel && !/contacto del presu/i.test(d.match||''))?.mail||'') : ''

  // Subir el PDF sin salir del modal: si falta, el mail sale sin adjunto y no sirve de nada
  const [subiendo,setSubiendo]=useState(false)
  function subirPDF(){
    const input=document.createElement('input'); input.type='file'; input.accept='application/pdf,image/*'
    input.onchange=async()=>{
      const file=input.files?.[0]; if(!file) return
      const nro=f['Nro de Factura']||'', nl=nro.toLowerCase()
      const entidad=nl.includes('sofia')?'Sofia':nl.includes('lulu')?'Lulu':(nl.includes('ef-')||nl.includes('efectivo'))?'Efectivo':'SRL'
      const fe=parseD(f['Fecha emision'])||new Date()
      const fd=new FormData()
      fd.append('file', file, file.name); fd.append('entidad', entidad); fd.append('nroFactura', nro)
      fd.append('presupuestoNum', num||''); fd.append('fila', String(f.__row||'')); fd.append('mes', String(fe.getMonth()+1)); fd.append('anio', String(fe.getFullYear()))
      if(hermanas.length) fd.append('hermanas', JSON.stringify(hermanas))
      setSubiendo(true)
      try{ const r=await fetch('/api/factura-upload',{method:'POST',body:fd}); const j=await r.json()
        if(!j.ok){ showToast(j.error||'Error subiendo el PDF','err'); setSubiendo(false); return }
        if(j.avisoLink){ showToast('El PDF subió a Drive pero no quedó linkeado: '+j.avisoLink,'err'); setSubiendo(false); return }
        setAdjPDF(true); setSubiendo(false); showToast(msgUpload(j, 'PDF subido ✓ ahora va adjunto'), j.accionNro==='conflicto'?'err':undefined)
        // El cuerpo cambia según haya PDF o no: lo re-armamos
        try{ const rp=await fetch('/api/factura-prep-mail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({presupuestoNum:num, fila:f.__row})}); const jp=await rp.json(); if(jp.ok&&jp.cuerpo) setCuerpo(jp.cuerpo) }catch(e){}
        onSent&&onSent()
      }catch(e){ showToast('Error de conexión','err'); setSubiendo(false) }
    }
    input.click()
  }
  async function enviar(){
    if(!seleccionados.length){ showToast('Elegí al menos un destinatario','err'); return }
    setSaving(true)
    try{ const r=await fetch('/api/factura-enviar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:seleccionados, asunto, cuerpo, presupuestoNum:num, fila:f.__row, adjuntarPDF:adjPDF, hermanas})}); const j=await r.json()
      if(!j.ok){ showToast(j.error||'No se pudo enviar','err'); setSaving(false); return }
      // Aprender el mail de facturación de la agencia (queda en la solapa AGENCIAS)
      if(recordar && candidatoFact){
        try{ await fetch('/api/agencia-upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:agencia, mailFact:candidatoFact})}) }catch(e){}
      }
      showToast(`Mail enviado a ${seleccionados.length} ${seleccionados.length===1?'destinatario':'destinatarios'}${j.adjunto?' con la factura adjunta':''} ✓`); onSent&&onSent(); onClose()
    }catch(e){ showToast('Error de conexión','err'); setSaving(false) }
  }
  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:910, display:'flex', justifyContent:'center', overflowY:'auto', padding:'40px 20px'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:560, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)', height:'fit-content'}}>
      <div style={{padding:'18px 22px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div><div style={{fontSize:16, fontWeight:700, color:T.ink}}>Mandar factura por mail</div><div style={{fontSize:11.5, color:T.ink3, marginTop:2}}>#{num} · {f['Proyecto']||f['Cliente']||''} · sale de admin@somosmagma.com</div></div>
        <button onClick={onClose} style={{border:'none', background:'transparent', fontSize:22, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
      </div>
      {loading ? <div style={{padding:'40px', textAlign:'center', color:T.ink3, fontSize:13}}>Preparando…</div> : <>
      <div style={{padding:'16px 22px'}}>
        <label style={lblV2}>Para</label>
        <div style={{display:'flex', flexDirection:'column', gap:6, marginBottom:8}}>
          {dests.length===0 && <div style={{fontSize:12, color:T.ink3}}>No hay contactos sugeridos para esta agencia. Agregá un mail abajo.</div>}
          {dests.map((d,i)=>(
            <span key={i}>
              {/* Separador: de acá para abajo son contactos de la agencia que NO van tildados */}
              {i>0 && !d.sugerido && dests[i-1].sugerido &&
                <div style={{fontSize:10.5, color:T.ink3, textTransform:'uppercase', letterSpacing:0.4, margin:'10px 0 6px'}}>Otros contactos de la agencia — tildá solo si corresponde</div>}
              <label style={{display:'flex', alignItems:'center', gap:9, fontSize:13, color:T.ink, cursor:'pointer', padding:'7px 10px', borderRadius:8, border:`1px solid ${d.sel?T.ink:T.border}`, background:d.sel?T.surfaceAlt:T.surface, opacity:(!d.sugerido&&!d.sel)?0.72:1}}>
                <input type="checkbox" checked={d.sel} onChange={()=>toggle(i)}/>
                <span style={{flex:1, minWidth:0}}><span style={{fontFamily:MONO, fontSize:12.5}}>{d.mail}</span> <span style={{fontSize:10.5, color:T.ink3}}>· {d.match||d.nombre}</span></span>
              </label>
            </span>
          ))}
        </div>
        <div style={{display:'flex', gap:8, marginBottom:16}}>
          <input value={nuevo} onChange={e=>setNuevo(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();agregar()}}} placeholder="Agregar otro mail…" style={{...inpV2, flex:1}}/>
          <button onClick={agregar} style={{...miniBtn, padding:'8px 14px'}}>+ Agregar</button>
        </div>
        {candidatoFact && <label style={{display:'flex', alignItems:'center', gap:8, fontSize:12, color:T.ink2, marginBottom:14, cursor:'pointer'}}>
          <input type="checkbox" checked={recordar} onChange={e=>setRecordar(e.target.checked)}/>
          <span>Guardar <b style={{fontFamily:MONO, fontSize:11.5}}>{candidatoFact}</b> como mail de facturación de {agencia} (la próxima ya viene sugerido)</span>
        </label>}
        {/* El PDF viaja adjunto al mail. Con link de Drive el cliente caía en "solicitar acceso". */}
        {adjPDF
          ? <div style={{display:'flex', alignItems:'center', gap:8, padding:'9px 12px', borderRadius:9, background:T.posSoft, border:`1px solid ${T.pos}33`, marginBottom:16, fontSize:12.5, color:T.pos}}>
              📎 <span style={{color:T.ink}}>La factura va <b>adjunta</b> al mail{f['Nro de Factura']?` (Factura ${f['Nro de Factura']}.pdf)`:''} — el cliente la abre sin pedir acceso.</span>
            </div>
          : <div style={{padding:'11px 12px', borderRadius:9, background:'#FFF7E8', border:`1px solid ${T.warn}33`, marginBottom:16, fontSize:12.5, color:T.ink, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
              <span style={{flex:1, minWidth:180}}>⚠ Esta factura todavía no está cargada: el mail saldría <b>sin adjunto</b>.</span>
              <button onClick={subirPDF} disabled={subiendo} style={{padding:'8px 14px', borderRadius:8, border:'none', background:T.ink, color:'#fff', fontSize:12.5, fontWeight:600, cursor:subiendo?'default':'pointer', opacity:subiendo?0.6:1}}>{subiendo?'Subiendo…':'📎 Cargar la factura'}</button>
            </div>}
        <label style={lblV2}>Asunto</label>
        <input value={asunto} onChange={e=>setAsunto(e.target.value)} style={{...inpV2, marginBottom:12}}/>
        <label style={lblV2}>Mensaje</label>
        <textarea value={cuerpo} onChange={e=>setCuerpo(e.target.value)} rows={11} style={{...inpV2, fontFamily:'inherit', lineHeight:1.5, resize:'vertical'}}/>
      </div>
      <div style={{padding:'14px 22px', borderTop:`1px solid ${T.border}`, display:'flex', gap:10, justifyContent:'space-between', alignItems:'center'}}>
        <span style={{fontSize:11.5, color:T.ink3}}>{seleccionados.length} destinatario{seleccionados.length!==1?'s':''}{adjPDF?' · con factura adjunta':''}</span>
        <div style={{display:'flex', gap:10}}>
          <button onClick={onClose} style={{padding:'9px 18px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:500, cursor:'pointer'}}>Cancelar</button>
          <button onClick={enviar} disabled={saving||!seleccionados.length} style={{padding:'9px 22px', borderRadius:9, border:'none', background:(saving||!seleccionados.length)?T.ink3:T.brand, color:'#fff', fontSize:13.5, fontWeight:600, cursor:(saving||!seleccionados.length)?'default':'pointer'}}>{saving?'Enviando…':(adjPDF?'✉ Enviar con la factura':'✉ Enviar')}</button>
        </div>
      </div>
      </>}
    </div>
  </div>
}

function YaCobradaModal({x, onClose, onConfirm}){
  const presupuestado=Math.round(x.pendiente)
  const [monto,setMonto]=useState(String(presupuestado))
  const [saving,setSaving]=useState(false)
  const [yaCobrada,setYaCobrada]=useState(false)  // arranca SIN cobrar: el 14/9 Popstars (#2255 y #2256, $7,5M) quedó "cobrada" porque venía tildado
  const evDef = x.p['Fecha Evento']||''
  const [fEnv,setFEnv]=useState(evDef)
  const [fCob,setFCob]=useState(evDef)
  const real=parseFloat(monto)||0
  const dif=real-presupuestado
  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:910, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'70px 20px'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:430, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.15)'}}>
      <div style={{padding:'18px 22px', borderBottom:`1px solid ${T.border}`}}>
        <div style={{fontSize:16, fontWeight:700, color:T.ink}}>{yaCobrada?'Marcar como ya facturada y cobrada':'Marcar como ya facturada (sin cobrar)'}</div>
        <div style={{fontSize:12, color:T.ink3, marginTop:2}}>#{x.p['Columna 1']} · {x.p['Proyecto']||x.p['Cliente']||''}</div>
      </div>
      <div style={{padding:'20px 22px'}}>
        <label style={lblV2}>{yaCobrada?'¿Cuánto cobraste en realidad? (neto sin IVA)':'¿Por cuánto la facturaste? (neto sin IVA)'}</label>
        <input type="number" value={monto} onChange={e=>setMonto(e.target.value)} autoFocus style={{...inpV2, textAlign:'right', fontFamily:MONO, fontSize:16, marginBottom:8}}/>
        <div style={{fontSize:11.5, color:T.ink3}}>Presupuestado: <span style={{fontFamily:MONO}}>{fmt(presupuestado)}</span>{dif!==0 && <span style={{color:dif>0?T.pos:T.brand, fontWeight:600}}> · {dif>0?'+':''}{fmt(dif)} {dif>0?'de más':'de menos'}</span>}</div>
        <label style={{display:'flex', gap:9, alignItems:'flex-start', fontSize:13, color:T.ink2, cursor:'pointer', marginTop:14, background:yaCobrada?T.surfaceAlt:T.warnSoft, border:`1px solid ${yaCobrada?T.border:T.warn}`, borderRadius:10, padding:'10px 12px'}}>
          <input type="checkbox" checked={yaCobrada} onChange={e=>setYaCobrada(e.target.checked)} style={{marginTop:2}}/>
          <span><strong style={{color:T.ink}}>Ya la cobré también.</strong> Tildá <strong>solo si la plata ya entró</strong>. Si no, queda <strong>facturada pendiente de cobro</strong> y la cobrás después con "Cobrar".</span>
        </label>
        <div style={{display:'flex', gap:10, marginTop:12}}>
          <div style={{flex:1}}>
            <label style={{...lblV2, fontSize:11}}>Fecha en que la enviaste</label>
            <input value={fEnv} onChange={e=>setFEnv(e.target.value)} placeholder="DD/MM/AAAA" style={{...inpV2, fontFamily:MONO, fontSize:13}}/>
          </div>
          {yaCobrada && <div style={{flex:1}}>
            <label style={{...lblV2, fontSize:11}}>Fecha en que la cobraste</label>
            <input value={fCob} onChange={e=>setFCob(e.target.value)} placeholder="DD/MM/AAAA" style={{...inpV2, fontFamily:MONO, fontSize:13}}/>
          </div>}
        </div>
        <div style={{fontSize:11, color:T.ink3, marginTop:6}}>Por defecto va la fecha del evento — <strong style={{color:T.brand}}>corregí con las fechas reales</strong> (si no, el "cobrado a tiempo" sale mal).</div>
        <div style={{fontSize:11.5, color:T.ink3, marginTop:12, background:T.surfaceAlt, borderRadius:8, padding:'9px 11px'}}>No toca el saldo de ninguna cuenta (es histórico). El presupuesto y el staff quedan intactos — esto solo registra la factura.</div>
      </div>
      <div style={{padding:'16px 22px', borderTop:`1px solid ${T.border}`, display:'flex', gap:10, justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{padding:'9px 18px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:500, cursor:'pointer'}}>Cancelar</button>
        <button onClick={()=>{setSaving(true); onConfirm(x, Math.round(real), yaCobrada, fEnv, fCob)}} disabled={saving||real<=0} style={{padding:'9px 20px', borderRadius:9, border:'none', background:(saving||real<=0)?T.ink3:T.pos, color:'#fff', fontSize:13, fontWeight:600, cursor:(saving||real<=0)?'default':'pointer'}}>{saving?'Guardando…':'Confirmar'}</button>
      </div>
    </div>
  </div>
}

// Editar a mano las fechas de una factura (envío / cobro). Para notas de crédito,
// facturas consolidadas (Austral) o cualquier corrección. Usa el endpoint genérico factura-editar.
function EditarFechasModal({f, onClose, onRefresh, showToast}){
  const num=f['N° Presupuesto']
  const [env,setEnv]=useState(f['Fecha enviada']||'')
  const [cob,setCob]=useState(f['Fecha cobro']||'')
  const [saving,setSaving]=useState(false)
  const dias=(()=>{ const e=parseD(env), c=parseD(cob); if(!e||!c) return null; return Math.floor((c-e)/864e5) })()
  async function guardar(){
    const cambios={}
    if((env||'')!==(f['Fecha enviada']||'')) cambios['Fecha enviada']=env
    if((cob||'')!==(f['Fecha cobro']||'')) cambios['Fecha cobro']=cob
    if(!Object.keys(cambios).length){ showToast('No hay cambios','err'); return }
    setSaving(true)
    try{
      const r=await fetch('/api/factura-editar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ presupuestoNum:String(num), fila:f.__row, cambios })})
      const j=await r.json(); if(j&&j.error){ showToast(j.error,'err'); setSaving(false); return }
      showToast(`#${num} · fechas actualizadas ✓`); onClose(); if(onRefresh) onRefresh()
    }catch(e){ showToast('Error de conexión','err'); setSaving(false) }
  }
  const inp={width:'100%', fontSize:15, fontFamily:MONO, color:T.ink, border:`1px solid ${T.border}`, borderRadius:10, padding:'10px 12px', outline:'none', boxSizing:'border-box'}
  const lbl={fontSize:11, textTransform:'uppercase', letterSpacing:0.4, color:T.ink3, fontWeight:600, marginBottom:6, display:'block'}
  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.35)', zIndex:900, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'60px 20px'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:420, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.15)'}}>
      <div style={{padding:'18px 22px', borderBottom:`1px solid ${T.border}`}}><div style={{fontSize:16, fontWeight:700, color:T.ink}}>Editar fechas</div><div style={{fontSize:12, color:T.ink3, marginTop:2, fontFamily:MONO}}>#{num} · {f['Proyecto']||f['Cliente']||''}</div></div>
      <div style={{padding:'20px 22px'}}>
        <div style={{marginBottom:16}}>
          <label style={lbl}>Fecha enviada (cuándo salió la factura)</label>
          <input value={env} onChange={e=>setEnv(e.target.value)} placeholder="DD/MM/AAAA" style={inp}/>
        </div>
        <div>
          <label style={lbl}>Fecha cobro (cuándo la pagaron)</label>
          <input value={cob} onChange={e=>setCob(e.target.value)} placeholder="DD/MM/AAAA" style={inp}/>
        </div>
        <div style={{fontSize:12, color:dias!=null?(dias<=30?T.pos:T.brand):T.ink3, marginTop:12, fontWeight:dias!=null?600:400}}>
          {dias!=null ? `Tardó ${dias} días en cobrarse ${dias<=30?'· a tiempo ✓':'· pasó los 30 días'}` : 'Cargá las dos fechas para ver los días de cobro.'}
        </div>
      </div>
      <div style={{display:'flex', gap:10, padding:'0 22px 20px'}}>
        <button onClick={onClose} style={{...miniBtn, flex:1, padding:'11px'}}>Cancelar</button>
        <button onClick={guardar} disabled={saving} style={{...miniBtn, flex:2, padding:'11px', background:T.brand, color:'#fff', border:'none', opacity:saving?0.6:1}}>{saving?'Guardando…':'Guardar'}</button>
      </div>
    </div>
  </div>
}

function CobroModal({f, hermanas=[], cuentas, onClose, onRefresh, showToast}){
  const total=parseMonto(f['Precio FINAL'])
  const netoF=parseMonto(f['Precio SIN IVA']), ivaF=parseMonto(f['IVA'])   // el total ya es CON IVA; el desglose es para cruzar con el banco
  const cuentaOpts=[...new Set((cuentas||[]).map(c=>c['Nombre']).filter(Boolean))]
  const [cuenta,setCuenta]=useState(cuentaOpts[0]||'')
  const [forma,setForma]=useState('Transferencia')
  const [reservarIVA,setReservarIVA]=useState(String(f['Tipo de Factura']||'').toUpperCase()==='A')
  const [historico,setHistorico]=useState(false)  // ya cobrada hace tiempo: marcar sin tocar saldo
  const [parcial,setParcial]=useState(false)  // cobro parcial: registra parte y deja la factura pendiente por el resto
  const [montoCobrado,setMontoCobrado]=useState(String(Math.round(total)))  // lo que REALMENTE entró (editable)
  const [saving,setSaving]=useState(false)
  const num=f['N° Presupuesto']
  const real=Math.round(parseFloat(montoCobrado)||0)
  const dif=real-Math.round(total)
  // Factura que cubre varios trabajos (mismo N°): el cliente la paga con UNA transferencia, así que
  // se cobra entera de una vez. Cada trabajo queda cobrado por su saldo, en la misma cuenta y fecha.
  const [entera,setEntera]=useState(hermanas.length>0)
  const saldoDe=x=>Math.max(0, Math.round(parseMonto(x['Precio FINAL'])-parseMonto(x['Monto cobrado'])))
  const todas=[f,...hermanas], totalEntera=todas.reduce((a,x)=>a+saldoDe(x),0)
  async function cobrarEntera(){
    if(!historico && !cuenta){ showToast('Elegí en qué cuenta entra','err'); return }
    if(!window.confirm(`Marcar como COBRADA la factura ${f['Nro de Factura']||''} entera: ${todas.length} trabajos por ${fmt(totalEntera)}${historico?' (cobro histórico, no suma a ninguna cuenta)':` en ${cuenta}`}. ¿Confirmás?`)) return
    setSaving(true)
    const fecha=`${new Date().getDate()}/${new Date().getMonth()+1}/${new Date().getFullYear()}`
    let hechas=0
    for(const x of todas){
      try{ const r=await fetch('/api/factura-cobro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ nroPresupuesto:String(x['N° Presupuesto']), tipoCobro:'total', monto:saldoDe(x), cuentaDestino:historico?'':cuenta, formaPago:historico?'Histórico':forma, retGanancias:0, retIIBB:0, retIVA:0, comision:0, fechaCobro:fecha, reservarIVA:historico?false:reservarIVA, historico })})
        const j=await r.json()
        // 409 = ese trabajo ya quedó cobrado (un intento anterior que se cortó a la mitad): se saltea y sigue con los demás.
        if(j&&j.error&&r.status!==409){ showToast(`Se cobraron ${hechas} de ${todas.length} trabajos. Frenó en #${x['N° Presupuesto']}: ${j.error}. Volvé a tocar Confirmar: los ya cobrados se saltean.`,'err'); setSaving(false); if(onRefresh) onRefresh(); return }
        hechas++
      }catch(e){ showToast(`Se cobraron ${hechas} de ${todas.length} trabajos. Error de conexión en #${x['N° Presupuesto']}: volvé a intentar con los que faltan`,'err'); setSaving(false); if(onRefresh) onRefresh(); return }
    }
    showToast(`Factura ${f['Nro de Factura']||''} cobrada ✓ · ${todas.length} trabajos · ${fmt(totalEntera)}`); onClose(); if(onRefresh) onRefresh()
  }

  async function cobrar(){
    if(entera && hermanas.length) return cobrarEntera()
    if(!historico && !cuenta){ showToast('Elegí en qué cuenta entra','err'); return }
    if(real<=0){ showToast('Poné el monto cobrado','err'); return }
    const msg = parcial
      ? `Registrar COBRO PARCIAL de #${num} por ${fmt(real)}${historico?' (histórico)':` en ${cuenta}`}.\nLa factura queda PENDIENTE por el resto (${fmt(Math.round(total)-real)}). ¿Confirmás?`
      : historico
      ? `Marcar #${num} como COBRADA (cobro histórico) por ${fmt(real)}.\nNO suma saldo a ninguna cuenta ni reserva IVA — solo deja la factura como cobrada.\n\n¿Confirmás?`
      : `Marcar #${num} como COBRADA por ${fmt(real)} en ${cuenta}. Esto suma ese monto a la cuenta${reservarIVA?' y reserva el IVA':''}. ¿Confirmás?`
    if(!window.confirm(msg)) return
    setSaving(true)
    try{ const r=await fetch('/api/factura-cobro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ nroPresupuesto:String(num), tipoCobro:parcial?'parcial':'total', monto:real, cuentaDestino:historico?'':cuenta, formaPago:historico?'Histórico':forma, retGanancias:0, retIIBB:0, retIVA:0, comision:0, fechaCobro:`${new Date().getDate()}/${new Date().getMonth()+1}/${new Date().getFullYear()}`, reservarIVA:historico?false:reservarIVA, historico })})
      const j=await r.json(); if(j&&j.error){showToast(j.error,'err');setSaving(false);return}
      showToast(`#${num} ${parcial?`cobro parcial de ${fmt(real)} ✓ (queda ${fmt(Math.round(total)-real)})`:'cobrada ✓'}`); onClose(); if(onRefresh) onRefresh()
    }catch(e){ showToast('Error de conexión','err'); setSaving(false) }
  }

  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.35)', zIndex:900, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'60px 20px'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:440, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.15)'}}>
      <div style={{padding:'18px 22px', borderBottom:`1px solid ${T.border}`}}><div style={{fontSize:16, fontWeight:700, color:T.ink}}>Registrar cobro</div><div style={{fontSize:12, color:T.ink3, marginTop:2, fontFamily:MONO}}>#{num} · {f['Proyecto']||f['Cliente']||''}</div></div>
      <div style={{padding:'20px 22px'}}>
        {hermanas.length>0 && <label style={{display:'flex', gap:9, alignItems:'flex-start', fontSize:13, color:T.ink2, cursor:'pointer', background:entera?T.posSoft:T.surfaceAlt, border:`1px solid ${entera?T.pos:T.border}`, borderRadius:10, padding:'10px 12px', marginBottom:14}}>
          <input type="checkbox" checked={entera} onChange={e=>setEntera(e.target.checked)} style={{marginTop:2}}/>
          <span><strong style={{color:T.ink}}>Cobrar la factura entera</strong> — la {f['Nro de Factura']} cubre <strong>{todas.length} trabajos</strong> sin cobrar por {fmt(totalEntera)}. Destildá para cobrar solo este trabajo.</span>
        </label>}
        <div style={{textAlign:'center', marginBottom:18}}>
          <div style={{fontSize:11, textTransform:'uppercase', letterSpacing:0.4, color:T.ink3, fontWeight:600, marginBottom:6}}>Monto cobrado (lo que realmente entró)</div>
          <input type="number" disabled={entera&&hermanas.length>0} value={entera&&hermanas.length>0?String(totalEntera):montoCobrado} onChange={e=>setMontoCobrado(e.target.value)} style={{width:'100%', textAlign:'center', fontSize:28, fontWeight:700, fontFamily:MONO, color:T.pos, border:`1px solid ${T.border}`, borderRadius:10, padding:'8px 6px', outline:'none'}}/>
          <div style={{fontSize:11, color:T.ink3, marginTop:5, display:(entera&&hermanas.length>0)?'none':'block'}}>Facturado: <b style={{color:T.ink}}>{fmt(total)}</b>{ivaF>0?` (neto ${fmt(netoF)} + IVA ${fmt(ivaF)})`:' (sin IVA)'}{dif!==0 && <span style={{color:dif>0?T.pos:T.warn, fontWeight:600}}> · {dif>0?'+':''}{fmt(dif)} {dif<0?'(retenciones / cobraste menos)':'(cobraste más)'}</span>}</div>
        </div>
        <label style={{display:(entera&&hermanas.length>0)?'none':'flex', gap:9, alignItems:'flex-start', fontSize:13, color:T.ink2, cursor:'pointer', background:parcial?T.brandSoft:T.surfaceAlt, border:`1px solid ${parcial?T.brand:T.border}`, borderRadius:10, padding:'10px 12px', marginBottom:14}}>
          <input type="checkbox" checked={parcial} onChange={e=>setParcial(e.target.checked)} style={{marginTop:2}}/>
          <span><strong style={{color:T.ink}}>Cobro parcial (adelanto)</strong> — cobraste solo una parte. La factura <strong>queda pendiente</strong> por el resto (no la da por cobrada del todo).{parcial && real>0 && real<Math.round(total) && <span style={{display:'block', marginTop:3, color:T.brand, fontWeight:600}}>Queda pendiente: {fmt(Math.round(total)-real)}</span>}</span>
        </label>
        <label style={{display:'flex', gap:9, alignItems:'flex-start', fontSize:13, color:T.ink2, cursor:'pointer', background:historico?T.warnSoft:T.surfaceAlt, border:`1px solid ${historico?T.warn:T.border}`, borderRadius:10, padding:'10px 12px', marginBottom:14}}>
          <input type="checkbox" checked={historico} onChange={e=>setHistorico(e.target.checked)} style={{marginTop:2}}/>
          <span><strong style={{color:T.ink}}>Cobro histórico</strong> — ya la cobraste hace tiempo. Solo la marca como cobrada, <strong>no suma a ninguna cuenta</strong> ni reserva IVA. (Para reconciliar facturas viejas.)</span>
        </label>
        {!historico && <>
        <label style={lblV2}>Entra en la cuenta</label>
        <select value={cuenta} onChange={e=>setCuenta(e.target.value)} style={{...inpV2, marginBottom:13}}>{cuentaOpts.length===0&&<option value="">Sin cuentas</option>}{cuentaOpts.map(c=><option key={c} value={c}>{c}</option>)}</select>
        <label style={lblV2}>Forma de pago</label>
        <select value={forma} onChange={e=>setForma(e.target.value)} style={{...inpV2, marginBottom:13}}>{['Transferencia','eCheq','Efectivo'].map(x=><option key={x} value={x}>{x}</option>)}</select>
        <label style={{display:'flex', gap:9, alignItems:'center', fontSize:13, color:T.ink2, cursor:'pointer'}}><input type="checkbox" checked={reservarIVA} onChange={e=>setReservarIVA(e.target.checked)}/> Reservar IVA (factura A)</label>
        </>}
      </div>
      <div style={{padding:'16px 22px', borderTop:`1px solid ${T.border}`, display:'flex', gap:10, justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{padding:'9px 18px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:500, cursor:'pointer'}}>Cancelar</button>
        <button onClick={cobrar} disabled={saving} style={{padding:'9px 20px', borderRadius:9, border:'none', background:T.pos, color:'#fff', fontSize:13, fontWeight:600, cursor:saving?'default':'pointer', opacity:saving?0.6:1}}>{saving?'Registrando…':'Confirmar cobro'}</button>
      </div>
    </div>
  </div>
}

// ============================ PAGOS STAFF ============================
function PagosStaff({data, onRefresh, showToast, nav, clearNav}){
  const proyectos=data.proyectos||[], rrhh=data.rrhh||[], pagosPersistidos=data.pagosStaff||[]
  const now=new Date()
  const prevMes=new Date(now.getFullYear(), now.getMonth()-1, 1)  // el 15 se paga el mes anterior
  const [mesIdx,setMesIdx]=useState(prevMes.getMonth()+1)  // 1-12
  const [anio,setAnio]=useState(prevMes.getFullYear())
  const cuentaOpts=[...new Set((data.cuentas||[]).filter(c=>{const a=String(c['Activa']||'').toUpperCase();return a==='SÍ'||a==='SI'||a==='TRUE'||c['Activa']===true}).map(c=>c['Nombre']).filter(Boolean))]
  const [q,setQ]=useState(''), [filtro,setFiltro]=useState('todos'), [open,setOpen]=useState(null), [override,setOverride]=useState({}), [freelEdit,setFreelEdit]=useState(null), [mailModal,setMailModal]=useState(null)
  const [cuentaPago,setCuentaPago]=useState(()=>cuentaOpts.find(c=>/bbva|somos magma/i.test(c))||cuentaOpts[0]||'')
  const [staffModalPS,setStaffModalPS]=useState(null)
  const [selPay,setSelPay]=useState({})  // key -> {persona, t} : selección para pagar en tanda
  const [ivaPersona,setIvaPersona]=useState({})  // nombre -> true : pagar +21% IVA (puntual, para RI que factura con IVA)
  // Viáticos por trabajo: lo recién guardado (hasta que vuelve el refresh) y lo que se está tipeando.
  const [viatLocal,setViatLocal]=useState({}), [viatDraft,setViatDraft]=useState({})
  const viatEnVuelo=useRef(new Set())  // guardados en curso: pagar espera a que terminen (si no, se pagaría sin el viático recién cargado)
  const conIvaDe=persona=>!!ivaPersona[persona.nombre]
  const [respuestas,setRespuestas]=useState(null), [loadingResp,setLoadingResp]=useState(false), [resumenResp,setResumenResp]=useState(null)
  const [savingAdj,setSavingAdj]=useState({}), [savedAdj,setSavedAdj]=useState({})
  async function cargarRespuestas(){ setLoadingResp(true)
    try{ const r=await fetch('/api/pagos-staff-respuestas'); const j=await r.json(); setRespuestas(j&&j.ok?(j.respuestas||[]):[]); setResumenResp(j&&j.ok?j.resumen:null) }
    catch(e){ setRespuestas([]) } setLoadingResp(false) }
  // Agarra la factura adjunta del mail y la guarda en Drive + la linkea al pago (mismo destino que "Subir factura")
  async function guardarAdjunto(m){ const p=lista.find(x=>norm(x.nombre)===norm(m.nombre)); const nros=p?p.trabajos.map(t=>t.nro):[]
    setSavingAdj(s=>({...s,[m.uid]:true}))
    try{ const r=await fetch('/api/pago-staff-guardar-adjunto',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:m.uid, persona:p?p.nombre:m.nombre, mes:mesLabel, nros})})
      const j=await r.json(); if(j&&j.error){ showToast(j.error,'err'); setSavingAdj(s=>{const n={...s};delete n[m.uid];return n}); return }
      setSavedAdj(s=>({...s,[m.uid]:j.link})); showToast(`Factura guardada en Drive ✓${j.filas?` · linkeada a ${p?p.nombre:m.nombre}`:''}`); if(onRefresh) onRefresh()
    }catch(e){ showToast('Error de conexión','err') } setSavingAdj(s=>{const n={...s};delete n[m.uid];return n}) }
  useEffect(()=>{ if(nav?.mod==='pagos'&&nav.q){ setQ(nav.q); setFiltro('todos'); clearNav&&clearNav() } /* eslint-disable-next-line */ },[nav])
  useEffect(()=>{ setSelPay({}) },[mesIdx,anio])  // cambiar de mes limpia la selección
  useEffect(()=>{ cargarRespuestas() /* eslint-disable-next-line */ },[])  // respuestas de freelancers al abrir el módulo

  // proyectos del mes/año por Fecha Evento
  const proyMes=proyectos.filter(p=>esDelMes(p['Fecha Evento'], mesIdx, anio))
  // formato real de la columna "Mes Referencia" del sheet: "06 - junio"
  const mesLabel=`${String(mesIdx).padStart(2,'0')} - ${MESES_LARGO[mesIdx-1].toLowerCase()}`
  const norm=s=>String(s||'').toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").trim()

  // detectar pagado — columnas REALES: Freelancer / N° Presupuesto / Estado (Pagado|SÍ) / Monto Pagado
  const isPagado=(persona,t)=>pagosPersistidos.some(r=>{
    const fre=norm(r['Freelancer']||r['Persona']||r['Nombre']||r['Staff'])
    if(fre!==norm(persona)) return false
    const est=String(r['Estado']||r['Pagado']||'').toUpperCase()
    const pagado=['PAGADO','SÍ','SI','TRUE'].includes(est)||parseMonto(r['Monto Pagado'])>0
    if(!pagado) return false
    const rnro=String(r['N° Presupuesto']||r['N° Proyecto']||r['Nro']||'').trim()
    const tnro=String(t.nro).trim()
    if(rnro&&tnro){
      if(rnro!==tnro) return false
      // mismo proyecto: si ambos tienen servicio, exigir que coincida (pago por trabajo, no por proyecto)
      const rsvc=norm(r['Servicio']), tsvc=norm(t.pedido)
      if(rsvc&&tsvc) return rsvc===tsvc
      return true
    }
    return norm(r['Proyecto'])===norm(t.proyecto)  // fallback: filas migradas sin N°
  })

  // agrupar por persona
  const personas={}
  proyMes.forEach(proy=>{
    const nro=proy['N° presupuesto']||'', proyecto=proy['Proyecto']||proy['Cliente']||'', cliente=proy['Cliente']||'', agencia=proy['Agencia']||'', fechaProy=proy['Fecha Evento']||''
    // En un trabajo de varias fechas cada línea de staff tiene SU día (col "Fechas Staff": "1:08/09/2026|2:09/09/2026").
    const diaDeSlot={}; String(proy['Fechas Staff']||'').split('|').forEach(x=>{ const [k,...v]=x.split(':'); if(k&&v.length) diaDeSlot[k.trim()]=v.join(':').trim() })
    for(let j=1;j<=MAX_SLOTS;j++){ const fechaEvento=diaDeSlot[String(j)]||fechaProy; const pedido=proy['Pedido '+j]||(j===1?proy['Pedido']:'')||''; const precio=parseMonto(proy['Precio '+j]||(j===1?proy['Precio']:'')); const staffRaw=String(proy['Staff '+j]||(j===1?proy['Staff']:'')||'').trim()
      if(!staffRaw||staffRaw==='Somos Magma'||!pedido||precio<=0) continue
      const staff=canonStaff(staffRaw), gk=canonKey(staff)
      if(!personas[gk]) personas[gk]={nombre:staff, trabajos:[], total:0, totalPagado:0, totalPendiente:0, viaticos:0, pendFee:0, pendViat:0}
      personas[gk].trabajos.push({nro,proyecto,cliente,agencia,pedido,precio,fechaEvento, key:nro+'|'+pedido+'|'+j})
      personas[gk].total+=precio
    }
  })
  // Horas extra cargadas desde Edición (solapa HORAS_EXTRA): una línea por carga, en
  // el mes de la fecha, valorizada con "Tarifa hora extra" de RRHH. Entran aunque el
  // staff del proyecto diga "Somos Magma": la persona las hizo y se le pagan (Juan,
  // 14/9/2026: "tiene que aparecer en Pagos Staff, así en octubre le pagamos").
  // Sin tarifa la línea aparece igual, en $0 y avisando: mejor verla que olvidarla.
  const mesHX=`${anio}-${String(mesIdx).padStart(2,'0')}`
  const tarifaHoraDe=nombre=>{ const r=rrhh.find(x=>canonKey(canonStaff(x['Nombre Apellido']||x['Nombre']))===canonKey(nombre)); return parseMonto(r?.['Tarifa hora extra']) }
  ;(data.horasExtra||[]).forEach(h=>{
    if(String(h.Mes||'').trim()!==mesHX) return
    const staff=canonStaff(h.Persona), gk=canonKey(staff); if(!staff||esMagma(staff)) return
    const horas=parseFloat(String(h.Horas||'').replace(',','.'))||0; if(horas<=0) return
    const tarifa=tarifaHoraDe(staff), precio=Math.round(horas*tarifa)
    if(!personas[gk]) personas[gk]={nombre:staff, trabajos:[], total:0, totalPagado:0, totalPendiente:0, viaticos:0, pendFee:0, pendViat:0}
    const nro=String(h['N° presupuesto']||'').trim(), hs=String(horas).replace('.',','), proyHX=proyectos.find(p=>String(p['N° presupuesto']||'').trim()===nro)
    personas[gk].trabajos.push({ nro, proyecto:h.Proyecto||h.Cliente||'', cliente:proyHX?.['Cliente']||h.Cliente||'', agencia:proyHX?.['Agencia']||'', fechaEvento:h.Fecha||'',
      pedido:`⏱ Horas extra ${h.Fecha||''} · ${hs} hs${h.Motivo?` · ${h.Motivo}`:''}${tarifa?'':' · SIN TARIFA en RRHH'}`,
      precio, key:'hx|'+nro+'|'+(h.Fecha||'')+'|'+(h.__row||''), horasExtra:horas })
    personas[gk].total+=precio
  })
  // Monotributo que Magma paga por acuerdo (solapa ACUERDOS, columna "Monotributo"): una línea por mes mientras el
  // acuerdo rige, para pagarlo junto con el mínimo y que quede en Pagos Staff. No tiene N° de trabajo: la llave
  // del pago es persona + mes + servicio "🧾 Monotributo" (Juan, 5/10/2026: "poné el monotributo en Pagos Staff").
  monotributosDelMes(data.acuerdos, mesIdx, anio).forEach(m=>{
    const staff=canonStaff(m.persona), gk=canonKey(staff)
    if(!personas[gk]) personas[gk]={nombre:staff, trabajos:[], total:0, totalPagado:0, totalPendiente:0, viaticos:0, pendFee:0, pendViat:0}
    personas[gk].trabajos.push({ nro:'', proyecto:`Monotributo ${MESES_LARGO[mesIdx-1].toLowerCase()} (acuerdo)`, cliente:'', agencia:'', fechaEvento:'', pedido:'🧾 Monotributo', precio:m.monto, key:'mono|'+gk+'|'+mesHX, monotributo:true })
    personas[gk].total+=m.monto
  })
  // Contar filas PAGADAS por (freelancer|N°|servicio) para manejar trabajos idénticos repetidos
  const esPagRow=r=>{ const e=String(r['Estado']||r['Pagado']||'').toUpperCase(); return ['PAGADO','SÍ','SI','TRUE'].includes(e)||parseMonto(r['Monto Pagado'])>0 }
  // Clave INCLUYE el mes de referencia: un pago de mayo no debe marcar como pagado un trabajo de junio.
  // (Antes ignoraba el mes → mostraba pagado pero el botón desmarcar, que sí filtra por mes, no lo encontraba.)
  const paidCount={}
  const keyDe=r=>canonKey(canonStaff(r['Freelancer']||r['Persona']||r['Nombre']))+'|'+norm(r['Mes Referencia']||r['Mes'])+'|'+String(r['N° Presupuesto']||r['N° Proyecto']||'').trim()+'|'+norm(r['Servicio'])
  pagosPersistidos.forEach(r=>{ if(!esPagRow(r)) return; const k=keyDe(r); paidCount[k]=(paidCount[k]||0)+1 })
  // Viáticos: viven en la columna "Viáticos" de PAGOS_STAFF, con la misma llave que el pago.
  // Si hay dos filas iguales (dos motions idénticos) se reparten en orden, igual que paidCount.
  const viatByKey={}
  pagosPersistidos.forEach(r=>{ const k=keyDe(r); (viatByKey[k]=viatByKey[k]||[]).push(parseMonto(r['Viáticos']||r['Viaticos'])) })
  Object.values(personas).forEach(p=>{ const used={}, usedV={}; p.trabajos.forEach(t=>{
    let pag
    const k=canonKey(p.nombre)+'|'+norm(mesLabel)+'|'+String(t.nro).trim()+'|'+norm(t.pedido)
    if(t.key in override) pag=override[t.key]
    else { const cnt=paidCount[k]||0, u=used[k]||0; pag=u<cnt; if(pag) used[k]=u+1 }
    const uv=usedV[k]||0; usedV[k]=uv+1
    t.viaticos=(t.key in viatLocal)?viatLocal[t.key]:((viatByKey[k]||[])[uv]||0)
    t.aPagar=t.precio+t.viaticos   // lo que se le paga por este trabajo (sin IVA): honorario + viáticos
    t.pagado=pag; p.total+=t.viaticos; p.viaticos+=t.viaticos
    if(pag) p.totalPagado+=t.aPagar; else { p.totalPendiente+=t.aPagar; p.pendFee+=t.precio; p.pendViat+=t.viaticos }
  }) })

  let lista=Object.values(personas).sort((a,b)=>b.total-a.total)
  lista=lista.filter(p=>{ const mq=!q||norm(p.nombre).includes(norm(q)); const mf=filtro==='todos'||(filtro==='pend'&&p.totalPendiente>0)||(filtro==='pag'&&p.totalPendiente===0); return mq&&mf })

  const totalPend=Object.values(personas).reduce((s,p)=>s+p.totalPendiente,0)
  const totalPag=Object.values(personas).reduce((s,p)=>s+p.totalPagado,0)
  const totalViatPend=Object.values(personas).reduce((s,p)=>s+p.pendViat,0)

  const rrhhByName={}; rrhh.forEach(r=>{ rrhhByName[String(r['Nombre Apellido']||r['Nombre']||'').trim()]=r })
  const proyByNum={}; proyectos.forEach(p=>{ proyByNum[String(p['N° presupuesto']||'').trim()]=p })
  const presuByNumPS={}; (data.presupuestos||[]).forEach(p=>{ presuByNumPS[String(p['Columna 1']||'').trim()]=p })
  const rrhhNames=[...new Set(rrhh.map(r=>r['Nombre Apellido']||r['Nombre']).filter(Boolean))].sort()
  const serviciosConocidos=[...new Set([...getSvcs(data).map(s=>s.n), ...(data.listado?.servicios||[])])].filter(Boolean).sort()

  const postPago=(persona,t,pagado)=>{
    const conIva = pagado && conIvaDe(persona)
    const viat = t.viaticos||0
    // El IVA va sobre el honorario; los viáticos se suman tal cual (reintegro de gastos, sin IVA).
    const montoPagar = (conIva ? Math.round(t.precio*1.21) : t.precio) + viat
    const obs = conIva ? `Pago con IVA 21% · neto ${fmt(t.precio)} + IVA ${fmt(Math.round(t.precio*0.21))}${viat?` + viáticos ${fmt(viat)}`:''}` : undefined
    return fetch('/api/pago-staff-toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ mes:mesLabel, persona:persona.nombre, nroProyecto:t.nro, proyecto:t.proyecto, pedido:t.pedido, monto:montoPagar, montoAdeudado:t.precio, viaticos:viat, fechaEvento:t.fechaEvento, agencia:t.agencia, pagado, cuenta:pagado?cuentaPago:'', observacion:obs })}).then(r=>r.json().catch(()=>({})))
  }
  // Viáticos de un trabajo: se guardan al salir del campo (o Enter), en PAGOS_STAFF, esté pagado o no.
  async function guardarViaticos(persona,t,raw){
    const v=Math.max(0, Math.round(parseMontoAR(raw)))
    setViatDraft(d=>{ const n={...d}; delete n[t.key]; return n })
    if(v===(t.viaticos||0)) return
    setViatLocal(o=>({...o,[t.key]:v}))
    const req=(async()=>{
      try{ const r=await fetch('/api/pago-staff-viaticos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ mes:mesLabel, persona:persona.nombre, nroProyecto:t.nro, proyecto:t.proyecto, pedido:t.pedido, montoAdeudado:t.precio, viaticos:v })})
        const j=await r.json().catch(()=>({})); if(j&&j.error){ showToast(j.error,'err'); setViatLocal(o=>{ const n={...o}; delete n[t.key]; return n }); return }
        showToast(v>0?`Viáticos ${fmt(v)} · ${persona.nombre.split(' ')[0]} · ${t.pedido||''}`:'Viáticos en 0')
        if(onRefresh){ await onRefresh(); setViatLocal(o=>{ const n={...o}; delete n[t.key]; return n }) }
      }catch(e){ showToast('Error de conexión','err'); setViatLocal(o=>{ const n={...o}; delete n[t.key]; return n }) }
    })()
    viatEnVuelo.current.add(req); req.finally(()=>viatEnVuelo.current.delete(req))
  }
  const esperarViaticos=()=>Promise.all([...viatEnVuelo.current])

  async function togglePago(persona, t, pagado){
    const k=t.key
    // Volver atrás un pago: pedir confirmación (devuelve la plata a la cuenta).
    if(!pagado){ if(!window.confirm(`¿Volver atrás el pago de "${t.pedido||'este trabajo'}" de ${persona.nombre.split(' ')[0]} por ${fmt(t.aPagar)}?\n\nVuelve a PENDIENTE y devuelve la plata a la cuenta. ¿Seguro?`)) return }
    else await esperarViaticos()
    setOverride(o=>({...o,[k]:pagado}))  // optimista: se tilda al instante
    try{ const j=await postPago(persona,t,pagado); if(j&&j.error){showToast(j.error,'err'); setOverride(o=>{const n={...o};delete n[k];return n}); return}
      showToast(pagado?`Pagado: ${t.pedido||''}`:'Desmarcado')
      if(onRefresh){ await onRefresh(); setOverride(o=>{const n={...o};delete n[k];return n}) }
    }catch(e){ showToast('Error de conexión','err'); setOverride(o=>{const n={...o};delete n[k];return n}) }
  }

  async function pagarTodo(persona){
    const pend=persona.trabajos.filter(t=>!t.pagado)
    if(!pend.length) return
    const nombre=persona.nombre.split(' ')[0]
    if(!cuentaPago){ showToast('Elegí desde qué cuenta pagás (arriba)','err'); return }
    await esperarViaticos()
    const conIva=conIvaDe(persona), fee=persona.pendFee, viat=persona.pendViat
    const totalPagar=(conIva?Math.round(fee*1.21):fee)+viat
    const detalle=`${pend.length} trabajos: ${conIva?`neto ${fmt(fee)} + IVA 21%`:fmt(fee)}${viat?` + viáticos ${fmt(viat)}`:''}${(conIva||viat)?` = ${fmt(totalPagar)}`:''}`
    if(!window.confirm(`Pagar TODO lo de ${nombre} de ${MESES_LARGO[mesIdx-1]}:\n${detalle}\nDesde: ${cuentaPago}\n\n¿Confirmás?`)) return
    setOverride(o=>{const n={...o}; pend.forEach(t=>n[t.key]=true); return n})
    try{
      for(const t of pend){ const j=await postPago(persona,t,true); if(j&&j.error) showToast(`Error en ${t.pedido}: ${j.error}`,'err') }
      showToast(`${nombre}: ${pend.length} trabajos pagados`)
      if(onRefresh){ await onRefresh(); setOverride(o=>{const n={...o}; pend.forEach(t=>delete n[t.key]); return n}) }
    }catch(e){ showToast('Error de conexión','err') }
  }
  async function deshacerTodo(persona){
    const pagados=persona.trabajos.filter(t=>t.pagado)
    if(!pagados.length) return
    const nombre=persona.nombre.split(' ')[0]
    if(!window.confirm(`Volver atrás TODOS los pagos de ${nombre} de ${MESES_LARGO[mesIdx-1]}:\n${pagados.length} trabajos = ${fmt(persona.totalPagado)}\n\nVuelven a PENDIENTE y se devuelve la plata a la cuenta. ¿Seguro?`)) return
    setOverride(o=>{const n={...o}; pagados.forEach(t=>n[t.key]=false); return n})
    try{
      for(const t of pagados){ const j=await postPago(persona,t,false); if(j&&j.error) showToast(`Error en ${t.pedido}: ${j.error}`,'err') }
      showToast(`${nombre}: ${pagados.length} pagos deshechos`)
      if(onRefresh){ await onRefresh(); setOverride(o=>{const n={...o}; pagados.forEach(t=>delete n[t.key]); return n}) }
    }catch(e){ showToast('Error de conexión','err') }
  }
  const selList=Object.values(selPay)
  const selTotal=selList.reduce((s,x)=>s+(conIvaDe(x.persona)?Math.round(x.t.precio*1.21):x.t.precio)+(x.t.viaticos||0),0)
  const toggleSel=(persona,t)=>setSelPay(s=>{ const n={...s}; if(n[t.key]) delete n[t.key]; else n[t.key]={persona,t}; return n })
  async function pagarSeleccion(){
    if(!selList.length) return
    if(!cuentaPago){ showToast('Elegí desde qué cuenta pagás','err'); return }
    await esperarViaticos()
    if(!window.confirm(`Pagar ${selList.length} trabajos = ${fmt(selTotal)}\nDesde: ${cuentaPago}\n\n¿Confirmás?`)) return
    const keys=selList.map(x=>x.t.key)
    setOverride(o=>{const n={...o}; keys.forEach(k=>n[k]=true); return n})
    setSelPay({})
    try{
      for(const {persona,t} of selList){ const j=await postPago(persona,t,true); if(j&&j.error) showToast(`Error en ${t.pedido}: ${j.error}`,'err') }
      showToast(`${keys.length} trabajos pagados desde ${cuentaPago}`)
      if(onRefresh){ await onRefresh(); setOverride(o=>{const n={...o}; keys.forEach(k=>delete n[k]); return n}) }
    }catch(e){ showToast('Error de conexión','err') }
  }
  function mensajeDe(persona){
    const nombre=persona.nombre.split(' ')[0]
    const items=ordenCrono(persona.trabajos.filter(t=>!t.pagado)).map(renglonMailStaff).join('\n')
    const tot=persona.trabajos.filter(t=>!t.pagado).reduce((s,t)=>s+t.precio+(t.viaticos||0),0)
    return `Hola ${nombre}!\n\nTe paso el detalle de los trabajos de ${MESES_LARGO[mesIdx-1]} para que nos hagas factura:\n\n${items}\n\nTotal: ${fmt(tot)}\n\nCuando tengas la factura lista mandala a admin@somosmagma.com\n\n¡Gracias!`
  }
  function copiarDesc(persona){ navigator.clipboard?.writeText(mensajeDe(persona)); showToast('Mensaje copiado al portapapeles') }
  async function marcarMailEnviado(persona){
    try{ await fetch('/api/pago-staff-mail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({persona:persona.nombre, nros:persona.trabajos.map(t=>t.nro)})}); if(onRefresh) onRefresh() }catch(e){}
  }
  function subirFactura(persona){
    const input=document.createElement('input'); input.type='file'; input.accept='application/pdf,image/*'
    input.onchange=async()=>{ const file=input.files?.[0]; if(!file) return
      const fd=new FormData(); fd.append('file',file,file.name); fd.append('persona',persona.nombre); fd.append('mes',mesLabel); fd.append('nros',persona.trabajos.map(t=>t.nro).join(','))
      showToast('Subiendo factura…')
      try{ const r=await fetch('/api/pago-staff-factura',{method:'POST',body:fd}); const j=await r.json(); if(!j.ok){showToast(j.error||'Error','err');return} showToast('Factura guardada ✓'); if(onRefresh) onRefresh() }
      catch(e){ showToast('Error de conexión','err') }
    }
    input.click()
  }

  return <>
    <PageHead title="Pagos Staff" sub={`${MESES_LARGO[mesIdx-1]} ${anio} · ${lista.length} freelancers`}/>
    <div style={{display:'flex', gap:14, marginBottom:20}}>
      <Hero label="Pendiente de pago" value={fmt(totalPend)} accent={totalPend>0?T.brand:T.pos} sub={totalViatPend>0?`este mes · incl. ${fmt(totalViatPend)} de viáticos`:'este mes'}/>
      <Hero label="Ya pagado" value={fmt(totalPag)} sub="este mes" subStrong="" />
    </div>
    {/* Respuestas de freelancers a los mails de pago (lee la casilla admin@somosmagma.com) */}
    <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', marginBottom:14}}>
      <div style={{padding:'11px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:((resumenResp&&resumenResp.enviados>0)||(respuestas&&respuestas.length))?`1px solid ${T.border}`:'none'}}>
        <span style={{fontSize:13, fontWeight:700, color:T.ink}}>📨 Respuestas de freelancers{respuestas&&respuestas.length?` · ${respuestas.filter(m=>!m.leido).length} sin leer`:''}</span>
        <button onClick={cargarRespuestas} disabled={loadingResp} style={{fontSize:11.5, padding:'4px 10px', borderRadius:7, border:`1px solid ${T.border}`, background:T.surface, color:T.ink3, cursor:loadingResp?'default':'pointer'}}>{loadingResp?'Buscando…':'↻ Actualizar'}</button>
      </div>
      {resumenResp && resumenResp.enviados>0 && <div style={{padding:'8px 18px', fontSize:11.5, color:T.ink2, background:T.surfaceAlt, borderBottom:(respuestas&&respuestas.length)?`1px solid ${T.border}`:'none'}}><b style={{fontFamily:MONO}}>{resumenResp.enviados}</b> mails enviados · <b style={{color:T.pos}}>{resumenResp.respondieron}</b> respondieron · <b style={{color:T.warn}}>{resumenResp.sinResponder}</b> sin responder{resumenResp.sinGuardar>0?` · 📎 ${resumenResp.sinGuardar} sin guardar`:''}</div>}
      {respuestas && respuestas.length===0 && !loadingResp && <div style={{padding:'10px 18px', fontSize:12, color:T.ink3}}>Sin respuestas todavía. Cuando un freelancer conteste el mail de pago, aparece acá.</div>}
      {respuestas===null && loadingResp && <div style={{padding:'10px 18px', fontSize:12, color:T.ink3}}>Buscando respuestas en admin@somosmagma.com…</div>}
      {(respuestas||[]).map((m,i)=><div key={i} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 18px', borderTop:i?`1px solid ${T.border}`:'none'}}>
        <span style={{width:7, height:7, borderRadius:7, background:m.leido?'transparent':T.brand, flexShrink:0}}/>
        <span style={{flex:1, minWidth:0}}>
          <span style={{fontSize:13, color:T.ink, fontWeight:m.leido?500:700}}>{m.nombre}{m.adjunto && <span title="Adjuntó factura" style={{marginLeft:7}}>📎</span>}</span>
          <div style={{fontSize:11.5, color:T.ink3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{m.asunto}</div>
        </span>
        {m.adjunto && (savedAdj[m.uid]
          ? <a href={savedAdj[m.uid]} target="_blank" rel="noreferrer" style={{...miniBtn, color:T.pos, borderColor:T.pos, fontSize:11.5}}>📄 en Drive ✓</a>
          : <button onClick={()=>guardarAdjunto(m)} disabled={!!savingAdj[m.uid]} style={{...miniBtn, fontSize:11.5, cursor:savingAdj[m.uid]?'default':'pointer'}}>{savingAdj[m.uid]?'Guardando…':'⬇ Guardar en Drive'}</button>)}
        <a href={`https://mail.google.com/mail/u/0/#search/${encodeURIComponent('subject:('+m.asunto+')')}`} target="_blank" rel="noreferrer" title="Abrir en Gmail" style={{fontSize:12, color:T.ink3, textDecoration:'none', whiteSpace:'nowrap'}}>Gmail ↗</a>
        <span style={{fontSize:11, color:T.ink3, whiteSpace:'nowrap'}}>{m.fecha?new Date(m.fecha).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'}):''}</span>
      </div>)}
    </div>
    <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', marginBottom:14}}>
      <button onClick={()=>{ let m=mesIdx-1,a=anio; if(m<1){m=12;a--} setMesIdx(m);setAnio(a) }} style={navBtn}>←</button>
      <span style={{fontSize:13, fontWeight:600, color:T.ink, minWidth:120, textAlign:'center'}}>{MESES_LARGO[mesIdx-1]} {anio}</span>
      <button onClick={()=>{ let m=mesIdx+1,a=anio; if(m>12){m=1;a++} setMesIdx(m);setAnio(a) }} style={navBtn}>→</button>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar freelancer…" style={{flex:'1 1 200px', minWidth:160, padding:'9px 13px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13, outline:'none'}}/>
      {[['todos','Todos'],['pend','Pendientes'],['pag','Pagados']].map(([k,l])=><button key={k} onClick={()=>setFiltro(k)} style={{padding:'7px 13px', borderRadius:20, fontSize:12, fontWeight:500, cursor:'pointer', border:`1px solid ${filtro===k?T.ink:T.border}`, background:filtro===k?T.ink:T.surface, color:filtro===k?'#fff':T.ink2}}>{l}</button>)}
    </div>
    <div style={{display:'flex', gap:10, alignItems:'center', marginBottom:14}}>
      <span style={{fontSize:12.5, color:T.ink2, fontWeight:500}}>Pagás desde:</span>
      <select value={cuentaPago} onChange={e=>setCuentaPago(e.target.value)} style={{...selectStyle, minWidth:180}}>{cuentaOpts.length===0&&<option value="">Sin cuentas</option>}{cuentaOpts.map(c=><option key={c} value={c}>{c}</option>)}</select>
      <span style={{fontSize:11.5, color:T.ink3}}>queda registrado en cada pago</span>
    </div>

    {/* Cómo se repartió el mes que estás pagando. Sigue al selector de arriba. */}
    <RepartoStaff proyectos={proyectos} rrhh={rrhh} mes={mesIdx} anio={anio} onPersona={n=>setQ(n)}
      titulo={`Reparto de ${MESES_LARGO[mesIdx-1]}`}/>

    <div style={{display:'flex', flexDirection:'column', gap:10}}>
      {lista.length===0&&<Empty>Sin freelancers con trabajos este mes</Empty>}
      {lista.map((persona,i)=>{
        const abierto=open===persona.nombre, datos=rrhhByName[persona.nombre.trim()]||{}
        const estado = persona.totalPendiente===0 ? {c:T.pos,l:'Pagado'} : persona.totalPagado>0 ? {c:T.warn,l:'Parcial'} : {c:T.brand,l:'Pendiente'}
        const nrosP=new Set(persona.trabajos.map(t=>String(t.nro).trim()))
        let mailEnv=false, facturaURL=''
        pagosPersistidos.forEach(r=>{ if(norm(r['Freelancer'])===norm(persona.nombre)&&nrosP.has(String(r['N° Presupuesto']||'').trim())){ if(String(r['Mail Enviado']||'').trim())mailEnv=true; if(String(r['Factura']||'').trim())facturaURL=r['Factura'] } })
        return <div key={i} style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
          <div onClick={()=>setOpen(abierto?null:persona.nombre)} style={{display:'flex', alignItems:'center', gap:14, padding:'14px 18px', cursor:'pointer'}}>
            <span style={{width:7,height:7,borderRadius:7,background:estado.c, flexShrink:0}}/>
            <div style={{flex:1, minWidth:0}}><div style={{fontSize:14, fontWeight:600, color:T.ink, display:'flex', alignItems:'center', gap:7, flexWrap:'wrap'}}>{persona.nombre}{mailEnv&&<span style={{fontSize:10, fontWeight:600, color:T.pos, background:T.posSoft, padding:'1px 7px', borderRadius:10}}>✉ enviado</span>}{facturaURL&&<span style={{fontSize:10, fontWeight:600, color:T.pos, background:T.posSoft, padding:'1px 7px', borderRadius:10}}>📄 factura</span>}</div><div style={{fontSize:11.5, color:T.ink3}}>{persona.trabajos.length} trabajos · {estado.l}</div></div>
            <div style={{textAlign:'right'}}><div style={{fontSize:14, fontFamily:MONO, fontWeight:600, color:persona.totalPendiente>0?T.brand:T.ink2}}>{fmt(persona.totalPendiente)}</div><div style={{fontSize:11, color:T.ink3}}>de {fmt(persona.total)}{persona.viaticos>0&&<span style={{color:T.warn}}> · {fmt(persona.viaticos)} viáticos</span>}</div></div>
            <div style={{display:'flex', gap:7, alignItems:'center', flexShrink:0}}>
              {persona.totalPendiente>0
                ? <button onClick={e=>{e.stopPropagation();pagarTodo(persona)}} style={{padding:'8px 16px', borderRadius:9, border:'none', background:T.pos, color:'#fff', fontSize:12.5, fontWeight:600, cursor:'pointer'}}>{conIvaDe(persona)?'Pagar todo +IVA':'Pagar todo'}</button>
                : <span style={{padding:'8px 8px', fontSize:12, color:T.pos, fontWeight:600}}>✓ Pagado</span>}
              {persona.totalPagado>0 && <button onClick={e=>{e.stopPropagation();deshacerTodo(persona)}} title="Volver atrás todos los pagos de esta persona este mes" style={{padding:'8px 12px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:12, fontWeight:500, cursor:'pointer'}}>↩ Deshacer</button>}
            </div>
          </div>
          {abierto && <div style={{borderTop:`1px solid ${T.border}`, background:T.surfaceAlt, padding:'12px 18px 16px'}}>
            <div style={{display:'flex', gap:20, flexWrap:'wrap', alignItems:'flex-start', padding:'4px 0 12px', marginBottom:8, borderBottom:`1px solid ${T.border}`}}>
              {[['Rubro',datos['Rubro']],['Mail',datos['Mail']],['Tel',datos['Celular']],['DNI',datos['Dni']],['CUIT',datos['CUIT/CUIL']||datos['CUIT']],['Banco',datos['Banco']],['Alias',datos['Alias']],['CBU',datos['CBU']]].filter(x=>x[1]).map(([k,v])=><div key={k}><div style={{fontSize:9.5, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, fontWeight:600}}>{k}</div><div style={{fontSize:12, color:T.ink, fontFamily:MONO, marginTop:2}}>{v}</div></div>)}
              <div style={{flex:1}}/>
              <button onClick={()=>setFreelEdit({nombre:persona.nombre, datos})} style={{...miniBtn, alignSelf:'center'}}>{datos&&Object.keys(datos).length?'✎ Editar datos':'+ Completar datos'}</button>
            </div>
            {persona.totalPendiente>0 && <div style={{fontSize:11, color:T.ink3, marginBottom:6}}>Tildá los trabajos que vas a pagar (podés mezclar varias personas) y dale <strong style={{color:T.pos}}>Pagar seleccionados</strong> abajo. Cada tanda puede ir a una cuenta distinta.</div>}
            {ordenCrono(persona.trabajos).map((t,j)=>{ const seleccionado=!!selPay[t.key]; return (
              <div key={j} style={{display:'flex', alignItems:'center', gap:12, padding:'8px 0', opacity:t.pagado?0.55:1, background:seleccionado?T.posSoft:'transparent', borderRadius:seleccionado?7:0, margin:seleccionado?'0 -8px':0, paddingLeft:seleccionado?8:0, paddingRight:seleccionado?8:0}}>
                <input type="checkbox" checked={t.pagado||seleccionado} onChange={()=>{ if(t.pagado) togglePago(persona,t,false); else toggleSel(persona,t) }} style={{cursor:'pointer'}} title={t.pagado?'Pagado — destildá para desmarcar':'Tildá para incluir en el pago'}/>
                <div style={{flex:1, minWidth:0}}><span style={{fontSize:12.5, color:T.ink}}>{t.pedido}</span> <span style={{fontSize:11.5, color:T.ink3}}>· {t.proyecto} {t.fechaEvento?`· ${t.fechaEvento}`:''}</span>{t.pagado&&<span style={{fontSize:10.5, color:T.pos, marginLeft:6}}>✓ pagado</span>}{seleccionado&&!t.pagado&&<span style={{fontSize:10.5, color:T.pos, fontWeight:600, marginLeft:6}}>a pagar</span>}
                  {clienteAgenciaDe(t) && <div style={{fontSize:11.5, color:T.ink2, marginTop:1}}>{clienteAgenciaDe(t)}</div>}</div>
                {/* Viáticos: un campo en cada trabajo. Si se carga se suma al pago; vacío = 0. Pagado: solo se muestra. */}
                {t.pagado
                  ? (t.viaticos>0 ? <span style={{fontSize:11, color:T.ink3, fontFamily:MONO, whiteSpace:'nowrap'}}>viáticos {fmt(t.viaticos)}</span> : null)
                  : t.monotributo ? null : <label title="Viáticos de este trabajo: se suman al pago. Enter o clic afuera para guardar." style={{display:'flex', alignItems:'center', gap:5, fontSize:11, color:T.ink3, whiteSpace:'nowrap'}}>viáticos
                      <input value={viatDraft[t.key]!==undefined?viatDraft[t.key]:(t.viaticos?String(t.viaticos):'')} onChange={e=>setViatDraft(d=>({...d,[t.key]:e.target.value}))} onBlur={e=>guardarViaticos(persona,t,e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') e.currentTarget.blur() }} placeholder="0" inputMode="numeric" style={{width:76, padding:'4px 7px', borderRadius:6, border:`1px solid ${t.viaticos>0?T.warn:T.border}`, background:T.surface, color:T.ink, fontSize:12, fontFamily:MONO, textAlign:'right', outline:'none'}}/>
                    </label>}
                <span style={{fontSize:12.5, fontFamily:MONO, color:T.ink, whiteSpace:'nowrap'}}>{fmt(t.precio)}{t.viaticos>0&&<span style={{fontSize:11, color:T.warn}}> +{fmt(t.viaticos)}</span>}</span>
                <button onClick={()=>{ if(t.monotributo){ showToast('El monto del monotributo se cambia en la solapa ACUERDOS'); return } const proy=proyByNum[String(t.nro).trim()]; if(proy) setStaffModalPS({proy, presu:presuByNumPS[String(t.nro).trim()]}); else showToast('No encuentro el proyecto','err') }} title="Corregir montos o agregar líneas en el proyecto" style={{border:'none', background:'transparent', color:T.ink3, cursor:'pointer', fontSize:13, padding:'0 2px'}}>✎</button>
              </div>
            )})}
            {persona.totalPendiente>0 && <div style={{marginTop:10, padding:'9px 11px', borderRadius:8, background:conIvaDe(persona)?T.brandSoft:T.surface, border:`1px solid ${conIvaDe(persona)?T.brand+'40':T.border}`}}>
              <label style={{display:'flex', gap:8, alignItems:'center', fontSize:12.5, color:T.ink2, cursor:'pointer', fontWeight:600}}>
                <input type="checkbox" checked={conIvaDe(persona)} onChange={e=>setIvaPersona(s=>({...s,[persona.nombre]:e.target.checked}))}/>
                Pagar con IVA (+21%) <span style={{fontWeight:400, color:T.ink3}}>— si te factura como Responsable Inscripto</span>
              </label>
              {conIvaDe(persona) && <div style={{fontSize:12, color:T.ink2, marginTop:7, fontFamily:MONO}}>neto {fmt(persona.pendFee)} + IVA 21% {fmt(Math.round(persona.pendFee*0.21))}{persona.pendViat>0&&<> + viáticos {fmt(persona.pendViat)} (sin IVA)</>} = <b style={{color:T.brand}}>{fmt(Math.round(persona.pendFee*1.21)+persona.pendViat)}</b></div>}
            </div>}
            <div style={{display:'flex', justifyContent:'flex-end', gap:6, marginTop:10, flexWrap:'wrap'}}>
              <button onClick={()=>copiarDesc(persona)} style={miniBtn}>📋 Copiar mensaje</button>
              <button onClick={()=>setMailModal({persona, datos:rrhhByName[persona.nombre.trim()]||{}})} style={{...miniBtn, background:T.ink, color:'#fff', border:'none'}}>✉ Mandar mail</button>
              {facturaURL
                ? <a href={facturaURL} target="_blank" rel="noreferrer" style={{...miniBtn, color:T.pos, borderColor:T.pos}}>📄 Ver factura</a>
                : <button onClick={()=>subirFactura(persona)} style={miniBtn}>⬆ Subir factura</button>}
            </div>
          </div>}
        </div>
      })}
    </div>
    {freelEdit && <FreelancerModal nombre={freelEdit.nombre} datos={freelEdit.datos||{}} rubrosConocidos={[...new Set(rrhh.flatMap(r=>String(r['Rubro']||'').split(',').map(s=>s.trim())))].filter(Boolean)} onClose={()=>setFreelEdit(null)} onSaved={()=>{ setFreelEdit(null); if(onRefresh) onRefresh() }} showToast={showToast}/>}
    {mailModal && <MailStaffModal persona={mailModal.persona} datos={mailModal.datos} cuentas={data.cuentas||[]} mesNombre={MESES_LARGO[mesIdx-1]} onClose={()=>setMailModal(null)} onSent={()=>marcarMailEnviado(mailModal.persona)} showToast={showToast}/>}
    {staffModalPS && <div onClick={()=>setStaffModalPS(null)} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:900, display:'flex', justifyContent:'center', overflowY:'auto', padding:'40px 20px'}}>
      <div onClick={e=>e.stopPropagation()} style={{width:'100%', maxWidth:680, background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)', height:'fit-content', overflow:'hidden'}}>
        <div style={{padding:'16px 22px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div><div style={{fontSize:16, fontWeight:700, color:T.ink}}>Editar staff · #{staffModalPS.proy['N° presupuesto']}</div><div style={{fontSize:11.5, color:T.ink3, marginTop:2}}>Corregí montos o agregá líneas (horas extra, otro servicio…). Los viáticos van en el campo de cada trabajo.</div></div>
          <button onClick={()=>setStaffModalPS(null)} style={{border:'none', background:'transparent', fontSize:22, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
        </div>
        <StaffEditor p={staffModalPS.proy} num={staffModalPS.proy['N° presupuesto']} rrhhNames={rrhhNames} rrhh={rrhh} serviciosConocidos={serviciosConocidos} proyectos={proyectos} acuerdos={data.acuerdos||[]} disponibilidad={data.disponibilidad||[]} seguros={data.seguros||[]} presu={staffModalPS.presu} onRefresh={onRefresh} showToast={showToast} onClose={()=>setStaffModalPS(null)}/>
      </div>
    </div>}
    {selList.length>0 && <div style={{position:'fixed', left:0, right:0, bottom:0, zIndex:850, padding:'0 16px 14px', pointerEvents:'none'}}>
      <div style={{maxWidth:760, margin:'0 auto', background:T.ink, color:'#fff', borderRadius:14, padding:'12px 16px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', boxShadow:'0 -6px 30px rgba(0,0,0,0.25)', pointerEvents:'auto'}}>
        <div style={{fontSize:13.5}}><strong style={{fontSize:15}}>{selList.length}</strong> {selList.length===1?'trabajo':'trabajos'} · <span style={{fontFamily:MONO, fontWeight:600}}>{fmt(selTotal)}</span></div>
        <div style={{flex:1}}/>
        <span style={{fontSize:12, opacity:0.7}}>Desde:</span>
        <select value={cuentaPago} onChange={e=>setCuentaPago(e.target.value)} style={{padding:'8px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.1)', color:'#fff', fontSize:12.5, outline:'none'}}>{cuentaOpts.length===0&&<option value="">Sin cuentas</option>}{cuentaOpts.map(c=><option key={c} value={c} style={{color:T.ink}}>{c}</option>)}</select>
        <button onClick={()=>setSelPay({})} style={{padding:'8px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.25)', background:'transparent', color:'#fff', fontSize:12.5, fontWeight:500, cursor:'pointer'}}>Cancelar</button>
        <button onClick={pagarSeleccion} style={{padding:'9px 18px', borderRadius:8, border:'none', background:T.pos, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer'}}>Pagar seleccionados</button>
      </div>
    </div>}
  </>
}

// ============================ FREELANCERS ============================
// Unifica nombres de staff repetidos (misma persona, distintas grafías). Solo UI, no toca datos.
// canonStaff / canonKey viven en lib/staff.js — los usa también lib/jornadas.js.
function Freelancers({data, nav, clearNav, onRefresh, showToast}){
  const proyectos=data.proyectos||[], rrhh=data.rrhh||[], pagos=data.pagosStaff||[]
  const [q,setQ]=useState(''), [sel,setSel]=useState(null), [fAnio,setFAnio]=useState(''), [fMes,setFMes]=useState(''), [lAnio,setLAnio]=useState(''), [lMes,setLMes]=useState('')
  // Editar datos del freelancer acá mismo (antes solo se podía desde Pagos Staff)
  const [editando,setEditando]=useState(null)
  // Por defecto el panel muestra lo activo/reciente, no todo el histórico
  const [verTodos,setVerTodos]=useState(false)
  useEffect(()=>{ setVerTodos(false) },[sel])
  const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim()
  useEffect(()=>{ if(nav?.mod==='freelancers'&&nav.q){ setQ(nav.q); clearNav&&clearNav() } /* eslint-disable-next-line */ },[nav])

  // "Se le debe" se calcula IGUAL que en Pagos Staff (por persona+mes+N°+servicio),
  // para que coincida exacto y no se duplique con los pagos de años anteriores.
  const mesLab=fe=>{ const d=parseD(fe); return d?`${String(d.getMonth()+1).padStart(2,'0')} - ${MESES_LARGO[d.getMonth()].toLowerCase()}`:'' }
  const esPag=r=>{ const e=String(r['Estado']||'').toLowerCase().trim(); return ['pagado','sí','si','true'].includes(e)||parseMonto(r['Monto Pagado'])>0 }
  const paidCount={}, viatByKey={}, usedV={}
  const keyPS=r=>canonKey(canonStaff(r['Freelancer']||r['Persona']||r['Nombre']))+'|'+norm(r['Mes Referencia']||r['Mes'])+'|'+String(r['N° Presupuesto']||r['N° Proyecto']||'').trim()+'|'+norm(r['Servicio'])
  pagos.forEach(r=>{ const k=keyPS(r); (viatByKey[k]=viatByKey[k]||[]).push(parseMonto(r['Viáticos']||r['Viaticos'])); if(esPag(r)) paidCount[k]=(paidCount[k]||0)+1 })
  const stats={}, usedG={}
  proyectos.forEach(p=>{ for(let j=1;j<=MAX_SLOTS;j++){ const st=String(p['Staff '+j]||(j===1?p['Staff']:'')||'').trim(); const pr0=parseMonto(p['Precio '+j]||(j===1?p['Precio']:'')); const ped=p['Pedido '+j]||(j===1?p['Pedido']:'')||''
    if(!st||/somos magma|^magma$/i.test(st)||pr0<=0) continue
    const cn=canonStaff(st), k=canonKey(cn); if(!stats[k]) stats[k]={nombre:cn, trabajos:0, ganado:0, debe:0, items:[]}
    const pk=k+'|'+norm(mesLab(p['Fecha Evento']))+'|'+String(p['N° presupuesto']||'').trim()+'|'+norm(ped)
    // Los viáticos (columna de PAGOS_STAFF) van sumados al trabajo: también le salen a Magma.
    const uv=usedV[pk]||0; usedV[pk]=uv+1; const pr=pr0+((viatByKey[pk]||[])[uv]||0)
    stats[k].trabajos++; stats[k].ganado+=pr
    const cnt=paidCount[pk]||0, u=usedG[pk]||0; const pagado=u<cnt; if(pagado)usedG[pk]=u+1; else stats[k].debe+=pr
    const _d=parseD(p['Fecha Evento'])
    stats[k].items.push({fecha:p['Fecha Evento']||'', anio:_d?_d.getFullYear():'', mes:_d?_d.getMonth()+1:'', proy:p['Proyecto']||p['Cliente']||'—', ag:p['Agencia']||'', ped, monto:pr, pagado, nro:p['N° presupuesto']||''})
  }})
  // Años anteriores (HISTORICO 2023/2024/2025): ya saldados — suman a "total", NO a "se le debe"
  const addHist=(rows,anio)=>{ (rows||[]).forEach(p=>{ for(let j=1;j<=6;j++){ const st=String(p['Staff '+j]||'').trim(); const pr=parseMonto(p['Pago '+j]); if(!st||/somos magma|^magma$/i.test(st)||pr<=0) continue
    const cn=canonStaff(st), k=canonKey(cn); if(!stats[k]) stats[k]={nombre:cn, trabajos:0, ganado:0, debe:0, items:[]}
    stats[k].trabajos++; stats[k].ganado+=pr
    const _d=parseD(p['Fecha'])
    stats[k].items.push({fecha:p['Fecha']||`${anio}`, anio:_d?_d.getFullYear():Number(anio), mes:_d?_d.getMonth()+1:'', proy:p['Proyecto']||p['Cliente']||'—', ag:p['Agencia']||'', ped:'', monto:pr, pagado:true})
  }}) }
  addHist(data.historico2023,'2023'); addHist(data.historico2024,'2024'); addHist(data.historico2025,'2025')
  // RRHH (datos fiscales) + incluir roster que no tenga trabajos
  const rrhhByName={}; rrhh.forEach(r=>{ const n=String(r['Nombre Apellido']||r['Nombre']||'').trim(); if(n){ const cn=canonStaff(n), k=canonKey(cn); rrhhByName[k]=r; if(!stats[k]) stats[k]={nombre:cn, trabajos:0, ganado:0, debe:0, items:[]} } })

  // Vista por período (año/mes) a nivel de toda la lista
  const aniosAll=[...new Set(Object.values(stats).flatMap(p=>p.items.map(it=>it.anio)).filter(Boolean))].sort((a,b)=>b-a)
  const per=it=>(!lAnio||String(it.anio)===String(lAnio))&&(!lMes||String(it.mes)===String(lMes))
  const view=p=>{ const its=p.items.filter(per); const total=its.reduce((s,it)=>s+it.monto,0); const debe=its.filter(it=>!it.pagado).reduce((s,it)=>s+it.monto,0); return {trab:its.length, total, debe, prom:its.length?total/its.length:0} }
  const filtroActivo=!!(lAnio||lMes)
  const lista=Object.values(stats).map(p=>({...p, v:view(p)})).filter(p=>!filtroActivo||p.v.trab>0).sort((a,b)=>b.v.total-a.v.total)
  const filtrados=lista.filter(p=>!q||norm(p.nombre).includes(norm(q)))
  const selP = sel ? stats[canonKey(canonStaff(sel))] : null
  const datos = selP ? (rrhhByName[canonKey(canonStaff(selP.nombre))]||{}) : {}
  const pend = selP ? selP.debe : 0
  const totPeriodo=filtrados.reduce((s,p)=>s+p.v.total,0), trabPeriodo=filtrados.reduce((s,p)=>s+p.v.trab,0)
  const periodoLbl=(lMes?MESES_LARGO[lMes-1]+' ':'')+(lAnio||(filtroActivo?'':'histórico'))

  return <>
    <PageHead title="Freelancers" sub={`${filtrados.length} de ${lista.length}`}/>
    <div style={{display:'flex', gap:10, marginBottom:12, flexWrap:'wrap', alignItems:'center'}}>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar freelancer…" style={{flex:'1 1 240px', maxWidth:360, padding:'9px 13px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13, outline:'none'}}/>
      <select value={lAnio} onChange={e=>setLAnio(e.target.value)} style={selectStyle}><option value="">Todos los años</option>{aniosAll.map(a=><option key={a} value={a}>{a}</option>)}</select>
      <select value={lMes} onChange={e=>setLMes(e.target.value)} style={selectStyle}><option value="">Todo el año</option>{MESES_LARGO.map((m,i)=><option key={i} value={i+1}>{m}</option>)}</select>
    </div>
    <div style={{display:'flex', gap:24, flexWrap:'wrap', padding:'11px 18px', marginBottom:14, background:T.surfaceAlt, border:`1px solid ${T.border}`, borderRadius:10}}>
      <Mini label={`Freelancers · ${periodoLbl}`} val={filtrados.length}/>
      <Mini label="Total pagado a staff" val={fmtM(totPeriodo)}/>
      <Mini label="Trabajos" val={trabPeriodo}/>
      <Mini label="Promedio x trabajo" val={fmtM(trabPeriodo?totPeriodo/trabPeriodo:0)}/>
    </div>
    {/* Cómo viene repartido el mes. Si arriba filtraste un mes, el gráfico lo sigue;
        si no, muestra el mes en curso con su propio selector. Clic = abre su ficha. */}
    <RepartoStaff proyectos={proyectos} rrhh={rrhh} onPersona={n=>setSel(n)}
      mes={lMes?+lMes:undefined} anio={lAnio?+lAnio:undefined}
      titulo={lMes?`Reparto de ${MESES_LARGO[+lMes-1]}`:'Reparto del mes'}/>
    <div style={{display:'flex', gap:16, alignItems:'flex-start'}}>
      <div style={{flex:1, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
        <div style={{display:'grid', gridTemplateColumns:'1.5fr 55px 110px 105px 110px', padding:'11px 18px', borderBottom:`1px solid ${T.border}`, fontSize:10.5, fontWeight:600, letterSpacing:0.3, textTransform:'uppercase', color:T.ink3}}>
          <span>Nombre</span><span style={{textAlign:'right'}}>Trab.</span><span style={{textAlign:'right'}}>Total</span><span style={{textAlign:'right'}}>Prom.</span><span style={{textAlign:'right'}}>Se le debe</span>
        </div>
        {filtrados.length===0&&<Empty>Sin resultados</Empty>}
        {filtrados.slice(0,300).map((p,i)=>{ const d=p.v.debe; return (
          <div key={i} onClick={()=>setSel(p.nombre)} style={{display:'grid', gridTemplateColumns:'1.5fr 55px 110px 105px 110px', padding:'11px 18px', borderTop:`1px solid ${T.border}`, cursor:'pointer', alignItems:'center', fontSize:13, background:sel===p.nombre?T.surfaceAlt:'transparent'}}>
            <span style={{color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:8}}>{p.nombre}</span>
            <span style={{textAlign:'right', color:T.ink2, fontFamily:MONO, fontSize:12}}>{p.v.trab}</span>
            <span style={{textAlign:'right', color:T.ink, fontFamily:MONO, fontSize:12}}>{fmtM(p.v.total)}</span>
            <span style={{textAlign:'right', color:T.ink2, fontFamily:MONO, fontSize:12}}>{fmtM(p.v.prom)}</span>
            <span style={{textAlign:'right', color:d>0?T.brand:T.ink3, fontFamily:MONO, fontSize:12, fontWeight:d>0?600:400}}>{d>0?fmtM(d):'—'}</span>
          </div>
        )})}
      </div>
      {selP && <div style={{flex:'0 0 360px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', position:'sticky', top:0}}>
        <div style={{padding:'14px 18px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', gap:8}}>
          <span style={{fontSize:15, fontWeight:700, color:T.ink, flex:1, minWidth:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{selP.nombre}</span>
          <button onClick={()=>setEditando({nombre:selP.nombre, datos})} title="Editar datos" style={{border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:11.5, fontWeight:600, padding:'4px 10px', borderRadius:7, cursor:'pointer', whiteSpace:'nowrap'}}>Editar</button>
          <button onClick={()=>setSel(null)} title="Cerrar" style={{border:'none', background:'transparent', fontSize:20, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
        </div>
        <div style={{padding:'14px 18px'}}>
          <div style={{display:'flex', gap:18, flexWrap:'wrap', marginBottom:14}}>
            <Mini label="Trabajos" val={selP.trabajos}/>
            <Mini label="Total (le sale a Magma)" val={fmtM(selP.ganado)}/>
            <Mini label="Promedio x trabajo" val={fmtM(selP.trabajos?selP.ganado/selP.trabajos:0)}/>
            <Mini label="Se le debe" val={pend>0?fmtM(pend):'—'} color={pend>0?T.brand:T.pos}/>
          </div>
          {/* Rubro como etiquetas */}
          {datos['Rubro'] && <div style={{display:'flex', flexWrap:'wrap', gap:5, marginBottom:10}}>
            {String(datos['Rubro']).split(',').map(s=>s.trim()).filter(Boolean).map((r,i)=>(
              <span key={i} style={{padding:'3px 9px', borderRadius:20, background:T.brandSoft, color:T.brand, fontSize:11, fontWeight:600}}>{r}</span>
            ))}
          </div>}
          {/* Tarifas y estado — lo primero que se mira al armar un presupuesto */}
          {(datos['Tarifa media jornada']||datos['Tarifa jornada']||datos['Zona']||datos['Estado']) && (
            <div style={{display:'flex', gap:14, flexWrap:'wrap', padding:'9px 11px', marginBottom:10, background:T.surfaceAlt, borderRadius:9, border:`1px solid ${T.border}`}}>
              {datos['Tarifa media jornada'] && <div><div style={{fontSize:9.5, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, fontWeight:600}}>½ jornada</div><div style={{fontSize:13, fontFamily:MONO, color:T.ink, fontWeight:600}}>{fmt(parseMonto(datos['Tarifa media jornada']))}</div></div>}
              {datos['Tarifa jornada'] && <div><div style={{fontSize:9.5, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, fontWeight:600}}>Jornada</div><div style={{fontSize:13, fontFamily:MONO, color:T.ink, fontWeight:600}}>{fmt(parseMonto(datos['Tarifa jornada']))}</div></div>}
              {datos['Tarifa hora extra'] && <div><div style={{fontSize:9.5, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, fontWeight:600}}>Hora extra</div><div style={{fontSize:13, fontFamily:MONO, color:T.ink, fontWeight:600}}>{fmt(parseMonto(datos['Tarifa hora extra']))}</div></div>}
              {datos['Zona'] && <div><div style={{fontSize:9.5, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, fontWeight:600}}>Zona</div><div style={{fontSize:12.5, color:T.ink}}>{datos['Zona']}</div></div>}
              {datos['Estado'] && <div style={{marginLeft:'auto'}}><span style={{padding:'3px 9px', borderRadius:20, fontSize:10.5, fontWeight:600, background:/activo/i.test(datos['Estado'])?T.posSoft:/no llamar|inactivo/i.test(datos['Estado'])?T.brandSoft:T.warnSoft, color:/activo/i.test(datos['Estado'])?T.pos:/no llamar|inactivo/i.test(datos['Estado'])?T.brand:T.warn}}>{datos['Estado']}</span></div>}
            </div>
          )}
          {datos['Notas'] && <div style={{fontSize:12, color:T.ink2, background:T.warnSoft, borderRadius:8, padding:'8px 11px', marginBottom:10, lineHeight:1.45}}>{datos['Notas']}</div>}
          {/* Ficha completa: todo lo que hay cargado en RRHH */}
          {[['Mail',datos['Mail']],['Tel',datos['Celular']],['DNI',datos['Dni']],['Nacimiento',datos['Fecha de nac']||datos['Fecha de Nac']],['Nacionalidad',datos['Nacionalidad']],['CUIT',datos['CUIT/CUIL']||datos['CUIT']],['Banco',datos['Banco']],['Alias',datos['Alias']],['CBU',datos['CBU']]].filter(x=>x[1]).map(([k,v])=>(
            <div key={k} style={{display:'flex', justifyContent:'space-between', gap:8, padding:'4px 0', fontSize:12.5}}><span style={{color:T.ink3}}>{k}</span><span style={{color:T.ink, fontFamily:MONO, fontSize:11.5, textAlign:'right', wordBreak:'break-all'}}>{v}</span></div>
          ))}
          {/* Qué falta cargar — para que el registro se complete solo */}
          {(()=>{
            const falta=[['Mail',datos['Mail']],['Tel',datos['Celular']],['CUIT',datos['CUIT/CUIL']||datos['CUIT']],['CBU',datos['CBU']],['Rubro',datos['Rubro']]].filter(x=>!String(x[1]||'').trim()).map(x=>x[0])
            if(!Object.keys(datos).length) return <button onClick={()=>setEditando({nombre:selP.nombre, datos:{}})} style={{width:'100%', marginTop:6, padding:'8px', borderRadius:8, border:`1px solid ${T.warn}`, background:T.warnSoft, color:T.warn, fontSize:12, fontWeight:600, cursor:'pointer'}}>⚠ Sin ficha en RRHH — cargar datos</button>
            if(falta.length) return <button onClick={()=>setEditando({nombre:selP.nombre, datos})} style={{width:'100%', marginTop:8, padding:'7px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surfaceAlt, color:T.warn, fontSize:11.5, fontWeight:600, cursor:'pointer'}}>Falta cargar: {falta.join(' · ')}</button>
            return null
          })()}
          {(()=>{
            const anios=[...new Set(selP.items.map(it=>it.anio).filter(Boolean))].sort((a,b)=>b-a)
            const its=selP.items.filter(it=>(!fAnio||String(it.anio)===String(fAnio))&&(!fMes||String(it.mes)===String(fMes)))
            const totF=its.reduce((s,it)=>s+it.monto,0), debeF=its.filter(it=>!it.pagado).reduce((s,it)=>s+it.monto,0)
            // Ordenado por fecha (lo más nuevo arriba). Los históricos viejos traen solo el año.
            const ts=it=>{ const d=parseD(it.fecha); return d?d.getTime():(it.anio?new Date(Number(it.anio),0,1).getTime():0) }
            const ord=its.slice().sort((a,b)=>ts(b)-ts(a))
            // Por defecto: lo ACTIVO (lo que se le debe) + los últimos 5. El resto, con los
            // filtros de año/mes o "ver todos". Antes se listaba el histórico completo y era ilegible.
            const hayFiltro=!!(fAnio||fMes)
            const pendientes=ord.filter(it=>!it.pagado)
            const recientes=ord.filter(it=>it.pagado).slice(0,5)
            const resumen=[...pendientes,...recientes]
            const mostrar=(hayFiltro||verTodos)?ord:resumen
            const ocultos=ord.length-mostrar.length
            return <>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, margin:'16px 0 8px'}}>
                <span style={{fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3}}>{hayFiltro||verTodos?'Trabajos':'Activo y reciente'}</span>
                <div style={{display:'flex', gap:6}}>
                  <select value={fAnio} onChange={e=>setFAnio(e.target.value)} style={{...selectStyle, padding:'4px 8px', fontSize:11.5}}><option value="">Año</option>{anios.map(a=><option key={a} value={a}>{a}</option>)}</select>
                  <select value={fMes} onChange={e=>setFMes(e.target.value)} style={{...selectStyle, padding:'4px 8px', fontSize:11.5}}><option value="">Mes</option>{MESES_LARGO.map((m,i)=><option key={i} value={i+1}>{m}</option>)}</select>
                </div>
              </div>
              <div style={{display:'flex', justifyContent:'space-between', fontSize:11.5, color:T.ink2, marginBottom:4}}><span>{its.length} trabajo{its.length===1?'':'s'}</span><span style={{fontFamily:MONO}}>{fmtM(totF)}</span></div>
              {debeF>0 && <div style={{display:'flex', justifyContent:'space-between', fontSize:11.5, color:T.brand, fontWeight:600, marginBottom:6}}><span>Se le debe</span><span style={{fontFamily:MONO}}>{fmtM(debeF)}</span></div>}
              {mostrar.map((it,i)=>(
                <div key={i} style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8, padding:'5px 0', fontSize:12, borderTop:`1px solid ${T.border}`}}>
                  <span style={{flex:1, minWidth:0, color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{it.fecha?String(it.fecha).slice(0,10)+' · ':''}{it.ped||it.proy} <span style={{color:T.ink3}}>· {it.proy}</span></span>
                  <span style={{fontFamily:MONO, color:it.pagado?T.ink3:T.brand, fontWeight:it.pagado?400:600, flexShrink:0}} title={it.pagado?'pagado':'se le debe'}>{fmtM(it.monto)}{it.pagado?'':' •'}</span>
                </div>
              ))}
              {ocultos>0 && !hayFiltro && <button onClick={()=>setVerTodos(true)} style={{width:'100%', marginTop:8, padding:'7px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surfaceAlt, color:T.ink2, fontSize:11.5, cursor:'pointer'}}>Ver los {ocultos} trabajos anteriores</button>}
              {verTodos && !hayFiltro && <button onClick={()=>setVerTodos(false)} style={{width:'100%', marginTop:8, padding:'7px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surfaceAlt, color:T.ink3, fontSize:11.5, cursor:'pointer'}}>Ver menos</button>}
              {!its.length && <div style={{fontSize:11.5, color:T.ink3, padding:'8px 0'}}>Sin trabajos en ese período</div>}
            </>
          })()}
        </div>
      </div>}
    </div>
    {editando && <FreelancerModal
      nombre={editando.nombre}
      datos={editando.datos||{}}
      rubrosConocidos={[...new Set(rrhh.flatMap(r=>String(r['Rubro']||'').split(',').map(s=>s.trim())).filter(Boolean))]}
      showToast={showToast}
      onClose={()=>setEditando(null)}
      onSaved={()=>{ setEditando(null); onRefresh&&onRefresh() }}/>}
  </>
}

// ============================ CONTACTOS ============================
function Contactos({data, onRefresh, showToast, nav, clearNav}){
  const [rows,setRows]=useState(data.contactos||[])
  useEffect(()=>{ setRows(data.contactos||[]) },[data.contactos])
  const [q,setQ]=useState(''), [ag,setAg]=useState('todas'), [edit,setEdit]=useState(null), [form,setForm]=useState({})
  useEffect(()=>{ if(nav?.mod==='contactos'&&nav.q){ setQ(nav.q); setAg('todas'); clearNav&&clearNav() } /* eslint-disable-next-line */ },[nav])
  const agencias=[...new Set(rows.map(c=>c['Agencia']).filter(Boolean))].sort()
  const filtrados=rows.filter(c=>{
    const mq=!q||['Nombre','Mail','Agencia','Cargo','Teléfono','Cuit'].some(k=>normTxt(c[k]).includes(normTxt(q)))
    const ma=ag==='todas'||c['Agencia']===ag
    return mq&&ma
  })
  const empezar=c=>{ setEdit(c['Nombre']+'|'+(c['Agencia']||'')); setForm({nombre:c['Nombre']||'',mail:c['Mail']||'',agencia:c['Agencia']||'',cargo:c['Cargo']||'',telefono:c['Teléfono']||'',cuit:c['Cuit']||''}) }
  async function guardar(c){
    const cambios={}; ['nombre','mail','agencia','cargo','telefono','cuit'].forEach(k=>{ const orig={nombre:c['Nombre'],mail:c['Mail'],agencia:c['Agencia'],cargo:c['Cargo'],telefono:c['Teléfono'],cuit:c['Cuit']}; if((form[k]||'')!==(orig[k]||''))cambios[k]=form[k] })
    if(!Object.keys(cambios).length){ setEdit(null); return }
    try{ const r=await fetch('/api/contacto-editar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombreOriginal:c['Nombre'],agenciaOriginal:c['Agencia'],cambios})})
      const j=await r.json(); if(!j.ok){showToast(j.error||'Error','err');return}
      showToast('Contacto actualizado'); setEdit(null); if(onRefresh) onRefresh()
    }catch(e){ showToast('Error de conexión','err') }
  }
  return <>
    <PageHead title="Contactos" sub={`${filtrados.length} de ${rows.length}`}/>
    <div style={{display:'flex', gap:10, marginBottom:14, flexWrap:'wrap'}}>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar nombre, mail, agencia…" style={{flex:'1 1 240px', minWidth:190, padding:'9px 13px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13, outline:'none'}}/>
      <select value={ag} onChange={e=>setAg(e.target.value)} style={selectStyle}><option value="todas">Todas las agencias</option>{agencias.map(a=><option key={a} value={a}>{a}</option>)}</select>
    </div>
    <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
      <div style={{display:'grid', gridTemplateColumns:'1.3fr 1fr 1.4fr 1fr 90px', padding:'11px 18px', borderBottom:`1px solid ${T.border}`, fontSize:10.5, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase', color:T.ink3}}>
        <span>Nombre</span><span>Agencia</span><span>Mail</span><span>Teléfono</span><span/>
      </div>
      {filtrados.length===0&&<Empty>Sin resultados</Empty>}
      {filtrados.slice(0,300).map((c,i)=>{
        const editando=edit===(c['Nombre']+'|'+(c['Agencia']||''))
        if(editando) return <div key={i} style={{padding:'12px 18px', borderTop:`1px solid ${T.border}`, background:T.surfaceAlt}}>
          <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
            {[['nombre','Nombre'],['agencia','Agencia'],['mail','Mail'],['telefono','Teléfono'],['cargo','Cargo'],['cuit','CUIT']].map(([k,l])=>(
              <div key={k} style={{flex:'1 1 150px', minWidth:130}}><label style={lblV2}>{l}</label><input value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={inpV2}/></div>
            ))}
          </div>
          <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:10}}>
            <button onClick={()=>setEdit(null)} style={miniBtn}>Cancelar</button>
            <button onClick={()=>guardar(c)} style={{...miniBtn, background:T.pos, color:'#fff', border:'none'}}>✓ Guardar</button>
          </div>
        </div>
        return <div key={i} style={{display:'grid', gridTemplateColumns:'1.3fr 1fr 1.4fr 1fr 90px', padding:'11px 18px', borderTop:`1px solid ${T.border}`, alignItems:'center', fontSize:13}}>
          <span style={{color:T.ink, fontWeight:500}}>{c['Nombre']||'—'}{c['Cargo']?<span style={{color:T.ink3, fontWeight:400}}> · {c['Cargo']}</span>:''}</span>
          <span style={{color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:8}}>{c['Agencia']||'—'}</span>
          <span style={{color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:8}}>{c['Mail']||'—'}</span>
          <span style={{color:T.ink2, fontFamily:MONO, fontSize:12}}>{c['Teléfono']||'—'}</span>
          <button onClick={()=>empezar(c)} style={{...miniBtn, justifySelf:'end'}}>✎ Editar</button>
        </div>
      })}
    </div>
  </>
}

// ============================ AGENCIAS ============================
function Agencias({data, onRefresh, showToast, nav, clearNav}){
  const presus=data.presupuestos||[], fc=data.facturacion||[], contactos=data.contactos||[]
  const [rows,setRows]=useState(data.agencias||[])
  useEffect(()=>{ setRows(data.agencias||[]) },[data.agencias])
  const [q,setQ]=useState(''), [sel,setSel]=useState(null), [edit,setEdit]=useState(false), [form,setForm]=useState({})
  useEffect(()=>{ if(nav?.mod==='agencias'&&nav.q){ setQ(nav.q); clearNav&&clearNav() } /* eslint-disable-next-line */ },[nav])
  const stats=nombre=>{ const n=normTxt(nombre); const ps=presus.filter(p=>normTxt(p['Agencia'])===n); const fcs=fc.filter(f=>normTxt(f['Agencia'])===n); return {presus:ps.length, aprob:ps.filter(isAprobado).length, fact:fcs.length, cobrado:fcs.filter(isCobrada).reduce((s,f)=>s+parseMonto(f['Precio FINAL']),0), psList:ps} }
  const filtrados=rows.filter(a=>!q||normTxt(a['Nombre']).includes(normTxt(q))||normTxt(a['CUIT']).includes(normTxt(q)))
  const agSel = sel ? rows.find(a=>a['Nombre']===sel) : null
  const st = agSel ? stats(agSel['Nombre']) : null

  async function guardar(){
    try{ const r=await fetch('/api/agencia-upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:agSel['Nombre'], cuit:form.cuit, condIVA:form.condIVA, mailFact:form.mailFact, telefono:form.telefono, direccion:form.direccion, notas:form.notas, plazoPago:form.plazoPago, condicionCobro:form.condicionCobro})})
      const j=await r.json(); if(!j.ok){showToast(j.error||'Error','err');return}
      showToast('Agencia guardada'); setEdit(false); if(onRefresh) onRefresh()
    }catch(e){ showToast('Error de conexión','err') }
  }
  const abrir=a=>{ setSel(a['Nombre']); setEdit(false); setForm({cuit:a['CUIT']||'',condIVA:a['Condicion IVA']||'',mailFact:a['Mail facturacion']||'',plazoPago:a['Plazo de pago']||'',condicionCobro:a['Condición de cobro']||'',telefono:a['Telefono']||'',direccion:a['Direccion fiscal']||'',notas:a['Notas']||''}) }

  return <>
    <PageHead title="Agencias" sub={`${filtrados.length} de ${rows.length}`}/>
    <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar agencia o CUIT…" style={{width:'100%', maxWidth:360, padding:'9px 13px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13, outline:'none', marginBottom:14}}/>
    <div style={{display:'flex', gap:16, alignItems:'flex-start'}}>
      <div style={{flex:1, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
        <div style={{display:'grid', gridTemplateColumns:'1.5fr 70px 70px 110px 50px', padding:'11px 18px', borderBottom:`1px solid ${T.border}`, fontSize:10.5, fontWeight:600, letterSpacing:0.3, textTransform:'uppercase', color:T.ink3}}>
          <span>Nombre</span><span style={{textAlign:'right'}}>Presus</span><span style={{textAlign:'right'}}>Aprob</span><span style={{textAlign:'right'}}>Cobrado</span><span style={{textAlign:'center'}}>Datos</span>
        </div>
        {filtrados.map((a,i)=>{ const s=stats(a['Nombre']); const ok=a['CUIT']&&a['Condicion IVA']
          return <div key={i} onClick={()=>abrir(a)} style={{display:'grid', gridTemplateColumns:'1.5fr 70px 70px 110px 50px', padding:'11px 18px', borderTop:`1px solid ${T.border}`, cursor:'pointer', alignItems:'center', fontSize:13, background:sel===a['Nombre']?T.surfaceAlt:'transparent'}}>
            <span style={{color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:8}}>{a['Nombre']}</span>
            <span style={{textAlign:'right', color:T.ink2, fontFamily:MONO, fontSize:12}}>{s.presus}</span>
            <span style={{textAlign:'right', color:T.ink2, fontFamily:MONO, fontSize:12}}>{s.aprob}</span>
            <span style={{textAlign:'right', color:T.ink, fontFamily:MONO, fontSize:12}}>{fmtM(s.cobrado)}</span>
            <span style={{textAlign:'center', color:ok?T.pos:T.warn}}>{ok?'✓':'⚠'}</span>
          </div>
        })}
      </div>
      {agSel && <div style={{flex:'0 0 360px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', position:'sticky', top:0}}>
        <div style={{padding:'14px 18px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', gap:8}}>
          <span style={{fontSize:15, fontWeight:700, color:T.ink, flex:1, minWidth:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{agSel['Nombre']}</span>
          <button onClick={()=>edit?guardar():setEdit(true)} style={{...miniBtn, ...(edit?{background:T.pos,color:'#fff',border:'none'}:{})}}>{edit?'Guardar':'✎ Editar'}</button>
          <button onClick={()=>{setSel(null);setEdit(false)}} title="Cerrar" style={{border:'none', background:'transparent', fontSize:20, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
        </div>
        <div style={{padding:'14px 18px'}}>
          {edit ? <>
            {[['CUIT','cuit'],['Condición IVA','condIVA'],['Mail facturación','mailFact'],['Plazo de pago (días)','plazoPago'],['Teléfono','telefono'],['Dirección fiscal','direccion'],['Notas','notas']].map(([l,k])=>(
              <div key={k} style={{marginBottom:9}}><label style={lblV2}>{l}</label><input value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={inpV2}/></div>
            ))}
            {/* 🔒 Qué se le pide a esta agencia para aprobar un trabajo (lib/condicion-cobro.js). Vacío = Seña 30%. */}
            <div style={{marginBottom:9}}><label style={lblV2}>Condición de cobro</label>
              <select value={form.condicionCobro||''} onChange={e=>setForm(f=>({...f,condicionCobro:e.target.value}))} style={inpV2}>
                <option value="">Seña 30% (por defecto)</option>
                {CONDICIONES.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              <div style={{fontSize:11, color:T.ink3, marginTop:3}}>Seña 30% u OC: sin eso no se aprueba. OC después y Cuenta corriente: se aprueba sin pedir nada.</div>
            </div>
          </> : <>
            <div style={{display:'flex', gap:18, flexWrap:'wrap', marginBottom:14}}>
              <Mini label="Presupuestos" val={st.presus}/><Mini label="Aprobados" val={st.aprob}/><Mini label="Facturas" val={st.fact}/><Mini label="Cobrado" val={fmtM(st.cobrado)} color={T.pos}/>
            </div>
            {[['CUIT',agSel['CUIT']],['Cond. IVA',agSel['Condicion IVA']],['Mail',agSel['Mail facturacion']],['Paga a',agSel['Plazo de pago']?agSel['Plazo de pago']+' días':''],['Cobro',agSel['Condición de cobro']||'Seña 30% (por defecto)'],['Tel',agSel['Telefono']]].filter(x=>x[1]).map(([k,v])=>(
              <div key={k} style={{display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:12.5}}><span style={{color:T.ink3}}>{k}</span><span style={{color:T.ink}}>{v}</span></div>
            ))}
            <div style={{fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, margin:'14px 0 6px'}}>Últimos presupuestos</div>
            {st.psList.slice(-10).reverse().map((p,i)=>{ const si=estadoInfo(p['Estado']); return (
              <div key={i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, padding:'5px 0', fontSize:12, borderTop:`1px solid ${T.border}`}}>
                <span style={{width:6,height:6,borderRadius:6,background:si.c,flexShrink:0}} title={si.l}/>
                <span style={{flex:1, color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{p['Proyecto']||p['Cliente']||'—'}</span>
                <span style={{fontFamily:MONO, color:T.ink2}}>{fmtM(parseMonto(p['Precio Final']))}</span>
              </div>
            )})}
          </>}
        </div>
      </div>}
    </div>
  </>
}

// ============================ CLIENTES ============================
function Clientes({data, nav, clearNav}){
  const presus=data.presupuestos||[], fc=data.facturacion||[]
  const rows=data.clientes||[]
  const [q,setQ]=useState(''), [sel,setSel]=useState(null)
  useEffect(()=>{ if(nav?.mod==='clientes'&&nav.q){ setQ(nav.q); clearNav&&clearNav() } /* eslint-disable-next-line */ },[nav])
  const stats=nombre=>{ const n=normTxt(nombre); const ps=presus.filter(p=>normTxt(p['Cliente'])===n); const fcs=fc.filter(f=>normTxt(f['Cliente'])===n)
    const aprob=ps.filter(isAprobado).length
    const espera=ps.filter(p=>String(p['Estado']||'').toUpperCase()==='EN ESPERA').length
    const desaprob=ps.filter(p=>String(p['Estado']||'').toUpperCase()==='DESAPROBADO').length
    return {presus:ps.length, aprob, espera, desaprob, fact:fcs.length, cobrado:fcs.filter(isCobrada).reduce((s,f)=>s+parseMonto(f['Precio FINAL']),0), psList:ps} }
  const filtrados=rows.filter(c=>!q||normTxt(c['Nombre']).includes(normTxt(q)))
  const cliSel = sel?rows.find(c=>c['Nombre']===sel):null
  const st = cliSel?stats(cliSel['Nombre']):null
  return <>
    <PageHead title="Clientes" sub={`${filtrados.length} de ${rows.length}`}/>
    <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar cliente…" style={{width:'100%', maxWidth:360, padding:'9px 13px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13, outline:'none', marginBottom:14}}/>
    <div style={{display:'flex', gap:16, alignItems:'flex-start'}}>
      <div style={{flex:1, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
        <div style={{display:'grid', gridTemplateColumns:'1.5fr 1fr 80px 110px', padding:'11px 18px', borderBottom:`1px solid ${T.border}`, fontSize:10.5, fontWeight:600, letterSpacing:0.3, textTransform:'uppercase', color:T.ink3}}>
          <span>Nombre</span><span>Agencia habitual</span><span style={{textAlign:'right'}}>Presus</span><span style={{textAlign:'right'}}>Cobrado</span>
        </div>
        {filtrados.map((c,i)=>{ const s=stats(c['Nombre'])
          return <div key={i} onClick={()=>setSel(c['Nombre'])} style={{display:'grid', gridTemplateColumns:'1.5fr 1fr 80px 110px', padding:'11px 18px', borderTop:`1px solid ${T.border}`, cursor:'pointer', alignItems:'center', fontSize:13, background:sel===c['Nombre']?T.surfaceAlt:'transparent'}}>
            <span style={{color:T.ink, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:8}}>{c['Nombre']}</span>
            <span style={{color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:8}}>{c['Agencia habitual']||'—'}</span>
            <span style={{textAlign:'right', color:T.ink2, fontFamily:MONO, fontSize:12}}>{s.presus}</span>
            <span style={{textAlign:'right', color:T.ink, fontFamily:MONO, fontSize:12}}>{fmtM(s.cobrado)}</span>
          </div>
        })}
      </div>
      {cliSel && <div style={{flex:'0 0 340px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', position:'sticky', top:0}}>
        <CardHead>{cliSel['Nombre']}</CardHead>
        <div style={{padding:'0 18px 16px'}}>
          <div style={{display:'flex', gap:18, flexWrap:'wrap', marginBottom:10}}>
            <Mini label="Presupuestos" val={st.presus}/><Mini label="Facturas" val={st.fact}/><Mini label="Cobrado" val={fmtM(st.cobrado)} color={T.pos}/>
          </div>
          <div style={{display:'flex', gap:8, flexWrap:'wrap', marginBottom:12}}>
            <span style={{fontSize:11.5, color:T.pos, background:T.posSoft, padding:'3px 9px', borderRadius:20, fontWeight:600}}>{st.aprob} aprobados</span>
            <span style={{fontSize:11.5, color:T.warn, background:T.warnSoft, padding:'3px 9px', borderRadius:20, fontWeight:600}}>{st.espera} en espera</span>
            <span style={{fontSize:11.5, color:T.brand, background:T.brandSoft, padding:'3px 9px', borderRadius:20, fontWeight:600}}>{st.desaprob} desaprob.</span>
          </div>
          {[['Agencia habitual',cliSel['Agencia habitual']],['Industria',cliSel['Industria']],['Última vez',cliSel['Ultima vez']]].filter(x=>x[1]).map(([k,v])=>(
            <div key={k} style={{display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:12.5}}><span style={{color:T.ink3}}>{k}</span><span style={{color:T.ink}}>{v}</span></div>
          ))}
          <div style={{fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:0.3, color:T.ink3, margin:'14px 0 6px'}}>Últimos presupuestos</div>
          {st.psList.slice(-10).reverse().map((p,i)=>{ const si=estadoInfo(p['Estado']); return (
            <div key={i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, padding:'5px 0', fontSize:12, borderTop:`1px solid ${T.border}`}}>
              <span style={{width:6,height:6,borderRadius:6,background:si.c,flexShrink:0}} title={si.l}/>
              <span style={{flex:1, color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{p['Proyecto']||'—'}</span>
              <span style={{fontFamily:MONO, color:T.ink2}}>{fmtM(parseMonto(p['Precio Final']))}</span>
            </div>
          )})}
        </div>
      </div>}
    </div>
  </>
}

// ============================ HISTÓRICO ============================
function Historico({data}){
  const proyectos=data.proyectos||[], fc=data.facturacion||[]
  const [anio,setAnio]=useState('2026')
  const [mesF,setMesF]=useState('todos')
  const fcByNro={}; fc.forEach(f=>{fcByNro[String(f['N° Presupuesto'])]=f})
  // Misma definición que Trabajos y el Dashboard: precio − staff de afuera (gananciaProyecto).
  // Los años viejos (HISTORICO_2023/24/25) ya venían así: Magma + Viáticos + Impuestos + Extra M.
  const magma2026=gananciaProyecto

  let filasAll=[]
  if(anio==='2026'){
    filasAll=proyectos.filter(p=>String(p['Fecha Evento']||'').includes('2026')).map(p=>{ const f=fcByNro[String(p['N° presupuesto'])]
      return {mesNum:parseInt((p['Fecha Evento']||'').split('/')[1])||0, fecha:p['Fecha Evento'], nro:p['N° presupuesto'], cliente:p['Cliente'], agencia:p['Agencia'], proyecto:p['Proyecto'], total:parseMonto(p['Total ']||p['Total']), magma:magma2026(p), cobrado:f?isCobrada(f):false} })
  } else {
    const src={'2023':data.historico2023,'2024':data.historico2024,'2025':data.historico2025}[anio]||[]
    filasAll=src.map(r=>({ mesNum:parseInt(String(r['Fecha Evento']||'').split('/')[1])||parseInt(String(r['Mes']||''))||0, fecha:r['Fecha Evento'], nro:r['Nro Presupuesto'], cliente:r['Cliente'], agencia:r['Agencia'], proyecto:r['Proyecto'], total:parseMonto(r['Total']), magma:parseMonto(r['Viaticos'])+parseMonto(r['Magma'])+parseMonto(r['Impuestos'])+parseMonto(r['Extra M']), cobrado:String(r['Cobrado']||'').toUpperCase()==='SÍ'||String(r['Cobrado']||'').toUpperCase()==='SI'||String(r['Cobrado']||'').toUpperCase()==='TRUE' }))
  }
  const filas = mesF==='todos' ? filasAll : filasAll.filter(r=>r.mesNum===parseInt(mesF))
  const facturado=filas.reduce((s,r)=>s+r.total,0)
  const ganancia=filas.reduce((s,r)=>s+r.magma,0)
  const margenPct=facturado>0?(ganancia/facturado)*100:0
  const semMargen=semaforo(margenPct)
  const mesesPresentes=[...new Set(filasAll.map(r=>r.mesNum).filter(Boolean))].sort((a,b)=>a-b)

  // top clientes del período
  const porCli={}; filas.forEach(r=>{ const c=r.cliente||'—'; porCli[c]=(porCli[c]||0)+r.total }); const topCli=Object.entries(porCli).sort((a,b)=>b[1]-a[1]).slice(0,8)

  return <>
    <PageHead title="Histórico" sub={`${filas.length} proyectos${mesF==='todos'?` en ${anio}`:` en ${MESES_LARGO[parseInt(mesF)-1]} ${anio}`}`}/>
    <div style={{display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center'}}>
      {['2023','2024','2025','2026'].map(a=><button key={a} onClick={()=>{setAnio(a);setMesF('todos')}} style={{padding:'7px 16px', borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer', border:`1px solid ${anio===a?T.ink:T.border}`, background:anio===a?T.ink:T.surface, color:anio===a?'#fff':T.ink2}}>{a}</button>)}
      <div style={{flex:1}}/>
      <select value={mesF} onChange={e=>setMesF(e.target.value)} style={selectStyle}><option value="todos">Todo el año</option>{mesesPresentes.map(m=><option key={m} value={m}>{MESES_LARGO[m-1]}</option>)}</select>
    </div>
    <div style={{display:'flex', gap:12, marginBottom:20, flexWrap:'wrap'}}>
      <Stat label="Proyectos" value={filas.length}/>
      <Stat label="Facturado" value={fmt(facturado)}/>
      <Stat label="Ganancia Magma" value={fmt(ganancia)} color={T.pos}/>
      <Stat label={`Margen · ${semMargen.l}`} value={Math.round(margenPct)+'%'} color={semMargen.c}/>
    </div>
    {filas.length===0
      ? <Empty>Sin datos para {anio}. Los históricos viejos se cargan desde Admin → Backfill en la app actual.</Empty>
      : <div style={{display:'flex', gap:16, alignItems:'flex-start'}}>
        <div style={{flex:1.6, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
          <div style={{display:'grid', gridTemplateColumns:'70px 1.5fr 1fr 110px 110px 60px', padding:'11px 16px', borderBottom:`1px solid ${T.border}`, fontSize:10, fontWeight:600, letterSpacing:0.3, textTransform:'uppercase', color:T.ink3}}>
            <span>N°</span><span>Proyecto</span><span>Cliente</span><span style={{textAlign:'right'}}>Total</span><span style={{textAlign:'right'}}>Magma</span><span style={{textAlign:'center'}}>Cob.</span>
          </div>
          <div style={{maxHeight:'60vh', overflowY:'auto'}}>
          {filas.slice().reverse().slice(0,300).map((r,i)=>(
            <div key={i} style={{display:'grid', gridTemplateColumns:'70px 1.5fr 1fr 110px 110px 60px', padding:'9px 16px', borderTop:`1px solid ${T.border}`, alignItems:'center', fontSize:12.5}}>
              <span style={{fontFamily:MONO, fontSize:11, color:T.ink3}}>{r.nro||'—'}</span>
              <span style={{color:T.ink, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:8}}>{r.proyecto||'—'}</span>
              <span style={{color:T.ink2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:8}}>{r.cliente||'—'}</span>
              <span style={{textAlign:'right', fontFamily:MONO, color:T.ink}}>{fmtM(r.total)}</span>
              <span style={{textAlign:'right', fontFamily:MONO, color:T.pos}}>{fmtM(r.magma)}</span>
              <span style={{textAlign:'center', color:r.cobrado?T.pos:T.ink3}}>{r.cobrado?'✓':'·'}</span>
            </div>
          ))}
          </div>
        </div>
        <div style={{flex:1, background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden'}}>
          <CardHead>Top clientes {anio}</CardHead>
          {topCli.map(([c,m],i)=>(
            <div key={i} style={{display:'flex', justifyContent:'space-between', padding:'9px 18px', borderTop:`1px solid ${T.border}`}}>
              <span style={{fontSize:12.5, color:T.ink}}>{c}</span>
              <span style={{fontSize:12.5, fontFamily:MONO, color:T.ink2}}>{fmtM(m)}</span>
            </div>
          ))}
        </div>
      </div>}
  </>
}

// ============================ EGRESOS (lectura) ============================
// Cuenta corriente de cada socio contra Magma: cuánto le queda por cobrar antes de
// sacar más plata. Sin esto se retira a ciegas y se termina sacando por adelantado.
function CuentaSocios({showToast}){
  const [d,setD]=useState(null), [err,setErr]=useState(''), [abierto,setAbierto]=useState(null)
  const [mov,setMov]=useState(null)   // {socio, tipo} cuando se está registrando un movimiento
  const cargar=useCallback(()=>fetch('/api/socios-cuenta').then(r=>r.json()).then(j=>{ if(j.error)setErr(j.error); else {setD(j); setErr('')} })
    .catch(()=>setErr('No se pudo calcular')),[])
  useEffect(()=>{ cargar() },[cargar])
  if(err) return null
  if(!d) return <div style={{fontSize:12, color:T.ink3, padding:'10px 18px'}}>Calculando cuenta de socios…</div>
  const MES=['','ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', marginBottom:14}}>
    <CardHead>Cuenta de socios · cuánto queda por cobrar</CardHead>
    <div style={{padding:'4px 18px 10px', fontSize:11, color:T.ink3}}>
      Sueldo de {MES[d.desdeSueldo]} a {MES[d.hastaSueldo]} ({d.socios[0].meses} × {fmt(d.sueldoMensual)}) + extras de {MES[d.desdeExtras]} a {MES[d.hastaExtras]}, menos lo que ya retiró cada uno (transferencias + gastos personales con tarjeta de la empresa).
      {d.tarjetasCargadas?.hasta && <div style={{marginTop:4, color:T.brand}}>⚠ Tarjetas cargadas hasta <b>{d.tarjetasCargadas.hasta}</b>: los meses sin resumen inflan el saldo a favor del socio.</div>}
    </div>
    <div style={{display:'flex', gap:12, padding:'0 18px 16px', flexWrap:'wrap'}}>
      {d.socios.map(s=>{ const aFavor=s.saldo>=0, icon=/juan/i.test(s.nombre)?'👨':'👩'
        return <div key={s.nombre} style={{flex:'1 1 240px', minWidth:230, border:`1px solid ${aFavor?T.posSoft:T.warnSoft}`, borderLeft:`3px solid ${aFavor?T.pos:T.brand}`, borderRadius:10, padding:'12px 14px', background:aFavor?T.posSoft:T.warnSoft}}>
          <div style={{fontSize:12.5, fontWeight:700, color:T.ink, marginBottom:6}}>{icon} {s.nombre}</div>
          <div style={{fontSize:21, fontFamily:MONO, fontWeight:700, color:aFavor?T.pos:T.brand, lineHeight:1.1}}>{aFavor?'':'–'}{fmt(Math.abs(s.saldo))}</div>
          <div style={{fontSize:11.5, color:T.ink2, marginTop:3, fontWeight:600}}>{aFavor?'le queda por cobrar':'retiró de más — se lo debe a Magma'}</div>
          <div style={{marginTop:9, paddingTop:8, borderTop:`1px solid ${T.border}`, fontSize:11.5, color:T.ink3, display:'grid', gap:2}}>
            <div style={{fontSize:10, fontWeight:700, color:T.ink3, textTransform:'uppercase', letterSpacing:.3}}>Ganó</div>
            <div style={{display:'flex', justifyContent:'space-between'}}><span>Sueldo · {s.meses} meses × {fmtM(d.sueldoMensual)}</span><b style={{fontFamily:MONO, color:T.ink2}}>{fmt(s.sueldo)}</b></div>
            <div style={{display:'flex', justifyContent:'space-between'}}><span>Trabajos extras en proyectos</span><b style={{fontFamily:MONO, color:T.ink2}}>{fmt(s.extra)}</b></div>
            <div style={{display:'flex', justifyContent:'space-between', borderTop:`1px solid ${T.border}`, paddingTop:2, marginTop:1}}><span style={{fontWeight:700, color:T.ink2}}>Le corresponde</span><b style={{fontFamily:MONO, color:T.ink}}>{fmt(s.devengado)}</b></div>
            <div style={{fontSize:10, fontWeight:700, color:T.ink3, textTransform:'uppercase', letterSpacing:.3, marginTop:6}}>Ya sacó</div>
            <div style={{display:'flex', justifyContent:'space-between'}}><span>Transferencias y pagos</span><b style={{fontFamily:MONO, color:T.ink2}}>{fmt(s.recibido)}</b></div>
            <div style={{display:'flex', justifyContent:'space-between'}}><span>Tarjeta (gastos personales)</span><b style={{fontFamily:MONO, color:s.tarjetas>s.recibido?T.brand:T.ink2}}>{fmt(s.tarjetas)}</b></div>
            {s.puso>0 && <div style={{display:'flex', justifyContent:'space-between'}}><span>Puso de su bolsillo</span><b style={{fontFamily:MONO, color:T.pos}}>+{fmt(s.puso)}</b></div>}
          </div>
          <div style={{marginTop:9, display:'flex', gap:6}}>
            <button onClick={()=>setMov({socio:s.nombre, tipo:'saco'})} style={{flex:1, fontSize:11, fontWeight:700, padding:'6px 8px', borderRadius:7, border:'none', background:T.brand, color:'#fff', cursor:'pointer'}}>Sacó plata</button>
            <button onClick={()=>setMov({socio:s.nombre, tipo:'puso'})} style={{flex:1, fontSize:11, fontWeight:700, padding:'6px 8px', borderRadius:7, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, cursor:'pointer'}}>Puso plata</button>
          </div>
          <button onClick={()=>setAbierto(abierto===s.nombre?null:s.nombre)} style={{marginTop:8, fontSize:11, color:T.brand, background:'none', border:'none', cursor:'pointer', fontWeight:600, padding:0}}>{abierto===s.nombre?'Ocultar detalle':'Ver detalle ›'}</button>
          {abierto===s.nombre && <div style={{marginTop:8, paddingTop:8, borderTop:`1px solid ${T.border}`, fontSize:11, color:T.ink3, display:'grid', gap:2}}>
            <div style={{fontWeight:700, color:T.ink2, marginBottom:1}}>Extras sin cobrar, por mes</div>
            {Object.entries(s.extrasPorMes).sort((a,b)=>a[0]-b[0]).map(([m,v])=><div key={m} style={{display:'flex', justifyContent:'space-between'}}><span>{MES[m]}</span><span style={{fontFamily:MONO}}>{fmt(v)}</span></div>)}
            <div style={{fontWeight:700, color:T.ink2, margin:'5px 0 1px'}}>Tarjeta personal, por mes</div>
            {Object.entries(s.tarjPorMes).sort((a,b)=>a[0]-b[0]).map(([m,v])=><div key={m} style={{display:'flex', justifyContent:'space-between'}}><span>{MES[m]}</span><span style={{fontFamily:MONO}}>{fmt(v)}</span></div>)}
          </div>}
        </div> })}
    </div>
    {mov && <MovimientoSocio {...mov} onClose={()=>setMov(null)} onHecho={async()=>{ setMov(null); await cargar() }} showToast={showToast}/>}
  </div>
}

// Alta de un retiro o aporte de socio. Va a SOCIOS_MOVIMIENTOS, que es la fuente
// del saldo — no al "Sueldo X" de GASTOS_FIJOS, que es el compromiso del mes.
function MovimientoSocio({socio, tipo, onClose, onHecho, showToast}){
  const [monto,setMonto]=useState(''), [concepto,setConcepto]=useState(''), [moneda,setMoneda]=useState('ARS'), [busy,setBusy]=useState(false)
  const saco=tipo==='saco'
  async function guardar(){
    const n=parseMontoAR(monto)
    if(!n||n<=0) return showToast('Poné un monto','err')
    setBusy(true)
    try{
      const r=await fetch('/api/socio-movimiento',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({socio, tipo, monto:n, concepto, moneda})})
      const j=await r.json()
      if(j.error){ showToast(j.error,'err'); setBusy(false); return }
      showToast(saco?`${socio} sacó ${fmt(n)} ✓`:`${socio} puso ${fmt(n)} ✓`)
      await onHecho()
    }catch(e){ showToast('Error de conexión','err'); setBusy(false) }
  }
  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:210, display:'flex', alignItems:'center', justifyContent:'center', padding:20}}>
    <div onClick={e=>e.stopPropagation()} style={{background:T.surface, borderRadius:14, padding:20, width:380, maxWidth:'100%', border:`1px solid ${T.border}`}}>
      <h3 style={{margin:'0 0 4px', fontSize:16, fontWeight:700, color:T.ink}}>{saco?`${socio} sacó plata`:`${socio} puso plata`}</h3>
      <p style={{margin:'0 0 14px', fontSize:11.5, color:T.ink3}}>{saco
        ? 'Plata que Magma le dio al socio. Se descuenta de lo que tiene por cobrar.'
        : 'Plata que el socio puso en Magma (un VEP, un préstamo). Se suma a lo que tiene a favor.'}</p>
      <label style={{fontSize:11, fontWeight:700, color:T.ink3, textTransform:'uppercase', letterSpacing:.3}}>Monto</label>
      <div style={{display:'flex', gap:8, margin:'4px 0 12px'}}>
        <input autoFocus inputMode="decimal" value={monto} onChange={e=>setMonto(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')guardar()}} placeholder="0" style={{flex:1, padding:'9px 11px', borderRadius:8, border:`1px solid ${T.border}`, fontSize:15, fontFamily:MONO, textAlign:'right', outline:'none', background:T.surface, color:T.ink}}/>
        <select value={moneda} onChange={e=>setMoneda(e.target.value)} style={{...selectStyle, width:78}}><option>ARS</option><option>USD</option></select>
      </div>
      <label style={{fontSize:11, fontWeight:700, color:T.ink3, textTransform:'uppercase', letterSpacing:.3}}>Concepto</label>
      <input value={concepto} onChange={e=>setConcepto(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')guardar()}} placeholder={saco?'Retiro, adelanto, pago de tarjeta…':'VEP, préstamo en efectivo…'} style={{width:'100%', padding:'9px 11px', borderRadius:8, border:`1px solid ${T.border}`, fontSize:13, margin:'4px 0 16px', outline:'none', background:T.surface, color:T.ink}}/>
      <div style={{display:'flex', gap:8}}>
        <button onClick={onClose} style={{flex:1, padding:'10px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:600, cursor:'pointer'}}>Cancelar</button>
        <button onClick={guardar} disabled={busy} style={{flex:2, padding:'10px', borderRadius:9, border:'none', background:busy?T.ink3:T.brand, color:'#fff', fontSize:13, fontWeight:700, cursor:busy?'default':'pointer'}}>{busy?'Guardando…':'Registrar'}</button>
      </div>
    </div>
  </div>
}

// CAJA: lo que entra y lo que sale en el mes, semana a semana, contra el saldo de las cuentas.
// Junta en una pantalla lo que antes había que mirar en cuatro (Egresos, Facturación, Pagos Staff
// y las cuentas). Es la ÚNICA entrada de plata del menú. Tiene dos pestañas: "Caja" (mirar y pagar) y
// "Cargar y detalle", que es lo que antes era el módulo Egresos (gastos uno por uno, tarjetas, cuotas,
// cuenta de socios). El cálculo vive en lib/caja.mjs para que todos den el mismo número.
function Caja({data, onRefresh, showToast, goTo}){
  const now=new Date()
  const [mesIdx,setMesIdx]=useState(now.getMonth()+1), [anio,setAnio]=useState(now.getFullYear())
  // Cómo contar lo que entra: 'seguro' deja afuera lo que vence de agencias que hoy ya deben algo vencido.
  const [modo,setModo]=useState('seguro')
  const [filtro,setFiltro]=useState('todo'), [cuentaSel,setCuentaSel]=useState(''), [abiertos,setAbiertos]=useState({}), [cuentaDe,setCuentaDe]=useState({}), [busy,setBusy]=useState('')
  // Una sola pantalla de plata: 'caja' para mirar y pagar; 'detalle' es lo que era Egresos (cuenta de socios,
  // cuotas a futuro, el detalle de cada tarjeta, editar un gasto). Agregar un gasto y subir un resumen se hacen
  // desde las dos, sin cambiar de pestaña.
  // Se entra por 'hoy': la lista de tareas de administración (qué facturar, mandar, reclamar, pagar y cargar).
  const [tab,setTab]=useState('hoy'), [agregar,setAgregar]=useState(false), [subir,setSubir]=useState(false), [editSaldos,setEditSaldos]=useState(false), [extracto,setExtracto]=useState(false), [verTickets,setVerTickets]=useState(false)
  // CARGA RÁPIDA: lo que se pagó hoy y no pasa por ningún resumen (efectivo, una transferencia suelta).
  // Tres datos y listo: qué, cuánto y de dónde salió. La fecha es hoy y el rubro se aprende de la vez anterior.
  // Lo que sale por débito o con tarjeta NO se carga acá: entra cuando se sube el resumen.
  const hoyISO=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
  const [qa,setQa]=useState({concepto:'', monto:'', cuenta:'', rubro:'', trabajo:'', fecha:hoyISO}), [qaBusy,setQaBusy]=useState(false)
  // Traba contra el Enter repetido: el estado tarda un render en avisar que ya se está guardando, y en ese
  // rato un segundo Enter cargaría el pago dos veces (y restaría dos veces de la cuenta).
  const qaLock=useRef(false)
  // Lo que ya se pagó así alguna vez: sirve para sugerir el nombre y traer el monto, la cuenta y el rubro de la última vez.
  const previos={}; (data.gastosFijos||[]).forEach(g=>{ if(!/[uú]nico/i.test(String(g['Frecuencia']||''))) return; const k=normTxt(g['Concepto']); if(k) previos[k]={concepto:String(g['Concepto']).trim(), monto:parseMonto(g['Monto']), cuenta:String(g['Cuenta pago']||'').trim(), rubro:String(g['Rubro']||'').trim() ? `${String(g['Rubro']).trim()}|${String(g['Subrubro']||'').trim()}` : ''} })
  // Los rubros salen de la solapa RUBROS: UNA sola lista para todo (tarjetas, efectivo, transferencias). Cada renglón
  // trae "qué incluye", y con eso se sugiere el rubro según lo que se escribe: nadie tiene que saber si la limpieza
  // es "Operativos" u "Oficina". Lo personal de los socios no se carga acá: va por "Sacó plata".
  // Palabras enteras y sin plural ("equipos" = "equipo"), de 3 letras o más: así "IVA" encuentra Impuestos y no "productIVIdad".
  const palabrasDe=t=>normTxt(t).split(/[^a-z0-9ñ]+/).filter(w=>w.length>=3).map(w=>w.length>4?w.replace(/(es|s)$/,''):w)
  const rubros=(data.rubros||[]).filter(r=>!/^personal/i.test(r.rubro)).map(r=>({...r, key:`${r.rubro}|${r.subrubro}`, label:r.subrubro?`${r.rubro} · ${r.subrubro}`:r.rubro, pal:new Set(palabrasDe(`${r.rubro} ${r.subrubro} ${r.incluye}`))}))
  const sugerirRubro=texto=>{ const pal=palabrasDe(texto); if(!pal.length) return ''
    let mejor='', pts=0; rubros.forEach(r=>{ const p=pal.filter(w=>r.pal.has(w)).length; if(p>pts){ pts=p; mejor=r.key } }); return mejor }
  // El rubro contable de siempre (la columna Categoria) se deduce del rubro: lo siguen usando el detalle y los números de Mariana.
  const categoriaDe=rubro=>/sueldo/i.test(rubro)?'Sueldos':/impuesto/i.test(rubro)?'Impuestos':/bancari|financ/i.test(rubro)?'Financieros':'Operativos'
  // Trabajos recientes, para atar un gasto de Producción a su trabajo (el alquiler de equipos de un rodaje le baja la ganancia a ESE trabajo).
  const trabajosRec=(data.proyectos||[]).filter(p=>{ const d=parseD(p['Fecha Evento']); if(!d) return false; const dias=(now-d)/864e5; return dias>-20 && dias<75 }).sort((a,b)=>parseD(b['Fecha Evento'])-parseD(a['Fecha Evento'])).map(p=>`#${String(p['N° presupuesto']||'').trim()} · ${[p['Cliente'],p['Proyecto']].filter(Boolean).join(' · ')}`)
  const cel=useEsCelular()
  const c=calcularCaja(data,{mes:mesIdx, anio, hoy:now, maxSlots:MAX_SLOTS, canonStaff, tarjetasActivas:TARJETAS_ACTIVAS})
  // "Hoy" mira siempre el mes en curso, aunque en la pestaña Caja se esté mirando otro mes.
  const cHoy=(mesIdx===now.getMonth()+1 && anio===now.getFullYear()) ? c : calcularCaja(data,{hoy:now, maxSlots:MAX_SLOTS, canonStaff, tarjetasActivas:TARJETAS_ACTIVAS})
  const nBanco=(data.movimientosBanco||[]).filter(r=>String(r['Estado']||'').trim()==='Para revisar').length
  const t=c.totales, seguro=modo==='seguro'
  const fm=n=>(n<0?'−':'')+fmt(n)
  const DIAS_SEM=['dom','lun','mar','mié','jue','vie','sáb']
  const hoyDia=c.esMesActual?c.hoy0.getDate():null
  const cuentaOpts=c.cuentas.filter(x=>x.activa&&!x.usd).map(x=>x.nombre)
  const cuentaDeItem=i=>cuentaDe[i.id]??i.cuenta
  const qaCuenta=qa.cuenta || cuentaOpts.find(n=>/efectivo/i.test(n)) || cuentaOpts[0] || ''
  // Rubro: el que se eligió a mano; si no, el de la última vez que se pagó eso; si no, el que sugieren las palabras.
  const qaRubro=qa.rubro || previos[normTxt(qa.concepto)]?.rubro || sugerirRubro(qa.concepto)
  const qaRub=rubros.find(r=>r.key===qaRubro)||null, esDeTrabajo=!!qaRub && /^producci/i.test(normTxt(qaRub.rubro))
  // Al escribir algo que ya se pagó antes, trae el monto y la cuenta de esa vez (si todavía no se tipeó un monto).
  const qaConcepto=v=>setQa(q=>{ const p=previos[normTxt(v)]; return p && !q.monto ? {...q, concepto:v, monto:numAMontoAR(p.monto), cuenta:cuentaOpts.includes(p.cuenta)?p.cuenta:q.cuenta, rubro:p.rubro||q.rubro} : {...q, concepto:v} })
  async function anotarPago(){
    if(qaLock.current) return
    const concepto=qa.concepto.trim(), monto=parseMontoAR(qa.monto)
    if(!concepto){ showToast('Escribí qué pagaste','err'); return }
    if(monto<=0){ showToast('Poné cuánto pagaste','err'); return }
    if(!qaCuenta){ showToast('Elegí de dónde salió la plata','err'); return }
    const [Y,M,D]=(qa.fecha||hoyISO).split('-').map(Number)
    qaLock.current=true; setQaBusy(true)
    try{ const r=await fetch('/api/gasto-nuevo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({categoria:categoriaDe(qaRub?.rubro||''), rubro:qaRub?.rubro||'', subrubro:qaRub?.subrubro||'', nroTrabajo:esDeTrabajo?((qa.trabajo||'').match(/\d{3,}/)||[''])[0]:'', concepto, monto, moneda:'ARS', recurrencia:'unico', diaPago:D, mes:M, anio:Y, pagado:true, cuentaPago:qaCuenta, fechaPago:`${D}/${M}/${Y}`, medio:/efectivo/i.test(qaCuenta)?'Efectivo':'Transferencia', tipo:'gasto'})})
      const j=await r.json(); if(j&&j.error){ showToast(j.error,'err'); qaLock.current=false; setQaBusy(false); return }
      showToast(`Anotado ✓ · ${concepto} · ${fmt(monto)} desde ${qaCuenta}${qaRub?` · ${qaRub.label}`:''}${j.aviso?` · ${j.aviso}`:''}`); setQa({concepto:'', monto:'', cuenta:qa.cuenta, rubro:'', trabajo:'', fecha:hoyISO}); if(onRefresh) await onRefresh()
    }catch(e){ showToast('Error de conexión','err') }
    qaLock.current=false; setQaBusy(false)
  }
  const mover=d=>{ let m=mesIdx+d, a=anio; if(m<1){m=12;a--} if(m>12){m=1;a++} setMesIdx(m); setAnio(a); setAbiertos({}) }

  // Un clic: marca pagado en el mes que se está mirando, con la cuenta elegida, y la cuenta queda guardada para el mes que viene.
  async function pagar(i, pagado){
    const cuenta=cuentaDeItem(i), esDebito=i.tipo==='debito'
    if(pagado && !cuenta && !esDebito){ showToast(`Elegí de qué cuenta sale ${i.nombre}`,'err'); return }
    const fecha=c.esMesActual ? `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()}` : `${i.dia||15}/${mesIdx}/${anio}`
    setBusy(i.id)
    try{ const r=await fetch('/api/egreso-toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hoja:i.hoja, fila:i.fila, pagado, tipoPago:'total', cuentaPago:esDebito?undefined:cuenta, fechaPago:pagado?fecha:'', mesPagoKey:i.hoja==='GASTOS_FIJOS'?i.mesPagoKey:undefined})})
      const j=await r.json(); if(j&&j.error){ showToast(j.error,'err'); setBusy(''); return }
      showToast(!pagado?(esDebito?`${i.nombre}: quedó sin marcar`:`${i.nombre}: quedó sin pagar y la plata volvió a ${cuenta}`):esDebito?`${i.nombre}: marcado como debitado ✓ (no toca el saldo: ya está en el del banco)`:`${i.nombre}: pagado desde ${cuenta} ✓`); if(onRefresh) await onRefresh()
    }catch(e){ showToast('Error de conexión','err') }
    setBusy('')
  }

  // Lo que entra, agrupado por semana (una fila por semana con sus facturas adentro)
  const cobrosDe=s=>c.cobros.filter(x=>x.dia!==null && x.dia>=s.desde && x.dia<=s.hasta).sort((a,b)=>a.dia-b.dia)
  const pasa=i=>(filtro==='todo'||i.tipo===filtro||(filtro==='mano'&&(i.tipo==='socios'||i.tipo==='falta')))&&(!cuentaSel||cuentaDeItem(i)===cuentaSel)
  const bloques=[...c.semanas.map((s,k)=>({key:'s'+k, s, titulo:s.esActual?`Esta semana · del ${s.desde} al ${s.hasta}`:`Del ${s.desde} al ${s.hasta}`, items:c.items.filter(i=>i.dia!==null && i.dia>=s.desde && i.dia<=s.hasta), cobros:cobrosDe(s)})),
    {key:'sin', s:null, titulo:'Sin día de pago cargado', items:c.items.filter(i=>i.dia===null), cobros:[]}]

  const chip={fontSize:11.5, padding:'4px 10px', borderRadius:20, background:T.surfaceAlt, color:T.ink2, whiteSpace:'nowrap'}
  const btnSec={fontSize:12, fontWeight:600, padding:'7px 12px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, cursor:'pointer', whiteSpace:'nowrap'}
  const seg=(val,cur,set,l)=><button key={val} onClick={()=>set(val)} style={{padding:'7px 12px', border:'none', borderLeft:`1px solid ${T.border}`, background:cur===val?T.ink:'transparent', color:cur===val?'#fff':T.ink2, fontSize:12.5, fontWeight:cur===val?600:500, cursor:'pointer'}}>{l}</button>
  const grid=cel?'40px minmax(0,1fr)':'44px minmax(0,1fr) auto 118px 150px'

  const Fila=i=>{ const ab=!!abiertos[i.id], vencido=!i.pagado && hoyDia!==null && i.dia!==null && i.dia<hoyDia && i.tipo!=='falta', cta=cuentaDeItem(i), ocupado=busy===i.id
    let accion
    if(i.pagado) accion=<span style={{fontSize:11.5, color:T.pos, fontWeight:600}}>✓ Pagado{i.fechaPago?` ${i.fechaPago.split('/').slice(0,2).join('/')}`:''}{(i.hoja==='GASTOS_FIJOS'||i.hoja==='IMPUESTOS') && <button disabled={ocupado} onClick={()=>pagar(i,false)} title={i.tipo==='debito'?'Lo deja sin marcar (no toca ninguna cuenta)':'Lo deja sin pagar y devuelve la plata a la cuenta'} style={{border:'none', background:'none', color:T.ink3, fontSize:11, textDecoration:'underline', cursor:'pointer', marginLeft:5, padding:0}}>{ocupado?'…':'deshacer'}</button>}</span>
    else if(i.tipo==='debito') accion=<span style={{display:'inline-flex', gap:8, alignItems:'center', flexWrap:'wrap', justifyContent:'flex-end'}}><span style={{fontSize:11.5, color:T.ink3}}>se debita solo</span><button disabled={ocupado} onClick={()=>pagar(i,true)} style={btnSec} title="Marcarlo cuando ya lo viste debitado en el banco. No resta de la cuenta: el débito ya está en el saldo que se copia del banco.">{ocupado?'Guardando…':'Ya se debitó'}</button></span>
    else if(i.tipo==='socios') accion=<button onClick={()=>{ setTab('detalle'); window.scrollTo&&window.scrollTo(0,0) }} style={btnSec} title="El sueldo de los socios se anota con «Sacó plata» en la cuenta de socios (pestaña Cargar y detalle)">Cuenta de socios</button>
    else if(i.tipo==='falta') accion=<button onClick={()=>setSubir(true)} style={btnSec}>Subir resumen</button>
    else if(i.link) accion=<button onClick={()=>goTo&&goTo(i.link)} style={btnSec}>Ir a Pagos Staff</button>
    else accion=<button disabled={ocupado} onClick={()=>pagar(i,true)} style={{fontSize:12, fontWeight:700, padding:'7px 16px', borderRadius:8, border:'none', background:T.brand, color:'#fff', cursor:ocupado?'default':'pointer', opacity:ocupado?0.6:1}}>{ocupado?'Guardando…':'Pagué'}</button>
    let cuentaEl
    if(i.tipo==='socios') cuentaEl=<span style={chip}>cuenta de socios</span>
    else if(i.tipo==='mano' && i.hoja && !i.pagado) cuentaEl=<select value={cta} onChange={e=>setCuentaDe(o=>({...o,[i.id]:e.target.value}))} title="De qué cuenta sale. Queda guardada para el mes que viene." style={{fontSize:11.5, padding:'5px 8px', borderRadius:20, border:`1px ${cta?'solid':'dashed'} ${cta?T.border:T.warn}`, background:T.surface, color:cta?T.ink:T.warn, cursor:'pointer', maxWidth:170, outline:'none'}}>{!cta && <option value="">elegir cuenta</option>}{[...new Set([...cuentaOpts, ...(cta?[cta]:[])])].map(n=><option key={n} value={n}>{n}</option>)}</select>
    else cuentaEl=cta?<span style={chip}>{cta}</span>:<span style={{...chip, background:'transparent', border:`1px dashed ${T.ink3}`, color:T.ink3}}>sin cuenta</span>
    return <div key={i.id}>
      <div style={{display:'grid', gridTemplateColumns:grid, gap:cel?9:12, alignItems:'center', padding:'11px 16px', borderTop:`1px solid ${T.border}`, opacity:i.pagado?0.6:1}}>
        <div style={{textAlign:'center', lineHeight:1.1, alignSelf:cel?'start':'center'}}>{i.dia!==null ? <><div style={{fontFamily:MONO, fontSize:17, fontWeight:600, color:vencido?T.brand:T.ink}}>{i.dia}</div><div style={{fontSize:10, textTransform:'uppercase', letterSpacing:0.4, color:i.dia===hoyDia||vencido?T.brand:T.ink3, fontWeight:i.dia===hoyDia||vencido?700:400}}>{i.dia===hoyDia?'hoy':vencido?'venció':DIAS_SEM[new Date(anio,mesIdx-1,i.dia).getDay()]}</div></> : <div style={{fontFamily:MONO, color:T.ink3}}>·</div>}</div>
        <div style={{minWidth:0}}>
          <div style={{fontSize:13.5, fontWeight:600, color:T.ink, textDecoration:i.pagado?'line-through':'none'}}>{i.nombre}{i.partes && <button onClick={()=>setAbiertos(o=>({...o,[i.id]:!ab}))} style={{border:'none', background:'none', color:T.ink2, fontSize:11, textDecoration:'underline', cursor:'pointer', marginLeft:8, padding:0, fontWeight:400}}>{ab?'cerrar':`ver los ${i.partes.length}`}</button>}</div>
          <div style={{fontSize:11.5, color:T.ink2, marginTop:2}}><span style={{fontSize:10.5, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase'}}>{i.fuente}</span>{i.det && <span style={{color:i.tipo==='falta'?T.warn:T.ink2, fontWeight:i.tipo==='falta'?600:400}}> · {i.det}</span>}</div>
          {cel && <div style={{display:'flex', gap:9, alignItems:'center', flexWrap:'wrap', marginTop:8}}>{cuentaEl}<span style={{fontFamily:MONO, fontSize:13.5, fontWeight:600}}>{i.tipo==='falta'?'—':fmt(i.monto)}</span>{accion}</div>}
        </div>
        {!cel && <div style={{justifySelf:'end'}}>{cuentaEl}</div>}
        {!cel && <div style={{fontFamily:MONO, fontSize:13.5, fontWeight:500, textAlign:'right', textDecoration:i.pagado?'line-through':'none'}}>{i.tipo==='falta'?'—':fmt(i.monto)}</div>}
        {!cel && <div style={{justifySelf:'end', textAlign:'right'}}>{accion}</div>}
      </div>
      {i.partes && ab && <div style={{padding:cel?'2px 16px 10px':'2px 16px 10px 72px', borderTop:`1px dashed ${T.border}`}}>{i.partes.map((p,k)=><div key={k} style={{display:'flex', justifyContent:'space-between', gap:10, fontSize:12.5, padding:'5px 0', color:T.ink}}><span style={{minWidth:0}}>{p.n}</span><span style={{fontFamily:MONO, color:T.ink2}}>{fmt(p.m)}</span></div>)}</div>}
    </div> }

  const FilaEntra=(b)=>{ const id='in:'+b.key, ab=!!abiertos[id], tot=b.cobros.reduce((s,x)=>s+x.saldo,0), dud=b.cobros.filter(x=>!x.segura), totDud=dud.reduce((s,x)=>s+x.saldo,0)
    return <div key={id}>
      <div style={{display:'grid', gridTemplateColumns:grid, gap:cel?9:12, alignItems:'center', padding:'11px 16px', borderTop:`1px solid ${T.border}`, background:T.posSoft+'55'}}>
        <div style={{textAlign:'center'}}><span style={{display:'inline-block', width:9, height:9, borderRadius:9, background:T.pos}}/></div>
        <div style={{minWidth:0}}>
          <div style={{fontSize:13.5, fontWeight:600, color:T.ink}}>Cobros que entran<button onClick={()=>setAbiertos(o=>({...o,[id]:!ab}))} style={{border:'none', background:'none', color:T.ink2, fontSize:11, textDecoration:'underline', cursor:'pointer', marginLeft:8, padding:0, fontWeight:400}}>{ab?'cerrar':`ver ${b.cobros.length===1?'la factura':`las ${b.cobros.length}`}`}</button></div>
          <div style={{fontSize:11.5, color:T.ink2, marginTop:2}}><span style={{fontSize:10.5, fontWeight:600, letterSpacing:0.4, textTransform:'uppercase'}}>Facturación</span> · {b.cobros.length} {b.cobros.length===1?'factura':'facturas'}{dud.length>0 && <span style={{color:T.warn, fontWeight:600}}> · {fmt(totDud)} es de agencias que hoy vienen atrasadas</span>}</div>
          {cel && <div style={{display:'flex', gap:9, alignItems:'center', flexWrap:'wrap', marginTop:8}}><span style={{fontFamily:MONO, fontSize:13.5, fontWeight:600, color:T.pos}}>+{fmt(tot)}</span><button onClick={()=>goTo&&goTo('facturacion')} style={btnSec}>Ir a cobrar</button></div>}
        </div>
        {!cel && <div style={{justifySelf:'end'}}><span style={{...chip, background:'transparent', border:`1px dashed ${T.ink3}`, color:T.ink3}}>se elige al cobrar</span></div>}
        {!cel && <div style={{fontFamily:MONO, fontSize:13.5, fontWeight:600, textAlign:'right', color:T.pos}}>+{fmt(tot)}</div>}
        {!cel && <div style={{justifySelf:'end'}}><button onClick={()=>goTo&&goTo('facturacion')} style={btnSec}>Ir a cobrar</button></div>}
      </div>
      {ab && <div style={{padding:cel?'2px 16px 10px':'2px 16px 10px 72px', borderTop:`1px dashed ${T.border}`}}>{b.cobros.map((x,k)=><div key={k} style={{display:'flex', justifyContent:'space-between', gap:10, fontSize:12.5, padding:'5px 0', color:T.ink}}><span style={{minWidth:0}}>{x.dia}/{mesIdx} · {x.agencia}{x.cliente&&x.cliente!==x.agencia?` · ${x.cliente}`:''} · #{x.nro}{x.promesa?<span style={{color:T.pos, fontWeight:600}}> · prometió pagar</span>:null}{!x.segura?<span style={{color:T.warn, fontWeight:600}}> · viene atrasada</span>:null}</span><span style={{fontFamily:MONO, color:T.ink2}}>{fmt(x.saldo)}</span></div>)}</div>}
    </div> }

  const entra=seguro?t.entraSeguro:t.entra, termina=seguro?t.terminaSeguro:t.termina
  const limite7=new Date(c.hoy0.getTime()+7*864e5)
  return <>
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, flexWrap:'wrap', marginBottom:18}}>
      <div><h1 style={{fontSize:23, fontWeight:700, color:T.ink, margin:0, letterSpacing:-0.3}}>Caja</h1><div style={{fontSize:13, color:T.ink3, marginTop:3}}>Toda la plata en un solo lugar</div></div>
      <div style={{display:tab==='caja'?'flex':'none', gap:10, alignItems:'center', flexWrap:'wrap'}}>
        <button onClick={()=>mover(-1)} style={navBtn}>←</button>
        <span style={{fontSize:13, fontWeight:600, color:T.ink, minWidth:118, textAlign:'center'}}>{MESES_LARGO[mesIdx-1]} {anio}</span>
        <button onClick={()=>mover(1)} style={navBtn}>→</button>
        <button onClick={()=>setExtracto(true)} style={{...btnSec, padding:'9px 14px'}}>⬆ Subir extracto del banco</button>
        <button onClick={()=>setSubir(true)} style={{...btnSec, padding:'9px 14px'}}>⬆ Subir resumen de tarjeta</button>
        <button onClick={()=>setAgregar(true)} style={{fontSize:12.5, fontWeight:700, padding:'9px 16px', borderRadius:9, border:'none', background:T.brand, color:'#fff', cursor:'pointer'}}>➕ Agregar</button>
      </div>
    </div>
    <div style={{display:'flex', marginBottom:18, borderBottom:`1px solid ${T.border}`}}>
      {[['hoy','Hoy','qué hay que hacer'],['caja','Caja','lo que entra, lo que sale y si alcanza'],['banco',`Banco${nBanco?` (${nBanco})`:''}`,'lo que el extracto dejó para revisar'],['detalle','Cargar y detalle','gastos uno por uno, tarjetas, cuotas y cuenta de socios']].map(([k,l,sub])=>
        <button key={k} onClick={()=>setTab(k)} style={{padding:'10px 14px 9px', border:'none', background:'transparent', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:tab===k?700:500, color:tab===k?T.ink:T.ink2, borderBottom:`2px solid ${tab===k?T.brand:'transparent'}`}}>{l}{!cel && <span style={{fontSize:11, fontWeight:400, color:T.ink3, marginLeft:7}}>{sub}</span>}</button>)}
    </div>
    {tab==='hoy' && (()=>{
      // HOY: la lista de tareas de administración. Se arma sola (lib/hoy.mjs) y cada tarea lleva a donde se resuelve.
      const h=tareasDeHoy(data,cHoy)
      const TONO={entra:{c:T.pos,bg:T.posSoft,l:'Trae plata'}, sale:{c:T.ink,bg:T.surfaceAlt,l:'Hay que pagar'}, alerta:{c:T.brand,bg:T.brandSoft,l:'No alcanza'}, falta:{c:T.warn,bg:T.warnSoft,l:'Falta cargar'}}
      const irA=d=>{ if(d==='facturar') goTo&&goTo('facturacion',{agF:'facturar'}); else if(d==='enviar') goTo&&goTo('facturacion',{agF:'sinenviar'}); else if(d==='reclamar') goTo&&goTo('facturacion',{agF:'vencido'}); else if(d==='caja') setTab('caja'); else if(d==='subir-tarjeta') setSubir(true); else if(d==='subir-extracto') setExtracto(true); else if(d==='banco') setTab('banco'); else if(d==='saldos') setEditSaldos(true); else if(d==='tickets') setVerTickets(true); else setTab('detalle') }
      const DIAS_L=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
      const montoDe=x=>x.monto>0?`${x.tono==='entra'?'+':''}${x.montoAprox?'≈ ':''}${fmt(x.monto)}`:''
      const colorMonto=x=>x.tono==='entra'?T.pos:x.tono==='alerta'?T.brand:T.ink
      return <>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:12, flexWrap:'wrap', marginBottom:14}}>
          <div style={{fontSize:15, fontWeight:700, color:T.ink}}>{DIAS_L[now.getDay()]} {now.getDate()} de {MESES_LARGO[now.getMonth()].toLowerCase()} · {h.tareas.length?`${h.tareas.length} ${h.tareas.length===1?'cosa':'cosas'} para hacer`:'todo al día'}</div>
          {h.porDestrabar>0 && <div style={{fontSize:12.5, color:T.ink2}}>{h.nEntra===1?'La primera destraba':`Las ${h.nEntra} primeras destraban`} <b style={{fontFamily:MONO, color:T.pos}}>{fmt(h.porDestrabar)}</b></div>}
        </div>
        {!h.tareas.length && <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, padding:'22px 18px', fontSize:13.5, color:T.ink2}}>No hay nada pendiente: todo facturado, enviado, reclamado y pagado.</div>}
        {h.tareas.length>0 && <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, overflow:'hidden'}}>
          {h.tareas.map((x,i)=>{ const tn=TONO[x.tono], id='hoy:'+x.id, ab=abiertos[id]??(x.tono==='entra'||x.tono==='alerta')
            return <div key={x.id} style={{borderTop:i?`1px solid ${T.border}`:'none', padding:cel?'14px':'15px 18px'}}>
              <div style={{display:'grid', gridTemplateColumns:cel?'30px minmax(0,1fr)':'34px minmax(0,1fr) auto 150px', gap:cel?10:14, alignItems:'center'}}>
                <div style={{width:28, height:28, borderRadius:'50%', background:tn.bg, color:tn.c, fontSize:13, fontWeight:700, fontFamily:MONO, display:'flex', alignItems:'center', justifyContent:'center'}}>{i+1}</div>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:14, fontWeight:700, color:T.ink}}>{x.titulo}</div>
                  <div style={{fontSize:12, color:T.ink2, marginTop:3, lineHeight:1.45}}><span style={{fontSize:10.5, fontWeight:700, letterSpacing:0.4, textTransform:'uppercase', color:tn.c}}>{tn.l}</span> · {x.sub}{x.lista.length>0 && <button onClick={()=>setAbiertos(o=>({...o,[id]:!ab}))} style={{border:'none', background:'none', color:T.ink2, fontSize:11.5, textDecoration:'underline', cursor:'pointer', marginLeft:6, padding:0, fontFamily:'inherit'}}>{ab?'ocultar detalle':'ver detalle'}</button>}</div>
                  {cel && <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', marginTop:9}}>{x.monto>0 && <span style={{fontFamily:MONO, fontSize:14, fontWeight:600, color:colorMonto(x)}}>{montoDe(x)}</span>}<button onClick={()=>irA(x.ir.donde)} style={{...btnSec, ...(i===0?{background:T.brand, borderColor:T.brand, color:'#fff'}:{})}}>{x.ir.label}</button></div>}
                </div>
                {!cel && <div style={{fontFamily:MONO, fontSize:15, fontWeight:600, textAlign:'right', color:colorMonto(x), whiteSpace:'nowrap'}}>{montoDe(x)}</div>}
                {!cel && <button onClick={()=>irA(x.ir.donde)} style={{...btnSec, justifySelf:'stretch', textAlign:'center', ...(i===0?{background:T.brand, borderColor:T.brand, color:'#fff'}:{})}}>{x.ir.label}</button>}
              </div>
              {ab && x.lista.length>0 && <div style={{margin:cel?'10px 0 0':'10px 0 0 48px', borderTop:`1px dashed ${T.border}`, paddingTop:7}}>{x.lista.map((l,k)=><div key={k} style={{display:'flex', justifyContent:'space-between', gap:12, fontSize:12.5, padding:'4px 0'}}><span style={{minWidth:0, color:T.ink}}>{l.t}{l.d && <span style={{color:T.ink3}}> · {l.d}</span>}</span>{l.m>0 && <span style={{fontFamily:MONO, color:T.ink2, whiteSpace:'nowrap'}}>{fmt(l.m)}</span>}</div>)}</div>}
              {x.id==='saldos' && editSaldos && <div style={{margin:cel?'12px 0 0':'12px 0 0 48px'}}><SaldosEditor cuentas={(data.cuentas||[]).filter(k=>esActiva(k['Activa']))} onClose={()=>setEditSaldos(false)} onSaved={()=>{ setEditSaldos(false); if(onRefresh) onRefresh() }} showToast={showToast}/></div>}
            </div> })}
        </div>}
        <div style={{fontSize:11.5, color:T.ink3, marginTop:10, lineHeight:1.5}}>La lista se arma sola con lo que hay cargado: cuando una tarea queda hecha, desaparece. Primero va lo que trae plata, después lo que hay que pagar y al final lo que falta cargar.</div>
      </> })()}
    {tab==='banco' && <RevisarBanco data={data} onRefresh={onRefresh} showToast={showToast}/>}
    {tab==='detalle' && <Egresos data={data} onRefresh={onRefresh} showToast={showToast} embebido/>}
    {tab==='caja' && <>
    <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, padding:'13px 16px', marginBottom:18}}>
      <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}>
        <span style={{fontSize:13, fontWeight:700, color:T.ink, whiteSpace:'nowrap'}}>¿Pagaste algo?</span>
        <input list="caja-previos" value={qa.concepto} onChange={e=>qaConcepto(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') anotarPago() }} placeholder="Qué pagaste (ej: limpieza Vanesa)" style={{...inpV2, flex:'2 1 220px', minWidth:170, width:'auto'}}/>
        <datalist id="caja-previos">{Object.values(previos).map(p=><option key={p.concepto} value={p.concepto}/>)}</datalist>
        <MontoInput value={qa.monto} onChange={v=>setQa(q=>({...q,monto:v}))} onKeyDown={e=>{ if(e.key==='Enter') anotarPago() }} placeholder="Cuánto" style={{...inpV2, flex:'1 1 120px', minWidth:110, width:'auto', textAlign:'right', fontFamily:MONO}}/>
        <select value={qaCuenta} onChange={e=>setQa(q=>({...q,cuenta:e.target.value}))} title="De dónde salió la plata" style={{...inpV2, flex:'1 1 150px', minWidth:140, width:'auto', cursor:'pointer'}}>{cuentaOpts.map(n=><option key={n} value={n}>{n}</option>)}</select>
        <button disabled={qaBusy} onClick={anotarPago} style={{fontSize:13, fontWeight:700, padding:'9px 20px', borderRadius:9, border:'none', background:T.brand, color:'#fff', cursor:qaBusy?'default':'pointer', opacity:qaBusy?0.6:1, whiteSpace:'nowrap'}}>{qaBusy?'Anotando…':'Anotar'}</button>
      </div>
      <div style={{display:'flex', gap:14, alignItems:'center', flexWrap:'wrap', marginTop:9, fontSize:11.5, color:T.ink3}}>
        <span>Para lo que pagás en efectivo o con una transferencia suelta. Lo que sale por débito o con tarjeta entra solo al subir el resumen.</span>
        <span style={{flex:1}}/>
        <label style={{display:'inline-flex', gap:6, alignItems:'center'}}>Rubro <select value={qaRubro} onChange={e=>setQa(q=>({...q,rubro:e.target.value}))} title={qaRub?.incluye||'Los rubros son los de la solapa RUBROS'} style={{fontSize:11.5, padding:'3px 6px', borderRadius:7, border:`1px ${qaRubro?'solid':'dashed'} ${qaRubro?T.border:T.warn}`, background:T.surface, color:qaRubro?T.ink2:T.warn, cursor:'pointer', maxWidth:230}}>{!qaRubro && <option value="">elegir rubro</option>}{rubros.map(r=><option key={r.key} value={r.key}>{r.label}</option>)}</select></label>
        {esDeTrabajo && <label style={{display:'inline-flex', gap:6, alignItems:'center'}}>¿Para qué trabajo? <input list="caja-trabajos" value={qa.trabajo} onChange={e=>setQa(q=>({...q,trabajo:e.target.value}))} onKeyDown={e=>{ if(e.key==='Enter') anotarPago() }} placeholder="N° o cliente" style={{fontSize:11.5, padding:'3px 8px', borderRadius:7, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, width:190, fontFamily:'inherit', outline:'none'}}/><datalist id="caja-trabajos">{trabajosRec.map(t=><option key={t} value={t}/>)}</datalist></label>}
        <label style={{display:'inline-flex', gap:6, alignItems:'center'}}>Fecha <input type="date" value={qa.fecha} max={hoyISO} onChange={e=>setQa(q=>({...q,fecha:e.target.value||hoyISO}))} style={{fontSize:11.5, padding:'3px 6px', borderRadius:7, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontFamily:'inherit'}}/></label>
      </div>
    </div>

    <div style={{display:'grid', gridTemplateColumns:cel?'minmax(0,1fr)':'repeat(4,minmax(0,1fr))', background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, marginBottom:18}}>
      {[
        {l:'Hoy en las cuentas', v:fm(t.cajaHoy), col:t.cajaHoy<0?T.brand:T.ink, s:`${c.cuentas.filter(x=>x.activa&&!x.usd).length} cuentas activas, en pesos`},
        {l:'Entra en el mes', v:'+'+fmt(entra), col:T.pos, s:seguro?`${t.nEntraSeguro} facturas. Afuera quedan ${fmt(t.entra-t.entraSeguro)} de agencias atrasadas.`:`${t.nEntra} facturas, si todos pagan en fecha.`},
        {l:'Falta que salga', v:fmt(t.sale), col:T.ink, s:`a mano ${fmtM(t.mano)} · débito ${fmtM(t.debito)}${t.socios>0?` · socios ${fmtM(t.socios)}`:''} · ya salió ${fmtM(t.yaSalio)}`},
        {l:'Así termina el mes', v:fm(termina), col:termina<0?T.brand:T.ink, s:t.tarjetasFaltan>0?`Sin ${t.tarjetasFaltan===1?'la tarjeta que falta':`las ${t.tarjetasFaltan} tarjetas que faltan`} cargar (las últimas: ${fmtM(t.tarjetasReferencia)}).`:'Con todo lo que está cargado.'},
      ].map((k,i)=><div key={i} style={{padding:'16px 18px', minWidth:0, borderLeft:!cel&&i>0?`1px solid ${T.border}`:'none', borderTop:cel&&i>0?`1px solid ${T.border}`:'none'}}>
        <div style={{fontSize:11, fontWeight:600, letterSpacing:0.5, textTransform:'uppercase', color:T.ink2}}>{k.l}</div>
        <div style={{fontFamily:MONO, fontSize:22, fontWeight:600, letterSpacing:-0.5, marginTop:6, color:k.col}}>{k.v}</div>
        <div style={{fontSize:11.5, color:T.ink2, marginTop:4}}>{k.s}</div>
      </div>)}
    </div>

    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:9}}>
      <span style={{fontSize:11.5, fontWeight:600, letterSpacing:0.5, textTransform:'uppercase', color:T.ink2}}>Semana a semana</span>
      <div style={{display:'flex', border:`1px solid ${T.border}`, borderRadius:9, overflow:'hidden', background:T.surface, marginLeft:-1}}>{seg('seguro',modo,setModo,'Sin los que hoy vienen atrasados')}{seg('fecha',modo,setModo,'Si todos pagan en fecha')}</div>
    </div>
    <div style={{display:'grid', gridTemplateColumns:cel?'minmax(0,1fr)':`repeat(${c.semanas.length},minmax(0,1fr))`, background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, overflow:'hidden'}}>
      {c.semanas.map((s,i)=>{ const q=seguro?s.quedaSeguro:s.queda; return <div key={i} style={{padding:'13px 15px', minWidth:0, background:s.esActual?T.surfaceAlt:'transparent', opacity:s.pasada?0.5:1, borderLeft:!cel&&i>0?`1px solid ${T.border}`:'none', borderTop:cel&&i>0?`1px solid ${T.border}`:'none'}}>
        <div style={{fontSize:11.5, fontWeight:600, color:T.ink2}}>{s.esActual?'Esta semana':`Del ${s.desde} al ${s.hasta}`}</div>
        <div style={{display:'flex', justifyContent:'space-between', gap:8, fontSize:12, marginTop:6, color:T.ink2}}><span>Entra</span><b style={{fontFamily:MONO, fontWeight:500, color:T.pos}}>+{fmt(seguro?s.entraSeguro:s.entra)}</b></div>
        <div style={{display:'flex', justifyContent:'space-between', gap:8, fontSize:12, marginTop:6, color:T.ink2}}><span>Sale</span><b style={{fontFamily:MONO, fontWeight:500, color:T.ink}}>−{fmt(s.sale)}</b></div>
        <div style={{marginTop:9, paddingTop:9, borderTop:`1px solid ${T.border}`, fontSize:11, color:T.ink2}}>{s.pasada?'Ya pasó':'Queda al cierre'}<div style={{fontFamily:MONO, fontSize:16, fontWeight:600, color:q!==null&&q<0?T.brand:T.ink, marginTop:2}}>{q===null?'—':fm(q)}</div></div>
      </div> })}
    </div>
    <div style={{fontSize:12, color:T.ink2, margin:'8px 0 18px'}}>Arranca de lo que hay hoy en las cuentas.{seguro && c.atrasadas.length>0?` No cuenta lo que vence de ${c.atrasadas.join(', ')}, porque hoy tienen facturas vencidas (salvo las que tienen fecha prometida).`:''}{t.nSinDia>0?` Falta restar ${fmt(t.sinDia)} de ${t.nSinDia} gastos sin día de pago.`:''}</div>

    {(t.nVencidoSinFecha>0 || t.atrasadosN>0 || t.nDespues>0) && <div style={{background:T.warnSoft, borderRadius:10, padding:'11px 14px', fontSize:12.5, color:T.ink, display:'flex', flexDirection:'column', gap:6, marginBottom:18}}>
      {t.nVencidoSinFecha>0 && <div><b style={{color:T.warn}}>{t.nVencidoSinFecha} facturas vencidas sin fecha de pago: {fmt(t.vencidoSinFecha)}.</b> No están contadas en lo que entra. Reclamalas y anotá la fecha que prometan: desde ahí se cuentan. <button onClick={()=>goTo&&goTo('facturacion')} style={{border:'none', background:'none', textDecoration:'underline', cursor:'pointer', fontSize:12.5, fontWeight:600, padding:0, color:T.ink}}>Ver por agencia</button></div>}
      {t.nDespues>0 && <div>{t.nDespues} facturas por {fmt(t.despues)} entran después de este mes.</div>}
      {t.atrasadosN>0 && <div><b style={{color:T.warn}}>{t.atrasadosN} cuotas y resúmenes de meses anteriores sin marcar como pagados: {fmt(t.atrasadosMonto)}.</b> Si ya salieron, se marcan en el mes que corresponde.</div>}
    </div>}

    <div style={{display:'grid', gridTemplateColumns:cel?'minmax(0,1fr)':'minmax(0,1.75fr) minmax(0,1fr)', gap:22, alignItems:'start'}}>
      <div>
        <div style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:12}}>
          <div style={{display:'flex', flexWrap:'wrap', border:`1px solid ${T.border}`, borderRadius:9, overflow:'hidden', background:T.surface, marginLeft:-1}}>{seg('todo',filtro,setFiltro,'Todo')}{seg('entra',filtro,setFiltro,'Entra')}{seg('mano',filtro,setFiltro,'Sale a mano')}{seg('debito',filtro,setFiltro,'Sale por débito')}</div>
          {cuentaSel && <button onClick={()=>setCuentaSel('')} style={{fontSize:12, border:`1px solid ${T.ink}`, borderRadius:20, padding:'5px 11px', background:T.surface, cursor:'pointer', color:T.ink}}>Cuenta: {cuentaSel} ✕</button>}
        </div>
        {bloques.map(b=>{ const its=filtro==='entra'?[]:b.items.filter(pasa).sort((x,y)=>(x.dia??99)-(y.dia??99)), conEntra=(filtro==='todo'||filtro==='entra') && !cuentaSel && b.cobros.length>0
          if(!its.length && !conEntra) return null
          const pend=its.filter(i=>!i.pagado && i.tipo!=='falta')
          return <div key={b.key} style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, marginBottom:14, overflow:'hidden'}}>
            <div style={{display:'flex', justifyContent:'space-between', gap:10, flexWrap:'wrap', padding:'11px 16px', background:T.surfaceAlt, fontSize:12.5}}>
              <b style={{fontWeight:600, color:T.ink}}>{b.titulo}</b>
              <span style={{color:T.ink2}}>{conEntra && <>entra <b style={{fontFamily:MONO, color:T.pos}}>+{fmt(b.cobros.reduce((s,x)=>s+x.saldo,0))}</b> · </>}falta que salga <b style={{fontFamily:MONO, color:T.ink}}>{fmt(pend.reduce((s,i)=>s+i.monto,0))}</b></span>
            </div>
            {conEntra && FilaEntra(b)}
            {its.map(Fila)}
          </div> })}
      </div>
      <div>
        <div style={{fontSize:11.5, fontWeight:600, letterSpacing:0.5, textTransform:'uppercase', color:T.ink2, marginBottom:9}}>Cuentas · alcanza hasta el {limite7.getDate()}/{limite7.getMonth()+1}</div>
        <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', marginBottom:18}}>
          {c.cuentas.map((x,i)=>{ const est=x.usd?null:!x.activa?<span style={{fontSize:11, fontWeight:700, padding:'2px 9px', borderRadius:20, background:T.warnSoft, color:T.warn}}>inactiva · saldo del {x.actualizada.split('/').slice(0,2).join('/')||'?'}</span>:x.resto>=0?<span style={{fontSize:11, fontWeight:700, padding:'2px 9px', borderRadius:20, background:T.posSoft, color:T.pos}}>alcanza</span>:<span style={{fontSize:11, fontWeight:700, padding:'2px 9px', borderRadius:20, background:T.brandSoft, color:T.brand}}>faltan {fmt(-x.resto)}</span>
            return <div key={x.nombre} onClick={()=>!x.usd&&setCuentaSel(cuentaSel===x.nombre?'':x.nombre)} style={{padding:'12px 15px', borderTop:i===0?'none':`1px solid ${T.border}`, cursor:x.usd?'default':'pointer', boxShadow:cuentaSel===x.nombre?`inset 3px 0 0 ${T.ink}`:'none'}} title={x.usd?'':'Ver solo lo que sale de esta cuenta'}>
              <div style={{display:'flex', justifyContent:'space-between', gap:10, alignItems:'baseline'}}><span style={{fontSize:13.5, fontWeight:600, color:T.ink}}>{x.nombre}</span><span style={{fontFamily:MONO, fontSize:14, fontWeight:600, color:x.saldo<0?T.brand:T.ink}}>{x.usd?`US$ ${fmt(x.saldoUsd).replace('$','')}`:fm(x.saldo)}</span></div>
              {!x.usd && <div style={{display:'flex', justifyContent:'space-between', gap:8, alignItems:'center', flexWrap:'wrap', marginTop:6, fontSize:11.5, color:T.ink2}}><span>Sale de acá: <b style={{fontFamily:MONO}}>{fmt(x.sale7)}</b></span>{est}</div>}
            </div> })}
        </div>
        {c.revisar.length>0 && <>
          <div style={{fontSize:11.5, fontWeight:600, letterSpacing:0.5, textTransform:'uppercase', color:T.ink2, marginBottom:9}}>Para revisar · datos que ensucian el número</div>
          <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:'4px 15px 10px', marginBottom:18}}>
            {c.revisar.map((r,i)=><div key={i} style={{padding:'9px 0', borderTop:i===0?'none':`1px solid ${T.border}`, fontSize:12.5}}><b style={{fontWeight:600, color:T.ink}}>{r.t}</b><div style={{color:T.ink2, fontSize:11.5, marginTop:2}}>{r.d}</div></div>)}
            <div style={{fontSize:11.5, color:T.ink3, paddingTop:8, borderTop:`1px solid ${T.border}`}}>Se corrigen en la pestaña «Cargar y detalle» (el lápiz de cada gasto) o en la solapa GASTOS_FIJOS.</div>
          </div>
        </>}
      </div>
    </div>
    </>}
    {subir && <SubirResumen datos={data} onClose={()=>setSubir(false)} onDone={()=>{ setSubir(false); if(onRefresh) onRefresh() }} showToast={showToast}/>}
    {extracto && <SubirExtracto data={data} onClose={()=>setExtracto(false)} onDone={()=>{ setExtracto(false); if(onRefresh) onRefresh() }} showToast={showToast}/>}
    {verTickets && <TicketsRevisar data={data} onClose={()=>setVerTickets(false)} onDone={()=>{ if(onRefresh) onRefresh() }} showToast={showToast}/>}
    {agregar && <AgregarEgreso cuentaOpts={c.cuentas.filter(x=>x.activa).map(x=>x.nombre)} cuentas={data.cuentas||[]} mesIdx={mesIdx} anio={anio} onClose={()=>setAgregar(false)} onDone={()=>{ setAgregar(false); if(onRefresh) onRefresh() }} showToast={showToast}/>}
  </>
}

// BANCO · PARA REVISAR: lo que el extracto no reconoció solo. Una persona dice qué es cada movimiento, caso por caso.
// Un cobro puede pagar varias facturas juntas, o una en partes, o venir con una retención: por eso se eligen las
// facturas a mano y se dice qué es la diferencia. Nada se duplica: una factura que ya figuraba cobrada solo queda
// unida al movimiento; una sin cobrar se cobra una vez (con la fecha del banco y sin tocar el saldo de la cuenta).
const DIFS_COBRO=[['retGanancias','Retención de Ganancias'],['retIIBB','Retención de Ingresos Brutos'],['retIVA','Retención de IVA'],['comision','Comisión del banco'],['parcial','Falta pagar esa parte']]
const NOTAS_ENTRO=['Pase entre cuentas','Aporte de un socio','Devolución','Préstamo','Otro'], NOTAS_SALIO=['Sueldos','Pago a un freelancer','Pase entre cuentas','Retiro de un socio','Inversión','Otro']
function RevisarBanco({data, onRefresh, showToast}){
  const cel=useEsCelular()
  const esPagado=esActiva   // "SI" / "SÍ" / TRUE, igual que en las cuentas
  const todos=(data.movimientosBanco||[]).map(r=>{ const entro=parseMonto(r['Entró']), salio=parseMonto(r['Salió']); return {fila:r.__row, clave:String(r['Clave']||'').trim(), cuenta:String(r['Cuenta']||'').trim(), fechaTxt:String(r['Fecha']||'').trim(), fecha:parseD(r['Fecha']), concepto:String(r['Concepto']||'').trim(), detalle:String(r['Detalle']||'').trim(), que:String(r['Qué es']||'').trim(), estado:String(r['Estado']||'').trim(), hoja:String(r['Hoja']||'').trim(), ref:String(r['Ref']||'').trim(), tipo:String(r['Tipo']||'').trim(), monto:entro-salio} }).filter(m=>m.fecha && m.monto)
  const pend=todos.filter(m=>m.estado==='Para revisar'), hechos=todos.filter(m=>m.estado==='Clasificado a mano')
  const cuentas=[...new Set(pend.map(m=>m.cuenta))]
  const [fCuenta,setFCuenta]=useState(''), [fTipo,setFTipo]=useState('todo'), [abierto,setAbierto]=useState(''), [busy,setBusy]=useState(false), [verHechos,setVerHechos]=useState(false)
  // Lo que se está armando para el movimiento abierto
  const [sel,setSel]=useState({}), [dif,setDif]=useState(''), [q,setQ]=useState(''), [modo,setModo]=useState(''), [gSel,setGSel]=useState(''), [nuevo,setNuevo]=useState({concepto:'', rubro:'', trabajo:''}), [nota,setNota]=useState({chip:'', texto:''}), [per,setPer]=useState(''), [selS,setSelS]=useState({})
  const lista=pend.filter(m=>(!fCuenta||m.cuenta===fCuenta) && (fTipo==='todo'||(fTipo==='entro'?m.monto>0:m.monto<0))).sort((a,b)=>Math.abs(b.monto)-Math.abs(a.monto))
  const rubros=(data.rubros||[]).filter(r=>!/^personal/i.test(r.rubro)).map(r=>({key:`${r.rubro}|${r.subrubro}`, label:r.subrubro?`${r.rubro} · ${r.subrubro}`:r.rubro, rubro:r.rubro, subrubro:r.subrubro}))
  const categoriaDe=rubro=>/sueldo/i.test(rubro)?'Sueldos':/impuesto/i.test(rubro)?'Impuestos':/bancari|financ/i.test(rubro)?'Financieros':'Operativos'
  const facturasReales=(data.facturacion||[]).filter(f=>esFacturaReal(f) && !String(f['Nro de Factura']||'').toUpperCase().startsWith('ANULADA') && parseMonto(f['Precio FINAL'])>0)
  const aCand=f=>{ const final=parseMonto(f['Precio FINAL']), cobrada=isCobrada(f), cobrado=parseMonto(f['Monto cobrado']), pendiente=cobrada?0:Math.max(0,final-cobrado); return {fila:f.__row, nro:String(f['N° Presupuesto']||'').trim(), agencia:String(f['Agencia']||f['Cliente']||'').trim(), cliente:String(f['Cliente']||'').trim(), proyecto:String(f['Proyecto']||'').trim(), final, pendiente, vale:cobrada?(cobrado||final):pendiente, cobrada, fechaCobro:String(f['Fecha cobro']||'').trim(), vence:String(f['Vencimiento']||'').trim(), porque:[]} }
  // ---- PAGOS A FREELANCERS: las líneas de PAGOS_STAFF de cada persona (la línea "Somos Magma" no es un pago a nadie)
  const lineasStaff=(data.pagosStaff||[]).map(p=>{ const debe=parseMonto(p['Monto Adeudado'])+parseMonto(p['Viáticos']), pagada=/^(pagado|s[ií]|true)$/i.test(String(p['Estado']||'').trim()); return {hon:parseMonto(p['Monto Adeudado']), viat:parseMonto(p['Viáticos']), fila:p.__row, persona:String(p['Freelancer']||'').trim(), mes:String(p['Mes Referencia']||'').trim(), nro:String(p['N° Presupuesto']||'').trim(), proyecto:String(p['Proyecto']||'').trim(), servicio:String(p['Servicio']||'').trim(), pagada, vale:pagada?(parseMonto(p['Monto Pagado'])||debe):debe, fPago:parseD(p['Fecha Pago'])} }).filter(x=>x.persona && x.vale>0 && !esMagma(x.persona))
  const personasStaff=[...new Set(lineasStaff.map(x=>x.persona))].sort()
  // Las líneas de una persona que pueden ser este pago: lo que se le debe, y lo que figura pagado por esos días
  const lineasDe=(persona,m)=>lineasStaff.filter(x=>normTxt(x.persona)===normTxt(persona) && (!x.pagada || (x.fPago && Math.abs(x.fPago-m.fecha)/864e5<=12))).sort((a,b)=>Number(a.pagada)-Number(b.pagada) || b.fila-a.fila)
  // A quién puede ser: el dueño del CUIT (RRHH), o alguien a quien se le debe (o se le pagó por esos días) justo ese monto
  const cuitPersona={}; (data.rrhh||[]).forEach(r=>{ const c=String(r['CUIT/CUIL']||'').replace(/\D/g,''); if(c.length===11) cuitPersona[c]=String(r['Nombre Apellido']||'').trim() })
  const quizasStaff=m=>{ const B=-m.monto, out=[], c=(`${m.concepto} ${m.detalle}`.match(/\b((?:20|23|24|27)\d{9})\b/)||[])[1]
    if(c && cuitPersona[c]) out.push({persona:canonStaff(cuitPersona[c]), por:'es su CUIT', filas:[]})
    const g={}; lineasStaff.forEach(x=>{ if(x.pagada && !(x.fPago && Math.abs(x.fPago-m.fecha)/864e5<=6)) return; const k=`${x.persona}|${x.pagada?'p'+x.fPago.getTime():x.mes}`; g[k]=g[k]||{persona:x.persona, pagada:x.pagada, mes:x.mes, total:0, filas:[]}; g[k].total+=x.vale; g[k].filas.push(x.fila) })
    Object.values(g).filter(x=>Math.abs(x.total-B)<1).forEach(x=>{ const ya=out.find(o=>normTxt(o.persona)===normTxt(x.persona)); if(ya){ if(!ya.filas.length){ ya.filas=x.filas; ya.por=x.pagada?'figura pagado ese monto por esos días':`se le debe justo eso de ${x.mes}` } } else out.push({persona:x.persona, por:x.pagada?'figura pagado ese monto por esos días':`se le debe justo eso de ${x.mes}`, filas:x.filas}) })
    // Si se sabe quién es por el CUIT y no hay un grupo que dé justo, el que queda a menos de medio por ciento
    // (una comisión o un redondeo): se propone elegido igual, y la pantalla muestra la diferencia.
    const suyo=out.find(o=>o.por==='es su CUIT')
    if(suyo){ const cerca=Object.values(g).filter(x=>normTxt(x.persona)===normTxt(suyo.persona) && Math.abs(x.total-B)<=B*0.005).sort((p,q)=>Math.abs(p.total-B)-Math.abs(q.total-B))[0]; if(cerca){ suyo.filas=cerca.filas; suyo.por=cerca.pagada?'es su CUIT y figura pagado casi ese monto por esos días':`es su CUIT y se le debe casi eso de ${cerca.mes}` } }
    return out }
  // ---- LO QUE YA SE CONTESTÓ UNA VEZ: si un movimiento va a la misma cuenta que otro que ya se revisó (mismo CUIT), o es
  // el mismo concepto por el mismo monto, se propone la misma respuesta y queda un clic. Los CUIT propios (el de la
  // empresa, que BBVA pone en todas sus transferencias) no identifican a nadie.
  const propios=new Set(); (data.cuentas||[]).forEach(c=>{ for(const x of `${c['Datos transferencia adicionales']||''} ${c['Notas']||''}`.matchAll(/\b(\d{2})-?(\d{8})-?(\d)\b/g)) propios.add(x[1]+x[2]+x[3]) })
  // …y el del titular de cada cuenta: "Santander Lucia" está a nombre de Lulu, y su CUIT aparece en sus pases y en sus impuestos.
  const palabrasNombre=t=>normTxt(t).split(/[^a-z0-9ñ]+/).filter(w=>w.length>=3).sort().join(' ')
  ;(data.cuentas||[]).forEach(c=>{ const tit=palabrasNombre(c['Titular']); if(!tit) return; (data.rrhh||[]).forEach(r=>{ const cu=String(r['CUIT/CUIL']||'').replace(/\D/g,''); if(cu.length===11 && palabrasNombre(r['Nombre Apellido'])===tit) propios.add(cu) }) })
  const cuitDe=m=>{ const c=(`${m.concepto} ${m.detalle}`.match(/\b((?:20|23|24|27|30|33|34)\d{9})\b/)||[])[1]||''; return c&&!propios.has(c)?c:'' }
  const raizDe=m=>`${m.concepto.replace(/\d+/g,'').replace(/\s+/g,' ').trim()}|${Math.abs(m.monto).toFixed(2)}`
  const recuerdoDe=m=>{ const c=cuitDe(m), r=raizDe(m)
    const h=hechos.filter(x=>(x.monto>0)===(m.monto>0) && !['FACTURACION','PRESTAMOS','TARJETAS','IMPUESTOS'].includes(x.hoja)).sort((a,b)=>b.fecha-a.fecha).find(x=>c?cuitDe(x)===c:(!cuitDe(x)&&raizDe(x)===r))
    if(!h) return null
    // Por CUIT: solo si todo lo que se revisó de esa cuenta se contestó igual. Si hubo respuestas distintas, no se propone nada.
    if(c && new Set(hechos.filter(x=>cuitDe(x)===c).map(x=>x.que.replace(/\s*[·(].*$/,''))).size>1) return null
    // Por concepto y monto no se identifica a una persona: un "Pago a…" no se repite (dos pagos de $220.000 son de dos personas).
    if(!c && /^pago a/i.test(h.que)) return null
    const por=c?(m.monto>0?'vino de la misma cuenta':'fue a la misma cuenta'):'mismo concepto y mismo monto', persona=((h.que.match(/^Pago a ([^·:(]+)/)||[])[1]||'').trim()
    if(h.hoja==='PAGOS_STAFF' && persona) return {h, por, tipo:'staff', persona, texto:`Pago a ${persona}`}
    if(h.hoja==='GASTOS_FIJOS' && h.ref){ const g=(data.gastosFijos||[]).find(x=>String(x.__row)===h.ref); if(!g) return null
      if(/[uú]nico/i.test(String(g['Frecuencia']||''))){ const key=`${String(g['Rubro']||'').trim()}|${String(g['Subrubro']||'').trim()}`; return rubros.some(x=>x.key===key)?{h, por, tipo:'nuevo', concepto:String(g['Concepto']||'').trim(), rubro:key, texto:h.que}:null }
      // Un gasto de todos los meses: solo si sigue activo y el monto es parecido al previsto
      const previsto=parseMonto(g['Monto']); if(!esActiva(g['Activo']||'SI') || !(previsto>0) || Math.abs(previsto-Math.abs(m.monto))>previsto*0.15) return null
      return {h, por, tipo:'gasto', filaGasto:g.__row, texto:String(g['Concepto']||'').trim()} }
    if(!h.hoja) return {h, por, tipo:'anotar', texto:h.que}
    return null }
  function abrir(m, forzar, persona){
    if(abierto===m.clave && !forzar){ setAbierto(''); return }
    setAbierto(m.clave); setDif(''); setQ(''); setGSel(''); setNota({chip:'', texto:''}); setNuevo({concepto:(m.detalle||m.concepto).replace(/\s*·\s*.*$/,'').slice(0,60), rubro:'', trabajo:''})
    if(m.monto>0){ const c=facturasCandidatas(m, data, {filaMov:m.fila}); setSel(Object.fromEntries(c.candidatas.filter(x=>c.sumanJusto.includes(x.fila)).map(x=>[x.fila,x]))); setModo('factura') }
    else { setSel({})
      // Si parece un pago a un freelancer (es su CUIT, o se le debe justo ese monto), se abre por ahí con sus líneas elegidas
      const qs=quizasStaff(m), sug=persona?qs.find(x=>normTxt(x.persona)===normTxt(persona)):qs[0]
      if(forzar==='staff' || qs.length){ setModo('staff'); setPer(persona||sug.persona); setSelS(Object.fromEntries(((sug&&sug.filas)||[]).map(f=>[f,true]))) }
      else { setModo('lista'); setPer(''); setSelS({}) } }
  }
  const post=async (url,body)=>{ const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const j=await r.json().catch(()=>({})); return {status:r.status, j} }
  // PRIMERO se une el movimiento y DESPUÉS se cobra o se crea el gasto. Así, si algo falla a mitad de camino, el
  // movimiento ya no está en la lista y no se puede mandar dos veces (un cobro parcial repetido sumaría de nuevo).
  async function unir(m, body){ const {j}=await post('/api/extracto-clasificar',{fila:m.fila, clave:m.clave, ...body}); if(!j.ok){ showToast(j.error||'Error','err'); return null } return j }
  async function cerrar(msg, err){ showToast(msg, err?'err':undefined); setAbierto(''); if(onRefresh) await onRefresh() }
  async function clasificar(m, body, ok){ const j=await unir(m, body); if(!j) return false; await cerrar(ok+(j.marcado?` · marcado pagado: ${j.marcado}`:'')); return true }
  // Un cobro → una o varias facturas. Las que ya figuraban cobradas no se tocan; las otras se cobran una sola vez.
  async function guardarFacturas(m){
    const elegidas=Object.values(sel); if(!elegidas.length||busy) return
    const sinCobrar=elegidas.filter(c=>!c.cobrada), suma=elegidas.reduce((s,c)=>s+c.vale,0), D=Math.round((suma-m.monto)*100)/100
    const base=sinCobrar.reduce((s,c)=>s+c.pendiente,0), ultima=sinCobrar[sinCobrar.length-1]
    if(D>=1 && sinCobrar.length && !dif){ showToast('Elegí qué es la diferencia','err'); return }
    if(D>=1 && sinCobrar.length && dif==='parcial' && D>=ultima.pendiente-1){ showToast(`La diferencia es más grande que la última factura (#${ultima.nro}): sacá una factura de la lista`,'err'); return }
    if(D>=1 && sinCobrar.length && dif!=='parcial' && D>base*0.35){ showToast('Es demasiado para ser una retención o una comisión. Si no pagaron todo, elegí "Falta pagar esa parte"','err'); return }
    setBusy(true)
    try{
      const nros=elegidas.map(c=>c.nro), agencias=[...new Set(elegidas.map(c=>c.agencia))]
      const difTxt=D>=1?` · diferencia ${fmt(D)}${sinCobrar.length?`: ${(DIFS_COBRO.find(x=>x[0]===dif)||[])[1]||''}`:''}`:D<=-1?` · entraron ${fmt(-D)} de más`:''
      if(!(await unir(m,{queEs:`${nros.length===1?'Factura':'Facturas'} ${nros.map(n=>'#'+n).join(', ')} · ${agencias.join(' / ')}${difTxt}`, hoja:'FACTURACION', ref:nros.join(', '), tipo:'Cobro'}))){ setBusy(false); return }
      // La retención se reparte en proporción; la última se lleva el resto para que la suma dé exacta.
      let repartido=0; const fallaron=[]
      for(let k=0;k<sinCobrar.length;k++){ const c=sinCobrar[k], esUltima=k===sinCobrar.length-1
        let body={nroPresupuesto:c.nro, cuentaDestino:m.cuenta, formaPago:'Transferencia', fechaCobro:m.fechaTxt, historico:true, notas:`Desde el extracto del banco (${m.fechaTxt})`, tipoCobro:'total', monto:c.pendiente}
        if(D>=1 && dif==='parcial'){ if(esUltima) body={...body, tipoCobro:'parcial', monto:Math.round((c.pendiente-D)*100)/100} }
        else if(D>=1 && base>0){ const parte=esUltima?Math.round((D-repartido)*100)/100:Math.round(D*c.pendiente/base*100)/100; repartido+=parte; if(parte>0) body={...body, [dif]:parte} }
        const {status,j}=await post('/api/factura-cobro',body)
        if(!j.ok && status!==409) fallaron.push(`#${c.nro}${j.error?` (${j.error})`:''}`)   // 409 = ya estaba cobrada: se sigue
      }
      if(fallaron.length) await cerrar(`El movimiento quedó unido, pero no pude cobrar ${fallaron.join(', ')}. Cobrala desde Facturación con fecha ${m.fechaTxt}.`, true)
      else await cerrar(sinCobrar.length?`${sinCobrar.length} ${sinCobrar.length===1?'factura cobrada':'facturas cobradas'} ✓`:'Unido ✓')
    }catch(e){ await cerrar('Se cortó la conexión a mitad de camino. Actualicé los datos: mirá cómo quedó antes de volver a intentar.', true) }
    setBusy(false)
  }
  async function guardarGasto(m, op){
    if(!op||busy) return; setBusy(true)
    try{ const B=-m.monto; await clasificar(m,{queEs:`${op.label}${Math.abs(op.monto-B)>=1?` (previsto ${fmt(op.monto)}, el banco dice ${fmt(B)})`:''}`, hoja:op.hoja, ref:String(op.fila), marcar:{hoja:op.hoja, fila:op.fila, mesKey:op.mesKey}, tipo:op.hoja==='PRESTAMOS'?'Cuota de préstamo':op.hoja==='TARJETAS'?'Pago de tarjeta':'Transferencia'}, 'Unido ✓') }catch(e){ showToast('Error de conexión','err') }
    setBusy(false)
  }
  async function crearGasto(m, concepto, r, nroTrabajo){
    const base={queEs:`${concepto} · ${r.label}${nroTrabajo?` · trabajo #${nroTrabajo}`:''}`, hoja:'GASTOS_FIJOS', tipo:'Transferencia'}
    try{ if(!(await unir(m,{...base, ref:''}))) return
      const {j}=await post('/api/gasto-nuevo',{categoria:categoriaDe(r.rubro), rubro:r.rubro, subrubro:r.subrubro, nroTrabajo, concepto, monto:-m.monto, moneda:'ARS', recurrencia:'unico', diaPago:m.fecha.getDate(), mes:m.fecha.getMonth()+1, anio:m.fecha.getFullYear(), pagado:true, cuentaPago:m.cuenta, fechaPago:m.fechaTxt, medio:'Transferencia', tipo:'gasto', sinTocarSaldo:true})
      if(!j.ok){ await cerrar(`El movimiento quedó anotado, pero no se creó el gasto (${j.error||'error'}). Reabrilo desde "ya revisados" y volvé a intentar.`, true); return }
      // La fila del gasto recién creado queda en el movimiento: con eso la próxima vez se propone el mismo rubro
      if(j.fila){ try{ await post('/api/extracto-clasificar',{fila:m.fila, clave:m.clave, ...base, ref:String(j.fila)}) }catch(e){ /* el gasto y el movimiento ya quedaron: solo se pierde el recuerdo */ } }
      await cerrar('Gasto anotado ✓')
    }catch(e){ await cerrar('Se cortó la conexión a mitad de camino. Actualicé los datos: mirá cómo quedó antes de volver a intentar.', true) }
  }
  async function guardarNuevo(m){
    if(busy) return; const concepto=nuevo.concepto.trim(); if(!concepto){ showToast('Poné qué fue','err'); return }
    const r=rubros.find(x=>x.key===nuevo.rubro); if(!r){ showToast('Elegí el rubro','err'); return }
    setBusy(true); await crearGasto(m, concepto, r, (nuevo.trabajo.match(/\d{3,}/)||[''])[0]); setBusy(false)
  }
  // Un pago a un freelancer: las líneas que estaban pendientes quedan pagadas con la fecha del banco; las que ya
  // figuraban pagadas solo quedan unidas. Va todo en un solo pedido al servidor.
  async function guardarStaff(m, persona, elegidas){
    if(busy||!elegidas.length) return; setBusy(true)
    try{ const B=-m.monto, S=elegidas.reduce((t,x)=>t+x.vale,0), aMarcar=elegidas.filter(x=>!x.pagada), nros=[...new Set(elegidas.map(x=>x.nro).filter(Boolean))]
      persona=elegidas[0].persona   // como está escrita en Pagos Staff, no como se tipeó
      // Si lo que salió es justo el honorario con 21% de IVA (más viáticos), se guarda así, como cuando se paga con IVA desde Pagos Staff
      const conIVA=aMarcar.length===elegidas.length && aMarcar.length>0 && Math.abs(aMarcar.reduce((t,x)=>t+x.hon*1.21+x.viat,0)-B)<2
      if(conIVA){ await clasificar(m,{queEs:`Pago a ${persona} · ${elegidas.length} ${elegidas.length===1?'trabajo':'trabajos'}${nros.length?` (${nros.map(n=>'#'+n).join(', ')})`:''} · con IVA`, hoja:'PAGOS_STAFF', ref:elegidas.map(x=>x.fila).join(', '), tipo:'Pago a freelancer', staff:{persona, filas:aMarcar.map(x=>x.fila), conIVA:true}}, `${aMarcar.length} ${aMarcar.length===1?'trabajo marcado pagado':'trabajos marcados pagados'} con IVA ✓`); setBusy(false); return }
      await clasificar(m,{queEs:`Pago a ${persona} · ${elegidas.length} ${elegidas.length===1?'trabajo':'trabajos'}${nros.length?` (${nros.map(n=>'#'+n).join(', ')})`:''}${Math.abs(S-B)>=1?` · las líneas suman ${fmt(S)} y el banco dice ${fmt(B)}`:''}`, hoja:'PAGOS_STAFF', ref:elegidas.map(x=>x.fila).join(', '), tipo:'Pago a freelancer', staff:{persona, filas:aMarcar.map(x=>x.fila)}}, aMarcar.length?`${aMarcar.length} ${aMarcar.length===1?'trabajo marcado pagado':'trabajos marcados pagados'} ✓`:'Unido ✓')
    }catch(e){ showToast('Error de conexión','err') }
    setBusy(false)
  }
  // "Es lo mismo que la vez pasada": un clic. Un pago a un freelancer no se repite solo: se abre con la persona elegida.
  async function repetir(m, rec){
    if(busy) return
    if(rec.tipo==='staff'){ abrir(m,'staff',rec.persona); return }
    setBusy(true)
    try{
      if(rec.tipo==='anotar') await clasificar(m,{queEs:rec.h.que, tipo:rec.h.tipo}, 'Anotado ✓')
      else if(rec.tipo==='gasto') await clasificar(m,{queEs:rec.texto, hoja:'GASTOS_FIJOS', ref:String(rec.filaGasto), marcar:{hoja:'GASTOS_FIJOS', fila:rec.filaGasto, mesKey:`${m.fecha.getMonth()+1}/${m.fecha.getFullYear()}`}, tipo:'Transferencia'}, 'Unido ✓')
      else if(rec.tipo==='nuevo') await crearGasto(m, rec.concepto, rubros.find(x=>x.key===rec.rubro), '')
    }catch(e){ showToast('Error de conexión','err') }
    setBusy(false)
  }
  async function guardarNota(m){
    if(busy) return; if(!nota.chip){ showToast('Elegí qué es','err'); return }
    if(nota.chip==='Otro' && !nota.texto.trim()){ showToast('Escribí qué es','err'); return }
    setBusy(true)
    try{ await clasificar(m,{queEs:nota.chip==='Otro'?nota.texto.trim():`${nota.chip}${nota.texto.trim()?`: ${nota.texto.trim()}`:''}`, tipo:/pase/i.test(nota.chip)?'Pase entre cuentas':/sueldo/i.test(nota.chip)?'Sueldos':''}, 'Anotado ✓') }catch(e){ showToast('Error de conexión','err') }
    setBusy(false)
  }
  async function reabrir(m){ if(busy) return; setBusy(true); try{ const {j}=await post('/api/extracto-clasificar',{fila:m.fila, clave:m.clave, accion:'reabrir'}); if(!j.ok) showToast(j.error||'Error','err'); else { showToast('Volvió a "para revisar"'); if(onRefresh) await onRefresh() } }catch(e){ showToast('Error de conexión','err') } setBusy(false) }

  const chipF=on=>({fontSize:12, fontWeight:600, padding:'6px 12px', borderRadius:20, border:`1px solid ${on?T.ink:T.border}`, background:on?T.ink:T.surface, color:on?'#fff':T.ink2, cursor:'pointer', whiteSpace:'nowrap'})
  const seg=on=>({fontSize:12.5, fontWeight:on?700:500, padding:'7px 12px', borderRadius:8, border:`1px solid ${on?T.brand:T.border}`, background:on?T.brandSoft:T.surface, color:on?T.brand:T.ink2, cursor:'pointer'})
  const btnOk=dis=>({fontSize:13, fontWeight:700, padding:'9px 16px', borderRadius:9, border:'none', background:dis?T.ink3:T.brand, color:'#fff', cursor:dis?'default':'pointer'})
  const dm=d=>`${d.getDate()}/${d.getMonth()+1}`
  // El nombre de quien pagó o cobró, sin los números de cuenta que le pone el banco adelante. Si el banco no lo dice, el concepto.
  const quienDe=m=>m.detalle.replace(/^CTE\s+\d+\s*/i,'').replace(/^CTA\.(ORIGEN|DESTINO):\s*/i,'').replace(/^[\d-]{6,}\s*/,'').replace(/^[-·\s]+/,'').trim() || m.concepto
  const totEntro=pend.filter(m=>m.monto>0).reduce((s,m)=>s+m.monto,0), totSalio=pend.filter(m=>m.monto<0).reduce((s,m)=>s-m.monto,0)

  return <>
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:12, flexWrap:'wrap', marginBottom:12}}>
      <div style={{fontSize:15, fontWeight:700, color:T.ink}}>{pend.length?`${pend.length} ${pend.length===1?'movimiento':'movimientos'} del banco para revisar`:'Nada para revisar'}</div>
      {pend.length>0 && <div style={{fontSize:12.5, color:T.ink2}}>entró <b style={{fontFamily:MONO, color:T.pos}}>{fmt(totEntro)}</b> · salió <b style={{fontFamily:MONO, color:T.ink}}>{fmt(totSalio)}</b></div>}
    </div>
    <div style={{fontSize:12.5, color:T.ink2, marginBottom:14, lineHeight:1.5}}>Son los que el extracto no pudo unir solo. Abrí cada uno y decí qué es. Nada se duplica: una factura que ya figuraba cobrada solo queda unida al movimiento, y ningún saldo se toca.</div>
    {pend.length>0 && <div style={{display:'flex', gap:7, flexWrap:'wrap', marginBottom:12}}>
      {[['todo','Todo'],['entro','Entró'],['salio','Salió']].map(([k,l])=><button key={k} onClick={()=>setFTipo(k)} style={chipF(fTipo===k)}>{l}</button>)}
      {cuentas.length>1 && <span style={{width:1, background:T.border, margin:'0 4px'}}/>}
      {cuentas.length>1 && [['','Todas las cuentas'],...cuentas.map(c=>[c,c])].map(([k,l])=><button key={k} onClick={()=>setFCuenta(k)} style={chipF(fCuenta===k)}>{l}</button>)}
    </div>}
    {lista.length>0 && <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, overflow:'hidden'}}>
      {lista.map((m,i)=>{ const ab=abierto===m.clave, entra=m.monto>0, B=Math.abs(m.monto)
        const cand=ab&&entra?facturasCandidatas(m, data, {filaMov:m.fila}):null
        const ql=q.trim().toLowerCase()
        const buscadas=ab&&entra&&ql.length>=2?facturasReales.filter(f=>[f['Agencia'],f['Cliente'],f['Proyecto'],f['N° Presupuesto'],f['Nro de Factura'],String(Math.round(parseMonto(f['Precio FINAL'])))].some(v=>String(v||'').toLowerCase().includes(ql))).slice(0,25).map(aCand):null
        const visibles=ab&&entra?[...Object.values(sel), ...(buscadas||cand.candidatas).filter(c=>!sel[c.fila])].slice(0,ql?30:12):[]
        const elegidas=Object.values(sel), suma=elegidas.reduce((s,c)=>s+c.vale,0), D=suma-B, sinCobrar=elegidas.filter(c=>!c.cobrada)
        // Para lo que salió: gastos fijos del mes, cuotas y resúmenes de tarjeta de esos días, los de monto más parecido primero
        const ops=ab&&!entra?[
          ...(data.gastosFijos||[]).filter(g=>String(g['Concepto']||'').trim() && parseMonto(g['Monto'])>0 && esActiva(g['Activo']||'SI') && !/^tarjeta$/i.test(String(g['Medio de pago']||'').trim())).map(g=>{ const unico=/[uú]nico/i.test(String(g['Frecuencia']||'')); if(unico && !(parseInt(g['Mes carga'])===m.fecha.getMonth()+1 && String(g['Año carga']).includes(String(m.fecha.getFullYear())))) return null
            const mesKey=`${m.fecha.getMonth()+1}/${m.fecha.getFullYear()}`, pagado=unico?esPagado(g['Pagado']):String(g['Meses pagados']||'').split(',').map(s=>s.trim()).includes(mesKey)
            return {id:`GASTOS_FIJOS:${g.__row}`, hoja:'GASTOS_FIJOS', fila:g.__row, mesKey:unico?'':mesKey, monto:parseMonto(g['Monto']), label:String(g['Concepto']).trim(), pagado} }).filter(Boolean),
          ...(data.prestamos||[]).map(p=>{ const v=parseD(p['Vencimiento']); if(!v||Math.abs(v-m.fecha)/864e5>25) return null; return {id:`PRESTAMOS:${p.__row}`, hoja:'PRESTAMOS', fila:p.__row, mesKey:'', monto:parseMonto(p['Monto cuota']), label:`Préstamo ${p['Prestamo']} · ${p['Cuota nro']}`, pagado:esPagado(p['Pagado'])} }).filter(Boolean),
          ...(data.tarjetas||[]).map(t=>{ const v=parseD(t['Vencimiento']); if(!v||Math.abs(v-m.fecha)/864e5>25) return null; return {id:`TARJETAS:${t.__row}`, hoja:'TARJETAS', fila:t.__row, mesKey:'', monto:parseMonto(t['Monto']), label:`${t['Tarjeta']} · resumen de ${t['Mes']}/${t['Año']}`, pagado:esPagado(t['Pagado'])} }).filter(Boolean),
        ].sort((a,b)=>Math.abs(a.monto-B)-Math.abs(b.monto-B)):[]
        const op=ops.find(o=>o.id===gSel)
        const rec=ab?null:recuerdoDe(m)
        return <div key={m.clave} style={{borderTop:i?`1px solid ${T.border}`:'none', background:ab?T.bg:'transparent'}}>
          <div onClick={()=>abrir(m)} style={{display:'grid', gridTemplateColumns:cel?'44px minmax(0,1fr) auto':'52px minmax(0,1fr) auto 96px', gap:cel?9:14, alignItems:'center', padding:cel?'12px 14px':'12px 18px', cursor:'pointer'}}>
            <span style={{fontFamily:MONO, fontSize:12, color:T.ink3}}>{dm(m.fecha)}</span>
            <span style={{minWidth:0}}>
              <span style={{display:'block', fontSize:13.5, fontWeight:600, color:T.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{quienDe(m)}</span>
              <span style={{display:'block', fontSize:11.5, color:T.ink3, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{m.cuenta} · {m.concepto}{/^¿/.test(m.que)?` · ${m.que}`:''}</span>
              {rec && <span style={{display:'block', fontSize:11.5, color:T.pos, marginTop:2}}>Como el {dm(rec.h.fecha)} ({rec.por}): <b>{rec.texto}</b>{cel && <button disabled={busy} onClick={e=>{ e.stopPropagation(); repetir(m,rec) }} style={{marginLeft:8, fontSize:11.5, fontWeight:700, padding:'3px 9px', borderRadius:7, border:`1px solid ${T.pos}`, background:T.posSoft, color:T.pos, cursor:'pointer'}}>{rec.tipo==='staff'?'Ver':'Es lo mismo'}</button>}</span>}
            </span>
            <span style={{fontFamily:MONO, fontSize:14, fontWeight:600, color:entra?T.pos:T.ink, whiteSpace:'nowrap'}}>{entra?'+':'−'}{fmt(B)}</span>
            {!cel && (rec ? <button disabled={busy} onClick={e=>{ e.stopPropagation(); repetir(m,rec) }} style={{fontSize:12, fontWeight:700, padding:'6px 8px', borderRadius:8, border:`1px solid ${T.pos}`, background:T.posSoft, color:T.pos, cursor:'pointer', whiteSpace:'nowrap'}}>{rec.tipo==='staff'?'Ver':'Es lo mismo'}</button> : <span style={{fontSize:12, fontWeight:600, color:ab?T.ink2:T.brand, textAlign:'right'}}>{ab?'cerrar':'¿Qué es?'}</span>)}
          </div>
          {ab && <div style={{padding:cel?'2px 14px 16px':'2px 18px 18px 84px'}}>
            <div style={{display:'flex', gap:7, flexWrap:'wrap', marginBottom:12}}>
              {(entra?[['factura','Es el cobro de una factura'],['anotar','Es otra cosa']]:[['staff','Un pago a un freelancer'],['lista','Un gasto de la lista'],['nuevo','Un gasto nuevo'],['anotar','Solo anotar qué es']]).map(([k,l])=><button key={k} onClick={()=>setModo(k)} style={seg(modo===k)}>{l}</button>)}
            </div>

            {entra && modo==='factura' && <>
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar otra factura: agencia, cliente, N° o monto" style={{...inpV2, marginBottom:8}}/>
              {!ql && cand.sumanJusto.length>0 && <div style={{fontSize:12, color:T.pos, marginBottom:6}}>{cand.sumanJusto.length===1?'Esta factura es justo lo que entró':'Estas facturas suman justo lo que entró'}: ya {cand.sumanJusto.length===1?'está elegida':'están elegidas'}.</div>}
              {visibles.length===0 && <div style={{fontSize:12.5, color:T.ink3, padding:'8px 0'}}>{ql?'Ninguna factura con eso.':'No encontré facturas parecidas. Buscala arriba.'}</div>}
              {visibles.map(c=><label key={c.fila} style={{display:'grid', gridTemplateColumns:'18px minmax(0,1fr) auto', gap:10, alignItems:'center', padding:'7px 0', borderTop:`1px solid ${T.border}`, cursor:'pointer', fontSize:12.5}}>
                <input type="checkbox" checked={!!sel[c.fila]} onChange={e=>setSel(s=>{ const x={...s}; if(e.target.checked) x[c.fila]=c; else delete x[c.fila]; return x })} style={{width:16, height:16, accentColor:T.brand}}/>
                <span style={{minWidth:0}}><b style={{color:T.ink}}>#{c.nro} · {c.agencia}</b><span style={{color:T.ink2}}>{c.cliente&&c.cliente!==c.agencia?` · ${c.cliente}`:''}{c.proyecto?` · ${c.proyecto}`:''}</span>
                  <span style={{display:'block', fontSize:11.5, color:c.cobrada?T.ink3:T.warn, marginTop:1}}>{c.cobrada?`ya figura cobrada${c.fechaCobro?` el ${c.fechaCobro}`:''}: solo se une`:`sin cobrar${c.vence?` · vence ${c.vence}`:''}${c.pendiente<c.final-1?` · falta ${fmt(c.pendiente)} de ${fmt(c.final)}`:''}`}{c.porque&&c.porque.length?` · ${c.porque.join(' · ')}`:''}</span></span>
                <span style={{fontFamily:MONO, fontWeight:600, color:T.ink, whiteSpace:'nowrap'}}>{fmt(c.vale)}</span>
              </label>)}
              {elegidas.length>0 && <div style={{marginTop:12, padding:'11px 13px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, fontSize:12.5, color:T.ink, lineHeight:1.6}}>
                Entró <b style={{fontFamily:MONO}}>{fmt(B)}</b> · {elegidas.length===1?'la factura elegida es de':`las ${elegidas.length} elegidas suman`} <b style={{fontFamily:MONO}}>{fmt(suma)}</b>
                {Math.abs(D)<1 ? <span style={{color:T.pos, fontWeight:600}}> · cierra justo</span>
                  : D>0 ? <span style={{color:T.warn, fontWeight:600}}> · entraron {fmt(D)} menos</span>
                  : <span style={{color:T.warn, fontWeight:600}}> · entraron {fmt(-D)} de más: elegí otra factura, o guardá así y queda anotado</span>}
                {D>=1 && sinCobrar.length>0 && <div style={{marginTop:8}}><div style={{fontSize:11.5, color:T.ink2, marginBottom:5}}>¿Qué son esos {fmt(D)}?</div><div style={{display:'flex', gap:6, flexWrap:'wrap'}}>{DIFS_COBRO.map(([k,l])=><button key={k} onClick={()=>setDif(k)} style={seg(dif===k)}>{l}</button>)}</div>
                  {dif==='parcial' && <div style={{fontSize:11.5, color:T.ink2, marginTop:6}}>{sinCobrar.length>1?`Las primeras quedan cobradas enteras y la última (#${sinCobrar[sinCobrar.length-1].nro}) queda con ${fmt(D)} por cobrar.`:`La factura queda con ${fmt(D)} por cobrar.`}</div>}
                  {dif && dif!=='parcial' && sinCobrar.length>1 && <div style={{fontSize:11.5, color:T.ink2, marginTop:6}}>Se reparte entre las {sinCobrar.length} facturas sin cobrar, en proporción a su monto.</div>}</div>}
                {D>=1 && sinCobrar.length===0 && <div style={{fontSize:11.5, color:T.ink2, marginTop:4}}>Las elegidas ya figuraban cobradas: no se cambia nada en ellas, la diferencia queda anotada en el movimiento.</div>}
              </div>}
              <div style={{marginTop:12}}><button disabled={busy||!elegidas.length} onClick={()=>guardarFacturas(m)} style={btnOk(busy||!elegidas.length)}>{busy?'Guardando…':sinCobrar.length?`Guardar y cobrar ${sinCobrar.length===1?'la factura':`las ${sinCobrar.length} facturas`}`:'Guardar: es esto'}</button></div>
            </>}

            {!entra && modo==='staff' && (()=>{ const sugeridos=quizasStaff(m), lineas=per?lineasDe(per,m):[], elegidasS=lineas.filter(x=>selS[x.fila]), S=elegidasS.reduce((t,x)=>t+x.vale,0), aMarcar=elegidasS.filter(x=>!x.pagada)
              return <>
                {sugeridos.length>0 && <div style={{display:'flex', gap:6, flexWrap:'wrap', alignItems:'center', marginBottom:9}}><span style={{fontSize:12, color:T.ink2}}>Puede ser:</span>{sugeridos.map(x=><button key={x.persona+x.por} onClick={()=>{ setPer(x.persona); setSelS(Object.fromEntries(x.filas.map(f=>[f,true]))) }} style={seg(normTxt(per)===normTxt(x.persona))}>{x.persona} · {x.por}</button>)}</div>}
                <input list="banco-freelancers" value={per} onChange={e=>{ setPer(e.target.value); setSelS({}) }} placeholder="A quién se le pagó" style={{...inpV2, marginBottom:8}}/>
                <datalist id="banco-freelancers">{personasStaff.map(p=><option key={p} value={p}/>)}</datalist>
                {per && lineas.length===0 && <div style={{fontSize:12.5, color:T.ink2, padding:'6px 0 10px', lineHeight:1.5}}>No encuentro trabajos de {per} pendientes ni pagados por esos días en Pagos Staff. Si igual fue un pago a esa persona, guardalo con "Solo anotar qué es".</div>}
                {lineas.map(x=><label key={x.fila} style={{display:'grid', gridTemplateColumns:'18px minmax(0,1fr) auto', gap:10, alignItems:'center', padding:'7px 0', borderTop:`1px solid ${T.border}`, cursor:'pointer', fontSize:12.5}}>
                  <input type="checkbox" checked={!!selS[x.fila]} onChange={e=>setSelS(o=>({...o,[x.fila]:e.target.checked}))} style={{width:16, height:16, accentColor:T.brand}}/>
                  <span style={{minWidth:0}}><b style={{color:T.ink}}>{x.nro?`#${x.nro} · `:''}{x.proyecto||x.servicio}</b><span style={{color:T.ink2}}>{x.proyecto&&x.servicio?` · ${x.servicio}`:''} · {x.mes}</span>
                    <span style={{display:'block', fontSize:11.5, color:x.pagada?T.ink3:T.warn, marginTop:1}}>{x.pagada?`ya figura pagado el ${dm(x.fPago)}: solo se une`:'pendiente'}</span></span>
                  <span style={{fontFamily:MONO, fontWeight:600, color:T.ink, whiteSpace:'nowrap'}}>{fmt(x.vale)}</span>
                </label>)}
                {elegidasS.length>0 && <div style={{marginTop:12, padding:'11px 13px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, fontSize:12.5, color:T.ink, lineHeight:1.6}}>
                  Salió <b style={{fontFamily:MONO}}>{fmt(B)}</b> · {elegidasS.length===1?'el trabajo elegido es de':`los ${elegidasS.length} elegidos suman`} <b style={{fontFamily:MONO}}>{fmt(S)}</b>
                  {Math.abs(S-B)<1 ? <span style={{color:T.pos, fontWeight:600}}> · cierra justo</span> : <span style={{color:T.warn, fontWeight:600}}> · hay {fmt(Math.abs(S-B))} de diferencia</span>}
                  {Math.abs(S-B)>=1 && (aMarcar.length===elegidasS.length && Math.abs(aMarcar.reduce((t,x)=>t+x.hon*1.21+x.viat,0)-B)<2
                    ? <div style={{fontSize:11.5, color:T.pos, marginTop:3}}>La diferencia es justo el 21% de IVA de su factura: se guarda como pagado con IVA.</div>
                    : <div style={{fontSize:11.5, color:T.ink2, marginTop:3}}>Puede ser el IVA de su factura, un viático o que falte elegir un trabajo. Si guardás así, la diferencia queda anotada en el movimiento.</div>)}
                </div>}
                <div style={{marginTop:12}}><button disabled={busy||!elegidasS.length} onClick={()=>guardarStaff(m, per, elegidasS)} style={btnOk(busy||!elegidasS.length)}>{busy?'Guardando…':aMarcar.length?`Guardar y marcar ${aMarcar.length===1?'el trabajo pagado':`los ${aMarcar.length} trabajos pagados`}`:'Guardar: es esto'}</button></div>
              </> })()}

            {!entra && modo==='lista' && <>
              <select value={gSel} onChange={e=>setGSel(e.target.value)} style={{...inpV2, marginBottom:8}}><option value="">Elegí el gasto, la cuota o la tarjeta</option>{ops.map(o=><option key={o.id} value={o.id}>{o.label} · {fmt(o.monto)}{o.pagado?' · ya figura pagado':' · pendiente'}</option>)}</select>
              {op && <div style={{fontSize:12, color:T.ink2, marginBottom:10, lineHeight:1.5}}>{op.pagado?'Ya figuraba pagado: solo queda unido a este movimiento.':`Queda marcado como pagado el ${m.fechaTxt} desde ${m.cuenta}.`}{Math.abs(op.monto-B)>=1?` El monto previsto era ${fmt(op.monto)} y el banco dice ${fmt(B)}: queda anotada la diferencia.`:''}</div>}
              <button disabled={busy||!op} onClick={()=>guardarGasto(m,op)} style={btnOk(busy||!op)}>{busy?'Guardando…':'Guardar: es esto'}</button>
            </>}

            {!entra && modo==='nuevo' && <>
              <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:10}}>
                <div style={{flex:'2 1 220px', minWidth:0}}><label style={lblV2}>Qué fue</label><input value={nuevo.concepto} onChange={e=>setNuevo(s=>({...s,concepto:e.target.value}))} style={inpV2}/></div>
                <div style={{flex:'1 1 200px', minWidth:0}}><label style={lblV2}>Rubro</label><select value={nuevo.rubro} onChange={e=>setNuevo(s=>({...s,rubro:e.target.value}))} style={inpV2}><option value="">Elegir rubro</option>{rubros.map(r=><option key={r.key} value={r.key}>{r.label}</option>)}</select></div>
                <div style={{flex:'0 1 150px', minWidth:0}}><label style={lblV2}>N° de trabajo</label><input value={nuevo.trabajo} onChange={e=>setNuevo(s=>({...s,trabajo:e.target.value}))} placeholder="si fue para uno" style={inpV2}/></div>
              </div>
              <div style={{fontSize:12, color:T.ink2, marginBottom:10}}>Se anota como un gasto de {fmt(B)} pagado el {m.fechaTxt} desde {m.cuenta}. No resta del saldo: el extracto ya lo trae descontado.</div>
              <button disabled={busy} onClick={()=>guardarNuevo(m)} style={btnOk(busy)}>{busy?'Guardando…':'Anotar el gasto'}</button>
            </>}

            {modo==='anotar' && <>
              <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:9}}>{(entra?NOTAS_ENTRO:NOTAS_SALIO).map(c=><button key={c} onClick={()=>setNota(s=>({...s,chip:c}))} style={seg(nota.chip===c)}>{c}</button>)}</div>
              <input value={nota.texto} onChange={e=>setNota(s=>({...s,texto:e.target.value}))} placeholder={nota.chip==='Otro'?'Qué es':'Detalle (opcional): a quién, de qué mes…'} style={{...inpV2, marginBottom:10}}/>
              <div style={{fontSize:12, color:T.ink2, marginBottom:10}}>Solo queda escrito en el movimiento, para que deje de estar "para revisar". No marca ni crea nada.</div>
              <button disabled={busy||!nota.chip} onClick={()=>guardarNota(m)} style={btnOk(busy||!nota.chip)}>{busy?'Guardando…':'Guardar'}</button>
            </>}
          </div>}
        </div> })}
    </div>}
    {hechos.length>0 && <div style={{marginTop:16}}>
      <button onClick={()=>setVerHechos(v=>!v)} style={{border:'none', background:'none', color:T.ink2, fontSize:12.5, textDecoration:'underline', cursor:'pointer', padding:0, fontFamily:'inherit'}}>{verHechos?'Ocultar':'Ver'} los {hechos.length} ya revisados a mano</button>
      {verHechos && <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, overflow:'hidden', marginTop:8}}>{hechos.slice().sort((a,b)=>b.fecha-a.fecha).slice(0,60).map((m,i)=><div key={m.clave} style={{display:'grid', gridTemplateColumns:cel?'44px minmax(0,1fr) auto':'52px minmax(0,1fr) auto 70px', gap:cel?9:14, alignItems:'center', padding:cel?'10px 14px':'10px 18px', borderTop:i?`1px solid ${T.border}`:'none', fontSize:12.5}}>
        <span style={{fontFamily:MONO, fontSize:12, color:T.ink3}}>{dm(m.fecha)}</span>
        <span style={{minWidth:0}}><b style={{color:T.ink}}>{m.que}</b><span style={{display:'block', fontSize:11.5, color:T.ink3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{m.cuenta} · {m.detalle||m.concepto}</span></span>
        <span style={{fontFamily:MONO, fontWeight:600, color:m.monto>0?T.pos:T.ink, whiteSpace:'nowrap'}}>{m.monto>0?'+':'−'}{fmt(Math.abs(m.monto))}</span>
        {!cel && <button disabled={busy} onClick={()=>reabrir(m)} style={{border:'none', background:'none', color:T.ink3, fontSize:11.5, textDecoration:'underline', cursor:'pointer', padding:0, fontFamily:'inherit', textAlign:'right'}}>reabrir</button>}
      </div>)}</div>}
    </div>}
  </>
}

// SUBIR EXTRACTO DEL BANCO: se elige el archivo de movimientos de la cuenta y la app cruza cada renglón con lo que
// tiene cargado (lib/extracto.mjs). Lo que ya estaba bien no se toca; lo que coincide con algo sin pagar o sin cobrar
// se marca al confirmar, con la fecha del banco; lo que cobra el banco queda anotado; y lo que no se reconoce queda
// "para revisar". Todo va a la solapa MOVIMIENTOS_BANCO. Los saldos no se suman ni se restan: se pisa con el del extracto.
function SubirExtracto({data, onClose, onDone, showToast}){
  const [ext,setExt]=useState(null), [err,setErr]=useState(''), [cuentaSel,setCuentaSel]=useState(''), [noMarcar,setNoMarcar]=useState({}), [usarSaldo,setUsarSaldo]=useState(true), [busy,setBusy]=useState(false), [verRev,setVerRev]=useState(false), [hecho,setHecho]=useState(null)
  const cuentas=(data.cuentas||[]).filter(c=>esActiva(c['Activa']) && !esCuentaUsd(c))
  const soloDig=s=>String(s||'').replace(/\D/g,'')
  // La cuenta de la app a la que pertenece el archivo: la que tiene ese número entre sus datos; si no, la del mismo banco.
  const adivinar=e=>{ const n=soloDig(e.cuentaNro); const porNro=n.length>=6 && cuentas.find(c=>soloDig(`${c['Datos transferencia adicionales']||''} ${c['Notas']||''} ${c['CBU']||''}`).includes(n)); return String((porNro||cuentas.find(c=>normTxt(c['Banco']).includes(normTxt(e.banco))||normTxt(c['Nombre']).includes(normTxt(e.banco)))||{})['Nombre']||'') }
  async function elegir(files){
    setErr(''); setHecho(null)
    const lista=[...(files||[])]; if(!lista.length) return
    if(lista.some(f=>/\.xlsx?$/i.test(f.name))){ setErr('Ese archivo es el Excel del banco. Abrilo y guardalo como CSV (Archivo → Exportar → CSV), y subí el CSV.'); return }
    try{ const leidos=[]; for(const f of lista) leidos.push(leerExtracto(await f.text()))
      const e=unirExtractos(leidos); if(!e.movs.length){ setErr('El archivo no trae movimientos.'); return }
      setExt(e); setCuentaSel(adivinar(e)); setNoMarcar({})
    }catch(e){ setErr(e.message||'No pude leer el archivo.') } }
  const cuenta=cuentaSel
  const yaCargadas=yaCargadasDe(data.movimientosBanco, cuenta)
  const cruce=ext?cruzarExtracto(ext.movs, data, {cuenta, yaCargadas, canonStaff}):null
  const r=cruce?.resumen
  const aMarcar=cruce?cruce.filas.filter(x=>x.estado==='marcar'):[], revisar=cruce?cruce.filas.filter(x=>x.estado==='revisar'):[]
  const marcadas=aMarcar.filter(x=>!noMarcar[x.clave])
  const dm=d=>`${d.getDate()}/${d.getMonth()+1}`
  // El saldo del extracto solo sirve si el archivo llega hasta estos días.
  // Y solo si trae algo nuevo: un archivo que ya estaba cargado pisaría el saldo con uno atrasado.
  const reciente=!!r?.hasta && r.nuevas>0 && (new Date()-(ext.hastaArchivo||r.hasta))/864e5<4
  const cuentaObj=cuentas.find(c=>c['Nombre']===cuenta)
  async function confirmar(){
    if(busy||!cruce) return
    if(!cuenta){ showToast('Elegí a qué cuenta corresponde','err'); return }
    setBusy(true)
    try{ const res=await fetch('/api/extracto-guardar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cuenta, saldo:ext.saldo, usarSaldo:usarSaldo&&reciente&&ext.saldo>0, noMarcar:Object.keys(noMarcar).filter(k=>noMarcar[k]), movs:ext.movs.map(m=>({f:`${m.fecha.getFullYear()}-${m.fecha.getMonth()+1}-${m.fecha.getDate()}`, c:m.concepto, k:m.codigo, d:m.detalle, m:m.monto, ...(m.propia?{p:1}:{})}))})})
      const j=await res.json(); if(!j.ok){ showToast(j.error||'Error','err'); setBusy(false); return }
      setHecho(j); setBusy(false); showToast(j.aviso||'Extracto guardado ✓', j.aviso?'err':undefined)
    }catch(e){ showToast('Error de conexión','err'); setBusy(false) } }
  const caja={background:T.surfaceAlt, borderRadius:10, padding:'11px 13px', minWidth:0}
  const lblK={fontSize:10.5, fontWeight:700, letterSpacing:0.4, textTransform:'uppercase', color:T.ink2}
  const numK={fontFamily:MONO, fontSize:19, fontWeight:600, color:T.ink, marginTop:3}
  const renglon=(x,extra)=><div key={x.clave} style={{display:'grid', gridTemplateColumns:'auto 52px minmax(0,1fr) auto', gap:10, alignItems:'center', padding:'8px 0', borderTop:`1px solid ${T.border}`, fontSize:12.5}}>
    {extra}
    <span style={{color:T.ink3, fontFamily:MONO, fontSize:11.5}}>{dm(x.fecha)}</span>
    <span style={{minWidth:0}}><span style={{color:T.ink, fontWeight:600}}>{x.estado==='revisar'?(x.quien||x.que):x.que}</span><span style={{color:T.ink3}}> · {x.concepto}{x.estado==='revisar'&&x.quien?` · ${x.que}`:''}</span>{x.candidatos.length>0 && <span style={{display:'block', color:T.warn, fontSize:11.5, marginTop:2}}>Puede ser: {x.candidatos.join(' · ')}</span>}</span>
    <span style={{fontFamily:MONO, fontWeight:600, color:x.monto>0?T.pos:T.ink, whiteSpace:'nowrap'}}>{x.monto>0?'+':'−'}{fmt(Math.abs(x.monto))}</span>
  </div>
  return <div onClick={busy?undefined:onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:210, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'32px 16px', overflowY:'auto'}}>
    <div onClick={e=>e.stopPropagation()} style={{background:T.surface, borderRadius:16, width:780, maxWidth:'100%', border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)', height:'fit-content'}}>
      <div style={{padding:'16px 22px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12}}>
        <div><div style={{fontSize:16, fontWeight:700, color:T.ink}}>Subir extracto del banco</div><div style={{fontSize:12, color:T.ink3, marginTop:2}}>El banco marca los pagos y los cobros, no vos. Lee los movimientos de la cuenta de BBVA, de Santander y de Galicia, en CSV.</div></div>
        <button onClick={onClose} style={{border:'none', background:'transparent', fontSize:22, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
      </div>
      <div style={{padding:'16px 22px 20px'}}>
        {hecho ? <>
          <div style={{fontSize:14, fontWeight:700, color:T.pos, marginBottom:8}}>Extracto guardado ✓</div>
          <div style={{fontSize:13, color:T.ink, lineHeight:1.6}}>
            {hecho.nuevas} {hecho.nuevas===1?'movimiento nuevo anotado':'movimientos nuevos anotados'} en la solapa MOVIMIENTOS_BANCO{hecho.repetidas>0?` (${hecho.repetidas} ya estaban cargados y no se repitieron)`:''}.<br/>
            {hecho.marcados.length>0 ? <>Se marcaron {hecho.marcados.length}: {hecho.marcados.map(m=>m.que).join(' · ')}.<br/></> : null}
            {hecho.saldo!==null && hecho.saldo!==undefined ? <>El saldo de {cuenta} quedó en <b style={{fontFamily:MONO}}>{fmt(hecho.saldo)}</b>.</> : null}
          </div>
          <button onClick={onDone} style={{...btnAgregar(false), marginTop:16}}>Listo</button>
        </> : <>
          <label style={{display:'block', border:`1.5px dashed ${T.ink3}`, borderRadius:12, padding:ext?'11px 14px':'26px 14px', textAlign:'center', cursor:'pointer', background:T.bg}}>
            <input type="file" accept=".csv,text/csv,text/plain" multiple onChange={e=>elegir(e.target.files)} style={{display:'none'}}/>
            <div style={{fontSize:13.5, fontWeight:600, color:T.ink}}>{ext?'Elegir otros archivos':'Elegir los archivos del banco'}</div>
            {!ext && <div style={{fontSize:12, color:T.ink3, marginTop:4}}>Podés elegir juntos el de movimientos históricos y el de movimientos del día.</div>}
          </label>
          {err && <div style={{fontSize:12.5, color:T.brand, background:T.brandSoft, padding:'9px 12px', borderRadius:9, marginTop:10}}>{err}</div>}
          {cruce && <>
            <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', margin:'14px 0 12px'}}>
              <div style={{fontSize:13, color:T.ink, flex:'1 1 260px', minWidth:0}}><b>{ext.banco} · {ext.cuentaNro}</b> · {r.total} movimientos del {dm(r.desde)} al {dm(r.hasta)}</div>
              <select value={cuenta} onChange={e=>setCuentaSel(e.target.value)} style={{...inpV2, width:'auto', flex:'0 1 220px'}}><option value="">¿De qué cuenta es?</option>{cuentas.map(c=><option key={c['Nombre']} value={c['Nombre']}>{c['Nombre']}</option>)}</select>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:9}}>
              <div style={caja}><div style={lblK}>Ya estaban bien</div><div style={numK}>{r.ok}</div><div style={{fontSize:11.5, color:T.ink2, marginTop:2}}>la app ya los tenía igual</div></div>
              <div style={{...caja, background:T.posSoft}}><div style={{...lblK, color:T.pos}}>Se marcan ahora</div><div style={numK}>{marcadas.length}</div><div style={{fontSize:11.5, color:T.ink2, marginTop:2}}>{fmt(marcadas.reduce((s,x)=>s+Math.abs(x.monto),0))} que figuraban pendientes</div></div>
              <div style={caja}><div style={lblK}>Los cobró el banco</div><div style={numK}>{r.banco}</div><div style={{fontSize:11.5, color:T.ink2, marginTop:2}}>{fmt(Math.abs(r.montoBanco))} en cargos e impuestos</div></div>
              <div style={{...caja, background:revisar.length?T.warnSoft:T.surfaceAlt}}><div style={{...lblK, color:revisar.length?T.warn:T.ink2}}>Para revisar</div><div style={numK}>{revisar.length}</div><div style={{fontSize:11.5, color:T.ink2, marginTop:2}}>no se reconocen solos</div></div>
            </div>
            {r.pases>0 && <div style={{fontSize:12, color:T.ink2, marginTop:10}}>{r.pases} {r.pases===1?"es un movimiento":"son movimientos"} entre cuentas de la misma persona: no hay nada que marcar.</div>}
            {r.nuevas<r.total && <div style={{fontSize:12, color:T.ink2, marginTop:10}}>{r.total-r.nuevas} de estos movimientos ya estaban cargados de un extracto anterior: no se repiten.</div>}

            {aMarcar.length>0 && <div style={{marginTop:16}}>
              <div style={{fontSize:11.5, fontWeight:700, letterSpacing:0.4, textTransform:'uppercase', color:T.ink2, marginBottom:4}}>Se marcan al confirmar · con la fecha del banco</div>
              {aMarcar.map(x=>renglon(x, <input type="checkbox" checked={!noMarcar[x.clave]} onChange={e=>setNoMarcar(o=>({...o,[x.clave]:!e.target.checked}))} style={{width:16, height:16, accentColor:T.brand, cursor:'pointer'}}/>))}
              <div style={{fontSize:11.5, color:T.ink3, marginTop:6}}>Si alguno no corresponde, destildalo: queda anotado como "para revisar" y no se marca nada.</div>
            </div>}

            {revisar.length>0 && <div style={{marginTop:16}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:10, marginBottom:4}}>
                <div style={{fontSize:11.5, fontWeight:700, letterSpacing:0.4, textTransform:'uppercase', color:T.ink2}}>Para revisar · {fmt(r.montoRevisar)}</div>
                <button onClick={()=>setVerRev(v=>!v)} style={{border:'none', background:'none', color:T.ink2, fontSize:12, textDecoration:'underline', cursor:'pointer', padding:0, fontFamily:'inherit'}}>{verRev?'mostrar menos':`ver los ${revisar.length}`}</button>
              </div>
              {(verRev?revisar:revisar.slice(0,5)).map(x=>renglon(x, <span style={{width:16}}/>))}
              <div style={{fontSize:11.5, color:T.ink3, marginTop:6}}>No se marca nada con estos. Quedan en la solapa MOVIMIENTOS_BANCO como "Para revisar", resaltados, para identificarlos después.</div>
            </div>}

            <div style={{marginTop:16, fontSize:12.5, color:T.ink2, lineHeight:1.6}}>
              <b style={{color:T.ink}}>Lo que cobró el banco:</b> {Object.entries(r.bancoPorClase).sort((a,b)=>a[1]-b[1]).map(([k,v])=>`${k} ${fmt(Math.abs(v))}`).join(' · ')}
            </div>

            {ext.saldo>0 && (reciente
              ? <label style={{display:'flex', gap:9, alignItems:'flex-start', marginTop:14, fontSize:12.5, color:T.ink, cursor:'pointer'}}><input type="checkbox" checked={usarSaldo} onChange={e=>setUsarSaldo(e.target.checked)} style={{width:16, height:16, accentColor:T.brand, marginTop:1}}/><span>Poner como saldo de {cuenta||'la cuenta'} el del extracto: <b style={{fontFamily:MONO}}>{fmt(ext.saldo)}</b>{cuentaObj?<span style={{color:T.ink3}}> (hoy la app dice {fmt(parseMonto(cuentaObj['Saldo actual']))})</span>:null}</span></label>
              : <div style={{fontSize:12, color:T.ink3, marginTop:14}}>{r.nuevas===0?'Este archivo no trae ningún movimiento nuevo':`El extracto llega hasta el ${dm(r.hasta)}: es viejo para usar su saldo`}, así que el saldo de la cuenta no se toca.</div>)}

            <button disabled={busy||!cuenta} onClick={confirmar} style={{...btnAgregar(busy||!cuenta), marginTop:16}}>{busy?'Guardando…':`Confirmar y guardar${marcadas.length?` · marca ${marcadas.length}`:''}`}</button>
          </>}
        </>}
      </div>
    </div>
  </div>
}

function Egresos({data, onRefresh, showToast, embebido=false}){
  const gf=data.gastosFijos||[], tarj=data.tarjetas||[], prest=data.prestamos||[], cuentas=data.cuentas||[], movTarj=data.movimientosTarjeta||[], cuot=data.cuotas||[], movim=data.movimientos||[]
  const now=new Date()
  const [mesIdx,setMesIdx]=useState(now.getMonth()+1), [anio,setAnio]=useState(now.getFullYear())
  const [override,setOverride]=useState({}), [cuentaSel,setCuentaSel]=useState({}), [usdOv,setUsdOv]=useState({})
  const [editM,setEditM]=useState({})  // key -> true (editando monto)
  const [subir,setSubir]=useState(false)
  const [agregar,setAgregar]=useState(false)
  const [detalle,setDetalle]=useState(null)
  const [editGasto,setEditGasto]=useState(null)
  const itemsDe=t=>movTarj.filter(m=>normTxt(m['Tarjeta'])===normTxt(t['Tarjeta'])&&String(m['Mes']).trim()===String(t['Mes']).trim()&&String(m['Año']).includes(String(t['Año'])))
  const splitDe=t=>{ const its=itemsDe(t); let emp=0,juan=0,sofi=0,eusd=0; its.forEach(m=>{ const mo=parseMonto(m['Monto']); const cat=String(m['Categoria']||'').toLowerCase(); if(String(m['Moneda']||'').toUpperCase()==='USD'){ if(cat==='empresa')eusd+=mo; return } if(cat==='empresa')emp+=mo; else if(/juan/i.test(m['Descripcion']))juan+=mo; else if(/sof/i.test(m['Descripcion']))sofi+=mo }); return {emp,juan,sofi,eusd,n:its.length} }
  const esPagado=v=>{ const s=String(v||'').toUpperCase(); return s==='SÍ'||s==='SI'||s==='TRUE'||v===true }
  const vencTxt=(hoja,it)=>{ if(hoja==='GASTOS_FIJOS'){ const d=it['Dia pago']; return d?`vence día ${d}`:'' } const v=it['Vencimiento']; const d=parseD(v); return d?`vence ${d.getDate()}/${d.getMonth()+1}`:(v?String(v):'') }
  async function saveMonto(hoja,it,val){ const k=hoja+':'+it.__row, n=parseMontoAR(val)
    try{ const r=await fetch('/api/egreso-toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hoja,fila:it.__row,monto:n})})
      const j=await r.json(); if(j&&j.error){showToast(j.error,'err');return}
      showToast('Monto actualizado ✓'); setEditM(e=>{const x={...e};delete x[k];return x}); if(onRefresh) await onRefresh()
    }catch(e){ showToast('Error de conexión','err') } }
  const cuentaOpts=[...new Set(cuentas.filter(c=>{const a=String(c['Activa']||'').toUpperCase();return a==='SÍ'||a==='SI'||a==='TRUE'||c['Activa']===true}).map(c=>c['Nombre']).filter(Boolean))]

  // Un gasto "único" (impuesto/gasto puntual) solo aparece en su mes (Mes carga/Año carga). Los recurrentes (mensual), siempre.
  const gfActivos=gf.filter(g=>{
    // La Categoria dice QUÉ es el gasto; "Medio de pago" dice CÓMO se paga. Lo que se
    // paga con tarjeta NO se suma acá: ya viene dentro del resumen de la tarjeta, que
    // se cuenta entero más abajo. Sumarlo también acá es contar el mismo gasto dos veces.
    if(/^tarjeta$/i.test(String(g['Medio de pago']||'').trim())) return false
    const act=esPagado(g['Activo'])||String(g['Activo']||'').trim()===''
    if(!act) return false
    if(/[uú]nico/i.test(String(g['Frecuencia']||''))) return parseInt(g['Mes carga'])===mesIdx && String(g['Año carga']).includes(String(anio))
    return true
  })
  const porCat={}; gfActivos.forEach(g=>{ const c=g['Categoria']||'Otros'; (porCat[c]=porCat[c]||[]).push(g) })
  const totalGF=gfActivos.reduce((s,g)=>s+parseMonto(g['Monto']),0)
  // Criterio Mariana: lo financiero (puente de compra de facturas, comisiones SGR) no es costo
  // de estructura ni de producción — se mira aparte, no ensucia el resultado operativo.
  const esFinanciero=g=>/financier/i.test(String(g['Categoria']||''))
  const totalFin=gfActivos.filter(esFinanciero).reduce((s,g)=>s+parseMonto(g['Monto']),0)
  const totalGFOper=totalGF-totalFin
  // Las tarjetas se ubican por VENCIMIENTO (cuándo se pagan), no por el mes del resumen.
  // Ej: resumen de mayo con vto en junio → aparece en junio. Fallback al mes del resumen si no hay vencimiento.
  const tarjMes=tarj.filter(t=>{ const v=parseD(t['Vencimiento']); if(v) return v.getMonth()+1===mesIdx && v.getFullYear()===anio; return parseInt(t['Mes'])===mesIdx && String(t['Año']).includes(String(anio)) })
  const totalTarj=tarjMes.reduce((s,t)=>s+parseMonto(t['Monto']),0)
  // Dólares por tarjeta (se pagan aparte del monto en pesos)
  const usdDe=t=>parseMonto(t['Monto USD'])
  const usdPagado=t=>{ const k=t.__row; if(k in usdOv) return usdOv[k]; const pg=parseMonto(t['Monto pagado USD']), tot=usdDe(t); return tot>0 && pg>=tot-0.01 }
  const totalTarjUsd=tarjMes.reduce((s,t)=>s+usdDe(t),0)
  const totalTarjUsdPend=tarjMes.filter(t=>!usdPagado(t)).reduce((s,t)=>s+usdDe(t),0)
  // Préstamos: los del banco (cuotas del mes) vs deudas entre socios (Magma↔Juan/Sofi, sin cronograma)
  const esSocio=p=>/socio/i.test(String(p['Tipo']||''))
  const prestMes=prest.filter(p=>{ const v=parseD(p['Vencimiento']); return v && v.getMonth()+1===mesIdx && v.getFullYear()===anio })
  const prestBancoMes=prestMes.filter(p=>!esSocio(p))
  const prestSocio=prest.filter(p=>esSocio(p) && !esPagado(p['Saldado']))
  const totalPrest=prestBancoMes.reduce((s,p)=>s+parseMonto(p['Monto cuota']),0)
  const totalEgresos=totalGF+totalTarj+totalPrest
  // Movimientos del mes (plata que cambió de lugar, no gastos)
  const movMes=movim.filter(m=>{ const d=parseD(m['Fecha']); return d && d.getMonth()+1===mesIdx && d.getFullYear()===anio })
  async function toggleUsd(t){ const k=t.__row, pagado=!usdPagado(t)
    if(pagado && !window.confirm(`Marcar los US$ ${fmt(usdDe(t))} de ${t['Tarjeta']} como pagados aparte (no toca el pago en pesos). ¿Confirmás?`)) return
    setUsdOv(o=>({...o,[k]:pagado}))
    try{ const r=await fetch('/api/egreso-toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hoja:'TARJETAS', fila:t.__row, pagado, tipoPago:'usd'})})
      const j=await r.json(); if(j&&j.error){showToast(j.error,'err'); setUsdOv(o=>{const n={...o};delete n[k];return n}); return}
      showToast(pagado?'US$ pagado ✓':'US$ desmarcado'); if(onRefresh){ await onRefresh(); setUsdOv(o=>{const n={...o};delete n[k];return n}) }
    }catch(e){ showToast('Error de conexión','err'); setUsdOv(o=>{const n={...o};delete n[k];return n}) } }
  async function saldarSocio(p){ if(!window.confirm(`Marcar como SALDADA la deuda "${p['Prestamo']||`${p['Deudor']} → ${p['Acreedor']}`}" (${fmt(parseMonto(p['Monto cuota']))}). ¿Confirmás?`)) return
    try{ const r=await fetch('/api/prestamo-socio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({saldarFila:p.__row})})
      const j=await r.json(); if(j&&j.error){showToast(j.error,'err');return} showToast('Deuda saldada ✓'); if(onRefresh) await onRefresh()
    }catch(e){ showToast('Error de conexión','err') } }

  // === CUOTAS de tarjeta ya comprometidas (proyección a futuro) ===
  const cuotasAll=cuot.filter(c=>String(c['Estado']||'Activa').toLowerCase()!=='terminada' && (parseInt(c['Cuotas total'])||0)>(parseInt(c['Cuota actual'])||0))
  const absM=(m,a)=>a*12+(m-1)
  const persDe=c=>/juan/i.test(c['Persona'])?'Juan':/sof/i.test(c['Persona'])?'Sofi':'Magma'
  const cuotaEn=(c,m,a)=>{ const base=absM(parseInt(c['Mes base'])||7,parseInt(c['Año base'])||2026); const act=parseInt(c['Cuota actual'])||0, tot=parseInt(c['Cuotas total'])||0; const t=absM(m,a), last=base+(tot-act), first=base-(act-1); if(t<first||t>last)return null; return {num:act+(t-base), monto:parseMonto(c['Monto cuota'])} }
  const proxCuotas=[]; for(let k=0;k<6;k++){ const t=absM(mesIdx,anio)+k, m=(t%12)+1, a=Math.floor(t/12); const its=cuotasAll.map(c=>({c,e:cuotaEn(c,m,a)})).filter(x=>x.e); const per={Juan:0,Sofi:0,Magma:0}; its.forEach(({c,e})=>{ per[persDe(c)]+=e.monto }); proxCuotas.push({m,a,tot:its.reduce((s,x)=>s+x.e.monto,0),per,n:its.length}) }
  const totFutCuota=p=>cuotasAll.filter(c=>persDe(c)===p).reduce((s,c)=>s+parseMonto(c['Monto cuota'])*((parseInt(c['Cuotas total'])||0)-(parseInt(c['Cuota actual'])||0)),0)

  // Los GASTOS_FIJOS (sueldos, alquiler…) son recurrentes: se marcan PAGADOS por mes guardando la lista
  // de meses en "Meses pagados" (ej "7/2026, 8/2026"). Así cada mes es independiente. Tarjetas/préstamos = fila puntual.
  // Acordeón: openSec pisa el default por sección (id -> true/false). Se limpia al cambiar de mes.
  const [openSec,setOpenSec]=useState({}), [todoAbierto,setTodoAbierto]=useState(false)
  const idsSec=[...Object.keys(porCat),'tarjetas','prestamos','socios','cuotas','movimientos']
  const mesKey=`${mesIdx}/${anio}`
  const estaPagado=(hoja,it)=>{ const k=hoja+':'+it.__row; if(k in override) return override[k]
    if(hoja==='GASTOS_FIJOS'){ return String(it['Meses pagados']||'').split(',').map(s=>s.trim()).includes(mesKey) }
    return esPagado(it['Pagado']) }
  async function toggle(hoja, it, montoItem){
    const k=hoja+':'+it.__row, pagado=!estaPagado(hoja,it)
    const cuenta = cuentaSel[k] || it['Cuenta pago'] || cuentaOpts[0] || ''
    if(pagado && !cuenta){ showToast('Elegí en qué cuenta pagás','err'); return }
    if(pagado && !window.confirm(`Marcar pagado ${fmt(montoItem)} desde ${cuenta}. Descuenta de esa cuenta. ¿Confirmás?`)) return
    setOverride(o=>({...o,[k]:pagado}))
    // La fecha de pago cae en el mes que estás viendo (hoy si es el mes actual, o el día de pago del mes visto).
    const enMesActual = mesIdx===now.getMonth()+1 && anio===now.getFullYear()
    const hoy = enMesActual ? `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()}` : `${it['Dia pago']||15}/${mesIdx}/${anio}`
    try{ const r=await fetch('/api/egreso-toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hoja, fila:it.__row, pagado, tipoPago:'total', cuentaPago:pagado?cuenta:'', fechaPago:pagado?hoy:'', mesPagoKey: hoja==='GASTOS_FIJOS'?mesKey:undefined})})
      const j=await r.json(); if(j&&j.error){showToast(j.error,'err'); setOverride(o=>{const n={...o};delete n[k];return n}); return}
      showToast(pagado?'Pagado ✓':'Desmarcado'); if(onRefresh){ await onRefresh(); setOverride(o=>{const n={...o};delete n[k];return n}) }
    }catch(e){ showToast('Error de conexión','err'); setOverride(o=>{const n={...o};delete n[k];return n}) }
  }

  const Fila=({hoja, it, label, monto, extra})=>{ const pagado=estaPagado(hoja,it), k=hoja+':'+it.__row, venc=vencTxt(hoja,it), editing=!!editM[k]
    return <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, padding:'10px 18px', borderTop:`1px solid ${T.border}`}}>
      <span style={{flex:1, minWidth:0}}>
        <span style={{fontSize:13, color:T.ink}}>{label}</span>
        {venc && <span style={{fontSize:10.5, color:T.ink3, marginLeft:8}}>· {venc}</span>}
        {extra}
      </span>
      {hoja==='GASTOS_FIJOS' && <button onClick={()=>setEditGasto(it)} title="Editar este gasto" style={{fontSize:13, padding:'3px 7px', borderRadius:6, border:`1px solid ${T.border}`, background:T.surface, color:T.ink3, cursor:'pointer'}}>✎</button>}
      {!pagado && cuentaOpts.length>0 && <select value={cuentaSel[k]||it['Cuenta pago']||cuentaOpts[0]} onChange={e=>setCuentaSel(c=>({...c,[k]:e.target.value}))} onClick={e=>e.stopPropagation()} style={{...selectStyle, padding:'5px 8px', fontSize:11.5}}>{cuentaOpts.map(c=><option key={c} value={c}>{c}</option>)}</select>}
      <button onClick={()=>toggle(hoja,it,monto)} style={{fontSize:11, padding:'3px 10px', borderRadius:6, border:'none', cursor:'pointer', background:pagado?T.posSoft:T.warnSoft, color:pagado?T.pos:T.warn, fontWeight:600}}>{pagado?'Pagado ✓':'Pendiente'}</button>
      {editing
        ? <input autoFocus inputMode="decimal" defaultValue={numAMontoAR(monto)} onBlur={e=>saveMonto(hoja,it,e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') e.target.blur(); if(e.key==='Escape') setEditM(x=>{const n={...x};delete n[k];return n}) }} style={{width:110, padding:'4px 7px', borderRadius:6, border:`1px solid ${T.brand}`, fontSize:13, fontFamily:MONO, textAlign:'right', outline:'none'}}/>
        : <span onClick={()=>setEditM(x=>({...x,[k]:true}))} title="Tocá para editar el monto" style={{fontSize:13, fontFamily:MONO, color:T.ink, minWidth:90, textAlign:'right', cursor:'pointer', borderBottom:`1px dashed ${T.border}`}}>{fmt(monto)}</span>}
    </div>
  }
  // Cada bloque es un acordeón: el título ya dice el total y cuánto falta pagar, así que
  // no hace falta abrirlo para saber si hay algo pendiente. Arranca abierto solo si queda
  // algo por pagar — lo que ya se pagó se guarda solo y deja de ocupar pantalla.
  const campoMonto=h=>h==='PRESTAMOS'?'Monto cuota':'Monto'
  // Cuándo vence cada cosa dentro del mes que estás viendo: los gastos fijos guardan
  // "Dia pago" (un día del mes), tarjetas y préstamos guardan la fecha entera.
  const vencDe=(hoja,it)=>{ if(hoja==='GASTOS_FIJOS'){ const d=parseInt(it['Dia pago']); return d>=1&&d<=31?new Date(anio,mesIdx-1,d):null } return parseD(it['Vencimiento']) }
  const hoy0=new Date(now.getFullYear(),now.getMonth(),now.getDate())
  const diasPara=(hoja,it)=>{ const v=vencDe(hoja,it); if(!v) return null; return Math.round((new Date(v.getFullYear(),v.getMonth(),v.getDate())-hoy0)/86400000) }
  const cuando=d=>d===0?'hoy':d===1?'mañana':`en ${d} días`
  const Sec=({id, titulo, children, items, hoja, total, sub})=>{
    if(!children) return null
    const its=items||[]
    const suma=a=>a.reduce((x,it)=>x+parseMonto(it[campoMonto(hoja)]),0)
    const pend=hoja?its.filter(it=>!estaPagado(hoja,it)):[]
    const montoPend=suma(pend), tot=total!=null?total:suma(its), montoPag=Math.max(0,tot-montoPend)
    const hayTot=total!=null||its.length>0
    // Lo que ya se pasó de fecha (rojo) vs lo que vence dentro de la semana (amarillo).
    // Solo mira lo pendiente: lo pagado no vence.
    const vencidos=pend.filter(it=>{const d=diasPara(hoja,it); return d!=null&&d<0})
    const porVencer=pend.filter(it=>{const d=diasPara(hoja,it); return d!=null&&d>=0&&d<=7})
    const proximo=porVencer.map(it=>diasPara(hoja,it)).sort((a,b)=>a-b)[0]
    const pct=tot>0?Math.min(100,Math.round(montoPag/tot*100)):0
    // Default: cerrado. La barra y los montos del título ya dicen cómo viene la categoría,
    // no hace falta abrir para saberlo. 'Abrir todo' devuelve la vista larga de siempre.
    const abierta=id in openSec ? openSec[id] : false
    return <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:'hidden', marginBottom:14}}>
      <div onClick={()=>setOpenSec(o=>({...o,[id]:!abierta}))} style={{padding:'12px 18px 13px', cursor:'pointer', background:abierta?T.surfaceAlt:'transparent'}}
        onMouseEnter={e=>{if(!abierta)e.currentTarget.style.background=T.surfaceAlt}} onMouseLeave={e=>{if(!abierta)e.currentTarget.style.background='transparent'}}>
        <div style={{display:'flex', alignItems:'center', gap:9}}>
          <span style={{fontSize:9, color:T.ink3, display:'inline-block', width:9, transform:abierta?'rotate(90deg)':'none', transition:'transform .15s'}}>▶</span>
          <span style={{fontSize:12.5, fontWeight:600, color:T.ink}}>{titulo}</span>
          {sub && <span style={{fontSize:11, color:T.ink3}}>{sub}</span>}
          <div style={{flex:1, minWidth:20}}/>
          {hayTot && <span style={{fontSize:15, fontFamily:MONO, fontWeight:700, color:T.ink}}>{fmt(tot)}</span>}
        </div>
        {hoja && tot>0 && <div style={{marginLeft:18, marginTop:9}}>
          <div style={{display:'flex', height:7, borderRadius:5, overflow:'hidden', background:T.border}}>
            <div style={{width:`${pct}%`, background:T.pos}}/>
            <div style={{width:`${100-pct}%`, background:T.brand}}/>
          </div>
          <div style={{display:'flex', gap:13, flexWrap:'wrap', marginTop:7, fontSize:11.5, alignItems:'center'}}>
            <span style={{color:T.pos, fontWeight:700}}>✓ {fmt(montoPag)} pagado</span>
            {montoPend>0
              ? <span style={{color:T.brand, fontWeight:700}}>● {fmt(montoPend)} sin pagar</span>
              : <span style={{color:T.pos, fontWeight:700, background:T.posSoft, padding:'2px 9px', borderRadius:20}}>todo pagado ✓</span>}
            {vencidos.length>0 && <span style={{color:T.brand, fontWeight:700, background:T.brandSoft, padding:'2px 9px', borderRadius:20}}>🔴 {fmt(suma(vencidos))} vencido{vencidos.length>1?'s':''}</span>}
            {porVencer.length>0 && <span style={{color:T.warn, fontWeight:700, background:T.warnSoft, padding:'2px 9px', borderRadius:20}}>⚠️ {fmt(suma(porVencer))} vence {cuando(proximo)}</span>}
          </div>
        </div>}
      </div>
      {abierta && children}
    </div>
  }

  return <>
    {!embebido && <PageHead title="Egresos" sub={`${MESES_LARGO[mesIdx-1]} ${anio}`}/>}
    <div style={{display:'flex', gap:14, marginBottom:18}}>
      <Hero label="Total egresos del mes" value={fmt(totalEgresos)} accent={T.brand} sub={`Fijos ${fmtM(totalGFOper)}${totalFin>0?` · Financieros ${fmtM(totalFin)}`:''} · Tarjetas ${fmtM(totalTarj)} · Préstamos ${fmtM(totalPrest)}${totalTarjUsdPend>0?` · 💵 US$ ${fmt(totalTarjUsdPend)} en dólares`:''}`}/>
    </div>
    <div style={{display:'flex', gap:10, alignItems:'center', marginBottom:16}}>
      <button onClick={()=>{ let m=mesIdx-1,a=anio; if(m<1){m=12;a--} setMesIdx(m);setAnio(a);setOpenSec({});setTodoAbierto(false) }} style={navBtn}>←</button>
      <span style={{fontSize:13, fontWeight:600, color:T.ink, minWidth:120, textAlign:'center'}}>{MESES_LARGO[mesIdx-1]} {anio}</span>
      <button onClick={()=>{ let m=mesIdx+1,a=anio; if(m>12){m=1;a++} setMesIdx(m);setAnio(a);setOpenSec({});setTodoAbierto(false) }} style={navBtn}>→</button>
      <div style={{flex:1}}/>
      <button onClick={()=>{ const v=!todoAbierto; setTodoAbierto(v); setOpenSec(Object.fromEntries(idsSec.map(id=>[id,v]))) }} style={{fontSize:12, fontWeight:600, padding:'9px 14px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, cursor:'pointer'}}>{todoAbierto?'Cerrar todo':'Abrir todo'}</button>
      <button onClick={()=>setAgregar(true)} style={{fontSize:12.5, fontWeight:700, padding:'9px 16px', borderRadius:9, border:'none', background:T.brand, color:'#fff', cursor:'pointer'}}>➕ Agregar</button>
    </div>
    <CuentaSocios showToast={showToast}/>
    {Object.entries(porCat).sort((a,b)=>(/financier/i.test(a[0])?1:0)-(/financier/i.test(b[0])?1:0)).map(([cat,items])=>(
      <Sec key={cat} id={cat} items={items} hoja="GASTOS_FIJOS" titulo={/financier/i.test(cat)?`Gastos fijos · ${cat} — fuera del resultado operativo`:`Gastos fijos · ${cat}`}>{items.map((g,i)=><Fila key={i} hoja="GASTOS_FIJOS" it={g} label={g['Concepto']} monto={parseMonto(g['Monto'])}/>)}</Sec>
    ))}
    <div style={{display:'flex', justifyContent:'flex-end', marginBottom:8}}><button onClick={()=>setSubir(true)} style={{fontSize:12, fontWeight:600, padding:'7px 14px', borderRadius:9, border:'none', background:T.brand, color:'#fff', cursor:'pointer'}}>⬆ Subir resumen de tarjeta</button></div>
    <Sec id="tarjetas" titulo="Tarjetas" items={tarjMes} hoja="TARJETAS">
      {totalTarjUsd>0 && <div style={{padding:'0 18px 8px', display:'flex', gap:8, alignItems:'center', fontSize:12}}>
        <span style={{color:T.ink2}}>💵 Dólares a pagar este mes: <b style={{fontFamily:MONO}}>US$ {fmt(totalTarjUsd)}</b></span>
        {totalTarjUsdPend>0 ? <span style={{fontSize:11, color:T.warn, background:T.warnSoft, padding:'2px 8px', borderRadius:6, fontWeight:600}}>pendiente US$ {fmt(totalTarjUsdPend)}</span> : <span style={{fontSize:11, color:T.pos, background:T.posSoft, padding:'2px 8px', borderRadius:6, fontWeight:600}}>todo pagado ✓</span>}
      </div>}
      {tarjMes.length?tarjMes.map((t,i)=>{ const rm=parseInt(t['Mes']); const res=rm>=1&&rm<=12?` · resumen ${MESES_LARGO[rm-1]}`:''; const pdf=t['PDF resumen']; const nota=t['Notas']; const sp=splitDe(t); const usd=usdDe(t); const upg=usdPagado(t); return <div key={i}>
      <Fila hoja="TARJETAS" it={t} label={`${t['Tarjeta']}${res}`} monto={parseMonto(t['Monto'])} extra={pdf?<a href={pdf} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{marginLeft:8, fontSize:11, color:T.brand, textDecoration:'none', fontWeight:600}}>📎 PDF</a>:null}/>
      {usd>0 && <div style={{padding:'0 18px 9px 18px', display:'flex', gap:10, alignItems:'center', fontSize:11.5}}>
        <span style={{color:T.ink3}}>💵 En dólares: <b style={{fontFamily:MONO, color:upg?T.pos:T.ink2}}>US$ {fmt(usd)}</b></span>
        <button onClick={()=>toggleUsd(t)} style={{fontSize:10.5, padding:'2px 9px', borderRadius:6, border:'none', cursor:'pointer', background:upg?T.posSoft:T.warnSoft, color:upg?T.pos:T.warn, fontWeight:600}}>{upg?'US$ pagado ✓':'US$ pendiente'}</button>
      </div>}
      {sp.n>0
        ? <div style={{padding:'0 18px 9px 18px', display:'flex', gap:14, alignItems:'center', flexWrap:'wrap', fontSize:11.5, color:T.ink3}}><span>🏢 Empresa {fmt(sp.emp)}{sp.eusd?` +US$${Math.round(sp.eusd)}`:''}</span><span>👨 Juan {fmt(sp.juan)}</span><span>👩 Sofi {fmt(sp.sofi)}</span><button onClick={()=>setDetalle(t)} style={{fontSize:11, color:T.brand, background:'none', border:'none', cursor:'pointer', fontWeight:600, padding:0}}>Ver detalle ›</button></div>
        : (nota&&/empresa/i.test(nota) ? <div style={{padding:'0 18px 9px 18px', fontSize:11.5, color:T.ink3, display:'flex', gap:14, flexWrap:'wrap'}}>{nota.split('·').map((p,k)=><span key={k}>{p.trim()}</span>)}</div> : null)}
    </div> }):<div style={{padding:'12px 18px', fontSize:12.5, color:T.ink3}}>Sin tarjetas a pagar este mes. Subí el resumen ⬆</div>}</Sec>
    <Sec id="prestamos" titulo="Préstamos" items={prestBancoMes} hoja="PRESTAMOS">{prestBancoMes.length?prestBancoMes.map((p,i)=>{ const tot=parseInt(String(p['Cuotas total']).replace(/\D/g,''))||0, nro=parseInt(String(p['Cuota nro']).replace(/\D/g,''))||0, faltan=Math.max(0,tot-nro); const v=parseD(p['Vencimiento']); const ult=v&&faltan?new Date(v.getFullYear(),v.getMonth()+faltan,1):null; const hasta=ult?` · hasta ${MESES_LARGO[ult.getMonth()].slice(0,3)}/${ult.getFullYear()}`:''; return <Fila key={i} hoja="PRESTAMOS" it={p} label={`${p['Prestamo']} · cuota ${nro}/${tot}${faltan?` · faltan ${faltan}${hasta}`:' · última ✓'}`} monto={parseMonto(p['Monto cuota'])}/> }):null}</Sec>
    {prestSocio.length>0 && <Sec id="socios" titulo="Deudas entre socios" sub={`${prestSocio.length} sin saldar`} total={prestSocio.reduce((a,p)=>a+parseMonto(p['Monto cuota']),0)}>
      {prestSocio.map((p,i)=>{ const deudor=p['Deudor']||'', acreedor=p['Acreedor']||'', magmaDebe=/magma/i.test(deudor); const ic=n=>/juan/i.test(n)?'👤':/sof/i.test(n)?'👩':'🏢'; return <div key={i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, padding:'10px 18px', borderTop:`1px solid ${T.border}`}}>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:13, color:T.ink}}>{ic(deudor)} <b>{deudor}</b> le debe a {ic(acreedor)} <b>{acreedor}</b></div>
          <div style={{fontSize:11, color:T.ink3}}>{p['Prestamo']}{p['Notas']?` · ${p['Notas']}`:''}{magmaDebe?' · Magma tiene que devolver':' · le entra a Magma'}</div>
        </div>
        <span style={{fontSize:13.5, fontFamily:MONO, color:magmaDebe?T.warn:T.pos, fontWeight:600}}>{fmt(parseMonto(p['Monto cuota']))}</span>
        <button onClick={()=>saldarSocio(p)} style={{fontSize:11, padding:'3px 10px', borderRadius:6, border:`1px solid ${T.border}`, cursor:'pointer', background:T.surface, color:T.ink2, fontWeight:600}}>Marcar saldada</button>
      </div> })}
    </Sec>}
    {cuotasAll.length>0 && <Sec id="cuotas" titulo="Cuotas de tarjeta a futuro (ya comprometidas)" sub={`este mes ${fmtM(proxCuotas[0].tot)}`} total={totFutCuota('Juan')+totFutCuota('Sofi')+totFutCuota('Magma')}>
      <div style={{padding:'6px 18px 2px'}}>
        <div style={{display:'flex', gap:6, overflowX:'auto', paddingBottom:8}}>
          {proxCuotas.map((mm,i)=><div key={i} style={{minWidth:100, flex:'0 0 auto', background:i===0?T.brandSoft:T.surfaceAlt, borderRadius:9, padding:'8px 10px'}}>
            <div style={{fontSize:10.5, color:T.ink3, fontWeight:600}}>{MESES_LARGO[mm.m-1].slice(0,3)}/{String(mm.a).slice(2)}{i===0?' (este)':''}</div>
            <div style={{fontSize:14, fontWeight:700, fontFamily:MONO, color:T.ink}}>{fmt(mm.tot)}</div>
            <div style={{fontSize:9.5, color:T.ink3}}>{mm.n} cuota{mm.n===1?'':'s'}</div>
          </div>)}
        </div>
        <div style={{fontSize:11, color:T.ink3, marginBottom:4}}>Comprometido de acá en más: 👤 Juan {fmt(totFutCuota('Juan'))} · 👩 Sofi {fmt(totFutCuota('Sofi'))} · 🏢 Magma {fmt(totFutCuota('Magma'))}</div>
      </div>
      {[...cuotasAll].sort((a,b)=> (parseMonto(b['Monto cuota'])*((parseInt(b['Cuotas total'])||0)-(parseInt(b['Cuota actual'])||0))) - (parseMonto(a['Monto cuota'])*((parseInt(a['Cuotas total'])||0)-(parseInt(a['Cuota actual'])||0))) ).map((c,i)=>{
        const act=parseInt(c['Cuota actual'])||0, tot=parseInt(c['Cuotas total'])||0, faltan=Math.max(0,tot-act), lastT=absM(parseInt(c['Mes base'])||7,parseInt(c['Año base'])||2026)+faltan, lm=(lastT%12)+1, la=Math.floor(lastT/12), pIcon=persDe(c)==='Juan'?'👤':persDe(c)==='Sofi'?'👩':'🏢'
        return <div key={i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 18px', borderTop:`1px solid ${T.border}`}}>
          <div><div style={{fontSize:13, color:T.ink, fontWeight:500}}>{pIcon} {c['Comercio']} <span style={{fontSize:10.5, color:T.ink3, fontWeight:400}}>{c['Tarjeta']}</span></div><div style={{fontSize:11, color:T.ink3}}>cuota {act}/{tot} · faltan {faltan} · hasta {MESES_LARGO[lm-1].slice(0,3)}/{String(la).slice(2)}</div></div>
          <div style={{fontFamily:MONO, fontSize:13, color:T.ink2}}>{fmt(parseMonto(c['Monto cuota']))}<span style={{fontSize:10, color:T.ink3}}>/mes</span></div>
        </div>
      })}
    </Sec>}
    {movMes.length>0 && <Sec id="movimientos" titulo="Movimientos del mes (cambios de plata, no gastos)" sub={`${movMes.length} movimiento${movMes.length===1?'':'s'}`}>
      {movMes.map((m,i)=>{ const mo=String(m['Moneda origen']||'ARS').toUpperCase(), md=String(m['Moneda destino']||'ARS').toUpperCase(); const showM=(v,cur)=>cur==='USD'?`US$ ${fmt(parseMonto(v))}`:fmt(parseMonto(v)); return <div key={i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, padding:'9px 18px', borderTop:`1px solid ${T.border}`}}>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:13, color:T.ink}}>{m['Tipo']}{m['Descripción']?` · ${m['Descripción']}`:''}</div>
          <div style={{fontSize:11, color:T.ink3}}>{m['Fecha']}{m['Cuenta origen']?` · de ${m['Cuenta origen']}`:''}{m['Cuenta destino']?` → ${m['Cuenta destino']}`:''}{m['Persona']?` · ${m['Persona']}`:''}</div>
        </div>
        <span style={{fontSize:13, fontFamily:MONO, color:T.ink2}}>{m['Cuenta destino']&&parseMonto(m['Monto destino'])?showM(m['Monto destino'],md):showM(m['Monto origen'],mo)}</span>
      </div> })}
    </Sec>}
    {subir && <SubirResumen datos={data} onClose={()=>setSubir(false)} onDone={()=>{ setSubir(false); if(onRefresh) onRefresh() }} showToast={showToast}/>}
    {agregar && <AgregarEgreso cuentaOpts={cuentaOpts} cuentas={cuentas} mesIdx={mesIdx} anio={anio} onClose={()=>setAgregar(false)} onDone={()=>{ setAgregar(false); if(onRefresh) onRefresh() }} showToast={showToast}/>}
    {editGasto && <EditarGasto g={editGasto} cuentas={cuentas.map(c=>String(c['Nombre']||'').trim()).filter(Boolean)} onClose={()=>setEditGasto(null)} onDone={()=>{ setEditGasto(null); if(onRefresh) onRefresh() }} showToast={showToast}/>}
    {detalle && <DetalleTarjeta t={detalle} items={itemsDe(detalle)} cuotas={cuotasAll.filter(c=>normTxt(c['Tarjeta'])===normTxt(detalle['Tarjeta']))} onClose={()=>setDetalle(null)} onRefresh={onRefresh} showToast={showToast}/>}
  </>
}

// Modal "Agregar": gasto (fijo o impuesto puntual) · movimiento de plata (dólares/transferencia/efectivo) · préstamo entre socios
function AgregarEgreso({cuentaOpts, cuentas, mesIdx, anio, onClose, onDone, showToast}){
  const [tab,setTab]=useState('gasto')
  const [saving,setSaving]=useState(false)
  const monedaCuenta=n=>{ const c=(cuentas||[]).find(x=>String(x['Nombre']||'').trim().toLowerCase()===String(n||'').trim().toLowerCase()); return /d[oó]lar|usd/i.test(String(c?.['Tipo']||'')+String(c?.['Nombre']||''))?'USD':'ARS' }
  // --- Gasto ---
  const pad2=n=>String(n).padStart(2,'0')
  const [g,setG]=useState(()=>({recurrencia:'unico', categoria:'Impuestos', concepto:'', monto:'', moneda:'ARS', diaPago:'', fecha:`${anio}-${pad2(mesIdx)}-${pad2(Math.min(new Date().getDate(),28))}`, pagado:false, cuentaPago:cuentaOpts.find(c=>!/d[oó]lar/i.test(c))||cuentaOpts[0]||'', notas:''}))
  const gFy=Number((g.fecha||'').split('-')[0])||anio, gFm=Number((g.fecha||'').split('-')[1])||mesIdx
  // --- Movimiento ---
  const [mv,setMv]=useState({tipo:'Compra dólares', cuentaOrigen:cuentaOpts.find(c=>!/d[oó]lar/i.test(c))||cuentaOpts[0]||'', cuentaDestino:cuentaOpts.find(c=>/d[oó]lar/i.test(c))||'', montoOrigen:'', montoDestino:'', descripcion:'', notas:''})
  const moOrig=monedaCuenta(mv.cuentaOrigen), moDest=monedaCuenta(mv.cuentaDestino), esConv=moOrig!==moDest
  const coti=esConv&&mv.montoOrigen&&mv.montoDestino ? (parseMontoAR(moOrig==='USD'?mv.montoDestino:mv.montoOrigen)/parseMontoAR(moOrig==='USD'?mv.montoOrigen:mv.montoDestino)) : 0
  // --- Préstamo socio ---
  const [pr,setPr]=useState({direccion:'a_magma', persona:'Sofi', monto:'', moneda:'ARS', ajusta:true, cuenta:cuentaOpts.find(c=>!/d[oó]lar/i.test(c))||cuentaOpts[0]||'', notas:''})

  async function post(url, body){ setSaving(true)
    try{ const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const j=await r.json(); if(j&&j.error){ showToast(j.error,'err'); setSaving(false); return false } setSaving(false); return true }
    catch(e){ showToast('Error de conexión','err'); setSaving(false); return false } }

  async function guardarGasto(){ if(!g.concepto.trim()){showToast('Poné el concepto','err');return} if(parseMontoAR(g.monto)<=0){showToast('El monto tiene que ser mayor a 0','err');return}
    if(g.pagado && !g.cuentaPago){showToast('Elegí de qué cuenta se pagó','err');return}
    // Puntual: la fecha del datepicker define el mes/año/día. Fijo: mes/año del que estás viendo + día de pago.
    let mesEnv=mesIdx, anioEnv=anio, diaEnv=g.diaPago, fechaPagoEnv=''
    if(g.recurrencia==='unico'){ const [Y,M,D]=(g.fecha||'').split('-').map(Number); if(Y&&M&&D){ anioEnv=Y; mesEnv=M; diaEnv=D; fechaPagoEnv=`${D}/${M}/${Y}` } }
    const ok=await post('/api/gasto-nuevo',{categoria:g.categoria, concepto:g.concepto, monto:parseMontoAR(g.monto), moneda:g.moneda, recurrencia:g.recurrencia, diaPago:diaEnv, mes:mesEnv, anio:anioEnv, notas:g.notas, pagado:g.pagado, cuentaPago:g.pagado?g.cuentaPago:'', fechaPago:g.pagado?(fechaPagoEnv||undefined):''})
    if(ok){ showToast(g.pagado?'Gasto agregado y pagado ✓':(g.recurrencia==='unico'?'Gasto agregado ✓':'Gasto fijo agregado ✓')); onDone() } }
  async function guardarMov(){ if(parseMontoAR(mv.montoOrigen)<=0){showToast('Poné el monto','err');return} if(esConv&&mv.cuentaDestino&&parseMontoAR(mv.montoDestino)<=0){showToast('Poné cuántos '+moDest+' entran','err');return}
    const ok=await post('/api/movimiento-nuevo',{tipo:mv.tipo, descripcion:mv.descripcion, cuentaOrigen:mv.cuentaOrigen, monedaOrigen:moOrig, montoOrigen:parseMontoAR(mv.montoOrigen), cuentaDestino:mv.cuentaDestino, monedaDestino:moDest, montoDestino:esConv?parseMontoAR(mv.montoDestino):parseMontoAR(mv.montoOrigen), cotizacion:coti?Math.round(coti):'', notas:mv.notas})
    if(ok){ showToast('Movimiento registrado ✓'); onDone() } }
  async function guardarPrestamo(){ if(parseMontoAR(pr.monto)<=0){showToast('Poné el monto','err');return}
    const aMagma=pr.direccion==='a_magma'  // socio → Magma (Magma le debe)
    const deudor=aMagma?'Magma':pr.persona, acreedor=aMagma?pr.persona:'Magma', efecto=aMagma?'entra':'sale'
    const ok=await post('/api/prestamo-socio',{nombre:`${deudor} debe a ${acreedor}`, deudor, acreedor, monto:parseMontoAR(pr.monto), moneda:pr.moneda, cuenta:pr.ajusta?pr.cuenta:'', efecto:pr.ajusta?efecto:'', notas:pr.notas})
    if(ok){ showToast('Préstamo registrado ✓'); onDone() } }

  const TabBtn=({id,label})=><button onClick={()=>setTab(id)} style={{flex:1, padding:'9px 8px', borderRadius:9, border:`1px solid ${tab===id?T.brand:T.border}`, background:tab===id?T.brandSoft:T.surface, color:tab===id?T.brand:T.ink2, fontSize:12.5, fontWeight:tab===id?700:500, cursor:'pointer'}}>{label}</button>

  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:200, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'40px 20px', overflowY:'auto'}}>
    <div onClick={e=>e.stopPropagation()} style={{background:T.surface, borderRadius:16, width:520, maxWidth:'100%', border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)', height:'fit-content'}}>
      <div style={{padding:'16px 22px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div style={{fontSize:16, fontWeight:700, color:T.ink}}>Agregar</div>
        <button onClick={onClose} style={{border:'none', background:'transparent', fontSize:22, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
      </div>
      <div style={{padding:'16px 22px'}}>
        <div style={{display:'flex', gap:8, marginBottom:16}}>
          <TabBtn id="gasto" label="💸 Gasto / Impuesto"/>
          <TabBtn id="movimiento" label="🔁 Movimiento"/>
          <TabBtn id="prestamo" label="🤝 Préstamo"/>
        </div>

        {tab==='gasto' && <>
          <div style={{display:'flex', gap:8, marginBottom:14}}>
            <button onClick={()=>setG(s=>({...s,recurrencia:'unico',categoria:s.categoria==='Otros'?'Impuestos':s.categoria}))} style={{flex:1, padding:'8px', borderRadius:8, border:`1px solid ${g.recurrencia==='unico'?T.brand:T.border}`, background:g.recurrencia==='unico'?T.brandSoft:T.surface, color:g.recurrencia==='unico'?T.brand:T.ink2, fontSize:12, fontWeight:600, cursor:'pointer'}}>Puntual / impuesto<div style={{fontSize:10, fontWeight:400, color:T.ink3}}>un solo pago</div></button>
            <button onClick={()=>setG(s=>({...s,recurrencia:'fijo'}))} style={{flex:1, padding:'8px', borderRadius:8, border:`1px solid ${g.recurrencia==='fijo'?T.brand:T.border}`, background:g.recurrencia==='fijo'?T.brandSoft:T.surface, color:g.recurrencia==='fijo'?T.brand:T.ink2, fontSize:12, fontWeight:600, cursor:'pointer'}}>Fijo mensual<div style={{fontSize:10, fontWeight:400, color:T.ink3}}>todos los meses</div></button>
          </div>
          {g.recurrencia==='unico' && <div style={{fontSize:11.5, color:T.ink3, marginBottom:12, background:T.surfaceAlt, padding:'8px 10px', borderRadius:8}}>Se carga en <b>{MESES_LARGO[gFm-1]} {gFy}</b> (según la fecha que elijas). Lo marcás pagado y se descuenta de la cuenta.</div>}
          <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:12}}>
            <Fld label="Categoría"><input list="ae-cats" value={g.categoria} onChange={e=>setG(s=>({...s,categoria:e.target.value}))} style={inpV2}/><datalist id="ae-cats"><option value="Impuestos"/><option value="Operativos"/><option value="Financieros"/><option value="Seguros"/><option value="Software"/><option value="Sueldos"/><option value="Otros"/></datalist></Fld>
            {g.recurrencia==='unico'
              ? <Fld label="Fecha"><input type="date" value={g.fecha} onChange={e=>setG(s=>({...s,fecha:e.target.value}))} style={inpV2}/></Fld>
              : <Fld label="Día de pago"><input value={g.diaPago} onChange={e=>setG(s=>({...s,diaPago:e.target.value}))} placeholder="ej 23" style={inpV2}/></Fld>}
          </div>
          <div style={{marginBottom:12}}><label style={lblV2}>Concepto *</label><input value={g.concepto} onChange={e=>setG(s=>({...s,concepto:e.target.value}))} placeholder={g.recurrencia==='unico'?'ej: IVA julio 2026':'ej: Seguro oficina'} style={inpV2} autoFocus/></div>
          <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:12}}>
            <Fld label="Monto *"><MontoInput value={g.monto} onChange={v=>setG(s=>({...s,monto:v}))} placeholder="0" style={{...inpV2, fontFamily:MONO}}/></Fld>
            <Fld label="Moneda"><select value={g.moneda} onChange={e=>setG(s=>({...s,moneda:e.target.value}))} style={inpV2}><option>ARS</option><option>USD</option></select></Fld>
          </div>
          <div style={{marginBottom:12, background:g.pagado?T.posSoft:T.surfaceAlt, borderRadius:8, padding:'10px 12px'}}>
            <label style={{display:'flex', gap:8, alignItems:'center', fontSize:13, color:T.ink2, cursor:'pointer', fontWeight:600}}>
              <input type="checkbox" checked={g.pagado} onChange={e=>setG(s=>({...s,pagado:e.target.checked}))}/>
              ✅ Ya está pagado (descontar de una cuenta ahora)
            </label>
            {g.pagado && <div style={{marginTop:10}}><label style={lblV2}>Pagado desde</label><select value={g.cuentaPago} onChange={e=>setG(s=>({...s,cuentaPago:e.target.value}))} style={inpV2}>{cuentaOpts.map(c=><option key={c} value={c}>{c}</option>)}</select></div>}
          </div>
          <div style={{marginBottom:16}}><label style={lblV2}>Nota (opcional)</label><input value={g.notas} onChange={e=>setG(s=>({...s,notas:e.target.value}))} style={inpV2}/></div>
          <button disabled={saving} onClick={guardarGasto} style={btnAgregar(saving)}>{saving?'Guardando…':`${g.pagado?'Agregar y marcar pagado':`Agregar ${g.recurrencia==='unico'?'gasto puntual':'gasto fijo'}`}`}</button>
        </>}

        {tab==='movimiento' && <>
          <div style={{marginBottom:12}}><label style={lblV2}>Tipo de movimiento</label>
            <select value={mv.tipo} onChange={e=>setMv(s=>({...s,tipo:e.target.value}))} style={inpV2}>
              <option>Compra dólares</option><option>Venta dólares</option><option>Transferencia entre cuentas</option><option>Retiro de efectivo</option><option>Depósito de efectivo</option><option>Otro</option>
            </select>
          </div>
          <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:12}}>
            <Fld label="Sale de"><select value={mv.cuentaOrigen} onChange={e=>setMv(s=>({...s,cuentaOrigen:e.target.value}))} style={inpV2}>{cuentaOpts.map(c=><option key={c} value={c}>{c}</option>)}</select></Fld>
            <Fld label="Entra a"><select value={mv.cuentaDestino} onChange={e=>setMv(s=>({...s,cuentaDestino:e.target.value}))} style={inpV2}><option value="">— (no entra a otra cuenta)</option>{cuentaOpts.map(c=><option key={c} value={c}>{c}</option>)}</select></Fld>
          </div>
          <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:12}}>
            <Fld label={`Monto que sale (${moOrig})`}><MontoInput value={mv.montoOrigen} onChange={v=>setMv(s=>({...s,montoOrigen:v}))} placeholder="0" style={{...inpV2, fontFamily:MONO}} autoFocus/></Fld>
            {esConv && mv.cuentaDestino && <Fld label={`Monto que entra (${moDest})`}><MontoInput value={mv.montoDestino} onChange={v=>setMv(s=>({...s,montoDestino:v}))} placeholder="0" style={{...inpV2, fontFamily:MONO}}/></Fld>}
          </div>
          {esConv && mv.cuentaDestino && coti>0 && <div style={{fontSize:11.5, color:T.ink3, marginBottom:12}}>Tipo de cambio: <b style={{fontFamily:MONO}}>${Math.round(coti).toLocaleString('es-AR')}</b> por dólar</div>}
          <div style={{marginBottom:16}}><label style={lblV2}>Nota (opcional)</label><input value={mv.notas} onChange={e=>setMv(s=>({...s,notas:e.target.value}))} placeholder="ej: para pagar tarjeta en dólares" style={inpV2}/></div>
          <div style={{fontSize:11, color:T.ink3, marginBottom:12}}>Esto NO cuenta como gasto del mes — solo mueve los saldos de las cuentas.</div>
          <button disabled={saving} onClick={guardarMov} style={btnAgregar(saving)}>{saving?'Guardando…':'Registrar movimiento'}</button>
        </>}

        {tab==='prestamo' && <>
          <div style={{display:'flex', gap:8, marginBottom:14}}>
            <button onClick={()=>setPr(s=>({...s,direccion:'a_magma'}))} style={{flex:1, padding:'8px', borderRadius:8, border:`1px solid ${pr.direccion==='a_magma'?T.brand:T.border}`, background:pr.direccion==='a_magma'?T.brandSoft:T.surface, color:pr.direccion==='a_magma'?T.brand:T.ink2, fontSize:11.5, fontWeight:600, cursor:'pointer'}}>Un socio le presta a Magma<div style={{fontSize:10, fontWeight:400, color:T.ink3}}>Magma le debe</div></button>
            <button onClick={()=>setPr(s=>({...s,direccion:'de_magma'}))} style={{flex:1, padding:'8px', borderRadius:8, border:`1px solid ${pr.direccion==='de_magma'?T.brand:T.border}`, background:pr.direccion==='de_magma'?T.brandSoft:T.surface, color:pr.direccion==='de_magma'?T.brand:T.ink2, fontSize:11.5, fontWeight:600, cursor:'pointer'}}>Magma le presta a un socio<div style={{fontSize:10, fontWeight:400, color:T.ink3}}>el socio le debe</div></button>
          </div>
          <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:12}}>
            <Fld label="Socio"><input list="ae-socios" value={pr.persona} onChange={e=>setPr(s=>({...s,persona:e.target.value}))} style={inpV2}/><datalist id="ae-socios"><option value="Sofi"/><option value="Juan"/></datalist></Fld>
            <Fld label="Monto *"><MontoInput value={pr.monto} onChange={v=>setPr(s=>({...s,monto:v}))} placeholder="ej 650.000" style={{...inpV2, fontFamily:MONO}} autoFocus/></Fld>
            <Fld label="Moneda"><select value={pr.moneda} onChange={e=>setPr(s=>({...s,moneda:e.target.value}))} style={inpV2}><option>ARS</option><option>USD</option></select></Fld>
          </div>
          <label style={{display:'flex', gap:8, alignItems:'center', fontSize:12.5, color:T.ink2, marginBottom:10, cursor:'pointer'}}>
            <input type="checkbox" checked={pr.ajusta} onChange={e=>setPr(s=>({...s,ajusta:e.target.checked}))}/>
            {pr.direccion==='a_magma'?'La plata ya entró a una cuenta (sumar saldo)':'La plata salió de una cuenta (restar saldo)'}
          </label>
          {pr.ajusta && <div style={{marginBottom:12}}><label style={lblV2}>Cuenta</label><select value={pr.cuenta} onChange={e=>setPr(s=>({...s,cuenta:e.target.value}))} style={inpV2}>{cuentaOpts.map(c=><option key={c} value={c}>{c}</option>)}</select></div>}
          <div style={{marginBottom:16}}><label style={lblV2}>Nota (opcional)</label><input value={pr.notas} onChange={e=>setPr(s=>({...s,notas:e.target.value}))} style={inpV2}/></div>
          <div style={{fontSize:11.5, color:T.ink3, marginBottom:12, background:T.surfaceAlt, padding:'8px 10px', borderRadius:8}}>Queda en <b>Préstamos → Deudas entre socios</b>: {pr.direccion==='a_magma'?`Magma le debe ${fmt(parseMontoAR(pr.monto))} a ${pr.persona}`:`${pr.persona} le debe ${fmt(parseMontoAR(pr.monto))} a Magma`}</div>
          <button disabled={saving} onClick={guardarPrestamo} style={btnAgregar(saving)}>{saving?'Guardando…':'Registrar préstamo'}</button>
        </>}
      </div>
    </div>
  </div>
}
const btnAgregar=disabled=>({width:'100%', padding:'11px', borderRadius:10, border:'none', background:disabled?T.ink3:T.brand, color:'#fff', fontSize:13.5, fontWeight:700, cursor:disabled?'default':'pointer'})

// Editar un gasto ya cargado (concepto, categoría, monto, día, cómo se paga y de qué cuenta). Si ya está pagado y cambia el monto, ajusta la cuenta.
const MEDIOS_GASTO=['Transferencia','Débito automático','Efectivo','Tarjeta']
function EditarGasto({g, cuentas=[], onClose, onDone, showToast}){
  // "Persona/Cuenta" a veces trae el número de la cuenta ("Galicia Sofi (CA 4014…)") o el nombre de una persona.
  const cuentaDe=s=>cuentas.find(n=>normTxt(s).startsWith(normTxt(n)))||''
  const medio0=String(g['Medio de pago']||'').trim(), cuenta0=cuentaDe(g['Persona/Cuenta'])
  const [f,setF]=useState({Concepto:g['Concepto']||'', Categoria:g['Categoria']||'', Monto:numAMontoAR(parseMonto(g['Monto'])), 'Dia pago':g['Dia pago']||'', medio:medio0, cuenta:cuenta0})
  const [saving,setSaving]=useState(false)
  const pagado=/^s[íi]$|^true$/i.test(String(g['Pagado']||''))||String(g['Meses pagados']||'').trim()!==''
  async function guardar(){
    if(!String(f.Concepto).trim()){showToast('Poné el concepto','err');return}
    if(parseMontoAR(f.Monto)<=0){showToast('El monto tiene que ser mayor a 0','err');return}
    setSaving(true)
    try{ const r=await fetch('/api/gasto-editar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fila:g.__row, cambios:{Concepto:f.Concepto, Categoria:f.Categoria, Monto:parseMontoAR(f.Monto), 'Dia pago':f['Dia pago'], ...(f.medio!==medio0?{'Medio de pago':f.medio}:{}), ...(f.cuenta!==cuenta0?{'Persona/Cuenta':f.cuenta}:{})}})})
      const j=await r.json(); if(j&&j.error){showToast(j.error,'err');setSaving(false);return}
      showToast('Gasto actualizado ✓'+(j.ajusteCuenta?` · cuenta ajustada ${fmt(Math.abs(j.ajusteCuenta))}`:'')); onDone()
    }catch(e){ showToast('Error de conexión','err'); setSaving(false) } }
  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(26,25,23,0.4)', zIndex:210, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'40px 20px', overflowY:'auto'}}>
    <div onClick={e=>e.stopPropagation()} style={{background:T.surface, borderRadius:16, width:460, maxWidth:'100%', border:`1px solid ${T.border}`, boxShadow:'0 16px 50px rgba(0,0,0,0.18)', height:'fit-content'}}>
      <div style={{padding:'16px 22px', borderBottom:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div style={{fontSize:16, fontWeight:700, color:T.ink}}>Editar gasto</div>
        <button onClick={onClose} style={{border:'none', background:'transparent', fontSize:22, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
      </div>
      <div style={{padding:'16px 22px'}}>
        <div style={{marginBottom:12}}><label style={lblV2}>Concepto</label><input value={f.Concepto} onChange={e=>setF(s=>({...s,Concepto:e.target.value}))} style={inpV2} autoFocus/></div>
        <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:12}}>
          <div style={{flex:'1 1 140px'}}><label style={lblV2}>Categoría</label><input value={f.Categoria} onChange={e=>setF(s=>({...s,Categoria:e.target.value}))} style={inpV2}/></div>
          <div style={{flex:'0 1 100px'}}><label style={lblV2}>Día de pago</label><input value={f['Dia pago']} onChange={e=>setF(s=>({...s,['Dia pago']:e.target.value}))} placeholder="ej 23" style={inpV2}/></div>
        </div>
        <div style={{marginBottom:14}}><label style={lblV2}>Monto{String(g['Moneda']||'').toUpperCase()==='USD'?' (USD)':''}</label><MontoInput value={f.Monto} onChange={v=>setF(s=>({...s,Monto:v}))} style={{...inpV2, fontFamily:MONO}}/></div>
        <div style={{display:'flex', gap:10, flexWrap:'wrap', marginBottom:6}}>
          <div style={{flex:'1 1 150px'}}><label style={lblV2}>Cómo se paga</label><select value={f.medio} onChange={e=>setF(s=>({...s,medio:e.target.value}))} style={inpV2}>{!MEDIOS_GASTO.includes(f.medio) && <option value={f.medio}>{f.medio||'Sin definir'}</option>}{MEDIOS_GASTO.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
          <div style={{flex:'1 1 150px'}}><label style={lblV2}>De qué cuenta sale</label><select value={f.cuenta} onChange={e=>setF(s=>({...s,cuenta:e.target.value}))} style={inpV2}><option value="">Sin definir</option>{cuentas.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
        </div>
        <div style={{fontSize:11.5, color:T.ink3, marginBottom:14, lineHeight:1.45}}>{/d[eé]bito/i.test(f.medio)?'Se debita solo: en Caja solo hay que mirar que esa cuenta tenga saldo.':/^tarjeta$/i.test(f.medio)?'Viene adentro del resumen de la tarjeta: Caja no lo cuenta aparte.':'Hay que pagarlo a mano: Caja lo muestra para que alguien lo pague.'}</div>
        {pagado && parseMontoAR(f.Monto)!==parseMonto(g['Monto']) && <div style={{fontSize:11.5, color:T.ink2, marginBottom:12, background:T.warnSoft, padding:'8px 10px', borderRadius:8}}>Este gasto ya figura <b>pagado</b>. Al cambiar el monto ajusto la cuenta <b>{g['Cuenta pago']||'—'}</b> por la diferencia (de {fmt(parseMonto(g['Monto']))} a {fmt(parseMontoAR(f.Monto))}).</div>}
        <button disabled={saving} onClick={guardar} style={btnAgregar(saving)}>{saving?'Guardando…':'Guardar cambios'}</button>
      </div>
    </div>
  </div>
}

// Ver detalle de una tarjeta: gastos ya guardados, con toggle Personal <-> Empresa (guarda al instante)
function DetalleTarjeta({t, items, cuotas=[], onClose, onRefresh, showToast}){
  const [busy,setBusy]=useState('')
  // Todos los consumos son editables (Personal ⇄ Magma). Solo los cargos bancarios quedan como agregado fijo.
  const esCargo=m=>/banc/i.test(`${m['Subcategoria']||''} ${m['Comercio']||''}`)
  const indiv=items.filter(m=>!esCargo(m))
  const agg=items.filter(esCargo)
  const itemsSum=items.filter(m=>String(m['Moneda']||'').toUpperCase()!=='USD').reduce((s,m)=>s+parseMonto(m['Monto']),0)
  const totalCard=parseMonto(t['Monto'])
  const deuda=totalCard-itemsSum
  const porPersona={}; indiv.forEach(m=>{ const p=/juan/i.test(m['Descripcion'])?'👨 Juan':/sof/i.test(m['Descripcion'])?'👩 Sofi':(m['Descripcion']||'Otros'); (porPersona[p]=porPersona[p]||[]).push(m) })
  async function flip(m){ if(busy) return; const nueva=String(m['Categoria']||'').toLowerCase()==='empresa'?'Personal':'Empresa'; setBusy(m.__row)
    try{ const r=await fetch('/api/movimiento-clasificar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fila:m.__row,categoria:nueva})}); const j=await r.json(); if(j&&j.error){ showToast(j.error,'err'); setBusy(''); return } showToast(nueva==='Empresa'?'→ Empresa 🏢':'→ Personal 👤'); if(onRefresh) await onRefresh() }
    catch(e){ showToast('Error de conexión','err') } setBusy('') }
  return <div onClick={onClose} style={{position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20}}>
    <div onClick={e=>e.stopPropagation()} style={{background:T.surface, borderRadius:14, padding:20, width:540, maxWidth:'100%', maxHeight:'88vh', overflow:'auto', border:`1px solid ${T.border}`}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
        <h3 style={{margin:0, fontSize:16, fontWeight:700, color:T.ink}}>{t['Tarjeta']} · {MESES_LARGO[(parseInt(t['Mes'])||1)-1]} {t['Año']}</h3>
        <button onClick={onClose} style={{border:'none', background:'transparent', fontSize:22, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
      </div>
      <div style={{fontSize:11.5, color:T.ink3, marginBottom:14}}>Tocá un gasto para pasarlo de Personal 👤 a Empresa 🏢 (o al revés). Se guarda al instante.</div>
      {indiv.length===0 && <div style={{fontSize:12.5, color:T.ink3, padding:'10px 0'}}>Este resumen no tiene el detalle guardado (cargalo por “Subir resumen” para poder editarlo acá).</div>}
      {Object.entries(porPersona).map(([p,arr])=><div key={p} style={{marginBottom:14}}>
        <div style={{fontSize:12, fontWeight:700, color:T.ink2, marginBottom:2}}>{p} · {arr.length}</div>
        {arr.map((m,i)=>{ const emp=String(m['Categoria']||'').toLowerCase()==='empresa'; return <div key={i} onClick={()=>flip(m)} style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, padding:'6px 4px', cursor:'pointer', borderTop:i?`1px solid ${T.border}`:'none', opacity:busy===m.__row?0.4:1}}>
          <span style={{fontSize:12.5, color:emp?T.pos:T.ink2, fontWeight:emp?600:400}}>{emp?'🏢':'👤'} {m['Comercio']} <span style={{color:T.ink3, fontSize:11}}>{m['Fecha']}{String(m['Moneda']||'').toUpperCase()==='USD'?' · USD':''}</span></span>
          <span style={{fontFamily:MONO, fontSize:12.5, color:emp?T.pos:T.ink2}}>{String(m['Moneda']||'').toUpperCase()==='USD'?`US$${fmt(parseMonto(m['Monto']))}`:fmt(parseMonto(m['Monto']))}</span>
        </div> })}
      </div>)}
      {agg.length?<div style={{marginTop:6, paddingTop:10, borderTop:`1px solid ${T.border}`}}><div style={{fontSize:10, fontWeight:700, color:T.ink3, textTransform:'uppercase', letterSpacing:0.3, marginBottom:4}}>Cargos bancarios (fijo)</div>{agg.map((m,i)=><div key={i} style={{display:'flex', justifyContent:'space-between', fontSize:12, color:T.ink3, padding:'2px 4px'}}><span>{m['Comercio']} · {m['Descripcion']}</span><span style={{fontFamily:MONO}}>{fmt(parseMonto(m['Monto']))}{String(m['Moneda']||'').toUpperCase()==='USD'?' US$':''}</span></div>)}</div>:null}
      {deuda>1000?<div style={{marginTop:8, paddingTop:10, borderTop:`1px solid ${T.border}`}}><div style={{display:'flex', justifyContent:'space-between', fontSize:12.5, color:T.ink2, fontWeight:600}}><span>💳 Deuda del mes pasado (financiada)</span><span style={{fontFamily:MONO}}>{fmt(deuda)}</span></div><div style={{fontSize:10.5, color:T.ink3, marginTop:2}}>No es gasto de este mes — es deuda que se arrastra. Seguimiento en la solapa DEUDA_TARJETAS.</div></div>:null}
      <div style={{marginTop:10, paddingTop:10, borderTop:`2px solid ${T.border}`, display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:700, color:T.ink}}><span>Total del resumen (a pagar)</span><span style={{fontFamily:MONO}}>{fmt(totalCard)}</span></div>
      {cuotas.length>0 && <div style={{marginTop:12, paddingTop:10, borderTop:`1px solid ${T.border}`}}>
        <div style={{fontSize:10, fontWeight:700, color:T.ink3, textTransform:'uppercase', letterSpacing:0.3, marginBottom:6}}>Cuotas en curso de esta tarjeta ({cuotas.length})</div>
        {cuotas.map((c,i)=>{ const act=parseInt(c['Cuota actual'])||0, tot=parseInt(c['Cuotas total'])||0, faltan=Math.max(0,tot-act), pIcon=/juan/i.test(c['Persona'])?'👤':/sof/i.test(c['Persona'])?'👩':'🏢'; return <div key={i} style={{display:'flex', justifyContent:'space-between', fontSize:12, padding:'3px 0', color:T.ink2}}>
          <span>{pIcon} {c['Comercio']} <span style={{color:T.ink3, fontSize:10.5}}>cuota {act}/{tot} · faltan {faltan}</span></span>
          <span style={{fontFamily:MONO}}>{fmt(parseMonto(c['Monto cuota']))}/mes</span>
        </div> })}
      </div>}
    </div>
  </div>
}

// Clasifica un movimiento de tarjeta en un rubro + si es empresa, según las reglas de Magma.
function rubroTarjeta(m){
  const txt=`${m.comercio||''} ${m.descripcion||''}`, cat=m.categoria||''
  const has=re=>new RegExp(re,'i').test(txt)
  if(has('ypf|axion|shell|puma|appypf|\\baca\\b|combust|nafta')) return {r:'⛽ Combustible', emp:true}
  if(cat==='Transporte'||has('cabify|didi|uber|subte|emova|peaje|autopista|parking|valet|estacion')) return {r:'🚗 Movilidad', emp:true}
  if(cat==='Suscripciones'||has('adobe|canva|openai|anthropic|claude|artlist|notion|google|higgsfield|motionarray|\\bsirv\\b|wetransfer|workspace')) return {r:'💻 Software', emp:true}
  if(cat==='Viajes'||has('hotel|hilton|posada de los poetas|airbnb|hosped')) return {r:'🏨 Viajes', emp:true}
  if(has('segur|la segunda')) return {r:'🛡️ Seguros', emp:true}
  if(has('dia tienda 317|dia 317')) return {r:'🛒 Insumos (Dia 317)', emp:true}
  if(has('mercadolibre|mercado libre')) return {r:'📦 Mercado Libre', emp:true}
  if(has('\\babl\\b')) return {r:'🏛️ ABL', emp:true}
  if(has('dandy|gangahome|la roble|laroble|mecubrocom')) return {r:'🏢 Varios empresa', emp:true}
  if(cat==='Producción audiovisual') return {r:'🎬 Producción', emp:true}
  if(cat==='Profesional/Servicios') return {r:'🧑‍💼 Servicios', emp:true}
  if(cat==='Cargos bancarios') return {r:'🏦 Cargos bancarios', emp:true}
  if(cat==='Comida y bebida'||has('rappi|coto|carrefour|jumbo|super|resto|cafe|mostaza|grido|helad|pizz|parrilla')) return {r:'🍔 Comida y súper', emp:false}
  return {r:'🛍️ Otros personales', emp:false}
}

// Subir PDF de resumen de tarjeta → IA lo lee → preview agrupado → carga total + movimientos
function SubirResumen({datos={}, onClose, onDone, showToast}){
  const now=new Date()
  const [tarjeta,setTarjeta]=useState('BBVA Visa')
  const [mes,setMes]=useState(now.getMonth()+1)
  const [anio,setAnio]=useState(now.getFullYear())
  const [file,setFile]=useState(null)
  const [b64,setB64]=useState('')
  const [loading,setLoading]=useState(false)
  const [data,setData]=useState(null)
  const [saving,setSaving]=useState(false)
  const [override,setOverride]=useState({})  // "ti:j" -> 'Empresa' | 'Personal' (marca final del usuario, pisa la de la IA)
  const [rubroDe,setRubroDe]=useState({}), [trabajoDe,setTrabajoDe]=useState({})   // por consumo: el rubro corregido y el trabajo al que fue
  const [expand,setExpand]=useState('')       // 'magma' | 'juan' | 'sofi' | ''
  const TARJS=TARJETAS_ACTIVAS   // Master Galicia y Santander Amex ya no se usan (01/10/2026): la lista vive en lib/socios.mjs
  async function procesar(){
    if(!file){ showToast('Elegí el PDF','err'); return }
    setLoading(true)
    try{
      const b=await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result).split(',')[1]); r.onerror=rej; r.readAsDataURL(file) })
      setB64(b)
      const r=await fetch('/api/tarjeta-procesar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pdfBase64:b,fileName:file.name,tarjeta})})
      // Si el servidor corta (tarda demasiado) no contesta JSON: se dice eso en vez de "error de conexión"
      const j=await r.json().catch(()=>({error:r.status===504?'La lectura tardó demasiado y se cortó. Probá de nuevo; no se guardó nada.':`El servidor no pudo leer el PDF (error ${r.status}). No se guardó nada.`}))
      if(!j.ok){ showToast(j.error||'No se pudo leer el PDF','err'); setLoading(false); return }
      // El mes del resumen es el anterior al de su vencimiento (cierra a fin de agosto, vence en septiembre = resumen de agosto)
      const v=String(j.data?.vencimiento||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if(v){ const d=new Date(+v[3], +v[2]-2, 1); setMes(d.getMonth()+1); setAnio(d.getFullYear()) }
      setData(j.data); setOverride({}); setRubroDe({}); setTrabajoDe({})
    }catch(e){ showToast('Error de conexión','err') }
    setLoading(false)
  }
  const titulares=Array.isArray(data?.titulares)?data.titulares:[]
  const totalPagar=Number(data?.total_a_pagar_ars ?? 0)
  const totalPagarUsd=Number(data?.total_a_pagar_usd ?? 0)
  // Aplanar TODOS los movimientos (empresa + personal). Fallback al formato viejo (personales) = Personal.
  const movsAll=[]
  titulares.forEach((t,ti)=>{ const arr=Array.isArray(t.movimientos)?t.movimientos:(t.personales||[]).map(p=>({...p,categoria:'Personal'})); arr.forEach((it,j)=>movsAll.push({ ti, j, key:ti+':'+j, titular:t.nombre||it.titular||'', fecha:it.fecha||'', comercio:it.comercio||'', monto:Number(it.monto)||0, moneda:String(it.moneda||'ARS').toUpperCase(), rubro:it.rubro||it.subcategoria||'', cuota:it.cuota||'', catAI: String(it.categoria||'Personal').toLowerCase()==='empresa'?'Empresa':'Personal' })) })
  const catOf=m=>override[m.key]||m.catAI
  const isEmp=m=>catOf(m)==='Empresa'
  const rubroOf=m=>rubroDe[m.key]??(m.rubro||'')   // el rubro que leyó la IA, o el que corrigió la persona
  const sumIf=pred=>movsAll.filter(pred).reduce((s,m)=>s+m.monto,0)
  const idxJuan=titulares.findIndex(t=>/juan/i.test(t.nombre||''))
  const idxSofi=titulares.findIndex(t=>/sof/i.test(t.nombre||''))
  const empresaUsd=sumIf(m=>m.moneda==='USD'&&isEmp(m))
  const empresa=sumIf(m=>m.moneda==='ARS'&&isEmp(m))
  const personalTot=sumIf(m=>m.moneda==='ARS'&&!isEmp(m))
  const consumos=empresa+personalTot
  const persTit=ti=>sumIf(m=>m.ti===ti&&m.moneda==='ARS'&&!isEmp(m))
  const juanPers=idxJuan>=0?persTit(idxJuan):0
  const sofiPers=idxSofi>=0?persTit(idxSofi):0
  const otrosPers=Math.max(0,personalTot-juanPers-sofiPers)
  const rubEmp={}; movsAll.filter(m=>m.moneda==='ARS'&&isEmp(m)).forEach(m=>{ const k=rubroOf(m)||'Empresa'; rubEmp[k]=(rubEmp[k]||0)+m.monto })
  const rubEmpArr=Object.entries(rubEmp).sort((a,b)=>b[1]-a[1])
  const lecturaOk=movsAll.length>0
  const expIdx=expand==='juan'?idxJuan:expand==='sofi'?idxSofi:-1
  const expList=movsAll.filter(m=>m.ti===expIdx)
  const toggleItem=m=>setOverride(o=>({...o,[m.key]: isEmp(m)?'Personal':'Empresa'}))
  // ---- Lo de Magma, consumo por consumo: el rubro (de la lista única, solapa RUBROS) y, si es de Producción, de qué trabajo fue
  const RUBROS_T=[...(datos.rubros||[]).filter(r=>!/^personal/i.test(r.rubro)).map(r=>r.subrubro?`${r.rubro} · ${r.subrubro}`:r.rubro), 'Percepciones a recuperar']
  // La fecha completa del consumo: el resumen trae día y mes; el año es el del resumen (una cuota de diciembre en el resumen de enero es del año anterior)
  const fechaDe=m=>{ const x=String(m.fecha||'').match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/); if(!x) return null; if(x[3]) return new Date(x[3].length===2?2000+ +x[3]:+x[3], +x[2]-1, +x[1])
    // Nada del resumen puede ser posterior a su cierre (los primeros días del mes siguiente): si con el año del resumen queda
    // después, es del año anterior (la cuota de una compra de septiembre pasado, en el resumen de agosto).
    const d=new Date(anio, +x[2]-1, +x[1]); return d>new Date(anio, mes, 5) ? new Date(anio-1, +x[2]-1, +x[1]) : d }
  const fechaTxt=m=>{ const d=fechaDe(m); return d?`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`:(m.fecha||'') }
  // Los trabajos de esos días (de 6 días antes a 3 después: el auto se alquila antes del rodaje), el más cercano primero
  const trabajosCerca=m=>{ const d=fechaDe(m); if(!d) return []; return (datos.proyectos||[]).map(p=>{ const f=parseD(p['Fecha Evento']); if(!f) return null; const dif=Math.round((f-d)/864e5); return dif>=-3&&dif<=6?{nro:String(p['N° presupuesto']||'').trim(), dif, label:`#${String(p['N° presupuesto']||'').trim()} · ${[p['Cliente'],p['Proyecto']].filter(Boolean).join(' · ').slice(0,44)} · ${f.getDate()}/${f.getMonth()+1}`}:null }).filter(x=>x&&x.nro).sort((a,b)=>Math.abs(a.dif)-Math.abs(b.dif)) }
  const esProd=m=>/^producci/i.test(rubroOf(m))
  // Se propone solo si ese día (o el anterior o el siguiente) hubo UN único trabajo; con dos o más, elige la persona
  const trabajoSug=m=>{ const c=trabajosCerca(m).filter(x=>Math.abs(x.dif)<=1); return c.length===1?c[0].nro:'' }
  const trabajoOf=m=>isEmp(m)&&esProd(m)&&m.moneda==='ARS'?(trabajoDe[m.key]??trabajoSug(m)):''
  const magmaList=movsAll.filter(isEmp)
  const yaCargados=(datos.movimientosTarjeta||[]).filter(x=>normTxt(x['Tarjeta'])===normTxt(tarjeta) && String(x['Mes']).trim()===String(mes) && String(x['Año']).includes(String(anio))).length
  async function confirmar(){
    setSaving(true)
    try{
      // cada movimiento con su marca final → se guarda ítem por ítem (después editable en el detalle de la tarjeta)
      const movs=movsAll.map(m=>({ fecha:fechaTxt(m), titular:m.titular, comercio:m.comercio, monto:m.monto, moneda:m.moneda, categoria:catOf(m), subcategoria: catOf(m)==='Empresa'?(rubroOf(m)||'Empresa'):'Personal', cuota:m.cuota||'', nroTrabajo:trabajoOf(m) }))
      const nota=lecturaOk?`Magma ${Math.round(empresa).toLocaleString('es-AR')}${empresaUsd?` (+US$${empresaUsd.toFixed(0)})`:''} · Juan ${Math.round(juanPers).toLocaleString('es-AR')} · Sofi ${Math.round(sofiPers).toLocaleString('es-AR')}`:'Total cargado (clasificación pendiente)'
      const r=await fetch('/api/tarjeta-guardar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tarjeta,mes,anio,movimientos:movs,movimientosCompletos:true,totalArs:totalPagar,totalUsd:totalPagarUsd,vencimiento:data.vencimiento,resumenNota:nota,pdfBase64:b64,fileName:file?.name})})
      const j=await r.json(); if(j&&j.error){ showToast(j.error,'err'); setSaving(false); return }
      showToast(j.pdfLink?'Cargado ✓ · PDF en Drive':'Cargado ✓'); onDone&&onDone()
    }catch(e){ showToast('Error de conexión','err'); setSaving(false) }
  }
  const inp={padding:'8px 10px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.ink, fontSize:13, outline:'none'}
  // Leído no es guardado: hasta "Confirmar y cargar" no hay nada en el sheet. Cerrar con un resumen leído (o a medio leer) lo pierde,
  // así que se pregunta antes; y un clic afuera de la ventana no cierra (el 05/10/2026 se perdió así el Santander de septiembre).
  const enJuego=!!data||loading||saving
  const cerrar=()=>{ if(saving) return
    if(data && !window.confirm(`${tarjeta} está leída pero TODAVÍA NO SE GUARDÓ.\n\nSi cerrás, se pierde y hay que leer el PDF de nuevo.\n\n¿Cerrar igual?`)) return
    if(loading && !window.confirm('Se está leyendo el PDF.\n\nSi cerrás, la lectura se pierde.\n\n¿Cerrar igual?')) return
    onClose() }
  return <div onClick={()=>{ if(!enJuego) onClose() }} style={{position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20}}>
    <div onClick={e=>e.stopPropagation()} style={{background:T.surface, borderRadius:14, padding:22, width:data?680:500, maxWidth:'100%', maxHeight:'90vh', overflow:'auto', border:`1px solid ${T.border}`}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
        <h3 style={{margin:0, fontSize:17, fontWeight:700, color:T.ink}}>Subir resumen de tarjeta</h3>
        <button onClick={cerrar} style={{border:'none', background:'transparent', fontSize:22, color:T.ink3, cursor:'pointer', lineHeight:1}}>×</button>
      </div>
      {!data ? <>
        <div style={{display:'flex', gap:8, marginBottom:12, flexWrap:'wrap'}}>
          <select value={tarjeta} onChange={e=>setTarjeta(e.target.value)} style={{...inp, flex:'1 1 160px'}}>{TARJS.map(t=><option key={t} value={t}>{t}</option>)}</select>
          <select value={mes} onChange={e=>setMes(parseInt(e.target.value))} style={{...inp, width:120}}>{MESES_LARGO.map((m,i)=><option key={i} value={i+1}>{m}</option>)}</select>
          <select value={anio} onChange={e=>setAnio(parseInt(e.target.value))} style={{...inp, width:90}}>{[2025,2026].map(a=><option key={a} value={a}>{a}</option>)}</select>
        </div>
        <input type="file" accept="application/pdf" onChange={e=>setFile(e.target.files?.[0]||null)} style={{marginBottom:16, fontSize:13, color:T.ink2}}/>
        <button onClick={procesar} disabled={loading} style={{width:'100%', padding:'11px', borderRadius:10, border:'none', background:loading?T.ink3:T.brand, color:'#fff', fontSize:14, fontWeight:600, cursor:loading?'default':'pointer'}}>{loading?'📄 Leyendo con IA… puede tardar unos minutos':'Leer PDF'}</button>
        <div style={{fontSize:11.5, color:T.ink3, marginTop:10}}>La IA lee el PDF, extrae los consumos y estima Empresa vs Personal. Antes de guardar te muestra el resumen.</div>
      </> : <>
        <div style={{background:T.warnSoft, color:T.warn, borderRadius:10, padding:'9px 13px', fontSize:12.5, marginBottom:10, fontWeight:600}}>Leído, todavía NO guardado. Revisalo y tocá “Confirmar y cargar” abajo.</div>
        <div style={{background:T.surfaceAlt, borderRadius:10, padding:14, marginBottom:14}}>
          <div style={{fontSize:12, color:T.ink3}}>{tarjeta} · resumen de <select value={mes} onChange={e=>setMes(parseInt(e.target.value))} style={{...inp, padding:'2px 4px', fontSize:12}}>{MESES_LARGO.map((x,k)=><option key={k} value={k+1}>{x}</option>)}</select> {anio}{data.vencimiento?` · vence ${data.vencimiento}`:''}</div>
          <div style={{fontSize:22, fontWeight:700, color:T.ink, fontFamily:MONO, marginTop:4}}>{fmt(totalPagar)}{totalPagarUsd?`  + US$${totalPagarUsd}`:''}</div>
          <div style={{fontSize:12, color:T.ink3, marginTop:2}}>total a pagar (saldo del resumen){consumos?` · consumos del mes ${fmt(consumos)}`:''}</div>
        </div>
        {lecturaOk ? <>
        <div style={{fontSize:11.5, color:T.ink3, marginBottom:6, fontWeight:600}}>Tocá Magma para revisar el rubro y el trabajo de cada consumo; tocá Juan o Sofi para ver lo personal de cada uno.</div>
        <div style={{display:'flex', gap:8, marginBottom:10}}>
          <div onClick={()=>setExpand(e=>e==='magma'?'':'magma')} style={{flex:1, background:T.posSoft, borderRadius:10, padding:'10px 12px', cursor:'pointer', outline:expand==='magma'?`2px solid ${T.pos}`:'none'}}><div style={{fontSize:11, color:T.ink3}}>🏢 Magma {expand==='magma'?'▴':'▾'}</div><div style={{fontSize:15, fontWeight:700, fontFamily:MONO, color:T.ink}}>{fmt(empresa)}</div>{empresaUsd?<div style={{fontSize:10.5, color:T.ink3, fontFamily:MONO}}>+US${empresaUsd.toFixed(0)}</div>:null}</div>
          {idxJuan>=0 && <div onClick={()=>setExpand(e=>e==='juan'?'':'juan')} style={{flex:1, background:expand==='juan'?T.brandSoft:T.surfaceAlt, borderRadius:10, padding:'10px 12px', cursor:'pointer'}}><div style={{fontSize:11, color:T.ink3}}>👤 Juan {expand==='juan'?'▴':'▾'}</div><div style={{fontSize:15, fontWeight:700, fontFamily:MONO, color:T.ink}}>{fmt(juanPers)}</div></div>}
          {idxSofi>=0 && <div onClick={()=>setExpand(e=>e==='sofi'?'':'sofi')} style={{flex:1, background:expand==='sofi'?T.brandSoft:T.surfaceAlt, borderRadius:10, padding:'10px 12px', cursor:'pointer'}}><div style={{fontSize:11, color:T.ink3}}>👤 Sofi {expand==='sofi'?'▴':'▾'}</div><div style={{fontSize:15, fontWeight:700, fontFamily:MONO, color:T.ink}}>{fmt(sofiPers)}</div></div>}
        </div>
        {expand==='magma' && magmaList.length>0 && <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:'8px 12px', marginBottom:12, maxHeight:340, overflow:'auto'}}>
          <div style={{fontSize:11, color:T.ink3, marginBottom:6}}>Lo de Magma, consumo por consumo. Cambiá el rubro si no corresponde y, en los de Producción, elegí de qué trabajo fue. El 👤 lo pasa a personal.</div>
          {magmaList.map((m,i)=>{ const cerca=esProd(m)&&m.moneda==='ARS'?trabajosCerca(m):[], rb=rubroOf(m), tr=trabajoOf(m)
            return <div key={m.key} style={{padding:'7px 2px', borderTop:i?`1px solid ${T.border}`:'none'}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8}}>
                <span style={{fontSize:12.5, color:T.ink, fontWeight:600, minWidth:0}}>{m.comercio} <span style={{color:T.ink3, fontSize:11, fontWeight:400}}>{m.fecha} · {m.titular}{m.cuota?` · cuota ${m.cuota}`:''}</span></span>
                <span style={{fontFamily:MONO, fontSize:12.5, color:T.ink, whiteSpace:'nowrap'}}>{m.moneda==='USD'?`US$${m.monto}`:fmt(m.monto)} <button onClick={()=>toggleItem(m)} title="Pasarlo a personal" style={{border:'none', background:'none', cursor:'pointer', fontSize:12, padding:'0 0 0 4px'}}>👤</button></span>
              </div>
              <div style={{display:'flex', gap:6, flexWrap:'wrap', marginTop:4}}>
                <select value={rb} onChange={e=>setRubroDe(o=>({...o,[m.key]:e.target.value}))} style={{...inp, padding:'4px 6px', fontSize:11.5, flex:'1 1 220px', minWidth:0, borderColor:RUBROS_T.includes(rb)?T.border:T.warn}}>{!RUBROS_T.includes(rb) && <option value={rb}>{rb||'Elegir rubro'}</option>}{RUBROS_T.map(r=><option key={r} value={r}>{r}</option>)}</select>
                {esProd(m) && m.moneda==='ARS' && <select value={tr} onChange={e=>setTrabajoDe(o=>({...o,[m.key]:e.target.value}))} style={{...inp, padding:'4px 6px', fontSize:11.5, flex:'1 1 220px', minWidth:0, borderColor:tr?T.pos:T.border}}><option value="">Sin trabajo</option>{tr && !cerca.some(c=>c.nro===tr) && <option value={tr}>#{tr}</option>}{cerca.map(c=><option key={c.nro} value={c.nro}>{c.label}</option>)}</select>}
              </div>
            </div> })}
        </div>}
        {expand && expList.length ? <div style={{background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:'8px 12px', marginBottom:12, maxHeight:260, overflow:'auto'}}>
          <div style={{fontSize:11, color:T.ink3, marginBottom:6}}>Consumos de {expand==='juan'?'Juan':'Sofi'} — tocá para cambiar 👤 personal ⇄ 🏢 Magma</div>
          {expList.map((m,i)=>{ const on=isEmp(m); return <div key={m.key} onClick={()=>toggleItem(m)} style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, padding:'6px 2px', cursor:'pointer', borderTop:i?`1px solid ${T.border}`:'none'}}>
            <span style={{fontSize:12.5, color:on?T.pos:T.ink2, fontWeight:on?600:400}}>{on?'🏢':'👤'} {m.comercio} <span style={{color:T.ink3, fontSize:11}}>{m.fecha}{m.moneda==='USD'?' · US$':''}</span></span>
            <span style={{fontFamily:MONO, fontSize:12.5, color:on?T.pos:T.ink2}}>{fmt(m.monto)}</span>
          </div> })}
        </div> : null}
        {rubEmpArr.length?<div style={{background:T.surfaceAlt, borderRadius:10, padding:'10px 14px', marginBottom:12}}><div style={{fontSize:10, fontWeight:700, color:T.ink3, marginBottom:4, textTransform:'uppercase', letterSpacing:0.4}}>Qué hay en Magma</div>{rubEmpArr.map(([k,v])=><div key={k} style={{display:'flex', justifyContent:'space-between', fontSize:12.5, padding:'2px 0', color:T.ink2}}><span>{k}</span><span style={{fontFamily:MONO}}>{fmt(v)}</span></div>)}</div>:null}
        {otrosPers>0?<div style={{fontSize:11.5, color:T.ink3, marginBottom:12}}>Otros titulares (personal): {fmt(otrosPers)}</div>:null}
        <div style={{fontSize:10.5, color:T.ink3, marginBottom:12}}>Se guarda cada consumo con tu marca (después editable en el detalle de la tarjeta) + el total + el PDF en Drive.</div>
        </> : <div style={{background:T.warnSoft, color:T.warn, borderRadius:10, padding:'11px 14px', fontSize:12, marginBottom:14, fontWeight:500}}>⚠ No pude clasificar bien este resumen. Igual cargo el <b>total a pagar</b> correcto — la división Empresa/Juan/Sofi la hacemos aparte.</div>}
        {yaCargados>0 && <div style={{background:T.warnSoft, color:T.warn, borderRadius:10, padding:'10px 13px', fontSize:12, marginBottom:12, fontWeight:500, lineHeight:1.5}}>⚠ {tarjeta} de {MESES_LARGO[mes-1]} {anio} ya está cargada ({yaCargados} consumos). Si confirmás, se REEMPLAZAN por los de este PDF. Lo que ya estaba marcado (revisado, de qué trabajo fue) se conserva en los consumos que sigan iguales; si acá un consumo de Magma quedó como personal, o al revés, vale lo de esta pantalla.</div>}
        <div style={{display:'flex', gap:8}}>
          <button onClick={()=>{ if(saving) return; if(window.confirm(`${tarjeta} todavía NO se guardó.\n\nSi volvés para elegir otro PDF, esta lectura se pierde.\n\n¿Volver igual?`)) setData(null) }} style={{padding:'10px 16px', borderRadius:10, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:13, fontWeight:600, cursor:'pointer'}}>← Otro</button>
          <button onClick={confirmar} disabled={saving} style={{flex:1, padding:'11px', borderRadius:10, border:'none', background:saving?T.ink3:T.pos, color:'#fff', fontSize:14, fontWeight:600, cursor:saving?'default':'pointer'}}>{saving?'Guardando…':'Confirmar y cargar'}</button>
        </div>
      </>}
    </div>
  </div>
}

// ============================ FREELANCER (alta / datos) ============================
const RUBROS_DEFAULT=['Fotógrafo','Videógrafo','Editor','Filmmaker','Dirección de foto','Sonidista','Drone','Asistente','Productor','Motion','Colorista','Iluminador']
function FreelancerModal({nombre, datos={}, rubrosConocidos=[], onClose, onSaved, showToast}){
  const [nombreEdit,setNombreEdit]=useState(nombre||'')
  const [rubros,setRubros]=useState(()=>String(datos['Rubro']||'').split(',').map(s=>s.trim()).filter(Boolean))
  const [rubroInput,setRubroInput]=useState('')
  const fnInit=()=>{ const v=datos['Fecha de nac']||datos['Fecha de Nac']||''; return v?(String(v).includes('/')?dmyToISO(v):v):'' }
  const [form,setForm]=useState(()=>({ celular:datos['Celular']||'', mailFreelancer:datos['Mail']||'', dni:datos['Dni']||'', fechaNac:fnInit(), cuit:datos['CUIT/CUIL']||'', banco:datos['Banco']||'', alias:datos['Alias']||'', cbu:datos['CBU']||'',
    tarifaMedia:datos['Tarifa media jornada']||'', tarifaJornada:datos['Tarifa jornada']||'', tarifaHoraExtra:datos['Tarifa hora extra']||'', zona:datos['Zona']||'', estado:datos['Estado']||'', notas:datos['Notas']||'',
    // Quién puede entrar a su espacio (/mi). Se abre de a uno: primero los fijos (Juan, 22/9/2026).
    accesoMiMagma:/^(s[ií]|x|true|1|✓)$/i.test(String(datos['Acceso Mi Magma']||'').trim())?'SÍ':'' }))
  const [saving,setSaving]=useState(false)
  const existe = datos && Object.keys(datos).length>0
  const sugeridos=[...new Set([...RUBROS_DEFAULT, ...rubrosConocidos])].filter(r=>r&&!rubros.includes(r)).sort()
  const addRubro=(t)=>{ const v=String(t||'').trim(); if(v&&!rubros.includes(v)) setRubros(rs=>[...rs,v]); setRubroInput('') }
  const campos=[['tarifaMedia','Tarifa media jornada'],['tarifaJornada','Tarifa jornada completa'],['tarifaHoraExtra','Tarifa hora extra (valoriza lo que carga en Edición)'],['zona','Zona'],
    ['celular','Celular'],['mailFreelancer','Mail'],['dni','DNI'],['fechaNac','Fecha de nacimiento','date'],['cuit','CUIT / CUIL'],['banco','Banco'],['alias','Alias'],['cbu','CBU']]
  async function guardar(){
    if(!String(nombreEdit).trim()){ showToast('El nombre no puede quedar vacío','err'); return }
    setSaving(true)
    const body={ nombre:nombreEdit.trim(), nombreOriginal:nombre, rubro:rubros.join(', '), ...form, fechaNac: form.fechaNac?isoToDMY(form.fechaNac):'' }
    try{ const r=await fetch('/api/freelancer-upsert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const j=await r.json(); if(!j.ok){showToast(j.error||'Error','err');setSaving(false);return} showToast(`${String(nombreEdit).split(' ')[0]} guardado`); onSaved&&onSaved() }
    catch(e){ showToast('Error de conexión','err'); setSaving(false) }
  }
  return <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(26,25,23,0.35)',zIndex:950,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'48px 20px',overflowY:'auto'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%',maxWidth:500,background:T.surface,borderRadius:16,border:`1px solid ${T.border}`,boxShadow:'0 16px 50px rgba(0,0,0,0.15)',height:'fit-content'}}>
      <div style={{padding:'18px 22px',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div><div style={{fontSize:16,fontWeight:700,color:T.ink}}>{existe?'Datos del freelancer':'Nuevo freelancer'}</div><div style={{fontSize:12,color:T.ink3,marginTop:2}}>{nombre}</div></div>
        <button onClick={onClose} style={{border:'none',background:'transparent',fontSize:20,color:T.ink3,cursor:'pointer',lineHeight:1}}>×</button>
      </div>
      <div style={{padding:'18px 22px'}}>
        <div style={{marginBottom:14}}><label style={lblV2}>Nombre y apellido</label><input value={nombreEdit} onChange={e=>setNombreEdit(e.target.value)} style={inpV2}/></div>
        {/* Rubro como etiquetas */}
        <label style={lblV2}>Rubro (etiquetas)</label>
        <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>
          {rubros.map((r,i)=>(
            <span key={i} style={{display:'inline-flex',alignItems:'center',gap:5,padding:'4px 9px',borderRadius:20,background:T.brandSoft,color:T.brand,fontSize:12,fontWeight:600}}>{r}<button onClick={()=>setRubros(rs=>rs.filter((_,j)=>j!==i))} style={{border:'none',background:'transparent',color:T.brand,cursor:'pointer',fontSize:13,padding:0,lineHeight:1}}>×</button></span>
          ))}
          {rubros.length===0 && <span style={{fontSize:12,color:T.ink3}}>Sin rubros todavía</span>}
        </div>
        <input list="fl-rubros" value={rubroInput} onChange={e=>{ const v=e.target.value; if(v.includes(',')){addRubro(v.replace(',',''))}else setRubroInput(v) }} onKeyDown={e=>{ if(e.key==='Enter'){e.preventDefault();addRubro(rubroInput)} }} placeholder="Escribí y Enter (ej: Fotógrafo, Editor…)" style={{...inpV2,marginBottom:6}}/>
        <datalist id="fl-rubros">{sugeridos.map(r=><option key={r} value={r}/>)}</datalist>
        <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:16}}>
          {sugeridos.slice(0,8).map(r=><button key={r} onClick={()=>addRubro(r)} style={{padding:'3px 9px',borderRadius:20,border:`1px solid ${T.border}`,background:T.surface,color:T.ink2,fontSize:11.5,cursor:'pointer'}}>+ {r}</button>)}
        </div>
        {/* Estado: para filtrar el roster real de los que ya no trabajan */}
        <div style={{marginBottom:12}}>
          <label style={lblV2}>Estado</label>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {['Activo','Candidato','Inactivo','No llamar'].map(e=>(
              <button key={e} onClick={()=>setForm(f=>({...f,estado:f.estado===e?'':e}))}
                style={{padding:'5px 12px',borderRadius:20,border:`1px solid ${form.estado===e?T.brand:T.border}`,background:form.estado===e?T.brandSoft:T.surface,color:form.estado===e?T.brand:T.ink2,fontSize:12,fontWeight:form.estado===e?600:500,cursor:'pointer'}}>{e}</button>
            ))}
          </div>
        </div>
        {/* Resto de campos */}
        <div style={{display:'flex',flexWrap:'wrap',gap:12}}>
          {campos.map(([k,l,tipo])=>(
            <div key={k} style={{flex:'1 1 45%',minWidth:160}}><label style={lblV2}>{l}</label><input type={tipo||'text'} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={inpV2}/></div>
          ))}
        </div>
        <div style={{marginTop:12}}>
          <label style={lblV2}>Notas (lo que hay que saber de esta persona)</label>
          <textarea value={form.notas} onChange={e=>setForm(f=>({...f,notas:e.target.value}))} rows={2}
            placeholder="Ej: buenísimo con drone · no cobra IVA · avisar con 3 días"
            style={{...inpV2,resize:'vertical',fontFamily:'inherit'}}/>
        </div>
        {/* Mi Magma: su espacio en la app (agenda, para facturar, cómo quedó, su ficha). Se abre
            de a uno. Sin mail no sirve de nada: entra con ESA cuenta de Google. */}
        {(()=>{ const on=form.accesoMiMagma==='SÍ', mail=String(form.mailFreelancer||'').trim(), google=/@(gmail\.com|somosmagma\.com)$/i.test(mail)
          return <div style={{marginTop:14, padding:'12px 14px', borderRadius:10, border:`1px solid ${on?T.pos:T.border}`, background:on?T.posSoft:T.surfaceAlt}}>
            <label style={{display:'flex', gap:10, alignItems:'center', cursor:'pointer', fontSize:13.5, fontWeight:600, color:T.ink}}>
              <input type="checkbox" checked={on} onChange={e=>setForm(f=>({...f,accesoMiMagma:e.target.checked?'SÍ':''}))} style={{width:17,height:17,accentColor:T.pos}}/>
              Puede entrar a Mi Magma
            </label>
            <div style={{fontSize:11.5, color:T.ink2, marginTop:6, lineHeight:1.5}}>
              Ve <b>solo lo suyo</b>: su agenda, lo que tiene para facturar, cómo quedó lo que filmó y su ficha. Entra en <span style={{fontFamily:MONO}}>somos-magma-app.vercel.app/mi</span> con su cuenta de Google.
              {on && !mail && <div style={{color:T.brand, fontWeight:600, marginTop:4}}>Falta el mail: sin mail no puede entrar.</div>}
              {on && mail && !google && <div style={{color:T.warn, fontWeight:600, marginTop:4}}>Ese mail no es de Gmail: tiene que tener una cuenta de Google con ese mail, o pasarte un Gmail.</div>}
            </div>
          </div> })()}
      </div>
      <div style={{padding:'14px 22px',borderTop:`1px solid ${T.border}`,display:'flex',gap:10,justifyContent:'flex-end'}}>
        <button onClick={onClose} style={{padding:'9px 18px',borderRadius:9,border:`1px solid ${T.border}`,background:T.surface,color:T.ink2,fontSize:13,fontWeight:500,cursor:'pointer'}}>Cancelar</button>
        <button onClick={guardar} disabled={saving} style={{padding:'9px 22px',borderRadius:9,border:'none',background:T.brand,color:'#fff',fontSize:13.5,fontWeight:600,cursor:saving?'default':'pointer',opacity:saving?0.6:1}}>{saving?'Guardando…':'Guardar'}</button>
      </div>
    </div>
  </div>
}

// ============================ MAIL A STAFF (facturación) ============================
// El detalle que recibe el freelancer para facturar. Pedido de los chicos (reunión del 18/9/2026):
// llegaba en el orden de las filas del sheet ("1/8 tal trabajo, 10/8 tal otro, 5/8 tal otro")
// y con la fecha al final. Ahora va en orden cronológico y con el día adelante, que es como
// ellos lo cruzan contra su propia agenda. El día es el que fue ESA persona (col "Fechas
// Staff" en los trabajos de varias fechas), no la primera fecha del proyecto.
const ordenCrono = ts => [...ts].sort((a,b)=>(parseD(a.fechaEvento)?.getTime()||Infinity)-(parseD(b.fechaEvento)?.getTime()||Infinity))
const diaCorto = f => { const d=parseD(f); return d ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}` : '' }
// Cliente y agencia de un trabajo, para que se vea de quién es (Juan, 24/9/2026: "así los chicos la pueden ver bien").
// No repite el cliente si el proyecto se llama igual; "Sin agencia / Directo" no cuenta como agencia.
const agenciaReal = a => { const x=String(a||'').trim(); return (x && !/^(sin agencia|directo)/i.test(x)) ? x : '' }
// Cliente directo (sin agencia en el medio): en PROYECTOS la agencia repite el nombre del cliente → se muestra una vez.
const clienteAgenciaDe = t => { const nrm=x=>String(x||'').toLowerCase().trim(); const cli=String(t.cliente||'').trim(), ag=agenciaReal(t.agencia), directo=ag&&nrm(ag)===nrm(cli)
  return [cli && nrm(cli)!==nrm(t.proyecto) ? `🎯 ${cli}` : '', directo ? 'directo' : ag ? `🏢 ${ag}` : ''].filter(Boolean).join(' · ') }
const renglonMailStaff = t => { const nrm=x=>String(x||'').toLowerCase().trim(); const cli=String(t.cliente||'').trim(), ag=agenciaReal(t.agencia), agDistinta=ag&&nrm(ag)!==nrm(cli)
  return `- ${diaCorto(t.fechaEvento)?diaCorto(t.fechaEvento)+' · ':''}${t.pedido} — ${t.proyecto}${cli && nrm(cli)!==nrm(t.proyecto)?` · ${cli}`:''}${agDistinta?` (${ag})`:''}: ${fmt(t.precio)}${t.viaticos?` + viáticos ${fmt(t.viaticos)}`:''}` }

function MailStaffModal({persona, datos={}, cuentas=[], mesNombre, onClose, onSent, showToast}){
  // Entidades fiscales (a quién factura el freelancer) con sus datos, desde CUENTAS
  const entidades={}; cuentas.forEach(c=>{ const ef=c['Entidad fiscal']; if(ef && !entidades[ef]) entidades[ef]={ titular:c['Titular']||'', datos:c['Datos transferencia adicionales']||'' } })
  const FACTURAR_OPC=Object.keys(entidades).length?Object.keys(entidades):['Somos Magma SRL']
  const [para,setPara]=useState(datos['Mail']||'')
  const [cc,setCc]=useState([]), [ccInput,setCcInput]=useState('')
  const [tipo,setTipo]=useState('factura')
  const [saving,setSaving]=useState(false)
  const [facturarA,setFacturarA]=useState(FACTURAR_OPC.find(e=>/somos magma/i.test(e))||FACTURAR_OPC[0])
  const PRECARGADOS=['admin@somosmagma.com','juan@somosmagma.com','sofi@somosmagma.com']
  const pend=ordenCrono(persona.trabajos.filter(t=>!t.pagado))
  const items=pend.map(renglonMailStaff).join('\n')
  const tot=pend.reduce((s,t)=>s+t.precio+(t.viaticos||0),0)
  const nombre=String(persona.nombre).split(' ')[0]
  const ent=entidades[facturarA]||{}
  const lineasFact=[`Facturá a: ${facturarA}`]
  if(ent.titular && ent.titular.toLowerCase()!==facturarA.toLowerCase()) lineasFact.push(ent.titular)
  if(ent.datos) lineasFact.push(ent.datos)
  const cuerpo = tipo==='efectivo'
    ? `Hola ${nombre}!\n\nTe paso el detalle de los trabajos de ${mesNombre}:\n\n${items}\n\nTotal: ${fmt(tot)}\n\nEste pago es en EFECTIVO — no hace falta factura.\n\n¡Gracias!`
    : `Hola ${nombre}!\n\nTe paso el detalle de los trabajos de ${mesNombre} para que nos hagas factura:\n\n${items}\n\nTotal: ${fmt(tot)}\n\n${lineasFact.join('\n')}\nCuando tengas la factura lista mandala a admin@somosmagma.com\n\n¡Gracias!`
  const addCc=(v)=>{ const x=String(v||'').trim(); if(x&&!cc.includes(x)) setCc(c=>[...c,x]); setCcInput('') }
  const asuntoMail=`Facturación ${mesNombre} — Somos Magma`
  // Envía DE VERDAD desde admin@somosmagma.com (server-side), sin abrir Outlook.
  async function enviar(){
    if(!para.trim()){ showToast('Falta el mail del freelancer','err'); return }
    setSaving(true)
    try{ const r=await fetch('/api/pago-staff-enviar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:para.trim(), cc, asunto:asuntoMail, cuerpo})})
      const j=await r.json(); if(j&&j.error){ showToast(j.error,'err'); setSaving(false); return }
      showToast('Mail enviado ✓ (desde admin@somosmagma.com)'); if(onSent) onSent(); onClose()
    }catch(e){ showToast('Error de conexión','err'); setSaving(false) } }
  // Fallback: abrir en el cliente de mail propio (por si hiciera falta).
  function abrir(){
    if(!para.trim()){ showToast('Falta el mail del freelancer','err'); return }
    const ccStr=cc.length?`&cc=${encodeURIComponent(cc.join(','))}`:''
    window.location.href=`mailto:${encodeURIComponent(para.trim())}?subject=${encodeURIComponent(asuntoMail)}${ccStr}&body=${encodeURIComponent(cuerpo)}`
    if(onSent) onSent(); onClose()
  }
  return <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(26,25,23,0.35)',zIndex:950,display:'flex',justifyContent:'center',overflowY:'auto',padding:'40px 20px'}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'100%',maxWidth:560,background:T.surface,borderRadius:16,border:`1px solid ${T.border}`,boxShadow:'0 16px 50px rgba(0,0,0,0.18)',height:'fit-content'}}>
      <div style={{padding:'18px 22px',borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div><div style={{fontSize:16,fontWeight:700,color:T.ink}}>Mail a {persona.nombre}</div><div style={{fontSize:12,color:T.ink3,marginTop:2}}>{pend.length} trabajos · {fmt(tot)}</div></div>
        <button onClick={onClose} style={{border:'none',background:'transparent',fontSize:20,color:T.ink3,cursor:'pointer',lineHeight:1}}>×</button>
      </div>
      <div style={{padding:'18px 22px'}}>
        <label style={lblV2}>Para</label>
        <input value={para} onChange={e=>setPara(e.target.value)} placeholder="mail del freelancer" style={{...inpV2,marginBottom:13}}/>
        <label style={lblV2}>CC (opcional)</label>
        <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:6}}>
          {cc.map((c,i)=><span key={i} style={{display:'inline-flex',alignItems:'center',gap:5,padding:'4px 9px',borderRadius:20,background:T.surfaceAlt,color:T.ink2,fontSize:12}}>{c}<button onClick={()=>setCc(cs=>cs.filter((_,j)=>j!==i))} style={{border:'none',background:'transparent',color:T.ink3,cursor:'pointer',fontSize:13,padding:0,lineHeight:1}}>×</button></span>)}
        </div>
        <input value={ccInput} onChange={e=>setCcInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addCc(ccInput)}}} placeholder="Agregar mail y Enter" style={{...inpV2,marginBottom:6}}/>
        <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:14}}>
          {PRECARGADOS.filter(m=>!cc.includes(m)).map(m=><button key={m} onClick={()=>addCc(m)} style={{padding:'3px 9px',borderRadius:20,border:`1px solid ${T.border}`,background:T.surface,color:T.ink2,fontSize:11.5,cursor:'pointer'}}>+ {m}</button>)}
        </div>
        <label style={lblV2}>Tipo de pago</label>
        <div style={{display:'flex',gap:8,marginBottom:tipo==='factura'?10:14}}>
          {[['factura','Por factura'],['efectivo','Efectivo (sin factura)']].map(([k,l])=>(
            <button key={k} onClick={()=>setTipo(k)} style={{flex:1,padding:'8px',borderRadius:9,fontSize:12.5,fontWeight:600,cursor:'pointer',border:`1px solid ${tipo===k?T.ink:T.border}`,background:tipo===k?T.ink:T.surface,color:tipo===k?'#fff':T.ink2}}>{l}</button>
          ))}
        </div>
        {tipo==='factura' && <div style={{marginBottom:14}}>
          <label style={lblV2}>Facturar a</label>
          <select value={facturarA} onChange={e=>setFacturarA(e.target.value)} style={inpV2}>{FACTURAR_OPC.map(o=><option key={o} value={o}>{o}</option>)}</select>
          {ent.datos && <div style={{fontSize:11, color:T.ink3, marginTop:5}}>{ent.datos}</div>}
        </div>}
        <label style={lblV2}>Vista previa</label>
        <textarea readOnly value={cuerpo} rows={8} style={{...inpV2,resize:'vertical',fontSize:12,fontFamily:MONO,color:T.ink2}}/>
      </div>
      <div style={{padding:'14px 22px',borderTop:`1px solid ${T.border}`,display:'flex',gap:10,alignItems:'center',justifyContent:'flex-end',flexWrap:'wrap'}}>
        <span style={{fontSize:11,color:T.ink3,marginRight:'auto'}}>Sale de <b>admin@somosmagma.com</b></span>
        <button onClick={()=>{navigator.clipboard?.writeText(cuerpo);showToast('Mensaje copiado')}} style={{padding:'9px 14px',borderRadius:9,border:`1px solid ${T.border}`,background:T.surface,color:T.ink2,fontSize:12.5,fontWeight:500,cursor:'pointer'}}>Copiar</button>
        <button onClick={abrir} style={{padding:'9px 14px',borderRadius:9,border:`1px solid ${T.border}`,background:T.surface,color:T.ink2,fontSize:12.5,fontWeight:500,cursor:'pointer'}}>Abrir en Outlook</button>
        <button onClick={enviar} disabled={saving} style={{padding:'9px 22px',borderRadius:9,border:'none',background:T.brand,color:'#fff',fontSize:13.5,fontWeight:700,cursor:saving?'default':'pointer',opacity:saving?0.6:1}}>{saving?'Enviando…':'✉ Enviar mail'}</button>
      </div>
    </div>
  </div>
}

// ============================ BUSCADOR GLOBAL (⌘K) ============================
function GlobalSearch({data, onClose, onNavegar}){
  const [q,setQ]=useState(''), [idx,setIdx]=useState(0)
  const inputRef=useRef(null)
  useEffect(()=>{ inputRef.current?.focus() },[])
  const [recientes,setRecientes]=useState(()=>{try{return JSON.parse(localStorage.getItem('magma_search_recent')||'[]')}catch(e){return []}})
  const guardarReciente=(r)=>{ const item={tipo:r.tipo,icon:r.icon,mod:r.mod,titulo:r.titulo,sub:r.sub,color:r.color,q:r.q}; const nueva=[item,...recientes.filter(x=>x.titulo!==r.titulo||x.tipo!==r.tipo)].slice(0,6); setRecientes(nueva); try{localStorage.setItem('magma_search_recent',JSON.stringify(nueva))}catch(e){} }
  const nq=normTxt(q.trim())

  const res=[]
  if(nq.length>=1){
    ;(data?.presupuestos||[]).forEach(p=>{ const num=String(p['Columna 1']||''),cli=String(p['Cliente']||''),ag=String(p['Agencia']||''),pr=String(p['Proyecto']||''); if(normTxt(num+' '+cli+' '+ag+' '+pr).includes(nq)) res.push({tipo:'Trabajo',icon:'📋',mod:'presupuestos',titulo:'#'+num+' · '+(cli||ag||'—'),sub:pr,meta:p['Estado']||'',color:T.brand,q:num}) })
    // Un trabajo aprobado está en PRESUPUESTOS y en PROYECTOS: antes salía dos veces (📋 y 🎬)
    // para el mismo número. De PROYECTOS solo se listan los que no tienen presupuesto.
    const conPresu=new Set((data?.presupuestos||[]).map(p=>String(p['Columna 1']||'').trim()))
    ;(data?.proyectos||[]).forEach(p=>{ const num=String(p['N° presupuesto']||''),cli=String(p['Cliente']||''),ag=String(p['Agencia']||''),pr=String(p['Proyecto']||''); if(!conPresu.has(num.trim()) && normTxt(num+' '+cli+' '+ag+' '+pr).includes(nq)) res.push({tipo:'Proyecto',icon:'🎬',mod:'proyectos',titulo:'#'+num+' · '+(cli||ag||'—'),sub:pr,meta:p['Fecha Evento']||'',color:T.pos,q:num}) })
    ;(data?.facturacion||[]).forEach(f=>{ const num=String(f['N° Presupuesto']||''),cli=String(f['Cliente']||''),ag=String(f['Agencia']||''),pr=String(f['Proyecto']||''); if(normTxt(num+' '+cli+' '+ag+' '+pr).includes(nq)) res.push({tipo:'Factura',icon:'💵',mod:'facturacion',titulo:'#'+num+' · '+(cli||ag||'—'),sub:pr,meta:isCobrada(f)?'Cobrada':'Pendiente',color:T.warn,q:num}) })
    ;(data?.rrhh||[]).forEach(r=>{ const nombre=String(r['Nombre Apellido']||r['Nombre']||''),rubro=String(r['Rubro']||''),mail=String(r['Mail']||''); if(nombre.trim()&&normTxt(nombre+' '+rubro+' '+mail).includes(nq)) res.push({tipo:'Freelancer',icon:'👤',mod:'pagos',titulo:nombre,sub:rubro,meta:'',color:T.ink2,q:nombre}) })
    ;(data?.agencias||[]).forEach(a=>{ const nombre=String(a['Nombre']||''); if(nombre.trim()&&normTxt(nombre).includes(nq)) res.push({tipo:'Agencia',icon:'🏢',mod:'agencias',titulo:nombre,sub:a['Condicion IVA']||'',meta:'',color:T.ink2,q:nombre}) })
    ;(data?.clientes||[]).forEach(c=>{ const nombre=String(c['Nombre']||''); if(nombre.trim()&&normTxt(nombre).includes(nq)) res.push({tipo:'Cliente',icon:'🎯',mod:'clientes',titulo:nombre,sub:c['Industria']||'',meta:'',color:T.ink2,q:nombre}) })
    ;(data?.contactos||[]).forEach(c=>{ const nombre=String(c['Nombre']||''),agencia=String(c['Agencia']||''),tel=String(c['Teléfono']||''),mail=String(c['Mail']||''); if(nombre.trim()&&normTxt(nombre+' '+agencia+' '+tel+' '+mail).includes(nq)) res.push({tipo:'Contacto',icon:'☎',mod:'contactos',titulo:nombre,sub:agencia,meta:c['Cargo']||'',color:T.ink2,q:nombre}) })
  }
  const visibles=res.slice(0,30)
  useEffect(()=>{ setIdx(0) },[q])
  const elegir=(r)=>{ guardarReciente(r); onNavegar(r.mod, r.q) }
  const onKey=(e)=>{ if(e.key==='ArrowDown'){e.preventDefault();setIdx(i=>Math.min(visibles.length-1,i+1))} if(e.key==='ArrowUp'){e.preventDefault();setIdx(i=>Math.max(0,i-1))} if(e.key==='Enter'&&visibles[idx]){e.preventDefault();elegir(visibles[idx])} }

  const Row=({r,activo})=> <div onClick={()=>elegir(r)} onMouseEnter={()=>{}} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 18px',cursor:'pointer',background:activo?T.surfaceAlt:'transparent',borderLeft:`2px solid ${activo?T.brand:'transparent'}`}}>
    <span style={{fontSize:15,width:20,textAlign:'center'}}>{r.icon}</span>
    <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,color:T.ink,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.titulo}</div>{r.sub&&<div style={{fontSize:11.5,color:T.ink3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.sub}</div>}</div>
    <span style={{fontSize:10.5,color:T.ink3,textTransform:'uppercase',letterSpacing:0.3}}>{r.tipo}</span>
    {r.meta&&<span style={{fontSize:11,color:T.ink2}}>{r.meta}</span>}
  </div>

  return <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(26,25,23,0.35)',zIndex:1000,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:90}}>
    <div onClick={e=>e.stopPropagation()} style={{width:'90%',maxWidth:600,background:T.surface,borderRadius:14,border:`1px solid ${T.border}`,overflow:'hidden',boxShadow:'0 20px 60px rgba(0,0,0,0.2)'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'14px 18px',borderBottom:`1px solid ${T.border}`}}>
        <span style={{fontSize:15}}>🔍</span>
        <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} onKeyDown={onKey} placeholder="Buscar presupuesto, proyecto, factura, freelancer, cliente…" style={{flex:1,border:'none',outline:'none',background:'transparent',fontSize:15,color:T.ink}}/>
        <span style={{fontSize:10.5,fontFamily:MONO,padding:'2px 6px',borderRadius:4,background:T.surfaceAlt,color:T.ink3}}>esc</span>
      </div>
      <div style={{maxHeight:'56vh',overflowY:'auto'}}>
        {nq.length===0
          ? (recientes.length>0 ? <>
              <div style={{fontSize:10.5,fontWeight:600,letterSpacing:0.4,textTransform:'uppercase',color:T.ink3,padding:'10px 18px 4px'}}>Recientes</div>
              {recientes.map((r,i)=><Row key={i} r={r} activo={false}/>)}
            </> : <div style={{padding:'28px 18px',textAlign:'center',fontSize:13,color:T.ink3}}>Escribí para buscar en toda la app</div>)
          : visibles.length===0
            ? <div style={{padding:'28px 18px',textAlign:'center',fontSize:13,color:T.ink3}}>Sin resultados para “{q}”</div>
            : visibles.map((r,i)=><Row key={r.mod+i} r={r} activo={i===idx}/>)}
      </div>
      {visibles.length>0 && <div style={{padding:'8px 18px',borderTop:`1px solid ${T.border}`,fontSize:11,color:T.ink3,display:'flex',gap:14}}><span>↑↓ moverse</span><span>↵ abrir</span><span>{res.length} resultado{res.length!==1?'s':''}</span></div>}
    </div>
  </div>
}

// ============================ PIEZAS UI ============================
function Hero({label, value, sub, subStrong, subStrongColor, accent, desglose}){
  return <div style={{flex:1, padding:'22px 24px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:14}}>
    <div style={{fontSize:11, fontWeight:600, letterSpacing:0.5, textTransform:'uppercase', color:T.ink3}}>{label}</div>
    <div style={{fontSize:33, fontWeight:600, fontFamily:MONO, color:accent||T.ink, marginTop:12, letterSpacing:-0.5}}>{value}</div>
    <div style={{fontSize:12.5, color:T.ink2, marginTop:9}}>{sub}{subStrong && <span style={{color:subStrongColor||T.ink, fontWeight:600}}>{subStrong}</span>}</div>
    {desglose && <div style={{marginTop:12, paddingTop:11, borderTop:`1px solid ${T.border}`, display:'grid', gap:5}}>
      {desglose.map((d,i)=>(
        <div key={i} onClick={d.onClick} style={{display:'flex', justifyContent:'space-between', gap:10, fontSize:12, cursor:d.onClick?'pointer':'default'}}>
          <span style={{color:T.ink3, textDecoration:d.onClick?'underline':'none', textUnderlineOffset:3}}>{d.l}</span>
          <span style={{fontFamily:MONO, color:d.c||T.ink, fontWeight:600}}>{d.v}</span>
        </div>
      ))}
    </div>}
  </div>
}
function Stat({label, value, color, sub}){
  return <div style={{flex:'1 1 130px', minWidth:120, padding:'14px 16px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:11}}>
    <div style={{fontSize:10.5, fontWeight:600, letterSpacing:0.3, textTransform:'uppercase', color:T.ink3}}>{label}</div>
    <div style={{fontSize:19, fontWeight:600, fontFamily:MONO, color:color||T.ink, marginTop:7}}>{value}</div>
    {sub&&<div style={{fontSize:10.5, color:T.ink3, marginTop:4, lineHeight:1.3}}>{sub}</div>}
  </div>
}
function SectionTitle({children}){ return <div style={{fontSize:12.5, fontWeight:600, color:T.ink2, letterSpacing:0.3, textTransform:'uppercase', margin:'30px 0 13px'}}>{children}</div> }
function CardHead({children}){ return <div style={{padding:'13px 18px', fontSize:12.5, fontWeight:600, color:T.ink}}>{children}</div> }
function ResumenLine({label, value, color}){ return <div style={{display:'flex', justifyContent:'space-between', padding:'6px 0'}}><span style={{fontSize:12.5, color:T.ink2}}>{label}</span><span style={{fontSize:12.5, fontFamily:MONO, color:color||T.ink}}>{value}</span></div> }
function Empty({children}){ return <div style={{padding:'22px 18px', fontSize:12.5, color:T.ink3, textAlign:'center'}}>{children}</div> }
function PageHead({title, sub}){ return <div style={{marginBottom:22}}><h1 style={{fontSize:23, fontWeight:700, color:T.ink, margin:0, letterSpacing:-0.3}}>{title}</h1><div style={{fontSize:13, color:T.ink3, marginTop:3}}>{sub}</div></div> }
function Placeholder({label}){ return <div style={{padding:'80px 20px', textAlign:'center'}}><div style={{fontSize:18, fontWeight:600, color:T.ink, marginBottom:8}}>{label}</div><div style={{fontSize:13.5, color:T.ink2, maxWidth:420, margin:'0 auto', lineHeight:1.5}}>Esta vista todavía vive en la app actual. Si te gusta la dirección de Dashboard y Presupuestos, la aplicamos acá también.</div></div> }
function Center({children}){ return <div style={{display:'flex', alignItems:'center', justifyContent:'center', height:'70vh', color:T.ink2, fontSize:14}}>{children}</div> }

function Shell({children}){
  return <>
    <Head>
      <title>Somos Magma</title>
      <link rel="preconnect" href="https://fonts.googleapis.com"/>
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
      <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@300;400;500;600;700&family=Azeret+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
    </Head>
    <style jsx global>{`
      * { box-sizing: border-box; }
      html, body { margin:0; padding:0; background:${T.bg}; font-family:'Archivo', -apple-system, system-ui, sans-serif; color:${T.ink}; -webkit-font-smoothing:antialiased; }
      ::-webkit-scrollbar { width:8px; height:8px; }
      ::-webkit-scrollbar-thumb { background:#D8D4CD; border-radius:8px; }
      ::-webkit-scrollbar-track { background:transparent; }
      select, input, button { font-family:inherit; }
    `}</style>
    {children}
  </>
}

const selectStyle = { padding:'9px 11px', borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:12.5, cursor:'pointer', outline:'none' }
const inpV2 = { width:'100%', padding:'9px 12px', borderRadius:9, border:`1px solid ${T.border}`, background:T.bg, color:T.ink, fontSize:13.5, outline:'none' }
const lblV2 = { fontSize:11, fontWeight:600, color:T.ink2, textTransform:'uppercase', letterSpacing:0.3, display:'block', marginBottom:5 }
// Campo con label. A nivel módulo a propósito (ver nota de MontoInput).
const Fld=({label,children})=><div style={{flex:'1 1 140px'}}><label style={lblV2}>{label}</label>{children}</div>
// Input de plata: formatea mientras escribís (100.000,55) y mantiene el cursor donde estaba.
// OJO: tiene que vivir a nivel módulo. Si se define adentro de otro componente, React lo
// desmonta en cada render y el input pierde el foco a cada tecla.
function MontoInput({ value, onChange, style, ...rest }){
  const ref=useRef(null), caret=useRef(null)
  useEffect(()=>{ if(caret.current!=null && ref.current){ ref.current.setSelectionRange(caret.current, caret.current); caret.current=null } })
  const handle=e=>{ const el=e.target, raw=el.value, pos=el.selectionStart??raw.length
    const signif=raw.slice(0,pos).replace(/[^\d,]/g,'').length   // dígitos/coma a la izquierda del cursor
    const out=fmtMontoAR(raw)
    let n=0,i=0; while(i<out.length && n<signif){ if(/[\d,]/.test(out[i])) n++; i++ }
    caret.current=i; onChange(out) }
  return <input ref={ref} value={value??''} onChange={handle} inputMode="decimal" style={style} {...rest}/>
}
const navBtn = { width:34, height:34, borderRadius:9, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:14, cursor:'pointer' }
const miniBtn = { padding:'6px 11px', borderRadius:7, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:12, fontWeight:500, cursor:'pointer', textDecoration:'none', display:'inline-block' }
const btnPrimary = { padding:'11px 22px', borderRadius:10, border:'none', background:T.brand, color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer' }
