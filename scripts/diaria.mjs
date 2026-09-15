// La diaria de Magma — el mail de las 8 ("qué hacer hoy") y el de las 15 ("qué queda de hoy").
// Junta dos radares que ya existen y deja todo mirable en la app:
//   1. morning-brief.mjs --json   → cobros vencidos, facturas que vencen, proyectos de la semana sin staff
//   2. contador-radar.mjs --json  → VEPs de Diego por vencer / impagos / mails sin contestar
//   3. escribe una fila en la solapa DIARIA (los números del día + el radar del contador). La lee /diaria en la app.
//   4. manda el mail, con un botón "Abrir la diaria en la app".
//
// Uso:
//   node scripts/diaria.mjs              → imprime en consola y escribe DIARIA; no manda nada (cache del contador)
//   node scripts/diaria.mjs --html       → además deja el HTML en scripts/.diaria.html para mirarlo
//   node scripts/diaria.mjs --mail       → refresca los mails del contador, escribe DIARIA y MANDA el mail a DIARIA_TO
//   --tarde / --manana                   → fuerza la versión de las 15 o la de las 8 (sin flag, decide la hora)
//   --sin-sheet                          → no escribe la solapa DIARIA (para probar)
//
// Programado con launchd a las 8:00 y a las 15:00: scripts/launchd/com.somosmagma.diaria.plist.
// Cada envío queda anotado en scripts/.diaria-log.txt.
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, appendFileSync } from 'fs'
import nodemailer from 'nodemailer'
import { google } from 'googleapis'
import { briefMarkdown, money } from '../lib/brief.mjs'

const args = process.argv.slice(2)
const MAIL = args.includes('--mail')
const HTML = args.includes('--html') || MAIL
const SIN_SHEET = args.includes('--sin-sheet')
const DIARIA_TO = process.env.DIARIA_TO || 'juan@somosmagma.com'
// La app en producción (no NEXTAUTH_URL: en .env.local apunta a localhost)
const APP = process.env.DIARIA_APP_URL || 'https://somos-magma-app.vercel.app'
const LINK = `${APP}/diaria`

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return[l.slice(0,i).trim(),v]}))
const SHEET_ID = env.SHEET_ID || '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'

const hoy = new Date()
const TARDE = args.includes('--tarde') || (!args.includes('--manana') && hoy.getHours() >= 12)
const AVISO = TARDE ? 'tarde' : 'mañana'
const p2 = n => String(n).padStart(2, '0')
const hhmm = `${p2(hoy.getHours())}:${p2(hoy.getMinutes())}`
const ddmmyyyy = `${p2(hoy.getDate())}/${p2(hoy.getMonth()+1)}/${hoy.getFullYear()}`
const fechaLarga = hoy.toLocaleDateString('es-AR',{ weekday:'long', day:'numeric', month:'long', year:'numeric' })
const ahora = `${ddmmyyyy} ${hhmm}` // a mano: bajo launchd (sin LANG) toLocaleString daba "01:29" en vez de "13:29"
const titulo = TARDE ? '🕒 La tarde de Magma' : '☀️ La diaria de Magma'
const intro = TARDE
  ? 'Segundo aviso del día. Esto es lo que sigue abierto ahora a las 15: lo que ya resolviste a la mañana no aparece más. Lo que quede acá, o se hace antes de cerrar o pasa a mañana a las 8.'
  : ''

// ---------- 1 y 2: correr los dos radares ----------
function correr(cmd){
  try { return execSync(cmd,{ encoding:'utf8', maxBuffer:16*1024*1024, stdio:['ignore','pipe','pipe'] }) }
  catch(e){ throw new Error(`Falló "${cmd}": ${(e.stderr||e.message||'').toString().slice(0,400)}`) }
}
const json = cmd => { try { return JSON.parse(correr(cmd)) } catch(e) { return { error: e.message } } }

const brief = json('node scripts/morning-brief.mjs --json')
const contador = json(`node scripts/contador-radar.mjs --json${MAIL ? ' --refrescar' : ''}`)

// ---------- texto (para la consola y el mail en texto plano) ----------
const vtoTxt = e => e.dias === null ? (e.vto || 'sin fecha')
  : e.dias < 0 ? `venció el ${e.vto} (hace ${-e.dias} días)`
  : e.dias === 0 ? `🔥 VENCE HOY ${e.vto}`
  : e.dias <= 3 ? `🔥 vence el ${e.vto} (en ${e.dias} días)`
  : `vence el ${e.vto} (en ${e.dias} días)`
