// ============================ DESGLOSE DE PRECIO POR ÍTEM ============================
// Abre el precio final de un presupuesto en una línea por servicio, para cuando el
// cliente pide saber "cuánto sale cada cosa". Lo usan el PDF (pages/presupuesto.js)
// y el modal de aprobación (pages/index.js), así que acá no se importa googleapis:
// entra y sale la fila del presu tal como la devuelve /api/data.
//
// La cadena de cada ítem es la misma que arma el total del presu:
//   costo del operador + margen Magma (× MULT_MARGEN) + 35% Ganancias + 4% IIBB sobre el margen
// Como todo es lineal, la suma de las líneas da el total exacto. Nunca sale un PDF
// donde los renglones no cierran con el número de abajo — eso mata la venta.
//
// Dos cosas que NO son obvias:
//
// 1. El redondeo y el descuento (la columna Ajuste) NO son un ítem: se reparten
//    proporcionales entre las líneas y el sobrante de centavos se lo come la línea
//    más cara. Por eso la suma da el total redondo que el cliente ya vio.
//
// 2. Los ítems sin margen (viáticos, rental, catering: los que van con el tilde "Fee"
//    apagado) saldrían a costo pelado y el cliente vería exactamente lo que pagamos.
//    Les damos un markup chico (MARKUP_SIN_FEE) y esa plata se descuenta de los ítems
//    con margen. El total no se mueve un peso — sólo cambia cómo se ve repartido.
//    Decidido con Juan el 07/09/2026.

import { MAX_SLOTS } from './slots.js'

// Margen Magma = costo del staff × este multiplicador. Tiene que ser el MISMO número
// que MULT_MARGEN en pages/index.js: si se desincronizan, el desglose no cierra con el
// total del presu y el escalado final lo tapa sin avisar.
export const MULT_MARGEN = 1.086
export const MARKUP_SIN_FEE = 1.15
// Techo de seguridad: lo que se les da a los ítems sin fee nunca puede comerse más de
// la mitad del margen de los ítems que sí lo tienen (un rental grande en un presu chico
// dejaría las jornadas casi a costo).
const MAX_MORDIDA = 0.5

// Parsea formatos AR ($1.234,56) y US ($1,234.56). El Master guarda en US.
const parseMonto = v => {
  const s = String(v == null ? '' : v).replace(/[\s$]/g, '')
  if (s.includes(',') && s.includes('.')) {
    return s.lastIndexOf(',') > s.lastIndexOf('.')
      ? Number(s.replace(/\./g, '').replace(',', '.')) || 0
      : Number(s.replace(/,/g, '')) || 0
  }
  if (s.includes(',')) return Number(s.replace(',', '.')) || 0
  return Number(s) || 0
}

// ¿Este presupuesto se presentó con el precio abierto por ítem?
// La casilla del sheet llega como booleano por API y como "TRUE"/"VERDADERO" cuando
// se lee el valor formateado — según el idioma del Sheet. Aceptamos las dos formas.
export const presuDesglosado = p => /^(si|sí|1|true|verdadero)$/i.test(String(p?.['Desglosar'] ?? '').trim())

// Los servicios del presu, en orden, con sus flags. k = posición en los CSV
// ('Fee Servicios', 'Es Adicional', 'Precio Cliente Manual'), que están alineados
// entre sí y NO con el número de slot: cuentan sólo los slots con algo cargado.
export function itemsDePresu(p) {
  const feeCSV = String(p?.['Fee Servicios'] || '').split('|')
  const adicCSV = String(p?.['Es Adicional'] || '').split('|')
  const manualCSV = String(p?.['Precio Cliente Manual'] || '').split('|')
  const out = []
  let k = 0
  for (let i = 1; i <= MAX_SLOTS; i++) {
    const nombre = p?.['Pedido ' + i] || (i === 1 ? p?.['Pedido'] : '') || ''
    const costo = parseMonto(p?.['Precio ' + i] || (i === 1 ? p?.['Precio'] : ''))
    if (!nombre && !costo) continue
    out.push({
      k,
      slot: i,
      nombre: String(nombre).trim(),
      costo,
      // Sin CSV (presus viejos) asumimos que lleva margen: es el caso normal.
      fee: feeCSV[k] === undefined || feeCSV[k] === '' ? true : feeCSV[k] === '1',
      adicional: adicCSV[k] === '1',
      precioClienteManual: parseMonto(manualCSV[k]),
    })
    k++
  }
  return out
}

// Impuestos/plazo con los que se armó ESE presu (no los defaults de hoy).
export function opcionesDePresu(p) {
  return {
    gan: parseMonto(p?.['Impuesto a las ganancias']) > 0,
    iibb: parseMonto(p?.['IIBB']) > 0,
    interesPct: parseFloat(String(p?.['Interes %'] || '').replace(/[^\d.,-]/g, '').replace(',', '.')) || 0,
    total: parseMonto(p?.['Precio Final']),
  }
}

// El precio "de fórmula" de un ítem, antes de repartir ajuste y markup.
function brutoDe(it, { gan, iibb, interesPct }) {
  const costo = Number(it.costo) || 0
  const margen = it.fee ? costo * MULT_MARGEN : 0
  const sub = costo + margen + (gan ? margen * 0.35 : 0) + (iibb ? margen * 0.04 : 0)
  return sub * (1 + (Number(interesPct) || 0) / 100)
}

