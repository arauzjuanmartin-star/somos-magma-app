// El motor: corre un agente de Claude solo, a una hora fija, sin que nadie lo pida.
// launchd lo dispara (scripts/launchd/com.somosmagma.programado-*.plist), Claude trabaja en modo solo lectura
// y devuelve un JSON; este script es el único que actúa: deja los borradores en la casilla de la tarea y le manda
// el resumen a quien corresponde. Claude nunca envía nada ni escribe en el sheet: lo más que pasa es un borrador en Gmail.
//
// Uso:
//   node scripts/programado.mjs <tarea>              → preview: corre el agente e imprime los borradores, no crea nada
//   node scripts/programado.mjs <tarea> --escribir   → crea los borradores y manda el resumen
//
// Tareas (sumar una = agregarla en TAREAS + un plist):
//   seguimiento  lun a vie 10:00 · agente comercial · borradores en juan@ de seguimiento de los presus de Juan que pasaron el día 4
//   admin        lun a vie 9:00  · agente administracion · el día de Flor (admin@): lista de tareas + borradores de reclamo de lo vencido
//   radar        lun y jue 8:30  · agente oportunidades · noticias, eventos, licitaciones → informe a Juan (sin borradores)
//
// Cada corrida queda en scripts/.programado/<tarea>-<fecha>.json y una línea en scripts/.programado/log.txt.
import { spawn, execFileSync } from 'child_process'
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'fs'
import { lookup } from 'dns/promises'
import nodemailer from 'nodemailer'

const args = process.argv.slice(2)
const TAREA = args.find(a => !a.startsWith('--'))
const ESCRIBIR = args.includes('--escribir')
const DIR = 'scripts/.programado'
mkdirSync(DIR, { recursive: true })
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); let v = l.slice(i + 1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); return [l.slice(0, i).trim(), v] }))
const hoy = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
const log = linea => appendFileSync(`${DIR}/log.txt`, `${new Date().toISOString()} ${TAREA} ${linea}\n`)
const plata = n => '$' + Math.round(n || 0).toLocaleString('es-AR')

const JSON_FINAL = `Tu respuesta final es SOLO un bloque JSON, sin texto antes ni después.`

