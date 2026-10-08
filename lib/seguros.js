// ============================ PEDIDO DE SEGURO ============================
// Antes de un rodaje hay que pedirle a La Segunda (productor Francisco Mansilla, ag. 4418;
// el día a día lo llevan Álvaro De Giovanetti y Valentina Rebora) el certificado de
// Accidentes Personales con la nómina de quienes van. Hasta el 08/10/2026 ese mail se
// escribía a mano cada vez (Juan el 06/10: "Les pido seguro para estas 2 personas", con
// nombre, DNI, nacimiento y nacionalidad) y no quedaba en ningún lado a quién se aseguró
// para qué trabajo. Acá viven el texto del mail y los datos de cada persona; el envío y el
// registro (solapa SEGUROS, una fila por persona y pedido) están en pages/api/seguro-pedir.js.
// Sin googleapis a propósito: lo usan el front (pages/index.js) y el back por igual.

// A quién se le pide por defecto. La app propone lo último que se usó (SEGUROS → "Enviado a")
// y recién si no hay nada, esto.
export const BROKER_MAILS = ['adm.fmansilla@gmail.com', 'Fmansilla@lasegunda.com.ar']
export const HOJA_SEGUROS = 'SEGUROS'
// Lo que exigen para el seguro (cláusula de no repetición a favor de tal razón social y CUIT,
// monto, papeles) depende de DÓNDE se graba, no del cliente (Juan, 08/10/2026: "hay muchos
// que es la única vez y otros se repiten"). No hay tabla aparte: el PM pega lo que le mandaron
// al pedir el seguro, queda guardado en esa fila de SEGUROS (columnas Lugar y Requisitos), y la
// próxima vez en el mismo lugar sale precargado. Ver requisitosSugeridos.

// [título, ancho px, qué va] — una fila por persona y pedido. Lo crea scripts/seguros-setup.mjs.
export const COLS_SEGUROS = [
  ['Fecha pedido',   100, 'el día que salió el mail'],
  ['N° Presupuesto', 100, 'el trabajo'],
  ['Fecha evento',   100, 'el primer día del trabajo'],
  ['Vigencia',       200, 'para cuándo se pidió ("el sábado 10/10/2026", "todo octubre 2026")'],
  ['Cliente',        140, ''],
  ['Agencia',        140, ''],
  ['Proyecto',       240, ''],
  ['Lugar',          220, 'dónde es el evento (la llave para que la próxima vez salga precargado)'],
  ['Persona',        220, 'a quién se aseguró'],
  ['DNI',             95, ''],
  ['Nacimiento',      95, ''],
  ['Nacionalidad',    95, ''],
  ['Requisitos',     260, 'lo que piden en ese lugar (cláusula de no repetición, monto, papeles)'],
  ['Enviado a',      260, 'los mails del productor'],
  ['Enviado por',    190, 'quién lo mandó desde la app'],
  ['Desde',          190, 'la casilla que lo mandó'],
  ['Certificado',    220, 'link al PDF que manda Álvaro (se pega a mano)'],
  ['Notas',          220, ''],
]
export const HEADERS_SEGUROS = COLS_SEGUROS.map(c => c[0])

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado']
const pad = n => String(n).padStart(2, '0')
const parseAR = s => {
  const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!m) return null
  let y = +m[3]; if (y < 100) y += 2000
  const d = new Date(y, +m[2] - 1, +m[1])
  return isNaN(d) ? null : d
}
// "sábado 10/10" — para el asunto, como lo escribía Juan ("Seguro Jueves 8-10")
export const fechaCorta = s => { const d = parseAR(s); return d ? `${DIAS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}` : String(s || '') }
// "sábado 10/10/2026"
export const fechaLargaSeguro = s => { const d = parseAR(s); return d ? `${DIAS[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : String(s || '') }

// Los datos que pide el productor, sacados de la fila de RRHH de esa persona.
// `faltan` = lo que hay que completar antes de mandar (se completa en la pantalla y va a RRHH).
export function datosSeguro(nombre, rrhhRow) {
  const r = rrhhRow || {}
  const d = {
    nombre: String(r['Nombre Apellido'] || r['Nombre'] || nombre || '').trim(),
    dni: String(r['Dni'] || r['DNI'] || '').replace(/\D/g, ''),
    nacimiento: String(r['Fecha de nac'] || r['Fecha de Nac'] || '').trim(),
    nacionalidad: String(r['Nacionalidad'] || '').trim(),
    enRRHH: !!rrhhRow,
  }
  d.faltan = [!d.dni && 'DNI', !d.nacimiento && 'fecha de nacimiento'].filter(Boolean)
  return d
}

// Para cuándo se pide, dicho como lo diría uno: "el sábado 10/10/2026" · "del 10/10/2026 al
// 12/10/2026" · "los días 3/9/2026, 4/9/2026 y 5/9/2026" · "todo octubre 2026" (fechas sin confirmar:
// se asegura el mes entero, como pidió Sol el 02/10/2026 para Telefe).
export function vigenciaSugerida(fechas, tipo) {
  const l = (fechas || []).map(x => String(x || '').trim()).filter(Boolean)
  if (!l.length) return ''
  const t = String(tipo || '').toLowerCase().trim()
  if (t === 'tentativa') { const d = parseAR(l[0]); return d ? `todo ${MESES[d.getMonth()]} ${d.getFullYear()}` : l.join(', ') }
  if (l.length === 1) return `el ${fechaLargaSeguro(l[0])}`
  if (t === 'rango') return `del ${l[0]} al ${l[l.length - 1]}`
  return `los días ${l.slice(0, -1).join(', ')} y ${l[l.length - 1]}`
}

const normLugar = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
// "Hipólito Bouchard 4191, Munro" y "Bouchard 4191" son el mismo lugar: iguales, uno contiene al
// otro, o mismo número de calle con una palabra en común.
export function mismoLugar(a, b) {
  const x = normLugar(a), y = normLugar(b)
  if (!x || !y) return false
  if (x === y || x.includes(y) || y.includes(x)) return true
  const nx = x.match(/\d{2,5}/g) || [], ny = y.match(/\d{2,5}/g) || []
  if (!nx.some(n => ny.includes(n))) return false
  const px = new Set(x.split(' ').filter(w => w.length >= 4))
  return y.split(' ').filter(w => w.length >= 4).some(w => px.has(w))
}
// Qué proponer en "lo que piden": lo último que se cargó para ese lugar; si el lugar es nuevo pero
// el cliente ya pidió algo antes, eso. Devuelve {texto, fuente} (fuente = de dónde salió, para decirlo).
export function requisitosSugeridos(seguros, { lugar, cliente }) {
  const filas = (seguros || []).filter(r => String(r['Requisitos'] || '').trim())
  const ult = l => (l.length ? l[l.length - 1] : null)
  const ref = r => `#${String(r['N° Presupuesto'] || '').trim()}, ${String(r['Fecha pedido'] || '').trim()}`
  const porLugar = ult(filas.filter(r => mismoLugar(r['Lugar'], lugar)))
  if (porLugar) return { texto: String(porLugar['Requisitos']).trim(), fuente: `la última vez en ${String(porLugar['Lugar']).trim()} (${ref(porLugar)})` }
  const n = normLugar(cliente)
  const porCliente = n ? ult(filas.filter(r => normLugar(r['Cliente']) === n)) : null
  if (porCliente) return { texto: String(porCliente['Requisitos']).trim(), fuente: `la última vez para ${String(porCliente['Cliente']).trim()} (${ref(porCliente)}${String(porCliente['Lugar'] || '').trim() ? ', en ' + String(porCliente['Lugar']).trim() : ''})` }
  return { texto: '', fuente: '' }
}
// Los lugares que ya se usaron, para elegir el mismo y que la próxima matchee
export const lugaresConocidos = seguros => [...new Set((seguros || []).map(r => String(r['Lugar'] || '').trim()).filter(Boolean))]

