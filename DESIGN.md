---
name: SOMOS MAGMA App
description: La herramienta de trabajo diaria de los PMs de Magma, del presupuesto al cobro.
colors:
  magma-red: "#CE2637"
  magma-red-soft: "#FBEAEC"
  ink: "#1A1917"
  ink-secondary: "#5E5A53"
  ink-muted: "#6B645C"
  paper: "#FBFAF8"
  surface: "#FFFFFF"
  surface-alt: "#F6F4F1"
  chip: "#F3EFE9"
  hairline: "#ECE9E4"
  disabled: "#C4BFB6"
  positive: "#17784E"
  positive-soft: "#E7F3EC"
  caution: "#8F5E0A"
  caution-soft: "#F8EFDC"
typography:
  headline:
    fontFamily: "Archivo, -apple-system, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "Archivo, -apple-system, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.35
  body:
    fontFamily: "Archivo, -apple-system, system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Archivo, -apple-system, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
    lineHeight: 1.4
  data:
    fontFamily: "'Azeret Mono', ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: "8px"
  md: "10px"
  lg: "14px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "26px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    typography: "{typography.label}"
  button-primary-disabled:
    backgroundColor: "{colors.disabled}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-confirm:
    backgroundColor: "{colors.positive}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "11px 18px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "16px 20px"
  today-panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "18px 20px"
  chip:
    backgroundColor: "{colors.chip}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "9px 12px"
---

# Design System: SOMOS MAGMA App

## Overview

**Creative North Star: "El escritorio de producción"**

La app es la mesa de trabajo del productor. Lo que hay que hacer hoy está arriba y a mano; lo demás queda guardado, a un clic. La eligió Juan el 25/10/2026, comparando tres opciones con datos reales de Edición: una tabla compacta ("la planilla"), tarjetas con aire ("el escritorio") y un tablero oscuro ("la sala de control"). Ganó el escritorio porque el dolor principal del equipo es **demasiada información a primera vista**, y lo que se pidió es que sea amigable.

Cada pantalla abre con una frase que dice qué te toca ("Hoy te toca revisar 11 piezas · 7 están atrasadas") y por dónde empezar. Debajo, cada trabajo es una tarjeta blanca con aire, letra cómoda y un solo botón de acción a la vista. Se ve menos por pantalla a propósito: se lee sin esfuerzo. Las listas largas que son para consultar y no para decidir (pagos, facturación, histórico) pueden seguir en tabla, siempre con la misma tipografía y los mismos colores.

**Estado al 25/10/2026:** la base (fuentes, paleta, contraste, botones negros y rojo solo para atraso) ya está en el código; Edición es el módulo que más se acerca. El panel "Hoy", las tarjetas con sombra suave y la letra de 14,5 px son **el objetivo**, y se aplican módulo por módulo con `/impeccable distill`. En el resto de la app los botones principales todavía son rojos (`btnPrimary` en `pages/index.js`).

**Key Characteristics:**
- Lo de hoy primero, en palabras, no en números sueltos.
- Una tarjeta por trabajo, un botón de acción por renglón.
- Papel cálido de fondo y tarjetas blancas encima.
- Color solo con significado: rojo = atrasado, ámbar = esperando demasiado, verde = confirmar o cerrar.
- Letra cómoda: el texto de trabajo va a 14,5 px; nada importante por debajo de 12,5 px.

## Colors

Una paleta casi neutra, cálida como papel, donde el color se gana el lugar diciendo algo.

### Primary
- **Rojo Magma** (`magma-red`): identidad de la marca (el punto del logo) y **lo atrasado**, siempre con un punto delante ("● 11 días atrasado"). También lo que se rompe o se borra. Nunca botones, pestañas, etiquetas ni avisos genéricos.
- **Rojo Magma suave** (`magma-red-soft`): fondo solo para un error que bloquea.