const itemVep = e => `- **${e.titular}** · ${e.tipo} ${e.periodo || ''} · ${vtoTxt(e)} · ${e.asunto}`
function contadorMarkdown(c){
  if (c.error) return `## 🧾 El contador (Diego)\n\n⚠️ No pude leer el radar del contador: ${c.error}`
  const L = ['## 🧾 El contador (Diego)', '']
  L.push(`**🔴 Impago según Diego y sin confirmación tuya (${c.impagos.length})**`)
  L.push(c.impagos.length ? c.impagos.map(itemVep).join('\n') : '- (ninguno)')
  L.push('', `**🟡 Sin noticias: el VEP llegó y nadie dijo "pagado" (${c.sinNoticias.length})**`)
  L.push(c.sinNoticias.length ? c.sinNoticias.map(itemVep).join('\n') : '- (ninguno)')
  L.push('', `**📩 Te pidió algo y no contestaste (${c.pendientes.length})**`)
  L.push(c.pendientes.length ? c.pendientes.map(e => `- ${e.fecha} · ${e.asunto} → ${e.resumen}`).join('\n') : '- (nada pendiente)')
  L.push('', 'Esto sale del mail, no del banco: si pagaste y avisaste por WhatsApp, acá sigue figurando. Chequear en ARCA antes de pagar dos veces.')
  return L.join('\n')
}
const textoBrief = brief.error ? `⚠️ No pude calcular el brief del día: ${brief.error}` : briefMarkdown(brief)
const texto = [intro, textoBrief, contadorMarkdown(contador), '---', `Abrí la diaria en la app: ${LINK}`, `Generado por scripts/diaria.mjs · ${ahora}`].filter(Boolean).join('\n\n')
console.log(texto)

// ---------- 3: la solapa DIARIA (una fila por aviso: los números del día + el radar del contador) ----------
const HEADERS = ['Fecha','Hora','Aviso','Vencidas $','Vencidas N','Vencen 7d $','Atrasadas +30d $','Por cobrar $','En espera $','Sin staff 7d','VEPs impagos','VEPs sin noticias','Contador (json)']
async function escribirDiaria(){
  const auth = new google.auth.GoogleAuth({ credentials:{ client_email:env.GOOGLE_CLIENT_EMAIL, private_key:env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n') }, scopes:['https://www.googleapis.com/auth/spreadsheets'] })
  const sheets = google.sheets({ version:'v4', auth })
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields:'sheets.properties(title,sheetId)' })
  if (!meta.data.sheets.some(s => s.properties.title === 'DIARIA')) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody:{ requests:[{ addSheet:{ properties:{ title:'DIARIA', gridProperties:{ frozenRowCount:1, columnCount: HEADERS.length } } } }] } })
    await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range:'DIARIA!A1', valueInputOption:'USER_ENTERED', requestBody:{ values:[HEADERS] } })
    console.error('+ solapa DIARIA creada')
  }
  const c = brief.cobros || {}, pl = brief.pipeline || {}
  const fila = [ddmmyyyy, hhmm, AVISO,
    c.vencidas || 0, c.vencidasN || 0, c.vencenSemana || 0, c.atrasadas || 0, c.porCobrar || 0, pl.esperaMonto || 0, brief.en7SinStaffN || 0,
    contador.error ? '' : contador.impagos.length, contador.error ? '' : contador.sinNoticias.length,
    contador.error ? '' : JSON.stringify(contador)]
  await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range:'DIARIA!A:M', valueInputOption:'USER_ENTERED', requestBody:{ values:[fila] } })
  console.error(`✓ fila escrita en DIARIA (${ddmmyyyy} ${hhmm} ${AVISO})`)
}
if (!SIN_SHEET) { try { await escribirDiaria() } catch(e) { console.error('⚠️ No pude escribir DIARIA:', e.message) } }

