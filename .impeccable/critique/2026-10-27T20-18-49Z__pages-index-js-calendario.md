---
target_identity: "file:/Users/dronjuan/somos-magma-app/pages-index-js-calendario"
timestamp: 2026-10-27T20-18-49Z
slug: pages-index-js-calendario
---
# Crítica: Calendario (pages/index.js) — 27/10/2026

Nielsen 24/40. Dos lecturas (diseño con PRODUCT/DESIGN + detector y auditoría manual).

## Lo que se arregla
1. Sin panel "Hoy": abre en "Clickeá un día". → frase arriba (rodajes de la semana sin staff, presus en espera con fecha cerca, entregas atrasadas) con chips que abren el día; el lateral sin día muestra "Próximos 7 días".
2. Editores (soloVer) ven montos en KPIs y panel. → plata oculta para soloVer.
3. Celular/≤1000px: panel 340px fijo al lado de la grilla la aplasta. → useEsCelular(1000), columna.
4. ap.slice(0,3) con TOPE 4: un día con 4 aprobados esconde uno sin "+1 más". → slice(0,TOPE).
5. Panel sticky sin maxHeight se corta. → top 16, maxHeight, overflow.
6. Rojo sin atraso: hoy, "Cargar staff", "sin asignar". → ink / warn.
7. Letra 10–11.5px en grilla y panel. → 12.5 mínimo.
8. 5 botones por trabajo, Desaprobar pegado. → 1 principal + "⋯".
9. Bordes duros y rayas laterales (side-tab). → tarjetas con sombra, punto de color en chips.
10. Estado solo por color. → leyenda + símbolo.
11. a11y: div onClick en celdas, ←/→ sin aria-label.
12. Menores: monto del panel vs KPI, trim en presusByNum, staff repetido en el panel.

## Lo que se mantiene
calMem, editor recordado, plata una vez por trabajo, día a confirmar, aprobar → abre staff, motivo al desaprobar.
