// Quién ve qué. Archivo PURO (sin imports) porque lo usan por igual el
// middleware (edge runtime), NextAuth y los endpoints.
//
// modulos = null  → ve toda la app
// modulos = [...] → solo esos módulos, y solo sus páginas y endpoints

export const MODULOS_POR_MAIL = {
  'dani@somosmagma.com': ['edicion', 'calendario'],
}

// Páginas que puede abrir un usuario de acceso parcial. Todo lo demás
// (/v1, /semana, /presupuesto…) le redirige a la home, donde solo ve sus módulos.
export const PAGINAS_PARCIALES = ['/']

export const modulosDe = mail => MODULOS_POR_MAIL[String(mail || '').toLowerCase().trim()] || null
