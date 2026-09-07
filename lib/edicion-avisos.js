// Avisos del tablero de Edición.
//
// El pedido de Juan fue "que nos mande un WhatsApp así no vivimos mirando el
// tablero". Con WhatsApp no se puede todavía: la Cloud API de Meta solo permite
// texto libre DENTRO de las 24 h desde que la persona escribió; para iniciar una
// conversación hace falta una plantilla aprobada por Meta (tarda días).
// Así que por ahora el aviso va por mail, que llega igual y no depende de nadie.
//
// Dos gatillos, un solo mail:
//   1) cambia el estado y la pelota pasa a otro (Material listo, Para revisar,
//      cambios internos o del cliente);
//   2) alguien escribe en la bitácora (nota, pregunta o respuesta).
// El (2) existe porque el caso real fue este: el trabajo YA estaba en "Cambios
// internos", Juan sumó un cambio nuevo y no salió ningún mail — el estado no
// había cambiado. Ahora la bitácora es el canal y cada nota avisa a la otra parte.
//
// Y el cuerpo va siempre completo: el pedido arriba y abajo el brief entero con
// la bitácora. Antes el mail decía una línea y había que entrar al tablero.

import nodemailer from 'nodemailer'
import { textoParaElEditor } from './edicion'
import { mailInternoDe } from './roles'

const APP = process.env.NEXTAUTH_URL || 'https://somos-magma-app.vercel.app'

// Estado nuevo → a quién hay que avisarle y qué decirle.
const AVISOS = {
  'Material listo':      { a: 'editor', asunto: f => `Podés arrancar: ${titulo(f)}`,        frase: f => `El material ya está arriba y el brief está cerrado.` },
  'Para revisar':        { a: 'pm',     asunto: f => `Para tu OK: ${titulo(f)}`,            frase: f => `${f.Editor || 'El editor'} subió una versión y espera el visto bueno para mandarla al cliente.` },
  'Cambios internos':    { a: 'editor', asunto: f => `Cambios: ${titulo(f)}`,               frase: f => `Te pidieron correcciones antes de mandarlo al cliente.` },
  'Cambios del cliente': { a: 'editor', asunto: f => `Cambios del cliente: ${titulo(f)}`,   frase: f => `El cliente pidió correcciones.` },
}

// Lo último que se escribió en la bitácora es lo que acaban de pedir. Sin esto
// el mail dice "hay cambios" y hay que entrar al tablero para saber cuáles.
const ultimaNota = f => {
  const primera = String(f.Notas || '').split('\n').map(x => x.trim()).filter(Boolean)[0]
  return primera ? primera.replace(/^\[[^\]]*\]\s*/, '') : ''
}

const titulo = f => `#${f['N° presupuesto'] || ''} ${f.Cliente || f.Agencia || ''} · ${String(f.Entregable || '').replace(/^[^\p{L}\p{N}]+/u, '').trim()}`

// El mail de una persona sale de RRHH; el del equipo interno, de su usuario.
export function mailDe(nombre, rrhh = []) {
  const n = String(nombre || '').trim().toLowerCase()
  if (!n) return ''
  if (n === 'somos magma') return ''
  const p = rrhh.find(r => String(r['Nombre Apellido'] || '').trim().toLowerCase() === n)
  const m = String(p?.Mail || '').trim()
  return /@/.test(m) ? m : ''
}

// El PM sale de PROYECTOS con el nombre corto ("Lulu"), no con el de RRHH. Si la
// fila no lo tiene (los proyectos viejos), el aviso va a Juan: mejor que le llegue
// al dueño y lo reparta, a que se pierda o le caiga siempre al mismo.
const mailDelPM = (fila, rrhh) => {
  const pm = String(fila.PM || '').trim()
  if (pm.includes('@')) return pm
  return mailInternoDe(pm) || mailDe(pm, rrhh) || 'juan@somosmagma.com'
}

