/**
 * El lunes de Magma — el reporte de la reunión semanal de los socios, por consola.
 * La lógica vive en lib/lunes.mjs (la misma que usa /lunes en la app y el mail de los lunes desde Vercel).
 *
 *   node scripts/lunes.mjs              → imprime el reporte (solo lectura)
 *   node scripts/lunes.mjs --json       → los datos estructurados
 *   node scripts/lunes.mjs --html       → además deja el HTML del mail en scripts/.diaria-lunes.html
 *   node scripts/lunes.mjs --escribir   → anota la semana en la solapa SEMANAL (sin mandar mail)
 *   node scripts/lunes.mjs --mail       → MANDA el mail a LUNES_TO (Juan y Sofi) y anota SEMANAL; si ya salió esta semana, no lo repite
 *   --forzar                            → con --mail, lo manda aunque ya haya salido esta semana
 */
import { google } from 'googleapis'
import { readFileSync, writeFileSync } from 'fs'
import { RANGOS_LUNES, calcularLunes, lunesMarkdown, armarMailLunes, correrLunes, leerSemanal, acuerdosDe, asegurarSemanal, guardarSemanal, valoresSemanal, semanaDe } from '../lib/lunes.mjs'
import { horaArgentina } from '../lib/diaria-mail.mjs'

const args = process.argv.slice(2)
const MAIL = args.includes('--mail'), ESCRIBIR = args.includes('--escribir'), HTML = args.includes('--html') || MAIL, JSON_ = args.includes('--json')
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const SHEET_ID = env.SHEET_ID || '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const APP = process.env.DIARIA_APP_URL || 'https://somos-magma-app.vercel.app'
const LINK = `${APP}/lunes`
const PARA = process.env.LUNES_TO || 'juan@somosmagma.com, sofi@somosmagma.com'

const auth = new google.auth.GoogleAuth({ credentials: { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') }, scopes: [MAIL || ESCRIBIR ? 'https://www.googleapis.com/auth/spreadsheets' : 'https://www.googleapis.com/auth/spreadsheets.readonly'] })
const sheets = google.sheets({ version: 'v4', auth })
const ahora = horaArgentina()

if (MAIL) {
  const nodemailer = (await import('nodemailer')).default
  if (!env.MAIL_USER || !env.MAIL_APP_PASSWORD) { console.error('Faltan MAIL_USER / MAIL_APP_PASSWORD en .env.local'); process.exit(1) }
  const t = nodemailer.createTransport({ service: 'gmail', auth: { user: env.MAIL_USER, pass: env.MAIL_APP_PASSWORD } })
  const enviar = m => t.sendMail({ from: `Somos Magma <${env.MAIL_USER}>`, ...m })
  const r = await correrLunes({ sheets, SHEET_ID, ahoraAR: ahora, enviar, para: PARA, link: LINK, origen: 'Mac', forzar: args.includes('--forzar') })
  console.log(JSON.stringify(r, null, 2))
  process.exit(r.ok ? 0 : 1)
}

const r = await sheets.spreadsheets.values.batchGet({ spreadsheetId: SHEET_ID, ranges: RANGOS_LUNES, valueRenderOption: 'FORMATTED_VALUE' })
const d = calcularLunes(r.data.valueRanges.map(v => v.values || []), ahora)
let filas = []
try { filas = await leerSemanal(sheets, SHEET_ID) } catch { /* todavía no existe SEMANAL */ }
const anteriores = acuerdosDe(filas, d.semana.claveAnterior)

if (JSON_) console.log(JSON.stringify({ ...d, acuerdos: { actual: acuerdosDe(filas, d.semana.clave), anterior: anteriores } }))
else console.log('\n' + lunesMarkdown(d, anteriores) + '\n')
if (HTML) { const { html } = armarMailLunes({ d, acuerdosAnteriores: anteriores, ahoraAR: ahora, link: LINK, origen: 'scripts/lunes.mjs' }); writeFileSync('scripts/.diaria-lunes.html', html); console.error('[HTML del mail escrito en scripts/.diaria-lunes.html]') }
if (ESCRIBIR) {
  await asegurarSemanal(sheets, SHEET_ID)
  const g = await guardarSemanal(sheets, SHEET_ID, { clave: d.semana.clave, valores: valoresSemanal(d, ahora) })
  console.error(`✓ SEMANAL ${g.actualizada ? 'actualizada' : 'agregada'}: semana ${d.semana.clave}`)
}
