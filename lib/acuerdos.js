// ============================== ACUERDOS ==============================
// Las condiciones vigentes de cada acuerdo con el equipo (Lucho, Juani) viven en la
// solapa ACUERDOS del Master Magma. Este archivo las lee y las convierte en el aviso
// que ve Juan al cargar el staff: "6/10 del mes · $190.000".
//
// Por qué en el sheet y no acá: las tarifas cambian (Lucho pasó de $1.800.000 a
// $1.900.000 el 01/09) y Juan las edita en la solapa sin tocar código. Si mañana se
// suma un tercero, se agrega una fila en ACUERDOS y el aviso aparece solo.
//
// Columnas que usa: Persona · Alcance · Estado · Unidad · Precio unidad ·
//                   Mínimo x mes · Monto del mínimo · Precio extra · Desde · Hasta
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
      unidad: txt(a['Unidad']) || 'jornada',
      precio: num(a['Precio unidad']),
      minimo: num(a['Mínimo x mes'] || a['Minimo x mes']),
      montoMinimo: num(a['Monto del mínimo'] || a['Monto del minimo']),
      precioExtra: num(a['Precio extra']),
      desde, hasta, vigente,
    }
  }).filter(a => a && a.vigente)
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
