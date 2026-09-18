// Las fotos de un proyecto, desde la consola: cuántas hay subidas, dónde cayeron y
// qué haría el botón "🖼 Fotos → Firmar y dejar listas para el cliente" de la app.
// Usa la MISMA lógica que la app (lib/fotos.js).
//
//   node scripts/fotos-proyecto.mjs 2297              → preview, no toca nada
//   node scripts/fotos-proyecto.mjs 2297 2250 2176    → varios
//   node scripts/fotos-proyecto.mjs 2297 --escribir   → mueve a Finales/Fotos y firma

import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { mirarFotos, acomodarFotos } from '../lib/fotos.js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('='); let v = l.slice(i + 1).trim()
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    return [l.slice(0, i).trim(), v]
  })
)
const ESCRIBIR = process.argv.includes('--escribir')
const nums = process.argv.slice(2).filter(a => /^\d+$/.test(a))
if (!nums.length) { console.log('Uso: node scripts/fotos-proyecto.mjs <N° presupuesto> [más números] [--escribir]'); process.exit(1) }

const auth = new google.auth.GoogleAuth({
  credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') },
  scopes: ['https://www.googleapis.com/auth/spreadsheets', ESCRIBIR ? 'https://www.googleapis.com/auth/drive' : 'https://www.googleapis.com/auth/drive.readonly'],
})
const sheets = google.sheets({ version: 'v4', auth }), drive = google.drive({ version: 'v3', auth })
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'PROYECTOS!A:FZ' })
const rows = r.data.values || [], h = rows[0] || []
const iNum = h.indexOf('N° presupuesto')

for (const num of nums) {
  const fila = rows.find((x, i) => i > 0 && String(x[iNum] || '').trim() === num)
  if (!fila) { console.log(`\n#${num}: no está en PROYECTOS`); continue }
  let { estado, plan, ctx } = await mirarFotos({ drive, h, fila, num })
  console.log(`\n#${num} ${estado.cliente || ''} — ${estado.proyecto || ''}  ·  lleva fotos según el presupuesto: ${estado.vendidas ? 'SÍ' : 'no'}`)
  if (estado.sinCarpeta) { console.log('  sin carpeta de entrega'); continue }
  console.log(`  ${estado.total} fotos · ${estado.firmadas} firmadas · ${estado.listas} ya en su lugar · faltan ${estado.faltan}`)
  estado.porCarpeta.forEach(c => console.log(`    ${String(c.n).padStart(4)}  ${c.carpeta}`))
  if (!estado.faltan) continue
  console.log(`  PLAN → destino: ${estado.destino}  ·  mover ${estado.aMover}  ·  firmar ${estado.aFirmar}`)
  const subs = [...new Set(plan.map(p => p.sub).filter(Boolean))]
  if (subs.length) console.log(`    conserva las subcarpetas: ${subs.join(', ')}`)
  ;[...plan.slice(0, 3), ...(plan.length > 4 ? [null] : []), ...plan.slice(-1)].forEach(p => console.log(p ? `    ${p.de} / ${p.antes}  →  ${p.mover ? `${estado.destino}${p.sub ? '/' + p.sub : ''} / ` : ''}${p.despues}` : '    …'))

  if (!ESCRIBIR) continue
  let total = 0
  while (plan.length) {
    const hecho = await acomodarFotos({ drive, plan, ctx, hasta: Date.now() + 5 * 60000 })
    total += hecho.hechas
    if (hecho.fallos.length) console.log(`  ${hecho.fallos.length} con error:`, hecho.fallos.slice(0, 3))
    if (!hecho.hechas) break
    ;({ estado, plan, ctx } = await mirarFotos({ drive, h, fila, num }))
  }
  console.log(`  ✓ ${total} fotos acomodadas · quedan ${estado.faltan} · link: ${estado.linkFotos}`)
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[new Date().toISOString(), 'script', 'fotos-proyecto', 'DRIVE', num, `${total} fotos a ${estado.destino} y firmadas`]] },
  })
}
if (!ESCRIBIR) console.log('\n(preview — no se tocó nada. Con --escribir las mueve y las firma.)')
