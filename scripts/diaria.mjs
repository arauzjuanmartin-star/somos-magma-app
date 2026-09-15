// La diaria de Magma — un solo mail a la mañana con lo que hay que hacer HOY.
// Junta dos radares que ya existen:
//   1. morning-brief.mjs   → cobros vencidos, facturas que vencen, proyectos de la semana sin staff
//   2. contador-radar.mjs  → VEPs de Diego por vencer / impagos / mails sin contestar
//
// Uso:
//   node scripts/diaria.mjs            → imprime en consola, no manda nada (usa el cache del contador)
//   node scripts/diaria.mjs --html     → además deja el HTML en scripts/.diaria.html para mirarlo
//   node scripts/diaria.mjs --mail     → refresca los mails del contador y MANDA la diaria a DIARIA_TO
//   --tarde / --manana                 → fuerza la versión de las 15 ("qué queda de hoy") o la de las 8.
//                                        Sin flag, la decide la hora: después del mediodía es la de la tarde.
//
// Programado con launchd a las 8:00 y a las 15:00: scripts/launchd/com.somosmagma.diaria.plist.
// Los dos avisos leen los datos en vivo, así que lo que se resolvió a la mañana ya no sale a la tarde.
// Cada envío queda anotado en scripts/.diaria-log.txt.
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, appendFileSync } from 'fs'
import nodemailer from 'nodemailer'

const MAIL = process.argv.includes('--mail')
const HTML = process.argv.includes('--html') || MAIL
const DIARIA_TO = process.env.DIARIA_TO || 'juan@somosmagma.com'

const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);return[l.slice(0,i).trim(),v]}))

const hoy = new Date()
const TARDE = process.argv.includes('--tarde') || (!process.argv.includes('--manana') && hoy.getHours() >= 12)
const fechaLarga = hoy.toLocaleDateString('es-AR',{ weekday:'long', day:'numeric', month:'long', year:'numeric' })
const titulo = TARDE ? '🕒 La tarde de Magma' : '☀️ La diaria de Magma'
const intro = TARDE
  ? 'Segundo aviso del día. Esto es lo que sigue abierto ahora a las 15: lo que ya resolviste a la mañana no aparece más. Lo que quede acá, o se hace antes de cerrar o pasa a mañana a las 8.'
  : ''

function correr(cmd){
  try { return execSync(cmd,{ encoding:'utf8', maxBuffer:16*1024*1024, stdio:['ignore','pipe','pipe'] }) }
  catch(e){ return `⚠️ Falló "${cmd}": ${(e.stderr||e.message||'').toString().slice(0,400)}` }
}
const sinAnsi = s => s.replace(/\x1b\[[0-9;]*m/g,'')

// 1. El brief del día (cobros, proyectos, staff)
const brief = sinAnsi(correr('node scripts/morning-brief.mjs')).trim()

// 2. El contador: con --mail refresca (trae los mails nuevos); si no, usa el cache local
let contador = sinAnsi(correr(`node scripts/contador-radar.mjs${MAIL ? ' --refrescar' : ''}`))
const ini = contador.indexOf('RADAR DEL CONTADOR')
if (ini > 0) contador = contador.slice(contador.lastIndexOf('\n', ini) + 1)
const fin = contador.indexOf('📊 PATRÓN')
if (fin > 0) contador = contador.slice(0, fin)
contador = contador.replace(/^█+\n?/gm,'').replace(/\n{3,}/g,'\n\n').trim()

// hour12:false porque bajo launchd (sin LANG) el reloj salía "01:29" en vez de "13:29"
const ahora = hoy.toLocaleString('es-AR',{ hour12:false })
const texto = `${intro ? intro + '\n\n' : ''}${brief}\n\n\n# 🧾 El contador (Diego)\n\n${contador}\n\n---\nGenerado por scripts/diaria.mjs · ${ahora}`
console.log(texto)

// 3. HTML del mail
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
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
const html = `<!doctype html><html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.45;color:#111;max-width:680px;margin:0 auto;padding:16px">
<style>h1{font-size:22px;margin:18px 0 8px}h2{font-size:16px;margin:18px 0 6px;color:#CE2637}ul{margin:4px 0 8px 18px;padding:0}li{margin:3px 0}p{margin:4px 0}pre{font:13px/1.4 Menlo,Consolas,monospace;background:#f4f2f0;padding:12px;border-radius:6px;overflow-x:auto;white-space:pre-wrap}hr{border:0;border-top:1px solid #ddd;margin:16px 0}.intro{background:#FBE9EB;border-left:3px solid #CE2637;padding:8px 12px;margin:0 0 12px;border-radius:0 6px 6px 0}</style>
${intro ? `<p class="intro">${esc(intro)}</p>` : ''}
${md2html(brief)}
<h1>🧾 El contador (Diego)</h1>
<pre>${esc(contador)}</pre>
<hr><p style="color:#777;font-size:12px">La diaria de Magma · generada ${ahora} · para cambiar algo: scripts/diaria.mjs</p>
</body></html>`

if (HTML) { writeFileSync('scripts/.diaria.html', html); console.error('\n[HTML escrito en scripts/.diaria.html]') }

// 4. Mandar (solo con --mail)
if (MAIL) {
  if (!env.MAIL_USER || !env.MAIL_APP_PASSWORD) { console.error('Faltan MAIL_USER / MAIL_APP_PASSWORD en .env.local'); process.exit(1) }
  const t = nodemailer.createTransport({ service:'gmail', auth:{ user:env.MAIL_USER, pass:env.MAIL_APP_PASSWORD } })
  const subject = `${titulo} — ${fechaLarga}`
  const info = await t.sendMail({ from:`Somos Magma <${env.MAIL_USER}>`, to:DIARIA_TO, subject, text:texto, html })
  appendFileSync('scripts/.diaria-log.txt', `${hoy.toISOString()} ${TARDE ? 'tarde' : 'mañana'} enviada a ${DIARIA_TO} (${info.messageId})\n`)
  console.error(`\n✅ Diaria enviada a ${DIARIA_TO}`)
}
