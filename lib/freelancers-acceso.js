// Quién puede entrar a "Mi Magma". Juan, 21/9/2026: "para que sea más seguro hagámoslo
// con su mail, por si reenvían o cualquiera tiene el link".
//
// La lista NO está escrita en el código: es la solapa RRHH. Entra quien tiene ahí su
// mail Y la columna "Acceso Mi Magma" en SÍ (el tilde de su ficha en la app): se abre
// de a uno, primero los fijos. Entra con esa cuenta de Google y ve únicamente lo suyo
// (lib/mi-magma.js). Para sacarle el acceso se destilda — y deja de ver datos en el
// momento, aunque siga con la sesión abierta, porque /api/mi vuelve a mirar RRHH en
// cada pedido.
//
// Usa googleapis: solo del lado del servidor (NextAuth y /api/mi). El middleware, que
// corre en edge, no lo importa: mira la marca `freelancer` que queda en el token.

import { getSheets } from './sheets'
import { personaPorMail } from './mi-magma'

let cache = null, cacheT = 0
const CACHE_MS = 5 * 60 * 1000   // un login no necesita RRHH al segundo; /api/mi usa datos frescos aparte

async function leerRRHH() {
  if (cache && Date.now() - cacheT < CACHE_MS) return cache
  const { sheets, SHEET_ID } = await getSheets()
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'RRHH!A:Z' })
  const rows = r.data.values || [], h = rows[0] || []
  cache = rows.slice(1).map(x => Object.fromEntries(h.map((k, i) => [k, x[i] || ''])))
  cacheT = Date.now()
  return cache
}

// La fila de RRHH de quien entra con este mail, o null si no está (o está dos veces, o dado de baja).
export async function freelancerPorMail(mail) {
  return personaPorMail(await leerRRHH(), mail)
}
