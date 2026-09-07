// Sincroniza la solapa EDICION con PROYECTOS.
//
// Recorre los proyectos y, por cada línea de post-producción (Edit 60s, Motion,
// reels…), se asegura de que exista una fila en EDICION con ID <nro>-<slot>.
// Los datos del proyecto se refrescan siempre; lo que carga el equipo
// (estado, prioridad, plazo, notas) NUNCA se pisa.
//
// Vive en lib/ (y no adentro del endpoint) para que la usen por igual
// /api/edicion-sync y los scripts locales.

import { SLOT_PROY, MAX_SLOTS, HEADERS_BRIEF_ED } from './slots.js'
import {
  HEADERS_EDICION, IDX_EDICION, esPedidoPost, ES_MAGMA,
  fechaSugerida, aAR, parseFechaAR, hoyCero, diasEntre,
} from './edicion.js'

const colLetra = c => { let s = '', n = c + 1; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) } return s }
export const ULT_COL_EDICION = colLetra(HEADERS_EDICION.length - 1)

export async function sincronizarEdicion({ sheets, SHEET_ID, desdeDias = 30, hastaDias = 180, dryRun = false }) {
  const batch = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SHEET_ID,
    ranges: ['PROYECTOS!A:ET', `EDICION!A:${ULT_COL_EDICION}`, 'PRESUPUESTOS!A:DP'],
  })
  const proy = batch.data.valueRanges[0].values || []
  const edic = batch.data.valueRanges[1].values || []
  const presu = batch.data.valueRanges[2]?.values || []

  // El brief que se contestó al presupuestar, por N° de presu. Lo que el cliente dijo
  // cuando se vendió el trabajo es lo mismo que el editor necesita saber para empezar:
  // se copia una vez y después manda lo que haya cargado el equipo en el tablero.
  const BRIEF_A_EDICION = { 'Ed. Clase': 'Clase', 'Ed. Duración': 'Duración', 'Ed. Formato': 'Formato', 'Ed. Red': 'Red', 'Ed. Gráfica': 'Gráfica', 'Ed. Material': 'Material de' }
  const briefDe = new Map()
  if (presu.length) {
    const hPr = presu[0]
    const iNumPr = hPr.indexOf('Columna 1')
    presu.slice(1).forEach(r => {
      const n = String(r[iNumPr] || '').trim()
      if (!n || briefDe.has(n)) return
      const b = {}
      HEADERS_BRIEF_ED.forEach(h => {
        const j = hPr.indexOf(h)
        const v = j > -1 ? String(r[j] || '').trim() : ''
        if (v) b[BRIEF_A_EDICION[h]] = v
      })
      if (Object.keys(b).length) briefDe.set(n, b)
    })
  }
  if (!proy.length) throw new Error('PROYECTOS vacío')
  if (!edic.length) throw new Error('Falta la solapa EDICION — correr scripts/edicion-setup.mjs --escribir')

  const hP = proy[0]
  const iNum = hP.indexOf('N° presupuesto'), iFecha = hP.indexOf('Fecha Evento')
  const iAg = hP.indexOf('Agencia'), iCli = hP.indexOf('Cliente'), iProy = hP.indexOf('Proyecto')
  const iCrudo = hP.indexOf('Drive Crudo')
  const iPM = hP.indexOf('PM')

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
      const staffProy = String(r[c.staff] || '').trim()
      // "Somos Magma" dice quién cobra, no quién edita: se guarda aparte y el
      // campo Editor queda libre para la persona que realmente lo va a hacer.
      const interno = ES_MAGMA(staffProy)
      const editorProy = interno ? '' : staffProy
      const linkCrudo = iCrudo > -1 ? String(r[iCrudo] || '').trim() : ''
      const espejo = {
        'ID': id,
        'N° presupuesto': num,
        'Fecha Evento': String(r[iFecha] || ''),
        'Agencia': String(r[iAg] || ''),
        'Cliente': String(r[iCli] || ''),
        'Proyecto': String(r[iProy] || ''),
        'Entregable': pedido,
        // El PM es quien recibe los avisos de "esto espera tu OK". Sin esto le
        // caían todos a la misma persona, fuera de quien fuera el responsable.
        'PM': iPM > -1 ? String(r[iPM] || '') : '',
        'Interno': interno ? 'Sí' : '',
      }

      const ya = porId.get(id)
      if (!ya) {
        const fila = new Array(HEADERS_EDICION.length).fill('')
        HEADERS_EDICION.forEach((h, i) => { if (espejo[h] !== undefined) fila[i] = espejo[h] })
        fila[IDX_EDICION['Editor']] = editorProy
        fila[IDX_EDICION['Estado']] = 'Sin material'
        fila[IDX_EDICION['Prioridad']] = 'Normal'
        // La fecha NO se escribe sola: la pone el PM según la prioridad real.
        // Lo que el manual sugiere se muestra en el tablero como estimación.
        fila[IDX_EDICION['Fecha compromiso']] = ''
        fila[IDX_EDICION['Link crudo']] = linkCrudo
        Object.entries(briefDe.get(num) || {}).forEach(([k, v]) => { if (IDX_EDICION[k] !== undefined) fila[IDX_EDICION[k]] = v })
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
        // El brief del presu completa lo que falte, nunca pisa: si alguien lo corrigió
        // en el tablero, esa es la versión buena.
        Object.entries(briefDe.get(num) || {}).forEach(([k, v]) => {
          const j = IDX_EDICION[k]
          if (j !== undefined && !String(nueva[j] || '').trim()) { nueva[j] = v; cambio = true }
        })
        if (!String(nueva[IDX_EDICION['Editor']] || '').trim() && editorProy) { nueva[IDX_EDICION['Editor']] = editorProy; cambio = true }
        if (!String(nueva[IDX_EDICION['Link crudo']] || '').trim() && linkCrudo) { nueva[IDX_EDICION['Link crudo']] = linkCrudo; cambio = true }
        if (cambio) { updates.push({ range: `EDICION!A${ya.sheetRow}:${ULT_COL_EDICION}${ya.sheetRow}`, values: [nueva] }); detalle.push(`~ ${id}  refrescado desde PROYECTOS`) }
      }
    }
  }

  // ---- Huérfanas: filas cuyo proyecto ya no existe en PROYECTOS ----
  // Cuando un presupuesto se elimina o se represupuesta, la app borra la fila de
  // PROYECTOS y el evento del Calendar, pero la tarea de edición quedaba colgada para
  // siempre y encima no se podía borrar desde la app. Pasó con #2199 y #2212.
  //
  // Se van SOLO las que no tienen trabajo encima: sin material, sin notas y sin links.
  // Si alguien ya empezó a editar, la fila queda y la mira una persona.
  const numsVivos = new Set(proy.slice(1).map(r => String(r[iNum] || '').trim()).filter(Boolean))
  const huerfanas = [], huerfanasConTrabajo = []
  // Si PROYECTOS viniera raro (una lectura a medias), esto borraría medio tablero.
  // Con el sheet sano son 2 de 101; más de 20 es que algo está mal y no se toca nada.
  const TOPE = 20
  if (numsVivos.size > 10) {
    edic.slice(1).forEach((row, i) => {
      const n = String(row[cE('N° presupuesto')] || '').trim()
      if (!n || numsVivos.has(n)) return
      const conTrabajo = String(row[cE('Notas')] || '').trim()
        || ['Link crudo', 'Link pre-entrega', 'Link entrega'].some(k => String(row[cE(k)] || '').trim())
        || !['Sin material', ''].includes(String(row[cE('Estado')] || '').trim())
      const info = { fila: i + 2, id: String(row[cE('ID')] || '').trim(), num: n }
      ;(conTrabajo ? huerfanasConTrabajo : huerfanas).push(info)
    })
  }
  const borrarHuerfanas = huerfanas.length && huerfanas.length <= TOPE ? huerfanas : []
  if (huerfanas.length > TOPE) detalle.push(`! ${huerfanas.length} huérfanas: son demasiadas, no se borra ninguna — revisar PROYECTOS a mano`)
  borrarHuerfanas.forEach(h => detalle.push(`- ${h.id}  huérfana (el proyecto #${h.num} ya no existe)`))
  huerfanasConTrabajo.forEach(h => detalle.push(`! ${h.id}  huérfana PERO tiene trabajo encima — queda`))

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
    // Las bajas van AL FINAL, después de escribir. Borrar una fila corre a todas las
    // de abajo, y los rangos de `updates` se calcularon con las posiciones de antes:
    // borrando primero, cada actualización iría a parar a la fila equivocada.
    if (borrarHuerfanas.length) {
      const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets(properties(title,sheetId))' })
      const sid = meta.data.sheets.find(x => x.properties.title === 'EDICION')?.properties.sheetId
      // Y de abajo hacia arriba, por lo mismo.
      const requests = borrarHuerfanas.map(h => h.fila).sort((a, b) => b - a)
        .map(f => ({ deleteDimension: { range: { sheetId: sid, dimension: 'ROWS', startIndex: f - 1, endIndex: f } } }))
      if (sid != null) await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests } })
    }
  }
  return { nuevas: nuevas.length, actualizadas: updates.length, borradas: borrarHuerfanas.length, huerfanasConTrabajo: huerfanasConTrabajo.length, vistos, detalle }
}