/**
 * Abre el precio en una línea por ítem.
 *
 * @param items  [{nombre, costo, fee}] — los servicios que el cliente va a ver
 * @param opts   {gan, iibb, interesPct, total}
 *               total = el precio final que ya conoce el cliente. Si viene, las líneas
 *               se escalan para sumar exactamente eso (ahí entran ajuste y redondeo).
 * @returns {lineas:[{...it, precio, sinPrecio}], total, escalado}
 */
export function desglosarPrecio(items, opts = {}) {
  const { gan = true, iibb = true, interesPct = 0, total = 0 } = opts
  const lista = (items || []).map(it => ({ ...it, costo: Number(it.costo) || 0 }))
  if (!lista.length) return { lineas: [], total: 0, escalado: 1 }

  const brutos = lista.map(it => brutoDe(it, { gan, iibb, interesPct }))

  // --- Markup para los ítems sin margen, pagado por los que sí lo tienen ---
  const idxSinFee = lista.map((it, i) => (!it.fee && it.costo > 0 ? i : -1)).filter(i => i >= 0)
  const idxConFee = lista.map((it, i) => (it.fee && it.costo > 0 ? i : -1)).filter(i => i >= 0)
  if (idxSinFee.length && idxConFee.length) {
    const margenDisponible = idxConFee.reduce((s, i) => s + (brutos[i] - lista[i].costo), 0)
    let extra = idxSinFee.reduce((s, i) => s + lista[i].costo * (MARKUP_SIN_FEE - 1), 0)
    const tope = margenDisponible * MAX_MORDIDA
    if (extra > tope) extra = Math.max(0, tope)
    if (extra > 0) {
      const costoSinFee = idxSinFee.reduce((s, i) => s + lista[i].costo, 0)
      idxSinFee.forEach(i => { brutos[i] += extra * (lista[i].costo / costoSinFee) })
      const brutoConFee = idxConFee.reduce((s, i) => s + brutos[i], 0)
      idxConFee.forEach(i => { brutos[i] -= extra * (brutos[i] / brutoConFee) })
    }
  }

  // --- Escalar al total real (acá entran el ajuste, el redondeo y el descuento) ---
  const suma = brutos.reduce((s, v) => s + v, 0)
  const objetivo = total > 0 ? total : suma
  const escalado = suma > 0 ? objetivo / suma : 1
  const precios = brutos.map(v => Math.round(v * escalado))

  // --- El redondeo de centavos se lo come la línea más cara ---
  const dif = Math.round(objetivo) - precios.reduce((s, v) => s + v, 0)
  if (dif !== 0 && precios.length) {
    let mayor = 0
    precios.forEach((v, i) => { if (v > precios[mayor]) mayor = i })
    precios[mayor] += dif
  }

  return {
    // sinPrecio = servicio escrito a mano en el generador del PDF, sin costo en el sheet.
    // Va listado pero sin número, así el desglose sigue cerrando.
    lineas: lista.map((it, i) => ({ ...it, precio: precios[i], sinPrecio: it.costo <= 0 })),
    total: Math.round(objetivo),
    escalado,
  }
}

// Junta las líneas repetidas ("2 × Media jornada") sumando el precio.
export function agruparLineas(lineas) {
  const mapa = new Map()
  for (const l of lineas || []) {
    const clave = l.nombre
    const cur = mapa.get(clave)
    if (cur) { cur.cantidad++; cur.precio += l.precio; cur.costo += l.costo }
    else mapa.set(clave, { ...l, cantidad: 1 })
  }
  return [...mapa.values()]
}

/**
 * Los totales del presu después de que el cliente eligió qué toma.
 * Sacar una línea no es sólo restarle plata al total: Subtotal, Fee Agencia, Ganancias
 * e IIBB tienen que volver a dar, o el sheet queda lleno y mintiendo (regla de oro #1).
 * Lo que no entra en la fórmula (redondeo, descuento, precio manual de un adicional)
 * cae en Ajuste, que es exactamente para lo que está esa columna.
 */
export function recalcularTotales(items, opts = {}) {
  const { gan = true, iibb = true, interesPct = 0, totalObjetivo = 0 } = opts
  const lista = items || []
  const subtotal = lista.reduce((s, it) => s + (Number(it.costo) || 0), 0)
  const fee = lista.reduce((s, it) => s + (it.fee ? (Number(it.costo) || 0) * MULT_MARGEN : 0), 0)
  const impGan = gan ? fee * 0.35 : 0
  const impIibb = iibb ? fee * 0.04 : 0
  const base = subtotal + fee + impGan + impIibb
  const interes = base * ((Number(interesPct) || 0) / 100)
  const bruto = base + interes
  const total = Math.round(totalObjetivo > 0 ? totalObjetivo : bruto)
  // El ajuste se saca contra los componentes YA REDONDEADOS, no contra el bruto con
  // decimales: si no, Subtotal+Fee+Gan+IIBB+Int+Ajuste queda $1 corto del Precio Final
  // y el presu aparece como "no cierra" en scripts/presupuestos-verificar.mjs.
  const r = { subtotal: Math.round(subtotal), fee: Math.round(fee), gan: Math.round(impGan), iibb: Math.round(impIibb), interes: Math.round(interes) }
  return { ...r, total, ajuste: total - (r.subtotal + r.fee + r.gan + r.iibb + r.interes) }
}
