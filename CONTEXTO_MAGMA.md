# 👋 PARA SOFI — Empezá acá

Bienvenida a Claude, tu asistente para laburar con Juan en Magma. Le hablás en criollo y hace cosas de verdad: analiza los números, escribe mails, prepara reuniones. Seguí estos pasos **una sola vez** y ya arrancás.

## Cómo arrancar (desde la web, sin instalar nada)

1. **Entrá a [claude.ai](https://claude.ai)** e iniciá sesión (con una cuenta plan Pro o Max).
2. **Creá un Proyecto** llamado `SOMOS MAGMA` (menú *Projects* → *New project*).
3. **Subí ESTE MISMO archivo** (`CONTEXTO_MAGMA.md`) al Proyecto, en la parte de conocimiento/archivos. Con eso, cada charla que abras adentro del Proyecto ya sabe todo sobre Magma — no le tenés que explicar nada.
4. **Conectá Gmail, Calendar y Drive** (*Configuración → Conectores*) para que pueda buscar mails, ver tu agenda y el Drive.

Listo. Ya podés trabajar.

## Cómo hablarle
- Como a una persona: *"¿Cómo venimos de plata?"*, *"Preparame la ficha de Ostara"*, *"Escribile un mail a Vicky sobre…"*.
- Cuanto más le explicás el **porqué** de las cosas, mejor te entiende la próxima vez.

## Qué puede hacer por vos (desde la web)
- Analizar números: cobranzas, márgenes, freelancers, préstamos.
- Redactar y buscar mails, preparar reuniones, fichas de clientes.
- Mirar tu Drive y tu Calendar.
- *(Los comandos tipo `/brief` y tocar el sheet en vivo son del setup completo que usa Juan. Eso lo ves más adelante si querés más poder.)*

## Reglas de oro
- **Nada a ciegas:** antes de cambiar datos importantes, pedile que te muestre primero (*"mostrame"*, *"¿estás seguro?"*).
- **Ante la duda, preguntás** — a Claude o a Juan. Mejor preguntar que romper.

---

*Debajo está TODO el contexto de Magma que Claude necesita. No hace falta que lo leas entero — es para que Claude lo tenga a mano. Pero si querés entender cómo está armado el negocio, está todo acá.*

---

# CONTEXTO — SOMOS MAGMA

> Documento de contexto del negocio para que Claude entienda cómo funciona SOMOS MAGMA.
> Subir este archivo como conocimiento de un **Proyecto de claude.ai** (o pegarlo al inicio de una charla).
> Números marcados "(verificar en la app)" son de referencia y hay que confirmarlos contra el sistema.
> Última actualización: 24/07/2026.

---

## 1. Qué es SOMOS MAGMA

Productora audiovisual de Buenos Aires. Hace contenido para empresas: eventos, contenido mensual para redes, fotografía, video, edición. Trabaja mucho **a través de agencias** que tercerizan la producción en Magma, y también con algunos clientes directos.

- **Dueños/socios:** Juan (Juan Martín Arauz) y Sofi (Sofía Grenier).
- **Herramienta central:** una app propia (Next.js) que reemplazó al Google Sheet "Master Magma" para la operación diaria. El sheet quedó como **backup automático e histórico** — la app lee y escribe ahí siempre.

---

## 2. El equipo y los roles

| Persona | Rol |
|---|---|
| **Juan** (socio) | Ventas, community manager, la app, dirección |
| **Sofi** (socia) | Día a día, operaciones, oficina, referidos |
| **Lulu** (Lucía María Grenier) | Presupuestos, producción, edición, parte de la app/PDF |
| **Tom / Tomi** | Producción (va a los rodajes) |
| **Dani** | Editor (edición, sueldo fijo) — hoy es cuello de botella en temporada alta |
| **Lucho** (Jorge Luis Chávez) | Freelancer estrella: filmmaker, foto, video y edición |
| Otros freelancers | Felipe Martínez, Iván Aranda, Marina Solange Gigena, etc. |
| **Contador** | Diego Musco (VEPs, honorarios, balance) |
| **Coach** | Mariana Tardito (fase de profesionalización) |

Sueldos fijos aprox: Juan/Sofi (sueldo gerente $3,2M c/u), Dani ~$1,9M, Lulu y Tom ~$1,3M c/u.

---

## 3. El modelo de negocio

- **Trabajan a través de AGENCIAS** que tercerizan la producción: Austral, Ostara, Mercuria, Mucha, Infinity Midia, Pancha Studio, Minita, Copal, Stadium, etc.
- **Conceptos clave del sheet (no confundir):**
  - **"Fee Agencia" = el margen de Magma.** Magma actúa como agencia sobre los freelancers; NO es una agencia externa.
  - **"Staff = Somos Magma"** = ganancia pura para la empresa (lo absorbe alguien interno, ej. Dani editando).
  - **"Diferencia"** en Proyectos = ajuste post-evento entre lo presupuestado y lo pagado al staff.
  - **Recargo / descuento** = sobre la línea de Magma, no sobre el costo del operador.
- Cobran por evento/proyecto. **Ticket promedio ~$1,35M, mediana ~$800k** (verificar en la app).

---

## 4. Los números clave (verificar en la app)

- **Margen ~50%. Genera ~+$3,7M/mes neto.** Es rentable.
- **PERO está ahogada por la CAJA:** ~$104M sin cobrar. **El problema #1 NO es falta de trabajo, es cobrar y tener caja previsible.**
- **Churn alto:** ~14 de 15 clientes no vuelven — muy dependiente de pocas agencias.
- **5 préstamos:** BBVA ($10M), Galicia x2 (SGR, a nombre de Sofi pero 100% para Magma), Santander x2 ($7,5M mitad Magma/mitad Sofi, $2,5M 100% Sofi personal). Ninguno es de Juan.

---

## 5. Fórmula de margen y precio (confirmada)

**Precio final = margen Magma + 35% Ganancias + 4% IIBB, calculados SOBRE el margen Magma (no sobre el subtotal). El IVA va SIEMPRE por fuera.**

---

## 6. El sheet Master Magma — las solapas

| Solapa | Para qué |
|---|---|
| PRESUPUESTOS | Presupuestos en curso (año vigente). Estados: EN ESPERA, APROBADO, DESAPROBADO, REPRESUPUESTADO |
| PROYECTOS | Trabajos confirmados, con staff asignado |
| FACTURACION | Facturas emitidas + cobros |
| PAGOS_STAFF | Pagos a freelancers |
| RRHH | Roster de freelancers + datos fiscales |
| Contactos / agencias | Clientes y agencias |
| HISTORICO_2023/24/25 | Histórico cerrado por año |
| COBROS, GASTOS_FIJOS, TARJETAS, PRESTAMOS, MOVIMIENTOS_TARJETA | Egresos |
| SOCIOS_MOVIMIENTOS | Cuenta corriente de Juan y Sofi con Magma |
| RESERVAS, CUENTAS, SUELDOS, LOG | Auxiliares |

---

## 7. Content Day y estrategia comercial

- **Mani King = el Content Day modelo.** Cliente fijo mensual: día entero + estrategia/referencias + edición compleja. Fee **$1.470.000** (junio 2026), costo staff ~$592k → **margen ~$878k (60%)**. Ese es el benchmark.
- **Pancha Studio** (agencia nueva, dueña **Vicky**): da clientes mensuales pero cobra POCO. Casa Blend $350k, Pani Feroz $400k (media jornada + edición fácil, sin referencias). El fee es muy bajo.
- **Mínimos de precio (regla: dejar ≥50% de margen a Magma):**
  - Content Day completo (día entero + estrategia + edición compleja): **piso $1,2M**.
  - Content Day liviano / media jornada (tipo Pancha): **piso $450-500k**.
- **Filmmaker fijo:** conviene sumar a **Lucho** como filmmaker+editor fijo (~$1,8-2,0M/mes) cuando haya volumen — baja el costo por trabajo y libera a Dani de las ediciones de Pancha. Lucho ya genera ~$2,3M/mes de laburo para Magma como freelance.
- **Estrategia de ads (Gloria):** primero la CAJA, no traer más eventos sueltos. Meta Ads sirve para gastronomía/turismo/local (B2C), NO para industrial/agro (eso es LinkedIn/prospección). No gastar en campañas de "reconocimiento/alcance". Prerrequisito: arreglar la web (hoy invisible).

---

## 8. La cuenta de socios (Juan y Sofi)

- Cada socio cobra **$3.200.000/mes de sueldo gerente + los extras** (trabajo en proyectos), **desde el 1/4/2026** (marzo fue el mes en que dejaron de cobrar extras y arrancó el quilombo de plata).
- **Neto = lo que Magma le debe (sueldo + extras) − lo que retiró (transferencias + tarjeta personal) + lo que puso (VEPs de impuestos de Magma que pagó de su bolsillo).**
- A junio 2026, Juan le debe a Magma ~$5,58M (por gasto de tarjeta personal alto). Falta cerrar el número de los dos (tarjeta de julio + transferencias de Sofi).

---

## 9. Reglas de oro (importantes)

1. **Todo escribe al sheet.** Cualquier cosa que se hace tiene que quedar registrada en el Master Magma. Es la red de seguridad.
2. **Preview antes de destruir.** Antes de borrar o mover datos, mostrar qué se va a hacer y pedir OK. Nunca a ciegas.
3. **La app tiene que ser más rápida que el sheet.** Si un flujo tarda más en la app, el equipo no lo usa.
4. **Datos:** cuidado con celdas #ERROR! (teléfonos con "+"), números de presupuesto duplicados, y celdas combinadas que ocultan columnas.

---

## 10. Temas abiertos / en curso (jul 2026)

- **Cerrar la cuenta de socios** (cargar tarjeta de julio + transferencias de Sofi).
- **Mejorar la caja:** cobrar lo pendiente + empujar ingresos recurrentes (Content Day).
- **Content Day:** empaquetar y vender con el número de Mani King; subir el fee de Pancha; evaluar filmmaker fijo (Lucho).
- **Estructura del equipo:** oficializar puestos en vez de pagar extras sueltos (con la coach).
- **WhatsApp Business, web nueva, reorganización del Drive** — en proceso.
- **Limpieza de datos del sheet** (duplicados, celdas rotas).

---

*Este documento es un resumen vivo. Para el detalle y los números actualizados, la fuente es la app / el Master Magma.*
