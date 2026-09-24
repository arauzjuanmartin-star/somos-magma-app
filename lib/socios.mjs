// lib/socios.mjs — LA cuenta corriente de socios (Juan y Sofi contra Magma). Una sola función para todos:
//   · pages/api/socios-cuenta.js  → lo que muestra la app (Egresos → Socios)
//   · scripts/cuenta-socios.mjs   → lo mismo, por consola
//   · scripts/numeros-base.mjs    → la ficha de números que se lee antes de citar cualquier monto
// Por qué existe: el 24/09/2026 el script y la app daban distinto (el script tenía los meses fijos
// "mayo a agosto" y la app avanza sola hasta el mes en curso). Se citó el número viejo como si fuera
// el de la app. Con esto no puede volver a pasar: si cambia el criterio, se cambia ACÁ y nada más.
//
// Criterios (Juan, 31/07/2026, ampliados 02/08):
//   · sueldo $3.000.000/mes por socio, se devenga desde MAYO hasta el mes en curso
//     (el sueldo de un mes corresponde al trabajo del mes anterior, ya hecho)
//   · extras (trabajo como staff en proyectos) desde MARZO hasta el mes pasado
//   · los gastos PERSONALES pagados con tarjeta de Magma son retiro (col Descripcion = titular)
//   · los préstamos Galicia SGR no entran: están a nombre de Sofi pero los paga Magma
//   · la deuda entre socios (Sofi→Juan) va por otro lado; los dólares se listan aparte
//   · SOCIOS_MOVIMIENTOS es la fuente única: lo que se carga desde la app impacta el saldo

export const SUELDO = 3000000
export const SUELDO_DESDE = 5      // mayo
export const EXTRAS_DESDE = 3      // marzo
export const ANIO = 2026
export const RANGOS_SOCIOS = ['SOCIOS_MOVIMIENTOS', 'MOVIMIENTOS_TARJETA', 'PRESTAMOS', 'PROYECTOS']
const PED = [11,14,17,20,23,26,29,32,35,38,41,44,47,60,63,66,69,72,75,78,81]
const MESES_NOMBRE = ['', 'enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

const txt = v => String(v ?? '').trim()
const num = v => { if (typeof v === 'number') return v; const s = txt(v).replace(/[^\d.-]/g, ''); const n = parseFloat(s); return isNaN(n) ? 0 : n }
const fecha = v => { const m = txt(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (!m) return null; let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1]) }

// Hasta qué mes hay resumen cargado de cada tarjeta (MOVIMIENTOS_TARJETA: col 0 tarjeta, 1 mes, 2 año).
// El saldo de un socio SOLO vale con esta aclaración: un mes sin tarjeta cargada parece un mes bueno.
export function tarjetasCargadas(MT) {
  const ultimo = {}
  MT.slice(1).forEach(row => { if (!row || !txt(row[0])) return
    const t = txt(row[0]), a = num(row[2]), m = num(row[1]); if (!a || !m) return
    const k = a * 100 + m
    if (!ultimo[t] || k > ultimo[t].k) ultimo[t] = { k, anio: a, mes: m }
  })
  const lista = Object.entries(ultimo).map(([tarjeta, v]) => ({ tarjeta, anio: v.anio, mes: v.mes, texto: `${MESES_NOMBRE[v.mes]} ${v.anio}` }))
    .sort((a, b) => a.tarjeta.localeCompare(b.tarjeta))
  const min = lista.reduce((s, x) => !s || x.anio * 100 + x.mes < s.anio * 100 + s.mes ? x : s, null)
  return { lista, hasta: min ? min.texto : 'ninguna', hastaMes: min ? min.mes : 0, hastaAnio: min ? min.anio : 0 }
}

