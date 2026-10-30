// La rutina de LinkedIn de Juan, lista cada mañana (lun a vie 8:45, launchd: scripts/launchd/com.somosmagma.linkedin-dia.plist).
//
// Qué hace:
//   1. elige a quién invitar hoy (10, sin repetir a nadie ya invitado) y qué 3 agencias comentar (rotan)
//   2. le pide al agente `redes` los comentarios de ejemplo, el texto para compartir el post del día y LA MEJORA del día
//   3. escribe una fila en la solapa LINKEDIN del Master (todo queda en el sheet)
//   4. le manda a Juan un mail con el botón "Abrir la rutina de hoy" → /linkedin en la app (botones de copiar y abrir)
//
// Lo que Juan tilda en /linkedin vuelve a la columna "Hechos" de LINKEDIN; al otro día este script lo lee
// y no le vuelve a proponer a quien ya invitó.
//
// Uso:
//   node scripts/linkedin-dia.mjs              → preview: arma todo e imprime, no escribe ni manda
//   node scripts/linkedin-dia.mjs --escribir   → escribe la fila en LINKEDIN y manda el mail
//   --sin-claude                               → no llama al agente (para probar rápido; comentarios y mejora genéricos)
import { spawn } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs'
import { lookup } from 'dns/promises'
import nodemailer from 'nodemailer'
import { conectarSheets } from './presu-pdf.mjs'

const ESCRIBIR = process.argv.includes('--escribir')
const SIN_CLAUDE = process.argv.includes('--sin-claude')
const SHEET_ID = '1MEA9iBUVWZxRI2B187rWpv86g58oRAW-SUEl4iwFJLc'
const APP = 'https://somos-magma-app.vercel.app'
const PARA = 'juan@somosmagma.com'
const DIR = 'scripts/.comercial/linkedin-red'
const ESTADO = `${DIR}/estado.json`
const META_RED = 250
mkdirSync('scripts/.programado', { recursive: true })
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
const p2 = n => String(n).padStart(2, '0')
const hoy = `${p2(ahora.getDate())}/${p2(ahora.getMonth() + 1)}/${ahora.getFullYear()}`
const DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][ahora.getDay()]
const log = l => appendFileSync('scripts/.programado/log.txt', `${new Date().toISOString()} linkedin ${l}\n`)
const clave = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
const buscarPersona = (nombre, empresa) => `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${nombre} ${empresa || ''}`.trim())}`
const postsDe = agencia => `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(agencia)}&sortBy=%22date_posted%22`

// Las agencias que ya nos compran: sus posts son donde más rinde un comentario (los lee gente de agencias)
const AGENCIAS = ['Ostara', 'Magnética Producciones', 'PopUp Projects', 'ADN Comunicación', 'Meikin', 'Stadium', 'The Bloom', 'Oir Comunicaciones', 'Grupo Mods', 'Velvet', 'Louder', 'Minita', 'A Train', 'Verne Studio', 'Wave Brands', 'Venue Brand Experience', 'MET Group', 'Cuatro Coronas']

// Las mejoras, de a una por día, en orden. La que se tilda en /linkedin no vuelve a salir.
const MEJORAS = [
  { id: 'titular', titulo: 'Tu titular habla a las agencias' },
  { id: 'banner', titulo: 'Portada de tu perfil con una foto de cobertura' },
  { id: 'destacado', titulo: 'Sección "Destacado" con 3 trabajos' },
  { id: 'acerca', titulo: '"Acerca de" en 4 líneas: qué hacés y para quién' },
  { id: 'invitar-seguir', titulo: 'Invitar a tus contactos a seguir la página de Magma' },
  { id: 'recomendacion', titulo: 'Pedirle una recomendación a una agencia cliente' },
  { id: 'modo-creador', titulo: 'Activar el modo creador y elegir 5 temas' },
  { id: 'experiencia', titulo: 'Experiencia: Somos Magma con 3 logros con números' },
  { id: 'url', titulo: 'URL personalizada del perfil' },
  { id: 'foto', titulo: 'Foto de perfil: cara de frente, luz, fondo limpio' },
]

// ---------- estado: a quién ya se invitó y qué mejoras se hicieron ----------
const estado = existsSync(ESTADO) ? JSON.parse(readFileSync(ESTADO, 'utf8')) : { invitados: {}, mejoras: {}, rotacion: 0 }
const sheets = conectarSheets(!ESCRIBIR)

async function leerLinkedin(){
  try {
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'LINKEDIN!A:F' })
    return r.data.values || []
  } catch { return null } // la solapa todavía no existe
}
const filas = await leerLinkedin()
// Lo tildado en /linkedin (columna E "Hechos": claves separadas por coma) pasa al estado
for (const f of (filas || []).slice(1)) {
  const hechos = String(f[4] || '').split(',').map(s => s.trim()).filter(Boolean)
  for (const h of hechos) {
    if (h.startsWith('inv:')) estado.invitados[h.slice(4)] = estado.invitados[h.slice(4)] || f[0]
    if (h.startsWith('mejora:')) estado.mejoras[h.slice(7)] = estado.mejoras[h.slice(7)] || f[0]
  }
}

// ---------- 1. a quién invitar: primero gente de clientes (aceptan más), después prospectos ----------
const personas = JSON.parse(readFileSync(`${DIR}/personas.json`, 'utf8'))
let verano = []
try { verano = (JSON.parse(readFileSync('scripts/.comercial/prospectos-verano-2027.json', 'utf8')).linkedin || []).map(p => ({ nombre: p.persona, cargo: p.cargo, empresa: (p.cargo || '').split(',').pop().trim(), url: p.url, tipo: 'prospecto' })) } catch {}
const pool = [...personas.filter(p => p.tipo === 'cliente'), ...personas.filter(p => p.tipo !== 'cliente'), ...verano]
  .filter(p => p.nombre && !estado.invitados[clave(p.nombre)])
const invitar = pool.slice(0, 10).map(p => ({
  key: clave(p.nombre), nombre: p.nombre, cargo: p.cargo || '', empresa: p.empresa || '', tipo: p.tipo,
  link: p.url ? p.url.replace('https://ar.linkedin.com', 'https://www.linkedin.com') : buscarPersona(p.nombre, p.empresa),
  buscar: !p.url,
}))

// ---------- 2. qué agencias comentar hoy (rotan de a 3) ----------
const desde = (estado.rotacion || 0) % AGENCIAS.length
const comentar = [0, 1, 2].map(i => AGENCIAS[(desde + i) % AGENCIAS.length])
const mejoraHoy = MEJORAS.find(m => !estado.mejoras[m.id]) || null

// ---------- 3. el agente escribe lo que necesita criterio ----------
const PROMPT = `Hoy es ${DIA} ${hoy}. Corrés solo, programado: lo que devuelvas lo lee Juan (dueño de Somos Magma) en una página con botones de copiar. No preguntes nada. No publiques nada.

