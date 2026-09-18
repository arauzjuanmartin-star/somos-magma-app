// La diaria de Magma — el mail de las 8 ("qué hacer hoy") y el de las 15 ("qué queda de hoy").
// Junta dos radares que ya existen y deja todo mirable en la app:
//   1. morning-brief.mjs --json   → cobros vencidos, facturas que vencen, proyectos de la semana sin staff
//   2. contador-radar.mjs --json  → VEPs de Diego por vencer / impagos / mails sin contestar
//   3. manda el mail, con un botón "Abrir la diaria en la app" — salvo que Vercel ya lo haya mandado hoy.
//   4. escribe una fila en la solapa DIARIA (los números del día + el radar del contador + quién mandó el mail).
//      La lee /diaria en la app, y la lee Vercel para no mandar dos veces.
//
// Uso:
//   node scripts/diaria.mjs              → imprime en consola y escribe DIARIA; no manda nada (cache del contador)
//   node scripts/diaria.mjs --html       → además deja el HTML en scripts/.diaria.html para mirarlo
//   node scripts/diaria.mjs --mail       → refresca los mails del contador, MANDA el mail a DIARIA_TO y escribe DIARIA
//   --tarde / --manana                   → fuerza la versión de las 15 o la de las 8 (sin flag, decide la hora)
//   --sin-sheet                          → no escribe la solapa DIARIA (para probar)
//
// Programado con launchd a las 8:00 y a las 15:00: scripts/launchd/com.somosmagma.diaria.plist.
// El mismo mail sale también desde Vercel a las 8:10 y 15:10 (pages/api/cron/diaria/[aviso].js) por si la Mac está
// cerrada. El primero que lo manda lo anota en la columna "Mail" de DIARIA y el otro no lo repite. Esta corrida
// igual sirve aunque llegue tarde: es la única que lee el mail de Diego y deja el radar del contador al día.
// Plantilla y reglas compartidas: lib/diaria-mail.mjs. Cada envío queda anotado en scripts/.diaria-log.txt.
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, appendFileSync } from 'fs'
import nodemailer from 'nodemailer'
import { google } from 'googleapis'
import { lookup } from 'dns/promises'
import { horaArgentina, partesFecha, armarMail, asegurarSolapa, leerDiaria, yaEnviado, filaDiaria, escribirFila } from '../lib/diaria-mail.mjs'

const args = process.argv.slice(2)
const MAIL = args.includes('--mail')

// Con la Mac dormida, launchd corre esto en un despertar de 45 segundos que muchas veces no tiene red.
// El 18/09/2026 falló así (ENOTFOUND smtp.gmail.com a las 08:37) y el mail de las 8 no salió nunca: no reintentaba.
// Ahora espera a que haya red ANTES de calcular nada. Cuenta intentos y no reloj: mientras la Mac duerme el proceso
// queda congelado y sigue solo al despertar, así que las horas de sueño no gastan la espera.
async function esperarRed(intentos = 960){ // 960 x 15 s = 4 horas de Mac despierta
  for (let i = 0; i < intentos; i++){
    try { await lookup('smtp.gmail.com'); return true } catch {}
    await new Promise(r => setTimeout(r, 15000))
  }
  return false
}
if (MAIL && !(await esperarRed())) {
  appendFileSync('scripts/.diaria-log.txt', `${new Date().toISOString()} NO ENVIADA: sin red después de 4 horas de espera\n`)
  console.error('❌ Sin red: la diaria no se envió')
  process.exit(1)
}
const HTML = args.includes('--html') || MAIL
const SIN_SHEET = args.includes('--sin-sheet')
const DIARIA_TO = process.env.DIARIA_TO || 'juan@somosmagma.com'
// La app en producción (no NEXTAUTH_URL: en .env.local apunta a localhost)
const APP = process.env.DIARIA_APP_URL || 'https://somos-magma-app.vercel.app'
const LINK = `${APP}/diaria`

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return[l.slice(0,i).trim(),v]}))
const SHEET_ID = env.SHEET_ID || '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

