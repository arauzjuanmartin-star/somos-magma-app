# Logos de clientes, marcas y agencias

Para el muro de logos de la Ficha de Servicios y de la web.

## Qué hay acá

| Carpeta | Qué es |
|---|---|
| `MARCAS/` (20) | Marcas y clientes finales — los que reconoce cualquiera |
| `MARCAS-extras/` (11) | Marcas de repuesto (menos plata, algunas con más pegada) |
| `AGENCIAS/` (6) | Productoras y agencias que nos contratan |
| `originales/` | Todos sin recortar, a tamaño completo, para el diseñador |

Los de las 3 primeras carpetas son PNG 800×400, fondo transparente, mismo lienzo:
entran parejos en una grilla sin retocar nada.

## Por qué separados

Marcas finales y agencias van en muros distintos. Entre las agencias se conocen,
así que ese muro es la prueba más fuerte para venderle a otra agencia.

## Criterio del orden

Facturación acumulada real en PROYECTOS 2026 + HISTORICO_2023/2024/2025, sumando todas
las líneas de cada marca (ej: Santander incluye Expoagro, Yatch y Mozarteum).

## De dónde salen

Logos oficiales vía **Wikimedia Commons** (propiedad "logo image" de Wikidata), renderizados
de SVG a PNG transparente. Los de agencias salen del sitio de cada una — esos son de menor resolución.

## Faltan (hay que pedirlos)

Estas 8 agencias no publican el logo como archivo en su web. Son plata grande:
Oir Comunicaciones ($52,6M) · Pop Up ($50,4M) · Minita ($49,5M) · Stadium ($46,7M) ·
Infinity Midia ($27,8M) · Pocho ($15,7M) · Grupo NG ($10,8M) · Velvet ($7,1M).

De Ostara y The Bloom tenemos el isotipo, falta el logo completo.

## Quedaron afuera

Google (no se puede mostrar) · Citroën y Peugeot (solo hay versiones viejas en fuente confiable) ·
Comafi, AFA, Stella Artois, Visa y Movistar Arena (decisión de Juan).

## Ojo

Adidas, Endeavor, CASE IH e Iveco son de tinta oscura: **desaparecen sobre el negro #090909
de la marca**. El muro va sobre blanco.

## Regenerar

    node scripts/logos-clientes.mjs     # baja los logos de marcas
    node scripts/logos-a-drive.mjs      # los sube a MARKETING en Drive
