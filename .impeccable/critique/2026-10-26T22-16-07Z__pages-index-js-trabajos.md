---
target: Trabajos → aprobar → staff
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/Users/dronjuan/somos-magma-app/pages/index.js#trabajos"
timestamp: 2026-10-26T22-16-07Z
slug: pages-index-js-trabajos
---
# Critique: Trabajos → aprobar → staff (pages/index.js: Trabajos 1046, DetallePresupuesto 1523, EstadoSelect 1326, ResguardoModal 2361, AprobarAdicionalesModal 2410, StaffEditor 2814), 26/10/2026
Method: dual-agent (A con PRODUCT.md+DESIGN.md · B detector + 4 HTML renderizados con datos reales). Sin browser vivo (login Google).
Score 22/40. H1 2 · H2 3 · H3 2 · H4 2 · H5 3 · H6 2 · H7 1 · H8 2 · H9 2 · H10 3. Carga cognitiva 4/8 fallan.
P0 No hay botón Aprobar en "Lo cotizado": solo el select "En espera" (appearance none) en la columna Estado.
P1 Margen del StaffEditor (2953) ignora líneas sin asignar → muestra ganancia de más antes de cargar staff; compara 'Somos Magma' exacto.
P1 Rojo para acción y números (Nuevo presupuesto, Guardar staff, pestaña, total, gastos, "Sin fact." en todo aprobado sin importar antigüedad).
P2 Vista "Todos" = 826 filas, 411 caídas/represupuestadas; sin panel Hoy.
P2 Sin teclado (filas div), Esc en modales, letra 9-11px (59 textos chicos en HTML), montos sin puntos en staff.
Bug: SegChip (938-941) "✓ nulld" en todo presu nunca llamado y <4 días; tooltip "Hablaste hace null días".
Detector JSX: 0 en rango (no mide inline font-size); HTML: 8/25/13/13 undersized-ui-text.
