// Quién es, adentro del tablero de Edición, la persona que entró con este mail.
//
// Dani, 17/9/2026: "si yo quiero ver solo mi calendario, cuando seleccione la tarea
// me lleve solo a mis tareas en vez de ver todas en general de todos". Para que la
// app arranque en "lo mío" tiene que saber quién sos: el login da un mail, y el
// tablero habla de nombres (Editor = nombre completo de RRHH, PM = nombre corto).
//
// Archivo puro: lo usan el tablero y el calendario.

import { canonStaff } from './staff.js'
import { MAIL_INTERNO } from './roles.js'

const norm = s => String(s || '').trim().toLowerCase()

// { editor: 'Daniela Viviana Ayala', pms: ['dani'] }
//   editor → cómo figura en el campo Editor (nombre de RRHH)
//   pms    → cómo puede figurar en el campo PM ("Tomi" y "Tom" son tom@)
export function quienSoy(mail, rrhh = []) {
  const m = norm(mail)
  if (!m) return { editor: '', pms: [] }
  const fila = (rrhh || []).find(r => norm(r.Mail) === m)
  let editor = fila ? canonStaff(String(fila['Nombre Apellido'] || '').trim()) : ''
  // En RRHH suele estar el mail personal, no el de Magma: dani@ → "dani" → RRHH.
  if (!editor && m.endsWith('@somosmagma.com')) {
    const corto = m.split('@')[0]
    const c = canonStaff(corto)
    if (c !== corto) editor = c
  }
  return { editor, pms: Object.keys(MAIL_INTERNO).filter(k => MAIL_INTERNO[k] === m) }
}

// "Lo mío" = lo edito yo, o respondo yo como PM. Lulu es las dos cosas.
export const esMio = (f, yo) => {
  if (!yo) return false
  if (yo.editor && canonStaff(String(f.Editor || '').trim()) === yo.editor) return true
  const pm = norm(f.PM)
  return !!pm && (yo.pms || []).includes(pm)
}
