// Paleta y tipografía de la app. Vive acá (y no dentro de pages/index.js) para
// que los módulos en components/ usen exactamente los mismos colores.
// Tema CLARO, un solo color de acción (Magma). Color = sentido, no decoración.

export const MONO = "'Azeret Mono', ui-monospace, monospace"

export const T = {
  bg:         '#FBFAF8',  // página, blanco cálido
  surface:    '#FFFFFF',  // cards
  surfaceAlt: '#F6F4F1',  // hover / filas alternas sutiles
  border:     '#ECE9E4',  // hairline
  ink:        '#1A1917',  // texto principal
  ink2:       '#6F6B63',  // texto secundario
  ink3:       '#A8A39A',  // muted
  brand:      '#CE2637',  // Magma — acción + atención
  brandSoft:  '#FBEAEC',
  pos:        '#1E8A5A',  // cobrado / rentable
  posSoft:    '#E7F3EC',
  warn:       '#B07712',  // en espera / por vencer
  warnSoft:   '#F8EFDC',
}
