# SOMOS MAGMA — contexto para Claude

**Para qué sirve este archivo:** subilo como conocimiento a un Project de Claude y cualquier chat dentro de ese Project ya sabe cómo funciona Magma. Sin esto, Claude arranca de cero cada vez.

**Cuándo se escribió:** 21 de agosto de 2026. Los montos son de esa fecha — **envejecen rápido**, ver la última sección.

---

## 1. Qué es Magma

Productora audiovisual de Buenos Aires. Socios: **Juan Martín Arauz** y **Sofía Grenier**. Cubre eventos corporativos y produce contenido para agencias y marcas: filmación, fotografía, edición, motion.

El cliente típico no es la marca final sino **la agencia o productora que organiza el evento**. Ese es el nicho decidido en julio de 2026: *"el partner audiovisual de tu agencia"*.

Escala 2026: unos **33 millones de pesos de producción por mes**, 24 eventos mensuales, más de 250 proyectos en lo que va del año.

### El equipo
| | Rol |
|---|---|
| Juan | Venta, marca, la app, lo tecnológico |
| Sofi | Día a día operativo, presentaciones, referencias, oficina |
| **Lulu** (Lucía María Grenier — **sin tilde en "Lulu"**) | PM. Cartera: Austral, Infinity/Mani King, Oir, Pop Up, Velvet, The Bloom |
| **Tom** (Tomás Halbach) | PM. Cartera: ADN, CMQ, Nodus, Meikin |
| **Dani** (Daniela Ayala) | Líder de edición |

Más unos 45 freelancers al año, de los cuales 16 trabajaron una sola vez.

---

## 2. Dónde viven los datos

Todo está en un Google Sheet, **"Master Magma 2025"**, y en una app propia (Next.js) que escribe ahí. **El equipo trabaja 100% en la app; el sheet quedó como backup y fuente histórica.**

Solapas que importan:

| Solapa | Qué tiene |
|---|---|
| **PRESUPUESTOS** | Presupuestos del año en curso, aprobados y no |
| **PROYECTOS** | Los trabajos confirmados. **Es la fuente confiable para medir plata** |
| FACTURACION | Facturas y cobros. Está subfacturada y atrasada |
| PAGOS_STAFF | Pagos a freelancers. **Está inflada y duplicada — no usar para medir costos** |
| GASTOS_FIJOS | La estructura mensual |
| RRHH, Contactos/agencias | Freelancers y clientes |
| HISTORICO_2023 / 2024 / 2025 | Años cerrados |

**Regla:** para cualquier análisis de plata se usa **PROYECTOS**, no FACTURACION ni PAGOS_STAFF.

---

## 3. Cómo se arma un precio (la regla más importante)

Partiendo de un servicio de media jornada que cuesta $220.000:

| Línea | Cálculo | Monto |
|---|---|---|
| Costo del operador (lo que cobra el freelancer) | | $220.000 |
| **Margen Magma** (en el sheet figura como "Fee Agencia") | costo × 1 | $220.000 |
| Impuesto a las Ganancias 35% **sobre el margen** | 220.000 × 0,35 | $77.000 |
| IIBB 4% **sobre el margen** | 220.000 × 0,04 | $8.800 |
| **Total sin IVA** | | **$525.800** |
| IVA 21%, siempre por fuera | | $110.418 |

**Tres cosas que se malinterpretan siempre:**

- **"Fee Agencia" es el margen de Magma**, no una comisión a una agencia externa. Magma actúa como agencia sobre sus propios freelancers.
- **Ganancias e IIBB se calculan sobre el margen, no sobre el subtotal.** Calcularlos sobre el total fue un error real que estuvo en el sistema hasta junio de 2026.
- **Cuando el "Staff" de una línea dice "Somos Magma", ese precio es ganancia pura** — no hay costo externo, lo absorbe alguien de la casa.

**El redondeo y los descuentos van todos a la columna `Ajuste`**, mezclados, sin registro de cuál fue cuál.

---

## 4. Los números de hoy (21/08/2026)

### Estructura mensual: $18.984.600
| | |
|---|---|
| Sueldos | $10.900.000 |
| Impuestos | $5.178.112 |
| Operativos | $2.906.488 |

### Punto de equilibrio
- **Margen real de Magma: 50%** — calculado como (Fee Agencia + "Somos Magma" + Diferencia) ÷ producción.
  *No usar "producción menos freelancers", que da 58%: no descuenta Ganancias ni IIBB y da un equilibrio irreal.*
- Ticket promedio de un evento: **$1.299.419**
- Para empatar hay que producir **$37,7 millones por mes = 29 eventos**
- Ritmo real: **24 eventos** → **faltan 6 por mes**

### Lo que cobra cada interno (fijo + extras, promedio de los 7 meses cerrados)
| | Fijo | Extras | Cobra |
|---|---|---|---|
| Lulu | $1.300.000 | $844.286 | **$2.144.286** |
| Tom | $1.300.000 | $307.143 | **$1.607.143** |
| Dani | $1.900.000 | $143.252 | **$2.043.252** |

**Nadie cobra solo su fijo.** Cualquier conversación de sueldo que arranque en "$1.300.000" arranca mal.

