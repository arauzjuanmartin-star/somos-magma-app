// lib/ia-diaria.mjs — el bloque "10 minutos de IA" del mail de la mañana (pedido de Juan, 24/09/2026).
// Una cosa por día, rotando por fecha, para que la mejora del "modo de avanzar" no dependa de acordarse.
// Cómo se mantiene: cuando Juan hace una, se saca de la lista (o se cambia por la siguiente); las nuevas
// se agregan al final. No escribe al sheet: es un recordatorio, no un dato del negocio.
// Va solo en el aviso de las 8 (a las 15 la diaria es "qué sigue abierto").

export const ITEMS_IA = [
  // Claude in Chrome YA está instalado (v1.0.94, chequeado el 24/09/2026): el ítem es usarlo, no instalarlo.
  { que: 'Abrí el home banking de las tres cuentas en Chrome y pedile a **Claude in Chrome** (el ícono al lado de la barra): "leeme los saldos y compará con la solapa CUENTAS de la app". Si te frena por "sitio de alto riesgo", anotalo y me lo decís.', min: 10 },
  { que: 'Autorizar **Higgsfield** en claude.ai → Conectores (ya está agregado, falta el permiso). Pedirle un mockup para el próximo presupuesto grande.', min: 5 },
  { que: 'Agregar el conector **Adobe for Creativity** en claude.ai → Conectores y probar con una foto: "recortala para Instagram y sacale el fondo".', min: 10 },
  { que: 'Bajar la prueba gratis de **Aftershoot** y correr las 79 fotos del #2297 (Santino) con el preset de Sofi. Comparar con lo que él entregó.', min: 10 },
  { que: 'Pedirle a **Jorge y Felipe** el catálogo de Lightroom (.lrcat) de los trabajos de Magma. Es un archivo chico, no los RAW. Es la base del "look Magma".', min: 5 },
  { que: 'Abrir **Cowork** en la app de escritorio de Claude, darle la carpeta de Magma y pedirle UNA cosa que hoy hacés a mano.', min: 10 },
  { que: 'Con este mail abierto, preguntarle a Claude: "¿qué sacarías o agregarías a mi diaria de hoy?". Lo que sirva, se cambia el jueves.', min: 5 },
  { que: 'Elegir la mejora del jueves en el backlog de la app (preguntale a Claude "qué toca del backlog"). Una sola.', min: 5 },
  { que: 'Preguntarle a **Sofi** qué le costó esta semana en Claude Code y anotarlo: así se ajusta su paquete.', min: 5 },
  { que: '¿Qué hiciste tres veces esta semana a mano? Decíselo a Claude y que lo automatice o lo meta en la diaria.', min: 10 },
]

// Elige el ítem del día: arranca por el primero el 24/09/2026 y avanza uno por día (cuando se termina, vuelve a empezar).
const ARRANQUE = new Date(2026, 8, 24)
export function itemDelDia(ahoraAR, items = ITEMS_IA) {
  if (!items.length) return null
  const dias = Math.max(0, Math.floor((ahoraAR - ARRANQUE) / 86400000))
  return items[dias % items.length]
}

// Markdown del bloque (lo convierte md2html en diaria-mail.mjs). Vacío si no hay ítems.
export function bloqueIA(ahoraAR, items = ITEMS_IA) {
  const it = itemDelDia(ahoraAR, items)
  if (!it) return ''
  return [
    '## 🤖 10 minutos de IA — mejorar cómo trabajamos',
    `Hoy (${it.min} min): ${it.que}`,
    'Uno por día, no más. Cuando lo hagas, decíselo a Claude para que lo saque de la lista.',
  ].join('\n')
}
