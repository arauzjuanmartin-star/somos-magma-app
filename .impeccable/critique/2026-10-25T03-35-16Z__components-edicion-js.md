---
target: Edición + spec Sofi
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "file:/Users/dronjuan/somos-magma-app/components/Edicion.js"
target_fingerprint: "sha256:d7c43747a9dd125c50245f14b92812dd688820b054b5a49473ed62d1ffbb7ecc"
target_path: /Users/dronjuan/somos-magma-app/components/Edicion.js
timestamp: 2026-10-25T03-35-16Z
slug: components-edicion-js
---
# Critique: Edición (components/Edicion.js) + spec de Sofi 24/10/2026
Method: dual-agent (A: design review · B: detector). Browser: sin sesión en Chrome → A usó capturas 20/09 y 04/10 + código.

Score 22/40 (Aceptable). H1 3 · H2 3 · H3 1 · H4 2 · H5 1 · H6 3 · H7 2 · H8 2 · H9 2 · H10 3.

P0 Píldora de estado y stepper mandan a "Con el cliente"/"Terminado" sin pasar por Aprobar (no mueve a Finales ni da acceso). Solo el arrastre (moverA, Edicion.js:182) lo frena. Server (edicion-guardar) no valida.
P0 Fecha entrega se escribe solo si está vacía (edicion-guardar.js:133, edicion-aprobar.js:166): "hace N días" cuenta desde el primer envío tras una vuelta de cambios.
P1 Bitácora: <input> de una línea (Edicion.js:1776), guarda la bitácora entera desde el front (se pisan dos personas), mail toma solo el primer renglón (edicion-avisos.js:37).
P1 guardar() pinta el cambio antes de confirmar y no revierte si falla (Edicion.js:389).
P2 Rojo de marca para todo (botones, urgente, atrasado, sin asignar, preguntas); ink3 #A8A39A = 2,5:1; warn 3,8:1; inputs sin foco visible.
Detector: 3× side-tab (Edicion.js:1204,1475,1577) — borde lateral de semáforo; semántico, falso positivo parcial (el de 1475 en botones sí sobra).
Spec Sofi: bitácora ❌, caminos de estado ❌ (peor de lo descrito), OK del cliente ⚠️ (no existe campo; el que sobrevive es Fecha entrega), contador ⚠️ (automático en server pero se desincroniza), 8 pasos/4 columnas/ficha larga/rojo/contraste/logo duplicado ❌.