### El problema real no es la rentabilidad, es la caja
Magma **es rentable**. Lo que la ahoga es que factura a 30-90 días y les paga a los freelancers enseguida. Más de **$100 millones sin cobrar en la calle** al último corte.

Dos decisiones tomadas por eso: **seña obligatoria del 30%** al confirmar la fecha, y **plazo de 30 días** en todos los presupuestos nuevos.

---

## 5. Cómo se le paga al equipo

- **El 15 de cada mes se paga TODO el mes anterior**, por persona y de una sola vez. No trabajo por trabajo.
- Los internos combinan **sueldo fijo + extras** por producciones y ediciones. Esto es un punto de dolor conocido: se paga el fijo y encima el extra.
- **El monotributo que Magma le paga a Lulu NO es parte de su sueldo** — es porque ella le factura C a algunos clientes en nombre de la empresa. Es un costo de facturación. **Nunca usarlo como argumento en una conversación de plata con ella.**
- En Pagos_Staff, un pago de $1 a "Somos Magma" es un atajo intencional para registrar el fee. No es un error.

---

## 6. Los clientes

- **Austral** (Universidad Austral) es el cliente de mayor volumen: más de 80 proyectos al año, en general chicos y repetidos.
- **Ostara** es una agencia que trae muchas marcas distintas (Personal, Santander, Latam, Castrol, Iveco, Syngenta, Honda y una docena más).
- **Mani King** (por Infinity Midia) es un mensual fijo de $1.470.000.
- **Telefe / Popstars**: $15.000.000 a 90 días, arranca el 25/08/2026. 12 jornadas, 25 contenidos digitales, 10 semanas de acompañamiento. Es el proyecto más grande del año después de Minecraft.
- El producto más vendido es **"media jornada + edición"**, alrededor de un cuarto de la facturación.

**Dato incómodo:** hay unos **$99 millones en clientes que dejaron de comprar** y nunca se los volvió a llamar.

---

## 7. Lo fiscal

- Contador: **Diego Musco**. Manda VEPs, honorarios y balance por mail.
- Hay tres entidades que facturan: **Magma SRL**, **Sofía como responsable inscripta** y **Lucía (Lulu) monotributista**. Una parte grande de la cobranza entra por cuentas personales — es un tema abierto que hay que ordenar.
- **IIBB es un porcentaje, no un monto fijo.** Durante meses se cargó un fijo de $402.500 cuando la declaración real de junio dio $775.969.
- Hay planes de pago de AFIP en curso.
- Proceso desde junio de 2026 con la coach **Mariana Tardito** para profesionalizar: etapa 1 los números, etapa 2 el equipo y la estructura.

---

## 8. Decisiones ya tomadas (no volver a discutirlas)

1. **Nicho: agencias y productoras.** No cliente final directo.
2. **Seña del 30% obligatoria** y **plazo de 30 días** en presupuestos nuevos.
3. **Los socios salen de producción** — dejan de ir a filmar para dedicarse a vender y a la marca.
4. **Tom y Lulu se formalizan como PMs** con cartera propia: cada uno es el referente de sus cuentas, incluido el cobro.
5. **Se busca un editor full time** con prueba de 3 meses, y se evalúa pasar a un filmmaker a fijo.
6. **Seguimiento de presupuestos a los 4 días** de enviados, con fecha, canal y resultado.
7. **Marketing: primero Instagram y LinkedIn.** YouTube después.

---

## 9. Trampas de los datos (esto ahorra errores caros)

- **Los montos del sheet están en formato US**: `$764,800.00` — coma de miles, punto de decimales. Leerlos como formato argentino los divide por mil y el error pasa desapercibido porque el número sigue pareciendo plausible.
- **La columna "N° de factura" no se usa.** Cuarenta y una de las cuarenta y siete filas de Austral figuran cobradas y sin número. **"Sin factura" no indica un problema — la única señal confiable es cobrado sí/no.**
- **PAGOS_STAFF está inflada**: suma $203 millones cuando el costo real de freelancers es $75 millones. Tiene casi cien registros duplicados.
- **Hay números de presupuesto repetidos** (el #1833 aparece cuatro veces). Buscar por número trae la fila equivocada.
- **En PROYECTOS no hay fórmulas**: son todos valores pegados que escribe la app. Si un número no cierra, se cargó así.
- **El sistema registra la plata pero no el tiempo.** Solo 7 de 36 ediciones tienen días cargados. Cualquier análisis de "cuánto tiempo lleva" no se puede hacer todavía.
- Un valor que empieza con `+` (los teléfonos) Sheets lo toma como fórmula y deja la celda en `#ERROR!`.

---

## 10. Los montos de este documento envejecen

Todo lo de la sección 4 sale del sheet y cambia todos los meses. **Si pasaron más de treinta días desde el 21/08/2026, pedile a Juan los números nuevos** — los saca con un script que lee el sheet en el momento.

Lo que **no** envejece: las reglas (sección 3), cómo se paga (5), las decisiones (8) y las trampas (9).

---

## 11. Qué NO está acá

Este documento tiene el contexto de la empresa. **Quedaron afuera a propósito**: la cuenta corriente personal de los socios, las negociaciones salariales en curso, y los análisis internos de decisiones que todavía no se comunicaron al equipo.
