// Qué va a ver cada uno cuando entre el lunes. Lee el sheet real y aplica la
// misma lógica que el front, para poder mirar el tablero sin abrir el navegador.
//
//   node scripts/edicion-simular-lunes.mjs            → todos
//   node scripts/edicion-simular-lunes.mjs dani       → lo de una persona

import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { semaforo, hoyCero, limpiarPedido, estaCerrado, esperaAlPM, briefLleno, briefTotal, piezaLlena, piezaTotal } from '../lib/edicion.js'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
  const i=l.indexOf('='); let v=l.slice(i+1).trim()
  if (v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1); return [l.slice(0,i).trim(), v]
}))
const auth = new google.auth.GoogleAuth({ credentials:{ client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') }, scopes:['https://www.googleapis.com/auth/spreadsheets.readonly'] })
const sheets = google.sheets({ version:'v4', auth })
const QUIEN = (process.argv[2]||'').toLowerCase()

const r = await sheets.spreadsheets.values.get({ spreadsheetId:'1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc', range:'EDICION!A:AL' })
const v = r.data.values||[], h = v[0]
const filas = v.slice(1).map(f=>Object.fromEntries(h.map((k,i)=>[k, f[i]??'']))).filter(f=>String(f.ID||'').trim())
const hoy = hoyCero()
const abiertas = filas.filter(f=>!estaCerrado(f.Estado)).map(f=>({...f, __s:semaforo(f,hoy)}))

console.log(`════ EL TABLERO EL LUNES ════`)
console.log(`${filas.length} entregables · ${abiertas.length} abiertos · ${filas.length-abiertas.length} cerrados\n`)

const porPersona = {}
abiertas.forEach(f=>{ const e=String(f.Editor||'sin asignar').trim(); (porPersona[e] ||= []).push(f) })

const orden = Object.entries(porPersona).sort((a,b)=>b[1].length-a[1].length)
for (const [persona, suyas] of orden) {
  if (QUIEN && !persona.toLowerCase().includes(QUIEN)) continue
  const rojos = suyas.filter(f=>f.__s.nivel==='rojo').length
  const ok = suyas.filter(f=>esperaAlPM(f.Estado)).length
  console.log(`\n▸ ${persona}  —  ${suyas.length} abiertos${rojos?` · ${rojos} atrasados`:''}${ok?` · ${ok} esperan OK`:''}`)
  suyas.sort((a,b)=>a.__s.orden-b.__s.orden).slice(0, QUIEN?40:6).forEach(f=>{
    const ic = {rojo:'🔴',naranja:'🟠',amarillo:'🟡',verde:'🟢',listo:'⚪'}[f.__s.nivel]
    const brief = `${briefLleno(f)}/${briefTotal(f)}`
    const pieza = `${piezaLlena(f)}/${piezaTotal(f)}`
    console.log(`   ${ic} #${String(f['N° presupuesto']).padEnd(5)} ${String(f.Cliente||f.Agencia).slice(0,16).padEnd(16)} ${limpiarPedido(f.Entregable).slice(0,34).padEnd(34)} ${String(f.Estado).padEnd(19)} ${f.__s.txt.padEnd(22)} pieza:${pieza} brief:${brief}`)
  })
  if (!QUIEN && suyas.length>6) console.log(`   … y ${suyas.length-6} más`)
}

console.log('\n\n════ LO QUE FALTA CARGAR ════')
const sinPieza = abiertas.filter(f=>piezaLlena(f)===0).length
const sinBrief = abiertas.filter(f=>briefLleno(f)===0).length
const sinEditor = abiertas.filter(f=>!String(f.Editor||'').trim()).length
const sinPlazo = abiertas.filter(f=>!String(f['Fecha compromiso']||'').trim()).length
console.log(`  sin ningún dato de la pieza:  ${sinPieza} de ${abiertas.length}`)
console.log(`  sin nada del brief:           ${sinBrief} de ${abiertas.length}`)
console.log(`  sin editor asignado:          ${sinEditor} de ${abiertas.length}`)
console.log(`  sin fecha de entrega:         ${sinPlazo} de ${abiertas.length}`)
