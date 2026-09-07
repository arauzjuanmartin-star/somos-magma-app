// Quién ve qué. Archivo PURO (sin imports) porque lo usan por igual el
// middleware (edge runtime), NextAuth y los endpoints.
//
// modulos = null  → ve toda la app
// modulos = [...] → solo esos módulos, y solo sus páginas y endpoints

export const MODULOS_POR_MAIL = {
  'dani@somosmagma.com': ['edicion', 'calendario'],
  // Freelancers de edición: entran solo al tablero y solo a lo suyo.
  'barcevarela@gmail.com': ['edicion'],
}

// Quién ve SOLO los trabajos que tiene asignados.
//
// Dani y Lulu ven todo el tablero porque coordinan. Un freelancer que edita una
// cuenta no: ve lo suyo cuando se lo asignan, y nada del resto de los clientes.
// El nombre tiene que ser el mismo que figura en el campo Editor del tablero,
// que sale del staff de PROYECTOS y de RRHH.
//
// El recorte NO es visual: /api/data le manda solo sus filas. Si filtráramos en
// el front, alcanzaría con abrir la respuesta en el navegador para ver el resto.
export const SOLO_LO_SUYO = {
  'barcevarela@gmail.com': 'Bruno Arce',
}
export const soloLoSuyoDe = mail => SOLO_LO_SUYO[String(mail || '').toLowerCase().trim()] || null

// Páginas que puede abrir un usuario de acceso parcial. Todo lo demás
// (/v1, /semana, /presupuesto…) le redirige a la home, donde solo ve sus módulos.
export const PAGINAS_PARCIALES = ['/']

export const modulosDe = mail => MODULOS_POR_MAIL[String(mail || '').toLowerCase().trim()] || null

// Cómo se llama cada uno en el sheet vs. cuál es su mail.
//
// En PROYECTOS el PM va con el nombre corto ("Juan", "Sofi", "Lulu", "Tomi") y en
// RRHH con el nombre completo ("Juan Martin Arauz", "Lucía María Grenier
// Basavilbaso"). Buscando por nombre no se encuentra nunca, así que los avisos del
// tablero terminaban todos en el mismo mail. Son cinco personas y el archivo donde
// vive el equipo interno ya es este.
export const MAIL_INTERNO = {
  juan: 'juan@somosmagma.com',
  sofi: 'sofi@somosmagma.com',
  lulu: 'lulu@somosmagma.com',
  tomi: 'tom@somosmagma.com',
  tom: 'tom@somosmagma.com',
  dani: 'dani@somosmagma.com',
}
export const mailInternoDe = n => MAIL_INTERNO[String(n || '').trim().toLowerCase()] || ''
