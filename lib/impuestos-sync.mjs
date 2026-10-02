/**
 * Traer a la solapa IMPUESTOS los VEP nuevos que mandó el contador. Lo corre solo el aviso de la diaria (dos veces
 * por día, desde Vercel y desde la Mac) y también scripts/impuestos-veps.mjs a mano.
 *
 * Solo AGREGA filas (los volantes que todavía no están) y, si llega un volante nuevo del mismo impuesto, período y
 * titular, deja el anterior como "NO VA". Nunca borra, y nunca marca nada como pagado: eso lo hace el extracto del
 * banco o el botón "Pagué" de Caja.
 */
import { vepsDelMail } from './impuestos-mail.mjs'
import { estadoVep, nombreVep } from './impuestos.mjs'

export const HOJA_IMPUESTOS = 'IMPUESTOS'
// El orden en que se crea la solapa. La app lee y escribe por nombre de título, no por posición.
export const HEADERS_IMPUESTOS = ['Titular', 'Impuesto', 'Período', 'Monto', 'Vencimiento', 'Mes', 'Pagado', 'Fecha pago', 'Cuenta pago', 'Monto pagado', 'N° VEP', 'Llegó', 'Cómo se supo', 'Notas', 'Asunto']
// La fórmula del mes mira la celda de su izquierda (Vencimiento) esté en la fila que esté: sirve igual en una fila agregada después.
export const F_MES = '=IF(INDIRECT("RC[-1]",FALSE)="","",PROPER(TEXT(INDIRECT("RC[-1]",FALSE),"mmm-yyyy")))'