Contexto: Juan quiere que LinkedIn le traiga clientes (agencias de eventos y BTL). Su red es chica (unos 80 contactos). La rutina diaria es: invitar a 10, contestar a los que aceptaron, comentar en posts de 3 agencias, compartir el post de la página si hay, y una mejora del perfil.

Leé estas memorias para el tono y el calendario:
- /Users/dronjuan/.claude/projects/-Users-dronjuan-somos-magma-app/memory/project_cronograma_redes_2026_11.md (qué post de la página sale hoy, si sale)
- /Users/dronjuan/.claude/projects/-Users-dronjuan-somos-magma-app/memory/feedback_posteos_video_y_sin_lugar.md

Escribí:
A) Para cada agencia de [${comentar.join(', ')}]: 2 comentarios de ejemplo para pegar en un post reciente de esa agencia. Uno para "si el post muestra un evento o activación que hicieron" y otro para "si anuncia algo (cuenta nueva, aniversario, equipo, premio)". Que sumen algo desde el oficio de cobertura (un detalle de producción, una pregunta concreta, un dato), en primera persona, 1 a 3 líneas, sin vender, sin "felicitaciones" sueltas, sin emojis, sin rayas largas. Las preguntas con signo de apertura (¿…?). Nunca digas que no tenemos trabajo.
   PROHIBIDO inventar: ninguna cifra, porcentaje o dato que no esté en las memorias, y ninguna experiencia que no pasó ("me sorprendió", "me tocó ver", "vengo siguiendo"). Si no sabés algo del post, preguntá en vez de afirmar. Juan los va a pegar con su nombre delante de sus clientes.
