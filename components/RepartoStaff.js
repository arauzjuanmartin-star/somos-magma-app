// ============================ REPARTO DEL MES ============================
// Quién va cuántas veces este mes. Nació de una pregunta de Juan: tenía el
// contador de Lucho y Juani (los que tienen acuerdo con mínimo) y quería el de
// todos, "de ese modo repartimos un poco más parejo".
//
// Lo que hace accionable al gráfico no es la barra más larga sino las dos listas
// de abajo: los del roster que este mes no fueron ni una vez, y hace cuánto que
// no se los llama. Un ranking solo dice quién trabajó; esto dice a quién llamar.
//
// La cuenta vive en lib/jornadas.js — la misma que muestra el formulario de staff
// al lado del nombre, para que los dos números coincidan siempre.

import React, { useMemo, useState } from 'react'
import { T, MONO } from '../lib/ui'
import { repartoDelMes, ultimaConvocatoria } from '../lib/jornadas'
import { canonStaff, canonKey } from '../lib/staff'

const MESES_LARGO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const fmtM = n => { const a=Math.abs(n||0); if(!a) return '—'; return (n<0?'-':'')+(a>=1000000?'$'+(a/1000000).toFixed(1).replace('.',',')+'M':'$'+Math.round(a/1000)+'K') }
const primerNombre = n => String(n||'').split(' ')[0]

// Meses enteros entre dos fechas, para "hace 3 meses que no lo llamás".
const mesesEntre = (a, b) => (b.getFullYear()-a.getFullYear())*12 + (b.getMonth()-a.getMonth())

