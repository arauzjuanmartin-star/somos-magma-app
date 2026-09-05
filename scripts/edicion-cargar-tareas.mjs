// Carga tareas de edición a mano en el tablero (las que no salen de una línea
// del presupuesto: cambios, exports, "4 videos", piezas de un acuerdo grande).
//
// Los IDs manuales llevan M — <nro>-M1, <nro>-M2 — así el sync nunca las pisa
// ni las duplica. Editá la lista TAREAS de abajo y corré:
//
//   node scripts/edicion-cargar-tareas.mjs              → preview
//   node scripts/edicion-cargar-tareas.mjs --escribir

import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { HEADERS_EDICION, aAR, parseFechaAR } from '../lib/edicion.js'

// ---- LO QUE HAY ENTRE MANOS (Juan, 5/9/2026) ----
// cant > 1 numera el título solo: "Raid · video 1", "Raid · video 2"…
const TAREAS = [
  { num:'2132', titulo:'Cambiar la placa del video largo', editor:'Daniela Viviana Ayala', prio:'Urgente', entrega:'05/09/2026', nota:'Es solo un export.' },
  { num:'2182', titulo:'Video para Meikin + Agencia',      editor:'Daniela Viviana Ayala', prio:'Urgente', entrega:'05/09/2026', nota:'Con menos invitados y mostrando más el espacio. Tomas más lentas en algunos momentos.' },
  { num:'2179', titulo:'Cambios del casamiento',           editor:'Daniela Viviana Ayala', prio:'Urgente', entrega:'05/09/2026' },
  { num:'2133', titulo:'NH · video con clips seleccionados', editor:'Daniela Viviana Ayala', prio:'Normal', entrega:'11/09/2026', nota:'De cuando Sofi fue a Córdoba con ADN. El proyecto figura como CASE.' },

  { num:'2256', titulo:'OFF! · Postales de Primavera — cambios', editor:'Lucía María Grenier Basavilbaso', prio:'Urgente', entrega:'05/09/2026', clase:'Inserto en video de un tercero' },
  { num:'2256', titulo:'OFF! · Backstage — cambios',            editor:'Lucía María Grenier Basavilbaso', prio:'Urgente', entrega:'05/09/2026', clase:'Inserto en video de un tercero' },
  { num:'2256', titulo:'Raid · video', cant:3, prio:'Normal', entrega:'08/09/2026', clase:'Activación de marca', nota:'Final el lunes.' },
  { num:'2256', titulo:'Glade · video', cant:2, prio:'Normal', entrega:'11/09/2026', clase:'Activación de marca' },

  { num:'2253', titulo:'Pani · video', cant:4, prio:'Normal', entrega:'11/09/2026' },
  { num:'2231', titulo:'Sol Calbero', prio:'Urgente', entrega:'08/09/2026', nota:'Hoy o lunes.' },
]

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{
  const i=l.indexOf('='); let v=l.slice(i+1).trim()
  if (v.startsWith('"')&&v.endsWith('"')) v=v.slice(1,-1)
  return [l.slice(0,i).trim(), v]
}))
const auth = new google.auth.GoogleAuth({
  credentials:{ client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') },
  scopes:['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version:'v4', auth })
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')
const colLetra = c => { let s='', n=c+1; while(n>0){ n--; s=String.fromCharCode(65+(n%26))+s; n=Math.floor(n/26) } return s }
const ULT = colLetra(HEADERS_EDICION.length - 1)

const b = await sheets.spreadsheets.values.batchGet({ spreadsheetId: SHEET_ID, ranges:[`EDICION!A:${ULT}`,'PROYECTOS!A:ET'] })
const [ed, proy] = b.data.valueRanges.map(v=>v.values||[])
const hE = ed[0], hP = proy[0]
const cE = n => hE.indexOf(n)
const cP = n => hP.findIndex(x => String(x).trim() === n)
const iNumP = cP('N° presupuesto')

// Próximo sufijo M libre por número
const maxM = {}
ed.slice(1).forEach(r => {
  const m = String(r[cE('ID')]||'').trim().match(/^(.+)-M(\d+)$/)
  if (m) maxM[m[1]] = Math.max(maxM[m[1]]||0, parseInt(m[2]))
})

// Lo que ya está cargado, para no duplicar si el script se corre dos veces.
const yaEstan = new Set(ed.slice(1).map(r => `${String(r[cE('N° presupuesto')]||'').trim()}|${String(r[cE('Entregable')]||'').trim().toLowerCase()}`))

const nuevas = [], detalle = [], sinProyecto = [], repetidas = []
for (const t of TAREAS) {
  const p = proy.slice(1).find(r => String(r[iNumP]||'').trim() === t.num)
  if (!p) { sinProyecto.push(t); continue }
  const base = {
    'Fecha Evento': String(p[cP('Fecha Evento')]||''),
    'Agencia': String(p[cP('Agencia')]||''),
    'Cliente': String(p[cP('Cliente')]||''),
    'Proyecto': String(p[cP('Proyecto')]||''),
    'Link crudo': cP('Drive Crudo') > -1 ? String(p[cP('Drive Crudo')]||'') : '',
  }
  const n = Math.max(1, t.cant || 1)
  for (let i = 1; i <= n; i++) {
    maxM[t.num] = (maxM[t.num] || 0) + 1
    const id = `${t.num}-M${maxM[t.num]}`
    const nombre = n > 1 ? `${t.titulo} ${i}` : t.titulo
    if (yaEstan.has(`${t.num}|${nombre.toLowerCase()}`)) { repetidas.push(`#${t.num} ${nombre}`); maxM[t.num]--; continue }
    const fila = new Array(HEADERS_EDICION.length).fill('')
    const set = (k,v) => { const c = cE(k); if (c > -1) fila[c] = v ?? '' }
    set('ID', id)
    set('N° presupuesto', t.num)
    Object.entries(base).forEach(([k,v]) => set(k,v))
    set('Entregable', nombre)
    set('Editor', t.editor || '')
    set('Estado', 'Material listo')     // si se carga a mano, el trabajo ya existe
    set('Prioridad', t.prio || 'Normal')
    set('Fecha compromiso', aAR(parseFechaAR(t.entrega)))
    if (t.clase) set('Clase', t.clase)
    if (t.nota) set('Notas', `[05/09 juan] ${t.nota}`)
    set('Actualizado', new Date().toISOString())
    set('Por', 'juan@somosmagma.com')
    set('Origen', 'manual')
    nuevas.push(fila)
    detalle.push(`  ${id.padEnd(9)} ${String(base.Cliente||base.Agencia).slice(0,18).padEnd(18)} ${nombre.slice(0,42).padEnd(42)} ${(t.editor||'sin asignar').split(' ')[0].padEnd(10)} ${t.entrega}`)
  }
}

console.log('════ TAREAS A CARGAR EN EL TABLERO ════\n')
detalle.forEach(d=>console.log(d))
console.log(`\n  ${nuevas.length} tareas nuevas`)
if (repetidas.length) console.log(`  ${repetidas.length} ya estaban cargadas, se saltean:\n     ` + repetidas.join('\n     '))
if (sinProyecto.length) {
  console.log('\n⚠  no encontré estos proyectos en PROYECTOS:')
  sinProyecto.forEach(t=>console.log(`     #${t.num} · ${t.titulo}`))
}

if (!nuevas.length) { console.log('\n✓ Nada nuevo para cargar.'); process.exit(0) }
if (!ESCRIBIR) { console.log('\n👀 PREVIEW — nada se escribió. Corré con --escribir.'); process.exit(0) }

await sheets.spreadsheets.values.append({
  spreadsheetId: SHEET_ID, range:`EDICION!A:${ULT}`,
  valueInputOption:'USER_ENTERED', insertDataOption:'INSERT_ROWS',
  requestBody:{ values: nuevas },
})
console.log(`\n✅ ${nuevas.length} tareas cargadas.`)