const TAREAS = {
  seguimiento: {
    agente: 'comercial',
    casilla: 'juan@somosmagma.com', resumenA: 'juan@somosmagma.com',
    asunto: n => `📞 Seguimiento ${hoy}: ${n} borradores listos`,
    herramientas: ['Read', 'Bash(node scripts/comercial-tablero.mjs:*)', 'Bash(node scripts/cliente.mjs:*)', 'Bash(node scripts/gmail-leer.mjs:*)'],
    // No repetir el mismo presu si ya se le armó borrador en los últimos 4 días (la regla del día 4)
    claves: b => b.presus, diasSinRepetir: 4,
    pie: 'Cuando hables con alguno, anotalo con el 📞 en Trabajos → En espera: de ahí sale a quién le toca mañana.',
    prompt: `Hoy es ${hoy}. Corrés solo, programado: nadie te lee hasta que Juan abra su mail. No preguntes nada.

1. Corré node scripts/comercial-tablero.mjs y quedate con los presupuestos VIVOS de PM Juan marcados "📞 TOCA".
2. Agrupá los que son del mismo cliente y el mismo pedido (ej: varias opciones de Telefe Coberturas verano = un solo mail).
3. Para cada grupo, sacá el mail del contacto con node scripts/cliente.mjs "<agencia>".
4. Antes de escribir, fijate si ya hubo ida y vuelta reciente: node scripts/gmail-leer.mjs juan@somosmagma.com 5 "<mail del contacto> newer_than:4d" (y también con "in:sent"). Si el cliente escribió o Juan le escribió en los últimos 4 días, NO armes borrador: anotalo en "salteados" con el motivo.
5. Armá como máximo 6 borradores, empezando por los grupos con más plata. Los que no tienen mail o salteaste en el paso 4 NO cuentan para ese tope: seguí bajando por la lista hasta llegar a 6. Los que quedan después van a "salteados" con motivo "fuera del tope del día".
6. Si el tablero anota que el cliente espera al cliente final o una licitación, el mail lo tiene en cuenta (pregunta por novedades, no presiona).

Escribí cada mail con tus reglas de copy: corto, primera persona del plural, de Juan, sin rayas largas, sin "Che". Nombrá el evento y la fecha. Nunca un monto que no salga del tablero.

${JSON_FINAL}
{"resumen":"2 líneas para Juan","borradores":[{"presus":["#2313"],"cliente":"Total Producciones","monto":25900000,"to":"mail","cc":"","subject":"…","text":"…","responder":"búsqueda de Gmail para encontrar el hilo del presupuesto, o vacío"}],"salteados":[{"presus":["#…"],"cliente":"…","motivo":"…"}],"sin_mail":[{"presus":["#…"],"cliente":"…"}]}`,
  },

  admin: {
    agente: 'administracion',
    casilla: 'admin@somosmagma.com', resumenA: 'admin@somosmagma.com',
    asunto: n => `☀️ Administración ${hoy}: lo de hoy${n ? ` y ${n} reclamos listos para mandar` : ''}`,
    herramientas: ['Read', 'Bash(node scripts/caja-hoy.mjs:*)', 'Bash(node scripts/reclamos-del-dia.mjs:*)', 'Bash(node scripts/gmail-leer.mjs:*)'],
    claves: b => [b.cliente], diasSinRepetir: 4,
    pie: 'Cuando una agencia te diga cuándo paga, anotalo en Facturación → la factura → "Prometió…": desde ahí deja de aparecer para reclamar y Caja la cuenta.',
    // El texto del reclamo NO lo escribe Claude: es el mismo del botón "Reclamar cuenta" de la app (scripts/reclamos-del-dia.mjs).
    // Claude decide a quién SÍ y a quién no, y escribe la lista del día de Flor.
    completar: () => {
      const r = JSON.parse(execFileSync('node', ['scripts/reclamos-del-dia.mjs', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
      return b => { const x = r.find(x => x.agencia === b.cliente); return x && x.to ? { ...b, monto: x.total, to: x.to, subject: x.subject, text: x.text } : null }
    },
    prompt: `Hoy es ${hoy}. Corrés solo, programado. Lo que devuelvas le llega por mail a Flor, que hace la administración de Magma desde admin@somosmagma.com. No preguntes nada.

1. Corré node scripts/caja-hoy.mjs: es la lista de tareas de hoy, en orden.
2. Corré node scripts/reclamos-del-dia.mjs --json: son los reclamos ya armados, uno por agencia (no los reescribas).
3. Para cada agencia de los reclamos, fijate si ya hubo contacto por cobro en los últimos 4 días, con el dominio del mail del reclamo (ej: @adnsa.com.ar):
   node scripts/gmail-leer.mjs admin@somosmagma.com 5 "<dominio> newer_than:4d"
   node scripts/gmail-leer.mjs juan@somosmagma.com 5 "<dominio> newer_than:4d"
   Si la agencia escribió o le escribieron de Magma en esos días (sobre pagos, facturas, o una reunión de cuentas), NO va: anotala en "salteados" con el motivo concreto (quién, qué día, de qué). Si no hay nada, va a "borradores".

Armá "resumen" como la lista del día para Flor, en texto plano, máximo 15 renglones: las tareas de caja-hoy en el mismo orden, cada una con su monto y DÓNDE se hace en la app (usá tu tabla). Sin los reclamos (van aparte). Si una cuenta no alcanza, decí que es decisión de Juan. Tuteo, directo, sin saludo.

${JSON_FINAL}
{"resumen":"…","borradores":[{"cliente":"ADN"}],"salteados":[{"cliente":"…","motivo":"…"}]}`,
  },

  radar: {
    agente: 'oportunidades',
    resumenA: 'juan@somosmagma.com',
    asunto: n => `🔭 Radar de oportunidades ${hoy}: ${n} para mover`,
    herramientas: ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'Bash(node scripts/cliente.mjs:*)'],
    // No deja borradores: es un informe. Las acciones las hace Juan o pasan a comercial / prospeccion.
    formatear: r => {
      const expos = guardarExpos(r.expos || [])
      return [
        r.resumen, '',
        ...(r.oportunidades || []).flatMap((o, i) => [
          `${i + 1}. [${(o.valor || '').toUpperCase()}] ${o.titulo}`,
          `   Qué pasó: ${o.que_paso}`, `   Fuente: ${o.fuente}`,
          `   Para Magma: ${o.por_que}`, `   Cuándo: ${o.cuando}`,
          `   A quién: ${o.a_quien}${o.agencia ? ` · agencia que lo produce: ${o.agencia}` : ''}`,
          `   Acción: ${o.accion}`, '',
        ]),
        `AGENDA DE EXPOS (${expos.length}) · ordenada por hasta cuándo conviene mandar la propuesta:`,
        ...expos.map(e => `  ${e.urgente ? '⏰ ' : ''}proponer antes del ${e.proponer_antes} · ${e.nombre} · ${e.desde}${e.hasta && e.hasta !== e.desde ? '–' + e.hasta : ''} · ${e.lugar}${e.agencias ? ' · agencias: ' + e.agencias : ''}${e.expositores ? ' · exponen: ' + e.expositores : ''}${e.link ? ' · ' + e.link : ''}`),
        '', 'Si una vale, decile a Claude "movamos la N del radar" o "armemos la propuesta para <expo>".',
      ].join('\n')
    },
    cantidad: r => (r.oportunidades || []).length,
    prompt: `Hoy es ${hoy}. Corrés solo, programado: lo que devuelvas le llega a Juan por mail. No preguntes nada.
Hacé tu radar completo siguiendo tus instrucciones (fuentes, cruce con el sheet, no repetir lo de radares anteriores).

${JSON_FINAL}
{"resumen":"2 líneas: lo más importante de esta vuelta","oportunidades":[{"valor":"alto|medio|bajo","titulo":"…","que_paso":"…","fuente":"medio · fecha de la nota · link","por_que":"…","cuando":"…","a_quien":"…","agencia":"agencia que lo produce, o 'sin confirmar'","accion":"…"}],"expos":[{"nombre":"…","desde":"DD/MM/AAAA","hasta":"DD/MM/AAAA","lugar":"…","organizador":"…","link":"…","expositores":"marcas","agencias":"agencias que arman stands, o vacío","proponer_antes":"DD/MM/AAAA"}]}`,
  },
}

const tarea = TAREAS[TAREA]
if (!tarea) { console.log(`Uso: node scripts/programado.mjs <${Object.keys(TAREAS).join('|')}> [--escribir]`); process.exit(1) }

// Igual que la diaria: con la Mac dormida launchd corre en un despertar sin red. Esperar la red, contando intentos.
async function esperarRed(intentos = 960){
  for (let i = 0; i < intentos; i++){
    try { await lookup('api.anthropic.com'); return true } catch {}
    await new Promise(r => setTimeout(r, 15000))
  }
  return false
}

// La diaria se colgó 17 días (10/10 → 27/10) y launchd no la volvió a correr porque seguía "viva". Acá hay tope.
function correrClaude(){
  return new Promise((resolve, reject) => {
    const p = spawn('claude', ['-p', tarea.prompt, '--agent', tarea.agente, '--output-format', 'json',
      '--permission-mode', 'dontAsk', '--allowedTools', ...tarea.herramientas], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d)
    const tope = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('Claude tardó más de 25 minutos, se cortó')) }, 25 * 60 * 1000)
    p.on('close', code => { clearTimeout(tope); code === 0 ? resolve(out) : reject(new Error(`claude salió con ${code}: ${err.slice(-500)}`)) })
  })
}

