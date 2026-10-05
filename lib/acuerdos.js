// ============================== ACUERDOS ==============================
// Las condiciones vigentes de cada acuerdo con el equipo (Lucho, Juani) viven en la
// solapa ACUERDOS del Master Magma. Este archivo las lee y las convierte en el aviso
// que ve Juan al cargar el staff: "6/10 del mes · $190.000".
//
// Por qué en el sheet y no acá: las tarifas cambian (Lucho pasó de $1.800.000 a
// $1.900.000 el 01/09) y Juan las edita en la solapa sin tocar código. Si mañana se
// suma un tercero, se agrega una fila en ACUERDOS y el aviso aparece solo.
//
// Columnas que usa: Persona · Alcance · Vale solo para · No vale para · Estado · Unidad · Precio unidad ·
//                   Mínimo x mes · Monto del mínimo · Precio extra · Desde · Hasta
//
// "Vale solo para" / "No vale para" (03/10/2026) son el Alcance dicho de forma que la app lo entienda. NO limitan a
// quién se manda a cada trabajo (Juan: "a veces necesito a uno en un lado y a otro en el otro; lo que cambia es el
// arreglo que tengo con cada uno"): dicen qué ARREGLO DE PLATA corresponde. Una persona puede tener más de uno:
// Lucho tiene el banco de jornadas (no vale para Austral) y, cuando va a Austral, lo de antes ($145.000 por cobertura,
// vale solo para Austral). Sin esto el contador le sumaba las de Austral al banco y le marcaba "extra" antes de tiempo.
// (Las columnas nacieron como "Solo cliente" / "Excluye cliente": se leen los dos nombres.)
//
// No importa googleapis: corre en el front con los datos que ya trae getAllData().

const txt = v => String(v ?? '').trim()
const nrm = s => txt(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/['’´`]/g,'').replace(/\s+/g,' ')
// El sheet guarda los montos en formato US: "$190,000.00" son ciento noventa mil.
// Mismo criterio que parseMonto() en pages/index.js — sacar $ y comas, respetar el punto.
const num = v => { if (typeof v === 'number') return v; const n = parseFloat(txt(v).replace(/[$,\s]/g,'')); return isNaN(n) ? 0 : n }
const fechaAR = s => { const p = txt(s).split('/'); if (p.length < 3) return null
  const d = +p[0], m = +p[1]; let y = +p[2]; if (y < 100) y += 2000
  return (d && m && y) ? new Date(y, m-1, d) : null }

// "Jorge Luis Chavez (Lucho)" en ACUERDOS ↔ "Jorge Luis Chavez" en PROYECTOS/RRHH.
// El nombre completo es el que matchea (así está en las 100 filas del sheet y en el
// desplegable, que sale de RRHH); el alias entre paréntesis se acepta igual por si
// alguien lo escribe a mano.
const sinAlias = s => txt(s).replace(/\s*\([^)]*\)\s*$/, '')
const aliasDe = s => { const m = txt(s).match(/\(([^)]*)\)\s*$/); return m ? m[1].trim() : '' }

// Lo que NO es jornada: la edición quedó fuera del acuerdo de Lucho y los viáticos
// son un reintegro, no trabajo. Cuentan igual media jornada que entera (criterio Juan).
// (motion, colorista y locución se suman por la misma razón: no son un día de
// rodaje. Comision/Rental/Crudos/Model/MakeUp son la lista que ya tenía Juan.)
const NO_ES_JORNADA = /edit|edici[oó]n|vi[aá]tic|traslado|combustible|peaje|estacionamiento|comision|rental|crudos|model|make ?up|motion|colorista|locuci[oó]n/i
export const esJornada = servicio => !!txt(servicio) && !NO_ES_JORNADA.test(txt(servicio))

// Lee la solapa y deja solo los acuerdos vigentes hoy (o a la fecha que se le pase).
export function acuerdosVigentes(acuerdos, hoy = new Date()) {
  return (acuerdos || []).map(a => {
    const persona = sinAlias(a['Persona'])
    if (!persona) return null
    const alias = aliasDe(a['Persona'])
    const desde = fechaAR(a['Desde']), hasta = fechaAR(a['Hasta'])
    const vigente = nrm(a['Estado']) === 'vigente' && (!desde || hoy >= desde) && (!hasta || hoy <= hasta)
    return {
      persona, alias,
      key: nrm(persona),                                    // la canónica, para indexar
      keys: [nrm(persona), alias && nrm(alias)].filter(Boolean),  // todas las que matchean
      alcance: txt(a['Alcance']),
      solo: txt(a['Vale solo para'] || a['Solo cliente']).split(',').map(nrm).filter(Boolean),
      excluye: txt(a['No vale para'] || a['Excluye cliente']).split(',').map(nrm).filter(Boolean),
      unidad: txt(a['Unidad']) || 'jornada',
      precio: num(a['Precio unidad']),
      minimo: num(a['Mínimo x mes'] || a['Minimo x mes']),
      montoMinimo: num(a['Monto del mínimo'] || a['Monto del minimo']),
      precioExtra: num(a['Precio extra']),
      desde, hasta, vigente,
    }
  }).filter(a => a && a.vigente)
}

