import { useState, useEffect } from 'react'
// Paleta y tipografía de la app. Vive acá (y no dentro de pages/index.js) para
// que los módulos en components/ usen exactamente los mismos colores.
// Tema CLARO, un solo color de acción (Magma). Color = sentido, no decoración.

export const MONO = "'Azeret Mono', ui-monospace, monospace"

export const T = {
  bg:         '#FBFAF8',  // página, blanco cálido
  surface:    '#FFFFFF',  // cards
  surfaceAlt: '#F6F4F1',  // hover / filas alternas sutiles
  border:     '#ECE9E4',  // hairline
  campo:      '#CFCAC2',  // borde de un campo para completar: el hairline sobre blanco no se ve
  ink:        '#1A1917',  // texto principal
  // Los textos tienen que leerse (4,5:1 o más) sobre blanco, el fondo y las cajas de
  // color. Hasta el 25/10/2026 ink3 era #A8A39A (2,5:1) y se usaba en letra de 10-11 px;
  // warn y pos tampoco llegaban. El mínimo lo puso Sofi: nada más claro que #6B645C.
  ink2:       '#5E5A53',  // texto secundario
  ink3:       '#6B645C',  // muted
  apagado:    '#C4BFB6',  // fondo de un botón desactivado (no es texto)
  brand:      '#CE2637',  // Magma — acción + atención
  brandSoft:  '#FBEAEC',
  pos:        '#17784E',  // cobrado / rentable
  posSoft:    '#E7F3EC',
  warn:       '#8F5E0A',  // en espera / por vencer
  warnSoft:   '#F8EFDC',
}

// ---------------------------------------------------------------- celular
// La app se armó para escritorio, pero el tablero de Edición se mira desde el
// teléfono (el PM aprueba una versión entre reunión y reunión). Como los estilos
// son inline y no hay CSS, la única forma de adaptarse es medir el ancho.
// Arranca en false para que el render del servidor y el del cliente coincidan.
export function useEsCelular(corte = 760) {
  const [esCel, setEsCel] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${corte}px)`)
    const aplicar = () => setEsCel(mq.matches)
    aplicar()
    mq.addEventListener('change', aplicar)
    return () => mq.removeEventListener('change', aplicar)
  }, [corte])
  return esCel
}
