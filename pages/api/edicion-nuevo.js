// Alta a mano de una tarea de edición.
//
// Por qué existe: el sync trae UNA fila por línea de post del presupuesto, pero
// el laburo real no viene así. "Popstars: 3 videos raid", "Pani: 4 videos",
// "IVECO: cambiar la placa del video largo", "CMQ: cambios" — son tareas con
// dueño y plazo propios que no tienen línea en PROYECTOS. Sin esto la mitad de
// lo que Dani tiene que hacer no entra al tablero y vuelve a WhatsApp.
//
// El ID de las manuales lleva M: <num>-M1, <num>-M2… así el sync (que sólo
// escribe IDs <num>-<slot numérico>) nunca las pisa ni las duplica.

import { getSheets } from '../../lib/sheets'
import { requireAuth } from '../../lib/auth-helpers'
import { HEADERS_EDICION, IDX_EDICION, aAR, fechaSugerida, parseFechaAR, sumarHabiles, slaDias, hoyCero, CAMPOS_PIEZA, CAMPOS_BRIEF, limpiarPedido } from '../../lib/edicion'
import { escribirFilasAlFinal } from '../../lib/edicion-sync'
import { canonStaff } from '../../lib/staff'

const colLetra = c => { let s='', n=c+1; while(n>0){ n--; s=String.fromCharCode(65+(n%26))+s; n=Math.floor(n/26) } return s }
const ULT_COL = colLetra(HEADERS_EDICION.length - 1)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = await requireAuth(req, res)
  if (!auth) return
  const mail = auth.mail

  // `copiarDe`: el ID de una pieza hermana del mismo proyecto. "Un video más" no es
  // una tarea: es otro Edit 60s con el mismo brief, el mismo crudo y el mismo PM.
  // Se copia todo eso y el título sale solo ("Edit 60s 2") si no mandan uno.
  const {
    num = '', titulo = '', editor = '', prioridad = 'Normal',
    compromiso = '', cantidad = 1, cliente = '', agencia = '', proyecto = '', fechaEvento = '', notas = '',
    copiarDe = '',
  } = req.body || {}

  let tit = String(titulo).trim()
  if (!tit && !copiarDe) return res.status(400).json({ error: 'Falta el nombre de la tarea' })
  const n = Math.max(1, Math.min(20, parseInt(cantidad) || 1))

  try {
    const { sheets, SHEET_ID } = await getSheets()
    const batch = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: SHEET_ID,
      // Hasta ET: el PM está en la 51 y Drive Crudo más allá. Con A:AA (lo que
      // había) el indexOf daba -1 y la tarea nacía sin PM y sin link al material.
      ranges: [`EDICION!A:${ULT_COL}`, 'PROYECTOS!A:ET'],
    })
    const rows = batch.data.valueRanges[0].values || []
    const proy = batch.data.valueRanges[1].values || []
    if (!rows.length) return res.status(400).json({ error: 'Falta la solapa EDICION — correr scripts/edicion-setup.mjs --escribir' })

    const hE = rows[0]
    const cE = x => { const i = hE.indexOf(x); return i === -1 ? IDX_EDICION[x] : i }

    // Si vino un N° de presupuesto, los datos del proyecto salen de PROYECTOS
    // (no de lo que escriba el usuario): el tablero espeja al sheet, no al revés.
    const numero = String(num).trim()
    let base = { Cliente: cliente, Agencia: agencia, Proyecto: proyecto, 'Fecha Evento': fechaEvento }
    if (numero && proy.length) {
      const hP = proy[0]
      const iNum = hP.indexOf('N° presupuesto')
      const fila = proy.slice(1).find(r => String(r[iNum] || '').trim() === numero)
      if (!fila) return res.status(404).json({ error: `No encontré el proyecto #${numero} en PROYECTOS` })
      base = {
        Cliente: String(fila[hP.indexOf('Cliente')] || ''),
        Agencia: String(fila[hP.indexOf('Agencia')] || ''),
        Proyecto: String(fila[hP.indexOf('Proyecto')] || ''),
        'Fecha Evento': String(fila[hP.indexOf('Fecha Evento')] || ''),
      }
      const iCrudo = hP.indexOf('Drive Crudo')
      if (iCrudo > -1) base['Link crudo'] = String(fila[iCrudo] || '')
      const iPM = hP.indexOf('PM')
      if (iPM > -1) base['PM'] = String(fila[iPM] || '')
    }

    // La pieza hermana de la que se copia el brief (capa 1 y 2), el crudo y el PM.
    // El editor no se copia: el video nuevo puede ir a otra persona.
    const copia = {}
    let baseNombre = ''
    if (copiarDe) {
      const herm = rows.slice(1).find(r => String(r[cE('ID')] || '').trim() === String(copiarDe).trim())
      if (!herm) return res.status(404).json({ error: `No encontré la pieza ${copiarDe} para copiar` })
      ;[...CAMPOS_PIEZA.map(c => c.campo), ...CAMPOS_BRIEF.map(c => c.campo), 'Link crudo', 'PM'].forEach(k => {
        const v = String(herm[cE(k)] || '').trim(); if (v) copia[k] = v
      })
      baseNombre = limpiarPedido(herm[cE('Entregable')]).replace(/\s+\d+$/, '') || 'Video'
    }

    // Próximo sufijo M libre para este número (o para las sueltas, prefijo LIBRE)
    const clave = numero || 'LIBRE'
    let max = 0
    rows.slice(1).forEach(r => {
      const m = String(r[cE('ID')] || '').trim().match(/^(.+)-M(\d+)$/)
      if (m && m[1] === clave) max = Math.max(max, parseInt(m[2]))
    })

    // El plazo: el que puso el usuario, o el del manual desde la fecha del evento.
    //
    // Ojo con los trabajos viejos: en un evento de hace tres meses el plazo del
    // manual cae en el pasado y la tarea nace en rojo, como si ya estuviera
    // atrasada cuando recién se pide. En ese caso el plazo se cuenta desde hoy.
    // Título automático al copiar: "Edit 60s 2", "Edit 60s 3"… contando las que ya
    // hay con ese nombre en el proyecto (la del presupuesto va sin número).
    let desde = 1
    if (!tit && copiarDe) {
      const re = new RegExp('^' + baseNombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s+\\d+)?$', 'i')
      desde = rows.slice(1).filter(r => String(r[cE('N° presupuesto')] || '').trim() === clave && re.test(limpiarPedido(r[cE('Entregable')]))).length + 1
      tit = baseNombre
    }
    const nombreDe = i => (!String(titulo).trim() && copiarDe) ? `${tit} ${desde + i - 1}` : (n > 1 ? `${tit} ${i}` : tit)

    // Si el evento todavía no pasó, no hay material: el estado lo dice. Si ya
    // pasó (o es una tarea sobre algo ya filmado), el trabajo existe y arranca.
    const fEvento = parseFechaAR(base['Fecha Evento'])
    const estadoInicial = fEvento && fEvento > hoyCero() ? 'Sin material' : 'Material listo'

    let sugerida = fechaSugerida(base['Fecha Evento'], tit)
    if (!sugerida || sugerida < hoyCero()) sugerida = sumarHabiles(hoyCero(), slaDias(tit))
    const fc = String(compromiso).trim() ? aAR(parseFechaAR(compromiso)) : aAR(sugerida)

    const nuevas = []
    const ids = []
    for (let i = 1; i <= n; i++) {
      const id = `${clave}-M${max + i}`
      ids.push(id)
      // Con cantidad > 1 numeramos el título: "Video raid 1", "Video raid 2"…
      const nombre = nombreDe(i)
      const fila = new Array(HEADERS_EDICION.length).fill('')
      const set = (k, v) => { fila[cE(k)] = v ?? '' }
      Object.entries(copia).forEach(([k, v]) => set(k, v))
      set('ID', id)
      set('N° presupuesto', numero)
      set('Fecha Evento', base['Fecha Evento'])
      set('Agencia', base.Agencia)
      set('Cliente', base.Cliente)
      set('Proyecto', base.Proyecto)
      set('Entregable', nombre)
      set('Editor', canonStaff(String(editor).trim()))
      set('Estado', estadoInicial)
      set('Prioridad', prioridad)
      set('Fecha compromiso', fc)
      set('Link crudo', copia['Link crudo'] || base['Link crudo'] || '')
      set('PM', copia['PM'] || base['PM'] || '')
      set('Notas', String(notas).trim())
      set('Actualizado', new Date().toISOString())
      set('Por', mail)
      set('Origen', 'manual')
      nuevas.push(fila)
    }

    // Por fila calculada, no con append: ver escribirFilasAlFinal (el append corría columnas).
    await escribirFilasAlFinal({ sheets, SHEET_ID, filas: nuevas, filasLeidas: rows })
    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: 'LOG!A:F', valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[new Date().toISOString(), mail, 'edicion-nuevo', 'EDICION', ids.join(' '), `${n} ${copiarDe ? 'video(s) igual que ' + copiarDe : 'tarea(s)'}: ${tit}`]] },
      })
    } catch (e) {}

    res.json({ ok: true, ids, creadas: n, nombres: nuevas.map(f => f[cE('Entregable')]) })
  } catch (e) {
    console.error('edicion-nuevo:', e)
    res.status(500).json({ error: e.message })
  }
}
