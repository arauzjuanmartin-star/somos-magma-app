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

// "Desglosar" (DJ) va DESPUÉS del último slot: es el tilde de "el cliente ve el precio
// de cada ítem". Está acá y no suelto en el endpoint porque el día que MAX_SLOTS suba,
// la columna se corre sola y no hay que acordarse de tocar dos archivos.
export const COL_DESGLOSAR = ANCHO_PRESU                      // 113 = DJ

// Brief de edición. Se contesta AL PRESUPUESTAR, que es cuando estás hablando con el
// cliente y sabés qué video quiere; después nadie lo vuelve a preguntar. Viaja solo al
// tablero de Edición por N° de presupuesto (ver lib/edicion-sync.js).
// Van con prefijo "Ed." porque en PRESUPUESTOS un header "Clase" o "Formato" suelto no
// dice de qué está hablando.
export const COL_BRIEF_ED = COL_DESGLOSAR + 1                 // 114 = DK
export const HEADERS_BRIEF_ED = ['Ed. Clase', 'Ed. Duración', 'Ed. Formato', 'Ed. Red', 'Ed. Gráfica', 'Ed. Material']
export const ANCHO_PRESU_FILA = COL_BRIEF_ED + HEADERS_BRIEF_ED.length   // 120 (A:DP)

// Seguimiento comercial (DQ a DS). Hasta el 22/9/2026 un presupuesto "en espera" solo
// tenía la fecha en que se armó: no se distinguía "el cliente lo está viendo" de "nadie
// lo volvió a llamar". Cada vez que alguien habla con el cliente se anota acá y el
// reloj del "día 4" arranca de nuevo. La diaria lee estas tres columnas para armar
// "hoy te toca llamar".
//   Último contacto  fecha del último llamado / mensaje (la pone la app al guardar)
//   Próximo paso     qué pasó y qué sigue ("Lo están viendo · vuelvo a llamar el jueves")
//   Seguir el        fecha en que hay que volver a llamar (default: 4 días después)
export const COL_SEGUIMIENTO = ANCHO_PRESU_FILA                 // 120 = DQ
export const HEADERS_SEGUIMIENTO = ['Último contacto', 'Próximo paso', 'Seguir el']
export const ANCHO_PRESU_TOTAL = COL_SEGUIMIENTO + HEADERS_SEGUIMIENTO.length   // 123 (A:DS)
// A los cuántos días sin noticias hay que volver a llamar (acordado el 18/08/2026)
export const DIAS_SEGUIMIENTO = 4

// El PDF tal como se armó (DT). Lo que se escribe en el generador (/presupuesto):
// descripción, textos de los servicios, cláusulas, plazo, descuento… guardado como JSON
// para que al reabrir el presu —o su represupuesto, que hereda la columna— la pantalla
// no arranque de cero (24/09/2026: "cuando ponemos represupuestar el PDF se hace de 0").
// Columna técnica: nadie la edita a mano. Va al final por lo mismo que las demás.
export const COL_PDF = ANCHO_PRESU_TOTAL                        // 123 = DT
export const HEADER_PDF = 'PDF Config'
export const ANCHO_PRESU_CON_PDF = COL_PDF + 1                  // 124 (A:DT)

// ── Resguardo del cobro (DU-DW) ─────────────────────────────────────────────
// Desde el 08/10/2026 un presupuesto no se aprueba (y por lo tanto no entra a PROYECTOS
// ni al Calendar) sin la seña del 30 % cobrada o la orden de compra del cliente. Es la
// decisión de Juan y Sofi después de CeraVe #2355: 4 presupuestos, 11 piezas por 8
// cotizadas, $0 de seña y el cobro a 30 días mientras el staff se paga el 15. La seña
// era obligatoria desde el 18/08 y se cobró 0 veces en 164 facturas: la cláusula en el
// PDF no alcanzó, hace falta que la app lo trabe (pages/api/presupuesto-estado.js).
// Van al final por lo mismo que las demás: mover una columna corre los 40 slots.
//   Resguardo          "Seña" | "OC"
//   Resguardo detalle  monto de la seña (número) o N° / link de la orden de compra
//   Resguardo fecha    dd/mm/yyyy
export const COL_RESGUARDO = ANCHO_PRESU_CON_PDF                // 124 = DU
export const HEADERS_RESGUARDO = ['Resguardo', 'Resguardo detalle', 'Resguardo fecha']
export const ANCHO_PRESU_CON_RESGUARDO = COL_RESGUARDO + HEADERS_RESGUARDO.length   // 127 (A:DW)

// ── Precio visible por ítem (DX) ──────────────────────────────────────────────
// "Desglosar" (DJ) abre TODOS los renglones del PDF. Esto es lo otro que pidió el equipo el
// 08/10/2026: abrir el precio de UN ítem (los viáticos, el rental) y dejar el resto cerrado.
// Es un CSV por slot alineado con "Fee Servicios" (1 = el cliente ve el precio de esa línea).
// Con el "$" puesto en una línea, el Valor total no cambia: el renglón visible es informativo.
// La columna la crea scripts/presupuestos-columna-precio-visible.mjs.
export const COL_PRECIO_VISIBLE = ANCHO_PRESU_CON_RESGUARDO       // 127 = DX
export const HEADER_PRECIO_VISIBLE = 'Precio visible'
export const ANCHO_PRESU_CON_VISIBLE = COL_PRECIO_VISIBLE + 1     // 128 (A:DX)
