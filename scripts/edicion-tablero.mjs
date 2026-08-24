// Muestra el tablero de Edición como lo ve la app, desde la consola.
// Sirve para chequear el semáforo contra datos reales sin abrir el navegador.
//   node scripts/edicion-tablero.mjs

import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { semaforo, limpiarPedido, estaCerrado } from '../lib/edicion.js'

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
const r = await sheets.spreadsheets.values.get({ spreadsheetId:'1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc', range:'EDICION!A:R' })
const rows = r.data.values || [], h = rows[0]
const filas = rows.slice(1).filter(x=>x.some(Boolean)).map(x=>Object.fromEntries(h.map((k,i)=>[k,x[i]||''])))
filas.forEach(f => f.__sem = semaforo(f))

const ICON = { rojo:'🔴', naranja:'🟠', amarillo:'🟡', verde:'🟢', listo:'⚪' }
const cuenta = {}
filas.forEach(f => cuenta[f.__sem.nivel] = (cuenta[f.__sem.nivel]||0)+1)

console.log(`\n════ TABLERO DE EDICIÓN · ${filas.length} entregables ════`)
console.log(Object.entries(ICON).map(([k,i])=>`${i} ${k} ${cuenta[k]||0}`).join('   '))
console.log()
filas.filter(f=>!estaCerrado(f.Estado)).sort((a,b)=>a.__sem.orden-b.__sem.orden).forEach(f=>{
  console.log(`${ICON[f.__sem.nivel]} #${String(f['N° presupuesto']).padEnd(5)} ${String(f.Cliente||f.Agencia).slice(0,18).padEnd(18)} ${limpiarPedido(f.Entregable).slice(0,14).padEnd(14)} ${String(f.Editor||'—').slice(0,22).padEnd(22)} ${String(f.Estado).padEnd(15)} ${f.__sem.txt}`)
})
const sinPersona = filas.filter(f=>!String(f.Editor||'').trim() && !estaCerrado(f.Estado))
if (sinPersona.length) console.log(`\n⚠ ${sinPersona.length} entregables sin nadie asignado: ${sinPersona.map(f=>'#'+f['N° presupuesto']).join(' ')}`)