function sacarJSON(texto){
  const r = JSON.parse(texto).result || ''
  const desde = r.indexOf('{'), hasta = r.lastIndexOf('}')
  if (desde < 0) throw new Error(`Claude no devolvió JSON: ${r.slice(0, 300)}`)
  return JSON.parse(r.slice(desde, hasta + 1))
}

// Si algo falla, el aviso le llega a Juan (no a Flor: ella no lo puede arreglar)
async function mandarResumen(asunto, texto, to = tarea.resumenA){
  const t = nodemailer.createTransport({ service: 'gmail', auth: { user: env.MAIL_USER, pass: env.MAIL_APP_PASSWORD } })
  await t.sendMail({ from: `Somos Magma <${env.MAIL_USER}>`, to, subject: asunto, text: texto })
}

// La agenda de expos se acumula entre corridas (el radar suma las nuevas y completa datos); se sacan las que ya pasaron.
// La lee el agente oportunidades para no reinvestigar, y sirve para armar propuestas antes de cada expo.
function guardarExpos(nuevas){
  const arch = 'scripts/.comercial/radar/expos.json'
  mkdirSync('scripts/.comercial/radar', { recursive: true })
  const clave = e => String(e.nombre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
  const fecha = s => { const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null }
  const todas = Object.fromEntries((existsSync(arch) ? JSON.parse(readFileSync(arch, 'utf8')) : []).map(e => [clave(e), e]))
  for (const e of nuevas) { const k = clave(e); if (k) todas[k] = { ...todas[k], ...Object.fromEntries(Object.entries(e).filter(([, v]) => v)) } }
  const hoy0 = new Date(); hoy0.setHours(0, 0, 0, 0)
  const vigentes = Object.values(todas).filter(e => !fecha(e.hasta || e.desde) || fecha(e.hasta || e.desde) >= hoy0)
    .sort((a, b) => (fecha(a.proponer_antes) || 9e15) - (fecha(b.proponer_antes) || 9e15))
  if (ESCRIBIR) writeFileSync(arch, JSON.stringify(vigentes, null, 2))
  return vigentes.map(e => ({ ...e, urgente: !!fecha(e.proponer_antes) && (fecha(e.proponer_antes) - hoy0) / 864e5 <= 14 }))
}

const nombre = b => [...(b.presus || []), b.cliente].filter(Boolean).join(' · ')

try {
  if (!(await esperarRed())) throw new Error('sin red después de 4 horas de espera')
  const r = sacarJSON(await correrClaude())
  const archivo = `${DIR}/${TAREA}-${new Date().toISOString().slice(0, 10)}.json`
  writeFileSync(archivo, JSON.stringify(r, null, 2))
  if (tarea.formatear){
    const texto = tarea.formatear(r)
    console.log(texto)
    if (ESCRIBIR) await mandarResumen(tarea.asunto(tarea.cantidad(r)), texto)
    log(`${ESCRIBIR ? 'OK' : 'preview'} · ${tarea.cantidad(r)} · ${archivo}`)
    process.exit(0)
  }
  const completar = tarea.completar ? tarea.completar() : b => b

  // Lo que ya tuvo borrador hace menos de N días no se repite, aunque Claude lo vuelva a proponer
  const estadoArch = `${DIR}/${TAREA}-estado.json`
  const estado = existsSync(estadoArch) ? JSON.parse(readFileSync(estadoArch, 'utf8')) : {}
  const reciente = k => estado[k] && (Date.now() - estado[k]) / 864e5 < tarea.diasSinRepetir
  const hechos = [], repetidos = [], sinMail = [...(r.sin_mail || [])]
  for (const b0 of r.borradores || []){
    const b = completar(b0)
    if (!b) { sinMail.push(b0); continue }
    if (tarea.claves(b).some(reciente)) { repetidos.push(b); continue }
    console.log(`\n── ${nombre(b)} · ${plata(b.monto)}\nDe: ${tarea.casilla} · Para: ${b.to}${b.cc ? ' · cc ' + b.cc : ''}\nAsunto: ${b.subject}\n\n${b.text}`)
    if (ESCRIBIR){
      const tmp = `${DIR}/.borrador.json`
      writeFileSync(tmp, JSON.stringify({ de: tarea.casilla, to: b.to, cc: b.cc || undefined, subject: b.subject, text: b.text, responder: b.responder || undefined }))
      execFileSync('node', ['scripts/mail-borrador.mjs', tmp, '--escribir'], { stdio: 'inherit' })
      tarea.claves(b).forEach(k => estado[k] = Date.now())
    }
    hechos.push(b)
  }
  if (ESCRIBIR) writeFileSync(estadoArch, JSON.stringify(estado, null, 2))

  const texto = [
    r.resumen, '',
    `BORRADORES EN ${tarea.casilla} (${hechos.length}) · revisalos y mandalos:`,
    ...hechos.map(b => `  ${nombre(b)} · ${plata(b.monto)} → ${b.to}`),
    '', `NO SE ESCRIBIÓ (${(r.salteados || []).length + repetidos.length}):`,
    ...(r.salteados || []).map(s => `  ${nombre(s)} · ${s.motivo}`),
    ...repetidos.map(b => `  ${nombre(b)} · ya tuvo borrador hace menos de ${tarea.diasSinRepetir} días`),
    ...(sinMail.length ? ['', 'SIN MAIL DE CONTACTO (cargalo en Contactos/agencias o llamalos):', ...sinMail.map(s => `  ${nombre(s)}`)] : []),
    '', tarea.pie,
  ].join('\n')
  console.log('\n' + texto)
  if (ESCRIBIR) await mandarResumen(tarea.asunto(hechos.length), texto)
  log(`${ESCRIBIR ? 'OK' : 'preview'} · ${hechos.length} borradores · ${archivo}`)
} catch (e) {
  console.error('❌', e.message)
  log(`ERROR ${e.message}`)
  if (ESCRIBIR) await mandarResumen(`⚠️ La tarea "${TAREA}" de hoy (${hoy}) no corrió`, `Error: ${e.message}\n\nLog: scripts/.programado/log.txt en la Mac de Juan`, 'juan@somosmagma.com').catch(() => {})
  process.exit(1)
}
