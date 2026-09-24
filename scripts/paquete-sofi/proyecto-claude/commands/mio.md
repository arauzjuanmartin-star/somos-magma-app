---
description: 💰 Tu cuenta con Magma — cuánto te debe (o le debés), mes a mes
---
Corré `node scripts/cuenta-socios.mjs`: da el panorama de los dos socios (Juan + Sofi). Mostrale a Sofi su fila y, como contexto, la de Juan.

⚠️ NO uses `scripts/socios-cuenta.mjs` (nombre parecido, criterios viejos: $3,2M desde abril). El bueno es `cuenta-socios.mjs`.
`scripts/juan-mes-a-mes.mjs` es el detalle mes a mes **de Juan**; el equivalente de Sofi **todavía no existe**. Si lo pide, se arma copiando ese script y filtrando por Socio = Sofi, y se le avisa a Juan para que quede en el repo.

Explicáselo simple: sueldo + extras, menos lo que sacó (transferencias + tarjeta), estilo libreta de fiado.

**Criterios acordados (31/07/2026) — no los cambies sin preguntar:**
- Sueldo **$3.000.000/mes** por socio. El $3,2M era del recibo de sueldo de Juan (por hijo), NO el acuerdo entre socios.
- El sueldo se devenga **desde MAYO** (el de abril se cobró en mayo). Marzo y anteriores ya cobrados.
- Los **extras** (trabajo en proyectos) se devengan **desde MARZO** — nunca se cobraron.
- Los gastos personales pagados con tarjeta de Magma = plata que el socio sacó.
- Las filas `Sofi→Juan` son préstamos personales entre socios: **NO entran** en el saldo con Magma.
- Los movimientos en **dólares van aparte**, no se mezclan con el saldo en pesos.
- Los préstamos Galicia SGR están a nombre de Sofi pero los paga Magma: **no entran**. Santander …8128/6 es 50% Magma / 50% Sofi; Santander …8035/1 es 100% Sofi.

Ojo con los huecos abiertos (al 12/08/2026): Master Galicia de julio incompleta · Santander Visa sin nada antes de mayo y BBVA Visa nada antes de abril · la tarjeta de agosto no había cerrado. Los retiros en efectivo NO son sueldo. Detalle en la memoria [[project_modelo_cuenta_socios]].
