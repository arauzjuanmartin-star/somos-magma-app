// Condición de cobro de cada agencia / cliente: la regla de resguardo que la app aplica al APROBAR.
// Vive en AGENCIAS y CLIENTES, columna "Condición de cobro" (scripts/condicion-cobro-columnas.mjs).
// Juan y Sofi, 07/10/2026, después de CeraVe #2355: la seña del 30 % se decidía en el momento, cliente
// por cliente, según el día. Ahora se decide una vez y queda escrita. Vacío = Seña 30%.
export const COL_CONDICION = 'Condición de cobro'
export const CONDICIONES = ['Seña 30%', 'OC', 'OC después', 'Cuenta corriente']
// Con estas dos la app aprueba sin pedir nada (y anota la condición en el presupuesto, para que se vea que fue decisión)
export const SIN_PEDIR = ['OC después', 'Cuenta corriente']

const norm = s => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// La condición que rige un presupuesto: primero la agencia (es quien paga), después el cliente. '' = no cargada.
// `agencias` y `clientes` son las filas como las entrega getAllData (objetos por título de columna).
export function condicionDe(presu, agencias = [], clientes = []) {
  const ag = norm(presu?.['Agencia']), cl = norm(presu?.['Cliente'])
  const a = ag && agencias.find(x => norm(x?.['Nombre']) === ag)
  if (a && String(a[COL_CONDICION] || '').trim()) return String(a[COL_CONDICION]).trim()
  const c = cl && clientes.find(x => norm(x?.['Nombre']) === cl)
  if (c && String(c[COL_CONDICION] || '').trim()) return String(c[COL_CONDICION]).trim()
  return ''
}
export const sinPedir = condicion => SIN_PEDIR.some(x => norm(x) === norm(condicion))
export const esOC = condicion => norm(condicion) === 'oc'
