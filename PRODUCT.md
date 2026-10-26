# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primarios: los PMs en el día a día.** Sofi, Lulu, Sol y Juan cuando produce. Presupuestan, arman el staff de cada rodaje, coordinan edición, cargan facturación y siguen los cobros. La app es su herramienta de trabajo durante toda la jornada, **en la compu de la oficina**, sentados y con tiempo. Cuando una pantalla no puede servirles a todos por igual, gana el PM (Juan, 25/10/2026).

Otros usuarios, confirmados:
- **Juan (dueño):** además de producir, controla plata, cobros y lo que está trabado. Arma la app él mismo.
- **Editores (Dani y los que se sumen):** solo ven Edición y Calendario, sin ningún dato de plata. Miran sus entregas, a veces desde el celular.
- **Freelancers:** usan Mi Magma (`/mi`) para ver sus convocatorias, pagos y entregas. Suelen entrar desde el celular.
- **Administración (Flor, hoy por canje):** facturación, pagos, gastos.
- **Mariana (coach) y parte del equipo NO usan la app:** leen y trabajan directo en el Google Sheet "Master Magma".

## Product Purpose

Reemplazar el flujo operativo de SOMOS MAGMA, una productora audiovisual de Buenos Aires, que vivía en Google Sheets: presupuestos → proyectos → staff → edición → facturación → cobros → pagos. Está en uso al 100% desde junio de 2026: ya nadie presupuesta ni carga en el sheet.

Éxito = **la app es más rápida que el sheet**. Si una operación lleva más clics o pasos que en el sheet, el equipo no la usa.

## Positioning

Es una herramienta interna hecha a la medida de cómo trabaja Magma. No es un producto genérico de gestión. Lo que ninguna otra herramienta tiene:
- conecta todo el circuito de un trabajo (presupuesto, Calendar, Drive, staff, edición, facturación, cobro, pago), así que cada dato se carga una sola vez;
- escribe todo al sheet, que sigue siendo la red de seguridad y la interfaz de quienes no usan la app.

## Operating Context

- **El sheet "Master Magma" es la fuente de verdad.** La app lee y escribe ahí: todo cambio en la app tiene que quedar en el sheet, y los valores tienen que cerrar entre sí. El sheet además tiene que estar presentable, porque hay gente que trabaja directo en él.
- **Integraciones:** Google Calendar (cada presupuesto aprobado es un evento), Google Drive (carpetas de crudo y entregas por proyecto), Gmail (avisos automáticos), WhatsApp.
- **Rituales:** reporte de los lunes, mails diarios de Juan (8 y 15 h), sesiones con Mariana.
- **Idioma:** español rioplatense en toda la UI. Montos en formato argentino (`$1.156.055,78`), fechas `DD/MM/YYYY`.

## Capabilities and Constraints

- **Módulos:** presupuestos, proyectos, calendario, edición (tablero por pieza), pagos al staff, facturación y cobros, egresos (gastos fijos, tarjetas, préstamos), caja y cuentas, Mi Magma para freelancers.
- **Acceso:** login con Google OAuth y permisos por mail (`lib/roles.js`). Los editores no ven plata.
- **Stack:** Next.js 14 (Pages Router) en Vercel. Estilos inline con la paleta compartida de `lib/ui.js`. Sin dependencias nuevas sin pedirlas.
- **Términos del negocio:**
  - "Fee Agencia" = margen de Magma;
  - "Staff = Somos Magma" = ganancia interna;
  - "Diferencia" = ajuste entre lo presupuestado y lo pagado al staff;
  - "Entregable" = lo que se vendió; "Nombre" = cómo le dice el equipo a la pieza.
- **Decisiones abiertas:**
  - Edición: ¿cada pieza lleva dos fechas (corte del editor al PM y entrega al cliente)? Lo tienen que decidir Juan y Sofi.
  - Spec de Edición de Sofi (24/10/2026): ver la memoria del módulo.

## Brand Commitments

- Nombre: SOMOS MAGMA (Magma). El rojo de la marca es identidad: no es un color para alertas genéricas.
- La voz es la del equipo: directa, en criollo, con su propia jerga ("quién tiene la pelota", "vale un llamado", "Revisar").

## Evidence on Hand

- Datos reales del sheet (vía `getAllData()` en `lib/sheets.js`).
- Capturas de pantallas anteriores en `_preview-*/`.
- Spec y prototipo de Edición de Sofi (mail del 24/10/2026).
- Crítica de Impeccable en `.impeccable/critique/`.
- No inventar clientes, montos ni testimonios: las cifras se leen del sheet en el momento.

## Product Principles

1. **Menos información a primera vista.** Es el dolor principal (Juan, 25/10/2026; antes en Edición el 20/09 y el 04/10, y en Administración). La lista es para encontrar; la ficha, para hacer. Cada pantalla muestra lo que hay que decidir ahora y pliega el resto.
2. **Más rápido que el sheet.** Cada flujo nuevo se compara en clics y pasos contra hacerlo en el sheet.
3. **Lo que se ve es lo que quedó escrito.** Si el sheet no guardó, la pantalla no lo muestra como hecho. Nada que mienta: plazos, estados o contadores que no coinciden con la realidad son bugs.
4. **Una sola forma de hacer cada cosa.** La misma acción funciona igual desde cualquier lugar de la app.
5. **El color dice algo.** Rojo solo para lo atrasado y lo que se rompe; el resto es neutro.

## Accessibility & Inclusion

Textos con contraste de 4,5:1 o más: nada más claro que `#6B645C` sobre blanco (pedido de Sofi, 24/10/2026). Mi Magma y la vista de editores tienen que funcionar en el celular.