B) Si hoy sale un post de la página según el cronograma: una línea para que Juan lo comparta desde su perfil (en primera persona, cuenta por qué ese trabajo le gustó o qué resolvimos, 2 líneas como máximo, sin cifras inventadas). Si hoy no sale nada, "compartir": null.
C) La mejora del día: ${mejoraHoy ? `"${mejoraHoy.titulo}" (id ${mejoraHoy.id})` : 'ninguna (ya se hicieron todas): proponé una nueva útil para captar agencias'}. Explicala para alguien que no sabe usar LinkedIn: para qué le sirve en plata o en clientes (1 frase), y los pasos exactos de dónde tocar en la web de LinkedIn (máximo 5 pasos cortos, nombrando los botones como aparecen en español). Si la mejora necesita un texto (titular, acerca de, pedido de recomendación), escribilo listo para copiar.
D) Un consejo práctico de una línea sobre algo que hoy conviene tener en cuenta. Sin estadísticas ni "es el día que más…": nada que no puedas respaldar.
En el titular y en cualquier texto sobre Magma: el equipo son freelancers que arma Magma, no "equipo propio".

Tu respuesta final es SOLO un bloque JSON, sin texto antes ni después:
{"comentarios":[{"agencia":"…","evento":"texto","anuncio":"texto"}],"compartir":{"post":"qué post sale hoy","texto":"…"} ,"mejora":{"id":"…","titulo":"…","para_que":"…","pasos":["…"],"texto":"texto para copiar o vacío"},"consejo":"…"}`

async function esperarRed(intentos = 960){
  for (let i = 0; i < intentos; i++){ try { await lookup('api.anthropic.com'); return true } catch {} await new Promise(r => setTimeout(r, 15000)) }
  return false
}
function correrClaude(){
  return new Promise((resolve, reject) => {
    const p = spawn('claude', ['-p', PROMPT, '--agent', 'redes', '--output-format', 'json', '--permission-mode', 'dontAsk', '--allowedTools', 'Read'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d)
    const tope = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('Claude tardó más de 15 minutos, se cortó')) }, 15 * 60 * 1000)
    p.on('close', code => { clearTimeout(tope); code === 0 ? resolve(out) : reject(new Error(`claude salió con ${code}: ${err.slice(-400)}`)) })
  })
}
const sacarJSON = t => { const r = JSON.parse(t).result || ''; return JSON.parse(r.slice(r.indexOf('{'), r.lastIndexOf('}') + 1)) }

const BIENVENIDA = `Hola [nombre], gracias por aceptar.

Soy Juan, de Somos Magma. Hacemos la cobertura de foto y video de eventos y activaciones para agencias como Ostara, Magnética y Pop Up. Armamos el equipo, resolvemos sobre la hora y entregamos a tiempo.

Si en algún momento necesitan cámara para un evento, escribime y lo vemos.

Te dejo nuestra presentación: canva.link/brochuresomosmagma