// valores = [SM, MT, PRE, PRO] en el orden de RANGOS_SOCIOS. hoy = Date (para tests).
export function calcularCuentaSocios([SM, MT, PRE, PRO], hoy = new Date()) {
  // el sueldo del mes en curso ya está devengado (corresponde al trabajo del mes pasado)
  const hastaSueldo = hoy.getFullYear() > ANIO ? 12 : hoy.getMonth() + 1
  const hastaExtras = hastaSueldo - 1
  const MESES = []
  for (let m = SUELDO_DESDE; m <= hastaSueldo; m++) MESES.push(m)

  // ── SOCIOS_MOVIMIENTOS: solo ARS y solo lo que pasa con Magma ──
  const recJuan = [], pusoJuan = [], recSofi = [], pusoSofi = [], usd = [], entreSocios = []
  SM.slice(1).forEach(row => { if (!row || !txt(row[0])) return
    const f = fecha(row[0]); if (!f || f.getFullYear() !== ANIO) return
    const socio = txt(row[1]), dir = txt(row[2]), concepto = txt(row[3]), monto = num(row[4])
    const moneda = txt(row[9] || 'ARS').toUpperCase()
    if (/→/.test(dir) && !/magma/i.test(dir)) { entreSocios.push({ socio, dir, concepto, monto, moneda }); return }   // va por otro lado
    if (moneda !== 'ARS') { usd.push({ socio, dir, concepto, monto }); return }
    if (f.getMonth() + 1 < SUELDO_DESDE) return
    const esJuan = /juan/i.test(socio), esSofi = /sof/i.test(socio)
    if (!esJuan && !esSofi) return
    const item = { mes: f.getMonth() + 1, concepto, monto }
    const recibe = /Magma→Socio/i.test(dir)
    if (esJuan) (recibe ? recJuan : pusoJuan).push(item)
    else        (recibe ? recSofi : pusoSofi).push(item)
  })

  // ── gastos personales con tarjeta de Magma (col 4 = titular) ──
  const tarj = { Juan: {}, Sofi: {} }
  MT.slice(1).forEach(row => { if (!row || !txt(row[0])) return
    if (!/personal/i.test(txt(row[8]))) return
    const mes = num(row[1]); if (mes < SUELDO_DESDE) return
    const tit = /sof/i.test(txt(row[4])) ? 'Sofi' : (/juan/i.test(txt(row[4])) ? 'Juan' : null)
    if (!tit) return
    tarj[tit][mes] = (tarj[tit][mes] || 0) + num(row[7])
  })

  // ── extras: trabajo de los socios como staff dentro de los proyectos ──
  const extras = { Juan: {}, Sofi: {} }
  PRO.slice(1).forEach(row => {
    const f = fecha(row[3]); if (!f || f.getFullYear() !== ANIO) return
    const mes = f.getMonth() + 1; if (mes < EXTRAS_DESDE || mes > hastaExtras) return
    PED.forEach(c => { const p = txt(row[c]); if (!p) return
      const v = num(row[c + 1]), pers = txt(row[c + 2])
      if (v <= 1 || !pers) return
      const q = /juan martin arauz/i.test(pers) ? 'Juan' : (/sofia maria grenier/i.test(pers) ? 'Sofi' : null)
      if (!q) return
      extras[q][mes] = (extras[q][mes] || 0) + v })
  })

  const armar = (nombre, recibidos, puestos) => {
    const sueldo = SUELDO * MESES.length
    const extra = Object.values(extras[nombre]).reduce((s, v) => s + v, 0)
    const rec = recibidos.reduce((s, x) => s + x.monto, 0)
    const gt = Object.values(tarj[nombre]).reduce((s, v) => s + v, 0)
    const pus = puestos.reduce((s, x) => s + x.monto, 0)
    return { nombre, sueldo, meses: MESES.length, extra, devengado: sueldo + extra,
      recibido: rec, tarjetas: gt, puso: pus, saldo: sueldo + extra - rec - gt + pus,
      extrasPorMes: extras[nombre], tarjPorMes: tarj[nombre],
      detalleRecibido: recibidos.sort((a, b) => a.mes - b.mes), detallePuso: puestos.sort((a, b) => a.mes - b.mes) }
  }
  const tarjetas = tarjetasCargadas(MT)
  return { ok: true, anio: ANIO, sueldoMensual: SUELDO,
    desdeSueldo: SUELDO_DESDE, hastaSueldo, desdeExtras: EXTRAS_DESDE, hastaExtras,
    socios: [armar('Sofi', recSofi, pusoSofi), armar('Juan', recJuan, pusoJuan)], usd, entreSocios,
    tarjetasCargadas: tarjetas, nombreMes: m => MESES_NOMBRE[m] }
}

// Una frase que resume el saldo como lo muestra la app. Para el mail, la consola y las memorias.
export const fraseSaldo = s => s.saldo >= 0
  ? `Magma le debe a ${s.nombre} $${Math.round(s.saldo).toLocaleString('es-AR')}`
  : `${s.nombre} le debe a Magma $${Math.round(-s.saldo).toLocaleString('es-AR')}`
export const nombreMes = m => MESES_NOMBRE[m] || ''