export default function RepartoStaff({ proyectos = [], rrhh = [], mes, anio, onPersona, titulo = 'Reparto del mes' }){
  const hoy = new Date()
  // Si el módulo ya tiene selector de mes o de año (Pagos Staff, Freelancers), manda el de afuera.
  // Antes solo contaba el mes: filtrando solo el año, el gráfico se quedaba en el año de hoy.
  const [m, setM] = useState(mes || hoy.getMonth()+1)
  const [a, setA] = useState(anio || hoy.getFullYear())
  const [soloRodaje, setSoloRodaje] = useState(true)
  const [verTodo, setVerTodo] = useState(false)
  const mesAct = mes || m, anioAct = anio || a

  const lista = useMemo(() => repartoDelMes(proyectos, mesAct, anioAct, { soloRodaje }), [proyectos, mesAct, anioAct, soloRodaje])
  const ultima = useMemo(() => ultimaConvocatoria(proyectos, { soloRodaje }), [proyectos, soloRodaje])

  const total = lista.reduce((s,p)=>s+p.jornadas, 0)
  const max = lista.length ? lista[0].jornadas : 0
  const prom = lista.length ? total/lista.length : 0
  const visibles = verTodo ? lista : lista.slice(0, 10)

  // Los que están activos en el roster y este mes no fueron ninguna vez.
  // Sin esto el gráfico solo confirma lo que ya sabés; con esto te da los nombres.
  const enElMes = new Set(lista.map(p=>p.key))
  const dormidos = useMemo(() => (rrhh||[])
    .filter(r => /activo/i.test(String(r['Estado']||'')))
    .map(r => { const nombre = canonStaff(String(r['Nombre Apellido']||r['Nombre']||'').trim()); return { nombre, key: canonKey(nombre) } })
    .filter(r => r.nombre && !enElMes.has(r.key))
    .map(r => { const u = ultima[r.key]; return { ...r, meses: u ? mesesEntre(u.fecha, hoy) : null } })
    .filter(r => r.meses !== null && r.meses >= 1)
    .sort((x,y) => x.meses - y.meses)
    .slice(0, 8)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  , [rrhh, ultima, lista])

  const sel = { padding:'5px 9px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, color:T.ink2, fontSize:12.5, cursor:'pointer', outline:'none' }
  const tab = on => ({ padding:'4px 10px', borderRadius:7, border:'none', background: on?T.ink:'transparent', color: on?'#fff':T.ink2, fontSize:12.5, fontWeight:600, cursor:'pointer' })

  return <div style={{background:T.surface, borderRadius:14, boxShadow:'0 2px 10px rgba(0,0,0,0.05)', overflow:'hidden', marginBottom:14}}>
    <div style={{display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', padding:'12px 18px', borderBottom:`1px solid ${T.border}`}}>
      <span style={{fontSize:13.5, fontWeight:700, color:T.ink}}>{titulo}</span>
      <span style={{fontSize:12.5, color:T.ink2}}>{total} {soloRodaje ? `convocatoria${total===1?'':'s'}` : `trabajo${total===1?'':'s'}`} · {lista.length} persona{lista.length===1?'':'s'}{lista.length?` · ${prom.toFixed(1).replace('.',',')} promedio`:''}</span>
      <div style={{flex:1}}/>
      <div style={{display:'flex', gap:2, background:T.surfaceAlt, borderRadius:8, padding:2}}>
        <button aria-pressed={soloRodaje} onClick={()=>setSoloRodaje(true)} style={tab(soloRodaje)}>Rodaje</button>
        <button aria-pressed={!soloRodaje} onClick={()=>setSoloRodaje(false)} style={tab(!soloRodaje)}>Todo</button>
      </div>
      {!mes && <select value={m} onChange={e=>setM(+e.target.value)} aria-label="Mes" style={sel}>{MESES_LARGO.map((x,i)=><option key={i} value={i+1}>{x}</option>)}</select>}
      {!anio && <select value={a} onChange={e=>setA(+e.target.value)} aria-label="Año" style={sel}>{[hoy.getFullYear()+1, hoy.getFullYear(), hoy.getFullYear()-1, hoy.getFullYear()-2].map(y=><option key={y} value={y}>{y}</option>)}</select>}
    </div>

    {!lista.length && <div style={{padding:'22px 18px', fontSize:12.5, color:T.ink3, textAlign:'center'}}>Nadie convocado en {MESES_LARGO[mesAct-1]} {anioAct}</div>}

    {!!lista.length && <div style={{padding:'10px 18px 4px'}}>
      {visibles.map(p => {
        // Ámbar = está concentrando el mes (25% o más). Es el que hay que empezar a repartir.
        // No es rojo: rojo en la app es solo lo vencido o roto.
        const share = total ? p.jornadas/total : 0
        const color = share >= 0.25 ? T.warn : T.ink3
        return <div key={p.key} onClick={()=>onPersona&&onPersona(p.nombre)} role={onPersona?'button':undefined} tabIndex={onPersona?0:undefined} onKeyDown={onPersona?e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); onPersona(p.nombre) } }:undefined}
          style={{display:'grid', gridTemplateColumns:'150px 1fr 34px 64px', gap:10, alignItems:'center', padding:'4px 0', cursor:onPersona?'pointer':'default'}}>
          <span title={p.nombre} style={{fontSize:13, color:T.ink, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{p.nombre}</span>
          <div style={{height:9, background:T.surfaceAlt, borderRadius:5, overflow:'hidden'}}>
            <div style={{width:`${max?Math.max(4, p.jornadas/max*100):0}%`, height:'100%', background:color, borderRadius:5}}/>
          </div>
          <span style={{fontSize:12.5, fontFamily:MONO, color:T.ink, textAlign:'right'}}>{p.jornadas}</span>
          <span style={{fontSize:12.5, fontFamily:MONO, color:T.ink2, textAlign:'right'}}>{fmtM(p.monto)}</span>
        </div>
      })}
      {lista.length > 10 && <button onClick={()=>setVerTodo(v=>!v)} style={{width:'100%', margin:'6px 0 2px', padding:'6px', borderRadius:8, border:`1px solid ${T.border}`, background:T.surfaceAlt, color:T.ink2, fontSize:12.5, cursor:'pointer'}}>
        {verTodo ? 'Ver menos' : `Ver los otros ${lista.length-10}`}
      </button>}
    </div>}

    {!!dormidos.length && <div style={{padding:'10px 18px 13px', borderTop:`1px solid ${T.border}`, marginTop:6}}>
      <div style={{fontSize:12.5, fontWeight:600, color:T.ink2, marginBottom:6}}>Activos que este mes no fueron</div>
      <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
        {dormidos.map(d => <span key={d.key} onClick={()=>onPersona&&onPersona(d.nombre)} title={d.nombre} role={onPersona?'button':undefined} tabIndex={onPersona?0:undefined} onKeyDown={onPersona?e=>{ if(e.key==='Enter'){ e.preventDefault(); onPersona(d.nombre) } }:undefined}
          style={{padding:'3px 9px', borderRadius:20, background:d.meses>=3?T.warnSoft:T.surfaceAlt, color:d.meses>=3?T.warn:T.ink2, fontSize:12.5, fontWeight:500, cursor:onPersona?'pointer':'default'}}>
          {primerNombre(d.nombre)} <span style={{color:T.ink3, fontWeight:400}}>· {d.meses === 1 ? 'hace 1 mes' : `hace ${d.meses} meses`}</span>
        </span>)}
      </div>
    </div>}
  </div>
}
