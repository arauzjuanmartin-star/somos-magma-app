/**
 * Lectura sobre la carpeta Finales para el staff de cada trabajo ya entregado (lib/finales.js).
 *
 * De acá en adelante lo hace la app sola al pasar una pieza a Terminado. Esto es para lo que ya se entregó antes:
 * los trabajos de los últimos N días (90 por default, lo que muestra "Cómo quedó" en Mi Magma) que tienen alguna
 * pieza cerrada y carpeta Finales. Lectura, no edición. No manda mails de Drive.
 *
 * Uso:  node scripts/finales-dar-acceso.mjs              (preview)
 *       node scripts/finales-dar-acceso.mjs --escribir
 *       node scripts/finales-dar-acceso.mjs --dias 180
 */
import { readFileSync } from 'fs'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const i = l.indexOf('='); if (i < 0) continue; let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); process.env[l.slice(0, i).trim()] = v }
process.removeAllListeners('warning')
const { getAllData } = await import('../lib/sheets.js')
const { darFinalesAlStaff, mailsDelStaff, idDeLink } = await import('../lib/finales.js')
const { estaCerrado } = await import('../lib/edicion.js')

const ESCRIBIR = process.argv.includes('--escribir')
const i = process.argv.indexOf('--dias'), DIAS = i > 0 ? parseInt(process.argv[i + 1]) || 90 : 90
const txt = v => String(v ?? '').trim()
const fechaAR = s => { const m = txt(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (!m) return null; let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1]) }
const hoy = new Date(), hoy0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()), desde = new Date(hoy0.getTime() - DIAS * 864e5)

const data = await getAllData()
const cerradasPorNum = {}
for (const f of (data.edicion || [])) { if (txt(f.ID) && estaCerrado(f.Estado)) (cerradasPorNum[txt(f['N° presupuesto'])] = cerradasPorNum[txt(f['N° presupuesto'])] || []).push(f) }

const lista = (data.proyectos || []).filter(p => { const fe = fechaAR(p['Fecha Evento']); return fe && fe >= desde && fe <= hoy0 && cerradasPorNum[txt(p['N° presupuesto'])] })
console.log(`\nFINALES → lectura al staff · ${ESCRIBIR ? 'ESCRIBIENDO' : 'PREVIEW (nada se toca)'} · trabajos de los últimos ${DIAS} días con alguna pieza cerrada: ${lista.length}\n`)
let conCarpeta = 0, sinCarpeta = [], totalMails = 0, sinMail = new Set()
for (const p of lista) {
  const nro = txt(p['N° presupuesto']), titulo = `#${nro} ${txt(p.Cliente) || txt(p.Agencia)} · ${txt(p.Proyecto)} (${txt(p['Fecha Evento'])})`
  if (!idDeLink(p['Drive Finales'])) { sinCarpeta.push(titulo); continue }
  const { con, sin } = mailsDelStaff(p, data.rrhh)
  sin.forEach(n => sinMail.add(n))
  if (!con.length) { console.log(`  · ${titulo} — nadie con mail`); continue }
  conCarpeta++; totalMails += con.length
  const r = await darFinalesAlStaff({ proyecto: p, rrhh: data.rrhh, dryRun: !ESCRIBIR })
  console.log(`  ${ESCRIBIR ? (r.fallo.length ? '⚠' : '✓') : '·'} ${titulo} → ${con.map(x => x.nombre.split(' ')[0]).join(', ')}${sin.length ? `  (sin mail: ${sin.join(', ')})` : ''}${r.fallo?.length ? `  FALLÓ: ${r.fallo.map(f => f.mail + ': ' + f.error).join(' · ')}` : ''}`)
}
console.log(`\n${conCarpeta} trabajos con carpeta Finales → ${totalMails} permisos de lectura${ESCRIBIR ? ' dados' : ' a dar'}.`)
if (sinCarpeta.length) console.log(`\n${sinCarpeta.length} entregados SIN carpeta Finales en PROYECTOS (el que filmó no va a ver nada hasta que se cargue):\n  ${sinCarpeta.join('\n  ')}`)
if (sinMail.size) console.log(`\nSin mail en RRHH (no se les puede dar acceso): ${[...sinMail].join(', ')}`)
if (!ESCRIBIR) console.log('\n--- PREVIEW. Nada escrito. Correr con --escribir para aplicar. ---\n')
