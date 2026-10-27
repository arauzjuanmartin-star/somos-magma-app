// Crea o pone al día la solapa COTIZACIONES (dólar blue/oficial/MEP promedio del mes + inflación del INDEC),
// que usa el Histórico para mostrar los años en dólares o en pesos de hoy. Ver lib/cotizaciones.mjs.
// Preview por default. Con --escribir aplica y deja una línea en el LOG.
import { readFileSync } from 'fs'
const R = new URL('..', import.meta.url).pathname
for (const l of readFileSync(R + '.env.local', 'utf8').split('\n')) { const i = l.indexOf('='); if (i < 0) continue; let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); const k = l.slice(0, i).trim(); if (!(k in process.env)) process.env[k] = v }
const { getSheets } = await import(R + 'lib/sheets.js')
const { sincronizarCotizaciones, traerCotizaciones } = await import(R + 'lib/cotizaciones.mjs')
const ESCRIBIR = process.argv.includes('--escribir')

const filas = await traerCotizaciones()
console.log('Mes      Blue      Oficial   MEP       IPC%')
for (const f of filas) console.log(f.mes.padEnd(9), String(f.blue).padEnd(9), String(f.oficial).padEnd(9), String(f.mep).padEnd(9), f.ipc)
const { sheets, SHEET_ID } = await getSheets()
const r = await sincronizarCotizaciones({ sheets, SHEET_ID, dry: !ESCRIBIR })
console.log('\n', r)
if (!ESCRIBIR) { console.log('\nPreview. Para aplicar: --escribir'); process.exit(0) }
await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), 'juan@somosmagma.com', 'script cotizaciones', 'COTIZACIONES', '', `${r.nuevas} meses nuevos · ${r.cambian} actualizados`]] } })
console.log('✓ listo')