### Secondary
- **Verde confirmado** (`positive`, fondo `positive-soft`): el botón que manda o cierra ("Aprobar y mandar al cliente", "OK del cliente") y lo cobrado.
- **Ámbar de espera** (`caution`, fondo `caution-soft`): lo que espera demasiado ("con el cliente hace 5 días o más", "vence hoy") y lo que falta definir.

### Neutral
- **Tinta** (`ink`): texto principal y **botón principal**.
- **Tinta secundaria** (`ink-secondary`): datos de apoyo (editor, cliente, proyecto).
- **Tinta suave** (`ink-muted`): ayudas, fechas, "sin fecha". Es el más claro permitido para texto (5,0:1 o más sobre cualquier fondo de la app).
- **Papel** (`paper`): fondo de página.
- **Blanco** (`surface`): tarjetas, campos, panel de hoy.
- **Papel oscuro** (`surface-alt`) y **chip** (`chip`): hover, filas alternas y atajos del panel de hoy.
- **Hilo** (`hairline`): bordes y separadores de 1 px.
- **Apagado** (`disabled`): solo fondo de un botón desactivado, nunca texto.

### Named Rules
**The Red Means Late Rule.** El rojo Magma en la pantalla significa "atrasado" o "roto". Si algo es rojo y no está atrasado, está mal.

**The Readable Gray Rule.** Ningún texto más claro que tinta suave (`#6B645C`). Para algo "menos importante", achicá o bajá el peso, no lo aclares.

## Typography

**Body Font:** Archivo (con -apple-system, system-ui, sans-serif)
**Data Font:** Azeret Mono, para números de presupuesto, montos y fechas en columnas.

**Character:** Archivo es una grotesca cálida y legible, con bastante carácter para títulos sin perder neutralidad. La mono marca lo que es dato duro, así un número no se confunde con texto.

### Hierarchy
- **Headline** (700, 18 px, 1,3): la frase del panel "Hoy" y el título de una ficha.
- **Title** (700, 16 px, 1,35): el nombre del cliente o trabajo en la cabecera de una tarjeta.
- **Body** (400, 14,5 px, 1,5): renglones de trabajo, nombres de pieza, personas. Hoy la app usa sobre todo 12 a 13 px: se sube al migrar cada módulo.
- **Label** (600, 12,5 px): botones, títulos de campo, contadores.
- **Data** (Azeret Mono 500, 13 px): `#2370`, `$1.156.055,78`, `14/10/2026`.

### Named Rules
**The 12.5 Floor Rule.** Nada que haya que leer para trabajar va por debajo de 12,5 px. El 10,5 px de hoy queda solo para marcas mínimas ("MAGMA", "↑ URGENTE").

## Layout

- Barra lateral fija con los módulos en la compu; en el celular (760 px o menos) pasa a un encabezado con menú desplegable.
- Cada módulo sigue el mismo orden de arriba abajo: título y pestañas → **panel Hoy** (qué te toca, con 2 o 3 atajos) → secciones por quién tiene la pelota → lo que está esperando o terminado, plegado abajo.
- Espaciado de 4 en 4: `sm` 8 px dentro de un grupo, `lg` 16 px entre renglones de tarjeta, `xl` 20 px entre bordes y contenido, `xxl` 26 px entre secciones.
- La lista es para encontrar; la ficha es para hacer. Abrir algo lleva a su ficha sola en pantalla, con "← Volver" o Esc.

## Elevation & Depth

Casi plano, con dos niveles. Las tarjetas y el panel Hoy se separan del papel con una sombra apenas perceptible. Las ventanas emergentes (modales, paneles) llevan una sombra más profunda. Nada más usa sombra.

### Shadow Vocabulary
- **Tarjeta** (`box-shadow: 0 2px 10px rgba(0,0,0,0.05)`): tarjetas de trabajo y panel Hoy.
- **Emergente** (`box-shadow: 0 16px 50px rgba(0,0,0,0.18)`): modales y paneles que tapan la pantalla. Ya es el valor que usa la app.

