// ============================ SLOTS DE SERVICIOS ============================
// Cuántos servicios (Pedido/Precio) entra un presupuesto o un proyecto, y en qué
// columna del sheet cae cada uno.
//
// Este archivo NO importa googleapis a propósito: lo usan el front (pages/index.js)
// y el back (lib/sheets.js, pages/api/*) por igual.
//
// Historia: PRESUPUESTOS cortaba en 12 slots y PROYECTOS en 20. Los servicios de más
// se guardaban en la app pero NUNCA llegaban al sheet — 6 presupuestos perdieron
// $5.932.000 de costo (el peor, #2150 Telefe, 6 líneas por $2.800.000).
// Ampliado a 40 el 2026-08-20 porque Telefe Popstars son 12 jornadas + 25 contenidos.
//
// PARA SUBIR EL TOPE: cambiar MAX_SLOTS acá, correr
//   node scripts/ampliar-slots-pedidos.mjs --escribir
// y ampliar los rangos de lectura en lib/sheets.js. Después
//   node scripts/verif-slots.mjs
// confirma que cada slot cae en la columna correcta.

export const MAX_SLOTS = 40

// PRESUPUESTOS: pares Pedido/Precio.
//   slots 1..12  → L..AI  (arranca en 11), el bloque original
//   slots 13..40 → BF..DI (arranca en 57), agregados el 2026-08-20
const PRESU_BLOQUE_2 = 57
export const SLOT_PRESU = n => n <= 12
  ? { pedido: 11 + (n-1)*2, precio: 12 + (n-1)*2 }
  : { pedido: PRESU_BLOQUE_2 + (n-13)*2, precio: PRESU_BLOQUE_2 + (n-13)*2 + 1 }

// PROYECTOS: tríos Pedido/Precio/Staff. Tres bloques por cómo fue creciendo la solapa.
//   slots 1..12  → L..AU  (arranca en 11)
//   slots 13..20 → BI..CF (arranca en 60)
//   slots 21..40 → CK..ER (arranca en 88)
const PROY_BLOQUE_2 = 60, PROY_BLOQUE_3 = 88
export const SLOT_PROY = n => {
  const base = n <= 12 ? 11 + (n-1)*3
             : n <= 20 ? PROY_BLOQUE_2 + (n-13)*3
             :           PROY_BLOQUE_3 + (n-21)*3
  return { pedido: base, precio: base + 1, staff: base + 2 }
}

// Ancho total de una fila nueva (para llenar el array antes de escribir)
export const ANCHO_PRESU = SLOT_PRESU(MAX_SLOTS).precio + 1   // 113
export const ANCHO_PROY  = SLOT_PROY(MAX_SLOTS).staff + 1     // 148
