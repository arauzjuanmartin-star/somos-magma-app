// Avisos del tablero de Edición.
//
// El pedido de Juan fue "que nos mande un WhatsApp así no vivimos mirando el
// tablero". Con WhatsApp no se puede todavía: la Cloud API de Meta solo permite
// texto libre DENTRO de las 24 h desde que la persona escribió; para iniciar una
// conversación hace falta una plantilla aprobada por Meta (tarda días).
// Así que por ahora el aviso va por mail, que llega igual y no depende de nadie.
//
// Solo avisa en los tres momentos en que alguien tiene que HACER algo. Si avisa
// de más, se ignora y deja de servir.

import nodemailer from 'nodemailer'

const APP = process.env.NEXTAUTH_URL || 'https://somos-magma-app.vercel.app'

// Estado nuevo → a quién hay que avisarle y qué decirle.
const AVISOS = {
  'Material listo':      { a: 'editor', asunto: f => `Podés arrancar: ${titulo(f)}`,        cuerpo: f => `El material ya está arriba y el brief está cerrado.` },
  'Para revisar':        { a: 'pm',     asunto: f => `Para tu OK: ${titulo(f)}`,            cuerpo: f => `${f.Editor || 'El editor'} subió una versión y espera el visto bueno para mandarla al cliente.` },
  'Cambios internos':    { a: 'editor', asunto: f => `Cambios: ${titulo(f)}`,               cuerpo: f => `Te pidieron correcciones antes de mandarlo al cliente.` },
  'Cambios del cliente': { a: 'editor', asunto: f => `Cambios del cliente: ${titulo(f)}`,   cuerpo: f => `El cliente pidió correcciones.` },
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

// Devuelve {para, asunto, cuerpo} o null si ese cambio no merece aviso.
export function armarAviso({ fila, estadoNuevo, rrhh = [], mailQuienCambio = '' }) {
  const cfg = AVISOS[String(estadoNuevo || '').trim()]
  if (!cfg) return null

  let para = ''
  if (cfg.a === 'editor') para = mailDe(fila.Editor, rrhh)
  else para = String(fila.PM || '').includes('@') ? String(fila.PM).trim() : (mailDe(fila.PM, rrhh) || 'lulu@somosmagma.com')
  if (!para) return null
  // No avisarle a quien acaba de hacer el cambio.
  if (para.toLowerCase() === String(mailQuienCambio || '').toLowerCase()) return null

  const compromiso = String(fila['Fecha compromiso'] || '').trim()
  const link = fila['Link pre-entrega'] || fila['Link crudo'] || ''
  const cuerpo = [
    cfg.cuerpo(fila),
    '',
    titulo(fila),
    compromiso ? `Entrega: ${compromiso}` : '',
    link ? `Material: ${link}` : '',
    '',
    `Verlo en el tablero: ${APP}`,
  ].filter(Boolean).join('\n')

  return { para, asunto: cfg.asunto(fila), cuerpo }
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