const txt = v => String(v ?? '').trim()
const fechaDe = s => { const m = txt(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null }
const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
export const tripleVep = r => `${txt(r['Impuesto'])}|${txt(r['Período'])}|${txt(r['Titular'])}`

/** Un volante leído del mail → la fila de la solapa (sin pagar). */
export const filaDeVep = v => ({
  Titular: v.titular || '', Impuesto: v.impuesto || '', 'Período': v.periodo || '', Monto: v.monto || 0, Vencimiento: v.vence || v.expira || '', Pagado: 'NO',
  'Fecha pago': '', 'Cuenta pago': '', 'Monto pagado': '', 'N° VEP': v.nro || '', 'Llegó': v.llego || '', 'Cómo se supo': '',
  Notas: v.sinPdf ? 'El volante llegó como imagen: faltan el monto y el N° de VEP.' : !v.vence ? 'Diego no escribió el vencimiento en el mail: figura el día en que expira el volante, que es más tarde.' : '',
  Asunto: v.asunto || '',
})
/** El valor de una celda, listo para escribir con USER_ENTERED: los textos que el sheet podría tomar por número, fecha o fórmula van con apóstrofo. */
export const celdaImpuesto = (r, h) => h === 'Mes' ? F_MES : ['Período', 'N° VEP', 'Notas', 'Asunto', 'Cómo se supo'].includes(h) || /^[=+\-@]/.test(txt(r[h])) ? (txt(r[h]) ? `'${txt(r[h])}` : '') : (r[h] ?? '')

/** De lo que trae el mail, lo que hay que agregar: sin repetir volantes y sin los que ya están en la solapa. */
export function vepsParaAgregar(delMail, filas) {
  const porNro = new Map()
  for (const v of delMail.filter(v => !v.sinPdf)) { const p = porNro.get(v.nro); if (!p) porNro.set(v.nro, { ...v }); else if (!p.vence && v.vence) p.vence = v.vence }
  const conPdf = [...porNro.values()].map(filaDeVep)
  const sinPdf = delMail.filter(v => v.sinPdf).map(filaDeVep).filter((r, i, a) => a.findIndex(x => tripleVep(x) === tripleVep(r)) === i && !conPdf.some(p => tripleVep(p) === tripleVep(r)))
  const yaEsta = r => txt(r['N° VEP']) ? filas.some(f => txt(f['N° VEP']) === txt(r['N° VEP'])) : filas.some(f => tripleVep(f) === tripleVep(r))
  return { nuevas: [...conPdf, ...sinPdf].filter(r => !yaEsta(r)), conPdf: conPdf.length, sinPdf: sinPdf.length }
}

/**
 * Un volante nuevo reemplaza al anterior del mismo impuesto, período y titular que seguía sin pagar, pero solo en dos
 * casos: el anterior era el aviso sin volante (llegó como imagen), o el nuevo llegó como respuesta en el mismo hilo
 * ("Re: VEP IIBB Lucia 06-2026 · Va el VEP"). Dos volantes distintos del mismo mes (IIBB de dos jurisdicciones) se pagan los dos.
 * Devuelve los reemplazados (ya modificados).
 */
export function reemplazarViejos(nuevas, filas) {
  const out = []
  for (const r of nuevas.filter(r => txt(r['N° VEP']) && r.Pagado === 'NO')) {
    const esRespuesta = /^\s*(re|rv|fw|fwd)\s*:/i.test(txt(r['Asunto']))
    const viejo = [...filas, ...nuevas].find(x => x !== r && tripleVep(x) === tripleVep(r) && estadoVep(x) === 'pendiente' && txt(x['N° VEP']) !== txt(r['N° VEP']) && (!txt(x['N° VEP']) || esRespuesta) && (fechaDe(x['Llegó']) || 0) <= (fechaDe(r['Llegó']) || 0))
    if (viejo) { viejo.Pagado = 'NO VA'; viejo.Notas = `Reemplazado por el volante ${r['N° VEP']} que llegó el ${r['Llegó']}.`; out.push(viejo) }
  }
  return out
}

/**
 * @param o { sheets, SHEET_ID, user, pass, dias (cuántos días para atrás mirar el mail), dry, retry }
 * @returns { ok, nuevos: ["IVA 07-2026 Magma", …], reemplazados: […] } o { ok:false, motivo }
 */
export async function traerVepsNuevos({ sheets, SHEET_ID, user, pass, dias = 12, dry = false, retry = f => f() }) {
  let vals
  try { vals = (await retry(() => sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${HOJA_IMPUESTOS}!A:O` }))).data.values || [] } catch (e) { return { ok: false, motivo: `No existe la solapa ${HOJA_IMPUESTOS}: se crea con scripts/impuestos-veps.mjs --escribir` } }
  const H = (vals[0] || []).map(txt), faltan = HEADERS_IMPUESTOS.filter(h => !H.includes(h))
  if (faltan.length) return { ok: false, motivo: `A la solapa ${HOJA_IMPUESTOS} le faltan columnas: ${faltan.join(', ')}` }
  const filas = vals.slice(1).map((r, i) => { const o = { __row: i + 2 }; H.forEach((h, k) => { if (h) o[h] = r[k] ?? '' }); return o }).filter(r => txt(r['Impuesto']))
  // Si el mail no contesta, no se espera más de 40 segundos: quien llama (el aviso de la diaria) tiene que seguir.
  // vepsDelMail corta su conexión a los 40 s; la carrera de acá es por si ni siquiera eso la destraba.
  let reloj
  const { veps: delMail, errores } = await Promise.race([
    vepsDelMail({ user, pass, desde: new Date(Date.now() - dias * 864e5), maxMs: 40000 }),
    new Promise((_, no) => { reloj = setTimeout(() => no(new Error('el mail tardó más de 45 segundos en contestar')), 45000) }),
  ]).finally(() => clearTimeout(reloj))
  const { nuevas } = vepsParaAgregar(delMail, filas)
  const reemplazados = reemplazarViejos(nuevas, filas).filter(r => r.__row)
  if (!dry) {
    if (reemplazados.length) await retry(() => sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: 'USER_ENTERED', data: reemplazados.flatMap(r => ['Pagado', 'Notas'].map(h => ({ range: `${HOJA_IMPUESTOS}!${colLetra(H.indexOf(h))}${r.__row}`, values: [[celdaImpuesto(r, h)]] }))) } }))
    // Cada dato en la columna que lleva su título, aunque alguien las haya movido. INSERT_ROWS: sin eso Google pisa lo que haya debajo.
    if (nuevas.length) await retry(() => sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: `${HOJA_IMPUESTOS}!A:${colLetra(H.length - 1)}`, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', requestBody: { values: nuevas.map(r => H.map(h => HEADERS_IMPUESTOS.includes(h) ? celdaImpuesto(r, h) : '')) } }))
    if (nuevas.length || reemplazados.length) { try { await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), 'automático', 'impuestos-veps', HOJA_IMPUESTOS, '', `nuevos: ${nuevas.map(nombreVep).join(' | ') || '—'}${reemplazados.length ? ` · reemplazados: ${reemplazados.map(nombreVep).join(' | ')}` : ''}`.slice(0, 900)]] } }) } catch (e) { /* el log no frena */ } }
  }
  return { ok: true, dry, mirados: delMail.length, ...(errores.length ? { errores } : {}), nuevos: nuevas.map(r => `${nombreVep(r)} · $${Number(r.Monto).toLocaleString('es-AR')} · vence ${r.Vencimiento}`), reemplazados: reemplazados.map(nombreVep) }
}
