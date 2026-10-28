/**
 * #2433 Panera "Contenido octubre" de Lucho (Jorge Luis Chavez) pasa a noviembre (Juan, 28/10/2026): la fecha se
 * corrió al 02/11/2026 y cuenta en el mes nuevo. PROYECTOS ya tenía 02/11; Pagos Staff lo tenía en "10 - octubre".
 * En noviembre es su jornada 2 del banco → $190.000 (estaba a $180.000, precio de extra de octubre).
 *
 * Uso:  node scripts/lucho-2433-a-noviembre.mjs            (preview)
 *       node scripts/lucho-2433-a-noviembre.mjs --escribir
 */
import { google } from 'googleapis'
import { readFileSync, writeFileSync } from 'fs'
process.removeAllListeners('warning')
const { SLOT_PROY, MAX_SLOTS } = await import('../lib/slots.js')

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })
const ID = env.SHEET_ID || '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const ESCRIBIR = process.argv.includes('--escribir')

const txt = v => String(v ?? '').trim()
const num = v => { const n = parseFloat(txt(v).replace(/[$,\s]/g, '')); return isNaN(n) ? 0 : n }
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
const esLucho = v => /jorge luis ch[aá]vez/i.test(txt(v))
const NRO = '2433', DE = 180000, A = 190000
const NOTA = 'Pasó a noviembre: la fecha se corrió al 02/11/2026 (Juan, 28/10/2026). Jornada 2 del banco de noviembre, $190.000 (antes $180.000 como extra de octubre)'

const R = await sheets.spreadsheets.values.batchGet({ spreadsheetId: ID, ranges: ['PROYECTOS', 'Pagos_Staff'], valueRenderOption: 'FORMATTED_VALUE' })
const [PRO, PS] = R.data.valueRanges.map(v => v.values || [])
const ph = PRO[0], sh = PS[0], sc = n => sh.indexOf(n)
const fp = PRO.findIndex((r, i) => i > 0 && txt(r[ph.indexOf('N° presupuesto')]) === NRO)
const slots = []; for (let n = 1; n <= MAX_SLOTS; n++) if (fp > 0 && esLucho(PRO[fp][SLOT_PROY(n).staff])) slots.push(n)
const pagos = PS.map((r, i) => ({ r, i })).filter(({ r, i }) => i > 0 && esLucho(r[sc('Freelancer')]) && txt(r[sc('N° Presupuesto')]) === NRO)
if (fp < 0 || slots.length !== 1 || pagos.length !== 1) { console.log(`No cierra: fila PROYECTOS ${fp + 1}, slots de Lucho ${slots.length}, filas en Pagos Staff ${pagos.length}. No sigo.`); process.exit(1) }
const { r, i } = pagos[0]
if (/^pagad/i.test(txt(r[sc('Estado')])) || num(r[sc('Monto Pagado')]) > 0) { console.log('La fila ya está pagada. No la toco.'); process.exit(1) }
console.log(`\n#${NRO} ${txt(PRO[fp][ph.indexOf('Cliente')])} · Fecha Evento ${txt(PRO[fp][ph.indexOf('Fecha Evento')])} — ${ESCRIBIR ? 'ESCRIBIENDO' : 'PREVIEW (nada se toca)'}\n`)

const updates = [], rollback = []
const set = (range, antes, valor) => { if (txt(antes) === txt(valor)) return; console.log(`   ${range.padEnd(22)} ${txt(antes) || '(vacío)'}  →  ${valor}`); updates.push({ range, values: [[valor]] }); rollback.push({ range, antes }) }
const cP = SLOT_PROY(slots[0]).precio
if (![DE, A].includes(num(PRO[fp][cP]))) { console.log(`PROYECTOS dice ${PRO[fp][cP]}, esperaba ${DE}. No sigo.`); process.exit(1) }
set(`PROYECTOS!${colLetra(cP)}${fp + 1}`, PRO[fp][cP], A)
set(`Pagos_Staff!${colLetra(sc('Mes Referencia'))}${i + 1}`, r[sc('Mes Referencia')], '11 - noviembre')
set(`Pagos_Staff!${colLetra(sc('Período'))}${i + 1}`, r[sc('Período')], '2026-11')
set(`Pagos_Staff!${colLetra(sc('Monto Adeudado'))}${i + 1}`, r[sc('Monto Adeudado')], A)
const ya = txt(r[sc('Notas')]); if (!ya.includes(NOTA)) set(`Pagos_Staff!${colLetra(sc('Notas'))}${i + 1}`, ya, ya ? `${ya} · ${NOTA}` : NOTA)

if (!updates.length) { console.log('   Ya estaba todo hecho.'); process.exit(0) }
if (!ESCRIBIR) { console.log('\nPara aplicar: --escribir'); process.exit(0) }
writeFileSync('scripts/.rollback-lucho-2433-a-noviembre.json', JSON.stringify(rollback, null, 2))
await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: ID, requestBody: { valueInputOption: 'USER_ENTERED', data: updates } })
await sheets.spreadsheets.values.append({ spreadsheetId: ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), 'juan@somosmagma.com', 'lucho-2433-a-noviembre', 'PROYECTOS+PAGOS_STAFF', NRO, 'pasa a noviembre, $180.000 → $190.000']] } })
const V = await sheets.spreadsheets.values.batchGet({ spreadsheetId: ID, ranges: updates.map(u => u.range) })
console.log('\nLeído de vuelta:'); V.data.valueRanges.forEach(v => console.log(`   ${v.range.padEnd(28)} ${txt(v.values?.[0]?.[0])}`))