// Después de esperar la red, no antes: si esperó dos horas, la hora del mail es la de ahora
const hoy = horaArgentina()
const TARDE = args.includes('--tarde') || (!args.includes('--manana') && hoy.getHours() >= 12)
const AVISO = TARDE ? 'tarde' : 'mañana'
const { ddmmyyyy, hhmm } = partesFecha(hoy)

// ---------- 1 y 2: correr los dos radares ----------
function correr(cmd){
  try { return execSync(cmd,{ encoding:'utf8', maxBuffer:16*1024*1024, stdio:['ignore','pipe','pipe'] }) }
  catch(e){ throw new Error(`Falló "${cmd}": ${(e.stderr||e.message||'').toString().slice(0,400)}`) }
}
const json = cmd => { try { return JSON.parse(correr(cmd)) } catch(e) { return { error: e.message } } }

const brief = json('node scripts/morning-brief.mjs --json')
const contador = json(`node scripts/contador-radar.mjs --json${MAIL ? ' --refrescar' : ''}`)

const { subject, texto, html } = armarMail({ brief, contador, tarde: TARDE, ahoraAR: hoy, link: LINK, origen: 'scripts/diaria.mjs' })
console.log(texto)
if (HTML) { writeFileSync('scripts/.diaria.html', html); console.error('[HTML escrito en scripts/.diaria.html]') }

const auth = new google.auth.GoogleAuth({ credentials:{ client_email:env.GOOGLE_CLIENT_EMAIL, private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') }, scopes:['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version:'v4', auth })

// ---------- 3: el mail (si Vercel no lo mandó ya) ----------
let mail = 'no (corrida a mano, sin --mail)', fallo = null
if (MAIL) {
  if (!env.MAIL_USER || !env.MAIL_APP_PASSWORD) { console.error('Faltan MAIL_USER / MAIL_APP_PASSWORD en .env.local'); process.exit(1) }
  // Se mira justo antes de enviar, no al arrancar: los radares tardan y Vercel pudo mandarlo en el medio
  let quien = ''
  try { quien = yaEnviado(await leerDiaria(sheets, SHEET_ID), hoy, AVISO) } catch { /* sin columna Mail todavía: nadie mandó nada */ }
  if (quien) {
    mail = `no: ya lo había mandado ${quien}`
    appendFileSync('scripts/.diaria-log.txt', `${new Date().toISOString()} ${AVISO} no se manda: ya lo había mandado ${quien}\n`)
    console.error(`↷ La diaria de la ${AVISO} ya la había mandado ${quien}: no la repito. Actualizo el radar del contador en DIARIA.`)
  } else {
    const t = nodemailer.createTransport({ service:'gmail', auth:{ user:env.MAIL_USER, pass:env.MAIL_APP_PASSWORD } })
    try {
      const info = await t.sendMail({ from:`Somos Magma <${env.MAIL_USER}>`, to:DIARIA_TO, subject, text:texto, html })
      mail = 'Mac'
      appendFileSync('scripts/.diaria-log.txt', `${new Date().toISOString()} ${AVISO} enviada a ${DIARIA_TO} (${info.messageId})\n`)
      console.error(`✅ Diaria (${AVISO}) enviada a ${DIARIA_TO}`)
    } catch(e) {
      // Que quede anotado: hasta el 18/09 un fallo no dejaba rastro en el log y parecía que no había corrido
      fallo = e; mail = `falló en la Mac: ${e.message}`.slice(0, 200)
      appendFileSync('scripts/.diaria-log.txt', `${new Date().toISOString()} ${AVISO} NO ENVIADA: ${e.message}\n`)
      console.error(`❌ No se pudo mandar la diaria: ${e.message}`)
    }
  }
}

// ---------- 4: la solapa DIARIA (una fila por corrida: los números del día + el radar del contador + el mail) ----------
if (!SIN_SHEET) {
  try {
    await asegurarSolapa(sheets, SHEET_ID)
    await escribirFila(sheets, SHEET_ID, filaDiaria({ brief, contador, contadorLeidoAhora: true, aviso: AVISO, ahoraAR: hoy, mail }))
    console.error(`✓ fila escrita en DIARIA (${ddmmyyyy} ${hhmm} ${AVISO} · mail: ${mail})`)
  } catch(e) { console.error('⚠️ No pude escribir DIARIA:', e.message) }
}
if (fallo) process.exit(1)