// El cuerpo, siempre igual: qué pasó, qué pidieron, los links, y abajo el
// trabajo entero (ficha + brief + bitácora) para no tener que abrir nada.
function cuerpoDe({ fila, frase, pedido }) {
  const version = String(fila['Link pre-entrega'] || '').trim()
  const crudo = String(fila['Link crudo'] || '').trim()
  // El link a la app lleva el ID del trabajo: abre ese y no el tablero entero.
  // Si hay que pasar por Google primero, la app vuelve acá después de entrar.
  const enLaApp = `${APP}/?e=${encodeURIComponent(String(fila.ID || '').trim())}`

  const entrega = String(fila['Link entrega'] || '').trim()

  return [
    frase,
    pedido ? `\nLO QUE PIDIERON\n${pedido}` : '',
    // Los tres links que existan, no uno u otro: el editor necesita el crudo y
    // el que revisa necesita la versión, y muchas veces el material está en la
    // carpeta de entrega porque se cargó ahí.
    version ? `\n▶ VER LA VERSIÓN\n${version}` : '',
    crudo ? `\nMATERIAL (crudo)\n${crudo}` : '',
    entrega ? `\nCARPETA DE ENTREGA\n${entrega}` : '',
    `\nABRIRLO EN EL TABLERO\n${enLaApp}`,
    `\n\n———————————————————————\nEL TRABAJO, COMPLETO\n\n${textoParaElEditor(fila)}`,
  ].filter(Boolean).join('\n')
}

// Devuelve {para, asunto, cuerpo} o null si ese cambio no merece aviso.
export function armarAviso({ fila, estadoNuevo, rrhh = [], mailQuienCambio = '' }) {
  const cfg = AVISOS[String(estadoNuevo || '').trim()]
  if (!cfg) return null

  const para = cfg.a === 'editor' ? mailDe(fila.Editor, rrhh) : mailDelPM(fila, rrhh)
  if (!para) return null
  // No avisarle a quien acaba de hacer el cambio.
  if (para.toLowerCase() === String(mailQuienCambio || '').toLowerCase()) return null

  return {
    para,
    asunto: cfg.asunto(fila),
    cuerpo: cuerpoDe({ fila, frase: cfg.frase(fila), pedido: ultimaNota(fila) }),
  }
}

// Aviso por una nota de la bitácora. La pelota pasa a la otra parte: si escribe
// el editor le llega al PM, si escribe alguien de Magma le llega al editor.
export function armarAvisoNota({ fila, nota, rrhh = [], mailQuienEscribio = '' }) {
  const texto = String(nota || '').trim()
  if (!texto) return null

  const quien = String(mailQuienEscribio || '').toLowerCase()
  const editor = mailDe(fila.Editor, rrhh)
  const pm = mailDelPM(fila, rrhh)
  const para = (editor && editor.toLowerCase() === quien) ? pm : editor
  if (!para || para.toLowerCase() === quien) return null

  const limpio = texto.replace(/^\[[^\]]*\]\s*/, '')
  const clase = limpio.startsWith('🙋') ? 'Pregunta' : limpio.startsWith('💬') ? 'Respuesta' : 'Nota nueva'
  const frase = clase === 'Pregunta'
    ? `Te preguntaron algo de este trabajo.`
    : clase === 'Respuesta'
      ? `Te contestaron la consulta de este trabajo.`
      : `Sumaron una nota a este trabajo. El estado sigue en "${String(fila.Estado || '').trim() || 'sin estado'}".`

  return {
    para,
    asunto: `${clase}: ${titulo(fila)}`,
    cuerpo: cuerpoDe({ fila, frase, pedido: limpio.replace(/^[🙋💬✏️]\s*/, '') }),
  }
}

// Manda el aviso. Nunca tira: si el mail falla, el cambio de estado ya se guardó
// y lo último que queremos es romper el guardado por un aviso.
export async function mandarAviso(aviso) {
  if (!aviso) return { ok: false, motivo: 'sin aviso' }
  const USER = process.env.MAIL_USER, PASS = process.env.MAIL_APP_PASSWORD
  if (!USER || !PASS) return { ok: false, motivo: 'falta MAIL_USER / MAIL_APP_PASSWORD' }
  try {
    const t = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: USER, pass: PASS.replace(/\s+/g, '') } })
    await t.sendMail({ from: `Somos Magma <${USER}>`, to: aviso.para, replyTo: USER, subject: aviso.asunto, text: aviso.cuerpo })
    return { ok: true, para: aviso.para }
  } catch (e) {
    console.error('aviso edicion:', e.message)
    return { ok: false, motivo: e.message }
  }
}