// El monotributo que Magma paga por acuerdo. La celda "Monotributo" de ACUERDOS lo dice en texto
// ("Magma — categoría C, $66.020,12/mes"): si arranca con "Magma" y trae un monto, ese monto se le paga cada mes
// que el acuerdo rige, junto con el mínimo. Ojo: ahí el monto está escrito a la argentina (punto de miles, coma
// decimal), no en el formato US de las columnas de plata. Si cambia la categoría, se cambia el texto de la celda.
export function monotributosDelMes(acuerdos, mes, anio) {
  const ini = new Date(anio, mes - 1, 1), fin = new Date(anio, mes, 0), out = []
  ;(acuerdos || []).forEach(a => {
    const persona = sinAlias(a['Persona']), t = txt(a['Monotributo'])
    if (!persona || nrm(a['Estado']) !== 'vigente' || !/^magma/i.test(t)) return
    const m = t.match(/\$\s*([\d.]+(?:,\d{1,2})?)/); if (!m) return
    const monto = parseFloat(m[1].replace(/\./g, '').replace(',', '.')); if (!(monto > 0)) return
    const desde = fechaAR(a['Desde']), hasta = fechaAR(a['Hasta'])
    if ((desde && desde > fin) || (hasta && hasta < ini)) return
    if (!out.some(x => x.key === nrm(persona))) out.push({ persona, key: nrm(persona), monto })   // uno por persona y mes
  })
  return out
}

// ¿Este acuerdo vale para este trabajo? Se mira el Cliente y la Agencia del trabajo contra "Solo cliente" y
// "Excluye cliente" (por "contiene", sin tildes ni mayúsculas). Sin ninguna de las dos, vale para todo.
export function acuerdoAplica(ac, proyecto) {
  if (!ac) return false
  const t = nrm([proyecto?.['Cliente'], proyecto?.['Agencia']].map(txt).join(' | '))
  if ((ac.excluye || []).some(x => t.includes(x))) return false
  if ((ac.solo || []).length && !ac.solo.some(x => t.includes(x))) return false
  return true
}

// De los arreglos de UNA persona, el que corresponde a este trabajo. Gana el más específico: el que nombra a este
// cliente en "Vale solo para" antes que el general. Si tiene arreglos pero ninguno cubre este trabajo, devuelve null.
export function acuerdoPara(vigentes, key, proyecto) {
  const suyos = (vigentes || []).filter(a => a.keys.includes(key) && acuerdoAplica(a, proyecto))
  return suyos.find(a => (a.solo || []).length) || suyos[0] || null
}

// El contador de jornadas se mudó a lib/jornadas.js (jornadasDePersona / repartoDelMes):
// ahora sale para todo el staff, no solo para los que tienen acuerdo, y el número del
// formulario y el del gráfico de reparto son el mismo.

// El aviso que se muestra debajo del nombre, ya resuelto: cuántas van, cuánto vale
// ESTA y si se pasó del mínimo. `previas` son las jornadas que ya tiene en el mes
// (sheet + las líneas de arriba en el mismo formulario).
export function avisoJornada(ac, previas) {
  if (!ac) return null
  const nro = previas + 1                       // la que se está cargando
  const conMinimo = ac.minimo > 0
  const dentro = !conMinimo || nro <= ac.minimo
  const precio = dentro ? ac.precio : (ac.precioExtra || ac.precio)
  return {
    nro, precio, dentro, minimo: ac.minimo, alcance: ac.alcance,
    // "6/10 del mes" con mínimo · "7ª del mes" cuando no hay mínimo (Juani)
    contador: conMinimo ? `${nro}/${ac.minimo} del mes` : `${nro}ª del mes`,
    // El texto corto que explica el precio
    nota: !conMinimo ? 'por cobertura, sin mínimo'
        : dentro ? `dentro del mínimo de ${ac.minimo}`
        : `extra — ya cubrió las ${ac.minimo}`,
  }
}
