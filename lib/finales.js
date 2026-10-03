// ============================ EL VIDEO ENTREGADO, PARA EL QUE LO FILMÓ ============================
// Juan, 03/10/2026: "cuando el cliente da el ok final ellos tienen que poder ver el video entregado".
//
// Dos partes: el LINK (lo muestra Mi Magma en "Cómo quedó" cuando la pieza está Terminada: el "Link entrega" de la
// pieza, o la carpeta Finales del proyecto) y el PERMISO, porque la carpeta vive en la unidad ENTREGAS y sin permiso
// el link no abre. Cuando una pieza pasa a Terminado, a cada persona del staff de ese trabajo se le da lectura sobre
// Finales (con el mail de RRHH). Lectura, no edición: es para mirar, no para tocar la entrega.
//
// Lo llama /api/edicion-guardar al cerrar una pieza, y scripts/finales-dar-acceso.mjs para lo ya entregado.

import { compartirCarpeta } from './drive.js'
import { lineasDeProyecto } from './jornadas.js'
import { canonStaff, canonKey } from './staff.js'

const txt = v => String(v ?? '').trim()
const norm = s => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** El id de carpeta o archivo de un link de Drive, o '' si no es de Drive. */
export const idDeLink = l => { const m = txt(l).match(/\/folders\/([\w-]+)|\/d\/([\w-]+)|[?&]id=([\w-]+)/); return m ? (m[1] || m[2] || m[3]) : '' }

/** Los mails de las personas que fueron a filmar (o editaron) ese trabajo, según RRHH. */
export function mailsDelStaff(proyecto, rrhh) {
  const porKey = {}
  for (const r of (rrhh || [])) { const k = canonKey(canonStaff(txt(r['Nombre Apellido'] || r.Nombre))); if (k && /@/.test(txt(r.Mail))) porKey[k] = norm(r.Mail) }
  const con = new Map(), sin = []
  for (const l of lineasDeProyecto(proyecto)) {
    if (porKey[l.key]) con.set(l.key, { nombre: l.nombre, mail: porKey[l.key] })
    else if (!sin.includes(l.nombre)) sin.push(l.nombre)
  }
  return { con: [...con.values()], sin }
}

/**
 * Da lectura sobre la carpeta Finales del proyecto a todo su staff.
 * @returns { carpeta, ok: [mails], fallo: [{mail, error}], sinMail: [nombres] } — o { sinCarpeta: true } si el proyecto no tiene Drive Finales.
 */
export async function darFinalesAlStaff({ proyecto, rrhh, dryRun = false }) {
  const carpeta = idDeLink(proyecto?.['Drive Finales'])
  if (!carpeta) return { sinCarpeta: true, ok: [], fallo: [], sinMail: [] }
  const { con, sin } = mailsDelStaff(proyecto, rrhh)
  if (dryRun) return { carpeta, ok: con.map(x => x.mail), fallo: [], sinMail: sin, dryRun: true }
  const r = con.length ? await compartirCarpeta(carpeta, con.map(x => x.mail), 'reader') : { ok: [], fallo: [] }
  return { carpeta, ok: r.ok, fallo: r.fallo, sinMail: sin }
}