/**
 * El mail al productor. Mismo formato que mandaba Juan a mano (06/10/2026), con el trabajo y
 * el lugar arriba para que el certificado salga con la fecha correcta.
 * @param personas  [{nombre, dni, nacimiento, nacionalidad}]
 * @param trabajo   {cliente, agencia, proyecto, fechas:[dd/mm/yyyy], lugar}
 * @returns {asunto, cuerpo}
 */
export function armarMailSeguro({ personas = [], trabajo = {}, vigencia = '', requisitos = '', firma = '' }) {
  const cliente = String(trabajo.cliente || trabajo.agencia || '').trim()
  const proyecto = String(trabajo.proyecto || '').trim()
  const lugar = String(trabajo.lugar || '').trim()
  const titulo = [cliente, proyecto].filter(Boolean).join(' · ')
  const n = personas.length
  const L = ['Buenas, cómo andan?', '']
  L.push(`Les pido seguro de accidentes personales para ${n === 1 ? 'esta persona' : `estas ${n} personas`}${vigencia ? `, ${vigencia}` : ''}${titulo ? ` (${titulo}${lugar ? `, ${lugar}` : ''})` : ''}.`, '')
  personas.forEach(p => {
    L.push(String(p.nombre || '').trim())
    L.push(`DNI ${p.dni || '(a confirmar)'}`)
    L.push(`Nacimiento ${p.nacimiento || '(a confirmar)'}`)
    L.push(`Nacionalidad ${p.nacionalidad || 'Argentino'}`)
    L.push('')
  })
  if (String(requisitos || '').trim()) L.push(String(requisitos).trim(), '')
  L.push('Gracias!', ...(firma ? [firma] : []), 'Somos Magma')
  const fechas = (trabajo.fechas || []).filter(Boolean)
  const cuando = fechas.length === 1 ? fechaCorta(fechas[0]) : (vigencia || '')
  return { asunto: ['Seguro ' + cuando, titulo].filter(x => String(x).trim()).join(' · ').replace(/\s+/g, ' ').trim(), cuerpo: L.join('\n') }
}