// ---------- 4: el mail ----------
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>')
function md2html(md){
  const out=[]; let enLista=false
  for (const raw of md.split('\n')) {
    const l = raw.trimEnd()
    if (l.startsWith('- ')) { if(!enLista){out.push('<ul>');enLista=true} out.push(`<li>${inline(l.slice(2))}</li>`); continue }
    if (enLista) { out.push('</ul>'); enLista=false }
    if (l.startsWith('# ')) out.push(`<h1>${inline(l.slice(2))}</h1>`)
    else if (l.startsWith('## ')) out.push(`<h2>${inline(l.slice(3))}</h2>`)
    else if (l === '---') out.push('<hr>')
    else if (l === '') out.push('')
    else out.push(`<p>${inline(l)}</p>`)
  }
  if (enLista) out.push('</ul>')
  return out.join('\n')
}
const colorVto = e => e.dias === null ? '#777' : e.dias <= 3 ? '#CE2637' : e.dias <= 10 ? '#B07712' : '#555'
const tablaVeps = (lista, vacio) => !lista.length ? `<p style="color:#777">${vacio}</p>` :
  `<table style="border-collapse:collapse;width:100%;font-size:13.5px">${lista.map(e => `<tr style="border-bottom:1px solid #eee">
    <td style="padding:6px 6px 6px 0;white-space:nowrap"><b>${esc(e.titular)}</b><br><span style="color:#777">${esc(e.tipo)} ${esc(e.periodo||'')}</span></td>
    <td style="padding:6px;color:${colorVto(e)};white-space:nowrap;font-weight:600">${esc(vtoTxt(e))}</td>
    <td style="padding:6px 0 6px 6px;color:#555">${esc(e.asunto)}</td></tr>`).join('')}</table>`
function contadorHtml(c){
  if (c.error) return `<h2>🧾 El contador (Diego)</h2><p>⚠️ No pude leer el radar del contador: ${esc(c.error)}</p>`
  return `<h2>🧾 El contador (Diego)</h2>
<p><b>🔴 Impago según Diego y sin confirmación tuya (${c.impagos.length})</b></p>${tablaVeps(c.impagos, 'Ninguno.')}
<p style="margin-top:14px"><b>🟡 Sin noticias: el VEP llegó y nadie dijo "pagado" (${c.sinNoticias.length})</b></p>${tablaVeps(c.sinNoticias, 'Ninguno.')}
<p style="margin-top:14px"><b>📩 Te pidió algo y no contestaste (${c.pendientes.length})</b></p>
${c.pendientes.length ? `<ul>${c.pendientes.map(e => `<li>${esc(e.fecha)} · ${esc(e.asunto)} → ${esc(e.resumen)}</li>`).join('')}</ul>` : '<p style="color:#777">Nada pendiente.</p>'}
<p style="color:#777;font-size:12.5px">Esto sale del mail, no del banco: si pagaste y avisaste por WhatsApp, acá sigue figurando. Chequear en ARCA antes de pagar dos veces.</p>`
}
const html = `<!doctype html><html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.45;color:#111;max-width:680px;margin:0 auto;padding:16px">
<style>h1{font-size:22px;margin:18px 0 8px}h2{font-size:16px;margin:22px 0 6px;color:#CE2637}ul{margin:4px 0 8px 18px;padding:0}li{margin:3px 0}p{margin:4px 0}hr{border:0;border-top:1px solid #ddd;margin:16px 0}.intro{background:#FBE9EB;border-left:3px solid #CE2637;padding:8px 12px;margin:0 0 12px;border-radius:0 6px 6px 0}</style>
<a href="${LINK}" style="display:inline-block;background:#CE2637;color:#fff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:8px;font-size:15px">Abrir la diaria en la app →</a>
<p style="color:#777;font-size:12.5px;margin:8px 0 18px">${TARDE ? 'Segundo aviso' : 'Primer aviso'} · ${esc(fechaLarga)} ${hhmm}. En la app se ve mejor y se recalcula al abrir; acá abajo va lo mismo por si estás sin señal.</p>
${intro ? `<p class="intro">${esc(intro)}</p>` : ''}
${md2html(textoBrief)}
${contadorHtml(contador)}
<hr><p style="color:#777;font-size:12px"><a href="${LINK}" style="color:#1543F8">${LINK}</a> · generada ${ahora} · para cambiar algo: scripts/diaria.mjs</p>
</body></html>`

if (HTML) { writeFileSync('scripts/.diaria.html', html); console.error('[HTML escrito en scripts/.diaria.html]') }

if (MAIL) {
  if (!env.MAIL_USER || !env.MAIL_APP_PASSWORD) { console.error('Faltan MAIL_USER / MAIL_APP_PASSWORD en .env.local'); process.exit(1) }
  const t = nodemailer.createTransport({ service:'gmail', auth:{ user:env.MAIL_USER, pass:env.MAIL_APP_PASSWORD } })
  const subject = `${titulo} — ${fechaLarga}`
  const info = await t.sendMail({ from:`Somos Magma <${env.MAIL_USER}>`, to:DIARIA_TO, subject, text:texto, html })
  appendFileSync('scripts/.diaria-log.txt', `${hoy.toISOString()} ${AVISO} enviada a ${DIARIA_TO} (${info.messageId})\n`)
  console.error(`✅ Diaria (${AVISO}) enviada a ${DIARIA_TO}`)
}
