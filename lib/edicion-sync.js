// Sincroniza la solapa EDICION con PROYECTOS.
//
// Recorre los proyectos y, por cada línea de post-producción (Edit 60s, Motion,
// reels…), se asegura de que exista una fila en EDICION con ID <nro>-<slot>.
// Los datos del proyecto se refrescan siempre; lo que carga el equipo
// (estado, prioridad, plazo, notas) NUNCA se pisa.
//
// Vive en lib/ (y no adentro del endpoint) para que la usen por igual
// /api/edicion-sync y los scripts locales.

import { SLOT_PROY, MAX_SLOTS } from './slots.js'
import {
  HEADERS_EDICION, IDX_EDICION, esPedidoPost,
  fechaSugerida, aAR, parseFechaAR, hoyCero, diasEntre,
} from './edicion.js'

const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
export const ULT_COL_EDICION = colLetra(HEADERS_EDICION.length - 1)

export async function sincronizarEdicion({ sheets, SHEET_ID, desdeDias = 30, hastaDias = 180, dryRun = false }) {
  const batch = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SHEET_ID,
    ranges: ['PROYECTOS!A:ET', `EDICION!A:${ULT_COL_EDICION}`],
  })
  const proy = batch.data.valueRanges[0].values || []
  const edic = batch.data.valueRanges[1].values || []
  if (!proy.length) throw new Error('PROYECTOS vacío')
  if (!edic.length) throw new Error('Falta la solapa EDICION — correr scripts/edicion-setup.mjs --escribir')

  const hP = proy[0]
  const iNum = hP.indexOf('N° presupuesto'), iFecha = hP.indexOf('Fecha Evento')
  const iAg = hP.indexOf('Agencia'), iCli = hP.indexOf('Cliente'), iProy = hP.indexOf('Proyecto')
  const iCrudo = hP.indexOf('Drive Crudo')

  const hE = edic[0]
  const cE = n => { const i = hE.indexOf(n); return i === -1 ? IDX_EDICION[n] : i }
  const porId = new Map()
  edic.slice(1).forEach((row, i) => {
    const id = String(row[cE('ID')] || '').trim()
    if (id) porId.set(id, { row, sheetRow: i + 2 })
  })

  const hoy = hoyCero()
  const nuevas = [], updates = [], detalle = []
  let vistos = 0

  for (const r of proy.slice(1)) {
    const num = String(r[iNum] || '').trim()
    if (!num) continue
    const fEv = parseFechaAR(r[iFecha])
    if (!fEv) continue
    const d = diasEntre(fEv, hoy)          // >0 = el evento ya pasó
    if (d > desdeDias || d < -hastaDias) continue

    for (let n = 1; n <= MAX_SLOTS; n++) {
      const c = SLOT_PROY(n)
      const pedido = String(r[c.pedido] || '').trim()
      if (!pedido || !esPedidoPost(pedido)) continue
      vistos++

      const id = `${num}-${n}`
      const editorProy = String(r[c.staff] || '').trim()
      const linkCrudo = iCrudo > -1 ? String(r[iCrudo] || '').trim() : ''
      const espejo = {
        'ID': id,
        'N° presupuesto': num,
        'Fecha Evento': String(r[iFecha] || ''),
        'Agencia': String(r[iAg] || ''),
        'Cliente': String(r[iCli] || ''),
        'Proyecto': String(r[iProy] || ''),
        'Entregable': pedido,
      }

      const ya = porId.get(id)
      if (!ya) {
        const fila = new Array(HEADERS_EDICION.length).fill('')
        HEADERS_EDICION.forEach((h, i) => { if (espejo[h] !== undefined) fila[i] = espejo[h] })
        fila[IDX_EDICION['Editor']] = editorProy
        fila[IDX_EDICION['Estado']] = 'Sin material'
        fila[IDX_EDICION['Prioridad']] = 'Normal'
        fila[IDX_EDICION['Fecha compromiso']] = aAR(fechaSugerida(r[iFecha], pedido))
        fila[IDX_EDICION['Link crudo']] = linkCrudo
        fila[IDX_EDICION['Actualizado']] = new Date().toISOString()
        fila[IDX_EDICION['Por']] = 'sync'
        nuevas.push(fila)
        detalle.push(`+ ${id}  ${String(espejo.Cliente || espejo.Agencia).slice(0,20).padEnd(20)} ${pedido.padEnd(16)} ${editorProy || '(sin editor)'}`)
      } else {
        const actual = ya.row
        const nueva = new Array(HEADERS_EDICION.length).fill('')
        HEADERS_EDICION.forEach((h, i) => { nueva[i] = actual[cE(h)] ?? '' })
        let cambio = false
        HEADERS_EDICION.forEach((h, i) => {
          if (espejo[h] === undefined) return
          if (String(nueva[i] || '') !== String(espejo[h] || '')) { nueva[i] = espejo[h]; cambio = true }
        })
        if (!String(nueva[IDX_EDICION['Editor']] || '').trim() && editorProy) { nueva[IDX_EDICION['Editor']] = editorProy; cambio = true }
        if (!String(nueva[IDX_EDICION['Link crudo']] || '').trim() && linkCrudo) { nueva[IDX_EDICION['Link crudo']] = linkCrudo; cambio = true }
        if (cambio) { updates.push({ range: `EDICION!A${ya.sheetRow}:${ULT_COL_EDICION}${ya.sheetRow}`, values: [nueva] }); detalle.push(`~ ${id}  refrescado desde PROYECTOS`) }
      }
    }
  }

  if (!dryRun) {
    if (nuevas.length) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: `EDICION!A:${ULT_COL_EDICION}`,
        valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
        requestBody: { values: nuevas },
      })
    }
    if (updates.length) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
      })
    }
  }
  return { nuevas: nuevas.length, actualizadas: updates.length, vistos, detalle }
}