### Named Rules
**The Paper Desk Rule.** La profundidad es papel sobre una mesa: blanco sobre papel cálido, sombra mínima. Sin bordes gruesos de color al costado y sin sombras duras.

## Shapes

Esquinas suaves y consistentes: 8 px en campos, 10 px en botones, 14 px en tarjetas y paneles, píldora completa en chips y en la píldora de estado. Bordes de 1 px color hilo. Los campos vacíos que hay que completar llevan borde punteado gris, no rojo.

## Components

### Buttons
- **Forma:** esquinas suaves (10 px).
- **Principal:** tinta con texto blanco, 8 × 16 px, label 12,5 px. Uno solo por renglón o tarjeta.
- **Confirmar:** verde, para el paso que manda algo afuera o cierra (aprobar y mandar al cliente, OK del cliente).
- **Secundario:** blanco con borde hilo y texto tinta ("Pedir cambios", "Cancelar").
- **Desactivado:** fondo apagado y texto blanco, sin cursor de mano.
- **Foco:** anillo visible del navegador; nunca `outline: none` sin reemplazo.

### Chips
- **Estilo:** fondo chip, píldora, 14 px de texto. Se usan como atajos en el panel Hoy ("Empezar por Pocho (11 días)").
- **Píldora de estado:** fondo según el significado (negro "Para revisar", ámbar "Cambios", verde "Con el cliente" o "Terminado", gris "Sin material").

### Cards / Containers
- **Esquinas:** 14 px.
- **Fondo:** blanco sobre papel.
- **Sombra:** la de tarjeta.
- **Borde:** ninguno; separadores internos de 1 px.
- **Relleno:** 16 × 20 px.
- **Cabecera:** cliente en title, proyecto y número en tinta secundaria, plazo a la derecha.

### Inputs / Fields
- **Estilo:** blanco, borde hilo, 8 px, 9 × 12 px, texto 13,5 a 14,5 px.
- **Vacío y obligatorio:** borde punteado tinta suave y la leyenda "Falta definir".
- **Texto largo:** textarea; Enter hace renglón nuevo y ⌘/Ctrl + Enter guarda.

### Navigation
- **Pestañas:** texto 13 px; la activa en 700 con subrayado tinta de 2 px (no rojo).
- **Barra lateral:** punto rojo + "SOMOS MAGMA" como única aparición de la marca; módulos en 13 px, el activo en 700.

### Panel Hoy (componente distintivo)
Arriba de cada módulo de trabajo: una frase en headline que dice qué te toca y cuánto ("Hoy te toca revisar 11 piezas"), el dato que preocupa en tinta suave ("· 7 están atrasadas") y 2 o 3 chips de atajo, empezando por lo más urgente. Si no hay nada, lo dice ("Nada pendiente para hoy").

### Marca de urgente
"↑ URGENTE" en tinta, con contorno de 1 px y 10 px de letra. Nunca un bloque relleno: urgente no significa atrasado.

## Do's and Don'ts

### Do:
- **Do** abrir cada módulo con el panel Hoy: una frase que dice qué te toca.
- **Do** poner un solo botón principal (tinta) por tarjeta; el resto, secundario o dentro de la ficha.
- **Do** escribir el estado en palabras ("hace 17 días con el cliente"), no solo con color.
- **Do** usar Azeret Mono para números de presupuesto, montos y fechas en columnas.
- **Do** mostrar "Falta definir" donde falta un dato, con borde punteado.

### Don't:
- **Don't** usar el rojo Magma para botones, pestañas, etiquetas o avisos que no sean atraso o error.
- **Don't** poner texto más claro que `#6B645C` ni texto de trabajo por debajo de 12,5 px.
- **Don't** usar bordes gruesos de color al costado de tarjetas o renglones para marcar estado.
- **Don't** mostrar todo junto: lo que está esperando o terminado va plegado abajo.
- **Don't** dejar un campo vacío sin decir nada, ni con "[completar]".