Abrazo,
Juan`

try {
  if (!(await esperarRed())) throw new Error('sin red después de 4 horas de espera')
  const ia = SIN_CLAUDE
    ? { comentarios: comentar.map(a => ({ agencia: a, evento: '(sin Claude)', anuncio: '(sin Claude)' })), compartir: null, mejora: mejoraHoy ? { ...mejoraHoy, para_que: '', pasos: [], texto: '' } : null, consejo: '' }
    : sacarJSON(await correrClaude())

  const dia = {
    fecha: hoy, dia: DIA,
    red: { invitadosTotal: Object.keys(estado.invitados).length, meta: META_RED },
    invitar,
    bienvenida: BIENVENIDA,
    aceptaron: 'https://www.linkedin.com/mynetwork/invite-connect/connections/',
    comentarios: (ia.comentarios || []).map(c => ({ ...c, link: postsDe(c.agencia) })),
    compartir: ia.compartir && ia.compartir.texto ? { ...ia.compartir, link: 'https://www.linkedin.com/company/104592628/admin/page-posts/published/' } : null,
    mejora: ia.mejora || null,
    consejo: ia.consejo || '',
  }

  console.log(JSON.stringify(dia, null, 2))

  if (ESCRIBIR) {
    // la solapa LINKEDIN: Fecha · A invitar · Agencias para comentar · Mejora del día · Hechos (lo tilda Juan en /linkedin) · Datos (técnico)
    if (!filas) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests: [{ addSheet: { properties: { title: 'LINKEDIN', gridProperties: { frozenRowCount: 1 } } } }] } })
      await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: 'LINKEDIN!A1:F1', valueInputOption: 'RAW', requestBody: { values: [['Fecha', 'A invitar', 'Agencias para comentar', 'Mejora del día', 'Hechos', 'Datos (no tocar)']] } })
    }
    const actual = (await leerLinkedin()) || []
    const fila = actual.findIndex(f => f[0] === hoy) + 1 // si ya corrió hoy, pisa la fila (conserva Hechos)
    const valores = [[hoy, invitar.map(p => p.nombre).join(', '), comentar.join(', '), dia.mejora?.titulo || '', fila ? (actual[fila - 1][4] || '') : '', JSON.stringify(dia)]]
    if (fila) await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `LINKEDIN!A${fila}:F${fila}`, valueInputOption: 'RAW', requestBody: { values: valores } })
    else await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LINKEDIN!A:F', valueInputOption: 'RAW', requestBody: { values: valores } })

    estado.rotacion = (desde + 3) % AGENCIAS.length
    writeFileSync(ESTADO, JSON.stringify(estado, null, 2))

    const link = `${APP}/linkedin`
    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1917">
<p style="font-size:13px;color:#6F6B63;margin:0 0 4px">LinkedIn · ${DIA} ${hoy}</p>
<h1 style="font-size:24px;margin:0 0 6px">Tu rutina de hoy: 15 minutos</h1>
<p style="margin:0 0 18px;color:#6F6B63">Abrila en la compu o en el celu: cada paso tiene su botón para abrir y para copiar.</p>
<a href="${link}" style="display:inline-block;background:#0A66C2;color:#fff;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:999px;font-size:16px">Abrir la rutina de hoy →</a>
<ol style="margin:24px 0 0;padding-left:20px;line-height:1.7">
<li><b>Invitar a 10</b>: ${esc(invitar.slice(0, 3).map(p => p.nombre).join(', '))} y ${Math.max(0, invitar.length - 3)} más</li>
<li><b>Contestar a los que aceptaron</b> con el mensaje de bienvenida</li>
<li><b>Comentar</b> un post de ${esc(comentar.join(', '))}</li>
${dia.compartir ? `<li><b>Compartir</b> el post de la página: ${esc(dia.compartir.post)}</li>` : ''}
${dia.mejora ? `<li><b>Mejora del día</b>: ${esc(dia.mejora.titulo)}</li>` : ''}
</ol>
${dia.consejo ? `<p style="margin:20px 0 0;padding:12px 14px;background:#E9EDFF;border-radius:10px">💡 ${esc(dia.consejo)}</p>` : ''}
<p style="margin:22px 0 0;font-size:12px;color:#A8A39A">Lo que tildes en la página queda anotado en la solapa LINKEDIN del Master y mañana no se repite.</p>
</div>`
    const t = nodemailer.createTransport({ service: 'gmail', auth: { user: env.MAIL_USER, pass: env.MAIL_APP_PASSWORD } })
    await t.sendMail({ from: `Somos Magma <${env.MAIL_USER}>`, to: PARA, subject: `🔗 LinkedIn ${hoy}: tu rutina de hoy (15 min)`, html, text: `Tu rutina de LinkedIn de hoy: ${link}` })
    console.error(`✅ Fila en LINKEDIN y mail a ${PARA}`)
  }
  log(`${ESCRIBIR ? 'OK' : 'preview'} · ${invitar.length} a invitar · ${comentar.join('/')}`)
} catch (e) {
  console.error('❌', e.message)
  log(`ERROR ${e.message}`)
  if (ESCRIBIR) {
    const t = nodemailer.createTransport({ service: 'gmail', auth: { user: env.MAIL_USER, pass: env.MAIL_APP_PASSWORD } })
    await t.sendMail({ from: `Somos Magma <${env.MAIL_USER}>`, to: PARA, subject: `⚠️ La rutina de LinkedIn de hoy (${hoy}) no se armó`, text: `Error: ${e.message}\n\nLog: scripts/.programado/log.txt` }).catch(() => {})
  }
  process.exit(1)
}
